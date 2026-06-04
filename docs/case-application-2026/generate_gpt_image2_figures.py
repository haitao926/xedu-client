from __future__ import annotations

import json
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent
FIG_DIR = ROOT / "assets" / "figures"
BASE_DIR = FIG_DIR / "gpt-image-2-redraw"
PROMPT_DIR = ROOT / "assets" / "prompts-gpt-image-2-redraw"
COURSE_DIR = ROOT.parent.parent / "courses" / "ai-showcase-exam-2025" / "01_目标检测与细粒度分类"

FONT_CANDIDATES = [
    Path("/System/Library/Fonts/STHeiti Medium.ttc"),
    Path("/System/Library/Fonts/PingFang.ttc"),
    Path("/System/Library/Fonts/Supplemental/Arial Unicode.ttf"),
]
FONT_PATH = next((p for p in FONT_CANDIDATES if p.exists()), None)
if FONT_PATH is None:
    raise RuntimeError("No usable Chinese font found.")


PROMPTS = {
    "figure_1_problem_solution": """生成一张高级手绘信息图底图，横向16:9，用于正式申报报告。主题是 XEdu Client 的课堂问题与平台回应。画面中心是轻等距视角的桌面端人工智能课堂实验平台，三块屏幕分别象征网页体验、积木流程、代码实践；下方抽屉象征工具箱；左侧四个空白问题卡片，右侧四个空白回应卡片，底部一个课程更新环形箭头。高级教育科技白皮书风格，精致墨线，轻水彩质感，浅暖白纸张背景，蓝绿主色，少量橙色强调，留白充足，层次清楚。不要生成任何文字、字母、数字、logo、乱码、水印、二维码、网址、人物照片。所有标签位置必须为空白，方便后期叠加清晰中文。""",
    "figure_2_architecture": """生成一张高级手绘系统架构信息图底图，横向16:9，用于正式申报报告。主题是 XEdu Client 总体架构。画面采用轻等距视角，中间是一台桌面端应用窗口和本地服务工作台，上方有两个空白用户标签位，中央有三个空白屏幕区象征 HTML体验、Blockly实践、Jupyter应用创新；下方有本地服务抽屉、工具箱模块、课程资源卡片、云端仓库图标和模型数据资源图标。整体呈现从用户层到教学工作台、本地服务、能力工具箱、课程资源层的分层关系。高级教育科技白皮书风格，精致墨线，轻水彩质感，浅暖白背景，蓝绿主色，少量橙色强调，结构清晰。不要生成任何文字、字母、数字、logo、乱码、水印、二维码、网址、人物照片。所有标签位置必须为空白，方便后期叠加清晰中文。""",
    "figure_3_learning_path": """生成一张高级手绘学习路径信息图底图，横向16:9，用于正式申报报告。主题是 HTML 到 Blockly 到 Jupyter 的递进学习主线。画面是一条从左到右延伸的学习道路或桥梁，包含三个大空白站点：左侧网页体验站点，中间积木流程实践站点，右侧代码 Notebook 创新站点。三站点之间用清晰箭头连接，底部有一条连续主线带状路径。高级教育科技白皮书风格，精致墨线，轻水彩质感，浅暖白背景，蓝色、绿色、橙色分别表达体验、实践、创新。不要生成任何文字、字母、数字、logo、乱码、水印、二维码、网址、人物照片。所有标签位置必须为空白，方便后期叠加清晰中文。""",
    "figure_4_xeduhub_toolbox": """生成一张高级手绘工具箱支撑信息图底图，横向16:9，用于正式申报报告。主题是 XEduHub 工具箱同时支撑 Blockly 与 Jupyter。画面中心是一个打开的智能工具箱，工具箱周围有四个空白能力卡片，分别位于上、下、左上、右上方向；左侧是一块空白积木流程屏幕，右侧是一块空白代码 Notebook 屏幕，工具箱用箭头连接两侧。底部有一个空白课程样例卡片。高级教育科技白皮书风格，精致墨线，轻水彩质感，浅暖白背景，蓝绿主色，少量橙色强调，结构清楚。不要生成任何文字、字母、数字、logo、乱码、水印、二维码、网址、人物照片。所有标签位置必须为空白，方便后期叠加清晰中文。""",
    "figure_5_course_update": """生成一张高级手绘课程更新闭环信息图底图，横向16:9，用于正式申报报告。主题是教师课程分享与更新机制。画面中心是一本打开的课程手册或课程平台卡片，周围是六个空白步骤卡片，按环形顺时针排列，并用环形箭头连接。左侧有教师工作台图标，右侧有云端课程仓库图标，底部有一个较大的空白口号标签。高级教育科技白皮书风格，精致墨线，轻水彩质感，浅暖白背景，蓝绿主色，橙色强调闭环。不要生成任何文字、字母、数字、logo、乱码、水印、二维码、网址、人物照片。所有标签位置必须为空白，方便后期叠加清晰中文。""",
    "figure_6_classroom_flow": """生成一张高级手绘课堂流程信息图底图，横向16:9，用于正式申报报告。主题是典型课堂应用流程。画面是双泳道流程地图，上方一条蓝色教师侧路径，下方一条绿色学生侧路径，中间以一个平台桥梁连接。左到右分为课前、课中、课后三段；上方有三个空白节点，下方有四个空白节点，节点之间用箭头连接，整体像手绘教学流程地图。高级教育科技白皮书风格，精致墨线，轻水彩质感，浅暖白背景，蓝绿主色，橙色强调课后迭代。不要生成任何文字、字母、数字、logo、乱码、水印、二维码、网址、人物照片。所有标签位置必须为空白，方便后期叠加清晰中文。""",
}


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_PATH), size)


