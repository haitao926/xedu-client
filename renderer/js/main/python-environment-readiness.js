const READINESS_LABELS = Object.freeze({
    jupyterlab_version: 'JupyterLab',
    ipykernel_version: 'ipykernel',
});
const LANGUAGE_PACK_KEY = 'jupyterlab_language_pack_zh_cn_version';

export function getPythonEnvironmentReadinessIssues(info = {}) {
    const issues = [];
    if (info?.ssl_available === false) issues.push('SSL');
    if (info?.pip_available === false && info?.pip_launcher_available !== true) issues.push('pip');
    Object.entries(READINESS_LABELS).forEach(([key, label]) => {
        if (!info?.[key]) issues.push(label);
    });
    if (Object.prototype.hasOwnProperty.call(info || {}, LANGUAGE_PACK_KEY) && !info?.[LANGUAGE_PACK_KEY]) {
        issues.push('JupyterLab 简体中文语言包');
    }
    return issues;
}

export function getPythonEnvironmentOptionalWarnings(info = {}) {
    if (!info?.xedu_version) {
        return ['XEdu 增强功能未安装，不影响 Python 和 Jupyter 使用'];
    }
    if (!info?.xedu_version_ok || !info?.xedu_runtime_ok) {
        return ['XEdu 增强功能暂不可用，不影响 Python 和 Jupyter 使用'];
    }
    return [];
}

export function formatPythonEnvironmentReadinessMessage(issues = []) {
    const normalized = Array.isArray(issues) ? issues.filter(Boolean) : [];
    if (!normalized.length) return '环境已就绪';
    const repairHint = normalized.includes('SSL')
        ? '所选 Python 缺少 SSL，pip 无法连接 HTTPS 软件源。请改用完整安装版 Python、Conda 环境或应用自带 Python；这不是 xedu-python 版本问题。'
        : normalized.includes('pip')
        ? '所选 Python 自身缺少 pip，请点击“修复”；如果仍失败，请安装带 pip 的完整 Python 或在 Conda 环境中安装 pip。'
        : normalized.includes('JupyterLab')
        ? '点击修复安装 JupyterLab，并补齐其他缺失组件后再确认。'
        : '点击“修复”补齐缺失组件后再确认。';
    return `环境尚未就绪：缺少 ${normalized.join('、')}。${repairHint}`;
}
