import type { JobRow, LocalFlixDatabase } from "@localflix/database";

export function enqueueLibrarySync(database: LocalFlixDatabase): JobRow {
  return database.jobs.enqueueUnique("scan-library", "library-roots", {});
}

export function getLibraryStatus(database: LocalFlixDatabase) {
  const counts = database.sqlite
    .prepare(
      `select
         (select count(*) from media_items) as titles,
         (select count(*) from media_files) as files,
         (select count(*) from media_files where available = 1) as availableFiles,
         (select count(*) from profiles) as profiles,
         (select count(*) from subtitle_tracks) as subtitles`
    )
    .get() as {
    titles: number;
    files: number;
    availableFiles: number;
    profiles: number;
    subtitles: number;
  };
  const scans = database.sqlite
    .prepare(
      `select id, status, discovered_count as discoveredCount,
              indexed_count as indexedCount, started_at as startedAt,
              completed_at as completedAt, error_json as errorJson
       from scan_runs order by started_at desc limit 10`
    )
    .all() as Array<Record<string, unknown>>;
  return {
    counts,
    roots: database.catalog.listLibraryRoots(),
    scans,
    jobs: database.jobs.listRecent(20)
  };
}

export function serializeJobEvent(job: JobRow): string {
  return `event: job\ndata: ${JSON.stringify({
    id: job.id,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    progress: job.progress
  })}\n\n`;
}
