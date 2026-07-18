const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function joinForPlatform(platform, ...parts) {
    return platform === 'win32' ? path.win32.join(...parts) : path.posix.join(...parts);
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
    return [{ name: 'Python 可执行文件', extensions: ['*'] }];
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

function validatePythonExecutable(target, {
    platform = process.platform,
    fsImpl = fs,
    runner = spawnSync,
} = {}) {
    if (!isUsablePythonExecutable(target, { platform, fsImpl })) {
        return { success: false, message: '所选文件不是可用的 Python 可执行文件。' };
    }
    try {
        const result = runner(target, ['--version'], {
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
        const versionText = version.join('.');
        if (version[0] < 3 || (version[0] === 3 && version[1] < 10)) {
            return { success: false, message: `Python 版本过低: ${versionText}，至少需要 Python 3.10.0。`, version: versionText };
        }
        return { success: true, message: `Python ${versionText} 可用。`, version: versionText };
    } catch (_) {
        return { success: false, message: '无法运行所选 Python 解释器。' };
    }
}

function resolvePythonExecutable({
    platform = process.platform,
    packaged = false,
    configuredPath = '',
    selectedPath = '',
    envPath = '',
    projectRoot = '',
    fsImpl = fs,
}) {
    const candidates = [selectedPath, configuredPath, envPath].filter(Boolean);
    if (!packaged) {
        candidates.push(...getPythonExecutableCandidates({
            platform,
            baseDir: joinForPlatform(platform, projectRoot, 'python_env'),
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
    getPythonDialogFilters,
    getPythonExecutableCandidates,
    isUsablePythonExecutable,
    readConfiguredPythonExecutable,
    resolvePythonExecutable,
    validatePythonExecutable,
};
