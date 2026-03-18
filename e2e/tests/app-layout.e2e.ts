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
  let nextTaskId = 4;
  const taskState = tasks.map((task) => ({ ...task }));

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}`;
    const body = request.postDataJSON() as { status?: string; title?: string } | null;

    switch (key) {
      case "GET /api/v1/me":
        await fulfillJson(route, 200, user);
        return;
      case "GET /api/v1/projects":
        await fulfillJson(route, 200, projects);
        return;
      case "GET /api/v1/projects/project-1/tasks":
        await fulfillJson(route, 200, taskState);
        return;
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

test("projects page removes the oversized intro section", async ({ page }) => {
  await mockAuthenticated(page);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Boards" })).toBeVisible();
  await expect(page.locator(".page-intro")).toHaveCount(0);
  await expect(page.getByLabel("Project name")).toBeVisible();
  await expect(page.locator(".topbar__identity")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "API tokens" })).toHaveCount(0);
  await expect(page.getByLabel("Open account menu")).toHaveText("N");
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "API tokens" })).toHaveCount(0);

  await page.getByLabel("Open account menu").click();

  await expect(page.getByRole("menuitem", { name: "API tokens" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();

  await page.getByRole("menuitem", { name: "API tokens" }).click();
  await expect(page.getByRole("heading", { exact: true, name: "API tokens" })).toBeVisible();
});

test("board workspace uses the full available width", async ({ page }) => {
  await mockAuthenticated(page);

  await page.goto("/projects/project-1");

  await expect(page.getByRole("heading", { name: "Billing cleanup" })).toBeVisible();
  await expect(page.locator(".page-intro")).toHaveCount(0);
  await expect(page.locator(".workspace-header")).toHaveCount(0);
  await expect(page.locator(".workspace-form")).toHaveCount(0);

  const maxWidth = await page.locator(".page-shell--board").evaluate((element) => getComputedStyle(element).maxWidth);
  expect(maxWidth).toBe("none");

  const boardBox = await page.getByTestId("board-grid").boundingBox();
  expect(boardBox).not.toBeNull();

  const viewportWidth = page.viewportSize()?.width ?? 0;
  expect(boardBox?.width ?? 0).toBeGreaterThan(viewportWidth - 80);

  await expect(page.locator(".board-column")).toHaveCount(3);
  await expect(page.locator(".board-column__note")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Move to / })).toHaveCount(0);

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
