import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../../db/schema";
import { databasePath, migrationsDirectory } from "./paths";

let sqlite: Database.Database | null = null;
let database: ReturnType<typeof createDatabase> | null = null;

function createDatabase() {
  sqlite = new Database(databasePath());
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsDirectory() });
  return db;
}

export function getDb() {
  database ??= createDatabase();
  return database;
}

export function closeDb() {
  sqlite?.close();
  sqlite = null;
  database = null;
}
