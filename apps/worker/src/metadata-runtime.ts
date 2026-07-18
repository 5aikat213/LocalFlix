import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import {
  CuratedMetadataProvider,
  OpenAiMetadataProvider,
  type MetadataProvider
} from "@localflix/catalog";
import type { LocalFlixConfig } from "@localflix/config";

export function buildMetadataProviders(
  config: LocalFlixConfig,
  env: NodeJS.ProcessEnv = process.env
): Array<{ name: string; provider: MetadataProvider }> {
  const entries: unknown = JSON.parse(readFileSync(config.curatedMetadataPath, "utf8"));
  if (!Array.isArray(entries)) {
    throw new Error(`Curated metadata at ${config.curatedMetadataPath} must be a JSON array`);
  }
  const providers: Array<{ name: string; provider: MetadataProvider }> = [
    { name: "curated", provider: new CuratedMetadataProvider(entries) }
  ];
  if (!config.openAiEnabled) return providers;

  const fileEnv = config.openAiEnvFile
    ? parseEnv(readFileSync(config.openAiEnvFile, "utf8"))
    : {};
  const apiKey = env.OPENAI_API_KEY ?? fileEnv.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "LOCALFLIX_OPENAI_ENABLED requires OPENAI_API_KEY in the process or configured env file"
    );
  }
  providers.push({
    name: "openai",
    provider: new OpenAiMetadataProvider({ apiKey, model: config.openAiModel })
  });
  return providers;
}
