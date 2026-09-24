# XEdu Client × LearnSite 3.0 提交协议（Client 侧）

基线日期：2026-09-22。`protocol_version: 1`。`contract_revision: "2026-09-22"`。

这份说明只覆盖 **XEdu Client 已经实现的义务**。LearnSite 服务端、教师内容浏览接口、全桌面截图、跨天自动补交、多题加权都不在本客户端实现里。

若与更早的提交说明冲突，以 2026-09-22 基线为准。

## 学生在焦点栏看到的操作

进入实验后的顶栏保留：返回任务中心、当前任务名、AI 助手。没有进度条。

| 按钮 | 行为 |
| --- | --- |
| 保存成绩 | 需要一份成绩草稿。把最新 `name`、`raw_score` 和归一化 `score` 交给平台。有作答袋时一并带上 `answers`。 |
| 截图并上传 | 截取当前实验视图（含 iframe 里的 canvas），不截全桌面。`name` / `raw_score` / `score` 都是 `null`，`passed` 是 `true`。这是证据提交，不是自动计分。 |
| 保存成绩并截图 | 同一次确认里带上冻结成绩和截图。截图或上传失败时不会报组合成功，成绩草稿还在，可以单独保存成绩。 |
| 保存 | 只出现在 Scratch 或 Notebook 实验。不需要成绩。截取当前实验视图作为证据。成功后显示「已保存」。 |

完成提示只在平台返回 `status: "completed"` 之后出现。草稿、截图暂存、本地实验进度都不是完成。

## 启动

`xedu://open-local-task?launch_grant=...&platform_origin=https%3A%2F%2F...`

Client 向 `{platform_origin}/api/xedu/v1/launch/exchange` 发送：

```json
{
  "protocol_version": 1,
  "contract_revision": "2026-09-22",
  "launch_grant": "<一次性启动 grant>"
}
```

服务端必须原样确认 `protocol_version` 和 `contract_revision`。不一致就停止，并提示协议版本不一致。Client 不会改用旧版本再试一次。

现场 LearnSite / classroom 仍使用更早的深链：`xedu://open-local-task?grant=...&platform_origin=https%3A%2F%2F...`。两条都在时用 `launch_grant`。只带 `grant` 时，兑换请求是 `Authorization: Bearer <grant>`，正文只有 `{ "protocol_version": 1 }`。成功响应可以用 `grant` 作为任务令牌，也可以不带 `contract_revision`。响应里如果写了别的 `contract_revision`，仍然停止。`launch_grant` 链接继续按上面的 2026-09-22 正文兑换。

兑换、课程包 GET、截图上传和提交共用主进程的同一条 Node `https` 请求。URL 主机名是 `localhost`、`127.0.0.1` 或 `::1` 时，接受本机 Caddy 自签或私有 CA 证书，不校验该证书。其它主机仍走 Node 默认信任库。不要用 `NODE_TLS_REJECT_UNAUTHORIZED=0` 启动 Client：那会关掉所有主机的校验。`package_url` 若不是上述回环主机名，仍必须是受信任的 HTTPS。

在 Mac 上用正式包核对本地 LearnSite（不要加那个环境变量）：

1. 退出已经打开的 XEdu Client，确认没有残留用 `NODE_TLS_REJECT_UNAUTHORIZED=0` 启动的进程。
2. 安装本分支打出的 `/Applications/XEdu Client.app`。LearnSite 用 Caddy 自签证书提供 `https://localhost:8443`。
3. 在浏览器里正常领一条 `xedu://open-local-task?platform_origin=https://localhost:8443&…&grant=…`。
4. 用 `open 'xedu://…'` 交给 Launch Services。命令行里不要带 `NODE_TLS_REJECT_UNAUTHORIZED`。
5. 通过时：这条 grant 的 `ExchangedAt` 有值，平台 deep-link 日志有这次打开，课程包出现在 Application Support 的 `xedu-task-packages/` 下。随后保存成绩，平台回执为 `status: completed`。

