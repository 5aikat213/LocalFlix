import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { srtToWebVtt } from "@localflix/catalog/subtitle-conversion";
import type { LocalFlixDatabase } from "@localflix/database";

export type SubtitlePreparation =
  | { status: "ready"; absolutePath: string; contentType: "text/vtt; charset=utf-8" }
  | { status: "pending"; absolutePath: null; contentType: null };

export async function prepareSubtitleAsset(
  database: LocalFlixDatabase,
  trackId: string,
  dataDirectory: string
): Promise<SubtitlePreparation> {
  if (!/^[A-Za-z0-9-]+$/.test(trackId)) throw new Error("Subtitle track ID is invalid");
  const row = database.sqlite
    .prepare(
      `select st.stream_index as streamIndex, st.source_relative_path as sourceRelativePath,
              st.cached_path as cachedPath, st.format,
              lr.path as rootPath, mf.relative_path as mediaRelativePath
       from subtitle_tracks st
       join media_files mf on mf.id = st.media_file_id
       join library_roots lr on lr.id = mf.library_root_id
       where st.id = ? and mf.available = 1 and lr.online = 1`
    )
    .get(trackId) as
    | {
        streamIndex: number | null;
        sourceRelativePath: string | null;
        cachedPath: string | null;
        format: string;
        rootPath: string;
        mediaRelativePath: string;
      }
    | undefined;
  if (!row) throw new Error("Subtitle track was not found");
  if (row.cachedPath && existsSync(row.cachedPath)) {
    return { status: "ready", absolutePath: row.cachedPath, contentType: "text/vtt; charset=utf-8" };
  }
  if (!row.sourceRelativePath || !["srt", "vtt"].includes(row.format.toLowerCase())) {
    database.jobs.enqueueUnique("convert-subtitle", trackId, { trackId });
    return { status: "pending", absolutePath: null, contentType: null };
  }

  const rootPath = await realpath(row.rootPath);
  const sourcePath = await realpath(join(rootPath, row.sourceRelativePath));
  const containment = relative(rootPath, sourcePath);
  if (containment === ".." || containment.startsWith(`..${sep}`) || isAbsolute(containment)) {
    throw new Error("Subtitle resolves outside its configured library root");
  }
  const sourceInfo = await stat(sourcePath);
  if (sourceInfo.size > 10 * 1024 * 1024) throw new Error("Subtitle file is too large");
  const source = await readFile(sourcePath, "utf8");
  const output = srtToWebVtt(source);
  const directory = join(dataDirectory, "subtitles");
  const absolutePath = join(directory, `${trackId}.vtt`);
  await mkdir(directory, { recursive: true });
  const temporaryPath = join(directory, `.${trackId}-${randomUUID()}.tmp`);
  await writeFile(temporaryPath, output, { flag: "wx" });
  try {
    await rename(temporaryPath, absolutePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    if (!existsSync(absolutePath)) throw error;
  }
  database.sqlite.prepare("update subtitle_tracks set cached_path = ? where id = ?").run(absolutePath, trackId);
  return { status: "ready", absolutePath, contentType: "text/vtt; charset=utf-8" };
}
