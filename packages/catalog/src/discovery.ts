import { opendir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { toPosixPath } from "./release-parser";

export interface DiscoveryRoot {
  id: string;
  kind: "movie" | "series";
  path: string;
}

export interface DiscoveryOptions {
  minimumVideoBytes?: number;
}

export interface DiscoveredFile {
  rootId: string;
  rootKind: "movie" | "series";
  kind: "video" | "subtitle";
  absolutePath: string;
  relativePath: string;
  extension: string;
  sizeBytes: number;
  modifiedAtMs: number;
}

const videoExtensions = new Set([".mkv", ".mp4", ".m4v", ".mov", ".avi", ".webm"]);
const subtitleExtensions = new Set([".srt", ".vtt", ".ass", ".ssa", ".sub"]);

function ignoredName(name: string): boolean {
  return name.startsWith(".") || /^(?:sample|proof)(?:[ ._-]|$)/i.test(name);
}

async function* walk(path: string): AsyncGenerator<string> {
  const directory = await opendir(path);
  const entries = [];
  for await (const entry of directory) entries.push(entry);
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (ignoredName(entry.name)) continue;
    const absolutePath = join(path, entry.name);
    if (entry.isDirectory()) {
      yield* walk(absolutePath);
    } else if (entry.isFile()) {
      yield absolutePath;
    }
  }
}

export async function* discoverRoot(
  root: DiscoveryRoot,
  options: DiscoveryOptions = {}
): AsyncGenerator<DiscoveredFile> {
  const minimumVideoBytes = options.minimumVideoBytes ?? 50 * 1024 * 1024;
  for await (const absolutePath of walk(root.path)) {
    const extension = extname(absolutePath).toLowerCase();
    const kind = videoExtensions.has(extension)
      ? "video"
      : subtitleExtensions.has(extension)
        ? "subtitle"
        : null;
    if (kind === null) continue;

    const file = await import("node:fs/promises").then(({ stat }) => stat(absolutePath));
    if (kind === "video" && file.size < minimumVideoBytes) continue;
    yield {
      rootId: root.id,
      rootKind: root.kind,
      kind,
      absolutePath,
      relativePath: toPosixPath(relative(root.path, absolutePath)),
      extension,
      sizeBytes: file.size,
      modifiedAtMs: file.mtimeMs
    };
  }
}

export const supportedVideoExtensions = videoExtensions;
export const supportedSubtitleExtensions = subtitleExtensions;
