import { basename, dirname, extname, sep } from "node:path";

export interface MovieCandidate {
  kind: "movie";
  title: string;
  year: number | null;
  confidence: number;
  sourceName: string;
}

export interface EpisodeCandidate {
  kind: "episode";
  seriesTitle: string;
  season: number;
  episode: number;
  endEpisode: number | null;
  title: string | null;
  confidence: number;
  sourceName: string;
}

const releaseTokens = new Set([
  "2160p",
  "1080p",
  "720p",
  "480p",
  "4k",
  "bluray",
  "brrip",
  "webrip",
  "web-dl",
  "webdl",
  "hdrip",
  "dvdrip",
  "x264",
  "x265",
  "h264",
  "h265",
  "hevc",
  "av1",
  "aac",
  "ac3",
  "dts",
  "hdr",
  "remux"
]);

function withoutExtension(value: string): string {
  const name = basename(value);
  return name.slice(0, Math.max(0, name.length - extname(name).length));
}

function humanize(value: string): string {
  return value
    .replace(/[._]+/g, " ")
    .replace(/[\[\](){}]+/g, " ")
    .replace(/\s+-\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeReleaseSuffix(value: string): string {
  const words = humanize(value).split(" ");
  const releaseIndex = words.findIndex((word) => {
    const normalized = word.toLowerCase().replace(/[^a-z0-9-]/g, "");
    return (
      releaseTokens.has(normalized) ||
      /^(?:aac|dts|ddp?|ac3)\d/.test(normalized) ||
      /^(?:yify|yts|galaxyrg|tgx)$/.test(normalized)
    );
  });
  return (releaseIndex === -1 ? words : words.slice(0, releaseIndex)).join(" ").trim();
}

function validTitle(value: string, fallback: string): string {
  const cleaned = humanize(value).replace(/^[\s-]+|[\s-]+$/g, "");
  return cleaned || humanize(fallback);
}

export function parseMovieCandidate(path: string): MovieCandidate {
  const sourceName = withoutExtension(path);
  const readable = humanize(sourceName);
  const yearMatch = readable.match(/(?:^|\s)((?:19|20)\d{2})(?=\s|$)/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const titleSource = yearMatch
    ? readable.slice(0, yearMatch.index).trim()
    : removeReleaseSuffix(readable);

  return {
    kind: "movie",
    title: validTitle(titleSource, sourceName),
    year,
    confidence: year === null ? 0.55 : 0.9,
    sourceName
  };
}

function cleanEpisodeTitle(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = removeReleaseSuffix(value);
  return cleaned.length > 0 ? cleaned : null;
}

export function parseEpisodeCandidate(path: string): EpisodeCandidate | null {
  const sourceName = withoutExtension(path);
  const readable = humanize(sourceName);
  const standard = readable.match(
    /^(.*?)\s*S(\d{1,2})E(\d{1,3})(?:\s*(?:E|-E?)(\d{1,3}))?(?:\s+(.*))?$/i
  );
  if (standard) {
    return {
      kind: "episode",
      seriesTitle: validTitle(standard[1] ?? "", dirname(path)),
      season: Number(standard[2]),
      episode: Number(standard[3]),
      endEpisode: standard[4] ? Number(standard[4]) : null,
      title: cleanEpisodeTitle(standard[5]),
      confidence: 0.98,
      sourceName
    };
  }

  const alternate = readable.match(/^(.*?)\s+(\d{1,2})x(\d{1,3})(?:\s+(.*))?$/i);
  if (alternate) {
    return {
      kind: "episode",
      seriesTitle: validTitle(alternate[1] ?? "", dirname(path)),
      season: Number(alternate[2]),
      episode: Number(alternate[3]),
      endEpisode: null,
      title: cleanEpisodeTitle(alternate[4]),
      confidence: 0.96,
      sourceName
    };
  }

  const parts = path.split(/[\\/]/).filter(Boolean);
  const seasonIndex = parts.findIndex((part) => /^season[ ._-]*\d{1,2}$/i.test(part));
  const episodeMatch = readable.match(/^episode\s*(\d{1,3})(?:\s+(.*))?$/i);
  if (seasonIndex >= 0 && episodeMatch) {
    const seasonMatch = parts[seasonIndex]?.match(/\d{1,2}/);
    const seriesPart = parts[seasonIndex - 1];
    if (seasonMatch && seriesPart) {
      return {
        kind: "episode",
        seriesTitle: humanize(seriesPart),
        season: Number(seasonMatch[0]),
        episode: Number(episodeMatch[1]),
        endEpisode: null,
        title: cleanEpisodeTitle(episodeMatch[2]),
        confidence: 0.86,
        sourceName
      };
    }
  }

  return null;
}

export function normalizeCatalogText(value: string): string {
  return humanize(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function toPosixPath(value: string): string {
  return value.split(sep).join("/");
}

