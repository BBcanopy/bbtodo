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
    expect(project.taskCounts).toEqual({
      todo: 0,
      in_progress: 0,
      done: 0
    });
    expect(project.laneSummaries.map((lane: { name: string }) => lane.name)).toEqual([
      "Todo",
      "In Progress",
      "Done"
    ]);

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
      body: "",
      laneId: project.laneSummaries[0].id,
      projectId: project.id,
      position: 0,
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

    const updatedProjectsResponse = await app.inject({
      method: "GET",
      url: "/api/v1/projects",
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(updatedProjectsResponse.statusCode).toBe(200);
    expect(updatedProjectsResponse.json()).toHaveLength(1);
    expect(updatedProjectsResponse.json()[0]).toMatchObject({
      id: project.id,
      name: project.name,
      taskCounts: {
        todo: 0,
        in_progress: 1,
        done: 0
      }
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
    expect(openApi.paths["/api/v1/projects/{projectId}/lanes"]).toBeDefined();
    expect(openApi.paths["/api/v1/projects/{projectId}/tasks"]).toBeDefined();
  });

  it("supports custom lanes plus task body and ordering updates", async () => {
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
        name: "Editorial board"
      }
    });
    const project = createProjectResponse.json();

    const createLaneResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/lanes`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        name: "Ready for QA"
      }
    });

    expect(createLaneResponse.statusCode).toBe(201);
    expect(createLaneResponse.json()).toMatchObject({
      name: "Ready for QA",
      position: 3,
      systemKey: null,
      taskCount: 0
    });
    const qaLane = createLaneResponse.json();

    const createTaskOneResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        title: "Draft release note",
        body: "## Summary\n\n- ship docs",
        laneId: qaLane.id
      }
    });
    const createTaskTwoResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        title: "Polish QA copy",
        laneId: qaLane.id
      }
    });

    expect(createTaskOneResponse.statusCode).toBe(201);
    expect(createTaskTwoResponse.statusCode).toBe(201);
    expect(createTaskOneResponse.json()).toMatchObject({
      body: "## Summary\n\n- ship docs",
      laneId: qaLane.id,
      position: 0
    });
    expect(createTaskTwoResponse.json()).toMatchObject({
      laneId: qaLane.id,
      position: 1
    });

    const firstTask = createTaskOneResponse.json();
    const secondTask = createTaskTwoResponse.json();

    const reorderTaskResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/tasks/${secondTask.id}`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        body: "Updated body",
        position: 0
      }
    });

    expect(reorderTaskResponse.statusCode).toBe(200);
    expect(reorderTaskResponse.json()).toMatchObject({
      body: "Updated body",
      id: secondTask.id,
      laneId: qaLane.id,
      position: 0
    });

    const lanesResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/lanes`,
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(lanesResponse.statusCode).toBe(200);
    expect(lanesResponse.json()).toHaveLength(4);
    expect(lanesResponse.json()[3]).toMatchObject({
      id: qaLane.id,
      name: "Ready for QA",
      taskCount: 2
    });

    const qaTasksResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(qaTasksResponse.statusCode).toBe(200);
    expect(qaTasksResponse.json().filter((task: { laneId: string }) => task.laneId === qaLane.id)).toEqual([
      expect.objectContaining({
        id: secondTask.id,
        position: 0
      }),
      expect.objectContaining({
        id: firstTask.id,
        position: 1
      })
    ]);
  });
});
