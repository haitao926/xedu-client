# XEdu Client 教师版发布关闭实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前已通过源码质量门禁的 XEdu Client 2.0.0，推进为可供教师独立安装、开课和组织 30 人课堂的正式版本，并把不阻断发布的结构治理排到发布之后。

**Architecture:** XEdu Client 是 `Electron + Vite Renderer + Flask Backend` 的本地桌面应用，资源域连接 Scratch、Jupyter、课堂分发、Gitea 课程同步和教师 AI 辅助。Scratch 是唯一维护的图形化编程主线；XEduHub 是 Scratch 与后端共享设施；Blockly 编辑器、运行时和专属入口已经移除，旧文件只保留“不再支持”的识别与提示。

**Tech Stack:** Electron 39、Vite 8、原生 JavaScript、Node.js test runner、Python 3.10+、Flask、pytest、Jupyter、electron-builder 26、Scratch Editor。

## Global Constraints

- 正式版本固定为 `2.0.0`，首个候选标识为 `v2.0.0-rc.1`。
- 正式 Windows 和 macOS 产物必须来自同一个 release commit/tag，不接受脏工作区产物或历史 `dist-*` 目录替代。
- 正式轻量版不得包含 `python_env` 或 `python_env_win`；教师首次使用时选择本机 Python 3.10+。
- Scratch 是唯一受支持的图形化编程入口，不恢复 Blockly 编辑器、运行时、依赖或课程创建入口。
- `/api/resources/xeduhub/execute`、`xeduhub_support.py` 和 `xeduhub_runtime.py` 属于 Scratch 主链共享设施，不按 Blockly 遗留删除。
- P0/P1 发布关闭期间不继续大规模拆分 `resources.js`、`jupyter_service.py` 或 `gitea_service.py`；仅修复实机验收暴露的发布阻断缺陷。
- 不把源码单测、unpacked 内容校验或单机 30 路压测等同于签名安装包、真实 GUI、30 台物理终端和教师试用。
- 不在仓库、日志、manifest 或截图中保存证书私钥、密码、API key、课堂口令或完整 notarization 凭据。
- 每个任务使用 Lore Commit Protocol 提交，提交正文必须记录 `Constraint:`、`Confidence:`、`Scope-risk:`、`Tested:` 和 `Not-tested:`。

---

## 当前基线

### 已完成，不再重复实施

- Blockly 专属源码、入口、依赖和构建链已移除；旧 Blockly 课程显示不支持提示。
- 共享 XEduHub 路由和运行时已迁移为中性命名，并由 Scratch 调用。
- `npm run quality-gate` 已退出 `0`：Backend `136 passed`、Scratch `22 passed`、Electron/Renderer/发布契约、Vite build 和 bundle guard 全部通过。
- Scratch 构建入口、轻量版不内置 Python、backend 不重复进入 asar、产物内容校验器和 release manifest 已有代码级保护。
- `.github/workflows/release.yml` 已加入：明确版本 tag、Ubuntu 统一质量门禁、统一 source commit、Windows/macOS 签名构建、模型资产预检、Authenticode/codesign/Gatekeeper 校验和产物 manifest。
- `verify_release_artifact.mjs` 的 manifest 已升级为相对路径、精确 tag/commit、内容哈希和交付文件哈希；校验器拒绝旧 Blockly 专属产物路径，旧产物不会因为目录存在而被视为正式包。
- T07 发布校验已补强：版本必须来自外置 package.json、app.asar/package.json 或 macOS Info.plist；app.asar 内部路径会参与残留检查；`requireIdentity` 会独立读取当前 Git tag/commit；官方 workflow 会清理旧输出、检查产物命名并归档依赖/签名证据。
- 课堂课程包缓存和单机 packaged backend 30 路压测已完成：`30/30`、失败 `0`、P95 `312.27 ms`、CPU 峰值 `247.70%`、RSS 峰值 `67.45 MiB`。
- `resourcesState`、Gitea 客户端/课程扫描和 Jupyter 环境选择已完成第一轮拆分。

### 尚未关闭的发布门禁

- RC 实现已冻结为 commit `89cdbd95`，identity 文档提交后创建 `v2.0.0-rc.1`；正式签名产物仍未生成。
- 没有完成真实 `.sb3` 的 packaged GUI 打开、运行、保存、退出和重开证据。
- Windows 正式安装包尚未签名；macOS 尚未完成 Developer ID 签名、公证和 staple。
- 没有完成 30 台物理终端课堂矩阵、Windows 进程树/故障注入和独立教师试用。
- Scratch lock 当前有 `21` 项审计发现（`5 critical / 6 high / 10 moderate / 0 low`）；两套 Python requirements 已固定并通过完整审计，但 `xedu-python` 实际环境兼容性仍需实机验证，Scratch 依赖门禁仍未关闭。
- 干净 checkout 不包含被 Git 忽略的约 `2.4 GB` checkpoint bundle；release workflow 已接入 `XEDU_CHECKPOINT_BUNDLE_URL` 与 `XEDU_CHECKPOINT_BUNDLE_SHA256` 的下载、路径安全和哈希校验，但 protected release environment 尚未配置这两个 secret。

