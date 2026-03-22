import { expect, test, type Locator, type Page } from "@playwright/test";

import { laneId, mockAuthenticated, projectsForGrid, tag, tasks } from "./fixtures";

async function beginTaskDrag(page: Page, source: Locator) {
  const taskSurface = source.locator(":scope > .task-card__surface-wrap > .task-card__surface");
  const dragHandle = (await taskSurface.count()) > 0 ? taskSurface : source;
  const dragOverlay = page.locator(".task-card--drag-overlay");

  await expect(dragHandle).toBeVisible();
  const sourceBox = await dragHandle.boundingBox();

  expect(sourceBox).not.toBeNull();

  const sourceCenterX = (sourceBox?.x ?? 0) + (sourceBox?.width ?? 0) / 2;
  const sourceCenterY = (sourceBox?.y ?? 0) + (sourceBox?.height ?? 0) / 2;

  await page.mouse.move(sourceCenterX, sourceCenterY);
  await page.mouse.down();
  await page.mouse.move(sourceCenterX + 18, sourceCenterY, { steps: 6 });
  await page.mouse.move(sourceCenterX + 28, sourceCenterY - 2, { steps: 4 });
  await page.mouse.move(sourceCenterX + 32, sourceCenterY - 4, { steps: 2 });
  await expect(dragOverlay).toHaveCount(1);
}

async function hoverDraggedTaskOver(page: Page, target: Locator, targetYRatio = 0.5) {
  await page.waitForTimeout(100);
  await expect(target).toBeAttached();
  const initialTargetBox = await target.boundingBox();

  expect(initialTargetBox).not.toBeNull();

  const initialTargetCenterX = (initialTargetBox?.x ?? 0) + (initialTargetBox?.width ?? 0) / 2;
  const viewportWidth =
    page.viewportSize()?.width ??
    Math.ceil((initialTargetBox?.x ?? 0) + (initialTargetBox?.width ?? 0) + 96);
  const horizontalApproachOffset = Math.min(
    84,
    Math.max(((initialTargetBox?.width ?? 0) * 0.65), 48)
  );
  const approachFromRight =
    initialTargetCenterX + horizontalApproachOffset < viewportWidth - 16;
  const initialApproachX = approachFromRight
    ? initialTargetCenterX + horizontalApproachOffset
    : Math.max(initialTargetCenterX - horizontalApproachOffset, 16);

  await page.mouse.move(initialApproachX, Math.max((initialTargetBox?.y ?? 0) - 36, 0), { steps: 18 });
  await page.waitForTimeout(80);

  // Drag previews can shift the list while the pointer is in flight, so re-center on
  // the live target a few times before releasing.
  for (const steps of [20, 12, 8]) {
    await expect(target).toBeAttached();
    const targetBox = await target.boundingBox();

    expect(targetBox).not.toBeNull();

    await page.mouse.move(
      (targetBox?.x ?? 0) + (targetBox?.width ?? 0) / 2,
      (targetBox?.y ?? 0) + (targetBox?.height ?? 0) * targetYRatio,
      { steps }
    );
    await page.waitForTimeout(80);
  }

  await expect(target).toBeAttached();
  const finalTargetBox = await target.boundingBox();

  expect(finalTargetBox).not.toBeNull();

  await page.mouse.move(
    (finalTargetBox?.x ?? 0) + (finalTargetBox?.width ?? 0) / 2,
    (finalTargetBox?.y ?? 0) + (finalTargetBox?.height ?? 0) * targetYRatio,
    { steps: 4 }
  );
  await page.waitForTimeout(140);
}

async function hoverDraggedTaskDirectlyToTarget(page: Page, target: Locator, targetYRatio = 0.5) {
  await page.waitForTimeout(100);
  await expect(target).toBeAttached();
  const finalTargetBox = await target.boundingBox();

  expect(finalTargetBox).not.toBeNull();

  await page.mouse.move(
    (finalTargetBox?.x ?? 0) + (finalTargetBox?.width ?? 0) / 2,
    (finalTargetBox?.y ?? 0) + (finalTargetBox?.height ?? 0) * targetYRatio,
    { steps: 16 }
  );
  await page.waitForTimeout(160);
}

