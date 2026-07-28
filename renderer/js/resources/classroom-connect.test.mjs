import assert from 'node:assert/strict';
import test from 'node:test';
import {
  connectStudentClassroomByCodeFlow,
  normalizeClassroomAddress,
} from './classroom-connect.js';

test('manual classroom address is normalized and rejects non HTTP(S) input', () => {
  assert.deepEqual(normalizeClassroomAddress('http://teacher.local:5123'), {
    base_url: 'http://teacher.local:5123',
    host: 'teacher.local',
    port: 5123,
  });
  assert.match(normalizeClassroomAddress('ftp://teacher.local:5123').error, /HTTP/);
  assert.match(normalizeClassroomAddress('http://teacher.local:70000').error, /完整地址|格式|端口/);
});

test('student connection falls back to the teacher address when UDP discovery is empty', async () => {
  const classroomState = { source: null, connected: false };
  const calls = [];
  const result = await connectStudentClassroomByCodeFlow('', { allowManualAddressFallback: true, diagnosticMode: true }, {
    initialized: () => true,
    bindEvents() {},
    setInitialized() {},
    setLocalCourses() {},
    loadLocalCourses: () => [],
    loadClassroomConfig: async () => {},
    ensureTeacherModeReady: async () => {},
    classroomState,
    buildClassroomBaseUrl: (entry) => entry?.base_url || '',
    apiClient: {
      get: async (url) => {
        calls.push(['get', url]);
        return { success: true, classrooms: [] };
      },
      post: async (url, payload) => {
        calls.push(['post', url, payload]);
        return { success: true, index: { resources: [] } };
      },
    },
    requestManualClassroomAddress: async () => ({
      base_url: 'http://teacher.local:5123',
      host: 'teacher.local',
      port: 5123,
    }),
    rememberClassroomSource: (source) => calls.push(['remember', source.base_url]),
    applyResourcesIndex: () => {},
    updateClassroomBanner: () => {},
    showListView: () => {},
    showDetailView: () => {},
    resourcesCache: () => [],
  });

  assert.equal(result.success, true, result.message);
  assert.equal(classroomState.source.base_url, 'http://teacher.local:5123');
  assert.deepEqual(calls, [
    ['get', '/api/classroom/discover?timeout=3.5'],
    ['post', '/api/classroom/fetch-index', { base_url: 'http://teacher.local:5123', classroom_code: '' }],
    ['remember', 'http://teacher.local:5123'],
  ]);
});

test('student connection retries discovered classrooms and deduplicates repeated broadcasts', async () => {
  const classroomState = { source: null, connected: false };
  const calls = [];
  const result = await connectStudentClassroomByCodeFlow('', {}, {
    initialized: () => true,
    bindEvents() {},
    setInitialized() {},
    setLocalCourses() {},
    loadLocalCourses: () => [],
    loadClassroomConfig: async () => {},
    ensureTeacherModeReady: async () => {},
    classroomState,
    buildClassroomBaseUrl: (entry) => `http://${entry.host}:${entry.port}`,
    apiClient: {
      get: async (url) => {
        calls.push(['get', url]);
        return {
          success: true,
          classrooms: [
            { server_id: 'srv-1', name: '课堂 A', code: 'room-a', host: 'teacher-a.local', port: 5123 },
            { server_id: 'srv-1', name: '课堂 A 重复', code: 'room-a', host: 'teacher-a.local', port: 5123 },
            { server_id: 'srv-2', name: '课堂 B', code: 'room-b', host: 'teacher-b.local', port: 5123 },
          ],
        };
      },
      post: async (url, payload) => {
        calls.push([url, payload]);
        if (payload.base_url === 'http://teacher-a.local:5123') {
          return { success: false, message: '课堂课程不可达' };
        }
        return { success: true, index: { resources: [] } };
      },
    },
    requestManualClassroomAddress: async () => null,
    rememberClassroomSource() {},
    applyResourcesIndex() {},
    updateClassroomBanner() {},
    showListView() {},
    showDetailView() {},
    resourcesCache: () => [],
  });

  assert.equal(result.success, true, result.message);
  assert.equal(classroomState.source.name, '课堂 B');
  assert.deepEqual(calls, [
    ['get', '/api/classroom/discover?timeout=3.5'],
    ['/api/classroom/fetch-index', { base_url: 'http://teacher-a.local:5123', classroom_code: '' }],
    ['/api/classroom/fetch-index', { base_url: 'http://teacher-b.local:5123', classroom_code: '' }],
  ]);
});

