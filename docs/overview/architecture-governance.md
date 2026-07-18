# XEdu Client 架构职责与治理

## 模块职责

### Electron 主进程（`electron/main/main.js`）

- 负责应用生命周期、窗口管理、IPC 转发、后端进程编排。
- 不承载课程业务逻辑，不直接处理资源/课堂/AI 的业务规则。

### Renderer（`renderer/`）

- 负责 UI 展示与交互。
- `main.js` 仅保留启动编排与事件接线。
- 入口拆分到 `renderer/js/main/*`：
  - `workspace-context.js`（工作区上下文）
  - `system-config.js`（系统配置读写）
  - `dashboard.js`（控制台/课堂页状态）
- 资源页拆分到 `renderer/js/resources/*`：
  - `learning-progress.js`（学习进度持久化）
  - `text-utils.js`（文本/标签/路径工具）
  - `source-utils.js`（课程源标准化与去重）
  - `detail-renderer.js`（详情页文件视图渲染）
  - `course-create-utils.js`（课程创建数据组装）
- `resources.js` 保持懒加载，避免主包耦合过大。
- Scratch 编辑器通过独立构建产物加载；旧 Blockly 工作区文件不再作为应用模块。

### Backend API（`backend/api/`）

- `app.py` 仅负责服务装配与依赖注入。
- 路由统一在 `backend/api/routes/*`，通过 `register_all_routes` 单入口注册。

### Service 层（`backend/services/`）

- 承载业务逻辑（Jupyter、资源、课堂、AI Agent 等）。
- 路由层不重复实现服务逻辑。

## 关键数据流

1. Renderer 调用 `renderer/js/api.js`
2. 请求到 Flask 路由（`backend/api/routes/*`）
3. 路由调用 Service 层
4. Service 返回标准 JSON 给前端

## 启动时序（简化）

1. Electron 启动主进程
2. 主进程拉起 Python 后端
3. 后端创建 Flask App 并注册路由
4. Renderer 启动并连接 `/api/*`

## 当前治理策略

- 默认本机安全：后端监听 `127.0.0.1`，Jupyter 默认本地访问。
- 显式开放：通过配置开关启用局域网暴露。
- 进程清理最小化：仅清理本应用追踪的进程 PID，不全局扫杀。
- 路由单入口：避免 `app.py` 内联路由与模块路由双轨维护。
