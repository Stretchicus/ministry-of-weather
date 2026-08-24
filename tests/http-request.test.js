const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

function appWithGeo() {
  const db = openDb(':memory:');
  const weather = {
    geocode: async () => [{ name: 'Croydon', country: 'United Kingdom', latitude: 51.376, longitude: -0.098, timezone: 'UTC' }],
    currentForCity: async () => null,
    forecastSlice: async () => null,
    archiveSlice: async () => null
  };
  const app = createApp({ db, now: () => new Date('2026-08-24T12:00:00Z'), weather });
  return { db, app };
}

test('rejects a slot that is too soon', async () => {
  const { db, app } = appWithGeo();
  const agent = request.agent(app);
  await agent.get('/');
  const res = await agent
    .post('/request')
    .type('form')
    .send({
      call_me: 'Darren G',
      place: 'Croydon',
      local_date: '2026-08-25',
      period: 'morning',
      condition: 'drizzle',
      temperature_c: '14',
      wind: 'calm',
      humidity: 'pleasant',
      reason: 'a wedding'
    });
  assert.equal(res.status, 200);
  assert.match(res.text, /24 hours/i);
  db.close();
});

test('files a valid request and shows it on the ledger', async () => {
  const { db, app } = appWithGeo();
  const agent = request.agent(app);
  await agent.get('/');
  const res = await agent
    .post('/request')
    .type('form')
    .send({
      call_me: 'Darren G',
      place: 'Croydon',
      local_date: '2026-08-26',
      period: 'afternoon',
      condition: 'drizzle',
      temperature_c: '14',
      wind: 'calm',
      humidity: 'pleasant',
      reason: 'a wedding'
    });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/ledger');
  const ledger = await agent.get('/ledger');
  assert.match(ledger.text, /Croydon/);
  assert.match(ledger.text, /wedding/);
  db.close();
});
