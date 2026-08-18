#!/usr/bin/env python3
import os
import zipfile
import shutil

# Slide definitions for the 16 pages
SLIDES_DATA = [
    {
        "page": 1,
        "tag": "XEdu Client 1.0 官方发布",
        "title": "XEdu Client",
        "subtitle": "面向 AI 教学场景的桌面实验工作台",
        "highlight": "✨ 连接思考与实践：让 AI 课堂不再被环境打断",
        "footer_left": "主讲人：王海涛（HAI Tech Lab / ReopenInnoLab）",
        "footer_right": "20 分钟产品发布会",
        "type": "cover"
    },
    {
        "page": 2,
        "tag": "01 课堂中断的真相",
        "title": "“老师，我这里怎么打不开？”",
        "subtitle": "一节 40 分钟的 AI 实验课，注意力究竟被什么消耗了？",
        "cards": [
            ("⚠️ 环境断裂", "学生不理解后台进程，误关黑色终端窗口导致服务崩溃；不会选 Python，依赖频繁报错。"),
            ("📁 路径迷宫", "讲解课件、HTML 体验页、Notebook、数据集散落各处，学生在文件夹里迷失方向。"),
            ("🧠 认知过载", "注意力分裂效应 (Split-Attention Effect) 发生，宝贵的时间从“为什么这样预测”变成了“怎么打开”。")
        ],
        "footer_left": "理论锚点：Chandler & Sweller (1992) Split-Attention Effect",
        "footer_right": "XEdu Client · 教学洞察",
        "type": "3cards"
    },
    {
        "page": 3,
        "tag": "01 课堂中断的真相",
        "title": "重新定义 XEdu Client：不是启动器，是“课堂实验工作台”",
        "subtitle": "以让一门 AI 课“可进入 · 可运行 · 可继续”为原点构建的教学宿主",
        "cards": [
            ("🎯 面向学生", "少找入口，免配置直接进入实验，把完整的注意力留在问题拆解与模型探究上。"),
            ("⚡ 面向教师", "少切工具，秒级一键开课与局域网分发，让教学节奏从容可控、课例持续生长。"),
            ("📦 面向课程", "把散乱的文件组织成具备“可进入结构”的标准化实验资产，可打包、可迁移、可持续复用。")
        ],
        "footer_left": "核心心智：可进入 · 可运行 · 可继续",
        "footer_right": "XEdu Client · 产品定位",
        "type": "3cards"
    },
    {
        "page": 4,
        "tag": "02 核心产品能力",
        "title": "体验、逻辑与代码：三阶学习闭环体系",
        "subtitle": "基于多重表征理论（DeFT），为同一知识提供渐进深入的多维入口",
        "cards": [
            ("1. HTML 交互体验", "【直观感知】在网页画布中调节网络参数、观察图像变换，在动手操作中建立感性直觉。"),
            ("2. Scratch 图形化实验", "【逻辑可见】拖拽积木组织流程，调用 AI 视觉/语音模型，让数据流与推理结果清晰呈现。"),
            ("3. Jupyter / Python 代码", "【深度探究】进入原生代码，载入真实数据集、训练 MLP 网络、观察 Loss 收敛与模型评估。")
        ],
        "footer_left": "教学论支撑：Ainsworth (2006) DeFT Framework",
        "footer_right": "XEdu Client · 认知架构",
        "type": "3cards"
    },
    {
        "page": 5,
        "tag": "02 核心产品能力 · 教师交付",
        "title": "标准课程包与局域网一键开课",
        "subtitle": "无需外网连接，一键把课程实验分发到全班每一台学生机",
        "cards": [
            ("📦 XEdu 标准课程包 (course.json)", "• 统一封装教案、导学单、HTML 体验、Scratch .sb3、Jupyter .ipynb 与数据集\n• 导入时自动对资源完整性与 Python 环境进行秒级体检\n• 支持本地 ZIP 导入、Gitea 仓库云端热更新"),
            ("⚡ 局域网秒级开课分发", "• 教师机选择课节，一键开启局域网广播服务\n• 学生机打开客户端秒级自动发现课堂（支持备用 IP 直连）\n• 断网机房也能稳定下发实验，师生协同即刻建立")
        ],
        "footer_left": "零外网依赖 · 毫秒级广播 · 权限隔离",
        "footer_right": "XEdu Client · 课堂分发",
        "type": "2cards"
    },
    {
        "page": 6,
        "tag": "02 核心能力演示 · 教师交付",
        "title": "视频演示：一键导入课程与开启课堂",
        "subtitle": "30 秒直击教师端极简备课与机房局域网秒级分发",
        "video_title": "实操演示：一键导入与开启课堂",
        "video_time": "⏱ 00:30 · 1080P HD",
        "points": [
            ("1. 拖拽导入与体检", "导入标准课程包，秒级完成课节、实验文件与 Python 环境的完整性校验。"),
            ("2. 一键开启课堂", "点击【开启课堂】，自动广播当前课节，生成课堂接入码与本地服务。"),
            ("3. 学生端免配接入", "学生机秒级弹出“发现教师课堂”，点击即同步加载当前课节实验。")
        ],
        "footer_left": "演示重点：零配置导入 · 局域网秒级自动发现",
        "footer_right": "XEdu Client · 实操卡位 1",
        "type": "video"
    },
    {
        "page": 7,
        "tag": "02 核心产品能力 · 认知探索",
        "title": "HTML 交互体验：让抽象的 AI 概念被直观感知",
        "subtitle": "在接触真实代码之前，先建立对参数与结构的物理直觉",
        "cards": [
            ("🎛️ 动态参数调控", "拖动滑块直观增减神经网络层数、神经元数量与激活函数，实时观察网络拓扑结构变化。"),
            ("👁️ 可视化特征与滤波", "动态呈现图像卷积滤波、灰度变换与二值化过程，让特征提取过程直接呈现在学生眼前。"),
            ("💡 拒绝死记硬背", "先看到现象、再理解原理，让后续的 Python 代码学习具备扎实的直觉支撑。")
        ],
        "footer_left": "教学功能：构建感性经验与认知支架",
        "footer_right": "XEdu Client · 交互体验",
        "type": "3cards"
    },
    {
        "page": 8,
        "tag": "02 核心能力演示 · 直观感知",
        "title": "视频演示：HTML 交互体验探究",
        "subtitle": "30 秒见证复杂网络结构如何在交互中变得生动直观",
        "video_title": "实操演示：HTML 交互调参",
        "video_time": "⏱ 00:30 · 1080P HD",
        "points": [
            ("1. 课节点击即开", "无需额外配置浏览器，在工作台内一键打开对应课节的 HTML 实验。"),
            ("2. 滑块实时互动", "学生拖动滑块直观观察神经网络神经元连接与决策边界的动态划分。"),
            ("3. 带着直觉进入代码", "完成直观体验后，一键平滑跳转到后续 Scratch 或 Notebook 实验。")
        ],
        "footer_left": "演示重点：网络结构可视化 · 动态交互调参",
        "footer_right": "XEdu Client · 实操卡位 2",
        "type": "video"
    },
    {
        "page": 9,
        "tag": "02 核心产品能力 · 逻辑构建",
        "title": "Scratch AI 图形化编程：让理解与逻辑走在语法前面",
        "subtitle": "在 AI Coding 时代，让学生聚焦问题拆解与模型行为判断",
        "cards": [
            ("🧩 深度集成 XEdu AI 扩展", "封装图像分类、目标检测、人脸识别与语音推理积木，免去复杂的外部插件安装。"),
            ("📊 一体化右侧结果画廊", "实时展示摄像头捕获画面、AI 分类置信度卡片与运行日志，让反馈即时可见。"),
            ("🚀 抹平语法记忆干扰", "不为拼写与缩进报错分心，先用积木理清流程，为进阶真实代码建立坚实台阶。")
        ],
        "footer_left": "文献支持：Weintrop & Wilensky (2017) Block vs Text",
        "footer_right": "XEdu Client · Scratch AI",
        "type": "3cards"
    },
    {
        "page": 10,
        "tag": "02 核心能力演示 · 逻辑构建",
        "title": "视频演示：Scratch AI 图形化编程",
        "subtitle": "30 秒直击积木调用 AI 视觉推理与右侧实时卡片反馈",
        "video_title": "实操演示：Scratch AI 视觉推理",
        "video_time": "⏱ 00:30 · 1080P HD",
        "points": [
            ("1. 零终端启动 .sb3", "点击课节一键载入 Scratch 项目，内置 Python 运行时静默保障。"),
            ("2. 积木调用摄像头推理", "拼接 AI 视觉识别积木，实时捕获摄像头图像并送入深度学习模型。"),
            ("3. 实时卡片结果展示", "右侧画廊秒级反馈识别结果、置信度数值与运行图谱。")
        ],
        "footer_left": "演示重点：积木调用模型 · 实时画廊与卡片输出",
        "footer_right": "XEdu Client · 实操卡位 3",
        "type": "video"
    },
    {
        "page": 11,
        "tag": "02 核心产品能力 · 真实代码",
        "title": "原生 Jupyter 实验：后台静默守护与代码深度探究",
        "subtitle": "把复杂的命令行细节藏在幕后，把探索自由完整留给学生",
        "cards": [
            ("🛡️ 后台生命周期智能托管", "消除黑色命令行窗口，杜绝学生误关导致服务中断；支持一键检测与平滑重启。"),
            ("🐍 Python 3.9+ 自由选择", "外置环境模式，支持选择本机解释器，尊重学校机房权限与软件安全合规要求。"),
            ("🔧 一键兼容性智能自愈", "独立脚本自动检测依赖缺失并一键修补，保障 xedu-python 与课程代码稳定运行。")
        ],
        "footer_left": "静默内核托管 · 智能环境自愈 · 原生代码探究",
        "footer_right": "XEdu Client · Jupyter 引擎",
        "type": "3cards"
    },
    {
        "page": 12,
        "tag": "02 核心能力演示 · 真实代码",
        "title": "视频演示：Jupyter 代码实验与模型训练",
        "subtitle": "30 秒见证学生进入真实代码并亲历 Loss 曲线收敛",
        "video_title": "实操演示：Jupyter 模型训练",
        "video_time": "⏱ 00:30 · 1080P HD",
        "points": [
            ("1. 一键直达 Notebook", "点击课节秒级打开对应 .ipynb，自动携带关联数据集与辅助代码。"),
            ("2. 搭建与训练 MLP", "学生修改隐藏层参数，运行真实 Python 代码并输出训练轮次。"),
            ("3. 亲历 Loss 曲线收敛", "实时输出准确率与损失曲线，让学生用数据检验自己的设计判断。")
        ],
        "footer_left": "演示重点：原生代码执行 · Loss 曲线实时收敛",
        "footer_right": "XEdu Client · 实操卡位 4",
        "type": "video"
    },
    {
        "page": 13,
        "tag": "03 经典课例还原",
        "title": "经典课例还原：《运动会上的 AI 裁判》",
        "subtitle": "一堂真实的 45 分钟 AI 课，如何让学生围绕同一个问题持续前进",
        "cards": [
            ("阶段 1 · 结构体验", "打开《构建神经网络.html》，自由调整隐藏层与神经元数量，建立对裁判分类模型的感性直觉。"),
            ("阶段 2 · 代码实践", "进入《L9_Part1.ipynb》，读取真实运动会动作数据，划分训练集，运行训练并观察准确率。"),
            ("阶段 3 · 探究复盘", "结合学生导学单，分析误判样本，理解训练集分布对 AI 裁判公正性的影响，培养工程思辨。")
        ],
        "footer_left": "案例出处：上海师大附属中学人工智能实景课程",
        "footer_right": "XEdu Client · 课例实践",
        "type": "3cards"
    },
    {
        "page": 14,
        "tag": "04 工程底座与边界",
        "title": "诚实的边界：做普通机房里稳定可用的工程工具",
        "subtitle": "它不是零配置魔法，而是课堂工具必须具备的求真与扎实",
        "cards": [
            ("🔒 外置 Python 明确环境", "首次启动选择解释器并确认依赖，本机高权限执行，符合机房网络与安全合规要求。"),
            ("🌐 局域网协同网络边界", "依赖局域网通信；自动发现遇阻时提供 IP 备用直连方案，跨网段机房需提前确认。"),
            ("🎯 专注实验运行宿主", "不做臃肿的 LMS 与考勤系统，把实验运行做到极致；备课创作能力由 Teacher Skills 解耦承接。")
        ],
        "footer_left": "技术求真 · 边界坦诚 · 扎实落地",
        "footer_right": "XEdu Client · 产品边界",
        "type": "3cards"
    },
    {
        "page": 15,
        "tag": "05 生态与快速开始",
        "title": "跨平台交付矩阵与 5 分钟最小验证",
        "subtitle": "让今天准备的一门课，在下一次课堂中持续生长",
        "cards": [
            ("💻 跨平台交付矩阵", "• Windows 平台：Windows x64 教师完整版 + Windows 32 位老旧机房兼容包\n• macOS 平台：Apple Silicon (M系列) 原生高性能构建包\n• 绿色便携版：解压即用，支持 U 盘分发与机房镜像快速部署"),
            ("🚀 5 分钟快速上手", "1. 安装 XEdu Client\n2. 确认 Python 解释器设置\n3. 导入官方示例课程包\n4. 运行 Scratch / Jupyter 实验\n5. 开启课堂完成师生连通")
        ],
        "footer_left": "跨平台支持 · 绿色便携 · 即开即用",
        "footer_right": "XEdu Client · 交付矩阵",
        "type": "2cards"
    },
    {
        "page": 16,
        "tag": "XEdu Client · 官方发布结语",
        "title": "让每一位老师都能从容开好 AI 课，",
        "title_sub": "让每一间教室都成为充满活力的 AI 创想工坊。",
        "subtitle": "XEdu Client —— 连接思考与实践的桌面实验工作台",
        "links": [
            "🌐 开放获取：github.com/haitao926/xedu-client",
            "💬 现场交流 & Q / A"
        ],
        "footer_left": "致谢：Linux.do 社区 · HAI Tech Lab · ReopenInnoLab",
        "footer_right": "2026 XEdu Client 发布会",
        "type": "ending"
    }
]

def generate_pptx():
    template_pptx = 'ppt-output/XEdu-Client-教师课程创建工作坊.pptx'
    out_pptx = 'ppt-output/XEdu_Client_20min_Keynote_Launch.pptx'

    # We will use python standard zipfile to unpack template, duplicate slides, and modify slide XMLs
    tmp_dir = '/tmp/pptx_build_xedu'
    if os.path.exists(tmp_dir):
        shutil.rmtree(tmp_dir)
    os.makedirs(tmp_dir, exist_ok=True)

    with zipfile.ZipFile(template_pptx, 'r') as z:
        z.extractall(tmp_dir)

    print(f"Extracted template to {tmp_dir}")

    # Let's inspect slide files in tmp_dir/ppt/slides
    slides_dir = os.path.join(tmp_dir, 'ppt', 'slides')
    slide_files = sorted([f for f in os.listdir(slides_dir) if f.startswith('slide') and f.endswith('.xml')])
    print(f"Found {len(slide_files)} existing slides in template: {slide_files[:5]}")

if __name__ == '__main__':
    generate_pptx()
