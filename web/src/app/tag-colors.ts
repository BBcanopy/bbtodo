import type { CSSProperties } from "react";

import type { TaskTagColor } from "../api";

export const defaultTaskTagColor: TaskTagColor = "moss";

export const taskTagColorOptions: Array<{
  label: string;
  value: TaskTagColor;
}> = [
  { label: "Moss", value: "moss" },
  { label: "Sky", value: "sky" },
  { label: "Amber", value: "amber" },
  { label: "Coral", value: "coral" },
  { label: "Orchid", value: "orchid" },
  { label: "Slate", value: "slate" }
];

const taskTagToneMap: Record<
  TaskTagColor,
  { background: string; border: string; text: string }
> = {
  amber: {
    background: "#fff1d9",
    border: "#e2b35d",
    text: "#8a5904"
  },
  coral: {
    background: "#ffe4de",
    border: "#e59682",
    text: "#9a4538"
  },
  moss: {
    background: "#e6f3e7",
    border: "#89b08d",
    text: "#2f6b46"
  },
  orchid: {
    background: "#f2e5ff",
    border: "#b892dc",
    text: "#6c419e"
  },
  sky: {
    background: "#e3f1ff",
    border: "#8eb2dc",
    text: "#285f95"
  },
  slate: {
    background: "#e7edf2",
    border: "#9fb0bc",
    text: "#465764"
  }
};

export function getTaskTagTone(color: TaskTagColor) {
  return taskTagToneMap[color] ?? taskTagToneMap[defaultTaskTagColor];
}

export function getTaskTagStyle(color: TaskTagColor): CSSProperties {
  const tone = getTaskTagTone(color);

  return {
    "--tag-bg": tone.background,
    "--tag-border": tone.border,
    "--tag-fg": tone.text
  } as CSSProperties;
}

export function getRandomTaskTagColor() {
  const randomIndex = Math.floor(Math.random() * taskTagColorOptions.length);
  return taskTagColorOptions[randomIndex]?.value ?? defaultTaskTagColor;
}
