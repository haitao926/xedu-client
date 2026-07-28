// 课程资源库页面
import apiClient from "./api.js";
import {
    getExperimentProgress,
    setExperimentProgress,
    getLastLearning,
    buildExperimentStateKey,
} from "./resources/learning-progress.js";
import {
    normalizeText,
    generateCourseId,
    escapeAttr,
    parseTags,
    normalizeTagsInput,
    getBaseName,
    deriveTitleFromPath,
    deriveTitleFromUrl,
    isPackageUrl,
} from "./resources/text-utils.js";
import {
    normalizeResourceSourceInput,
    sourceSignature,
    dedupeResourceSources,
    parseRepoUrlParts,
} from "./resources/source-utils.js";
import {
  connectStudentClassroomByCodeFlow,
  getStoredProjectDirFallback,
  normalizeClassroomAddress,
  prepareStudentClassroomLaunchFlow,
} from "./resources/classroom-connect.js";
import {
    buildExperimentFilesCard,
    buildCourseDirectoryCard,
} from "./resources/detail-renderer.js";
import {
    isCreateInfoCompleteFlow,
    updateCreateFormStateFlow,
} from "./resources/course-edit-state.js";
import {
    buildInspectCoursePayload,
    inspectCloudCourseOptionFlow,
    mergeInspectionCourse,
} from "./resources/course-inspection-actions.js";
import {
    applyResourcesIndexFlow,
    deleteCourseFlow,
    importRemoteCourseForTestingFlow,
    openExternalFlow,
    openLocalPathFlow,
    renderEmptyStateFlow,
    resolveLocalPathFlow,
    resolveRepoBrowserUrlFlow,
    updateSourceInfoFlow,
} from "./resources/course-actions.js";
import {
    addExperimentToSectionFlow,
    addSectionFlow,
    deleteExperimentFlow,
    deleteSectionFlow,
    editExperimentFlow,
    manageExperimentFlow,
    manageSectionFlow,
    renameSectionFlow,
} from "./resources/course-structure-actions.js";
import { loadResourcesIndexFlow } from "./resources/resource-index-flow.js";
import { bindResourcesUI } from "./resources/resource-bindings.js";
import {
    mapRemoteExperimentToLocalCourse,
    pickAutoTestEntry,
} from "./resources/course-inspection-utils.js";
import {
    STUDENT_WORKSPACE_TABS,
    getStudentVisibleLessonContexts,
    getStudentWorkspaceEmptyText,
    getStudentWorkspaceFilesForOverview,
    getStudentWorkspacePageClass,
    getStudentWorkspaceTabConfig,
    getStudentWorkspaceTabDescription,
    getStudentWorkspaceTabTitle,
    normalizeStudentWorkspaceTabId,
    pickFirstExperimentWithFiles,
    selectStudentCurrentCourse,
    shouldHideJupyterForStudentTab,
} from "./resources/student-workspace-utils.js";
import {
    buildCourseSyncFingerprint,
    importDroppedCourseSourceFlow,
    getCourseOrigin,
    getLocalCourseChangeState,
    getResourceSourceContext,
    normalizeOrigin,
    persistCourseToDisk,
    persistLocalCourses,
    resolveResourceUrl,
    stripRemovedIntegrationMetadata,
    withCourseSyncFingerprint,
} from "./resources/course-storage.js";
import { runCourseTransferFlow } from "./resources/course-transfer.js";
import {
    addCourseFlow,
    buildCourseFromFormFlow,
    buildQuickCourseFlow,
    fetchCloudCourseFlow,
    fillCreateFormFromCourseFlow,
    importCloudCourseAndSaveFlow,
    importLocalPackageToPathFlow,
    importLocalCourseFromPathFlow,
    pickLocalCourseFlow,
    pickLocalPackageFlow,
    quickAddCloudCourseFlow,
    quickAddLocalCourseFlow,
    saveLocalCourseFlow,
    updateCourseFlow,
} from "./resources/course-create-flow.js";
import {
    computeAutoCourseId,
    buildDefaultTemplate,
    buildQuickCoursePayload,
    buildCourseFromFormPayload,
} from "./resources/course-create-utils.js";
import {
    importRemoteCourseFlow,
    mergeOriginAndSync,
    publishCourseFromDetailFlow,
    pullLatestForLocalCourseFlow,
    upsertLocalCourseRecord,
} from "./resources/course-sync.js";
import {
    extractResourcesFromClassroomIndex,
    findFirstNotebookPathInCourse,
    pickClassroomLaunchResource,
    resolveClassroomPullTargetPath,
} from "./resources/classroom-utils.js";
import { getExperienceMode, getTeacherToggleLabel } from "./experience-config.js";
import {
    clearTeacherModeSession,
    isTeacherCodeConfigured,
    readTeacherModeState,
    rememberTeacherMode,
} from "./main/teacher-mode-state.js";
import {
    buildLocalCourseFileUrl,
    getEntryKindForFile,
    isBlocklyFile,
    isDirectory,
    isHtmlFile,
    isNotebookFile,
    isPythonScriptFile,
    isScratchFile,
    normalizeFile,
    resolveJupyterWorkspaceTarget,
    sortFiles,
} from "./resources/file-utils.js";
import { getExperimentFileOverview } from "./resources/experiment-overview.js";
import { createResourcesState } from "./resources/resources-state.js";
import { getPathForFileWithDesktopBridge } from "./resources/desktop-bridge.js";
import { createCourseAiFrameBridge } from "./resources/course-ai-bridge.js";

const resourcesState = createResourcesState();
const courseAiFrameBridge = createCourseAiFrameBridge({
    windowObject: window,
    requestApi: (request) => {
        if (typeof window.electronAPI?.scratchApiRequest !== "function") {
            throw new Error("本地姿态检测桥接不可用");
        }
        return window.electronAPI.scratchApiRequest(request);
    },
});
window.addEventListener("xedu:teacher-credential-updated", () => {
    const state = readTeacherModeState();
    if (!state.unlocked) return;
    resourcesState.teacherMode = state;
    resourcesState.classroomConfig.teacherCodeConfigured = true;
    updateTeacherModeUI();
});
window.addEventListener("xedu:teacher-credential-cleared", () => {
    resourcesState.teacherMode = { unlocked: false, code: "" };
    resourcesState.classroomConfig.teacherCodeConfigured = false;
    updateTeacherModeUI();
});
const pageState = {
    current: 1,
    size: 6
};

const sectionGridSize = 6;
const courseWorkspaceTabs = STUDENT_WORKSPACE_TABS;

const createRequiredFields = ["resources-create-title"];
const createFieldLabels = {
    "resources-create-title": "课程名称",
    "resources-create-desc": "课程描述",
    "resources-create-grade": "年级",
    "resources-create-subject": "学科",
    "resources-create-cover": "封面图片"
};

const EXPERIMENT_PLACEHOLDER_URL = new URL(
    "../assets/experiment-cover-16x9.svg",
    import.meta.url
).href;
const COURSE_PLACEHOLDER_URL = new URL(
    "../assets/course-cover-16x9.svg",
    import.meta.url
).href;

const mockResourcesIndex = {
    version: "mock-1.0",
    updated_at: "2026-02-26",
    resources: []
};

const localCoursesKey = "xedu_local_courses";
const classroomSelectionKey = "xedu_classroom_selection";
const classroomManualAddressKey = "xedu_classroom_manual_address";
const clearDemoCourseBindingMigrationKey = "xedu_clear_demo_course_binding_v1";

function notifyUser(message, level = "info") {
    const text = String(message || "");
    if (typeof window.app?.ui?.showToast === "function") {
        window.app.ui.showToast(text, level);
        return;
    }
    window.alert(text);
}

const filterState = {
    query: "",
    grade: "",
    subject: "",
    tag: ""
};

const resourcesModalState = {
    resolve: null,
    cleanup: null,
};

function getResourcesActionModalElements() {
    const modal = document.getElementById("resources-action-modal");
    const titleEl = document.getElementById("resources-action-title");
    const messageEl = document.getElementById("resources-action-message");
    const bodyEl = document.getElementById("resources-action-body");
    const errorEl = document.getElementById("resources-action-error");
    const confirmBtn = document.getElementById("resources-action-confirm");
    const cancelBtn = document.getElementById("resources-action-cancel");
    return {
        modal,
        titleEl,
        messageEl,
        bodyEl,
        errorEl,
        confirmBtn,
        cancelBtn,
    };
}

function cleanupResourcesActionModal() {
    if (typeof resourcesModalState.cleanup === "function") {
        resourcesModalState.cleanup();
    }
    resourcesModalState.cleanup = null;
}

function finishResourcesActionModal(result) {
    const resolve = resourcesModalState.resolve;
    resourcesModalState.resolve = null;
    cleanupResourcesActionModal();
    if (resolve) {
        resolve(result);
    }
}

function buildResourcesFormField(field) {
    const wrap = document.createElement("div");
    wrap.className = "resources-action-field";
    const label = document.createElement("label");
    label.className = "input-label";
    label.textContent = field.label || field.name;
    wrap.appendChild(label);

    let input = null;
    const type = field.type || "text";
    if (type === "select") {
        input = document.createElement("select");
        input.className = "form-control";
        const options = Array.isArray(field.options) ? field.options : [];
        options.forEach((option) => {
            const opt = document.createElement("option");
            opt.value = option.value;
            opt.textContent = option.label;
            if (field.value !== undefined && String(field.value) === String(option.value)) {
                opt.selected = true;
            }
            input.appendChild(opt);
        });
    } else if (type === "checkbox") {
        const checkboxRow = document.createElement("label");
        checkboxRow.className = "resources-action-checkbox";
        input = document.createElement("input");
        input.type = "checkbox";
        input.checked = Boolean(field.value);
        const text = document.createElement("span");
        text.textContent = field.checkboxLabel || field.placeholder || "";
        checkboxRow.appendChild(input);
        checkboxRow.appendChild(text);
        wrap.appendChild(checkboxRow);
        return { wrap, input };
    } else if (type === "textarea") {
        input = document.createElement("textarea");
        input.className = "form-control";
        input.rows = field.rows || 3;
        input.value = field.value || "";
    } else {
        input = document.createElement("input");
        input.className = "form-control";
        input.type = type;
        input.value = field.value || "";
    }

    if (field.placeholder && input) {
        input.placeholder = field.placeholder;
    }
    if (field.name) {
        input.dataset.fieldName = field.name;
    }
    wrap.appendChild(input);
    return { wrap, input };
}

function collectResourcesFormValues(fieldDefs, inputsMap) {
    const values = {};
    fieldDefs.forEach((field) => {
        const input = inputsMap.get(field.name);
        if (!input) return;
        if (field.type === "checkbox") {
            values[field.name] = Boolean(input.checked);
            return;
        }
        values[field.name] = (input.value || "").toString();
    });
    return values;
}

async function openResourcesForm({
    title = "提示",
    message = "",
    confirmText = "确定",
    cancelText = "取消",
    fields = [],
    validate = null,
}) {
    const { modal, titleEl, messageEl, bodyEl, errorEl, confirmBtn, cancelBtn } = getResourcesActionModalElements();
    if (!modal || !titleEl || !messageEl || !bodyEl || !errorEl || !confirmBtn || !cancelBtn) {
        return { confirmed: false, values: {} };
    }

    if (resourcesModalState.resolve) {
        finishResourcesActionModal({ confirmed: false, values: {} });
    }

    titleEl.textContent = title;
    messageEl.textContent = message || "";
    messageEl.style.display = message ? "block" : "none";
    bodyEl.innerHTML = "";
    errorEl.textContent = "";
    errorEl.style.display = "none";
    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;

    const inputsMap = new Map();
    fields.forEach((field) => {
        const built = buildResourcesFormField(field);
        if (!built) return;
        bodyEl.appendChild(built.wrap);
        if (field.name && built.input) {
            inputsMap.set(field.name, built.input);
        }
    });

    modal.classList.add("show");

    const closeAsCancel = () => finishResourcesActionModal({ confirmed: false, values: {} });
    const onModalClick = (event) => {
        if (event.target === modal) {
            closeAsCancel();
        }
    };
    const onKeyDown = (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            closeAsCancel();
            return;
        }
        if (event.key === "Enter") {
            const target = event.target;
            if (target && target.tagName === "TEXTAREA") return;
            event.preventDefault();
            confirmBtn.click();
        }
    };

    const onCancel = () => closeAsCancel();
    const onConfirm = async () => {
        const values = collectResourcesFormValues(fields, inputsMap);
        for (const field of fields) {
            if (!field.required) continue;
            const value = values[field.name];
            if (field.type === "checkbox") continue;
            if ((value || "").toString().trim().length === 0) {
                errorEl.textContent = `${field.label || field.name}不能为空`;
                errorEl.style.display = "block";
                const input = inputsMap.get(field.name);
                if (input) input.focus();
                return;
            }
        }
        if (typeof validate === "function") {
            const validationMsg = await validate(values);
            if (validationMsg) {
                errorEl.textContent = validationMsg;
                errorEl.style.display = "block";
                return;
            }
        }
        finishResourcesActionModal({ confirmed: true, values });
    };

    cancelBtn.addEventListener("click", onCancel);
    confirmBtn.addEventListener("click", onConfirm);
    modal.addEventListener("click", onModalClick);
    document.addEventListener("keydown", onKeyDown, true);

    resourcesModalState.cleanup = () => {
        modal.classList.remove("show");
        cancelBtn.removeEventListener("click", onCancel);
        confirmBtn.removeEventListener("click", onConfirm);
        modal.removeEventListener("click", onModalClick);
        document.removeEventListener("keydown", onKeyDown, true);
    };

    const firstInput = fields.length ? inputsMap.get(fields[0].name) : null;
    if (firstInput) {
        window.setTimeout(() => firstInput.focus(), 0);
    } else {
        window.setTimeout(() => confirmBtn.focus(), 0);
    }

    return new Promise((resolve) => {
        resourcesModalState.resolve = resolve;
    });
}

async function openResourcesConfirm({
    title = "确认操作",
    message = "",
    confirmText = "确定",
    cancelText = "取消",
}) {
    const result = await openResourcesForm({ title, message, confirmText, cancelText, fields: [] });
    return Boolean(result?.confirmed);
}

async function openResourcesInput({
    title = "请输入",
    message = "",
    label = "内容",
    placeholder = "",
    defaultValue = "",
    secret = false,
    required = true,
    confirmText = "确定",
    cancelText = "取消",
}) {
    const result = await openResourcesForm({
        title,
        message,
        confirmText,
        cancelText,
        fields: [
            {
                name: "value",
                label,
                type: secret ? "password" : "text",
                placeholder,
                value: defaultValue || "",
                required,
            },
        ],
    });
    if (!result?.confirmed) return null;
    return (result.values?.value || "").toString();
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function resolveCreateCoverPreviewUrl(coverValue = "", resource = {}) {
    const cover = (coverValue || "").toString().trim();
    if (!cover) return "";
    if (
        cover.startsWith("http://") ||
        cover.startsWith("https://") ||
        cover.startsWith("data:") ||
        cover.startsWith("blob:")
    ) {
        return cover;
    }
    if (cover.startsWith("file://")) return "";
    return buildLocalCourseFileUrl(resource, cover, apiClient);
}

function updateCreateCoverPreview() {
    const coverInput = document.getElementById("resources-create-cover");
    const localPathInput = document.getElementById("resources-create-local-path");
    const coverPreview = document.getElementById("resources-cover-preview");
    const coverPreviewImg = document.getElementById("resources-cover-preview-img");
    if (!coverPreview || !coverPreviewImg) return;
    const course = resourcesState.scannedCourse
        || resourcesState.localCourses.find((item) => item?.id === resourcesState.editingCourseId)
        || {};
    const previewUrl = resolveCreateCoverPreviewUrl(coverInput?.value || "", {
        ...course,
        local_path: localPathInput?.value || course.local_path || "",
    });
    if (previewUrl) {
        coverPreviewImg.src = previewUrl;
        coverPreview.style.display = "flex";
        return;
    }
    coverPreviewImg.src = "";
    coverPreview.style.display = "none";
}

async function applyCoverFile(file) {
    if (!file) return;
    try {
        const dataUrl = await readFileAsDataUrl(file);
        const createCoverInput = document.getElementById("resources-create-cover");
        if (createCoverInput) {
            createCoverInput.value = dataUrl;
        }
        updateCreateCoverPreview();
        updateCreateFormState();
    } catch (error) {
        console.warn("读取封面失败:", error);
    }
}

function maybeAutoFillCourseId() {
    const idInput = document.getElementById("resources-create-id");
    if (!idInput || idInput.value.trim()) return;
    const title = document.getElementById("resources-create-title")?.value.trim();
    const nextId = computeAutoCourseId({
        currentValue: idInput.value,
        scannedCourseId: resourcesState.scannedCourse?.id || "",
        title,
        generateCourseId,
    });
    if (nextId) {
        idInput.value = nextId;
    }
}

function getCreateMetaFromForm() {
    const title = document.getElementById("resources-create-title")?.value.trim() || "";
    const description = document.getElementById("resources-create-desc")?.value.trim() || "";
    const grade = document.getElementById("resources-create-grade")?.value.trim() || "";
    const subject = document.getElementById("resources-create-subject")?.value.trim() || "";
    const author = document.getElementById("resources-create-author")?.value.trim() || "";
    const version = document.getElementById("resources-create-version")?.value.trim() || "";
    const tags = parseTags(document.getElementById("resources-create-tags")?.value || "");
    const coverDataUrl = document.getElementById("resources-create-cover")?.value || "";
    const courseId = document.getElementById("resources-create-id")?.value.trim() || "";
    return {
        title,
        description,
        grade,
        subject,
        author,
        version,
        tags,
        coverDataUrl,
        courseId
    };
}

function getCreateRequiredFields() {
    if (resourcesState.createSource === "cloud" || resourcesState.createEntryMode === "pack-import") return [];
    return createRequiredFields;
}

function isStep1Complete() {
    if (resourcesState.createSource === "cloud" || resourcesState.createEntryMode === "pack-import") {
        return true;
    }
    return getCreateRequiredFields().every((fieldId) => {
        const value = document.getElementById(fieldId)?.value || "";
        return value.trim().length > 0;
    });
}

function isStep2Complete() {
    if (resourcesState.createSource === "cloud" || resourcesState.createEntryMode === "pack-import") {
        return Boolean(resourcesState.scannedCourse && !resourcesState.scanError);
    }
    // Local creation: step 2 is optional and should not block navigation.
    return true;
}
function getSectionStats() {
    const sections = getEffectiveSections();
    const sectionCount = sections?.length || 0;
    const experimentCount = sections?.reduce((sum, sec) => sum + (sec.experiments?.length || 0), 0) || 0;
    return { sectionCount, experimentCount };
}

function getEffectiveSections() {
    if (resourcesState.scannedCourse && Array.isArray(resourcesState.scannedCourse.sections)) {
        return resourcesState.scannedCourse.sections;
    }
    return Array.isArray(resourcesState.draftSections) ? resourcesState.draftSections : [];
}

function buildDefaultSingleSection() {
    return [
        {
            title: "第 1 课",
            description: "",
            experiments: [
                {
                    title: "实验 1",
                    description: "",
                    files: []
                }
            ]
        }
    ];
}

function ensureMinimumSections(sections) {
    if (Array.isArray(sections) && sections.length) {
        return sections;
    }
    return buildDefaultSingleSection();
}

function countExperimentsInSections(sections) {
    if (!Array.isArray(sections)) return 0;
    return sections.reduce((sum, section) => sum + ((section?.experiments || []).length || 0), 0);
}

function setCloudSourcesStatus(message, isError = false) {
    const status = document.getElementById("resources-sources-status");
    if (!status) return;
    status.textContent = message || "";
    status.classList.toggle("error", Boolean(isError));
}

function renderResourceSourcesList(sources = resourcesState.cloudSourceRows) {
    const container = document.getElementById("resources-sources-list");
    if (!container) return;
    container.innerHTML = "";

    const rows = Array.isArray(sources) ? sources : [];
    if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "resources-create-hint";
        empty.textContent = "当前未添加附加课程源。";
        container.appendChild(empty);
        return;
    }

    rows.forEach((source, index) => {
        const normalized = normalizeResourceSourceInput(source, `课程源${index + 1}`, source.id || `source-${index + 1}`);
        const item = document.createElement("div");
        item.className = "resources-source-item";
        item.dataset.sourceId = normalized.id || `source-${index + 1}`;
        item.style.display = "grid";
        item.style.gridTemplateColumns = "1.2fr 1.6fr 1.4fr 0.9fr 1fr auto auto";
        item.style.gap = "6px";
        item.style.alignItems = "center";
        item.innerHTML = `
            <input class="form-control resources-source-name" placeholder="名称" value="${escapeAttr(normalized.name)}">
            <input class="form-control resources-source-base" placeholder="资源库地址" value="${escapeAttr(normalized.base_url)}">
            <input class="form-control resources-source-repo" placeholder="owner/repo" value="${escapeAttr(normalized.repo)}">
            <input class="form-control resources-source-branch" placeholder="分支" value="${escapeAttr(normalized.branch)}">
            <input class="form-control resources-source-index" placeholder="索引文件" value="${escapeAttr(normalized.index_path)}">
            <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-secondary);"><input type="checkbox" class="resources-source-enabled" ${normalized.enabled ? "checked" : ""}>启用</label>
            <button type="button" class="btn btn-secondary resources-source-remove">删除</button>
        `;

        const removeBtn = item.querySelector(".resources-source-remove");
        if (removeBtn) {
            removeBtn.addEventListener("click", () => {
                item.remove();
                resourcesState.cloudSourceRows = collectResourceSourcesFromUI();
                if (!resourcesState.cloudSourceRows.length) {
                    renderResourceSourcesList(resourcesState.cloudSourceRows);
                }
            });
        }
        container.appendChild(item);
    });
}

function collectResourceSourcesFromUI() {
    const rows = Array.from(document.querySelectorAll("#resources-sources-list .resources-source-item"));
    const sources = rows.map((row, index) => normalizeResourceSourceInput(
        {
            id: row.dataset.sourceId || `source-${index + 1}`,
            name: row.querySelector(".resources-source-name")?.value || "",
            base_url: row.querySelector(".resources-source-base")?.value || "",
            repo: row.querySelector(".resources-source-repo")?.value || "",
            branch: row.querySelector(".resources-source-branch")?.value || "",
            index_path: row.querySelector(".resources-source-index")?.value || "",
            enabled: row.querySelector(".resources-source-enabled")?.checked !== false
        },
        `课程源${index + 1}`,
        row.dataset.sourceId || `source-${index + 1}`
    ));
    return dedupeResourceSources(sources);
}

async function loadResourceSourcesConfig(force = false) {
    if (resourcesState.cloudSourcesLoaded && !force) return;
    try {
        const response = await apiClient.loadConfig();
        if (!response?.success) {
            throw new Error(response?.message || "读取配置失败");
        }
        const uiConfig = response.config?.ui || {};
        const defaultSource = normalizeResourceSourceInput(
            {
                id: "default",
                name: "默认课程源",
                base_url: uiConfig.resources_base_url || "",
                repo: uiConfig.resources_repo || "",
                branch: uiConfig.resources_branch || "main",
                index_path: uiConfig.resources_index_path || "index.json",
                enabled: true
            },
            "默认课程源",
            "default"
        );
        resourcesState.defaultCloudSourceConfigured = Boolean(defaultSource.base_url && defaultSource.repo);
        const defaultSignature = sourceSignature(defaultSource);
        const savedSources = Array.isArray(uiConfig.resources_sources) ? uiConfig.resources_sources : [];
        resourcesState.cloudSourceRows = dedupeResourceSources(
            savedSources
                .map((item, index) => normalizeResourceSourceInput(item, item.name || `课程源${index + 1}`, item.id || `source-${index + 1}`))
                .filter((item) => item.base_url && item.repo && sourceSignature(item) !== defaultSignature)
        );
        renderResourceSourcesList(resourcesState.cloudSourceRows);
        resourcesState.cloudSourcesLoaded = true;
        if (!resourcesState.defaultCloudSourceConfigured) {
            setCloudSourcesStatus("未配置默认课程源，可直接在上方输入课程仓库地址读取。");
        } else if (resourcesState.cloudSourceRows.length) {
            setCloudSourcesStatus(`已配置 ${resourcesState.cloudSourceRows.length} 个附加课程源。`);
        } else {
            setCloudSourcesStatus("当前仅使用默认课程源。");
        }
    } catch (error) {
        console.warn("加载附加课程源失败:", error);
        resourcesState.cloudSourceRows = [];
        renderResourceSourcesList(resourcesState.cloudSourceRows);
        resourcesState.cloudSourcesLoaded = false;
        resourcesState.defaultCloudSourceConfigured = false;
        setCloudSourcesStatus("读取课程源配置失败，请稍后重试。", true);
    } finally {
        updateCloudSourceActionUI();
    }
}

function addResourceSourceRow() {
    resourcesState.cloudSourceRows = collectResourceSourcesFromUI();
    resourcesState.cloudSourceRows.push({
        id: `source-${Date.now()}`,
        name: "",
        base_url: "",
        repo: "",
        branch: "main",
        index_path: "index.json",
        enabled: true
    });
    renderResourceSourcesList(resourcesState.cloudSourceRows);
}

