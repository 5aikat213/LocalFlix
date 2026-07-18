import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";

export interface ProfileRow {
  id: string;
  name: string;
  avatar: string;
}

export interface ProgressInput {
  profileId: string;
  mediaFileId: string;
  positionMs: number;
  durationMs: number;
  completed: boolean;
}

export interface ProgressRow extends ProgressInput {
  lastWatchedAt: number;
}

export interface ContinueWatchingRow extends ProgressRow {
  mediaItemId: string;
  title: string;
  progress: number;
}

export class ProfileRepository {
  constructor(private readonly sqlite: BetterSqlite3.Database) {}

  create(input: Omit<ProfileRow, "id">): ProfileRow {
    const row: ProfileRow = { id: randomUUID(), ...input };
    this.sqlite
      .prepare("insert into profiles (id, name, avatar) values (@id, @name, @avatar)")
      .run(row);
    return row;
  }

  list(): ProfileRow[] {
    return this.sqlite
      .prepare("select id, name, avatar from profiles order by created_at, name")
      .all() as ProfileRow[];
  }

  ensureDefault(): ProfileRow {
    return this.list()[0] ?? this.create({ name: "Saikat", avatar: "ember" });
  }

  setFavorite(profileId: string, mediaItemId: string, favorite: boolean): void {
    if (favorite) {
      this.sqlite
        .prepare(
          `insert into favorites (profile_id, media_item_id) values (?, ?)
           on conflict(profile_id, media_item_id) do nothing`
        )
        .run(profileId, mediaItemId);
      return;
    }
    this.sqlite
      .prepare("delete from favorites where profile_id = ? and media_item_id = ?")
      .run(profileId, mediaItemId);
  }

  isFavorite(profileId: string, mediaItemId: string): boolean {
    return Boolean(
      this.sqlite
        .prepare("select 1 from favorites where profile_id = ? and media_item_id = ?")
        .get(profileId, mediaItemId)
    );
  }

  listContinueWatching(profileId: string): ContinueWatchingRow[] {
    const rows = this.sqlite
      .prepare(
        `select wp.profile_id as profileId, wp.media_file_id as mediaFileId,
                mf.media_item_id as mediaItemId, mi.title,
                wp.position_ms as positionMs, wp.duration_ms as durationMs,
                wp.completed, wp.last_watched_at as lastWatchedAt
         from watch_progress wp
         join media_files mf on mf.id = wp.media_file_id
         join media_items mi on mi.id = mf.media_item_id
         where wp.profile_id = ? and wp.completed = 0 and wp.position_ms > 0
         order by wp.last_watched_at desc`
      )
      .all(profileId) as Array<Omit<ContinueWatchingRow, "completed" | "progress"> & { completed: number }>;
    return rows.map((row) => ({
      ...row,
      completed: row.completed === 1,
      progress: row.durationMs > 0 ? row.positionMs / row.durationMs : 0
    }));
  }

  saveProgress(input: ProgressInput): ProgressRow {
    const lastWatchedAt = Date.now();
    this.sqlite.transaction(() => {
      const previous = this.getProgress(input.profileId, input.mediaFileId);
      this.sqlite
        .prepare(
          `insert into watch_progress
            (profile_id, media_file_id, position_ms, duration_ms, completed,
             last_watched_at, updated_at)
           values
            (@profileId, @mediaFileId, @positionMs, @durationMs, @completed,
             @lastWatchedAt, @lastWatchedAt)
           on conflict(profile_id, media_file_id) do update set
             position_ms = excluded.position_ms,
             duration_ms = excluded.duration_ms,
             completed = excluded.completed,
             last_watched_at = excluded.last_watched_at,
             updated_at = excluded.updated_at`
        )
        .run({ ...input, completed: input.completed ? 1 : 0, lastWatchedAt });
      const kind = input.completed ? "complete" : previous ? "progress" : "start";
      this.sqlite
        .prepare(
          `insert into watch_events
             (id, profile_id, media_file_id, kind, position_ms, created_at)
           values (?, ?, ?, ?, ?, ?)`
        )
        .run(randomUUID(), input.profileId, input.mediaFileId, kind, input.positionMs, lastWatchedAt);
    })();
    return { ...input, lastWatchedAt };
  }

  getProgress(profileId: string, mediaFileId: string): ProgressRow | null {
    const row = this.sqlite
      .prepare(
        `select profile_id as profileId, media_file_id as mediaFileId,
                position_ms as positionMs, duration_ms as durationMs,
                completed, last_watched_at as lastWatchedAt
         from watch_progress
         where profile_id = ? and media_file_id = ?`
      )
      .get(profileId, mediaFileId) as
      | (Omit<ProgressRow, "completed"> & { completed: number })
      | undefined;
    return row ? { ...row, completed: row.completed === 1 } : null;
  }
}
