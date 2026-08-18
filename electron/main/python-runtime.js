const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MIN_PYTHON_VERSION = [3, 8, 0];

function joinForPlatform(platform, ...parts) {
    return platform === 'win32' ? path.win32.join(...parts) : path.posix.join(...parts);
}

function isDirectory(target, fsImpl = fs) {
    try {
        return fsImpl.statSync(target).isDirectory();
    } catch (_) {
        return false;
    }
}

function getWindowsPythonEnvironmentRoot(pythonExecutable) {
    const normalizedExecutable = path.win32.normalize(String(pythonExecutable || ''));
    const executableDir = path.win32.dirname(normalizedExecutable);
    return path.win32.basename(executableDir).toLowerCase() === 'scripts'
        ? path.win32.dirname(executableDir)
        : executableDir;
}

function isFile(target, fsImpl = fs) {
    try {
        return fsImpl.statSync(target).isFile();
    } catch (_) {
        return false;
    }
}

function getXEduProResourceDirectories(pythonExecutable, {
    platform = process.platform,
    fsImpl = fs,
} = {}) {
    const empty = { root: '', checkpoints: [] };
    if (platform !== 'win32' || !pythonExecutable) return empty;

    const environmentRoot = getWindowsPythonEnvironmentRoot(pythonExecutable);
    if (path.win32.basename(environmentRoot).toLowerCase() !== 'env') return empty;
    const xeduProRoot = path.win32.dirname(environmentRoot);
    const launcherFiles = [
        path.win32.join(xeduProRoot, 'Jupyter编辑器.bat'),
        path.win32.join(xeduProRoot, '启动cmd.bat'),
    ];
    if (!launcherFiles.every((target) => isFile(target, fsImpl))) return empty;

    const checkpoints = ['checkpoints', 'my_checkpoints']
        .map((name) => path.win32.join(xeduProRoot, name))
        .filter((target) => isDirectory(target, fsImpl));
    return { root: xeduProRoot, checkpoints };
}

