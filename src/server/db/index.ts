import { Kysely, SqliteDialect } from "kysely";
import Database from "better-sqlite3";
import type { Database as DB } from "./types";

const dialect = new SqliteDialect({
  database: new Database("spliteshare.db"),
});

export const db = new Kysely<DB>({ dialect });