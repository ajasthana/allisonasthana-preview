const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { splitFullName } = require("./names");

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

  CREATE TABLE IF NOT EXISTS ensemble_profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT ''
  );
`);

db.prepare(
  `INSERT OR IGNORE INTO ensemble_profile (id, name, email, website) VALUES (1, ?, ?, ?)`
).run("Monarch Chamber Players", "info@monarchchamberplayers.org", "monarchchamberplayers.org");

function columnExists(table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((col) => col.name === column);
}

if (!columnExists("musicians", "first_name")) {
  db.exec("ALTER TABLE musicians ADD COLUMN first_name TEXT NOT NULL DEFAULT '';");
}
if (!columnExists("musicians", "last_name")) {
  db.exec("ALTER TABLE musicians ADD COLUMN last_name TEXT NOT NULL DEFAULT '';");
}
if (!columnExists("musicians", "musician_type")) {
  db.exec("ALTER TABLE musicians ADD COLUMN musician_type TEXT NOT NULL DEFAULT 'core';");
}
if (!columnExists("concerts", "sheet_music_url")) {
  db.exec("ALTER TABLE concerts ADD COLUMN sheet_music_url TEXT;");
}
if (!columnExists("offers", "custom_message")) {
  db.exec("ALTER TABLE offers ADD COLUMN custom_message TEXT;");
}

// Backfill first/last name for musicians created before this migration existed,
// then drop the old single-field column now that first/last name is authoritative.
if (columnExists("musicians", "name")) {
  const legacyNamed = db
    .prepare("SELECT id, name FROM musicians WHERE first_name = '' AND last_name = '' AND name IS NOT NULL AND name != ''")
    .all();
  if (legacyNamed.length) {
    const backfillName = db.prepare("UPDATE musicians SET first_name = ?, last_name = ? WHERE id = ?");
    for (const row of legacyNamed) {
      const { first, last } = splitFullName(row.name);
      backfillName.run(first, last, row.id);
    }
  }
  db.exec("ALTER TABLE musicians DROP COLUMN name;");
}

module.exports = db;
