import assert from "node:assert/strict";
import test from "node:test";

import { loadResourcesIndexFlow } from "./resource-index-flow.js";

function makeDeps(overrides = {}) {
  let localCourses = overrides.initialLocalCourses || [];
  return {
    documentRef: { getElementById: () => null },
    loadLocalCourses: () => localCourses,
    setLocalCourses: (value) => { localCourses = value; },
    localCourses: () => localCourses,
    clearDemoCourseBindingIfNeeded: async (courses) => courses,
    refreshLocalCoursesFromDisk: async (courses) => courses,
    persistLocalCoursesState: () => {},
    scheduleClassroomSync: () => {},
    classroomState: {},
    buildClassroomBaseUrl: () => "",
    apiClient: {
      get: async () => ({ success: false }),
      post: async () => ({ success: false }),
    },
    applyResourcesIndex: () => {},
    mockResourcesIndex: { resources: [] },
    updateClassroomBanner: () => {},
    ...overrides,
  };
}

test("loadResourcesIndexFlow refreshes cached local courses from disk before rendering", async () => {
  const cachedCourse = {
    id: "zhangjiang-image-recognition",
    title: "旧缓存课程",
    source: "local",
    local_path: "/tmp/course",
    sections: [
      { experiments: [{ files: [{ path: "lesson1/exp1/index.html", type: "html" }] }] },
    ],
  };
  const scannedCourse = {
    id: "zhangjiang-image-recognition",
    title: "AI看张江：手绘建筑识别师",
    sections: [
      {
        experiments: [
          {
            files: [
              { path: "lesson1/exp1/index.html", type: "html" },
              { path: "lesson1/exp1/blockly/pixel_image_classification_test.blockly.xml", type: "blockly" },
            ],
          },
        ],
      },
    ],
  };

  let persisted = false;
  const deps = makeDeps({
    initialLocalCourses: [cachedCourse],
    refreshLocalCoursesFromDisk: async (courses) => courses.map((course) => ({
      ...course,
      ...scannedCourse,
      source: "local",
      local_path: course.local_path,
    })),
    persistLocalCoursesState: () => { persisted = true; },
  });

  await loadResourcesIndexFlow(deps);

  const [course] = deps.localCourses();
  assert.equal(course.title, "AI看张江：手绘建筑识别师");
  assert.equal(course.sections[0].experiments[0].files[1].type, "blockly");
  assert.equal(course.local_path, "/tmp/course");
  assert.equal(persisted, true);
});

test("loadResourcesIndexFlow falls back to the configured resource index when a stale classroom fails", async () => {
  const classroomState = {
    connected: true,
    source: { base_url: "http://127.0.0.1:5999" },
  };
  const requests = [];
  let appliedOptions = null;
  const deps = makeDeps({
    classroomState,
    apiClient: {
      post: async (path) => {
        requests.push(path);
        throw new Error("课堂未开启");
      },
      get: async (path) => {
        requests.push(path);
        return { success: true, index: { resources: [{ id: "remote-course" }] } };
      },
    },
    applyResourcesIndex: (_index, options) => {
      appliedOptions = options;
    },
  });

  await loadResourcesIndexFlow(deps);

  assert.deepEqual(requests, ["/api/classroom/fetch-index", "/api/resources/index"]);
  assert.equal(classroomState.connected, false);
  assert.equal(classroomState.source, null);
  assert.equal(appliedOptions.remoteSource, "remote");
  assert.equal(appliedOptions.isMock, false);
});

test("loadResourcesIndexFlow always hides loading when local course loading fails", async () => {
  const loading = { style: { display: "none" } };
  let appliedMock = false;
  let bannerUpdated = false;
  const deps = makeDeps({
    documentRef: {
      getElementById: (id) => (id === "resources-loading" ? loading : null),
    },
    loadLocalCourses: () => {
      throw new Error("broken-local-storage");
    },
    applyResourcesIndex: (index, options) => {
      appliedMock = index.resources.length === 0 && options.isMock === true;
    },
    updateClassroomBanner: () => {
      bannerUpdated = true;
    },
  });

  await loadResourcesIndexFlow(deps);

  assert.equal(loading.style.display, "none");
  assert.equal(appliedMock, true);
  assert.equal(bannerUpdated, true);
});

test("loadResourcesIndexFlow continues with cached courses when disk refresh times out", async () => {
  const cachedCourse = {
    id: "cached-course",
    title: "缓存课程",
    source: "local",
    local_path: "/tmp/stuck-course",
  };
  let appliedCourses = [];
  const deps = makeDeps({
    initialLocalCourses: [cachedCourse],
    localRefreshTimeoutMs: 5,
    refreshLocalCoursesFromDisk: () => new Promise(() => {}),
    applyResourcesIndex: () => {
      appliedCourses = deps.localCourses();
    },
  });

  await loadResourcesIndexFlow(deps);

  assert.equal(appliedCourses.length, 1);
  assert.equal(appliedCourses[0].id, "cached-course");
});

test("loadResourcesIndexFlow continues when local migration times out", async () => {
  const cachedCourse = {
    id: "migration-timeout-course",
    title: "迁移超时课程",
    source: "local",
    local_path: "/tmp/migration-timeout-course",
  };
  let appliedCourses = [];
  const deps = makeDeps({
    initialLocalCourses: [cachedCourse],
    localMigrationTimeoutMs: 5,
    clearDemoCourseBindingIfNeeded: () => new Promise(() => {}),
    applyResourcesIndex: () => {
      appliedCourses = deps.localCourses();
    },
  });

  await loadResourcesIndexFlow(deps);

  assert.equal(appliedCourses.length, 1);
  assert.equal(appliedCourses[0].id, "migration-timeout-course");
});

test("loadResourcesIndexFlow watchdog hides loading when remote index never returns", async () => {
  const loading = { style: { display: "none" } };
  let appliedMock = false;
  let bannerUpdates = 0;
  const deps = makeDeps({
    loadingWatchdogMs: 5,
    documentRef: {
      getElementById: (id) => (id === "resources-loading" ? loading : null),
    },
    apiClient: {
      get: () => new Promise(() => {}),
      post: async () => ({ success: false }),
    },
    applyResourcesIndex: (index, options) => {
      appliedMock = index.resources.length === 0 && options.isMock === true;
    },
    updateClassroomBanner: () => {
      bannerUpdates += 1;
    },
  });

  loadResourcesIndexFlow(deps);
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(loading.style.display, "none");
  assert.equal(appliedMock, true);
  assert.equal(bannerUpdates, 1);
});
