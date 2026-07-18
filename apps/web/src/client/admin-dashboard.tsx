"use client";

import { useCallback, useEffect, useState } from "react";
import { formatAdminDate, rootHealthMessage } from "./admin-model";
import { LocalFlixLogo } from "./localflix-logo";

interface LibraryStatus {
  counts: { titles: number; files: number; availableFiles: number; profiles: number; subtitles: number };
  roots: Array<{ id: string; kind: "movie" | "series"; path: string; enabled: boolean; online: boolean; lastScanAt?: number | null }>;
  scans: Array<{ id: string; status: string; discoveredCount: number; indexedCount: number; startedAt: number; completedAt: number | null }>;
  jobs: Array<{ id: string; type: string; status: string; attempts: number; progress: number }>;
}

export default function AdminDashboard() {
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/status", { cache: "no-store" });
      if (!response.ok) throw new Error(`Status request failed (${response.status})`);
      setStatus((await response.json()) as LibraryStatus);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5_000);
    const events = new EventSource("/api/admin/jobs/stream");
    let scheduled: number | null = null;
    events.addEventListener("job", () => {
      if (scheduled !== null) return;
      scheduled = window.setTimeout(() => { scheduled = null; void refresh(); }, 400);
    });
    return () => {
      window.clearInterval(interval);
      if (scheduled !== null) window.clearTimeout(scheduled);
      events.close();
    };
  }, [refresh]);

  const sync = async () => {
    setSyncing(true);
    try {
      const response = await fetch("/api/admin/sync", { method: "POST" });
      if (!response.ok) throw new Error(`Sync request failed (${response.status})`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div><a className="admin-wordmark" href="/" aria-label="LocalFlix home"><LocalFlixLogo variant="compact" decorative /></a><span>Library control</span></div>
        <a className="admin-back" href="/">← Back to cinema</a>
      </header>
      <section className="admin-intro">
        <div><p className="eyebrow">Local operations</p><h1>Your library, at a glance.</h1><p>Discovery is non-destructive: unavailable drives stay indexed and return when mounted again.</p></div>
        <button onClick={() => void sync()} disabled={syncing}>{syncing ? "Queueing…" : "Sync library"}</button>
      </section>
      {error && <div className="admin-error">{error}</div>}
      {!status ? <div className="admin-loading">Reading LocalFlix status…</div> : (
        <>
          <section className="admin-stats" aria-label="Library totals">
            <div><strong>{status.counts.titles}</strong><span>Titles</span></div>
            <div><strong>{status.counts.availableFiles}</strong><span>Playable files</span></div>
            <div><strong>{status.counts.subtitles}</strong><span>Subtitle tracks</span></div>
            <div><strong>{status.counts.profiles}</strong><span>Profiles</span></div>
          </section>
          <section className="admin-section">
            <div className="admin-section-title"><h2>Library roots</h2><span>{status.roots.filter(({ online }) => online).length} of {status.roots.length} online</span></div>
            <div className="root-list">
              {status.roots.map((root) => (
                <article className="root-row" key={root.id}>
                  <span className={`health-dot ${root.online ? "online" : "offline"}`} />
                  <div><strong>{root.kind === "movie" ? "Movies" : "TV series"}</strong><code>{root.path}</code><p>{rootHealthMessage(root.online)}</p></div>
                  <span className="root-scan">Last scan<br /><b>{formatAdminDate(root.lastScanAt)}</b></span>
                </article>
              ))}
            </div>
          </section>
          <div className="admin-columns">
            <section className="admin-section">
              <div className="admin-section-title"><h2>Recent jobs</h2><span>Live</span></div>
              <div className="admin-table">
                {status.jobs.length === 0 && <p>No background work yet.</p>}
                {status.jobs.map((job) => (
                  <div className="job-row" key={job.id}>
                    <div><strong>{job.type.replaceAll("-", " ")}</strong><small>Attempt {job.attempts}</small></div>
                    <div className="job-progress"><i style={{ width: `${Math.round(job.progress * 100)}%` }} /></div>
                    <span className={`status-pill status-${job.status}`}>{job.status}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="admin-section">
              <div className="admin-section-title"><h2>Scan history</h2><span>Last 10</span></div>
              <div className="admin-table">
                {status.scans.length === 0 && <p>No scans recorded.</p>}
                {status.scans.map((scan) => (
                  <div className="scan-row" key={scan.id}>
                    <span className={`status-pill status-${scan.status}`}>{scan.status}</span>
                    <div><strong>{scan.indexedCount} indexed</strong><small>{scan.discoveredCount} discovered · {formatAdminDate(scan.startedAt)}</small></div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <section className="admin-note"><strong>Adding another drive?</strong><p>Add its movie or series path to <code>localflix.config.json</code>, mount the drive, and sync. Existing history remains attached to fingerprinted files when they move.</p></section>
        </>
      )}
    </main>
  );
}