async function saveResourceSourcesConfig() {
    const saveBtn = document.getElementById("resources-save-sources-btn");
    resourcesState.cloudSourceRows = collectResourceSourcesFromUI();
    if (saveBtn) saveBtn.disabled = true;
    try {
        await apiClient.saveConfig({
            ui: {
                resources_sources: resourcesState.cloudSourceRows
            }
        });
        setCloudSourcesStatus(
            resourcesState.cloudSourceRows.length ? `已保存 ${resourcesState.cloudSourceRows.length} 个附加课程源。` : "已清空附加课程源，仅保留默认课程源。"
        );
        setCloudStatus("课程源已保存，正在刷新云端课程列表...");
        resourcesState.cloudSourcesLoaded = true;
        await loadCloudCourseOptions();
    } catch (error) {
        console.warn("保存课程源配置失败:", error);
        setCloudSourcesStatus(`保存失败：${error?.message || "未知错误"}`, true);
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function normalizeCloudCourseOptions(indexData) {
    const raw = Array.isArray(indexData?.resources)
        ? indexData.resources
        : Array.isArray(indexData)
            ? indexData
            : [];
    return raw
        .map((item) => ({
            id: item.id || "",
            title: item.title || "未命名课程",
            description: item.description || "",
            grade: item.grade || "",
            subject: item.subject || "",
            author: item.author || "",
            version: item.version || "",
            updated_at: item.updated_at || "",
            tags: Array.isArray(item.tags) ? item.tags : [],
            cover_url: item.cover_url || item.cover || "",
            course_url: item.course_url || "",
            package_url: item.package_url || "",
            sections: Array.isArray(item.sections) ? item.sections : [],
            source_id: item._source_id || "",
            source_name: item._source_name || "",
            source_repo_url: item._source_repo_url || "",
            source_raw_base_url: item._source_raw_base_url || "",
            source_branch: item._source_branch || "",
            single_course_repo: Boolean(item.single_course_repo)
        }))
        .filter((item) => item.package_url || item.course_url);
}

function buildSourceOverrideFromCourseMeta(courseLike = {}) {
    const { base_url, repo } = parseRepoUrlParts(courseLike.source_repo_url || courseLike._source_repo_url || "");
    return normalizeOrigin({
        source_id: courseLike.source_id || courseLike._source_id || "override",
        base_url:
            base_url ||
            ((courseLike.source_raw_base_url || courseLike._source_raw_base_url || "").toString().replace(/\/raw\/[^/]+$/, "")),
        repo,
        branch: courseLike.source_branch || courseLike._source_branch || "main",
        course_id: courseLike.id || "",
        course_url: courseLike.course_url || "",
        package_url: courseLike.package_url || "",
        single_course_repo: Boolean(courseLike.single_course_repo),
    });
}

function setCloudStatus(message, isError = false) {
    ["resources-cloud-status", "resources-cloud-detail-status"].forEach((id) => {
        const status = document.getElementById(id);
        if (!status) return;
        status.textContent = message || "";
        status.classList.toggle("error", Boolean(isError));
        status.classList.toggle("success", Boolean(message) && !isError);
    });
}

function updateCloudSourceActionUI() {
    const loadBtn = document.getElementById("resources-cloud-temp-load-btn");
    const clearBtn = document.getElementById("resources-cloud-temp-clear-btn");
    const addressInput = document.getElementById("resources-cloud-repo-address");
    const tokenInput = document.getElementById("resources-cloud-temp-token");
    const hasAddress = Boolean((addressInput?.value || "").trim());
    const hasToken = Boolean((tokenInput?.value || "").trim());
    const usingCustomSource = Boolean(resourcesState.cloudTempSource);

    if (loadBtn) {
        if (hasAddress) {
            loadBtn.textContent = "读取当前仓库";
        } else if (resourcesState.defaultCloudSourceConfigured) {
            loadBtn.textContent = "读取默认课程源";
        } else {
            loadBtn.textContent = "读取课程";
        }
    }

    if (clearBtn) {
        clearBtn.textContent = usingCustomSource ? "返回默认课程源" : "清空地址";
        clearBtn.style.display = hasAddress || hasToken || usingCustomSource ? "inline-flex" : "none";
        clearBtn.disabled = !hasAddress && !hasToken && !usingCustomSource;
    }
}

function renderLocalPathSummary() {
    const summary = document.getElementById("resources-local-path-summary");
    const caption = document.getElementById("resources-local-path-caption");
    const input = document.getElementById("resources-create-local-path");
    if (!summary || !caption || !input) return;

    const localPath = (input.value || "").trim();
    const isCloud = resourcesState.createSource === "cloud";
    const isPackImport = resourcesState.createEntryMode === "pack-import";
    caption.textContent = isCloud || isPackImport ? "导入后保存位置" : "课程目录位置";

    if (!localPath) {
        summary.innerHTML = isCloud
            ? "将自动保存到默认课程目录。"
            : isPackImport
                ? "将自动保存到默认课程目录。"
                : "这里选择的是整门课程根目录；没有 course.json 也可以先选目录再初始化。";
        return;
    }

    const parts = localPath.split(/[\\/]/).filter(Boolean);
    const name = parts[parts.length - 1] || localPath;
    summary.innerHTML = isCloud
        ? `将导入到 <strong>${escapeAttr(name)}</strong> 目录。`
        : isPackImport
            ? `课程包将导入到 <strong>${escapeAttr(name)}</strong> 目录。`
            : `当前课程根目录：<strong>${escapeAttr(name)}</strong>。后续每个实验再单独选择材料文件夹。`;
}

function renderPackagePathSummary() {
    const summary = document.getElementById("resources-package-path-summary");
    const input = document.getElementById("resources-create-package-path");
    const droppedFile = document.getElementById("resources-package-drop-file");
    if (!summary || !input) return;

    const packagePath = (input.value || "").trim();
    if (!packagePath) {
        summary.innerHTML = "未选择课程包。";
        if (droppedFile) droppedFile.textContent = "尚未选择文件";
        return;
    }

    const parts = packagePath.split(/[\\/]/).filter(Boolean);
    const name = parts[parts.length - 1] || packagePath;
    summary.innerHTML = `当前课程包：<strong>${escapeAttr(name)}</strong>。`;
    if (droppedFile) droppedFile.textContent = name;
}

async function importDroppedCourseZipPackage(packagePath) {
    return runCourseTransferFlow({
        apiClient,
        endpoint: "/api/resources/import-package-local",
        payload: {
            package_path: packagePath,
            target_path: "",
            replace_existing: true,
            backup_before_replace: true,
        },
        setImportStatus: setResourceDropImportStatus,
        pollIntervalMs: 500,
    });
}

async function handleCourseImportDrop(event) {
    event.preventDefault();
    const files = Array.from(event?.dataTransfer?.files || []);
    if (files.length !== 1) {
        setResourceDropImportStatus("error", "请一次拖入一个课程 ZIP 或完整课程文件夹");
        return false;
    }

    const [file] = files;
    let path = "";
    try {
        path = await getPathForFileWithDesktopBridge(file, window.electronAPI);
    } catch (_) {
        path = file?.path || "";
    }
    if (!path) {
        setResourceDropImportStatus("error", "无法读取拖入项目的本地路径，请重试");
        return false;
    }

    try {
        await window.electronAPI?.approveLocalPath?.(path);
    } catch (_) {
        // The backend still validates the course path; approval is only needed
        // for the Electron directory check.
    }

    let isDirectory = false;
    try {
        if (typeof window.electronAPI?.isDirectory === "function") {
            isDirectory = Boolean(await window.electronAPI.isDirectory(path));
        }
    } catch (_) {
        isDirectory = false;
    }
    if (!isDirectory && !/\.zip$/i.test(path)) {
        setResourceDropImportStatus("error", "仅支持拖入课程 ZIP 或完整课程文件夹");
        return false;
    }

    try {
        const result = await importDroppedCourseSourceFlow({ path, isDirectory }, {
            apiClient,
            importZipCoursePackage: importDroppedCourseZipPackage,
            addCourse: (course, options = {}) => addCourse(course, options),
            loadResourcesIndex,
            showListView,
            showDetailView,
            setImportStatus: setResourceDropImportStatus,
        });
        notifyUser(result.message, result.duplicated ? "warning" : "success");
        return true;
    } catch (error) {
        const message = error?.message || "导入课程失败";
        setResourceDropImportStatus("error", message);
        notifyUser(message, "error");
        return false;
    }
}

async function handlePackageDrop(event) {
    const files = Array.from(event?.dataTransfer?.files || []);
    if (files.length !== 1) {
        setCreateImportStatus("error", "请一次拖入一个 ZIP 课程包");
        return false;
    }

    const [file] = files;
    if (!/\.zip$/i.test(file?.name || "")) {
        setCreateImportStatus("error", "仅支持完整的 ZIP 课程包");
        return false;
    }

    let packagePath = "";
    try {
        packagePath = await getPathForFileWithDesktopBridge(file, window.electronAPI);
    } catch (_) {
        packagePath = "";
    }
    if (!packagePath) {
        setCreateImportStatus("error", "无法读取该文件路径，请使用“选择 ZIP”导入");
        return false;
    }

    const packagePathInput = document.getElementById("resources-create-package-path");
    if (!packagePathInput) return false;
    packagePathInput.value = packagePath;
    renderPackagePathSummary();
    updateCreateFormState();
    return importLocalPackageToPath();
}

async function useDefaultSampleCourse() {
    try {
        const response = await apiClient.get("/api/resources/default-sample");
        if (!response?.success || !response?.sample?.path) {
            throw new Error(response?.message || "默认测试样例不可用");
        }
        const packagePathInput = document.getElementById("resources-create-package-path");
        if (packagePathInput) {
            packagePathInput.value = response.sample.path;
        }
        renderPackagePathSummary();
        updateCreateFormState();
        alert(`已填入默认测试样例：${response.sample.course?.title || response.sample.label || "默认测试样例"}`);
    } catch (error) {
        alert(error.message || "读取默认测试样例失败");
    }
}

function renderLocalStructureSummary() {
    const intro = document.getElementById("resources-local-structure-intro");
    const summary = document.getElementById("resources-local-structure-summary");
    if (!summary || !intro) return;
    if (resourcesState.createSource === "cloud" || resourcesState.createEntryMode === "pack-import") {
        intro.style.display = "none";
        intro.innerHTML = "";
        summary.style.display = "none";
        summary.innerHTML = "";
        return;
    }
    const { sectionCount, experimentCount } = getSectionStats();
    const localPath = document.getElementById("resources-create-local-path")?.value.trim() || "";
    const structureInitialized = Boolean(localPath && resourcesState.scannedCourse);
    intro.style.display = "block";
    if (!localPath) {
        intro.innerHTML = `
            <div class="resources-local-structure-intro-title">先选课程根目录</div>
            <div class="resources-local-structure-intro-text">先选整门课程根目录；如果没有 course.json，系统会在初始化时补上。</div>
        `;
    } else if (!structureInitialized) {
        intro.innerHTML = `
            <div class="resources-local-structure-intro-title">准备创建第一节课</div>
            <div class="resources-local-structure-intro-text">课程根目录已选，下一步开始补课节和实验结构。</div>
        `;
    } else {
        intro.innerHTML = `
            <div class="resources-local-structure-intro-title">设计你的第一节课</div>
            <div class="resources-local-structure-intro-text">先列出这一节的实验，之后再为每个实验绑定自己的材料文件夹。</div>
        `;
    }
    summary.style.display = "grid";
    summary.innerHTML = `
        <div class="resources-local-structure-stat">
            <strong>${sectionCount}</strong>
            <span>课节</span>
        </div>
        <div class="resources-local-structure-stat">
            <strong>${experimentCount}</strong>
            <span>实验</span>
        </div>
    `;
}

function shouldShowCloudLocalPathPanel() {
    const selectedValue = document.getElementById("resources-cloud-course-select")?.value || "";
    const localPath = document.getElementById("resources-create-local-path")?.value.trim() || "";
    return Boolean(selectedValue || localPath || resourcesState.scannedCourse || resourcesState.cloudImported);
}

function updateLocalPathVisibility() {
    const localGroup = document.getElementById("resources-local-group");
    if (!localGroup) return;
    if (resourcesState.createEntryMode === "pack-import") {
        localGroup.style.display = "none";
        return;
    }
    if (resourcesState.createSource !== "cloud") {
        localGroup.style.display = "block";
        return;
    }
    localGroup.style.display = shouldShowCloudLocalPathPanel() ? "block" : "none";
}

function updateCreateStep3UI() {
    const stepLabel1 = document.getElementById("resources-step-label-1");
    const stepLabel2 = document.getElementById("resources-step-label-2");
    const stepLabel3 = document.getElementById("resources-step-label-3");
    const mainTitle = document.getElementById("resources-step3-main-title");
    const mainHint = document.getElementById("resources-step3-main-hint");
    const structureTitle = document.getElementById("resources-step3-structure-title");
    const actionTitle = document.getElementById("resources-step3-action-title");
    const publishBtn = document.getElementById("resources-publish-btn");
    const saveBtn = document.getElementById("resources-create-save-btn");
    const statusEl = document.getElementById("resources-publish-status");
    const packImportMode = resourcesState.createEntryMode === "pack-import";

    if (resourcesState.createSource === "cloud") {
        if (stepLabel1) {
            stepLabel1.textContent = "1 课程仓库";
            stepLabel1.style.display = "none";
        }
        if (stepLabel2) stepLabel2.textContent = "1 云端导入";
        if (stepLabel3) stepLabel3.style.display = "none";
        if (mainTitle) mainTitle.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>课程内容`;
        if (mainHint) mainHint.textContent = "当前仓库课程会按现有文件结构自动导入到默认课程目录，无需手动选文件夹，也无需重新上传材料文件夹。";
        if (structureTitle) structureTitle.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>导入结构`;
        if (actionTitle) actionTitle.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><path d="M21.5 12H16c-.7 2-2 3-4 3s-3.3-1-4-3H2.5"></path><path d="M5.5 5.1L2 12v6c0 1.1.9 2 2 2h16a2 2 0 002-2v-6l-3.4-6.9A2 2 0 0016.8 4H7.2a2 2 0 00-1.8 1.1z"></path></svg>保存到本地`;
        if (publishBtn) publishBtn.style.display = "none";
        if (saveBtn) saveBtn.textContent = "导入并保存";
        if (statusEl && resourcesState.publishStatus === "idle") statusEl.textContent = "准备导入";
        return;
    }

    if (stepLabel1) {
        stepLabel1.textContent = "1 课程信息";
        stepLabel1.style.display = "";
    }
    if (stepLabel2) stepLabel2.textContent = packImportMode ? "2 课程导入" : "2 课程结构";
    if (stepLabel3) {
        stepLabel3.style.display = "";
        stepLabel3.textContent = "3 材料整理";
    }
    if (mainTitle) mainTitle.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>材料文件夹`;
    if (mainHint) mainHint.textContent = packImportMode ? "课程包内容已导入本地目录，可直接保存到课程列表，必要时再补材料文件夹。" : "一个实验对应一个材料文件夹；未准备好可先留空，后续再补。";
    if (structureTitle) structureTitle.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>结构预览`;
    if (actionTitle) actionTitle.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><path d="M21.5 12H16c-.7 2-2 3-4 3s-3.3-1-4-3H2.5"></path><path d="M5.5 5.1L2 12v6c0 1.1.9 2 2 2h16a2 2 0 002-2v-6l-3.4-6.9A2 2 0 0016.8 4H7.2a2 2 0 00-1.8 1.1z"></path></svg>${packImportMode ? "保存导入结果" : "发布当前课程目录"}`;
    if (publishBtn) publishBtn.style.display = "";
    if (saveBtn) saveBtn.textContent = resourcesState.editingCourseId ? "保存修改" : packImportMode ? "导入并保存" : "保存为本地课程";
    if (statusEl && resourcesState.publishStatus === "idle") statusEl.textContent = "准备发布";
}

function parseRepoAddressInput(address) {
    const raw = (address || "").toString().trim();
    if (!raw) return null;

    // 仅接受完整仓库地址，避免额外字段暴露给老师。
    if (!/^https?:\/\//i.test(raw)) {
        return null;
    }

    try {
        const parsed = new URL(raw);
        const parts = parsed.pathname
            .replace(/^\/+|\/+$/g, "")
            .split("/")
            .filter(Boolean);
        if (parts.length < 2) return null;
        let branch = "main";
        if (parts[2] === "src" && parts[3] === "branch" && parts[4]) {
            branch = decodeURIComponent(parts[4]);
        }
        return normalizeOrigin({
            base_url: `${parsed.protocol}//${parsed.host}`,
            repo: `${parts[0]}/${parts[1].replace(/\.git$/i, "")}`,
            branch,
            index_path: "index.json",
            single_course_repo: false,
        });
    } catch (_) {
        return null;
    }
}

function getCloudTempSourceFromInputs() {
    const addressInput = document.getElementById("resources-cloud-repo-address");
    const tokenInput = document.getElementById("resources-cloud-temp-token");

    const address = (addressInput?.value || "").trim();
    const token = (tokenInput?.value || "").trim();

    if (!address) {
        return { source: null, token: "" };
    }
    const source = parseRepoAddressInput(address);
    if (!source) {
        return { error: "仓库地址无效，请输入完整地址，例如：http://8.145.44.54:3000/admin/ai-class-assistant" };
    }
    return { source, token };
}

function clearCloudTempSourceState() {
    resourcesState.cloudTempSource = null;
    resourcesState.cloudTempToken = "";
    const addressInput = document.getElementById("resources-cloud-repo-address");
    const tokenInput = document.getElementById("resources-cloud-temp-token");
    if (addressInput) addressInput.value = "";
    if (tokenInput) tokenInput.value = "";
}

function renderCloudCourseOptions() {
    const select = document.getElementById("resources-cloud-course-select");
    if (!select) return;
    const current = select.value;
    select.innerHTML = "";

    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = resourcesState.cloudCourseOptions.length ? "请选择课程" : "暂无可导入课程";
    select.appendChild(empty);

    resourcesState.cloudCourseOptions.forEach((course) => {
        const option = document.createElement("option");
        option.value = course.id || course.package_url || course.course_url;
        const subject = [course.grade, course.subject].filter(Boolean).join("/");
        const right = [subject, course.version ? `v${course.version}` : "", course.updated_at || "", course.source_name || ""]
            .filter(Boolean)
            .join(" · ");
        option.textContent = right ? `${course.title}（${right}）` : course.title;
        select.appendChild(option);
    });

    if (current && resourcesState.cloudCourseOptions.some((item) => (item.id || item.package_url || item.course_url) === current)) {
        select.value = current;
    } else if (resourcesState.cloudCourseOptions.length === 1) {
        const only = resourcesState.cloudCourseOptions[0];
        select.value = only.id || only.package_url || only.course_url || "";
    }
    renderCloudCoursePreview();
}

function renderCloudCoursePreview() {
    const preview = document.getElementById("resources-cloud-course-preview");
    const detailPreview = document.getElementById("resources-cloud-detail-preview");
    const select = document.getElementById("resources-cloud-course-select");
    const label = document.getElementById("resources-cloud-course-label");
    if (!preview || !detailPreview || !select || !label) return;

    const selectedValue = select.value || "";
    const selectedCourse = resourcesState.cloudCourseOptions.find((item) => (item.id || item.package_url || item.course_url) === selectedValue) || null;
    const isSingleRepoCourse = Boolean(selectedCourse?.single_course_repo) && resourcesState.cloudCourseOptions.length === 1;

    label.textContent = isSingleRepoCourse ? "当前仓库课程" : "云端课程";

    if (!selectedCourse) {
        label.style.display = resourcesState.cloudCourseOptions.length ? "" : "none";
        select.style.display = resourcesState.cloudCourseOptions.length ? "" : "none";
        [preview, detailPreview].forEach((node) => {
            node.style.display = "none";
            node.classList.remove("is-single");
            node.innerHTML = "";
        });
        updateLocalPathVisibility();
        return;
    }

    const summaryMarkup = buildCloudCoursePreviewMarkup(selectedCourse);
    const detailMarkup = buildCloudCourseDetailMarkup(selectedCourse);
    preview.classList.toggle("is-single", isSingleRepoCourse);
    preview.innerHTML = summaryMarkup;
    preview.style.display = resourcesState.createSource === "cloud" ? "none" : "block";

    detailPreview.classList.toggle("is-single", isSingleRepoCourse);
    detailPreview.innerHTML = detailMarkup;
    detailPreview.style.display = "block";

    const shouldHideSelector = resourcesState.createSource === "cloud" && resourcesState.cloudCourseOptions.length <= 1;
    label.style.display = shouldHideSelector ? "none" : "";
    select.style.display = shouldHideSelector ? "none" : "";
    updateLocalPathVisibility();
}

async function loadSelectedCloudCourseDetails() {
    const select = document.getElementById("resources-cloud-course-select");
    const selectedValue = select?.value || "";
    const selectedCourse = resourcesState.cloudCourseOptions.find(
        (item) => (item.id || item.package_url || item.course_url) === selectedValue
    );
    if (!selectedCourse || selectedCourse._detailsLoaded || selectedCourse._detailsLoading) {
        return selectedCourse || null;
    }

    selectedCourse._detailsLoading = true;
    setCloudStatus("正在读取课程结构...");
    try {
        const result = await inspectCloudCourseOptionFlow(selectedCourse, {
            apiClient,
            buildInspectCoursePayload: (target) =>
                buildInspectCoursePayload(target, {
                    getCourseOrigin,
                    buildSourceOverrideFromCourseMeta,
                    cloudTempToken: resourcesState.cloudTempToken,
                }),
            mergeInspectionCourse,
        });
        const optionIndex = resourcesState.cloudCourseOptions.indexOf(selectedCourse);
        if (optionIndex < 0) return null;

        resourcesState.cloudCourseOptions[optionIndex] = {
            ...result.course,
            _detailsLoaded: true,
            _detailsLoading: false,
        };
        if (select?.value === selectedValue) {
            renderCloudCoursePreview();
        }
        setCloudStatus("已读取课程结构。");
        return resourcesState.cloudCourseOptions[optionIndex];
    } catch (error) {
        selectedCourse._detailsLoading = false;
        setCloudStatus(extractApiErrorMessage(error, "读取课程结构失败"), true);
        return false;
    }
}

function getCloudCourseStats(course = {}) {
    const sections = Array.isArray(course.sections) ? course.sections : [];
    let experimentCount = 0;
    let fileCount = 0;
    sections.forEach((section) => {
        const experiments = Array.isArray(section?.experiments) ? section.experiments : [];
        experimentCount += experiments.length;
        experiments.forEach((experiment) => {
            fileCount += Array.isArray(experiment?.files) ? experiment.files.length : 0;
        });
    });
    return {
        sectionCount: sections.length,
        experimentCount,
        fileCount
    };
}

function buildCloudCourseMetaMarkup(course = {}) {
    const metaParts = [];
    if (course.grade) metaParts.push(`<span class="resources-cloud-course-preview-pill">${escapeAttr(course.grade)}</span>`);
    if (course.subject) metaParts.push(`<span class="resources-cloud-course-preview-pill">${escapeAttr(course.subject)}</span>`);
    if (course.version) metaParts.push(`<span class="resources-cloud-course-preview-pill">版本 ${escapeAttr(course.version)}</span>`);
    if (course.updated_at) metaParts.push(`<span class="resources-cloud-course-preview-pill">更新 ${escapeAttr(course.updated_at)}</span>`);
    if (course.author) metaParts.push(`<span class="resources-cloud-course-preview-pill">作者 ${escapeAttr(course.author)}</span>`);
    return metaParts.join("");
}

function buildCloudCoursePreviewMarkup(course = {}) {
    const metaMarkup = buildCloudCourseMetaMarkup(course);
    return `
        <div class="resources-cloud-course-preview-title">${escapeAttr(course.title || "未命名课程")}</div>
        ${metaMarkup ? `<div class="resources-cloud-course-preview-meta">${metaMarkup}</div>` : ""}
        ${course.description ? `<div class="resources-cloud-course-preview-desc">${escapeAttr(course.description)}</div>` : ""}
    `;
}

function buildCloudCourseDetailMarkup(course = {}) {
    const metaMarkup = buildCloudCourseMetaMarkup(course);
    const { sectionCount, experimentCount, fileCount } = getCloudCourseStats(course);
    const sections = Array.isArray(course.sections) ? course.sections : [];
    const outlineMarkup = sections.length
        ? sections
            .map((section, sectionIndex) => {
                const experiments = Array.isArray(section?.experiments) ? section.experiments : [];
                const sectionDescription = (section?.description || "").trim();
                const experimentMarkup = experiments.length
                    ? experiments
                        .map((experiment, experimentIndex) => {
                            const files = Array.isArray(experiment?.files) ? experiment.files : [];
                            return `
                                <div class="resources-cloud-outline-experiment">
                                    <div class="resources-cloud-outline-experiment-title">${escapeAttr(experiment.title || `实验 ${experimentIndex + 1}`)}</div>
                                    <div class="resources-cloud-outline-experiment-meta">${files.length ? `${files.length} 个文件` : "未配置材料"}</div>
                                </div>
                            `;
                        })
                        .join("")
                    : `<div class="resources-cloud-outline-empty">暂无实验</div>`;
                return `
                    <div class="resources-cloud-outline-section">
                        <div class="resources-cloud-outline-section-head">
                            <div class="resources-cloud-outline-section-title">${escapeAttr(section.title || `第 ${sectionIndex + 1} 课`)}</div>
                            <div class="resources-cloud-outline-section-count">${experiments.length} 个实验</div>
                        </div>
                        ${sectionDescription ? `<div class="resources-cloud-outline-section-desc">${escapeAttr(sectionDescription)}</div>` : ""}
                        <div class="resources-cloud-outline-experiments">${experimentMarkup}</div>
                    </div>
                `;
            })
            .join("")
        : `<div class="resources-cloud-outline-empty">该课程暂未配置课节</div>`;

    return `
        <div class="resources-cloud-detail-header">
            <div class="resources-cloud-detail-main">
                <div class="resources-cloud-course-preview-title">${escapeAttr(course.title || "未命名课程")}</div>
                ${metaMarkup ? `<div class="resources-cloud-course-preview-meta">${metaMarkup}</div>` : ""}
                ${course.description ? `<div class="resources-cloud-course-preview-desc">${escapeAttr(course.description)}</div>` : ""}
            </div>
            <div class="resources-cloud-detail-stats">
                <div class="resources-cloud-detail-stat"><strong>${sectionCount}</strong><span>课节</span></div>
                <div class="resources-cloud-detail-stat"><strong>${experimentCount}</strong><span>实验</span></div>
                <div class="resources-cloud-detail-stat"><strong>${fileCount}</strong><span>文件</span></div>
            </div>
        </div>
        <div class="resources-cloud-outline">${outlineMarkup}</div>
    `;
}

async function loadCloudCourseOptions() {
    if (resourcesState.createSource !== "cloud") return;
    try {
        await loadResourceSourcesConfig();
        if (!resourcesState.cloudTempSource && !resourcesState.defaultCloudSourceConfigured) {
            resourcesState.cloudCourseOptions = [];
            renderCloudCourseOptions();
            setCloudStatus("请先输入课程仓库地址，然后读取课程。");
            return;
        }
        setCloudStatus("正在读取云端课程列表...");
        const requestPayload = {};
        if (resourcesState.cloudTempSource) {
            requestPayload.source_override = {
                id: resourcesState.cloudTempSource.source_id || "override",
                base_url: resourcesState.cloudTempSource.base_url,
                repo: resourcesState.cloudTempSource.repo,
                branch: resourcesState.cloudTempSource.branch || "main",
                index_path: resourcesState.cloudTempSource.index_path || "index.json",
                single_course_repo: Boolean(resourcesState.cloudTempSource.single_course_repo),
            };
            if (resourcesState.cloudTempToken) {
                requestPayload.token_override = resourcesState.cloudTempToken;
            }
        }
        const response = resourcesState.cloudTempSource
            ? await apiClient.post("/api/resources/index", requestPayload)
            : await apiClient.get("/api/resources/index");
        if (!response?.success) {
            resourcesState.cloudCourseOptions = [];
            renderCloudCourseOptions();
            setCloudStatus(response?.message || "资源库未配置，请先到设置页填写 Gitea 参数。", true);
            return;
        }
        resourcesState.remoteSources = Array.isArray(response.sources) ? response.sources : [];
        resourcesState.cloudCourseOptions = normalizeCloudCourseOptions(response.index || {});
        renderCloudCourseOptions();
        if (!resourcesState.cloudCourseOptions.length) {
            setCloudStatus("仓库中未找到可导入课程，请检查 course.json 或 index.json。", true);
        } else {
            const detailResult = await loadSelectedCloudCourseDetails();
            if (detailResult === false) return;
            if (resourcesState.cloudTempSource) {
                setCloudStatus(resourcesState.cloudCourseOptions.length === 1 ? "已读取课程结构。" : `已读取 ${resourcesState.cloudCourseOptions.length} 门课程。`);
            } else {
                setCloudStatus(`已加载 ${resourcesState.cloudCourseOptions.length} 门云端课程。`);
            }
        }
    } catch (error) {
        resourcesState.cloudCourseOptions = [];
        renderCloudCourseOptions();
        setCloudStatus("读取云端课程失败，请检查仓库地址或访问权限。", true);
    } finally {
        updateCreateFormState();
    }
}

async function loadCloudCoursesFromTempSource() {
    const temp = getCloudTempSourceFromInputs();
    if (temp.error) {
        alert(temp.error);
        return;
    }
    if (!temp.source) {
        if (!resourcesState.defaultCloudSourceConfigured) {
            setCloudStatus("请先输入课程仓库地址，然后读取课程。", true);
            return;
        }
        resourcesState.cloudTempSource = null;
        resourcesState.cloudTempToken = "";
        updateCloudSourceActionUI();
        await loadCloudCourseOptions();
        return;
    }
    resourcesState.cloudTempSource = temp.source;
    resourcesState.cloudTempToken = temp.token || "";
    updateCloudSourceActionUI();
    await loadCloudCourseOptions();
}

async function clearCloudTempSourceAndReload() {
    const hadCustomSource = Boolean(resourcesState.cloudTempSource);
    const hadInput =
        Boolean((document.getElementById("resources-cloud-repo-address")?.value || "").trim()) ||
        Boolean((document.getElementById("resources-cloud-temp-token")?.value || "").trim());
    clearCloudTempSourceState();
    updateCloudSourceActionUI();
    if (resourcesState.defaultCloudSourceConfigured) {
        if (hadCustomSource) {
            setCloudStatus("已返回默认课程源，正在刷新课程列表...");
            await loadCloudCourseOptions();
        } else if (hadInput) {
            setCloudStatus("已清空输入内容。");
        }
        return;
    }
    resourcesState.cloudCourseOptions = [];
    renderCloudCourseOptions();
    if (hadCustomSource || hadInput) {
        setCloudStatus("已清空仓库地址，请重新输入后读取课程。");
    } else {
        setCloudStatus("请先输入课程仓库地址，然后读取课程。");
    }
}

function renderCreateGuide() {
    const guideBody = document.getElementById("resources-create-guide-body");
    const guideTitle = document.querySelector("#resources-create-guide .resources-guide-title");
    if (!guideBody) return;
    guideBody.innerHTML = "";

    if (resourcesState.createSource === "cloud") {
        if (guideTitle) {
            guideTitle.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
                云端导入
            `;
        }
        const note = document.createElement("div");
        note.className = "resources-guide-note";
        if (resourcesState.cloudImported && resourcesState.scannedCourse) {
            const { sectionCount, experimentCount } = getSectionStats();
            note.textContent = `已读取课程内容：${sectionCount} 课 / ${experimentCount} 个实验。选择本地目录后即可导入。`;
        } else if (resourcesState.scanError) {
            note.textContent = `读取失败：${resourcesState.scanError}`;
        } else {
            note.textContent = "输入课程仓库地址，读取 course.json 后直接导入为本地课程目录。";
        }
        guideBody.appendChild(note);
        return;
    }

    if (guideTitle) {
        guideTitle.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            课程指南
        `;
    }

    const items = [];
    const notes = [];
    const localPath = document.getElementById("resources-create-local-path")?.value.trim() || "";
    const { sectionCount, experimentCount } = getSectionStats();

    if (resourcesState.createStep === 1) {
        if (resourcesState.createSource === "cloud") {
            items.push({ done: true, text: "云端导入模式无需手工逐项填写课程信息" });
            notes.push("课程元信息将从课程仓库中的 course.json 自动读取并填充。");
            notes.push("下一步选择云端课程后导入课程文件。");
            items.forEach((item) => {
                const row = document.createElement("div");
                row.className = `resources-guide-item${item.done ? " is-done" : ""}`;
                const status = document.createElement("div");
                status.className = "resources-guide-status";
                status.textContent = item.done ? "✓" : "•";
                row.appendChild(status);
                const text = document.createElement("div");
                text.className = "resources-guide-text";
                text.textContent = item.text;
                row.appendChild(text);
                guideBody.appendChild(row);
            });
            if (notes.length) {
                const note = document.createElement("div");
                note.className = "resources-guide-note";
                note.textContent = notes.join(" ");
                guideBody.appendChild(note);
            }
            return;
        }
        if (resourcesState.createEntryMode === "pack-import") {
            items.push({ done: true, text: "本地导入模式无需手工填写课程信息" });
            notes.push("课程信息会从课程包中的 course.json 自动读取并填充。");
            notes.push("仅支持 xedu-pack 生成的 zip 课程包或已解压目录。");
            items.forEach((item) => {
                const row = document.createElement("div");
                row.className = `resources-guide-item${item.done ? " is-done" : ""}`;
                const status = document.createElement("div");
                status.className = "resources-guide-status";
                status.textContent = item.done ? "✓" : "•";
                row.appendChild(status);
                const text = document.createElement("div");
                text.className = "resources-guide-text";
                text.textContent = item.text;
                row.appendChild(text);
                guideBody.appendChild(row);
            });
            if (notes.length) {
                const note = document.createElement("div");
                note.className = "resources-guide-note";
                note.textContent = notes.join(" ");
                guideBody.appendChild(note);
            }
            return;
        }
        const titleValue = document.getElementById("resources-create-title")?.value.trim() || "";
        const note = document.createElement("div");
        note.className = "resources-guide-note";
        note.textContent = titleValue
            ? "课程名称已填写，其他信息可按需补充。"
            : "先填写课程名称，其他信息可后补。";
        guideBody.appendChild(note);
        return;
    } else if (resourcesState.createStep === 2) {
        if (resourcesState.createSource !== "cloud") {
            if (resourcesState.createEntryMode === "pack-import") {
                const packagePath = document.getElementById("resources-create-package-path")?.value.trim() || "";
                items.push({ done: Boolean(packagePath), text: "选择本地课程包" });
                items.push({ done: Boolean(localPath), text: "选择本地保存位置" });
                items.push({ done: Boolean(resourcesState.scannedCourse && !resourcesState.scanError), text: "导入课程包并读取课程结构" });
                if (resourcesState.scanError) {
                    notes.push(`导入失败：${resourcesState.scanError}`);
                } else if (resourcesState.scannedCourse) {
                    notes.push(`已导入 ${sectionCount} 课 / ${experimentCount} 个实验。可继续下一步保存。`);
                } else {
                    notes.push("先选择本地课程包，再选择本地保存位置并执行导入。");
                }
            } else {
                items.push({ done: Boolean(localPath), text: "选择课程根目录" });
                items.push({ done: resourcesState.draftSections.length > 0, text: "按需添加课节与实验" });
                if (resourcesState.draftSections.length > 0) {
                    notes.push(`当前已配置 ${sectionCount} 课 / ${experimentCount} 个实验。`);
                } else {
                    notes.push("本步可直接跳过；保存时会自动补 1 课 1 实验，并写入 course.json。");
                }
            }
        }
    } else {
        items.push({ done: isStep1Complete(), text: "课程信息已完善" });
        items.push({
            done: isStep2Complete(),
            text: resourcesState.createSource === "cloud" ? "课程结构已读取" : "课程根目录已选择（结构可后补）"
        });
        items.push({
            done: isStep1Complete() && isStep2Complete(),
            text: "可保存为本地课程或发布到 Gitea"
        });
        if (resourcesState.createSource === "cloud") {
            notes.push("云端课程已是完整结构，确认后直接保存为本地课程即可。");
        } else if (resourcesState.createEntryMode === "pack-import") {
            notes.push("本地课程包已导入后可直接保存到课程列表，再按需编辑或发布。");
        } else {
            notes.push("可以一个实验一个实验添加：点击每课下方“添加实验”。");
            notes.push("每个实验建议关联一个材料文件夹，可包含 Notebook、HTML、Scratch、图片和数据文件。");
            notes.push("若未配置结构，保存时会自动生成 1 课 1 实验。");
        }
    }

    items.forEach((item) => {
        const row = document.createElement("div");
        row.className = `resources-guide-item${item.done ? " is-done" : ""}`;

        const status = document.createElement("div");
        status.className = "resources-guide-status";
        status.textContent = item.done ? "✓" : "•";
        row.appendChild(status);

        const text = document.createElement("div");
        text.className = "resources-guide-text";
        text.textContent = item.text;
        row.appendChild(text);

        guideBody.appendChild(row);
    });

    if (notes.length) {
        const note = document.createElement("div");
        note.className = "resources-guide-note";
        note.textContent = notes.join(" ");
        guideBody.appendChild(note);
    }
}

function updateCreateFlowLayout() {
    const stepsWrap = document.getElementById("resources-create-steps");
    const footer = document.querySelector("#resources-create-view .resources-create-footer");
    const guideCard = document.getElementById("resources-create-guide");
    const step2Grid = document.getElementById("resources-create-step2-grid");
    const isCloud = resourcesState.createSource === "cloud";
    const hideGuide = false;
    if (stepsWrap) {
        stepsWrap.style.display = isCloud ? "none" : "flex";
    }
    if (footer) {
        footer.style.display = isCloud ? "none" : "flex";
    }
    if (guideCard) {
        guideCard.style.display = isCloud || hideGuide ? "none" : "flex";
    }
    if (step2Grid) {
        step2Grid.classList.toggle("is-cloud", isCloud);
    }
    updateLocalPathVisibility();
}

function updateStepperUI() {
    updateCreateStep3UI();
    updateCreateFlowLayout();
    document.querySelectorAll(".resources-step").forEach((stepEl) => {
        const step = Number(stepEl.dataset.step);
        stepEl.classList.toggle("active", step === resourcesState.createStep);
    });
    document.querySelectorAll(".resources-create-step").forEach((stepEl) => {
        const step = Number(stepEl.dataset.step);
        stepEl.classList.toggle("active", step === resourcesState.createStep);
    });

    const prevBtn = document.getElementById("resources-step-prev");
    const nextBtn = document.getElementById("resources-step-next");
    if (prevBtn) {
        prevBtn.disabled = resourcesState.createSource === "cloud" ? false : resourcesState.createStep <= 1;
        prevBtn.textContent = resourcesState.createSource === "cloud" ? "返回" : "上一步";
    }
    if (nextBtn) {
        nextBtn.style.display = resourcesState.createSource === "cloud" ? "none" : "inline-flex";
        if (resourcesState.createStep === 1) {
            nextBtn.textContent = "下一步";
            nextBtn.disabled = !isStep1Complete();
        } else if (resourcesState.createStep === 2) {
            nextBtn.textContent = "下一步";
            nextBtn.disabled = !isStep2Complete();
        } else {
            nextBtn.textContent = "完成";
            nextBtn.disabled = false;
        }
    }

    const publishBtn = document.getElementById("resources-publish-btn");
    const saveBtn = document.getElementById("resources-create-save-btn");
    if (publishBtn) {
        if (resourcesState.createSource === "cloud") {
            publishBtn.disabled = !(isStep1Complete() && isStep2Complete());
        } else {
            const localPath = document.getElementById("resources-create-local-path")?.value.trim() || "";
            const sections = getEffectiveSections();
            const hasScannedCourse = Boolean(resourcesState.scannedCourse);
            publishBtn.disabled = resourcesState.createEntryMode === "pack-import"
                ? !(hasScannedCourse && localPath && countExperimentsInSections(sections) >= 1)
                : !(isStep1Complete() && localPath && countExperimentsInSections(sections) >= 1);
        }
    }
    if (saveBtn) {
        if (resourcesState.createSource === "cloud") {
            saveBtn.disabled = !(resourcesState.cloudImported && resourcesState.scannedCourse);
        } else {
            const localPath = document.getElementById("resources-create-local-path")?.value.trim() || "";
            saveBtn.disabled = resourcesState.createEntryMode === "pack-import"
                ? !(resourcesState.scannedCourse && localPath)
                : !(isStep1Complete() && localPath);
        }
    }

    renderCreateGuide();
}

function setCreateStep(step) {
    const maxStep = resourcesState.createSource === "cloud" ? 2 : 3;
    const minStep = resourcesState.createSource === "cloud" ? 2 : 1;
    resourcesState.createStep = Math.min(maxStep, Math.max(minStep, step));
    updateStepperUI();
}

function renderCoursePreview() {
    const preview = document.getElementById("resources-create-preview");
    if (!preview) return;
    const meta = getCreateMetaFromForm();
    const tags = meta.tags || [];
    const localPath = document.getElementById("resources-create-local-path")?.value.trim() || "";
    const course = resourcesState.scannedCourse
        || resourcesState.localCourses.find((item) => item?.id === resourcesState.editingCourseId)
        || {};
    const cover = resolveCreateCoverPreviewUrl(meta.coverDataUrl, {
        ...course,
        local_path: localPath || course.local_path || "",
    });
    preview.innerHTML = `
        <div class="resources-preview-cover">
            ${cover ? `<img src="${cover}" alt="cover">` : "课程封面"}
        </div>
        <div class="resources-preview-title">${meta.title || "课程名称"}</div>
        <div class="resources-preview-desc">${meta.description || "课程简介将在这里显示"}</div>
        <div class="resources-preview-meta">
            <span>${meta.grade || "年级"}</span>
            <span>${meta.subject || "学科"}</span>
            <span>${meta.author || "作者"}</span>
        </div>
        <div class="resources-preview-meta">
            ${(tags.length ? tags : ["标签"]).map((tag) => `<span class="resources-preview-tag">${tag}</span>`).join("")}
        </div>
    `;
}

function renderScanStatus() {
    const statusEl = document.getElementById("resources-scan-status");
    const summaryEl = document.getElementById("resources-scan-summary");
    if (!statusEl || !summaryEl) return;

    if (resourcesState.scanError) {
        statusEl.textContent = resourcesState.scanError;
        statusEl.classList.add("error");
        statusEl.classList.remove("success");
        summaryEl.innerHTML = "";
        return;
    }

    if (resourcesState.scannedCourse) {
        if (resourcesState.scanSummary?.initialized && resourcesState.scanSummary?.auto_built) {
            statusEl.textContent = "已初始化 course.json 并生成结构";
        } else if (resourcesState.scanSummary?.initialized) {
            statusEl.textContent = "已初始化 course.json";
        } else if (resourcesState.scanSummary?.auto_built) {
            statusEl.textContent = "已从文件夹生成结构";
        } else {
            statusEl.textContent = "解析成功";
        }
        statusEl.classList.add("success");
        statusEl.classList.remove("error");
        summaryEl.innerHTML = `
            <div>课程 ID：${resourcesState.scannedCourse.id || "-"}</div>
            <div>课程版本：${resourcesState.scannedCourse.version || "-"}</div>
            <div>课节数：${resourcesState.scanSummary?.section_count || 0}</div>
            <div>实验数：${resourcesState.scanSummary?.experiment_count || 0}</div>
        `;
        return;
    }

    statusEl.textContent = "尚未读取课程结构";
    statusEl.classList.remove("success", "error");
    summaryEl.innerHTML = "";
}

function renderStructurePreview() {
    const container = document.getElementById("resources-structure-preview");
    if (!container) return;
    if (!resourcesState.scannedCourse || !Array.isArray(resourcesState.scannedCourse.sections)) {
        container.innerHTML = "<div>暂无结构预览</div>";
        return;
    }
    const html = resourcesState.scannedCourse.sections
        .map((section) => {
            const expHtml = (section.experiments || [])
                .map((exp) => `<div class="resources-structure-item">- ${exp.title || "未命名实验"}</div>`)
                .join("");
            return `
                <div class="resources-structure-section">
                    <div class="resources-structure-title">${section.title || "未命名课节"}</div>
                    ${expHtml || "<div class=\"resources-structure-item\">暂无实验</div>"}
                </div>
            `;
        })
        .join("");
    container.innerHTML = html || "<div>暂无结构预览</div>";
}

function buildDefaultSections(count, experimentsPerSection = 1) {
    const safeCount = Math.max(1, Number(count) || 1);
    const safeExpCount = Math.max(1, Number(experimentsPerSection) || 1);
    return Array.from({ length: safeCount }).map((_, index) => ({
        title: `第 ${index + 1} 课`,
        description: "",
        experiments: Array.from({ length: safeExpCount }).map((__, expIndex) => ({
            title: `实验 ${expIndex + 1}`,
            description: "",
            files: []
        }))
    }));
}

function renderSectionEditor() {
    const container = document.getElementById("resources-section-editor");
    if (!container) return;
    container.innerHTML = "";
    renderLocalStructureSummary();

    if (!resourcesState.draftSections.length) {
        const empty = document.createElement("div");
        empty.className = "resources-empty";
        empty.textContent = "还没有课节，先创建第一节课。";
        container.appendChild(empty);
        return;
    }

    const readOnly = resourcesState.createSource === "cloud" && resourcesState.cloudImported;

    resourcesState.draftSections.forEach((section, sectionIndex) => {
        const sectionCard = document.createElement("div");
        sectionCard.className = "resources-section-editor-card";

        const topRow = document.createElement("div");
        topRow.className = "resources-section-editor-top";

        const badge = document.createElement("span");
        badge.className = "resources-section-editor-badge";
        badge.textContent = `第 ${sectionIndex + 1} 节`;
        topRow.appendChild(badge);

        const topTools = document.createElement("div");
        topTools.className = "resources-section-editor-tools";

        const sectionCount = document.createElement("span");
        sectionCount.className = "resources-section-editor-count";
        sectionCount.textContent = `${(section.experiments || []).length} 个实验`;
        topTools.appendChild(sectionCount);

        const removeBtn = document.createElement("button");
        removeBtn.className = "btn btn-secondary btn-sm";
        removeBtn.textContent = "删除";
        removeBtn.disabled = readOnly;
        if (!readOnly) {
            removeBtn.addEventListener("click", () => {
                resourcesState.draftSections.splice(sectionIndex, 1);
                renderSectionEditor();
                renderMaterialList();
            });
        }
        topTools.appendChild(removeBtn);
        topRow.appendChild(topTools);
        sectionCard.appendChild(topRow);

        const titleInput = document.createElement("input");
        titleInput.className = "form-control resources-section-editor-title";
        titleInput.placeholder =
            sectionIndex === 0 ? "给第一节课起个名字" : `给第 ${sectionIndex + 1} 节课起个名字`;
        titleInput.value = section.title || "";
        if (readOnly) {
            titleInput.disabled = true;
        } else {
            titleInput.addEventListener("input", (event) => {
                resourcesState.draftSections[sectionIndex].title = event.target.value.trim();
            });
        }
        sectionCard.appendChild(titleInput);

        const sectionTip = document.createElement("div");
        sectionTip.className = "resources-section-editor-tip";
        sectionTip.textContent = "先把这一节的实验名称列出来，材料后面再补。";
        sectionCard.appendChild(sectionTip);

        const expList = document.createElement("div");
        expList.className = "resources-section-editor-experiments";

        (section.experiments || []).forEach((exp, expIndex) => {
            const expRow = document.createElement("div");
            expRow.className = "resources-section-editor-exp";

            const expLabel = document.createElement("span");
            expLabel.className = "resources-section-editor-exp-index";
            expLabel.textContent = `${expIndex + 1}`;
            expRow.appendChild(expLabel);

            const expInput = document.createElement("input");
            expInput.className = "form-control resources-section-editor-exp-input";
            expInput.placeholder = "输入实验名称";
            expInput.value = exp.title || "";
            if (readOnly) {
                expInput.disabled = true;
            } else {
                expInput.addEventListener("input", (event) => {
                    resourcesState.draftSections[sectionIndex].experiments[expIndex].title = event.target.value.trim();
                });
            }
            expRow.appendChild(expInput);

            const expRemove = document.createElement("button");
            expRemove.className = "btn btn-secondary btn-sm";
            expRemove.textContent = "删除";
            expRemove.disabled = readOnly;
            if (!readOnly) {
                expRemove.addEventListener("click", () => {
                    resourcesState.draftSections[sectionIndex].experiments.splice(expIndex, 1);
                    renderSectionEditor();
                    renderMaterialList();
                });
            }
            expRow.appendChild(expRemove);

            expList.appendChild(expRow);
        });

        const addExpBtn = document.createElement("button");
        addExpBtn.className = "btn btn-secondary btn-sm resources-section-editor-add-btn";
        addExpBtn.textContent = "+ 新增实验";
        addExpBtn.disabled = readOnly;
        if (!readOnly) {
            addExpBtn.addEventListener("click", () => {
                resourcesState.draftSections[sectionIndex].experiments.push({
                    title: `实验 ${resourcesState.draftSections[sectionIndex].experiments.length + 1}`,
                    description: "",
                    files: []
                });
                renderSectionEditor();
                renderMaterialList();
            });
        }

        sectionCard.appendChild(expList);
        sectionCard.appendChild(addExpBtn);
        container.appendChild(sectionCard);
    });
}

function buildCoursePayloadFromForm(sections) {
    const meta = getCreateMetaFromForm();
    const courseId = meta.courseId || generateCourseId(meta.title);
    return {
        id: courseId,
        title: meta.title,
        description: meta.description,
        grade: meta.grade,
        subject: meta.subject,
        author: meta.author,
        version: meta.version || "1.0",
        tags: meta.tags || [],
        cover: meta.coverDataUrl || "",
        sections: sections || []
    };
}

async function saveCourseStructure() {
    const localPath = document.getElementById("resources-create-local-path")?.value.trim() || "";
    if (!localPath) {
        alert("请先选择本地课程目录。");
        return;
    }
    const sections = resourcesState.scannedCourse?.sections || resourcesState.draftSections;
    if (!sections.length) {
        alert("请先生成课节结构。");
        return;
    }
    const payload = buildCoursePayloadFromForm(sections);
    try {
        const response = await apiClient.post("/api/resources/save-course", {
            local_path: localPath,
            course: payload
        });
        if (!response.success) {
            throw new Error(response.message || "保存结构失败");
        }
        resourcesState.scannedCourse = response.course;
        resourcesState.scanSummary = response.summary;
        resourcesState.draftSections = resourcesState.scannedCourse.sections || [];
        renderSectionEditor();
        renderMaterialList();
        renderStructurePreview();
        renderCoursePreview();
        updateStepperUI();
    } catch (error) {
        alert(error.message || "保存结构失败");
    }
}

function renderMaterialList() {
    const container = document.getElementById("resources-material-list");
    if (!container) return;
    container.innerHTML = "";

    const sections = resourcesState.scannedCourse?.sections || resourcesState.draftSections;
    if (!sections || !sections.length) {
        const empty = document.createElement("div");
        empty.className = "resources-empty";
        empty.textContent = "结构可跳过；可先保存课程，系统会自动生成 1 课 1 实验。";
        container.appendChild(empty);
        return;
    }

    const readOnly = resourcesState.createSource === "cloud" && resourcesState.cloudImported;

    const intro = document.createElement("div");
    intro.className = "resources-create-hint";
    intro.textContent = "每个实验对应一个材料文件夹。材料文件夹必须位于当前课程根目录内，可包含 ipynb、py、html、.sb3、图片和数据文件；旧 Blockly 文件仅用于识别并显示不支持提示。";
    container.appendChild(intro);

    sections.forEach((section, sectionIndex) => {
        const sectionBlock = document.createElement("div");
        sectionBlock.className = "resources-material-section";

        const title = document.createElement("div");
        title.className = "resources-material-section-title";
        title.textContent = section.title || `第 ${sectionIndex + 1} 课`;
        sectionBlock.appendChild(title);

        (section.experiments || []).forEach((exp, expIndex) => {
            const item = document.createElement("div");
            item.className = "resources-material-item";

            const info = document.createElement("div");
            info.className = "resources-material-info";
            const expTitle = document.createElement("div");
            expTitle.className = "resources-material-title";
            expTitle.textContent = exp.title || `实验 ${expIndex + 1}`;
            const fileCount = exp.files && exp.files.length ? exp.files.length : 0;
            const expMeta = document.createElement("div");
            expMeta.className = "resources-material-meta";
            expMeta.textContent = fileCount ? `${fileCount} 个文件` : "未选择材料文件夹";
            info.appendChild(expTitle);
            info.appendChild(expMeta);
            item.appendChild(info);

            const pickBtn = document.createElement("button");
            pickBtn.className = "btn btn-secondary btn-sm";
            pickBtn.textContent = readOnly ? "已导入" : "选择材料文件夹";
            pickBtn.disabled = readOnly;
            if (!readOnly) {
                pickBtn.addEventListener("click", async () => {
                    if (!window.electronAPI || typeof window.electronAPI.invoke !== "function") {
                        alert("请在桌面应用中使用本地上传功能");
                        return;
                    }
                    const basePath = document.getElementById("resources-create-local-path")?.value.trim() || "";
                    if (!basePath) {
                        alert("请先选择课程目录");
                        return;
                    }
                    const folderPath = await window.electronAPI.invoke("select-folder");
                    if (!folderPath) return;
                    try {
                        const response = await apiClient.post("/api/resources/scan-folder", {
                            base_path: basePath,
                            folder_path: folderPath
                        });
                        if (!response.success) {
                            throw new Error(response.message || "读取材料失败");
                        }
                        const targetSections = resourcesState.scannedCourse?.sections || resourcesState.draftSections;
                        const expTarget = targetSections?.[sectionIndex]?.experiments?.[expIndex];
                        if (expTarget) {
                            expTarget.files = response.files || [];
                        }
                        if (resourcesState.scannedCourse) {
                            resourcesState.scannedCourse.sections = targetSections;
                        } else {
                            resourcesState.draftSections = targetSections;
                        }
                        await saveCourseStructure();
                    } catch (error) {
                        alert(error.message || "读取材料失败");
                    }
                });
            }
            item.appendChild(pickBtn);
            sectionBlock.appendChild(item);
        });

        const addExpBtn = document.createElement("button");
        addExpBtn.className = "btn btn-secondary btn-sm";
        addExpBtn.textContent = "添加实验";
        addExpBtn.disabled = readOnly;
        if (!readOnly) {
            addExpBtn.addEventListener("click", async () => {
                const basePath = document.getElementById("resources-create-local-path")?.value.trim() || "";
                if (!basePath) {
                    alert("请先选择课程目录");
                    return;
                }
                const targetSections = resourcesState.scannedCourse?.sections || resourcesState.draftSections;
                if (!targetSections?.[sectionIndex]) return;
                const experiments = targetSections[sectionIndex].experiments || [];
                experiments.push({
                    title: `实验 ${experiments.length + 1}`,
                    description: "",
                    files: []
                });
                targetSections[sectionIndex].experiments = experiments;
                if (resourcesState.scannedCourse) {
                    resourcesState.scannedCourse.sections = targetSections;
                } else {
                    resourcesState.draftSections = targetSections;
                }
                await saveCourseStructure();
            });
        }
        sectionBlock.appendChild(addExpBtn);

        container.appendChild(sectionBlock);
    });
}

async function scanCourse() {
    const localPath = document.getElementById("resources-create-local-path")?.value.trim() || "";
    if (!localPath) return;
    resourcesState.scanError = "";
    resourcesState.scannedCourse = null;
    resourcesState.scanSummary = null;
    renderScanStatus();

    try {
        const meta = getCreateMetaFromForm();
        const response = await apiClient.post("/api/resources/scan", {
            local_path: localPath,
            init_if_missing: true,
            // Local creation should not infer full structure from folder layout.
            auto_build: false,
            meta: {
                id: meta.courseId,
                title: meta.title,
                description: meta.description,
                grade: meta.grade,
                subject: meta.subject,
                author: meta.author,
                version: meta.version,
                tags: meta.tags,
            },
        });
        if (!response.success) {
            throw new Error(response.message || "解析失败");
        }
        resourcesState.scannedCourse = response.course;
        resourcesState.scanSummary = response.summary;
        if (resourcesState.scannedCourse && Array.isArray(resourcesState.scannedCourse.sections) && resourcesState.scannedCourse.sections.length) {
            resourcesState.draftSections = resourcesState.scannedCourse.sections;
            renderSectionEditor();
            renderMaterialList();
        }
        if (resourcesState.scannedCourse) {
            const idInput = document.getElementById("resources-create-id");
            const versionInput = document.getElementById("resources-create-version");
            if (idInput && !idInput.value) idInput.value = resourcesState.scannedCourse.id || "";
            if (versionInput && !versionInput.value) versionInput.value = resourcesState.scannedCourse.version || "";

            // 填充空字段
            const titleInput = document.getElementById("resources-create-title");
            const descInput = document.getElementById("resources-create-desc");
            const gradeInput = document.getElementById("resources-create-grade");
            const subjectInput = document.getElementById("resources-create-subject");
            const authorInput = document.getElementById("resources-create-author");
            const tagsInput = document.getElementById("resources-create-tags");

            if (titleInput && !titleInput.value) titleInput.value = resourcesState.scannedCourse.title || "";
            if (descInput && !descInput.value) descInput.value = resourcesState.scannedCourse.description || "";
            if (gradeInput && !gradeInput.value) gradeInput.value = resourcesState.scannedCourse.grade || "";
            if (subjectInput && !subjectInput.value) subjectInput.value = resourcesState.scannedCourse.subject || "";
            if (authorInput && !authorInput.value) authorInput.value = resourcesState.scannedCourse.author || "";
            if (tagsInput && !tagsInput.value && Array.isArray(resourcesState.scannedCourse.tags)) {
                tagsInput.value = resourcesState.scannedCourse.tags.join(", ");
            }
        }
    } catch (error) {
        resourcesState.scanError = error.message || "解析失败";
    } finally {
        renderScanStatus();
        renderStructurePreview();
        renderCoursePreview();
        updateStepperUI();
    }
}

function extractApiErrorMessage(error, fallback = "操作失败") {
    if (!error) return fallback;
    if (error?.details) {
        try {
            const parsed = JSON.parse(error.details);
            if (parsed?.message) return parsed.message;
        } catch (_) {
            return `${fallback}: ${error.details}`;
        }
    }
    if (error?.message) return error.message;
    return fallback;
}

function showAsyncActionError(error, fallback = "操作失败", options = {}) {
    if (options.logLabel) {
        console.warn(`${options.logLabel}:`, error);
    }
    const message = extractApiErrorMessage(error, fallback);
    const toastType = options.toastType || "error";
    if (typeof window.app?.ui?.showToast === "function") {
        window.app.ui.showToast(message, toastType);
    } else {
        alert(message);
    }
    return message;
}

function withAsyncActionErrorBoundary(handler, options = {}) {
    return async (...args) => {
        try {
            return await handler(...args);
        } catch (error) {
            showAsyncActionError(error, options.fallback || "操作失败", options);
            return undefined;
        }
    };
}

async function loadDefaultPublishSource() {
    try {
        const response = await apiClient.loadConfig();
        if (!response?.success) return null;
        const ui = response.config?.ui || {};
        const base_url = (ui.resources_base_url || "").trim().replace(/\/+$/, "");
        const repo = (ui.resources_repo || "").trim().replace(/^\/+|\/+$/g, "");
        if (!base_url || !repo) return null;
        return {
            base_url,
            repo,
            branch: (ui.resources_branch || "main").trim() || "main",
            index_path: (ui.resources_index_path || "index.json").trim() || "index.json",
            publish_path: (ui.resources_publish_path || "courses").trim() || "courses",
        };
    } catch (_) {
        return null;
    }
}

async function loadDefaultPublishToken() {
    try {
        const response = await apiClient.loadConfig();
        if (!response?.success) return "";
        const ui = response.config?.ui || {};
        return (ui.resources_publish_token || "").toString().trim();
    } catch (_) {
        return "";
    }
}

function getPublishSourceFromSettingsInputs() {
    const baseInput = document.getElementById("resources-base-url");
    const repoInput = document.getElementById("resources-repo");
    const branchInput = document.getElementById("resources-branch");
    const indexInput = document.getElementById("resources-index-path");
    const publishInput = document.getElementById("resources-publish-path");
    return normalizeOrigin({
        base_url: baseInput?.value || "",
        repo: repoInput?.value || "",
        branch: branchInput?.value || "main",
        index_path: indexInput?.value || "index.json",
        publish_path: publishInput?.value || "courses",
    });
}

function getPublishTokenFromSettingsInputs() {
    const tokenInput = document.getElementById("resources-publish-token");
    return (tokenInput?.value || "").toString().trim();
}

async function resolvePublishRetryToken(currentToken = "") {
    const inUse = (currentToken || "").toString().trim();
    if (inUse) return inUse;
    const runtime = getPublishTokenFromSettingsInputs();
    if (runtime) return runtime;
    return loadDefaultPublishToken();
}

function isAuthRelatedErrorMessage(message = "") {
    const text = (message || "").toString().toLowerCase();
    return (
        text.includes("token") ||
        text.includes("认证失败") ||
        text.includes("访问令牌") ||
        text.includes("http 401") ||
        text.includes("http 403") ||
        text.includes("401") ||
        text.includes("403")
    );
}

function isIndexMissingMessage(message = "") {
    const text = (message || "").toString();
    return text.includes("索引文件不存在") || text.includes("index.json");
}

async function promptTokenForPublish({
    title = "需要访问令牌",
    message = "该操作需要访问令牌，请输入后继续。",
    confirmText = "继续",
    defaultValue = "",
} = {}) {
    const input = await openResourcesInput({
        title,
        message,
        label: "访问令牌",
        placeholder: "私有仓库或上传更新时需要",
        defaultValue,
        secret: true,
        required: true,
        confirmText,
        cancelText: "取消",
    });
    if (input === null) return null;
    const trimmed = (input || "").trim();
    return trimmed || null;
}

async function probePublishSourceReadable(source, token = "") {
    if (!source) {
        return { ok: false, message: "课程仓库配置缺失", authRequired: false, indexMissing: false };
    }
    const payload = {
        source_override: {
            id: source.source_id || "override",
            ...source,
        },
    };
    if (token) {
        payload.token_override = token;
    }
    try {
        const response = await apiClient.post("/api/resources/index", payload);
        if (response?.success) {
            return { ok: true, message: "", authRequired: false, indexMissing: false };
        }
        const sourceMessage = Array.isArray(response?.sources) && response.sources[0]
            ? (response.sources[0].message || "")
            : "";
        const message = sourceMessage || response?.message || "读取课程源失败";
        return {
            ok: false,
            message,
            authRequired: isAuthRelatedErrorMessage(message),
            indexMissing: isIndexMissingMessage(message),
        };
    } catch (error) {
        let message = extractApiErrorMessage(error, "读取课程源失败");
        if (error?.details) {
            try {
                const parsed = JSON.parse(error.details);
                const sourceMessage = Array.isArray(parsed?.sources) && parsed.sources[0]
                    ? (parsed.sources[0].message || "")
                    : "";
                if (sourceMessage) {
                    message = sourceMessage;
                } else if (parsed?.message) {
                    message = parsed.message;
                }
            } catch (_) {
                // ignore detail parse errors
            }
        }
        return {
            ok: false,
            message,
            authRequired: isAuthRelatedErrorMessage(message),
            indexMissing: isIndexMissingMessage(message),
        };
    }
}

async function ensureTokenForPublishFlow(source, preferredToken = "") {
    const initialToken = await resolvePublishRetryToken(preferredToken);
    const probe = await probePublishSourceReadable(source, initialToken || "");
    if (probe.ok || probe.indexMissing) {
        return initialToken || "";
    }
    if (probe.authRequired) {
        const entered = await promptTokenForPublish({
            title: "读取课程仓库需要访问令牌",
            message: "当前仓库无法匿名读取，请输入访问令牌后继续。",
            confirmText: "继续上传",
            defaultValue: initialToken || "",
        });
        if (!entered) return null;
        const retryProbe = await probePublishSourceReadable(source, entered);
        if (retryProbe.ok || retryProbe.indexMissing) {
            return entered;
        }
        alert(`课程仓库访问失败：${retryProbe.message || "未知错误"}`);
        return null;
    }
    alert(`课程仓库访问失败：${probe.message || "未知错误"}`);
    return null;
}

async function ensureWriteTokenForPublish(preferredToken = "") {
    const resolved = await resolvePublishRetryToken(preferredToken);
    if (resolved) {
        return resolved.trim();
    }
    const entered = await promptTokenForPublish({
        title: "上传课程需要访问令牌",
        message: "上传/更新课程属于写操作，请输入访问令牌。",
        confirmText: "继续上传",
        defaultValue: "",
    });
    return entered ? entered.trim() : null;
}

async function openPublishSourceConfigModal(initialSource = null) {
    const fromInitial = normalizeOrigin(initialSource || {});
    const fromSettings = getPublishSourceFromSettingsInputs();
    const fromSaved = await loadDefaultPublishSource();
    const sourceDefaults = fromInitial || fromSettings || fromSaved || {
        base_url: "",
        repo: "",
        branch: "main",
        index_path: "index.json",
        publish_path: "courses",
    };

    const defaultRepoAddress =
        sourceDefaults.base_url && sourceDefaults.repo
            ? `${sourceDefaults.base_url}/${sourceDefaults.repo}`
            : "";

    const parseRepoAddress = (address) => {
        const raw = (address || "").toString().trim();
        if (!raw) return null;

        let base_url = "";
        let repo = "";
        let branchFromUrl = "";

        if (/^https?:\/\//i.test(raw)) {
            let parsed = null;
            try {
                parsed = new URL(raw);
            } catch (_) {
                return null;
            }
            base_url = `${parsed.protocol}//${parsed.host}`;
            const parts = parsed.pathname
                .replace(/^\/+|\/+$/g, "")
                .split("/")
                .filter(Boolean);
            if (parts.length < 2) return null;
            repo = `${parts[0]}/${parts[1].replace(/\.git$/i, "")}`;
            // 支持粘贴 src/branch/<name> 形式的链接
            if (parts[2] === "src" && parts[3] === "branch" && parts[4]) {
                branchFromUrl = decodeURIComponent(parts[4]);
            }
        } else {
            const cleaned = raw.replace(/^\/+|\/+$/g, "");
            const parts = cleaned.split("/").filter(Boolean);
            if (parts.length === 2) {
                repo = `${parts[0]}/${parts[1].replace(/\.git$/i, "")}`;
                base_url = sourceDefaults.base_url || "";
            } else {
                return null;
            }
        }

        return normalizeOrigin({
            ...sourceDefaults,
            base_url,
            repo,
            branch: branchFromUrl || sourceDefaults.branch || "main",
        });
    };

    const result = await openResourcesForm({
        title: "绑定课程仓库",
        message: "首次上传只需要填写课程仓库地址（公开仓库可直接上传）。",
        confirmText: "绑定并上传",
        cancelText: "取消",
        fields: [
            {
                name: "repo_address",
                label: "课程仓库地址",
                placeholder: "例如：http://8.145.44.54:3000/admin/ai-class-assistant",
                value: defaultRepoAddress,
                required: true,
            },
        ],
        validate: (values) => {
            const normalized = parseRepoAddress(values.repo_address);
            if (!normalized) {
                return "课程仓库地址无效，请输入完整仓库地址（或 owner/repo）。";
            }
            return "";
        },
    });

    if (!result?.confirmed) {
        return null;
    }

    const source = parseRepoAddress(result.values.repo_address);
    if (!source) {
        alert("课程仓库地址无效");
        return null;
    }

    return {
        source: {
            ...source,
            single_course_repo: true,
            publish_path: "",
        },
        token_override: "",
        create_repo_if_missing: true,
        repo_private: false,
    };
}

async function publishCourse() {
    const meta = getCreateMetaFromForm();
    const localPath = document.getElementById("resources-create-local-path")?.value.trim() || "";
    const statusEl = document.getElementById("resources-publish-status");
    if (statusEl) statusEl.textContent = "正在发布...";

    const effectiveSections = getEffectiveSections();
    if (countExperimentsInSections(effectiveSections) < 1) {
        if (statusEl) statusEl.textContent = "发布前至少配置 1 个实验";
        alert("发布前至少配置 1 个实验");
        return;
    }

    if (resourcesState.createSource === "local" && !resourcesState.scannedCourse) {
        await saveCourseStructure();
        if (!resourcesState.scannedCourse) {
            if (statusEl) statusEl.textContent = "发布失败，请先保存课程结构";
            return;
        }
    }

    const coverDataUrl =
        meta.coverDataUrl && meta.coverDataUrl.startsWith("data:")
            ? meta.coverDataUrl
            : "";

    const baseCourse =
        resourcesState.editingCourseId && resourcesState.localCourses.length
            ? resourcesState.localCourses.find((item) => item.id === resourcesState.editingCourseId)
            : null;
    const resourceToPublish = buildCourseFromForm(baseCourse);
    resourceToPublish.sections = effectiveSections;
    resourceToPublish.local_path = localPath;

    let publishSource = getCourseOrigin(resourceToPublish);
    let tokenOverride = "";
    let createRepoIfMissing = true;
    let repoPrivate = false;

    if (!publishSource) {
        const promptResult = await openPublishSourceConfigModal(null);
        if (!promptResult) {
            if (statusEl) statusEl.textContent = "已取消发布";
            return;
        }
        publishSource = promptResult.source;
        tokenOverride = promptResult.token_override;
        createRepoIfMissing = promptResult.create_repo_if_missing;
        repoPrivate = promptResult.repo_private;
    }

    const preparedToken = await ensureTokenForPublishFlow(publishSource, tokenOverride);
    if (preparedToken === null) {
        if (statusEl) statusEl.textContent = "已取消发布";
        return;
    }
    tokenOverride = preparedToken;
    const writeToken = await ensureWriteTokenForPublish(tokenOverride);
    if (!writeToken) {
        if (statusEl) statusEl.textContent = "已取消发布";
        return;
    }
    tokenOverride = writeToken;

    try {
        const response = await apiClient.post("/api/resources/publish", {
            local_path: localPath,
            course_id: meta.courseId || resourceToPublish.id || (resourcesState.scannedCourse && resourcesState.scannedCourse.id) || "",
            version: meta.version || (resourcesState.scannedCourse && resourcesState.scannedCourse.version) || "",
            publish_mode: "pr",
            single_course_repo: true,
            publish_source: publishSource
                ? {
                    id: publishSource.source_id || "override",
                    ...publishSource,
                }
                : undefined,
            token_override: tokenOverride || undefined,
            create_repo_if_missing: createRepoIfMissing,
            repo_private: repoPrivate,
            meta_override: {
                title: meta.title,
                description: meta.description,
                grade: meta.grade,
                subject: meta.subject,
                author: meta.author,
                tags: meta.tags,
                version: meta.version,
                cover_data_url: coverDataUrl
            }
        });
        if (!response.success) {
            throw new Error(response.message || "发布失败");
        }
        resourcesState.publishStatus = "success";
        const prUrl = response?.result?.pull_request?.url || response?.pr_url || "";
        const reusedPr = Boolean(response?.result?.pull_request?.existing);
        const mergedCourse = mergeOriginAndSync(resourceToPublish, response, publishSource);
        await persistCourseToDisk(mergedCourse, apiClient);
        upsertLocalCourseRecord(mergedCourse);
        if (statusEl) {
            statusEl.textContent = prUrl
                ? (reusedPr ? "发布成功，已更新现有 PR" : "发布成功，已创建 PR")
                : "发布成功，已同步到 Gitea";
        }
        if (prUrl) {
            const shouldOpenPr = await openResourcesConfirm({
                title: "发布成功",
                message: reusedPr ? "已更新现有 PR，是否现在打开查看？" : "已创建 PR，是否现在打开查看？",
                confirmText: "打开",
                cancelText: "稍后",
            });
            if (shouldOpenPr) {
                openExternal(prUrl);
            }
        }
        await loadResourcesIndex();
        showListView();
    } catch (error) {
        resourcesState.publishStatus = "error";
        let message = extractApiErrorMessage(error, "发布失败");
        if (message.includes("写操作需要 Token") || isAuthRelatedErrorMessage(message)) {
            const token = await promptTokenForPublish({
                title: "上传课程需要访问令牌",
                message: "仓库可读取，但上传更新需要写权限。请输入访问令牌后重试。",
                confirmText: "继续发布",
                defaultValue: tokenOverride || (await resolvePublishRetryToken("")),
            });
            if (token) {
                try {
                    const retry = await apiClient.post("/api/resources/publish", {
                        local_path: localPath,
                        course_id: meta.courseId || resourceToPublish.id || "",
                        version: meta.version || (resourcesState.scannedCourse && resourcesState.scannedCourse.version) || "",
                        publish_mode: "pr",
                        single_course_repo: true,
                        publish_source: publishSource
                            ? {
                                id: publishSource.source_id || "override",
                                ...publishSource,
                            }
                            : undefined,
                        token_override: token.trim(),
                        create_repo_if_missing: createRepoIfMissing,
                        repo_private: repoPrivate,
                        meta_override: {
                            title: meta.title,
                            description: meta.description,
                            grade: meta.grade,
                            subject: meta.subject,
                            author: meta.author,
                            tags: meta.tags,
                            version: meta.version,
                            cover_data_url: coverDataUrl
                        }
                    });
                    if (!retry.success) throw new Error(retry.message || "发布失败");
                    const mergedCourse = mergeOriginAndSync(resourceToPublish, retry, publishSource);
                    await persistCourseToDisk(mergedCourse, apiClient);
                    upsertLocalCourseRecord(mergedCourse);
                    const retryPrUrl = retry?.result?.pull_request?.url || retry?.pr_url || "";
                    if (statusEl) statusEl.textContent = "发布成功，已创建或更新 PR";
                    if (retryPrUrl) {
                        const shouldOpenPr = await openResourcesConfirm({
                            title: "发布成功",
                            message: "是否打开 PR 页面？",
                            confirmText: "打开",
                            cancelText: "稍后",
                        });
                        if (shouldOpenPr) {
                            openExternal(retryPrUrl);
                        }
                    }
                    await loadResourcesIndex();
                    showListView();
                    return;
                } catch (retryError) {
                    message = extractApiErrorMessage(retryError, "发布失败");
                }
            } else {
                message = "已取消发布（未填写访问令牌）";
            }
        }
        if (statusEl) statusEl.textContent = message;
        alert(`发布失败：${message}`);
    }
}

function loadLocalCourses() {
    try {
        const raw = localStorage.getItem(localCoursesKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((item) => {
            const course = stripRemovedIntegrationMetadata({ ...(item || {}), source: "local" });
            const origin = normalizeOrigin(course.origin || {});
            if (origin) course.origin = origin;
            return course;
        });
    } catch (error) {
        console.warn("读取本地课程失败:", error);
        return [];
    }
}

async function refreshLocalCoursesFromDisk(courses = []) {
    if (!Array.isArray(courses) || !courses.length) return [];
    const refreshed = await Promise.all(courses.map(async (course) => {
        const localPath = (course?.local_path || "").toString().trim();
        if (!localPath) return course;
        try {
            const response = await apiClient.post("/api/resources/scan", {
                local_path: localPath,
                init_if_missing: false,
                auto_build: false,
            });
            if (response?.success && response.course) {
                return stripRemovedIntegrationMetadata({
                    ...course,
                    ...response.course,
                    local_path: localPath,
                    source: "local",
                    origin: course.origin || response.course.origin,
                    sync: course.sync || response.course.sync,
                });
            }
        } catch (error) {
            console.warn("刷新本地课程失败，继续使用缓存:", localPath, error);
        }
        return course;
    }));
    return refreshed;
}

function saveLocalCourses(list) {
    try {
        localStorage.setItem(localCoursesKey, JSON.stringify(list));
    } catch (error) {
        console.warn("保存本地课程失败:", error);
    }
}

function shouldClearDemoCourseBinding(course) {
    if (!course || course.source !== "local") return false;
    if (!course.origin) return false;
    const id = (course.id || "").toString().trim();
    const title = (course.title || "").toString().trim();
    return id === "demo-ai-course" || title === "AI 课堂演示课程";
}

async function clearDemoCourseBindingIfNeeded(courses = []) {
    try {
        const migrated = localStorage.getItem(clearDemoCourseBindingMigrationKey);
        if (migrated === "done") {
            return courses;
        }
        if (!Array.isArray(courses) || !courses.length) {
            localStorage.setItem(clearDemoCourseBindingMigrationKey, "done");
            return courses;
        }

        const changedCourses = [];
        const next = courses.map((course) => {
            if (!shouldClearDemoCourseBinding(course)) {
                return course;
            }
            const nextCourse = { ...(course || {}) };
            delete nextCourse.origin;
            if (nextCourse.sync && typeof nextCourse.sync === "object") {
                const nextSync = { ...nextCourse.sync };
                delete nextSync.last_pr_url;
                if (!Object.keys(nextSync).length) {
                    delete nextCourse.sync;
                } else {
                    nextCourse.sync = nextSync;
                }
            }
            changedCourses.push(nextCourse);
            return nextCourse;
        });

        if (!changedCourses.length) {
            localStorage.setItem(clearDemoCourseBindingMigrationKey, "done");
            return courses;
        }

        saveLocalCourses(next);
        localStorage.setItem(clearDemoCourseBindingMigrationKey, "done");
        for (const course of changedCourses) {
            await persistCourseToDisk(course, apiClient);
        }
        return next;
    } catch (error) {
        console.warn("清理课程仓库绑定失败:", error);
        return courses;
    }
}

function parseBool(value, fallback = false) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
    }
    if (value === undefined || value === null) return fallback;
    return Boolean(value);
}

async function loadClassroomConfig() {
    try {
        const response = await apiClient.loadConfig();
        if (!response?.success) return false;
        const uiConfig = response.config?.ui || {};
        resourcesState.classroomConfig = {
            autoDiscover: uiConfig.classroom_auto_discover !== false,
            name: uiConfig.classroom_name || "",
            teacherCodeConfigured: isTeacherCodeConfigured(response),
        };
        return true;
    } catch (error) {
        console.warn("加载课堂配置失败:", error);
        return false;
    }
}

function openPythonSetup() {
    window.app?.system?.updateSettingsVisibility?.(false, { allowPythonSetup: true });
    window.app?.ui?.showTab?.("settings", document.getElementById("nav-settings-item"));
    window.app?.system?.showSettingsTab?.("python");
}

async function isBackendReady() {
    const getBackendStartupState = window.electronAPI?.getBackendStartupState;
    if (typeof getBackendStartupState !== "function") return true;
    try {
        const result = await getBackendStartupState();
        if (!result?.state) return true;
        return result.state.status === "ready";
    } catch (_) {
        return true;
    }
}

function updateTeacherModeUI() {
    const buttons = Array.from(document.querySelectorAll('[data-role="teacher-mode-toggle"]'));
    buttons.forEach((btn) => {
        const label = btn.querySelector('[data-role="teacher-mode-label"]');
        if (resourcesState.teacherMode.unlocked) {
            btn.classList.add("is-active");
            if (label) {
                label.textContent = getTeacherToggleLabel(true);
            } else {
                btn.textContent = getTeacherToggleLabel(true);
            }
        } else {
            btn.classList.remove("is-active");
            if (label) {
                label.textContent = getTeacherToggleLabel(false);
            } else {
                btn.textContent = getTeacherToggleLabel(false);
            }
        }
    });
    const addBtn = document.getElementById("resources-add-btn");
    const submitBtn = document.getElementById("resources-submit-btn");
    const createSubmitBtn = document.getElementById("resources-create-submit-btn");
    if (addBtn) {
        addBtn.style.display = resourcesState.teacherMode.unlocked ? "inline-flex" : "none";
    }
    if (submitBtn) {
        submitBtn.style.display = resourcesState.teacherMode.unlocked ? "inline-flex" : "none";
    }
    if (createSubmitBtn) {
        createSubmitBtn.style.display = resourcesState.teacherMode.unlocked ? "inline-flex" : "none";
    }
    if (!resourcesState.teacherMode.unlocked) {
        closeCreateEntryMenu();
    }
    try {
        if (window.app && window.app.system && typeof window.app.system.updateSettingsVisibility === "function") {
            if (!resourcesState.openingStudentLessonTab) {
                resourcesState.pendingTeacherModeShellSync = false;
                window.app.system.updateSettingsVisibility(Boolean(resourcesState.teacherMode.unlocked), {
                    allowPythonSetup: !resourcesState.teacherMode.unlocked && !resourcesState.teacherModeReady,
                });
            } else {
                resourcesState.pendingTeacherModeShellSync = true;
            }
        }
    } catch (error) {
        console.warn("更新设置页教师模式可见性失败:", error);
    }
}

function exitTeacherMode() {
    resourcesState.teacherMode = clearTeacherModeSession();
    updateTeacherModeUI();
}

async function requestTeacherCodeVerification(code) {
    const response = await apiClient.post("/api/classroom/verify-teacher", { teacher_code: code || "" });
    return Boolean(response?.success);
}

async function verifyTeacherCode(code) {
    try {
        return await requestTeacherCodeVerification(code);
    } catch (_) {
        return false;
    }
}

function loadTeacherModeState() {
    const restored = readTeacherModeState();
    resourcesState.teacherMode = {
        unlocked: Boolean(restored.unlocked),
        code: restored.code || "",
    };
    updateTeacherModeUI();
}

async function ensureTeacherModeReady(force = false) {
    if (!force && resourcesState.teacherModeReady && resourcesState.classroomConfig.teacherCodeConfigured) {
        updateTeacherModeUI();
        return true;
    }
    if (!await isBackendReady()) {
        resourcesState.teacherModeReady = false;
        return false;
    }
    const loaded = await loadClassroomConfig();
    if (!loaded) {
        resourcesState.teacherModeReady = false;
        return false;
    }
    loadTeacherModeState();
    resourcesState.teacherModeReady = true;
    return true;
}

async function unlockTeacherMode() {
    if (resourcesState.teacherMode.unlocked) return true;
    const ready = await ensureTeacherModeReady();
    if (!ready) {
        openPythonSetup();
        notifyUser("请先在设置中选择并确认本机 Python，后端就绪后再设置教师口令。", "warning");
        return false;
    }
    if (!resourcesState.classroomConfig.teacherCodeConfigured) {
        const updated = await window.app?.system?.ensureTeacherCodeInitialized?.({ prompt: true });
        resourcesState.classroomConfig.teacherCodeConfigured = isTeacherCodeConfigured(updated);
        if (!resourcesState.classroomConfig.teacherCodeConfigured) {
            openPythonSetup();
            notifyUser("请先在设置中选择并确认本机 Python，后端就绪后再设置教师口令。", "warning");
            return false;
        }
        if (resourcesState.teacherMode.unlocked) {
            updateTeacherModeUI();
            return true;
        }
    }
    while (true) {
        const input = await openResourcesInput({
            title: "输入教师验证码",
            message: "请输入首次设置的教师验证码",
            label: "教师验证码",
            placeholder: "请输入教师验证码",
            secret: true,
            required: true,
            confirmText: "进入教师模式",
            cancelText: "取消",
        });
        if (!input) return false;
        await window.app?.jupyter?.setVisibility?.(false);
        const code = input.trim();
        const ok = await verifyTeacherCode(code);
        if (!ok) {
            alert("教师验证码错误，请重新输入");
            continue;
        }
        const remembered = await rememberTeacherMode(code);
        if (typeof window.electronAPI?.saveTeacherCredential === 'function' && !remembered.persisted) {
            notifyUser("系统安全存储不可用，无法记住教师口令，请检查系统权限后重试。", "error");
            return false;
        }
        resourcesState.teacherMode = remembered;
        updateTeacherModeUI();
        return true;
    }
}

async function ensureTeacherModeForEdit(actionLabel = "编辑") {
    if (resourcesState.teacherMode.unlocked) return true;
    const unlocked = await unlockTeacherMode();
    if (!unlocked) {
        alert(`未解锁教师模式，无法${actionLabel}`);
        return false;
    }
    if (resourcesState.currentResource) {
        renderResourceDetail(resourcesState.currentResource);
    } else {
        renderResources(resourcesState.filteredResources);
    }
    return true;
}

async function handleTeacherModeToggle() {
    await window.app?.jupyter?.setVisibility?.(false);
    if (!await ensureTeacherModeReady()) {
        openPythonSetup();
        notifyUser("请先在设置中选择并确认本机 Python，后端就绪后再设置教师口令。", "warning");
        return false;
    }
    if (resourcesState.teacherMode.unlocked) {
        const ok = await openResourcesConfirm({
            title: "退出教师模式",
            message: "确认退出教师模式？",
            confirmText: "退出",
            cancelText: "取消",
        });
        if (!ok) return false;
        exitTeacherMode();
        if (resourcesState.currentResource) {
            renderResourceDetail(resourcesState.currentResource);
        } else {
            renderResources(resourcesState.filteredResources);
        }
        return true;
    }
    const unlocked = await unlockTeacherMode();
    if (unlocked) {
        if (resourcesState.currentResource) {
            renderResourceDetail(resourcesState.currentResource);
        } else {
            renderResources(resourcesState.filteredResources);
        }
        return true;
    }
    return false;
}

function updateClassroomBanner() {
    const barEl = document.getElementById("resources-classroom-bar");
    if (barEl) {
        barEl.style.display = "none";
    }
}

function getActiveLocalCourse() {
    const candidates = [
        resourcesState.classroomState.activeCourseOriginId,
        resourcesState.classroomState.activeCourseId
    ].filter(Boolean);
    if (!candidates.length) return null;
    return resourcesState.localCourses.find((course) => candidates.includes(course.id));
}

async function syncClassroomCourses(courses = null) {
    try {
        const activeCourse = getActiveLocalCourse();
        const payloadCourses = Array.isArray(courses) ? courses : (activeCourse ? [activeCourse] : []);
        if (!payloadCourses.length) return;
        await apiClient.post("/api/classroom/sync-courses", { courses: payloadCourses });
    } catch (error) {
        console.warn("同步课堂课程失败:", error);
    }
}

function scheduleClassroomSync(courses = null) {
    if (resourcesState.classroomSyncTimer) clearTimeout(resourcesState.classroomSyncTimer);
    resourcesState.classroomSyncTimer = setTimeout(() => {
        syncClassroomCourses(courses);
    }, 300);
}

async function refreshClassroomStatus() {
    try {
        const response = await apiClient.get("/api/classroom/status");
        if (response?.success && response.status) {
            resourcesState.classroomState.active = Boolean(response.status.active);
            resourcesState.classroomState.name = response.status.name || "";
            resourcesState.classroomState.activeCourseId = response.status.active_course_id || "";
            resourcesState.classroomState.activeCourseOriginId = response.status.active_course_origin_id || "";
            resourcesState.classroomState.activeCourseTitle = response.status.active_course_title || "";
            resourcesState.classroomState.activeSectionIndex =
                response.status.active_section_index !== undefined && response.status.active_section_index !== null
                    ? Number(response.status.active_section_index)
                    : null;
            resourcesState.classroomState.activeSectionTitle = response.status.active_section_title || "";
            if (!resourcesState.classroomState.active) {
                resourcesState.classroomState.activeCourseId = "";
                resourcesState.classroomState.activeCourseOriginId = "";
                resourcesState.classroomState.activeCourseTitle = "";
                resourcesState.classroomState.activeSectionIndex = null;
                resourcesState.classroomState.activeSectionTitle = "";
            }
        }
    } catch (error) {
        console.warn("刷新课堂状态失败:", error);
    }
    updateClassroomBanner();
}

function isActiveCourse(resource) {
    if (!resource) return false;
    const resourceId = resource.id;
    return Boolean(
        resourcesState.classroomState.active &&
        resourceId &&
        (resourceId === resourcesState.classroomState.activeCourseOriginId || resourceId === resourcesState.classroomState.activeCourseId)
    );
}

function resolveLocalCourse(resource) {
    if (!resource) return null;
    if (resource.source === "local") return resource;
    if (resource.id) {
        return resourcesState.localCourses.find((course) => course.id === resource.id) || null;
    }
    return null;
}

async function startClassroomForResource(resource, forcedSectionIndex = null) {
    const wasActiveBefore = Boolean(resourcesState.classroomState.active);
    const localResource = resolveLocalCourse(resource);
    if (!localResource || !localResource.local_path) {
        alert("仅本地课程可以开启课堂");
        return;
    }
    if (!localResource.id) {
        alert("课程 ID 为空，请先补全课程信息");
        return;
    }

    if (resourcesState.classroomState.active && !isActiveCourse(localResource)) {
        const current = resourcesState.classroomState.activeCourseTitle || "其他课程";
        const ok = await openResourcesConfirm({
            title: "切换课堂",
            message: `当前课堂正在发布「${current}」，确定切换到本课程吗？`,
            confirmText: "确定切换",
            cancelText: "取消",
        });
        if (!ok) return;
    }

    const teacherCode = await ensureTeacherCode();
    if (teacherCode === null) return;

    const sections = normalizeSections(localResource);
    if (!sections.length) {
        alert("课程还没有课节，无法开启课堂");
        return;
    }
    let sectionIndex = forcedSectionIndex ?? resourcesState.activeSectionIndex ?? 0;
    if (sectionIndex < 0 || sectionIndex >= sections.length) {
        sectionIndex = 0;
    }
    resourcesState.activeSectionIndex = sectionIndex;
    const sectionTitle = sections[sectionIndex]?.title || "";

    try {
        if (!await ensureClassroomNetworkAccess()) return;
        await syncClassroomCourses([localResource]);
        const response = await apiClient.post("/api/classroom/start", {
            name: resourcesState.classroomConfig.name,
            teacher_code: teacherCode,
            course_id: localResource.id,
            section_index: sectionIndex
        });
        if (!response?.success) {
            throw new Error(response?.message || "开启课堂失败");
        }
        resourcesState.classroomState.active = true;
        resourcesState.classroomState.name = response.status?.name || resourcesState.classroomConfig.name || "";
        resourcesState.classroomState.activeCourseId = response.status?.active_course_id || "";
        resourcesState.classroomState.activeCourseOriginId = response.status?.active_course_origin_id || localResource.id || "";
        resourcesState.classroomState.activeCourseTitle = response.status?.active_course_title || localResource.title || "";
        resourcesState.classroomState.activeSectionIndex =
            response.status?.active_section_index !== undefined && response.status?.active_section_index !== null
                ? Number(response.status.active_section_index)
                : sectionIndex;
        resourcesState.classroomState.activeSectionTitle = response.status?.active_section_title || sectionTitle || "";
        if (resourcesState.teacherMode.code) {
            alert(`课堂已开启，课堂码：${resourcesState.teacherMode.code}`);
        }
        await loadResourcesIndex();
    } catch (error) {
        if (error?.status === 401) {
            exitTeacherMode();
        }
        let message = error?.message || "开启课堂失败";
        if (error?.details) {
            try {
                const parsed = JSON.parse(error.details);
                if (parsed?.message) {
                    message = parsed.message;
                }
            } catch (_) {
                message = error.details;
            }
        }
        alert(message);
    } finally {
        updateClassroomBanner();
        renderResourceDetail(localResource);
    }
}

async function stopClassroomWithPrompt() {
    const teacherCode = await ensureTeacherCode();
    if (teacherCode === null) return;
    try {
        const response = await apiClient.post("/api/classroom/stop", { teacher_code: teacherCode });
        if (!response?.success) {
            throw new Error(response?.message || "关闭课堂失败");
        }
        resourcesState.classroomState.active = false;
        resourcesState.classroomState.activeCourseId = "";
        resourcesState.classroomState.activeCourseOriginId = "";
        resourcesState.classroomState.activeCourseTitle = "";
        resourcesState.classroomState.activeSectionIndex = null;
        resourcesState.classroomState.activeSectionTitle = "";
        await loadResourcesIndex();
    } catch (error) {
        if (error?.status === 401) {
            exitTeacherMode();
        }
        let message = error?.message || "关闭课堂失败";
        if (error?.details) {
            try {
                const parsed = JSON.parse(error.details);
                if (parsed?.message) {
                    message = parsed.message;
                }
            } catch (_) {
                message = error.details;
            }
        }
        alert(message);
    } finally {
        updateClassroomBanner();
        if (resourcesState.currentResource) {
            renderResourceDetail(resourcesState.currentResource);
        }
    }
}

function buildClassroomBaseUrl(entry) {
    if (!entry) return "";
    if (entry.base_url) return entry.base_url;
    if (entry.host && entry.port) return `http://${entry.host}:${entry.port}`;
    return "";
}

function getClassroomKey(entry) {
    return entry?.server_id || `${entry?.host || ""}:${entry?.port || ""}`;
}

async function selectClassroom(list) {
    if (!Array.isArray(list) || list.length === 0) return null;
    const storedKey = localStorage.getItem(classroomSelectionKey);
    if (storedKey) {
        const matched = list.find((item) => getClassroomKey(item) === storedKey);
        if (matched) return matched;
    }
    if (list.length === 1) return list[0];

    const options = list.map((item, idx) => {
        const name = item.name || `${item.host}:${item.port}`;
        const count = item.course_count ? `（${item.course_count} 门）` : "";
        return {
            value: String(idx),
            label: `${name}${count}`,
        };
    });
    const result = await openResourcesForm({
        title: "选择课堂",
        message: "发现多个课堂，请选择要连接的课堂",
        confirmText: "连接课堂",
        cancelText: "取消",
        fields: [
            {
                name: "classroom_index",
                label: "课堂列表",
                type: "select",
                value: "0",
                options,
                required: true,
            },
        ],
    });
    if (!result?.confirmed) return null;
    const index = Number.parseInt(result.values.classroom_index || "", 10);
    if (Number.isNaN(index) || !list[index]) return null;
    const selected = list[index];
    localStorage.setItem(classroomSelectionKey, getClassroomKey(selected));
    return selected;
}

async function ensureTeacherCode() {
    if (resourcesState.teacherMode.unlocked) return resourcesState.teacherMode.code || "";
    const unlocked = await unlockTeacherMode();
    if (!unlocked) return null;
    return resourcesState.teacherMode.code || "";
}

async function ensureClassroomNetworkAccess() {
    const configResponse = await apiClient.loadConfig();
    if (!configResponse?.success) {
        throw new Error(configResponse?.message || "无法读取课堂网络设置");
    }
    const networkAccessEnabled = parseBool(configResponse.config?.ui?.allow_network_access, true);
    if (networkAccessEnabled) return true;

    const saveResponse = await apiClient.saveConfig({ ui: { allow_network_access: true } });
    if (!saveResponse?.success) {
        throw new Error(saveResponse?.message || "课堂网络设置保存失败");
    }

    const networkCheckbox = document.getElementById("allow-network-access");
    if (networkCheckbox) networkCheckbox.checked = true;

    const restartBackend = window.electronAPI?.restartBackend;
    if (typeof restartBackend !== "function") {
        throw new Error("课堂网络设置已保存，请重启 XEdu Client 后再开启课堂");
    }
    const restartResult = await restartBackend();
    if (!restartResult?.success) {
        throw new Error(restartResult?.error || "课堂网络设置应用失败，请重启 XEdu Client 后重试");
    }
    return true;
}

async function discoverClassrooms() {
    resourcesState.classroomState.searching = true;
    updateClassroomBanner();
    try {
        const response = await apiClient.get(`/api/classroom/discover?timeout=3.5`);
        if (response?.success) {
            resourcesState.classroomState.classrooms = response.classrooms || [];
            const selected = await selectClassroom(resourcesState.classroomState.classrooms);
            if (selected) {
                resourcesState.classroomState.source = {
                    ...selected,
                    base_url: buildClassroomBaseUrl(selected)
                };
                resourcesState.classroomState.connected = true;
            } else {
                resourcesState.classroomState.source = null;
                resourcesState.classroomState.connected = false;
            }
        }
    } catch (error) {
        console.warn("发现课堂失败:", error);
    } finally {
        resourcesState.classroomState.searching = false;
        updateClassroomBanner();
    }
}

async function requestManualClassroomAddress() {
    let defaultValue = "";
    try {
        defaultValue = localStorage.getItem(classroomManualAddressKey) || "";
    } catch (_) {
        defaultValue = "";
    }
    const result = await openResourcesForm({
        title: "手动连接课堂",
        message: "自动发现不到课堂时，请输入教师电脑显示的地址。示例：http://教师IP:5123",
        confirmText: "连接课堂",
        cancelText: "取消",
        fields: [{
            name: "address",
            label: "教师课堂地址",
            type: "url",
            value: defaultValue,
            placeholder: "http://教师IP:5123",
            required: true,
        }],
        validate: (values) => normalizeClassroomAddress(values.address).error || "",
    });
    if (!result?.confirmed) return null;
    return normalizeClassroomAddress(result.values.address);
}

function rememberClassroomSource(source) {
    try {
        localStorage.setItem(classroomManualAddressKey, source?.base_url || "");
    } catch (_) {
        // localStorage may be unavailable in restricted browser contexts.
    }
}

async function initClassroom() {
    resourcesState.localCourses = loadLocalCourses();
    // Classroom discovery and student course import must remain usable before
    // a teacher unlocks the management controls.
    if (!isStudentLessonMode()) {
        await ensureTeacherModeReady();
    }
    await refreshClassroomStatus();
    scheduleClassroomSync();
    if (resourcesState.classroomConfig.autoDiscover) {
        await discoverClassrooms();
    }
    updateClassroomBanner();
}

async function waitForBackendBeforeResourceRequests(timeoutMs = 125000) {
    const getStartupState = window.electronAPI?.getBackendStartupState;
    if (typeof getStartupState !== "function") return true;

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const result = await getStartupState();
            const status = result?.state?.status || result?.status;
            if (status === "ready") return true;
            if (status === "error") return false;
        } catch (_) {
            // The browser-only development path may not expose startup state.
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
}

function getText(resource, key, fallback = "-") {
    const value = resource && resource[key];
    if (value === undefined || value === null || value === "") {
        return fallback;
    }
    return value;
}

function getTags(resource) {
    if (!resource) return [];
    const tags = resource.tags || [];
    if (Array.isArray(tags)) {
        return tags.filter(Boolean).map((tag) => tag.toString());
    }
    if (typeof tags === "string") {
        return tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean);
    }
    return [];
}

function getCoverUrl(resource) {
    if (!resource) return "";
    const cover =
        resource.cover ||
        resource.cover_url ||
        resource.image ||
        resource.thumbnail ||
        resource.banner ||
        resource.poster ||
        "";
    if (!cover) return "";
    if (resource.source === "local") {
        const localCover = cover.toString().trim();
        if (/^https?:\/\//.test(localCover) || /^data:|^blob:/.test(localCover)) {
            return localCover;
        }
        if (localCover.startsWith("file://")) return "";
        return buildLocalCourseFileUrl(resource, localCover, apiClient);
    }
    return resolveResourceUrl(cover, resource);
}

function isLocalBoundCourse(resource) {
    if (!resource || resource.source !== "local") return false;
    return Boolean(getCourseOrigin(resource));
}

function getLocalCourseBindState(resource) {
    if (!resource || resource.source !== "local") return "";
    return isLocalBoundCourse(resource) ? "local_bound" : "local_unbound";
}

function getResourceActionState(resource) {
    if (!resource) return "";
    if (resource.source === "local") {
        return getLocalCourseBindState(resource);
    }
    return "remote";
}

function canEditResource(resource) {
    return Boolean(resource && resource.source === "local");
}

function getResourceIdentity(resource) {
    if (!resource) return "";
    return [
        resource.source || "",
        resource.id || "",
        resource.local_path || "",
        resource.course_url || "",
        resource.package_url || "",
    ].join("|");
}

function isStudentLessonMode() {
    if (!resourcesState.teacherMode.unlocked) return true;
    return Boolean(document.querySelector(".student-nav-item.active"));
}

function normalizeWorkspaceTabId(tabId = "route") {
    return normalizeStudentWorkspaceTabId(tabId);
}

function getWorkspaceTabConfig(tabId = resourcesState.activeCourseWorkspaceTab) {
    return getStudentWorkspaceTabConfig(tabId);
}

function getWorkspaceTabTitle(tabId = resourcesState.activeCourseWorkspaceTab) {
    return getStudentWorkspaceTabTitle(tabId, isStudentLessonMode());
}

function getWorkspaceTabDescription(tabId = resourcesState.activeCourseWorkspaceTab) {
    return getStudentWorkspaceTabDescription(tabId, isStudentLessonMode());
}

function getWorkspaceTabPageClass(tabId = resourcesState.activeCourseWorkspaceTab) {
    return getStudentWorkspacePageClass(tabId);
}

function getCurrentLessonIndex(resource) {
    const sections = normalizeSections(resource);
    if (!sections.length) return 0;
    let sectionIndex = resourcesState.activeSectionIndex;
    if (resourcesState.classroomState.active && isActiveCourse(resource) && resourcesState.classroomState.activeSectionIndex !== null) {
        sectionIndex = resourcesState.classroomState.activeSectionIndex;
    }
    if (!Number.isFinite(sectionIndex) || sectionIndex < 0 || sectionIndex >= sections.length) {
        sectionIndex = 0;
    }
    return sectionIndex;
}

function getVisibleLessonContexts(resource, sections = normalizeSections(resource)) {
    return getStudentVisibleLessonContexts(sections, getCurrentLessonIndex(resource), isStudentLessonMode());
}

function pickStudentCurrentCourse() {
    return selectStudentCurrentCourse({
        classroomState: resourcesState.classroomState,
        remoteSource: resourcesState.remoteSource,
        localCourses: resourcesState.localCourses,
        resourcesCache: resourcesState.resourcesCache,
    });
}

function syncStudentLessonNav(tabId = resourcesState.activeCourseWorkspaceTab) {
    const map = {
        route: "nav-student-lesson-item",
        experience: "nav-student-experience-item",
        visual: "nav-student-visual-item",
        python: "nav-student-python-item",
    };
    const navId = map[normalizeWorkspaceTabId(tabId)];
    document.querySelectorAll(".nav-item").forEach((item) => {
        item.classList.remove("active");
    });
    const target = document.getElementById(navId);
    if (target) target.classList.add("active");
}

function syncStudentPageBodyState(tabId = resourcesState.activeCourseWorkspaceTab) {
    const normalized = normalizeWorkspaceTabId(tabId);
    document.body.classList.toggle("student-page-route", normalized === "route");
    document.body.classList.toggle("student-page-experience", normalized === "experience");
    document.body.classList.toggle("student-page-visual", normalized === "visual");
    document.body.classList.toggle("student-page-python", normalized === "python");
}

function syncLessonPageTitle(resource, tabId = resourcesState.activeCourseWorkspaceTab) {
    const titleEl = document.getElementById("page-title");
    const subtitleEl = document.getElementById("page-subtitle");
    if (!isStudentLessonMode()) return;
    const tabTitle = getWorkspaceTabTitle(tabId);
    const sections = normalizeSections(resource || {});
    const lessonIndex = getCurrentLessonIndex(resource || {});
    const section = sections[lessonIndex] || null;
    if (titleEl) titleEl.textContent = tabTitle;
    if (subtitleEl) {
        subtitleEl.textContent = section
            ? `${section.title || `第 ${lessonIndex + 1} 课`} / ${resource?.title || "当前课程"}`
            : "等待课堂课程";
    }
}

function getExperimentStudentTasks(exp) {
    const rawTasks = exp?.student_tasks || exp?.studentTasks || exp?.tasks || [];
    if (Array.isArray(rawTasks)) {
        return rawTasks.map((task) => String(task || "").trim()).filter(Boolean);
    }
    if (typeof rawTasks === "string") {
        return rawTasks
            .split(/\n|；|;/)
            .map((task) => task.trim())
            .filter(Boolean);
    }
    return [];
}

function normalizeTextList(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || "").trim()).filter(Boolean);
    }
    if (typeof value === "string") {
        return value
            .split(/\n|；|;/)
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [];
}

