import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    CONTRACT_REVISION,
    MAX_ANSWERS_JSON_BYTES,
    PROTOCOL_VERSION,
    packageCacheDirectory,
    projectFileEvidenceAttachment,
    createLocalTaskSession,
    createLaunchOpener,
    defaultRequest,
    experimentCaptureRect,
    isLoopbackClassroomHost,
    normalizeScoreDraft,
    parseOpenLocalTaskLink,
    tlsOptionsForUrl,
} = require('./xedu-local-task-launch.js');

function sha256(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}

function makeStoredZip(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const file of files) {
        const name = Buffer.from(file.name, 'utf8');
        const data = Buffer.from(file.data);
        const local = Buffer.alloc(30 + name.length);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0, 8);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        name.copy(local, 30);
        locals.push(local, data);
        const central = Buffer.alloc(46 + name.length);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(offset, 42);
        name.copy(central, 46);
        centrals.push(central);
        offset += local.length + data.length;
    }
    const centralBuf = Buffer.concat(centrals);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(centralBuf.length, 12);
    eocd.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, centralBuf, eocd]);
}

function makeCert() {
    const dir = mkdtempSync(path.join(tmpdir(), 'xedu-cert-'));
    const keyPath = path.join(dir, 'key.pem');
    const certPath = path.join(dir, 'cert.pem');
    execFileSync('openssl', [
        'req', '-x509', '-newkey', 'rsa:2048', '-keyout', keyPath, '-out', certPath,
        '-days', '1', '-nodes', '-subj', '/CN=127.0.0.1',
    ], { stdio: 'ignore' });
    const material = { key: readFileSync(keyPath), cert: readFileSync(certPath) };
    rmSync(dir, { recursive: true, force: true });
    return material;
}

function startMock(cert, handler) {
    const requests = [];
    const server = https.createServer({ key: cert.key, cert: cert.cert }, (req, res) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
            const body = Buffer.concat(chunks);
            const url = new URL(req.url, 'https://127.0.0.1');
            const record = { method: req.method, path: `${url.pathname}${url.search}`, headers: req.headers, body };
            requests.push(record);
            handler({ req, res, url, body, requests });
        });
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                origin: `https://127.0.0.1:${port}`,
                requests,
                close: () => new Promise((done) => server.close(done)),
            });
        });
    });
}

function httpsRequest() {
    return ({ url, method = 'GET', headers = {}, body = null, timeoutMs = 5000 }) => new Promise((resolve, reject) => {
        const req = https.request(url, { method, headers, timeout: timeoutMs, rejectUnauthorized: false }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { timedOut: true })));
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

function coursePackage(courseId = 'pkg-course') {
    const course = {
        id: courseId,
        version: '3',
        title: '包内课程',
        sections: [{
            title: '第 1 课',
            experiments: [{ title: '实验', files: [{ path: 'labs/quiz.html', type: 'html' }] }],
        }],
    };
    const zip = makeStoredZip([
        { name: 'course.json', data: JSON.stringify(course) },
        { name: 'labs/quiz.html', data: '<!doctype html><canvas id="lab"></canvas>' },
    ]);
    return { course, zip, sha256: sha256(zip), size: zip.length };
}

function exchangePayload(origin, pkg, extra = {}) {
    return {
        ok: true,
        protocol_version: PROTOCOL_VERSION,
        contract_revision: CONTRACT_REVISION,
        task_grant: 'task-grant-secret',
        grant_expires_at: '2099-01-01T00:00:00.000Z',
        learner_scope: 'learner-a',
        platform_activity_id: 'plat-act-1',
        course_id: 'pkg-course',
        cid: 'learnsite-cid-should-not-be-used',
        activity_id: 'activity-1',
        resource_id: 'labs/quiz.html',
        course_version: '3',
        package_sha256: pkg.sha256,
        package_size: pkg.size,
        package_url: `${origin}/packages/course.zip`,
        ...extra,
    };
}

function json(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
}

test('platform package replaces stale local course content for a task launch', async (t) => {
    const root = mkdtempSync(path.join(tmpdir(), 'xedu-local-first-'));
    const local = path.join(root, '本地 course');
    mkdirSync(path.join(local, 'labs'), { recursive: true });
    writeFileSync(path.join(local, 'course.json'), JSON.stringify({ id: 'pkg-course', version: '3' }));
    writeFileSync(path.join(local, 'labs/quiz.html'), '<h1>stale local resource</h1>');
    writeFileSync(path.join(local, 'obsolete.txt'), 'remove this file');
    const pkg = coursePackage();
    const origin = 'https://learn.example';
    const calls = [];
    const session = createLocalTaskSession({
        cacheRoot: path.join(root, 'cache'),
        resolveLocalCourseRoot: async () => local,
        request: async (req) => {
            calls.push(req);
            const body = req.url.endsWith('/launch/exchange')
                ? exchangePayload(origin, pkg)
                : req.url.endsWith('/artifacts') ? { upload_id: 'local-shot', size: 3 }
                    : req.url.endsWith('/submissions') ? { ok: true, status: 'completed' } : null;
            return { status: 200, body: body ? Buffer.from(JSON.stringify(body)) : pkg.zip };
        },
    });
    t.after(async () => { await session.close(); rmSync(root, { recursive: true, force: true }); });
    const opened = await session.openLocalTask({ launchGrant: 'first', platformOrigin: origin });
    assert.equal(opened.ok, true);
    assert.equal(opened.course_root, local);
    assert.equal(opened.course.local_path, local);
    assert.equal(calls.filter((req) => req.url.includes('/packages/')).length, 1);
    assert.equal(fs.existsSync(path.join(local, 'obsolete.txt')), false);
    assert.equal(fs.existsSync(path.join(local, '.xedu-package-sha256')), false);
    const resource = await defaultRequest({ url: opened.lab_url });
    assert.equal(resource.status, 200);
    assert.equal(resource.body.toString(), '<!doctype html><canvas id="lab"></canvas>');
});

test('matching local course opens when the platform package download is invalid', async (t) => {
    const root = mkdtempSync(path.join(tmpdir(), 'xedu-local-package-fallback-'));
    const local = path.join(root, 'docs', 'course');
    mkdirSync(path.join(local, 'labs'), { recursive: true });
    writeFileSync(path.join(local, 'course.json'), JSON.stringify({ id: 'pkg-course', version: '3' }));
    writeFileSync(path.join(local, 'labs/quiz.html'), '<h1>local course content</h1>');
    const pkg = coursePackage();
    let packageGets = 0;
    const session = createLocalTaskSession({
        cacheRoot: path.join(root, 'cache'),
        sleep: async () => {},
        resolveLocalCourseRoot: async () => local,
        request: async ({ url }) => {
            if (url.endsWith('/launch/exchange')) {
                return { status: 200, body: Buffer.from(JSON.stringify(exchangePayload('https://learn.example', pkg))) };
            }
            packageGets += 1;
            return { status: 200, body: Buffer.from('HTML proxy error page') };
        },
    });
    t.after(async () => { await session.close(); rmSync(root, { recursive: true, force: true }); });

    const opened = await session.openLocalTask('xedu://open-local-task?launch_grant=local-fallback&platform_origin=https%3A%2F%2Flearn.example');
    assert.equal(opened.ok, true, opened.message);
    assert.equal(opened.course_root, local);
    assert.equal(packageGets, 4);
    const response = await defaultRequest({ url: opened.lab_url });
    assert.equal(response.status, 200);
    assert.equal(response.body.toString(), '<h1>local course content</h1>');
});

test('main resolver finds a matching course below Documents/XeduCourses when no root is configured', () => {
    const source = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
    const start = source.indexOf('function resolveConfiguredLocalCourseRoot(');
    const end = source.indexOf('function getLocalTaskSession(', start);
    const home = mkdtempSync(path.join(tmpdir(), 'xedu-default-course-root-'));
    const userData = path.join(home, 'user-data');
    const documents = path.join(home, 'Documents');
    const project = path.join(home, 'repo', 'docs', 'course');
    const courseRoot = path.join(documents, 'XeduCourses', 'mqtt-publish-subscribe-grade8');
    mkdirSync(path.join(userData, 'config'), { recursive: true });
    mkdirSync(courseRoot, { recursive: true });
    mkdirSync(path.join(project, 'lesson1'), { recursive: true });
    writeFileSync(path.join(userData, 'config', 'config.json'), JSON.stringify({
        ui: { course_root: '' }, jupyter: { project_dir: path.join(project, 'lesson1') },
    }));
    writeFileSync(path.join(courseRoot, 'course.json'), JSON.stringify({ id: 'mqtt-publish-subscribe-grade8', version: '0.5.2' }));
    writeFileSync(path.join(project, 'course.json'), JSON.stringify({ id: 'docs-course', version: '1.0' }));
    const context = vm.createContext({
        fs,
        path,
        app: { getPath: (name) => name === 'userData' ? userData : documents },
    });
    try {
        vm.runInContext(source.slice(start, end), context);
        assert.equal(context.resolveConfiguredLocalCourseRoot({ course_id: 'mqtt-publish-subscribe-grade8' }), courseRoot);
        assert.equal(context.resolveConfiguredLocalCourseRoot({ course_id: 'docs-course' }), project);
        assert.equal(context.resolveConfiguredLocalCourseRoot({ course_id: 'other-course' }), null);
    } finally {
        rmSync(home, { recursive: true, force: true });
    }
});

test('main resolver handles Windows Documents and project paths', () => {
    const source = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
    const start = source.indexOf('function resolveConfiguredLocalCourseRoot(');
    const end = source.indexOf('function getLocalTaskSession(', start);
    const winPath = path.win32;
    const userData = 'C:\\Users\\学生\\AppData\\Roaming\\xedu-client';
    const documents = 'C:\\Users\\学生\\Documents';
    const project = 'D:\\课程项目\\docs\\mqtt-course\\lesson1';
    const courseRoot = winPath.join(documents, 'XeduCourses', 'mqtt-publish-subscribe-grade8');
    const projectCourseRoot = winPath.join('D:\\课程项目', 'docs', 'mqtt-course');
    const files = new Map([
        [winPath.join(userData, 'config', 'config.json'), JSON.stringify({
            ui: { course_root: '' },
            jupyter: { project_dir: project },
        })],
        [winPath.join(courseRoot, 'course.json'), JSON.stringify({ id: 'mqtt-publish-subscribe-grade8', version: '0.5.2' })],
        [winPath.join(projectCourseRoot, 'course.json'), JSON.stringify({ id: 'docs-course', version: '1.0' })],
    ]);
    const directories = new Set([
        winPath.normalize(documents),
        winPath.normalize(winPath.join(documents, 'XeduCourses')),
        winPath.normalize(courseRoot),
        winPath.normalize(project),
        winPath.normalize(projectCourseRoot),
    ]);
    const fakeFs = {
        readFileSync(filePath) {
            const content = files.get(winPath.normalize(filePath));
            if (content === undefined) throw new Error(`missing file: ${filePath}`);
            return content;
        },
        statSync(filePath) {
            return { isDirectory: () => directories.has(winPath.normalize(filePath)) };
        },
        readdirSync(directory) {
            if (winPath.normalize(directory) === winPath.normalize(winPath.join(documents, 'XeduCourses'))) {
                return [{ name: 'mqtt-publish-subscribe-grade8', isDirectory: () => true }];
            }
            return [];
        },
    };
    const context = vm.createContext({
        fs: fakeFs,
        path: winPath,
        app: { getPath: (name) => name === 'userData' ? userData : documents },
    });
    vm.runInContext(source.slice(start, end), context);
    assert.equal(context.resolveConfiguredLocalCourseRoot({ course_id: 'mqtt-publish-subscribe-grade8' }), courseRoot);
    assert.equal(context.resolveConfiguredLocalCourseRoot({ course_id: 'docs-course' }), projectCourseRoot);
    assert.equal(context.resolveConfiguredLocalCourseRoot({ course_id: 'missing-course' }), null);
});

async function openSession({ handler, sleep, createRequestId, pkg }) {
    const cert = makeCert();
    const mock = await startMock(cert, handler);
    const cacheRoot = mkdtempSync(path.join(tmpdir(), 'xedu-cache-'));
    const delays = [];
    const session = createLocalTaskSession({
        cacheRoot,
        request: httpsRequest(),
        sleep: sleep || (async (ms) => { delays.push(ms); }),
        createRequestId: createRequestId || (() => randomUUID()),
        now: () => Date.parse('2026-09-22T00:00:00.000Z'),
    });
    const link = `xedu://open-local-task?launch_grant=${encodeURIComponent('launch-grant-secret')}&platform_origin=${encodeURIComponent(mock.origin)}`;
    return { mock, session, cacheRoot, delays, link, pkg: pkg || coursePackage() };
}

test('deep link parser accepts the local task link and rejects practice links', () => {
    const parsed = parseOpenLocalTaskLink('xedu://open-local-task?launch_grant=abc&platform_origin=https%3A%2F%2Flearn.example');
    assert.equal(parsed.launchGrant, 'abc');
    assert.equal(parsed.platformOrigin, 'https://learn.example');
    assert.equal(parsed.legacyLaunch, false);
    const legacy = parseOpenLocalTaskLink('xedu://open-local-task?grant=live-grant&platform_origin=https%3A%2F%2Flocalhost');
    assert.equal(legacy.launchGrant, 'live-grant');
    assert.equal(legacy.platformOrigin, 'https://localhost');
    assert.equal(legacy.legacyLaunch, true);
    const both = parseOpenLocalTaskLink('xedu://open-local-task?grant=old&launch_grant=new&platform_origin=https%3A%2F%2Flearn.example');
    assert.equal(both.launchGrant, 'new');
    assert.equal(both.legacyLaunch, false);
    assert.equal(parseOpenLocalTaskLink('xedu://open-practice?project=/tmp&file=a.ipynb'), null);
    assert.equal(parseOpenLocalTaskLink('http://open-local-task?launch_grant=abc&platform_origin=https://learn.example'), null);
    assert.equal(parseOpenLocalTaskLink('xedu://open-local-task?grant=&platform_origin=https://learn.example'), null);
});

test('deep link parser accepts valid HTTP origins without a host allowlist', () => {
    const link = parseOpenLocalTaskLink('xedu://open-local-task?launch_grant=abc&platform_origin=http%3A%2F%2F10.19.174.251%3A8088');
    assert.equal(link.platformOrigin, 'http://10.19.174.251:8088');
    for (const origin of ['http://classroom.example:8088', 'http://203.0.113.20:8088', 'http://localhost:8088']) {
        const accepted = parseOpenLocalTaskLink(`xedu://open-local-task?launch_grant=abc&platform_origin=${encodeURIComponent(origin)}`);
        assert.equal(accepted.platformOrigin, origin);
    }
    for (const origin of [
        'http://user@10.19.174.251:8088',
        'http://10.19.174.251:8088/path',
        'http://10.19.174.251:8088?mode=lan',
        'http://10.19.174.251:8088#fragment',
    ]) {
        assert.equal(parseOpenLocalTaskLink(`xedu://open-local-task?launch_grant=abc&platform_origin=${encodeURIComponent(origin)}`), null, origin);
    }
});

test('HTTP completes exchange, same-origin package download, and score submission without configuration', async () => {
    const origin = 'http://classroom.example:8088';
    const pkg = coursePackage();
    const cacheRoot = mkdtempSync(path.join(tmpdir(), 'xedu-lan-allow-'));
    const requests = [];
    const session = createLocalTaskSession({
        cacheRoot,
        createRequestId: () => 'http-request-1',
        request: async ({ url, method, body }) => {
            requests.push({ url, method, body });
            if (url === `${origin}/api/xedu/v1/launch/exchange`) {
                return { status: 200, body: Buffer.from(JSON.stringify(exchangePayload(origin, pkg))) };
            }
            if (url === `${origin}/packages/course.zip`) return { status: 200, body: pkg.zip };
            if (url === `${origin}/api/xedu/v1/submissions` && method === 'POST') {
                return { status: 200, body: Buffer.from(JSON.stringify({ ok: true, status: 'completed', request_id: 'http-request-1' })) };
            }
            if (url.startsWith(`${origin}/api/xedu/v1/submissions/status?`)) {
                return { status: 404, body: Buffer.from('{}') };
            }
            throw new Error(`unexpected request ${method} ${url}`);
        },
    });
    try {
        const opened = await session.openLocalTask(`xedu://open-local-task?launch_grant=lan&platform_origin=${encodeURIComponent(origin)}`);
        assert.equal(opened.ok, true, opened.message);
        assert.equal(requests.map((request) => request.url).join(','), `${origin}/api/xedu/v1/launch/exchange,${origin}/packages/course.zip`);
        assert.equal(session.setDraft({ name: 'LAN score', value: 95 }).ok, true);
        const saved = await session.saveScore();
        assert.equal(saved.platform_status, 'completed');
        assert.equal(requests.at(-1).url, `${origin}/api/xedu/v1/submissions`);
        assert.equal(JSON.parse(requests.at(-1).body.toString('utf8')).platform_origin, origin);
    } finally {
        await session.close();
        rmSync(cacheRoot, { recursive: true, force: true });
    }
});

test('HTTP completed text without ok=true is never treated as a saved submission', async () => {
    const pkg = coursePackage();
    const { mock, session, link } = await openSession({
        pkg,
        handler: ({ req, res, url }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), pkg));
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.end(pkg.zip);
                return;
            }
            if (url.pathname.endsWith('/submissions')) {
                json(res, 200, { status: 'completed' });
                return;
            }
            json(res, 404, { ok: false, code: 'SUBMISSION_NOT_FOUND' });
        },
    });
    try {
        assert.equal((await session.openLocalTask(link)).ok, true);
        assert.equal((await session.setDraft({ name: '成绩', value: 80 })).ok, true);
        const result = await session.saveScore();
        assert.equal(result.ok, false);
        assert.notEqual(result.platform_status, 'completed');
    } finally {
        await session.close();
        await mock.close();
    }
});

