import { expect, test } from "@playwright/test";

import { mockAuthenticated, mockUnauthenticated } from "./fixtures";

const gravatarPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==",
  "base64"
);

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

test("account avatar shows a gravatar image when one exists", async ({ page }) => {
  await mockAuthenticated(page);
  await page.route("https://gravatar.com/avatar/**", async (route) => {
    await route.fulfill({
      body: gravatarPng,
      contentType: "image/png",
      status: 200
    });
  });

  await page.goto("/");

  const avatarImage = page.locator(".avatar-button__image");
  const avatarLetter = page.locator(".avatar-button__letter");

  await expect(avatarImage).toHaveAttribute("src", /https:\/\/gravatar\.com\/avatar\//);
  await expect
    .poll(async () => (await avatarImage.getAttribute("class")) ?? "")
    .toContain("is-visible");
  await expect
    .poll(async () => (await avatarLetter.getAttribute("class")) ?? "")
    .toContain("is-hidden");
});

test("account avatar falls back to the first letter when gravatar is missing", async ({ page }) => {
  await mockAuthenticated(page);
  await page.route("https://gravatar.com/avatar/**", async (route) => {
    await route.fulfill({ status: 404 });
  });

  await page.goto("/");

  const avatarButton = page.getByLabel("Open account menu");
  const avatarLetter = avatarButton.locator(".avatar-button__letter");

  await expect(avatarLetter).toHaveText("N");
  await expect(avatarButton.locator(".avatar-button__image")).toHaveCount(0);
});
