import apiClient from './api.js';
import { log } from './ui.js';

function getOutputBox() {
    return document.getElementById('package-output');
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

async function managePackage(action) {
    const input = document.getElementById('python-package-input');
    const useMirror = document.getElementById('use-tsinghua-mirror')?.checked ?? true;
    const pkg = input ? input.value.trim() : '';

    if (!pkg) {
        log('请输入要处理的包名', 'warning');
        appendOutput('请输入要处理的包名', 'error');
        return;
    }

    clearOutput();
    const actionText = action === 'install' ? '开始安装' : '开始卸载';
    log(`${actionText} ${pkg}...`, 'info');
    appendOutput(`${actionText} ${pkg}...`, 'info');

    try {
        // 使用后端绝对地址，避免 file:// 或非同源导致的 ERR_FILE_NOT_FOUND
        const apiBase = (apiClient && apiClient.baseURL) ? apiClient.baseURL.replace(/\/$/, '') : 'http://127.0.0.1:5000';
        const resp = await fetch(`${apiBase}/api/python/pip`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/plain'
            },
            body: JSON.stringify({
                action,
                package: pkg,
                use_mirror: useMirror,
                stream: true
            })
        });

        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(text || `HTTP ${resp.status}`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            lines.forEach((line) => appendOutput(line, 'info'));
        }

        if (buffer) appendOutput(buffer, 'info');

        appendOutput('操作结束', 'success');
        log('操作结束', 'success');
    } catch (error) {
        const msg = error?.message || '未知错误';
        log(`操作失败: ${msg}`, 'error');
        appendOutput(`操作失败: ${msg}`, 'error');
        console.error(error);
    }
}

export function installPackage() {
    managePackage('install');
}

export function uninstallPackage() {
    managePackage('uninstall');
}
