import { expect, test, type Page, type Route } from "@playwright/test";

type DefaultLaneKey = "todo" | "in_progress" | "in_review" | "done";
type UserTheme = "sea" | "ember" | "midnight";
type TaskTagColor = "moss" | "sky" | "amber" | "coral" | "orchid" | "slate";

interface TaskTag {
  color: TaskTagColor;
  label: string;
}

interface BoardLane {
  createdAt: string;
  id: string;
  name: string;
  position: number;
  projectId: string;
  taskCount: number;
  updatedAt: string;
}

interface Project {
  createdAt: string;
  id: string;
  laneSummaries: BoardLane[];
  name: string;
  updatedAt: string;
}

interface Task {
  body: string;
  createdAt: string;
  id: string;
  laneId: string | null;
  position: number;
  projectId: string;
  tags: TaskTag[];
  title: string;
  updatedAt: string;
}

const tag = (label: string, color: TaskTagColor = "moss"): TaskTag => ({
  color,
  label
});

const user = {
  email: "operator@example.com",
  id: "user-1",
  name: "Nadia Vale",
  theme: "sea" as UserTheme
};

function laneId(projectId: string, suffix: DefaultLaneKey) {
  return `${projectId}-lane-${suffix}`;
}

function createDefaultLaneSummaries(
  projectId: string,
  counts: Record<DefaultLaneKey, number>
): BoardLane[] {
  return [
    {
      createdAt: "2026-03-17T09:00:00.000Z",
      id: laneId(projectId, "todo"),
      name: "Todo",
      position: 0,
      projectId,
      taskCount: counts.todo,
      updatedAt: "2026-03-18T07:30:00.000Z"
    },
    {
      createdAt: "2026-03-17T09:00:00.000Z",
      id: laneId(projectId, "in_progress"),
      name: "In Progress",
      position: 1,
      projectId,
      taskCount: counts.in_progress,
      updatedAt: "2026-03-18T07:30:00.000Z"
    },
    {
      createdAt: "2026-03-17T09:00:00.000Z",
      id: laneId(projectId, "in_review"),
      name: "In review",
      position: 2,
      projectId,
      taskCount: counts.in_review,
      updatedAt: "2026-03-18T07:30:00.000Z"
    },
    {
      createdAt: "2026-03-17T09:00:00.000Z",
      id: laneId(projectId, "done"),
      name: "Done",
      position: 3,
      projectId,
      taskCount: counts.done,
      updatedAt: "2026-03-18T07:30:00.000Z"
    }
  ];
}

const projects: Project[] = [
  {
    createdAt: "2026-03-17T09:00:00.000Z",
    id: "project-1",
    laneSummaries: createDefaultLaneSummaries("project-1", {
      todo: 2,
      in_progress: 1,
      in_review: 0,
      done: 1
    }),
    name: "Billing cleanup",
    updatedAt: "2026-03-18T07:30:00.000Z"
  }
];

const projectsForGrid: Project[] = [
  ...projects,
  {
    createdAt: "2026-03-17T10:00:00.000Z",
    id: "project-2",
    laneSummaries: createDefaultLaneSummaries("project-2", {
      todo: 0,
      in_progress: 0,
      in_review: 0,
      done: 0
    }),
    name: "Roadmap review",
    updatedAt: "2026-03-18T08:10:00.000Z"
  },
  {
    createdAt: "2026-03-17T11:00:00.000Z",
    id: "project-3",
    laneSummaries: createDefaultLaneSummaries("project-3", {
      todo: 2,
      in_progress: 1,
      in_review: 0,
      done: 0
    }),
    name: "Release prep",
    updatedAt: "2026-03-18T08:20:00.000Z"
  },
  {
    createdAt: "2026-03-17T12:00:00.000Z",
    id: "project-4",
    laneSummaries: createDefaultLaneSummaries("project-4", {
      todo: 1,
      in_progress: 0,
      in_review: 0,
      done: 3
    }),
    name: "Customer follow-up",
    updatedAt: "2026-03-18T08:30:00.000Z"
  },
  {
    createdAt: "2026-03-17T12:30:00.000Z",
    id: "project-5",
    laneSummaries: createDefaultLaneSummaries("project-5", {
      todo: 3,
      in_progress: 1,
      in_review: 0,
      done: 0
    }),
    name: "Support triage",
    updatedAt: "2026-03-18T08:40:00.000Z"
  },
  {
    createdAt: "2026-03-17T13:00:00.000Z",
    id: "project-6",
    laneSummaries: createDefaultLaneSummaries("project-6", {
      todo: 1,
      in_progress: 2,
      in_review: 0,
      done: 2
    }),
    name: "Partner audit",
    updatedAt: "2026-03-18T08:50:00.000Z"
  }
];

const tasks: Task[] = [
  {
    body: "Callback logs mention **retry** scope.",
    createdAt: "2026-03-18T07:00:00.000Z",
    id: "task-1",
    laneId: laneId("project-1", "todo"),
    position: 0,
    projectId: "project-1",
    tags: [tag("backend", "sky"), tag("retry", "coral")],
    title: "Review retry settings",
    updatedAt: "2026-03-18T07:10:00.000Z"
  },
  {
    body: "Capture OIDC callback details for the new deployment.",
    createdAt: "2026-03-18T07:20:00.000Z",
    id: "task-2",
    laneId: laneId("project-1", "in_progress"),
    position: 0,
    projectId: "project-1",
    tags: [tag("observability", "slate"), tag("oidc", "orchid")],
    title: "Tighten callback logging",
    updatedAt: "2026-03-18T07:45:00.000Z"
  },
  {
    body: "Docker compose no longer pings health forever.",
    createdAt: "2026-03-18T06:50:00.000Z",
    id: "task-3",
    laneId: laneId("project-1", "done"),
    position: 0,
    projectId: "project-1",
    tags: [tag("ops", "amber")],
    title: "Remove healthcheck loop",
    updatedAt: "2026-03-18T07:50:00.000Z"
  },
  {
    body: "Queue the copy pass after retry scope lands.",
    createdAt: "2026-03-18T07:05:00.000Z",
    id: "task-4",
    laneId: laneId("project-1", "todo"),
    position: 1,
    projectId: "project-1",
    tags: [tag("copy", "moss")],
    title: "Queue copy pass",
    updatedAt: "2026-03-18T07:15:00.000Z"
  }
];

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: "application/json",
    status
  });
}

async function mockUnauthenticated(page: Page) {
  await page.route("**/api/v1/me", async (route) => {
    await fulfillJson(route, 401, { message: "Unauthorized" });
  });
}