async function hoverDraggedTaskToNestTarget(
  page: Page,
  card: Locator,
  targetYRatio = 0.5,
  settleTarget?: Locator
) {
  const nestTarget = taskCardNestTarget(card);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await hoverDraggedTaskOver(page, nestTarget, targetYRatio);

    if (settleTarget && (await settleTarget.count()) > 0) {
      await hoverDraggedTaskDirectlyToTarget(page, settleTarget);
      return;
    }

    const cardClass = await card.getAttribute("class");
    if (cardClass?.includes("is-nest-target")) {
      await hoverDraggedTaskDirectlyToTarget(page, nestTarget, targetYRatio);
      return;
    }
  }

  await hoverDraggedTaskDirectlyToTarget(page, nestTarget, targetYRatio);
}

async function dropDraggedTaskOnHeaderTrashZone(page: Page, header: Locator) {
  await expect(header).toBeAttached();
  const headerBox = await header.boundingBox();

  expect(headerBox).not.toBeNull();

  await page.mouse.move(
    (headerBox?.x ?? 0) + (headerBox?.width ?? 0) * 0.28,
    (headerBox?.y ?? 0) + (headerBox?.height ?? 0) * 0.5,
    { steps: 12 }
  );
  await expect(header).toHaveClass(/is-task-trash-active/);
  await finishTaskDrag(page);
}

async function finishTaskDrag(page: Page) {
  const dragOverlay = page.locator(".task-card--drag-overlay");

  await page.mouse.up();
  await expect(dragOverlay).toHaveCount(0);
}

async function dragTaskToTarget(page: Page, source: Locator, target: Locator, targetYRatio = 0.5) {
  await beginTaskDrag(page, source);
  await hoverDraggedTaskOver(page, target, targetYRatio);
  await finishTaskDrag(page);
}

function taskCardSurface(card: Locator) {
  return card.locator(":scope > .task-card__surface-wrap > .task-card__surface");
}

function taskCardNestTarget(card: Locator) {
  return card.locator(":scope > .task-card__surface-wrap > .task-card__nest-target");
}

