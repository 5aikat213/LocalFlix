import { realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, sep } from "node:path";
import type { LocalFlixDatabase } from "@localflix/database";

export async function resolveArtwork(
  database: LocalFlixDatabase,
  mediaItemId: string,
  kind: string,
  dataDirectory: string
): Promise<{ absolutePath: string; contentType: string; sizeBytes: number }> {
  if (!/^(poster|backdrop|logo)$/.test(kind)) throw new Error("Artwork kind is invalid");
  const row = database.sqlite
    .prepare(
      `select local_path as localPath from artwork
       where media_item_id = ? and kind = ? order by created_at desc limit 1`
    )
    .get(mediaItemId, kind) as { localPath: string } | undefined;
  if (!row) throw new Error("Artwork was not found");
  const cacheRoot = await realpath(join(dataDirectory, "artwork"));
  const absolutePath = await realpath(row.localPath);
  const containment = relative(cacheRoot, absolutePath);
  if (containment === ".." || containment.startsWith(`..${sep}`) || isAbsolute(containment)) {
    throw new Error("Artwork resolves outside its cache");
  }
  const info = await stat(absolutePath);
  const contentTypes: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".webp": "image/webp", ".avif": "image/avif"
  };
  return {
    absolutePath,
    contentType: contentTypes[extname(absolutePath).toLowerCase()] ?? "application/octet-stream",
    sizeBytes: info.size
  };
}
