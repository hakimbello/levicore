import { lazy, useEffect, useRef, useState } from "react";
import { ActivityBar, type ActivityView } from "../components/ActivityBar";
import { Icon } from "../components/Icon";
import { LazySurface } from "../components/LazySurface";
import { Sidebar } from "../components/Sidebar";
import { ExplorerPanel } from "../features/explorer/ExplorerPanel";
import { Home } from "../features/home/Home";
import { SearchPanel } from "../features/search/SearchPanel";
import { TerminalPanel } from "../features/terminal/TerminalPanel";
import { type EditorTab, useEditorTabs } from "../hooks/use-editor-tabs";
import type { EditApplyResult, EditUndoResult, OllamaStatus, SelectedProject, WorkspaceStatus } from "../types/levi-api";
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

const unknownStatus: OllamaStatus = { ready: false, modelCount: 0, models: [] };
const idleWorkspaceStatus: WorkspaceStatus = { state: "idle" };
const FILE_CONFLICT_CODE = "WORKSPACE_FILE_CONFLICT";

const placeholderCopy: Partial<Record<ActivityView, { title: string; description: string }>> = {
  "source-control": { title: "Source Control", description: "Git status, staging, commits, and branch controls are scheduled for the IDE Core phase." },
  terminal: { title: "Terminal", description: "Use the terminal panel at the bottom of the workspace." },
  settings: { title: "Settings", description: "Desktop, model, workspace, and appearance settings will be consolidated here." }
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

export function App() {
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>(unknownStatus);
  const [selectedProject, setSelectedProject] = useState<SelectedProject | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>(idleWorkspaceStatus);
  const [canUndoEdit, setCanUndoEdit] = useState(false);
  const [newChatSignal, setNewChatSignal] = useState(0);
  const [activeView, setActiveView] = useState<ActivityView>("home");
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const [savingTabId, setSavingTabId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSummary, setSaveSummary] = useState<string | null>(null);
  const [conflictTabId, setConflictTabId] = useState<string | null>(null);
  const tabButtonRefs = useRef(new Map<string, HTMLButtonElement>());
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

  useEffect(() => {
    let disposed = false;
    async function loadShellState() {
      const [status, recentProject, workspace, editStatus] = await Promise.all([
        window.levi.ollama.getStatus(),
        window.levi.projects.getRecent(),
        window.levi.workspace.getStatus(),
        window.levi.edits.getStatus()
      ]);
      if (!disposed) {
        setOllamaStatus(status);
        setSelectedProject(recentProject);
        setWorkspaceStatus(workspace);
        setCanUndoEdit(editStatus.canUndo);
        if (recentProject && workspace.state === "idle") {
          setWorkspaceStatus({ state: "scanning" });
          window.levi.workspace.refresh().then((nextStatus) => {
            if (!disposed) setWorkspaceStatus(nextStatus);
          });
        }
      }
    }
    void loadShellState();
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!activeTabId) return;
    tabButtonRefs.current.get(activeTabId)?.scrollIntoView({ block: "nearest", inline: "nearest" });
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

  async function openWorkspaceCitation(sourceId: string, lineStart?: number) { openFile(await window.levi.workspace.openFile({ sourceId, lineStart })); }

  function openExplorerFile(file: WorkspaceReadPathResult) {
    openFile({ sourceId: `WORKSPACE:${file.relativePath}`, relativePath: file.relativePath, content: file.content, language: file.language, lineStart: 1, readOnly: false });
    setCanUndoEdit(false);
  }

  async function openSearchMatch(relativePath: string, lineNumber: number) {
    const file = await window.levi.workspace.readPath({ relativePath });
    openFile({ sourceId: `WORKSPACE:${file.relativePath}`, relativePath: file.relativePath, content: file.content, language: file.language, lineStart: lineNumber, readOnly: false });
    setCanUndoEdit(false);
  }

  function openAppliedEdit(result: EditApplyResult) {
    openFile({ sourceId: "LEVIEDIT", relativePath: result.relativePath, content: result.content, language: result.language, lineStart: result.lineStart, readOnly: true, appliedByLevi: true });
    setCanUndoEdit(true);
  }

  function openUndoneEdit(result: EditUndoResult) {
    openFile({ sourceId: "LEVIEDIT", relativePath: result.relativePath, content: result.content, language: result.language, lineStart: result.lineStart, readOnly: true, undoneByLevi: true });
    setCanUndoEdit(false);
  }

  async function undoLastEdit() { openUndoneEdit(await window.levi.edits.undoLast()); }
  function startNewChat() { setActiveView("home"); setNewChatSignal((value) => value + 1); }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, tabId: string) {
    if (event.key === "ArrowRight") { event.preventDefault(); activateRelativeTab(1); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); activateRelativeTab(-1); }
    else if (event.key === "Home") { event.preventDefault(); const first = tabs[0]; if (first) activateTab(first.id); }
    else if (event.key === "End") { event.preventDefault(); const last = tabs[tabs.length - 1]; if (last) activateTab(last.id); }
    else if (event.key === "Delete") { event.preventDefault(); requestCloseTab(tabId); }
  }

  function renderActiveWorkspace() {
    if (activeView === "rules") return <LazySurface label="Project Rules"><ProjectRulesPanel onOpenRuleSource={openFile} /></LazySurface>;
    if (activeView === "explorer") return <ExplorerPanel workspaceStatus={workspaceStatus} selectedPath={activeTab?.relativePath} onOpenFile={openExplorerFile} />;
    if (activeView === "search") return <SearchPanel enabled={Boolean(selectedProject)} focusSignal={searchFocusSignal} onOpenMatch={openSearchMatch} />;
    if (activeView === "home") return <Home selectedProject={selectedProject} workspaceStatus={workspaceStatus} newChatSignal={newChatSignal} onOpenCitation={openWorkspaceCitation} onEditApplied={openAppliedEdit} onEditUndone={openUndoneEdit} />;
    return <WorkspacePlaceholder view={activeView} />;
  }

  return (
    <div className="levi-shell">
      <ActivityBar activeView={activeView} onSelect={selectActivityView} />
      <Sidebar status={ollamaStatus} selectedProject={selectedProject} workspaceStatus={workspaceStatus} onOpenProject={openProjectFolder} onRefreshWorkspace={refreshWorkspace} onNewChat={startNewChat} onOpenRules={() => setActiveView("rules")} />
      <main className="levi-main">
        <div className={activeTab ? "levi-workspace-layout levi-workspace-layout-editor" : "levi-workspace-layout"}>
          {renderActiveWorkspace()}
          {activeTab ? (
            <aside className="levi-editor-panel" aria-label="Workspace editor">
              <div className="levi-editor-tabs" role="tablist" aria-label="Open files">
                {tabs.map((tab) => {
                  const active = tab.id === activeTabId;
                  const fileName = tab.relativePath.split(/[\\/]/).pop() ?? tab.relativePath;
                  return (
                    <div key={tab.id} className={active ? "levi-editor-tab levi-editor-tab-active" : "levi-editor-tab"}>
                      <button ref={(element) => { if (element) tabButtonRefs.current.set(tab.id, element); else tabButtonRefs.current.delete(tab.id); }} type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1} className="levi-editor-tab-label" onClick={() => activateTab(tab.id)} onDoubleClick={() => pinTab(tab.id, !tab.pinned)} onKeyDown={(event) => handleTabKeyDown(event, tab.id)} title={`${tab.relativePath}${tab.pinned ? " — pinned" : ""}`}>
                        {tab.pinned ? <span className="levi-editor-tab-state" aria-label="Pinned">◆</span> : null}
                        {tab.dirty ? <span className="levi-editor-tab-state" aria-label="Unsaved changes">●</span> : null}
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
                  <CodeEditor value={activeTab.content} language={activeTab.language} lineStart={activeTab.lineStart} readOnly={!activeTabEditable} onChange={(content) => updateContent(activeTab.id, content)} onSave={() => void saveActiveTab()} />
                </LazySurface>
              </div>
            </aside>
          ) : null}
        </div>
        <TerminalPanel selectedProject={selectedProject} />
      </main>
    </div>
  );
}
