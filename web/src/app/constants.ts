import type { UserTheme } from "../api";

export const defaultLaneLabels = ["Todo", "In Progress", "In review", "Done"] as const;

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
