const { test } = require('node:test');
const assert = require('node:assert/strict');
const forms = require('../config/forms');

test('the forms cupboard lists 27B among frequent requisitions', () => {
  assert.equal(forms.frequent.length > 0, true);
  assert.equal(forms.frequent[0].href, '/request');
  assert.match(forms.frequent[0].label, /27B/);
  assert.equal(forms.other.length >= 6, true);
  for (const form of forms.other) {
    assert.match(form.code, /^[0-9A-Z]+$/);
    assert.ok(form.name.length > 0 && form.name.length <= 40);
    assert.match(form.refusal, /privileg/i);
  }
});
