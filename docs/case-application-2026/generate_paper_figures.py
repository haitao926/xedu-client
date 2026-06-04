from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


OUT_DIR = Path(__file__).resolve().parent / "assets" / "figures"
W, H = 2400, 1350
BG = "#F7FAFC"
TEXT = "#102A43"
MUTED = "#486581"
LINE = "#BCCCDC"
ACCENT = "#0F766E"
ACCENT2 = "#2563EB"
ACCENT3 = "#7C3AED"
ACCENT4 = "#EA580C"
CARD = "#FFFFFF"


def load_font(size: int, bold: bool = False):
    candidates = [
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


TITLE = load_font(54, True)
H1 = load_font(34, True)
BODY = load_font(24, False)
SMALL = load_font(20, False)
TAG = load_font(22, True)


def canvas():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    return img, d


def rr(draw, box, fill=CARD, outline=LINE, width=3, radius=24):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def txt(draw, xy, text, font=BODY, fill=TEXT, anchor=None, spacing=6):
    draw.multiline_text(xy, text, font=font, fill=fill, anchor=anchor, spacing=spacing)


def center_text(draw, box, text, font=BODY, fill=TEXT):
    x1, y1, x2, y2 = box
    bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=6)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = x1 + (x2 - x1 - tw) / 2
    y = y1 + (y2 - y1 - th) / 2
    txt(draw, (x, y), text, font=font, fill=fill)


def arrow(draw, p1, p2, fill=ACCENT2, width=7, head=18):
    draw.line([p1, p2], fill=fill, width=width)
    x1, y1 = p1
    x2, y2 = p2
    if abs(x2 - x1) >= abs(y2 - y1):
        if x2 >= x1:
            pts = [(x2, y2), (x2 - head, y2 - head / 2), (x2 - head, y2 + head / 2)]
        else:
            pts = [(x2, y2), (x2 + head, y2 - head / 2), (x2 + head, y2 + head / 2)]
    else:
        if y2 >= y1:
            pts = [(x2, y2), (x2 - head / 2, y2 - head), (x2 + head / 2, y2 - head)]
        else:
            pts = [(x2, y2), (x2 - head / 2, y2 + head), (x2 + head / 2, y2 + head)]
    draw.polygon(pts, fill=fill)


def badge(draw, x, y, text, fill=ACCENT2):
    draw.ellipse((x, y, x + 52, y + 52), fill=fill)
    center_text(draw, (x, y, x + 52, y + 52), text, font=TAG, fill="white")


def caption(draw, title, subtitle):
    txt(draw, (80, 54), title, font=TITLE, fill=TEXT)
    txt(draw, (82, 128), subtitle, font=BODY, fill=MUTED)


def save(img: Image.Image, name: str):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img.save(OUT_DIR / name, format="PNG")


def fig_a():
    img, d = canvas()
    caption(d, "图 A  项目总体架构图", "桌面宿主、教学工作台、服务层、XEduHub工具箱与课程资源层的整体关系")

    cols = [(90, 260, 560, 1180), (640, 260, 1110, 1180), (1190, 260, 1660, 1180), (1740, 260, 2310, 1180)]
    titles = [
        ("用户与宿主", "教师 / 学生\nElectron 桌面宿主"),
        ("教学工作台", "HTML 体验\nBlockly 实践\nJupyter 应用创新"),
        ("服务与能力", "课程资源\n课堂接入\n同步更新\nAI 助教"),
        ("工具箱与资源", "XEduHub 工具箱\n本地课程目录\n云端课程仓库"),
    ]
    colors = ["#ECFDF5", "#EFF6FF", "#F5F3FF", "#FFF7ED"]
    for box, (head, body), fill in zip(cols, titles, colors):
        rr(d, box, fill=fill, outline=LINE, width=3, radius=26)
        txt(d, (box[0] + 26, box[1] + 24), head, font=H1, fill=TEXT)
        txt(d, (box[0] + 26, box[1] + 100), body, font=BODY, fill=MUTED)
    arrow(d, (560, 720), (640, 720))
    arrow(d, (1110, 720), (1190, 720))
    arrow(d, (1660, 720), (1740, 720))
    txt(d, (420, 650), "窗口管理 / 进程编排", font=SMALL, fill=MUTED)
    txt(d, (970, 650), "统一实验入口", font=SMALL, fill=MUTED)
    txt(d, (1540, 650), "能力调用与资源同步", font=SMALL, fill=MUTED)
    save(img, "figure_a_architecture.png")


