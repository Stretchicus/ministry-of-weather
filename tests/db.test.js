const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const { openDb } = require('../src/db');

test('creates visitors, orders, weather_cache tables', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ministry-'));
  const db = openDb(path.join(dir, 't.sqlite'));
  const names = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map((r) => r.name);
  assert.ok(names.includes('visitors'));
  assert.ok(names.includes('orders'));
  assert.ok(names.includes('weather_cache'));
  db.close();
});

test('inserts a visitor by token', () => {
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO visitors (token, created_at) VALUES (?, ?)`).run('abc', '2026-08-24T00:00:00.000Z');
  const row = db.prepare(`SELECT token FROM visitors`).get();
  assert.equal(row.token, 'abc');
  db.close();
});

test('orders can freeze a settled outcome', () => {
  const db = openDb(':memory:');
  const cols = db.prepare(`PRAGMA table_info(orders)`).all().map((row) => row.name);
  for (const name of [
    'outcome',
    'actual_condition',
    'actual_temperature_c',
    'actual_wind',
    'actual_humidity',
    'rival_name',
    'rival_reason',
    'settled_recorded_at'
  ]) {
    assert.ok(cols.includes(name), name);
  }
  db.close();
});

test('openDb adds settlement columns to a legacy orders table', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ministry-legacy-'));
  const dbPath = path.join(dir, 'legacy.sqlite');
  try {
    const legacyDb = new Database(dbPath);
    legacyDb.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        visitor_id INTEGER NOT NULL,
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
        created_at TEXT NOT NULL
      );
      INSERT INTO orders (
        visitor_id, place_name, latitude, longitude, timezone, local_date,
        period, condition, temperature_c, wind, humidity, reason, created_at
      ) VALUES (
        1, 'Legacy Place', 51.5, -0.1, 'Europe/London', '2026-08-24',
        'morning', 'drizzle', 14, 'calm', 'pleasant', 'Legacy filing',
        '2026-08-01T00:00:00.000Z'
      );
    `);
    legacyDb.close();

    const migratedDb = openDb(dbPath);
    const cols = migratedDb.prepare(`PRAGMA table_info(orders)`).all().map((row) => row.name);
    assert.ok(cols.includes('outcome'));
    assert.equal(migratedDb.prepare(`SELECT place_name FROM orders`).get().place_name, 'Legacy Place');
    migratedDb.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
