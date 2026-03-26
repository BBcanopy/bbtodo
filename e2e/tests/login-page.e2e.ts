import { expect, test } from "@playwright/test";

import { mockAuthenticated, mockUnauthenticated } from "./fixtures";

test("login page shows sign-in and docs actions", async ({ page }) => {
  await mockUnauthenticated(page);

  await page.goto("/");

  const heroBrandPill = page.locator(".hero-panel__pill");

  await expect(page).toHaveTitle("BBTodo");
  await expect(page.getByRole("heading", { name: "BBTodo" })).toBeVisible();
  await expect(heroBrandPill).toHaveText("BB");
  await expect(heroBrandPill).toHaveCSS("font-family", /"IBM Plex Mono"|IBM Plex Mono/);
  await expect
    .poll(() => heroBrandPill.evaluate((element) => getComputedStyle(element).backgroundImage))
    .toContain("rgb(84, 143, 208)");
  await expect
    .poll(() => heroBrandPill.evaluate((element) => getComputedStyle(element).backgroundImage))
    .toContain("rgb(47, 91, 155)");
  await expect(page.getByRole("button", { name: "Sign in with OIDC" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Read API docs" })).toHaveAttribute("href", "/docs/");
});

test("sign out returns to the login page", async ({ page }) => {
  await mockAuthenticated(page);

  await page.goto("/");

  await page.getByLabel("Open account menu").click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "BBTodo" })).toBeVisible();
});