### 本轮执行状态（2026-07-19）

- N00 已完成 RC 冻结：`electron-builder.release.cjs`、`electron:build:release`、目标平台凭据 fail-closed 契约、跨平台质量门禁启动器和官方 release workflow 已实现；实现 commit `89cdbd95` 已创建，identity 文档提交后创建 `v2.0.0-rc.1`。
- N07 当前结论：root npm lock 为 `0` 项漏洞，固定 Python 直接依赖子集（24 个）和完整 `requirements.txt`/`requirements_full.txt` resolver + `pip-audit` 均为 `0`；Scratch lock 为 `21` 项，`xedu-python` 兼容性仍未关闭，因此仍为 No-Go。
- N01 自动化部分完成：Scratch 构建、入口检查和 `22 passed` 已通过；真实 packaged `.sb3` GUI 仍未验收。
- N04 代码侧完成：产物 verifier manifest 支持 source tag、相对路径、真实版本读取、app.asar 残留检查、unpacked 文件哈希和 installer/DMG/zip 哈希；真实签名产物矩阵仍未关闭。
- N02/N03/N05/N06/N08/N09 未关闭：分别需要签名凭据、跨平台实机、真实课堂网络、Windows 故障注入和非开发教师。
- 本轮未把任何旧 `dist-*` 产物标记为正式交付包；RC tag 只用于后续从统一源提交生成正式验证产物。

## 执行顺序

```text
N00 关闭正式发布配置并冻结 release baseline
  -> N07 依赖安全结论
  -> N01 真实 Scratch GUI 候选门禁
  -> N02 Windows 签名 ─┐
  -> N03 macOS 公证  ──┼-> N04 最终产物一致性门禁
                       └-> N05/N06 实机课堂与故障矩阵
N04 + N05 + N06 + N07 -> N08 独立教师试用 -> N09 发布签字
N09 之后 -> N10/N11/N12 发布后结构治理
```

---

### Task N00: 冻结可复现的 Release Baseline

**Priority:** P0
**Owner:** Release Owner
**Dependencies:** 无

**Files:**
- Create: `docs/release/2.0.0-rc.1/BASELINE.md`
- Create: `docs/release/2.0.0-rc.1/KNOWN_ISSUES.md`
- Create: `electron-builder.release.cjs`
- Modify: `package.json`
- Modify: `electron/test/phase0-release-contract.test.mjs`
- Modify: `docs/PRE_RELEASE_AUDIT_2026-07-16.md`
- Verify: `package-lock.json`

**Interfaces:**
- Consumes: 当前工作区、`npm run quality-gate`、版本 `2.0.0`。
- Produces: 强制签名的正式 release 配置、唯一 release commit、tag `v2.0.0-rc.1`、后续所有证据引用的 commit SHA。

- [x] **Step 1: 先增加正式发布配置的失败契约。**

契约必须断言：正式 release 脚本使用独立 `electron-builder.release.cjs`；Windows `forceCodeSigning` 和 `signAndEditExecutable` 为 `true`；macOS 保留 hardened runtime、entitlements、DMG/zip target 和 notarization 配置；缺少签名凭据时正式 release 命令失败而不是静默输出未签名包。

Run:

```bash
node --test electron/test/phase0-release-contract.test.mjs
```

Expected before implementation: FAIL，指出正式 release 配置或脚本尚不存在。

- [x] **Step 2: 增加独立正式发布配置和命令。**

`electron-builder.release.cjs` 复用 `package.json` 的通用 files/extraResources/targets，只覆盖签名、公证和 release 输出目录。`package.json` 增加 `electron:build:release`，继续保留不需要证书的开发态 `electron:pack`；证书与密码只从环境变量读取。

- [x] **Step 3: 对当前改动按功能域完成评审，排除 `dist-*`、日志、缓存和本地密钥。**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Expected: 无空白错误；待提交集合只包含已评审的源码、测试和文档，不包含本地发布产物或凭据。

- [x] **Step 4: 从当前候选工作区运行完整门禁。**

Run:

```bash
npm ci
npm ci --prefix scratch-editor
python3 -m pip install -r backend/requirements_ci.txt
npm run quality-gate
```

Expected: 最后一条命令退出 `0`，各阶段无跳过项。

- [x] **Step 5: 写入 baseline 与已知问题证据。**

`BASELINE.md` 必须记录：版本、commit SHA、Node/Python 版本、质量门禁时间、产物目标、Scratch-only 决策和外部凭据状态。`KNOWN_ISSUES.md` 必须把未完成签名、公证、实机和教师试用标为发布门禁，不写成普通提示。

- [x] **Step 6: 创建 release commit 和候选 tag。**

Run:

```bash
git commit -m "Establish a reproducible teacher release candidate" -m "Constraint: Windows and macOS artifacts must come from one reviewed source commit
Confidence: high
Scope-risk: broad
Directive: Do not distribute artifacts that do not resolve to this candidate tag
Tested: npm run quality-gate
Not-tested: Platform signing and teacher-device acceptance remain in N01-N08"
git tag -a v2.0.0-rc.1 -m "Freeze the teacher release candidate for reproducible validation"
git status --short
git rev-parse v2.0.0-rc.1^{commit}
```

