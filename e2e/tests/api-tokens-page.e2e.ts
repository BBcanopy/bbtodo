import { devices, expect, test } from "@playwright/test";

import { mockAuthenticated } from "./fixtures";

const { defaultBrowserType: _ignoredDefaultBrowserType, ...iPhone13 } = devices["iPhone 13"];

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

test.describe("mobile api tokens page", () => {
  test.use({
    ...iPhone13
  });

  test("api tokens page keeps controls readable on small screens", async ({ page }) => {
    await mockAuthenticated(page, {
      apiTokens: [
        {
          createdAt: "2026-03-18T08:00:00.000Z",
          id: "token-1",
          lastUsedAt: "2026-03-18T08:25:00.000Z",
          name: "Ops sync script"
        }
      ]
    });

    await page.goto("/");

    await page.getByLabel("Open account menu").click();
    await page.getByRole("menuitem", { name: "API tokens" }).click();

    const existingToken = page.locator(".token-row").filter({ hasText: "Ops sync script" });
    const tokenCopy = existingToken.locator(".token-row__copy");
    const revokeButton = existingToken.getByRole("button", { name: "Revoke" });

    await expect(page.locator(".label-chip").first()).toHaveCSS("font-size", "14px");
    await expect(page.locator(".field__label")).toHaveCSS("font-size", "14px");
    await expect(existingToken.locator(".token-row__timestamp")).toHaveCSS("font-size", "14px");

    const tokenCopyBox = await tokenCopy.boundingBox();
    const revokeButtonBox = await revokeButton.boundingBox();

    expect(tokenCopyBox).not.toBeNull();
    expect(revokeButtonBox).not.toBeNull();
    expect(revokeButtonBox?.y ?? 0).toBeGreaterThan(tokenCopyBox?.y ?? 0);
  });
});
