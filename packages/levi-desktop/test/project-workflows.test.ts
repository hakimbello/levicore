import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceScanSummary } from "../src/types/levi-api";
import {
  ProjectWorkflowService,
  analyzeGitChanges,
  detectProjectFromSummary,
  detectRunCommands,
  validateGitHubRepositoryUrl,
  validateNewProjectDestination
} from "../electron/main/project-workflows";

function summary(overrides: Partial<WorkspaceScanSummary>): WorkspaceScanSummary {
  return {
    projectName: "demo",
    rootPath: "C:\\demo",
    languages: [],
    frameworks: [],
    likelyEntryPoints: [],
    sourceDirectories: [],
    testDirectories: [],
    scripts: {},
    documentationFiles: [],
    manifestFiles: [],
    includedFileCount: 0,
    excludedFileCount: 0,
    scanTimestamp: new Date(0).toISOString(),
    ...overrides
  };
}

async function tempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "levi-project-workflows-"));
}

describe("project workflow service", () => {
  it("validates public HTTPS GitHub repository URLs", () => {
    expect(validateGitHubRepositoryUrl("https://github.com/openai/openai-node")).toBe("https://github.com/openai/openai-node.git");
    expect(validateGitHubRepositoryUrl("https://github.com/openai/openai-node.git")).toBe("https://github.com/openai/openai-node.git");
    expect(() => validateGitHubRepositoryUrl("git@github.com:openai/openai-node.git")).toThrow(/invalid/);
    expect(() => validateGitHubRepositoryUrl("https://example.com/openai/openai-node")).toThrow(/HTTPS GitHub/);
    expect(() => validateGitHubRepositoryUrl("https://github.com/openai")).toThrow(/owner and repository/);
  });

  it("rejects unsafe or non-empty starter destinations", async () => {
    await expect(validateNewProjectDestination("relative")).rejects.toThrow(/absolute path/);
    const root = await tempDir();
    const target = path.join(root, "used");
    await fs.mkdir(target);
    await fs.writeFile(path.join(target, "package.json"), "{}", "utf8");
    await expect(validateNewProjectDestination(target)).rejects.toThrow(/not empty/);
  });

  it("detects common project types and commands deterministically", () => {
    const vite = detectProjectFromSummary(summary({
      frameworks: ["React", "Vite"],
      languages: ["TypeScript"],
      packageManager: "npm",
      scripts: { dev: "vite", build: "vite build", test: "vitest" },
      manifestFiles: ["package.json", "vite.config.ts"],
      likelyEntryPoints: ["src/main.tsx"]
    }));
    expect(vite.projectType).toBe("vite");
    expect(vite.framework).toBe("React + Vite");
    expect(vite.devCommand).toContain("npm");
    expect(vite.buildCommand).toContain("build");

    const next = detectProjectFromSummary(summary({ frameworks: ["Next.js"], manifestFiles: ["package.json"] }));
    expect(next.projectType).toBe("nextjs");

    const android = detectProjectFromSummary(summary({ languages: ["Kotlin"], manifestFiles: ["build.gradle.kts", "settings.gradle.kts"] }));
    expect(android.projectType).toBe("kotlin-android");
  });

  it("detects confident Run App commands without inventing unknown commands", () => {
    const commands = detectRunCommands(summary({
      frameworks: ["Next.js"],
      packageManager: "pnpm",
      scripts: { dev: "next dev", start: "next start" },
      manifestFiles: ["package.json"]
    }));
    expect(commands[0]).toMatchObject({ command: process.platform === "win32" ? "pnpm.cmd" : "pnpm", args: ["run", "dev"] });
    expect(detectRunCommands(summary({ scripts: {} }))).toEqual([]);
  });

  it("creates safe built-in starters and opens the workspace", async () => {
    const root = await tempDir();
    const opened: string[] = [];
    const service = new ProjectWorkflowService({
      getWorkspaceRoot: () => path.join(root, "fitness-api"),
      openProjectAtPath: async (directoryPath) => {
        opened.push(directoryPath);
        return { path: directoryPath, name: path.basename(directoryPath) };
      },
      refreshWorkspace: async () => undefined,
      getWorkspaceSummary: () => summary({ manifestFiles: ["package.json"], scripts: { dev: "node src/server.js", build: "node --check src/server.js" }, languages: ["JavaScript"] }),
      terminalManager: {} as never,
      getWindow: () => null
    });
    const result = await service.createStarter({ starter: "node-api", destinationFolder: root, projectName: "fitness-api" });
    expect(result.project.name).toBe("fitness-api");
    expect(opened).toEqual([path.join(root, "fitness-api")]);
    await expect(fs.readFile(path.join(root, "fitness-api", "src", "server.js"), "utf8")).resolves.toContain("createServer");
  });

  it("surfaces clone failures cleanly", async () => {
    const root = await tempDir();
    const service = new ProjectWorkflowService({
      getWorkspaceRoot: () => null,
      openProjectAtPath: async () => null,
      refreshWorkspace: async () => undefined,
      getWorkspaceSummary: () => undefined,
      terminalManager: {} as never,
      getWindow: () => null,
      execFile: ((_executable: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
        callback(new Error("clone failed"), "", "fatal: repository not found");
      }) as never
    });
    await expect(service.cloneRepository({ repositoryUrl: "https://github.com/openai/missing", destinationFolder: path.join(root, "missing") })).rejects.toThrow(/repository not found/);
  });

  it("starts and stops a detected app command through the terminal manager", async () => {
    let killed = "";
    const listeners: Array<(sessionId: string, data: string) => void> = [];
    const service = new ProjectWorkflowService({
      getWorkspaceRoot: () => "C:\\demo",
      openProjectAtPath: async () => null,
      refreshWorkspace: async () => undefined,
      getWorkspaceSummary: () => summary({ frameworks: ["Vite"], packageManager: "npm", scripts: { dev: "vite" }, manifestFiles: ["package.json"] }),
      terminalManager: {
        createCommand: () => ({ id: "term-1", cwd: "C:\\demo", name: "Run dev server", shellKind: "cmd" }),
        onTerminalData: (listener: (sessionId: string, data: string) => void) => {
          listeners.push(listener);
          return () => undefined;
        },
        kill: (id: string) => {
          killed = id;
          return { id, name: "Run dev server", cwd: "C:\\demo", shellKind: "cmd", alive: false, createdAt: "" };
        }
      } as never,
      getWindow: () => ({ isDestroyed: () => false }) as never
    });
    const result = await service.startRun();
    expect(result.status.running).toBe(true);
    listeners[0]("term-1", "ready");
    expect(service.getRunStatus().outputPreview).toContain("ready");
    service.stopRun();
    expect(killed).toBe("term-1");
  });

  it("parses Git changes into created, modified, and deleted files", async () => {
    const execFile = ((_executable: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      callback(null, "?? src/new.ts\n M src/changed.ts\nD  src/deleted.ts\n", "");
    }) as never;
    await expect(analyzeGitChanges("C:\\demo", execFile)).resolves.toEqual({
      createdFiles: ["src/new.ts"],
      modifiedFiles: ["src/changed.ts"],
      deletedFiles: ["src/deleted.ts"]
    });
  });

  it("reports workspace files as created when View Changes runs outside Git", async () => {
    const root = await tempDir();
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.mkdir(path.join(root, ".levi"), { recursive: true });
    await fs.writeFile(path.join(root, "index.html"), "<main></main>", "utf8");
    await fs.writeFile(path.join(root, "src", "app.js"), "console.log('ready');", "utf8");
    await fs.writeFile(path.join(root, ".levi", "launch.json"), "{}", "utf8");
    const execFile = ((_executable: string, _args: string[], _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      callback(new Error("fatal: not a git repository (or any of the parent directories): .git"), "", "");
    }) as never;
    await expect(analyzeGitChanges(root, execFile)).resolves.toEqual({
      createdFiles: ["index.html", "src/app.js"],
      modifiedFiles: [],
      deletedFiles: []
    });
  });
});
