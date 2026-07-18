import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { LocalFlixConfig } from "@localflix/config";
import type { LocalFlixDatabase, LibraryRootRow, MediaItemRow } from "@localflix/database";
import {
  discoverRoot,
  fingerprintFile,
  parseEpisodeCandidate,
  parseMovieCandidate,
  probeMedia,
  scoreSubtitle,
  type DiscoveredFile,
  type MediaProbe
} from "@localflix/catalog";

export interface SyncServiceOptions {
  database: LocalFlixDatabase;
  config: LocalFlixConfig;
  minimumVideoBytes?: number;
  fingerprint?: (path: string) => Promise<string>;
  probe?: (path: string) => Promise<MediaProbe>;
}

export interface SyncResult {
  id: string;
  status: "succeeded" | "failed";
  discoveredCount: number;
  indexedCount: number;
  offlineRootIds: string[];
}

function fallbackSeriesTitle(relativePath: string): string {
  const [first] = relativePath.split("/");
  return parseMovieCandidate(first ?? relativePath).title;
}

export class SyncService {
  private readonly database: LocalFlixDatabase;
  private readonly config: LocalFlixConfig;
  private readonly minimumVideoBytes: number;
  private readonly fingerprint: (path: string) => Promise<string>;
  private readonly probe: (path: string) => Promise<MediaProbe>;

  constructor(options: SyncServiceOptions) {
    this.database = options.database;
    this.config = options.config;
    this.minimumVideoBytes = options.minimumVideoBytes ?? 50 * 1024 * 1024;
    this.fingerprint = options.fingerprint ?? fingerprintFile;
    this.probe = options.probe ?? probeMedia;
  }

  private configuredRoots(): Array<{ kind: "movie" | "series"; path: string }> {
    return [
      ...this.config.movieDirectories.map((path) => ({ kind: "movie" as const, path })),
      ...this.config.seriesDirectories.map((path) => ({ kind: "series" as const, path }))
    ];
  }

  private ensureRoots(): LibraryRootRow[] {
    return this.configuredRoots().map(
      (configured) =>
        this.database.catalog.findLibraryRoot(configured.kind, configured.path) ??
        this.database.catalog.createLibraryRoot(configured)
    );
  }

  private resolveItem(
    root: LibraryRootRow,
    relativePath: string
  ): {
    item: MediaItemRow;
    episodeId: string | null;
    candidate: { kind: "movie" | "series"; title: string; year: number | null };
  } {
    if (root.kind === "movie") {
      const candidate = parseMovieCandidate(relativePath);
      const item = this.database.catalog.findOrCreateMediaItem({
        kind: "movie",
        title: candidate.title,
        releaseYear: candidate.year
      });
      return {
        item,
        episodeId: null,
        candidate: { kind: "movie", title: candidate.title, year: candidate.year }
      };
    }

    const candidate = parseEpisodeCandidate(relativePath);
    const seriesTitle = candidate?.seriesTitle ?? fallbackSeriesTitle(relativePath);
    const item = this.database.catalog.findOrCreateMediaItem({
      kind: "series",
      title: seriesTitle,
      releaseYear: null
    });
    const episode = candidate
      ? this.database.catalog.createEpisode({
          seriesId: item.id,
          season: candidate.season,
          episode: candidate.episode,
          title: candidate.title
        })
      : null;
    return {
      item,
      episodeId: episode?.id ?? null,
      candidate: { kind: "series", title: seriesTitle, year: null }
    };
  }

