import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useParams } from "react-router-dom";

import { api, type Task, type TaskStatus } from "../api";
import { columns } from "../app/constants";
import { formatIsoDate, getTaskInputLabel, itemStyle } from "../app/utils";
import { BoardSkeleton, EmptyState, ErrorBanner } from "../components/ui";
import { useDismissableLayer } from "../hooks/useDismissableLayer";

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
      <title>{project ? `${project.name} | BBTodo` : "Board | BBTodo"}</title>
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
              onDoubleClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("button, input, form, a")) {
                  return;
                }

                openComposer(column.key);
              }}
              onDragLeave={(event) => {
                if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
                  setDropTargetStatus((current) => (current === column.key ? null : current));
                }
              }}
              onDragOver={(event) => {
                if (!draggedTaskId) {
                  return;
                }

                event.preventDefault();
                if (dropTargetStatus !== column.key) {
                  setDropTargetStatus(column.key);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop(column.key);
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
                    isDragging={draggedTaskId === task.id}
                    onDelete={(taskId) => deleteTaskMutation.mutate(taskId)}
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