test('HTTP package URL must match the launch origin before download', async () => {
    const origin = 'http://classroom.example:8088';
    const pkg = coursePackage();
    const cacheRoot = mkdtempSync(path.join(tmpdir(), 'xedu-lan-package-origin-'));
    const requests = [];
    const session = createLocalTaskSession({
        cacheRoot,
        request: async ({ url }) => {
            requests.push(url);
            return {
                status: 200,
                body: Buffer.from(JSON.stringify(exchangePayload(origin, pkg, {
                    package_url: 'http://other.example:8088/packages/course.zip',
                }))),
            };
        },
    });
    try {
        const result = await session.openLocalTask(`xedu://open-local-task?launch_grant=mismatch&platform_origin=${encodeURIComponent(origin)}`);
        assert.equal(result.ok, false);
        assert.equal(result.code, 'package_url_invalid');
        assert.equal(requests.length, 1);
    } finally {
        await session.close();
        rmSync(cacheRoot, { recursive: true, force: true });
    }
});

for (const scenario of [
    {
        name: 'exchange HTTP 400 package_invalid keeps the platform package-config message and skips local/package reads',
        response: {
            status: 400,
            body: Buffer.from(JSON.stringify({
                ok: false,
                code: 'package_invalid',
                message: '课程包配置不完整，请让老师重新上传课程包后再打开。',
            })),
        },
    },
    {
        name: 'exchange 200 ok:false package_invalid keeps the platform package-config message and skips local/package reads',
        response: {
            status: 200,
            body: Buffer.from(JSON.stringify({
                ok: false,
                code: 'package_invalid',
                message: '课程包配置不完整，请让老师重新上传课程包后再打开。',
            })),
        },
    },
    {
        name: 'exchange package_invalid hides an unsafe platform message',
        response: {
            status: 400,
            body: Buffer.from(JSON.stringify({
                ok: false,
                code: 'package_invalid',
                message: 'Authorization: Bearer private-launch-value',
            })),
        },
        expectedMessage: '平台下发的课程包信息不完整，请让教师重新上传并绑定课程包。',
    },
    {
        name: 'exchange 200 package_invalid without a message explains the package configuration failure',
        response: {
            status: 200,
            body: Buffer.from(JSON.stringify({ ok: false, code: 'package_invalid' })),
        },
        expectedMessage: '平台下发的课程包信息不完整，请让教师重新上传并绑定课程包。',
    },
]) {
    test(scenario.name, async () => {
        const origin = 'http://10.74.136.127:8088';
        const cacheRoot = mkdtempSync(path.join(tmpdir(), 'xedu-exchange-package-invalid-'));
        const requests = [];
        let resolverCalls = 0;
        const session = createLocalTaskSession({
            cacheRoot,
            resolveLocalCourseRoot: async () => {
                resolverCalls += 1;
                return path.join(cacheRoot, 'unexpected-local-course');
            },
            request: async ({ url, method }) => {
                requests.push({ url, method });
                if (url === `${origin}/api/xedu/v1/launch/exchange`) return scenario.response;
                throw new Error(`unexpected request ${method} ${url}`);
            },
        });
        try {
            const result = await session.openLocalTask(`xedu://open-local-task?launch_grant=package-invalid&platform_origin=${encodeURIComponent(origin)}`);
            assert.equal(result.ok, false);
            assert.equal(result.code, 'package_invalid');
            assert.equal(result.message, scenario.expectedMessage || '课程包配置不完整，请让老师重新上传课程包后再打开。');
            assert.deepEqual(requests, [{ url: `${origin}/api/xedu/v1/launch/exchange`, method: 'POST' }]);
            assert.equal(resolverCalls, 0);
        } finally {
            await session.close();
            rmSync(cacheRoot, { recursive: true, force: true });
        }
    });
}

