import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database("sqlite.db");

// Run schema migration automatically in-place to avoid breaking existing DB files:
try {
  sqlite.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'citizen';");
} catch(e) {}
try {
  sqlite.exec("ALTER TABLE users ADD COLUMN full_name TEXT;");
} catch(e) {}
try {
  sqlite.exec("ALTER TABLE users ADD COLUMN address TEXT;");
} catch(e) {}
try {
  sqlite.exec("ALTER TABLE users ADD COLUMN ward_number TEXT;");
} catch(e) {}
try {
  sqlite.exec("ALTER TABLE users ADD COLUMN phone TEXT;");
} catch(e) {}
try {
  sqlite.exec("ALTER TABLE users ADD COLUMN government_id TEXT;");
} catch(e) {}
try {
  sqlite.exec("ALTER TABLE users ADD COLUMN avatar TEXT;");
} catch(e) {}
try {
  sqlite.exec("ALTER TABLE users ADD COLUMN reward_points INTEGER DEFAULT 0;");
} catch(e) {}
try {
  sqlite.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';");
} catch(e) {}
try {
  sqlite.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER;");
} catch(e) {}
try {
  sqlite.exec("ALTER TABLE users ADD COLUMN updated_at INTEGER;");
} catch(e) {}

export const db = drizzle(sqlite, { schema });
