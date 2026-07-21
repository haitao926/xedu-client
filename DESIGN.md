# DESIGN.md

> 学生端不是资源仓库，也不是管理后台；它是当前课节的学习工作台：课程任务中心负责分流，互动体验和图形编程保留实验详情页，Python 实验保留 Jupyter 编程环境。

## 1. Visual Theme & Atmosphere

**Style**: Classroom Mission Console / 课堂任务工作台  
**Keywords**: 当前课节、任务中心、三种实践、实验详情页、原生工作台、低干扰、投屏可读、可继续  
**Tone**: 稳定、克制、操作导向 — NOT 营销页、资源仓库、炫技动效、教师管理后台  
**Feel**: 像老师把本节课的任务卡放在桌面中央，旁边依次摆好体验屏、积木台和代码台。

**Interaction Tier**: L1 精致静态  
**Dependencies**: CSS only；不新增 npm 包、不引入外链字体。

## 2. Color Palette & Roles

学生端继承现有产品变量，只在语义层补充课程工作台变量。新代码优先引用这些变量；旧代码变量不在本次重构范围内。

```css
:root {
  --student-bg: var(--bg-app);
  --student-surface: var(--bg-card);
  --student-surface-solid: #ffffff;
  --student-surface-soft: #f8fafc;
  --student-border: var(--border-color);
  --student-border-strong: var(--border-strong);
  --student-text: var(--text-main);
  --student-text-strong: var(--text-heading);
  --student-text-secondary: var(--text-secondary);
  --student-text-muted: var(--text-muted);
  --student-accent: var(--info-color);
  --student-accent-strong: #1d4ed8;
  --student-experience: #0f766e;
  --student-blockly: #2563eb;
  --student-python: #b45309;
  --student-ai: #4f46e5;
  --student-accent-rgb: 37, 99, 235;
  --student-experience-rgb: 15, 118, 110;
  --student-blockly-rgb: 37, 99, 235;
  --student-python-rgb: 180, 83, 9;
  --student-ai-rgb: 79, 70, 229;
  --student-shadow-soft: 0 16px 36px -30px rgba(15, 23, 42, 0.45);
}
```

**Color Rules:**
- 侧栏活跃态统一使用蓝色，表达“当前正在学习的入口”。
- `互动体验` 使用青绿色语义，`图形编程` 使用 Blockly 蓝色语义，`Python实验` 使用 Jupyter 橙色语义。
- 学生端新增颜色只允许出现在 `--student-*` 变量或已有设计变量里；组件样式优先引用变量。

## 3. Typography Rules

**Font Stack:**
```css
font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
```

| Role | Font | Size | Weight | Line Height | Letter Spacing |
|------|------|------|--------|-------------|----------------|
| Page Title | Product stack | 1.25-1.5rem | 700 | 1.3 | -0.01em |
| Lesson Title | Product stack | 1.125-1.375rem | 800 | 1.35 | -0.01em |
| Experiment Title | Product stack | 0.95-1.05rem | 700 | 1.45 | — |
| Body | Product stack | 0.875rem | 400-500 | 1.7 | 0.01em |
| Label | Product stack | 0.75-0.8125rem | 650 | 1.35 | 0.02em |
| Code/Notebook | Existing Blockly/Jupyter context | inherited | inherited | inherited | — |

**Typography Rules:**
- 中文说明行高不低于 1.65，任务文字不能挤成密集表格。
- Blockly 与 Jupyter 工作区使用自身字体和布局，外层不得强行覆盖代码字体。
- **NEVER use**: 营销型巨幅标题、渐变标题、正文投影、过细字重。

**Text Decoration:**
- Page title: 无渐变、无投影。
- Section title: 可使用小型状态 badge。
- 正文、任务列表、实验说明: 无装饰。

## 4. Component Stylings

