# XEdu HTML 任务示例

## 平台内普通任务

`platform-task.html` 适合只依赖浏览器标准 API 的测验、表单和自查页面。
提交按钮中发送平台兼容消息：

```js
window.parent.postMessage(JSON.stringify({
  name: "任务名称",
  value: Number(score),
}), "*");
```

这类页面由 OpenLearnSite 负责登录、保存、统计和教师端图表。页面可以提示“结果已提交”，但不要自行伪造“平台已保存”。

## XEdu 本地任务

`xedu-local-camera-task.html` 适合摄像头、麦克风、本地文件、Python、Jupyter 或硬件实验。它通过 `xedu:submit-request` 发送结果和小型附件，只在收到：

```js
{ ok: true, status: "completed" }
```

之后显示“已完成”。XEdu 会先上传附件，再提交结果，并在网络超时后按 `request_id` 查询保存状态。

页面不读取或要求学生账号。学生身份来自 OpenLearnSite 发放给 XEdu 的短期任务授权。

`xedu-platform-package-sync-test.html` 是不需要摄像头的最小联调页面。将它放入课程包后，从 OpenLearnSite 启动 `xedu-local` 任务，可验证本地课程版本匹配、课程包自动下载导入、精确资源打开，以及提交结果回执。

`xedu-student-launch-button.html` 是学生端页面。上传到 OpenLearnSite 后，学生只需点击“打开 XEdu”；页面通过当前登录会话调用 `/api/xedu/v1/launch`，不要求学生填写 grant、课程 ID 或活动 ID。OpenLearnSite 必须实现该接口，并在渲染页面时填入课程和活动元数据。

`xedu-launch-test.html` 是主动唤起测试页。它不会保存授权信息，填写 OpenLearnSite 生成的一次性 `grant` 后，点击“唤起 XEdu”即可打开 `xedu://open-local-task` 深链接。测试时请使用真实 HTTPS 平台来源和与课程包一致的精确 `resource_id`。
