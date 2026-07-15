# Blockly → Scratch 替换规划

## 目标（一句话）

**用 Scratch 完全替换 Blockly 作为图形化编程入口，其他系统不动。** 迁移期允许短暂共存，最终状态是 Blockly 下线。

## 边界：什么变，什么不变

### 变
- `renderer/js/blockly/*`（12 个文件，6705 行）—— 图形化编程编辑器本体，最终整体下线
- 学生侧"图形化编程"导航入口（[renderer/index.html:74](renderer/index.html:74) `nav-blockly-item`）—— 指向改成 Scratch
- 课程内容里的 `.blockly.xml` 文件——需要迁移或提供转换路径
- `config/blockly-colors.json` 的角色——不再服务于 Blockly 主题，改为 Scratch 扩展块配色参考（如果还需要）

### 不变
- 后端 XEduHub 任务体系：`backend/services/blockly_xeduhub_support.py` 里的 15 个内置任务（`det_body`、`cls_imagenet`、`ocr` 等）、`TASK_REGISTRY`、`execute_xeduhub_runtime()`——这是能力层，和积木引擎无关，**继续保留**，只是换一个调用方（Scratch 扩展块而不是 Blockly 积木）
- `/api/resources/blockly/xeduhub/execute` 端点——保留（可能改名或加一个别名，见下）
- "Python实验"入口和整条 Jupyter 执行链路——完全独立，不受影响
- 课程资源系统（`course.json`、`gitea_service.py`、发布/拉取流程）——不动，只是 `type: "blockly"` 的实验条目要新增/替换成 `type: "scratch"`
- 整个 Electron 外壳、桌面端框架、其他四个学生标签页（课程任务中心、互动体验、Python实验、AI助手）——不动
- xedu-pack / xedu-course-builder skill——不动（Scratch 项目文件如何生产是后续问题，不在这轮范围）

---

## 现状盘点（写规划前必须先摸清楚的事实）

| 项 | 数字/事实 |
|---|---|
| Blockly 前端代码规模 | 12 个文件，6705 行（`renderer/js/blockly/`）+ `blockly-workspace.runtime.js` 主运行时 |
| 自定义 XEdu 积木数量 | 75 处 `type: 'xeduhub...'` 定义（[renderer/js/blockly/xeduhub-blocks.js](renderer/js/blockly/xeduhub-blocks.js)） |
| 积木注册方式 | `Blockly.defineBlocksWithJsonArray`，JSON Schema 驱动，不是手写 DOM |
| 执行驱动方式 | **结构化 spec（task_id + params），不是 Python 文本**（关键发现，见上） |
| 后端任务注册表 | `backend/services/blockly_xeduhub_support.py`，15 个内置任务，与 Blockly 引擎无耦合 |
| 课程内容耦合 | 至少 1 门课程（`zhangjiang-image-recognition`）用 `.blockly.xml` + `type: "blockly"`（[course.json:37](backend/sasu/zhangjiang-image-recognition/course.json:37)） |
| Python 生成的实际用途 | 仅展示 + 失败兜底，不是执行主链路 |
| Python实验独立性 | 完全独立入口，走 Jupyter，无 Blockly 依赖 |
| 后端执行路由 | `POST /api/resources/blockly/xeduhub/execute`（[resources_blockly.py:139](backend/api/routes/resources_blockly.py:139)） |
| Playground 页面 | `/api/resources/blockly-playground/<root_token>`，服务端渲染 HTML 包裹 Blockly workspace |

**结论**：Blockly 这一层可以清楚地切成两半——

1. **积木引擎壳**（工具箱、拖拽、代码生成、UI）——纯前端，替换成本集中在这里
2. **XEduHub 能力层**（任务注册、执行、后端服务）——和积木引擎解耦，本来就该保留

这个切分决定了整条迁移路线的形状：**先把能力层的调用协议稳定下来，再逐步把前端引擎换掉，而不是反过来。**

---

## 迁移路线（4 个阶段）

### Phase 1 — Scratch 编辑器可运行

**目标**：Scratch 能在 Electron 桌面端加载、编辑、保存项目，此阶段不接 XEdu 能力，不影响现有 Blockly。

