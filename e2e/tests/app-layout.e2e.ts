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

async function mockAuthenticated(page: Page) {
  let nextProjectId = 2;
  let nextTaskId = 4;
  const projectState = projects.map((project) => ({ ...project }));
  const taskState = tasks.map((task) => ({ ...task }));

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}`;
    const body = request.postDataJSON() as { name?: string; status?: string; title?: string } | null;

    switch (key) {
      case "GET /api/v1/me":
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

  await expect(page.getByRole("heading", { name: "Simple boards for work that should stay clear." })).toBeVisible();

  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  expect(accent).toBe("#2f7774");
});

test("projects page uses a modal create flow and removes extra board chrome", async ({ page }) => {
  await mockAuthenticated(page);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Boards" })).toBeVisible();
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
  await expect(page.getByLabel("Todo 1")).toBeVisible();
  await expect(page.getByLabel("In Progress 1")).toBeVisible();
  await expect(page.getByLabel("Done 1")).toBeVisible();
  await expect(page.locator(".topbar__identity")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "API tokens" })).toHaveCount(0);
  await expect(page.getByLabel("Open account menu")).toHaveText("N");
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "API tokens" })).toHaveCount(0);

  const projectsMaxWidth = await page.locator(".page-shell--projects").evaluate((element) => getComputedStyle(element).maxWidth);
  expect(projectsMaxWidth).toBe("none");

  const projectsPageBox = await page.locator(".page-shell--projects").boundingBox();
  const createBoardButton = page.getByRole("button", { name: "Create board" });
  const createBoardButtonBox = await createBoardButton.boundingBox();
  const viewportWidth = page.viewportSize()?.width ?? 0;
  expect(projectsPageBox).not.toBeNull();
  expect((projectsPageBox?.width ?? 0)).toBeGreaterThan(viewportWidth - 80);
  expect(createBoardButtonBox).not.toBeNull();
  expect((createBoardButtonBox?.x ?? 0) + (createBoardButtonBox?.width ?? 0)).toBeGreaterThan(viewportWidth - 80);

  await createBoardButton.click();

  const dialog = page.getByRole("dialog", { name: "Create board" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Project name").fill("Roadmap review");
  await dialog.getByRole("button", { exact: true, name: "Create board" }).click();

  await expect(page).toHaveURL(/\/projects\/project-2$/);
  await expect(page.getByTestId("board-grid")).toBeVisible();

  await page.getByLabel("Open account menu").click();

  await expect(page.getByRole("menuitem", { name: "API tokens" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();

  await page.getByRole("menuitem", { name: "API tokens" }).click();
  await expect(page.getByRole("heading", { exact: true, name: "API tokens" })).toBeVisible();
});

test("project cards open on click and delete through a confirmation popover", async ({ page }) => {
  await mockAuthenticated(page);

  await page.goto("/");

  const projectCard = page.getByTestId("project-card-project-1");
  await expect(projectCard).toBeVisible();
  const projectTitle = projectCard.getByRole("heading", { name: "Billing cleanup" });
  const projectCardBox = await projectCard.boundingBox();
  const projectTitleBox = await projectTitle.boundingBox();
  expect(projectCardBox).not.toBeNull();
  expect(projectTitleBox).not.toBeNull();
  expect(projectCardBox?.width ?? 0).toBeLessThan(700);
  expect(((projectTitleBox?.y ?? 0) - (projectCardBox?.y ?? 0)) / (projectCardBox?.height ?? 1)).toBeLessThan(0.28);

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

  await expect(page.locator(".page-intro")).toHaveCount(0);
  await expect(page.locator(".workspace-header")).toHaveCount(0);
  await expect(page.locator(".workspace-form")).toHaveCount(0);
  await expect(page.locator(".workspace-summary")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back to projects" })).toHaveCount(0);

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
