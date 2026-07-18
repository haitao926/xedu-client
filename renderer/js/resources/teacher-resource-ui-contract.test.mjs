import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "../../..");
const readRepoFile = (relativePath) => readFileSync(resolve(repoRoot, relativePath), "utf8");

test("teacher resources page exposes local and cloud import entry points", () => {
  const html = readRepoFile("renderer/index.html");
  const requiredIds = [
    "resources-add-btn",
    "resources-add-local-btn",
    "resources-add-cloud-btn",
    "resources-create-view",
    "resources-create-back-btn",
    "resources-source-local",
    "resources-source-cloud",
    "resources-cloud-course-select",
    "resources-cloud-import-btn",
  ];

  for (const id of requiredIds) {
    assert.match(html, new RegExp(`id="${id}"`), `missing resources DOM node: ${id}`);
  }

  assert.match(html, /id="resources-add-btn"[\s\S]*?导入课程/);
  assert.match(html, /id="resources-add-local-btn"[\s\S]*?本地导入/);
  assert.match(html, /id="resources-add-cloud-btn"[\s\S]*?云端导入/);
});

test("empty teacher resource state offers cloud import and hides the empty list grid", () => {
  const resources = readRepoFile("renderer/js/resources.js");
  const css = readRepoFile("renderer/styles/main.css");

  assert.match(resources, /label:\s*"导入云端课程"[\s\S]*?action:\s*"cloud-import"/);
  assert.match(resources, /action === "cloud-import"/);
  assert.match(resources, /container\.classList\.(?:add|toggle)\(["']is-empty["']/);
  assert.match(css, /\.resources-list\.is-empty\s*\{[\s\S]*display:\s*none/);
});

test("teacher resources bindings wire both import menu actions", () => {
  const bindings = readRepoFile("renderer/js/resources/resource-bindings.js");

  assert.match(bindings, /resources-add-local-btn/);
  assert.match(bindings, /resources-add-cloud-btn/);
  assert.match(bindings, /chooseCreateEntryMode\(['"]pack-import['"]\)/);
  assert.match(bindings, /chooseCreateEntryMode\(['"]cloud-import['"]\)/);
  assert.match(bindings, /resources-cloud-import-btn/);
});

test("student task center cannot enter the teacher course import wizard", () => {
  const resources = readRepoFile("renderer/js/resources.js");
  const studentEmptyStart = resources.indexOf("function renderStudentLessonEmpty");
  const studentEmptyEnd = resources.indexOf("function appendMeta", studentEmptyStart);
  const studentEmpty = resources.slice(studentEmptyStart, studentEmptyEnd);

  assert.doesNotMatch(studentEmpty, /action:\s*"import-local"/);
  assert.match(studentEmpty, /action:\s*"connect-classroom"/);
  assert.match(resources, /if \(action === "import-local"\) \{[\s\S]*if \(!resourcesState\.teacherMode\.unlocked\) return;/);
  assert.match(resources, /function openCreateView\(resource = null\) \{[\s\S]*if \(!resourcesState\.teacherMode\.unlocked\) return false;/);
});
