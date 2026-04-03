import type { BoardLane, Task } from "../api";
import { isDoneLaneName } from "../app/utils";

export type TaskLocation = {
  laneId: string;
  parentTaskId: string | null;
  position: number;
};

export type TaskCardDropPosition = "before" | "after";

export type TaskDragPreview = {
  kind: "nest" | "reorder";
  moveTarget: TaskLocation;
  nestParentTaskId: string | null;
  slot: TaskLocation & {
    id: string;
    interactive: boolean;
  };
  targetTaskId: string | null;
  taskDropPosition: TaskCardDropPosition | null;
};

export type TaskDragOverData = {
  activeCenterY?: number | null;
  laneId?: string | null;
  parentTaskId?: string | null;
  position?: number | null;
  rectHeight?: number | null;
  rectTop?: number | null;
  taskId?: string | null;
  type: "lane" | "nest-target" | "slot" | "task" | "trash";
};

export type PendingTaskMove = {
  affectedTaskIds: string[];
  laneId: string;
  parentTaskId: string | null;
  position: number;
  previewUpdatedAt?: string | null;
  submittedAt: number;
  taskId: string;
};

export function getTaskDropSlotId(laneId: string, parentTaskId: string | null, position: number) {
  return `slot:${laneId}:${parentTaskId ?? "root"}:${position}`;
}

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

export function getTaskPreviewUpdatedAt(tasks: Task[]) {
  const latestUpdatedAt = tasks.reduce((currentLatest, task) => {
    const parsedUpdatedAt = Date.parse(task.updatedAt);
    if (Number.isNaN(parsedUpdatedAt)) {
      return currentLatest;
    }

    return Math.max(currentLatest, parsedUpdatedAt);
  }, Date.now());

  return new Date(latestUpdatedAt + 1).toISOString();
}

