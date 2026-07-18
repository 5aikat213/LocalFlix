import { createDatabaseAt, type LocalFlixDatabase } from "./client";

export function createTestDatabase(): LocalFlixDatabase {
  return createDatabaseAt(":memory:");
}
