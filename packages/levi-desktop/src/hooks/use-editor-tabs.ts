import { useEffect, useMemo, useState } from "react";
import { clearEditorRecovery, readEditorRecovery, removeEditorRecoveryEntry, writeEditorRecovery } from "../services/editor-recovery";
import type { WorkspaceOpenFileResult } from "../types/levi-api";

const SESSION_VERSION = 1;
const SESSION_PREFIX = "levi.editor.session";
const RECOVERY_WRITE_DELAY_MS = 2_000;

export type EditorTab = WorkspaceOpenFileResult & {
  id: string;
  dirty: boolean;
  pinned: boolean;
  savedContent: string;
};

type PersistedEditorSession = {
  version: typeof SESSION_VERSION;
  activeTabId: string | null;
  tabs: Array<{ relativePath: string; pinned: boolean }>;
};

function tabId(file: WorkspaceOpenFileResult): string { return file.relativePath; }
function sessionKey(workspacePath: string): string { return `${SESSION_PREFIX}:${workspacePath}`; }

function parseSession(value: string | null): PersistedEditorSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PersistedEditorSession>;
    if (parsed.version !== SESSION_VERSION || !Array.isArray(parsed.tabs)) return null;
    const tabs = parsed.tabs.filter((tab): tab is { relativePath: string; pinned: boolean } =>
      typeof tab?.relativePath === "string" && typeof tab?.pinned === "boolean");
    return { version: SESSION_VERSION, activeTabId: typeof parsed.activeTabId === "string" ? parsed.activeTabId : null, tabs };
  } catch { return null; }
}

