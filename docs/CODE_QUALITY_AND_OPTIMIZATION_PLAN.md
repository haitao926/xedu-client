# XEdu Client 代码质量与优化路线（修订版）

> **日期**: 2026-07-18（修订：修正 v1 的事实错误）
> **产品决策**: Scratch 是唯一图形化编程主线。**Blockly 现在完全移除**（不保留旧课程兼容，旧 Blockly 课程显示"不再支持"提示）。该决策已同步到 `PRE_RELEASE_AUDIT_2026-07-16.md`、任务清单和教师交付资料。
> **v1 勘误**: ① XEduHub 运行时是 Scratch/Blockly 共享基础设施，不可删除；② `markdown_document_service.py`、`teacher_intent_detection.py` 均为在用代码，非死代码；③ backend 双重打包、打包过滤、requirements 统一均已完成；④ "零测试"表述不准确，应为"覆盖不足"。

> **2026-07-18 执行记录**：修正 `resourcesState` 全量迁移产生的课堂状态嵌套、工作区位置参数和资源页调用表达式问题，并将关键契约加入测试。`npm run quality-gate` 已完整退出 `0`：后端 `130 passed`、Electron 安全/发布契约、Renderer 契约、Scratch 构建与 `19 passed`、Vite 8 构建和 bundle guard 全部通过。Gitea 课程扫描已拆至 `gitea_course_scanner.py`，Jupyter 配置/命令/环境选择已拆至 `jupyter_environment.py`，资源页主状态已集中到 `resources-state.js`。跨平台正式安装包、签名、公证和教师实机验收仍未完成。
> **2026-07-19 执行记录**：将 Scratch 构建工具锁入 `scratch-editor` devDependencies，移除构建期间对上游完整 devDependencies 的临时安装，并修复 hoisted npm 布局下静态资源复制路径。`npm run quality-gate` 已重新通过：后端 `136 passed`、Scratch `22 passed`、发布/Renderer/Electron 契约、Vite 构建和 bundle guard 全部通过；Scratch lock audit 当前为 `21` 项（`5 critical / 6 high / 10 moderate / 0 low`），root lock 仍为 `0` 项，Python 两套 requirements 的完整 resolver + `pip-audit` 均为 0 漏洞。发布产物校验器已补上真实 app.asar/Info.plist 版本读取、app.asar 残留扫描和独立 Git tag/commit 校验，官方 workflow 会归档依赖、签名与公证证据。跨平台正式安装包、签名、公证、`xedu-python` 实际环境兼容性和教师实机验收仍未完成。

> **2026-07-18 发布收口执行**：新增 `electron-builder.release.cjs` 和 `electron:build:release`，正式构建按目标平台强制签名，缺少凭据时 fail-closed；Vite 升级到 `8.1.5`，root npm audit 当前为 `0 high / 0 critical`；Flask、Requests、python-dotenv、Pillow、Markdown、Pygments 的三套 Python requirements 已升级到通过固定版本子集审计的版本。完整 quality gate 再次通过；Scratch 上游构建依赖仍有独立漏洞清单，未固定 Python SDK/模型依赖的完整 resolver 审计仍待完成。

---

## 一、核心原则：先迁移共享设施，再删除 Blockly

### 1.1 必须保留的共享基础设施（Scratch 依赖）

| 组件 | 位置 | Scratch 依赖证据 |
|------|------|------------------|
| `/api/resources/xeduhub/execute` 路由 | `routes/xeduhub.py:17` | `scratch3_xedu_ai/index.js:334`、`stage-sensing.js:98` 直接调用 |
| `execute_xeduhub_runtime` 服务 | `xeduhub_support.py` | 上述路由的实现，另被 Python 路由和测试引用 |
| `get_nonblocking_supported_tasks_snapshot` | `xeduhub_support.py` | `app.py` 应用启动引用 |
| `SMOKE_CHECKPOINT_MAP` | `xeduhub_support.py` | `python.py` 引用 |
| `xeduhub_runtime.py`（含 `XEduCamera`） | `backend/runtime/` | 已迁移并由 Python/XEduHub 视频运行链保留 |
| `runtime/sample_assets.py` | `backend/runtime/` | 被 XEduHub 服务导入 |

### 1.2 移除顺序（严格按序执行）

