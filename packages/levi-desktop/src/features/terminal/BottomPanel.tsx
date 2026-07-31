import { lazy, useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Icon } from "../../components/Icon";
import { LazySurface } from "../../components/LazySurface";
import type { DebugConsoleEntry, DebugEvaluateResult } from "../debugger/DebugEvents";
import type { SelectedProject } from "../../types/levi-api";
import { DebugConsolePanel } from "./DebugConsolePanel";
import { ProblemsPanel } from "../tasks/ProblemsPanel";
import { OutputPanel } from "../tasks/OutputPanel";
import { useTerminalLayout } from "./useTerminalLayout";
import type { TaskOutputEntry, TaskProblem } from "../../types/task-api";

const TerminalSplitView = lazy(async () => {
  const module = await import("./TerminalSplitView");
  return { default: module.TerminalSplitView };
});

type BottomPanelProps = {
  selectedProject: SelectedProject | null;
  debugConsole: DebugConsoleEntry[];
  debugLastEvaluation?: DebugEvaluateResult;
  onEvaluateDebug: (expression: string) => Promise<unknown>;
  onClearDebugConsole: () => Promise<void>;
  problems: TaskProblem[];
  output: TaskOutputEntry[];
  onOpenProblem: (problem: TaskProblem) => void;
};

const MIN_PANEL_HEIGHT = 120;
const MAX_PANEL_HEIGHT = 2000;

