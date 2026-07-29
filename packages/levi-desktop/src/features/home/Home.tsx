import { lazy, useEffect, useRef, useState } from "react";
import {
  DEFAULT_CONVERSATION_MODEL,
  MAX_CONVERSATION_MESSAGE_LENGTH,
  type ConversationMessage,
  type EditApplyResult,
  type EditProposal,
  type EditUndoResult,
  type ExecutionPlan,
  type ExecutionPublicTransaction,
  type SelectedProject,
  type WorkspaceFileReference,
  type WorkspaceStatus
} from "../../types/levi-api";
import { Icon } from "../../components/Icon";
import { LazySurface } from "../../components/LazySurface";
import { layout } from "../../design";
import { SafeMarkdown } from "./SafeMarkdown";
import type { PlanActionNotice } from "./plan-format";
import { isPlanningPrompt, isSingleFileEditPrompt } from "../../shared/prompt-routing";

const EditReviewPanel = lazy(async () => {
  const module = await import("./EditReviewPanel");
  return { default: module.EditReviewPanel };
});

const PlanReviewPanel = lazy(async () => {
  const module = await import("./PlanReviewPanel");
  return { default: module.PlanReviewPanel };
});

const ExecutionReviewPanel = lazy(async () => {
  const module = await import("./ExecutionReviewPanel");
  return { default: module.ExecutionReviewPanel };
});

type HomeProps = {
  selectedProject: SelectedProject | null;
  workspaceStatus: WorkspaceStatus;
  newChatSignal: number;
  onOpenCitation: (sourceId: string, lineStart?: number) => Promise<void>;
  onEditApplied: (result: EditApplyResult) => void;
  onEditUndone: (result: EditUndoResult) => void;
};

type ChatMessageStatus = "streaming" | "done" | "stopped" | "error";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: ChatMessageStatus;
  recoverable?: boolean;
  citations?: WorkspaceFileReference[];
};

function createMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getWorkspaceStatusText(status: WorkspaceStatus): string {
  if (status.state === "scanning") return "Scanning project...";
  if (status.state === "ready") return "Workspace ready";
  if (status.state === "failed") return status.error ?? "Scan failed";
  if (status.state === "refresh-required") return "Refresh required";
  return "No workspace scan";
}

function isLikelyEditPrompt(prompt: string): boolean {
  return isSingleFileEditPrompt(prompt);
}

function isLikelyPlanningPrompt(prompt: string): boolean {
  return isPlanningPrompt(prompt);
}

