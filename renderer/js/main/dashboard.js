export function createDashboardController({ showSettingsTab }) {

    function updateSettingsVisibility(isTeacher, { allowPythonSetup = false } = {}) {
        const modeAlreadyApplied = isTeacher
            ? document.body.classList.contains("teacher-mode") && document.body.classList.contains("student-mode")
            : document.body.classList.contains("student-mode") && !document.body.classList.contains("teacher-mode");
        const settingsNavItem = document.getElementById("nav-settings-item");
        const resourcesNavItem = document.getElementById("nav-resources-item");
        const mainNavItem = document.getElementById("nav-main-item");
        const scratchNavItem = document.getElementById("nav-scratch-item");
        const aiNavItem = document.getElementById("nav-ai-item");
        const aiNavLabel = aiNavItem?.querySelector("span");
        const studentNavItems = document.querySelectorAll(".student-nav-item");
        const systemGroupTitle = document.getElementById("nav-group-system-title");
        const consoleGroupTitle = document.getElementById("nav-group-console-title");
        const resourcesGroupTitle = document.getElementById("nav-group-resources-title");
        const settingsPage = document.getElementById("settings");
        const teacherTabs = document.querySelectorAll('.settings-tab[data-teacher-only="true"]');
        const teacherContents = document.querySelectorAll('.settings-content[data-teacher-only="true"]');
        const resourcesNavLabel = resourcesNavItem?.querySelector("span");

        if (isTeacher) {
            document.body.classList.add("student-mode");
            document.body.classList.add("teacher-mode");
            if (mainNavItem) {
                mainNavItem.style.display = "none";
                mainNavItem.classList.remove("active");
            }
            if (scratchNavItem) {
                scratchNavItem.style.display = "none";
                scratchNavItem.classList.remove("active");
            }
            if (aiNavItem) aiNavItem.style.display = "flex";
            if (aiNavLabel) aiNavLabel.textContent = "AI助手";
            studentNavItems.forEach((item) => {
                item.style.display = "flex";
            });
            if (consoleGroupTitle) {
                consoleGroupTitle.textContent = "本节课";
                consoleGroupTitle.style.display = "";
            }
            if (resourcesGroupTitle) {
                resourcesGroupTitle.style.display = "";
            }
            if (systemGroupTitle) {
                systemGroupTitle.style.display = "";
            }
            if (resourcesNavItem) {
                resourcesNavItem.style.display = "flex";
            }
            if (resourcesNavLabel) {
                resourcesNavLabel.textContent = "课程资源";
            }
            if (settingsNavItem) {
                settingsNavItem.style.display = "flex";
            }
            if (settingsPage) {
                settingsPage.style.display = "";
            }
            teacherTabs.forEach((btn) => {
                btn.style.display = "inline-flex";
            });
            teacherContents.forEach((section) => {
                section.style.display = "";
            });
            const activePage = document.querySelector(".page-section.active");
            const activePageId = activePage?.id || "";
            const activeStudentNav = document.querySelector(".student-nav-item.active");
            if (!modeAlreadyApplied && activePageId === "main" && activeStudentNav?.id !== "nav-student-python-item") {
                Promise.resolve(
                    window.app?.resources?.openStudentLessonTab?.("route", document.getElementById("nav-student-lesson-item"))
                ).catch((error) => {
                    console.warn("打开课程任务中心失败:", error);
                });
            }
            const activeTab = document.querySelector(".settings-tab.active");
            if (!activeTab) {
                const pythonTab = document.querySelector('.settings-tab[data-tab="python"]');
                if (pythonTab) {
                    showSettingsTab("python");
                }
            }
        } else {
            document.body.classList.add("student-mode");
            document.body.classList.remove("teacher-mode");
            if (mainNavItem) {
                mainNavItem.style.display = "none";
                mainNavItem.classList.remove("active");
            }
            if (scratchNavItem) {
                scratchNavItem.style.display = "none";
                scratchNavItem.classList.remove("active");
            }
            if (aiNavItem) aiNavItem.style.display = "flex";
            if (aiNavLabel) aiNavLabel.textContent = "AI助手";
            studentNavItems.forEach((item) => {
                item.style.display = "flex";
            });
            if (consoleGroupTitle) {
                consoleGroupTitle.textContent = "本节课";
                consoleGroupTitle.style.display = "";
            }
            if (resourcesGroupTitle) {
                resourcesGroupTitle.style.display = "none";
            }
            if (systemGroupTitle) {
                systemGroupTitle.style.display = allowPythonSetup ? "" : "none";
            }
            if (resourcesNavItem) {
                resourcesNavItem.style.display = "none";
                resourcesNavItem.classList.remove("active");
            }
            if (resourcesNavLabel) {
                resourcesNavLabel.textContent = "课程资源";
            }
            if (settingsNavItem) {
                settingsNavItem.style.display = allowPythonSetup ? "flex" : "none";
                if (!allowPythonSetup) settingsNavItem.classList.remove("active");
            }
            if (settingsPage) {
                settingsPage.style.display = allowPythonSetup ? "" : "none";
            }
            const activePage = document.querySelector(".page-section.active");
            const activePageId = activePage?.id || "";
            if (!modeAlreadyApplied && activePageId !== "ai-assistant") {
                const activeStudentNav = document.querySelector(".student-nav-item.active");
                const tabId = activeStudentNav?.id === "nav-student-experience-item"
                    ? "experience"
                    : activeStudentNav?.id === "nav-student-visual-item"
                        ? "visual"
                        : activeStudentNav?.id === "nav-student-python-item"
                            ? "python"
                            : "route";
                Promise.resolve(
                    window.app?.resources?.openStudentLessonTab?.(tabId, activeStudentNav || document.getElementById("nav-student-lesson-item"))
                ).catch((error) => {
                    console.warn("打开课程任务中心失败:", error);
                });
            }
            teacherTabs.forEach((btn) => {
                const isPythonTab = btn.dataset.tab === "python";
                btn.style.display = allowPythonSetup && isPythonTab ? "inline-flex" : "none";
                if (!allowPythonSetup || !isPythonTab) btn.classList.remove("active");
            });
            teacherContents.forEach((section) => {
                const isPythonSection = section.dataset.settingsTab === "python";
                section.style.display = allowPythonSetup && isPythonSection ? "" : "none";
                if (!allowPythonSetup || !isPythonSection) section.classList.remove("active");
            });
        }
        if (!modeAlreadyApplied) {
            window.dispatchEvent(new CustomEvent("xedu:teacher-mode-changed", {
                detail: { isTeacher },
            }));
        }
    }

    return {
        updateSettingsVisibility,
    };
}
