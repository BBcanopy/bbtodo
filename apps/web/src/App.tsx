import { startTransition, useState } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";

import { api, ApiError, isApiError, type Task, type TaskStatus, type User } from "./api";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false
    }
  }
});

const columns: Array<{ key: TaskStatus; label: string }> = [
  { key: "todo", label: "Todo" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" }
];

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}

function LoadingState() {
  return (
    <main className="centered-state">
      <div className="state-card">
        <p className="eyebrow">bbtodo</p>
        <h1>Loading your boards...</h1>
      </div>
    </main>
  );
}

function LoginScreen() {
  return (
    <main className="login-layout">
      <section className="login-panel">
        <p className="eyebrow">bbtodo</p>
        <h1>Keep your work moving without the extra ceremony.</h1>
        <p className="lead-copy">
          Sign in with your OIDC provider to open your projects and keep tasks moving from Todo to Done.
        </p>
        <button className="primary-button" onClick={() => (window.location.href = "/auth/login")} type="button">
          Sign in
        </button>
      </section>
    </main>
  );
}

function ErrorBanner({ error }: { error: unknown }) {
  return <p className="error-banner">{getErrorMessage(error)}</p>;
}

function AppShell({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const logoutMutation = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.clear();
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    }
  });

  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="topbar__nav">
          <Link className="brand-mark" to="/">
            <span className="brand-mark__pill">bb</span>
            <span className="brand-mark__text">bbtodo</span>
          </Link>
          <nav className="subnav">
            <Link className="subnav__link" to="/">
              Projects
            </Link>
            <Link className="subnav__link" to="/settings/api-tokens">
              API tokens
            </Link>
          </nav>
        </div>
        <div className="topbar__meta">
          <div>
            <p className="topbar__label">Signed in</p>
            <p className="topbar__value">{user.name ?? user.email ?? "bbtodo user"}</p>
          </div>
          <button className="ghost-button" onClick={() => logoutMutation.mutate()} type="button">
            Sign out
          </button>
        </div>
      </header>
      <Routes>
        <Route element={<ProjectsPage />} path="/" />
        <Route element={<BoardPage />} path="/projects/:projectId" />
        <Route element={<ApiTokensPage />} path="/settings/api-tokens" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </div>
  );
}

function ProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.listProjects()
  });

  const createProjectMutation = useMutation({
    mutationFn: (projectName: string) => api.createProject(projectName),
    onSuccess: async (project) => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      startTransition(() => {
        navigate(`/projects/${project.id}`);
      });
    }
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: string) => api.deleteProject(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  return (
    <main className="page-shell">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">Projects</p>
          <h1>Your boards, one glance at a time.</h1>
          <p className="lead-copy">
            Create a project for each board, keep work in three clear columns, and let the API stay in sync with the UI.
          </p>
        </div>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            createProjectMutation.mutate(name.trim());
          }}
        >
          <label className="field">
            <span className="field__label">New project</span>
            <input
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              placeholder="Website refresh"
              required
              value={name}
            />
          </label>
          <button className="primary-button" disabled={createProjectMutation.isPending || name.trim().length === 0} type="submit">
            Create board
          </button>
        </form>
      </section>

      {projectsQuery.error ? <ErrorBanner error={projectsQuery.error} /> : null}
      {createProjectMutation.error ? <ErrorBanner error={createProjectMutation.error} /> : null}
      {deleteProjectMutation.error ? <ErrorBanner error={deleteProjectMutation.error} /> : null}

      <section className="project-grid">
        {projectsQuery.data?.map((project) => (
          <article className="project-card" key={project.id}>
            <Link className="project-card__link" to={`/projects/${project.id}`}>
              <p className="project-card__timestamp">Updated {new Date(project.updatedAt).toLocaleDateString()}</p>
              <h2>{project.name}</h2>
              <p>Open board</p>
            </Link>
            <button className="ghost-button danger-button" onClick={() => deleteProjectMutation.mutate(project.id)} type="button">
              Delete
            </button>
          </article>
        ))}
        {projectsQuery.data && projectsQuery.data.length === 0 ? (
          <article className="empty-card">
            <h2>No boards yet</h2>
            <p>Create your first project to open a Todo, In Progress, and Done board.</p>
          </article>
        ) : null}
      </section>
    </main>
  );
}

function TaskCard({
  onDelete,
  onMove,
  projectId,
  task
}: {
  onDelete: (projectId: string, taskId: string) => void;
  onMove: (task: Task, status: TaskStatus) => void;
  projectId: string;
  task: Task;
}) {
  const currentIndex = columns.findIndex((column) => column.key === task.status);
  const previousColumn = currentIndex > 0 ? columns[currentIndex - 1] : null;
  const nextColumn = currentIndex < columns.length - 1 ? columns[currentIndex + 1] : null;

  return (
    <article className="task-card">
      <p className="task-card__title">{task.title}</p>
      <div className="task-card__actions">
        <div className="task-card__moves">
          {previousColumn ? (
            <button className="ghost-button" onClick={() => onMove(task, previousColumn.key)} type="button">
              Move to {previousColumn.label}
            </button>
          ) : null}
          {nextColumn ? (
            <button className="ghost-button" onClick={() => onMove(task, nextColumn.key)} type="button">
              Move to {nextColumn.label}
            </button>
          ) : null}
        </div>
        <button className="ghost-button danger-button" onClick={() => onDelete(projectId, task.id)} type="button">
          Delete
        </button>
      </div>
    </article>
  );
}

function BoardPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.listProjects()
  });
  const tasksQuery = useQuery({
    enabled: Boolean(projectId),
    queryKey: ["tasks", projectId],
    queryFn: () => api.listTasks(projectId ?? "")
  });

  const createTaskMutation = useMutation({
    mutationFn: (taskTitle: string) => api.createTask(projectId ?? "", taskTitle),
    onSuccess: async () => {
      setTitle("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] })
      ]);
    }
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ status, task }: { status: TaskStatus; task: Task }) =>
      api.updateTask(projectId ?? "", task.id, { status }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] })
      ]);
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => api.deleteTask(projectId ?? "", taskId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] })
      ]);
    }
  });

  const project = projectsQuery.data?.find((candidate) => candidate.id === projectId);
  const groupedTasks = columns.map((column) => ({
    ...column,
    tasks: (tasksQuery.data ?? []).filter((task) => task.status === column.key)
  }));

  if (!projectId) {
    return <Navigate replace to="/" />;
  }

  return (
    <main className="page-shell">
      <section className="board-header">
        <div>
          <button className="ghost-button back-button" onClick={() => navigate("/")} type="button">
            Back to projects
          </button>
          <p className="eyebrow">Board</p>
          <h1>{project?.name ?? "Loading board"}</h1>
        </div>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            createTaskMutation.mutate(title.trim());
          }}
        >
          <label className="field">
            <span className="field__label">Add task</span>
            <input
              maxLength={240}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Draft release notes"
              required
              value={title}
            />
          </label>
          <button className="primary-button" disabled={createTaskMutation.isPending || title.trim().length === 0} type="submit">
            Add task
          </button>
        </form>
      </section>

      {projectsQuery.error ? <ErrorBanner error={projectsQuery.error} /> : null}
      {tasksQuery.error ? <ErrorBanner error={tasksQuery.error} /> : null}
      {createTaskMutation.error ? <ErrorBanner error={createTaskMutation.error} /> : null}
      {updateTaskMutation.error ? <ErrorBanner error={updateTaskMutation.error} /> : null}
      {deleteTaskMutation.error ? <ErrorBanner error={deleteTaskMutation.error} /> : null}

      {!project && projectsQuery.data ? (
        <section className="empty-card">
          <h2>That board is no longer available.</h2>
          <p>The project may have been deleted. Head back to your project list to pick another board.</p>
        </section>
      ) : null}

      <section className="board-grid">
        {groupedTasks.map((column) => (
          <div className="board-column" key={column.key}>
            <div className="board-column__header">
              <h2>{column.label}</h2>
              <span>{column.tasks.length}</span>
            </div>
            <div className="board-column__content">
              {column.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  onDelete={(_projectId, taskId) => deleteTaskMutation.mutate(taskId)}
                  onMove={(currentTask, status) => updateTaskMutation.mutate({ status, task: currentTask })}
                  projectId={projectId}
                  task={task}
                />
              ))}
              {column.tasks.length === 0 ? <p className="column-empty">Nothing here yet.</p> : null}
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

function ApiTokensPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const tokensQuery = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => api.listApiTokens()
  });

  const createTokenMutation = useMutation({
    mutationFn: (tokenName: string) => api.createApiToken(tokenName),
    onSuccess: async (response) => {
      setName("");
      setRevealedToken(response.token);
      await queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    }
  });

  const deleteTokenMutation = useMutation({
    mutationFn: (tokenId: string) => api.deleteApiToken(tokenId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    }
  });

  return (
    <main className="page-shell">
      <section className="hero-strip">
        <div>
          <p className="eyebrow">Automation</p>
          <h1>Issue a token for scripts and small automations.</h1>
          <p className="lead-copy">
            `bbtodo` personal API tokens let external tools call the same project and task endpoints as the app.
          </p>
        </div>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            createTokenMutation.mutate(name.trim());
          }}
        >
          <label className="field">
            <span className="field__label">Token name</span>
            <input
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              placeholder="Local CLI"
              required
              value={name}
            />
          </label>
          <button className="primary-button" disabled={createTokenMutation.isPending || name.trim().length === 0} type="submit">
            Create token
          </button>
        </form>
      </section>

      {tokensQuery.error ? <ErrorBanner error={tokensQuery.error} /> : null}
      {createTokenMutation.error ? <ErrorBanner error={createTokenMutation.error} /> : null}
      {deleteTokenMutation.error ? <ErrorBanner error={deleteTokenMutation.error} /> : null}

      {revealedToken ? (
        <section className="token-reveal">
          <p className="eyebrow">Copy now</p>
          <h2>This token is only shown once.</h2>
          <code>{revealedToken}</code>
        </section>
      ) : null}

      <section className="project-grid">
        {tokensQuery.data?.map((token) => (
          <article className="project-card" key={token.id}>
            <div className="project-card__link">
              <p className="project-card__timestamp">
                Last used {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : "never"}
              </p>
              <h2>{token.name}</h2>
              <p>Created {new Date(token.createdAt).toLocaleDateString()}</p>
            </div>
            <button className="ghost-button danger-button" onClick={() => deleteTokenMutation.mutate(token.id)} type="button">
              Revoke
            </button>
          </article>
        ))}
        {tokensQuery.data && tokensQuery.data.length === 0 ? (
          <article className="empty-card">
            <h2>No API tokens yet</h2>
            <p>Create one when you want a script or CLI to talk to `bbtodo`.</p>
          </article>
        ) : null}
      </section>
    </main>
  );
}

function AuthenticatedApp() {
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api.getMe()
  });

  if (meQuery.isPending) {
    return <LoadingState />;
  }

  if (isApiError(meQuery.error, 401)) {
    return <LoginScreen />;
  }

  if (meQuery.error) {
    return (
      <main className="centered-state">
        <div className="state-card">
          <p className="eyebrow">bbtodo</p>
          <h1>We hit a problem loading your workspace.</h1>
          <ErrorBanner error={meQuery.error} />
        </div>
      </main>
    );
  }

  return <AppShell user={meQuery.data as User} />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthenticatedApp />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
