import assert from 'node:assert/strict';
import test from 'node:test';

import { createCourseAiFrameBridge } from './course-ai-bridge.js';

function createWindowHarness() {
  let messageHandler = null;
  return {
    windowObject: {
      addEventListener(type, handler) {
        if (type === 'message') messageHandler = handler;
      },
      removeEventListener(type, handler) {
        if (type === 'message' && messageHandler === handler) messageHandler = null;
      },
    },
    dispatch(event) {
      assert.ok(messageHandler, 'message bridge should be registered');
      return messageHandler(event);
    },
  };
}

test('course AI bridge forwards only one local pose_body17 request from its active frame', async () => {
  const harness = createWindowHarness();
  const childWindow = { postMessageCalls: [], postMessage(message, origin) { this.postMessageCalls.push([message, origin]); } };
  const requests = [];
  const bridge = createCourseAiFrameBridge({
    windowObject: harness.windowObject,
    requestApi: async (request) => {
      requests.push(request);
      return { status: 200, headers: { 'content-type': 'application/json' }, body: '{"success":true}' };
    },
  });
  bridge.attach({ contentWindow: childWindow }, 'http://127.0.0.1:5123/api/resources/local-file/course/lesson1/index.html');

  await harness.dispatch({
    source: childWindow,
    origin: 'http://127.0.0.1:5123',
    data: {
      type: 'xedu:course-ai-request',
      requestId: 'pose-1',
      taskId: 'pose_body17',
      frame: 'data:image/jpeg;base64,ZmFrZQ==',
    },
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].path, '/api/resources/xeduhub/execute');
  assert.deepEqual(JSON.parse(requests[0].body), {
    code: '',
    project_root: '',
    spec: {
      task_id: 'pose_body17',
      input: 'data:image/jpeg;base64,ZmFrZQ==',
      params: { img_type: '' },
    },
  });
  assert.deepEqual(childWindow.postMessageCalls, [[{
    type: 'xedu:course-ai-response',
    requestId: 'pose-1',
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: '{"success":true}',
  }, 'http://127.0.0.1:5123']]);
});

test('course AI bridge rejects messages from another window or origin', async () => {
  const harness = createWindowHarness();
  const childWindow = { postMessage() {} };
  let requests = 0;
  const bridge = createCourseAiFrameBridge({
    windowObject: harness.windowObject,
    requestApi: async () => { requests += 1; },
  });
  bridge.attach({ contentWindow: childWindow }, 'http://127.0.0.1:5123/course.html');
  const request = {
    type: 'xedu:course-ai-request',
    requestId: 'pose-2',
    taskId: 'pose_body17',
    frame: 'data:image/png;base64,ZmFrZQ==',
  };

  await harness.dispatch({ source: {}, origin: 'http://127.0.0.1:5123', data: request });
  await harness.dispatch({ source: childWindow, origin: 'http://evil.example', data: request });

  assert.equal(requests, 0);
});

test('course AI bridge accepts a frame whose browsing context appears after attach', async () => {
  const harness = createWindowHarness();
  const frame = { contentWindow: null };
  const childWindow = { postMessage() {} };
  let requests = 0;
  const bridge = createCourseAiFrameBridge({
    windowObject: harness.windowObject,
    requestApi: async () => {
      requests += 1;
      return { status: 200, body: '{"success":true}' };
    },
  });
  bridge.attach(frame, 'http://127.0.0.1:5123/course.html');
  frame.contentWindow = childWindow;

  await harness.dispatch({
    source: childWindow,
    origin: 'http://127.0.0.1:5123',
    data: {
      type: 'xedu:course-ai-request',
      requestId: 'pose-late-frame',
      taskId: 'pose_body17',
      frame: 'data:image/png;base64,ZmFrZQ==',
    },
  });

  assert.equal(requests, 1);
});

test('course AI bridge does not expose arbitrary tasks or non-image input', async () => {
  const harness = createWindowHarness();
  const responses = [];
  const childWindow = { postMessage(message, origin) { responses.push([message, origin]); } };
  let requests = 0;
  const bridge = createCourseAiFrameBridge({
    windowObject: harness.windowObject,
    requestApi: async () => { requests += 1; },
  });
  bridge.attach({ contentWindow: childWindow }, 'http://127.0.0.1:5123/course.html');

  await harness.dispatch({
    source: childWindow,
    origin: 'http://127.0.0.1:5123',
    data: {
      type: 'xedu:course-ai-request',
      requestId: 'pose-3',
      taskId: 'ocr',
      frame: 'data:image/png;base64,ZmFrZQ==',
    },
  });
  await harness.dispatch({
    source: childWindow,
    origin: 'http://127.0.0.1:5123',
    data: {
      type: 'xedu:course-ai-request',
      requestId: 'pose-4',
      taskId: 'pose_body17',
      frame: '/Users/student/secret.png',
    },
  });

  assert.equal(requests, 0);
  assert.equal(responses.length, 2);
  assert.match(responses[0][0].error, /人体关键点/);
  assert.match(responses[1][0].error, /摄像头画面/);
  assert.ok(responses.every(([, origin]) => origin === 'http://127.0.0.1:5123'));
});
