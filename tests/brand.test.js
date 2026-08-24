const { test } = require('node:test');
const assert = require('node:assert/strict');
const brand = require('../config/brand');

test('brand strings are the Ministry', () => {
  assert.equal(brand.name, 'The Ministry of Weather');
  assert.equal(brand.tagline, 'Purveyors of unlikely skies');
  assert.match(brand.disclaimerFull, /cannot change the weather/i);
  assert.match(brand.disclaimerFull, /\bAI\b/);
  assert.equal(brand.nav.file, 'File 27B');
  assert.equal(brand.nav.ledger, 'My ledger');
});
