from __future__ import annotations

import json
import shutil
import textwrap
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parents[2]
PPT_IMG = ROOT / "图资源"
REPORT_IMG = ROOT.parent / "应用报告" / "图资源"
GEN = ROOT / "中间过程" / "generated"
COURSE = REPO_ROOT / "courses/ai-showcase-exam-2025/01_目标检测与细粒度分类"

FONT_HEI = "/System/Library/Fonts/STHeiti Medium.ttc"
FONT_SONG = "/System/Library/Fonts/Supplemental/Songti.ttc"
FONT_MONO = "/System/Library/Fonts/SFNSMono.ttf"

NAVY = "#0B2F5B"
BLUE = "#1F5AA6"
GREEN = "#2E7D58"
PALE = "#EAF2FB"
LINE = "#D6E4F2"
TEXT = "#1E2933"
MUTED = "#5E6A75"


def font(size: int, kind: str = "hei") -> ImageFont.FreeTypeFont:
    path = {"hei": FONT_HEI, "song": FONT_SONG, "mono": FONT_MONO}.get(kind, FONT_HEI)
    return ImageFont.truetype(path, size)


def ensure_dirs() -> None:
    PPT_IMG.mkdir(parents=True, exist_ok=True)
    REPORT_IMG.mkdir(parents=True, exist_ok=True)
    GEN.mkdir(parents=True, exist_ok=True)


def rounded(draw: ImageDraw.ImageDraw, box, fill, outline=LINE, radius=24, width=2):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def wrap_by_width(draw: ImageDraw.ImageDraw, text: str, fnt, max_width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        line = ""
        for char in paragraph:
            candidate = line + char
            if draw.textbbox((0, 0), candidate, font=fnt)[2] <= max_width:
                line = candidate
            else:
                if line:
                    lines.append(line)
                line = char
        if line:
            lines.append(line)
    return lines or [""]


def text(draw, xy, content, size=28, fill=TEXT, kind="hei", max_width: int | None = None, line_gap=8):
    fnt = font(size, kind)
    x, y = xy
    lines = wrap_by_width(draw, content, fnt, max_width) if max_width else content.split("\n")
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill)
        y += size + line_gap
    return y


def fit_image(canvas: Image.Image, path: Path, box, pad=0, fill="#FFFFFF") -> None:
    x1, y1, x2, y2 = box
    region = (x2 - x1 - 2 * pad, y2 - y1 - 2 * pad)
    img = Image.open(path).convert("RGB")
    img = ImageOps.contain(img, region, Image.Resampling.LANCZOS)
    bg = Image.new("RGB", region, fill)
    bg.paste(img, ((region[0] - img.width) // 2, (region[1] - img.height) // 2))
    canvas.paste(bg, (x1 + pad, y1 + pad))


def save(canvas: Image.Image, name: str) -> Path:
    path = PPT_IMG / name
    canvas.save(path, quality=95)
    shutil.copy2(path, REPORT_IMG / name)
    return path


def make_course_page() -> Path:
    out = GEN / "course_page_capture.png"
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900}, device_scale_factor=1)
        page.goto((COURSE / "index.html").resolve().as_uri(), wait_until="networkidle")
        page.screenshot(path=str(out), full_page=False)
        browser.close()

    canvas = Image.new("RGB", (1600, 900), "#F7FAFE")
    draw = ImageDraw.Draw(canvas)
    text(draw, (70, 54), "课程讲解页证据", 42, NAVY)
    text(draw, (70, 112), "真实文件：courses/ai-showcase-exam-2025/01_目标检测与细粒度分类/index.html", 23, MUTED)
    rounded(draw, (62, 175, 1538, 842), "#FFFFFF", LINE, 28, 2)
    fit_image(canvas, out, (92, 205, 1508, 812), pad=0)
    text(draw, (108, 807), "讲解页承担任务情境、实验步骤、资源入口和代码骨架说明。", 24, MUTED, max_width=1360)
    return save(canvas, "figure_course_page_evidence.png")