test('student connection uses the supplied classroom code to select the matching classroom', async () => {
  const classroomState = { source: null, connected: false };
  const calls = [];
  const result = await connectStudentClassroomByCodeFlow('room-b', {}, {
    initialized: () => true,
    bindEvents() {},
    setInitialized() {},
    setLocalCourses() {},
    loadLocalCourses: () => [],
    loadClassroomConfig: async () => {},
    ensureTeacherModeReady: async () => {},
    classroomState,
    buildClassroomBaseUrl: (entry) => `http://${entry.host}:${entry.port}`,
    apiClient: {
      get: async (url) => {
        calls.push(['get', url]);
        return {
          success: true,
          classrooms: [
            { server_id: 'srv-1', name: '课堂 A', code: 'room-a', host: 'teacher-a.local', port: 5123 },
            { server_id: 'srv-2', name: '课堂 B', code: 'room-b', host: 'teacher-b.local', port: 5123 },
          ],
        };
      },
      post: async (url, payload) => {
        calls.push([url, payload]);
        return { success: true, index: { resources: [] } };
      },
    },
    requestManualClassroomAddress: async () => null,
    rememberClassroomSource() {},
    applyResourcesIndex() {},
    updateClassroomBanner() {},
    showListView() {},
    showDetailView() {},
    resourcesCache: () => [],
  });

  assert.equal(result.success, true, result.message);
  assert.equal(classroomState.source.name, '课堂 B');
  assert.deepEqual(calls, [
    ['get', '/api/classroom/discover?timeout=3.5&code=room-b'],
    ['/api/classroom/fetch-index', { base_url: 'http://teacher-b.local:5123', classroom_code: 'room-b' }],
  ]);
});

test('student connection falls back to package import when discovery validation fails', async () => {
  let manualPromptCalls = 0;
  const classroomState = { source: null, connected: false };
  const result = await connectStudentClassroomByCodeFlow('', {}, {
    initialized: () => true,
    bindEvents() {},
    setInitialized() {},
    setLocalCourses() {},
    loadLocalCourses: () => [],
    loadClassroomConfig: async () => {},
    ensureTeacherModeReady: async () => {},
    classroomState,
    buildClassroomBaseUrl: (entry) => entry?.base_url || '',
    apiClient: {
      get: async () => ({
        success: true,
        classrooms: [{ server_id: 'srv-1', name: '课堂 A', code: 'room-a', host: 'teacher-a.local', port: 5123 }],
      }),
      post: async () => ({ success: false, message: '课堂课程不可达' }),
    },
    requestManualClassroomAddress: async () => {
      manualPromptCalls += 1;
      return null;
    },
    updateClassroomBanner() {},
  });

  assert.equal(result.success, false);
  assert.equal(result.next_action, 'import-local-package');
  assert.equal(result.fallback.mode, 'package-import');
  assert.equal(classroomState.connected, false);
  assert.equal(classroomState.fallback.mode, 'package-import');
  assert.equal(manualPromptCalls, 0);
  assert.match(result.message, /课程包/);
});

test('student connection never initializes teacher mode', async () => {
  let teacherModeReadyCalls = 0;
  const classroomState = { source: null, connected: false };
  const result = await connectStudentClassroomByCodeFlow('', {}, {
    initialized: () => true,
    bindEvents() {},
    setInitialized() {},
    setLocalCourses() {},
    loadLocalCourses: () => [],
    loadClassroomConfig: async () => {
      throw new Error('student flow must not load teacher configuration');
    },
    ensureTeacherModeReady: async () => {
      teacherModeReadyCalls += 1;
      throw new Error('student flow must not initialize teacher mode');
    },
    classroomState,
    buildClassroomBaseUrl: (entry) => entry?.base_url || '',
    apiClient: {
      get: async () => ({ success: true, classrooms: [] }),
      post: async () => ({ success: false, message: '未发现课堂' }),
    },
    updateClassroomBanner() {},
  });

  assert.equal(result.success, false);
  assert.equal(teacherModeReadyCalls, 0);
  assert.equal(result.next_action, 'import-local-package');
});
