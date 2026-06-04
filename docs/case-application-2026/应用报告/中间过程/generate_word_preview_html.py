from __future__ import annotations

import html
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "中间过程" / "创AI-开发与应用报告-Word预览结构稿.md"
OUT = ROOT / "创AI-开发与应用报告-Word预览.html"

FIGURES = [
    (
        "基于上述问题，我们开发了 `XEdu Client`。",
        "figure_1_project_background.png",
        "图1 课堂问题与平台回应：用统一工作台承接环境、路径、能力与资源四类需求。",
    ),
    (
        "项目采用“桌面宿主与应用装配 + 后端运行与服务支撑 + 前端实验工作台 + 课程与实验资源组织结构”的总体架构。",
        "figure_system_framework_clear.png",
        "图2 系统框架：课程资源、平台支撑层与课堂学习链路的关系。",
    ),
    (
        "整体来看，平台架构形成了清晰分工：",
        "figure_3_learning_path.png",
        "图3 学习主线：从 HTML 讲解体验到 Blockly 流程理解，再到 Jupyter 代码实践。",
    ),
    (
        "课程资源共享平台功能设计是本项目的另一条核心主线。",
        "figure_course_resource_inventory.png",
        "图4 课程资源包结构：讲解页、工作区、Notebook、脚本、素材和输出在同一目录内闭合。",
    ),
    (
        "讲解体验页承担任务导入和学习引导功能。",
        "figure_course_page_evidence.png",
        "图5 课程讲解页证据：真实课程页面承载任务情境、步骤说明和代码骨架。",
    ),
    (
        "Blockly 可视化实验是实验平台中的关键功能",
        "figure_blockly_workflow_evidence.png",
        "图6 Blockly 工作流证据：从真实工作区文件提取“读取、检测、提框、分类、展示”的任务链。",
    ),
    (
        "Jupyter 代码实验承担从可视化理解走向真实代码实践的任务。",
        "figure_notebook_code_evidence.png",
        "图7 Notebook 与 Python 代码证据：同一实验可从 Notebook 入口运行并由 Python 脚本复现。",
    ),
    (
        "从课程资源共享应用过程看，平台将人工智能实验所需的讲解页、Notebook、`XEdu Pro` Blockly 工作区、脚本、素材和结果文件组织为可复用课程包。",
        "figure_5b_collaborative_course.png",
        "图8 课程共建机制：多位教师可围绕同一门课程共享、使用、修订并同步资源。",
    ),
    (
        "以“运动会上的 AI 裁判”等课堂任务为例",
        "figure_sample_output_evidence.png",
        "图9 样例任务运行结果：使用项目内课程包展示输入、检测、裁剪和结果复盘链条。",
    ),
    (
        "生成式人工智能的引入是本案例的重要特征。",
        "figure_ai_development_process_clean.png",
        "图10 生成式人工智能辅助开发流程：AI 提高整理效率，教师负责判断、取舍和课堂化落地。",
    ),
    (
        "总体来看，`XEdu Client` 不是单一课件或单次演示程序",
        "figure_application_value_clean.png",
        "图11 应用价值归纳：面向学生、教师和课程建设形成连续学习、稳定实施与资源复用价值。",
    ),
]


def inline(text: str) -> str:
    escaped = html.escape(text)
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)


def slug(text: str) -> str:
    safe = re.sub(r"\s+", "-", text.strip())
    safe = re.sub(r"[^\w\-\u4e00-\u9fff]", "", safe)
    return safe or "section"


def figure_html(filename: str, caption: str) -> str:
    src = f"图资源/{html.escape(filename)}"
    return (
        '<figure class="figure-block">'
        f'<img src="{src}" alt="{html.escape(caption)}" loading="lazy">'
        f'<figcaption>{html.escape(caption)}</figcaption>'
        "</figure>"
    )


