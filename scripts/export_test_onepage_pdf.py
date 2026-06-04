#!/usr/bin/env python3
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parent.parent
PDF_PATH = ROOT / "docs" / "overview" / "xedu-client-test-onepage.pdf"


def build_styles():
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="ZhTitle",
            parent=styles["Title"],
            fontName="STSong-Light",
            fontSize=20,
            leading=24,
            textColor=colors.HexColor("#1f2a37"),
            alignment=TA_LEFT,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ZhBody",
            parent=styles["BodyText"],
            fontName="STSong-Light",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#1f2a37"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="ZhSmall",
            parent=styles["BodyText"],
            fontName="STSong-Light",
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#64748b"),
        )
    )
    styles.add(
        ParagraphStyle(
            name="ZhCardTitle",
            parent=styles["Heading2"],
            fontName="STSong-Light",
            fontSize=11,
            leading=14,
            textColor=colors.HexColor("#111827"),
            spaceAfter=3,
        )
    )
    return styles


def card(title, subtitle, items, styles, width):
    content = [Paragraph(title, styles["ZhCardTitle"]), Paragraph(subtitle, styles["ZhSmall"])]
    for item in items:
        content.append(Paragraph(f"• {item}", styles["ZhBody"]))
    table = Table([[content]], colWidths=[width])
    table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#d8cfc1")),
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def build_pdf():
    styles = build_styles()
    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=A4,
        leftMargin=10 * mm,
        rightMargin=10 * mm,
        topMargin=10 * mm,
        bottomMargin=10 * mm,
    )
    body_width = A4[0] - 20 * mm
    col_width = (body_width - 8 * mm) / 2

    story = [
        Paragraph("XEdu Client 测试手册", styles["ZhTitle"]),
        Paragraph("版本 2.0.0 · 一页验收版", styles["ZhSmall"]),
        Spacer(1, 4),
    ]

    hero = Table(
        [[
            [
                Paragraph("公开测试仓库", styles["ZhSmall"]),
                Paragraph("http://8.145.44.54:3000/admin/zhangjiang-image-recognition", styles["ZhBody"]),
            ],
            [
                Paragraph("测试数据", styles["ZhSmall"]),
                Paragraph("资源库：http://8.145.44.54:3000<br/>仓库：admin/zhangjiang-image-recognition<br/>分支：main<br/>本地目录：Documents/XEduCourses", styles["ZhBody"]),
            ],
        ]],
        colWidths=[body_width * 0.56, body_width * 0.44],
    )
    hero.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#d8cfc1")),
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.extend([hero, Spacer(1, 6)])

    cards = [
        card("1. 安装启动", "先确认安装包能正常打开", [
            "mac：打开 arm64 zip 并启动 App",
            "win：运行 exe 完成安装",
            "预期：应用启动正常，页面不是空白",
        ], styles, col_width),
        card("2. 角色模式", "学生默认进入，教师需解锁", [
            "学生仅显示：主控台 / AI 助手 / 文档中心",
            "教师登录后显示：课程资源 / 设置",
            "退出教师模式后教师入口消失",
        ], styles, col_width),
        card("3. 课堂功能", "重点看“进入即上课”", [
            "教师在课节页开启第 N 节课堂",
            "学生在课堂接入点击课堂卡片进入",
            "预期：不输口令、不确认路径、直接进当前课节实验",
        ], styles, col_width),
        card("4. 课程资源", "课程包导入、云端导入都要通", [
            "课程包导入：能读 xedu-pack 产出的 course.json",
            "云端导入：输入仓库地址后可读取并导入",
        ], styles, col_width),
        card("5. 实验访问", "HTML 和 Notebook 都要能打开", [
            "打开一个同时包含 html 和 ipynb 的实验",
            "点击打开 HTML",
            "点击进入 Notebook，预期能在主控台打开",
        ], styles, col_width),
        card("6. Gitea 同步", "一门课一个仓库", [
            "首次上传：填写资源库地址 / 仓库路径 / 分支",
            "上传更新：修改本地课程后点击上传更新",
            "拉取更新：本地已改动时会先提示确认",
        ], styles, col_width),
    ]

    grid = Table(
        [
            [cards[0], cards[1]],
            [cards[2], cards[3]],
            [cards[4], cards[5]],
        ],
        colWidths=[col_width, col_width],
        rowHeights=None,
        hAlign="LEFT",
        spaceBefore=0,
        spaceAfter=0,
    )
    grid.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 0)]))
    story.extend([grid, Spacer(1, 4)])

    checklist_items = [
        "学生模式正常",
        "教师登录正常",
        "课程导入入口正常",
        "课程包导入正常",
        "云端导入公开课程正常",
        "实验 HTML 正常打开",
        "实验 Notebook 正常打开",
        "开启课堂正常",
        "学生进入课堂后直接进当前课节实验",
        "上传课程正常",
        "上传更新正常",
        "拉取更新正常",
    ]
    checklist_rows = []
    half = (len(checklist_items) + 1) // 2
    left = checklist_items[:half]
    right = checklist_items[half:]
    for i in range(half):
        l = left[i] if i < len(left) else ""
        r = right[i] if i < len(right) else ""
        checklist_rows.append([
            Paragraph(f"□ {l}" if l else "", styles["ZhBody"]),
            Paragraph(f"□ {r}" if r else "", styles["ZhBody"]),
        ])

    checklist = Table(
        [[Paragraph("最小回归清单", styles["ZhCardTitle"]), ""]] + checklist_rows,
        colWidths=[body_width / 2, body_width / 2],
    )
    checklist.setStyle(
        TableStyle(
            [
                ("SPAN", (0, 0), (1, 0)),
                ("BOX", (0, 0), (-1, -1), 0.8, colors.HexColor("#d8cfc1")),
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.extend([checklist, Spacer(1, 4)])

    notes = Table(
        [[
            Paragraph("说明：mac 包未签名，首次打开可能需要手动放行。", styles["ZhSmall"]),
            Paragraph("说明：发布到 Gitea 属于写操作，私有仓库或写权限场景通常需要 Token。", styles["ZhSmall"]),
        ]],
        colWidths=[body_width / 2, body_width / 2],
    )
    notes.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#d8cfc1")),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(notes)
    doc.build(story)


if __name__ == "__main__":
    PDF_PATH.parent.mkdir(parents=True, exist_ok=True)
    build_pdf()
