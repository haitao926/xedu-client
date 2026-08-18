import assert from "node:assert/strict";
import test from "node:test";

import {
  importCloudCourseAndSaveFlow,
  importLocalPackageToPathFlow,
  fetchCloudCourseFlow,
  pickLocalCourseFlow,
  pickLocalPackageFlow,
} from "./course-create-flow.js";
import { getPathForFileWithDesktopBridge } from "./desktop-bridge.js";

function createDocumentRef(initialValues = {}) {
  const store = new Map(
    Object.entries(initialValues).map(([id, value]) => [id, { value }]),
  );
  return {
    getElementById(id) {
      return store.get(id) || null;
    },
  };
}

test("getPathForFileWithDesktopBridge resolves a dropped file through preload", async () => {
  const file = { name: "course.zip" };
  const path = await getPathForFileWithDesktopBridge(file, {
    getPathForFile(receivedFile) {
      assert.equal(receivedFile, file);
      return "/tmp/course.zip";
    },
  });

  assert.equal(path, "/tmp/course.zip");
});

test("pickLocalPackageFlow accepts the preload course package bridge without invoke", async () => {
  const documentRef = createDocumentRef({
    "resources-create-package-path": "",
  });
  let rendered = 0;
  let updated = 0;
  let alertMessage = "";

  await pickLocalPackageFlow({
    electronAPI: {
      selectCoursePackage: async () => "/Users/apple/Desktop/demo-course.zip",
    },
    documentRef,
    renderPackagePathSummary: () => { rendered += 1; },
    updateCreateFormState: () => { updated += 1; },
    alertUser: (message) => { alertMessage = message; },
  });

  assert.equal(documentRef.getElementById("resources-create-package-path")?.value, "/Users/apple/Desktop/demo-course.zip");
  assert.equal(rendered, 1);
  assert.equal(updated, 1);
  assert.equal(alertMessage, "");
});

test("pickLocalCourseFlow accepts the preload folder bridge and seeds default sections", async () => {
  const documentRef = createDocumentRef({
    "resources-create-local-path": "",
  });
  const calls = [];
  let scannedCourse = null;
  let scanSummary = null;
  let scanError = null;
  let seededSections = null;
  let updated = 0;

  await pickLocalCourseFlow({
    electronAPI: {
      selectFolder: async () => "/Users/apple/Desktop/course-a",
    },
    documentRef,
    renderLocalPathSummary: () => {},
    createEntryMode: "new",
    getCreateMetaFromForm: () => ({ title: "" }),
    deriveTitleFromPath: () => "课程 A",
    apiClient: {
      post: async (url, payload) => {
        calls.push([url, payload]);
        return {
          success: true,
          course: {
            id: "course-a",
            title: "课程 A",
            sections: [],
          },
          summary: { section_count: 0 },
        };
      },
    },
    setScannedCourse: (value) => { scannedCourse = value; },
    setScanSummary: (value) => { scanSummary = value; },
    setScanError: (value) => { scanError = value; },
    draftSections: () => [],
    setDraftSections: (value) => { seededSections = value; },
    buildDefaultSections: () => [{ title: "默认章节", experiments: [] }],
    fillCreateFormFromCourse: () => {},
    renderSectionEditor: () => {},
    renderMaterialList: () => {},
    renderScanStatus: () => {},
    renderStructurePreview: () => {},
    renderCoursePreview: () => {},
    updateCreateFormState: () => { updated += 1; },
    alertUser: (message) => {
      throw new Error(`unexpected alert: ${message}`);
    },
  });

  assert.deepEqual(calls, [[
    "/api/resources/scan",
    {
      local_path: "/Users/apple/Desktop/course-a",
      init_if_missing: true,
      auto_build: false,
      meta: { title: "课程 A" },
    },
  ]]);
  assert.equal(documentRef.getElementById("resources-create-local-path")?.value, "/Users/apple/Desktop/course-a");
  assert.equal(scannedCourse?.id, "course-a");
  assert.deepEqual(scanSummary, { section_count: 0 });
  assert.equal(scanError, "");
  assert.deepEqual(seededSections, [{ title: "默认章节", experiments: [] }]);
  assert.equal(updated, 1);
});

test("importLocalPackageToPathFlow reports progress and failure without leaving the button busy", async () => {
  const documentRef = createDocumentRef({
    "resources-create-package-path": "/tmp/course.zip",
    "resources-create-local-path": "/tmp/courses",
  });
  const statuses = [];

  const result = await importLocalPackageToPathFlow({
    documentRef,
    apiClient: { post: async () => ({ success: false, message: "课程包损坏" }) },
    setScanError: () => {},
    updateCreateFormState: () => {},
    alertUser: (message) => statuses.push(["alert", message]),
    setImportStatus: (status) => statuses.push(["status", status]),
  });

  assert.equal(result, false);
  assert.deepEqual(statuses, [
    ["status", "writing"],
    ["status", "error"],
    ["alert", "课程包损坏"],
  ]);
});

