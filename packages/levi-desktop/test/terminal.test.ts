import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/levi-terminal-test" },
  shell: { showItemInFolder: vi.fn() },
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeListener: vi.fn() }
}));

vi.mock("node-pty", () => ({
  spawn: vi.fn(() => ({
    cols: 96,
    rows: 16,
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn()
  }))
}));

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  detectDefaultShell,
  isAllowedShellExecutable,
  parseTerminalSize,
  resolveWorkspaceCwd
} from "../electron/main/terminal-service";
import {
  validateTerminalCreateRequest,
  validateTerminalLayoutState,
  validateTerminalRenameRequest,
  validateTerminalResizeRequest,
  validateTerminalSplitRequest,
  validateTerminalWrite
} from "../electron/main/terminal-validation";

describe("terminal-service", () => {
  it("parses terminal dimensions within bounds", () => {
    expect(parseTerminalSize(120, 96, 20, 240)).toBe(120);
    expect(parseTerminalSize(999, 96, 20, 240)).toBe(240);
    expect(parseTerminalSize("bad", 96, 20, 240)).toBe(96);
  });

  it("detects an allowed default shell", () => {
    const shell = detectDefaultShell();
    expect(isAllowedShellExecutable(shell.executable)).toBe(true);
    expect(["powershell", "cmd", "bash", "zsh", "sh"]).toContain(shell.kind);
  });

  it("restricts cwd to the workspace root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-terminal-cwd-"));
    const nested = path.join(root, "src");
    await fs.mkdir(nested, { recursive: true });
    expect(resolveWorkspaceCwd(nested, root, root)).toBe(path.resolve(nested));
    expect(() => resolveWorkspaceCwd(os.tmpdir(), root, root)).toThrow(/inside the workspace/i);
  });
});

describe("terminal-validation", () => {
  it("validates create, resize, rename, split, and write payloads", () => {
    expect(validateTerminalCreateRequest({ cols: 96, rows: 16, name: "Build" })).toEqual({
      cols: 96,
      rows: 16,
      name: "Build"
    });
    expect(validateTerminalResizeRequest({ id: "terminal-1", cols: 100, rows: 20 })).toEqual({
      id: "terminal-1",
      cols: 100,
      rows: 20
    });
    expect(validateTerminalRenameRequest({ id: "terminal-1", name: "Server" })).toEqual({
      id: "terminal-1",
      name: "Server"
    });
    expect(
      validateTerminalSplitRequest({
        sourceId: "terminal-1",
        direction: "vertical",
        cols: 96,
        rows: 16
      })
    ).toMatchObject({ sourceId: "terminal-1", direction: "vertical" });
    expect(validateTerminalWrite("echo hi")).toBe("echo hi");
    expect(() => validateTerminalWrite("")).toThrow(/invalid terminal input/i);
  });

  it("validates persisted layout state", () => {
    const layout = validateTerminalLayoutState({
      tabs: [{ id: "tab-1", name: "Terminal 1", cwd: "C:\\Project" }],
      activeTabId: "tab-1",
      panelTab: "terminal",
      panelVisible: true,
      panelMaximized: false,
      panelHeightPx: 280,
      splitLayout: { type: "pane", tabId: "tab-1" }
    });
    expect(layout.tabs).toHaveLength(1);
    expect(layout.panelTab).toBe("terminal");
  });
});

describe("TerminalManager", () => {
  it("creates, lists, renames, kills, restarts, and disposes sessions", async () => {
    const { TerminalManager } = await import("../electron/main/terminal-manager");
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-terminal-manager-"));
    const manager = new TerminalManager(() => root, () => root, {
      statePath: path.join(root, "terminal-state.json")
    });
    await manager.initialize();

    const window = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    } as never;

    const created = manager.create(window, { cols: 96, rows: 16, name: "Main" });
    expect(created.name).toBe("Main");
    expect(manager.list()).toHaveLength(1);

    const renamed = manager.rename({ id: created.id, name: "Build" });
    expect(renamed.name).toBe("Build");

    const killed = manager.kill(created.id);
    expect(killed.alive).toBe(false);

    const restarted = manager.restart(created.id);
    expect(restarted.id).not.toBe(created.id);
    expect(manager.list()).toHaveLength(1);

    manager.dispose(restarted.id);
    expect(manager.list()).toHaveLength(0);
  });

  it("persists and restores layout metadata without live sessions", async () => {
    const { TerminalManager } = await import("../electron/main/terminal-manager");
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-terminal-layout-"));
    const statePath = path.join(root, "terminal-state.json");
    const manager = new TerminalManager(() => root, () => root, { statePath });
    await manager.initialize();

    const saved = await manager.setLayout({
      tabs: [{ id: "tab-1", name: "Terminal 1", cwd: root }],
      activeTabId: "tab-1",
      panelTab: "terminal",
      panelVisible: true,
      panelMaximized: false,
      panelHeightPx: 320,
      splitLayout: { type: "pane", tabId: "tab-1" }
    });
    expect(saved.panelHeightPx).toBe(320);

    const reloaded = new TerminalManager(() => root, () => root, { statePath });
    await reloaded.initialize();
    expect(reloaded.getLayout().panelHeightPx).toBe(320);
    expect(reloaded.getLayout().tabs[0]?.name).toBe("Terminal 1");
  });

  it("cleans up all sessions on disposeAll", async () => {
    const { TerminalManager } = await import("../electron/main/terminal-manager");
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-terminal-cleanup-"));
    const manager = new TerminalManager(() => root, () => root, {
      statePath: path.join(root, "terminal-state.json")
    });
    await manager.initialize();
    const window = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() }
    } as never;
    manager.create(window, { cols: 96, rows: 16 });
    manager.create(window, { cols: 96, rows: 16 });
    expect(manager.list()).toHaveLength(2);
    manager.disposeAll();
    expect(manager.list()).toHaveLength(0);
  });
});
