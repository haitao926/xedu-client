# -*- coding: utf-8 -*-
"""
Resource / preview / Blockly runtime helpers.
"""

from __future__ import annotations

import base64
import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

from services.gitea_service import build_single_course_entry, load_course_data_from_repo
from services.blockly_xeduhub_support import (
    build_xeduhub_toolbox_definition,
    execute_xeduhub_runtime,
)


def decode_local_preview_token(token: str) -> Path:
    clean = (token or "").strip()
    if not clean:
        raise ValueError("缺少预览令牌")
    padding = "=" * (-len(clean) % 4)
    decoded = base64.urlsafe_b64decode((clean + padding).encode("utf-8")).decode("utf-8")
    return Path(decoded).expanduser().resolve()


def resolve_local_course_file(base_path: str | Path, relpath: str) -> Path:
    base = Path(base_path).expanduser().resolve()
    target = (base / (relpath or "")).resolve()
    if base != target and base not in target.parents:
        raise ValueError("非法文件路径")
    return target


def guess_blockly_python_path(workspace_path: str) -> str:
    rel = str(workspace_path or "").strip().lstrip("/")
    if not rel:
        return ""
    path = Path(rel)
    name = path.name
    if name.endswith(".blockly.xml"):
        return str(path.with_name(name[:-12] + ".py")).replace("\\", "/")
    if name.endswith(".blockly.json"):
        return str(path.with_name(name[:-13] + ".py")).replace("\\", "/")
    return str(path.with_suffix(".py")).replace("\\", "/")


def guess_blockly_toolbox_path(workspace_path: str) -> str:
    rel = str(workspace_path or "").strip().lstrip("/")
    if not rel:
        return ""
    path = Path(rel)
    name = path.name
    parent = path.parent
    if name.endswith(".blockly.xml"):
        return str(parent / (name[:-12] + ".toolbox.json")).replace("\\", "/")
    if name.endswith(".blockly.json"):
        return str(parent / (name[:-13] + ".toolbox.json")).replace("\\", "/")
    return str(parent / "toolbox.json").replace("\\", "/")


def guess_blockly_notebook_path(workspace_path: str) -> str:
    rel = str(workspace_path or "").strip().lstrip("/")
    if not rel:
        return ""
    path = Path(rel)
    name = path.name
    if name.endswith(".blockly.xml"):
        return str(path.with_name(name[:-12] + ".ipynb")).replace("\\", "/")
    if name.endswith(".blockly.json"):
        return str(path.with_name(name[:-13] + ".ipynb")).replace("\\", "/")
    return str(path.with_suffix(".ipynb")).replace("\\", "/")


# Legacy inline Blockly HTML template removed after renderer runtime modularization.


def normalize_resource_source(raw: Any, fallback_id: str, parse_bool) -> Dict[str, Any]:
    data = raw if isinstance(raw, dict) else {}
    source_id = str(data.get("id") or fallback_id).strip() or fallback_id
    base_url = str(data.get("base_url") or "").strip().rstrip("/")
    repo = str(data.get("repo") or "").strip().strip("/")
    branch = str(data.get("branch") or "main").strip() or "main"
    index_path = str(data.get("index_path") or "index.json").strip().lstrip("/")
    submit_url = str(data.get("submit_url") or "").strip()
    publish_path = str(data.get("publish_path") or "courses").strip().strip("/") or "courses"
    single_course_repo = parse_bool(data.get("single_course_repo"), False)
    name = str(data.get("name") or "").strip() or repo or source_id
    return {
        "id": source_id,
        "name": name,
        "base_url": base_url,
        "repo": repo,
        "branch": branch,
        "index_path": index_path or "index.json",
        "submit_url": submit_url,
        "publish_path": publish_path,
        "single_course_repo": single_course_repo,
        "enabled": parse_bool(data.get("enabled"), True),
    }


def legacy_resource_source(ui_config, parse_bool) -> Dict[str, Any]:
    return normalize_resource_source({
        "id": "default",
        "name": "默认课程源",
        "base_url": getattr(ui_config, "resources_base_url", ""),
        "repo": getattr(ui_config, "resources_repo", ""),
        "branch": getattr(ui_config, "resources_branch", "main"),
        "index_path": getattr(ui_config, "resources_index_path", "index.json"),
        "submit_url": getattr(ui_config, "resources_submit_url", ""),
        "publish_path": getattr(ui_config, "resources_publish_path", "courses"),
        "enabled": True,
    }, "default", parse_bool)


