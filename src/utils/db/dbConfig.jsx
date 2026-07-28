import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database("sqlite.db");

// --- Existing column migrations (idempotent) ---
try { sqlite.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'citizen';"); } catch(e) {}
try { sqlite.exec("ALTER TABLE users ADD COLUMN full_name TEXT;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE users ADD COLUMN address TEXT;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE users ADD COLUMN ward_number TEXT;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE users ADD COLUMN phone TEXT;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE users ADD COLUMN government_id TEXT;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE users ADD COLUMN avatar TEXT;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE users ADD COLUMN reward_points INTEGER DEFAULT 0;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active';"); } catch(e) {}
try { sqlite.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE users ADD COLUMN updated_at INTEGER;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE users ADD COLUMN reset_password_token TEXT;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE users ADD COLUMN reset_password_expires INTEGER;"); } catch(e) {}

// --- GPS location columns for reports (citizen + collector) ---
try { sqlite.exec("ALTER TABLE reports ADD COLUMN latitude REAL;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE reports ADD COLUMN longitude REAL;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE reports ADD COLUMN formatted_address TEXT;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE reports ADD COLUMN ward_number TEXT;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE reports ADD COLUMN collector_lat REAL;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE reports ADD COLUMN collector_lng REAL;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE reports ADD COLUMN collector_verified_at INTEGER;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE reports ADD COLUMN location_verified INTEGER DEFAULT 0;"); } catch(e) {}
try { sqlite.exec("ALTER TABLE reports ADD COLUMN distance_meters INTEGER;"); } catch(e) {}

// --- AI verification history table migration ---
try {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ai_verification_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      checker_id INTEGER,
      check_type TEXT NOT NULL,
      full_result TEXT NOT NULL,
      image_url TEXT,
      verification_status TEXT NOT NULL,
      final_decision TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
} catch (e) {
  console.error("Failed to migrate ai_verification_history:", e);
}

export const db = drizzle(sqlite, { schema });
