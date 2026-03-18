import { expect, test, type Page, type Route } from "@playwright/test";

const user = {
  email: "operator@example.com",
  id: "user-1",
  name: "Nadia Vale"
};

const projects = [
  {
    createdAt: "2026-03-17T09:00:00.000Z",
    id: "project-1",
    name: "Billing cleanup",
    taskCounts: {
      todo: 1,
      in_progress: 1,
      done: 1
    },
    updatedAt: "2026-03-18T07:30:00.000Z"
  }
];

const projectsForGrid = [
  ...projects,
  {
    createdAt: "2026-03-17T10:00:00.000Z",
    id: "project-2",
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
    name: "Customer follow-up",
    taskCounts: {
      todo: 1,
      in_progress: 0,
      done: 3
    },
    updatedAt: "2026-03-18T08:30:00.000Z"
  }
];

const tasks = [
  {
    createdAt: "2026-03-18T07:00:00.000Z",
    id: "task-1",
    projectId: "project-1",
    status: "todo",
    title: "Review retry settings",
    updatedAt: "2026-03-18T07:10:00.000Z"
  },
  {
    createdAt: "2026-03-18T07:20:00.000Z",
    id: "task-2",
    projectId: "project-1",
    status: "in_progress",
    title: "Tighten callback logging",
    updatedAt: "2026-03-18T07:45:00.000Z"
  },
  {
    createdAt: "2026-03-18T06:50:00.000Z",
    id: "task-3",
    projectId: "project-1",
    status: "done",
    title: "Remove healthcheck loop",
    updatedAt: "2026-03-18T07:50:00.000Z"
  }
];

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body)
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
    projects?: typeof projects;
    nextProjectId?: number;
  }
) {
  let nextProjectId = options?.nextProjectId ?? 2;
  let nextTaskId = 4;
  let isAuthenticated = true;
  const projectState = (options?.projects ?? projects).map((project) => ({ ...project }));
  const taskState = tasks.map((task) => ({ ...task }));

  await page.route("**/auth/logout", async (route) => {
    isAuthenticated = false;
    await fulfillJson(route, 200, null);
  });

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}`;
    const body = request.postDataJSON() as { name?: string; status?: string; title?: string } | null;

    switch (key) {
      case "GET /api/v1/me":
        if (!isAuthenticated) {
          await fulfillJson(route, 401, { message: "Unauthorized" });
          return;
        }

        await fulfillJson(route, 200, user);
        return;
      case "GET /api/v1/projects":
        await fulfillJson(route, 200, projectState);
        return;
      case "POST /api/v1/projects": {
        const createdProject = {
          createdAt: "2026-03-18T08:00:00.000Z",
          id: `project-${nextProjectId++}`,
          name: body?.title ?? body?.name ?? "Untitled board",
          taskCounts: {
            todo: 0,
            in_progress: 0,
            done: 0
          },
          updatedAt: "2026-03-18T08:00:00.000Z"
        };
        projectState.unshift(createdProject);
        await fulfillJson(route, 200, createdProject);
        return;
      }
      case "POST /api/v1/projects/project-1/tasks": {
        const createdTask = {
          createdAt: "2026-03-18T08:00:00.000Z",
          id: `task-${nextTaskId++}`,
          projectId: "project-1",
          status: "todo",
          title: body?.title ?? "Untitled task",
          updatedAt: "2026-03-18T08:00:00.000Z"
        };
        taskState.unshift(createdTask);
        await fulfillJson(route, 200, createdTask);
        return;
      }
      case "GET /api/v1/api-tokens":
        await fulfillJson(route, 200, []);
        return;
      default:
        if (request.method() === "GET" && url.pathname.startsWith("/api/v1/projects/") && url.pathname.endsWith("/tasks")) {
          const projectId = url.pathname.split("/")[4];
          await fulfillJson(route, 200, taskState.filter((task) => task.projectId === projectId));
          return;
        }

        if (request.method() === "DELETE" && url.pathname.startsWith("/api/v1/projects/") && !url.pathname.includes("/tasks/")) {
          const projectId = url.pathname.split("/").pop();
          const projectIndex = projectState.findIndex((candidate) => candidate.id === projectId);

          if (projectIndex === -1) {
            await fulfillJson(route, 404, { message: `Project not found: ${projectId}` });
            return;
          }

          projectState.splice(projectIndex, 1);
          await fulfillJson(route, 200, null);
          return;
        }

        if (request.method() === "DELETE" && url.pathname.startsWith("/api/v1/projects/project-1/tasks/")) {
          const taskId = url.pathname.split("/").pop();
          const taskIndex = taskState.findIndex((candidate) => candidate.id === taskId);

          if (taskIndex === -1) {
            await fulfillJson(route, 404, { message: `Task not found: ${taskId}` });
            return;
          }

          taskState.splice(taskIndex, 1);
          await fulfillJson(route, 200, null);
          return;
        }

        if (request.method() === "PATCH" && url.pathname.startsWith("/api/v1/projects/project-1/tasks/")) {
          const taskId = url.pathname.split("/").pop();
          const task = taskState.find((candidate) => candidate.id === taskId);

          if (!task) {
            await fulfillJson(route, 404, { message: `Task not found: ${taskId}` });
            return;
          }

          if (body?.title) {
            task.title = body.title;
          }

          if (body?.status === "todo" || body?.status === "in_progress" || body?.status === "done") {
            task.status = body.status;
          }

          task.updatedAt = "2026-03-18T08:05:00.000Z";
          await fulfillJson(route, 200, task);
          return;
        }

        await fulfillJson(route, 404, { message: `Unhandled route: ${key}` });
    }
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
    projects: projectsForGrid,
    nextProjectId: 5
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
  await expect(page.getByTestId("project-card-project-1").getByLabel("Todo 1")).toBeVisible();
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

test("board workspace uses the full available width", async ({ page }) => {
  await mockAuthenticated(page);

  await page.goto("/projects/project-1");

  await expect(page).toHaveTitle("Billing cleanup | BBTodo");
  await expect(page.locator(".page-intro")).toHaveCount(0);
  await expect(page.locator(".workspace-header")).toHaveCount(0);
  await expect(page.locator(".workspace-form")).toHaveCount(0);
  await expect(page.locator(".workspace-summary")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back to projects" })).toHaveCount(0);
  await expect(page.locator(".subnav__current")).toHaveText("Billing cleanup");

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

  const todoColumn = page.getByTestId("board-column-todo");
  const todoColumnBox = await todoColumn.boundingBox();
  const todoCardBox = await page.getByTestId("task-card-task-1").boundingBox();
  expect(todoColumnBox).not.toBeNull();
  expect(todoCardBox).not.toBeNull();
  expect(((todoCardBox?.y ?? 0) - (todoColumnBox?.y ?? 0)) / (todoColumnBox?.height ?? 1)).toBeLessThan(0.3);

  const inProgressColumn = page.getByTestId("board-column-in_progress");
  await inProgressColumn.dblclick();

  const laneInput = inProgressColumn.getByLabel("New task title for In Progress");
  await expect(laneInput).toBeVisible();
  await laneInput.fill("Ship progress note");
  await laneInput.press("Enter");

  await expect(inProgressColumn.getByText("Ship progress note")).toBeVisible();

  const todoCard = page.getByTestId("task-card-task-1");
  const doneColumn = page.getByTestId("board-column-done");
  await todoCard.dragTo(doneColumn);
  await expect(doneColumn.getByText("Review retry settings")).toBeVisible();
  await expect(page.locator(".column-empty")).toHaveCount(0);

  const createdCard = page.getByTestId("task-card-task-4");
  await createdCard.getByLabel("Delete task Ship progress note").click();
  await expect(createdCard.getByRole("button", { exact: true, name: "Delete" })).toBeVisible();
  await createdCard.getByRole("button", { exact: true, name: "Delete" }).click();
  await expect(page.getByText("Ship progress note")).toHaveCount(0);
});
