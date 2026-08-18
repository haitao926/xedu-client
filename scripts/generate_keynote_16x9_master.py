#!/usr/bin/env python3
import os
import json
import urllib.request
import ssl
import time
import sys
import base64

API_KEY = "sk-da8b5e42ca93febc32c4fe5c462a178e4fe406cadf8abcf61f8da41e7e5c1e6e"
BASE_URL = "https://api.osirclaw.com/v1/images/generations"
OUT_DIR = "ppt-output/slides_ai"
os.makedirs(OUT_DIR, exist_ok=True)

ctx = ssl._create_unverified_context()

# Master Keynote Prompts (Strict 16:9, Ultra-Minimal Text, Apple/Tesla Keynote Luxury Aesthetic)
KEYNOTE_PROMPTS = {
    1: ("A breathtaking luxury tech product launch keynote slide, 16:9 widescreen format (1792x1024). "
        "Theme: Dark Tech Workshop (obsidian navy background, deep cyber cyan volumetric light glow, immense negative space). "
        "Typography: Refined, elegant, not oversized. "
        "Top pill badge: XEDU CLIENT · 官方发布. "
        "Main Headline in crisp white: XEdu Client. "
        "Subtitle in radiant cyan: 面向 AI 教学场景的桌面实验工作台. "
        "Bottom gold badge: 连接思考与实践 · 让 AI 课堂不再被环境打断. "
        "Right visual: A stunning floating 3D frosted glass cube with glowing AI modular nodes (Scratch, Jupyter, Neural Graph) projecting light to classroom nodes. "
        "Apple keynote launch event aesthetic, spacious, high-end 8k render."),

    2: ("A breathtaking luxury tech product launch keynote slide, 16:9 widescreen format (1792x1024). "
        "Theme: Dark Tech Workshop (obsidian black background with subtle ambient amber/crimson glow, generous negative space). "
        "Top pill badge: 01 痛点洞察. "
        "Main Headline in crisp white: 被环境吞噬的 40 分钟. "
        "Subtitle in warm amber gold: “老师，我这里怎么打不开？” "
        "Layout: 3 sleek floating dark frosted glass cards side by side: "
        "Card 1: ⚠️ 环境断裂 (黑窗误关 · 依赖报错) "
        "Card 2: 🧭 路径迷宫 (文件散落 · 找不到入口) "
        "Card 3: 🛑 认知过载 (还没思考 · 已被消耗). "
        "Bottom subtitle: 注意力分裂效应 (Split-Attention Effect). "
        "Spacious, dramatic, minimalist keynote design."),

    3: ("A breathtaking luxury tech product launch keynote slide, 16:9 widescreen format (1792x1024). "
        "Theme: Dark Tech Workshop (obsidian background with cyan tech grid lines, ample negative space). "
        "Top pill badge: 01 起源与重构. "
        "Main Headline in crisp white: 回到浦育起点：接到本地的四件事. "
        "Subtitle in radiant cyan: 让 AI 学习在普通教室稳定发生. "
        "Layout: 4 sleek floating frosted glass cards with glowing cyan borders (2x2 grid): "
        "1. 🛡️ 稳定环境 (外置 Python 静默守护) "
        "2. 🌐 三层体验 (HTML 体验 · Scratch 逻辑 · Jupyter 代码) "
        "3. 📦 开源标准包 (全要素封装随处可迁) "
        "4. 🧩 兼容 XEdu-Pro (向下兼容生态模型). "
        "Minimalist, elegant, premier keynote design."),

    4: ("A breathtaking luxury tech product launch keynote slide, 16:9 widescreen format (1792x1024). "
        "Theme: Dark Tech Workshop (obsidian background with 3-tier cyan glowing progression flow, clean negative space). "
        "Top pill badge: 02 核心认知架构. "
        "Main Headline in crisp white: 体验 · 逻辑 · 代码. "
        "Subtitle in radiant cyan: 三阶认知递进闭环. "
        "Layout: 3 horizontal floating frosted glass cards with luminous connecting arrows: "
        "1. 🌐 HTML 体验 (动态调参 · 直观感知) "
        "2. 🧩 Scratch 逻辑 (流程可视 · 模型推理) "
        "3. 🐍 Jupyter 代码 (真实实践 · Loss 收敛). "
        "Bottom note: 多重表征理论 (DeFT Framework) · 消除认知门槛. "
        "Ultra-clean Apple keynote stage design."),

    5: ("A breathtaking luxury tech product launch keynote slide, 16:9 widescreen format (1792x1024). "
        "Theme: Dark Tech Workshop (obsidian navy background, generous negative space). "
        "Top pill badge: 02 教师极简交付. "
        "Main Headline in crisp white: 统一课程包 · 局域网开课. "
        "Subtitle in radiant cyan: 标准 course.json 封装，全班秒级同步接入. "
        "Layout: "
        "Left side 3 sleek floating frosted glass cards: "
        "1. 📦 全要素封装 (教案·实验·数据) "
        "2. ⚡ 局域网广播 (断网机房一键开课) "
        "3. 🚀 学生零配置 (点击即开无缝学习). "
        "Right side: Floating 3D glowing glass course package cube beaming cyan light to classroom desktop nodes. "
        "Cinematic keynote stage aesthetic."),

    6: ("A keynote presentation slide, 16:9 widescreen format (1792x1024). "
        "Theme: Dark Tech Workshop (obsidian navy background, spacious layout). "
        "Top pill badge: 02 实操演示 1. "
        "Main Headline in crisp white: 视频演示：一键导入与开启课堂. "
        "Subtitle in cyan: 30 秒直击教师端极简备课与局域网广播. "
        "Layout: "
        "Left side 3 structured glass cards: "
        "1. 拖入课程包，秒级体检就绪 "
        "2. 点击开启课堂，局域网秒级广播 "
        "3. 学生免配接入，一键同步开课. "
        "Right side: A sleek 16:9 glowing glass video player frame with clean play icon and timecode 00:30. "
        "Immaculate keynote video showcase aesthetic."),

    7: ("A breathtaking luxury tech product launch keynote slide, 16:9 widescreen format (1792x1024). "
        "Theme: Dark Tech Workshop (obsidian navy background with glowing neural grid, generous negative space). "
        "Top pill badge: 02 认知入口一 · 直观感知. "
        "Main Headline in crisp white: HTML 交互：直观感知 AI. "
        "Subtitle in radiant cyan: 在写代码之前，先看见现象. "
        "Layout: "
        "Left side 3 sleek glass cards: "
        "1. 🎛️ 动态调参 (滑块调节隐藏层数) "
        "2. 👁️ 特征可视 (卷积滤波与分类边界) "
        "3. 💡 建立直觉 (让原理看得见摸得着). "
        "Right side: Glowing frosted glass UI card mockup of interactive neural network sliders and decision boundary curve. "
        "Minimalist, modern, premium keynote aesthetic."),

    8: ("A keynote presentation slide, 16:9 widescreen format (1792x1024). "
        "Theme: Dark Tech Workshop (obsidian navy background, spacious layout). "
        "Top pill badge: 02 实操演示 2. "
        "Main Headline in crisp white: 视频演示：HTML 交互体验探究. "
        "Subtitle in cyan: 30 秒见证复杂网络结构如何在交互中变得直观. "
        "Layout: "
        "Left side 3 structured glass cards: "
        "1. 课节点击即开，工作台内直达 "
        "2. 滑块实时互动，动态划分决策边界 "
        "3. 带着直觉进代码，无缝跳转 Notebook. "
        "Right side: Sleek 16:9 glowing glass video player frame with clean play icon and timecode 00:30. "
        "Immaculate keynote video showcase aesthetic."),

    9: ("A breathtaking luxury tech product launch keynote slide, 16:9 widescreen format (1792x1024). "
        "Theme: Dark Tech Workshop (obsidian navy background with blue glow, spacious layout). "
        "Top pill badge: 02 认知入口二 · 逻辑构建. "
        "Main Headline in crisp white: Scratch AI：逻辑走在语法前面. "
        "Subtitle in radiant cyan: 在 AI 时代，聚焦问题拆解与模型行为. "
        "Layout: "
        "Left side 3 sleek glass cards: "
        "1. 🧩 XEdu AI 扩展 (视觉·语音·检测积木) "
        "2. 📊 一体化画廊 (摄像头与实时置信度) "
        "3. 🚀 零语法干扰 (逻辑理解优先). "
        "Right side: Glowing UI mockup card showing colorful Scratch AI blocks connected to a real-time webcam inference results gallery. "
        "Minimalist, modern tech aesthetic."),

    10: ("A keynote presentation slide, 16:9 widescreen format (1792x1024). "
         "Theme: Dark Tech Workshop (obsidian navy background, spacious layout). "
         "Top pill badge: 02 实操演示 3. "
         "Main Headline in crisp white: 视频演示：Scratch AI 图形化编程. "
         "Subtitle in cyan: 30 秒直击积木调用 AI 视觉推理与实时卡片反馈. "
         "Layout: "
         "Left side 3 structured glass cards: "
         "1. 零终端启动 .sb3，内置 Python 静默保障 "
         "2. 积木调用摄像头，实时送入模型推理 "
         "3. 实时卡片反馈，秒级输出置信度图谱. "
         "Right side: Sleek 16:9 glowing glass video player frame with clean play icon and timecode 00:30 showing Scratch webcam AI blocks. "
         "Immaculate keynote aesthetic."),

    11: ("A breathtaking luxury tech product launch keynote slide, 16:9 widescreen format (1792x1024). "
         "Theme: Dark Tech Workshop (obsidian navy background with cobalt glow, spacious layout). "
         "Top pill badge: 02 认知入口三 · 真实代码. "
         "Main Headline in crisp white: Jupyter：原生代码 · 静默守护. "
         "Subtitle in radiant cyan: 把复杂的命令行藏在幕后，把探索留给学生. "
         "Layout: "
         "Left side 3 sleek glass cards: "
         "1. 🛡️ 静默托管 (杜绝黑窗误关崩溃) "
         "2. 🐍 Python 自由 (支持本机 3.9+ 解释器) "
         "3. 🔧 依赖自愈 (一键检测修补环境). "
         "Right side: Glowing Jupyter Notebook code editor UI card with Loss convergence plot and Kernel Running pill. "
         "Modern minimalist tech aesthetic."),

    12: ("A keynote presentation slide, 16:9 widescreen format (1792x1024). "
         "Theme: Dark Tech Workshop (obsidian navy background, spacious layout). "
         "Top pill badge: 02 实操演示 4. "
         "Main Headline in crisp white: 视频演示：Jupyter 代码与模型训练. "
         "Subtitle in cyan: 30 秒见证学生进入真实代码并亲历 Loss 曲线收敛. "
         "Layout: "
         "Left side 3 structured glass cards: "
         "1. 一键直达 Notebook，自动携带数据集 "
         "2. 搭建与训练 MLP，修改参数输出轮次 "
         "3. 亲历 Loss 收敛，用真实数据检验设计. "
         "Right side: Sleek 16:9 glowing glass video player frame with clean play icon and timecode 00:30 showing Jupyter code and Loss curve animation. "
         "Immaculate keynote aesthetic."),

    13: ("A breathtaking luxury tech product launch keynote slide, 16:9 widescreen format (1792x1024). "
         "Theme: Dark Tech Workshop (obsidian navy background with luminous violet and cyan AI flow glow, ample negative space). "
         "Top pill badge: 03 教师做课赋能. "
         "Main Headline in crisp white: Teacher Skills：AI 时代教师做课流水线. "
         "Subtitle in radiant cyan: 从手工拼凑到 Agent 协同，轻松生成标准课程包. "
         "Layout: 3 sleek floating frosted glass cards side by side: "
         "1. 🤖 AI 协同做课 (从教学目标一键自动化生成三层实验) "
         "2. 📐 标准规范检查 (自动校验三层闭环与数据完整性) "
         "3. ⚡ 极简创作门槛 (告别繁琐脚手架代码，专注教学设计). "
         "Bottom note: 让每位教师都能成为高效的 AI 课程创作者. "
         "Apple keynote launch event aesthetic."),

    14: ("A breathtaking luxury tech product launch keynote slide, 16:9 widescreen format (1792x1024). "
         "Theme: Dark Tech Workshop (obsidian navy background with glowing git network lines connecting cities, spacious layout). "
         "Top pill badge: 03 开源共享与教研生态. "
         "Main Headline in crisp white: 老师也是开发者，课堂也是仓库. "
         "Subtitle in radiant cyan: 像程序员一样共享自己的课，让好课在另一座城市接着教. "
         "Layout: "
         "Left side 3 sleek floating glass cards: "
         "1. 🧑‍💻 像程序员一样共享 (教研沉淀为 Git 仓库) "
         "2. 🌐 自建 Gitea 课程源 (学校区域一键发布同步) "
         "3. 🚀 另一座城市接着教 (跨校一键 Pull 自由流转). "
         "Right side: A glowing 3D Earth globe showing a course repo beamed from one city node to another city classroom. "
         "Spacious, inspiring keynote stage aesthetic."),

    15: ("A breathtaking luxury tech product launch keynote slide, 16:9 widescreen format (1792x1024). "
         "Theme: Dark Tech Workshop (obsidian navy background with warm amber and cyan ambient glow, spacious layout). "
         "Top pill badge: 04 致谢与开源共创. "
         "Main Headline in crisp white: 一起把它做大：致谢与社区共创. "
         "Subtitle in radiant cyan: 让“一个人的课堂”，长成“一群人的课程库”. "
         "Layout: "
         "Left side: Sleek floating frosted glass card with gratitude list: "
         "★ 项目指导：谢作如老师 · Eason\n"
         "💻 软件贡献：王海涛、邱奕盛\n"
         "🧪 测试贡献：刘啸宇、洪丹妮、郑祥、刘正云\n"
         "Right side: Floating glass card with callout: '代码可以开源，课程也该一样；把你的名字写进软件里' and a glowing QR code placeholder box labeled '扫码加入共建 / 提交需求'. "
         "Clean, heartwarming, premier keynote stage design."),

    16: ("A breathtaking luxury tech product launch keynote slide, 16:9 widescreen format (1792x1024). "
         "Theme: Dark Tech Workshop (radiant central volumetric cyan glow on obsidian background, expansive negative space). "
         "Top pill badge: XEdu Client · 官方发布结语. "
         "Main Headline in crisp white: 让每一位老师都能从容开好 AI 课， "
         "Second headline in radiant cyan: 让每一间教室都成为充满活力的 AI 创想工坊。 "
         "Subtitle below in soft silver: XEdu Client —— 连接思考与实践的桌面实验工作台. "
         "Bottom pills: 🌐 开放获取：github.com/haitao926/xedu-client | 📱 公众号：HAI Tech Lab [附二维码]. "
         "Breathtaking keynote ending stage design.")
}

