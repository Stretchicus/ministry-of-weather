const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { openDb } = require('../src/db');
const { createApp } = require('../src/app');

test('home sets a visitor cookie and shows the disclaimer', async () => {
  const db = openDb(':memory:');
  const app = createApp({ db, now: () => new Date('2026-08-24T12:00:00Z'), weather: { currentForCity: async () => null, recentOrders: () => [] } });
  const res = await request(app).get('/');
  assert.equal(res.status, 200);
  assert.match(res.text, /cannot change the weather/i);
  assert.match(res.headers['set-cookie'].join(';'), /ministry_visitor=/);
  db.close();
});
