# XEdu Client API 契约（v1）

## 统一响应约定

### 成功响应

```json
{
  "success": true,
  "message": "可选说明",
  "...": "业务字段"
}
```

### 失败响应

```json
{
  "success": false,
  "message": "错误说明",
  "errors": {
    "field": ["可选字段级错误"]
  }
}
```

## 核心接口

### 系统与健康

- `GET /api/health`
- `GET /api/debug/env`

### Jupyter

- `GET /api/status`
- `POST /api/start`
- `POST /api/stop`
- `POST /api/restart`
- `GET /api/detect_python`

`/api/start|restart` 支持的关键字段：

- `project_dir: string`
- `port: number`
- `python_executable: string`
- `allow_remote_access: boolean`

### 配置

- `POST /api/save_config`
- `GET /api/load_config`

新增网络相关配置字段：

- `ui.allow_network_access: boolean`
  控制后端 Flask 默认监听地址（`false => 127.0.0.1`，`true => 0.0.0.0`）。
- `jupyter.allow_remote_access: boolean`
  控制 Jupyter 绑定地址与安全参数（远程模式下不再默认关闭 token/xsrf）。

### AI / Agent

- `POST /api/ai/ask`
- `POST /api/ai/test_config`
- `POST /api/ai/save_config`

Agent 状态字段：

- `agent_status`: `needs_confirmation | needs_input | completed | error`

### 资源与课堂

- `GET|POST /api/resources/index`
- `POST /api/resources/scan`
- `POST /api/resources/save-course`
- `POST /api/resources/scan-folder`
- `POST /api/resources/quickform/inject`
- `POST /api/resources/publish`
- `POST /api/resources/pull`
- `GET /api/classroom/index`
- `POST /api/classroom/start`
- `POST /api/classroom/stop`

课程文件夹衔接约定见：

- [docs/overview/course-folder-contract.md](/Users/apple/Documents/GitHub/xedu-client/docs/overview/course-folder-contract.md)

### Python 包管理

- `POST /api/python/pip`

请求体：

```json
{
  "action": "install | uninstall | list | upgrade",
  "package": "可选",
  "use_mirror": true,
  "index_url": "可选",
  "python_executable": "可选",
  "stream": false
}
```

## 错误码建议（后续可扩展）

当前版本以 HTTP 状态码 + `message` 为主，建议统一语义：

- `400`: 参数或业务校验失败
- `403`: 权限校验失败（教师口令）
- `404`: 资源不存在
- `500`: 服务内部错误
