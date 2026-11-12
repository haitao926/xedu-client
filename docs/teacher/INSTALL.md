# XEdu Client 教师安装说明

适用版本：`2.1.6`
本次分发类型：内置 Python 版（安装包携带便携 Python 环境，版本 `3.12.8`）
主线说明：Scratch 是教师交付和课堂首课的唯一图形化编程主线；旧 Blockly 课程只显示不支持提示。

## 1. 先确认你拿到的是哪个包

| 平台 | 建议文件 |
|---|---|
| Windows x64 | 2.1.6 NSIS 安装程序（setup `.exe`） |
| macOS Apple Silicon | 2.1.6 arm64 `.dmg` 安装镜像 |

只使用正式发布包。不要把源码目录当成教师安装包。
当前官方发布覆盖 Windows x64 和 macOS Apple Silicon，安装包内置 Python 运行时。不再提供“外置 Python / 不携带 Python”安装包。

源码与发布以 [haitao926/xedu-client](https://github.com/haitao926/xedu-client) 为准，`main` 是唯一长期维护分支。自行构建请参阅 [开发与运行](../../README.md#开发与运行)：Windows 使用 `npm run build:installer:win`，macOS Apple Silicon 使用 `npm run build:installer:mac`；当前版本产物统一位于 `output/releases/2.1.6/`。

## 2. 安装前检查

| 项目 | 说明 |
|---|---|
| 操作系统 | Windows 10 / 11 x64，macOS Apple Silicon |
| 内存 | 4 GB 可运行，8 GB 或以上更适合课堂 |
| 磁盘 | 为应用、课程、缓存和日志预留空间 |
| Python | 发布包已内置 Python 3.12.8，学生首次启动无需另装或选择解释器 |
| 网络 | 首次导入云端课程、同步更新和拉取远端资源需要联网；本地已导入课程可以离线运行 |

教师如需更换本机解释器，请先登录教师模式，再打开“设置”。学生界面不提供设置入口。

## 3. Windows 安装

1. 双击 Windows x64 安装包完成安装。
2. 从开始菜单或桌面快捷方式启动应用。
3. 首次启动后，等待后端和页面加载完成，再开始导入课程。

如果学校电脑有终端安全软件，请先用一台试点机器完成安装，再批量部署。

## 4. macOS 安装

1. 打开 arm64 `.dmg`，将 `XEdu Client.app` 拖入“应用程序”。
2. 从“应用程序”双击 `XEdu Client.app`。
3. 按系统提示完成首次打开。
4. 首次启动后，等待应用主界面完全出现，再开始导入课程。

## 5. 安装后要记住的事

1. 应用会把日志和配置写到当前用户的数据目录，不会写进安装目录。
2. 如果以后要升级，保留课程目录和用户数据目录即可，升级不会要求你重新整理课程。
3. 内置 Python 随安装包提供；只有教师可以在设置中调整高级环境选项。

教师需要独立环境时，可登录教师模式，在“Python”设置中检测或更换本机 Python 3.8+ 解释器，安装 `xedu-python>=2.0.0` 及课程所需依赖，再按“选择、确认、测试、保存”完成检测。具体课堂流程见 [快速开始](QUICKSTART.md)。
