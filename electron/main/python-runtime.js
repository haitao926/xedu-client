const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MIN_PYTHON_VERSION = [3, 8, 0];

function joinForPlatform(platform, ...parts) {
    return platform === 'win32' ? path.win32.join(...parts) : path.posix.join(...parts);
}

function formatPythonVersion(version) {
    return version.join('.');
}

function isSupportedPythonVersion(version) {
    if (!Array.isArray(version) || version.length < 2) return false;
    if (version[0] !== MIN_PYTHON_VERSION[0]) return version[0] > MIN_PYTHON_VERSION[0];
    if (version[1] !== MIN_PYTHON_VERSION[1]) return version[1] > MIN_PYTHON_VERSION[1];
    return (version[2] || 0) >= MIN_PYTHON_VERSION[2];
}

function getPythonExecutableCandidates({ platform = process.platform, baseDir }) {
    if (!baseDir) return [];
    if (platform === 'win32') {
        return [
            joinForPlatform(platform, baseDir, 'Scripts', 'python.exe'),
            joinForPlatform(platform, baseDir, 'python.exe'),
        ];
    }
    return [
        joinForPlatform(platform, baseDir, 'bin', 'python3'),
        joinForPlatform(platform, baseDir, 'bin', 'python'),
        joinForPlatform(platform, baseDir, 'python3'),
        joinForPlatform(platform, baseDir, 'python'),
    ];
}

function getPythonDialogFilters(platform = process.platform) {
    if (platform === 'win32') {
        return [
            { name: 'Python 可执行文件', extensions: ['exe'] },
            { name: '所有文件', extensions: ['*'] },
        ];
    }
    return [];
}

function isUsablePythonExecutable(target, { platform = process.platform, fsImpl = fs } = {}) {
    if (!target || typeof target !== 'string') return false;
    try {
        const stats = fsImpl.statSync(target);
        if (!stats.isFile()) return false;
        if (platform === 'win32') return true;
        const mode = Number(stats.mode || 0);
        if (mode && (mode & 0o111) === 0) return false;
        fsImpl.accessSync(target, fs.constants.X_OK);
        return true;
    } catch (_) {
        return false;
    }
}

function resolvePythonSelectionTarget(target, { platform = process.platform, fsImpl = fs } = {}) {
    if (!target || typeof target !== 'string') return '';
    const normalizedTarget = path.resolve(target);

    try {
        const stats = fsImpl.statSync(normalizedTarget);
        if (stats.isDirectory()) {
            return getPythonExecutableCandidates({ platform, baseDir: normalizedTarget })
                .find((candidate) => isUsablePythonExecutable(candidate, { platform, fsImpl })) || '';
        }
    } catch (_) {
        return '';
    }

    return normalizedTarget;
}

function validatePythonExecutable(target, {
    platform = process.platform,
    fsImpl = fs,
    runner = spawnSync,
} = {}) {
    const normalizedTarget = path.resolve(String(target || ''));
    let selectedDirectory = false;
    try {
        selectedDirectory = fsImpl.statSync(normalizedTarget).isDirectory();
    } catch (_) {
        selectedDirectory = false;
    }

    const resolvedTarget = resolvePythonSelectionTarget(target, { platform, fsImpl });
    if (!resolvedTarget || !isUsablePythonExecutable(resolvedTarget, { platform, fsImpl })) {
        return {
            success: false,
            message: selectedDirectory
                ? '所选文件夹中未找到可用的 Python，请选择包含 bin/python3 或 bin/python 的 Python 环境目录。'
                : '所选文件不是可用的 Python 可执行文件。',
        };
    }
    try {
        const result = runner(resolvedTarget, ['--version'], {
            encoding: 'utf8',
            timeout: 5000,
            windowsHide: true,
        });
        const output = `${result.stdout || ''}\n${result.stderr || ''}`;
        const match = output.match(/Python\s+(\d+)\.(\d+)(?:\.(\d+))?/);
        if (result.error || result.status !== 0 || !match) {
            return { success: false, message: '无法读取所选 Python 的版本。' };
        }
        const version = [Number(match[1]), Number(match[2]), Number(match[3] || 0)];
        const versionText = formatPythonVersion(version);
        if (!isSupportedPythonVersion(version)) {
            return {
                success: false,
                message: `Python 版本过低: ${versionText}，至少需要 Python ${formatPythonVersion(MIN_PYTHON_VERSION)}。`,
                version: versionText,
                resolvedPath: resolvedTarget,
            };
        }
        return {
            success: true,
            message: `Python ${versionText} 可用。`,
            version: versionText,
            resolvedPath: resolvedTarget,
        };
    } catch (_) {
        return { success: false, message: '无法运行所选 Python 解释器。' };
    }
}

