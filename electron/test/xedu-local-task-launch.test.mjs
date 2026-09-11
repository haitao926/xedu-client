import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  cleanupXEduCoursePackage,
  downloadXEduCoursePackage,
  exchangeXEduLocalTaskLaunch,
  parseXEduLocalTaskDeepLink,
} = require('../main/xedu-local-task-launch.js');

const launchUrl = [
  'xedu://open-local-task',
  '?platform_origin=https%3A%2F%2Flearn.example',
  '&course_id=course-1',
  '&activity_id=camera-check',
  '&resource_id=lesson1%2Fexp1%2Findex.html',
  '&grant=one-time-launch-grant',
].join('');

test('local task deep link accepts only an HTTPS platform origin and bounded task fields', () => {
  assert.deepEqual(parseXEduLocalTaskDeepLink(launchUrl), {
    platformOrigin: 'https://learn.example',
    courseId: 'course-1',
    activityId: 'camera-check',
    resourceId: 'lesson1/exp1/index.html',
    launchGrant: 'one-time-launch-grant',
  });

  assert.equal(
    parseXEduLocalTaskDeepLink(launchUrl.replace('https%3A', 'http%3A')),
    null,
  );
  assert.equal(
    parseXEduLocalTaskDeepLink(launchUrl.replace('open-local-task', 'open-practice')),
    null,
  );
  assert.equal(
    parseXEduLocalTaskDeepLink(launchUrl.replace('course-1', '')),
    null,
  );
});

test('launch exchange posts to a fixed path and returns only same-origin submission endpoints', async () => {
  const requests = [];
  const launch = parseXEduLocalTaskDeepLink(launchUrl);
  const context = await exchangeXEduLocalTaskLaunch(launch, {
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({
        ok: true,
        protocol_version: 1,
        course_id: 'course-1',
        activity_id: 'camera-check',
        resource_id: 'lesson1/exp1/index.html',
        grant: 'short-lived-task-grant',
        expires_at: '2099-01-01T00:00:00Z',
        artifact_upload_url: 'https://learn.example/api/xedu/v1/artifacts',
        submit_url: 'https://learn.example/api/xedu/v1/submissions',
        completion_url: 'https://learn.example/api/xedu/v1/submissions/status',
      }), { status: 200 });
    },
  });

  assert.equal(requests[0].url, 'https://learn.example/api/xedu/v1/launch/exchange');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer one-time-launch-grant');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    client: 'xedu-client',
    protocol_version: 1,
  });
  assert.equal(context.grant, 'short-lived-task-grant');
  assert.equal('launchGrant' in context, false);
  assert.equal('student_id' in context, false);
});

test('launch exchange rejects endpoint substitution and task-scope substitution', async () => {
  const launch = parseXEduLocalTaskDeepLink(launchUrl);
  const responseFor = (overrides) => new Response(JSON.stringify({
    ok: true,
    protocol_version: 1,
    course_id: 'course-1',
    activity_id: 'camera-check',
    resource_id: 'lesson1/exp1/index.html',
    grant: 'short-lived-task-grant',
    expires_at: '2099-01-01T00:00:00Z',
    artifact_upload_url: 'https://learn.example/api/xedu/v1/artifacts',
    submit_url: 'https://learn.example/api/xedu/v1/submissions',
    completion_url: 'https://learn.example/api/xedu/v1/submissions/status',
    ...overrides,
  }), { status: 200 });

  await assert.rejects(
    exchangeXEduLocalTaskLaunch(launch, {
      fetchImpl: async () => responseFor({ submit_url: 'https://evil.example/steal' }),
    }),
    /地址不可信/,
  );
  await assert.rejects(
    exchangeXEduLocalTaskLaunch(launch, {
      fetchImpl: async () => responseFor({ activity_id: 'another-activity' }),
    }),
    /任务范围不一致/,
  );
});