export function Home({ selectedProject, workspaceStatus, newChatSignal, onOpenCitation, onEditApplied }: HomeProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const [activeEditRequestId, setActiveEditRequestId] = useState<string | null>(null);
  const [activeEditAssistantId, setActiveEditAssistantId] = useState<string | null>(null);
  const [activePlanRequestId, setActivePlanRequestId] = useState<string | null>(null);
  const [activePlanAssistantId, setActivePlanAssistantId] = useState<string | null>(null);
  const [editProposal, setEditProposal] = useState<EditProposal | null>(null);
  const [editReviewError, setEditReviewError] = useState<string | null>(null);
  const [lastEditPrompt, setLastEditPrompt] = useState<string | null>(null);
  const [executionPlan, setExecutionPlan] = useState<ExecutionPlan | null>(null);
  const [activeTransaction, setActiveTransaction] = useState<ExecutionPublicTransaction | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [planNotice, setPlanNotice] = useState<PlanActionNotice | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);
  const activeEditRequestIdRef = useRef<string | null>(null);
  const activeEditAssistantIdRef = useRef<string | null>(null);
  const activePlanRequestIdRef = useRef<string | null>(null);
  const activePlanAssistantIdRef = useRef<string | null>(null);

  const isGenerating = Boolean(activeRequestId) || Boolean(activeEditRequestId) || Boolean(activePlanRequestId) || isStarting;
  const canStop = Boolean(activeRequestId) || Boolean(activeEditRequestId) || Boolean(activePlanRequestId);
  const canSubmit = draft.trim().length > 0 && !isGenerating;
  const conversationStarted = messages.length > 0;

  function resizePromptBox() {
    const promptBox = promptRef.current;
    if (!promptBox) {
      return;
    }
    promptBox.style.height = "auto";
    promptBox.style.height = `${Math.min(promptBox.scrollHeight, layout.promptMaxHeight)}px`;
  }

  useEffect(() => {
    activeRequestIdRef.current = activeRequestId;
  }, [activeRequestId]);

  useEffect(() => {
    activeAssistantIdRef.current = activeAssistantId;
  }, [activeAssistantId]);

  useEffect(() => {
    activeEditRequestIdRef.current = activeEditRequestId;
  }, [activeEditRequestId]);

  useEffect(() => {
    activeEditAssistantIdRef.current = activeEditAssistantId;
  }, [activeEditAssistantId]);

  useEffect(() => {
    activePlanRequestIdRef.current = activePlanRequestId;
  }, [activePlanRequestId]);

  useEffect(() => {
    activePlanAssistantIdRef.current = activePlanAssistantId;
  }, [activePlanAssistantId]);

  useEffect(() => {
    let disposed = false;
    window.levi.planning.getStatus().then((status) => {
      if (disposed || !status.latestPlan) {
        return;
      }
      setExecutionPlan(status.latestPlan);
      setMessages([
        {
          id: createMessageId("assistant"),
          role: "assistant",
          content: "Restored the latest read-only plan from this Levi window.",
          status: "done"
        }
      ]);
    });
    void window.levi.execution.getStatus().then((status) => {
      if (disposed || !status.activeTransaction) {
        return;
      }
      setActiveTransaction(status.activeTransaction);
    });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    return window.levi.conversation.onEvent((event) => {
      if (activeRequestIdRef.current && event.requestId !== activeRequestIdRef.current) {
        return;
      }

      if (event.type === "chunk") {
        const assistantId = activeAssistantIdRef.current;
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, content: message.content + event.content } : message
          )
        );
        return;
      }

      if (event.type === "done") {
        const assistantId = activeAssistantIdRef.current;
        setMessages((current) =>
          current.map((message) => (message.id === assistantId ? { ...message, status: "done" } : message))
        );
        setActiveRequestId(null);
        setActiveAssistantId(null);
        return;
      }

      if (event.type === "stopped") {
        const assistantId = activeAssistantIdRef.current;
        setMessages((current) =>
          current.map((message) => (message.id === assistantId ? { ...message, status: "stopped" } : message))
        );
        setActiveRequestId(null);
        setActiveAssistantId(null);
        return;
      }

      if (event.type === "error") {
        const assistantId = activeAssistantIdRef.current;
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: message.content || event.message,
                  status: "error",
                  recoverable: event.recoverable
                }
              : message
          )
        );
        setActiveRequestId(null);
        setActiveAssistantId(null);
        return;
      }

      if (event.type === "citations") {
        const assistantId = activeAssistantIdRef.current;
        setMessages((current) =>
          current.map((message) => (message.id === assistantId ? { ...message, citations: event.citations } : message))
        );
      }
    });
  }, []);

  useEffect(() => {
    return window.levi.planning.onEvent((event) => {
      if (event.type === "status") {
        if (activePlanRequestIdRef.current && event.requestId !== activePlanRequestIdRef.current) {
          return;
        }
        const assistantId = activePlanAssistantIdRef.current;
        setMessages((current) =>
          current.map((message) => (message.id === assistantId ? { ...message, content: event.message, status: "streaming" } : message))
        );
        return;
      }

      if (event.type === "plan") {
        if (activePlanRequestIdRef.current && event.requestId !== activePlanRequestIdRef.current) {
          return;
        }
        const assistantId = activePlanAssistantIdRef.current;
        setExecutionPlan(event.plan);
        setPlanNotice(null);
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: "Review the read-only execution plan below. No files were modified.",
                  status: "done"
                }
              : message
          )
        );
        setActivePlanRequestId(null);
        setActivePlanAssistantId(null);
        return;
      }

      if (event.type === "approved") {
        setPlanNotice({ planId: event.planId, message: event.message });
        setActiveTransaction(event.transaction);
        setExecutionError(null);
        return;
      }

      if (event.type === "stopped") {
        const assistantId = activePlanAssistantIdRef.current;
        setMessages((current) =>
          current.map((message) => (message.id === assistantId ? { ...message, status: "stopped" } : message))
        );
        setActivePlanRequestId(null);
        setActivePlanAssistantId(null);
        return;
      }

      if (event.type === "error") {
        if (event.requestId && activePlanRequestIdRef.current && event.requestId !== activePlanRequestIdRef.current) {
          return;
        }
        const assistantId = activePlanAssistantIdRef.current;
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: event.message,
                  status: "error",
                  recoverable: event.recoverable
                }
              : message
          )
        );
        setActivePlanRequestId(null);
        setActivePlanAssistantId(null);
      }
    });
  }, []);

  useEffect(() => {
    return window.levi.edits.onEvent((event) => {
      if (event.type === "status") {
        if (activeEditRequestIdRef.current && event.requestId !== activeEditRequestIdRef.current) {
          return;
        }
        const assistantId = activeEditAssistantIdRef.current;
        setMessages((current) =>
          current.map((message) => (message.id === assistantId ? { ...message, content: event.message, status: "streaming" } : message))
        );
        return;
      }

      if (event.type === "proposal") {
        if (activeEditRequestIdRef.current && event.requestId !== activeEditRequestIdRef.current) {
          return;
        }
        const assistantId = activeEditAssistantIdRef.current;
        setEditProposal(event.proposal);
        setEditReviewError(null);
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: "Review the proposed one-file diff below. The file has not been modified.",
                  status: "done"
                }
              : message
          )
        );
        setActiveEditRequestId(null);
        setActiveEditAssistantId(null);
        return;
      }

      if (event.type === "error") {
        if (event.requestId && activeEditRequestIdRef.current && event.requestId !== activeEditRequestIdRef.current) {
          return;
        }
        const assistantId = activeEditAssistantIdRef.current;
        if (event.proposalId) {
          setEditReviewError(event.message);
          if (event.code === "STALE_PROPOSAL") {
            setEditProposal((current) => (current && current.proposalId === event.proposalId ? { ...current, status: "stale" } : current));
          }
        }
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: event.message,
                  status: "error",
                  recoverable: event.recoverable
                }
              : message
          )
        );
        setActiveEditRequestId(null);
        setActiveEditAssistantId(null);
      }
    });
  }, []);

  useEffect(() => {
    return window.levi.execution.onEvent((event) => {
      if (event.type === "status") {
        setExecutionError(null);
        return;
      }
      if (event.type === "prepared") {
        setActiveTransaction(event.transaction);
        setExecutionError(null);
        return;
      }
      if (event.type === "proposal") {
        setActiveTransaction(event.transaction);
        setExecutionError(null);
        return;
      }
      if (event.type === "applied") {
        setActiveTransaction(event.transaction);
        setExecutionError(null);
        return;
      }
      if (event.type === "kept" || event.type === "cancelled" || event.type === "rolled-back") {
        setActiveTransaction(event.transaction);
        setExecutionError(null);
        return;
      }
      if (event.type === "error") {
        setExecutionError(event.message);
      }
    });
  }, []);

  useEffect(() => {
    if (activeRequestIdRef.current) {
      void window.levi.conversation.cancel(activeRequestIdRef.current);
    }
    if (activeEditRequestIdRef.current) {
      void window.levi.edits.cancel(activeEditRequestIdRef.current);
    }
    if (activePlanRequestIdRef.current) {
      void window.levi.planning.cancel(activePlanRequestIdRef.current);
    }
    setDraft("");
    requestAnimationFrame(resizePromptBox);
    setMessages([]);
    setActiveRequestId(null);
    setActiveAssistantId(null);
    setActiveEditRequestId(null);
    setActiveEditAssistantId(null);
    setActivePlanRequestId(null);
    setActivePlanAssistantId(null);
    setEditProposal(null);
    setEditReviewError(null);
    setLastEditPrompt(null);
    setExecutionPlan(null);
    setActiveTransaction(null);
    setExecutionError(null);
    setPlanNotice(null);
    setIsStarting(false);
  }, [newChatSignal]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages]);

  async function startGeneration(nextMessages: ChatMessage[]) {
    const assistantId = createMessageId("assistant");
    const messagesWithAssistant: ChatMessage[] = [
      ...nextMessages,
      { id: assistantId, role: "assistant", content: "", status: "streaming" }
    ];
    setMessages(messagesWithAssistant);
    setActiveAssistantId(assistantId);
    activeAssistantIdRef.current = assistantId;
    setIsStarting(true);

    const apiMessages: ConversationMessage[] = nextMessages.map((message) => ({
      role: message.role,
      content: message.content
    }));

    try {
      const result = await window.levi.conversation.start({
        model: DEFAULT_CONVERSATION_MODEL,
        messages: apiMessages
      });
      activeRequestIdRef.current = result.requestId;
      setActiveRequestId(result.requestId);
      setIsStarting(false);
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: "Levi could not start the local response. You can retry.",
                status: "error",
                recoverable: true
              }
            : message
        )
      );
      setActiveRequestId(null);
      setActiveAssistantId(null);
      setIsStarting(false);
    }
  }

  async function startEditProposal(nextMessages: ChatMessage[], prompt: string) {
    const assistantId = createMessageId("assistant");
    setMessages([
      ...nextMessages,
      { id: assistantId, role: "assistant", content: "Preparing a safe single-file diff...", status: "streaming" }
    ]);
    setActiveEditAssistantId(assistantId);
    activeEditAssistantIdRef.current = assistantId;
    setEditProposal(null);
    setEditReviewError(null);
    setLastEditPrompt(prompt);
    setIsStarting(true);
    try {
      const result = await window.levi.edits.propose({ prompt });
      activeEditRequestIdRef.current = result.requestId;
      setActiveEditRequestId(result.requestId);
      setIsStarting(false);
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: "Levi could not start the edit proposal. You can retry.",
                status: "error",
                recoverable: true
              }
            : message
        )
      );
      setActiveEditRequestId(null);
      setActiveEditAssistantId(null);
      setIsStarting(false);
    }
  }

  async function startPlanning(nextMessages: ChatMessage[], prompt: string) {
    const assistantId = createMessageId("assistant");
    setMessages([
      ...nextMessages,
      { id: assistantId, role: "assistant", content: "Preparing a read-only execution plan...", status: "streaming" }
    ]);
    setActivePlanAssistantId(assistantId);
    activePlanAssistantIdRef.current = assistantId;
    setExecutionPlan(null);
    setPlanNotice(null);
    setIsStarting(true);
    try {
      const result = await window.levi.planning.create({ prompt });
      activePlanRequestIdRef.current = result.requestId;
      setActivePlanRequestId(result.requestId);
      setIsStarting(false);
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: "Levi could not start the planning request. You can retry.",
                status: "error",
                recoverable: true
              }
            : message
        )
      );
      setActivePlanRequestId(null);
      setActivePlanAssistantId(null);
      setIsStarting(false);
    }
  }

  async function submitPrompt() {
    const content = draft.trim();
    if (!content || isGenerating) {
      return;
    }
    const boundedContent = content.slice(0, MAX_CONVERSATION_MESSAGE_LENGTH);
    const userMessage: ChatMessage = { id: createMessageId("user"), role: "user", content: boundedContent };
    setDraft("");
    requestAnimationFrame(resizePromptBox);
    const nextMessages = [...messages.filter((message) => message.status !== "error"), userMessage];
    if (isLikelyEditPrompt(boundedContent)) {
      await startEditProposal(nextMessages, boundedContent);
    } else if (isLikelyPlanningPrompt(boundedContent)) {
      await startPlanning(nextMessages, boundedContent);
    } else {
      await startGeneration(nextMessages);
    }
  }

  async function stopGeneration() {
    if (activeRequestIdRef.current) {
      await window.levi.conversation.cancel(activeRequestIdRef.current);
    }
    if (activeEditRequestIdRef.current) {
      await window.levi.edits.cancel(activeEditRequestIdRef.current);
    }
    if (activePlanRequestIdRef.current) {
      await window.levi.planning.cancel(activePlanRequestIdRef.current);
    }
  }

  async function retryMessage(messageId: string) {
    if (activeRequestId) {
      return;
    }
    const failedIndex = messages.findIndex((message) => message.id === messageId);
    if (failedIndex <= 0) {
      return;
    }
    const retryMessages = messages.slice(0, failedIndex).filter((message) => message.role === "user" || message.content.trim());
    await startGeneration(retryMessages);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitPrompt();
    }
  }

  async function applyProposal() {
    if (!editProposal) {
      return;
    }
    const result = await window.levi.edits.apply(editProposal.proposalId);
    onEditApplied(result);
    setEditProposal(null);
    setEditReviewError(null);
  }

  async function rejectProposal() {
    if (!editProposal) {
      return;
    }
    await window.levi.edits.reject(editProposal.proposalId);
    setEditProposal(null);
    setEditReviewError(null);
  }

  async function regenerateProposal() {
    if (!lastEditPrompt || isGenerating) {
      return;
    }
    setEditProposal(null);
    setEditReviewError(null);
    await startEditProposal(messages, lastEditPrompt);
  }

  async function approvePlan() {
    if (!executionPlan || activeTransaction) {
      return;
    }
    try {
      const result = await window.levi.planning.approve(executionPlan.planId);
      setPlanNotice({ planId: result.planId, message: result.message });
      setActiveTransaction(result.transaction);
      setExecutionError(null);
    } catch (error) {
      setPlanNotice({
        planId: executionPlan.planId,
        message: error instanceof Error ? error.message : "Plan approval failed."
      });
    }
  }

  async function applyExecutionStep() {
    if (!activeTransaction) {
      return;
    }
    const result = await window.levi.execution.applyStep(activeTransaction.transactionId);
    setActiveTransaction(result.transaction);
    setExecutionError(null);
  }

  async function rejectExecutionStep() {
    if (!activeTransaction) {
      return;
    }
    const result = await window.levi.execution.rejectStep(activeTransaction.transactionId);
    setActiveTransaction(result.transaction);
    setExecutionError(null);
  }

  async function regenerateExecutionStep() {
    if (!activeTransaction) {
      return;
    }
    setExecutionError(null);
    await window.levi.execution.regenerateStep(activeTransaction.transactionId);
  }

  async function proposeExecutionStep() {
    if (!activeTransaction) {
      return;
    }
    setExecutionError(null);
    await window.levi.execution.proposeStep(activeTransaction.transactionId);
  }

  async function cancelExecution() {
    if (!activeTransaction) {
      return;
    }
    const result = await window.levi.execution.cancel(activeTransaction.transactionId);
    setActiveTransaction(result.transaction);
  }

  async function keepExecution() {
    if (!activeTransaction) {
      return;
    }
    const result = await window.levi.execution.keep(activeTransaction.transactionId);
    setActiveTransaction(result.transaction);
    setExecutionPlan(null);
  }

  async function rollbackExecution() {
    if (!activeTransaction) {
      return;
    }
    const result = await window.levi.execution.rollback(activeTransaction.transactionId);
    setActiveTransaction(result.transaction);
    setExecutionPlan(null);
  }

  function refinePlan() {
    setDraft("Refine this plan: ");
    requestAnimationFrame(() => {
      resizePromptBox();
      promptRef.current?.focus();
    });
  }

  function askPlanQuestion() {
    setDraft("Question about this plan: ");
    requestAnimationFrame(() => {
      resizePromptBox();
      promptRef.current?.focus();
    });
  }

  return (
    <section className={conversationStarted ? "levi-home levi-home-chat" : "levi-home"} aria-label="Home">
      <div className={conversationStarted ? "levi-home-content levi-chat-content" : "levi-home-content"}>
        {!conversationStarted ? (
          <>
            {selectedProject ? (
              <div className="levi-home-project">
                {selectedProject.name} - {getWorkspaceStatusText(workspaceStatus)}
              </div>
            ) : null}
            <h1>What do you want to build?</h1>
          </>
        ) : (
          <div className="levi-messages" aria-label="Conversation">
            {messages.map((message) => (
              <article key={message.id} className={`levi-message levi-message-${message.role}`}>
                <div className="levi-message-role">{message.role === "user" ? "You" : "Levi"}</div>
                <div className="levi-message-body">
                  {message.content ? <SafeMarkdown content={message.content} /> : null}
                  {!message.content && message.status === "streaming" ? <span className="levi-streaming-dot">Thinking</span> : null}
                  {message.citations?.length ? (
                    <div className="levi-citations" aria-label="Supporting files">
                      {message.citations.map((citation) => (
                        <button
                          key={citation.sourceId}
                          type="button"
                          className="levi-citation"
                          title={citation.reason}
                          onClick={() => void onOpenCitation(citation.sourceId, citation.lineStart)}
                        >
                          {citation.relativePath}:{citation.lineStart}-{citation.lineEnd}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {message.status === "stopped" ? <div className="levi-message-note">Stopped</div> : null}
                  {message.status === "error" && message.recoverable ? (
                    <button type="button" className="levi-retry-button" onClick={() => void retryMessage(message.id)}>
                      Retry
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
            {editProposal ? (
              <LazySurface label="Diff review">
                <EditReviewPanel
                  proposal={editProposal}
                  error={editReviewError}
                  onApply={applyProposal}
                  onReject={rejectProposal}
                  onRegenerate={regenerateProposal}
                />
              </LazySurface>
            ) : null}
            {executionPlan ? (
              <LazySurface label="Planning">
                <PlanReviewPanel
                  plan={executionPlan}
                  notice={planNotice}
                  approveDisabled={Boolean(activeTransaction)}
                  approveTitle={activeTransaction ? "An execution transaction is already active." : undefined}
                  onApprove={approvePlan}
                  onRefine={refinePlan}
                  onAskQuestion={askPlanQuestion}
                />
              </LazySurface>
            ) : null}
            {activeTransaction && executionPlan ? (
              <LazySurface label="Execution review">
                <ExecutionReviewPanel
                  transaction={activeTransaction}
                  plan={executionPlan}
                  error={executionError}
                  onApplyStep={applyExecutionStep}
                  onRejectStep={rejectExecutionStep}
                  onRegenerateStep={regenerateExecutionStep}
                  onCancel={cancelExecution}
                  onKeep={keepExecution}
                  onRollback={rollbackExecution}
                  onProposeStep={proposeExecutionStep}
                />
              </LazySurface>
            ) : null}
            <div ref={messagesEndRef} />
          </div>
        )}

        <div className={conversationStarted ? "levi-composer levi-composer-chat" : "levi-composer"}>
          <button type="button" className="levi-attach-button" aria-label="Add attachment" title="Add attachment">
            <Icon name="plus" />
          </button>
          <textarea
            ref={promptRef}
            aria-label="Prompt"
            className="levi-prompt-box"
            placeholder="Ask Levi to explain, inspect, or safely propose a one-file change."
            value={draft}
            maxLength={MAX_CONVERSATION_MESSAGE_LENGTH}
            onChange={(event) => {
              setDraft(event.target.value);
              resizePromptBox();
            }}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className={canStop ? "levi-send-button levi-stop-button" : "levi-send-button"}
            aria-label={canStop ? "Stop" : "Send"}
            title={canStop ? "Stop" : "Send"}
            disabled={!canStop && !canSubmit}
            onClick={() => {
              if (canStop) {
                void stopGeneration();
              } else if (!isStarting) {
                void submitPrompt();
              }
            }}
          >
            {canStop ? <Icon name="stop" /> : <Icon name="send" />}
          </button>
        </div>
      </div>
    </section>
  );
}
