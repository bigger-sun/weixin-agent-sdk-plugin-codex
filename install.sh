#!/bin/bash
# weixin-agent-sdk Codex Plugin — Mac/Linux 安装脚本
# 用法: bash install.sh

set -e
PLUGIN_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "=== weixin-agent-sdk Codex 插件安装 ==="

# 1. 安装 npm 依赖（如已内置则跳过）
echo "[1/6] 检查 npm 依赖..."
cd "$PLUGIN_ROOT"
if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" ]; then
  echo "  -> 已内置，跳过下载"
else
  npm install --omit=dev
  echo "  -> 完成"
fi

# 2. 修复 codex-acp 执行权限
echo "[2/6] 修复执行权限..."
chmod u+x "$PLUGIN_ROOT/node_modules/.bin/codex-acp" 2>/dev/null || true
echo "  -> 完成"

# 3. 复制 skills 到全局
echo "[3/6] 安装 skills..."
mkdir -p "$HOME/.agents/skills"
cp -r "$PLUGIN_ROOT/skills/"* "$HOME/.agents/skills/"
echo "  -> $HOME/.agents/skills/"

# 4. 复制 hook 脚本
echo "[4/6] 安装 hooks..."
mkdir -p "$HOME/.agents/hooks"
cp "$PLUGIN_ROOT/hooks/session-start.mjs" "$HOME/.agents/hooks/"
echo "  -> $HOME/.agents/hooks/"

# 5. 启用 codex_hooks + 配置 hooks.json
echo "[5/6] 启用 hooks..."
node "$PLUGIN_ROOT/vendor/enable-hooks.mjs"
node "$PLUGIN_ROOT/vendor/gen-hooks.mjs" "$PLUGIN_ROOT"
echo "  -> 完成"

# 6. 完成
echo "[6/6] 完成"
echo ""
echo "=== 安装完成 ==="
echo "重启 Codex，SessionStart hook 会自动启动微信桥接（端口 11810）。"
echo "首次使用: \$weixin-auth 扫码授权（换一个微信号）"
