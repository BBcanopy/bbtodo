import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import {
  createMutableMockOidcProvider,
  loginWithOidc,
  testConfig
} from "./test-helpers.js";

const createdApps: ReturnType<typeof buildApp>[] = [];
const tag = (label: string, color: "amber" | "coral" | "moss" | "orchid" | "sky" | "slate" = "moss") => ({
  color,
  label
});

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
    expect(project.laneSummaries.map((lane: { name: string }) => lane.name)).toEqual([
      "Todo",
      "In Progress",
      "In review",
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

    const updateProjectResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        name: "Launch board v2"
      }
    });

    expect(updateProjectResponse.statusCode).toBe(200);
    expect(updateProjectResponse.json()).toMatchObject({
      id: project.id,
      name: "Launch board v2"
    });

    const createTaskResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        title: "Write the first task",
        tags: [tag("launch", "sky"), tag("api", "amber")]
      }
    });

    expect(createTaskResponse.statusCode).toBe(201);
    expect(createTaskResponse.json()).toMatchObject({
      body: "",
      laneId: project.laneSummaries[0].id,
      projectId: project.id,
      position: 0,
      tags: [tag("launch", "sky"), tag("api", "amber")],
      title: "Write the first task"
    });

    const task = createTaskResponse.json();
    const inProgressLane = project.laneSummaries[1];

    const updateTaskResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/tasks/${task.id}`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        laneId: inProgressLane.id,
        tags: [tag("backend", "coral"), tag("launch", "sky")]
      }
    });

    expect(updateTaskResponse.statusCode).toBe(200);
    expect(updateTaskResponse.json()).toMatchObject({
      id: task.id,
      laneId: inProgressLane.id,
      tags: [tag("backend", "coral"), tag("launch", "sky")]
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
      name: "Launch board v2"
    });
    expect(updatedProjectsResponse.json()[0].laneSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: inProgressLane.id,
          taskCount: 1
        })
      ])
    );

    const listedTasksResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(listedTasksResponse.statusCode).toBe(200);
    expect(listedTasksResponse.json()).toHaveLength(1);
    expect(listedTasksResponse.json()[0]).toMatchObject({
      id: task.id,
      laneId: inProgressLane.id,
      tags: [tag("backend", "coral"), tag("launch", "sky")]
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

  it("supports one-level subtasks and promotes them when a parent is deleted", async () => {
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
        name: "Subtask board"
      }
    });
    const project = createProjectResponse.json();
    const todoLane = project.laneSummaries[0];
    const inProgressLane = project.laneSummaries[1];

    const parentTaskResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        title: "Parent task"
      }
    });
    const siblingTaskResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        title: "Sibling task"
      }
    });

    const parentTask = parentTaskResponse.json();
    const siblingTask = siblingTaskResponse.json();

    const createSubtaskResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        title: "Child task",
        parentTaskId: parentTask.id
      }
    });

    expect(createSubtaskResponse.statusCode).toBe(201);
    const childTask = createSubtaskResponse.json();
    expect(childTask).toMatchObject({
      laneId: todoLane.id,
      parentTaskId: parentTask.id,
      position: 0,
      title: "Child task"
    });

    const nestedSubtaskResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        title: "Too deep",
        parentTaskId: childTask.id
      }
    });

    expect(nestedSubtaskResponse.statusCode).toBe(400);

    const moveChildToParentLaneResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/tasks/${siblingTask.id}`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        parentTaskId: parentTask.id
      }
    });

    expect(moveChildToParentLaneResponse.statusCode).toBe(200);
    expect(moveChildToParentLaneResponse.json()).toMatchObject({
      laneId: todoLane.id,
      parentTaskId: parentTask.id,
      position: 1
    });

    const moveParentResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/tasks/${parentTask.id}`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        laneId: inProgressLane.id
      }
    });

    expect(moveParentResponse.statusCode).toBe(200);
    expect(moveParentResponse.json()).toMatchObject({
      laneId: inProgressLane.id,
      parentTaskId: null
    });

    const listedTasksResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(listedTasksResponse.statusCode).toBe(200);
    expect(listedTasksResponse.json()).toEqual([
      expect.objectContaining({
        id: parentTask.id,
        laneId: inProgressLane.id,
        parentTaskId: null,
        position: 0
      }),
      expect.objectContaining({
        id: childTask.id,
        laneId: inProgressLane.id,
        parentTaskId: parentTask.id,
        position: 0
      }),
      expect.objectContaining({
        id: siblingTask.id,
        laneId: inProgressLane.id,
        parentTaskId: parentTask.id,
        position: 1
      })
    ]);

    const projectSummaryResponse = await app.inject({
      method: "GET",
      url: "/api/v1/projects",
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(projectSummaryResponse.statusCode).toBe(200);
    expect(projectSummaryResponse.json()[0].laneSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: todoLane.id, taskCount: 0 }),
        expect.objectContaining({ id: inProgressLane.id, taskCount: 3 })
      ])
    );

    const invalidParentMoveResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/tasks/${parentTask.id}`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        parentTaskId: childTask.id
      }
    });

    expect(invalidParentMoveResponse.statusCode).toBe(400);

    const deleteParentResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}/tasks/${parentTask.id}`,
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(deleteParentResponse.statusCode).toBe(204);

    const tasksAfterDeleteResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(tasksAfterDeleteResponse.statusCode).toBe(200);
    expect(tasksAfterDeleteResponse.json()).toEqual([
      expect.objectContaining({
        id: childTask.id,
        laneId: inProgressLane.id,
        parentTaskId: null,
        position: 0
      }),
      expect.objectContaining({
        id: siblingTask.id,
        laneId: inProgressLane.id,
        parentTaskId: null,
        position: 1
      })
    ]);
  });

  it("unnests a subtask when a lane-only move omits parentTaskId", async () => {
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
        name: "Lane-only move board"
      }
    });
    const project = createProjectResponse.json();
    const todoLane = project.laneSummaries[0];
    const inProgressLane = project.laneSummaries[1];

    const parentTaskResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        title: "Parent task"
      }
    });
    const childTaskResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        title: "Child task",
        parentTaskId: parentTaskResponse.json().id
      }
    });

    const childTask = childTaskResponse.json();

    const moveChildResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/tasks/${childTask.id}`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        laneId: inProgressLane.id,
        position: 0
      }
    });

    expect(moveChildResponse.statusCode).toBe(200);
    expect(moveChildResponse.json()).toMatchObject({
      id: childTask.id,
      laneId: inProgressLane.id,
      parentTaskId: null,
      position: 0
    });

    const listedTasksResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(listedTasksResponse.statusCode).toBe(200);
    expect(listedTasksResponse.json()).toEqual([
      expect.objectContaining({
        id: parentTaskResponse.json().id,
        laneId: todoLane.id,
        parentTaskId: null,
        position: 0
      }),
      expect.objectContaining({
        id: childTask.id,
        laneId: inProgressLane.id,
        parentTaskId: null,
        position: 0
      })
    ]);
  });

  it("lists reusable tags across the user's projects", async () => {
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

    const firstProjectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        name: "Marketing board"
      }
    });
    const secondProjectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        name: "Website board"
      }
    });

    const firstProject = firstProjectResponse.json();
    const secondProject = secondProjectResponse.json();

    await app.inject({
      method: "POST",
      url: `/api/v1/projects/${firstProject.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        title: "Plan Q2 work",
        tags: [tag("strategy", "sky"), tag("shared", "moss")]
      }
    });

    await app.inject({
      method: "POST",
      url: `/api/v1/projects/${secondProject.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        title: "Refresh homepage",
        tags: [tag("design", "amber"), tag("shared", "moss")]
      }
    });

    const taskTagsResponse = await app.inject({
      method: "GET",
      url: "/api/v1/task-tags",
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(taskTagsResponse.statusCode).toBe(200);
    expect(taskTagsResponse.json()).toEqual([
      tag("design", "amber"),
      tag("shared", "moss"),
      tag("strategy", "sky")
    ]);
  });

  it("updates the shared color for existing tags across the user's tasks", async () => {
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

    const firstProjectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        name: "Platform board"
      }
    });
    const secondProjectResponse = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        name: "Marketing board"
      }
    });

    const firstProject = firstProjectResponse.json();
    const secondProject = secondProjectResponse.json();

    const firstTaskResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${firstProject.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        title: "Instrument callbacks",
        tags: [tag("backend", "sky")]
      }
    });
    const secondTaskResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${secondProject.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        title: "Sync launch copy",
        tags: [tag("backend", "sky"), tag("shared", "moss")]
      }
    });

    const firstTask = firstTaskResponse.json();
    const secondTask = secondTaskResponse.json();

    const updateTaskResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${firstProject.id}/tasks/${firstTask.id}`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        tags: [tag("backend", "amber")]
      }
    });

    expect(updateTaskResponse.statusCode).toBe(200);
    expect(updateTaskResponse.json()).toMatchObject({
      id: firstTask.id,
      tags: [tag("backend", "amber")]
    });

    const secondProjectTasksResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${secondProject.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(secondProjectTasksResponse.statusCode).toBe(200);
    expect(secondProjectTasksResponse.json()).toHaveLength(1);
    expect(secondProjectTasksResponse.json()[0]).toMatchObject({
      id: secondTask.id,
      tags: [tag("backend", "amber"), tag("shared", "moss")]
    });

    const taskTagsResponse = await app.inject({
      method: "GET",
      url: "/api/v1/task-tags",
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(taskTagsResponse.statusCode).toBe(200);
    expect(taskTagsResponse.json()).toEqual([
      tag("backend", "amber"),
      tag("shared", "moss")
    ]);
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

    const createTaskResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: ownerSession.sessionCookie
      },
      payload: {
        title: "Owner-only tag seed",
        tags: [tag("private", "slate")]
      }
    });

    expect(createTaskResponse.statusCode).toBe(201);

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

    const otherTaskTagsResponse = await app.inject({
      method: "GET",
      url: "/api/v1/task-tags",
      cookies: {
        bbtodo_session: otherSession.sessionCookie
      }
    });

    expect(otherTaskTagsResponse.statusCode).toBe(200);
    expect(otherTaskTagsResponse.json()).toEqual([]);

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
    const swaggerUiJsonResponse = await app.inject({
      method: "GET",
      url: "/docs/json"
    });

    expect(openApiResponse.statusCode).toBe(200);
    expect(openApiResponse.headers["cache-control"]).toBe("no-store");
    expect(swaggerUiJsonResponse.statusCode).toBe(200);
    expect(swaggerUiJsonResponse.headers["cache-control"]).toBe("no-store");
    const openApi = openApiResponse.json();
    const swaggerUiJson = swaggerUiJsonResponse.json();
    expect(openApi.openapi).toBe("3.1.0");
    expect(openApi.components?.securitySchemes).toEqual(
      expect.objectContaining({
        apiToken: expect.objectContaining({
          type: "http",
          scheme: "bearer",
          bearerFormat: "API token"
        }),
        sessionCookie: expect.objectContaining({
          type: "apiKey",
          in: "cookie",
          name: "bbtodo_session"
        })
      })
    );
    expect(openApi.components?.schemas).toEqual(
      expect.objectContaining({
        ErrorResponse: expect.any(Object),
        Task: expect.any(Object),
        TaskTagInput: expect.any(Object)
      })
    );
    expect(openApi.paths["/api/v1/task-tags"]).toBeDefined();
    expect(openApi.paths["/api/v1/projects"]).toBeDefined();
    expect(openApi.paths["/api/v1/projects/{projectId}/lanes"]).toBeDefined();
    expect(openApi.paths["/api/v1/projects/{projectId}/lanes/{laneId}"]).toBeDefined();
    expect(openApi.paths["/api/v1/projects/{projectId}/tasks"]).toBeDefined();
    expect(openApi.paths["/api/v1/projects"].get.security).toEqual([
      { apiToken: [] },
      { sessionCookie: [] }
    ]);
    expect(openApi.paths["/api/v1/api-tokens"].post.security).toEqual([
      { sessionCookie: [] }
    ]);
    expect(swaggerUiJson.components.schemas.TaskTag.$id).toBeUndefined();
    expect(swaggerUiJson.components.schemas.TaskTag.$schema).toBeUndefined();
    expect(swaggerUiJson.paths["/api/v1/task-tags"].get.responses["200"].content["application/json"].schema.items).toEqual({
      $ref: "#/components/schemas/TaskTag"
    });
    expect(
      openApi.paths["/api/v1/projects/{projectId}/tasks"].post.requestBody.content["application/json"].schema.properties
        .tags.items.anyOf[1]
    ).toEqual({
      $ref: "#/components/schemas/TaskTagInput"
    });
    expect(openApi.paths["/api/v1/projects/{projectId}/tasks"].post.responses["201"]).toEqual({
      content: {
        "application/json": {
          schema: {
            $ref: "#/components/schemas/Task"
          }
        }
      },
      description: "Default Response"
    });
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
      position: 4,
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
        laneId: qaLane.id,
        tags: [tag("docs", "sky"), tag("qa", "orchid")]
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
      tags: [tag("docs", "sky"), tag("qa", "orchid")],
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
        tags: [tag("copy", "amber"), tag("qa", "orchid")],
        position: 0
      }
    });

    expect(reorderTaskResponse.statusCode).toBe(200);
    expect(reorderTaskResponse.json()).toMatchObject({
      body: "Updated body",
      id: secondTask.id,
      laneId: qaLane.id,
      position: 0,
      tags: [tag("copy", "amber"), tag("qa", "orchid")]
    });

    const reorderLaneResponse = await app.inject({
      method: "PATCH",
      url: `/api/v1/projects/${project.id}/lanes/${qaLane.id}`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        position: 1
      }
    });

    expect(reorderLaneResponse.statusCode).toBe(200);
    expect(reorderLaneResponse.json()).toMatchObject({
      id: qaLane.id,
      position: 1
    });

    const lanesResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/lanes`,
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(lanesResponse.statusCode).toBe(200);
    expect(lanesResponse.json()).toHaveLength(5);
    expect(lanesResponse.json().map((lane: { name: string }) => lane.name)).toEqual([
      "Todo",
      "Ready for QA",
      "In Progress",
      "In review",
      "Done"
    ]);
    expect(lanesResponse.json()[1]).toMatchObject({
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
        position: 0,
        tags: [tag("copy", "amber"), tag("qa", "orchid")]
      }),
      expect.objectContaining({
        id: firstTask.id,
        position: 1,
        tags: [tag("docs", "sky"), tag("qa", "orchid")]
      })
    ]);
  });

  it("deletes custom lanes and moves tasks into another lane", async () => {
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
        name: "QA board"
      }
    });
    const project = createProjectResponse.json();
    const doneLane = project.laneSummaries[3];

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
    const qaLane = createLaneResponse.json();

    const doneTaskResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        title: "Already shipped",
        laneId: doneLane.id
      }
    });
    const firstQaTaskResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        title: "Draft changelog",
        laneId: qaLane.id,
        tags: [tag("qa", "orchid")]
      }
    });
    const secondQaTaskResponse = await app.inject({
      method: "POST",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        title: "Verify release note",
        laneId: qaLane.id
      }
    });

    const deleteWithoutDestinationResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}/lanes/${qaLane.id}`,
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(deleteWithoutDestinationResponse.statusCode).toBe(400);
    expect(deleteWithoutDestinationResponse.json()).toEqual({
      message: "Select a destination lane before deleting this lane."
    });

    const deleteLaneResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}/lanes/${qaLane.id}`,
      cookies: {
        bbtodo_session: session.sessionCookie
      },
      payload: {
        destinationLaneId: doneLane.id
      }
    });

    expect(deleteLaneResponse.statusCode).toBe(204);

    const lanesResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/lanes`,
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(lanesResponse.statusCode).toBe(200);
    expect(lanesResponse.json().map((lane: { name: string }) => lane.name)).toEqual([
      "Todo",
      "In Progress",
      "In review",
      "Done"
    ]);
    expect(
      lanesResponse.json().find((lane: { id: string }) => lane.id === doneLane.id)
    ).toMatchObject({
      id: doneLane.id,
      taskCount: 3
    });

    const tasksResponse = await app.inject({
      method: "GET",
      url: `/api/v1/projects/${project.id}/tasks`,
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(tasksResponse.statusCode).toBe(200);
    expect(
      tasksResponse.json().filter((task: { laneId: string }) => task.laneId === doneLane.id)
    ).toEqual([
      expect.objectContaining({
        id: doneTaskResponse.json().id,
        laneId: doneLane.id,
        position: 0
      }),
      expect.objectContaining({
        id: firstQaTaskResponse.json().id,
        laneId: doneLane.id,
        position: 1,
        tags: [tag("qa", "orchid")]
      }),
      expect.objectContaining({
        id: secondQaTaskResponse.json().id,
        laneId: doneLane.id,
        position: 2
      })
    ]);
  });

  it("rejects deleting the final remaining lane", async () => {
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
        name: "Minimal board"
      }
    });
    const project = createProjectResponse.json();

    for (const lane of project.laneSummaries.slice(0, -1)) {
      const deleteLaneResponse = await app.inject({
        method: "DELETE",
        url: `/api/v1/projects/${project.id}/lanes/${lane.id}`,
        cookies: {
          bbtodo_session: session.sessionCookie
        }
      });

      expect(deleteLaneResponse.statusCode).toBe(204);
    }

    const finalLane = project.laneSummaries.at(-1);
    expect(finalLane).toBeDefined();

    const deleteFinalLaneResponse = await app.inject({
      method: "DELETE",
      url: `/api/v1/projects/${project.id}/lanes/${finalLane?.id}`,
      cookies: {
        bbtodo_session: session.sessionCookie
      }
    });

    expect(deleteFinalLaneResponse.statusCode).toBe(400);
    expect(deleteFinalLaneResponse.json()).toEqual({
      message: "Projects must keep at least one lane."
    });
  });
});
