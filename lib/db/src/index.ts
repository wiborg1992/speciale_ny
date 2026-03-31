import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const url = process.env.DATABASE_URL?.trim();

export const pool: pg.Pool | null = url ? new Pool({ connectionString: url }) : null;

export type AppDb = NodePgDatabase<typeof schema>;

export const db: AppDb | null = pool ? drizzle(pool, { schema }) : null;

if (!url) {
  console.warn(
    "[@workspace/db] DATABASE_URL er ikke sat — ingen PostgreSQL-persistens (api-server og visualisering kører stadig).",
  );
}

export * from "./schema";
