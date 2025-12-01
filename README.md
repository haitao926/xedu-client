# Xedu Client

专业的 Jupyter Notebook 桌面管理工具 - Electron版

## 🚀 快速开始

### 开发环境运行

```bash
# 开发模式（Electron + Vite热更新）
npm run electron:dev

# 仅运行Electron
npm run electron

# 前端构建
npm run build

# Electron 打包
npm run electron:build

# 使用完整构建脚本
./build.sh        # Linux/Mac
build.bat         # Windows
```

## 📁 项目结构

```
xedu-client/
├── 📄 核心文件
│   ├── backend_main.py         # 后端入口（启动 Flask API）
│   ├── electron-main.cjs       # Electron 主进程
│   └── package.json            # 项目配置
├── 📁 重要目录
│   ├── frontend-dist/          # 构建后的前端文件
│   ├── src/                    # 源代码
│   │   ├── index.html          # 主页面
│   │   ├── styles/             # 样式文件
│   │   └── backend/            # Python后端代码
│   ├── dist-installer/         # Electron打包输出
│   └── config/                 # 配置文件
```

## ✨ 主要功能

- 🎯 **Jupyter 管理**: 启动、停止、重启 Jupyter Notebook
- 📂 **项目路径**: 支持拖拽和手动选择项目目录
- 🤖 **AI 助手**: 集成 Kimi AI 视觉助手功能
- ⚙️ **系统设置**: Python 环境配置和 AI API 设置
- 📊 **实时监控**: 显示 Jupyter 运行状态和日志

## 🔧 技术栈

- **前端**: HTML5 + CSS3 + JavaScript (Vanilla)
- **后端**: Python Flask API
- **桌面应用**: Electron
- **构建工具**: Vite
- **AI 集成**: OpenAI Compatible API

## 📦 环境要求

- Node.js >= 16
- Python >= 3.8
- npm 或 yarn

## 📋 最近更新

- ✅ 从 Tauri 迁移到 Electron
- ✅ 实现现代化侧边栏UI
- ✅ 优化配色和排版
- ✅ 添加平滑动画和交互效果
- ✅ 修复项目路径输入框自动填充问题
- ✅ 修复 Jupyter 启动路径配置问题
- ✅ 实现真实 AI API 调用功能

## 📄 许可证

本项目基于 MIT 许可证开源。

---

**开发团队**: XEdu Team
**最后更新**: 2025-11-24
