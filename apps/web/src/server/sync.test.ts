import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@localflix/database/test";
import { enqueueLibrarySync, getLibraryStatus, serializeJobEvent } from "./sync";

describe("web sync service", () => {
  it("deduplicates repeated library sync requests", () => {
    const database = createTestDatabase();
    const first = enqueueLibrarySync(database);
    const second = enqueueLibrarySync(database);

    expect(second.id).toBe(first.id);
  });

  it("serializes a browser-safe SSE job snapshot", () => {
    const database = createTestDatabase();
    const job = enqueueLibrarySync(database);

    expect(serializeJobEvent(job)).toBe(
      `event: job\ndata: ${JSON.stringify({
        id: job.id,
        type: "scan-library",
        status: "queued",
        attempts: 0,
        progress: 0
      })}\n\n`
    );
  });

  it("summarizes roots, catalog counts, scans, and jobs for diagnostics", () => {
    const database = createTestDatabase();
    const root = database.catalog.createLibraryRoot({ kind: "series", path: "/media/series" });
    database.catalog.setLibraryRootOnline(root.id, false);
    database.catalog.completeLibraryRootScan(root.id, 1_700_000_000_000);
    enqueueLibrarySync(database);

    expect(getLibraryStatus(database)).toMatchObject({
      counts: { titles: 0, files: 0, availableFiles: 0, profiles: 0 },
      roots: [{
        path: "/media/series",
        kind: "series",
        online: false,
        lastScanAt: 1_700_000_000_000
      }],
      jobs: [expect.objectContaining({ type: "scan-library", status: "queued" })]
    });
    database.close();
  });
});
