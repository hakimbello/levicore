import { useEffect, useMemo, useState } from "react";
import type { WorkspaceOpenFileResult } from "../types/levi-api";

const SESSION_VERSION = 1;
const SESSION_PREFIX = "levi.editor.session";

export type EditorTab = WorkspaceOpenFileResult & {
  id: string;
  dirty: boolean;
  pinned: boolean;
  savedContent: string;
};

type PersistedEditorSession = {
  version: typeof SESSION_VERSION;
  activeTabId: string | null;
  tabs: Array<{
    relativePath: string;
    pinned: boolean;
  }>;
};

function tabId(file: WorkspaceOpenFileResult): string {
  return file.relativePath;
}

function sessionKey(workspacePath: string): string {
  return `${SESSION_PREFIX}:${workspacePath}`;
}

function parseSession(value: string | null): PersistedEditorSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PersistedEditorSession>;
    if (parsed.version !== SESSION_VERSION || !Array.isArray(parsed.tabs)) return null;
    const tabs = parsed.tabs.filter(
      (tab): tab is { relativePath: string; pinned: boolean } =>
        typeof tab?.relativePath === "string" && typeof tab?.pinned === "boolean"
    );
    return {
      version: SESSION_VERSION,
      activeTabId: typeof parsed.activeTabId === "string" ? parsed.activeTabId : null,
      tabs
    };
  } catch {
    return null;
  }
}

export function useEditorTabs(workspacePath?: string) {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [restoredWorkspacePath, setRestoredWorkspacePath] = useState<string | null>(null);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs]
  );

  useEffect(() => {
    let disposed = false;
    async function restoreSession() {
      setTabs([]);
      setActiveTabId(null);
      setRestoredWorkspacePath(null);
      if (!workspacePath) return;

      const session = parseSession(window.localStorage.getItem(sessionKey(workspacePath)));
      if (!session || session.tabs.length === 0) {
        if (!disposed) setRestoredWorkspacePath(workspacePath);
        return;
      }

      const restored = await Promise.all(
        session.tabs.map(async (savedTab): Promise<EditorTab | null> => {
          try {
            const file = await window.levi.workspace.readPath({ relativePath: savedTab.relativePath });
            return {
              sourceId: `WORKSPACE:${file.relativePath}`,
              relativePath: file.relativePath,
              content: file.content,
              savedContent: file.content,
              language: file.language,
              lineStart: 1,
              readOnly: true,
              id: file.relativePath,
              dirty: false,
              pinned: savedTab.pinned
            };
          } catch {
            return null;
          }
        })
      );

      if (disposed) return;
      const availableTabs = restored.filter((tab): tab is EditorTab => tab !== null);
      const restoredActiveId = availableTabs.some((tab) => tab.id === session.activeTabId)
        ? session.activeTabId
        : availableTabs[0]?.id ?? null;
      setTabs(availableTabs);
      setActiveTabId(restoredActiveId);
      setRestoredWorkspacePath(workspacePath);
    }

    void restoreSession();
    return () => {
      disposed = true;
    };
  }, [workspacePath]);

  useEffect(() => {
    if (!workspacePath || restoredWorkspacePath !== workspacePath) return;
    const session: PersistedEditorSession = {
      version: SESSION_VERSION,
      activeTabId,
      tabs: tabs.map((tab) => ({ relativePath: tab.relativePath, pinned: tab.pinned }))
    };
    window.localStorage.setItem(sessionKey(workspacePath), JSON.stringify(session));
  }, [activeTabId, restoredWorkspacePath, tabs, workspacePath]);

  function openFile(file: WorkspaceOpenFileResult) {
    const id = tabId(file);
    setTabs((current) => {
      const existing = current.find((tab) => tab.id === id);
      if (existing) {
        if (existing.dirty) return current;
        return current.map((tab) => tab.id === id ? { ...tab, ...file, savedContent: file.content, dirty: false } : tab);
      }
      return [...current, { ...file, id, dirty: false, pinned: false, savedContent: file.content }];
    });
    setActiveTabId(id);
  }

  function activateTab(id: string) {
    setActiveTabId((current) => tabs.some((tab) => tab.id === id) ? id : current);
  }

  function activateRelativeTab(direction: 1 | -1) {
    setActiveTabId((current) => {
      if (tabs.length === 0) return null;
      const currentIndex = tabs.findIndex((tab) => tab.id === current);
      const startIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (startIndex + direction + tabs.length) % tabs.length;
      return tabs[nextIndex]?.id ?? current;
    });
  }

  function closeTab(id: string) {
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === id);
      if (index < 0) return current;
      const next = current.filter((tab) => tab.id !== id);
      setActiveTabId((currentActive) => {
        if (currentActive !== id) return currentActive;
        return next[Math.min(index, next.length - 1)]?.id ?? null;
      });
      return next;
    });
  }

  function closeActiveTab() {
    if (activeTabId) closeTab(activeTabId);
  }

  function updateContent(id: string, content: string) {
    setTabs((current) => current.map((tab) =>
      tab.id === id ? { ...tab, content, dirty: content !== tab.savedContent } : tab
    ));
  }

  function markSaved(id: string, content: string) {
    setTabs((current) => current.map((tab) =>
      tab.id === id ? { ...tab, content, savedContent: content, dirty: false } : tab
    ));
  }

  function updateDirty(id: string, dirty: boolean) {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, dirty } : tab));
  }

  function pinTab(id: string, pinned = true) {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, pinned } : tab));
  }

  function clearTabs(options?: { forgetSession?: boolean }) {
    setTabs([]);
    setActiveTabId(null);
    if (options?.forgetSession && workspacePath) window.localStorage.removeItem(sessionKey(workspacePath));
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    sessionRestored: restoredWorkspacePath === workspacePath,
    openFile,
    closeTab,
    closeActiveTab,
    activateTab,
    activateRelativeTab,
    updateContent,
    markSaved,
    updateDirty,
    pinTab,
    clearTabs
  };
}
