import assert from "node:assert/strict";
import test from "node:test";

import { buildCourseFromFormPayload } from "./course-create-utils.js";

test("buildCourseFromFormPayload keeps course structure and local identity", () => {
    const sections = [{ title: "第一课", experiments: [] }];
    const course = buildCourseFromFormPayload({
        formValues: {
            title: "课程 A",
            description: "课程说明",
            grade: "七年级",
            subject: "信息科技",
            tags: ["AI"],
            author: "教师",
            version: "1.0",
            courseId: "course-a",
            cover: "cover.png",
            localPath: "/tmp/course-a",
        },
        baseCourse: { sections },
        scannedCourse: null,
        normalizeOrigin: () => null,
    });

    assert.equal(course.id, "course-a");
    assert.equal(course.source, "local");
    assert.equal(course.local_path, "/tmp/course-a");
    assert.equal(course.cover, "cover.png");
    assert.deepEqual(course.sections, sections);
});
