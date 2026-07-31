import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { app, shell, type BrowserWindow } from "electron";
import { IPC_CHANNELS } from "./ipc-channels";
import {
  killTerminalPty,
  parseTerminalSize,
  resizeTerminalPty,
  resolveWorkspaceCwd,
  revealPathInExplorer,
  spawnTerminalPty,
  TERMINAL_MAX_COLS,
  TERMINAL_MAX_ROWS,
  TERMINAL_MIN_COLS,
  TERMINAL_MIN_ROWS,
  writeTerminalPty,
  type TerminalPtySession
} from "./terminal-service";
import {
  validateTerminalCreateRequest,
  validateTerminalId,
  validateTerminalLayoutState,
  validateTerminalRenameRequest,
  validateTerminalResizeRequest,
  validateTerminalSplitRequest,
  validateTerminalWrite,
  type ValidatedTerminalLayoutState
} from "./terminal-validation";

export type TerminalSessionMetadata = {
  id: string;
  name: string;
  cwd: string;
  shellKind: string;
  alive: boolean;
  createdAt: string;
};

export type TerminalCreateResult = {
  id: string;
  cwd: string;
  name: string;
  shellKind: string;
};

const STATE_FILE = "terminal-state.json";
const DEFAULT_LAYOUT: ValidatedTerminalLayoutState = {
  tabs: [],
  activeTabId: null,
  panelTab: "terminal",
  panelVisible: false,
  panelMaximized: false,
  panelHeightPx: 280,
  splitLayout: null
};

type WorkspaceProvider = () => string | null;

type ManagedTerminal = {
  metadata: TerminalSessionMetadata;
  pty: TerminalPtySession;
  window: BrowserWindow;
};

export class TerminalManager {
  private readonly sessions = new Map<string, ManagedTerminal>();
  private layout: ValidatedTerminalLayoutState = { ...DEFAULT_LAYOUT, tabs: [] };
  private readonly statePath: string;

  constructor(
    private readonly getWorkspaceRoot: WorkspaceProvider,
    private readonly getFallbackRoot: () => string,
    options?: { statePath?: string }
  ) {
    this.statePath =
      options?.statePath ??
      path.join(typeof app?.getPath === "function" ? app.getPath("userData") : os.tmpdir(), STATE_FILE);
  }

  async initialize(): Promise<void> {
    try {
      const raw = await fs.readFile(this.statePath, "utf8");
      const parsed = JSON.parse(raw) as { layout?: unknown };
      if (parsed.layout) {
        this.layout = validateTerminalLayoutState(parsed.layout);
        this.layout.tabs = this.layout.tabs.map((tab) => ({ ...tab, sessionId: undefined }));
      }
    } catch {
      this.layout = { ...DEFAULT_LAYOUT, tabs: [] };
    }
  }

