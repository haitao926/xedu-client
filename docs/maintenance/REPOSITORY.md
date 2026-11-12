# 仓库维护约定

## 主线与发布

- 唯一权威远端是 `origin`：https://github.com/haitao926/xedu-client 。
- `main` 是唯一长期维护分支。日常改动在主线上小步提交并验证；需要临时隔离时，完成后合并并删除临时分支。
- 正式版本通过 `v<版本>` tag 标记。清理目录和分支不重写既有提交历史。
- 根目录的 `AGENTS.md` 是协作入口；历史方案不作为当前任务清单。

## 目录职责

| 目录 | 用途 |
|---|---|
| `electron/`、`renderer/`、`backend/` | 桌面壳、前端、后端源码及测试 |
| `scratch-editor/`、`jupyterlab_micropython/` | 实验编辑器源码与构建工具 |
| `config/`、`resources/`、`data/`、`sasu/`、`courses/` | 运行和示例资源；变更前检查加载引用 |
| `scripts/`、`.github/` | 本地检查、构建与自动化 |
| `docs/teacher/`、`docs/overview/`、`docs/maintenance/` | 教师使用、架构说明和维护规则 |
| `docs/archive/` | 已结束方案、传播素材的归档索引 |
| `output/releases/<版本>/` | 可交付安装包及哈希清单，Git 忽略 |
| `output/diagnostics/` | 本地诊断结果，Git 忽略 |

## 唯一日常打包入口

```bash
npm run build:installer:win  # Windows x64 NSIS 安装 EXE
npm run build:installer:mac  # macOS Apple Silicon DMG
```

两个命令都先构建 Scratch、检查资源，再构建前端并打包内置 Python。`build.bat` 与 `build.sh` 分别转发到对应命令，不删除历史发行物。旧 `electron:build:portable:*` 命令作为兼容别名保留；`minimal` 配置保留给既有脚本，不再作为推荐分发名称。

有签名凭据的正式发布流水线仍使用 `electron:build:release`，在 `dist-release/` 临时验收签名和公证，再上传 artifact。不要将本地未签名包称作已签名正式发布。

`python_env_minimal/` 与 `python_env_win_minimal/` 是离线构建输入，必须保留或通过 `scripts/setup_portable_python.py` 重新准备。`node_modules/` 是依赖，`.npm-cache/` 是可重新下载的缓存，两者不要混淆。

## 资料、产物与恢复

2026 案例报告、PPT、图片和生成脚本已从客户端工作区整体归档；[原目录说明](../case-application-2026/README.md)提供历史提交导出方式。[历史资料索引](../archive/README.md)集中列出旧开发方案和传播素材。

清理前在仓库外保存了完整 `repository.bundle`、分支 SHA 清单、Git 配置、未跟踪文件及 `project-materials.tar.gz`；本机归档位置记录于整理报告。恢复历史可以从 bundle 克隆，不必把一批备份分支重新挂回日常仓库。

```bash
git clone /归档目录/repository.bundle /新的恢复目录
```

安装包清理前先校验保留文件的 SHA-256。`output/releases/2.1.6/manifest.json` 标记已交付安装包的实际来源提交；源码整理后不能将旧安装包直接视作当前 HEAD 的新构建。

## 验证

```bash
npm run quality-gate
npm run check:renderer-syntax
node --test electron/main/*.test.mjs electron/test/*.test.mjs renderer/js/resources/*.test.mjs
python3 -m pytest docs/teacher/skill-bundle-src/xedu-teacher-skills/tests -q
```

CI 使用 Node 22.23.1 与 Python 3.12。单独报告源码测试、打包资源校验、Mac 启动和 Windows 真机验证，不能互相代替。
