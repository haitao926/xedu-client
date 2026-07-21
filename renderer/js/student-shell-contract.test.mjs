import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "../..");
const readRepoFile = (relativePath) => readFileSync(resolve(repoRoot, relativePath), "utf8");

test("student sidebar contains only the intended student-facing course entries", () => {
  const html = readRepoFile("renderer/index.html");
  const expected = [
    ["nav-student-lesson-item", "课程任务中心", "resources.openStudentLessonTab", "route"],
    ["nav-student-experience-item", "互动体验", "resources.openStudentLessonTab", "experience"],
    ["nav-student-visual-item", "图形编程", "resources.openStudentLessonTab", "visual"],
    ["nav-student-python-item", "Python实验", "resources.openStudentLessonTab", "python"],
    ["nav-ai-item", "AI助手", "ui.showTab", "ai-assistant"],
  ];

  for (const [id, label, action, value] of expected) {
    assert.match(html, new RegExp(`id="${id}"[\\s\\S]*?<span>${label}</span>`));
    assert.match(html, new RegExp(`id="${id}"[^>]*data-action="${action}"`));
    assert.match(html, new RegExp(`id="${id}"[^>]*data-action-value="${value}"`));
  }

  assert.match(html, /id="nav-main-item"[\s\S]*?<span>总控制台<\/span>/);
  assert.match(html, /id="nav-scratch-item" class="nav-item" style="display: none;"[\s\S]*?<span>Scratch 编程<\/span>/);
  assert.match(html, /id="scratch-workspace"[\s\S]*?id="scratch-workspace-frame"/);
  assert.doesNotMatch(html, /id="topbar-teacher-mode-btn"/);
  assert.doesNotMatch(html, /右上角使用“教师登录”/);
  assert.doesNotMatch(html, /教师登录入口固定在左下角/);
  assert.match(html, /id="sidebar-teacher-mode-btn"[\s\S]*?<strong data-role="teacher-mode-label">教师登录<\/strong>/);
  assert.doesNotMatch(html, /id="resources-teacher-mode-btn"/);
});

test("active Scratch courses do not advertise Blockly experiments", () => {
  const courseFiles = [
    "backend/sasu/zhangjiang-image-recognition/course.json",
    "backend/sasu/zhangjiang-image-recognition-standard/zhangjiang-image-recognition-standard/course.json",
  ];

  for (const relativePath of courseFiles) {
    const course = JSON.parse(readRepoFile(relativePath));
    const files = course.sections.flatMap((section) =>
      (section.experiments || []).flatMap((experiment) => experiment.files || []),
    );
    assert.equal(
      files.filter((file) => file.type === "blockly").length,
      0,
      `${relativePath} contains a Blockly experiment`,
    );
  }
});

