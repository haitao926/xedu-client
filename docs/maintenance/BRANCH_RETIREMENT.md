# 2026-11-12 历史分支核对

整合基线：`b4e7c79a`（已交付的 2.1.6）。本次先保存仓库外 Git bundle 和分支 SHA 清单，再提升 `main`，最后删除旧分支指针。旧分支提交通过审阅后的历史合并保留在 `main` 祖先链；不把旧代码树直接覆盖到当前源码。

## 独有提交处置

| 历史提交 | 处置与理由 |
|---|---|
| `43c01834` | 认证测试由 `backend/tests/api_test_utils.py` 明确授权；旧 Blockly 与 QuickForm 写入能力已退役，不恢复旧接口。 |
| `c3a5ce0e` | 现有路由已覆盖大多数权限检查；补回 `GET /api/projects/templates` 的 `resource:read` 权限校验，避免匿名读取用户目录路径。课堂 start/stop 保留当前 `resource:write` 与教师码约束。 |
| `d862ab31` | 当前主进程会话和任务状态 IPC 已覆盖页面重载恢复；不恢复 renderer 持有授权的旧方式。退出应用后的持久化不由这两版实现提供。 |
| `fb9de801` | 当前授权交换、SHA-256 包缓存、本地课程刷新和提交状态恢复覆盖主流程；旧页面任意二进制 artifacts 与 camelCase requestId 的兼容不恢复，采用现有受限作品导出与统一提交协议。 |
| `98a8e664` | 保留现有 Node 请求及仅 loopback 自签名证书例外。历史 Electron net.fetch 的系统私有 CA 信任和交换自动重试不引入，避免整理时改变非 loopback TLS 与一次性授权的失败语义；网络失败可从平台新入口重试。私有 CA 支持若确有需求另立任务。 |
| `8e5bfbfc` | 现有 raw REPL/raw-paste 取代旧会话实现。补回 Jupyter 串口操作异步派发并串行执行，避免设备等待阻塞 Jupyter 事件循环。 |
| `1f48e18f`、`39e30ff1` | 补回主板 ttyS UART 排除规则，保留 USB/ACM/macOS 端口及既有去重行为。 |

## 已覆盖历史

`main`、`codex/full-scratch-plan`、MicroPython 稳定版、学生界面、loopback TLS、代码模式和 P2 提交主线的已有 tip 均已在基线祖先链中。其余同指针的 Claude/Codex 本地分支不含独有提交。

7 个旧 PR 按默认主分支的整合结果处理；关闭与合并是不同状态，以 GitHub 实际状态为准。只清理 `origin` 仓库分支；不修改 vvplan 或 XEduPro 两个独立仓库。

## 验证边界

本次执行完整质量门禁，并单独验证补回的权限与串口行为。保留的安装包 manifest 指向实际构建提交，而非整理后的源码。学校 Windows 课程配置错误仍待 Windows 现场响应核对，不能由本次主线整理宣称解决。
