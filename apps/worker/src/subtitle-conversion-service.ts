import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, realpath, rename, rm } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import type { LocalFlixDatabase } from "@localflix/database";

export interface SubtitleConversionPayload {
  trackId: string;
}

interface SubtitleConversionServiceOptions {
  database: LocalFlixDatabase;
  dataDirectory: string;
  runConversion?: (inputPath: string, outputPath: string, streamIndex: number) => Promise<void>;
}

async function ffmpegConvert(inputPath: string, outputPath: string, streamIndex: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "warning", "-y", "-i", inputPath, "-map", `0:${streamIndex}`, "-f", "webvtt", outputPath],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-8_000);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg subtitle conversion failed (${code}): ${stderr.trim()}`));
    });
  });
}

export class SubtitleConversionService {
  private readonly database: LocalFlixDatabase;
  private readonly dataDirectory: string;
  private readonly runConversion: NonNullable<SubtitleConversionServiceOptions["runConversion"]>;

  constructor(options: SubtitleConversionServiceOptions) {
    this.database = options.database;
    this.dataDirectory = options.dataDirectory;
    this.runConversion = options.runConversion ?? ffmpegConvert;
  }

  async convert(payload: SubtitleConversionPayload): Promise<{ cached: boolean; absolutePath: string }> {
    if (!/^[A-Za-z0-9-]+$/.test(payload.trackId)) throw new Error("Subtitle track ID is invalid");
    const row = this.database.sqlite
      .prepare(
        `select st.stream_index as streamIndex, st.source_relative_path as sourceRelativePath,
                st.cached_path as cachedPath, lr.path as rootPath,
                mf.relative_path as mediaRelativePath
         from subtitle_tracks st
         join media_files mf on mf.id = st.media_file_id
         join library_roots lr on lr.id = mf.library_root_id
         where st.id = ? and mf.available = 1 and lr.online = 1`
      )
      .get(payload.trackId) as
      | {
          streamIndex: number | null;
          sourceRelativePath: string | null;
          cachedPath: string | null;
          rootPath: string;
          mediaRelativePath: string;
        }
      | undefined;
    if (!row) throw new Error("Subtitle track for conversion was not found");
    const directory = join(this.dataDirectory, "subtitles");
    const absolutePath = join(directory, `${payload.trackId}.vtt`);
    if ((row.cachedPath && existsSync(row.cachedPath)) || existsSync(absolutePath)) {
      return { cached: true, absolutePath: row.cachedPath ?? absolutePath };
    }
    const rootPath = await realpath(row.rootPath);
    const sourcePath = await realpath(join(rootPath, row.sourceRelativePath ?? row.mediaRelativePath));
    const containment = relative(rootPath, sourcePath);
    if (containment === ".." || containment.startsWith(`..${sep}`) || isAbsolute(containment)) {
      throw new Error("Subtitle source resolves outside its configured library root");
    }
    await mkdir(directory, { recursive: true });
    const temporaryPath = join(directory, `.${payload.trackId}-${randomUUID()}.vtt`);
    try {
      await this.runConversion(sourcePath, temporaryPath, row.streamIndex ?? 0);
      await rename(temporaryPath, absolutePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      if (!existsSync(absolutePath)) throw error;
      return { cached: true, absolutePath };
    }
    this.database.sqlite
      .prepare("update subtitle_tracks set cached_path = ? where id = ?")
      .run(absolutePath, payload.trackId);
    return { cached: false, absolutePath };
  }
}