def collect_resource_sources(ui_config, parse_bool) -> List[Dict[str, Any]]:
    raw_sources = getattr(ui_config, "resources_sources", []) or []
    collected: List[Dict[str, Any]] = []
    if isinstance(raw_sources, list):
        for idx, raw in enumerate(raw_sources):
            src = normalize_resource_source(raw, f"source-{idx + 1}", parse_bool)
            if src["enabled"]:
                collected.append(src)

    legacy = legacy_resource_source(ui_config, parse_bool)
    if legacy["base_url"] and legacy["repo"]:
        legacy_key = (legacy["base_url"].lower(), legacy["repo"].lower(), legacy["branch"], legacy["index_path"])
        has_same = any((item["base_url"].lower(), item["repo"].lower(), item["branch"], item["index_path"]) == legacy_key for item in collected)
        if not has_same:
            collected.insert(0, legacy)

    seen_ids = set()
    for idx, item in enumerate(collected):
        sid = item.get("id") or f"source-{idx + 1}"
        if sid in seen_ids:
            sid = f"{sid}-{idx + 1}"
        item["id"] = sid
        seen_ids.add(sid)
    return collected


def pick_source_by_id(sources: List[Dict[str, Any]], source_id: str) -> Dict[str, Any] | None:
    if not source_id:
        return None
    for item in sources:
        if (item.get("id") or "") == source_id:
            return item
    return None


def resolve_resource_source_for_request(ui_config, parse_bool, *, source_id: str = "", source_override: Any = None) -> Dict[str, Any] | None:
    override = normalize_resource_source(source_override, "override", parse_bool)
    if override.get("base_url") and override.get("repo"):
        return override
    sources = collect_resource_sources(ui_config, parse_bool)
    selected = pick_source_by_id(sources, source_id)
    if selected:
        return selected
    legacy_source = legacy_resource_source(ui_config, parse_bool)
    if legacy_source.get("base_url") and legacy_source.get("repo"):
        return legacy_source
    for candidate in sources:
        if candidate.get("base_url") and candidate.get("repo"):
            return candidate
    return None


def derive_course_id_from_path(value: str) -> str:
    if not value:
        return ""
    clean = value.strip().split("?", 1)[0].strip("/")
    if not clean:
        return ""
    parts = [segment for segment in clean.split("/") if segment]
    if len(parts) >= 2:
        return parts[-2]
    return ""


def resolve_blockly_runtime_asset_urls() -> Dict[str, str]:
    vite_client_url = "http://127.0.0.1:3000/@vite/client"
    try:
        with urllib.request.urlopen(vite_client_url, timeout=0.35):
            return {
                "vite_client_url": vite_client_url,
                "runtime_module_url": "http://127.0.0.1:3000/js/blockly-workspace.js",
            }
    except (urllib.error.URLError, TimeoutError, ValueError):
        return {
            "vite_client_url": "",
            "runtime_module_url": "/api/resources/frontend-assets/assets/blockly-workspace.js",
        }


def get_frontend_build_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "build"


def build_blockly_playground_html(
    *,
    workspace_url: str,
    toolbox_url: str,
    generated_python_url: str,
    workspace_label: str,
    project_root: str = "",
    xeduhub_execute_url: str = "/api/resources/blockly/xeduhub/execute",
    toolbox_validate_url: str = "/api/resources/blockly/validate-toolbox",
    practice_label: str = "",
    practice_kind: str = "",
    practice_url: str = "",
    practice_launch_url: str = "",
    toolbox_switch_enabled: bool = True,
) -> str:
    runtime_config = {
        "workspaceUrl": workspace_url or "",
        "toolboxUrl": toolbox_url or "",
        "generatedPythonUrl": generated_python_url or "",
        "workspaceTitle": workspace_label or "Blockly 实验",
        "practiceLabel": practice_label or "",
        "practiceKind": practice_kind or "",
        "practiceUrl": practice_url or "",
        "practiceLaunchUrl": practice_launch_url or "",
        "projectRoot": project_root or "",
        "toolboxSwitchEnabled": bool(toolbox_switch_enabled),
        "xeduhubExecuteUrl": xeduhub_execute_url or "",
        "toolboxValidateUrl": toolbox_validate_url or "",
        "defaultXEduHubToolbox": build_xeduhub_toolbox_definition("classification"),
    }
    runtime_config_json = json.dumps(runtime_config, ensure_ascii=False).replace("</", "<\\/")
    asset_urls = resolve_blockly_runtime_asset_urls()
    vite_client_tag = (
        f'<script type="module" src="{asset_urls["vite_client_url"]}"></script>'
        if asset_urls.get("vite_client_url")
        else ""
    )
    runtime_module_url = asset_urls["runtime_module_url"]
    page_title = workspace_label or "Blockly 实验"
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{page_title}</title>
  {vite_client_tag}
