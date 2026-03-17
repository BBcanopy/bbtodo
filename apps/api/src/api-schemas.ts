import { z } from "zod";

import type { ProjectRecord, TaskRecord, UserRecord } from "./db.js";
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

export const projectResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const taskResponseSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
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
  title: z.string().trim().min(1).max(240)
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
    status: taskStatusSchema.optional()
  })
  .refine((value) => value.title !== undefined || value.status !== undefined, {
    message: "Provide at least one field to update."
  });

z.globalRegistry.add(meResponseSchema, { id: "Me" });
z.globalRegistry.add(projectResponseSchema, { id: "Project" });
z.globalRegistry.add(taskResponseSchema, { id: "Task" });
z.globalRegistry.add(apiTokenSummarySchema, { id: "ApiTokenSummary" });
z.globalRegistry.add(errorResponseSchema, { id: "ErrorResponse" });

export function toMeResponse(user: UserRecord) {
  return meResponseSchema.parse({
    email: user.email ?? null,
    id: user.id,
    name: user.displayName ?? null
  });
}

export function toProjectResponse(project: ProjectRecord) {
  return projectResponseSchema.parse({
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  });
}

export function toTaskResponse(task: TaskRecord) {
  return taskResponseSchema.parse({
    id: task.id,
    projectId: task.projectId,
    title: task.title,
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