def wrap_lines(text: str, width: int = 12) -> list[str]:
    lines: list[str] = []
    for part in text.split("\n"):
        if len(part) <= width:
            lines.append(part)
        else:
            lines.extend(textwrap.wrap(part, width=width, break_long_words=False))
    return lines


def draw_centered(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    text: str,
    size: int,
    fill: tuple[int, int, int, int],
    *,
    line_width: int = 12,
    spacing: int = 8,
) -> None:
    lines = wrap_lines(text, line_width)
    fnt = font(size)
    heights = []
    widths = []
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=fnt)
        widths.append(bbox[2] - bbox[0])
        heights.append(bbox[3] - bbox[1])
    total_height = sum(heights) + spacing * (len(lines) - 1)
    x1, y1, x2, y2 = box
    y = y1 + (y2 - y1 - total_height) / 2
    for line, width, height in zip(lines, widths, heights):
        draw.text((x1 + (x2 - x1 - width) / 2, y), line, font=fnt, fill=fill)
        y += height + spacing


def wash(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], alpha: int = 190) -> None:
    draw.rounded_rectangle(box, radius=20, fill=(255, 255, 255, alpha))


def title(draw: ImageDraw.ImageDraw, w: int, main: str, sub: str) -> None:
    wash(draw, (int(w * 0.28), 28, int(w * 0.72), 122), 150)
    draw_centered(draw, (0, 34, w, 78), main, 50, (18, 52, 82, 255), line_width=24)
    draw_centered(draw, (0, 82, w, 122), sub, 27, (72, 91, 112, 255), line_width=42)


