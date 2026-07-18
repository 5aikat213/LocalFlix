import { loadConfig } from "@localflix/config";
import { openDatabase } from "./client";

const database = openDatabase(loadConfig());
database.close();
process.stdout.write("LocalFlix database is ready.\n");
