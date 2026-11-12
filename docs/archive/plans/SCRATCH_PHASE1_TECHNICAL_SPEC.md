# Phase 1 技术方案：Scratch 编辑器接入

对应 [SCRATCH_MIGRATION_PLAN.md](SCRATCH_MIGRATION_PLAN.md) 的 Phase 1。本文档只回答一件事：**Scratch 编辑器怎么在这个项目里跑起来**，不涉及 XEduHub 能力接入（Phase 2）。

---

## 技术事实（先立住，再决策）

| 事实 | 数据 |
|---|---|
| `scratch-gui` 分发形态 | npm 包本身不含预构建产物，`main` 指向 `./dist/scratch-gui.js`，但该文件由包自己的 `prepublish`/`build` 脚本生成，不在 `files` 清单里 |
| `scratch-gui` 构建工具链 | Webpack（`npm run build` = `webpack`） |
| `scratch-gui` peer dependency | 强制要求 `react@^16` + `react-dom@^16` |
| `scratch-gui` unpacked 体积 | ~87MB |
| `scratch-vm` unpacked 体积 | ~24MB（核心执行引擎，不含编辑器 UI） |
| 本项目前端工具链 | Vite，无 Webpack，无 React（[package.json](package.json) 确认） |
| 本项目现有体积门禁 | [scripts/check_bundle_size.js](scripts/check_bundle_size.js)，CI 强制检查，超限直接失败 |
| 本项目现有构建体积基线 | `build/` 目录 2.9MB |

**结论**：`scratch-gui` 不能像装普通依赖一样 `npm install` 后直接 `import` 进 Vite 的模块图——工具链不兼容（Webpack vs Vite），也没有可直接消费的预构建产物。

---

## 集成方式选型

### 选项对比

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| **A. 独立构建 + 静态资源加载** | 单独用 scratch-gui 自带的 webpack 配置构建出静态产物，作为本地资源被主应用加载（类似 TurboWarp Desktop 的做法） | 工具链完全隔离，不污染主应用的 Vite/React 生态；scratch-gui 后续升级不影响主应用构建 | 需要维护第二套构建流程；产物体积是既定事实，无法用 Vite 的 tree-shaking 收窄 |
| **B. 主应用引入 React，直接消费 scratch-gui 源码** | 给整个项目加 React 依赖，把 scratch-gui 当普通组件库用 | 理论上能和主应用共享构建产物 | scratch-gui 内部大量依赖 Webpack 专属特性（如 `worker-loader`、CSS Modules 配置），Vite 下大概率需要大量兼容层改造，风险高且工作量不可控 |
| **C. 只用 scratch-vm（不用 scratch-gui），自建最简 UI** | 只引入执行引擎（24MB），舞台渲染和积木编辑 UI 自己写 | 体积可控，UI 风格可以贴合本项目现有设计语言，不需要吃下 scratch-gui 的 87MB | 工作量大幅增加——积木拖拽编辑器本身就是一个复杂工程（Blockly 团队花了数年做这个），自建等于重新造轮子 |

### 决策：选 A

理由：
- C 方案本质是"用 scratch-vm 重新做一个 Blockly"，工作量和当初做 Blockly 定制化的量级相当，不符合"完全替换"这个目标的性价比
- B 方案的风险是不可控的——Webpack 专属 loader 能不能在 Vite 里跑通，需要试了才知道，一旦踩坑排查成本很高
- A 方案是业界验证过的路径（TurboWarp、CodeCombat 等桌面套壳 Scratch 项目都是这么做的），风险最低，失败模式也最容易提前发现（构建阶段就会暴露，不会拖到运行时）

---

## 具体接入方案

### 目录结构

```
scratch-editor/                 # 新增，独立的 scratch-gui 构建工程，不在 renderer/ 下
  package.json                  # 独立的依赖声明（react, react-dom, scratch-gui, scratch-vm, scratch-blocks）
  webpack.config.js             # 基于 scratch-gui 官方配置精简，只保留桌面单机场景需要的部分
  src/
    index.jsx                   # 入口，渲染 scratch-gui 的 GUI 组件
  build/                        # 构建产物输出目录（gitignore）
```

**为什么是独立工程而不是 `renderer/js/scratch/`**：因为构建工具链不同（Webpack vs Vite），放进同一个 `renderer/` 会让两套工具链在同一目录下打架（比如 Vite 会尝试解析 scratch-editor 里的 JSX/import，产生不必要的干扰）。独立工程能让 `npm run build` 的整体流程保持"分别构建，各自产出静态文件"的清晰边界。

### 主应用如何加载

Electron 主进程本地起一个静态文件服务（复用现有的做法——项目已经有本地 Flask/静态资源服务模式，[resources.py 里 `/api/resources/frontend-assets/...`](backend/api/routes/resources.py) 就是先例），把 `scratch-editor/build/` 挂载为一个可访问的本地路径，主应用用 `<iframe>` 加载这个本地路径。

```
渲染进程 (Vite 主应用)
  └─ <iframe src="http://127.0.0.1:5123/api/scratch-editor/index.html">
       └─ scratch-editor/build/index.html（独立构建产物，内含 React + scratch-gui）
```

