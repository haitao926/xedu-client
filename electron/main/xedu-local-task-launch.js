const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const zlib = require('zlib');

const PROTOCOL_VERSION = 1;
const CONTRACT_REVISION = '2026-09-22';
const RETRY_DELAYS_MS = Object.freeze([1000, 2000, 4000]);
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const MAX_ANSWERS_JSON_BYTES = 32 * 1024;
const PROJECT_FILE_EVIDENCE = Object.freeze({
    scratch: Object.freeze({
        extension: '.sb3',
        content_type: 'application/x.scratch.sb3',
        filename: 'project.sb3',
    }),
    notebook: Object.freeze({
        extension: '.ipynb',
        content_type: 'application/x-ipynb+json',
        filename: 'notebook.ipynb',
    }),
});
const SCREENSHOT_MIME = Object.freeze({
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
});

const STUDENT_MESSAGES = Object.freeze({
    protocol_mismatch: '学习平台协议版本与客户端不一致，已停止打开。请更新后再从平台重新进入。',
    grant_expired: '任务授权已过期，请从学习平台重新打开。当前成绩草稿已保留。',
    grant_invalid: '学习平台没有返回有效的任务授权，请重新打开。',
    score_invalid: '成绩无效。请使用 0 到 100 之间的数字，0 分也会保留。',
    work_locked: '这份作业已锁定，暂时不能再保存。',
    conflict: '保存发生冲突，请从学习平台重新打开后再试。',
    package_invalid: '课程包校验失败，请从学习平台重新打开。',
    course_id_mismatch: '课程包编号与任务不一致，已停止打开。课程编号以 course.json 的 id 为准。',
    screenshot_failed: '截图失败，没有上传。成绩草稿还在，可以单独保存成绩。',
    screenshot_too_large: '截图超过 10MB，没有上传。可以单独保存成绩。',
    screenshot_type: '截图格式无效。请使用 PNG、JPEG 或 WebP。',
    rate_limited: '保存太频繁，请稍后再试。',
    save_in_flight: '正在保存，请稍候再试。',
    no_score_draft: '还没有可保存的成绩。',
    answers_invalid: '作答内容格式无效，成绩没有保存。',
    answers_too_large: '作答内容超过 32KB，成绩没有保存。',
    XEDU_RESULT_NOT_PASSED: '这次成绩还没有通过，平台没有记为完成。',
    no_active_task: '请从学习平台重新打开这个任务。',
    submission_not_completed: '学习平台尚未确认完成，请稍后再试。',
    network: '暂时连不上学习平台，请稍后再试。',
    attachment_invalid: '截图没有被平台收下，本次没有保存成功。可以单独保存成绩。',
    forbidden: '当前窗口不能执行这个操作。',
});

const SUCCESS_MESSAGES = Object.freeze({
    score: '成绩已保存，平台已确认完成。',
    screenshot: '截图已上传，平台已确认。已有成绩会保留。',
    combined: '成绩和截图已保存，平台已确认完成。',
    evidence: '已保存',
});

function canonicalPlatformCode(code) {
    if (code === 'protocol_unsupported') return 'protocol_mismatch';
    if (code === 'rate_limit' || code === 'too_many_requests') return 'rate_limited';
    return code;
}

