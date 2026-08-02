import type { AIRuntimeDiagnostics, AIRuntimeProviderId, AIRuntimeState } from "./types";
import { Icon } from "../../components/Icon";

type RuntimeManagerPanelProps = {
  state: AIRuntimeState;
  onRefresh: () => Promise<void>;
  onDetect: () => Promise<void>;
  onSelectRuntime: (runtimeId: AIRuntimeProviderId) => Promise<void>;
  onSetAutomatic: () => Promise<void>;
};

function statusClass(status: string): string {
  return status === "Running" ? "levi-runtime-status-running" : status === "Error" ? "levi-runtime-status-error" : "levi-runtime-status-muted";
}

function formatBool(value: boolean): string {
  return value ? "Yes" : "No";
}

export function RuntimeManagerPanel({ state, onRefresh, onDetect, onSelectRuntime, onSetAutomatic }: RuntimeManagerPanelProps) {
  const selected = state.providers.find((provider) => provider.id === state.selectedRuntimeId);
  return (
    <section className="levi-runtime-panel" aria-label="Runtime Manager">
      <header className="levi-runtime-header">
        <div>
          <p className="levi-eyebrow">AI Runtime Manager</p>
          <h1>Runtime Manager</h1>
          <p>{selected ? `${selected.name} selected` : "Automatic runtime selection is waiting for an available provider."}</p>
        </div>
        <div className="levi-runtime-actions">
          <button type="button" className="levi-button levi-button-secondary" onClick={() => void onRefresh()}>
            <Icon name="refresh" />
            <span>Refresh</span>
          </button>
          <button type="button" className="levi-button levi-button-secondary" onClick={() => void onDetect()}>
            <Icon name="search" />
            <span>Detect</span>
          </button>
        </div>
      </header>

      <section className="levi-runtime-selection" aria-label="Runtime selection">
        <label>
          <span>Selected runtime</span>
          <select
            value={state.selectionMode === "automatic" ? "automatic" : state.selectedRuntimeId ?? "automatic"}
            onChange={(event) => {
              if (event.target.value === "automatic") void onSetAutomatic();
              else void onSelectRuntime(event.target.value as AIRuntimeProviderId);
            }}
          >
            <option value="automatic">Automatic</option>
            {state.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <div className="levi-runtime-selection-meta">
          <span>Mode: {state.selectionMode}</span>
          <span>Preferred: {state.preferredRuntimeId ?? "None"}</span>
          <span>Last model: {state.lastSelectedModelId ?? "None"}</span>
        </div>
      </section>

      <div className="levi-runtime-grid">
        {state.providers.map((provider) => (
          <section key={provider.id} className={provider.id === state.selectedRuntimeId ? "levi-runtime-card levi-runtime-card-selected" : "levi-runtime-card"}>
            <div className="levi-runtime-card-header">
              <div>
                <h2>{provider.name}</h2>
                <p>{provider.endpoint ?? "No endpoint configured"}</p>
              </div>
              <span className={`levi-runtime-status ${statusClass(provider.status)}`}>{provider.status}</span>
            </div>
            <dl className="levi-runtime-facts">
              <div><dt>Installed</dt><dd>{formatBool(provider.installed)}</dd></div>
              <div><dt>Running</dt><dd>{formatBool(provider.running)}</dd></div>
              <div><dt>Version</dt><dd>{provider.version ?? "Unknown"}</dd></div>
              <div><dt>Latency</dt><dd>{typeof provider.latencyMs === "number" ? `${provider.latencyMs} ms` : "Unknown"}</dd></div>
            </dl>
            {provider.error ? <p className="levi-runtime-error">{provider.error}</p> : null}
            <div className="levi-runtime-card-actions">
              <button type="button" className="levi-button levi-button-secondary" onClick={() => void onSelectRuntime(provider.id)}>
                <Icon name="cpu" />
                <span>Select</span>
              </button>
            </div>
            <div className="levi-runtime-models" aria-label={`${provider.name} models`}>
              <h3>Installed Models</h3>
              {provider.models.length === 0 ? <p>No models detected.</p> : null}
              {provider.models.map((model) => (
                <div key={model.id} className="levi-runtime-model">
                  <strong>{model.displayName}</strong>
                  <span>{[model.parameters, model.quantization, model.contextWindow ? `${model.contextWindow} ctx` : undefined].filter(Boolean).join(" / ") || "Capabilities unknown"}</span>
                  <small>
                    Embeddings {formatBool(model.embeddingSupport)} / Vision {formatBool(model.visionSupport)} / Tools {formatBool(model.toolSupport)}
                  </small>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="levi-runtime-diagnostics" aria-label="Provider diagnostics">
        <h2>Diagnostics</h2>
        <div className="levi-runtime-table" role="table" aria-label="Runtime diagnostics table">
          <div role="row" className="levi-runtime-table-row levi-runtime-table-head">
            <span role="columnheader">Provider</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Models</span>
            <span role="columnheader">Health</span>
          </div>
          {state.diagnostics.map((diagnostic) => (
            <DiagnosticRow key={diagnostic.providerId} diagnostic={diagnostic} />
          ))}
        </div>
      </section>
    </section>
  );
}

function DiagnosticRow({ diagnostic }: { diagnostic: AIRuntimeDiagnostics }) {
  return (
    <div role="row" className="levi-runtime-table-row">
      <span role="cell">{diagnostic.providerName}</span>
      <span role="cell">{diagnostic.health}</span>
      <span role="cell">{diagnostic.supportedModels.length}</span>
      <span role="cell">{diagnostic.error ?? diagnostic.version ?? diagnostic.endpoint ?? "No details"}</span>
    </div>
  );
}