test("importLocalPackageToPathFlow polls an async ZIP import and adds the course", async () => {
  const documentRef = createDocumentRef({
    "resources-create-package-path": "/tmp/course.zip",
    "resources-create-local-path": "",
  });
  const statuses = [];
  const added = [];
  let getCalls = 0;

  const result = await importLocalPackageToPathFlow({
    documentRef,
    apiClient: {
      post: async (_endpoint, payload) => {
        assert.equal(payload.async, true);
        assert.equal(payload.target_path, "");
        return { success: true, operation_id: "operation-zip" };
      },
      get: async (endpoint) => {
        assert.equal(endpoint, "/api/resources/operations/operation-zip");
        getCalls += 1;
        return getCalls === 1
          ? {
              success: true,
              operation: {
                state: "running",
                phase: "extracting",
                percent: 61,
                message: "正在解压",
              },
            }
          : {
              success: true,
              operation: {
                state: "success",
                phase: "completed",
                percent: 100,
                result: {
                  success: true,
                  local_path: "/Users/apple/Documents/XeduCourses/course-a",
                  course: { id: "course-a", title: "课程 A", sections: [] },
                },
              },
            };
      },
    },
    setScannedCourse: () => {},
    setScanSummary: () => {},
    setScanError: () => {},
    setDraftSections: () => {},
    fillCreateFormFromCourse: () => {},
    renderSectionEditor: () => {},
    renderMaterialList: () => {},
    renderScanStatus: () => {},
    renderStructurePreview: () => {},
    renderCoursePreview: () => {},
    renderLocalPathSummary: () => {},
    updateCreateFormState: () => {},
    addCourse: (course) => { added.push(course); return false; },
    alertUser: (message) => { throw new Error(`unexpected alert: ${message}`); },
    pollIntervalMs: 0,
    setImportStatus: (state, message, progress) => statuses.push([state, message, progress]),
  });

  assert.equal(result, true);
  assert.equal(added[0].id, "course-a");
  assert.equal(added[0].local_path, "/Users/apple/Documents/XeduCourses/course-a");
  assert.ok(statuses.some(([state, _message, progress]) => state === "downloading" && progress.percent === 61));
});

test("importCloudCourseAndSaveFlow reports save and success states", async () => {
  const statuses = [];
  let saves = 0;
  const result = await importCloudCourseAndSaveFlow(
    async () => true,
    async () => { saves += 1; return true; },
    (state, message) => statuses.push([state, message]),
  );

  assert.equal(result, true);
  assert.equal(saves, 1);
  assert.deepEqual(statuses, [
    ["writing", "正在保存课程信息..."],
    ["success", "云端课程已导入"],
  ]);
});

test("fetchCloudCourseFlow polls an async remote pull and forwards progress", async () => {
  const documentRef = createDocumentRef({
    "resources-cloud-course-select": "course-a",
    "resources-create-local-path": "",
    "resources-create-id": "",
    "resources-create-version": "",
    "resources-create-title": "",
    "resources-create-desc": "",
    "resources-create-grade": "",
    "resources-create-subject": "",
    "resources-create-author": "",
    "resources-create-tags": "",
    "resources-create-cover": "",
  });
  const statuses = [];
  let getCalls = 0;

  const result = await fetchCloudCourseFlow({
    documentRef,
    cloudCourseOptions: [{
      id: "course-a",
      title: "课程 A",
      course_url: "courses/course-a/course.json",
      package_url: "",
      single_course_repo: true,
    }],
    renderLocalPathSummary: () => {},
    normalizeOrigin: (value) => value,
    buildSourceOverrideFromCourseMeta: () => ({
      source_id: "source-a",
      base_url: "https://gitea.example.com",
      repo: "owner/course-a",
      branch: "main",
      single_course_repo: true,
    }),
    apiClient: {
      post: async (_endpoint, payload) => {
        assert.equal(payload.async, true);
        return { success: true, operation_id: "operation-cloud" };
      },
      get: async (endpoint) => {
        assert.equal(endpoint, "/api/resources/operations/operation-cloud");
        getCalls += 1;
        return getCalls === 1
          ? {
              success: true,
              operation: {
                state: "running",
                phase: "downloading",
                percent: 37,
                current_file: "lesson/index.html",
                message: "正在下载",
              },
            }
          : {
              success: true,
              operation: {
                state: "success",
                phase: "completed",
                percent: 100,
                result: {
                  success: true,
                  local_path: "/Users/apple/Documents/XeduCourses/course-a",
                  course: { id: "course-a", title: "课程 A", sections: [] },
                  origin: { source_id: "source-a" },
                },
              },
            };
      },
    },
    setScannedCourse: () => {},
    setScanSummary: () => {},
    setScanError: () => {},
    setDraftSections: () => {},
    setCloudImported: () => {},
    updateCreateCoverPreview: () => {},
    renderSectionEditor: () => {},
    renderMaterialList: () => {},
    renderScanStatus: () => {},
    renderStructurePreview: () => {},
    renderCoursePreview: () => {},
    updateCreateFormState: () => {},
    alertUser: (message) => { throw new Error(`unexpected alert: ${message}`); },
    pollIntervalMs: 0,
    setImportStatus: (state, message, progress) => statuses.push([state, message, progress]),
  });

  assert.equal(result, true);
  assert.ok(statuses.some(([state, _message, progress]) => state === "downloading" && progress.percent === 37));
});

test("importCloudCourseAndSaveFlow stops after a failed download", async () => {
  let saves = 0;
  const result = await importCloudCourseAndSaveFlow(
    async () => false,
    async () => { saves += 1; return true; },
  );

  assert.equal(result, false);
  assert.equal(saves, 0);
});
