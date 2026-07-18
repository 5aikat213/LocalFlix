import type { LocalFlixDatabase } from "@localflix/database";

export interface JobContext {
  jobId: string;
  progress(value: number): void;
}

export type JobHandler = (payload: unknown, context: JobContext) => Promise<void>;

export interface WorkerOptions {
  database: LocalFlixDatabase;
  workerId: string;
  handlers: Record<string, JobHandler>;
}

export class Worker {
  private readonly database: LocalFlixDatabase;
  private readonly workerId: string;
  private readonly handlers: Record<string, JobHandler>;

  constructor(options: WorkerOptions) {
    this.database = options.database;
    this.workerId = options.workerId;
    this.handlers = options.handlers;
  }

  async runOne(): Promise<boolean> {
    const job = this.database.jobs.claim(this.workerId);
    if (!job) return false;

    try {
      const handler = this.handlers[job.type];
      if (!handler) throw new Error(`No LocalFlix handler registered for ${job.type}`);
      await handler(job.payload, {
        jobId: job.id,
        progress: (value) => this.database.jobs.updateProgress(job.id, this.workerId, value)
      });
      this.database.jobs.complete(job.id, this.workerId);
    } catch (error) {
      this.database.jobs.fail(job.id, this.workerId, error);
    }
    return true;
  }
}
