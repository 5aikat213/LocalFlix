import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverRoot } from "./discovery";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("media discovery", () => {
  it("discovers nested videos and subtitles while ignoring junk", async () => {
    const rootPath = mkdtempSync(join(tmpdir(), "localflix-discovery-"));
    temporaryDirectories.push(rootPath);
    mkdirSync(join(rootPath, "Movie", "Subs"), { recursive: true });
    mkdirSync(join(rootPath, ".parts"), { recursive: true });
    writeFileSync(join(rootPath, "Movie", "Film.2020.mkv"), "video");
    writeFileSync(join(rootPath, "Movie", "Subs", "Film.2020.eng.srt"), "subtitle");
    writeFileSync(join(rootPath, "Movie", "readme.txt"), "junk");
    writeFileSync(join(rootPath, ".parts", "partial.mp4"), "partial");

    const files = [];
    for await (const file of discoverRoot(
      { id: "root", kind: "movie", path: rootPath },
      { minimumVideoBytes: 0 }
    )) {
      files.push(file);
    }

    expect(files.map((file) => [file.kind, file.relativePath])).toEqual([
      ["video", "Movie/Film.2020.mkv"],
      ["subtitle", "Movie/Subs/Film.2020.eng.srt"]
    ]);
  });
});
