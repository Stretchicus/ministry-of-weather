const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

function ensureOrderSettlementColumns(db) {
  const cols = db.prepare(`PRAGMA table_info(orders)`).all().map((row) => row.name);
  const add = [
    ['outcome', 'TEXT'],
    ['actual_condition', 'TEXT'],
    ['actual_temperature_c', 'INTEGER'],
    ['actual_wind', 'TEXT'],
    ['actual_humidity', 'TEXT'],
    ['rival_name', 'TEXT'],
    ['rival_reason', 'TEXT'],
    ['settled_recorded_at', 'TEXT']
  ];
  for (const [name, type] of add) {
    if (!cols.includes(name)) {
      db.exec(`ALTER TABLE orders ADD COLUMN ${name} ${type}`);
    }
  }
}

function openDb(filePath) {
  if (filePath !== ':memory:') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS visitors (
      id INTEGER PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      display_name TEXT,
      cancel_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY,
      visitor_id INTEGER NOT NULL REFERENCES visitors(id),
      place_name TEXT NOT NULL,
      country TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      timezone TEXT NOT NULL,
      local_date TEXT NOT NULL,
      period TEXT NOT NULL,
      condition TEXT NOT NULL,
      temperature_c INTEGER NOT NULL,
      wind TEXT NOT NULL,
      humidity TEXT NOT NULL,
      reason TEXT NOT NULL,
      cancelled_at TEXT,
      created_at TEXT NOT NULL,
      outcome TEXT,
      actual_condition TEXT,
      actual_temperature_c INTEGER,
      actual_wind TEXT,
      actual_humidity TEXT,
      rival_name TEXT,
      rival_reason TEXT,
      settled_recorded_at TEXT
    );
    CREATE TABLE IF NOT EXISTS weather_cache (
      cache_key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );
  `);
  ensureOrderSettlementColumns(db);
  return db;
}

function utcNowIso(date = new Date()) {
  return date.toISOString();
}

module.exports = { openDb, utcNowIso };
