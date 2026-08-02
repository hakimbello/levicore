import { useEffect, useMemo, useRef, useState } from "react";
import type { AIRuntimeProviderId, AIRuntimeState } from "../ai-runtime";
import type { EditorTab } from "../../hooks/use-editor-tabs";
import { Icon } from "../../components/Icon";
import { SafeMarkdown } from "../home/SafeMarkdown";
import type { AIChatAttachment, AIChatConversation, AIChatDockPosition, AIChatState } from "./types";

type AIChatPanelProps = {
  runtimeState: AIRuntimeState;
  activeTab?: EditorTab | null;
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

export function AIChatPanel({ runtimeState, activeTab }: AIChatPanelProps) {
  const [state, setState] = useState<AIChatState>(emptyChatState);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [runtimeId, setRuntimeId] = useState<AIRuntimeProviderId | "">("");
  const [modelId, setModelId] = useState("");
  const [attachments, setAttachments] = useState<AIChatAttachment[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const selectedRuntime = runtimeState.providers.find((provider) => provider.id === (runtimeId || runtimeState.selectedRuntimeId));
  const availableModels = selectedRuntime?.models ?? [];
  const activeConversation = state.conversations.find((conversation) => conversation.id === state.activeConversationId);
  const filteredConversations = state.conversations.filter((conversation) => conversation.title.toLowerCase().includes(search.toLowerCase()));
  const selectedModel = availableModels.find((model) => model.id === modelId) ?? availableModels[0];
  const generating = Boolean(activeRequestId);

  useEffect(() => {
    let disposed = false;
    window.levi.chat.list().then((next) => {
      if (!disposed) setState(next);
    });
    return window.levi.chat.onEvent((event) => {
      if (event.type === "state") setState(event.state);
      else if (event.type === "chunk") {
        setState((current) => updateMessageContent(current, event.conversationId, event.messageId, event.content));
      } else if (event.type === "done" || event.type === "stopped" || event.type === "error") {
        setState(event.state);
        setActiveRequestId(null);
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

  const dockClass = useMemo(() => `levi-ai-chat-panel levi-ai-chat-dock-${state.panel.dockPosition}`, [state.panel.dockPosition]);

  async function createChat() {
    setState(await window.levi.chat.new({ runtimeId: runtimeId || undefined, modelId: modelId || undefined }));
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!content || !modelId || generating) return;
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
    const result = await window.levi.chat.export({ conversationId });
    await navigator.clipboard?.writeText(result.markdown);
  }

  async function deleteMessage(messageId: string) {
    if (!activeConversation) return;
    setState(await window.levi.chat.deleteMessage({ conversationId: activeConversation.id, messageId }));
  }

  async function forkConversation(messageId?: string) {
    if (!activeConversation) return;
    setState(await window.levi.chat.fork({ conversationId: activeConversation.id, messageId }));
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
    setAttachments((current) => [
      ...current,
      { id: createAttachmentId(), type: "clipboard", label: "Clipboard", content: content.slice(0, 40_000) }
    ]);
  }

  function attachCurrentFile() {
    if (!activeTab) return;
    setAttachments((current) => [
      ...current,
      {
        id: createAttachmentId(),
        type: "current-file",
        label: activeTab.relativePath,
        relativePath: activeTab.relativePath,
        language: activeTab.language,
        content: activeTab.content.slice(0, 40_000)
      }
    ]);
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
          <p className="levi-eyebrow">AI Chat</p>
          <h2>{activeConversation?.title ?? "Levi Chat"}</h2>
        </div>
        <button type="button" className="levi-button levi-button-secondary" aria-label="New AI Chat" onClick={() => void createChat()}>
          <Icon name="plus" />
          <span>New Chat</span>
        </button>
      </header>

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
        </div>
      </div>

      <section className="levi-ai-chat-history" aria-label="Conversation History">
        <input aria-label="Search Chats" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chats" />
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
            <button type="button" aria-label={`Delete ${conversation.title}`} onClick={() => void window.levi.chat.delete({ conversationId: conversation.id }).then(setState)}>Delete</button>
          </div>
        ))}
      </section>

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
                {message.attachments.map((attachment) => <span key={attachment.id}>{attachment.label}</span>)}
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
                {attachment.label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="levi-ai-chat-attachment-actions">
          <button type="button" onClick={attachCurrentFile} disabled={!activeTab}>Current file</button>
          <button type="button" onClick={() => setAttachments((current) => [...current, { id: createAttachmentId(), type: "selection", label: "Workspace selection" }])}>Workspace selection</button>
          <button type="button" onClick={() => void attachClipboard()}>Clipboard</button>
          <button type="button" onClick={() => setAttachments((current) => [...current, { id: createAttachmentId(), type: "image-placeholder", label: "Image placeholder" }])}>Image</button>
        </div>
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
          <span>{draft.length} chars / ~{estimateTokens(draft)} tokens</span>
          <button type="button" className="levi-send-button" aria-label={generating ? "Stop Generation" : "Send Chat"} disabled={generating ? false : !draft.trim() || !modelId} onClick={() => generating ? void stopGeneration() : void sendMessage()}>
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
