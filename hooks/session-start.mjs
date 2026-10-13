// SessionStart hook for Codex — check bridge on port 11810, auto-start
import { execSync, spawn } from "node:child_process";
import { platform } from "node:os";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const isWin = platform() === "win32";
const BRIDGE_PORT = "11810";
const STATE_DIR = join(process.env.HOME || process.env.USERPROFILE, ".codex", "weixin-agent-sdk-plugin-codex-state");
const PLUGIN_ROOT = process.env.WEIXIN_PLUGIN_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLED_CODEX_PATH = join(PLUGIN_ROOT, "node_modules", "@openai", "codex", "bin", "codex.js");
const DESKTOP_CODEX_PATH = "/Applications/ChatGPT.app/Contents/Resources/codex";
const DEFAULT_CODEX_PATH = existsSync(DESKTOP_CODEX_PATH) ? DESKTOP_CODEX_PATH : BUNDLED_CODEX_PATH;
const execOpts = { timeout: 3000, encoding: "utf-8", stdio: "pipe", ...(isWin ? { windowsHide: true } : {}) };

function isBridgeAlive() {
  try {
    const r = execSync("curl -s http://127.0.0.1:" + BRIDGE_PORT + "/status", execOpts);
    return JSON.parse(r)?.running === true;
  } catch {
    return false;
  }
}

function getAccountId() {
  try {
    const f = join(STATE_DIR, "codex-account-id.txt");
    return existsSync(f) ? readFileSync(f, "utf-8").trim() : null;
  } catch { return null; }
}

function startBridge(bridgePath) {
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  const env = {
    ...process.env,
    WEIXIN_BRIDGE_PORT: BRIDGE_PORT,
    WEIXIN_ACCOUNT_ID: getAccountId() || "",
    WEIXIN_ACP_AGENT: "codex",
    CODEXCLAW_STATE_DIR: STATE_DIR,
    WEIXIN_INBOX_DIR: join(STATE_DIR, "inbox"),
    CODEX_PATH: process.env.CODEX_PATH || process.env.CODEX_CLI_PATH || DEFAULT_CODEX_PATH,
    CODEX_CLI_PATH: process.env.CODEX_PATH || process.env.CODEX_CLI_PATH || DEFAULT_CODEX_PATH,
    CODEX_HOME: process.env.CODEX_HOME || join(home, ".codex"),
    APP_SERVER_LOGS: process.env.APP_SERVER_LOGS || join(STATE_DIR, "logs"),
  };
  const child = spawn("node", [bridgePath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env,
  });
  child.unref();
  return child.pid;
}

// === Fast path: no async imports, under 15s timeout ===

const accountId = getAccountId();
const bridgeAlive = isBridgeAlive();

let context = "";

if (!accountId) {
  context = `## 微信桥接状态

⚠️ **Codex 微信 bot 尚未授权。**

请立即告诉用户："检测到 Codex 微信 bot 尚未授权。请运行 \\$weixin-auth 扫码绑定。"`;
} else if (bridgeAlive) {
  context = `## 微信桥接状态

✅ Codex 微信 bot 运行中（端口 ${BRIDGE_PORT}）。

微信消息自动处理中。`;
} else {
  const bridgePath = join(PLUGIN_ROOT, "vendor", "bridge-server.mjs");
  if (existsSync(bridgePath)) {
    try {
      const pid = startBridge(bridgePath);
      context = `## 微信桥接状态

✅ Codex 微信 bot 已自动启动（端口 ${BRIDGE_PORT}, PID: ${pid}, 账号: ${accountId}）。

微信消息自动处理中。`;
    } catch (e) {
      context = `## 微信桥接状态

⚠️ 启动失败: ${e.message}`;
    }
  } else {
    context = `## 微信桥接状态

⚠️ 找不到 bridge-server.mjs: ${bridgePath}`;
  }
}

const out = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: context,
  },
});

process.stdout.write(out);
process.exit(0);
