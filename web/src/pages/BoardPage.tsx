import { type DragEvent, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Navigate, useParams, useSearchParams } from "react-router-dom";

import { api, type BoardLane, type Task } from "../api";
import { formatIsoDate, getTaskInputLabel, itemStyle } from "../app/utils";
import { BoardSkeleton, EmptyState, ErrorBanner } from "../components/ui";
import { useDismissableLayer } from "../hooks/useDismissableLayer";

function TaskCard({
  isDragDisabled,
  onDelete,
  onDragEnd,
  onDragOver,
  onDragStart,
  onOpen,
  task,
  taskIndex
}: {
  isDragDisabled: boolean;
  onDelete: (taskId: string) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragStart: (task: Task) => void;
  onOpen: (task: Task) => void;
  task: Task;
  taskIndex: number;
}) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const confirmRef = useRef<HTMLDivElement | null>(null);

  useDismissableLayer(isConfirmOpen, confirmRef, () => setIsConfirmOpen(false));

  return (
    <article
      className={`task-card${isDragDisabled ? "" : " is-draggable"}${isConfirmOpen ? " is-confirm-open" : ""}`}
      data-testid={`task-card-${task.id}`}
      draggable={!isDragDisabled}
      onClick={() => onOpen(task)}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", task.id);
        onDragStart(task);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(task);
        }
      }}
      role="button"
      style={itemStyle(taskIndex)}
      tabIndex={0}
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
              <p>Delete this task?</p>
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

