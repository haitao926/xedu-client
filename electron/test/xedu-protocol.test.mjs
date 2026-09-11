import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { parseLocalTaskDeepLink, parsePracticeDeepLink, parseXeduDeepLink } = require('../main/xedu-protocol.js');
const { isAllowedPlatformUrl, platformJsonRequest } = require('../main/platform-json-request.js');

test('practice deep links still require project and file', () => {
  assert.deepEqual(
    parsePracticeDeepLink('xedu://open-practice?project=/tmp/lab&file=main.ipynb&kind=notebook'),
    { projectDir: '/tmp/lab', filePath: 'main.ipynb', kind: 'notebook' },
  );
  assert.equal(parsePracticeDeepLink('xedu://open-local-task?code=abc'), null);
});

test('open-local-task deep links capture exchange, file, and grant fields', () => {
  const parsed = parseLocalTaskDeepLink(
    'xedu://open-local-task?exchange_url=https%3A%2F%2Flearn.example%2Fex&code=ticket-1&local_path=%2Ftmp%2Ftask&file=quiz%2Findex.html&course_id=c1&activity_id=a1&resource_id=r1',
  );
  assert.equal(parsed.exchangeUrl, 'https://learn.example/ex');
  assert.equal(parsed.code, 'ticket-1');
  assert.equal(parsed.localPath, '/tmp/task');
  assert.equal(parsed.filePath, 'quiz/index.html');
  assert.equal(parsed.courseId, 'c1');
  assert.equal(parseXeduDeepLink('xedu://open-local-task?grant=g&submit_url=https://learn.example/s').type, 'open-local-task');
});

test('platform JSON helper only posts to https or local http URLs', async () => {
  assert.equal(isAllowedPlatformUrl('https://learn.example/api/submit'), true);
  assert.equal(isAllowedPlatformUrl('http://127.0.0.1:8080/submit'), true);
  assert.equal(isAllowedPlatformUrl('http://evil.example/submit'), false);

  const denied = await platformJsonRequest({ url: 'http://evil.example/submit', method: 'POST', body: '{}' });
  assert.equal(denied.status, 400);

  const calls = [];
  const httpsClient = {
    request(options, onResponse) {
      calls.push(options);
      const response = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        setEncoding() {},
        on(type, handler) {
          if (type === 'data') handler('{"ok":true}');
          if (type === 'end') handler();
        },
      };
      onResponse(response);
      return {
        on() {},
        end(body) { this.body = body; },
      };
    },
  };
  const result = await platformJsonRequest({
    url: 'https://learn.example/api/submit',
    method: 'POST',
    headers: { Authorization: 'Bearer grant-1', 'Content-Type': 'application/json' },
    body: '{"score":1}',
  }, { httpsClient });
  assert.equal(result.status, 200);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.Authorization, 'Bearer grant-1');
});
