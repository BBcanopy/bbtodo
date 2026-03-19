import { type DragEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCorners,
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { CSS } from "@dnd-kit/utilities";

import { api, type BoardLane, type Task } from "../api";
import {
  formatIsoDate,
  formatTagInput,
  getTaskInputLabel,
  itemStyle,
  normalizeTagKey,
  parseTagInput
} from "../app/utils";
import { BoardSkeleton, EmptyState, ErrorBanner } from "../components/ui";
import { useDismissableLayer } from "../hooks/useDismissableLayer";

type TaskIdsByLane = Record<string, string[]>;

function compareTasks(left: Task, right: Task) {
  if (left.position !== right.position) {
    return left.position - right.position;
  }

  return left.updatedAt < right.updatedAt ? 1 : -1;
}

function buildTaskIdsByLane(lanes: BoardLane[], tasks: Task[]) {
  const taskIdsByLane = Object.fromEntries(lanes.map((lane) => [lane.id, [] as string[]])) satisfies TaskIdsByLane;

  tasks
    .slice()
    .sort(compareTasks)
    .forEach((task) => {
      if (!task.laneId || !(task.laneId in taskIdsByLane)) {
        return;
      }

      taskIdsByLane[task.laneId].push(task.id);
    });

  return taskIdsByLane;
}

function findTaskLocation(taskIdsByLane: TaskIdsByLane, taskId: string) {
  for (const [laneId, taskIds] of Object.entries(taskIdsByLane)) {
    const index = taskIds.indexOf(taskId);
    if (index !== -1) {
      return { index, laneId };
    }
  }

  return null;
}

function moveTaskId(
  taskIdsByLane: TaskIdsByLane,
  taskId: string,
  targetLaneId: string,
  targetIndex: number
) {
  const source = findTaskLocation(taskIdsByLane, taskId);
  if (!source || !(targetLaneId in taskIdsByLane)) {
    return taskIdsByLane;
  }

  const nextTaskIdsByLane = Object.fromEntries(
    Object.entries(taskIdsByLane).map(([laneId, taskIds]) => [laneId, [...taskIds]])
  ) satisfies TaskIdsByLane;

  nextTaskIdsByLane[source.laneId].splice(source.index, 1);
  const destinationTaskIds = nextTaskIdsByLane[targetLaneId];
  const normalizedTargetIndex =
    source.laneId === targetLaneId && source.index < targetIndex ? targetIndex - 1 : targetIndex;
  const clampedTargetIndex = Math.max(0, Math.min(normalizedTargetIndex, destinationTaskIds.length));

  if (source.laneId === targetLaneId && source.index === clampedTargetIndex) {
    return taskIdsByLane;
  }

  destinationTaskIds.splice(clampedTargetIndex, 0, taskId);
  return nextTaskIdsByLane;
}

function LaneDropArea({
  children,
  laneId
}: {
  children: ReactNode;
  laneId: string;
}) {
  const { setNodeRef } = useDroppable({
    id: `lane:${laneId}`,
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
  position
}: {
  isVisible: boolean;
  laneId: string;
  position: number;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `slot:${laneId}:${position}`,
    data: {
      laneId,
      position,
      type: "slot"
    }
  });

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className={`task-drop-indicator${isOver ? " is-active" : ""}`}
      data-testid={`task-drop-indicator-${laneId}-${position}`}
      ref={setNodeRef}
    >
      <span>Drop here</span>
    </div>
  );
}

