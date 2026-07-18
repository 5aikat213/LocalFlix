import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";

export interface CreateLibraryRootInput {
  kind: "movie" | "series";
  path: string;
}

export interface LibraryRootRow extends CreateLibraryRootInput {
  id: string;
  enabled: boolean;
  online: boolean;
  lastScanAt: number | null;
}

export interface CreateMediaItemInput {
  kind: "movie" | "series";
  title: string;
  releaseYear?: number | null;
}

export interface MediaItemRow extends CreateMediaItemInput {
  id: string;
}

export interface CreateMediaFileInput {
  libraryRootId: string;
  mediaItemId?: string | null;
  episodeId?: string | null;
  relativePath: string;
  fingerprint: string;
  sizeBytes: number;
  modifiedAtMs: number;
}

export interface MediaFileRow extends CreateMediaFileInput {
  id: string;
  available: boolean;
  container?: string | null;
  durationMs?: number | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  width?: number | null;
  height?: number | null;
  hdr?: string | null;
  lastSeenScanId?: string | null;
}

export interface ApplyMetadataInput {
  canonicalTitle: string;
  releaseYear: number | null;
  overview: string;
  runtimeMinutes: number | null;
  originalLanguage: string | null;
  genres: string[];
  collections?: Array<{
    name: string;
    kind: "franchise" | "universe" | "curated";
    position: number | null;
    overview: string;
  }>;
  directors: string[];
  cast: Array<{ name: string; character?: string | null }>;
  artwork: Array<{
    kind: "poster" | "backdrop" | "logo";
    localPath: string;
    sourceUrl?: string | null;
    sourcePageUrl?: string | null;
    width?: number | null;
    height?: number | null;
  }>;
  trailers: Array<{ title: string; youtubeUrl: string; official: boolean }>;
  source: string;
  confidence: number;
}

export interface MediaItemDetails {
  id: string;
  kind: "movie" | "series";
  title: string;
  releaseYear: number | null;
  overview: string;
  runtimeMs: number | null;
  originalLanguage: string | null;
  metadataState: "draft" | "matched" | "unmatched";
  metadataSource: string | null;
  confidence: number;
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
  artwork: Array<{
    kind: "poster" | "backdrop" | "logo";
    localPath: string;
    sourceUrl: string | null;
    sourcePageUrl: string | null;
    width: number | null;
    height: number | null;
  }>;
  trailers: Array<{ title: string; youtubeUrl: string; official: boolean }>;
}

export interface EnrichmentCandidateRow {
  itemId: string;
  candidate: {
    kind: "movie" | "series";
    title: string;
    year: number | null;
  };
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sortTitle(value: string): string {
  return value.replace(/^(the|a|an)\s+/i, "");
}

export class CatalogRepository {
  constructor(private readonly sqlite: BetterSqlite3.Database) {}

  createLibraryRoot(input: CreateLibraryRootInput): LibraryRootRow {
    const row: LibraryRootRow = {
      id: randomUUID(),
      ...input,
      enabled: true,
      online: true,
      lastScanAt: null
    };
    this.sqlite
      .prepare(
        `insert into library_roots (id, kind, path, enabled, online)
         values (@id, @kind, @path, 1, 1)`
      )
      .run(row);
    return row;
  }

  createMediaItem(input: CreateMediaItemInput): MediaItemRow {
    const row: MediaItemRow = { id: randomUUID(), ...input };
    this.sqlite
      .prepare(
        `insert into media_items
          (id, kind, title, normalized_title, sort_title, release_year)
         values (@id, @kind, @title, @normalizedTitle, @sortTitle, @releaseYear)`
      )
      .run({
        ...row,
        normalizedTitle: normalize(row.title),
        sortTitle: sortTitle(row.title),
        releaseYear: row.releaseYear ?? null
      });
    return row;
  }

  createMediaFile(input: CreateMediaFileInput): MediaFileRow {
    const row: MediaFileRow = { id: randomUUID(), ...input, available: true };
    this.sqlite
      .prepare(
        `insert into media_files
          (id, library_root_id, media_item_id, episode_id, relative_path,
           fingerprint, size_bytes, modified_at_ms, available)
         values
          (@id, @libraryRootId, @mediaItemId, @episodeId, @relativePath,
           @fingerprint, @sizeBytes, @modifiedAtMs, 1)`
      )
      .run({
        ...row,
        mediaItemId: row.mediaItemId ?? null,
        episodeId: row.episodeId ?? null
      });
    return row;
  }

