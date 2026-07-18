import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

const timestamp = (name: string) =>
  integer(name, { mode: "number" }).notNull().default(sql`(unixepoch() * 1000)`);

export const libraryRoots = sqliteTable(
  "library_roots",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["movie", "series"] }).notNull(),
    path: text("path").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    online: integer("online", { mode: "boolean" }).notNull().default(true),
    lastScanAt: integer("last_scan_at", { mode: "number" }),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at")
  },
  (table) => [uniqueIndex("library_roots_path_kind_idx").on(table.path, table.kind)]
);

export const mediaItems = sqliteTable(
  "media_items",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["movie", "series"] }).notNull(),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    sortTitle: text("sort_title").notNull(),
    originalTitle: text("original_title"),
    overview: text("overview").notNull().default(""),
    releaseYear: integer("release_year"),
    runtimeMs: integer("runtime_ms"),
    originalLanguage: text("original_language"),
    contentRating: text("content_rating"),
    metadataState: text("metadata_state", {
      enum: ["draft", "matched", "unmatched"]
    })
      .notNull()
      .default("draft"),
    metadataSource: text("metadata_source"),
    confidence: real("confidence").notNull().default(0),
    fieldsLocked: integer("fields_locked", { mode: "boolean" }).notNull().default(false),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at")
  },
  (table) => [
    index("media_items_title_idx").on(table.normalizedTitle),
    index("media_items_kind_idx").on(table.kind)
  ]
);

export const seasons = sqliteTable(
  "seasons",
  {
    id: text("id").primaryKey(),
    seriesId: text("series_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    seasonNumber: integer("season_number").notNull(),
    title: text("title"),
    overview: text("overview").notNull().default(""),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at")
  },
  (table) => [uniqueIndex("seasons_series_number_idx").on(table.seriesId, table.seasonNumber)]
);

export const episodes = sqliteTable(
  "episodes",
  {
    id: text("id").primaryKey(),
    seriesId: text("series_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    episodeNumber: integer("episode_number").notNull(),
    absoluteNumber: integer("absolute_number"),
    title: text("title").notNull(),
    overview: text("overview").notNull().default(""),
    airDate: text("air_date"),
    runtimeMs: integer("runtime_ms"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at")
  },
  (table) => [uniqueIndex("episodes_season_number_idx").on(table.seasonId, table.episodeNumber)]
);

export const mediaFiles = sqliteTable(
  "media_files",
  {
    id: text("id").primaryKey(),
    libraryRootId: text("library_root_id")
      .notNull()
      .references(() => libraryRoots.id, { onDelete: "restrict" }),
    mediaItemId: text("media_item_id").references(() => mediaItems.id, {
      onDelete: "set null"
    }),
    episodeId: text("episode_id").references(() => episodes.id, { onDelete: "set null" }),
    relativePath: text("relative_path").notNull(),
    fingerprint: text("fingerprint").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    modifiedAtMs: integer("modified_at_ms").notNull(),
    container: text("container"),
    durationMs: integer("duration_ms"),
    videoCodec: text("video_codec"),
    audioCodec: text("audio_codec"),
    width: integer("width"),
    height: integer("height"),
    hdr: text("hdr"),
    available: integer("available", { mode: "boolean" }).notNull().default(true),
    probeJson: text("probe_json"),
    lastSeenScanId: text("last_seen_scan_id"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at")
  },
  (table) => [
    uniqueIndex("media_files_root_fingerprint_idx").on(
      table.libraryRootId,
      table.fingerprint
    ),
    uniqueIndex("media_files_root_path_idx").on(table.libraryRootId, table.relativePath),
    index("media_files_media_item_idx").on(table.mediaItemId),
    index("media_files_episode_idx").on(table.episodeId)
  ]
);

export const subtitleTracks = sqliteTable(
  "subtitle_tracks",
  {
    id: text("id").primaryKey(),
    mediaFileId: text("media_file_id")
      .notNull()
      .references(() => mediaFiles.id, { onDelete: "cascade" }),
    streamIndex: integer("stream_index"),
    language: text("language"),
    label: text("label").notNull(),
    format: text("format").notNull(),
    sourceRelativePath: text("source_relative_path"),
    cachedPath: text("cached_path"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    forced: integer("forced", { mode: "boolean" }).notNull().default(false)
  },
  (table) => [index("subtitle_tracks_media_file_idx").on(table.mediaFileId)]
);

export const audioTracks = sqliteTable(
  "audio_tracks",
  {
    id: text("id").primaryKey(),
    mediaFileId: text("media_file_id")
      .notNull()
      .references(() => mediaFiles.id, { onDelete: "cascade" }),
    streamIndex: integer("stream_index").notNull(),
    language: text("language"),
    label: text("label").notNull(),
    codec: text("codec").notNull(),
    channels: integer("channels"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false)
  },
  (table) => [uniqueIndex("audio_tracks_file_stream_idx").on(table.mediaFileId, table.streamIndex)]
);

export const artwork = sqliteTable(
  "artwork",
  {
    id: text("id").primaryKey(),
    mediaItemId: text("media_item_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["poster", "backdrop", "logo"] }).notNull(),
    localPath: text("local_path").notNull(),
    sourceUrl: text("source_url"),
    sourcePageUrl: text("source_page_url"),
    provider: text("provider").notNull(),
    width: integer("width"),
    height: integer("height"),
    createdAt: timestamp("created_at")
  },
  (table) => [index("artwork_media_item_kind_idx").on(table.mediaItemId, table.kind)]
);

export const trailers = sqliteTable("trailers", {
  id: text("id").primaryKey(),
  mediaItemId: text("media_item_id")
    .notNull()
    .references(() => mediaItems.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  youtubeUrl: text("youtube_url").notNull(),
  official: integer("official", { mode: "boolean" }).notNull().default(false),
  createdAt: timestamp("created_at")
});

export const people = sqliteTable(
  "people",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    imageLocalPath: text("image_local_path"),
    createdAt: timestamp("created_at")
  },
  (table) => [uniqueIndex("people_normalized_name_idx").on(table.normalizedName)]
);

export const credits = sqliteTable(
  "credits",
  {
    id: text("id").primaryKey(),
    mediaItemId: text("media_item_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    personId: text("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["actor", "director", "writer", "creator"] }).notNull(),
    characterName: text("character_name"),
    displayOrder: integer("display_order").notNull().default(0)
  },
  (table) => [index("credits_media_item_idx").on(table.mediaItemId)]
);

export const genres = sqliteTable("genres", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique()
});

export const mediaGenres = sqliteTable(
  "media_genres",
  {
    mediaItemId: text("media_item_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    genreId: text("genre_id")
      .notNull()
      .references(() => genres.id, { onDelete: "cascade" })
  },
  (table) => [primaryKey({ columns: [table.mediaItemId, table.genreId] })]
);

export const collections = sqliteTable("collections", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  kind: text("kind", { enum: ["franchise", "universe", "curated"] }).notNull(),
  overview: text("overview").notNull().default(""),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at")
});

export const mediaCollections = sqliteTable(
  "media_collections",
  {
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    mediaItemId: text("media_item_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    position: integer("position")
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.mediaItemId] }),
    index("media_collections_media_item_idx").on(table.mediaItemId),
    index("media_collections_collection_position_idx").on(
      table.collectionId,
      table.position
    )
  ]
);

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  avatar: text("avatar").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at")
});