export function useEditorTabs(workspacePath?: string) {
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [restoredWorkspacePath, setRestoredWorkspacePath] = useState<string | null>(null);
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? null, [activeTabId, tabs]);

  useEffect(() => {
    let disposed = false;
    async function restoreSession() {
      setTabs([]); setActiveTabId(null); setRestoredWorkspacePath(null);
      if (!workspacePath) return;
      const session = parseSession(window.localStorage.getItem(sessionKey(workspacePath)));
      const recovery = readEditorRecovery(workspacePath);
      const restoreRecovery = recovery ? window.confirm(`Levi found ${recovery.entries.length} unsaved file${recovery.entries.length === 1 ? "" : "s"} from the previous session. Restore them?`) : false;
      if (recovery && !restoreRecovery) clearEditorRecovery(workspacePath);
      const recoveryByPath = new Map(restoreRecovery && recovery ? recovery.entries.map((entry) => [entry.relativePath, entry]) : []);
      const orderedPaths = [...(session?.tabs.map((tab) => tab.relativePath) ?? []), ...Array.from(recoveryByPath.keys())]
        .filter((relativePath, index, all) => all.indexOf(relativePath) === index);
      const restored = await Promise.all(orderedPaths.map(async (relativePath): Promise<EditorTab | null> => {
        try {
          const file = await window.levi.workspace.readPath({ relativePath });
          const savedTab = session?.tabs.find((tab) => tab.relativePath === relativePath);
          const recovered = recoveryByPath.get(relativePath);
          const content = recovered?.content ?? file.content;
          const savedContent = recovered?.savedContent ?? file.content;
          return { sourceId: `WORKSPACE:${file.relativePath}`, relativePath: file.relativePath, content, savedContent, language: file.language, lineStart: 1, readOnly: false, id: file.relativePath, dirty: content !== savedContent, pinned: recovered?.pinned ?? savedTab?.pinned ?? false };
        } catch { return null; }
      }));
      if (disposed) return;
      const availableTabs = restored.filter((tab): tab is EditorTab => tab !== null);
      const preferredActiveId = restoreRecovery && recovery?.activeTabId ? recovery.activeTabId : session?.activeTabId ?? null;
      setTabs(availableTabs);
      setActiveTabId(availableTabs.some((tab) => tab.id === preferredActiveId) ? preferredActiveId : availableTabs[0]?.id ?? null);
      setRestoredWorkspacePath(workspacePath);
    }
    void restoreSession();
    return () => { disposed = true; };
  }, [workspacePath]);

  useEffect(() => {
    if (!workspacePath || restoredWorkspacePath !== workspacePath) return;
    window.localStorage.setItem(sessionKey(workspacePath), JSON.stringify({ version: SESSION_VERSION, activeTabId, tabs: tabs.map((tab) => ({ relativePath: tab.relativePath, pinned: tab.pinned })) } satisfies PersistedEditorSession));
  }, [activeTabId, restoredWorkspacePath, tabs, workspacePath]);

  useEffect(() => {
    if (!workspacePath || restoredWorkspacePath !== workspacePath) return;
    const timeout = window.setTimeout(() => {
      const timestamp = new Date().toISOString();
      writeEditorRecovery(workspacePath, activeTabId, tabs.filter((tab) => tab.dirty && tab.sourceId.startsWith("WORKSPACE:")).map((tab) => ({ relativePath: tab.relativePath, content: tab.content, savedContent: tab.savedContent, pinned: tab.pinned, timestamp })));
    }, RECOVERY_WRITE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [activeTabId, restoredWorkspacePath, tabs, workspacePath]);

  function openFile(file: WorkspaceOpenFileResult) {
    const id = tabId(file);
    setTabs((current) => {
      const existing = current.find((tab) => tab.id === id);
      if (existing) {
        return current.map((tab) => tab.id === id
          ? existing.dirty
            ? { ...tab, lineStart: file.lineStart, language: file.language }
            : { ...tab, ...file, savedContent: file.content, dirty: false }
          : tab);
      }
      return [...current, { ...file, id, dirty: false, pinned: false, savedContent: file.content }];
    });
    setActiveTabId(id);
  }

  function activateTab(id: string) { setActiveTabId((current) => tabs.some((tab) => tab.id === id) ? id : current); }
  function activateRelativeTab(direction: 1 | -1) {
    setActiveTabId((current) => {
      if (tabs.length === 0) return null;
      const currentIndex = tabs.findIndex((tab) => tab.id === current);
      return tabs[(Math.max(currentIndex, 0) + direction + tabs.length) % tabs.length]?.id ?? current;
    });
  }
  function closeTab(id: string) {
    if (workspacePath) removeEditorRecoveryEntry(workspacePath, id);
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === id);
      if (index < 0) return current;
      const next = current.filter((tab) => tab.id !== id);
      setActiveTabId((currentActive) => currentActive !== id ? currentActive : next[Math.min(index, next.length - 1)]?.id ?? null);
      return next;
    });
  }
  function updateContent(id: string, content: string) { setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, content, dirty: content !== tab.savedContent } : tab)); }
  function markSaved(id: string, content: string) {
    if (workspacePath) removeEditorRecoveryEntry(workspacePath, id);
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, content, savedContent: content, dirty: false } : tab));
  }
  function updateDirty(id: string, dirty: boolean) { setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, dirty } : tab)); }
  function pinTab(id: string, pinned = true) { setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, pinned } : tab)); }
  function clearRecovery() { if (workspacePath) clearEditorRecovery(workspacePath); }
  function clearTabs(options?: { forgetSession?: boolean; forgetRecovery?: boolean }) {
    setTabs([]); setActiveTabId(null);
    if (options?.forgetSession && workspacePath) window.localStorage.removeItem(sessionKey(workspacePath));
    if (options?.forgetRecovery && workspacePath) clearEditorRecovery(workspacePath);
  }

  return { tabs, activeTabId, activeTab, sessionRestored: restoredWorkspacePath === workspacePath, openFile, closeTab, activateTab, activateRelativeTab, updateContent, markSaved, updateDirty, pinTab, clearRecovery, clearTabs };
}
