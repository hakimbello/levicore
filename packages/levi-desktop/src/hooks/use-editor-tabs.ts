import { useMemo, useState } from "react";
import type { WorkspaceOpenFileResult } from "../types/levi-api";

export type EditorTab = WorkspaceOpenFileResult & {
  id: string;
  dirty: boolean;
  pinned: boolean;
};

function tabId(file: WorkspaceOpenFileResult): string {
  return file.relativePath;
}

export function useEditorTabs() {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs]
  );

  function openFile(file: WorkspaceOpenFileResult) {
    const id = tabId(file);
    setTabs((current) => {
      const existing = current.find((tab) => tab.id === id);
      if (existing) {
        return current.map((tab) => tab.id === id ? { ...tab, ...file } : tab);
      }
      return [...current, { ...file, id, dirty: false, pinned: false }];
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

  function updateDirty(id: string, dirty: boolean) {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, dirty } : tab));
  }

  function pinTab(id: string, pinned = true) {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, pinned } : tab));
  }

  function clearTabs() {
    setTabs([]);
    setActiveTabId(null);
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    openFile,
    closeTab,
    closeActiveTab,
    activateTab,
    activateRelativeTab,
    updateDirty,
    pinTab,
    clearTabs
  };
}
