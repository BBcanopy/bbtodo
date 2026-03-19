import { z } from "zod";

import type {
  LaneRecord,
  LaneWithTaskCount,
  ProjectRecord,
  ProjectTaskCounts,
  TaskRecord,
  UserRecord
} from "./db.js";
import { taskStatusValues } from "./db.js";

export const taskStatusSchema = z.enum(taskStatusValues);

export const errorResponseSchema = z.object({
  message: z.string()
});

export const meResponseSchema = z.object({
  email: z.string().nullable(),
  id: z.string(),
  name: z.string().nullable()
});

export const taskCountsResponseSchema = z.object({
  todo: z.number().int().nonnegative(),
  in_progress: z.number().int().nonnegative(),
  done: z.number().int().nonnegative()
});

export const laneResponseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  systemKey: taskStatusSchema.nullable(),
  position: z.number().int().nonnegative(),
  taskCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const projectResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  taskCounts: taskCountsResponseSchema,
  laneSummaries: z.array(laneResponseSchema)
});

export const taskResponseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  laneId: z.string().nullable(),
  title: z.string(),
  body: z.string(),
  position: z.number().int().nonnegative(),
  status: taskStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

export const apiTokenSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable()
});

export const createApiTokenResponseSchema = z.object({
  token: z.string(),
  tokenInfo: apiTokenSummarySchema
});

export const createProjectBodySchema = z.object({
  name: z.string().trim().min(1).max(120)
});

export const createLaneBodySchema = z.object({
  name: z.string().trim().min(1).max(80)
});

export const createApiTokenBodySchema = z.object({
  name: z.string().trim().min(1).max(120)
});

export const projectParamsSchema = z.object({
  projectId: z.string().uuid()
});

export const apiTokenParamsSchema = z.object({
  tokenId: z.string().uuid()
});

export const createTaskBodySchema = z.object({
  title: z.string().trim().min(1).max(240),
  body: z.string().max(40_000).optional(),
  laneId: z.string().uuid().optional()
});

export const taskParamsSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid()
});

export const listTasksQuerySchema = z.object({
  status: taskStatusSchema.optional()
});

export const updateTaskBodySchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    body: z.string().max(40_000).optional(),
    laneId: z.string().uuid().optional(),
    position: z.number().int().nonnegative().optional(),
    status: taskStatusSchema.optional()
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.body !== undefined ||
      value.laneId !== undefined ||
      value.position !== undefined ||
      value.status !== undefined,
    {
      message: "Provide at least one field to update."
    }
  );

z.globalRegistry.add(meResponseSchema, { id: "Me" });
z.globalRegistry.add(laneResponseSchema, { id: "Lane" });
z.globalRegistry.add(projectResponseSchema, { id: "Project" });
z.globalRegistry.add(taskResponseSchema, { id: "Task" });
z.globalRegistry.add(apiTokenSummarySchema, { id: "ApiTokenSummary" });
z.globalRegistry.add(errorResponseSchema, { id: "ErrorResponse" });

function createEmptyTaskCounts(): ProjectTaskCounts {
  return {
    todo: 0,
    in_progress: 0,
    done: 0
  };
}

export function toMeResponse(user: UserRecord) {
  return meResponseSchema.parse({
    email: user.email ?? null,
    id: user.id,
    name: user.displayName ?? null
  });
}

export function toLaneResponse(lane: LaneRecord | LaneWithTaskCount, taskCount = 0) {
  return laneResponseSchema.parse({
    id: lane.id,
    projectId: lane.projectId,
    name: lane.name,
    systemKey: lane.systemKey ?? null,
    position: lane.position,
    taskCount: "taskCount" in lane ? lane.taskCount : taskCount,
    createdAt: lane.createdAt,
    updatedAt: lane.updatedAt
  });
}

export function toProjectResponse(
  project: ProjectRecord,
  taskCounts: ProjectTaskCounts = createEmptyTaskCounts(),
  laneSummaries: Array<LaneRecord | LaneWithTaskCount> = []
) {
  return projectResponseSchema.parse({
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    taskCounts,
    laneSummaries: laneSummaries.map((lane) => toLaneResponse(lane))
  });
}

export function toTaskResponse(task: TaskRecord) {
  return taskResponseSchema.parse({
    id: task.id,
    projectId: task.projectId,
    laneId: task.laneId ?? null,
    title: task.title,
    body: task.body,
    position: task.position,
    status: task.status,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  });
}

export function toApiTokenSummary(
  token: {
    id: string;
    name: string;
    createdAt: string;
    lastUsedAt: string | null;
  }
) {
  return apiTokenSummarySchema.parse({
    id: token.id,
    name: token.name,
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt ?? null
  });
}