实际：实现 commit `89cdbd95` 已按 Lore 协议提交；identity 文档提交后创建 `v2.0.0-rc.1`，tag 指向同一发布候选源线。未跟踪的本地 `dist-*` 和 `.claude` 配置不属于发布提交。

**Acceptance Criteria:**

- `package.json` 与安装包目标版本均为 `2.0.0`。
- `electron:build:release` 缺少签名凭据时失败；开发态 `electron:pack` 仍可用于无证书的内容排查。
- 后续 Win/mac 构建只接受 `v2.0.0-rc.1` 对应 commit；任一代码修复必须提升为新的 `rc` tag 并重跑相关门禁。
- baseline 中所有字段都有实际值和负责人，不保留占位状态。

**Commit guidance:** Intent line 使用“Freeze a reproducible teacher release baseline”；`Scope-risk: broad`；`Tested:` 写完整 `quality-gate` 结果。

---

### Task N01: 完成真实 `.sb3` Packaged GUI 门禁

**Priority:** P0
**Owner:** Scratch QA + Training QA
**Dependencies:** N00、N07

**Files:**
- Use fixture: `backend/sasu/zhangjiang-image-recognition/lesson2/exp1/scratch/image_classification_test.sb3`
- Use fixture: `backend/sasu/zhangjiang-image-recognition/lesson1/exp1/scratch/pixel_image_classification_test.sb3`
- Verify: `renderer/js/resources.js`
- Verify: `scratch-editor/src/extensions/scratch3_xedu_ai/index.js`
- Verify: `backend/api/routes/xeduhub.py`
- Create: `docs/release/2.0.0-rc.1/SCRATCH_GUI_ACCEPTANCE.md`

**Interfaces:**
- Consumes: N00 的候选 commit、packaged app、两个仓库内真实 `.sb3` fixture。
- Produces: 可被 N04 和 N09 引用的 Scratch 打开/运行/保存/重开证据。

- [x] **Step 1: 先运行自动化前置门禁。**

Run:

```bash
npm run build:scratch
npm run check:scratch-build
npm run test:scratch
node --test electron/test/scratch-release-contract.test.mjs
```

Expected: Scratch `22 passed`，构建入口与发布契约全部通过。

- [ ] **Step 2: 在 packaged app 中验证打开和运行。**

对两个 fixture 分别完成：从课程资源页打开；确认角色、舞台、积木和 XEdu AI 扩展可见；运行绿旗；执行至少一次 XEduHub 图片推理。无模型或网络条件时，必须显示教师可理解的错误，不允许白屏、无限加载或未处理异常。

- [ ] **Step 3: 验证编辑、保存和重开。**

每个项目增加一个可识别变量或积木，保存到原课程副本，退出 Scratch、退出 XEdu Client、重新启动并重开。记录修改前后项目名称、角色数、素材数、扩展列表和可识别修改。

- [ ] **Step 4: 记录可审计证据。**

`SCRATCH_GUI_ACCEPTANCE.md` 必须记录平台、OS 版本、候选 commit、包 SHA-256、fixture 路径、每一步结果、失败截图/日志位置和验收人。

**Acceptance Criteria:**

- 两个平台最终候选包均完成至少一个真实 `.sb3` 的打开、运行、保存、完全退出和重开。
- 保存后角色、积木、素材、扩展配置和新增修改保持一致。
- XEdu AI 至少成功完成一次真实推理；若环境缺失，错误必须可操作且应用保持可用。
- 旧 `.blockly.xml` / `.blockly.json` 只显示“不再支持”，不加载 Blockly 编辑器。

**Commit guidance:** 纯证据提交也遵循 Lore；`Constraint:` 记录真实模型/摄像头条件；`Not-tested:` 只保留尚未覆盖的平台组合。

---

### Task N02: 关闭 Windows 签名与安装信任链

**Priority:** P0
**Owner:** Release Owner + Windows IT
**Dependencies:** N00、N07

**Files:**
- Verify: `electron-builder.release.cjs`
- Verify: `package.json`
- Verify: `electron/test/phase0-release-contract.test.mjs`
- Create: `docs/release/2.0.0-rc.1/WINDOWS_RELEASE.md`
- Output: `dist-release/`

**Interfaces:**
- Consumes: 组织代码签名证书、N00 tag、electron-builder Windows target。
- Produces: 已签名 NSIS installer、win-unpacked、签名验证输出和 SHA-256。

- [x] **Step 1: 执行正式发布配置和凭据预检。**

Run:

```bash
node --test electron/test/phase0-release-contract.test.mjs
```

Expected: PASS；Windows release 配置强制签名，发布环境已注入证书且日志不回显 secret。

- [ ] **Step 2: 从 N00 tag 在 Windows 构建正式产物。**

Run:

```powershell
npm ci
npm ci --prefix scratch-editor
npm run quality-gate
npm run electron:build:release
```

Expected: NSIS installer 和 win-unpacked 均来自 `v2.0.0-rc.1`，构建日志没有“signing skipped”。

