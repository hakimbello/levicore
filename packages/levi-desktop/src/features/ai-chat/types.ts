import type { AIRuntimeProviderId } from "../ai-runtime";

export type AIChatDockPosition = "left" | "right" | "bottom" | "floating";

export type AIChatRole = "user" | "assistant" | "system" | "tool";

export type AIChatMessageStatus = "pending" | "streaming" | "done" | "stopped" | "error";

export type AIChatAttachmentType = "current-file" | "file" | "selection" | "clipboard" | "image-placeholder";

export type AIChatAttachment = {
  id: string;
  type: AIChatAttachmentType;
  label: string;
  relativePath?: string;
  language?: string;
  content?: string;
};

export type AIChatMessage = {
  id: string;
  role: AIChatRole;
  content: string;
  createdAt: string;
  status?: AIChatMessageStatus;
  attachments?: AIChatAttachment[];
  error?: string;
};

export type AIChatConversation = {
  id: string;
  title: string;
  messages: AIChatMessage[];
  runtimeId?: AIRuntimeProviderId;
  modelId?: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AIChatPanelState = {
  dockPosition: AIChatDockPosition;
};

export type AIChatState = {
  conversations: AIChatConversation[];
  activeConversationId?: string;
  panel: AIChatPanelState;
  updatedAt: string;
};

export type AIChatNewRequest = {
  title?: string;
  runtimeId?: AIRuntimeProviderId;
  modelId?: string;
};

export type AIChatRenameRequest = {
  conversationId: string;
  title: string;
};

export type AIChatDeleteRequest = {
  conversationId: string;
};

export type AIChatDeleteMessageRequest = {
  conversationId: string;
  messageId: string;
};

export type AIChatForkRequest = {
  conversationId: string;
  messageId?: string;
  title?: string;
};

export type AIChatSendRequest = {
  conversationId?: string;
  content: string;
  runtimeId?: AIRuntimeProviderId;
  modelId: string;
  attachments?: AIChatAttachment[];
};

export type AIChatCancelRequest = {
  requestId: string;
};

export type AIChatExportRequest = {
  conversationId: string;
};

export type AIChatSetPanelRequest = {
  dockPosition: AIChatDockPosition;
};

export type AIChatSendResult = {
  requestId: string;
  state: AIChatState;
};

export type AIChatExportResult = {
  conversationId: string;
  markdown: string;
};

export type AIChatEvent =
  | { type: "state"; state: AIChatState }
  | { type: "chunk"; requestId: string; conversationId: string; messageId: string; content: string }
  | { type: "done"; requestId: string; conversationId: string; messageId: string; state: AIChatState }
  | { type: "stopped"; requestId: string; conversationId: string; messageId: string; state: AIChatState }
  | { type: "error"; requestId: string; conversationId: string; messageId: string; message: string; state: AIChatState };
