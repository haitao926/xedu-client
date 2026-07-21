export function computeAutoCourseId({ currentValue = "", scannedCourseId = "", title = "", generateCourseId }) {
    if ((currentValue || "").trim()) return "";
    if ((scannedCourseId || "").trim()) return scannedCourseId.trim();
    const normalizedTitle = (title || "").trim();
    if (!normalizedTitle) return "";
    return generateCourseId(normalizedTitle);
}

export function buildDefaultTemplate(title) {
    return {
        title,
        sections: [],
    };
}

export function buildQuickCoursePayload({
    title,
    localPath = "",
    cloudUrl = "",
    templateData = null,
    normalizeTagsInput,
    isPackageUrl,
}) {
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
        sections,
    };
}

export function buildCourseFromFormPayload({
    formValues,
    baseCourse = null,
    scannedCourse = null,
    normalizeOrigin,
}) {
    const base = baseCourse || {};
    const sections =
        (scannedCourse && scannedCourse.sections) ||
        base.sections ||
        base.lessons ||
        base.modules ||
        buildDefaultTemplate(formValues.title).sections;
    const origin = normalizeOrigin(
        (scannedCourse && scannedCourse.origin) ||
        base.origin ||
        {}
    );

    return {
        id: formValues.courseId || base.id || `local-${Date.now()}`,
        title: formValues.title,
        description: formValues.description,
        grade: formValues.grade,
        subject: formValues.subject,
        tags: formValues.tags,
        cover: formValues.cover || base.cover || "",
        author: formValues.author || base.author || "",
        version: formValues.version || base.version || "",
        package_url: base.package_url || "",
        local_path: formValues.localPath || base.local_path || "",
        cloud_url: base.cloud_url || "",
        updated_at: new Date().toISOString().slice(0, 10),
        source: "local",
        sections,
        origin: origin || base.origin || undefined,
        sync: base.sync || undefined,
    };
}
