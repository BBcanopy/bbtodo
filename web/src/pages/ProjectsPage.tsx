import { startTransition, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";

import { api, type Project } from "../api";
import { columns } from "../app/constants";
import { formatIsoDate, itemStyle } from "../app/utils";
import { EmptyState, ErrorBanner, ProjectGridSkeleton } from "../components/ui";
import { useDismissableLayer } from "../hooks/useDismissableLayer";

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

  useDismissableLayer(isConfirmOpen, confirmRef, () => setIsConfirmOpen(false));

  return (
    <article
      className={`project-card${isConfirmOpen ? " is-confirm-open" : ""}`}
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
            <div className="task-delete-popover" onClick={(event) => event.stopPropagation()} role="alertdialog">
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
        <time className="project-card__timestamp" dateTime={project.updatedAt}>
          {formatIsoDate(project.updatedAt)}
        </time>
      </div>
    </article>
  );
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const isCreateDialogOpen = searchParams.get("createProject") === "1";
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

  function closeCreateDialog() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("createProject");
    setSearchParams(nextParams, { replace: true });
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
    <main className="page-shell page-shell--projects">
      <title>Projects | BBTodo</title>
      {isCreateDialogOpen ? (
        <div className="dialog-scrim" onClick={() => closeCreateDialog()}>
          <section
            aria-labelledby="create-project-title"
            aria-modal="true"
            className="dialog-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="dialog-header">
              <h2 id="create-project-title">Create Project</h2>
              <button
                aria-label="Close create project dialog"
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
                  {createProjectMutation.isPending ? "Creating project..." : "Create Project"}
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
