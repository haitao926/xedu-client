# Jupyter Tauri应用 - 完整打包指南

## 📦 打包方案说明

由于Tauri是基于WebView的桌面应用框架，而我们的Flask API是Python应用，我们需要采用**分离式架构**来集成两者。

### 架构图

```
┌─────────────────────────────────────────────┐
│           用户双击 launch_jupyter.bat         │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│        1. 启动Python Flask API进程           │
│           (resources/venv/python.exe)        │
│           端口: 5000                          │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│        2. 启动Tauri桌面应用                   │
│        (Jupyter-Lab-Client.exe)              │
│        - 显示Web界面 (src/index.html)        │
│        - 通过AJAX调用Flask API               │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│        3. 浏览器中访问Jupyter Lab             │
│           http://127.0.0.1:8888/lab          │
└─────────────────────────────────────────────┘
```

## 📁 完整项目结构

```
jupyter-tauri/                     # 项目根目录
│
├── src/                           # 前端源码
│   ├── index.html                # 主界面
│   └── main.js                   # 前端逻辑
│
├── src-tauri/                     # Tauri后端
│   ├── src/
│   │   ├── main.rs               # Rust入口
│   │   └── lib.rs                # Rust逻辑
│   ├── resources/                # ★ 打包资源
│   │   ├── venv/                 # ★ Python环境
│   │   │   └── Scripts/
│   │   │       ├── python.exe    # ★ Python 3.13
│   │   │       └── pip.exe
│   │   └── web_app.py            # ★ Flask API
│   ├── Cargo.toml
│   └── tauri.conf.json           # Tauri配置
│       └── bundle.resources      # 包含 resources/**
│
├── venv/                          # 开发用Python环境
├── web_app.py                     # 开发用Flask API
├── config.json                    # 配置文件
├── package.json                   # NPM配置
├── launch_jupyter.bat             # ★ Windows启动器
├── launch_jupyter.sh              # ★ Linux/Mac启动器
└── PACKAGE_INSTRUCTIONS.md        # ★ 打包说明
```

★ 标记的文件是部署必需的

## 🚀 打包流程

### 步骤 1: 准备环境

```bash
# 安装Node.js依赖
npm install

# 确保Rust已安装
# 从 https://rustup.rs/ 下载安装
```

### 步骤 2: 构建Tauri应用

```bash
npm run tauri:build
```

构建结果:
- **Windows**: `src-tauri/target/release/bundle/msi/Jupyter Lab Client_1.0.0_x64_en-US.msi`
- **macOS**: `src-tauri/target/release/bundle/dmg/Jupyter Lab Client_1.0.0_x64.dmg`
- **Linux**: `src-tauri/target/release/bundle/appimage/Jupyter-Lab-Client_1.0.0_amd64.AppImage`

### 步骤 3: 创建部署包

#### Windows部署
```bash
# 创建部署目录
mkdir jupyter-tauri-deploy
cd jupyter-tauri-deploy

# 1. 复制Tauri应用
copy "..\src-tauri\target\release\bundle\msi\Jupyter Lab Client_1.0.0_x64_en-US.msi" .
# 或复制exe (如果构建了exe)
copy "..\src-tauri\target\release\Jupyter-Lab-Client.exe" .

# 2. 复制启动器
copy "..\launch_jupyter.bat" .

# 3. 复制说明文档
copy "..\PACKAGE_INSTRUCTIONS.md" .

# 4. 复制资源目录 (重要!)
xcopy "..\src-tauri\resources" /E /I
```

#### Linux/Mac部署
```bash
# 创建部署目录
mkdir jupyter-tauri-deploy
cd jupyter-tauri-deploy

# 1. 复制Tauri应用
cp "../src-tauri/target/release/bundle/appimage/Jupyter-Lab-Client_1.0.0_amd64.AppImage" .

# 2. 复制启动器
cp "../launch_jupyter.sh" .
chmod +x launch_jupyter.sh

# 3. 复制说明文档
cp "../PACKAGE_INSTRUCTIONS.md" .

# 4. 复制资源目录
cp -r "../src-tauri/resources" .
```

### 步骤 4: 部署包结构

```
jupyter-tauri-deploy/              # 完整部署包
│
├── Jupyter-Lab-Client.exe         # Tauri应用 (Windows)
├── Jupyter-Lab-Client.AppImage    # Tauri应用 (Linux)
├── launch_jupyter.bat             # Windows启动器
├── launch_jupyter.sh              # Linux/Mac启动器
├── PACKAGE_INSTRUCTIONS.md        # 用户说明
│
└── resources/                     # Python环境
    ├── venv/
    │   ├── Scripts/
    │   │   ├── python.exe         # Python 3.13
    │   │   └── pip.exe
    │   └── Lib/
    │       └── site-packages/     # Flask, JupyterLab等
    └── web_app.py                 # Flask API
```