test('defaultRequest uses HTTP and returns redirects without following them', async () => {
    let redirectTargetHits = 0;
    const server = http.createServer((req, res) => {
        if (req.url === '/packages/course.zip') {
            res.writeHead(302, { Location: '/redirect-target' });
            res.end();
            return;
        }
        redirectTargetHits += 1;
        res.writeHead(200);
        res.end('unexpected');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
        const { port } = server.address();
        const response = await defaultRequest({ url: `http://127.0.0.1:${port}/packages/course.zip` });
        assert.equal(response.status, 302);
        assert.equal(redirectTargetHits, 0);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test('generic open deep link restores and shows the main window without launching a task', () => {
    const mainSource = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
    const frontStart = mainSource.indexOf('function bringMainWindowToFront(');
    const frontEnd = mainSource.indexOf('function registerXeduProtocol(', frontStart);
    const dispatchStart = mainSource.indexOf('function dispatchIncomingDeepLink(');
    const dispatchEnd = mainSource.indexOf('// 允许在 BrowserView', dispatchStart);
    const calls = [];
    const context = vm.createContext({
        URL, XEDU_PROTOCOL: 'xedu', console,
        mainWindow: {
            isDestroyed: () => false, isMinimized: () => true, isVisible: () => false,
            restore: () => calls.push('restore'), show: () => calls.push('show'), focus: () => calls.push('focus'),
        },
        parsePracticeDeepLink: () => null,
        parseOpenLocalTaskLink,
        handleOpenLocalTask: () => calls.push('task'),
    });
    vm.runInContext(mainSource.slice(frontStart, frontEnd) + mainSource.slice(dispatchStart, dispatchEnd), context);
    context.dispatchIncomingDeepLink('xedu://open');
    assert.deepEqual(calls, ['restore', 'show', 'focus']);
    calls.length = 0;
    context.dispatchIncomingDeepLink('xedu://unknown');
    assert.deepEqual(calls, []);
    context.dispatchIncomingDeepLink('xedu://open-local-task?launch_grant=abc&platform_origin=http%3A%2F%2F10.19.174.251%3A8088');
    assert.deepEqual(calls, ['task']);
});

test('course launch scope survives exchange while retaining task submission identifiers', async () => {
    const pkg = coursePackage();
    for (const launchScope of ['course', undefined, 'unsupported']) {
        const cacheRoot = mkdtempSync(path.join(tmpdir(), 'xedu-course-scope-'));
        const session = createLocalTaskSession({ cacheRoot, sleep: async () => {}, request: async ({ url }) => ({
            status: 200, body: url.endsWith('/launch/exchange')
                ? Buffer.from(JSON.stringify(exchangePayload('https://learn.example', pkg, { launch_scope: launchScope })))
                : pkg.zip,
        }) });
        try {
            const result = await session.openLocalTask('xedu://open-local-task?launch_grant=course&platform_origin=https%3A%2F%2Flearn.example');
            assert.equal(result.ok, true);
            assert.equal(result.launch_scope || '', launchScope === 'course' ? 'course' : '');
            assert.equal(result.activity_id, 'activity-1');
            assert.equal(result.resource_id, 'labs/quiz.html');
            assert.equal(result.platform_activity_id, 'plat-act-1');
            assert.equal(result.active, true);
            assert.equal(result.course.id, 'pkg-course');
            assert.ok(result.course_root.endsWith('/extracted'));
        } finally { await session.close(); rmSync(cacheRoot, { recursive: true, force: true }); }
    }
});

test('whole course launch loads every package file without requiring a selected experiment', async () => {
    const course = { id: 'pkg-course', title: 'Whole course', sections: [] };
    const files = [
        { name: 'course.json', data: JSON.stringify(course) },
        { name: 'labs/first.ipynb', data: '{"cells":[]}' },
        { name: 'labs/second.py', data: 'print(2)' },
        { name: 'assets/background.txt', data: 'supporting asset' },
    ];
    const zip = makeStoredZip(files);
    const pkg = { zip, sha256: sha256(zip), size: zip.length };
    for (const resourceId of [undefined, '', 'missing.ipynb', 'teacher/guide.md']) {
        const cacheRoot = mkdtempSync(path.join(tmpdir(), 'xedu-whole-course-'));
        let downloads = 0;
        const session = createLocalTaskSession({ cacheRoot, request: async ({ url }) => {
            if (url.endsWith('/launch/exchange')) return {
                status: 200,
                body: Buffer.from(JSON.stringify(exchangePayload('https://learn.example', pkg, {
                    launch_scope: 'course', resource_id: resourceId,
                }))),
            };
            downloads += 1;
            return { status: 200, body: zip };
        } });
        try {
            const result = await session.openLocalTask('xedu://open-local-task?launch_grant=whole&platform_origin=https%3A%2F%2Flearn.example');
            assert.equal(result.ok, true, `${resourceId}: ${result.message}`);
            assert.equal(downloads, 1);
            assert.equal(result.course.id, course.id);
            assert.ok(result.lab_url.endsWith(resourceId ? '/' + resourceId : '/course.json'));
            for (const file of files) {
                assert.equal(readFileSync(path.join(result.course_root, file.name), 'utf8'), file.data);
            }
        } finally { await session.close(); rmSync(cacheRoot, { recursive: true, force: true }); }
    }
});

test('whole course launch still rejects a corrupt package or mismatched course identity', async () => {
    const pkg = coursePackage();
    for (const overrides of [{ package_sha256: '0'.repeat(64) }, { course_id: 'wrong-course' }]) {
        const cacheRoot = mkdtempSync(path.join(tmpdir(), 'xedu-whole-integrity-'));
        const session = createLocalTaskSession({ cacheRoot, sleep: async () => {}, request: async ({ url }) => ({
            status: 200,
            body: url.endsWith('/launch/exchange')
                ? Buffer.from(JSON.stringify(exchangePayload('https://learn.example', pkg, {
                    launch_scope: 'course', resource_id: undefined, ...overrides,
                }))) : pkg.zip,
        }) });
        try {
            const result = await session.openLocalTask('xedu://open-local-task?launch_grant=integrity&platform_origin=https%3A%2F%2Flearn.example');
            assert.equal(result.ok, false);
            assert.equal(result.code, overrides.course_id ? 'course_id_mismatch' : 'package_hash_mismatch');
        } finally { await session.close(); rmSync(cacheRoot, { recursive: true, force: true }); }
    }
});

test('score normalization keeps 0, rejects non-finite values, and does not clamp', () => {
    assert.equal(normalizeScoreDraft({ name: ' 第一题 ', value: 0 }).draft.score, 0);
    assert.equal(normalizeScoreDraft({ name: '第一题', value: 0 }).draft.raw_score, 0);
    assert.equal(normalizeScoreDraft({ name: '第一题', value: 1.5 }).draft.score, 2);
    assert.equal(normalizeScoreDraft({ name: '第一题', value: 1.4 }).draft.score, 1);
    assert.equal(normalizeScoreDraft({ type: 'ols-score/1', name: '题', value: 80, passed: false }).draft.passed, false);
    assert.equal(normalizeScoreDraft({ name: '题', value: '80' }).code, 'score_invalid');
    assert.equal(normalizeScoreDraft({ name: '题', value: null }).code, 'score_invalid');
    assert.equal(normalizeScoreDraft({ name: '题', value: Number.NaN }).code, 'score_invalid');
    assert.equal(normalizeScoreDraft({ name: '题', value: 120 }).code, 'score_invalid');
    assert.equal(normalizeScoreDraft({ type: 'xedu:submit-request', name: '旧接口', value: 10 }).draft.source, 'xedu:submit-request');
});

test('demo submit-request maps numeric score and summary into a draft', () => {
    const withSummary = normalizeScoreDraft({
        type: 'xedu:submit-request',
        score: 50,
        passed: true,
        summary: '选择题',
    });
    assert.equal(withSummary.ok, true);
    assert.equal(withSummary.draft.name, '选择题');
    assert.equal(withSummary.draft.raw_score, 50);
    assert.equal(withSummary.draft.score, 50);
    assert.equal(withSummary.draft.passed, true);
    assert.equal(withSummary.draft.source, 'xedu:submit-request');

    const zero = normalizeScoreDraft({
        type: 'xedu:submit-request',
        score: 0,
        passed: true,
    });
    assert.equal(zero.ok, true);
    assert.equal(zero.draft.name, '测验成绩');
    assert.equal(zero.draft.raw_score, 0);
    assert.equal(zero.draft.score, 0);
    assert.equal(zero.draft.passed, true);

    const payload = normalizeScoreDraft({
        type: 'xedu:submit-request',
        payload: { name: '实验', value: 88 },
        score: 50,
        summary: '不用这条',
    });
    assert.equal(payload.ok, true);
    assert.equal(payload.draft.name, '实验');
    assert.equal(payload.draft.raw_score, 88);
    assert.equal(payload.draft.score, 88);

    const invalid = normalizeScoreDraft({
        type: 'xedu:submit-request',
        score: 101,
        passed: true,
        summary: '超分',
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.code, 'score_invalid');
    assert.equal(invalid.draft, null);
});

test('exchange sends contract revision 2026-09-22 and refuses a mismatch without downgrade', async () => {
    const bodies = [];
    const { mock, session, link } = await openSession({
        handler: ({ res, body, url }) => {
            if (url.pathname === '/api/xedu/v1/launch/exchange') {
                bodies.push(JSON.parse(body.toString('utf8')));
                json(res, 200, { ok: true, protocol_version: 1, contract_revision: '2026-01-01', task_grant: 'nope' });
                return;
            }
            json(res, 500, { ok: false, code: 'network' });
        },
    });
    try {
        const result = await session.openLocalTask(link);
        assert.equal(result.code, 'protocol_mismatch');
        assert.equal(result.platform_status, '');
        assert.equal(bodies.length, 1);
        assert.deepEqual(bodies[0], {
            protocol_version: PROTOCOL_VERSION,
            contract_revision: CONTRACT_REVISION,
            launch_grant: 'launch-grant-secret',
        });
        assert.equal(JSON.stringify(result).includes('launch-grant-secret'), false);
        assert.equal(JSON.stringify(result).includes('task-grant-secret'), false);
        const again = await session.saveScore();
        assert.equal(again.code, 'no_active_task');
        assert.equal(bodies.length, 1);
    } finally {
        await session.close();
        await mock.close();
    }
});

test('live LearnSite grant link exchanges with Bearer and opens from a grant task token', async () => {
    const pkg = coursePackage();
    const seen = [];
    const { mock, session } = await openSession({
        pkg,
        handler: ({ req, res, url, body }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                seen.push({
                    authorization: req.headers.authorization,
                    body: JSON.parse(body.toString('utf8')),
                });
                const payload = exchangePayload(mockOrigin(req), pkg);
                delete payload.contract_revision;
                delete payload.task_grant;
                payload.grant = 'live-task-token';
                json(res, 200, payload);
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': pkg.size });
                res.end(pkg.zip);
                return;
            }
            json(res, 404, { ok: false });
        },
    });
    const link = `xedu://open-local-task?grant=${encodeURIComponent('live-launch-grant')}&platform_origin=${encodeURIComponent(mock.origin)}`;
    try {
        const result = await session.openLocalTask(link);
        assert.equal(result.ok, true, result.message);
        assert.equal(result.activity_id, 'activity-1');
        assert.match(result.lab_url, /labs\/quiz\.html$/);
        assert.equal(seen.length, 1);
        assert.deepEqual(seen[0].body, { protocol_version: PROTOCOL_VERSION });
        assert.equal(seen[0].authorization, 'Bearer live-launch-grant');
        assert.equal(JSON.stringify(result).includes('live-task-token'), false);
        assert.equal(JSON.stringify(result).includes('live-launch-grant'), false);
    } finally {
        await session.close();
        await mock.close();
    }
});

test('legacy exchange still refuses an explicit contract revision mismatch', async () => {
    const { mock, session } = await openSession({
        handler: ({ res, url }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, {
                    ok: true,
                    protocol_version: 1,
                    contract_revision: '2026-01-01',
                    grant: 'live-task-token',
                });
                return;
            }
            json(res, 500, { ok: false });
        },
    });
    const link = `xedu://open-local-task?grant=live-launch-grant&platform_origin=${encodeURIComponent(mock.origin)}`;
    try {
        const result = await session.openLocalTask(link);
        assert.equal(result.code, 'protocol_mismatch');
        assert.equal(result.ok, false);
    } finally {
        await session.close();
        await mock.close();
    }
});

test('package cache is keyed by origin, course id, version, and sha256', async () => {
    const pkg = coursePackage('pkg-course');
    let packageGets = 0;
    const { mock, session, cacheRoot, link } = await openSession({
        pkg,
        handler: ({ req, res, url }) => {
            if (url.pathname === '/api/xedu/v1/launch/exchange') {
                json(res, 200, exchangePayload(mockOrigin(req), pkg));
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                packageGets += 1;
                assert.equal(req.headers.authorization, undefined);
                res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': pkg.size });
                res.end(pkg.zip);
                return;
            }
            json(res, 404, { ok: false });
        },
    });
    const origin = mock.origin;
    try {
        const opened = await session.openLocalTask(link.replace(mock.origin, origin));
        assert.equal(opened.ok, true, opened.message);
        assert.equal(opened.course_id, 'pkg-course');
        assert.notEqual(opened.course_id, 'learnsite-cid-should-not-be-used');
        assert.equal(opened.course.id, 'pkg-course');
        const cacheDir = packageCacheDirectory(cacheRoot, {
            platform_origin: origin,
            course_id: 'pkg-course',
            course_version: '3',
            package_sha256: pkg.sha256,
        });
        assert.equal(readFileSync(path.join(cacheDir, 'package.bin')).equals(pkg.zip), true);
        assert.equal(JSON.parse(readFileSync(path.join(cacheDir, 'extracted', 'course.json'), 'utf8')).id, 'pkg-course');
        const second = await session.openLocalTask(link);
        assert.equal(second.ok, true, second.message);
        assert.equal(packageGets, 1);
        assert.equal(JSON.stringify(opened).includes('task-grant-secret'), false);
    } finally {
        await session.close();
        await mock.close();
    }
});

test('verified package refreshes an existing extraction without its matching package marker', async (t) => {
    const pkg = coursePackage();
    const cacheRoot = mkdtempSync(path.join(tmpdir(), 'xedu-stale-extraction-'));
    const snapshot = {
        platform_origin: 'https://learn.example',
        course_id: 'pkg-course',
        course_version: '3',
        package_sha256: pkg.sha256,
    };
    const cacheDir = packageCacheDirectory(cacheRoot, snapshot);
    const extractedRoot = path.join(cacheDir, 'extracted');
    mkdirSync(path.join(extractedRoot, 'labs'), { recursive: true });
    writeFileSync(path.join(cacheDir, 'package.bin'), pkg.zip);
    writeFileSync(path.join(extractedRoot, 'course.json'), JSON.stringify({ id: 'pkg-course' }));
    writeFileSync(path.join(extractedRoot, 'labs/quiz.html'), '<h1>stale cached content</h1>');
    const session = createLocalTaskSession({
        cacheRoot,
        request: async ({ url }) => ({
            status: 200,
            body: Buffer.from(JSON.stringify(exchangePayload('https://learn.example', pkg))),
        }),
    });
    t.after(async () => { await session.close(); rmSync(cacheRoot, { recursive: true, force: true }); });

    const opened = await session.openLocalTask('xedu://open-local-task?launch_grant=refresh&platform_origin=https%3A%2F%2Flearn.example');
    assert.equal(opened.ok, true, opened.message);
    assert.equal(readFileSync(path.join(opened.course_root, 'labs/quiz.html'), 'utf8'), '<!doctype html><canvas id="lab"></canvas>');
});

function mockOrigin(req) {
    const host = req.headers.host;
    return `https://${host}`;
}

test('course.json id mismatch and package size/hash mismatch return distinct errors', async () => {
    const pkg = coursePackage('other-package');
    const declared = coursePackage('pkg-course');
    const { mock, session, link } = await openSession({
        handler: ({ req, res, url }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), { ...declared, sha256: sha256(pkg.zip), size: pkg.zip.length }));
                return;
            }
            res.writeHead(200);
            res.end(pkg.zip);
        },
    });
    try {
        const mismatch = await session.openLocalTask(link);
        assert.equal(mismatch.code, 'course_id_mismatch');
        assert.match(mismatch.message, /course\.json/);
    } finally {
        await session.close();
        await mock.close();
    }

    const bad = coursePackage('pkg-course');
    const { mock: mock2, session: session2, link: link2 } = await openSession({
        sleep: async () => {},
        handler: ({ req, res, url }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), bad));
                return;
            }
            res.writeHead(200);
            res.end(Buffer.from('not-the-package'));
        },
    });
    try {
        const invalid = await session2.openLocalTask(link2);
        assert.equal(invalid.code, 'package_size_mismatch');
        assert.match(invalid.message, /实际收到/);
    } finally {
        await session2.close();
        await mock2.close();
    }

    const expected = coursePackage('pkg-course');
    const changedBytes = Buffer.from(expected.zip);
    const marker = Buffer.from('<!doctype html><canvas id="lab"></canvas>');
    const markerOffset = changedBytes.indexOf(marker);
    assert.notEqual(markerOffset, -1);
    changedBytes[markerOffset + marker.length - 2] ^= 1;
    const { mock: mock3, session: session3, link: link3 } = await openSession({
        sleep: async () => {},
        handler: ({ req, res, url }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), expected));
                return;
            }
            res.writeHead(200);
            res.end(changedBytes);
        },
    });
    try {
        const invalid = await session3.openLocalTask(link3);
        assert.equal(invalid.code, 'package_hash_mismatch');
        assert.match(invalid.message, /SHA-256/);
    } finally {
        await session3.close();
        await mock3.close();
    }
});

