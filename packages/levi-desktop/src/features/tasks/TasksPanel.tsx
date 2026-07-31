import { Icon } from "../../components/Icon";
import type { TaskDefinition, TaskHistoryEntry, TaskRun } from "../../types/task-api";

type TasksPanelProps = {
  enabled: boolean;
  detected: TaskDefinition[];
  recent: TaskHistoryEntry[];
  running: TaskRun[];
  failed: TaskRun[];
  pinned: string[];
  onRunTask: (taskId: string) => Promise<void>;
  onCancelRun: (runId: string) => Promise<void>;
  onPinTask: (taskId: string, pinned: boolean) => Promise<void>;
  onRunAgain: (entry: TaskHistoryEntry | TaskRun) => Promise<void>;
  onRevealTerminal: (terminalSessionId?: string) => void;
};

function formatDuration(durationMs?: number): string {
  if (!durationMs && durationMs !== 0) return "—";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function TasksPanel({
  enabled,
  detected,
  recent,
  running,
  failed,
  pinned,
  onRunTask,
  onCancelRun,
  onPinTask,
  onRunAgain,
  onRevealTerminal
}: TasksPanelProps) {
  if (!enabled) {
    return (
      <section className="levi-tasks-panel" aria-label="Tasks">
        <p className="levi-bottom-placeholder">Open a workspace to discover tasks.</p>
      </section>
    );
  }

  const pinnedTasks = detected.filter((task) => pinned.includes(task.id));
  const unpinnedTasks = detected.filter((task) => !pinned.includes(task.id));

  return (
    <section className="levi-tasks-panel" aria-label="Tasks">
      <header className="levi-tasks-header">
        <h2>Tasks</h2>
      </header>

      {running.length > 0 ? (
        <section className="levi-tasks-section">
          <h3>Running Tasks</h3>
          <ul className="levi-tasks-list">
            {running.map((run) => (
              <li key={run.id} className="levi-tasks-item">
                <div>
                  <strong>{run.label}</strong>
                  <div className="levi-tasks-meta">{statusLabel(run.status)} · {formatDuration(run.durationMs)}</div>
                </div>
                <div className="levi-tasks-actions">
                  <button type="button" className="levi-terminal-toggle" onClick={() => onRevealTerminal(run.terminalSessionId)}>Reveal Terminal</button>
                  <button type="button" className="levi-terminal-toggle" onClick={() => void onCancelRun(run.id)}>Stop</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {failed.length > 0 ? (
        <section className="levi-tasks-section">
          <h3>Failed Tasks</h3>
          <ul className="levi-tasks-list">
            {failed.map((run) => (
              <li key={run.id} className="levi-tasks-item">
                <div>
                  <strong>{run.label}</strong>
                  <div className="levi-tasks-meta">Exit {run.exitCode ?? 1} · {formatDuration(run.durationMs)}</div>
                </div>
                <button type="button" className="levi-terminal-toggle" onClick={() => void onRunAgain(run)}>Run Again</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pinnedTasks.length > 0 ? (
        <section className="levi-tasks-section">
          <h3>Pinned Tasks</h3>
          <ul className="levi-tasks-list">
            {pinnedTasks.map((task) => (
              <li key={task.id} className="levi-tasks-item">
                <div>
                  <strong>{task.label}</strong>
                  <div className="levi-tasks-meta">{task.source} · {task.group}</div>
                </div>
                <div className="levi-tasks-actions">
                  <button type="button" className="levi-terminal-toggle" onClick={() => void onRunTask(task.id)}>Run</button>
                  <button type="button" className="levi-terminal-toggle" onClick={() => void onPinTask(task.id, false)}>Unpin</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="levi-tasks-section">
        <h3>Detected Tasks</h3>
        {unpinnedTasks.length === 0 ? <p className="levi-bottom-placeholder">No tasks detected for this workspace.</p> : null}
        <ul className="levi-tasks-list">
          {unpinnedTasks.map((task) => (
            <li key={task.id} className="levi-tasks-item">
              <div>
                <strong>{task.label}</strong>
                <div className="levi-tasks-meta">{task.source} · {task.group}</div>
              </div>
              <div className="levi-tasks-actions">
                <button type="button" className="levi-terminal-toggle" onClick={() => void onRunTask(task.id)}>
                  <Icon name="continue" />
                  <span>Run</span>
                </button>
                <button type="button" className="levi-terminal-toggle" onClick={() => void onPinTask(task.id, true)}>Pin</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {recent.length > 0 ? (
        <section className="levi-tasks-section">
          <h3>Recent Tasks</h3>
          <ul className="levi-tasks-list">
            {recent.map((entry) => (
              <li key={entry.id} className="levi-tasks-item">
                <div>
                  <strong>{entry.label}</strong>
                  <div className="levi-tasks-meta">{statusLabel(entry.status)} · {formatDuration(entry.durationMs)}</div>
                </div>
                <button type="button" className="levi-terminal-toggle" onClick={() => void onRunAgain(entry)}>Run Again</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
