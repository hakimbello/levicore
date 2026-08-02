import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { app } from "electron";
import type {
  AIChatAttachment,
  AIChatArchiveRequest,
  AIChatBudgetRequest,
  AIChatCancelRequest,
  AIChatConversation,
  AIChatCitation,
  AIChatContextBudget,
  AIChatContextDiscoveryResult,
  AIChatContextPreviewRequest,
  AIChatContextPreviewResult,
  AIChatDeleteRequest,
  AIChatDeleteMessageRequest,
  AIChatDockPosition,
  AIChatEvent,
  AIChatExportRequest,
  AIChatExportResult,
  AIChatForkRequest,
  AIChatMessage,
  AIChatNewRequest,
  AIChatOpenCitationRequest,
  AIChatRenameRequest,
  AIChatSearchRequest,
  AIChatSendRequest,
  AIChatSendResult,
  AIChatSetPanelRequest,
  AIChatState
} from "../../src/features/ai-chat";
import type { AIRuntimeProviderId } from "../../src/features/ai-runtime";
import { RuntimeManager, validateModelId, validateRuntimeProviderId } from "./ai-runtime";
import { listWorkspaceTree, readWorkspacePath, type WorkspaceTreeNode } from "./workspace-tree-ipc";

const CHAT_STATE_FILE = "ai-chat-state.json";
const MAX_CONVERSATIONS = 100;
const MAX_MESSAGES = 400;
const MAX_MESSAGE_LENGTH = 120_000;
const MAX_ATTACHMENT_COUNT = 12;
const MAX_ATTACHMENT_CONTENT = 40_000;
const MAX_FOLDER_FILES = 12;
const MAX_CONTEXT_TOKENS_FALLBACK = 8_192;
const BUDGET_RESERVED_TOKENS = 1_024;
const DOCK_POSITIONS: AIChatDockPosition[] = ["left", "right", "bottom", "floating"];
const CONTEXT_SOURCES: AIChatContextDiscoveryResult["supports"] = [
  "current-file",
  "open-tabs",
  "selected-code",
  "workspace-file",
  "workspace-folder",
  "project-rules",
  "workspace-summary",
  "git-diff",
  "problems",
  "task-output",
  "terminal-output",
  "clipboard"
];
const SECRET_PATH_PATTERN = /(^|\/)(\.env(?:\..*)?|\.npmrc|\.pypirc|id_rsa|id_dsa|id_ecdsa|id_ed25519|credentials|secrets?)(\/|$)|\.(pem|key|p12|pfx|crt|cer)$/i;

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

  async archive(rawRequest: unknown): Promise<AIChatState> {
    const request = validateArchiveRequest(rawRequest);
    const conversation = this.requireConversation(request.conversationId);
    conversation.archived = request.archived;
    conversation.updatedAt = new Date().toISOString();
    if (request.archived && this.persistence.activeConversationId === conversation.id) {
      this.persistence.activeConversationId = this.persistence.conversations.find((item) => !item.archived && item.id !== conversation.id)?.id;
    }
    await this.persistAndEmit();
    return this.snapshot();
  }

  search(rawRequest: unknown): AIChatState {
    const request = validateSearchRequest(rawRequest);
    const query = request.query?.toLowerCase();
    const snapshot = this.snapshot();
    return {
      ...snapshot,
      conversations: snapshot.conversations.filter((conversation) => {
        if (!request.includeArchived && conversation.archived) return false;
        if (request.pinnedOnly && !conversation.pinned) return false;
        if (!query) return true;
        return conversation.title.toLowerCase().includes(query) || conversation.messages.some((message) => message.content.toLowerCase().includes(query));
      })
    };
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
    const budget = this.computeBudget({
      conversationId: conversation.id,
      runtimeId: request.runtimeId ?? conversation.runtimeId,
      modelId: request.modelId,
      draft: request.content,
      attachments: request.attachments
    });
    if (budget.exceedsBudget) {
      throw new Error(`Chat context exceeds the selected model budget. Remove: ${budget.oversizedAttachments.join(", ") || "attachments"}.`);
    }
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
    const format = request.format ?? "markdown";
    return {
      conversationId: conversation.id,
      format,
      markdown: conversationToMarkdown(conversation),
      json: format === "json" ? JSON.stringify(conversationToExportObject(conversation), null, 2) : undefined
    };
  }

  async discoverContext(): Promise<AIChatContextDiscoveryResult> {
    try {
      const tree = await listWorkspaceTree();
      return { recentFiles: flattenTree(tree.nodes).slice(0, 100), supports: CONTEXT_SOURCES };
    } catch {
      return { recentFiles: [], supports: CONTEXT_SOURCES };
    }
  }

  async previewContext(rawRequest: unknown): Promise<AIChatContextPreviewResult> {
    const request = validateContextPreviewRequest(rawRequest);
    const attachment = await this.buildAttachmentPreview(request);
    return { attachment, budget: this.computeBudget({ attachments: [attachment] }) };
  }

  budget(rawRequest: unknown): AIChatContextBudget {
    return this.computeBudget(validateBudgetRequest(rawRequest));
  }

  openCitation(rawRequest: unknown): AIChatAttachment {
    const request = validateOpenCitationRequest(rawRequest);
    const conversation = this.requireConversation(request.conversationId);
    for (const message of conversation.messages) {
      for (const attachment of message.attachments ?? []) {
        if (attachment.sourceId === request.sourceId) return attachment;
        const included = attachment.includedFiles?.find((file) => file.sourceId === request.sourceId);
        if (included) return { ...attachment, sourceId: included.sourceId, relativePath: included.relativePath, lineStart: 1, label: included.relativePath };
      }
    }
    throw new Error("Citation source was not found.");
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
      if (conversation.messages.some((message) => message.attachments?.length)) {
        runtimeMessages.unshift({
          role: "system",
          content:
            "When using attached workspace context, cite only the provided source IDs using [S#] markers. Do not invent source IDs. If the context is insufficient, say what is missing."
        });
      }
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
          const citations = validCitations(this.requireConversation(conversationId), this.requireMessage(conversationId, messageId).content);
          this.updateMessage(conversationId, messageId, { status: "done", citations });
          this.activeRequests.delete(requestId);
          await this.persistAndEmit();
          if (citations.length) this.emit({ type: "citations", requestId, conversationId, messageId, citations });
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

  private requireMessage(conversationId: string, messageId: string): AIChatMessage {
    const message = this.requireConversation(conversationId).messages.find((item) => item.id === messageId);
    if (!message) throw new Error("Chat message was not found.");
    return message;
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

  private computeBudget(request: AIChatBudgetRequest): AIChatContextBudget {
    const state = this.runtimeManager.list();
    const provider = state.providers.find((item) => item.id === (request.runtimeId ?? state.selectedRuntimeId ?? state.automaticRuntimeId));
    const model = provider?.models.find((item) => item.id === request.modelId) ?? provider?.models[0];
    const modelContextWindow = model?.contextWindow;
    const conversation = request.conversationId ? this.persistence.conversations.find((item) => item.id === request.conversationId) : undefined;
    const conversationTokens = conversation?.messages.reduce((total, message) => total + estimateTokens(message.content), 0) ?? 0;
    const attachmentTokens = (request.attachments ?? []).reduce((total, attachment) => total + (attachment.tokenEstimate ?? estimateTokens(attachment.content ?? "")), 0);
    const draftTokens = estimateTokens(request.draft ?? "");
    const totalTokens = conversationTokens + attachmentTokens + draftTokens + BUDGET_RESERVED_TOKENS;
    const limit = modelContextWindow ?? MAX_CONTEXT_TOKENS_FALLBACK;
    const oversizedAttachments = (request.attachments ?? [])
      .filter((attachment) => attachment.truncated || (attachment.tokenEstimate ?? estimateTokens(attachment.content ?? "")) > Math.max(1, limit - BUDGET_RESERVED_TOKENS))
      .map((attachment) => attachment.label);
    return {
      modelContextWindow,
      conversationTokens,
      attachmentTokens,
      draftTokens,
      totalTokens,
      remainingTokens: modelContextWindow ? modelContextWindow - totalTokens : undefined,
      exceedsBudget: totalTokens > limit || oversizedAttachments.length > 0,
      oversizedAttachments,
      warning: modelContextWindow && totalTokens > modelContextWindow ? "Context exceeds the selected model window." : undefined
    };
  }

  private async buildAttachmentPreview(request: AIChatContextPreviewRequest): Promise<AIChatAttachment> {
    if (request.source === "workspace-file" || request.source === "current-file") {
      const relativePath = validateRelativePath(request.relativePath);
      const sensitiveReason = sensitivePathReason(relativePath);
      if (sensitiveReason && !request.confirmSensitive) throw new Error(`Sensitive files require explicit confirmation: ${sensitiveReason}`);
      const file = await readWorkspacePath({ relativePath });
      return createAttachment({
        type: "workspace-file",
        label: request.label ?? file.relativePath,
        relativePath: file.relativePath,
        lineStart: request.lineStart,
        lineEnd: request.lineEnd,
        language: file.language,
        content: sliceLineRange(file.content, request.lineStart, request.lineEnd),
        sensitiveReason,
        confirmed: request.confirmSensitive
      });
    }
    if (request.source === "workspace-folder") {
      const relativePath = validateRelativePath(request.relativePath);
      const tree = await listWorkspaceTree();
      const folder = findNode(tree.nodes, relativePath);
      if (!folder || folder.kind !== "folder") throw new Error("Workspace folder was not found.");
      const files = flattenTree(folder.children ?? []).filter((item) => item.kind === "file").slice(0, MAX_FOLDER_FILES);
      const included = [];
      const chunks: string[] = [];
      for (const item of files) {
        const sensitiveReason = sensitivePathReason(item.relativePath);
        if (sensitiveReason && !request.confirmSensitive) continue;
        const read = await readWorkspacePath({ relativePath: item.relativePath });
        const child = createAttachment({ type: "workspace-file", label: read.relativePath, relativePath: read.relativePath, language: read.language, content: read.content });
        included.push({ sourceId: child.sourceId!, relativePath: read.relativePath, charCount: child.charCount!, tokenEstimate: child.tokenEstimate!, language: read.language });
        chunks.push(`### ${child.sourceId} ${read.relativePath}\n${read.content}`);
      }
      return createAttachment({
        type: "workspace-folder",
        label: request.label ?? relativePath,
        relativePath,
        content: chunks.join("\n\n"),
        includedFiles: included,
        truncated: files.length >= MAX_FOLDER_FILES
      });
    }
    if (request.source === "selected-code" || request.source === "open-tabs" || request.source === "clipboard" || request.source === "project-rules" || request.source === "workspace-summary" || request.source === "git-diff" || request.source === "problems" || request.source === "task-output" || request.source === "terminal-output") {
      const content = request.content ?? request.entries?.map((entry) => `### ${entry.label}\n${entry.content}`).join("\n\n") ?? "";
      return createAttachment({
        type: request.source === "open-tabs" ? "open-tab" : request.source,
        label: request.label ?? request.source,
        relativePath: request.relativePath,
        lineStart: request.lineStart,
        lineEnd: request.lineEnd,
        language: request.language,
        content
      });
    }
    throw new Error("Unsupported chat context source.");
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

function validateArchiveRequest(value: unknown): AIChatArchiveRequest {
  if (!value || typeof value !== "object") throw new Error("Chat archive request is invalid.");
  const record = value as Record<string, unknown>;
  return { conversationId: validateId(record.conversationId, "conversationId"), archived: record.archived === true };
}

function validateSearchRequest(value: unknown): AIChatSearchRequest {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    query: record.query === undefined ? undefined : validateOptionalSearch(record.query),
    pinnedOnly: record.pinnedOnly === true,
    includeArchived: record.includeArchived === true
  };
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
    attachments: record.attachments === undefined ? undefined : validateAttachments(record.attachments),
    retryOfMessageId: record.retryOfMessageId === undefined ? undefined : validateId(record.retryOfMessageId, "retryOfMessageId")
  };
}

function validateCancelRequest(value: unknown): AIChatCancelRequest {
  if (!value || typeof value !== "object") throw new Error("Chat cancel request is invalid.");
  return { requestId: validateId((value as Record<string, unknown>).requestId, "requestId") };
}

function validateExportRequest(value: unknown): AIChatExportRequest {
  if (!value || typeof value !== "object") throw new Error("Chat export request is invalid.");
  const record = value as Record<string, unknown>;
  const format = record.format === undefined ? undefined : record.format;
  if (format !== undefined && format !== "markdown" && format !== "json") throw new Error("Chat export format is invalid.");
  return { conversationId: validateId(record.conversationId, "conversationId"), format };
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
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error("Chat attachment is invalid.");
    const record = item as Record<string, unknown>;
    return {
      id: validateId(record.id ?? randomUUID(), "attachmentId"),
      sourceId: record.sourceId === undefined ? `S${index + 1}` : validateId(record.sourceId, "sourceId"),
      type: validateAttachmentType(record.type),
      label: validateTitle(record.label),
      relativePath: record.relativePath === undefined ? undefined : validateRelativePath(record.relativePath),
      lineStart: record.lineStart === undefined ? undefined : validateLine(record.lineStart, "lineStart"),
      lineEnd: record.lineEnd === undefined ? undefined : validateLine(record.lineEnd, "lineEnd"),
      language: record.language === undefined ? undefined : validateTinyString(record.language, "language"),
      content: record.content === undefined ? undefined : validateAttachmentContent(record.content),
      charCount: record.charCount === undefined ? undefined : validateNonNegativeInteger(record.charCount, "charCount"),
      tokenEstimate: record.tokenEstimate === undefined ? undefined : validateNonNegativeInteger(record.tokenEstimate, "tokenEstimate"),
      truncated: record.truncated === true,
      sensitive: record.sensitive === true,
      sensitiveReason: record.sensitiveReason === undefined ? undefined : validateTinyString(record.sensitiveReason, "sensitiveReason"),
      confirmed: record.confirmed === true,
      includedFiles: Array.isArray(record.includedFiles) ? record.includedFiles.slice(0, MAX_FOLDER_FILES).map(validateIncludedFile) : undefined,
      preview: record.preview === undefined ? undefined : validateAttachmentContent(record.preview)
    };
  }).map((attachment, index) => attachment.sourceId ? attachment : { ...attachment, sourceId: `S${index + 1}` });
}

