import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Remote databases (Supabase, RDS...) must be reached over TLS; local ones usually do not speak it.
const host = new URL(process.env.DATABASE_URL).hostname;
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host);

export const client = postgres(process.env.DATABASE_URL, {
  ssl: isLocal ? false : "require",
  max: Number(process.env.DB_POOL_MAX) || 10,
  idle_timeout: 30,
  connect_timeout: 15,
});
export const db = drizzle({ client, schema });
