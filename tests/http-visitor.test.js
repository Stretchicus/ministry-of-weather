const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

function cookieHeader(res) {
  return res.headers['set-cookie'].join('; ');
}

test('home sets a visitor cookie and shows the disclaimer', async () => {
  const db = openDb(':memory:');
  const app = createApp({ db, now: () => new Date('2026-08-24T12:00:00Z'), weather: { currentForCity: async () => null, recentOrders: () => [] } });
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /cannot change the weather/i);
  assert.match(res.text, /Frequent forms/);
  assert.match(res.text, /forms-code">27B/);
  assert.match(res.text, /Weather requisition/);
  assert.match(res.text, /class="forms-toggle"/);
  assert.match(res.text, /aria-haspopup="true"/);
  assert.doesNotMatch(res.text, /<details class="forms-menu">/);
  assert.doesNotMatch(res.text, />File 27B</);
  assert.doesNotMatch(res.text, /Current atmospheric chit/);
  assert.doesNotMatch(res.text, /Filed request/);
  const cookie = cookieHeader(res);
  assert.match(cookie, /ministry_visitor=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.match(cookie, /Max-Age=31536000/);
  db.close();
});

test('visitor cookie is Secure only when the request is HTTPS', async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const db = openDb(':memory:');
    const app = createApp({ db, now: () => new Date('2026-08-24T12:00:00Z'), weather: { currentForCity: async () => null, recentOrders: () => [] } });
    const http = await request(app).get('/');
    assert.doesNotMatch(cookieHeader(http), /Secure/i);
    const https = await request(app).get('/').set('X-Forwarded-Proto', 'https');
    assert.match(cookieHeader(https), /Secure/i);
    db.close();
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
});

test('home board shows requested and actual weather on mixed chits', async () => {
  const db = openDb(':memory:');
  const app = createApp({
    db,
    now: () => new Date('2026-08-24T15:00:00Z'),
    weather: {
      currentForCity: async () => ({ temperatureC: 14, condition: 'drizzle', wind: 'calm', humidity: 'pleasant' }),
      archiveSlice: async () => null,
      forecastSlice: async () => null
    }
  });
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /Weather requested/);
  assert.match(res.text, /Actual weather/);
  assert.match(res.text, /drizzle, 14°C/);
  assert.doesNotMatch(res.text, /Current atmospheric chit/);
  assert.doesNotMatch(res.text, /Filed request/);
  db.close();
});
