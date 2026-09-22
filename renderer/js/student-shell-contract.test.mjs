import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "../..");
const readRepoFile = (relativePath) => readFileSync(resolve(repoRoot, relativePath), "utf8");

test("student shell starts at the task center without a persistent sidebar", () => {
  const html = readRepoFile("renderer/index.html");
  const css = readRepoFile("renderer/styles/main.css");
  const topBar = html.slice(html.indexOf('class="top-bar"'), html.indexOf('class="content-scroll-area"'));

  assert.match(html, /<html[^>]*class="student-shell-pending"/);
  assert.match(html, /id="page-title">课程任务中心</);
  assert.match(topBar, /id="student-focus-back"[^>]*data-action="resources\.returnToStudentTaskCenter"[\s\S]*返回任务中心/);
  assert.match(topBar, /id="student-focus-ai-btn"[^>]*data-action="ai\.toggleStudentAssistant"[\s\S]*AI 助手/);
  assert.match(topBar, /id="student-save-score-btn"[^>]*data-action="resources\.saveStudentScore"[\s\S]*保存成绩/);
  assert.match(topBar, /id="student-upload-screenshot-btn"[^>]*data-action="resources\.uploadStudentScreenshot"[\s\S]*截图并上传/);
  assert.match(topBar, /id="student-save-combined-btn"[^>]*data-action="resources\.saveStudentScoreAndScreenshot"[\s\S]*保存成绩并截图/);
  assert.match(topBar, /id="student-score-draft"/);
  assert.match(topBar, /id="student-platform-status"/);
  assert.match(topBar, /id="student-save-retry-btn"[^>]*data-action="resources\.retryStudentSave"[\s\S]*重试/);
  assert.doesNotMatch(topBar, /提交结果/);
  assert.match(topBar, /id="student-account-menu"/);
  assert.match(topBar, /id="student-account-teacher-btn"[^>]*data-role="teacher-mode-toggle"[\s\S]*data-role="teacher-mode-label">教师登录</);
  assert.match(topBar, /id="student-account-settings-btn"[^>]*hidden>设置/);
  assert.doesNotMatch(topBar, /id="nav-student-(experience|visual|python)-item"/);
  assert.doesNotMatch(topBar, /id="nav-ai-item"/);
  assert.doesNotMatch(topBar, /id="nav-settings-item"/);
  assert.doesNotMatch(topBar, /进度|progress-bar|student-focus-progress/);

  assert.match(css, /html\.student-shell-pending body:not\(\.teacher-mode\) \.sidebar,\s*body\.student-mode:not\(\.teacher-mode\) \.sidebar\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /body\.student-mode:not\(\.teacher-mode\) #settings,\s*body\.student-mode:not\(\.teacher-mode\) #student-account-settings-btn\s*\{\s*display:\s*none !important;\s*\}/);
  assert.match(css, /body\.student-mode:not\(\.teacher-mode\)\.student-focus-mode \.page-subtitle\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /body\.student-mode:not\(\.teacher-mode\) #resources-import-drop-zone\s*\{\s*display:\s*none !important;\s*\}/);
  assert.match(css, /student-page-route #resources-list-view \.resources-toolbar\s*\{\s*display:\s*none;\s*\}/);
  assert.match(css, /body\.student-mode:not\(\.teacher-mode\)\.student-ai-drawer-open #ai-assistant\.page-section\s*\{/);
  assert.match(css, /body\.student-mode:not\(\.teacher-mode\)\.student-ai-drawer-open #ai-assistant \.ai-model-badge\s*\{[^}]*white-space:\s*nowrap;/);
  assert.match(css, /body\.student-mode:not\(\.teacher-mode\)\.student-ai-drawer-open #ai-assistant \.chat-messages:has\(> \.chat-empty-state:only-child\)::after\s*\{[^}]*max-height:\s*28px;/);
  assert.doesNotMatch(css, /student-focus-progress/);

  assert.match(html, /id="nav-student-lesson-item"[^>]*data-action="resources\.openStudentLessonTab"[^>]*data-action-value="route"/);
  assert.match(html, /id="nav-main-item"[\s\S]*?<span>总控制台<\/span>/);
  assert.match(html, /id="nav-scratch-item" class="nav-item" style="display: none;"[\s\S]*?<span>Scratch 编程<\/span>/);
  assert.match(html, /id="scratch-workspace"[\s\S]*?id="scratch-workspace-frame"/);
  assert.doesNotMatch(html, /id="sidebar-teacher-mode-btn"/);
  assert.doesNotMatch(html, /id="topbar-teacher-mode-btn"/);
  assert.doesNotMatch(html, /id="resources-teacher-mode-btn"/);
});

test("active Scratch courses do not advertise Blockly experiments", () => {
  const courseFiles = [
    "backend/sasu/zhangjiang-image-recognition/course.json",
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

test("student mode hides the sidebar, settings, and AI page nav", () => {
  const css = readRepoFile("renderer/styles/main.css");
  assert.match(css, /body\.student-mode:not\(\.teacher-mode\) #nav-group-system-title,\s*body\.student-mode:not\(\.teacher-mode\) #nav-settings-item\s*\{\s*display:\s*none !important;\s*\}/);
  assert.match(css, /body\.student-mode:not\(\.teacher-mode\) \.sidebar\s*\{/);
  assert.match(css, /body\.student-mode \.student-nav-item\s*\{[\s\S]*display:\s*flex;/);
  assert.match(css, /body\.student-mode \.student-nav-item\.active/);

  const dashboard = readRepoFile("renderer/js/main/dashboard.js");
  const studentBranch = dashboard.slice(dashboard.indexOf("document.body.classList.remove(\"teacher-mode\")"));
  assert.match(dashboard, /if \(mainNavItem\) \{[\s\S]*?mainNavItem\.style\.display = "none";/);
  assert.match(dashboard, /if \(scratchNavItem\) \{[\s\S]*?scratchNavItem\.style\.display = "none";/);
  assert.match(dashboard, /if \(resourcesNavItem\) \{[\s\S]*?resourcesNavItem\.style\.display = "none";/);
  assert.match(studentBranch, /if \(settingsNavItem\) \{[\s\S]*?settingsNavItem\.style\.display = "none";/);
  assert.match(studentBranch, /if \(aiNavItem\) \{[\s\S]*?aiNavItem\.style\.display = "none";/);
  assert.match(studentBranch, /accountSettingsBtn\.hidden = !isTeacher/);
  assert.doesNotMatch(studentBranch, /aiNavItem\.style\.display = "flex"/);
  assert.doesNotMatch(studentBranch, /allowPythonSetup/);
  assert.doesNotMatch(studentBranch, /settingsNavItem\.style\.display = allowPythonSetup/);

  const main = readRepoFile("renderer/js/main.js");
  assert.doesNotMatch(main, /allowPythonSetup/);
  assert.doesNotMatch(main, /showTab\('settings'[\s\S]*nav-settings-item[\s\S]*!teacherUnlocked/);
  assert.match(main, /if \(teacherUnlocked\) \{[\s\S]*showTab\('settings'/);
  assert.match(main, /实验环境暂时不可用/);

  const resources = readRepoFile("renderer/js/resources.js");
  assert.doesNotMatch(resources, /请先在设置中选择并确认本机 Python/);
  assert.match(resources, /function openPythonSetup\(\) \{[\s\S]*if \(resourcesState\.teacherMode\.unlocked\) \{[\s\S]*showTab\?\.\("settings"/);
  assert.match(resources, /Python 配置仅教师可用/);

  const ui = readRepoFile("renderer/js/ui.js");
  assert.match(ui, /tabId === 'settings'[\s\S]*isStudentOnly/);
  assert.match(ui, /studentShell && tabId === 'ai-assistant'[\s\S]*toggleStudentAssistant\?\.?\(true\)/);

  const ai = readRepoFile("renderer/js/ai.js");
  assert.match(ai, /export function toggleStudentAssistant\(/);
  assert.match(ai, /student-ai-drawer-open/);
  assert.match(ai, /experiment_context\?\.experiment\?\.title/);
  assert.match(ai, /syncChatContextPill\(\)/);

  assert.match(resources, /export function syncStudentShellChrome\(/);
  assert.match(resources, /student-focus-mode/);
  assert.match(resources, /export function returnToStudentTaskCenter\(/);
  assert.match(resources, /export async function saveStudentScore\(/);
  assert.match(resources, /export async function uploadStudentScreenshot\(/);
  assert.match(resources, /export async function saveStudentScoreAndScreenshot\(/);
  assert.match(resources, /platform_status === "completed"/);
  assert.match(resources, /describeStudentSaveChrome/);
  const saveChrome = readRepoFile("renderer/js/resources/xedu-save-chrome.js");
  assert.match(saveChrome, /待保存：/);
  assert.match(saveChrome, /保存中/);
  assert.match(saveChrome, /平台已保存/);
  assert.match(saveChrome, /grant_expired/);
  assert.doesNotMatch(resources, /export function submitStudentResult\(/);
  assert.doesNotMatch(resources, /TODO: next pass — 提交到平台/);
});

test("teacher mode keeps the student course shell and only adds resources/settings", () => {
  const dashboard = readRepoFile("renderer/js/main/dashboard.js");
  assert.match(dashboard, /document\.body\.classList\.add\("student-mode"\);[\s\S]*document\.body\.classList\.add\("teacher-mode"\);/);
  assert.match(dashboard, /if \(mainNavItem\) \{[\s\S]*?mainNavItem\.style\.display = "none";/);
  assert.match(dashboard, /if \(scratchNavItem\) \{[\s\S]*?scratchNavItem\.style\.display = "none";/);
  assert.match(dashboard, /studentNavItems\.forEach\(\(item\) => \{[\s\S]*?item\.style\.display = "flex";/);
  assert.match(dashboard, /if \(resourcesNavItem\) \{[\s\S]*?resourcesNavItem\.style\.display = "flex";/);
  assert.match(dashboard, /if \(settingsNavItem\) \{[\s\S]*?settingsNavItem\.style\.display = "flex";/);
  assert.match(dashboard, /if \(aiNavItem\) aiNavItem\.style\.display = "flex";/);
  assert.match(dashboard, /if \(aiNavLabel\) aiNavLabel\.textContent = "AI助手";/);

  const resources = readRepoFile("renderer/js/resources.js");
  assert.match(resources, /function isStudentLessonMode\(\) \{[\s\S]*if \(!resourcesState\.teacherMode\.unlocked\) return true;[\s\S]*document\.querySelector\("\.student-nav-item\.active"\)/);

  const ui = readRepoFile("renderer/js/ui.js");
  assert.match(ui, /navItem\?\.id === 'nav-resources-item'[\s\S]*openResourcesLibrary/);
});

test("student task center opens HTML pages directly and routes coding tabs to native workbenches", () => {
  const resources = readRepoFile("renderer/js/resources.js");
  const css = readRepoFile("renderer/styles/main.css");
  assert.match(resources, /function makeStudentRouteButton\(tabId, context, options = \{\}\)/);
  assert.match(resources, /function renderResources\(list = \[\]\)/);
  assert.doesNotMatch(resources, /本节实践通道/);
  assert.match(resources, /function syncStudentTaskCenterHeader\(/);
  assert.match(resources, /student-task-center-header/);
  assert.doesNotMatch(resources, /只显示当前课程/);
  assert.doesNotMatch(resources, /拖到上方导入区/);
  assert.match(resources, /function formatStudentCourseSubtitle\(/);
  assert.match(resources, /if \(course && lesson && course !== lesson\) return lesson;/);
  assert.doesNotMatch(resources, /\$\{section\.title \|\| `第 \$\{lessonIndex \+ 1\} 课`\} \/ \$\{resource\?\.title/);
  assert.match(css, /student-page-route \.resources-empty[\s\S]*justify-content:\s*center;/);
  assert.match(css, /student-page-route[\s\S]*resources-course-workspace\.is-route-page[\s\S]*margin-inline:\s*auto;/);
  assert.match(css, /\.resources-learning-route\.is-student-lesson[\s\S]*margin-inline:\s*auto;/);
  assert.match(resources, /function renderStudentLessonEmpty[\s\S]*?加入课堂/);
  assert.doesNotMatch(resources, /function renderStudentLessonEmpty[\s\S]*?打开本地课程/);
  assert.match(resources, /加入课堂后，课程会出现在这里。/);
  assert.doesNotMatch(resources, /拖入 ZIP 或课程文件夹/);
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

test("Electron fully disposes stale Jupyter BrowserViews", () => {
  const main = readRepoFile("electron/main/main.js");
  assert.match(main, /function disposeJupyterView\([\s\S]*?view\.webContents\.destroy\(\);[\s\S]*?\}/);
  assert.match(main, /复用旧 Jupyter 视图失败[\s\S]*?disposeJupyterView\(\);/);
  assert.match(main, /ipcMain\.handle\('jupyter:destroy-view'[\s\S]*?disposeJupyterView\(\);/);
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
  assert.match(css, /body\.student-mode:not\(\.teacher-mode\)\.student-focus-mode \.top-bar,\s*body\.student-mode\.student-page-experience \.top-bar\s*\{[\s\S]*height:\s*58px;/);
  assert.match(css, /resources-outline-layout\.is-direct-file-workspace\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(css, /resources-view\.is-student-lesson \.resources-outline-layout\.is-student-workspace\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(css, /resources-student-html-experience\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;/);
  assert.match(css, /resources-student-html-experience-head\s*\{[\s\S]*flex:\s*0 0 auto;[\s\S]*min-height:\s*38px;/);
  assert.match(css, /resources-student-html-frame-wrap\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;/);
  assert.match(css, /resources-student-html-frame\s*\{[\s\S]*height:\s*100%;/);
  assert.doesNotMatch(css, /resources-student-gateway/);
});

test("about us lists software authors and the current testers with schools", () => {
  const html = readRepoFile("renderer/index.html");
  const about = html.slice(html.indexOf('id="about-us-modal"'), html.indexOf("<!-- Modal -->"));

  assert.match(about, /data-action="ui\.hideModal" data-action-value="about-us-modal"/);
  assert.match(about, /王海涛[\s\S]*上海科技大学附属学校/);
  assert.match(about, /邱奕盛[\s\S]*上海科技大学附属学校/);
  assert.match(about, /项目指导：[\s\S]*谢作如/);
  assert.match(about, /郑祥[\s\S]*温州市第十七中学/);
  assert.match(about, /洪丹妮[\s\S]*温州市绣山中学/);
  assert.match(about, /刘宜萍[\s\S]*合肥一六八中学/);
  assert.doesNotMatch(about, /刘啸宇|刘正云/);
});