- [ ] **Step 3: 验证签名与干净安装。**

Run:

```powershell
Get-AuthenticodeSignature "dist-release/XEdu Client-2.0.0.exe" | Format-List Status,StatusMessage,SignerCertificate
signtool verify /pa /v "dist-release/XEdu Client-2.0.0.exe"
```

Expected: `Status: Valid`，`signtool` 退出 `0`。

**Acceptance Criteria:**

- Windows 10 与 Windows 11 各一台干净机器从浏览器下载、安装、首启和卸载成功率 `100%`。
- 发布者显示组织名称，不要求教师关闭杀毒软件或手工绕过“未知发行者”。
- installer、主 EXE 与卸载程序的签名验证均通过；证书信息和时间戳写入证据，不记录私钥内容。

**Commit guidance:** `Constraint:` 记录证书类型与组织策略；`Directive:` 声明正式 release 不得关闭强制签名。

---

### Task N03: 关闭 macOS Developer ID、公证与 Gatekeeper 链

**Priority:** P0
**Owner:** Release Owner + macOS IT
**Dependencies:** N00、N07

**Files:**
- Verify: `electron-builder.release.cjs`
- Verify: `package.json`
- Verify: `resources/entitlements.mac.plist`
- Verify: `electron/test/phase0-release-contract.test.mjs`
- Create: `docs/release/2.0.0-rc.1/MACOS_RELEASE.md`
- Output: `dist-release/`

**Interfaces:**
- Consumes: Developer ID Application identity、notarization 凭据、N00 tag。
- Produces: 已签名 `.app`、已公证并 staple 的 `.dmg`、zip、验证日志和 SHA-256。

- [x] **Step 1: 执行 release 配置和凭据预检。**

Run `node --test electron/test/phase0-release-contract.test.mjs`，确认 hardened runtime、entitlements、DMG/zip target、notarization 路径和缺少 identity 时失败的契约均通过。

- [ ] **Step 2: 从 N00 tag 构建、签名和公证。**

Run:

```bash
npm ci
npm ci --prefix scratch-editor
npm run quality-gate
npm run electron:build:release
```

Expected: electron-builder 使用 Developer ID Application identity；公证请求成功；DMG 完成 staple。

- [ ] **Step 3: 独立验证信任链。**

Run:

```bash
codesign --verify --deep --strict --verbose=2 "dist-release/mac-arm64/XEdu Client.app"
spctl --assess --type execute -vv "dist-release/mac-arm64/XEdu Client.app"
xcrun stapler validate "dist-release/XEdu Client-2.0.0-arm64.dmg"
```

Expected: 三条命令均退出 `0`，`spctl` 显示 accepted 和 Developer ID 来源。

**Acceptance Criteria:**

- `.app`、DMG 和 zip 对应同一 `v2.0.0-rc.1` commit。
- 新建 macOS 用户从浏览器下载 DMG 后可拖入 Applications 并双击启动，不使用 `xattr` 绕过 Gatekeeper。
- 摄像头、文件选择、本机 Python 选择和 Jupyter 子窗口所需权限均可正常申请和使用。

**Commit guidance:** `Not-tested:` 明确 Intel macOS 未覆盖时的架构边界；`Directive:` 禁止提交证书和 notarization secret。

---

### Task N04: 建立最终产物内容、版本、菜单、签名和清单门禁

**Priority:** P0
**Owner:** Release QA
**Dependencies:** N01、N02、N03

**Files:**
- Modify: `scripts/verify_release_artifact.mjs`
- Modify: `electron/test/release-artifact-verifier.test.mjs`
- Modify: `scripts/run_quality_gate.py`
- Create: `docs/release/2.0.0-rc.1/ARTIFACT_MATRIX.md`

**Interfaces:**
- Consumes: 最终 Windows installer/win-unpacked、macOS app/DMG/zip、签名证据。
- Produces: 与 release commit 绑定的跨平台 artifact matrix 和最终 manifest。

- [x] **Step 1: 先为缺失 release 证据编写失败测试。**

新增 fixture 覆盖：错版本、缺 Scratch、包含 `python_env`、重复 `app/backend`、旧 Blockly 专属路径、缺失交付文件和平台/架构不一致。

- [x] **Step 2: 扩展校验器输出 release evidence envelope。**

在现有内容 manifest 之外记录 installer/DMG/zip 的 SHA-256、源 commit/tag 和构建平台；签名主体、公证状态由对应 OS 的独立证据记录。校验器只汇总已验证结果，不伪造跨平台判断。

- [x] **Step 3: 执行内容和回归门禁（源码夹具和质量门禁）。**

Run:

```bash
npm run quality-gate -- --release-artifact "dist-release/win-unpacked"
npm run quality-gate -- --release-artifact "dist-release/mac-arm64/XEdu Client.app"
node scripts/verify_release_artifact.mjs "dist-release/win-unpacked" --version 2.0.0 --manifest "docs/release/2.0.0-rc.1/windows-manifest.json" --platform win32 --arch x64
node scripts/verify_release_artifact.mjs "dist-release/mac-arm64/XEdu Client.app" --version 2.0.0 --manifest "docs/release/2.0.0-rc.1/macos-manifest.json" --platform darwin --arch arm64
node --test electron/test/phase0-release-contract.test.mjs electron/test/package-layout-contract.test.mjs electron/test/release-artifact-verifier.test.mjs
```

