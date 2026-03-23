import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import {
  createMutableMockOidcProvider,
  loginWithOidc,
  testConfig
} from "../test-helpers.js";

const createdApps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  while (createdApps.length > 0) {
    const app = createdApps.pop();
    if (app) {
      await app.close();
    }
  }
});

describe("auth routes", () => {
  it("rejects /api/v1/me without a session", async () => {
    const oidc = createMutableMockOidcProvider({
      subject: "user-123",
      email: "hello@example.com",
      displayName: "bbtodo Tester"
    });
    const app = buildApp({
      config: testConfig,
      oidcProvider: oidc.provider,
      sqlitePath: ":memory:"
    });
    createdApps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/me"
    });

    expect(response.statusCode).toBe(401);
  });

  it("creates a session after the OIDC callback and clears it on logout", async () => {
    const oidc = createMutableMockOidcProvider({
      subject: "user-123",
      email: "hello@example.com",
      displayName: "bbtodo Tester"
    });
    const app = buildApp({
      config: testConfig,
      oidcProvider: oidc.provider,
      sqlitePath: ":memory:"
    });
    createdApps.push(app);

    const session = await loginWithOidc(app);

    expect(session.loginResponse.statusCode).toBe(302);
    expect(session.loginResponse.headers.location).toBe(
      "https://issuer.example.com/authorize?state=test-state"
    );
    expect(session.callbackResponse.statusCode).toBe(302);
    expect(session.callbackResponse.headers.location).toBe("/");

    const meResponse = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json()).toMatchObject({
      email: "hello@example.com",
      name: "bbtodo Tester",
      theme: "sea"
    });

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/auth/logout",
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(logoutResponse.statusCode).toBe(204);

    const afterLogoutResponse = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(afterLogoutResponse.statusCode).toBe(401);
  });

  it("stores the selected theme as a user preference", async () => {
    const oidc = createMutableMockOidcProvider({
      subject: "theme-user",
      email: "themes@example.com",
      displayName: "Theme User"
    });
    const app = buildApp({
      config: testConfig,
      oidcProvider: oidc.provider,
      sqlitePath: ":memory:"
    });
    createdApps.push(app);

    const session = await loginWithOidc(app);

    const updateThemeResponse = await app.inject({
      method: "PATCH",
      url: "/api/v1/me/theme",
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        theme: "midnight"
      }
    });

    expect(updateThemeResponse.statusCode).toBe(200);
    expect(updateThemeResponse.json()).toMatchObject({
      id: expect.any(String),
      theme: "midnight"
    });

    const meResponse = await app.inject({
      method: "GET",
      url: "/api/v1/me",
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(meResponse.statusCode).toBe(200);
    expect(meResponse.json()).toMatchObject({
      theme: "midnight"
    });
  });
});