test('screenshot upload is raw bytes plus headers, then a submission that references upload_id', async () => {
    const pkg = coursePackage();
    const seen = [];
    const { mock, session, link } = await openSession({
        pkg,
        createRequestId: () => 'req-shot-1',
        handler: ({ req, res, url, body }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), pkg));
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.writeHead(200);
                res.end(pkg.zip);
                return;
            }
            if (url.pathname.endsWith('/artifacts')) {
                seen.push({
                    kind: 'artifact',
                    filename: req.headers['x-xedu-filename'],
                    sha256: req.headers['x-xedu-sha256'],
                    type: req.headers['content-type'],
                    body,
                    authorization: req.headers.authorization,
                });
                json(res, 201, { ok: true, upload_id: 'upl-1' });
                return;
            }
            if (url.pathname.endsWith('/submissions') && req.method === 'POST') {
                seen.push({ kind: 'submission', body: JSON.parse(body.toString('utf8')) });
                json(res, 200, { ok: true, status: 'completed', request_id: 'req-shot-1', receipt_id: 'rcpt-1' });
                return;
            }
            json(res, 404, { ok: false });
        },
    });
    try {
        const opened = await session.openLocalTask(link);
        assert.equal(opened.ok, true, opened.message);
        await session.setDraft({ name: '已有分', value: 88 });
        const png = Buffer.from([137, 80, 78, 71, 1, 2, 3, 4]);
        const saved = await session.uploadScreenshot({ bytes: png, mime: 'image/png' });
        assert.equal(saved.platform_status, 'completed');
        assert.match(saved.message, /平台已确认/);
        const artifact = seen.find((item) => item.kind === 'artifact');
        assert.equal(artifact.filename, 'experiment-view.png');
        assert.equal(artifact.type, 'image/png');
        assert.equal(artifact.sha256, sha256(png));
        assert.equal(artifact.body.equals(png), true);
        assert.equal(artifact.authorization, 'Bearer task-grant-secret');
        const submission = seen.find((item) => item.kind === 'submission').body;
        assert.equal(submission.request_id, 'req-shot-1');
        assert.equal(submission.course_id, 'pkg-course');
        assert.equal(submission.attachments[0].upload_id, 'upl-1');
        assert.equal(submission.score, null);
        assert.equal(submission.raw_score, null);
        assert.equal(submission.passed, true);
        assert.equal(session.getDraft().name, '已有分');
        assert.equal(JSON.stringify(saved).includes('task-grant-secret'), false);
    } finally {
        await session.close();
        await mock.close();
    }
});

test('submission retries use 1s, 2s, and 4s with the same request id and payload', async () => {
    const pkg = coursePackage();
    const posts = [];
    let attempts = 0;
    const { mock, session, link, delays } = await openSession({
        pkg,
        createRequestId: () => 'req-retry-1',
        handler: ({ req, res, url, body }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), pkg));
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.end(pkg.zip);
                return;
            }
            if (req.method === 'POST' && url.pathname.endsWith('/submissions')) {
                attempts += 1;
                posts.push(body.toString('utf8'));
                if (attempts < 4) {
                    json(res, 503, { ok: false, code: 'network', retryable: true, request_id: 'req-retry-1' });
                    return;
                }
                json(res, 200, { ok: true, status: 'completed', request_id: 'req-retry-1', receipt_id: 'same-receipt' });
            }
        },
    });
    try {
        assert.equal((await session.openLocalTask(link)).ok, true);
        assert.equal((await session.setDraft({ type: 'ols-score/1', name: '题', value: 0, passed: false })).ok, true);
        const saved = await session.saveScore();
        assert.equal(saved.platform_status, 'completed');
        assert.equal(saved.receipt_id, 'same-receipt');
        assert.deepEqual(delays, [1000, 2000, 4000]);
        assert.equal(posts.length, 4);
        assert.equal(posts.every((body) => body === posts[0]), true);
        const payload = JSON.parse(posts[0]);
        assert.equal(payload.request_id, 'req-retry-1');
        assert.equal(payload.raw_score, 0);
        assert.equal(payload.score, 0);
        assert.equal(payload.passed, false);
        assert.equal(payload.course_id, 'pkg-course');
    } finally {
        await session.close();
        await mock.close();
    }
});

test('a timed out submission checks status before it is retried', async () => {
    const pkg = coursePackage();
    let posts = 0;
    let statusGets = 0;
    const { mock, session, link } = await openSession({
        pkg,
        createRequestId: () => 'req-status-1',
        handler: ({ req, res, url }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), pkg));
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.end(pkg.zip);
                return;
            }
            if (req.method === 'POST') {
                posts += 1;
                req.socket.destroy();
                return;
            }
            if (url.pathname.endsWith('/submissions/status')) {
                statusGets += 1;
                assert.equal(url.searchParams.get('request_id'), 'req-status-1');
                json(res, 200, { ok: true, status: 'completed', request_id: 'req-status-1', receipt_id: 'from-status' });
            }
        },
    });
    try {
        assert.equal((await session.openLocalTask(link)).ok, true);
        await session.setDraft({ name: '题', value: 10 });
        const saved = await session.saveScore();
        assert.equal(saved.platform_status, 'completed');
        assert.equal(saved.receipt_id, 'from-status');
        assert.equal(posts, 1);
        assert.equal(statusGets, 1);
    } finally {
        await session.close();
        await mock.close();
    }
});

