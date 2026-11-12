# A2. Blockly UI 收敛方案

基于 A1 的问题清单，本方案定义当前版本应该长成什么样。

## 目标气质

从当前的"控制台感 + 特效感"改为：

- **清楚**：一眼看懂分类、积木、工作流
- **平静**：用颜色和结构说话，不靠高光和阴影
- **课堂化**：能在教室投影上看清，不是炫技的装饰
- **专业**：稳定可信的教学工具，不是"酷炫 AI demo"

## 改动清单（按优先级和文件）

### 第一轮：关键改动（必做，这轮 polish 的核心）

#### 改动 1：Block 本体 - 去装饰、改平实

**文件**：`renderer/styles/blockly-workspace.css`

**改动点**：

1. **`.blocklyPath`**（现行 1540-1541）
   - 现行：`stroke-width: 1.25px !important;`
   - 改为：`stroke-width: 1px !important;` 或删掉这行用 Blockly 默认
   - 理由：1.25px 描边太粗，显得"框架感"强

2. **`.blocklyDraggable .blocklyPath`**（现行 1543-1547）
   - 现行：有 `drop-shadow(0 1px 0 rgba(...)) drop-shadow(0 4px 9px rgba(...))`
   - 改为：删掉所有 drop-shadow，或保留最小 `drop-shadow(0 1px 0 rgba(...))`
   - 理由：多重阴影是"特效堆叠感"的主要来源

3. **`.blocklySelected > .blocklyPath`**（现行 1549-1555）
   - 现行：`stroke: ... stroke-width: 1.85px !important; filter: drop-shadow(...) drop-shadow(...)`
   - 改为：`stroke: color-mix(...) stroke-width: 1.5px` 或保留原有，删掉 drop-shadow
   - 理由：选中态用更粗的描边表示，不靠第三层阴影

#### 改动 2：Block 文本 - 扩大、加强对比

**文件**：`renderer/styles/blockly-workspace.css`

**改动点**：

1. **`.blocklyText`**（现行 1513-1522）
   - 现行：`font-size: 14px !important;`
   - 改为：`font-size: 16px !important;` 或 `15px`
   - 理由：14px 在课堂投影上显得太小；+1~2px 能大幅提升可读性

2. **`.blocklyDropDownText`**（现行 1524-1535）
   - 现行：`font-size: 12.8px !important;`
   - 改为：`font-size: 13px` 或 `14px`
   - 理由：下拉文本相比主文本要小一点，但不要小过 13px

#### 改动 3：Icon 系统 - 统一或简化

**文件**：`renderer/js/blockly/runtime-appearance.js`

**改动策略**（选 A 或 B）：

**方案 A（推荐）：删掉 3D icon，全用 SVG**
- 删除 `ICON_CLUSTER` 里所有 `makeCategoryImageIcon` 的 3D 图标调用
- 保留 `.spark`/`.layers`/`.media` 等，但用 SVG 重画（不需要现在做，后续可补）
- 优势：整体视觉统一，占用空间少
- 劣势：需要 SVG 美术工作（非阻塞，可后补）

**方案 B（保守）：3D icon 改用缩略版或去掉背景**
- 保留 3D 图标，但移除它们的边框/背景装饰
- 只显示图标本身，不显示彩色背景框
- 优势：能做，改动最小
- 劣势：3D + 线性 SVG 混用，仍然不够统一

**建议**：选 A，但如果时间紧，用 B 过渡。

#### 改动 4：工作区配色 - 统一背景、降低对比

**文件**：`renderer/styles/blockly-workspace.css`

**改动点**：

1. **Topbar**（现行 53-65）
   - 现行：`background: rgba(255, 255, 255, 0.86); border-bottom: 1px solid var(--line-soft); backdrop-filter: blur(10px);`
   - 改为：保留这个，它已经很白净了，不用动

2. **Canvas / 工作区主体**（现行 1017-1030 `#blocklyDiv`）
   - 现行：复杂的三层渐变背景
   - 改为：考虑简化为单一 `background: var(--bg)` 或 `#f9fafb`
   - 理由：网格已经足够提示"可交互区"，不需要背景渐变

3. **Sidebar**（现行 597-613 `.blockly-side-nav`）
   - 现行：自己有 border + border-radius + 独立背景渐变 + box-shadow
   - 改为：改成 `background: transparent` 或 `var(--panel-muted)`，去掉 border/shadow
   - 理由：Sidebar 应该是工作区的一部分，不是独立面板

#### 改动 5：选中态 - 结构强调，不是视觉强击

**文件**：`renderer/styles/blockly-workspace.css`

**改动点**：

1. **`.blockly-side-leaf.is-active`**（现行 853-873）
   - 现行：background gradient + 多层 box-shadow + border 变化
   - 改为：保留左侧彩色条纹，删掉大部分 box-shadow，改成更柔和的边框色变化
   - 理由：活跃态靠彩色竖条表示，不靠背景渐变和多层阴影

2. **`.blockly-side-section.has-active-child`**（现行 682-689）
   - 现行：background gradient + box-shadow
   - 改为：保留 border-color 变化，删掉 box-shadow，改成 `background: transparent`
   - 理由：父分类有子项时，用边界色变化表示，不靠背景

### 第二轮：中等优先级改动（可以后续做，不阻塞这轮）

- 分类名和 block count 的排版优化（更清楚的视觉分离）
- Flyout 的调整（确保和工作区背景对比度合理）
- 字段（输入框、下拉）的去装饰（可选）

---

## 实施顺序

1. **优先做改动 1**（Block 描边）和**改动 2**（文本扩大）
   - 这两个最直接改善课堂体验
   - 改动最小，风险最低
   - 可以立刻见效

2. **再做改动 3**（Icon 系统）
   - 选 A（删 3D）还是 B（简化 3D）需要决定
   - 如果选 B，改动很小
   - 如果选 A，需要美术补充（可日后补）

3. **再做改动 4 和 5**（配色 + 选中态）
   - 这些是整体感受提升，不阻塞功能
   - 改动后做测试，确保没有可交互性问题

---

## 验收标准

改动完成后：

- ✓ 课堂投影上可以清楚看到 block 文本
- ✓ 学生能快速扫读分类和积木
- ✓ 整体不显得"特效很多"，更显得"很清楚"
- ✓ 选中/hover 态是"结构强调"而非"视觉强击"
- ✓ Icon 系统（无论 A 还是B）风格统一不混乱
- ✓ `npm run test:blockly-runtime` 全部通过
- ✓ Blockly 功能完全保留，无破损

---

## 非改动

- 不改 block 功能逻辑
- 不改任务系统
- 不改 runtime 执行
- 不改 Python 生成

