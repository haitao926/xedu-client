---
strategy: a
name: Story-Driven
style: notion
palette: "warm-white, indigo, teal, amber"
style_reason: "用克制的手绘知识图承接项目故事，保留一线课堂的真实感和产品介绍的专业度"
layout: mixed
image_count: 7
generated_count: 4
screenshot_group_count: 3
backend: sasu-image2
---

# XEdu Client 公众号配图大纲

## 01 Cover

- **Type**: generated cover
- **Ratio**: landscape, 2048x1152 source
- **Article position**: title / opening
- **Purpose**: show a classroom moving from interruption to continuity
- **Visual**: ordinary school computer lab, teacher and students facing one learning task, a fading terminal interruption on one side, a calm unified workbench on the other
- **Text in image**: none; title is handled by the WeChat article layout

## 02 Origin Scene

- **Type**: generated scene
- **Ratio**: 3:2, 1536x1024
- **Article position**: “一切从一个被关掉的黑框开始”
- **Purpose**: make the project origin immediately recognizable
- **Visual**: student closes a terminal window, Jupyter task pauses, teacher troubleshoots nearby machines; focus on disrupted attention, not blame
- **Text in image**: none

## 03 Learning Entries

- **Type**: generated concept map
- **Ratio**: 3:2, 1536x1024
- **Article position**: “AI Coding 时代，积木编程并没有变得不重要”
- **Purpose**: show HTML, Scratch and Jupyter as different entrances to one AI problem
- **Visual**: one central AI task with three non-linear visual routes: interactive experiment, visible block logic, real notebook practice
- **Text in image**: none; captions are placed in the article

## 04 Product Evidence

- **Type**: real screenshots
- **Article position**: product introduction
- **Capture**: current dashboard/student home, course resource detail, current Scratch/XEdu AI workspace
- **Rule**: no generated UI, no Blockly, no personal keys or teacher credentials

## 05 Product Response

- **Type**: generated concept infographic
- **Ratio**: 3:2, 1536x1024
- **Article position**: “于是，我们把一节 AI 实验课放进同一张工作台”
- **Purpose**: map three classroom problems to three product responses
- **Visual**: three rows of icons and arrows: unstable start to checked runtime, fragmented learning to linked course context, scattered files to reusable course package
- **Text in image**: none; use article caption for “上不起来、连不起来、留不下来”

## 06 Case Evidence

- **Type**: real screenshots
- **Article position**: “一个具体例子：从搭网络到训模型”
- **Capture**: current `构建神经网络.html` and `L9_Part1.ipynb` result state
- **Rule**: show HTML on the left and Notebook on the right; no Scratch or Blockly in this case image

## 07 Classroom Flow Evidence

- **Type**: real screenshots with editorial captions
- **Article position**: “从教师视角看，一节课可以这样发生”
- **Capture**: Python environment check/course import, teacher starts class, student discovers or manually joins class
- **Rule**: do not imply gradebook, assignment collection, progress dashboard or full learning analytics

# Generation order

1. Generate 01 first as the visual language anchor.
2. Generate 02, 03 and 05 using the same style description and palette.
3. Review each bitmap for composition and unwanted text; regenerate rather than patching text.
4. Capture 04, 06 and 07 from the current application and current course files.
