import { FormEvent, KeyboardEvent, useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { Icon } from "../../components/Icon";
import type { DebugLaunchConfiguration, DebugSetBreakpointRequest, DebugStackFrame, DebugState, DebugVariable, DebugExceptionBreakpoint } from "./DebugEvents";
import { MAX_VARIABLE_TREE_RENDER } from "./variableLimits";

type RunDebugPanelProps = {
  state: DebugState;
  workspaceAvailable: boolean;
  onStart: (configuration: DebugLaunchConfiguration) => Promise<void>;
  onSetBreakpoint: (request: DebugSetBreakpointRequest) => Promise<void>;
  onRemoveBreakpoint: (breakpointId: string) => Promise<void>;
  onEditBreakpoint: (breakpointId: string, request: DebugSetBreakpointRequest) => Promise<void>;
  onAddWatch: (expression: string) => Promise<void>;
  onUpdateWatch: (id: string, expression: string) => Promise<void>;
  onRemoveWatch: (id: string) => Promise<void>;
  onLoadVariables: (variablesReference: number) => Promise<void>;
  onEvaluate: (expression: string) => Promise<void>;
  onClearConsole: () => Promise<void>;
  onSelectConfiguration: (name: string) => Promise<void>;
  onCreateLaunchConfig: () => Promise<void>;
  onOpenFrame: (threadId: number, frame: DebugStackFrame) => Promise<void>;
  onSetExceptionBreakpoints: (breakpoints: DebugExceptionBreakpoint[]) => Promise<void>;
  onRefreshLoadedSources: () => Promise<void>;
  onOpenSource: (relativePath: string) => Promise<void>;
  onContinueFromException: () => Promise<void>;
  onGetCompletions: (text: string, column: number) => Promise<Array<{ label: string; insertText?: string }>>;
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
  onUpdateWatch,
  onRemoveWatch,
  onLoadVariables,
  onEvaluate,
  onClearConsole,
  onSelectConfiguration,
  onCreateLaunchConfig,
  onOpenFrame,
  onEditBreakpoint,
  onSetExceptionBreakpoints,
  onRefreshLoadedSources,
  onOpenSource,
  onContinueFromException,
  onGetCompletions
}: RunDebugPanelProps) {
  const [configuration, setConfiguration] = useState<DebugLaunchConfiguration>(
    state.lastLaunchConfiguration ?? defaultLaunchConfiguration()
  );
  const [breakpointPath, setBreakpointPath] = useState("");
  const [breakpointLine, setBreakpointLine] = useState("1");
  const [condition, setCondition] = useState("");
  const [logMessage, setLogMessage] = useState("");
  const [hitCondition, setHitCondition] = useState("");
  const [watchExpression, setWatchExpression] = useState("");
  const [editingWatchId, setEditingWatchId] = useState<string | null>(null);
  const [editingWatchExpression, setEditingWatchExpression] = useState("");
  const [consoleExpression, setConsoleExpression] = useState("");
  const [consoleHistory, setConsoleHistory] = useState<string[]>([]);
  const [consoleHistoryIndex, setConsoleHistoryIndex] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [editingBreakpointId, setEditingBreakpointId] = useState<string | null>(null);
  const [editBpCondition, setEditBpCondition] = useState("");
  const [editBpHitCondition, setEditBpHitCondition] = useState("");
  const [editBpLogMessage, setEditBpLogMessage] = useState("");
  const [completionItems, setCompletionItems] = useState<Array<{ label: string; insertText?: string }>>([]);
  const [variableRenderLimit, setVariableRenderLimit] = useState(MAX_VARIABLE_TREE_RENDER);

  useEffect(() => {
    if (state.lastLaunchConfiguration) {
      setConfiguration(state.lastLaunchConfiguration);
    }
  }, [state.lastLaunchConfiguration]);

  useEffect(() => {
    const selected = state.launchConfigurations.find((entry) => entry.name === state.selectedLaunchConfigurationName);
    if (selected) setConfiguration(selected.configuration);
  }, [state.launchConfigurations, state.selectedLaunchConfigurationName]);

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

  async function selectConfiguration(name: string) {
    const selected = state.launchConfigurations.find((entry) => entry.name === name);
    if (selected) setConfiguration(selected.configuration);
    await onSelectConfiguration(name);
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
        hitCondition: hitCondition.trim() || undefined,
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

  async function submitWatchEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingWatchId || !editingWatchExpression.trim()) return;
    await onUpdateWatch(editingWatchId, editingWatchExpression.trim());
    setEditingWatchId(null);
    setEditingWatchExpression("");
  }

  async function evaluateConsole(event: FormEvent) {
    event.preventDefault();
    const expression = consoleExpression.trim();
    if (!expression) return;
    setConsoleHistory((history) => [expression, ...history.filter((item) => item !== expression)].slice(0, 50));
    setConsoleHistoryIndex(null);
    await onEvaluate(expression);
    setConsoleExpression("");
  }

  function navigateConsoleHistory(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (consoleHistory.length === 0) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (event.key === "ArrowUp" && event.currentTarget.selectionStart === 0) {
      event.preventDefault();
      const nextIndex = Math.min((consoleHistoryIndex ?? -1) + 1, consoleHistory.length - 1);
      setConsoleHistoryIndex(nextIndex);
      setConsoleExpression(consoleHistory[nextIndex] ?? "");
    }
    if (event.key === "ArrowDown" && event.currentTarget.selectionStart === event.currentTarget.value.length) {
      event.preventDefault();
      const nextIndex = Math.max((consoleHistoryIndex ?? 0) - 1, -1);
      setConsoleHistoryIndex(nextIndex === -1 ? null : nextIndex);
      setConsoleExpression(nextIndex === -1 ? "" : consoleHistory[nextIndex] ?? "");
    }
  }

  async function handleConsoleInput(event: ChangeEvent<HTMLTextAreaElement>) {
    const next = event.target.value;
    setConsoleExpression(next);
    setConsoleHistoryIndex(null);
    const lastLine = next.split("\n").pop() ?? "";
    if (lastLine.trim().length > 1 && state.state === "Paused") {
      const items = await onGetCompletions(lastLine, lastLine.length);
      setCompletionItems(items);
    } else {
      setCompletionItems([]);
    }
  }

  function copyConsoleOutput(output: string) {
    void navigator.clipboard.writeText(output);
  }

  function copyExceptionDetails() {
    const info = state.exceptionInfo;
    if (!info) return;
    const text = [info.type, info.message, info.stackTrace, info.module ? `Module: ${info.module}` : ""].filter(Boolean).join("\n");
    void navigator.clipboard.writeText(text);
  }

  function copyEvaluationResult() {
    const result = state.lastEvaluation;
    if (!result) return;
    void navigator.clipboard.writeText(result.error ? result.error : `${result.result}${result.type ? ` (${result.type})` : ""}`);
  }

  function startEditBreakpoint(breakpointId: string) {
    const breakpoint = state.breakpoints.find((item) => item.id === breakpointId);
    if (!breakpoint) return;
    setEditingBreakpointId(breakpointId);
    setEditBpCondition(breakpoint.condition ?? "");
    setEditBpHitCondition(breakpoint.hitCondition ?? "");
    setEditBpLogMessage(breakpoint.logMessage ?? "");
  }

  async function submitBreakpointEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingBreakpointId) return;
    const breakpoint = state.breakpoints.find((item) => item.id === editingBreakpointId);
    if (!breakpoint) return;
    await onEditBreakpoint(editingBreakpointId, {
      relativePath: breakpoint.relativePath,
      line: breakpoint.line,
      column: breakpoint.column,
      enabled: breakpoint.enabled,
      condition: editBpCondition.trim() || undefined,
      hitCondition: editBpHitCondition.trim() || undefined,
      logMessage: editBpLogMessage.trim() || undefined
    });
    setEditingBreakpointId(null);
  }

  function renderVariables(variables: DebugVariable[], depth = 0, renderedCount = { value: 0 }): ReactNode {
    const nodes: React.ReactNode[] = [];
    for (const variable of variables) {
      if (renderedCount.value >= variableRenderLimit) {
        nodes.push(
          <button key={`more-${depth}`} type="button" className="levi-debug-show-more" onClick={() => setVariableRenderLimit((limit) => limit + MAX_VARIABLE_TREE_RENDER)}>
            Show more variables…
          </button>
        );
        return nodes;
      }
      renderedCount.value += 1;
      const expandable = Boolean(variable.variablesReference && variable.variablesReference > 0);
      nodes.push(
        <div key={`${depth}-${variable.name}-${variable.evaluateName ?? variable.variablesReference ?? ""}`} className="levi-debug-variable" style={{ paddingLeft: depth * 14 }}>
          <button
            type="button"
            className="levi-debug-expand"
            disabled={!expandable}
            aria-label={`Expand variable ${variable.name}`}
            onClick={() => variable.variablesReference ? void onLoadVariables(variable.variablesReference) : undefined}
          >
            {expandable ? variable.expanded ? "v" : ">" : ""}
          </button>
          <span>
            <strong>{variable.name}</strong>: {variable.value}
            {variable.type ? ` (${variable.type})` : ""}
            {variable.truncated ? " …" : ""}
            {variable.hasMoreChildren ? " [lazy]" : ""}
          </span>
          {variable.evaluateName ? (
            <button type="button" className="levi-debug-evaluate-name" onClick={() => void onEvaluate(variable.evaluateName ?? variable.name)} aria-label={`Evaluate ${variable.name}`}>
              ⧉
            </button>
          ) : null}
          {variable.children?.length ? <div className="levi-debug-variable-children">{renderVariables(variable.children, depth + 1, renderedCount)}</div> : null}
        </div>
      );
    }
    return nodes;
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

      {state.exceptionInfo ? (
        <section className="levi-debug-exception-panel" aria-label="Exception details">
          <div className="levi-debug-section-header">
            <h2>Exception</h2>
            <div className="levi-debug-inline-actions">
              <button type="button" className="levi-button levi-button-secondary" onClick={() => void onContinueFromException()}>
                Continue
              </button>
              <button type="button" className="levi-button levi-button-secondary" onClick={copyExceptionDetails}>
                Copy Exception
              </button>
            </div>
          </div>
          <div className="levi-debug-exception-body">
            <strong>{state.exceptionInfo.type ?? "Exception"}</strong>
            <p>{state.exceptionInfo.message ?? state.exceptionInfo.description}</p>
            {state.exceptionInfo.module ? <small>Module: {state.exceptionInfo.module}</small> : null}
            {state.exceptionInfo.threadId ? <small>Thread: {state.exceptionInfo.threadId}</small> : null}
            {state.exceptionInfo.relativePath ? (
              <small>
                {state.exceptionInfo.relativePath}:{state.exceptionInfo.line ?? 1}
              </small>
            ) : null}
            {state.exceptionInfo.stackTrace ? <pre className="levi-debug-exception-stack">{state.exceptionInfo.stackTrace}</pre> : null}
          </div>
        </section>
      ) : null}

      <div className="levi-debug-grid">
        <section className="levi-debug-section" aria-label="Launch configuration">
          <h2>Configuration</h2>
          <div className="levi-debug-config-picker">
            <label>
              <span>Configuration</span>
              <select
                value={state.selectedLaunchConfigurationName ?? configuration.name}
                onChange={(event) => void selectConfiguration(event.target.value)}
                disabled={state.launchConfigurations.length === 0}
              >
                {state.launchConfigurations.map((entry) => (
                  <option key={entry.id} value={entry.name}>{entry.name}</option>
                ))}
              </select>
            </label>
            <button type="button" className="levi-button levi-button-secondary" onClick={() => void onCreateLaunchConfig()} disabled={!workspaceAvailable}>
              <Icon name="plus" />
              <span>Create launch.json</span>
            </button>
          </div>
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
            <label>
              <span>Hit count</span>
              <input value={hitCondition} onChange={(event) => setHitCondition(event.target.value)} placeholder=">= 5" />
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
                {editingBreakpointId === breakpoint.id ? (
                  <form className="levi-debug-inline-form levi-debug-breakpoint-edit" onSubmit={(event) => void submitBreakpointEdit(event)}>
                    <input aria-label="Condition" value={editBpCondition} onChange={(event) => setEditBpCondition(event.target.value)} placeholder="Condition" />
                    <input aria-label="Hit count" value={editBpHitCondition} onChange={(event) => setEditBpHitCondition(event.target.value)} placeholder="Hit count" />
                    <input aria-label="Log message" value={editBpLogMessage} onChange={(event) => setEditBpLogMessage(event.target.value)} placeholder="Log message" />
                    <button type="submit" className="levi-icon-button" aria-label="Save breakpoint"><Icon name="refresh" /></button>
                    <button type="button" className="levi-icon-button" onClick={() => setEditingBreakpointId(null)} aria-label="Cancel edit"><Icon name="close" /></button>
                  </form>
                ) : (
                  <div>
                    <strong>{breakpoint.relativePath}:{breakpoint.line}</strong>
                    <span>
                      {breakpoint.condition ? `if ${breakpoint.condition}` : breakpoint.logMessage ? `log ${breakpoint.logMessage}` : breakpoint.hitCondition ? `hit ${breakpoint.hitCondition}` : breakpoint.verified === false ? breakpoint.message ?? "Unverified" : "Enabled"}
                    </span>
                  </div>
                )}
                <button type="button" className="levi-icon-button" onClick={() => startEditBreakpoint(breakpoint.id)} aria-label={`Edit breakpoint ${breakpoint.relativePath}:${breakpoint.line}`}>
                  <Icon name="settings" />
                </button>
                <button type="button" className="levi-icon-button" onClick={() => void onRemoveBreakpoint(breakpoint.id)} aria-label={`Remove breakpoint ${breakpoint.relativePath}:${breakpoint.line}`}>
                  <Icon name="close" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="levi-debug-section" aria-label="Exception breakpoints">
          <h2>Exception Breakpoints</h2>
          <div className="levi-debug-list">
            {state.exceptionBreakpoints.map((breakpoint) => (
              <label key={breakpoint.filter} className="levi-debug-checkbox levi-debug-exception-toggle">
                <input
                  type="checkbox"
                  checked={breakpoint.enabled}
                  onChange={(event) => {
                    const next = state.exceptionBreakpoints.map((item) =>
                      item.filter === breakpoint.filter ? { ...item, enabled: event.target.checked } : item
                    );
                    void onSetExceptionBreakpoints(next);
                  }}
                />
                <span>{breakpoint.label}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="levi-debug-section" aria-label="Variables">
          <h2>Variables</h2>
          {state.variables.length === 0 ? <p className="levi-debug-empty">Variables will appear when execution pauses.</p> : null}
          {state.variables.map((scope) => (
            <div key={scope.variablesReference} className="levi-debug-scope">
              <button
                type="button"
                className="levi-debug-scope-header"
                onClick={() => void onLoadVariables(scope.variablesReference)}
                disabled={scope.variablesReference <= 0}
              >
                <strong>{scope.name}</strong>
                <span>{scope.expensive ? "lazy" : `${scope.variables.length} values`}</span>
              </button>
              {renderVariables(scope.variables)}
            </div>
          ))}
          {state.lastEvaluation ? (
            <div className="levi-debug-evaluation-result">
              <strong>Last evaluation</strong>
              <span>{state.lastEvaluation.error ?? `${state.lastEvaluation.result}${state.lastEvaluation.type ? ` (${state.lastEvaluation.type})` : ""}`}</span>
              <button type="button" className="levi-button levi-button-secondary" onClick={copyEvaluationResult}>
                Copy
              </button>
            </div>
          ) : null}
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
                {editingWatchId === watch.id ? (
                  <form className="levi-debug-inline-form" onSubmit={(event) => void submitWatchEdit(event)}>
                    <input aria-label={`Edit watch ${watch.expression}`} value={editingWatchExpression} onChange={(event) => setEditingWatchExpression(event.target.value)} />
                    <button type="submit" className="levi-icon-button" aria-label="Save Watch"><Icon name="refresh" /></button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className="levi-debug-watch-value"
                    onClick={() => {
                      setEditingWatchId(watch.id);
                      setEditingWatchExpression(watch.expression);
                    }}
                  >
                    <strong>{watch.expression}</strong>
                    <span>{watch.error ?? watch.value ?? "Not evaluated"}</span>
                  </button>
                )}
                <button type="button" className="levi-icon-button" onClick={() => void onRemoveWatch(watch.id)} aria-label={`Remove watch ${watch.expression}`}>
                  <Icon name="close" />
                </button>
                <button type="button" className="levi-icon-button" onClick={() => void onUpdateWatch(watch.id, watch.expression)} aria-label={`Refresh watch ${watch.expression}`}>
                  <Icon name="refresh" />
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
                <button
                  type="button"
                  key={frame.id}
                  className={state.activeStackFrame?.id === frame.id ? "levi-debug-frame levi-debug-frame-active" : "levi-debug-frame"}
                  onDoubleClick={() => void onOpenFrame(thread.id, frame)}
                  onClick={() => void onOpenFrame(thread.id, frame)}
                >
                  <span>{frame.name}</span>
                  <small>{frame.relativePath ? `${frame.relativePath}:${frame.line ?? 1}` : frame.sourceName ?? ""}</small>
                </button>
              ))}
            </div>
          ))}
        </section>

        <section className="levi-debug-section" aria-label="Loaded Sources">
          <div className="levi-debug-section-header">
            <h2>Loaded Sources</h2>
            <button type="button" className="levi-button levi-button-secondary" onClick={() => void onRefreshLoadedSources()}>
              <Icon name="refresh" />
              <span>Refresh</span>
            </button>
          </div>
          {state.loadedSources.length === 0 ? <p className="levi-debug-empty">Loaded sources appear after the debug session starts.</p> : null}
          <div className="levi-debug-list">
            {state.loadedSources.map((source, index) => (
              <div key={`${source.relativePath ?? source.name ?? index}`} className="levi-debug-row">
                <div>
                  <strong>{source.name ?? source.relativePath ?? "Unknown source"}</strong>
                  {source.relativePath ? <span>{source.relativePath}</span> : <span>Disassembly / external source</span>}
                </div>
                {source.relativePath ? (
                  <button type="button" className="levi-icon-button" onClick={() => void onOpenSource(source.relativePath!)} aria-label={`Open ${source.relativePath}`}>
                    <Icon name="files" />
                  </button>
                ) : (
                  <button type="button" className="levi-icon-button" disabled aria-label="Disassembly view unavailable">
                    <Icon name="files" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="levi-debug-section levi-debug-console" aria-label="Debug Console">
          <div className="levi-debug-section-header">
            <h2>Debug Console</h2>
            <div className="levi-debug-inline-actions">
              {state.lastEvaluation ? (
                <button type="button" className="levi-button levi-button-secondary" onClick={copyEvaluationResult}>
                  Copy Result
                </button>
              ) : null}
              <button type="button" className="levi-button levi-button-secondary" onClick={() => void onClearConsole()}>
                <Icon name="close" />
                <span>Clear</span>
              </button>
            </div>
          </div>
          <form className="levi-debug-console-form" onSubmit={(event) => void evaluateConsole(event)}>
            <textarea
              className="levi-debug-console-input"
              value={consoleExpression}
              onChange={(event) => void handleConsoleInput(event)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void evaluateConsole(event);
                } else {
                  navigateConsoleHistory(event);
                }
              }}
              placeholder="Evaluate expression (Shift+Enter for newline)"
              rows={3}
            />
            <button type="submit" className="levi-icon-button" aria-label="Evaluate Expression"><Icon name="send" /></button>
          </form>
          {completionItems.length > 0 ? (
            <div className="levi-debug-completions" role="listbox" aria-label="Completions">
              {completionItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="levi-debug-completion-item"
                  onClick={() => {
                    setConsoleExpression((current) => {
                      const lines = current.split("\n");
                      const last = lines.pop() ?? "";
                      lines.push(`${last}${item.insertText ?? item.label}`);
                      return lines.join("\n");
                    });
                    setCompletionItems([]);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="levi-debug-console-output">
            {state.console.length === 0 ? <p className="levi-debug-empty">Adapter output and debug console messages will appear here.</p> : null}
            {state.console.map((entry) => (
              <div key={entry.id} className="levi-debug-console-row">
                <pre className={`levi-debug-console-entry levi-debug-console-${entry.category}`}>{entry.output}</pre>
                <button type="button" className="levi-button levi-button-secondary levi-debug-copy-output" onClick={() => copyConsoleOutput(entry.output)} aria-label="Copy console output">
                  Copy
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
