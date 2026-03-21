import { type DragEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { CSS } from "@dnd-kit/utilities";

import { api, type BoardLane, type Task, type TaskTag, type TaskTagColor } from "../api";
import {
  getRandomTaskTagColor,
  getTaskTagStyle,
  taskTagColorOptions
} from "../app/tag-colors";
import {
  formatSingleTagInput,
  getTaskInputLabel,
  isDoneLaneName,
  isProtectedLaneName,
  itemStyle,
  normalizeTagKey,
  parseSingleTagInput,
  parseTagInput
} from "../app/utils";
import { BoardSkeleton, CloseIcon, EmptyState, ErrorBanner, TrashIcon } from "../components/ui";
import { useDismissableLayer } from "../hooks/useDismissableLayer";

type TaskEditorView = "preview" | "source";
type TaskMoveTarget = {
  kind: "nest" | "reorder";
  laneId: string;
  parentTaskId: string | null;
  position: number;
  taskId?: string;
};

const taskSortableTransition = {
  duration: 220,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)"
};

const taskDropAnimation = {
  duration: 220,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)"
};
const taskMeasuring = {
  droppable: {
    strategy: MeasuringStrategy.Always
  }
} as const;

function getTaskTrashDropTargetId(laneId: string) {
  return `task-trash:${laneId}`;
}

function getLaneIdFromTaskTrashDropTargetId(dropTargetId: string | number) {
  const normalizedDropTargetId = String(dropTargetId);

  return normalizedDropTargetId.startsWith("task-trash:")
    ? normalizedDropTargetId.slice("task-trash:".length)
    : null;
}

const taskCollisionDetection: CollisionDetection = (args) => {
  function getCollisionContainer(collisionId: string | number) {
    return args.droppableContainers.find((droppableContainer) => droppableContainer.id === collisionId);
  }

  function getPointerDistanceFromContainer(collisionId: string | number) {
    const pointer =
      args.pointerCoordinates ?? {
        x: args.collisionRect.left + args.collisionRect.width / 2,
        y: args.collisionRect.top + args.collisionRect.height / 2
      };
    const rect = getCollisionContainer(collisionId)?.rect.current;
    if (!rect) {
      return Number.POSITIVE_INFINITY;
    }

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    return Math.hypot(pointer.x - centerX, pointer.y - centerY);
  }

  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) {
    const trashHits = pointerHits.filter((collision) => {
      const container = getCollisionContainer(collision.id);

      return container?.data.current?.type === "trash";
    });

    if (trashHits.length > 0) {
      return trashHits;
    }

    const nestTargetHits = pointerHits.filter((collision) => {
      const container = getCollisionContainer(collision.id);

      return container?.data.current?.type === "nest-target";
    });

    if (nestTargetHits.length > 0) {
      return nestTargetHits
        .slice()
        .sort(
          (left, right) =>
            getPointerDistanceFromContainer(left.id) - getPointerDistanceFromContainer(right.id)
        );
    }

    const slotHits = pointerHits.filter((collision) => {
      const container = getCollisionContainer(collision.id);

      return container?.data.current?.type === "slot";
    });

    if (slotHits.length > 0) {
      return slotHits;
    }

    const taskHits = pointerHits.filter((collision) => {
      const container = getCollisionContainer(collision.id);

      return container?.data.current?.type === "task";
    });

    if (taskHits.length > 0) {
      const taskHitDetails = taskHits
        .map((collision) => {
          const container = getCollisionContainer(collision.id);
          const rect = container?.rect.current;
          const data = container?.data.current;

          return {
            area: rect ? rect.width * rect.height : Number.POSITIVE_INFINITY,
            collision,
            parentTaskId:
              typeof data?.parentTaskId === "string" ? String(data.parentTaskId) : null,
            taskId: typeof data?.taskId === "string" ? String(data.taskId) : null
          };
        })
        .filter((taskHit) => taskHit.taskId !== null);
      const mostSpecificTaskHits = taskHitDetails.filter(
        (taskHit) =>
          !taskHitDetails.some((candidate) => candidate.parentTaskId === taskHit.taskId)
      );

      if (mostSpecificTaskHits.length > 0) {
        return mostSpecificTaskHits
          .slice()
          .sort((left, right) => left.area - right.area)
          .map((taskHit) => taskHit.collision);
      }

      return taskHits;
    }

    return pointerHits;
  }

  return closestCorners(args);
};

function compareTasksInLane(left: Task, right: Task, isDoneLane: boolean) {
  if (isDoneLane) {
    if (left.updatedAt !== right.updatedAt) {
      return left.updatedAt < right.updatedAt ? 1 : -1;
    }

    if (left.position !== right.position) {
      return left.position - right.position;
    }

    return left.id.localeCompare(right.id);
  }

  if (left.position !== right.position) {
    return left.position - right.position;
  }

  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt < right.updatedAt ? 1 : -1;
  }

  return left.id.localeCompare(right.id);
}

function listSiblingTasks(
  tasks: Task[],
  laneId: string,
  parentTaskId: string | null,
  isDoneLane: boolean,
  excludedTaskId?: string
) {
  return tasks
    .filter(
      (task) =>
        task.id !== excludedTaskId &&
        task.laneId === laneId &&
        task.parentTaskId === parentTaskId
    )
    .slice()
    .sort((left, right) => compareTasksInLane(left, right, isDoneLane));
}

function buildTopLevelTaskIdsByLane(lanes: BoardLane[], tasks: Task[]) {
  const taskIdsByLane = Object.fromEntries(lanes.map((lane) => [lane.id, [] as string[]])) satisfies Record<
    string,
    string[]
  >;

  lanes.forEach((lane) => {
    tasks
      .filter((task) => task.parentTaskId === null && task.laneId === lane.id)
      .slice()
      .sort((left, right) => compareTasksInLane(left, right, isDoneLaneName(lane.name)))
      .forEach((task) => {
        taskIdsByLane[lane.id].push(task.id);
      });
  });

  return taskIdsByLane;
}

function buildSubtaskIdsByParent(tasks: Task[], lanesById: Map<string, BoardLane>) {
  const subtaskIdsByParent = new Map<string, string[]>();
  const subtasksByParent = new Map<string, Task[]>();

  tasks
    .filter((task) => task.parentTaskId !== null)
    .forEach((task) => {
      if (!task.parentTaskId) {
        return;
      }

      const childTasks = subtasksByParent.get(task.parentTaskId) ?? [];
      childTasks.push(task);
      subtasksByParent.set(task.parentTaskId, childTasks);
    });

  subtasksByParent.forEach((childTasks, parentTaskId) => {
    const laneName = childTasks[0]?.laneId ? lanesById.get(childTasks[0].laneId)?.name ?? "" : "";
    subtaskIdsByParent.set(
      parentTaskId,
      childTasks
        .slice()
        .sort((left, right) => compareTasksInLane(left, right, isDoneLaneName(laneName)))
        .map((task) => task.id)
    );
  });

  return subtaskIdsByParent;
}

function taskHasSubtasks(tasks: Task[], taskId: string) {
  return tasks.some((task) => task.parentTaskId === taskId);
}

function canTaskBecomeSubtask(tasks: Task[], task: Task) {
  return task.parentTaskId === null && !taskHasSubtasks(tasks, task.id);
}

function canTaskNestUnderParent(tasks: Task[], task: Task, parentTaskId: string | null) {
  if (parentTaskId === null) {
    return false;
  }

  if (task.id === parentTaskId || task.parentTaskId === parentTaskId) {
    return false;
  }

  const parentTask = tasks.find((candidate) => candidate.id === parentTaskId);
  if (!parentTask || parentTask.parentTaskId !== null) {
    return false;
  }

  return task.parentTaskId !== null || canTaskBecomeSubtask(tasks, task);
}

function canTaskJoinParentGroup(tasks: Task[], task: Task, parentTaskId: string | null) {
  if (parentTaskId === null) {
    return true;
  }

  if (task.id === parentTaskId) {
    return false;
  }

  const parentTask = tasks.find((candidate) => candidate.id === parentTaskId);
  if (!parentTask || parentTask.parentTaskId !== null) {
    return false;
  }

  if (task.parentTaskId === parentTaskId) {
    return true;
  }

  return task.parentTaskId !== null || canTaskBecomeSubtask(tasks, task);
}

function findTaskLocation(tasks: Task[], taskId: string) {
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task || !task.laneId) {
    return null;
  }

  return {
    laneId: task.laneId,
    parentTaskId: task.parentTaskId,
    position: task.position
  };
}

