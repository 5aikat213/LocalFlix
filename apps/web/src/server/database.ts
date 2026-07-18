import { loadConfig } from "@localflix/config";
import { openDatabase, type LocalFlixDatabase } from "@localflix/database";

let database: LocalFlixDatabase | null = null;

export function getDatabase(): LocalFlixDatabase {
  if (database === null) {
    database = openDatabase(loadConfig());
  }
  return database;
}

