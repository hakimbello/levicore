import { useEffect, useMemo, useState } from "react";
import type { AIRuntimeProviderId, AIRuntimeState } from "../ai-runtime";
import type { AIChatAttachment, AIChatContextDiscoveryResult, AIChatContextPreviewRequest } from "../ai-chat";
import type { EditorTab } from "../../hooks/use-editor-tabs";
import type { TaskOutputEntry, TaskProblem, WorkspaceStatus } from "../../types/levi-api";
import type { AgentSession, AgentState } from "./types";

type AgentPanelProps = {
  runtimeState: AIRuntimeState;
  activeTab?: EditorTab | null;
  tabs?: EditorTab[];
  selectedCode?: { relativePath: string; language?: string; content: string; lineStart: number; lineEnd: number } | null;
  workspaceStatus?: WorkspaceStatus;
  taskProblems?: TaskProblem[];
  taskOutput?: TaskOutputEntry[];
};

const emptyAgentState: AgentState = { sessions: [], updatedAt: new Date(0).toISOString() };
const emptyDiscovery: AIChatContextDiscoveryResult = { recentFiles: [], supports: [] };

export function AgentPanel({ runtimeState, activeTab, tabs = [], selectedCode, workspaceStatus, taskProblems = [], taskOutput = [] }: AgentPanelProps) {
  const [state, setState] = useState<AgentState>(emptyAgentState);
  const [prompt, setPrompt] = useState("");
  const [runtimeId, setRuntimeId] = useState<AIRuntimeProviderId | "">("");
  const [modelId, setModelId] = useState("");
  const [attachments, setAttachments] = useState<AIChatAttachment[]>([]);
  const [discovery, setDiscovery] = useState<AIChatContextDiscoveryResult>(emptyDiscovery);
  const [pathQuery, setPathQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);

  const activeSession = state.sessions.find((session) => session.id === state.activeSessionId);
  const selectedRuntime = runtimeState.providers.find((provider) => provider.id === (runtimeId || activeSession?.runtimeId || runtimeState.selectedRuntimeId));
  const availableModels = selectedRuntime?.models ?? [];
  const selectedModel = availableModels.find((model) => model.id === modelId) ?? availableModels[0];
  const filteredPaths = discovery.recentFiles.filter((item) => item.relativePath.toLowerCase().includes(pathQuery.toLowerCase())).slice(0, 12);

  useEffect(() => {
    let disposed = false;
    window.levi.agent.list().then((next) => {
      if (!disposed) setState(next);
    });
    window.levi.chat.discoverContext().then((next) => {
      if (!disposed) setDiscovery(next);
    });
    return window.levi.agent.onEvent((event) => {
      if (event.type === "state" || event.type === "progress") setState(event.state);
    });
  }, []);

  useEffect(() => {
    const nextRuntime = activeSession?.runtimeId ?? runtimeState.selectedRuntimeId ?? runtimeState.automaticRuntimeId ?? runtimeState.providers[0]?.id ?? "";
    setRuntimeId(nextRuntime);
  }, [activeSession?.runtimeId, runtimeState.automaticRuntimeId, runtimeState.providers, runtimeState.selectedRuntimeId]);

  useEffect(() => {
    const nextModel = activeSession?.modelId ?? selectedRuntime?.models[0]?.id ?? runtimeState.lastSelectedModelId ?? "";
    setModelId(nextModel);
  }, [activeSession?.modelId, runtimeState.lastSelectedModelId, selectedRuntime?.models]);

  async function createSession() {
    setError(null);
    setState(await window.levi.agent.newSession({ runtimeId: runtimeId || undefined, modelId: modelId || undefined }));
  }

  async function submitPlan() {
    const content = prompt.trim();
    if (!content || !modelId || planning) return;
    setPlanning(true);
    setError(null);
    try {
      const result = await window.levi.agent.plan({
        sessionId: activeSession?.id,
        prompt: content,
        runtimeId: runtimeId || undefined,
        modelId,
        attachments,
        openFiles: tabs.slice(0, 24).map((tab) => ({ relativePath: tab.relativePath, language: tab.language }))
      });
      setState(result.state);
      setPrompt("");
      setAttachments([]);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Agent planning failed.");
    } finally {
      setPlanning(false);
    }
  }

  async function addPreview(request: AIChatContextPreviewRequest) {
    setError(null);
    try {
      const result = await window.levi.chat.previewContext(request);
      setAttachments((current) => [...current.filter((item) => item.sourceId !== result.attachment.sourceId), result.attachment].slice(0, 12));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not attach context.");
    }
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
      label: "Open files",
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
        `Package manager: ${summary.packageManager ?? "unknown"}`,
        `Entry points: ${summary.likelyEntryPoints.join(", ")}`,
        `Scripts: ${Object.entries(summary.scripts).map(([name, script]) => `${name}=${script}`).join("; ")}`
      ].join("\n")
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
    await addPreview({ source: item.kind === "folder" ? "workspace-folder" : "workspace-file", relativePath: item.relativePath, confirmSensitive: true });
  }

  const sessionGroups = useMemo(() => ({
    active: state.sessions.filter((session) => !session.archived),
    archived: state.sessions.filter((session) => session.archived)
  }), [state.sessions]);

  return (
    <section className="levi-agent-panel" aria-label="Coding Agent">
      <header className="levi-agent-header">
        <div>
          <p className="levi-eyebrow">Coding Agent</p>
          <h1>{activeSession?.title ?? "Planning only"}</h1>
        </div>
        <button type="button" className="levi-button levi-button-secondary" onClick={() => void createSession()}>New Session</button>
      </header>

      <div className="levi-agent-grid">
        <aside className="levi-agent-sidebar" aria-label="Agent Sessions">
          {sessionGroups.active.map((session) => (
            <SessionButton key={session.id} session={session} active={session.id === activeSession?.id} onSelect={() => setState({ ...state, activeSessionId: session.id })} />
          ))}
          {sessionGroups.archived.length ? <p className="levi-agent-muted">Archived</p> : null}
          {sessionGroups.archived.map((session) => (
            <SessionButton key={session.id} session={session} active={session.id === activeSession?.id} onSelect={() => setState({ ...state, activeSessionId: session.id })} />
          ))}
        </aside>

        <div className="levi-agent-main">
          <section className="levi-agent-card" aria-label="Agent Composer">
            <div className="levi-agent-controls">
              <select aria-label="Agent Runtime" value={runtimeId} onChange={(event) => setRuntimeId(event.target.value as AIRuntimeProviderId)}>
                <option value="">Automatic Runtime</option>
                {runtimeState.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
              </select>
              <select aria-label="Agent Model" value={modelId} onChange={(event) => setModelId(event.target.value)}>
                {availableModels.length === 0 ? <option value="">No models detected</option> : null}
                {availableModels.map((model) => <option key={model.id} value={model.id}>{model.displayName}</option>)}
              </select>
              <span>{selectedModel?.contextWindow ? `${selectedModel.contextWindow} context` : "Context unknown"}</span>
            </div>

            <div className="levi-agent-context-actions">
              <button type="button" onClick={() => void attachCurrentFile()} disabled={!activeTab}>Current file</button>
              <button type="button" onClick={() => void attachSelectedCode()} disabled={!selectedCode}>Selected code</button>
              <button type="button" onClick={() => void attachOpenTabs()} disabled={!tabs.length}>Open files</button>
              <button type="button" onClick={() => void attachWorkspaceSummary()} disabled={!workspaceStatus?.summary}>Workspace summary</button>
              <button type="button" onClick={() => void attachProblems()}>Problems</button>
              <button type="button" onClick={() => void attachTaskOutput()}>Task output</button>
              <button type="button" onClick={() => void attachTaskOutput("git-diff")}>Git changes</button>
            </div>

            {attachments.length ? (
              <div className="levi-agent-context-chips" aria-label="Current Workspace Context">
                {attachments.map((attachment) => (
                  <button key={attachment.id} type="button" onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}>
                    {attachment.sourceId ? `${attachment.sourceId} ` : ""}{attachment.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="levi-agent-context-picker" aria-label="Workspace Context Picker">
              <input aria-label="Search agent workspace paths" value={pathQuery} onChange={(event) => setPathQuery(event.target.value)} placeholder="Search workspace paths" />
              {filteredPaths.map((item) => (
                <button key={`${item.kind}:${item.relativePath}`} type="button" onClick={() => void attachWorkspacePath(item)}>
                  {item.kind === "folder" ? "Folder" : "File"} {item.relativePath}
                </button>
              ))}
            </div>

            <textarea aria-label="Agent Request" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe what you want the agent to plan." />
            {error ? <div className="levi-agent-error" role="alert">{error}</div> : null}
            <button type="button" className="levi-button" onClick={() => void submitPlan()} disabled={!prompt.trim() || !modelId || planning}>
              {planning ? "Planning..." : "Generate Plan"}
            </button>
          </section>

          <SessionActions session={activeSession} onState={setState} />
          <Conversation session={activeSession} />
          <ProjectSummary session={activeSession} />
          <PlanView session={activeSession} onState={setState} />
        </div>
      </div>
    </section>
  );
}

function SessionButton({ session, active, onSelect }: { session: AgentSession; active: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={active ? "levi-agent-session levi-agent-session-active" : "levi-agent-session"} onClick={onSelect}>
      <strong>{session.title}</strong>
      <span>{session.status}</span>
    </button>
  );
}

function SessionActions({ session, onState }: { session?: AgentSession; onState: (state: AgentState) => void }) {
  const [rename, setRename] = useState("");
  if (!session) return null;
  return (
    <section className="levi-agent-card levi-agent-session-actions" aria-label="Session Actions">
      <input aria-label="Rename Agent Session" value={rename} onChange={(event) => setRename(event.target.value)} placeholder={session.title} />
      <button type="button" onClick={() => rename.trim() ? void window.levi.agent.rename({ sessionId: session.id, title: rename.trim() }).then(onState) : undefined}>Rename</button>
      <button type="button" onClick={() => void window.levi.agent.archive({ sessionId: session.id, archived: !session.archived }).then(onState)}>{session.archived ? "Unarchive" : "Archive"}</button>
      <button type="button" onClick={() => { if (window.confirm(`Delete ${session.title}?`)) void window.levi.agent.delete({ sessionId: session.id }).then(onState); }}>Delete</button>
    </section>
  );
}

function Conversation({ session }: { session?: AgentSession }) {
  if (!session?.messages.length) return null;
  return (
    <section className="levi-agent-card" aria-label="Agent Conversation">
      <h2>Conversation</h2>
      {session.messages.map((message) => (
        <article key={message.id} className="levi-agent-message">
          <strong>{message.role}</strong>
          <p>{message.content}</p>
        </article>
      ))}
    </section>
  );
}

function ProjectSummary({ session }: { session?: AgentSession }) {
  const summary = session?.projectSummary;
  if (!summary) return null;
  return (
    <section className="levi-agent-card" aria-label="Project Summary">
      <h2>Current Workspace Context</h2>
      <div className="levi-agent-summary-grid">
        <span>Project</span><strong>{summary.projectName ?? "Unknown"}</strong>
        <span>Languages</span><strong>{summary.languages.join(", ") || "Unknown"}</strong>
        <span>Frameworks</span><strong>{summary.frameworks.join(", ") || "Unknown"}</strong>
        <span>Git</span><strong>{summary.git.branch ?? "No branch"} / {summary.git.changedFiles} changed</strong>
        <span>Context</span><strong>{summary.context.attachmentCount} items / {summary.context.tokenEstimate} tokens</strong>
      </div>
    </section>
  );
}

function PlanView({ session, onState }: { session?: AgentSession; onState: (state: AgentState) => void }) {
  const plan = session?.plan;
  if (!session || !plan) {
    return <section className="levi-agent-card levi-agent-empty">No execution plan yet.</section>;
  }
  return (
    <section className="levi-agent-card" aria-label="Execution Plan">
      <div className="levi-agent-plan-top">
        <div>
          <h2>Execution Plan</h2>
          <p>{plan.summary}</p>
        </div>
        <div className="levi-agent-progress" aria-label="Progress">
          <span>{plan.progress.totalSteps} steps</span>
          <span>{plan.progress.pendingActions} pending</span>
          <span>{plan.progress.approvedActions} approved</span>
          <span>{plan.progress.rejectedActions} rejected</span>
        </div>
      </div>
      <ol className="levi-agent-steps">
        {plan.steps.map((step) => (
          <li key={step.id}>
            <strong>{step.order}. {step.title}</strong>
            <p>{step.description}</p>
            <span>{step.status}</span>
            {step.estimatedFiles.length ? <small>{step.estimatedFiles.join(", ")}</small> : null}
          </li>
        ))}
      </ol>
      <h3>Approval Queue</h3>
      <div className="levi-agent-approvals">
        {plan.approvals.map((action) => (
          <article key={action.id}>
            <div>
              <strong>{action.title}</strong>
              <span>{action.type} / {action.status}</span>
              <p>{action.description}</p>
              {action.relativePath ? <small>{action.relativePath}</small> : null}
            </div>
            <div>
              <button type="button" onClick={() => void window.levi.agent.approve({ sessionId: session.id, actionId: action.id }).then(onState)} disabled={action.status !== "Pending"}>Approve</button>
              <button type="button" onClick={() => void window.levi.agent.reject({ sessionId: session.id, actionId: action.id }).then(onState)} disabled={action.status !== "Pending"}>Reject</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
