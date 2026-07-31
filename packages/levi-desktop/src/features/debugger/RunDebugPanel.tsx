import { FormEvent, useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import type { DebugLaunchConfiguration, DebugSetBreakpointRequest, DebugState } from "./DebugEvents";

type RunDebugPanelProps = {
  state: DebugState;
  workspaceAvailable: boolean;
  onStart: (configuration: DebugLaunchConfiguration) => Promise<void>;
  onSetBreakpoint: (request: DebugSetBreakpointRequest) => Promise<void>;
  onRemoveBreakpoint: (breakpointId: string) => Promise<void>;
  onAddWatch: (expression: string) => Promise<void>;
  onRemoveWatch: (id: string) => Promise<void>;
};

function defaultLaunchConfiguration(): DebugLaunchConfiguration {
  return {
    type: "node",
    request: "launch",
    name: "Launch",
    program: "",
    stopOnEntry: false,
    console: "internalConsole"
  };
}

export function RunDebugPanel({
  state,
  workspaceAvailable,
  onStart,
  onSetBreakpoint,
  onRemoveBreakpoint,
  onAddWatch,
  onRemoveWatch
}: RunDebugPanelProps) {
  const [configuration, setConfiguration] = useState<DebugLaunchConfiguration>(
    state.lastLaunchConfiguration ?? defaultLaunchConfiguration()
  );
  const [breakpointPath, setBreakpointPath] = useState("");
  const [breakpointLine, setBreakpointLine] = useState("1");
  const [condition, setCondition] = useState("");
  const [logMessage, setLogMessage] = useState("");
  const [watchExpression, setWatchExpression] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (state.lastLaunchConfiguration) {
      setConfiguration(state.lastLaunchConfiguration);
    }
  }, [state.lastLaunchConfiguration]);

  async function startDebugging(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    try {
      await onStart({
        ...configuration,
        program: configuration.program?.trim() || undefined,
        cwd: configuration.cwd?.trim() || undefined,
        args: configuration.args?.filter(Boolean)
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Debug launch failed.");
    }
  }

  async function toggleBreakpoint(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    const line = Number(breakpointLine);
    try {
      await onSetBreakpoint({
        relativePath: breakpointPath,
        line,
        condition: condition.trim() || undefined,
        logMessage: logMessage.trim() || undefined,
        toggle: true
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Breakpoint update failed.");
    }
  }

  async function addWatch(event: FormEvent) {
    event.preventDefault();
    const expression = watchExpression.trim();
    if (!expression) return;
    await onAddWatch(expression);
    setWatchExpression("");
  }

  return (
    <section className="levi-debug-panel" aria-label="Run and Debug">
      <header className="levi-debug-header">
        <div>
          <div className="levi-debug-kicker">Run and Debug</div>
          <h1>Debug</h1>
          <p>{state.error?.message ?? "Start and manage language-agnostic DAP sessions from this workspace."}</p>
        </div>
        <span className={`levi-debug-badge levi-debug-state-${state.state.toLowerCase()}`}>{state.state}</span>
      </header>

      <div className="levi-debug-grid">
        <section className="levi-debug-section" aria-label="Launch configuration">
          <h2>Configuration</h2>
          <form className="levi-debug-form" onSubmit={(event) => void startDebugging(event)}>
            <label>
              <span>Name</span>
              <input value={configuration.name} onChange={(event) => setConfiguration({ ...configuration, name: event.target.value })} />
            </label>
            <label>
              <span>Type</span>
              <input value={configuration.type} onChange={(event) => setConfiguration({ ...configuration, type: event.target.value })} />
            </label>
            <label>
              <span>Request</span>
              <select
                value={configuration.request}
                onChange={(event) => setConfiguration({ ...configuration, request: event.target.value === "attach" ? "attach" : "launch" })}
              >
                <option value="launch">Launch</option>
                <option value="attach">Attach</option>
              </select>
            </label>
            <label>
              <span>Program</span>
              <input
                value={configuration.program ?? ""}
                onChange={(event) => setConfiguration({ ...configuration, program: event.target.value })}
                placeholder="src/index.js"
              />
            </label>
            <label>
              <span>Args</span>
              <input
                value={configuration.args?.join(" ") ?? ""}
                onChange={(event) => setConfiguration({ ...configuration, args: event.target.value.split(/\s+/).filter(Boolean) })}
              />
            </label>
            <label className="levi-debug-checkbox">
              <input
                type="checkbox"
                checked={Boolean(configuration.stopOnEntry)}
                onChange={(event) => setConfiguration({ ...configuration, stopOnEntry: event.target.checked })}
              />
              <span>Stop on entry</span>
            </label>
            <button type="submit" className="levi-apply-button" disabled={!workspaceAvailable || state.state === "Starting" || state.state === "Stopping"}>
              <Icon name="debug" />
              <span>Start Debugging</span>
            </button>
          </form>
          {localError ? <div className="levi-edit-error" role="alert">{localError}</div> : null}
        </section>

        <section className="levi-debug-section" aria-label="Breakpoints">
          <h2>Breakpoints</h2>
          <form className="levi-debug-form" onSubmit={(event) => void toggleBreakpoint(event)}>
            <label>
              <span>Path</span>
              <input value={breakpointPath} onChange={(event) => setBreakpointPath(event.target.value)} placeholder="src/main.ts" />
            </label>
            <label>
              <span>Line</span>
              <input value={breakpointLine} onChange={(event) => setBreakpointLine(event.target.value)} inputMode="numeric" />
            </label>
            <label>
              <span>Condition</span>
              <input value={condition} onChange={(event) => setCondition(event.target.value)} />
            </label>
            <label>
              <span>Logpoint</span>
              <input value={logMessage} onChange={(event) => setLogMessage(event.target.value)} />
            </label>
            <button type="submit" className="levi-button levi-button-secondary" disabled={!workspaceAvailable}>
              <Icon name="plus" />
              <span>Toggle Breakpoint</span>
            </button>
          </form>
          <div className="levi-debug-list">
            {state.breakpoints.length === 0 ? <p className="levi-debug-empty">No breakpoints set.</p> : null}
            {state.breakpoints.map((breakpoint) => (
              <div key={breakpoint.id} className="levi-debug-row">
                <button
                  type="button"
                  className={breakpoint.enabled ? "levi-debug-toggle levi-debug-toggle-on" : "levi-debug-toggle"}
                  onClick={() =>
                    void onSetBreakpoint({
                      relativePath: breakpoint.relativePath,
                      line: breakpoint.line,
                      column: breakpoint.column,
                      enabled: !breakpoint.enabled,
                      condition: breakpoint.condition,
                      logMessage: breakpoint.logMessage,
                      hitCondition: breakpoint.hitCondition
                    })
                  }
                  aria-label={`${breakpoint.enabled ? "Disable" : "Enable"} breakpoint ${breakpoint.relativePath}:${breakpoint.line}`}
                />
                <div>
                  <strong>{breakpoint.relativePath}:{breakpoint.line}</strong>
                  <span>{breakpoint.condition ? `if ${breakpoint.condition}` : breakpoint.logMessage ? `log ${breakpoint.logMessage}` : breakpoint.verified === false ? breakpoint.message ?? "Unverified" : "Enabled"}</span>
                </div>
                <button type="button" className="levi-icon-button" onClick={() => void onRemoveBreakpoint(breakpoint.id)} aria-label={`Remove breakpoint ${breakpoint.relativePath}:${breakpoint.line}`}>
                  <Icon name="close" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="levi-debug-section" aria-label="Variables">
          <h2>Variables</h2>
          {state.variables.length === 0 ? <p className="levi-debug-empty">Variables will appear when execution pauses.</p> : null}
          {state.variables.map((scope) => (
            <div key={scope.variablesReference} className="levi-debug-scope">
              <strong>{scope.name}</strong>
              {scope.variables.map((variable) => (
                <span key={`${scope.variablesReference}-${variable.name}`}>{variable.name}: {variable.value}</span>
              ))}
            </div>
          ))}
        </section>

        <section className="levi-debug-section" aria-label="Watch">
          <h2>Watch</h2>
          <form className="levi-debug-inline-form" onSubmit={(event) => void addWatch(event)}>
            <input value={watchExpression} onChange={(event) => setWatchExpression(event.target.value)} placeholder="expression" />
            <button type="submit" className="levi-icon-button" aria-label="Add Watch">
              <Icon name="plus" />
            </button>
          </form>
          <div className="levi-debug-list">
            {state.watches.length === 0 ? <p className="levi-debug-empty">No watch expressions.</p> : null}
            {state.watches.map((watch) => (
              <div key={watch.id} className="levi-debug-row">
                <div>
                  <strong>{watch.expression}</strong>
                  <span>{watch.error ?? watch.value ?? "Not evaluated"}</span>
                </div>
                <button type="button" className="levi-icon-button" onClick={() => void onRemoveWatch(watch.id)} aria-label={`Remove watch ${watch.expression}`}>
                  <Icon name="close" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="levi-debug-section" aria-label="Call Stack">
          <h2>Call Stack</h2>
          {state.callStack.length === 0 ? <p className="levi-debug-empty">Call stack will appear when execution pauses.</p> : null}
          {state.callStack.map((thread) => (
            <div key={thread.id} className="levi-debug-scope">
              <strong>{thread.name}</strong>
              {thread.frames.map((frame) => (
                <span key={frame.id}>{frame.name}{frame.relativePath ? ` - ${frame.relativePath}:${frame.line ?? 1}` : ""}</span>
              ))}
            </div>
          ))}
        </section>

        <section className="levi-debug-section levi-debug-console" aria-label="Debug Console">
          <h2>Debug Console</h2>
          {state.console.length === 0 ? <p className="levi-debug-empty">Adapter output and debug console messages will appear here.</p> : null}
          {state.console.map((entry) => (
            <pre key={entry.id} className={`levi-debug-console-entry levi-debug-console-${entry.category}`}>{entry.output}</pre>
          ))}
        </section>
      </div>
    </section>
  );
}
