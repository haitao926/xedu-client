import assert from "node:assert/strict";
import test from "node:test";

import * as courseInspectionActions from "./course-inspection-actions.js";

test("inspectCloudCourseOptionFlow loads and merges the selected cloud course structure", async () => {
  assert.equal(typeof courseInspectionActions.inspectCloudCourseOptionFlow, "function");

  const course = {
    id: "pose-course",
    title: "人体姿态控制行空板 K10",
    course_url: "courses/pose/course.json",
    sections: [],
  };
  const calls = [];
  const result = await courseInspectionActions.inspectCloudCourseOptionFlow(course, {
    apiClient: {
      post: async (url, payload) => {
        calls.push([url, payload]);
        return {
          success: true,
          course: {
            id: "pose-course",
            sections: [
              {
                title: "第一课",
                experiments: [
                  { title: "实验一", files: [{ path: "lesson/index.html" }] },
                ],
              },
            ],
          },
          summary: { section_count: 1, experiment_count: 1, file_count: 1 },
        };
      },
    },
    buildInspectCoursePayload: (selected) => ({
      course_id: selected.id,
      course_url: selected.course_url,
    }),
    mergeInspectionCourse: courseInspectionActions.mergeInspectionCourse,
  });

  assert.deepEqual(calls, [[
    "/api/resources/inspect-course",
    { course_id: "pose-course", course_url: "courses/pose/course.json" },
  ]]);
  assert.equal(result.course.sections.length, 1);
  assert.equal(result.course.sections[0].experiments[0].files.length, 1);
  assert.deepEqual(result.summary, { section_count: 1, experiment_count: 1, file_count: 1 });
  assert.equal(result.inspection, undefined);
});
