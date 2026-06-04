function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatWorkspaceMeta(items = []) {
    const validItems = (items || []).filter(Boolean);
    return validItems.map((item) => `<span>${escapeHtml(item)}</span>`).join('');
}

function getSourcePageMeta(sourcePage = '') {
    if (sourcePage === 'resources') {
        return { label: '课程资源', tabId: 'resources', navId: 'nav-resources-item' };
    }
    if (sourcePage === 'main' || sourcePage === 'classroom') {
        return { label: '总控制台', tabId: 'main', navId: 'nav-main-item' };
    }
    return null;
}

function getBaseName(filePath = '') {
    const normalized = String(filePath || '').replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    return parts.pop() || '';
}

function normalizeWorkspaceSourceLabel(payload = {}, fallback = '') {
    return String(payload?.sourceLabel || payload?.originLabel || fallback || '').trim();
}

function fetchWithTimeout(url, options = {}, timeoutMs = 2000) {
    if (!timeoutMs || options.signal) {
        return fetch(url, options);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, {
        ...options,
        signal: controller.signal,
    }).finally(() => clearTimeout(timer));
}

function formatRecentOpenMeta(payload = {}, options = {}) {
    const items = [];
    const sourceLabel = normalizeWorkspaceSourceLabel(payload);
    if (sourceLabel) items.push(`导入自：${sourceLabel}`);
    if (options.kind === 'jupyter') {
        if (payload?.filePath) items.push(`文件：${getBaseName(payload.filePath)}`);
        if (payload?.projectDir) items.push(`目录：${payload.projectDir}`);
    } else if (options.kind === 'blockly') {
        if (payload?.workspacePath) items.push(`工作区：${getBaseName(payload.workspacePath)}`);
        if (payload?.practicePath) items.push(`代码练习：${getBaseName(payload.practicePath)}`);
        if (payload?.localPath) items.push(`目录：${payload.localPath}`);
    }
    return items;
}

