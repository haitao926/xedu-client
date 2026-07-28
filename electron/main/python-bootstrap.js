const { spawn } = require('child_process');

const BOOTSTRAP_MARKER = '__XEDU_BOOTSTRAP__=';

function parseBootstrapResult(output) {
    const lines = String(output || '').split(/\r?\n/).reverse();
    const line = lines.find((value) => value.startsWith(BOOTSTRAP_MARKER));
    if (!line) return null;
    try {
        const result = JSON.parse(line.slice(BOOTSTRAP_MARKER.length));
        return result && typeof result === 'object' ? result : null;
    } catch (_) {
        return null;
    }
}

function runPythonBootstrap({
    pythonExecutable,
    scriptPath,
    args = ['--repair'],
    env = process.env,
    spawnImpl = spawn,
    timeoutMs = 330000,
    onOutput = () => {},
} = {}) {
    return new Promise((resolve) => {
        let child;
        let stdout = '';
        let stderr = '';
        let settled = false;
        let timer;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            resolve(result);
        };

        try {
            child = spawnImpl(pythonExecutable, [scriptPath, ...args], {
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true,
            });
        } catch (error) {
            finish({
                success: false,
                changed: false,
                message: `无法启动 Python 修复程序: ${error?.message || error}`,
            });
            return;
        }

        const collect = (chunk, isError) => {
            const text = String(chunk || '');
            if (isError) stderr += text;
            else stdout += text;
            try {
                onOutput(text, isError);
            } catch (_) {
                // Diagnostic callbacks must not break the repair process.
            }
        };

        child.stdout?.on('data', (chunk) => collect(chunk, false));
        child.stderr?.on('data', (chunk) => collect(chunk, true));
        child.once('error', (error) => {
            finish({
                success: false,
                changed: false,
                message: `无法运行 Python 修复程序: ${error?.message || error}`,
            });
        });
        child.once('close', (code, signal) => {
            const parsed = parseBootstrapResult(stdout);
            if (parsed) {
                finish({
                    ...parsed,
                    success: Boolean(parsed.success) && code === 0,
                    message: parsed.message || (code === 0 ? 'Python 后端依赖已准备好' : 'Python 后端依赖准备失败'),
                });
                return;
            }
            const detail = String(stderr || stdout || '').trim().split(/\r?\n/).slice(-3).join(' ');
            finish({
                success: false,
                changed: false,
                message: detail || `Python 修复程序退出失败 (code=${code}, signal=${signal || 'none'})`,
            });
        });

        timer = setTimeout(() => {
            try {
                child.kill();
            } catch (_) {
                // The process may have exited just before the timeout.
            }
            finish({
                success: false,
                changed: false,
                message: 'Python 后端依赖安装超时，请检查网络后重试。',
            });
        }, timeoutMs);
    });
}

module.exports = {
    BOOTSTRAP_MARKER,
    parseBootstrapResult,
    runPythonBootstrap,
};