Expected: 两个平台内容校验和契约测试均退出 `0`。

- [ ] **Step 4: 在两个 packaged app 中检查生产菜单。**

确认菜单和快捷键不包含 DevTools/openDevTools/toggleDevTools；开发态 `XEDU_OPEN_DEVTOOLS=1` 不影响打包版。

**Acceptance Criteria:**

- Win/mac 的版本、commit、tag、manifest 和安装包显示信息一致。
- 包内存在 `scratch-editor/build/index.html`、`backend`、`checkpoint`；不存在 `python_env`、`python_env_win` 和 `app/backend`。
- 每个交付文件都有 SHA-256；签名、公证、菜单和真实 Scratch GUI 证据均可从 matrix 追溯。
- 发布目录只包含本次候选产物，不混入旧 `dist-final*` 文件。

**Commit guidance:** `Scope-risk: moderate`；`Tested:` 同时记录 fixture 失败用例和真实产物命令。

---

### Task N05: 完成 30 台物理终端课堂矩阵

**Priority:** P1，正式教师普发前为硬门禁
**Owner:** Classroom QA + Training
**Dependencies:** N01、N04

**Files:**
- Verify: `backend/services/classroom_service.py`
- Verify: `backend/api/routes/classroom.py`
- Verify: `renderer/js/resources/classroom-connect.js`
- Use: `scripts/classroom_load_test.py`
- Create: `docs/release/2.0.0-rc.1/CLASSROOM_30_CLIENTS.md`

**Interfaces:**
- Consumes: 最终候选包、1 台教师机、30 台学生终端、代表性 Scratch/Jupyter 课程。
- Produces: 自动发现、手动地址、课程下载、实验打开和教师机资源曲线证据。

- [ ] **Step 1: 重跑自动化前置测试与单机基线。**

Run:

```bash
node --test renderer/js/resources/classroom-connect.test.mjs
python3 -m pytest backend/tests/test_classroom_api.py -q
python3 scripts/classroom_load_test.py --clients 30 --course zhangjiang-image-recognition
```

Expected: 自动化测试通过，单机 30/30、失败 0。

- [ ] **Step 2: 执行同网段 30 机自动发现。**

所有学生端在 2 分钟窗口内进入同一课堂、下载同一版本课程并打开指定实验；同时记录教师机 CPU、RSS、课堂 UI 响应和每台终端耗时。

- [ ] **Step 3: 执行自动发现失败的手动地址兜底。**

在阻断 UDP 广播或启用无线隔离的网络中，至少 3 台终端使用 `http://教师IP:5123` 进入课堂；验证错误地址、修正地址和重新加入流程。

- [ ] **Step 4: 执行中断与恢复。**

随机中断 3 台学生网络后恢复，确认不需要教师重启课堂；课程内容修改后重新发布，确认缓存失效且学生获得新版本。

**Acceptance Criteria:**

- 同网段自动发现与下载成功 `30/30`，失败数 `0`；约定完成窗口为 `120 秒`。
- UDP 不可用时，手动地址成功 `3/3`；格式错误有明确提示。
- 教师机课堂控制 UI 全程可操作，无应用崩溃、课程包损坏或重复 ZIP 风暴。
- 记录课程大小、P50/P95、CPU 峰值、RSS 峰值、重试次数、无线环境和失败明细。

**Commit guidance:** 证据提交的 `Constraint:` 必须记录 AP/VLAN/防火墙条件；`Not-tested:` 记录未覆盖学校网络类型。

---

### Task N06: 完成 Windows 进程树与 Electron 故障注入

**Priority:** P1，正式教师普发前为硬门禁
**Owner:** Runtime QA + Windows QA
**Dependencies:** N02、N04

**Files:**
- Verify: `backend/services/jupyter_service.py`
- Verify: `backend/runtime/xeduhub_runtime.py`
- Verify: `electron/main/main.js`
- Verify: `renderer/js/main/backend-startup-support.js`
- Test: `backend/tests/test_jupyter_service.py`
- Test: `backend/tests/test_runtime_safety.py`
- Create: `docs/release/2.0.0-rc.1/FAULT_INJECTION.md`

**Interfaces:**
- Consumes: 已签名 Windows 候选包、本机 Python 3.10+、Jupyter 环境。
- Produces: 端口冲突、子进程超时、后端崩溃、损坏配置和摄像头释放的恢复证据。

- [ ] **Step 1: 运行现有自动化保护。**

Run:

```bash
python3 -m pytest backend/tests/test_jupyter_service.py backend/tests/test_runtime_safety.py backend/tests/test_python_runtime.py -q
node --test electron/test/python-runtime.test.mjs renderer/js/main/backend-startup-support.test.mjs renderer/js/main/error-boundary.test.mjs
```

Expected: 全部通过。