这不是"加载远程 scratch.mit.edu"（那是之前方案的错误之处），是加载**本地打包好的静态文件**，本质和现在 Blockly playground 用服务端渲染 HTML 包裹再嵌入的模式（[resources_blockly.py:31](backend/api/routes/resources_blockly.py:31) `build_blockly_playground_html`）是同一类做法，只是这次内容是 scratch-gui 的构建产物而不是手写 HTML。

### CSP 调整

当前 CSP（[renderer/index.html:6](renderer/index.html:6)）:
```
frame-src 'self' http://127.0.0.1:* http://localhost:* data: blob:;
```

`frame-src` 已经允许 `http://127.0.0.1:*`，如果 scratch-editor 静态资源通过本地后端服务的 `127.0.0.1` 地址提供，**不需要放宽 CSP**——这是选择"本地加载"而不是"远程加载 scratch.mit.edu"的直接好处，一开始设想的 CSP/跨域问题在这个方案下不存在。

### 项目文件（`.sb3`）落盘

`.sb3` 本质是一个 zip 包（Scratch 项目格式）。落盘位置对齐现有课程资源组织方式：与 `.blockly.xml` 现在的存放位置同级（如 `lesson1/exp1/scratch/project.sb3`），走现有的本地文件读写路径（[resolve_local_course_file](backend/api/routes/resources_blockly.py:20) 同款函数复用），不需要新的存储抽象。

---

## 体积门禁的处理

`scripts/check_bundle_size.js` 目前只检查 `build/assets/` 下 Vite 产出的几个文件。`scratch-editor/build/` 是完全独立的产物目录，**不会被现有门禁误伤**，但需要：

1. 新增一条门禁规则，给 `scratch-editor/build/` 设置一个体积上限（建议先设一个宽松值如 15MB，观察实际构建结果后收紧）
2. 决定 `scratch-editor/build/` 要不要提交进 Git 仓库——**建议不提交**，作为构建产物在 CI/打包阶段生成，类比 `build/` 目录现在的处理方式（`emptyOutDir: true`，每次重新生成）

## electron-builder 打包体积影响

`scratch-editor/build/` 最终要打进 `electron-builder` 的产物（对齐 [package.json](package.json) 里 `extraResources` 的模式，新增一条把 `scratch-editor/build` 拷贝到 `to: "scratch-editor"`）。

**预期影响**：现有 `dist-final` 产物已经包含完整 Python 环境等大体积资源（历史构建产物达到 GB 级），scratch-gui 构建产物（经过 tree-shaking 和压缩后，实际体积通常明显小于 87MB unpacked 数字）在这个基数上不会是决定性的增量，但仍需要 Phase 1 验收时给出实测数字，不能只靠估算。

---

## 验证步骤（可执行的最小验证）

1. `mkdir scratch-editor && cd scratch-editor && npm init -y`
2. 安装最小依赖集：`react react-dom scratch-gui`
3. 写一个最简 `webpack.config.js`（参考 scratch-gui 官方仓库的 `webpack.config.js`，去掉不需要的 i18n/云同步相关配置）
4. 写一个最简 `src/index.jsx`，只渲染 `<GUI />` 组件，不接任何扩展
5. `npm run build`，检查产物是否生成、体积多大
6. 本地起一个静态服务器（`npx serve build`）单独验证 scratch-gui 能否独立跑通（不涉及 Electron）
7. 确认独立跑通后，再接入 Electron 主应用的 iframe 加载路径

**每一步都是可以独立验证、独立失败的**，不需要一次性搭好整条链路才能看到结果。如果第 5 步产物体积远超预期或第 3 步 Webpack 配置遇到无法绕过的阻塞，此时就该停下来重新评估，成本可控。

---

## 验收标准（对应 SCRATCH_MIGRATION_PLAN.md 的 Phase 1）

- [ ] `scratch-editor` 独立构建成功，产物体积有实测数字（不是估算）
- [ ] 独立静态服务器验证 scratch-gui 能加载、能拖拽积木、能保存 `.sb3`（脱离 Electron 环境的最小验证）
- [ ] Electron 主应用能通过 iframe 加载本地 scratch-editor 产物，无 CSP 报错、无白屏
- [ ] `.sb3` 项目文件能保存到课程目录并重新加载
- [ ] 不影响现有 Blockly 入口的任何功能（并存验证）
- [ ] electron-builder 打包后，实测总体积增量有明确数字，写进验收记录

---

## 已知风险与应对

| 风险 | 应对 |
|---|---|
| scratch-gui 官方 webpack 配置里有云同步、账号系统等桌面单机场景不需要的模块，裁剪时可能牵一发动全身 | 第一次构建先不裁剪，跑通再逐步精简，避免一开始就在配置层踩坑 |
| React 16 是相对旧的版本，和项目其他部分无 React 共存是否有 polyfill/全局变量冲突 | scratch-editor 是完全独立构建产物，运行在自己的 iframe 里，与主应用是不同的 JS 执行上下文，理论上不会冲突；Phase 1 验收时需实测确认 |
| `.sb3` 文件读写涉及 zip 解压缩，是否需要新的后端依赖 | Python 标准库 `zipfile` 已足够，不需要新增依赖 |

---

## 这份方案明确不覆盖的内容

- XEduHub 任务如何接入 Scratch（见 Phase 2，另起文档）
- 课程内容迁移细节（见 Phase 3）
- Blockly 下线清理（见 Phase 4）

本文档只回答"Scratch 编辑器怎么跑起来"这一个问题。
