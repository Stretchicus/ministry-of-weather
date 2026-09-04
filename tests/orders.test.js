const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const {
  fileOrder,
  cancelOrder,
  hasActiveFilingToday,
  clerkCopy,
  hydrateOrder
} = require('../src/lib/orders');

function seedVisitor(db, token = 't', displayName = 'Darren G') {
  db.prepare(
    `INSERT INTO visitors (token, display_name, created_at) VALUES (?, ?, ?)`
  ).run(token, displayName, '2026-08-01T00:00:00.000Z');
  return db.prepare(`SELECT * FROM visitors WHERE token = ?`).get(token);
}

const payload = {
  placeName: 'Croydon',
  country: 'United Kingdom',
  latitude: 51.376,
  longitude: -0.098,
  timezone: 'UTC',
  localDate: '2026-08-26',
  period: 'afternoon',
  condition: 'drizzle',
  temperatureC: 14,
  wind: 'calm',
  humidity: 'pleasant',
  reason: 'a friend\'s wedding'
};

test('one active filing per UTC day; cancel refunds the stamp', () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  const now = new Date('2026-08-24T15:00:00.000Z');
  const first = fileOrder(db, visitor, payload, now);
  assert.equal(first.ok, true);
  assert.equal(hasActiveFilingToday(db, visitor.id, now), true);
  const second = fileOrder(db, visitor, payload, now);
  assert.equal(second.ok, false);
  assert.equal(second.code, 'already_filed');
  const cancel = cancelOrder(db, visitor, first.order.id, now);
  assert.equal(cancel.ok, true);
  assert.equal(hasActiveFilingToday(db, visitor.id, now), false);
  const third = fileOrder(db, visitor, payload, now);
  assert.equal(third.ok, true);
  db.close();
});

test('cannot cancel another visitor\'s order', () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  const other = seedVisitor(db, 'u', 'Nigel B');
  const now = new Date('2026-08-24T15:00:00.000Z');
  const first = fileOrder(db, visitor, payload, now);
  const cancel = cancelOrder(db, other, first.order.id, now);
  assert.deepEqual(cancel, { ok: false, code: 'not_found' });
  db.close();
});

test('filing validates name, reason, knobs, and booking time', () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  const now = new Date('2026-08-24T15:00:00.000Z');

  assert.deepEqual(
    fileOrder(db, { ...visitor, display_name: null }, payload, now),
    { ok: false, code: 'no_name' }
  );
  assert.deepEqual(
    fileOrder(db, visitor, { ...payload, reason: '   ' }, now),
    { ok: false, code: 'bad_reason' }
  );
  assert.deepEqual(
    fileOrder(db, visitor, { ...payload, reason: 'x'.repeat(141) }, now),
    { ok: false, code: 'bad_reason' }
  );

  for (const changes of [
    { temperatureC: 14.5 },
    { temperatureC: -21 },
    { temperatureC: 46 },
    { condition: 'hail' },
    { wind: 'squall' },
    { humidity: 'sodden' },
    { period: 'midnight' }
  ]) {
    assert.deepEqual(
      fileOrder(db, visitor, { ...payload, ...changes }, now),
      { ok: false, code: 'bad_knobs' }
    );
  }

  assert.deepEqual(
    fileOrder(db, visitor, { ...payload, localDate: '2026-08-24' }, now),
    { ok: false, code: 'not_today' }
  );
  assert.deepEqual(
    fileOrder(db, visitor, { ...payload, localDate: '2026-08-25', period: 'morning' }, now),
    { ok: false, code: 'too_soon' }
  );
  db.close();
});

test('filing trims the public reason and accepts temperature boundaries', () => {
  for (const temperatureC of [-20, 45]) {
    const db = openDb(':memory:');
    const visitor = seedVisitor(db);
    const result = fileOrder(
      db,
      visitor,
      { ...payload, temperatureC, reason: '  municipal fête  ' },
      new Date('2026-08-24T12:00:00.000Z')
    );
    assert.equal(result.ok, true);
    assert.equal(result.order.reason, 'municipal fête');
    assert.equal(result.order.temperature_c, temperatureC);
    db.close();
  }
});

test('UTC daily stamp resets at UTC midnight', () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  assert.equal(
    fileOrder(db, visitor, payload, new Date('2026-08-24T23:59:59.999Z')).ok,
    true
  );
  assert.equal(
    fileOrder(db, visitor, payload, new Date('2026-08-25T00:00:00.000Z')).ok,
    true
  );
  db.close();
});

test('cancel is allowed at exactly 24 hours and rejected below it', () => {
  const exactDb = openDb(':memory:');
  const exactVisitor = seedVisitor(exactDb);
  const exact = fileOrder(
    exactDb,
    exactVisitor,
    { ...payload, localDate: '2026-08-26', period: 'afternoon' },
    new Date('2026-08-24T12:00:00.000Z')
  );
  assert.equal(
    cancelOrder(exactDb, exactVisitor, exact.order.id, new Date('2026-08-25T12:00:00.000Z')).ok,
    true
  );
  exactDb.close();

  const lateDb = openDb(':memory:');
  const lateVisitor = seedVisitor(lateDb);
  const late = fileOrder(
    lateDb,
    lateVisitor,
    { ...payload, localDate: '2026-08-26', period: 'afternoon' },
    new Date('2026-08-24T12:00:00.000Z')
  );
  assert.deepEqual(
    cancelOrder(lateDb, lateVisitor, late.order.id, new Date('2026-08-25T12:00:00.001Z')),
    { ok: false, code: 'too_late' }
  );
  lateDb.close();
});

