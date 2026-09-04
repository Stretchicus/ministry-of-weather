const { test } = require('node:test');
const assert = require('node:assert/strict');
const { names } = require('../config/rivals');

test('invented pool is fifty names, half with an initial', () => {
  assert.equal(names.length, 50);
  assert.equal(new Set(names).size, 50);
  const withInitial = names.filter((name) => name.includes(' '));
  assert.equal(withInitial.length, 25);
  for (const name of names) {
    assert.doesNotMatch(name, /\.$/);
    assert.ok(name.length >= 2);
  }
});

test('invented reasons are why someone wanted that weather', () => {
  const { reasons } = require('../config/rivals');
  const conditions = ['sun', 'rain', 'snow', 'drizzle', 'fog', 'storm'];
  assert.deepEqual(Object.keys(reasons).sort(), [...conditions].sort());
  for (const condition of conditions) {
    const pool = reasons[condition];
    assert.ok(pool.length >= 12, condition);
    assert.equal(new Set(pool).size, pool.length);
    for (const reason of pool) {
      assert.ok(reason.length >= 8 && reason.length <= 140);
      assert.doesNotMatch(reason, /celestial committee|complied, reluctantly|subcommittee|no further action required/i);
    }
  }
});
