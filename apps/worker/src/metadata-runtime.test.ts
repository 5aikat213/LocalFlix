import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseConfig } from "@localflix/config";
import { buildMetadataProviders } from "./metadata-runtime";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("metadata runtime", () => {
  it("loads curated data and adds OpenAI only when explicitly enabled", () => {
    const root = mkdtempSync(join(tmpdir(), "localflix-metadata-"));
    directories.push(root);
    const manifest = join(root, "metadata.json");
    const envFile = join(root, ".env.local");
    writeFileSync(manifest, "[]");
    writeFileSync(envFile, "OPENAI_API_KEY=test-key\n");

    const disabled = buildMetadataProviders(
      parseConfig({ curatedMetadataPath: manifest, openAiEnabled: false }, root)
    );
    const enabled = buildMetadataProviders(
      parseConfig(
        { curatedMetadataPath: manifest, openAiEnabled: true, openAiEnvFile: envFile },
        root
      )
    );

    expect(disabled.map(({ name }) => name)).toEqual(["curated"]);
    expect(enabled.map(({ name }) => name)).toEqual(["curated", "openai"]);
  });

  it("fails clearly when OpenAI is enabled without credentials", () => {
    const root = mkdtempSync(join(tmpdir(), "localflix-metadata-"));
    directories.push(root);
    const manifest = join(root, "metadata.json");
    writeFileSync(manifest, "[]");
    const config = parseConfig({ curatedMetadataPath: manifest, openAiEnabled: true }, root);

    expect(() => buildMetadataProviders(config, {})).toThrow(/OPENAI_API_KEY/);
  });
});
