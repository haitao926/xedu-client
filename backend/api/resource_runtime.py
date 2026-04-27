# -*- coding: utf-8 -*-
"""
Resource / preview / Blockly runtime helpers.
"""

from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

from services.gitea_service import build_single_course_entry, load_course_data_from_repo
from services.blockly_xeduhub_support import (
    build_xeduhub_toolbox_definition,
    execute_xeduhub_runtime,
    get_xeduhub_frontend_registry,
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
    renderer_port = int(os.environ.get("XEDU_RENDERER_PORT", "3002") or "3002")
    vite_hosts = (
        f"http://127.0.0.1:{renderer_port}",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3000",
    )
    for host in vite_hosts:
        vite_client_url = f"{host}/@vite/client"
        try:
            with urllib.request.urlopen(vite_client_url, timeout=1.0) as response:
                content_type = str(response.headers.get("content-type") or "").lower()
                preview = response.read(512).decode("utf-8", "ignore")
                if "javascript" not in content_type and "ecmascript" not in content_type:
                    continue
                if "vite" not in preview.lower():
                    continue
                return {
                    "vite_client_url": vite_client_url,
                    "runtime_module_url": f"{host}/js/blockly-workspace.js",
                }
        except (urllib.error.URLError, TimeoutError, ValueError):
            continue
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
    role: str = "",
    root_token: str = "",
    workspace_rel: str = "",
    toolbox_rel: str = "",
    project_root: str = "",
    xeduhub_execute_url: str = "/api/resources/blockly/xeduhub/execute",
    toolbox_validate_url: str = "/api/resources/blockly/validate-toolbox",
    toolbox_save_url: str = "/api/resources/blockly/toolbox/save",
    practice_label: str = "",
    practice_kind: str = "",
    practice_url: str = "",
    practice_launch_url: str = "",
    task_goal: str = "",
    task_stage: str = "",
    task_hint: str = "",
    toolbox_switch_enabled: bool = True,
) -> str:
    runtime_config = {
        "workspaceUrl": workspace_url or "",
        "toolboxUrl": toolbox_url or "",
        "generatedPythonUrl": generated_python_url or "",
        "workspaceTitle": workspace_label or "Blockly 课堂模式",
        "practiceLabel": practice_label or "",
        "practiceKind": practice_kind or "",
        "practiceUrl": practice_url or "",
        "practiceLaunchUrl": practice_launch_url or "",
        "taskGoal": task_goal or "",
        "taskStage": task_stage or "",
        "taskHint": task_hint or "",
        "userRole": role or "",
        "rootToken": root_token or "",
        "workspaceRelPath": workspace_rel or "",
        "toolboxRelPath": toolbox_rel or "",
        "projectRoot": project_root or "",
        "toolboxSwitchEnabled": bool(toolbox_switch_enabled),
        "toolboxImportEnabled": bool(toolbox_switch_enabled),
        "xeduhubExecuteUrl": xeduhub_execute_url or "",
        "toolboxValidateUrl": toolbox_validate_url or "",
        "toolboxSaveUrl": toolbox_save_url or "",
        "defaultXEduHubToolbox": build_xeduhub_toolbox_definition("classification"),
        "xeduhubTaskRegistry": get_xeduhub_frontend_registry(),
    }
    runtime_config_json = json.dumps(runtime_config, ensure_ascii=False).replace("</", "<\\/")
    asset_urls = resolve_blockly_runtime_asset_urls()
    vite_client_tag = (
        f'<script type="module" src="{asset_urls["vite_client_url"]}"></script>'
        if asset_urls.get("vite_client_url")
        else ""
    )
    runtime_module_url = asset_urls["runtime_module_url"]
    page_title = workspace_label or "Blockly 课堂模式"
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
        <div class="title" id="workspaceLabel">Blockly 课堂模式</div>
        <div class="title-sub" id="workspaceMetaLabel">任务驱动课堂工作台</div>
      </div>
    </div>
    <div class="topbar-center">
      <button id="controlPanelToggleBtn" class="btn-ghost" type="button" aria-expanded="false">分类筛选</button>
      <div id="controlPanel" class="control-panel">
        <div class="control-panel-title">分类与扩展</div>
        <div class="control-panel-section">
          <div class="control-section-head">分类显示</div>
          <div id="groupDrawerBody" class="group-list"></div>
        </div>
        <div id="toolboxPackPanel" class="control-panel-section toolbox-pack-panel">
          <div class="toolbox-pack-head">
            <span>课程积木包</span>
            <button id="addPackBtn" class="toolbox-pack-add" type="button">+ 导入</button>
            <input id="addPackInput" type="file" accept=".zip,.json,.toolbox.json" style="display:none;" />
          </div>
          <div id="toolboxPackList" class="toolbox-pack-list"></div>
        </div>
      </div>
    </div>
    <div class="topbar-right">
      <button id="runXEduHubBtn" class="btn-primary">运行程序</button>
      <div id="toolbarQuickActions" class="toolbar-quick-actions" aria-label="常用操作"></div>
      <div class="toolbar-more">
        <button id="toolbarMoreBtn" class="btn-ghost" type="button" aria-expanded="false">操作</button>
        <div id="toolbarMoreMenu" class="toolbar-more-menu">
          <button id="openWorkspaceBtn" class="toolbar-more-item" type="button">打开文件</button>
          <button id="saveWorkspaceBtn" class="toolbar-more-item" type="button">保存文件</button>
          <input id="openWorkspaceInput" type="file" accept=".blockly.json,.json,.blockly.xml,.xml,application/json,text/xml" style="display:none;" />
          <button id="copyPythonBtn" class="toolbar-more-item" type="button">复制 Python</button>
          <button id="downloadPythonBtn" class="toolbar-more-item" type="button">下载 Python</button>
          <button id="resetWorkspaceBtn" class="toolbar-more-item" type="button">重置工作区</button>
          <a id="practiceBtn" class="toolbar-more-item" href="#" target="_blank" rel="noopener" style="display:none;">在 Jupyter 打开关联代码</a>
        </div>
      </div>
    </div>
  </div>
  <div id="blocklyLayout" class="layout">
    <section class="workspace-shell">
      <div class="workspace-canvas-card">
        <aside id="blocklySideNav" class="blockly-side-nav" aria-label="积木分类导航">
          <div id="blocklySideNavBody" class="blockly-side-nav-body"></div>
        </aside>
        <div id="blocklyDiv"></div>
        <button id="blocklyExtendFab" class="blockly-extend-fab" type="button" title="增加积木包">
          <span class="blockly-extend-fab-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14M7 7h10v10H7z" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </button>
        <div class="meta" id="toolboxLabel" hidden></div>
      </div>
    </section>
    <aside id="codeDock" class="workspace-sidecar">
      <button id="codeDockToggleBtn" class="code-dock-toggle" type="button" aria-label="收起右侧工作栏" aria-expanded="true">
        <span class="code-dock-toggle-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="m14.8 6.8-5.4 5.2 5.4 5.2" stroke="currentColor" stroke-width="2.05" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </button>
      <div class="workspace-sidecar-stack">
        <section class="panel code-panel">
          <div class="panel-head">
            <div class="panel-head-copy">
              <span>自动生成</span>
              <small>当前积木对应的 Python 代码</small>
            </div>
          </div>
          <div class="code-dock-body">
            <pre id="pythonCode"># 正在等待 Blockly 初始化</pre>
          </div>
        </section>
        <section id="outputPanel" class="panel output-panel side-output-panel">
          <div class="panel-head panel-head-muted">
            <div class="panel-head-copy">
              <span>终端</span>
              <small>显示本次运行输出与错误信息</small>
            </div>
            <span id="resultRunBadge" class="run-badge">未运行</span>
          </div>
          <div class="panel-subhead" hidden>实验证据</div>
          <div id="resultBox" class="output-body" data-state="idle">
            <div id="resultEvidence" class="result-evidence"></div>
          </div>
        </section>
      </div>
    </aside>
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
