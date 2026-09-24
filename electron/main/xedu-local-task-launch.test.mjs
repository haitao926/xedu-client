import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
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

function mockOrigin(req) {
    const host = req.headers.host;
    return `https://${host}`;
}

test('course.json id mismatch and bad sha are hard errors', async () => {
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
        assert.equal(invalid.code, 'package_invalid');
    } finally {
        await session2.close();
        await mock2.close();
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
        assert.equal(submission.passed, null);
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

test('defaultRequest reaches a loopback self-signed LearnSite and still rejects other hosts', async () => {
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

        const other = await listen('127.0.0.2');
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
        assert.equal(body.passed, null);
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

test('project file evidence stays unwired until non-image artifact upload exists', () => {
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
