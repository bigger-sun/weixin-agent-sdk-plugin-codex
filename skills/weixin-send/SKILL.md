---
name: weixin-send
description: 主动发送文本或文件到微信（需要桥接在运行中）
---

# 主动发送消息/文件到微信

## 前提

- 桥接必须正在运行（`$weixin-start`）
- HTTP 接口在 `http://127.0.0.1:11810/send`

## 发送文本

```bash
codex-weixin-send -Caption "<消息内容>"
```

指定对话发送：

```bash
codex-weixin-send -Target "<会话ID或部分ID>" -Caption "<消息内容>"
```

## 发送文件

```bash
codex-weixin-send "<文件绝对路径>" "<附加文字说明>"
```

查看可用对话：

```bash
curl -s http://127.0.0.1:11810/conversations
```

## 支持的文件类型

| 扩展名 | 类型 |
|--------|------|
| `.mp4`, `.mov` | video |
| `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` | image |
| `.pdf`, `.txt` | file |
| 其他 | file |

## 注意事项

- 文件路径必须是**绝对路径**
- 文件必须真实存在，不允许占位符
- 一次只能发一个文件
- 视频文件建议先压缩（微信有大小限制）
- 主动发送默认发给最近可用会话；如需指定联系人，用 `-Target`
- 如果返回缺少或过期 `context_token`，请用户先在手机微信里给 Codex bot 发任意一条消息，然后重试发送

## 返回示例

成功：`Sent to Codex Weixin.`
失败：按命令输出提示处理。