test("static shell actions use the explicit allowlisted event boundary", () => {
  const html = readRepoFile("renderer/index.html");
  const dispatcher = readRepoFile("renderer/js/action-dispatcher.js");

  assert.doesNotMatch(html, /\s+on(?:click|change|keydown|keyup|input|submit|load|error|focus|blur)\s*=/i);
  assert.match(html, /data-action="ui\.showTab"/);
  assert.match(html, /data-action="projectWizard\.nextStep"/);
  assert.match(dispatcher, /const ACTIONS = Object\.freeze\(\{/);
  assert.match(dispatcher, /registerActionDelegation\(\);/);
  assert.doesNotMatch(dispatcher, /\beval\s*\(|new Function\s*\(/);
});

test("content security policy allows images from the local resource proxy only", () => {
  const html = readRepoFile("renderer/index.html");

  assert.match(
    html,
    /img-src 'self' data: blob: file: http:\/\/127\.0\.0\.1:\* http:\/\/localhost:\*;/,
  );
  assert.doesNotMatch(html, /img-src[^;]*(?:^|\s)https?:\s/);
});

test("resources module exports the student lesson tab entrypoint", () => {
  const resources = readRepoFile("renderer/js/resources.js");
  assert.ok(resources.includes("export async function openStudentLessonTab("));
});

test("student mode hides teacher/admin shell navigation but keeps AI assistant", () => {
  const css = readRepoFile("renderer/styles/main.css");
  assert.match(css, /body\.student-mode:not\(\.teacher-mode\) #nav-group-system-title\s*\{\s*display:\s*none !important;\s*\}/);
  assert.match(css, /body\.student-mode \.student-nav-item\s*\{[\s\S]*display:\s*flex;/);
  assert.match(css, /body\.student-mode \.student-nav-item\.active/);

  const dashboard = readRepoFile("renderer/js/main/dashboard.js");
  assert.match(dashboard, /if \(mainNavItem\) \{[\s\S]*?mainNavItem\.style\.display = "none";/);
  assert.match(dashboard, /if \(scratchNavItem\) \{[\s\S]*?scratchNavItem\.style\.display = "none";/);
  assert.match(dashboard, /if \(resourcesNavItem\) \{[\s\S]*?resourcesNavItem\.style\.display = "none";/);
  assert.match(dashboard, /if \(aiNavItem\) aiNavItem\.style\.display = "flex";/);
  assert.match(dashboard, /if \(aiNavLabel\) aiNavLabel\.textContent = "AI助手";/);
});

test("teacher mode keeps the student course shell and only adds resources/settings", () => {
  const dashboard = readRepoFile("renderer/js/main/dashboard.js");
  assert.match(dashboard, /document\.body\.classList\.add\("student-mode"\);[\s\S]*document\.body\.classList\.add\("teacher-mode"\);/);
  assert.match(dashboard, /if \(mainNavItem\) \{[\s\S]*?mainNavItem\.style\.display = "none";/);
  assert.match(dashboard, /if \(scratchNavItem\) \{[\s\S]*?scratchNavItem\.style\.display = "none";/);
  assert.match(dashboard, /studentNavItems\.forEach\(\(item\) => \{[\s\S]*?item\.style\.display = "flex";/);
  assert.match(dashboard, /if \(resourcesNavItem\) \{[\s\S]*?resourcesNavItem\.style\.display = "flex";/);
  assert.match(dashboard, /if \(settingsNavItem\) \{[\s\S]*?settingsNavItem\.style\.display = "flex";/);

  const resources = readRepoFile("renderer/js/resources.js");
  assert.match(resources, /function isStudentLessonMode\(\) \{[\s\S]*if \(!resourcesState\.teacherMode\.unlocked\) return true;[\s\S]*document\.querySelector\("\.student-nav-item\.active"\)/);

  const ui = readRepoFile("renderer/js/ui.js");
  assert.match(ui, /navItem\?\.id === 'nav-resources-item'[\s\S]*openResourcesLibrary/);
});

test("student task center opens HTML pages directly and routes coding tabs to native workbenches", () => {
  const resources = readRepoFile("renderer/js/resources.js");
  assert.match(resources, /function makeStudentRouteButton\(tabId, context, options = \{\}\)/);
  assert.match(resources, /function renderResources\(list = \[\]\)/);
  assert.doesNotMatch(resources, /本节实践通道/);
  assert.match(resources, /只显示当前课程/);
  assert.match(resources, /function renderStudentLessonEmpty[\s\S]*?加入课堂/);
  assert.doesNotMatch(resources, /function renderStudentLessonEmpty[\s\S]*?打开本地课程/);
  assert.match(resources, /当前课程当前课节对应的学习内容/);
  assert.match(resources, /label: "进入互动体验"/);
  assert.match(resources, /label: isStudentLessonMode\(\) \? "进入图形编程" : "进入可视化编程"/);
  assert.match(resources, /label: isStudentLessonMode\(\) \? "进入Python实验" : "进入Python编程"/);
  assert.match(resources, /function getStudentRouteEntries\(context\)/);
  assert.match(resources, /\.filter\(\(entry\) => entry\.file\)/);
  assert.match(resources, /if \(isStudentLessonMode\(\) && !hasStudentRouteEntries\(context\)\) \{/);
  assert.match(resources, /title\.textContent = context\.exp\.title \|\| `实验 \$\{context\.expIndex \+ 1\}`;/);
  assert.match(resources, /本节暂无实验内容。/);
  assert.doesNotMatch(resources, /当前实验没有配置 Scratch 资源。/);
  assert.match(resources, /function buildStudentHtmlExperienceView\(context\)/);
  assert.match(resources, /openBrowserBtn\.addEventListener\("click", withAsyncActionErrorBoundary\(async \(\) => \{[\s\S]*await openExternal\(frameUrl\);/);
  assert.doesNotMatch(resources, /window\.app\?\.system\?\.openExternal\?\.\(frameUrl\)/);
  assert.match(resources, /function syncStudentPageBodyState\(tabId = resourcesState\.activeCourseWorkspaceTab\)/);
  assert.match(resources, /student-page-experience/);
  assert.match(resources, /resourcesState\.pendingTeacherModeShellSync = false;/);
  assert.match(resources, /openingStudentLessonTab[\s\S]*resourcesState\.pendingTeacherModeShellSync = true;/);
  assert.match(resources, /if \(resourcesState\.pendingTeacherModeShellSync\) \{[\s\S]*updateTeacherModeUI\(\);/);
  assert.match(resources, /resourcesState\.activeCourseWorkspaceTab === "experience"[\s\S]*\? buildStudentHtmlExperienceView\(context\)/);
  assert.match(resources, /className = "resources-student-html-frame"/);
  assert.match(resources, /compactStudentExperience[\s\S]*resourcesState\.activeCourseWorkspaceTab === "experience"/);
  assert.match(resources, /if \(!compactStudentExperience\) \{[\s\S]*mainPane\.appendChild\(expCard\);[\s\S]*\}/);
  assert.match(resources, /function buildStudentExperimentEntryCard\(context, tabId = resourcesState\.activeCourseWorkspaceTab\)/);
  assert.match(resources, /resources-student-entry-card/);
  assert.match(resources, /function openStudentVisualWorkspace\(course, context = null\)/);
  assert.match(resources, /const currentCourse = pickStudentCurrentCourse\(\);/);
  assert.doesNotMatch(resources, /const currentCourse = course \|\| pickStudentCurrentCourse\(\);/);
  assert.match(resources, /resourcesState\.activeCourseWorkspaceTab === "visual"[\s\S]*return openStudentVisualWorkspace\(currentCourse\);/);
  assert.doesNotMatch(resources, /function renderResources\(list\)[\s\S]*openStudentVisualWorkspace\(course\)/);
  assert.match(resources, /sourcePage !== "student-visual"/);
  assert.match(resources, /sourcePage = isStudentLessonMode\(\)[\s\S]*\? "student-visual"[\s\S]*: "resources";/);
  assert.match(resources, /if \(kind === "html" && context\?\.resource/);
  assert.match(resources, /buildLocalCourseFileUrl\(context\.resource/);
});

test("student task center does not fall back to local, historical, or generic resource courses", () => {
  const resources = readRepoFile("renderer/js/resources.js");
  const selectorStart = resources.indexOf("function pickStudentCurrentCourse");
  const selectorEnd = resources.indexOf("function syncStudentLessonNav", selectorStart);
  const selector = resources.slice(selectorStart, selectorEnd);
  const rendererStart = resources.indexOf("function renderResources(list = [])");
  const rendererEnd = resources.indexOf("function buildResourceCard", rendererStart);
  const renderer = resources.slice(rendererStart, rendererEnd);

  assert.match(selector, /selectStudentCurrentCourse\(/);
  assert.doesNotMatch(selector, /currentResource/);
  assert.doesNotMatch(selector, /localCourses\[0\]/);
  assert.doesNotMatch(selector, /resourcesCache\[0\]/);
  assert.doesNotMatch(renderer, /Array\.isArray\(list\)\s*&&\s*list\.length\s*\?\s*list\[0\]/);
});

test("student interactive experience opens the selected HTML file without the course outline", () => {
  const resources = readRepoFile("renderer/js/resources.js");
  const styles = readRepoFile("renderer/styles/main.css");

  assert.match(resources, /const directStudentExperience = isStudentLessonMode\(\) && resourcesState\.activeCourseWorkspaceTab === "experience";/);
  assert.match(resources, /if \(!directStudentExperience && \(!isStudentLessonMode\(\) \|\| resourcesState\.activeCourseWorkspaceTab !== "route"\)\)/);
  assert.match(resources, /split\.classList\.add\("is-direct-file-workspace"\);/);
  assert.doesNotMatch(resources, /is-experience-workbench/);
  assert.match(styles, /resources-outline-layout\.is-direct-file-workspace\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.doesNotMatch(styles, /is-experience-workbench/);
});

test("student classroom entry is owned by the course task center", () => {
  const html = readRepoFile("renderer/index.html");
  const main = readRepoFile("renderer/js/main.js");
  const resources = readRepoFile("renderer/js/resources.js");

  assert.doesNotMatch(html, /data-quick-tab="classroom"/);
  assert.doesNotMatch(html, /id="dashboard-input-hint"/);
  assert.doesNotMatch(main, /dashboardClassroomCodeCache/);
  assert.doesNotMatch(main, /prepareConsoleLaunch/);
  assert.doesNotMatch(main, /connectStudentClassroomByCode/);
  assert.match(main, /openStudentLessonTab\("route"/);
  assert.match(resources, /async function requestStudentClassroomCode\(\)/);
  assert.match(resources, /title: "加入课堂"/);
  assert.match(resources, /label: "课堂码"/);
  assert.match(resources, /placeholder: "留空自动发现"/);
  assert.match(resources, /required: false/);
  assert.match(resources, /connectStudentClassroomByCode\(classroomCode, \{ showResourcesView: true \}\)/);
  assert.match(resources, /if \(!currentCourse && \(resourcesState\.activeCourseWorkspaceTab === "python" \|\| resourcesState\.activeCourseWorkspaceTab === "visual"\)\) \{[\s\S]*?return openStudentLessonTab\("route", document\.getElementById\("nav-student-lesson-item"\)\);/);
});

test("student task center shows only runnable experiment content", () => {
  const resources = readRepoFile("renderer/js/resources.js");
  const routeEntries = resources.match(
    /function getStudentRouteEntries\(context\) \{[\s\S]*?(?=\nfunction hasStudentRouteEntries)/
  )?.[0] || "";
  const studentRoute = resources.match(
    /if \(isStudentLessonMode\(\) && resourcesState\.activeCourseWorkspaceTab === "route"\) \{[\s\S]*?\n    \}/
  )?.[0] || "";

  assert.match(routeEntries, /context\.overview\.htmlFiles\[0\]/);
  assert.match(routeEntries, /context\.overview\.scratchFiles\?\.\[0\]/);
  assert.match(routeEntries, /context\.overview\.notebookFiles\[0\]/);
  assert.doesNotMatch(routeEntries, /blocklyFiles/);
  assert.doesNotMatch(routeEntries, /查看提示/);
  assert.doesNotMatch(studentRoute, /resources-route-workbench-shell/);
  assert.doesNotMatch(studentRoute, /选择下一步要进入的学习空间/);
  assert.doesNotMatch(studentRoute, /建议按课堂顺序/);
  assert.match(studentRoute, /renderLearningRouteWorkspace\(mainPane, resource, visibleSectionContexts\);/);
  assert.match(resources, /empty\.textContent = "本节暂无实验内容。";/);
});

test("Electron Jupyter BrowserView is not attached by create-view unless visible state is authorized", () => {
  const main = readRepoFile("electron/main/main.js");
  assert.match(main, /if \(isJupyterViewVisible\) \{[\s\S]*?mainWindow\.setBrowserView\(view\);[\s\S]*?\}/);
  assert.doesNotMatch(main, /mainWindow\.setBrowserView\(view\);\s*isJupyterViewVisible = true;/);
  assert.match(main, /if \(isJupyterViewVisible && mainWindow\.getBrowserView\(\) !== jupyterView\) \{[\s\S]*?mainWindow\.setBrowserView\(jupyterView\);/);
  assert.match(main, /isJupyterViewVisible = false;[\s\S]*?mainWindow\.removeBrowserView\(jupyterView\);/);
});

test("student Python is allowed to use main Jupyter page without reopening the total console", () => {
  const ui = readRepoFile("renderer/js/ui.js");
  const workspace = readRepoFile("renderer/js/main/workspace-context.js");
  assert.match(ui, /tabId === 'main' && !options\.allowStudentMain/);
  assert.match(workspace, /sourcePage === 'student-python'/);
  assert.match(workspace, /label: 'Python实验'/);
  assert.match(workspace, /navId: 'nav-student-python-item'/);
  assert.match(workspace, /sourcePage === 'student-python'/);
  assert.match(workspace, /allowStudentMain:\s*isStudentPython/);
  assert.match(workspace, /pageTitle:\s*isStudentPython \? 'Python实验'/);
});

test("student copy keeps course tasks separate from Scratch and Jupyter workspaces", () => {
  const config = readRepoFile("renderer/js/experience-config.js");
  assert.match(config, /subtitle:\s*'加入课堂后，从课程任务中心选择实验入口'/);
  assert.match(config, /从课程任务中心直接进入内置 Scratch 编辑器/);

  const workspaceUtils = readRepoFile("renderer/js/resources/student-workspace-utils.js");
  assert.match(workspaceUtils, /studentTitle:\s*"课程任务中心"/);
  assert.match(workspaceUtils, /studentTitle:\s*"图形编程"/);
  assert.match(workspaceUtils, /studentTitle:\s*"Python实验"/);
  assert.match(workspaceUtils, /if \(normalized === "visual"\) \{\s*return "scratch";\s*\}/);
  assert.match(workspaceUtils, /if \(normalized === "python"\) \{\s*return "jupyter";\s*\}/);
});

test("legacy Blockly experiments use an unsupported-course degradation path", () => {
  const resources = readRepoFile("renderer/js/resources.js");
  assert.match(resources, /旧图形资源（不支持）/);
  assert.doesNotMatch(resources, /openBlocklyWorkspace\(/);
});

test("AI assistant stays focused on student experiment help", () => {
  const ai = readRepoFile("renderer/js/ai.js");
  assert.match(ai, /getExperienceConfig\(EXPERIENCE_MODES\.STUDENT\)\.ai/);
  assert.match(ai, /return EXPERIENCE_MODES\.STUDENT;/);
  assert.match(ai, /experience_mode:\s*EXPERIENCE_MODES\.STUDENT/);

  const config = readRepoFile("renderer/js/experience-config.js");
  const teacherAiStart = config.indexOf("        ai: {", config.indexOf("[EXPERIENCE_MODES.TEACHER]"));
  const teacherScratchStart = config.indexOf("        scratch: {", teacherAiStart);
  const teacherAiConfig = config.slice(teacherAiStart, teacherScratchStart);

  assert.match(teacherAiConfig, /headerTitle:\s*'学习助手'/);
  assert.match(teacherAiConfig, /placeholder:\s*'输入学习问题：实验目标、概念、报错、Scratch 或 Python 步骤'/);
  assert.doesNotMatch(teacherAiConfig, /QuickForm|打包|发布|教师侧问题|助教会话|生成 Blockly|课程目录/);
});

test("student task-center workspaces keep route and direct HTML layouts distinct", () => {
  const css = readRepoFile("renderer/styles/main.css");
  assert.match(css, /resources-view\.is-student-lesson \.resources-outline-layout\s*\{[\s\S]*grid-template-columns:\s*260px minmax\(0, 1fr\);/);
  assert.match(css, /body\.student-mode\.student-page-route \.content-scroll-area,[\s\S]*body\.student-mode\.student-page-python \.content-scroll-area\s*\{[\s\S]*padding:\s*0;/);
  assert.match(css, /\.top-bar\s*\{[\s\S]*height:\s*58px;/);
  assert.match(css, /body\.student-mode\.student-page-experience \.top-bar\s*\{[\s\S]*height:\s*58px;/);
  assert.match(css, /resources-outline-layout\.is-direct-file-workspace\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(css, /resources-view\.is-student-lesson \.resources-outline-layout\.is-student-workspace\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(css, /resources-student-html-experience\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;/);
  assert.match(css, /resources-student-html-experience-head\s*\{[\s\S]*flex:\s*0 0 auto;[\s\S]*min-height:\s*38px;/);
  assert.match(css, /resources-student-html-frame-wrap\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;/);
  assert.match(css, /resources-student-html-frame\s*\{[\s\S]*height:\s*100%;/);
  assert.doesNotMatch(css, /resources-student-gateway/);
});