test("board page edits cards and filters tasks", async ({ page }) => {
  const tasksWithReusableGlobalTag = structuredClone(tasks);
  tasksWithReusableGlobalTag.push({
    body: "Homepage refresh backlog.",
    createdAt: "2026-03-18T08:18:00.000Z",
    id: "task-project-2-1",
    laneId: laneId("project-2", "todo"),
    parentTaskId: null,
    position: 0,
    projectId: "project-2",
    ticketId: "ROAD-1",
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
  const laneDeleteButton = page.getByLabel("Delete lane In Progress");
  await expect(firstTaskCard.locator(".task-card__title")).toHaveText("[BILL-1] Review retry settings");
  await expect(firstTaskCard.locator(".task-tag")).toHaveText(["backend", "retry"]);
  await expect(firstTaskCard.locator(".task-card__timestamp")).toHaveCount(0);
  await expect(firstTaskCard.getByLabel("Delete task Review retry settings")).toHaveCount(0);
  await expect(page.getByLabel("Delete lane Todo")).toHaveCount(0);
  await expect(page.getByLabel("Delete lane Done")).toHaveCount(0);
  await expect(firstTaskCard).toHaveCSS("border-radius", "0px");
  await expect(firstTaskCard).toHaveCSS("padding-top", "10.4px");
  await expect(firstTaskCard).toHaveCSS("padding-bottom", "10.4px");
  await expect(laneDeleteButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(laneDeleteButton).toHaveCSS("color", "rgb(47, 119, 116)");

  await page.getByLabel("Open account menu").click();
  await page.getByRole("button", { name: "Ember" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ember");
  await expect(laneDeleteButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(laneDeleteButton).toHaveCSS("color", "rgb(184, 94, 63)");
  await page.getByRole("button", { name: "Midnight" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
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
  await expect(firstTaskCard.locator(".task-card__title")).toHaveText("[BILL-1] Review retry scope");
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

  await firstTaskCard.locator(".task-tag", { hasText: "backend" }).click({ force: true });
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

test("board page deletes tasks from the lane header trash target", async ({ page }) => {
  await mockAuthenticated(page, {
    projects: projectsForGrid,
    tasks
  });

  await page.goto("/projects/project-1");

  const firstTaskCard = page.getByTestId("task-card-task-1");
  const todoLaneHeader = page.getByTestId(`lane-header-${laneId("project-1", "todo")}`);
  const doneLaneHeader = page.getByTestId(`lane-header-${laneId("project-1", "done")}`);
  const todoLaneTrashTarget = page.getByTestId(`lane-task-trash-target-${laneId("project-1", "todo")}`);
  const doneLaneTrashTarget = page.getByTestId(`lane-task-trash-target-${laneId("project-1", "done")}`);

  await expect(firstTaskCard.getByLabel("Delete task Review retry settings")).toHaveCount(0);
  await expect(todoLaneTrashTarget).toBeHidden();
  await expect(doneLaneTrashTarget).toBeHidden();

  await beginTaskDrag(page, taskCardSurface(firstTaskCard));
  await expect(page.locator(".task-drag-overlay .task-card__title")).toHaveText(
    "[BILL-1] Review retry settings"
  );
  await expect(todoLaneHeader).toHaveClass(/is-task-trash-visible/);
  await expect(doneLaneHeader).not.toHaveClass(/is-task-trash-visible/);
  await expect(todoLaneTrashTarget).toBeVisible();
  await expect(doneLaneTrashTarget).toBeHidden();
  await expect(todoLaneTrashTarget).toHaveCSS("border-top-width", "0px");
  const todoHeaderBox = await todoLaneHeader.boundingBox();
  const todoTrashBox = await todoLaneTrashTarget.boundingBox();
  expect(todoHeaderBox).not.toBeNull();
  expect(todoTrashBox).not.toBeNull();
  const todoHeaderCenterX = (todoHeaderBox?.x ?? 0) + (todoHeaderBox?.width ?? 0) / 2;
  const todoHeaderCenterY = (todoHeaderBox?.y ?? 0) + (todoHeaderBox?.height ?? 0) / 2;
  const todoTrashCenterX = (todoTrashBox?.x ?? 0) + (todoTrashBox?.width ?? 0) / 2;
  const todoTrashCenterY = (todoTrashBox?.y ?? 0) + (todoTrashBox?.height ?? 0) / 2;
  expect(Math.abs(todoHeaderCenterX - todoTrashCenterX)).toBeLessThanOrEqual(8);
  expect(Math.abs(todoHeaderCenterY - todoTrashCenterY)).toBeLessThanOrEqual(6);
  await dropDraggedTaskOnHeaderTrashZone(page, todoLaneHeader);

  const deleteDialog = page.getByRole("alertdialog", { name: "Delete task Review retry settings" });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(firstTaskCard).toBeVisible();
  await expect(todoLaneTrashTarget).toBeHidden();

  await beginTaskDrag(page, taskCardSurface(firstTaskCard));
  await expect(todoLaneHeader).toHaveClass(/is-task-trash-visible/);
  await dropDraggedTaskOnHeaderTrashZone(page, todoLaneHeader);

  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole("button", { exact: true, name: "Delete" }).click();
  await expect(firstTaskCard).toHaveCount(0);
  await expect(page.getByTestId("task-card-task-4")).toBeVisible();
  await expect(todoLaneTrashTarget).toBeHidden();
});

test("board page reorders tasks and manages lanes", async ({ page }) => {
  const projectsWithQaLane = structuredClone(projectsForGrid);
  const tasksWithQaCard = structuredClone(tasks);
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

  tasksWithQaCard.push({
    body: "",
    createdAt: "2026-03-18T08:00:00.000Z",
    id: "task-5",
    laneId: "project-1-lane-custom-1",
    parentTaskId: null,
    position: 0,
    projectId: "project-1",
    ticketId: "BILL-5",
    tags: [],
    title: "Ship note",
    updatedAt: "2026-03-18T08:00:00.000Z"
  });
  tasksWithQaCard.push({
    body: "",
    createdAt: "2026-03-18T08:05:00.000Z",
    id: "task-6",
    laneId: "project-1-lane-custom-1",
    parentTaskId: null,
    position: 1,
    projectId: "project-1",
    ticketId: "BILL-6",
    tags: [],
    title: "Release checklist",
    updatedAt: "2026-03-18T08:05:00.000Z"
  });

  await mockAuthenticated(page, {
    projects: projectsWithQaLane,
    tasks: tasksWithQaCard
  });

  await page.goto("/projects/project-1");

  const todoColumn = page.getByTestId(`board-column-${laneId("project-1", "todo")}`);
  const retryCard = page.getByTestId("task-card-task-1");
  await expect(todoColumn.getByText("Review retry settings")).toBeVisible();

  const laneHeadings = page.locator(".board-column__header h2");
  await expect(laneHeadings).toHaveText(["Todo", "In Progress", "In review", "Done", "Ready for QA"]);

  const qaColumn = page.getByTestId("board-column-project-1-lane-custom-1");
  const doneColumn = page.getByTestId(`board-column-${laneId("project-1", "done")}`);
  const qaRootInsertSlot = page.getByTestId("task-drop-slot-project-1-lane-custom-1-2");
  const shipNoteSubtaskSlot = page.getByTestId("task-drop-slot-task-5-0");

  const createdCard = page.getByTestId("task-card-task-5");
  const releaseChecklistCard = page.getByTestId("task-card-task-6");
  const copyCard = page.getByTestId("task-card-task-4");
  await expect(createdCard).toBeVisible();
  await expect(releaseChecklistCard).toBeVisible();
  await expect(createdCard.locator(".task-tag")).toHaveCount(0);

  await dragTaskToTarget(page, retryCard, qaRootInsertSlot);
  const retryCardInQa = qaColumn.getByTestId("task-card-task-1");
  await expect(retryCardInQa).toBeVisible();
  await beginTaskDrag(page, retryCardInQa);
  await hoverDraggedTaskToNestTarget(page, createdCard, 0.35, shipNoteSubtaskSlot);
  await finishTaskDrag(page);
  await expect(createdCard.locator(".task-card__subtasks").getByText("Review retry settings")).toBeVisible();
  await expect(todoColumn.getByText("Review retry settings")).toHaveCount(0);

  const retrySubtask = createdCard.locator(".task-card__subtasks").getByTestId("task-card-task-1");
  await dragTaskToTarget(page, retrySubtask, taskCardSurface(releaseChecklistCard), 0.2);
  await expect(createdCard.locator(".task-card__subtasks").getByText("Review retry settings")).toHaveCount(0);
  await expect(qaColumn.getByText("Review retry settings")).toBeVisible();

  await dragTaskToTarget(page, copyCard, qaRootInsertSlot);
  const copyCardInQa = qaColumn.getByTestId("task-card-task-4");
  await expect(copyCardInQa).toBeVisible();
  await beginTaskDrag(page, copyCardInQa);
  await hoverDraggedTaskToNestTarget(page, createdCard, 0.5, shipNoteSubtaskSlot);
  await finishTaskDrag(page);
  await expect(createdCard.locator(".task-card__subtasks").getByText("Queue copy pass")).toBeVisible();
  await expect(todoColumn.getByText("Queue copy pass")).toHaveCount(0);

  await dragTaskToTarget(
    page,
    taskCardSurface(createdCard),
    taskCardSurface(createdCard.locator(".task-card__subtasks").getByTestId("task-card-task-4"))
  );
  await expect(page.getByText("Subtasks can only be added under top-level tasks.")).toHaveCount(0);
  await expect(createdCard).toBeVisible();
  await expect(createdCard.locator(".task-card__subtasks").getByText("Queue copy pass")).toBeVisible();

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
  const createdCardInDone = doneColumn.getByTestId("task-card-task-5");
  await expect(createdCardInDone).toBeVisible();
  await expect(createdCardInDone.locator(".task-card__subtasks").getByText("Queue copy pass")).toBeVisible();
  await expect(doneColumn.getByText("Review retry settings")).toBeVisible();
});

test("board page keeps Done ordered by newest update time and ignores drag reordering", async ({ page }) => {
  const tasksWithDoneCards = structuredClone(tasks);

  tasksWithDoneCards.push(
    {
      body: "",
      createdAt: "2026-03-18T07:00:00.000Z",
      id: "task-5",
      laneId: laneId("project-1", "done"),
      parentTaskId: null,
      position: 2,
      projectId: "project-1",
      ticketId: "BILL-5",
      tags: [],
      title: "Archive roadmap",
      updatedAt: "2026-03-18T07:40:00.000Z"
    },
    {
      body: "",
      createdAt: "2026-03-18T07:10:00.000Z",
      id: "task-6",
      laneId: laneId("project-1", "done"),
      parentTaskId: null,
      position: 1,
      projectId: "project-1",
      ticketId: "BILL-6",
      tags: [],
      title: "Ship docs",
      updatedAt: "2026-03-18T08:10:00.000Z"
    }
  );

  await mockAuthenticated(page, {
    projects: projectsForGrid,
    tasks: tasksWithDoneCards
  });

  await page.goto("/projects/project-1");

  const doneColumn = page.getByTestId(`board-column-${laneId("project-1", "done")}`);
  const archivedRoadmapCard = page.getByTestId("task-card-task-5");
  const shippedDocsCard = page.getByTestId("task-card-task-6");

  await expect(doneColumn.locator(".task-card__title")).toHaveText([
    "[BILL-6] Ship docs",
    "[BILL-3] Remove healthcheck loop",
    "[BILL-5] Archive roadmap"
  ]);

  await dragTaskToTarget(page, taskCardSurface(shippedDocsCard), taskCardSurface(archivedRoadmapCard), 0.2);

  await expect(doneColumn.locator(".task-card__title")).toHaveText([
    "[BILL-6] Ship docs",
    "[BILL-3] Remove healthcheck loop",
    "[BILL-5] Archive roadmap"
  ]);
});

test("board page moves a dragged subtask under another empty parent", async ({ page }) => {
  const projectsWithQaLane = structuredClone(projectsForGrid);
  const tasksWithQaCards = structuredClone(tasks);
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

  tasksWithQaCards.push(
    {
      body: "",
      createdAt: "2026-03-18T08:00:00.000Z",
      id: "task-5",
      laneId: "project-1-lane-custom-1",
      parentTaskId: null,
      position: 0,
      projectId: "project-1",
      ticketId: "BILL-5",
      tags: [],
      title: "Ship note",
      updatedAt: "2026-03-18T08:00:00.000Z"
    },
    {
      body: "",
      createdAt: "2026-03-18T08:05:00.000Z",
      id: "task-6",
      laneId: "project-1-lane-custom-1",
      parentTaskId: null,
      position: 1,
      projectId: "project-1",
      ticketId: "BILL-6",
      tags: [],
      title: "Release checklist",
      updatedAt: "2026-03-18T08:05:00.000Z"
    }
  );

  await mockAuthenticated(page, {
    projects: projectsWithQaLane,
    tasks: tasksWithQaCards
  });

  await page.goto("/projects/project-1");

  const shipNoteCard = page.getByTestId("task-card-task-5");
  const releaseChecklistCard = page.getByTestId("task-card-task-6");
  const copyCard = page.getByTestId("task-card-task-4");
  const qaRootInsertSlot = page.getByTestId("task-drop-slot-project-1-lane-custom-1-2");
  const shipNoteSubtaskSlot = page.getByTestId("task-drop-slot-task-5-0");
  const releaseChecklistSubtaskSlot = page.getByTestId("task-drop-slot-task-6-0");

  await dragTaskToTarget(page, copyCard, qaRootInsertSlot);
  const copyCardInQa = page.getByTestId("task-card-task-4");
  await expect(copyCardInQa).toBeVisible();
  await beginTaskDrag(page, copyCardInQa);
  await hoverDraggedTaskToNestTarget(page, shipNoteCard, 0.35, shipNoteSubtaskSlot);
  await finishTaskDrag(page);
  await expect(shipNoteCard.locator(".task-card__subtasks").getByText("Queue copy pass")).toBeVisible();

  const copySubtask = shipNoteCard.locator(".task-card__subtasks").getByTestId("task-card-task-4");
  await beginTaskDrag(page, copySubtask);
  await hoverDraggedTaskToNestTarget(page, releaseChecklistCard, 0.5, releaseChecklistSubtaskSlot);
  await finishTaskDrag(page);

  await expect(shipNoteCard.locator(".task-card__subtasks").getByText("Queue copy pass")).toHaveCount(0);
  await expect(releaseChecklistCard.locator(".task-card__subtasks").getByText("Queue copy pass")).toBeVisible();
});

test("board page keeps subtask drags inside the parent group", async ({ page }) => {
  const projectsWithQaLane = structuredClone(projectsForGrid);
  const tasksWithQaCard = structuredClone(tasks);
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

  const retryTask = tasksWithQaCard.find((task) => task.id === "task-1");
  const copyTask = tasksWithQaCard.find((task) => task.id === "task-4");
  if (!retryTask || !copyTask) {
    throw new Error("Expected task-1 and task-4 test fixtures to exist");
  }

  retryTask.laneId = "project-1-lane-custom-1";
  retryTask.parentTaskId = "task-5";
  retryTask.position = 0;
  copyTask.laneId = "project-1-lane-custom-1";
  copyTask.parentTaskId = "task-5";
  copyTask.position = 1;

  tasksWithQaCard.push({
    body: "",
    createdAt: "2026-03-18T08:00:00.000Z",
    id: "task-5",
    laneId: "project-1-lane-custom-1",
    parentTaskId: null,
    position: 0,
    projectId: "project-1",
    ticketId: "BILL-5",
    tags: [],
    title: "Ship note",
    updatedAt: "2026-03-18T08:00:00.000Z"
  });

  await mockAuthenticated(page, {
    projects: projectsWithQaLane,
    tasks: tasksWithQaCard
  });

  await page.goto("/projects/project-1");

  const shipNoteCard = page.getByTestId("task-card-task-5");
  const retrySubtask = shipNoteCard.locator(".task-card__subtasks").getByTestId("task-card-task-1");
  const copySubtask = shipNoteCard.locator(".task-card__subtasks").getByTestId("task-card-task-4");
  await dragTaskToTarget(page, copySubtask, taskCardSurface(retrySubtask), 0.2);

  await expect(shipNoteCard.locator(".task-card__subtasks .task-card--subtask")).toHaveCount(2);
  await expect(shipNoteCard.locator(".task-card__subtasks").getByText("Review retry settings")).toBeVisible();
  await expect(shipNoteCard.locator(".task-card__subtasks").getByText("Queue copy pass")).toBeVisible();
});

test("board page resets a subtask preview when dragged back over its current parent", async ({ page }) => {
  const projectsWithQaLane = structuredClone(projectsForGrid);
  const tasksWithQaCards = structuredClone(tasks);
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

  const copyTask = tasksWithQaCards.find((task) => task.id === "task-4");
  if (!copyTask) {
    throw new Error("Expected task-4 test fixture to exist");
  }

  copyTask.laneId = "project-1-lane-custom-1";
  copyTask.parentTaskId = "task-5";
  copyTask.position = 0;

  tasksWithQaCards.push(
    {
      body: "",
      createdAt: "2026-03-18T08:00:00.000Z",
      id: "task-5",
      laneId: "project-1-lane-custom-1",
      parentTaskId: null,
      position: 0,
      projectId: "project-1",
      ticketId: "BILL-5",
      tags: [],
      title: "Ship note",
      updatedAt: "2026-03-18T08:00:00.000Z"
    },
    {
      body: "",
      createdAt: "2026-03-18T08:05:00.000Z",
      id: "task-6",
      laneId: "project-1-lane-custom-1",
      parentTaskId: null,
      position: 1,
      projectId: "project-1",
      ticketId: "BILL-6",
      tags: [],
      title: "Release checklist",
      updatedAt: "2026-03-18T08:05:00.000Z"
    }
  );

  await mockAuthenticated(page, {
    projects: projectsWithQaLane,
    tasks: tasksWithQaCards
  });

  await page.goto("/projects/project-1");

  const shipNoteCard = page.getByTestId("task-card-task-5");
  const releaseChecklistCard = page.getByTestId("task-card-task-6");
  const copySubtask = shipNoteCard.locator(".task-card__subtasks").getByTestId("task-card-task-4");

  await beginTaskDrag(page, copySubtask);
  await hoverDraggedTaskDirectlyToTarget(page, taskCardSurface(releaseChecklistCard), 0.5);

  await hoverDraggedTaskOver(page, taskCardSurface(shipNoteCard), 0.3);
  await expect(shipNoteCard.locator(".task-card__subtasks").getByText("Queue copy pass")).toBeVisible();

  await finishTaskDrag(page);
  await expect(shipNoteCard.locator(".task-card__subtasks").getByText("Queue copy pass")).toBeVisible();
  await expect(releaseChecklistCard.locator(".task-card__subtasks").getByText("Queue copy pass")).toHaveCount(0);
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

test("board page keeps a tall lane gap marker in the first screen", async ({ page }) => {
  const projectsWithTallTodo = structuredClone(projectsForGrid);
  const tasksWithTallTodo = structuredClone(tasks);
  const billingCleanupProject = projectsWithTallTodo.find((project) => project.id === "project-1");
  if (!billingCleanupProject) {
    throw new Error("Expected project-1 test fixture to exist");
  }

  const todoLaneSummary = billingCleanupProject.laneSummaries.find(
    (laneSummary) => laneSummary.id === laneId("project-1", "todo")
  );
  if (!todoLaneSummary) {
    throw new Error("Expected the Todo lane summary to exist");
  }

  for (let taskIndex = 0; taskIndex < 18; taskIndex += 1) {
    tasksWithTallTodo.push({
      body: "",
      createdAt: `2026-03-18T09:${String(taskIndex).padStart(2, "0")}:00.000Z`,
      id: `task-tall-${taskIndex + 1}`,
      laneId: laneId("project-1", "todo"),
      parentTaskId: null,
      position: tasks.length + taskIndex,
      projectId: "project-1",
      ticketId: `BILL-${taskIndex + 10}`,
      tags: [],
      title: `Tall backlog ${taskIndex + 1}`,
      updatedAt: `2026-03-18T09:${String(taskIndex).padStart(2, "0")}:30.000Z`
    });
  }

  todoLaneSummary.taskCount = tasksWithTallTodo.filter(
    (task) => task.projectId === "project-1" && task.laneId === laneId("project-1", "todo")
  ).length;

  await mockAuthenticated(page, {
    projects: projectsWithTallTodo,
    tasks: tasksWithTallTodo
  });

  await page.goto("/projects/project-1");

  const createLaneGap = page.getByTestId(`create-lane-gap-after-${laneId("project-1", "todo")}`);
  const createLaneGapMarker = createLaneGap.locator(".board-lane-gap__marker");
  await createLaneGap.hover({ position: { x: 4, y: 16 } });
  await expect(createLaneGapMarker).toBeVisible();

  const gapBox = await createLaneGap.boundingBox();
  const markerBox = await createLaneGapMarker.boundingBox();
  const viewportHeight = page.viewportSize()?.height ?? 0;

  expect(gapBox).not.toBeNull();
  expect(markerBox).not.toBeNull();
  expect(viewportHeight).toBeGreaterThan(0);

  const gapHeight = gapBox?.height ?? 0;
  const markerCenterY = (markerBox?.y ?? 0) + (markerBox?.height ?? 0) / 2;
  const expectedMarkerCenterY = (gapBox?.y ?? 0) + Math.min(gapHeight / 2, viewportHeight / 2);

  expect(gapHeight).toBeGreaterThan(viewportHeight);
  expect(Math.abs(markerCenterY - expectedMarkerCenterY)).toBeLessThanOrEqual(12);
});

test("board page switcher renames and creates projects while guarding protected lanes", async ({ page }) => {
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

  await expect(page.getByLabel("Delete lane Todo")).toHaveCount(0);
  await expect(page.getByLabel("Delete lane Done")).toHaveCount(0);

  for (const laneName of ["In Progress", "In review"]) {
    await page.getByLabel(`Delete lane ${laneName}`).click();
    const deleteDialog = page.getByRole("alertdialog", { name: `Delete lane ${laneName}` });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { exact: true, name: "Delete" }).click();
    await expect(page.getByRole("heading", { name: laneName })).toHaveCount(0);
  }

  await expect(page.locator(".board-column__header h2")).toHaveText(["Todo", "Done"]);
  await expect(page.getByLabel("Delete lane Todo")).toHaveCount(0);
  await expect(page.getByLabel("Delete lane Done")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Done" })).toBeVisible();
  await expect(page.getByText("Todo and Done lanes cannot be deleted.")).toHaveCount(0);

  await switcherButton.click();
  await switcherInput.fill("12345");
  await page.getByRole("button", { name: "Create Project" }).click();

  await expect(page).toHaveURL(/\/projects\/project-8$/);
  await expect(page.locator(".subnav__current-value")).toHaveText("12345");
  await expect(page.locator(".board-column__header h2")).toHaveText([
    "Todo",
    "In Progress",
    "In review",
    "Done"
  ]);
});