def make_system_framework_clear() -> Path:
    canvas = Image.new("RGB", (1600, 900), "#FFFFFF")
    draw = ImageDraw.Draw(canvas)
    text(draw, (70, 52), "XEdu Client 系统框架（课堂视角）", 42, NAVY)
    text(draw, (70, 112), "核心思路：用统一工作台承接课程资源，把“讲解、流程、代码、结果”组织成连续学习链。", 24, MUTED)

    # Input: course package.
    rounded(draw, (75, 210, 410, 710), "#F8FBFF", "#AFCBEA", 28, 3)
    text(draw, (115, 245), "教师准备", 34, BLUE)
    text(draw, (115, 300), "课程资源包", 30, NAVY)
    for i, item in enumerate(["index.html 讲解页", "blockly.xml 工作区", "ipynb Notebook", "Python 脚本", "图片素材与输出"]):
        y = 365 + i * 55
        rounded(draw, (115, y, 370, y + 38), "#FFFFFF", "#C7D8EC", 10, 1)
        text(draw, (132, y + 7), item, 20, TEXT, "mono" if "." in item else "hei")

    # Middle: platform support.
    rounded(draw, (520, 210, 1080, 710), "#FFFFFF", LINE, 30, 3)
    text(draw, (565, 245), "XEdu Client 统一工作台", 36, NAVY)
    text(draw, (565, 305), "平台支撑层", 28, GREEN)
    support = [
        ("桌面端入口", "学生实验 / 教师备课"),
        ("Flask 本地服务", "课程文件与接口"),
        ("Jupyter 管理", "Notebook 启动与实践"),
        ("Blockly 运行", "可视化流程理解"),
        ("XEduHub 工具箱", "模型调用与结果输出"),
    ]
    for i, (title, desc) in enumerate(support):
        x = 565 + (i % 2) * 250
        y = 365 + (i // 2) * 90
        rounded(draw, (x, y, x + 220, y + 62), PALE, "#AFCBEA", 12, 2)
        text(draw, (x + 18, y + 10), title, 22, BLUE)
        text(draw, (x + 18, y + 36), desc, 16, MUTED)

    # Learning path.
    path_y = 755
    learning = [
        ("HTML 讲解体验", "建立任务情境"),
        ("Blockly 流程理解", "看清算法步骤"),
        ("Jupyter 代码实践", "运行与修改代码"),
        ("结果展示复盘", "形成学习证据"),
    ]
    for i, (title, desc) in enumerate(learning):
        x = 165 + i * 320
        rounded(draw, (x, path_y, x + 250, path_y + 82), "#EEF8F2", "#BFE0CB", 16, 2)
        text(draw, (x + 20, path_y + 14), title, 23, GREEN)
        text(draw, (x + 20, path_y + 46), desc, 18, MUTED)
        if i < len(learning) - 1:
            draw.line((x + 260, path_y + 42, x + 302, path_y + 42), fill=GREEN, width=5)
            draw.polygon([(x + 302, path_y + 42), (x + 284, path_y + 31), (x + 284, path_y + 53)], fill=GREEN)

    # Output: value and evidence.
    rounded(draw, (1190, 210, 1525, 710), "#F8FBFF", "#AFCBEA", 28, 3)
    text(draw, (1230, 245), "课堂产出", 34, BLUE)
    outputs = [
        ("学生", "连续学习链\n体验、理解、实践、复盘"),
        ("教师", "可复用课程包\n备课、上课、修订、共享"),
        ("课程", "可提交证据\n页面、代码、结果、反馈"),
    ]
    for i, (role, desc) in enumerate(outputs):
        y = 335 + i * 112
        rounded(draw, (1230, y, 1485, y + 76), "#FFFFFF", "#C7D8EC", 14, 2)
        text(draw, (1250, y + 12), role, 24, GREEN)
        text(draw, (1250, y + 42), desc, 18, TEXT, max_width=215, line_gap=4)

    # Direction arrows.
    draw.line((420, 455, 505, 455), fill=GREEN, width=7)
    draw.polygon([(505, 455), (482, 441), (482, 469)], fill=GREEN)
    draw.line((1090, 455, 1175, 455), fill=GREEN, width=7)
    draw.polygon([(1175, 455), (1152, 441), (1152, 469)], fill=GREEN)
    draw.line((800, 718, 800, 748), fill=GREEN, width=5)
    draw.polygon([(800, 748), (789, 730), (811, 730)], fill=GREEN)

    return save(canvas, "figure_system_framework_clear.png")


def make_resource_inventory() -> Path:
    files = [
        ("index.html", "讲解体验页"),
        ("detection_and_classification.blockly.xml", "Blockly 工作区"),
        ("detection_and_classification.ipynb", "Jupyter 实践"),
        ("detection_and_classification.py", "Python 脚本"),
        ("animal.jpg", "输入素材"),
        ("outputs/animal_with_boxes.jpg", "检测结果"),
        ("outputs/crop_1.jpg / crop_2.jpg", "裁剪结果"),
    ]
    canvas = Image.new("RGB", (1600, 900), "#FFFFFF")
    draw = ImageDraw.Draw(canvas)
    text(draw, (70, 54), "课程资源包结构", 42, NAVY)
    text(draw, (70, 112), "一门课不是单个课件，而是一组可迁移、可复用、可迭代的项目文件。", 24, MUTED)
    rounded(draw, (70, 180, 1530, 790), "#F8FBFF", LINE, 30, 2)

    x, y = 130, 230
    for idx, (fname, label) in enumerate(files, 1):
        row_y = y + (idx - 1) * 72
        rounded(draw, (x, row_y, 1470, row_y + 52), "#FFFFFF", "#C7D8EC", 14, 2)
        text(draw, (x + 26, row_y + 11), f"{idx:02d}", 23, BLUE, "mono")
        text(draw, (x + 88, row_y + 10), fname, 23, TEXT, "mono", max_width=770)
        text(draw, (x + 1050, row_y + 10), label, 23, GREEN)

    text(draw, (112, 824), "资源组织重点：讲解、积木、代码、素材、结果在同一课程目录内闭合。", 25, NAVY)
    return save(canvas, "figure_course_resource_inventory.png")


def block_labels() -> list[str]:
    root = ET.fromstring((COURSE / "detection_and_classification.blockly.xml").read_text())
    labels = []
    for elem in root.iter():
        if elem.tag.split("}")[-1] != "block":
            continue
        t = elem.attrib.get("type", "")
        mapping = {
            "xeduhub_load_image_to_var": "读取 animal.jpg",
            "xeduhub_workflow_create_var": "创建 XEduHub 模型",
            "xeduhub_workflow_infer_pair": "目标检测推理",
            "xeduhub_result_first_box": "提取检测框",
            "xeduhub_workflow_infer_var": "分类推理",
            "xeduhub_show_result_card": "显示结果卡片",
        }
        if t in mapping:
            labels.append(mapping[t])
    dedup: list[str] = []
    for item in labels:
        if not dedup or dedup[-1] != item:
            dedup.append(item)
    return dedup


def make_blockly_workflow() -> Path:
    steps = block_labels()
    canvas = Image.new("RGB", (1600, 900), "#FFFFFF")
    draw = ImageDraw.Draw(canvas)
    text(draw, (70, 54), "Blockly 工作流证据", 42, NAVY)
    text(draw, (70, 112), "真实文件：detection_and_classification.blockly.xml", 24, MUTED)

    left, top = 100, 200
    block_colors = ["#EAF2FB", "#EEF8F2", "#FFF7E8", "#F4F0FF", "#EAF2FB", "#EEF8F2"]
    for idx, step in enumerate(steps[:6]):
        x = left + (idx % 3) * 475
        y = top + (idx // 3) * 210
        rounded(draw, (x, y, x + 370, y + 118), block_colors[idx], "#83A9D9", 26, 3)
        text(draw, (x + 28, y + 24), f"{idx + 1}", 36, BLUE, "mono")
        text(draw, (x + 92, y + 30), step, 30, TEXT, max_width=245)
        if idx < 5:
            ax1 = x + 390
            ay1 = y + 58
            ax2 = left + ((idx + 1) % 3) * 475 - 30
            ay2 = top + ((idx + 1) // 3) * 210 + 58
            if (idx + 1) % 3:
                draw.line((ax1, ay1, ax2, ay2), fill=GREEN, width=5)
                draw.polygon([(ax2, ay2), (ax2 - 18, ay2 - 10), (ax2 - 18, ay2 + 10)], fill=GREEN)
            else:
                draw.line((x + 185, y + 130, x + 185, y + 178, left + 185, y + 178, left + 185, y + 202), fill=GREEN, width=5)
                draw.polygon([(left + 185, y + 202), (left + 174, y + 184), (left + 196, y + 184)], fill=GREEN)

    rounded(draw, (105, 685, 1495, 805), "#F8FBFF", LINE, 20, 2)
    text(draw, (138, 720), "教学意义：学生先用积木看清“检测 -> 裁剪 -> 分类”的任务链，再进入 Notebook 运行代码。", 28, NAVY, max_width=1320)
    return save(canvas, "figure_blockly_workflow_evidence.png")


def make_notebook_code() -> Path:
    nb = json.loads((COURSE / "detection_and_classification.ipynb").read_text())
    nb_code = "\n".join("".join(c.get("source", [])) for c in nb["cells"] if c["cell_type"] == "code")
    py_lines = (COURSE / "detection_and_classification.py").read_text().splitlines()
    py_snip = "\n".join(py_lines[52:88])

    canvas = Image.new("RGB", (1600, 900), "#F7FAFE")
    draw = ImageDraw.Draw(canvas)
    text(draw, (70, 54), "Notebook 与 Python 代码证据", 42, NAVY)
    text(draw, (70, 112), "真实文件：detection_and_classification.ipynb / detection_and_classification.py", 24, MUTED)

    rounded(draw, (80, 190, 735, 780), "#FFFFFF", LINE, 28, 2)
    text(draw, (120, 230), "Jupyter Notebook", 32, BLUE)
    rounded(draw, (118, 292, 697, 430), "#101827", "#101827", 18, 1)
    text(draw, (145, 324), nb_code, 27, "#DCEBFF", "mono", max_width=520, line_gap=10)
    text(draw, (120, 500), "Notebook 只保留课堂入口：导入流程、运行、查看 results。", 26, MUTED, max_width=550)

    rounded(draw, (865, 190, 1520, 780), "#FFFFFF", LINE, 28, 2)
    text(draw, (905, 230), "Python 流程脚本", 32, BLUE)
    rounded(draw, (903, 292, 1482, 690), "#101827", "#101827", 18, 1)
    for i, line in enumerate(textwrap.wrap(py_snip, width=56, replace_whitespace=False)[:13]):
        draw.text((930, 318 + i * 25), line, font=font(21, "mono"), fill="#DCEBFF")
    text(draw, (905, 716), "脚本保留离线演示模式，便于申报、录课和无模型环境复现。", 24, MUTED, max_width=560)
    return save(canvas, "figure_notebook_code_evidence.png")


def make_sample_output() -> Path:
    paths = [
        ("输入图片", COURSE / "animal.jpg"),
        ("检测结果", COURSE / "outputs/animal_with_boxes.jpg"),
        ("裁剪区域 1", COURSE / "outputs/crop_1.jpg"),
        ("裁剪区域 2", COURSE / "outputs/crop_2.jpg"),
    ]
    canvas = Image.new("RGB", (1600, 900), "#FFFFFF")
    draw = ImageDraw.Draw(canvas)
    text(draw, (70, 54), "样例任务运行结果证据", 42, NAVY)
    text(draw, (70, 112), "目标检测与细粒度分类：输入 -> 检测框 -> 裁剪 -> 分类复盘", 24, MUTED)
    for idx, (label, path) in enumerate(paths):
        x = 72 + idx * 380
        rounded(draw, (x, 190, x + 330, 730), "#F8FBFF", LINE, 24, 2)
        text(draw, (x + 28, 222), label, 28, BLUE)
        fit_image(canvas, path, (x + 22, 280, x + 308, 650), pad=0, fill="#F8FBFF")
        if idx < len(paths) - 1:
            draw.line((x + 338, 455, x + 375, 455), fill=GREEN, width=5)
            draw.polygon([(x + 375, 455), (x + 357, 444), (x + 357, 466)], fill=GREEN)
    rounded(draw, (130, 780, 1470, 842), "#EAF2FB", "#AFCBEA", 18, 2)
    text(draw, (160, 797), "这组图片来自项目真实课程目录，可直接作为视频演示与应用报告证据。", 25, NAVY, max_width=1260)
    return save(canvas, "figure_sample_output_evidence.png")


def make_ai_process() -> Path:
    steps = [
        ("真实课堂问题", "环境、路径、资源、稳定性"),
        ("DeepSeek 辅助梳理", "需求分析、测试清单、文稿结构"),
        ("教师人工筛选", "去夸大、改成课堂语言"),
        ("代码与材料落地", "脚本、课程包、报告、PPT"),
        ("运行证据验证", "课程页、Blockly、Notebook、结果图"),
    ]
    canvas = Image.new("RGB", (1600, 900), "#FFFFFF")
    draw = ImageDraw.Draw(canvas)
    text(draw, (70, 54), "生成式人工智能辅助开发流程", 42, NAVY)
    text(draw, (70, 112), "AI 负责提高整理与生成效率，教师负责判断、取舍和课堂化落地。", 24, MUTED)
    y = 250
    for idx, (title, desc) in enumerate(steps):
        x = 120 + idx * 290
        rounded(draw, (x, y, x + 230, y + 230), "#F8FBFF", "#AFCBEA", 26, 3)
        text(draw, (x + 28, y + 32), f"{idx + 1}", 34, GREEN, "mono")
        text(draw, (x + 28, y + 82), title, 29, BLUE, max_width=176)
        text(draw, (x + 28, y + 142), desc, 22, MUTED, max_width=176)
        if idx < len(steps) - 1:
            draw.line((x + 242, y + 115, x + 278, y + 115), fill=GREEN, width=5)
            draw.polygon([(x + 278, y + 115), (x + 260, y + 104), (x + 260, y + 126)], fill=GREEN)
    rounded(draw, (160, 620, 1440, 748), "#EEF8F2", "#BFE0CB", 22, 2)
    text(draw, (200, 655), "关键边界：AI 生成内容不直接等于最终成果，最终材料以可运行项目和真实课程资源为准。", 28, NAVY, max_width=1200)
    return save(canvas, "figure_ai_development_process_clean.png")


def make_application_value() -> Path:
    items = [
        ("学生", "降低入门门槛\n保持任务上下文\n从流程走向代码"),
        ("教师", "减少工具切换\n稳定组织课堂\n沉淀可复用资源"),
        ("课程", "资源包可迁移\n共建可迭代\n支撑跨学段扩展"),
    ]
    canvas = Image.new("RGB", (1600, 900), "#F7FAFE")
    draw = ImageDraw.Draw(canvas)
    text(draw, (70, 54), "应用价值归纳", 42, NAVY)
    text(draw, (70, 112), "XEdu Client 的价值不在“多一个工具”，而在把课堂实验链路连续化。", 24, MUTED)
    for idx, (role, desc) in enumerate(items):
        x = 115 + idx * 490
        rounded(draw, (x, 235, x + 390, 675), "#FFFFFF", LINE, 34, 2)
        text(draw, (x + 50, 290), role, 44, BLUE)
        yy = 380
        for line in desc.split("\n"):
            yy = text(draw, (x + 54, yy), f"• {line}", 30, TEXT, max_width=300, line_gap=18)
    rounded(draw, (185, 740, 1415, 812), "#EAF2FB", "#AFCBEA", 20, 2)
    text(draw, (220, 760), "后续改进：继续补充课程样例、课堂反馈数据和跨学段应用证据。", 27, NAVY, max_width=1160)
    return save(canvas, "figure_application_value_clean.png")


def make_contact_sheet() -> None:
    images = sorted(PPT_IMG.glob("figure_*.png"))
    cards = []
    for path in images:
        img = Image.open(path).convert("RGB")
        thumb = ImageOps.contain(img, (360, 220), Image.Resampling.LANCZOS)
        card = Image.new("RGB", (400, 285), "#FFFFFF")
        card.paste(thumb, ((400 - thumb.width) // 2, 15))
        d = ImageDraw.Draw(card)
        d.rectangle((0, 0, 399, 284), outline="#D0DAE5", width=2)
        d.text((16, 245), path.name, fill=NAVY, font=font(16, "mono"))
        cards.append(card)
    cols = 3
    rows = (len(cards) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 400, rows * 285), "#F5F7FA")
    for i, card in enumerate(cards):
        sheet.paste(card, ((i % cols) * 400, (i // cols) * 285))
    sheet.save(GEN / "project_figure_contact_sheet.png")


def main() -> None:
    ensure_dirs()
    make_system_framework_clear()
    make_course_page()
    make_resource_inventory()
    make_blockly_workflow()
    make_notebook_code()
    make_sample_output()
    make_ai_process()
    make_application_value()
    make_contact_sheet()
    print("Generated project evidence assets in", PPT_IMG)


if __name__ == "__main__":
    main()
