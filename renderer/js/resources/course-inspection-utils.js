const TESTABLE_KIND_ORDER = ["html", "blockly", "notebook", "python"];

function getPath(file) {
    return (file?.path || file?.url || file?.name || "").toString().trim();
}

function getLowerPath(file) {
    return getPath(file).toLowerCase();
}

export function getCourseFileKind(file) {
    const type = (file?.type || file?.kind || "").toString().trim().toLowerCase();
    const lower = getLowerPath(file);
    if (type === "html" || type === "htm" || lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
    if (type === "blockly" || lower.endsWith(".blockly.xml") || lower.endsWith(".blockly.json")) return "blockly";
    if (type === "ipynb" || type === "notebook" || lower.endsWith(".ipynb")) return "notebook";
    if (type === "py" || type === "python" || lower.endsWith(".py")) return "python";
    return type || "file";
}

export function isDirectoryEntry(file) {
    const type = (file?.type || file?.kind || "").toString().trim().toLowerCase();
    return type === "dir" || type === "directory" || type === "folder" || getPath(file).endsWith("/");
}

export function flattenCourseFiles(files, bucket = []) {
    if (!Array.isArray(files)) return bucket;
    files.forEach((file) => {
        if (!file) return;
        if (typeof file === "string") {
            bucket.push({ path: file });
            return;
        }
        if (typeof file !== "object") return;
        bucket.push(file);
        if (Array.isArray(file.children)) {
            flattenCourseFiles(file.children, bucket);
        }
    });
    return bucket;
}

export function pickAutoTestEntryFromFiles(files = []) {
    const flat = flattenCourseFiles(files, []).filter((file) => !isDirectoryEntry(file) && getPath(file));
    for (const kind of TESTABLE_KIND_ORDER) {
        const found = flat.find((file) => getCourseFileKind(file) === kind);
        if (found) {
            return { file: found, kind };
        }
    }
    return null;
}

export function pickAutoTestEntry(experiment = {}) {
    return pickAutoTestEntryFromFiles(experiment.files || experiment.items || experiment.resources || []);
}

export function getInspectionExperiment(inspection, sectionIndex, experimentIndex) {
    const sections = Array.isArray(inspection?.sections) ? inspection.sections : [];
    const section = sections.find((item) => Number(item?.section_index) === Number(sectionIndex));
    const experiments = Array.isArray(section?.experiments) ? section.experiments : [];
    return experiments.find((item) => Number(item?.experiment_index) === Number(experimentIndex)) || null;
}

export function summarizeInspection(inspection, fallbackSummary = {}) {
    const sections = Array.isArray(inspection?.sections) ? inspection.sections : [];
    const counts = {
        ready_count: 0,
        partial_count: 0,
        broken_count: 0,
    };
    sections.forEach((section) => {
        (section?.experiments || []).forEach((experiment) => {
            const status = experiment?.status || "";
            if (status === "ready") counts.ready_count += 1;
            if (status === "partial") counts.partial_count += 1;
            if (status === "broken") counts.broken_count += 1;
        });
    });
    return {
        ...fallbackSummary,
        ...counts,
    };
}

export function mapRemoteExperimentToLocalCourse(localCourse, sectionIndex, experimentIndex) {
    const sections = Array.isArray(localCourse?.sections) ? localCourse.sections : [];
    const section = sections[sectionIndex] || null;
    const experiments = Array.isArray(section?.experiments) ? section.experiments : [];
    return experiments[experimentIndex] ? { sectionIndex, experimentIndex } : { sectionIndex: 0, experimentIndex: 0 };
}
