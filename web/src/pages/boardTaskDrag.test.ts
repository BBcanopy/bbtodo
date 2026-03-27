import { describe, expect, it } from "vitest";

import type { BoardLane, Task } from "../api";
import {
  buildSubtaskIdsByParent,
  buildTopLevelTaskIdsByLane,
  normalizeTaskCardDropTarget,
  resolveTaskDragPreview
} from "./boardTaskDrag";

const lanes: BoardLane[] = [
  {
    createdAt: "2026-03-18T08:00:00.000Z",
    id: "lane-todo",
    name: "Todo",
    position: 0,
    projectId: "project-1",
    taskCount: 0,
    updatedAt: "2026-03-18T08:00:00.000Z"
  },
  {
    createdAt: "2026-03-18T08:00:00.000Z",
    id: "lane-done",
    name: "Done",
    position: 1,
    projectId: "project-1",
    taskCount: 0,
    updatedAt: "2026-03-18T08:00:00.000Z"
  }
];

function makeTask(input: Partial<Task> & Pick<Task, "id" | "laneId" | "position" | "ticketId" | "title">): Task {
  return {
    body: "",
    createdAt: "2026-03-18T08:00:00.000Z",
    parentTaskId: null,
    projectId: "project-1",
    tags: [],
    updatedAt: "2026-03-18T08:00:00.000Z",
    ...input
  };
}

function buildPreviewArgs(tasks: Task[]) {
  const lanesById = new Map(lanes.map((lane) => [lane.id, lane]));

  return {
    lanesById,
    subtaskIdsByParent: buildSubtaskIdsByParent(tasks, lanesById),
    tasks,
    topLevelTaskIdsByLane: buildTopLevelTaskIdsByLane(lanes, tasks)
  };
}