export function createWorkspaceController({ showTab, openNotebookFile }) {
    let lastOpenedJupyterTarget = '';
    let lastOpenedJupyterWorkspace = null;
    let lastOpenedBlocklyWorkspace = null;
    let blocklyViewRevision = 0;
    let blocklyFrameRequestId = 0;
    let blocklyRetryTimer = null;

    function ensureBlocklyWorkspaceMounted() {
        if (!lastOpenedBlocklyWorkspace) {
            blocklyViewRevision += 1;
            lastOpenedBlocklyWorkspace = {
                localPath: '',
                workspacePath: '',
                practicePath: '',
                sourceLabel: '',
                sourcePage: '',
                revision: blocklyViewRevision,
            };
        }
        renderBlocklyWorkspaceContext({ preserveLoadedFrame: true });
    }

    function isTeacherModeActive() {
        const label = document.body.classList.contains('student-mode');
        return !label;
    }

    async function openResourcesOrClassroomSource(sourcePage = '') {
        const sourceMeta = getSourcePageMeta(sourcePage);
        if (sourceMeta) {
            const navItem = document.getElementById(sourceMeta.navId);
            if (navItem?.style.display !== 'none') {
                showTab(sourceMeta.tabId, navItem);
                return true;
            }
        }
        const resourcesNavItem = document.getElementById('nav-resources-item');
        const mainNavItem = document.getElementById('nav-main-item');
        if (isTeacherModeActive() && resourcesNavItem?.style.display !== 'none') {
            showTab('resources', resourcesNavItem);
            return true;
        }
        if (mainNavItem) {
            showTab('main', mainNavItem);
            return true;
        }
        return false;
    }

    function buildBlocklyWorkspaceUrl(payload = {}) {
        const projectPath = String(payload?.localPath || '').trim();
        const workspacePath = String(payload?.workspacePath || '').trim().replace(/^\/+/, '');
        const apiBase = (window.xeduConfig?.apiBase || 'http://127.0.0.1:5123').replace(/\/$/, '');
        const revision = Number(payload?.revision || 0);
        const role = isTeacherModeActive() ? 'teacher' : 'student';
        if (!projectPath || !workspacePath) {
            const blankParams = new URLSearchParams();
            if (revision > 0) blankParams.set('_rev', String(revision));
            blankParams.set('role', role);
            return blankParams.toString()
                ? `${apiBase}/api/resources/blockly-playground-blank?${blankParams.toString()}`
                : `${apiBase}/api/resources/blockly-playground-blank`;
        }
        const params = new URLSearchParams();
        params.set('workspace', workspacePath);
        params.set('role', role);
        if (revision > 0) params.set('_rev', String(revision));
        const practicePath = String(payload?.practicePath || '').trim().replace(/^\/+/, '');
        if (practicePath) params.set('practice', practicePath);
        const rootToken = btoa(unescape(encodeURIComponent(projectPath))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
        return `${apiBase}/api/resources/blockly-playground/${rootToken}?${params.toString()}`;
    }

    function getApiBaseUrl() {
        return (window.xeduConfig?.apiBase || 'http://127.0.0.1:5123').replace(/\/$/, '');
    }

    function clearBlocklyRetryTimer() {
        if (blocklyRetryTimer) {
            clearTimeout(blocklyRetryTimer);
            blocklyRetryTimer = null;
        }
    }

    function scheduleBlocklyRetry() {
        clearBlocklyRetryTimer();
        blocklyRetryTimer = setTimeout(() => {
            blocklyRetryTimer = null;
            const active = Boolean(document.getElementById('blockly-workspace')?.classList.contains('active'));
            if (active) {
                renderBlocklyWorkspaceContext();
            }
        }, 2000);
    }

    function renderBlocklyPlaceholder(emptyEl, state = {}) {
        const tone = state.tone || 'idle';
        const title = state.title || '打开空白 Blockly 工作台';
        const desc = state.desc || '可随时载入 `.blockly.xml` 或 `.blockly.json` 工作区。';
        const buttonText = state.buttonText || '立即打开 Blockly';
        const buttonDisabled = state.buttonDisabled ? ' disabled' : '';
        const artSrc = tone === 'error' ? 'assets/icon-blockly-xedu.svg' : 'assets/blockly-stage-illustration.svg';
        const artClass = tone === 'error' ? 'placeholder-art placeholder-art-error' : 'placeholder-art placeholder-art-blockly';
        const artAlt = tone === 'error' ? 'Blockly 连接提示图标' : 'Blockly 与 XEdu Hub 工作台插画';
        emptyEl.innerHTML = `
            <img class="${artClass}" src="${artSrc}" alt="${escapeHtml(artAlt)}">
            <div class="placeholder-title">${escapeHtml(title)}</div>
            <div class="placeholder-desc">${escapeHtml(desc)}</div>
            <button class="btn btn-primary mt-3" type="button" data-blockly-placeholder-action${buttonDisabled}>${escapeHtml(buttonText)}</button>
        `;
        emptyEl.querySelector('[data-blockly-placeholder-action]')?.addEventListener('click', () => {
            if (state.buttonDisabled) return;
            if (tone === 'error') {
                renderBlocklyWorkspaceContext();
            } else {
                openBlocklyWorkspace({});
            }
        });
    }

    async function waitForBlocklyBackend(frame, emptyEl, frameUrl, requestId) {
        try {
            const response = await fetchWithTimeout(`${getApiBaseUrl()}/api/health`, {
                method: 'GET',
                cache: 'no-store',
            }, 2000);
            if (requestId !== blocklyFrameRequestId) return;
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            clearBlocklyRetryTimer();
            const keepVisibleUntilLoad = frame.dataset.loadedBlocklyUrl && frame.dataset.loadedBlocklyUrl !== frameUrl;
            if (frame.dataset.loadedBlocklyUrl !== frameUrl) {
                frame.dataset.loadedBlocklyUrl = frameUrl;
                frame.setAttribute('src', frameUrl);
            }
            if (!keepVisibleUntilLoad) {
                frame.style.display = 'block';
                emptyEl.style.display = 'none';
            }
        } catch (error) {
            if (requestId !== blocklyFrameRequestId) return;
            frame.removeAttribute('src');
            frame.dataset.loadedBlocklyUrl = '';
            frame.style.display = 'none';
            renderBlocklyPlaceholder(emptyEl, {
                tone: 'error',
                title: 'Blockly 后端未连接',
                desc: '请先启动 XEdu API 服务；后端恢复后这里会自动重试。',
                buttonText: '立即重试',
            });
            emptyEl.style.display = 'flex';
            scheduleBlocklyRetry();
        }
    }

    async function openJupyterWorkspace(payload = {}, options = {}) {
        const normalizedPayload = {
            projectDir: String(payload?.projectDir || '').trim(),
            filePath: String(payload?.filePath || '').trim(),
            sourceLabel: normalizeWorkspaceSourceLabel(payload),
            sourcePage: String(payload?.sourcePage || '').trim(),
        };
        const mainNavItem = document.getElementById('nav-main-item');
        if (mainNavItem) {
            showTab('main', mainNavItem);
        }
        if (normalizedPayload.projectDir || normalizedPayload.filePath) {
            lastOpenedJupyterWorkspace = normalizedPayload;
        }
        renderWorkspacePages();
        if (!normalizedPayload.filePath) {
            return true;
        }
        const targetKey = `${normalizedPayload.projectDir}::${normalizedPayload.filePath}`;
        if (!options?.force && targetKey && targetKey === lastOpenedJupyterTarget) {
            return true;
        }
        await openNotebookFile(normalizedPayload.filePath, normalizedPayload.projectDir);
        lastOpenedJupyterTarget = targetKey;
        return true;
    }

    function openBlocklyWorkspace(payload = {}) {
        const nextPayload = {
            localPath: String(payload?.localPath || '').trim(),
            workspacePath: String(payload?.workspacePath || '').trim(),
            practicePath: String(payload?.practicePath || '').trim(),
            sourceLabel: normalizeWorkspaceSourceLabel(payload),
            sourcePage: String(payload?.sourcePage || '').trim(),
        };
        const currentKey = JSON.stringify({
            localPath: lastOpenedBlocklyWorkspace?.localPath || '',
            workspacePath: lastOpenedBlocklyWorkspace?.workspacePath || '',
            practicePath: lastOpenedBlocklyWorkspace?.practicePath || '',
            sourceLabel: lastOpenedBlocklyWorkspace?.sourceLabel || '',
            sourcePage: lastOpenedBlocklyWorkspace?.sourcePage || '',
        });
        const nextKey = JSON.stringify(nextPayload);
        if (!lastOpenedBlocklyWorkspace || currentKey !== nextKey) {
            blocklyViewRevision += 1;
        }
        const normalizedPayload = {
            ...nextPayload,
            revision: blocklyViewRevision,
        };
        // 先写入目标状态再切换页面，避免 Blockly tab 首帧显示空容器。
        lastOpenedBlocklyWorkspace = normalizedPayload;
        const blocklyNavItem = document.getElementById('nav-blockly-item');
        if (blocklyNavItem) {
            showTab('blockly-workspace', blocklyNavItem);
        }
        renderBlocklyWorkspaceContext({ preserveLoadedFrame: true });
        renderJupyterWorkspaceContext();
        return true;
    }

    function renderJupyterWorkspaceContext() {
        const titleEl = document.getElementById('jupyter-context-title');
        const descEl = document.getElementById('jupyter-context-desc');
        const metaEl = document.getElementById('jupyter-context-meta');
        const openBtn = document.getElementById('jupyter-open-context-btn');
        const goSourceBtn = document.getElementById('jupyter-go-resource-btn');
        if (!titleEl || !descEl || !metaEl || !openBtn || !goSourceBtn) return;
        const payload = lastOpenedJupyterWorkspace;
        const sourceMeta = getSourcePageMeta(payload?.sourcePage || '');
        if (payload?.filePath) {
            titleEl.textContent = getBaseName(payload.filePath) || '最近打开的实验文件';
            descEl.textContent = '这里已经准备好最近一次使用的代码文件，你可以直接继续实验。';
            metaEl.innerHTML = formatWorkspaceMeta(formatRecentOpenMeta(payload, { kind: 'jupyter' }));
            openBtn.textContent = '重新打开最近文件';
            goSourceBtn.textContent = sourceMeta ? '查看内容入口' : '导入实验内容';
            goSourceBtn.disabled = !sourceMeta;
        } else {
            titleEl.textContent = '即开 Jupyter Lab';
            descEl.textContent = '打开后就能开始 Notebook / Python 实验；实验内容可以稍后按需导入。';
            metaEl.innerHTML = formatWorkspaceMeta(['直接启动并实验', '支持：Notebook / Python']);
            openBtn.textContent = '立即开始实验';
            goSourceBtn.textContent = '导入实验内容';
            goSourceBtn.disabled = false;
        }
        openBtn.disabled = false;
    }

    function renderBlocklyWorkspaceContext(options = {}) {
        const frame = document.getElementById('blockly-workspace-frame');
        const emptyEl = document.getElementById('blockly-workspace-empty');
        if (!frame || !emptyEl) return;
        const payload = lastOpenedBlocklyWorkspace;
        const workspaceName = payload?.workspacePath
            ? (getBaseName(payload.workspacePath) || 'Blockly 工作台')
            : '';
        const blocklySectionActive = Boolean(document.getElementById('blockly-workspace')?.classList.contains('active'));
        if (blocklySectionActive) {
            const subtitleEl = document.getElementById('page-subtitle');
            if (subtitleEl) subtitleEl.textContent = workspaceName;
        }
        const frameUrl = buildBlocklyWorkspaceUrl(payload);
        if (frameUrl) {
            const nextRequestId = blocklyFrameRequestId + 1;
            blocklyFrameRequestId = nextRequestId;
            const alreadyLoaded = frame.dataset.loadedBlocklyUrl === frameUrl;
            if (alreadyLoaded) {
                clearBlocklyRetryTimer();
                frame.style.display = 'block';
                frame.classList.remove('is-loading');
                emptyEl.style.display = 'none';
                return;
            }
            const preserveLoadedFrame = Boolean(options.preserveLoadedFrame && frame.dataset.loadedBlocklyUrl);
            renderBlocklyPlaceholder(emptyEl, {
                title: '正在连接 Blockly 工作台',
                desc: '正在检查本地 XEdu API 服务并加载积木环境。',
                buttonText: '连接中...',
                buttonDisabled: true,
            });
            emptyEl.style.display = preserveLoadedFrame ? 'none' : 'flex';
            if (!preserveLoadedFrame) {
                frame.style.display = 'none';
            }
            frame.classList.add('is-loading');
            frame.addEventListener('load', () => {
                if (blocklyFrameRequestId !== nextRequestId || frame.dataset.loadedBlocklyUrl !== frameUrl) {
                    return;
                }
                frame.classList.remove('is-loading');
                frame.style.display = 'block';
                emptyEl.style.display = 'none';
            }, { once: true });
            waitForBlocklyBackend(frame, emptyEl, frameUrl, nextRequestId);
        } else {
            blocklyFrameRequestId += 1;
            clearBlocklyRetryTimer();
            frame.removeAttribute('src');
            frame.dataset.loadedBlocklyUrl = '';
            frame.style.display = 'none';
            renderBlocklyPlaceholder(emptyEl);
            emptyEl.style.display = 'flex';
        }
    }

    function renderWorkspacePages() {
        renderJupyterWorkspaceContext();
        renderBlocklyWorkspaceContext();
    }

    function getLastOpenedJupyterWorkspace() {
        return lastOpenedJupyterWorkspace;
    }

    return {
        ensureBlocklyWorkspaceMounted,
        openResourcesOrClassroomSource,
        openJupyterWorkspace,
        openBlocklyWorkspace,
        renderWorkspacePages,
        getLastOpenedJupyterWorkspace,
        isTeacherModeActive,
    };
}