- [ ] **Step 2: 在 Windows 实机注入运行时故障。**

依次执行：占用 Jupyter 目标端口；启动会创建子进程的超时 Python 任务；结束 backend 进程；写入无效配置；打开并关闭摄像头实验。每次都从教师界面执行恢复，不直接修改内部状态。

- [ ] **Step 3: 检查进程和端口清理。**

Run:

```powershell
Get-Process python,pythonw,jupyter -ErrorAction SilentlyContinue
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 5123,8888 }
```

Expected: 操作结束后只保留预期进程；超时任务及其子进程全部终止；被替换端口可再次绑定。

**Acceptance Criteria:**

- 后端崩溃、端口占用和损坏配置均出现可操作的“重试/打开日志/恢复默认值”入口。
- 超时 Python/Jupyter 任务在约定超时后 `10 秒` 内清理完整进程树。
- 摄像头实验关闭后设备可被系统相机或下一次实验立即使用。
- 诊断摘要不包含 token、password、api_key、课堂口令和请求正文。

**Commit guidance:** 若发现代码缺陷，先加失败测试再修复；每类故障单独提交，避免把多条恢复链混为一个大提交。

---

### Task N07: 关闭 npm 与 Python 依赖安全风险

**Priority:** P1
**Owner:** Security Owner
**Dependencies:** N00；N01-N06 的正式候选验证必须等待本任务结论

**Files:**
- Modify if required: `package.json`
- Modify if required: `package-lock.json`
- Modify if required: `backend/requirements.txt`
- Modify if required: `backend/requirements_full.txt`
- Modify if required: `backend/requirements_ci.txt`
- Create: `docs/release/2.0.0-rc.1/DEPENDENCY_AUDIT.md`

**Interfaces:**
- Consumes: 锁文件和三套用途明确的 Python requirements。
- Produces: 运行时/构建时分级审计、升级结果和有到期日的例外。

- [x] **Step 1: 生成机器可读审计结果。** Root/Scratch/fixed Python subset 和两套完整 Python requirements 的 resolver + `pip-audit` 结果已生成；正式候选仍需把原始 JSON 归档到 release evidence。

Run:

```bash
npm audit --json
python3 -m pip install pip-audit
python3 -m pip_audit -r backend/requirements.txt
python3 -m pip_audit -r backend/requirements_full.txt
```

Expected: 命令完成并保存原始 JSON/表格摘要；`pip-audit` 只作为审计工具，不加入教师运行时依赖。

- [x] **Step 2: 按暴露面分类，不按总数量直接判定。**

每项必须标注：直接/传递、运行时/构建时、教师终端是否加载、可利用前提、修复版本、升级回归范围、临时缓解和例外到期日。

- [x] **Step 3: 对可安全升级项执行 TDD 升级。**

已移除未被代码使用且会造成冲突回溯的 `kimi-agent-sdk`，升级 Jupyter/ML/ONNX/Protobuf 版本并固定 OCR/ONNX Runtime；完整 resolver 和 `pip-audit` 均已通过。`xedu-python` 的 `--no-deps` 安装兼容性仍需真实环境验证。

先用现有契约锁定 Electron、Vite、Scratch build 和 Backend 行为，再更新一个依赖组，运行 `npm run quality-gate`。不得用 `npm audit fix --force` 做无审查大版本跃迁。

**Acceptance Criteria:**

- Electron 不存在 direct high/critical；Python 直接运行依赖均有扫描结果。
- 未关闭项都有 owner、影响判断、缓解措施和不晚于 `2026-08-31` 的复核日期。
- 依赖升级后 `npm run quality-gate` 退出 `0`，并重跑 N01/N04 中受影响的 packaged 验收。
- 若审计导致任何源码或锁文件修改，候选 tag 必须重新创建，并让 N01-N06 全部基于新 tag 重跑。

**Commit guidance:** 每个依赖组独立提交；`Rejected:` 记录被否决的强制大版本升级及原因。

---

### Task N08: 完成独立教师安装与开课试用

**Priority:** P1，正式教师普发前为硬门禁
**Owner:** Training Owner + 未参与开发的教师
**Dependencies:** N04、N05、N06、N07

**Files:**
- Verify/Modify: `docs/teacher/INSTALL.md`
- Verify/Modify: `docs/teacher/QUICKSTART.md`
- Verify/Modify: `docs/teacher/TROUBLESHOOTING.md`
- Verify/Modify: `docs/teacher/CLASSROOM_NETWORK.md`
- Create: `docs/release/2.0.0-rc.1/TEACHER_TRIAL.md`

**Interfaces:**
- Consumes: 最终候选安装包、教师手册、Scratch/Jupyter 代表性课程。
- Produces: 无开发人员口头介入的教师完成记录和问题分级。

- [ ] **Step 1: 选取至少 2 名未参与开发的教师。**

一名使用 Windows，一名使用 macOS；仅提供正式安装包、教师文档和课程包，不提供开发文档。

- [ ] **Step 2: 独立完成端到端任务。**

教师需独立完成：下载与安装、首启、选择 Python 3.10+、导入课程、打开并保存 Scratch、启动 Jupyter、开启课堂、复制手动课堂地址、查看日志与结束课堂。