```
Step 1: 迁移共享路由（已完成）
  ├─ 新建 backend/api/routes/xeduhub.py
  ├─ 将 /api/resources/xeduhub/execute 迁入 routes/xeduhub.py
  ├─ 迁移 test_blockly_resources_api.py 中对应的 xeduhub/execute 测试
  └─ 验证：Scratch XEdu AI 扩展真实推理冒烟测试通过

Step 2: 验证并迁移共享运行时（已完成）
  ├─ 确认 XEduCamera 是否被 XEduHub 执行链的生成代码引用
  ├─ 确认 XEduCamera 被视频/摄像头运行链使用
  └─ 迁移为 xeduhub_runtime.py 并保留

Step 3: 删除 Blockly 专属代码（已完成）
  前端：
  ├─ renderer/js/blockly/ 整目录（~8,000 行，含测试）
  ├─ renderer/js/blockly-workspace.runtime.js（1,914 行）
  ├─ renderer/styles/blockly-workspace.css（2,189 行）
  └─ package.json 移除 blockly 依赖（构建产物 -764 KB）
  后端：
  ├─ 旧 resources_blockly.py（共享路由迁移后删除）
  ├─ xeduhub_support.py 中不再保留 Blockly 编辑器专属部分
  │   （validate_toolbox_schema、积木定义等）→ 裁剪后重命名为
  │   xeduhub_support.py
  └─ test_blockly_resources_api.py 中 playground/toolbox 测试

Step 4: 清理引用 + 降级提示（已完成）
  ├─ resources.js:6320 blockly-playground URL 构建 → 移除
  ├─ workspace-context.js:233-243 playground-blank 入口 → 移除
  ├─ 旧课程中 Blockly 实验入口 → 显示"该实验类型已不再支持"
  ├─ index.html #blockly-workspace section + 导航项 → 移除
  ├─ main.js blockly 注册/图片选择桥 → 移除
  ├─ main.css blockly 选择器（~30 行）→ 移除
  ├─ vite.config.js blockly 入口和 chunk 分割 → 移除
  └─ package.json test:blockly-* 脚本 → 移除
      （seed:xedu-smoke 需验证是否被后端 XEduHub 测试使用，是则保留）

Step 5: 验证
  ├─ npm run quality-gate 全部通过
  ├─ Scratch 主链实机验证（新建/打开 .sb3、XEdu AI 推理、保存）
  ├─ 打开含 Blockly 实验的旧课程 → 显示降级提示、不崩溃
  └─ 重新打包，确认产物不含 blockly chunk 且不含
      blockly_builder_agent_service.py 等历史残留
```

### 1.3 移除收益（修正后）

| 项 | 可移除量 | 说明 |
|----|---------|------|
| 前端 JS（含测试） | ~10,000 行 | blockly/ 目录 + runtime.js |
| 前端 CSS | ~2,200 行 | blockly-workspace.css + main.css 片段 |
| 后端 Python | **~1,500-2,000 行** | 仅 Blockly 专属部分；共享 XEduHub 服务保留 |
| 后端测试 | ~800-1,000 行 | playground/toolbox 部分；xeduhub 测试迁移保留 |
| 构建产物 | -764 KB（-33%） | blockly-vendor chunk |
| **合计** | **~14,500 行** | 低于 v1 估算的 15,700 行（因共享设施保留） |

---

## 二、死代码修正与遗留清理

### 2.1 v1 误判修正（以下均为在用代码，不可删除）

| 文件 | v1 误判 | 实际状态 |
|------|---------|----------|
| `markdown_document_service.py`（359 行） | "完全死代码" | ❌ 被 `documents.py:8` 引用，4 处调用 |
| `teacher_intent_detection.py`（73 行） | "教师 agent 残留" | ❌ 被 `app.py:21` 应用启动和 AI 路由使用 |

### 2.2 确认可清理项

| 项 | 行动 |
|----|------|
| `electron/index.js`（20 行旧 preload） | ✅ 已确认无引用并删除 |
| `blockly_builder_agent_service.py` 残留于旧打包产物 | 重新打包时自然消除，产物验收时确认 |
| `backend/sasu/zhangjiang-image-recognition-standard/`（~987 MB 重复课程包） | 从仓库/打包中移除；**保留 `zhangjiang-image-recognition/`**（`resources.py:138` 默认示例课程依赖） |

---

## 三、已完成项（v1 误列为待办）

