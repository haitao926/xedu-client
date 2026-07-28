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
    let scratchFrameLoaded = false;
    let scratchHandleIssuedAt = 0;
    let scratchBridgeReady = false;
    let scratchBridgeState = {};
    let scratchHostRequestId = 0;
    const scratchHostRequests = new Map();
    const scratchBridgeToken = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

    function getScratchHostMenuElements() {
        return {
            topBarActions: document.getElementById('top-bar-actions'),
            menu: document.getElementById('scratch-host-file-menu'),
            items: Array.from(document.querySelectorAll('[data-scratch-host-action]')),
        };
    }

    function sliceArrayBufferView(view) {
        return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    }

    function normalizeScratchProjectBuffer(buffer) {
        if (buffer instanceof ArrayBuffer) {
            return buffer;
        }
        if (ArrayBuffer.isView(buffer)) {
            return sliceArrayBufferView(buffer);
        }
        return null;
    }

    async function pickScratchProjectFileFromHost() {
        if (typeof window.electronAPI?.selectScratchProjectFile === 'function') {
            const result = await window.electronAPI.selectScratchProjectFile();
            if (!result || result.canceled) {
                return null;
            }
            const buffer = normalizeScratchProjectBuffer(result.buffer);
            if (!buffer) {
                throw new Error('Scratch 项目文件读取失败。');
            }
            return {
                fileName: String(result.fileName || result.name || 'Scratch作品.sb3'),
                buffer,
            };
        }
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            let settled = false;
            input.type = 'file';
            input.accept = '.sb,.sb2,.sb3';
            input.style.display = 'none';
            document.body.appendChild(input);
            const cleanup = () => {
                settled = true;
                window.removeEventListener('focus', handleWindowFocus);
                input.value = '';
                if (input.parentNode) {
                    input.parentNode.removeChild(input);
                }
            };
            const resolveOnce = (value) => {
                if (settled) return;
                cleanup();
                resolve(value);
            };
            const rejectOnce = (error) => {
                if (settled) return;
                cleanup();
                reject(error);
            };
            const handleWindowFocus = () => {
                window.setTimeout(() => {
                    if (!settled && !(input.files && input.files.length > 0)) {
                        resolveOnce(null);
                    }
                }, 250);
            };
            input.addEventListener('cancel', () => resolveOnce(null), { once: true });
            input.addEventListener('change', async () => {
                const file = input.files?.[0];
                if (!file) {
                    resolveOnce(null);
                    return;
                }
                try {
                    resolveOnce({
                        fileName: file.name,
                        buffer: await file.arrayBuffer(),
                    });
                } catch (error) {
                    rejectOnce(error);
                }
            }, { once: true });
            window.addEventListener('focus', handleWindowFocus, { once: true });
            input.click();
        });
    }

    function postToScratchFrame(message, transfer = []) {
        const frame = document.getElementById('scratch-workspace-frame');
        const childWindow = frame?.contentWindow;
        if (!scratchFrameLoaded || !childWindow || typeof childWindow.postMessage !== 'function') {
            return false;
        }
        let backendOrigin = '';
        try {
            backendOrigin = new URL(getApiBaseUrl()).origin;
        } catch (_) {
            return false;
        }
        try {
            childWindow.postMessage({ ...message, bridgeToken: scratchBridgeToken }, backendOrigin, transfer);
            return true;
        } catch (_) {
            return false;
        }
    }

    function requestScratchBridgeState() {
        postToScratchFrame({ type: 'xedu:scratch-host-state-request' });
    }

    function releaseScratchMedia() {
        postToScratchFrame({ type: 'xedu:scratch-host-lifecycle', active: false });
    }

    function resetScratchFrameState(frame) {
        scratchFrameLoaded = false;
        if (frame) {
            frame.classList.remove('is-loading');
        }
    }

    function syncScratchMenuInteractivity() {
        const { menu } = getScratchHostMenuElements();
        const frame = document.getElementById('scratch-workspace-frame');
        if (!frame) {
            return;
        }
        frame.style.pointerEvents = menu?.open ? 'none' : 'auto';
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
        syncScratchMenuInteractivity();
        items.forEach((item) => {
            const action = item.getAttribute('data-scratch-host-action');
            if (!visible || !scratchBridgeReady) {
                item.disabled = true;
                return;
            }
            if (action === 'save') {
                item.disabled = scratchBridgeState.canSave === false;
                return;
            }
            item.disabled = false;
        });
    }

    async function dispatchScratchHostRequest(request, options = {}) {
        const requestId = `scratch-host-${++scratchHostRequestId}`;
        return await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                scratchHostRequests.delete(requestId);
                reject(new Error('Scratch 文件操作超时'));
            }, 15000);
            scratchHostRequests.set(requestId, {
                resolve: (value) => {
                    clearTimeout(timeoutId);
                    resolve(value);
                },
                reject: (error) => {
                    clearTimeout(timeoutId);
                    reject(error);
                },
            });
            if (!postToScratchFrame({ ...request, requestId }, options.transfer || [])) {
                scratchHostRequests.delete(requestId);
                clearTimeout(timeoutId);
                reject(new Error('Scratch 页面尚未连接'));
            }
        });
    }

    async function runScratchHostAction(action) {
        const { menu } = getScratchHostMenuElements();
        if (menu) {
            menu.open = false;
        }
        if (!scratchBridgeReady) {
            window.app?.ui?.showToast?.('Scratch 正在加载，请稍后再试。', 'warning');
            requestScratchBridgeState();
            updateScratchHostMenuState(true);
            return false;
        }
        if (!['new', 'save', 'upload', 'download'].includes(action)) {
            window.app?.ui?.showToast?.('当前 Scratch 页面暂不支持这个操作。', 'warning');
            updateScratchHostMenuState(true);
            return false;
        }
        try {
            if (action === 'upload') {
                const uploadPayload = await pickScratchProjectFileFromHost();
                if (!uploadPayload) {
                    updateScratchHostMenuState(true);
                    return false;
                }
                await dispatchScratchHostRequest({
                    type: 'xedu:scratch-host-upload-project',
                    fileName: uploadPayload.fileName,
                    buffer: uploadPayload.buffer,
                }, {
                    transfer: [uploadPayload.buffer],
                });
            } else {
                await dispatchScratchHostRequest({
                    type: 'xedu:scratch-host-action',
                    action,
                });
            }
            requestScratchBridgeState();
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
        menu.addEventListener('toggle', () => {
            syncScratchMenuInteractivity();
        });
        document.addEventListener('click', (event) => {
            if (!menu.open) {
                return;
            }
            if (menu.contains(event.target)) {
                return;
            }
            menu.open = false;
            syncScratchMenuInteractivity();
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
        params.set('bridgeToken', scratchBridgeToken);
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
            if (event.source !== frame.contentWindow) return;
            let backendOrigin = '';
            try {
                backendOrigin = new URL(getApiBaseUrl()).origin;
            } catch (_) {
                return;
            }
            if (event.origin !== backendOrigin) return;
            if (request?.type === 'xedu:scratch-host-state') {
                if (request.bridgeToken !== scratchBridgeToken) return;
                scratchBridgeReady = true;
                scratchBridgeState = request.state && typeof request.state === 'object' ? request.state : {};
                updateScratchHostMenuState(true);
                return;
            }
            if (request?.type === 'xedu:scratch-host-action-result') {
                if (request.bridgeToken !== scratchBridgeToken) return;
                const pending = scratchHostRequests.get(request.requestId);
                if (!pending) return;
                scratchHostRequests.delete(request.requestId);
                if (request.error) pending.reject(new Error(request.error));
                else pending.resolve(request.result);
                return;
            }
            if (request?.type === 'xedu:scratch-project-access-expired') {
                if (request.bridgeToken !== scratchBridgeToken || !lastOpenedScratchWorkspace?.projectPath) return;
                // Scratch turns a 410 from its project loader into a fatal ErrorBoundary.
                // Drop the expired, opaque handle and let the host issue a replacement first.
                lastOpenedScratchWorkspace.projectHandle = '';
                scratchHandleIssuedAt = 0;
                resetScratchFrameState(frame);
                frame.dataset.loadedScratchUrl = '';
                renderScratchWorkspaceContext();
                return;
            }
            if (request?.type !== 'xedu:scratch-api-request' || typeof window.electronAPI?.scratchApiRequest !== 'function') return;
            try {
                const response = await window.electronAPI.scratchApiRequest({
                    path: request.path,
                    method: request.method,
                    body: request.body,
                    headers: request.headers || {},
                });
                postToScratchFrame({
                    type: 'xedu:scratch-api-response',
                    requestId: request.requestId,
                    status: response.status,
                    headers: response.headers || {},
                    body: response.body || '',
                });
            } catch (error) {
                postToScratchFrame({
                    type: 'xedu:scratch-api-response',
                    requestId: request.requestId,
                    error: error?.message || 'Scratch AI 请求失败',
                });
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
            resetScratchFrameState(frame);
            frame.removeAttribute('src');
            frame.dataset.loadedScratchUrl = '';
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
        emptyEl.querySelector('[data-scratch-placeholder-action]')?.addEventListener('click', async () => {
            if (state.buttonDisabled) return;
            if (typeof state.onAction === 'function') {
                try {
                    await state.onAction();
                } catch (error) {
                    console.warn('执行 Scratch 占位操作失败:', error);
                    window.app?.ui?.showToast?.(error?.message || 'Scratch 恢复失败', 'error');
                }
                return;
            }
            if (tone === 'error') {
                renderScratchWorkspaceContext();
            } else {
                openScratchWorkspace({});
            }
        });
    }

    async function getScratchBackendRecoveryState() {
        const electronApi = window.electronAPI;
        if (typeof electronApi?.getBackendStartupState !== 'function') {
            return null;
        }
        try {
            const result = await electronApi.getBackendStartupState();
            const state = result?.state;
            if (!state || typeof state !== 'object') {
                return null;
            }
            return {
                status: String(state.status || '').trim().toLowerCase(),
                message: String(state.message || '').trim(),
                canRetry: state.canRetry !== false,
            };
        } catch (error) {
            console.warn('获取后端启动状态失败:', error);
            return null;
        }
    }

    async function retryScratchManagedBackend() {
        const electronApi = window.electronAPI;
        if (typeof electronApi?.retryBackendStartup !== 'function') {
            throw new Error('当前环境不支持自动重试后端启动。');
        }
        const result = await electronApi.retryBackendStartup();
        if (!result?.success) {
            throw new Error(result?.error || result?.state?.message || '重试启动后端失败');
        }
        window.app?.ui?.showToast?.('已重新触发 XEdu API 服务启动', 'success');
        await renderScratchWorkspaceContext();
    }

    async function waitForScratchBackend(frame, emptyEl, frameUrl, requestId, onFrameLoad, onFrameError) {
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
                frame.addEventListener('load', onFrameLoad, { once: true });
                frame.addEventListener('error', onFrameError, { once: true });
                resetScratchFrameState(frame);
                frame.dataset.loadedScratchUrl = frameUrl;
                frame.setAttribute('src', frameUrl);
            }
            scheduleScratchLoadTimeout(frame, emptyEl, requestId);
            frame.style.display = 'block';
            emptyEl.style.display = 'none';
        } catch (error) {
            if (requestId !== scratchFrameRequestId) return;
            clearScratchLoadTimer();
            resetScratchFrameState(frame);
            frame.removeAttribute('src');
            frame.dataset.loadedScratchUrl = '';
            frame.style.display = 'none';
            const recoveryState = await getScratchBackendRecoveryState();
            const backendStarting = recoveryState?.status === 'starting';
            const canManagedRetry = Boolean(
                recoveryState
                && recoveryState.status !== 'ready'
                && recoveryState.canRetry
                && typeof window.electronAPI?.retryBackendStartup === 'function'
            );
            renderScratchPlaceholder(emptyEl, {
                tone: 'error',
                title: 'Scratch 后端未连接',
                desc: recoveryState?.message || (backendStarting
                    ? 'XEdu API 服务仍在启动中；服务恢复后这里会自动重试。'
                    : '请先启动 XEdu API 服务；后端恢复后这里会自动重试。'),
                buttonText: backendStarting
                    ? '后端启动中...'
                    : (canManagedRetry ? '重试启动后端' : '立即重试'),
                buttonDisabled: backendStarting,
                onAction: canManagedRetry ? retryScratchManagedBackend : undefined,
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
        frame.setAttribute('allow', 'camera *');
        clearScratchRetryTimer();
        clearScratchLoadTimer();
        const payload = lastOpenedScratchWorkspace;
        bindScratchFrameBridge(frame);
        const projectName = payload?.projectPath
            ? (getBaseName(payload.projectPath) || 'Scratch 项目')
            : '';
        const scratchSectionActive = Boolean(document.getElementById('scratch-workspace')?.classList.contains('active'));
        updateScratchHostMenuState(scratchSectionActive);
        if (!scratchSectionActive) {
            clearScratchRetryTimer();
            clearScratchLoadTimer();
            releaseScratchMedia();
            return;
        }
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
            resetScratchFrameState(frame);
            frame.removeAttribute('src');
            frame.dataset.loadedScratchUrl = '';
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
        const onFrameLoad = () => {
            if (scratchFrameRequestId !== nextRequestId || frame.dataset.loadedScratchUrl !== frameUrl) return;
            scratchFrameLoaded = true;
            clearScratchLoadTimer();
            frame.classList.remove('is-loading');
            frame.style.display = 'block';
            emptyEl.style.display = 'none';
            requestScratchBridgeState();
            updateScratchHostMenuState(true);
        };
        const onFrameError = () => {
            if (scratchFrameRequestId !== nextRequestId || frame.dataset.loadedScratchUrl !== frameUrl) return;
            clearScratchLoadTimer();
            resetScratchFrameState(frame);
            frame.removeAttribute('src');
            frame.dataset.loadedScratchUrl = '';
            frame.style.display = 'none';
            renderScratchPlaceholder(emptyEl, {
                tone: 'error',
                title: 'Scratch 加载失败',
                desc: 'Scratch 编辑器加载失败；系统会自动重试，也可以立即重试。',
                buttonText: '立即重试',
            });
            emptyEl.style.display = 'flex';
            scheduleScratchRetry();
            updateScratchHostMenuState(false);
        };
        waitForScratchBackend(frame, emptyEl, frameUrl, nextRequestId, onFrameLoad, onFrameError);
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
