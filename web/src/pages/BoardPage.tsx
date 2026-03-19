import { type DragEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
import { CSS } from "@dnd-kit/utilities";

import { api, type BoardLane, type Task, type TaskTag, type TaskTagColor } from "../api";
import {
  getRandomTaskTagColor,
  getTaskTagStyle,
  taskTagColorOptions
} from "../app/tag-colors";
import {
  formatIsoDate,
  formatTagInput,
  getTaskInputLabel,
  itemStyle,
  normalizeTagKey,
  parseTagInput
} from "../app/utils";
import { BoardSkeleton, CloseIcon, EmptyState, ErrorBanner, TrashIcon } from "../components/ui";
import { useDismissableLayer } from "../hooks/useDismissableLayer";

type TaskIdsByLane = Record<string, string[]>;
type TaskEditorView = "preview" | "source";

const taskSortableTransition = {
  duration: 220,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)"
};

const taskDropAnimation = {
  duration: 220,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)"
};

const taskCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) {
    const slotHits = pointerHits.filter((collision) => {
      const container = args.droppableContainers.find(
        (droppableContainer) => droppableContainer.id === collision.id
      );

      return container?.data.current?.type === "slot";
    });

    if (slotHits.length > 0) {
      return slotHits;
    }

    const taskHits = pointerHits.filter((collision) => {
      const container = args.droppableContainers.find(
        (droppableContainer) => droppableContainer.id === collision.id
      );

      return container?.data.current?.type === "task";
    });

    if (taskHits.length > 0) {
      return taskHits;
    }

    return pointerHits;
  }

  return closestCorners(args);
};

function compareTasks(left: Task, right: Task) {
  if (left.position !== right.position) {
    return left.position - right.position;
  }

  return left.updatedAt < right.updatedAt ? 1 : -1;
}

function buildTaskIdsByLane(lanes: BoardLane[], tasks: Task[]) {
  const taskIdsByLane = Object.fromEntries(lanes.map((lane) => [lane.id, [] as string[]])) satisfies TaskIdsByLane;

  tasks
    .slice()
    .sort(compareTasks)
    .forEach((task) => {
      if (!task.laneId || !(task.laneId in taskIdsByLane)) {
        return;
      }

      taskIdsByLane[task.laneId].push(task.id);
    });

  return taskIdsByLane;
}

function findTaskLocation(taskIdsByLane: TaskIdsByLane, taskId: string) {
  for (const [laneId, taskIds] of Object.entries(taskIdsByLane)) {
    const index = taskIds.indexOf(taskId);
    if (index !== -1) {
      return { index, laneId };
    }
  }

  return null;
}

function moveTaskId(
  taskIdsByLane: TaskIdsByLane,
  taskId: string,
  targetLaneId: string,
  targetIndex: number
) {
  const source = findTaskLocation(taskIdsByLane, taskId);
  if (!source || !(targetLaneId in taskIdsByLane)) {
    return taskIdsByLane;
  }

  const nextTaskIdsByLane = Object.fromEntries(
    Object.entries(taskIdsByLane).map(([laneId, taskIds]) => [laneId, [...taskIds]])
  ) satisfies TaskIdsByLane;

  nextTaskIdsByLane[source.laneId].splice(source.index, 1);
  const destinationTaskIds = nextTaskIdsByLane[targetLaneId];
  const normalizedTargetIndex =
    source.laneId === targetLaneId && source.index < targetIndex ? targetIndex - 1 : targetIndex;
  const clampedTargetIndex = Math.max(0, Math.min(normalizedTargetIndex, destinationTaskIds.length));

  if (source.laneId === targetLaneId && source.index === clampedTargetIndex) {
    return taskIdsByLane;
  }

  destinationTaskIds.splice(clampedTargetIndex, 0, taskId);
  return nextTaskIdsByLane;
}

function mergeUniqueTags(currentTags: TaskTag[], nextValue: string, color: TaskTagColor) {
  const seen = new Set(currentTags.map((tag) => normalizeTagKey(tag.label)));
  const additions: TaskTag[] = [];

  parseTagInput(nextValue).forEach((tag) => {
    const key = normalizeTagKey(tag);
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    additions.push({
      color,
      label: tag
    });
  });

  return additions.length > 0 ? [...currentTags, ...additions] : currentTags;
}

function listSuggestedTags(tasks: Task[]) {
  const tagsByKey = new Map<string, TaskTag>();

  tasks.forEach((task) => {
    task.tags.forEach((tag) => {
      const key = normalizeTagKey(tag.label);
      if (!key || tagsByKey.has(key)) {
        return;
      }

      tagsByKey.set(key, tag);
    });
  });

  return Array.from(tagsByKey.values()).sort((left, right) =>
    left.label.localeCompare(right.label, undefined, { sensitivity: "base" })
  );
}

