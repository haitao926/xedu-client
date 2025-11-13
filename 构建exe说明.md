# 构建EXE文件 - 完整指南

## 现状说明

我们已经完成了所有准备工作：
- ✅ Python虚拟环境已创建 (213MB)
- ✅ Flask API已配置
- ✅ 进程保护功能已实现
- ✅ Tauri配置已完成
- ✅ 启动器脚本已创建
- ✅ 打包脚本已编写

但需要Rust环境来构建Tauri应用。

## 方案1: 使用Tauri构建 (推荐)

### 前提条件
需要安装以下工具：

1. **Rust** (必需)
   - 下载: https://rustup.rs/
   - 安装后重启终端

2. **Node.js** (已有)
   ```bash
   node --version  # 应 >= 16
   ```

3. **Tauri CLI** (已安装)
   ```bash
   npm install -g @tauri-apps/cli
   ```

### 构建命令
```bash
# 方法1: 使用我们的自动化脚本
python package_for_distribution.py

# 方法2: 手动构建
npm run tauri:build
```

### 输出位置
```
Windows:
- src-tauri/target/release/Jupyter-Lab-Client.exe
- src-tauri/target/release/bundle/msi/Jupyter Lab Client_1.0.0_x64_en-US.msi

macOS:
- src-tauri/target/release/bundle/dmg/Jupyter Lab Client_1.0.0_x64.dmg

Linux:
- src-tauri/target/release/bundle/appimage/Jupyter-Lab-Client_1.0.0_amd64.AppImage
```

## 方案2: 使用PyInstaller打包Python应用 (备选)

如果Tauri构建困难，可以用PyInstaller直接打包Flask应用：

### 步骤
```bash
# 安装PyInstaller
pip install pyinstaller

# 打包
pyinstaller --onefile --windowed web_app.py

# 输出在 dist/web_app.exe
```

### 优缺点
✅ 优点:
- 简单快速
- 无需Rust

❌ 缺点:
- 只有命令行界面
- 没有桌面应用体验
- 需要手动启动浏览器

## 方案3: 使用Auto-py-to-exe (图形化工具)

```bash
# 安装
pip install auto-py-to-exe

# 启动图形界面
auto-py-to-exe
```

然后在界面中选择:
- Script Location: web_app.py
- Onefile: ✓
- Console Window: ☑ (勾选)
- Additional Files: 包含 config.json

## 推荐操作

### 立即可用 (无需构建)

当前项目已经可以直接使用：

```bash
# 启动Flask API
venv/Scripts/python.exe web_app.py

# 访问
# http://127.0.0.1:5000 - API
# http://127.0.0.1:8888/lab - Jupyter Lab
```

### 构建Tauri应用

要在Windows上构建完整的桌面应用:

1. **安装Rust**
   - 访问 https://rustup.rs/
   - 下载并安装
   - 重启命令行

2. **构建**
   ```bash
   # 清理旧构建 (如果需要)
   cd src-tauri
   cargo clean

   # 返回项目根目录
   cd ..

   # 构建
   npm run tauri:build
   ```

3. **创建部署包**
   ```bash
   python package_for_distribution.py
   ```

## 部署包内容

无论使用哪种方案，最终的部署包应包含:

```
jupyter-tauri-deploy/
├── Jupyter-Lab-Client.exe          # Tauri应用
├── launch_jupyter.bat               # 启动器
├── resources/                       # Python环境
│   ├── venv/
│   └── web_app.py
├── config.json                      # 配置文件
└── README.md                        # 使用说明
```

## 用户使用方式

用户解压后:
1. 双击 `launch_jupyter.bat`
2. 等待自动启动
3. 访问 http://127.0.0.1:8888/lab

## 文件大小估算

- **Python环境**: 213 MB
- **Tauri应用**: ~20 MB
- **总部署包**: ~240 MB

## 故障排除

### Rust安装失败
```bash
# Windows手动安装
# 下载: https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe
# 运行 rustup-init.exe
```

### 构建失败
```bash
# 更新Rust
rustup update

# 清理缓存
cargo clean
rm -rf node_modules
npm install
```

### Python模块缺失
```bash
# 激活虚拟环境
venv\Scripts\activate

# 重新安装依赖
pip install -r requirements.txt
```

## 总结

### 快速开始 (立即可用)
```bash
# 当前就可以运行
venv\Scripts\python.exe web_app.py
```

### 完整打包 (需要Rust)
```bash
# 1. 安装Rust
# 2. 构建
npm run tauri:build
# 3. 创建部署包
python package_for_distribution.py
```

所有文件已准备就绪，根据你的环境选择合适的方案！