function experimentCaptureRect(bounds) {
    const width = Number(bounds?.width);
    const height = Number(bounds?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    return {
        x: Math.max(0, Math.round(Number(bounds.x) || 0)),
        y: Math.max(0, Math.round(Number(bounds.y) || 0)),
        width: Math.max(1, Math.min(8000, Math.round(width))),
        height: Math.max(1, Math.min(8000, Math.round(height))),
    };
}

function createLaunchOpener(openLocalTask) {
    const jobs = new Map();
    return async function openOnce(rawUrl) {
        const key = String(rawUrl || '');
        const existing = jobs.get(key);
        if (existing) return { reused: true, result: await existing };
        const job = Promise.resolve().then(() => openLocalTask(rawUrl));
        jobs.set(key, job);
        try {
            return { reused: false, result: await job };
        } finally {
            if (jobs.get(key) === job) jobs.delete(key);
        }
    };
}

function studentMessage(code, fallback = '') {
    const canonical = canonicalPlatformCode(code);
    if (STUDENT_MESSAGES[canonical]) return STUDENT_MESSAGES[canonical];
    const text = String(fallback || '').trim();
    if (text && text.length <= 180 && !/bearer|grant|token/i.test(text)) return text;
    return '保存没有完成，请稍后再试。';
}

function failure(code, extra = {}) {
    return {
        ok: false,
        status: Number.isFinite(extra.status) ? extra.status : 0,
        platform_status: '',
        code,
        message: studentMessage(code, extra.serverMessage),
        retryable: Boolean(extra.retryable),
        request_id: extra.requestId || '',
        has_draft: Boolean(extra.hasDraft),
        draft: extra.draft || null,
        timedOut: Boolean(extra.timedOut),
        found: extra.found,
    };
}

function success(mode, extra = {}) {
    return {
        ok: true,
        status: extra.status || 200,
        platform_status: 'completed',
        code: '',
        mode,
        message: SUCCESS_MESSAGES[mode] || '平台已确认完成。',
        retryable: false,
        request_id: extra.requestId || '',
        receipt_id: extra.receiptId || '',
        has_draft: Boolean(extra.hasDraft),
        draft: extra.draft || null,
    };
}

function jsonUtf8Size(text) {
    return Buffer.byteLength(String(text || ''), 'utf8');
}

function sanitizeAnswersBag(value) {
    if (value === undefined || value === null) return { include: false };
    if (typeof value !== 'object') return { include: false, code: 'answers_invalid' };
    let cloned;
    try {
        cloned = JSON.parse(JSON.stringify(value));
    } catch (_) {
        return { include: false, code: 'answers_invalid' };
    }
    if (!cloned || typeof cloned !== 'object') return { include: false, code: 'answers_invalid' };
    if (jsonUtf8Size(JSON.stringify(cloned)) > MAX_ANSWERS_JSON_BYTES) {
        return { include: false, code: 'answers_too_large' };
    }
    return { include: true, answers: cloned };
}

// Artifact upload currently accepts only PNG, JPEG, and WebP. Screenshot evidence
// is the MVP attachment. When LearnSite accepts non-image bytes, upload the
// exported project here and return its upload descriptor.
function projectFileEvidenceAttachment(kind) {
    const spec = PROJECT_FILE_EVIDENCE[kind] || null;
    return {
        ok: false,
        wired: false,
        code: 'project_file_not_uploaded',
        kind: spec ? kind : '',
        spec,
        attachment: null,
    };
}

function contextKey(snapshot) {
    return [
        snapshot.platform_origin,
        snapshot.learner_scope,
        snapshot.platform_activity_id,
        snapshot.course_id,
        snapshot.activity_id,
        snapshot.resource_id,
        snapshot.course_version,
        snapshot.package_sha256,
    ].join('\n');
}

function parseOpenLocalTaskLink(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch (_) {
        return null;
    }
    if (parsed.protocol !== 'xedu:') return null;
    const action = (parsed.hostname || parsed.pathname.replace(/^\/+/, '') || '').split('/')[0].trim();
    if (action !== 'open-local-task') return null;
    const namedLaunchGrant = (parsed.searchParams.get('launch_grant') || '').trim();
    const legacyGrant = (parsed.searchParams.get('grant') || '').trim();
    const launchGrant = namedLaunchGrant || legacyGrant;
    const platformOriginRaw = (parsed.searchParams.get('platform_origin') || '').trim();
    if (!launchGrant || !platformOriginRaw) return null;
    let platformOrigin = '';
    try {
        const originUrl = new URL(platformOriginRaw);
        if (originUrl.protocol !== 'https:') return null;
        platformOrigin = originUrl.origin;
    } catch (_) {
        return null;
    }
    return { launchGrant, platformOrigin, legacyLaunch: !namedLaunchGrant };
}

function taskTokenFromExchange(payload) {
    const modern = typeof payload?.task_grant === 'string' ? payload.task_grant.trim() : '';
    if (modern) return modern;
    return typeof payload?.grant === 'string' ? payload.grant.trim() : '';
}

function exchangeContractAccepted(payload, legacyLaunch) {
    if (!payload || payload.protocol_version !== PROTOCOL_VERSION) return false;
    const revision = payload.contract_revision;
    const revisionAbsent = revision === undefined || revision === null;
    if (revisionAbsent) return Boolean(legacyLaunch);
    return revision === CONTRACT_REVISION;
}

function plainScoreObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function presentScoreLabel(value) {
    return typeof value === 'string' && value.trim() ? value : '';
}

function submitRequestRecord(parsed) {
    // A numeric score is the grade. Treating it as the payload spreads into an empty record.
    const payload = plainScoreObject(parsed.payload) ? parsed.payload : parsed;
    const name = presentScoreLabel(payload.name)
        || (payload !== parsed ? presentScoreLabel(parsed.name) : '')
        || presentScoreLabel(payload.summary)
        || presentScoreLabel(parsed.summary)
        || '测验成绩';
    let value;
    if (payload.value !== undefined) {
        value = payload.value;
    } else if (typeof parsed.score === 'number') {
        value = parsed.score;
    } else if (typeof payload.score === 'number') {
        value = payload.score;
    }
    return {
        name,
        value,
        passed: payload.passed !== undefined ? payload.passed : parsed.passed,
        answers: payload.answers !== undefined ? payload.answers : parsed.answers,
    };
}

function classifyScoreInput(input) {
    let parsed = input;
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch (_) {
            return { ignore: true };
        }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ignore: true };
    const type = typeof parsed.type === 'string' ? parsed.type : '';
    let source = '';
    let record = parsed;
    if (!type && parsed.raw_score !== undefined && parsed.name !== undefined && parsed.value === undefined) {
        source = parsed.source || 'two-field';
        record = {
            name: parsed.name,
            value: parsed.raw_score,
            passed: parsed.passed,
            answers: parsed.answers,
        };
    } else if (!type) {
        const keys = Object.keys(parsed);
        const allowed = new Set(['name', 'value', 'answers']);
        if (!keys.includes('name') || !keys.includes('value') || keys.some((key) => !allowed.has(key))) {
            return { ignore: true };
        }
        source = 'two-field';
    } else if (type === 'ols-score/1') {
        source = 'ols-score/1';
    } else if (type === 'xedu:submit-request') {
        source = 'xedu:submit-request';
        record = submitRequestRecord(parsed);
    } else {
        return { ignore: true };
    }
    return {
        ignore: false,
        source,
        name: record?.name,
        value: record?.value,
        passed: record?.passed,
        answers: record?.answers,
    };
}