function applyTaskMove(
  tasks: Task[],
  taskId: string,
  targetLaneId: string,
  targetParentTaskId: string | null,
  targetIndex: number,
  lanesById: Map<string, BoardLane>
) {
  const sourceTask = tasks.find((task) => task.id === taskId);
  if (!sourceTask || !sourceTask.laneId) {
    return tasks;
  }

  const sourceSiblings = listSiblingTasks(
    tasks,
    sourceTask.laneId,
    sourceTask.parentTaskId,
    isDoneLaneName(lanesById.get(sourceTask.laneId)?.name ?? "")
  );
  const sourceIndex = sourceSiblings.findIndex((task) => task.id === taskId);
  const sameGroup =
    sourceTask.laneId === targetLaneId && sourceTask.parentTaskId === targetParentTaskId;
  const nextSiblingTasks = listSiblingTasks(
    tasks,
    targetLaneId,
    targetParentTaskId,
    isDoneLaneName(lanesById.get(targetLaneId)?.name ?? ""),
    taskId
  );
  const normalizedTargetIndex =
    sameGroup && sourceIndex !== -1 && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  const clampedTargetIndex = Math.max(0, Math.min(normalizedTargetIndex, nextSiblingTasks.length));

  if (sameGroup && sourceIndex === clampedTargetIndex) {
    return tasks;
  }

  const nextTasksInSourceGroup = listSiblingTasks(
    tasks,
    sourceTask.laneId,
    sourceTask.parentTaskId,
    isDoneLaneName(lanesById.get(sourceTask.laneId)?.name ?? ""),
    taskId
  );
  const nextTasksInTargetGroup = [...nextSiblingTasks];
  nextTasksInTargetGroup.splice(clampedTargetIndex, 0, {
    ...sourceTask,
    laneId: targetLaneId,
    parentTaskId: targetParentTaskId
  });

  const nextTaskPositions = new Map<string, number>();
  nextTasksInSourceGroup.forEach((task, position) => {
    nextTaskPositions.set(task.id, position);
  });
  nextTasksInTargetGroup.forEach((task, position) => {
    nextTaskPositions.set(task.id, position);
  });

  let hasChanges = false;
  const nextTasks = tasks.map((task) => {
    let nextTask = task;

    if (task.id === taskId) {
      nextTask = {
        ...nextTask,
        laneId: targetLaneId,
        parentTaskId: targetParentTaskId
      };
    } else if (
      sourceTask.parentTaskId === null &&
      task.parentTaskId === sourceTask.id &&
      task.laneId !== targetLaneId
    ) {
      nextTask = {
        ...nextTask,
        laneId: targetLaneId
      };
    }

    const nextPosition = nextTaskPositions.get(task.id);
    if (nextPosition !== undefined && nextTask.position !== nextPosition) {
      nextTask = {
        ...nextTask,
        position: nextPosition
      };
    }

    if (
      nextTask.laneId === task.laneId &&
      nextTask.parentTaskId === task.parentTaskId &&
      nextTask.position === task.position
    ) {
      return task;
    }

    hasChanges = true;
    return nextTask;
  });

  return hasChanges ? nextTasks : tasks;
}

function mergeUniqueTags(currentTags: TaskTag[], nextValue: string, color: TaskTagColor) {
  const seen = new Set(currentTags.map((tag) => normalizeTagKey(tag.label)));
  const additions: TaskTag[] = [];

  parseTagInput(nextValue).forEach((tag) => {
    const key = normalizeTagKey(tag);
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    additions.push({
      color,
      label: tag
    });
  });

  return additions.length > 0 ? [...currentTags, ...additions] : currentTags;
}

function listSuggestedTags(tasks: Task[]) {
  const tagsByKey = new Map<string, TaskTag>();

  tasks.forEach((task) => {
    task.tags.forEach((tag) => {
      const key = normalizeTagKey(tag.label);
      if (!key || tagsByKey.has(key)) {
        return;
      }

      tagsByKey.set(key, tag);
    });
  });

  return Array.from(tagsByKey.values()).sort((left, right) =>
    left.label.localeCompare(right.label, undefined, { sensitivity: "base" })
  );
}

function createNativeDragPreview(node: HTMLElement) {
  const preview = node.cloneNode(true);
  if (!(preview instanceof HTMLElement)) {
    return null;
  }

  const bounds = node.getBoundingClientRect();
  preview.classList.add("board-drag-preview");
  preview.style.width = `${bounds.width}px`;
  preview.style.height = `${bounds.height}px`;
  preview.style.position = "fixed";
  preview.style.top = "-10000px";
  preview.style.left = "-10000px";
  preview.style.margin = "0";
  preview.style.pointerEvents = "none";
  preview.style.zIndex = "9999";
  preview.style.transform = "none";
  preview.style.animation = "none";
  preview.style.transition = "none";
  document.body.append(preview);

  return preview;
}

function getPreferredLaneDeleteDestination(laneId: string, lanes: BoardLane[]) {
  return (
    lanes.find((candidate) => candidate.id !== laneId && normalizeTagKey(candidate.name) === "todo") ??
    lanes.find((candidate) => candidate.id !== laneId) ??
    null
  );
}

