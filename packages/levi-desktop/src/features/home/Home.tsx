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
import type { AgentApprovalAction, AgentSession, AgentState, AgentVerificationReport } from "../agent";
import { Icon } from "../../components/Icon";
import { LazySurface } from "../../components/LazySurface";
import { layout } from "../../design";
import { SafeMarkdown } from "./SafeMarkdown";
import type { PlanActionNotice } from "./plan-format";
import { classifyPromptIntent } from "../../shared/prompt-routing";
import { type BuildPhase, BuildReviewPanel } from "./BuildReviewPanel";

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
  onExecutionTransactionUpdate: (transaction: ExecutionPublicTransaction) => void;
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
  return classifyPromptIntent(prompt) === "edit";
}

function isLikelyPlanningPrompt(prompt: string): boolean {
  return classifyPromptIntent(prompt) === "plan";
}

function isLikelyBuildPrompt(prompt: string): boolean {
  return classifyPromptIntent(prompt) === "build";
}

function sessionFromState(state: AgentState, sessionId: string): AgentSession | null {
  return state.sessions.find((session) => session.id === sessionId) ?? null;
}

function buildProgressMessage(session: AgentSession, phase: BuildPhase): string {
  const plan = session.plan;
  if (!plan) {
    return phase === "planning" ? "Planning build..." : "Preparing build...";
  }
  const completed = plan.progress.completedActions;
  const total = plan.approvals.length;
  if (phase === "building") {
    return `Building. Step ${Math.min(completed + 1, total)} of ${total}.`;
  }
  if (phase === "verifying") {
    return "Running verification...";
  }
  if (phase === "completed") {
    return "Build completed. Review the completion report below.";
  }
  return "Review the build plan below. No files have been modified.";
}

