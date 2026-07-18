import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, parseConfig } from "./index";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("LocalFlix configuration", () => {
  it("resolves a relative data directory without changing absolute media roots", () => {
    const config = loadConfig({
      cwd: "/tmp/localflix",
      env: {},
      fileConfig: {
        dataDirectory: ".localflix",
        movieDirectories: ["/media/Movies"]
      }
    });

    expect(config.dataDirectory).toBe("/tmp/localflix/.localflix");
    expect(config.movieDirectories).toEqual(["/media/Movies"]);
  });

  it("allows environment variables to override host and port", () => {
    const config = loadConfig({
      cwd: "/tmp/localflix",
      env: {
        LOCALFLIX_HOST: "0.0.0.0",
        LOCALFLIX_PORT: "4310"
      },
      fileConfig: {}
    });

    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(4310);
  });

  it("rejects non-positive worker concurrency", () => {
    expect(() => parseConfig({ workerConcurrency: 0 }, "/tmp/localflix")).toThrow(
      /workerConcurrency/
    );
  });

  it("discovers the project config from a nested workspace directory", () => {
    const root = mkdtempSync(join(tmpdir(), "localflix-config-"));
    temporaryDirectories.push(root);
    const workspace = join(root, "apps", "worker");
    mkdirSync(workspace, { recursive: true });
    writeFileSync(
      join(root, "localflix.config.json"),
      JSON.stringify({ dataDirectory: ".library-data", port: 3456 })
    );

    const config = loadConfig({ cwd: workspace, env: {} });

    expect(config.port).toBe(3456);
    expect(config.dataDirectory).toBe(join(root, ".library-data"));
  });

  it("resolves metadata assets and an optional OpenAI env file from the config directory", () => {
    const config = loadConfig({
      cwd: "/tmp/localflix",
      env: { LOCALFLIX_OPENAI_ENV_FILE: "../shared/.env.local" },
      fileConfig: { curatedMetadataPath: "seed/library.json" }
    });

    expect(config.curatedMetadataPath).toBe("/tmp/localflix/seed/library.json");
    expect(config.openAiEnvFile).toBe("/tmp/shared/.env.local");
  });
});
