import { lazy, useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { LazySurface } from "../components/LazySurface";
import { Sidebar } from "../components/Sidebar";
import { Home } from "../features/home/Home";
import { TerminalPanel } from "../features/terminal/TerminalPanel";
import type { EditApplyResult, EditUndoResult, OllamaStatus, SelectedProject, WorkspaceOpenFileResult, WorkspaceStatus } from "../types/levi-api";

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

export function App() {
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus>(unknownStatus);
  const [selectedProject, setSelectedProject] = useState<SelectedProject | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus>(idleWorkspaceStatus);
  const [openFile, setOpenFile] = useState<WorkspaceOpenFileResult | null>(null);
  const [canUndoEdit, setCanUndoEdit] = useState(false);
  const [newChatSignal, setNewChatSignal] = useState(0);
  const [activeView, setActiveView] = useState<"home" | "rules">("home");

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
    if (project) {
      setSelectedProject(project);
      setWorkspaceStatus(await window.levi.workspace.getStatus());
    } else {
      setWorkspaceStatus(await window.levi.workspace.getStatus());
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

  return (
    <div className="levi-shell">
      <Sidebar
        status={ollamaStatus}
        selectedProject={selectedProject}
        workspaceStatus={workspaceStatus}
        onOpenProject={openProjectFolder}
        onRefreshWorkspace={refreshWorkspace}
        onNewChat={() => {
          setActiveView("home");
          setNewChatSignal((value) => value + 1);
        }}
        onOpenRules={() => setActiveView("rules")}
      />
      <main className="levi-main">
        <div className={openFile ? "levi-workspace-layout levi-workspace-layout-editor" : "levi-workspace-layout"}>
          {activeView === "rules" ? (
            <LazySurface label="Project Rules">
              <ProjectRulesPanel onOpenRuleSource={setOpenFile} />
            </LazySurface>
          ) : (
            <Home
              selectedProject={selectedProject}
              workspaceStatus={workspaceStatus}
              newChatSignal={newChatSignal}
              onOpenCitation={openWorkspaceCitation}
              onEditApplied={openAppliedEdit}
              onEditUndone={openUndoneEdit}
            />
          )}
          {openFile ? (
            <aside className="levi-editor-panel" aria-label="Read-only workspace file">
              <div className="levi-editor-header">
                <div>
                  <div className="levi-editor-path">{openFile.relativePath}</div>
                  <div className="levi-editor-mode">
                    {openFile.appliedByLevi ? "Applied by Levi - read-only workspace view" : openFile.undoneByLevi ? "Undo restored - read-only workspace view" : "Read-only workspace view"}
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
