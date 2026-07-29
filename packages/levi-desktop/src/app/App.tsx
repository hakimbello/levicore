import { lazy, useEffect, useState } from "react";
import { ActivityBar, type ActivityView } from "../components/ActivityBar";
import { Icon } from "../components/Icon";
import { LazySurface } from "../components/LazySurface";
import { Sidebar } from "../components/Sidebar";
import { ExplorerPanel } from "../features/explorer/ExplorerPanel";
import { Home } from "../features/home/Home";
import { TerminalPanel } from "../features/terminal/TerminalPanel";
import type { EditApplyResult, EditUndoResult, OllamaStatus, SelectedProject, WorkspaceOpenFileResult, WorkspaceStatus } from "../types/levi-api";
import type { WorkspaceReadPathResult } from "../types/workspace-tree-api";

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
  const [openFile, setOpenFile] = useState<WorkspaceOpenFileResult | null>(null);
  const [canUndoEdit, setCanUndoEdit] = useState(false);
  const [newChatSignal, setNewChatSignal] = useState(0);
  const [activeView, setActiveView] = useState<ActivityView>("home");

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
            if (!disposed) {
              setWorkspaceStatus(nextStatus);
            }
          });
        }
      }
    }

    void loadShellState();

    return () => {
      disposed = true;
    };
  }, []);

  async function openProjectFolder() {
    setWorkspaceStatus({ state: "scanning" });
    setOpenFile(null);
    setCanUndoEdit(false);
    const project = await window.levi.projects.openFolder();
    setSelectedProject(project ?? selectedProject);
    setWorkspaceStatus(await window.levi.workspace.getStatus());
    if (project) {
      setActiveView("explorer");
    }
  }

  async function refreshWorkspace() {
    setWorkspaceStatus({ state: "scanning", summary: workspaceStatus.summary });
    setOpenFile(null);
    setCanUndoEdit(false);
    setWorkspaceStatus(await window.levi.workspace.refresh());
  }

  async function openWorkspaceCitation(sourceId: string, lineStart?: number) {
    const file = await window.levi.workspace.openFile({ sourceId, lineStart });
    setOpenFile(file);
  }

  function openExplorerFile(file: WorkspaceReadPathResult) {
    setOpenFile({
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
    setOpenFile({
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
    setOpenFile({
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
    const result = await window.levi.edits.undoLast();
    openUndoneEdit(result);
  }

  function startNewChat() {
    setActiveView("home");
    setNewChatSignal((value) => value + 1);
  }

  function renderActiveWorkspace() {
    if (activeView === "rules") {
      return (
        <LazySurface label="Project Rules">
          <ProjectRulesPanel onOpenRuleSource={setOpenFile} />
        </LazySurface>
      );
    }

    if (activeView === "explorer") {
      return (
        <ExplorerPanel
          workspaceStatus={workspaceStatus}
          selectedPath={openFile?.relativePath}
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
        <div className={openFile ? "levi-workspace-layout levi-workspace-layout-editor" : "levi-workspace-layout"}>
          {renderActiveWorkspace()}
          {openFile ? (
            <aside className="levi-editor-panel" aria-label="Read-only workspace file">
              <div className="levi-editor-header">
                <div>
                  <div className="levi-editor-path">{openFile.relativePath}</div>
                  <div className="levi-editor-mode">
                    {openFile.appliedByLevi
                      ? "Applied by Levi - read-only workspace view"
                      : openFile.undoneByLevi
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
                <button type="button" className="levi-icon-button" onClick={() => setOpenFile(null)} aria-label="Close file" title="Close file">
                  <Icon name="close" />
                </button>
              </div>
              <div className="levi-editor-host">
                <LazySurface label="Editor">
                  <CodeEditor value={openFile.content} language={openFile.language} lineStart={openFile.lineStart} />
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
