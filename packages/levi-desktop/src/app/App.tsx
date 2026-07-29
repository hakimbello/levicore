import { lazy, useEffect, useRef, useState } from "react";
import { ActivityBar, type ActivityView } from "../components/ActivityBar";
import { Icon } from "../components/Icon";
import { LazySurface } from "../components/LazySurface";
import { Sidebar } from "../components/Sidebar";
import { ExplorerPanel } from "../features/explorer/ExplorerPanel";
import { Home } from "../features/home/Home";
import { TerminalPanel } from "../features/terminal/TerminalPanel";
import { useEditorTabs } from "../hooks/use-editor-tabs";
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

const unknownStatus: OllamaStatus = {
  ready: false,
  modelCount: 0,
  models: []
};

const idleWorkspaceStatus: WorkspaceStatus = {
  state: "idle"
};

const placeholderCopy: Partial<Record<ActivityView, { title: string; description: string }>> = {
  search: {
    title: "Search",
    description: "Workspace-wide search and replace will be added after the Explorer foundation."
  },
  "source-control": {
    title: "Source Control",
    description: "Git status, staging, commits, and branch controls are scheduled for the IDE Core phase."
  },
  terminal: {
    title: "Terminal",
    description: "Use the terminal panel at the bottom of the workspace."
  },
  settings: {
    title: "Settings",
    description: "Desktop, model, workspace, and appearance settings will be consolidated here."
  }
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
  const tabButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const {
    tabs,
    activeTabId,
    activeTab,
    openFile,
    closeTab,
    closeActiveTab,
    activateTab,
    activateRelativeTab,
    pinTab
  } = useEditorTabs(selectedProject?.path);

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
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!activeTabId) return;
    tabButtonRefs.current.get(activeTabId)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId]);

  useEffect(() => {
    function handleEditorShortcut(event: KeyboardEvent) {
      const commandKey = event.ctrlKey || event.metaKey;
      if (!commandKey) return;

      if (event.key === "Tab" && tabs.length > 1) {
        event.preventDefault();
        activateRelativeTab(event.shiftKey ? -1 : 1);
      } else if (event.key.toLowerCase() === "w" && activeTabId) {
        event.preventDefault();
        closeActiveTab();
      }
    }

    window.addEventListener("keydown", handleEditorShortcut);
    return () => window.removeEventListener("keydown", handleEditorShortcut);
  }, [activeTabId, activateRelativeTab, closeActiveTab, tabs.length]);

  async function openProjectFolder() {
    setWorkspaceStatus({ state: "scanning" });
    setCanUndoEdit(false);
    const project = await window.levi.projects.openFolder();
    setSelectedProject(project ?? selectedProject);
    setWorkspaceStatus(await window.levi.workspace.getStatus());
    if (project) setActiveView("explorer");
  }

  async function refreshWorkspace() {
    setWorkspaceStatus({ state: "scanning", summary: workspaceStatus.summary });
    setCanUndoEdit(false);
    setWorkspaceStatus(await window.levi.workspace.refresh());
  }

  async function openWorkspaceCitation(sourceId: string, lineStart?: number) {
    openFile(await window.levi.workspace.openFile({ sourceId, lineStart }));
  }

  function openExplorerFile(file: WorkspaceReadPathResult) {
    openFile({
      sourceId: `WORKSPACE:${file.relativePath}`,
      relativePath: file.relativePath,
      content: file.content,
      language: file.language,
      lineStart: 1,
      readOnly: true
    });
    setCanUndoEdit(false);
  }

  function openAppliedEdit(result: EditApplyResult) {
    openFile({
      sourceId: "LEVIEDIT",
      relativePath: result.relativePath,
      content: result.content,
      language: result.language,
      lineStart: result.lineStart,
      readOnly: true,
      appliedByLevi: true
    });
    setCanUndoEdit(true);
  }

  function openUndoneEdit(result: EditUndoResult) {
    openFile({
      sourceId: "LEVIEDIT",
      relativePath: result.relativePath,
      content: result.content,
      language: result.language,
      lineStart: result.lineStart,
      readOnly: true,
      undoneByLevi: true
    });
    setCanUndoEdit(false);
  }

  async function undoLastEdit() {
    openUndoneEdit(await window.levi.edits.undoLast());
  }

  function startNewChat() {
    setActiveView("home");
    setNewChatSignal((value) => value + 1);
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, tabId: string) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      activateRelativeTab(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      activateRelativeTab(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      const first = tabs[0];
      if (first) activateTab(first.id);
    } else if (event.key === "End") {
      event.preventDefault();
      const last = tabs[tabs.length - 1];
      if (last) activateTab(last.id);
    } else if (event.key === "Delete") {
      event.preventDefault();
      closeTab(tabId);
    }
  }

  function renderActiveWorkspace() {
    if (activeView === "rules") {
      return (
        <LazySurface label="Project Rules">
          <ProjectRulesPanel onOpenRuleSource={openFile} />
        </LazySurface>
      );
    }

    if (activeView === "explorer") {
      return (
        <ExplorerPanel
          workspaceStatus={workspaceStatus}
          selectedPath={activeTab?.relativePath}
          onOpenFile={openExplorerFile}
        />
      );
    }

    if (activeView === "home") {
      return (
        <Home
          selectedProject={selectedProject}
          workspaceStatus={workspaceStatus}
          newChatSignal={newChatSignal}
          onOpenCitation={openWorkspaceCitation}
          onEditApplied={openAppliedEdit}
          onEditUndone={openUndoneEdit}
        />
      );
    }

    return <WorkspacePlaceholder view={activeView} />;
  }

  return (
    <div className="levi-shell">
      <ActivityBar activeView={activeView} onSelect={setActiveView} />
      <Sidebar
        status={ollamaStatus}
        selectedProject={selectedProject}
        workspaceStatus={workspaceStatus}
        onOpenProject={openProjectFolder}
        onRefreshWorkspace={refreshWorkspace}
        onNewChat={startNewChat}
        onOpenRules={() => setActiveView("rules")}
      />
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
                      <button
                        ref={(element) => {
                          if (element) tabButtonRefs.current.set(tab.id, element);
                          else tabButtonRefs.current.delete(tab.id);
                        }}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        tabIndex={active ? 0 : -1}
                        className="levi-editor-tab-label"
                        onClick={() => activateTab(tab.id)}
                        onDoubleClick={() => pinTab(tab.id, !tab.pinned)}
                        onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                        title={`${tab.relativePath}${tab.pinned ? " — pinned" : ""}`}
                      >
                        {tab.pinned ? <span className="levi-editor-tab-state" aria-label="Pinned">◆</span> : null}
                        {tab.dirty ? <span className="levi-editor-tab-state" aria-label="Unsaved changes">●</span> : null}
                        <span className="levi-editor-tab-name">{fileName}</span>
                      </button>
                      <button
                        type="button"
                        className="levi-icon-button"
                        onClick={() => closeTab(tab.id)}
                        aria-label={`Close ${tab.relativePath}`}
                        title="Close tab (Ctrl+W)"
                      >
                        <Icon name="close" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="levi-editor-header">
                <div>
                  <div className="levi-editor-path">{activeTab.relativePath}</div>
                  <div className="levi-editor-mode">
                    {activeTab.appliedByLevi
                      ? "Applied by Levi - read-only workspace view"
                      : activeTab.undoneByLevi
                        ? "Undo restored - read-only workspace view"
                        : "Read-only workspace view"}
                  </div>
                </div>
                {canUndoEdit ? (
                  <button type="button" className="levi-button levi-button-secondary" onClick={() => void undoLastEdit()} aria-label="Undo Last Edit">
                    <Icon name="refresh" />
                    <span>Undo Last Edit</span>
                  </button>
                ) : null}
              </div>
              <div className="levi-editor-host">
                <LazySurface label="Editor">
                  <CodeEditor value={activeTab.content} language={activeTab.language} lineStart={activeTab.lineStart} />
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
