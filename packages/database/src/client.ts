import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { LocalFlixConfig } from "@localflix/config";
import { migrateDatabase } from "./migrate";
import { schema } from "./schema";
import { CatalogRepository } from "./repositories/catalog";
import { JobRepository } from "./repositories/jobs";
import { ProfileRepository } from "./repositories/profiles";
import { BrowseRepository } from "./repositories/browse";

export interface LocalFlixDatabase {
  sqlite: BetterSqlite3.Database;
  orm: BetterSQLite3Database<typeof schema>;
  catalog: CatalogRepository;
  jobs: JobRepository;
  profiles: ProfileRepository;
  browse: BrowseRepository;
  close(): void;
}

export function createDatabaseAt(path: string): LocalFlixDatabase {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new BetterSqlite3(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const orm = drizzle(sqlite, { schema });
  migrateDatabase(sqlite, orm);

  return {
    sqlite,
    orm,
    catalog: new CatalogRepository(sqlite),
    jobs: new JobRepository(sqlite),
    profiles: new ProfileRepository(sqlite),
    browse: new BrowseRepository(sqlite),
    close: () => sqlite.close()
  };
}

export function openDatabase(config: LocalFlixConfig): LocalFlixDatabase {
  return createDatabaseAt(join(config.dataDirectory, "localflix.db"));
}