function TaskEditorDialog({
  error,
  isPending,
  onClose,
  onSave,
  task
}: {
  error: Error | null;
  isPending: boolean;
  onClose: () => void;
  onSave: (input: { body: string; title: string }) => void;
  task: Task;
}) {
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.body);

  useEffect(() => {
    setTitle(task.title);
    setBody(task.body);
  }, [task.body, task.id, task.title]);

  return (
    <div className="dialog-scrim" onClick={onClose}>
      <section
        aria-labelledby="edit-task-title"
        aria-modal="true"
        className="dialog-panel dialog-panel--task-editor"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="dialog-header">
          <h2 id="edit-task-title">Edit Card</h2>
          <button
            aria-label="Close edit task dialog"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <span aria-hidden="true">x</span>
          </button>
        </div>
        <form
          className="dialog-form task-editor"
          onSubmit={(event) => {
            event.preventDefault();
            onSave({
              body,
              title: title.trim()
            });
          }}
        >
          <div className="task-editor__grid">
            <div className="task-editor__fields">
              <label className="field">
                <span className="field__label">Title</span>
                <input
                  autoFocus
                  maxLength={240}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Task title"
                  required
                  value={title}
                />
              </label>
              <label className="field field--editor">
                <span className="field__label">Body</span>
                <textarea
                  aria-label="Task body"
                  maxLength={12000}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Write markdown here"
                  rows={12}
                  value={body}
                />
              </label>
            </div>

            <section className="task-editor__preview-panel">
              <div className="task-editor__preview-header">
                <h3>Preview</h3>
                <span className="task-editor__preview-hint">Markdown</span>
              </div>
              <div className="markdown-preview" data-testid="task-markdown-preview">
                {body.trim() ? (
                  <ReactMarkdown>{body}</ReactMarkdown>
                ) : (
                  <p className="markdown-preview__empty">Nothing to preview yet.</p>
                )}
              </div>
            </section>
          </div>
          {error ? <ErrorBanner error={error} /> : null}
          <div className="dialog-actions">
            <button className="text-button" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="primary-button" disabled={isPending || title.trim().length === 0} type="submit">
              {isPending ? "Saving..." : "Save card"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function BoardPage() {
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [composerLaneId, setComposerLaneId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ laneId: string; position: number } | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
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
  const project = projectsQuery.data?.find((candidate) => candidate.id === projectId);
  const lanes = lanesQuery.data ?? project?.laneSummaries ?? [];
  const tasks = tasksQuery.data ?? [];
  const draggedTask = draggedTaskId ? tasks.find((task) => task.id === draggedTaskId) ?? null : null;
  const editingTask = editingTaskId ? tasks.find((task) => task.id === editingTaskId) ?? null : null;
  const isBoardFiltered = boardSearch.length > 0;

  function taskMatchesBoardSearch(task: Task) {
    if (!boardSearch) {
      return true;
    }

    const haystack = `${task.title}\n${task.body}`.toLowerCase();
    return haystack.includes(boardSearch);
  }

  const groupedTasks = lanes.map((lane) => ({
    ...lane,
    displayTasks: tasks
      .filter((task) => task.laneId === lane.id)
      .filter((task) => taskMatchesBoardSearch(task))
      .filter((task) => task.id !== draggedTaskId),
    tasks: tasks.filter((task) => task.laneId === lane.id)
  }));

  async function invalidateBoardData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
      queryClient.invalidateQueries({ queryKey: ["lanes", projectId] })
    ]);
  }

  const createLaneMutation = useMutation({
    mutationFn: (name: string) => api.createLane(projectId ?? "", name),
    onSuccess: async () => {
      closeCreateLaneDialog();
      await invalidateBoardData();
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
      await invalidateBoardData();
    }
  });

  const moveTaskMutation = useMutation({
    mutationFn: ({ laneId, position, taskId }: { laneId: string; position: number; taskId: string }) =>
      api.updateTask(projectId ?? "", taskId, { laneId, position }),
    onSuccess: async () => {
      await invalidateBoardData();
    }
  });

  const saveTaskMutation = useMutation({
    mutationFn: ({ body, taskId, title }: { body: string; taskId: string; title: string }) =>
      api.updateTask(projectId ?? "", taskId, { body, title }),
    onSuccess: async () => {
      closeTaskDialog();
      await invalidateBoardData();
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: string) => api.deleteTask(projectId ?? "", taskId),
    onSuccess: async () => {
      await invalidateBoardData();
    }
  });
  const isDragDisabled = isBoardFiltered || moveTaskMutation.isPending || saveTaskMutation.isPending;

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

  function closeTaskDialog() {
    setEditingTaskId(null);
    saveTaskMutation.reset();
  }

  function handleDrop(lane: { id: string; tasks: Task[] }) {
    const target = dropTarget ?? {
      laneId: lane.id,
      position: lane.tasks.filter((task) => task.id !== draggedTaskId).length
    };

    setDropTarget(null);
    if (!draggedTask) {
      setDraggedTaskId(null);
      return;
    }

    moveTaskMutation.mutate({
      laneId: target.laneId,
      position: target.position,
      taskId: draggedTask.id
    });
    setDraggedTaskId(null);
  }

  function handleColumnDragOver(
    event: DragEvent<HTMLElement>,
    lane: { displayTasks: Task[]; id: string }
  ) {
    if (!draggedTaskId || isDragDisabled) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest(".task-card")) {
      return;
    }

    event.preventDefault();
    setDropTarget((current) => {
      const next = {
        laneId: lane.id,
        position: lane.displayTasks.length
      };

      if (current?.laneId === next.laneId && current.position === next.position) {
        return current;
      }

      return next;
    });
  }

  function handleCardDragOver(
    event: DragEvent<HTMLElement>,
    input: {
      laneId: string;
      taskIndex: number;
    }
  ) {
    if (!draggedTaskId || isDragDisabled) {
      return;
    }

    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const insertAfter = event.clientY > bounds.top + bounds.height / 2;
    const nextPosition = input.taskIndex + (insertAfter ? 1 : 0);

    setDropTarget((current) => {
      if (current?.laneId === input.laneId && current.position === nextPosition) {
        return current;
      }

      return {
        laneId: input.laneId,
        position: nextPosition
      };
    });
  }

  function renderDropIndicator(laneId: string, position: number) {
    if (!draggedTaskId || dropTarget?.laneId !== laneId || dropTarget.position !== position) {
      return null;
    }

    return (
      <div className="task-drop-indicator" data-testid={`task-drop-indicator-${laneId}-${position}`}>
        <span>Drop here</span>
      </div>
    );
  }

  useEffect(() => {
    if (!isCreateLaneDialogOpen && !editingTask) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (editingTask) {
        closeTaskDialog();
        return;
      }

      closeCreateLaneDialog();
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [editingTask, isCreateLaneDialogOpen]);

  useEffect(() => {
    if (!editingTaskId || editingTask || tasksQuery.isPending) {
      return;
    }

    setEditingTaskId(null);
  }, [editingTask, editingTaskId, tasksQuery.isPending]);

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

      {editingTask ? (
        <TaskEditorDialog
          error={saveTaskMutation.error}
          isPending={saveTaskMutation.isPending}
          onClose={closeTaskDialog}
          onSave={({ body, title }) =>
            saveTaskMutation.mutate({
              body,
              taskId: editingTask.id,
              title
            })
          }
          task={editingTask}
        />
      ) : null}

      {projectsQuery.error ? <ErrorBanner error={projectsQuery.error} /> : null}
      {lanesQuery.error ? <ErrorBanner error={lanesQuery.error} /> : null}
      {tasksQuery.error ? <ErrorBanner error={tasksQuery.error} /> : null}
      {createTaskMutation.error ? <ErrorBanner error={createTaskMutation.error} /> : null}
      {moveTaskMutation.error ? <ErrorBanner error={moveTaskMutation.error} /> : null}
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
              className={`board-column${dropTarget?.laneId === lane.id ? " is-drop-target" : ""}`}
              data-testid={`board-column-${lane.systemKey ?? lane.id}`}
              key={lane.id}
              onDoubleClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("button, input, textarea, form, a")) {
                  return;
                }

                openComposer(lane.id);
              }}
              onDragLeave={(event) => {
                if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
                  setDropTarget((current) => (current?.laneId === lane.id ? null : current));
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
              <div
                className="board-column__content"
                onDragOver={(event) => handleColumnDragOver(event, lane)}
              >
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
                {renderDropIndicator(lane.id, 0)}
                {lane.displayTasks.map((task, taskIndex) => (
                  <div key={task.id}>
                    {taskIndex > 0 ? renderDropIndicator(lane.id, taskIndex) : null}
                    <TaskCard
                      isDragDisabled={isDragDisabled}
                      onDelete={(taskId) => deleteTaskMutation.mutate(taskId)}
                      onDragEnd={() => {
                        setDraggedTaskId(null);
                        setDropTarget(null);
                      }}
                      onDragOver={(event) =>
                        handleCardDragOver(event, {
                          laneId: lane.id,
                          taskIndex
                        })
                      }
                      onDragStart={(currentTask) => {
                        setDraggedTaskId(currentTask.id);
                        setDropTarget({
                          laneId: lane.id,
                          position: taskIndex
                        });
                      }}
                      onOpen={(taskToEdit) => setEditingTaskId(taskToEdit.id)}
                      task={task}
                      taskIndex={taskIndex}
                    />
                  </div>
                ))}
                {renderDropIndicator(lane.id, lane.displayTasks.length)}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </main>
  );
}
