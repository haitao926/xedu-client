# XEdu Client 教师培训与分发前发布审计

> 审计日期：2026-07-16；最近复核：2026-07-19
> 发布对象：参加培训的教师、回校后独立使用软件的教师
> 教学场景：1 名教师组织 30 名学生进入课程并完成 Jupyter 或 Scratch 实验
> 审计范围：当前工作区源码、`dist-final/` 现有产物、构建配置、安全边界和课堂运行链路
> 状态说明：源码整改与本地质量门禁已完成复核；RC3 发布候选已由 `v2.0.0-rc.3` 标识，基线实现为 `89cdbd95`，但现有 `dist-*` 仍是本地诊断产物。只有从该 tag 重新构建、签名并完成实机验收的内容才算正式关闭。

> **产品方向：Scratch 是唯一继续维护的图形化编程主线。本次发布前完全移除 Blockly 编辑器、入口、依赖和专属代码，不保留旧课程编辑兼容；旧 Blockly 课程统一显示“该实验类型已不再支持”，并保证应用不崩溃。Scratch 正在使用的 XEduHub 共享设施必须先迁移并验证，不得随 Blockly 专属代码一起删除。**

> **2026-07-19 增量复核**：Scratch 构建依赖已从上游临时嵌套安装改为 `scratch-editor` lockfile 中的显式 devDependencies，clean runner 可通过 `npm ci --prefix scratch-editor` 重现构建；修复 hoisted npm 布局下 Scratch blocks/MediaPipe 静态资源复制路径。`npm run quality-gate` 新鲜执行通过：后端 `136 passed`、Scratch `22 passed`、发布/安全/Renderer 契约、Vite 构建和 bundle guard 全部通过；root npm audit 为 `0` 项漏洞，Scratch lock 当前为 `21` 项（`5 critical / 6 high / 10 moderate / 0 low`），`--omit=dev` 仍有 `20` 项，现已由有期限例外与 reachability 门禁管理，仍需安全负责人批准或上游升级。`xedu-python==2.0.0` 可以导入 `XEdu.hub.Workflow` 并返回支持任务；教师设置页现会在所选解释器中探针，并提供精确元数据修复。发布校验器现已读取 app.asar/Info.plist 真实版本、扫描 app.asar 内部残留并独立验证 release commit/tag；官方 workflow 已加入 checkpoint 凭据前置检查，并归档完整依赖审计和签名证据。当前仍不把已有 unpacked 产物视为正式交付包；签名、公证、真实 `.sb3` GUI、教师实机和 30 台终端验收继续保持未关闭。

## 目录

