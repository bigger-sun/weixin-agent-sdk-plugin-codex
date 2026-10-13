---
name: weixin-auth
description: 扫码授权，将微信 bot 绑定到你的微信号（使用前必须完成授权）
---

# 扫码授权微信 bot

这是使用所有其他微信功能的前提。

## 步骤

1. 先检查是否已授权：

```bash
node <插件目录>/vendor/weixin-login.mjs
```

`<插件目录>` 是 `AGENTS.md` 所在的插件根目录。如果已输出"已授权"，告知用户无需重复授权，可直接 `$weixin-start`。

2. 如果未授权，脚本会自动弹出扫码二维码。告诉用户用**微信**扫描。

3. 扫码后在微信中确认授权。终端显示"授权完成"即完成。

## 注意

- 需要 Node.js >= 22
- 授权 token 保存在 `~/.codex/weixin-agent-sdk-plugin-codex-state/` 目录
- 这是绑定微信 bot，不是登录个人微信账号