export function BottomPanel({
  selectedProject,
  debugConsole,
  debugLastEvaluation,
  onEvaluateDebug,
  onClearDebugConsole,
  problems,
  output,
  onOpenProblem
}: BottomPanelProps) {
  const defaultCwd = selectedProject?.path ?? "LeviCore";
  const {
    layout,
    loaded,
    addTab,
    closeTab,
    renameTab,
    reorderTab,
    setActiveTab,
    setPanelTab,
    setPanelVisible,
    togglePanelMaximized,
    setPanelHeight,
    splitTab,
    bindSession
  } = useTerminalLayout(defaultCwd);
  const [cwd, setCwd] = useState<string | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const dragState = useRef<{ tabId: string; fromIndex: number } | null>(null);
  const resizeState = useRef<{ startY: number; startHeight: number } | null>(null);

  const activeTab = useMemo(
    () => layout.tabs.find((tab) => tab.id === layout.activeTabId) ?? layout.tabs[0] ?? null,
    [layout.activeTabId, layout.tabs]
  );

  const handleSessionReady = useCallback(
    (tabId: string, sessionId: string) => {
      bindSession(tabId, sessionId);
      void window.levi.terminal.rename({ id: sessionId, name: layout.tabs.find((tab) => tab.id === tabId)?.name ?? "Terminal" });
    },
    [bindSession, layout.tabs]
  );

  const startResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeState.current = { startY: event.clientY, startHeight: layout.panelHeightPx };
    const onMove = (moveEvent: MouseEvent) => {
      if (!resizeState.current) return;
      const delta = resizeState.current.startY - moveEvent.clientY;
      setPanelHeight(resizeState.current.startHeight + delta);
    };
    const onUp = () => {
      resizeState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const panelStyle = layout.panelMaximized
    ? { minHeight: "70vh", height: "70vh" }
    : { minHeight: layout.panelVisible ? layout.panelHeightPx : 40, height: layout.panelVisible ? layout.panelHeightPx : 40 };

  if (!loaded) {
    return (
      <section className="levi-bottom-panel" aria-label="Bottom panel" style={{ minHeight: 40, height: 40 }}>
        <div className="levi-bottom-panel-bar">
          <div className="levi-bottom-panel-tabs" role="tablist" aria-label="Bottom panel views">
            <span className="levi-bottom-panel-tab levi-bottom-panel-tab-active">Terminal</span>
          </div>
          <div className="levi-bottom-panel-actions">
            <button type="button" className="levi-terminal-toggle" aria-expanded={false} disabled>
              <Icon name="terminal" />
              <span>Show</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={
        layout.panelVisible
          ? layout.panelMaximized
            ? "levi-bottom-panel levi-bottom-panel-visible levi-bottom-panel-maximized"
            : "levi-bottom-panel levi-bottom-panel-visible"
          : "levi-bottom-panel"
      }
      aria-label="Bottom panel"
      style={panelStyle}
    >
      {layout.panelVisible ? <div className="levi-bottom-panel-resizer" onMouseDown={startResize} aria-hidden="true" /> : null}
      <div className="levi-bottom-panel-bar">
        <div className="levi-bottom-panel-tabs" role="tablist" aria-label="Bottom panel views">
          {(["terminal", "problems", "output", "debug-console"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={layout.panelTab === tab}
              className={layout.panelTab === tab ? "levi-bottom-panel-tab levi-bottom-panel-tab-active" : "levi-bottom-panel-tab"}
              onClick={() => setPanelTab(tab)}
            >
              {tab === "debug-console" ? "Debug Console" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        <div className="levi-bottom-panel-actions">
          {layout.panelTab === "terminal" ? (
            <>
              <button type="button" className="levi-terminal-toggle" onClick={() => addTab()} aria-label="New terminal">
                <Icon name="terminal" />
                <span>New</span>
              </button>
              {activeTab ? (
                <>
                  <button
                    type="button"
                    className="levi-terminal-toggle"
                    onClick={() => splitTab(activeTab.id, "horizontal", activeTab.cwd)}
                    aria-label="Split terminal horizontally"
                  >
                    Split H
                  </button>
                  <button
                    type="button"
                    className="levi-terminal-toggle"
                    onClick={() => splitTab(activeTab.id, "vertical", activeTab.cwd)}
                    aria-label="Split terminal vertically"
                  >
                    Split V
                  </button>
                  <button
                    type="button"
                    className="levi-terminal-toggle"
                    onClick={() => {
                      const sessionId = activeTab.sessionId;
                      if (sessionId) void window.levi.terminal.revealCwd(sessionId);
                    }}
                    aria-label="Reveal working directory"
                  >
                    Reveal CWD
                  </button>
                </>
              ) : null}
            </>
          ) : null}
          <button type="button" className="levi-terminal-toggle" onClick={togglePanelMaximized} aria-label="Maximize panel">
            {layout.panelMaximized ? "Restore" : "Maximize"}
          </button>
          <button
            type="button"
            className="levi-terminal-toggle"
            onClick={() => setPanelVisible(!layout.panelVisible)}
            aria-expanded={layout.panelVisible}
          >
            <Icon name="terminal" />
            <span>{layout.panelVisible ? "Hide" : "Show"}</span>
          </button>
        </div>
      </div>

      {layout.panelVisible ? (
        <div className="levi-bottom-panel-body">
          {layout.panelTab === "terminal" ? (
            <>
              <div className="levi-terminal-tab-strip" role="tablist" aria-label="Terminal tabs">
                {layout.tabs.map((tab, index) => (
                  <div
                    key={tab.id}
                    className={tab.id === layout.activeTabId ? "levi-terminal-tab levi-terminal-tab-active" : "levi-terminal-tab"}
                    draggable
                    onDragStart={() => {
                      dragState.current = { tabId: tab.id, fromIndex: index };
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!dragState.current) return;
                      reorderTab(dragState.current.fromIndex, index);
                      dragState.current = null;
                    }}
                  >
                    {renamingTabId === tab.id ? (
                      <input
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onBlur={() => {
                          if (renameValue.trim()) {
                            renameTab(tab.id, renameValue.trim());
                            if (tab.sessionId) void window.levi.terminal.rename({ id: tab.sessionId, name: renameValue.trim() });
                          }
                          setRenamingTabId(null);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") setRenamingTabId(null);
                        }}
                        aria-label="Rename terminal"
                      />
                    ) : (
                      <button type="button" onClick={() => setActiveTab(tab.id)} onDoubleClick={() => {
                        setRenamingTabId(tab.id);
                        setRenameValue(tab.name);
                      }}>
                        {tab.name}
                      </button>
                    )}
                    <button type="button" aria-label={`Close ${tab.name}`} onClick={() => {
                      if (tab.sessionId) void window.levi.terminal.dispose(tab.sessionId);
                      closeTab(tab.id);
                    }}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="levi-terminal-meta">
                <span>{selectedProject?.name ?? cwd ?? defaultCwd}</span>
              </div>
              <LazySurface label="Terminal">
                {layout.splitLayout ? (
                  <TerminalSplitView
                    node={layout.splitLayout}
                    tabs={layout.tabs}
                    activeTabId={layout.activeTabId}
                    onSessionReady={handleSessionReady}
                    onCwdChange={setCwd}
                  />
                ) : null}
              </LazySurface>
            </>
          ) : null}
          {layout.panelTab === "problems" ? <ProblemsPanel problems={problems} onOpenProblem={onOpenProblem} /> : null}
          {layout.panelTab === "output" ? <OutputPanel entries={output} /> : null}
          {layout.panelTab === "debug-console" ? (
            <DebugConsolePanel
              consoleEntries={debugConsole}
              lastEvaluation={debugLastEvaluation}
              onEvaluate={onEvaluateDebug}
              onClearConsole={onClearDebugConsole}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