function getSectionLearningObjectives(section) {
    return normalizeTextList(
        section?.learning_objectives ||
        section?.learningObjectives ||
        section?.objectives ||
        section?.goals
    );
}

function getSectionKeyPoints(section) {
    return normalizeTextList(section?.key_points || section?.keyPoints || section?.focus || section?.important_points);
}

function getSectionDifficulties(section) {
    return normalizeTextList(section?.difficulties || section?.difficulty || section?.hard_points || section?.hardPoints);
}

function buildExperimentResourceContext(resource, section, sectionIndex, exp, expIndex) {
    const overview = getExperimentFileOverview(exp);
    return {
        resource,
        section,
        sectionIndex,
        exp,
        expIndex,
        overview,
    };
}

function getResourceButtonLabel(file, kind) {
    if (kind === "html") return "打开体验";
    if (kind === "scratch") return "打开 Scratch";
    if (kind === "blockly") return "查看不支持提示";
    if (kind === "notebook") return "打开 Notebook";
    if (kind === "python") return "打开 Python";
    if (isDirectory(file)) return "打开目录";
    return "打开资源";
}

function makeExperimentResourceButton(file, context, options = {}) {
    const kind = options.kind || getEntryKindForFile(file);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn ${options.primary ? "btn-primary" : "btn-secondary"} btn-sm`;
    button.textContent = options.label || getResourceButtonLabel(file, kind);
    button.addEventListener("click", withAsyncActionErrorBoundary(async () => {
        resourcesState.activeSectionIndex = context.sectionIndex;
        resourcesState.activeExperimentIndex = context.expIndex;
        if (isStudentLessonMode() && (kind === "notebook" || kind === "python")) {
            await openStudentPythonWorkspace(context.resource, {
                section: context.section,
                sectionIndex: context.sectionIndex,
                exp: context.exp,
                expIndex: context.expIndex,
                overview: context.overview,
                file,
                files: getWorkspaceFilesForOverview(context.overview, "python"),
            });
            return;
        }
        if (isStudentLessonMode() && (kind === "scratch" || kind === "blockly")) {
            await openStudentVisualWorkspace(context.resource, {
                section: context.section,
                sectionIndex: context.sectionIndex,
                exp: context.exp,
                expIndex: context.expIndex,
                overview: context.overview,
                file,
                files: getWorkspaceFilesForOverview(context.overview, "visual"),
            });
            return;
        }
        await openExperimentEntry(file, kind, {
            resource: context.resource,
            sectionIndex: context.sectionIndex,
            expIndex: context.expIndex,
            experimentOverview: context.overview,
        });
    }, {
        fallback: "打开实验资源失败",
        logLabel: "打开实验资源失败",
    }));
    return button;
}

async function openStudentExperimentPage(tabId, context, file = null) {
    const normalized = normalizeWorkspaceTabId(tabId);
    if (!context?.resource) return null;
    resourcesState.activeCourseWorkspaceTab = normalized;
    resourcesState.activeSectionIndex = context.sectionIndex;
    resourcesState.activeExperimentIndex = context.expIndex;

    if (normalized === "python") {
        return openStudentPythonWorkspace(context.resource, {
            ...context,
            file: file || getWorkspaceFilesForOverview(context.overview, "python")[0] || null,
            files: getWorkspaceFilesForOverview(context.overview, "python"),
        });
    }

    if (normalized === "visual") {
        return openStudentVisualWorkspace(context.resource, {
            ...context,
            file: file || getWorkspaceFilesForOverview(context.overview, "visual")[0] || null,
            files: getWorkspaceFilesForOverview(context.overview, "visual"),
        });
    }

    if (shouldHideJupyterForStudentTab(normalized)) {
        await window.app?.jupyter?.setVisibility?.(false);
    }
    if (window.app?.ui?.showTab) {
        const navMap = {
            experience: "nav-student-experience-item",
            visual: "nav-student-visual-item",
            route: "nav-student-lesson-item",
        };
        window.app.ui.showTab("resources", document.getElementById(navMap[normalized] || "nav-student-lesson-item"));
    }
    showDetailView(context.resource, {
        tabId: normalized,
        sectionIndex: context.sectionIndex,
        expIndex: context.expIndex,
        preserveSection: true,
        preserveExperiment: true,
    });
    return context.resource;
}

function makeStudentRouteButton(tabId, context, options = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn ${options.primary ? "btn-primary" : "btn-secondary"} btn-sm`;
    button.textContent = options.label || getWorkspaceTabTitle(tabId);
    button.addEventListener("click", withAsyncActionErrorBoundary(async () => {
        await openStudentExperimentPage(tabId, context, options.file || null);
    }, {
        fallback: "打开实验入口失败",
        logLabel: "打开实验入口失败",
    }));
    return button;
}

