# -*- coding: utf-8 -*-
"""
QuickForm runtime helpers.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict

XEDU_QUICKFORM_START = "<!-- XEDU_QUICKFORM_START -->"
XEDU_QUICKFORM_END = "<!-- XEDU_QUICKFORM_END -->"


def get_ui_quickform_dict(ui_config) -> Dict[str, Any]:
    quickform = getattr(ui_config, "quickform", {}) or {}
    if hasattr(quickform, "to_dict"):
        return quickform.to_dict()
    if isinstance(quickform, dict):
        return dict(quickform)
    return {}


def merge_quickform_config(ui_config, parse_bool, overrides: Dict[str, Any] | None = None) -> Dict[str, Any]:
    merged = {
        "enabled": False,
        "base_url": "https://quickform.cn",
        "username": "",
        "password": "",
    }
    merged.update(get_ui_quickform_dict(ui_config))
    if isinstance(overrides, dict):
        for key in ("enabled", "base_url", "username", "password"):
            if key in overrides:
                merged[key] = overrides.get(key)
    merged["enabled"] = parse_bool(merged.get("enabled"), False)
    merged["base_url"] = str(merged.get("base_url") or "https://quickform.cn").strip().rstrip("/") or "https://quickform.cn"
    merged["username"] = str(merged.get("username") or "").strip()
    merged["password"] = str(merged.get("password") or "")
    return merged


def normalize_quickform_public_config(raw: Any, parse_bool) -> Dict[str, Any]:
    data = raw if isinstance(raw, dict) else {}
    return {
        "enabled": parse_bool(data.get("enabled"), True),
        "apiid": str(data.get("apiid") or "").strip(),
        "task_name": str(data.get("task_name") or "").strip(),
        "task_intro": str(data.get("task_intro") or "").strip(),
        "submit_url": str(data.get("submit_url") or "").strip(),
        "query_url": str(data.get("query_url") or "").strip(),
        "summary_url": str(data.get("summary_url") or "").strip(),
        "report_url": str(data.get("report_url") or "").strip(),
        "html_path": str(data.get("html_path") or "").strip(),
    }


def build_quickform_injection_block(quickform: Dict[str, Any], parse_bool) -> str:
    public_config = normalize_quickform_public_config(quickform, parse_bool)
    config_json = json.dumps(public_config, ensure_ascii=False)
    return f"""
{XEDU_QUICKFORM_START}
<script>
window.__XEDU_QUICKFORM_CONFIG__ = {config_json};
</script>
<script>
(function() {{
  const config = window.__XEDU_QUICKFORM_CONFIG__ || {{}};
  function normalizeValue(value) {{
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined) return "";
    return value;
  }}
  function formToObject(form) {{
    const formData = new FormData(form);
    const data = {{}};
    for (const [key, value] of formData.entries()) {{
      if (Object.prototype.hasOwnProperty.call(data, key)) {{
        if (!Array.isArray(data[key])) data[key] = [data[key]];
        data[key].push(normalizeValue(value));
      }} else {{
        data[key] = normalizeValue(value);
      }}
    }}
    return data;
  }}
  async function requestJson(url, options) {{
    const response = await fetch(url, Object.assign({{
      headers: {{
        "Content-Type": "application/json"
      }}
    }}, options || {{}}));
    const data = await response.json().catch(function() {{ return {{}}; }});
    if (!response.ok) {{
      const message = data.message || data.error || ("请求失败: HTTP " + response.status);
      throw new Error(message);
    }}
    return data;
  }}
  const api = {{
    config,
    async submit(payload) {{
      if (!config.submit_url) throw new Error("QuickForm submit_url 未配置");
      const result = await requestJson(config.submit_url, {{
        method: "POST",
        body: JSON.stringify(payload || {{}})
      }});
      window.dispatchEvent(new CustomEvent("xedu:quickform:success", {{ detail: {{ type: "submit", result }} }}));
      return result;
    }},
    async fetchAll() {{
      if (!config.query_url) throw new Error("QuickForm query_url 未配置");
      return requestJson(config.query_url, {{ method: "GET" }});
    }},
    async fetchLatest() {{
      if (!config.summary_url) throw new Error("QuickForm summary_url 未配置");
      return requestJson(config.summary_url, {{ method: "GET" }});
    }},
    bindForms(root) {{
      const scope = root || document;
      const forms = scope.querySelectorAll("form[data-xedu-quickform-submit]");
      forms.forEach(function(form) {{
        if (form.dataset.xeduQuickformBound === "1") return;
        form.dataset.xeduQuickformBound = "1";
        form.addEventListener("submit", async function(event) {{
          event.preventDefault();
          try {{
            const payload = formToObject(form);
            const result = await api.submit(payload);
            form.dispatchEvent(new CustomEvent("xedu:quickform:submitted", {{ detail: result }}));
          }} catch (error) {{
            window.dispatchEvent(new CustomEvent("xedu:quickform:error", {{ detail: {{ type: "submit", message: error.message }} }}));
            form.dispatchEvent(new CustomEvent("xedu:quickform:submit-error", {{ detail: error }}));
          }}
        }});
      }});
    }}
  }};
  window.XEduQuickForm = api;
  if (document.readyState === "loading") {{
    document.addEventListener("DOMContentLoaded", function() {{ api.bindForms(document); }}, {{ once: true }});
  }} else {{
    api.bindForms(document);
  }}
}})();
</script>
{XEDU_QUICKFORM_END}
""".strip()


def inject_quickform_into_html(html: str, quickform: Dict[str, Any], parse_bool) -> str:
    block = build_quickform_injection_block(quickform, parse_bool)
    pattern = re.compile(rf"{re.escape(XEDU_QUICKFORM_START)}.*?{re.escape(XEDU_QUICKFORM_END)}", re.DOTALL)
    if pattern.search(html):
        return pattern.sub(block, html, count=1)
    lower = html.lower()
    body_index = lower.rfind("</body>")
    if body_index >= 0:
        return f"{html[:body_index]}\n{block}\n{html[body_index:]}"
    return f"{html}\n{block}\n"


def inject_quickform_file(local_path: str, html_path: str, quickform: Dict[str, Any], create_backup: bool, parse_bool, resolve_local_course_file) -> Dict[str, Any]:
    clean_local_path = str(local_path or "").strip()
    clean_html_path = str(html_path or "").strip().lstrip("/")
    public_config = normalize_quickform_public_config(quickform or {}, parse_bool)
    if not clean_local_path:
        raise ValueError("缺少 local_path")
    if not clean_html_path:
        raise ValueError("缺少 html_path")
    if not clean_html_path.lower().endswith((".html", ".htm")):
        raise ValueError("仅支持注入 HTML 文件")
    if not public_config.get("submit_url"):
        raise ValueError("QuickForm submit_url 未配置")

    html_file = resolve_local_course_file(clean_local_path, clean_html_path)
    if not html_file.exists() or not html_file.is_file():
        raise FileNotFoundError("HTML 文件不存在")

    original = html_file.read_text(encoding="utf-8")
    updated = inject_quickform_into_html(original, public_config, parse_bool)

    backup_path = ""
    if create_backup:
        candidate = html_file.with_name(f"{html_file.name}.xedu.bak")
        if not candidate.exists():
            candidate.write_text(original, encoding="utf-8")
        backup_path = str(candidate)

    html_file.write_text(updated, encoding="utf-8")
    return {"html_path": clean_html_path, "backup_path": backup_path}
