import { expect, test } from "@playwright/test";

import { laneId, mockAuthenticated, projectsForGrid, tag, tasks } from "./fixtures";

test("all todos page groups todo tasks and supports search and tag filtering", async ({ page }) => {
  const todoProjects = structuredClone(projectsForGrid);
  const todoTasks = structuredClone(tasks);

  todoTasks.push(
    {
      body: "Collect evidence from the callback logs before changing the retry window.",
      createdAt: "2026-03-18T07:12:00.000Z",
      id: "task-5",
      laneId: laneId("project-1", "todo"),
      parentTaskId: "task-1",
      position: 0,
      projectId: "project-1",
      ticketId: "BILL-5",
      tags: [tag("retry", "coral")],
      title: "Capture callback evidence",
      updatedAt: "2026-03-18T07:22:00.000Z"
    },
    {
      body: "Pull the remaining vendor notes into one review pass.",
      createdAt: "2026-03-18T08:35:00.000Z",
      id: "task-6",
      laneId: laneId("project-6", "todo"),
      parentTaskId: null,
      position: 0,
      projectId: "project-6",
      ticketId: "PART-1",
      tags: [tag("partner", "orchid")],
      title: "Review partner notes",
      updatedAt: "2026-03-18T08:55:00.000Z"
    }
  );

  await mockAuthenticated(page, {
    projects: todoProjects,
    tasks: todoTasks
  });

  await page.goto("/");
  await page.getByRole("link", { exact: true, name: "TODO" }).click();

  await expect(page).toHaveURL("/todos");
  await expect(page).toHaveTitle("All TODOs | BBTodo");
  await expect(page.getByLabel("Search todos")).toBeVisible();
  await expect(page.getByLabel("Filter by tags")).toBeVisible();
  await expect(page.getByText("Cross-project view")).toHaveCount(0);
  await expect(page.getByText("Everything still sitting in Todo, grouped by board so you can review the queue before diving into a lane.")).toHaveCount(0);
  await expect(page.locator(".metric-ribbon")).toHaveCount(0);

  const billingGroup = page.getByTestId("todo-project-group-project-1");
  const partnerGroup = page.getByTestId("todo-project-group-project-6");

  await expect(billingGroup.getByRole("heading", { name: "Billing cleanup" })).toBeVisible();
  await expect(partnerGroup.getByRole("heading", { name: "Partner audit" })).toBeVisible();

  const [billingBox, partnerBox] = await Promise.all([billingGroup.boundingBox(), partnerGroup.boundingBox()]);
  expect(billingBox).not.toBeNull();
  expect(partnerBox).not.toBeNull();
  expect(Math.abs((billingBox?.y ?? 0) - (partnerBox?.y ?? 0))).toBeLessThan(24);
  expect(Math.abs((billingBox?.x ?? 0) - (partnerBox?.x ?? 0))).toBeGreaterThan(24);

  await expect(billingGroup.getByTestId("todo-task-card-task-1")).toBeVisible();
  await expect(billingGroup.getByTestId("todo-task-card-task-5")).toBeVisible();
  await expect(billingGroup.getByTestId("todo-task-card-task-4")).toBeVisible();

  const billingTaskOrder = await billingGroup
    .locator("[data-testid^='todo-task-card-'] .task-card__title")
    .allTextContents();
  expect(billingTaskOrder).toEqual([
    "[BILL-1] Review retry settings",
    "[BILL-5] Capture callback evidence",
    "[BILL-4] Queue copy pass"
  ]);

  await page.getByLabel("Search todos").fill("partner");
  await expect(partnerGroup).toBeVisible();
  await expect(billingGroup).toHaveCount(0);

  await page.getByLabel("Search todos").fill("");
  await billingGroup.getByTestId("todo-task-card-task-5").getByRole("button", { name: "retry" }).click();

  await expect(partnerGroup).toHaveCount(0);
  await expect(billingGroup.getByTestId("todo-task-card-task-1")).toBeVisible();
  await expect(billingGroup.getByTestId("todo-task-card-task-5")).toBeVisible();
  await expect(billingGroup.getByTestId("todo-task-card-task-4")).toHaveCount(0);
});

test("all todos page links into boards and task detail boards", async ({ page }) => {
  const todoProjects = structuredClone(projectsForGrid);
  const todoTasks = structuredClone(tasks);

  todoTasks.push({
    body: "Pull the remaining vendor notes into one review pass.",
    createdAt: "2026-03-18T08:35:00.000Z",
    id: "task-6",
    laneId: laneId("project-6", "todo"),
    parentTaskId: null,
    position: 0,
    projectId: "project-6",
    ticketId: "PART-1",
    tags: [tag("partner", "orchid")],
    title: "Review partner notes",
    updatedAt: "2026-03-18T08:55:00.000Z"
  });

  await mockAuthenticated(page, {
    projects: todoProjects,
    tasks: todoTasks
  });

  await page.goto("/todos");

  await page.getByRole("button", { name: "Open board Billing cleanup" }).click();
  await expect(page).toHaveURL("/projects/BILL");

  await page.goto("/todos");
  await page.getByLabel("Open todo PART-1").click();
  await expect(page).toHaveURL(/\/projects\/PART\/PART-1\?q=PART-1$/);
});

test("all todos page shows the empty state when no todo tasks exist", async ({ page }) => {
  await mockAuthenticated(page, {
    projects: structuredClone(projectsForGrid),
    tasks: []
  });

  await page.goto("/todos");

  await expect(page.getByRole("heading", { name: "No TODOs yet." })).toBeVisible();
  await expect(
    page.getByText("Every board is either empty or already moving beyond the Todo lane.")
  ).toBeVisible();
});

test("all todos page shows the no-match state when filters remove every todo", async ({ page }) => {
  const searchableProjects = structuredClone(projectsForGrid);
  const searchableTasks = structuredClone(tasks);

  searchableTasks.push({
    body: "Pull the remaining vendor notes into one review pass.",
    createdAt: "2026-03-18T08:35:00.000Z",
    id: "task-6",
    laneId: laneId("project-6", "todo"),
    parentTaskId: null,
    position: 0,
    projectId: "project-6",
    ticketId: "PART-1",
    tags: [tag("partner", "orchid")],
    title: "Review partner notes",
    updatedAt: "2026-03-18T08:55:00.000Z"
  });

  await mockAuthenticated(page, {
    projects: searchableProjects,
    tasks: searchableTasks
  });

  await page.goto("/todos");
  await page.getByLabel("Search todos").fill("missing");

  await expect(page.getByRole("heading", { name: "No TODOs match the current filters." })).toBeVisible();
  await expect(
    page.getByText("Try a different search term or remove the active tag filter.")
  ).toBeVisible();
});