test('conflict is not retried and an in-flight save blocks a second save', async () => {
    const pkg = coursePackage();
    let posts = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { mock, session, link, delays } = await openSession({
        pkg,
        handler: ({ req, res, url }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), pkg));
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.end(pkg.zip);
                return;
            }
            posts += 1;
            if (posts === 1) {
                json(res, 409, { ok: false, status: 409, code: 'conflict', message: 'conflict', retryable: false, request_id: 'req-x' });
                return;
            }
            void gate.then(() => json(res, 200, { ok: true, status: 'completed', request_id: 'req-y', receipt_id: 'rc' }));
        },
    });
    try {
        assert.equal((await session.openLocalTask(link)).ok, true);
        await session.setDraft({ name: '题', value: 3 });
        const conflict = await session.saveScore();
        assert.equal(conflict.code, 'conflict');
        assert.match(conflict.message, /冲突/);
        assert.deepEqual(delays, []);
        assert.equal(posts, 1);
        await session.setDraft({ name: '题', value: 4 });
        const first = session.saveScore();
        const second = await session.saveScore();
        assert.equal(second.code, 'save_in_flight');
        assert.match(second.message, /正在保存/);
        release();
        assert.equal((await first).platform_status, 'completed');
        assert.equal(posts, 2);
    } finally {
        await session.close();
        await mock.close();
    }
});

test('grant expiry keeps the draft and a different learner_scope cannot restore it', async () => {
    const pkg = coursePackage();
    let mode = 'expire';
    let posts = 0;
    const { mock, session, link } = await openSession({
        pkg,
        handler: ({ req, res, url, body }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                const learner = mode === 'other' ? 'learner-b' : 'learner-a';
                json(res, 200, exchangePayload(mockOrigin(req), pkg, { learner_scope: learner, task_grant: `grant-${learner}` }));
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.end(pkg.zip);
                return;
            }
            posts += 1;
            if (mode === 'expire') {
                json(res, 401, { ok: false, status: 401, code: 'grant_expired', retryable: false, request_id: 'req-exp' });
                return;
            }
            json(res, 200, { ok: true, status: 'completed', request_id: 'req-ok', receipt_id: 'rc' });
            req.setTimeout?.(0);
            void body;
        },
    });
    try {
        assert.equal((await session.openLocalTask(link)).ok, true);
        await session.setDraft({ name: '甲的草稿', value: 70 });
        const expired = await session.saveScore();
        assert.equal(expired.code, 'grant_expired');
        assert.match(expired.message, /草稿已保留/);
        assert.equal(session.getDraft().name, '甲的草稿');
        const blocked = await session.saveScore();
        assert.equal(blocked.code, 'grant_expired');
        assert.equal(posts, 1);
        mode = 'same';
        const restored = await session.openLocalTask(link);
        assert.equal(restored.draft.name, '甲的草稿');
        assert.equal(restored.learner_scope, 'learner-a');
        mode = 'other';
        const other = await session.openLocalTask(link.replace('launch-grant-secret', 'launch-grant-other'));
        assert.equal(other.learner_scope, 'learner-b');
        assert.equal(other.draft, null);
        assert.equal(other.has_draft, false);
        const missing = await session.saveScore();
        assert.equal(missing.code, 'no_score_draft');
        await session.setDraft({ name: '乙的新草稿', value: 5 });
        mode = 'accept';
        const saved = await session.saveScore();
        assert.equal(saved.platform_status, 'completed');
    } finally {
        await session.close();
        await mock.close();
    }
});

test('combined save does not report success when the screenshot is rejected', async () => {
    const pkg = coursePackage();
    let submissions = 0;
    const { mock, session, link } = await openSession({
        pkg,
        handler: ({ req, res, url }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), pkg));
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.end(pkg.zip);
                return;
            }
            if (url.pathname.endsWith('/artifacts')) {
                json(res, 500, { ok: false, code: 'network', retryable: false });
                return;
            }
            submissions += 1;
            json(res, 200, { ok: true, status: 'completed', receipt_id: 'should-not-happen' });
        },
    });
    try {
        assert.equal((await session.openLocalTask(link)).ok, true);
        await session.setDraft({ name: '题', value: 9 });
        const failed = await session.saveCombined({ bytes: Buffer.from([1, 2, 3]), mime: 'image/png' });
        assert.notEqual(failed.platform_status, 'completed');
        assert.equal(failed.ok, false);
        assert.equal(submissions, 0);
        assert.equal(session.getDraft().raw_score, 9);
        const scoreOnly = await session.saveScore();
        assert.equal(scoreOnly.platform_status, 'completed');
        assert.equal(submissions, 1);
    } finally {
        await session.close();
        await mock.close();
    }
});

test('messages received during a save become the next draft', async () => {
    const pkg = coursePackage();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { mock, session, link } = await openSession({
        pkg,
        handler: ({ req, res, url }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), pkg));
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.end(pkg.zip);
                return;
            }
            void gate.then(() => json(res, 200, { ok: true, status: 'completed', receipt_id: 'rc' }));
        },
    });
    try {
        assert.equal((await session.openLocalTask(link)).ok, true);
        await session.setDraft({ name: '第一稿', value: 1 });
        const pending = session.saveScore();
        const queued = session.setDraft({ name: '第二稿', value: 2 });
        assert.equal(queued.queued, true);
        release();
        assert.equal((await pending).platform_status, 'completed');
        assert.equal(session.getDraft().name, '第二稿');
    } finally {
        await session.close();
        await mock.close();
    }
});

test('work locked and score invalid responses stay in Chinese', async () => {
    const pkg = coursePackage();
    let code = 'work_locked';
    const { mock, session, link } = await openSession({
        pkg,
        handler: ({ req, res, url }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), pkg));
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.end(pkg.zip);
                return;
            }
            json(res, code === 'work_locked' ? 423 : 400, {
                ok: false,
                code,
                message: 'raw server text',
                retryable: false,
                request_id: 'req-err',
            });
        },
    });
    try {
        assert.equal((await session.openLocalTask(link)).ok, true);
        await session.setDraft({ name: '题', value: 6 });
        const locked = await session.saveScore();
        assert.equal(locked.code, 'work_locked');
        assert.match(locked.message, /锁定/);
        assert.equal(locked.message.includes('raw server text'), false);
        code = 'score_invalid';
        await session.setDraft({ name: '题', value: 6 });
        const invalid = await session.saveScore();
        assert.equal(invalid.code, 'score_invalid');
        assert.match(invalid.message, /0 到 100/);
    } finally {
        await session.close();
        await mock.close();
    }
});

test('the same unfinished launch grant is exchanged once and another activity keeps its own draft', async () => {
    const pkg = coursePackage();
    let exchanges = 0;
    let releaseExchange;
    const gate = new Promise((resolve) => { releaseExchange = resolve; });
    let holdFirst = true;
    const { mock, session, link } = await openSession({
        pkg,
        handler: ({ req, res, url, body }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                exchanges += 1;
                const incoming = JSON.parse(body.toString('utf8'));
                const activityId = incoming.launch_grant === 'launch-grant-secret' ? 'activity-1' : 'activity-2';
                const send = () => json(res, 200, exchangePayload(mockOrigin(req), pkg, {
                    activity_id: activityId,
                    task_grant: `grant-${activityId}`,
                }));
                if (holdFirst && exchanges === 1) {
                    holdFirst = false;
                    gate.then(send);
                    return;
                }
                send();
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.end(pkg.zip);
                return;
            }
            const posted = JSON.parse(body.toString('utf8'));
            json(res, 200, { ok: true, status: 'completed', request_id: posted.request_id, receipt_id: 'rc' });
        },
    });
    try {
        const first = session.openLocalTask(link);
        const second = session.openLocalTask(link);
        const started = Date.now();
        while (exchanges < 1 && Date.now() - started < 1000) {
            await new Promise((resolve) => setTimeout(resolve, 10));
        }
        assert.equal(exchanges, 1);
        releaseExchange();
        const opened = await first;
        const replay = await second;
        assert.equal(opened.ok, true, opened.message);
        assert.equal(replay.activity_id, opened.activity_id);
        assert.equal(exchanges, 1);
        const third = await session.openLocalTask(link);
        assert.equal(exchanges, 1);
        assert.equal(third.lab_url, opened.lab_url);
        await session.setDraft({ name: '活动一', value: 80 });
        const otherLink = link.replace('launch-grant-secret', 'launch-grant-b');
        const other = await session.openLocalTask(otherLink);
        assert.equal(exchanges, 2);
        assert.equal(other.activity_id, 'activity-2');
        assert.equal(other.draft, null);
        await session.setDraft({ name: '活动二', value: 10 });
        const saved = await session.saveScore();
        assert.equal(saved.platform_status, 'completed');
        assert.equal(session.getDraft(), null);
    } finally {
        releaseExchange();
        await session.close();
        await mock.close();
    }
});

test('rate limited saves use the Chinese message', async () => {
    const pkg = coursePackage();
    const { mock, session, link } = await openSession({
        pkg,
        handler: ({ req, res, url }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), pkg));
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.end(pkg.zip);
                return;
            }
            json(res, 429, { ok: false, code: 'rate_limited', message: 'slow down', retryable: false });
        },
    });
    try {
        assert.equal((await session.openLocalTask(link)).ok, true);
        await session.setDraft({ name: '题', value: 9 });
        const limited = await session.saveScore();
        assert.equal(limited.code, 'rate_limited');
        assert.match(limited.message, /太频繁/);
        assert.equal(limited.message.includes('slow down'), false);
    } finally {
        await session.close();
        await mock.close();
    }
});

