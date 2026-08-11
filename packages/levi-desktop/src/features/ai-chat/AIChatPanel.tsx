import { useEffect, useMemo, useRef, useState } from "react";
import type { AIRuntimeProviderId, AIRuntimeState } from "../ai-runtime";
import type { EditorTab } from "../../hooks/use-editor-tabs";
import { Icon } from "../../components/Icon";
import { SafeMarkdown } from "../home/SafeMarkdown";
import type { TaskOutputEntry, TaskProblem, WorkspaceStatus } from "../../types/levi-api";
import type {
  AIChatAttachment,
  AIChatCitation,
  AIChatContextBudget,
  AIChatContextPreviewRequest,
  AIChatContextDiscoveryResult,
  AIChatConversation,
  AIChatDockPosition,
  AIChatState
} from "./types";

type AIChatPanelProps = {
  runtimeState: AIRuntimeState;
  activeTab?: EditorTab | null;
  tabs?: EditorTab[];
  selectedCode?: { relativePath: string; language?: string; content: string; lineStart: number; lineEnd: number } | null;
  workspaceStatus?: WorkspaceStatus;
  taskProblems?: TaskProblem[];
  taskOutput?: TaskOutputEntry[];
  onOpenCitation?: (attachment: AIChatAttachment) => Promise<void>;
};

const emptyChatState: AIChatState = {
  conversations: [],
  panel: { dockPosition: "right" },
  updatedAt: new Date(0).toISOString()
};

