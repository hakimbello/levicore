import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { app } from "electron";
import type {
  AIChatAttachment,
  AIChatCancelRequest,
  AIChatConversation,
  AIChatDeleteRequest,
  AIChatDeleteMessageRequest,
  AIChatDockPosition,
  AIChatEvent,
  AIChatExportRequest,
  AIChatExportResult,
  AIChatForkRequest,
  AIChatMessage,
  AIChatNewRequest,
  AIChatRenameRequest,
  AIChatSendRequest,
  AIChatSendResult,
  AIChatSetPanelRequest,
  AIChatState
} from "../../src/features/ai-chat";
import type { AIRuntimeProviderId } from "../../src/features/ai-runtime";
import { RuntimeManager, validateModelId, validateRuntimeProviderId } from "./ai-runtime";

const CHAT_STATE_FILE = "ai-chat-state.json";
const MAX_CONVERSATIONS = 100;
const MAX_MESSAGES = 400;
const MAX_MESSAGE_LENGTH = 120_000;
const MAX_ATTACHMENT_COUNT = 12;
const MAX_ATTACHMENT_CONTENT = 40_000;
const DOCK_POSITIONS: AIChatDockPosition[] = ["left", "right", "bottom", "floating"];

type ChatServiceOptions = {
  statePath?: string;
  emit?: (event: AIChatEvent) => void;
};

type ChatPersistence = {
  conversations: AIChatConversation[];
  activeConversationId?: string;
  panel: { dockPosition: AIChatDockPosition };
};

type ActiveRequest = {
  conversationId: string;
  messageId: string;
};

export class ChatService {
  private readonly statePath: string;
  private readonly emit: (event: AIChatEvent) => void;
  private persistence: ChatPersistence = defaultPersistence();
  private activeRequests = new Map<string, ActiveRequest>();

  constructor(
    private readonly runtimeManager: RuntimeManager,
    options: ChatServiceOptions = {}
  ) {
    this.statePath =
      options.statePath ??
      path.join(typeof app?.getPath === "function" ? app.getPath("userData") : os.tmpdir(), CHAT_STATE_FILE);
    this.emit = options.emit ?? (() => undefined);
  }

  async initialize(): Promise<AIChatState> {
    await this.load();
    return this.snapshot();
  }

  list(): AIChatState {
    return this.snapshot();
  }

  async setPanel(rawRequest: unknown): Promise<AIChatState> {
    const request = validatePanelRequest(rawRequest);
    this.persistence.panel.dockPosition = request.dockPosition;
    await this.persistAndEmit();
    return this.snapshot();
  }

  async newChat(rawRequest: unknown = {}): Promise<AIChatState> {
    const request = validateNewRequest(rawRequest);
    const now = new Date().toISOString();
    const conversation: AIChatConversation = {
      id: randomUUID(),
      title: request.title ?? "New Chat",
      messages: [],
      runtimeId: request.runtimeId,
      modelId: request.modelId,
      pinned: false,
      createdAt: now,
      updatedAt: now
    };
    this.persistence.conversations = [conversation, ...this.persistence.conversations].slice(0, MAX_CONVERSATIONS);
    this.persistence.activeConversationId = conversation.id;
    await this.persistAndEmit();
    return this.snapshot();
  }

  async rename(rawRequest: unknown): Promise<AIChatState> {
    const request = validateRenameRequest(rawRequest);
    const conversation = this.requireConversation(request.conversationId);
    conversation.title = request.title;
    conversation.updatedAt = new Date().toISOString();
    await this.persistAndEmit();
    return this.snapshot();
  }

  async delete(rawRequest: unknown): Promise<AIChatState> {
    const request = validateDeleteRequest(rawRequest);
    this.persistence.conversations = this.persistence.conversations.filter((item) => item.id !== request.conversationId);
    if (this.persistence.activeConversationId === request.conversationId) {
      this.persistence.activeConversationId = this.persistence.conversations[0]?.id;
    }
    await this.persistAndEmit();
    return this.snapshot();
  }

  async pin(rawRequest: unknown): Promise<AIChatState> {
    const request = validateDeleteRequest(rawRequest);
    const conversation = this.requireConversation(request.conversationId);
    conversation.pinned = !conversation.pinned;
    conversation.updatedAt = new Date().toISOString();
    await this.persistAndEmit();
    return this.snapshot();
  }

