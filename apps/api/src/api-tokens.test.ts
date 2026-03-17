import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import {
  createMutableMockOidcProvider,
  loginWithOidc,
  testConfig
} from "./test-helpers.js";

const createdApps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  while (createdApps.length > 0) {
    const app = createdApps.pop();
    if (app) {
      await app.close();
    }
  }
});

describe("API tokens", () => {
  it("creates, uses, lists, and revokes personal API tokens", async () => {
    const oidc = createMutableMockOidcProvider({
      subject: "token-user",
      email: "token@example.com",
      displayName: "Token User"
    });
    const app = buildApp({
      config: testConfig,
      oidcProvider: oidc.provider
    });
    createdApps.push(app);

    const session = await loginWithOidc(app);

    const createTokenResponse = await app.inject({
      method: "POST",
      url: "/api/v1/api-tokens",
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        name: "CLI"
      }
    });

    expect(createTokenResponse.statusCode).toBe(201);
    const createdToken = createTokenResponse.json();
    expect(createdToken.token).toMatch(/^bbtodo_pat_/);
    expect(createdToken.tokenInfo).toMatchObject({
      lastUsedAt: null,
      name: "CLI"
    });

    const bearerProjectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: {
        authorization: `Bearer ${createdToken.token}`
      },
      payload: {
        name: "Script-created board"
      }
    });

    expect(bearerProjectResponse.statusCode).toBe(201);

    const listTokensResponse = await app.inject({
      method: "GET",
      url: "/api/v1/api-tokens",
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(listTokensResponse.statusCode).toBe(200);
    expect(listTokensResponse.json()[0]).toMatchObject({
      id: createdToken.tokenInfo.id,
      lastUsedAt: expect.any(String),
      name: "CLI"
    });

    const deleteTokenResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/api-tokens/${createdToken.tokenInfo.id}`,
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(deleteTokenResponse.statusCode).toBe(204);

    const revokedTokenResponse = await app.inject({
      method: "GET",
      url: "/api/v1/projects",
      headers: {
        authorization: `Bearer ${createdToken.token}`
      }
    });

    expect(revokedTokenResponse.statusCode).toBe(401);
  });
});
