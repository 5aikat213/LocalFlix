import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { z } from "zod";

const configSchema = z.object({
  dataDirectory: z.string().min(1).default(".localflix"),
  host: z.string().min(1).default("127.0.0.1"),
  port: z.number().int().min(1).max(65_535).default(3_000),
  movieDirectories: z
    .array(z.string().min(1))
    .default([join(homedir(), "Movies", "Movies")]),
  seriesDirectories: z
    .array(z.string().min(1))
    .default([join(homedir(), "Movies", "TV", "Series")]),
  scanOnStartup: z.boolean().default(true),
  workerConcurrency: z.number().int().positive().default(4),
  transcodeConcurrency: z.number().int().positive().default(1),
  openAiEnabled: z.boolean().default(false),
  openAiModel: z.string().min(1).default("gpt-5.6-luna"),
  openAiEnvFile: z.string().min(1).optional(),
  curatedMetadataPath: z.string().min(1).default("seed/curated-metadata.json")
});

export interface LoadConfigOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  configPath?: string;
  fileConfig?: Record<string, unknown>;
}

export type LocalFlixConfig = z.infer<typeof configSchema>;

function readJsonConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) {
    return {};
  }

  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`LocalFlix config at ${path} must contain a JSON object`);
  }
  return value as Record<string, unknown>;
}

function findConfigPath(startDirectory: string): string | null {
  let directory = resolve(startDirectory);
  const root = parse(directory).root;
  while (true) {
    const candidate = resolve(directory, "localflix.config.json");
    if (existsSync(candidate)) return candidate;
    if (directory === root) return null;
    directory = dirname(directory);
  }
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(`Expected a boolean environment value, received ${value}`);
}

function parseDirectoryList(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const parsed: unknown = JSON.parse(value);
  return z.array(z.string().min(1)).parse(parsed);
}

function envOverrides(env: NodeJS.ProcessEnv): Record<string, unknown> {
  return {
    ...(env.LOCALFLIX_DATA_DIRECTORY
      ? { dataDirectory: env.LOCALFLIX_DATA_DIRECTORY }
      : {}),
    ...(env.LOCALFLIX_HOST ? { host: env.LOCALFLIX_HOST } : {}),
    ...(env.LOCALFLIX_PORT ? { port: Number(env.LOCALFLIX_PORT) } : {}),
    ...(env.LOCALFLIX_MOVIE_DIRECTORIES
      ? { movieDirectories: parseDirectoryList(env.LOCALFLIX_MOVIE_DIRECTORIES) }
      : {}),
    ...(env.LOCALFLIX_SERIES_DIRECTORIES
      ? { seriesDirectories: parseDirectoryList(env.LOCALFLIX_SERIES_DIRECTORIES) }
      : {}),
    ...(env.LOCALFLIX_SCAN_ON_STARTUP
      ? { scanOnStartup: parseBoolean(env.LOCALFLIX_SCAN_ON_STARTUP) }
      : {}),
    ...(env.LOCALFLIX_WORKER_CONCURRENCY
      ? { workerConcurrency: Number(env.LOCALFLIX_WORKER_CONCURRENCY) }
      : {}),
    ...(env.LOCALFLIX_TRANSCODE_CONCURRENCY
      ? { transcodeConcurrency: Number(env.LOCALFLIX_TRANSCODE_CONCURRENCY) }
      : {}),
    ...(env.LOCALFLIX_OPENAI_ENABLED
      ? { openAiEnabled: parseBoolean(env.LOCALFLIX_OPENAI_ENABLED) }
      : {}),
    ...(env.LOCALFLIX_OPENAI_MODEL ? { openAiModel: env.LOCALFLIX_OPENAI_MODEL } : {}),
    ...(env.LOCALFLIX_OPENAI_ENV_FILE ? { openAiEnvFile: env.LOCALFLIX_OPENAI_ENV_FILE } : {}),
    ...(env.LOCALFLIX_CURATED_METADATA_PATH
      ? { curatedMetadataPath: env.LOCALFLIX_CURATED_METADATA_PATH }
      : {})
  };
}

export function parseConfig(input: unknown, cwd = process.cwd()): LocalFlixConfig {
  const parsed = configSchema.parse(input);
  const resolveFromCwd = (path: string): string =>
    isAbsolute(path) ? path : resolve(cwd, path);

  return {
    ...parsed,
    dataDirectory: resolveFromCwd(parsed.dataDirectory),
    curatedMetadataPath: resolveFromCwd(parsed.curatedMetadataPath),
    openAiEnvFile: parsed.openAiEnvFile ? resolveFromCwd(parsed.openAiEnvFile) : undefined,
    movieDirectories: parsed.movieDirectories.map(resolveFromCwd),
    seriesDirectories: parsed.seriesDirectories.map(resolveFromCwd)
  };
}

export function loadConfig(options: LoadConfigOptions = {}): LocalFlixConfig {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const configuredPath = options.configPath ?? env.LOCALFLIX_CONFIG_PATH;
  const path = configuredPath
    ? resolve(cwd, configuredPath)
    : (findConfigPath(cwd) ?? resolve(cwd, "localflix.config.json"));
  const fileConfig = options.fileConfig ?? readJsonConfig(path);
  const configDirectory = options.fileConfig === undefined && existsSync(path) ? dirname(path) : cwd;

  return parseConfig({ ...fileConfig, ...envOverrides(env) }, configDirectory);
}
