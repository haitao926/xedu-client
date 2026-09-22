# LearnSite Mock 联调清单（Client）

基线：`protocol_version: 1`，`contract_revision: "2026-09-22"`。协议细节见 `docs/teacher/XEDU_PLATFORM_SUBMISSION_PROTOCOL.md`。

这份清单给本地 Mock 联调用。T06–T14 可以在 Mock 上点完。T20 需要一台真实 LearnSite，本清单不能代替。

## 把 Client 指到 Mock

1. 用本分支启动 XEdu Client。Client 是单实例：第二次打开会回到已经存在的窗口，不会再开一个。
2. Mock 的 `platform_origin` 必须是 `https`。证书要被这台电脑信任（正式证书或 mkcert）。Client 不会跳过证书校验。
3. 让 Mock 的课程页在加载后向父窗口发送成绩，例如：

```html
<script>
  parent.postMessage({ name: "第1题", value: 80 }, "*");
</script>
```

`ols-score/1` 也可以：`{ type: "ols-score/1", name: "第1题", value: 80, passed: false }`。这两类消息只产生草稿，不会自动提交。

4. 用深链打开，不要把 launch grant 写进日志：

```text
xedu://open-local-task?launch_grant=<一次性 grant>&platform_origin=https%3A%2F%2F<mock-host>
```

同一条还没兑换完的链接只兑换一次。兑换成功后再次打开同一条链接，Client 回到当前任务，不再次 POST exchange。授权过期之后，需要学习平台发一条新的启动链接。

## 对着 Mock 要点的按钮

进入实验后看顶栏，从左到右是：返回任务中心、任务名、AI 助手、保存成绩、截图并上传、保存成绩并截图。

1. 打开深链。实验页出现后，顶栏应出现 **待保存：第1题 80分**。「保存成绩」和「保存成绩并截图」变为可点。「截图并上传」不需要草稿。
2. 点 **保存成绩**。按钮先变成不可再点，状态是 **保存中**。Mock 返回 `status: "completed"` 之后，状态变成 **平台已保存**。没有 `completed` 时不要出现这句。
3. 再发一次成绩草稿，确认新的「待保存」不会把上一名学生或其他活动的分数带过来。
4. 点 **截图并上传**。截的是当前实验区域，不是整块桌面。成功后平台确认，原有分数草稿还在。
5. 点 **保存成绩并截图**。两边都成功才显示平台已保存。若截图失败，顶栏是失败说明和 **重试**，不会显示平台已保存；「保存成绩」仍可单独再点。
6. 让 Mock 返回 401 / `grant_expired`。顶栏提示从学习平台重新打开，草稿还在，没有「重试」提交。

## T06–T14

| 编号 | 在 Mock 上确认 | 通过时看到 |
| --- | --- | --- |
| T06 | 深链兑换。请求体含 `protocol_version: 1` 和 `contract_revision: "2026-09-22"`。Mock 回了别的版本时 Client 停止，不改用旧版本再试。 | 协议不一致的中文提示，实验不打开 |
| T07 | 课程包 GET 不带 Bearer。长度等于 `package_size`，SHA-256 等于 `package_sha256`。`course.json` 的 `id` 等于 `course_id`，不是学案 Cid。 | 实验页打开；校验失败时提示课程包无效或编号不一致 |
| T08 | 两字段或 `ols-score/1` 只进入草稿。0 分保留。字符串、空值、超过 100 的分数被拒绝，不自动改成 100。 | 顶栏「待保存：名称 分数」；无效成绩有中文提示，且没有提交 |
| T09 | 点保存成绩。同一 `request_id` 重试时正文不变。只有回执 `status: "completed"` 才算完成。 | 先「保存中」，完成后「平台已保存」 |
| T10 | 点截图并上传。图片是当前实验视图。提交里 `name` / `raw_score` / `score` / `passed` 为 `null`，并带上 `upload_id`。 | 平台确认后原草稿还在；没有整桌面截图 |
| T11 | 点保存成绩并截图。截图或附件失败时，组合结果不是成功。 | 失败说明 + 重试；随后单独点保存成绩仍可完成 |
| T12 | 保存过程中再点一次不会发出第二笔提交。失败后点重试。429 显示过于频繁。 | 「保存中」时按钮不可再点；`rate_limited` 为「保存太频繁，请稍后再试。」 |
| T13 | 连点同一条深链。再打开另一个 `activity_id` 的任务。 | 只出现一个窗口，exchange 只有一次；后一个活动看不到前一个活动的草稿 |
| T14 | 任务授权过期或 401。用完整上下文键（含 `learner_scope`）重新打开。换一个 `learner_scope` 再打开。 | 提示从学习平台重新打开，草稿保留；另一名学生看不到这份草稿 |