  listLibraryRoots(): LibraryRootRow[] {
    const rows = this.sqlite
      .prepare(
        `select id, kind, path, enabled, online, last_scan_at as lastScanAt
         from library_roots order by created_at asc`
      )
      .all() as Array<Omit<LibraryRootRow, "enabled" | "online"> & {
      enabled: number;
      online: number;
    }>;
    return rows.map((row) => ({
      ...row,
      kind: row.kind as LibraryRootRow["kind"],
      enabled: row.enabled === 1,
      online: row.online === 1
    }));
  }

  findLibraryRoot(kind: "movie" | "series", path: string): LibraryRootRow | null {
    return this.listLibraryRoots().find((root) => root.kind === kind && root.path === path) ?? null;
  }

  setLibraryRootOnline(id: string, online: boolean): void {
    this.sqlite
      .prepare("update library_roots set online = ?, updated_at = ? where id = ?")
      .run(online ? 1 : 0, Date.now(), id);
  }

  completeLibraryRootScan(id: string, completedAt = Date.now()): void {
    this.sqlite
      .prepare("update library_roots set last_scan_at = ?, updated_at = ? where id = ?")
      .run(completedAt, completedAt, id);
  }

  listMediaItems(): MediaItemRow[] {
    return this.sqlite
      .prepare(
        `select id, kind, title, release_year as releaseYear
         from media_items order by created_at asc`
      )
      .all() as MediaItemRow[];
  }

  listEnrichmentCandidates(): EnrichmentCandidateRow[] {
    return this.readEnrichmentCandidates("where metadata_state = 'draft'");
  }

  listAllEnrichmentCandidates(): EnrichmentCandidateRow[] {
    return this.readEnrichmentCandidates("");
  }

  private readEnrichmentCandidates(whereClause: string): EnrichmentCandidateRow[] {
    const rows = this.sqlite
      .prepare(
        `select id as itemId, kind, title, release_year as year
         from media_items ${whereClause} order by created_at`
      )
      .all() as Array<{
      itemId: string;
      kind: "movie" | "series";
      title: string;
      year: number | null;
    }>;
    return rows.map(({ itemId, kind, title, year }) => ({
      itemId,
      candidate: { kind, title, year }
    }));
  }

  findMediaItem(
    kind: "movie" | "series",
    title: string,
    releaseYear?: number | null
  ): MediaItemRow | null {
    const normalizedTitle = normalize(title);
    const row = this.sqlite
      .prepare(
        `select id, kind, title, release_year as releaseYear
         from media_items
         where kind = @kind and normalized_title = @normalizedTitle
           and ((release_year is null and @releaseYear is null) or release_year = @releaseYear)
         order by created_at asc limit 1`
      )
      .get({ kind, normalizedTitle, releaseYear: releaseYear ?? null }) as
      | MediaItemRow
      | undefined;
    return row ?? null;
  }

  findOrCreateMediaItem(input: CreateMediaItemInput): MediaItemRow {
    return this.findMediaItem(input.kind, input.title, input.releaseYear) ?? this.createMediaItem(input);
  }

