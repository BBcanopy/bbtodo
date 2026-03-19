import type { TaskStatus, UserTheme } from "../api";

export const columns: Array<{ key: TaskStatus; label: string }> = [
  { key: "todo", label: "Todo" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" }
];

export const loginPreview: Record<TaskStatus, string[]> = {
  todo: ["Audit callback route", "Rename API settings", "Trim Docker health probes"],
  in_progress: ["Refine board spacing", "Polish token reveal state"],
  done: ["Wire OIDC login", "Split web and server packages"]
};

export const themeOptions: Array<{
  id: UserTheme;
  label: string;
}> = [
  {
    id: "sea",
    label: "Sea"
  },
  {
    id: "ember",
    label: "Ember"
  },
  {
    id: "midnight",
    label: "Midnight"
  }
];
