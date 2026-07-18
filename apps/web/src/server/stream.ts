import { realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative } from "node:path";
import type { LocalFlixDatabase } from "@localflix/database";

export interface ByteRange {
  start: number;
  end: number;
}

export interface PlayableFile {
  absolutePath: string;
  mimeType: string;
  sizeBytes: number;
}

export function parseByteRange(header: string, sizeBytes: number): ByteRange {
  if (!header.startsWith("bytes=")) throw new Error("Only byte ranges are supported");
  const value = header.slice(6);
  if (value.includes(",")) throw new Error("Only a single byte range is supported");
  const match = /^(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw new Error("Byte range is invalid");
  const startText = match[1] ?? "";
  const endText = match[2] ?? "";
  let start: number;
  let end: number;
  if (!startText) {
    const suffix = Number(endText);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) throw new Error("Byte range is invalid");
    start = Math.max(0, sizeBytes - suffix);
    end = sizeBytes - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : sizeBytes - 1;
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= sizeBytes ||
    end < start
  ) {
    throw new Error("Byte range is not satisfiable");
  }
  return { start, end: Math.min(end, sizeBytes - 1) };
}

function mimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".mp4":
    case ".m4v":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mkv":
      return "video/x-matroska";
    case ".avi":
      return "video/x-msvideo";
    case ".mov":
      return "video/quicktime";
    default:
      return "application/octet-stream";
  }
}

export async function resolvePlayableFile(
  database: LocalFlixDatabase,
  mediaFileId: string
): Promise<PlayableFile> {
  const row = database.sqlite
    .prepare(
      `select lr.path as rootPath, mf.relative_path as relativePath
       from media_files mf join library_roots lr on lr.id = mf.library_root_id
       where mf.id = ? and mf.available = 1 and lr.enabled = 1 and lr.online = 1`
    )
    .get(mediaFileId) as { rootPath: string; relativePath: string } | undefined;
  if (!row) throw new Error("Playable media file was not found");

  const rootPath = await realpath(row.rootPath);
  const absolutePath = await realpath(join(rootPath, row.relativePath));
  const containment = relative(rootPath, absolutePath);
  if (containment === ".." || containment.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(containment)) {
    throw new Error("Media file resolves outside its configured library root");
  }
  const info = await stat(absolutePath);
  if (!info.isFile()) throw new Error("Playable media path is not a file");
  return { absolutePath, mimeType: mimeType(absolutePath), sizeBytes: info.size };
}
