import { useCallback, useEffect, useRef, useState } from "react";
import type { TerminalLayoutState, TerminalLayoutTab, TerminalSplitNode } from "../../types/levi-api";

const DEFAULT_LAYOUT: TerminalLayoutState = {
  tabs: [],
  activeTabId: null,
  panelTab: "terminal",
  panelVisible: false,
  panelMaximized: false,
  panelHeightPx: 280,
  splitLayout: null
};

function createTab(name: string, cwd: string): TerminalLayoutTab {
  return {
    id: crypto.randomUUID(),
    name,
    cwd
  };
}

export function useTerminalLayout(defaultCwd: string) {
  const [layout, setLayout] = useState<TerminalLayoutState>(DEFAULT_LAYOUT);
  const [loaded, setLoaded] = useState(false);
  const persistTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (persistTimer.current) {
        window.clearTimeout(persistTimer.current);
        persistTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void window.levi.terminal.getLayout().then((saved) => {
      if (cancelled) return;
      const tabs =
        saved.tabs.length > 0
          ? saved.tabs.map((tab) => ({ ...tab, sessionId: undefined }))
          : [createTab("Terminal 1", defaultCwd)];
      setLayout({
        ...saved,
        tabs,
        activeTabId: saved.activeTabId ?? tabs[0]?.id ?? null,
        splitLayout: saved.splitLayout ?? (tabs.length === 1 ? { type: "pane", tabId: tabs[0]!.id } : saved.splitLayout)
      });
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [defaultCwd]);

  const persistLayout = useCallback((next: TerminalLayoutState) => {
    if (persistTimer.current) {
      window.clearTimeout(persistTimer.current);
    }
    persistTimer.current = window.setTimeout(() => {
      persistTimer.current = null;
      void window.levi.terminal.setLayout({
        ...next,
        tabs: next.tabs.map(({ id, name, cwd }) => ({ id, name, cwd }))
      });
    }, 200);
  }, []);

  const updateLayout = useCallback(
    (updater: (current: TerminalLayoutState) => TerminalLayoutState) => {
      setLayout((current) => {
        const next = updater(current);
        persistLayout(next);
        return next;
      });
    },
    [persistLayout]
  );

  const addTab = useCallback(
    (name?: string, cwd?: string) => {
      const tab = createTab(name ?? `Terminal ${layout.tabs.length + 1}`, cwd ?? defaultCwd);
      updateLayout((current) => ({
        ...current,
        tabs: [...current.tabs, tab],
        activeTabId: tab.id,
        panelVisible: true,
        panelTab: "terminal",
        splitLayout: current.splitLayout ?? { type: "pane", tabId: tab.id }
      }));
      return tab;
    },
    [defaultCwd, layout.tabs.length, updateLayout]
  );

  const closeTab = useCallback(
    (tabId: string) => {
      updateLayout((current) => {
        const tabs = current.tabs.filter((tab) => tab.id !== tabId);
        const activeTabId = current.activeTabId === tabId ? tabs[0]?.id ?? null : current.activeTabId;
        return {
          ...current,
          tabs,
          activeTabId,
          splitLayout: simplifySplit(current.splitLayout, tabId, tabs)
        };
      });
    },
    [updateLayout]
  );

  const renameTab = useCallback(
    (tabId: string, name: string) => {
      updateLayout((current) => ({
        ...current,
        tabs: current.tabs.map((tab) => (tab.id === tabId ? { ...tab, name } : tab))
      }));
    },
    [updateLayout]
  );

  const reorderTab = useCallback(
    (fromIndex: number, toIndex: number) => {
      updateLayout((current) => {
        const tabs = [...current.tabs];
        const [moved] = tabs.splice(fromIndex, 1);
        if (!moved) return current;
        tabs.splice(toIndex, 0, moved);
        return { ...current, tabs };
      });
    },
    [updateLayout]
  );

  const setActiveTab = useCallback(
    (tabId: string) => {
      updateLayout((current) => ({ ...current, activeTabId: tabId, panelTab: "terminal", panelVisible: true }));
    },
    [updateLayout]
  );

  const setPanelTab = useCallback(
    (panelTab: TerminalLayoutState["panelTab"]) => {
      updateLayout((current) => ({ ...current, panelTab, panelVisible: true }));
    },
    [updateLayout]
  );

  const setPanelVisible = useCallback(
    (panelVisible: boolean) => {
      updateLayout((current) => ({ ...current, panelVisible }));
    },
    [updateLayout]
  );

  const togglePanelMaximized = useCallback(() => {
    updateLayout((current) => ({ ...current, panelMaximized: !current.panelMaximized, panelVisible: true }));
  }, [updateLayout]);

  const setPanelHeight = useCallback(
    (panelHeightPx: number) => {
      updateLayout((current) => ({ ...current, panelHeightPx: Math.max(120, Math.min(panelHeightPx, 2000)) }));
    },
    [updateLayout]
  );

  const splitTab = useCallback(
    (sourceTabId: string, direction: "horizontal" | "vertical", cwd?: string) => {
      const tab = createTab(`Terminal ${layout.tabs.length + 1}`, cwd ?? defaultCwd);
      updateLayout((current) => {
        const nextTabs = [...current.tabs, tab];
        const nextSplit = insertSplit(current.splitLayout, sourceTabId, direction, tab.id);
        return {
          ...current,
          tabs: nextTabs,
          activeTabId: tab.id,
          panelVisible: true,
          panelTab: "terminal",
          splitLayout: nextSplit
        };
      });
      return tab;
    },
    [defaultCwd, layout.tabs.length, updateLayout]
  );

  const bindSession = useCallback((tabId: string, sessionId: string) => {
    setLayout((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => (tab.id === tabId ? { ...tab, sessionId } : tab))
    }));
  }, []);

  return {
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
    bindSession,
    updateLayout
  };
}

function simplifySplit(
  node: TerminalSplitNode | null,
  removedTabId: string,
  tabs: TerminalLayoutTab[]
): TerminalSplitNode | null {
  if (!node) {
    return tabs[0] ? { type: "pane", tabId: tabs[0].id } : null;
  }
  if (node.type === "pane") {
    if (node.tabId === removedTabId) {
      return tabs[0] ? { type: "pane", tabId: tabs[0].id } : null;
    }
    return node;
  }
  const left = simplifySplit(node.children[0], removedTabId, tabs);
  const right = simplifySplit(node.children[1], removedTabId, tabs);
  if (!left) return right;
  if (!right) return left;
  return { type: "split", direction: node.direction, children: [left, right] };
}

function insertSplit(
  node: TerminalSplitNode | null,
  sourceTabId: string,
  direction: "horizontal" | "vertical",
  newTabId: string
): TerminalSplitNode {
  if (!node || node.type === "pane") {
    const paneTabId = node?.type === "pane" ? node.tabId : sourceTabId;
    return {
      type: "split",
      direction,
      children: [
        { type: "pane", tabId: paneTabId },
        { type: "pane", tabId: newTabId }
      ]
    };
  }
  if (containsPane(node, sourceTabId)) {
    return {
      type: "split",
      direction,
      children: [node, { type: "pane", tabId: newTabId }]
    };
  }
  return {
    ...node,
    children: [insertSplit(node.children[0], sourceTabId, direction, newTabId), node.children[1]]
  };
}

function containsPane(node: TerminalSplitNode, tabId: string): boolean {
  if (node.type === "pane") return node.tabId === tabId;
  return containsPane(node.children[0], tabId) || containsPane(node.children[1], tabId);
}
