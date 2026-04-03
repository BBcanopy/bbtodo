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
const sha256InitialHash = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19
] as const;
const sha256RoundConstants = [
  0x428a2f98,
  0x71374491,
  0xb5c0fbcf,
  0xe9b5dba5,
  0x3956c25b,
  0x59f111f1,
  0x923f82a4,
  0xab1c5ed5,
  0xd807aa98,
  0x12835b01,
  0x243185be,
  0x550c7dc3,
  0x72be5d74,
  0x80deb1fe,
  0x9bdc06a7,
  0xc19bf174,
  0xe49b69c1,
  0xefbe4786,
  0x0fc19dc6,
  0x240ca1cc,
  0x2de92c6f,
  0x4a7484aa,
  0x5cb0a9dc,
  0x76f988da,
  0x983e5152,
  0xa831c66d,
  0xb00327c8,
  0xbf597fc7,
  0xc6e00bf3,
  0xd5a79147,
  0x06ca6351,
  0x14292967,
  0x27b70a85,
  0x2e1b2138,
  0x4d2c6dfc,
  0x53380d13,
  0x650a7354,
  0x766a0abb,
  0x81c2c92e,
  0x92722c85,
  0xa2bfe8a1,
  0xa81a664b,
  0xc24b8b70,
  0xc76c51a3,
  0xd192e819,
  0xd6990624,
  0xf40e3585,
  0x106aa070,
  0x19a4c116,
  0x1e376c08,
  0x2748774c,
  0x34b0bcb5,
  0x391c0cb3,
  0x4ed8aa4a,
  0x5b9cca4f,
  0x682e6ff3,
  0x748f82ee,
  0x78a5636f,
  0x84c87814,
  0x8cc70208,
  0x90befffa,
  0xa4506ceb,
  0xbef9a3f7,
  0xc67178f2
] as const;

export function parseExactTicketId(value: string) {
  const normalizedValue = value.trim().toUpperCase();
  return exactTicketIdPattern.test(normalizedValue) ? normalizedValue : null;
}

function normalizeGravatarEmail(email: string | null | undefined) {
  const normalizedEmail = email?.trim().toLowerCase() ?? "";
  return normalizedEmail.length > 0 ? normalizedEmail : null;
}

function addUnsigned32(...values: number[]) {
  let result = 0;

  values.forEach((value) => {
    result = (result + value) >>> 0;
  });

  return result;
}

function rotateRight(value: number, shift: number) {
  return (value >>> shift) | (value << (32 - shift));
}

function formatUint32Hex(value: number) {
  return value.toString(16).padStart(8, "0");
}

function getSha256Hex(value: string) {
  const encodedValue = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((encodedValue.length + 9) / 64) * 64;
  const paddedValue = new Uint8Array(paddedLength);
  const blockView = new DataView(paddedValue.buffer);
  const messageSchedule = new Uint32Array(64);
  const hashState: number[] = Array.from(sha256InitialHash);
  const messageBitLength = encodedValue.length * 8;

  paddedValue.set(encodedValue);
  paddedValue[encodedValue.length] = 0x80;
  blockView.setUint32(paddedLength - 8, Math.floor(messageBitLength / 0x100000000));
  blockView.setUint32(paddedLength - 4, messageBitLength >>> 0);

  for (let blockOffset = 0; blockOffset < paddedLength; blockOffset += 64) {
    for (let index = 0; index < 16; index += 1) {
      messageSchedule[index] = blockView.getUint32(blockOffset + index * 4);
    }

    for (let index = 16; index < 64; index += 1) {
      const sigma0 =
        rotateRight(messageSchedule[index - 15], 7) ^
        rotateRight(messageSchedule[index - 15], 18) ^
        (messageSchedule[index - 15] >>> 3);
      const sigma1 =
        rotateRight(messageSchedule[index - 2], 17) ^
        rotateRight(messageSchedule[index - 2], 19) ^
        (messageSchedule[index - 2] >>> 10);

      messageSchedule[index] = addUnsigned32(
        messageSchedule[index - 16],
        sigma0,
        messageSchedule[index - 7],
        sigma1
      );
    }

    let [a, b, c, d, e, f, g, h] = hashState;

    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = addUnsigned32(h, sum1, choice, sha256RoundConstants[index], messageSchedule[index]);
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = addUnsigned32(sum0, majority);

      h = g;
      g = f;
      f = e;
      e = addUnsigned32(d, temp1);
      d = c;
      c = b;
      b = a;
      a = addUnsigned32(temp1, temp2);
    }

    hashState[0] = addUnsigned32(hashState[0], a);
    hashState[1] = addUnsigned32(hashState[1], b);
    hashState[2] = addUnsigned32(hashState[2], c);
    hashState[3] = addUnsigned32(hashState[3], d);
    hashState[4] = addUnsigned32(hashState[4], e);
    hashState[5] = addUnsigned32(hashState[5], f);
    hashState[6] = addUnsigned32(hashState[6], g);
    hashState[7] = addUnsigned32(hashState[7], h);
  }

  return hashState.map((valuePart) => formatUint32Hex(valuePart)).join("");
}

export async function getGravatarUrl(email: string | null | undefined) {
  const normalizedEmail = normalizeGravatarEmail(email);
  if (!normalizedEmail) {
    return null;
  }
  const params = new URLSearchParams({
    d: "404",
    r: "g",
    s: String(gravatarSize)
  });

  return `${gravatarBaseUrl}/${getSha256Hex(normalizedEmail)}?${params.toString()}`;
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
