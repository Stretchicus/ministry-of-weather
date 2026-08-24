const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { buildBoard } = require('../src/lib/board');

test('theatre cards are stable for a given city-day', async () => {
  const db = openDb(':memory:');
  const weather = {
    currentForCity: async () => ({ temperatureC: 14, condition: 'drizzle', wind: 'calm', humidity: 'pleasant' })
  };
  const now = new Date('2026-08-24T12:00:00Z');
  const a = await buildBoard({ db, weather, now });
  const b = await buildBoard({ db, weather, now });
  assert.equal(a.theatre.length, 6);
  assert.deepEqual(a.theatre[0], b.theatre[0]);
  db.close();
});

test('real cards contain the eight newest active orders', async () => {
  const db = openDb(':memory:');
  const visitor = db.prepare(
    'INSERT INTO visitors (token, display_name, created_at) VALUES (?, ?, ?)'
  ).run('board-visitor', 'Pat Pending', '2026-08-01T00:00:00.000Z');
  const insert = db.prepare(`
    INSERT INTO orders (
      visitor_id, place_name, latitude, longitude, timezone, local_date,
      period, condition, temperature_c, wind, humidity, reason, cancelled_at, created_at
    ) VALUES (?, ?, 0, 0, 'UTC', '2026-08-30', 'morning', 'sun', 20, 'calm', 'pleasant', ?, ?, ?)
  `);

  for (let index = 0; index < 10; index += 1) {
    insert.run(
      visitor.lastInsertRowid,
      `Place ${index}`,
      `Reason ${index}`,
      index === 9 ? '2026-08-02T00:00:00.000Z' : null,
      `2026-08-${String(index + 2).padStart(2, '0')}T00:00:00.000Z`
    );
  }

  const board = await buildBoard({
    db,
    weather: { currentForCity: async () => null },
    now: new Date('2026-08-24T12:00:00Z')
  });

  assert.equal(board.real.length, 8);
  assert.equal(board.real[0].place, 'Place 8');
  assert.equal(board.real.at(-1).place, 'Place 1');
  assert.equal(board.real[0].name, 'Pat Pending');
  assert.deepEqual(board.ticker, [...board.theatre, ...board.real]);
  db.close();
});

test('only settled real filings carry a stamp', async () => {
  const db = openDb(':memory:');
  const visitor = db.prepare(
    'INSERT INTO visitors (token, display_name, created_at) VALUES (?, ?, ?)'
  ).run('stamp-visitor', 'Pat Pending', '2026-08-01T00:00:00.000Z');
  const insert = db.prepare(`
    INSERT INTO orders (
      visitor_id, place_name, latitude, longitude, timezone, local_date,
      period, condition, temperature_c, wind, humidity, reason, created_at
    ) VALUES (?, ?, 0, 0, 'UTC', ?, 'morning', 'sun', 20, 'calm', 'pleasant', ?, ?)
  `);
  insert.run(visitor.lastInsertRowid, 'Settled Place', '2026-08-20', 'done', '2026-08-01T00:00:00.000Z');
  insert.run(visitor.lastInsertRowid, 'Aimed Place', '2026-08-30', 'soon', '2026-08-02T00:00:00.000Z');
  insert.run(visitor.lastInsertRowid, 'Queued Place', '2026-12-25', 'later', '2026-08-03T00:00:00.000Z');

  const board = await buildBoard({
    db,
    weather: { currentForCity: async () => ({ temperatureC: 14, condition: 'drizzle', wind: 'calm', humidity: 'pleasant' }) },
    now: new Date('2026-08-24T12:00:00Z')
  });

  assert.equal(board.theatre[0].stamped, true);
  assert.equal(board.real.find((card) => card.place === 'Queued Place').stamped, false);
  assert.equal(board.real.find((card) => card.place === 'Aimed Place').stamped, false);
  assert.equal(board.real.find((card) => card.place === 'Settled Place').stamped, true);
  db.close();
});

test('missing current weather keeps observatory cards without digits', async () => {
  const db = openDb(':memory:');
  const board = await buildBoard({
    db,
    weather: { currentForCity: async () => null },
    now: new Date('2026-08-24T12:00:00Z')
  });

  assert.equal(board.theatre.length, 6);
  assert.equal(board.theatre[0].temperatureC, null);
  assert.match(board.theatre[0].reason, /observatory/i);
  db.close();
});
