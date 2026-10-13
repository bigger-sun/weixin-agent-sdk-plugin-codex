# weixin-agent-sdk Codex 插件行为规范

## 核心理念

用户只需要做一件事：**扫码授权**。其余全部后台自动化。

## Session 启动自动行为

每次 Codex 启动时，SessionStart hook 自动执行：

- **未授权** → 提醒用户运行 `$weixin-auth` 扫码绑定
- **已授权但桥接未启动** → 后台自动拉起桥接，无需用户操作
- **桥接已运行** → 静默确认，用户无感知

你看到 SessionStart 的 additionalContext 后，仅在需要用户扫码时才开口；桥接自动启动成功后无需向用户汇报。

## 对用户暴露的技能

| 技能 | 是否提示用户 | 说明 |
|------|-------------|------|
| `$weixin-auth` | ✅ 唯一入口 | 扫码绑定微信 bot，只做一次 |
| `$weixin-start` | ❌ | 后台自动调用 |
| `$weixin-stop` | ❌ | 后台自动调用 |
| `$weixin-status` | ❌ | 后台自动调用 |
| `$weixin-send` | ❌ | Codex 内部使用 |
| `$weixin-send-file` | ❌ | Codex 内部使用 |

**绝对不要**提醒用户运行 `$weixin-start`、`$weixin-stop`、`$weixin-status`。这些全部后台自己处理。

## 发送文件到微信

回复中使用 `[send_file:绝对路径]` 标记来发送文件。桥接自动识别并上传。

**规则：**
- 必须用绝对路径，路径指向真实存在的文件
- `[send_file:...]` 标记不会显示在微信里
- 一次一个文件，多个文件分多次回复
- 发送前先确认文件存在

**正确写法：**
```
已经渲染好了：
[send_file:/Users/name/project/out/demo.mp4]
```

**错误写法（会导致报错）：**
```
[send_file:输出视频路径]       ← 占位符，文件不存在
[send_file:./output/video.mp4] ← 相对路径不行
[send_file:/path/not/exist]    ← 文件必须有，你自己确认过
```

## 微信对话注意事项

- 微信用户看不到 markdown 格式，回复会自动转纯文本
- 回复尽量简洁，避免过长
- 如果收到图片/语音，`request.media` 中会有下载后的本地文件路径

## 主动发消息

当需要主动给微信用户发消息时，后台调用 `$weixin-send` 技能，不要提示用户手动操作。

## Windows 兼容

插件支持 Windows，安装和使用流程与 Mac 一致。桥接进程通过 `windowsHide: true` 启动，不会弹出命令行窗口。
