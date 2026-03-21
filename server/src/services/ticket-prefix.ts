import { randomInt } from "node:crypto";

const fallbackTicketPrefixLetters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const fallbackTicketPrefixLength = 4;

export function normalizeProjectTicketPrefixSource(name: string) {
  return name.normalize("NFKD").replace(/[^A-Za-z]/g, "").toUpperCase();
}

function createRandomTicketPrefix(length = fallbackTicketPrefixLength) {
  let prefix = "";

  for (let index = 0; index < length; index += 1) {
    prefix += fallbackTicketPrefixLetters[randomInt(0, fallbackTicketPrefixLetters.length)];
  }

  return prefix;
}

function findAvailableFallbackTicketPrefix(usedPrefixes: Set<string>) {
  const totalPrefixCount = fallbackTicketPrefixLetters.length ** fallbackTicketPrefixLength;
  if (usedPrefixes.size >= totalPrefixCount) {
    return null;
  }

  for (let attempt = 0; attempt < 256; attempt += 1) {
    const candidate = createRandomTicketPrefix();
    if (!usedPrefixes.has(candidate)) {
      return candidate;
    }
  }

  for (const firstLetter of fallbackTicketPrefixLetters) {
    for (const secondLetter of fallbackTicketPrefixLetters) {
      for (const thirdLetter of fallbackTicketPrefixLetters) {
        for (const fourthLetter of fallbackTicketPrefixLetters) {
          const candidate = `${firstLetter}${secondLetter}${thirdLetter}${fourthLetter}`;
          if (!usedPrefixes.has(candidate)) {
            return candidate;
          }
        }
      }
    }
  }

  return null;
}

export function listProjectTicketPrefixCandidates(name: string) {
  const normalized = normalizeProjectTicketPrefixSource(name);
  const candidates: string[] = [];
  const seenCandidates = new Set<string>();

  function addCandidate(candidate: string) {
    if (candidate.length < 2 || candidate.length > 4 || seenCandidates.has(candidate)) {
      return;
    }

    seenCandidates.add(candidate);
    candidates.push(candidate);
  }

  function addCombinations(targetLength: number) {
    if (targetLength > normalized.length) {
      return;
    }

    const letters = [...normalized];

    function visit(nextIndex: number, current: string) {
      if (current.length === targetLength) {
        addCandidate(current);
        return;
      }

      for (let index = nextIndex; index < letters.length; index += 1) {
        if (current.length === 0 && index !== 0) {
          continue;
        }

        visit(index + 1, current + letters[index]);
      }
    }

    visit(0, "");
  }

  if (normalized.length === 1) {
    addCandidate(`${normalized}X`);
  } else {
    if (normalized.length <= 4) {
      addCandidate(normalized);
    }

    if (normalized.length >= 4) {
      addCombinations(4);
    }
    if (normalized.length >= 3) {
      addCombinations(3);
    }
    addCombinations(2);
  }

  return {
    candidates,
    normalized,
    status: "ok" as const
  };
}

export function resolveProjectTicketPrefix(name: string, usedPrefixes: Set<string>) {
  const candidates = listProjectTicketPrefixCandidates(name);
  const prefix = candidates.candidates.find((candidate) => !usedPrefixes.has(candidate));
  if (prefix) {
    return {
      normalized: candidates.normalized,
      prefix,
      status: "ok" as const
    };
  }

  if (candidates.normalized.length === 0) {
    const fallbackPrefix = findAvailableFallbackTicketPrefix(usedPrefixes);
    if (fallbackPrefix) {
      return {
        normalized: candidates.normalized,
        prefix: fallbackPrefix,
        status: "ok" as const
      };
    }
  }

  return {
    normalized: candidates.normalized,
    status: "prefix_exhausted" as const
  };
}
