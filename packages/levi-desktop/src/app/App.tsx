import { lazy, useEffect, useRef, useState } from "react";
import { ActivityBar, type ActivityView } from "../components/ActivityBar";
import { Icon } from "../components/Icon";
import { LazySurface } from "../components/LazySurface";
import { Sidebar } from "../components/Sidebar";
import { ExplorerPanel } from "../features/explorer/ExplorerPanel";
import { DebugToolbar } from "../features/debugger/DebugToolbar";
import { Home } from "../features/home/Home";
import { SearchPanel } from "../features/search/SearchPanel";
import { BottomPanel } from "../features/terminal/BottomPanel";
import { TasksPanel } from "../features/tasks/TasksPanel";
import { useTasks } from "../features/tasks/useTasks";
import { RuntimeManagerPanel } from "../features/ai-runtime/RuntimeManagerPanel";
import { AIChatPanel } from "../features/ai-chat/AIChatPanel";
import { AgentPanel } from "../features/agent/AgentPanel";
import { type EditorTab, useEditorTabs } from "../hooks/use-editor-tabs";
import type {
  AIRuntimeProviderId,
  AIRuntimeState,
  EditApplyResult,
  EditUndoResult,
  ExecutionPublicTransaction,
  OllamaStatus,
  SelectedProject,
  UpdateStatus,
  WorkspaceStatus
} from "../types/levi-api";
import type { TaskOutputEntry, TaskProblem } from "../types/task-api";
import type { DebugLaunchConfiguration, DebugSetBreakpointRequest, DebugStackFrame, DebugState, DebugExceptionBreakpoint, DebugAdapterInstallRequest } from "../features/debugger";
import { DEFAULT_EXCEPTION_BREAKPOINTS } from "../features/debugger";
import type { WorkspaceReadPathResult } from "../types/workspace-tree-api";
import "../styles/editor-tabs.css";

const CodeEditor = lazy(async () => {
  const module = await import("../components/CodeEditor");
  return { default: module.CodeEditor };
});

const ProjectRulesPanel = lazy(async () => {
  const module = await import("../features/rules/ProjectRulesPanel");
  return { default: module.ProjectRulesPanel };
});

const HistoryPanel = lazy(async () => {
  const module = await import("../features/history/HistoryPanel");
  return { default: module.HistoryPanel };
});

const settingsPanelModule = import("../features/settings/SettingsPanel");
const SettingsPanel = lazy(async () => {
  const module = await settingsPanelModule;
  return { default: module.SettingsPanel };
});

const RunDebugPanel = lazy(async () => {
  const module = await import("../features/debugger/RunDebugPanel");
  return { default: module.RunDebugPanel };
});

const unknownStatus: OllamaStatus = { ready: false, modelCount: 0, models: [] };
const idleRuntimeState: AIRuntimeState = {
  providers: [],
  selectionMode: "automatic",
  diagnostics: [],
  requests: [],
  downloads: []
};
const idleWorkspaceStatus: WorkspaceStatus = { state: "idle" };
const idleDebugState: DebugState = {
  state: "Idle",
  launchConfigurations: [],
  breakpoints: [],
  watches: [],
  variables: [],
  callStack: [],
  loadedSources: [],
  console: [],
  exceptionBreakpoints: DEFAULT_EXCEPTION_BREAKPOINTS.map((item) => ({ ...item })),
  inlineValues: [],
  evaluationCache: [],
  sessions: [],
  compoundConfigurations: [],
  adapters: [],
  adapterRecommendations: []
};
const FILE_CONFLICT_CODE = "WORKSPACE_FILE_CONFLICT";

export type EditorSelectionContext = {
  relativePath: string;
  language?: string;
  content: string;
  lineStart: number;
  lineEnd: number;
};

const placeholderCopy: Partial<Record<ActivityView, { title: string; description: string }>> = {
  "source-control": { title: "Source Control", description: "Git status, staging, commits, and branch controls are scheduled for the IDE Core phase." },
  terminal: { title: "Terminal", description: "Use the terminal panel at the bottom of the workspace." }
};

function WorkspacePlaceholder({ view }: { view: ActivityView }) {
  const copy = placeholderCopy[view];
  if (!copy) return null;
  return (
    <section className="levi-workspace-placeholder" aria-labelledby={`levi-${view}-title`}>
      <div className="levi-workspace-placeholder-card">
        <h1 id={`levi-${view}-title`}>{copy.title}</h1>
        <p>{copy.description}</p>
      </div>
    </section>
  );
}

const idleUpdateStatus: UpdateStatus = {
  state: "idle",
  currentVersion: "0.0.0"
};

