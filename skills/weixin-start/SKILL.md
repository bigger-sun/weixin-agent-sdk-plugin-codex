---
name: weixin-start
description: 启动 Codex ↔ 微信桥接（端口 11810，Codex 专属 bot）
---

# 启动 Codex 微信桥接

## 前提

- 必须先完成 `$weixin-auth` 扫码授权（注册 Codex 专属 bot）
- Node.js >= 22

## 启动

```bash
codex-weixin-start
```

如果全局命令不可用，也可以在插件目录中运行：

```bash
node vendor/start-bridge.mjs
```

这个脚本会自动：
- 使用端口 **11810**（不跟 Claude 的 11809 冲突）
- 使用 Codex 专属账号（`~/.codex/weixin-agent-sdk-plugin-codex-state/codex-account-id.txt`）
- 使用当前插件 `vendor/bridge-server.mjs` 并后台启动

## 启动成功标志

- `Codex Weixin bridge started`
- 或者状态检查显示 `Bridge: running`

## 停止

用 `$weixin-stop` 停止桥接进程。
