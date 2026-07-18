import { basename, extname } from "node:path";
import { normalizeCatalogText, parseEpisodeCandidate } from "./release-parser";

export type SubtitleMediaIdentity =
  | { kind: "movie"; title: string; year: number | null }
  | { kind: "episode"; seriesTitle: string; season: number; episode: number };

export interface SubtitleMatch {
  score: number;
  accepted: boolean;
  language: string | null;
  reasons: string[];
}

const subtitleLanguages: Record<string, string> = {
  en: "en",
  eng: "en",
  english: "en",
  de: "de",
  deu: "de",
  ger: "de",
  german: "de",
  it: "it",
  ita: "it",
  italian: "it",
  hi: "hi",
  hin: "hi",
  hindi: "hi"
};

function subtitleLanguage(path: string): string | null {
  const tokens = normalizeCatalogText(basename(path)).split(" ");
  for (const token of tokens.reverse()) {
    const language = subtitleLanguages[token];
    if (language) return language;
  }
  return null;
}

function tokenOverlap(expected: string, actual: string): number {
  const expectedTokens = new Set(normalizeCatalogText(expected).split(" ").filter(Boolean));
  const actualTokens = new Set(normalizeCatalogText(actual).split(" ").filter(Boolean));
  if (expectedTokens.size === 0) return 0;
  let matches = 0;
  for (const token of expectedTokens) if (actualTokens.has(token)) matches += 1;
  return matches / expectedTokens.size;
}

export function scoreSubtitle(
  media: SubtitleMediaIdentity,
  subtitlePath: string
): SubtitleMatch {
  const source = basename(subtitlePath, extname(subtitlePath));
  const language = subtitleLanguage(subtitlePath);
  const reasons: string[] = [];

  if (media.kind === "episode") {
    const episode = parseEpisodeCandidate(source);
    if (episode && (episode.season !== media.season || episode.episode !== media.episode)) {
      return { score: 0, accepted: false, language, reasons: ["different episode"] };
    }
    const seriesScore = tokenOverlap(media.seriesTitle, source);
    const identityBonus = episode ? 0.45 : 0;
    const score = Math.min(1, seriesScore * 0.55 + identityBonus);
    if (seriesScore > 0.7) reasons.push("series title matches");
    if (episode) reasons.push("season and episode match");
    return { score, accepted: score >= 0.65, language, reasons };
  }

  const titleScore = tokenOverlap(media.title, source);
  const yearBonus = media.year !== null && source.includes(String(media.year)) ? 0.15 : 0;
  const score = Math.min(1, titleScore * 0.85 + yearBonus);
  if (titleScore > 0.7) reasons.push("movie title matches");
  if (yearBonus > 0) reasons.push("release year matches");
  return { score, accepted: score >= 0.65, language, reasons };
}
