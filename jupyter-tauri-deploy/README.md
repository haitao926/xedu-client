# Jupyter Lab Client - 桌面应用

## 📦 包含内容

- **app.exe** - Tauri桌面应用主程序 (11 MB)
- **resources/** - Python虚拟环境 (包含Jupyter Lab 4.4.10)
- **web_app.py** - Flask API服务
- **config.json** - 配置文件
- **launch_jupyter.bat** - Windows启动器

## 🚀 使用方法

### 方式1: 使用启动器 (推荐)
1. 双击 `launch_jupyter.bat`
2. 等待应用启动
3. 浏览器将自动打开 Jupyter Lab

### 方式2: 直接运行
1. 双击 `app.exe`
2. 访问 http://127.0.0.1:8888/lab

## ✨ 功能特性

- ✅ 桌面应用界面 (Tauri)
- ✅ Jupyter Lab 4.4.10
- ✅ 进程保护 (自动重启)
- ✅ 无需安装Python
- ✅ 相对路径配置

## 🔧 技术栈

- **前端**: Tauri 2.9.2 + Web
- **后端**: Rust
- **Python环境**: 3.13.6 (虚拟环境)
- **Jupyter**: Lab 4.4.10
- **API**: Flask

## 📁 目录结构

```
jupyter-tauri-deploy/
├── app.exe              # 主程序
├── launch_jupyter.bat   # 启动器
├── README.md           # 说明文档
├── resources/          # Python环境
│   ├── python.exe
│   ├── venv/
│   ├── web_app.py
│   └── config.json
```

## 🌐 访问地址

- **Jupyter Lab**: http://127.0.0.1:8888/lab
- **API服务**: http://127.0.0.1:5000

## ⚠️ 注意事项

1. 首次启动可能需要几秒钟
2. 确保端口8888和5000未被占用
3. Windows Defender可能需要允许应用运行

## 🔄 进程保护

应用包含进程保护功能：
- 自动检测Jupyter Lab状态
- 异常退出时自动重启
- 最多重启3次

## 📞 支持

如有问题，请检查：
1. 防火墙设置
2. 端口占用情况
3. 系统兼容性 (Windows 10/11)

---
构建时间: 2025-11-10
版本: 1.0.0
