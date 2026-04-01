# -*- coding: utf-8 -*-
"""
Resource / preview / Blockly runtime helpers.
"""

from __future__ import annotations

import base64
import json
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


def build_blockly_playground_html(
    *,
    workspace_url: str,
    toolbox_url: str,
    generated_python_url: str,
    workspace_label: str,
    project_root: str = "",
    xeduhub_execute_url: str = "/api/resources/blockly/xeduhub/execute",
    practice_label: str = "",
    practice_kind: str = "",
    practice_url: str = "",
    practice_launch_url: str = "",
    toolbox_switch_enabled: bool = True,
) -> str:
    title = json.dumps(workspace_label or "Blockly 实验")
    workspace_url_json = json.dumps(workspace_url or "")
    toolbox_url_json = json.dumps(toolbox_url or "")
    python_url_json = json.dumps(generated_python_url or "")
    practice_label_json = json.dumps(practice_label or "")
    practice_kind_json = json.dumps(practice_kind or "")
    practice_url_json = json.dumps(practice_url or "")
    practice_launch_url_json = json.dumps(practice_launch_url or "")
    project_root_json = json.dumps(project_root or "")
    toolbox_switch_enabled_json = json.dumps(bool(toolbox_switch_enabled))
    xeduhub_execute_url_json = json.dumps(xeduhub_execute_url or "")
    default_xeduhub_toolbox_json = json.dumps(build_xeduhub_toolbox_definition("classification"), ensure_ascii=False)
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{workspace_label or "Blockly 实验"}</title>
  <script src="https://unpkg.com/blockly/blockly.min.js"></script>
  <script src="https://unpkg.com/blockly/python_compressed.js"></script>
  <script src="https://unpkg.com/blockly/msg/zh-hans.js"></script>
  <script src="https://unpkg.com/jszip@3.10.1/dist/jszip.min.js"></script>
  <style>
    :root {{
      color-scheme: light;
      --bg: #f1f5f9;
      --bg-soft: #f8fafc;
      --panel: #ffffff;
      --panel-frost: rgba(255, 255, 255, 0.82);
      --line-soft: rgba(15, 23, 42, 0.08);
      --text: #1e293b;
      --text-muted: #64748b;
      --brand: #3b82f6;
      --brand-deep: #2563eb;
      --success: #16a34a;
      --danger: #dc2626;
      --radius-xl: 18px;
      --radius-lg: 14px;
      --radius-md: 10px;
      --shadow-soft: 0 12px 32px rgba(15, 23, 42, 0.06);
      --shadow-pop: 0 10px 24px rgba(59, 130, 246, 0.18);
      --anim: .2s ease;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: "SF Pro Text", "PingFang SC", "Segoe UI", "Microsoft YaHei", sans-serif;
      color: var(--text);
      background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
    }}
    .topbar {{
      position: relative;
      display: grid;
      grid-template-columns: minmax(220px, 1.2fr) auto minmax(280px, 1.2fr);
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      background: var(--panel-frost);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border-bottom: 1px solid var(--line-soft);
      z-index: 20;
    }}
    .topbar-left {{
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }}
    .title-dot {{
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: linear-gradient(135deg, #93c5fd, #3b82f6);
      box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.14);
      flex: 0 0 auto;
    }}
    .title-wrap {{
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }}
    .title {{
      font-size: 14px;
      font-weight: 800;
      letter-spacing: .01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.25;
      color: var(--text);
    }}
    .title-sub {{
      font-size: 11px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }}
    .topbar-center {{
      position: relative;
      display: inline-flex;
      justify-content: center;
    }}
    .topbar-right {{
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      min-width: 0;
    }}
    button, a.btn {{
      appearance: none;
      border: none;
      border-radius: 999px;
      padding: 8px 12px;
      text-decoration: none;
      cursor: pointer;
      font-size: 12px;
      font-weight: 700;
      transition: all var(--anim);
    }}
    .btn-ghost {{
      background: rgba(255, 255, 255, 0.7);
      color: var(--text);
      border: 1px solid rgba(148, 163, 184, 0.3);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.9) inset;
    }}
    .btn-ghost:hover {{
      background: rgba(255, 255, 255, 0.95);
      border-color: rgba(100, 116, 139, 0.34);
    }}
    .btn-primary {{
      color: #ffffff;
      border: 1px solid rgba(37, 99, 235, 0.55);
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      box-shadow: var(--shadow-pop);
    }}
    .btn-primary:hover {{
      transform: translateY(-1px);
      box-shadow: 0 14px 24px rgba(59, 130, 246, 0.24);
    }}
    .toolbar-more {{
      position: relative;
    }}
    .toolbar-more-menu {{
      position: absolute;
      right: 0;
      top: calc(100% + 8px);
      width: 220px;
      padding: 8px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 12px;
      box-shadow: var(--shadow-soft);
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transform: translateY(-4px);
      transition: opacity .15s ease, transform .15s ease, visibility .15s ease;
      z-index: 30;
    }}
    .toolbar-more-menu.open {{
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translateY(0);
    }}
    .toolbar-more-item {{
      width: 100%;
      text-align: left;
      border-radius: 8px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text);
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      text-decoration: none;
      transition: all var(--anim);
    }}
    .toolbar-more-item:hover {{
      background: #f1f5f9;
      border-color: #dce6f3;
    }}
    .control-panel {{
      position: absolute;
      top: calc(100% + 10px);
      left: 50%;
      transform: translateX(-50%) translateY(-4px);
      width: min(460px, 92vw);
      padding: 12px;
      border-radius: var(--radius-lg);
      border: 1px solid rgba(148, 163, 184, 0.28);
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(22px);
      -webkit-backdrop-filter: blur(22px);
      box-shadow: var(--shadow-soft);
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity var(--anim), transform var(--anim), visibility var(--anim);
      z-index: 40;
    }}
    .control-panel.open {{
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translateX(-50%) translateY(0);
    }}
    .control-panel-title {{
      font-size: 13px;
      font-weight: 800;
      margin-bottom: 10px;
      color: var(--text);
      letter-spacing: .01em;
    }}
    .control-panel-section {{
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 10px;
      padding: 10px;
      background: rgba(255, 255, 255, 0.75);
      margin-bottom: 8px;
    }}
    .control-panel-section:last-child {{
      margin-bottom: 0;
    }}
    .control-section-head {{
      font-size: 11px;
      color: var(--text-muted);
      font-weight: 800;
      letter-spacing: .04em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }}
    .toolbox-mode-switch {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }}
    .toolbox-mode-btn {{
      border-radius: 999px;
      border: 1px solid rgba(148, 163, 184, 0.28);
      background: rgba(248, 250, 252, 0.9);
      color: #334155;
      font-size: 12px;
      font-weight: 700;
      padding: 7px 10px;
      cursor: pointer;
    }}
    .toolbox-mode-btn.active {{
      color: #ffffff;
      border-color: rgba(37, 99, 235, 0.6);
      background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
      box-shadow: 0 8px 18px rgba(59, 130, 246, 0.18);
    }}
    .toolbox-pack-panel {{
      border: 0;
      border-radius: 0;
      background: transparent;
      padding: 0;
    }}
    .toolbox-pack-head {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 12px;
      font-weight: 700;
      color: #334155;
    }}
    .toolbox-pack-add {{
      border-radius: 999px;
      padding: 6px 10px;
      border: 1px solid rgba(148, 163, 184, 0.35);
      background: rgba(255, 255, 255, 0.95);
      color: #334155;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      transition: all var(--anim);
    }}
    .toolbox-pack-add:hover {{
      border-color: rgba(59, 130, 246, 0.4);
      color: #1d4ed8;
    }}
    .toolbox-pack-list {{
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 136px;
      overflow: auto;
    }}
    .toolbox-pack-item {{
      border-radius: 8px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      color: #334155;
      font-size: 11px;
      line-height: 1.35;
      padding: 5px 8px;
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }}
    .toolbox-pack-item small {{
      color: #64748b;
      font-size: 10px;
    }}
    .group-list {{
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 180px;
      overflow: auto;
    }}
    .group-item {{
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 8px 9px;
      display: flex;
      gap: 8px;
      align-items: flex-start;
      background: #ffffff;
    }}
    .group-item input {{
      margin-top: 2px;
    }}
    .group-item-main {{
      color: #1f2937;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.35;
    }}
    .group-item-sub {{
      color: #64748b;
      font-size: 11px;
      margin-top: 2px;
      line-height: 1.35;
    }}
    .layout {{
      display: grid;
      grid-template-columns: minmax(560px, 1.7fr) minmax(340px, .95fr);
      gap: 12px;
      padding: 10px 12px 12px;
      min-height: 0;
      height: 100%;
    }}
    .panel {{
      min-height: 0;
      background: var(--panel);
      border: 1px solid var(--line-soft);
      border-radius: var(--radius-xl);
      overflow: hidden;
      box-shadow: var(--shadow-soft);
    }}
    .canvas-panel {{
      display: flex;
      flex-direction: column;
      position: relative;
    }}
    #blocklyDiv {{
      flex: 1;
      min-height: 0;
      height: 100%;
      background: #f8fafc;
    }}
    .meta {{
      padding: 8px 12px;
      border-top: 1px solid rgba(148, 163, 184, 0.2);
      color: var(--text-muted);
      font-size: 12px;
    }}
    .insight-card {{
      display: flex;
      flex-direction: column;
      min-height: 0;
    }}
    .insight-head {{
      padding: 12px 14px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.22);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-size: 13px;
      font-weight: 800;
      color: #0f172a;
      background: rgba(248, 250, 252, 0.72);
    }}
    .run-badge {{
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 11px;
      font-weight: 700;
      border: 1px solid #cbd5e1;
      color: #475569;
      background: #f8fafc;
    }}
    .run-badge.is-success {{
      color: #166534;
      border-color: #86efac;
      background: #f0fdf4;
    }}
    .run-badge.is-error {{
      color: #991b1b;
      border-color: #fecaca;
      background: #fef2f2;
    }}
    .insight-section {{
      min-height: 0;
      display: flex;
      flex-direction: column;
    }}
    .section-head {{
      font-size: 11px;
      font-weight: 800;
      color: #475569;
      letter-spacing: .06em;
      text-transform: uppercase;
      padding: 10px 14px 0;
    }}
    .python-box {{
      margin: 8px 12px;
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 12px;
      background: #f8fafc;
      min-height: 240px;
      overflow: auto;
    }}
    .python-overlay {{
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(15, 23, 42, 0.18);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transition: opacity var(--anim), visibility var(--anim);
      z-index: 80;
    }}
    .python-overlay.open {{
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
    }}
    .python-overlay-card {{
      width: min(900px, 100%);
      max-height: min(82vh, 920px);
      display: flex;
      flex-direction: column;
      background: rgba(255, 255, 255, 0.94);
      border: 1px solid rgba(148, 163, 184, 0.22);
      border-radius: 20px;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
      overflow: hidden;
    }}
    .python-overlay-head {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(248, 250, 252, 0.88);
    }}
    .python-overlay-title {{
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
    }}
    .python-overlay-meta {{
      font-size: 12px;
      color: #64748b;
      margin-top: 2px;
    }}
    .python-overlay-body {{
      min-height: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 12px;
      background: #ffffff;
    }}
    .python-overlay .python-box {{
      margin: 0;
      min-height: 360px;
      flex: 1;
    }}
    #pythonCode {{
      margin: 0;
      padding: 14px;
      font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: pre-wrap;
      word-break: break-word;
      color: #0f172a;
    }}
    .tok-key {{ color: #7c3aed; font-weight: 700; }}
    .tok-string {{ color: #16a34a; }}
    .tok-comment {{ color: #64748b; font-style: italic; }}
    .result-section {{
      flex: 1;
      transition: flex var(--anim);
    }}
    .insight-card.has-run .result-section {{
      flex: 1.3;
    }}
    .result-box {{
      margin: 8px 12px 0;
      border: 1px solid rgba(148, 163, 184, 0.25);
      border-radius: 14px;
      background: #ffffff;
      min-height: 180px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }}
    .result-summary {{
      margin: 10px 12px 0;
      padding: 12px;
      border-radius: 10px;
      background: #f8fafc;
      border: 1px solid rgba(148, 163, 184, 0.22);
      color: #0f172a;
      font-size: 12px;
      line-height: 1.5;
    }}
    .result-summary strong {{
      display: block;
      font-size: 14px;
      margin-bottom: 2px;
      color: #111827;
    }}
    .result-summary small {{
      color: #64748b;
      font-size: 12px;
    }}
    .result-metrics {{
      margin: 8px 12px 0;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }}
    .result-metric-chip {{
      font-size: 11px;
      color: #1e3a8a;
      background: #dbeafe;
      border: 1px solid #bfdbfe;
      border-radius: 999px;
      padding: 3px 8px;
    }}
    .result-state {{
      padding: 10px 12px 12px;
      color: var(--text-muted);
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-line;
    }}
    .result-state.is-success {{ color: #166534; }}
    .result-state.is-error {{ color: #b91c1c; }}
    .result-image {{
      display: none;
      width: 100%;
      max-height: 220px;
      object-fit: contain;
      background: #f8fafc;
      border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    }}
    details.result-debug {{
      margin: 8px 12px 12px;
      border: 1px dashed rgba(148, 163, 184, 0.45);
      border-radius: 10px;
      overflow: hidden;
      background: #f8fafc;
    }}
    details.result-debug > summary {{
      cursor: pointer;
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 700;
      color: #334155;
      background: rgba(248, 250, 252, 0.9);
    }}
    .result-json {{
      margin: 0;
      padding: 12px;
      font: 11px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;
      white-space: pre-wrap;
      word-break: break-word;
      color: #334155;
    }}
    .blocklyMainBackground {{
      fill: #f8fafc !important;
      stroke: #e2e8f0 !important;
    }}
    .blocklyText {{
      font-family: "Nunito", "PingFang SC", "Segoe UI", sans-serif !important;
      font-size: 13px !important;
      font-weight: 700 !important;
    }}
    .blocklyDropDownText {{
      font-family: "Nunito", "PingFang SC", "Segoe UI", sans-serif !important;
      font-size: 12px !important;
      font-weight: 700 !important;
    }}
    .blocklyPath {{
      stroke-linejoin: round !important;
      stroke-width: 1.25px !important;
    }}
    .blocklyDraggable .blocklyPath {{
      filter: drop-shadow(0 2px 2px rgba(15, 23, 42, 0.12));
    }}
    .blocklySelected > .blocklyPath {{
      stroke: #1d4ed8 !important;
      stroke-width: 2.1px !important;
    }}
    .blocklyToolboxDiv {{
      background: #f8fafc !important;
      border-right: 1px solid #e2e8f0 !important;
      box-shadow: inset -1px 0 0 rgba(148, 163, 184, 0.22);
    }}
    .blocklyTreeRoot {{
      padding: 8px 6px !important;
    }}
    .blocklyTreeRow {{
      min-height: 34px !important;
      display: flex !important;
      align-items: center !important;
      padding: 0 10px !important;
      border-radius: 8px !important;
      margin: 2px 4px !important;
      transition: background var(--anim) !important;
    }}
    .blocklyTreeLabel {{
      font-size: 13px !important;
      font-weight: 700 !important;
      color: #334155 !important;
    }}
    .blocklyToolboxLabel {{
      color: #64748b !important;
      font-size: 11px !important;
      font-weight: 800 !important;
      letter-spacing: .04em;
      text-transform: uppercase;
      padding: 8px 10px 4px !important;
      opacity: .95;
    }}
    .blocklyTreeRow:hover {{
      background: rgba(148, 163, 184, 0.16) !important;
    }}
    .blocklyTreeSelected {{
      background: #eaf2ff !important;
      box-shadow: inset 0 0 0 1px #cfe0ff !important;
    }}
    .blocklyTreeSelected .blocklyTreeLabel {{
      color: #1d4ed8 !important;
    }}
    .blocklyFlyoutBackground {{
      fill: #f8fafc !important;
      stroke: #dbe5f1 !important;
      stroke-width: 1 !important;
    }}
    .blocklyScrollbarHandle {{
      fill: rgba(100, 116, 139, 0.35) !important;
    }}
    .blockly-extend-fab {{
      position: absolute;
      left: 12px;
      bottom: 44px;
      width: 38px;
      height: 38px;
      border-radius: 999px;
      border: 1px solid rgba(59, 130, 246, 0.35);
      background: rgba(255, 255, 255, 0.92);
      color: #1d4ed8;
      box-shadow: 0 8px 20px rgba(30, 64, 175, 0.18);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      line-height: 1;
      font-weight: 500;
      cursor: pointer;
      transition: all var(--anim);
      z-index: 16;
    }}
    .blockly-extend-fab:hover {{
      background: #eff6ff;
      transform: translateY(-1px);
      box-shadow: 0 12px 24px rgba(37, 99, 235, 0.24);
    }}
    .blockly-extend-fab:disabled {{
      opacity: 0.55;
      cursor: not-allowed;
      box-shadow: none;
      transform: none;
    }}
    @media (max-width: 1180px) {{
      .layout {{
        grid-template-columns: 1fr;
      }}
      .insight-card {{
        min-height: 520px;
      }}
      #blocklyDiv {{
        min-height: 460px;
      }}
    }}
    @media (max-width: 860px) {{
      .topbar {{
        grid-template-columns: 1fr;
        gap: 8px;
      }}
      .topbar-center {{
        justify-content: flex-start;
      }}
      .topbar-right {{
        justify-content: flex-start;
        flex-wrap: wrap;
      }}
      .control-panel {{
        left: 0;
        transform: translateY(-4px);
      }}
      .control-panel.open {{
        transform: translateY(0);
      }}
      .python-box {{
        min-height: 180px;
      }}
      .python-overlay {{
        padding: 12px;
      }}
      .python-overlay-card {{
        max-height: 90vh;
      }}
      .blockly-extend-fab {{
        bottom: 40px;
      }}
    }}
  </style>
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
      <button id="blocklyExtendFab" class="blockly-extend-fab" type="button" title="导入积木扩展包">+</button>
      <div class="meta" id="toolboxLabel">正在加载工作区…</div>
    </div>
    <div id="insightCard" class="panel insight-card">
      <div class="insight-head">
        <span>教学属性面板</span>
        <span id="resultRunBadge" class="run-badge">等待运行</span>
      </div>
      <section id="resultSection" class="insight-section result-section">
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
    const workspaceUrl = {workspace_url_json};
    const toolboxUrl = {toolbox_url_json};
    const generatedPythonUrl = {python_url_json};
    const workspaceTitle = {title};
    const practiceLabel = {practice_label_json};
    const practiceKind = {practice_kind_json};
    const practiceUrl = {practice_url_json};
    const practiceLaunchUrl = {practice_launch_url_json};
    const projectRoot = {project_root_json};
    const toolboxSwitchEnabled = {toolbox_switch_enabled_json};
    const xeduhubExecuteUrl = {xeduhub_execute_url_json};
    const defaultXEduHubToolbox = {default_xeduhub_toolbox_json};
    let workspace = null;
    let initialSerialized = null;
    let toolboxVariants = {{
      official: null,
      course: null,
      hasCourseCustom: false,
      customPackCount: 0,
    }};
    let toolboxMode = "official";
    let toolboxPacks = [];
    let categoryVisibility = {{}};
    const categoryColors = {{}};
    const categoryNotes = {{}};
    let toolbarOverflowState = {{ menuOpen: false }};
    let panelCollapsedState = {{ debugOpen: false }};
    let controlPanelState = {{ open: false }};
    let codePanelVisible = false;
    let resultRunState = {{ hasRun: false }};
    function defineXEduHubBlocks() {{
      Blockly.defineBlocksWithJsonArray([
        {{ "type":"xeduhub_set_input","message0":"选择输入图片 %1","args0":[{{"type":"field_input","name":"INPUT","text":"demo.jpg"}}],"previousStatement":null,"nextStatement":null,"colour":"#FF9A76" }},
        {{ "type":"xeduhub_classify_run","message0":"图像分类推理（模型 %1）","args0":[{{"type":"field_input","name":"MODEL","text":"resnet18"}}],"previousStatement":null,"nextStatement":null,"colour":"#7C4DFF" }},
        {{ "type":"xeduhub_detect_run","message0":"目标检测推理（模型 %1）","args0":[{{"type":"field_input","name":"MODEL","text":"yolov5"}}],"previousStatement":null,"nextStatement":null,"colour":"#7C4DFF" }},
        {{ "type":"xeduhub_ocr_run","message0":"OCR 推理（模型 %1）","args0":[{{"type":"field_input","name":"MODEL","text":"dbnet"}}],"previousStatement":null,"nextStatement":null,"colour":"#7C4DFF" }},
        {{ "type":"xeduhub_show_result_card","message0":"显示结果卡片 标题 %1","args0":[{{"type":"field_input","name":"TITLE","text":"推理结果"}}],"previousStatement":null,"nextStatement":null,"colour":"#FF6B6B" }},
        {{ "type":"xeduhub_show_result_image","message0":"显示结果图","previousStatement":null,"nextStatement":null,"colour":"#FF6B6B" }},
        {{ "type":"xeduhub_run_and_record","message0":"运行并记录结论","previousStatement":null,"nextStatement":null,"colour":"#FF8A65" }},
        {{ "type":"xeduhub_clear_result","message0":"清空结果","previousStatement":null,"nextStatement":null,"colour":"#FFB199" }},
        {{ "type":"xeduhub_set_model","message0":"设置模型名 %1","args0":[{{"type":"field_input","name":"MODEL","text":"resnet18"}}],"previousStatement":null,"nextStatement":null,"colour":"#9575CD" }},
        {{ "type":"xeduhub_set_threshold","message0":"设置置信度阈值 %1","args0":[{{"type":"field_input","name":"THRESHOLD","text":"0.35"}}],"previousStatement":null,"nextStatement":null,"colour":"#B39DDB" }},
        {{ "type":"xeduhub_set_topk","message0":"设置最大输出数 %1","args0":[{{"type":"field_input","name":"TOPK","text":"3"}}],"previousStatement":null,"nextStatement":null,"colour":"#B39DDB" }},
        {{ "type":"xeduhub_create_flow","message0":"创建任务流程 任务 %1 模型 %2","args0":[{{"type":"field_dropdown","name":"TASK","options":[["图像分类","classification"],["目标检测","detection"],["OCR","ocr"],["图像分割","segmentation"],["关键点识别","pose"],["内容生成","generation"],["全景感知","panoptic"],["多模态","multimodal"],["深度估计","depth"],["自定义","custom"]]}},{{"type":"field_input","name":"MODEL","text":"resnet18"}}],"previousStatement":null,"nextStatement":null,"colour":"#7C4DFF" }},
        {{ "type":"xeduhub_flow_set_input","message0":"流程设置输入 %1","args0":[{{"type":"field_input","name":"INPUT","text":"demo.jpg"}}],"previousStatement":null,"nextStatement":null,"colour":"#9575CD" }},
        {{ "type":"xeduhub_flow_execute","message0":"执行流程并保存到 %1","args0":[{{"type":"field_input","name":"RESULT","text":"lab_result"}}],"previousStatement":null,"nextStatement":null,"colour":"#7C4DFF" }},
        {{ "type":"xeduhub_get_result_field","message0":"读取结果 %1 字段 %2","args0":[{{"type":"field_input","name":"RESULT","text":"lab_result"}},{{"type":"field_dropdown","name":"FIELD","options":[["label","label"],["score","score"],["boxes","boxes"],["text","text"],["raw","raw"]]}}],"output":null,"colour":"#B39DDB" }},
        {{ "type":"xeduhub_raw_create_workflow","message0":"底层：创建 workflow(task=%1)","args0":[{{"type":"field_dropdown","name":"TASK","options":[["图像分类","classification"],["目标检测","detection"],["OCR","ocr"],["图像分割","segmentation"],["关键点识别","pose"],["内容生成","generation"],["全景感知","panoptic"],["多模态","multimodal"],["深度估计","depth"],["自定义","custom"]]}}],"previousStatement":null,"nextStatement":null,"colour":"#AB47BC" }},
        {{ "type":"xeduhub_raw_inference","message0":"底层：inference(data=%1, model=%2)","args0":[{{"type":"field_input","name":"INPUT","text":"demo.jpg"}},{{"type":"field_input","name":"MODEL","text":"resnet18"}}],"previousStatement":null,"nextStatement":null,"colour":"#AB47BC" }},
        {{ "type":"xeduhub_read_raw","message0":"读取原始输出","output":null,"colour":"#CE93D8" }},
        {{ "type":"xeduhub_debug_print","message0":"打印中间变量 %1","args0":[{{"type":"field_input","name":"VAR","text":"lab_result"}}],"previousStatement":null,"nextStatement":null,"colour":"#BA68C8" }},
        {{ "type":"xeduhub_catch_error","message0":"捕获错误并显示（错误变量 %1）","args0":[{{"type":"field_input","name":"ERROR_VAR","text":"lab_error"}}],"message1":"尝试 %1","args1":[{{"type":"input_statement","name":"TRY"}}],"previousStatement":null,"nextStatement":null,"colour":"#8E24AA" }},
        {{ "type":"xeduhub_run_vision","message0":"兼容：任务 %1 模型 %2 输入 %3","args0":[{{"type":"field_dropdown","name":"TASK","options":[["图像分类","classification"],["目标检测","detection"],["OCR","ocr"],["图像分割","segmentation"],["关键点识别","pose"],["内容生成","generation"],["全景感知","panoptic"],["多模态","multimodal"],["深度估计","depth"],["自定义","custom"]]}},{{"type":"field_input","name":"MODEL","text":"resnet18"}},{{"type":"field_input","name":"INPUT","text":"demo.jpg"}}],"previousStatement":null,"nextStatement":null,"colour":"#00BFA6" }},
        {{ "type":"xeduhub_show_result","message0":"兼容：显示结果 标题 %1","args0":[{{"type":"field_input","name":"TITLE","text":"XEduHub 结果"}}],"previousStatement":null,"nextStatement":null,"colour":"#26C6DA" }},
        {{ "type":"xeduhub_print_status","message0":"兼容：打印运行状态","previousStatement":null,"nextStatement":null,"colour":"#4DD0E1" }},
        {{ "type":"xeduhub_create_workflow","message0":"兼容：创建 workflow 任务 %1 模型 %2","args0":[{{"type":"field_dropdown","name":"TASK","options":[["图像分类","classification"],["目标检测","detection"],["OCR","ocr"],["图像分割","segmentation"],["关键点识别","pose"],["内容生成","generation"],["全景感知","panoptic"],["多模态","multimodal"],["深度估计","depth"],["自定义","custom"]]}},{{"type":"field_input","name":"MODEL","text":"resnet18"}}],"previousStatement":null,"nextStatement":null,"colour":"#00ACC1" }},
        {{ "type":"xeduhub_execute_workflow","message0":"兼容：执行 workflow 结果 %1","args0":[{{"type":"field_input","name":"RESULT","text":"lab_result"}}],"previousStatement":null,"nextStatement":null,"colour":"#00BCD4" }}
      ]);

      const runPy = (task, modelExpr) => [
        "from XEdu.hub import Workflow as wf",
        `lab_task = ${{JSON.stringify(task)}}`,
        `lab_model = ${{modelExpr}}`,
        "lab_flow = wf(task=lab_task)",
        "lab_result = lab_flow.inference(data=lab_input, model=lab_model)",
      ].join("\\n") + "\\n";

      Blockly.Python.forBlock["xeduhub_set_input"] = function(block) {{
        return `lab_input = ${{JSON.stringify(block.getFieldValue("INPUT") || "demo.jpg")}}\\n`;
      }};
      Blockly.Python.forBlock["xeduhub_classify_run"] = (block) => runPy("classification", JSON.stringify(block.getFieldValue("MODEL") || "resnet18"));
      Blockly.Python.forBlock["xeduhub_detect_run"] = (block) => runPy("detection", JSON.stringify(block.getFieldValue("MODEL") || "yolov5"));
      Blockly.Python.forBlock["xeduhub_ocr_run"] = (block) => runPy("ocr", JSON.stringify(block.getFieldValue("MODEL") || "dbnet"));
      Blockly.Python.forBlock["xeduhub_show_result_card"] = (block) => `print(${{JSON.stringify(block.getFieldValue("TITLE") || "推理结果")}}, lab_result)\\n`;
      Blockly.Python.forBlock["xeduhub_show_result_image"] = () => "print('证据图可在结果面板查看')\\n";
      Blockly.Python.forBlock["xeduhub_run_and_record"] = () => "print('教学结论已记录')\\n";
      Blockly.Python.forBlock["xeduhub_clear_result"] = () => "lab_result = {{}}\\nlab_error = ''\\n";
      Blockly.Python.forBlock["xeduhub_set_model"] = (block) => `lab_model = ${{JSON.stringify(block.getFieldValue("MODEL") || "resnet18")}}\\n`;
      Blockly.Python.forBlock["xeduhub_set_threshold"] = (block) => `lab_threshold = ${{JSON.stringify(block.getFieldValue("THRESHOLD") || "0.35")}}\\n`;
      Blockly.Python.forBlock["xeduhub_set_topk"] = (block) => `lab_topk = ${{JSON.stringify(block.getFieldValue("TOPK") || "3")}}\\n`;
      Blockly.Python.forBlock["xeduhub_create_flow"] = (block) => `from XEdu.hub import Workflow as wf\\nlab_task = ${{JSON.stringify(block.getFieldValue("TASK") || "classification")}}\\nlab_model = ${{JSON.stringify(block.getFieldValue("MODEL") || "resnet18")}}\\nlab_flow = wf(task=lab_task)\\n`;
      Blockly.Python.forBlock["xeduhub_flow_set_input"] = (block) => `lab_input = ${{JSON.stringify(block.getFieldValue("INPUT") || "demo.jpg")}}\\n`;
      Blockly.Python.forBlock["xeduhub_flow_execute"] = (block) => `${{block.getFieldValue("RESULT") || "lab_result"}} = lab_flow.inference(data=lab_input, model=lab_model)\\n`;
      Blockly.Python.forBlock["xeduhub_get_result_field"] = function(block) {{
        const result = block.getFieldValue("RESULT") || "lab_result";
        const field = block.getFieldValue("FIELD") || "raw";
        if (field === "raw") return [`str(${{result}})`, Blockly.Python.ORDER_ATOMIC];
        return [`${{result}}.get(${{JSON.stringify(field)}}, '') if isinstance(${{result}}, dict) else ''`, Blockly.Python.ORDER_ATOMIC];
      }};
      Blockly.Python.forBlock["xeduhub_raw_create_workflow"] = (block) => `from XEdu.hub import Workflow as wf\\nlab_flow = wf(task=${{JSON.stringify(block.getFieldValue("TASK") || "classification")}})\\n`;
      Blockly.Python.forBlock["xeduhub_raw_inference"] = (block) => `lab_result = lab_flow.inference(data=${{JSON.stringify(block.getFieldValue("INPUT") || "demo.jpg")}}, model=${{JSON.stringify(block.getFieldValue("MODEL") || "resnet18")}})\\n`;
      Blockly.Python.forBlock["xeduhub_read_raw"] = () => ["str(lab_result)", Blockly.Python.ORDER_ATOMIC];
      Blockly.Python.forBlock["xeduhub_debug_print"] = (block) => `print(${{JSON.stringify(block.getFieldValue("VAR") || "lab_result")}})\\n`;
      Blockly.Python.forBlock["xeduhub_catch_error"] = (block) => {{
        const tryPart = Blockly.Python.statementToCode(block, "TRY") || "pass\\n";
        const errVar = block.getFieldValue("ERROR_VAR") || "lab_error";
        return `try:\\n${{Blockly.Python.prefixLines(tryPart, "  ")}}except Exception as e:\\n  ${{errVar}} = str(e)\\n  print('运行失败:', ${{errVar}})\\n`;
      }};
      Blockly.Python.forBlock["xeduhub_run_vision"] = (block) => {{
        const task = block.getFieldValue("TASK") || "classification";
        const model = block.getFieldValue("MODEL") || "resnet18";
        const input = block.getFieldValue("INPUT") || "demo.jpg";
        return `lab_input = ${{JSON.stringify(input)}}\\n` + runPy(task, JSON.stringify(model));
      }};
      Blockly.Python.forBlock["xeduhub_show_result"] = (block) => Blockly.Python.forBlock["xeduhub_show_result_card"](block);
      Blockly.Python.forBlock["xeduhub_print_status"] = () => "print('XEduHub workflow ready')\\n";
      Blockly.Python.forBlock["xeduhub_create_workflow"] = (block) => Blockly.Python.forBlock["xeduhub_create_flow"](block);
      Blockly.Python.forBlock["xeduhub_execute_workflow"] = (block) => Blockly.Python.forBlock["xeduhub_flow_execute"](block);
    }}
    async function fetchText(url) {{
      if (!url) return "";
      const res = await fetch(url);
      if (!res.ok) throw new Error("加载失败");
      return await res.text();
    }}
    function clone(obj) {{
      return JSON.parse(JSON.stringify(obj || {{}}));
    }}
    function normalizeCategoryMeta(toolbox) {{
      const copy = clone(toolbox);
      copy.pedagogy_level_default = copy.pedagogy_level_default || "ALL";
      (copy.contents || []).forEach((item) => {{
        if (!item || (item.kind !== "category" && item.kind !== "label")) return;
        if (!item.level) item.level = "ALL";
        if (typeof item.visible_by_default !== "boolean") item.visible_by_default = true;
      }});
      return copy;
    }}
    function validateToolboxPayload(toolbox) {{
      const errors = [];
      if (!toolbox || typeof toolbox !== "object") {{
        return {{ valid: false, errors: ["toolbox 必须是对象"] }};
      }}
      if (toolbox.kind !== "categoryToolbox") {{
        errors.push("toolbox.kind 必须是 categoryToolbox");
      }}
      if (!Array.isArray(toolbox.contents)) {{
        errors.push("toolbox.contents 必须是数组");
        return {{ valid: false, errors }};
      }}
      const unsafeInputPresetBlocks = new Set(["text_getSubstring", "text_changeCase"]);
      function validateInputNode(node, path) {{
        if (!node || typeof node !== "object") {{
          errors.push(`${{path}} 必须是对象`);
          return;
        }}
        if (!["block", "shadow"].includes(node.kind)) {{
          errors.push(`${{path}}.kind 必须是 block 或 shadow`);
          return;
        }}
        if (!String(node.type || "").trim()) {{
          errors.push(`${{path}}.type 不能为空`);
        }}
        if (node.inputs && typeof node.inputs !== "object") {{
          errors.push(`${{path}}.inputs 必须是对象`);
          return;
        }}
        Object.entries(node.inputs || {{}}).forEach(([key, child]) => {{
          if (!String(key || "").trim()) {{
            errors.push(`${{path}}.inputs 存在空 key`);
            return;
          }}
          validateInputNode(child, `${{path}}.inputs[${{key}}]`);
        }});
      }}
      function validateNode(node, path) {{
        if (!node || typeof node !== "object") {{
          errors.push(`${{path}} 必须是对象`);
          return;
        }}
        if (!["category", "block", "shadow", "label", "sep"].includes(node.kind)) {{
          errors.push(`${{path}}.kind 非法: ${{node.kind || ""}}`);
          return;
        }}
        if (node.kind === "category") {{
          if (!String(node.name || "").trim()) {{
            errors.push(`${{path}}.name 不能为空`);
          }}
          if (node.contents != null) {{
            if (!Array.isArray(node.contents)) {{
              errors.push(`${{path}}.contents 必须是数组`);
              return;
            }}
            node.contents.forEach((child, index) => validateNode(child, `${{path}}.contents[${{index}}]`));
          }}
          return;
        }}
        if (["block", "shadow"].includes(node.kind)) {{
          const blockType = String(node.type || "").trim();
          if (!blockType) {{
            errors.push(`${{path}}.type 不能为空`);
          }}
          if (node.inputs && typeof node.inputs !== "object") {{
            errors.push(`${{path}}.inputs 必须是对象`);
            return;
          }}
          if (node.fields && typeof node.fields !== "object") {{
            errors.push(`${{path}}.fields 必须是对象`);
          }}
          if (unsafeInputPresetBlocks.has(blockType) && node.inputs && Object.keys(node.inputs).length > 0) {{
            errors.push(`${{path}} 不允许为 ${{blockType}} 预设 inputs`);
          }}
          Object.entries(node.inputs || {{}}).forEach(([key, child]) => {{
            if (!String(key || "").trim()) {{
              errors.push(`${{path}}.inputs 存在空 key`);
              return;
            }}
            validateInputNode(child, `${{path}}.inputs[${{key}}]`);
          }});
        }}
      }}
      toolbox.contents.forEach((item, index) => validateNode(item, `contents[${{index}}]`));
      return {{ valid: errors.length === 0, errors }};
    }}
    function mergeToolboxes(baseToolbox, customToolbox) {{
      const base = normalizeCategoryMeta(baseToolbox && baseToolbox.kind === "categoryToolbox" ? baseToolbox : {{ kind: "categoryToolbox", contents: [] }});
      const custom = normalizeCategoryMeta(customToolbox && customToolbox.kind === "categoryToolbox" ? customToolbox : {{ kind: "categoryToolbox", contents: [] }});
      const merged = clone(base);
      const byName = new Map((merged.contents || []).map((item) => [item?.name || "", item]));
      (custom.contents || []).forEach((item) => {{
        if (!item || item.kind !== "category") return;
        const name = item.name || "";
        if (!name) return;
        if (byName.has(name)) {{
          const existing = byName.get(name);
          existing.level = item.level || existing.level;
          if (typeof item.visible_by_default === "boolean") existing.visible_by_default = item.visible_by_default;
          if (Array.isArray(item.contents) && item.contents.length > 0) existing.contents = item.contents;
        }} else {{
          merged.contents.push(item);
          byName.set(name, item);
        }}
      }});
      // 安全兜底：确保 L1 必备分类和积木不被自定义移除
      const requiredNames = new Set(["核心积木", "L1 入门闭环", "XEduHub 教学", "基础逻辑", "拓展积木"]);
      base.contents.forEach((item) => {{
        if (!item || item.kind !== "category") return;
        if (!requiredNames.has(item.name)) return;
        const exists = (merged.contents || []).find((c) => c?.name === item.name);
        if (!exists) {{
          merged.contents.push(item);
          return;
        }}
        const requiredTypes = new Set((item.contents || []).map((block) => block?.type).filter(Boolean));
        const existingTypes = new Set((exists.contents || []).map((block) => block?.type).filter(Boolean));
        (item.contents || []).forEach((block) => {{
          if (!block?.type || existingTypes.has(block.type)) return;
          exists.contents = exists.contents || [];
          exists.contents.push(block);
        }});
      }});
      return merged;
    }}
    const scratchLikeTheme = Blockly.Theme.defineTheme("xedu_scratch_like", {{
      base: Blockly.Themes.Classic,
      componentStyles: {{
        workspaceBackgroundColour: "#f8fafc",
        toolboxBackgroundColour: "#f8fafc",
        toolboxForegroundColour: "#334155",
        flyoutBackgroundColour: "#f8fafc",
        flyoutForegroundColour: "#334155",
        flyoutOpacity: 1,
        scrollbarColour: "#94a3b8",
        insertionMarkerColour: "#3b82f6",
        insertionMarkerOpacity: 0.35,
        markerColour: "#1d4ed8",
        cursorColour: "#1d4ed8",
      }},
      fontStyle: {{
        family: "\"Nunito\", \"PingFang SC\", \"Segoe UI\", sans-serif",
        weight: "700",
        size: 13,
      }},
      startHats: true,
    }});
    function getActiveToolbox() {{
      const activeToolbox =
        (toolboxMode === "course" && toolboxVariants?.course)
          ? toolboxVariants.course
          : (toolboxVariants?.official || normalizeCategoryMeta(defaultXEduHubToolbox));
      const copy = clone(activeToolbox);
      copy.contents = (copy.contents || []).filter((item) => {{
        if (!item) return false;
        if (item.kind === "label") return true;
        if (item.kind !== "category") return false;
        const name = String(item.name || "").trim();
        if (!name) return true;
        if (!(name in categoryVisibility)) return true;
        return Boolean(categoryVisibility[name]);
      }});
      return copy;
    }}
    function collectCategoryNames(toolbox) {{
      return (toolbox?.contents || [])
        .filter((item) => item && item.kind === "category" && item.name)
        .map((item) => String(item.name).trim())
        .filter(Boolean);
    }}
    function resetCategoryVisibility(toolbox) {{
      const contents = toolbox?.contents || [];
      const nextVis = {{}};
      contents.forEach((item) => {{
        if (item && item.kind === "category" && item.name) {{
          const name = String(item.name).trim();
          if (name in categoryVisibility) {{
            nextVis[name] = categoryVisibility[name];
          }} else {{
            nextVis[name] = typeof item.visible_by_default === "boolean" ? item.visible_by_default : true;
          }}
          if (item.colour) categoryColors[name] = item.colour;
          if (item.description) categoryNotes[name] = item.description;
        }}
      }});
      categoryVisibility = nextVis;
    }}
    function renderGroupDrawer() {{
      const body = document.getElementById("groupDrawerBody");
      if (!body) return;
      const sourceToolbox =
        (toolboxMode === "course" && toolboxVariants?.course)
          ? toolboxVariants.course
          : (toolboxVariants?.official || normalizeCategoryMeta(defaultXEduHubToolbox));
      const names = collectCategoryNames(sourceToolbox);
      body.innerHTML = names.map((name, index) => {{
        const checked = categoryVisibility[name] !== false ? "checked" : "";
        const note = categoryNotes[name] || "通用工具积木";
        const inputId = `group-item-${{index}}`;
        return `
          <label class="group-item" for="${{inputId}}">
            <input id="${{inputId}}" type="checkbox" data-group-name="${{name}}" ${{checked}} />
            <div>
              <div class="group-item-main">${{name}}</div>
              <div class="group-item-sub">${{note}}</div>
            </div>
          </label>
        `;
      }}).join("");
      body.querySelectorAll("input[data-group-name]").forEach((input) => {{
        input.addEventListener("change", () => {{
          const name = String(input.getAttribute("data-group-name") || "").trim();
          if (!name) return;
          categoryVisibility[name] = Boolean(input.checked);
          if (workspace) {{
            workspace.updateToolbox(getActiveToolbox());
            styleToolboxCategoryRows();
          }}
        }});
      }});
    }}
    function setControlPanelOpen(open) {{
      controlPanelState.open = Boolean(open);
      const panel = document.getElementById("controlPanel");
      const button = document.getElementById("controlPanelToggleBtn");
      if (panel) {{
        panel.classList.toggle("open", controlPanelState.open);
      }}
      if (button) {{
        button.setAttribute("aria-expanded", controlPanelState.open ? "true" : "false");
      }}
    }}
    function setMoreMenuOpen(nextOpen) {{
      toolbarOverflowState.menuOpen = Boolean(nextOpen);
      const menu = document.getElementById("toolbarMoreMenu");
      const button = document.getElementById("toolbarMoreBtn");
      if (!menu) return;
      menu.classList.toggle("open", toolbarOverflowState.menuOpen);
      if (button) {{
        button.setAttribute("aria-expanded", toolbarOverflowState.menuOpen ? "true" : "false");
        button.textContent = toolbarOverflowState.menuOpen ? "导出 ▴" : "导出 ▾";
      }}
    }}
    function setCodePanelVisible(visible) {{
      codePanelVisible = Boolean(visible);
      const overlay = document.getElementById("pythonOverlay");
      const button = document.getElementById("toggleCodePanelBtn");
      if (overlay) {{
        overlay.classList.toggle("open", codePanelVisible);
      }}
      if (button) {{
        button.textContent = codePanelVisible ? "关闭代码" : "查看代码";
      }}
    }}
    function hexToRgba(hex, alpha) {{
      const text = String(hex || "").replace("#", "");
      if (!/^[0-9a-fA-F]{6}$/.test(text)) return `rgba(79,107,255,${{alpha}})`;
      const red = parseInt(text.slice(0, 2), 16);
      const green = parseInt(text.slice(2, 4), 16);
      const blue = parseInt(text.slice(4, 6), 16);
      return `rgba(${{red}}, ${{green}}, ${{blue}}, ${{alpha}})`;
    }}
    function styleToolboxCategoryRows() {{
      document.querySelectorAll(".blocklyTreeRow").forEach((row) => {{
        const label = row.querySelector(".blocklyTreeLabel")?.textContent?.trim() || "";
        const color = categoryColors[label];
        row.style.borderLeft = "4px solid transparent";
        row.style.boxShadow = "";
        row.style.backgroundColor = "";
        if (!color) return;
        row.style.borderLeft = `4px solid ${{color}}`;
        if (row.classList.contains("blocklyTreeSelected")) {{
          row.style.backgroundColor = hexToRgba(color, 0.22);
          row.style.boxShadow = `inset 0 0 0 1px ${{hexToRgba(color, 0.34)}}`;
        }} else {{
          row.style.backgroundColor = hexToRgba(color, 0.10);
        }}
      }});
    }}
    function syncToolboxModeButtons() {{
      const officialBtn = document.getElementById("toolboxOfficialBtn");
      const courseBtn = document.getElementById("toolboxCourseBtn");
      if (officialBtn) officialBtn.classList.toggle("active", toolboxMode === "official");
      if (courseBtn) courseBtn.classList.toggle("active", toolboxMode === "course");
    }}
    function syncToolboxMeta() {{
      const label = document.getElementById("toolboxLabel");
      if (!label) return;
      if (toolboxMode === "course" && toolboxVariants.hasCourseCustom) {{
        label.textContent = "当前：课程包积木";
      }} else {{
        label.textContent = "当前：官方积木";
      }}
    }}
    function buildToolboxPackList() {{
      const packs = [{{
        name: "官方课堂积木",
        source: "平台",
      }}];
      if (toolboxVariants.hasCourseCustom) {{
        packs.push({{
          name: "课程包积木",
          source: "课程",
        }});
      }}
      const extraCount = Number(toolboxVariants.customPackCount || 0);
      for (let index = 0; index < extraCount; index += 1) {{
        packs.push({{
          name: `扩展积木包 ${{index + 1}}`,
          source: "导入",
        }});
      }}
      return packs;
    }}
    function renderToolboxPacks() {{
      toolboxPacks = buildToolboxPackList();
      const list = document.getElementById("toolboxPackList");
      if (!list) return;
      list.innerHTML = toolboxPacks
        .map((pack) => `<div class="toolbox-pack-item"><span>${{pack.name}}</span><small>${{pack.source}}</small></div>`)
        .join("");
    }}
    function switchToolboxMode(mode) {{
      if (!toolboxSwitchEnabled) return;
      const nextMode = mode === "course" && toolboxVariants.hasCourseCustom ? "course" : "official";
      if (toolboxMode === nextMode) return;
      toolboxMode = nextMode;
      const sourceToolbox =
        (toolboxMode === "course" && toolboxVariants?.course)
          ? toolboxVariants.course
          : (toolboxVariants?.official || normalizeCategoryMeta(defaultXEduHubToolbox));
      resetCategoryVisibility(sourceToolbox);
      syncToolboxModeButtons();
      if (workspace) {{
        workspace.updateToolbox(getActiveToolbox());
        styleToolboxCategoryRows();
      }}
      renderGroupDrawer();
      syncToolboxMeta();
    }}
    function escapeHtml(text) {{
      return String(text || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }}
    const pythonKeywords = new Set([
      "from", "import", "as", "if", "elif", "else", "for", "while", "try", "except", "finally",
      "def", "class", "return", "with", "in", "is", "and", "or", "not", "None", "True", "False",
      "pass", "break", "continue", "lambda", "yield", "global", "nonlocal", "print"
    ]);
    function renderPythonHighlighted(code) {{
      const source = String(code || "");
      let html = "";
      let index = 0;
      while (index < source.length) {{
        const char = source[index];
        if (char === "#") {{
          let end = index;
          while (end < source.length && source[end] !== "\\n") end += 1;
          html += `<span class="tok-comment">${{escapeHtml(source.slice(index, end))}}</span>`;
          index = end;
          continue;
        }}
        if (char === "'" || char === '"') {{
          const quote = char;
          let end = index + 1;
          while (end < source.length) {{
            if (source[end] === "\\\\") {{
              end += 2;
              continue;
            }}
            if (source[end] === quote) {{
              end += 1;
              break;
            }}
            end += 1;
          }}
          html += `<span class="tok-string">${{escapeHtml(source.slice(index, end))}}</span>`;
          index = end;
          continue;
        }}
        if (/[A-Za-z_]/.test(char)) {{
          let end = index + 1;
          while (end < source.length && /[A-Za-z0-9_]/.test(source[end])) end += 1;
          const word = source.slice(index, end);
          if (pythonKeywords.has(word)) {{
            html += `<span class="tok-key">${{escapeHtml(word)}}</span>`;
          }} else {{
            html += escapeHtml(word);
          }}
          index = end;
          continue;
        }}
        html += escapeHtml(char);
        index += 1;
      }}
      return html;
    }}
    function setPythonCode(code) {{
      const el = document.getElementById("pythonCode");
      if (!el) return;
      const raw = String(code || "");
      el.dataset.raw = raw;
      el.innerHTML = renderPythonHighlighted(raw);
    }}
    function getPythonRaw() {{
      const el = document.getElementById("pythonCode");
      if (!el) return "";
      return String(el.dataset.raw || el.textContent || "");
    }}
    function updatePython() {{
      if (!workspace) return;
      const python = Blockly.Python.workspaceToCode(workspace) || "# 在左侧拖入积木开始编程\\nlab_input = 'demo.jpg'";
      setPythonCode(python);
    }}
    async function loadToolboxes() {{
      const official = normalizeCategoryMeta(defaultXEduHubToolbox);
      if (!toolboxUrl) {{
        return {{
          official,
          course: official,
          hasCourseCustom: false,
          customPackCount: 0,
        }};
      }}
      try {{
        const custom = JSON.parse(await fetchText(toolboxUrl));
        const check = validateToolboxPayload(custom);
        if (!check.valid) {{
          throw new Error(`课程 toolbox 非法：${{check.errors[0] || "未知错误"}}`);
        }}
        const packs = Array.isArray(custom?.packs) ? custom.packs : [];
        return {{
          official,
          course: mergeToolboxes(defaultXEduHubToolbox, custom),
          hasCourseCustom: true,
          customPackCount: packs.length,
        }};
      }} catch (_) {{
        return {{
          official,
          course: official,
          hasCourseCustom: false,
          customPackCount: 0,
        }};
      }}
    }}
    function extractXEduHubSpec() {{
      if (!workspace) return null;
      const spec = {{ project_root: projectRoot }};
      const blocks = workspace.getAllBlocks(false);
      for (const block of blocks) {{
        if (block.type === "xeduhub_set_input" || block.type === "xeduhub_flow_set_input") {{
          spec.input = block.getFieldValue("INPUT") || "";
        }}
        if (block.type === "xeduhub_classify_run") {{ spec.task = "classification"; spec.model = block.getFieldValue("MODEL") || "resnet18"; spec.mode = "high_level"; }}
        if (block.type === "xeduhub_detect_run") {{ spec.task = "detection"; spec.model = block.getFieldValue("MODEL") || "yolov5"; spec.mode = "high_level"; }}
        if (block.type === "xeduhub_ocr_run") {{ spec.task = "ocr"; spec.model = block.getFieldValue("MODEL") || "dbnet"; spec.mode = "high_level"; }}
        if (block.type === "xeduhub_run_vision") {{
          spec.task = block.getFieldValue("TASK") || "classification";
          spec.model = block.getFieldValue("MODEL") || "resnet18";
          spec.input = spec.input || block.getFieldValue("INPUT") || "";
          spec.mode = "high_level";
        }}
        if (block.type === "xeduhub_create_flow") {{
          spec.task = block.getFieldValue("TASK") || "classification";
          spec.model = block.getFieldValue("MODEL") || spec.model || "resnet18";
          spec.mode = "workflow";
        }}
        if (block.type === "xeduhub_create_workflow") {{
          spec.task = block.getFieldValue("TASK") || "classification";
          spec.model = block.getFieldValue("MODEL") || spec.model || "resnet18";
          spec.mode = "workflow";
        }}
        if (block.type === "xeduhub_set_model") {{
          spec.model = block.getFieldValue("MODEL") || spec.model || "resnet18";
        }}
      }}
      if (spec.task || spec.input) {{
        return spec;
      }}
      return null;
    }}
    function hasRunnableFlow() {{
      if (!workspace) return false;
      const runnableTypes = new Set([
        "xeduhub_classify_run",
        "xeduhub_detect_run",
        "xeduhub_ocr_run",
        "xeduhub_run_vision",
        "xeduhub_create_flow",
        "xeduhub_create_workflow",
      ]);
      return workspace.getAllBlocks(false).some((block) => runnableTypes.has(block.type));
    }}
    function updateResultView(payload) {{
      const stateEl = document.getElementById("resultState");
      const jsonEl = document.getElementById("resultJson");
      const summaryEl = document.getElementById("resultSummary");
      const metricsEl = document.getElementById("resultMetrics");
      const imageEl = document.getElementById("resultImage");
      const runBadge = document.getElementById("resultRunBadge");
      const insightCard = document.getElementById("insightCard");
      const success = Boolean(payload && payload.success);
      resultRunState.hasRun = true;
      if (insightCard) {{
        insightCard.classList.add("has-run");
      }}
      if (runBadge) {{
        runBadge.classList.remove("is-success", "is-error");
        runBadge.classList.add(success ? "is-success" : "is-error");
        runBadge.textContent = success ? "运行成功" : "运行失败";
      }}
      stateEl.className = "result-state " + (success ? "is-success" : "is-error");
      stateEl.textContent = payload?.message || (success ? "执行完成" : "执行失败");
      const summary = payload?.result_summary || {{}};
      const headline = summary?.headline || "暂无结论";
      const metrics = Array.isArray(summary?.metrics) ? summary.metrics : [];
      const hints = Array.isArray(summary?.hints) ? summary.hints : [];
      const subline = hints.length > 0 ? hints[0] : (success ? "运行完成" : "请检查输入或模型配置");
      summaryEl.innerHTML = `<strong>${{headline}}</strong><small>${{subline}}</small>`;
      if (metricsEl) {{
        if (metrics.length > 0) {{
          metricsEl.innerHTML = metrics
            .slice(0, 4)
            .map((metric) => `<span class="result-metric-chip">${{metric.label || "指标"}}: ${{metric.value ?? "-"}}</span>`)
            .join("");
          metricsEl.style.display = "flex";
        }} else {{
          metricsEl.innerHTML = "";
          metricsEl.style.display = "none";
        }}
      }}
      jsonEl.textContent = JSON.stringify(payload?.result ?? {{}}, null, 2);
      const imageData = payload?.result_artifacts?.preview_image || payload?.artifacts?.image_data || "";
      if (imageData) {{
        imageEl.src = imageData;
        imageEl.style.display = "block";
      }} else {{
        imageEl.removeAttribute("src");
        imageEl.style.display = "none";
      }}
    }}
    async function executeXEduHub() {{
      const spec = extractXEduHubSpec();
      if (!spec || !hasRunnableFlow()) {{
        updateResultView({{
          success: false,
          message: "当前工作区里还没有 XEduHub 积木流程，请先拖入相关积木。",
          result: {{}},
          artifacts: {{}}
        }});
        return;
      }}
      const runBtn = document.getElementById("runXEduHubBtn");
      runBtn.disabled = true;
      runBtn.textContent = "运行中...";
      try {{
        const response = await fetch(xeduhubExecuteUrl, {{
          method: "POST",
          headers: {{ "Content-Type": "application/json" }},
          body: JSON.stringify({{
            code: getPythonRaw(),
            spec,
            project_root: projectRoot,
          }})
        }});
        const payload = await response.json();
        updateResultView(payload);
      }} catch (error) {{
        updateResultView({{
          success: false,
          message: error?.message || "执行失败",
          result: {{ error: String(error || "") }},
          artifacts: {{}}
        }});
      }} finally {{
        runBtn.disabled = false;
        runBtn.textContent = "运行程序";
      }}
    }}
    async function init() {{
      defineXEduHubBlocks();
      toolboxVariants = await loadToolboxes();
      resetCategoryVisibility(toolboxVariants?.official || normalizeCategoryMeta(defaultXEduHubToolbox));
      workspace = Blockly.inject("blocklyDiv", {{
        toolbox: getActiveToolbox(),
        renderer: "zelos",
        theme: scratchLikeTheme,
        zoom: {{
          controls: true,
          wheel: true,
          startScale: 1.05,
          maxScale: 2.0,
          minScale: 0.5,
          scaleSpeed: 1.1,
        }},
        move: {{
          scrollbars: true,
          drag: true,
          wheel: true,
        }},
      }});
      workspace.addChangeListener(Blockly.Events.disableOrphans);
      if (workspaceUrl) {{
        const workspaceText = await fetchText(workspaceUrl);
        const trimmed = workspaceText.trim();
        initialSerialized = {{ kind: trimmed.startsWith("<xml") ? "xml" : "json", value: trimmed }};
        if (initialSerialized.kind === "xml") {{
          const xml = Blockly.utils.xml.textToDom(trimmed);
          Blockly.Xml.domToWorkspace(xml, workspace);
        }} else {{
          const state = JSON.parse(trimmed);
          Blockly.serialization.workspaces.load(state, workspace);
        }}
      }}
      workspace.addChangeListener(() => updatePython());
      workspace.addChangeListener((event) => {{
        if (event?.type === "toolbox_item_select") styleToolboxCategoryRows();
      }});
      document.getElementById("workspaceLabel").textContent = workspaceTitle || "当前 Blockly 练习";
      const controlPanelToggleBtn = document.getElementById("controlPanelToggleBtn");
      const toolboxModeSwitch = document.getElementById("toolboxModeSwitch");
      const toolboxPackPanel = document.getElementById("toolboxPackPanel");
      const blocklyExtendFab = document.getElementById("blocklyExtendFab");
      if (controlPanelToggleBtn) {{
        controlPanelToggleBtn.style.display = toolboxSwitchEnabled ? "inline-flex" : "none";
      }}
      if (toolboxModeSwitch) {{
        toolboxModeSwitch.style.display = toolboxVariants.hasCourseCustom ? "grid" : "none";
      }}
      if (toolboxPackPanel) {{
        toolboxPackPanel.style.display = toolboxSwitchEnabled ? "block" : "none";
      }}
      if (blocklyExtendFab) {{
        blocklyExtendFab.style.display = toolboxSwitchEnabled ? "inline-flex" : "none";
        blocklyExtendFab.disabled = !toolboxSwitchEnabled;
      }}
      syncToolboxModeButtons();
      renderToolboxPacks();
      renderGroupDrawer();
      syncToolboxMeta();
      setMoreMenuOpen(false);
      setControlPanelOpen(false);
      setCodePanelVisible(false);
      styleToolboxCategoryRows();
      new MutationObserver(() => styleToolboxCategoryRows()).observe(document.body, {{
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class"],
      }});
      const practiceBtn = document.getElementById("practiceBtn");
      const practiceMeta = document.getElementById("practiceMeta");
      const debugDetails = document.getElementById("resultDebugDetails");
      if (debugDetails) {{
        debugDetails.open = Boolean(panelCollapsedState.debugOpen);
      }}
      const runBadge = document.getElementById("resultRunBadge");
      if (runBadge) {{
        runBadge.classList.remove("is-success", "is-error");
        runBadge.textContent = "等待运行";
      }}
      if (practiceLabel) {{
        practiceMeta.textContent = `关联代码：${{practiceLabel}}${{practiceKind ? `（${{practiceKind}}）` : ""}}`;
        practiceBtn.style.display = "inline-flex";
        practiceBtn.href = practiceLaunchUrl || practiceUrl || "#";
      }} else {{
        practiceMeta.textContent = "当前没有关联的代码文件";
      }}
      updatePython();
    }}
    document.getElementById("copyPythonBtn").addEventListener("click", async () => {{
      setMoreMenuOpen(false);
      await navigator.clipboard.writeText(getPythonRaw());
    }});
    document.getElementById("toggleDebugBtn").addEventListener("click", () => {{
      const debugDetails = document.getElementById("resultDebugDetails");
      if (!debugDetails) return;
      panelCollapsedState.debugOpen = !panelCollapsedState.debugOpen;
      debugDetails.open = panelCollapsedState.debugOpen;
      setMoreMenuOpen(false);
    }});
    document.getElementById("toggleCodePanelBtn").addEventListener("click", () => {{
      setCodePanelVisible(!codePanelVisible);
    }});
    document.getElementById("closePythonOverlayBtn").addEventListener("click", () => {{
      setCodePanelVisible(false);
    }});
    document.getElementById("pythonOverlay").addEventListener("click", (event) => {{
      if (event.target?.id === "pythonOverlay") {{
        setCodePanelVisible(false);
      }}
    }});
    document.querySelector(".python-overlay-card").addEventListener("click", (event) => event.stopPropagation());
    document.getElementById("controlPanelToggleBtn").addEventListener("click", (event) => {{
      if (!toolboxSwitchEnabled) return;
      event.stopPropagation();
      setCodePanelVisible(false);
      setMoreMenuOpen(false);
      setControlPanelOpen(!controlPanelState.open);
    }});
    document.getElementById("controlPanel").addEventListener("click", (event) => event.stopPropagation());
    document.getElementById("toolbarMoreBtn").addEventListener("click", (event) => {{
      event.stopPropagation();
      setCodePanelVisible(false);
      setControlPanelOpen(false);
      setMoreMenuOpen(!toolbarOverflowState.menuOpen);
    }});
    document.addEventListener("click", () => {{
      setMoreMenuOpen(false);
      setControlPanelOpen(false);
    }});
    document.addEventListener("keydown", (event) => {{
      if (event.key === "Escape") {{
        setCodePanelVisible(false);
        setMoreMenuOpen(false);
        setControlPanelOpen(false);
      }}
    }});
    document.getElementById("toolbarMoreMenu").addEventListener("click", (event) => event.stopPropagation());
    document.getElementById("toolboxOfficialBtn").addEventListener("click", () => switchToolboxMode("official"));
    document.getElementById("toolboxCourseBtn").addEventListener("click", () => switchToolboxMode("course"));
    document.getElementById("blocklyExtendFab").addEventListener("click", () => {{
      if (!toolboxSwitchEnabled) return;
      const input = document.getElementById("addPackInput");
      if (input) input.click();
    }});
    document.getElementById("addPackBtn").addEventListener("click", () => {{
      if (!toolboxSwitchEnabled) return;
      const input = document.getElementById("addPackInput");
      if (input) input.click();
    }});
    document.getElementById("addPackInput").addEventListener("change", async (event) => {{
      if (!toolboxSwitchEnabled) return;
      const file = event?.target?.files?.[0];
      if (!file) return;
      try {{
        let importedToolbox = null;
        if (file.name.endsWith(".zip")) {{
          const zip = await JSZip.loadAsync(file);
          const toolboxFile =
            zip.file("toolbox.json")
            || zip.file("toolbox.toolbox.json")
            || Object.values(zip.files).find((entry) => entry && !entry.dir && /\.toolbox\.json$/i.test(entry.name));
          if (!toolboxFile) {{
            throw new Error("ZIP 中缺少 toolbox.json 或 *.toolbox.json");
          }}
          const raw = await toolboxFile.async("string");
          importedToolbox = JSON.parse(raw);
          if (zip.file("blocks.js") || zip.file("generators.js")) {{
            console.info("[Blockly] 检测到脚本型扩展包文件，已按安全策略忽略，仅导入 toolbox 数据。");
          }}
        }} else {{
          const text = await file.text();
          importedToolbox = JSON.parse(text);
        }}
        const schema = validateToolboxPayload(importedToolbox);
        if (!schema.valid) {{
          throw new Error(`积木包格式不正确：${{schema.errors[0] || "未知错误"}}`);
        }}
        const currentCourseToolbox = toolboxVariants?.course || toolboxVariants?.official || normalizeCategoryMeta(defaultXEduHubToolbox);
        toolboxVariants.course = mergeToolboxes(currentCourseToolbox, importedToolbox);
        toolboxVariants.hasCourseCustom = true;
        toolboxVariants.customPackCount = Number(toolboxVariants.customPackCount || 0) + 1;
        resetCategoryVisibility(toolboxVariants.course);
        const toolboxModeSwitch = document.getElementById("toolboxModeSwitch");
        if (toolboxModeSwitch) toolboxModeSwitch.style.display = "grid";
        switchToolboxMode("course");
        renderToolboxPacks();
        renderGroupDrawer();
        styleToolboxCategoryRows();
      }} catch (error) {{
        console.error("Import failed:", error);
        updateResultView({{
          success: false,
          message: `导入积木包失败：${{error?.message || "未知错误"}}`,
          result: {{ error: String(error || "") }},
          artifacts: {{}}
        }});
      }} finally {{
        event.target.value = "";
      }}
    }});
    document.getElementById("runXEduHubBtn").addEventListener("click", executeXEduHub);
    document.getElementById("downloadPythonBtn").addEventListener("click", () => {{
      const blob = new Blob([getPythonRaw()], {{ type: "text/plain;charset=utf-8" }});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (workspaceTitle || "workspace") + ".py";
      a.click();
      URL.revokeObjectURL(a.href);
    }});
    document.getElementById("downloadWorkspaceBtn").addEventListener("click", () => {{
      if (!workspace) return;
      let content = "";
      let filename = "workspace.blockly.json";
      if (workspaceUrl.endsWith(".xml")) {{
        const xml = Blockly.Xml.workspaceToDom(workspace);
        content = Blockly.Xml.domToPrettyText(xml);
        filename = workspaceUrl ? workspaceUrl.split("/").pop() : "workspace.blockly.xml";
      }} else {{
        content = JSON.stringify(Blockly.serialization.workspaces.save(workspace), null, 2);
        filename = workspaceUrl ? workspaceUrl.split("/").pop() : "workspace.blockly.json";
      }}
      const blob = new Blob([content], {{ type: "text/plain;charset=utf-8" }});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }});
    document.getElementById("resetWorkspaceBtn").addEventListener("click", () => {{
      if (!workspace || !initialSerialized) return;
      workspace.clear();
      if (initialSerialized.kind === "xml") {{
        const xml = Blockly.utils.xml.textToDom(initialSerialized.value);
        Blockly.Xml.domToWorkspace(xml, workspace);
      }} else {{
        Blockly.serialization.workspaces.load(JSON.parse(initialSerialized.value), workspace);
      }}
      updatePython();
    }});
    init().catch((error) => {{
      setPythonCode("# Blockly 初始化失败\\n# " + (error.message || "未知错误"));
      document.getElementById("toolboxLabel").textContent = "初始化失败";
    }});
  </script>
</body>
</html>"""


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


def build_single_course_source_entry(*, base_url: str, repo: str, branch: str, raw_base_url: str, token: str) -> Dict[str, Any]:
    course_data = load_course_data_from_repo(raw_base_url=raw_base_url, course_path="course.json", token=token)
    return build_single_course_entry(course_data=course_data, course_url="course.json", package_url="")
