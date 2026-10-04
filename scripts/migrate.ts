// Applies the versioned SQL migrations in ./migrations (tracked in drizzle.__drizzle_migrations).
// Safe to run on every deploy: already applied migrations are skipped, nothing is dropped.
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must be set");

const isLocal = ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname);
const client = postgres(url, { max: 1, ssl: isLocal ? false : "require", onnotice: () => {} });

try {
  await migrate(drizzle(client), { migrationsFolder: "./migrations" });
  console.log("Migrations applied");
} catch (e) {
  console.error("Migration failed:", e);
  process.exitCode = 1;
} finally {
  await client.end();
}