test('submission error codes expose explicit Chinese guidance and preserve server actions', async () => {
    const cases = [
        ['XEDU_PYTHON_ARTIFACT_REQUIRED', /Python|Notebook/, 'save_project', false],
        ['XEDU_ARTIFACT_INVALID', /作品|附件/, 'reupload_artifact', false],
        ['ARTIFACT_TYPE_UNSUPPORTED', /作品文件类型|支持/, 'reupload_artifact', false],
        ['ARTIFACT_TOO_LARGE', /超过|较小/, 'reduce_artifact', false],
        ['XEDU_SUBMISSION_ERROR', /提交|稍后/, 'check_status', true],
        ['XEDU_TASK_GRANT_INVALID', /授权|重新打开/, 'relaunch', false],
        ['XEDU_ACTIVITY_FORBIDDEN', /活动|权限/, 'return_to_course', false],
        ['XEDU_ANSWERS_INVALID', /作答|答案/, 'complete_self_check', false],
    ];
    const pkg = coursePackage();
    for (const [code, messagePattern, defaultAction, retryable] of cases) {
        const { mock, session, link } = await openSession({
            pkg,
            handler: ({ req, res, url }) => {
                if (url.pathname.endsWith('/launch/exchange')) {
                    json(res, 200, exchangePayload(mockOrigin(req), pkg));
                    return;
                }
                if (url.pathname === '/packages/course.zip') {
                    res.end(pkg.zip);
                    return;
                }
                json(res, code === 'XEDU_TASK_GRANT_INVALID' ? 401 : 400, {
                    ok: false,
                    code,
                    message: 'server implementation detail',
                    retryable,
                    next_action: defaultAction,
                    diagnostic_id: 'diag-test-123',
                });
            },
        });
        try {
            assert.equal((await session.openLocalTask(link)).ok, true, code);
            assert.equal((await session.setDraft({ name: '题', value: 80 })).ok, true, code);
            const result = await session.saveScore();
            assert.equal(result.code, code);
            assert.match(result.message, messagePattern, code);
            assert.equal(result.message.includes('server implementation detail'), false, code);
            assert.equal(result.retryable, retryable, code);
            assert.equal(result.next_action, defaultAction, code);
            assert.equal(result.diagnostic_id, 'diag-test-123', code);
            assert.equal(session.getDraft().name, '题', code);
            assert.equal(result.platform_status, '', code);
            assert.notEqual(defaultAction, '', code);
        } finally {
            await session.close();
            await mock.close();
        }
    }
});

test('a timed out submission checks status before failing and keeps the score draft', async () => {
    const pkg = coursePackage();
    let statusGets = 0;
    const { mock, session, link } = await openSession({
        pkg,
        createRequestId: () => 'req-timeout-pending',
        handler: ({ req, res, url }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), pkg));
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.end(pkg.zip);
                return;
            }
            if (req.method === 'POST' && url.pathname.endsWith('/submissions')) {
                req.socket.destroy();
                return;
            }
            if (url.pathname.endsWith('/submissions/status')) {
                statusGets += 1;
                json(res, 404, { ok: false, code: 'SUBMISSION_NOT_FOUND' });
                return;
            }
            json(res, 404, { ok: false });
        },
    });
    try {
        assert.equal((await session.openLocalTask(link)).ok, true);
        assert.equal((await session.setDraft({ name: '题', value: 10 })).ok, true);
        const result = await session.saveScore();
        assert.equal(result.ok, false);
        assert.equal(result.platform_status, '');
        assert.equal(result.code, 'submission_not_completed');
        assert.equal(result.has_draft, true);
        assert.equal(result.draft.name, '题');
        assert.ok(statusGets >= 1);
        assert.equal(session.getDraft().name, '题');
    } finally {
        await session.close();
        await mock.close();
    }
});

test('an uncertain project submission retry reuses the uploaded attachment and request id', async () => {
    const pkg = coursePackage();
    let artifactUploads = 0;
    const submissionBodies = [];
    const { mock, session, link } = await openSession({
        pkg,
        createRequestId: () => 'req-project-uncertain',
        handler: ({ req, res, url, body }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), pkg));
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.end(pkg.zip);
                return;
            }
            if (req.method === 'POST' && url.pathname.endsWith('/artifacts')) {
                artifactUploads += 1;
                json(res, 200, { ok: true, upload_id: 'upload-project-1', size: body.length });
                return;
            }
            if (req.method === 'POST' && url.pathname.endsWith('/submissions')) {
                submissionBodies.push(JSON.parse(body.toString('utf8')));
                req.socket.destroy();
                return;
            }
            if (url.pathname.endsWith('/submissions/status')) {
                json(res, 404, { ok: false, code: 'SUBMISSION_NOT_FOUND' });
                return;
            }
            json(res, 404, { ok: false });
        },
    });
    try {
        assert.equal((await session.openLocalTask(link)).ok, true);
        const file = {
            filename: 'note.ipynb',
            mime: 'application/x-ipynb+json',
            bytes: Buffer.from(JSON.stringify({ nbformat: 4, cells: [] })),
        };
        const first = await session.saveProject(file, { experiment: 'notebook' });
        assert.equal(first.code, 'submission_not_completed');
        const conflictingRequest = await session.saveProject(file, {
            experiment: 'notebook', request_id: 'req-project-restarted',
        });
        assert.equal(conflictingRequest.code, 'XEDU_REQUEST_ID_CONFLICT');
        assert.equal(conflictingRequest.next_action, 'check_status');
        const retry = await session.saveProject({ ...file, bytes: Buffer.from('newer-content') }, { experiment: 'notebook' });
        assert.equal(retry.code, 'submission_not_completed');
        assert.equal(artifactUploads, 1);
        assert.ok(submissionBodies.length > 1);
        assert.deepEqual(new Set(submissionBodies.map(item => item.request_id)), new Set(['req-project-uncertain']));
        assert.deepEqual(new Set(submissionBodies.map(item => item.artifacts[0].upload_id)), new Set(['upload-project-1']));
        assert.equal(submissionBodies.every(item => item.resource_id === submissionBodies[0].resource_id), true);
    } finally {
        await session.close();
        await mock.close();
    }
});

test('experiment capture requires the experiment rectangle and launch opens are shared', async () => {
    assert.equal(experimentCaptureRect(null), null);
    assert.equal(experimentCaptureRect({ width: 0, height: 40 }), null);
    assert.deepEqual(experimentCaptureRect({ x: -4, y: 2.2, width: 9000, height: 30.2 }), {
        x: 0,
        y: 2,
        width: 8000,
        height: 30,
    });
    let calls = 0;
    const openOnce = createLaunchOpener(async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { ok: true, lab_url: 'http://127.0.0.1/lab' };
    });
    const [first, second] = await Promise.all([
        openOnce('xedu://open-local-task?same'),
        openOnce('xedu://open-local-task?same'),
    ]);
    assert.equal(calls, 1);
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(second.result.lab_url, first.result.lab_url);
});

test('loopback classroom TLS policy skips verification only for localhost, 127.0.0.1, and ::1', () => {
    assert.equal(isLoopbackClassroomHost('localhost'), true);
    assert.equal(isLoopbackClassroomHost('LOCALHOST'), true);
    assert.equal(isLoopbackClassroomHost('[::1]'), true);
    assert.equal(isLoopbackClassroomHost('127.0.0.2'), false);
    assert.equal(isLoopbackClassroomHost('localhost.example'), false);
    assert.deepEqual(tlsOptionsForUrl('https://localhost:8443/api/xedu/v1/launch/exchange'), { rejectUnauthorized: false });
    assert.deepEqual(tlsOptionsForUrl('https://127.0.0.1:8443/packages/course.zip'), { rejectUnauthorized: false });
    assert.deepEqual(tlsOptionsForUrl('https://[::1]:8443/api/xedu/v1/submissions'), { rejectUnauthorized: false });
    assert.deepEqual(tlsOptionsForUrl('https://learn.example/api/xedu/v1/launch/exchange'), {});
    assert.deepEqual(tlsOptionsForUrl('https://127.0.0.2:8443/api/xedu/v1/artifacts'), {});
    assert.deepEqual(tlsOptionsForUrl('http://127.0.0.1:8081/api/xedu/v1/launch/exchange'), {});
    assert.deepEqual(tlsOptionsForUrl('not a url'), {});
});

test('defaultRequest reaches a loopback self-signed LearnSite and still rejects other hosts', async (t) => {
    const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
    const cert = makeCert();
    const servers = [];
    const listen = (host) => new Promise((resolve, reject) => {
        const server = https.createServer({ key: cert.key, cert: cert.cert }, (req, res) => {
            const body = JSON.stringify({ ok: true, path: req.url });
            res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
            res.end(body);
        });
        servers.push(server);
        server.once('error', reject);
        server.listen(0, host, () => resolve(server.address()));
    });
    try {
        const loopback = await listen('127.0.0.1');
        const exchange = await defaultRequest({
            url: `https://127.0.0.1:${loopback.port}/api/xedu/v1/launch/exchange`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.from('{}'),
        });
        assert.equal(exchange.status, 200);
        assert.equal(JSON.parse(exchange.body.toString()).path, '/api/xedu/v1/launch/exchange');
        const viaLocalhost = await defaultRequest({
            url: `https://localhost:${loopback.port}/api/xedu/v1/submissions`,
            method: 'GET',
        });
        assert.equal(viaLocalhost.status, 200);

        let ipv6 = null;
        try {
            ipv6 = await listen('::1');
        } catch (_) {
            ipv6 = null;
        }
        if (ipv6) {
            const viaIpv6 = await defaultRequest({ url: `https://[::1]:${ipv6.port}/packages/course.zip` });
            assert.equal(viaIpv6.status, 200);
        }

        let other;
        try { other = await listen('127.0.0.2'); } catch (error) {
            if (error.code !== 'EADDRNOTAVAIL') throw error;
            t.diagnostic('127.0.0.2 is unavailable on this OS; strict non-loopback TLS policy is covered by the preceding unit test.');
            return;
        }
        await assert.rejects(
            () => defaultRequest({ url: `https://127.0.0.2:${other.port}/api/xedu/v1/artifacts`, timeoutMs: 3000 }),
            (error) => /SELF_SIGNED|UNABLE_TO_VERIFY|CERT/.test(error.code || ''),
        );
    } finally {
        if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
        await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
    }
});

test('live session exchanges, downloads, and submits over loopback self-signed HTTPS', async () => {
    const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '1';
    const pkg = coursePackage();
    const cert = makeCert();
    const seen = [];
    const server = https.createServer({ key: cert.key, cert: cert.cert }, (req, res) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
            const url = new URL(req.url, 'https://127.0.0.1');
            seen.push({ method: req.method, path: url.pathname, authorization: req.headers.authorization || '' });
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(`https://127.0.0.1:${server.address().port}`, pkg));
                return;
            }
            if (url.pathname.endsWith('/packages/course.zip')) {
                res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': pkg.zip.length });
                res.end(pkg.zip);
                return;
            }
            if (url.pathname.endsWith('/submissions')) {
                json(res, 200, { ok: true, status: 'completed', receipt_id: 'receipt-1' });
                return;
            }
            json(res, 404, { ok: false });
        });
    });
    const cacheRoot = mkdtempSync(path.join(tmpdir(), 'xedu-default-request-'));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `https://127.0.0.1:${server.address().port}`;
    const session = createLocalTaskSession({
        cacheRoot,
        sleep: async () => {},
        now: () => Date.parse('2026-09-22T00:00:00.000Z'),
    });
    const link = `xedu://open-local-task?grant=${encodeURIComponent('live-grant')}&platform_origin=${encodeURIComponent(origin)}`;
    try {
        const opened = await session.openLocalTask(link);
        assert.equal(opened.ok, true);
        assert.equal(seen.some((item) => item.path.endsWith('/launch/exchange') && item.authorization === 'Bearer live-grant'), true);
        assert.equal(seen.some((item) => item.path.endsWith('/packages/course.zip') && item.authorization === ''), true);
        await session.setDraft({ name: '第1题', value: 80 });
        const saved = await session.saveScore();
        assert.equal(saved.ok, true);
        assert.equal(saved.platform_status, 'completed');
        assert.equal(seen.some((item) => item.path.endsWith('/submissions') && item.authorization === 'Bearer task-grant-secret'), true);
    } finally {
        if (previous === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
        await session.close();
        await new Promise((resolve) => server.close(resolve));
        rmSync(cacheRoot, { recursive: true, force: true });
    }
});

