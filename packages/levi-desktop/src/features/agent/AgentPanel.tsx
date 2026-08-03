import { useEffect, useMemo, useState } from "react";
import type { AIRuntimeProviderId, AIRuntimeState } from "../ai-runtime";
import type { AIChatAttachment, AIChatContextDiscoveryResult, AIChatContextPreviewRequest } from "../ai-chat";
import type { BrowserActionPreview, BrowserPageSnapshot, BrowserSession } from "../browser";
import type { EditorTab } from "../../hooks/use-editor-tabs";
import type { TaskOutputEntry, TaskProblem, WorkspaceStatus } from "../../types/levi-api";
import type { AgentActionPreview, AgentGitPreview, AgentSession, AgentState, AgentTaskPreview, AgentTerminalPreview } from "./types";

type AgentPanelProps = {
  runtimeState: AIRuntimeState;
  activeTab?: EditorTab | null;
  tabs?: EditorTab[];
  selectedCode?: { relativePath: string; language?: string; content: string; lineStart: number; lineEnd: number } | null;
  workspaceStatus?: WorkspaceStatus;
  taskProblems?: TaskProblem[];
  taskOutput?: TaskOutputEntry[];
  onRevealTerminal?: (terminalSessionId?: string) => void;
};

const emptyAgentState: AgentState = { sessions: [], updatedAt: new Date(0).toISOString() };
const emptyDiscovery: AIChatContextDiscoveryResult = { recentFiles: [], supports: [] };

