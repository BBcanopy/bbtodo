export type TaskStatus = "todo" | "in_progress" | "done";
export type UserTheme = "sea" | "ember" | "midnight";
export type TaskTagColor = "moss" | "sky" | "amber" | "coral" | "orchid" | "slate";
export type TaskCounts = Record<TaskStatus, number>;

export interface TaskTag {
  color: TaskTagColor;
  label: string;
}

export interface User {
  email: string | null;
  id: string;
  name: string | null;
  theme: UserTheme;
}

export interface BoardLane {
  createdAt: string;
  id: string;
  name: string;
  position: number;
  projectId: string;
  systemKey: TaskStatus | null;
  taskCount: number;
  updatedAt: string;
}

export interface Project {
  createdAt: string;
  id: string;
  laneSummaries: BoardLane[];
  name: string;
  taskCounts: TaskCounts;
  updatedAt: string;
}

export interface Task {
  body: string;
  createdAt: string;
  id: string;
  laneId: string | null;
  position: number;
  projectId: string;
  status: TaskStatus;
  tags: TaskTag[];
  title: string;
  updatedAt: string;
}

export interface ApiTokenSummary {
  createdAt: string;
  id: string;
  lastUsedAt: string | null;
  name: string;
}

export interface CreateApiTokenResponse {
  token: string;
  tokenInfo: ApiTokenSummary;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers
  });
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : `Request failed with status ${response.status}.`;

    throw new ApiError(response.status, message);
  }

  return data as T;
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}

export const api = {
  createProject(name: string) {
    return request<Project>("/api/v1/projects", {
      body: JSON.stringify({ name }),
      method: "POST"
    });
  },
  createLane(projectId: string, name: string) {
    return request<BoardLane>(`/api/v1/projects/${projectId}/lanes`, {
      body: JSON.stringify({ name }),
      method: "POST"
    });
  },
  createApiToken(name: string) {
    return request<CreateApiTokenResponse>("/api/v1/api-tokens", {
      body: JSON.stringify({ name }),
      method: "POST"
    });
  },
  createTask(projectId: string, input: { body?: string; laneId?: string; tags?: TaskTag[]; title: string }) {
    return request<Task>(`/api/v1/projects/${projectId}/tasks`, {
      body: JSON.stringify(input),
      method: "POST"
    });
  },
  deleteProject(projectId: string) {
    return request<null>(`/api/v1/projects/${projectId}`, {
      method: "DELETE"
    });
  },
  deleteApiToken(tokenId: string) {
    return request<null>(`/api/v1/api-tokens/${tokenId}`, {
      method: "DELETE"
    });
  },
  deleteTask(projectId: string, taskId: string) {
    return request<null>(`/api/v1/projects/${projectId}/tasks/${taskId}`, {
      method: "DELETE"
    });
  },
  getMe() {
    return request<User>("/api/v1/me");
  },
  listProjects() {
    return request<Project[]>("/api/v1/projects");
  },
  listTaskTags() {
    return request<TaskTag[]>("/api/v1/task-tags");
  },
  listLanes(projectId: string) {
    return request<BoardLane[]>(`/api/v1/projects/${projectId}/lanes`);
  },
  listApiTokens() {
    return request<ApiTokenSummary[]>("/api/v1/api-tokens");
  },
  listTasks(projectId: string) {
    return request<Task[]>(`/api/v1/projects/${projectId}/tasks`);
  },
  logout() {
    return request<null>("/auth/logout", {
      method: "POST"
    });
  },
  updateTheme(theme: UserTheme) {
    return request<User>("/api/v1/me/theme", {
      body: JSON.stringify({ theme }),
      method: "PATCH"
    });
  },
  updateProject(projectId: string, input: Pick<Project, "name">) {
    return request<Project>(`/api/v1/projects/${projectId}`, {
      body: JSON.stringify(input),
      method: "PATCH"
    });
  },
  updateTask(
    projectId: string,
    taskId: string,
    input: Partial<Pick<Task, "body" | "laneId" | "position" | "status" | "tags" | "title">>
  ) {
    return request<Task>(`/api/v1/projects/${projectId}/tasks/${taskId}`, {
      body: JSON.stringify(input),
      method: "PATCH"
    });
  },
  updateLane(projectId: string, laneId: string, input: Pick<BoardLane, "position">) {
    return request<BoardLane>(`/api/v1/projects/${projectId}/lanes/${laneId}`, {
      body: JSON.stringify(input),
      method: "PATCH"
    });
  }
};
