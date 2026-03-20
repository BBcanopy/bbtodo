import { expect, test } from "@playwright/test";

import { mockAuthenticated, mockUnauthenticated } from "./fixtures";

test("login page shows sign-in and docs actions", async ({ page }) => {
  await mockUnauthenticated(page);

  await page.goto("/");

  await expect(page).toHaveTitle("BBTodo");
  await expect(page.getByRole("heading", { name: "BBTodo" })).toBeVisible();
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