function buildStudentRouteEntryCard(tabId, context, options = {}) {
    const normalized = normalizeWorkspaceTabId(tabId);
    const file = options.file || null;
    const available = Boolean(file);
    const card = document.createElement("button");
    card.type = "button";
    card.className = [
        "resources-course-entry-card",
        `is-${normalized}`,
        available ? "is-ready" : "is-empty",
        options.primary ? "is-primary" : "",
    ].filter(Boolean).join(" ");
    card.disabled = !available;

    if (available) {
        card.addEventListener("click", withAsyncActionErrorBoundary(async () => {
            await openStudentExperimentPage(normalized, context, file);
        }, {
            fallback: "打开实验入口失败",
            logLabel: "打开实验入口失败",
        }));
    }

    const icon = document.createElement("div");
    icon.className = "resources-course-entry-icon";
    icon.textContent = options.icon || "•";
    card.appendChild(icon);

    const body = document.createElement("div");
    body.className = "resources-course-entry-body";

    const title = document.createElement("div");
    title.className = "resources-course-entry-title";
    title.textContent = options.title || getWorkspaceTabTitle(normalized);
    body.appendChild(title);

    const desc = document.createElement("div");
    desc.className = "resources-course-entry-desc";
    desc.textContent = options.desc || "";
    body.appendChild(desc);

    const meta = document.createElement("div");
    meta.className = "resources-course-entry-meta";
    meta.textContent = available
        ? (options.meta || getBaseName(file.path || file.name || "") || "已配置")
        : (options.emptyMeta || "待配置");
    body.appendChild(meta);

    card.appendChild(body);

    const action = document.createElement("div");
    action.className = "resources-course-entry-action";
    action.textContent = available ? (options.action || "进入") : "暂无";
    card.appendChild(action);

    return card;
}

