import assert from "node:assert/strict";
import test from "node:test";

import {
    formatPythonEnvironmentReadinessMessage,
    getPythonEnvironmentOptionalWarnings,
    getPythonEnvironmentReadinessIssues,
} from "./python-environment-readiness.js";

test("external Python readiness ignores Flask because the application backend is isolated", () => {
    const issues = getPythonEnvironmentReadinessIssues({
        ssl_available: false,
        ssl_error: "ImportError: DLL load failed while importing _ssl",
        pip_available: false,
        jupyterlab_version: null,
        ipykernel_version: null,
        xedu_version: null,
        xedu_version_ok: false,
        xedu_runtime_ok: false,
        backend_ready: false,
        backend_missing: ["Flask"],
    });

    assert.deepEqual(issues, ["SSL", "pip", "JupyterLab", "ipykernel"]);
    assert.match(formatPythonEnvironmentReadinessMessage(issues), /环境尚未就绪/);
    assert.match(formatPythonEnvironmentReadinessMessage(issues), /缺少 SSL/);
    assert.match(formatPythonEnvironmentReadinessMessage(issues), /不是 xedu-python 版本问题/);
});

test("a missing Flask package never blocks an otherwise ready experiment environment", () => {
    assert.deepEqual(getPythonEnvironmentReadinessIssues({
        ssl_available: true,
        pip_available: true,
        jupyterlab_version: "4.5.0",
        jupyterlab_language_pack_zh_cn_version: "4.5.post1",
        ipykernel_version: "6.29.3",
        backend_ready: false,
        backend_missing: ["Flask"],
    }), []);
});

test("xedu-python is an optional enhancement when the Jupyter environment is ready", () => {
    const info = {
        ssl_available: true,
        pip_available: true,
        jupyterlab_version: "4.5.0",
        jupyterlab_language_pack_zh_cn_version: "4.5.post1",
        ipykernel_version: "6.29.3",
        xedu_version: null,
        xedu_version_ok: false,
        xedu_runtime_ok: false,
        backend_ready: true,
    };

    assert.deepEqual(getPythonEnvironmentReadinessIssues(info), []);
    assert.deepEqual(getPythonEnvironmentOptionalWarnings(info), ["XEdu 增强功能未安装，不影响 Python 和 Jupyter 使用"]);
});

test("a complete Python probe has no readiness issues", () => {
    assert.deepEqual(getPythonEnvironmentReadinessIssues({
        ssl_available: true,
        pip_available: true,
        jupyterlab_version: "4.4.0",
        jupyterlab_language_pack_zh_cn_version: "4.4.post3",
        ipykernel_version: "6.29.3",
        xedu_version: "2.0.0",
        xedu_version_ok: true,
        xedu_runtime_ok: true,
        backend_ready: true,
    }), []);
});

test("a working sibling pip launcher is not reported as a missing pip module", () => {
    assert.deepEqual(getPythonEnvironmentReadinessIssues({
        ssl_available: true,
        pip_available: false,
        pip_launcher_available: true,
        jupyterlab_version: "4.4.0",
        jupyterlab_language_pack_zh_cn_version: "4.4.post3",
        ipykernel_version: "6.29.3",
        xedu_version: "2.0.0",
        xedu_version_ok: true,
        xedu_runtime_ok: true,
        backend_ready: true,
    }), []);
});

test("a missing Chinese language pack keeps the Jupyter environment repairable", () => {
    const issues = getPythonEnvironmentReadinessIssues({
        ssl_available: true,
        pip_available: true,
        jupyterlab_version: "4.5.0",
        jupyterlab_language_pack_zh_cn_version: null,
        ipykernel_version: "6.29.3",
    });

    assert.deepEqual(issues, ["JupyterLab 简体中文语言包"]);
    assert.match(formatPythonEnvironmentReadinessMessage(issues), /点击.*修复/);
});
