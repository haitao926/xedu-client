# XEdu Scratch 主线 Skill 更新规格

## 目标

更新当前项目 `.codex/skills/` 下的项目级 Skill，使课程建设以 Scratch 为主要图形化实验方式，并将 HTML、Scratch、Jupyter 三类实验的生成职责拆开。

本任务只修改 `.codex/skills/`。不要修改业务代码、现有课程内容或全局 Skill。

## Skill 分工

### `xedu-course-builder`

负责课程整体规划和资源组织：

- 明确课程主题、对象、课时、教学目标和最终成果。
- 设计课次顺序及每节课的实验。
- 根据教学目标选择 HTML、Scratch、Jupyter 中的一种或多种实验形态。
- 准备常规材料清单，包括教师说明、学生实验指导、实验素材、起始项目和完成标准。
- 检查实验之间的衔接，并把单项实验交给对应实验 Skill。
- 继续维护 `course.json`，但不要求所有课程同时具备 HTML、Scratch 和 Jupyter。

### `xedu-html-lab`

负责生成单个 HTML 互动体验实验。

- 用互动页面帮助学生观察实验现象和结果变化。
- 提供少量关键参数供学生操作。
- 尽量展示与实验对应的真实 XEdu Python 代码。
- 参数变化时同步更新代码片段，代码应便于复制到 Jupyter 继续实践。
- 使用项目当前实际支持的 XEdu API，不得编造接口。
- 保持页面美观、简洁、清晰；一个页面聚焦一个核心现象。
- 首屏优先呈现核心互动、结果和代码，避免无意义动画、卡片堆叠和大段说明。
- 适配常见电脑屏幕和课堂投屏，并尽量离线可用。

主要产物：

- `index.html`
- 必要的本地素材
- 与参数联动的 XEdu Python 代码
- 简短的操作说明和挑战任务

### `xedu-scratch-lab`

负责设计和构建单个 Scratch 实验。

- 根据教学目标选择 Scratch 原生积木和 XEdu 扩展积木。
- 设计学生需要运行、修改、补全或创作的任务。
- 创建、扩展、修复或迁移 `.sb3` 项目。
- 准备图片、音频等素材和简洁的学生实验指导。
- 验证项目能够打开、运行、保存和重新加载。

设计实验前必须从当前 Scratch XEdu 扩展源码读取真实能力，不能凭印象编造积木。能力目录至少记录：

- 积木 ID 与中文名称
- 功能分类
- 参数与返回值
- 对应后端任务
- 运行依赖
- 当前支持状态

能力可按输入感知、XEdu AI 任务、结果处理、数学判断、流程控制、舞台反馈、网络设备和历史兼容分类。

每个实验使用简洁规格：

```yaml
title:
learning_goal:
blocks:
student_steps:
expected_result:
required_assets:
challenge:
```

典型实验流程为：启动、准备输入、调用能力、读取或判断结果、在舞台上给出可见反馈。

### `xedu-jupyter-lab`

负责生成单个 Python/Jupyter 编程实验。

- 让学生运行真实 Python/XEdu 代码，修改参数并观察结果。
- 支持数据处理、图表观察或模型结果分析。
- 与同一课程中的 HTML、Scratch 实验保持术语、参数和素材一致。
- 保持 Notebook 清晰，避免把大量辅助实现堆在教学单元格中。
- 尽量离线运行，并实际执行关键路径。

主要产物：

- `main.ipynb`
- 必要的辅助 Python 文件
- 数据和本地素材
- 简短实验指导
- 可观察的运行结果

### `lab-build`

保留为旧调用的兼容入口，不再直接生成混合的 HTML/Jupyter 实验。

- 判断请求属于 HTML、Scratch 还是 Jupyter 实验。
- 将任务交给对应的新 Skill。
- 对旧调用说明新的 Skill 分工。
- 移除固定的 `HTML -> Jupyter` 双闭环假设。

### `xedu-pack`

