import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import {
  createMutableMockOidcProvider,
  testConfig
} from "./test-helpers.js";

const createdApps: ReturnType<typeof buildApp>[] = [];
const createdDirs: string[] = [];

afterEach(async () => {
  while (createdApps.length > 0) {
    const app = createdApps.pop();
    if (app) {
      await app.close();
    }
  }

  while (createdDirs.length > 0) {
    const directory = createdDirs.pop();
    if (directory) {
      await rm(directory, { force: true, recursive: true });
    }
  }
});

describe("static client bundle serving", () => {
  it("serves assets and falls back to index.html for app routes", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "bbtodo-client-"));
    createdDirs.push(tempDir);

    await mkdir(path.join(tempDir, "assets"), { recursive: true });
    await writeFile(
      path.join(tempDir, "index.html"),
      "<!doctype html><html><body><div id=\"root\">bbtodo</div></body></html>"
    );
    await writeFile(
      path.join(tempDir, "assets", "index.js"),
      "console.log('bbtodo');"
    );

    const oidc = createMutableMockOidcProvider({
      subject: "static-user",
      email: "static@example.com",
      displayName: "Static User"
    });
    const app = buildApp({
      config: testConfig,
      clientDistPath: tempDir,
      oidcProvider: oidc.provider,
      sqlitePath: ":memory:"
    });
    createdApps.push(app);

    const rootResponse = await app.inject({
      method: "GET",
      url: "/"
    });
    expect(rootResponse.statusCode).toBe(200);
    expect(rootResponse.body).toContain("<div id=\"root\">bbtodo</div>");

    const assetResponse = await app.inject({
      method: "GET",
      url: "/assets/index.js"
    });
    expect(assetResponse.statusCode).toBe(200);
    expect(assetResponse.body).toContain("console.log('bbtodo');");

    const appRouteResponse = await app.inject({
      method: "GET",
      url: "/projects/BILL"
    });
    expect(appRouteResponse.statusCode).toBe(200);
    expect(appRouteResponse.body).toContain("<div id=\"root\">bbtodo</div>");

    const missingApiResponse = await app.inject({
      method: "GET",
      url: "/api/v1/does-not-exist"
    });
    expect(missingApiResponse.statusCode).toBe(404);
  });
});
