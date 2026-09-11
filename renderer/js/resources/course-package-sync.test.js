import assert from "node:assert/strict";
import test from "node:test";

import { ensureLocalTaskCourse } from "./course-package-sync.js";

const task = {
  course_id: "course-1",
  course_version: "2026.09.09-1",
  package_url: "https://learn.example/packages/course-1.zip",
  package_sha256: "a".repeat(64),
  package_size: 3,
};

test("matching local course version is reused without downloading", async () => {
  let downloads = 0;
  const localCourse = {
    id: "course-1",
    version: "2026.09.09-1",
    local_path: "/courses/course-1",
  };

  const result = await ensureLocalTaskCourse(task, {
    localCourses: [localCourse],
    electronAPI: {
      downloadXEduCoursePackage: async () => {
        downloads += 1;
      },
    },
    apiClient: {},
  });

  assert.equal(result, localCourse);
  assert.equal(downloads, 0);
});

test("outdated course downloads, imports, refreshes, and cleans up", async () => {
  const calls = [];
  const result = await ensureLocalTaskCourse(task, {
    localCourses: [{ id: "course-1", version: "old", local_path: "/courses/course-1" }],
    coursesRoot: "/courses",
    electronAPI: {
      downloadXEduCoursePackage: async (context) => {
        calls.push(["download", context.course_id]);
        return {
          success: true,
          package_path: "/tmp/course.zip",
          cleanup_token: "cleanup-1",
        };
      },
      cleanupXEduCoursePackage: async (token) => calls.push(["cleanup", token]),
    },
    apiClient: {
      post: async (url, payload) => {
        calls.push([url, payload]);
        return {
          success: true,
          course: {
            id: "course-1",
            version: "2026.09.09-1",
            local_path: "/courses/course-1",
          },
        };
      },
    },
    refreshResources: async () => calls.push(["refresh"]),
  });

  assert.equal(result.version, "2026.09.09-1");
  assert.deepEqual(calls.map(([name]) => name), [
    "download",
    "/api/resources/import-package-local",
    "refresh",
    "cleanup",
  ]);
  assert.equal(calls[1][1].expected_course_id, "course-1");
  assert.equal(calls[1][1].expected_course_version, "2026.09.09-1");
  assert.equal(calls[1][1].target_path, "/courses/course-1");
});

test("missing local course is downloaded into the configured courses root", async () => {
  let importPayload = null;
  const result = await ensureLocalTaskCourse(task, {
    localCourses: [],
    coursesRoot: "/courses",
    electronAPI: {
      downloadXEduCoursePackage: async () => ({
        success: true,
        package_path: "/tmp/course.zip",
        cleanup_token: "cleanup-missing-1",
      }),
      cleanupXEduCoursePackage: async () => {},
    },
    apiClient: {
      post: async (_url, payload) => {
        importPayload = payload;
        return { success: true, course: { id: "course-1", version: task.course_version } };
      },
    },
  });

  assert.equal(result.id, "course-1");
  assert.equal(importPayload.target_path, "/courses/course-1");
});

test("download failure rejects without changing the existing local course", async () => {
  const existing = {
    id: "course-1",
    version: "old",
    local_path: "/courses/course-1",
  };

  await assert.rejects(
    ensureLocalTaskCourse(task, {
      localCourses: [existing],
      coursesRoot: "/courses",
      electronAPI: {
        downloadXEduCoursePackage: async () => ({ success: false, error: "下载失败" }),
      },
      apiClient: {},
    }),
    /下载失败/,
  );
  assert.deepEqual(existing, {
    id: "course-1",
    version: "old",
    local_path: "/courses/course-1",
  });
});
