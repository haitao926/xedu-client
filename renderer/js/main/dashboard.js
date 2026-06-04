function escapeHtml(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function createDashboardController({ showTab, showSettingsTab }) {
    function setDashboardQuickTab(tabName = "project") {
        const normalized = tabName === "classroom" ? "classroom" : "project";
        const tabs = document.querySelectorAll("[data-quick-tab]");
        const panes = document.querySelectorAll(".dashboard-quick-pane");
        tabs.forEach((tab) => {
            const isActive = tab.dataset.quickTab === normalized;
            tab.classList.toggle("is-active", isActive);
            tab.setAttribute("aria-selected", isActive ? "true" : "false");
        });
        panes.forEach((pane) => {
            const paneTab = pane.id?.replace("dashboard-quick-pane-", "") || "";
            pane.classList.toggle("is-active", paneTab === normalized);
        });
    }

    function buildClassroomBaseUrl(classroom) {
        const direct = (classroom?.base_url || "").trim();
        if (direct) return direct.replace(/\/$/, "");
        const host = (classroom?.host || "").trim();
        const port = classroom?.port;
        if (!host || !port) return "";
        return `http://${host}:${port}`;
    }

    function updateSettingsVisibility(isTeacher) {
        const settingsNavItem = document.getElementById("nav-settings-item");
        const resourcesNavItem = document.getElementById("nav-resources-item");
        const mainNavItem = document.getElementById("nav-main-item");
        const blocklyNavItem = document.getElementById("nav-blockly-item");
        const aiNavItem = document.getElementById("nav-ai-item");
        const systemGroupTitle = document.getElementById("nav-group-system-title");
        const settingsPage = document.getElementById("settings");
        const teacherTabs = document.querySelectorAll('.settings-tab[data-teacher-only="true"]');
        const teacherContents = document.querySelectorAll('.settings-content[data-teacher-only="true"]');
        const aboutTab = document.querySelector('.settings-tab[data-tab="about"]');
        const aboutContent = document.querySelector('.settings-content[data-settings-tab="about"]');

        if (isTeacher) {
            document.body.classList.remove("student-mode");
            document.body.classList.add("teacher-mode");
            setDashboardQuickTab("project");
            if (mainNavItem) mainNavItem.style.display = "flex";
            if (blocklyNavItem) blocklyNavItem.style.display = "flex";
            if (aiNavItem) aiNavItem.style.display = "flex";
            if (systemGroupTitle) {
                systemGroupTitle.style.display = "";
            }
            if (resourcesNavItem) {
                resourcesNavItem.style.display = "flex";
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
            const activeTab = document.querySelector(".settings-tab.active");
            if (!activeTab) {
                const aiTab = document.querySelector('.settings-tab[data-tab="ai"]');
                if (aiTab) {
                    showSettingsTab("ai");
                }
            }
        } else {
            document.body.classList.add("student-mode");
            document.body.classList.remove("teacher-mode");
            setDashboardQuickTab("classroom");
            if (mainNavItem) mainNavItem.style.display = "flex";
            if (blocklyNavItem) blocklyNavItem.style.display = "flex";
            if (aiNavItem) aiNavItem.style.display = "flex";
            if (systemGroupTitle) {
                systemGroupTitle.style.display = "none";
            }
            if (resourcesNavItem) {
                resourcesNavItem.style.display = "none";
                resourcesNavItem.classList.remove("active");
            }
            if (settingsNavItem) {
                settingsNavItem.style.display = "none";
                settingsNavItem.classList.remove("active");
            }
            if (settingsPage) {
                settingsPage.style.display = "none";
            }
            if (settingsPage?.classList.contains("active")) {
                showTab("main", mainNavItem);
            }
            const resourcesPage = document.getElementById("resources");
            if (resourcesPage?.classList.contains("active")) {
                showTab("main", mainNavItem);
            }
            teacherTabs.forEach((btn) => {
                btn.style.display = "none";
                btn.classList.remove("active");
            });
            teacherContents.forEach((section) => {
                section.style.display = "none";
                section.classList.remove("active");
            });
            if (aboutTab) {
                aboutTab.style.display = "inline-flex";
                aboutTab.classList.add("active");
            }
            if (aboutContent) {
                aboutContent.style.display = "";
                aboutContent.classList.add("active");
            }
        }
        window.dispatchEvent(new CustomEvent("xedu:teacher-mode-changed", {
            detail: { isTeacher },
        }));
    }

    function renderStudentClassroomList(classrooms = [], onEnter) {
        const listEl = document.getElementById("student-classroom-list");
        const emptyEl = document.getElementById("student-classroom-empty");
        if (!listEl || !emptyEl) return;

        listEl.innerHTML = "";
        if (!Array.isArray(classrooms) || classrooms.length === 0) {
            emptyEl.style.display = "block";
            emptyEl.textContent = "当前未发现课堂";
            return;
        }

        emptyEl.style.display = "none";
        classrooms.forEach((classroom) => {
            const card = document.createElement("button");
            card.type = "button";
            card.className = "dashboard-classroom-card";
            const count = Number(classroom?.course_count || 0);
            const activeTitle = (classroom?.active_course_title || "").trim();
            const meta = [];
            meta.push("<span>直接进入</span>");
            if (count > 0) meta.push(`<span>${count} 门课程</span>`);
            if (activeTitle) meta.push(`<span>${escapeHtml(activeTitle)}</span>`);

            card.innerHTML = `
                <div class="dashboard-classroom-card-head">
                    <div class="dashboard-classroom-card-title">${escapeHtml(classroom?.name || "课堂")}</div>
                    <span class="dashboard-classroom-card-badge">可进入</span>
                </div>
                <div class="dashboard-classroom-card-meta">${meta.join("")}</div>
                <div class="dashboard-classroom-card-action">
                    <span class="btn btn-primary btn-sm">进入课堂</span>
                </div>
            `;
            card.addEventListener("click", () => onEnter?.(classroom, card));
            listEl.appendChild(card);
        });
    }

    return {
        setDashboardQuickTab,
        buildClassroomBaseUrl,
        updateSettingsVisibility,
        renderStudentClassroomList,
    };
}
