import type { OllamaStatus, SelectedProject, WorkspaceStatus } from "../types/levi-api";
import type { ActivityView } from "./ActivityBar";
import { Icon } from "./Icon";

type SidebarProps = {
  status: OllamaStatus;
  selectedProject: SelectedProject | null;
  workspaceStatus: WorkspaceStatus;
  activeView: ActivityView;
  onOpenProject: () => void;
  onRefreshWorkspace: () => void;
  onNewChat: () => void;
  onOpenRules: () => void;
  onOpenSettings: () => void;
};

function getWorkspaceStatusLabel(status: WorkspaceStatus): string {
  if (status.state === "scanning") return "Scanning project...";
  if (status.state === "ready") return "Workspace ready";
  if (status.state === "refresh-required") return "Refresh required";
  if (status.state === "failed") return "Scan failed";
  return "No workspace scan";
}

export function Sidebar({
  status,
  selectedProject,
  workspaceStatus,
  activeView,
  onOpenProject,
  onRefreshWorkspace,
  onNewChat,
  onOpenRules,
  onOpenSettings
}: SidebarProps) {
  return (
    <aside className="levi-sidebar">
      <div className="levi-brand">
        <div className="levi-brand-mark" aria-hidden="true">
          L
        </div>
        <div>
          <div className="levi-brand-name">Levi</div>
          <div className="levi-brand-subtitle">Local IDE</div>
        </div>
      </div>

      <div className="levi-ai-status" aria-live="polite">
        <span className={status.ready ? "levi-status-dot levi-status-dot-ready" : "levi-status-dot"} />
        <div>
          <div className="levi-status-label">{status.ready ? "Local AI Ready" : "Local AI Offline"}</div>
          <div className="levi-status-count">
            {status.modelCount === 1 ? "1 model available" : `${status.modelCount} models available`}
          </div>
        </div>
      </div>

      <nav className="levi-nav" aria-label="Primary">
        <button type="button" className={activeView === "home" ? "levi-nav-item levi-nav-item-active" : "levi-nav-item"} onClick={onNewChat}>
          <Icon name="chat" />
          <span>New Chat</span>
        </button>
        <button type="button" className="levi-nav-item" onClick={onOpenProject} title="Open Project Folder">
          <Icon name="folder" />
          <span>Projects</span>
        </button>
        <button type="button" className="levi-nav-item">
          <Icon name="history" />
          <span>History</span>
        </button>
        <button
          type="button"
          className={activeView === "settings" ? "levi-nav-item levi-nav-item-active" : "levi-nav-item"}
          onClick={onOpenSettings}
        >
          <Icon name="settings" />
          <span>Settings</span>
        </button>
      </nav>

      {selectedProject ? (
        <div className="levi-project-chip" title={selectedProject.path}>
          <span className="levi-project-label">Project</span>
          <span className="levi-project-name">{selectedProject.name}</span>
          <span className="levi-workspace-status">{getWorkspaceStatusLabel(workspaceStatus)}</span>
          <button
            type="button"
            className="levi-button levi-button-secondary levi-button-full"
            onClick={onRefreshWorkspace}
            disabled={workspaceStatus.state === "scanning"}
          >
            <Icon name="refresh" />
            <span>Refresh Workspace</span>
          </button>
          <button type="button" className="levi-button levi-button-secondary levi-button-full" onClick={onOpenRules}>
            <Icon name="layers" />
            <span>Project Rules</span>
          </button>
        </div>
      ) : null}
    </aside>
  );
}
