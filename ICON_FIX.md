# 图标问题修复方案

## 问题
- Windows 快捷方式显示 Electron 原生图标
- 开发环境下任务栏显示 Electron 原生图标

## 解决方案

### 1. 修改 electron/main/main.js

```javascript
function createWindow() {
    const isDev = !app.isPackaged;
    
    // 根据平台选择正确的图标格式
    let iconPath;
    if (isDev) {
        if (process.platform === 'win32') {
            iconPath = path.join(__dirname, '../../resources/xedu-logo.ico');
        } else if (process.platform === 'darwin') {
            iconPath = path.join(__dirname, '../../resources/xedu-logo.icns');
        } else {
            iconPath = path.join(__dirname, '../../resources/xedu-logo.png');
        }
    } else {
        // 生产环境
        if (process.platform === 'win32') {
            iconPath = path.join(process.resourcesPath, 'app.ico');
        } else if (process.platform === 'darwin') {
            iconPath = path.join(process.resourcesPath, 'app.icns');
        } else {
            iconPath = path.join(process.resourcesPath, 'app.png');
        }
    }

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: iconPath,
        // ... 其他配置
    });
}
```

### 2. 确保 package.json 配置正确

```json
{
  "build": {
    "win": {
      "icon": "resources/xedu-logo.ico",
      "target": ["nsis"]
    },
    "nsis": {
      "installerIcon": "resources/xedu-logo.ico",
      "uninstallerIcon": "resources/xedu-logo.ico",
      "installerHeaderIcon": "resources/xedu-logo.ico"
    },
    "mac": {
      "icon": "resources/xedu-logo.icns"
    }
  }
}
```

### 3. 添加 PNG 图标（可选，用于 Linux）

如果需要支持 Linux，在 resources/ 目录下添加 xedu-logo.png（256x256 或 512x512）

## 测试

1. **开发环境测试**：
   ```bash
   npm run electron
   ```
   检查任务栏图标是否正确

2. **生产环境测试**：
   打包后安装，检查：
   - 桌面快捷方式图标
   - 开始菜单图标
   - 任务栏图标
   - 程序列表图标

## 注意事项

- Windows 需要 .ico 格式（推荐 256x256）
- macOS 需要 .icns 格式
- 图标文件必须存在于 resources/ 目录
- 修改后需要重新打包才能看到效果