def build_body() -> tuple[str, str]:
    chunks: list[str] = []
    toc: list[tuple[int, str, str]] = []
    inserted: set[str] = set()

    for raw in SRC.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue

        if line.startswith("# "):
            text = line[2:].strip()
            chunks.append(f'<h1 id="{slug(text)}">{inline(text)}</h1>')
        elif line.startswith("## "):
            text = line[3:].strip()
            anchor = slug(text)
            toc.append((2, anchor, text))
            chunks.append(f'<h2 id="{anchor}">{inline(text)}</h2>')
        elif line.startswith("### "):
            text = line[4:].strip()
            anchor = slug(text)
            toc.append((3, anchor, text))
            chunks.append(f'<h3 id="{anchor}">{inline(text)}</h3>')
        elif line.startswith("#### "):
            text = line[5:].strip()
            anchor = slug(text)
            toc.append((4, anchor, text))
            chunks.append(f'<h4 id="{anchor}">{inline(text)}</h4>')
        elif re.match(r"^(案例名称|作者|单位)：", line):
            chunks.append(f'<p class="meta-line">{inline(line)}</p>')
        elif line.startswith("`") and line.endswith("`"):
            chunks.append(f"<pre><code>{html.escape(line.strip('`'))}</code></pre>")
        else:
            chunks.append(f"<p>{inline(line)}</p>")

        for anchor, filename, caption in FIGURES:
            if filename not in inserted and anchor in line:
                chunks.append(figure_html(filename, caption))
                inserted.add(filename)

    toc_html = "\n".join(
        f'<a class="toc-level-{level}" href="#{anchor}">{html.escape(text)}</a>'
        for level, anchor, text in toc
    )
    return "\n".join(chunks), toc_html


