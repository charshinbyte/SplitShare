import type { Database as DB } from "./types";
import { Pool } from "pg";
import { Kysely, PostgresDialect } from "kysely";
import { env } from "~/env";

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
  }),
});

export const db = new Kysely<DB>({
  dialect,
});