任务 grant 只留在主进程内存，不进入课件、URL、页面状态或日志。启动 grant 兑换后即丢弃。过期或 401 时清掉任务 grant，但保留成绩草稿，学生需要从学习平台重新打开。只有完整上下文键一致时才恢复草稿：

`(platform_origin, learner_scope, platform_activity_id, course_id, activity_id, resource_id, course_version, package_sha256)`

`learner_scope` 不同就不会看到上一名学生的草稿。

## 课程包

`course_id` 是课程包里 `course.json` 的 `id`，不是 LearnSite 的 Cid。

下载使用兑换结果里的 `package_url`，GET 不带 Bearer。缓存目录按 `(platform_origin, course_id, course_version, package_sha256)` 分开。字节长度必须等于 `package_size`，SHA-256 必须等于 `package_sha256`。通过后才解出课件，并用本机 `127.0.0.1` 静态页打开 `resource_id` 对应的 `.html` / `.htm`。

## 成绩草稿

HTML 实验只通过 `window.parent.postMessage` 把成绩交给宿主。Client 只接受当前登记 iframe 的 `contentWindow`。

- 无 `type` 时是 `{name, value}`，可以再带可选的 `answers`
- 或者 `type: "ols-score/1"`
- 旧的 `xedu:submit-request` 只会转成草稿。对象 `payload` 里的 `name` / `value` 优先。没有对象 `payload` 时读消息本身：没有 `value` 就用数字 `score`（含 0），没有 `name` 就用 `summary`，再没有则用「测验成绩」。数字 `score` 不是 payload。

`name` 去掉首尾空白后为 1–200 字。`value` 必须是有限数字，范围 0–100。字符串、`null`、`NaN` 都拒绝，也不把超额分数钳进范围内。0 分是有效分数。`score = floor(raw_score + 0.5)`。`passed` 可以缺省、`null` 或 `false`，草稿会原样保留，不会改写成 `true`。

可选作答袋 `answers` 可以和成绩一起出现。两字段消息允许的键只有 `name`、`value`，以及可选的 `answers`。`ols-score/1` 和旧的 `xedu:submit-request` 也读取同一字段。`answers` 必须是 JSON 对象或数组。缺省、`null` 表示没有作答袋，成绩仍可保存。字符串和其他标量会拒绝这次草稿。序列化后超过 32KB 也会拒绝，已有草稿保留。函数、`undefined` 和循环引用按 JSON 规则去掉或拒绝。

这些消息不会自动提交。保存进行中的新消息留作下一稿。没有草稿时「保存成绩」和「保存成绩并截图」不可用；「截图并上传」仍然可用。Scratch / Notebook 的「保存」不需要成绩草稿。

## 上传和提交

1. `POST /api/xedu/v1/artifacts`：原始图片字节，`Content-Type` 为 `image/png`、`image/jpeg` 或 `image/webp`，并带 `X-XEdu-Filename`、`X-XEdu-SHA256`。单张不超过 10MiB。返回的 `upload_id` 只是暂存。
2. `POST /api/xedu/v1/submissions`：带上 grant 快照里的课程三元组、`course_version`、`package_sha256`，以及分数或至少一个 `upload_id`。
3. 超时后先 `GET /api/xedu/v1/submissions/status?request_id=`。

成绩提交在有作答袋时多一个 JSON 字段 `answers`，没有作答袋时不出现这个字段。其余字段与以前相同：

```json
{
  "name": "操作题",
  "raw_score": 80,
  "score": 80,
  "passed": true,
  "answers": { "q1": "A", "q2": ["B", "C"] }
}
```

自动计分的 HTML 实验仍要带 `ols-score/1` 或 `{name, value}` 成绩。平台在「声称了分数」且 `passed` 不是 `true` 时返回 `XEDU_RESULT_NOT_PASSED`。Client 不把这次保存记为完成，不自动重试，草稿保留，并提示这次成绩还没有通过。`passed: true` 的成绩按原来的完成回执处理。Client 不会把已声称的分数上的 `passed` 改成 `true`。

没有分数的证据提交（`name` / `raw_score` / `score` 都是 `null`）必须带 `passed: true`。这表示学生完成了一次证据保存，不是自动计分。Scratch、Notebook 和「截图并上传」都按这条发送。不带 `answers`。