def composite(base_name: str) -> Image.Image:
    base = BASE_DIR / f"{base_name}_base.png"
    if base_name == "figure_1_problem_solution":
        fallback = BASE_DIR / "figure_1_base_gpt_image_2_all.png"
        if fallback.exists():
            base = fallback
    if not base.exists():
        raise FileNotFoundError(base)
    img = Image.open(base).convert("RGBA")
    # Normalize all report figures to a predictable 16:9 canvas.
    img = img.resize((2400, 1350), Image.Resampling.LANCZOS)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    w, h = img.size

    blue = (24, 82, 128, 255)
    green = (18, 112, 86, 255)
    orange = (190, 86, 34, 255)
    ink = (27, 45, 65, 255)
    muted = (76, 96, 118, 255)

    if base_name == "figure_1_problem_solution":
        title(draw, w, "问题到平台回应", "XEdu Client：面向课堂实验的人工智能教学平台")
        left_boxes = [(105, 185, 665, 370), (105, 410, 665, 595), (105, 635, 665, 820), (105, 860, 665, 1045)]
        right_boxes = [(1735, 185, 2310, 370), (1735, 410, 2310, 595), (1735, 635, 2310, 820), (1735, 860, 2310, 1045)]
        left = [("环境复杂", "Jupyter / Blockly / Python\n资源分散、部署耗时"), ("路径断裂", "体验、实践、代码\n缺少连续学习设计"), ("能力分散", "输入、模型、流程、结果\n散落在不同脚本"), ("更新困难", "课程修订、同步、共享\n缺少平台机制")]
        right = [("环境承载", "统一入口与本地运行"), ("学习主线", "HTML → Blockly → Jupyter"), ("工具箱", "XEduHub 支撑 AI 实验"), ("课程更新", "教师分享与持续迭代")]
        draw_centered(draw, (105, 105, 665, 165), "课堂问题", 42, blue)
        draw_centered(draw, (1735, 105, 2310, 165), "平台回应", 42, green)
        for box, (a, b) in zip(left_boxes, left):
            wash(draw, box)
            draw_centered(draw, (box[0], box[1] + 18, box[2], box[1] + 78), a, 43, blue)
            draw_centered(draw, (box[0] + 20, box[1] + 88, box[2] - 20, box[3] - 15), b, 30, muted, line_width=15)
        for box, (a, b) in zip(right_boxes, right):
            wash(draw, box)
            draw_centered(draw, (box[0], box[1] + 18, box[2], box[1] + 78), a, 43, green)
            draw_centered(draw, (box[0] + 20, box[1] + 88, box[2] - 20, box[3] - 15), b, 30, muted, line_width=15)
        draw_centered(draw, (850, 740, 1550, 820), "XEdu Client", 52, ink)
        draw_centered(draw, (760, 610, 940, 670), "HTML", 35, blue)
        draw_centered(draw, (1080, 590, 1320, 650), "Blockly", 35, green)
        draw_centered(draw, (1410, 610, 1630, 670), "Jupyter", 35, blue)
        draw_centered(draw, (955, 900, 1450, 965), "XEduHub", 42, green)
        wash(draw, (760, 1110, 1640, 1235), 180)
        draw_centered(draw, (760, 1110, 1640, 1235), "上一节、改一节、同步一节", 44, orange, line_width=18)

    elif base_name == "figure_2_architecture":
        title(draw, w, "XEdu Client 总体架构", "桌面宿主、教学工作台、本地服务、工具箱与课程资源协同")
        labels = [
            ((125, 210, 355, 295), "用户层", blue, 6),
            ((125, 520, 355, 605), "工作台层", green, 6),
            ((125, 775, 355, 860), "服务层", blue, 6),
            ((125, 1035, 355, 1120), "资源层", orange, 6),
            ((285, 170, 550, 250), "教师 / 学生", blue, 9),
            ((790, 245, 1610, 315), "Electron 桌面端", ink, 16),
            ((380, 405, 690, 495), "HTML体验", blue, 8),
            ((860, 405, 1180, 495), "Blockly实践", green, 9),
            ((1320, 405, 1740, 495), "Jupyter应用创新", blue, 12),
            ((510, 700, 920, 790), "本地服务\n课程资源｜运行管理", ink, 12),
            ((1010, 700, 1390, 790), "XEduHub工具箱", green, 12),
            ((1480, 700, 1900, 790), "课程资源层", orange, 8),
            ((470, 980, 850, 1070), "本地课程目录", ink, 10),
            ((1020, 980, 1380, 1070), "模型与数据资源", ink, 10),
            ((1550, 980, 1950, 1070), "云端课程仓库", ink, 10),
        ]
        for box, text, color, width in labels:
            wash(draw, box)
            draw_centered(draw, box, text, 34, color, line_width=width)

    elif base_name == "figure_3_learning_path":
        title(draw, w, "HTML—Blockly—Jupyter 学习主线", "从任务体验、流程实践到代码应用创新的连续学习路径")
        boxes = [
            ((235, 395, 715, 640), "HTML体验\n任务感知", blue, 8),
            ((960, 395, 1440, 640), "Blockly实践\n流程理解", green, 9),
            ((1685, 395, 2165, 640), "Jupyter应用创新\n代码扩展", orange, 12),
        ]
        for box, text, color, width in boxes:
            wash(draw, box)
            draw_centered(draw, box, text, 43, color, line_width=width)
        wash(draw, (590, 910, 1810, 1025), 175)
        draw_centered(draw, (590, 910, 1810, 1025), "不是三个入口并列，而是一条递进式学习主线", 36, muted, line_width=24)
        wash(draw, (770, 1085, 1630, 1195), 165)
        draw_centered(draw, (770, 1085, 1630, 1195), "同一课堂任务：目标检测与细粒度分类", 36, ink, line_width=24)

    elif base_name == "figure_4_xeduhub_toolbox":
        title(draw, w, "XEduHub 工具箱支撑", "统一支撑图像输入、模型调用、流程执行与结果反馈")
        labels = [
            ((890, 470, 1510, 620), "XEduHub\n工具箱底座", green, 12),
            ((145, 570, 560, 720), "Blockly实践\n积木化流程", blue, 10),
            ((1840, 570, 2260, 720), "Jupyter应用创新\n代码实验", blue, 12),
            ((735, 220, 1060, 315), "图像输入", ink, 8),
            ((1325, 220, 1710, 315), "模型调用", ink, 8),
            ((735, 875, 1120, 970), "流程执行", ink, 8),
            ((1285, 875, 1710, 970), "结果反馈", ink, 8),
            ((760, 1115, 1640, 1225), "课程样例：目标检测与细粒度分类", orange, 18),
        ]
        for box, text, color, width in labels:
            wash(draw, box)
            draw_centered(draw, box, text, 38, color, line_width=width)

    elif base_name == "figure_5_course_update":
        title(draw, w, "教师课程分享与更新机制", "课程不再是静态文件，而是可持续迭代的平台资源")
        labels = [
            ((945, 565, 1455, 705), "课程更新", green, 8),
            ((1030, 760, 1370, 870), "上一节、改一节\n同步一节", orange, 12),
            ((1060, 235, 1340, 320), "本地创建", ink, 8),
            ((1540, 395, 1840, 480), "导入整理", ink, 8),
            ((1660, 790, 1960, 875), "上传课程", ink, 8),
            ((1060, 1040, 1340, 1125), "课堂使用", ink, 8),
            ((455, 790, 755, 875), "课后修订", ink, 8),
            ((560, 395, 880, 480), "拉取更新", ink, 8),
            ((245, 600, 545, 700), "教师工作台", blue, 8),
            ((1840, 600, 2180, 700), "云端课程仓库", green, 10),
            ((420, 1160, 1980, 1280), "面向教师的课程分享、同步更新与持续迭代机制", muted, 22),
        ]
        for box, text, color, width in labels:
            wash(draw, box)
            draw_centered(draw, box, text, 34, color, line_width=width)

    elif base_name == "figure_6_classroom_flow":
        title(draw, w, "典型课堂应用流程", "教师侧与学生侧在同一平台完成课前、课中、课后闭环")
        labels = [
            ((110, 350, 310, 455), "教师侧", blue, 6),
            ((110, 760, 310, 865), "学生侧", green, 6),
            ((500, 345, 780, 455), "教师备课", blue, 8),
            ((1060, 345, 1340, 455), "开启课堂", blue, 8),
            ((1720, 345, 2000, 455), "课后更新", blue, 8),
            ((430, 760, 730, 870), "进入实验", green, 8),
            ((820, 760, 1160, 870), "Blockly理解", green, 10),
            ((1270, 760, 1640, 870), "Jupyter实践", green, 10),
            ((1760, 760, 2060, 870), "结果复盘", green, 8),
            ((420, 900, 740, 1000), "打开当前课节", muted, 9),
            ((800, 900, 1180, 1000), "理解检测—裁剪—分类", muted, 12),
            ((1240, 900, 1670, 1000), "修改参数并运行代码", muted, 12),
            ((1740, 900, 2080, 1000), "观察结果并讨论", muted, 10),
            ((450, 1110, 650, 1190), "课前", muted, 4),
            ((1110, 1110, 1310, 1190), "课中", muted, 4),
            ((1790, 1110, 1990, 1190), "课后", muted, 4),
            ((965, 570, 1435, 660), "XEdu Client", ink, 12),
        ]
        for box, text, color, width in labels:
            wash(draw, box)
            draw_centered(draw, box, text, 34, color, line_width=width)

    else:
        raise ValueError(base_name)

    return Image.alpha_composite(img, layer).convert("RGB")


