export interface PlaybackMediaCapabilities {
  container: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
}

export type PlaybackDecision =
  | { mode: "direct"; reason: string }
  | { mode: "hls"; reason: string };

export function decidePlayback(media: PlaybackMediaCapabilities): PlaybackDecision {
  const containers = new Set((media.container ?? "").toLowerCase().split(","));
  const video = media.videoCodec?.toLowerCase();
  const audio = media.audioCodec?.toLowerCase();
  if ((containers.has("mov") || containers.has("mp4")) && video === "h264" && audio === "aac") {
    return { mode: "direct", reason: "browser-native H.264/AAC MP4" };
  }
  if (containers.has("webm") && ["vp8", "vp9", "av1"].includes(video ?? "") && audio === "opus") {
    return { mode: "direct", reason: "browser-native WebM" };
  }
  return {
    mode: "hls",
    reason: `compatibility transcode for ${media.container ?? "unknown container"}/${video ?? "unknown video"}/${audio ?? "unknown audio"}`
  };
}
