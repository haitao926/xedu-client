import apiClient from './api.js';
import { log } from './ui.js';

const RESULT_PREFIX = '__XEDU_PIP_RESULT__=';

function getOutputBox() {
    return document.getElementById('package-output');
}

function getPackageInput() {
    return document.getElementById('python-package-input');
}

function getActionButtons() {
    return Array.from(document.querySelectorAll('[data-package-action]'));
}

function clearOutput() {
    const box = getOutputBox();
    if (box) box.innerHTML = '';
}

function appendOutput(line, type = 'info') {
    const box = getOutputBox();
    if (!box) return;
    const div = document.createElement('div');
    div.className = `line-${type}`;
    div.textContent = line;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function setBusy(isBusy) {
    const input = getPackageInput();
    if (input) input.disabled = isBusy;
    getActionButtons().forEach((button) => {
        button.disabled = isBusy;
    });
}

function classifyOutput(line) {
    if (!line) return 'info';
    if (/^WARNING:/i.test(line)) return 'warning';
    if (/^\[error\]/i.test(line) || /^ERROR:/i.test(line) || /Traceback/i.test(line)) return 'error';
    if (/Successfully installed|Successfully uninstalled|Requirement already satisfied/i.test(line)) {
        return 'success';
    }
    return 'info';
}

function parseResultLine(line) {
    if (!line) return null;

    if (line.startsWith(RESULT_PREFIX)) {
        try {
            return JSON.parse(line.slice(RESULT_PREFIX.length));
        } catch (_) {
            return { success: false, return_code: -1, message: '无法解析 pip 结果' };
        }
    }

    const match = line.match(/===\s*退出码:\s*(-?\d+)\s*===/);
    if (!match) return null;

    const returnCode = Number(match[1]);
    return {
        success: returnCode === 0,
        return_code: returnCode
    };
}

function appendStreamLine(line, state) {
    const result = parseResultLine(line);
    if (result) {
        state.result = result;
        if (!line.startsWith(RESULT_PREFIX)) {
            appendOutput(line, result.success ? 'success' : 'error');
        }
        return;
    }

    appendOutput(line, classifyOutput(line));
}

async function managePackage(action) {
    const input = getPackageInput();
    const useMirror = document.getElementById('use-tsinghua-mirror')?.checked ?? true;
    const pkg = input ? input.value.trim() : '';

    if (!pkg) {
        log('请输入要处理的包名', 'warning');
        appendOutput('请输入要处理的包名', 'error');
        return;
    }

    clearOutput();
    const actionText = action === 'install'
        ? '开始安装'
        : action === 'upgrade'
            ? '开始更新'
            : '开始卸载';
    log(`${actionText} ${pkg}...`, 'info');
    appendOutput(`${actionText} ${pkg}...`, 'info');
    setBusy(true);

    try {
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        const state = { result: null, bridgeError: null };
        const consumeChunk = (chunk) => {
            buffer += String(chunk || '');
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            lines.forEach((line) => appendStreamLine(line, state));
        };

        const streamPip = window.electronAPI?.streamPip;
        if (typeof streamPip === 'function') {
            const bridgeResult = await streamPip({
                action,
                package: pkg,
                useMirror,
            }, (event) => {
                if (event.type === 'data') consumeChunk(event.chunk);
                if (event.type === 'error') state.bridgeError = event.error || 'pip 请求失败';
            });
            if (state.bridgeError) throw new Error(state.bridgeError);
            if (bridgeResult.status < 200 || bridgeResult.status >= 300) {
                throw new Error(`HTTP ${bridgeResult.status}`);
            }
        } else {
            const resp = await apiClient.request('/api/python/pip', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'text/plain' },
                body: JSON.stringify({ action, package: pkg, use_mirror: useMirror, stream: true }),
                transport: 'fetch',
            });
            if (!resp.ok) throw new Error((await resp.text()) || `HTTP ${resp.status}`);
            const reader = resp.body?.getReader();
            if (!reader) throw new Error('浏览器不支持流式读取响应');
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                consumeChunk(decoder.decode(value, { stream: true }));
            }
            consumeChunk(decoder.decode());
        }

        if (buffer) {
            appendStreamLine(buffer, state);
        }

        if (state.result && state.result.success === false) {
            const msg = state.result.message || `pip 退出码 ${state.result.return_code}`;
            throw new Error(msg);
        }

        appendOutput('操作成功', 'success');
        log('操作成功', 'success');
    } catch (error) {
        const msg = error?.message || '未知错误';
        log(`操作失败: ${msg}`, 'error');
        appendOutput(`操作失败: ${msg}`, 'error');
        console.error(error);
    } finally {
        setBusy(false);
    }
}

export function installPackage() {
    managePackage('install');
}

export function uninstallPackage() {
    managePackage('uninstall');
}

export function updatePackage() {
    managePackage('upgrade');
}
