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

const exactTicketIdPattern = /^[A-Z]{2,4}-[1-9]\d*$/;
const gravatarBaseUrl = "https://gravatar.com/avatar";
const gravatarSize = 160;

export function parseExactTicketId(value: string) {
  const normalizedValue = value.trim().toUpperCase();
  return exactTicketIdPattern.test(normalizedValue) ? normalizedValue : null;
}

function normalizeGravatarEmail(email: string | null | undefined) {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  return normalizedEmail.length > 0 ? normalizedEmail : null;
}

function formatHexDigest(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getGravatarUrl(email: string | null | undefined) {
  const normalizedEmail = normalizeGravatarEmail(email);
  if (!normalizedEmail || !globalThis.crypto?.subtle) {
    return null;
  }

  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalizedEmail)
  );
  const params = new URLSearchParams({
    d: "404",
    r: "g",
    s: String(gravatarSize)
  });

  return `${gravatarBaseUrl}/${formatHexDigest(digest)}?${params.toString()}`;
}

export function getAvatarLetter(user: User) {
  const source = user.name?.trim() || user.email?.trim() || "bbtodo";
  return source.charAt(0).toUpperCase();
}

export function getTaskInputLabel(columnLabel: string) {
  return `New task title for ${columnLabel}`;
}

function normalizeTagValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeTagKey(value: string) {
  return normalizeTagValue(value).toLowerCase();
}

export function normalizeLaneName(value: string) {
  return normalizeTagValue(value).toLowerCase();
}

export function isDoneLaneName(value: string) {
  return normalizeLaneName(value) === "done";
}

export function isProtectedLaneName(value: string) {
  const normalizedLaneName = normalizeLaneName(value);
  return normalizedLaneName === "todo" || normalizedLaneName === "done";
}

export function parseTagInput(value: string) {
  const seen = new Set<string>();
  const tags: string[] = [];

  value.split(",").forEach((part) => {
    const normalized = normalizeTagValue(part);
    if (!normalized) {
      return;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    tags.push(normalized);
  });

  return tags;
}

export function formatTagInput(tags: string[]) {
  return tags.join(", ");
}

export function parseSingleTagInput(value: string) {
  return parseTagInput(value)[0] ?? "";
}

export function formatSingleTagInput(value: string | null | undefined) {
  return parseSingleTagInput(value ?? "");
}
