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

test('geocode labels include county or state and drop fuzzy near-misses', async () => {
  const db = openDb(':memory:');
  const fetchFn = fakeFetch(new Map([['geocoding-api', {
    results: [
      { name: 'Safford', country: 'United States', admin1: 'Arizona', latitude: 32.83, longitude: -109.71, timezone: 'America/Phoenix', population: 9683 },
      { name: 'Stafford', country: 'United States', admin1: 'Virginia', latitude: 38.42, longitude: -77.41, timezone: 'America/New_York', population: 4320 },
      { name: 'Stafford', country: 'United Kingdom', admin1: 'England', latitude: 52.81, longitude: -2.12, timezone: 'Europe/London', population: 70145 },
      { name: 'Stafford', country: 'United States', admin1: 'Texas', latitude: 29.62, longitude: -95.56, timezone: 'America/Chicago', population: 18459 },
      { name: 'Strafford', country: 'United States', admin1: 'Missouri', latitude: 37.27, longitude: -93.12, timezone: 'America/Chicago', population: 2361 }
    ]
  }]]));
  const weather = createWeather({ db, fetchFn, now: () => new Date('2026-08-24T00:00:00Z') });
  const places = await weather.geocode('Stafford');
  assert.deepEqual(places.map((place) => place.label), [
    'Stafford, England, United Kingdom',
    'Stafford, Texas, United States',
    'Stafford, Virginia, United States'
  ]);
  db.close();
});

test('reverse geocode names the standing parish and uses the GPS coordinates', async () => {
  const db = openDb(':memory:');
  const fetchFn = fakeFetch(new Map([
    ['nominatim.openstreetmap.org/reverse', {
      name: 'Stafford',
      address: { city: 'Stafford', state: 'Virginia', country: 'United States' }
    }],
    ['timezone=auto', { timezone: 'America/New_York' }]
  ]));
  const weather = createWeather({ db, fetchFn, now: () => new Date('2026-08-24T00:00:00Z') });
  const [place] = await weather.reverseGeocode(38.422, -77.408);
  assert.equal(place.name, 'Stafford');
  assert.equal(place.label, 'Stafford, Virginia, United States');
  assert.equal(place.latitude, 38.422);
  assert.equal(place.longitude, -77.408);
  assert.equal(place.timezone, 'America/New_York');
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
