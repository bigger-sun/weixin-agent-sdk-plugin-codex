// Start Codex WeChat bridge on port 11810 with Codex account
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const home = homedir();
const __dirname = dirname(fileURLToPath(import.meta.url));
const bridgePath = join(__dirname, "bridge-server.mjs");
const bundledCodexPath = join(__dirname, "..", "node_modules", "@openai", "codex", "bin", "codex.js");
const desktopCodexPath = "/Applications/ChatGPT.app/Contents/Resources/codex";
const defaultCodexPath = existsSync(desktopCodexPath) ? desktopCodexPath : bundledCodexPath;

const stateDir = process.env.CODEXCLAW_STATE_DIR || join(home, ".codex", "weixin-agent-sdk-plugin-codex-state");
const accountFile = join(stateDir, "codex-account-id.txt");
const accountId = existsSync(accountFile) ? readFileSync(accountFile, "utf-8").trim() : "";

if (!accountId) {
  console.error("错误: 未找到 Codex 专属账号。请先运行 $weixin-auth 注册。");
  process.exit(1);
}

console.log(`启动 Codex 微信桥接...`);
console.log(`  端口: 11810`);
console.log(`  账号: ${accountId}`);
console.log(`  ACP: codex`);

const child = spawn("node", [bridgePath], {
  detached: true,
  stdio: "ignore",
  windowsHide: true,
  env: {
    ...process.env,
    WEIXIN_BRIDGE_PORT: "11810",
    WEIXIN_ACCOUNT_ID: accountId,
    WEIXIN_ACP_AGENT: "codex",
    CODEXCLAW_STATE_DIR: stateDir,
    WEIXIN_INBOX_DIR: join(stateDir, "inbox"),
    CODEX_PATH: process.env.CODEX_PATH || process.env.CODEX_CLI_PATH || defaultCodexPath,
    CODEX_CLI_PATH: process.env.CODEX_PATH || process.env.CODEX_CLI_PATH || defaultCodexPath,
    CODEX_HOME: process.env.CODEX_HOME || join(home, ".codex"),
    APP_SERVER_LOGS: process.env.APP_SERVER_LOGS || join(stateDir, "logs"),
  },
});
child.unref();

console.log(`  PID: ${child.pid}`);
console.log("桥接已启动！");
