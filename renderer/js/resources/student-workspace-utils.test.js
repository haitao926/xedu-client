import assert from "node:assert/strict";
import test from "node:test";

import {
  getStudentVisibleLessonContexts,
  getStudentWorkspaceEmptyText,
  getStudentWorkspaceFilesForOverview,
  getStudentWorkspaceTargetPage,
  getStudentWorkspaceTabTitle,
  normalizeStudentWorkspaceTabId,
  pickFirstExperimentWithFiles,
  shouldHideJupyterForStudentTab,
} from "./student-workspace-utils.js";

test("student workspace exposes the five classroom-facing entry semantics", () => {
  assert.equal(getStudentWorkspaceTabTitle("route", true), "课程任务中心");
  assert.equal(getStudentWorkspaceTabTitle("experience", true), "互动体验");
  assert.equal(getStudentWorkspaceTabTitle("visual", true), "图形编程");
  assert.equal(getStudentWorkspaceTabTitle("python", true), "Python实验");
  assert.equal(normalizeStudentWorkspaceTabId("unknown"), "route");
});

test("student mode only exposes the current lesson while teacher mode can see all lessons", () => {
  const sections = [
    { title: "第1课", experiments: [] },
    { title: "第2课", experiments: [] },
  ];

  assert.deepEqual(getStudentVisibleLessonContexts(sections, 1, true), [
    { section: sections[1], sectionIndex: 1 },
  ]);
  assert.deepEqual(getStudentVisibleLessonContexts(sections, 8, true), [
    { section: sections[0], sectionIndex: 0 },
  ]);
  assert.deepEqual(getStudentVisibleLessonContexts(sections, 0, false), [
    { section: sections[0], sectionIndex: 0 },
    { section: sections[1], sectionIndex: 1 },
  ]);
});

test("visual and python tabs open their native workbenches by default", () => {
  assert.equal(getStudentWorkspaceTargetPage("route"), "resources");
  assert.equal(getStudentWorkspaceTargetPage("experience"), "resources");
  assert.equal(getStudentWorkspaceTargetPage("visual"), "scratch");
  assert.equal(getStudentWorkspaceTargetPage("python"), "jupyter");

  assert.equal(shouldHideJupyterForStudentTab("route"), true);
  assert.equal(shouldHideJupyterForStudentTab("experience"), true);
  assert.equal(shouldHideJupyterForStudentTab("visual"), true);
  assert.equal(shouldHideJupyterForStudentTab("python"), false);
});

test("resource filtering maps each student entry to the correct experiment resource shape", () => {
  const overview = {
    allFiles: [{ path: "lesson/readme.md" }],
    htmlFiles: [{ path: "lesson/index.html" }],
    scratchFiles: [{ path: "lesson/main.sb3" }],
    blocklyFiles: [{ path: "lesson/main.blockly.json" }],
    pythonWorkspaceFiles: [
      { path: "lesson/main.ipynb" },
      { path: "lesson/helper.py" },
      { path: "lesson/data/sample.csv" },
    ],
  };

  assert.deepEqual(getStudentWorkspaceFilesForOverview(overview, "experience"), overview.htmlFiles);
  assert.deepEqual(getStudentWorkspaceFilesForOverview(overview, "visual"), [
    ...overview.scratchFiles,
    ...overview.blocklyFiles,
  ]);
  assert.deepEqual(getStudentWorkspaceFilesForOverview(overview, "python"), overview.pythonWorkspaceFiles);
  assert.deepEqual(getStudentWorkspaceFilesForOverview(overview, "route"), overview.allFiles);
});

test("python workspace picks first current-lesson notebook or reports a clear empty state", () => {
  const sections = [
    {
      title: "第1课",
      experiments: [
        { title: "体验", kind: "html" },
        { title: "代码", kind: "python" },
      ],
    },
    {
      title: "第2课",
      experiments: [
        { title: "另一个代码", kind: "python" },
      ],
    },
  ];
  const getOverview = (exp) => {
    if (exp.kind === "python") {
      return { pythonWorkspaceFiles: [{ path: `${exp.title}.ipynb` }] };
    }
    return { htmlFiles: [{ path: "index.html" }], pythonWorkspaceFiles: [] };
  };

  const target = pickFirstExperimentWithFiles({
    sections,
    sectionIndex: 0,
    tabId: "python",
    getOverview,
  });
  assert.equal(target.section.title, "第1课");
  assert.equal(target.exp.title, "代码");
  assert.equal(target.file.path, "代码.ipynb");

  const empty = pickFirstExperimentWithFiles({
    sections: [{ title: "第3课", experiments: [{ title: "无代码", kind: "html" }] }],
    sectionIndex: 0,
    tabId: "python",
    getOverview,
  });
  assert.equal(empty.file, null);
  assert.equal(empty.exp.title, "无代码");
  assert.equal(getStudentWorkspaceEmptyText("python"), "当前实验没有配置 Python 实验资源。");
});