负责课程检查、打包和发布。

- 将 `.sb3` 和 `type: "scratch"` 作为一等课程资源。
- 新课程不再生成 Blockly 资源。
- `.blockly.xml` 仅作为历史兼容资源识别。
- Scratch 与 Blockly 同时存在时优先 Scratch；只有 Blockly 时报告迁移缺口。
- 不再以固定的 `html + blockly + ipynb` 判断所有课程的完整性。
- 根据课程实际选择的实验形态检查资源是否齐全。
- 检查 `course.json` 可解析、引用路径存在、Scratch 项目有效。
- 保留现有构建和发布安全规则。

## 课程资源约定

新 Scratch 资源推荐使用：

```text
lessonN/expM/scratch/*.sb3
```

`course.json` 使用现有结构：

```json
{
  "path": "lesson1/exp1/scratch/example.sb3",
  "type": "scratch",
  "name": "Scratch 实验"
}
```

继续以 `course.json` 作为课程清单，不新增另一套课程 Schema。打包时优先保留课程源目录中的有效相对路径，不擅自改造成另一套实验目录结构。

## 实验组合

课程可以按教学目标选择以下组合：

- HTML
- Scratch
- Jupyter
- HTML + Scratch
- Scratch + Jupyter
- HTML + Jupyter
- HTML + Scratch + Jupyter

三类实验的常见作用是：

```text
HTML：观察现象，并查看对应的 XEdu Python 代码
Scratch：使用积木搭建和创作作品
Jupyter：运行、修改并理解真实 Python/XEdu 代码
```

这是一种可选教学路径，不是所有课程的强制结构。

## 目标目录

```text
.codex/skills/
  xedu-course-builder/
  xedu-html-lab/
  xedu-scratch-lab/
  xedu-jupyter-lab/
  lab-build/
  xedu-pack/
```

保持每个 `SKILL.md` 简洁。较长的 Scratch 积木能力目录和实验设计说明放入 `references/`；只有在需要确定性提取或校验时才增加 `scripts/`，且不新增第三方依赖。

## 实施要求

1. 先检查现有 Skill、Scratch 扩展源码、课程资源识别和 `.sb3` 读写约定。
2. 先为每个新增或修改的 Skill 准备典型调用场景，记录现有 Skill 的失败或错误路由。
3. 逐个更新并验证 Skill，不要一次写完后统一补测试。
4. 更新 `agents/openai.yaml`，确保名称、简介和默认提示与 `SKILL.md` 一致。
5. 检查 frontmatter、相对引用、目录命名和触发描述。
6. 不修改 `.codex/skills/` 之外的文件。

## 验收场景

至少验证以下请求能正确路由并得到符合职责的结果：

- “帮我规划一门七年级 Scratch AI 课程。”
- “给这个实验做一个简洁的互动体验页，并显示对应的 XEdu Python 代码。”
- “用当前支持的积木设计一个图像分类 Scratch 实验。”
- “把这个 Scratch 实验继续做成 Jupyter 编程实践。”
- “检查这门含 `.sb3` 的课程能否打包。”
- “检查旧 Blockly 课程还需要迁移哪些资源。”

## 完成标准

- 创建 `xedu-html-lab`、`xedu-scratch-lab`、`xedu-jupyter-lab`。
- 更新 `xedu-course-builder`、`lab-build`、`xedu-pack`。
- 新课程默认使用 Scratch，不再生成 Blockly。
- HTML Skill 明确包含 XEdu Python 代码联动和页面质量要求。
- Scratch Skill 基于真实积木能力设计实验，并能验证 `.sb3`。
- Jupyter Skill 独立负责 Python/XEdu 编程实践。
- Course Builder 包含常规课程规划、实验安排和材料准备。
- Pack Skill 根据实际实验组合检查完整性。
- 每个 Skill 的基础校验和典型调用验证通过。
- 最终报告列出修改文件、主要简化、验证证据和剩余风险。