  async deleteMessage(rawRequest: unknown): Promise<AIChatState> {
    const request = validateDeleteMessageRequest(rawRequest);
    const conversation = this.requireConversation(request.conversationId);
    const activeRequest = Array.from(this.activeRequests.entries()).find(([, active]) => active.conversationId === request.conversationId && active.messageId === request.messageId);
    if (activeRequest) {
      await this.runtimeManager.cancel({ requestId: activeRequest[0] }).catch(() => undefined);
      this.activeRequests.delete(activeRequest[0]);
    }
    conversation.messages = conversation.messages.filter((message) => message.id !== request.messageId);
    conversation.updatedAt = new Date().toISOString();
    await this.persistAndEmit();
    return this.snapshot();
  }

  async fork(rawRequest: unknown): Promise<AIChatState> {
    const request = validateForkRequest(rawRequest);
    const source = this.requireConversation(request.conversationId);
    const messageIndex = request.messageId ? source.messages.findIndex((message) => message.id === request.messageId) : -1;
    if (request.messageId && messageIndex < 0) throw new Error("Chat message was not found.");
    const now = new Date().toISOString();
    const conversation: AIChatConversation = {
      id: randomUUID(),
      title: request.title ?? `${source.title} (Fork)`,
      messages: (messageIndex >= 0 ? source.messages.slice(0, messageIndex + 1) : source.messages).map((message) => ({ ...message, id: randomUUID(), status: message.status === "streaming" ? "stopped" : message.status })),
      runtimeId: source.runtimeId,
      modelId: source.modelId,
      pinned: false,
      createdAt: now,
      updatedAt: now
    };
    this.persistence.conversations = [conversation, ...this.persistence.conversations].slice(0, MAX_CONVERSATIONS);
    this.persistence.activeConversationId = conversation.id;
    await this.persistAndEmit();
    return this.snapshot();
  }

  async send(rawRequest: unknown): Promise<AIChatSendResult> {
    const request = validateSendRequest(rawRequest);
    const conversation = request.conversationId
      ? this.requireConversation(request.conversationId)
      : await this.createConversationForSend(request);
    const now = new Date().toISOString();
    const requestId = randomUUID();
    const userMessage: AIChatMessage = {
      id: randomUUID(),
      role: "user",
      content: request.content,
      createdAt: now,
      status: "done",
      attachments: request.attachments
    };
    const assistantMessage: AIChatMessage = {
      id: randomUUID(),
      role: "assistant",
      content: "",
      createdAt: now,
      status: "streaming"
    };
    conversation.runtimeId = request.runtimeId ?? conversation.runtimeId;
    conversation.modelId = request.modelId;
    conversation.messages = [...conversation.messages, userMessage, assistantMessage].slice(-MAX_MESSAGES);
    conversation.title = conversation.title === "New Chat" ? titleFromPrompt(request.content) : conversation.title;
    conversation.updatedAt = now;
    this.persistence.activeConversationId = conversation.id;
    this.activeRequests.set(requestId, { conversationId: conversation.id, messageId: assistantMessage.id });
    await this.persistAndEmit();
    void this.streamAssistantResponse(requestId, conversation.id, assistantMessage.id);
    return { requestId, state: this.snapshot() };
  }

  async cancel(rawRequest: unknown): Promise<AIChatState> {
    const request = validateCancelRequest(rawRequest);
    const active = this.activeRequests.get(request.requestId);
    await this.runtimeManager.cancel({ requestId: request.requestId }).catch(() => undefined);
    if (active) {
      this.updateMessage(active.conversationId, active.messageId, { status: "stopped" });
      this.activeRequests.delete(request.requestId);
      await this.persistAndEmit();
      this.emit({ type: "stopped", requestId: request.requestId, conversationId: active.conversationId, messageId: active.messageId, state: this.snapshot() });
    }
    return this.snapshot();
  }

  async export(rawRequest: unknown): Promise<AIChatExportResult> {
    const request = validateExportRequest(rawRequest);
    const conversation = this.requireConversation(request.conversationId);
    return { conversationId: conversation.id, markdown: conversationToMarkdown(conversation) };
  }

