const RECOVERY_VERSION = 1;
const RECOVERY_PREFIX = "levi.editor.recovery";

export type EditorRecoveryEntry = {
  relativePath: string;
  content: string;
  savedContent: string;
  pinned: boolean;
  timestamp: string;
};

type EditorRecoveryRecord = {
  version: typeof RECOVERY_VERSION;
  workspacePath: string;
  activeTabId: string | null;
  entries: EditorRecoveryEntry[];
};

function recoveryKey(workspacePath: string): string {
  return `${RECOVERY_PREFIX}:${workspacePath}`;
}

function isRecoveryEntry(value: unknown): value is EditorRecoveryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<EditorRecoveryEntry>;
  return typeof entry.relativePath === "string"
    && entry.relativePath.length > 0
    && typeof entry.content === "string"
    && typeof entry.savedContent === "string"
    && typeof entry.pinned === "boolean"
    && typeof entry.timestamp === "string";
}

export function readEditorRecovery(workspacePath: string): EditorRecoveryRecord | null {
  try {
    const raw = window.localStorage.getItem(recoveryKey(workspacePath));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EditorRecoveryRecord>;
    if (parsed.version !== RECOVERY_VERSION || parsed.workspacePath !== workspacePath || !Array.isArray(parsed.entries)) {
      window.localStorage.removeItem(recoveryKey(workspacePath));
      return null;
    }

    const entries = parsed.entries.filter(isRecoveryEntry);
    if (entries.length === 0) {
      window.localStorage.removeItem(recoveryKey(workspacePath));
      return null;
    }

    return {
      version: RECOVERY_VERSION,
      workspacePath,
      activeTabId: typeof parsed.activeTabId === "string" ? parsed.activeTabId : null,
      entries
    };
  } catch {
    window.localStorage.removeItem(recoveryKey(workspacePath));
    return null;
  }
}

export function writeEditorRecovery(
  workspacePath: string,
  activeTabId: string | null,
  entries: EditorRecoveryEntry[]
): void {
  if (entries.length === 0) {
    clearEditorRecovery(workspacePath);
    return;
  }

  const record: EditorRecoveryRecord = {
    version: RECOVERY_VERSION,
    workspacePath,
    activeTabId,
    entries
  };
  window.localStorage.setItem(recoveryKey(workspacePath), JSON.stringify(record));
}

export function clearEditorRecovery(workspacePath: string): void {
  window.localStorage.removeItem(recoveryKey(workspacePath));
}