def make_sample_figure() -> Image.Image:
    canvas = Image.new("RGB", (2400, 1350), (250, 248, 240))
    draw = ImageDraw.Draw(canvas)
    title(draw, 2400, "目标检测与细粒度分类样例说明", "使用当前项目真实课程素材展示输入、检测、裁剪与代码实践")
    assets = [
        ("输入图片", COURSE_DIR / "animal.jpg"),
        ("检测结果", COURSE_DIR / "outputs" / "animal_with_boxes.jpg"),
        ("裁剪区域1", COURSE_DIR / "outputs" / "crop_1.jpg"),
        ("裁剪区域2", COURSE_DIR / "outputs" / "crop_2.jpg"),
    ]
    boxes = [(130, 265, 790, 745), (870, 265, 1530, 745), (1610, 265, 2270, 745), (130, 835, 790, 1165)]
    for (label, path), box in zip(assets, boxes):
        draw.rounded_rectangle((box[0] - 16, box[1] - 60, box[2] + 16, box[3] + 16), radius=28, fill=(255, 255, 255), outline=(130, 162, 190), width=3)
        draw_centered(draw, (box[0], box[1] - 54, box[2], box[1] - 8), label, 30, (27, 45, 65, 255))
        img = Image.open(path).convert("RGB")
        img.thumbnail((box[2] - box[0], box[3] - box[1]))
        x = box[0] + (box[2] - box[0] - img.width) // 2
        y = box[1] + (box[3] - box[1] - img.height) // 2
        draw.rectangle(box, fill=(239, 245, 248))
        canvas.paste(img, (x, y))
    draw.rounded_rectangle((895, 855, 2265, 1158), radius=28, fill=(255, 255, 255), outline=(32, 128, 112), width=3)
    draw_centered(draw, (930, 900, 2230, 975), "代码实践", 42, (18, 112, 86, 255), line_width=8)
    draw_centered(draw, (950, 990, 2210, 1125), "Blockly 理解流程\nJupyter 修改参数、运行代码、复现实验结果\n关联文件：ipynb / py / blockly.xml", 32, (76, 96, 118, 255), line_width=30)
    return canvas


