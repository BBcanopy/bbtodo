import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useParams, useSearchParams } from "react-router-dom";

import { api, type BoardLane, type Task } from "../api";
import { formatIsoDate, getTaskInputLabel, itemStyle } from "../app/utils";
import { BoardSkeleton, EmptyState, ErrorBanner } from "../components/ui";
import { useDismissableLayer } from "../hooks/useDismissableLayer";

function TaskCard({
  isDragging,
  onDelete,
  onDragEnd,
  onDragStart,
  task,
  taskIndex
}: {
  isDragging: boolean;
  onDelete: (taskId: string) => void;
  onDragEnd: () => void;
  onDragStart: (task: Task) => void;
  task: Task;
  taskIndex: number;
}) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const confirmRef = useRef<HTMLDivElement | null>(null);

  useDismissableLayer(isConfirmOpen, confirmRef, () => setIsConfirmOpen(false));

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
        <time className="task-card__timestamp" dateTime={task.updatedAt}>
          {formatIsoDate(task.updatedAt)}
        </time>
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

export function BoardPage() {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [composerLaneId, setComposerLaneId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTargetLaneId, setDropTargetLaneId] = useState<string | null>(null);
  const [laneName, setLaneName] = useState("");
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.listProjects()
  });
  const lanesQuery = useQuery({
    enabled: Boolean(projectId),
    queryKey: ["lanes", projectId],
    queryFn: () => api.listLanes(projectId ?? "")
  });
  const tasksQuery = useQuery({
    enabled: Boolean(projectId),
    queryKey: ["tasks", projectId],
    queryFn: () => api.listTasks(projectId ?? "")
  });
  const isCreateLaneDialogOpen = searchParams.get("createLane") === "1";
  const boardSearch = searchParams.get("q")?.trim().toLowerCase() ?? "";

  const createLaneMutation = useMutation({
    mutationFn: (name: string) => api.createLane(projectId ?? "", name),
    onSuccess: async () => {
      closeCreateLaneDialog();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lanes", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] })
      ]);
    }
  });

  const createTaskMutation = useMutation({
    mutationFn: ({ laneId, title }: { laneId: string; title: string }) =>
      api.createTask(projectId ?? "", {
        laneId,
        title
      }),
    onSuccess: async () => {
      setComposerLaneId(null);
      setDraftTitle("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["lanes", projectId] })
      ]);
    }
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ laneId, position, task }: { laneId: string; position: number; task: Task }) =>
      api.updateTask(projectId ?? "", task.id, { laneId, position }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["lanes", projectId] })
      ]);
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => api.deleteTask(projectId ?? "", taskId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["lanes", projectId] })
      ]);
    }
  });

  const project = projectsQuery.data?.find((candidate) => candidate.id === projectId);
  const lanes = lanesQuery.data ?? project?.laneSummaries ?? [];
  const tasks = tasksQuery.data ?? [];
  const draggedTask = draggedTaskId ? tasks.find((task) => task.id === draggedTaskId) ?? null : null;
  const visibleTasks = boardSearch
    ? tasks.filter((task) => {
        const haystack = `${task.title}\n${task.body}`.toLowerCase();
        return haystack.includes(boardSearch);
      })
    : tasks;
  const groupedTasks = lanes.map((lane) => ({
    ...lane,
    tasks: visibleTasks.filter((task) => task.laneId === lane.id)
  }));

  function updateBoardParams(updater: (params: URLSearchParams) => void) {
    const nextParams = new URLSearchParams(searchParams);
    updater(nextParams);
    setSearchParams(nextParams, { replace: true });
  }

  function closeCreateLaneDialog() {
    updateBoardParams((params) => {
      params.delete("createLane");
    });
    setLaneName("");
    createLaneMutation.reset();
  }

  function openComposer(laneId: string) {
    setComposerLaneId(laneId);
    setDraftTitle("");
  }

  function closeComposer() {
    setComposerLaneId(null);
    setDraftTitle("");
  }

  function handleDrop(lane: BoardLane) {
    setDropTargetLaneId(null);
    if (!draggedTask || draggedTask.laneId === lane.id) {
      setDraggedTaskId(null);
      return;
    }

    const nextPosition = tasks.filter((task) => task.laneId === lane.id && task.id !== draggedTask.id).length;
    updateTaskMutation.mutate({
      laneId: lane.id,
      position: nextPosition,
      task: draggedTask
    });
    setDraggedTaskId(null);
  }

  useEffect(() => {
    if (!isCreateLaneDialogOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeCreateLaneDialog();
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isCreateLaneDialogOpen]);

  if (!projectId) {
    return <Navigate replace to="/" />;
  }

  return (
    <main className="page-shell page-shell--board">
      <title>{project ? `${project.name} | BBTodo` : "Board | BBTodo"}</title>
      {isCreateLaneDialogOpen ? (
        <div className="dialog-scrim" onClick={() => closeCreateLaneDialog()}>
          <section
            aria-labelledby="create-lane-title"
            aria-modal="true"
            className="dialog-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="dialog-header">
              <h2 id="create-lane-title">Create Lane</h2>
              <button
                aria-label="Close create lane dialog"
                className="icon-button"
                onClick={() => closeCreateLaneDialog()}
                type="button"
              >
                <span aria-hidden="true">x</span>
              </button>
            </div>
            <form
              className="dialog-form"
              onSubmit={(event) => {
                event.preventDefault();
                createLaneMutation.mutate(laneName.trim());
              }}
            >
              <label className="field">
                <span className="field__label">Lane name</span>
                <input
                  autoFocus
                  maxLength={80}
                  onChange={(event) => setLaneName(event.target.value)}
                  placeholder="Ready for QA"
                  required
                  value={laneName}
                />
              </label>
              {createLaneMutation.error ? <ErrorBanner error={createLaneMutation.error} /> : null}
              <div className="dialog-actions">
                <button className="text-button" onClick={() => closeCreateLaneDialog()} type="button">
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={createLaneMutation.isPending || laneName.trim().length === 0}
                  type="submit"
                >
                  {createLaneMutation.isPending ? "Creating lane..." : "Create Lane"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {projectsQuery.error ? <ErrorBanner error={projectsQuery.error} /> : null}
      {lanesQuery.error ? <ErrorBanner error={lanesQuery.error} /> : null}
      {tasksQuery.error ? <ErrorBanner error={tasksQuery.error} /> : null}
      {createLaneMutation.error ? <ErrorBanner error={createLaneMutation.error} /> : null}
      {createTaskMutation.error ? <ErrorBanner error={createTaskMutation.error} /> : null}
      {updateTaskMutation.error ? <ErrorBanner error={updateTaskMutation.error} /> : null}
      {deleteTaskMutation.error ? <ErrorBanner error={deleteTaskMutation.error} /> : null}

      {projectsQuery.isPending || lanesQuery.isPending || tasksQuery.isPending ? <BoardSkeleton /> : null}

      {!projectsQuery.isPending && projectsQuery.data && !project ? (
        <EmptyState
          copy="The project may have been removed. Head back to the project list and open another board."
          eyebrow="Missing board"
          title="That board is no longer available."
        />
      ) : null}

      {!projectsQuery.isPending && !lanesQuery.isPending && !tasksQuery.isPending && project ? (
        <section className="board-grid board-grid--lanes" data-testid="board-grid">
          {groupedTasks.map((lane, laneIndex) => (
            <div
              className={`board-column${dropTargetLaneId === lane.id ? " is-drop-target" : ""}`}
              data-testid={`board-column-${lane.systemKey ?? lane.id}`}
              key={lane.id}
              onDoubleClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("button, input, form, a")) {
                  return;
                }

                openComposer(lane.id);
              }}
              onDragLeave={(event) => {
                if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
                  setDropTargetLaneId((current) => (current === lane.id ? null : current));
                }
              }}
              onDragOver={(event) => {
                if (!draggedTaskId) {
                  return;
                }

                event.preventDefault();
                if (dropTargetLaneId !== lane.id) {
                  setDropTargetLaneId(lane.id);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop(lane);
              }}
              style={itemStyle(laneIndex)}
            >
              <div className="board-column__header">
                <div>
                  <h2>{lane.name}</h2>
                </div>
              </div>
              <div className="board-column__content">
                {composerLaneId === lane.id ? (
                  <form
                    className="lane-composer"
                    data-testid={`lane-composer-${lane.id}`}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onSubmit={(event) => {
                      event.preventDefault();
                      createTaskMutation.mutate({
                        laneId: lane.id,
                        title: draftTitle.trim()
                      });
                    }}
                  >
                    <label className="field">
                      <span className="field__label">New task</span>
                      <input
                        aria-label={getTaskInputLabel(lane.name)}
                        autoFocus
                        maxLength={240}
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            closeComposer();
                          }
                        }}
                        placeholder={`Add to ${lane.name}`}
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
                {lane.tasks.map((task, taskIndex) => (
                  <TaskCard
                    key={task.id}
                    isDragging={draggedTaskId === task.id}
                    onDelete={(taskId) => deleteTaskMutation.mutate(taskId)}
                    onDragEnd={() => {
                      setDraggedTaskId(null);
                      setDropTargetLaneId(null);
                    }}
                    onDragStart={(currentTask) => {
                      setDraggedTaskId(currentTask.id);
                      setDropTargetLaneId(null);
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