function safeReadDirectory(target, fsImpl = fs) {
    try {
        return fsImpl.readdirSync(target, { withFileTypes: true });
    } catch (_) {
        return [];
    }
}

function addCandidatePath(store, target, source) {
    if (!target || typeof target !== 'string') return;
    const normalizedTarget = path.resolve(target);
    if (!store.has(normalizedTarget)) {
        store.set(normalizedTarget, source);
    }
}

function isLikelyProjectEnvironment(name) {
    return /^(?:\.?venv|env|python_env(?:[_-].+)?)$/i.test(String(name || ''));
}

function isLikelyHomeEnvironment(name) {
    return /^(?:\.?venv|env|python(?:[_-].+)?|[\w.-]+env[\w.-]*)$/i.test(String(name || ''));
}

function addEnvironmentRootCandidates(baseDir, store, source, {
    fsImpl = fs,
    matcher = () => true,
} = {}) {
    if (!baseDir || typeof baseDir !== 'string') return;
    for (const entry of safeReadDirectory(baseDir, fsImpl)) {
        if (!entry?.isDirectory?.() || !matcher(entry.name)) continue;
        addCandidatePath(store, path.join(baseDir, entry.name), source);
    }
}

function addExecutableCandidatesFromPath(envPath, executableCandidates, platform) {
    if (!envPath) return;
    const delimiter = platform === 'win32' ? ';' : ':';
    const fileNames = platform === 'win32'
        ? ['python.exe']
        : ['python3', 'python'];
    for (const baseDir of String(envPath).split(delimiter).filter(Boolean)) {
        for (const fileName of fileNames) {
            addCandidatePath(executableCandidates, path.join(baseDir, fileName), 'path');
        }
    }
}

function buildPythonEnvironmentLabel(resolvedPath, {
    source = 'detected',
    version = '',
    projectRoot = '',
    homeDir = '',
} = {}) {
    const normalizedPath = path.resolve(resolvedPath);
    const executableDir = path.dirname(normalizedPath);
    const environmentDir = path.basename(path.dirname(executableDir));
    const relativeToProject = projectRoot ? path.relative(projectRoot, normalizedPath) : '';
    const relativeToHome = homeDir ? path.relative(homeDir, normalizedPath) : '';
    let prefix = '检测到的 Python';
    let name = environmentDir;

    if (source === 'configured') {
        prefix = '当前配置';
    } else if (source === 'selected') {
        prefix = '当前选择';
    } else if (source === 'project' || (!relativeToProject.startsWith('..') && !path.isAbsolute(relativeToProject))) {
        prefix = '项目环境';
    } else if (source === 'home' || (!relativeToHome.startsWith('..') && !path.isAbsolute(relativeToHome))) {
        prefix = '主目录环境';
    } else if (source === 'path' || source === 'system') {
        prefix = '系统环境';
        name = path.basename(normalizedPath);
    }

    if (!name || name === '.' || name === path.sep) {
        name = path.basename(normalizedPath);
    }

    return version
        ? `${prefix} · ${name} · Python ${version}`
        : `${prefix} · ${name}`;
}

