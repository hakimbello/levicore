import type { OllamaStatus, SelectedProject, WorkspaceStatus } from "../types/levi-api";
import type { ActivityView } from "./ActivityBar";
import { Icon } from "./Icon";

type SidebarProps = {
  status: OllamaStatus;
  selectedProject: SelectedProject | null;
  workspaceStatus: WorkspaceStatus;
  activeView: ActivityView;
  onOpenProject: () => void;
  onNewChat: () => void;
  onOpenHistory: () => void;
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
  onNewChat,
  onOpenHistory,
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

      <details className="levi-ai-status levi-ai-status-compact" aria-live="polite">
        <summary>
          <span className={status.ready ? "levi-status-dot levi-status-dot-ready" : "levi-status-dot"} />
          <span>{status.ready ? "Local AI" : "Local AI"}</span>
        </summary>
        <div className="levi-ai-status-popover">
          <div className="levi-status-label">{status.ready ? "Ready" : "Offline"}</div>
          <div className="levi-status-count">
            {status.modelCount === 1 ? "1 model available" : `${status.modelCount} models available`}
          </div>
        </div>
      </details>

      <nav className="levi-nav" aria-label="Primary">
        <button type="button" className={activeView === "home" ? "levi-nav-item levi-nav-item-active" : "levi-nav-item"} onClick={onNewChat}>
          <Icon name="chat" />
          <span>New Chat</span>
        </button>
        <button type="button" className="levi-nav-item" onClick={onOpenProject} title="Open Project Folder">
          <Icon name="folder" />
          <span>Projects</span>
        </button>
        <button
          type="button"
          className={activeView === "history" ? "levi-nav-item levi-nav-item-active" : "levi-nav-item"}
          onClick={onOpenHistory}
        >
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
        <div className="levi-recent-projects" aria-label="Recent projects">
          <span>Recent</span>
          <button type="button" title={selectedProject.path} onClick={onOpenProject}>
            <strong>{selectedProject.name}</strong>
            <small>{getWorkspaceStatusLabel(workspaceStatus)}</small>
          </button>
        </div>
      ) : null}
    </aside>
  );
}
