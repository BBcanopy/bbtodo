import { expect, test } from "@playwright/test";

import { mockAuthenticated, projectsForGrid, tasks } from "./fixtures";

test("projects page lists boards, filters project cards, and opens them from the switcher", async ({ page }) => {
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

  const brandPill = page.locator(".brand-mark__pill").first();

  await expect(page).toHaveTitle("Projects | BBTodo");
  await expect(brandPill).toHaveText("BB");
  await expect(brandPill).toHaveCSS("font-family", /"IBM Plex Mono"|IBM Plex Mono/);
  await expect
    .poll(() => brandPill.evaluate((element) => getComputedStyle(element).backgroundImage))
    .toContain("rgb(84, 143, 208)");
  await expect
    .poll(() => brandPill.evaluate((element) => getComputedStyle(element).backgroundImage))
    .toContain("rgb(47, 91, 155)");
  await expect(page.locator(".subnav__current-value")).toHaveText("All projects");
  await expect(page.getByRole("button", { name: "Create Lane" })).toHaveCount(0);
  await expect(page.getByLabel("Search cards")).toHaveCount(0);
  const projectSearch = page.getByLabel("Search boards");
  await expect(projectSearch).toBeVisible();

  const projectCard = page.getByTestId("project-card-project-1");
  const projectDeleteButton = projectCard.getByLabel("Delete board Billing cleanup");
  await expect(projectCard.getByRole("heading", { name: "Billing cleanup" })).toBeVisible();
  await expect
    .poll(() => projectCard.evaluate((element) => getComputedStyle(element, "::after").backgroundImage))
    .toBe("none");
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

  await projectSearch.fill("partner");
  await expect(page.getByTestId("project-card-project-6")).toBeVisible();
  await expect(projectCard).toHaveCount(0);

  await projectSearch.fill("ROAD");
  await expect(compactProjectCard).toBeVisible();
  await expect(page.getByTestId("project-card-project-6")).toHaveCount(0);

  await projectSearch.fill("missing");
  await expect(page.getByRole("heading", { name: 'No boards match "missing".' })).toBeVisible();
  await expect(page.getByText("Try a different board name or ticket prefix.")).toBeVisible();

  await projectSearch.fill("");
  await expect(projectCard).toBeVisible();

  const regularLanePillHeight = await regularLanePill.evaluate((element) =>
    Math.round(element.getBoundingClientRect().height)
  );
  const compactLanePillHeight = await compactLanePill.evaluate((element) =>
    Math.round(element.getBoundingClientRect().height)
  );

  expect(compactLanePillHeight).toBe(regularLanePillHeight);
  expect(compactLanePillHeight).toBeLessThanOrEqual(67);
  expect(compactLanePillHeight).toBeGreaterThanOrEqual(63);

  await expect(projectDeleteButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(projectDeleteButton).toHaveCSS("color", "rgb(47, 119, 116)");
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body, "::after").opacity))
    .toBe("0.65");

  await page.getByLabel("Open account menu").click();
  await page.getByRole("button", { name: "Ember" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ember");
  await expect
    .poll(() => brandPill.evaluate((element) => getComputedStyle(element).backgroundImage))
    .toContain("rgb(144, 169, 216)");
  await expect
    .poll(() => brandPill.evaluate((element) => getComputedStyle(element).backgroundImage))
    .toContain("rgb(94, 115, 159)");
  await expect(projectDeleteButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(projectDeleteButton).toHaveCSS("color", "rgb(184, 94, 63)");
  await page.getByRole("button", { name: "Midnight" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
  await expect
    .poll(() => brandPill.evaluate((element) => getComputedStyle(element).backgroundImage))
    .toContain("rgb(90, 162, 228)");
  await expect
    .poll(() => brandPill.evaluate((element) => getComputedStyle(element).backgroundImage))
    .toContain("rgb(31, 77, 130)");
  await expect(projectDeleteButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(projectDeleteButton).toHaveCSS("color", "rgb(142, 229, 224)");
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body, "::after").opacity))
    .toBe("0.22");
  await page.getByLabel("Open account menu").click();

  const switcherButton = page.getByRole("button", { name: "Open project switcher" });
  await switcherButton.click();
  const switcherInput = page.getByLabel("Project switcher input");
  await switcherInput.fill("partner");
  await expect(page.getByRole("button", { name: "Open project Partner audit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open project Billing cleanup" })).toHaveCount(0);
  await page.getByRole("button", { name: "Open project Partner audit" }).click();

  await expect(page).toHaveURL(/\/projects\/PART$/);
  await expect(page.locator(".subnav__current-value")).toHaveText("Partner audit");
});

test("project cards open on click and delete through a confirmation popover", async ({ page }) => {
  await mockAuthenticated(page);

  await page.goto("/");

  const projectCard = page.getByTestId("project-card-project-1");
  await expect(projectCard).toBeVisible();
  await expect(projectCard.locator(".project-card__timestamp")).toHaveCount(0);

  await projectCard.click();
  await expect(page).toHaveURL(/\/projects\/BILL$/);
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

test("projects page packs later cards beneath shorter neighbors when a title wraps", async ({ page }) => {
  const projectsWithLongTitle = structuredClone(projectsForGrid);
  const longTitleProject = projectsWithLongTitle.find((project) => project.id === "project-1");
  const regularProject = projectsWithLongTitle.find((project) => project.id === "project-2");
  const packedProject = projectsWithLongTitle.find((project) => project.id === "project-5");

  if (!longTitleProject) {
    throw new Error("Expected project-1 test fixture to exist");
  }

  if (!regularProject) {
    throw new Error("Expected project-2 test fixture to exist");
  }

  if (!packedProject) {
    throw new Error("Expected project-5 test fixture to exist");
  }

  longTitleProject.name = "bbnote-table-insert-picker-review-and-validation-pass";

  await mockAuthenticated(page, { projects: projectsWithLongTitle });

  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto("/");

  const longTitleProjectCard = page.getByTestId("project-card-project-1");
  const regularProjectCard = page.getByTestId("project-card-project-2");
  const packedProjectCard = page.getByTestId("project-card-project-5");

  await expect(
    longTitleProjectCard.getByRole("heading", {
      name: "bbnote-table-insert-picker-review-and-validation-pass"
    })
  ).toBeVisible();

  for (const laneLabel of ["Todo 2", "In Progress 1", "In review 0", "Done 1"]) {
    await expect(longTitleProjectCard.getByLabel(laneLabel)).toBeVisible();
  }

  const regularProjectLayout = await regularProjectCard.evaluate((element) => {
    const cardSurface = element.querySelector<HTMLElement>(".project-card__surface");

    if (!cardSurface) {
      throw new Error("Expected the project card surface to exist");
    }

    return {
      height: Math.round(cardSurface.getBoundingClientRect().height),
      minHeight: Math.round(Number.parseFloat(getComputedStyle(cardSurface).minHeight))
    };
  });
  const longTitleLayout = await longTitleProjectCard.evaluate((element) => {
    const cardSurface = element.querySelector<HTMLElement>(".project-card__surface");
    const lanePills = Array.from(element.querySelectorAll<HTMLElement>(".project-card__lane-pill"));

    if (!cardSurface) {
      throw new Error("Expected the project card surface to exist");
    }

    if (lanePills.length === 0) {
      throw new Error("Expected lane pills to exist");
    }

    const lastLanePill = lanePills.at(-1);

    if (!lastLanePill) {
      throw new Error("Expected a final lane pill to exist");
    }

    const cardRect = cardSurface.getBoundingClientRect();
    const lastLanePillRect = lastLanePill.getBoundingClientRect();

    return {
      bottomInset: Math.round((cardRect.bottom - lastLanePillRect.bottom) * 100) / 100,
      bottom: Math.round(cardRect.bottom),
      clientHeight: cardSurface.clientHeight,
      height: Math.round(cardRect.height),
      left: Math.round(cardRect.left),
      minHeight: Math.round(Number.parseFloat(getComputedStyle(cardSurface).minHeight)),
      scrollHeight: cardSurface.scrollHeight
    };
  });
  const packedProjectPosition = await packedProjectCard.evaluate((element) => {
    const cardRect = element.getBoundingClientRect();

    return {
      left: Math.round(cardRect.left),
      top: Math.round(cardRect.top)
    };
  });

  expect(regularProjectLayout.height).toBe(regularProjectLayout.minHeight);
  expect(longTitleLayout.height).toBeGreaterThan(longTitleLayout.minHeight);
  expect(longTitleLayout.height).toBeGreaterThan(regularProjectLayout.height);
  expect(longTitleLayout.scrollHeight).toBeLessThanOrEqual(longTitleLayout.clientHeight + 1);
  expect(longTitleLayout.bottomInset).toBeGreaterThanOrEqual(0);
  expect(packedProjectPosition.top).toBeLessThan(longTitleLayout.bottom);
  expect(packedProjectPosition.left).toBeGreaterThan(longTitleLayout.left);
});

test("projects search opens an exact ticket id", async ({ page }) => {
  await mockAuthenticated(page, {
    projects: projectsForGrid,
    tasks
  });

  await page.goto("/");

  const searchInput = page.getByLabel("Search boards");
  await searchInput.fill("bill-2");

  const editDialog = page.getByRole("dialog", { name: "Edit BILL-2" });
  const noMatchesHeading = page.getByRole("heading", { name: 'No boards match "bill-2".' });

  await expect(page).toHaveURL(/\/\?q=bill-2$/);
  await expect(editDialog).toHaveCount(0);
  await expect(noMatchesHeading).toHaveCount(0);
  await expect(page.getByTestId("project-card-project-1")).toBeVisible();
  await expect(page.getByTestId("project-card-project-2")).toHaveCount(0);

  await searchInput.press("Enter");

  await expect(page).toHaveURL(/\/projects\/BILL\/BILL-2\?q=BILL-2$/);
  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByLabel("Title")).toHaveValue("Tighten callback logging");
  await expect(page.getByLabel("Search cards")).toHaveValue("BILL-2");

  await page.getByLabel("Close edit task dialog").click();

  await expect(page).toHaveURL(/\/projects\/BILL\?q=BILL-2$/);
  await expect(page.getByTestId("task-card-task-2")).toBeVisible();
  await expect(page.getByTestId("task-card-task-1")).toHaveCount(0);
});

test("projects search shows no matches for an exact ticket id with no matching board prefix", async ({
  page
}) => {
  await mockAuthenticated(page, {
    projects: projectsForGrid,
    tasks
  });

  await page.goto("/");

  await page.getByLabel("Search boards").fill("MISS-1");

  await expect(page).toHaveURL(/\/\?q=MISS-1$/);
  await expect(page.getByRole("heading", { name: 'No boards match "MISS-1".' })).toBeVisible();
  await expect(page.getByText("Try a different board name or ticket prefix.")).toBeVisible();
  await expect(page.getByTestId("project-card-project-1")).toHaveCount(0);
});

test("missing board routes return to projects with a toast", async ({ page }) => {
  await mockAuthenticated(page);

  await page.goto("/projects/NOPE");

  const toast = page.getByTestId("toast-notice");

  await expect(page).toHaveURL("/");
  await expect(page.locator(".subnav__current-value")).toHaveText("All projects");
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("Board not found");
  await expect(toast).toContainText("Board NOPE does not exist.");
});
