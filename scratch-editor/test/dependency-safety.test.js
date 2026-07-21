const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const {isDebugBuild} = require('../scripts/build-environment');

function packageVersion(packagePath) {
    return require(path.join(packagePath, 'package.json')).version;
}

test('Scratch runtime dependencies keep UUID on the patched major version', () => {
    const vmUuid = require.resolve('uuid/package.json', {
        paths: [path.join(__dirname, '../node_modules/@scratch/scratch-vm')],
    });
    const tooltipUuid = require.resolve('uuid/package.json', {
        paths: [path.join(__dirname, '../node_modules/react-tooltip')],
    });

    assert.equal(packageVersion(path.dirname(vmUuid)), '11.1.1');
    assert.equal(packageVersion(path.dirname(tooltipUuid)), '11.1.1');
});

test('Scratch debug boxes are enabled only by explicit boolean flags', () => {
    for (const value of [undefined, '', '0', 'false', 'release', 'development']) {
        assert.equal(isDebugBuild(value), false, `${String(value)} should not enable debug boxes`);
    }
    for (const value of ['1', 'true', 'TRUE', ' true ']) {
        assert.equal(isDebugBuild(value), true, `${value} should enable debug boxes`);
    }

    const prepareSource = require('node:fs').readFileSync(
        path.join(__dirname, '../scripts/prepare-upstream.js'),
        'utf8'
    );
    assert.ok(prepareSource.includes('isDebugBuild(process.env.DEBUG)'));
    assert.ok(prepareSource.includes("'process.env.DEBUG': ${debugBuild}"));
});
