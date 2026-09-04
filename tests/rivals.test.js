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
