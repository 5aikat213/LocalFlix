import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";

export interface JobRow<TPayload = unknown> {
  id: string;
  type: string;
  dedupeKey: string;
  payload: TPayload;
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  progress: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: number | null;
}

interface RawJobRow {
  id: string;
  type: string;
  dedupeKey: string;
  payloadJson: string;
  status: JobRow["status"];
  attempts: number;
  progress: number;
  leaseOwner: string | null;
  leaseExpiresAt: number | null;
}

function mapJob<TPayload>(row: RawJobRow): JobRow<TPayload> {
  return {
    id: row.id,
    type: row.type,
    dedupeKey: row.dedupeKey,
    payload: JSON.parse(row.payloadJson) as TPayload,
    status: row.status,
    attempts: row.attempts,
    progress: row.progress,
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt
  };
}

export class JobRepository {
  constructor(private readonly sqlite: BetterSqlite3.Database) {}

  enqueue<TPayload>(type: string, dedupeKey: string, payload: TPayload): JobRow<TPayload> {
    const row: JobRow<TPayload> = {
      id: randomUUID(),
      type,
      dedupeKey,
      payload,
      status: "queued",
      attempts: 0,
      progress: 0
    };
    this.sqlite
      .prepare(
        `insert into jobs (id, type, dedupe_key, payload_json)
         values (@id, @type, @dedupeKey, @payloadJson)`
      )
      .run({ ...row, payloadJson: JSON.stringify(payload) });
    return row;
  }

  enqueueUnique<TPayload>(
    type: string,
    dedupeKey: string,
    payload: TPayload
  ): JobRow<TPayload> {
    return this.sqlite.transaction(() => {
      const existing = this.sqlite
        .prepare(
          `select id, type, dedupe_key as dedupeKey, payload_json as payloadJson,
                  status, attempts, progress, lease_owner as leaseOwner,
                  lease_expires_at as leaseExpiresAt
           from jobs
           where type = ? and dedupe_key = ? and status in ('queued', 'running')
           order by created_at desc limit 1`
        )
        .get(type, dedupeKey) as RawJobRow | undefined;
      return existing ? mapJob<TPayload>(existing) : this.enqueue(type, dedupeKey, payload);
    })();
  }

  claim(
    workerId: string,
    options: { nowMs?: number; leaseMs?: number } = {}
  ): JobRow | null {
    const nowMs = options.nowMs ?? Date.now();
    const leaseMs = options.leaseMs ?? 60_000;
    return this.sqlite.transaction(() => {
      const candidate = this.sqlite
        .prepare(
          `select id
           from jobs
           where attempts < max_attempts
             and (
               (status = 'queued' and available_at <= @nowMs)
               or (status = 'running' and lease_expires_at < @nowMs)
             )
           order by available_at asc, created_at asc
           limit 1`
        )
        .get({ nowMs }) as { id: string } | undefined;
      if (!candidate) return null;
      this.sqlite
        .prepare(
          `update jobs
           set status = 'running', attempts = attempts + 1,
               lease_owner = @workerId, lease_expires_at = @leaseExpiresAt,
               updated_at = @nowMs
           where id = @id`
        )
        .run({
          id: candidate.id,
          workerId,
          leaseExpiresAt: nowMs + leaseMs,
          nowMs
        });
      return this.get(candidate.id);
    })();
  }

  get<TPayload = unknown>(id: string): JobRow<TPayload> | null {
    const row = this.sqlite
      .prepare(
        `select id, type, dedupe_key as dedupeKey, payload_json as payloadJson,
                status, attempts, progress, lease_owner as leaseOwner,
                lease_expires_at as leaseExpiresAt
         from jobs where id = ?`
      )
      .get(id) as RawJobRow | undefined;
    return row ? mapJob<TPayload>(row) : null;
  }

  listRecent(limit = 25): JobRow[] {
    const rows = this.sqlite
      .prepare(
        `select id, type, dedupe_key as dedupeKey, payload_json as payloadJson,
                status, attempts, progress, lease_owner as leaseOwner,
                lease_expires_at as leaseExpiresAt
         from jobs order by updated_at desc limit ?`
      )
      .all(limit) as RawJobRow[];
    return rows.map((row) => mapJob(row));
  }

  updateProgress(id: string, workerId: string, progress: number): void {
    this.sqlite
      .prepare(
        `update jobs set progress = @progress, updated_at = @now
         where id = @id and lease_owner = @workerId and status = 'running'`
      )
      .run({ id, workerId, progress: Math.max(0, Math.min(1, progress)), now: Date.now() });
  }

  complete(id: string, workerId: string): void {
    this.sqlite
      .prepare(
        `update jobs
         set status = 'succeeded', progress = 1, lease_owner = null,
             lease_expires_at = null, updated_at = @now
         where id = @id and lease_owner = @workerId`
      )
      .run({ id, workerId, now: Date.now() });
  }

  fail(id: string, workerId: string, error: unknown, retryDelayMs = 1_000): void {
    const current = this.get(id);
    if (!current || current.leaseOwner !== workerId) return;
    const retry = current.attempts < 3;
    const now = Date.now();
    this.sqlite
      .prepare(
        `update jobs
         set status = @status, available_at = @availableAt,
             lease_owner = null, lease_expires_at = null,
             error_json = @errorJson, updated_at = @now
         where id = @id`
      )
      .run({
        id,
        status: retry ? "queued" : "failed",
        availableAt: now + retryDelayMs,
        errorJson: JSON.stringify({
          message: error instanceof Error ? error.message : String(error)
        }),
        now
      });
  }
}
