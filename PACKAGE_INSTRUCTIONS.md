# Jupyter Lab Client - Tauri应用打包说明

## 概述

本项目使用Tauri将Web应用打包为桌面应用程序，并通过集成Python虚拟环境和Flask API来提供Jupyter Lab功能。

## 项目结构

```
jupyter-tauri/
├── src/                          # 前端源码 (HTML/JS)
├── src-tauri/                    # Tauri后端 (Rust)
│   ├── src/
│   │   ├── main.rs              # Rust主程序
│   │   └── lib.rs               # Rust库
│   ├── resources/               # 资源文件
│   │   ├── venv/                # Python虚拟环境
│   │   │   └── Scripts/
│   │   │       ├── python.exe   # Python解释器
│   │   │       └── ...
│   │   └── web_app.py           # Flask API服务器
│   ├── Cargo.toml               # Rust依赖
│   └── tauri.conf.json          # Tauri配置
├── web_app.py                   # Flask API (开发用)
├── venv/                        # Python虚拟环境 (开发用)
├── package.json                 # NPM配置
└── config.json                  # 配置文件
```

## 打包步骤

### 1. 安装依赖

```bash
# 安装Node.js依赖
npm install

# 安装Rust (如果没有)
# 从 https://rustup.rs/ 下载安装
```

### 2. 构建Tauri应用

```bash
npm run tauri:build
```

这将创建一个完整的Tauri应用，包括：
- Windows: `.exe` 安装包在 `src-tauri/target/release/bundle/msi/`
- macOS: `.dmg` 镜像在 `src-tauri/target/release/bundle/dmg/`
- Linux: `.AppImage` 在 `src-tauri/target/release/bundle/appimage/`

### 3. 部署

构建完成后，您需要：

1. **复制启动器**:
   - `launch_jupyter.bat` (Windows)
   - `launch_jupyter.sh` (Linux/Mac)
   - `README_LAUNCHER.md`

2. **复制资源目录**:
   - 整个 `src-tauri/resources/` 目录

3. **目录结构应该是**:
   ```
   部署目录/
   ├── Jupyter-Lab-Client.exe        # Tauri应用 (Windows)
   ├── launch_jupyter.bat            # 启动器 (Windows)
   ├── resources/                    # Python环境
   │   ├── venv/
   │   └── web_app.py
   └── README_LAUNCHER.md
   ```

## 使用方式

### 启动应用

**Windows用户**:
```bash
# 双击或命令行运行
launch_jupyter.bat
```

**Linux/Mac用户**:
```bash
# 添加执行权限
chmod +x launch_jupyter.sh

# 运行
./launch_jupyter.sh
```

启动器会：
1. 检查Python环境和Flask API文件
2. 启动Flask API服务器 (端口5000)
3. 启动Tauri应用界面

### 访问服务

- **应用界面**: Tauri应用窗口
- **API服务器**: http://127.0.0.1:5000
- **Jupyter Lab**: http://127.0.0.1:8888/lab

### 停止服务

- 关闭Tauri应用窗口
- 或关闭启动器命令行窗口

## 架构说明

### 前端 (src/)
- HTML/CSS/JavaScript界面
- 通过Fetch API与Flask通信
- 提供启动/停止Jupyter Lab的按钮

### 后端 (src-tauri)
- Rust Tauri应用
- 运行WebView显示前端
- 通过shell命令启动Python进程
- 提供系统集成功能

### Python服务 (resources/)
- **web_app.py**: Flask API服务器
  - 提供REST API (/api/start, /api/stop, /api/status)
  - 启动/停止Jupyter Lab进程
  - 进程保护功能

- **venv/**: Python虚拟环境
  - 包含Python 3.13解释器
  - 预装Flask、JupyterLab等依赖
  - 所有依赖已固定版本

## 自定义配置

### 修改端口
编辑 `config.json`:
```json
{
  "python_executable": "resources/venv/Scripts/python.exe",
  "jupyter_port": 8888,        # Jupyter Lab端口
  "project_dir": ".",
  "use_notebook": false
}
```

### 修改应用信息
编辑 `src-tauri/tauri.conf.json`:
```json
{
  "productName": "Your App Name",
  "version": "1.0.0",
  "identifier": "com.yourcompany.app"
}
```

## 故障排除

### 1. 启动器报错"找不到Python"
确保 `resources/venv/Scripts/python.exe` 存在

### 2. Jupyter Lab无法启动
检查Flask API是否正常:
```bash
curl http://127.0.0.1:5000/api/status
```

### 3. 端口被占用
修改 `config.json` 中的端口号

### 4. Tauri构建失败
```bash
# 更新Tauri
npm install @tauri-apps/cli@latest

# 清理构建缓存
cargo clean
rm -rf src-tauri/target
```

## 开发者信息

### 开发模式运行
```bash
# 启动前端开发服务器
npm run dev

# 启动Tauri开发模式 (新终端)
npm run tauri:dev
```

### 调试
- 前端: 浏览器开发者工具
- Rust: `cargo log` 或 `println!`
- Python: 查看Flask API日志

## 许可证

本项目基于MIT许可证开源。

## 支持

如有问题，请查看:
- [Tauri文档](https://tauri.app/)
- [Flask文档](https://flask.palletsprojects.com/)
- [JupyterLab文档](https://jupyterlab.readthedocs.io/)