  private async streamAssistantResponse(requestId: string, conversationId: string, messageId: string): Promise<void> {
    const conversation = this.requireConversation(conversationId);
    const model = conversation.modelId;
    if (!model) {
      await this.failRequest(requestId, conversationId, messageId, "Select a model before sending a chat message.");
      return;
    }
    try {
      const runtimeMessages = conversation.messages
        .filter((message) => message.role === "system" || message.role === "user" || message.role === "assistant")
        .filter((message) => message.id !== messageId)
        .map((message) => ({
          role: message.role as "system" | "user" | "assistant",
          content: message.role === "user" ? contentWithAttachments(message) : message.content
        }));
      for await (const event of this.runtimeManager.streamEvents({
        requestId,
        providerId: conversation.runtimeId,
        model,
        messages: runtimeMessages
      })) {
        if (event.type === "token") {
          this.appendMessageContent(conversationId, messageId, event.token);
          await this.persist();
          this.emit({ type: "chunk", requestId, conversationId, messageId, content: event.token });
        } else if (event.type === "completed") {
          this.updateMessage(conversationId, messageId, { status: "done" });
          this.activeRequests.delete(requestId);
          await this.persistAndEmit();
          this.emit({ type: "done", requestId, conversationId, messageId, state: this.snapshot() });
        } else if (event.type === "cancelled") {
          this.updateMessage(conversationId, messageId, { status: "stopped" });
          this.activeRequests.delete(requestId);
          await this.persistAndEmit();
          this.emit({ type: "stopped", requestId, conversationId, messageId, state: this.snapshot() });
        } else if (event.type === "failed") {
          await this.failRequest(requestId, conversationId, messageId, event.error);
        }
      }
    } catch (error) {
      await this.failRequest(requestId, conversationId, messageId, errorMessage(error));
    }
  }

  private async failRequest(requestId: string, conversationId: string, messageId: string, message: string): Promise<void> {
    this.updateMessage(conversationId, messageId, { status: "error", error: message, content: message });
    this.activeRequests.delete(requestId);
    await this.persistAndEmit();
    this.emit({ type: "error", requestId, conversationId, messageId, message, state: this.snapshot() });
  }

  private async createConversationForSend(request: AIChatSendRequest): Promise<AIChatConversation> {
    await this.newChat({ title: titleFromPrompt(request.content), runtimeId: request.runtimeId, modelId: request.modelId });
    return this.requireConversation(this.persistence.activeConversationId);
  }

  private requireConversation(conversationId: string | undefined): AIChatConversation {
    const conversation = this.persistence.conversations.find((item) => item.id === conversationId);
    if (!conversation) throw new Error("Chat conversation was not found.");
    return conversation;
  }

  private updateMessage(conversationId: string, messageId: string, updates: Partial<AIChatMessage>): void {
    const conversation = this.requireConversation(conversationId);
    conversation.messages = conversation.messages.map((message) => message.id === messageId ? { ...message, ...updates } : message);
    conversation.updatedAt = new Date().toISOString();
  }

  private appendMessageContent(conversationId: string, messageId: string, content: string): void {
    const conversation = this.requireConversation(conversationId);
    conversation.messages = conversation.messages.map((message) => message.id === messageId ? { ...message, content: message.content + content } : message);
    conversation.updatedAt = new Date().toISOString();
  }

  private snapshot(): AIChatState {
    return {
      conversations: [...this.persistence.conversations].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)),
      activeConversationId: this.persistence.activeConversationId,
      panel: { ...this.persistence.panel },
      updatedAt: new Date().toISOString()
    };
  }

  private async persistAndEmit(): Promise<void> {
    await this.persist();
    this.emit({ type: "state", state: this.snapshot() });
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.statePath, "utf8");
      this.persistence = coercePersistence(JSON.parse(raw));
    } catch {
      this.persistence = defaultPersistence();
    }
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify(redactPersistence(this.persistence), null, 2), "utf8");
  }
}

function defaultPersistence(): ChatPersistence {
  return { conversations: [], panel: { dockPosition: "right" } };
}

