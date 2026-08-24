const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
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
