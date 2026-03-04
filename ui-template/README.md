# UI 设计模板（跨项目一致性）

本目录用于跨项目复用同一套 UI 设计语言，保证不同项目在视觉、排版、组件行为上保持一致。

## 1. 目标与范围
- 目标：统一字体、字号、颜色、组件风格、动效与交互状态。
- 适用范围：所有前端页面与组件（含主流程页面、管理页面、弹窗、空状态、列表、表格等）。

## 1.1 项目模板目录
- `docs/ui-template/project-template/`：可直接复制的 UI 骨架，包含左上角 Logo、侧边栏、头部与示例卡片。

## 2. 设计原则（必须遵守）
1) 同功能同字体：同一种信息层级必须使用同一个 `typo-*` 类。
2) 轻层级：一页内字号不宜过多，正文只允许 `text-sm / text-xs` 两档。
3) 苹果系字体优先：统一 Apple 系字体栈，跨中英文一致。
4) 玻璃质感 + 柔和阴影：使用半透明白底、模糊、轻阴影建立层次。
5) 渐变强调：主操作使用蓝紫橙渐变，弱操作使用柔和边框。

## 3. 设计系统（Design System）

### 3.1 字体与排版
**字体栈（来自 `frontend/tailwind.config.js`）**
- sans：-apple-system / BlinkMacSystemFont / "SF Pro Text" / "SF Pro Display" / "SF Pro Rounded" / system-ui / PingFang SC / Hiragino Sans / Heiti / Helvetica Neue / Microsoft YaHei / Segoe UI / Roboto / sans-serif
- mono："SF Mono" / "JetBrains Mono" / Menlo / Monaco / Consolas / monospace

**基础字号（来自 `frontend/tailwind.config.js`）**
- xs = 14px
- sm = 16px
- base = 18px（正文偏大，仅保留给系统级，如需必须说明）
- lg = 20px
- xl = 24px
- 2xl = 30px
- 3xl = 36px

**统一排版类（来自 `frontend/src/style.css`）**
- 标题：`typo-page-title`、`typo-card-title`、`typo-empty-title`
- 副标题：`typo-page-subtitle`
- 分区标题：`typo-section-title`
- 状态标题：`typo-status-title`
- 正文：`typo-body`
- 提示词正文：`typo-prompt`
- 标签：`typo-label`、`typo-label-compact`、`typo-inline-label`
- 说明/注释：`typo-caption-compact`
- 徽章：`typo-badge`
- 按钮：`typo-button`、`typo-button-compact`
- 输入：`typo-input`、`typo-input-mono`
- 表头：`typo-table-head`

> 规则：页面内严禁直接使用 `text-sm/text-xs` 等原子字号，必须通过 `typo-*` 控制层级。

### 3.2 图标字号（统一 emoji / icon 尺寸）
- `icon-sm`：text-xl
- `icon-md`：text-2xl
- `icon-lg`：text-4xl
- `icon-hero`：text-6xl

> 规则：所有 emoji/icon 只允许使用 `icon-*`。

### 3.3 颜色系统（使用约定）
- **主色（Primary）**：Indigo 500-600
- **辅助（Secondary）**：Purple 500-600
- **强调（Accent）**：Orange 400-500
- **中性（Neutral）**：Slate 50-900
- **成功（Success）**：Green 500
- **警告（Warning）**：Orange 500
- **危险（Danger）**：Red 500

渐变主按钮建议：`from-blue-500 via-purple-500 to-orange-400`。

### 3.4 玻璃质感与层次
- 背景层：`bg-white/60~90` + `backdrop-blur-xl` + `border-white/50~60`
- 轻阴影：`shadow-sm` / `shadow-lg` / `shadow-2xl`
- 强调阴影：`shadow-indigo-500/20~40`

### 3.5 圆角与空间
- 常用圆角：`rounded-xl` / `rounded-2xl` / `rounded-[24px]` / `rounded-[32px]`
- 页面网格：`lg:grid-cols-12`，左侧 4 栏、右侧 8 栏，`gap-8`
- 主要留白：`p-6 / p-8 / p-10`

### 3.6 动效与状态
- 动效类：`animate-fade-in` / `animate-slide-up` / `animate-scale-in` / `animate-shimmer`
- Hover：轻微浮起 + 阴影增强
- Active：scale 轻缩（0.95）
- Disabled：`opacity-50` + `cursor-not-allowed`
- Focus：`focus:ring-indigo-500/10` + `focus:border-indigo-500`

## 4. 组件样式规范

### 4.1 按钮
- 主按钮：**统一使用“生成音频”按钮样式**（蓝紫橙渐变 + 轻浮起 + 阴影）
- 次按钮：白底边框 + `typo-button` 或 `typo-button-compact`
- 文字按钮：`typo-button-compact` + hover 色强调

### 4.2 输入
- 常规输入：`typo-input` + 圆角 + 轻边框
- API/Key/URL：`typo-input-mono`

### 4.3 卡片
- `bg-white/80` + `backdrop-blur-xl` + `border-white/60` + `rounded-[24px]`

### 4.4 空状态
- 标题：`typo-empty-title`
- 描述：`typo-empty-desc`
- Icon：`icon-lg` 或 `icon-hero`

### 4.5 表格
- 表头：`typo-table-head`
- 单元格：`typo-body` / `typo-caption-compact`（根据密度）

## 5. 使用方式（跨项目复制）
1) 复制字体栈与字号扩展：`frontend/tailwind.config.js`
2) 复制 `typo-*` 与 `icon-*` 类：`frontend/src/style.css`
3) 页面级别全部用 `typo-*` 和 `icon-*`；禁止出现新的 `text-*`
4) 新增层级时，必须先扩展 `style.css`，再使用

## 6. 一致性检查清单
- 是否出现了新的 `text-*`？（只允许在 `style.css` 中定义）
- 同层级文本是否使用相同 `typo-*`？
- emoji/icon 是否使用 `icon-*`？
- 主色、辅色、警告、危险是否遵循约定色阶？
- 玻璃质感卡片是否统一圆角与阴影？

## 7. 示例片段
```vue
<div class="bg-white/80 backdrop-blur-xl border border-white/60 rounded-[24px] p-6 shadow-sm">
  <h3 class="typo-section-title mb-2">Section Title</h3>
  <p class="typo-body mb-4">这是一段正文内容。</p>
  <button class="px-4 py-2 rounded-xl typo-button text-white bg-gradient-to-r from-blue-500 via-purple-500 to-orange-400 shadow-lg">
    Primary Action
  </button>
</div>
```