function validateAttachmentType(value: unknown): AIChatAttachment["type"] {
  if (
    value === "current-file" ||
    value === "open-tab" ||
    value === "file" ||
    value === "workspace-file" ||
    value === "workspace-folder" ||
    value === "selected-code" ||
    value === "selection" ||
    value === "clipboard" ||
    value === "project-rules" ||
    value === "workspace-summary" ||
    value === "git-diff" ||
    value === "problems" ||
    value === "task-output" ||
    value === "terminal-output" ||
    value === "image-placeholder"
  ) return value;
  throw new Error("Chat attachment type is invalid.");
}

function validateContextPreviewRequest(value: unknown): AIChatContextPreviewRequest {
  if (!value || typeof value !== "object") throw new Error("Chat context preview request is invalid.");
  const record = value as Record<string, unknown>;
  if (!CONTEXT_SOURCES.includes(record.source as AIChatContextPreviewRequest["source"])) throw new Error("Chat context source is invalid.");
  return {
    source: record.source as AIChatContextPreviewRequest["source"],
    relativePath: record.relativePath === undefined ? undefined : validateRelativePath(record.relativePath),
    lineStart: record.lineStart === undefined ? undefined : validateLine(record.lineStart, "lineStart"),
    lineEnd: record.lineEnd === undefined ? undefined : validateLine(record.lineEnd, "lineEnd"),
    content: record.content === undefined ? undefined : validateAttachmentContent(record.content),
    label: record.label === undefined ? undefined : validateTitle(record.label),
    language: record.language === undefined ? undefined : validateTinyString(record.language, "language"),
    entries: Array.isArray(record.entries) ? record.entries.slice(0, MAX_ATTACHMENT_COUNT).map(validateContextEntry) : undefined,
    confirmSensitive: record.confirmSensitive === true
  };
}