function validateNewRequest(value: unknown): AIChatNewRequest {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    title: record.title === undefined ? undefined : validateTitle(record.title),
    runtimeId: record.runtimeId === undefined ? undefined : validateRuntimeProviderId(record.runtimeId),
    modelId: record.modelId === undefined ? undefined : validateModelId(record.modelId)
  };
}

function validateRenameRequest(value: unknown): AIChatRenameRequest {
  if (!value || typeof value !== "object") throw new Error("Chat rename request is invalid.");
  const record = value as Record<string, unknown>;
  return { conversationId: validateId(record.conversationId, "conversationId"), title: validateTitle(record.title) };
}

function validateDeleteRequest(value: unknown): AIChatDeleteRequest {
  if (!value || typeof value !== "object") throw new Error("Chat delete request is invalid.");
  return { conversationId: validateId((value as Record<string, unknown>).conversationId, "conversationId") };
}

function validateDeleteMessageRequest(value: unknown): AIChatDeleteMessageRequest {
  if (!value || typeof value !== "object") throw new Error("Chat delete message request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    conversationId: validateId(record.conversationId, "conversationId"),
    messageId: validateId(record.messageId, "messageId")
  };
}

function validateForkRequest(value: unknown): AIChatForkRequest {
  if (!value || typeof value !== "object") throw new Error("Chat fork request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    conversationId: validateId(record.conversationId, "conversationId"),
    messageId: record.messageId === undefined ? undefined : validateId(record.messageId, "messageId"),
    title: record.title === undefined ? undefined : validateTitle(record.title)
  };
}

function validateSendRequest(value: unknown): AIChatSendRequest {
  if (!value || typeof value !== "object") throw new Error("Chat send request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    conversationId: record.conversationId === undefined ? undefined : validateId(record.conversationId, "conversationId"),
    content: validateContent(record.content),
    runtimeId: record.runtimeId === undefined ? undefined : validateRuntimeProviderId(record.runtimeId),
    modelId: validateModelId(record.modelId),
    attachments: record.attachments === undefined ? undefined : validateAttachments(record.attachments)
  };
}

function validateCancelRequest(value: unknown): AIChatCancelRequest {
  if (!value || typeof value !== "object") throw new Error("Chat cancel request is invalid.");
  return { requestId: validateId((value as Record<string, unknown>).requestId, "requestId") };
}

function validateExportRequest(value: unknown): AIChatExportRequest {
  if (!value || typeof value !== "object") throw new Error("Chat export request is invalid.");
  return { conversationId: validateId((value as Record<string, unknown>).conversationId, "conversationId") };
}

function validatePanelRequest(value: unknown): AIChatSetPanelRequest {
  if (!value || typeof value !== "object") throw new Error("Chat panel request is invalid.");
  const dockPosition = (value as Record<string, unknown>).dockPosition;
  if (typeof dockPosition !== "string" || !DOCK_POSITIONS.includes(dockPosition as AIChatDockPosition)) {
    throw new Error("Chat dock position is invalid.");
  }
  return { dockPosition: dockPosition as AIChatDockPosition };
}

function validateAttachments(value: unknown): AIChatAttachment[] {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENT_COUNT) throw new Error("Chat attachments are invalid.");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Chat attachment is invalid.");
    const record = item as Record<string, unknown>;
    return {
      id: validateId(record.id ?? randomUUID(), "attachmentId"),
      type: validateAttachmentType(record.type),
      label: validateTitle(record.label),
      relativePath: record.relativePath === undefined ? undefined : validateRelativePath(record.relativePath),
      language: record.language === undefined ? undefined : validateTinyString(record.language, "language"),
      content: record.content === undefined ? undefined : validateAttachmentContent(record.content)
    };
  });
}

function validateAttachmentType(value: unknown): AIChatAttachment["type"] {
  if (value === "current-file" || value === "file" || value === "selection" || value === "clipboard" || value === "image-placeholder") return value;
  throw new Error("Chat attachment type is invalid.");
}

function validateId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 120 || value.includes("\0")) throw new Error(`${field} is invalid.`);
  return value;
}

function validateTitle(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 120 || value.includes("\0")) throw new Error("Chat title is invalid.");
  return value.trim();
}

