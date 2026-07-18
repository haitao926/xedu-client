import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "../../..");
const resourcesSource = readFileSync(resolve(repoRoot, "renderer/js/resources.js"), "utf8");

test("resources page wraps high-risk async UI handlers in a shared error boundary", () => {
  assert.match(resourcesSource, /function showAsyncActionError\(error, fallback = "操作失败", options = \{\}\)/);
  assert.match(resourcesSource, /function withAsyncActionErrorBoundary\(handler, options = \{\}\)/);
  assert.match(resourcesSource, /typeof window\.app\?\.ui\?\.showToast === "function"/);
  assert.match(resourcesSource, /window\.app\.ui\.showToast\(message, toastType\)/);
  assert.match(resourcesSource, /button\.addEventListener\("click", withAsyncActionErrorBoundary\(async \(\) => \{\s*await openStudentExperimentPage\(tabId, context, options\.file \|\| null\);/s);
  assert.match(resourcesSource, /card\.addEventListener\("click", withAsyncActionErrorBoundary\(async \(\) => \{\s*await openStudentExperimentPage\(normalized, context, file\);/s);
  assert.match(resourcesSource, /sectionNode\.addEventListener\("drop", withAsyncActionErrorBoundary\(async \(event\) => \{/);
  assert.match(resourcesSource, /expNode\.addEventListener\("drop", withAsyncActionErrorBoundary\(async \(event\) => \{/);
  assert.match(resourcesSource, /button\.addEventListener\("click", withAsyncActionErrorBoundary\(async \(\) => \{\s*resourcesState\.activeSectionIndex = context\.sectionIndex;/s);
  assert.match(resourcesSource, /action\.addEventListener\("click", withAsyncActionErrorBoundary\(async \(\) => \{/);
  assert.match(resourcesSource, /onOpenFile:\s*withAsyncActionErrorBoundary\(async \(file\) => \{/);
});

test("resources file open flows await local and external targets inside guarded actions", () => {
  assert.match(resourcesSource, /if \(localTargetPath\) \{\s*await openLocalPath\(localTargetPath\);/s);
  assert.match(resourcesSource, /if \(targetUrl\) \{\s*await openExternal\(targetUrl\);/s);
});

test("resources state wiring keeps classroom state and positional workspace contracts intact", () => {
  assert.doesNotMatch(resourcesSource, /resourcesState\.classroomState\.resourcesState/);
  assert.match(
    resourcesSource,
    /buildExperimentResourceContext\(\s*resource,\s*selectedSection,\s*resourcesState\.activeSectionIndex,/s,
  );
  assert.match(
    resourcesSource,
    /pickExperimentIndexForWorkspaceTab\(\s*experiments,\s*resourcesState\.activeCourseWorkspaceTab,/s,
  );
  assert.match(
    resourcesSource,
    /return buildCurrentExperimentContext\(\s*resourcesState\.currentResource,\s*resourcesState\.activeSectionIndex,\s*resourcesState\.activeExperimentIndex,/s,
  );
});