function validateBudgetRequest(value: unknown): AIChatBudgetRequest {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    conversationId: record.conversationId === undefined ? undefined : validateId(record.conversationId, "conversationId"),
    runtimeId: record.runtimeId === undefined ? undefined : validateRuntimeProviderId(record.runtimeId),
    modelId: record.modelId === undefined ? undefined : validateModelId(record.modelId),
    draft: record.draft === undefined ? undefined : validateDraft(record.draft),
    attachments: record.attachments === undefined ? undefined : validateAttachments(record.attachments)
  };
}

function validateOpenCitationRequest(value: unknown): AIChatOpenCitationRequest {
  if (!value || typeof value !== "object") throw new Error("Chat citation request is invalid.");
  const record = value as Record<string, unknown>;
  return { conversationId: validateId(record.conversationId, "conversationId"), sourceId: validateId(record.sourceId, "sourceId") };
}

function validateId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 120 || value.includes("\0")) throw new Error(`${field} is invalid.`);
  return value;
}

function validateTitle(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 120 || value.includes("\0")) throw new Error("Chat title is invalid.");
  return value.trim();
}

function validateOptionalSearch(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 200 || value.includes("\0")) throw new Error("Chat search query is invalid.");
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function validateContent(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_MESSAGE_LENGTH || value.includes("\0")) throw new Error("Chat content is invalid.");
  return value.trim();
}