def build_html() -> str:
    body, toc = build_body()
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>创AI-开发与应用报告-Word预览</title>
  <style>
    :root {{
      --paper-width: 210mm;
      --paper-padding-x: 27mm;
      --paper-padding-y: 24mm;
      --text: #1f2933;
      --muted: #65717f;
      --line: #d8dee6;
      --paper: #ffffff;
      --desk: #eef1f5;
      --accent: #245b8a;
    }}

    * {{ box-sizing: border-box; }}

    html {{ scroll-behavior: smooth; }}

    body {{
      margin: 0;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(36, 91, 138, 0.08), transparent 34rem),
        linear-gradient(180deg, #f8fafc 0%, var(--desk) 16rem, #e6ebf1 100%);
      font-family: "Times New Roman", "仿宋_GB2312", "FangSong", "Songti SC", serif;
      font-size: 12pt;
      line-height: 1.72;
    }}

    .workspace {{
      display: grid;
      grid-template-columns: minmax(210px, 280px) minmax(0, 1fr);
      gap: 28px;
      max-width: 1320px;
      margin: 0 auto;
      padding: 28px 28px 48px;
    }}

    .toc {{
      position: sticky;
      top: 22px;
      align-self: start;
      max-height: calc(100vh - 44px);
      overflow: auto;
      padding: 18px 16px;
      background: rgba(255, 255, 255, 0.82);
      border: 1px solid rgba(130, 145, 165, 0.28);
      border-radius: 16px;
      box-shadow: 0 18px 45px rgba(31, 41, 51, 0.08);
      backdrop-filter: blur(12px);
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
    }}

    .toc-title {{
      margin: 0 0 10px;
      font-size: 13px;
      font-weight: 700;
      color: var(--accent);
      letter-spacing: 0.08em;
    }}

    .toc a {{
      display: block;
      padding: 7px 8px;
      border-radius: 8px;
      color: #425466;
      text-decoration: none;
      font-size: 13px;
      line-height: 1.35;
    }}

    .toc a:hover {{
      color: var(--accent);
      background: rgba(36, 91, 138, 0.08);
    }}

    .toc-level-3 {{ padding-left: 24px !important; color: #687789 !important; font-size: 12px !important; }}

    .document-shell {{
      display: flex;
      justify-content: center;
      min-width: 0;
    }}

    .word-page {{
      width: var(--paper-width);
      min-height: 297mm;
      padding: var(--paper-padding-y) var(--paper-padding-x);
      background: var(--paper);
      box-shadow:
        0 1px 0 rgba(31, 41, 51, 0.06),
        0 26px 70px rgba(31, 41, 51, 0.18);
    }}

    h1, h2, h3, h4, p, figure, pre {{ margin-left: 0; margin-right: 0; }}

    h1 {{
      margin: 0 0 18px;
      text-align: center;
      font-family: "方正小标宋简体", "STSong", "SimSun", serif;
      font-size: 18pt;
      line-height: 1.4;
      letter-spacing: 0.02em;
    }}

    .meta-line {{
      margin: 2px 0;
      text-align: center;
      color: #374151;
      font-size: 10.5pt;
      text-indent: 0;
    }}

    h2 {{
      margin: 24px 0 10px;
      font-family: "黑体", "SimHei", sans-serif;
      font-size: 15pt;
      line-height: 1.45;
      page-break-after: avoid;
    }}

    h3 {{
      margin: 18px 0 8px;
      font-family: "黑体", "SimHei", sans-serif;
      font-size: 13pt;
      line-height: 1.45;
      page-break-after: avoid;
    }}

    h4 {{
      margin: 13px 0 6px;
      font-family: "楷体", "KaiTi", "STKaiti", serif;
      font-size: 12.5pt;
      font-weight: 700;
      line-height: 1.45;
      page-break-after: avoid;
    }}

    p {{
      margin: 0 0 8px;
      text-indent: 2em;
      text-align: justify;
    }}

    code {{
      padding: 0 0.12em;
      border-radius: 3px;
      color: #111827;
      background: #f4f6f8;
      font-family: "Cascadia Mono", "SFMono-Regular", Consolas, monospace;
      font-size: 0.92em;
    }}

    pre {{
      white-space: pre-wrap;
      margin: 8px 0 10px;
      padding: 10px 12px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: #f8fafc;
      line-height: 1.45;
    }}

    .figure-block {{
      margin: 16px auto 18px;
      text-align: center;
      page-break-inside: avoid;
    }}

    .figure-block img {{
      display: block;
      max-width: 100%;
      max-height: 165mm;
      margin: 0 auto 7px;
      object-fit: contain;
      border: 1px solid rgba(31, 41, 51, 0.12);
      border-radius: 2px;
    }}

    .figure-block figcaption {{
      color: #4b5563;
      font-size: 10pt;
      line-height: 1.45;
      text-align: center;
    }}

    .print-note {{
      margin: 0 0 16px;
      color: var(--muted);
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      font-size: 12px;
      text-align: right;
    }}

    @page {{
      size: A4;
      margin: 24mm 27mm;
    }}

    @media (max-width: 1080px) {{
      .workspace {{
        display: block;
        padding: 16px;
      }}

      .toc {{
        position: static;
        max-height: none;
        margin: 0 auto 16px;
        width: min(100%, var(--paper-width));
      }}

      .word-page {{
        width: min(100%, var(--paper-width));
        padding: 22mm 16mm;
      }}
    }}

    @media print {{
      body {{ background: #fff; }}
      .workspace {{ display: block; padding: 0; max-width: none; }}
      .toc, .print-note {{ display: none; }}
      .document-shell {{ display: block; }}
      .word-page {{
        width: auto;
        min-height: auto;
        padding: 0;
        box-shadow: none;
      }}
      a {{ color: inherit; }}
    }}
  </style>
</head>
<body>
  <main class="workspace">
    <aside class="toc" aria-label="目录">
      <p class="toc-title">报告目录</p>
      {toc}
    </aside>
    <section class="document-shell">
      <article class="word-page">
        <p class="print-note">Word/A4 预览版，图片来自“应用报告/图资源”。</p>
        {body}
      </article>
    </section>
  </main>
</body>
</html>
"""


def main() -> None:
    OUT.write_text(build_html(), encoding="utf-8")
    print(OUT)


if __name__ == "__main__":
    main()
