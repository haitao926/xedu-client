#!/usr/bin/env python3
import os
import json
import urllib.request
import ssl
import time
import sys

API_KEY = "sk-da8b5e42ca93febc32c4fe5c462a178e4fe406cadf8abcf61f8da41e7e5c1e6e"
BASE_URL = "https://api.osirclaw.com/v1/images/generations"
OUT_DIR = "ppt-output/slides_ai"
os.makedirs(OUT_DIR, exist_ok=True)

ctx = ssl._create_unverified_context()

def generate_slide_image(slide_num, prompt_text, out_filename):
    print(f"\n==========================================")
    print(f"Generating Slide P{slide_num:02d}: {out_filename}")
    print(f"==========================================")

    data = {
        "model": "gpt-image-2",
        "prompt": prompt_text,
        "n": 1,
        "size": "1024x1024"
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
                img_url = res["data"][0].get("url")
                if img_url:
                    print(f"Downloading from: {img_url}")
                    dst_path = os.path.join(OUT_DIR, out_filename)
                    req_dl = urllib.request.Request(img_url, headers={"User-Agent": "Mozilla/5.0"})
                    with urllib.request.urlopen(req_dl, context=ctx, timeout=60) as img_resp:
                        with open(dst_path, "wb") as f:
                            f.write(img_resp.read())
                    print(f"Saved: {dst_path} ({os.path.getsize(dst_path)/1024:.1f} KB)")
                    return True
            print("Failed: No URL in response:", res)
            return False
    except Exception as e:
        print(f"Error generating slide {slide_num}: {e}")
        if hasattr(e, "read"):
            print("Response body:", e.read().decode('utf-8')[:300])
        return False

PROMPTS = {
    1: ("A breathtaking tech product launch keynote presentation slide, 16:9 aspect ratio. "
        "Theme: Dark Tech Workshop (ultra-clean obsidian navy background, volumetric cyan glow). "
        "Top tag: 官方产品发布 Keynote. "
        "Massive bold headline in crisp white: XEdu Client. "
        "Subtitle in glowing cyan: 面向 AI 教学场景的桌面实验工作台. "
        "Bottom gold badge: 连接思考与实践：让 AI 课堂不再被环境打断. "
        "Right visual: Floating 3D glowing glass modular hub with Scratch block, Jupyter cell, neural node, and beam connecting classroom nodes. "
        "Apple keynote stage design, minimalist, 8k resolution."),

    2: ("A breathtaking tech product launch keynote presentation slide, 16:9 aspect ratio. "
        "Theme: Dark Tech Workshop (obsidian navy background with subtle amber/red ambient glow). "
        "Top tag: 01 课堂中断的真相. "
        "Massive bold headline in crisp white: 被环境吞噬的 40 分钟. "
        "Subtitle in amber gold: “老师，我这里怎么打不开？” "
        "Layout: 3 sleek floating dark glass cards side by side: "
        "1. ⚠️ 环境断裂 (黑窗误关 · 依赖报错) "
        "2. 🧭 路径迷宫 (文件散落 · 找不到入口) "
        "3. 🛑 认知过载 (还没思考 · 已被消耗). "
        "Bottom note: 认知心理学：注意力分裂效应 (Split-Attention Effect). "
        "Clean, spacious, high contrast tech aesthetic."),

    3: ("A breathtaking tech product launch keynote presentation slide, 16:9 aspect ratio. "
        "Theme: Dark Tech Workshop (obsidian navy background with bright cyan tech grid). "
        "Top tag: 01 起源与重构. "
        "Massive bold headline in crisp white: 回到浦育起点：接到本地的四件事. "
        "Subtitle in glowing cyan: 从线上平台到桌面机房，让 AI 学习在普通教室稳定发生. "
        "Layout: 4 sleek floating glass cards in 2x2 grid with cyan glowing borders: "
        "1. 🛡️ 稳定环境 (外置 Python 静默守护，告别黑窗与断网报错) "
        "2. 🌐 三层体验 (HTML 直观体验到 Scratch 逻辑到 Jupyter 代码) "
        "3. 📦 标准包开源共享 (全要素封装，格式统一，随处可迁) "
        "4. 🧩 兼容 XEdu-Pro (生态模型资产无缝向下承接). "
        "Clean, minimalist keynote aesthetic."),

    4: ("A breathtaking tech product launch keynote presentation slide, 16:9 aspect ratio. "
        "Theme: Dark Tech Workshop (obsidian black background with glowing 3-tier cyan flow). "
        "Top tag: 02 核心认知架构. "
        "Massive bold headline in crisp white: 体验 · 逻辑 · 代码. "
        "Subtitle in glowing cyan: 三阶认知递进闭环. "
        "Layout: 3 bold horizontal floating glass cards with flowing light arrows between them: "
        "1. 🌐 HTML 交互体验 (动态调参 · 直观感知) "
        "2. 🧩 Scratch 图形化逻辑 (流程可视 · 模型推理) "
        "3. 🐍 Jupyter 原生代码 (真实实践 · Loss 收敛). "
        "Bottom note: 多重表征理论 (DeFT) · 消除门槛 · 深度探究. "
        "Clean, uncluttered, premier keynote design."),

    5: ("A breathtaking tech product launch keynote presentation slide, 16:9 aspect ratio. "
        "Theme: Dark Tech Workshop (obsidian navy background). "
        "Top tag: 02 教师极简交付. "
        "Massive bold headline in crisp white: 统一课程包 · 局域网一键开课. "
        "Subtitle in glowing cyan: 标准 course.json 规范，全班学生秒级同步接入. "
        "Layout: "
        "Left side 3 sleek floating glass cards: "
        "1. 📦 全要素封装 (教案·实验·导学单·数据) "
        "2. ⚡ 局域网广播 (断网机房一键开课) "
        "3. 🚀 学生零配置 (点击即开无缝学习). "
        "Right side: A large 3D glowing glass course package cube broadcasting cyan light beams to classroom computers. "
        "Minimalist keynote stage design."),

    6: ("A keynote presentation slide, 16:9 aspect ratio. "
        "Theme: Dark Tech Workshop (obsidian navy background). "
        "Top tag: 02 核心能力演示 · 教师交付. "
        "Massive bold headline in white: 视频演示：一键导入与开启课堂. "
        "Subtitle in cyan: 30 秒直击教师端极简备课与机房局域网广播. "
        "Layout: "
        "Left side 3 structured bullet points in glowing glass cards: "
        "1. 拖入课程包，秒级体检就绪 "
        "2. 点击开启课堂，局域网秒级广播 "
        "3. 学生免配接入，一键同步开课. "
        "Right side: A sleek 16:9 glowing translucent glass video frame mockup with clean play icon button and timecode 00:30, displaying desktop UI of course import and classroom broadcast. "
        "Immaculate tech aesthetic."),

    7: ("A premier keynote presentation slide, 16:9 aspect ratio. "
        "Theme: Dark Tech Workshop (obsidian navy background with glowing cyan grid). "
        "Top tag: 02 认知入口一 · 直观感知. "
        "Massive bold headline in crisp white: HTML 交互：直观感知 AI. "
        "Subtitle in glowing cyan: 在写代码之前，先看见现象. "
        "Layout: "
        "Left side 3 sleek glass cards: "
        "1. 🎛️ 动态调参 (滑块实时调节隐藏层) "
        "2. 👁️ 特征可视 (卷积滤波与分类边界) "
        "3. 💡 建立直觉 (让原理看得见摸得着). "
        "Right side: Floating glowing UI card mockup of interactive neural network sliders and decision boundary graph. "
        "Minimalist, modern tech aesthetic."),

    8: ("A keynote presentation slide, 16:9 aspect ratio. "
        "Theme: Dark Tech Workshop (obsidian navy background). "
        "Top tag: 02 核心能力演示 · 直观感知. "
        "Massive bold headline in white: 视频演示：HTML 交互体验探究. "
        "Subtitle in cyan: 30 秒见证复杂网络结构如何在交互中变得直观. "
        "Layout: "
        "Left side 3 structured glass cards: "
        "1. 课节点击即开，工作台内一键直达 "
        "2. 滑块实时互动，动态划分决策边界 "
        "3. 带着直觉进代码，平滑跳转 Notebook. "
        "Right side: Sleek 16:9 glass video frame mockup with play icon and timecode 00:30 showing HTML neural sliders. "
        "Immaculate keynote aesthetic."),

    9: ("A premier keynote presentation slide, 16:9 aspect ratio. "
        "Theme: Dark Tech Workshop (obsidian navy background). "
        "Top tag: 02 认知入口二 · 逻辑构建. "
        "Massive bold headline in crisp white: Scratch AI：逻辑走在语法前面. "
        "Subtitle in glowing cyan: 在 AI 时代，聚焦问题拆解与模型行为. "
        "Layout: "
        "Left side 3 sleek glass cards: "
        "1. 🧩 XEdu AI 扩展 (视觉·语音·检测积木) "
        "2. 📊 一体化画廊 (摄像头与实时置信度) "
        "3. 🚀 零语法干扰 (逻辑理解优先). "
        "Right side: Floating UI card showing colorful Scratch AI blocks connected to a real-time webcam inference results gallery. "
        "Modern tech aesthetic."),

    10: ("A keynote presentation slide, 16:9 aspect ratio. "
         "Theme: Dark Tech Workshop (obsidian navy background). "
         "Top tag: 02 核心能力演示 · 逻辑构建. "
         "Massive bold headline in white: 视频演示：Scratch AI 图形化编程. "
         "Subtitle in cyan: 30 秒直击积木调用 AI 视觉推理与实时卡片反馈. "
         "Layout: "
         "Left side 3 structured glass cards: "
         "1. 零终端启动 .sb3，内置 Python 静默保障 "
         "2. 积木调用摄像头，实时送入模型推理 "
         "3. 实时卡片反馈，秒级输出置信度图谱. "
         "Right side: Sleek 16:9 glass video frame mockup with play icon and timecode 00:30 showing Scratch AI webcam recognition. "
         "Immaculate keynote aesthetic."),

    11: ("A premier keynote presentation slide, 16:9 aspect ratio. "
         "Theme: Dark Tech Workshop (obsidian navy background with blue glow). "
         "Top tag: 02 认知入口三 · 真实代码. "
         "Massive bold headline in crisp white: Jupyter：原生代码 · 静默守护. "
         "Subtitle in glowing cyan: 把复杂的命令行藏在幕后，把探索留给学生. "
         "Layout: "
         "Left side 3 sleek glass cards: "
         "1. 🛡️ 静默托管 (杜绝终端黑窗误关崩溃) "
         "2. 🐍 Python 自由 (支持本机 3.9+ 解释器) "
         "3. 🔧 依赖自愈 (一键检测修补环境). "
         "Right side: Glowing Jupyter Notebook code editor UI card with Loss convergence plot and Kernel Running pill. "
         "Modern minimalist tech aesthetic."),

    12: ("A keynote presentation slide, 16:9 aspect ratio. "
         "Theme: Dark Tech Workshop (obsidian navy background). "
         "Top tag: 02 核心能力演示 · 真实代码. "
         "Massive bold headline in white: 视频演示：Jupyter 代码与模型训练. "
         "Subtitle in cyan: 30 秒见证学生进入真实代码并亲历 Loss 曲线收敛. "
         "Layout: "
         "Left side 3 structured glass cards: "
         "1. 一键直达 Notebook，自动携带数据集 "
         "2. 搭建与训练 MLP，修改参数输出轮次 "
         "3. 亲历 Loss 收敛，用真实数据检验设计. "
         "Right side: Sleek 16:9 glass video frame mockup with play icon and timecode 00:30 showing Jupyter code execution and Loss curve animation. "
         "Immaculate keynote aesthetic."),

    13: ("A breathtaking tech product launch keynote presentation slide, 16:9 aspect ratio. "
         "Theme: Dark Tech Workshop (obsidian navy background, radiant cyan and purple AI workflow glow). "
         "Top tag: 03 教师做课赋能. "
         "Massive bold headline in crisp white: Teacher Skills：AI 时代教师做课流水线. "
         "Subtitle in glowing cyan: 从手工拼凑到 Agent 协同，轻松生成标准课程包. "
         "Layout: 3 sleek floating glass cards with glowing icons side by side: "
         "1. 🤖 AI 协同做课 (从教学目标一键自动化生成 HTML、.sb3、.ipynb 三层实验) "
         "2. 📐 标准规范检查 (自动校验三层闭环与数据集依赖完整性) "
         "3. ⚡ 极简创作门槛 (告别繁琐脚手架代码，专注教学设计本身). "
         "Bottom note: 让每位教师都能成为高效的 AI 课程创作者. "
         "Clean, uncluttered, premier keynote stage design."),

    14: ("A breathtaking tech product launch keynote presentation slide, 16:9 aspect ratio. "
         "Theme: Dark Tech Workshop (obsidian navy background with glowing git network lines connecting cities). "
         "Top tag: 03 开源共享与教研生态. "
         "Massive bold headline in crisp white: 老师也是开发者，课堂也是仓库. "
         "Subtitle in glowing cyan: 像程序员一样共享自己的课，让好课在另一座城市接着教. "
         "Layout: 3 sleek floating glass cards with glowing icons: "
         "1. 🧑‍💻 像程序员一样共享 (教研沉淀为 Git 仓库，有版本、可迭代) "
         "2. 🌐 自建 Gitea 课程源 (学校/区域自建课程中心，一键发布与同步) "
         "3. 🚀 另一座城市接着教 (跨校一键 Pull 拉取，优质 AI 课随处流动). "
         "Right visual: A glowing 3D Earth / network showing a course repo beamed from one city node to another city classroom. "
         "Spacious, inspiring keynote stage aesthetic."),

    15: ("A breathtaking tech product launch keynote presentation slide, 16:9 aspect ratio. "
         "Theme: Dark Tech Workshop (obsidian navy background with warm cyan and gold ambient glow). "
         "Top tag: 04 致谢与开源共创. "
         "Massive bold headline in crisp white: 一起把它做大：致谢与社区共创. "
         "Subtitle in glowing cyan: 让“一个人的课堂”，长成“一群人的课程库”. "
         "Layout: "
         "Left side: Sleek floating translucent glass card with gratitude list: "
         "★ 项目指导：谢作如老师 · Eason\n"
         "💻 软件贡献：王海涛、邱奕盛\n"
         "🧪 测试贡献：刘啸宇、洪丹妮、郑祥、刘正云\n"
         "Right side: Floating glass card with callout: '代码可以开源，课程也该一样；把你的名字写进软件里' and a prominent glowing QR code placeholder box labeled '扫码加入共建 / 提交需求'. "
         "Clean, heartwarming, premier keynote stage design."),

    16: ("A breathtaking tech product launch keynote presentation slide, 16:9 aspect ratio. "
         "Theme: Dark Tech Workshop (radiant central volumetric cyan glow on obsidian background). "
         "Top tag: XEdu Client · 官方发布结语. "
         "Massive bold elegant headline in crisp white: 让每一位老师都能从容开好 AI 课， "
         "Second headline in glowing cyan: 让每一间教室都成为充满活力的 AI 创想工坊。 "
         "Subtitle below: XEdu Client —— 连接思考与实践的桌面实验工作台. "
         "Bottom pills: 🌐 开放获取：github.com/haitao926/xedu-client | 📱 公众号：HAI Tech Lab [附二维码]. "
         "Breathtaking keynote ending stage design.")
}

def generate_all(slides=None):
    if slides is None:
        slides = sorted(PROMPTS.keys())
    for s in slides:
        prompt = PROMPTS[s]
        filename = f"slide_{s:02d}.jpg"
        success = generate_slide_image(s, prompt, filename)
        if not success:
            print(f"FAILED on slide {s}, pausing 5s before continuing...")
            time.sleep(5)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        targets = [int(x) for x in sys.argv[1:]]
        generate_all(targets)
    else:
        print("Usage: python3 generate_osirclaw_slides.py <slide_numbers...>")
        print("Example: python3 generate_osirclaw_slides.py 3 13 14 15")