export function Home({
  selectedProject,
  workspaceStatus,
  newChatSignal,
  onOpenCitation,
  onEditApplied,
  onExecutionTransactionUpdate
}: HomeProps) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const [activeEditRequestId, setActiveEditRequestId] = useState<string | null>(null);
  const [activeEditAssistantId, setActiveEditAssistantId] = useState<string | null>(null);
  const [activePlanRequestId, setActivePlanRequestId] = useState<string | null>(null);
  const [activePlanAssistantId, setActivePlanAssistantId] = useState<string | null>(null);
  const [activeBuildAssistantId, setActiveBuildAssistantId] = useState<string | null>(null);
  const [activeBuildSession, setActiveBuildSession] = useState<AgentSession | null>(null);
  const [buildPhase, setBuildPhase] = useState<BuildPhase>("idle");
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildVerification, setBuildVerification] = useState<AgentVerificationReport | null>(null);
  const [editProposal, setEditProposal] = useState<EditProposal | null>(null);
  const [editReviewError, setEditReviewError] = useState<string | null>(null);
  const [lastEditPrompt, setLastEditPrompt] = useState<string | null>(null);
  const [executionPlan, setExecutionPlan] = useState<ExecutionPlan | null>(null);
  const [activeTransaction, setActiveTransaction] = useState<ExecutionPublicTransaction | null>(null);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [planNotice, setPlanNotice] = useState<PlanActionNotice | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const activeRequestIdRef = useRef<string | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);
  const activeEditRequestIdRef = useRef<string | null>(null);
  const activeEditAssistantIdRef = useRef<string | null>(null);
  const activePlanRequestIdRef = useRef<string | null>(null);
  const activePlanAssistantIdRef = useRef<string | null>(null);
  const activeBuildAssistantIdRef = useRef<string | null>(null);
  const activeBuildSessionIdRef = useRef<string | null>(null);

  const isBuildBusy = buildPhase === "planning" || buildPhase === "building" || buildPhase === "verifying";
  const isGenerating = Boolean(activeRequestId) || Boolean(activeEditRequestId) || Boolean(activePlanRequestId) || isStarting || isBuildBusy;
  const canStop = Boolean(activeRequestId) || Boolean(activeEditRequestId) || Boolean(activePlanRequestId) || isBuildBusy;
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

  function updateActiveTransaction(transaction: ExecutionPublicTransaction) {
    setActiveTransaction(transaction);
    onExecutionTransactionUpdate(transaction);
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
    activeBuildAssistantIdRef.current = activeBuildAssistantId;
  }, [activeBuildAssistantId]);

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
      updateActiveTransaction(status.activeTransaction);
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
        updateActiveTransaction(event.transaction);
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
        updateActiveTransaction(event.transaction);
        setExecutionError(null);
        return;
      }
      if (event.type === "proposal") {
        updateActiveTransaction(event.transaction);
        setExecutionError(null);
        return;
      }
      if (event.type === "applied") {
        updateActiveTransaction(event.transaction);
        setExecutionError(null);
        return;
      }
      if (event.type === "kept" || event.type === "cancelled" || event.type === "rolled-back") {
        updateActiveTransaction(event.transaction);
        setExecutionError(null);
        return;
      }
      if (event.type === "error") {
        setExecutionError(event.message);
      }
    });
  }, []);

  useEffect(() => {
    return window.levi.agent.onEvent((event) => {
      const sessionId = activeBuildSessionIdRef.current;
      if (!sessionId) {
        return;
      }
      const next = sessionFromState(event.state, sessionId);
      if (next) {
        setActiveBuildSession(next);
      }
      if (event.type === "verification" && event.sessionId === sessionId) {
        setBuildVerification(event.report);
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
    setActiveBuildAssistantId(null);
    setActiveBuildSession(null);
    activeBuildSessionIdRef.current = null;
    setBuildPhase("idle");
    setBuildError(null);
    setBuildVerification(null);
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

  async function startBuildPlan(nextMessages: ChatMessage[], prompt: string) {
    const assistantId = createMessageId("assistant");
    setMessages([
      ...nextMessages,
      { id: assistantId, role: "assistant", content: "Understanding request", status: "streaming" }
    ]);
    setActiveBuildAssistantId(assistantId);
    activeBuildAssistantIdRef.current = assistantId;
    setActiveBuildSession(null);
    activeBuildSessionIdRef.current = null;
    setBuildPhase("planning");
    setBuildError(null);
    setBuildVerification(null);
    setIsStarting(true);
    try {
      setMessages((current) =>
        current.map((message) => (message.id === assistantId ? { ...message, content: "Inspecting workspace" } : message))
      );
      const result = await window.levi.agent.plan({
        prompt: [
          prompt,
          "",
          "Treat this as build execution intent, not a read-only plan. Produce concrete approved actions with file contents, safe terminal commands when needed, and verification steps. If this is a new app inside an existing project, put generated files under a sanitized child folder inside the current workspace."
        ].join("\n"),
        modelId: DEFAULT_CONVERSATION_MODEL
      });
      const session = sessionFromState(result.state, result.sessionId);
      if (!session) {
        throw new Error("Build session was not created.");
      }
      setActiveBuildSession(session);
      activeBuildSessionIdRef.current = session.id;
      setBuildPhase("ready");
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, content: buildProgressMessage(session, "ready"), status: "done" }
            : message
        )
      );
    } catch (error) {
      setBuildPhase("blocked");
      setBuildError(error instanceof Error ? error.message : "Levi could not prepare the build plan.");
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: "Levi could not prepare the build plan.",
                status: "error",
                recoverable: true
              }
            : message
        )
      );
    } finally {
      setIsStarting(false);
    }
  }

  function requiresSeparateApproval(action: AgentApprovalAction): boolean {
    if (action.type === "delete-file" || action.type === "git-operation") {
      return true;
    }
    if (action.type.startsWith("browser-")) {
      return true;
    }
    const commandText = `${action.command ?? ""} ${(action.args ?? []).join(" ")}`.toLowerCase();
    return /\b(publish|deploy|release|token|secret|credential|password|api[_-]?key)\b/.test(commandText);
  }

  async function refreshBuildSession(sessionId: string): Promise<AgentSession> {
    const state = await window.levi.agent.status();
    const next = "sessions" in state ? sessionFromState(state, sessionId) : state.id === sessionId ? state : null;
    if (!next && activeBuildSession?.id === sessionId) {
      return activeBuildSession;
    }
    if (!next) {
      throw new Error("Build session is no longer available.");
    }
    setActiveBuildSession(next);
    return next;
  }

  async function waitForTerminalAction(sessionId: string, actionId: string): Promise<void> {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      const status = await window.levi.agent.terminalStatus({ sessionId, actionId });
      const run = status.terminalRuns[0];
      const next = sessionFromState(status.state, sessionId);
      if (next) {
        setActiveBuildSession(next);
      }
      if (!run || run.status === "Succeeded") {
        return;
      }
      if (run.status === "Failed" || run.status === "Cancelled" || run.status === "Interrupted") {
        throw new Error(run.failureReason ?? `Terminal action ${run.status.toLowerCase()}.`);
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    throw new Error("Terminal verification command timed out.");
  }

  async function executeApprovedBuildAction(sessionId: string, action: AgentApprovalAction): Promise<void> {
    if (requiresSeparateApproval(action)) {
      throw new Error(`${action.title} requires separate approval before Levi can continue.`);
    }
    const approved = await window.levi.agent.approve({ sessionId, actionId: action.id });
    const approvedSession = sessionFromState(approved, sessionId);
    if (approvedSession) {
      setActiveBuildSession(approvedSession);
    }
    if (action.type === "run-terminal-command") {
      const preview = await window.levi.agent.terminalPreview({ sessionId, actionId: action.id });
      if (preview.preview.riskLevel === "high") {
        throw new Error(`${action.title} is high risk and requires separate approval.`);
      }
      await window.levi.agent.terminalExecute({ sessionId, actionId: action.id, previewId: preview.preview.previewId });
      await waitForTerminalAction(sessionId, action.id);
      return;
    }
    if (action.type === "run-task") {
      const preview = await window.levi.agent.taskPreview({ sessionId, actionId: action.id });
      if (preview.preview.riskLevel === "high" || preview.preview.longRunning) {
        throw new Error(`${action.title} requires separate approval before Levi can continue.`);
      }
      await window.levi.agent.taskExecute({ sessionId, actionId: action.id, previewId: preview.preview.previewId });
      return;
    }
    const preview = await window.levi.agent.preview({ sessionId, actionId: action.id });
    if (preview.preview.riskLevel === "high" || preview.preview.destructive) {
      throw new Error(`${action.title} requires separate approval before Levi can continue.`);
    }
    await window.levi.agent.execute({ sessionId, actionId: action.id, previewId: preview.preview.previewId });
  }

  async function approveAndBuild() {
    if (!activeBuildSession?.plan || buildPhase !== "ready") {
      return;
    }
    const sessionId = activeBuildSession.id;
    const assistantId = activeBuildAssistantIdRef.current;
    setBuildPhase("building");
    setBuildError(null);
    setBuildVerification(null);
    try {
      let latest = await refreshBuildSession(sessionId);
      const actions = latest.plan?.approvals ?? [];
      for (let index = 0; index < actions.length; index += 1) {
        const action = actions[index];
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? { ...message, content: `Step ${index + 1} of ${actions.length}\n${action.title}`, status: "streaming" }
              : message
          )
        );
        await executeApprovedBuildAction(sessionId, action);
        latest = await refreshBuildSession(sessionId);
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, content: buildProgressMessage(latest, "building"), status: "streaming" } : message
          )
        );
      }
      setBuildPhase("verifying");
      const verification = await window.levi.agent.verify({ sessionId });
      setBuildVerification(verification.report);
      const finalSession = sessionFromState(verification.state, sessionId);
      if (finalSession) {
        setActiveBuildSession(finalSession);
      }
      if (verification.report.status === "Failed") {
        try {
          await window.levi.agent.repairPlan({ sessionId, reportId: verification.report.id });
        } catch {
          // Repair planning is best-effort; the failed report remains visible.
        }
        setBuildPhase("blocked");
        setBuildError("Verification failed. Levi prepared repair guidance when possible; review before applying repairs.");
      } else {
        setBuildPhase("completed");
      }
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: verification.report.status === "Succeeded" ? "Build completed" : "Build blocked by verification",
                status: "done"
              }
            : message
        )
      );
    } catch (error) {
      setBuildPhase("blocked");
      setBuildError(error instanceof Error ? error.message : "Build execution was blocked.");
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: error instanceof Error ? error.message : "Build execution was blocked.",
                status: "error",
                recoverable: true
              }
            : message
        )
      );
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
    } else if (isLikelyBuildPrompt(boundedContent)) {
      await startBuildPlan(nextMessages, boundedContent);
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
    if (activeBuildSessionIdRef.current && isBuildBusy) {
      try {
        await window.levi.agent.cancel({ sessionId: activeBuildSessionIdRef.current });
      } catch {
        // There may be no pending execution queue yet.
      }
      setBuildPhase("cancelled");
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
      updateActiveTransaction(result.transaction);
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
    updateActiveTransaction(result.transaction);
    setExecutionError(null);
  }

  async function rejectExecutionStep() {
    if (!activeTransaction) {
      return;
    }
    const result = await window.levi.execution.rejectStep(activeTransaction.transactionId);
    updateActiveTransaction(result.transaction);
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
    updateActiveTransaction(result.transaction);
  }

  async function keepExecution() {
    if (!activeTransaction) {
      return;
    }
    const result = await window.levi.execution.keep(activeTransaction.transactionId);
    updateActiveTransaction(result.transaction);
    setExecutionPlan(null);
  }

  async function rollbackExecution() {
    if (!activeTransaction) {
      return;
    }
    const result = await window.levi.execution.rollback(activeTransaction.transactionId);
    updateActiveTransaction(result.transaction);
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
            <div className="levi-home-tools" aria-label="Home composer controls">
              <label className="levi-home-model">
                <span>Model</span>
                <select aria-label="Home model selector" value={DEFAULT_CONVERSATION_MODEL} onChange={() => undefined}>
                  <option value={DEFAULT_CONVERSATION_MODEL}>{DEFAULT_CONVERSATION_MODEL}</option>
                </select>
              </label>
              <details className="levi-context-menu" open={contextMenuOpen} onToggle={(event) => setContextMenuOpen(event.currentTarget.open)}>
                <summary>Add context</summary>
                {contextMenuOpen ? (
                  <div className="levi-context-menu-popover">
                    {[
                      "Current file",
                      "Selected code",
                      "Open tabs",
                      "Workspace summary",
                      "Project Rules",
                      "Problems",
                      "Task output",
                      "Git changes",
                      "Clipboard",
                      "Image"
                    ].map((label) => (
                      <button key={label} type="button">{label}</button>
                    ))}
                  </div>
                ) : null}
              </details>
            </div>
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
            {activeBuildSession ? (
              <LazySurface label="Build approval">
                <BuildReviewPanel
                  session={activeBuildSession}
                  phase={buildPhase}
                  error={buildError}
                  verification={buildVerification}
                  onApproveBuild={approveAndBuild}
                  onCancel={async () => {
                    if (activeBuildSessionIdRef.current) {
                      try {
                        await window.levi.agent.cancel({ sessionId: activeBuildSessionIdRef.current });
                      } catch {
                        // No executable queue may exist before approval.
                      }
                    }
                    setBuildPhase("cancelled");
                  }}
                  onEditPlan={() => {
                    setDraft("Adjust this build plan: ");
                    requestAnimationFrame(() => {
                      resizePromptBox();
                      promptRef.current?.focus();
                    });
                  }}
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