function TaskCard({
  isDragDisabled,
  laneId,
  onDelete,
  onOpen,
  onTagSelect,
  activeTagKeys,
  task,
  taskIndex
}: {
  activeTagKeys: Set<string>;
  isDragDisabled: boolean;
  laneId: string;
  onDelete: (taskId: string) => void;
  onOpen: (task: Task) => void;
  onTagSelect: (tag: string) => void;
  task: Task;
  taskIndex: number;
}) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const confirmRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: isDragDisabled,
    data: {
      laneId,
      taskId: task.id,
      type: "task"
    }
  });

  useDismissableLayer(isConfirmOpen, confirmRef, () => setIsConfirmOpen(false));

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
      {...attributes}
      {...listeners}
      className={`task-card${isDragDisabled ? "" : " is-draggable"}${isConfirmOpen ? " is-confirm-open" : ""}${isDragging ? " is-dragging" : ""}`}
      data-testid={`task-card-${task.id}`}
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
      ref={setNodeRef}
      role="button"
      style={{
        ...itemStyle(taskIndex),
        transform: CSS.Transform.toString(transform),
        transition
      }}
      tabIndex={0}
    >
      <div className="task-card__meta">
        <time className="task-card__timestamp" dateTime={task.updatedAt}>
          {formatIsoDate(task.updatedAt)}
        </time>
        <div className="task-card__delete-menu" ref={confirmRef}>
          <button
            aria-expanded={isConfirmOpen}
            aria-label={`Delete task ${task.title}`}
            className="icon-button danger-button"
            data-no-dnd="true"
            onClick={(event) => {
              event.stopPropagation();
              setIsConfirmOpen((current) => !current);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            <span aria-hidden="true">x</span>
          </button>
          {isConfirmOpen ? (
            <div
              className="task-delete-popover"
              data-no-dnd="true"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              role="alertdialog"
            >
              <p>Delete this task?</p>
              <div className="task-delete-popover__actions">
                <button
                  className="text-button"
                  data-no-dnd="true"
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
                  data-no-dnd="true"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsConfirmOpen(false);
                    onDelete(task.id);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <p className="task-card__title">{task.title}</p>
      {task.tags.length > 0 ? (
        <div className="task-card__tags">
          {task.tags.map((tag) => (
            <button
              className={`task-tag${activeTagKeys.has(normalizeTagKey(tag)) ? " is-active" : ""}`}
              data-no-dnd="true"
              key={tag}
              onClick={(event) => {
                event.stopPropagation();
                onTagSelect(tag);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function TaskEditorDialog({
  error,
  isPending,
  onClose,
  onSave,
  task
}: {
  error: Error | null;
  isPending: boolean;
  onClose: () => void;
  onSave: (input: { body: string; tags: string[]; title: string }) => void;
  task: Task;
}) {
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.body);
  const [tagsInput, setTagsInput] = useState(formatTagInput(task.tags));
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);

  useEffect(() => {
    setTitle(task.title);
    setBody(task.body);
    setTagsInput(formatTagInput(task.tags));
    setIsPreviewVisible(false);
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
            <span aria-hidden="true">x</span>
          </button>
        </div>
        <form
          className="dialog-form task-editor"
          onSubmit={(event) => {
            event.preventDefault();
            onSave({
              body,
              tags: parseTagInput(tagsInput),
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
            <label className="field">
              <span className="field__label">Tags</span>
              <input
                aria-label="Task tags"
                maxLength={240}
                onChange={(event) => setTagsInput(event.target.value)}
                placeholder="bug, docs, release"
                value={tagsInput}
              />
            </label>
            <div className="field field--editor">
              <div className="task-editor__field-header">
                <span className="field__label">Body</span>
                <button
                  aria-controls="task-markdown-preview"
                  aria-expanded={isPreviewVisible}
                  className="micro-button"
                  onClick={() => setIsPreviewVisible((current) => !current)}
                  type="button"
                >
                  {isPreviewVisible ? "Hide markdown" : "Render markdown"}
                </button>
              </div>
              <textarea
                aria-label="Task body"
                maxLength={12000}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Write markdown here"
                rows={12}
                value={body}
              />
            </div>
            {isPreviewVisible ? (
              <div className="task-editor__preview-inline">
                <div className="markdown-preview" data-testid="task-markdown-preview" id="task-markdown-preview">
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
  const [taskDragOrder, setTaskDragOrder] = useState<TaskIdsByLane | null>(null);
  const [laneDropTarget, setLaneDropTarget] = useState<{
    insertAfter: boolean;
    laneId: string;
    position: number;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ laneId: string; position: number } | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [laneName, setLaneName] = useState("");
  const taskDragOrderRef = useRef<TaskIdsByLane | null>(null);

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

  const isCreateLaneDialogOpen = searchParams.get("createLane") === "1";
  const boardSearch = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const activeTagFilters = parseTagInput(searchParams.get("tags") ?? "");
  const activeTagKeys = new Set(activeTagFilters.map((tag) => normalizeTagKey(tag)));
  const project = projectsQuery.data?.find((candidate) => candidate.id === projectId);
  const lanes = lanesQuery.data ?? project?.laneSummaries ?? [];
  const tasks = tasksQuery.data ?? [];
  const draggedLane = draggedLaneId ? lanes.find((lane) => lane.id === draggedLaneId) ?? null : null;
  const editingTask = editingTaskId ? tasks.find((task) => task.id === editingTaskId) ?? null : null;
  const isBoardFiltered = boardSearch.length > 0 || activeTagKeys.size > 0;
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const orderedTaskIdsByLane = useMemo(() => buildTaskIdsByLane(lanes, tasks), [lanes, tasks]);
  const previewTaskIdsByLane = taskDragOrder ?? orderedTaskIdsByLane;
  const taskSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  );

  function taskMatchesBoardFilters(task: Task) {
    const haystack = `${task.title}\n${task.body}\n${task.tags.join("\n")}`.toLowerCase();
    const matchesSearch = !boardSearch || haystack.includes(boardSearch);
    if (!matchesSearch) {
      return false;
    }

    if (activeTagKeys.size === 0) {
      return true;
    }

    const taskTagKeys = new Set(task.tags.map((tag) => normalizeTagKey(tag)));
    return Array.from(activeTagKeys).every((tag) => taskTagKeys.has(tag));
  }

  const groupedTasks = lanes.map((lane) => ({
    ...lane,
    displayTasks: (previewTaskIdsByLane[lane.id] ?? [])
      .map((taskId) => taskMap.get(taskId))
      .filter((task): task is Task => Boolean(task))
      .filter((task) => taskMatchesBoardFilters(task)),
    tasks: (previewTaskIdsByLane[lane.id] ?? [])
      .map((taskId) => taskMap.get(taskId))
      .filter((task): task is Task => Boolean(task))
  }));

  async function invalidateBoardData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] }),
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
    mutationFn: ({ laneId, position, taskId }: { laneId: string; position: number; taskId: string }) =>
      api.updateTask(projectId ?? "", taskId, { laneId, position }),
    onSuccess: async () => {
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

  const saveTaskMutation = useMutation({
    mutationFn: ({
      body,
      tags,
      taskId,
      title
    }: {
      body: string;
      tags: string[];
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
      await invalidateBoardData();
    }
  });
  const isDragDisabled =
    isBoardFiltered ||
    moveTaskMutation.isPending ||
    moveLaneMutation.isPending ||
    saveTaskMutation.isPending ||
    draggedLaneId !== null;
  const isLaneDragDisabled = moveLaneMutation.isPending || draggedTaskId !== null;

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

  function updateTagFilters(tags: string[]) {
    updateBoardParams((params) => {
      const nextValue = formatTagInput(tags);
      if (nextValue) {
        params.set("tags", nextValue);
      } else {
        params.delete("tags");
      }
    });
  }

  function handleTagSelect(tag: string) {
    if (activeTagKeys.has(normalizeTagKey(tag))) {
      return;
    }

    updateTagFilters([...activeTagFilters, tag]);
  }

  function clearLaneDrag() {
    setDraggedLaneId(null);
    setLaneDropTarget(null);
  }

  function clearTaskDrag() {
    setDraggedTaskId(null);
    setDropTarget(null);
    setTaskDragOrder(null);
    taskDragOrderRef.current = null;
  }

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
    const nextTaskOrder = buildTaskIdsByLane(lanes, tasks);
    const source = findTaskLocation(nextTaskOrder, activeTaskId);

    setDraggedTaskId(activeTaskId);
    setTaskDragOrder(nextTaskOrder);
    taskDragOrderRef.current = nextTaskOrder;
    setDropTarget(source ? { laneId: source.laneId, position: source.index } : null);
  }

  function handleTaskDragOver(event: DragOverEvent) {
    if (!draggedTaskId || isDragDisabled || !event.over) {
      return;
    }

    const activeTaskId = String(event.active.id);
    const currentTaskOrder = taskDragOrder ?? orderedTaskIdsByLane;
    const overData = event.over.data.current;
    if (!overData) {
      return;
    }

    let targetLaneId: string | null = null;
    let targetIndex: number | null = null;

    if (overData.type === "slot") {
      targetLaneId = String(overData.laneId);
      targetIndex = Number(overData.position);
    }

    if (overData.type === "lane") {
      targetLaneId = String(overData.laneId);
      targetIndex = currentTaskOrder[targetLaneId]?.length ?? 0;
    }

    if (overData.type === "task") {
      targetLaneId = String(overData.laneId);
      const overTaskId = String(overData.taskId);
      const overIndex = currentTaskOrder[targetLaneId]?.indexOf(overTaskId) ?? -1;
      if (overIndex !== -1) {
        const translated = event.active.rect.current.translated;
        const isBelowOverItem =
          translated !== null && translated.top > event.over.rect.top + event.over.rect.height / 2;
        targetIndex = overIndex + (isBelowOverItem ? 1 : 0);
      }
    }

    if (targetLaneId === null || targetIndex === null) {
      return;
    }

    const nextTaskOrder = moveTaskId(currentTaskOrder, activeTaskId, targetLaneId, targetIndex);
    const nextLocation = findTaskLocation(nextTaskOrder, activeTaskId);
    if (!nextLocation) {
      return;
    }

    setTaskDragOrder(nextTaskOrder);
    taskDragOrderRef.current = nextTaskOrder;
    setDropTarget({
      laneId: nextLocation.laneId,
      position: nextLocation.index
    });
  }

  function handleTaskDragEnd(event: DragEndEvent) {
    const activeTaskId = String(event.active.id);
    const currentTaskOrder = taskDragOrderRef.current ?? taskDragOrder ?? orderedTaskIdsByLane;
    const source = findTaskLocation(orderedTaskIdsByLane, activeTaskId);
    const destination = findTaskLocation(currentTaskOrder, activeTaskId);

    clearTaskDrag();
    if (!source || !destination) {
      return;
    }

    if (source.laneId === destination.laneId && source.index === destination.index) {
      return;
    }

    moveTaskMutation.mutate({
      laneId: destination.laneId,
      position: destination.index,
      taskId: activeTaskId
    });
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
                <span aria-hidden="true">x</span>
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
                <span className="field__label">Lane name</span>
                <input
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
          collisionDetection={closestCorners}
          onDragCancel={clearTaskDrag}
          onDragEnd={handleTaskDragEnd}
          onDragOver={handleTaskDragOver}
          onDragStart={handleTaskDragStart}
          sensors={taskSensors}
        >
          <section className="board-grid board-grid--lanes" data-testid="board-grid">
            {groupedTasks.map((lane, laneIndex) => (
              <div
                className={`board-column${dropTarget?.laneId === lane.id ? " is-drop-target" : ""}${draggedLaneId === lane.id ? " is-lane-dragging" : ""}${laneDropTarget?.laneId === lane.id ? " is-lane-drop-target" : ""}${laneDropTarget?.laneId === lane.id && laneDropTarget.insertAfter ? " is-lane-drop-after" : ""}${laneDropTarget?.laneId === lane.id && !laneDropTarget.insertAfter ? " is-lane-drop-before" : ""}`}
                data-testid={`board-column-${lane.systemKey ?? lane.id}`}
                key={lane.id}
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
                <div className="board-column__header">
                  <div>
                    <h2>{lane.name}</h2>
                  </div>
                  <button
                    aria-label={`Reorder lane ${lane.name}`}
                    className="lane-drag-handle"
                    draggable={!isLaneDragDisabled}
                    onClick={(event) => event.stopPropagation()}
                    onDragEnd={() => clearLaneDrag()}
                    onDragStart={(event) => {
                      event.stopPropagation();
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", lane.id);
                      setDraggedLaneId(lane.id);
                      setLaneDropTarget(null);
                    }}
                    type="button"
                  >
                    <span aria-hidden="true">::</span>
                  </button>
                </div>
                <LaneDropArea laneId={lane.id}>
                  <SortableContext items={lane.tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
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
                          <span className="field__label">New task</span>
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
                    <TaskDropSlot isVisible={Boolean(draggedTaskId)} laneId={lane.id} position={0} />
                    {lane.displayTasks.map((task, taskIndex) => (
                      <div key={task.id}>
                        <TaskCard
                          activeTagKeys={activeTagKeys}
                          isDragDisabled={isDragDisabled}
                          laneId={lane.id}
                          onDelete={(taskId) => deleteTaskMutation.mutate(taskId)}
                          onOpen={(taskToEdit) => setEditingTaskId(taskToEdit.id)}
                          onTagSelect={handleTagSelect}
                          task={task}
                          taskIndex={taskIndex}
                        />
                        <TaskDropSlot
                          isVisible={Boolean(draggedTaskId)}
                          laneId={lane.id}
                          position={taskIndex + 1}
                        />
                      </div>
                    ))}
                  </SortableContext>
                </LaneDropArea>
              </div>
            ))}
          </section>
        </DndContext>
      ) : null}
    </main>
  );
}
