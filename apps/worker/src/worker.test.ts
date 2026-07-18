import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@localflix/database/test";
import { Worker } from "./worker";

describe("job worker", () => {
  it("claims, runs, and completes a registered job", async () => {
    const database = createTestDatabase();
    const calls: Array<{ payload: unknown; jobId: string }> = [];
    const handler = async (payload: unknown, context: { jobId: string }) => {
      calls.push({ payload, jobId: context.jobId });
    };
    const job = database.jobs.enqueueUnique("example", "example:1", { value: 1 });
    const worker = new Worker({ database, workerId: "worker-1", handlers: { example: handler } });

    await expect(worker.runOne()).resolves.toBe(true);

    expect(calls).toEqual([{ payload: { value: 1 }, jobId: job.id }]);
    expect(database.jobs.get(job.id)).toMatchObject({ status: "succeeded", progress: 1 });
  });

  it("returns a failed job to the queue when attempts remain", async () => {
    const database = createTestDatabase();
    const job = database.jobs.enqueueUnique("example", "example:2", {});
    const worker = new Worker({
      database,
      workerId: "worker-2",
      handlers: { example: async () => Promise.reject(new Error("temporary")) }
    });

    await worker.runOne();

    expect(database.jobs.get(job.id)).toMatchObject({ status: "queued", attempts: 1 });
  });
});