function discoverPythonEnvironments({
    platform = process.platform,
    projectRoot = '',
    homeDir = '',
    configuredPath = '',
    selectedPath = '',
    envPath = process.env.PATH || '',
    fsImpl = fs,
    runner = spawnSync,
} = {}) {
    const directoryCandidates = new Map();
    const executableCandidates = new Map();

    const addKnownTarget = (target, source) => {
        if (!target || typeof target !== 'string') return;
        const normalizedTarget = path.resolve(target);
        try {
            if (fsImpl.statSync(normalizedTarget).isDirectory()) {
                addCandidatePath(directoryCandidates, normalizedTarget, source);
                return;
            }
        } catch (_) {
            // Ignore invalid candidates and continue collecting.
        }
        addCandidatePath(executableCandidates, normalizedTarget, source);
    };

    addKnownTarget(configuredPath, 'configured');
    addKnownTarget(selectedPath, 'selected');

    if (projectRoot) {
        ['python_env', 'python_env_minimal', '.venv', 'venv', 'env'].forEach((name) => {
            addCandidatePath(directoryCandidates, path.join(projectRoot, name), 'project');
        });
        addEnvironmentRootCandidates(projectRoot, directoryCandidates, 'project', {
            fsImpl,
            matcher: isLikelyProjectEnvironment,
        });
    }

    if (homeDir) {
        ['.venv', 'venv', '.virtualenvs'].forEach((name) => {
            addCandidatePath(directoryCandidates, path.join(homeDir, name), 'home');
        });
        [
            path.join(homeDir, '.virtualenvs'),
            path.join(homeDir, 'venv'),
            path.join(homeDir, 'envs'),
            path.join(homeDir, 'miniconda3', 'envs'),
            path.join(homeDir, 'anaconda3', 'envs'),
            path.join(homeDir, 'mambaforge', 'envs'),
            path.join(homeDir, 'micromamba', 'envs'),
        ].forEach((target) => {
            addEnvironmentRootCandidates(target, directoryCandidates, 'home', {
                fsImpl,
                matcher: isLikelyHomeEnvironment,
            });
        });
    }

    if (platform === 'win32') {
        const userProfile = homeDir || process.env.USERPROFILE || '';
        const localAppData = process.env.LOCALAPPDATA || '';
        [
            path.join(userProfile, '.venv'),
            path.join(userProfile, 'venv'),
            path.join(localAppData, 'Programs', 'Python'),
        ].forEach((target) => addCandidatePath(directoryCandidates, target, 'system'));
        addExecutableCandidatesFromPath(envPath, executableCandidates, platform);
    } else {
        [
            '/opt/homebrew/bin/python3',
            '/usr/local/bin/python3',
            '/usr/bin/python3',
            '/opt/homebrew/bin/python',
            '/usr/local/bin/python',
        ].forEach((target) => addCandidatePath(executableCandidates, target, 'system'));
        addExecutableCandidatesFromPath(envPath, executableCandidates, platform);
    }

    const discovered = new Map();
    const collectValidated = (target, source) => {
        const validation = validatePythonExecutable(target, { platform, fsImpl, runner });
        if (!validation.success || !validation.resolvedPath) return;
        const resolvedPath = path.resolve(validation.resolvedPath);
        if (discovered.has(resolvedPath)) return;
        const version = validation.version || '';
        discovered.set(resolvedPath, {
            path: resolvedPath,
            version,
            source,
            label: buildPythonEnvironmentLabel(resolvedPath, {
                source,
                version,
                projectRoot,
                homeDir,
            }),
        });
    };

    for (const [target, source] of directoryCandidates.entries()) {
        collectValidated(target, source);
    }
    for (const [target, source] of executableCandidates.entries()) {
        collectValidated(target, source);
    }

    const priority = {
        configured: 0,
        selected: 1,
        project: 2,
        home: 3,
        path: 4,
        system: 5,
    };

    return [...discovered.values()].sort((left, right) => {
        const leftPriority = priority[left.source] ?? 99;
        const rightPriority = priority[right.source] ?? 99;
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        if (left.label !== right.label) return left.label.localeCompare(right.label, 'zh-Hans-CN');
        return left.path.localeCompare(right.path);
    });
}

function resolvePythonExecutable({
    platform = process.platform,
    packaged = false,
    configuredPath = '',
    selectedPath = '',
    envPath = '',
    projectRoot = '',
    bundledPythonBaseDir = '',
    fsImpl = fs,
}) {
    const candidates = [selectedPath, envPath, configuredPath]
        .map((candidate) => resolvePythonSelectionTarget(candidate, { platform, fsImpl }) || candidate)
        .filter(Boolean);
    if (!packaged) {
        candidates.push(...getPythonExecutableCandidates({
            platform,
            baseDir: joinForPlatform(platform, projectRoot, 'python_env'),
        }));
    } else if (bundledPythonBaseDir) {
        candidates.push(...getPythonExecutableCandidates({
            platform,
            baseDir: bundledPythonBaseDir,
        }));
    }

    const uniqueCandidates = [...new Set(candidates)];
    return uniqueCandidates.find((candidate) => isUsablePythonExecutable(candidate, { platform, fsImpl })) || null;
}

function readConfiguredPythonExecutable(configPath, fsImpl = fs) {
    if (!configPath) return '';
    try {
        const data = JSON.parse(fsImpl.readFileSync(configPath, 'utf8'));
        const value = data?.jupyter?.python_executable;
        return typeof value === 'string' ? value.trim() : '';
    } catch (_) {
        return '';
    }
}

module.exports = {
    buildPythonEnvironmentLabel,
    discoverPythonEnvironments,
    getPythonDialogFilters,
    getPythonExecutableCandidates,
    isUsablePythonExecutable,
    readConfiguredPythonExecutable,
    resolvePythonSelectionTarget,
    resolvePythonExecutable,
    validatePythonExecutable,
};
