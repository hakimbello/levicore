import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as pty from "node-pty";
import { getEffectiveDeveloperEnvironment, resolveDeveloperToolFromEnvironment, type DeveloperToolId } from "./developer-environment";

export const TERMINAL_MIN_COLS = 20;
export const TERMINAL_MAX_COLS = 240;
export const TERMINAL_MIN_ROWS = 4;
export const TERMINAL_MAX_ROWS = 80;
export const TERMINAL_MAX_WRITE_LENGTH = 8000;

export type TerminalShellKind = "powershell" | "cmd" | "bash" | "zsh" | "sh";

export type TerminalShellInfo = {
  executable: string;
  kind: TerminalShellKind;
};

const ALLOWED_SHELLS: Record<TerminalShellKind, string[]> = {
  powershell: ["powershell.exe", "pwsh.exe"],
  cmd: ["cmd.exe"],
  bash: ["bash"],
  zsh: ["zsh"],
  sh: ["sh"]
};

export function parseTerminalSize(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(value, max));
}

export function detectDefaultShell(): TerminalShellInfo {
  if (process.platform === "win32") {
    const comspec = process.env.ComSpec;
    if (comspec && path.basename(comspec).toLowerCase() === "cmd.exe") {
      return { executable: comspec, kind: "cmd" };
    }
    const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
    const powershell = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    if (fs.existsSync(powershell)) {
      return { executable: powershell, kind: "powershell" };
    }
    return { executable: "powershell.exe", kind: "powershell" };
  }

  const shellEnv = process.env.SHELL;
  if (shellEnv) {
    const base = path.basename(shellEnv).toLowerCase();
    if (base.includes("zsh")) return { executable: shellEnv, kind: "zsh" };
    if (base.includes("bash")) return { executable: shellEnv, kind: "bash" };
    return { executable: shellEnv, kind: "sh" };
  }

  if (process.platform === "darwin") {
    const zsh = "/bin/zsh";
    if (fs.existsSync(zsh)) return { executable: zsh, kind: "zsh" };
  }

  const bash = "/bin/bash";
  if (fs.existsSync(bash)) return { executable: bash, kind: "bash" };
  return { executable: "/bin/sh", kind: "sh" };
}

export function isAllowedShellExecutable(executable: string): boolean {
  const normalized = path.basename(executable).toLowerCase();
  return Object.values(ALLOWED_SHELLS).some((names) => names.some((name) => normalized === name.toLowerCase()));
}

export function resolveWorkspaceCwd(requestedCwd: string | undefined, workspaceRoot: string | null, fallbackRoot: string): string {
  const candidate = requestedCwd ?? workspaceRoot ?? fallbackRoot;
  const resolved = path.resolve(candidate);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error("Terminal working directory must be an existing folder.");
  }
  if (workspaceRoot) {
    const workspaceResolved = path.resolve(workspaceRoot);
    const relative = path.relative(workspaceResolved, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Terminal working directory must stay inside the workspace.");
    }
  }
  return resolved;
}

export type TerminalPtySession = {
  id: string;
  pty: pty.IPty;
  cwd: string;
  shell: TerminalShellInfo;
  alive: boolean;
  command?: string;
};

export type TerminalSpawnOptions = {
  id: string;
  cols: number;
  rows: number;
  cwd: string;
  onData: (data: string) => void;
  onExit: (exitCode: number) => void;
};

export type TerminalCommandSpawnOptions = TerminalSpawnOptions & {
  executable: string;
  args: string[];
};

export function spawnTerminalPty(options: TerminalSpawnOptions): TerminalPtySession {
  const shell = detectDefaultShell();
  if (!isAllowedShellExecutable(shell.executable)) {
    throw new Error("Configured shell is not allowed.");
  }

  const env = getEffectiveDeveloperEnvironment();
  const session = pty.spawn(shell.executable, [], {
    name: "xterm-256color",
    cols: options.cols,
    rows: options.rows,
    cwd: options.cwd,
    env: {
      ...env,
      TERM: "xterm-256color",
      LANG: env.LANG ?? "en_US.UTF-8"
    }
  });

  session.onData(options.onData);
  session.onExit(({ exitCode }) => {
    options.onExit(typeof exitCode === "number" ? exitCode : 1);
  });

  return {
    id: options.id,
    pty: session,
    cwd: options.cwd,
    shell,
    alive: true
  };
}

export function spawnCommandPty(options: TerminalCommandSpawnOptions): TerminalPtySession {
  const shell = detectDefaultShell();
  const env = getEffectiveDeveloperEnvironment();
  const executable = resolveCommandExecutable(options.executable, env);
  const session = pty.spawn(executable, options.args, {
    name: "xterm-256color",
    cols: options.cols,
    rows: options.rows,
    cwd: options.cwd,
    env: {
      ...env,
      TERM: "xterm-256color",
      LANG: env.LANG ?? "en_US.UTF-8"
    }
  });

  session.onData(options.onData);
  session.onExit(({ exitCode }) => {
    options.onExit(typeof exitCode === "number" ? exitCode : 1);
  });

  return {
    id: options.id,
    pty: session,
    cwd: options.cwd,
    shell,
    alive: true,
    command: `${executable} ${options.args.join(" ")}`.trim()
  };
}

function resolveCommandExecutable(executable: string, env: NodeJS.ProcessEnv): string {
  const id = developerToolIdForExecutable(executable);
  if (!id) return executable;
  return resolveDeveloperToolFromEnvironment(id, executable, env).resolvedPath ?? executable;
}

function developerToolIdForExecutable(executable: string): DeveloperToolId | undefined {
  const base = path.basename(executable).toLowerCase().replace(/\.(exe|cmd|bat)$/i, "");
  if (base === "go") return "go";
  if (base === "rustc") return "rustc";
  if (base === "cargo") return "cargo";
  if (base === "java") return "java";
  if (base === "adb") return "adb";
  if (base === "node") return "node";
  if (base === "npm" || base === "npx" || base === "pnpm" || base === "yarn") return "npm";
  if (base === "python" || base === "py") return "python";
  if (base === "dotnet") return "dotnet";
  if (base === "flutter" || base === "dart") return "flutter";
  if (base === "git") return "git";
  return undefined;
}

export function killTerminalPty(session: TerminalPtySession): void {
  if (!session.alive) return;
  session.alive = false;
  try {
    session.pty.kill();
  } catch {
    // Process may already be gone.
  }
}

export function writeTerminalPty(session: TerminalPtySession, data: string): void {
  if (!session.alive) {
    throw new Error("Terminal session is not running.");
  }
  session.pty.write(data);
}

export function resizeTerminalPty(session: TerminalPtySession, cols: number, rows: number): void {
  if (!session.alive) return;
  session.pty.resize(cols, rows);
}

export function revealPathInExplorer(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  if (!fs.existsSync(resolved)) {
    throw new Error("Path does not exist.");
  }
  return resolved;
}
