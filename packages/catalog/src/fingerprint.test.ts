import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fingerprintFile } from "./fingerprint";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("media fingerprints", () => {
  it("is stable across path moves and changes when bounded content changes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "localflix-fingerprint-"));
    temporaryDirectories.push(directory);
    const first = join(directory, "first.mkv");
    const moved = join(directory, "moved.mkv");
    const different = join(directory, "different.mkv");
    writeFileSync(first, "same-media-content");
    writeFileSync(moved, "same-media-content");
    writeFileSync(different, "same-media-contenX");

    expect(await fingerprintFile(moved)).toBe(await fingerprintFile(first));
    expect(await fingerprintFile(different)).not.toBe(await fingerprintFile(first));
  });
});