| 项 | 证据 |
|----|------|
| ✅ backend 移出 asar（双重打包已消除） | `package.json` files 仅含 build/electron |
| ✅ extraResources 过滤 tests/`__pycache__`/`.pytest_cache` | `package.json:53` filter 规则 |
| ✅ 重复 checkpoint 已过滤 | package.json filter |
| ✅ 三份 requirements 公共依赖统一 | 三份均为 Flask==3.1.3、requests==2.32.5、Pillow==12.3.0 等安全 pin |
| ✅ Flask-CORS 死依赖已删除 | requirements 中已无此项 |
| ✅ `/api/python/pip` 已加鉴权 | `python.py:227-229` |
| ✅ Electron sandbox + webSecurity 已启用 | 主窗口和 Jupyter 视图 |

---

## 四、前端代码质量优化（不变项，v1 结论仍有效）

### 4.1 🔴 P0：`resources.js` 拆分（当前约 7,363 行，仍为大型协调模块）

**第一步已完成**：原 37 个模块级状态变量已集中到 `resources/resources-state.js` 的工厂对象，并以资源页契约测试守护课堂状态隔离、工作区位置参数和状态引用。`resources.js` 仍负责大量协调逻辑，后续按功能边界继续拆分，不在发布前进行大范围重写。

**拆分目标**（9 个模块）：`resources-state.js` / `cloud-source-config.js` / `cloud-course-import.js` / `course-wizard.js` / `course-publish.js` / `teacher-mode.js` / `student-workspace-pages.js` / `course-detail-view.js` / `resources-events.js`

详细行范围映射见 v1 归档（各块 L150-L7585 划分仍有效）。

### 4.2 🔴 P0：错误处理补齐（本轮已完成主要路径）

- `resources.js` 高风险异步事件已统一接入 `withAsyncActionErrorBoundary`，覆盖学生入口、课程拖拽保存和文件打开。
- 渲染进程已注册全局 `unhandledrejection` 处理器，记录脱敏摘要并节流提示教师重试。
- Scratch iframe 已增加 12 秒加载超时、timer 清理、自动重试和手动重试反馈。
- 仍需 Electron 实机做一次真实异常注入，验证具体业务按钮的恢复状态。

### 4.3 🟡 P1：重复代码与状态去重

| 项 | 位置 | 修复 |
|----|------|------|
| `escapeHtml` 本地副本 | `dashboard.js:1` | 导入 `utils/html.js` |
| `getBaseName` 本地副本 | `workspace-context.js:31` | 保留工作区边界实现，避免让资源页模块形成反向依赖 |
| workspace placeholder 模板重复 | `workspace-context.js:357-393` | 合并（Blockly 移除后自然简化） |
| 教师模式状态 3 处并存 | `resources.js` 内存状态 + sessionStorage + 入口读取 | sessionStorage 键名与读取已集中到 `main/teacher-mode-state.js`；资源页内存状态仍负责已验证会话 |

### 4.4 🟡 P1：CSS 变量体系贯彻

- 删除已确认未使用的 6 个变量（`--secondary-color`、未被引用的 `--student-*` 系列）。
- 已将高频表面色和文本色替换为 `--surface-muted`、`--text-medium` 等语义变量；仍有较多低频硬编码颜色，后续继续做完整主题治理。

### 4.5 🟢 P2：`main.js` 瘦身（879 行）

启动支持卡已移至 `main/backend-startup-support.js`；Blockly 图片选择桥随移除消失。Dashboard 输入、Sidebar 折叠和深链处理仍保留在入口中，后续可在行为测试覆盖后继续提取。

---

## 五、后端代码质量优化

### 5.1 🟡 P1：超长文件拆分（Blockly 移除后的两大目标）

| 文件 | 行数 | 拆分方向 | 前提 |
|------|------|----------|------|
| `gitea_service.py` | 799 | Gitea 客户端原语和课程扫描已分别移至 `gitea_client.py`、`gitea_course_scanner.py`；发布/同步仍在主服务中 | 保持关键行为测试 |
| `jupyter_service.py` | 1,296 | 配置、命令和环境选择已移至 `jupyter_environment.py`；进程/端口/监控仍在主服务中 | **直接单元测试已补齐** |

### 5.2 🟡 P1：测试覆盖现状（修正"零测试"表述）