function validateDraft(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_MESSAGE_LENGTH || value.includes("\0")) throw new Error("Chat draft is invalid.");
  return value;
}

function validateAttachmentContent(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_MESSAGE_LENGTH || value.includes("\0")) throw new Error("Chat attachment content is invalid.");
  return value;
}

function validateTinyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > 80 || value.includes("\0")) throw new Error(`${field} is invalid.`);
  return value;
}

function validateLine(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 1_000_000) throw new Error(`${field} is invalid.`);
  return value as number;
}

function validateNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 1_000_000_000) throw new Error(`${field} is invalid.`);
  return value as number;
}

function validateRelativePath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500 || path.isAbsolute(value) || value.includes("\0") || value.includes("..")) {
    throw new Error("Chat attachment path is invalid.");
  }
  return value.replace(/\\/g, "/");
}

function validateIncludedFile(value: unknown): NonNullable<AIChatAttachment["includedFiles"]>[number] {
  if (!value || typeof value !== "object") throw new Error("Chat folder file entry is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sourceId: validateId(record.sourceId, "sourceId"),
    relativePath: validateRelativePath(record.relativePath),
    charCount: validateNonNegativeInteger(record.charCount, "charCount"),
    tokenEstimate: validateNonNegativeInteger(record.tokenEstimate, "tokenEstimate"),
    language: record.language === undefined ? undefined : validateTinyString(record.language, "language")
  };
}

