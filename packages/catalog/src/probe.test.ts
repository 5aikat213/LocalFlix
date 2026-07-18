import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseFfprobeJson, probeMedia } from "./probe";

const fixtureDirectory = mkdtempSync(join(tmpdir(), "localflix-probe-"));

afterAll(() => rmSync(fixtureDirectory, { recursive: true, force: true }));

describe("ffprobe normalization", () => {
  it("extracts primary video/audio facts and all selectable streams", () => {
    const result = parseFfprobeJson({
      format: { format_name: "matroska,webm", duration: "169.25" },
      streams: [
        {
          index: 0,
          codec_type: "video",
          codec_name: "hevc",
          width: 3840,
          height: 2160,
          color_transfer: "smpte2084",
          disposition: { default: 1 },
          tags: { language: "eng" }
        },
        {
          index: 1,
          codec_type: "audio",
          codec_name: "aac",
          channels: 6,
          disposition: { default: 1 },
          tags: { language: "eng", title: "Surround" }
        },
        {
          index: 2,
          codec_type: "subtitle",
          codec_name: "subrip",
          disposition: { forced: 1 },
          tags: { language: "deu" }
        }
      ]
    });

    expect(result).toMatchObject({
      container: "matroska",
      durationMs: 169_250,
      videoCodec: "hevc",
      audioCodec: "aac",
      width: 3840,
      height: 2160,
      hdr: "hdr10"
    });
    expect(result.audioTracks).toEqual([
      expect.objectContaining({ streamIndex: 1, language: "en", channels: 6 })
    ]);
    expect(result.subtitleTracks).toEqual([
      expect.objectContaining({ streamIndex: 2, language: "de", forced: true })
    ]);
  });

  it("probes a real local media fixture", async () => {
    const mediaPath = join(fixtureDirectory, "fixture.mp4");
    const generated = spawnSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=320x180:d=1",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-shortest",
        "-c:v",
        "mpeg4",
        "-c:a",
        "aac",
        "-y",
        mediaPath
      ],
      { encoding: "utf8" }
    );
    expect(generated.status, generated.stderr).toBe(0);

    await expect(probeMedia(mediaPath)).resolves.toMatchObject({
      videoCodec: "mpeg4",
      audioCodec: "aac",
      width: 320,
      height: 180
    });
  });
});