function LaneHeader({
  destinationLanes,
  isDeletePending,
  isDragDisabled,
  isProtected,
  isTaskDeletePending,
  isTaskDragging,
  lane,
  onCancelTaskDelete,
  onDelete,
  onConfirmTaskDelete,
  onDragEnd,
  onDragStart,
  pendingTaskDelete
}: {
  destinationLanes: BoardLane[];
  isDeletePending: boolean;
  isDragDisabled: boolean;
  isProtected: boolean;
  isTaskDeletePending: boolean;
  isTaskDragging: boolean;
  lane: BoardLane;
  onCancelTaskDelete: () => void;
  onDelete: (destinationLaneId?: string) => void;
  onConfirmTaskDelete: (taskId: string) => void;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLElement>, laneId: string) => void;
  pendingTaskDelete: Task | null;
}) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const confirmRef = useRef<HTMLDivElement | null>(null);
  const preferredDestinationId = getPreferredLaneDeleteDestination(lane.id, destinationLanes)?.id ?? "";
  const [destinationLaneId, setDestinationLaneId] = useState(preferredDestinationId);
  const requiresDestination = lane.taskCount > 0;
  const showLaneDeleteAction = !isTaskDragging && !pendingTaskDelete && !isProtected;

  useDismissableLayer(isConfirmOpen, confirmRef, () => setIsConfirmOpen(false));

  useEffect(() => {
    if (!isConfirmOpen) {
      return;
    }

    setDestinationLaneId(preferredDestinationId);
  }, [isConfirmOpen, preferredDestinationId]);

  useEffect(() => {
    if (isTaskDragging || pendingTaskDelete) {
      setIsConfirmOpen(false);
    }
  }, [isTaskDragging, pendingTaskDelete]);

  return (
    <div
      aria-label={`Reorder lane ${lane.name}`}
      className={`board-column__header${isDragDisabled ? "" : " is-draggable"}`}
      data-testid={`lane-header-${lane.id}`}
      draggable={!isDragDisabled}
      onDragEnd={onDragEnd}
      onDragStart={(event) => onDragStart(event, lane.id)}
    >
      <div className="board-column__header-copy">
        <h2>{lane.name}</h2>
      </div>
      <div className="lane-header__actions" ref={confirmRef}>
        <LaneTaskTrashTarget
          isDeletePending={isTaskDeletePending}
          isDraggingTask={isTaskDragging}
          laneId={lane.id}
          onCancel={onCancelTaskDelete}
          onConfirm={onConfirmTaskDelete}
          pendingTask={pendingTaskDelete}
        />
        {showLaneDeleteAction ? (
          <button
            aria-haspopup="dialog"
            aria-expanded={isConfirmOpen}
            aria-label={`Delete lane ${lane.name}`}
            className="icon-button danger-button lane-delete-button"
            draggable={false}
            onClick={(event) => {
              event.stopPropagation();
              setIsConfirmOpen((current) => !current);
            }}
            onDragStart={(event) => event.preventDefault()}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            <TrashIcon />
          </button>
        ) : null}
        {showLaneDeleteAction && isConfirmOpen ? (
          <div
            aria-label={`Delete lane ${lane.name}`}
            className="task-delete-popover lane-delete-popover"
            draggable={false}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            role="alertdialog"
          >
            <p>Delete this lane?</p>
            {requiresDestination ? (
              <label className="lane-delete-popover__field">
                <span>Move tasks to</span>
                <select
                  aria-label={`Move tasks from ${lane.name} to`}
                  onChange={(event) => setDestinationLaneId(event.target.value)}
                  value={destinationLaneId}
                >
                  {destinationLanes.map((destinationLane) => (
                    <option key={destinationLane.id} value={destinationLane.id}>
                      {destinationLane.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="task-delete-popover__actions">
              <button
                className="text-button"
                disabled={isDeletePending}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsConfirmOpen(false);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              >
                Cancel
              </button>
              <button
                className="ghost-button danger-button"
                disabled={isDeletePending || (requiresDestination && destinationLaneId.length === 0)}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsConfirmOpen(false);
                  onDelete(requiresDestination ? destinationLaneId : undefined);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              >
                {isDeletePending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LaneDropArea({
  children,
  laneId
}: {
  children: ReactNode;
  laneId: string;
}) {
  const laneDropTargetId = `lane:${laneId}`;
  const { setNodeRef } = useDroppable({
    id: laneDropTargetId,
    data: {
      laneId,
      type: "lane"
    }
  });

  return (
    <div className="board-column__content" ref={setNodeRef}>
      {children}
    </div>
  );
}

function TaskDropSlot({
  isVisible,
  laneId,
  parentTaskId,
  position
}: {
  isVisible: boolean;
  laneId: string;
  parentTaskId: string | null;
  position: number;
}) {
  const slotDropTargetId = `slot:${laneId}:${parentTaskId ?? "root"}:${position}`;
  const { isOver, setNodeRef } = useDroppable({
    id: slotDropTargetId,
    data: {
      laneId,
      parentTaskId,
      position,
      type: "slot"
    }
  });

  if (!isVisible) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={`task-drop-slot${isOver ? " is-active" : ""}`}
      data-testid={
        parentTaskId
          ? `task-drop-slot-${parentTaskId}-${position}`
          : `task-drop-slot-${laneId}-${position}`
      }
      ref={setNodeRef}
    />
  );
}

function TaskCardPreview({
  activeTagKey,
  task
}: {
  activeTagKey: string | null;
  task: Task;
}) {
  return (
    <article className="task-card task-card--drag-overlay">
      <p className="task-card__title">
        <span className="task-card__ticket-id">[{task.ticketId}]</span> {task.title}
      </p>
      {task.tags.length > 0 ? (
        <div className="task-card__tags">
          {task.tags.map((tag) => (
            <span
              className={`task-tag${activeTagKey === normalizeTagKey(tag.label) ? " is-active" : ""}`}
              key={tag.label}
              style={getTaskTagStyle(tag.color)}
            >
              {tag.label}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function TaskCard({
  activeTagKey,
  isDragDisabled,
  isNestTarget,
  laneId,
  onOpen,
  onTagSelect,
  showNestTarget,
  showSubtaskSlots,
  subtasks,
  displaySubtasks,
  task,
  taskIndex
}: {
  activeTagKey: string | null;
  isDragDisabled: boolean;
  isNestTarget: boolean;
  laneId: string;
  onOpen: (task: Task) => void;
  onTagSelect: (tag: string) => void;
  showNestTarget: boolean;
  showSubtaskSlots: boolean;
  subtasks: Task[];
  displaySubtasks: Task[];
  task: Task;
  taskIndex: number;
}) {
  const suppressClickRef = useRef(false);
  const nestTargetDropTargetId = `nest:${task.id}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: isDragDisabled,
    transition: taskSortableTransition,
    data: {
      laneId,
      parentTaskId: task.parentTaskId,
      taskId: task.id,
      type: "task"
    }
  });
  const { setNodeRef: setNestTargetRef } = useDroppable({
    id: nestTargetDropTargetId,
    disabled: !showNestTarget,
    data: {
      laneId,
      parentTaskId: task.id,
      taskId: task.id,
      type: "nest-target"
    }
  });

  useEffect(() => {
    if (isDragging) {
      suppressClickRef.current = true;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isDragging]);

  return (
    <article
      className={`task-card${isDragDisabled ? "" : " is-draggable"}${isDragging ? " is-dragging" : ""}${task.parentTaskId ? " task-card--subtask" : ""}${subtasks.length > 0 ? " has-subtasks" : ""}${isNestTarget ? " is-nest-target" : ""}`}
      data-testid={`task-card-${task.id}`}
      ref={setNodeRef}
      style={{
        ...itemStyle(taskIndex),
        transform: CSS.Transform.toString(transform),
        transition
      }}
    >
      <div className="task-card__surface-wrap">
        {showNestTarget ? (
          <div
            aria-hidden="true"
            className={`task-card__nest-target${isNestTarget ? " is-active" : ""}`}
            ref={setNestTargetRef}
          />
        ) : null}
        <div
          {...attributes}
          {...listeners}
          className="task-card__surface"
          onClick={() => {
            if (suppressClickRef.current) {
              return;
            }

            onOpen(task);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen(task);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <p className="task-card__title">
            <span className="task-card__ticket-id">[{task.ticketId}]</span> {task.title}
          </p>
          {task.tags.length > 0 ? (
            <div className="task-card__tags">
              {task.tags.map((tag) => (
                <button
                  className={`task-tag${activeTagKey === normalizeTagKey(tag.label) ? " is-active" : ""}`}
                  data-no-dnd="true"
                  key={tag.label}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTagSelect(tag.label);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  style={getTaskTagStyle(tag.color)}
                  type="button"
                >
                  {tag.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {subtasks.length > 0 ? (
        <div className="task-card__subtasks">
          <SortableContext items={subtasks.map((subtask) => subtask.id)} strategy={verticalListSortingStrategy}>
            <TaskDropSlot isVisible={showSubtaskSlots} laneId={laneId} parentTaskId={task.id} position={0} />
            {displaySubtasks.map((subtask, subtaskIndex) => (
              <div key={subtask.id}>
                <TaskCard
                  activeTagKey={activeTagKey}
                  displaySubtasks={[]}
                  isDragDisabled={isDragDisabled}
                  isNestTarget={false}
                  laneId={laneId}
                  onOpen={onOpen}
                  onTagSelect={onTagSelect}
                  showNestTarget={false}
                  showSubtaskSlots={showSubtaskSlots}
                  subtasks={[]}
                  task={subtask}
                  taskIndex={subtaskIndex}
                />
                <TaskDropSlot
                  isVisible={showSubtaskSlots}
                  laneId={laneId}
                  parentTaskId={task.id}
                  position={subtaskIndex + 1}
                />
              </div>
            ))}
          </SortableContext>
        </div>
      ) : null}
    </article>
  );
}

function LaneTaskTrashTarget({
  isDeletePending,
  isDraggingTask,
  laneId,
  pendingTask,
  onCancel,
  onConfirm
}: {
  isDeletePending: boolean;
  isDraggingTask: boolean;
  laneId: string;
  pendingTask: Task | null;
  onCancel: () => void;
  onConfirm: (taskId: string) => void;
}) {
  const confirmRef = useRef<HTMLDivElement | null>(null);
  const { isOver, setNodeRef } = useDroppable({
    id: getTaskTrashDropTargetId(laneId),
    data: {
      laneId,
      type: "trash"
    },
    disabled: !isDraggingTask
  });

  useDismissableLayer(Boolean(pendingTask), confirmRef, () => {
    if (!isDeletePending) {
      onCancel();
    }
  });

  return (
    <div
      className={`lane-task-trash-shell${isDraggingTask || pendingTask ? " is-active" : ""}`}
      ref={confirmRef}
    >
      <div
        className={`lane-header__task-trash${isDraggingTask ? " is-visible" : ""}${isOver ? " is-active" : ""}${pendingTask ? " is-confirm-open" : ""}`}
        data-testid={`lane-task-trash-target-${laneId}`}
        ref={setNodeRef}
        role="presentation"
        title="Drop to delete"
      >
        <span aria-hidden="true" className="lane-header__task-trash-mark">
          <TrashIcon />
        </span>
      </div>
      {pendingTask ? (
        <div
          aria-label={`Delete task ${pendingTask.title}`}
          className="task-delete-popover lane-task-trash-popover"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          role="alertdialog"
        >
          <p>Delete {pendingTask.title}?</p>
          <div className="task-delete-popover__actions">
            <button
              className="text-button"
              disabled={isDeletePending}
              onClick={onCancel}
              type="button"
            >
              Cancel
            </button>
            <button
              className="ghost-button danger-button"
              disabled={isDeletePending}
              onClick={() => onConfirm(pendingTask.id)}
              type="button"
            >
              {isDeletePending ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MarkdownSourceIcon() {
  return (
    <svg aria-hidden="true" className="task-editor__tab-icon" viewBox="0 0 24 24">
      <path
        d="M4.75 6.75h14.5v10.5H4.75zm4.75 0-3.25 5.25 3.25 5.25m5-10.5 3.25 5.25-3.25 5.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function MarkdownPreviewIcon() {
  return (
    <svg aria-hidden="true" className="task-editor__tab-icon" viewBox="0 0 24 24">
      <path
        d="M2.75 12s3.5-5.75 9.25-5.75S21.25 12 21.25 12 17.75 17.75 12 17.75 2.75 12 2.75 12Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="12" fill="none" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function TaskTagEditor({
  availableTags,
  inputColor,
  inputValue,
  onInputColorChange,
  onInputValueChange,
  onSelectedTagsChange,
  selectedTags
}: {
  availableTags: TaskTag[];
  inputColor: TaskTagColor;
  inputValue: string;
  onInputColorChange: (color: TaskTagColor) => void;
  onInputValueChange: (value: string) => void;
  onSelectedTagsChange: (tags: TaskTag[]) => void;
  selectedTags: TaskTag[];
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedColorTargetKey, setSelectedColorTargetKey] = useState<string | null>(null);
  const selectedTagKeys = useMemo(
    () => new Set(selectedTags.map((tag) => normalizeTagKey(tag.label))),
    [selectedTags]
  );
  const suggestionQuery = normalizeTagKey(inputValue);
  const selectedColorTarget =
    selectedColorTargetKey === null
      ? null
      : selectedTags.find((tag) => normalizeTagKey(tag.label) === selectedColorTargetKey) ?? null;
  const draftColorTargetLabel = parseTagInput(inputValue)[0] ?? null;
  const activeColorTarget =
    selectedColorTarget ??
    (draftColorTargetLabel ? { color: inputColor, label: draftColorTargetLabel } : null);
  const activePaletteColor = activeColorTarget?.color ?? inputColor;
  const shouldShowPalette = activeColorTarget !== null;
  const visibleSuggestions = useMemo(
    () =>
      availableTags.filter((tag) => {
        const key = normalizeTagKey(tag.label);
        if (selectedTagKeys.has(key)) {
          return false;
        }

        return suggestionQuery.length === 0 || key.includes(suggestionQuery);
      }),
    [availableTags, selectedTagKeys, suggestionQuery]
  );

  useEffect(() => {
    if (
      selectedColorTargetKey !== null &&
      !selectedTags.some((tag) => normalizeTagKey(tag.label) === selectedColorTargetKey)
    ) {
      setSelectedColorTargetKey(null);
    }
  }, [selectedColorTargetKey, selectedTags]);

  function commitInputValue() {
    const nextTags = mergeUniqueTags(selectedTags, inputValue, inputColor);

    if (nextTags !== selectedTags) {
      onSelectedTagsChange(nextTags);
    }

    if (inputValue.length > 0) {
      onInputValueChange("");
      onInputColorChange(getRandomTaskTagColor());
    }

    return nextTags;
  }

  function removeTag(tagToRemove: string) {
    onSelectedTagsChange(
      selectedTags.filter((tag) => normalizeTagKey(tag.label) !== normalizeTagKey(tagToRemove))
    );
    if (selectedColorTargetKey === normalizeTagKey(tagToRemove)) {
      setSelectedColorTargetKey(null);
    }
    inputRef.current?.focus();
  }

  function addSuggestedTag(tag: TaskTag) {
    onSelectedTagsChange(mergeUniqueTags(selectedTags, tag.label, tag.color));
    onInputValueChange("");
    setSelectedColorTargetKey(normalizeTagKey(tag.label));
    inputRef.current?.focus();
  }

  function updateTagColor(color: TaskTagColor) {
    if (selectedColorTargetKey === null) {
      onInputColorChange(color);
      return;
    }

    onSelectedTagsChange(
      selectedTags.map((tag) =>
        normalizeTagKey(tag.label) === selectedColorTargetKey ? { ...tag, color } : tag
      )
    );
  }

  return (
    <div className="field">
      <span className="field__label" id="task-tag-editor-label">
        Tags
      </span>
      <div
        aria-labelledby="task-tag-editor-label"
        className="task-tag-editor"
        onBlur={(event) => {
          const nextFocusedNode = event.relatedTarget as Node | null;
          if (nextFocusedNode && event.currentTarget.contains(nextFocusedNode)) {
            return;
          }

          commitInputValue();
        }}
        role="group"
      >
        <div
          className="task-tag-editor__input-shell"
          onClick={() => {
            setSelectedColorTargetKey(null);
            inputRef.current?.focus();
          }}
          role="presentation"
        >
          {selectedTags.map((tag) => (
            <span
              className={`task-tag-editor__chip${selectedColorTargetKey === normalizeTagKey(tag.label) ? " is-selected" : ""}`}
              key={tag.label}
              style={getTaskTagStyle(tag.color)}
            >
              <button
                aria-label={`Edit color for tag ${tag.label}`}
                aria-pressed={selectedColorTargetKey === normalizeTagKey(tag.label)}
                className="task-tag-editor__chip-main"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedColorTargetKey(normalizeTagKey(tag.label));
                }}
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                <span aria-hidden="true" className="task-tag-editor__chip-swatch" />
                <span className="task-tag-editor__chip-label">{tag.label}</span>
              </button>
              <button
                aria-label={`Remove tag ${tag.label}`}
                className="task-tag-editor__chip-remove"
                onClick={(event) => {
                  event.stopPropagation();
                  removeTag(tag.label);
                }}
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                <CloseIcon />
              </button>
            </span>
          ))}
          <input
            aria-label="Task tags"
            className="task-tag-editor__input"
            maxLength={240}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (selectedColorTargetKey !== null) {
                setSelectedColorTargetKey(null);
              }
              if (inputValue.trim().length === 0 && nextValue.trim().length > 0) {
                onInputColorChange(getRandomTaskTagColor());
              }
              onInputValueChange(nextValue);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                commitInputValue();
                return;
              }

              if (
                (event.key === "Backspace" || event.key === "Delete") &&
                inputValue.length === 0 &&
                selectedTags.length > 0
              ) {
                event.preventDefault();
                onSelectedTagsChange(selectedTags.slice(0, -1));
              }
            }}
            placeholder={selectedTags.length > 0 ? "Add another tag" : "Add a tag"}
            ref={inputRef}
            value={inputValue}
          />
        </div>
        {shouldShowPalette ? (
          <div className="task-tag-editor__palette-panel">
            <span className="task-tag-editor__palette-label">
              {`Color for ${activeColorTarget?.label ?? ""}`}
            </span>
            <div className="task-tag-editor__palette" role="list">
              {taskTagColorOptions.map((option) => (
                <button
                  aria-label={`Set ${activeColorTarget?.label ?? "tag"} color to ${option.label}`}
                  aria-pressed={activePaletteColor === option.value}
                  className={`task-tag-editor__swatch${activePaletteColor === option.value ? " is-active" : ""}`}
                  key={option.value}
                  onClick={() => updateTagColor(option.value)}
                  onMouseDown={(event) => event.preventDefault()}
                  style={getTaskTagStyle(option.value)}
                  type="button"
                >
                  <span aria-hidden="true" className="task-tag-editor__swatch-dot" />
                  <span className="task-tag-editor__swatch-name">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {visibleSuggestions.length > 0 ? (
          <div aria-label="Suggested tags" className="task-tag-editor__suggestions" role="list">
            {visibleSuggestions.map((tag) => (
              <button
                aria-label={`Add tag ${tag.label}`}
                className="task-tag-editor__suggestion"
                key={tag.label}
                onClick={() => addSuggestedTag(tag)}
                onMouseDown={(event) => event.preventDefault()}
                style={getTaskTagStyle(tag.color)}
                type="button"
              >
                {tag.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TaskEditorDialog({
  availableTags,
  error,
  isPending,
  onClose,
  onSave,
  task
}: {
  availableTags: TaskTag[];
  error: Error | null;
  isPending: boolean;
  onClose: () => void;
  onSave: (input: { body: string; tags: TaskTag[]; title: string }) => void;
  task: Task;
}) {
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.body);
  const [selectedTags, setSelectedTags] = useState(task.tags);
  const [tagInputColor, setTagInputColor] = useState<TaskTagColor>(() => getRandomTaskTagColor());
  const [tagInputValue, setTagInputValue] = useState("");
  const [activeView, setActiveView] = useState<TaskEditorView>("source");

  useEffect(() => {
    setTitle(task.title);
    setBody(task.body);
    setSelectedTags(task.tags);
    setTagInputColor(getRandomTaskTagColor());
    setTagInputValue("");
    setActiveView("source");
  }, [task.body, task.id, task.tags, task.title]);

  return (
    <div className="dialog-scrim" onClick={onClose}>
      <section
        aria-labelledby="edit-task-title"
        aria-modal="true"
        className="dialog-panel dialog-panel--task-editor"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="dialog-header">
          <h2 id="edit-task-title">Edit Card</h2>
          <button
            aria-label="Close edit task dialog"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </div>
        <dl aria-label="Card timing" className="task-editor__meta">
          <div className="task-editor__meta-item">
            <dt>Created</dt>
            <dd>
              <time dateTime={task.createdAt}>{task.createdAt}</time>
            </dd>
          </div>
          <div className="task-editor__meta-item">
            <dt>Updated</dt>
            <dd>
              <time dateTime={task.updatedAt}>{task.updatedAt}</time>
            </dd>
          </div>
        </dl>
        <form
          className="dialog-form task-editor"
          onSubmit={(event) => {
            event.preventDefault();
            const tags = mergeUniqueTags(selectedTags, tagInputValue, tagInputColor);
            setSelectedTags(tags);
            setTagInputValue("");
            onSave({
              body,
              tags,
              title: title.trim()
            });
          }}
        >
          <div className="task-editor__grid">
            <label className="field">
              <span className="field__label">Title</span>
              <input
                autoFocus
                maxLength={240}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Task title"
                required
                value={title}
              />
            </label>
            <TaskTagEditor
              availableTags={availableTags}
              inputColor={tagInputColor}
              inputValue={tagInputValue}
              onInputColorChange={setTagInputColor}
              onInputValueChange={setTagInputValue}
              onSelectedTagsChange={setSelectedTags}
              selectedTags={selectedTags}
            />
            <div className="field field--editor">
              <div className="task-editor__field-header">
                <span className="field__label">Body</span>
                <div
                  aria-label="Markdown editor view"
                  className="task-editor__view-tabs"
                  role="tablist"
                >
                  <button
                    aria-controls="task-markdown-source-panel"
                    aria-label="Markdown source"
                    aria-selected={activeView === "source"}
                    className={`task-editor__view-tab${activeView === "source" ? " is-active" : ""}`}
                    id="task-markdown-source-tab"
                    onClick={() => setActiveView("source")}
                    role="tab"
                    type="button"
                  >
                    <MarkdownSourceIcon />
                  </button>
                  <button
                    aria-controls="task-markdown-preview-panel"
                    aria-label="Rendered preview"
                    aria-selected={activeView === "preview"}
                    className={`task-editor__view-tab${activeView === "preview" ? " is-active" : ""}`}
                    id="task-markdown-preview-tab"
                    onClick={() => setActiveView("preview")}
                    role="tab"
                    type="button"
                  >
                    <MarkdownPreviewIcon />
                  </button>
                </div>
              </div>
              {activeView === "source" ? (
                <div
                  aria-labelledby="task-markdown-source-tab"
                  className="task-editor__panel"
                  id="task-markdown-source-panel"
                  role="tabpanel"
                >
                  <textarea
                    aria-label="Task body"
                    maxLength={12000}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Write markdown here"
                    rows={12}
                    value={body}
                  />
                </div>
              ) : null}
            </div>
            {activeView === "preview" ? (
              <div
                aria-labelledby="task-markdown-preview-tab"
                className="task-editor__preview-inline"
                id="task-markdown-preview-panel"
                role="tabpanel"
              >
                <div
                  className="markdown-preview"
                  data-testid="task-markdown-preview"
                  id="task-markdown-preview"
                >
                  {body.trim() ? (
                    <ReactMarkdown>{body}</ReactMarkdown>
                  ) : (
                    <p className="markdown-preview__empty">Nothing to preview yet.</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          {error ? <ErrorBanner error={error} /> : null}
          <div className="dialog-actions">
            <button className="text-button" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="primary-button" disabled={isPending || title.trim().length === 0} type="submit">
              {isPending ? "Saving..." : "Save card"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function BoardPage() {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [composerLaneId, setComposerLaneId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draggedLaneId, setDraggedLaneId] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [previewTasks, setPreviewTasks] = useState<Task[] | null>(null);
  const [laneDropTarget, setLaneDropTarget] = useState<{
    insertAfter: boolean;
    laneId: string;
    position: number;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskMoveTarget | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [laneName, setLaneName] = useState("");
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState<string | null>(null);
  const [pendingDeleteTaskLaneId, setPendingDeleteTaskLaneId] = useState<string | null>(null);
  const [taskDragPreviewWidth, setTaskDragPreviewWidth] = useState<number | null>(null);
  const laneDragPreviewRef = useRef<HTMLElement | null>(null);
  const pointerClientYRef = useRef<number | null>(null);
  const previewTasksRef = useRef<Task[] | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.listProjects()
  });
  const lanesQuery = useQuery({
    enabled: Boolean(projectId),
    queryKey: ["lanes", projectId],
    queryFn: () => api.listLanes(projectId ?? "")
  });
  const tasksQuery = useQuery({
    enabled: Boolean(projectId),
    queryKey: ["tasks", projectId],
    queryFn: () => api.listTasks(projectId ?? "")
  });
  const taskTagsQuery = useQuery({
    queryKey: ["task-tags"],
    queryFn: () => api.listTaskTags()
  });

  const isCreateLaneDialogOpen = searchParams.get("createLane") === "1";
  const boardSearch = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const activeTagFilter = parseSingleTagInput(searchParams.get("tags") ?? "");
  const activeTagKey = activeTagFilter ? normalizeTagKey(activeTagFilter) : null;
  const project = projectsQuery.data?.find((candidate) => candidate.id === projectId);
  const lanes = lanesQuery.data ?? project?.laneSummaries ?? [];
  const tasks = tasksQuery.data ?? [];
  const activeTasks = previewTasks ?? tasks;
  const lanesById = useMemo(() => new Map(lanes.map((lane) => [lane.id, lane])), [lanes]);
  const draggedLane = draggedLaneId ? lanes.find((lane) => lane.id === draggedLaneId) ?? null : null;
  const editingTask = editingTaskId ? tasks.find((task) => task.id === editingTaskId) ?? null : null;
  const isBoardFiltered = boardSearch.length > 0 || activeTagKey !== null;
  const committedTaskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const taskMap = useMemo(() => new Map(activeTasks.map((task) => [task.id, task])), [activeTasks]);
  const draggedTask =
    draggedTaskId
      ? committedTaskMap.get(draggedTaskId) ?? taskMap.get(draggedTaskId) ?? null
      : null;
  const pendingDeleteTask =
    pendingDeleteTaskId
      ? committedTaskMap.get(pendingDeleteTaskId) ?? taskMap.get(pendingDeleteTaskId) ?? null
      : null;
  const availableTaskTags = taskTagsQuery.data ?? listSuggestedTags(tasks);
  const topLevelTaskIdsByLane = useMemo(
    () => buildTopLevelTaskIdsByLane(lanes, activeTasks),
    [activeTasks, lanes]
  );
  const subtaskIdsByParent = useMemo(
    () => buildSubtaskIdsByParent(activeTasks, lanesById),
    [activeTasks, lanesById]
  );
  const taskSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  );

  function taskMatchesBoardFilters(task: Task) {
    const haystack = `${task.title}\n${task.body}\n${task.tags.map((tag) => tag.label).join("\n")}`.toLowerCase();
    const matchesSearch = !boardSearch || haystack.includes(boardSearch);
    if (!matchesSearch) {
      return false;
    }

    if (activeTagKey === null) {
      return true;
    }

    const taskTagKeys = new Set(task.tags.map((tag) => normalizeTagKey(tag.label)));
    return taskTagKeys.has(activeTagKey);
  }

  const groupedTasks = lanes.map((lane) => ({
    ...lane,
    isDoneLane: isDoneLaneName(lane.name),
    isProtectedLane: isProtectedLaneName(lane.name),
    displayTasks: (topLevelTaskIdsByLane[lane.id] ?? [])
      .map((taskId) => taskMap.get(taskId))
      .filter((task): task is Task => Boolean(task))
      .map((task) => {
        const subtasks = (subtaskIdsByParent.get(task.id) ?? [])
          .map((subtaskId) => taskMap.get(subtaskId))
          .filter((subtask): subtask is Task => Boolean(subtask));
        const displaySubtasks = subtasks.filter((subtask) => taskMatchesBoardFilters(subtask));
        const shouldDisplay = !isBoardFiltered || taskMatchesBoardFilters(task) || displaySubtasks.length > 0;

        return {
          displaySubtasks,
          shouldDisplay,
          subtasks,
          task
        };
      })
      .filter((taskGroup) => taskGroup.shouldDisplay),
    tasks: (topLevelTaskIdsByLane[lane.id] ?? [])
      .map((taskId) => taskMap.get(taskId))
      .filter((task): task is Task => Boolean(task))
      .map((task) => ({
        displaySubtasks: (subtaskIdsByParent.get(task.id) ?? [])
          .map((subtaskId) => taskMap.get(subtaskId))
          .filter((subtask): subtask is Task => Boolean(subtask)),
        subtasks: (subtaskIdsByParent.get(task.id) ?? [])
          .map((subtaskId) => taskMap.get(subtaskId))
          .filter((subtask): subtask is Task => Boolean(subtask)),
      task
    }))
  }));

  function laneUsesDoneOrdering(laneId: string | null) {
    return laneId ? isDoneLaneName(lanesById.get(laneId)?.name ?? "") : false;
  }

  useEffect(() => {
    if (
      (pendingDeleteTaskId && !pendingDeleteTask) ||
      (pendingDeleteTaskLaneId && !lanesById.has(pendingDeleteTaskLaneId))
    ) {
      setPendingDeleteTaskId(null);
      setPendingDeleteTaskLaneId(null);
    }
  }, [lanesById, pendingDeleteTask, pendingDeleteTaskId, pendingDeleteTaskLaneId]);

  async function invalidateBoardData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["task-tags"] }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["lanes", projectId] })
    ]);
  }

  const createLaneMutation = useMutation({
    mutationFn: (name: string) => api.createLane(projectId ?? "", name),
    onSuccess: async () => {
      closeCreateLaneDialog();
      await invalidateBoardData();
    }
  });

  const createTaskMutation = useMutation({
    mutationFn: ({ laneId, title }: { laneId: string; title: string }) =>
      api.createTask(projectId ?? "", {
        laneId,
        title
      }),
    onSuccess: async () => {
      setComposerLaneId(null);
      setDraftTitle("");
      await invalidateBoardData();
    }
  });

  const moveTaskMutation = useMutation({
    mutationFn: ({
      laneId,
      parentTaskId,
      position,
      taskId
    }: {
      laneId: string;
      parentTaskId: string | null;
      position: number;
      taskId: string;
    }) => api.updateTask(projectId ?? "", taskId, { laneId, parentTaskId, position }),
    onMutate: async ({ laneId, parentTaskId, position, taskId }) => {
      if (!projectId) {
        return { previousTasks: undefined };
      }

      await queryClient.cancelQueries({ queryKey: ["tasks", projectId] });
      const previousTasks = queryClient.getQueryData<Task[]>(["tasks", projectId]) ?? tasks;
      const optimisticTasks = applyTaskMove(previousTasks, taskId, laneId, parentTaskId, position, lanesById);

      queryClient.setQueryData(["tasks", projectId], optimisticTasks);
      return { previousTasks };
    },
    onError: (_error, _variables, context) => {
      if (!projectId || !context?.previousTasks) {
        return;
      }

      queryClient.setQueryData(["tasks", projectId], context.previousTasks);
    },
    onSettled: async () => {
      await invalidateBoardData();
    }
  });
  const moveLaneMutation = useMutation({
    mutationFn: ({ laneId, position }: { laneId: string; position: number }) =>
      api.updateLane(projectId ?? "", laneId, { position }),
    onSuccess: async () => {
      await invalidateBoardData();
    }
  });
  const deleteLaneMutation = useMutation({
    mutationFn: ({
      destinationLaneId,
      laneId
    }: {
      destinationLaneId?: string;
      laneId: string;
    }) =>
      api.deleteLane(
        projectId ?? "",
        laneId,
        destinationLaneId ? { destinationLaneId } : undefined
      ),
    onSuccess: async (_, { laneId }) => {
      if (composerLaneId === laneId) {
        closeComposer();
      }
      if (draggedLaneId === laneId) {
        clearLaneDrag();
      }
      await invalidateBoardData();
    }
  });

  const saveTaskMutation = useMutation({
    mutationFn: ({
      body,
      tags,
      taskId,
      title
    }: {
      body: string;
      tags: TaskTag[];
      taskId: string;
      title: string;
    }) => api.updateTask(projectId ?? "", taskId, { body, tags, title }),
    onSuccess: async () => {
      closeTaskDialog();
      await invalidateBoardData();
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => api.deleteTask(projectId ?? "", taskId),
    onSuccess: async () => {
      setPendingDeleteTaskId(null);
      setPendingDeleteTaskLaneId(null);
      await invalidateBoardData();
    }
  });
  const isDragDisabled =
    isBoardFiltered ||
    deleteLaneMutation.isPending ||
    deleteTaskMutation.isPending ||
    moveTaskMutation.isPending ||
    moveLaneMutation.isPending ||
    pendingDeleteTaskId !== null ||
    saveTaskMutation.isPending ||
    draggedLaneId !== null;
  const isLaneDragDisabled =
    deleteLaneMutation.isPending ||
    deleteTaskMutation.isPending ||
    moveLaneMutation.isPending ||
    pendingDeleteTaskId !== null ||
    draggedTaskId !== null;

  function updateBoardParams(updater: (params: URLSearchParams) => void) {
    const nextParams = new URLSearchParams(searchParams);
    updater(nextParams);
    setSearchParams(nextParams, { replace: true });
  }

  function closeCreateLaneDialog() {
    updateBoardParams((params) => {
      params.delete("createLane");
    });
    setLaneName("");
    createLaneMutation.reset();
  }

  function openCreateLaneDialog() {
    updateBoardParams((params) => {
      params.set("createLane", "1");
    });
    setLaneName("");
    createLaneMutation.reset();
  }

  function openComposer(laneId: string) {
    setComposerLaneId(laneId);
    setDraftTitle("");
  }

  function closeComposer() {
    setComposerLaneId(null);
    setDraftTitle("");
  }

  function closeTaskDialog() {
    setEditingTaskId(null);
    saveTaskMutation.reset();
  }

  function updateTagFilter(tag: string | null) {
    updateBoardParams((params) => {
      const nextValue = formatSingleTagInput(tag);
      if (nextValue) {
        params.set("tags", nextValue);
      } else {
        params.delete("tags");
      }
    });
  }

  function handleTagSelect(tag: string) {
    if (activeTagKey === normalizeTagKey(tag)) {
      return;
    }

    updateTagFilter(tag);
  }

  function clearLaneDrag() {
    laneDragPreviewRef.current?.remove();
    laneDragPreviewRef.current = null;
    setDraggedLaneId(null);
    setLaneDropTarget(null);
  }

  function clearTaskDrag() {
    setDraggedTaskId(null);
    setDropTarget(null);
    setPreviewTasks(null);
    setTaskDragPreviewWidth(null);
    previewTasksRef.current = null;
  }

  function handleLaneDragStart(event: DragEvent<HTMLElement>, laneId: string) {
    if (isLaneDragDisabled) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", laneId);
    const column = event.currentTarget.closest(".board-column");
    if (column instanceof HTMLElement) {
      const preview = createNativeDragPreview(column);
      if (preview) {
        laneDragPreviewRef.current?.remove();
        laneDragPreviewRef.current = preview;
        const bounds = column.getBoundingClientRect();
        const offsetX = Math.max(0, Math.min(event.clientX - bounds.left, bounds.width));
        const offsetY = Math.max(0, Math.min(event.clientY - bounds.top, bounds.height));
        event.dataTransfer.setDragImage(preview, offsetX, offsetY);
      }
    }
    setDraggedLaneId(laneId);
    setLaneDropTarget(null);
  }

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      pointerClientYRef.current = event.clientY;
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  function resolveLanePosition(targetLaneId: string, insertAfter: boolean) {
    const visibleLaneIds = lanes
      .filter((lane) => lane.id !== draggedLaneId)
      .map((lane) => lane.id);
    const targetIndex = visibleLaneIds.indexOf(targetLaneId);
    if (targetIndex === -1) {
      return null;
    }

    return Math.max(0, Math.min(targetIndex + (insertAfter ? 1 : 0), visibleLaneIds.length));
  }

  function handleLaneDragOver(event: DragEvent<HTMLElement>, lane: BoardLane) {
    if (!draggedLaneId || isLaneDragDisabled || lane.id === draggedLaneId) {
      return;
    }

    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const insertAfter = event.clientX > bounds.left + bounds.width / 2;
    const position = resolveLanePosition(lane.id, insertAfter);
    if (position === null) {
      return;
    }

    setLaneDropTarget((current) => {
      if (
        current?.laneId === lane.id &&
        current.position === position &&
        current.insertAfter === insertAfter
      ) {
        return current;
      }

      return {
        laneId: lane.id,
        position,
        insertAfter
      };
    });
  }

  function handleLaneDrop() {
    const laneId = draggedLane?.id;
    const position = laneDropTarget?.position;

    clearLaneDrag();
    if (!laneId || position === undefined) {
      return;
    }

    moveLaneMutation.mutate({
      laneId,
      position
    });
  }

  function handleTaskDragStart(event: DragStartEvent) {
    if (isDragDisabled) {
      return;
    }

    const activeTaskId = String(event.active.id);
    const source = findTaskLocation(tasks, activeTaskId);

    flushSync(() => {
      setPendingDeleteTaskId(null);
      setPendingDeleteTaskLaneId(null);
      setDraggedTaskId(activeTaskId);
      setTaskDragPreviewWidth(event.active.rect.current.initial?.width ?? null);
      setPreviewTasks(tasks);
      setDropTarget(
        source
          ? {
              kind: "reorder",
              laneId: source.laneId,
              parentTaskId: source.parentTaskId,
              position: source.position
            }
          : null
      );
    });
    previewTasksRef.current = tasks;
  }

  function handleTaskDragOver(event: DragOverEvent) {
    if (!draggedTaskId || isDragDisabled || !event.over) {
      return;
    }

    const activeTaskId = String(event.active.id);
    const currentPreviewTasks = previewTasks ?? tasks;
    const currentTopLevelTaskIdsByLane = buildTopLevelTaskIdsByLane(lanes, currentPreviewTasks);
    const currentSubtaskIdsByParent = buildSubtaskIdsByParent(currentPreviewTasks, lanesById);
    const activeTask = currentPreviewTasks.find((task) => task.id === activeTaskId);
    const sourceTask = tasks.find((task) => task.id === activeTaskId) ?? null;
    const sourceParentTaskId = sourceTask?.parentTaskId ?? null;
    const overData = event.over.data.current;
    if (!overData || !activeTask) {
      return;
    }

    function resetPreviewToSource() {
      const source = findTaskLocation(tasks, activeTaskId);
      previewTasksRef.current = tasks;
      flushSync(() => {
        setPreviewTasks(tasks);
        setDropTarget(
          source
            ? {
                kind: "reorder",
                laneId: source.laneId,
                parentTaskId: source.parentTaskId,
                position: source.position
              }
            : null
        );
      });
    }

    if (overData.type === "trash") {
      resetPreviewToSource();
      return;
    }

    let nextDropTarget: TaskMoveTarget | null = null;

    if (overData.type === "slot") {
      if (laneUsesDoneOrdering(String(overData.laneId))) {
        resetPreviewToSource();
        return;
      }

      const targetParentTaskId =
        typeof overData.parentTaskId === "string" ? String(overData.parentTaskId) : null;
      if (!canTaskJoinParentGroup(currentPreviewTasks, activeTask, targetParentTaskId)) {
        return;
      }

      nextDropTarget = {
        kind: "reorder",
        laneId: String(overData.laneId),
        parentTaskId: targetParentTaskId,
        position: Number(overData.position)
      };
    }

    if (overData.type === "lane" && nextDropTarget === null) {
      const targetLaneId = String(overData.laneId);
      if (laneUsesDoneOrdering(targetLaneId)) {
        if (sourceTask?.laneId === targetLaneId) {
          resetPreviewToSource();
          return;
        }

        nextDropTarget = {
          kind: "reorder",
          laneId: targetLaneId,
          parentTaskId: null,
          position: (currentTopLevelTaskIdsByLane[targetLaneId] ?? []).length
        };
      } else {
        const laneTaskIds = currentTopLevelTaskIdsByLane[targetLaneId] ?? [];
        if (laneTaskIds.length === 0) {
          nextDropTarget = {
            kind: "reorder",
            laneId: targetLaneId,
            parentTaskId: null,
            position: 0
          };
        } else {
          const pointerClientY = pointerClientYRef.current;
          const translated = event.active.rect.current.translated;
          const activeHeight = event.active.rect.current.initial?.height ?? 0;
          const activeCenterY =
            pointerClientY ??
            (translated !== null
              ? translated.top + activeHeight / 2
              : event.over.rect.top + event.over.rect.height / 2);
          const relativeCenterY = Math.max(0, activeCenterY - event.over.rect.top);
          const normalizedIndex = Math.floor(
            (relativeCenterY / Math.max(event.over.rect.height, 1)) * laneTaskIds.length
          );

          nextDropTarget = {
            kind: "reorder",
            laneId: targetLaneId,
            parentTaskId: null,
            position: Math.max(0, Math.min(normalizedIndex, laneTaskIds.length))
          };
        }
      }
    }

    if (overData.type === "nest-target" && nextDropTarget === null) {
      if (laneUsesDoneOrdering(String(overData.laneId))) {
        resetPreviewToSource();
        return;
      }

      const overTaskId = String(overData.taskId);
      const overTask = currentPreviewTasks.find((task) => task.id === overTaskId);
      if (sourceParentTaskId === overTaskId) {
        resetPreviewToSource();
        return;
      }

      if (overTask && canTaskNestUnderParent(currentPreviewTasks, activeTask, overTask.id)) {
        nextDropTarget = {
          kind: "nest",
          laneId: String(overData.laneId),
          parentTaskId: overTask.id,
          position: (currentSubtaskIdsByParent.get(overTask.id) ?? []).length,
          taskId: overTask.id
        };
      }
    }

    if (overData.type === "task" && nextDropTarget === null) {
      const targetLaneId = String(overData.laneId);
      const overTaskId = String(overData.taskId);
      if (overTaskId === activeTaskId) {
        return;
      }

      if (activeTask.parentTaskId === overTaskId) {
        return;
      }

      if (laneUsesDoneOrdering(targetLaneId)) {
        if (sourceTask?.laneId === targetLaneId) {
          resetPreviewToSource();
          return;
        }

        nextDropTarget = {
          kind: "reorder",
          laneId: targetLaneId,
          parentTaskId: null,
          position: (currentTopLevelTaskIdsByLane[targetLaneId] ?? []).length
        };
      }

      if (nextDropTarget !== null) {
        const nextPreviewTasks = applyTaskMove(
          currentPreviewTasks,
          activeTaskId,
          nextDropTarget.laneId,
          nextDropTarget.parentTaskId,
          nextDropTarget.position,
          lanesById
        );
        const nextLocation = findTaskLocation(nextPreviewTasks, activeTaskId);
        if (!nextLocation) {
          return;
        }

        previewTasksRef.current = nextPreviewTasks;
        const resolvedDropTarget = nextDropTarget;
        flushSync(() => {
          setPreviewTasks(nextPreviewTasks);
          setDropTarget({
            kind: resolvedDropTarget.kind,
            laneId: nextLocation.laneId,
            parentTaskId: nextLocation.parentTaskId,
            position: nextLocation.position,
            ...(resolvedDropTarget.taskId ? { taskId: resolvedDropTarget.taskId } : {})
          });
        });
        return;
      }

      const overTask = currentPreviewTasks.find((task) => task.id === overTaskId);
      if (sourceParentTaskId === overTaskId) {
        resetPreviewToSource();
        return;
      }

      const targetParentTaskId = overTask?.parentTaskId ?? null;
      if (!overTask || !canTaskJoinParentGroup(currentPreviewTasks, activeTask, targetParentTaskId)) {
        return;
      }

      const siblingTaskIds =
        targetParentTaskId === null
          ? currentTopLevelTaskIdsByLane[targetLaneId] ?? []
          : currentSubtaskIdsByParent.get(targetParentTaskId) ?? [];
      const overIndex = siblingTaskIds.indexOf(overTaskId);
      if (overIndex !== -1) {
        const pointerClientY = pointerClientYRef.current;
        const translated = event.active.rect.current.translated;
        const activeHeight = event.active.rect.current.initial?.height ?? event.over.rect.height;
        const translatedCenter =
          pointerClientY ?? (translated !== null ? translated.top + activeHeight / 2 : event.over.rect.top);
        const isBelowOverItem =
          translatedCenter > event.over.rect.top + event.over.rect.height / 2;

        nextDropTarget = {
          kind: "reorder",
          laneId: targetLaneId,
          parentTaskId: targetParentTaskId,
          position: overIndex + (isBelowOverItem ? 1 : 0)
        };
      }
    }

    if (!nextDropTarget) {
      return;
    }

    const nextPreviewTasks = applyTaskMove(
      currentPreviewTasks,
      activeTaskId,
      nextDropTarget.laneId,
      nextDropTarget.parentTaskId,
      nextDropTarget.position,
      lanesById
    );
    const nextLocation = findTaskLocation(nextPreviewTasks, activeTaskId);
    if (!nextLocation) {
      return;
    }

    previewTasksRef.current = nextPreviewTasks;
    const resolvedDropTarget = nextDropTarget;
    flushSync(() => {
      setPreviewTasks(nextPreviewTasks);
      setDropTarget({
        kind: resolvedDropTarget.kind,
        laneId: nextLocation.laneId,
        parentTaskId: nextLocation.parentTaskId,
        position: nextLocation.position,
        ...(resolvedDropTarget.taskId ? { taskId: resolvedDropTarget.taskId } : {})
      });
    });
  }

  function handleTaskDragEnd(event: DragEndEvent) {
    const activeTaskId = String(event.active.id);
    if (event.over?.data.current?.type === "trash") {
      const dropTargetLaneId =
        typeof event.over.data.current?.laneId === "string"
          ? String(event.over.data.current.laneId)
          : getLaneIdFromTaskTrashDropTargetId(event.over.id);
      setPendingDeleteTaskId(activeTaskId);
      setPendingDeleteTaskLaneId(dropTargetLaneId);
      clearTaskDrag();
      return;
    }

    const currentPreviewTasks = previewTasksRef.current ?? previewTasks ?? tasks;
    const source = findTaskLocation(tasks, activeTaskId);
    const destination = findTaskLocation(currentPreviewTasks, activeTaskId);
    if (!source || !destination) {
      clearTaskDrag();
      return;
    }

    if (
      source.laneId === destination.laneId &&
      source.parentTaskId === destination.parentTaskId &&
      source.position === destination.position
    ) {
      clearTaskDrag();
      return;
    }

    moveTaskMutation.mutate({
      laneId: destination.laneId,
      parentTaskId: destination.parentTaskId,
      position: destination.position,
      taskId: activeTaskId
    });
    clearTaskDrag();
  }

  useEffect(() => {
    if (!isCreateLaneDialogOpen && !editingTask) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (editingTask) {
        closeTaskDialog();
        return;
      }

      closeCreateLaneDialog();
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [editingTask, isCreateLaneDialogOpen]);

  useEffect(() => {
    return () => {
      laneDragPreviewRef.current?.remove();
      laneDragPreviewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!editingTaskId || editingTask || tasksQuery.isPending) {
      return;
    }

    setEditingTaskId(null);
  }, [editingTask, editingTaskId, tasksQuery.isPending]);

  if (!projectId) {
    return <Navigate replace to="/" />;
  }

  return (
    <main className="page-shell page-shell--board">
      <title>{project ? `${project.name} | BBTodo` : "Board | BBTodo"}</title>
      {isCreateLaneDialogOpen ? (
        <div className="dialog-scrim" onClick={() => closeCreateLaneDialog()}>
          <section
            aria-labelledby="create-lane-title"
            aria-modal="true"
            className="dialog-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="dialog-header">
              <h2 id="create-lane-title">Create Lane</h2>
              <button
                aria-label="Close create lane dialog"
                className="icon-button"
                onClick={() => closeCreateLaneDialog()}
                type="button"
              >
                <CloseIcon />
              </button>
            </div>
            <form
              className="dialog-form"
              onSubmit={(event) => {
                event.preventDefault();
                createLaneMutation.mutate(laneName.trim());
              }}
            >
              <label className="field">
                <input
                  aria-label="Lane name"
                  autoFocus
                  maxLength={80}
                  onChange={(event) => setLaneName(event.target.value)}
                  placeholder="Ready for QA"
                  required
                  value={laneName}
                />
              </label>
              {createLaneMutation.error ? <ErrorBanner error={createLaneMutation.error} /> : null}
              <div className="dialog-actions">
                <button className="text-button" onClick={() => closeCreateLaneDialog()} type="button">
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={createLaneMutation.isPending || laneName.trim().length === 0}
                  type="submit"
                >
                  {createLaneMutation.isPending ? "Creating lane..." : "Create Lane"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {editingTask ? (
        <TaskEditorDialog
          availableTags={availableTaskTags}
          error={saveTaskMutation.error}
          isPending={saveTaskMutation.isPending}
          onClose={closeTaskDialog}
          onSave={({ body, tags, title }) =>
            saveTaskMutation.mutate({
              body,
              tags,
              taskId: editingTask.id,
              title
            })
          }
          task={editingTask}
        />
      ) : null}

      {projectsQuery.error ? <ErrorBanner error={projectsQuery.error} /> : null}
      {lanesQuery.error ? <ErrorBanner error={lanesQuery.error} /> : null}
      {tasksQuery.error ? <ErrorBanner error={tasksQuery.error} /> : null}
      {createTaskMutation.error ? <ErrorBanner error={createTaskMutation.error} /> : null}
      {moveTaskMutation.error ? <ErrorBanner error={moveTaskMutation.error} /> : null}
      {moveLaneMutation.error ? <ErrorBanner error={moveLaneMutation.error} /> : null}
      {deleteLaneMutation.error ? <ErrorBanner error={deleteLaneMutation.error} /> : null}
      {deleteTaskMutation.error ? <ErrorBanner error={deleteTaskMutation.error} /> : null}

      {projectsQuery.isPending || lanesQuery.isPending || tasksQuery.isPending ? <BoardSkeleton /> : null}

      {!projectsQuery.isPending && projectsQuery.data && !project ? (
        <EmptyState
          copy="The project may have been removed. Head back to the project list and open another board."
          eyebrow="Missing board"
          title="That board is no longer available."
        />
      ) : null}

      {!projectsQuery.isPending && !lanesQuery.isPending && !tasksQuery.isPending && project ? (
        <DndContext
          collisionDetection={taskCollisionDetection}
          measuring={taskMeasuring}
          onDragCancel={clearTaskDrag}
          onDragEnd={handleTaskDragEnd}
          onDragOver={handleTaskDragOver}
          onDragStart={handleTaskDragStart}
          sensors={taskSensors}
        >
          <section className="board-grid board-grid--lanes" data-testid="board-grid">
            {groupedTasks.map((lane, laneIndex) => {
              const nextLane = groupedTasks[laneIndex + 1] ?? null;
              const gapLabel = nextLane
                ? `Create lane between ${lane.name} and ${nextLane.name}`
                : `Create lane after ${lane.name}`;

              return (
                <div className="board-column-shell" key={lane.id}>
                  <div
                    className={`board-column${dropTarget?.laneId === lane.id ? " is-drop-target" : ""}${draggedLaneId === lane.id ? " is-lane-dragging" : ""}${laneDropTarget?.laneId === lane.id ? " is-lane-drop-target" : ""}${laneDropTarget?.laneId === lane.id && laneDropTarget.insertAfter ? " is-lane-drop-after" : ""}${laneDropTarget?.laneId === lane.id && !laneDropTarget.insertAfter ? " is-lane-drop-before" : ""}`}
                    data-testid={`board-column-${lane.id}`}
                    onDoubleClick={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest("button, input, textarea, form, a")) {
                        return;
                      }

                      openComposer(lane.id);
                    }}
                    onDragLeave={(event) => {
                      if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
                        setLaneDropTarget((current) => (current?.laneId === lane.id ? null : current));
                      }
                    }}
                    onDragOver={(event) => handleLaneDragOver(event, lane)}
                    onDrop={(event) => {
                      if (!draggedLaneId) {
                        return;
                      }

                      event.preventDefault();
                      event.stopPropagation();
                      handleLaneDrop();
                    }}
                    style={itemStyle(laneIndex)}
                  >
                    <LaneHeader
                      destinationLanes={lanes.filter((candidate) => candidate.id !== lane.id)}
                      isDeletePending={deleteLaneMutation.isPending}
                      isDragDisabled={isLaneDragDisabled}
                      isProtected={lane.isProtectedLane}
                      isTaskDeletePending={deleteTaskMutation.isPending}
                      isTaskDragging={draggedTaskId !== null}
                      lane={lane}
                      onCancelTaskDelete={() => {
                        setPendingDeleteTaskId(null);
                        setPendingDeleteTaskLaneId(null);
                      }}
                      onDelete={(destinationLaneId) =>
                        deleteLaneMutation.mutate({
                          laneId: lane.id,
                          destinationLaneId
                        })
                      }
                      onConfirmTaskDelete={(taskId) => deleteTaskMutation.mutate(taskId)}
                      onDragEnd={() => clearLaneDrag()}
                      onDragStart={handleLaneDragStart}
                      pendingTaskDelete={pendingDeleteTaskLaneId === lane.id ? pendingDeleteTask : null}
                    />
                    <LaneDropArea laneId={lane.id}>
                      <SortableContext
                        items={lane.tasks.map((taskGroup) => taskGroup.task.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {composerLaneId === lane.id ? (
                          <form
                            className="lane-composer"
                            data-testid={`lane-composer-${lane.id}`}
                            onDoubleClick={(event) => event.stopPropagation()}
                            onSubmit={(event) => {
                              event.preventDefault();
                              createTaskMutation.mutate({
                                laneId: lane.id,
                                title: draftTitle.trim()
                              });
                            }}
                          >
                            <label className="field">
                              <input
                                aria-label={getTaskInputLabel(lane.name)}
                                autoFocus
                                maxLength={240}
                                onChange={(event) => setDraftTitle(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    closeComposer();
                                  }
                                }}
                                placeholder={`Add to ${lane.name}`}
                                required
                                value={draftTitle}
                              />
                            </label>
                            <div className="lane-composer__actions">
                              <button
                                className="primary-button"
                                disabled={createTaskMutation.isPending || draftTitle.trim().length === 0}
                                type="submit"
                              >
                                {createTaskMutation.isPending ? "Adding..." : "Add task"}
                              </button>
                              <button className="text-button" onClick={() => closeComposer()} type="button">
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : null}
                        <TaskDropSlot
                          isVisible={Boolean(draggedTaskId) && !lane.isDoneLane}
                          laneId={lane.id}
                          parentTaskId={null}
                          position={0}
                        />
                        {lane.displayTasks.map((taskGroup, taskIndex) => (
                          <div key={taskGroup.task.id}>
                            <TaskCard
                              activeTagKey={activeTagKey}
                              displaySubtasks={taskGroup.displaySubtasks}
                              isDragDisabled={isDragDisabled}
                              isNestTarget={
                                dropTarget?.kind === "nest" && dropTarget.taskId === taskGroup.task.id
                              }
                              laneId={lane.id}
                              onOpen={(taskToEdit) => setEditingTaskId(taskToEdit.id)}
                              onTagSelect={handleTagSelect}
                              showNestTarget={
                                draggedTask !== null &&
                                !lane.isDoneLane &&
                                draggedTask.id !== taskGroup.task.id &&
                                canTaskNestUnderParent(activeTasks, draggedTask, taskGroup.task.id)
                              }
                              showSubtaskSlots={Boolean(draggedTaskId) && !lane.isDoneLane}
                              subtasks={taskGroup.subtasks}
                              task={taskGroup.task}
                              taskIndex={taskIndex}
                            />
                            <TaskDropSlot
                              isVisible={Boolean(draggedTaskId) && !lane.isDoneLane}
                              laneId={lane.id}
                              parentTaskId={null}
                              position={taskIndex + 1}
                            />
                          </div>
                        ))}
                      </SortableContext>
                    </LaneDropArea>
                  </div>
                  <button
                    aria-label={gapLabel}
                    className="board-lane-gap"
                    data-testid={`create-lane-gap-after-${lane.id}`}
                    onDoubleClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      openCreateLaneDialog();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openCreateLaneDialog();
                      }
                    }}
                    title="Double-click to create a lane"
                    type="button"
                  >
                    <span aria-hidden="true" className="board-lane-gap__marker">
                      +
                    </span>
                  </button>
                </div>
              );
            })}
          </section>
          <DragOverlay dropAnimation={taskDropAnimation}>
            {draggedTask ? (
              <div
                className="task-drag-overlay"
                style={taskDragPreviewWidth ? { width: `${taskDragPreviewWidth}px` } : undefined}
              >
                <TaskCardPreview activeTagKey={activeTagKey} task={draggedTask} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}
    </main>
  );
}
