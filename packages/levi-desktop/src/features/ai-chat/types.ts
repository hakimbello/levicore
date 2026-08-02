import type { AIRuntimeProviderId } from "../ai-runtime";

export type AIChatDockPosition = "left" | "right" | "bottom" | "floating";

export type AIChatRole = "user" | "assistant" | "system" | "tool";

export type AIChatMessageStatus = "pending" | "streaming" | "done" | "stopped" | "error";

export type AIChatAttachmentType =
  | "current-file"
  | "open-tab"
  | "file"
  | "workspace-file"
  | "workspace-folder"
  | "selected-code"
  | "selection"
  | "clipboard"
  | "project-rules"
  | "workspace-summary"
  | "git-diff"
  | "problems"
  | "task-output"
  | "terminal-output"
  | "image-placeholder";

export type AIChatCitation = {
  sourceId: string;
  relativePath: string;
  lineStart?: number;
  lineEnd?: number;
  label: string;
};

export type AIChatAttachment = {
  id: string;
  sourceId?: string;
  type: AIChatAttachmentType;
  label: string;
  relativePath?: string;
  lineStart?: number;
  lineEnd?: number;
  language?: string;
  content?: string;
  charCount?: number;
  tokenEstimate?: number;
  truncated?: boolean;
  sensitive?: boolean;
  sensitiveReason?: string;
  confirmed?: boolean;
  includedFiles?: Array<{
    sourceId: string;
    relativePath: string;
    charCount: number;
    tokenEstimate: number;
    language?: string;
  }>;
  preview?: string;
};

export type AIChatMessage = {
  id: string;
  role: AIChatRole;
  content: string;
  createdAt: string;
  status?: AIChatMessageStatus;
  attachments?: AIChatAttachment[];
  citations?: AIChatCitation[];
  error?: string;
};

export type AIChatConversation = {
  id: string;
  title: string;
  messages: AIChatMessage[];
  runtimeId?: AIRuntimeProviderId;
  modelId?: string;
  pinned: boolean;
  archived?: boolean;
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

export type AIChatArchiveRequest = {
  conversationId: string;
  archived: boolean;
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
  retryOfMessageId?: string;
};

export type AIChatCancelRequest = {
  requestId: string;
};

export type AIChatExportFormat = "markdown" | "json";

export type AIChatExportRequest = {
  conversationId: string;
  format?: AIChatExportFormat;
};

export type AIChatSearchRequest = {
  query?: string;
  pinnedOnly?: boolean;
  includeArchived?: boolean;
};

export type AIChatContextSource =
  | "current-file"
  | "open-tabs"
  | "selected-code"
  | "workspace-file"
  | "workspace-folder"
  | "project-rules"
  | "workspace-summary"
  | "git-diff"
  | "problems"
  | "task-output"
  | "terminal-output"
  | "clipboard";

export type AIChatContextPreviewRequest = {
  source: AIChatContextSource;
  relativePath?: string;
  lineStart?: number;
  lineEnd?: number;
  content?: string;
  label?: string;
  language?: string;
  entries?: Array<{ label: string; content: string; relativePath?: string; lineStart?: number; lineEnd?: number; language?: string }>;
  confirmSensitive?: boolean;
};

export type AIChatContextDiscoveryResult = {
  recentFiles: Array<{ relativePath: string; kind: "file" | "folder" }>;
  supports: AIChatContextSource[];
};

export type AIChatContextBudget = {
  modelContextWindow?: number;
  conversationTokens: number;
  attachmentTokens: number;
  draftTokens: number;
  totalTokens: number;
  remainingTokens?: number;
  exceedsBudget: boolean;
  oversizedAttachments: string[];
  warning?: string;
};

export type AIChatContextPreviewResult = {
  attachment: AIChatAttachment;
  budget: AIChatContextBudget;
};

export type AIChatBudgetRequest = {
  conversationId?: string;
  runtimeId?: AIRuntimeProviderId;
  modelId?: string;
  draft?: string;
  attachments?: AIChatAttachment[];
};

export type AIChatOpenCitationRequest = {
  conversationId: string;
  sourceId: string;
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
  format: AIChatExportFormat;
  markdown: string;
  json?: string;
};

export type AIChatEvent =
  | { type: "state"; state: AIChatState }
  | { type: "chunk"; requestId: string; conversationId: string; messageId: string; content: string }
  | { type: "citations"; requestId: string; conversationId: string; messageId: string; citations: AIChatCitation[] }
  | { type: "done"; requestId: string; conversationId: string; messageId: string; state: AIChatState }
  | { type: "stopped"; requestId: string; conversationId: string; messageId: string; state: AIChatState }
  | { type: "error"; requestId: string; conversationId: string; messageId: string; message: string; state: AIChatState };
