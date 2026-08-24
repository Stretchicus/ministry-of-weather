const { test } = require('node:test');
const assert = require('node:assert/strict');
const slice = require('../src/lib/slice');

test('wind and humidity buckets', () => {
  assert.equal(slice.windCategory(11.9), 'calm');
  assert.equal(slice.windCategory(12), 'breeze');
  assert.equal(slice.windCategory(40), 'breeze');
  assert.equal(slice.windCategory(40.1), 'gale');
  assert.equal(slice.humidityCategory(39.9), 'dry');
  assert.equal(slice.humidityCategory(40), 'pleasant');
  assert.equal(slice.humidityCategory(70), 'pleasant');
  assert.equal(slice.humidityCategory(70.1), 'muggy');
});

test('WMO codes map to Ministry conditions', () => {
  assert.equal(slice.wmoToCondition(0), 'sun');
  assert.equal(slice.wmoToCondition(51), 'drizzle');
  assert.equal(slice.wmoToCondition(61), 'rain');
  assert.equal(slice.wmoToCondition(71), 'snow');
  assert.equal(slice.wmoToCondition(45), 'fog');
  assert.equal(slice.wmoToCondition(95), 'storm');
});

test('representativeSlice averages the morning band', () => {
  const hourly = {
    time: ['2026-08-25T05:00', '2026-08-25T06:00', '2026-08-25T07:00', '2026-08-25T12:00'],
    temperature_2m: [10, 20, 22, 99],
    relative_humidity_2m: [50, 50, 50, 10],
    weather_code: [0, 0, 0, 95],
    wind_speed_10m: [5, 5, 5, 80]
  };
  const actual = slice.representativeSlice(hourly, 'morning');
  assert.equal(actual.temperatureC, 21);
  assert.equal(actual.condition, 'sun');
  assert.equal(actual.wind, 'calm');
  assert.equal(actual.humidity, 'pleasant');
});

test('isMatch uses ±3C and category equality', () => {
  const requested = { condition: 'sun', temperatureC: 20, wind: 'calm', humidity: 'pleasant' };
  assert.equal(slice.isMatch(requested, { condition: 'sun', temperatureC: 23, wind: 'calm', humidity: 'pleasant' }), true);
  assert.equal(slice.isMatch(requested, { condition: 'sun', temperatureC: 24, wind: 'calm', humidity: 'pleasant' }), false);
  assert.equal(slice.isMatch(requested, { condition: 'rain', temperatureC: 20, wind: 'calm', humidity: 'pleasant' }), false);
});