Scratch 和 Notebook 用证据提交。学生点「保存」后，Client 走同一条截图上传。成功且 `status: "completed"` 后，焦点栏显示「已保存」。已有成绩草稿不会被这次证据提交清掉。

```json
{
  "name": null,
  "raw_score": null,
  "score": null,
  "passed": true,
  "attachments": [
    {
      "upload_id": "<artifacts 返回的 id>",
      "filename": "experiment-view.png",
      "sha256": "<截图 SHA-256>",
      "content_type": "image/png"
    }
  ],
  "evidence": {
    "type": "screenshot",
    "experiment": "scratch",
    "project_file": null
  }
}
```

`evidence.experiment` 是 `"scratch"` 或 `"notebook"`。Notebook 截的是当前 Jupyter 视图；Scratch 和 HTML 截的是当前实验区域，不截全桌面。

`project_file` 现在固定是 `null`。作品文件（`.sb3` / `.ipynb`）还没有上传：现有 `/api/xedu/v1/artifacts` 只收 PNG、JPEG、WebP。以后平台接受非图片字节时，再把导出的工程文件作为可选附件，并填上 `project_file`。在那之前截图就是证据。

同一次保存的 `request_id` 不变，重试时正文也不变。自动重试最多 3 次，间隔 1 秒、2 秒、4 秒。同一任务同时只有一个在途保存。409 冲突、作业锁定、成绩无效、授权过期、`XEDU_RESULT_NOT_PASSED` 不会重试。

## 学生会看到的失败

| code | 提示 |
| --- | --- |
| `protocol_mismatch` | 学习平台协议版本与客户端不一致，已停止打开。 |
| `grant_expired` | 任务授权已过期，请从学习平台重新打开。当前成绩草稿已保留。 |
| `score_invalid` | 成绩无效。请使用 0 到 100 之间的数字，0 分也会保留。 |
| `work_locked` | 这份作业已锁定，暂时不能再保存。 |
| `conflict` | 保存发生冲突，请从学习平台重新打开后再试。 |
| `package_invalid` / `course_id_mismatch` | 课程包校验失败，或 course.json 的 id 与任务不一致。 |
| `grant_invalid` | 学习平台没有返回有效的任务授权，请重新打开。 |
| `rate_limited` | 保存太频繁，请稍后再试。 |
| `screenshot_failed` | 截图失败，没有上传。成绩草稿还在，可以单独保存成绩。 |
| `answers_invalid` | 作答内容格式无效，成绩没有保存。 |
| `answers_too_large` | 作答内容超过 32KB，成绩没有保存。 |
| `XEDU_RESULT_NOT_PASSED` | 这次成绩还没有通过，平台没有记为完成。 |

焦点栏会显示当前草稿（待保存：名称和分数）、保存中、以及只在 `status: "completed"` 之后出现的「平台已保存」。Scratch / Notebook 证据保存成功时显示「已保存」。失败时可以点「重试」。授权过期时提示从学习平台重新打开，不提供会再次提交的重试。`XEDU_RESULT_NOT_PASSED` 不重试。

同一条尚未完成兑换的 `xedu://open-local-task` 只兑换一次，并回到已经打开的窗口。不同活动的草稿按上下文键分开。

对着 Mock 联调的点击步骤、T06–T14 清单和 Mock 必须返回的字段见 `docs/teacher/XEDU_MOCK_LIAN_DIAO.md`。

## 还需要真实 LearnSite Mock / T20 确认

客户端用本地 HTTPS 模拟覆盖了兑换、校验、截图上传和提交。下面几项还没有对着真实 LearnSite 跑过：

- 兑换响应里的字段名、`task_grant` 头和 `grant_expires_at` 是否与平台 Mock 完全一致
- `package_url` 的真实下载主机、重定向和大小字段
- 提交回执除 `status: "completed"` 之外的中间状态怎么表示
- 平台侧 409 / 作业锁定 / 成绩无效的最终 `code` 字符串
- T20 验收里从真实深链打开、保存、截图到平台确认完成的整段路径