test('launch exchange returns validated optional course package metadata', async () => {
  const launch = parseXEduLocalTaskDeepLink(launchUrl);
  const context = await exchangeXEduLocalTaskLaunch(launch, {
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      protocol_version: 1,
      course_id: 'course-1',
      activity_id: 'camera-check',
      resource_id: 'lesson1/exp1/index.html',
      course_version: '2026.09.09-1',
      package_url: 'https://learn.example/packages/course-1.zip',
      package_sha256: 'a'.repeat(64),
      package_size: 3,
      grant: 'short-lived-task-grant',
      artifact_upload_url: 'https://learn.example/api/xedu/v1/artifacts',
      submit_url: 'https://learn.example/api/xedu/v1/submissions',
      completion_url: 'https://learn.example/api/xedu/v1/submissions/status',
    }), { status: 200 }),
  });

  assert.equal(context.course_version, '2026.09.09-1');
  assert.equal(context.package_url, 'https://learn.example/packages/course-1.zip');
  assert.equal(context.package_size, 3);
  assert.equal(context.package_sha256, 'a'.repeat(64));
});

test('launch exchange rejects invalid course package metadata', async () => {
  const launch = parseXEduLocalTaskDeepLink(launchUrl);
  const responseFor = (overrides) => new Response(JSON.stringify({
    ok: true,
    protocol_version: 1,
    course_id: 'course-1',
    activity_id: 'camera-check',
    resource_id: 'lesson1/exp1/index.html',
    course_version: '2026.09.09-1',
    package_url: 'https://evil.example/course.zip',
    package_sha256: 'bad',
    package_size: 3,
    grant: 'short-lived-task-grant',
    artifact_upload_url: 'https://learn.example/api/xedu/v1/artifacts',
    submit_url: 'https://learn.example/api/xedu/v1/submissions',
    completion_url: 'https://learn.example/api/xedu/v1/submissions/status',
    ...overrides,
  }), { status: 200 });

  await assert.rejects(
    exchangeXEduLocalTaskLaunch(launch, { fetchImpl: async () => responseFor({}) }),
    /课程包地址不可信/,
  );
  await assert.rejects(
    exchangeXEduLocalTaskLaunch(launch, {
      fetchImpl: async () => responseFor({
        package_url: 'https://learn.example/course.zip',
        package_sha256: 'bad',
      }),
    }),
    /SHA-256/,
  );
  await assert.rejects(
    exchangeXEduLocalTaskLaunch(launch, {
      fetchImpl: async () => responseFor({
        package_url: 'https://learn.example/course.zip',
        package_sha256: 'a'.repeat(64),
        package_size: 0,
      }),
    }),
    /大小无效/,
  );
});

test('course package downloader verifies bytes and exposes token-scoped cleanup', async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'xedu-package-test-'));
  try {
    const context = {
      platform_origin: 'https://learn.example',
      course_id: 'course-1',
      course_version: '2026.09.09-1',
      package_url: 'https://learn.example/packages/course-1.zip',
      package_sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      package_size: 3,
    };
    const downloaded = await downloadXEduCoursePackage(context, {
      fetchImpl: async () => new Response('abc', { status: 200 }),
      tempRoot,
    });
    assert.equal(await readFile(downloaded.package_path, 'utf8'), 'abc');
    assert.equal((await readdir(tempRoot)).length, 1);
    await cleanupXEduCoursePackage(downloaded.cleanup_token);
    assert.deepEqual(await readdir(tempRoot), []);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('course package downloader removes mismatched temporary data', async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), 'xedu-package-test-'));
  try {
    await assert.rejects(
      downloadXEduCoursePackage({
        platform_origin: 'https://learn.example',
        course_id: 'course-1',
        course_version: '2026.09.09-1',
        package_url: 'https://learn.example/packages/course-1.zip',
        package_sha256: 'a'.repeat(64),
        package_size: 3,
      }, {
        fetchImpl: async () => new Response('abc', { status: 200 }),
        tempRoot,
      }),
      /SHA-256/,
    );
    assert.deepEqual(await readdir(tempRoot), []);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('course package cleanup rejects unknown tokens without touching the filesystem', async () => {
  const { cleanupXEduCoursePackage } = require('../main/xedu-local-task-launch.js');
  assert.equal(await cleanupXEduCoursePackage('unknown-cleanup-token'), false);
});
