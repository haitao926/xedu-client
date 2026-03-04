// 课程资源库页面
import apiClient from "./api.js";

let resourcesCache = [];
let resourcesMeta = {};
let searchTimer = null;
let initialized = false;
let submitUrl = "";
let repoUrl = "";
let rawBaseUrl = "";
let indexBranch = "main";
let displayedResources = [];
let filteredResources = [];
let currentResource = null;
let isMockData = false;
let localCourses = [];
let createSource = "local";
let editingCourseId = null;
let createStep = 1;
let scannedCourse = null;
let scanSummary = null;
let scanError = "";
let publishStatus = "idle";
let draftSections = [];

const pageState = {
    current: 1,
    size: 6
};

const sectionGridSize = 6;

const createRequiredFields = [
    "resources-create-title",
    "resources-create-desc",
    "resources-create-grade",
    "resources-create-subject",
    "resources-create-cover"
];

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
    updated_at: "2026-02-10",
    resources: [
        {
            id: "ai-vision-intro",
            title: "AI 视觉入门实验包",
            description: "包含图像分类与目标检测的基础实验，适合七年级。",
            grade: "七年级",
            subject: "信息科技",
            author: "示例老师",
            version: "1.0",
            updated_at: "2026-02-10",
            sections: [
                {
                    title: "第一节：图像分类",
                    experiments: [
                        {
                            title: "实验一：猫狗分类",
                            description: "认识数据集与简单分类模型。",
                            files: [
                                { path: "lesson1/exp1/main.ipynb", type: "ipynb" },
                                { path: "lesson1/exp1/index.html", type: "html" },
                                { path: "lesson1/exp1/utils/", type: "dir" }
                            ]
                        },
                        {
                            title: "实验二：花卉分类",
                            description: "尝试不同的参数并观察结果。",
                            files: [
                                { path: "lesson1/exp2/main.ipynb", type: "ipynb" },
                                { path: "lesson1/exp2/index.html", type: "html" },
                                { path: "lesson1/exp2/utils/", type: "dir" }
                            ]
                        }
                    ]
                },
                {
                    title: "第二节：目标检测",
                    experiments: [
                        {
                            title: "实验一：交通标志检测",
                            description: "了解检测数据格式与标注。",
                            files: [
                                { path: "lesson2/exp1/main.ipynb", type: "ipynb" },
                                { path: "lesson2/exp1/index.html", type: "html" },
                                { path: "lesson2/exp1/utils/", type: "dir" }
                            ]
                        }
                    ]
                }
            ]
        },
        {
            id: "ai-audio-starter",
            title: "AI 语音入门实验包",
            description: "语音识别与语音情感分类的入门实验。",
            grade: "八年级",
            subject: "信息科技",
            author: "示例老师",
            version: "0.9",
            updated_at: "2026-02-09",
            sections: [
                {
                    title: "第一节：语音识别",
                    experiments: [
                        {
                            title: "实验一：关键词识别",
                            description: "体验语音识别的基础流程。",
                            files: [
                                { path: "audio/exp1/main.ipynb", type: "ipynb" },
                                { path: "audio/exp1/index.html", type: "html" },
                                { path: "audio/exp1/utils/", type: "dir" }
                            ]
                        }
                    ]
                }
            ]
        }
    ]
};

const localCoursesKey = "xedu_local_courses";

const filterState = {
    query: "",
    grade: "",
    subject: "",
    tag: ""
};

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

async function applyCoverFile(file) {
    if (!file) return;
    try {
        const dataUrl = await readFileAsDataUrl(file);
        const createCoverInput = document.getElementById("resources-create-cover");
        const coverPreview = document.getElementById("resources-cover-preview");
        const coverPreviewImg = document.getElementById("resources-cover-preview-img");
        if (createCoverInput) {
            createCoverInput.value = dataUrl;
        }
        if (coverPreview && coverPreviewImg) {
            coverPreviewImg.src = dataUrl;
            coverPreview.style.display = "flex";
        }
        updateCreateFormState();
    } catch (error) {
        console.warn("读取封面失败:", error);
    }
}

function normalizeText(value) {
    return (value || "").toString().toLowerCase();
}

function hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
        hash = (hash << 5) - hash + value.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(16);
}

