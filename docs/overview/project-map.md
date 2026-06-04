# XEdu Client 项目地图

这份文档给接手仓库的人一个稳定入口，回答三件事：

1. 这个项目的真实架构是什么
2. 当前工程健康状况和技术债集中在哪里
3. `Jupyter / Blockly / 资源 / 课堂 / AI` 五个功能域分别由哪些模块负责

## 一句话定位

`xedu-client` 不是单纯的前端项目，也不是单纯的 Jupyter 启动器。

它是一个 `Electron + Vite + Flask` 的本地桌面应用，用来把课程资源、Jupyter 实验、Blockly 积木实验、课堂分发和教师 AI 辅助放在同一个宿主里运行。

## 架构总览

### 分层关系

```text
Electron 主进程
  -> 拉起 Python 后端
  -> 管理窗口 / IPC / Jupyter 视图 / 深链

Renderer 前端
  -> 页面展示与交互
  -> 通过 api.js 调用本地 Flask /api/*

Flask API
  -> 路由注册
  -> 参数校验
  -> 依赖注入

Service 层
  -> Jupyter / 资源 / 课堂 / AI / 文档 / 项目模板业务逻辑

本地资源层
  -> 课程目录
  -> Blockly / Notebook / Python 文件
  -> 模型与样例资源
```

### 关键入口文件

- Electron 主进程：[electron/main/main.js](/Users/apple/Documents/GitHub/xedu-client/electron/main/main.js)
- Electron preload：[electron/preload/index.js](/Users/apple/Documents/GitHub/xedu-client/electron/preload/index.js)
- 前端主入口：[renderer/js/main.js](/Users/apple/Documents/GitHub/xedu-client/renderer/js/main.js)
- 前端 API 层：[renderer/js/api.js](/Users/apple/Documents/GitHub/xedu-client/renderer/js/api.js)
- 后端运行入口：[backend/backend_main.py](/Users/apple/Documents/GitHub/xedu-client/backend/backend_main.py)
- Flask 装配入口：[backend/api/app.py](/Users/apple/Documents/GitHub/xedu-client/backend/api/app.py)
- 路由注册目录：[backend/api/routes](/Users/apple/Documents/GitHub/xedu-client/backend/api/routes)

### 启动链路

1. Electron 启动主进程。
2. 主进程拉起 [backend/backend_main.py](/Users/apple/Documents/GitHub/xedu-client/backend/backend_main.py)。
3. 后端构建 Flask app，并注册 `jupyter/resources/classroom/ai/python/...` 路由。
4. Renderer 启动后，通过 [renderer/js/api.js](/Users/apple/Documents/GitHub/xedu-client/renderer/js/api.js) 调本地 `/api/*`。
5. 用户从资源页进入 Jupyter、Blockly、课堂或 AI 助手。

### 请求链路

1. 页面模块调用 `api.js`
2. `api.js` 统一拼接本地 API Base URL
3. Flask 路由模块接收请求
4. 路由委托 Service 层
5. Service 操作本地目录、Jupyter、课程源或 AI 服务
6. 返回 JSON 给前端

## 模块关系

### 中心业务域：资源

`资源` 是全仓库的中心业务域，不是附属页面。

它负责：

- 扫描本地课程目录
- 解析 `course.json`
- 发布和拉取课程
- 为 Blockly 提供工作区和工具箱文件
- 为 Jupyter 提供 notebook / python 实验入口
- 为课堂模式提供课程索引与课程包

相关模块：

- 前端：[renderer/js/resources.js](/Users/apple/Documents/GitHub/xedu-client/renderer/js/resources.js)
- 前端细分模块：[renderer/js/resources](/Users/apple/Documents/GitHub/xedu-client/renderer/js/resources)
- 后端路由：[backend/api/routes/resources.py](/Users/apple/Documents/GitHub/xedu-client/backend/api/routes/resources.py)
- 后端服务：[backend/services/gitea_service.py](/Users/apple/Documents/GitHub/xedu-client/backend/services/gitea_service.py)
- 运行时辅助：[backend/api/resource_runtime.py](/Users/apple/Documents/GitHub/xedu-client/backend/api/resource_runtime.py)

### Jupyter 域

它是代码实验运行面。

相关模块：

- 前端：[renderer/js/jupyter.js](/Users/apple/Documents/GitHub/xedu-client/renderer/js/jupyter.js)
- 工作区桥接：[renderer/js/main/workspace-context.js](/Users/apple/Documents/GitHub/xedu-client/renderer/js/main/workspace-context.js)
- 后端路由：[backend/api/routes/jupyter.py](/Users/apple/Documents/GitHub/xedu-client/backend/api/routes/jupyter.py)
- 后端服务：[backend/services/jupyter_service.py](/Users/apple/Documents/GitHub/xedu-client/backend/services/jupyter_service.py)

