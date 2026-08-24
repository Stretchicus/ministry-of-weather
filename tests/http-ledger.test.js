const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');
const { fileOrder } = require('../src/lib/orders');

test('queued orders do not call forecast or archive', async () => {
  const db = openDb(':memory:');
  const calls = [];
  const weather = {
    geocode: async () => [],
    currentForCity: async () => null,
    forecastSlice: async () => { calls.push('forecast'); return null; },
    archiveSlice: async () => { calls.push('archive'); return null; }
  };
  const now = () => new Date('2026-08-24T12:00:00Z');
  const app = createApp({ db, now, weather });
  const agent = request.agent(app);
  await agent.get('/');
  db.prepare(`UPDATE visitors SET display_name = ?`).run('Darren G');
  const visitor = db.prepare(`SELECT * FROM visitors`).get();
  fileOrder(db, visitor, {
    placeName: 'Croydon', country: 'UK', latitude: 51.376, longitude: -0.098,
    timezone: 'UTC', localDate: '2026-12-25', period: 'morning',
    condition: 'sun', temperatureC: 10, wind: 'calm', humidity: 'pleasant', reason: 'Christmas'
  }, now());
  const res = await agent.get('/ledger');
  assert.match(res.text, /not yet aimed/i);
  assert.deepEqual(calls, []);
  db.close();
});

test('settled mismatch names a rival', async () => {
  const db = openDb(':memory:');
  const weather = {
    currentForCity: async () => null,
    forecastSlice: async () => null,
    archiveSlice: async () => ({ temperatureC: 8, condition: 'rain', wind: 'gale', humidity: 'muggy' })
  };
  const now = () => new Date('2026-08-24T12:00:00Z');
  const app = createApp({ db, now, weather });
  const agent = request.agent(app);
  await agent.get('/');
  db.prepare(`UPDATE visitors SET display_name = ?`).run('Darren G');
  const visitor = db.prepare(`SELECT * FROM visitors`).get();
  fileOrder(db, visitor, {
    placeName: 'Croydon', country: 'UK', latitude: 51.376, longitude: -0.098,
    timezone: 'UTC', localDate: '2026-08-20', period: 'morning',
    condition: 'sun', temperatureC: 22, wind: 'calm', humidity: 'dry', reason: 'a picnic'
  }, new Date('2026-08-01T12:00:00Z'));
  const res = await agent.get('/ledger');
  assert.match(res.text, /already/i);
  db.close();
});
