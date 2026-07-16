import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite);

console.log("Running migrations...");

try {
  migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete!");
} catch (error) {
  console.error("Migration failed:", error);
} finally {
  sqlite.close();
}
