# weixin-agent-sdk Codex 插件

让 Codex 通过微信收发消息、图片、视频、文件。

安装脚本会安装依赖、注册 skills、启用 hooks，并安装 Codex 微信桥接的命令行入口。

## 安装

### 大白话
1、解压后，先获取文件夹目录地址，如："C:\Users\bigge\Desktop\plugin-myself\weixin-agent-sdk-plugin-codex"
2、直接在对话框输入安装提示词：安装一下这个插件，插件地址："C:\Users\bigge\Desktop\plugin-myself\weixin-agent-sdk-plugin-codex"

### Mac
```bash
cd weixin-agent-sdk-plugin-codex
bash install.sh
```

### Windows
```powershell
cd weixin-agent-sdk-plugin-codex
powershell -ExecutionPolicy Bypass -File install.ps1
```

安装脚本会自动：
- 复制 6 个 skill 到 `~/.agents/skills/`
- 复制 hook 脚本到 `~/.agents/hooks/`
- 启用 `codex_hooks`
- 配置 SessionStart 自动启动

Windows 安装脚本还会安装 `codex-weixin-*` 命令到 `~/.local/bin/`。

如果安装后命令不可用，请确认 `~/.local/bin` 已加入 PATH。

## 使用

| 技能 | 说明 |
|------|------|
| `$weixin-auth` | 扫码授权（**换一个微信号**，别跟 Claude 的 bot 用同一个） |
| `$weixin-start` | 启动桥接（自动启动失败时使用） |
| `$weixin-stop` | 停止桥接 |
| `$weixin-status` | 查看授权和桥接状态 |
| `$weixin-send` | 主动发消息/文件到微信 |
| `$weixin-send-file` | 在回复中发送文件 |

SessionStart hook 会在 Codex 启动时自动启动桥接（端口 11810，codex-acp）。

也可以直接使用命令：

```powershell
codex-weixin-status
codex-weixin-start
codex-weixin-stop
codex-weixin-send "C:\path\to\file.png" "说明文字"
```

## 发送文件

使用 `codex-weixin-send` 发送真实存在的绝对路径：

```powershell
codex-weixin-send "C:\Users\name\project\out\demo.mp4" "已经渲染好了。"
```

主动发送默认发给最近可用会话，也可以通过 `/conversations` 查看会话后指定 target。`context_token` 会随最近会话持久化一段时间；如果提示 token 缺失或过期，请先在手机微信里给 Codex bot 发任意一条消息，然后重试发送。

## 与 Claude Code 共存

| | Claude Code | Codex |
|---|---|---|
| 端口 | 11809 | 11810 |
| 微信 bot | 各自独立 | 各自独立 |

两个插件互不干扰，可以同时运行。微信里分别给不同的 bot 发消息。

## 目录结构

```
bin/            Windows 命令包装（codex-weixin-start / stop / status / send）
hooks/          SessionStart 钩子：Codex 启动时自动检查授权并拉起桥接
skills/         6 个 skill：weixin-auth / start / stop / status / send / send-file
vendor/         桥接核心实现（bridge-server.mjs / acp-agent.mjs / start-bridge.mjs 等）
vendor/sdk/     weixin-agent-sdk 本地内置副本
.codex/         Codex 钩子配置（hooks.json）
.codex-plugin/  插件清单（plugin.json）
```

## 依赖与致谢

- 运行依赖：`weixin-agent-sdk`、`@agentclientprotocol/sdk`、`@agentclientprotocol/codex-acp`、`cross-spawn`
- `vendor/sdk/` 是 [weixin-agent-sdk](https://www.npmjs.com/package/weixin-agent-sdk) v0.5.0 的本地内置副本（MIT License），随插件一同分发以便离线安装，版权归原作者所有。

## 说明

- 桥接端口固定为 **11810**，与 Claude Code 版（11809）隔离，两者可同时运行。
- 授权状态与对话记录保存在 `~/.codex/weixin-agent-sdk-plugin-codex-state`，卸载时可直接删除该目录。
