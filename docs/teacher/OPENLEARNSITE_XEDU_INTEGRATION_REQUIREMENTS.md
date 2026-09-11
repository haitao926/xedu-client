# OpenLearnSite 接入 XEdu 需求与验收标准

## 1. 文档目的

本文档用于指导 OpenLearnSite 接入 XEdu Client。目标是在不影响现有生产课程和成绩流程的前提下，实现学生从 OpenLearnSite 一键打开 XEdu，并在 XEdu 中完成测试后将结果返回平台。

当前 OpenLearnSite 地址：

```text
http://10.15.46.64/
```

当前已确认：该地址可以访问 ASP.NET 登录首页，但请求以下接口返回 IIS `404`：

```text
POST /api/xedu/v1/launch
```

这说明平台尚未提供 XEdu 启动接口。本文档描述的是需要在测试环境实现、验证后再发布到生产环境的接入范围。

## 2. 目标用户流程

```text
学生登录 OpenLearnSite
  ↓
打开课程活动页面
  ↓
点击“打开 XEdu”
  ↓
OpenLearnSite 后台识别当前学生、课程和活动
  ↓
平台生成一次性启动授权并返回 xedu:// 启动地址
  ↓
自动启动 XEdu Client
  ↓
XEdu 打开课程包中的精确 HTML 资源
  ↓
学生在 XEdu 中完成测试并点击“提交测试结果”
  ↓
XEdu 将结果提交到 OpenLearnSite
  ↓
学生端和教师端显示完成状态及成绩
```

学生不需要填写以下任何内容：

```text
账号、密码、学号、课程 ID、活动 ID、grant、平台地址
```

## 3. 系统职责边界

### 3.1 OpenLearnSite 负责

- 学生登录和会话管理
- 课程、活动和学生权限校验
- 在课程页面显示“打开 XEdu”按钮
- 生成并管理一次性启动授权
- 提供 XEdu 授权兑换接口
- 接收测试结果和附件
- 保存学生成绩、提交状态和教师端统计数据
- 通过 HTTPS 提供所有生产接口

### 3.2 XEdu Client 负责

- 处理 `xedu://open-local-task` 深链接
- 兑换平台发放的短期任务授权
- 下载并校验课程包
- 打开课程包内指定的 HTML 文件
- 在本地提供摄像头、文件、Python、Jupyter、硬件等能力
- 上传受限大小的结果附件
- 提交测试结果并显示平台回执

### 3.3 课程 HTML 负责

- 展示测试内容
- 执行本地实验或自查逻辑
- 通过 XEdu 提供的消息协议请求提交结果
- 只在收到平台保存成功的回执后显示“已完成”

课程 HTML 不负责登录、生成 grant、识别学生或直接伪造成绩。

## 4. 学生端页面要求

OpenLearnSite 课程活动页面中增加一个按钮：

```text
打开 XEdu
```

参考文件：

[xedu-student-launch-button.html](/Users/apple/Documents/GitHub/xedu-client/docs/teacher/xedu-html-examples/xedu-student-launch-button.html)

页面行为：

1. 学生点击按钮。
2. 页面使用当前登录会话请求平台启动接口。
3. 平台返回 `launch_url` 后，页面跳转到该地址。
4. 浏览器尝试唤起 XEdu Client。
5. 请求失败时显示明确错误，但不显示或暴露 grant。

推荐请求：

```http
POST /api/xedu/v1/launch
Content-Type: application/json
Cookie: 当前学生登录会话
```

```json
{
  "course_id": "course-2026-01",
  "activity_id": "camera-check-01",
  "resource_id": "lesson1/exp1/index.html"
}
```

平台可以从服务器端页面上下文确定课程和活动，也可以接收上述字段后再次进行权限校验。不能直接信任浏览器提交的学生身份。

## 5. 接口需求

所有生产接口必须使用 HTTPS，并且与 OpenLearnSite 配置的可信平台来源保持一致。

### 5.1 创建启动授权

```text
POST /api/xedu/v1/launch
```

处理要求：

- 验证当前学生已经登录。
- 验证学生属于该课程并有权访问该活动。
- 验证 `resource_id` 属于指定课程包且是精确 HTML 文件路径。
- 生成不可预测的随机 grant。
- grant 默认有效期建议为 5 分钟。
- grant 只能兑换一次。
- grant 必须绑定学生、课程、活动和资源。
- 数据库存储 grant 哈希，不存储明文 grant。
- 不在普通访问日志中记录完整 `launch_url`。

成功响应：

```json
{
  "ok": true,
  "launch_url": "xedu://open-local-task?platform_origin=https%3A%2F%2Flearn.example&course_id=course-2026-01&activity_id=camera-check-01&resource_id=lesson1%2Fexp1%2Findex.html&grant=opaque-one-time-value",
  "expires_at": "2026-09-10T10:00:00Z"
}
```

失败响应示例：

```json
{
  "ok": false,
  "code": "XEDU_ACTIVITY_FORBIDDEN",
  "message": "当前学生无权访问此活动"
}
```

