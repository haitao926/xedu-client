import { escapeHtml } from '../utils/html.js';
import apiClient from '../api.js';

function formatWorkspaceMeta(items = []) {
    const validItems = (items || []).filter(Boolean);
    return validItems.map((item) => `<span>${escapeHtml(item)}</span>`).join('');
}

function getSourcePageMeta(sourcePage = '') {
    if (sourcePage === 'resources') {
        return { label: '课程资源', tabId: 'resources', navId: 'nav-resources-item' };
    }
    if (sourcePage === 'student-route') {
        return { label: '课程任务中心', tabId: 'resources', navId: 'nav-student-lesson-item', studentTabId: 'route' };
    }
    if (sourcePage === 'student-experience') {
        return { label: '互动体验', tabId: 'resources', navId: 'nav-student-experience-item', studentTabId: 'experience' };
    }
    if (sourcePage === 'student-visual') {
        return { label: '图形编程', tabId: 'resources', navId: 'nav-student-visual-item', studentTabId: 'visual' };
    }
    if (sourcePage === 'student-python') {
        return { label: 'Python实验', tabId: 'resources', navId: 'nav-student-python-item', studentTabId: 'python' };
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

function formatRecentOpenMeta(payload = {}, options = {}) {
    const items = [];
    const sourceLabel = normalizeWorkspaceSourceLabel(payload);
    if (sourceLabel) items.push(`导入自：${sourceLabel}`);
    if (options.kind === 'jupyter') {
        if (payload?.filePath) items.push(`文件：${getBaseName(payload.filePath)}`);
        if (payload?.projectDir) items.push(`目录：${payload.projectDir}`);
    } else if (options.kind === 'scratch') {
        if (payload?.projectPath) items.push(`项目：${getBaseName(payload.projectPath)}`);
        if (payload?.localPath) items.push(`目录：${payload.localPath}`);
    }
    return items;
}

export function createWorkspaceController({ showTab, openNotebookFile }) {
    const SCRATCH_RETRY_DELAY_MS = 2000;
    const SCRATCH_LOAD_TIMEOUT_MS = 12000;
    let lastOpenedJupyterTarget = '';
    let lastOpenedJupyterWorkspace = null;
    let lastOpenedScratchWorkspace = null;
    let scratchViewRevision = 0;
    let scratchFrameRequestId = 0;
    let scratchRetryTimer = null;
    let scratchLoadTimer = null;
    let scratchBridgeBound = false;
    let scratchHandleIssuedAt = 0;

    function getScratchHostMenuElements() {
        return {
            topBarActions: document.getElementById('top-bar-actions'),
            menu: document.getElementById('scratch-host-file-menu'),
            items: Array.from(document.querySelectorAll('[data-scratch-host-action]')),
        };
    }

    function getScratchBridge() {
        const frame = document.getElementById('scratch-workspace-frame');
        const bridge = frame?.contentWindow?.__xeduScratchBridge__;
        if (!bridge || typeof bridge !== 'object') {
            return null;
        }
        return bridge;
    }

    function updateScratchHostMenuState(visible) {
        const { topBarActions, menu, items } = getScratchHostMenuElements();
        if (topBarActions) {
            topBarActions.classList.toggle('has-scratch-controls', Boolean(visible));
        }
        if (!menu) {
            return;
        }
        menu.hidden = !visible;
        if (!visible) {
            menu.open = false;
        }
        const bridge = visible ? getScratchBridge() : null;
        const bridgeState = bridge?.getState?.() || {};
        items.forEach((item) => {
            const action = item.getAttribute('data-scratch-host-action');
            if (!visible || !bridge) {
                item.disabled = true;
                return;
            }
            if (action === 'save') {
                item.disabled = bridgeState.canSave === false;
                return;
            }
            item.disabled = false;
        });
    }

    async function runScratchHostAction(action) {
        const { menu } = getScratchHostMenuElements();
        if (menu) {
            menu.open = false;
        }
        const bridge = getScratchBridge();
        if (!bridge) {
            window.app?.ui?.showToast?.('Scratch 正在加载，请稍后再试。', 'warning');
            updateScratchHostMenuState(true);
            return false;
        }
        const actionMap = {
            new: 'newProject',
            save: 'saveProject',
            upload: 'uploadProject',
            download: 'downloadProject',
        };
        const handlerName = actionMap[action];
        if (!handlerName || typeof bridge[handlerName] !== 'function') {
            window.app?.ui?.showToast?.('当前 Scratch 页面暂不支持这个操作。', 'warning');
            updateScratchHostMenuState(true);
            return false;
        }
        try {
            await bridge[handlerName]();
            updateScratchHostMenuState(true);
            return true;
        } catch (error) {
            console.error('执行 Scratch 文件操作失败:', error);
            window.app?.ui?.showToast?.(error?.message || 'Scratch 文件操作失败', 'error');
            updateScratchHostMenuState(true);
            return false;
        }
    }

    function bindScratchHostMenu() {
        const { menu, items } = getScratchHostMenuElements();
        if (!menu || menu.dataset.boundScratchHostMenu === 'true') {
            return;
        }
        menu.dataset.boundScratchHostMenu = 'true';
        items.forEach((item) => {
            item.addEventListener('click', () => {
                runScratchHostAction(item.getAttribute('data-scratch-host-action'));
            });
        });
        document.addEventListener('click', (event) => {
            if (!menu.open) {
                return;
            }
            if (menu.contains(event.target)) {
                return;
            }
            menu.open = false;
        });
    }

    function isTeacherModeActive() {
        const label = document.body.classList.contains('student-mode');
        return !label;
    }

    async function openResourcesOrClassroomSource(sourcePage = '') {
        const sourceMeta = getSourcePageMeta(sourcePage);
        if (sourceMeta?.studentTabId && window.app?.resources?.openStudentLessonTab) {
            const navItem = document.getElementById(sourceMeta.navId);
            await window.app.resources.openStudentLessonTab(sourceMeta.studentTabId, navItem);
            return true;
        }
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

    function buildScratchWorkspaceUrl(payload = {}) {
        const apiBase = getApiBaseUrl();
        const params = new URLSearchParams();
        const revision = Number(payload?.revision || 0);
        const projectPath = String(payload?.projectPath || '').trim().replace(/^\/+/, '');
        const projectHandle = String(payload?.projectHandle || '').trim();
        params.set('apiBase', apiBase);
        if (revision > 0) params.set('_rev', String(revision));
        if (projectHandle) params.set('rootToken', projectHandle);
        if (projectPath) params.set('project', projectPath);
        return `${apiBase}/api/scratch-editor/index.html${params.toString() ? `?${params.toString()}` : ''}`;
    }

    async function ensureScratchProjectHandle(payload = {}) {
        const handleFresh = payload?.projectHandle && Date.now() - scratchHandleIssuedAt < 45 * 60 * 1000;
        if (handleFresh) return payload.projectHandle;
        const localPath = String(payload?.localPath || '').trim();
        const projectPath = String(payload?.projectPath || '').trim().replace(/^\/+/, '');
        if (!localPath || !projectPath) return '';
        const response = await apiClient.request('/api/resources/scratch-workspace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ local_path: localPath, project_path: projectPath }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.success || !body.project_handle) {
            throw new Error(body.message || '无法打开 Scratch 项目');
        }
        scratchHandleIssuedAt = Date.now();
        return body.project_handle;
    }

    function getApiBaseUrl() {
        return (window.xeduConfig?.apiBase || 'http://127.0.0.1:5123').replace(/\/$/, '');
    }

    function bindScratchFrameBridge(frame) {
        if (scratchBridgeBound) return;
        scratchBridgeBound = true;
        window.addEventListener('message', async (event) => {
            const request = event.data;
            if (request?.type !== 'xedu:scratch-api-request' || event.source !== frame.contentWindow) return;
            let backendOrigin = '';
            try {
                backendOrigin = new URL(getApiBaseUrl()).origin;
            } catch (_) {
                return;
            }
            if (event.origin !== backendOrigin || typeof window.electronAPI?.scratchApiRequest !== 'function') return;
            try {
                const response = await window.electronAPI.scratchApiRequest({
                    path: request.path,
                    method: request.method,
                    body: request.body,
                });
                frame.contentWindow.postMessage({
                    type: 'xedu:scratch-api-response',
                    requestId: request.requestId,
                    status: response.status,
                    headers: response.headers || {},
                    body: response.body || '',
                }, event.origin);
            } catch (error) {
                frame.contentWindow.postMessage({
                    type: 'xedu:scratch-api-response',
                    requestId: request.requestId,
                    error: error?.message || 'Scratch AI 请求失败',
                }, event.origin);
            }
        });
    }

    function clearScratchRetryTimer() {
        if (scratchRetryTimer) {
            clearTimeout(scratchRetryTimer);
            scratchRetryTimer = null;
        }
    }

    function clearScratchLoadTimer() {
        if (scratchLoadTimer) {
            clearTimeout(scratchLoadTimer);
            scratchLoadTimer = null;
        }
    }

    function scheduleScratchRetry() {
        clearScratchRetryTimer();
        scratchRetryTimer = setTimeout(() => {
            scratchRetryTimer = null;
            const active = Boolean(document.getElementById('scratch-workspace')?.classList.contains('active'));
            if (active) {
                renderScratchWorkspaceContext();
            }
        }, SCRATCH_RETRY_DELAY_MS);
    }

    function scheduleScratchLoadTimeout(frame, emptyEl, requestId) {
        clearScratchLoadTimer();
        scratchLoadTimer = setTimeout(() => {
            scratchLoadTimer = null;
            if (requestId !== scratchFrameRequestId) return;
            frame.removeAttribute('src');
            frame.dataset.loadedScratchUrl = '';
            frame.classList.remove('is-loading');
            frame.style.display = 'none';
            renderScratchPlaceholder(emptyEl, {
                tone: 'error',
                title: 'Scratch 加载超时',
                desc: 'Scratch 编辑器连接超时；系统会自动重试，也可以立即重试。',
                buttonText: '立即重试',
            });
            emptyEl.style.display = 'flex';
            scheduleScratchRetry();
            updateScratchHostMenuState(false);
        }, SCRATCH_LOAD_TIMEOUT_MS);
    }

    function renderScratchPlaceholder(emptyEl, state = {}) {
        const tone = state.tone || 'idle';
        const title = state.title || 'XEdu Client 内置 Scratch';
        const desc = state.desc || '在客户端内直接使用官方 Scratch 编辑器，并通过 XEdu AI 扩展积木调用本地 AI 能力。';
        const buttonText = state.buttonText || '打开内置 Scratch';
        const buttonDisabled = state.buttonDisabled ? ' disabled' : '';
        emptyEl.innerHTML = `
            <img class="placeholder-art placeholder-art-scratch" src="assets/icon-scratch-xedu.svg" alt="Scratch 与 XEdu AI">
            <div class="placeholder-title">${escapeHtml(title)}</div>
            <div class="placeholder-desc">${escapeHtml(desc)}</div>
            <button class="btn btn-primary mt-3" type="button" data-scratch-placeholder-action${buttonDisabled}>${escapeHtml(buttonText)}</button>
        `;
        emptyEl.querySelector('[data-scratch-placeholder-action]')?.addEventListener('click', () => {
            if (state.buttonDisabled) return;
            if (tone === 'error') {
                renderScratchWorkspaceContext();
            } else {
                openScratchWorkspace({});
            }
        });
    }

    async function waitForScratchBackend(frame, emptyEl, frameUrl, requestId) {
        try {
            const response = await apiClient.request('/api/health', {
                method: 'GET',
                cache: 'no-store',
                timeoutMs: 2000,
            });
            if (requestId !== scratchFrameRequestId) return;
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            clearScratchRetryTimer();
            if (frame.dataset.loadedScratchUrl !== frameUrl) {
                frame.dataset.loadedScratchUrl = frameUrl;
                frame.setAttribute('src', frameUrl);
            }
            scheduleScratchLoadTimeout(frame, emptyEl, requestId);
            frame.style.display = 'block';
            emptyEl.style.display = 'none';
        } catch (error) {
            if (requestId !== scratchFrameRequestId) return;
            clearScratchLoadTimer();
            frame.removeAttribute('src');
            frame.dataset.loadedScratchUrl = '';
            frame.classList.remove('is-loading');
            frame.style.display = 'none';
            renderScratchPlaceholder(emptyEl, {
                tone: 'error',
                title: 'Scratch 后端未连接',
                desc: '请先启动 XEdu API 服务；后端恢复后这里会自动重试。',
                buttonText: '立即重试',
            });
            emptyEl.style.display = 'flex';
            scheduleScratchRetry();
        }
    }

    async function openJupyterWorkspace(payload = {}, options = {}) {
        const normalizedPayload = {
            projectDir: String(payload?.projectDir || '').trim(),
            filePath: String(payload?.filePath || '').trim(),
            sourceLabel: normalizeWorkspaceSourceLabel(payload),
            sourcePage: String(payload?.sourcePage || '').trim(),
        };
        const isStudentPython = normalizedPayload.sourcePage === 'student-python';
        const mainNavItem = isStudentPython
            ? document.getElementById('nav-student-python-item')
            : document.getElementById('nav-main-item');
        if (mainNavItem || isStudentPython) {
            showTab('main', mainNavItem, {
                allowStudentMain: isStudentPython,
                pageTitle: isStudentPython ? 'Python实验' : undefined,
                pageSubtitle: isStudentPython ? normalizedPayload.sourceLabel : undefined,
            });
        }
        if (
            normalizedPayload.projectDir ||
            normalizedPayload.filePath ||
            normalizedPayload.sourceLabel ||
            normalizedPayload.sourcePage
        ) {
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

    function openScratchWorkspace(payload = {}) {
        const nextPayload = {
            localPath: String(payload?.localPath || '').trim(),
            projectPath: String(payload?.projectPath || '').trim(),
            sourceLabel: normalizeWorkspaceSourceLabel(payload),
            sourcePage: String(payload?.sourcePage || '').trim(),
        };
        const currentKey = JSON.stringify({
            localPath: lastOpenedScratchWorkspace?.localPath || '',
            projectPath: lastOpenedScratchWorkspace?.projectPath || '',
            sourceLabel: lastOpenedScratchWorkspace?.sourceLabel || '',
            sourcePage: lastOpenedScratchWorkspace?.sourcePage || '',
        });
        const nextKey = JSON.stringify(nextPayload);
        if (!lastOpenedScratchWorkspace || currentKey !== nextKey) {
            scratchViewRevision += 1;
        }
        const normalizedPayload = {
            ...nextPayload,
            revision: scratchViewRevision,
        };
        lastOpenedScratchWorkspace = normalizedPayload;
        const isStudentVisual = nextPayload.sourcePage === 'student-visual' || document.getElementById('nav-scratch-item')?.style.display === 'none';
        const scratchNavItem = isStudentVisual
            ? document.getElementById('nav-student-visual-item')
            : document.getElementById('nav-scratch-item');
        if (scratchNavItem || isStudentVisual) {
            showTab('scratch-workspace', scratchNavItem, {
                pageTitle: isStudentVisual ? '图形编程' : 'Scratch 编程',
                pageSubtitle: normalizedPayload.sourceLabel || (isStudentVisual ? 'Scratch 图形编程' : undefined),
            });
        }
        renderScratchWorkspaceContext({ preserveLoadedFrame: true });
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

    async function renderScratchWorkspaceContext(options = {}) {
        bindScratchHostMenu();
        const frame = document.getElementById('scratch-workspace-frame');
        const emptyEl = document.getElementById('scratch-workspace-empty');
        if (!frame || !emptyEl) return;
        clearScratchRetryTimer();
        clearScratchLoadTimer();
        const payload = lastOpenedScratchWorkspace;
        bindScratchFrameBridge(frame);
        const projectName = payload?.projectPath
            ? (getBaseName(payload.projectPath) || 'Scratch 项目')
            : '';
        const scratchSectionActive = Boolean(document.getElementById('scratch-workspace')?.classList.contains('active'));
        updateScratchHostMenuState(scratchSectionActive);
        if (scratchSectionActive) {
            const titleEl = document.getElementById('page-title');
            const subtitleEl = document.getElementById('page-subtitle');
            const activeNavItem = payload?.sourcePage === 'student-visual'
                ? document.getElementById('nav-student-visual-item')
                : document.getElementById('nav-scratch-item');
            if (activeNavItem) {
                document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
                activeNavItem.classList.add('active');
            }
            if (titleEl) titleEl.textContent = payload?.sourcePage === 'student-visual' ? '图形编程' : 'Scratch 编程';
            if (subtitleEl) {
                subtitleEl.textContent = payload?.sourceLabel || projectName || 'XEdu Client 内置官方 Scratch 编辑器与 XEdu AI 扩展';
            }
        }
        if (!scratchSectionActive && !lastOpenedScratchWorkspace) {
            clearScratchRetryTimer();
            clearScratchLoadTimer();
            frame.removeAttribute('src');
            frame.dataset.loadedScratchUrl = '';
            frame.classList.remove('is-loading');
            frame.style.display = 'none';
            renderScratchPlaceholder(emptyEl);
            emptyEl.style.display = 'flex';
            return;
        }
        const nextRequestId = scratchFrameRequestId + 1;
        scratchFrameRequestId = nextRequestId;
        let projectHandle = '';
        try {
            projectHandle = await ensureScratchProjectHandle(payload);
        } catch (error) {
            if (nextRequestId !== scratchFrameRequestId) return;
            clearScratchLoadTimer();
            renderScratchPlaceholder(emptyEl, {
                tone: 'error',
                title: 'Scratch 项目未打开',
                desc: error?.message || '无法为 Scratch 项目创建本地工作副本。',
                buttonText: '立即重试',
            });
            emptyEl.style.display = 'flex';
            return;
        }
        if (nextRequestId !== scratchFrameRequestId) return;
        if (projectHandle) payload.projectHandle = projectHandle;
        const frameUrl = buildScratchWorkspaceUrl(payload);
        if (frame.dataset.loadedScratchUrl === frameUrl) {
            clearScratchRetryTimer();
            clearScratchLoadTimer();
            frame.style.display = 'block';
            frame.classList.remove('is-loading');
            emptyEl.style.display = 'none';
            return;
        }
        const preserveLoadedFrame = Boolean(options.preserveLoadedFrame && frame.dataset.loadedScratchUrl);
        renderScratchPlaceholder(emptyEl, {
            title: '正在连接 Scratch 创作环境',
            desc: '正在检查本地 XEdu API 服务并加载 Scratch 编辑器。',
            buttonText: '连接中...',
            buttonDisabled: true,
        });
        emptyEl.style.display = preserveLoadedFrame ? 'none' : 'flex';
        if (!preserveLoadedFrame) frame.style.display = 'none';
        frame.classList.add('is-loading');
        frame.addEventListener('load', () => {
            if (scratchFrameRequestId !== nextRequestId || frame.dataset.loadedScratchUrl !== frameUrl) return;
            clearScratchLoadTimer();
            frame.classList.remove('is-loading');
            frame.style.display = 'block';
            emptyEl.style.display = 'none';
            updateScratchHostMenuState(true);
        }, { once: true });
        waitForScratchBackend(frame, emptyEl, frameUrl, nextRequestId);
    }

    function renderWorkspacePages() {
        renderJupyterWorkspaceContext();
        renderScratchWorkspaceContext();
    }

    function getLastOpenedJupyterWorkspace() {
        return lastOpenedJupyterWorkspace;
    }

    return {
        openResourcesOrClassroomSource,
        openJupyterWorkspace,
        openScratchWorkspace,
        renderWorkspacePages,
        getLastOpenedJupyterWorkspace,
        isTeacherModeActive,
    };
}
