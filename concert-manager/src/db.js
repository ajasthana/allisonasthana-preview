const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "data", "concert-manager.db");
const db = new DatabaseSync(dbPath);

db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS musicians (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    instrument TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS concerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    venue TEXT,
    date TEXT,
    call_time TEXT,
    concert_time TEXT,
    fee_default TEXT,
    status TEXT NOT NULL DEFAULT 'planning',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS repertoire (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    concert_id INTEGER NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    composer TEXT,
    title TEXT NOT NULL,
    movement TEXT,
    duration TEXT,
    instrumentation_notes TEXT
  );

  CREATE TABLE IF NOT EXISTS rehearsals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    concert_id INTEGER NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
    date TEXT,
    start_time TEXT,
    end_time TEXT,
    location TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    concert_id INTEGER NOT NULL REFERENCES concerts(id) ON DELETE CASCADE,
    musician_id INTEGER NOT NULL REFERENCES musicians(id) ON DELETE CASCADE,
    role_part TEXT,
    fee TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    token TEXT NOT NULL UNIQUE,
    sent_at TEXT,
    responded_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_repertoire_concert ON repertoire(concert_id);
  CREATE INDEX IF NOT EXISTS idx_rehearsals_concert ON rehearsals(concert_id);
  CREATE INDEX IF NOT EXISTS idx_offers_concert ON offers(concert_id);
  CREATE INDEX IF NOT EXISTS idx_offers_token ON offers(token);
`);

module.exports = db;