describe("boardTaskDrag", () => {
  it("normalizes a downward adjacent card hover into a real reorder", () => {
    const tasks = [
      makeTask({ id: "task-1", laneId: "lane-todo", position: 0, ticketId: "BILL-1", title: "One" }),
      makeTask({
        id: "task-1-child",
        laneId: "lane-todo",
        parentTaskId: "task-1",
        position: 0,
        ticketId: "BILL-1A",
        title: "One child"
      }),
      makeTask({ id: "task-2", laneId: "lane-todo", position: 1, ticketId: "BILL-2", title: "Two" }),
      makeTask({ id: "task-3", laneId: "lane-todo", position: 2, ticketId: "BILL-3", title: "Three" })
    ];

    const preview = resolveTaskDragPreview({
      ...buildPreviewArgs(tasks),
      activeTaskId: "task-1",
      overData: {
        activeCenterY: 110,
        laneId: "lane-todo",
        rectHeight: 60,
        rectTop: 100,
        taskId: "task-2",
        type: "task"
      }
    });

    expect(preview?.targetTaskId).toBe("task-2");
    expect(preview?.taskDropPosition).toBe("after");
    expect(preview?.moveTarget).toEqual({
      laneId: "lane-todo",
      parentTaskId: null,
      position: 2
    });
  });

  it("normalizes self-hover toward the nearest real reorder target", () => {
    expect(
      normalizeTaskCardDropTarget(["task-1", "task-2", "task-3"], "task-2", "task-2", "before")
    ).toEqual({
      position: "before",
      targetTaskId: "task-1"
    });

    expect(
      normalizeTaskCardDropTarget(["task-1", "task-2", "task-3"], "task-2", "task-2", "after")
    ).toEqual({
      position: "after",
      targetTaskId: "task-3"
    });
  });

  it("rejects nesting under a subtask", () => {
    const tasks = [
      makeTask({ id: "task-1", laneId: "lane-todo", position: 0, ticketId: "BILL-1", title: "Parent" }),
      makeTask({
        id: "task-2",
        laneId: "lane-todo",
        parentTaskId: "task-1",
        position: 0,
        ticketId: "BILL-2",
        title: "Child"
      }),
      makeTask({ id: "task-3", laneId: "lane-todo", position: 1, ticketId: "BILL-3", title: "Loose task" })
    ];

    const preview = resolveTaskDragPreview({
      ...buildPreviewArgs(tasks),
      activeTaskId: "task-3",
      overData: {
        laneId: "lane-todo",
        taskId: "task-2",
        type: "nest-target"
      }
    });

    expect(preview).toBeNull();
  });

  it("resolves an un-nest preview back to the lane root", () => {
    const tasks = [
      makeTask({ id: "task-1", laneId: "lane-todo", position: 0, ticketId: "BILL-1", title: "Parent" }),
      makeTask({
        id: "task-2",
        laneId: "lane-todo",
        parentTaskId: "task-1",
        position: 0,
        ticketId: "BILL-2",
        title: "Child"
      }),
      makeTask({ id: "task-3", laneId: "lane-todo", position: 1, ticketId: "BILL-3", title: "Target" })
    ];

    const preview = resolveTaskDragPreview({
      ...buildPreviewArgs(tasks),
      activeTaskId: "task-2",
      overData: {
        activeCenterY: 110,
        laneId: "lane-todo",
        rectHeight: 60,
        rectTop: 100,
        taskId: "task-3",
        type: "task"
      }
    });

    expect(preview?.moveTarget).toEqual({
      laneId: "lane-todo",
      parentTaskId: null,
      position: 1
    });
    expect(preview?.targetTaskId).toBe("task-3");
    expect(preview?.taskDropPosition).toBe("before");
  });

  it("treats a standalone task hovering a top-level card body as a nest preview", () => {
    const tasks = [
      makeTask({ id: "task-1", laneId: "lane-todo", position: 0, ticketId: "BILL-1", title: "Dragged" }),
      makeTask({ id: "task-2", laneId: "lane-todo", position: 1, ticketId: "BILL-2", title: "Parent" }),
      makeTask({
        id: "task-3",
        laneId: "lane-todo",
        parentTaskId: "task-2",
        position: 0,
        ticketId: "BILL-3",
        title: "Existing child"
      })
    ];

    const preview = resolveTaskDragPreview({
      ...buildPreviewArgs(tasks),
      activeTaskId: "task-1",
      overData: {
        activeCenterY: 110,
        laneId: "lane-todo",
        rectHeight: 60,
        rectTop: 100,
        taskId: "task-2",
        type: "task"
      }
    });

    expect(preview?.kind).toBe("nest");
    expect(preview?.nestParentTaskId).toBe("task-2");
    expect(preview?.targetTaskId).toBeNull();
    expect(preview?.taskDropPosition).toBeNull();
    expect(preview?.slot.interactive).toBe(false);
    expect(preview?.moveTarget).toEqual({
      laneId: "lane-todo",
      parentTaskId: "task-2",
      position: 1
    });
  });

  it("keeps the parent nest preview active when hovering a new parent's subtask slot", () => {
    const tasks = [
      makeTask({ id: "task-1", laneId: "lane-todo", position: 0, ticketId: "BILL-1", title: "Dragged" }),
      makeTask({ id: "task-2", laneId: "lane-todo", position: 1, ticketId: "BILL-2", title: "Parent" })
    ];

    const preview = resolveTaskDragPreview({
      ...buildPreviewArgs(tasks),
      activeTaskId: "task-1",
      overData: {
        laneId: "lane-todo",
        parentTaskId: "task-2",
        position: 0,
        type: "slot"
      }
    });

    expect(preview?.kind).toBe("nest");
    expect(preview?.nestParentTaskId).toBe("task-2");
    expect(preview?.moveTarget).toEqual({
      laneId: "lane-todo",
      parentTaskId: "task-2",
      position: 0
    });
  });

  it("does not mix standalone nesting with subtask body reordering", () => {
    const tasks = [
      makeTask({ id: "task-1", laneId: "lane-todo", position: 0, ticketId: "BILL-1", title: "Dragged" }),
      makeTask({ id: "task-2", laneId: "lane-todo", position: 1, ticketId: "BILL-2", title: "Parent" }),
      makeTask({
        id: "task-3",
        laneId: "lane-todo",
        parentTaskId: "task-2",
        position: 0,
        ticketId: "BILL-3",
        title: "Existing child"
      })
    ];

    const preview = resolveTaskDragPreview({
      ...buildPreviewArgs(tasks),
      activeTaskId: "task-1",
      overData: {
        activeCenterY: 110,
        laneId: "lane-todo",
        rectHeight: 60,
        rectTop: 100,
        taskId: "task-3",
        type: "task"
      }
    });

    expect(preview).toBeNull();
  });

  it("previews the allowed top insertion when entering Done from another lane", () => {
    const tasks = [
      makeTask({ id: "task-1", laneId: "lane-todo", position: 0, ticketId: "BILL-1", title: "Todo" }),
      makeTask({
        id: "task-2",
        laneId: "lane-done",
        position: 0,
        ticketId: "BILL-2",
        title: "Done newest",
        updatedAt: "2026-03-18T09:00:00.000Z"
      }),
      makeTask({
        id: "task-3",
        laneId: "lane-done",
        position: 1,
        ticketId: "BILL-3",
        title: "Done older",
        updatedAt: "2026-03-18T08:30:00.000Z"
      })
    ];

    const preview = resolveTaskDragPreview({
      ...buildPreviewArgs(tasks),
      activeTaskId: "task-1",
      overData: {
        activeCenterY: 110,
        laneId: "lane-done",
        rectHeight: 60,
        rectTop: 100,
        taskId: "task-3",
        type: "task"
      }
    });

    expect(preview?.moveTarget).toEqual({
      laneId: "lane-done",
      parentTaskId: null,
      position: 2
    });
    expect(preview?.slot.position).toBe(0);
    expect(preview?.slot.interactive).toBe(false);
    expect(preview?.taskDropPosition).toBe("before");
  });

  it("ignores in-lane reordering inside Done", () => {
    const tasks = [
      makeTask({
        id: "task-1",
        laneId: "lane-done",
        position: 0,
        ticketId: "BILL-1",
        title: "Done newest",
        updatedAt: "2026-03-18T09:00:00.000Z"
      }),
      makeTask({
        id: "task-2",
        laneId: "lane-done",
        position: 1,
        ticketId: "BILL-2",
        title: "Done older",
        updatedAt: "2026-03-18T08:30:00.000Z"
      })
    ];

    const preview = resolveTaskDragPreview({
      ...buildPreviewArgs(tasks),
      activeTaskId: "task-1",
      overData: {
        activeCenterY: 110,
        laneId: "lane-done",
        rectHeight: 60,
        rectTop: 100,
        taskId: "task-2",
        type: "task"
      }
    });

    expect(preview).toBeNull();
  });

  it("returns null when over data is stale or incomplete", () => {
    const tasks = [
      makeTask({ id: "task-1", laneId: "lane-todo", position: 0, ticketId: "BILL-1", title: "One" }),
      makeTask({ id: "task-2", laneId: "lane-todo", position: 1, ticketId: "BILL-2", title: "Two" })
    ];

    const preview = resolveTaskDragPreview({
      ...buildPreviewArgs(tasks),
      activeTaskId: "task-1",
      overData: {
        laneId: "lane-todo",
        taskId: "missing-task",
        type: "task"
      }
    });

    expect(preview).toBeNull();
  });
});