async function mockAuthenticated(
  page: Page,
  options?: {
    nextProjectId?: number;
    projects?: Project[];
    taskMoveDelayMs?: number;
    tasks?: Task[];
  }
) {
  let nextProjectId = options?.nextProjectId ?? 2;
  let nextLaneId = 1;
  let nextTaskId = 5;
  const taskMoveDelayMs = options?.taskMoveDelayMs ?? 0;
  let isAuthenticated = true;
  const currentUser = structuredClone(user);
  const projectState = (options?.projects ?? projects).map((project) => structuredClone(project));
  const taskState = (options?.tasks ?? tasks).map((task) => structuredClone(task));

  function getProject(projectId: string) {
    return projectState.find((project) => project.id === projectId) ?? null;
  }

  function syncProject(projectId: string) {
    const project = getProject(projectId);
    if (!project) {
      return;
    }

    project.laneSummaries = [...project.laneSummaries]
      .sort((left, right) => left.position - right.position)
      .map((lane) => ({
        ...lane,
        taskCount: taskState.filter((task) => task.projectId === projectId && task.laneId === lane.id).length
      }));
  }

  function sortTasksForProject(projectId: string, laneIdValue?: string) {
    return taskState
      .filter(
        (task) =>
          task.projectId === projectId &&
          (laneIdValue === undefined || task.laneId === laneIdValue)
      )
      .sort((left, right) => {
        if (left.position !== right.position) {
          return left.position - right.position;
        }

        return left.updatedAt < right.updatedAt ? 1 : -1;
      });
  }

  function syncAllProjects() {
    projectState.forEach((project) => syncProject(project.id));
  }

  function listReusableTags() {
    const tagsByKey = new Map<string, TaskTag>();

    [...taskState]
      .sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1))
      .forEach((task) => {
        task.tags.forEach((taskTag) => {
          const key = taskTag.label.trim().toLowerCase();
          if (!key || tagsByKey.has(key)) {
            return;
          }

          tagsByKey.set(key, taskTag);
        });
      });

    return Array.from(tagsByKey.values()).sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { sensitivity: "base" })
    );
  }

  function syncReusableTagColors(tags: TaskTag[]) {
    const colorsByKey = new Map(
      tags
        .map((taskTag) => [taskTag.label.trim().toLowerCase(), taskTag.color] as const)
        .filter(([key]) => key.length > 0)
    );
    if (colorsByKey.size === 0) {
      return;
    }

    taskState.forEach((task) => {
      task.tags = task.tags.map((taskTag) => {
        const nextColor = colorsByKey.get(taskTag.label.trim().toLowerCase());
        if (!nextColor || nextColor === taskTag.color) {
          return taskTag;
        }

        return {
          ...taskTag,
          color: nextColor
        };
      });
    });
  }

  function reindexLane(projectId: string, laneIdValue: string) {
    sortTasksForProject(projectId, laneIdValue).forEach((task, index) => {
      task.position = index;
    });
  }

  function moveTask(task: Task, targetLaneId: string, targetPosition: number) {
    const sourceLaneId = task.laneId;

    if (sourceLaneId && sourceLaneId !== targetLaneId) {
      taskState
        .filter(
          (candidate) =>
            candidate.projectId === task.projectId &&
            candidate.laneId === sourceLaneId &&
            candidate.id !== task.id
        )
        .sort((left, right) => left.position - right.position)
        .forEach((candidate, index) => {
          candidate.position = index;
        });
    }

    const targetTasks = sortTasksForProject(task.projectId, targetLaneId).filter(
      (candidate) => candidate.id !== task.id
    );
    const clampedPosition = Math.max(0, Math.min(targetPosition, targetTasks.length));

    targetTasks.splice(clampedPosition, 0, task);
    targetTasks.forEach((candidate, index) => {
      candidate.laneId = targetLaneId;
      candidate.position = index;
    });
  }

  function moveLane(projectId: string, laneIdValue: string, targetPosition: number) {
    const project = getProject(projectId);
    if (!project) {
      return null;
    }

    const lane = project.laneSummaries.find((candidate) => candidate.id === laneIdValue);
    if (!lane) {
      return null;
    }

    const orderedLanes = [...project.laneSummaries].sort((left, right) => left.position - right.position);
    const reorderedLanes = orderedLanes.filter((candidate) => candidate.id !== laneIdValue);
    const clampedPosition = Math.max(0, Math.min(targetPosition, reorderedLanes.length));
    reorderedLanes.splice(clampedPosition, 0, lane);
    reorderedLanes.forEach((candidate, index) => {
      candidate.position = index;
      candidate.updatedAt = "2026-03-18T08:12:00.000Z";
    });

    project.laneSummaries = reorderedLanes;
    syncProject(projectId);
    return project.laneSummaries.find((candidate) => candidate.id === laneIdValue) ?? null;
  }

  function deleteLane(projectId: string, laneIdValue: string, destinationLaneId?: string) {
    const project = getProject(projectId);
    if (!project) {
      return { status: "project_not_found" as const };
    }

    const lane = project.laneSummaries.find((candidate) => candidate.id === laneIdValue);
    if (!lane) {
      return { status: "lane_not_found" as const };
    }

    const remainingLanes = project.laneSummaries
      .filter((candidate) => candidate.id !== laneIdValue)
      .sort((left, right) => left.position - right.position);
    if (remainingLanes.length === 0) {
      return { status: "last_lane" as const };
    }

    const destinationLane =
      destinationLaneId === undefined
        ? null
        : remainingLanes.find((candidate) => candidate.id === destinationLaneId) ?? null;

    if (destinationLaneId !== undefined && !destinationLane) {
      return { status: "destination_not_found" as const };
    }

    const laneTasks = sortTasksForProject(projectId, laneIdValue);
    if (laneTasks.length > 0 && !destinationLane) {
      return { status: "destination_required" as const };
    }

    if (destinationLane) {
      const destinationTasks = sortTasksForProject(projectId, destinationLane.id);
      const movedTaskIds = new Set(laneTasks.map((task) => task.id));
      const orderedTasks = [...destinationTasks, ...laneTasks];

      orderedTasks.forEach((task, index) => {
        task.laneId = destinationLane.id;
        task.position = index;
        if (movedTaskIds.has(task.id)) {
          task.updatedAt = "2026-03-18T08:16:00.000Z";
        }
      });
    }

    project.laneSummaries = remainingLanes.map((candidate, index) => ({
      ...candidate,
      position: index,
      updatedAt: "2026-03-18T08:16:00.000Z"
    }));
    syncProject(projectId);

    return { status: "deleted" as const };
  }

  syncAllProjects();

  await page.route("**/auth/logout", async (route) => {
    isAuthenticated = false;
    await fulfillJson(route, 200, null);
  });

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}`;
    const body = request.postDataJSON() as
      | {
          body?: string;
          destinationLaneId?: string;
          laneId?: string;
          name?: string;
          position?: number;
          tags?: TaskTag[];
          theme?: UserTheme;
          title?: string;
        }
      | null;

    switch (key) {
      case "GET /api/v1/me":
        if (!isAuthenticated) {
          await fulfillJson(route, 401, { message: "Unauthorized" });
          return;
        }

        await fulfillJson(route, 200, currentUser);
        return;
      case "PATCH /api/v1/me/theme":
        currentUser.theme = body?.theme ?? currentUser.theme;
        await fulfillJson(route, 200, currentUser);
        return;
      case "GET /api/v1/projects":
        syncAllProjects();
        await fulfillJson(route, 200, projectState);
        return;
      case "GET /api/v1/task-tags":
        await fulfillJson(route, 200, listReusableTags());
        return;
      case "POST /api/v1/projects": {
        const createdProjectId = `project-${nextProjectId++}`;
        const createdProject: Project = {
          createdAt: "2026-03-18T08:00:00.000Z",
          id: createdProjectId,
          laneSummaries: createDefaultLaneSummaries(createdProjectId, {
            todo: 0,
            in_progress: 0,
            in_review: 0,
            done: 0
          }),
          name: body?.title ?? body?.name ?? "Untitled board",
          updatedAt: "2026-03-18T08:00:00.000Z"
        };
        projectState.unshift(createdProject);
        await fulfillJson(route, 201, createdProject);
        return;
      }
      case "PATCH /api/v1/projects":
        await fulfillJson(route, 404, { message: "Project not found." });
        return;
      case "GET /api/v1/api-tokens":
        await fulfillJson(route, 200, []);
        return;
      default:
        break;
    }

    if (request.method() === "GET" && url.pathname.startsWith("/api/v1/projects/") && url.pathname.endsWith("/lanes")) {
      const projectId = url.pathname.split("/")[4];
      const project = getProject(projectId);
      if (!project) {
        await fulfillJson(route, 404, { message: "Project not found." });
        return;
      }

      syncProject(projectId);
      await fulfillJson(route, 200, project.laneSummaries);
      return;
    }

    if (request.method() === "POST" && url.pathname.startsWith("/api/v1/projects/") && url.pathname.endsWith("/lanes")) {
      const projectId = url.pathname.split("/")[4];
      const project = getProject(projectId);
      if (!project) {
        await fulfillJson(route, 404, { message: "Project not found." });
        return;
      }

      const createdLane: BoardLane = {
        createdAt: "2026-03-18T08:15:00.000Z",
        id: `${projectId}-lane-custom-${nextLaneId++}`,
        name: body?.name ?? "New Lane",
        position: project.laneSummaries.length,
        projectId,
        taskCount: 0,
        updatedAt: "2026-03-18T08:15:00.000Z"
      };
      project.laneSummaries.push(createdLane);
      syncProject(projectId);
      await fulfillJson(route, 201, createdLane);
      return;
    }

    if (request.method() === "PATCH" && url.pathname.startsWith("/api/v1/projects/") && url.pathname.includes("/lanes/")) {
      const [projectId, laneIdValue] = [url.pathname.split("/")[4], url.pathname.split("/").pop() ?? ""];
      const lane = moveLane(projectId, laneIdValue, body?.position ?? 0);

      if (!lane) {
        await fulfillJson(route, 404, { message: "Lane not found." });
        return;
      }

      await fulfillJson(route, 200, lane);
      return;
    }

    if (request.method() === "DELETE" && url.pathname.startsWith("/api/v1/projects/") && url.pathname.includes("/lanes/")) {
      const [projectId, laneIdValue] = [url.pathname.split("/")[4], url.pathname.split("/").pop() ?? ""];
      const deleted = deleteLane(projectId, laneIdValue, body?.destinationLaneId);

      if (deleted.status === "project_not_found" || deleted.status === "lane_not_found") {
        await fulfillJson(route, 404, {
          message: deleted.status === "project_not_found" ? "Project not found." : "Lane not found."
        });
        return;
      }

      if (deleted.status === "last_lane") {
        await fulfillJson(route, 400, { message: "Projects must keep at least one lane." });
        return;
      }

      if (deleted.status === "destination_required") {
        await fulfillJson(route, 400, { message: "Select a destination lane before deleting this lane." });
        return;
      }

      if (deleted.status === "destination_not_found") {
        await fulfillJson(route, 400, { message: "Destination lane not found." });
        return;
      }

      await fulfillJson(route, 204, null);
      return;
    }

    if (
      request.method() === "PATCH" &&
      url.pathname.startsWith("/api/v1/projects/") &&
      !url.pathname.includes("/lanes/") &&
      !url.pathname.includes("/tasks/")
    ) {
      const projectId = url.pathname.split("/").pop() ?? "";
      const project = getProject(projectId);
      if (!project) {
        await fulfillJson(route, 404, { message: "Project not found." });
        return;
      }

      project.name = body?.name ?? project.name;
      project.updatedAt = "2026-03-18T08:12:00.000Z";
      syncProject(projectId);
      await fulfillJson(route, 200, project);
      return;
    }

    if (request.method() === "GET" && url.pathname.startsWith("/api/v1/projects/") && url.pathname.endsWith("/tasks")) {
      const projectId = url.pathname.split("/")[4];
      const project = getProject(projectId);
      if (!project) {
        await fulfillJson(route, 404, { message: "Project not found." });
        return;
      }

      await fulfillJson(route, 200, sortTasksForProject(projectId));
      return;
    }

    if (request.method() === "POST" && url.pathname.startsWith("/api/v1/projects/") && url.pathname.endsWith("/tasks")) {
      const projectId = url.pathname.split("/")[4];
      const project = getProject(projectId);
      if (!project) {
        await fulfillJson(route, 404, { message: "Project or lane not found." });
        return;
      }

      const targetLane =
        project.laneSummaries.find((lane) => lane.id === body?.laneId) ??
        project.laneSummaries[0];
      if (!targetLane) {
        await fulfillJson(route, 404, { message: "Project or lane not found." });
        return;
      }

      const createdTask: Task = {
        body: body?.body ?? "",
        createdAt: "2026-03-18T08:00:00.000Z",
        id: `task-${nextTaskId++}`,
        laneId: targetLane.id,
        position: sortTasksForProject(projectId, targetLane.id).length,
        projectId,
        tags: body?.tags ?? [],
        title: body?.title ?? "Untitled task",
        updatedAt: "2026-03-18T08:00:00.000Z"
      };
      taskState.push(createdTask);
      syncReusableTagColors(createdTask.tags);
      syncProject(projectId);
      await fulfillJson(route, 201, createdTask);
      return;
    }

    if (request.method() === "DELETE" && url.pathname.startsWith("/api/v1/projects/") && !url.pathname.includes("/tasks/")) {
      const projectId = url.pathname.split("/").pop() ?? "";
      const projectIndex = projectState.findIndex((candidate) => candidate.id === projectId);

      if (projectIndex === -1) {
        await fulfillJson(route, 404, { message: `Project not found: ${projectId}` });
        return;
      }

      projectState.splice(projectIndex, 1);
      for (let index = taskState.length - 1; index >= 0; index -= 1) {
        if (taskState[index].projectId === projectId) {
          taskState.splice(index, 1);
        }
      }
      await fulfillJson(route, 204, null);
      return;
    }

    if (request.method() === "DELETE" && url.pathname.startsWith("/api/v1/projects/") && url.pathname.includes("/tasks/")) {
      const [projectId, taskId] = [url.pathname.split("/")[4], url.pathname.split("/").pop() ?? ""];
      const taskIndex = taskState.findIndex(
        (candidate) => candidate.projectId === projectId && candidate.id === taskId
      );

      if (taskIndex === -1) {
        await fulfillJson(route, 404, { message: `Task not found: ${taskId}` });
        return;
      }

      const [removedTask] = taskState.splice(taskIndex, 1);
      if (removedTask.laneId) {
        reindexLane(projectId, removedTask.laneId);
      }
      syncProject(projectId);
      await fulfillJson(route, 204, null);
      return;
    }

    if (request.method() === "PATCH" && url.pathname.startsWith("/api/v1/projects/") && url.pathname.includes("/tasks/")) {
      const [projectId, taskId] = [url.pathname.split("/")[4], url.pathname.split("/").pop() ?? ""];
      const task = taskState.find((candidate) => candidate.projectId === projectId && candidate.id === taskId);
      const project = getProject(projectId);

      if (!task || !project) {
        await fulfillJson(route, 404, { message: `Task or lane not found.` });
        return;
      }

      const nextLane =
        (body?.laneId ? project.laneSummaries.find((lane) => lane.id === body.laneId) : undefined) ??
        project.laneSummaries.find((lane) => lane.id === task.laneId);
      if (!nextLane) {
        await fulfillJson(route, 404, { message: `Task or lane not found.` });
        return;
      }

      const isTaskMoveRequest =
        body?.laneId !== undefined || body?.position !== undefined;

      if (isTaskMoveRequest) {
        moveTask(task, nextLane.id, body?.position ?? sortTasksForProject(projectId, nextLane.id).length);
      }

      task.body = body?.body ?? task.body;
      if (body?.tags !== undefined) {
        task.tags = body.tags;
        syncReusableTagColors(task.tags);
      }
      task.title = body?.title ?? task.title;
      task.updatedAt = "2026-03-18T08:05:00.000Z";
      syncProject(projectId);
      if (isTaskMoveRequest && taskMoveDelayMs > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, taskMoveDelayMs);
        });
      }
      await fulfillJson(route, 200, task);
      return;
    }

    await fulfillJson(route, 404, { message: `Unhandled route: ${key}` });
  });
}

test("login screen uses the updated cool accent palette", async ({ page }) => {
  await mockUnauthenticated(page);

  await page.goto("/");

  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.svg");
  await expect(page.getByRole("heading", { name: "BBTodo" })).toBeVisible();
  await expect(page.locator(".hero-panel__brand .eyebrow")).toHaveCount(0);
  await expect(page.locator(".preview-panel")).toHaveCount(0);
  await expect(page.locator(".metric-ribbon")).toHaveCount(0);
  await expect(page.getByText("Live shape")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in with OIDC" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Read API docs" })).toHaveAttribute("href", "/docs/");
  const loginPanelBox = await page.locator(".hero-panel--simple").boundingBox();
  const loginHeadingBox = await page.getByRole("heading", { name: "BBTodo" }).boundingBox();
  const ctaRowBox = await page.locator(".hero-panel--simple .cta-row").boundingBox();
  const viewport = page.viewportSize();
  expect(loginPanelBox).not.toBeNull();
  expect(loginHeadingBox).not.toBeNull();
  expect(ctaRowBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  const panelCenterX = (loginPanelBox?.x ?? 0) + (loginPanelBox?.width ?? 0) / 2;
  const viewportCenterX = (viewport?.width ?? 0) / 2;
  expect(Math.abs(panelCenterX - viewportCenterX)).toBeLessThan(20);
  expect((loginPanelBox?.width ?? 0) / (viewport?.width ?? 1)).toBeGreaterThan(0.55);
  expect((ctaRowBox?.y ?? 0) - ((loginHeadingBox?.y ?? 0) + (loginHeadingBox?.height ?? 0))).toBeGreaterThan(20);
  const loginPanelPadding = await page
    .locator(".hero-panel--simple")
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingLeft));
  const loginCtaGap = await page
    .locator(".hero-panel--simple .cta-row")
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).columnGap));
  expect(loginPanelPadding).toBeGreaterThanOrEqual(32);
  expect(loginCtaGap).toBeGreaterThanOrEqual(16);

  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  expect(accent).toBe("#2f7774");
});

test("projects page uses the project switcher and removes extra board chrome", async ({ page }) => {
  const projectsForGridWithExtraLane = structuredClone(projectsForGrid);
  const billingCleanupProject = projectsForGridWithExtraLane.find((project) => project.id === "project-1");
  if (!billingCleanupProject) {
    throw new Error("Expected project-1 test fixture to exist");
  }
  billingCleanupProject.laneSummaries.push({
    createdAt: "2026-03-18T08:00:00.000Z",
    id: "project-1-lane-custom-qa",
    name: "Ready for QA",
    position: 4,
    projectId: "project-1",
    taskCount: 0,
    updatedAt: "2026-03-18T08:00:00.000Z"
  });

  await mockAuthenticated(page, {
    nextProjectId: 7,
    projects: projectsForGridWithExtraLane
  });

  await page.setViewportSize({ width: 2048, height: 900 });
  await page.goto("/");

  await expect(page).toHaveTitle("Projects | BBTodo");
  await expect(page.getByRole("heading", { name: "Boards" })).toHaveCount(0);
  await expect(page.locator(".page-shell--projects .page-header")).toHaveCount(0);
  await expect(page.locator(".page-intro")).toHaveCount(0);
  await expect(page.locator(".page-header .eyebrow")).toHaveCount(0);
  await expect(page.locator(".page-header .page-summary")).toHaveCount(0);
  await expect(page.locator(".page-shell > .surface-strip")).toHaveCount(0);
  await expect(page.locator(".page-header__meta .label-chip")).toHaveCount(0);
  await expect(page.locator(".page-header__meta .label-chip--soft")).toHaveCount(0);
  await expect(page.locator(".project-card .label-chip")).toHaveCount(0);
  await expect(page.locator(".project-card__summary")).toHaveCount(0);
  await expect(page.locator(".project-track")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open board" })).toHaveCount(0);
  await expect(page.getByRole("button", { exact: true, name: "Delete" })).toHaveCount(0);
  await expect(page.getByTestId("project-card-project-1").getByLabel("Todo 2")).toBeVisible();
  await expect(page.getByTestId("project-card-project-1").getByLabel("In Progress 1")).toBeVisible();
  await expect(page.getByTestId("project-card-project-1").getByLabel("In review 0")).toBeVisible();
  await expect(page.getByTestId("project-card-project-1").getByLabel("Done 1")).toBeVisible();
  await expect(page.getByTestId("project-card-project-1").getByLabel("Ready for QA 0")).toBeVisible();
  const projectLanePills = page.getByTestId("project-card-project-1").locator(".project-card__lane-pill");
  await expect(projectLanePills).toHaveCount(5);
  const initialLanePillWidths = await projectLanePills.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().width)
  );
  expect(Math.max(...initialLanePillWidths) - Math.min(...initialLanePillWidths)).toBeLessThan(1);
  await expect(page.getByTestId("project-card-project-1").getByText("More")).toHaveCount(0);
  const originalViewport = page.viewportSize();
  await page.setViewportSize({ width: 700, height: 960 });
  const resizedLanePillWidths = await projectLanePills.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().width)
  );
  expect(Math.max(...resizedLanePillWidths) - Math.min(...resizedLanePillWidths)).toBeLessThan(1);
  expect(Math.abs(initialLanePillWidths[0] - resizedLanePillWidths[0])).toBeLessThan(1);
  if (originalViewport) {
    await page.setViewportSize(originalViewport);
  }
  const rootSwitcherButton = page.getByRole("button", { name: "Open project switcher" });
  await expect(page.locator(".subnav__current")).toHaveCount(1);
  await expect(rootSwitcherButton).toBeVisible();
  await expect(page.locator(".subnav__current-value")).toHaveText("All projects");
  await expect(page.getByLabel("Search projects")).toHaveCount(0);
  await expect(page.locator(".subnav__search-label")).toHaveCount(0);
  await expect(page.locator(".topbar__identity")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "API tokens" })).toHaveCount(0);
  await expect(page.getByLabel("Open account menu")).toHaveText("N");
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "API tokens" })).toHaveCount(0);
  const topbar = page.locator(".topbar");
  const topbarHeight = await topbar.evaluate((element) => parseFloat(getComputedStyle(element).height));
  const topbarBackground = await topbar.evaluate((element) => getComputedStyle(element).backgroundColor);
  const activeSubnavRadius = await page
    .locator(".subnav__link.is-active")
    .evaluate((element) => getComputedStyle(element).borderRadius);
  expect(topbarHeight).toBeLessThan(90);
  expect(topbarBackground).toBe("rgba(0, 0, 0, 0)");
  expect(activeSubnavRadius).toBe("0px");

  const projectsMaxWidth = await page.locator(".page-shell--projects").evaluate((element) => getComputedStyle(element).maxWidth);
  expect(projectsMaxWidth).toBe("none");

  const projectsPageBox = await page.locator(".page-shell--projects").boundingBox();
  const rootSwitcherButtonBox = await rootSwitcherButton.boundingBox();
  const rootSwitcherBackground = await rootSwitcherButton.evaluate((element) => getComputedStyle(element).backgroundColor);
  const rootSwitcherHeight = await rootSwitcherButton.evaluate((element) => parseFloat(getComputedStyle(element).height));
  const rootSwitcherRadius = await rootSwitcherButton.evaluate((element) => parseFloat(getComputedStyle(element).borderRadius));
  const projectGridBox = await page.locator(".project-grid").boundingBox();
  const firstCard = page.getByTestId("project-card-project-1");
  const secondCard = page.getByTestId("project-card-project-2");
  const thirdCard = page.getByTestId("project-card-project-3");
  const fourthCard = page.getByTestId("project-card-project-4");
  const fifthCard = page.getByTestId("project-card-project-5");
  const sixthCard = page.getByTestId("project-card-project-6");
  const firstCardBox = await firstCard.boundingBox();
  const secondCardBox = await secondCard.boundingBox();
  const thirdCardBox = await thirdCard.boundingBox();
  const fourthCardBox = await fourthCard.boundingBox();
  const fifthCardBox = await fifthCard.boundingBox();
  const sixthCardBox = await sixthCard.boundingBox();
  const viewportWidth = page.viewportSize()?.width ?? 0;
  expect(projectsPageBox).not.toBeNull();
  expect((projectsPageBox?.width ?? 0)).toBeGreaterThan(viewportWidth - 80);
  expect(projectGridBox).not.toBeNull();
  expect(firstCardBox).not.toBeNull();
  expect(secondCardBox).not.toBeNull();
  expect(thirdCardBox).not.toBeNull();
  expect(fourthCardBox).not.toBeNull();
  expect(fifthCardBox).not.toBeNull();
  expect(sixthCardBox).not.toBeNull();
  expect((firstCardBox?.x ?? 0) - (projectGridBox?.x ?? 0)).toBeLessThan(24);
  expect((firstCardBox?.y ?? 0) - (projectGridBox?.y ?? 0)).toBeLessThan(24);
  expect(Math.abs((firstCardBox?.width ?? 0) - (secondCardBox?.width ?? 0))).toBeLessThan(2);
  expect(Math.abs((firstCardBox?.width ?? 0) - (thirdCardBox?.width ?? 0))).toBeLessThan(2);
  expect(Math.abs((firstCardBox?.width ?? 0) - (fourthCardBox?.width ?? 0))).toBeLessThan(2);
  expect(Math.abs((firstCardBox?.width ?? 0) - (fifthCardBox?.width ?? 0))).toBeLessThan(2);
  expect(Math.abs((firstCardBox?.width ?? 0) - (sixthCardBox?.width ?? 0))).toBeLessThan(2);
  expect(Math.abs((firstCardBox?.height ?? 0) - (secondCardBox?.height ?? 0))).toBeLessThan(2);
  expect(Math.abs((firstCardBox?.height ?? 0) - (thirdCardBox?.height ?? 0))).toBeLessThan(2);
  expect(Math.abs((firstCardBox?.height ?? 0) - (fourthCardBox?.height ?? 0))).toBeLessThan(2);
  expect(Math.abs((firstCardBox?.height ?? 0) - (fifthCardBox?.height ?? 0))).toBeLessThan(2);
  expect(Math.abs((firstCardBox?.height ?? 0) - (sixthCardBox?.height ?? 0))).toBeLessThan(2);
  expect(Math.abs((firstCardBox?.y ?? 0) - (secondCardBox?.y ?? 0))).toBeLessThan(20);
  expect(Math.abs((firstCardBox?.y ?? 0) - (thirdCardBox?.y ?? 0))).toBeLessThan(20);
  expect(Math.abs((firstCardBox?.y ?? 0) - (fourthCardBox?.y ?? 0))).toBeLessThan(20);
  expect(Math.abs((firstCardBox?.y ?? 0) - (fifthCardBox?.y ?? 0))).toBeLessThan(20);
  expect(Math.abs((firstCardBox?.y ?? 0) - (sixthCardBox?.y ?? 0))).toBeLessThan(20);
  expect((secondCardBox?.x ?? 0) - ((firstCardBox?.x ?? 0) + (firstCardBox?.width ?? 0))).toBeLessThan(32);
  expect((firstCardBox?.width ?? 0)).toBeLessThan(320);
  expect(rootSwitcherButtonBox).not.toBeNull();
  expect((rootSwitcherButtonBox?.x ?? 0)).toBeGreaterThan(120);
  expect(rootSwitcherBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(rootSwitcherHeight).toBeGreaterThan(36);
  expect(rootSwitcherRadius).toBeGreaterThan(15);
  await expect(page.getByRole("link", { name: "Create Project" })).toHaveCount(0);
  await expect(page.locator(".subnav__action-mark")).toHaveCount(0);

  await rootSwitcherButton.click();
  const rootSwitcherInput = page.getByLabel("Project switcher input");
  await expect(page.getByRole("button", { name: "Rename Project" })).toHaveCount(0);
  await rootSwitcherInput.fill("partner");
  await expect(page.getByRole("button", { name: "Open project Partner audit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open project Billing cleanup" })).toHaveCount(0);
  await expect(page.locator(".project-grid .project-card")).toHaveCount(6);
  await page.getByRole("button", { name: "Open project Partner audit" }).click();

  await expect(page).toHaveURL(/\/projects\/project-6$/);
  await expect(page.locator(".subnav__current-value")).toHaveText("Partner audit");
  await page.goto("/");
  await expect(page.locator(".subnav__current-value")).toHaveText("All projects");
  await rootSwitcherButton.click();
  await rootSwitcherInput.fill("zzzz");
  await expect(page.getByText("No projects match that input yet.")).toBeVisible();
  await expect(page.locator(".project-grid .project-card")).toHaveCount(6);
  await expect(page.getByRole("heading", { name: "No boards match that search." })).toHaveCount(0);

  await page.getByLabel("Open account menu").click();
  await expect(page.getByRole("button", { pressed: true, name: "Sea" })).toBeVisible();
  await expect(page.locator(".theme-option__copy span")).toHaveCount(0);
  await page.getByRole("button", { name: "Ember" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ember");
  const emberAccent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  expect(emberAccent).toBe("#b85e3f");
  await page.getByRole("button", { name: "Midnight" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
  const midnightAccent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  expect(midnightAccent).toBe("#58c6c0");
  await page.getByLabel("Open account menu").click();

  await rootSwitcherButton.click();
  await rootSwitcherInput.fill("API polish");
  await page.getByRole("button", { name: "Create Project" }).click();

  await expect(page).toHaveURL(/\/projects\/project-7$/);
  await expect(page).toHaveTitle("API polish | BBTodo");
  await expect(page.getByTestId("board-grid")).toBeVisible();
  await expect(page.locator(".subnav__current-label")).toHaveCount(0);
  await expect(page.locator(".subnav__current-value")).toHaveText("API polish");

  await page.getByLabel("Open account menu").click();

  await expect(page.getByRole("menuitem", { name: "API tokens" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();

  await page.getByRole("menuitem", { name: "API tokens" }).click();
  await expect(page).toHaveTitle("API Tokens | BBTodo");
  await expect(page.getByRole("heading", { exact: true, name: "API tokens" })).toBeVisible();
  await expect(page.locator(".page-header .eyebrow")).toHaveCount(0);
  await expect(page.locator(".page-header .page-summary")).toHaveCount(0);
  await expect(page.locator(".page-header .label-chip--soft")).toHaveCount(0);
  await expect(page.locator(".field__hint")).toHaveCount(0);
  await expect(page.locator(".empty-state .lead-copy")).toHaveCount(0);
  const tokenLabelBox = await page.locator(".compose-form .field__label").boundingBox();
  const tokenInputBox = await page.locator(".compose-form input").boundingBox();
  expect(tokenLabelBox).not.toBeNull();
  expect(tokenInputBox).not.toBeNull();
  expect(Math.abs((tokenLabelBox?.y ?? 0) - (tokenInputBox?.y ?? 0))).toBeLessThan(24);
  expect((tokenInputBox?.x ?? 0)).toBeGreaterThan((tokenLabelBox?.x ?? 0) + 20);
});

test("sign out redirects back to the login screen", async ({ page }) => {
  await mockAuthenticated(page);

  await page.goto("/");

  await page.getByLabel("Open account menu").click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  await expect(page).toHaveURL("/");
  await expect(page).toHaveTitle("BBTodo");
  await expect(page.getByRole("heading", { name: "BBTodo" })).toBeVisible();
});

test("project cards open on click and delete through a confirmation popover", async ({ page }) => {
  await mockAuthenticated(page);

  await page.goto("/");

  const projectCard = page.getByTestId("project-card-project-1");
  await expect(projectCard).toBeVisible();
  const projectTitle = projectCard.getByRole("heading", { name: "Billing cleanup" });
  const projectCardBox = await projectCard.boundingBox();
  const projectTitleBox = await projectTitle.boundingBox();
  const projectTimestamp = projectCard.locator(".project-card__timestamp");
  const projectTimestampBox = await projectTimestamp.boundingBox();
  const projectLaneCountsBox = await projectCard.locator(".project-card__lane-counts").boundingBox();
  expect(projectCardBox).not.toBeNull();
  expect(projectTitleBox).not.toBeNull();
  expect(projectTimestampBox).not.toBeNull();
  expect(projectLaneCountsBox).not.toBeNull();
  expect(projectCardBox?.width ?? 0).toBeLessThan(700);
  expect(((projectTitleBox?.y ?? 0) - (projectCardBox?.y ?? 0)) / (projectCardBox?.height ?? 1)).toBeLessThan(0.28);
  await expect(projectTimestamp).toHaveText("2026-03-18");
  await expect(projectTimestamp).toHaveAttribute("datetime", "2026-03-18T07:30:00.000Z");
  expect(((projectTimestampBox?.y ?? 0) - (projectCardBox?.y ?? 0)) / (projectCardBox?.height ?? 1)).toBeLessThan(0.42);
  expect((projectTimestampBox?.y ?? 0) + (projectTimestampBox?.height ?? 0)).toBeLessThan(
    (projectLaneCountsBox?.y ?? 0) + 8
  );
  expect(projectTimestampBox?.x ?? 0).toBeLessThan(
    (projectCardBox?.x ?? 0) + (projectCardBox?.width ?? 0) * 0.45
  );

  await projectCard.click();
  await expect(page).toHaveURL(/\/projects\/project-1$/);
  await expect(page.getByTestId("board-grid")).toBeVisible();

  await page.goto("/");

  const deleteButton = page.getByLabel("Delete board Billing cleanup");
  await deleteButton.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(projectCard).toBeVisible();

  await deleteButton.click();
  await page.getByRole("button", { exact: true, name: "Delete" }).click();
  await expect(projectCard).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No boards yet." })).toBeVisible();
});

test("board workspace adds lanes and filters cards front-end only", async ({ page }) => {
  const tasksWithReusableGlobalTag = structuredClone(tasks);
  tasksWithReusableGlobalTag.push({
    body: "Homepage refresh backlog.",
    createdAt: "2026-03-18T08:18:00.000Z",
    id: "task-project-2-1",
    laneId: laneId("project-2", "todo"),
    position: 0,
    projectId: "project-2",
    tags: [tag("global-brand", "amber")],
    title: "Refresh homepage copy",
    updatedAt: "2026-03-18T08:22:00.000Z"
  });

  await mockAuthenticated(page, {
    projects: projectsForGrid,
    taskMoveDelayMs: 700,
    tasks: tasksWithReusableGlobalTag
  });

  await page.goto("/projects/project-1");

  await expect(page).toHaveTitle("Billing cleanup | BBTodo");
  await expect(page.locator(".page-intro")).toHaveCount(0);
  await expect(page.locator(".workspace-header")).toHaveCount(0);
  await expect(page.locator(".workspace-form")).toHaveCount(0);
  await expect(page.locator(".workspace-summary")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back to projects" })).toHaveCount(0);
  await expect(page.locator(".subnav__current-label")).toHaveCount(0);
  await expect(page.locator(".subnav__current-value")).toHaveText("Billing cleanup");
  await expect(page.getByRole("button", { name: "Create Lane" })).toBeVisible();
  await expect(page.getByLabel("Search cards")).toBeVisible();
  await expect(page.getByLabel("Filter by tags")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show tag filter suggestions" })).toBeVisible();
  await expect(page.locator(".subnav__search-label")).toHaveCount(0);
  await expect(page.getByLabel("Filter by tags")).toHaveAttribute("placeholder", "tag");
  const currentProjectBackground = await page
    .locator(".subnav__current")
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(currentProjectBackground).not.toBe("rgba(0, 0, 0, 0)");

  const maxWidth = await page.locator(".page-shell--board").evaluate((element) => getComputedStyle(element).maxWidth);
  expect(maxWidth).toBe("none");

  const boardBox = await page.getByTestId("board-grid").boundingBox();
  expect(boardBox).not.toBeNull();

  const viewportWidth = page.viewportSize()?.width ?? 0;
  expect(boardBox?.width ?? 0).toBeGreaterThan(viewportWidth - 80);

  await expect(page.locator(".board-column")).toHaveCount(4);
  await expect(page.locator(".board-column__note")).toHaveCount(0);
  await expect(page.locator(".lane-drag-handle")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Move to / })).toHaveCount(0);
  for (const laneName of ["Todo", "In Progress", "In review", "Done"]) {
    await expect(page.getByLabel(`Delete lane ${laneName}`)).toBeVisible();
  }
  const todoLaneHeader = page.getByTestId(`lane-header-${laneId("project-1", "todo")}`);
  const todoLaneDeleteButton = page.getByLabel("Delete lane Todo");
  const todoLaneHeaderBox = await todoLaneHeader.boundingBox();
  const todoLaneDeleteButtonBox = await todoLaneDeleteButton.boundingBox();
  expect(todoLaneHeaderBox).not.toBeNull();
  expect(todoLaneDeleteButtonBox).not.toBeNull();
  expect((todoLaneHeaderBox?.x ?? 0) + (todoLaneHeaderBox?.width ?? 0) - (todoLaneDeleteButtonBox?.x ?? 0)).toBeLessThan(
    40
  );
  expect(Math.abs((todoLaneDeleteButtonBox?.y ?? 0) - (todoLaneHeaderBox?.y ?? 0))).toBeLessThan(12);
  await expect(page.getByTestId("task-card-task-1").locator(".label-chip")).toHaveCount(0);
  const initialTaskTags = page.getByTestId("task-card-task-1").locator(".task-tag");
  await expect(initialTaskTags).toHaveText(["backend", "retry"]);
  await expect(initialTaskTags.nth(0)).toHaveCSS("background-color", "rgb(227, 241, 255)");
  const taggedCardTimestampBox = await page.getByTestId("task-card-task-1").locator(".task-card__timestamp").boundingBox();
  const taggedCardTagsBox = await page.getByTestId("task-card-task-1").locator(".task-card__tags").boundingBox();
  expect(taggedCardTimestampBox).not.toBeNull();
  expect(taggedCardTagsBox).not.toBeNull();
  expect(
    Math.abs(
      ((taggedCardTimestampBox?.y ?? 0) + (taggedCardTimestampBox?.height ?? 0)) -
        ((taggedCardTagsBox?.y ?? 0) + (taggedCardTagsBox?.height ?? 0))
    )
  ).toBeLessThan(12);
  expect(taggedCardTimestampBox?.x ?? 0).toBeGreaterThan(
    ((taggedCardTagsBox?.x ?? 0) + (taggedCardTagsBox?.width ?? 0)) - 8
  );
  const taskDeleteButton = page.getByLabel("Delete task Review retry settings");
  await expect(taskDeleteButton.locator("svg")).toHaveCount(1);
  await expect(taskDeleteButton.locator("svg path")).toHaveCount(4);
  await expect(taskDeleteButton.locator("svg path").nth(0)).toHaveAttribute(
    "d",
    "M9.25 5.25V4.5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1v.75"
  );
  await expect(taskDeleteButton).toHaveCSS("border-top-width", "0px");
  const taggedCardTitleBox = await page.getByTestId("task-card-task-1").locator(".task-card__title").boundingBox();
  const taskDeleteButtonBox = await taskDeleteButton.boundingBox();
  expect(taggedCardTitleBox).not.toBeNull();
  expect(taskDeleteButtonBox).not.toBeNull();
  expect(
    Math.abs(
      ((taggedCardTitleBox?.y ?? 0) + (taggedCardTitleBox?.height ?? 0) / 2) -
        ((taskDeleteButtonBox?.y ?? 0) + (taskDeleteButtonBox?.height ?? 0) / 2)
    )
  ).toBeLessThan(10);
  await expect(page.getByTestId("task-card-task-1").locator(".task-card__timestamp")).toHaveText("2026-03-18");
  await expect(page.getByTestId("task-card-task-1").locator(".task-card__timestamp")).toHaveAttribute(
    "datetime",
    "2026-03-18T07:10:00.000Z"
  );

  await page.getByTestId("task-card-task-1").click();
  const editDialog = page.getByRole("dialog", { name: "Edit Card" });
  await expect(editDialog).toBeVisible();
  const sourceTab = editDialog.getByRole("tab", { name: "Markdown source" });
  const previewTab = editDialog.getByRole("tab", { name: "Rendered preview" });
  const tagInput = editDialog.getByLabel("Task tags");
  await expect(editDialog.getByLabel("Title")).toHaveValue("Review retry settings");
  await expect(tagInput).toHaveValue("");
  await expect(editDialog.getByText("New tag color")).toHaveCount(0);
  await expect(editDialog.getByRole("button", { name: "Remove tag backend" })).toBeVisible();
  await expect(editDialog.getByRole("button", { name: "Remove tag retry" })).toBeVisible();
  await expect(editDialog.getByRole("button", { name: "Add tag ops" })).toBeVisible();
  await expect(editDialog.getByRole("button", { name: "Add tag global-brand" })).toBeVisible();
  await expect(editDialog.getByLabel("Task body")).toHaveValue("Callback logs mention **retry** scope.");
  await expect(editDialog.getByTestId("task-markdown-preview")).toHaveCount(0);
  await expect(sourceTab).toHaveAttribute("aria-selected", "true");
  await expect(previewTab).toHaveAttribute("aria-selected", "false");
  await editDialog.getByRole("button", { name: "Edit color for tag backend" }).click();
  await expect(editDialog.getByText("Color for backend")).toBeVisible();
  await editDialog.getByRole("button", { name: "Set backend color to Amber" }).click();
  const dialogBox = await editDialog.boundingBox();
  const bodyFieldBox = await editDialog.getByLabel("Task body").boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(bodyFieldBox).not.toBeNull();
  expect((bodyFieldBox?.width ?? 0) / (dialogBox?.width ?? 1)).toBeGreaterThan(0.75);
  await previewTab.click();
  await expect(previewTab).toHaveAttribute("aria-selected", "true");
  await expect(editDialog.locator(".markdown-preview strong")).toHaveText("retry");
  await sourceTab.click();
  await editDialog.getByRole("button", { name: "Add tag ops" }).click();
  await expect(editDialog.getByRole("button", { name: "Remove tag ops" })).toBeVisible();
  await editDialog.getByRole("button", { name: "Remove tag retry" }).click();
  await editDialog.getByRole("button", { name: "Remove tag ops" }).click();
  await editDialog.getByLabel("Title").fill("Review retry scope");
  await tagInput.fill("release");
  await expect(editDialog.getByText("Color for release")).toBeVisible();
  await expect(editDialog.locator(".task-tag-editor__swatch[aria-pressed='true']")).toHaveCount(1);
  await editDialog.getByRole("button", { name: "Set release color to Orchid" }).click();
  await tagInput.press("Enter");
  await expect(tagInput).toHaveValue("");
  await expect(editDialog.getByText("Color for release")).toHaveCount(0);
  await expect(editDialog.getByRole("button", { name: "Remove tag release" })).toBeVisible();
  await editDialog
    .getByLabel("Task body")
    .fill("Callback logs mention **scope**.\n\n- Keep raw claims\n- Verify issuer");
  await previewTab.click();
  await expect(editDialog.locator(".markdown-preview strong")).toHaveText("scope");
  await expect(editDialog.locator(".markdown-preview li")).toHaveCount(2);
  await editDialog.getByRole("button", { name: "Save card" }).click();
  await expect(editDialog).toHaveCount(0);
  await expect(page.getByTestId("task-card-task-1").getByText("Review retry scope")).toBeVisible();
  const updatedTaskTags = page.getByTestId("task-card-task-1").locator(".task-tag");
  await expect(updatedTaskTags).toHaveText(["backend", "release"]);
  await expect(updatedTaskTags.nth(0)).toHaveCSS("background-color", "rgb(255, 241, 217)");
  await expect(updatedTaskTags.nth(1)).toHaveCSS("background-color", "rgb(242, 229, 255)");
  await page.getByTestId("task-card-task-2").click();
  await expect(editDialog).toBeVisible();
  const recoloredBackendSuggestion = editDialog.getByRole("button", { name: "Add tag backend" });
  await expect(recoloredBackendSuggestion).toBeVisible();
  await expect(recoloredBackendSuggestion).toHaveCSS("background-color", "rgb(255, 241, 217)");
  await editDialog.getByLabel("Close edit task dialog").click();
  await expect(editDialog).toHaveCount(0);

  await page.getByLabel("Search cards").fill("callback");
  await expect(page.getByText("Review retry scope")).toBeVisible();
  await expect(page.getByText("Tighten callback logging")).toBeVisible();
  await expect(page.getByText("Remove healthcheck loop")).toHaveCount(0);
  await page.getByLabel("Search cards").fill("");
  const tagFilterInput = page.getByLabel("Filter by tags");
  const tagFilterField = page.locator(".subnav__search--tag-filter");
  const searchInputPaddingLeft = await page
    .getByLabel("Search cards")
    .evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingLeft));
  const tagComboPaddingLeft = await tagFilterField
    .locator(".subnav__search-combo")
    .evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingLeft));
  const tagFieldPaddingLeft = await tagFilterField
    .locator(".subnav__tag-filter-field")
    .evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingLeft));
  const tagInputPaddingLeft = await tagFilterInput.evaluate((node) =>
    Number.parseFloat(getComputedStyle(node).paddingLeft)
  );
  expect(Math.abs(searchInputPaddingLeft - (tagComboPaddingLeft + tagFieldPaddingLeft + tagInputPaddingLeft))).toBeLessThan(
    1
  );
  await page.getByRole("button", { name: "Show tag filter suggestions" }).click();
  const tagFilterDropdown = page.getByRole("list", { name: "Available tag filters" });
  await expect(tagFilterDropdown).toBeVisible();
  await expect(tagFilterDropdown.getByRole("button", { name: "Add tag filter release" })).toBeVisible();
  await expect(tagFilterDropdown.getByRole("button", { name: "Add tag filter global-brand" })).toBeVisible();
  await tagFilterDropdown.getByRole("button", { name: "Add tag filter release" }).click();
  const releaseTagFilterChip = tagFilterField.locator(".subnav__tag-filter-chip", { hasText: "release" });
  await expect(releaseTagFilterChip).toBeVisible();
  await expect(tagFilterField.locator(".subnav__tag-filter-chip")).toHaveCount(1);
  await expect(releaseTagFilterChip).toHaveCSS("background-color", "rgb(242, 229, 255)");
  await expect(tagFilterInput).toHaveClass(/is-collapsed/);
  await expect.poll(async () =>
    tagFilterInput.evaluate((node) => getComputedStyle(node).borderTopWidth)
  ).toBe("0px");
  await expect.poll(async () =>
    tagFilterInput.evaluate((node) => getComputedStyle(node).backgroundColor)
  ).toBe("rgba(0, 0, 0, 0)");
  await expect.poll(async () =>
    tagFilterInput.evaluate((node) => getComputedStyle(node).boxShadow)
  ).toBe("none");
  await expect(tagFilterInput).toHaveAttribute("placeholder", "");
  await expect(tagFilterInput).toHaveValue("");
  await expect(page.getByText("Review retry scope")).toBeVisible();
  await expect(page.getByText("Tighten callback logging")).toHaveCount(0);
  await expect(page.getByText("Queue copy pass")).toHaveCount(0);
  await page
    .getByTestId("task-card-task-1")
    .getByRole("button", { name: "backend" })
    .click({ force: true });
  const backendTagFilterChip = tagFilterField.locator(".subnav__tag-filter-chip", { hasText: "backend" });
  await expect(releaseTagFilterChip).toHaveCount(0);
  await expect(backendTagFilterChip).toBeVisible();
  await expect(tagFilterField.locator(".subnav__tag-filter-chip")).toHaveCount(1);
  await expect(backendTagFilterChip).toHaveCSS("background-color", "rgb(255, 241, 217)");
  await expect(tagFilterInput).toHaveClass(/is-collapsed/);
  await expect.poll(async () =>
    tagFilterInput.evaluate((node) => getComputedStyle(node).borderTopWidth)
  ).toBe("0px");
  await expect(tagFilterInput).toHaveAttribute("placeholder", "");
  await expect(tagFilterInput).toHaveValue("");
  await expect(page.getByText("Review retry scope")).toBeVisible();
  await expect(page.getByText("Tighten callback logging")).toHaveCount(0);
  await expect(page.getByText("Queue copy pass")).toHaveCount(0);
  await page.getByRole("button", { name: "Show tag filter suggestions" }).click();
  await tagFilterDropdown.getByRole("button", { name: "Add tag filter ops" }).click();
  const opsTagFilterChip = tagFilterField.locator(".subnav__tag-filter-chip", { hasText: "ops" });
  await expect(backendTagFilterChip).toHaveCount(0);
  await expect(opsTagFilterChip).toBeVisible();
  await expect(tagFilterField.locator(".subnav__tag-filter-chip")).toHaveCount(1);
  await expect(tagFilterInput).toHaveClass(/is-collapsed/);
  await expect.poll(async () =>
    tagFilterInput.evaluate((node) => getComputedStyle(node).borderTopWidth)
  ).toBe("0px");
  await expect(page.getByText("Remove healthcheck loop")).toBeVisible();
  await expect(page.getByText("Review retry scope")).toHaveCount(0);
  await opsTagFilterChip.getByRole("button", { name: "Remove tag filter ops" }).click();
  await expect(tagFilterField.locator(".subnav__tag-filter-chip")).toHaveCount(0);
  await expect(tagFilterInput).toHaveValue("");
  await expect(page.getByText("Review retry scope")).toBeVisible();
  await expect(page.getByText("Queue copy pass")).toBeVisible();
  await page.goto("/projects/project-1?tags=ops,backend");
  const routedOpsTagFilterChip = tagFilterField.locator(".subnav__tag-filter-chip", { hasText: "ops" });
  await expect(routedOpsTagFilterChip).toBeVisible();
  await expect(tagFilterField.locator(".subnav__tag-filter-chip", { hasText: "backend" })).toHaveCount(0);
  await expect(page.getByText("Remove healthcheck loop")).toBeVisible();
  await expect(page.getByText("Review retry scope")).toHaveCount(0);
  await routedOpsTagFilterChip.getByRole("button", { name: "Remove tag filter ops" }).click();
  await page.goto("/projects/project-1");
  await expect(page.getByTestId("task-card-task-4")).toBeVisible();

  const todoColumn = page.getByTestId(`board-column-${laneId("project-1", "todo")}`);
  const todoColumnBox = await todoColumn.boundingBox();
  const todoCardBox = await page.getByTestId("task-card-task-1").boundingBox();
  expect(todoColumnBox).not.toBeNull();
  expect(todoCardBox).not.toBeNull();
  expect(((todoCardBox?.y ?? 0) - (todoColumnBox?.y ?? 0)) / (todoColumnBox?.height ?? 1)).toBeLessThan(0.3);

  const queueCopyCard = page.getByTestId("task-card-task-4");
  const retryCard = page.getByTestId("task-card-task-1");
  const retryCardBox = await retryCard.boundingBox();
  expect(retryCardBox).not.toBeNull();
  await page.mouse.move(
    (retryCardBox?.x ?? 0) + (retryCardBox?.width ?? 0) / 2,
    (retryCardBox?.y ?? 0) + (retryCardBox?.height ?? 0) / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    (retryCardBox?.x ?? 0) + (retryCardBox?.width ?? 0) / 2,
    (retryCardBox?.y ?? 0) + (retryCardBox?.height ?? 0) / 2 + 18,
    { steps: 6 }
  );
  await expect(page.getByText("Drop here")).toHaveCount(0);
  const queueCopyCardTargetBox = await queueCopyCard.boundingBox();
  expect(queueCopyCardTargetBox).not.toBeNull();
  await page.mouse.move(
    (queueCopyCardTargetBox?.x ?? 0) + (queueCopyCardTargetBox?.width ?? 0) / 2,
    (queueCopyCardTargetBox?.y ?? 0) + (queueCopyCardTargetBox?.height ?? 0) * 0.82,
    { steps: 18 }
  );
  await page.mouse.up();
  const todoTitles = todoColumn.locator(".task-card__title");
  await expect(todoTitles.nth(0)).toHaveText("Queue copy pass");
  await expect(todoTitles.nth(1)).toHaveText("Review retry scope");

  await page.getByRole("button", { name: "Create Lane" }).click();
  const laneDialog = page.getByRole("dialog", { name: "Create Lane" });
  await expect(laneDialog).toBeVisible();
  await laneDialog.getByLabel("Lane name").fill("Ready for QA");
  await laneDialog.getByRole("button", { exact: true, name: "Create Lane" }).click();

  await expect(page.getByRole("heading", { name: "Ready for QA" })).toBeVisible();
  const laneHeadings = page.locator(".board-column__header h2");
  await expect(laneHeadings).toHaveText(["Todo", "In Progress", "In review", "Done", "Ready for QA"]);

  const qaLaneHeader = page.getByTestId("lane-header-project-1-lane-custom-1");
  const qaLaneDeleteButton = page.getByLabel("Delete lane Ready for QA");
  await expect(qaLaneDeleteButton).toBeVisible();
  await expect(qaLaneDeleteButton).toHaveCSS("border-top-width", "0px");

  await qaLaneHeader.dragTo(page.getByTestId(`board-column-${laneId("project-1", "in_progress")}`), {
    targetPosition: { x: 16, y: 40 }
  });
  await expect(laneHeadings).toHaveText(["Todo", "Ready for QA", "In Progress", "In review", "Done"]);

  const qaColumn = page.getByTestId("board-column-project-1-lane-custom-1");
  await qaColumn.dblclick();

  const laneInput = page.getByLabel("New task title for Ready for QA");
  await expect(laneInput).toBeVisible();
  await expect(qaColumn.locator(".lane-composer .field__label")).toHaveCount(0);
  // Keep this title comfortably on one line so the timestamp-alignment check is stable in CI.
  await laneInput.fill("Ship note");
  await laneInput.press("Enter");

  await expect(page.getByText("Ship note")).toBeVisible();
  const createdCard = page.getByTestId("task-card-task-5");
  await expect(createdCard.locator(".task-tag")).toHaveCount(0);
  const createdCardTitleBox = await createdCard.locator(".task-card__title").boundingBox();
  const createdCardTimestampBox = await createdCard.locator(".task-card__timestamp").boundingBox();
  const createdCardDeleteButtonBox = await createdCard.getByLabel("Delete task Ship note").boundingBox();
  expect(createdCardTitleBox).not.toBeNull();
  expect(createdCardTimestampBox).not.toBeNull();
  expect(createdCardDeleteButtonBox).not.toBeNull();
  expect(
    Math.abs(
      ((createdCardTitleBox?.y ?? 0) + (createdCardTitleBox?.height ?? 0) / 2) -
        ((createdCardTimestampBox?.y ?? 0) + (createdCardTimestampBox?.height ?? 0) / 2)
    )
  ).toBeLessThan(10);
  expect(createdCardTimestampBox?.x ?? 0).toBeGreaterThan(
    ((createdCardTitleBox?.x ?? 0) + (createdCardTitleBox?.width ?? 0) * 0.65)
  );
  expect(
    Math.abs(
      ((createdCardTitleBox?.y ?? 0) + (createdCardTitleBox?.height ?? 0) / 2) -
        ((createdCardDeleteButtonBox?.y ?? 0) + (createdCardDeleteButtonBox?.height ?? 0) / 2)
    )
  ).toBeLessThan(10);
  expect(
    Math.abs(
      ((createdCardTimestampBox?.y ?? 0) + (createdCardTimestampBox?.height ?? 0) / 2) -
        ((createdCardDeleteButtonBox?.y ?? 0) + (createdCardDeleteButtonBox?.height ?? 0) / 2)
    )
  ).toBeLessThan(10);

  const retryCardDragBox = await retryCard.boundingBox();
  expect(retryCardDragBox).not.toBeNull();
  await page.mouse.move(
    (retryCardDragBox?.x ?? 0) + (retryCardDragBox?.width ?? 0) / 2,
    (retryCardDragBox?.y ?? 0) + (retryCardDragBox?.height ?? 0) / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    (retryCardDragBox?.x ?? 0) + (retryCardDragBox?.width ?? 0) / 2 + 18,
    (retryCardDragBox?.y ?? 0) + (retryCardDragBox?.height ?? 0) / 2,
    { steps: 6 }
  );
  await expect(page.getByText("Drop here")).toHaveCount(0);
  const createdCardBox = await createdCard.boundingBox();
  expect(createdCardBox).not.toBeNull();
  await page.mouse.move(
    (createdCardBox?.x ?? 0) + (createdCardBox?.width ?? 0) / 2,
    (createdCardBox?.y ?? 0) + (createdCardBox?.height ?? 0) * 0.8,
    { steps: 24 }
  );
  await expect(qaColumn).toHaveClass(/is-drop-target/);
  await page.mouse.up();
  await page.waitForTimeout(200);
  await expect(qaColumn.getByText("Review retry scope")).toBeVisible();
  await expect(todoColumn.getByText("Review retry scope")).toHaveCount(0);

  await expect(page.locator(".column-empty")).toHaveCount(0);
  await createdCard.getByLabel("Delete task Ship note").click();
  await expect(createdCard.getByRole("button", { exact: true, name: "Delete" })).toBeVisible();
  await createdCard.getByRole("button", { exact: true, name: "Delete" }).click();
  await expect(page.getByText("Ship note")).toHaveCount(0);

  await qaLaneDeleteButton.click();
  const laneDeleteDialog = page.getByRole("alertdialog", { name: "Delete lane Ready for QA" });
  await expect(laneDeleteDialog).toBeVisible();
  await expect(laneDeleteDialog.getByText("Delete this lane?")).toBeVisible();
  await expect(laneDeleteDialog.getByLabel("Move tasks from Ready for QA to")).toBeVisible();
  await laneDeleteDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Ready for QA" })).toBeVisible();

  await qaLaneDeleteButton.click();
  await laneDeleteDialog.getByLabel("Move tasks from Ready for QA to").selectOption(laneId("project-1", "done"));
  await laneDeleteDialog.getByRole("button", { exact: true, name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: "Ready for QA" })).toHaveCount(0);
  await expect(page.getByTestId(`board-column-${laneId("project-1", "done")}`).getByText("Review retry scope")).toBeVisible();
  await expect(qaColumn).toHaveCount(0);
});

test("board nav switcher changes, renames, and creates projects", async ({ page }) => {
  await mockAuthenticated(page, {
    nextProjectId: 7,
    projects: projectsForGrid
  });

  await page.goto("/projects/project-1");

  const switcherButton = page.getByRole("button", { name: "Open project switcher" });
  await switcherButton.click();

  const switcherInput = page.getByLabel("Project switcher input");
  await switcherInput.fill("road");
  await expect(page.getByRole("button", { name: "Open project Roadmap review" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open project Billing cleanup" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open project Roadmap review" }).click();

  await expect(page).toHaveURL(/\/projects\/project-2$/);
  await expect(page.locator(".subnav__current-value")).toHaveText("Roadmap review");

  await page.goto("/projects/project-1");
  await switcherButton.click();
  await page.getByLabel("Project switcher input").fill("Billing relaunch");
  await page.getByRole("button", { name: "Rename Project" }).click();

  await expect(page.locator(".subnav__current-value")).toHaveText("Billing relaunch");

  await switcherButton.click();
  await page.getByLabel("Project switcher input").fill("Program rollout");
  await page.getByRole("button", { name: "Create Project" }).click();

  await expect(page).toHaveURL(/\/projects\/project-7$/);
  await expect(page.locator(".subnav__current-value")).toHaveText("Program rollout");
  await expect(page.locator(".board-column__header h2")).toHaveText([
    "Todo",
    "In Progress",
    "In review",
    "Done"
  ]);

  for (const laneName of ["Todo", "In Progress", "In review"]) {
    await page.getByLabel(`Delete lane ${laneName}`).click();
    const deleteDialog = page.getByRole("alertdialog", { name: `Delete lane ${laneName}` });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { exact: true, name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: laneName })).toHaveCount(0);
  }

  await page.getByLabel("Delete lane Done").click();
  const lastLaneDialog = page.getByRole("alertdialog", { name: "Delete lane Done" });
  await expect(lastLaneDialog).toBeVisible();
  await lastLaneDialog.getByRole("button", { exact: true, name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: "Done" })).toBeVisible();
  await expect(page.getByText("Projects must keep at least one lane.")).toBeVisible();
});
