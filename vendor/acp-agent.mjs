import spawn from "cross-spawn";
import { Readable, Writable } from "node:stream";
import { ClientSideConnection, PROTOCOL_VERSION, ndJsonStream } from "@agentclientprotocol/sdk";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
//#region src/acp-connection.ts
function log$1(msg) {
	console.log(`[acp] ${msg}`);
}
function describeToolCall(update) {
	return update.title ?? update.kind ?? update.toolCallId ?? "tool";
}
/**
* Manages the ACP agent subprocess and ClientSideConnection lifecycle.
*/
var AcpConnection = class {
	process = null;
	connection = null;
	ready = false;
	collectors = /* @__PURE__ */ new Map();
	onExit;
	constructor(options, onExit) {
		this.options = options;
		this.onExit = onExit;
	}
	registerCollector(sessionId, collector) {
		this.collectors.set(sessionId, collector);
	}
	unregisterCollector(sessionId) {
		this.collectors.delete(sessionId);
	}
	/**
	* Ensure the subprocess is running and the connection is initialized.
	*/
	async ensureReady() {
		if (this.ready && this.connection) return this.connection;
		const args = this.options.args ?? [];
		log$1(`spawning: ${this.options.command} ${args.join(" ")}`);
		const proc = spawn(this.options.command, args, {
			stdio: [
				"pipe",
				"pipe",
				"inherit"
			],
			env: {
				...process.env,
				...this.options.env
			},
			cwd: this.options.cwd,
			windowsHide: true
		});
		this.process = proc;
		proc.on("exit", (code) => {
			log$1(`subprocess exited (code=${code})`);
			this.ready = false;
			this.connection = null;
			this.process = null;
			this.onExit?.();
		});
		const conn = new ClientSideConnection((_agent) => ({
			sessionUpdate: async (params) => {
				const update = params.update;
				switch (update.sessionUpdate) {
					case "tool_call":
						log$1(`tool_call: ${describeToolCall(update)} (${update.status ?? "started"})`);
						break;
					case "tool_call_update":
						if (update.status) log$1(`tool_call_update: ${describeToolCall(update)} → ${update.status}`);
						break;
					case "agent_thought_chunk":
						if (update.content.type === "text") log$1(`thinking: ${update.content.text.slice(0, 100)}`);
						break;
				}
				const collector = this.collectors.get(params.sessionId);
				if (collector) collector.handleUpdate(params);
			},
			requestPermission: async (params) => {
				const firstOption = params.options[0];
				log$1(`permission: auto-approved "${firstOption?.name ?? "allow"}" (${firstOption?.optionId ?? "unknown"})`);
				return { outcome: {
					outcome: "selected",
					optionId: firstOption?.optionId ?? "allow"
				} };
			}
		}), ndJsonStream(Writable.toWeb(proc.stdin), Readable.toWeb(proc.stdout)));
		log$1("initializing connection...");
		await conn.initialize({
			protocolVersion: PROTOCOL_VERSION,
			clientInfo: {
				name: "weixin-agent-sdk",
				version: "0.1.0"
			},
			clientCapabilities: {}
		});
		log$1("connection initialized");
		this.connection = conn;
		this.ready = true;
		return conn;
	}
	/**
	* Kill the subprocess and clean up.
	*/
	dispose() {
		this.ready = false;
		this.collectors.clear();
		if (this.process) {
			this.process.kill();
			this.process = null;
		}
		this.connection = null;
	}
};
//#endregion
//#region src/content-converter.ts
/**
* Convert a ChatRequest into ACP ContentBlock[].
*/
async function convertRequestToContentBlocks(request) {
	const blocks = [];
	if (request.text) blocks.push({
		type: "text",
		text: request.text
	});
	if (request.media) {
		const base64 = (await fs.readFile(request.media.filePath)).toString("base64");
		const mimeType = request.media.mimeType;
		switch (request.media.type) {
			case "image":
				blocks.push({
					type: "image",
					data: base64,
					mimeType
				});
				break;
			case "audio":
				blocks.push({
					type: "audio",
					data: base64,
					mimeType
				});
				break;
			case "video":
			case "file": {
				const uri = `file://${request.media.filePath}`;
				blocks.push({
					type: "resource",
					resource: {
						uri,
						blob: base64,
						mimeType
					}
				});
				break;
			}
		}
	}
	return blocks;
}
//#endregion
//#region src/response-collector.ts
const ACP_MEDIA_OUT_DIR = path.join(os.tmpdir(), "weixin-agent/media/acp-out");
function mimeFromPath(filePath) {
	const ext = path.extname(filePath).toLowerCase();
	return {
		".mp4": "video/mp4",
		".mov": "video/quicktime",
		".webm": "video/webm",
		".mkv": "video/x-matroska",
		".avi": "video/x-msvideo",
		".png": "image/png",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".gif": "image/gif",
		".webp": "image/webp",
		".bmp": "image/bmp",
		".pdf": "application/pdf",
		".doc": "application/msword",
		".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		".zip": "application/zip",
		".tar": "application/x-tar",
		".gz": "application/gzip",
		".txt": "text/plain",
		".csv": "text/csv"
	}[ext] ?? "application/octet-stream";
}
const SEND_FILE_RE = /\[send_file:([^\]]+)\]/;
/**
* Collects sessionUpdate notifications for a single prompt round-trip
* and converts the accumulated result into a ChatResponse.
*/
var ResponseCollector = class {
	textChunks = [];
	imageData = null;
	resourceData = null;
	/**
	* Feed a sessionUpdate notification into the collector.
	*/
	handleUpdate(notification) {
		const update = notification.update;
		if (update.sessionUpdate === "agent_message_chunk") {
			const content = update.content;
			if (content.type === "text") this.textChunks.push(content.text);
			else if (content.type === "image") this.imageData = {
				base64: content.data,
				mimeType: content.mimeType
			};
			else if (content.type === "resource") {
				const resource = content.resource;
				if ("blob" in resource) this.resourceData = {
					base64: resource.blob,
					mimeType: resource.mimeType ?? "application/octet-stream",
					uri: resource.uri
				};
			}
		}
	}
	/**
	* Build a ChatResponse from all collected chunks.
	*/
	async toResponse() {
		const response = {};
		let text = this.textChunks.join("");
		const sendMatch = text.match(SEND_FILE_RE);
		if (sendMatch) {
			const filePath = sendMatch[1].trim();
			text = text.replace(SEND_FILE_RE, "").trim();
			if (text) response.text = text;
			const mimeType = mimeFromPath(filePath);
			let mediaType;
			if (mimeType.startsWith("video/")) mediaType = "video";
			else if (mimeType.startsWith("image/")) mediaType = "image";
			else mediaType = "file";
			response.media = {
				type: mediaType,
				url: filePath
			};
			if (mediaType === "file") response.media.fileName = path.basename(filePath);
			return response;
		}
		if (text) response.text = text;
		if (this.imageData) {
			await fs.mkdir(ACP_MEDIA_OUT_DIR, { recursive: true });
			const ext = this.imageData.mimeType.split("/")[1] ?? "png";
			const filename = `${crypto.randomUUID()}.${ext}`;
			const filePath = path.join(ACP_MEDIA_OUT_DIR, filename);
			await fs.writeFile(filePath, Buffer.from(this.imageData.base64, "base64"));
			response.media = {
				type: "image",
				url: filePath
			};
		} else if (this.resourceData) {
			await fs.mkdir(ACP_MEDIA_OUT_DIR, { recursive: true });
			const mimeType = this.resourceData.mimeType;
			let mediaType;
			if (mimeType.startsWith("video/")) mediaType = "video";
			else if (mimeType.startsWith("image/")) mediaType = "image";
			else mediaType = "file";
			let fileName;
			try {
				const url = new URL(this.resourceData.uri);
				fileName = path.basename(url.pathname);
			} catch {}
			const ext = mimeType.split("/")[1] ?? "bin";
			const fname = fileName ?? `${crypto.randomUUID()}.${ext}`;
			const filePath = path.join(ACP_MEDIA_OUT_DIR, fname);
			await fs.writeFile(filePath, Buffer.from(this.resourceData.base64, "base64"));
			response.media = {
				type: mediaType,
				url: filePath
			};
			if (fileName && mediaType === "file") response.media.fileName = fileName;
		}
		return response;
	}
};
//#endregion
//#region src/acp-agent.ts
function log(msg) {
	console.log(`[acp] ${msg}`);
}
/**
* Agent adapter that bridges ACP (Agent Client Protocol) agents
* to the weixin-agent-sdk Agent interface.
*/
var AcpAgent = class {
	connection;
	sessions = /* @__PURE__ */ new Map();
	options;
	constructor(options) {
		this.options = options;
		this.connection = new AcpConnection(options, () => {
			log("subprocess exited, clearing session cache");
			this.sessions.clear();
		});
	}
	async chat(request) {
		const conn = await this.connection.ensureReady();
		const sessionId = await this.getOrCreateSession(request.conversationId, conn);
		const blocks = await convertRequestToContentBlocks(request);
		if (blocks.length === 0) return { text: "" };
		log(`prompt: "${request.text?.slice(0, 50) || (request.media ? `[${request.media.type}]` : "")}" (session=${sessionId})`);
		const collector = new ResponseCollector();
		this.connection.registerCollector(sessionId, collector);
		try {
			await conn.prompt({
				sessionId,
				prompt: blocks
			});
		} finally {
			this.connection.unregisterCollector(sessionId);
		}
		const response = await collector.toResponse();
		log(`response: ${response.text?.slice(0, 80) ?? "[no text]"}${response.media ? " +media" : ""}`);
		return response;
	}
	async getOrCreateSession(conversationId, conn) {
		const existing = this.sessions.get(conversationId);
		if (existing) return existing;
		log(`creating new session for conversation=${conversationId}`);
		const res = await conn.newSession({
			cwd: this.options.cwd ?? process.cwd(),
			mcpServers: []
		});
		log(`session created: ${res.sessionId}`);
		this.sessions.set(conversationId, res.sessionId);
		return res.sessionId;
	}
	/**
	* Clear/reset the session for a given conversation.
	* The next message will automatically create a fresh session.
	*/
	clearSession(conversationId) {
		const sessionId = this.sessions.get(conversationId);
		if (sessionId) {
			log(`clearing session for conversation=${conversationId} (session=${sessionId})`);
			this.connection.unregisterCollector(sessionId);
			this.sessions.delete(conversationId);
		}
	}
	/**
	* Kill the ACP subprocess and clean up all sessions.
	*/
	dispose() {
		this.sessions.clear();
		this.connection.dispose();
	}
};
//#endregion
export { AcpAgent as t };