### 5.2 兑换启动授权

XEdu Client 启动后自动调用：

```http
POST /api/xedu/v1/launch/exchange
Authorization: Bearer {launch_grant}
Content-Type: application/json
```

```json
{
  "client": "xedu-client",
  "protocol_version": 1
}
```

平台需要验证：

- grant 存在且未过期。
- grant 尚未被兑换。
- grant 绑定的课程、活动和资源仍然有效。
- 客户端协议版本受支持。

成功响应：

```json
{
  "ok": true,
  "protocol_version": 1,
  "course_id": "course-2026-01",
  "activity_id": "camera-check-01",
  "resource_id": "lesson1/exp1/index.html",
  "resource_url": "http://127.0.0.1:5123/api/resources/local-file/index.html",
  "grant": "short-lived-task-grant",
  "expires_at": "2026-09-10T10:20:00Z",
  "artifact_upload_url": "https://learn.example/api/xedu/v1/artifacts",
  "submit_url": "https://learn.example/api/xedu/v1/submissions",
  "completion_url": "https://learn.example/api/xedu/v1/submissions/status",
  "course_version": "2026.09.10-1",
  "package_url": "https://learn.example/packages/course-2026-01.zip",
  "package_sha256": "lowercase-sha256-of-zip",
  "package_size": 18230456
}
```

课程包字段如果提供，`package_url`、`package_sha256`、`package_size` 和 `course_version` 必须同时提供。`package_url` 必须使用 HTTPS，并且与兑换接口同源。

### 5.3 上传结果附件

```http
POST /api/xedu/v1/artifacts
Authorization: Bearer {task_grant}
Content-Type: image/png
X-XEdu-Filename: result.png
X-XEdu-SHA256: lowercase-sha256
```

平台需要限制：

- 单个文件最大大小。
- 允许的 MIME 类型。
- 文件名格式和路径穿越字符。
- 上传任务与学生、课程、活动的绑定关系。
- 上传内容的 SHA-256 校验。
- 未被提交结果引用的临时附件自动过期。

### 5.4 提交测试结果

```http
POST /api/xedu/v1/submissions
Authorization: Bearer {task_grant}
Content-Type: application/json
```

```json
{
  "course_id": "course-2026-01",
  "activity_id": "camera-check-01",
  "resource_id": "lesson1/exp1/index.html",
  "request_id": "uuid-for-idempotency",
  "score": 100,
  "passed": true,
  "summary": "测试通过",
  "artifacts": [
    {
      "upload_id": "upload-123",
      "name": "result.png",
      "mime": "image/png",
      "size": 183204,
      "sha256": "lowercase-sha256"
    }
  ]
}
```

平台必须根据任务授权反查学生，不能信任请求体中的学生身份字段。`request_id` 必须建立唯一约束或等效幂等机制，重复请求只能得到同一提交记录。

成功响应：

```json
{
  "ok": true,
  "submission_id": "submission-123",
  "status": "completed"
}
```

只有 `ok: true` 且 `status: "completed"` 时，XEdu 页面才显示完成。

### 5.5 查询提交状态

```http
GET /api/xedu/v1/submissions/status?request_id=uuid-for-idempotency
Authorization: Bearer {task_grant}
```

用途：网络超时后确认提交是否已经保存，避免学生重复提交。

建议状态：

```text
accepted     已接收，仍在处理
completed    已保存并完成
rejected     平台拒绝
not_found    不存在
```

## 6. 建议的数据结构

可以使用现有数据库风格新增以下数据表，具体命名以 OpenLearnSite 现有规范为准。

### 6.1 XEduLaunchGrant

```text
id
grant_hash
student_id
course_id
activity_id
resource_id
expires_at
exchanged_at
created_at
created_ip
```

### 6.2 XEduTaskGrant

```text
id
task_grant_hash
launch_grant_id
student_id
course_id
activity_id
resource_id
expires_at
revoked_at
created_at
```

### 6.3 XEduSubmission

```text
id
request_id
student_id
course_id
activity_id
resource_id
score
passed
summary
status
created_at
completed_at
```

`request_id` 建议建立唯一索引。已有成绩表可以继续复用，但必须保留 XEdu 的活动关联和幂等字段。

## 7. 安全与生产要求

- 生产环境必须使用 HTTPS。
- 不为了测试而在生产环境长期放开 HTTP。
- grant 使用密码学安全随机数生成。
- grant 和任务授权都应设置短期过期时间。
- 启动授权只能兑换一次。
- 提交授权只能访问绑定的课程和活动。
- 后台从登录会话或授权反查学生身份。
- 启动接口启用登录校验、权限校验和 CSRF 防护。
- 提交接口启用授权校验、请求体大小限制和限流。
- 附件必须限制大小、MIME 类型、文件名和总量。
- 日志中不得记录完整 grant 或完整 `xedu://` 地址。
- 所有失败请求返回不泄露授权内容的错误信息。
- 新功能按课程或活动启用，不能默认改变全部现有课程。
- 关闭 XEdu 功能后，已有普通 HTML 任务仍然正常运行。