function getStudentRouteEntries(context) {
    const html = context.overview.htmlFiles[0] || null;
    const scratch = context.overview.scratchFiles?.[0] || null;
    const python = context.overview.notebookFiles[0] || context.overview.pythonFiles[0] || null;

    return [
        {
            tabId: "experience",
            file: html,
            icon: "▶",
            title: "互动体验",
            desc: "先看现象，理解本实验要观察什么。",
            action: "打开体验",
            meta: html ? getBaseName(html.path || html.name || "") : "",
        },
        {
            tabId: "visual",
            file: scratch,
            icon: "▦",
            title: "图形编程",
            desc: "进入 Scratch，使用积木完成任务流程。",
            action: "打开 Scratch",
            meta: scratch ? getBaseName(scratch.path || scratch.name || "") : "",
        },
        {
            tabId: "python",
            file: python,
            icon: "</>",
            title: "Python 实验",
            desc: "打开 Notebook / Python，继续代码实践。",
            action: "进入代码",
            meta: python ? getBaseName(python.path || python.name || "") : "",
        },
    ].filter((entry) => entry.file);
}

function hasStudentRouteEntries(context) {
    return getStudentRouteEntries(context).length > 0;
}

function appendStudentRouteEntryCards(parent, context) {
    const entries = getStudentRouteEntries(context);
    if (!entries.length) return;

    const grid = document.createElement("div");
    grid.className = "resources-course-entry-grid";
    entries.forEach((entry, index) => {
        grid.appendChild(buildStudentRouteEntryCard(entry.tabId, context, {
            ...entry,
            primary: index === 0,
        }));
    });
    parent.appendChild(grid);
}

function getStudentExperimentEntryCopy(tabId) {
    const normalized = normalizeWorkspaceTabId(tabId);
    if (normalized === "experience") {
        return {
            title: "互动体验",
            desc: "本页面直接展示当前实验的 HTML 体验内容。",
            empty: "当前实验没有配置互动体验页。",
            button: "查看体验页",
        };
    }
    if (normalized === "visual") {
        return {
            title: "图形编程入口",
            desc: "先确认本实验任务，再点击进入 Scratch 工作台完成积木编程。",
            empty: "当前实验没有配置 Scratch 图形编程资源。",
            button: "打开图形编程",
        };
    }
    return {
        title: "Python实验入口",
        desc: "点击后进入 Jupyter Lab，保持 Notebook / Python 编程环境。",
        empty: "当前实验没有配置 Python 实验资源。",
        button: "打开 Python实验",
    };
}

function buildStudentExperimentEntryCard(context, tabId = resourcesState.activeCourseWorkspaceTab) {
    const normalized = normalizeWorkspaceTabId(tabId);
    const copy = getStudentExperimentEntryCopy(normalized);
    const files = getWorkspaceFilesForOverview(context.overview, normalized);
    const card = document.createElement("div");
    card.className = `resources-student-entry-card is-${normalized}`;

    const header = document.createElement("div");
    header.className = "resources-student-entry-head";
    const title = document.createElement("div");
    title.className = "resources-student-entry-title";
    title.textContent = copy.title;
    header.appendChild(title);
    const badge = document.createElement("span");
    badge.className = "resource-card-badge";
    badge.textContent = files.length ? `${files.length} 个入口` : "待补充";
    header.appendChild(badge);
    card.appendChild(header);

    const desc = document.createElement("div");
    desc.className = "resources-student-entry-desc";
    desc.textContent = copy.desc;
    card.appendChild(desc);

    if (!files.length) {
        const empty = document.createElement("div");
        empty.className = "resources-course-empty";
        empty.textContent = copy.empty;
        card.appendChild(empty);
        return card;
    }

    const list = document.createElement("div");
    list.className = "resources-student-entry-list";
    files.forEach((file, index) => {
        const row = document.createElement("div");
        row.className = "resources-student-entry-row";

        const info = document.createElement("div");
        info.className = "resources-student-entry-info";
        const name = document.createElement("div");
        name.className = "resources-student-entry-name";
        name.textContent = file.name || getBaseName(file.path || "") || file.path || `入口 ${index + 1}`;
        info.appendChild(name);
        const path = document.createElement("div");
        path.className = "resources-student-entry-path";
        path.textContent = file.path || file.name || "";
        info.appendChild(path);
        row.appendChild(info);

        const actions = document.createElement("div");
        actions.className = "resources-student-entry-actions";
        actions.appendChild(makeExperimentResourceButton(file, context, {
            kind: getEntryKindForFile(file),
            label: index === 0 ? copy.button : getResourceButtonLabel(file, getEntryKindForFile(file)),
            primary: index === 0,
        }));
        row.appendChild(actions);
        list.appendChild(row);
    });
    card.appendChild(list);
    return card;
}

function buildStudentHtmlExperienceView(context) {
    const htmlFiles = Array.isArray(context?.overview?.htmlFiles) ? context.overview.htmlFiles : [];
    const primaryHtml = htmlFiles[0] || null;
    const experimentTitle = context?.exp?.title || `实验 ${Number.isFinite(context?.expIndex) ? context.expIndex + 1 : 1}`;
    const experimentDesc = String(context?.exp?.description || "").trim();
    const wrap = document.createElement("section");
    wrap.className = "resources-student-html-experience";

    const head = document.createElement("div");
    head.className = "resources-student-html-experience-head";
    const info = document.createElement("div");
    info.className = "resources-student-html-experience-info";
    const title = document.createElement("div");
    title.className = "resources-student-html-experience-title";
    title.textContent = experimentTitle;
    info.appendChild(title);
    if (experimentDesc) {
        const desc = document.createElement("div");
        desc.className = "resources-student-html-experience-desc";
        desc.textContent = experimentDesc;
        info.appendChild(desc);
    }
    const meta = document.createElement("div");
    meta.className = "resources-student-html-experience-meta";
    meta.textContent = primaryHtml
        ? `${primaryHtml.name || getBaseName(primaryHtml.path || "") || "HTML 体验页"} · ${primaryHtml.path || ""}`
        : "当前实验没有配置 HTML 体验页";
    info.appendChild(meta);
    head.appendChild(info);

    const badge = document.createElement("span");
    badge.className = "resource-card-badge";
    badge.textContent = primaryHtml
        ? htmlFiles.length > 1
            ? `${htmlFiles.length} 个体验页，当前显示第 1 个`
            : "HTML 体验页"
        : "待补充";
    head.appendChild(badge);
    wrap.appendChild(head);

    if (!primaryHtml) {
        const empty = document.createElement("div");
        empty.className = "resources-course-empty";
        empty.textContent = "本实验还没有可直接展示的互动体验页面。";
        wrap.appendChild(empty);
        return wrap;
    }

    const frameUrl =
        buildLocalCourseFileUrl(context.resource, primaryHtml.path || "", apiClient) ||
        resolveResourceUrl(primaryHtml.path || "", context.resource, {
            repoUrl: resourcesState.repoUrl,
            rawBaseUrl: resourcesState.rawBaseUrl,
            indexBranch: resourcesState.indexBranch,
        });

    if (!frameUrl) {
        const empty = document.createElement("div");
        empty.className = "resources-course-empty";
        empty.textContent = "无法解析互动体验页面地址，请检查课程文件路径。";
        wrap.appendChild(empty);
        return wrap;
    }

    const frameWrap = document.createElement("div");
    frameWrap.className = "resources-student-html-frame-wrap";
    const frame = document.createElement("iframe");
    frame.className = "resources-student-html-frame";
    frame.title = primaryHtml.name || primaryHtml.path || "互动体验";
    frame.allow = "camera *";
    frame.src = frameUrl;
    frame.loading = "eager";
    frameWrap.appendChild(frame);
    courseAiFrameBridge.attach(frame, frameUrl);
    wrap.appendChild(frameWrap);
    const openBrowserBtn = document.createElement("button");
    openBrowserBtn.type = "button";
    openBrowserBtn.className = "btn btn-secondary btn-sm resources-student-html-open";
    openBrowserBtn.textContent = "在新窗口打开体验";
    openBrowserBtn.addEventListener("click", withAsyncActionErrorBoundary(async () => {
        await openExternal(frameUrl);
    }, {
        fallback: "打开互动体验页面失败",
        logLabel: "打开互动体验页面失败",
    }));
    wrap.appendChild(openBrowserBtn);
    return wrap;
}

async function openStudentPythonWorkspace(course, context = null) {
    const resource = course || pickStudentCurrentCourse();
    if (!resource) return null;
    const target = context || findFirstExperimentWithWorkspaceFiles(resource, "python");
    const sectionIndex = Number.isFinite(target?.sectionIndex) ? target.sectionIndex : getCurrentLessonIndex(resource);
    const expIndex = Number.isFinite(target?.expIndex) ? target.expIndex : 0;
    resourcesState.activeCourseWorkspaceTab = "python";
    resourcesState.activeSectionIndex = sectionIndex;
    resourcesState.activeExperimentIndex = expIndex;
    syncStudentLessonNav("python");
    syncLessonPageTitle(resource, "python");

    const lessonTitle = target?.section?.title || `第 ${sectionIndex + 1} 课`;
    const expTitle = target?.exp?.title || "Python实验";
    const sourceLabel = target?.file
        ? `${lessonTitle} / ${expTitle}`
        : `${lessonTitle} / 本节未配置 Python 文件`;
    const file = target?.file || null;
    const fileKind = getEntryKindForFile(file);
    const workspaceTarget = resolveJupyterWorkspaceTarget({
        coursePath: resource.local_path || "",
        experimentPath: target?.exp?.path || "",
        filePath: fileKind === "notebook" || fileKind === "python" ? (file?.path || "") : "",
    });
    const openWorkspace = window.app?.workspace?.openJupyterWorkspace;
    if (openWorkspace) {
        await openWorkspace({
            projectDir: workspaceTarget.projectDir,
            filePath: workspaceTarget.filePath,
            sourceLabel,
            sourcePage: "student-python",
        }, { force: true });
        return resource;
    }
    if (file) {
        await openExperimentEntry(file, fileKind, {
            resource,
            sectionIndex,
            expIndex,
            experimentOverview: target?.overview || getExperimentFileOverview(target?.exp || {}),
        });
    }
    return resource;
}

async function openStudentVisualWorkspace(course, context = null) {
    const currentCourse = pickStudentCurrentCourse();
    const resource = currentCourse || course;
    if (!resource) return null;
    const target = context || findFirstExperimentWithWorkspaceFiles(resource, "visual");
    const sectionIndex = Number.isFinite(target?.sectionIndex) ? target.sectionIndex : getCurrentLessonIndex(resource);
    const expIndex = Number.isFinite(target?.expIndex) ? target.expIndex : 0;
    const overview = target?.overview || getExperimentFileOverview(target?.exp || {});
    const file = target?.file || getWorkspaceFilesForOverview(overview, "visual")[0] || null;

    resourcesState.activeCourseWorkspaceTab = "visual";
    resourcesState.activeSectionIndex = sectionIndex;
    resourcesState.activeExperimentIndex = expIndex;
    syncStudentLessonNav("visual");
    syncLessonPageTitle(resource, "visual");

    if (!file) {
        showDetailView(resource, {
            tabId: "visual",
            sectionIndex,
            expIndex,
            preserveSection: true,
            preserveExperiment: true,
        });
        return resource;
    }

    await window.app?.jupyter?.setVisibility?.(false);
    await openExperimentEntry(file, getEntryKindForFile(file), {
        resource,
        sectionIndex,
        expIndex,
        experimentOverview: overview,
    });
    return resource;
}

function appendExperimentTaskList(parent, tasks) {
    if (!tasks.length) return;
    const list = document.createElement("ul");
    list.className = "resources-course-task-list";
    const visibleTasks = isStudentLessonMode() ? tasks.slice(0, 2) : tasks.slice(0, 4);
    visibleTasks.forEach((task) => {
        const item = document.createElement("li");
        item.textContent = task;
        list.appendChild(item);
    });
    parent.appendChild(list);
}

function appendCourseSummaryList(parent, items) {
    if (!items.length) return;
    const list = document.createElement("ul");
    list.className = "resources-course-summary-list";
    items.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        list.appendChild(li);
    });
    parent.appendChild(list);
}

function buildCourseSummaryFocusCard(label, items, tone = "") {
    const card = document.createElement("div");
    card.className = "resources-course-focus-card";
    if (tone) card.classList.add(`is-${tone}`);

    const badge = document.createElement("div");
    badge.className = "resources-course-focus-label";
    badge.textContent = label;
    card.appendChild(badge);

    appendCourseSummaryList(card, items);
    return card;
}

function buildCourseWorkspaceSummary(resource, sectionEntries) {
    const sectionContexts = normalizeSectionContexts(sectionEntries);
    const summary = document.createElement("div");
    summary.className = "resources-course-summary";
    if (isStudentLessonMode()) {
        summary.classList.add("is-student-lesson");
    }

    const text = document.createElement("div");
    text.className = "resources-course-summary-content";
    const title = document.createElement("div");
    title.className = "resources-course-summary-title";
    if (isStudentLessonMode()) {
        title.textContent = getWorkspaceTabTitle(resourcesState.activeCourseWorkspaceTab);
    } else {
        title.textContent = resourcesState.activeCourseWorkspaceTab === "route"
            ? "从学习路线开始"
            : getWorkspaceTabTitle(resourcesState.activeCourseWorkspaceTab);
    }
    text.appendChild(title);

    const current = sectionContexts[0];
    const currentSection = current?.section || null;
    const desc = document.createElement("div");
    desc.className = "resources-course-summary-desc";
    if (isStudentLessonMode()) {
        const currentDesc = currentSection?.description || getWorkspaceTabDescription(resourcesState.activeCourseWorkspaceTab);
        desc.textContent = currentDesc || "本节课的实验入口已经按课堂顺序整理。";
    } else {
        desc.textContent = getWorkspaceTabDescription(resourcesState.activeCourseWorkspaceTab) || getText(resource, "description", "");
    }
    text.appendChild(desc);

    if (isStudentLessonMode() && currentSection) {
        const objectives = getSectionLearningObjectives(currentSection);
        const keyPoints = getSectionKeyPoints(currentSection);
        const difficulties = getSectionDifficulties(currentSection);

        if (objectives.length || keyPoints.length || difficulties.length) {
            const focusGrid = document.createElement("div");
            focusGrid.className = "resources-course-focus-grid";
            if (objectives.length) {
                focusGrid.appendChild(buildCourseSummaryFocusCard("本课目标", objectives.slice(0, 4), "goal"));
            }
            if (keyPoints.length) {
                focusGrid.appendChild(buildCourseSummaryFocusCard("课程重点", keyPoints, "key"));
            }
            if (difficulties.length) {
                focusGrid.appendChild(buildCourseSummaryFocusCard("课程难点", difficulties, "hard"));
            }
            text.appendChild(focusGrid);
        }
    }

    summary.appendChild(text);
    return summary;
}

function normalizeSectionContexts(sectionEntries = []) {
    if (!Array.isArray(sectionEntries)) return [];
    return sectionEntries
        .map((entry, index) => {
            if (entry && typeof entry === "object" && Object.prototype.hasOwnProperty.call(entry, "section")) {
                return {
                    section: entry.section,
                    sectionIndex: Number.isFinite(entry.sectionIndex) ? entry.sectionIndex : index,
                };
            }
            return {
                section: entry,
                sectionIndex: index,
            };
        })
        .filter((entry) => entry.section);
}

function collectExperimentContexts(resource, sectionEntries) {
    const contexts = [];
    normalizeSectionContexts(sectionEntries).forEach(({ section, sectionIndex }) => {
        const list = Array.isArray(section?.experiments) ? section.experiments : [];
        list.forEach((exp, expIndex) => {
            contexts.push(buildExperimentResourceContext(resource, section, sectionIndex, exp, expIndex));
        });
    });
    return contexts;
}

function uniqueResourceFiles(files = []) {
    const seen = new Set();
    return files.filter((file) => {
        const key = `${file?.path || ""}|${file?.name || ""}`;
        if (!key.trim() || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function isPythonSupportFile(file) {
    const lowerPath = (file?.path || file?.name || "").toString().toLowerCase();
    if (!lowerPath) return false;
    if (lowerPath.endsWith(".doc") || lowerPath.endsWith(".docx")) return false;
    if (lowerPath.endsWith(".ppt") || lowerPath.endsWith(".pptx")) return false;
    if (lowerPath.endsWith(".pdf")) return false;
    return (
        lowerPath.includes("/data/") ||
        lowerPath.includes("/code/") ||
        lowerPath.endsWith("readme.md") ||
        lowerPath.endsWith("requirements.txt") ||
        lowerPath.endsWith(".json") ||
        lowerPath.endsWith(".csv") ||
        lowerPath.endsWith(".txt")
    );
}

function getPythonWorkspaceFiles(overview) {
    return uniqueResourceFiles([
        ...overview.notebookFiles,
        ...overview.pythonFiles,
        ...overview.codeFiles.filter((file) => !isHtmlFile(file) && !isBlocklyFile(file)),
        ...overview.otherFiles.filter((file) => isPythonSupportFile(file)),
    ]);
}

function getWorkspaceFilesForOverview(overview, tabId = resourcesState.activeCourseWorkspaceTab) {
    return getStudentWorkspaceFilesForOverview(
        { ...overview, pythonWorkspaceFiles: getPythonWorkspaceFiles(overview) },
        tabId
    );
}

function getWorkspaceEmptyText(tabId = resourcesState.activeCourseWorkspaceTab) {
    return getStudentWorkspaceEmptyText(tabId);
}

function findFirstExperimentWithWorkspaceFiles(resource, tabId = resourcesState.activeCourseWorkspaceTab) {
    const sections = normalizeSections(resource || {});
    const sectionIndex = getCurrentLessonIndex(resource || {});
    return pickFirstExperimentWithFiles({
        sections,
        sectionIndex,
        tabId,
        getOverview: getExperimentFileOverview,
        getFilesForOverview: getWorkspaceFilesForOverview,
    });
}

function pickExperimentIndexForWorkspaceTab(experiments = [], tabId = resourcesState.activeCourseWorkspaceTab, currentIndex = 0) {
    const normalized = normalizeWorkspaceTabId(tabId);
    if (normalized === "route") return currentIndex;
    const currentExperiment = experiments[currentIndex] || null;
    if (currentExperiment) {
        const currentOverview = getExperimentFileOverview(currentExperiment);
        if (getWorkspaceFilesForOverview(currentOverview, normalized).length) {
            return currentIndex;
        }
    }
    const matchedIndex = experiments.findIndex((exp) => {
        const overview = getExperimentFileOverview(exp);
        return getWorkspaceFilesForOverview(overview, normalized).length > 0;
    });
    return matchedIndex >= 0 ? matchedIndex : currentIndex;
}

function renderCourseWorkspace(resource, sections, mainPane) {
    const visibleSectionContexts = getVisibleLessonContexts(resource, sections);
    mainPane.classList.add(getWorkspaceTabPageClass(resourcesState.activeCourseWorkspaceTab));

    if (isStudentLessonMode() && resourcesState.activeCourseWorkspaceTab === "route") {
        renderLearningRouteWorkspace(mainPane, resource, visibleSectionContexts);
        return;
    }

    const summary = buildCourseWorkspaceSummary(resource, visibleSectionContexts);
    mainPane.appendChild(summary);
    renderLearningRouteWorkspace(mainPane, resource, visibleSectionContexts);
}

function renderLearningRouteWorkspace(mainPane, resource, sectionEntries) {
    const route = document.createElement("div");
    route.className = "resources-learning-route";
    if (isStudentLessonMode()) {
        route.classList.add("is-student-lesson");
    }

    let hasVisibleExperiments = false;
    normalizeSectionContexts(sectionEntries).forEach(({ section, sectionIndex }) => {
        const experiments = Array.isArray(section?.experiments) ? section.experiments : [];
        if (!experiments.length) {
            if (isStudentLessonMode()) {
                return;
            }
            const empty = document.createElement("div");
            empty.className = "resources-course-empty";
            empty.textContent = "本课还没有配置实验。";
            route.appendChild(empty);
            hasVisibleExperiments = true;
        }

        if (section.description && !isStudentLessonMode()) {
            const sectionCard = document.createElement("section");
            sectionCard.className = "resources-route-section";
            const desc = document.createElement("div");
            desc.className = "resources-route-section-desc";
            desc.textContent = section.description;
            sectionCard.appendChild(desc);
            route.appendChild(sectionCard);
        }

        experiments.forEach((exp, expIndex) => {
            const context = buildExperimentResourceContext(resource, section, sectionIndex, exp, expIndex);
            if (isStudentLessonMode() && !hasStudentRouteEntries(context)) {
                return;
            }
            route.appendChild(buildRouteExperimentCard(context));
            hasVisibleExperiments = true;
        });
    });

    if (isStudentLessonMode() && !hasVisibleExperiments) {
        const empty = document.createElement("div");
        empty.className = "resources-course-empty";
        empty.textContent = "本节暂无实验内容。";
        route.appendChild(empty);
    }

    mainPane.appendChild(route);
}

function buildRouteExperimentCard(context) {
    const card = document.createElement("article");
    card.className = "resources-route-exp";

    if (isStudentLessonMode()) {
        const head = document.createElement("div");
        head.className = "resources-route-exp-head";
        const title = document.createElement("div");
        title.className = "resources-route-exp-title";
        title.textContent = context.exp.title || `实验 ${context.expIndex + 1}`;
        head.appendChild(title);

        card.appendChild(head);

        if (context.exp.description) {
            const desc = document.createElement("div");
            desc.className = "resources-route-exp-desc";
            desc.textContent = context.exp.description;
            card.appendChild(desc);
        }

        appendExperimentTaskList(card, getExperimentStudentTasks(context.exp));
        appendStudentRouteEntryCards(card, context);
        return card;
    }

    const head = document.createElement("div");
    head.className = "resources-route-exp-head";
    const title = document.createElement("div");
    title.className = "resources-route-exp-title";
    title.textContent = context.exp.title || `实验 ${context.expIndex + 1}`;
    head.appendChild(title);

    const resourceKinds = [];
    if (context.overview.htmlFiles.length) resourceKinds.push("互动体验");
    if (context.overview.scratchFiles.length) resourceKinds.push("Scratch");
    if (context.overview.blocklyFiles.length) resourceKinds.push("旧图形资源（不支持）");
    if (context.overview.notebookFiles.length || context.overview.pythonFiles.length) {
        resourceKinds.push("Python编程");
    }
    const kind = document.createElement("div");
    kind.className = "resources-route-exp-kind";
    kind.textContent = resourceKinds.join(" / ") || "资源待补充";
    head.appendChild(kind);
    card.appendChild(head);

    if (context.exp.description) {
        const desc = document.createElement("div");
        desc.className = "resources-route-exp-desc";
        desc.textContent = context.exp.description;
        card.appendChild(desc);
    }

    appendExperimentTaskList(card, getExperimentStudentTasks(context.exp));

    const actions = document.createElement("div");
    actions.className = "resources-course-actions";
    const html = context.overview.htmlFiles[0];
    const blockly = context.overview.blocklyFiles[0];
    const python = context.overview.notebookFiles[0] || context.overview.pythonFiles[0];
    if (html) {
        actions.appendChild(makeStudentRouteButton("experience", context, {
            label: "进入互动体验",
            primary: !blockly && !python,
            file: html,
        }));
    }
    if (blockly) {
        actions.appendChild(makeStudentRouteButton("visual", context, {
            label: isStudentLessonMode() ? "进入图形编程" : "进入可视化编程",
            primary: isStudentLessonMode(),
            file: blockly,
        }));
    }
    if (python) {
        actions.appendChild(makeStudentRouteButton("python", context, {
            label: isStudentLessonMode() ? "进入Python实验" : "进入Python编程",
            primary: !blockly && !html,
            file: python,
        }));
    }
    if (!actions.children.length) {
        const empty = document.createElement("span");
        empty.className = "resources-course-muted";
        empty.textContent = "暂无可打开资源";
        actions.appendChild(empty);
    }
    card.appendChild(actions);
    return card;
}

function getMutableSections(resource) {
    if (!resource) return null;
    if (Array.isArray(resource.sections)) return resource.sections;
    if (Array.isArray(resource.lessons)) return resource.lessons;
    if (Array.isArray(resource.modules)) return resource.modules;
    if (Array.isArray(resource.experiments)) {
        resource.sections = [{ title: "实验列表", experiments: resource.experiments }];
        return resource.sections;
    }
    return null;
}

function getMutableExperiments(section) {
    if (!section) return null;
    if (Array.isArray(section.experiments)) {
        return { list: section.experiments, key: "experiments" };
    }
    if (Array.isArray(section.items)) {
        return { list: section.items, key: "items" };
    }
    return null;
}

function persistLocalCoursesState() {
        persistLocalCourses(resourcesState.localCourses, saveLocalCourses, scheduleClassroomSync);
    resourcesState.resourcesCache = resourcesState.localCourses.slice();
}

function uniqueValues(list) {
    return Array.from(new Set(list.filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "zh-CN")
    );
}

function buildFilterOptions() {
    const gradeSelect = document.getElementById("resources-filter-grade");
    const subjectSelect = document.getElementById("resources-filter-subject");
    const tagSelect = document.getElementById("resources-filter-tag");

    if (!gradeSelect || !subjectSelect || !tagSelect) return;

    const grades = uniqueValues(resourcesState.resourcesCache.map((item) => item.grade));
    const subjects = uniqueValues(resourcesState.resourcesCache.map((item) => item.subject));
    const tags = uniqueValues(resourcesState.resourcesCache.flatMap((item) => getTags(item)));

    fillSelectOptions(gradeSelect, grades, "全部年级");
    fillSelectOptions(subjectSelect, subjects, "全部学科");
    fillSelectOptions(tagSelect, tags, "全部标签");
    updateResourcesSearchUI();
}

function fillSelectOptions(select, values, placeholder) {
    const current = select.value;
    select.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = placeholder;
    select.appendChild(defaultOption);

    values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    });

    if (current) {
        select.value = current;
    }
}

function hasActiveResourceFilters() {
    return Boolean(
        (filterState.query || "").trim() ||
        (filterState.grade || "").trim() ||
        (filterState.subject || "").trim() ||
        (filterState.tag || "").trim()
    );
}

function updateResourcesSearchUI({ focus = false } = {}) {
    const bar = document.getElementById("resources-filter-bar");
    const toggleBtn = document.getElementById("resources-search-toggle-btn");
    const searchInput = document.getElementById("resources-search-input");
    const visible = resourcesState.resourcesSearchExpanded || hasActiveResourceFilters();
    if (bar) {
        bar.style.display = visible ? "flex" : "none";
    }
    if (toggleBtn) {
        toggleBtn.classList.toggle("is-active", visible);
    }
    if (focus && visible && searchInput) {
        requestAnimationFrame(() => searchInput.focus());
    }
}

function applyFilters() {
    if (resourcesState.currentResource && !isStudentLessonMode()) {
        showListView();
    }
    let filtered = resourcesState.resourcesCache.slice();

    if (filterState.query) {
        const query = normalizeText(filterState.query);
        filtered = filtered.filter((item) => {
            const haystack = [
                item.title,
                item.id,
                item.grade,
                item.subject,
                item.author,
                item.school,
                ...getTags(item)
            ]
                .map(normalizeText)
                .join(" ");
            return haystack.includes(query);
        });
    }

    if (filterState.grade) {
        filtered = filtered.filter(
            (item) => getText(item, "grade", "") === filterState.grade
        );
    }

    if (filterState.subject) {
        filtered = filtered.filter(
            (item) => getText(item, "subject", "") === filterState.subject
        );
    }

    if (filterState.tag) {
        filtered = filtered.filter((item) => getTags(item).includes(filterState.tag));
    }

    resourcesState.filteredResources = filtered;
    pageState.current = 1;
    renderResources(resourcesState.filteredResources);
    updateResourcesSearchUI();
}

function setResourcesListToolbarForStudent(tabId = resourcesState.activeCourseWorkspaceTab) {
    const title = document.querySelector("#resources-list-view .resources-title");
    const count = document.getElementById("resources-count");
    if (title) title.textContent = getWorkspaceTabTitle(tabId);
    if (count) count.textContent = "只显示当前课程";
}

function buildAddCard() {
    const card = document.createElement("div");
    card.className = "resource-card resource-card-add";
    card.dataset.action = "create";

    const icon = document.createElement("div");
    icon.className = "resource-add-icon";
    icon.textContent = "+";
    card.appendChild(icon);

    const title = document.createElement("div");
    title.className = "resource-add-title";
    title.textContent = "导入课程";
    card.appendChild(title);

    const hint = document.createElement("div");
    hint.className = "resource-add-hint";
    hint.textContent = "导入本地课程包或云端课程";
    card.appendChild(hint);

    return card;
}

function buildPlaceholderCard() {
    const card = document.createElement("div");
    card.className = "resource-card resource-card-placeholder";
    card.setAttribute("aria-hidden", "true");

    const icon = document.createElement("div");
    icon.className = "resource-placeholder-icon";
    icon.textContent = "•";
    card.appendChild(icon);

    const title = document.createElement("div");
    title.className = "resource-placeholder-title";
    title.textContent = "空位";
    card.appendChild(title);

    return card;
}

function renderResources(list = []) {
    const container = document.getElementById("resources-list");
    const empty = document.getElementById("resources-empty");
    const count = document.getElementById("resources-count");
    const prevBtn = document.getElementById("resources-prev-btn");
    const nextBtn = document.getElementById("resources-next-btn");
    const indicator = document.getElementById("resources-page-indicator");
    const paginationBar = document.getElementById("resources-pagination-bar");

    if (!container || !empty) return;

    container.innerHTML = "";
    container.classList.remove("is-empty");
    resourcesState.displayedResources = [];

    if (isStudentLessonMode()) {
        const course = pickStudentCurrentCourse();
        if (course) {
            resourcesState.activeSectionIndex = getCurrentLessonIndex(course);
            showDetailView(course, { tabId: resourcesState.activeCourseWorkspaceTab, preserveExperiment: true });
            return;
        }
        renderStudentLessonEmpty(resourcesState.activeCourseWorkspaceTab);
        return;
    }

    if (count) {
        count.textContent = `${list.length} 门课程`;
    }

    const totalPages = Math.max(1, Math.ceil(list.length / pageState.size));
    if (pageState.current > totalPages) {
        pageState.current = totalPages;
    }
    if (pageState.current < 1) {
        pageState.current = 1;
    }

    if (indicator) {
        indicator.textContent = `${pageState.current} / ${totalPages}`;
    }
    if (paginationBar) {
        paginationBar.style.display = totalPages > 1 ? "flex" : "none";
    }
    if (prevBtn) {
        prevBtn.disabled = pageState.current <= 1;
    }
    if (nextBtn) {
        nextBtn.disabled = pageState.current >= totalPages;
    }

    if (!list.length) {
        container.classList.add("is-empty");
        empty.style.display = "flex";
        if (filterState.query || filterState.grade || filterState.subject || filterState.tag) {
            empty.textContent = "没有匹配课程";
        } else {
            renderLearningSpaceEmpty(empty);
        }
        if (paginationBar) {
            paginationBar.style.display = "none";
        }
        return;
    }

    empty.style.display = "none";
    container.classList.remove("is-empty");

    const start = (pageState.current - 1) * pageState.size;
    const pageItems = list.slice(start, start + pageState.size);
    resourcesState.displayedResources = pageItems;

    pageItems.forEach((resource, index) => {
        const card = document.createElement("div");
        card.className = "resource-card";
        card.dataset.resourceIndex = index.toString();

        if (isActiveCourse(resource)) {
            card.classList.add("is-active-experiment");
        }

        const cover = document.createElement("div");
        cover.className = "resource-card-cover";
        const coverUrl = getCoverUrl(resource);
        if (coverUrl) {
            cover.style.backgroundImage = `url('${coverUrl}')`;
        } else {
            cover.classList.add("is-empty");
            cover.style.backgroundImage = `url('${COURSE_PLACEHOLDER_URL}')`;
        }
        card.appendChild(cover);

        const header = document.createElement("div");
        header.className = "resource-card-header";

        const title = document.createElement("div");
        title.className = "resource-card-title";
        title.textContent = getText(resource, "title", "未命名课程");
        header.appendChild(title);

        const badgeText = getText(resource, "grade", "").trim() || getText(resource, "subject", "").trim() || "课程";
        const badge = document.createElement("div");
        badge.className = "resource-card-badge";
        badge.textContent = badgeText;
        
        const lowerText = badgeText.toLowerCase();
        let badgeClass = "badge-default";
        if (lowerText.includes("7") || lowerText.includes("七")) {
            badgeClass = "badge-grade-7";
        } else if (lowerText.includes("8") || lowerText.includes("八")) {
            badgeClass = "badge-grade-8";
        } else if (lowerText.includes("9") || lowerText.includes("九")) {
            badgeClass = "badge-grade-9";
        } else if (lowerText.includes("ai") || lowerText.includes("人工智能") || lowerText.includes("智能")) {
            badgeClass = "badge-subject-ai";
        } else if (lowerText.includes("python") || lowerText.includes("编程") || lowerText.includes("代码")) {
            badgeClass = "badge-subject-python";
        }
        badge.classList.add(badgeClass);
        header.appendChild(badge);

        card.appendChild(header);

        const desc = document.createElement("div");
        desc.className = "resource-card-desc";
        desc.textContent = getText(resource, "description", "");
        if (desc.textContent) {
            card.appendChild(desc);
        }

        const experimentCount = normalizeSections(resource).reduce(
            (sum, section) => sum + (Array.isArray(section.experiments) ? section.experiments.length : 0),
            0
        );
        const experimentCountLabel = document.createElement("div");
        experimentCountLabel.className = "resource-card-experiment-count";
        experimentCountLabel.innerHTML = `<span class="experiment-count-icon">🧪</span><span class="experiment-count-num">${experimentCount}</span> 个实验`;
        card.appendChild(experimentCountLabel);

        if (resource.source !== "local" && resource._source_name) {
            const sourceTag = document.createElement("div");
            sourceTag.className = "resources-create-hint";
            sourceTag.style.marginBottom = "4px";
            sourceTag.textContent = `来源：${resource._source_name}`;
            card.appendChild(sourceTag);
        }

        if (resourcesState.teacherMode.unlocked) {
            const meta = document.createElement("div");
            meta.className = "resource-card-meta";
            appendMeta(meta, "作者", getText(resource, "author"));
            appendMeta(meta, "学科", getText(resource, "subject"));
            appendMeta(meta, "更新", getText(resource, "updated_at"));
            card.appendChild(meta);

            const tags = getTags(resource);
            if (tags.length) {
                const tagWrap = document.createElement("div");
                tagWrap.className = "resource-card-tags";
                tags.forEach((tag) => {
                    const tagEl = document.createElement("span");
                    tagEl.className = "resource-card-tag";
                    tagEl.textContent = tag;
                    tagWrap.appendChild(tagEl);
                });
                card.appendChild(tagWrap);
            }
        }

        const actions = document.createElement("div");
        actions.className = "resource-card-actions";

        const detailBtn = document.createElement("button");
        detailBtn.className = "btn btn-primary";
        detailBtn.textContent = "进入课程";
        detailBtn.dataset.action = "detail";
        actions.appendChild(detailBtn);

        const lastLearning = getLastLearning(resource);
        if (lastLearning) {
            const continueBtn = document.createElement("button");
            continueBtn.className = "btn btn-secondary";
            continueBtn.textContent = `继续学习：第${lastLearning.sectionIndex + 1}课`;
            continueBtn.dataset.action = "detail";
            actions.appendChild(continueBtn);
        }

        if (resource.homepage) {
            const linkBtn = document.createElement("button");
            linkBtn.className = "btn btn-secondary";
            linkBtn.textContent = "查看详情";
            linkBtn.dataset.action = "open";
            linkBtn.dataset.url = resolveResourceUrl(resource.homepage, resource);
            actions.appendChild(linkBtn);
        }

        card.appendChild(actions);
        container.appendChild(card);
    });

    // 不再渲染空位卡片，避免课程列表出现占位
}

function renderLearningSpaceEmpty(empty) {
    empty.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "resources-learning-space-empty";

    const eyebrow = document.createElement("div");
    eyebrow.className = "resources-learning-space-eyebrow";
    eyebrow.textContent = "学习空间";
    wrap.appendChild(eyebrow);

    const title = document.createElement("div");
    title.className = "resources-learning-space-title";
    title.textContent = "先添加一门课程，再开始实验";
    wrap.appendChild(title);

    const desc = document.createElement("div");
    desc.className = "resources-learning-space-desc";
    desc.textContent = "这里会显示教师维护的课程。没有课程时，可以导入云端课程、导入本地课程或刷新课程列表。";
    wrap.appendChild(desc);

    const actions = document.createElement("div");
    actions.className = "resources-learning-space-actions";
    [
        { label: "导入云端课程", action: "cloud-import", primary: true },
        { label: "导入本地课程", action: "import-local" },
        { label: "刷新课程列表", action: "refresh" },
    ].forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `btn ${item.primary ? "btn-primary" : "btn-secondary"}`;
        button.dataset.learningSpaceAction = item.action;
        button.textContent = item.label;
        actions.appendChild(button);
    });
    wrap.appendChild(actions);
    empty.appendChild(wrap);
}