**要做的事**：
- 确定 Scratch 接入方式：
  - 选项 A：`scratch-gui`（官方开源前端）作为独立 npm 包本地打包进 Electron，非 iframe 远程加载
  - 选项 B：`scratch-vm` + 自建最简 UI（工作量大得多，不推荐，除非 A 方案有无法绕过的阻塞）
  - **推荐 A**：scratch-gui 支持本地构建，不依赖联网访问 scratch.mit.edu，符合桌面离线场景，也规避了 CSP/跨域问题
- 项目文件落盘方案：`.sb3` 文件存到课程目录下的固定位置（类比现在的 `.blockly.xml` 位置）
- 新增导航入口做 A/B 共存（先不删 Blockly 入口，加一个 "Scratch（预览）" 入口）

**验收标准**：
- [ ] Electron 内能打开 scratch-gui，无 CSP 报错
- [ ] 能创建、保存、重新加载一个 `.sb3` 项目
- [ ] 不影响现有 Blockly 入口的任何功能

**改动文件（预估）**：
- 新增 `renderer/js/scratch/` 目录（对齐现在 `renderer/js/blockly/` 的组织方式）
- `package.json` 加 `scratch-gui`/`scratch-vm`/`scratch-blocks` 依赖
- `renderer/index.html` 加一个临时入口
- 不动任何 `backend/` 代码

---

### Phase 2 — XEduHub 能力接入 Scratch

**目标**：15 个内置任务能通过 Scratch 自定义扩展块调用，走同一条后端执行链路。

**要做的事**：
- 写一个 Scratch Extension（`scratch-vm` 的扩展机制），暴露 XEduHub 任务作为 Scratch 积木
- 扩展块直接产出 `{task_id, params}` 结构，POST 到 `/api/resources/blockly/xeduhub/execute`（复用现有端点，不新建）
- 按 Blockly 里的任务优先级顺序迁：先图像分类、目标检测这两个高频任务，再扩展到其余 13 个
- 结果展示：Scratch 舞台原生支持"说话气泡"、变量监视器，用这些展示任务结果，不需要重新发明展示 UI

**验收标准**：
- [ ] 图像分类和目标检测两个任务能在 Scratch 中拖拽调用并拿到正确结果
- [ ] 调用的是现有后端端点，没有新增/复制后端逻辑
- [ ] 失败场景（如模型不可用）的错误提示能在 Scratch 里正确显示

**改动文件（预估）**：
- 新增 `renderer/js/scratch/extensions/xeduhub-tasks.js`
- `backend/api/routes/resources_blockly.py`：视情况决定端点是否需要改名为更中性的路径（如 `/api/resources/xeduhub/execute`），如果改名需要同时保留旧路径给尚存的 Blockly 页面用
- 不动 `blockly_xeduhub_support.py` 的任务注册表和执行逻辑本身

---

### Phase 3 — 课程结构对齐 + 功能对齐验证

**目标**：确认 Scratch 版本能覆盖现有 Blockly 主流程，课程系统能兼容 Scratch 项目。

**要做的事**：
- `course.json` 的实验条目增加 `type: "scratch"`，`path` 指向 `.sb3` 文件（[course.json 结构](backend/sasu/zhangjiang-image-recognition/course.json:37) 平行扩展，不改现有 schema 结构，只加一个新的 type 枚举值）
- 提供 `.blockly.xml → .sb3` 的转换脚本或迁移指南（哪怕是半自动，只需覆盖当前唯一一门耦合课程 `zhangjiang-image-recognition`）
- 逐个任务核对：Blockly 里能做的事，Scratch 版本是否都有对应积木（基础编程 8 类是 Scratch 原生自带，不需要额外开发；差距只在 XEduHub 15 个任务块的迁移完成度）
- 学生体验走查：从"图形化编程"入口进去，能不能完成一门课的完整实验流程

**验收标准**：
- [ ] 至少 1 门真实课程完整跑通 Scratch 版本（从打开项目到看到任务结果）
- [ ] `course.json` 的 `type: "scratch"` 被资源加载逻辑正确识别（[resources.js](renderer/js/resources.js) 里判断文件类型的地方需要加分支）
- [ ] 15 个内置任务中，高频使用的任务已有 Scratch 对应块（不要求 100% 覆盖才能进入下一阶段，但要列出未覆盖清单）

