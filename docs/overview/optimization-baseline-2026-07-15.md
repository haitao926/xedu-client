# 优化前基线（2026-07-15）

本记录固定安全优化开始时的可复现状态。它不是发布通过声明；后续质量门必须消除所有列出的失败或将其替换为可验证的受控 fixture。

## 已执行命令

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `python3 -m pytest backend/tests -q` | 102 passed, 7 failed | XEduHub checkpoint、OpenXLab 认证、OpenCV 类型兼容和演示视频资产相关失败。 |
| `npm run test:student-shell` | 缺少 script | 当前提交未包含 Student-shell 测试入口。 |
| `npm run build` | 失败 | 干净工作树尚未安装根项目 Node 依赖。 |
| `npm test --prefix scratch-editor` | 无法执行 | `scratch-editor/` 不在当前提交中。 |

## 已确认安全缺陷

- 未授权请求可以调用 `/api/python/run`、读取 `/api/load_config`、读取 Base64 路径令牌指向的本地文件，并获得任意 Origin 的 CORS 许可。
- `/api/load_config` 与 `/api/save_config` 响应回显 API Key、Gitea Token、教师口令和 QuickForm 密码。

## 基线使用规则

- 外部模型、checkpoint、OpenCV 或网络认证造成的失败必须用 fixture 或 mock 固定，不允许删除断言。
- Scratch 与 Student-shell 测试资产必须作为版本化测试入口恢复；质量门在其缺失时失败。
- 安全回归的预期状态是拒绝匿名高权限请求，不接受仅靠 Origin 的兼容分支。