function normalizeScoreDraft(input) {
    const classified = classifyScoreInput(input);
    if (classified.ignore) {
        return failure('score_invalid');
    }
    const name = typeof classified.name === 'string' ? classified.name.trim() : '';
    if (!name || name.length > 200) return failure('score_invalid');
    const value = classified.value;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
        return failure('score_invalid');
    }
    let passed = null;
    if (classified.passed !== undefined && classified.passed !== null) {
        if (typeof classified.passed !== 'boolean') return failure('score_invalid');
        passed = classified.passed;
    }
    const bag = sanitizeAnswersBag(classified.answers);
    if (bag.code) return failure(bag.code);
    const draft = {
        name,
        raw_score: value,
        score: Math.floor(value + 0.5),
        passed,
        source: classified.source,
    };
    if (bag.include) draft.answers = bag.answers;
    return {
        ok: true,
        status: 0,
        platform_status: '',
        code: '',
        message: '',
        retryable: false,
        request_id: '',
        draft,
    };
}

function safeSegment(value) {
    return String(value || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'unknown';
}

function packageCacheDirectory(cacheRoot, snapshot) {
    const originKey = crypto.createHash('sha256').update(String(snapshot.platform_origin)).digest('hex').slice(0, 24);
    return path.join(
        cacheRoot,
        originKey,
        safeSegment(snapshot.course_id),
        safeSegment(snapshot.course_version),
        safeSegment(snapshot.package_sha256),
    );
}

function sha256Hex(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Local classroom LearnSite is served by Caddy on https://localhost:8443 with a
// self-signed (or private-CA) certificate. Node's https client does not trust
// that certificate, so launch exchange, package GET, artifact upload, and
// submissions all fail unless the process sets NODE_TLS_REJECT_UNAUTHORIZED=0.
// That env var disables verification for every host. Only these loopback URL
// hostnames skip certificate checks. Any other host keeps Node's default trust
// store. The decision is per request URL, so a loopback platform_origin does
// not relax TLS for a package_url on another host.
const LOOPBACK_CLASSROOM_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function isLoopbackClassroomHost(hostname) {
    const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
    return LOOPBACK_CLASSROOM_HOSTS.has(host);
}

function tlsOptionsForUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    } catch (_) {
        return {};
    }
    if (parsed.protocol !== 'https:' || !isLoopbackClassroomHost(parsed.hostname)) return {};
    return { rejectUnauthorized: false };
}

