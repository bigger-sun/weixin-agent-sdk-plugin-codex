//#region src/agent/interface.d.ts
/**
 * Agent interface — any AI backend that can handle a chat message.
 *
 * Implement this interface to connect WeChat to your own AI service.
 * The WeChat bridge calls `chat()` for each inbound message and sends
 * the returned response back to the user.
 */
interface Agent {
  /** Process a single message and return a reply. */
  chat(request: ChatRequest): Promise<ChatResponse>;
  /** Clear/reset the session for a given conversation. */
  clearSession?(conversationId: string): void;
}
interface ChatRequest {
  /** Conversation / user identifier. Use this to maintain per-user context. */
  conversationId: string;
  /** Text content of the message. */
  text: string;
  /** Attached media file (image, audio, video, or generic file). */
  media?: {
    type: "image" | "audio" | "video" | "file"; /** Local file path (already downloaded and decrypted). */
    filePath: string; /** MIME type, e.g. "image/jpeg", "audio/wav". */
    mimeType: string; /** Original filename (available for file attachments). */
    fileName?: string;
  };
}
interface ChatResponse {
  /** Reply text (may contain markdown — will be converted to plain text before sending). */
  text?: string;
  /** Reply media file. */
  media?: {
    type: "image" | "video" | "file"; /** Local file path or HTTPS URL. */
    url: string; /** Filename hint (for file attachments). */
    fileName?: string;
  };
}
//#endregion
//#region src/bot.d.ts
type LoginOptions = {
  /** Override the API base URL. */baseUrl?: string; /** Log callback (defaults to console.log). */
  log?: (msg: string) => void;
  /**
   * If true, open the QR-code URL in the default browser after fetching it.
   * The browser tab is closed automatically once login is confirmed.
   * Useful when the terminal can't render the QR (e.g. some CLI environments).
   */
  openBrowser?: boolean;
};
type StartOptions = {
  /** Account ID to use. Auto-selects the first registered account if omitted. */accountId?: string; /** AbortSignal to stop the bot. */
  abortSignal?: AbortSignal; /** Log callback (defaults to console.log). */
  log?: (msg: string) => void;
};
/**
 * Interactive QR-code login. Prints the QR code to the terminal and waits
 * for the user to scan it with WeChat.
 *
 * Returns the normalized account ID on success.
 */
declare function login(opts?: LoginOptions): Promise<string>;
/**
 * Remove all stored WeChat account credentials.
 */
declare function logout(opts?: {
  log?: (msg: string) => void;
}): void;
/**
 * Check whether at least one WeChat account is logged in and configured.
 */
declare function isLoggedIn(): boolean;
/**
 * A running bot instance — provides proactive messaging capability.
 *
 * - `sendMessage(text)` — send a text message to the logged-in user.
 * - `sendMessage(response)` — send a ChatResponse (text and/or media).
 */
declare class Bot {
  private readonly _accountId;
  private readonly _baseUrl;
  private readonly _cdnBaseUrl;
  private readonly _token?;
  private readonly _userId;
  private readonly _monitorPromise;
  /** @internal */
  constructor(params: {
    accountId: string;
    baseUrl: string;
    cdnBaseUrl: string;
    token?: string;
    userId: string;
    monitorPromise: Promise<void>;
  });
  /**
   * Wait until the background WeChat monitor stops.
   *
   * This is useful for CLI programs that should keep running until the bot is
   * aborted, and for surfacing unrecoverable monitor errors to the caller.
   */
  wait(): Promise<void>;
  /**
   * Proactively send a message to the logged-in WeChat user.
   *
   * Accepts either a plain string (sent as text) or a full `ChatResponse`
   * object (text and/or media).
   *
   * Requires at least one inbound message to have been received so that a
   * valid `context_token` is cached (tokens are valid for ~24 hours).
   */
  sendMessage(message: string | ChatResponse): Promise<void>;
}
/**
 * Start the bot — long-polls for new messages and dispatches them to the agent.
 *
 * Returns a `Bot` instance immediately. Use `bot.wait()` when a CLI program
 * should block until the background monitor stops.
 */
declare function start(agent: Agent, opts?: StartOptions): Bot;
//#endregion
//#region src/messaging/inbound.d.ts
/** Retrieve the cached context token for a given account+user pair. */
declare function getContextToken(accountId: string, userId: string): string | undefined;
//#endregion
//#region src/api/api.d.ts
type WeixinApiOptions = {
  baseUrl: string;
  token?: string;
  timeoutMs?: number; /** Long-poll timeout for getUpdates (server may hold the request up to this). */
  longPollTimeoutMs?: number;
};
//#endregion
//#region src/messaging/send.d.ts
/**
 * Convert markdown-formatted model reply to plain text for Weixin delivery.
 * Preserves newlines; strips markdown syntax.
 */
declare function markdownToPlainText(text: string): string;
/**
 * Send a plain text message downstream.
 * contextToken is required for all reply sends; missing it breaks conversation association.
 */
declare function sendMessageWeixin(params: {
  to: string;
  text: string;
  opts: WeixinApiOptions & {
    contextToken?: string;
  };
}): Promise<{
  messageId: string;
}>;
//#endregion
//#region src/messaging/send-media.d.ts
/**
 * Upload a local file and send it as a weixin message, routing by MIME type:
 *   video/*  → uploadVideoToWeixin        + sendVideoMessageWeixin
 *   image/*  → uploadFileToWeixin         + sendImageMessageWeixin
 *   else     → uploadFileAttachmentToWeixin + sendFileMessageWeixin
 *
 * Used by both the auto-reply deliver path (monitor.ts) and the outbound
 * sendMedia path (channel.ts) so they stay in sync.
 */
declare function sendWeixinMediaFile(params: {
  filePath: string;
  to: string;
  text: string;
  opts: WeixinApiOptions & {
    contextToken?: string;
  };
  cdnBaseUrl: string;
}): Promise<{
  messageId: string;
}>;
//#endregion
//#region src/auth/accounts.d.ts
/** Unified per-account data: token + baseUrl in one file. */
type WeixinAccountData = {
  token?: string;
  savedAt?: string;
  baseUrl?: string; /** Last linked Weixin user id from QR login (optional). */
  userId?: string;
};
/** Load account data by ID, with compatibility fallbacks. */
declare function loadWeixinAccount(accountId: string): WeixinAccountData | null;
type ResolvedWeixinAccount = {
  accountId: string;
  baseUrl: string;
  cdnBaseUrl: string;
  token?: string;
  enabled: boolean; /** true when a token has been obtained via QR login. */
  configured: boolean;
};
/** List accountIds from the index file (written at QR login). */
declare function listWeixinAccountIds(): string[];
/** Resolve a weixin account by ID, reading stored credentials. */
declare function resolveWeixinAccount(accountId?: string | null): ResolvedWeixinAccount;
//#endregion
export { type Agent, Bot, type ChatRequest, type ChatResponse, type LoginOptions, type StartOptions, getContextToken, isLoggedIn, listWeixinAccountIds, loadWeixinAccount, login, logout, markdownToPlainText, resolveWeixinAccount, sendMessageWeixin, sendWeixinMediaFile, start };