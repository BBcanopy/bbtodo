import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { api, type Project } from "../api";
import { formatIsoDate, itemStyle } from "../app/utils";
import { EmptyState, ErrorBanner, ProjectGridSkeleton, TrashIcon } from "../components/ui";
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
            <TrashIcon />
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
        <div className="project-card__headline">
          <h2>{project.name}</h2>
          <time className="project-card__timestamp" dateTime={project.updatedAt}>
            {formatIsoDate(project.updatedAt)}
          </time>
        </div>
        <div aria-label={`Lane counts for ${project.name}`} className="project-card__lane-counts">
          {project.laneSummaries.map((lane) => (
            <div
              aria-label={`${lane.name} ${lane.taskCount}`}
              className="project-card__lane-pill"
              key={lane.id}
            >
              <span>{lane.name}</span>
              <strong>{lane.taskCount}</strong>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export function ProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.listProjects()
  });
  const projects = projectsQuery.data ?? [];

  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: string) => api.deleteProject(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  return (
    <main className="page-shell page-shell--projects">
      <title>Projects | BBTodo</title>
      {projectsQuery.error ? <ErrorBanner error={projectsQuery.error} /> : null}
      {deleteProjectMutation.error ? <ErrorBanner error={deleteProjectMutation.error} /> : null}

      {projectsQuery.isPending ? <ProjectGridSkeleton /> : null}

      {!projectsQuery.isPending && projects.length === 0 ? (
        <EmptyState
          copy="Create the first project to open a board with Todo, In Progress, and Done ready to go."
          eyebrow="Empty workspace"
          title="No boards yet."
        />
      ) : null}

      {!projectsQuery.isPending && projects.length > 0 ? (
        <section className="project-grid">
          {projects.map((project, index) => (
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