async function requestStudentClassroomCode() {
    return openResourcesInput({
        title: "加入课堂",
        label: "课堂码",
        placeholder: "留空自动发现",
        required: false,
        confirmText: "加入课堂",
        cancelText: "取消",
    });
}

function renderStudentLessonEmpty(tabId = resourcesState.activeCourseWorkspaceTab) {
    const listView = document.getElementById("resources-list-view");
    const detailView = document.getElementById("resources-detail-view");
    const createView = document.getElementById("resources-create-view");
    const container = document.getElementById("resources-list");
    const empty = document.getElementById("resources-empty");
    const paginationBar = document.getElementById("resources-pagination-bar");
    resourcesState.currentResource = null;
    if (listView) listView.style.display = "flex";
    if (detailView) detailView.style.display = "none";
    if (createView) createView.style.display = "none";
    if (container) container.innerHTML = "";
    if (container) container.classList.add("is-empty");
    if (paginationBar) paginationBar.style.display = "none";
    setResourcesListToolbarForStudent(tabId);
    syncStudentLessonNav(tabId);
    syncLessonPageTitle(null, tabId);
    if (!empty) return;

    empty.style.display = "flex";
    empty.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "resources-student-empty";

    const title = document.createElement("div");
    title.className = "resources-student-empty-title";
    title.textContent = "还没有当前课程";
    wrap.appendChild(title);

    const desc = document.createElement("div");
    desc.className = "resources-student-empty-desc";
    desc.textContent = `${getWorkspaceTabTitle(tabId)}会在加入课堂后显示；也可以直接把课程 ZIP 或完整课程文件夹拖到上方导入区。`;
    wrap.appendChild(desc);

    const actions = document.createElement("div");
    actions.className = "resources-learning-space-actions";
    [
        { label: "加入课堂", action: "connect-classroom", primary: true },
        { label: "刷新学习空间", action: "refresh" },
    ].forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `btn ${item.primary ? "btn-primary" : "btn-secondary"}`;
        button.dataset.learningSpaceAction = item.action;
        button.textContent = item.label;
        actions.appendChild(button);
    });
    wrap.appendChild(actions);
    empty.appendChild(wrap);
}

function appendMeta(container, label, value) {
    const span = document.createElement("span");
    span.textContent = `${label}: ${value}`;
    container.appendChild(span);
}

function setActionButtonLabel(button, label) {
    if (!button) return;
    const icon = button.querySelector("svg");
    if (!icon) {
        button.textContent = label;
        return;
    }
    button.innerHTML = "";
    button.appendChild(icon);
    button.appendChild(document.createTextNode(label));
}

function formatTransferBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return "";
    if (value < 1024) return `${value} B`;
    if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 ** 3) return `${(value / (1024 ** 2)).toFixed(1)} MB`;
    return `${(value / (1024 ** 3)).toFixed(1)} GB`;
}

function renderTransferStatus(statusEl, state, message, progress) {
    if (!statusEl) return;
    const busy = ["selecting", "downloading", "writing"].includes(state);
    const messageEl = statusEl.querySelector(".resources-transfer-status-message");
    const panel = statusEl.querySelector(".resources-transfer-progress-panel");
    const progressEl = statusEl.querySelector(".resources-transfer-progress");
    const phaseEl = statusEl.querySelector(".resources-transfer-progress-phase");
    const percentEl = statusEl.querySelector(".resources-transfer-progress-percent");
    const detailEl = statusEl.querySelector(".resources-transfer-progress-detail");

    if (messageEl) {
        messageEl.textContent = message;
    } else {
        statusEl.textContent = message;
    }
    statusEl.dataset.state = state || "";
    statusEl.classList.toggle("is-visible", Boolean(message) || busy);

    if (!panel || !progressEl) return;
    panel.hidden = !busy;
    if (!busy) return;

    const rawPercent = progress?.percent;
    const hasPercent = Number.isFinite(rawPercent);
    const percent = hasPercent ? Math.max(0, Math.min(100, Math.round(rawPercent))) : null;
    if (percent === null) {
        progressEl.removeAttribute("value");
    } else {
        progressEl.value = percent;
    }
    if (percentEl) percentEl.textContent = percent === null ? "处理中" : `${percent}%`;

    const phaseLabels = {
        preparing: "准备课程",
        downloading: "下载课程",
        extracting: "解压课程包",
        validating: "校验课程",
        backing_up: "备份原课程",
        writing: "写入本地",
    };
    if (phaseEl) phaseEl.textContent = phaseLabels[progress?.phase] || (state === "writing" ? "写入本地" : "正在处理");

    const details = [];
    if (progress?.current_file) details.push(progress.current_file);
    if (progress?.total_files) details.push(`${progress.completed_files || 0}/${progress.total_files} 个文件`);
    if (progress?.total_bytes) {
        details.push(`${formatTransferBytes(progress.completed_bytes)} / ${formatTransferBytes(progress.total_bytes)}`);
    }
    if (detailEl) {
        detailEl.textContent = details.filter(Boolean).join(" · ");
        detailEl.hidden = details.length === 0;
    }
}

function setRemoteImportStatus(state, message = "", progress = null) {
    const statusEl = document.getElementById("resources-detail-import-status");
    const pullBtn = document.getElementById("resources-detail-pull");
    const busy = ["selecting", "downloading", "writing"].includes(state);
    renderTransferStatus(statusEl, state, message, progress);
    if (pullBtn) {
        pullBtn.disabled = busy;
        pullBtn.setAttribute("aria-busy", busy ? "true" : "false");
        if (busy && message) {
            setActionButtonLabel(pullBtn, message.replace(/\.\.\.$/, ""));
        } else {
            setActionButtonLabel(pullBtn, resourcesState.currentResource?.source === "local" ? "拉取更新" : "导入到本地");
        }
    }
}

function setCreateImportStatus(state, message = "", progress = null) {
    const statusEl = document.getElementById("resources-create-import-status");
    const busy = ["selecting", "downloading", "writing"].includes(state);
    renderTransferStatus(statusEl, state, message, progress);
    const packageDropZone = document.getElementById("resources-package-drop-zone");
    if (packageDropZone) {
        packageDropZone.classList.toggle("is-busy", busy);
        packageDropZone.setAttribute("aria-disabled", busy ? "true" : "false");
    }
    [
        document.getElementById("resources-pick-package-btn"),
        document.getElementById("resources-use-default-sample-btn"),
        document.getElementById("resources-pick-local-btn"),
        document.getElementById("resources-package-import-btn"),
        document.getElementById("resources-cloud-import-btn"),
        document.getElementById("resources-cloud-detail-import-btn"),
    ].filter(Boolean).forEach((button) => {
        if (busy) {
            if (!("importPreviousDisabled" in button.dataset)) {
                button.dataset.importPreviousDisabled = button.disabled ? "true" : "false";
            }
            button.disabled = true;
        } else if ("importPreviousDisabled" in button.dataset) {
            button.disabled = button.dataset.importPreviousDisabled === "true";
            delete button.dataset.importPreviousDisabled;
        }
        button.setAttribute("aria-busy", busy ? "true" : "false");
    });
}

function setResourceDropImportStatus(state, message = "", progress = null) {
    const statusEl = document.getElementById("resources-import-drop-status");
    const dropZone = document.getElementById("resources-import-drop-zone");
    const busy = ["selecting", "downloading", "writing"].includes(state);
    renderTransferStatus(statusEl, state, message, progress);
    if (dropZone) {
        dropZone.classList.toggle("is-busy", busy);
        dropZone.setAttribute("aria-busy", busy ? "true" : "false");
    }
}

function showListView() {
    const listView = document.getElementById("resources-list-view");
    const detailView = document.getElementById("resources-detail-view");
    const createView = document.getElementById("resources-create-view");
    if (listView) listView.style.display = "flex";
    if (detailView) detailView.style.display = "none";
    if (createView) createView.style.display = "none";
    resourcesState.currentResource = null;
}

function showDetailView(resource, options = {}) {
    const listView = document.getElementById("resources-list-view");
    const detailView = document.getElementById("resources-detail-view");
    if (listView) listView.style.display = "none";
    if (detailView) detailView.style.display = "flex";
    resourcesState.currentResource = resource;
    resourcesState.sectionDetailMode = false;
    resourcesState.activeCourseWorkspaceTab = normalizeWorkspaceTabId(
        options.tabId || (options.preserveTab ? resourcesState.activeCourseWorkspaceTab : "route")
    );

    const sections = normalizeSections(resource);
    const activeClassroomSection =
        isActiveCourse(resource) && resourcesState.classroomState.activeSectionIndex !== null
            ? Number(resourcesState.classroomState.activeSectionIndex)
            : null;
    const lastLearning = activeClassroomSection === null ? getLastLearning(resource) : null;
    let nextSectionIndex = Number.isFinite(options.sectionIndex) ? Number(options.sectionIndex) : null;
    if (nextSectionIndex === null) {
        if (activeClassroomSection !== null) {
            nextSectionIndex = activeClassroomSection;
        } else if (options.preserveSection) {
            nextSectionIndex = resourcesState.activeSectionIndex;
        } else if (lastLearning) {
            nextSectionIndex = Math.max(0, lastLearning.sectionIndex);
        } else {
            nextSectionIndex = 0;
        }
    }
    if (!Number.isFinite(nextSectionIndex) || nextSectionIndex < 0 || nextSectionIndex >= sections.length) {
        nextSectionIndex = 0;
    }
    resourcesState.activeSectionIndex = nextSectionIndex;

    const selectedSection = sections[resourcesState.activeSectionIndex] || null;
    const experiments = Array.isArray(selectedSection?.experiments) ? selectedSection.experiments : [];
    let nextExperimentIndex = Number.isFinite(options.expIndex) ? Number(options.expIndex) : null;
    if (nextExperimentIndex === null) {
        if (options.preserveExperiment) {
            nextExperimentIndex = resourcesState.activeExperimentIndex;
        } else if (lastLearning && lastLearning.sectionIndex === resourcesState.activeSectionIndex) {
            nextExperimentIndex = Math.max(0, lastLearning.expIndex);
        } else {
            nextExperimentIndex = 0;
        }
    }
    if (!Number.isFinite(nextExperimentIndex) || nextExperimentIndex < 0 || nextExperimentIndex >= experiments.length) {
        nextExperimentIndex = 0;
    }
    resourcesState.activeExperimentIndex = nextExperimentIndex;

    const coursePrefix = `${(resource?.id || "").toString().trim()}:`;
    if (coursePrefix && resourcesState.runningExperimentKey && !resourcesState.runningExperimentKey.startsWith(coursePrefix)) {
        resourcesState.runningExperimentKey = "";
    }
    if (isStudentLessonMode()) {
        syncStudentLessonNav(resourcesState.activeCourseWorkspaceTab);
        syncLessonPageTitle(resource, resourcesState.activeCourseWorkspaceTab);
    }
    renderResourceDetail(resource);
}

function renderResourceDetailSplitContent(resource, contentEl) {
    contentEl.innerHTML = "";
    const sections = normalizeSections(resource);
    if (!sections.length) {
        const empty = document.createElement("div");
        empty.className = "resources-empty";
        empty.textContent = "暂无实验内容";
        contentEl.appendChild(empty);
        return;
    }
    if (resourcesState.activeSectionIndex < 0 || resourcesState.activeSectionIndex >= sections.length) {
        resourcesState.activeSectionIndex = 0;
    }
    if (isStudentLessonMode()) {
        resourcesState.activeSectionIndex = getCurrentLessonIndex(resource);
    }
    const selectedSection = sections[resourcesState.activeSectionIndex];
    const experiments = Array.isArray(selectedSection?.experiments) ? selectedSection.experiments : [];
    if (resourcesState.activeExperimentIndex < 0 || resourcesState.activeExperimentIndex >= experiments.length) {
        resourcesState.activeExperimentIndex = 0;
    }
    if (isStudentLessonMode() && resourcesState.activeCourseWorkspaceTab !== "route") {
        resourcesState.activeExperimentIndex = pickExperimentIndexForWorkspaceTab(
            experiments,
            resourcesState.activeCourseWorkspaceTab,
            resourcesState.activeExperimentIndex
        );
    }
    const selectedExperiment = experiments[resourcesState.activeExperimentIndex] || null;
    const canManageCourse = canEditResource(resource) && resourcesState.teacherMode.unlocked;
    const mutableSections = getMutableSections(resource) || [];
    const directStudentExperience = isStudentLessonMode() && resourcesState.activeCourseWorkspaceTab === "experience";

    const split = document.createElement("div");
    split.className = "resources-outline-layout";
    if (isStudentLessonMode() && resourcesState.activeCourseWorkspaceTab === "route") {
        split.classList.add("is-student-workspace");
    }
    if (directStudentExperience) {
        split.classList.add("is-direct-file-workspace");
    }

    let outlineList = null;
    let outlinePane = null;
    if (!directStudentExperience && (!isStudentLessonMode() || resourcesState.activeCourseWorkspaceTab !== "route")) {
        outlinePane = document.createElement("aside");
        outlinePane.className = "resources-outline-pane";
        const outlineTitle = document.createElement("div");
        outlineTitle.className = "resources-outline-title";
        outlineTitle.textContent = isStudentLessonMode() ? "本节实验" : "课程大纲";
        outlinePane.appendChild(outlineTitle);

        outlineList = document.createElement("div");
        outlineList.className = "resources-outline-list";
    }
    const outlineSections = isStudentLessonMode()
        ? getVisibleLessonContexts(resource, sections)
        : normalizeSectionContexts(sections);
    if (outlineList) outlineSections.forEach(({ section, sectionIndex }) => {
        const sectionNode = document.createElement("div");
        sectionNode.className = `resources-outline-section${sectionIndex === resourcesState.activeSectionIndex ? " is-active" : ""}`;
        if (canManageCourse) {
            sectionNode.draggable = true;
            sectionNode.addEventListener("dragstart", (event) => {
                event.dataTransfer?.setData("text/x-xedu-section-index", String(sectionIndex));
            });
            sectionNode.addEventListener("dragover", (event) => event.preventDefault());
            sectionNode.addEventListener("drop", withAsyncActionErrorBoundary(async (event) => {
                event.preventDefault();
                const fromIndex = Number.parseInt(event.dataTransfer?.getData("text/x-xedu-section-index") || "", 10);
                if (Number.isNaN(fromIndex) || fromIndex === sectionIndex) return;
                if (!Array.isArray(mutableSections) || !mutableSections[fromIndex]) return;
                const [moved] = mutableSections.splice(fromIndex, 1);
                mutableSections.splice(sectionIndex, 0, moved);
                resourcesState.activeSectionIndex = sectionIndex;
                resourcesState.activeExperimentIndex = 0;
                resource.updated_at = new Date().toISOString().slice(0, 10);
                await persistCourseToDisk(resource, apiClient);
                persistLocalCoursesState();
                renderResourceDetail(resource);
            }, {
                fallback: "保存课程结构失败",
                logLabel: "拖拽保存课程结构失败",
            }));
        }

        const sectionHeader = document.createElement("button");
        sectionHeader.className = "resources-outline-section-header";
        sectionHeader.type = "button";
        sectionHeader.textContent = section.title || `第 ${sectionIndex + 1} 课`;
        sectionHeader.addEventListener("click", () => {
            resourcesState.activeSectionIndex = sectionIndex;
            resourcesState.activeExperimentIndex = 0;
            renderResourceDetail(resource);
        });
        sectionNode.appendChild(sectionHeader);

        const expList = document.createElement("div");
        expList.className = "resources-outline-experiments";
        const experimentList = Array.isArray(section.experiments) ? section.experiments : [];
        experimentList.forEach((exp, expIndex) => {
            const expNode = document.createElement("button");
            expNode.type = "button";
            const isActiveExperiment = sectionIndex === resourcesState.activeSectionIndex && expIndex === resourcesState.activeExperimentIndex;
            expNode.className = `resources-outline-experiment experiment-item${
                isActiveExperiment ? " is-active experiment-item-active" : ""
            }`;
            if (canManageCourse) {
                expNode.draggable = true;
                expNode.addEventListener("dragstart", (event) => {
                    event.dataTransfer?.setData("text/x-xedu-exp-index", `${sectionIndex}:${expIndex}`);
                });
                expNode.addEventListener("dragover", (event) => event.preventDefault());
                expNode.addEventListener("drop", withAsyncActionErrorBoundary(async (event) => {
                    event.preventDefault();
                    const payload = event.dataTransfer?.getData("text/x-xedu-exp-index") || "";
                    const [fromSectionRaw, fromExpRaw] = payload.split(":");
                    const fromSectionIndex = Number.parseInt(fromSectionRaw || "", 10);
                    const fromExpIndex = Number.parseInt(fromExpRaw || "", 10);
                    if (Number.isNaN(fromSectionIndex) || Number.isNaN(fromExpIndex)) return;
                    if (fromSectionIndex !== sectionIndex || fromExpIndex === expIndex) return;
                    const targetSection = mutableSections?.[sectionIndex];
                    if (!targetSection || !Array.isArray(targetSection.experiments)) return;
                    const list = targetSection.experiments;
                    const [moved] = list.splice(fromExpIndex, 1);
                    list.splice(expIndex, 0, moved);
                    resourcesState.activeSectionIndex = sectionIndex;
                    resourcesState.activeExperimentIndex = expIndex;
                    resource.updated_at = new Date().toISOString().slice(0, 10);
                    await persistCourseToDisk(resource, apiClient);
                    persistLocalCoursesState();
                    renderResourceDetail(resource);
                }, {
                    fallback: "保存实验顺序失败",
                    logLabel: "拖拽保存实验顺序失败",
                }));
            }

            const status = getExperimentProgress(resource, sectionIndex, expIndex);
            const statusDot = document.createElement("span");
            statusDot.className = `resources-outline-status ${status ? `is-${status}` : ""}`;
            statusDot.textContent = status === "done" ? "●" : status === "in_progress" ? "◔" : "○";
            expNode.appendChild(statusDot);

            const text = document.createElement("span");
            text.className = "resources-outline-experiment-text";
            text.textContent = exp.title || `实验 ${expIndex + 1}`;
            expNode.appendChild(text);

            const stateKey = buildExperimentStateKey(resource, sectionIndex, expIndex);
            if (stateKey && stateKey === resourcesState.runningExperimentKey) {
                const running = document.createElement("span");
                running.className = "resources-outline-running";
                running.textContent = "Running";
                expNode.appendChild(running);
            }

            expNode.addEventListener("click", () => {
                resourcesState.activeSectionIndex = sectionIndex;
                resourcesState.activeExperimentIndex = isStudentLessonMode() && resourcesState.activeCourseWorkspaceTab !== "route"
                    ? pickExperimentIndexForWorkspaceTab(
                        Array.isArray(section.experiments) ? section.experiments : [],
                        resourcesState.activeCourseWorkspaceTab,
                        expIndex
                    )
                    : expIndex;
                const currentStatus = getExperimentProgress(resource, sectionIndex, expIndex) || "in_progress";
                setExperimentProgress(resource, sectionIndex, expIndex, currentStatus);
                renderResourceDetail(resource);
            });
            expList.appendChild(expNode);
        });
        sectionNode.appendChild(expList);
        outlineList.appendChild(sectionNode);
    });
    if (outlinePane && outlineList) {
        outlinePane.appendChild(outlineList);
        split.appendChild(outlinePane);
    }

    const mainPane = document.createElement("section");
    if (isStudentLessonMode() && resourcesState.activeCourseWorkspaceTab === "route") {
        mainPane.className = "resources-experiment-pane resources-course-workspace";
        renderCourseWorkspace(resource, sections, mainPane);
        split.appendChild(mainPane);
        contentEl.appendChild(split);
        return;
    }

    mainPane.className = "resources-experiment-pane";
    mainPane.classList.add(getWorkspaceTabPageClass(resourcesState.activeCourseWorkspaceTab));
    if (!selectedExperiment) {
        const empty = document.createElement("div");
        empty.className = "resources-empty";
        empty.textContent = "该课节暂无实验";
        mainPane.appendChild(empty);
        split.appendChild(mainPane);
        contentEl.appendChild(split);
        return;
    }

    const overview = getExperimentFileOverview(selectedExperiment);
    const compactStudentExperience = isStudentLessonMode() && resourcesState.activeCourseWorkspaceTab === "experience";
    if (!compactStudentExperience) {
        const breadcrumb = document.createElement("div");
        breadcrumb.className = "resources-experiment-breadcrumb";
        breadcrumb.textContent = isStudentLessonMode()
            ? `${getWorkspaceTabTitle(resourcesState.activeCourseWorkspaceTab)} / ${selectedSection.title || `第 ${resourcesState.activeSectionIndex + 1} 课`} / ${selectedExperiment.title || `实验 ${resourcesState.activeExperimentIndex + 1}`}`
            : `${resource.title || "课程"} / ${selectedSection.title || `第 ${resourcesState.activeSectionIndex + 1} 课`} / ${selectedExperiment.title || `实验 ${resourcesState.activeExperimentIndex + 1}`}`;
        mainPane.appendChild(breadcrumb);
    }
    const expCard = document.createElement("div");
    expCard.className = "resource-card";
    const expHeader = document.createElement("div");
    expHeader.className = "resource-card-header";
    const expTitle = document.createElement("div");
    expTitle.className = "resource-card-title";
    expTitle.textContent = selectedExperiment.title || `实验 ${resourcesState.activeExperimentIndex + 1}`;
    expHeader.appendChild(expTitle);
    const expBadge = document.createElement("div");
    expBadge.className = "resource-card-badge";
    expBadge.textContent = isStudentLessonMode()
        ? getWorkspaceTabTitle(resourcesState.activeCourseWorkspaceTab)
        : `${overview.allFiles.length} 个文件`;
    expHeader.appendChild(expBadge);
    expCard.appendChild(expHeader);

    if (selectedExperiment.description) {
        const expDesc = document.createElement("div");
        expDesc.className = "resource-card-desc";
        expDesc.textContent = selectedExperiment.description;
        expCard.appendChild(expDesc);
    }

    appendExperimentTaskList(expCard, getExperimentStudentTasks(selectedExperiment));
    if (!compactStudentExperience) {
        mainPane.appendChild(expCard);
    }

    const context = buildExperimentResourceContext(
        resource,
        selectedSection,
        resourcesState.activeSectionIndex,
        selectedExperiment,
        resourcesState.activeExperimentIndex
    );
    if (isStudentLessonMode()) {
        mainPane.appendChild(
            resourcesState.activeCourseWorkspaceTab === "experience"
                ? buildStudentHtmlExperienceView(context)
                : buildStudentExperimentEntryCard(context, resourcesState.activeCourseWorkspaceTab)
        );
    } else {
        mainPane.appendChild(buildExperimentFilesCard({
            overview,
            onOpenFile: withAsyncActionErrorBoundary(async (file) => {
                await openExperimentEntry(
                    file,
                    getEntryKindForFile(file),
                    {
                        resource,
                        sectionIndex: resourcesState.activeSectionIndex,
                        expIndex: resourcesState.activeExperimentIndex,
                        experimentOverview: overview,
                    }
                );
            }, {
                fallback: "打开实验资源失败",
                logLabel: "打开实验资源失败",
            }),
        }));
    }

    split.appendChild(mainPane);
    contentEl.appendChild(split);
}

