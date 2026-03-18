import type { CSSProperties } from "react";

import { ApiError, type User } from "../api";

export function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}

export function itemStyle(index: number): CSSProperties {
  return { "--item-index": index } as CSSProperties;
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...options
  }).format(new Date(value));
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatIsoDate(value: string) {
  return value.slice(0, 10);
}

export function getAvatarLetter(user: User) {
  const source = user.name?.trim() || user.email?.trim() || "bbtodo";
  return source.charAt(0).toUpperCase();
}

export function getTaskInputLabel(columnLabel: string) {
  return `New task title for ${columnLabel}`;
}
