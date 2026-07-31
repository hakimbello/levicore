import { Icon } from "../../components/Icon";
import type { DebugState } from "./DebugEvents";

type DebugToolbarProps = {
  state: DebugState;
  onContinue: () => void;
  onPause: () => void;
  onRestart: () => void;
  onStop: () => void;
  onStepOver: () => void;
  onStepInto: () => void;
  onStepOut: () => void;
};

export function DebugToolbar({
  state,
  onContinue,
  onPause,
  onRestart,
  onStop,
  onStepOver,
  onStepInto,
  onStepOut
}: DebugToolbarProps) {
  const running = state.state === "Running";
  const paused = state.state === "Paused";
  const active = running || paused || state.state === "Starting" || state.state === "Stopping";
  const busy = state.state === "Starting" || state.state === "Stopping";

  return (
    <div className="levi-debug-toolbar" role="toolbar" aria-label="Debug toolbar">
      <div className="levi-debug-toolbar-state">
        <span className={`levi-debug-state-dot levi-debug-state-${state.state.toLowerCase()}`} />
        <span>{state.session?.name ?? "No debug session"}</span>
        <strong>{state.state}</strong>
      </div>
      <div className="levi-debug-toolbar-actions">
        <button type="button" className="levi-icon-button" onClick={onContinue} disabled={!paused || busy} aria-label="Continue" title="Continue">
          <Icon name="continue" />
        </button>
        <button type="button" className="levi-icon-button" onClick={onPause} disabled={!running || busy} aria-label="Pause" title="Pause">
          <Icon name="pause" />
        </button>
        <button type="button" className="levi-icon-button" onClick={onRestart} disabled={busy || (!active && !state.lastLaunchConfiguration)} aria-label="Restart" title="Restart">
          <Icon name="refresh" />
        </button>
        <button type="button" className="levi-icon-button" onClick={onStop} disabled={!active || busy} aria-label="Stop Debugging" title="Stop">
          <Icon name="stop" />
        </button>
        <button type="button" className="levi-icon-button" onClick={onStepOver} disabled={!paused || busy} aria-label="Step Over" title="Step Over">
          <Icon name="step-over" />
        </button>
        <button type="button" className="levi-icon-button" onClick={onStepInto} disabled={!paused || busy} aria-label="Step Into" title="Step Into">
          <Icon name="step-into" />
        </button>
        <button type="button" className="levi-icon-button" onClick={onStepOut} disabled={!paused || busy} aria-label="Step Out" title="Step Out">
          <Icon name="step-out" />
        </button>
      </div>
    </div>
  );
}
