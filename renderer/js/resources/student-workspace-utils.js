export const STUDENT_WORKSPACE_TABS = Object.freeze([
  {
    id: "route",
    title: "学习路线",
    studentTitle: "课程任务中心",
    desc: "按课次查看目标、实验顺序和课堂任务。",
    studentDesc: "查看当前课节目标、实验顺序和要完成的学习任务。",
  },
  {
    id: "experience",
    title: "互动体验",
    studentTitle: "互动体验",
    desc: "打开 HTML 实验页，先观察现象和理解概念。",
  },
  {
    id: "visual",
    title: "可视化编程",
    studentTitle: "图形编程",
    desc: "打开 Scratch 图形编程资源。",
    studentDesc: "使用 Scratch 积木和 XEdu AI 扩展完成本节课的编程实践。",
  },
  {
    id: "python",
    title: "Python编程",
    studentTitle: "Python实验",
    desc: "打开 Notebook、Python 脚本和实验数据。",
    studentDesc: "打开 Notebook、Python 脚本和本节课数据。",
  },
]);

const STUDENT_TAB_IDS = new Set(STUDENT_WORKSPACE_TABS.map((tab) => tab.id));

export function normalizeStudentWorkspaceTabId(tabId = "route") {
  return STUDENT_TAB_IDS.has(tabId) ? tabId : "route";
}

export function getStudentWorkspaceTabConfig(tabId = "route") {
  const normalized = normalizeStudentWorkspaceTabId(tabId);
  return STUDENT_WORKSPACE_TABS.find((tab) => tab.id === normalized) || STUDENT_WORKSPACE_TABS[0];
}

export function getStudentWorkspaceTabTitle(tabId = "route", isStudent = true) {
  const tab = getStudentWorkspaceTabConfig(tabId);
  return isStudent ? (tab.studentTitle || tab.title) : tab.title;
}

export function getStudentWorkspaceTabDescription(tabId = "route", isStudent = true) {
  const tab = getStudentWorkspaceTabConfig(tabId);
  return isStudent ? (tab.studentDesc || tab.desc) : tab.desc;
}

export function getStudentWorkspacePageClass(tabId = "route") {
  const map = {
    route: "is-route-page",
    experience: "is-experience-page",
    visual: "is-visual-page",
    python: "is-python-page",
  };
  return map[normalizeStudentWorkspaceTabId(tabId)] || map.route;
}

export function getStudentWorkspaceEmptyText(tabId = "route") {
  const normalized = normalizeStudentWorkspaceTabId(tabId);
  if (normalized === "experience") return "当前实验没有配置互动体验页。";
  if (normalized === "visual") return "当前实验没有配置图形编程资源。";
  if (normalized === "python") return "当前实验没有配置 Python 实验资源。";
  return "该实验尚未配置文件。";
}

export function getStudentWorkspaceFilesForOverview(overview = {}, tabId = "route") {
  const normalized = normalizeStudentWorkspaceTabId(tabId);
  if (normalized === "experience") return overview.htmlFiles || [];
  if (normalized === "visual") return [...(overview.scratchFiles || []), ...(overview.blocklyFiles || [])];
  if (normalized === "python") return overview.pythonWorkspaceFiles || [];
  return overview.allFiles || [];
}

export function getStudentWorkspaceTargetPage(tabId = "route") {
  const normalized = normalizeStudentWorkspaceTabId(tabId);
  if (normalized === "visual") {
    return "scratch";
  }
  if (normalized === "python") {
    return "jupyter";
  }
  return "resources";
}

export function shouldHideJupyterForStudentTab(tabId = "route") {
  return normalizeStudentWorkspaceTabId(tabId) !== "python";
}

export function selectStudentCurrentCourse({
  classroomState = {},
  remoteSource = "",
  localCourses = [],
  resourcesCache = [],
} = {}) {
  if (classroomState.active) {
    const activeCourseIds = [
      classroomState.activeCourseOriginId,
      classroomState.activeCourseId,
    ].filter(Boolean);
    if (!activeCourseIds.length) return null;
    return localCourses.find((course) => course?.id && activeCourseIds.includes(course.id)) || null;
  }

  if (!classroomState.connected || remoteSource !== "classroom") return null;
  return resourcesCache.find((course) => course?.source === "classroom") || null;
}

export function getStudentVisibleLessonContexts(sections = [], sectionIndex = 0, isStudent = true) {
  if (!isStudent) {
    return sections.map((section, index) => ({ section, sectionIndex: index }));
  }
  if (!sections.length) return [];
  const safeIndex = Number.isFinite(sectionIndex) && sectionIndex >= 0 && sectionIndex < sections.length
    ? sectionIndex
    : 0;
  return [{ section: sections[safeIndex], sectionIndex: safeIndex }];
}

export function pickFirstExperimentWithFiles({
  sections = [],
  sectionIndex = 0,
  tabId = "route",
  getOverview,
  getFilesForOverview = getStudentWorkspaceFilesForOverview,
} = {}) {
  const safeIndex = Number.isFinite(sectionIndex) && sectionIndex >= 0 && sectionIndex < sections.length
    ? sectionIndex
    : 0;
  const section = sections[safeIndex] || sections[0] || null;
  const experiments = Array.isArray(section?.experiments) ? section.experiments : [];
  for (let expIndex = 0; expIndex < experiments.length; expIndex += 1) {
    const exp = experiments[expIndex];
    const overview = getOverview ? getOverview(exp) : {};
    const files = getFilesForOverview(overview, tabId);
    if (files.length) {
      return {
        section,
        sectionIndex: safeIndex,
        exp,
        expIndex,
        overview,
        file: files[0],
        files,
      };
    }
  }
  const fallbackExp = experiments[0] || null;
  return {
    section,
    sectionIndex: safeIndex,
    exp: fallbackExp,
    expIndex: 0,
    overview: fallbackExp && getOverview ? getOverview(fallbackExp) : {},
    file: null,
    files: [],
  };
}
