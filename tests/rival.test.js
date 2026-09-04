const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rivalForSlot, theatreFiler, theatreRequestedWeather } = require('../src/lib/rival');

test('same slot always yields the same rival', () => {
  const args = { latitude: 51.5074, longitude: -0.1278, localDate: '2026-12-25', period: 'morning', actualCondition: 'rain' };
  assert.deepEqual(rivalForSlot(args), rivalForSlot(args));
});

test('different period changes the rival seed', () => {
  const a = rivalForSlot({ latitude: 51.5, longitude: -0.1, localDate: '2026-12-25', period: 'morning', actualCondition: 'rain' });
  const b = rivalForSlot({ latitude: 51.5, longitude: -0.1, localDate: '2026-12-25', period: 'evening', actualCondition: 'rain' });
  assert.notDeepEqual(a, b);
});

test('theatre filer is stable for a city-day', () => {
  const a = theatreFiler({ cityId: 'london', localDate: '2026-08-24', condition: 'drizzle' });
  const b = theatreFiler({ cityId: 'london', localDate: '2026-08-24', condition: 'drizzle' });
  assert.deepEqual(a, b);
});

test('theatre requested weather nudges temperature within three degrees', () => {
  const actual = { temperatureC: 14, condition: 'drizzle', wind: 'calm', humidity: 'pleasant' };
  const a = theatreRequestedWeather({ cityId: 'london', localDate: '2026-08-24', actual });
  const b = theatreRequestedWeather({ cityId: 'london', localDate: '2026-08-24', actual });
  assert.deepEqual(a, b);
  assert.equal(a.condition, 'drizzle');
  assert.equal(a.wind, 'calm');
  assert.equal(a.humidity, 'pleasant');
  assert.ok(Math.abs(a.temperatureC - 14) <= 3);
});
