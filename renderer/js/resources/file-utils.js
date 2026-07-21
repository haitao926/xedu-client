export function normalizeFile(file) {
    if (typeof file === 'string') {
        return { path: file };
    }
    if (file && typeof file === 'object') {
        return {
            name: file.name,
            path: file.path || file.url || '',
            type: file.type || file.kind || '',
            children: Array.isArray(file.children) ? file.children.map((child) => normalizeFile(child)) : [],
        };
    }
    return { path: '' };
}

export function isDirectory(file) {
    if (!file) return false;
    if (file.type === 'dir' || file.type === 'folder') return true;
    return Boolean(file.path && file.path.endsWith('/'));
}

function hasFileType(file, type, extensions) {
    if (!file) return false;
    if (file.type && file.type.toString().toLowerCase() === type) return true;
    const filePath = (file.path || '').toString().toLowerCase();
    return extensions.some((extension) => filePath.endsWith(extension));
}

export function isNotebookFile(file) {
    return hasFileType(file, 'ipynb', ['.ipynb']);
}

export function isBlocklyFile(file) {
    return hasFileType(file, 'blockly', ['.blockly.xml', '.blockly.json']);
}

export function isScratchFile(file) {
    return hasFileType(file, 'scratch', ['.sb3']);
}

export function isHtmlFile(file) {
    return hasFileType(file, 'html', ['.html']);
}

export function isPythonScriptFile(file) {
    if (!file) return false;
    const filePath = (file.path || '').toString().toLowerCase();
    return filePath.endsWith('.py');
}

export function getEntryKindForFile(file) {
    if (isScratchFile(file)) return 'scratch';
    if (isBlocklyFile(file)) return 'blockly';
    if (isNotebookFile(file)) return 'notebook';
    if (isHtmlFile(file)) return 'html';
    if (isPythonScriptFile(file)) return 'python';
    return 'file';
}

export function getApiBaseUrl(apiClient) {
    return (apiClient?.baseURL || 'http://127.0.0.1:5123').replace(/\/$/, '');
}

export function buildLocalCourseFileUrl(resource, filePath = '', apiClient = null) {
    const localPath = String(resource?.local_path || '').trim();
    const resourceHandle = String(resource?.resource_handle || '').trim();
    const relPath = String(filePath || '').trim().replace(/^\/+/, '');
    if (!localPath || !resourceHandle || !relPath || /^https?:\/\//i.test(relPath)) return '';
    const encodedRelPath = relPath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
    return `${getApiBaseUrl(apiClient)}/api/resources/local-file/${encodeURIComponent(resourceHandle)}/${encodedRelPath}`;
}

function normalizeRelativePath(value = '') {
    return String(value).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function getRelativeDirectory(filePath = '') {
    const segments = normalizeRelativePath(filePath).split('/').filter(Boolean);
    segments.pop();
    return segments.join('/');
}

function joinLocalPath(basePath = '', relativePath = '') {
    const base = String(basePath).trim().replace(/[\\/]+$/, '');
    const relative = normalizeRelativePath(relativePath);
    if (!base) return '';
    if (!relative) return base;
    const separator = base.includes('\\') && !base.includes('/') ? '\\' : '/';
    return `${base}${separator}${relative.split('/').join(separator)}`;
}

export function resolveJupyterWorkspaceTarget({ coursePath = '', experimentPath = '', filePath = '' } = {}) {
    const normalizedFilePath = normalizeRelativePath(filePath);
    const normalizedExperimentPath = normalizeRelativePath(experimentPath);
    const fileDirectory = getRelativeDirectory(normalizedFilePath);
    const workspaceDirectory = normalizedExperimentPath || fileDirectory;
    const fileInsideWorkspace = workspaceDirectory && (
        normalizedFilePath === workspaceDirectory ||
        normalizedFilePath.startsWith(`${workspaceDirectory}/`)
    );

    return {
        projectDir: joinLocalPath(coursePath, workspaceDirectory),
        filePath: fileInsideWorkspace
            ? normalizedFilePath.slice(workspaceDirectory.length).replace(/^\/+/, '')
            : normalizedFilePath,
    };
}

function filePriority(file) {
    if (isHtmlFile(file)) return 0;
    if (isScratchFile(file)) return 1;
    if (isBlocklyFile(file)) return 2;
    if (isNotebookFile(file) || isPythonScriptFile(file)) return 3;
    if (isDirectory(file)) return 4;
    return 5;
}

export function sortFiles(files) {
    if (!Array.isArray(files)) return [];
    return files.slice().sort((left, right) => {
        const priorityDifference = filePriority(left) - filePriority(right);
        if (priorityDifference !== 0) return priorityDifference;
        const leftName = (left?.name || left?.path || '').toString();
        const rightName = (right?.name || right?.path || '').toString();
        return leftName.localeCompare(rightName, 'zh-CN');
    });
}
