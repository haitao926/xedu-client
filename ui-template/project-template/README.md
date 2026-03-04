# 项目模板（UI 一致性骨架）

这是一个可直接复制的前端 UI 模板，用于不同项目保持相同的视觉语言与排版层级。

## 包含内容
- 左上角 Logo 区域（Logo Mark + Logo Type）
- 侧边栏导航结构
- 顶部标题区域
- 主内容区示例卡片与按钮
- 统一的 `typo-*` 与 `icon-*` 规范

## 使用方法
1) 拷贝整个 `project-template` 目录到新项目中
2) 替换 `src/assets/icon.png`（供 `logo-mark.svg` 引用）与 `src/assets/logo.png`
3) 如需直接运行：执行 `npm install` 后 `npm run dev`
4) 保持 `src/style.css` 与 `tailwind.config.js` 不变，避免新增散乱 `text-*`

## 说明
模板仅提供结构与样式约定，不依赖具体业务逻辑。
