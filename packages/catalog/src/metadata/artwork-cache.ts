import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { imageSize } from "image-size";
import ipaddr from "ipaddr.js";

export interface CacheArtworkInput {
  url: string;
  dataDirectory: string;
  fetchImpl?: typeof fetch;
  resolveHost?: (
    hostname: string
  ) => Promise<Array<{ address: string; family: number }>>;
  maximumBytes?: number;
}

export interface CachedArtwork {
  localPath: string;
  sourceUrl: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
}

function isPublicAddress(address: string): boolean {
  try {
    let parsed = ipaddr.parse(address);
    if (parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) {
      parsed = parsed.toIPv4Address();
    }
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}

async function defaultResolveHost(
  hostname: string
): Promise<Array<{ address: string; family: number }>> {
  return await lookup(hostname, { all: true });
}

async function assertSafeUrl(
  value: string,
  resolveHost: NonNullable<CacheArtworkInput["resolveHost"]>
): Promise<URL> {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Artwork URL must use safe HTTPS transport");
  }
  const addresses = await resolveHost(url.hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("Artwork URL does not resolve to a safe public address");
  }
  return url;
}

async function readLimited(response: Response, maximumBytes: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new Error(`Artwork exceeds ${maximumBytes} bytes`);
  }
  if (!response.body) throw new Error("Artwork response has no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new Error(`Artwork exceeds ${maximumBytes} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

export async function cacheArtwork(input: CacheArtworkInput): Promise<CachedArtwork> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const resolveHost = input.resolveHost ?? defaultResolveHost;
  const maximumBytes = input.maximumBytes ?? 15 * 1024 * 1024;
  let url = await assertSafeUrl(input.url, resolveHost);
  let response: Response | null = null;

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    response = await fetchImpl(url, { redirect: "manual" });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get("location");
    if (!location || redirects === 3) throw new Error("Artwork redirect limit exceeded");
    url = await assertSafeUrl(new URL(location, url).toString(), resolveHost);
  }
  if (!response?.ok) {
    throw new Error(`Artwork download failed with status ${response?.status ?? "unknown"}`);
  }
  const bytes = await readLimited(response, maximumBytes);
  const fileType = await fileTypeFromBuffer(bytes);
  if (!fileType || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(fileType.mime)) {
    throw new Error("Artwork response is not a supported image");
  }
  const dimensions = imageSize(bytes);
  if (!dimensions.width || !dimensions.height) {
    throw new Error("Artwork dimensions could not be decoded");
  }

  const directory = join(input.dataDirectory, "artwork");
  await mkdir(directory, { recursive: true });
  const hash = createHash("sha256").update(bytes).digest("hex");
  const localPath = join(directory, `${hash}.${fileType.ext}`);
  const temporaryPath = join(directory, `.${hash}.${randomUUID()}.tmp`);
  await writeFile(temporaryPath, bytes, { flag: "wx" });
  try {
    await rename(temporaryPath, localPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST") throw error;
  }

  return {
    localPath,
    sourceUrl: input.url,
    mimeType: fileType.mime,
    width: dimensions.width,
    height: dimensions.height,
    bytes: bytes.length
  };
}
