import { startTransition, useEffect, useRef, useState, type CSSProperties } from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";

import { api, ApiError, isApiError, type Project, type Task, type TaskStatus, type User } from "./api";
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

const loginPreview: Record<TaskStatus, string[]> = {
  todo: ["Audit callback route", "Rename API settings", "Trim Docker health probes"],
  in_progress: ["Refine board spacing", "Polish token reveal state"],
  done: ["Wire OIDC login", "Split web and server packages"]
};

function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}

function itemStyle(index: number): CSSProperties {
  return { "--item-index": index } as CSSProperties;
}

function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...options
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function getAvatarLetter(user: User) {
  const source = user.name?.trim() || user.email?.trim() || "bbtodo";
  return source.charAt(0).toUpperCase();
}

function getTaskInputLabel(columnLabel: string) {
  return `New task title for ${columnLabel}`;
}

function MetricRibbon({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="metric-ribbon">
      {items.map((item, index) => (
        <div className="metric-pill" key={item.label} style={itemStyle(index)}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function ErrorBanner({ error }: { error: unknown }) {
  return <p className="error-banner">{getErrorMessage(error)}</p>;
}

function EmptyState({
  eyebrow,
  title,
  copy
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <section className="empty-state">
      <div className="empty-state__copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="lead-copy">{copy}</p>
      </div>
      <div aria-hidden="true" className="empty-state__art">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}

function ProjectGridSkeleton() {
  return (
    <section aria-hidden="true" className="project-grid">
      {Array.from({ length: 4 }).map((_, index) => (
        <article className="project-card skeleton-card" key={index} style={itemStyle(index)}>
          <div className="skeleton-line skeleton-line--small" />
          <div className="skeleton-line skeleton-line--title" />
          <div className="skeleton-line skeleton-line--body" />
          <div className="skeleton-line skeleton-line--body short" />
          <div className="skeleton-row">
            <div className="skeleton-pill" />
            <div className="skeleton-pill" />
          </div>
        </article>
      ))}
    </section>
  );
}

function BoardSkeleton() {
  return (
    <section aria-hidden="true" className="board-grid" data-testid="board-grid">
      {columns.map((column, index) => (
        <article className="board-column skeleton-column" key={column.key} style={itemStyle(index)}>
          <div className="board-column__header">
            <div>
              <div className="skeleton-line skeleton-line--small" />
              <div className="skeleton-line skeleton-line--medium" />
            </div>
            <div className="skeleton-pill" />
          </div>
          <div className="board-column__content">
            {Array.from({ length: 3 }).map((_, cardIndex) => (
              <div className="task-card skeleton-card skeleton-card--compact" key={cardIndex}>
                <div className="skeleton-line skeleton-line--small" />
                <div className="skeleton-line skeleton-line--body" />
                <div className="skeleton-line skeleton-line--body short" />
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function TokenListSkeleton() {
  return (
    <section aria-hidden="true" className="token-list">
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="token-row token-row--skeleton" key={index}>
          <div className="token-row__copy">
            <div className="skeleton-line skeleton-line--medium" />
            <div className="skeleton-line skeleton-line--body short" />
          </div>
          <div className="skeleton-pill" />
        </div>
      ))}
    </section>
  );
}

function LoadingState() {
  return (
    <main className="loading-shell">
      <div className="loading-shell__inner">
        <section className="surface-strip loading-strip">
          <div className="loading-strip__copy">
            <div className="skeleton-line skeleton-line--small" />
            <div className="skeleton-line skeleton-line--medium" />
            <div className="skeleton-line skeleton-line--body short" />
          </div>
          <div className="loading-strip__meta">
            <div className="skeleton-pill" />
            <div className="skeleton-pill" />
            <div className="skeleton-pill" />
          </div>
        </section>
        <BoardSkeleton />
      </div>
    </main>
  );
}

function LoginScreen() {
  return (
    <main className="landing-shell">
      <section className="landing-panel">
        <article className="hero-panel hero-panel--landing">
          <p className="eyebrow">bbtodo</p>
          <h1>Simple boards for work that should stay clear.</h1>
          <p className="lead-copy">
            Sign in once, keep one board per project, and move tasks across three steady lanes without extra ceremony.
          </p>
          <MetricRibbon
            items={[
              { label: "Projects", value: "One board each" },
              { label: "Access", value: "OIDC sign-in" },
              { label: "API", value: "Tokens for scripts" }
            ]}
          />
          <div className="cta-row">
            <button className="primary-button" onClick={() => (window.location.href = "/auth/login")} type="button">
              Sign in with OIDC
            </button>
            <a className="ghost-button" href="/docs">
              Read API docs
            </a>
          </div>
        </article>

        <aside className="preview-panel">
          <div className="preview-panel__header">
            <div>
              <p className="eyebrow">Live shape</p>
              <h2>A calm three-lane board</h2>
            </div>
            <span className="status-ping" />
          </div>
          <div className="preview-board">
            {columns.map((column, columnIndex) => (
              <section className="preview-column" key={column.key} style={itemStyle(columnIndex)}>
                <header className="preview-column__header">
                  <h3>{column.label}</h3>
                  <span>{loginPreview[column.key].length}</span>
                </header>
                <div className="preview-column__stack">
                  {loginPreview[column.key].map((task, taskIndex) => (
                    <article className="preview-card" key={task} style={itemStyle(taskIndex)}>
                      <span className="preview-card__line" />
                      <p>{task}</p>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}

function AppShell({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const logoutMutation = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      queryClient.clear();
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    }
  });
  const avatarLetter = getAvatarLetter(user);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isMenuOpen]);

  return (
    <div className="app-frame">
      <div className="app-shell">
        <header className="topbar">
          <div className="topbar__nav">
            <Link className="brand-mark" to="/">
              <span className="brand-mark__pill">bb</span>
              <span className="brand-mark__text">bbtodo</span>
            </Link>
            <nav className="subnav">
              <NavLink className={({ isActive }) => `subnav__link${isActive ? " is-active" : ""}`} end to="/">
                Projects
              </NavLink>
            </nav>
          </div>

          <div className="topbar__meta">
            <div className="avatar-menu" ref={menuRef}>
              <button
                aria-expanded={isMenuOpen}
                aria-haspopup="menu"
                aria-label="Open account menu"
                className="avatar-button"
                onClick={() => setIsMenuOpen((current) => !current)}
                type="button"
              >
                <span aria-hidden="true" className="avatar-button__letter">
                  {avatarLetter}
                </span>
              </button>
              {isMenuOpen ? (
                <div className="avatar-dropdown" role="menu">
                  <Link
                    className="menu-item"
                    onClick={() => setIsMenuOpen(false)}
                    role="menuitem"
                    to="/settings/api-tokens"
                  >
                    API tokens
                  </Link>
                  <button
                    className="menu-item danger-button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      logoutMutation.mutate();
                    }}
                    role="menuitem"
                    type="button"
                  >
                    {logoutMutation.isPending ? "Signing out..." : "Sign out"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="shell-content">
          <Routes>
            <Route element={<ProjectsPage />} path="/" />
            <Route element={<BoardPage />} path="/projects/:projectId" />
            <Route element={<ApiTokensPage />} path="/settings/api-tokens" />
            <Route element={<Navigate replace to="/" />} path="*" />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function ProjectCard({
  index,
  onDelete,
  onOpen,
  project
}: {
  index: number;
  onDelete: (projectId: string) => void;
  onOpen: (projectId: string) => void;
  project: Project;
}) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const confirmRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isConfirmOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!confirmRef.current?.contains(event.target as Node)) {
        setIsConfirmOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsConfirmOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isConfirmOpen]);

  return (
    <article
      className={`project-card${index === 0 ? " project-card--featured" : ""}${isConfirmOpen ? " is-confirm-open" : ""}`}
      data-testid={`project-card-${project.id}`}
      onClick={() => onOpen(project.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(project.id);
        }
      }}
      role="link"
      style={itemStyle(index)}
      tabIndex={0}
    >
      <div className="project-card__meta">
        <div className="project-card__delete-menu" ref={confirmRef}>
          <button
            aria-expanded={isConfirmOpen}
            aria-label={`Delete board ${project.name}`}
            className="icon-button danger-button"
            onClick={(event) => {
              event.stopPropagation();
              setIsConfirmOpen((current) => !current);
            }}
            type="button"
          >
            <span aria-hidden="true">x</span>
          </button>
          {isConfirmOpen ? (
            <div
              className="task-delete-popover"
              onClick={(event) => event.stopPropagation()}
              role="alertdialog"
            >
              <p>Delete this board?</p>
              <div className="task-delete-popover__actions">
                <button
                  className="text-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsConfirmOpen(false);
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="ghost-button danger-button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsConfirmOpen(false);
                    onDelete(project.id);
                  }}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="project-card__body">
        <h2>{project.name}</h2>
        <p className="project-card__timestamp">Updated {formatDate(project.updatedAt)}</p>
        <div aria-label={`Lane counts for ${project.name}`} className="project-card__lane-counts">
          {columns.map((column) => (
            <div
              aria-label={`${column.label} ${project.taskCounts[column.key]}`}
              className="project-card__lane-pill"
              key={column.key}
            >
              <span>{column.label}</span>
              <strong>{project.taskCounts[column.key]}</strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function ProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.listProjects()
  });

  const createProjectMutation = useMutation({
    mutationFn: (projectName: string) => api.createProject(projectName),
    onSuccess: async (project) => {
      setIsCreateDialogOpen(false);
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

  function closeCreateDialog() {
    setIsCreateDialogOpen(false);
    setName("");
    createProjectMutation.reset();
  }

  useEffect(() => {
    if (!isCreateDialogOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeCreateDialog();
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isCreateDialogOpen]);

  return (
    <main className="page-shell">
      <section className="page-header">
        <div className="page-header__copy">
          <h1 className="page-title">Boards</h1>
        </div>
        <div className="page-header__meta">
          <button className="primary-button" onClick={() => setIsCreateDialogOpen(true)} type="button">
            Create board
          </button>
        </div>
      </section>

      {isCreateDialogOpen ? (
        <div className="dialog-scrim" onClick={() => closeCreateDialog()}>
          <section
            aria-labelledby="create-board-title"
            aria-modal="true"
            className="dialog-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="dialog-header">
              <h2 id="create-board-title">Create board</h2>
              <button
                aria-label="Close create board dialog"
                className="icon-button"
                onClick={() => closeCreateDialog()}
                type="button"
              >
                <span aria-hidden="true">x</span>
              </button>
            </div>
            <form
              className="dialog-form"
              onSubmit={(event) => {
                event.preventDefault();
                createProjectMutation.mutate(name.trim());
              }}
            >
              <label className="field">
                <span className="field__label">Project name</span>
                <input
                  autoFocus
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Billing cleanup"
                  required
                  value={name}
                />
              </label>
              {createProjectMutation.error ? <ErrorBanner error={createProjectMutation.error} /> : null}
              <div className="dialog-actions">
                <button className="text-button" onClick={() => closeCreateDialog()} type="button">
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={createProjectMutation.isPending || name.trim().length === 0}
                  type="submit"
                >
                  {createProjectMutation.isPending ? "Creating board..." : "Create board"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {projectsQuery.error ? <ErrorBanner error={projectsQuery.error} /> : null}
      {deleteProjectMutation.error ? <ErrorBanner error={deleteProjectMutation.error} /> : null}

      {projectsQuery.isPending ? <ProjectGridSkeleton /> : null}

      {!projectsQuery.isPending && projectsQuery.data && projectsQuery.data.length === 0 ? (
        <EmptyState
          copy="Create the first project to open a board with Todo, In Progress, and Done ready to go."
          eyebrow="Empty workspace"
          title="No boards yet."
        />
      ) : null}

      {!projectsQuery.isPending && projectsQuery.data && projectsQuery.data.length > 0 ? (
        <section className="project-grid">
          {projectsQuery.data.map((project, index) => (
            <ProjectCard
              key={project.id}
              index={index}
              onDelete={(projectId) => deleteProjectMutation.mutate(projectId)}
              onOpen={(projectId) => navigate(`/projects/${projectId}`)}
              project={project}
            />
          ))}
        </section>
      ) : null}
    </main>
  );
}

function TaskCard({
  onDelete,
  isDragging,
  onDragEnd,
  onDragStart,
  task,
  taskIndex
}: {
  onDelete: (taskId: string) => void;
  isDragging: boolean;
  onDragEnd: () => void;
  onDragStart: (task: Task) => void;
  task: Task;
  taskIndex: number;
}) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const confirmRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isConfirmOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!confirmRef.current?.contains(event.target as Node)) {
        setIsConfirmOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsConfirmOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isConfirmOpen]);

  return (
    <article
      className={`task-card${isDragging ? " is-dragging" : ""}${isConfirmOpen ? " is-confirm-open" : ""}`}
      data-testid={`task-card-${task.id}`}
      draggable="true"
      onDragEnd={onDragEnd}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", task.id);
        onDragStart(task);
      }}
      style={itemStyle(taskIndex)}
    >
      <div className="task-card__meta">
        <span className="label-chip label-chip--soft">Updated {formatDate(task.updatedAt)}</span>
        <div className="task-card__delete-menu" ref={confirmRef}>
          <button
            aria-expanded={isConfirmOpen}
            aria-label={`Delete task ${task.title}`}
            className="icon-button danger-button"
            onClick={() => setIsConfirmOpen((current) => !current)}
            type="button"
          >
            <span aria-hidden="true">x</span>
          </button>
          {isConfirmOpen ? (
            <div className="task-delete-popover" role="alertdialog">
              <p>Delete this task?</p>
              <div className="task-delete-popover__actions">
                <button className="text-button" onClick={() => setIsConfirmOpen(false)} type="button">
                  Cancel
                </button>
                <button
                  className="ghost-button danger-button"
                  onClick={() => {
                    setIsConfirmOpen(false);
                    onDelete(task.id);
                  }}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <p className="task-card__title">{task.title}</p>
    </article>
  );
}

function BoardPage() {
  const { projectId } = useParams();
  const queryClient = useQueryClient();
  const [composerStatus, setComposerStatus] = useState<TaskStatus | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<TaskStatus | null>(null);
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
    mutationFn: async ({ status, title }: { status: TaskStatus; title: string }) => {
      const createdTask = await api.createTask(projectId ?? "", title);
      if (status === "todo") {
        return createdTask;
      }

      return api.updateTask(projectId ?? "", createdTask.id, { status });
    },
    onSuccess: async () => {
      setComposerStatus(null);
      setDraftTitle("");
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
  const tasks = tasksQuery.data ?? [];
  const draggedTask = draggedTaskId ? tasks.find((task) => task.id === draggedTaskId) ?? null : null;
  const groupedTasks = columns.map((column) => ({
    ...column,
    tasks: tasks.filter((task) => task.status === column.key)
  }));

  function openComposer(status: TaskStatus) {
    setComposerStatus(status);
    setDraftTitle("");
  }

  function closeComposer() {
    setComposerStatus(null);
    setDraftTitle("");
  }

  function handleDrop(status: TaskStatus) {
    setDropTargetStatus(null);
    if (!draggedTask || draggedTask.status === status) {
      setDraggedTaskId(null);
      return;
    }

    updateTaskMutation.mutate({ status, task: draggedTask });
    setDraggedTaskId(null);
  }

  if (!projectId) {
    return <Navigate replace to="/" />;
  }

  return (
    <main className="page-shell page-shell--board">
      {projectsQuery.error ? <ErrorBanner error={projectsQuery.error} /> : null}
      {tasksQuery.error ? <ErrorBanner error={tasksQuery.error} /> : null}
      {createTaskMutation.error ? <ErrorBanner error={createTaskMutation.error} /> : null}
      {updateTaskMutation.error ? <ErrorBanner error={updateTaskMutation.error} /> : null}
      {deleteTaskMutation.error ? <ErrorBanner error={deleteTaskMutation.error} /> : null}

      {projectsQuery.isPending || tasksQuery.isPending ? <BoardSkeleton /> : null}

      {!projectsQuery.isPending && projectsQuery.data && !project ? (
        <EmptyState
          copy="The project may have been removed. Head back to the project list and open another board."
          eyebrow="Missing board"
          title="That board is no longer available."
        />
      ) : null}

      {!projectsQuery.isPending && !tasksQuery.isPending && project ? (
        <section className="board-grid" data-testid="board-grid">
          {groupedTasks.map((column, columnIndex) => (
            <div
              className={`board-column${dropTargetStatus === column.key ? " is-drop-target" : ""}`}
              data-testid={`board-column-${column.key}`}
              key={column.key}
              onDragOver={(event) => {
                if (!draggedTaskId) {
                  return;
                }

                event.preventDefault();
                if (dropTargetStatus !== column.key) {
                  setDropTargetStatus(column.key);
                }
              }}
              onDragLeave={(event) => {
                if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
                  setDropTargetStatus((current) => (current === column.key ? null : current));
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop(column.key);
              }}
              onDoubleClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("button, input, form, a")) {
                  return;
                }

                openComposer(column.key);
              }}
              style={itemStyle(columnIndex)}
            >
              <div className="board-column__header">
                <div>
                  <h2>{column.label}</h2>
                </div>
              </div>
              <div className="board-column__content">
                {composerStatus === column.key ? (
                  <form
                    className="lane-composer"
                    data-testid={`lane-composer-${column.key}`}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onSubmit={(event) => {
                      event.preventDefault();
                      createTaskMutation.mutate({
                        status: column.key,
                        title: draftTitle.trim()
                      });
                    }}
                  >
                    <label className="field">
                      <span className="field__label">New task</span>
                      <input
                        aria-label={getTaskInputLabel(column.label)}
                        autoFocus
                        maxLength={240}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            closeComposer();
                          }
                        }}
                        placeholder={`Add to ${column.label}`}
                        required
                        value={draftTitle}
                      />
                    </label>
                    <div className="lane-composer__actions">
                      <button
                        className="primary-button"
                        disabled={createTaskMutation.isPending || draftTitle.trim().length === 0}
                        type="submit"
                      >
                        {createTaskMutation.isPending ? "Adding..." : "Add task"}
                      </button>
                      <button className="text-button" onClick={() => closeComposer()} type="button">
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
                {column.tasks.map((task, taskIndex) => (
                  <TaskCard
                    key={task.id}
                    onDelete={(taskId) => deleteTaskMutation.mutate(taskId)}
                    isDragging={draggedTaskId === task.id}
                    onDragEnd={() => {
                      setDraggedTaskId(null);
                      setDropTargetStatus(null);
                    }}
                    onDragStart={(currentTask) => {
                      setDraggedTaskId(currentTask.id);
                      setDropTargetStatus(null);
                    }}
                    task={task}
                    taskIndex={taskIndex}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}
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

  const tokenCount = tokensQuery.data?.length ?? 0;

  return (
    <main className="page-shell">
      <section className="page-header">
        <div className="page-header__copy">
          <p className="eyebrow">Automation</p>
          <h1 className="page-title">API tokens</h1>
          <p className="page-summary">Issue a token for scripts and revoke it when the tool no longer needs access.</p>
        </div>
        <div className="page-header__meta">
          <span className="label-chip">{tokenCount} active</span>
          <span className="label-chip label-chip--soft">Shown once on creation</span>
        </div>
      </section>

      <section className="surface-strip">
        <form
          className="compose-form"
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
              placeholder="Ops sync script"
              required
              value={name}
            />
            <span className="field__hint">Give each token a distinct name so revocation stays obvious later.</span>
          </label>
          <button className="primary-button" disabled={createTokenMutation.isPending || name.trim().length === 0} type="submit">
            {createTokenMutation.isPending ? "Creating token..." : "Create token"}
          </button>
        </form>
      </section>

      {tokensQuery.error ? <ErrorBanner error={tokensQuery.error} /> : null}
      {createTokenMutation.error ? <ErrorBanner error={createTokenMutation.error} /> : null}
      {deleteTokenMutation.error ? <ErrorBanner error={deleteTokenMutation.error} /> : null}

      {revealedToken ? (
        <section className="token-reveal">
          <div className="token-reveal__copy">
            <p className="eyebrow">Copy now</p>
            <h2>This token will not be shown again.</h2>
            <p className="lead-copy">Store it in your CLI config or secret manager before leaving this page.</p>
          </div>
          <code>{revealedToken}</code>
        </section>
      ) : null}

      {tokensQuery.isPending ? <TokenListSkeleton /> : null}

      {!tokensQuery.isPending && tokensQuery.data && tokensQuery.data.length === 0 ? (
        <EmptyState
          copy="Create one when a local script, CLI, or small integration needs to call the bbtodo API."
          eyebrow="No tokens"
          title="You have not issued any API tokens yet."
        />
      ) : null}

      {!tokensQuery.isPending && tokensQuery.data && tokensQuery.data.length > 0 ? (
        <section className="token-list">
          {tokensQuery.data.map((token, index) => (
            <article className="token-row" key={token.id} style={itemStyle(index)}>
              <div className="token-row__copy">
                <div className="token-row__meta">
                  <span className="label-chip label-chip--soft">Created {formatDate(token.createdAt)}</span>
                  <span className="token-row__timestamp">
                    Last used {token.lastUsedAt ? formatDateTime(token.lastUsedAt) : "never"}
                  </span>
                </div>
                <h2>{token.name}</h2>
              </div>
              <button className="text-button danger-button" onClick={() => deleteTokenMutation.mutate(token.id)} type="button">
                Revoke
              </button>
            </article>
          ))}
        </section>
      ) : null}
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
        <section className="hero-panel centered-panel">
          <p className="eyebrow">bbtodo</p>
          <h1>We hit a problem loading your workspace.</h1>
          <p className="lead-copy">The session may be stale or the server may still be starting up.</p>
          <ErrorBanner error={meQuery.error} />
        </section>
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