</head>
<body>
  <div class="topbar">
    <div class="topbar-left">
      <span class="title-dot" aria-hidden="true"></span>
      <div class="title-wrap">
        <div class="title" id="workspaceLabel">XEdu Blockly 教学实验台</div>
        <div class="title-sub">教学模式 · 可视化编程工作台</div>
      </div>
    </div>
    <div class="topbar-center">
      <button id="controlPanelToggleBtn" class="btn-ghost" type="button" aria-expanded="false">⚙ 积木控制台</button>
      <div id="controlPanel" class="control-panel">
        <div class="control-panel-title">积木控制台</div>
        <div class="control-panel-section">
          <div class="control-section-head">积木来源</div>
          <div id="toolboxModeSwitch" class="toolbox-mode-switch" role="group" aria-label="工具箱来源">
            <button id="toolboxOfficialBtn" class="toolbox-mode-btn active" type="button">官方积木</button>
            <button id="toolboxCourseBtn" class="toolbox-mode-btn" type="button">课程包积木</button>
          </div>
        </div>
        <div class="control-panel-section">
          <div class="control-section-head">分类显示</div>
          <div id="groupDrawerBody" class="group-list"></div>
        </div>
        <div id="toolboxPackPanel" class="control-panel-section toolbox-pack-panel">
          <div class="toolbox-pack-head">
            <span>积木包列表</span>
            <button id="addPackBtn" class="toolbox-pack-add" type="button">+ 增加</button>
            <input id="addPackInput" type="file" accept=".zip,.json,.toolbox.json" style="display:none;" />
          </div>
          <div id="toolboxPackList" class="toolbox-pack-list"></div>
        </div>
      </div>
    </div>
    <div class="topbar-right">
      <button id="toggleCodePanelBtn" class="btn-ghost" type="button">查看代码</button>
      <button id="runXEduHubBtn" class="btn-primary">运行程序</button>
      <div class="toolbar-more">
        <button id="toolbarMoreBtn" class="btn-ghost" type="button" aria-expanded="false">导出 ▾</button>
        <div id="toolbarMoreMenu" class="toolbar-more-menu">
          <button id="downloadPythonBtn" class="toolbar-more-item" type="button">下载 Python</button>
          <button id="downloadWorkspaceBtn" class="toolbar-more-item" type="button">下载工作区</button>
          <button id="resetWorkspaceBtn" class="toolbar-more-item" type="button">重置工作区</button>
          <button id="copyPythonBtn" class="toolbar-more-item" type="button">复制 Python</button>
          <button id="toggleDebugBtn" class="toolbar-more-item" type="button">切换调试区</button>
          <a id="practiceBtn" class="toolbar-more-item" href="#" target="_blank" rel="noopener" style="display:none;">在 Jupyter 打开关联代码</a>
        </div>
      </div>
    </div>
  </div>
  <div class="layout">
    <div class="panel canvas-panel">
      <div id="blocklyDiv"></div>
      <button id="blocklyExtendFab" class="blockly-extend-fab" type="button" title="增加积木包">
        <span class="blockly-extend-fab-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14M7 7h10v10H7z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        <span class="blockly-extend-fab-text">增加积木</span>
      </button>
      <div class="meta" id="toolboxLabel">正在加载工作区…</div>
    </div>
    <div id="insightCard" class="panel insight-card">
      <div class="insight-head">
        <span>教学属性面板</span>
        <span id="resultRunBadge" class="run-badge">等待运行</span>
      </div>
      <section class="insight-section result-section">
        <div class="section-head">运行结果卡</div>
        <div class="result-box">
          <div id="resultSummary" class="result-summary"><strong>等待运行</strong><small>拖入 XEduHub 积木后点击“运行程序”。</small></div>
          <div id="resultMetrics" class="result-metrics"></div>
          <div id="resultState" class="result-state">暂无结论</div>
          <img id="resultImage" class="result-image" alt="XEduHub 结果预览">
          <details id="resultDebugDetails" class="result-debug">
            <summary>查看原始 JSON</summary>
            <pre id="resultJson" class="result-json">{{}}</pre>
          </details>
        </div>
        <div class="meta" id="practiceMeta"></div>
      </section>
    </div>
  </div>
  <div id="pythonOverlay" class="python-overlay">
    <div class="python-overlay-card">
      <div class="python-overlay-head">
        <div>
          <div class="python-overlay-title">Python 实时生成</div>
          <div class="python-overlay-meta">只读代码视图，可用于课堂讲解、复制或导出</div>
        </div>
        <button id="closePythonOverlayBtn" class="btn-ghost" type="button">关闭代码</button>
      </div>
      <div class="python-overlay-body">
        <div class="python-box">
          <pre id="pythonCode"># 正在等待 Blockly 初始化</pre>
        </div>
      </div>
    </div>
  </div>
  <script>
    window.__XEDU_BLOCKLY_RUNTIME_CONFIG__ = {runtime_config_json};
  </script>
  <script type="module" src="{runtime_module_url}"></script>
</body>
</html>"""


def build_single_course_source_entry(*, base_url: str, repo: str, branch: str, raw_base_url: str, token: str) -> Dict[str, Any]:
    course_data = load_course_data_from_repo(raw_base_url=raw_base_url, course_path="course.json", token=token)
    return build_single_course_entry(course_data=course_data, course_url="course.json", package_url="")