- [ ] **Step 3: 记录支持介入与完成时间。**

观察者只能记录，不解释操作；任何口头提示都计为一次人工支持，并记录阻塞步骤、界面文案和恢复结果。

**Acceptance Criteria:**

- 两名教师安装与首启成功率 `2/2`，Scratch 与 Jupyter 课程完成率 `2/2`。
- 每名教师在 `30 分钟` 内完成首次开课；开发人员口头介入次数为 `0`。
- 所有 P0 问题在发布前关闭；P1/P2 问题进入 `KNOWN_ISSUES.md` 并明确规避方式。
- 教师手册不出现 Blockly 创建、编辑或维护步骤。

**Commit guidance:** 文档修订与试用证据分开提交；不得提交教师个人隐私或学校网络敏感信息。

---

### Task N09: 最终发布签字与分阶段放量

**Priority:** P0
**Owner:** Release Owner + QA + Training Owner
**Dependencies:** N01-N08

**Files:**
- Create: `docs/release/2.0.0/RELEASE_DECISION.md`
- Create: `docs/release/2.0.0/ARTIFACTS.md`
- Modify: `docs/PRE_RELEASE_AUDIT_2026-07-16.md`
- Modify: `docs/CODE_QUALITY_AND_OPTIMIZATION_PLAN.md`

**Interfaces:**
- Consumes: 所有 RC 证据、最终安装包、已知问题和负责人签字。
- Produces: Go/No-Go 决策、正式 artifact 清单和放量/回滚规则。

- [ ] **Step 1: 核对所有发布门禁。**

N01-N08 必须全部有明确结论；不得用 `[~]` 关闭 P0。任何源码修复都会产生新的 RC tag，并使受影响产物和实机证据失效。

- [ ] **Step 2: 生成最终 artifact 表。**

对 Windows installer、macOS DMG/zip 记录文件名、字节数、SHA-256、签名主体、commit、tag、构建时间和下载位置。

- [ ] **Step 3: 签署发布决定。**

Release Owner、QA 和 Training Owner 分别确认构建可追溯、技术门禁通过和教师可用性通过。

**Acceptance Criteria:**

- 没有未关闭 P0；N01-N08 证据齐全且指向同一正式 commit/tag。
- 正式结论为 `Go` 后，先进行受控培训，再进行 3 所学校/5 名教师试点；连续 3 场培训无 P0 才扩大分发。
- 回滚触发条件包括：安装阻断、课程数据损坏、Scratch 无法保存、课堂接入失败可重复、签名/公证失效。
- 发布后不再把 `dist-final-current` 或任何旧 unpacked 目录作为正式交付来源。

**Commit guidance:** Intent line 使用“Authorize teacher distribution with traceable release evidence”；`Scope-risk: broad`；`Not-tested:` 必须为空或只包含明确接受的非目标平台。

---

## 发布后结构治理

以下任务只有在 N09 完成，或明确决定延期正式发布后才进入实施。它们不阻断当前教师培训候选包。

### Task N10: 拆分 `resources.js` 的课堂与课程创建协调逻辑

**Priority:** P2
**Owner:** Renderer
**Dependencies:** N09

**Files:**
- Modify: `renderer/js/resources.js`
- Create: `renderer/js/resources/classroom-controller.js`
- Create: `renderer/js/resources/course-create-controller.js`
- Test: `renderer/js/resources/classroom-connect.test.mjs`
- Test: `renderer/js/resources/resources-state.test.js`
- Test: `renderer/js/resources/course-create-utils.test.js`
- Test: `renderer/js/resources/teacher-resource-ui-contract.test.mjs`

**Interfaces:**
- Consumes: `resourcesState`、现有 `classroom-connect.js`、course create utilities 和 `api.js`。
- Produces: 无隐式全局状态的课堂控制器与课程创建控制器；`resources.js` 只保留页面装配。

- [ ] **Step 1: 先为公开接口和状态迁移补契约测试。**

覆盖课堂 start/stop/discover/manual connect、课程创建 step/source/save、错误边界和状态引用稳定性。

- [ ] **Step 2: 只提取课堂控制边界。**

迁移 `loadClassroomConfig` 到 `initClassroom` 相关逻辑；依赖通过构造参数传入，不从新模块反向导入 `resources.js`。

- [ ] **Step 3: 门禁通过后再提取课程创建边界。**

迁移 modal、source、scan、section editor 和 save orchestration；复用现有 `course-create-*` 模块，不再复制 normalize/validation。

- [ ] **Step 4: 运行回归。**

Run:

```bash
node --test renderer/js/resources/classroom-connect.test.mjs renderer/js/resources/resources-state.test.js renderer/js/resources/course-create-utils.test.js renderer/js/resources/teacher-resource-ui-contract.test.mjs
npm run test:resources-inspection
npm run quality-gate
wc -l renderer/js/resources.js
```

**Acceptance Criteria:**

- `resources.js` 从当前约 `7,363` 行降到 `5,500` 行以下。
- 新模块不反向 import `resources.js`，不新增模块级可变状态。
- 课堂、课程创建、资源详情、Scratch/Jupyter 打开和教师模式测试全部通过。

