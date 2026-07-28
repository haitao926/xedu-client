# XEdu Client 教师安装说明

适用版本：`2.0.0`
发布日期：`2026-07-21`
本次分发类型：外置 Python 版（安装包不携带 Python 环境和模型）
主线说明：Scratch 是教师交付和课堂首课的唯一图形化编程主线；旧 Blockly 课程只显示不支持提示。

## 1. 先确认你拿到的是哪个包

| 平台 | 建议文件 |
|---|---|
| Windows x64 | `XEdu Client-2.0.0-external-python-x64.exe` |
| Windows 32 位 | `XEdu Client-2.0.0-external-python-win32.exe` |
| macOS Apple Silicon | `XEdu Client-2.0.0-external-python-arm64.zip` 或 `.dmg` |

只使用正式发布包。不要把源码目录当成教师安装包。
当前官方发布覆盖 Windows x64、Windows 32 位和 macOS Apple Silicon，没有 Linux 或 Intel macOS 安装包。

## 2. 安装前检查

| 项目 | 说明 |
|---|---|
| 操作系统 | Windows 10 / 11 x64 或 32 位，macOS Apple Silicon |
| 内存 | 4 GB 可运行，8 GB 或以上更适合课堂 |
| 磁盘 | Windows 安装后约 0.5 GB，macOS 安装后约 0.4 GB；还要为课程、缓存和日志预留额外空间 |
| Python | 支持 Python 3.8 或更高版本；发布包不内置 Python 环境，首次启动会检查并补齐后端基础依赖 |
| 网络 | 首次导入云端课程、同步更新和拉取远端资源需要联网；本地已导入课程可以离线运行 |

建议使用独立虚拟环境。所选环境需要安装 Jupyter、`xedu-python>=2.0.0` 和课程所需依赖；项目默认准备的便携环境仍为已验收的 `2.0.0`。不要把 Python 环境复制到应用安装目录。

32 位 Windows 必须选择 32 位 Python 解释器，并使用支持 win32 的依赖版本。当前固定的 `onnxruntime==1.27.0` 不提供 win32 wheel；32 位环境如需 XEduHub AI 能力，应由管理员提前验证兼容版本，不能直接照搬 x64 依赖清单。

## 3. Windows 安装

1. Windows x64 双击 `XEdu Client-2.0.0-external-python-x64.exe`；32 位 Windows 双击 `XEdu Client-2.0.0-external-python-win32.exe`。
2. 按安装向导完成安装。
3. 从开始菜单或桌面快捷方式启动应用。
4. 首次启动后，等待后端和页面加载完成，再开始导入课程。

如果首次启动提示选择 Python，打开“Python”设置并选择本机解释器。Windows x64 或 32 位都选择虚拟环境中的 `Scripts\\python.exe`，macOS 选择虚拟环境中的 `bin/python3` 或 `bin/python`。按“选择 Python → 确认使用 → 测试环境 → 保存设置”的顺序操作。`xedu-python` 版本至少为 `2.0.0`；如果探针提示兼容性问题，再点击“修复兼容性”，修复完成后重新测试。

如果学校电脑有终端安全软件，请先用一台试点机器完成安装，再批量部署。

## 4. macOS 安装

1. 解压 `XEdu Client-2.0.0-external-python-arm64.zip`，或打开对应 `.dmg`。
2. 双击 `XEdu Client.app`。
3. 按系统提示完成首次打开。
4. 首次启动后，等待应用主界面完全出现，再开始导入课程。

如果首次启动提示选择 Python，打开“Python”设置，选择虚拟环境中的 `bin/python3` 或 `bin/python`。按“选择 Python → 确认使用 → 测试环境 → 保存设置”的顺序操作；`xedu-python` 版本至少为 `2.0.0`，兼容性提示按上面的“修复兼容性”流程处理。

## 5. 安装后要记住的两件事

1. 应用会把日志和配置写到当前用户的数据目录，不会写进安装目录。
2. 如果以后要升级，保留课程目录和用户数据目录即可，升级不会要求你重新整理课程。
3. Python 选择结果保存在用户配置目录；更换电脑后需要在新电脑重新选择本机环境。
