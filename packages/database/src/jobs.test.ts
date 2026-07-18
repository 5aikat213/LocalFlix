import { describe, expect, it } from "vitest";
import { createTestDatabase } from "./test-database";

describe("durable jobs", () => {
  it("deduplicates queued work with the same key", () => {
    const database = createTestDatabase();
    const first = database.jobs.enqueueUnique("scan-library", "all", { rootIds: [] });
    const second = database.jobs.enqueueUnique("scan-library", "all", { rootIds: [] });

    expect(second.id).toBe(first.id);
  });

  it("reclaims a running job after its lease expires", () => {
    const database = createTestDatabase();
    const now = Date.now();
    const queued = database.jobs.enqueueUnique("probe-file", "file:1", { fileId: "1" });
    const firstClaim = database.jobs.claim("worker-a", { nowMs: now, leaseMs: 1_000 });
    const secondClaim = database.jobs.claim("worker-b", {
      nowMs: now + 1_001,
      leaseMs: 1_000
    });

    expect(firstClaim).toMatchObject({ id: queued.id, attempts: 1 });
    expect(secondClaim).toMatchObject({ id: queued.id, attempts: 2 });
  });
});
