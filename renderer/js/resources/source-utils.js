export function normalizeResourceSourceInput(source = {}, fallbackName = "", fallbackId = "") {
    const name = (source.name || fallbackName || "").trim();
    const base_url = (source.base_url || "").trim().replace(/\/+$/, "");
    const repo = (source.repo || "").trim().replace(/^\/+|\/+$/g, "");
    const branch = (source.branch || "main").trim() || "main";
    const index_path = (source.index_path || "index.json").trim().replace(/^\/+/, "") || "index.json";
    const enabled = source.enabled !== false && source.enabled !== "false";
    const id = (source.id || fallbackId || "").toString().trim();
    return {
        id,
        name,
        base_url,
        repo,
        branch,
        index_path,
        enabled,
    };
}

export function sourceSignature(source = {}) {
    const normalized = normalizeResourceSourceInput(source);
    return [
        normalized.base_url.toLowerCase(),
        normalized.repo.toLowerCase(),
        normalized.branch,
        normalized.index_path,
    ].join("|");
}

export function dedupeResourceSources(sources = []) {
    const deduped = [];
    const seen = new Set();
    sources.forEach((item, index) => {
        const normalized = normalizeResourceSourceInput(item, item.name || `课程源${index + 1}`, item.id || `source-${index + 1}`);
        if (!normalized.base_url || !normalized.repo) return;
        const signature = sourceSignature(normalized);
        if (seen.has(signature)) return;
        seen.add(signature);
        deduped.push({
            ...normalized,
            id: normalized.id || `source-${deduped.length + 1}`,
        });
    });
    return deduped;
}

export function parseRepoUrlParts(repoUrl = "") {
    const raw = (repoUrl || "").toString().trim();
    if (!raw) {
        return { base_url: "", repo: "" };
    }
    try {
        const parsed = new URL(raw);
        return {
            base_url: `${parsed.protocol}//${parsed.host}`,
            repo: parsed.pathname.replace(/^\/+/, "").replace(/\/+$/, ""),
        };
    } catch (_) {
        return { base_url: "", repo: "" };
    }
}