def fig_b():
    img, d = canvas()
    caption(d, "图 B  核心问题到解决路径映射图", "从真实教学问题出发，对应平台能力与机制")
    left_x1, left_x2 = 100, 980
    right_x1, right_x2 = 1420, 2300
    ys = [280, 490, 700, 910]
    left = [
        "实验环境问题\nJupyter、Blockly、数据与模型资源分散",
        "学习路径断裂问题\n体验、实践、创新缺少连续推进",
        "AI实验能力分散问题\n图像、模型、流程、结果能力分散",
        "课程共享与更新问题\n课程需要持续修订、同步与复用",
    ]
    right = [
        "环境承载与统一入口\n统一工作台承载实验运行",
        "HTML—Blockly—Jupyter 主线\n体验 → 实践 → 应用创新",
        "XEduHub 完整工具箱\n统一支撑输入、模型、流程、结果",
        "教师课程分享与更新机制\n导入、上传、拉取、课堂接入、再修订",
    ]
    lfill = "#FEF2F2"
    rfill = "#ECFDF5"
    for i, y in enumerate(ys):
        rr(d, (left_x1, y, left_x2, y + 140), fill=lfill, outline="#FCA5A5", width=3)
        rr(d, (right_x1, y, right_x2, y + 140), fill=rfill, outline="#6EE7B7", width=3)
        badge(d, left_x1 + 18, y + 18, str(i + 1), fill=ACCENT4)
        badge(d, right_x1 + 18, y + 18, str(i + 1), fill=ACCENT)
        txt(d, (left_x1 + 90, y + 24), left[i], font=BODY, fill=TEXT)
        txt(d, (right_x1 + 90, y + 24), right[i], font=BODY, fill=TEXT)
        arrow(d, (left_x2, y + 70), (right_x1, y + 70), fill=ACCENT2, width=6)
    save(img, "figure_b_problem_solution_map.png")


def fig_c():
    img, d = canvas()
    caption(d, "图 C  HTML—Blockly—Jupyter 学习主线图", "不是三个并列入口，而是体验—实践—应用创新的连续学习 progression")
    boxes = [
        (120, 330, 720, 970, "#FFF7ED", "#F59E0B", "1", "HTML（体验）", "任务感知\n理解任务目标、现象与问题"),
        (900, 330, 1500, 970, "#EFF6FF", "#2563EB", "2", "Blockly（实践）", "流程理解\n可视化搭建、验证与动手实践"),
        (1680, 330, 2280, 970, "#F5F3FF", "#7C3AED", "3", "Jupyter（应用创新）", "代码扩展\n修改参数、验证结果与创新应用"),
    ]
    for x1, y1, x2, y2, fill, outline, num, title, body in boxes:
        rr(d, (x1, y1, x2, y2), fill=fill, outline=outline, width=4, radius=28)
        badge(d, x1 + 24, y1 + 24, num, fill=outline)
        txt(d, (x1 + 100, y1 + 30), title, font=H1, fill=TEXT)
        txt(d, (x1 + 48, y1 + 170), body, font=BODY, fill=MUTED)
        rr(d, (x1 + 48, y1 + 300, x2 - 48, y2 - 48), fill="#FFFFFF", outline=LINE, width=2, radius=20)
        center_text(d, (x1 + 48, y1 + 300, x2 - 48, y2 - 48), "该阶段的典型界面 / 行为", font=SMALL, fill=MUTED)
    arrow(d, (720, 650), (900, 650), fill=ACCENT2, width=8, head=22)
    arrow(d, (1500, 650), (1680, 650), fill=ACCENT2, width=8, head=22)
    save(img, "figure_c_learning_progression.png")