function renderResourceDetail(resource) {
    const detailView = document.getElementById("resources-detail-view");
    if (detailView) {
        detailView.classList.toggle("is-section-detail", resourcesState.sectionDetailMode);
        detailView.classList.toggle("is-student-lesson", isStudentLessonMode());
        detailView.classList.toggle("is-route-page", isStudentLessonMode() && resourcesState.activeCourseWorkspaceTab === "route");
        detailView.classList.toggle("is-experience-page", isStudentLessonMode() && resourcesState.activeCourseWorkspaceTab === "experience");
        detailView.classList.toggle("is-visual-page", isStudentLessonMode() && resourcesState.activeCourseWorkspaceTab === "visual");
        detailView.classList.toggle("is-python-page", isStudentLessonMode() && resourcesState.activeCourseWorkspaceTab === "python");
    }
    const titleEl = document.getElementById("resources-detail-title");
    const metaEl = document.getElementById("resources-detail-meta");
    const contentEl = document.getElementById("resources-detail-content");
    const coverWrap = document.getElementById("resources-detail-cover");
    const coverImg = document.getElementById("resources-detail-cover-img");
    const downloadBtn = document.getElementById("resources-detail-download");
    const editBtn = document.getElementById("resources-detail-edit");
    const deleteBtn = document.getElementById("resources-detail-delete");
    const repoBtn = document.getElementById("resources-detail-repo");
    const uploadBtn = document.getElementById("resources-detail-upload");
    const pullBtn = document.getElementById("resources-detail-pull");
    const openBtn = document.getElementById("resources-detail-open");
    const classroomStartBtn = document.getElementById("resources-detail-classroom-start");
    const classroomStopBtn = document.getElementById("resources-detail-classroom-stop");
    const classroomCodeEl = document.getElementById("resources-detail-classroom-code");
    const moreBtn = document.getElementById("resources-detail-more-btn");
    const moreMenu = document.getElementById("resources-detail-more-menu");
    const backBtn = document.getElementById("resources-back-btn");

    if (moreMenu) {
        moreMenu.classList.remove("is-open");
    }

    if (titleEl) {
        if (isStudentLessonMode()) {
            const sections = normalizeSections(resource);
            const lessonIndex = getCurrentLessonIndex(resource);
            const section = sections[lessonIndex] || null;
            titleEl.textContent = section?.title || getText(resource, "title", "当前课程");
        } else {
            titleEl.textContent = getText(resource, "title", "课程详情");
        }
    }

    if (metaEl) {
        const parts = [];
        const grade = getText(resource, "grade", "").trim();
        const subject = getText(resource, "subject", "").trim();
        if (grade) parts.push({ label: "年级", value: grade });
        if (subject) parts.push({ label: "学科", value: subject });
        if (resourcesState.teacherMode.unlocked) {
            const version = getText(resource, "version", "").trim();
            const updatedAt = getText(resource, "updated_at", "").trim();
            if (version) parts.push({ label: "版本", value: version });
            if (updatedAt) parts.push({ label: "更新", value: updatedAt });
            if (resource.source !== "local" && resource._source_name) {
                parts.push({ label: "来源", value: resource._source_name });
            }
        }
        metaEl.innerHTML = parts
            .map((item) => `<span>${escapeAttr(item.label)}: ${escapeAttr(item.value)}</span>`)
            .join("");
        metaEl.style.display = parts.length ? "flex" : "none";
    }

    if (backBtn) {
        backBtn.style.display = isStudentLessonMode() ? "none" : "inline-flex";
    }

    if (coverWrap && coverImg) {
        const coverUrl = getCoverUrl(resource);
        if (coverUrl) {
            coverImg.src = coverUrl;
            coverWrap.style.display = "flex";
        } else {
            coverImg.removeAttribute("src");
            coverWrap.style.display = "none";
        }
    }

    if (downloadBtn) {
        const packageUrl = resolveResourceUrl(resource.package_url || "", resource);
        const finalUrl = packageUrl;
        downloadBtn.disabled = !finalUrl;
        downloadBtn.dataset.url = finalUrl;
        downloadBtn.style.display = finalUrl && resource.source !== "local" ? "inline-flex" : "none";
    }

    const teacherUnlocked = resourcesState.teacherMode.unlocked;

    if (editBtn) {
        const editable = canEditResource(resource) && teacherUnlocked;
        editBtn.style.display = editable ? "inline-flex" : "none";
        editBtn.disabled = !editable;
        editBtn.title = "";
    }

    if (deleteBtn) {
        const deletable = resource.source === "local" && teacherUnlocked;
        deleteBtn.style.display = deletable ? "inline-flex" : "none";
        deleteBtn.disabled = !deletable;
        deleteBtn.title = "";
    }

    if (repoBtn) {
        const origin = getCourseOrigin(resource);
        const targetRepoUrl = origin ? `${origin.base_url}/${origin.repo}` : (resource?._source_repo_url || resourcesState.repoUrl);
        if (teacherUnlocked && targetRepoUrl) {
            repoBtn.style.display = "inline-flex";
            repoBtn.disabled = false;
            repoBtn.dataset.url = targetRepoUrl;
        } else {
            repoBtn.style.display = "none";
            repoBtn.disabled = true;
            repoBtn.dataset.url = "";
        }
    }

    if (uploadBtn) {
        const actionState = getResourceActionState(resource);
        if (resource.source === "local" && teacherUnlocked) {
            uploadBtn.style.display = "inline-flex";
            setActionButtonLabel(uploadBtn, actionState === "local_bound" ? "上传更新" : "上传课程");
            uploadBtn.dataset.url = "";
            uploadBtn.disabled = !resource.local_path;
            uploadBtn.title = resource.local_path ? "" : "本地课程目录缺失，无法上传";
        } else {
            uploadBtn.style.display = "none";
            uploadBtn.disabled = true;
            uploadBtn.dataset.url = "";
            uploadBtn.title = "";
        }
    }

    if (pullBtn) {
        const actionState = getResourceActionState(resource);
        if (resource.source === "local") {
            const origin = getCourseOrigin(resource);
            const canPullLocal = teacherUnlocked && actionState === "local_bound" && Boolean(origin) && Boolean(resource.local_path);
            if (canPullLocal) {
                pullBtn.style.display = "inline-flex";
                setActionButtonLabel(pullBtn, "拉取更新");
                pullBtn.disabled = false;
                pullBtn.title = "";
            } else {
                pullBtn.style.display = "none";
                pullBtn.disabled = true;
                pullBtn.title = "";
            }
        } else {
            pullBtn.style.display = "inline-flex";
            setActionButtonLabel(pullBtn, "导入到本地");
            const canImportRemote = Boolean(resource.package_url || resource.course_url);
            pullBtn.disabled = !canImportRemote;
            pullBtn.title = canImportRemote ? "" : "课程地址缺失，无法导入";
        }
    }

    if (openBtn) {
        const sectionsForOpen = normalizeSections(resource);
        const sectionForOpen = sectionsForOpen[resourcesState.activeSectionIndex] || sectionsForOpen[0] || null;
        const experimentsForOpen = Array.isArray(sectionForOpen?.experiments) ? sectionForOpen.experiments : [];
        const experimentForOpen = experimentsForOpen[resourcesState.activeExperimentIndex] || experimentsForOpen[0] || null;
        const overviewForOpen = experimentForOpen ? getExperimentFileOverview(experimentForOpen) : null;
        const canOpenMainConsole =
            resource.source === "local" &&
            resource.local_path &&
            overviewForOpen &&
            overviewForOpen.notebookFiles.length > 0;
        if (canOpenMainConsole && !isStudentLessonMode()) {
            openBtn.style.display = "inline-flex";
            openBtn.dataset.path = resource.local_path;
        } else {
            openBtn.style.display = "none";
            openBtn.dataset.path = "";
        }
    }

    if (classroomStartBtn) {
        const canStart =
            resourcesState.teacherMode.unlocked &&
            resource.source === "local" &&
            Boolean(resource.local_path);
        classroomStartBtn.style.display = canStart && !isStudentLessonMode() ? "inline-flex" : "none";
        classroomStartBtn.disabled = !canStart;
        if (canStart) {
            const sectionNo = Number.isFinite(resourcesState.activeSectionIndex) ? resourcesState.activeSectionIndex + 1 : 1;
            setActionButtonLabel(classroomStartBtn, `开启第${sectionNo}节课堂`);
        }
        classroomStartBtn.title = "";
    }

    if (classroomStopBtn) {
        const canStop = resourcesState.teacherMode.unlocked && isActiveCourse(resource);
        classroomStopBtn.style.display = canStop && !isStudentLessonMode() ? "inline-flex" : "none";
        classroomStopBtn.disabled = !canStop;
    }

    if (classroomCodeEl) {
        const active = resourcesState.teacherMode.unlocked && resourcesState.classroomState.active && isActiveCourse(resource);
        classroomCodeEl.style.display = active && !isStudentLessonMode() ? "inline-flex" : "none";
        classroomCodeEl.textContent = active && resourcesState.teacherMode.code
            ? `课堂码：${resourcesState.teacherMode.code}`
            : "";
    }

    if (moreBtn && moreMenu) {
        const menuButtons = Array.from(moreMenu.querySelectorAll("button"));
        const hasVisible = menuButtons.some((btn) => btn.style.display !== "none");
        const showMore = !resourcesState.sectionDetailMode && hasVisible && !isStudentLessonMode();
        moreBtn.style.display = showMore ? "inline-flex" : "none";
        if (!hasVisible) {
            moreMenu.classList.remove("is-open");
        }
        if (!showMore) {
            moreMenu.classList.remove("is-open");
        }
    }

    if (!contentEl) return;
    renderResourceDetailSplitContent(resource, contentEl);
}

async function editExperiment(resource, mutableSections, sectionIndex, expIndex) {
    return editExperimentFlow(resource, mutableSections, sectionIndex, expIndex, {
        ensureTeacherModeForEdit,
        canEditResource,
        getMutableExperiments,
        openResourcesForm,
        persistCourseToDisk,
        apiClient,
        persistLocalCoursesState,
        renderResourceDetail,
        alertUser: notifyUser,
    });
}

async function deleteExperiment(resource, mutableSections, sectionIndex, expIndex) {
    return deleteExperimentFlow(resource, mutableSections, sectionIndex, expIndex, {
        ensureTeacherModeForEdit,
        canEditResource,
        getMutableExperiments,
        openResourcesConfirm,
        persistCourseToDisk,
        apiClient,
        persistLocalCoursesState,
        renderResourceDetail,
        alertUser: notifyUser,
    });
}

async function addSection(resource, mutableSections) {
    return addSectionFlow(resource, mutableSections, {
        ensureTeacherModeForEdit,
        canEditResource,
        getMutableSections,
        persistCourseToDisk,
        apiClient,
        persistLocalCoursesState,
        setActiveSectionIndex: (value) => { resourcesState.activeSectionIndex = value; },
        renderResourceDetail,
        alertUser: notifyUser,
    });
}

async function renameSection(resource, mutableSections, sectionIndex) {
    return renameSectionFlow(resource, mutableSections, sectionIndex, {
        ensureTeacherModeForEdit,
        canEditResource,
        openResourcesInput,
        persistCourseToDisk,
        apiClient,
        persistLocalCoursesState,
        renderResourceDetail,
        alertUser: notifyUser,
    });
}

async function deleteSection(resource, mutableSections, sectionIndex) {
    return deleteSectionFlow(resource, mutableSections, sectionIndex, {
        ensureTeacherModeForEdit,
        canEditResource,
        openResourcesConfirm,
        persistCourseToDisk,
        apiClient,
        persistLocalCoursesState,
        activeSectionIndex: () => resourcesState.activeSectionIndex,
        setActiveSectionIndex: (value) => { resourcesState.activeSectionIndex = value; },
        renderResourceDetail,
        alertUser: notifyUser,
    });
}

async function manageSection(resource, mutableSections, sectionIndex) {
    return manageSectionFlow(resource, mutableSections, sectionIndex, {
        ensureTeacherModeForEdit,
        openCreateEditorForManage,
    });
}

async function addExperimentToSection(resource, mutableSections, sectionIndex) {
    return addExperimentToSectionFlow(resource, mutableSections, sectionIndex, {
        ensureTeacherModeForEdit,
        canEditResource,
        persistCourseToDisk,
        apiClient,
        persistLocalCoursesState,
        setActiveSectionIndex: (value) => { resourcesState.activeSectionIndex = value; },
        renderResourceDetail,
        alertUser: notifyUser,
    });
}

async function manageExperiment(resource, mutableSections, sectionIndex, expIndex) {
    return manageExperimentFlow(resource, mutableSections, sectionIndex, expIndex, {
        ensureTeacherModeForEdit,
        openCreateEditorForManage,
    });
}

function normalizeSections(resource) {
    const rawSections = resource.sections || resource.lessons || resource.modules || [];

    if (Array.isArray(rawSections) && rawSections.length) {
        return rawSections.map((section, index) => normalizeSection(section, index));
    }

    if (Array.isArray(resource.experiments) && resource.experiments.length) {
        return [
            {
                title: "实验列表",
                description: "",
                experiments: resource.experiments.map((exp, index) =>
                    normalizeExperiment(exp, index)
                )
            }
        ];
    }

    if (Array.isArray(resource.files) && resource.files.length) {
        return [
            {
                title: "课程文件",
                description: "",
                experiments: [
                    {
                        title: "课程资源",
                        description: "",
                        files: resource.files.map((file) => normalizeFile(file))
                    }
                ]
            }
        ];
    }

    return [];
}

function normalizeSection(section, index) {
    const title = section.title || section.name || `第 ${index + 1} 节`;
    const description = section.description || section.desc || "";
    const learningObjectives = getSectionLearningObjectives(section);
    const keyPoints = getSectionKeyPoints(section);
    const difficulties = getSectionDifficulties(section);
    let experiments = [];

    if (Array.isArray(section.experiments)) {
        experiments = section.experiments.map((exp, idx) =>
            normalizeExperiment(exp, idx)
        );
    } else if (Array.isArray(section.items)) {
        experiments = section.items.map((exp, idx) =>
            normalizeExperiment(exp, idx)
        );
    } else if (Array.isArray(section.files)) {
        experiments = [
            {
                title: "课程内容",
                description: "",
                files: section.files.map((file) => normalizeFile(file))
            }
        ];
    }

    return {
        title,
        description,
        learning_objectives: learningObjectives,
        key_points: keyPoints,
        difficulties,
        experiments
    };
}

function normalizeExperiment(exp, index) {
    const title = exp.title || exp.name || `实验 ${index + 1}`;
    const description = exp.description || exp.desc || "";
    const path = exp.path || exp.dir || "";
    const rawFiles = exp.files || exp.items || exp.resources || [];
    const files = Array.isArray(rawFiles) ? rawFiles.map((file) => normalizeFile(file)) : [];

    return {
        title,
        description,
        path,
        student_tasks: getExperimentStudentTasks(exp),
        files,
    };
}

function isRemotePath(path) {
    return /^https?:\/\//.test(path || "");
}

function buildCurrentExperimentContext(resource, sectionIndex, expIndex, experiment, overview = null) {
    const normalizedOverview = overview || getExperimentFileOverview(experiment || {});
    const selectedSection = normalizeSections(resource || {})[sectionIndex] || null;
    const primaryPythonFile = normalizedOverview.primaryPythonFile || null;
    const primaryBlocklyFile = normalizedOverview.primaryBlocklyFile || null;
    const primaryScratchFile = normalizedOverview.primaryScratchFile || null;
    const primaryHtmlFile = normalizedOverview.htmlFiles?.[0] || null;
    return {
        source: resource?.source || "",
        local_path: resource?.local_path || "",
        course: {
            id: resource?.id || "",
            title: resource?.title || "",
        },
        section: {
            index: Number.isFinite(sectionIndex) ? sectionIndex : 0,
            title: selectedSection?.title || "",
        },
        experiment: {
            index: Number.isFinite(expIndex) ? expIndex : 0,
            title: experiment?.title || "",
            description: experiment?.description || "",
        },
        entries: {
            html: primaryHtmlFile ? JSON.parse(JSON.stringify(primaryHtmlFile)) : null,
            scratch: primaryScratchFile ? JSON.parse(JSON.stringify(primaryScratchFile)) : null,
            blockly: primaryBlocklyFile ? JSON.parse(JSON.stringify(primaryBlocklyFile)) : null,
            notebook: normalizedOverview.notebookFiles?.[0] ? JSON.parse(JSON.stringify(normalizedOverview.notebookFiles[0])) : null,
            python: primaryPythonFile ? JSON.parse(JSON.stringify(primaryPythonFile)) : null,
        },
        overview: {
            htmlFiles: (normalizedOverview.htmlFiles || []).map((file) => JSON.parse(JSON.stringify(file))),
            scratchFiles: (normalizedOverview.scratchFiles || []).map((file) => JSON.parse(JSON.stringify(file))),
            blocklyFiles: (normalizedOverview.blocklyFiles || []).map((file) => JSON.parse(JSON.stringify(file))),
            notebookFiles: (normalizedOverview.notebookFiles || []).map((file) => JSON.parse(JSON.stringify(file))),
            pythonFiles: (normalizedOverview.pythonFiles || []).map((file) => JSON.parse(JSON.stringify(file))),
        },
    };
}

function formatFileNameList(files = [], max = 3) {
    const names = (files || [])
        .map((file) => getBaseName(file?.path || file?.name || ""))
        .filter(Boolean);
    if (!names.length) return "";
    if (names.length <= max) {
        return names.join(" · ");
    }
    return `${names.slice(0, max).join(" · ")} +${names.length - max}`;
}

async function openExperimentEntry(file, kind = "file", context = null) {
    if (!file) return;
    if (kind === "blockly") {
        const fileName = getBaseName(file.path || file.name || "旧 Blockly 实验");
        const message = `该实验类型已不再支持${fileName ? `：${fileName}` : ""}`;
        if (typeof window.app?.ui?.showToast === "function") {
            window.app.ui.showToast(message, "warning");
        } else {
            alert(message);
        }
        return false;
    }
    if (context?.resource) {
        const { resource, sectionIndex = 0, expIndex = 0 } = context;
        setExperimentProgress(resource, sectionIndex, expIndex, "in_progress");
        if (kind === "notebook" || kind === "python") {
            resourcesState.runningExperimentKey = buildExperimentStateKey(resource, sectionIndex, expIndex);
        }
    }
    if (kind === "notebook") {
        const opened = await openNotebookInConsole(file.path);
        if (opened) {
            if (resourcesState.currentResource) {
                renderResourceDetail(resourcesState.currentResource);
            }
            return;
        }
    }
    if (kind === "scratch" && context?.resource && !isRemotePath(file?.path || "")) {
        if (window.app?.workspace?.openScratchWorkspace) {
            const sourcePage = isStudentLessonMode()
                ? "student-visual"
                : "resources";
            window.app.workspace.openScratchWorkspace({
                localPath: context.resource.local_path || "",
                projectPath: file.path || "",
                sourceLabel: `${context.resource.title || "课程"} / ${file.name || file.path || "Scratch"}`,
                sourcePage,
            });
            if (resourcesState.currentResource && sourcePage !== "student-visual") {
                renderResourceDetail(resourcesState.currentResource);
            }
            return;
        }
        alert("Scratch 编辑器当前仅支持本地课程项目。");
        return;
    }
    if (kind === "html" && context?.resource && !isRemotePath(file?.path || "")) {
        const previewUrl = buildLocalCourseFileUrl(context.resource, file.path || "", apiClient);
        if (previewUrl) {
            await openExternal(previewUrl);
            if (resourcesState.currentResource) {
                renderResourceDetail(resourcesState.currentResource);
            }
            return;
        }
    }
    const { localTargetPath, targetUrl } = resolveFileTargets(file);
    if (localTargetPath) {
        await openLocalPath(localTargetPath);
        if (resourcesState.currentResource) {
            renderResourceDetail(resourcesState.currentResource);
        }
        return;
    }
    if (targetUrl) {
        await openExternal(targetUrl);
        if (resourcesState.currentResource) {
            renderResourceDetail(resourcesState.currentResource);
        }
    }
}

function pickExperimentEntries(exp) {
    if (!exp) return [];
    const overview = getExperimentFileOverview(exp);
    const html = overview.htmlFiles[0];
    const scratch = overview.primaryScratchFile;
    const blockly = overview.primaryBlocklyFile;
    const python = overview.primaryPythonFile;
    const fallback = overview.allFiles[0];

    const entries = [];
    if (html) entries.push({ file: html, kind: "html" });
    if (scratch) entries.push({ file: scratch, kind: "scratch" });
    if (blockly) entries.push({ file: blockly, kind: "blockly" });
    if (python) entries.push({ file: python, kind: getEntryKindForFile(python) });
    if (!entries.length && fallback) entries.push({ file: fallback, kind: "file" });
    return entries;
}

function resolveFileTargets(file) {
    const filePath = file?.path || "";
    const localBasePath = resourcesState.currentResource?.local_path || "";
    const localTargetPath =
        localBasePath && filePath && !isRemotePath(filePath)
            ? resolveLocalPath(localBasePath, filePath)
            : "";
    const targetUrl = filePath
        ? isDirectory(file)
            ? resolveRepoBrowserUrl(filePath, resourcesState.currentResource)
            : isHtmlFile(file)
                ? resolveResourceUrl(filePath, resourcesState.currentResource)
                : resolveRepoBrowserUrl(filePath, resourcesState.currentResource)
        : "";
    return { localTargetPath, targetUrl };
}

async function openNotebookInConsole(filePath) {
    if (!filePath || isRemotePath(filePath)) return false;
    const resource = resourcesState.currentResource;
    if (!resource?.local_path) return false;
    const experiment = normalizeSections(resource)[resourcesState.activeSectionIndex]
        ?.experiments?.[resourcesState.activeExperimentIndex];
    const workspaceTarget = resolveJupyterWorkspaceTarget({
        coursePath: resource.local_path,
        experimentPath: experiment?.path || "",
        filePath,
    });
    if (!workspaceTarget.projectDir) return false;

    if (window.app?.workspace?.openJupyterWorkspace) {
        await window.app.workspace.openJupyterWorkspace({
            projectDir: workspaceTarget.projectDir,
            filePath: workspaceTarget.filePath,
            sourceLabel: `${resource.title || "课程"} / ${getBaseName(filePath)}`,
            sourcePage: resourcesState.teacherMode.unlocked ? "resources" : "main",
        });
        return true;
    }
    return false;
}


function renderFileItem(file, depth = 0) {
    const isFolder = isDirectory(file);
    const filePath = file.path || "";
    const isNotebook = isNotebookFile(file);
    const isScratch = isScratchFile(file);
    const isBlockly = isBlocklyFile(file);
    const isHtml = isHtmlFile(file);
    const { localTargetPath, targetUrl } = resolveFileTargets(file);
    const labelText = file.name || file.path || "未命名文件";

    const chip = document.createElement("div");
    chip.className = "resources-file-chip";
    if (isNotebook) {
        chip.classList.add("is-notebook");
    }
    if (isBlockly) {
        chip.classList.add("is-unsupported-visual");
    }
    if (isHtml) {
        chip.classList.add("is-html");
    }
    if (isFolder) {
        chip.classList.add("is-dir");
    }

    const info = document.createElement("div");
    info.className = "resources-file-info";
    info.style.paddingLeft = `${depth * 12}px`;

    const icon = document.createElement("span");
    icon.className = "resources-file-icon";
    icon.textContent = isFolder ? "📁" : isScratch ? "🎨" : isBlockly ? "🧱" : isNotebook ? "📓" : isHtml ? "🧪" : "📄";
    info.appendChild(icon);

    const label = document.createElement("span");
    label.className = "resources-file-label";
    label.textContent = labelText;
    info.appendChild(label);

    chip.appendChild(info);

    if (targetUrl || localTargetPath) {
        const action = document.createElement("button");
        action.className = "btn btn-secondary";
        action.textContent = isFolder
            ? "打开目录"
            : isScratch
                ? "在 Scratch 中打开"
            : isBlockly
                ? "查看不支持提示"
            : isNotebook
                ? "在 Jupyter Lab 中打开"
                : isPythonScriptFile(file)
                    ? "在 Jupyter Lab 中打开"
                    : isHtml
                        ? "预览"
                        : "打开";
        action.addEventListener("click", withAsyncActionErrorBoundary(async () => {
            if (isBlockly) {
                await openExperimentEntry(file, "blockly", {
                    resource: resourcesState.currentResource,
                    sectionIndex: resourcesState.activeSectionIndex,
                    expIndex: resourcesState.activeExperimentIndex,
                });
                return;
            }
            if (isScratch) {
                await openExperimentEntry(file, "scratch", {
                    resource: resourcesState.currentResource,
                    sectionIndex: resourcesState.activeSectionIndex,
                    expIndex: resourcesState.activeExperimentIndex,
                });
                return;
            }
            if (isHtml && !isRemotePath(filePath)) {
                await openExperimentEntry(file, "html", {
                    resource: resourcesState.currentResource,
                    sectionIndex: resourcesState.activeSectionIndex,
                    expIndex: resourcesState.activeExperimentIndex,
                });
                return;
            }
            if (isNotebook && !isRemotePath(filePath)) {
                const opened = await openNotebookInConsole(filePath);
                if (opened) return;
            }
            if (localTargetPath) {
                await openLocalPath(localTargetPath);
                return;
            }
            if (targetUrl) {
                await openExternal(targetUrl);
            }
        }, {
            fallback: "打开课程文件失败",
            logLabel: "打开课程文件失败",
        }));
        chip.appendChild(action);
    }

    if (file.children && file.children.length) {
        const group = document.createElement("div");
        group.className = "resources-file-group";
        group.appendChild(chip);

        const childWrap = document.createElement("div");
        childWrap.className = "resources-file-children";
        const children = sortFiles(file.children);
        children.forEach((child) => {
            childWrap.appendChild(renderFileItem(child, depth + 1));
        });
        group.appendChild(childWrap);
        return group;
    }

    return chip;
}

function setCreateSource(source) {
    resourcesState.createSource = source;
    const effectiveEntryMode = resourcesState.editingCourseId
        ? resourcesState.createEntryMode : source === "cloud"
            ? "cloud-import"
            : "pack-import";
    const packageGroup = document.getElementById("resources-package-group");
    const localGroup = document.getElementById("resources-local-group");
    const localPathLabel = document.getElementById("resources-local-path-label");
    const localPathInput = document.getElementById("resources-create-local-path");
    const cloudGroup = document.getElementById("resources-cloud-group");
    const switchRow = document.getElementById("resources-create-source-switch-row");
    const step2ModeHint = document.getElementById("resources-step2-mode-hint");
    const sourceTitleText = document.getElementById("resources-create-source-title-text");
    const structureCard = document.getElementById("resources-structure-card");
    const structureEditorPane = document.getElementById("resources-structure-editor-pane");
    const cloudDetailPanel = document.getElementById("resources-cloud-detail-panel");
    const cloudInlineActions = document.getElementById("resources-cloud-inline-actions");
    const structureSaveRow = document.getElementById("resources-structure-save-row");
    const sourceHint = document.getElementById("resources-create-source-hint");
    const localBtn = document.getElementById("resources-source-local");
    const cloudBtn = document.getElementById("resources-source-cloud");
    const localPathHint = document.getElementById("resources-local-path-hint");
    const localPathButton = document.getElementById("resources-pick-local-btn");
    const packImportMode = effectiveEntryMode === "pack-import";

    if (packageGroup) packageGroup.style.display = source === "local" && packImportMode ? "block" : "none";
    if (localGroup) localGroup.style.display = packImportMode ? "none" : "block";
    if (cloudGroup) cloudGroup.style.display = source === "cloud" ? "block" : "none";
    if (switchRow) switchRow.style.display = "flex";
    if (step2ModeHint) {
        step2ModeHint.style.display = source === "cloud" ? "none" : "block";
        step2ModeHint.textContent = packImportMode ? "本地导入" : "课程目录与结构（先选整门课程根目录，再补课节结构）";
    }
    if (sourceTitleText) {
        sourceTitleText.textContent = source === "cloud" ? "云端导入" : packImportMode ? "本地导入" : "课程目录";
    }
    if (structureCard) structureCard.style.display = (!packImportMode && (source === "local" || source === "cloud")) ? "block" : "none";
    if (structureEditorPane) structureEditorPane.style.display = source === "local" && !packImportMode ? "block" : "none";
    if (cloudDetailPanel) cloudDetailPanel.style.display = source === "cloud" ? "flex" : "none";
    if (cloudInlineActions) cloudInlineActions.style.display = source === "cloud" ? "none" : "flex";
    if (structureSaveRow) structureSaveRow.style.display = source === "local" && !packImportMode ? "flex" : "none";
    if (sourceHint) {
        sourceHint.textContent =
            source === "cloud"
                ? ""
                : packImportMode
                    ? "选择本地课程包后，系统会导入并读取内容。"
                    : "先选整门课程根目录，再按需添加课节和实验。";
        sourceHint.style.display = source === "cloud" ? "none" : "block";
    }
    if (localPathLabel) {
        localPathLabel.textContent = source === "cloud" || packImportMode ? "本地保存位置" : "课程目录";
    }
    if (localPathInput) {
        localPathInput.placeholder = source === "cloud"
            ? "请选择导入后的课程目录"
            : packImportMode
                ? "将自动使用默认课程目录"
                : "请选择课程文件夹";
        localPathInput.readOnly = packImportMode;
    }
    if (localPathButton) {
        localPathButton.style.display = packImportMode ? "none" : "inline-flex";
    }
    if (localPathHint) {
        localPathHint.textContent = packImportMode
            ? "本地导入会自动保存到默认课程目录。"
            : "这里选择的是课程导入后的本地保存位置。";
    }
    renderLocalPathSummary();
    renderPackagePathSummary();
    renderLocalStructureSummary();
    updateCreateStep3UI();
    updateCreateFlowLayout();

    if (localBtn) {
        localBtn.classList.toggle("btn-primary", source === "local");
        localBtn.classList.toggle("btn-secondary", source !== "local");
    }
    if (cloudBtn) {
        cloudBtn.classList.toggle("btn-primary", source === "cloud");
        cloudBtn.classList.toggle("btn-secondary", source !== "cloud");
    }
    resourcesState.cloudImported = source === "cloud" ? resourcesState.cloudImported : false;
    if (source === "cloud") {
        resourcesState.cloudSourcesLoaded = false;
        loadCloudCourseOptions();
    } else {
        setCloudStatus("");
        renderCloudCoursePreview();
    }
    if (!resourcesState.editingCourseId) {
        resourcesState.createEntryMode = effectiveEntryMode;
        updateCreateEntryModeUI();
    }
    updateCreateFormState();
}

function updateCreateEntryModeUI() {
    // 创建入口统一放在课程页右上角菜单，这里无需额外状态渲染。
}

function chooseCreateEntryMode(mode) {
    resourcesState.createEntryMode = mode;
    resourcesState.scanError = "";
    if (mode === "cloud-import") {
        setCreateSource("cloud");
        setCreateStep(2);
        window.setTimeout(() => {
            const select = document.getElementById("resources-cloud-course-select");
            if (select) select.focus();
        }, 80);
    } else if (mode === "pack-import") {
        setCreateSource("local");
        setCreateStep(2);
        resourcesState.scannedCourse = null;
        resourcesState.scanSummary = null;
        resourcesState.draftSections = [];
        const localPathInput = document.getElementById("resources-create-local-path");
        if (localPathInput) localPathInput.value = "";
        renderLocalPathSummary();
        updateCreateEntryModeUI();
        window.setTimeout(() => {
            const pickBtn = document.getElementById("resources-pick-package-btn");
            if (pickBtn) pickBtn.focus();
        }, 80);
        return;
    }
    updateCreateEntryModeUI();
}

function setCreateViewMode(mode) {
    const titleEl = document.querySelector("#resources-create-view .resources-detail-title");
    const metaEl = document.querySelector("#resources-create-view .resources-detail-meta");
    const saveBtn = document.getElementById("resources-create-save-btn");
    if (titleEl) {
        titleEl.textContent = mode === "edit" ? "编辑课程" : "导入课程";
    }
    if (metaEl) {
        metaEl.textContent =
            mode === "edit" ? "修改课程信息后保存，可再次上传" : "仅支持本地导入与云端导入";
    }
    if (saveBtn) {
        saveBtn.textContent = mode === "edit" ? "保存修改" : "导入并保存";
    }
}

