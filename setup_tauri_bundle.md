# 使用Tauri打包Jupyter应用

## 方案说明

由于Flask API是Python应用，我们需要将Python环境和应用集成到Tauri bundle中。

### 方法：在Tauri中启动Python进程

1. 将 `venv` 目录和 `web_app.py` 复制到 `src-tauri/resources`
2. 在Tauri的Rust代码中，添加启动Python进程的逻辑
3. 当应用启动时，自动启动Flask API
4. 当应用关闭时，关闭Python进程

## 实施步骤

### 步骤1: 创建resources目录并复制文件
```bash
mkdir -p src-tauri/resources
cp -r venv src-tauri/resources/
cp web_app.py src-tauri/resources/
```

### 步骤2: 修改tauri.conf.json
添加resources到bundle中

### 步骤3: 修改main.rs
添加启动Python进程的Rust代码

### 步骤4: 构建
```bash
npm run tauri:build
```

## 重要说明

- Tauri bundle会包含所有resources目录下的文件
- Python进程将在应用启动时自动启动
- Flask API将在localhost:5000运行
- Jupyter Lab将在localhost:8888运行
- 当用户关闭Tauri应用时，Python进程也会被终止
