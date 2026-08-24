const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const {
  fileOrder,
  cancelOrder,
  hasActiveFilingToday,
  clerkCopy
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