def fig_d():
    img, d = canvas()
    caption(d, "图 D  XEduHub 工具箱支撑图", "XEduHub 作为统一能力底座，同时服务 Blockly 与 Jupyter 两侧实验")
    rr(d, (860, 470, 1540, 880), fill="#ECFDF5", outline=ACCENT, width=5, radius=30)
    center_text(d, (860, 500, 1540, 650), "XEduHub\n完整工具箱", font=TITLE, fill=TEXT)
    center_text(d, (900, 680, 1500, 830), "统一支撑输入资源、模型调用、流程执行、结果呈现", font=BODY, fill=MUTED)
    nodes = [
        ((170, 280, 660, 500), "图像与输入资源", "图片 / 视频 / 资源路径"),
        ((170, 850, 660, 1070), "Blockly 侧实验", "任务块 / 运行流程 / 结果卡片"),
        ((1740, 280, 2230, 500), "模型调用与任务执行", "检测 / 分类 / OCR / 姿态等"),
        ((1740, 850, 2230, 1070), "Jupyter 侧实验", "代码调用 / 参数修改 / 创新扩展"),
    ]
    for box, head, body in nodes:
        rr(d, box, fill="#FFFFFF", outline=LINE, width=3, radius=24)
        txt(d, (box[0] + 24, box[1] + 26), head, font=H1, fill=TEXT)
        txt(d, (box[0] + 24, box[1] + 96), body, font=BODY, fill=MUTED)
    arrow(d, (660, 390), (860, 560), fill=ACCENT2, width=6)
    arrow(d, (660, 960), (860, 790), fill=ACCENT2, width=6)
    arrow(d, (1540, 560), (1740, 390), fill=ACCENT2, width=6)
    arrow(d, (1540, 790), (1740, 960), fill=ACCENT2, width=6)
    save(img, "figure_d_xeduhub_toolbox.png")


def fig_e():
    img, d = canvas()
    caption(d, "图 E  教师课程分享与更新机制图", "围绕“上一节、改一节、同步一节”构建动态课程资源闭环")
    cx, cy, r = 1200, 700, 350
    items = [
        ("1", "本地创建课程", 1200, 220),
        ("2", "导入 / 整理课节与实验", 1860, 520),
        ("3", "上传课程", 1860, 980),
        ("4", "课堂使用", 1200, 1180),
        ("5", "课后修订", 540, 980),
        ("6", "拉取更新 / 再分享", 540, 520),
    ]
    draw = d
    for num, label, x, y in items:
        rr(draw, (x - 220, y - 78, x + 220, y + 78), fill="#FFFFFF", outline=LINE, width=3, radius=24)
        badge(draw, x - 190, y - 26, num, fill=ACCENT3)
        txt(draw, (x - 120, y - 20), label, font=BODY, fill=TEXT)
    arrows = [
        ((1400, 270), (1690, 470)),
        ((1860, 600), (1860, 900)),
        ((1690, 1030), (1400, 1130)),
        ((1000, 1130), (710, 1030)),
        ((540, 900), (540, 600)),
        ((710, 470), (1000, 270)),
    ]
    for a, b in arrows:
        arrow(draw, a, b, fill=ACCENT2, width=6)
    txt(draw, (930, 640), "课程资源持续迭代闭环", font=H1, fill=ACCENT)
    txt(draw, (980, 700), "上一节 · 改一节 · 同步一节", font=BODY, fill=MUTED)
    save(img, "figure_e_course_share_update.png")


def fig_f():
    img, d = canvas()
    caption(d, "图 F  典型课堂应用流程图", "教师备课、学生进入当前实验、Blockly 理解、Jupyter 实践与课后更新的完整路径")
    steps = [
        "教师备课",
        "开启课堂",
        "学生进入当前实验",
        "Blockly 理解流程",
        "Jupyter 实践与修改",
        "结果复盘与课后更新",
    ]
    x = 90
    y = 520
    bw = 320
    gap = 60
    fills = ["#FFF7ED", "#FEF2F2", "#EFF6FF", "#ECFDF5", "#F5F3FF", "#EEF2FF"]
    outlines = ["#F59E0B", "#EF4444", "#2563EB", "#10B981", "#7C3AED", "#4F46E5"]
    for i, step in enumerate(steps):
        box = (x + i * (bw + gap), y, x + i * (bw + gap) + bw, y + 260)
        rr(d, box, fill=fills[i], outline=outlines[i], width=4, radius=24)
        badge(d, box[0] + 18, box[1] + 18, str(i + 1), fill=outlines[i])
        txt(d, (box[0] + 86, box[1] + 24), step, font=H1, fill=TEXT)
        if i < len(steps) - 1:
            arrow(d, (box[2], y + 130), (box[2] + gap, y + 130), fill=ACCENT2, width=7, head=18)
    save(img, "figure_f_classroom_flow.png")


def main():
    fig_a()
    fig_b()
    fig_c()
    fig_d()
    fig_e()
    fig_f()


if __name__ == "__main__":
    main()