function validateContextEntry(value: unknown): NonNullable<AIChatContextPreviewRequest["entries"]>[number] {
  if (!value || typeof value !== "object") throw new Error("Chat context entry is invalid.");
  const record = value as Record<string, unknown>;
  return {
    label: validateTitle(record.label),
    content: validateAttachmentContent(record.content),
    relativePath: record.relativePath === undefined ? undefined : validateRelativePath(record.relativePath),
    lineStart: record.lineStart === undefined ? undefined : validateLine(record.lineStart, "lineStart"),
    lineEnd: record.lineEnd === undefined ? undefined : validateLine(record.lineEnd, "lineEnd"),
    language: record.language === undefined ? undefined : validateTinyString(record.language, "language")
  };
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
    archived: record.archived === true,
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
    citations: Array.isArray(record.citations) ? record.citations.map(coerceCitation).filter(Boolean) as AIChatCitation[] : undefined,
    error: typeof record.error === "string" ? record.error.slice(0, 500) : undefined
  };
}

function coerceCitation(value: unknown): AIChatCitation | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.sourceId !== "string" || typeof record.label !== "string" || typeof record.relativePath !== "string") return null;
  return {
    sourceId: record.sourceId.slice(0, 120),
    relativePath: record.relativePath.slice(0, 500),
    lineStart: typeof record.lineStart === "number" ? record.lineStart : undefined,
    lineEnd: typeof record.lineEnd === "number" ? record.lineEnd : undefined,
    label: record.label.slice(0, 120)
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
    const sourceId = attachment.sourceId ?? "S?";
    const lineRange = attachment.lineStart ? `:${attachment.lineStart}${attachment.lineEnd ? `-${attachment.lineEnd}` : ""}` : "";
    const body = attachment.content ? `\n\`\`\`${attachment.language ?? ""}\n${attachment.content}\n\`\`\`` : "";
    return `- ${sourceId} ${attachment.type}: ${attachment.label}${attachment.relativePath ? ` (${attachment.relativePath}${lineRange})` : ""}${body}`;
  }).join("\n");
  return `${message.content}\n\nAttached context. Cite source IDs like [S1] when using this material:\n${context}`;
}

function titleFromPrompt(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 48) || "New Chat";
}

function conversationToMarkdown(conversation: AIChatConversation): string {
  const lines = [`# ${conversation.title}`, "", `Runtime: ${conversation.runtimeId ?? "automatic"}`, `Model: ${conversation.modelId ?? "default"}`, ""];
  for (const message of conversation.messages) {
    lines.push(`## ${message.role}`, "", message.content, "");
    if (message.attachments?.length) {
      lines.push("Attachments:", ...message.attachments.map((attachment) => `- ${attachment.sourceId ?? ""} ${attachment.label}${attachment.relativePath ? ` (${attachment.relativePath})` : ""}`), "");
    }
    if (message.citations?.length) {
      lines.push("Citations:", ...message.citations.map((citation) => `- ${citation.sourceId}: ${citation.relativePath}${citation.lineStart ? `:${citation.lineStart}` : ""}`), "");
    }
  }
  return lines.join("\n");
}

