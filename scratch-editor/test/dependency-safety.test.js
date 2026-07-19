const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

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
