// Enable codex_hooks in config.toml — UTF-8 safe
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const file = join(homedir(), ".codex", "config.toml");
mkdirSync(dirname(file), { recursive: true });

let content = "";
try { content = readFileSync(file, "utf-8"); } catch { /* file doesn't exist yet */ }

if (content.includes("codex_hooks")) {
  console.log("  -> codex_hooks 已启用（跳过）");
} else {
  if (/^\[features\]/m.test(content)) {
    content = content.replace(/^\[features\]/m, "[features]\ncodex_hooks = true");
  } else {
    content = "[features]\ncodex_hooks = true\n\n" + content;
  }
  writeFileSync(file, content, "utf-8");
  console.log("  -> 已启用 codex_hooks");
}