**Commit guidance:** 课堂与课程创建拆分各自一个 Lore commit；不得同时做视觉改版。

---

### Task N11: 拆分 Jupyter 进程/端口/监控职责

**Priority:** P2
**Owner:** Backend
**Dependencies:** N09

**Files:**
- Modify: `backend/services/jupyter_service.py`
- Reuse: `backend/services/jupyter_environment.py`
- Create: `backend/services/jupyter_process.py`
- Create: `backend/services/jupyter_monitor.py`
- Test: `backend/tests/test_jupyter_service.py`
- Create: `backend/tests/test_jupyter_process.py`

**Interfaces:**
- Consumes: `JupyterConfig`、现有环境解析和 `JupyterManager` 公共 API。
- Produces: `JupyterProcessController` 与 `JupyterMonitor`；路由继续只依赖 `JupyterManager` facade。

- [ ] **Step 1: 锁定 `JupyterManager` 的启停、端口切换、崩溃和自动重启行为。**
- [ ] **Step 2: 提取进程启动、终止和进程树清理到 `jupyter_process.py`。**
- [ ] **Step 3: 提取端口探测、保护线程和自动恢复到 `jupyter_monitor.py`。**
- [ ] **Step 4: 保持 `JupyterManager` 公共返回结构和路由调用不变。**

Run:

```bash
python3 -m pytest backend/tests/test_jupyter_service.py backend/tests/test_jupyter_process.py -q
python3 -m pytest backend/tests -q
npm run quality-gate
wc -l backend/services/jupyter_service.py
```

**Acceptance Criteria:**

- `jupyter_service.py` 从当前约 `1,296` 行降到 `800` 行以下。
- Windows/POSIX 进程树清理分别有直接单元测试；真实 Jupyter 集成测试记录启动、状态和停止。
- API 返回字段、错误码、日志脱敏和自动恢复行为不变。

**Commit guidance:** 先提交回归测试，再分别提交 process 和 monitor 提取；`Directive:` 保持 `JupyterManager` facade 稳定。

---

### Task N12: 拆分 Gitea 发布/同步并治理 CSS 语义颜色

**Priority:** P2
**Owner:** Backend + Renderer
**Dependencies:** N09；两个子任务独立执行、独立提交

**Files:**
- Modify: `backend/services/gitea_service.py`
- Reuse: `backend/services/gitea_client.py`
- Reuse: `backend/services/gitea_course_scanner.py`
- Create: `backend/services/gitea_publish.py`
- Create: `backend/services/gitea_sync.py`
- Test: `backend/tests/test_gitea_publish_cleanup.py`
- Test: `backend/tests/test_gitea_client.py`
- Modify: `renderer/styles/main.css`
- Test: `renderer/styles/main-css-contract.test.mjs`

**Interfaces:**
- Consumes: 现有 Gitea client/scanner、课程目录契约和 CSS 变量骨架。
- Produces: 发布与拉取同步边界；可审计的语义颜色 token。

- [ ] **Step 1: 锁定 publish、pull、备份恢复和清理失败行为。**
- [ ] **Step 2: 提取发布事务到 `gitea_publish.py`，提取 pull/sync/backup 到 `gitea_sync.py`。**
- [ ] **Step 3: 保留 `gitea_service.py` 兼容导出，避免路由和旧测试一次性迁移。**
- [ ] **Step 4: 统计 CSS 颜色字面量，先替换高频且语义明确的状态色，不做全站主题重写。**

Run:

```bash
python3 -m pytest backend/tests/test_gitea_client.py backend/tests/test_gitea_publish_cleanup.py -q
node --test renderer/styles/main-css-contract.test.mjs
npm run build
npm run quality-gate
wc -l backend/services/gitea_service.py
rg -o '#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)' renderer -g '*.css' | wc -l
```

**Acceptance Criteria:**

- `gitea_service.py` 从当前约 `799` 行降到 `450` 行以下；client、scanner、publish、sync 职责不交叉。
- 发布失败不遗留半写入索引；同步失败可恢复备份；现有路由导入保持兼容。
- CSS 颜色字面量基线和变化量写入提交；只替换重复且语义稳定的颜色，教师/学生模式构建与契约通过。

**Commit guidance:** Gitea 与 CSS 必须分开提交；CSS 提交的 `Not-tested:` 记录未做全量截图回归的页面。

---

## 完成定义

- N00-N09 全部完成后，才可以把 `docs/PRE_RELEASE_AUDIT_2026-07-16.md` 的“面向教师正式普发”从 `No-Go` 改为 `Go`。
- 任何未关闭 P0、未签名产物、未完成真实 `.sb3` GUI 或没有独立教师试用，都保持 `No-Go`。
- N10-N12 是发布后治理，不得因为它们尚未完成而恢复 Blockly 或阻塞已通过 N00-N09 的正式版本。
- 最终验证证据必须可追溯到同一 commit/tag，且 `npm run quality-gate`、双平台签名、公证、30 台课堂和教师试用均有明确结果。