  applyMetadata(mediaItemId: string, input: ApplyMetadataInput): void {
    this.sqlite.transaction(() => {
      const now = Date.now();
      const updated = this.sqlite
        .prepare(
          `update media_items set
             title = @title, normalized_title = @normalizedTitle,
             sort_title = @sortTitle, overview = @overview,
             release_year = @releaseYear, runtime_ms = @runtimeMs,
             original_language = @originalLanguage, metadata_state = 'matched',
             metadata_source = @source, confidence = @confidence, updated_at = @now
           where id = @mediaItemId`
        )
        .run({
          mediaItemId,
          title: input.canonicalTitle,
          normalizedTitle: normalize(input.canonicalTitle),
          sortTitle: sortTitle(input.canonicalTitle),
          overview: input.overview,
          releaseYear: input.releaseYear,
          runtimeMs: input.runtimeMinutes === null ? null : input.runtimeMinutes * 60_000,
          originalLanguage: input.originalLanguage,
          source: input.source,
          confidence: input.confidence,
          now
        });
      if (updated.changes !== 1) throw new Error(`Media item ${mediaItemId} does not exist`);

      this.sqlite.prepare("delete from media_genres where media_item_id = ?").run(mediaItemId);
      this.sqlite.prepare("delete from media_collections where media_item_id = ?").run(mediaItemId);
      this.sqlite.prepare("delete from credits where media_item_id = ?").run(mediaItemId);
      this.sqlite.prepare("delete from artwork where media_item_id = ?").run(mediaItemId);
      this.sqlite.prepare("delete from trailers where media_item_id = ?").run(mediaItemId);

      const insertGenre = this.sqlite.prepare(
        "insert into genres (id, name, slug) values (?, ?, ?) on conflict(slug) do nothing"
      );
      const findGenre = this.sqlite.prepare("select id from genres where slug = ?");
      const attachGenre = this.sqlite.prepare(
        "insert into media_genres (media_item_id, genre_id) values (?, ?)"
      );
      for (const name of [...new Set(input.genres)]) {
        const slug = normalize(name).replace(/\s+/g, "-");
        insertGenre.run(randomUUID(), name, slug);
        const genre = findGenre.get(slug) as { id: string };
        attachGenre.run(mediaItemId, genre.id);
      }

      const upsertCollection = this.sqlite.prepare(
        `insert into collections (id, name, slug, kind, overview, updated_at)
         values (?, ?, ?, ?, ?, ?)
         on conflict(slug) do update set
           name = excluded.name, kind = excluded.kind,
           overview = excluded.overview, updated_at = excluded.updated_at`
      );
      const findCollection = this.sqlite.prepare("select id from collections where slug = ?");
      const attachCollection = this.sqlite.prepare(
        `insert into media_collections (collection_id, media_item_id, position)
         values (?, ?, ?)`
      );
      for (const membership of input.collections ?? []) {
        const slug = normalize(membership.name).replace(/\s+/g, "-");
        upsertCollection.run(
          randomUUID(),
          membership.name,
          slug,
          membership.kind,
          membership.overview ?? "",
          now
        );
        const collection = findCollection.get(slug) as { id: string };
        attachCollection.run(collection.id, mediaItemId, membership.position ?? null);
      }

      const ensurePerson = (name: string): string => {
        const normalizedName = normalize(name);
        const existing = this.sqlite
          .prepare("select id from people where normalized_name = ?")
          .get(normalizedName) as { id: string } | undefined;
        if (existing) return existing.id;
        const id = randomUUID();
        this.sqlite
          .prepare("insert into people (id, name, normalized_name) values (?, ?, ?)")
          .run(id, name, normalizedName);
        return id;
      };
      const insertCredit = this.sqlite.prepare(
        `insert into credits
           (id, media_item_id, person_id, role, character_name, display_order)
         values (?, ?, ?, ?, ?, ?)`
      );
      input.directors.forEach((name, index) => {
        insertCredit.run(randomUUID(), mediaItemId, ensurePerson(name), "director", null, index);
      });
      input.cast.forEach((member, index) => {
        insertCredit.run(
          randomUUID(),
          mediaItemId,
          ensurePerson(member.name),
          "actor",
          member.character ?? null,
          index
        );
      });

      const insertArtwork = this.sqlite.prepare(
        `insert into artwork
           (id, media_item_id, kind, local_path, source_url, source_page_url,
            provider, width, height)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const art of input.artwork) {
        insertArtwork.run(
          randomUUID(), mediaItemId, art.kind, art.localPath, art.sourceUrl ?? null,
          art.sourcePageUrl ?? null, input.source, art.width ?? null, art.height ?? null
        );
      }
      const insertTrailer = this.sqlite.prepare(
        `insert into trailers
           (id, media_item_id, title, youtube_url, official)
         values (?, ?, ?, ?, ?)`
      );
      for (const trailer of input.trailers) {
        insertTrailer.run(
          randomUUID(), mediaItemId, trailer.title, trailer.youtubeUrl,
          trailer.official ? 1 : 0
        );
      }

      const peopleText = [...input.directors, ...input.cast.map(({ name }) => name)].join(" ");
      this.sqlite.prepare("delete from search_documents where media_item_id = ?").run(mediaItemId);
      this.sqlite
        .prepare(
          `insert into search_documents
             (media_item_id, title, people, genres, language, overview)
           values (?, ?, ?, ?, ?, ?)`
        )
        .run(
          mediaItemId,
          input.canonicalTitle,
          peopleText,
          input.genres.join(" "),
          input.originalLanguage ?? "",
          input.overview
        );
    })();
  }

  getMediaItemDetails(id: string): MediaItemDetails | null {
    const row = this.sqlite
      .prepare(
        `select id, kind, title, release_year as releaseYear, overview,
                runtime_ms as runtimeMs, original_language as originalLanguage,
                metadata_state as metadataState, metadata_source as metadataSource,
                confidence
         from media_items where id = ?`
      )
      .get(id) as Omit<MediaItemDetails, "genres" | "collections" | "directors" | "cast" | "artwork" | "trailers"> | undefined;
    if (!row) return null;
    const genres = this.sqlite
      .prepare(
        `select g.name from genres g join media_genres mg on mg.genre_id = g.id
         where mg.media_item_id = ? order by g.name`
      )
      .all(id) as Array<{ name: string }>;
    const collections = this.sqlite
      .prepare(
        `select c.id, c.name, c.kind, c.overview, mc.position
         from collections c join media_collections mc on mc.collection_id = c.id
         where mc.media_item_id = ?
         order by mc.position is null, mc.position, c.name`
      )
      .all(id) as MediaItemDetails["collections"];
    const credits = this.sqlite
      .prepare(
        `select p.name, c.role, c.character_name as character
         from credits c join people p on p.id = c.person_id
         where c.media_item_id = ? order by c.role, c.display_order`
      )
      .all(id) as Array<{ name: string; role: "actor" | "director"; character: string | null }>;
    const artwork = this.sqlite
      .prepare(
        `select kind, local_path as localPath, source_url as sourceUrl,
                source_page_url as sourcePageUrl, width, height
         from artwork where media_item_id = ? order by created_at`
      )
      .all(id) as MediaItemDetails["artwork"];
    const trailers = (this.sqlite
      .prepare(
        `select title, youtube_url as youtubeUrl, official
         from trailers where media_item_id = ? order by created_at`
      )
      .all(id) as Array<Omit<MediaItemDetails["trailers"][number], "official"> & { official: number }>).map(
        (trailer) => ({ ...trailer, official: trailer.official === 1 })
      );
    return {
      ...row,
      genres: genres.map(({ name }) => name),
      collections,
      directors: credits.filter(({ role }) => role === "director").map(({ name }) => name),
      cast: credits
        .filter(({ role }) => role === "actor")
        .map(({ name, character }) => ({ name, character })),
      artwork,
      trailers
    };
  }

  createEpisode(input: {
    seriesId: string;
    season: number;
    episode: number;
    title: string | null;
  }): { id: string; seasonId: string } {
    return this.sqlite.transaction(() => {
      let season = this.sqlite
        .prepare("select id from seasons where series_id = ? and season_number = ?")
        .get(input.seriesId, input.season) as { id: string } | undefined;
      if (!season) {
        season = { id: randomUUID() };
        this.sqlite
          .prepare(
            "insert into seasons (id, series_id, season_number, title) values (?, ?, ?, ?)"
          )
          .run(season.id, input.seriesId, input.season, `Season ${input.season}`);
      }
      let episode = this.sqlite
        .prepare("select id from episodes where season_id = ? and episode_number = ?")
        .get(season.id, input.episode) as { id: string } | undefined;
      if (!episode) {
        episode = { id: randomUUID() };
        this.sqlite
          .prepare(
            `insert into episodes
              (id, series_id, season_id, episode_number, title)
             values (?, ?, ?, ?, ?)`
          )
          .run(
            episode.id,
            input.seriesId,
            season.id,
            input.episode,
            input.title ?? `Episode ${input.episode}`
          );
      }
      return { id: episode.id, seasonId: season.id };
    })();
  }

  listMediaFiles(): MediaFileRow[] {
    const rows = this.sqlite
      .prepare(
        `select id, library_root_id as libraryRootId, media_item_id as mediaItemId,
                episode_id as episodeId, relative_path as relativePath, fingerprint,
                size_bytes as sizeBytes, modified_at_ms as modifiedAtMs, available,
                container, duration_ms as durationMs, video_codec as videoCodec,
                audio_codec as audioCodec, width, height, hdr,
                last_seen_scan_id as lastSeenScanId
         from media_files order by created_at asc`
      )
      .all() as Array<Omit<MediaFileRow, "available"> & { available: number }>;
    return rows.map((row) => ({ ...row, available: row.available === 1 }));
  }

  findMediaFileByFingerprint(libraryRootId: string, fingerprint: string): MediaFileRow | null {
    return (
      this.listMediaFiles().find(
        (file) => file.libraryRootId === libraryRootId && file.fingerprint === fingerprint
      ) ?? null
    );
  }

  touchMediaFile(
    id: string,
    input: { relativePath: string; sizeBytes: number; modifiedAtMs: number; scanId: string }
  ): void {
    this.sqlite
      .prepare(
        `update media_files
         set relative_path = @relativePath, size_bytes = @sizeBytes,
             modified_at_ms = @modifiedAtMs, available = 1,
             last_seen_scan_id = @scanId, updated_at = @now
         where id = @id`
      )
      .run({ id, ...input, now: Date.now() });
  }

  updateMediaFileProbe(
    id: string,
    probe: {
      container: string | null;
      durationMs: number | null;
      videoCodec: string | null;
      audioCodec: string | null;
      width: number | null;
      height: number | null;
      hdr: string | null;
      raw: unknown;
    }
  ): void {
    this.sqlite
      .prepare(
        `update media_files
         set container = @container, duration_ms = @durationMs,
             video_codec = @videoCodec, audio_codec = @audioCodec,
             width = @width, height = @height, hdr = @hdr,
             probe_json = @probeJson, updated_at = @now
         where id = @id`
      )
      .run({ ...probe, id, probeJson: JSON.stringify(probe.raw), now: Date.now() });
  }

  replaceMediaTracks(
    mediaFileId: string,
    input: {
      audioTracks: Array<{
        streamIndex: number;
        language: string | null;
        label: string;
        codec: string;
        channels: number | null;
        isDefault: boolean;
      }>;
      subtitleTracks: Array<{
        streamIndex: number;
        language: string | null;
        label: string;
        format: string;
        isDefault: boolean;
        forced: boolean;
      }>;
    }
  ): void {
    this.sqlite.transaction(() => {
      this.sqlite.prepare("delete from audio_tracks where media_file_id = ?").run(mediaFileId);
      this.sqlite
        .prepare("delete from subtitle_tracks where media_file_id = ? and stream_index is not null")
        .run(mediaFileId);
      const audioInsert = this.sqlite.prepare(
        `insert into audio_tracks
           (id, media_file_id, stream_index, language, label, codec, channels, is_default)
         values (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const track of input.audioTracks) {
        audioInsert.run(
          randomUUID(), mediaFileId, track.streamIndex, track.language, track.label,
          track.codec, track.channels, track.isDefault ? 1 : 0
        );
      }
      const subtitleInsert = this.sqlite.prepare(
        `insert into subtitle_tracks
           (id, media_file_id, stream_index, language, label, format, is_default, forced)
         values (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const track of input.subtitleTracks) {
        subtitleInsert.run(
          randomUUID(), mediaFileId, track.streamIndex, track.language, track.label,
          track.format, track.isDefault ? 1 : 0, track.forced ? 1 : 0
        );
      }
    })();
  }

  replaceExternalSubtitleTracks(
    mediaFileId: string,
    tracks: Array<{
      relativePath: string;
      language: string | null;
      label: string;
      format: string;
    }>
  ): void {
    this.sqlite.transaction(() => {
      this.sqlite
        .prepare("delete from subtitle_tracks where media_file_id = ? and stream_index is null")
        .run(mediaFileId);
      const insert = this.sqlite.prepare(
        `insert into subtitle_tracks
           (id, media_file_id, language, label, format, source_relative_path)
         values (?, ?, ?, ?, ?, ?)`
      );
      for (const track of tracks) {
        insert.run(
          randomUUID(), mediaFileId, track.language, track.label, track.format, track.relativePath
        );
      }
    })();
  }

  markRootFilesMissing(libraryRootId: string, scanId: string): void {
    this.sqlite
      .prepare(
        `update media_files set available = 0, updated_at = @now
         where library_root_id = @libraryRootId
           and (last_seen_scan_id is null or last_seen_scan_id != @scanId)`
      )
      .run({ libraryRootId, scanId, now: Date.now() });
  }
}