function generateCourseId(title) {
    const base = (title || "").toString().trim().toLowerCase();
    const slug = base
        .replace(/[\s_]+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    if (slug) return slug;
    const digest = hashString(base || "course").slice(0, 8);
    return `course-${digest}`;
}

function maybeAutoFillCourseId() {
    const idInput = document.getElementById("resources-create-id");
    if (!idInput || idInput.value.trim()) return;
    if (scannedCourse && scannedCourse.id) {
        idInput.value = scannedCourse.id;
        return;
    }
    const title = document.getElementById("resources-create-title")?.value.trim();
    if (!title) return;
    idInput.value = generateCourseId(title);
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

function isStep1Complete() {
    const meta = getCreateMetaFromForm();
    return Boolean(meta.title && meta.description && meta.grade && meta.subject && meta.coverDataUrl);
}

function isStep2Complete() {
    const localPath = document.getElementById("resources-create-local-path")?.value.trim() || "";
    return Boolean(localPath && scannedCourse && !scanError);
}

function updateStepperUI() {
    document.querySelectorAll(".resources-step").forEach((stepEl) => {
        const step = Number(stepEl.dataset.step);
        stepEl.classList.toggle("active", step === createStep);
    });
    document.querySelectorAll(".resources-create-step").forEach((stepEl) => {
        const step = Number(stepEl.dataset.step);
        stepEl.classList.toggle("active", step === createStep);
    });

    const prevBtn = document.getElementById("resources-step-prev");
    const nextBtn = document.getElementById("resources-step-next");
    if (prevBtn) prevBtn.disabled = createStep <= 1;
    if (nextBtn) {
        if (createStep === 1) {
            nextBtn.textContent = "下一步";
            nextBtn.disabled = !isStep1Complete();
        } else if (createStep === 2) {
            nextBtn.textContent = "下一步";
            nextBtn.disabled = !isStep2Complete();
        } else {
            nextBtn.textContent = "完成";
            nextBtn.disabled = false;
        }
    }

    const publishBtn = document.getElementById("resources-publish-btn");
    const saveBtn = document.getElementById("resources-create-save-btn");
    if (publishBtn) publishBtn.disabled = !(isStep1Complete() && isStep2Complete());
    if (saveBtn) saveBtn.disabled = !(isStep1Complete() && isStep2Complete());
}

function setCreateStep(step) {
    createStep = Math.min(3, Math.max(1, step));
    updateStepperUI();
}

function renderCoursePreview() {
    const preview = document.getElementById("resources-create-preview");
    if (!preview) return;
    const meta = getCreateMetaFromForm();
    const tags = meta.tags || [];
    const cover = meta.coverDataUrl;
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

    if (scanError) {
        statusEl.textContent = scanError;
        statusEl.classList.add("error");
        statusEl.classList.remove("success");
        summaryEl.innerHTML = "";
        return;
    }

    if (scannedCourse) {
        if (scanSummary?.initialized && scanSummary?.auto_built) {
            statusEl.textContent = "已初始化 course.json 并生成结构";
        } else if (scanSummary?.initialized) {
            statusEl.textContent = "已初始化 course.json";
        } else if (scanSummary?.auto_built) {
            statusEl.textContent = "已从文件夹生成结构";
        } else {
            statusEl.textContent = "解析成功";
        }
        statusEl.classList.add("success");
        statusEl.classList.remove("error");
        summaryEl.innerHTML = `
            <div>课程 ID：${scannedCourse.id || "-"}</div>
            <div>课程版本：${scannedCourse.version || "-"}</div>
            <div>课节数：${scanSummary?.section_count || 0}</div>
            <div>实验数：${scanSummary?.experiment_count || 0}</div>
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
    if (!scannedCourse || !Array.isArray(scannedCourse.sections)) {
        container.innerHTML = "<div>暂无结构预览</div>";
        return;
    }
    const html = scannedCourse.sections
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
        title: `第 ${index + 1} 节`,
        description: "",
        experiments: Array.from({ length: safeExpCount }).map((__, expIndex) => ({
            title: `实验${expIndex + 1}`,
            description: "",
            files: []
        }))
    }));
}

function renderSectionEditor() {
    const container = document.getElementById("resources-section-editor");
    if (!container) return;
    container.innerHTML = "";

    if (!draftSections.length) {
        const empty = document.createElement("div");
        empty.className = "resources-empty";
        empty.textContent = "尚未生成课节";
        container.appendChild(empty);
        return;
    }

    draftSections.forEach((section, sectionIndex) => {
        const sectionCard = document.createElement("div");
        sectionCard.className = "resources-section-editor-card";

        const header = document.createElement("div");
        header.className = "resources-section-editor-header";

        const titleInput = document.createElement("input");
        titleInput.className = "form-control";
        titleInput.placeholder = `第 ${sectionIndex + 1} 节名称`;
        titleInput.value = section.title || "";
        titleInput.addEventListener("input", (event) => {
            draftSections[sectionIndex].title = event.target.value.trim();
        });
        header.appendChild(titleInput);

        const removeBtn = document.createElement("button");
        removeBtn.className = "btn btn-secondary btn-sm";
        removeBtn.textContent = "删除";
        removeBtn.addEventListener("click", () => {
            draftSections.splice(sectionIndex, 1);
            renderSectionEditor();
            renderMaterialList();
        });
        header.appendChild(removeBtn);

        sectionCard.appendChild(header);

        const expList = document.createElement("div");
        expList.className = "resources-section-editor-experiments";

        (section.experiments || []).forEach((exp, expIndex) => {
            const expRow = document.createElement("div");
            expRow.className = "resources-section-editor-exp";

            const expInput = document.createElement("input");
            expInput.className = "form-control";
            expInput.placeholder = `实验 ${expIndex + 1} 名称`;
            expInput.value = exp.title || "";
            expInput.addEventListener("input", (event) => {
                draftSections[sectionIndex].experiments[expIndex].title = event.target.value.trim();
            });
            expRow.appendChild(expInput);

            const expRemove = document.createElement("button");
            expRemove.className = "btn btn-secondary btn-sm";
            expRemove.textContent = "删除实验";
            expRemove.addEventListener("click", () => {
                draftSections[sectionIndex].experiments.splice(expIndex, 1);
                renderSectionEditor();
                renderMaterialList();
            });
            expRow.appendChild(expRemove);

            expList.appendChild(expRow);
        });

        const addExpBtn = document.createElement("button");
        addExpBtn.className = "btn btn-secondary btn-sm";
        addExpBtn.textContent = "添加实验";
        addExpBtn.addEventListener("click", () => {
            draftSections[sectionIndex].experiments.push({
                title: `实验 ${draftSections[sectionIndex].experiments.length + 1}`,
                description: "",
                files: []
            });
            renderSectionEditor();
            renderMaterialList();
        });

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
    const sections = scannedCourse?.sections || draftSections;
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
        scannedCourse = response.course;
        scanSummary = response.summary;
        draftSections = scannedCourse.sections || [];
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

    const sections = scannedCourse?.sections || draftSections;
    if (!sections || !sections.length) {
        const empty = document.createElement("div");
        empty.className = "resources-empty";
        empty.textContent = "请先保存课程结构";
        container.appendChild(empty);
        return;
    }

    sections.forEach((section, sectionIndex) => {
        const sectionBlock = document.createElement("div");
        sectionBlock.className = "resources-material-section";

        const title = document.createElement("div");
        title.className = "resources-material-section-title";
        title.textContent = section.title || `第 ${sectionIndex + 1} 节`;
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
            expMeta.textContent = fileCount ? `${fileCount} 个文件` : "未选择材料";
            info.appendChild(expTitle);
            info.appendChild(expMeta);
            item.appendChild(info);

            const pickBtn = document.createElement("button");
            pickBtn.className = "btn btn-secondary btn-sm";
            pickBtn.textContent = "选择材料文件夹";
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
                    const targetSections = scannedCourse?.sections || draftSections;
                    const expTarget = targetSections?.[sectionIndex]?.experiments?.[expIndex];
                    if (expTarget) {
                        expTarget.files = response.files || [];
                    }
                    if (scannedCourse) {
                        scannedCourse.sections = targetSections;
                    } else {
                        draftSections = targetSections;
                    }
                    await saveCourseStructure();
                } catch (error) {
                    alert(error.message || "读取材料失败");
                }
            });
            item.appendChild(pickBtn);
            sectionBlock.appendChild(item);
        });

        container.appendChild(sectionBlock);
    });
}

async function scanCourse() {
    const localPath = document.getElementById("resources-create-local-path")?.value.trim() || "";
    if (!localPath) return;
    scanError = "";
    scannedCourse = null;
    scanSummary = null;
    renderScanStatus();

    try {
        const meta = getCreateMetaFromForm();
        const response = await apiClient.post("/api/resources/scan", {
            local_path: localPath,
            init_if_missing: true,
            auto_build: true,
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
        scannedCourse = response.course;
        scanSummary = response.summary;
        if (scannedCourse && Array.isArray(scannedCourse.sections)) {
            draftSections = scannedCourse.sections;
            renderSectionEditor();
            renderMaterialList();
        }
        if (scannedCourse) {
            const idInput = document.getElementById("resources-create-id");
            const versionInput = document.getElementById("resources-create-version");
            if (idInput && !idInput.value) idInput.value = scannedCourse.id || "";
            if (versionInput && !versionInput.value) versionInput.value = scannedCourse.version || "";

            // 填充空字段
            const titleInput = document.getElementById("resources-create-title");
            const descInput = document.getElementById("resources-create-desc");
            const gradeInput = document.getElementById("resources-create-grade");
            const subjectInput = document.getElementById("resources-create-subject");
            const authorInput = document.getElementById("resources-create-author");
            const tagsInput = document.getElementById("resources-create-tags");

            if (titleInput && !titleInput.value) titleInput.value = scannedCourse.title || "";
            if (descInput && !descInput.value) descInput.value = scannedCourse.description || "";
            if (gradeInput && !gradeInput.value) gradeInput.value = scannedCourse.grade || "";
            if (subjectInput && !subjectInput.value) subjectInput.value = scannedCourse.subject || "";
            if (authorInput && !authorInput.value) authorInput.value = scannedCourse.author || "";
            if (tagsInput && !tagsInput.value && Array.isArray(scannedCourse.tags)) {
                tagsInput.value = scannedCourse.tags.join(", ");
            }
        }
    } catch (error) {
        scanError = error.message || "解析失败";
    } finally {
        renderScanStatus();
        renderStructurePreview();
        renderCoursePreview();
        updateStepperUI();
    }
}

async function publishCourse() {
    const meta = getCreateMetaFromForm();
    const localPath = document.getElementById("resources-create-local-path")?.value.trim() || "";
    const statusEl = document.getElementById("resources-publish-status");
    if (statusEl) statusEl.textContent = "正在发布...";

    const coverDataUrl =
        meta.coverDataUrl && meta.coverDataUrl.startsWith("data:")
            ? meta.coverDataUrl
            : "";

    try {
        const response = await apiClient.post("/api/resources/publish", {
            local_path: localPath,
            course_id: meta.courseId || (scannedCourse && scannedCourse.id) || "",
            version: meta.version || (scannedCourse && scannedCourse.version) || "",
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
        publishStatus = "success";
        if (statusEl) statusEl.textContent = "发布成功，已同步到 Gitea";
        await loadResourcesIndex();
        showListView();
    } catch (error) {
        publishStatus = "error";
        let message = error?.message || "发布失败";
        if (error?.details) {
            try {
                const parsed = JSON.parse(error.details);
                if (parsed && parsed.message) {
                    message = parsed.message;
                }
            } catch (_) {
                message = `发布失败: ${error.details}`;
            }
        }
        if (statusEl) statusEl.textContent = message;
    }
}

function loadLocalCourses() {
    try {
        const raw = localStorage.getItem(localCoursesKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn("读取本地课程失败:", error);
        return [];
    }
}

function saveLocalCourses(list) {
    try {
        localStorage.setItem(localCoursesKey, JSON.stringify(list));
    } catch (error) {
        console.warn("保存本地课程失败:", error);
    }
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
    return resolveResourceUrl(cover);
}

function canEditResource(resource) {
    return Boolean(resource && resource.source === "local");
}

function getMutableSections(resource) {
    if (!resource) return null;
    if (Array.isArray(resource.sections)) return resource.sections;
    if (Array.isArray(resource.lessons)) return resource.lessons;
    if (Array.isArray(resource.modules)) return resource.modules;
    if (Array.isArray(resource.experiments)) {
        return [{ title: "实验列表", experiments: resource.experiments }];
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

function persistLocalCourses() {
    saveLocalCourses(localCourses);
    resourcesCache = localCourses.slice();
}

function resolveResourceUrl(url) {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
    }
    if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("file://")) {
        return url;
    }
    if (url.startsWith("/")) {
        return repoUrl ? `${repoUrl}${url}` : url;
    }
    if (rawBaseUrl) {
        return `${rawBaseUrl}/${url}`;
    }
    return url;
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

    const grades = uniqueValues(resourcesCache.map((item) => item.grade));
    const subjects = uniqueValues(resourcesCache.map((item) => item.subject));
    const tags = uniqueValues(resourcesCache.flatMap((item) => getTags(item)));

    fillSelectOptions(gradeSelect, grades, "全部年级");
    fillSelectOptions(subjectSelect, subjects, "全部学科");
    fillSelectOptions(tagSelect, tags, "全部标签");
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

function applyFilters() {
    if (currentResource) {
        showListView();
    }
    let filtered = resourcesCache.slice();

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

    filteredResources = filtered;
    pageState.current = 1;
    renderResources(filteredResources);
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
    title.textContent = "创建课程";
    card.appendChild(title);

    const hint = document.createElement("div");
    hint.className = "resource-add-hint";
    hint.textContent = "填写信息后导入本地课程";
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

function renderResources(list) {
    const container = document.getElementById("resources-list");
    const empty = document.getElementById("resources-empty");
    const count = document.getElementById("resources-count");
    const prevBtn = document.getElementById("resources-prev-btn");
    const nextBtn = document.getElementById("resources-next-btn");
    const indicator = document.getElementById("resources-page-indicator");
    const paginationBar = document.getElementById("resources-pagination-bar");

    if (!container || !empty) return;

    container.innerHTML = "";

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
        empty.style.display = "flex";
        empty.textContent =
            filterState.query || filterState.grade || filterState.subject || filterState.tag
                ? "没有匹配课程"
                : "暂无课程";
        if (paginationBar) {
            paginationBar.style.display = "none";
        }
        return;
    }

    empty.style.display = "none";

    const start = (pageState.current - 1) * pageState.size;
    const pageItems = list.slice(start, start + pageState.size);
    displayedResources = pageItems;

    pageItems.forEach((resource, index) => {
        const card = document.createElement("div");
        card.className = "resource-card";
        card.dataset.resourceIndex = index.toString();

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

        const badgeText = getText(resource, "grade", "").trim() || getText(resource, "subject", "").trim() || "课程包";
        const badge = document.createElement("div");
        badge.className = "resource-card-badge";
        badge.textContent = badgeText;
        header.appendChild(badge);

        card.appendChild(header);

        const desc = document.createElement("div");
        desc.className = "resource-card-desc";
        desc.textContent = getText(resource, "description", "");
        if (desc.textContent) {
            card.appendChild(desc);
        }

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

        const actions = document.createElement("div");
        actions.className = "resource-card-actions";

        const detailBtn = document.createElement("button");
        detailBtn.className = "btn btn-primary";
        detailBtn.textContent = "进入课程";
        detailBtn.dataset.action = "detail";
        actions.appendChild(detailBtn);

        if (resource.homepage) {
            const linkBtn = document.createElement("button");
            linkBtn.className = "btn btn-secondary";
            linkBtn.textContent = "查看详情";
            linkBtn.dataset.action = "open";
            linkBtn.dataset.url = resolveResourceUrl(resource.homepage);
            actions.appendChild(linkBtn);
        }

        card.appendChild(actions);
        container.appendChild(card);
    });

    // 不再渲染空位卡片，避免课程列表出现占位
}

function appendMeta(container, label, value) {
    const span = document.createElement("span");
    span.textContent = `${label}: ${value}`;
    container.appendChild(span);
}

function showListView() {
    const listView = document.getElementById("resources-list-view");
    const detailView = document.getElementById("resources-detail-view");
    const createView = document.getElementById("resources-create-view");
    if (listView) listView.style.display = "flex";
    if (detailView) detailView.style.display = "none";
    if (createView) createView.style.display = "none";
    currentResource = null;
}

function showDetailView(resource) {
    const listView = document.getElementById("resources-list-view");
    const detailView = document.getElementById("resources-detail-view");
    if (listView) listView.style.display = "none";
    if (detailView) detailView.style.display = "flex";
    currentResource = resource;
    renderResourceDetail(resource);
}

function renderResourceDetail(resource) {
    const titleEl = document.getElementById("resources-detail-title");
    const metaEl = document.getElementById("resources-detail-meta");
    const contentEl = document.getElementById("resources-detail-content");
    const coverWrap = document.getElementById("resources-detail-cover");
    const coverImg = document.getElementById("resources-detail-cover-img");
    const downloadBtn = document.getElementById("resources-detail-download");
    const editBtn = document.getElementById("resources-detail-edit");
    const repoBtn = document.getElementById("resources-detail-repo");
    const uploadBtn = document.getElementById("resources-detail-upload");
    const pullBtn = document.getElementById("resources-detail-pull");
    const openBtn = document.getElementById("resources-detail-open");

    if (titleEl) {
        titleEl.textContent = getText(resource, "title", "课程详情");
    }

    if (metaEl) {
        metaEl.innerHTML = "";
        appendMeta(metaEl, "年级", getText(resource, "grade"));
        appendMeta(metaEl, "学科", getText(resource, "subject"));
        appendMeta(metaEl, "作者", getText(resource, "author"));
        appendMeta(metaEl, "版本", getText(resource, "version"));
        appendMeta(metaEl, "更新", getText(resource, "updated_at"));
        const tags = getTags(resource);
        if (tags.length) {
            appendMeta(metaEl, "标签", tags.join(" / "));
        }
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
        const packageUrl = resolveResourceUrl(resource.package_url || "");
        downloadBtn.disabled = !packageUrl;
        downloadBtn.dataset.url = packageUrl;
        downloadBtn.style.display = packageUrl && resource.source !== "local" ? "inline-flex" : "none";
    }

    if (editBtn) {
        const editable = canEditResource(resource);
        editBtn.style.display = editable ? "inline-flex" : "none";
        editBtn.disabled = !editable;
    }

    if (repoBtn) {
        repoBtn.disabled = !repoUrl;
        repoBtn.dataset.url = repoUrl;
    }

    if (uploadBtn) {
        if (resource.source === "local") {
            uploadBtn.style.display = "inline-flex";
            uploadBtn.disabled = !submitUrl;
            uploadBtn.dataset.url = submitUrl;
        } else {
            uploadBtn.style.display = "none";
            uploadBtn.disabled = true;
            uploadBtn.dataset.url = "";
        }
    }

    if (pullBtn) {
        if (resource.source !== "local") {
            pullBtn.style.display = "inline-flex";
            pullBtn.disabled = !resource.package_url;
        } else {
            pullBtn.style.display = "none";
            pullBtn.disabled = true;
        }
    }

    if (openBtn) {
        if (resource.source === "local" && resource.local_path) {
            openBtn.style.display = "inline-flex";
            openBtn.dataset.path = resource.local_path;
        } else {
            openBtn.style.display = "none";
            openBtn.dataset.path = "";
        }
    }

    if (!contentEl) return;
    contentEl.innerHTML = "";

    if (resource.description) {
        const desc = document.createElement("div");
        desc.className = "resources-section-desc";
        desc.textContent = resource.description;
        contentEl.appendChild(desc);
    }

    const sections = normalizeSections(resource);
    if (!sections.length) {
        const empty = document.createElement("div");
        empty.className = "resources-empty";
        empty.textContent = "暂无实验内容";
        contentEl.appendChild(empty);
        return;
    }

    const mutableSections = getMutableSections(resource) || [];

    sections.forEach((section, sectionIndex) => {
        const sectionBlock = document.createElement("div");
        sectionBlock.className = "resources-section-block";

        const sectionHeader = document.createElement("div");
        sectionHeader.className = "resources-section-header";

        const sectionHeadLeft = document.createElement("div");
        sectionHeadLeft.className = "resources-section-head-left";

        let sectionCoverUrl = getCoverUrl(section);
        if (!sectionCoverUrl && Array.isArray(section.experiments)) {
            const expWithCover = section.experiments.find((exp) => getCoverUrl(exp));
            if (expWithCover) {
                sectionCoverUrl = getCoverUrl(expWithCover);
            }
        }
        if (!sectionCoverUrl) {
            sectionCoverUrl = getCoverUrl(resource);
        }
        if (sectionCoverUrl) {
            const cover = document.createElement("div");
            cover.className = "resources-section-cover";
            cover.style.backgroundImage = `url('${sectionCoverUrl}')`;
            sectionHeadLeft.appendChild(cover);
        } else {
            const indexBadge = document.createElement("div");
            indexBadge.className = "resources-section-index";
            indexBadge.textContent = `第 ${sectionIndex + 1} 节`;
            sectionHeadLeft.appendChild(indexBadge);
        }

        const sectionTitleWrap = document.createElement("div");
        sectionTitleWrap.className = "resources-section-title-wrap";

        const sectionTitle = document.createElement("div");
        sectionTitle.className = "resources-section-title";
        sectionTitle.textContent = section.title;
        sectionTitleWrap.appendChild(sectionTitle);

        sectionHeadLeft.appendChild(sectionTitleWrap);
        sectionHeader.appendChild(sectionHeadLeft);

        const sectionBadge = document.createElement("div");
        sectionBadge.className = "resources-section-badge";
        sectionBadge.textContent = `${section.experiments.length} 个实验`;
        sectionHeader.appendChild(sectionBadge);
        sectionBlock.appendChild(sectionHeader);

        if (section.description) {
            const sectionDesc = document.createElement("div");
            sectionDesc.className = "resources-section-summary";
            sectionDesc.textContent = section.description;
            sectionBlock.appendChild(sectionDesc);
        }

        const expGrid = document.createElement("div");
        expGrid.className = "resources-experiment-grid";

        section.experiments.forEach((exp, expIndex) => {
        const expCard = document.createElement("div");
        expCard.className = "resource-card resources-experiment-card";

        const expCoverUrl = getCoverUrl(exp) || EXPERIMENT_PLACEHOLDER_URL;
        const expCover = document.createElement("div");
        expCover.className = "resources-experiment-cover";
        expCover.style.backgroundImage = `url('${expCoverUrl}')`;
        if (expCoverUrl === EXPERIMENT_PLACEHOLDER_URL) {
            expCover.classList.add("is-placeholder");
        }
        expCard.appendChild(expCover);

        const expHeader = document.createElement("div");
        expHeader.className = "resources-experiment-header-row";

        const expTitle = document.createElement("div");
        expTitle.className = "resource-card-title";
        expTitle.textContent = exp.title || `实验 ${expIndex + 1}`;
        expHeader.appendChild(expTitle);

        const fileCount = exp.files && exp.files.length ? exp.files.length : 0;
        const expBadge = document.createElement("div");
        expBadge.className = "resources-experiment-badge";
        expBadge.textContent = fileCount ? `${fileCount} 个文件` : "暂无文件";
        expHeader.appendChild(expBadge);

        expCard.appendChild(expHeader);

            if (exp.description) {
                const expDesc = document.createElement("div");
                expDesc.className = "resource-card-desc";
                expDesc.textContent = exp.description;
                expCard.appendChild(expDesc);
            }

            if (exp.files && exp.files.length) {
                const fileList = document.createElement("div");
                fileList.className = "resources-file-list";
                const sortedFiles = sortFiles(exp.files);
                sortedFiles.forEach((file) => {
                    fileList.appendChild(renderFileItem(file));
                });
                expCard.appendChild(fileList);
            }

        if (canEditResource(resource)) {
            const expActions = document.createElement("div");
            expActions.className = "resource-card-actions resources-experiment-actions";

            const expEditBtn = document.createElement("button");
            expEditBtn.className = "btn btn-secondary";
            expEditBtn.textContent = "编辑";
            expEditBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                editExperiment(resource, mutableSections, sectionIndex, expIndex);
            });

            const expDeleteBtn = document.createElement("button");
            expDeleteBtn.className = "btn btn-danger";
            expDeleteBtn.textContent = "删除";
            expDeleteBtn.addEventListener("click", (event) => {
                event.stopPropagation();
                deleteExperiment(resource, mutableSections, sectionIndex, expIndex);
            });

            expActions.appendChild(expEditBtn);
            expActions.appendChild(expDeleteBtn);
            expCard.appendChild(expActions);
        }

            expGrid.appendChild(expCard);
        });

        // 不再渲染空位卡片，避免实验区出现占位

        sectionBlock.appendChild(expGrid);
        contentEl.appendChild(sectionBlock);
    });
}

function editExperiment(resource, mutableSections, sectionIndex, expIndex) {
    if (!canEditResource(resource)) {
        alert("仅支持编辑本地课程实验");
        return;
    }
    const section = mutableSections?.[sectionIndex];
    const experiments = getMutableExperiments(section);
    if (!experiments || !experiments.list[expIndex]) {
        alert("未找到实验");
        return;
    }
    const exp = experiments.list[expIndex];
    const newTitle = prompt("实验标题", exp.title || "");
    if (newTitle === null) return;
    const newDesc = prompt("实验描述", exp.description || "");
    if (newDesc === null) return;
    exp.title = newTitle.trim() || exp.title || "未命名实验";
    exp.description = newDesc.trim();
    resource.updated_at = new Date().toISOString().slice(0, 10);
    persistLocalCourses();
    renderResourceDetail(resource);
}

function deleteExperiment(resource, mutableSections, sectionIndex, expIndex) {
    if (!canEditResource(resource)) {
        alert("仅支持编辑本地课程实验");
        return;
    }
    const section = mutableSections?.[sectionIndex];
    const experiments = getMutableExperiments(section);
    if (!experiments || !experiments.list[expIndex]) {
        alert("未找到实验");
        return;
    }
    const exp = experiments.list[expIndex];
    const ok = confirm(`确认删除实验「${exp.title || "未命名实验"}」？`);
    if (!ok) return;
    experiments.list.splice(expIndex, 1);
    resource.updated_at = new Date().toISOString().slice(0, 10);
    persistLocalCourses();
    renderResourceDetail(resource);
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
        experiments
    };
}

function normalizeExperiment(exp, index) {
    const title = exp.title || exp.name || `实验 ${index + 1}`;
    const description = exp.description || exp.desc || "";
    const rawFiles = exp.files || exp.items || exp.resources || [];
    const files = Array.isArray(rawFiles) ? rawFiles.map((file) => normalizeFile(file)) : [];

    return {
        title,
        description,
        files
    };
}

function normalizeFile(file) {
    if (typeof file === "string") {
        return { path: file };
    }
    if (file && typeof file === "object") {
        return {
            name: file.name,
            path: file.path || file.url || "",
            type: file.type || file.kind || "",
            children: Array.isArray(file.children) ? file.children.map((child) => normalizeFile(child)) : []
        };
    }
    return { path: "" };
}

function isNotebookFile(file) {
    if (!file) return false;
    if (file.type && file.type.toString().toLowerCase() === "ipynb") return true;
    const filePath = (file.path || "").toString().toLowerCase();
    return filePath.endsWith(".ipynb");
}

function isHtmlFile(file) {
    if (!file) return false;
    if (file.type && file.type.toString().toLowerCase() === "html") return true;
    const filePath = (file.path || "").toString().toLowerCase();
    return filePath.endsWith(".html");
}

function filePriority(file) {
    if (isNotebookFile(file)) return 0;
    if (isHtmlFile(file)) return 1;
    if (isDirectory(file)) return 2;
    return 3;
}

function sortFiles(files) {
    if (!Array.isArray(files)) return [];
    return files.slice().sort((a, b) => {
        const diff = filePriority(a) - filePriority(b);
        if (diff !== 0) return diff;
        const nameA = (a?.name || a?.path || "").toString();
        const nameB = (b?.name || b?.path || "").toString();
        return nameA.localeCompare(nameB, "zh-CN");
    });
}

function renderFileItem(file, depth = 0) {
    const isFolder = isDirectory(file);
    const filePath = file.path || "";
    const isNotebook = isNotebookFile(file);
    const isHtml = isHtmlFile(file);
    const localBasePath = currentResource?.local_path || "";
    const localTargetPath = localBasePath && filePath ? resolveLocalPath(localBasePath, filePath) : "";
    const labelText = file.name || file.path || "未命名文件";
    const targetUrl = filePath
        ? isFolder
            ? resolveRepoBrowserUrl(filePath)
            : isHtml
                ? resolveResourceUrl(filePath)
                : resolveRepoBrowserUrl(filePath)
        : "";

    const chip = document.createElement("div");
    chip.className = "resources-file-chip";
    if (isNotebook) {
        chip.classList.add("is-notebook");
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
    icon.textContent = isFolder ? "📁" : isNotebook ? "📓" : isHtml ? "🧪" : "📄";
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
            : isNotebook
                ? "打开 Notebook"
                : isHtml
                    ? "预览"
                    : "打开";
        action.addEventListener("click", () => {
            if (localTargetPath) {
                openLocalPath(localTargetPath);
                return;
            }
            openExternal(targetUrl);
        });
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
    createSource = source;
    const localGroup = document.getElementById("resources-local-group");
    const cloudGroup = document.getElementById("resources-cloud-group");
    const localBtn = document.getElementById("resources-source-local");
    const cloudBtn = document.getElementById("resources-source-cloud");

    if (localGroup) localGroup.style.display = source === "local" ? "block" : "none";
    if (cloudGroup) cloudGroup.style.display = source === "cloud" ? "block" : "none";

    if (localBtn) {
        localBtn.classList.toggle("btn-primary", source === "local");
        localBtn.classList.toggle("btn-secondary", source !== "local");
    }
    if (cloudBtn) {
        cloudBtn.classList.toggle("btn-primary", source === "cloud");
        cloudBtn.classList.toggle("btn-secondary", source !== "cloud");
    }
}

function setCreateViewMode(mode) {
    const titleEl = document.querySelector("#resources-create-view .resources-detail-title");
    const metaEl = document.querySelector("#resources-create-view .resources-detail-meta");
    const saveBtn = document.getElementById("resources-create-save-btn");
    if (titleEl) {
        titleEl.textContent = mode === "edit" ? "编辑课程" : "创建课程";
    }
    if (metaEl) {
        metaEl.textContent =
            mode === "edit" ? "修改课程信息后保存，可再次上传" : "先填写课程信息，再导入本地课程资源";
    }
    if (saveBtn) {
        saveBtn.textContent = mode === "edit" ? "保存修改" : "保存为本地课程";
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
    draftSections = [];
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
    const coverPreview = document.getElementById("resources-cover-preview");
    const coverPreviewImg = document.getElementById("resources-cover-preview-img");

    if (titleInput) titleInput.value = resource.title || "";
    if (descInput) descInput.value = resource.description || "";
    if (gradeInput) gradeInput.value = resource.grade || "";
    if (subjectInput) subjectInput.value = resource.subject || "";
    if (tagsInput) tagsInput.value = getTags(resource).join(", ");
    if (localPathInput) localPathInput.value = resource.local_path || "";
    if (authorInput) authorInput.value = resource.author || "";
    if (versionInput) versionInput.value = resource.version || "";
    if (idInput) idInput.value = resource.id || "";

    const coverUrl = getCoverUrl(resource);
    if (coverInput) coverInput.value = coverUrl || "";
    if (coverPreview && coverPreviewImg && coverUrl) {
        coverPreviewImg.src = coverUrl;
        coverPreview.style.display = "flex";
    } else if (coverPreview && coverPreviewImg) {
        coverPreviewImg.src = "";
        coverPreview.style.display = "none";
    }
}

function openCreateView(resource = null) {
    const listView = document.getElementById("resources-list-view");
    const detailView = document.getElementById("resources-detail-view");
    const createView = document.getElementById("resources-create-view");
    if (listView) listView.style.display = "none";
    if (detailView) detailView.style.display = "none";
    if (createView) createView.style.display = "flex";
    setCreateSource(createSource);
    createStep = 1;
    scannedCourse = null;
    scanSummary = null;
    scanError = "";
    publishStatus = "idle";
    if (resource) {
        editingCourseId = resource.id || null;
        setCreateViewMode("edit");
        populateCreateForm(resource);
        if (resource.sections) {
            scannedCourse = { ...resource, sections: resource.sections };
            scanSummary = {
                section_count: resource.sections.length,
                experiment_count: resource.sections.reduce((sum, sec) => sum + (sec.experiments?.length || 0), 0),
                file_count: 0
            };
            draftSections = scannedCourse.sections || [];
        }
    } else {
        editingCourseId = null;
        setCreateViewMode("create");
        resetCreateForm();
        draftSections = buildDefaultSections(2, 2);
    }
    renderCoursePreview();
    renderSectionEditor();
    renderMaterialList();
    renderScanStatus();
    renderStructurePreview();
    const publishEl = document.getElementById("resources-publish-status");
    if (publishEl) publishEl.textContent = "准备发布";
    updateCreateFormState();
}

function closeCreateView() {
    const createView = document.getElementById("resources-create-view");
    if (createView) createView.style.display = "none";
    editingCourseId = null;
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
    return createRequiredFields.every((fieldId) => {
        const value = document.getElementById(fieldId)?.value || "";
        return value.trim().length > 0;
    });
}

function updateCreateFormState() {
    const pickLocalBtn = document.getElementById("resources-pick-local-btn");
    const saveBtn = document.getElementById("resources-create-save-btn");
    const scanBtn = document.getElementById("resources-scan-btn");
    const rescanBtn = document.getElementById("resources-rescan-btn");
    const structureSaveBtn = document.getElementById("resources-structure-save-btn");
    const localPath = document.getElementById("resources-create-local-path")?.value.trim() || "";
    const infoComplete = isCreateInfoComplete();

    maybeAutoFillCourseId();

    if (pickLocalBtn) {
        pickLocalBtn.disabled = !infoComplete;
    }

    if (saveBtn) {
        saveBtn.disabled = !(infoComplete && localPath && scannedCourse);
    }

    if (scanBtn) {
        scanBtn.disabled = !(infoComplete && localPath);
    }
    if (rescanBtn) {
        rescanBtn.disabled = !(infoComplete && localPath);
    }
    if (structureSaveBtn) {
        structureSaveBtn.disabled = !(infoComplete && localPath && draftSections.length);
    }

    renderCoursePreview();
    updateStepperUI();
}

function prepareTemplate() {
    // 模板输入已移除
}

function buildDefaultTemplate(title) {
    return {
        title,
        sections: []
    };
}

async function pickLocalCourse() {
    if (window.electronAPI && typeof window.electronAPI.invoke === "function") {
        try {
            const path = await window.electronAPI.invoke("select-folder");
            if (path) {
                const input = document.getElementById("resources-create-local-path");
                if (input) input.value = path;
                updateCreateFormState();
                scanCourse();
            }
        } catch (error) {
            console.error("选择本地课程失败:", error);
        }
    } else {
        alert("请在桌面应用中使用本地上传功能");
    }
}

async function fetchCloudCourse() {
    const url = document.getElementById("resources-create-cloud-url")?.value.trim();
    if (!url) return;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (data) {
            if (data.title) {
                const titleInput = document.getElementById("resources-create-title");
                if (titleInput) titleInput.value = data.title;
            }
            if (data.description) {
                const descInput = document.getElementById("resources-create-desc");
                if (descInput) descInput.value = data.description;
            }
            if (data.cover || data.cover_url) {
                const coverInput = document.getElementById("resources-create-cover");
                if (coverInput) coverInput.value = data.cover || data.cover_url;
            }
            const templateEl = document.getElementById("resources-create-template");
            if (templateEl) templateEl.value = JSON.stringify(data, null, 2);
        }
    } catch (error) {
        console.warn("拉取云端课程失败:", error);
        alert("拉取失败，请检查链接是否可访问");
    }
}

async function quickAddLocalCourse() {
    if (window.electronAPI && typeof window.electronAPI.invoke === "function") {
        try {
            const path = await window.electronAPI.invoke("select-folder");
            if (!path) return;
            const title = deriveTitleFromPath(path);
            try {
                const response = await apiClient.post("/api/resources/scan", {
                    local_path: path,
                    init_if_missing: true,
                    auto_build: true,
                    meta: { title }
                });
                if (response?.success && response.course) {
                    const course = {
                        ...response.course,
                        local_path: path,
                        source: "local",
                        updated_at: new Date().toISOString().slice(0, 10)
                    };
                    addCourse(course);
                    return;
                }
            } catch (scanError) {
                console.warn("快速导入解析失败，使用默认模板:", scanError);
            }

            const fallback = buildQuickCourse({
                title,
                localPath: path
            });
            addCourse(fallback);
        } catch (error) {
            console.error("快速导入本地课程失败:", error);
        }
    } else {
        alert("请在桌面应用中使用本地上传功能");
    }
}

async function quickAddCloudCourse() {
    const url = document.getElementById("resources-quick-cloud-url")?.value.trim();
    if (!url) return;
    let data = null;
    try {
        const response = await fetch(url);
        if (response.ok) {
            data = await response.json();
        }
    } catch (error) {
        console.warn("拉取云端课程失败，使用链接创建:", error);
    }

    const course = buildQuickCourse({
        title: data?.title || deriveTitleFromUrl(url),
        cloudUrl: url,
        templateData: data
    });
    addCourse(course);
}

function parseTags(tagsInput) {
    if (!tagsInput) return [];
    return tagsInput
        .split(/,|，/)
        .map((tag) => tag.trim())
        .filter(Boolean);
}

function normalizeTagsInput(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.filter(Boolean).map((tag) => tag.toString());
    }
    if (typeof value === "string") {
        return parseTags(value);
    }
    return [];
}

function getBaseName(value) {
    if (!value) return "";
    const cleaned = value.toString().replace(/[\\/]+$/, "");
    const parts = cleaned.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || "";
}

function deriveTitleFromPath(path) {
    return getBaseName(path) || "未命名课程";
}

function deriveTitleFromUrl(url) {
    if (!url) return "云端课程";
    try {
        const parsed = new URL(url);
        const name = getBaseName(parsed.pathname);
        if (name) {
            return decodeURIComponent(name.replace(/\.[^/.]+$/, ""));
        }
        return parsed.hostname || "云端课程";
    } catch (error) {
        return getBaseName(url) || "云端课程";
    }
}

function isPackageUrl(url) {
    if (!url) return false;
    return /\.(zip|rar|7z|tar|gz|tgz|bz2)$/i.test(url);
}

function buildQuickCourse({ title, localPath = "", cloudUrl = "", templateData = null }) {
    const finalTitle = title || "未命名课程";
    const payload = templateData && typeof templateData === "object" ? templateData : {};
    const sections =
        payload.sections ||
        payload.lessons ||
        payload.modules ||
        buildDefaultTemplate(finalTitle).sections;

    return {
        id: `local-${Date.now()}`,
        title: payload.title || finalTitle,
        description: payload.description || "",
        grade: payload.grade || "",
        subject: payload.subject || "",
        tags: normalizeTagsInput(payload.tags || payload.tag || []),
        cover: payload.cover || payload.cover_url || payload.image || "",
        author: payload.author || payload.teacher || "",
        version: payload.version || payload.course_version || "",
        package_url:
            payload.package_url || payload.package || (isPackageUrl(cloudUrl) ? cloudUrl : ""),
        local_path: localPath,
        cloud_url: cloudUrl,
        updated_at: new Date().toISOString().slice(0, 10),
        source: cloudUrl ? "cloud" : "local",
        sections
    };
}

function buildCourseFromForm(baseCourse = null) {
    const title = document.getElementById("resources-create-title")?.value.trim() || "未命名课程";
    const description = document.getElementById("resources-create-desc")?.value.trim() || "";
    const grade = document.getElementById("resources-create-grade")?.value.trim() || "";
    const subject = document.getElementById("resources-create-subject")?.value.trim() || "";
    const author = document.getElementById("resources-create-author")?.value.trim() || "";
    const version = document.getElementById("resources-create-version")?.value.trim() || "";
    const courseId = document.getElementById("resources-create-id")?.value.trim() || "";
    const tags = parseTags(document.getElementById("resources-create-tags")?.value || "");
    const cover = document.getElementById("resources-create-cover")?.value.trim() || "";
    const localPath = document.getElementById("resources-create-local-path")?.value.trim() || "";
    const base = baseCourse || {};
    const sections =
        (scannedCourse && scannedCourse.sections) ||
        base.sections ||
        base.lessons ||
        base.modules ||
        buildDefaultTemplate(title).sections;

    return {
        id: courseId || base.id || `local-${Date.now()}`,
        title,
        description,
        grade,
        subject,
        tags,
        cover: cover || base.cover || "",
        author: author || base.author || "",
        version: version || base.version || "",
        package_url: base.package_url || "",
        local_path: localPath || base.local_path || "",
        cloud_url: base.cloud_url || "",
        updated_at: new Date().toISOString().slice(0, 10),
        source: "local",
        sections
    };
}

function addCourse(course, options = {}) {
    localCourses = [course, ...localCourses];
    persistLocalCourses();
    buildFilterOptions();
    applyFilters();
    closeCreateView();
    if (!options.silent) {
        notifyCourseCreated(course);
    }
}

function notifyCourseCreated(course) {
    if (!course || course.source !== "local") return;
    if (submitUrl) {
        const shouldUpload = confirm("课程已创建，是否前往投稿页面上传？");
        if (shouldUpload) {
            openExternal(submitUrl);
        }
        return;
    }
    alert("课程已创建。可在设置中配置投稿链接后上传。");
}

async function saveLocalCourse() {
    if (!isCreateInfoComplete()) {
        alert("请先填写课程名称、课程描述、封面、年级与学科。");
        updateCreateFormState();
        return;
    }
    if (!scannedCourse) {
        alert("请先读取 course.json 课程结构。");
        return;
    }
    if (Array.isArray(scannedCourse.sections) && scannedCourse.sections.length === 0) {
        await scanCourse();
        if (!scannedCourse || !Array.isArray(scannedCourse.sections) || scannedCourse.sections.length === 0) {
            alert("未能从课程文件夹解析结构，请检查目录内是否存在课程文件。");
            return;
        }
    }
    const localPath = document.getElementById("resources-create-local-path")?.value.trim();
    if (!localPath) {
        alert("请先选择本地课程目录。");
        updateCreateFormState();
        return;
    }
    const baseCourse =
        editingCourseId && localCourses.length
            ? localCourses.find((item) => item.id === editingCourseId)
            : null;
    const course = buildCourseFromForm(baseCourse);
    if (editingCourseId) {
        updateCourse(course);
    } else {
        addCourse(course);
    }
}

function updateCourse(course) {
    const index = localCourses.findIndex((item) => item.id === course.id);
    if (index >= 0) {
        localCourses[index] = course;
    } else {
        localCourses = [course, ...localCourses];
    }
    persistLocalCourses();
    buildFilterOptions();
    applyFilters();
    editingCourseId = null;
    showDetailView(course);
    notifyCourseUpdated(course);
}

function notifyCourseUpdated(course) {
    if (!course || course.source !== "local") return;
    if (submitUrl) {
        const shouldUpload = confirm("课程已更新，是否前往投稿页面再次上传？");
        if (shouldUpload) {
            openExternal(submitUrl);
        }
        return;
    }
    alert("课程已更新。可在设置中配置投稿链接后上传。");
}

function isDirectory(file) {
    if (!file) return false;
    if (file.type === "dir" || file.type === "folder") return true;
    if (file.path && file.path.endsWith("/")) return true;
    return false;
}

function resolveRepoBrowserUrl(path) {
    const cleanPath = path.replace(/^\/+/, "");
    if (!repoUrl) return resolveResourceUrl(cleanPath);
    const branch = indexBranch || "main";
    return `${repoUrl}/src/${branch}/${cleanPath}`;
}

function resolveLocalPath(basePath, targetPath) {
    if (!basePath) return "";
    const normalizedBase = basePath.toString();
    const normalizedTarget = (targetPath || "").toString();
    if (!normalizedTarget) return normalizedBase;
    if (/^[a-zA-Z]:[\\/]/.test(normalizedTarget) || normalizedTarget.startsWith("/")) {
        return normalizedTarget;
    }
    const separator = normalizedBase.includes("\\") ? "\\" : "/";
    const cleanBase = normalizedBase.replace(/[\\/]+$/, "");
    const cleanTarget = normalizedTarget.replace(/^[\\/]+/, "");
    return `${cleanBase}${separator}${cleanTarget}`;
}

async function openLocalPath(targetPath) {
    if (!targetPath) return;
    try {
        if (window.electronAPI && typeof window.electronAPI.invoke === "function") {
            await window.electronAPI.invoke("open-path", targetPath);
            return;
        }
    } catch (error) {
        console.error("打开本地路径失败:", error);
    }
}

function updateSourceInfo() {
    const hint = document.getElementById("resources-source-hint");
    const repoBtn = document.getElementById("resources-repo-btn");
    const submitBtn = document.getElementById("resources-submit-btn");
    const createSubmitBtn = document.getElementById("resources-create-submit-btn");

    if (hint) {
        if (isMockData) {
            hint.textContent = "当前为示例数据（未连接资源库）";
        } else if (repoUrl) {
            hint.textContent = `资源库: ${repoUrl}`;
        } else {
            hint.textContent = "未配置资源库";
        }
    }

    if (repoBtn) {
        repoBtn.disabled = isMockData || !repoUrl;
    }

    if (submitBtn) {
        submitBtn.disabled = isMockData || !submitUrl;
    }

    if (createSubmitBtn) {
        createSubmitBtn.disabled = isMockData || !submitUrl;
    }
}

function renderEmptyState(message) {
    const container = document.getElementById("resources-list");
    const empty = document.getElementById("resources-empty");
    const count = document.getElementById("resources-count");

    if (!container || !empty) return;

    container.innerHTML = "";
    empty.style.display = "flex";
    empty.textContent = message;
    if (count) {
        count.textContent = "0 门课程";
    }
}

function applyResourcesIndex(indexData, options = {}) {
    resourcesMeta = indexData || {};
    let remoteList = [];
    if (Array.isArray(resourcesMeta)) {
        remoteList = resourcesMeta;
    } else if (Array.isArray(resourcesMeta.resources)) {
        remoteList = resourcesMeta.resources;
    } else if (Array.isArray(resourcesMeta.items)) {
        remoteList = resourcesMeta.items;
    }

    submitUrl = options.submitUrl || "";
    repoUrl = options.repoUrl || "";
    rawBaseUrl = options.rawBaseUrl || "";
    indexBranch = options.branch || indexBranch || "main";
    isMockData = Boolean(options.isMock);

    const normalizedRemote = remoteList.map((item) => ({ ...item, source: "remote" }));
    const normalizedLocal = localCourses.map((item) => ({ ...item, source: "local" }));
    const localIds = new Set(normalizedLocal.map((item) => item.id));
    const merged = [...normalizedLocal, ...normalizedRemote.filter((item) => !localIds.has(item.id))];
    resourcesCache = merged;

    buildFilterOptions();
    updateSourceInfo();
    applyFilters();
}

async function openExternal(url) {
    if (!url) return;
    try {
        if (window.electronAPI && typeof window.electronAPI.openExternal === "function") {
            await window.electronAPI.openExternal(url);
            return;
        }
        if (window.electronAPI && typeof window.electronAPI.invoke === "function") {
            await window.electronAPI.invoke("open-external", url);
            return;
        }
    } catch (error) {
        console.error("打开外部链接失败:", error);
    }

    window.open(url, "_blank");
}

async function loadResourcesIndex() {
    const loading = document.getElementById("resources-loading");
    if (loading) loading.style.display = "flex";

    localCourses = loadLocalCourses();

    try {
        const response = await apiClient.get("/api/resources/index");
        if (response.success) {
            applyResourcesIndex(response.index || {}, {
                submitUrl: response.submit_url || "",
                repoUrl: response.repo_url || "",
                rawBaseUrl: response.raw_base_url || "",
                branch: response.branch || "main",
                isMock: false
            });
        } else {
            applyResourcesIndex(mockResourcesIndex, { isMock: true });
        }
    } catch (error) {
        console.error("加载资源索引失败:", error);
        let message = "资源库加载失败";
        if (error?.details) {
            try {
                const parsed = JSON.parse(error.details);
                if (parsed && parsed.message) {
                    message = parsed.message;
                }
            } catch (parseError) {
                message = `资源库加载失败: ${error.details}`;
            }
        } else if (error?.message) {
            message = `资源库加载失败: ${error.message}`;
        }
        applyResourcesIndex(mockResourcesIndex, { isMock: true });
    } finally {
        if (loading) loading.style.display = "none";
    }
}

function handleSearchInput(event) {
    if (searchTimer) {
        clearTimeout(searchTimer);
    }
    const value = event.target.value.trim();
    searchTimer = setTimeout(() => {
        filterState.query = value;
        applyFilters();
    }, 200);
}

function handleListClick(event) {
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
                if (!Number.isNaN(index) && displayedResources[index]) {
                    showDetailView(displayedResources[index]);
                }
            }
        }
        return;
    }

    const card = event.target.closest(".resource-card");
    if (!card) return;

    const index = Number(card.dataset.resourceIndex);
    if (Number.isNaN(index) || !displayedResources[index]) {
        return;
    }

    showDetailView(displayedResources[index]);
}

function bindEvents() {
    const searchInput = document.getElementById("resources-search-input");
    const gradeSelect = document.getElementById("resources-filter-grade");
    const subjectSelect = document.getElementById("resources-filter-subject");
    const tagSelect = document.getElementById("resources-filter-tag");
    const refreshBtn = document.getElementById("resources-refresh-btn");
    const submitBtn = document.getElementById("resources-submit-btn");
    const createSubmitBtn = document.getElementById("resources-create-submit-btn");
    const repoBtn = document.getElementById("resources-repo-btn");
    const prevBtn = document.getElementById("resources-prev-btn");
    const nextBtn = document.getElementById("resources-next-btn");
    const list = document.getElementById("resources-list");
    const backBtn = document.getElementById("resources-back-btn");
    const detailDownloadBtn = document.getElementById("resources-detail-download");
    const detailEditBtn = document.getElementById("resources-detail-edit");
    const detailRepoBtn = document.getElementById("resources-detail-repo");
    const detailUploadBtn = document.getElementById("resources-detail-upload");
    const detailOpenBtn = document.getElementById("resources-detail-open");
    const addBtn = document.getElementById("resources-add-btn");
    const createBackBtn = document.getElementById("resources-create-back-btn");
    const quickLocalBtn = document.getElementById("resources-quick-local-btn");
    const quickCloudBtn = document.getElementById("resources-quick-cloud-btn");
    const advancedToggleBtn = document.getElementById("resources-advanced-toggle");
    const createGenerateBtn = document.getElementById("resources-create-generate-btn");
    const createCopyBtn = document.getElementById("resources-create-copy-btn");
    const createSaveBtn = document.getElementById("resources-create-save-btn");
    const sourceLocalBtn = document.getElementById("resources-source-local");
    const sourceCloudBtn = document.getElementById("resources-source-cloud");
    const pickLocalBtn = document.getElementById("resources-pick-local-btn");
    const fetchCloudBtn = document.getElementById("resources-fetch-cloud-btn");
    const sectionCountInput = document.getElementById("resources-section-count");
    const generateSectionsBtn = document.getElementById("resources-generate-sections");
    const addSectionBtn = document.getElementById("resources-add-section");
    const structureSaveBtn = document.getElementById("resources-structure-save-btn");
    const createTitleInput = document.getElementById("resources-create-title");
    const createDescInput = document.getElementById("resources-create-desc");
    const createGradeInput = document.getElementById("resources-create-grade");
    const createSubjectInput = document.getElementById("resources-create-subject");
    const createCoverInput = document.getElementById("resources-create-cover");
    const createLocalPathInput = document.getElementById("resources-create-local-path");
    const createAuthorInput = document.getElementById("resources-create-author");
    const createVersionInput = document.getElementById("resources-create-version");
    const createIdInput = document.getElementById("resources-create-id");
    const coverFileInput = document.getElementById("resources-cover-file");
    const coverDrop = document.getElementById("resources-cover-drop");
    const coverPreview = document.getElementById("resources-cover-preview");
    const coverPreviewImg = document.getElementById("resources-cover-preview-img");
    const coverClearBtn = document.getElementById("resources-cover-clear");
    const stepPrevBtn = document.getElementById("resources-step-prev");
    const stepNextBtn = document.getElementById("resources-step-next");
    const scanBtn = document.getElementById("resources-scan-btn");
    const rescanBtn = document.getElementById("resources-rescan-btn");
    const publishBtn = document.getElementById("resources-publish-btn");
    const pullBtn = document.getElementById("resources-detail-pull");

    if (searchInput) {
        searchInput.addEventListener("input", handleSearchInput);
    }

    if (gradeSelect) {
        gradeSelect.addEventListener("change", (event) => {
            filterState.grade = event.target.value;
            applyFilters();
        });
    }

    if (subjectSelect) {
        subjectSelect.addEventListener("change", (event) => {
            filterState.subject = event.target.value;
            applyFilters();
        });
    }

    if (tagSelect) {
        tagSelect.addEventListener("change", (event) => {
            filterState.tag = event.target.value;
            applyFilters();
        });
    }

    if (refreshBtn) {
        refreshBtn.addEventListener("click", loadResourcesIndex);
    }

    if (submitBtn) {
        submitBtn.addEventListener("click", () => openExternal(submitUrl));
    }

    if (createSubmitBtn) {
        createSubmitBtn.addEventListener("click", () => openExternal(submitUrl));
    }

    if (repoBtn) {
        repoBtn.addEventListener("click", () => openExternal(repoUrl));
    }

    if (prevBtn) {
        prevBtn.addEventListener("click", () => {
            if (pageState.current > 1) {
                pageState.current -= 1;
                renderResources(filteredResources);
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener("click", () => {
            const totalPages = Math.max(1, Math.ceil(filteredResources.length / pageState.size));
            if (pageState.current < totalPages) {
                pageState.current += 1;
                renderResources(filteredResources);
            }
        });
    }

    if (list) {
        list.addEventListener("click", handleListClick);
    }

    if (backBtn) {
        backBtn.addEventListener("click", showListView);
    }

    if (detailDownloadBtn) {
        detailDownloadBtn.addEventListener("click", (event) => {
            const targetUrl = event.currentTarget.dataset.url;
            if (targetUrl) {
                openExternal(targetUrl);
            }
        });
    }

    if (detailEditBtn) {
        detailEditBtn.addEventListener("click", () => {
            if (currentResource) {
                openCreateView(currentResource);
            }
        });
    }

    if (detailRepoBtn) {
        detailRepoBtn.addEventListener("click", (event) => {
            const targetUrl = event.currentTarget.dataset.url;
            if (targetUrl) {
                openExternal(targetUrl);
            }
        });
    }

    if (detailOpenBtn) {
        detailOpenBtn.addEventListener("click", async (event) => {
            const path = event.currentTarget.dataset.path;
            if (path) {
                document.getElementById('project-path').value = path;
                if (window.app && window.app.jupyter && typeof window.app.jupyter.confirmProjectPath === 'function') {
                    await window.app.jupyter.confirmProjectPath();
                }
                const navItem = document.querySelector('.nav-item[onclick*="main"]');
                if (navItem && window.app && window.app.ui && typeof window.app.ui.showTab === 'function') {
                    window.app.ui.showTab('main', navItem);
                }
                if (window.app && window.app.jupyter && typeof window.app.jupyter.startJupyter === 'function') {
                    window.app.jupyter.startJupyter();
                }
            }
        });
    }

    if (detailUploadBtn) {
        detailUploadBtn.addEventListener("click", (event) => {
            const targetUrl = event.currentTarget.dataset.url;
            if (targetUrl) {
                openExternal(targetUrl);
            } else {
                alert("请先在设置中配置课程资源库投稿链接");
            }
        });
    }

    if (addBtn) {
        addBtn.addEventListener("click", openCreateView);
    }

    if (createBackBtn) {
        createBackBtn.addEventListener("click", closeCreateView);
    }

    if (quickLocalBtn) {
        quickLocalBtn.addEventListener("click", quickAddLocalCourse);
    }

    if (quickCloudBtn) {
        quickCloudBtn.addEventListener("click", quickAddCloudCourse);
    }

    if (advancedToggleBtn) {
        advancedToggleBtn.addEventListener("click", toggleAdvancedPanel);
    }

    [createTitleInput, createDescInput, createGradeInput, createSubjectInput, createCoverInput, createAuthorInput, createVersionInput].forEach((input) => {
        if (input) {
            input.addEventListener("input", updateCreateFormState);
        }
    });

    if (createLocalPathInput) {
        createLocalPathInput.addEventListener("input", updateCreateFormState);
    }

    if (sectionCountInput) {
        sectionCountInput.addEventListener("input", updateCreateFormState);
    }

    if (generateSectionsBtn) {
        generateSectionsBtn.addEventListener("click", () => {
            const count = Number(sectionCountInput?.value || 1) || 1;
            draftSections = buildDefaultSections(count, 2);
            renderSectionEditor();
            renderMaterialList();
            updateCreateFormState();
        });
    }

    if (addSectionBtn) {
        addSectionBtn.addEventListener("click", () => {
            const nextIndex = draftSections.length + 1;
            draftSections.push({
                title: `第 ${nextIndex} 节`,
                description: "",
                experiments: [
                    {
                        title: "实验一",
                        description: "",
                        files: []
                    }
                ]
            });
            renderSectionEditor();
            renderMaterialList();
            updateCreateFormState();
        });
    }

    if (structureSaveBtn) {
        structureSaveBtn.addEventListener("click", saveCourseStructure);
    }

    if (coverFileInput) {
        coverFileInput.addEventListener("change", async (event) => {
            const file = event.target.files?.[0];
            await applyCoverFile(file);
        });
    }

    if (coverDrop) {
        ["dragenter", "dragover"].forEach((evt) => {
            coverDrop.addEventListener(evt, (event) => {
                event.preventDefault();
                coverDrop.classList.add("dragover");
            });
        });
        ["dragleave", "dragend"].forEach((evt) => {
            coverDrop.addEventListener(evt, () => {
                coverDrop.classList.remove("dragover");
            });
        });
        coverDrop.addEventListener("drop", async (event) => {
            event.preventDefault();
            coverDrop.classList.remove("dragover");
            const file = event.dataTransfer?.files?.[0];
            await applyCoverFile(file);
        });
    }

    if (coverClearBtn) {
        coverClearBtn.addEventListener("click", () => {
            if (coverFileInput) {
                coverFileInput.value = "";
            }
            if (coverPreview && coverPreviewImg) {
                coverPreviewImg.src = "";
                coverPreview.style.display = "none";
            }
            if (createCoverInput) {
                createCoverInput.value = "";
            }
            updateCreateFormState();
        });
    }

    if (createGenerateBtn) {
        createGenerateBtn.addEventListener("click", () => {
            const title = document.getElementById("resources-create-title")?.value.trim() || "课程名称";
            const templateEl = document.getElementById("resources-create-template");
            if (templateEl) {
                templateEl.value = JSON.stringify(buildDefaultTemplate(title), null, 2);
            }
        });
    }

    if (createCopyBtn) {
        createCopyBtn.addEventListener("click", async () => {
            const templateEl = document.getElementById("resources-create-template");
            if (!templateEl) return;
            try {
                await navigator.clipboard.writeText(templateEl.value);
            } catch (error) {
                console.warn("复制模板失败:", error);
            }
        });
    }

    if (createSaveBtn) {
        createSaveBtn.addEventListener("click", saveLocalCourse);
    }

    if (scanBtn) {
        scanBtn.addEventListener("click", scanCourse);
    }

    if (rescanBtn) {
        rescanBtn.addEventListener("click", scanCourse);
    }

    if (publishBtn) {
        publishBtn.addEventListener("click", publishCourse);
    }

    if (stepPrevBtn) {
        stepPrevBtn.addEventListener("click", () => setCreateStep(createStep - 1));
    }

    if (stepNextBtn) {
        stepNextBtn.addEventListener("click", () => {
            if (createStep < 3) {
                setCreateStep(createStep + 1);
            } else {
                showListView();
            }
        });
    }

    if (pullBtn) {
        pullBtn.addEventListener("click", async () => {
            if (!currentResource) return;
            const courseUrl = currentResource.course_url || "";
            const packageUrl = currentResource.package_url || "";
            const defaultTarget = "";
            let targetPath = defaultTarget;
            if (window.electronAPI && typeof window.electronAPI.invoke === "function") {
                try {
                    const base = await window.electronAPI.invoke("select-folder");
                    if (base) {
                        const cleanBase = base.replace(/[\\/]+$/, "");
                        targetPath = `${cleanBase}/${currentResource.id || "course"}`;
                    }
                } catch (error) {
                    console.warn("选择导入目录失败:", error);
                }
            }
            try {
                const response = await apiClient.post("/api/resources/pull", {
                    course_url: courseUrl,
                    package_url: packageUrl,
                    target_path: targetPath
                });
                if (!response.success) {
                    throw new Error(response.message || "导入失败");
                }
                const localCourse = {
                    ...response.course,
                    local_path: response.local_path,
                    source: "local",
                    updated_at: new Date().toISOString().slice(0, 10)
                };
                addCourse(localCourse, { silent: true });
            } catch (error) {
                alert(error.message || "导入失败");
            }
        });
    }

    if (sourceLocalBtn) {
        sourceLocalBtn.addEventListener("click", () => setCreateSource("local"));
    }

    if (sourceCloudBtn) {
        sourceCloudBtn.addEventListener("click", () => setCreateSource("cloud"));
    }

    if (pickLocalBtn) {
        pickLocalBtn.addEventListener("click", pickLocalCourse);
    }

    if (fetchCloudBtn) {
        fetchCloudBtn.addEventListener("click", fetchCloudCourse);
    }
}

export async function initResourcesPage() {
    if (!initialized) {
        bindEvents();
        initialized = true;
    }

    localCourses = loadLocalCourses();
    await loadResourcesIndex();
    showListView();
}

export async function refreshResources() {
    await loadResourcesIndex();
}

export function openSubmitPage() {
    openExternal(submitUrl);
}
