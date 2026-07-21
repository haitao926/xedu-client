# Scratch 体感越障实验实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将本机“人体姿态控制行空板 K10”课程的实验 2 改造成学生自行编写姿态逻辑的单关体感越障游戏。

**Architecture:** 使用一个无依赖的 Node 脚本生成标准 `.sb3` 包。项目中的角色、障碍、计分和碰撞逻辑预置；`学生代码` 精灵只放置可见的任务提示和空白控制区，学生从 `xeduCamera` 与 `xeduBodySensing` 积木读取坐标并广播 `跳跃`。课程 JSON 与 README 使用同一任务描述。

**Tech Stack:** Node.js 内置 `fs`、`crypto`、`child_process`；Scratch 3 `.sb3`（ZIP + `project.json` + SVG 资源）；本地 XEdu 课程文件夹。

## Global Constraints

- 仅使用已有 `xeduCamera`、`xeduBodySensing` 和 `pose_body17`。
- 不添加 npm 依赖或新的感知接口。
- 保持单关、单动作；双手腕 Y 坐标均高于鼻尖 Y 坐标时跳跃。
- 课程资源根目录固定为 `/Users/apple/Documents/XeduCourses/human-pose-control-hardware`。
- 手动变更一律使用 `apply_patch`；生成的二进制 `.sb3` 由脚本产出。

---

### Task 1: 生成可玩 Scratch 项目

**Files:**
- Create: `scripts/build-body-gesture-game.mjs`
- Modify: `/Users/apple/Documents/XeduCourses/human-pose-control-hardware/lesson1/exp2/scratch/keypoint_coordinates.sb3`

**Interfaces:**
- Consumes: `node scripts/build-body-gesture-game.mjs --output <absolute-sb3-path>`
- Produces: 一个带 `xeduCamera`、`xeduBodySensing`、`跳跃` 和 `游戏结束` 消息的 Scratch 3 项目。

- [x] **Step 1: 写入生成器和项目结构断言**

生成器必须创建舞台、`闯关角色`、`障碍物` 与 `学生代码` 精灵；定义全局变量 `分数`、`鼻尖 Y`、`左手腕 Y`、`右手腕 Y`、`游戏状态`、`跳跃中`，并将前三个坐标变量和分数显示在舞台。

- [x] **Step 2: 预置游戏骨架**

角色响应 `跳跃` 时仅在 `跳跃中 = 0` 且 `游戏状态 = 进行中` 跳起和落下；障碍物移动、计分、碰撞检测和 `游戏结束` 由预置脚本处理。`学生代码` 精灵的注释必须列出以下未实现链路：

```text
开启摄像头和人体感知 -> 显示身体关键点 -> 读取三组 Y 坐标 ->
当左右手腕 Y 都大于鼻尖 Y 时广播 跳跃
```

- [x] **Step 3: 运行生成器并验证包**

Run: `node scripts/build-body-gesture-game.mjs --output /Users/apple/Documents/XeduCourses/human-pose-control-hardware/lesson1/exp2/scratch/keypoint_coordinates.sb3 --verify`

Expected: 输出项目路径，并确认 ZIP 含有 `project.json`、两个 XEdu 扩展、两个广播与关键游戏变量。

### Task 2: 更新课程元数据和学生说明

**Files:**
- Modify: `/Users/apple/Documents/XeduCourses/human-pose-control-hardware/course.json`
- Modify: `/Users/apple/Documents/XeduCourses/human-pose-control-hardware/lesson1/exp2/scratch/README.md`

**Interfaces:**
- Consumes: Task 1 生成的 `keypoint_coordinates.sb3`。
- Produces: 课程页和项目内任务完全一致的实验描述。

- [x] **Step 1: 更新实验 2 元数据**

将实验标题改为“实验 2：举手跳跃体感越障”，描述为从关键点坐标写出姿态规则并控制角色跳过障碍；保留现有文件路径，更新学生任务为搭建感知、读取坐标、完成条件、测试分数与调阈值。

- [x] **Step 2: 重写 README**

README 要区分“项目已准备”和“你要编写”：前者包含角色和障碍，后者只包含感知启动、关键点读取与 `跳跃` 广播。写出基于相对 Y 坐标的判定式，以及单手举起、阈值和防重复触发三个挑战。

- [x] **Step 3: 解析验证**

Run: `jq empty /Users/apple/Documents/XeduCourses/human-pose-control-hardware/course.json`

Expected: 退出码为 `0`。

### Task 3: 集成验证

**Files:**
- Test: `scratch-editor/test/xedu-extension.test.js`

**Interfaces:**
- Consumes: 已实现的“显示身体关键点”积木。
- Produces: Scratch 项目所需积木在当前本地编辑器中可见。

- [x] **Step 1: 刷新本地 Scratch 依赖副本**

Run: `cd scratch-editor && node scripts/patch-scratch.js`

Expected: 脚本成功刷新本地 Scratch GUI/VM 的 XEdu 扩展文件。

- [x] **Step 2: 执行自动测试**

Run: `cd scratch-editor && npm test`

Expected: 所有现有 XEdu 扩展测试通过。

- [x] **Step 3: 检查课程产物**

Run: `unzip -t /Users/apple/Documents/XeduCourses/human-pose-control-hardware/lesson1/exp2/scratch/keypoint_coordinates.sb3`

Expected: `No errors detected in compressed data`。