function createAttachmentId(): string {
  return `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

const emptyDiscovery: AIChatContextDiscoveryResult = { recentFiles: [], supports: [] };
const emptyBudget: AIChatContextBudget = {
  conversationTokens: 0,
  attachmentTokens: 0,
  draftTokens: 0,
  totalTokens: 0,
  exceedsBudget: false,
  oversizedAttachments: []
};

export function AIChatPanel({ runtimeState, activeTab, tabs = [], selectedCode, workspaceStatus, taskProblems = [], taskOutput = [], onOpenCitation }: AIChatPanelProps) {
  const [state, setState] = useState<AIChatState>(emptyChatState);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [runtimeId, setRuntimeId] = useState<AIRuntimeProviderId | "">("");
  const [modelId, setModelId] = useState("");
  const [attachments, setAttachments] = useState<AIChatAttachment[]>([]);
  const [discovery, setDiscovery] = useState<AIChatContextDiscoveryResult>(emptyDiscovery);
  const [pathQuery, setPathQuery] = useState("");
  const [budget, setBudget] = useState<AIChatContextBudget>(emptyBudget);
  const [contextError, setContextError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [controlsOpen, setControlsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const selectedRuntime = runtimeState.providers.find((provider) => provider.id === (runtimeId || runtimeState.selectedRuntimeId));
  const availableModels = selectedRuntime?.models ?? [];
  const activeConversation = state.conversations.find((conversation) => conversation.id === state.activeConversationId);
  const filteredConversations = state.conversations.filter((conversation) => {
    if (!includeArchived && conversation.archived) return false;
    if (pinnedOnly && !conversation.pinned) return false;
    const query = search.toLowerCase();
    return !query || conversation.title.toLowerCase().includes(query) || conversation.messages.some((message) => message.content.toLowerCase().includes(query));
  });
  const filteredPaths = discovery.recentFiles.filter((file) => file.relativePath.toLowerCase().includes(pathQuery.toLowerCase())).slice(0, 12);
  const selectedModel = availableModels.find((model) => model.id === modelId) ?? availableModels[0];
  const generating = Boolean(activeRequestId);

  useEffect(() => {
    let disposed = false;
    window.levi.chat.list().then((next) => {
      if (!disposed) setState(next);
    });
    window.levi.chat.discoverContext().then((next) => {
      if (!disposed) setDiscovery(next);
    });
    return window.levi.chat.onEvent((event) => {
      if (event.type === "state") setState(event.state);
      else if (event.type === "chunk") {
        setState((current) => updateMessageContent(current, event.conversationId, event.messageId, event.content));
      } else if (event.type === "done" || event.type === "stopped" || event.type === "error") {
        setState(event.state);
        setActiveRequestId(null);
      } else if (event.type === "citations") {
        setState((current) => applyCitations(current, event.conversationId, event.messageId, event.citations));
      }
    });
  }, []);

  useEffect(() => {
    const nextRuntime = activeConversation?.runtimeId ?? runtimeState.selectedRuntimeId ?? runtimeState.automaticRuntimeId ?? runtimeState.providers[0]?.id ?? "";
    setRuntimeId(nextRuntime);
  }, [activeConversation?.runtimeId, runtimeState.automaticRuntimeId, runtimeState.providers, runtimeState.selectedRuntimeId]);

  useEffect(() => {
    const nextModel = activeConversation?.modelId ?? selectedRuntime?.models[0]?.id ?? runtimeState.lastSelectedModelId ?? "";
    setModelId(nextModel);
  }, [activeConversation?.modelId, runtimeState.lastSelectedModelId, selectedRuntime?.models]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ block: "end" });
  }, [activeConversation?.messages]);

  useEffect(() => {
    let disposed = false;
    window.levi.chat.budget({ conversationId: activeConversation?.id, runtimeId: runtimeId || undefined, modelId: modelId || undefined, draft, attachments })
      .then((next) => {
        if (!disposed) setBudget(next);
      })
      .catch(() => {
        if (!disposed) setBudget(emptyBudget);
      });
    return () => {
      disposed = true;
    };
  }, [activeConversation?.id, attachments, draft, modelId, runtimeId]);

  const dockClass = useMemo(() => `levi-ai-chat-panel levi-ai-chat-dock-${state.panel.dockPosition}`, [state.panel.dockPosition]);

  async function createChat() {
    setState(await window.levi.chat.new({ runtimeId: runtimeId || undefined, modelId: modelId || undefined }));
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!content || !modelId || generating || budget.exceedsBudget) return;
    const result = await window.levi.chat.send({
      conversationId: activeConversation?.id,
      content,
      runtimeId: runtimeId || undefined,
      modelId,
      attachments
    });
    setDraft("");
    setAttachments([]);
    setActiveRequestId(result.requestId);
    setState(result.state);
  }

  async function stopGeneration() {
    if (!activeRequestId) return;
    setState(await window.levi.chat.cancel({ requestId: activeRequestId }));
    setActiveRequestId(null);
  }

  async function setDockPosition(dockPosition: AIChatDockPosition) {
    setState(await window.levi.chat.setPanel({ dockPosition }));
  }

  async function renameConversation(conversation: AIChatConversation) {
    if (renamingId !== conversation.id) {
      setRenamingId(conversation.id);
      setRenameDraft(conversation.title);
      return;
    }
    setState(await window.levi.chat.rename({ conversationId: conversation.id, title: renameDraft }));
    setRenamingId(null);
  }

  async function exportConversation(conversationId: string) {
    const result = await window.levi.chat.export({ conversationId, format: "markdown" });
    await navigator.clipboard?.writeText(result.markdown);
  }

  async function exportConversationJson(conversationId: string) {
    const result = await window.levi.chat.export({ conversationId, format: "json" });
    await navigator.clipboard?.writeText(result.json ?? result.markdown);
  }

  async function deleteMessage(messageId: string) {
    if (!activeConversation) return;
    setState(await window.levi.chat.deleteMessage({ conversationId: activeConversation.id, messageId }));
  }

  async function forkConversation(messageId?: string) {
    if (!activeConversation) return;
    setState(await window.levi.chat.fork({ conversationId: activeConversation.id, messageId }));
  }

  async function addPreview(request: AIChatContextPreviewRequest) {
    setContextError(null);
    try {
      const result = await window.levi.chat.previewContext(request);
      setAttachments((current) => [...current.filter((item) => item.sourceId !== result.attachment.sourceId), result.attachment].slice(0, 12));
      setBudget(result.budget);
    } catch (error) {
      setContextError(error instanceof Error ? error.message : "Could not attach context.");
    }
  }

  async function regenerateFrom(messageId: string) {
    if (!activeConversation || !modelId || generating) return;
    const index = activeConversation.messages.findIndex((message) => message.id === messageId);
    const prompt = activeConversation.messages.slice(0, index).reverse().find((message) => message.role === "user");
    if (!prompt) return;
    const result = await window.levi.chat.send({
      conversationId: activeConversation.id,
      content: prompt.content,
      runtimeId: runtimeId || undefined,
      modelId,
      attachments: prompt.attachments
    });
    setActiveRequestId(result.requestId);
    setState(result.state);
  }

  async function attachClipboard() {
    const content = await navigator.clipboard?.readText?.();
    if (!content) return;
    await addPreview({ source: "clipboard", label: "Clipboard", content });
  }

  async function attachCurrentFile() {
    if (!activeTab) return;
    await addPreview({ source: "current-file", relativePath: activeTab.relativePath });
  }

  async function attachSelectedCode() {
    if (!selectedCode) return;
    await addPreview({
      source: "selected-code",
      label: `${selectedCode.relativePath}:${selectedCode.lineStart}-${selectedCode.lineEnd}`,
      relativePath: selectedCode.relativePath,
      lineStart: selectedCode.lineStart,
      lineEnd: selectedCode.lineEnd,
      language: selectedCode.language,
      content: selectedCode.content
    });
  }

  async function attachOpenTabs() {
    if (!tabs.length) return;
    await addPreview({
      source: "open-tabs",
      label: "Open tabs",
      entries: tabs.slice(0, 8).map((tab) => ({ label: tab.relativePath, relativePath: tab.relativePath, language: tab.language, content: tab.content }))
    });
  }

  async function attachWorkspaceSummary() {
    const summary = workspaceStatus?.summary;
    if (!summary) return;
    await addPreview({
      source: "workspace-summary",
      label: "Workspace summary",
      content: [
        `Project: ${summary.projectName}`,
        `Languages: ${summary.languages.join(", ")}`,
        `Frameworks: ${summary.frameworks.join(", ")}`,
        `Entry points: ${summary.likelyEntryPoints.join(", ")}`,
        `Source directories: ${summary.sourceDirectories.join(", ")}`,
        `Scripts: ${Object.entries(summary.scripts).map(([name, script]) => `${name}=${script}`).join("; ")}`
      ].join("\n")
    });
  }

  async function attachProjectRules() {
    const rules = await window.levi.rules.list();
    await addPreview({
      source: "project-rules",
      label: "Project Rules",
      content: rules.rules.map((rule) => `- ${rule.text} (${rule.sourcePath}:${rule.lineStart}-${rule.lineEnd})`).join("\n") || "No active project rules."
    });
  }

  async function attachProblems() {
    await addPreview({
      source: "problems",
      label: "Problems",
      content: taskProblems.map((problem) => `${problem.relativePath}:${problem.line}:${problem.column} ${problem.severity} ${problem.message}`).join("\n") || "No current problems."
    });
  }

  async function attachTaskOutput(source: "task-output" | "git-diff" = "task-output") {
    const entries = taskOutput.filter((entry) => source === "git-diff" ? entry.source === "git" : entry.source !== "git").slice(-80);
    await addPreview({
      source,
      label: source === "git-diff" ? "Git changes" : "Task output",
      content: entries.map((entry) => `[${entry.source}/${entry.channel}] ${entry.text}`).join("\n") || "No output selected."
    });
  }

  async function attachWorkspacePath(item: AIChatContextDiscoveryResult["recentFiles"][number]) {
    const confirmed = window.confirm(`${item.kind === "folder" ? "Include bounded folder context" : "Attach file"} ${item.relativePath}?`);
    if (!confirmed) return;
    await addPreview({
      source: item.kind === "folder" ? "workspace-folder" : "workspace-file",
      relativePath: item.relativePath,
      confirmSensitive: true
    });
  }

  function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    const dropped = Array.from(event.dataTransfer.files).slice(0, 8).map((file): AIChatAttachment => ({
      id: createAttachmentId(),
      type: "file",
      label: file.name
    }));
    setAttachments((current) => [...current, ...dropped]);
  }

  return (
    <aside className={dockClass} aria-label="AI Chat" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <header className="levi-ai-chat-header">
        <div>
          <h2>AI Chat</h2>
          <p>{activeConversation?.title ?? "New workspace chat"}</p>
        </div>
        <button type="button" className="levi-button levi-button-secondary" aria-label="New AI Chat" onClick={() => void createChat()}>
          <Icon name="plus" />
          <span>New Chat</span>
        </button>
      </header>

      <details className="levi-ai-chat-disclosure" open={controlsOpen} onToggle={(event) => setControlsOpen(event.currentTarget.open)}>
        <summary>Chat controls</summary>
        {controlsOpen ? (
          <div className="levi-ai-chat-controls">
            <select aria-label="Dock position" value={state.panel.dockPosition} onChange={(event) => void setDockPosition(event.target.value as AIChatDockPosition)}>
              <option value="right">Dock Right</option>
              <option value="left">Dock Left</option>
              <option value="bottom">Bottom</option>
              <option value="floating">Floating</option>
            </select>
            <select aria-label="Runtime" value={runtimeId} onChange={(event) => setRuntimeId(event.target.value as AIRuntimeProviderId)}>
              <option value="">Automatic Runtime</option>
              {runtimeState.providers.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
            <select aria-label="Model" value={modelId} onChange={(event) => setModelId(event.target.value)}>
              {availableModels.length === 0 ? <option value="">No models detected</option> : null}
              {availableModels.map((model) => (
                <option key={model.id} value={model.id}>{model.displayName}</option>
              ))}
            </select>
            <div className="levi-ai-chat-model-meta">
              <span>{selectedModel?.contextWindow ? `${selectedModel.contextWindow} ctx` : "Context unknown"}</span>
              <span>Tools {selectedModel?.toolSupport ? "Yes" : "No"}</span>
              <span>Vision {selectedModel?.visionSupport ? "Yes" : "No"}</span>
              <span>{budget.remainingTokens !== undefined ? `${Math.max(0, budget.remainingTokens)} tokens left` : `${budget.totalTokens} estimated tokens`}</span>
            </div>
          </div>
        ) : null}
      </details>

      <details className="levi-ai-chat-disclosure" open={historyOpen} onToggle={(event) => setHistoryOpen(event.currentTarget.open)}>
        <summary>History</summary>
        {historyOpen ? (
          <section className="levi-ai-chat-history" aria-label="Conversation History">
            <input aria-label="Search Chats" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats" />
            <div className="levi-ai-chat-filters">
              <label><input type="checkbox" checked={pinnedOnly} onChange={(event) => setPinnedOnly(event.target.checked)} /> Pinned</label>
              <label><input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} /> Archived</label>
            </div>
            {filteredConversations.map((conversation) => (
              <div key={conversation.id} className={conversation.id === state.activeConversationId ? "levi-ai-chat-history-item levi-ai-chat-history-item-active" : "levi-ai-chat-history-item"}>
                {renamingId === conversation.id ? (
                  <input aria-label="Rename Chat" value={renameDraft} onChange={(event) => setRenameDraft(event.target.value)} />
                ) : (
                  <button type="button" onClick={() => setState({ ...state, activeConversationId: conversation.id })}>{conversation.pinned ? "Pinned " : ""}{conversation.title}</button>
                )}
                <button type="button" aria-label={`Pin ${conversation.title}`} onClick={() => void window.levi.chat.pin({ conversationId: conversation.id }).then(setState)}>Pin</button>
                <button type="button" aria-label={`Rename ${conversation.title}`} onClick={() => void renameConversation(conversation)}>Rename</button>
                <button type="button" aria-label={`Export ${conversation.title}`} onClick={() => void exportConversation(conversation.id)}>Export</button>
                <button type="button" aria-label={`Export JSON ${conversation.title}`} onClick={() => void exportConversationJson(conversation.id)}>JSON</button>
                <button type="button" aria-label={`Archive ${conversation.title}`} onClick={() => void window.levi.chat.archive({ conversationId: conversation.id, archived: !conversation.archived }).then(setState)}>{conversation.archived ? "Unarchive" : "Archive"}</button>
                <button type="button" aria-label={`Delete ${conversation.title}`} onClick={() => { if (window.confirm(`Delete ${conversation.title}?`)) void window.levi.chat.delete({ conversationId: conversation.id }).then(setState); }}>Delete</button>
              </div>
            ))}
          </section>
        ) : null}
      </details>

      <section className="levi-ai-chat-messages" aria-label="Chat Messages">
        {activeConversation?.messages.length ? activeConversation.messages.map((message) => (
          <article key={message.id} className={`levi-ai-chat-message levi-ai-chat-message-${message.role}`}>
            <div className="levi-ai-chat-message-top">
              <strong>{message.role}</strong>
              <button type="button" onClick={() => void navigator.clipboard?.writeText(message.content)}>Copy message</button>
              {message.role === "assistant" ? <button type="button" onClick={() => void regenerateFrom(message.id)} disabled={generating}>Regenerate</button> : null}
              {message.role === "user" ? <button type="button" onClick={() => setDraft(message.content)}>Edit Prompt</button> : null}
              <button type="button" onClick={() => void forkConversation(message.id)}>Fork Conversation</button>
              <button type="button" onClick={() => void deleteMessage(message.id)}>Delete Message</button>
            </div>
            <SafeMarkdown content={message.content || (message.status === "streaming" ? "Thinking..." : "")} />
            {message.attachments?.length ? (
              <div className="levi-ai-chat-attachments" aria-label="Attached context">
                {message.attachments.map((attachment) => <span key={attachment.id}>{attachment.sourceId ? `${attachment.sourceId} ` : ""}{attachment.label}</span>)}
              </div>
            ) : null}
            {message.citations?.length ? (
              <div className="levi-ai-chat-citations" aria-label="Citations">
                {message.citations.map((citation) => (
                  <button key={citation.sourceId} type="button" onClick={() => void window.levi.chat.openCitation({ conversationId: activeConversation.id, sourceId: citation.sourceId }).then((attachment) => onOpenCitation?.(attachment))}>
                    {citation.sourceId} {citation.relativePath}{citation.lineStart ? `:${citation.lineStart}` : ""}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        )) : <div className="levi-ai-chat-empty">Start a conversation with Levi.</div>}
        <div ref={messagesEndRef} />
      </section>

      <section className="levi-ai-chat-composer" aria-label="Prompt Composer">
        {attachments.length ? (
          <div className="levi-ai-chat-attachments" aria-label="Attached context before sending">
            {attachments.map((attachment) => (
              <button key={attachment.id} type="button" onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}>
                {attachment.sourceId ? `${attachment.sourceId} ` : ""}{attachment.label}
                <small>{attachment.lineStart ? `:${attachment.lineStart}-${attachment.lineEnd ?? attachment.lineStart}` : ""} {attachment.tokenEstimate ?? estimateTokens(attachment.content ?? "")} tokens</small>
              </button>
            ))}
          </div>
        ) : null}
        <details className="levi-ai-chat-context-disclosure" open={contextOpen} onToggle={(event) => setContextOpen(event.currentTarget.open)}>
          <summary>Add context</summary>
          {contextOpen ? (
            <>
              <div className="levi-ai-chat-attachment-actions">
                <button type="button" onClick={() => void attachCurrentFile()} disabled={!activeTab}>Current file</button>
                <button type="button" onClick={() => void attachSelectedCode()} disabled={!selectedCode}>Selected code</button>
                <button type="button" onClick={() => void attachOpenTabs()} disabled={!tabs.length}>Open tabs</button>
                <button type="button" onClick={() => void attachWorkspaceSummary()} disabled={!workspaceStatus?.summary}>Workspace summary</button>
                <button type="button" onClick={() => void attachProjectRules()}>Project Rules</button>
                <button type="button" onClick={() => void attachProblems()}>Problems</button>
                <button type="button" onClick={() => void attachTaskOutput()}>Task output</button>
                <button type="button" onClick={() => void attachTaskOutput("git-diff")}>Git changes</button>
                <button type="button" onClick={() => void attachClipboard()}>Clipboard</button>
                <button type="button" onClick={() => setAttachments((current) => [...current, { id: createAttachmentId(), type: "image-placeholder", label: "Image placeholder" }])}>Image</button>
              </div>
              <div className="levi-ai-chat-context-picker" aria-label="Workspace Explorer">
                <input aria-label="Search workspace paths" value={pathQuery} onChange={(event) => setPathQuery(event.target.value)} placeholder="Search workspace paths" />
                {filteredPaths.map((item) => (
                  <button key={`${item.kind}:${item.relativePath}`} type="button" onClick={() => void attachWorkspacePath(item)}>
                    {item.kind === "folder" ? "Folder" : "File"} {item.relativePath}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </details>
        {contextError ? <div className="levi-ai-chat-error" role="alert">{contextError}</div> : null}
        {budget.exceedsBudget ? <div className="levi-ai-chat-error" role="alert">Context exceeds this model. Remove: {budget.oversizedAttachments.join(", ") || "attachments"}.</div> : null}
        <textarea
          aria-label="AI Chat Prompt"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          placeholder="Ask about the workspace, code, or implementation choices."
        />
        <div className="levi-ai-chat-composer-footer">
          <span>{draft.length} chars / ~{estimateTokens(draft)} tokens / {budget.totalTokens} total</span>
          <button type="button" className="levi-send-button" aria-label={generating ? "Stop Generation" : "Send Chat"} disabled={generating ? false : !draft.trim() || !modelId || budget.exceedsBudget} onClick={() => generating ? void stopGeneration() : void sendMessage()}>
            {generating ? <Icon name="stop" /> : <Icon name="send" />}
          </button>
        </div>
      </section>
    </aside>
  );
}

function updateMessageContent(state: AIChatState, conversationId: string, messageId: string, content: string): AIChatState {
  return {
    ...state,
    conversations: state.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            messages: conversation.messages.map((message) => message.id === messageId ? { ...message, content: message.content + content, status: "streaming" } : message)
          }
        : conversation
    )
  };
}

function applyCitations(state: AIChatState, conversationId: string, messageId: string, citations: AIChatCitation[]): AIChatState {
  return {
    ...state,
    conversations: state.conversations.map((conversation) =>
      conversation.id === conversationId
        ? {
            ...conversation,
            messages: conversation.messages.map((message) => message.id === messageId ? { ...message, citations } : message)
          }
        : conversation
    )
  };
}
