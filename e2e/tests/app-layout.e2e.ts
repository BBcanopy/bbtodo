import { expect, test, type Page, type Route } from "@playwright/test";

type TaskStatus = "todo" | "in_progress" | "done";

interface BoardLane {
  createdAt: string;
  id: string;
  name: string;
  position: number;
  projectId: string;
  systemKey: TaskStatus | null;
  taskCount: number;
  updatedAt: string;
}

interface Project {
  createdAt: string;
  id: string;
  laneSummaries: BoardLane[];
  name: string;
  taskCounts: Record<TaskStatus, number>;
  updatedAt: string;
}

interface Task {
  body: string;
  createdAt: string;
  id: string;
  laneId: string | null;
  position: number;
  projectId: string;
  status: TaskStatus;
  title: string;
  updatedAt: string;
}

const user = {
  email: "operator@example.com",
  id: "user-1",
  name: "Nadia Vale"
};

function laneId(projectId: string, suffix: TaskStatus) {
  return `${projectId}-lane-${suffix}`;
}

function createDefaultLaneSummaries(
  projectId: string,
  counts: Record<TaskStatus, number>
): BoardLane[] {
  return [
    {
      createdAt: "2026-03-17T09:00:00.000Z",
      id: laneId(projectId, "todo"),
      name: "Todo",
      position: 0,
      projectId,
      systemKey: "todo",
      taskCount: counts.todo,
      updatedAt: "2026-03-18T07:30:00.000Z"
    },
    {
      createdAt: "2026-03-17T09:00:00.000Z",
      id: laneId(projectId, "in_progress"),
      name: "In Progress",
      position: 1,
      projectId,
      systemKey: "in_progress",
      taskCount: counts.in_progress,
      updatedAt: "2026-03-18T07:30:00.000Z"
    },
    {
      createdAt: "2026-03-17T09:00:00.000Z",
      id: laneId(projectId, "done"),
      name: "Done",
      position: 2,
      projectId,
      systemKey: "done",
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
      done: 1
    }),
    name: "Billing cleanup",
    taskCounts: {
      todo: 2,
      in_progress: 1,
      done: 1
    },
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
      done: 0
    }),
    name: "Roadmap review",
    taskCounts: {
      todo: 0,
      in_progress: 0,
      done: 0
    },
    updatedAt: "2026-03-18T08:10:00.000Z"
  },
  {
    createdAt: "2026-03-17T11:00:00.000Z",
    id: "project-3",
    laneSummaries: createDefaultLaneSummaries("project-3", {
      todo: 2,
      in_progress: 1,
      done: 0
    }),
    name: "Release prep",
    taskCounts: {
      todo: 2,
      in_progress: 1,
      done: 0
    },
    updatedAt: "2026-03-18T08:20:00.000Z"
  },
  {
    createdAt: "2026-03-17T12:00:00.000Z",
    id: "project-4",
    laneSummaries: createDefaultLaneSummaries("project-4", {
      todo: 1,
      in_progress: 0,
      done: 3
    }),
    name: "Customer follow-up",
    taskCounts: {
      todo: 1,
      in_progress: 0,
      done: 3
    },
    updatedAt: "2026-03-18T08:30:00.000Z"
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
    status: "todo",
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
    status: "in_progress",
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
    status: "done",
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
    status: "todo",
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
    tasks?: Task[];
  }
) {
  let nextProjectId = options?.nextProjectId ?? 2;
  let nextLaneId = 1;
  let nextTaskId = 5;
  let isAuthenticated = true;
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
    project.taskCounts = {
      todo: 0,
      in_progress: 0,
      done: 0
    };

    for (const lane of project.laneSummaries) {
      if (lane.systemKey) {
        project.taskCounts[lane.systemKey] = lane.taskCount;
      }
    }
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
          laneId?: string;
          name?: string;
          position?: number;
          status?: TaskStatus;
          title?: string;
        }
      | null;

    switch (key) {
      case "GET /api/v1/me":
        if (!isAuthenticated) {
          await fulfillJson(route, 401, { message: "Unauthorized" });
          return;
        }

        await fulfillJson(route, 200, user);
        return;
      case "GET /api/v1/projects":
        syncAllProjects();
        await fulfillJson(route, 200, projectState);
        return;
      case "POST /api/v1/projects": {
        const createdProjectId = `project-${nextProjectId++}`;
        const createdProject: Project = {
          createdAt: "2026-03-18T08:00:00.000Z",
          id: createdProjectId,
          laneSummaries: createDefaultLaneSummaries(createdProjectId, {
            todo: 0,
            in_progress: 0,
            done: 0
          }),
          name: body?.title ?? body?.name ?? "Untitled board",
          taskCounts: {
            todo: 0,
            in_progress: 0,
            done: 0
          },
          updatedAt: "2026-03-18T08:00:00.000Z"
        };
        projectState.unshift(createdProject);
        await fulfillJson(route, 201, createdProject);
        return;
      }
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
        systemKey: null,
        taskCount: 0,
        updatedAt: "2026-03-18T08:15:00.000Z"
      };
      project.laneSummaries.push(createdLane);
      syncProject(projectId);
      await fulfillJson(route, 201, createdLane);
      return;
    }

    if (request.method() === "GET" && url.pathname.startsWith("/api/v1/projects/") && url.pathname.endsWith("/tasks")) {
      const projectId = url.pathname.split("/")[4];
      const project = getProject(projectId);
      if (!project) {
        await fulfillJson(route, 404, { message: "Project not found." });
        return;
      }

      const status = url.searchParams.get("status") as TaskStatus | null;
      let visibleTasks = sortTasksForProject(projectId);

      if (status) {
        const lane = project.laneSummaries.find((candidate) => candidate.systemKey === status);
        visibleTasks = lane ? visibleTasks.filter((task) => task.laneId === lane.id) : [];
      }

      await fulfillJson(route, 200, visibleTasks);
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
        status: targetLane.systemKey ?? "todo",
        title: body?.title ?? "Untitled task",
        updatedAt: "2026-03-18T08:00:00.000Z"
      };
      taskState.push(createdTask);
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
        (body?.status ? project.laneSummaries.find((lane) => lane.systemKey === body.status) : undefined) ??
        project.laneSummaries.find((lane) => lane.id === task.laneId);
      if (!nextLane) {
        await fulfillJson(route, 404, { message: `Task or lane not found.` });
        return;
      }

      if (body?.laneId !== undefined || body?.position !== undefined || body?.status !== undefined) {
        moveTask(task, nextLane.id, body?.position ?? sortTasksForProject(projectId, nextLane.id).length);
      }

      task.body = body?.body ?? task.body;
      task.title = body?.title ?? task.title;
      task.status = body?.status ?? nextLane.systemKey ?? task.status;
      task.updatedAt = "2026-03-18T08:05:00.000Z";
      syncProject(projectId);
      await fulfillJson(route, 200, task);
      return;
    }

    await fulfillJson(route, 404, { message: `Unhandled route: ${key}` });
  });
}