export function getTaskMoveAffectedTaskIds(tasks: Task[], taskId: string) {
  const sourceTask = tasks.find((task) => task.id === taskId);
  if (!sourceTask || sourceTask.parentTaskId !== null) {
    return [taskId];
  }

  return [
    taskId,
    ...tasks.filter((task) => task.parentTaskId === taskId).map((task) => task.id)
  ];
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

export function buildTopLevelTaskIdsByLane(lanes: BoardLane[], tasks: Task[]) {
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

export function buildSubtaskIdsByParent(tasks: Task[], lanesById: Map<string, BoardLane>) {
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

export function canTaskBecomeSubtask(tasks: Task[], task: Task) {
  return task.parentTaskId === null && !taskHasSubtasks(tasks, task.id);
}

export function canTaskNestUnderParent(tasks: Task[], task: Task, parentTaskId: string | null) {
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

export function canTaskJoinParentGroup(tasks: Task[], task: Task, parentTaskId: string | null) {
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

export function findTaskLocation(tasks: Task[], taskId: string) {
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

export function applyTaskMove(
  tasks: Task[],
  taskId: string,
  targetLaneId: string,
  targetParentTaskId: string | null,
  targetIndex: number,
  lanesById: Map<string, BoardLane>,
  previewUpdatedAt?: string | null
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
  const targetUsesDoneOrdering = isDoneLaneName(lanesById.get(targetLaneId)?.name ?? "");
  const donePreviewUpdatedAt =
    sourceTask.laneId !== targetLaneId && targetUsesDoneOrdering
      ? previewUpdatedAt ?? getTaskPreviewUpdatedAt(tasks)
      : null;
  const nextSiblingTasks = listSiblingTasks(
    tasks,
    targetLaneId,
    targetParentTaskId,
    targetUsesDoneOrdering,
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
      if (donePreviewUpdatedAt !== null && nextTask.updatedAt !== donePreviewUpdatedAt) {
        nextTask = {
          ...nextTask,
          updatedAt: donePreviewUpdatedAt
        };
      }
    } else if (
      sourceTask.parentTaskId === null &&
      task.parentTaskId === sourceTask.id &&
      task.laneId !== targetLaneId
    ) {
      nextTask = {
        ...nextTask,
        laneId: targetLaneId
      };
      if (donePreviewUpdatedAt !== null && nextTask.updatedAt !== donePreviewUpdatedAt) {
        nextTask = {
          ...nextTask,
          updatedAt: donePreviewUpdatedAt
        };
      }
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
      nextTask.position === task.position &&
      nextTask.updatedAt === task.updatedAt
    ) {
      return task;
    }

    hasChanges = true;
    return nextTask;
  });

  return hasChanges ? nextTasks : tasks;
}

export function applyPendingTaskMoves(
  tasks: Task[],
  pendingMoves: ReadonlyArray<PendingTaskMove>,
  lanesById: Map<string, BoardLane>
) {
  if (pendingMoves.length === 0) {
    return tasks;
  }

  return [...pendingMoves]
    .sort((left, right) => left.submittedAt - right.submittedAt)
    .reduce(
      (nextTasks, pendingMove) =>
        applyTaskMove(
          nextTasks,
          pendingMove.taskId,
          pendingMove.laneId,
          pendingMove.parentTaskId,
          pendingMove.position,
          lanesById,
          pendingMove.previewUpdatedAt
        ),
      tasks
    );
}

export function wouldTaskMoveChangePosition(
  tasks: Task[],
  taskId: string,
  targetLaneId: string,
  targetParentTaskId: string | null,
  targetIndex: number,
  lanesById: Map<string, BoardLane>
) {
  const sourceTask = tasks.find((task) => task.id === taskId);
  if (!sourceTask || !sourceTask.laneId) {
    return false;
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
  const targetSiblings = listSiblingTasks(
    tasks,
    targetLaneId,
    targetParentTaskId,
    isDoneLaneName(lanesById.get(targetLaneId)?.name ?? ""),
    taskId
  );
  const normalizedTargetIndex =
    sameGroup && sourceIndex !== -1 && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  const clampedTargetIndex = Math.max(0, Math.min(normalizedTargetIndex, targetSiblings.length));

  return !sameGroup || sourceIndex !== clampedTargetIndex;
}

function wouldDropReorderWithinGroup(
  taskIds: string[],
  draggedTaskId: string,
  targetTaskId: string,
  position: TaskCardDropPosition
) {
  const draggedIndex = taskIds.indexOf(draggedTaskId);
  const targetIndex = taskIds.indexOf(targetTaskId);
  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
    return draggedIndex < 0 && targetIndex >= 0;
  }

  if (position === "before") {
    return draggedIndex !== targetIndex - 1;
  }

  return draggedIndex !== targetIndex + 1;
}

export function normalizeTaskCardDropTarget(
  taskIds: string[],
  draggedTaskId: string,
  targetTaskId: string,
  position: TaskCardDropPosition
): { position: TaskCardDropPosition; targetTaskId: string } | null {
  let nextTargetTaskId = targetTaskId;
  let nextPosition = position;

  if (targetTaskId === draggedTaskId) {
    const draggedIndex = taskIds.indexOf(draggedTaskId);
    if (draggedIndex < 0) {
      return null;
    }

    if (position === "before") {
      if (draggedIndex === 0) {
        return null;
      }

      nextTargetTaskId = taskIds[draggedIndex - 1];
      nextPosition = "after";
    } else {
      if (draggedIndex === taskIds.length - 1) {
        return null;
      }

      nextTargetTaskId = taskIds[draggedIndex + 1];
      nextPosition = "before";
    }
  }

  if (wouldDropReorderWithinGroup(taskIds, draggedTaskId, nextTargetTaskId, nextPosition)) {
    return {
      position: nextPosition,
      targetTaskId: nextTargetTaskId
    };
  }

  return {
    position: nextPosition === "before" ? "after" : "before",
    targetTaskId: nextTargetTaskId
  };
}

function laneUsesDoneOrdering(lanesById: Map<string, BoardLane>, laneId: string) {
  return isDoneLaneName(lanesById.get(laneId)?.name ?? "");
}

function createReorderPreview(
  taskId: string,
  tasks: Task[],
  lanesById: Map<string, BoardLane>,
  moveTarget: TaskLocation,
  options?: {
    interactiveSlot?: boolean;
    nestParentTaskId?: string | null;
    slot?: TaskLocation;
    targetTaskId?: string | null;
    taskDropPosition?: TaskCardDropPosition | null;
  }
): TaskDragPreview | null {
  if (
    !wouldTaskMoveChangePosition(
      tasks,
      taskId,
      moveTarget.laneId,
      moveTarget.parentTaskId,
      moveTarget.position,
      lanesById
    )
  ) {
    return null;
  }

  const slotTarget = options?.slot ?? moveTarget;

  return {
    kind: options?.nestParentTaskId ? "nest" : "reorder",
    moveTarget,
    nestParentTaskId: options?.nestParentTaskId ?? null,
    slot: {
      ...slotTarget,
      id: getTaskDropSlotId(slotTarget.laneId, slotTarget.parentTaskId, slotTarget.position),
      interactive: options?.interactiveSlot ?? true
    },
    targetTaskId: options?.targetTaskId ?? null,
    taskDropPosition: options?.taskDropPosition ?? null
  };
}

function resolveTaskLanePreview(
  activeTask: Task,
  tasks: Task[],
  lanesById: Map<string, BoardLane>,
  targetLaneId: string,
  topLevelTaskIdsByLane: Record<string, string[]>,
  overData: TaskDragOverData
) {
  if (!lanesById.has(targetLaneId)) {
    return null;
  }

  if (laneUsesDoneOrdering(lanesById, targetLaneId)) {
    if (activeTask.laneId === targetLaneId) {
      return null;
    }

    const topLevelTaskIds = topLevelTaskIdsByLane[targetLaneId] ?? [];
    return createReorderPreview(
      activeTask.id,
      tasks,
      lanesById,
      {
        laneId: targetLaneId,
        parentTaskId: null,
        position: topLevelTaskIds.length
      },
      {
        interactiveSlot: false,
        slot: {
          laneId: targetLaneId,
          parentTaskId: null,
          position: 0
        },
        targetTaskId: topLevelTaskIds[0] ?? null,
        taskDropPosition: topLevelTaskIds.length > 0 ? "before" : null
      }
    );
  }

  const laneTaskIds = topLevelTaskIdsByLane[targetLaneId] ?? [];
  if (laneTaskIds.length === 0) {
    return createReorderPreview(activeTask.id, tasks, lanesById, {
      laneId: targetLaneId,
      parentTaskId: null,
      position: 0
    });
  }

  const rectTop = typeof overData.rectTop === "number" ? overData.rectTop : null;
  const rectHeight = typeof overData.rectHeight === "number" ? overData.rectHeight : null;
  const activeCenterY = typeof overData.activeCenterY === "number" ? overData.activeCenterY : null;
  if (rectTop === null || rectHeight === null || rectHeight <= 0 || activeCenterY === null) {
    return null;
  }

  const relativeCenterY = Math.max(0, activeCenterY - rectTop);
  const normalizedIndex = Math.round((relativeCenterY / rectHeight) * laneTaskIds.length);

  return createReorderPreview(activeTask.id, tasks, lanesById, {
    laneId: targetLaneId,
    parentTaskId: null,
    position: Math.max(0, Math.min(normalizedIndex, laneTaskIds.length))
  });
}

function resolveTaskCardPreview(
  activeTask: Task,
  tasks: Task[],
  lanesById: Map<string, BoardLane>,
  targetLaneId: string,
  overTaskId: string,
  topLevelTaskIdsByLane: Record<string, string[]>,
  subtaskIdsByParent: Map<string, string[]>,
  overData: TaskDragOverData
) {
  if (!lanesById.has(targetLaneId)) {
    return null;
  }

  if (laneUsesDoneOrdering(lanesById, targetLaneId)) {
    if (activeTask.laneId === targetLaneId) {
      return null;
    }

    const topLevelTaskIds = topLevelTaskIdsByLane[targetLaneId] ?? [];
    return createReorderPreview(
      activeTask.id,
      tasks,
      lanesById,
      {
        laneId: targetLaneId,
        parentTaskId: null,
        position: topLevelTaskIds.length
      },
      {
        interactiveSlot: false,
        slot: {
          laneId: targetLaneId,
          parentTaskId: null,
          position: 0
        },
        targetTaskId: topLevelTaskIds[0] ?? null,
        taskDropPosition: topLevelTaskIds.length > 0 ? "before" : null
      }
    );
  }

  const overTask = tasks.find((task) => task.id === overTaskId);
  if (!overTask || !overTask.laneId) {
    return null;
  }

  const activeTaskCanBecomeSubtask = canTaskBecomeSubtask(tasks, activeTask);
  if (activeTask.parentTaskId === overTaskId) {
    return null;
  }

  if (activeTaskCanBecomeSubtask) {
    if (canTaskNestUnderParent(tasks, activeTask, overTaskId)) {
      const position = (subtaskIdsByParent.get(overTaskId) ?? []).length;

      return createReorderPreview(
        activeTask.id,
        tasks,
        lanesById,
        {
          laneId: targetLaneId,
          parentTaskId: overTaskId,
          position
        },
        {
          interactiveSlot: false,
          nestParentTaskId: overTaskId
        }
      );
    }

    if (overTask.parentTaskId !== null) {
      return null;
    }
  }

  const targetParentTaskId = overTask.parentTaskId ?? null;
  if (!canTaskJoinParentGroup(tasks, activeTask, targetParentTaskId)) {
    return null;
  }

  const rectTop = typeof overData.rectTop === "number" ? overData.rectTop : null;
  const rectHeight = typeof overData.rectHeight === "number" ? overData.rectHeight : null;
  const activeCenterY = typeof overData.activeCenterY === "number" ? overData.activeCenterY : null;
  if (rectTop === null || rectHeight === null || rectHeight <= 0 || activeCenterY === null) {
    return null;
  }

  const siblingTaskIds =
    targetParentTaskId === null
      ? topLevelTaskIdsByLane[targetLaneId] ?? []
      : subtaskIdsByParent.get(targetParentTaskId) ?? [];
  const preferredPosition =
    activeCenterY > rectTop + rectHeight / 2 ? "after" : "before";
  const normalizedDropTarget = normalizeTaskCardDropTarget(
    siblingTaskIds,
    activeTask.id,
    overTaskId,
    preferredPosition
  );
  if (!normalizedDropTarget) {
    return null;
  }

  const targetIndex = siblingTaskIds.indexOf(normalizedDropTarget.targetTaskId);
  if (targetIndex < 0) {
    return null;
  }

  return createReorderPreview(
    activeTask.id,
    tasks,
    lanesById,
    {
      laneId: targetLaneId,
      parentTaskId: targetParentTaskId,
      position: targetIndex + (normalizedDropTarget.position === "after" ? 1 : 0)
    },
    {
      targetTaskId: normalizedDropTarget.targetTaskId,
      taskDropPosition: normalizedDropTarget.position
    }
  );
}

export function resolveTaskDragPreview(args: {
  activeTaskId: string;
  lanesById: Map<string, BoardLane>;
  overData: TaskDragOverData | null;
  subtaskIdsByParent: Map<string, string[]>;
  tasks: Task[];
  topLevelTaskIdsByLane: Record<string, string[]>;
}) {
  const activeTask = args.tasks.find((task) => task.id === args.activeTaskId);
  if (!activeTask || !activeTask.laneId || !args.overData) {
    return null;
  }

  if (args.overData.type === "trash") {
    return null;
  }

  if (args.overData.type === "slot") {
    const targetLaneId = typeof args.overData.laneId === "string" ? args.overData.laneId : null;
    const targetPosition =
      typeof args.overData.position === "number" && Number.isFinite(args.overData.position)
        ? Math.max(0, args.overData.position)
        : null;
    if (targetLaneId === null || targetPosition === null || laneUsesDoneOrdering(args.lanesById, targetLaneId)) {
      return null;
    }

    const targetParentTaskId =
      typeof args.overData.parentTaskId === "string" ? args.overData.parentTaskId : null;
    const activeTaskCanBecomeSubtask = canTaskBecomeSubtask(args.tasks, activeTask);
    if (
      activeTaskCanBecomeSubtask &&
      targetParentTaskId !== null &&
      canTaskNestUnderParent(args.tasks, activeTask, targetParentTaskId)
    ) {
      const position = (args.subtaskIdsByParent.get(targetParentTaskId) ?? []).length;

      return createReorderPreview(
        activeTask.id,
        args.tasks,
        args.lanesById,
        {
          laneId: targetLaneId,
          parentTaskId: targetParentTaskId,
          position
        },
        {
          interactiveSlot: false,
          nestParentTaskId: targetParentTaskId
        }
      );
    }

    if (!canTaskJoinParentGroup(args.tasks, activeTask, targetParentTaskId)) {
      return null;
    }

    return createReorderPreview(
      activeTask.id,
      args.tasks,
      args.lanesById,
      {
        laneId: targetLaneId,
        parentTaskId: targetParentTaskId,
        position: targetPosition
      },
      {
        nestParentTaskId:
          targetParentTaskId !== null &&
          activeTask.parentTaskId !== targetParentTaskId &&
          canTaskNestUnderParent(args.tasks, activeTask, targetParentTaskId)
            ? targetParentTaskId
            : null
      }
    );
  }

  if (args.overData.type === "lane") {
    const targetLaneId = typeof args.overData.laneId === "string" ? args.overData.laneId : null;
    if (targetLaneId === null) {
      return null;
    }

    return resolveTaskLanePreview(
      activeTask,
      args.tasks,
      args.lanesById,
      targetLaneId,
      args.topLevelTaskIdsByLane,
      args.overData
    );
  }

  if (args.overData.type === "nest-target") {
    const targetLaneId = typeof args.overData.laneId === "string" ? args.overData.laneId : null;
    const overTaskId = typeof args.overData.taskId === "string" ? args.overData.taskId : null;
    if (
      targetLaneId === null ||
      overTaskId === null ||
      laneUsesDoneOrdering(args.lanesById, targetLaneId) ||
      activeTask.parentTaskId === overTaskId
    ) {
      return null;
    }

    if (!canTaskNestUnderParent(args.tasks, activeTask, overTaskId)) {
      return null;
    }

    const position = (args.subtaskIdsByParent.get(overTaskId) ?? []).length;
    return createReorderPreview(
      activeTask.id,
      args.tasks,
      args.lanesById,
      {
        laneId: targetLaneId,
        parentTaskId: overTaskId,
        position
      },
      {
        nestParentTaskId: overTaskId
      }
    );
  }

  if (args.overData.type === "task") {
    const targetLaneId = typeof args.overData.laneId === "string" ? args.overData.laneId : null;
    const overTaskId = typeof args.overData.taskId === "string" ? args.overData.taskId : null;
    if (targetLaneId === null || overTaskId === null) {
      return null;
    }

    return resolveTaskCardPreview(
      activeTask,
      args.tasks,
      args.lanesById,
      targetLaneId,
      overTaskId,
      args.topLevelTaskIdsByLane,
      args.subtaskIdsByParent,
      args.overData
    );
  }

  return null;
}