function validateContent(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_MESSAGE_LENGTH || value.includes("\0")) throw new Error("Chat content is invalid.");
  return value.trim();
}

function validateAttachmentContent(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_ATTACHMENT_CONTENT || value.includes("\0")) throw new Error("Chat attachment content is invalid.");
  return value;
}

function validateTinyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > 80 || value.includes("\0")) throw new Error(`${field} is invalid.`);
  return value;
}

function validateRelativePath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500 || path.isAbsolute(value) || value.includes("\0") || value.includes("..")) {
    throw new Error("Chat attachment path is invalid.");
  }
  return value.replace(/\\/g, "/");
}

function coercePersistence(value: unknown): ChatPersistence {
  if (!value || typeof value !== "object") return defaultPersistence();
  const record = value as Record<string, unknown>;
  const conversations = Array.isArray(record.conversations) ? record.conversations.map(coerceConversation).filter(Boolean).slice(0, MAX_CONVERSATIONS) as AIChatConversation[] : [];
  const activeConversationId = typeof record.activeConversationId === "string" && conversations.some((item) => item.id === record.activeConversationId) ? record.activeConversationId : conversations[0]?.id;
  const panelRecord = record.panel && typeof record.panel === "object" ? record.panel as Record<string, unknown> : {};
  const dockPosition = typeof panelRecord.dockPosition === "string" && DOCK_POSITIONS.includes(panelRecord.dockPosition as AIChatDockPosition) ? panelRecord.dockPosition as AIChatDockPosition : "right";
  return { conversations, activeConversationId, panel: { dockPosition } };
}

function coerceConversation(value: unknown): AIChatConversation | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.title !== "string") return null;
  return {
    id: record.id,
    title: record.title.slice(0, 120),
    messages: Array.isArray(record.messages) ? record.messages.map(coerceMessage).filter(Boolean).slice(-MAX_MESSAGES) as AIChatMessage[] : [],
    runtimeId: optionalProvider(record.runtimeId),
    modelId: typeof record.modelId === "string" ? record.modelId.slice(0, 300) : undefined,
    pinned: record.pinned === true,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString()
  };
}

function coerceMessage(value: unknown): AIChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.content !== "string") return null;
  const role = record.role === "user" || record.role === "assistant" || record.role === "system" || record.role === "tool" ? record.role : "assistant";
  return {
    id: record.id,
    role,
    content: record.content.slice(0, MAX_MESSAGE_LENGTH),
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    status: record.status === "streaming" ? "stopped" : record.status === "error" ? "error" : "done",
    attachments: Array.isArray(record.attachments) ? record.attachments.map((item) => validateAttachments([item])[0]).slice(0, MAX_ATTACHMENT_COUNT) : undefined,
    error: typeof record.error === "string" ? record.error.slice(0, 500) : undefined
  };
}

function optionalProvider(value: unknown): AIRuntimeProviderId | undefined {
  try {
    return value === undefined ? undefined : validateRuntimeProviderId(value);
  } catch {
    return undefined;
  }
}

function redactPersistence(persistence: ChatPersistence): ChatPersistence {
  const raw = JSON.stringify(persistence).replace(/(api[_-]?key|token|secret|password)["']?\s*[:=]\s*["'][^"']+["']/gi, "$1:REDACTED");
  return JSON.parse(raw) as ChatPersistence;
}

function contentWithAttachments(message: AIChatMessage): string {
  if (!message.attachments?.length) return message.content;
  const context = message.attachments.map((attachment) => {
    const body = attachment.content ? `\n\`\`\`${attachment.language ?? ""}\n${attachment.content}\n\`\`\`` : "";
    return `- ${attachment.type}: ${attachment.label}${attachment.relativePath ? ` (${attachment.relativePath})` : ""}${body}`;
  }).join("\n");
  return `${message.content}\n\nAttached context:\n${context}`;
}

function titleFromPrompt(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 48) || "New Chat";
}

function conversationToMarkdown(conversation: AIChatConversation): string {
  const lines = [`# ${conversation.title}`, ""];
  for (const message of conversation.messages) {
    lines.push(`## ${message.role}`, "", message.content, "");
  }
  return lines.join("\n");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Chat request failed.";
}