test("login screen uses the updated cool accent palette", async ({ page }) => {
  await mockUnauthenticated(page);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "BBTodo" })).toBeVisible();
  await expect(page.locator(".hero-panel__brand .eyebrow")).toHaveCount(0);
  await expect(page.locator(".preview-panel")).toHaveCount(0);
  await expect(page.locator(".metric-ribbon")).toHaveCount(0);
  await expect(page.getByText("Live shape")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in with OIDC" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Read API docs" })).toBeVisible();
  const loginPanelBox = await page.locator(".hero-panel--simple").boundingBox();
  const viewport = page.viewportSize();
  expect(loginPanelBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  const panelCenterX = (loginPanelBox?.x ?? 0) + (loginPanelBox?.width ?? 0) / 2;
  const viewportCenterX = (viewport?.width ?? 0) / 2;
  expect(Math.abs(panelCenterX - viewportCenterX)).toBeLessThan(20);
  expect((loginPanelBox?.width ?? 0) / (viewport?.width ?? 1)).toBeGreaterThan(0.45);

  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  expect(accent).toBe("#2f7774");
});

test("projects page uses a modal create flow and removes extra board chrome", async ({ page }) => {
  await mockAuthenticated(page, {
    nextProjectId: 5,
    projects: projectsForGrid
  });

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
  await expect(page.getByTestId("project-card-project-1").getByLabel("Done 1")).toBeVisible();
  await expect(page.locator(".subnav__current")).toHaveCount(0);
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
  const createProjectLink = page.getByRole("link", { name: "Create Project" });
  const createProjectLinkBox = await createProjectLink.boundingBox();
  const createProjectBackground = await createProjectLink.evaluate((element) => getComputedStyle(element).backgroundColor);
  const createProjectHeight = await createProjectLink.evaluate((element) => parseFloat(getComputedStyle(element).height));
  const projectGridBox = await page.locator(".project-grid").boundingBox();
  const firstCard = page.getByTestId("project-card-project-1");
  const secondCard = page.getByTestId("project-card-project-2");
  const thirdCard = page.getByTestId("project-card-project-3");
  const firstCardBox = await firstCard.boundingBox();
  const secondCardBox = await secondCard.boundingBox();
  const thirdCardBox = await thirdCard.boundingBox();
  const viewportWidth = page.viewportSize()?.width ?? 0;
  expect(projectsPageBox).not.toBeNull();
  expect((projectsPageBox?.width ?? 0)).toBeGreaterThan(viewportWidth - 80);
  expect(projectGridBox).not.toBeNull();
  expect(firstCardBox).not.toBeNull();
  expect(secondCardBox).not.toBeNull();
  expect(thirdCardBox).not.toBeNull();
  expect((firstCardBox?.x ?? 0) - (projectGridBox?.x ?? 0)).toBeLessThan(24);
  expect((firstCardBox?.y ?? 0) - (projectGridBox?.y ?? 0)).toBeLessThan(24);
  expect(Math.abs((firstCardBox?.width ?? 0) - (secondCardBox?.width ?? 0))).toBeLessThan(2);
  expect(Math.abs((firstCardBox?.width ?? 0) - (thirdCardBox?.width ?? 0))).toBeLessThan(2);
  expect(Math.abs((firstCardBox?.height ?? 0) - (secondCardBox?.height ?? 0))).toBeLessThan(2);
  expect(Math.abs((firstCardBox?.height ?? 0) - (thirdCardBox?.height ?? 0))).toBeLessThan(2);
  expect(Math.abs((firstCardBox?.y ?? 0) - (secondCardBox?.y ?? 0))).toBeLessThan(16);
  expect((secondCardBox?.x ?? 0) - ((firstCardBox?.x ?? 0) + (firstCardBox?.width ?? 0))).toBeLessThan(32);
  expect(createProjectLinkBox).not.toBeNull();
  expect((createProjectLinkBox?.x ?? 0)).toBeGreaterThan(120);
  expect(createProjectBackground).toBe("rgba(0, 0, 0, 0)");
  expect(createProjectHeight).toBeLessThan(36);
  await expect(page.locator(".subnav__action-mark")).toHaveText("+");

  await createProjectLink.click();

  const dialog = page.getByRole("dialog", { name: "Create Project" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Project name").fill("Roadmap review");
  await dialog.getByRole("button", { exact: true, name: "Create Project" }).click();

  await expect(page).toHaveURL(/\/projects\/project-5$/);
  await expect(page).toHaveTitle("Roadmap review | BBTodo");
  await expect(page.getByTestId("board-grid")).toBeVisible();
  await expect(page.locator(".subnav__current")).toHaveText("Roadmap review");

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
  expect(projectCardBox).not.toBeNull();
  expect(projectTitleBox).not.toBeNull();
  expect(projectTimestampBox).not.toBeNull();
  expect(projectCardBox?.width ?? 0).toBeLessThan(700);
  expect(((projectTitleBox?.y ?? 0) - (projectCardBox?.y ?? 0)) / (projectCardBox?.height ?? 1)).toBeLessThan(0.28);
  await expect(projectTimestamp).toHaveText("2026-03-18");
  await expect(projectTimestamp).toHaveAttribute("datetime", "2026-03-18T07:30:00.000Z");
  expect(((projectTimestampBox?.y ?? 0) - (projectCardBox?.y ?? 0)) / (projectCardBox?.height ?? 1)).toBeGreaterThan(0.72);

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
  await mockAuthenticated(page);

  await page.goto("/projects/project-1");

  await expect(page).toHaveTitle("Billing cleanup | BBTodo");
  await expect(page.locator(".page-intro")).toHaveCount(0);
  await expect(page.locator(".workspace-header")).toHaveCount(0);
  await expect(page.locator(".workspace-form")).toHaveCount(0);
  await expect(page.locator(".workspace-summary")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back to projects" })).toHaveCount(0);
  await expect(page.locator(".subnav__current")).toHaveText("Billing cleanup");
  await expect(page.getByRole("button", { name: "Create Lane" })).toBeVisible();
  await expect(page.getByLabel("Search cards")).toBeVisible();

  const maxWidth = await page.locator(".page-shell--board").evaluate((element) => getComputedStyle(element).maxWidth);
  expect(maxWidth).toBe("none");

  const boardBox = await page.getByTestId("board-grid").boundingBox();
  expect(boardBox).not.toBeNull();

  const viewportWidth = page.viewportSize()?.width ?? 0;
  expect(boardBox?.width ?? 0).toBeGreaterThan(viewportWidth - 80);

  await expect(page.locator(".board-column")).toHaveCount(3);
  await expect(page.locator(".board-column__note")).toHaveCount(0);
  await expect(page.locator(".board-column__header > span")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Move to / })).toHaveCount(0);
  await expect(page.getByTestId("task-card-task-1").locator(".label-chip")).toHaveCount(0);
  await expect(page.getByTestId("task-card-task-1").locator(".task-card__timestamp")).toHaveText("2026-03-18");
  await expect(page.getByTestId("task-card-task-1").locator(".task-card__timestamp")).toHaveAttribute(
    "datetime",
    "2026-03-18T07:10:00.000Z"
  );

  await page.getByTestId("task-card-task-1").click();
  const editDialog = page.getByRole("dialog", { name: "Edit Card" });
  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByLabel("Title")).toHaveValue("Review retry settings");
  await expect(editDialog.getByLabel("Task body")).toHaveValue("Callback logs mention **retry** scope.");
  await expect(editDialog.locator(".markdown-preview strong")).toHaveText("retry");
  await editDialog.getByLabel("Title").fill("Review retry scope");
  await editDialog
    .getByLabel("Task body")
    .fill("Callback logs mention **scope**.\n\n- Keep raw claims\n- Verify issuer");
  await expect(editDialog.locator(".markdown-preview strong")).toHaveText("scope");
  await expect(editDialog.locator(".markdown-preview li")).toHaveCount(2);
  await editDialog.getByRole("button", { name: "Save card" }).click();
  await expect(editDialog).toHaveCount(0);
  await expect(page.getByTestId("task-card-task-1").getByText("Review retry scope")).toBeVisible();

  await page.getByLabel("Search cards").fill("callback");
  await expect(page.getByText("Review retry scope")).toBeVisible();
  await expect(page.getByText("Tighten callback logging")).toBeVisible();
  await expect(page.getByText("Remove healthcheck loop")).toHaveCount(0);
  await page.getByLabel("Search cards").fill("");

  const todoColumn = page.getByTestId("board-column-todo");
  const todoColumnBox = await todoColumn.boundingBox();
  const todoCardBox = await page.getByTestId("task-card-task-1").boundingBox();
  expect(todoColumnBox).not.toBeNull();
  expect(todoCardBox).not.toBeNull();
  expect(((todoCardBox?.y ?? 0) - (todoColumnBox?.y ?? 0)) / (todoColumnBox?.height ?? 1)).toBeLessThan(0.3);

  const reorderTransfer = await page.evaluateHandle(() => new DataTransfer());
  const queueCopyCard = page.getByTestId("task-card-task-4");
  const retryCard = page.getByTestId("task-card-task-1");
  const retryCardBox = await retryCard.boundingBox();
  expect(retryCardBox).not.toBeNull();
  await queueCopyCard.dispatchEvent("dragstart", { dataTransfer: reorderTransfer });
  await retryCard.dispatchEvent("dragover", {
    clientY: (retryCardBox?.y ?? 0) + (retryCardBox?.height ?? 0) * 0.25,
    dataTransfer: reorderTransfer
  });
  await expect(page.getByTestId(`task-drop-indicator-${laneId("project-1", "todo")}-0`)).toBeVisible();
  await todoColumn.dispatchEvent("drop", { dataTransfer: reorderTransfer });
  const todoTitles = todoColumn.locator(".task-card__title");
  await expect(todoTitles.nth(0)).toHaveText("Queue copy pass");
  await expect(todoTitles.nth(1)).toHaveText("Review retry scope");

  await page.getByRole("button", { name: "Create Lane" }).click();
  const laneDialog = page.getByRole("dialog", { name: "Create Lane" });
  await expect(laneDialog).toBeVisible();
  await laneDialog.getByLabel("Lane name").fill("Ready for QA");
  await laneDialog.getByRole("button", { exact: true, name: "Create Lane" }).click();

  await expect(page.getByRole("heading", { name: "Ready for QA" })).toBeVisible();

  const qaColumn = page.getByTestId("board-column-project-1-lane-custom-1");
  await qaColumn.dblclick();

  const laneInput = page.getByLabel("New task title for Ready for QA");
  await expect(laneInput).toBeVisible();
  await laneInput.fill("Ship progress note");
  await laneInput.press("Enter");

  await expect(page.getByText("Ship progress note")).toBeVisible();

  const moveTransfer = await page.evaluateHandle(() => new DataTransfer());
  await retryCard.dispatchEvent("dragstart", { dataTransfer: moveTransfer });
  await qaColumn.locator(".board-column__content").dispatchEvent("dragover", { dataTransfer: moveTransfer });
  await expect(page.getByTestId(`task-drop-indicator-project-1-lane-custom-1-1`)).toBeVisible();
  await expect(qaColumn).toHaveClass(/is-drop-target/);
  await qaColumn.dispatchEvent("drop", { dataTransfer: moveTransfer });
  await expect(qaColumn.getByText("Review retry scope")).toBeVisible();
  await expect(todoColumn.getByText("Review retry scope")).toHaveCount(0);

  await expect(page.locator(".column-empty")).toHaveCount(0);

  const createdCard = page.getByTestId("task-card-task-5");
  await createdCard.getByLabel("Delete task Ship progress note").click();
  await expect(createdCard.getByRole("button", { exact: true, name: "Delete" })).toBeVisible();
  await createdCard.getByRole("button", { exact: true, name: "Delete" }).click();
  await expect(page.getByText("Ship progress note")).toHaveCount(0);
});
