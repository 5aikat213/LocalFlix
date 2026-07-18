import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, realpath, rename, rm } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import type { LocalFlixDatabase } from "@localflix/database";

export interface HlsTranscodePayload {
  mediaFileId: string;
}

interface HlsTranscodeServiceOptions {
  database: LocalFlixDatabase;
  dataDirectory: string;
  runTranscode?: (inputPath: string, outputDirectory: string) => Promise<void>;
}

async function ffmpegTranscode(inputPath: string, outputDirectory: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const manifest = join(outputDirectory, "master.m3u8");
    const segmentPattern = join(outputDirectory, "segment-%05d.ts");
    const child = spawn(
      "ffmpeg",
      [
        "-hide_banner", "-loglevel", "warning", "-y", "-i", inputPath,
        "-map", "0:v:0", "-map", "0:a:0?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-vf", "scale='min(1920,iw)':-2:force_original_aspect_ratio=decrease",
        "-c:a", "aac", "-b:a", "192k", "-ac", "2",
        "-f", "hls", "-hls_time", "6", "-hls_list_size", "0",
        "-hls_playlist_type", "vod", "-hls_segment_filename", segmentPattern,
        manifest
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-16_000);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg HLS transcode failed (${code}): ${stderr.trim()}`));
    });
  });
}

export class HlsTranscodeService {
  private readonly database: LocalFlixDatabase;
  private readonly dataDirectory: string;
  private readonly runTranscode: NonNullable<HlsTranscodeServiceOptions["runTranscode"]>;

  constructor(options: HlsTranscodeServiceOptions) {
    this.database = options.database;
    this.dataDirectory = options.dataDirectory;
    this.runTranscode = options.runTranscode ?? ffmpegTranscode;
  }

  async transcode(payload: HlsTranscodePayload): Promise<{ cached: boolean }> {
    const row = this.database.sqlite
      .prepare(
        `select lr.path as rootPath, mf.relative_path as relativePath, mf.fingerprint
         from media_files mf join library_roots lr on lr.id = mf.library_root_id
         where mf.id = ? and mf.available = 1 and lr.online = 1`
      )
      .get(payload.mediaFileId) as
      | { rootPath: string; relativePath: string; fingerprint: string }
      | undefined;
    if (!row) throw new Error("Media file for HLS transcode was not found");
    if (!/^[A-Za-z0-9._-]+$/.test(row.fingerprint)) throw new Error("Media fingerprint is invalid");

    const parent = join(this.dataDirectory, "transcodes");
    const finalDirectory = join(parent, row.fingerprint);
    if (existsSync(join(finalDirectory, "master.m3u8"))) return { cached: true };
    const rootPath = await realpath(row.rootPath);
    const inputPath = await realpath(join(rootPath, row.relativePath));
    const containment = relative(rootPath, inputPath);
    if (containment === ".." || containment.startsWith(`..${sep}`) || isAbsolute(containment)) {
      throw new Error("HLS input resolves outside its configured library root");
    }

    await mkdir(parent, { recursive: true });
    const stagingDirectory = join(parent, `.${row.fingerprint}-${randomUUID()}`);
    await mkdir(stagingDirectory);
    try {
      await this.runTranscode(inputPath, stagingDirectory);
      if (!existsSync(join(stagingDirectory, "master.m3u8"))) {
        throw new Error("ffmpeg did not produce an HLS manifest");
      }
      try {
        await rename(stagingDirectory, finalDirectory);
      } catch (error) {
        if (!existsSync(join(finalDirectory, "master.m3u8"))) throw error;
        await rm(stagingDirectory, { recursive: true, force: true });
        return { cached: true };
      }
      return { cached: false };
    } catch (error) {
      await rm(stagingDirectory, { recursive: true, force: true });
      throw error;
    }
  }
}
