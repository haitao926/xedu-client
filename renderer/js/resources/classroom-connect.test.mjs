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
    ['get', '/api/classroom/discover?timeout=1.5'],
    ['post', '/api/classroom/fetch-index', { base_url: 'http://teacher.local:5123' }],
    ['remember', 'http://teacher.local:5123'],
  ]);
});

test('student connection uses the supplied classroom code to select a discovered classroom', async () => {
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
      get: async () => ({
        success: true,
        classrooms: [
          { name: '课堂 A', code: 'room-a', host: 'teacher-a.local', port: 5123 },
          { name: '课堂 B', code: 'room-b', host: 'teacher-b.local', port: 5123 },
        ],
      }),
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
    ['/api/classroom/fetch-index', { base_url: 'http://teacher-b.local:5123' }],
  ]);
});
