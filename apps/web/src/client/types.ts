export interface Profile {
  id: string;
  name: string;
  avatar: string;
}

export interface CatalogCard {
  id: string;
  kind: "movie" | "series";
  title: string;
  releaseYear: number | null;
  overview: string;
  runtimeMs: number | null;
  originalLanguage: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  mediaFileId: string | null;
  progress: number | null;
}

export interface CatalogRail {
  id: string;
  title: string;
  reason?: string;
  items: CatalogCard[];
}

export interface HomeCatalog {
  hero: CatalogCard | null;
  rails: CatalogRail[];
}

export interface SubtitleTrack {
  id: string;
  language: string | null;
  label: string;
  format: string;
  isDefault: boolean;
  forced: boolean;
  url: string;
}

export interface MediaFileDetails {
  id: string;
  relativePath: string;
  durationMs: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  hdr: string | null;
  previewUrl: string;
  subtitles: SubtitleTrack[];
}

export interface SimilarCatalogCard extends CatalogCard {
  score: number;
  reason: string;
}

export interface MediaDetails {
  id: string;
  kind: "movie" | "series";
  title: string;
  releaseYear: number | null;
  overview: string;
  runtimeMs: number | null;
  originalLanguage: string | null;
  genres: string[];
  collections: Array<{
    id: string;
    name: string;
    kind: "franchise" | "universe" | "curated";
    overview: string;
    position: number | null;
  }>;
  directors: string[];
  cast: Array<{ name: string; character: string | null }>;
  trailers: Array<{ title: string; youtubeUrl: string; official: boolean }>;
  files: MediaFileDetails[];
  similar: SimilarCatalogCard[];
  seasons: Array<{
    id: string;
    seasonNumber: number;
    title: string | null;
    episodes: Array<{ id: string; episodeNumber: number; title: string; mediaFileId: string | null }>;
  }>;
}