### Blockly 域

它是可视化实验运行面。

相关模块：

- 前端 loader：[renderer/js/blockly-workspace.js](/Users/apple/Documents/GitHub/xedu-client/renderer/js/blockly-workspace.js)
- 前端 runtime：[renderer/js/blockly-workspace.runtime.js](/Users/apple/Documents/GitHub/xedu-client/renderer/js/blockly-workspace.runtime.js)
- Blockly 语义积木：[renderer/js/blockly/xeduhub-blocks.js](/Users/apple/Documents/GitHub/xedu-client/renderer/js/blockly/xeduhub-blocks.js)
- 后端路由：[backend/api/routes/resources.py](/Users/apple/Documents/GitHub/xedu-client/backend/api/routes/resources.py)
- 后端支撑：[backend/services/blockly_xeduhub_support.py](/Users/apple/Documents/GitHub/xedu-client/backend/services/blockly_xeduhub_support.py)

### 课堂域

它本质上是资源分发层，而不是独立产品栈。

相关模块：

- 前端入口主要仍在 [renderer/js/resources.js](/Users/apple/Documents/GitHub/xedu-client/renderer/js/resources.js)
- 后端路由：[backend/api/routes/classroom.py](/Users/apple/Documents/GitHub/xedu-client/backend/api/routes/classroom.py)
- 后端服务：[backend/services/classroom_service.py](/Users/apple/Documents/GitHub/xedu-client/backend/services/classroom_service.py)

### AI 域

它目前是横向辅助层，不是完全独立的 agent 平台。

相关模块：

- 前端：[renderer/js/ai.js](/Users/apple/Documents/GitHub/xedu-client/renderer/js/ai.js)
- 后端路由：[backend/api/routes/ai.py](/Users/apple/Documents/GitHub/xedu-client/backend/api/routes/ai.py)
- 后端服务：
  - [backend/services/ai_service.py](/Users/apple/Documents/GitHub/xedu-client/backend/services/ai_service.py)
  - [backend/services/quickform_agent_service.py](/Users/apple/Documents/GitHub/xedu-client/backend/services/quickform_agent_service.py)
  - [backend/services/xedu_pack_agent_service.py](/Users/apple/Documents/GitHub/xedu-client/backend/services/xedu_pack_agent_service.py)
  - [backend/services/blockly_builder_agent_service.py](/Users/apple/Documents/GitHub/xedu-client/backend/services/blockly_builder_agent_service.py)

## 功能导览

### 1. Jupyter / Python 实验

用户路径：

1. 从主界面或资源页进入实验
2. 前端请求 `/api/status`、`/api/start`、`/api/restart`
3. 后端 `JupyterManager` 负责环境检查、命令拼装、进程管理、状态返回
4. Electron 负责嵌入式视图与桌面桥接

关键接口：

- `GET /api/status`
- `POST /api/start`
- `POST /api/stop`
- `POST /api/restart`
- `GET /api/detect_python`

### 2. Blockly 积木实验

用户路径：

1. 从资源详情进入 Blockly playground
2. 后端根据课程根目录 token 动态生成 Blockly 页面
3. 前端 runtime 加载 workspace / toolbox / 关联 practice 文件
4. 用户可校验 toolbox、保存 toolbox、生成 Python 或执行 XEduHub 任务

关键接口：

- `GET /api/resources/blockly-playground/<root_token>`
- `GET /api/resources/blockly-playground-blank`
- `POST /api/resources/blockly/validate-toolbox`
- `POST /api/resources/blockly/toolbox/save`
- `POST /api/resources/blockly/xeduhub/execute`
- `POST /api/python/run`

### 3. 课程资源

用户路径：

1. 前端扫描本地课程目录
2. 后端读取 `course.json` 和课节结构
3. 前端展示课程卡片和详情
4. 用户可发布、拉取、保存或打开实验

关键接口：

- `GET|POST /api/resources/index`
- `POST /api/resources/scan`
- `POST /api/resources/scan-folder`
- `POST /api/resources/inspect-course`
- `POST /api/resources/save-course`
- `POST /api/resources/publish`
- `POST /api/resources/pull`
- `POST /api/resources/ensure-repo`

### 4. 课堂模式

用户路径：

1. 教师从资源页选定课程并开启课堂
2. 后端记录当前活动课程和课堂状态
3. 学生端通过局域网发现课堂
4. 学生拉取课堂索引和课程包
5. 拉下来的课程再次进入资源域模型