  async run(): Promise<SyncResult> {
    const scanId = randomUUID();
    let discoveredCount = 0;
    let indexedCount = 0;
    const offlineRootIds: string[] = [];
    this.database.sqlite
      .prepare(
        `insert into scan_runs (id, status, discovered_count, indexed_count)
         values (?, 'running', 0, 0)`
      )
      .run(scanId);

    try {
      for (const root of this.ensureRoots()) {
        try {
          await access(root.path, constants.R_OK);
        } catch {
          this.database.catalog.setLibraryRootOnline(root.id, false);
          offlineRootIds.push(root.id);
          continue;
        }
        this.database.catalog.setLibraryRootOnline(root.id, true);

        const discoveredFiles: DiscoveredFile[] = [];
        for await (const discovered of discoverRoot(root, {
          minimumVideoBytes: this.minimumVideoBytes
        })) discoveredFiles.push(discovered);
        const indexedVideos: Array<{
          fileId: string;
          identity:
            | { kind: "movie"; title: string; year: number | null }
            | { kind: "episode"; seriesTitle: string; season: number; episode: number };
        }> = [];

        for (const discovered of discoveredFiles.filter(({ kind }) => kind === "video")) {
          discoveredCount += 1;
          const fingerprint = await this.fingerprint(discovered.absolutePath);
          let file = this.database.catalog.findMediaFileByFingerprint(root.id, fingerprint);
          if (file) {
            this.database.catalog.touchMediaFile(file.id, {
              relativePath: discovered.relativePath,
              sizeBytes: discovered.sizeBytes,
              modifiedAtMs: discovered.modifiedAtMs,
              scanId
            });
          } else {
            const { item, episodeId, candidate } = this.resolveItem(root, discovered.relativePath);
            file = this.database.catalog.createMediaFile({
              libraryRootId: root.id,
              mediaItemId: item.id,
              episodeId,
              relativePath: discovered.relativePath,
              fingerprint,
              sizeBytes: discovered.sizeBytes,
              modifiedAtMs: discovered.modifiedAtMs
            });
            this.database.jobs.enqueueUnique("enrich-item", item.id, { itemId: item.id, candidate });
            this.database.catalog.touchMediaFile(file.id, {
              relativePath: discovered.relativePath,
              sizeBytes: discovered.sizeBytes,
              modifiedAtMs: discovered.modifiedAtMs,
              scanId
            });
          }

          try {
            const probe = await this.probe(discovered.absolutePath);
            this.database.catalog.updateMediaFileProbe(file.id, probe);
            this.database.catalog.replaceMediaTracks(file.id, probe);
          } catch {
            // Discovery remains durable even when an individual media probe fails.
          }
          const episode = root.kind === "series" ? parseEpisodeCandidate(discovered.relativePath) : null;
          indexedVideos.push({
            fileId: file.id,
            identity: episode
              ? {
                  kind: "episode",
                  seriesTitle: episode.seriesTitle,
                  season: episode.season,
                  episode: episode.episode
                }
              : {
                  kind: "movie",
                  title: parseMovieCandidate(discovered.relativePath).title,
                  year: parseMovieCandidate(discovered.relativePath).year
                }
          });
          indexedCount += 1;
        }

        const externalByFile = new Map<
          string,
          Array<{ relativePath: string; language: string | null; label: string; format: string }>
        >();
        for (const subtitle of discoveredFiles.filter(({ kind }) => kind === "subtitle")) {
          const ranked = indexedVideos
            .map((video) => ({ video, match: scoreSubtitle(video.identity, subtitle.relativePath) }))
            .filter(({ match }) => match.accepted)
            .sort((left, right) => right.match.score - left.match.score);
          const best = ranked[0];
          if (!best) continue;
          const tracks = externalByFile.get(best.video.fileId) ?? [];
          tracks.push({
            relativePath: subtitle.relativePath,
            language: best.match.language,
            label: basename(subtitle.relativePath, extname(subtitle.relativePath)),
            format: subtitle.extension.slice(1)
          });
          externalByFile.set(best.video.fileId, tracks);
        }
        for (const video of indexedVideos) {
          this.database.catalog.replaceExternalSubtitleTracks(
            video.fileId,
            externalByFile.get(video.fileId) ?? []
          );
        }

        this.database.catalog.markRootFilesMissing(root.id, scanId);
        this.database.catalog.completeLibraryRootScan(root.id);
      }

      for (const payload of this.database.catalog.listEnrichmentCandidates()) {
        this.database.jobs.enqueueUnique("enrich-item", payload.itemId, payload);
      }

      this.database.sqlite
        .prepare(
          `update scan_runs
           set status = 'succeeded', discovered_count = ?, indexed_count = ?,
               completed_at = ? where id = ?`
        )
        .run(discoveredCount, indexedCount, Date.now(), scanId);
      return {
        id: scanId,
        status: "succeeded",
        discoveredCount,
        indexedCount,
        offlineRootIds
      };
    } catch (error) {
      this.database.sqlite
        .prepare(
          `update scan_runs set status = 'failed', error_json = ?, completed_at = ?
           where id = ?`
        )
        .run(
          JSON.stringify({ message: error instanceof Error ? error.message : String(error) }),
          Date.now(),
          scanId
        );
      throw error;
    }
  }
}