export function App() {
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>(unknownStatus);
  const [selectedProject, setSelectedProject] = useState<SelectedProject | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>(idleWorkspaceStatus);
  const [runtimeState, setRuntimeState] = useState<AIRuntimeState>(idleRuntimeState);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(idleUpdateStatus);
  const [debugState, setDebugState] = useState<DebugState>(idleDebugState);
  const [canUndoEdit, setCanUndoEdit] = useState(false);
  const [newChatSignal, setNewChatSignal] = useState(0);
  const [activeView, setActiveView] = useState<ActivityView>("home");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [executionHistory, setExecutionHistory] = useState<ExecutionPublicTransaction[]>([]);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const [savingTabId, setSavingTabId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSummary, setSaveSummary] = useState<string | null>(null);
  const [conflictTabId, setConflictTabId] = useState<string | null>(null);
  const [editorSelection, setEditorSelection] = useState<EditorSelectionContext | null>(null);
  const lastOpenedDebugFrameRef = useRef<string | null>(null);
  const tabButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const tasks = useTasks(Boolean(selectedProject));
  const {
    tabs,
    activeTabId,
    activeTab,
    openFile,
    closeTab,
    activateTab,
    activateRelativeTab,
    updateContent,
    markSaved,
    pinTab,
    clearRecovery
  } = useEditorTabs(selectedProject?.path);

  const activeTabEditable = Boolean(activeTab?.sourceId.startsWith("WORKSPACE:"));
  const dirtyWorkspaceTabs = tabs.filter((tab) => tab.dirty && tab.sourceId.startsWith("WORKSPACE:"));
  const hasDirtyTabs = tabs.some((tab) => tab.dirty);
  const activeTabHasConflict = Boolean(activeTab && conflictTabId === activeTab.id);

  function recordExecutionTransaction(transaction: ExecutionPublicTransaction) {
    setExecutionHistory((current) => {
      const next = current.filter((item) => item.transactionId !== transaction.transactionId);
      return [transaction, ...next].slice(0, 24);
    });
  }

  useEffect(() => {
    let disposed = false;
    async function loadShellState() {
      const [status, recentProject, workspace, runtime, editStatus, executionStatus, debug, updates] = await Promise.all([
        window.levi.ollama.getStatus(),
        window.levi.projects.getRecent(),
        window.levi.workspace.getStatus(),
        window.levi.runtime.list(),
        window.levi.edits.getStatus(),
        window.levi.execution.getStatus(),
        window.levi.debug.getState(),
        window.levi.updates.getStatus()
      ]);
      if (!disposed) {
        setOllamaStatus(status);
        setSelectedProject(recentProject);
        setWorkspaceStatus(workspace);
        setRuntimeState(runtime);
        setUpdateStatus(updates);
        setDebugState(debug);
        setCanUndoEdit(editStatus.canUndo);
        if (executionStatus.activeTransaction) {
          recordExecutionTransaction(executionStatus.activeTransaction);
        }
        if (recentProject && workspace.state === "idle") {
          setWorkspaceStatus({ state: "scanning" });
          window.levi.workspace.refresh().then((nextStatus) => {
            if (!disposed) setWorkspaceStatus(nextStatus);
          });
        }
      }
    }
    void loadShellState();
    const unsubscribeUpdates = window.levi.updates.onEvent((event) => {
      if (!disposed) {
        setUpdateStatus(event.status);
      }
    });
    const unsubscribeDebug = window.levi.debug.onEvent((event) => {
      if (!disposed) {
        setDebugState(event.state);
      }
    });

    return () => {
      disposed = true;
      unsubscribeUpdates();
      unsubscribeDebug();
    };
  }, []);

  useEffect(() => {
    const frame = debugState.activeStackFrame;
    if (!frame?.relativePath || typeof frame.line !== "number") return;
    const key = `${frame.id}:${frame.relativePath}:${frame.line}`;
    if (lastOpenedDebugFrameRef.current === key) return;
    lastOpenedDebugFrameRef.current = key;
    let disposed = false;
    window.levi.workspace
      .readPath({ relativePath: frame.relativePath })
      .then((file) => {
        if (!disposed) {
          openFile({
            sourceId: `WORKSPACE:${file.relativePath}`,
            relativePath: file.relativePath,
            content: file.content,
            language: file.language,
            lineStart: frame.line ?? 1,
            readOnly: false
          });
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [debugState.activeStackFrame, openFile]);

  useEffect(() => {
    if (!activeTabId) return;
    const activeTabButton = tabButtonRefs.current.get(activeTabId);
    if (typeof activeTabButton?.scrollIntoView === "function") {
      activeTabButton.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    setSaveError(null);
    setSaveSummary(null);
    setConflictTabId((current) => current === activeTabId ? current : null);
  }, [activeTabId]);

  useEffect(() => {
    function protectUnsavedChanges(event: BeforeUnloadEvent) {
      if (!hasDirtyTabs) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", protectUnsavedChanges);
    return () => window.removeEventListener("beforeunload", protectUnsavedChanges);
  }, [hasDirtyTabs]);

  function confirmDiscard(message: string): boolean { return window.confirm(message); }

  function selectActivityView(view: ActivityView) {
    setActiveView(view);
    if (view === "search") setSearchFocusSignal((value) => value + 1);
  }

  function requestCloseTab(tabId: string) {
    const tab = tabs.find((candidate) => candidate.id === tabId);
    if (!tab) return;
    if (tab.dirty && !confirmDiscard(`Close ${tab.relativePath} and discard its unsaved changes?`)) return;
    closeTab(tabId);
    if (conflictTabId === tabId) setConflictTabId(null);
  }

  async function writeTab(tab: EditorTab, force = false): Promise<"saved" | "conflict" | "failed"> {
    try {
      await window.levi.workspace.writePath({ relativePath: tab.relativePath, content: tab.content, expectedContent: tab.savedContent, force });
      markSaved(tab.id, tab.content);
      if (conflictTabId === tab.id) setConflictTabId(null);
      return "saved";
    } catch (error) {
      const message = error instanceof Error ? error.message : "The file could not be saved.";
      if (message.includes(FILE_CONFLICT_CODE)) {
        if (activeTabId === tab.id) setConflictTabId(tab.id);
        return "conflict";
      }
      if (activeTabId === tab.id) setSaveError(message);
      return "failed";
    }
  }

  async function saveActiveTab(force = false) {
    if (!activeTab || !activeTabEditable || !activeTab.dirty || savingTabId || savingAll) return;
    setSavingTabId(activeTab.id);
    setSaveError(null);
    setSaveSummary(null);
    if (!force) setConflictTabId(null);
    const result = await writeTab(activeTab, force);
    if (result === "conflict") {
      setConflictTabId(activeTab.id);
      setSaveError("This file changed on disk. Reload it or overwrite the external version.");
    } else if (result === "failed" && !saveError) setSaveError("The file could not be saved.");
    setSavingTabId(null);
  }

  async function saveAllTabs() {
    if (savingAll || savingTabId || dirtyWorkspaceTabs.length === 0) return;
    setSavingAll(true);
    setSaveError(null);
    setSaveSummary(null);
    let saved = 0;
    let conflicts = 0;
    let failed = 0;
    for (const tab of dirtyWorkspaceTabs) {
      setSavingTabId(tab.id);
      const result = await writeTab(tab);
      if (result === "saved") saved += 1;
      else if (result === "conflict") conflicts += 1;
      else failed += 1;
    }
    setSavingTabId(null);
    setSavingAll(false);
    const problems = conflicts + failed;
    setSaveSummary(problems === 0 ? `Saved ${saved} file${saved === 1 ? "" : "s"}.` : `Saved ${saved}; ${conflicts} conflict${conflicts === 1 ? "" : "s"}; ${failed} failed.`);
  }

  async function reloadActiveTabFromDisk() {
    if (!activeTab || !activeTabEditable || savingTabId || savingAll) return;
    if (activeTab.dirty && !confirmDiscard(`Reload ${activeTab.relativePath} and discard your unsaved changes?`)) return;
    setSavingTabId(activeTab.id);
    setSaveError(null);
    try {
      const file = await window.levi.workspace.readPath({ relativePath: activeTab.relativePath });
      markSaved(activeTab.id, file.content);
      setConflictTabId(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The file could not be reloaded.");
    } finally { setSavingTabId(null); }
  }

  useEffect(() => {
    function handleEditorShortcut(event: KeyboardEvent) {
      const commandKey = event.ctrlKey || event.metaKey;
      if (!commandKey) return;
      if (event.key.toLowerCase() === "f" && event.shiftKey) {
        event.preventDefault();
        selectActivityView("search");
      } else if (event.key === "Tab" && tabs.length > 1) {
        event.preventDefault();
        activateRelativeTab(event.shiftKey ? -1 : 1);
      } else if (event.key.toLowerCase() === "w" && activeTabId) {
        event.preventDefault();
        requestCloseTab(activeTabId);
      } else if (event.key.toLowerCase() === "s" && event.shiftKey) {
        event.preventDefault();
        void saveAllTabs();
      } else if (event.key.toLowerCase() === "s" && activeTabEditable) {
        event.preventDefault();
        void saveActiveTab();
      }
    }
    window.addEventListener("keydown", handleEditorShortcut);
    return () => window.removeEventListener("keydown", handleEditorShortcut);
  }, [activeTabId, activeTabEditable, activateRelativeTab, tabs, activeTab, savingTabId, savingAll, conflictTabId]);

  async function openProjectFolder() {
    if (hasDirtyTabs && !confirmDiscard("Open another project and discard all unsaved editor changes?")) return;
    setWorkspaceStatus({ state: "scanning" });
    setCanUndoEdit(false);
    setSaveError(null);
    setSaveSummary(null);
    setConflictTabId(null);
    const project = await window.levi.projects.openFolder();
    if (project) {
      if (hasDirtyTabs) clearRecovery();
      setSelectedProject(project);
      setActiveView("explorer");
    }
    setWorkspaceStatus(await window.levi.workspace.getStatus());
  }

  async function refreshWorkspace() {
    setWorkspaceStatus({ state: "scanning", summary: workspaceStatus.summary });
    setCanUndoEdit(false);
    setWorkspaceStatus(await window.levi.workspace.refresh());
  }

  async function acceptOpenedProject(project: SelectedProject) {
    setSelectedProject(project);
    setWorkspaceStatus(await window.levi.workspace.getStatus());
    setCanUndoEdit(false);
    clearRecovery();
  }

  async function openWorkspaceCitation(sourceId: string, lineStart?: number) {
    openFile(await window.levi.workspace.openFile({ sourceId, lineStart }));
    setActiveView("explorer");
  }

  function openExplorerFile(file: WorkspaceReadPathResult) {
    openFile({ sourceId: `WORKSPACE:${file.relativePath}`, relativePath: file.relativePath, content: file.content, language: file.language, lineStart: 1, readOnly: false });
    setCanUndoEdit(false);
  }

  async function openSearchMatch(relativePath: string, lineNumber: number, columnStart = 1) {
    const file = await window.levi.workspace.readPath({ relativePath });
    openFile({ sourceId: `WORKSPACE:${file.relativePath}`, relativePath: file.relativePath, content: file.content, language: file.language, lineStart: lineNumber, columnStart, readOnly: false });
    setCanUndoEdit(false);
  }

  async function openTaskProblem(problem: TaskProblem) {
    if (!problem.relativePath) return;
    await openSearchMatch(problem.relativePath, problem.line, problem.column);
  }

  async function revealTaskTerminal(_terminalSessionId?: string) {
    const layout = await window.levi.terminal.getLayout();
    await window.levi.terminal.setLayout({
      ...layout,
      panelTab: "terminal",
      panelVisible: true
    });
  }

  async function runTask(taskId: string) {
    await tasks.runTask(taskId);
    const layout = await window.levi.terminal.getLayout();
    await window.levi.terminal.setLayout({
      ...layout,
      panelTab: "output",
      panelVisible: true
    });
  }

  function openAppliedEdit(result: EditApplyResult) {
    openFile({ sourceId: "LEVIEDIT", relativePath: result.relativePath, content: result.content, language: result.language, lineStart: result.lineStart, readOnly: true, appliedByLevi: true });
    setCanUndoEdit(true);
    setActiveView("explorer");
  }

  function openUndoneEdit(result: EditUndoResult) {
    openFile({ sourceId: "LEVIEDIT", relativePath: result.relativePath, content: result.content, language: result.language, lineStart: result.lineStart, readOnly: true, undoneByLevi: true });
    setCanUndoEdit(false);
    setActiveView("explorer");
  }

  async function undoLastEdit() { openUndoneEdit(await window.levi.edits.undoLast()); }
  function startNewChat() { setActiveView("home"); setNewChatSignal((value) => value + 1); }

  const shellProjectLabel = selectedProject?.name ?? "No project";
  const shellWorkspaceLabel = workspaceStatus.state === "ready"
    ? "Workspace ready"
    : workspaceStatus.state === "scanning"
      ? "Scanning"
      : workspaceStatus.state === "refresh-required"
        ? "Refresh required"
        : workspaceStatus.state === "failed"
          ? "Scan failed"
          : "Idle";
  const selectedRuntime = runtimeState.providers.find((provider) => provider.id === runtimeState.selectedRuntimeId)
    ?? runtimeState.providers.find((provider) => provider.id === runtimeState.automaticRuntimeId)
    ?? runtimeState.providers[0];
  const shellModelId = runtimeState.lastSelectedModelId ?? selectedRuntime?.models[0]?.id ?? "";
  const showWorkspaceTopBar = activeView !== "home";
  const showDebugToolbar = activeView === "debug" || debugState.state !== "Idle" || debugState.sessions.length > 0;

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, tabId: string) {
    if (event.key === "ArrowRight") { event.preventDefault(); activateRelativeTab(1); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); activateRelativeTab(-1); }
    else if (event.key === "Home") { event.preventDefault(); const first = tabs[0]; if (first) activateTab(first.id); }
    else if (event.key === "End") { event.preventDefault(); const last = tabs[tabs.length - 1]; if (last) activateTab(last.id); }
    else if (event.key === "Delete") { event.preventDefault(); requestCloseTab(tabId); }
  }

  function renderActiveWorkspace() {
    if (activeView === "rules") return <LazySurface label="Project Rules"><ProjectRulesPanel onOpenRuleSource={openFile} /></LazySurface>;
    if (activeView === "debug") {
      return (
        <LazySurface label="Run and Debug">
          <RunDebugPanel
            state={debugState}
            workspaceAvailable={Boolean(selectedProject)}
            onStart={startDebugging}
            onSetBreakpoint={setDebugBreakpoint}
            onRemoveBreakpoint={removeDebugBreakpoint}
            onAddWatch={addDebugWatch}
            onUpdateWatch={updateDebugWatch}
            onRemoveWatch={removeDebugWatch}
            onLoadVariables={loadDebugVariables}
            onEvaluate={async (expression) => {
              await evaluateDebugExpression(expression);
            }}
            onClearConsole={clearDebugConsole}
            onSelectConfiguration={selectDebugConfiguration}
            onCreateLaunchConfig={createDebugLaunchConfig}
            onOpenFrame={openDebugFrame}
            onEditBreakpoint={editDebugBreakpoint}
            onSetExceptionBreakpoints={setDebugExceptionBreakpoints}
            onRefreshLoadedSources={refreshDebugLoadedSources}
            onOpenSource={openDebugSource}
            onContinueFromException={continueFromDebugException}
            onGetCompletions={getDebugCompletions}
            onScanAdapters={scanDebugAdapters}
            onInstallAdapter={installDebugAdapter}
            onUninstallAdapter={uninstallDebugAdapter}
            onRevealAdapter={revealDebugAdapter}
            onDismissAdapterRecommendation={dismissDebugAdapterRecommendation}
            onCancelAdapterInstall={cancelDebugAdapterInstall}
            onSelectSession={selectDebugSession}
            onStopAll={stopAllDebugSessions}
          />
        </LazySurface>
      );
    }
    if (activeView === "tasks") {
      return (
        <LazySurface label="Tasks">
          <TasksPanel
            enabled={Boolean(selectedProject)}
            detected={tasks.list.detected}
            recent={tasks.list.recent}
            running={tasks.list.running}
            failed={tasks.list.failed}
            pinned={tasks.list.pinned}
            onRunTask={async (taskId) => {
              await runTask(taskId);
            }}
            onCancelRun={async (runId) => {
              await tasks.cancelRun(runId);
            }}
            onPinTask={tasks.pinTask}
            onRunAgain={async (entry) => {
              await tasks.runAgain(entry);
            }}
            onRevealTerminal={revealTaskTerminal}
          />
        </LazySurface>
      );
    }
    if (activeView === "runtime") {
      return (
        <LazySurface label="Runtime Manager">
          <RuntimeManagerPanel
            state={runtimeState}
            onRefresh={refreshRuntimeHealth}
            onDetect={detectRuntimes}
            onSelectRuntime={selectRuntime}
            onSetAutomatic={setAutomaticRuntime}
            onPullModel={pullRuntimeModel}
            onDeleteModel={deleteRuntimeModel}
            onStartRuntime={startRuntimeProvider}
            onStopRuntime={stopRuntimeProvider}
            onRestartRuntime={restartRuntimeProvider}
            onCancelRequest={cancelRuntimeRequest}
          />
        </LazySurface>
      );
    }
    if (activeView === "agent") {
      return (
        <LazySurface label="Coding Agent">
          <AgentPanel
            runtimeState={runtimeState}
            activeTab={activeTab}
            tabs={tabs}
            selectedCode={editorSelection}
            workspaceStatus={workspaceStatus}
            taskProblems={tasks.problems}
            taskOutput={tasks.output as TaskOutputEntry[]}
            onRevealTerminal={revealTaskTerminal}
          />
        </LazySurface>
      );
    }
    if (activeView === "history") return <LazySurface label="History"><HistoryPanel transactions={executionHistory} /></LazySurface>;
    if (activeView === "settings") {
      return (
        <LazySurface label="Settings">
          <SettingsPanel
            status={ollamaStatus}
            selectedProject={selectedProject}
            workspaceStatus={workspaceStatus}
            updateStatus={updateStatus}
            onCheckForUpdates={checkForUpdates}
            onDownloadUpdate={downloadUpdate}
            onInstallDownloadedUpdate={installDownloadedUpdate}
          />
        </LazySurface>
      );
    }
    if (activeView === "home") return (
      <Home
        selectedProject={selectedProject}
        workspaceStatus={workspaceStatus}
        newChatSignal={newChatSignal}
        onOpenCitation={openWorkspaceCitation}
        onEditApplied={openAppliedEdit}
        onEditUndone={openUndoneEdit}
        onExecutionTransactionUpdate={recordExecutionTransaction}
        onProjectOpened={acceptOpenedProject}
        onOpenProject={() => setActiveView("explorer")}
        onOpenTerminal={async () => {
          const current = await window.levi.terminal.getLayout();
          await window.levi.terminal.setLayout({ ...current, panelTab: "terminal", panelVisible: true });
        }}
        onOpenChangedFile={(relativePath) => openSearchMatch(relativePath, 1)}
      />
    );
    return <WorkspacePlaceholder view={activeView} />;
  }

  function renderEditorPanel() {
    if (!activeTab) {
      return (
        <div className="levi-editor-empty" aria-label="No file open">
          <div>
            <h1>No file open</h1>
            <p>Choose a source file from the sidebar to inspect it in the editor.</p>
          </div>
        </div>
      );
    }

    return (
      <section className="levi-editor-panel" aria-label="Workspace editor">
        <div className="levi-editor-tabs" role="tablist" aria-label="Open files">
          {tabs.map((tab) => {
            const active = tab.id === activeTabId;
            const fileName = tab.relativePath.split(/[\\/]/).pop() ?? tab.relativePath;
            return (
              <div key={tab.id} className={active ? "levi-editor-tab levi-editor-tab-active" : "levi-editor-tab"}>
                <button ref={(element) => { if (element) tabButtonRefs.current.set(tab.id, element); else tabButtonRefs.current.delete(tab.id); }} type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1} className="levi-editor-tab-label" onClick={() => activateTab(tab.id)} onDoubleClick={() => pinTab(tab.id, !tab.pinned)} onKeyDown={(event) => handleTabKeyDown(event, tab.id)} title={`${tab.relativePath}${tab.pinned ? " - pinned" : ""}`}>
                  {tab.pinned ? <span className="levi-editor-tab-state" aria-label="Pinned">*</span> : null}
                  {tab.dirty ? <span className="levi-editor-tab-state" aria-label="Unsaved changes">!</span> : null}
                  <span className="levi-editor-tab-name">{fileName}</span>
                </button>
                <button type="button" className="levi-icon-button" onClick={() => requestCloseTab(tab.id)} aria-label={`Close ${tab.relativePath}`} title="Close tab (Ctrl+W)"><Icon name="close" /></button>
              </div>
            );
          })}
        </div>
        <div className="levi-editor-header">
          <div>
            <div className="levi-editor-path">{activeTab.relativePath}</div>
            <div className="levi-editor-mode" role={saveError ? "alert" : undefined}>
              {saveError ? `Save failed: ${saveError}` : saveSummary ? saveSummary : savingAll ? "Saving all changed files…" : savingTabId === activeTab.id ? "Saving…" : activeTabEditable ? activeTab.dirty ? "Unsaved changes — Ctrl+S to save" : "Workspace file — editable" : activeTab.appliedByLevi ? "Applied by Levi — read-only workspace view" : activeTab.undoneByLevi ? "Undo restored — read-only workspace view" : "Read-only workspace view"}
            </div>
          </div>
          {dirtyWorkspaceTabs.length > 0 ? <button type="button" className="levi-button levi-button-secondary" onClick={() => void saveAllTabs()} disabled={savingAll || Boolean(savingTabId)} aria-label="Save all files" title="Save All (Ctrl+Shift+S)"><span>{savingAll ? "Saving All…" : `Save All (${dirtyWorkspaceTabs.length})`}</span></button> : null}
          {activeTabHasConflict ? (
            <>
              <button type="button" className="levi-button levi-button-secondary" onClick={() => void reloadActiveTabFromDisk()} disabled={savingTabId === activeTab.id || savingAll}><span>Reload</span></button>
              <button type="button" className="levi-button levi-button-secondary" onClick={() => void saveActiveTab(true)} disabled={savingTabId === activeTab.id || savingAll}><span>Overwrite</span></button>
            </>
          ) : activeTabEditable ? <button type="button" className="levi-button levi-button-secondary" onClick={() => void saveActiveTab()} disabled={!activeTab.dirty || savingTabId === activeTab.id || savingAll} aria-label="Save file"><span>{savingTabId === activeTab.id ? "Saving…" : "Save"}</span></button> : null}
          {canUndoEdit ? <button type="button" className="levi-button levi-button-secondary" onClick={() => void undoLastEdit()} aria-label="Undo Last Edit"><Icon name="refresh" /><span>Undo Last Edit</span></button> : null}
        </div>
        <div className="levi-editor-host">
          <LazySurface label="Editor">
            <CodeEditor
              value={activeTab.content}
              language={activeTab.language}
              relativePath={activeTab.relativePath}
              lineStart={activeTab.lineStart}
              columnStart={activeTab.columnStart ?? 1}
              readOnly={!activeTabEditable}
              breakpoints={debugState.breakpoints.filter((breakpoint) => breakpoint.relativePath === activeTab.relativePath)}
              activeExecutionLine={debugState.activeStackFrame?.relativePath === activeTab.relativePath ? debugState.activeStackFrame.line : undefined}
              exceptionLine={
                debugState.exceptionInfo?.relativePath === activeTab.relativePath ? debugState.exceptionInfo.line : undefined
              }
              debugPaused={debugState.state === "Paused"}
              activeFrameId={debugState.activeStackFrame?.id}
              inlineValues={debugState.inlineValues}
              onToggleBreakpoint={(line) => void setDebugBreakpoint({ relativePath: activeTab.relativePath, line, toggle: true })}
              onEditBreakpoint={(line, request) => editCodeEditorBreakpoint(line, request)}
              onEvaluateHover={(expression, frameId) => evaluateDebugHover(expression, frameId)}
              onEvaluateSelection={(expression) => evaluateDebugSelection(expression)}
              onSelectionChange={(selection) =>
                setEditorSelection(selection && activeTab
                  ? {
                      relativePath: activeTab.relativePath,
                      language: activeTab.language,
                      content: selection.content,
                      lineStart: selection.lineStart,
                      lineEnd: selection.lineEnd
                    }
                  : null)
              }
              onChange={(content) => updateContent(activeTab.id, content)}
              onSave={() => void saveActiveTab()}
            />
          </LazySurface>
        </div>
      </section>
    );
  }

  function renderPrimaryWorkspace() {
    if (activeView === "explorer" || activeView === "search" || activeView === "history") {
      return renderEditorPanel();
    }

    return renderActiveWorkspace();
  }

  function renderContextSidebar() {
    if (activeView === "home") {
      return (
        <Sidebar
          status={ollamaStatus}
          selectedProject={selectedProject}
          workspaceStatus={workspaceStatus}
          activeView={activeView}
          onOpenProject={openProjectFolder}
          onNewChat={startNewChat}
          onOpenHistory={() => selectActivityView("history")}
          onOpenSettings={() => selectActivityView("settings")}
        />
      );
    }

    if (activeView === "explorer") {
      return <ExplorerPanel workspaceStatus={workspaceStatus} selectedPath={activeTab?.relativePath} onOpenFile={openExplorerFile} />;
    }

    if (activeView === "search") {
      return <SearchPanel enabled={Boolean(selectedProject)} focusSignal={searchFocusSignal} onOpenMatch={openSearchMatch} />;
    }

    if (activeView === "history") {
      return <LazySurface label="History"><HistoryPanel transactions={executionHistory} /></LazySurface>;
    }

    return null;
  }

  const contextSidebar = renderContextSidebar();

  async function checkForUpdates() {
    setUpdateStatus(await window.levi.updates.checkForUpdates());
  }

  async function refreshRuntimeHealth() {
    setRuntimeState(await window.levi.runtime.health());
  }

  async function detectRuntimes() {
    setRuntimeState(await window.levi.runtime.detect());
  }

  async function selectRuntime(runtimeId: AIRuntimeProviderId) {
    setRuntimeState(await window.levi.runtime.select({ runtimeId, preferred: true, mode: "manual" }));
  }

  async function setAutomaticRuntime() {
    setRuntimeState(await window.levi.runtime.select({ mode: "automatic" }));
  }

  async function pullRuntimeModel(providerId: AIRuntimeProviderId, modelId: string) {
    await window.levi.runtime.pullModel({ providerId, modelId });
    setRuntimeState(await window.levi.runtime.health(providerId));
  }

  async function deleteRuntimeModel(providerId: AIRuntimeProviderId, modelId: string) {
    await window.levi.runtime.deleteModel({ providerId, modelId });
    setRuntimeState(await window.levi.runtime.health(providerId));
  }

  async function startRuntimeProvider(providerId: AIRuntimeProviderId) {
    await window.levi.runtime.start({ providerId });
    setRuntimeState(await window.levi.runtime.health(providerId));
  }

  async function stopRuntimeProvider(providerId: AIRuntimeProviderId) {
    await window.levi.runtime.stop({ providerId });
    setRuntimeState(await window.levi.runtime.health(providerId));
  }

  async function restartRuntimeProvider(providerId: AIRuntimeProviderId) {
    await window.levi.runtime.restart({ providerId });
    setRuntimeState(await window.levi.runtime.health(providerId));
  }

  async function cancelRuntimeRequest(requestId: string) {
    setRuntimeState(await window.levi.runtime.cancel({ requestId }));
  }

  async function downloadUpdate() {
    setUpdateStatus(await window.levi.updates.downloadUpdate());
  }

  async function installDownloadedUpdate() {
    setUpdateStatus(await window.levi.updates.installDownloadedUpdate());
  }

  async function applyDebugState(nextState: Promise<DebugState>) {
    setDebugState(await nextState);
  }

  async function startDebugging(configuration: DebugLaunchConfiguration) {
    await applyDebugState(window.levi.debug.start({ configuration }));
  }

  async function setDebugBreakpoint(request: DebugSetBreakpointRequest) {
    await applyDebugState(window.levi.debug.setBreakpoint(request));
  }

  async function removeDebugBreakpoint(breakpointId: string) {
    await applyDebugState(window.levi.debug.removeBreakpoint({ breakpointId }));
  }

  async function addDebugWatch(expression: string) {
    await applyDebugState(window.levi.debug.addWatch(expression));
  }

  async function updateDebugWatch(id: string, expression: string) {
    await applyDebugState(window.levi.debug.updateWatch({ id, expression }));
  }

  async function removeDebugWatch(id: string) {
    await applyDebugState(window.levi.debug.removeWatch(id));
  }

  async function loadDebugVariables(variablesReference: number) {
    await applyDebugState(window.levi.debug.loadVariables({ variablesReference }));
  }

  async function evaluateDebugExpression(expression: string, context: "repl" | "watch" | "hover" = "repl", frameId?: number) {
    await applyDebugState(window.levi.debug.evaluate({ expression, context, frameId }));
    return debugState.lastEvaluation;
  }

  async function evaluateDebugHover(expression: string, frameId?: number) {
    const state = await window.levi.debug.evaluate({ expression, context: "hover", frameId });
    setDebugState(state);
    return state.lastEvaluation;
  }

  async function evaluateDebugSelection(expression: string): Promise<void> {
    await applyDebugState(window.levi.debug.evaluate({ expression, context: "repl" }));
  }

  async function editDebugBreakpoint(_breakpointId: string, request: DebugSetBreakpointRequest) {
    await applyDebugState(window.levi.debug.setBreakpoint(request));
  }

  async function setDebugExceptionBreakpoints(breakpoints: DebugExceptionBreakpoint[]) {
    await applyDebugState(window.levi.debug.setExceptionBreakpoints({ breakpoints }));
  }

  async function refreshDebugLoadedSources() {
    await applyDebugState(window.levi.debug.refreshLoadedSources());
  }

  async function openDebugSource(relativePath: string) {
    const file = await window.levi.workspace.readPath({ relativePath });
    openFile({
      sourceId: `WORKSPACE:${file.relativePath}`,
      relativePath: file.relativePath,
      content: file.content,
      language: file.language,
      lineStart: 1,
      readOnly: false
    });
  }

  async function continueFromDebugException() {
    await applyDebugState(window.levi.debug.continue());
  }

  async function getDebugCompletions(text: string, column: number) {
    return window.levi.debug.getCompletions({ text, column, frameId: debugState.activeStackFrame?.id });
  }

  async function scanDebugAdapters() {
    await applyDebugState(window.levi.debug.scanAdapters());
  }

  async function installDebugAdapter(request: DebugAdapterInstallRequest) {
    await applyDebugState(window.levi.debug.installAdapter(request));
  }

  async function uninstallDebugAdapter(adapterId: string) {
    await applyDebugState(window.levi.debug.uninstallAdapter({ adapterId, confirmed: true }));
  }

  async function revealDebugAdapter(adapterId: string) {
    await window.levi.debug.revealAdapterLocation(adapterId);
  }

  async function dismissDebugAdapterRecommendation(adapterId: string) {
    await applyDebugState(window.levi.debug.dismissAdapterRecommendation(adapterId));
  }

  async function cancelDebugAdapterInstall() {
    await window.levi.debug.cancelAdapterInstall();
  }

  async function selectDebugSession(sessionId: string) {
    await applyDebugState(window.levi.debug.selectSession(sessionId));
  }

  async function stopAllDebugSessions() {
    await applyDebugState(window.levi.debug.stopAll());
  }

  async function editCodeEditorBreakpoint(_line: number, request: DebugSetBreakpointRequest): Promise<void> {
    await applyDebugState(window.levi.debug.setBreakpoint(request));
  }

  async function clearDebugConsole() {
    await applyDebugState(window.levi.debug.clearConsole());
  }

  async function selectDebugConfiguration(name: string) {
    await applyDebugState(window.levi.debug.selectConfiguration(name));
  }

  async function createDebugLaunchConfig() {
    await applyDebugState(window.levi.debug.createLaunchConfig());
  }

  async function openDebugFrame(threadId: number, frame: DebugStackFrame) {
    await applyDebugState(window.levi.debug.selectStackFrame({ threadId, frameId: frame.id }));
    if (!frame.relativePath || typeof frame.line !== "number") return;
    const file = await window.levi.workspace.readPath({ relativePath: frame.relativePath });
    openFile({
      sourceId: `WORKSPACE:${file.relativePath}`,
      relativePath: file.relativePath,
      content: file.content,
      language: file.language,
      lineStart: frame.line,
      readOnly: false
    });
  }

  return (
    <div className={contextSidebar ? "levi-shell" : "levi-shell levi-shell-no-context"}>
      <ActivityBar activeView={activeView} onSelect={selectActivityView} />
      {contextSidebar ? <div className="levi-context-sidebar">{contextSidebar}</div> : null}
      <main className="levi-main">
        {showWorkspaceTopBar ? (
          <header className="levi-top-bar" aria-label="Workspace top bar">
            <div className="levi-top-project">
              <strong>{shellProjectLabel}</strong>
              <span>{shellWorkspaceLabel}</span>
            </div>
            <div className="levi-top-actions">
              {shellModelId ? (
                <label className="levi-top-model">
                  <select aria-label="Workspace model selector" value={shellModelId} onChange={() => undefined}>
                    <option value={shellModelId}>{shellModelId}</option>
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                className={aiPanelOpen ? "levi-button levi-button-secondary levi-button-active" : "levi-button levi-button-secondary"}
                aria-label={aiPanelOpen ? "Close AI panel" : "Open AI panel"}
                aria-expanded={aiPanelOpen}
                onClick={() => setAiPanelOpen((open) => !open)}
              >
                <Icon name="chat" />
                <span>Agent</span>
              </button>
              <details className="levi-top-menu">
                <summary aria-label="Workspace menu" title="Workspace menu">...</summary>
                <div className="levi-top-menu-popover">
                  <button type="button" onClick={refreshWorkspace} disabled={!selectedProject || workspaceStatus.state === "scanning"}>
                    Refresh Workspace
                  </button>
                  <button type="button" onClick={() => selectActivityView("rules")} disabled={!selectedProject}>
                    Project Rules
                  </button>
                  <button type="button" onClick={() => selectActivityView("settings")}>
                    Settings
                  </button>
                </div>
              </details>
            </div>
          </header>
        ) : null}
        <div className={[
          "levi-workspace-layout",
          aiPanelOpen && activeView !== "home" ? "levi-workspace-layout-with-ai" : ""
        ].filter(Boolean).join(" ")}>
          <section className="levi-primary-workspace" aria-label="Primary workspace">
            {showDebugToolbar ? (
              <DebugToolbar
                state={debugState}
                onContinue={() => void applyDebugState(window.levi.debug.continue())}
                onPause={() => void applyDebugState(window.levi.debug.pause())}
                onRestart={() => void applyDebugState(window.levi.debug.restart())}
                onStop={() => void applyDebugState(window.levi.debug.stop())}
                onStepOver={() => void applyDebugState(window.levi.debug.stepOver())}
                onStepInto={() => void applyDebugState(window.levi.debug.stepInto())}
                onStepOut={() => void applyDebugState(window.levi.debug.stepOut())}
              />
            ) : null}
            <div className="levi-primary-workspace-body">
              {renderPrimaryWorkspace()}
            </div>
          </section>
          {aiPanelOpen && activeView !== "home" ? (
            <AIChatPanel
              runtimeState={runtimeState}
              activeTab={activeTab}
              tabs={tabs}
              selectedCode={editorSelection}
              workspaceStatus={workspaceStatus}
              taskProblems={tasks.problems}
              taskOutput={tasks.output as TaskOutputEntry[]}
              onOpenCitation={async (attachment) => {
                if (!attachment.relativePath) return;
                const file = await window.levi.workspace.readPath({ relativePath: attachment.relativePath });
                openFile({
                  sourceId: attachment.sourceId ?? `WORKSPACE:${file.relativePath}`,
                  relativePath: file.relativePath,
                  content: file.content,
                  language: file.language,
                  lineStart: attachment.lineStart ?? 1,
                  readOnly: false
                });
              }}
            />
          ) : null}
        </div>
        <BottomPanel
          selectedProject={selectedProject}
          debugConsole={debugState.console}
          debugLastEvaluation={debugState.lastEvaluation}
          onEvaluateDebug={evaluateDebugExpression}
          onClearDebugConsole={clearDebugConsole}
          problems={tasks.problems}
          output={tasks.output}
          onOpenProblem={openTaskProblem}
        />
      </main>
    </div>
  );
}
