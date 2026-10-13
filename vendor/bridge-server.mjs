// 微信桥接 + 主动发送接口 + 指定对话
// Codex ↔ 微信常驻，本地 HTTP 可随时发消息/媒体到指定联系人
import { createServer } from "node:http";
import { existsSync, statSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import {
  start,
  isLoggedIn,
  login as wxLogin,
  getContextToken,
  listWeixinAccountIds,
  markdownToPlainText,
  resolveWeixinAccount,
  sendMessageWeixin,
  sendWeixinMediaFile,
} from "./sdk/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEND_PORT = parseInt(process.env.WEIXIN_BRIDGE_PORT || "11810", 10);
const ACCOUNT_ID = process.env.WEIXIN_ACCOUNT_ID || undefined;
const CODEX_PATH = process.env.CODEX_PATH || process.env.CODEX_CLI_PATH || "codex";
const CODEX_HOME = process.env.CODEX_HOME || "";
const CODEX_CWD = process.env.WEIXIN_CODEX_CWD || "";
const APP_SERVER_LOGS = process.env.APP_SERVER_LOGS || "";
const STATE_DIR =
  process.env.CODEXCLAW_STATE_DIR ||
  join(homedir(), ".codex", "weixin-agent-sdk-plugin-codex-state");
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

const DATA_DIR = join(STATE_DIR, "weixin-agent-sdk");
const CONV_FILE = join(DATA_DIR, "conversations.json");
mkdirSync(DATA_DIR, { recursive: true });

const acpMod = await import("./acp-agent.mjs");
const AcpAgent = acpMod.t;

let conversationStore = new Map();
let bridgeBot = null;
let bridgeAccountId = null;
let bridgeBaseUrl = null;
let bridgeCdnBaseUrl = null;
let bridgeToken = null;

function loadConversations() {
  try {
    const raw = readFileSync(CONV_FILE, "utf-8");
    const arr = JSON.parse(raw);
    conversationStore = new Map(arr.map((e) => [e.id, e]));
  } catch {
    conversationStore = new Map();
  }
}

function saveConversations() {
  writeFileSync(CONV_FILE, JSON.stringify([...conversationStore.values()], null, 2), "utf-8");
}

function trackConversation(userId, groupId, contextToken) {
  const key = groupId || userId;
  if (!key) return;
  const existing = conversationStore.get(key);
  conversationStore.set(key, {
    id: key,
    userId,
    groupId: groupId || null,
    lastSeen: Date.now(),
    firstSeen: existing?.firstSeen || Date.now(),
    contextToken: contextToken || existing?.contextToken || null,
    contextTokenUpdatedAt: contextToken ? Date.now() : existing?.contextTokenUpdatedAt || null,
  });
  saveConversations();
}

function getRecentConversations() {
  const cutoff = Date.now() - TOKEN_TTL_MS;
  return [...conversationStore.values()]
    .filter((c) => (c.contextTokenUpdatedAt || c.lastSeen || 0) >= cutoff)
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

function getStoredContextToken(conversation) {
  if (!conversation?.contextToken) return null;
  const updatedAt = conversation.contextTokenUpdatedAt || conversation.lastSeen || 0;
  if (Date.now() - updatedAt > TOKEN_TTL_MS) return null;
  return conversation.contextToken;
}

function findConversation(query) {
  if (!query) return null;
  const lower = String(query).toLowerCase().trim();
  const all = [...conversationStore.values()];
  const exact = all.find((c) => c.userId === query || c.id === query);
  if (exact) return exact;
  const partial = all.filter((c) =>
    (c.userId || "").toLowerCase().includes(lower) ||
    (c.id || "").toLowerCase().includes(lower)
  );
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) return { _ambiguous: true, matches: partial };
  return null;
}

function resolveAcpCommand() {
  const jsEntry = resolve(__dirname, "..", "node_modules", "@agentclientprotocol", "codex-acp", "dist", "index.js");
  return { command: process.execPath, args: [jsEntry] };
}

loadConversations();

const server = createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "GET" && req.url.startsWith("/conversations")) {
    const url = new URL(req.url, "http://localhost");
    const recentOnly = url.searchParams.get("recent") !== "0";
    const list = recentOnly ? getRecentConversations() : [...conversationStore.values()];
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, count: list.length, conversations: list }));
  }

  if (req.method === "POST" && req.url === "/send") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const { target, file, caption } = JSON.parse(body || "{}");

        if (!bridgeBot) {
          res.writeHead(503);
          return res.end(JSON.stringify({ ok: false, error: "桥接尚未就绪" }));
        }

        let selected = null;
        let toUserId = null;
        let targetName = "最近会话";

        if (target) {
          const found = findConversation(target);
          if (!found) {
            res.writeHead(404);
            return res.end(JSON.stringify({
              ok: false,
              error: `未找到对话: "${target}"。可访问 http://127.0.0.1:${SEND_PORT}/conversations 查看可用对话。`,
            }));
          }
          if (found._ambiguous) {
            res.writeHead(300);
            return res.end(JSON.stringify({
              ok: false,
              error: `找到多个匹配: "${target}"`,
              matches: found.matches.map((m) => ({
                id: m.id,
                lastSeen: new Date(m.lastSeen).toLocaleString("zh-CN"),
              })),
            }));
          }
          selected = found;
          toUserId = found.userId;
          targetName = found.id;
        } else {
          selected = getRecentConversations()[0] || null;
          if (!selected) {
            res.writeHead(400);
            return res.end(JSON.stringify({
              ok: false,
              error: "没有可用会话或 context_token 已过期。请先让对方给 Codex 微信 bot 发一条消息，或在 /send 中指定 target。",
            }));
          }
          toUserId = selected.userId;
          targetName = selected.id;
        }

        const token = getContextToken(bridgeAccountId, toUserId) || getStoredContextToken(selected);
        if (!token) {
          res.writeHead(400);
          return res.end(JSON.stringify({
            ok: false,
            error: `无法获取 ${targetName} 的 context_token。请先让对方给 Codex 微信 bot 发一条消息，然后重试。`,
          }));
        }

        const apiOpts = {
          baseUrl: bridgeBaseUrl,
          token: bridgeToken,
          contextToken: token,
        };

        if (!file) {
          if (!caption) {
            res.writeHead(400);
            return res.end(JSON.stringify({ ok: false, error: "缺少 caption 或 file" }));
          }
          console.log(`[send] -> ${targetName}: ${caption.slice(0, 50)}`);
          await sendMessageWeixin({
            to: toUserId,
            text: caption,
            opts: apiOpts,
          });
          res.writeHead(200);
          return res.end(JSON.stringify({ ok: true, target: targetName, text: caption }));
        }

        const fpath = resolve(file);
        if (!existsSync(fpath)) {
          res.writeHead(400);
          return res.end(JSON.stringify({ ok: false, error: `文件不存在: ${fpath}` }));
        }
        const ext = fpath.split(".").pop().toLowerCase();
        const m = { mp4: "video", mov: "video", png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", pdf: "file", txt: "file" };
        const mediaType = m[ext] || "file";
        const sizeMB = (statSync(fpath).size / 1024 / 1024).toFixed(1);

        console.log(`[send] -> ${targetName}: ${fpath} (${mediaType}, ${sizeMB}MB)`);
        await sendWeixinMediaFile({
          filePath: fpath,
          to: toUserId,
          text: caption ? markdownToPlainText(caption) : " ",
          opts: apiOpts,
          cdnBaseUrl: bridgeCdnBaseUrl,
        });
        res.writeHead(200);
        return res.end(JSON.stringify({ ok: true, target: targetName, file: fpath, type: mediaType, sizeMB }));
      } catch (e) {
        console.error("[send] 失败:", e.message);
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === "GET" && req.url === "/status") {
    res.writeHead(200);
    return res.end(JSON.stringify({ ok: true, running: !!bridgeBot, conversations: conversationStore.size }));
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(SEND_PORT, "127.0.0.1", () => {
  console.log(`[send] API: http://127.0.0.1:${SEND_PORT}/send`);
  console.log(`[send] 会话: http://127.0.0.1:${SEND_PORT}/conversations`);
});

async function main() {
  if (!isLoggedIn()) {
    console.log("未登录，正在扫码...");
    await wxLogin();
  }


  // Patch model catalog so codex-model-gateway entries don't break ACP init
  (() => {
    const catPath = join(homedir(), ".codex", "codex-model-gateway-catalog.json");
    try {
      if (!existsSync(catPath)) return;
      const data = JSON.parse(readFileSync(catPath, "utf-8"));
      let changed = false;
      for (const m of data.models || []) {
        if (!("supports_reasoning_summaries" in m)) { m.supports_reasoning_summaries = false; changed = true; }
      }
      if (changed) { writeFileSync(catPath, JSON.stringify(data, null, 2), "utf-8"); }
    } catch { /* not critical */ }
  })();

  const acpCommand = resolveAcpCommand();
  const agent = new AcpAgent({
    command: acpCommand.command,
    args: acpCommand.args,
    cwd: CODEX_CWD || process.cwd(),
    env: {
      CODEX_PATH,
      CODEX_HOME,
      CODEX_CLI_PATH: CODEX_PATH,
      APP_SERVER_LOGS,
    },
  });

  const ac = new AbortController();
  process.on("SIGINT", () => { agent.dispose(); ac.abort(); });
  process.on("SIGTERM", () => { agent.dispose(); ac.abort(); });

  bridgeAccountId = ACCOUNT_ID || listWeixinAccountIds()[0];
  const account = resolveWeixinAccount(bridgeAccountId);
  bridgeBaseUrl = account.baseUrl;
  bridgeCdnBaseUrl = account.cdnBaseUrl;
  bridgeToken = account.token;

  const chat = agent.chat.bind(agent);
  agent.chat = async (request) => {
    trackConversation(request.conversationId, null, request.contextToken);
    return chat(request);
  };

  bridgeBot = await start(agent, { abortSignal: ac.signal, accountId: bridgeAccountId });
  console.log(`[bridge] 微信桥接已启动 (端口 ${SEND_PORT}, 账号 ${bridgeAccountId})`);
  await bridgeBot.wait();
}

main().catch((e) => {
  console.error("[bridge] 启动失败:", e.message);
  process.exit(1);
});