### Student Sidebar
```css
.student-nav-item {
  min-height: 46px;
  border-radius: 14px;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
}
.student-nav-item.active {
  color: var(--student-accent-strong);
  border-color: rgba(var(--student-accent-rgb), 0.22);
  background: linear-gradient(135deg, var(--student-surface-solid) 0%, #eff6ff 100%);
}
.student-nav-item:hover {
  background: var(--student-surface-soft);
  color: var(--student-text-strong);
}
.student-nav-item:active {
  transform: translateX(1px) scale(0.99);
}
.student-nav-item:focus-visible {
  outline: 3px solid rgba(var(--student-accent-rgb), 0.22);
  outline-offset: 2px;
}
.student-nav-item[aria-disabled="true"] {
  opacity: 0.45;
  pointer-events: none;
}
```

### Task Cards
```css
.resources-route-exp {
  background: var(--student-surface-solid);
  border: 1px solid var(--student-border);
  border-radius: var(--radius-lg);
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}
.resources-route-exp:hover {
  border-color: rgba(var(--student-accent-rgb), 0.24);
  box-shadow: 0 12px 28px -22px rgba(15, 23, 42, 0.36);
  transform: translateY(-1px);
}
.resources-route-exp:focus-within {
  border-color: rgba(var(--student-accent-rgb), 0.3);
  box-shadow: var(--student-shadow-soft);
}
```

### Experiment Entry Cards
```css
.resources-student-entry-card {
  border: 1px solid var(--student-border);
  border-radius: var(--radius-lg);
  background: var(--student-surface-solid);
}
.resources-student-entry-actions .btn {
  min-height: 40px;
  border-radius: 12px;
}
.resources-student-entry-actions .btn:hover {
  transform: translateY(-1px);
}
.resources-student-entry-actions .btn:active {
  transform: translateY(0);
}
.resources-student-entry-actions .btn:focus-visible {
  outline: 3px solid rgba(var(--student-accent-rgb), 0.22);
  outline-offset: 2px;
}
.resources-student-entry-actions .btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
```

### Workspace Pages
- `课程任务中心`: 只显示当前课程当前课节。上方是“本节任务总览”，中间是三种实践入口，下面是本节实验顺序和学生任务。
- `互动体验`: 保留课程实验详情页形态。左侧只列本节实验，右侧显示当前实验说明、学生任务和 HTML 打开入口。
- `图形编程`: 保留课程实验详情页形态。左侧只列本节实验，右侧只显示 Blockly 入口；点击按钮后才进入 `blockly-workspace` 原工作台 iframe。
- `Python实验`: 不做资源表格，直接进入 Jupyter Lab 页面。Jupyter 控制、日志和 BrowserView 保持原有编程体验。
- `AI助手`: 不抢主任务，只提供当前课节上下文问答、概念解释和报错辅助。

## 5. Layout Principles

**左侧学生入口职责：**
- `课程任务中心`: 默认入口。只展示当前课程当前课节；显示本节目标、实验顺序、学生任务和“进入对应实验页”的按钮。
- `互动体验`: 当前课节的 HTML 体验入口页。学生先读说明，再点击打开体验。
- `图形编程`: 当前课节的 Blockly 入口页。学生先看到实验说明，再点击进入原 Blockly 工作台。
- `Python实验`: 当前课节的 Jupyter / Notebook / Python 编程环境。学生看到的是代码实验环境，不是文件表格。
- `AI助手`: 当前课节上下文助手，用于解释任务、概念和报错。

**页面内容契约：**
| 页面 | 第一屏必须看到 | 不能出现 | 打开动作 |
|------|----------------|----------|----------|
| 课程任务中心 | 当前课程、当前课节、目标、实验顺序、三种实践入口 | 所有课程列表、教师编辑按钮、文件路径堆叠 | 按钮进入对应实验页，不直接打开零散文件 |
| 互动体验 | 本节实验列表、当前实验说明、学生任务、HTML 体验按钮 | 教师编辑入口、全课程资源表 | 打开 HTML 体验页 |
| 图形编程 | 本节实验列表、当前实验说明、Blockly 入口 | 直接跳过说明进入工作台、普通资源表 | 打开原 Blockly 工作台 |
| Python实验 | Jupyter Lab 工作区、当前课节/实验上下文 | 普通资源表、总控制台导航 | 打开 Notebook / `.py`，保留 Jupyter 风格 |
| AI助手 | 当前课节上下文提示、问题输入框 | 教师管理入口、资源编辑入口 | 回答概念、步骤、报错 |

