import type { OllamaStatus, SelectedProject, UpdateStatus, WorkspaceStatus } from "../../types/levi-api";
import { settingsSectionTitle } from "./settings-copy";

type SettingsPanelProps = {
  status: OllamaStatus;
  selectedProject: SelectedProject | null;
  workspaceStatus: WorkspaceStatus;
  updateStatus: UpdateStatus;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  onInstallDownloadedUpdate: () => void;
};

function workspaceLabel(status: WorkspaceStatus): string {
  if (status.state === "scanning") return "Scanning";
  if (status.state === "ready") return "Ready";
  if (status.state === "refresh-required") return "Refresh required";
  if (status.state === "failed") return status.error ?? "Scan failed";
  return "No workspace scan";
}

function updateLabel(status: UpdateStatus): string {
  if (status.state === "checking") return "Checking";
  if (status.state === "update-available") return "Update available";
  if (status.state === "update-not-available") return "Up to date";
  if (status.state === "downloading") return "Downloading";
  if (status.state === "downloaded") return "Downloaded";
  if (status.state === "error") return "Update error";
  return "Idle";
}

function updateDetail(status: UpdateStatus): string {
  if (status.error) return status.error;
  if (typeof status.progressPercent === "number") return `${status.progressPercent}% downloaded`;
  if (status.availableVersion) return `Version ${status.availableVersion} is available.`;
  return status.message ?? "Manual update checks only. Levi will not restart or install without approval.";
}

export function SettingsPanel({
  status,
  selectedProject,
  workspaceStatus,
  updateStatus,
  onCheckForUpdates,
  onDownloadUpdate,
  onInstallDownloadedUpdate
}: SettingsPanelProps) {
  return (
    <section className="levi-settings-panel" aria-label="Settings">
      <header className="levi-settings-header">
        <div>
          <div className="levi-settings-kicker">Diagnostics</div>
          <h1>{settingsSectionTitle}</h1>
          <p>Local readiness and workspace status for this Levi window.</p>
        </div>
      </header>

      <div className="levi-settings-grid" aria-label="Settings diagnostics">
        <section className="levi-settings-group" aria-label="Provider diagnostics">
          <h2>Provider Diagnostics</h2>
          <div className="levi-settings-row">
            <span>Local AI</span>
            <strong>{status.ready ? "Ready" : "Offline"}</strong>
          </div>
          <div className="levi-settings-row">
            <span>Available models</span>
            <strong>{status.modelCount}</strong>
          </div>
          <div className="levi-settings-detail">{status.models.length ? status.models.join(", ") : "No local models detected."}</div>
        </section>

        <section className="levi-settings-group" aria-label="Workspace diagnostics">
          <h2>Workspace Diagnostics</h2>
          <div className="levi-settings-row">
            <span>Project</span>
            <strong>{selectedProject?.name ?? "No project open"}</strong>
          </div>
          <div className="levi-settings-row">
            <span>Workspace scan</span>
            <strong>{workspaceLabel(workspaceStatus)}</strong>
          </div>
          <div className="levi-settings-detail">{selectedProject?.path ?? "Open a project to enable workspace-aware chat, planning, and execution."}</div>
        </section>

        <section className="levi-settings-group" aria-label="Update diagnostics">
          <h2>Updates</h2>
          <div className="levi-settings-row">
            <span>Current version</span>
            <strong>{updateStatus.currentVersion}</strong>
          </div>
          <div className="levi-settings-row">
            <span>Status</span>
            <strong>{updateLabel(updateStatus)}</strong>
          </div>
          <div className="levi-settings-detail">{updateDetail(updateStatus)}</div>
          <div className="levi-settings-actions">
            <button
              type="button"
              className="levi-button levi-button-secondary"
              onClick={onCheckForUpdates}
              disabled={updateStatus.state === "checking" || updateStatus.state === "downloading"}
            >
              Check for Updates
            </button>
            {updateStatus.state === "update-available" ? (
              <button type="button" className="levi-button levi-button-secondary" onClick={onDownloadUpdate}>
                Download Update
              </button>
            ) : null}
            {updateStatus.state === "downloaded" ? (
              <button type="button" className="levi-apply-button" onClick={onInstallDownloadedUpdate}>
                Install Update
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}
