import assert from "node:assert/strict";
import test from "node:test";

import { applyResourcesIndexFlow, deleteCourseFlow } from "./course-actions.js";

test("classroom index exposes only the teacher's active course", () => {
  let resourcesCache = [];
  const deps = {
    setResourcesMeta() {},
    setSubmitUrl() {},
    setRepoUrl() {},
    setRawBaseUrl() {},
    setIndexBranch() {},
    setRemoteSources() {},
    setIsMockData() {},
    setRemoteSource() {},
    localCourses: [
      { id: "student-local-a", title: "学生本地课程 A" },
      { id: "student-local-b", title: "学生本地课程 B" },
    ],
    setResourcesCache: (value) => { resourcesCache = value; },
    buildFilterOptions() {},
    updateSourceInfo() {},
    applyFilters() {},
  };

  applyResourcesIndexFlow({
    resources: [{ id: "teacher-active", title: "教师当前课程" }],
  }, { remoteSource: "classroom" }, deps);

  assert.deepEqual(resourcesCache.map((course) => course.id), ["teacher-active"]);
  assert.equal(resourcesCache[0].source, "classroom");
});

test("deleteCourseFlow removes only the local record and invokes a supplied notifier", async () => {
  const localCourses = [
    { id: "delete-me", source: "local", title: "待删除课程" },
    { id: "keep-me", source: "local", title: "保留课程" },
  ];
  const calls = [];

  await deleteCourseFlow(localCourses[0], {
    openResourcesConfirm: async () => true,
    localCourses,
    setLocalCourses: (value) => calls.push(["set", value.map((course) => course.id)]),
    persistLocalCoursesState: () => calls.push(["persist"]),
    buildFilterOptions: () => calls.push(["filters"]),
    applyFilters: () => calls.push(["apply"]),
    showListView: () => calls.push(["list"]),
    alertUser: (message) => calls.push(["notify", message]),
  });

  assert.deepEqual(calls, [
    ["set", ["keep-me"]],
    ["persist"],
    ["filters"],
    ["apply"],
    ["list"],
    ["notify", "课程已删除。"],
  ]);
});
