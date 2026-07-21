import assert from "node:assert/strict";
import test from "node:test";

import { importRemoteCourseFlow } from "./course-sync.js";

const resource = {
  id: "course-a",
  source: "remote",
  course_url: "courses/course-a/course.json",
  package_url: "courses/course-a/course.zip",
};

test("importRemoteCourseFlow stops when the directory picker is cancelled", async () => {
  const calls = [];
  const result = await importRemoteCourseFlow(resource, {}, {
    electronAPI: { selectFolder: async () => "" },
    apiClient: { post: async () => calls.push("post") },
    buildSourceOverrideFromCourseMeta: () => null,
    normalizeOrigin: () => null,
    withCourseSyncFingerprint: (course) => course,
    addCourse: () => {},
    extractApiErrorMessage: (error) => error.message,
    alertUser: (message) => calls.push(["alert", message]),
    setImportStatus: (state, message) => calls.push(["status", state, message]),
  });

  assert.equal(result, null);
  assert.deepEqual(calls, [
    ["status", "selecting", "正在选择目录..."],
    ["status", "cancelled", "已取消导入"],
    ["alert", "已取消导入。"],
  ]);
});

test("importRemoteCourseFlow reports download and write phases and restores success state", async () => {
  const statuses = [];
  const added = [];
  const result = await importRemoteCourseFlow(resource, {}, {
    electronAPI: { selectFolder: async () => "/tmp/imports" },
    apiClient: {
      post: async (endpoint, payload) => {
        assert.equal(endpoint, "/api/resources/pull");
        assert.equal(payload.target_path, "/tmp/imports/course-a");
        return {
          success: true,
          local_path: "/tmp/imports/course-a",
          resource_handle: "handle-a",
          course: { id: "course-a", title: "课程 A" },
        };
      },
    },
    buildSourceOverrideFromCourseMeta: () => null,
    normalizeOrigin: () => null,
    withCourseSyncFingerprint: (course) => course,
    addCourse: (course) => { added.push(course); return false; },
    extractApiErrorMessage: (error) => error.message,
    alertUser: () => {},
    setImportStatus: (state, message) => statuses.push([state, message]),
  });

  assert.equal(result.resource_handle, "handle-a");
  assert.deepEqual(statuses, [
    ["selecting", "正在选择目录..."],
    ["downloading", "正在下载课程..."],
    ["writing", "正在写入本地课程..."],
    ["success", "课程已导入到本地"],
  ]);
  assert.equal(added[0].local_path, "/tmp/imports/course-a");
});

test("importRemoteCourseFlow polls an async transfer and forwards progress", async () => {
  const statuses = [];
  const added = [];
  const operationStates = [
    {
      state: "running",
      phase: "downloading",
      percent: 32,
      completed_files: 4,
      total_files: 10,
      message: "正在下载 lesson/demo.wasm",
    },
    {
      state: "success",
      phase: "completed",
      percent: 100,
      result: {
        success: true,
        local_path: "/tmp/imports/course-a",
        resource_handle: "handle-a",
        course: { id: "course-a", title: "课程 A" },
      },
    },
  ];
  let getCalls = 0;

  const result = await importRemoteCourseFlow(resource, {}, {
    electronAPI: { selectFolder: async () => "/tmp/imports" },
    apiClient: {
      post: async (_endpoint, payload) => {
        assert.equal(payload.async, true);
        return { success: true, operation_id: "operation-a" };
      },
      get: async (endpoint) => {
        assert.equal(endpoint, "/api/resources/operations/operation-a");
        return { success: true, operation: operationStates[getCalls++] };
      },
    },
    buildSourceOverrideFromCourseMeta: () => null,
    normalizeOrigin: () => null,
    withCourseSyncFingerprint: (course) => course,
    addCourse: (course) => { added.push(course); return false; },
    extractApiErrorMessage: (error) => error.message,
    alertUser: () => {},
    pollIntervalMs: 0,
    setImportStatus: (state, message, progress) => statuses.push([state, message, progress]),
  });

  assert.equal(result.resource_handle, "handle-a");
  assert.equal(added[0].local_path, "/tmp/imports/course-a");
  assert.ok(statuses.some(([state, _message, progress]) => state === "downloading" && progress.percent === 32));
});
