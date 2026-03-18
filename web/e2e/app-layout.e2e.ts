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
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const key = `${request.method()} ${url.pathname}`;

    switch (key) {
      case "GET /api/v1/me":
        await fulfillJson(route, 200, user);
        return;
      case "GET /api/v1/projects":
        await fulfillJson(route, 200, projects);
        return;
      case "GET /api/v1/projects/project-1/tasks":
        await fulfillJson(route, 200, tasks);
        return;
      case "GET /api/v1/api-tokens":
        await fulfillJson(route, 200, []);
        return;
      default:
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
});

test("board workspace uses the full available width", async ({ page }) => {
  await mockAuthenticated(page);

  await page.goto("/projects/project-1");

  await expect(page.getByRole("heading", { name: "Billing cleanup" })).toBeVisible();
  await expect(page.locator(".page-intro")).toHaveCount(0);

  const maxWidth = await page.locator(".page-shell--board").evaluate((element) => getComputedStyle(element).maxWidth);
  expect(maxWidth).toBe("none");

  const boardBox = await page.getByTestId("board-grid").boundingBox();
  expect(boardBox).not.toBeNull();

  const viewportWidth = page.viewportSize()?.width ?? 0;
  expect(boardBox?.width ?? 0).toBeGreaterThan(viewportWidth - 80);

  await expect(page.locator(".board-column")).toHaveCount(3);
  await expect(page.locator(".board-column__note")).toHaveCount(0);
});
