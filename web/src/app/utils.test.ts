import { afterEach, describe, expect, it, vi } from "vitest";

import { getAvatarLetter, getGravatarUrl } from "./utils";

describe("app utils", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a gravatar URL from a normalized email address", async () => {
    const gravatarUrl = await getGravatarUrl("MyEmailAddress@example.com ");

    expect(gravatarUrl).not.toBeNull();

    const parsedGravatarUrl = new URL(gravatarUrl ?? "");

    expect(`${parsedGravatarUrl.origin}${parsedGravatarUrl.pathname}`).toBe(
      "https://gravatar.com/avatar/84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee"
    );
    expect(parsedGravatarUrl.searchParams.get("d")).toBe("404");
    expect(parsedGravatarUrl.searchParams.get("r")).toBe("g");
    expect(parsedGravatarUrl.searchParams.get("s")).toBe("160");
  });

  it("returns null when the email is missing", async () => {
    await expect(getGravatarUrl(null)).resolves.toBeNull();
    await expect(getGravatarUrl("   ")).resolves.toBeNull();
  });

  it("builds a gravatar URL even when subtle crypto is unavailable", async () => {
    vi.stubGlobal("crypto", undefined);

    await expect(getGravatarUrl("MyEmailAddress@example.com ")).resolves.toBe(
      "https://gravatar.com/avatar/84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee?d=404&r=g&s=160"
    );
  });

  it("keeps the first-letter fallback when the user has no name", () => {
    expect(
      getAvatarLetter({
        email: "operator@example.com",
        id: "user-1",
        name: null,
        theme: "sea"
      })
    ).toBe("O");
  });
});
