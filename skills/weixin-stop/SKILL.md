---
name: weixin-stop
description: 停止微信桥接进程
---

# 停止微信桥接

停止正在运行的 Codex ↔ 微信桥接。

## 步骤

### Mac / Linux

```bash
lsof -ti:11810 | xargs kill
```

### Windows

```powershell
codex-weixin-stop
```

### 验证已停止

```bash
codex-weixin-status
```

输出 `Bridge: stopped` 说明 Codex 专用桥接已停止。不要检查或停止 Claude 专用的 `11809`。
