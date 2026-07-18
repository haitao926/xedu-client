const CODE_FILE_EXTENSIONS = new Set([
    "js", "ts", "jsx", "tsx", "json", "yaml", "yml", "toml", "ini", "cfg",
    "md", "txt", "csv", "xml", "sh", "bat", "cmd", "ps1", "java", "cpp", "c",
    "h", "hpp", "go", "rs", "php", "rb", "swift", "kt",
]);

function getFileExtension(filePath = "") {
    if (!filePath) return "";
    const last = filePath.split("/").pop() || filePath;
    const idx = last.lastIndexOf(".");
    if (idx <= 0 || idx === last.length - 1) return "";
    return last.slice(idx + 1).toLowerCase();
}

export function getFileDisplayKind(file) {
    if (!file || typeof file !== "object") return "file";
    const type = (file.type || "").toString().toLowerCase();
    if (file.directory || type === "directory" || type === "dir" || type === "folder") return "folder";
    if (type === "notebook" || type === "ipynb") return "notebook";
    if (type === "python" || type === "py") return "python";
    if (type === "html") return "html";
    if (type === "blockly") return "blockly";
    if (type === "code") return "code";
    const path = (file.path || file.name || "").toString().toLowerCase();
    if (path.endsWith(".ipynb")) return "notebook";
    if (path.endsWith(".py")) return "python";
    if (path.endsWith(".html") || path.endsWith(".htm")) return "html";
    if (path.endsWith(".blockly.xml") || path.endsWith(".blockly.json")) return "blockly";
    if (CODE_FILE_EXTENSIONS.has(getFileExtension(path))) return "code";
    return "file";
}

export function getFileDisplayIcon(kind) {
    if (kind === "notebook") return "📓";
    if (kind === "python") return "🐍";
    if (kind === "html") return "🌐";
    if (kind === "blockly") return "⚠️";
    if (kind === "folder") return "📁";
    if (kind === "code") return "🧩";
    return "📄";
}

export function getFileDisplayLabel(kind) {
    if (kind === "blockly") return "旧图形资源（不支持）";
    if (kind === "notebook") return "Notebook";
    if (kind === "html") return "HTML";
    if (kind === "python") return "Python";
    if (kind === "folder") return "目录";
    if (kind === "code") return "代码";
    return "文件";
}

export function buildExperimentPathHint({ primaryBlocklyFile, primaryPythonFile }) {
    const pathHint = document.createElement("div");
    pathHint.className = "resource-card-desc resources-experiment-pathway";
    const pythonLabel = primaryPythonFile?.name || primaryPythonFile?.path || "代码实践文件";
    if (primaryBlocklyFile && primaryPythonFile) {
        pathHint.textContent = `该实验类型已不再支持；可进入 ${pythonLabel} 做代码实践。`;
    } else if (primaryBlocklyFile) {
        pathHint.textContent = "该实验类型已不再支持，请使用 Scratch 版本资源。";
    } else if (primaryPythonFile) {
        pathHint.textContent = `学习路径：先看讲解，再进入 ${pythonLabel} 做代码实践。`;
    } else {
        pathHint.textContent = "学习路径：先看讲解，再进入实验文件完成实践。";
    }
    return pathHint;
}

export function buildExperimentFilesCard({
    overview,
    onOpenFile,
}) {
    const filesCard = document.createElement("div");
    filesCard.className = "resource-card";
    const filesHeader = document.createElement("div");
    filesHeader.className = "resource-card-header";
    const filesTitle = document.createElement("div");
    filesTitle.className = "resource-card-title";
    filesTitle.textContent = "实验文件";
    filesHeader.appendChild(filesTitle);
    const filesBadge = document.createElement("div");
    filesBadge.className = "resource-card-badge";
    filesBadge.textContent = `${overview.allFiles.length} 项`;
    filesHeader.appendChild(filesBadge);
    filesCard.appendChild(filesHeader);

    const table = document.createElement("div");
    table.className = "resources-file-table";
    const selectedRows = new Set();
    const rows = overview.allFiles.length ? overview.allFiles : [];
    if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "resources-create-hint";
        empty.textContent = "该实验尚未配置文件。";
        filesCard.appendChild(empty);
    } else {
        rows.forEach((file, fileIndex) => {
            const kind = getFileDisplayKind(file);
            const row = document.createElement("div");
            row.className = "resources-file-row";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "resources-file-checkbox";
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    selectedRows.add(fileIndex);
                } else {
                    selectedRows.delete(fileIndex);
                }
            });
            row.appendChild(checkbox);

            const icon = document.createElement("span");
            icon.className = "resources-file-kind-icon";
            icon.textContent = getFileDisplayIcon(kind);
            row.appendChild(icon);

            const name = document.createElement("span");
            name.className = "resources-file-name";
            name.textContent = file.name || file.path || "未命名";
            row.appendChild(name);

            const type = document.createElement("span");
            type.className = "resources-file-type";
            type.textContent = getFileDisplayLabel(kind);
            row.appendChild(type);

            const openBtn = document.createElement("button");
            openBtn.className = "btn btn-secondary btn-sm";
            openBtn.textContent = "打开";
            openBtn.addEventListener("click", async () => {
                await onOpenFile(file);
            });
            row.appendChild(openBtn);
            table.appendChild(row);
        });

        const tableActions = document.createElement("div");
        tableActions.className = "resource-card-actions";
        const openSelectedBtn = document.createElement("button");
        openSelectedBtn.className = "btn btn-secondary";
        openSelectedBtn.textContent = "打开选中文件";
        openSelectedBtn.addEventListener("click", async () => {
            const indexes = Array.from(selectedRows.values());
            if (!indexes.length) return;
            for (const idx of indexes.slice(0, 5)) {
                const file = rows[idx];
                await onOpenFile(file);
            }
        });
        tableActions.appendChild(openSelectedBtn);
        filesCard.appendChild(tableActions);
    }
    filesCard.appendChild(table);
    return filesCard;
}

