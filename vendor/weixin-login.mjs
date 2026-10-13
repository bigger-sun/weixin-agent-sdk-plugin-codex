// WeChat bot login for Codex — creates a new bot, saves account ID
// Default: opens QR URL in the default browser. Set WEIXIN_AUTH_OPEN_BROWSER=0 for terminal-only.
import { login } from "./sdk/index.mjs";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const home = homedir();
const stateDir = process.env.CODEXCLAW_STATE_DIR || join(home, ".codex", "weixin-agent-sdk-plugin-codex-state");
const weixinDir = join(stateDir, "codexclaw-weixin");
const accountFile = join(stateDir, "codex-account-id.txt");
const accountsJson = join(weixinDir, "accounts.json");
process.env.CODEXCLAW_STATE_DIR = stateDir;
process.env.WEIXIN_INBOX_DIR ||= join(stateDir, "inbox");

const openBrowser = process.env.WEIXIN_AUTH_OPEN_BROWSER !== "0";

console.log("正在为 Codex 注册独立的微信 bot...");
console.log("请用一个不同的微信号扫码（不要用 Claude bot 绑定的那个微信）\n");

if (openBrowser) {
  console.log("[browser mode] 二维码将在默认浏览器中打开，扫描后标签页自动关闭。\n");
} else {
  console.log("[terminal mode] 如终端未显示二维码，可重启 Codex 后重试。\n");
}

// Remember existing accounts before login overwrites them
let oldAccounts = [];
try {
  if (existsSync(accountsJson)) {
    oldAccounts = JSON.parse(readFileSync(accountsJson, "utf-8"));
  }
} catch {}

let accountId;
try {
  accountId = await login({ openBrowser });
} catch (err) {
  console.error("\n登录失败：", err instanceof Error ? err.message : String(err));
  process.exit(1);
}

console.log(`\nCodex bot 注册成功！账号 ID: ${accountId}`);

// Fix: login() overwrites accounts.json, restore old accounts
if (oldAccounts.length > 0) {
  const merged = [...new Set([...oldAccounts, accountId])];
  mkdirSync(weixinDir, { recursive: true });
  writeFileSync(accountsJson, JSON.stringify(merged, null, 2), "utf-8");
  console.log(`已合并账号列表: ${merged.join(", ")}`);
}

mkdirSync(stateDir, { recursive: true });
writeFileSync(accountFile, accountId, "utf-8");
console.log(`已保存到 ${accountFile}`);
console.log("\n现在可以用 $weixin-start 启动桥接了。");
