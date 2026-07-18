const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const hull = require('../vendor/hull.js');

test('the bundled hull compatibility implementation never evaluates format strings', () => {
    const source = fs.readFileSync(require.resolve('../vendor/hull.js'), 'utf8');
    assert.doesNotMatch(source, /new Function|eval\s*\(/);
});

test('the bundled hull compatibility implementation closes a convex boundary', () => {
    const result = hull([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5]], Infinity);
    assert.equal(result[0].join(','), result.at(-1).join(','));
    assert.equal(new Set(result.slice(0, -1).map((point) => point.join(','))).size, 4);
});
