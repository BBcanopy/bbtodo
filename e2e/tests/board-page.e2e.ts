import { expect, test, type Locator, type Page } from "@playwright/test";

import { laneId, mockAuthenticated, projectsForGrid, tag, tasks } from "./fixtures";

async function dragTaskToCard(page: Page, source: Locator, target: Locator, targetYRatio = 0.8) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();

  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  await page.mouse.move(
    (sourceBox?.x ?? 0) + (sourceBox?.width ?? 0) / 2,
    (sourceBox?.y ?? 0) + (sourceBox?.height ?? 0) / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    (sourceBox?.x ?? 0) + (sourceBox?.width ?? 0) / 2 + 18,
    (sourceBox?.y ?? 0) + (sourceBox?.height ?? 0) / 2,
    { steps: 6 }
  );
  await page.mouse.move(
    (targetBox?.x ?? 0) + (targetBox?.width ?? 0) / 2,
    (targetBox?.y ?? 0) + (targetBox?.height ?? 0) * targetYRatio,
    { steps: 24 }
  );
  await page.mouse.up();
}

test("board page edits cards and filters tasks", async ({ page }) => {
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
    tasks: tasksWithReusableGlobalTag
  });

  await page.goto("/projects/project-1");

  await expect(page).toHaveTitle("Billing cleanup | BBTodo");
  await expect(page.locator(".subnav__current-value")).toHaveText("Billing cleanup");
  await expect(page.getByRole("button", { exact: true, name: "Create Lane" })).toHaveCount(0);
  await expect(page.getByLabel("Search cards")).toBeVisible();
  await expect(page.getByLabel("Filter by tags")).toHaveAttribute("placeholder", "tag");
  await expect(page.locator(".board-column")).toHaveCount(4);

  const firstTaskCard = page.getByTestId("task-card-task-1");
  const taskDeleteButton = firstTaskCard.getByLabel("Delete task Review retry settings");
  const laneDeleteButton = page.getByLabel("Delete lane Todo");
  await expect(firstTaskCard.locator(".task-tag")).toHaveText(["backend", "retry"]);
  await expect(firstTaskCard.locator(".task-card__timestamp")).toHaveCount(0);
  await expect(firstTaskCard).toHaveCSS("border-radius", "0px");
  await expect(taskDeleteButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(taskDeleteButton).toHaveCSS("color", "rgb(47, 119, 116)");
  await expect(laneDeleteButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(laneDeleteButton).toHaveCSS("color", "rgb(47, 119, 116)");

  await page.getByLabel("Open account menu").click();
  await page.getByRole("button", { name: "Ember" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ember");
  await expect(taskDeleteButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(taskDeleteButton).toHaveCSS("color", "rgb(184, 94, 63)");
  await expect(laneDeleteButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(laneDeleteButton).toHaveCSS("color", "rgb(184, 94, 63)");
  await page.getByRole("button", { name: "Midnight" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
  await expect(taskDeleteButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(taskDeleteButton).toHaveCSS("color", "rgb(142, 229, 224)");
  await expect(laneDeleteButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(laneDeleteButton).toHaveCSS("color", "rgb(142, 229, 224)");
  await page.getByLabel("Open account menu").click();

  await firstTaskCard.click();

  const editDialog = page.getByRole("dialog", { name: "Edit Card" });
  const sourceTab = editDialog.getByRole("tab", { name: "Markdown source" });
  const previewTab = editDialog.getByRole("tab", { name: "Rendered preview" });
  const tagInput = editDialog.getByLabel("Task tags");
  const createdMeta = editDialog.locator(".task-editor__meta-item", { hasText: "Created" });
  const updatedMeta = editDialog.locator(".task-editor__meta-item", { hasText: "Updated" });

  await expect(editDialog).toBeVisible();
  await expect(createdMeta).toContainText("Created");
  await expect(createdMeta.locator("time")).toHaveAttribute("datetime", "2026-03-18T07:00:00.000Z");
  await expect(createdMeta.locator("time")).toHaveText("2026-03-18T07:00:00.000Z");
  await expect(updatedMeta).toContainText("Updated");
  await expect(updatedMeta.locator("time")).toHaveAttribute("datetime", "2026-03-18T07:10:00.000Z");
  await expect(updatedMeta.locator("time")).toHaveText("2026-03-18T07:10:00.000Z");
  await expect(editDialog.getByLabel("Title")).toHaveValue("Review retry settings");
  await expect(editDialog.getByRole("button", { name: "Remove tag backend" })).toBeVisible();
  await expect(editDialog.getByRole("button", { name: "Remove tag retry" })).toBeVisible();
  await expect(editDialog.getByRole("button", { name: "Add tag ops" })).toBeVisible();
  await expect(editDialog.getByRole("button", { name: "Add tag global-brand" })).toBeVisible();
  await expect(editDialog.getByLabel("Task body")).toHaveValue("Callback logs mention **retry** scope.");
  await expect(sourceTab).toHaveAttribute("aria-selected", "true");
  await expect(previewTab).toHaveAttribute("aria-selected", "false");

  await editDialog.getByRole("button", { name: "Edit color for tag backend" }).click();
  await editDialog.getByRole("button", { name: "Set backend color to Amber" }).click();
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
  await editDialog.getByRole("button", { name: "Set release color to Orchid" }).click();
  await tagInput.press("Enter");
  await expect(editDialog.getByRole("button", { name: "Remove tag release" })).toBeVisible();
  await editDialog
    .getByLabel("Task body")
    .fill("Callback logs mention **scope**.\n\n- Keep raw claims\n- Verify issuer");
  await previewTab.click();
  await expect(editDialog.locator(".markdown-preview strong")).toHaveText("scope");
  await expect(editDialog.locator(".markdown-preview li")).toHaveCount(2);
  await editDialog.getByRole("button", { name: "Save card" }).click();

  await expect(editDialog).toHaveCount(0);
  await expect(firstTaskCard.getByText("Review retry scope")).toBeVisible();
  const updatedTaskTags = firstTaskCard.locator(".task-tag");
  await expect(updatedTaskTags).toHaveText(["backend", "release"]);
  await expect(updatedTaskTags.nth(0)).toHaveCSS("background-color", "rgb(255, 241, 217)");
  await expect(updatedTaskTags.nth(1)).toHaveCSS("background-color", "rgb(242, 229, 255)");

  await page.getByTestId("task-card-task-2").click();
  const recoloredBackendSuggestion = editDialog.getByRole("button", { name: "Add tag backend" });
  await expect(editDialog).toBeVisible();
  await expect(recoloredBackendSuggestion).toHaveCSS("background-color", "rgb(255, 241, 217)");
  await editDialog.getByLabel("Close edit task dialog").click();
  await expect(editDialog).toHaveCount(0);

  await page.getByLabel("Search cards").fill("callback");
  await expect(page.getByText("Review retry scope")).toBeVisible();
  await expect(page.getByText("Tighten callback logging")).toBeVisible();
  await expect(page.getByText("Remove healthcheck loop")).toHaveCount(0);

  await page.getByLabel("Search cards").fill("");

  const tagFilterField = page.locator(".subnav__search--tag-filter");
  await page.getByRole("button", { name: "Show tag filter suggestions" }).click();
  const tagFilterDropdown = page.getByRole("list", { name: "Available tag filters" });
  await expect(tagFilterDropdown.getByRole("button", { name: "Add tag filter release" })).toBeVisible();
  await expect(tagFilterDropdown.getByRole("button", { name: "Add tag filter global-brand" })).toBeVisible();
  await tagFilterDropdown.getByRole("button", { name: "Add tag filter release" }).click();

  const releaseTagFilterChip = tagFilterField.locator(".subnav__tag-filter-chip", { hasText: "release" });
  await expect(releaseTagFilterChip).toBeVisible();
  await expect(page.getByText("Review retry scope")).toBeVisible();
  await expect(page.getByText("Tighten callback logging")).toHaveCount(0);
  await expect(page.getByText("Queue copy pass")).toHaveCount(0);

  await firstTaskCard.getByRole("button", { name: "backend" }).click({ force: true });
  const backendTagFilterChip = tagFilterField.locator(".subnav__tag-filter-chip", { hasText: "backend" });
  await expect(releaseTagFilterChip).toHaveCount(0);
  await expect(backendTagFilterChip).toBeVisible();
  await expect(page.getByText("Review retry scope")).toBeVisible();
  await expect(page.getByText("Tighten callback logging")).toHaveCount(0);
  await expect(page.getByText("Queue copy pass")).toHaveCount(0);

  await page.goto("/projects/project-1?tags=ops,backend");
  const routedOpsTagFilterChip = tagFilterField.locator(".subnav__tag-filter-chip", { hasText: "ops" });
  await expect(routedOpsTagFilterChip).toBeVisible();
  await expect(page.getByText("Remove healthcheck loop")).toBeVisible();
  await expect(page.getByText("Review retry scope")).toHaveCount(0);
});

test("board page reorders tasks and manages lanes", async ({ page }) => {
  const projectsWithQaLane = structuredClone(projectsForGrid);
  const billingCleanupProject = projectsWithQaLane.find((project) => project.id === "project-1");
  if (!billingCleanupProject) {
    throw new Error("Expected project-1 test fixture to exist");
  }

  billingCleanupProject.laneSummaries.push({
    createdAt: "2026-03-18T08:00:00.000Z",
    id: "project-1-lane-custom-1",
    name: "Ready for QA",
    position: 4,
    projectId: "project-1",
    taskCount: 0,
    updatedAt: "2026-03-18T08:00:00.000Z"
  });

  await mockAuthenticated(page, { projects: projectsWithQaLane });

  await page.goto("/projects/project-1");

  const todoColumn = page.getByTestId(`board-column-${laneId("project-1", "todo")}`);
  const retryCard = page.getByTestId("task-card-task-1");
  await expect(todoColumn.getByText("Review retry settings")).toBeVisible();

  const laneHeadings = page.locator(".board-column__header h2");
  await expect(laneHeadings).toHaveText(["Todo", "In Progress", "In review", "Done", "Ready for QA"]);

  const qaLaneHeader = page.getByTestId("lane-header-project-1-lane-custom-1");
  await qaLaneHeader.dragTo(page.getByTestId(`board-column-${laneId("project-1", "in_progress")}`), {
    targetPosition: { x: 16, y: 40 }
  });
  await expect(laneHeadings).toHaveText(["Todo", "Ready for QA", "In Progress", "In review", "Done"]);

  const qaColumn = page.getByTestId("board-column-project-1-lane-custom-1");
  await qaColumn.dblclick();
  const laneInput = page.getByLabel("New task title for Ready for QA");
  await expect(laneInput).toBeVisible();
  await laneInput.fill("Ship note");
  await laneInput.press("Enter");

  const createdCard = page.getByTestId("task-card-task-5");
  await expect(createdCard).toBeVisible();
  await expect(createdCard.locator(".task-tag")).toHaveCount(0);

  await dragTaskToCard(page, retryCard, createdCard);
  await expect(qaColumn.getByText("Review retry settings")).toBeVisible();
  await expect(todoColumn.getByText("Review retry settings")).toHaveCount(0);

  await createdCard.getByLabel("Delete task Ship note").click();
  await createdCard.getByRole("button", { exact: true, name: "Delete" }).click();
  await expect(createdCard).toHaveCount(0);

  const qaLaneDeleteButton = page.getByLabel("Delete lane Ready for QA");
  await qaLaneDeleteButton.click();
  const laneDeleteDialog = page.getByRole("alertdialog", { name: "Delete lane Ready for QA" });
  await expect(laneDeleteDialog).toBeVisible();
  await expect(laneDeleteDialog.getByLabel("Move tasks from Ready for QA to")).toBeVisible();
  await laneDeleteDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Ready for QA" })).toBeVisible();

  await qaLaneDeleteButton.click();
  await laneDeleteDialog.getByLabel("Move tasks from Ready for QA to").selectOption(laneId("project-1", "done"));
  await laneDeleteDialog.getByRole("button", { exact: true, name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: "Ready for QA" })).toHaveCount(0);
  await expect(
    page.getByTestId(`board-column-${laneId("project-1", "done")}`).getByText("Review retry settings")
  ).toBeVisible();
});

test("board page creates lanes from the gap between columns", async ({ page }) => {
  await mockAuthenticated(page, { projects: projectsForGrid });

  await page.goto("/projects/project-1");

  await expect(page.getByRole("button", { exact: true, name: "Create Lane" })).toHaveCount(0);

  const createLaneGap = page.getByTestId(`create-lane-gap-after-${laneId("project-1", "todo")}`);
  await expect(createLaneGap).toBeVisible();
  const gapDividerContent = await createLaneGap.evaluate((element) =>
    window.getComputedStyle(element, "::before").content.replaceAll('"', "")
  );
  expect(["none", "normal"]).toContain(gapDividerContent);
  await createLaneGap.dblclick();

  const laneDialog = page.getByRole("dialog", { name: "Create Lane" });
  await expect(laneDialog).toBeVisible();
  await expect(laneDialog.locator(".field__label", { hasText: "Lane name" })).toHaveCount(0);
  await laneDialog.getByLabel("Lane name").fill("Ready for QA");
  await laneDialog.getByRole("button", { exact: true, name: "Create Lane" }).click();

  await expect(page.locator(".board-column__header h2")).toHaveText([
    "Todo",
    "In Progress",
    "In review",
    "Done",
    "Ready for QA"
  ]);
});

test("board page switcher renames and creates projects while guarding the last lane", async ({ page }) => {
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
  await switcherInput.fill("Billing relaunch");
  await page.getByRole("button", { name: "Rename Project" }).click();
  await expect(page.locator(".subnav__current-value")).toHaveText("Billing relaunch");

  await switcherButton.click();
  await switcherInput.fill("Program rollout");
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
