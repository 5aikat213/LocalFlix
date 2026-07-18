import type BetterSqlite3 from "better-sqlite3";
import { sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { schema } from "./schema";

export function migrateDatabase(
  sqlite: BetterSqlite3.Database,
  database: BetterSQLite3Database<typeof schema>
): void {
  sqlite.transaction(() => {
    database.run(sql`
      create table if not exists library_roots (
        id text primary key not null,
        kind text not null check (kind in ('movie', 'series')),
        path text not null,
        enabled integer not null default 1,
        online integer not null default 1,
        last_scan_at integer,
        created_at integer not null default (unixepoch() * 1000),
        updated_at integer not null default (unixepoch() * 1000),
        unique(path, kind)
      )
    `);
    database.run(sql`
      create table if not exists media_items (
        id text primary key not null,
        kind text not null check (kind in ('movie', 'series')),
        title text not null,
        normalized_title text not null,
        sort_title text not null,
        original_title text,
        overview text not null default '',
        release_year integer,
        runtime_ms integer,
        original_language text,
        content_rating text,
        metadata_state text not null default 'draft',
        metadata_source text,
        confidence real not null default 0,
        fields_locked integer not null default 0,
        created_at integer not null default (unixepoch() * 1000),
        updated_at integer not null default (unixepoch() * 1000)
      )
    `);
    database.run(sql`create index if not exists media_items_title_idx on media_items(normalized_title)`);
    database.run(sql`create index if not exists media_items_kind_idx on media_items(kind)`);
    database.run(sql`
      create table if not exists seasons (
        id text primary key not null,
        series_id text not null references media_items(id) on delete cascade,
        season_number integer not null,
        title text,
        overview text not null default '',
        created_at integer not null default (unixepoch() * 1000),
        updated_at integer not null default (unixepoch() * 1000),
        unique(series_id, season_number)
      )
    `);
    database.run(sql`
      create table if not exists episodes (
        id text primary key not null,
        series_id text not null references media_items(id) on delete cascade,
        season_id text not null references seasons(id) on delete cascade,
        episode_number integer not null,
        absolute_number integer,
        title text not null,
        overview text not null default '',
        air_date text,
        runtime_ms integer,
        created_at integer not null default (unixepoch() * 1000),
        updated_at integer not null default (unixepoch() * 1000),
        unique(season_id, episode_number)
      )
    `);
    database.run(sql`
      create table if not exists media_files (
        id text primary key not null,
        library_root_id text not null references library_roots(id) on delete restrict,
        media_item_id text references media_items(id) on delete set null,
        episode_id text references episodes(id) on delete set null,
        relative_path text not null,
        fingerprint text not null,
        size_bytes integer not null,
        modified_at_ms integer not null,
        container text,
        duration_ms integer,
        video_codec text,
        audio_codec text,
        width integer,
        height integer,
        hdr text,
        available integer not null default 1,
        probe_json text,
        last_seen_scan_id text,
        created_at integer not null default (unixepoch() * 1000),
        updated_at integer not null default (unixepoch() * 1000),
        unique(library_root_id, fingerprint),
        unique(library_root_id, relative_path)
      )
    `);
    database.run(sql`create index if not exists media_files_media_item_idx on media_files(media_item_id)`);
    database.run(sql`create index if not exists media_files_episode_idx on media_files(episode_id)`);
    database.run(sql`
      create table if not exists subtitle_tracks (
        id text primary key not null,
        media_file_id text not null references media_files(id) on delete cascade,
        stream_index integer,
        language text,
        label text not null,
        format text not null,
        source_relative_path text,
        cached_path text,
        is_default integer not null default 0,
        forced integer not null default 0
      )
    `);
    database.run(sql`
      create table if not exists audio_tracks (
        id text primary key not null,
        media_file_id text not null references media_files(id) on delete cascade,
        stream_index integer not null,
        language text,
        label text not null,
        codec text not null,
        channels integer,
        is_default integer not null default 0,
        unique(media_file_id, stream_index)
      )
    `);
    database.run(sql`
      create table if not exists artwork (
        id text primary key not null,
        media_item_id text not null references media_items(id) on delete cascade,
        kind text not null,
        local_path text not null,
        source_url text,
        source_page_url text,
        provider text not null,
        width integer,
        height integer,
        created_at integer not null default (unixepoch() * 1000)
      )
    `);
    database.run(sql`
      create table if not exists trailers (
        id text primary key not null,
        media_item_id text not null references media_items(id) on delete cascade,
        title text not null,
        youtube_url text not null,
        official integer not null default 0,
        created_at integer not null default (unixepoch() * 1000)
      )
    `);
    database.run(sql`
      create table if not exists people (
        id text primary key not null,
        name text not null,
        normalized_name text not null unique,
        image_local_path text,
        created_at integer not null default (unixepoch() * 1000)
      )
    `);
    database.run(sql`
      create table if not exists credits (
        id text primary key not null,
        media_item_id text not null references media_items(id) on delete cascade,
        person_id text not null references people(id) on delete cascade,
        role text not null,
        character_name text,
        display_order integer not null default 0
      )
    `);
    database.run(sql`
      create table if not exists genres (
        id text primary key not null,
        name text not null unique,
        slug text not null unique
      )
    `);
    database.run(sql`
      create table if not exists media_genres (
        media_item_id text not null references media_items(id) on delete cascade,
        genre_id text not null references genres(id) on delete cascade,
        primary key(media_item_id, genre_id)
      )
    `);
    database.run(sql`
      create table if not exists collections (
        id text primary key not null,
        name text not null unique,
        slug text not null unique,
        kind text not null,
        overview text not null default '',
        created_at integer not null default (unixepoch() * 1000),
        updated_at integer not null default (unixepoch() * 1000)
      )
    `);
    database.run(sql`
      create table if not exists media_collections (
        collection_id text not null references collections(id) on delete cascade,
        media_item_id text not null references media_items(id) on delete cascade,
        position integer,
        primary key(collection_id, media_item_id)
      )
    `);
    database.run(sql`
      create index if not exists media_collections_media_item_idx
      on media_collections(media_item_id)
    `);
    database.run(sql`
      create index if not exists media_collections_order_idx
      on media_collections(collection_id, position)
    `);
    database.run(sql`
      create table if not exists profiles (
        id text primary key not null,
        name text not null,
        avatar text not null,
        created_at integer not null default (unixepoch() * 1000),
        updated_at integer not null default (unixepoch() * 1000)
      )
    `);
    database.run(sql`
      create table if not exists watch_progress (
        profile_id text not null references profiles(id) on delete cascade,
        media_file_id text not null references media_files(id) on delete cascade,
        position_ms integer not null,
        duration_ms integer not null,
        completed integer not null default 0,
        last_watched_at integer not null default (unixepoch() * 1000),
        updated_at integer not null default (unixepoch() * 1000),
        primary key(profile_id, media_file_id)
      )
    `);
    database.run(sql`
      create table if not exists watch_events (
        id text primary key not null,
        profile_id text not null references profiles(id) on delete cascade,
        media_file_id text not null references media_files(id) on delete cascade,
        kind text not null,
        position_ms integer not null,
        created_at integer not null default (unixepoch() * 1000)
      )
    `);
    database.run(sql`
      create table if not exists favorites (
        profile_id text not null references profiles(id) on delete cascade,
        media_item_id text not null references media_items(id) on delete cascade,
        created_at integer not null default (unixepoch() * 1000),
        primary key(profile_id, media_item_id)
      )
    `);
    database.run(sql`
      create table if not exists scan_runs (
        id text primary key not null,
        status text not null,
        discovered_count integer not null default 0,
        indexed_count integer not null default 0,
        error_json text,
        started_at integer not null default (unixepoch() * 1000),
        completed_at integer
      )
    `);
    database.run(sql`
      create table if not exists jobs (
        id text primary key not null,
        type text not null,
        dedupe_key text not null,
        payload_json text not null,
        status text not null default 'queued',
        attempts integer not null default 0,
        max_attempts integer not null default 3,
        progress real not null default 0,
        available_at integer not null default (unixepoch() * 1000),
        lease_owner text,
        lease_expires_at integer,
        error_json text,
        created_at integer not null default (unixepoch() * 1000),
        updated_at integer not null default (unixepoch() * 1000)
      )
    `);
    database.run(sql`create index if not exists jobs_claim_idx on jobs(status, available_at)`);
    database.run(sql`
      create virtual table if not exists search_documents using fts5(
        media_item_id unindexed,
        title,
        people,
        genres,
        language,
        overview,
        tokenize = 'unicode61 remove_diacritics 2'
      )
    `);
  })();
}