def write_prompts() -> None:
    PROMPT_DIR.mkdir(parents=True, exist_ok=True)
    for name, prompt in PROMPTS.items():
        (PROMPT_DIR / f"{name}_prompt.txt").write_text(prompt, encoding="utf-8")


def verify_jsons() -> None:
    expected = [f"figure_{i}_{suffix}" for i, suffix in [
        (1, "problem_solution"),
        (2, "architecture"),
        (3, "learning_path"),
        (4, "xeduhub_toolbox"),
        (5, "course_update"),
        (6, "classroom_flow"),
    ]]
    failures = []
    for name in expected:
        json_path = BASE_DIR / f"{name}_base.json"
        if name == "figure_1_problem_solution":
            json_path = BASE_DIR / "figure_1_base_gpt_image_2_all.json"
        data = json.loads(json_path.read_text(encoding="utf-8"))
        if not (data.get("success") and data.get("requested_model") == "gpt-image-2-all" and data.get("model") == "gpt-image-2-all" and data.get("fallback_used") is False):
            failures.append(str(json_path))
    if failures:
        raise RuntimeError("Invalid GPT Image 2 JSON files: " + ", ".join(failures))


def make_contact_sheet() -> None:
    files = [
        FIG_DIR / "figure_1_problem_solution.png",
        FIG_DIR / "figure_2_architecture.png",
        FIG_DIR / "figure_3_learning_path.png",
        FIG_DIR / "figure_4_xeduhub_toolbox.png",
        FIG_DIR / "figure_5_course_update.png",
        FIG_DIR / "figure_6_classroom_flow.png",
        FIG_DIR / "figure_7_sample_experiment.png",
    ]
    thumbs = []
    for path in files:
        img = Image.open(path).convert("RGB")
        img.thumbnail((760, 428))
        thumbs.append((path.name, img.copy()))
    sheet = Image.new("RGB", (1600, 1820), "white")
    draw = ImageDraw.Draw(sheet)
    for idx, (name, img) in enumerate(thumbs):
        x = 40 + (idx % 2) * 790
        y = 40 + (idx // 2) * 450
        draw.text((x, y), name, font=font(24), fill=(25, 25, 25))
        sheet.paste(img, (x, y + 34))
    sheet.save(FIG_DIR / "contact_sheet_gpt_image_2.png")


def main() -> None:
    write_prompts()
    verify_jsons()
    mapping = {
        "figure_1_problem_solution": "figure_1_problem_solution.png",
        "figure_2_architecture": "figure_2_architecture.png",
        "figure_3_learning_path": "figure_3_learning_path.png",
        "figure_4_xeduhub_toolbox": "figure_4_xeduhub_toolbox.png",
        "figure_5_course_update": "figure_5_course_update.png",
        "figure_6_classroom_flow": "figure_6_classroom_flow.png",
    }
    for base_name, output_name in mapping.items():
        composite(base_name).save(FIG_DIR / output_name)
    make_sample_figure().save(FIG_DIR / "figure_7_sample_experiment.png")
    make_contact_sheet()


if __name__ == "__main__":
    main()
