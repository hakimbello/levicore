import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { discoverTasks } from "../electron/main/tasks/task-discovery";
import { parseProblemsFromOutput } from "../electron/main/tasks/problem-matchers";
import {
  validateTaskCancelRequest,
  validateTaskOutputRequest,
  validateTaskPinRequest,
  validateTaskRunRequest
} from "../electron/main/tasks/task-validation";

describe("task-discovery", () => {
  it("discovers package scripts and tasks.json entries", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-task-discovery-"));
    await fs.mkdir(path.join(root, ".vscode"), { recursive: true });
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "demo", scripts: { build: "tsc", test: "vitest run", lint: "eslint ." } }),
      "utf8"
    );
    await fs.writeFile(
      path.join(root, ".vscode", "tasks.json"),
      JSON.stringify({
        version: "2.0.0",
        tasks: [{ label: "Custom Build", type: "shell", command: "npm", args: ["run", "build"], group: "build", problemMatcher: ["$tsc"] }]
      }),
      "utf8"
    );

    const tasks = await discoverTasks(root, {
      projectName: "demo",
      rootPath: root,
      languages: ["TypeScript"],
      frameworks: [],
      packageManager: "npm",
      likelyEntryPoints: [],
      sourceDirectories: ["src"],
      testDirectories: ["test"],
      scripts: { build: "tsc", test: "vitest run", lint: "eslint ." },
      documentationFiles: [],
      manifestFiles: ["package.json"],
      includedFileCount: 1,
      excludedFileCount: 0,
      scanTimestamp: new Date().toISOString()
    });

    expect(tasks.some((task) => task.label === "Build")).toBe(true);
    expect(tasks.some((task) => task.label === "Custom Build")).toBe(true);
    expect(tasks.some((task) => task.label === "lint")).toBe(true);
  });

  it("discovers universal profile tasks for non-Node projects", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-task-universal-"));
    const tasks = await discoverTasks(root, {
      projectName: "task-api",
      rootPath: root,
      languages: ["C#"],
      frameworks: ["ASP.NET Core"],
      packageManager: "dotnet",
      likelyEntryPoints: ["Program.cs"],
      sourceDirectories: [],
      testDirectories: [],
      scripts: {},
      documentationFiles: [],
      manifestFiles: ["TaskApi.csproj"],
      includedFileCount: 1,
      excludedFileCount: 0,
      scanTimestamp: new Date().toISOString()
    });

    expect(tasks.find((task) => task.id === "universal:dotnet-build")).toMatchObject({ command: "dotnet", args: ["build"], problemMatchers: ["$dotnet"] });
    expect(tasks.find((task) => task.id === "universal:dotnet-run")).toMatchObject({ label: "Run App", args: ["run"] });
  });
});

describe("problem-matchers", () => {
  it("parses TypeScript and ESLint output", () => {
    const root = "C:\\Project";
    const tsc = parseProblemsFromOutput(
      "src/app.ts(12,4): error TS2345: Argument of type 'string' is not assignable.",
      ["$tsc"],
      root,
      "Build"
    );
    expect(tsc[0]?.relativePath).toBe("src/app.ts");
    expect(tsc[0]?.line).toBe(12);
    expect(tsc[0]?.column).toBe(4);

    const eslint = parseProblemsFromOutput(
      "src/app.ts: line 3, col 8, Error - Unexpected var, use let or const instead (no-var)",
      ["$eslint-compact"],
      root,
      "Lint"
    );
    expect(eslint[0]?.severity).toBe("error");
    expect(eslint[0]?.line).toBe(3);
  });

  it("parses .NET and Flutter diagnostics", () => {
    const root = "C:\\Project";
    const dotnet = parseProblemsFromOutput(
      "Program.cs(8,17): error CS1002: ; expected",
      ["$dotnet"],
      root,
      "Build"
    );
    expect(dotnet[0]).toMatchObject({ relativePath: "Program.cs", line: 8, column: 17, message: "; expected" });

    const flutter = parseProblemsFromOutput(
      "lib/main.dart:12:7: Error: The method 'missing' isn't defined.",
      ["$flutter"],
      root,
      "Analyze"
    );
    expect(flutter[0]).toMatchObject({ relativePath: "lib/main.dart", line: 12, column: 7 });
  });
});

describe("task-validation", () => {
  it("validates run, cancel, output, and pin payloads", () => {
    expect(validateTaskRunRequest({ taskId: "builtin:build" })).toEqual({ taskId: "builtin:build" });
    expect(validateTaskCancelRequest({ runId: "run-1" })).toEqual({ runId: "run-1" });
    expect(validateTaskOutputRequest({ source: "task", channel: "Build" })).toEqual({ source: "task", channel: "Build" });
    expect(validateTaskPinRequest({ taskId: "builtin:build", pinned: true })).toEqual({ taskId: "builtin:build", pinned: true });
    expect(() => validateTaskRunRequest({})).toThrow(/taskId/i);
  });
});

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/levi-task-test" },
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

describe("TaskService", () => {
  it("runs and cancels tasks through TerminalManager", async () => {
    const { TerminalManager } = await import("../electron/main/terminal-manager");
    const { TaskService } = await import("../electron/main/tasks/task-service");
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-task-service-"));
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ scripts: { build: "tsc" } }), "utf8");

    const terminalManager = new TerminalManager(() => root, () => root, {
      statePath: path.join(root, "terminal-state.json")
    });
    await terminalManager.initialize();
    const taskService = new TaskService(
      terminalManager,
      () => root,
      () => ({
        projectName: "demo",
        rootPath: root,
        languages: ["TypeScript"],
        frameworks: [],
        packageManager: "npm",
        likelyEntryPoints: [],
        sourceDirectories: ["src"],
        testDirectories: ["test"],
        scripts: { build: "tsc" },
        documentationFiles: [],
        manifestFiles: ["package.json"],
        includedFileCount: 1,
        excludedFileCount: 0,
        scanTimestamp: new Date().toISOString()
      }),
      { statePath: path.join(root, "task-state.json") }
    );
    await taskService.initialize();
    const window = { isDestroyed: () => false, webContents: { send: vi.fn() } } as never;
    const list = await taskService.list();
    const buildTask = list.detected.find((task) => task.label === "Build");
    expect(buildTask).toBeTruthy();

    const run = await taskService.run({ taskId: buildTask!.id }, window);
    expect(run.status).toBe("running");
    expect(run.terminalSessionId).toBeTruthy();

    const cancelled = await taskService.cancel({ runId: run.id });
    expect(cancelled.status).toBe("cancelled");
  });
});