export const watchProgress = sqliteTable(
  "watch_progress",
  {
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    mediaFileId: text("media_file_id")
      .notNull()
      .references(() => mediaFiles.id, { onDelete: "cascade" }),
    positionMs: integer("position_ms").notNull(),
    durationMs: integer("duration_ms").notNull(),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
    lastWatchedAt: timestamp("last_watched_at"),
    updatedAt: timestamp("updated_at")
  },
  (table) => [primaryKey({ columns: [table.profileId, table.mediaFileId] })]
);

export const watchEvents = sqliteTable(
  "watch_events",
  {
    id: text("id").primaryKey(),
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    mediaFileId: text("media_file_id")
      .notNull()
      .references(() => mediaFiles.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["start", "progress", "complete"] }).notNull(),
    positionMs: integer("position_ms").notNull(),
    createdAt: timestamp("created_at")
  },
  (table) => [index("watch_events_profile_created_idx").on(table.profileId, table.createdAt)]
);

export const favorites = sqliteTable(
  "favorites",
  {
    profileId: text("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    mediaItemId: text("media_item_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at")
  },
  (table) => [primaryKey({ columns: [table.profileId, table.mediaItemId] })]
);

export const scanRuns = sqliteTable("scan_runs", {
  id: text("id").primaryKey(),
  status: text("status", { enum: ["running", "succeeded", "failed"] }).notNull(),
  discoveredCount: integer("discovered_count").notNull().default(0),
  indexedCount: integer("indexed_count").notNull().default(0),
  errorJson: text("error_json"),
  startedAt: timestamp("started_at"),
  completedAt: integer("completed_at")
});

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    payloadJson: text("payload_json").notNull(),
    status: text("status", {
      enum: ["queued", "running", "succeeded", "failed"]
    })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    progress: real("progress").notNull().default(0),
    availableAt: timestamp("available_at"),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: integer("lease_expires_at"),
    errorJson: text("error_json"),
    createdAt: timestamp("created_at"),
    updatedAt: timestamp("updated_at")
  },
  (table) => [index("jobs_claim_idx").on(table.status, table.availableAt)]
);

export const schema = {
  libraryRoots,
  mediaItems,
  seasons,
  episodes,
  mediaFiles,
  subtitleTracks,
  audioTracks,
  artwork,
  trailers,
  people,
  credits,
  genres,
  mediaGenres,
  collections,
  mediaCollections,
  profiles,
  watchProgress,
  watchEvents,
  favorites,
  scanRuns,
  jobs
};
