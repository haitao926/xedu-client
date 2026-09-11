const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_FIELD_LENGTH = 512;
const MAX_PACKAGE_SIZE = 1024 * 1024 * 1024;
const EXCHANGE_PATH = '/api/xedu/v1/launch/exchange';
const packageCleanupRecords = new Map();

function readBoundedParam(params, name) {
    const value = String(params.get(name) || '').trim();
    if (!value || value.length > MAX_FIELD_LENGTH || /[\r\n]/.test(value)) return '';
    return value;
}

function parseHttpsOrigin(value) {
    try {
        const parsed = new URL(String(value || ''));
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
            return '';
        }
        return parsed.origin;
    } catch (_) {
        return '';
    }
}

function parseXEduLocalTaskDeepLink(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'xedu:' || parsed.hostname !== 'open-local-task') return null;
        const platformOrigin = parseHttpsOrigin(parsed.searchParams.get('platform_origin'));
        const courseId = readBoundedParam(parsed.searchParams, 'course_id');
        const activityId = readBoundedParam(parsed.searchParams, 'activity_id');
        const resourceId = readBoundedParam(parsed.searchParams, 'resource_id');
        const launchGrant = readBoundedParam(parsed.searchParams, 'grant');
        if (!platformOrigin || !courseId || !activityId || !resourceId || !launchGrant) return null;
        return { platformOrigin, courseId, activityId, resourceId, launchGrant };
    } catch (_) {
        return null;
    }
}

async function readJsonResponse(response) {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch (_) {
        throw new Error('平台返回了无效的任务授权数据');
    }
}

function validateEndpoint(value, platformOrigin) {
    try {
        const endpoint = new URL(String(value || ''));
        if (endpoint.protocol !== 'https:' || endpoint.origin !== platformOrigin || endpoint.username || endpoint.password) {
            return '';
        }
        return endpoint.href;
    } catch (_) {
        return '';
    }
}

function validateCoursePackageMetadata(payload, platformOrigin) {
    const packageUrl = String(payload?.package_url || '').trim();
    const hasPackageMetadata = Boolean(
        packageUrl
        || payload?.course_version
        || payload?.package_sha256
        || payload?.package_size !== undefined,
    );
    if (!hasPackageMetadata) return null;

    const courseVersion = String(payload?.course_version || '').trim();
    if (!courseVersion || courseVersion.length > MAX_FIELD_LENGTH || /[\r\n]/.test(courseVersion)) {
        throw new Error('课程版本无效');
    }
    const validatedUrl = validateEndpoint(packageUrl, platformOrigin);
    if (!validatedUrl) throw new Error('课程包地址不可信');
    const packageSha256 = String(payload?.package_sha256 || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(packageSha256)) throw new Error('课程包 SHA-256 无效');
    const packageSize = Number(payload?.package_size);
    if (!Number.isSafeInteger(packageSize) || packageSize <= 0 || packageSize > MAX_PACKAGE_SIZE) {
        throw new Error('课程包大小无效');
    }
    return {
        course_version: courseVersion,
        package_url: validatedUrl,
        package_sha256: packageSha256,
        package_size: packageSize,
    };
}

function assertResponseTaskScope(response, launch) {
    const fields = [
        ['course_id', launch.courseId],
        ['activity_id', launch.activityId],
        ['resource_id', launch.resourceId],
    ];
    for (const [name, expected] of fields) {
        if (String(response?.[name] || '').trim() !== expected) {
            throw new Error('平台返回的任务范围不一致');
        }
    }
}