关键接口：

- `POST /api/classroom/start`
- `POST /api/classroom/stop`
- `GET /api/classroom/status`
- `GET /api/classroom/discover`
- `POST /api/classroom/fetch-index`
- `POST /api/classroom/pull`

### 5. AI 助手

用户路径：

1. 前端提交问题、历史和上下文
2. 后端根据教师/学生模式和意图做分流
3. 普通问答走 `AIService`
4. 教师态问题可命中 QuickForm / 打包 / Blockly Builder 等代理能力

关键接口：

- `POST /api/ai/ask`
- `POST /api/ai/test_config`
- `POST /api/ai/save_config`

## 工程健康检查

### 当前整体判断

分层方向是对的，但仓库已经明显进入“多产品线单仓叠加”的阶段。当前主要问题不是功能缺失，而是边界、体积和可维护性。

### 已确认的热点

- [electron/main/main.js](/Users/apple/Documents/GitHub/xedu-client/electron/main/main.js)
- [renderer/js/main.js](/Users/apple/Documents/GitHub/xedu-client/renderer/js/main.js)
- [renderer/js/resources.js](/Users/apple/Documents/GitHub/xedu-client/renderer/js/resources.js)
- [renderer/js/blockly-workspace.runtime.js](/Users/apple/Documents/GitHub/xedu-client/renderer/js/blockly-workspace.runtime.js)
- [backend/api/app.py](/Users/apple/Documents/GitHub/xedu-client/backend/api/app.py)
- [backend/api/routes/resources.py](/Users/apple/Documents/GitHub/xedu-client/backend/api/routes/resources.py)
- [backend/services/jupyter_service.py](/Users/apple/Documents/GitHub/xedu-client/backend/services/jupyter_service.py)
- [backend/services/gitea_service.py](/Users/apple/Documents/GitHub/xedu-client/backend/services/gitea_service.py)

### 当前确认的工程债

- 根目录混入源码、课程、模型、打包产物、Python 运行时、说明文档。
- `resources.py` 承担了过多职责：资源索引、课程扫描、发布拉取、Blockly playground、本地文件预览、QuickForm 注入。
- `app.py` 仍然是大型装配中心，依赖注入 helper 很多。
- `api.js` 里存在全局 `fetch` 改写，说明前端对本地 API 的运行环境假设很强。
- `build/assets/blockly-workspace.runtime.js` 当前超过 `1.1 MB`，构建会持续给出大 chunk 警告。

### 冗余与边界问题

- 历史上存在多套 checkpoint 目录：
  - `checkpoint/`
  - `checkpoints/`
  - `backend/checkpoint/`
  当前运行时已经优先收口到 `courses/blockly-smoke/checkpoints/`，其余目录应视为遗留兼容资产，而不是继续写入的主来源。
- 两套 Python 运行时目录并存：
  - `python_env/`
  - `python_env_win/`
- `courses/blockly-smoke` 同时承担样例课程、测试 fixture、运行时默认资源三种职责。
- `dist-final/`、`build/`、`output/`、缓存目录都很重，不适合和核心代码放在同一认知层面。

### 质量门禁现状

当前可见的高价值门禁有：

- `npm run build`
- `npm run test:blockly-runtime`
- `PYTHONPATH=backend python3 -m pytest backend/tests/test_blockly_resources_api.py -q`
- `node scripts/generate_xeduhub_block_audit.mjs --check`

当前缺口：

- 没看到系统性的前端 lint / typecheck
- 没看到系统性的 Python 静态检查
- Electron 层缺少更成体系的验证

### 治理优先级建议

1. 先收紧目录边界，不要继续把运行时大资产和源码逻辑混在一起。
2. 优先治理 `resources.py`、`app.py`、`blockly-workspace.runtime.js` 三个热点。
3. 给 renderer / electron / python 增加最基本的静态检查门禁。
4. 把 `courses/blockly-smoke` 从“默认业务资源”逐步降级为“明确标注的 fixture/sample”。

## 推荐阅读顺序

1. [README.md](/Users/apple/Documents/GitHub/xedu-client/README.md)
2. [docs/overview/project-map.md](/Users/apple/Documents/GitHub/xedu-client/docs/overview/project-map.md)
3. [docs/overview/api-contract.md](/Users/apple/Documents/GitHub/xedu-client/docs/overview/api-contract.md)
4. [docs/overview/architecture-governance.md](/Users/apple/Documents/GitHub/xedu-client/docs/overview/architecture-governance.md)
5. [docs/overview/project-audit-2026-04-05.md](/Users/apple/Documents/GitHub/xedu-client/docs/overview/project-audit-2026-04-05.md)