function resetCreateForm() {
    const ids = [
        "resources-create-title",
        "resources-create-desc",
        "resources-create-grade",
        "resources-create-subject",
        "resources-create-tags",
        "resources-create-cover",
        "resources-create-local-path",
        "resources-create-package-path",
        "resources-create-author",
        "resources-create-version",
        "resources-create-id"
    ];
    ids.forEach((id) => {
        const input = document.getElementById(id);
        if (input) input.value = "";
    });
    const versionInput = document.getElementById("resources-create-version");
    if (versionInput) versionInput.value = "1.0";

    const coverFileInput = document.getElementById("resources-cover-file");
    const coverPreview = document.getElementById("resources-cover-preview");
    const coverPreviewImg = document.getElementById("resources-cover-preview-img");
    if (coverFileInput) coverFileInput.value = "";
    if (coverPreview && coverPreviewImg) {
        coverPreviewImg.src = "";
        coverPreview.style.display = "none";
    }
    resourcesState.draftSections = [];
    renderSectionEditor();
    renderMaterialList();
}

function populateCreateForm(resource) {
    if (!resource) return;
    const titleInput = document.getElementById("resources-create-title");
    const descInput = document.getElementById("resources-create-desc");
    const gradeInput = document.getElementById("resources-create-grade");
    const subjectInput = document.getElementById("resources-create-subject");
    const tagsInput = document.getElementById("resources-create-tags");
    const coverInput = document.getElementById("resources-create-cover");
    const localPathInput = document.getElementById("resources-create-local-path");
    const authorInput = document.getElementById("resources-create-author");
    const versionInput = document.getElementById("resources-create-version");
    const idInput = document.getElementById("resources-create-id");

    if (titleInput) titleInput.value = resource.title || "";
    if (descInput) descInput.value = resource.description || "";
    if (gradeInput) gradeInput.value = resource.grade || "";
    if (subjectInput) subjectInput.value = resource.subject || "";
    if (tagsInput) tagsInput.value = getTags(resource).join(", ");
    if (localPathInput) localPathInput.value = resource.local_path || "";
    if (authorInput) authorInput.value = resource.author || "";
    if (versionInput) versionInput.value = resource.version || "";
    if (idInput) idInput.value = resource.id || "";

    const coverValue = resource.cover || resource.cover_url || "";
    if (coverInput) coverInput.value = coverValue || "";
    updateCreateCoverPreview();
}

function openCreateView(resource = null) {
    if (!resourcesState.teacherMode.unlocked) return false;
    const listView = document.getElementById("resources-list-view");
    const detailView = document.getElementById("resources-detail-view");
    const createView = document.getElementById("resources-create-view");
    if (listView) listView.style.display = "none";
    if (detailView) detailView.style.display = "none";
    if (createView) createView.style.display = "flex";
    resourcesState.editingCourseId = resource ? resource.id || null : null;
    resourcesState.createEntryMode = resource ? "new" : "pack-import";
    resourcesState.createSource = "local";
    setCreateSource(resourcesState.createSource);
    resourcesState.createStep = resource ? 1 : 2;
    resourcesState.scannedCourse = null;
    resourcesState.scanSummary = null;
    resourcesState.scanError = "";
    resourcesState.publishStatus = "idle";
    resourcesState.cloudImported = false;
    if (resource) {
        setCreateViewMode("edit");
        populateCreateForm(resource);
        if (resource.sections) {
            resourcesState.scannedCourse = { ...resource, sections: resource.sections };
            resourcesState.scanSummary = {
                section_count: resource.sections.length,
                experiment_count: resource.sections.reduce((sum, sec) => sum + (sec.experiments?.length || 0), 0),
                file_count: 0
            };
            resourcesState.draftSections = resourcesState.scannedCourse.sections || [];
        }
    } else {
        setCreateViewMode("import");
        resetCreateForm();
        resourcesState.draftSections = [];
    }
    updateCreateEntryModeUI();
    renderCoursePreview();
    renderSectionEditor();
    renderMaterialList();
    renderScanStatus();
    renderStructurePreview();
    renderPackagePathSummary();
    const publishEl = document.getElementById("resources-publish-status");
    if (publishEl) publishEl.textContent = "准备发布";
    updateCreateFormState();
    return true;
}

function openCreateEditorForManage(resource, step = 2, tip = "") {
    if (!resource) return;
    openCreateView(resource);
    setCreateStep(step);
    if (tip) {
        alert(tip);
    }
}

function closeCreateView() {
    const createView = document.getElementById("resources-create-view");
    if (createView) createView.style.display = "none";
    resourcesState.editingCourseId = null;
    showListView();
}

function toggleAdvancedPanel() {
    const panel = document.getElementById("resources-advanced-panel");
    const toggleBtn = document.getElementById("resources-advanced-toggle");
    if (!panel) return;
    const isHidden = panel.style.display === "none" || !panel.style.display;
    panel.style.display = isHidden ? "block" : "none";
    if (toggleBtn) {
        toggleBtn.textContent = isHidden ? "收起高级设置" : "高级设置";
    }
}

function isCreateInfoComplete() {
    return isCreateInfoCompleteFlow(getCreateRequiredFields, document);
}

function updateCreateFormState() {
    return updateCreateFormStateFlow({
        documentRef: document,
        editingCourseId: resourcesState.editingCourseId,
        localCourses: resourcesState.localCourses,
        createEntryMode: resourcesState.createEntryMode,
        createSource: resourcesState.createSource,
        cloudImported: resourcesState.cloudImported,
        scannedCourse: resourcesState.scannedCourse,
        draftSections: resourcesState.draftSections,
        isCreateInfoComplete,
        maybeAutoFillCourseId,
        renderCoursePreview,
        updateCreateCoverPreview,
        updateLocalPathVisibility,
        updateStepperUI,
    });
}

function prepareTemplate() {
    // 模板输入已移除
}

function fillCreateFormFromCourse(course, fillEmptyOnly = true) {
    return fillCreateFormFromCourseFlow(course, {
        documentRef: document,
        updateCreateCoverPreview,
        fillEmptyOnly,
    });
}

async function importLocalCourseFromPath(path) {
    return importLocalCourseFromPathFlow(path, {
        apiClient,
        deriveTitleFromPath,
        setScannedCourse: (value) => { resourcesState.scannedCourse = value; },
        setScanSummary: (value) => { resourcesState.scanSummary = value; },
        setScanError: (value) => { resourcesState.scanError = value; },
        setDraftSections: (value) => { resourcesState.draftSections = value; },
        fillCreateFormFromCourse,
        renderSectionEditor,
        renderMaterialList,
        renderScanStatus,
        renderStructurePreview,
        renderCoursePreview,
        updateCreateFormState,
        renderCreateGuide,
        setImportStatus: setCreateImportStatus,
    });
}

async function importLocalPackageToPath() {
    return importLocalPackageToPathFlow({
        documentRef: document,
        apiClient,
        setScannedCourse: (value) => { resourcesState.scannedCourse = value; },
        setScanSummary: (value) => { resourcesState.scanSummary = value; },
        setScanError: (value) => { resourcesState.scanError = value; },
        setDraftSections: (value) => { resourcesState.draftSections = value; },
        fillCreateFormFromCourse,
        renderSectionEditor,
        renderMaterialList,
        renderScanStatus,
        renderStructurePreview,
        renderCoursePreview,
        renderLocalPathSummary,
        updateCreateFormState,
        renderCreateGuide,
        addCourse,
        onImported: async () => { await loadResourcesIndex(); },
        setImportStatus: setCreateImportStatus,
    });
}

async function pickLocalCourse() {
    return pickLocalCourseFlow({
        electronAPI: window.electronAPI,
        documentRef: document,
        renderLocalPathSummary,
        createEntryMode: resourcesState.createEntryMode,
        getCreateMetaFromForm,
        deriveTitleFromPath,
        apiClient,
        setScannedCourse: (value) => { resourcesState.scannedCourse = value; },
        setScanSummary: (value) => { resourcesState.scanSummary = value; },
        setScanError: (value) => { resourcesState.scanError = value; },
        draftSections: () => resourcesState.draftSections,
        setDraftSections: (value) => { resourcesState.draftSections = value; },
        buildDefaultSections,
        fillCreateFormFromCourse,
        renderSectionEditor,
        renderMaterialList,
        renderScanStatus,
        renderStructurePreview,
        renderCoursePreview,
        updateCreateFormState,
        setImportStatus: setCreateImportStatus,
    });
}

async function pickLocalPackage() {
    return pickLocalPackageFlow({
        electronAPI: window.electronAPI,
        documentRef: document,
        renderPackagePathSummary,
        updateCreateFormState,
    });
}

async function fetchCloudCourse() {
    return fetchCloudCourseFlow({
        documentRef: document,
        cloudCourseOptions: resourcesState.cloudCourseOptions,
        electronAPI: window.electronAPI,
        renderLocalPathSummary,
        normalizeOrigin,
        cloudTempSource: resourcesState.cloudTempSource,
        buildSourceOverrideFromCourseMeta,
        cloudTempToken: resourcesState.cloudTempToken,
        apiClient,
        setScannedCourse: (value) => { resourcesState.scannedCourse = value; },
        setScanSummary: (value) => { resourcesState.scanSummary = value; },
        setScanError: (value) => { resourcesState.scanError = value; },
        setDraftSections: (value) => { resourcesState.draftSections = value; },
        setCloudImported: (value) => { resourcesState.cloudImported = value; },
        updateCreateCoverPreview,
        renderSectionEditor,
        renderMaterialList,
        renderScanStatus,
        renderStructurePreview,
        renderCoursePreview,
        updateCreateFormState,
        setImportStatus: setCreateImportStatus,
    });
}

async function importCloudCourseAndSave() {
    return importCloudCourseAndSaveFlow(fetchCloudCourse, async () => {
        if (resourcesState.cloudImported && resourcesState.scannedCourse) {
            await saveLocalCourse();
        }
    }, setCreateImportStatus);
}

async function quickAddLocalCourse() {
    return quickAddLocalCourseFlow({
        electronAPI: window.electronAPI,
        deriveTitleFromPath,
        apiClient,
        addCourse,
        buildQuickCourse,
    });
}

async function quickAddCloudCourse() {
    return quickAddCloudCourseFlow({
        documentRef: document,
        deriveTitleFromUrl,
        buildQuickCourse,
        addCourse,
    });
}

function buildQuickCourse({ title, localPath = "", cloudUrl = "", templateData = null }) {
    return stripRemovedIntegrationMetadata(buildQuickCourseFlow({ title, localPath, cloudUrl, templateData }, {
        buildQuickCoursePayload,
        normalizeTagsInput,
        isPackageUrl,
    }));
}

function buildCourseFromForm(baseCourse = null) {
    return stripRemovedIntegrationMetadata(buildCourseFromFormFlow(baseCourse, {
        documentRef: document,
        buildCourseFromFormPayload,
        parseTags,
        scannedCourse: resourcesState.scannedCourse,
        normalizeOrigin,
    }));
}

function addCourse(course, options = {}) {
    return addCourseFlow(stripRemovedIntegrationMetadata(course), options, {
        normalizeOrigin,
        localCourses: resourcesState.localCourses,
        setLocalCourses: (value) => { resourcesState.localCourses = value; },
        persistLocalCoursesState,
        buildFilterOptions,
        applyFilters,
        closeCreateView,
        currentResource: resourcesState.currentResource,
        setCurrentResource: (value) => { resourcesState.currentResource = value; },
        notifyCourseUpdated,
        notifyCourseCreated,
    });
}

async function saveLocalCourse() {
    return saveLocalCourseFlow({
        createEntryMode: resourcesState.createEntryMode,
        scannedCourse: () => resourcesState.scannedCourse,
        isCreateInfoComplete,
        updateCreateFormState,
        createSource: resourcesState.createSource,
        draftSections: () => resourcesState.draftSections,
        setDraftSections: (value) => { resourcesState.draftSections = value; },
        ensureMinimumSections,
        renderSectionEditor,
        renderMaterialList,
        renderStructurePreview,
        saveCourseStructure,
        editingCourseId: resourcesState.editingCourseId,
        localCourses: resourcesState.localCourses,
        documentRef: document,
        buildCourseFromForm,
        cloudImported: () => resourcesState.cloudImported,
        withCourseSyncFingerprint,
        persistCourseToDisk,
        apiClient,
        updateCourse,
        addCourse,
    });
}

function updateCourse(course) {
    return updateCourseFlow(course, {
        title,
        normalizeOrigin,
        localCourses: resourcesState.localCourses,
        setLocalCourses: (value) => { resourcesState.localCourses = value; },
        persistLocalCoursesState,
        buildFilterOptions,
        applyFilters,
        clearEditingCourseId: () => { resourcesState.editingCourseId = null; },
        showDetailView,
        notifyCourseUpdated,
    });
}

function notifyCourseCreated(course) {
    if (!course || course.source !== "local") return;
    alert("课程已创建。");
}
async function testCurrentExperiment(resource = resourcesState.currentResource) {
    if (!resource) return;
    const sections = normalizeSections(resource);
    const section = sections[resourcesState.activeSectionIndex] || sections[0] || null;
    const experiments = Array.isArray(section?.experiments) ? section.experiments : [];
    const experiment = experiments[resourcesState.activeExperimentIndex] || experiments[0] || null;
    const entry = pickAutoTestEntry(experiment || {});
    if (!entry) {
        alert("当前实验没有可测试入口。");
        return;
    }
    await openExperimentEntry(entry.file, entry.kind, {
        resource,
        sectionIndex: resourcesState.activeSectionIndex,
        expIndex: resourcesState.activeExperimentIndex,
        experimentOverview: getExperimentFileOverview(experiment || {}),
    });
}

async function importRemoteCourseForTesting(resource) {
    return importRemoteCourseForTestingFlow(resource, {
        importRemoteCourse,
        alertUser: notifyUser,
        extractApiErrorMessage,
        mapRemoteExperimentToLocalCourse,
        activeSectionIndex: () => resourcesState.activeSectionIndex,
        activeExperimentIndex: () => resourcesState.activeExperimentIndex,
        setActiveSectionIndex: (value) => { resourcesState.activeSectionIndex = value; },
        setActiveExperimentIndex: (value) => { resourcesState.activeExperimentIndex = value; },
        showDetailView,
        testCurrentExperiment,
    });
}

function notifyCourseUpdated(course) {
    if (!course || course.source !== "local") return;
    alert("课程已更新。可在课程详情中点击“上传更新”同步到仓库。");
}

async function deleteCourse(course) {
    return deleteCourseFlow(course, {
        localCourses: resourcesState.localCourses,
        setLocalCourses: (value) => { resourcesState.localCourses = value; },
        persistLocalCoursesState,
        buildFilterOptions,
        applyFilters,
        showListView,
        openResourcesConfirm,
        alertUser: notifyUser,
    });
}

function resolveRepoBrowserUrl(path, resource = null) {
    return resolveRepoBrowserUrlFlow(path, resource, {
        getResourceSourceContext,
        resolveResourceUrl,
    });
}

function resolveLocalPath(basePath, targetPath) {
    return resolveLocalPathFlow(basePath, targetPath);
}

async function openLocalPath(targetPath) {
    return openLocalPathFlow(targetPath, window.electronAPI);
}

function updateSourceInfo() {
    return updateSourceInfoFlow({
        documentRef: document,
        isMockData: resourcesState.isMockData,
        remoteSources: resourcesState.remoteSources,
        repoUrl: resourcesState.repoUrl,
        submitUrl: resourcesState.submitUrl,
    });
}

function renderEmptyState(message) {
    return renderEmptyStateFlow(message, { documentRef: document });
}

function applyResourcesIndex(indexData, options = {}) {
    return applyResourcesIndexFlow(indexData, options, {
        localCourses: resourcesState.localCourses,
        indexBranch: resourcesState.indexBranch,
        setResourcesMeta: (value) => { resourcesState.resourcesMeta = value; },
        setSubmitUrl: (value) => { resourcesState.submitUrl = value; },
        setRepoUrl: (value) => { resourcesState.repoUrl = value; },
        setRawBaseUrl: (value) => { resourcesState.rawBaseUrl = value; },
        setIndexBranch: (value) => { resourcesState.indexBranch = value; },
        setRemoteSources: (value) => { resourcesState.remoteSources = value; },
        setIsMockData: (value) => { resourcesState.isMockData = value; },
        setRemoteSource: (value) => { resourcesState.remoteSource = value; },
        setResourcesCache: (value) => { resourcesState.resourcesCache = value; },
        buildFilterOptions,
        updateSourceInfo,
        applyFilters,
    });
}

async function openExternal(url) {
    return openExternalFlow(url, window.electronAPI);
}

async function publishCourseFromDetail(resource) {
    return publishCourseFromDetailFlow(resource, {
        apiClient,
        getCourseOrigin,
        openPublishSourceConfigModal,
        ensureTokenForPublishFlow,
        ensureWriteTokenForPublish,
        extractApiErrorMessage,
        isAuthRelatedErrorMessage,
        promptTokenForPublish,
        resolvePublishRetryToken,
        mergeOriginAndSync: (target, response, fallbackOrigin) =>
            mergeOriginAndSync(target, response, fallbackOrigin, { normalizeOrigin, withCourseSyncFingerprint }),
        persistCourseToDisk,
        upsertLocalCourseRecord: (course, options = {}) =>
            upsertLocalCourseRecord(course, { ...options, addCourse, showDetailView }),
        openResourcesConfirm,
        openExternal,
        loadResourcesIndex,
        showDetailView,
    });
}

async function pullLatestForLocalCourse(resource) {
    return pullLatestForLocalCourseFlow(resource, {
        apiClient,
        getCourseOrigin,
        getLocalCourseChangeState,
        openResourcesConfirm,
        extractApiErrorMessage,
        resolvePublishRetryToken,
        normalizeOrigin,
        withCourseSyncFingerprint,
        persistCourseToDisk,
        upsertLocalCourseRecord: (course, options = {}) =>
            upsertLocalCourseRecord(course, { ...options, addCourse, showDetailView }),
        loadResourcesIndex,
        showDetailView,
        setImportStatus: setRemoteImportStatus,
    });
}

async function importRemoteCourse(resource, options = {}) {
    return importRemoteCourseFlow(resource, options, {
        apiClient,
        buildSourceOverrideFromCourseMeta,
        normalizeOrigin,
        withCourseSyncFingerprint,
        addCourse,
        extractApiErrorMessage,
        cloudTempToken: resourcesState.cloudTempToken,
        electronAPI: window.electronAPI,
        setImportStatus: setRemoteImportStatus,
    });
}

async function loadResourcesIndex() {
    if (resourcesState.resourcesIndexLoadPromise) {
        return resourcesState.resourcesIndexLoadPromise;
    }
    resourcesState.resourcesIndexLoadPromise = loadResourcesIndexFlow({
        documentRef: document,
        setLocalCourses: (value) => { resourcesState.localCourses = value; },
        localCourses: () => resourcesState.localCourses,
        loadLocalCourses,
        refreshLocalCoursesFromDisk,
        clearDemoCourseBindingIfNeeded,
        persistLocalCoursesState,
        scheduleClassroomSync,
        classroomState: resourcesState.classroomState,
        buildClassroomBaseUrl,
        apiClient,
        applyResourcesIndex,
        mockResourcesIndex,
        updateClassroomBanner,
    }).finally(() => {
        resourcesState.resourcesIndexLoadPromise = null;
    });
    return resourcesState.resourcesIndexLoadPromise;
}

function handleSearchInput(event) {
    if (resourcesState.searchTimer) {
        clearTimeout(resourcesState.searchTimer);
    }
    const value = event.target.value.trim();
    resourcesState.searchTimer = setTimeout(() => {
        filterState.query = value;
        applyFilters();
    }, 200);
}

function handleListClick(event) {
    const learningSpaceAction = event.target.closest("[data-learning-space-action]");
    if (learningSpaceAction) {
        handleLearningSpaceAction(learningSpaceAction.dataset.learningSpaceAction);
        return;
    }

    const actionBtn = event.target.closest("[data-action]");
    if (actionBtn) {
        const action = actionBtn.dataset.action;
        const url = actionBtn.dataset.url;

        if (action === "download" || action === "open") {
            openExternal(url);
        }
        if (action === "create") {
            openCreateView();
            return;
        }
        if (action === "detail") {
            const card = event.target.closest(".resource-card");
            if (card) {
                const index = Number(card.dataset.resourceIndex);
                if (!Number.isNaN(index) && resourcesState.displayedResources[index]) {
                    showDetailView(resourcesState.displayedResources[index]);
                }
            }
        }
        return;
    }

    const card = event.target.closest(".resource-card");
    if (!card) return;

    const index = Number(card.dataset.resourceIndex);
    if (Number.isNaN(index) || !resourcesState.displayedResources[index]) {
        return;
    }

    showDetailView(resourcesState.displayedResources[index]);
}

async function handleLearningSpaceAction(action) {
    if (action === "cloud-import") {
        if (!resourcesState.teacherMode.unlocked) return;
        openCreateView();
        chooseCreateEntryMode("cloud-import");
        return;
    }
    if (action === "import-local") {
        if (!resourcesState.teacherMode.unlocked) return;
        openCreateView();
        chooseCreateEntryMode("pack-import");
        return;
    }
    if (action === "connect-classroom") {
        const classroomCode = await requestStudentClassroomCode();
        if (classroomCode === null) return;
        const result = await connectStudentClassroomByCode(classroomCode, { showResourcesView: true });
        if (!result?.success && result?.message) {
            alert(result.message);
        }
        return;
    }
    if (action === "refresh") {
        await loadResourcesIndex();
    }
}

function toggleDetailMoreMenu() {
    const menu = document.getElementById("resources-detail-more-menu");
    if (!menu) return;
    menu.classList.toggle("is-open");
}

function closeDetailMoreMenu() {
    const menu = document.getElementById("resources-detail-more-menu");
    if (!menu) return;
    menu.classList.remove("is-open");
}

function bindDetailMoreMenu() {
    if (resourcesState.detailMoreMenuBound) return;
    resourcesState.detailMoreMenuBound = true;
    document.addEventListener("click", (event) => {
        const menu = document.getElementById("resources-detail-more-menu");
        const btn = document.getElementById("resources-detail-more-btn");
        if (!menu || !btn) return;
        if (menu.contains(event.target) || btn.contains(event.target)) return;
        menu.classList.remove("is-open");
    });
}

function toggleCreateEntryMenu() {
    const menu = document.getElementById("resources-create-entry-menu");
    if (!menu) return;
    menu.classList.toggle("is-open");
}

function closeCreateEntryMenu() {
    const menu = document.getElementById("resources-create-entry-menu");
    if (!menu) return;
    menu.classList.remove("is-open");
}

function bindCreateEntryMenu() {
    if (resourcesState.createEntryMenuBound) return;
    resourcesState.createEntryMenuBound = true;
    document.addEventListener("click", (event) => {
        const menu = document.getElementById("resources-create-entry-menu");
        const btn = document.getElementById("resources-add-btn");
        if (!menu || !btn) return;
        if (menu.contains(event.target) || btn.contains(event.target)) return;
        menu.classList.remove("is-open");
    });
}

function bindEvents() {
    return bindResourcesUI({
        documentRef: document,
        navigatorRef: navigator,
        state: {
            filterState,
            pageState,
            submitUrl: () => resourcesState.submitUrl,
            repoUrl: () => resourcesState.repoUrl,
        },
        handleSearchInput,
        hasActiveResourceFilters,
        updateResourcesSearchUI,
        applyFilters,
        loadResourcesIndex,
        handleTeacherModeToggle,
        discoverClassrooms,
        openExternal,
        renderResources,
        filteredResources: () => resourcesState.filteredResources,
        showListView,
        ensureTeacherModeForEdit,
        pullLatestForLocalCourse,
        importRemoteCourse,
        openCreateView,
        deleteCourse,
        currentResource: () => resourcesState.currentResource,
        toggleDetailMoreMenu,
        bindDetailMoreMenu,
        startClassroomForResource,
        stopClassroomWithPrompt,
        publishCourseFromDetail,
        toggleCreateEntryMenu,
        bindCreateEntryMenu,
        closeCreateEntryMenu,
        chooseCreateEntryMode,
        closeCreateView,
        quickAddCloudCourse,
        toggleAdvancedPanel,
        updateCreateFormState,
        renderLocalPathSummary,
        renderPackagePathSummary,
        renderCloudCoursePreview,
        loadSelectedCloudCourseDetails,
        createSource: () => resourcesState.createSource,
        draftSections: () => resourcesState.draftSections,
        setDraftSections: (value) => { resourcesState.draftSections = value; },
        buildDefaultSections,
        renderSectionEditor,
        renderMaterialList,
        saveCourseStructure,
        applyCoverFile,
        updateCreateCoverPreview,
        buildDefaultTemplate,
        saveLocalCourse,
        scanCourse,
        publishCourse,
        setCreateStep,
        createStep: () => resourcesState.createStep,
        importRemoteCourse,
        setCreateSource,
        pickLocalPackage,
        useDefaultSampleCourse,
        importLocalPackageToPath,
        handlePackageDrop,
        handleCourseImportDrop,
        pickLocalCourse,
        loadCloudCourseOptions,
        importCloudCourseAndSave,
        loadCloudCoursesFromTempSource,
        clearCloudTempSourceAndReload,
        updateCloudSourceActionUI,
        addResourceSourceRow,
        saveResourceSourcesConfig,
        teacherUnlocked: () => resourcesState.teacherMode.unlocked,
        openJupyterWorkspace: window.app?.workspace?.openJupyterWorkspace,
        startJupyter: window.app?.jupyter?.startJupyter,
        resourcesSearchExpandedRef: {
            get: () => resourcesState.resourcesSearchExpanded,
            set: (value) => { resourcesState.resourcesSearchExpanded = value; },
        },
        handleListClick,
    });
}

export async function initResourcesPage() {
    if (isStudentLessonMode()) {
        syncStudentPageBodyState(resourcesState.activeCourseWorkspaceTab);
    }
    if (resourcesState.resourcesPageInitPromise) {
        return resourcesState.resourcesPageInitPromise;
    }
    if (!resourcesState.initialized) {
        bindEvents();
        resourcesState.initialized = true;
    }
    if (resourcesState.resourcesPageReady) {
        return;
    }
    resourcesState.resourcesPageInitPromise = (async () => {
        const backendReady = await waitForBackendBeforeResourceRequests();
        if (!backendReady) {
            console.warn("后端尚未就绪，暂不加载课堂和课程资源请求");
            return;
        }
        await initClassroom();
        await loadResourcesIndex();
        if (!isStudentLessonMode()) {
            showListView();
        } else if (!resourcesState.currentResource) {
            renderStudentLessonEmpty(resourcesState.activeCourseWorkspaceTab);
        }
        resourcesState.resourcesPageReady = true;
    })();
    try {
        await resourcesState.resourcesPageInitPromise;
    } finally {
        resourcesState.resourcesPageInitPromise = null;
    }
}

export async function openStudentLessonTab(tabId = "route", navItem = null) {
    resourcesState.openingStudentLessonTab = true;
    resourcesState.activeCourseWorkspaceTab = normalizeWorkspaceTabId(tabId);
    syncStudentPageBodyState(resourcesState.activeCourseWorkspaceTab);
    try {
        if (shouldHideJupyterForStudentTab(resourcesState.activeCourseWorkspaceTab)) {
            await window.app?.jupyter?.setVisibility?.(false);
        }
        if (navItem) {
            document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
            navItem.classList.add("active");
        } else {
            syncStudentLessonNav(resourcesState.activeCourseWorkspaceTab);
        }

        if (resourcesState.activeCourseWorkspaceTab !== "python" && resourcesState.activeCourseWorkspaceTab !== "visual" && window.app?.ui?.showTab) {
            window.app.ui.showTab("resources", navItem || document.getElementById("nav-student-lesson-item"));
        }

        const cachedCourse = pickStudentCurrentCourse();
        if (cachedCourse && (resourcesState.activeCourseWorkspaceTab === "python" || resourcesState.activeCourseWorkspaceTab === "visual")) {
            initResourcesPage().catch((error) => {
                console.warn("后台刷新课程资源失败:", error);
            });
            if (resourcesState.activeCourseWorkspaceTab === "python") {
                return openStudentPythonWorkspace(cachedCourse);
            }
            return openStudentVisualWorkspace(cachedCourse);
        }

        await initResourcesPage();
        const currentCourse = pickStudentCurrentCourse();
        if (!currentCourse && (resourcesState.activeCourseWorkspaceTab === "python" || resourcesState.activeCourseWorkspaceTab === "visual")) {
            return openStudentLessonTab("route", document.getElementById("nav-student-lesson-item"));
        }
        if (!currentCourse) {
            renderStudentLessonEmpty(resourcesState.activeCourseWorkspaceTab);
            return null;
        }
        if (resourcesState.activeCourseWorkspaceTab === "python") {
            return openStudentPythonWorkspace(currentCourse);
        }
        if (resourcesState.activeCourseWorkspaceTab === "visual") {
            return openStudentVisualWorkspace(currentCourse);
        }
        resourcesState.activeSectionIndex = getCurrentLessonIndex(currentCourse);
        showDetailView(currentCourse, {
            tabId: resourcesState.activeCourseWorkspaceTab,
            preserveExperiment: true,
            preserveSection: true,
        });
        return currentCourse;
    } finally {
        resourcesState.openingStudentLessonTab = false;
        if (resourcesState.pendingTeacherModeShellSync) {
            updateTeacherModeUI();
        }
    }
}

export async function refreshResources() {
    resourcesState.resourcesPageReady = true;
    await loadResourcesIndex();
}

export async function openResourcesLibrary() {
    await initResourcesPage();
    resourcesState.activeCourseWorkspaceTab = "route";
    showListView();
    renderResources(resourcesState.filteredResources);
}

export function openSubmitPage() {
    openExternal(resourcesState.submitUrl);
}

export async function syncTeacherModeUI() {
    await ensureTeacherModeReady();
    updateTeacherModeUI();
}

export async function toggleTeacherMode() {
    await handleTeacherModeToggle();
}

async function prepareStudentClassroomLaunch(resource, options = {}) {
    return prepareStudentClassroomLaunchFlow(resource, options, {
        getStoredProjectDirFallback: () => getStoredProjectDirFallback(document),
        resolveClassroomPullTargetPath,
        apiClient,
        addCourse,
        findFirstNotebookPathInCourse,
        normalizeSections,
        getExperimentFileOverview,
        isRemotePath,
    });
}

export async function connectStudentClassroomByCode(code, options = {}) {
    return connectStudentClassroomByCodeFlow(code, options, {
        initialized: () => resourcesState.initialized,
        setInitialized: (value) => { resourcesState.initialized = value; },
        bindEvents,
        setLocalCourses: (value) => { resourcesState.localCourses = value; },
        localCourses: () => resourcesState.localCourses,
        loadLocalCourses,
        loadClassroomConfig,
        ensureTeacherModeReady,
        classroomState: resourcesState.classroomState,
        buildClassroomBaseUrl,
        apiClient,
        requestManualClassroomAddress,
        rememberClassroomSource,
        applyResourcesIndex,
        pickClassroomLaunchResource,
        prepareStudentClassroomLaunch,
        extractApiErrorMessage,
        updateClassroomBanner,
        showDetailView,
        showListView,
        resourcesCache: () => resourcesState.resourcesCache,
    });
}

export function getChatContext() {
    return {
        experience_mode: getExperienceMode(Boolean(resourcesState.teacherMode.unlocked)),
        teacher_mode: {
            unlocked: Boolean(resourcesState.teacherMode.unlocked),
            code: resourcesState.teacherMode.code || "",
        },
        course: resourcesState.currentResource
            ? JSON.parse(JSON.stringify(resourcesState.currentResource))
            : null,
        experiment_context: getCurrentExperimentSelection(),
    };
}

export function getCurrentExperimentSelection() {
    if (!resourcesState.currentResource) return null;
    const sections = normalizeSections(resourcesState.currentResource);
    const section = sections[resourcesState.activeSectionIndex] || null;
    const experiments = Array.isArray(section?.experiments) ? section.experiments : [];
    const experiment = experiments[resourcesState.activeExperimentIndex] || null;
    if (!experiment) return null;
    return buildCurrentExperimentContext(
        resourcesState.currentResource,
        resourcesState.activeSectionIndex,
        resourcesState.activeExperimentIndex,
        experiment,
        getExperimentFileOverview(experiment)
    );
}

export function applyAgentCourseUpdate(course) {
    if (!course || typeof course !== "object") return false;
    const normalizedCourse = {
        ...course,
        source: "local",
    };
    addCourse(normalizedCourse, { silent: true });
    if (resourcesState.currentResource && ((normalizedCourse.id && resourcesState.currentResource.id === normalizedCourse.id) || (normalizedCourse.local_path && resourcesState.currentResource.local_path === normalizedCourse.local_path))) {
        resourcesState.currentResource = normalizedCourse;
        renderResourceDetail(resourcesState.currentResource);
    }
    return true;
}
