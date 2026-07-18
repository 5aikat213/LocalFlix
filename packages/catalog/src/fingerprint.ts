import { createHash } from "node:crypto";
import { open, stat } from "node:fs/promises";

const defaultSampleBytes = 1024 * 1024;

export async function fingerprintFile(
  path: string,
  sampleBytes = defaultSampleBytes
): Promise<string> {
  const fileStats = await stat(path);
  const sampleSize = Math.min(fileStats.size, sampleBytes);
  const start = Buffer.alloc(sampleSize);
  const end = Buffer.alloc(sampleSize);
  const handle = await open(path, "r");

  try {
    if (sampleSize > 0) {
      await handle.read(start, 0, sampleSize, 0);
      await handle.read(end, 0, sampleSize, Math.max(0, fileStats.size - sampleSize));
    }
  } finally {
    await handle.close();
  }

  return createHash("sha256")
    .update(String(fileStats.size))
    .update("\0")
    .update(start)
    .update("\0")
    .update(end)
    .digest("hex");
}

