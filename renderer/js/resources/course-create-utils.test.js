import assert from "node:assert/strict";
import test from "node:test";

import { buildCourseFromFormPayload } from "./course-create-utils.js";
import { normalizeCourseQuickFormDefaults } from "./quickform-utils.js";

test("buildCourseFromFormPayload preserves existing quickform defaults when config inputs are absent", () => {
    const course = buildCourseFromFormPayload({
        formValues: {
            title: "课程 A",
            description: "",
            grade: "",
            subject: "",
            tags: [],
            author: "",
            version: "1.0",
            courseId: "course-a",
            cover: "",
            localPath: "/tmp/course-a",
        },
        baseCourse: {
            quickform_defaults: {
                enabled: true,
                html_path: "lesson1/index.html",
            },
            sections: [],
        },
        scannedCourse: null,
        normalizeOrigin: (origin) => origin,
        normalizeCourseQuickFormDefaults,
    });

    assert.deepEqual(course.quickform_defaults, {
        enabled: true,
        html_path: "lesson1/index.html",
    });
});

test("buildCourseFromFormPayload applies explicit quickform defaults when config inputs are present", () => {
    const course = buildCourseFromFormPayload({
        formValues: {
            title: "课程 B",
            description: "",
            grade: "",
            subject: "",
            tags: [],
            author: "",
            version: "1.0",
            courseId: "course-b",
            cover: "",
            localPath: "/tmp/course-b",
            quickFormEnabled: false,
            quickFormHtmlPath: "",
        },
        baseCourse: {
            quickform_defaults: {
                enabled: true,
                html_path: "lesson1/index.html",
            },
            sections: [],
        },
        scannedCourse: null,
        normalizeOrigin: (origin) => origin,
        normalizeCourseQuickFormDefaults,
    });

    assert.deepEqual(course.quickform_defaults, {
        enabled: false,
        html_path: "",
    });
});
