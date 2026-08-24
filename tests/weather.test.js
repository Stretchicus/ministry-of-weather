const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');
const { createWeather } = require('../src/lib/weather');

function fakeFetch(map) {
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    const key = [...map.keys()].find((k) => url.startsWith(k) || url.includes(k));
    const body = map.get(key) ?? map.get('default');
    return { ok: true, json: async () => body };
  };
  fetchFn.calls = calls;
  return fetchFn;
}

test('geocode is cached by normalised query', async () => {
  const db = openDb(':memory:');
  const fetchFn = fakeFetch(new Map([['geocoding-api', { results: [{ name: 'Croydon', country: 'United Kingdom', latitude: 51.376, longitude: -0.098, timezone: 'Europe/London' }] }]]));
  const weather = createWeather({ db, fetchFn, now: () => new Date('2026-08-24T00:00:00Z') });
  const a = await weather.geocode('  Croydon  ');
  const b = await weather.geocode('croydon');
  assert.equal(a[0].name, 'Croydon');
  assert.equal(b[0].name, 'Croydon');
  assert.equal(fetchFn.calls.length, 1);
  db.close();
});

test('archive is fetched once and frozen', async () => {
  const db = openDb(':memory:');
  const hourly = {
    time: ['2026-08-20T06:00', '2026-08-20T07:00'],
    temperature_2m: [10, 10],
    relative_humidity_2m: [50, 50],
    weather_code: [61, 61],
    wind_speed_10m: [5, 5]
  };
  const fetchFn = fakeFetch(new Map([['archive-api', { hourly }]]));
  const weather = createWeather({ db, fetchFn, now: () => new Date('2026-08-24T00:00:00Z') });
  const args = { latitude: 51.5, longitude: -0.1, localDate: '2026-08-20', period: 'morning', timezone: 'UTC' };
  await weather.archiveSlice(args);
  await weather.archiveSlice(args);
  assert.equal(fetchFn.calls.length, 1);
  db.close();
});

test('forecast only averages hours from the requested local date', async () => {
  const db = openDb(':memory:');
  const hourly = {
    time: [
      '2026-08-24T06:00',
      '2026-08-24T07:00',
      '2026-08-25T06:00',
      '2026-08-25T07:00'
    ],
    temperature_2m: [10, 10, 30, 30],
    relative_humidity_2m: [50, 50, 90, 90],
    weather_code: [61, 61, 0, 0],
    wind_speed_10m: [5, 5, 50, 50]
  };
  const fetchFn = fakeFetch(new Map([['api.open-meteo.com', { hourly }]]));
  const weather = createWeather({ db, fetchFn, now: () => new Date('2026-08-24T00:00:00Z') });

  const result = await weather.forecastSlice({
    latitude: 51.5,
    longitude: -0.1,
    localDate: '2026-08-24',
    period: 'morning',
    timezone: 'UTC'
  });

  assert.equal(result.temperatureC, 10);
  assert.equal(result.humidity, 'pleasant');
  assert.equal(result.wind, 'calm');
  assert.equal(result.condition, 'rain');
  assert.match(fetchFn.calls[0], /start_date=2026-08-24/);
  assert.match(fetchFn.calls[0], /end_date=2026-08-24/);
  db.close();
});

test('overlapping archive cache misses share one fetch', async () => {
  const db = openDb(':memory:');
  const hourly = {
    time: ['2026-08-20T06:00'],
    temperature_2m: [10],
    relative_humidity_2m: [50],
    weather_code: [61],
    wind_speed_10m: [5]
  };
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { ok: true, json: async () => ({ hourly }) };
  };
  fetchFn.calls = calls;
  const weather = createWeather({ db, fetchFn, now: () => new Date('2026-08-24T00:00:00Z') });
  const args = { latitude: 51.5, longitude: -0.1, localDate: '2026-08-20', period: 'morning', timezone: 'UTC' };

  await Promise.all([
    weather.archiveSlice(args),
    weather.archiveSlice(args)
  ]);

  assert.equal(fetchFn.calls.length, 1);
  db.close();
});