async function exchangeXEduLocalTaskLaunch(launch, { fetchImpl = globalThis.fetch } = {}) {
    if (!launch || typeof launch !== 'object' || !launch.platformOrigin || !launch.launchGrant) {
        throw new Error('本地任务授权无效');
    }
    if (typeof fetchImpl !== 'function') throw new Error('无法连接学习平台');
    const platformOrigin = parseHttpsOrigin(launch.platformOrigin);
    if (!platformOrigin) throw new Error('平台地址不可信');

    const response = await fetchImpl(`${platformOrigin}${EXCHANGE_PATH}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${launch.launchGrant}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ client: 'xedu-client', protocol_version: 1 }),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok || payload?.ok !== true) {
        throw new Error(payload?.message || '学习平台未接受本地任务授权');
    }
    if (payload.protocol_version !== 1) throw new Error('平台任务协议版本不兼容');
    assertResponseTaskScope(payload, launch);

    const grant = String(payload.grant || '').trim();
    if (!grant || grant.length > MAX_FIELD_LENGTH) throw new Error('平台任务授权无效');
    const artifactUploadUrl = validateEndpoint(payload.artifact_upload_url, platformOrigin);
    const submitUrl = validateEndpoint(payload.submit_url, platformOrigin);
    const completionUrl = validateEndpoint(payload.completion_url, platformOrigin);
    if (!artifactUploadUrl || !submitUrl || !completionUrl) throw new Error('平台返回的提交地址不可信');

    const packageMetadata = validateCoursePackageMetadata(payload, platformOrigin);

    const resourceUrl = String(payload.resource_url || '').trim();
    if (resourceUrl && resourceUrl.length > MAX_FIELD_LENGTH) throw new Error('平台资源地址无效');
    return {
        platform_origin: platformOrigin,
        course_id: launch.courseId,
        activity_id: launch.activityId,
        resource_id: launch.resourceId,
        resource_url: resourceUrl,
        grant,
        expires_at: String(payload.expires_at || '').trim(),
        artifact_upload_url: artifactUploadUrl,
        submit_url: submitUrl,
        completion_url: completionUrl,
        ...(packageMetadata || {}),
    };
}

async function removePackageDirectory(directory) {
    if (!directory) return;
    await fs.promises.rm(directory, { recursive: true, force: true });
}

async function downloadXEduCoursePackage(context, {
    fetchImpl = globalThis.fetch,
    tempRoot = os.tmpdir(),
} = {}) {
    if (!context || typeof context !== 'object') throw new Error('课程包下载上下文无效');
    const platformOrigin = parseHttpsOrigin(context.platform_origin);
    if (!platformOrigin) throw new Error('平台地址不可信');
    const metadata = validateCoursePackageMetadata(context, platformOrigin);
    if (!metadata) throw new Error('平台未提供完整课程包信息');
    if (typeof fetchImpl !== 'function') throw new Error('无法下载课程包');

    let packageDirectory = '';
    let packagePath = '';
    try {
        packageDirectory = await fs.promises.mkdtemp(path.join(tempRoot, 'xedu-course-package-'));
        packagePath = path.join(packageDirectory, 'course.zip');
        const response = await fetchImpl(metadata.package_url, { method: 'GET' });
        if (!response?.ok) throw new Error('课程包下载失败');
        if (!response.body || typeof response.body[Symbol.asyncIterator] !== 'function') {
            throw new Error('课程包下载响应无效');
        }

        const output = await fs.promises.open(packagePath, 'w');
        const digest = crypto.createHash('sha256');
        let receivedBytes = 0;
        try {
            for await (const chunk of response.body) {
                const buffer = Buffer.from(chunk);
                receivedBytes += buffer.length;
                if (receivedBytes > metadata.package_size) {
                    throw new Error('课程包大小超过声明值');
                }
                digest.update(buffer);
                await output.write(buffer);
            }
        } finally {
            await output.close();
        }
        if (receivedBytes !== metadata.package_size) throw new Error('课程包大小不匹配');
        if (digest.digest('hex') !== metadata.package_sha256) throw new Error('课程包 SHA-256 校验失败');

        const cleanupToken = crypto.randomUUID();
        packageCleanupRecords.set(cleanupToken, packageDirectory);
        // Keep IPC-safe: no functions (Electron structured clone).
        return {
            success: true,
            package_path: packagePath,
            cleanup_token: cleanupToken,
        };
    } catch (error) {
        await removePackageDirectory(packageDirectory).catch(() => {});
        throw error;
    }
}

async function cleanupXEduCoursePackage(cleanupToken) {
    const token = String(cleanupToken || '').trim();
    if (!token) return false;
    const directory = packageCleanupRecords.get(token);
    if (!directory) return false;
    packageCleanupRecords.delete(token);
    await removePackageDirectory(directory);
    return true;
}

module.exports = {
    EXCHANGE_PATH,
    cleanupXEduCoursePackage,
    downloadXEduCoursePackage,
    exchangeXEduLocalTaskLaunch,
    parseXEduLocalTaskDeepLink,
};
