export function normalizeText(value) {
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

export function generateCourseId(title) {
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

export function escapeAttr(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

export function parseTags(tagsInput) {
    if (!tagsInput) return [];
    return tagsInput
        .split(/,|，/)
        .map((tag) => tag.trim())
        .filter(Boolean);
}

export function normalizeTagsInput(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.filter(Boolean).map((tag) => tag.toString());
    }
    if (typeof value === "string") {
        return parseTags(value);
    }
    return [];
}

export function getBaseName(value) {
    if (!value) return "";
    const cleaned = value.toString().replace(/[\\/]+$/, "");
    const parts = cleaned.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || "";
}

export function deriveTitleFromPath(path) {
    return getBaseName(path) || "未命名课程";
}

export function deriveTitleFromUrl(url) {
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

export function isPackageUrl(url) {
    if (!url) return false;
    return /\.(zip|rar|7z|tar|gz|tgz|bz2)$/i.test(url);
}