test('optional answers bag is stored on the submission and score-only omits it', async () => {
    const pkg = coursePackage();
    const bodies = [];
    const { mock, session, link } = await openSession({
        pkg,
        handler: ({ req, res, url, body }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), pkg));
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.end(pkg.zip);
                return;
            }
            if (req.method === 'POST' && url.pathname.endsWith('/submissions')) {
                bodies.push(JSON.parse(body.toString('utf8')));
                json(res, 200, { ok: true, status: 'completed', receipt_id: 'answers-1' });
                return;
            }
            json(res, 404, { ok: false });
        },
    });
    try {
        assert.equal((await session.openLocalTask(link)).ok, true);
        const withBag = await session.setDraft({
            type: 'ols-score/1',
            name: '操作题',
            value: 80,
            passed: true,
            answers: { q1: 'A', q2: ['B', 'C'] },
        });
        assert.equal(withBag.ok, true);
        assert.deepEqual(withBag.draft.answers, { q1: 'A', q2: ['B', 'C'] });
        const saved = await session.saveScore();
        assert.equal(saved.platform_status, 'completed');
        assert.equal(saved.mode, 'score');
        assert.deepEqual(bodies[0].answers, { q1: 'A', q2: ['B', 'C'] });
        assert.equal(bodies[0].passed, true);
        assert.equal(bodies[0].score, 80);
        assert.equal(bodies[0].raw_score, 80);
        assert.equal(bodies[0].name, '操作题');
        assert.equal(Object.hasOwn(bodies[0], 'evidence'), false);

        const scoreOnly = await session.setDraft({ name: '第1题', value: 0 });
        assert.equal(scoreOnly.ok, true);
        assert.equal(Object.hasOwn(scoreOnly.draft, 'answers'), false);
        const again = await session.saveScore();
        assert.equal(again.platform_status, 'completed');
        assert.equal(bodies[1].score, 0);
        assert.equal(bodies[1].passed, null);
        assert.equal(Object.hasOwn(bodies[1], 'answers'), false);
        assert.equal(Object.hasOwn(bodies[1], 'evidence'), false);
    } finally {
        await session.close();
        await mock.close();
    }
});

test('oversized or non-object answers do not replace a score draft or get submitted', async () => {
    const pkg = coursePackage();
    let posts = 0;
    const { mock, session, link } = await openSession({
        pkg,
        handler: ({ req, res, url }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), pkg));
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.end(pkg.zip);
                return;
            }
            if (req.method === 'POST' && url.pathname.endsWith('/submissions')) {
                posts += 1;
                json(res, 200, { ok: true, status: 'completed' });
            }
        },
    });
    try {
        assert.equal((await session.openLocalTask(link)).ok, true);
        const kept = await session.setDraft({ name: '题', value: 12, answers: { q: 1 } });
        assert.equal(kept.ok, true);
        const tooBig = await session.setDraft({
            name: '题',
            value: 12,
            answers: { note: 'x'.repeat(MAX_ANSWERS_JSON_BYTES) },
        });
        assert.equal(tooBig.ok, false);
        assert.equal(tooBig.code, 'answers_too_large');
        assert.deepEqual(session.getDraft().answers, { q: 1 });
        const invalid = await session.setDraft({ name: '题', value: 12, answers: 'not-a-bag' });
        assert.equal(invalid.code, 'answers_invalid');
        assert.equal(posts, 0);
        assert.deepEqual(normalizeScoreDraft({ name: '题', value: 1, extra: true }).code, 'score_invalid');
    } finally {
        await session.close();
        await mock.close();
    }
});

test('scratch and notebook evidence submits a screenshot without a score', async () => {
    const pkg = coursePackage();
    const bodies = [];
    const { mock, session, link } = await openSession({
        pkg,
        createRequestId: () => 'req-evidence-1',
        handler: ({ req, res, url, body }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), pkg));
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.end(pkg.zip);
                return;
            }
            if (url.pathname.endsWith('/artifacts')) {
                json(res, 201, { ok: true, upload_id: 'upl-evidence' });
                return;
            }
            if (req.method === 'POST' && url.pathname.endsWith('/submissions')) {
                bodies.push(JSON.parse(body.toString('utf8')));
                json(res, 200, { ok: true, status: 'completed', request_id: 'req-evidence-1', receipt_id: 'ev-1' });
            }
        },
    });
    try {
        assert.equal((await session.openLocalTask(link)).ok, true);
        const drafted = await session.setDraft({ type: 'ols-score/1', name: '已有分', value: 40, passed: true });
        assert.equal(drafted.ok, true, drafted.message);
        const png = Buffer.from([137, 80, 78, 71, 9, 9, 9]);
        const scratch = await session.saveEvidence({ bytes: png, mime: 'image/png' }, { experiment: 'scratch' });
        assert.equal(scratch.ok, true);
        assert.equal(scratch.platform_status, 'completed');
        assert.equal(scratch.mode, 'evidence');
        assert.equal(scratch.message, '已保存');
        assert.equal(session.getDraft().name, '已有分');
        const body = bodies[0];
        assert.equal(body.score, null);
        assert.equal(body.raw_score, null);
        assert.equal(body.passed, true);
        assert.equal(body.name, null);
        assert.equal(Object.hasOwn(body, 'answers'), false);
        assert.equal(body.attachments[0].upload_id, 'upl-evidence');
        assert.deepEqual(body.evidence, {
            type: 'screenshot',
            experiment: 'scratch',
            project_file: null,
        });

        const notebook = await session.saveEvidence({ bytes: png, mime: 'image/png' }, { experiment: 'notebook' });
        assert.equal(notebook.platform_status, 'completed');
        assert.equal(bodies[1].evidence.experiment, 'notebook');
        assert.equal(bodies[1].evidence.project_file, null);
        assert.equal(bodies[1].score, null);
        assert.equal(bodies[1].passed, true);
        assert.equal(Object.hasOwn(bodies[1], 'answers'), false);
    } finally {
        await session.close();
        await mock.close();
    }
});

test('a claimed score is not completed when the platform returns XEDU_RESULT_NOT_PASSED', async () => {
    const pkg = coursePackage();
    const posts = [];
    const { mock, session, link, delays } = await openSession({
        pkg,
        handler: ({ req, res, url, body }) => {
            if (url.pathname.endsWith('/launch/exchange')) {
                json(res, 200, exchangePayload(mockOrigin(req), pkg));
                return;
            }
            if (url.pathname === '/packages/course.zip') {
                res.end(pkg.zip);
                return;
            }
            if (req.method === 'POST' && url.pathname.endsWith('/submissions')) {
                posts.push(JSON.parse(body.toString('utf8')));
                json(res, 422, {
                    ok: false,
                    code: 'XEDU_RESULT_NOT_PASSED',
                    retryable: true,
                    message: 'platform raw text',
                });
            }
        },
    });
    try {
        assert.equal((await session.openLocalTask(link)).ok, true);
        assert.equal((await session.setDraft({ type: 'ols-score/1', name: '题', value: 80, passed: false })).ok, true);
        const rejected = await session.saveScore();
        assert.equal(rejected.ok, false);
        assert.equal(rejected.platform_status, '');
        assert.equal(rejected.code, 'XEDU_RESULT_NOT_PASSED');
        assert.match(rejected.message, /还没有通过/);
        assert.equal(rejected.retryable, false);
        assert.equal(posts.length, 1);
        assert.equal(posts[0].passed, false);
        assert.equal(posts[0].score, 80);
        assert.deepEqual(delays, []);
        assert.equal(session.getDraft().name, '题');
        assert.equal(session.getDraft().passed, false);
    } finally {
        await session.close();
        await mock.close();
    }
});

test('legacy screenshot evidence does not claim a project file upload', () => {
    const scratch = projectFileEvidenceAttachment('scratch');
    assert.equal(scratch.wired, false);
    assert.equal(scratch.attachment, null);
    assert.equal(scratch.code, 'project_file_not_uploaded');
    assert.equal(scratch.spec.extension, '.sb3');
    assert.equal(scratch.spec.filename, 'project.sb3');
    const notebook = projectFileEvidenceAttachment('notebook');
    assert.equal(notebook.spec.extension, '.ipynb');
    assert.equal(notebook.spec.content_type, 'application/x-ipynb+json');
    assert.equal(projectFileEvidenceAttachment('html').spec, null);
});

test('project submission uploads the saved bytes and filename without a screenshot', async () => {
    const pkg = coursePackage();
    const uploads = [];
    const submissions = [];
    const { mock, session, link } = await openSession({
        pkg,
        handler: ({ req, res, url, body }) => {
            if (url.pathname.endsWith('/launch/exchange')) return json(res, 200, exchangePayload(mockOrigin(req), pkg));
            if (url.pathname === '/packages/course.zip') return res.end(pkg.zip);
            if (url.pathname.endsWith('/artifacts')) {
                uploads.push({ headers: req.headers, body });
                return json(res, 201, { ok: true, upload_id: `project-${uploads.length}` });
            }
            if (req.method === 'POST' && url.pathname.endsWith('/submissions')) {
                submissions.push(JSON.parse(body.toString('utf8')));
                return json(res, 200, { ok: true, status: 'completed' });
            }
        },
    });
    try {
        assert.equal((await session.openLocalTask(link)).ok, true);
        await session.setDraft({ name: 'score draft', value: 80 });
        const files = [
            { experiment: 'notebook', filename: 'edited.ipynb', mime: 'application/x-ipynb+json', bytes: Buffer.from(JSON.stringify({ nbformat: 4, cells: [] })) },
            { experiment: 'scratch', filename: 'edited.sb3', mime: 'application/x.scratch.sb3', bytes: makeStoredZip([{ name: 'project.json', data: '{}' }]) },
            { experiment: 'notebook', filename: 'edited.py', mime: 'text/plain', bytes: Buffer.from('print(42)\n') },
        ];
        for (const file of files) {
            const saved = await session.saveProject({ ...file, bytes: Array.from(file.bytes) }, { experiment: file.experiment });
            assert.equal(saved.platform_status, 'completed');
            assert.equal(saved.mode, 'project');
            const uploaded = uploads.at(-1);
            assert.deepEqual(uploaded.body, file.bytes);
            assert.equal(uploaded.headers['content-type'], file.mime);
            assert.equal(uploaded.headers['x-xedu-filename'], file.filename);
            const submitted = submissions.at(-1);
            assert.equal(submitted.score, null);
            assert.equal(submitted.passed, true);
            assert.equal(submitted.evidence.type, 'project_file');
            assert.equal(submitted.evidence.experiment, file.experiment);
            assert.deepEqual(submitted.evidence.project_file, submitted.attachments[0]);
            assert.deepEqual(submitted.artifacts, [{
                upload_id: submitted.attachments[0].upload_id,
                sha256: submitted.attachments[0].sha256,
                size: file.bytes.length,
            }]);
            assert.equal(submitted.attachments[0].sha256, sha256(file.bytes));
        }
        assert.equal(session.getDraft().name, 'score draft');
        const rejected = await session.saveProject({ bytes: Buffer.from('x'), filename: 'x.html', mime: 'text/html' }, { experiment: 'notebook' });
        assert.equal(rejected.code, 'project_file_invalid');
        assert.equal(uploads.length, 3);
    } finally {
        await session.close();
        await mock.close();
    }
});