function buildPythonChildEnvironment({
    pythonExecutable,
    platform = process.platform,
    baseEnv = process.env,
    fsImpl = fs,
} = {}) {
    const env = { ...baseEnv };
    if (platform !== 'win32' || !pythonExecutable) return env;

    const environmentRoot = getWindowsPythonEnvironmentRoot(pythonExecutable);
    const isCondaEnvironment = isDirectory(path.win32.join(environmentRoot, 'conda-meta'), fsImpl)
        || isDirectory(path.win32.join(environmentRoot, 'Library'), fsImpl);
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'Path';
    const activationEntries = isCondaEnvironment
        ? [
            environmentRoot,
            path.win32.join(environmentRoot, 'Library', 'mingw-w64', 'bin'),
            path.win32.join(environmentRoot, 'Library', 'usr', 'bin'),
            path.win32.join(environmentRoot, 'Library', 'bin'),
            path.win32.join(environmentRoot, 'Scripts'),
        ]
        : [environmentRoot, path.win32.join(environmentRoot, 'Scripts')];
    const existingEntries = String(env[pathKey] || '').split(';').filter(Boolean);
    const seen = new Set();
    env[pathKey] = [...activationEntries, ...existingEntries]
        .filter((entry) => {
            const key = path.win32.normalize(entry).toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .join(';');

    if (isCondaEnvironment) {
        env.CONDA_PREFIX = environmentRoot;
    }
    return env;
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

function parseWindowsPythonLauncherPaths(output) {
    const paths = [];
    const seen = new Set();
    for (const line of String(output || '').split(/\r?\n/)) {
        const match = line.match(/([A-Za-z]:[\\/].*?python(?:\d+(?:\.\d+)*)?\.exe)\s*$/i);
        const target = match?.[1]?.trim();
        if (!target || seen.has(target.toLowerCase())) continue;
        seen.add(target.toLowerCase());
        paths.push(target);
    }
    return paths;
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

    if (source === 'bundled') {
        return version ? `应用内置 Python · Python ${version}` : '应用内置 Python';
    } else if (source === 'configured') {
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
    bundledPythonBaseDir = '',
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

    addKnownTarget(bundledPythonBaseDir, 'bundled');
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
        const programFiles = [
            process.env.ProgramFiles,
            process.env['ProgramFiles(x86)'],
        ].filter(Boolean);
        [
            path.join(userProfile, '.venv'),
            path.join(userProfile, 'venv'),
            path.join(localAppData, 'Programs', 'Python'),
            ...programFiles,
        ].forEach((target) => addCandidatePath(directoryCandidates, target, 'system'));
        [
            path.join(localAppData, 'Programs', 'Python'),
            ...programFiles,
        ].forEach((target) => addEnvironmentRootCandidates(target, directoryCandidates, 'system', {
            fsImpl,
            matcher: (name) => /^Python\d+(?:\.\d+)?$/i.test(String(name || '')),
        }));
        addExecutableCandidatesFromPath(envPath, executableCandidates, platform);
        try {
            const launcher = runner('py', ['-0p'], {
                encoding: 'utf8',
                timeout: 5000,
                windowsHide: true,
            });
            if (!launcher?.error && launcher.status === 0) {
                parseWindowsPythonLauncherPaths(launcher.stdout).forEach((target) => {
                    addCandidatePath(executableCandidates, target, 'launcher');
                });
            }
        } catch (_) {
            // The launcher is optional; PATH and standard roots remain available.
        }
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
        bundled: 0,
        configured: 1,
        selected: 2,
        project: 3,
        home: 4,
        launcher: 5,
        path: 6,
        system: 7,
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

function resolveBackendPythonExecutable({
    platform = process.platform,
    packaged = false,
    backendOverridePath = '',
    bundledPythonBaseDir = '',
    projectRoot = '',
    fsImpl = fs,
} = {}) {
    // The backend is an application dependency. In packaged builds it must
    // never inherit the teacher's experiment interpreter or stale config.
    if (packaged) {
        return resolvePythonExecutable({
            platform,
            packaged: true,
            bundledPythonBaseDir,
            fsImpl,
        });
    }
    return resolvePythonExecutable({
        platform,
        packaged: false,
        envPath: backendOverridePath,
        projectRoot,
        fsImpl,
    });
}

async function repairPythonWithBundledFallback({
    selectedPath,
    platform = process.platform,
    packaged = false,
    bundledPythonBaseDir = '',
    fsImpl = fs,
    repair,
}) {
    const initialResult = await repair(selectedPath);
    if (initialResult?.success || initialResult?.error_code !== 'ssl_unavailable' || !packaged) {
        return initialResult;
    }

    const bundledPath = resolvePythonExecutable({
        platform,
        packaged: true,
        bundledPythonBaseDir,
        fsImpl,
    });
    if (!bundledPath || bundledPath === selectedPath) {
        return {
            ...initialResult,
            fallback_attempted: true,
            fallback_error: '未找到可用的应用内置 Python。',
        };
    }

    const fallbackResult = await repair(bundledPath);
    if (!fallbackResult?.success) {
        return {
            ...initialResult,
            fallback_attempted: true,
            fallback_error: fallbackResult?.message || fallbackResult?.error || '应用内置 Python 修复失败。',
        };
    }

    const fallbackNotice = `所选 Python 缺少 SSL，已自动改用应用内置 Python：${bundledPath}`;
    return {
        ...fallbackResult,
        path: bundledPath,
        fallback_used: true,
        fallback_from: selectedPath,
        message: `${fallbackResult.message || 'Python 环境已就绪'}；${fallbackNotice}`,
        warnings: [
            ...(Array.isArray(fallbackResult.warnings) ? fallbackResult.warnings : []),
            fallbackNotice,
        ],
    };
}

function readConfiguredPythonExecutable(
    configPath,
    fsImpl = fs,
    { requireConfirmed = false } = {},
) {
    if (!configPath) return '';
    try {
        const data = JSON.parse(fsImpl.readFileSync(configPath, 'utf8'));
        if (requireConfirmed && data?.jupyter?.python_selection_confirmed !== true) {
            return '';
        }
        const value = data?.jupyter?.python_executable;
        return typeof value === 'string' ? value.trim() : '';
    } catch (_) {
        return '';
    }
}

module.exports = {
    buildPythonChildEnvironment,
    buildPythonEnvironmentLabel,
    discoverPythonEnvironments,
    getPythonDialogFilters,
    getPythonExecutableCandidates,
    getXEduProResourceDirectories,
    isUsablePythonExecutable,
    parseWindowsPythonLauncherPaths,
    readConfiguredPythonExecutable,
    repairPythonWithBundledFallback,
    resolveBackendPythonExecutable,
    resolvePythonSelectionTarget,
    resolvePythonExecutable,
    validatePythonExecutable,
};
