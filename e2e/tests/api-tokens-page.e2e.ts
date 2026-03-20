import { expect, test } from "@playwright/test";

import { mockAuthenticated } from "./fixtures";

test("api tokens page creates and revokes tokens", async ({ page }) => {
  await mockAuthenticated(page, {
    apiTokens: [
      {
        createdAt: "2026-03-18T08:00:00.000Z",
        id: "token-1",
        lastUsedAt: null,
        name: "Ops sync script"
      }
    ],
    nextApiTokenId: 2
  });

  await page.goto("/");

  await page.getByLabel("Open account menu").click();
  await page.getByRole("menuitem", { name: "API tokens" }).click();

  await expect(page).toHaveURL("/settings/api-tokens");
  await expect(page).toHaveTitle("API Tokens | BBTodo");
  await expect(page.getByRole("heading", { exact: true, name: "API tokens" })).toBeVisible();
  await expect(page.getByText("1 active")).toBeVisible();

  const existingToken = page.locator(".token-row").filter({ hasText: "Ops sync script" });
  await expect(existingToken).toBeVisible();

  await page.getByLabel("Token name").fill("Deploy bot");
  await page.getByRole("button", { name: "Create token" }).click();

  await expect(page.getByText("This token will not be shown again.")).toBeVisible();
  await expect(page.locator(".token-reveal code")).toHaveText("bbtodo_token-2");
  await expect(page.getByText("2 active")).toBeVisible();
  await expect(page.locator(".token-row").filter({ hasText: "Deploy bot" })).toBeVisible();

  await existingToken.getByRole("button", { name: "Revoke" }).click();
  await expect(existingToken).toHaveCount(0);
  await expect(page.getByText("1 active")).toBeVisible();
});
