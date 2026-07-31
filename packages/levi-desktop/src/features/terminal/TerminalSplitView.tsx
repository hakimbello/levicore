import { TerminalHost } from "./TerminalHost";
import type { TerminalLayoutTab, TerminalSplitNode } from "../../types/levi-api";

type TerminalSplitViewProps = {
  node: TerminalSplitNode;
  tabs: TerminalLayoutTab[];
  activeTabId: string | null;
  onSessionReady: (tabId: string, sessionId: string, cwd: string) => void;
  onCwdChange: (cwd: string | null) => void;
};

export function TerminalSplitView({ node, tabs, activeTabId, onSessionReady, onCwdChange }: TerminalSplitViewProps) {
  if (node.type === "pane") {
    const tab = tabs.find((item) => item.id === node.tabId);
    if (!tab) return null;
    return (
      <TerminalHost
        sessionId={tab.sessionId}
        cwd={tab.cwd}
        active={tab.id === activeTabId}
        onSessionReady={(sessionId, cwd) => onSessionReady(tab.id, sessionId, cwd)}
        onCwdChange={onCwdChange}
      />
    );
  }

  return (
    <div className={node.direction === "horizontal" ? "levi-terminal-split levi-terminal-split-horizontal" : "levi-terminal-split levi-terminal-split-vertical"}>
      <div className="levi-terminal-split-pane">
        <TerminalSplitView
          node={node.children[0]}
          tabs={tabs}
          activeTabId={activeTabId}
          onSessionReady={onSessionReady}
          onCwdChange={onCwdChange}
        />
      </div>
      <div className="levi-terminal-split-pane">
        <TerminalSplitView
          node={node.children[1]}
          tabs={tabs}
          activeTabId={activeTabId}
          onSessionReady={onSessionReady}
          onCwdChange={onCwdChange}
        />
      </div>
    </div>
  );
}