function defaultRequest({ url, method = 'GET', headers = {}, body = null, timeoutMs = 20000 }) {
    return new Promise((resolve, reject) => {
        let parsed;
        try {
            parsed = new URL(url);
        } catch (error) {
            reject(error);
            return;
        }
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = lib.request(url, {
            method,
            headers,
            timeout: timeoutMs,
            ...tlsOptionsForUrl(url),
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                resolve({
                    status: res.statusCode || 0,
                    headers: res.headers || {},
                    body: Buffer.concat(chunks),
                });
            });
        });
        req.on('timeout', () => {
            req.destroy(Object.assign(new Error('timeout'), { timedOut: true }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

function readJsonBody(body) {
    try {
        return JSON.parse(Buffer.from(body || '').toString('utf8') || '{}');
    } catch (_) {
        return null;
    }
}

function listZipEntries(buffer) {
    let eocd = -1;
    const min = Math.max(0, buffer.length - 22 - 65535);
    for (let index = buffer.length - 22; index >= min; index -= 1) {
        if (buffer.readUInt32LE(index) === 0x06054b50) {
            eocd = index;
            break;
        }
    }
    if (eocd < 0) {
        throw Object.assign(new Error('not a zip'), { code: 'package_invalid' });
    }
    const count = buffer.readUInt16LE(eocd + 10);
    let offset = buffer.readUInt32LE(eocd + 16);
    const entries = [];
    for (let index = 0; index < count; index += 1) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) {
            throw Object.assign(new Error('bad zip'), { code: 'package_invalid' });
        }
        const method = buffer.readUInt16LE(offset + 10);
        const compSize = buffer.readUInt32LE(offset + 20);
        const nameLen = buffer.readUInt16LE(offset + 28);
        const extraLen = buffer.readUInt16LE(offset + 30);
        const commentLen = buffer.readUInt16LE(offset + 32);
        const localOffset = buffer.readUInt32LE(offset + 42);
        const name = buffer.slice(offset + 46, offset + 46 + nameLen).toString('utf8');
        const localNameLen = buffer.readUInt16LE(localOffset + 26);
        const localExtraLen = buffer.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLen + localExtraLen;
        const compressed = buffer.slice(dataStart, dataStart + compSize);
        let data = compressed;
        if (method === 8) data = zlib.inflateRawSync(compressed);
        else if (method !== 0) {
            throw Object.assign(new Error('unsupported zip'), { code: 'package_invalid' });
        }
        entries.push({ name: name.replace(/\\/g, '/'), data });
        offset += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

function safeZipDestination(root, name) {
    const normalized = String(name || '').replace(/\\/g, '/');
    if (!normalized || normalized.endsWith('/')) return '';
    if (normalized.startsWith('/') || normalized.includes('\0')) return '';
    const parts = normalized.split('/').filter(Boolean);
    if (parts.some((part) => part === '..')) return '';
    const destination = path.resolve(root, ...parts);
    const relative = path.relative(root, destination);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return '';
    return destination;
}

function extractZip(buffer, root) {
    fs.mkdirSync(root, { recursive: true });
    for (const entry of listZipEntries(buffer)) {
        const destination = safeZipDestination(root, entry.name);
        if (!destination) continue;
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, entry.data);
    }
}

function contentTypeFor(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    if (extension === '.html' || extension === '.htm') return 'text/html; charset=utf-8';
    if (extension === '.js') return 'text/javascript; charset=utf-8';
    if (extension === '.css') return 'text/css; charset=utf-8';
    if (extension === '.png') return 'image/png';
    if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
    if (extension === '.webp') return 'image/webp';
    if (extension === '.json') return 'application/json; charset=utf-8';
    return 'application/octet-stream';
}

function createLocalTaskSession(options = {}) {
    const request = options.request || defaultRequest;
    const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const now = options.now || (() => Date.now());
    const createRequestId = options.createRequestId || (() => crypto.randomUUID());
    const cacheRoot = options.cacheRoot;
    if (!cacheRoot) throw new Error('cacheRoot is required');

    const drafts = new Map();
    const nextDrafts = new Map();
    let snapshot = null;
    let activeKey = '';
    let taskGrant = '';
    let grantExpiresAt = 0;
    let saving = false;
    let hostServer = null;
    let hostRoot = '';
    let labBaseUrl = '';
    let courseRecord = null;
    let activeLaunchKey = '';
    const launchJobs = new Map();

    function draftForActive() {
        if (!activeKey) return null;
        return drafts.get(activeKey) || null;
    }

    function publicTask(extra = {}) {
        const draft = draftForActive();
        return {
            ok: Boolean(snapshot),
            active: Boolean(taskGrant) && !grantExpired(),
            grant_expired: Boolean(snapshot) && (!taskGrant || grantExpired()),
            protocol_version: PROTOCOL_VERSION,
            contract_revision: CONTRACT_REVISION,
            platform_origin: snapshot?.platform_origin || '',
            learner_scope: snapshot?.learner_scope || '',
            platform_activity_id: snapshot?.platform_activity_id || '',
            course_id: snapshot?.course_id || '',
            activity_id: snapshot?.activity_id || '',
            resource_id: snapshot?.resource_id || '',
            course_version: snapshot?.course_version || '',
            package_sha256: snapshot?.package_sha256 || '',
            course_root: snapshot ? path.join(packageCacheDirectory(cacheRoot, snapshot), 'extracted') : '',
            lab_url: snapshot ? labUrlFor(snapshot.resource_id) : '',
            lab_base_url: labBaseUrl,
            course: courseRecord,
            restored_draft: draft,
            has_draft: Boolean(draft),
            draft,
            status: extra.status || 0,
            platform_status: extra.platform_status || '',
            code: extra.code || '',
            message: extra.message || '',
            retryable: Boolean(extra.retryable),
            request_id: extra.requestId || '',
        };
    }

    function labUrlFor(resourceId) {
        if (!labBaseUrl || !resourceId) return '';
        const encoded = String(resourceId).split('/').map((part) => encodeURIComponent(part)).join('/');
        return `${labBaseUrl}${encoded}`;
    }

    function grantExpired() {
        return !taskGrant || (grantExpiresAt && now() >= grantExpiresAt);
    }

    function clearGrantKeepDraft() {
        taskGrant = '';
    }

    async function callJson({ url, method, headers, body, timeoutMs }) {
        try {
            return await request({ url, method, headers, body, timeoutMs });
        } catch (error) {
            return {
                networkError: true,
                timedOut: Boolean(error?.timedOut),
                status: 0,
                headers: {},
                body: Buffer.alloc(0),
            };
        }
    }

    function interpretPlatformError(response, requestId) {
        const payload = readJsonBody(response.body) || {};
        const httpStatus = response.networkError ? 0 : response.status;
        let code = canonicalPlatformCode(typeof payload.code === 'string' ? payload.code : '');
        if (response.timedOut) code = code || 'network';
        if (httpStatus === 401) code = 'grant_expired';
        if (httpStatus === 429 && (!code || code === 'network' || code === 'rate_limited')) code = 'rate_limited';
        if (httpStatus === 409 && code !== 'work_locked') code = code || 'conflict';
        if (code === 'work_locked' || httpStatus === 423) code = 'work_locked';
        if (!code) code = response.networkError ? 'network' : 'network';
        const neverRetry = [
            'grant_expired',
            'protocol_mismatch',
            'score_invalid',
            'work_locked',
            'conflict',
            'course_id_mismatch',
            'package_invalid',
            'XEDU_RESULT_NOT_PASSED',
        ].includes(code);
        const retryable = !neverRetry && (
            response.timedOut
            || response.networkError
            || httpStatus === 408
            || httpStatus === 429
            || httpStatus >= 500
            || payload.retryable === true
        ) && payload.retryable !== false;
        if (code === 'grant_expired' || httpStatus === 401) clearGrantKeepDraft();
        return failure(code, {
            status: httpStatus,
            serverMessage: payload.message,
            retryable,
            requestId: payload.request_id || requestId || '',
            timedOut: Boolean(response.timedOut),
            hasDraft: Boolean(draftForActive()),
            draft: draftForActive(),
        });
    }

    async function openLocalTask(rawUrl) {
        const link = typeof rawUrl === 'string' ? parseOpenLocalTaskLink(rawUrl) : rawUrl;
        if (!link?.launchGrant || !link?.platformOrigin) {
            return failure('no_active_task', { serverMessage: '任务链接不完整，请从学习平台重新打开。' });
        }
        const launchKey = `${link.platformOrigin}\n${link.launchGrant}`;
        const pending = launchJobs.get(launchKey);
        if (pending) return pending;
        if (activeLaunchKey === launchKey && snapshot && taskGrant && !grantExpired()) {
            return publicTask();
        }
        const job = openExchangedTask(link).finally(() => {
            if (launchJobs.get(launchKey) === job) launchJobs.delete(launchKey);
        });
        launchJobs.set(launchKey, job);
        const result = await job;
        if (result?.ok && result.lab_url && taskGrant) activeLaunchKey = launchKey;
        return result;
    }

    async function openExchangedTask(link) {
        const exchangeUrl = `${link.platformOrigin}/api/xedu/v1/launch/exchange`;
        const legacyLaunch = Boolean(link.legacyLaunch);
        const exchangeBody = Buffer.from(JSON.stringify(legacyLaunch
            ? { protocol_version: PROTOCOL_VERSION }
            : {
                protocol_version: PROTOCOL_VERSION,
                contract_revision: CONTRACT_REVISION,
                launch_grant: link.launchGrant,
            }));
        const exchangeHeaders = {
            'Content-Type': 'application/json',
            'Content-Length': String(exchangeBody.length),
        };
        if (legacyLaunch) exchangeHeaders.Authorization = `Bearer ${link.launchGrant}`;
        const response = await callJson({
            url: exchangeUrl,
            method: 'POST',
            headers: exchangeHeaders,
            body: exchangeBody,
        });
        if (response.networkError || response.status < 200 || response.status >= 300) {
            const error = interpretPlatformError(response, '');
            if (error.code === 'protocol_mismatch' || error.code === 'grant_expired') return error;
            if (response.networkError || error.retryable) {
                return failure('network', { status: response.status || 0, timedOut: response.timedOut, retryable: true });
            }
            return failure('protocol_mismatch', { status: response.status || 0 });
        }
        const payload = readJsonBody(response.body);
        if (!payload || payload.ok === false) {
            return failure(payload?.code === 'protocol_mismatch' ? 'protocol_mismatch' : 'protocol_mismatch', {
                status: response.status,
                serverMessage: payload?.message,
            });
        }
        if (!exchangeContractAccepted(payload, legacyLaunch)) {
            return failure('protocol_mismatch', { status: response.status });
        }
        const taskToken = taskTokenFromExchange(payload);
        if (!taskToken) return failure('grant_invalid', { status: response.status });
        const nextSnapshot = normalizeSnapshot(payload, link.platformOrigin);
        if (!nextSnapshot.ok) return nextSnapshot;
        const downloaded = await ensurePackage(nextSnapshot.snapshot, payload.package_url);
        if (!downloaded.ok) return downloaded;
        const hosted = await ensureHost(downloaded.extractedRoot);
        if (!hosted.ok) return hosted;
        snapshot = nextSnapshot.snapshot;
        activeKey = contextKey(snapshot);
        taskGrant = taskToken;
        const expires = Date.parse(payload.grant_expires_at || '');
        grantExpiresAt = Number.isFinite(expires) ? expires : now() + 120 * 60 * 1000;
        courseRecord = downloaded.course;
        return publicTask();
    }

    function normalizeSnapshot(payload, platformOrigin) {
        const resourceId = String(payload.resource_id || '').replace(/\\/g, '/').replace(/^\/+/, '');
        const courseId = String(payload.course_id || '').trim();
        const sha = String(payload.package_sha256 || '').trim().toLowerCase();
        const courseVersion = payload.course_version === undefined || payload.course_version === null
            ? ''
            : String(payload.course_version);
        const packageSize = Number(payload.package_size);
        if (!courseId || !payload.activity_id || !resourceId || !courseVersion || !/^[a-f0-9]{64}$/.test(sha)) {
            return failure('protocol_mismatch');
        }
        if (!Number.isFinite(packageSize) || packageSize < 0) return failure('package_invalid');
        if (resourceId.includes('..') || !/\.html?$/i.test(resourceId)) return failure('protocol_mismatch');
        return {
            ok: true,
            snapshot: {
                platform_origin: platformOrigin,
                learner_scope: String(payload.learner_scope || ''),
                platform_activity_id: String(payload.platform_activity_id || ''),
                course_id: courseId,
                activity_id: String(payload.activity_id),
                resource_id: resourceId,
                course_version: courseVersion,
                package_sha256: sha,
                package_size: packageSize,
            },
        };
    }

    async function ensurePackage(nextSnapshot, packageUrl) {
        let parsedUrl;
        try {
            parsedUrl = new URL(String(packageUrl || ''));
        } catch (_) {
            return failure('package_invalid');
        }
        if (parsedUrl.protocol !== 'https:') return failure('package_invalid');
        const directory = packageCacheDirectory(cacheRoot, nextSnapshot);
        const packagePath = path.join(directory, 'package.bin');
        const extractedRoot = path.join(directory, 'extracted');
        let bytes = null;
        if (fs.existsSync(packagePath)) {
            const cached = fs.readFileSync(packagePath);
            if (cached.length === nextSnapshot.package_size && sha256Hex(cached) === nextSnapshot.package_sha256) {
                bytes = cached;
            } else {
                fs.rmSync(packagePath, { force: true });
            }
        }
        if (!bytes) {
            const downloaded = await downloadPackage(String(packageUrl), nextSnapshot);
            if (!downloaded.ok) return downloaded;
            bytes = downloaded.bytes;
            fs.mkdirSync(directory, { recursive: true });
            const partial = `${packagePath}.partial`;
            fs.writeFileSync(partial, bytes);
            fs.renameSync(partial, packagePath);
        }
        const courseJsonPath = path.join(extractedRoot, 'course.json');
        const resourcePath = safeZipDestination(extractedRoot, nextSnapshot.resource_id);
        if (!fs.existsSync(courseJsonPath) || !resourcePath || !fs.existsSync(resourcePath)) {
            try {
                extractZip(bytes, extractedRoot);
            } catch (_) {
                return failure('package_invalid');
            }
        }
        let course;
        try {
            course = JSON.parse(fs.readFileSync(courseJsonPath, 'utf8'));
        } catch (_) {
            return failure('package_invalid');
        }
        if (!course || course.id !== nextSnapshot.course_id) {
            return failure('course_id_mismatch');
        }
        if (!resourcePath || !fs.existsSync(resourcePath)) return failure('package_invalid');
        course.local_path = extractedRoot;
        course.source = 'local';
        course.id = course.id;
        return { ok: true, bytes, extractedRoot, course };
    }

    async function downloadPackage(packageUrl, nextSnapshot) {
        let lastError = failure('package_invalid', { retryable: true });
        for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
            const response = await callJson({ url: packageUrl, method: 'GET', headers: {} });
            if (!response.networkError && response.status >= 200 && response.status < 300) {
                const bytes = Buffer.from(response.body || Buffer.alloc(0));
                if (bytes.length !== nextSnapshot.package_size || sha256Hex(bytes) !== nextSnapshot.package_sha256) {
                    return failure('package_invalid');
                }
                return { ok: true, bytes };
            }
            lastError = failure('network', { retryable: true, timedOut: response.timedOut, status: response.status || 0 });
            if (attempt === RETRY_DELAYS_MS.length) break;
            await sleep(RETRY_DELAYS_MS[attempt]);
        }
        return lastError;
    }

    function ensureHost(extractedRoot) {
        if (hostServer && hostRoot === extractedRoot && labBaseUrl) {
            return Promise.resolve({ ok: true });
        }
        return new Promise((resolve) => {
            if (hostServer) {
                hostServer.close();
                hostServer = null;
            }
            const server = http.createServer((req, res) => {
                try {
                    const url = new URL(req.url || '/', 'http://127.0.0.1');
                    const relative = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
                    const destination = safeZipDestination(extractedRoot, relative);
                    if (!destination || !fs.existsSync(destination) || !fs.statSync(destination).isFile()) {
                        res.writeHead(404);
                        res.end();
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': contentTypeFor(destination) });
                    fs.createReadStream(destination).pipe(res);
                } catch (_) {
                    res.writeHead(400);
                    res.end();
                }
            });
            server.on('error', () => resolve(failure('network')));
            server.listen(0, '127.0.0.1', () => {
                const address = server.address();
                hostServer = server;
                hostRoot = extractedRoot;
                labBaseUrl = `http://127.0.0.1:${address.port}/`;
                resolve({ ok: true });
            });
        });
    }

    function setDraft(input) {
        if (!activeKey) return failure('no_active_task');
        const normalized = normalizeScoreDraft(input);
        if (!normalized.ok) return normalized;
        if (saving) {
            nextDrafts.set(activeKey, normalized.draft);
            return {
                ok: true,
                status: 0,
                platform_status: '',
                code: '',
                message: '',
                retryable: false,
                request_id: '',
                queued: true,
                has_draft: false,
                draft: null,
            };
        }
        drafts.set(activeKey, normalized.draft);
        return {
            ok: true,
            status: 0,
            platform_status: '',
            code: '',
            message: '',
            retryable: false,
            request_id: '',
            queued: false,
            has_draft: true,
            draft: normalized.draft,
        };
    }

    function authorizationHeaders(extra = {}) {
        return {
            Authorization: `Bearer ${taskGrant}`,
            ...extra,
        };
    }

    function buildSubmission({ requestId, score, attachments, evidence }) {
        const body = {
            protocol_version: PROTOCOL_VERSION,
            contract_revision: CONTRACT_REVISION,
            request_id: requestId,
            platform_origin: snapshot.platform_origin,
            learner_scope: snapshot.learner_scope,
            platform_activity_id: snapshot.platform_activity_id,
            course_id: snapshot.course_id,
            activity_id: snapshot.activity_id,
            resource_id: snapshot.resource_id,
            course_version: snapshot.course_version,
            package_sha256: snapshot.package_sha256,
            name: score ? score.name : null,
            raw_score: score ? score.raw_score : null,
            score: score ? score.score : null,
            // A claimed score forwards passed unchanged. A null-score evidence
            // submit means the student saved evidence, so passed is true.
            passed: score ? score.passed : true,
            attachments,
        };
        if (score && Object.prototype.hasOwnProperty.call(score, 'answers')) {
            body.answers = score.answers;
        }
        if (evidence) body.evidence = evidence;
        return body;
    }

    async function postArtifact(file, requestId) {
        const prepared = prepareScreenshot(file);
        if (!prepared.ok) return prepared;
        const url = `${snapshot.platform_origin}/api/xedu/v1/artifacts`;
        const headers = authorizationHeaders({
            'Content-Type': prepared.mime,
            'Content-Length': String(prepared.bytes.length),
            'X-XEdu-Filename': prepared.filename,
            'X-XEdu-SHA256': prepared.sha256,
        });
        let last = failure('network', { retryable: true, requestId });
        for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
            const response = await callJson({
                url,
                method: 'POST',
                headers,
                body: prepared.bytes,
            });
            const payload = readJsonBody(response.body) || {};
            if (!response.networkError && response.status >= 200 && response.status < 300 && payload.ok !== false && payload.upload_id) {
                return {
                    ok: true,
                    upload: {
                        upload_id: String(payload.upload_id),
                        filename: prepared.filename,
                        sha256: prepared.sha256,
                        content_type: prepared.mime,
                    },
                };
            }
            last = interpretPlatformError(response, requestId);
            if (!payload.upload_id && !response.networkError && response.status >= 200 && response.status < 300) {
                last = failure('attachment_invalid', { status: response.status, requestId, hasDraft: Boolean(draftForActive()), draft: draftForActive() });
            }
            if (!last.retryable || attempt === RETRY_DELAYS_MS.length) return last;
            await sleep(RETRY_DELAYS_MS[attempt]);
        }
        return last;
    }

    function prepareScreenshot(file) {
        const mime = file?.mime === 'image/jpg' ? 'image/jpeg' : file?.mime;
        if (!SCREENSHOT_MIME[mime]) return failure('screenshot_type');
        const bytes = Buffer.isBuffer(file.bytes) ? file.bytes : Buffer.from(file.bytes || []);
        if (!bytes.length) return failure('screenshot_failed');
        if (bytes.length > MAX_SCREENSHOT_BYTES) return failure('screenshot_too_large');
        const filename = `experiment-view${SCREENSHOT_MIME[mime]}`;
        return { ok: true, bytes, mime, filename, sha256: sha256Hex(bytes) };
    }

    async function lookupStatus(requestId) {
        const url = `${snapshot.platform_origin}/api/xedu/v1/submissions/status?request_id=${encodeURIComponent(requestId)}`;
        const response = await callJson({
            url,
            method: 'GET',
            headers: authorizationHeaders(),
        });
        if (response.status === 404) return { found: false };
        if (response.networkError) {
            return failure('network', { retryable: true, timedOut: response.timedOut, requestId });
        }
        const payload = readJsonBody(response.body) || {};
        if (response.status >= 200 && response.status < 300 && payload.status === 'completed') {
            return {
                found: true,
                ok: true,
                platform_status: 'completed',
                receiptId: payload.receipt_id || '',
                requestId,
            };
        }
        if (payload.code === 'conflict' || response.status === 409) {
            return interpretPlatformError(response, requestId);
        }
        return { found: response.status !== 404, pending: true, retryable: true };
    }

    async function postSubmission(rawBody, requestId, mode) {
        const url = `${snapshot.platform_origin}/api/xedu/v1/submissions`;
        let accepted = false;
        let last = failure('network', { retryable: true, requestId });
        for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
            if (!accepted) {
                const response = await callJson({
                    url,
                    method: 'POST',
                    headers: authorizationHeaders({
                        'Content-Type': 'application/json',
                        'Content-Length': String(rawBody.length),
                    }),
                    body: rawBody,
                });
                const payload = readJsonBody(response.body) || {};
                if (!response.networkError && response.status >= 200 && response.status < 300 && payload.ok !== false) {
                    accepted = true;
                    if (payload.status === 'completed') {
                        return success(mode, { requestId, receiptId: payload.receipt_id || '', status: response.status });
                    }
                } else if (response.timedOut || response.networkError) {
                    const status = await lookupStatus(requestId);
                    if (status?.platform_status === 'completed') {
                        return success(mode, { requestId, receiptId: status.receiptId || '' });
                    }
                    last = failure('network', { retryable: true, timedOut: Boolean(response.timedOut), requestId });
                } else {
                    last = interpretPlatformError(response, requestId);
                    if (!last.retryable) return last;
                }
            } else {
                const status = await lookupStatus(requestId);
                if (status?.platform_status === 'completed') {
                    return success(mode, { requestId, receiptId: status.receiptId || '' });
                }
                if (status && status.ok === false && status.retryable === false) return status;
                last = failure('submission_not_completed', { retryable: true, requestId });
            }
            if (attempt === RETRY_DELAYS_MS.length) break;
            await sleep(RETRY_DELAYS_MS[attempt]);
        }
        if (last.code === 'network' || last.code === 'submission_not_completed') {
            return failure('submission_not_completed', { retryable: false, requestId, hasDraft: Boolean(draftForActive()) });
        }
        return last;
    }

    async function runSave(mode, file, meta = {}) {
        if (!snapshot || !activeKey) return failure('no_active_task');
        if (saving) return failure('save_in_flight', { hasDraft: Boolean(draftForActive()), draft: draftForActive() });
        if (grantExpired()) {
            clearGrantKeepDraft();
            return failure('grant_expired', { status: 401, hasDraft: Boolean(draftForActive()), draft: draftForActive() });
        }
        const needsScore = mode === 'score' || mode === 'combined';
        const needsFile = mode === 'screenshot' || mode === 'combined' || mode === 'evidence';
        const existingDraft = drafts.get(activeKey) || null;
        if (needsScore && !existingDraft) {
            return failure('no_score_draft');
        }
        if (needsFile && (!file || !file.bytes || !(Buffer.isBuffer(file.bytes) ? file.bytes.length : file.bytes.byteLength))) {
            return failure('screenshot_failed', { hasDraft: Boolean(existingDraft), draft: existingDraft });
        }
        const requestId = createRequestId();
        let frozen = null;
        if (needsScore) {
            frozen = existingDraft;
            drafts.delete(activeKey);
        }
        saving = true;
        try {
            let attachments = [];
            if (needsFile) {
                const uploaded = await postArtifact(file, requestId);
                if (!uploaded.ok) {
                    restoreAfterSave(frozen, needsScore);
                    return { ...uploaded, has_draft: Boolean(draftForActive()), draft: draftForActive() };
                }
                attachments = [uploaded.upload];
            }
            const score = needsScore ? frozen : null;
            if (!score && attachments.length === 0) {
                restoreAfterSave(frozen, needsScore);
                return failure('no_score_draft');
            }
            let evidence = null;
            if (mode === 'evidence') {
                const experiment = meta?.experiment === 'scratch' || meta?.experiment === 'notebook'
                    ? meta.experiment
                    : '';
                evidence = {
                    type: 'screenshot',
                    experiment,
                    project_file: projectFileEvidenceAttachment(experiment).attachment,
                };
            }
            const rawBody = Buffer.from(JSON.stringify(buildSubmission({
                requestId,
                score,
                attachments,
                evidence,
            })));
            const posted = await postSubmission(rawBody, requestId, mode);
            if (posted.platform_status !== 'completed') {
                restoreAfterSave(frozen, needsScore);
                return { ...posted, has_draft: Boolean(draftForActive()), draft: draftForActive() };
            }
            promoteNextDraft(needsScore);
            return {
                ...posted,
                has_draft: Boolean(draftForActive()),
                draft: draftForActive(),
            };
        } finally {
            saving = false;
        }
    }

    function restoreAfterSave(frozen, replaceDraft) {
        const queued = nextDrafts.get(activeKey);
        nextDrafts.delete(activeKey);
        if (queued) {
            drafts.set(activeKey, queued);
            return;
        }
        if (replaceDraft && frozen) drafts.set(activeKey, frozen);
    }

    function promoteNextDraft(replaceDraft) {
        const queued = nextDrafts.get(activeKey);
        nextDrafts.delete(activeKey);
        if (queued) drafts.set(activeKey, queued);
        else if (replaceDraft) drafts.delete(activeKey);
    }

    function close() {
        const server = hostServer;
        hostServer = null;
        labBaseUrl = '';
        hostRoot = '';
        if (!server) return Promise.resolve();
        return new Promise((resolve) => server.close(() => resolve()));
    }

    return {
        parseOpenLocalTaskLink,
        openLocalTask,
        getPublicTask() {
            if (!snapshot) return failure('no_active_task');
            const task = publicTask();
            if (task.grant_expired) {
                task.message = studentMessage('grant_expired');
                task.code = 'grant_expired';
                task.status = 401;
            }
            return task;
        },
        setDraft,
        getDraft: draftForActive,
        saveScore() {
            return runSave('score');
        },
        uploadScreenshot(file) {
            return runSave('screenshot', file);
        },
        saveEvidence(file, meta) {
            return runSave('evidence', file, meta || {});
        },
        saveCombined(file) {
            return runSave('combined', file);
        },
        close,
    };
}

function registerLocalTaskIpc({ ipcMain, isTrusted, session, captureExperimentView }) {
    const guard = (event) => {
        if (isTrusted(event)) return null;
        return failure('forbidden', { status: 403 });
    };

    ipcMain.handle('xedu:local-task-state', (event) => {
        const denied = guard(event);
        if (denied) return denied;
        return session.getPublicTask();
    });

    ipcMain.handle('xedu:local-task-set-draft', (event, draft) => {
        const denied = guard(event);
        if (denied) return denied;
        return session.setDraft(draft);
    });

    ipcMain.handle('xedu:local-task-save-score', (event) => {
        const denied = guard(event);
        if (denied) return denied;
        return session.saveScore();
    });

    ipcMain.handle('xedu:local-task-upload-screenshot', async (event, bounds) => {
        const denied = guard(event);
        if (denied) return denied;
        const shot = await captureExperimentView(bounds);
        if (!shot?.bytes) return failure('screenshot_failed', { hasDraft: Boolean(session.getDraft()), draft: session.getDraft() });
        return session.uploadScreenshot(shot);
    });

    ipcMain.handle('xedu:local-task-save-evidence', async (event, payload) => {
        const denied = guard(event);
        if (denied) return denied;
        const bounds = payload && Object.prototype.hasOwnProperty.call(payload, 'bounds') ? payload.bounds : payload;
        const shot = await captureExperimentView(bounds);
        if (!shot?.bytes) return failure('screenshot_failed', { hasDraft: Boolean(session.getDraft()), draft: session.getDraft() });
        return session.saveEvidence(shot, { experiment: payload?.experiment });
    });

    ipcMain.handle('xedu:local-task-save-combined', async (event, bounds) => {
        const denied = guard(event);
        if (denied) return denied;
        const shot = await captureExperimentView(bounds);
        if (!shot?.bytes) {
            return failure('screenshot_failed', { hasDraft: Boolean(session.getDraft()), draft: session.getDraft() });
        }
        return session.saveCombined(shot);
    });
}

module.exports = {
    PROTOCOL_VERSION,
    CONTRACT_REVISION,
    RETRY_DELAYS_MS,
    MAX_ANSWERS_JSON_BYTES,
    STUDENT_MESSAGES,
    projectFileEvidenceAttachment,
    parseOpenLocalTaskLink,
    isLoopbackClassroomHost,
    tlsOptionsForUrl,
    defaultRequest,
    normalizeScoreDraft,
    packageCacheDirectory,
    contextKey,
    experimentCaptureRect,
    createLaunchOpener,
    createLocalTaskSession,
    registerLocalTaskIpc,
};
