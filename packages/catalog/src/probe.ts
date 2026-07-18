interface RawDisposition {
  default?: number;
  forced?: number;
}

interface RawStream {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  channels?: number;
  color_transfer?: string;
  disposition?: RawDisposition;
  tags?: Record<string, string>;
}

interface RawProbe {
  format?: { format_name?: string; duration?: string };
  streams?: RawStream[];
}

export interface NormalizedAudioTrack {
  streamIndex: number;
  language: string | null;
  label: string;
  codec: string;
  channels: number | null;
  isDefault: boolean;
}

export interface NormalizedSubtitleTrack {
  streamIndex: number;
  language: string | null;
  label: string;
  format: string;
  isDefault: boolean;
  forced: boolean;
}

export interface MediaProbe {
  container: string | null;
  durationMs: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  hdr: "hdr10" | "hlg" | null;
  audioTracks: NormalizedAudioTrack[];
  subtitleTracks: NormalizedSubtitleTrack[];
  raw: RawProbe;
}

const languageCodes: Record<string, string> = {
  eng: "en",
  deu: "de",
  ger: "de",
  ita: "it",
  fra: "fr",
  fre: "fr",
  spa: "es",
  hin: "hi",
  ben: "bn",
  jpn: "ja",
  kor: "ko"
};

export function normalizeLanguage(value: string | undefined): string | null {
  if (!value || value === "und") return null;
  const normalized = value.toLowerCase();
  return languageCodes[normalized] ?? normalized.slice(0, 2);
}

export function parseFfprobeJson(input: unknown): MediaProbe {
  if (typeof input !== "object" || input === null) {
    throw new Error("ffprobe returned a non-object response");
  }
  const raw = input as RawProbe;
  const streams = Array.isArray(raw.streams) ? raw.streams : [];
  const videoStreams = streams.filter((stream) => stream.codec_type === "video");
  const audioStreams = streams.filter((stream) => stream.codec_type === "audio");
  const primaryVideo =
    videoStreams.find((stream) => stream.disposition?.default === 1) ?? videoStreams[0];
  const primaryAudio =
    audioStreams.find((stream) => stream.disposition?.default === 1) ?? audioStreams[0];
  const duration = Number(raw.format?.duration);

  return {
    container: raw.format?.format_name?.split(",")[0] ?? null,
    durationMs: Number.isFinite(duration) ? Math.round(duration * 1000) : null,
    videoCodec: primaryVideo?.codec_name ?? null,
    audioCodec: primaryAudio?.codec_name ?? null,
    width: primaryVideo?.width ?? null,
    height: primaryVideo?.height ?? null,
    hdr:
      primaryVideo?.color_transfer === "smpte2084"
        ? "hdr10"
        : primaryVideo?.color_transfer === "arib-std-b67"
          ? "hlg"
          : null,
    audioTracks: audioStreams.flatMap((stream) =>
      typeof stream.index === "number" && stream.codec_name
        ? [
            {
              streamIndex: stream.index,
              language: normalizeLanguage(stream.tags?.language),
              label: stream.tags?.title ?? stream.tags?.language ?? `Audio ${stream.index}`,
              codec: stream.codec_name,
              channels: stream.channels ?? null,
              isDefault: stream.disposition?.default === 1
            }
          ]
        : []
    ),
    subtitleTracks: streams
      .filter((stream) => stream.codec_type === "subtitle")
      .flatMap((stream) =>
        typeof stream.index === "number" && stream.codec_name
          ? [
              {
                streamIndex: stream.index,
                language: normalizeLanguage(stream.tags?.language),
                label:
                  stream.tags?.title ?? stream.tags?.language ?? `Subtitle ${stream.index}`,
                format: stream.codec_name,
                isDefault: stream.disposition?.default === 1,
                forced: stream.disposition?.forced === 1
              }
            ]
          : []
      ),
    raw
  };
}

export async function probeMedia(
  path: string,
  options: { ffprobePath?: string; signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<MediaProbe> {
  const ffprobePath = options.ffprobePath ?? "ffprobe";
  const timeoutMs = options.timeoutMs ?? 30_000;

  return await new Promise<MediaProbe>((resolve, reject) => {
    const child = spawn(
      ffprobePath,
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", path],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    const abort = () => child.kill("SIGTERM");
    options.signal?.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 10 * 1024 * 1024) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (options.signal?.aborted) {
        reject(new Error(`ffprobe was aborted for ${path}`));
      } else if (code !== 0) {
        reject(new Error(`ffprobe failed for ${path}: ${stderr.trim()}`));
      } else {
        try {
          resolve(parseFfprobeJson(JSON.parse(stdout) as unknown));
        } catch (error) {
          reject(error);
        }
      }
    });
  });
}
import { spawn } from "node:child_process";
