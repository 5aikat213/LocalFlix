import { describe, expect, it } from "vitest";
import { choosePreviewStartSeconds, previewArguments } from "./preview";

describe("on-demand cinematic previews", () => {
  it("chooses a deterministic safe window without running past the title", () => {
    expect(choosePreviewStartSeconds(20_000, () => 0.8)).toBe(0);
    expect(choosePreviewStartSeconds(120_000, () => 0)).toBe(9);
    expect(choosePreviewStartSeconds(120_000, () => 1)).toBe(81);
  });

  it("builds a bounded fragmented MP4 transcode that writes only to stdout", () => {
    const args = previewArguments({
      absolutePath: "/movies/Arrival/movie.mkv",
      startSeconds: 42
    });
    expect(args).toEqual(expect.arrayContaining([
      "-ss", "42", "-i", "/movies/Arrival/movie.mkv",
      "-t", "30", "-an", "-c:v", "libx264",
      "-movflags", "frag_keyframe+empty_moov+default_base_moof",
      "-f", "mp4", "pipe:1"
    ]));
    expect(args.join(" ")).toContain("scale=1280:720");
    expect(args.some((arg) => /cache|preview\.mp4/.test(arg))).toBe(false);
  });
});
