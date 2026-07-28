import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyDroppedCourseSource,
  importDroppedCourseSourceFlow,
} from "./course-storage.js";

test("classifyDroppedCourseSource distinguishes zip, folder, and invalid drops", () => {
  assert.deepEqual(classifyDroppedCourseSource("/tmp/course.zip"), {
    kind: "zip",
    path: "/tmp/course.zip",
  });
  assert.deepEqual(classifyDroppedCourseSource("/tmp/course-folder", { isDirectory: true }), {
    kind: "folder",
    path: "/tmp/course-folder",
  });
  assert.equal(classifyDroppedCourseSource("/tmp/course.txt").kind, "invalid");
});

test("importDroppedCourseSourceFlow imports a folder, refreshes the index, and reports duplicates", async () => {
  const events = [];
  const result = await importDroppedCourseSourceFlow(
    { path: "/tmp/course-folder", isDirectory: true },
    {
      apiClient: {
        post: async (endpoint, payload) => {
          events.push(["post", endpoint, payload]);
          return {
            success: true,
            course: {
              id: "course-a",
              title: "课程 A",
              version: "1.0",
              sections: [],
            },
            summary: { section_count: 0 },
          };
        },
      },
      addCourse: (course) => {
        events.push(["addCourse", course.id, course.local_path]);
        return true;
      },
      loadResourcesIndex: async () => {
        events.push(["refresh"]);
      },
      showListView: () => {
        events.push(["list"]);
      },
      showDetailView: (course) => {
        events.push(["detail", course.id]);
      },
      setImportStatus: (state, message) => {
        events.push(["status", state, message]);
      },
    },
  );

  assert.equal(result.duplicated, true);
  assert.equal(result.message, "课程《课程 A》已存在，已按最新拖入内容刷新。");
  assert.deepEqual(events, [
    ["status", "writing", "正在读取课程文件夹..."],
    ["post", "/api/resources/inspect-course", { local_path: "/tmp/course-folder" }],
    ["post", "/api/resources/scan", {
      local_path: "/tmp/course-folder",
      init_if_missing: false,
      auto_build: false,
    }],
    ["addCourse", "course-a", "/tmp/course-folder"],
    ["refresh"],
    ["list"],
    ["detail", "course-a"],
    ["status", "success", "课程《课程 A》已存在，已按最新拖入内容刷新。"],
  ]);
});

test("importDroppedCourseSourceFlow rejects folders without course.json", async () => {
  const states = [];
  await assert.rejects(
    importDroppedCourseSourceFlow(
      { path: "/tmp/missing-course-json", isDirectory: true },
      {
        apiClient: {
          post: async () => ({ success: false, message: "未找到 course.json" }),
        },
        setImportStatus: (state, message) => {
          states.push([state, message]);
        },
      },
    ),
    /未找到 course\.json/,
  );

  assert.deepEqual(states, [
    ["writing", "正在读取课程文件夹..."],
    ["error", "未找到 course.json"],
  ]);
});

test("importDroppedCourseSourceFlow imports a ZIP package and refreshes the index", async () => {
  const events = [];
  const result = await importDroppedCourseSourceFlow(
    { path: "/tmp/course.zip", isDirectory: false },
    {
      importZipCoursePackage: async (packagePath) => {
        events.push(["zip", packagePath]);
        return {
          success: true,
          local_path: "/Users/apple/Documents/XeduCourses/course-a",
          course: {
            id: "course-a",
            title: "课程 A",
            version: "1.0",
            sections: [],
          },
          summary: { section_count: 0 },
        };
      },
      addCourse: (course) => {
        events.push(["addCourse", course.id, course.local_path]);
        return false;
      },
      loadResourcesIndex: async () => {
        events.push(["refresh"]);
      },
      showListView: () => {
        events.push(["list"]);
      },
      showDetailView: (course) => {
        events.push(["detail", course.id]);
      },
      setImportStatus: (state, message) => {
        events.push(["status", state, message]);
      },
    },
  );

  assert.equal(result.duplicated, false);
  assert.equal(result.course.local_path, "/Users/apple/Documents/XeduCourses/course-a");
  assert.deepEqual(events, [
    ["status", "writing", "正在导入课程包..."],
    ["zip", "/tmp/course.zip"],
    ["addCourse", "course-a", "/Users/apple/Documents/XeduCourses/course-a"],
    ["refresh"],
    ["list"],
    ["detail", "course-a"],
    ["status", "success", "课程《课程 A》已导入。"],
  ]);
});