function createNativeDragPreview(node: HTMLElement) {
  const preview = node.cloneNode(true);
  if (!(preview instanceof HTMLElement)) {
    return null;
  }

  const bounds = node.getBoundingClientRect();
  preview.classList.add("board-drag-preview");
  preview.style.width = `${bounds.width}px`;
  preview.style.height = `${bounds.height}px`;
  preview.style.position = "fixed";
  preview.style.top = "-10000px";
  preview.style.left = "-10000px";
  preview.style.margin = "0";
  preview.style.pointerEvents = "none";
  preview.style.zIndex = "9999";
  preview.style.transform = "none";
  preview.style.animation = "none";
  preview.style.transition = "none";
  document.body.append(preview);

  return preview;
}

function LaneDropArea({
  children,
  laneId
}: {
  children: ReactNode;
  laneId: string;
}) {
  const { setNodeRef } = useDroppable({
    id: `lane:${laneId}`,
    data: {
      laneId,
      type: "lane"
    }
  });

  return (
    <div className="board-column__content" ref={setNodeRef}>
      {children}
    </div>
  );
}

function TaskDropSlot({
  isVisible,
  laneId,
  position
}: {
  isVisible: boolean;
  laneId: string;
  position: number;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `slot:${laneId}:${position}`,
    data: {
      laneId,
      position,
      type: "slot"
    }
  });

  if (!isVisible) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className={`task-drop-slot${isOver ? " is-active" : ""}`}
      data-testid={`task-drop-slot-${laneId}-${position}`}
      ref={setNodeRef}
    />
  );
}

function TaskCardPreview({
  activeTagKeys,
  task
}: {
  activeTagKeys: Set<string>;
  task: Task;
}) {
  return (
    <article className="task-card task-card--drag-overlay">
      {task.tags.length > 0 ? (
        <>
          <p className="task-card__title">{task.title}</p>
          <div className="task-card__footer">
            <div className="task-card__tags">
              {task.tags.map((tag) => (
                <span
                  className={`task-tag${activeTagKeys.has(normalizeTagKey(tag.label)) ? " is-active" : ""}`}
                  key={tag.label}
                  style={getTaskTagStyle(tag.color)}
                >
                  {tag.label}
                </span>
              ))}
            </div>
            <time className="task-card__timestamp" dateTime={task.updatedAt}>
              {formatIsoDate(task.updatedAt)}
            </time>
          </div>
        </>
      ) : (
        <div className="task-card__headline">
          <p className="task-card__title">{task.title}</p>
          <time className="task-card__timestamp" dateTime={task.updatedAt}>
            {formatIsoDate(task.updatedAt)}
          </time>
        </div>
      )}
    </article>
  );
}

