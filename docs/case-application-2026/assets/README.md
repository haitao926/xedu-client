# Roil 出图资产

本目录存放通过 `$roil-drawing` 需要补位的 AI 配图提示词与输出文件。

## 目标图片

- `p2_problem_scene.png`
- `p3_learning_loop.png`
- `p6_classroom_flow.png`
- `p9_closing_bg.png`
- `p2_problem_scene_v2.png`
- `p3_learning_loop_v2.png`
- `p6_classroom_flow_v2.png`

## 当前状态

- 已完成：
  - 提示词文件 `*.prompt.txt`
  - 一键出图脚本 [run_roil_generate.sh](/Users/apple/Documents/GitHub/xedu-client/docs/case-application-2026/assets/run_roil_generate.sh)
- 已完成出图：
  - `p2_problem_scene.png`
  - `p3_learning_loop.png`
  - `p6_classroom_flow.png`
  - `p9_closing_bg.png`
- 未完成：
  - 更强调“编号 + 分区 + 短标签”的 v2 信息图版本

## 阻塞原因

当前本机 Roil/NBS CLI 出图链路可调用，但登录态失效，返回错误：

`Refresh token revoked`

## 恢复后执行

1. 先恢复 NBS 登录态
2. 再执行：

```bash
bash /Users/apple/Documents/GitHub/xedu-client/docs/case-application-2026/assets/run_roil_generate.sh
```

## 使用说明

- 这些图片用于 PPT 的概念表达和版面补位，不用于伪造真实课堂证据。
- 放入 PPT 时应在图注或页角标注 `AI生成`。