function conversationToExportObject(conversation: AIChatConversation): unknown {
  return {
    id: conversation.id,
    title: conversation.title,
    runtimeId: conversation.runtimeId,
    modelId: conversation.modelId,
    pinned: conversation.pinned,
    archived: conversation.archived === true,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: conversation.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      status: message.status,
      attachments: message.attachments?.map((attachment) => ({
        sourceId: attachment.sourceId,
        type: attachment.type,
        label: attachment.label,
        relativePath: attachment.relativePath,
        lineStart: attachment.lineStart,
        lineEnd: attachment.lineEnd,
        charCount: attachment.charCount,
        tokenEstimate: attachment.tokenEstimate,
        truncated: attachment.truncated === true,
        sensitive: attachment.sensitive === true
      })),
      citations: message.citations
    }))
  };
}

function createAttachment(params: {
  type: AIChatAttachment["type"];
  label: string;
  relativePath?: string;
  lineStart?: number;
  lineEnd?: number;
  language?: string;
  content?: string;
  includedFiles?: AIChatAttachment["includedFiles"];
  truncated?: boolean;
  sensitiveReason?: string;
  confirmed?: boolean;
}): AIChatAttachment {
  const content = params.content ?? "";
  const sourceId = `S${Math.abs(hashString(`${params.type}:${params.relativePath ?? params.label}:${content.slice(0, 64)}`))}`;
  return {
    id: randomUUID(),
    sourceId,
    type: params.type,
    label: params.label,
    relativePath: params.relativePath,
    lineStart: params.lineStart,
    lineEnd: params.lineEnd,
    language: params.language,
    content,
    charCount: content.length,
    tokenEstimate: estimateTokens(content),
    truncated: params.truncated ?? content.length > MAX_ATTACHMENT_CONTENT,
    sensitive: Boolean(params.sensitiveReason),
    sensitiveReason: params.sensitiveReason,
    confirmed: params.confirmed,
    includedFiles: params.includedFiles,
    preview: content.slice(0, 1_000)
  };
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

function sliceLineRange(content: string, lineStart?: number, lineEnd?: number): string {
  if (!lineStart) return content;
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const start = Math.max(1, lineStart);
  const end = Math.max(start, lineEnd ?? start);
  return lines.slice(start - 1, end).join("\n");
}

function flattenTree(nodes: WorkspaceTreeNode[]): Array<{ relativePath: string; kind: "file" | "folder" }> {
  const result: Array<{ relativePath: string; kind: "file" | "folder" }> = [];
  for (const node of nodes) {
    result.push({ relativePath: node.relativePath, kind: node.kind });
    if (node.children) result.push(...flattenTree(node.children));
  }
  return result;
}

function findNode(nodes: WorkspaceTreeNode[], relativePath: string): WorkspaceTreeNode | undefined {
  for (const node of nodes) {
    if (node.relativePath === relativePath) return node;
    const found = node.children ? findNode(node.children, relativePath) : undefined;
    if (found) return found;
  }
  return undefined;
}

function sensitivePathReason(relativePath: string): string | undefined {
  return SECRET_PATH_PATTERN.test(relativePath.replace(/\\/g, "/")) ? "known secret or credential path" : undefined;
}

function validCitations(conversation: AIChatConversation, content: string): AIChatCitation[] {
  const sourceMap = new Map<string, AIChatAttachment>();
  for (const message of conversation.messages) {
    for (const attachment of message.attachments ?? []) {
      if (attachment.sourceId) sourceMap.set(attachment.sourceId, attachment);
      for (const included of attachment.includedFiles ?? []) {
        sourceMap.set(included.sourceId, { ...attachment, sourceId: included.sourceId, relativePath: included.relativePath, label: included.relativePath });
      }
    }
  }
  const seen = new Set<string>();
  const citations: AIChatCitation[] = [];
  for (const match of content.matchAll(/\[(S\d+)(?::(\d+))?\]/g)) {
    const sourceId = match[1];
    if (seen.has(sourceId)) continue;
    const source = sourceMap.get(sourceId);
    if (!source?.relativePath) continue;
    seen.add(sourceId);
    citations.push({
      sourceId,
      relativePath: source.relativePath,
      lineStart: match[2] ? Number(match[2]) : source.lineStart,
      lineEnd: source.lineEnd,
      label: source.label
    });
  }
  return citations;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  }
  return hash;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Chat request failed.";
}
