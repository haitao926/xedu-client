# XEdu Client

XEdu Client 是一套面向 AI 教学场景的桌面实验工作台。它把 `Jupyter` 代码实验、`Scratch` 图形化实验、课程资源管理、课堂接入和教师辅助能力放在同一套桌面应用里。

当前课堂客户端版本：`2.1.6`，安装包始终内置便携 Python `3.12.8`，学生首次启动无需另装或选择 Python。

唯一权威仓库：[haitao926/xedu-client](https://github.com/haitao926/xedu-client)，对应远端 `origin`；`main` 是唯一长期维护分支。发布版本用 tag 标记，安装包通过 Release / artifact 分发；临时工作分支完成后合并清理。

这个仓库不是单纯的前端页面，也不是单纯的 Jupyter 启动器。它是一个 `Electron + Flask + Vite` 的桌面应用，负责把课堂实验从课程资源、实验工作区、运行时环境到课堂分发串起来。

## 项目定位

- 面向学生的实验入口：学生进入应用后，继续做 Notebook、Python 或 Scratch 实验
- 面向教师的课程工作台：教师管理课程资源、检查实验结构、进入课堂模式、发布或拉取课程
- 面向 AI 教学的桌面宿主：本地集成 Python、Jupyter、Scratch 和部分 XEduHub 运行时能力

旧 Blockly 课程只显示不支持提示，不再加载 Blockly 编辑器；Scratch 是唯一继续维护的图形化编程主线。

当前主心智不是“系统管理后台”，而是“课堂实验工作台”。

## 你能用它做什么

### 1. 做 Jupyter / Python 实验

- 启动、停止、重启本地 Jupyter
- 选择并检测本机 Python 3.8+ 解释器
- 打开 Notebook 或 Python 文件继续实验
- 在 JupyterLab 内通过 ESP32 实验插件编写并运行 MicroPython
- 从课程资源或课堂入口落到当前实验
- 控制 Jupyter 是否允许局域网访问

对应后端接口：
- `GET /api/status`
- `POST /api/start`
- `POST /api/stop`
- `POST /api/restart`
- `GET /api/detect_python`

ESP32 MicroPython 实验从 JupyterLab 启动器中的“ESP32 实验”进入。它使用当前课程实验目录中的 `.py` 文件，通过 USB 串口连接已刷入 MicroPython 固件的 ESP32，支持运行、停止、重启和查看设备输出。详细流程见 [ESP32 MicroPython 实验快速开始](docs/teacher/micropython-esp32-quickstart.md)。

正式发布包内置便携 Python 3.12.8 运行时。学生首次启动不需要选择解释器，也看不到设置页。教师登录后仍可在“Python”设置中检测或更换解释器；选择结果保存到用户配置目录，不写入安装目录。即使所选环境没有 Flask，“修复兼容性”也会先通过独立标准库脚本直接修复 XEdu/Jupyter；后端启动时再单独补齐 Flask 等服务依赖。

### 2. 做 Scratch 图形化实验

- 打开 Scratch 工作区
- 加载 `.sb3` 项目文件
- 保存 Scratch 项目和课程相关资源
- 在 Scratch 中运行 XEdu AI 扩展
- 在右侧结果区查看运行结果、图片和记录卡片
- 在 Scratch 和关联 Python / Notebook 之间保持实验上下文

对应后端接口：
- `GET /api/scratch-editor/index.html`
- `GET /api/resources/scratch-project/<root_token>/<path:relpath>`
- `PUT /api/resources/scratch-project/<root_token>/<path:relpath>`

旧课程若显式包含 Blockly 资源，只显示“该实验类型已不再支持”，不加载旧编辑器。

### 3. 管理课程资源

- 扫描本地课程目录
- 查看课程详情、课程文件和实验材料
- 保存课程元数据
- 导入本地课程目录
- 发布课程到 Gitea
- 从远端课程源拉取更新
- 确保课程发布仓库存在

对应后端接口：
- `GET|POST /api/resources/index`
- `POST /api/resources/scan`
- `POST /api/resources/local-handle`
- `GET /api/resources/local-file/<handle>/<path>`
- `POST /api/resources/import-package-local`
- `POST /api/resources/inspect-course`
- `POST /api/resources/save-course`
- `POST /api/resources/scan-folder`
- `POST /api/resources/publish`
- `POST /api/resources/pull`
- `POST /api/resources/ensure-repo`

### 4. 进入课堂模式

- 教师开启课堂、结束课堂
- 学生通过课堂入口发现可用课程
- 校验教师身份
- 分发课程包、课程文件和课堂索引
- 根据教师/学生模式切换界面能力
- 自动发现失败时，学生可以使用教师机的手动地址进入课堂

对应后端接口：
- `GET /api/classroom/index`
- `POST /api/classroom/start`
- `POST /api/classroom/stop`
- `GET /api/classroom/status`
- `GET /api/classroom/discover`
- `POST /api/classroom/fetch-index`
- `POST /api/classroom/pull`
- `POST /api/classroom/verify-teacher`

### 5. 使用教师辅助与业务代理

- 默认 AI 问答
- XEdu Pack 相关代理能力
- 按教师/学生模式限制部分写操作型代理

对应后端接口：
- `POST /api/ai/ask`
- `POST /api/ai/test_config`
- `POST /api/ai/save_config`

### 6. 做项目初始化和运行环境维护

- 从模板创建项目
- 运行 Python 代码
- 安装、卸载、升级 Python 包
- 选择本地图片文件
- 读取系统与运行环境信息

对应后端接口：
- `GET /api/projects/templates`
- `POST /api/projects/create`
- `POST /api/python/run`
- `POST /api/python/pip`
- `GET /api/health`
- `GET /api/debug/env`
- `POST /api/system/select-image-file`

## 典型使用流程

### 学生视角

1. 打开应用
2. 从最近实验、课程资源或课堂入口进入实验
3. 选择 `Jupyter` 或 `Scratch`
4. 继续运行代码、保存结果、查看反馈

### 教师视角

1. 打开课程资源页
2. 扫描或导入课程目录
3. 打开第一节课的 Scratch 实验和 `.sb3` 项目
4. 按需发布到 Gitea 或拉取更新
5. 开启课堂，让学生进入当前课节

### 教师交付资料

- 安装说明：[docs/teacher/INSTALL.md](docs/teacher/INSTALL.md)
- 快速开始：[docs/teacher/QUICKSTART.md](docs/teacher/QUICKSTART.md)
- 课堂网络：[docs/teacher/CLASSROOM_NETWORK.md](docs/teacher/CLASSROOM_NETWORK.md)
- 故障排查：[docs/teacher/TROUBLESHOOTING.md](docs/teacher/TROUBLESHOOTING.md)

## 架构概览

### 运行时分层

- `Electron` 主进程：窗口生命周期、桌面壳、后端进程编排、深链和单实例控制
- `Renderer` 前端：页面展示、交互控制、工作区切换、资源页、教师/学生模式 UI
- `Flask API`：统一后端入口，负责路由和服务装配
- `Service` 层：Jupyter、资源、课堂、AI 代理、项目模板、Gitea 发布等业务逻辑

### 启动链路

1. Electron 启动主进程
2. 主进程默认使用内置 Python 3.12.8 拉起后端；教师主动选择其他解释器后，使用已保存的选择
3. Flask 注册 `/api/*` 路由
4. Renderer 通过 `renderer/js/api.js` 调用后端
5. 用户在 Jupyter、Scratch、资源页和课堂页之间切换

### 当前实现风格

- 前端：`Vite + 原生 ES Modules`
- 桌面壳：`Electron`
- 后端：`Flask`
- 图形化编程：`Scratch`
- 课程发布：`Gitea`

## 关键目录

```text
xedu-client/
├── renderer/              # 前端页面、Jupyter / Scratch UI、资源页逻辑
├── electron/              # Electron 主进程与 preload
├── backend/               # Flask API、路由、服务、运行时支持
├── scratch-editor/        # Scratch 编辑器，独立安装依赖与构建
├── jupyterlab_micropython/ # JupyterLab ESP32 MicroPython 插件
├── courses/               # 示例课程、Scratch smoke 样例、课堂资源
├── config/                # 默认配置与本地运行配置
├── resources/             # 应用图标、权限声明等打包资源
├── docs/                  # teacher 教师指南、overview 项目说明、archive 历史资料
├── scripts/               # 构建、seed、审计和辅助脚本
├── python_env_minimal/    # macOS 离线 Python 构建输入
├── python_env_win_minimal/# Windows 离线 Python 构建输入
├── output/releases/2.1.6/ # 当前版本安装包输出
├── output/diagnostics/    # 诊断输出
└── build/                 # Vite 构建输出
```

值得先看的入口文件：
- 后端装配入口：`backend/api/app.py`
- 后端运行入口：`backend/backend_main.py`
- Electron 主进程：`electron/main/main.js`
- 前端主入口：`renderer/js/main.js`

## 开发与运行

```bash
# 开发模式：Electron + Vite
npm run electron:dev

# 启动后端 API + 前端开发服务（前端默认 3002）
npm run dev

# 仅启动前端开发服务
npm run dev:renderer

# 仅启动后端 API（默认 5123）
python3 backend/backend_main.py

# 打包前端
npm run build

# 在 Windows 构建课堂安装包（x64 NSIS setup EXE）
npm run build:installer:win

# 在 macOS Apple Silicon 构建课堂安装包（arm64 DMG）
npm run build:installer:mac
```

开发前先安装根项目与 Scratch 编辑器依赖：`npm ci`、`npm run install:scratch`，并准备后端 Python 依赖。安装包构建还需要对应平台的离线 Python 3.12.8 输入目录（见上方项目地图），不能当作缓存删除。

两个课堂安装包入口统一输出到 `output/releases/2.1.6/`（版本号跟随 `package.json`）。向教师分发 Windows NSIS 安装 EXE 或 macOS arm64 DMG，安装与首次启动见 [教师安装说明](docs/teacher/INSTALL.md)。

默认端口：
- 后端 API：`5123`
- 前端 Vite：`3002`

## 测试与质量门禁

```bash
# 完整发布门禁：后端、Electron 安全、Renderer、Scratch、构建与 bundle
npm run quality-gate

# Scratch 课程回归
npm run test:scratch

# 前端构建校验
npm run build

# Scratch 编辑器构建
npm run build:scratch
```

`npm run quality-gate` 是本地与 CI 共用的发布入口，任一阶段失败都会
返回非零。它要求先安装根项目和 `scratch-editor/` 的 Node 依赖，以及
`backend/requirements_ci.txt` 中的 Python 测试依赖。

当前安全边界：
- Python 执行、pip、配置、资源写入、课堂控制和诊断接口需要本次后端进程的 `X-XEdu-Client-Token`。
- `/api/health` 和课堂学生读取接口保持公开；公开不代表可以调用本地高权限能力。
- Scratch 项目使用服务端生成的短期 opaque handle，并额外校验同源、上传大小和 ZIP 内容。
- Python 执行仍是高权限本地能力，不应被描述为沙箱。

## 当前状态与已知事项

- Scratch 主链路已完成一轮稳定化，烟雾样例和课程打开路径处于可回归状态
- Blockly 编辑器、入口和依赖已移除；旧课程仅保留不支持提示
- Scratch 编辑器是独立构建产物，体积较大但受独立 bundle 门禁约束；根前端不再包含 Blockly chunk
- 仓库除了应用代码，还包含课程样例、模型权重、交付文档和测试资源。阅读仓库时不要把它当作单一 npm 前端项目

## 相关文档

- 项目地图：[docs/overview/project-map.md](docs/overview/project-map.md)
- API 契约：[docs/overview/api-contract.md](docs/overview/api-contract.md)
- 架构治理：[docs/overview/architecture-governance.md](docs/overview/architecture-governance.md)
- 课程目录约定：[docs/overview/course-folder-contract.md](docs/overview/course-folder-contract.md)
- 项目审计：[docs/overview/project-audit-2026-04-05.md](docs/overview/project-audit-2026-04-05.md)
- Scratch 教师安装：[docs/teacher/INSTALL.md](docs/teacher/INSTALL.md)
- Scratch 教师快速开始：[docs/teacher/QUICKSTART.md](docs/teacher/QUICKSTART.md)
- Scratch 课堂网络：[docs/teacher/CLASSROOM_NETWORK.md](docs/teacher/CLASSROOM_NETWORK.md)
- Scratch 故障排查：[docs/teacher/TROUBLESHOOTING.md](docs/teacher/TROUBLESHOOTING.md)
- 图形化编程遗留审计：[docs/overview/xeduhub-block-audit.md](docs/overview/xeduhub-block-audit.md)
- 测试指南：[docs/overview/xedu-client-test-guide.md](docs/overview/xedu-client-test-guide.md)

## 许可证

MIT

维护与历史资料：[仓库维护说明](docs/maintenance/REPOSITORY.md) · [历史资料索引](docs/archive/README.md)。
