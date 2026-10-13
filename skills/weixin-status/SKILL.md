---
name: weixin-status
description: 查看微信桥接的授权状态和运行状态
---

# 检查微信桥接状态

## 检查项目

### 1. 授权状态

```bash
codex-weixin-status
```

不要在任意工作目录里使用 `import('weixin-agent-sdk')` 检查授权；普通项目目录可能没有这个包。使用 `codex-weixin-status`，它会读取 Codex 专属账号文件和 `11810` 桥接状态。

### 2. Bridge 运行状态

```bash
codex-weixin-status
```

### 3. 汇总报告

将以上信息汇总，清晰地向用户报告：

- **授权状态**：已授权 / 未授权
- **桥接运行**：运行中 / 已停止
- 如果运行中，告知用户"Codex 正在微信中待命，可以随时收发消息"
- 如果未运行但已授权，建议 `$weixin-start`
- 如果未授权，建议 `$weixin-auth`