export function buildCourseDirectoryCard({
    sections,
    activeSectionIndex,
    activeExperimentIndex,
    getExperimentFileOverview,
    sortFiles,
    renderFileItem,
    onJumpToExperiment,
}) {
    const courseDirectoryCard = document.createElement("div");
    courseDirectoryCard.className = "resource-card";
    const courseDirHeader = document.createElement("div");
    courseDirHeader.className = "resource-card-header";
    const courseDirTitle = document.createElement("div");
    courseDirTitle.className = "resource-card-title";
    courseDirTitle.textContent = "整门课程目录";
    courseDirHeader.appendChild(courseDirTitle);
    const totalExperimentCount = sections.reduce((sum, section) => {
        const list = Array.isArray(section?.experiments) ? section.experiments : [];
        return sum + list.length;
    }, 0);
    const courseDirBadge = document.createElement("div");
    courseDirBadge.className = "resource-card-badge";
    courseDirBadge.textContent = `${sections.length} 课 / ${totalExperimentCount} 个实验`;
    courseDirHeader.appendChild(courseDirBadge);
    courseDirectoryCard.appendChild(courseDirHeader);

    const courseDirectoryList = document.createElement("div");
    courseDirectoryList.className = "resources-course-directory-list";

    sections.forEach((section, sectionIndex) => {
        const sectionBlock = document.createElement("div");
        sectionBlock.className = "resources-course-directory-section";

        const sectionTitle = document.createElement("div");
        sectionTitle.className = "resources-course-directory-section-title";
        sectionTitle.textContent = section.title || `第 ${sectionIndex + 1} 课`;
        sectionBlock.appendChild(sectionTitle);

        const sectionExperiments = Array.isArray(section?.experiments) ? section.experiments : [];
        if (!sectionExperiments.length) {
            const emptyExp = document.createElement("div");
            emptyExp.className = "resources-create-hint";
            emptyExp.textContent = "该课节暂无实验。";
            sectionBlock.appendChild(emptyExp);
            courseDirectoryList.appendChild(sectionBlock);
            return;
        }

        sectionExperiments.forEach((exp, expIndex) => {
            const details = document.createElement("details");
            details.className = "resources-course-directory-exp";
            const isActive = sectionIndex === activeSectionIndex && expIndex === activeExperimentIndex;
            details.open = isActive;

            const summary = document.createElement("summary");
            summary.className = "resources-course-directory-exp-summary";
            const expName = exp.title || `实验 ${expIndex + 1}`;
            const overview = getExperimentFileOverview(exp);
            summary.textContent = `${expName}（${overview.allFiles.length} 个文件）`;
            details.appendChild(summary);

            const body = document.createElement("div");
            body.className = "resources-course-directory-exp-body";

            const actions = document.createElement("div");
            actions.className = "resource-card-actions";
            const jumpBtn = document.createElement("button");
            jumpBtn.className = "btn btn-secondary btn-sm";
            jumpBtn.textContent = isActive ? "当前实验" : "切换到此实验";
            jumpBtn.disabled = isActive;
            jumpBtn.addEventListener("click", () => {
                onJumpToExperiment(sectionIndex, expIndex);
            });
            actions.appendChild(jumpBtn);
            body.appendChild(actions);

            const rawExpFiles = Array.isArray(exp?.files) ? exp.files : [];
            const expFiles = typeof sortFiles === "function" ? sortFiles(rawExpFiles) : rawExpFiles;
            if (!expFiles.length) {
                const emptyFiles = document.createElement("div");
                emptyFiles.className = "resources-create-hint";
                emptyFiles.textContent = "该实验暂无目录文件。";
                body.appendChild(emptyFiles);
            } else {
                const tree = document.createElement("div");
                tree.className = "resources-course-directory-tree";
                expFiles.forEach((file) => {
                    tree.appendChild(renderFileItem(file, 0));
                });
                body.appendChild(tree);
            }

            details.appendChild(body);
            sectionBlock.appendChild(details);
        });

        courseDirectoryList.appendChild(sectionBlock);
    });

    courseDirectoryCard.appendChild(courseDirectoryList);
    return courseDirectoryCard;
}