**禁止的入口语义：**
- 学生端不显示 `总控制台`。
- 学生端不显示 `课程资源` 管理列表。
- `静态 lessonX/index.html` 只能作为备用资源，不能替代客户端组织页。

**Container:**
- App shell 使用现有全高布局。
- 学生模式只显示当前课程当前课节；教师模式保留完整课程管理。

**Grid:**
```css
.resources-outline-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 14px;
}
.resources-outline-layout.is-student-workspace {
  grid-template-columns: minmax(0, 1fr);
  max-width: 1120px;
  margin: 0 auto;
}
.resources-view.is-student-lesson .resources-outline-layout:not(.is-student-workspace) {
  grid-template-columns: 260px minmax(0, 1fr);
}
```

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat | 无阴影，仅边框 | Blockly/Jupyter 内部画布 |
| Subtle | 轻边框 + `--shadow-sm` | 实验说明、入口卡 |
| Elevated | 柔和阴影 | 当前任务卡、当前实验卡 |
| Overlay | BrowserView / iframe | Jupyter 和 Blockly 原生工作台 |

## 7. Animation & Interaction

**Motion Philosophy**: 课堂场景只保留确认感，不制造注意力噪音。  
**Tier**: L1

### Dependencies
```html
<!-- none -->
```

### Entrance Animation
```css
@keyframes studentFadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.resources-route-exp,
.resources-student-entry-card,
.resources-experiment-pane,
.workspace-shell {
  animation: studentFadeIn 180ms ease both;
}
```

### Hover & Focus States
```css
.student-nav-item:focus-visible,
.resources-route-exp button:focus-visible,
.resources-student-entry-card button:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.22);
  outline-offset: 2px;
}
```

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  .resources-route-exp,
  .resources-student-entry-card,
  .resources-experiment-pane,
  .workspace-shell {
    animation: none;
    transition: none;
  }
}
```

## 8. Do's and Don'ts

### Do
- 学生模式默认进入 `课程任务中心`。
- 学生端左栏只保留 `课程任务中心 / 互动体验 / 图形编程 / Python实验 / AI助手`。
- `课程任务中心` 的按钮先进入对应实验页，避免学生直接跳进一堆零散文件。
- `互动体验` 和 `图形编程` 保留课程实验详情页结构。
- `图形编程` 点击具体 Blockly 入口后才进入原 Blockly 工作台。
- `Python实验` 复用现有 Jupyter Lab 页面和 BrowserView 编程体验。
- 切换到任务中心、互动体验、图形编程时必须隐藏 Jupyter BrowserView。

### Don't
- ❌ 不把教师侧数据采集和管理操作放进学生主流程。
- ❌ 不把 `实验记录单.md` 作为学生入口。
- ❌ 不把静态 `lessonX/index.html` 当客户端主入口。
- ❌ 不在学生端展示所有课程、所有课节和教师管理按钮。
- ❌ 不把 Blockly/Jupyter 替换成普通资源聚合表。
- ❌ 不在学生端显示 `总控制台`。
- ❌ 不新增后端 schema 或课程包 schema。
- ❌ 不新增前端依赖或外链资源。
- ❌ 不做 landing page 式视觉爆点。

## 9. Responsive Behavior

**Breakpoints:**

| Name | Width | Key Changes |
|------|-------|-------------|
| Desktop | > 1100px | 左侧固定导航，实验详情为左大纲 + 右说明 |
| Tablet | 720-1100px | 大纲侧栏压缩，入口按钮保持可见 |
| Mobile | < 720px | 任务卡单列，实验大纲上置，按钮触摸高度不低于 44px |

**Touch Targets:** minimum 44px  
**Collapsing Strategy:** 课程任务中心单列；互动/图形页先显示实验选择，再显示入口卡；Jupyter/Blockly 保留工作区优先。

```css
@media (max-width: 720px) {
  .resources-outline-layout {
    grid-template-columns: 1fr;
  }
  .resources-student-entry-actions {
    flex-direction: column;
  }
  .resources-student-entry-actions .btn {
    width: 100%;
    min-height: 44px;
  }
}
```