## 💻 使用方法

### 1. 安装 (Windows)

```bash
# 方法1: 安装MSI
msiexec /i "Jupyter Lab Client_1.0.0_x64_en-US.msi"

# 方法2: 直接使用exe
Jupyter-Lab-Client.exe
```

### 2. 启动 (所有平台)

```bash
# Windows
双击 launch_jupyter.bat

# Linux/Mac
./launch_jupyter.sh
```

启动器会自动:
1. 验证Python环境
2. 启动Flask API (后台)
3. 启动Tauri应用
4. 显示操作说明

### 3. 访问服务

- **应用界面**: Tauri桌面应用窗口
- **API状态**: http://127.0.0.1:5000/api/status
- **Jupyter Lab**: http://127.0.0.1:8888/lab

### 4. 停止服务

- 关闭Tauri应用窗口
- 或关闭启动器命令行窗口

## 🔧 技术实现细节

### 1. Python环境集成

- **Python版本**: 3.13.6
- **虚拟环境**: venv
- **依赖包**:
  - Flask 3.1.2
  - Flask-CORS 6.0.1
  - JupyterLab 4.4.10
  - 所有相关依赖

### 2. Flask API功能

```python
# 核心端点
GET  /api/health       # 健康检查
GET  /api/status       # 获取Jupyter状态
POST /api/start        # 启动Jupyter
POST /api/stop         # 停止Jupyter
POST /api/restart      # 重启Jupyter
```

### 3. 进程管理

- Flask API通过`subprocess.Popen()`启动Jupyter
- 支持进程保护 (5秒检查间隔)
- 最大重启3次
- 优雅关闭 (SIGTERM → SIGKILL)

### 4. 跨域支持

- CORS已配置允许所有来源
- 前端通过AJAX调用API
- 安全策略允许localhost连接

## 📊 文件大小估算

- **Python环境 (venv)**: ~150MB
  - Python 3.13: ~50MB
  - JupyterLab: ~80MB
  - Flask及依赖: ~20MB

- **Tauri应用**: ~20MB
  - Rust runtime: ~15MB
  - Web资源: ~5MB

- **总大小**: ~170MB

## ⚠️ 注意事项

### 1. 端口占用
- Flask API: 5000
- Jupyter Lab: 8888
- 确保这些端口未被占用

### 2. 权限问题
- Linux/Mac可能需要:
  ```bash
  chmod +x launch_jupyter.sh
  ```

### 3. 防病毒软件
- 部分防病毒软件可能误报Python可执行文件
- 将部署目录添加到白名单

### 4. 系统要求
- Windows 10/11
- macOS 10.15+
- Ubuntu 18.04+
- 或其他现代Linux发行版

## 🔄 更新流程

### 更新Python依赖
```bash
# 激活虚拟环境
venv\Scripts\activate (Windows)
source venv/bin/activate (Linux/Mac)

# 安装新包
pip install package_name

# 重新构建Tauri
npm run tauri:build
```

### 更新前端
```bash
# 修改 src/index.html 或 src/main.js
# 重新构建
npm run tauri:build
```

## 🐛 故障排除

### 1. 启动器无法启动
```bash
# 手动检查
cd jupyter-tauri-deploy
resources\venv\Scripts\python.exe resources\web_app.py
```

### 2. 权限拒绝
```bash
# Linux/Mac
chmod +x launch_jupyter.sh
chmod +x Jupyter-Lab-Client.AppImage
```

### 3. 端口被占用
```bash
# 查找占用进程
netstat -ano | findstr :5000
netstat -ano | findstr :8888

# 终止进程
taskkill /PID <PID> /F
```

## 📈 性能优化

### 1. 减小体积
- 排除不必要的Python包
- 使用UPX压缩
- 精简前端资源

### 2. 启动速度
- 预编译Python字节码
- 优化Flask启动时间
- 延迟加载非必要组件

### 3. 内存使用
- 限制Jupyter内核数量
- 及时清理临时文件
- 优化Tauri WebView设置

## 🎯 总结

通过这种分离式架构，我们成功将:
- ✅ Python Flask API
- ✅ JupyterLab环境
- ✅ Tauri桌面界面

**统一打包为单个部署包**，用户只需双击启动器即可使用。

优势:
- 独立运行，无需安装Python
- 跨平台支持 (Windows/macOS/Linux)
- 易于分发和部署
- 保留完整Jupyter功能

缺点:
- 文件体积较大 (~170MB)
- 需要手动复制资源目录
- 启动时间略长 (3-5秒)

但对于桌面应用来说，这是可以接受的成本。
