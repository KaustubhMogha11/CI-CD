const assert = require('node:assert/strict');
const { compareConfigData, buildComparisonResult } = require('../scripts/compare-config.js');

const result = compareConfigData(
  { a: 1, b: 2 },
  { a: 2, c: 3 }
);

assert.deepEqual(result.added, ['c']);
assert.deepEqual(result.removed, ['b']);
assert.deepEqual(result.changed, ['a: 1 to 2']);

const driftResult = buildComparisonResult({
  ok: false,
  added: ['newKey'],
  removed: ['oldKey'],
  changed: ['value: 1 to 2'],
});

assert.equal(driftResult.exitCode, 0);
assert.equal(driftResult.status, 'DRIFT_DETECTED');

console.log('All config comparison tests passed.');