function TaskCard({
  isDragDisabled,
  laneId,
  onDelete,
  onOpen,
  onTagSelect,
  activeTagKeys,
  task,
  taskIndex
}: {
  activeTagKeys: Set<string>;
  isDragDisabled: boolean;
  laneId: string;
  onDelete: (taskId: string) => void;
  onOpen: (task: Task) => void;
  onTagSelect: (tag: string) => void;
  task: Task;
  taskIndex: number;
}) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const confirmRef = useRef<HTMLDivElement | null>(null);
  const suppressClickRef = useRef(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: isDragDisabled,
    transition: taskSortableTransition,
    data: {
      laneId,
      taskId: task.id,
      type: "task"
    }
  });

  useDismissableLayer(isConfirmOpen, confirmRef, () => setIsConfirmOpen(false));

  useEffect(() => {
    if (isDragging) {
      suppressClickRef.current = true;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isDragging]);

  const deleteMenu = (
    <div className="task-card__delete-menu" ref={confirmRef}>
      <button
        aria-expanded={isConfirmOpen}
        aria-label={`Delete task ${task.title}`}
        className="icon-button danger-button"
        data-no-dnd="true"
        onClick={(event) => {
          event.stopPropagation();
          setIsConfirmOpen((current) => !current);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        type="button"
      >
        <TrashIcon />
      </button>
      {isConfirmOpen ? (
        <div
          className="task-delete-popover"
          data-no-dnd="true"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          role="alertdialog"
        >
          <p>Delete this task?</p>
          <div className="task-delete-popover__actions">
            <button
              className="text-button"
              data-no-dnd="true"
              onClick={(event) => {
                event.stopPropagation();
                setIsConfirmOpen(false);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
            >
              Cancel
            </button>
            <button
              className="ghost-button danger-button"
              data-no-dnd="true"
              onClick={(event) => {
                event.stopPropagation();
                setIsConfirmOpen(false);
                onDelete(task.id);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <article
      {...attributes}
      {...listeners}
      className={`task-card${isDragDisabled ? "" : " is-draggable"}${isConfirmOpen ? " is-confirm-open" : ""}${isDragging ? " is-dragging" : ""}`}
      data-testid={`task-card-${task.id}`}
      onClick={() => {
        if (suppressClickRef.current) {
          return;
        }

        onOpen(task);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(task);
        }
      }}
      ref={setNodeRef}
      role="button"
      style={{
        ...itemStyle(taskIndex),
        transform: CSS.Transform.toString(transform),
        transition
      }}
      tabIndex={0}
    >
      {task.tags.length > 0 ? (
        <>
          <div className="task-card__title-row">
            <p className="task-card__title">{task.title}</p>
            {deleteMenu}
          </div>
          <div className="task-card__footer">
            <div className="task-card__tags">
              {task.tags.map((tag) => (
                <button
                  className={`task-tag${activeTagKeys.has(normalizeTagKey(tag.label)) ? " is-active" : ""}`}
                  data-no-dnd="true"
                  key={tag.label}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTagSelect(tag.label);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  style={getTaskTagStyle(tag.color)}
                  type="button"
                >
                  {tag.label}
                </button>
              ))}
            </div>
            <time className="task-card__timestamp" dateTime={task.updatedAt}>
              {formatIsoDate(task.updatedAt)}
            </time>
          </div>
        </>
      ) : (
        <div className="task-card__headline">
          <p className="task-card__title">{task.title}</p>
          <time className="task-card__timestamp" dateTime={task.updatedAt}>
            {formatIsoDate(task.updatedAt)}
          </time>
          {deleteMenu}
        </div>
      )}
    </article>
  );
}

function MarkdownSourceIcon() {
  return (
    <svg aria-hidden="true" className="task-editor__tab-icon" viewBox="0 0 24 24">
      <path
        d="M4.75 6.75h14.5v10.5H4.75zm4.75 0-3.25 5.25 3.25 5.25m5-10.5 3.25 5.25-3.25 5.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function MarkdownPreviewIcon() {
  return (
    <svg aria-hidden="true" className="task-editor__tab-icon" viewBox="0 0 24 24">
      <path
        d="M2.75 12s3.5-5.75 9.25-5.75S21.25 12 21.25 12 17.75 17.75 12 17.75 2.75 12 2.75 12Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="12" fill="none" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function TaskTagEditor({
  availableTags,
  inputColor,
  inputValue,
  onInputColorChange,
  onInputValueChange,
  onSelectedTagsChange,
  selectedTags
}: {
  availableTags: TaskTag[];
  inputColor: TaskTagColor;
  inputValue: string;
  onInputColorChange: (color: TaskTagColor) => void;
  onInputValueChange: (value: string) => void;
  onSelectedTagsChange: (tags: TaskTag[]) => void;
  selectedTags: TaskTag[];
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedColorTargetKey, setSelectedColorTargetKey] = useState<string | null>(null);
  const selectedTagKeys = useMemo(
    () => new Set(selectedTags.map((tag) => normalizeTagKey(tag.label))),
    [selectedTags]
  );
  const suggestionQuery = normalizeTagKey(inputValue);
  const selectedColorTarget =
    selectedColorTargetKey === null
      ? null
      : selectedTags.find((tag) => normalizeTagKey(tag.label) === selectedColorTargetKey) ?? null;
  const draftColorTargetLabel = parseTagInput(inputValue)[0] ?? null;
  const activeColorTarget =
    selectedColorTarget ??
    (draftColorTargetLabel ? { color: inputColor, label: draftColorTargetLabel } : null);
  const activePaletteColor = activeColorTarget?.color ?? inputColor;
  const shouldShowPalette = activeColorTarget !== null;
  const visibleSuggestions = useMemo(
    () =>
      availableTags.filter((tag) => {
        const key = normalizeTagKey(tag.label);
        if (selectedTagKeys.has(key)) {
          return false;
        }

        return suggestionQuery.length === 0 || key.includes(suggestionQuery);
      }),
    [availableTags, selectedTagKeys, suggestionQuery]
  );

  useEffect(() => {
    if (
      selectedColorTargetKey !== null &&
      !selectedTags.some((tag) => normalizeTagKey(tag.label) === selectedColorTargetKey)
    ) {
      setSelectedColorTargetKey(null);
    }
  }, [selectedColorTargetKey, selectedTags]);

  function commitInputValue() {
    const nextTags = mergeUniqueTags(selectedTags, inputValue, inputColor);

    if (nextTags !== selectedTags) {
      onSelectedTagsChange(nextTags);
    }

    if (inputValue.length > 0) {
      onInputValueChange("");
      onInputColorChange(getRandomTaskTagColor());
    }

    return nextTags;
  }

  function removeTag(tagToRemove: string) {
    onSelectedTagsChange(
      selectedTags.filter((tag) => normalizeTagKey(tag.label) !== normalizeTagKey(tagToRemove))
    );
    if (selectedColorTargetKey === normalizeTagKey(tagToRemove)) {
      setSelectedColorTargetKey(null);
    }
    inputRef.current?.focus();
  }

  function addSuggestedTag(tag: TaskTag) {
    onSelectedTagsChange(mergeUniqueTags(selectedTags, tag.label, tag.color));
    onInputValueChange("");
    setSelectedColorTargetKey(normalizeTagKey(tag.label));
    inputRef.current?.focus();
  }

  function updateTagColor(color: TaskTagColor) {
    if (selectedColorTargetKey === null) {
      onInputColorChange(color);
      return;
    }

    onSelectedTagsChange(
      selectedTags.map((tag) =>
        normalizeTagKey(tag.label) === selectedColorTargetKey ? { ...tag, color } : tag
      )
    );
  }

  return (
    <div className="field">
      <span className="field__label" id="task-tag-editor-label">
        Tags
      </span>
      <div
        aria-labelledby="task-tag-editor-label"
        className="task-tag-editor"
        onBlur={(event) => {
          const nextFocusedNode = event.relatedTarget as Node | null;
          if (nextFocusedNode && event.currentTarget.contains(nextFocusedNode)) {
            return;
          }

          commitInputValue();
        }}
        role="group"
      >
        <div
          className="task-tag-editor__input-shell"
          onClick={() => {
            setSelectedColorTargetKey(null);
            inputRef.current?.focus();
          }}
          role="presentation"
        >
          {selectedTags.map((tag) => (
            <span
              className={`task-tag-editor__chip${selectedColorTargetKey === normalizeTagKey(tag.label) ? " is-selected" : ""}`}
              key={tag.label}
              style={getTaskTagStyle(tag.color)}
            >
              <button
                aria-label={`Edit color for tag ${tag.label}`}
                aria-pressed={selectedColorTargetKey === normalizeTagKey(tag.label)}
                className="task-tag-editor__chip-main"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedColorTargetKey(normalizeTagKey(tag.label));
                }}
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                <span aria-hidden="true" className="task-tag-editor__chip-swatch" />
                <span className="task-tag-editor__chip-label">{tag.label}</span>
              </button>
              <button
                aria-label={`Remove tag ${tag.label}`}
                className="task-tag-editor__chip-remove"
                onClick={(event) => {
                  event.stopPropagation();
                  removeTag(tag.label);
                }}
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                <CloseIcon />
              </button>
            </span>
          ))}
          <input
            aria-label="Task tags"
            className="task-tag-editor__input"
            maxLength={240}
            onChange={(event) => {
              const nextValue = event.target.value;
              if (selectedColorTargetKey !== null) {
                setSelectedColorTargetKey(null);
              }
              if (inputValue.trim().length === 0 && nextValue.trim().length > 0) {
                onInputColorChange(getRandomTaskTagColor());
              }
              onInputValueChange(nextValue);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === ",") {
                event.preventDefault();
                commitInputValue();
                return;
              }

              if (
                (event.key === "Backspace" || event.key === "Delete") &&
                inputValue.length === 0 &&
                selectedTags.length > 0
              ) {
                event.preventDefault();
                onSelectedTagsChange(selectedTags.slice(0, -1));
              }
            }}
            placeholder={selectedTags.length > 0 ? "Add another tag" : "Add a tag"}
            ref={inputRef}
            value={inputValue}
          />
        </div>
        {shouldShowPalette ? (
          <div className="task-tag-editor__palette-panel">
            <span className="task-tag-editor__palette-label">
              {`Color for ${activeColorTarget?.label ?? ""}`}
            </span>
            <div className="task-tag-editor__palette" role="list">
              {taskTagColorOptions.map((option) => (
                <button
                  aria-label={`Set ${activeColorTarget?.label ?? "tag"} color to ${option.label}`}
                  aria-pressed={activePaletteColor === option.value}
                  className={`task-tag-editor__swatch${activePaletteColor === option.value ? " is-active" : ""}`}
                  key={option.value}
                  onClick={() => updateTagColor(option.value)}
                  onMouseDown={(event) => event.preventDefault()}
                  style={getTaskTagStyle(option.value)}
                  type="button"
                >
                  <span aria-hidden="true" className="task-tag-editor__swatch-dot" />
                  <span className="task-tag-editor__swatch-name">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {visibleSuggestions.length > 0 ? (
          <div aria-label="Suggested tags" className="task-tag-editor__suggestions" role="list">
            {visibleSuggestions.map((tag) => (
              <button
                aria-label={`Add tag ${tag.label}`}
                className="task-tag-editor__suggestion"
                key={tag.label}
                onClick={() => addSuggestedTag(tag)}
                onMouseDown={(event) => event.preventDefault()}
                style={getTaskTagStyle(tag.color)}
                type="button"
              >
                {tag.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TaskEditorDialog({
  availableTags,
  error,
  isPending,
  onClose,
  onSave,
  task
}: {
  availableTags: TaskTag[];
  error: Error | null;
  isPending: boolean;
  onClose: () => void;
  onSave: (input: { body: string; tags: TaskTag[]; title: string }) => void;
  task: Task;
}) {
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.body);
  const [selectedTags, setSelectedTags] = useState(task.tags);
  const [tagInputColor, setTagInputColor] = useState<TaskTagColor>(() => getRandomTaskTagColor());
  const [tagInputValue, setTagInputValue] = useState("");
  const [activeView, setActiveView] = useState<TaskEditorView>("source");

  useEffect(() => {
    setTitle(task.title);
    setBody(task.body);
    setSelectedTags(task.tags);
    setTagInputColor(getRandomTaskTagColor());
    setTagInputValue("");
    setActiveView("source");
  }, [task.body, task.id, task.tags, task.title]);

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
            <CloseIcon />
          </button>
        </div>
        <form
          className="dialog-form task-editor"
          onSubmit={(event) => {
            event.preventDefault();
            const tags = mergeUniqueTags(selectedTags, tagInputValue, tagInputColor);
            setSelectedTags(tags);
            setTagInputValue("");
            onSave({
              body,
              tags,
              title: title.trim()
            });
          }}
        >
          <div className="task-editor__grid">
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
            <TaskTagEditor
              availableTags={availableTags}
              inputColor={tagInputColor}
              inputValue={tagInputValue}
              onInputColorChange={setTagInputColor}
              onInputValueChange={setTagInputValue}
              onSelectedTagsChange={setSelectedTags}
              selectedTags={selectedTags}
            />
            <div className="field field--editor">
              <div className="task-editor__field-header">
                <span className="field__label">Body</span>
                <div
                  aria-label="Markdown editor view"
                  className="task-editor__view-tabs"
                  role="tablist"
                >
                  <button
                    aria-controls="task-markdown-source-panel"
                    aria-label="Markdown source"
                    aria-selected={activeView === "source"}
                    className={`task-editor__view-tab${activeView === "source" ? " is-active" : ""}`}
                    id="task-markdown-source-tab"
                    onClick={() => setActiveView("source")}
                    role="tab"
                    type="button"
                  >
                    <MarkdownSourceIcon />
                  </button>
                  <button
                    aria-controls="task-markdown-preview-panel"
                    aria-label="Rendered preview"
                    aria-selected={activeView === "preview"}
                    className={`task-editor__view-tab${activeView === "preview" ? " is-active" : ""}`}
                    id="task-markdown-preview-tab"
                    onClick={() => setActiveView("preview")}
                    role="tab"
                    type="button"
                  >
                    <MarkdownPreviewIcon />
                  </button>
                </div>
              </div>
              {activeView === "source" ? (
                <div
                  aria-labelledby="task-markdown-source-tab"
                  className="task-editor__panel"
                  id="task-markdown-source-panel"
                  role="tabpanel"
                >
                  <textarea
                    aria-label="Task body"
                    maxLength={12000}
                    onChange={(event) => setBody(event.target.value)}
                    placeholder="Write markdown here"
                    rows={12}
                    value={body}
                  />
                </div>
              ) : null}
            </div>
            {activeView === "preview" ? (
              <div
                aria-labelledby="task-markdown-preview-tab"
                className="task-editor__preview-inline"
                id="task-markdown-preview-panel"
                role="tabpanel"
              >
                <div
                  className="markdown-preview"
                  data-testid="task-markdown-preview"
                  id="task-markdown-preview"
                >
                  {body.trim() ? (
                    <ReactMarkdown>{body}</ReactMarkdown>
                  ) : (
                    <p className="markdown-preview__empty">Nothing to preview yet.</p>
                  )}
                </div>
              </div>
            ) : null}
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
  const [draggedLaneId, setDraggedLaneId] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [taskDragOrder, setTaskDragOrder] = useState<TaskIdsByLane | null>(null);
  const [laneDropTarget, setLaneDropTarget] = useState<{
    insertAfter: boolean;
    laneId: string;
    position: number;
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ laneId: string; position: number } | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [laneName, setLaneName] = useState("");
  const [taskDragPreviewWidth, setTaskDragPreviewWidth] = useState<number | null>(null);
  const laneDragPreviewRef = useRef<HTMLElement | null>(null);
  const pointerClientYRef = useRef<number | null>(null);
  const taskDragOrderRef = useRef<TaskIdsByLane | null>(null);

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
  const taskTagsQuery = useQuery({
    queryKey: ["task-tags"],
    queryFn: () => api.listTaskTags()
  });

  const isCreateLaneDialogOpen = searchParams.get("createLane") === "1";
  const boardSearch = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const activeTagFilters = parseTagInput(searchParams.get("tags") ?? "");
  const activeTagKeys = new Set(activeTagFilters.map((tag) => normalizeTagKey(tag)));
  const project = projectsQuery.data?.find((candidate) => candidate.id === projectId);
  const lanes = lanesQuery.data ?? project?.laneSummaries ?? [];
  const tasks = tasksQuery.data ?? [];
  const draggedLane = draggedLaneId ? lanes.find((lane) => lane.id === draggedLaneId) ?? null : null;
  const editingTask = editingTaskId ? tasks.find((task) => task.id === editingTaskId) ?? null : null;
  const isBoardFiltered = boardSearch.length > 0 || activeTagKeys.size > 0;
  const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const draggedTask = draggedTaskId ? taskMap.get(draggedTaskId) ?? null : null;
  const availableTaskTags = taskTagsQuery.data ?? listSuggestedTags(tasks);
  const orderedTaskIdsByLane = useMemo(() => buildTaskIdsByLane(lanes, tasks), [lanes, tasks]);
  const previewTaskIdsByLane = taskDragOrder ?? orderedTaskIdsByLane;
  const taskSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  );

  function taskMatchesBoardFilters(task: Task) {
    const haystack = `${task.title}\n${task.body}\n${task.tags.map((tag) => tag.label).join("\n")}`.toLowerCase();
    const matchesSearch = !boardSearch || haystack.includes(boardSearch);
    if (!matchesSearch) {
      return false;
    }

    if (activeTagKeys.size === 0) {
      return true;
    }

    const taskTagKeys = new Set(task.tags.map((tag) => normalizeTagKey(tag.label)));
    return Array.from(activeTagKeys).every((tag) => taskTagKeys.has(tag));
  }

  const groupedTasks = lanes.map((lane) => ({
    ...lane,
    displayTasks: (previewTaskIdsByLane[lane.id] ?? [])
      .map((taskId) => taskMap.get(taskId))
      .filter((task): task is Task => Boolean(task))
      .filter((task) => taskMatchesBoardFilters(task)),
    tasks: (previewTaskIdsByLane[lane.id] ?? [])
      .map((taskId) => taskMap.get(taskId))
      .filter((task): task is Task => Boolean(task))
  }));

  async function invalidateBoardData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tasks", projectId] }),
      queryClient.invalidateQueries({ queryKey: ["task-tags"] }),
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
  const moveLaneMutation = useMutation({
    mutationFn: ({ laneId, position }: { laneId: string; position: number }) =>
      api.updateLane(projectId ?? "", laneId, { position }),
    onSuccess: async () => {
      await invalidateBoardData();
    }
  });

  const saveTaskMutation = useMutation({
    mutationFn: ({
      body,
      tags,
      taskId,
      title
    }: {
      body: string;
      tags: TaskTag[];
      taskId: string;
      title: string;
    }) => api.updateTask(projectId ?? "", taskId, { body, tags, title }),
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
  const isDragDisabled =
    isBoardFiltered ||
    moveTaskMutation.isPending ||
    moveLaneMutation.isPending ||
    saveTaskMutation.isPending ||
    draggedLaneId !== null;
  const isLaneDragDisabled = moveLaneMutation.isPending || draggedTaskId !== null;

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

  function updateTagFilters(tags: string[]) {
    updateBoardParams((params) => {
      const nextValue = formatTagInput(tags);
      if (nextValue) {
        params.set("tags", nextValue);
      } else {
        params.delete("tags");
      }
    });
  }

  function handleTagSelect(tag: string) {
    if (activeTagKeys.has(normalizeTagKey(tag))) {
      return;
    }

    updateTagFilters([...activeTagFilters, tag]);
  }

  function clearLaneDrag() {
    laneDragPreviewRef.current?.remove();
    laneDragPreviewRef.current = null;
    setDraggedLaneId(null);
    setLaneDropTarget(null);
  }

  function clearTaskDrag() {
    setDraggedTaskId(null);
    setDropTarget(null);
    setTaskDragOrder(null);
    setTaskDragPreviewWidth(null);
    taskDragOrderRef.current = null;
  }

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      pointerClientYRef.current = event.clientY;
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  function resolveLanePosition(targetLaneId: string, insertAfter: boolean) {
    const visibleLaneIds = lanes
      .filter((lane) => lane.id !== draggedLaneId)
      .map((lane) => lane.id);
    const targetIndex = visibleLaneIds.indexOf(targetLaneId);
    if (targetIndex === -1) {
      return null;
    }

    return Math.max(0, Math.min(targetIndex + (insertAfter ? 1 : 0), visibleLaneIds.length));
  }

  function handleLaneDragOver(event: DragEvent<HTMLElement>, lane: BoardLane) {
    if (!draggedLaneId || isLaneDragDisabled || lane.id === draggedLaneId) {
      return;
    }

    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const insertAfter = event.clientX > bounds.left + bounds.width / 2;
    const position = resolveLanePosition(lane.id, insertAfter);
    if (position === null) {
      return;
    }

    setLaneDropTarget((current) => {
      if (
        current?.laneId === lane.id &&
        current.position === position &&
        current.insertAfter === insertAfter
      ) {
        return current;
      }

      return {
        laneId: lane.id,
        position,
        insertAfter
      };
    });
  }

  function handleLaneDrop() {
    const laneId = draggedLane?.id;
    const position = laneDropTarget?.position;

    clearLaneDrag();
    if (!laneId || position === undefined) {
      return;
    }

    moveLaneMutation.mutate({
      laneId,
      position
    });
  }

  function handleTaskDragStart(event: DragStartEvent) {
    if (isDragDisabled) {
      return;
    }

    const activeTaskId = String(event.active.id);
    const nextTaskOrder = buildTaskIdsByLane(lanes, tasks);
    const source = findTaskLocation(nextTaskOrder, activeTaskId);

    setDraggedTaskId(activeTaskId);
    setTaskDragPreviewWidth(event.active.rect.current.initial?.width ?? null);
    setTaskDragOrder(nextTaskOrder);
    taskDragOrderRef.current = nextTaskOrder;
    setDropTarget(source ? { laneId: source.laneId, position: source.index } : null);
  }

  function handleTaskDragOver(event: DragOverEvent) {
    if (!draggedTaskId || isDragDisabled || !event.over) {
      return;
    }

    const activeTaskId = String(event.active.id);
    const currentTaskOrder = taskDragOrder ?? orderedTaskIdsByLane;
    const overData = event.over.data.current;
    if (!overData) {
      return;
    }

    let targetLaneId: string | null = null;
    let targetIndex: number | null = null;

    if (overData.type === "slot") {
      targetLaneId = String(overData.laneId);
      targetIndex = Number(overData.position);
    }

    if (overData.type === "lane") {
      targetLaneId = String(overData.laneId);
      const laneTaskIds = currentTaskOrder[targetLaneId] ?? [];
      if (laneTaskIds.length === 0) {
        targetIndex = 0;
      } else {
        const pointerClientY = pointerClientYRef.current;
        const translated = event.active.rect.current.translated;
        const activeHeight = event.active.rect.current.initial?.height ?? 0;
        const activeCenterY =
          pointerClientY ??
          (translated !== null
            ? translated.top + activeHeight / 2
            : event.over.rect.top + event.over.rect.height / 2);
        const relativeCenterY = Math.max(0, activeCenterY - event.over.rect.top);
        const normalizedIndex = Math.floor(
          (relativeCenterY / Math.max(event.over.rect.height, 1)) * laneTaskIds.length
        );

        targetIndex = Math.max(0, Math.min(normalizedIndex, laneTaskIds.length));
      }
    }

    if (overData.type === "task") {
      targetLaneId = String(overData.laneId);
      const overTaskId = String(overData.taskId);
      const overIndex = currentTaskOrder[targetLaneId]?.indexOf(overTaskId) ?? -1;
      if (overIndex !== -1) {
        const pointerClientY = pointerClientYRef.current;
        const translated = event.active.rect.current.translated;
        const activeHeight = event.active.rect.current.initial?.height ?? event.over.rect.height;
        const translatedCenter =
          pointerClientY ?? (translated !== null ? translated.top + activeHeight / 2 : event.over.rect.top);
        const isBelowOverItem =
          translatedCenter > event.over.rect.top + event.over.rect.height / 2;
        targetIndex = overIndex + (isBelowOverItem ? 1 : 0);
      }
    }

    if (targetLaneId === null || targetIndex === null) {
      return;
    }

    const nextTaskOrder = moveTaskId(currentTaskOrder, activeTaskId, targetLaneId, targetIndex);
    const nextLocation = findTaskLocation(nextTaskOrder, activeTaskId);
    if (!nextLocation) {
      return;
    }

    setTaskDragOrder(nextTaskOrder);
    taskDragOrderRef.current = nextTaskOrder;
    setDropTarget({
      laneId: nextLocation.laneId,
      position: nextLocation.index
    });
  }

  function handleTaskDragEnd(event: DragEndEvent) {
    const activeTaskId = String(event.active.id);
    const currentTaskOrder = taskDragOrderRef.current ?? taskDragOrder ?? orderedTaskIdsByLane;
    const source = findTaskLocation(orderedTaskIdsByLane, activeTaskId);
    const destination = findTaskLocation(currentTaskOrder, activeTaskId);

    clearTaskDrag();
    if (!source || !destination) {
      return;
    }

    if (source.laneId === destination.laneId && source.index === destination.index) {
      return;
    }

    moveTaskMutation.mutate({
      laneId: destination.laneId,
      position: destination.index,
      taskId: activeTaskId
    });
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
    return () => {
      laneDragPreviewRef.current?.remove();
      laneDragPreviewRef.current = null;
    };
  }, []);

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
                <CloseIcon />
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
          availableTags={availableTaskTags}
          error={saveTaskMutation.error}
          isPending={saveTaskMutation.isPending}
          onClose={closeTaskDialog}
          onSave={({ body, tags, title }) =>
            saveTaskMutation.mutate({
              body,
              tags,
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
      {moveLaneMutation.error ? <ErrorBanner error={moveLaneMutation.error} /> : null}
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
        <DndContext
          collisionDetection={taskCollisionDetection}
          onDragCancel={clearTaskDrag}
          onDragEnd={handleTaskDragEnd}
          onDragOver={handleTaskDragOver}
          onDragStart={handleTaskDragStart}
          sensors={taskSensors}
        >
          <section className="board-grid board-grid--lanes" data-testid="board-grid">
            {groupedTasks.map((lane, laneIndex) => (
              <div
                className={`board-column${dropTarget?.laneId === lane.id ? " is-drop-target" : ""}${draggedLaneId === lane.id ? " is-lane-dragging" : ""}${laneDropTarget?.laneId === lane.id ? " is-lane-drop-target" : ""}${laneDropTarget?.laneId === lane.id && laneDropTarget.insertAfter ? " is-lane-drop-after" : ""}${laneDropTarget?.laneId === lane.id && !laneDropTarget.insertAfter ? " is-lane-drop-before" : ""}`}
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
                    setLaneDropTarget((current) => (current?.laneId === lane.id ? null : current));
                  }
                }}
                onDragOver={(event) => handleLaneDragOver(event, lane)}
                onDrop={(event) => {
                  if (!draggedLaneId) {
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();
                  handleLaneDrop();
                }}
                style={itemStyle(laneIndex)}
              >
                <div className="board-column__header">
                  <div>
                    <h2>{lane.name}</h2>
                  </div>
                  <button
                    aria-label={`Reorder lane ${lane.name}`}
                    className="lane-drag-handle"
                    draggable={!isLaneDragDisabled}
                    onClick={(event) => event.stopPropagation()}
                    onDragEnd={() => clearLaneDrag()}
                    onDragStart={(event) => {
                      event.stopPropagation();
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", lane.id);
                      const column = event.currentTarget.closest(".board-column");
                      if (column instanceof HTMLElement) {
                        const preview = createNativeDragPreview(column);
                        if (preview) {
                          laneDragPreviewRef.current?.remove();
                          laneDragPreviewRef.current = preview;
                          const bounds = column.getBoundingClientRect();
                          const offsetX = Math.max(0, Math.min(event.clientX - bounds.left, bounds.width));
                          const offsetY = Math.max(0, Math.min(event.clientY - bounds.top, bounds.height));
                          event.dataTransfer.setDragImage(preview, offsetX, offsetY);
                        }
                      }
                      setDraggedLaneId(lane.id);
                      setLaneDropTarget(null);
                    }}
                    type="button"
                  >
                    <span aria-hidden="true">::</span>
                  </button>
                </div>
                <LaneDropArea laneId={lane.id}>
                  <SortableContext items={lane.tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
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
                    <TaskDropSlot isVisible={Boolean(draggedTaskId)} laneId={lane.id} position={0} />
                    {lane.displayTasks.map((task, taskIndex) => (
                      <div key={task.id}>
                        <TaskCard
                          activeTagKeys={activeTagKeys}
                          isDragDisabled={isDragDisabled}
                          laneId={lane.id}
                          onDelete={(taskId) => deleteTaskMutation.mutate(taskId)}
                          onOpen={(taskToEdit) => setEditingTaskId(taskToEdit.id)}
                          onTagSelect={handleTagSelect}
                          task={task}
                          taskIndex={taskIndex}
                        />
                        <TaskDropSlot
                          isVisible={Boolean(draggedTaskId)}
                          laneId={lane.id}
                          position={taskIndex + 1}
                        />
                      </div>
                    ))}
                  </SortableContext>
                </LaneDropArea>
              </div>
            ))}
          </section>
          <DragOverlay dropAnimation={taskDropAnimation}>
            {draggedTask ? (
              <div
                className="task-drag-overlay"
                style={taskDragPreviewWidth ? { width: `${taskDragPreviewWidth}px` } : undefined}
              >
                <TaskCardPreview activeTagKeys={activeTagKeys} task={draggedTask} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}
    </main>
  );
}
