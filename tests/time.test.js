const { test } = require('node:test');
const assert = require('node:assert/strict');
const time = require('../src/lib/time');

test('localDateString uses the location timezone', () => {
  const utc = new Date('2026-12-25T02:00:00.000Z');
  assert.equal(time.localDateString(utc, 'America/New_York'), '2026-12-24');
  assert.equal(time.localDateString(utc, 'Europe/London'), '2026-12-25');
});

test('rejects today in the location calendar', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');
  const result = time.assertSlotBookable({
    localDate: '2026-08-24',
    period: 'evening',
    timeZone: 'UTC',
    now
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'not_today');
});

test('rejects a slot starting in under 24 hours', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');
  const result = time.assertSlotBookable({
    localDate: '2026-08-25',
    period: 'morning',
    timeZone: 'UTC',
    now
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'too_soon');
});

test('allows tomorrow afternoon when that is >= 24h', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');
  const result = time.assertSlotBookable({
    localDate: '2026-08-25',
    period: 'afternoon',
    timeZone: 'UTC',
    now
  });
  assert.equal(result.ok, true);
});

test('deriveStatus: cancelled wins', () => {
  assert.equal(time.deriveStatus({
    localDate: '2027-01-01',
    period: 'morning',
    timeZone: 'UTC',
    now: new Date('2026-08-24T00:00:00Z'),
    cancelledAt: '2026-08-24T00:00:00.000Z'
  }), 'cancelled');
});

test('deriveStatus: queued beyond today+15', () => {
  assert.equal(time.deriveStatus({
    localDate: '2026-09-20',
    period: 'morning',
    timeZone: 'UTC',
    now: new Date('2026-08-24T12:00:00Z'),
    cancelledAt: null
  }), 'queued');
});

test('deriveStatus: aimed inside horizon and not ended', () => {
  assert.equal(time.deriveStatus({
    localDate: '2026-08-30',
    period: 'morning',
    timeZone: 'UTC',
    now: new Date('2026-08-24T12:00:00Z'),
    cancelledAt: null
  }), 'aimed');
});

test('deriveStatus: settled after period end', () => {
  assert.equal(time.deriveStatus({
    localDate: '2026-08-20',
    period: 'morning',
    timeZone: 'UTC',
    now: new Date('2026-08-24T12:00:00Z'),
    cancelledAt: null
  }), 'settled');
});
