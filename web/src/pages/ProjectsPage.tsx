import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { api, type Project } from "../api";
import { itemStyle, parseExactTicketId } from "../app/utils";
import { EmptyState, ErrorBanner, ProjectGridSkeleton, ToastNotice, TrashIcon } from "../components/ui";
import { useDismissableLayer } from "../hooks/useDismissableLayer";

type PageToast = {
  message: string;
  title: string;
  tone: "danger" | "success";
};

function ProjectCard({
  index,
  onDelete,
  onOpen,
  project
}: {
  index: number;
  onDelete: (projectId: string) => void;
  onOpen: (projectTicketPrefix: string) => void;
  project: Project;
}) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const confirmRef = useRef<HTMLDivElement | null>(null);

  useDismissableLayer(isConfirmOpen, confirmRef, () => setIsConfirmOpen(false));

  return (
    <article
      className={`project-card${isConfirmOpen ? " is-confirm-open" : ""}`}
      data-testid={`project-card-${project.id}`}
      onClick={() => onOpen(project.ticketPrefix)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(project.ticketPrefix);
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
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const locationToast = ((location.state as { toast?: PageToast } | null) ?? null)?.toast ?? null;
  const [toast, setToast] = useState<PageToast | null>(locationToast);
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.listProjects()
  });
  const projects = projectsQuery.data ?? [];
  const projectSearch = searchParams.get("q")?.trim() ?? "";
  const exactTicketIdSearch = parseExactTicketId(projectSearch);
  const exactTicketPrefixSearch = exactTicketIdSearch?.split("-")[0] ?? null;
  const deferredProjectSearch = useDeferredValue(projectSearch.toLowerCase());
  const visibleProjects = useMemo(() => {
    if (exactTicketPrefixSearch) {
      return projects.filter((project) => project.ticketPrefix === exactTicketPrefixSearch);
    }

    if (!deferredProjectSearch) {
      return projects;
    }

    return projects.filter((project) => {
      const normalizedSearchTarget = `${project.name} ${project.ticketPrefix}`.toLowerCase();
      return normalizedSearchTarget.includes(deferredProjectSearch);
    });
  }, [deferredProjectSearch, exactTicketPrefixSearch, projects]);

  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: string) => api.deleteProject(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
    }
  });

  useEffect(() => {
    if (!locationToast) {
      return;
    }

    setToast(locationToast);
    navigate(
      {
        pathname: location.pathname,
        search: location.search
      },
      { replace: true, state: null }
    );
  }, [location.pathname, location.search, locationToast, navigate]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toast]);

  return (
    <main className="page-shell page-shell--projects">
      <title>Projects | BBTodo</title>
      {toast ? (
        <ToastNotice
          message={toast.message}
          onDismiss={() => setToast(null)}
          title={toast.title}
          tone={toast.tone}
        />
      ) : null}
      {projectsQuery.error ? <ErrorBanner error={projectsQuery.error} /> : null}
      {deleteProjectMutation.error ? <ErrorBanner error={deleteProjectMutation.error} /> : null}

      {projectsQuery.isPending ? <ProjectGridSkeleton /> : null}

      {!projectsQuery.isPending && projects.length === 0 ? (
        <EmptyState
          copy="Create the first project to open a board with Todo, In Progress, In review, and Done ready to go."
          eyebrow="Empty workspace"
          title="No boards yet."
        />
      ) : null}

      {!projectsQuery.isPending && projects.length > 0 && visibleProjects.length === 0 ? (
        <EmptyState
          copy="Try a different board name or ticket prefix."
          eyebrow="No matches"
          title={`No boards match "${projectSearch}".`}
        />
      ) : null}

      {!projectsQuery.isPending && visibleProjects.length > 0 ? (
        <section className="project-grid">
          {visibleProjects.map((project, index) => (
            <ProjectCard
              key={project.id}
              index={index}
              onDelete={(projectId) => deleteProjectMutation.mutate(projectId)}
              onOpen={(projectTicketPrefix) => navigate(`/projects/${projectTicketPrefix}`)}
              project={project}
            />
          ))}
        </section>
      ) : null}
    </main>
  );
}