test('MicroPython save and submit uploads the edited Python file required by the platform', async (t) => {
    const { evidenceExperimentKind } = await import('../../renderer/js/resources/xedu-evidence.js');
    const { saveCurrentJupyterProject } = require('./jupyter-project-save');
    const extensionSource = readFileSync(new URL('../../jupyterlab_micropython/src/index.js', import.meta.url), 'utf8');
    const panelPrototype = vm.runInNewContext(
        `${extensionSource.slice(extensionSource.indexOf('class MicroPythonPanel'), extensionSource.indexOf('\nconst plugin ='))}; MicroPythonPanel.prototype;`,
        { Panel: class {}, TextEncoder },
    );
    const editedCode = 'print("学生最新修改")\n';
    const resourceId = 'lesson1/code/publish_teacher_lamp.py';
    const panel = Object.assign(Object.create(panelPrototype), {
        id: 'xedu-micropython-panel',
        activePythonPath: resourceId,
        codeText: () => editedCode,
        app: { serviceManager: { contents: {
            async save(filePath, model) {
                assert.equal(filePath, resourceId);
                assert.equal(model.content, editedCode);
                writeFileSync(path.join(local, filePath), model.content);
            },
        } } },
        updateFileLabel() {},
        updateActionState() {},
        async refreshFiles() {},
        setStatus() {},
    });
    const zip = makeStoredZip([
        { name: 'course.json', data: JSON.stringify({ id: 'pkg-course', version: '3' }) },
        { name: resourceId, data: 'print("original template")\n' },
    ]);
    const pkg = { zip, sha256: sha256(zip), size: zip.length };
    const origin = 'https://learn.example';
    const root = mkdtempSync(path.join(tmpdir(), 'xedu-micropython-submit-'));
    const local = path.join(root, 'course');
    mkdirSync(path.dirname(path.join(local, resourceId)), { recursive: true });
    writeFileSync(path.join(local, 'course.json'), JSON.stringify({ id: 'pkg-course', version: '3' }));
    writeFileSync(path.join(local, resourceId), 'print("original template")\n');
    let uploaded = null;
    let submitted = null;
    const session = createLocalTaskSession({
        cacheRoot: path.join(root, 'cache'),
        resolveLocalCourseRoot: async () => local,
        request: async ({ url, headers, body }) => {
            if (url.endsWith('/launch/exchange')) return {
                status: 200,
                body: Buffer.from(JSON.stringify(exchangePayload(origin, pkg, { resource_id: resourceId }))),
            };
            if (url.includes('/packages/')) return { status: 200, body: pkg.zip };
            if (url.endsWith('/artifacts')) {
                uploaded = { headers, bytes: body };
                return { status: 201, body: Buffer.from(JSON.stringify({ ok: true, upload_id: 'python-file', size: body.length })) };
            }
            if (url.endsWith('/submissions')) {
                submitted = JSON.parse(body.toString());
                const hasPythonFile = uploaded?.headers['Content-Type'] === 'text/plain'
                    && uploaded.headers['X-XEdu-Filename'].endsWith('.py')
                    && submitted.artifacts?.[0]?.upload_id === 'python-file';
                return {
                    status: hasPythonFile ? 200 : 400,
                    body: Buffer.from(JSON.stringify(hasPythonFile
                        ? { ok: true, status: 'completed' }
                        : { ok: false, code: 'XEDU_PYTHON_ARTIFACT_REQUIRED', message: '请先提交本次 Python 或 Notebook 实验文件' })),
                };
            }
            throw new Error(`unexpected URL: ${url}`);
        },
    });
    t.after(async () => { await session.close(); rmSync(root, { recursive: true, force: true }); });
    assert.equal((await session.openLocalTask({ launchGrant: 'python-project', platformOrigin: origin })).ok, true);
    const kind = evidenceExperimentKind({
        tabId: 'python', experiment: { runtime: 'micropython-esp32' }, overview: { pythonFiles: [{ path: resourceId }] },
    });
    const exported = await vm.runInNewContext(`(${saveCurrentJupyterProject.toString()})()`, {
        window: { jupyterapp: { shell: { currentWidget: panel } } }, TextEncoder,
    });
    const result = kind === 'notebook'
        ? await session.saveProject(exported, { experiment: kind })
        : await session.uploadScreenshot({ mime: 'image/png', bytes: Buffer.from('screenshot') });

    assert.equal(result.platform_status, 'completed', result.message);
    assert.equal(readFileSync(path.join(local, resourceId), 'utf8'), editedCode);
    assert.equal(uploaded.bytes.toString(), editedCode);
    assert.equal(uploaded.headers['Content-Type'], 'text/plain');
    assert.equal(submitted.resource_id, resourceId);
    assert.equal(submitted.attachments[0].sha256, sha256(Buffer.from(editedCode)));
});

test('native launch accepts packaged notebooks, Python and Scratch without HTML', async () => {
    for (const resourceId of ['exp1/fireworks.ipynb', 'exp2/doraemon.py', 'exp3/project.sb3']) {
        const zip = makeStoredZip([
            { name: 'course.json', data: JSON.stringify({ id: 'pkg-course', sections: [] }) },
            { name: resourceId, data: 'native experiment' },
        ]);
        const pkg = { zip, sha256: sha256(zip), size: zip.length };
        const cacheRoot = mkdtempSync(path.join(tmpdir(), 'xedu-native-'));
        const session = createLocalTaskSession({ cacheRoot, request: async ({ url }) => ({
            status: 200, body: url.endsWith('/launch/exchange')
                ? Buffer.from(JSON.stringify(exchangePayload('https://learn.example', pkg, { resource_id: resourceId })))
                : zip,
        }) });
        try {
            const result = await session.openLocalTask('xedu://open-local-task?launch_grant=native&platform_origin=https%3A%2F%2Flearn.example');
            assert.equal(result.ok, true, resourceId);
            assert.equal(result.resource_id, resourceId);
            assert.ok(result.lab_url.endsWith(resourceId));
            assert.equal(JSON.stringify(result).includes('task-grant-secret'), false);
        } finally { await session.close(); rmSync(cacheRoot, { recursive: true, force: true }); }
    }
});

test('native launch rejects unsafe, unsupported, missing and directory entries', async () => {
    const zip = makeStoredZip([
        { name: 'course.json', data: JSON.stringify({ id: 'pkg-course', sections: [] }) },
        { name: 'folder.py/child.txt', data: 'directory is not an entry' },
        { name: 'valid.py', data: 'print(1)' },
    ]);
    const pkg = { zip, sha256: sha256(zip), size: zip.length };
    for (const resourceId of ['../valid.py', '/valid.py', 'C:/valid.py', 'https://example/valid.py', 'missing.py', 'folder.py', 'unknown.exe']) {
        const cacheRoot = mkdtempSync(path.join(tmpdir(), 'xedu-native-invalid-'));
        const session = createLocalTaskSession({ cacheRoot, request: async ({ url }) => ({
            status: 200, body: url.endsWith('/launch/exchange')
                ? Buffer.from(JSON.stringify(exchangePayload('https://learn.example', pkg, { resource_id: resourceId })))
                : zip,
        }) });
        try {
            const result = await session.openLocalTask('xedu://open-local-task?launch_grant=invalid&platform_origin=https%3A%2F%2Flearn.example');
            assert.equal(result.ok, false, resourceId);
            assert.equal(result.code, ['../valid.py', '/valid.py', 'C:/valid.py', 'https://example/valid.py', 'unknown.exe'].includes(resourceId)
                ? 'package_metadata_invalid'
                : 'package_resource_missing', resourceId);
        } finally { await session.close(); rmSync(cacheRoot, { recursive: true, force: true }); }
    }
});


test('course grant permits successive activity selections after a rejected selection', async () => {
    const pkg = coursePackage();
    const cacheRoot = mkdtempSync(path.join(tmpdir(), 'xedu-repeat-selection-'));
    const selections = [];
    const session = createLocalTaskSession({ cacheRoot, request: async ({ url, headers, body }) => {
        if (url.endsWith('/launch/exchange')) return { status: 200, body: Buffer.from(JSON.stringify(
            exchangePayload('https://learn.example', pkg, { launch_scope: 'course' }))) };
        if (url.endsWith('/tasks/select.ashx')) {
            const selection = JSON.parse(body.toString());
            selections.push({ selection, authorization: headers.Authorization });
            if (selection.activity_id === 'unbound') return { status: 403, body: Buffer.from(JSON.stringify({ ok: false, code: 'XEDU_ACTIVITY_FORBIDDEN' })) };
            return { status: 200, body: Buffer.from(JSON.stringify({
                ok: true, course_id: 'pkg-course', ...selection,
                task_grant: 'selected-' + selection.activity_id,
                grant_expires_at: '2099-01-01T00:00:00.000Z',
            })) };
        }
        return { status: 200, body: pkg.zip };
    } });
    try {
        assert.equal((await session.openLocalTask('xedu://open-local-task?launch_grant=course&platform_origin=https%3A%2F%2Flearn.example')).ok, true);
        for (const activityId of ['activity-2', 'unbound', 'activity-3', 'activity-2']) {
            const selected = await session.selectTask({ activity_id: activityId, resource_id: 'labs/quiz.html' });
            assert.equal(selected.ok, activityId !== 'unbound', activityId + ': ' + selected.code);
            if (selected.ok) assert.equal(selected.activity_id, activityId);
        }
        assert.equal(selections.length, 4);
        assert.ok(selections.every(item => item.authorization === 'Bearer task-grant-secret'));
    } finally { await session.close(); rmSync(cacheRoot, { recursive: true, force: true }); }
});

test('activity-only launch cannot select course activities', async () => {
    const pkg = coursePackage();
    const cacheRoot = mkdtempSync(path.join(tmpdir(), 'xedu-activity-selection-'));
    let selections = 0;
    const session = createLocalTaskSession({ cacheRoot, request: async ({ url }) => {
        if (url.endsWith('/launch/exchange')) return { status: 200, body: Buffer.from(JSON.stringify(exchangePayload('https://learn.example', pkg))) };
        if (url.endsWith('/tasks/select.ashx')) selections += 1;
        return { status: 200, body: pkg.zip };
    } });
    try {
        assert.equal((await session.openLocalTask('xedu://open-local-task?launch_grant=activity&platform_origin=https%3A%2F%2Flearn.example')).ok, true);
        const selected = await session.selectTask({ activity_id: 'activity-2', resource_id: 'labs/quiz.html' });
        assert.equal(selected.code, 'no_active_task');
        assert.equal(selections, 0);
    } finally { await session.close(); rmSync(cacheRoot, { recursive: true, force: true }); }
});