- [一、发布结论](#一发布结论)
- [二、发布产物与安装体验](#二发布产物与安装体验)
- [三、安全审计](#三安全审计)
- [四、课堂稳定性](#四课堂稳定性)
- [五、教师使用体验](#五教师使用体验)
- [六、整改 Task List 与验收标准](#六整改-task-list-与验收标准)
- [七、分阶段放量](#七分阶段放量)
- [八、中长期工程债务](#八中长期工程债务)
- [附录 A：安装包体积](#附录-a安装包体积)
- [附录 B：checkpoint 模型清单](#附录-bcheckpoint-模型清单)
- [附录 C：本次复核证据](#附录-c本次复核证据)
- [附录 D：关键证据索引](#附录-d关键证据索引)

## 一、发布结论

### 1.1 决策

| 发布方式 | 结论 | 条件 |
|---|---|---|
| 面向教师正式普发 | **No-Go** | RC tag 已冻结，但还没有来自该 tag 的签名安装包，Windows 和 macOS 安装信任链未闭合，真实教师与课堂矩阵尚未完成 |
| 教师回校独立安装和授课 | **No-Go** | 尚未验证跨学校网络、30 机并发、故障自助恢复和应用升级路径 |
| 受控培训试点 | **Conditional Go** | 课前统一预装、同一网段、课程提前下载、现场配备助教和离线备用包 |
| 开发与教研内部验证 | **Go** | 使用当前源码运行质量门禁，不把旧安装包当作候选发布包 |

RC3 已进入提交和 tag，但本地 `dist-*` 安装包不能替代 tag 产物。团队必须从 `v2.0.0-rc.3` 重新构建、签名并验收最终安装包。

### 1.2 当前最高风险

| 优先级 | 风险 | 教师现场后果 | 发布门槛 |
|---|---|---|---|
| **P0** | 现有可交付包尚未完成产物级验收 | Scratch 课程可能无法打开或包内带入旧运行时 | 两个平台的最终包都包含 `resources/scratch-editor/build/index.html`，不含 `python_env`，并完成真实 `.sb3` 实机测试 |
| **P0** | Windows 未签名，macOS 未完成 Developer ID 签名和公证 | 系统提示未知发行者或阻止启动，教师停止安装 | Windows 签名状态为 `Valid`；macOS 通过 `codesign` 和 `spctl` 验证 |
| **P0** | 旧安装包可能保留旧菜单与运行时 | 教师拿到旧包时仍可能触达不应暴露的调试入口 | 从当前 release commit/tag 重建；打包版没有 DevTools 菜单和快捷键，并有回归测试 |
| **P0** | Blockly 已从源码主线移除，最终安装包和教师实机仍待验收 | 旧包或环境差异可能保留旧资源，或实机上 Scratch XEdu AI 与课程保存行为不同 | 从当前源码重新构建两平台包；旧课程只显示不支持提示，Scratch XEduHub 冒烟和全量质量门禁通过 |
| **P0** | 依赖审计仍有非 Electron 风险项 | 风险随安装包或构建链进入教师终端 | Scratch 21 项发现必须通过有 owner/到期日/缓解措施的例外门禁或完成上游升级；Python 依赖完成扫描并验证教师实际环境 |
| **P1** | 课堂发现只有 UDP 广播 | VLAN、无线隔离或防火墙环境中，学生找不到教师 | 增加手动输入教师地址入口，并在隔离网络中完成测试 |
| **P1** | 课程包按学生请求重复压缩 | 30 人同时进课时，教师机 CPU 升高、学生超时 | 缓存或预生成课程包，完成 30 客户端并发测试 |
| **P1** | 软件没有应用自动更新和回滚机制 | 教师回校后继续使用旧版本，支持人员难以统一版本 | 明确人工升级、数据备份、版本识别和回滚流程 |

### 1.3 原审计项的最新状态

| 编号 | 原结论 | 当前状态 | 说明 |
|---|---|---|---|
| **S1** | Scratch Editor 未打包 | **源码关闭，产物待验收** | 当前构建链已强制执行 Scratch 构建与入口检查；`dist-final-current/` 虽含 Scratch，但不是 release commit/tag 产物 |
| **S2** | backend 双重打包 | **已关闭（源码）** | backend 已移出 `files`，由 `extraResources` 单独提供，产物级校验仍需随最终包执行 |
| **S3** | 生产包开放 DevTools | **已关闭（源码）** | DevTools 菜单和快捷键仅在未打包开发模式注册；旧安装包不继承此结论 |
| **S4** | 窗口无最小尺寸 | **已关闭（源码）** | 主窗口已设置 `minWidth: 960`、`minHeight: 600`，仍需投影环境实机确认 |
| **S5** | `/api/python/pip` 无鉴权 | **已关闭** | 当前路由已有 `@require_capability("python:run")`，安全回归测试通过 |
| **S6** | macOS 只生成 zip | **已关闭（配置）** | 当前配置同时声明 `dmg` 和 `zip`；本次不启动归档，正式产物仍待 release 环境生成 |
| **S7** | Windows 未签名 | **配置已关闭，产物未关闭** | `electron-builder.release.cjs` 对 Windows release 强制 `forceCodeSigning` 和 `signAndEditExecutable`；正式证书和安装包签名仍待外部凭据 |

### 1.4 已具备的基础

- 后端启动链会探测 Python 路径、轮询健康状态、记录启动日志并处理异常退出。
- 配置服务使用原子写入、备份和损坏回退，降低配置文件损坏造成的停课风险。
- Jupyter 服务支持端口切换、进程检查和有限次数的自动重启。
- 高权限 API 已引入进程级 capability token；资源路径使用服务端登记的 opaque handle。
- 主窗口与 Jupyter 视图已经启用 `sandbox: true` 和 `webSecurity: true`。
- Scratch 工作区已有“正在连接”占位状态，iframe 现在有 12 秒超时反馈、自动重试和手动重试入口。
- 默认导航、活动课程和培训材料已经锁定为 Scratch；Blockly 编辑器、入口、依赖和专属源码已移除，旧课程降级提示已加入回归测试。

这些能力需要进入同一次重新构建的最终安装包，并通过实机测试。

### 1.5 本轮轻量版 Python 策略

本轮先交付不内置 `python_env` 的轻量版，不启动新的 DMG、zip 或 Windows 安装包生成。教师端需提前安装 Python 3.10+，首次启动通过文件选择器绑定本机解释器。Windows 使用 `Scripts/python.exe` 或 `python.exe`，macOS 使用 `bin/python3` 或 `bin/python`。

选择路径保存到用户数据目录的配置文件，不写入安装目录；Electron 后端启动、Jupyter 启动、`/api/detect_python` 和 Python 包管理均使用同一配置。设置页会在所选解释器内执行 XEduHub 探针；精确 `xedu-python==2.0.0` 的旧元数据冲突可通过“修复兼容性”显式处理，修复后必须重新测试。未选择时，应用保留主界面和“选择本机 Python”恢复入口，不显示“缺少内置 Python”错误框。

---

## 二、发布产物与安装体验

### 2.1 现有产物不能作为候选发布包

| 产物 | 大小 | 文件时间 | 主要问题 |
|---|---:|---|---|
| `XEdu Client-2.0.0.exe` | 约 1.2 GB | 2026-06-02 | 早于当前安全修改，未签名，未包含当前 Scratch 构建结果 |
| `XEdu Client-mac-arm64.zip` | 约 593 MB | 2026-05-03 | 早于当前安全修改，缺少 Scratch，签名校验失败 |
| `win-unpacked/` | 约 3.2 GB | 混合产物 | 适合排查文件，不适合交付教师 |
| `其他/XEdu Client-mac-arm64.dmg` | 旁路文件 | 不属于当前配置 | 不能证明正式构建流程会生成 DMG |
| `dist-final-current/mac-arm64/` | 约 5.6 GB | 2026-07-17 | 已含 Scratch，但仍是未签名旧工作区产物，且含被当前门禁禁止的 `python_env` |
| `dist-final-20260718-mac/mac-arm64/` | 约 2.9 GB | 2026-07-18 | 基于当前工作区最新代码生成的 macOS arm64 unpacked 包；内容校验通过，但未签名，不是正式交付包 |

`dist-final/builder-effective-config.yaml` 没有 `scratch-editor/build`，而当前源码配置已经声明该资源。当前 `dist-final-current/mac-arm64/` 的包内确实存在 Scratch，但 `scripts/verify_release_artifact.mjs` 会因发现 `Resources/python_env` 拒绝该包；这证明它不能替代当前发布链。`latest-mac.yml` 的发布日期为 2026-03-17。发布目录混合了多次构建结果，团队无法从目录内容确认某个安装包对应哪次源码。

**整改要求**

1. 清空专用发布输出目录，在干净工作区从一个 Git tag 构建。
2. 为 Win 和 mac 分别保存构建日志、有效配置、文件清单和 SHA-256。
3. 阻止构建脚本在 Scratch 输出目录缺失时继续打包。
4. 在 CI 或发布脚本中解包产物，检查 Scratch、backend、checkpoint 和版本号，并确认不含 `python_env`；Python 环境改由教师在本机选择。
5. 正式发布目录只保留一个版本的交付文件，不混放旧包和旁路测试包。

### 2.2 Scratch 打包状态

当前源码已经执行以下链路：

```text
build.sh
  -> npm run build:scratch
  -> npm run build
  -> electron-builder
```

`package.json` 会把 `scratch-editor/build` 复制到 `resources/scratch-editor/build`。当前源码构建链已经在打包前执行 `npm run build:scratch` 和 `check:scratch-build`；当前 macOS unpacked 证据也已找到该入口。旧 Win/mac 包仍不能作为证据，必须从同一 release commit/tag 重新构建。

**验收标准**

- 构建前确认 `scratch-editor/build/index.html` 存在。
- Win 和 mac 解包后都存在 `resources/scratch-editor/build/index.html`。
- `/api/scratch-editor/index.html` 返回编辑器页面，不返回“尚未构建”占位页。
- 使用真实 `.sb3` 文件完成打开、编辑、保存、重启后恢复测试。
- XEdu AI Scratch 扩展完成一次真实推理冒烟测试。

### 2.3 backend 重复打包

`package.json` 已将 backend、config 和 scripts 从 `files` 移除，仅通过 `extraResources` 提供运行时资源。当前源码契约要求 `resources/backend` 存在、`app.asar` 不含第二份 backend，并过滤 tests、缓存和重复 checkpoint。

主进程在打包环境从 `process.resourcesPath/backend` 启动后端。asar 内的 backend 不参与正常启动。

**整改要求**

- 从 `files` 中移除不需要进入 asar 的 backend、config 和 scripts。
- 为 backend extraResources 增加过滤规则，排除 `tests/`、`__pycache__/` 和不参与运行的工具文件。
- 解包检查 `app.asar`，确认其中不再含第二份 backend。

### 2.4 Windows 安装信任

Windows 配置明确关闭强制签名。轻量版不再把 Python 环境放入安装包，但模型文件、backend 和 `elevate.exe` 仍可能提高下载与安装体积；需用新构建重新测量。

截图教程只能支持内部试点。正式分发需要数字签名。

普通组织代码签名可以消除“未知发行者”，但新证书仍可能因信誉不足触发 SmartScreen。团队如果需要首发即降低信誉拦截，应评估 EV 证书，并通过浏览器真实下载路径测试安装包。

**验收标准**

- `Get-AuthenticodeSignature` 返回 `Status: Valid`。
- 安装界面显示组织名称，不显示“未知发行者”。
- 在干净的 Windows 10 和 Windows 11 x64 机器上完成下载、安装、首开和卸载。
- 使用学校常见终端安全策略测试安装，不要求教师关闭杀毒软件。

### 2.5 macOS 安装信任

正式配置现在生成 arm64 DMG 和 zip，并启用 hardened runtime 与 entitlements。当前 App 使用临时签名，`codesign --verify --deep --strict` 校验失败；本机没有 Developer ID 证书，notarization 仍未执行。

DMG 只改善安装引导，签名与公证决定教师能否正常打开应用。

**验收标准**

- 构建同时生成 DMG 和 zip，DMG 展示拖入 Applications 的安装引导。
- App 使用 Developer ID Application 证书签名。
- Apple 公证成功并完成 staple。
- `codesign --verify --deep --strict` 和 `spctl --assess --type execute` 都通过。
- 明确支持 Apple Silicon；如果不提供 Intel 构建，下载页必须写明限制。

### 2.6 系统要求需要重新测量

现有快速入门写有“Windows / Linux / macOS、4GB+ RAM”，但发布配置只覆盖 Windows x64 和 macOS arm64。当前解压体积约为 Windows 3.2 GB、macOS 2.5 GB，AI 模型和 Python 运行还会占用内存与临时磁盘。

团队应在目标机器上测量并发布以下信息：

- 支持的操作系统版本和 CPU 架构。
- 最低与推荐内存。
- 安装阶段、首次启动和课程运行所需磁盘空间。
- 摄像头、网络、防火墙和管理员权限要求。
- 不支持的平台，例如当前没有安装包的 Linux 和 macOS Intel。

---

## 三、安全审计

### 3.1 生产 DevTools 构成高权限入口

当前源码已将“开发者工具”和快捷键限制在未打包开发模式。preload 向主窗口暴露命名 IPC，主进程会为 API 代理请求附加 `X-XEdu-Client-Token`；因此仍需防止旧产物被误发，并在最终包上复验菜单行为。

任何能操作教师终端的人都可以在 DevTools 控制台调用这些 IPC。可触达能力包括 pip 包管理、配置写入、课程资源操作和课堂控制。S3 应按高危安全问题处理。

**整改要求**

- 打包版菜单不创建 DevTools 项，也不注册对应快捷键。
- `openDevTools` 和 `toggleDevTools` 只在 `!app.isPackaged` 条件下执行。
- 增加生产菜单契约测试。
- 复核 preload 的每个能力，继续拆分通用代理，限制请求路径、方法和载荷大小。
- 避免让课堂口令等敏感值长时间停留在渲染层存储中。

### 3.2 pip 鉴权已关闭

当前 `/api/python/pip` 已添加：

```python
@require_capability("python:run")
```

测试覆盖匿名访问返回 401，并确认请求方不能覆盖 Python 可执行文件路径。S5 可以从开放问题列表中移除。

### 3.3 其他安全加固状态

| 项目 | 当前状态 | 备注 |
|---|---|---|
| `/api/python/run` capability | 已完成 | 主进程代理注入 token |
| `/api/python/pip` capability | 已完成 | 回归测试通过 |
| 课堂控制接口 capability | 已完成 | start、stop、pull 等写操作受保护 |
| `/api/debug/env` capability | 已完成 | 诊断接口不再匿名开放 |
| CORS 白名单 | 已完成 | 不默认允许 `*` |
| 配置敏感字段脱敏 | 已完成 | API key 等字段不进入公共返回路径 |
| 资源路径 opaque handle | 已完成 | 降低路径伪造和目录穿越风险 |
| Electron sandbox | 已完成 | 主窗口和 Jupyter 视图启用 |
| Electron webSecurity | 已完成 | 主窗口和 Jupyter 视图启用 |
| 生产 DevTools | 已关闭源码风险 | 仍需以最终签名包复验 |

### 3.4 Electron 与依赖风险

当前 `package-lock.json` 锁定 `electron 39.8.10`，`electron-builder 26.15.3`，Vite 已升级到 `8.1.5`，并通过 npm override 收口 lodash。2026-07-19 执行根项目 `npm audit --package-lock-only --json` 得到 `0` 项漏洞；对 `scratch-editor/package-lock.json` 执行 `npm audit --prefix scratch-editor --package-lock-only --json` 得到 `21` 项漏洞（`0 low / 10 moderate / 6 high / 5 critical`），不能直接等同为教师端运行时漏洞，需分别记录运行时与构建链影响。

根项目的旧审计数量不能继续作为当前结果；当前剩余风险集中在 Scratch 上游构建依赖。正式发布记录必须分别保存根项目、Scratch 子项目和两套 Python requirements 的审计输出。

**发布门槛**

- Electron 和根项目直接依赖不命中当前 high/critical 公告；Scratch 上游构建/本地化链的剩余发现需有 reachability 证据和到期复核责任人。
- 团队记录无法立即升级的 Scratch 构建依赖、影响范围和临时缓解措施。
- Electron 升级后重新运行 preload、安全 API、窗口、Jupyter 和最终包测试。
- Python 固定直接依赖子集（24 个 exact `==` 条目）已通过 `pip-audit --no-deps`，为 `0` 个已知漏洞；`requirements.txt` 与 `requirements_full.txt` 已移除未使用的 `kimi-agent-sdk` 并固定 OCR/ONNX/Protobuf 版本，resolver 可完成，正式候选仍需保存完整 `pip-audit` 输出。

### 3.5 课堂公开读取边界

教师允许局域网访问后，课堂索引、课程文件和课程包需要向学生开放。当前公开读取接口没有独立的短期分享 token。

这属于课堂分发设计，但教师需要知道局域网内其他设备可能读取当前发布课程。正式版可使用课堂会话 token、签名 URL 或短期凭证缩小公开范围。

### 3.6 Python 代码执行边界

`/api/python/run` 以当前用户权限执行课程代码。教学实验需要访问 OpenCV、模型、摄像头和本地课程文件，因此当前实现没有通用沙箱。

团队需要补足资源保护：

- 限制输出总量，避免高频打印占满内存。
- 限制或监控子进程内存，并处理 Windows 与 macOS 的差异。
- 超时时终止整个进程树，避免残留子进程继续占用摄像头或端口。
- 在教师手册中说明课程代码可以访问当前用户有权限读取的文件。

---

## 四、课堂稳定性

### 4.1 课堂发现缺少网络兜底

教师端每 2 秒向 `255.255.255.255:39527` 发送 UDP 广播，学生端监听 1.5 秒。广播通常无法跨越 VLAN、子网和无线客户端隔离。

后端已有按 `base_url` 拉取课堂索引的能力，前端主流程没有可见的手动地址入口。团队可以复用现有 API 增加兜底，不需要重写课堂协议。

**验收标准**

- 自动发现失败时，界面允许输入 `http://教师IP:端口`。
- 界面展示教师机 IP、端口和防火墙提示。
- 同网段、跨 VLAN、无线隔离三种条件都有明确结果。
- 课堂连接失败时保留重试和手动连接入口，不让学生退出整个流程。

### 4.2 30 人同时拉课会重复压缩

Flask 当前使用 `threaded=True`。每个 `/api/classroom/package/...` 请求都会创建临时 ZIP，响应结束后删除。30 名学生同时进入同一课程会触发 30 次磁盘压缩。

**整改要求**

1. 教师开启课堂时按课程 ID、版本和内容摘要预生成 ZIP。
2. 多名学生复用同一只读文件。
3. 课程变化或课堂结束后清理缓存。
4. 评估 waitress 等适合 Windows 的生产 WSGI 服务。

**验收标准**

- 使用一份代表性课程模拟 30 个客户端同时下载。
- 30 个客户端在约定时间内完成，教师机界面保持可操作。
- 测试记录课程大小、耗时、CPU、内存、失败数和重试数。
- 客户端中断下载后不留下无法清理的临时文件。

### 4.3 Python 资源限制

当前执行超时为 1 至 120 秒，默认 20 秒；视频流任务会提高超时。实现仍会一次性收集普通 Python 任务的 stdout 和 stderr，也没有跨平台内存限制。

以下学生代码可能拖慢整机：

```python
x = [0] * (10**9)
while True:
    print("x" * 10000)
```

输出截断和进程树终止应列入课堂版 P1。内存限制需要按 Windows Job Object 与 macOS 进程限制分别设计，不能只加入 Unix `resource.setrlimit`。

### 4.4 启动与恢复

后端启动具备多路径 Python 探测、健康检查和日志记录。配置损坏可以回退备份，Jupyter 具备端口扫描和有限次数重启。

教师仍可能遇到两类难以自助处理的提示：

- 后端启动失败对话框包含退出码和日志片段，信息偏技术。
- Jupyter 启动失败仍可能直接展示底层异常文本。

错误界面应给出“重试”“打开日志目录”“恢复默认配置”“联系支持并复制诊断信息”四类操作。

### 4.5 离线边界

| 功能 | 断开互联网 | 所需条件 |
|---|---|---|
| Jupyter Notebook | 可用 | 教师已选择 Python 3.10+ 且依赖安装完整 |
| Python 代码执行 | 可用 | 教师已选择 Python 3.10+，所需模型和依赖已安装 |
| Scratch | 可用 | 最终安装包包含 Scratch 构建资源 |
| 旧 Blockly 课程 | 不支持，提供降级提示 | 识别实验类型后显示“该实验类型已不再支持”，不加载 Blockly 编辑器且应用不得崩溃 |
| 已导入课程 | 可用 | 课程材料已下载到本机 |
| AI 助手 | 不可用 | 需要模型服务和网络 |
| Gitea 课程拉取 | 不可用 | 需要访问课程服务器 |
| 课堂发现与分发 | 局域网可用 | 设备互通，防火墙允许相关端口 |

发布文案必须区分“课程更新”和“应用更新”。当前代码支持课程拉取，没有发现 Electron 应用自动更新实现。

---

## 五、教师使用体验

### 5.1 窗口与投影

主窗口初始尺寸为 1200×800，最小尺寸为 960×600。仍需在 1024×768 投影环境确认布局可用性。

**发布前修改**

- 已设置 `minWidth: 960`、`minHeight: 600`；仍需在 1024×768 环境验证。
- 检查 Jupyter 视图、弹窗和课程详情在投影镜像下的层级。
- 为培训讲师提供演示字号或演示模式；当前界面有较多 11 至 14 px 文本。

### 5.2 加载反馈的最新状态

原报告的“M4 iframe 加载无反馈”已经关闭。当前 Scratch 工作区会显示“正在连接”占位状态，在 iframe `load` 后切换内容；超过 12 秒会显示超时原因，并提供自动和手动重试。

最终包仍需在低性能机器上验证加载时长、超时提示和重试结果。

### 5.3 项目向导按钮

`wizard-btn-prev` 的内联样式仍有两个 `display` 声明，但 `project-wizard.js` 会在第一步把按钮设为 `display: none`。当前问题属于代码清理项，不应继续描述为“第一步永远显示上一步”。

建议删除重复内联声明，并增加向导首屏 UI 测试。

### 5.4 全局错误处理

Renderer 已注册全局 `unhandledrejection` 处理器。处理器会阻止默认未处理异常事件、记录脱敏错误摘要，并以节流 Toast 提醒教师重试；仍需在 Electron 实机做一次故障注入，验证具体按钮状态能否恢复。

全局处理器应记录脱敏日志并恢复界面状态。它不能用统一弹窗替代每个业务流程的错误提示。

### 5.5 教师交付资料

当前仓库提供测试说明，教师还需要一套交付资料：

- 带截图的 Windows 和 macOS 安装手册。
- “10 分钟完成第一次课程”的快速开始。
- 课堂网络检查表：同网段、端口、防火墙、手动地址。
- 离线与联网功能清单。
- 课程导入、备份、更新和恢复说明。
- 常见错误、日志位置、版本号和支持渠道。
- 卸载时保留或删除课程数据的说明。

---

## 六、整改 Task List 与验收标准

### 6.1 全局约束

- Scratch 是唯一继续开发和验收的图形化编程主线。
- 新课程、培训材料和默认导航不得新增 Blockly 入口或文案。
- 本次发布前完全移除 Blockly 编辑器、入口、npm 依赖和专属前后端代码，不保留旧课程编辑兼容。
- 旧 Blockly 课程只能进入“该实验类型已不再支持”的降级流程，不得回退到旧编辑器，也不得导致应用崩溃。
- `/api/resources/xeduhub/execute` 等 Scratch 正在使用的共享设施必须先迁移和验证；`backend/runtime/xeduhub_runtime.py` 保留 `XEduCamera` 等视频运行能力。
- 代码任务先写失败测试，再实现最小修改；每项任务使用独立 Lore Commit。
- 不新增依赖。确需升级 Electron 时，只更新现有依赖和锁文件。
- 每项任务提交测试输出或实机记录。负责人不能用“代码已修改”代替验收证据。
- 状态说明：`[x]` 表示代码与本地验收完成；`[~]` 表示代码已完成但仍需真实设备、签名凭据或教师试用；`[ ]` 表示尚未完成。

### 6.2 任务总表

| ID | 优先级 | 任务 | 负责人角色 | 依赖 | 状态 |
|---|---|---|---|---|---|
| T00 | P0 | pip 与高权限 API capability 收口 | Backend / Security | 无 | [x] 已完成 |
| T01 | P0 | 迁移共享 XEduHub 并完全移除 Blockly | Backend / Renderer / Course / QA | 无 | [x] 源码迁移、删除、降级测试和完整质量门禁完成；实机包验收归 T02/T13 |
| T02 | P0 | 建立 Scratch 构建、打包和真实项目门禁 | Scratch / Release / QA | T01 | [~] Scratch 构建、入口检查和 `22 passed` 已通过，真实 `.sb3` 实机待验收 |
| T03 | P0 | 关闭生产 DevTools | Electron / Security | 无 | [x] 已完成，本地契约通过 |
| T04 | P0 | 升级 Electron 并设置最小窗口 | Electron / QA | T03 | [x] 已完成，本地契约通过 |
| T05 | P0 | 清理打包结构并建立不内置 Python 的轻量版产物契约 | Release / Electron | T02 | [~] 源码配置、解析流程和契约已完成，正式跨平台产物待构建 |
| T06 | P0 | 完成 Windows 签名与 macOS 公证 | Release Owner | T05 | [~] 已加入 macOS hardened runtime 配置，证书/公证待外部凭据 |
| T07 | P0 | 建立最终安装包内容与版本门禁 | Release / QA | T02-T06 | [~] 校验器、ASAR/版本/身份检查和本地契约通过；正式签名产物与发布目录仍待验收 |
| T08 | P1 | 增加课堂手动地址连接 | Renderer / Backend | T01 | [~] 代码与单测完成，跨 VLAN 实机待验收 |
| T09 | P1 | 缓存课堂课程包并完成 30 客户端压测 | Backend / Performance | 无 | [~] 单机 packaged backend 已完成 30 并发压测；30 台真实终端实测待执行 |
| T10 | P1 | 限制 Python 输出并终止超时进程树 | Backend / Security | 无 | [~] 代码与 POSIX 测试完成，Windows 实机待验收 |
| T11 | P1 | 增加教师可操作的诊断与恢复入口 | Electron / Renderer | T04 | [~] 代码与契约完成，故障注入实机待验收 |
| T12 | P1 | 编写 Scratch 教师交付资料 | Training / Docs / QA | T01、T08、T11 | [~] 文档完成，未参与开发教师试用待验收 |
| T13 | P0 | 完成最终实机验收与发布签字 | Release Owner / Training | T01-T12 | [ ] 待开始 |

### T00：pip 与高权限 API capability 收口

**状态**：已完成
**文件**：`backend/api/routes/python.py`、`backend/api/security.py`、`backend/tests/test_security_api.py`、`backend/tests/test_pip_api.py`

**已交付**

- [x] `/api/python/pip` 要求 `python:run` capability。
- [x] 匿名访问高权限接口返回 401。
- [x] 请求体不能覆盖服务端 Python 可执行文件路径。

**验收命令**

```bash
python3 -m pytest backend/tests/test_security_api.py backend/tests/test_pip_api.py -q
```

**通过标准**

- 25 项测试全部通过。
- 匿名 pip 请求返回 `401` 和 `{"success": false, "message": "unauthorized"}`。
- 带 capability 的 pip list 请求保持可用。

### T01：迁移共享 XEduHub 并完全移除 Blockly

**状态**：源码阶段已完成；跨平台安装包、真实课程和教师实机验收归 T02/T13 继续执行
**负责人角色**：Backend / Renderer / Course / QA
**关键文件**：`backend/api/routes/xeduhub.py`、`backend/services/xeduhub_support.py`、`backend/runtime/xeduhub_runtime.py`、`renderer/js/resources.js`、`renderer/js/main/workspace-context.js`、`renderer/index.html`、`scratch-editor/src/extensions/scratch3_xedu_ai/`、`package.json`

**执行步骤（严格按顺序）**

- [x] 清点正式课程和培训材料中的 Blockly 内容，锁定 Scratch 为默认且唯一受支持的图形化编程主线。
- [x] 从默认导航、快捷入口、教师说明和活动课程清单移除 Blockly 推荐入口与 `type: blockly` 活动实验项。
- [x] 将 `/api/resources/xeduhub/execute` 从旧路由迁移到独立的 `routes/xeduhub.py`，迁移对应测试，并验证 Scratch 两处调用保持可用。
- [x] 确认 `XEduCamera` 由 XEduHub 视频/摄像头运行链使用，迁移为 `backend/runtime/xeduhub_runtime.py` 并保留。
- [x] 删除 Blockly 专属前端目录、工作区入口、样式、Electron 桥接、Vite 配置和 npm 依赖；共享 XEduHub 服务改为中性命名。
- [x] 删除迁移后剩余的 Blockly playground、toolbox、别名路由、生成器和专属测试，保留并迁移 XEduHub 与 Scratch 运行链测试。
- [x] 旧课程命中 Blockly 实验类型时显示“该实验类型已不再支持”，不加载旧编辑器，并允许教师安全返回课程页面。
- [x] Scratch 主链冒烟和代码侧质量门禁通过；正式安装包的 chunk、资源和签名验收继续由 T02/T06/T07/T13 负责。

**验收命令**

```bash
npm run quality-gate
npm ls blockly --depth=0
rg -n "/api/resources/xeduhub/execute" backend/api/routes scratch-editor/src/extensions/scratch3_xedu_ai
rg -n '"type": "blockly"' backend/sasu/zhangjiang-image-recognition/course.json
```

其中 `npm ls blockly --depth=0` 应确认顶层生产依赖中不存在 Blockly；`rg` 用于人工核对共享路由仍有唯一后端实现且 Scratch 调用仍保留，不以“Blockly”字符串全仓归零代替边界验证。

**通过标准**

- 默认学生和教师主界面只展示 Scratch 图形化编程入口，新课程和培训文档不再引导教师创建 Blockly 内容。
- Blockly 编辑器、工作区入口、专属路由/服务/测试和顶层 npm 依赖已移除；保留项只能是历史资料、降级识别和经验证仍被 Scratch 使用的共享设施。
- Scratch 新建/导入 `.sb3`、XEdu AI 推理、保存和重开均通过；`/api/resources/xeduhub/execute` 迁移前后行为一致。
- 含 Blockly 实验的旧课程显示“该实验类型已不再支持”，不加载编辑器、不出现空白页或未处理异常，教师可以返回课程页面。
- `XEduCamera` 已迁移到 `xeduhub_runtime.py`，并由 Python/XEduHub 视频运行链测试覆盖。
- `npm run quality-gate` 退出码为 0；正式产物不包含 Blockly chunk、编辑器资源或 `blockly_builder_agent_service.py` 等专属残留。

### T02：建立 Scratch 构建、打包和真实项目门禁

**负责人角色**：Scratch / Release / QA
**依赖**：T01
**文件**：`build.sh`、`build.bat`、`package.json`、`scripts/run_quality_gate.py`、`electron/test/phase0-release-contract.test.mjs`、`scratch-editor/test/xedu-extension.test.js`

**执行步骤**

- [x] 增加发布契约测试，构建目录缺少 `index.html` 时测试失败。
- [x] 在 Win/mac 打包前运行 Scratch 依赖检查和 `npm run build:scratch`。
- [~] 已生成并检查本轮最新代码对应的 macOS arm64 unpacked 包，并复核已有 Windows x64 unpacked 包的 `resources/scratch-editor/build/index.html`；两者均不是签名 release 包。
- [ ] 使用包含 XEdu AI 扩展的真实 `.sb3` 项目完成打开、运行、保存和重开测试。
- [x] 本轮 macOS unpacked 产物已生成 `release-manifest.json` 并通过内容校验；Windows unpacked 产物也已有 manifest。正式 release commit/tag 仍需重新生成。

**验收命令**

```bash
npm run build:scratch
npm run test:scratch
node --test electron/test/phase0-release-contract.test.mjs
```

**通过标准**

- Scratch 构建和测试命令退出码为 0。
- Win/mac 最终包都包含 `resources/scratch-editor/build/index.html`。
- `/api/scratch-editor/index.html` 返回编辑器，不返回“尚未构建”。
- 真实 `.sb3` 项目保存后重开，角色、积木、素材和扩展配置保持一致。
- XEdu AI 扩展完成一次本地图片推理，界面显示结果或可理解的错误。

**当前验收记录（2026-07-17）**

- 旧 macOS arm64 unpacked 包曾使用内置 Python 启动 backend，`GET /api/health` 返回 200；该证据不适用于当前轻量版发布策略。
- 包内 `GET /api/scratch-editor/index.html` 返回 Scratch 编辑器 HTML；课堂课程包接口在包内运行时完成 30 路并发下载，失败数为 0。
- 尚未完成真实 `.sb3` 打开、保存、重开和 XEdu AI 图片推理的 GUI 实机记录。

### T03：关闭生产 DevTools

**负责人角色**：Electron / Security
**文件**：`electron/main/main.js`、`electron/test/phase0-release-contract.test.mjs`

**执行步骤**

- [x] 增加失败测试，断言打包模式菜单不含 DevTools 标签、快捷键和调用。
- [x] 只在 `!app.isPackaged` 条件下注册 DevTools 菜单。
- [x] 保留开发模式 `XEDU_OPEN_DEVTOOLS=1` 调试路径。
- [x] 检查 `openDevTools` 和 `toggleDevTools` 的全部调用点。

**验收命令**

```bash
node --test electron/test/preload-security.test.mjs electron/test/phase0-release-contract.test.mjs
rg -n "openDevTools|toggleDevTools|开发者工具" electron/main/main.js
```

**通过标准**

- 打包版“视图”菜单不显示“开发者工具”。
- `Ctrl+Shift+I`、`Alt+Cmd+I` 和菜单操作都不能打开 DevTools。
- 开发模式设置 `XEDU_OPEN_DEVTOOLS=1` 后仍能调试。
- 所有 DevTools 调用都位于明确的开发模式条件内。

### T04：升级 Electron 并设置最小窗口

**负责人角色**：Electron / QA
**依赖**：T03
**文件**：`package.json`、`package-lock.json`、`electron/main/main.js`、`electron/test/preload-security.test.mjs`、`electron/test/phase0-release-contract.test.mjs`

**执行步骤**

- [x] 把 Electron 升级到 `39.8.5` 或同一 major 的更高修复版，并更新锁文件。
- [x] 增加契约测试，断言主窗口含 `minWidth: 960`、`minHeight: 600`。
- [x] 在 BrowserWindow 配置中加入最小尺寸。
- [x] 重新验证 preload、sandbox、webSecurity、Jupyter 视图和窗口菜单。

**验收命令**

```bash
npm ls electron --depth=0
npm audit --json
node --test electron/test/preload-security.test.mjs electron/test/phase0-release-contract.test.mjs
npm run check:renderer-syntax
```

**通过标准**

- `npm ls electron` 显示 `39.8.5` 或同一 major 的更高修复版。
- `npm audit` 不再把 Electron 列为 direct high/critical。
- 主窗口无法缩小到 960×600 以下。
- 1024×768 投影环境中，Scratch 工作区、弹窗和主导航仍可操作。
- Electron 契约与安全测试全部通过。

### T05：清理打包结构并建立轻量版产物契约

**负责人角色**：Release / Electron
**依赖**：T02
**文件**：`package.json`、`build.sh`、`build.bat`、`electron/test/phase0-release-contract.test.mjs`

**执行步骤**

- [x] 增加打包配置测试，禁止 backend、config 同时进入 `files` 和 `extraResources`。
- [x] 从 asar files 中移除 backend、config 和不参与运行的 scripts。
- [x] 为 backend extraResources 排除 tests、`__pycache__` 和无用工具文件。
- [x] 把 mac target 设置为 `dmg` 和 `zip`。
- [x] 让 Win/mac 构建输出使用同一版本号和命名规则。
- [x] 从 Windows/macOS `extraResources` 移除 `python_env_win` 和 `python_env`。
- [x] 增加本机 Python 路径选择、Python 3.10+ 校验和用户配置持久化。
- [x] 让打包模式在未选择 Python 时显示可操作的选择入口，不弹“缺少内置 Python”。

**验收命令**

```bash
node --test electron/test/phase0-release-contract.test.mjs electron/test/package-layout-contract.test.mjs electron/test/python-runtime.test.mjs
node scripts/verify_release_artifact.mjs <unpacked-artifact>
```

**通过标准**

- `app.asar` 不含 `/backend`、`/config` 和无运行用途的 `/scripts`。
- 外置 `resources/backend` 存在且后端能够启动。
- `resources/python_env` 和 `resources/python_env_win` 均不存在。
- 未选择 Python 时应用仍能打开主界面，并可通过选择入口恢复后端。
- 选择有效 Python 后，后端检测、Jupyter 启动和 Python 包管理使用同一解释器。
- 最终包不包含 backend tests、`__pycache__` 和已确认无用的第三方测试数据。
- 团队记录清理前后的安装包与解压体积。

**当前验收记录（2026-07-17）**

- 源码级轻量版契约与本机 Python 选择流程已完成；未重新生成 DMG、zip 或 Windows 包。
- `dist-final-current/` 仍是旧工作区产物并含 `Resources/python_env`，不能作为本轮验收证据。
- 正式平台产物仍需从 release commit/tag 重新构建后再验收。

### T06：完成 Windows 签名与 macOS 公证

**负责人角色**：Release Owner
**依赖**：T05
**文件**：`package.json`、`.github/workflows/ci-guard.yml`，创建 `resources/entitlements.mac.plist`

**执行步骤**

- [ ] 准备 Windows 组织代码签名证书；需要首发信誉时使用 EV 证书（外部依赖）。
- [ ] 准备 Apple Developer ID Application 证书和 notarization 凭据（外部依赖）。
- [x] 已在发布配置中加入 macOS hardened runtime 和 entitlements；证书私钥仍不进入仓库。
- [ ] 对 Windows 安装包签名，对 macOS App 和 DMG 签名、公证并 staple。
- [ ] 保存签名验证输出，不保存密钥内容。

**验收命令**

```powershell
Get-AuthenticodeSignature ".\XEdu Client-2.0.0.exe" | Format-List
```

```bash
codesign --verify --deep --strict --verbose=2 "XEdu Client.app"
spctl --assess --type execute --verbose=4 "XEdu Client.app"
xcrun stapler validate "XEdu Client.dmg"
```

**通过标准**

- Windows `Status` 为 `Valid`，安装界面显示组织名称。
- macOS `codesign`、`spctl` 和 stapler 三条命令退出码均为 0。
- 干净机器通过浏览器下载后可启动，不要求教师关闭安全软件。
- CI 日志和 Git 历史不包含证书私钥、密码或完整 notarization 凭据。

**当前验收记录（2026-07-17）**

- electron-builder 已明确报告跳过 macOS 签名：本机没有有效 `Developer ID Application` identity。
- 本次 `codesign --verify --deep --strict` 与 `spctl --assess` 均失败；Windows 签名尚未执行。

### T07：建立最终安装包内容与版本门禁

**负责人角色**：Release / QA
**依赖**：T02-T06
**文件**：创建 `scripts/verify_release_artifact.mjs`，修改 `package.json`、`scripts/run_quality_gate.py`、`.github/workflows/ci-guard.yml`

**执行步骤**

- [x] 为产物校验脚本编写缺文件、错版本和重复 backend 的失败测试。
- [x] 校验 Scratch、backend、checkpoint 和应用版本，并拒绝包内 `python_env`。
- [x] 校验 `.app` 的 `Info.plist`、`app.asar/package.json` 和外置 `package.json` 的真实版本；`--version` 只用于比对，不再作为缺失版本的兜底。
- [x] 扫描 `app.asar` 内部的 backend/config/scripts/python_env 和 Blockly 专属残留，避免只检查外置 Resources。
- [x] 发布 workflow 在构建前清理旧产物，严格检查 DMG/zip/Windows 安装器命名，遍历 Windows `.exe/.dll` 签名，并归档签名、公证和依赖审计证据。
- [x] `verify_release_artifact.mjs --manifest` 已支持生成包含 Git commit、版本、平台、文件大小和 SHA-256 的 manifest；待真实发布流水线执行。
- [x] 已把产物校验测试接入质量门禁；真实产物参数可选，普通 Linux CI 不依赖平台包。

**验收命令**

```bash
node scripts/verify_release_artifact.mjs dist-final/win-unpacked
node scripts/verify_release_artifact.mjs "dist-final/mac-arm64/XEdu Client.app"
shasum -a 256 dist-final/*.{exe,dmg,zip}
```

**通过标准**

- 删除 Scratch、backend 或 checkpoint 任一必需文件后，校验脚本返回非零；发现 `python_env` 时也返回非零。
- 包内版本、文件名版本、Git tag 和 manifest 版本一致。
- 发布目录只包含当前版本产物及其 manifest、校验值和 blockmap。
- Win/mac 两个平台的校验命令均返回 0。

**当前验收记录（2026-07-19）**

- `node --test electron/test/phase0-release-contract.test.mjs electron/test/release-artifact-verifier.test.mjs electron/test/package-layout-contract.test.mjs electron/test/python-runtime.test.mjs` 通过，合计 `29 passed`。
- `verify_release_artifact.mjs` 对现有 macOS arm64 与 Windows x64 unpacked 包均读取到版本 `2.0.0` 并通过外置资源和 app.asar 内容校验；这些包仍来自历史/未冻结工作区，不能替代 release commit/tag 产物验收。
- 当前无 exact release tag，无法生成 `requireIdentity=true` 的正式 manifest；身份匹配失败测试已覆盖调用方伪造 `--tag/--commit` 的场景。

### T08：增加课堂手动地址连接

**负责人角色**：Renderer / Backend
**依赖**：T01
**文件**：`renderer/js/resources/classroom-connect.js`、`renderer/js/resources.js`、`backend/api/routes/classroom.py`、`backend/services/classroom_service.py`、`backend/tests/test_classroom_api.py`

**执行步骤**

- [x] 增加测试，覆盖自动发现为空、手动地址成功和格式错误。
- [x] 自动发现失败时显示教师地址输入框。
- [x] 复用现有 `fetch_index(base_url)`，不新增第二套课堂协议。
- [x] 记住成功地址，并保留重新加入课堂的重试入口。
- [x] 教师交付资料说明可复制的 IP、端口和防火墙提示。

**验收命令**

```bash
python3 -m pytest backend/tests/test_classroom_api.py -q
npm run test:student-shell
```

**通过标准**

- UDP 被阻断时，学生输入 `http://教师IP:5123` 可以进入课堂。
- 非 HTTP(S)、无效端口和不可达地址给出中文提示，不清空用户已输入地址。
- 自动发现仍是默认路径，不要求同网段用户手动填写。
- 跨 VLAN 实机测试至少完成 1 次成功连接。

### T09：缓存课堂课程包并完成 30 客户端压测

**负责人角色**：Backend / Performance
**文件**：`backend/services/classroom_service.py`、`backend/api/routes/classroom.py`、`backend/tests/test_classroom_api.py`，创建 `scripts/classroom_load_test.py`

**执行步骤**

- [x] 增加并发测试，证明同一课程版本只生成一次 ZIP。
- [x] 以课程 ID、版本和内容摘要作为缓存键。
- [x] 课程内容变化或课堂结束时清理缓存。
- [x] 客户端断开时保留共享缓存，不删除其他请求正在读取的文件。
- [x] 使用标准库并发客户端执行 30 路下载，不增加压测依赖；已在源码后端和当前 macOS packaged backend 各执行一次。

**验收命令**

```bash
python3 -m pytest backend/tests/test_classroom_api.py -q
python3 scripts/classroom_load_test.py --clients 30 --course zhangjiang-image-recognition
```

**通过标准**

- 30 个客户端请求同一版本时只执行 1 次 ZIP 构建。
- 30 个客户端都得到可解压、校验一致的课程包。
- 压测报告记录课程大小、总耗时、P95、CPU 峰值、内存峰值和失败数。
- 失败数为 0，教师机在压测期间仍能操作课堂控制界面。

**当前验收记录（2026-07-17）**

- 使用真实启动的本地 Flask 后端 `127.0.0.1:5124`、课程 `zhangjiang-image-recognition` 执行 30 路并发下载。
- 结果：`30/30` 完成，成功 `30`，失败 `0`，总耗时 `0.318s`，吞吐 `94.38 req/s`，P95 `316.30ms`。
- 两次都是同一台机器上的并发服务压测，尚未替代真实 30 台终端、无线网络和教师操作并行验收；CPU/内存峰值尚未采集。

### T10：限制 Python 输出并终止超时进程树

**负责人角色**：Backend / Security
**文件**：`backend/api/routes/python.py`、`backend/tests/test_runtime_safety.py`、`backend/tests/test_security_api.py`

**执行步骤**

- [x] 增加无限输出、超时子进程和超大 stderr 的失败测试。
- [x] 把普通 Python 执行改为有界流式读取，stdout 与 stderr 总量上限设为 1 MiB。
- [x] 超过上限时截断输出并返回明确标记。
- [x] 超时后终止当前进程及其子进程，分别处理 Windows 和 macOS；输出上限边界和 UTF-8 截断已有回归测试，Windows 实机待验收。
- [x] 记录资源限制触发事件，不记录课程输入或敏感配置。

**验收命令**

```bash
python3 -m pytest backend/tests/test_runtime_safety.py backend/tests/test_security_api.py -q
```

**通过标准**

- 无限打印任务的返回内容不超过 1 MiB 加固定元数据。
- 超时测试结束后没有残留 Python 子进程、摄像头占用或监听端口。
- 正常 Scratch XEdu AI 推理结果不被错误截断。
- Windows 和 macOS 各完成一次实机超时测试。

### T11：增加教师可操作的诊断与恢复入口

**负责人角色**：Electron / Renderer
**依赖**：T04
**文件**：`electron/main/main.js`、`electron/preload/index.js`、`renderer/js/main.js`、`renderer/js/api.js`、`renderer/index.html`、`electron/test/preload-security.test.mjs`

**执行步骤**

- [x] 增加 preload 契约测试，限定“打开日志目录”和“复制诊断摘要”能力。
- [x] 后端启动失败时提供重试、打开日志目录和复制诊断摘要。
- [x] 诊断摘要包含状态、尝试次数和日志路径，不包含 token、password、api_key、课堂口令和请求正文。
- [x] 注册启动状态广播、全局 `unhandledrejection` 兜底并让界面恢复操作状态；真实故障注入待验收。
- [x] 损坏配置时提供恢复默认值入口；后端会先保留备份，教师可从启动支持卡片执行恢复。

**验收命令**

```bash
node --test electron/test/preload-security.test.mjs renderer/js/api.test.mjs
npm run test:student-shell
```

**通过标准**

- 模拟缺失 Python、端口占用和损坏配置时，教师能从界面执行下一步操作。
- “打开日志目录”只打开应用日志目录，Renderer 不能传入任意路径。
- 诊断摘要通过敏感词测试，不包含 token、password、api_key 和课堂口令值。
- 未处理 Promise 异常不会让页面永久停在加载状态。

### T12：编写 Scratch 教师交付资料

**负责人角色**：Training / Docs / QA
**依赖**：T01、T08、T11
**文件**：创建 `docs/teacher/INSTALL.md`、`docs/teacher/QUICKSTART.md`、`docs/teacher/CLASSROOM_NETWORK.md`、`docs/teacher/TROUBLESHOOTING.md`，修改 `README.md`

**执行步骤**

- [x] 编写 Windows 和 macOS 安装说明；当前先提供无截图文字版，正式包冻结后补最终截图。
- [x] 编写“10 分钟完成第一个 Scratch 课程”的快速开始。
- [x] 写明自动发现、手动地址、防火墙和跨 VLAN 操作。
- [x] 写明离线能力、课程更新、应用升级、数据备份和卸载行为。
- [x] 写明 Python 3.10+ 前置条件、路径选择、依赖安装和检测失败处理。
- [ ] 邀请未参与开发的教师按文档独立完成一次安装和开课。

**验收标准**

- 教师手册不出现 Blockly 教学步骤或新课程入口。
- 系统要求准确列出 Windows x64、macOS arm64、内存、磁盘和网络条件。
- 试用教师不查看开发文档、不联系开发者，能够完成安装、导入课程和打开 Scratch 项目。
- 文档记录版本号和发布日期，并与安装包 manifest 一致。

### T13：完成最终实机验收与发布签字

**负责人角色**：Release Owner / Training
**依赖**：T01-T12
**交付物**：最终安装包、manifest、测试记录、教师手册、已知问题、发布决策

**实机矩阵**

| 场景 | 最低覆盖 |
|---|---|
| Windows 安装 | Windows 10 x64、Windows 11 x64，各至少 2 台干净机器 |
| macOS 安装 | 两个受支持的 macOS 版本，各至少 2 台 Apple Silicon 机器 |
| 首次启动 | 无旧配置、无旧课程、普通用户权限 |
| Python 首次绑定 | 未选择解释器时可打开主界面；选择有效 Python 后后端、Jupyter 和检测均通过 |
| 升级安装 | 保留旧配置和课程，从上一发布版升级 |
| 离线课程 | 断开互联网后运行 Jupyter、Scratch 和已导入课程 |
| Scratch 主链 | 新建/导入 `.sb3`、运行 XEdu AI 扩展、保存、重开 |
| 旧 Blockly 课程降级 | 显式打开一份含 Blockly 实验的旧课程，显示“该实验类型已不再支持”，不加载编辑器、无空白页或崩溃，并可返回课程页面 |
| 课堂分发 | 1 台教师机加 30 个并发客户端 |
| 网络异常 | UDP 被阻断、跨 VLAN、课程服务器不可达 |
| 投影环境 | 1024×768 和 1080p 镜像模式 |
| 故障恢复 | 损坏配置、占用端口、缺失模型、后端启动失败 |

**最终通过标准**

- [x] T01 完成后已重新执行 `npm run quality-gate` 并完整退出 `0`：后端 `136 passed`、Electron/发布契约、Renderer 契约、Scratch 构建与 `22 passed`、Vite 构建和 bundle guard 全部通过；发布包和实机门禁仍未关闭。
- [ ] T01-T12 的任务验收记录齐全，没有未关闭 P0。
- [ ] 干净机器安装与首开成功率为 100%，不要求教师绕过未知发行者警告。
- [ ] Jupyter 和 Scratch 各完成一个真实课程实验。
- [ ] Scratch 是默认且唯一受支持的图形化编程主入口。
- [x] Blockly 编辑器、入口、依赖和专属代码已从源码移除；旧课程降级提示通过，Scratch 使用的 XEduHub 共享能力保持可用。
- [ ] 30 个课堂客户端完成接入，失败数为 0，教师机保持可操作。
- [ ] 自动发现失败时，学生可通过手动地址进入课堂。
- [ ] 断开互联网后，本地课程继续工作；联网功能显示明确提示。
- [ ] 配置损坏和端口冲突不会造成课程数据丢失。
- [ ] 安装包、版本号、校验值、测试记录和已知问题属于同一 release commit/tag。
- [ ] Release Owner、培训负责人和 QA 在发布记录中签字。

### 6.3 紧急培训的受控方案

如果培训日期早于 T01-T13 完成时间，只能按试点方式交付：

1. 培训前一天统一安装并逐台首开。
2. 只使用已经实测通过的 Scratch 和 Jupyter 课程。
3. 把课程包复制到本地，减少现场下载依赖。
4. 确认所有设备位于同一可互访网段。
5. 每 10 名教师至少安排 1 名助教。
6. 准备 U 盘离线包、课程备份和备用教师机。
7. 标注“培训试用版”，不要把该包作为教师回校后的正式长期版本。

---

## 七、分阶段放量

| 阶段 | 范围 | 进入条件 | 退出条件 |
|---|---|---|---|
| 0. 内部验收 | 开发、教研、培训团队，10 台以内 | T01-T07 完成，重新构建的包可安装 | 发现安装、Scratch 或数据损坏问题 |
| 1. 受控培训 | 1 场培训，课前预装 | T01-T11 完成，同网段 10 台课堂测试通过 | 课堂接入、启动或课程运行出现 P0 |
| 2. 回校试点 | 3 所学校、5 名教师 | T12 完成，T13 实机矩阵通过 | 教师需要开发人员介入才能安装或开课 |
| 3. 扩大分发 | 多校教师 | T13 签字，连续 3 场培训无 P0 | 出现可重复的安装或课堂阻断 |

团队应分别记录“安装成功率”“首次开课耗时”“需要人工支持的次数”和“课堂接入失败数”。这些数据比下载量更能反映教师版是否可发布。

---

## 八、中长期工程债务

以下为仍需治理的工程项。其中 Blockly 移除与 XEduHub 边界已经纳入 T01，是进入受控试点前必须关闭的 P0；其余项目不阻止一次受控试点，但会增加后续维护成本。

| 模块 | 问题 | 建议 |
|---|---|---|
| Renderer | `resources.js`、`main.css` 和 `index.html` 仍承担大量职责 | 按课堂、课程、工作区和设置边界继续拆分，并锁定行为测试 |
| Electron | `main.js` 同时管理窗口、IPC、后端和 Jupyter 生命周期 | 提取菜单、API 代理、进程管理和窗口策略模块 |
| Backend | Jupyter 和 Gitea 服务体积较大 | 先补关键行为测试，再按单向依赖拆分 |
| Blockly 移除与 XEduHub 边界 | 源码已完成迁移与删除，最终包和实机仍需验收 | T01 已关闭源码 P0；后续只在 T02/T07/T13 验证真实 `.sb3`、旧课程提示和跨平台产物，不恢复 Blockly 编辑器 |
| 发布工程 | CI 检查源码与构建，但缺少安装包内容和签名检查 | 建立可复现构建、SBOM、签名和产物验收流程 |
| 运维支持 | 没有应用自动更新与统一诊断包 | 先定义人工升级和日志导出，再评估自动更新 |

---

## 附录 A：安装包体积

### A.1 当前体积

| 平台 | 安装包 | 解压后 |
|---|---:|---:|
| Windows x64 | 待轻量版重建测量 | 待轻量版重建测量 |
| macOS arm64 | 待轻量版重建测量 | 待轻量版重建测量 |

### A.2 主要组件

| 组件 | macOS | Windows | 说明 |
|---|---:|---:|---|
| Python 运行时 | 不随当前源码正式包内置 | 不随当前源码正式包内置 | 教师选择本机 Python；旧 `dist-final-current` 仍含 `python_env`，已被产物门禁拒绝 |
| checkpoint 模型 | 约 1.6 GB | 约 1.6 GB | 18 个 ONNX 文件 |
| Scratch Editor | 约 105 MB | 约 105 MB | 当前源码可构建，旧产物未包含 |
| Electron 与前端 | 约 200 MB | 约 200 MB | 需结合最终包重新测量 |
| backend 外置目录 | 约 62 MB | 约 62 MB | 当前源码目标为仅保留外置目录，最终包仍需复验 |

### A.3 可执行的瘦身项

| 措施 | 预计收益 | 优先级 |
|---|---:|---|
| 复验 backend 外置且清理测试数据 | 约 62 MB及测试数据 | P1 |
| 排除 tests、`__pycache__` 和第三方测试数据 | 数十至 100 MB | P1 |
| 清理重复的 Python dist-info 和无用工具 | 需重新测量 | P2 |
| 模型按课程或能力分包 | 可减少首次下载体积 | P2，需要离线策略配合 |

---

## 附录 B：checkpoint 模型清单

| 模型文件 | 大小 | 用途 |
|---|---:|---|
| `embedding_image.onnx` | 335 MB | 图像嵌入与特征提取 |
| `embedding_text.onnx` | 242 MB | 文本嵌入 |
| `det_coco_l.onnx` | 217 MB | COCO 目标检测 |
| `drive_perception.onnx` | 149 MB | 驾驶场景感知 |
| `gen_color.onnx` | 130 MB | 图像着色 |
| `embedding_audio.onnx` | 121 MB | 音频嵌入 |
| `seg_sam_encoder.onnx` | 117 MB | SAM 分割编码器 |
| `depth_anything.onnx` | 94 MB | 深度估计 |
| `body17.onnx` | 52 MB | 人体 17 关键点 |
| `cls_imagenet.onnx` | 39 MB | ImageNet 分类 |
| `pose_wholebody133.onnx` | 34 MB | 全身 133 关键点 |
| `face106.onnx` | 34 MB | 面部 106 关键点 |
| `hand21.onnx` | 26 MB | 手部 21 关键点 |
| `cocodetect.onnx` | 21 MB | 轻量 COCO 检测 |
| `seg_sam_decoder.onnx` | 16 MB | SAM 分割解码器 |
| `gen_style_mosaic.onnx` | 6.4 MB | 风格迁移 |
| `bodydetect.onnx` | 3.8 MB | 人体检测 |
| `handdetect.onnx` | 3.8 MB | 手部检测 |

缺失某个模型会让对应推理能力不可用。发布脚本应生成模型清单和校验值，实机测试按培训课程验证所需模型，不要求每场培训运行全部 18 个模型。

---

## 附录 C：本次复核证据

### C.1 已执行检查

| 检查 | 结果 |
|---|---|
| `python3 -m pytest backend/tests -q` | 通过：backend `136 passed`；覆盖 XEduHub、Scratch 相关路由、运行时安全、Jupyter、Gitea、课堂接口和教师 Python 探针 |
| `npm run quality-gate` 本次执行 | 通过：后端 `136 passed`、Electron/发布契约、Renderer 契约、Scratch `22 passed`、Vite 构建和 bundle guard 全部通过 |
| `npm run build:scratch`、`npm run check:scratch-build`、Scratch 单测 | 通过：Scratch standalone 构建、入口检查和 `22 passed`；正式安装包仍需从 release commit/tag 重建 |
| `npm audit --audit-level=high --json` | 通过：root 项目 `0` 项漏洞；Vite 已升级到 `8.1.5`，lodash 通过 npm override 收口 |
| `npm audit --prefix scratch-editor --package-lock-only --json` | 原始命令为 `21` 项（`5 critical / 6 high / 10 moderate / 0 low`）；`check_scratch_dependency_gate.mjs` 已按 owner、到期日、缓解措施和 `scratch-editor/build` 入口生成例外与 reachability report，安全负责人批准仍未完成 |
| Python requirements 审计 | 固定直接依赖 24 个、`requirements.txt` 和 `requirements_full.txt` 审计结果为 `0` 个已知漏洞；教师设置页已加入所选解释器探针和精确 `xedu-python==2.0.0` 元数据修复，跨平台实际 `pip check` 与推理验收仍待完成 |
| 正式 release workflow 与模型预检 | 已加入：只接受明确版本 tag、Ubuntu 质量门禁、双平台统一 commit、签名构建、产物校验；干净 checkout 缺少被 Git 忽略的 checkpoint bundle 时快速失败 |
| 正式 release 配置契约 | 通过：`electron-builder.release.cjs` 按目标平台 fail-closed，发布/产物契约测试通过；签名凭据和真实产物仍未执行 |
| 发布产物校验增强 | 通过：版本读取、app.asar 残留扫描、Git tag/commit 独立校验、旧产物清理和跨平台签名证据归档规则已加入代码与 workflow |
| 资源页状态迁移契约 | 通过：课堂状态不再出现错误嵌套，Scratch/工作区调用保持位置参数；Renderer 相关契约测试通过 |
| `git diff --check` | 通过：当前工作区无 whitespace error |
| 当前 macOS 最新 unpacked 包内容 | `dist-final-20260718-mac/mac-arm64`：找到 Scratch、backend、checkpoint；`verify_release_artifact.mjs` 通过，包内 backend `/api/health` 返回 200 |
| 当前 macOS 最新包课堂课程包压测 | 先同步课程并开课后，30/30 成功，失败数 `0`，总耗时 `0.315s`，吞吐 `95.36 req/s`，P95 `312.27ms`；CPU 峰值 `247.70%`，RSS 峰值 `67.45 MiB`；仍属于单机 packaged backend 压测，不是 30 台真实终端 |
| 当前 macOS 最新包产物校验器 | 通过：版本 `2.0.0`、Scratch、backend、checkpoint 和轻量 Python 约束均满足；该包仍未签名 |
| 当前 macOS App 严格签名校验 | 失败，本机没有 Developer ID 身份，`codesign` 与 `spctl` 均未通过 |
| Windows/macOS 最终归档 | 未执行；当前没有可确认的本次 release DMG/zip 或 Windows 安装包 |

### C.2 尚未完成

- 没有从 `v2.0.0-rc.3` 重新生成并验收完整 Windows 和 macOS 签名安装包。
- 没有在干净 Windows 机器验证 SmartScreen、签名和安装。
- 没有完成 macOS Developer ID 签名、公证与 Gatekeeper 验证。
- 没有完成真实 `.sb3` 打开、运行、保存、重开和 XEdu AI 图片推理的 GUI 记录。
- 没有执行真实 30 机课堂并发测试。
- 没有完成跨 VLAN、Windows 超时、配置损坏和端口占用的实机故障注入。
- 当前工作区未执行官方 release workflow，因此还没有候选版本的依赖审计原始 JSON、签名输出和 notarization evidence artifact；workflow 已改为保存 Scratch 例外/reachability、Python 和平台签名证据后统一判门。
- `xedu-python==2.0.0` 的跨平台真实兼容性仍未完成：未修补元数据会使 `pip check` 报告 `onnxruntime<1.16.0`、`Pillow<=9.5.0` 冲突；代码侧已有显式修复和复探针，但不能用本地单测替代 Windows/macOS 实际环境验收。
- 没有完成教师独立安装和回校授课试点。

在这些项目完成前，正式分发结论保持 **No-Go**。

---

## 附录 D：关键证据索引

| 结论 | 代码或产物位置 |
|---|---|
| Scratch 构建步骤已加入 | `build.sh:58-80`、`package.json:11-12` |
| Scratch extraResources 配置 | `package.json:64-70` |
| 旧产物有效配置缺少 Scratch | `dist-final/builder-effective-config.yaml:15` 附近 |
| backend 外置且避免重复打包 | `package.json:51-90`、`electron/test/package-layout-contract.test.mjs` |
| Windows 签名关闭 | `package.json:107-124` |
| macOS 正式 target 为 DMG + zip | `package.json:132-155` |
| 主窗口最小尺寸 | `electron/main/main.js:450-465` |
| 生产菜单仅开发模式开放 DevTools | `electron/main/main.js:1651-1670`、`electron/test/phase0-release-contract.test.mjs` |
| pip capability 已添加 | `backend/api/routes/python.py:227-229` |
| Python 输出有界读取与超时进程树处理 | `backend/api/routes/python.py`、`backend/tests/test_runtime_safety.py` |
| Flask 使用 threaded 开发服务器 | `backend/backend_main.py:114` |
| UDP 课堂广播 | `backend/services/classroom_service.py:341-353` |
| 课程包并发缓存与独立 lease | `backend/services/classroom_service.py`、`scripts/classroom_load_test.py` |
| 手动 base_url 后端能力 | `backend/services/classroom_service.py:603-620` |
| Scratch 加载占位状态 | `renderer/js/main/workspace-context.js:758-774` |
| 向导运行时隐藏“上一步” | `renderer/js/project-wizard.js:223-237` |
| 当前 Electron 锁定版本 | `package.json`、`package-lock.json`（`39.8.10`） |
| 现有系统要求表述 | `docs/overview/quickstart.md:113-117` |
| pip 与安全回归覆盖 | `backend/tests/test_security_api.py:33-96` |
| 发布契约测试 | `electron/test/phase0-release-contract.test.mjs` |