  private async persistLayout(): Promise<void> {
    const payload = {
      layout: {
        ...this.layout,
        tabs: this.layout.tabs.map(({ id, name, cwd }) => ({ id, name, cwd }))
      }
    };
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify(payload, null, 2), "utf8");
  }

  getLayout(): ValidatedTerminalLayoutState {
    return {
      ...this.layout,
      tabs: this.layout.tabs.map((tab) => ({
        ...tab,
        sessionId: this.sessions.get(tab.id)?.metadata.id
      }))
    };
  }

  async setLayout(value: unknown): Promise<ValidatedTerminalLayoutState> {
    this.layout = validateTerminalLayoutState(value);
    await this.persistLayout();
    return this.getLayout();
  }

  list(): TerminalSessionMetadata[] {
    return [...this.sessions.values()].map((entry) => ({ ...entry.metadata }));
  }

  create(window: BrowserWindow, request: unknown): TerminalCreateResult {
    const validated = validateTerminalCreateRequest(request);
    const cwd = resolveWorkspaceCwd(validated.cwd, this.getWorkspaceRoot(), this.getFallbackRoot());
    const id = randomUUID();
    const name = validated.name ?? this.nextDefaultName();
    const ptySession = spawnTerminalPty({
      id,
      cols: validated.cols,
      rows: validated.rows,
      cwd,
      onData: (data) => {
        if (!window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.terminalData, { id, data });
        }
      },
      onExit: () => {
        const managed = this.sessions.get(id);
        if (managed) {
          managed.metadata.alive = false;
          managed.pty.alive = false;
        }
      }
    });

    const metadata: TerminalSessionMetadata = {
      id,
      name,
      cwd,
      shellKind: ptySession.shell.kind,
      alive: true,
      createdAt: new Date().toISOString()
    };
    this.sessions.set(id, { metadata, pty: ptySession, window });
    return { id, cwd, name, shellKind: metadata.shellKind };
  }

  split(window: BrowserWindow, request: unknown): TerminalCreateResult {
    const validated = validateTerminalSplitRequest(request);
    const source = this.sessions.get(validated.sourceId);
    const sourceCwd = source?.metadata.cwd;
    const cwd = resolveWorkspaceCwd(validated.cwd ?? sourceCwd, this.getWorkspaceRoot(), this.getFallbackRoot());
    const createRequest = {
      cols: validated.cols,
      rows: validated.rows,
      cwd,
      name: this.nextDefaultName()
    };
    return this.create(window, createRequest);
  }

  write(idValue: unknown, dataValue: unknown): void {
    const id = validateTerminalId(idValue);
    const data = validateTerminalWrite(dataValue);
    const managed = this.requireSession(id);
    writeTerminalPty(managed.pty, data);
  }

  resize(request: unknown): void {
    const validated = validateTerminalResizeRequest(request);
    const managed = this.requireSession(validated.id);
    resizeTerminalPty(managed.pty, validated.cols, validated.rows);
  }

  rename(request: unknown): TerminalSessionMetadata {
    const validated = validateTerminalRenameRequest(request);
    const managed = this.requireSession(validated.id);
    managed.metadata.name = validated.name;
    const tab = this.layout.tabs.find((item) => item.id === validated.id || item.sessionId === validated.id);
    if (tab) {
      tab.name = validated.name;
      void this.persistLayout();
    }
    return { ...managed.metadata };
  }

  kill(idValue: unknown): TerminalSessionMetadata {
    const id = validateTerminalId(idValue);
    const managed = this.requireSession(id);
    killTerminalPty(managed.pty);
    managed.metadata.alive = false;
    return { ...managed.metadata };
  }

  dispose(idValue: unknown): void {
    const id = validateTerminalId(idValue);
    const managed = this.sessions.get(id);
    if (!managed) return;
    killTerminalPty(managed.pty);
    this.sessions.delete(id);
    this.layout.tabs = this.layout.tabs.filter((tab) => tab.sessionId !== id && tab.id !== id);
    if (this.layout.activeTabId === id) {
      this.layout.activeTabId = this.layout.tabs[0]?.id ?? null;
    }
    void this.persistLayout();
  }

  restart(idValue: unknown): TerminalCreateResult {
    const id = validateTerminalId(idValue);
    const managed = this.requireSession(id);
    const { cols, rows, cwd, name } = {
      cols: parseTerminalSize(managed.pty.pty.cols, 96, TERMINAL_MIN_COLS, TERMINAL_MAX_COLS),
      rows: parseTerminalSize(managed.pty.pty.rows, 16, TERMINAL_MIN_ROWS, TERMINAL_MAX_ROWS),
      cwd: managed.metadata.cwd,
      name: managed.metadata.name
    };
    const window = managed.window;
    this.dispose(id);
    return this.create(window, { cols, rows, cwd, name });
  }

  revealCwd(idValue: unknown): string {
    const id = validateTerminalId(idValue);
    const managed = this.requireSession(id);
    const resolved = revealPathInExplorer(managed.metadata.cwd);
    shell.showItemInFolder(resolved);
    return resolved;
  }

  disposeAll(): void {
    for (const managed of this.sessions.values()) {
      killTerminalPty(managed.pty);
    }
    this.sessions.clear();
  }

  private requireSession(id: string): ManagedTerminal {
    const managed = this.sessions.get(id);
    if (!managed) {
      throw new Error("Unknown terminal session.");
    }
    return managed;
  }

  private nextDefaultName(): string {
    const used = new Set(this.layout.tabs.map((tab) => tab.name));
    let index = 1;
    while (used.has(`Terminal ${index}`)) {
      index += 1;
    }
    return `Terminal ${index}`;
  }
}
