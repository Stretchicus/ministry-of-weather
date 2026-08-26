const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

function appWithGeo(weatherOverrides = {}) {
  const db = openDb(':memory:');
  const weather = {
    geocode: async () => [{ name: 'Croydon', country: 'United Kingdom', label: 'Croydon, England, United Kingdom', latitude: 51.376, longitude: -0.098, timezone: 'UTC' }],
    reverseGeocode: async () => [],
    currentForCity: async () => null,
    forecastSlice: async () => null,
    archiveSlice: async () => null,
    ...weatherOverrides
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

test('place picker keeps the display name on the next stamp', async () => {
  const db = openDb(':memory:');
  const weather = {
    geocode: async () => [
      { name: 'Croydon', country: 'United Kingdom', label: 'Croydon, England, United Kingdom', latitude: 51.376, longitude: -0.098, timezone: 'UTC' },
      { name: 'Croydon', country: 'Australia', label: 'Croydon, Victoria, Australia', latitude: -33.883, longitude: 151.1, timezone: 'Australia/Sydney' }
    ],
    currentForCity: async () => null,
    forecastSlice: async () => null,
    archiveSlice: async () => null
  };
  const app = createApp({ db, now: () => new Date('2026-08-24T12:00:00Z'), weather });
  const agent = request.agent(app);
  await agent.get('/');
  const pick = await agent.post('/request').type('form').send({
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
  assert.equal(pick.status, 200);
  assert.match(pick.text, /Tick one/);
  assert.match(pick.text, /name="call_me"/);
  assert.match(pick.text, /value="Darren G"/);
  assert.doesNotMatch(pick.text, /Filing as/);
  const filed = await agent.post('/request').type('form').send({
    call_me: 'Darren G',
    place: 'Croydon',
    place_index: '1',
    local_date: '2026-08-26',
    period: 'afternoon',
    condition: 'drizzle',
    temperature_c: '14',
    wind: 'calm',
    humidity: 'pleasant',
    reason: 'a wedding'
  });
  assert.equal(filed.status, 302);
  assert.equal(filed.headers.location, '/ledger');
  db.close();
});

test('place picker shows county or state with the parish name', async () => {
  const { db, app } = appWithGeo({
    geocode: async () => [
      { name: 'Stafford', country: 'United Kingdom', label: 'Stafford, England, United Kingdom', latitude: 52.81, longitude: -2.12, timezone: 'Europe/London' },
      { name: 'Stafford', country: 'United States', label: 'Stafford, Virginia, United States', latitude: 38.42, longitude: -77.41, timezone: 'America/New_York' }
    ]
  });
  const agent = request.agent(app);
  await agent.get('/');
  const pick = await agent.post('/request').type('form').send({
    call_me: 'Darren G',
    place: 'Stafford',
    local_date: '2026-08-26',
    period: 'afternoon',
    condition: 'drizzle',
    temperature_c: '14',
    wind: 'calm',
    humidity: 'pleasant',
    reason: 'a wedding'
  });
  assert.equal(pick.status, 200);
  assert.match(pick.text, /Stafford, England, United Kingdom/);
  assert.match(pick.text, /Stafford, Virginia, United States/);
  db.close();
});

test('form 27B offers to take a bearing', async () => {
  const { db, app } = appWithGeo();
  const agent = request.agent(app);
  await agent.get('/');
  const res = await agent.get('/request');
  assert.equal(res.status, 200);
  assert.match(res.text, /I am standing here/);
  assert.match(res.text, /name="here_lat"/);
  assert.match(res.text, /name="here_lon"/);
  assert.doesNotMatch(res.text, /type="submit"[^>]*name="intent"/);
  assert.doesNotMatch(res.text, /name="intent"[^>]*type="submit"/);
  db.close();
});

test('a bearing fills the parish without stamping', async () => {
  const { db, app } = appWithGeo({
    geocode: async () => {
      throw new Error('should not search by name');
    },
    reverseGeocode: async (lat, lon) => {
      assert.equal(lat, 38.422);
      assert.equal(lon, -77.408);
      return [{
        name: 'Stafford',
        country: 'United States',
        label: 'Stafford, Virginia, United States',
        latitude: lat,
        longitude: lon,
        timezone: 'America/New_York'
      }];
    }
  });
  const agent = request.agent(app);
  await agent.get('/');
  const res = await agent.post('/request').type('form').send({
    intent: 'here',
    here_lat: '38.422',
    here_lon: '-77.408',
    call_me: 'Darren G'
  });
  assert.equal(res.status, 200);
  assert.match(res.text, /Stafford, Virginia, United States/);
  assert.match(res.text, /value="38.422"/);
  assert.equal(res.headers.location, undefined);
  db.close();
});

test('stamping with a bearing files the standing parish', async () => {
  let reverseCalls = 0;
  const { db, app } = appWithGeo({
    geocode: async () => {
      throw new Error('should not search by name');
    },
    reverseGeocode: async () => {
      reverseCalls += 1;
      return [{
        name: 'Stafford',
        country: 'United States',
        label: 'Stafford, Virginia, United States',
        latitude: 38.422,
        longitude: -77.408,
        timezone: 'UTC'
      }];
    }
  });
  const agent = request.agent(app);
  await agent.get('/');
  const res = await agent.post('/request').type('form').send({
    call_me: 'Darren G',
    place: 'Stafford, Virginia, United States',
    here_lat: '38.422',
    here_lon: '-77.408',
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
  assert.equal(reverseCalls, 1);
  const ledger = await agent.get('/ledger');
  assert.match(ledger.text, /Stafford/);
  db.close();
});

test('form 27B keeps the name line editable', async () => {
  const { db, app } = appWithGeo();
  const agent = request.agent(app);
  await agent.get('/');
  db.prepare('UPDATE visitors SET display_name = ?').run('Darren G');
  const res = await agent.get('/request');
  assert.equal(res.status, 200);
  assert.match(res.text, /name="call_me"/);
  assert.match(res.text, /value="Darren G"/);
  assert.doesNotMatch(res.text, /type="hidden"[^>]*name="call_me"/);
  assert.doesNotMatch(res.text, /Filing as/);
  db.close();
});

test('a later filing may amend the petitioner name', async () => {
  const { db, app } = appWithGeo({
    geocode: async () => [
      { name: 'Croydon', country: 'United Kingdom', label: 'Croydon, England, United Kingdom', latitude: 51.376, longitude: -0.098, timezone: 'UTC' },
      { name: 'Croydon', country: 'Australia', label: 'Croydon, Victoria, Australia', latitude: -33.883, longitude: 151.1, timezone: 'Australia/Sydney' }
    ]
  });
  const agent = request.agent(app);
  await agent.get('/');
  await agent.post('/request').type('form').send({
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
  const filed = await agent.post('/request').type('form').send({
    call_me: 'Mildred P',
    place: 'Croydon',
    place_index: '1',
    local_date: '2026-08-26',
    period: 'afternoon',
    condition: 'drizzle',
    temperature_c: '14',
    wind: 'calm',
    humidity: 'pleasant',
    reason: 'a wedding'
  });
  assert.equal(filed.status, 302);
  const visitor = db.prepare('SELECT display_name FROM visitors').get();
  assert.equal(visitor.display_name, 'Mildred P');
  const ledger = await agent.get('/ledger');
  assert.match(ledger.text, /Mildred P/);
  db.close();
});

test('form 27B is a departmental schedule not a stack of selects', async () => {
  const { db, app } = appWithGeo();
  const agent = request.agent(app);
  await agent.get('/');
  const res = await agent.get('/request');
  assert.match(res.text, /Meteorological Requisition/i);
  assert.match(res.text, /For official use/i);
  assert.match(res.text, /Found behind the radiator/);
  assert.doesNotMatch(res.text, /name="official/);
  assert.match(res.text, /type="radio"/);
  assert.match(res.text, /name="period"/);
  assert.match(res.text, /name="condition"/);
  assert.doesNotMatch(res.text, /<select\b/i);
  db.close();
});