## 8. 发布策略

### 阶段一：源码和架构确认

确认以下内容：

- ASP.NET Web Forms、MVC、Web API 或其他后端类型。
- 学生课程页面源码位置。
- 当前登录 Session/Cookie 机制。
- 课程、活动、学生权限和成绩表结构。
- 课程包存储和下载方式。
- IIS 路由配置和部署方式。
- 测试环境与生产环境配置是否分离。

### 阶段二：测试环境实现

- 增加数据库迁移。
- 增加 XEdu 接口。
- 增加学生页面按钮。
- 配置测试环境 HTTPS。
- 上传最小课程包和测试 HTML。
- 使用测试账号完成完整链路。

### 阶段三：灰度发布

- 只为指定测试课程启用。
- 只允许指定测试账号访问。
- 观察启动、兑换、提交和错误日志。
- 验证现有普通课程无回归。
- 验证重复提交、过期授权和权限越界均被拒绝。

### 阶段四：生产发布

- 备份数据库和配置。
- 先部署接口，再打开课程功能开关。
- 逐步扩大启用范围。
- 保留旧课程和旧提交流程。
- 准备关闭开关和回滚版本。

## 9. 验收标准

### 9.1 学生端

- [ ] 学生登录后可以看到“打开 XEdu”按钮。
- [ ] 页面不要求学生填写 grant、课程 ID、活动 ID 或平台地址。
- [ ] 未登录学生不能创建启动授权。
- [ ] 无权访问活动的学生不能创建启动授权。
- [ ] 点击按钮后可以唤起已安装的 XEdu Client。
- [ ] XEdu 能打开课程包中的精确 HTML 文件。

### 9.2 授权安全

- [ ] grant 具有短期有效期。
- [ ] grant 只能兑换一次。
- [ ] 过期 grant 被拒绝。
- [ ] 篡改课程、活动或资源参数不能越权。
- [ ] 学生不能访问其他学生的任务。
- [ ] 日志中不出现完整 grant。

### 9.3 课程包

- [ ] 缺少课程包时可以自动下载。
- [ ] 课程包大小不匹配时拒绝导入。
- [ ] SHA-256 不匹配时拒绝导入。
- [ ] 课程版本过期时可以更新。
- [ ] 下载或导入失败时保留原有课程。
- [ ] `resource_id` 是精确 HTML 文件路径，不接受模糊目录路径。

### 9.4 提交结果

- [ ] 学生可以在 XEdu 中点击“提交测试结果”。
- [ ] 平台可以保存学生、课程、活动、分数和提交时间。
- [ ] 只有平台返回 `ok: true` 且 `status: completed` 时页面显示完成。
- [ ] 网络超时后可以查询原提交状态。
- [ ] 重复提交同一个 `request_id` 不会产生重复成绩。
- [ ] 无效授权、越权活动和错误资源路径会被拒绝。
- [ ] 附件大小、类型、文件名和摘要均受到限制。

### 9.5 兼容性和回滚

- [ ] 现有普通 HTML 课程仍能正常打开和提交。
- [ ] 现有课程包导入流程不受影响。
- [ ] XEdu 功能可按课程或活动单独关闭。
- [ ] 关闭开关后，学生仍可使用原有课程流程。
- [ ] 测试环境验证通过后才允许生产发布。
- [ ] 生产发布失败时可以回滚接口、配置和功能开关。

## 10. 测试用例清单

```text
T01 正常登录学生打开 XEdu
T02 未登录访问启动接口
T03 无课程权限学生访问启动接口
T04 grant 过期
T05 grant 重复兑换
T06 篡改 activity_id
T07 篡改 resource_id
T08 课程包大小校验失败
T09 课程包 SHA-256 校验失败
T10 课程版本自动更新
T11 XEdu 正常提交结果
T12 提交接口网络超时后查询状态
T13 同一 request_id 重复提交
T14 超大附件上传
T15 不允许的 MIME 类型上传
T16 其他学生使用任务授权
T17 旧普通 HTML 课程回归
T18 关闭 XEdu 功能开关
T19 HTTPS 访问
T20 生产发布回滚
```

## 11. 当前待办

当前 `xedu-client` 已具备客户端启动、课程包同步和结果提交能力。OpenLearnSite 侧尚未完成：

```text
[ ] 拉取 OpenLearnSite 源码
[ ] 确认后端框架和路由方式
[ ] 确认登录、课程、活动和成绩数据结构
[ ] 在测试环境增加 XEdu 接口
[ ] 在课程页面加入学生版按钮
[ ] 配置 HTTPS
[ ] 使用测试账号完成端到端测试
[ ] 通过验收清单后再发布生产
```

详细的客户端协议可参考：

[XEDU_PLATFORM_SUBMISSION_PROTOCOL.md](/Users/apple/Documents/GitHub/xedu-client/docs/teacher/XEDU_PLATFORM_SUBMISSION_PROTOCOL.md)