def generate_slide_image(slide_num, prompt_text, out_filename):
    print(f"\n==========================================")
    print(f"Generating Slide P{slide_num:02d} (16:9 1792x1024): {out_filename}")
    print(f"==========================================")

    data = {
        "model": "gpt-image-2",
        "prompt": prompt_text,
        "n": 1,
        "size": "1792x1024"  # STRICT 16:9 Widescreen
    }

    req = urllib.request.Request(
        BASE_URL,
        data=json.dumps(data).encode('utf-8'),
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        }
    )

    start = time.time()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=240) as resp:
            res = json.loads(resp.read().decode('utf-8'))
            elapsed = time.time() - start
            print(f"API Success in {elapsed:.1f}s!")

            if "data" in res and len(res["data"]) > 0:
                first = res["data"][0]
                dst_path = os.path.join(OUT_DIR, out_filename)

                # Check for direct URL
                if "url" in first and first["url"]:
                    img_url = first["url"]
                    print(f"Downloading 16:9 image from URL: {img_url}")
                    req_dl = urllib.request.Request(img_url, headers={"User-Agent": "Mozilla/5.0"})
                    with urllib.request.urlopen(req_dl, context=ctx, timeout=60) as img_resp:
                        with open(dst_path, "wb") as f:
                            f.write(img_resp.read())
                    print(f"Saved: {dst_path} ({os.path.getsize(dst_path)/1024:.1f} KB)")
                    return True
                # Check for b64_json
                elif "b64_json" in first and first["b64_json"]:
                    print("Decoding b64_json image...")
                    img_bytes = base64.b64decode(first["b64_json"])
                    with open(dst_path, "wb") as f:
                        f.write(img_bytes)
                    print(f"Saved b64: {dst_path} ({os.path.getsize(dst_path)/1024:.1f} KB)")
                    return True

            print("Failed: No URL or b64_json in response:", res)
            return False
    except Exception as e:
        print(f"Error generating slide {slide_num}: {e}")
        if hasattr(e, "read"):
            print("Response body:", e.read().decode('utf-8')[:300])
        return False

def generate_all(slides=None):
    if slides is None:
        slides = sorted(KEYNOTE_PROMPTS.keys())
    for s in slides:
        prompt = KEYNOTE_PROMPTS[s]
        filename = f"slide_{s:02d}.jpg"
        success = generate_slide_image(s, prompt, filename)
        if not success:
            print(f"FAILED on slide {s}, pausing 5s before continuing...")
            time.sleep(5)
        else:
            time.sleep(1)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        targets = [int(x) for x in sys.argv[1:]]
        generate_all(targets)
    else:
        print("Usage: python3 generate_keynote_16x9_master.py <slide_numbers...>")
        print("Example: python3 generate_keynote_16x9_master.py 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16")
