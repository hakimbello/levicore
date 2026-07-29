import type { OllamaStatus, SelectedProject, WorkspaceStatus } from "../../types/levi-api";
import { settingsSectionTitle } from "./settings-copy";

type SettingsPanelProps = {
  status: OllamaStatus;
  selectedProject: SelectedProject | null;
  workspaceStatus: WorkspaceStatus;
};

function workspaceLabel(status: WorkspaceStatus): string {
  if (status.state === "scanning") return "Scanning";
  if (status.state === "ready") return "Ready";
  if (status.state === "refresh-required") return "Refresh required";
  if (status.state === "failed") return status.error ?? "Scan failed";
  return "No workspace scan";
}

export function SettingsPanel({ status, selectedProject, workspaceStatus }: SettingsPanelProps) {
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
      </div>
    </section>
  );
}