---

### Phase 4 — 下线 Blockly

**只有 Phase 3 验收标准满足后才能进入这一步。**

**要做的事**：
- 移除学生侧"图形化编程"导航项对 Blockly 的指向，改为 Scratch
- 删除 `renderer/js/blockly/` 整个目录（6705 行）
- 删除 `backend/api/routes/resources_blockly.py` 里 Blockly 专属的路由（playground、toolbox 校验等），保留被 Scratch 复用的执行端点
- 删除 `config/blockly-colors.json`（除非 Scratch 扩展块还需要引用配色）
- 更新所有引用 `.blockly.xml` 的课程内容或提供归档说明
- 清理测试：`renderer/js/blockly/*.test.js`、`backend/tests/test_blockly_*.py`

**验收标准**：
- [ ] 全量测试套件（`npm run test:blockly-runtime` 等价的 Scratch 测试、`npm run build`、后端 pytest）全部通过
- [ ] 没有任何学生流程还依赖已删除的 Blockly 路径
- [ ] 课程内容 100% 迁移完成或明确标记为已归档不再维护

---

## 关键决策点（现在就要定，不能拖到 Phase 4 才想）

### 1. Python 生成要不要保留

**建议：不保留。** 理由：
- 已确认 Python 生成不是执行主链路，只是展示稿
- Scratch 本身就是完整的可视化编程语言，学生不需要"看生成的 Python"这一步
- "Python实验"入口本来就独立存在，需要写真 Python 代码的场景走那条线，不需要 Blockly/Scratch 重复提供

### 2. 执行端点要不要改名

现在的端点叫 `/api/resources/blockly/xeduhub/execute`，命名里带 `blockly`。

**建议**：Phase 2 就加一个中性别名 `/api/resources/xeduhub/execute`，两个端点并存指向同一逻辑，Phase 4 删除 Blockly 时顺手把带 `blockly` 字样的旧端点也一起下线，避免留下命名债。

### 3. `.blockly.xml` 历史课程内容怎么处理

只有一门课程耦合（`zhangjiang-image-recognition`）。**建议**：Phase 3 期间人工迁移这一门课，不做通用批量转换工具——量太小，做自动化转换脚本的成本可能比手动迁移更高。

---

## 风险清单

| 风险 | 说明 | 应对 |
|---|---|---|
| scratch-gui 打包体积 | Scratch 官方 GUI 依赖较重，可能显著增加 Electron 应用体积 | Phase 1 先做体积评估，超过阈值再考虑裁剪方案 |
| Scratch Extension API 学习成本 | `scratch-vm` 扩展机制与 Blockly JSON Schema 完全不同的编程模型 | Phase 2 先做 1 个任务的完整验证，摸清模式后再批量复制 |
| 课程内容迁移遗漏 | 未来可能有更多课程用 `.blockly.xml`，如果在迁移期间新增会增加清理成本 | 迁移启动后，通过 xedu-pack skill 层面暂停新课程使用 Blockly 类型（沟通给使用 skill 的老师） |
| Scratch 项目文件与现有资源发布/拉取流程的兼容性 | `gitea_service.py` 的发布逻辑是否对 `.sb3` 二进制文件有特殊处理需要 | Phase 3 验证发布/拉取一门含 `.sb3` 的课程 |

---

## 分支与节奏

- 分支名：`feat/scratch-migration`（不用 "prototype/spike" 这类弱化措辞——这是明确的替换工程，不是实验）
- Phase 1 完成后可以先合并到 `feat/scratch-migration` 主线（不合并到 `main`），后续 Phase 在同一分支上迭代
- 每个 Phase 完成后在 PR 描述里更新验收状态，方便追踪整体进度
- 只有 Phase 4 完成、全部验收标准通过后，才考虑 merge 到 `main`

---

## 下一步立即行动

1. 验证 Phase 1 的技术可行性：把 `scratch-gui` 拉进项目，确认 Electron 打包和加载没有阻塞性问题（这是最大的未知风险，应该最先排除）
2. 如果 Phase 1 顺利，再排 Phase 2 的第一个任务（建议选图像分类，因为它是课程里最常用的任务，也是 spec 结构最简单的一个）