test('cancel count increments and clerk copy escalates', () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);

  for (let count = 1; count <= 3; count += 1) {
    const filed = fileOrder(
      db,
      visitor,
      { ...payload, localDate: `2026-08-${26 + count}` },
      new Date(`2026-08-${23 + count}T00:00:00.000Z`)
    );
    const cancelled = cancelOrder(
      db,
      visitor,
      filed.order.id,
      new Date(`2026-08-${23 + count}T00:00:00.000Z`)
    );
    assert.equal(cancelled.cancelCount, count);
    assert.equal(cancelled.copy, clerkCopy(count));
  }

  assert.match(clerkCopy(1), /sigh/i);
  assert.match(clerkCopy(2), /red ink/i);
  assert.match(clerkCopy(3), /petition/i);
  assert.equal(clerkCopy(4), clerkCopy(3));
  assert.equal(db.prepare(`SELECT cancel_count FROM visitors WHERE id = ?`).get(visitor.id).cancel_count, 3);
  db.close();
});

function insertSettledOrder(db, visitorId, knobs) {
  const result = db.prepare(`
    INSERT INTO orders (
      visitor_id, place_name, latitude, longitude, timezone, local_date,
      period, condition, temperature_c, wind, humidity, reason, created_at
    ) VALUES (?, 'Croydon', 51.376, -0.098, 'UTC', '2026-08-20', 'morning', ?, ?, ?, ?, 'a picnic', '2026-08-01T12:00:00.000Z')
  `).run(visitorId, knobs.condition, knobs.temperatureC, knobs.wind, knobs.humidity);
  return db.prepare(`SELECT * FROM orders WHERE id = ?`).get(result.lastInsertRowid);
}

test('first settled mismatch freezes rival and actual weather', async () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  const order = insertSettledOrder(db, visitor.id, {
    condition: 'sun', temperatureC: 22, wind: 'calm', humidity: 'dry'
  });
  let archiveCalls = 0;
  const weather = {
    archiveSlice: async () => {
      archiveCalls += 1;
      return { temperatureC: 8, condition: 'rain', wind: 'gale', humidity: 'muggy' };
    }
  };
  const now = new Date('2026-08-24T12:00:00Z');
  const first = await hydrateOrder(order, { db, weather, now });
  assert.equal(first.verdict, 'denied');
  assert.equal(first.outcome, 'denied');
  assert.equal(first.actualWeather, 'rain, 8°C, gale, muggy');
  assert.ok(first.rival.name);
  assert.ok(first.rival.reason);
  const row = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(order.id);
  assert.equal(row.outcome, 'denied');
  assert.equal(row.rival_name, first.rival.name);
  assert.equal(row.rival_reason, first.rival.reason);

  const weather2 = {
    archiveSlice: async () => {
      archiveCalls += 1;
      return { temperatureC: 1, condition: 'snow', wind: 'calm', humidity: 'dry' };
    }
  };
  const frozen = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(order.id);
  const second = await hydrateOrder(frozen, { db, weather: weather2, now });
  assert.equal(archiveCalls, 1);
  assert.equal(second.verdict, 'denied');
  assert.equal(second.rival.name, first.rival.name);
  assert.equal(second.actualWeather, 'rain, 8°C, gale, muggy');
  db.close();
});

test('first settled match freezes actual weather without a rival', async () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  const order = insertSettledOrder(db, visitor.id, {
    condition: 'sun', temperatureC: 22, wind: 'calm', humidity: 'dry'
  });
  let archiveCalls = 0;
  const weather = {
    archiveSlice: async () => {
      archiveCalls += 1;
      return { temperatureC: 22, condition: 'sun', wind: 'calm', humidity: 'dry' };
    }
  };
  const now = new Date('2026-08-24T12:00:00Z');
  const first = await hydrateOrder(order, { db, weather, now });
  assert.equal(first.verdict, 'accepted');
  assert.equal(first.outcome, 'accepted');
  assert.equal(first.rival, null);
  const row = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(order.id);
  assert.equal(row.outcome, 'accepted');
  assert.equal(row.rival_name, null);
  const weather2 = {
    archiveSlice: async () => {
      archiveCalls += 1;
      return { temperatureC: 0, condition: 'fog', wind: 'gale', humidity: 'muggy' };
    }
  };
  const frozen = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(order.id);
  const second = await hydrateOrder(frozen, { db, weather: weather2, now });
  assert.equal(archiveCalls, 1);
  assert.equal(second.verdict, 'accepted');
  assert.equal(second.actualWeather, 'sun, 22°C, calm, dry');
  db.close();
});

test('observatory on first settled load leaves the snapshot empty', async () => {
  const db = openDb(':memory:');
  const visitor = seedVisitor(db);
  const order = insertSettledOrder(db, visitor.id, {
    condition: 'sun', temperatureC: 22, wind: 'calm', humidity: 'dry'
  });
  const first = await hydrateOrder(order, {
    db,
    weather: { archiveSlice: async () => null },
    now: new Date('2026-08-24T12:00:00Z')
  });
  assert.equal(first.verdict, 'observatory');
  const row = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(order.id);
  assert.equal(row.outcome, null);
  const second = await hydrateOrder(row, {
    db,
    weather: {
      archiveSlice: async () => ({ temperatureC: 22, condition: 'sun', wind: 'calm', humidity: 'dry' })
    },
    now: new Date('2026-08-24T12:00:00Z')
  });
  assert.equal(second.verdict, 'accepted');
  assert.equal(db.prepare(`SELECT outcome FROM orders WHERE id = ?`).get(order.id).outcome, 'accepted');
  db.close();
});