## T20

T20 是真实 LearnSite 上的整段路径：平台发出的深链、真实课程包、保存、截图，直到平台自己的完成回执。Mock 全部通过也不等于 T20 通过。

## Mock 必须返回的内容

兑换 `POST /api/xedu/v1/launch/exchange` 成功时：

```json
{
  "ok": true,
  "protocol_version": 1,
  "contract_revision": "2026-09-22",
  "task_grant": "<任务 grant>",
  "grant_expires_at": "2026-09-22T12:00:00.000Z",
  "learner_scope": "learner-a",
  "platform_activity_id": "plat-act-1",
  "course_id": "<course.json 的 id>",
  "activity_id": "activity-1",
  "resource_id": "labs/quiz.html",
  "course_version": "3",
  "package_sha256": "<64 位十六进制>",
  "package_size": 1234,
  "package_url": "https://<mock-host>/packages/course.zip"
}
```

`protocol_version` 必须是数字 `1`。`contract_revision` 必须是字符串 `"2026-09-22"`。缺少 `task_grant` 时 Client 报授权无效。

完成回执（保存、截图、组合都一样，看 `status`）：

```json
{
  "ok": true,
  "status": "completed",
  "request_id": "<Client 传来的 request_id>",
  "receipt_id": "rc-1"
}
```

`status` 不是 `"completed"` 时，顶栏不会写「平台已保存」。

失败体：

```json
{
  "ok": false,
  "code": "grant_expired",
  "message": "平台原文不会直接给学生看",
  "retryable": false,
  "request_id": "<同一个 request_id>"
}
```

Client 按 `code` 显示本地中文，不把平台 `message` 原文放进顶栏。

| code | HTTP | 学生看到 |
| --- | --- | --- |
| `protocol_mismatch` 或 `protocol_unsupported` | 非 2xx | 学习平台协议版本与客户端不一致，已停止打开。 |
| `grant_invalid` | 2xx 但没有 `task_grant`，或显式 code | 学习平台没有返回有效的任务授权，请重新打开。 |
| `grant_expired` | 401 | 任务授权已过期，请从学习平台重新打开。当前成绩草稿已保留。 |
| `score_invalid` | 400 | 成绩无效。请使用 0 到 100 之间的数字，0 分也会保留。 |
| `work_locked` | 423 | 这份作业已锁定，暂时不能再保存。 |
| `conflict` | 409 | 保存发生冲突，请从学习平台重新打开后再试。 |
| `rate_limited` | 429 | 保存太频繁，请稍后再试。 |
| `package_invalid` | 包大小或哈希不符 | 课程包校验失败，请从学习平台重新打开。 |
| `course_id_mismatch` | 包内 id 与 `course_id` 不同 | 课程包编号与任务不一致。 |
| `screenshot_failed` | Client 本地截图失败 | 截图失败，没有上传。成绩草稿还在，可以单独保存成绩。 |

冲突、作业锁定、成绩无效、授权过期不会自动重试。网络错误和超时会先查 `GET /api/xedu/v1/submissions/status?request_id=`，最多再试 3 次（1 秒、2 秒、4 秒）。
