// Generate hooks.json — called by install scripts
// Usage: node gen-hooks.mjs <plugin-root>
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const pluginRoot = process.argv[2] || join(homedir(), ".codex", "plugins", "weixin-agent-sdk-plugin-codex");
const hookScript = join(pluginRoot, "hooks", "session-start.mjs");

const config = {
  hooks: {
    SessionStart: [{
      type: "command",
      command: `WEIXIN_PLUGIN_ROOT="${pluginRoot}" node "${hookScript}"`,
      timeout: 15
    }]
  }
};

const dest = join(homedir(), ".codex", "hooks.json");
writeFileSync(dest, JSON.stringify(config, null, 2), "utf-8");
console.log("hooks.json generated:", dest);
