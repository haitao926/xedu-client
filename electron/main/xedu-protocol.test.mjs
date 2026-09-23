import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerXeduProtocolClient } = require('./xedu-protocol.js');

function fakeApp() {
    const calls = [];
    return {
        calls,
        setAsDefaultProtocolClient(...args) {
            calls.push(['set', ...args]);
            return true;
        },
        removeAsDefaultProtocolClient(...args) {
            calls.push(['remove', ...args]);
            return true;
        },
    };
}

const devArgv = ['/fake/Electron', 'electron/main/main.js'];

test('macOS electron:dev does not register Electron.app as the xedu handler', () => {
    const app = fakeApp();
    const result = registerXeduProtocolClient(app, {
        platform: 'darwin',
        defaultApp: true,
        execPath: '/fake/Electron',
        argv: devArgv,
    });
    assert.equal(result, 'released-darwin-dev');
    assert.deepEqual(app.calls, [['remove', 'xedu']]);
});

test('macOS electron:dev leaves an existing non-Electron handler alone', () => {
    const app = fakeApp();
    app.removeAsDefaultProtocolClient = (protocol) => {
        app.calls.push(['remove', protocol]);
        return false;
    };
    const result = registerXeduProtocolClient(app, {
        platform: 'darwin',
        defaultApp: true,
        execPath: '/fake/Electron',
        argv: devArgv,
    });
    assert.equal(result, 'skipped-darwin-dev');
    assert.deepEqual(app.calls, [['remove', 'xedu']]);
});

test('packaged macOS still registers xedu on the real app bundle', () => {
    const app = fakeApp();
    const result = registerXeduProtocolClient(app, {
        platform: 'darwin',
        defaultApp: undefined,
        execPath: '/Applications/XEdu Client.app/Contents/MacOS/XEdu Client',
        argv: ['/Applications/XEdu Client.app/Contents/MacOS/XEdu Client'],
    });
    assert.equal(result, 'registered-packaged');
    assert.deepEqual(app.calls, [['set', 'xedu']]);
});

test('Windows dev still registers execPath plus the app entry', () => {
    const app = fakeApp();
    const result = registerXeduProtocolClient(app, {
        platform: 'win32',
        defaultApp: true,
        execPath: 'C:\\electron\\electron.exe',
        argv: ['C:\\electron\\electron.exe', 'electron\\main\\main.js'],
    });
    assert.equal(result, 'registered-dev-exec');
    assert.deepEqual(app.calls, [[
        'set',
        'xedu',
        'C:\\electron\\electron.exe',
        [path.resolve('electron\\main\\main.js')],
    ]]);
});

test('Linux dev keeps the execPath plus app entry call', () => {
    const app = fakeApp();
    const result = registerXeduProtocolClient(app, {
        platform: 'linux',
        defaultApp: true,
        execPath: '/usr/bin/electron',
        argv: devArgv,
    });
    assert.equal(result, 'registered-dev-exec');
    assert.deepEqual(app.calls, [[
        'set',
        'xedu',
        '/usr/bin/electron',
        [path.resolve('electron/main/main.js')],
    ]]);
});

test('packaged Windows and Linux register the protocol with no extra args', () => {
    for (const platform of ['win32', 'linux']) {
        const app = fakeApp();
        const result = registerXeduProtocolClient(app, {
            platform,
            defaultApp: false,
            argv: ['XEdu Client.exe'],
        });
        assert.equal(result, 'registered-packaged');
        assert.deepEqual(app.calls, [['set', 'xedu']]);
    }
});

test('non-mac dev without an app entry falls through to the packaged call', () => {
    const app = fakeApp();
    const result = registerXeduProtocolClient(app, {
        platform: 'win32',
        defaultApp: true,
        execPath: 'C:\\electron\\electron.exe',
        argv: ['C:\\electron\\electron.exe'],
    });
    assert.equal(result, 'registered-packaged');
    assert.deepEqual(app.calls, [['set', 'xedu']]);
});
