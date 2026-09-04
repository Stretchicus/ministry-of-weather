const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { buildBoard } = require('../src/lib/board');

function seedVisitor(db) {
  db.prepare(
    'INSERT INTO visitors (token, display_name, created_at) VALUES (?, ?, ?)'
  ).run('board-visitor', 'Pat Pending', '2026-08-01T00:00:00.000Z');
  return db.prepare('SELECT * FROM visitors WHERE token = ?').get('board-visitor');
}

function insertOrder(db, visitorId, fields) {
  const result = db.prepare(`
    INSERT INTO orders (
      visitor_id, place_name, latitude, longitude, timezone, local_date,
      period, condition, temperature_c, wind, humidity, reason, cancelled_at, created_at
    ) VALUES (?, ?, ?, ?, 'UTC', ?, 'morning', ?, ?, 'calm', 'pleasant', ?, ?, ?)
  `).run(
    visitorId,
    fields.place,
    fields.latitude ?? 1,
    fields.longitude ?? 1,
    fields.localDate ?? '2026-08-24',
    fields.condition ?? 'sun',
    fields.temperatureC ?? 20,
    fields.reason ?? 'reason',
    fields.cancelledAt ?? null,
    fields.createdAt ?? '2026-08-02T00:00:00.000Z'
  );
  return result.lastInsertRowid;
}

const matchingWeather = {
  currentForCity: async () => ({ temperatureC: 14, condition: 'drizzle', wind: 'calm', humidity: 'pleasant' }),
  archiveSlice: async () => ({ temperatureC: 20, condition: 'sun', wind: 'calm', humidity: 'pleasant' }),
  forecastSlice: async () => ({ temperatureC: 20, condition: 'sun', wind: 'calm', humidity: 'pleasant' })
};

test('board pads with fake chits to at least six and is stable for a UTC date', async () => {
  const db = openDb(':memory:');
  const now = new Date('2026-08-24T15:00:00Z');
  const a = await buildBoard({ db, weather: matchingWeather, now });
  const b = await buildBoard({ db, weather: matchingWeather, now });
  assert.equal(a.cards.length, 6);
  assert.deepEqual(a.cards, b.cards);
  assert.equal(a.ticker, a.cards);
  for (const card of a.cards) {
    assert.equal(card.stamped, true);
    assert.match(card.requestedWeather, /drizzle/);
    assert.match(card.actualWeather, /drizzle, 14°C/);
    assert.equal(Object.hasOwn(card, 'kind'), false);
  }
  db.close();
});

test('fake chit order changes deterministically across UTC dates', async () => {
  const db = openDb(':memory:');
  const first = await buildBoard({
    db,
    weather: matchingWeather,
    now: new Date('2026-08-24T15:00:00Z')
  });
  const second = await buildBoard({
    db,
    weather: matchingWeather,
    now: new Date('2026-08-25T15:00:00Z')
  });
  const configOrder = ['London', 'New York', 'Tokyo', 'Cairo', 'Sydney', 'Reykjavík'];

  assert.notDeepEqual(first.cards.map((card) => card.place), second.cards.map((card) => card.place));
  assert.notDeepEqual(first.cards.map((card) => card.place), configOrder);
  db.close();
});

test('accepted real filing is mixed into its padded board', async () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  insertOrder(db, visitor.id, { place: 'Real Place' });
  const board = await buildBoard({
    db,
    weather: matchingWeather,
    now: new Date('2026-08-24T15:00:00Z')
  });

  assert.notDeepEqual(
    board.cards.map((card) => card.place),
    ['Real Place', 'London', 'New York', 'Tokyo', 'Cairo', 'Sydney']
  );
  db.close();
});

test('qualifying real filings appear and extra fakes are not required past six', async () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  for (let index = 0; index < 7; index += 1) {
    insertOrder(db, visitor.id, { place: `Place ${index}`, latitude: index + 10, longitude: index + 10 });
  }
  const board = await buildBoard({
    db,
    weather: matchingWeather,
    now: new Date('2026-08-24T15:00:00Z')
  });
  assert.equal(board.cards.length, 7);
  assert.equal(board.cards.filter((card) => card.name === 'Pat Pending').length, 7);
  db.close();
});

test('queued aimed denied cancelled and other-day filings stay off the board', async () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  insertOrder(db, visitor.id, { place: 'Queued', localDate: '2026-12-25' });
  insertOrder(db, visitor.id, { place: 'Aimed', localDate: '2026-08-30' });
  insertOrder(db, visitor.id, {
    place: 'Denied',
    latitude: 20,
    longitude: 20,
    localDate: '2026-08-24',
    condition: 'rain',
    temperatureC: 8
  });
  insertOrder(db, visitor.id, { place: 'Cancelled', cancelledAt: '2026-08-02T00:00:00.000Z' });
  insertOrder(db, visitor.id, { place: 'Yesterday', localDate: '2026-08-23' });
  insertOrder(db, visitor.id, { place: 'Accepted Today' });
  const board = await buildBoard({
    db,
    weather: {
      ...matchingWeather,
      archiveSlice: async ({ latitude }) => {
        if (latitude === 20) {
          return { temperatureC: 8, condition: 'storm', wind: 'gale', humidity: 'muggy' };
        }
        return { temperatureC: 20, condition: 'sun', wind: 'calm', humidity: 'pleasant' };
      }
    },
    now: new Date('2026-08-24T15:00:00Z')
  });
  const names = board.cards.map((card) => card.place);
  assert.ok(names.includes('Accepted Today'));
  assert.ok(!names.includes('Queued'));
  assert.ok(!names.includes('Aimed'));
  assert.ok(!names.includes('Denied'));
  assert.ok(!names.includes('Cancelled'));
  assert.ok(!names.includes('Yesterday'));
  db.close();
});

test('accepted real at a featured city skips that fake', async () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  insertOrder(db, visitor.id, {
    place: 'London parish',
    latitude: 51.5074,
    longitude: -0.1278,
    condition: 'drizzle',
    temperatureC: 14
  });
  const board = await buildBoard({
    db,
    weather: {
      currentForCity: async () => ({ temperatureC: 14, condition: 'drizzle', wind: 'calm', humidity: 'pleasant' }),
      archiveSlice: async () => ({ temperatureC: 14, condition: 'drizzle', wind: 'calm', humidity: 'pleasant' }),
      forecastSlice: async () => null
    },
    now: new Date('2026-08-24T15:00:00Z')
  });
  const londons = board.cards.filter((card) => /London/i.test(card.place));
  assert.equal(londons.length, 1);
  assert.equal(londons[0].name, 'Pat Pending');
  assert.equal(board.cards.length, 6);
  db.close();
});

test('missing current weather omits that fake instead of an observatory chit', async () => {
  const db = openDb(':memory:');
  const board = await buildBoard({
    db,
    weather: { currentForCity: async () => null, archiveSlice: async () => null, forecastSlice: async () => null },
    now: new Date('2026-08-24T15:00:00Z')
  });
  assert.equal(board.cards.length, 0);
  db.close();
});
