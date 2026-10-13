---
name: weixin-send-file
description: 当需要把文件（视频、图片、文档）发给 Codex 专用微信用户时使用。
---

# 向微信发送文件

当用户要求你"发到微信"、"把这个发给微信"、"send to weixin"时，优先使用 `codex-weixin-send` 命令直接发送到 Codex 专用微信桥接。

## 规则

1. **必须是真实的绝对路径**，文件必须已存在。禁止用占位符（如 `输出视频路径`、`./output/video.mp4`）
2. 使用 `codex-weixin-send "<文件绝对路径>" "<说明文字>"` 发送
3. 一次只能发一个文件。多个文件需要分多次回复
4. 发送文本 + 文件时，文本作为说明（caption）发送
5. 只操作 Codex 专用端口 `11810`，不要操作 Claude 专用端口 `11809`

## 正确写法

```
codex-weixin-send "C:\Users\<your-name>\path\to\demo.mp4" "已经渲染好了，给你发过去看看。"
```

## 错误写法（禁止）

```
[send_file:输出视频路径]       ← 占位符，文件不存在
[send_file:./output/video.mp4] ← 相对路径不行
[send_file:C:\does\not\exist]   ← 路径必须真实存在，先确认
```

## 支持的类型

| 扩展名 | 类型 |
|--------|------|
| `.mp4`, `.mov` | video |
| `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` | image |
| `.pdf`, `.txt`, `.docx`, `.xlsx` 等 | file |

## 注意事项

- 发送前先确认文件确实存在（用 Read 或 Bash ls 检查）
- 视频建议先渲染完成再发送，不要边渲染边发
- 如果桥接未运行，`codex-weixin-send` 会尝试启动
- 主动发送默认发给最近可用会话；如需指定联系人，先查看 `http://127.0.0.1:11810/conversations`，再用 `codex-weixin-send -Target`
- 如果提示缺少或过期 `context_token`，请用户先在手机微信里给 Codex bot 发任意一条消息，然后重试发送
- 如果仍然失败，如实告知用户并引导其运行 `codex-weixin-status`