| 模块 | 现有覆盖 | 缺口 |
|------|----------|------|
| Python 运行时安全 | `test_runtime_safety.py`、`test_python_runtime.py` | 输出截断边界、UTF-8 字节上限已补；仍缺真实内存限制边界（当前实现不承诺内存硬限制） |
| 前端 API 层 | `api.test.mjs` | 已覆盖超时、错误和 Electron IPC 路径；真实网络异常仍缺集成测试 |
| Jupyter 服务 | `test_jupyter_service.py`、runtime 测试 | 启停、端口切换、崩溃和自动重启已有 mock 单元覆盖；仍缺真实 Jupyter 子进程集成测试 |
| 配置服务 | 部分覆盖 | 缺备份恢复、损坏回退测试 |
| 安全/pip/课堂/AI 路由 | ✅ 较完整 | — |

### 5.3 🟢 P2：其他

- `kimi-agent-sdk` 固定版本号
- 路由层异常处理样板代码（每路由 5-10 行重复）可提取装饰器

---

## 六、优化路线（修订）

### Phase 1：Blockly 移除（已完成源码阶段）

已按第一节 Step 1-5 执行。源码与质量门禁已完成；本地曾生成并校验 macOS arm64、Windows x64 unpacked 产物，但它们不是包含本轮最新代码的 release commit/tag 正式包。**关键剩余门禁**是重新生成跨平台安装包、完成签名/公证并进行教师实机验收。

### Phase 2：稳固（本轮代码项已完成，真实设备项保留）

- [x] 错误处理补齐：资源高风险异步边界、全局 Promise 异常、Scratch iframe 超时。
- [x] 重复代码：dashboard 统一使用 `utils/html.js`；确认 `getBaseName` 不跨资源模块反向引用。
- [x] Jupyter 服务直接单元测试：启停、端口切换、崩溃和自动重启。
- [x] Python 输出截断边界测试：固定字节上限与 UTF-8 不完整字节。
- [~] 真实 Electron 异常注入、Windows 进程树和真实 Jupyter 子进程测试待设备/环境。

### Phase 3：重构（本轮完成低风险治理，长期拆分继续）

- [x] 删除 `main.css` 中确认未使用的 6 个颜色变量，保留仍被学生模式使用的变量。
- [x] `dashboard.js` 复用共享 HTML 转义工具。
- [x] `resources.js` 的课程文件归一化、类型识别和排序已移至 `resources/file-utils.js`；`main.js` 启动支持卡已移至独立控制器。
- [x] `resources.js` 的实验文件概览已移至 `resources/experiment-overview.js`；设置页与侧栏逻辑已移至 `main/shell-ui.js`。
- [x] Gitea 客户端原语已移至 `backend/services/gitea_client.py`，旧导入路径保持兼容。
- [x] `resources.js` 的 37 个模块级状态变量已迁移到 `resources/resources-state.js`，并补充状态引用契约测试；主模块的功能拆分仍需独立回归窗口。
- [x] CSS 高频硬编码颜色已部分语义化，Gitea 课程扫描已移至 `gitea_course_scanner.py`，Jupyter 配置/环境逻辑已移至 `jupyter_environment.py`。
- [~] `resources.js` 剩余功能拆分、CSS 全量主题治理、Gitea 发布/同步和 Jupyter 进程监控继续拆分：不在发布包构建前一次性重写。

---

## 七、需同步的文档

| 文档 | 需更新内容 |
|------|-----------|
| `PRE_RELEASE_AUDIT_2026-07-16.md` | ✅ 已更新为完全移除源码、旧课程降级和 T01/T13 分工 |
| `TASKS.md` / `BLOCKLY_SCRATCH_TASKS.md` | ✅ 已标记为历史归档 |
| `README.md` / `docs/teacher/*` | ✅ 已改为 Scratch 唯一主线和旧课程不支持提示 |

---

## 2026-07-19 执行补充

- 教师设置页现在在所选解释器内执行 Python/Jupyter/XEduHub 探针；对精确 `xedu-python==2.0.0` 仅提供显式、可审计的两条旧元数据上限修复，并更新 `RECORD`，修复后必须重新探针通过。
- Scratch 依赖审计新增 `check_scratch_dependency_gate.mjs` 和限期例外清单，当前 21 项结果可生成 reachability report；安全负责人批准、跨平台安装包与教师实机验收仍未完成。

*修订版依据：Scratch 扩展源码、后端路由实现、package.json 当前状态的逐项核实。*