export function AgentPanel({ runtimeState, activeTab, tabs = [], selectedCode, workspaceStatus, taskProblems = [], taskOutput = [], onRevealTerminal }: AgentPanelProps) {
  const [state, setState] = useState<AgentState>(emptyAgentState);
  const [prompt, setPrompt] = useState("");
  const [runtimeId, setRuntimeId] = useState<AIRuntimeProviderId | "">("");
  const [modelId, setModelId] = useState("");
  const [attachments, setAttachments] = useState<AIChatAttachment[]>([]);
  const [discovery, setDiscovery] = useState<AIChatContextDiscoveryResult>(emptyDiscovery);
  const [pathQuery, setPathQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [preview, setPreview] = useState<AgentActionPreview | null>(null);
  const [taskPreview, setTaskPreview] = useState<AgentTaskPreview | null>(null);
  const [terminalPreview, setTerminalPreview] = useState<AgentTerminalPreview | null>(null);
  const [gitPreview, setGitPreview] = useState<AgentGitPreview | null>(null);
  const [browserPreview, setBrowserPreview] = useState<BrowserActionPreview | null>(null);
  const [executingActionId, setExecutingActionId] = useState<string | null>(null);

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
      if (event.type === "preview") {
        setState(event.state);
        setPreview(event.preview);
      }
      if (event.type === "execution") setState(event.state);
      if (event.type === "task-preview") {
        setState(event.state);
        setTaskPreview(event.preview);
      }
      if (event.type === "task" || event.type === "task-verification") setState(event.state);
      if (event.type === "terminal-preview") {
        setState(event.state);
        setTerminalPreview(event.preview);
      }
      if (event.type === "terminal") setState(event.state);
      if (event.type === "git-preview") {
        setState(event.state);
        setGitPreview(event.preview);
      }
      if (event.type === "git") setState(event.state);
      if (event.type === "browser-preview") {
        setState(event.state);
        setBrowserPreview(event.preview);
      }
      if (event.type === "browser") setState(event.state);
      if (event.type === "verification" || event.type === "repair-plan") setState(event.state);
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
          <VerificationPanel session={activeSession} onState={setState} onError={setError} />
          <BrowserPanel session={activeSession} onError={setError} />
          <ExecutionReview
            session={activeSession}
            preview={preview}
            executingActionId={executingActionId}
            onPreview={setPreview}
            taskPreview={taskPreview}
            onTaskPreview={setTaskPreview}
            terminalPreview={terminalPreview}
            onTerminalPreview={setTerminalPreview}
            gitPreview={gitPreview}
            onGitPreview={setGitPreview}
            browserPreview={browserPreview}
            onBrowserPreview={setBrowserPreview}
            onExecuting={setExecutingActionId}
            onError={setError}
            onState={setState}
            onRevealTerminal={onRevealTerminal}
          />
          <PlanView
            session={activeSession}
            onState={setState}
            onPreview={(nextPreview) => setPreview(nextPreview)}
            onTaskPreview={(nextPreview) => setTaskPreview(nextPreview)}
            onTerminalPreview={(nextPreview) => setTerminalPreview(nextPreview)}
            onGitPreview={(nextPreview) => setGitPreview(nextPreview)}
            onBrowserPreview={(nextPreview) => setBrowserPreview(nextPreview)}
            onError={setError}
          />
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

function VerificationPanel({ session, onState, onError }: { session?: AgentSession; onState: (state: AgentState) => void; onError: (error: string | null) => void }) {
  const [busy, setBusy] = useState<"verify" | "repair" | null>(null);
  const plan = session?.plan;
  if (!session || !plan) return null;
  const sessionId = session.id;
  const report = plan.verificationReports?.[0];
  const repairs = plan.repairQueue ?? [];

  async function verify() {
    onError(null);
    setBusy("verify");
    try {
      const result = await window.levi.agent.verify({ sessionId });
      onState(result.state);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Verification failed.");
    } finally {
      setBusy(null);
    }
  }

  async function planRepairs() {
    if (!report) return;
    onError(null);
    setBusy("repair");
    try {
      const result = await window.levi.agent.repairPlan({ sessionId, reportId: report.id });
      onState(result.state);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Repair planning failed.");
    } finally {
      setBusy(null);
    }
  }

  async function updateRepair(actionId: string, approved: boolean) {
    onError(null);
    try {
      const result = approved
        ? await window.levi.agent.approve({ sessionId, actionId })
        : await window.levi.agent.reject({ sessionId, actionId });
      onState(result);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not update repair approval.");
    }
  }

  return (
    <section className="levi-agent-card" aria-label="Verification Summary">
      <div className="levi-agent-plan-top">
        <div>
          <h2>Verification</h2>
          <p>{report?.summary ?? "No verification report yet."}</p>
        </div>
        <div className="levi-edit-actions">
          <button type="button" className="levi-secondary-button" onClick={() => void verify()} disabled={busy !== null}>{busy === "verify" ? "Verifying..." : "Verify"}</button>
          <button type="button" className="levi-apply-button" onClick={() => void planRepairs()} disabled={!report || report.status !== "Failed" || busy !== null}>{busy === "repair" ? "Planning..." : "Plan Repairs"}</button>
        </div>
      </div>
      {report ? (
        <>
          <div className="levi-agent-progress" aria-label="Verification Checks">
            {report.checks.map((check) => <span key={check.kind}>{check.kind}: {check.status}</span>)}
          </div>
          <div className="levi-agent-summary-grid">
            <span>Status</span><strong>{report.status}</strong>
            <span>Changed files</span><strong>{report.gitChangedFiles.length}</strong>
            <span>Problems</span><strong>{report.problems.length}</strong>
            <span>Failures</span><strong>{report.failures.length}</strong>
          </div>
          {report.failures.length ? (
            <div className="levi-agent-task-problems" aria-label="Failed Verification">
              {report.failures.map((failure) => (
                <p key={failure.id}>{failure.classification}: {failure.message}{failure.affectedFiles.length ? ` (${failure.affectedFiles.join(", ")})` : ""}</p>
              ))}
            </div>
          ) : null}
          {report.warnings.length ? (
            <div className="levi-agent-task-problems" aria-label="Verification Warnings">
              {report.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          ) : null}
        </>
      ) : null}
      {repairs.length ? (
        <div className="levi-agent-approvals" aria-label="Suggested Repairs">
          {repairs.map((repair) => (
            <article key={repair.id}>
              <div>
                <strong>{repair.problem}</strong>
                <span>{repair.classification} / {repair.status} / {Math.round(repair.confidence * 100)}% confidence / {repair.estimatedRisk} risk</span>
                <p>{repair.suggestedFix}</p>
                {repair.affectedFiles.length ? <small>{repair.affectedFiles.join(", ")}</small> : null}
              </div>
              <div>
                <button type="button" onClick={() => void updateRepair(repair.id, true)} disabled={repair.status !== "Pending"}>Approve</button>
                <button type="button" onClick={() => void updateRepair(repair.id, false)} disabled={repair.status !== "Pending"}>Reject</button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function BrowserPanel({ session, onError }: { session?: AgentSession; onError: (error: string | null) => void }) {
  const latestRun = session?.plan?.browserRuns?.slice(-1)[0];
  const [sessions, setSessions] = useState<BrowserSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(latestRun?.session?.id);
  const [snapshot, setSnapshot] = useState<BrowserPageSnapshot | undefined>(latestRun?.result?.snapshot);

  useEffect(() => {
    let disposed = false;
    window.levi.browser.status({}).then((result) => {
      if (!disposed) {
        setSessions(result.sessions);
        setActiveSessionId(result.activeSessionId ?? result.sessions[0]?.id ?? latestRun?.session?.id);
      }
    }).catch(() => undefined);
    return () => { disposed = true; };
  }, [latestRun?.session?.id]);

  useEffect(() => {
    if (latestRun?.session?.id) setActiveSessionId(latestRun.session.id);
    if (latestRun?.result?.snapshot) setSnapshot(latestRun.result.snapshot);
  }, [latestRun?.result?.snapshot, latestRun?.session?.id]);

  const activeBrowser = sessions.find((item) => item.id === activeSessionId) ?? latestRun?.session;
  const elements = snapshot?.elements ?? latestRun?.result?.snapshot?.elements ?? [];
  const screenshotPath = latestRun?.screenshotPath ?? activeBrowser?.lastScreenshot;

  async function refresh() {
    onError(null);
    try {
      const status = await window.levi.browser.status({});
      setSessions(status.sessions);
      const id = status.activeSessionId ?? activeSessionId ?? status.sessions[0]?.id;
      setActiveSessionId(id);
      if (id) {
        const result = await window.levi.browser.snapshot({ sessionId: id });
        setSnapshot(result.snapshot);
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not refresh browser state.");
    }
  }

  async function navigate(history: "back" | "forward" | "reload") {
    if (!activeSessionId) return;
    onError(null);
    try {
      const result = await window.levi.browser.navigate({ sessionId: activeSessionId, history });
      setSnapshot(result.snapshot);
      await refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Browser navigation failed.");
    }
  }

  async function closeBrowser() {
    if (!activeSessionId) return;
    onError(null);
    try {
      await window.levi.browser.close({ sessionId: activeSessionId });
      setSnapshot(undefined);
      await refresh();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not close browser.");
    }
  }

  return (
    <section className="levi-agent-card" aria-label="Browser Automation">
      <div className="levi-agent-plan-top">
        <div>
          <h2>Browser</h2>
          <p>{activeBrowser?.title ?? "No active browser session."}</p>
        </div>
        <div className="levi-edit-actions">
          <button type="button" className="levi-secondary-button" onClick={() => void refresh()}>Refresh</button>
          <button type="button" className="levi-secondary-button" onClick={() => void navigate("back")} disabled={!activeSessionId}>Back</button>
          <button type="button" className="levi-secondary-button" onClick={() => void navigate("forward")} disabled={!activeSessionId}>Forward</button>
          <button type="button" className="levi-secondary-button" onClick={() => void navigate("reload")} disabled={!activeSessionId}>Reload</button>
          <button type="button" className="levi-secondary-button" onClick={() => void closeBrowser()} disabled={!activeSessionId}>Close</button>
        </div>
      </div>
      <div className="levi-agent-summary-grid">
        <span>Status</span><strong>{activeBrowser?.status ?? "Closed"}</strong>
        <span>URL</span><strong>{activeBrowser?.currentUrl ?? snapshot?.url ?? "None"}</strong>
        <span>Session</span><strong>{activeSessionId ?? "None"}</strong>
        <span>Elements</span><strong>{elements.length}</strong>
      </div>
      {latestRun?.preview ? (
        <div className="levi-agent-task-problems" aria-label="Pending browser approval">
          <p>{latestRun.preview.action} / {latestRun.status} / {latestRun.preview.riskLevel} risk</p>
        </div>
      ) : null}
      {screenshotPath ? (
        <img className="levi-agent-browser-screenshot" alt="Browser screenshot preview" src={`file://${screenshotPath}`} />
      ) : null}
      {elements.length ? (
        <div className="levi-agent-approvals" aria-label="Interactive Elements">
          {elements.slice(0, 12).map((element) => (
            <article key={element.ref}>
              <div>
                <strong>{element.ref} {element.name || element.text || element.role}</strong>
                <span>{element.role} / {element.elementType} / {element.enabled ? "enabled" : "disabled"}</span>
                {element.inputType ? <small>{element.inputType}</small> : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PlanView({
  session,
  onState,
  onPreview,
  onTaskPreview,
  onTerminalPreview,
  onGitPreview,
  onBrowserPreview,
  onError
}: {
  session?: AgentSession;
  onState: (state: AgentState) => void;
  onPreview: (preview: AgentActionPreview) => void;
  onTaskPreview: (preview: AgentTaskPreview) => void;
  onTerminalPreview: (preview: AgentTerminalPreview) => void;
  onGitPreview: (preview: AgentGitPreview) => void;
  onBrowserPreview: (preview: BrowserActionPreview) => void;
  onError: (error: string | null) => void;
}) {
  const plan = session?.plan;
  if (!session || !plan) {
    return <section className="levi-agent-card levi-agent-empty">No execution plan yet.</section>;
  }

  async function approveAction(actionId: string) {
    if (!session) return;
    onError(null);
    try {
      onState(await window.levi.agent.approve({ sessionId: session.id, actionId }));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not approve agent action.");
    }
  }

  async function rejectAction(actionId: string) {
    if (!session) return;
    onError(null);
    try {
      onState(await window.levi.agent.reject({ sessionId: session.id, actionId }));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not reject agent action.");
    }
  }

  async function previewAction(actionId: string) {
    if (!session) return;
    onError(null);
    try {
      const action = session.plan?.approvals.find((item) => item.id === actionId);
      if (action?.type === "run-task") {
        const result = await window.levi.agent.taskPreview({ sessionId: session.id, actionId });
        onState(result.state);
        onTaskPreview(result.preview);
        return;
      }
      if (action?.type === "run-terminal-command") {
        const result = await window.levi.agent.terminalPreview({ sessionId: session.id, actionId });
        onState(result.state);
        onTerminalPreview(result.preview);
        return;
      }
      if (action?.type === "git-operation") {
        const result = await window.levi.agent.gitPreview({ sessionId: session.id, actionId });
        onState(result.state);
        onGitPreview(result.preview);
        return;
      }
      if (action?.type.startsWith("browser-")) {
        const result = await window.levi.agent.browserPreview({ sessionId: session.id, actionId });
        onState(result.state);
        onBrowserPreview(result.preview);
        return;
      }
      const result = await window.levi.agent.preview({ sessionId: session.id, actionId });
      onState(result.state);
      onPreview(result.preview);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not preview agent action.");
    }
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
              <button type="button" onClick={() => void approveAction(action.id)} disabled={action.status !== "Pending"}>Approve</button>
              <button type="button" onClick={() => void rejectAction(action.id)} disabled={action.status !== "Pending"}>Reject</button>
              <button type="button" onClick={() => void previewAction(action.id)} disabled={action.status !== "Approved"}>Preview</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ExecutionReview({
  session,
  preview,
  taskPreview,
  terminalPreview,
  gitPreview,
  browserPreview,
  executingActionId,
  onPreview,
  onTaskPreview,
  onTerminalPreview,
  onGitPreview,
  onBrowserPreview,
  onExecuting,
  onError,
  onState,
  onRevealTerminal
}: {
  session?: AgentSession;
  preview: AgentActionPreview | null;
  taskPreview: AgentTaskPreview | null;
  terminalPreview: AgentTerminalPreview | null;
  gitPreview: AgentGitPreview | null;
  browserPreview: BrowserActionPreview | null;
  executingActionId: string | null;
  onPreview: (preview: AgentActionPreview | null) => void;
  onTaskPreview: (preview: AgentTaskPreview | null) => void;
  onTerminalPreview: (preview: AgentTerminalPreview | null) => void;
  onGitPreview: (preview: AgentGitPreview | null) => void;
  onBrowserPreview: (preview: BrowserActionPreview | null) => void;
  onExecuting: (actionId: string | null) => void;
  onError: (error: string | null) => void;
  onState: (state: AgentState) => void;
  onRevealTerminal?: (terminalSessionId?: string) => void;
}) {
  const plan = session?.plan;
  if (!session || !plan) return null;
  const sessionId = session.id;
  const queue = plan.executionQueue ?? [];
  const taskRuns = plan.taskRuns ?? [];
  const terminalRuns = plan.terminalRuns ?? [];
  const gitRuns = plan.gitRuns ?? [];
  const browserRuns = plan.browserRuns ?? [];
  const activeTaskRun = taskPreview ? taskRuns.find((run) => run.actionId === taskPreview.actionId) : undefined;
  const activeTerminalRun = terminalPreview ? terminalRuns.find((run) => run.actionId === terminalPreview.actionId) : undefined;
  const activeGitRun = gitPreview ? gitRuns.find((run) => run.actionId === gitPreview.actionId) : undefined;
  const activeBrowserRun = browserPreview ? browserRuns.find((run) => run.preview?.previewId === browserPreview.previewId) : undefined;
  const browserActionId = activeBrowserRun?.actionId;

  async function executePreview() {
    if (!preview) return;
    onExecuting(preview.actionId);
    onError(null);
    try {
      const result = await window.levi.agent.execute({ sessionId, actionId: preview.actionId, previewId: preview.previewId });
      onState(result.state);
      onPreview(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Agent action execution failed.");
    } finally {
      onExecuting(null);
    }
  }

  async function rejectPreview() {
    if (!preview) return;
    onError(null);
    try {
      const result = await window.levi.agent.cancel({ sessionId, actionId: preview.actionId });
      onState(result.state);
      onPreview(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not reject agent action.");
    }
  }

  async function undoLast() {
    onError(null);
    try {
      const result = await window.levi.agent.undo({ sessionId });
      onState(result.state);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not undo last agent action.");
    }
  }

  async function executeTaskPreview() {
    if (!taskPreview) return;
    onExecuting(taskPreview.actionId);
    onError(null);
    try {
      const result = await window.levi.agent.taskExecute({ sessionId, actionId: taskPreview.actionId, previewId: taskPreview.previewId });
      onState(result.state);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Agent task execution failed.");
    } finally {
      onExecuting(null);
    }
  }

  async function cancelTask(actionId: string) {
    onError(null);
    try {
      const result = await window.levi.agent.taskCancel({ sessionId, actionId });
      onState(result.state);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not cancel agent task.");
    }
  }

  async function verifyTask(actionId: string) {
    onError(null);
    try {
      const result = await window.levi.agent.taskVerify({ sessionId, actionId });
      onState(result.state);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not verify agent task.");
    }
  }

  async function executeTerminalPreview() {
    if (!terminalPreview) return;
    onExecuting(terminalPreview.actionId);
    onError(null);
    try {
      const result = await window.levi.agent.terminalExecute({ sessionId, actionId: terminalPreview.actionId, previewId: terminalPreview.previewId });
      onState(result.state);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Agent terminal command failed.");
    } finally {
      onExecuting(null);
    }
  }

  async function cancelTerminal(actionId: string) {
    onError(null);
    try {
      const result = await window.levi.agent.terminalCancel({ sessionId, actionId });
      onState(result.state);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not cancel terminal command.");
    }
  }

  async function rejectTerminalPreview() {
    if (!terminalPreview) return;
    onError(null);
    try {
      const result = await window.levi.agent.cancel({ sessionId, actionId: terminalPreview.actionId });
      onState(result.state);
      onTerminalPreview(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not reject terminal command.");
    }
  }

  async function executeGitPreview() {
    if (!gitPreview) return;
    onExecuting(gitPreview.actionId);
    onError(null);
    try {
      const result = await window.levi.agent.gitExecute({ sessionId, actionId: gitPreview.actionId, previewId: gitPreview.previewId });
      onState(result.state);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Agent Git operation failed.");
    } finally {
      onExecuting(null);
    }
  }

  async function rejectGitPreview() {
    if (!gitPreview) return;
    onError(null);
    try {
      const result = await window.levi.agent.cancel({ sessionId, actionId: gitPreview.actionId });
      onState(result.state);
      onGitPreview(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not reject Git action.");
    }
  }

  async function executeBrowserPreview() {
    if (!browserPreview || !browserActionId) return;
    onExecuting(browserActionId);
    onError(null);
    try {
      const result = await window.levi.agent.browserExecute({ sessionId, actionId: browserActionId });
      onState(result.state);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Agent browser action failed.");
    } finally {
      onExecuting(null);
    }
  }

  async function rejectBrowserPreview() {
    if (!browserPreview || !browserActionId) return;
    onError(null);
    try {
      const result = await window.levi.agent.cancel({ sessionId, actionId: browserActionId });
      onState(result.state);
      onBrowserPreview(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not reject browser action.");
    }
  }

  return (
    <section className="levi-agent-card" aria-label="Execution Queue">
      <div className="levi-agent-plan-top">
        <div>
          <h2>Execution Queue</h2>
          <p>{queue.filter((item) => item.status === "Completed").length} completed / {queue.filter((item) => item.status === "Pending").length} remaining</p>
        </div>
        <button type="button" onClick={() => void undoLast()} disabled={!plan.lastUndo}>Undo Last Action</button>
      </div>
      <div className="levi-agent-execution-queue">
        {queue.length ? queue.map((item) => (
          <article key={item.actionId}>
            <div>
              <strong>{item.title}</strong>
              <span>{item.type} / {item.status}</span>
              {item.relativePath ? <small>{item.relativePath}{item.destinationRelativePath ? ` -> ${item.destinationRelativePath}` : ""}</small> : null}
              {item.error ? <p>{item.error}</p> : null}
            </div>
          </article>
        )) : <p>No approved file actions queued yet.</p>}
      </div>

      {taskPreview ? (
        <div className="levi-agent-task-preview" role="group" aria-label="Task Approval Card">
          <div className="levi-agent-preview-header">
            <div>
              <h3>{taskPreview.taskName}</h3>
              <p>{taskPreview.source} / {taskPreview.riskLevel} risk / {taskPreview.longRunning ? "long-running" : "finite"}</p>
            </div>
            <span>{activeTaskRun?.status ?? "Approved"}</span>
          </div>
          <div className="levi-agent-summary-grid">
            <span>Executable</span><strong>{taskPreview.executable}</strong>
            <span>Arguments</span><strong>{taskPreview.args.join(" ") || "None"}</strong>
            <span>Working directory</span><strong>{taskPreview.cwd ?? "."}</strong>
            <span>Purpose</span><strong>{taskPreview.expectedPurpose}</strong>
            <span>Terminal</span><strong>{activeTaskRun?.terminalSessionId ?? "Not started"}</strong>
            <span>Exit</span><strong>{activeTaskRun?.exitCode ?? "Pending"}</strong>
          </div>
          {activeTaskRun?.outputPreview.length ? (
            <pre className="levi-agent-task-output" aria-label="Streaming output preview">{activeTaskRun.outputPreview.map((entry) => entry.text).join("")}</pre>
          ) : null}
          {activeTaskRun?.problems.length ? (
            <div className="levi-agent-task-problems" aria-label="Problems summary">
              {activeTaskRun.problems.map((problem) => (
                <p key={problem.id}>{problem.relativePath}:{problem.line}:{problem.column} {problem.severity} {problem.message}</p>
              ))}
            </div>
          ) : null}
          {activeTaskRun?.verification ? (
            <div className="levi-agent-task-verification" aria-label="Verification result">
              <strong>Verification</strong>
              <p>{activeTaskRun.verification.summary}</p>
            </div>
          ) : null}
          <div className="levi-edit-actions">
            <button type="button" className="levi-secondary-button" onClick={() => onTaskPreview(null)}>Return to Plan</button>
            {activeTaskRun?.terminalSessionId ? <button type="button" className="levi-secondary-button" onClick={() => onRevealTerminal?.(activeTaskRun.terminalSessionId)}>Reveal Terminal</button> : null}
            {activeTaskRun?.status === "Running" ? <button type="button" className="levi-secondary-button" onClick={() => void cancelTask(taskPreview.actionId)}>Cancel Task</button> : null}
            {activeTaskRun && activeTaskRun.status !== "Running" ? <button type="button" className="levi-secondary-button" onClick={() => void executeTaskPreview()}>Run Again</button> : null}
            {activeTaskRun && activeTaskRun.status !== "Running" ? <button type="button" className="levi-secondary-button" onClick={() => void verifyTask(taskPreview.actionId)}>Verify</button> : null}
            <button type="button" className="levi-apply-button" disabled={executingActionId === taskPreview.actionId || activeTaskRun?.status === "Running"} onClick={() => void executeTaskPreview()}>
              {executingActionId === taskPreview.actionId ? "Starting..." : "Approve Task"}
            </button>
          </div>
        </div>
      ) : null}

      {terminalPreview ? (
        <div className="levi-agent-terminal-preview" role="group" aria-label="Terminal Approval Card">
          <div className="levi-agent-preview-header">
            <div>
              <h3>{terminalPreview.executable}</h3>
              <p>{terminalPreview.riskLevel} risk / {terminalPreview.estimatedDurationMs ? `${terminalPreview.estimatedDurationMs} ms` : "duration unknown"}</p>
            </div>
            <span>{activeTerminalRun?.status ?? "Approved"}</span>
          </div>
          <div className="levi-agent-summary-grid">
            <span>Executable</span><strong>{terminalPreview.executable}</strong>
            <span>Arguments</span><strong>{terminalPreview.args.join(" ") || "None"}</strong>
            <span>Working directory</span><strong>{terminalPreview.cwd}</strong>
            <span>Purpose</span><strong>{terminalPreview.purpose}</strong>
            <span>Expected output</span><strong>{terminalPreview.expectedOutput ?? "Not specified"}</strong>
            <span>Terminal</span><strong>{activeTerminalRun?.terminalSessionId ?? "Not started"}</strong>
            <span>Exit</span><strong>{activeTerminalRun?.exitCode ?? "Pending"}</strong>
          </div>
          {activeTerminalRun?.outputPreview ? (
            <pre className="levi-agent-task-output" aria-label="Live terminal output">{activeTerminalRun.outputPreview}</pre>
          ) : null}
          {activeTerminalRun?.verification ? (
            <div className="levi-agent-task-verification" aria-label="Terminal verification summary">
              <strong>Verification</strong>
              <p>{activeTerminalRun.verification.summary}</p>
            </div>
          ) : null}
          {activeTerminalRun?.failureReason ? <div className="levi-agent-error" role="alert">{activeTerminalRun.failureReason}</div> : null}
          <div className="levi-edit-actions">
            <button type="button" className="levi-secondary-button" onClick={() => onTerminalPreview(null)}>Back</button>
            {activeTerminalRun?.terminalSessionId ? <button type="button" className="levi-secondary-button" onClick={() => onRevealTerminal?.(activeTerminalRun.terminalSessionId)}>Reveal Terminal</button> : null}
            {activeTerminalRun?.status === "Running" ? <button type="button" className="levi-secondary-button" onClick={() => void cancelTerminal(terminalPreview.actionId)}>Cancel Command</button> : null}
            {activeTerminalRun && activeTerminalRun.status !== "Running" ? <button type="button" className="levi-secondary-button" onClick={() => void executeTerminalPreview()}>Run Again</button> : null}
            <button type="button" className="levi-secondary-button" onClick={() => void rejectTerminalPreview()}>Reject</button>
            <button type="button" className="levi-apply-button" disabled={executingActionId === terminalPreview.actionId || activeTerminalRun?.status === "Running"} onClick={() => void executeTerminalPreview()}>
              {executingActionId === terminalPreview.actionId ? "Starting..." : "Approve Command"}
            </button>
          </div>
        </div>
      ) : null}

      {gitPreview ? (
        <div className="levi-agent-git-preview" role="group" aria-label="Git Approval Card">
          <div className="levi-agent-preview-header">
            <div>
              <h3>{gitOperationLabel(gitPreview.operation)}</h3>
              <p>{gitPreview.repositoryRoot}</p>
            </div>
            <span>{activeGitRun?.status ?? "Approved"} / {gitPreview.riskLevel} risk</span>
          </div>
          <div className="levi-agent-summary-grid">
            <span>Repository</span><strong>{gitPreview.repositoryRoot}</strong>
            <span>Files</span><strong>{gitPreview.fileCount}</strong>
            <span>Branch</span><strong>{gitPreview.branchName ?? gitPreview.status.currentBranch ?? (gitPreview.status.detachedHead ? "Detached HEAD" : "Unknown")}</strong>
            <span>Commit message</span><strong>{gitPreview.commitMessage ?? "Not applicable"}</strong>
            <span>Additions</span><strong>+{gitPreview.addedLineCount}</strong>
            <span>Deletions</span><strong>-{gitPreview.removedLineCount}</strong>
          </div>
          {gitPreview.warnings.length ? (
            <div className="levi-agent-task-problems" aria-label="Git warnings">
              {gitPreview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            </div>
          ) : null}
          {gitPreview.affectedFiles.length ? (
            <div className="levi-agent-git-files" aria-label="Git affected files">
              {gitPreview.affectedFiles.map((file) => <code key={file}>{file}</code>)}
            </div>
          ) : null}
          {gitPreview.unifiedDiff ? (
            <div className="levi-agent-monaco-diff" role="group" aria-label="Git Diff Review">
              <div>
                <strong>Unified diff</strong>
                <pre>{gitPreview.unifiedDiff}</pre>
              </div>
              <div>
                <strong>Side-by-side diff</strong>
                <pre>{gitPreview.unifiedDiff}</pre>
              </div>
            </div>
          ) : null}
          {activeGitRun?.verification ? (
            <div className="levi-agent-task-verification" aria-label="Git verification summary">
              <strong>Verification</strong>
              <p>{activeGitRun.verification.summary}</p>
              {activeGitRun.verification.commitHash ? <small>{activeGitRun.verification.commitHash}</small> : null}
            </div>
          ) : null}
          {activeGitRun?.failureReason ? <div className="levi-agent-error" role="alert">{activeGitRun.failureReason}</div> : null}
          <div className="levi-edit-actions">
            <button type="button" className="levi-secondary-button" onClick={() => onGitPreview(null)}>Back</button>
            <button type="button" className="levi-secondary-button" onClick={() => void rejectGitPreview()}>Reject</button>
            <button type="button" className="levi-apply-button" disabled={executingActionId === gitPreview.actionId || activeGitRun?.status === "Executing"} onClick={() => void executeGitPreview()}>
              {executingActionId === gitPreview.actionId ? "Executing..." : "Approve Git Operation"}
            </button>
          </div>
        </div>
      ) : null}

      {browserPreview ? (
        <div className="levi-agent-browser-preview" role="group" aria-label="Browser Approval Card">
          <div className="levi-agent-preview-header">
            <div>
              <h3>{browserActionLabel(browserPreview.action)}</h3>
              <p>{browserPreview.riskLevel} risk / {browserPreview.purpose ?? "No purpose provided"}</p>
            </div>
            <span>{activeBrowserRun?.status ?? "Approved"}</span>
          </div>
          <div className="levi-agent-summary-grid">
            <span>Action</span><strong>{browserPreview.action}</strong>
            <span>Target URL</span><strong>{browserPreview.targetUrl ?? "Current page"}</strong>
            <span>Element</span><strong>{browserPreview.elementRef ?? "None"}</strong>
            <span>Element name</span><strong>{browserPreview.elementDescription ?? "Not captured"}</strong>
            <span>Value</span><strong>{browserPreview.valuePreview ?? "None"}</strong>
            <span>Session</span><strong>{activeBrowserRun?.session?.id ?? browserPreview.sessionId ?? "New session"}</strong>
          </div>
          {activeBrowserRun?.result?.snapshot?.elements.length ? (
            <div className="levi-agent-approvals" aria-label="Browser page state">
              {activeBrowserRun.result.snapshot.elements.slice(0, 10).map((element) => (
                <article key={element.ref}>
                  <div>
                    <strong>{element.ref} {element.name || element.text || element.role}</strong>
                    <span>{element.role} / {element.elementType} / {element.enabled ? "enabled" : "disabled"}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          {activeBrowserRun?.screenshotPath ? (
            <img className="levi-agent-browser-screenshot" alt="Browser screenshot preview" src={`file://${activeBrowserRun.screenshotPath}`} />
          ) : null}
          {activeBrowserRun?.failureReason ? <div className="levi-agent-error" role="alert">{activeBrowserRun.failureReason}</div> : null}
          <div className="levi-edit-actions">
            <button type="button" className="levi-secondary-button" onClick={() => onBrowserPreview(null)}>Back</button>
            <button type="button" className="levi-secondary-button" onClick={() => void rejectBrowserPreview()}>Reject</button>
            <button type="button" className="levi-apply-button" disabled={!browserActionId || executingActionId === browserActionId || activeBrowserRun?.status === "Executing"} onClick={() => void executeBrowserPreview()}>
              {executingActionId === browserActionId ? "Executing..." : "Approve Browser Action"}
            </button>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="levi-agent-preview" role="group" aria-label="Approval Dialog">
          <div className="levi-agent-preview-header">
            <div>
              <h3>{preview.summary}</h3>
              <p>{preview.actionType} / {preview.riskLevel} risk / {preview.targetPath}{preview.destinationPath ? ` -> ${preview.destinationPath}` : ""}</p>
            </div>
            <div className="levi-edit-counts" aria-label="Diff line counts">
              <span>+{preview.addedLineCount}</span>
              <span>-{preview.removedLineCount}</span>
            </div>
          </div>
          <div className="levi-agent-monaco-diff" role="group" aria-label="Monaco Diff Review">
            <div>
              <strong>Current file</strong>
              <pre>{preview.originalContent ?? ""}</pre>
            </div>
            <div>
              <strong>Proposed file</strong>
              <pre>{preview.proposedContent ?? ""}</pre>
            </div>
          </div>
          {preview.diff.length ? (
            <div className="levi-diff" role="table" aria-label="Agent diff preview">
              {preview.diff.map((line, index) => (
                <div key={`${index}-${line.type}`} className={`levi-diff-line levi-diff-${line.type}`} role="row">
                  <span className="levi-diff-num" role="cell">{line.oldLineNumber ?? ""}</span>
                  <span className="levi-diff-num" role="cell">{line.newLineNumber ?? ""}</span>
                  <span className="levi-diff-marker" role="cell">{line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}</span>
                  <code role="cell">{line.content || " "}</code>
                </div>
              ))}
            </div>
          ) : null}
          <div className="levi-edit-actions">
            <button type="button" className="levi-secondary-button" onClick={() => onPreview(null)}>Back</button>
            <button type="button" className="levi-secondary-button" onClick={() => void rejectPreview()}>Reject</button>
            <button type="button" className="levi-apply-button" disabled={executingActionId === preview.actionId} onClick={() => void executePreview()}>
              {executingActionId === preview.actionId ? "Executing..." : "Approve"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function gitOperationLabel(operation: AgentGitPreview["operation"]): string {
  if (operation === "status") return "Git Status";
  if (operation === "stage-file") return "Stage File";
  if (operation === "unstage-file") return "Unstage File";
  if (operation === "stage-all") return "Stage All";
  if (operation === "commit") return "Commit";
  if (operation === "create-branch") return "Create Branch";
  if (operation === "switch-branch") return "Switch Branch";
  if (operation === "restore-file") return "Restore File";
  return "Show Diff";
}

function browserActionLabel(action: BrowserActionPreview["action"]): string {
  if (action === "open") return "Open Browser";
  if (action === "navigate") return "Navigate Browser";
  if (action === "back") return "Browser Back";
  if (action === "forward") return "Browser Forward";
  if (action === "reload") return "Reload Browser";
  if (action === "click") return "Click Element";
  if (action === "fill") return "Fill Field";
  if (action === "press") return "Press Key";
  if (action === "scroll") return "Scroll Page";
  if (action === "screenshot") return "Take Screenshot";
  if (action === "snapshot") return "Read Page State";
  return "Close Browser";
}
