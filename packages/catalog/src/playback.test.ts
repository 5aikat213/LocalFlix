import { describe, expect, it } from "vitest";
import { decidePlayback } from "./playback";

describe("playback decisions", () => {
  it("direct-plays browser-native MP4 media", () => {
    expect(
      decidePlayback({ container: "mov,mp4,m4a", videoCodec: "h264", audioCodec: "aac" })
    ).toEqual({ mode: "direct", reason: "browser-native H.264/AAC MP4" });
  });

  it("uses HLS for Matroska and unsupported codecs", () => {
    expect(
      decidePlayback({ container: "matroska", videoCodec: "hevc", audioCodec: "aac" })
    ).toMatchObject({ mode: "hls" });
  });
});
