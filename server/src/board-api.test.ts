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

describe("projects and tasks API", () => {
  it("supports the full project and task lifecycle", async () => {
    const oidc = createMutableMockOidcProvider({
      subject: "user-1",
      email: "one@example.com",
      displayName: "User One"
    });
    const app = buildApp({
      config: testConfig,
      oidcProvider: oidc.provider,
      sqlitePath: ":memory:"
    });
    createdApps.push(app);

    const session = await loginWithOidc(app);

    const createProjectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        name: "Launch board"
      }
    });

    expect(createProjectResponse.statusCode).toBe(201);
    const project = createProjectResponse.json();

    const listProjectsResponse = await app.inject({
      method: "GET",
      url: "/api/v1/projects",
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(listProjectsResponse.statusCode).toBe(200);
    expect(listProjectsResponse.json()).toEqual([project]);

    const createTaskResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        title: "Write the first task"
      }
    });

    expect(createTaskResponse.statusCode).toBe(201);
    expect(createTaskResponse.json()).toMatchObject({
      projectId: project.id,
      status: "todo",
      title: "Write the first task"
    });

    const task = createTaskResponse.json();

    const updateTaskResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/tasks/${task.id}`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        status: "in_progress"
      }
    });

    expect(updateTaskResponse.statusCode).toBe(200);
    expect(updateTaskResponse.json()).toMatchObject({
      id: task.id,
      status: "in_progress"
    });

    const filteredTasksResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/tasks?status=in_progress`,
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(filteredTasksResponse.statusCode).toBe(200);
    expect(filteredTasksResponse.json()).toHaveLength(1);
    expect(filteredTasksResponse.json()[0]).toMatchObject({
      id: task.id,
      status: "in_progress"
    });

    const deleteTaskResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}/tasks/${task.id}`,
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(deleteTaskResponse.statusCode).toBe(204);

    const deleteProjectResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}`,
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(deleteProjectResponse.statusCode).toBe(204);

    const afterDeleteListResponse = await app.inject({
      method: "GET",
      url: "/api/v1/projects",
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(afterDeleteListResponse.statusCode).toBe(200);
    expect(afterDeleteListResponse.json()).toEqual([]);
  });

  it("isolates projects and tasks between users and exposes OpenAPI", async () => {
    const oidc = createMutableMockOidcProvider({
      subject: "owner",
      email: "owner@example.com",
      displayName: "Owner"
    });
    const app = buildApp({
      config: testConfig,
      oidcProvider: oidc.provider,
      sqlitePath: ":memory:"
    });
    createdApps.push(app);

    const ownerSession = await loginWithOidc(app);

    const createProjectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      cookies: {
        bbtodo_session: ownerSession.sessionCookie
      },
      payload: {
        name: "Private board"
      }
    });

    const project = createProjectResponse.json();

    oidc.setIdentity({
      subject: "other-user",
      email: "other@example.com",
      displayName: "Other User"
    });
    const otherSession = await loginWithOidc(app);

    const otherProjectsResponse = await app.inject({
      method: "GET",
      url: "/api/v1/projects",
      cookies: {
        bbtodo_session: otherSession.sessionCookie
      }
    });

    expect(otherProjectsResponse.statusCode).toBe(200);
    expect(otherProjectsResponse.json()).toEqual([]);

    const otherDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}`,
      cookies: {
        bbtodo_session: otherSession.sessionCookie
      }
    });

    expect(otherDeleteResponse.statusCode).toBe(404);

    const openApiResponse = await app.inject({
      method: "GET",
      url: "/docs/openapi.json"
    });

    expect(openApiResponse.statusCode).toBe(200);
    const openApi = openApiResponse.json();
    expect(openApi.openapi).toBe("3.1.0");
    expect(openApi.paths["/api/v1/projects"]).toBeDefined();
    expect(openApi.paths["/api/v1/projects/{projectId}/tasks"]).toBeDefined();
  });
});
