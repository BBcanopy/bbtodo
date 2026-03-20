import { expect, test } from "@playwright/test";

import { mockAuthenticated, projectsForGrid } from "./fixtures";

test("projects page lists boards and opens them from the switcher", async ({ page }) => {
  const projectsWithQaLane = structuredClone(projectsForGrid);
  const billingCleanupProject = projectsWithQaLane.find((project) => project.id === "project-1");
  const compactProject = projectsWithQaLane.find((project) => project.id === "project-2");
  if (!billingCleanupProject) {
    throw new Error("Expected project-1 test fixture to exist");
  }
  if (!compactProject) {
    throw new Error("Expected project-2 test fixture to exist");
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
  compactProject.name = "idc";
  compactProject.laneSummaries = [
    {
      createdAt: "2026-03-18T08:10:00.000Z",
      id: "project-2-lane-done-only",
      name: "Done",
      position: 0,
      projectId: "project-2",
      taskCount: 3,
      updatedAt: "2026-03-18T08:10:00.000Z"
    }
  ];

  await mockAuthenticated(page, { projects: projectsWithQaLane });

  await page.goto("/");

  await expect(page).toHaveTitle("Projects | BBTodo");
  await expect(page.locator(".subnav__current-value")).toHaveText("All projects");
  await expect(page.getByRole("button", { name: "Create Lane" })).toHaveCount(0);
  await expect(page.getByLabel("Search cards")).toHaveCount(0);

  const projectCard = page.getByTestId("project-card-project-1");
  await expect(projectCard.getByRole("heading", { name: "Billing cleanup" })).toBeVisible();
  await expect(projectCard.locator(".project-card__lane-pill")).toHaveCount(5);
  for (const laneLabel of ["Todo 2", "In Progress 1", "In review 0", "Done 1", "Ready for QA 0"]) {
    await expect(projectCard.getByLabel(laneLabel)).toBeVisible();
  }
  const compactProjectCard = page.getByTestId("project-card-project-2");
  const regularLanePill = projectCard.locator(".project-card__lane-pill").first();
  const compactLanePill = compactProjectCard.locator(".project-card__lane-pill");
  await expect(compactProjectCard.getByRole("heading", { name: "idc" })).toBeVisible();
  await expect(compactLanePill).toHaveCount(1);
  await expect(compactLanePill).toContainText("Done");

  const regularLanePillHeight = await regularLanePill.evaluate((element) =>
    Math.round(element.getBoundingClientRect().height)
  );
  const compactLanePillHeight = await compactLanePill.evaluate((element) =>
    Math.round(element.getBoundingClientRect().height)
  );

  expect(compactLanePillHeight).toBe(regularLanePillHeight);
  expect(compactLanePillHeight).toBeLessThanOrEqual(67);
  expect(compactLanePillHeight).toBeGreaterThanOrEqual(63);

  await page.getByLabel("Open account menu").click();
  await page.getByRole("button", { name: "Ember" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ember");
  await page.getByRole("button", { name: "Midnight" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
  await page.getByLabel("Open account menu").click();

  const switcherButton = page.getByRole("button", { name: "Open project switcher" });
  await switcherButton.click();
  const switcherInput = page.getByLabel("Project switcher input");
  await switcherInput.fill("partner");
  await expect(page.getByRole("button", { name: "Open project Partner audit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open project Billing cleanup" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open project Partner audit" }).click();

  await expect(page).toHaveURL(/\/projects\/project-6$/);
  await expect(page.locator(".subnav__current-value")).toHaveText("Partner audit");
});

test("project cards open on click and delete through a confirmation popover", async ({ page }) => {
  await mockAuthenticated(page);

  await page.goto("/");

  const projectCard = page.getByTestId("project-card-project-1");
  await expect(projectCard).toBeVisible();
  await expect(projectCard.locator(".project-card__timestamp")).toHaveCount(0);

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
