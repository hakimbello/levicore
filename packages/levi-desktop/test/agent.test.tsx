import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgentService } from "../electron/main/agent-service";
import { GitService } from "../electron/main/git-service";
import { RuntimeManager } from "../electron/main/ai-runtime/runtime-manager";
import { AIRuntimeProviderRegistry } from "../electron/main/ai-runtime/provider-registry";
import type { GitOperationPreview, GitOperationPreviewRequest, GitRepositoryStatus } from "../electron/main/git-service";
import type {
  AIRuntimeDetection,
  AIRuntimeInvocationResponse,
  AIRuntimeProvider,
  AIRuntimeProviderId,
  AIRuntimeRequest
} from "../src/features/ai-runtime";
import type { TaskDefinition, TaskEvent, TaskOutputEntry, TaskProblem, TaskRun } from "../src/types/task-api";
import { App } from "../src/app/App";

function detection(providerId: AIRuntimeProviderId): AIRuntimeDetection {
  return {
    providerId,
    installed: true,
    running: true,
    version: "1.0.0",
    endpoint: "http://127.0.0.1:11434",
    health: "Running",
    latencyMs: 4,
    supportedModels: [
      {
        id: "model-a",
        displayName: "Model A",
        contextWindow: 8192,
        embeddingSupport: false,
        visionSupport: false,
        toolSupport: false
      }
    ]
  };
}

function provider(content = JSON.stringify({
  summary: "Build a login page without executing changes.",
  steps: [
    {
      title: "Analyze routing",
      description: "Find the route entry points.",
      estimatedFiles: ["src/main.tsx"],
      actions: [{ type: "modify-file", title: "Approve route update", description: "Review a future route change.", relativePath: "src/main.tsx" }]
    },
    {
      title: "Plan validation",
      description: "Prepare test coverage.",
      estimatedFiles: ["src/Login.test.tsx"],
      actions: [{ type: "run-task", title: "Approve test task", description: "Run tests only after approval.", taskName: "test" }]
    }
  ]
})): AIRuntimeProvider {
  const id: AIRuntimeProviderId = "ollama";
  const info = detection(id);
  return {
    id,
    name: "Test Runtime",
    detect: vi.fn(async () => info),
    health: vi.fn(async () => info),
    listModels: vi.fn(async () => info.supportedModels),
    startModel: vi.fn(async () => undefined),
    stopModel: vi.fn(async () => undefined),
    pullModel: vi.fn(async function* () {}),
    deleteModel: vi.fn(async (modelId: string) => ({ providerId: id, modelId, status: "Completed" as const, progress: 1 })),
    startRuntime: vi.fn(async (modelId?: string) => ({ providerId: id, modelId: modelId ?? "", status: "Completed" as const, progress: 1 })),
    stopRuntime: vi.fn(async (modelId?: string) => ({ providerId: id, modelId: modelId ?? "", status: "Completed" as const, progress: 1 })),
    restartRuntime: vi.fn(async (modelId?: string) => ({ providerId: id, modelId: modelId ?? "", status: "Completed" as const, progress: 1 })),
    cancelRequest: vi.fn(async () => undefined),
    chat: vi.fn(async (request: AIRuntimeRequest): Promise<AIRuntimeInvocationResponse> => ({ requestId: request.requestId ?? "agent-chat-1", providerId: id, model: request.model, content, latencyMs: 1 })),
    completion: vi.fn(async (request: AIRuntimeRequest): Promise<AIRuntimeInvocationResponse> => ({ requestId: request.requestId ?? "completion-1", providerId: id, model: request.model, content: "ok", latencyMs: 1 })),
    embeddings: vi.fn(async (_input: string | string[], modelId = "model-a") => ({ requestId: "embeddings-1", providerId: id, model: modelId, embeddings: [[0.1]], latencyMs: 1 })),
    stream: vi.fn(async function* () {})
  };
}

function providerWithActions(actions: Array<Record<string, unknown>>): AIRuntimeProvider {
  return provider(JSON.stringify({
    summary: "Concrete file operations prepared.",
    steps: [
      {
        title: "Apply safe file operations",
        description: "Review and apply approved file actions one at a time.",
        estimatedFiles: actions.map((action) => String(action.relativePath ?? "")).filter(Boolean),
        actions
      }
    ]
  }));
}

function fakeWindow() {
  return { isDestroyed: () => false, webContents: { send: vi.fn() } };
}

function createFakeTaskService(tasks: TaskDefinition[]) {
  const listeners: Array<(event: TaskEvent) => void> = [];
  const output: TaskOutputEntry[] = [];
  const problems: TaskProblem[] = [];
  let runStatus: TaskRun["status"] = "running";
  let exitCode: number | undefined;
  const service = {
    onEvent: vi.fn((listener: (event: TaskEvent) => void) => {
      listeners.push(listener);
      return () => undefined;
    }),
    list: vi.fn(async () => ({ detected: tasks, recent: [], running: [], failed: [], pinned: [] })),
    run: vi.fn(async (request: { taskId: string }) => {
      const task = tasks.find((item) => item.id === request.taskId);
      if (!task) throw new Error("Unknown task.");
      const run: TaskRun = {
        id: "task-run-1",
        taskId: task.id,
        label: task.label,
        status: runStatus,
        terminalSessionId: "terminal-1",
        startedAt: "2026-08-02T00:00:00.000Z"
      };
      listeners.forEach((listener) => listener({ type: "status", run }));
      return run;
    }),
    cancel: vi.fn(async () => {
      const run: TaskRun = {
        id: "task-run-1",
        taskId: tasks[0].id,
        label: tasks[0].label,
        status: "cancelled",
        terminalSessionId: "terminal-1",
        startedAt: "2026-08-02T00:00:00.000Z",
        endedAt: "2026-08-02T00:00:01.000Z",
        durationMs: 1000
      };
      listeners.forEach((listener) => listener({ type: "status", run }));
      return run;
    }),
    getOutput: vi.fn(() => output),
    getProblems: vi.fn(() => problems),
    emitOutput(entry: TaskOutputEntry) {
      output.push(entry);
      listeners.forEach((listener) => listener({ type: "output-entry", entry }));
    },
    emitProblems(next: TaskProblem[]) {
      problems.splice(0, problems.length, ...next);
      listeners.forEach((listener) => listener({ type: "problems", problems: next }));
    },
    finish(status: TaskRun["status"], code?: number) {
      runStatus = status;
      exitCode = code;
      const run: TaskRun = {
        id: "task-run-1",
        taskId: tasks[0].id,
        label: tasks[0].label,
        status,
        terminalSessionId: "terminal-1",
        startedAt: "2026-08-02T00:00:00.000Z",
        endedAt: "2026-08-02T00:00:02.000Z",
        durationMs: 2000,
        exitCode
      };
      listeners.forEach((listener) => listener({ type: "status", run }));
    },
    setTasks(next: TaskDefinition[]) {
      tasks.splice(0, tasks.length, ...next);
    },
    setRunStatus(status: TaskRun["status"], code?: number) {
      runStatus = status;
      exitCode = code;
    },
    get exitCode() {
      return exitCode;
    }
  };
  return service;
}

function createFakeGitService() {
  let conflict = false;
  let rebase = false;
  let detached = false;
  let executeError: Error | null = null;
  let previewCount = 0;
  const status = (): GitRepositoryStatus => ({
    repositoryRoot: "C:/workspace",
    currentBranch: detached ? undefined : "main",
    detachedHead: detached,
    headCommit: "abc123",
    hasMergeConflicts: conflict,
    rebaseInProgress: rebase,
    entries: [
      { path: "src/Login.tsx", index: " ", workingTree: "M" },
      { path: "src/App.tsx", index: "M", workingTree: " " }
    ],
    summary: ["## main", " M src/Login.tsx", "M  src/App.tsx"]
  });
  const service = {
    status: vi.fn(async () => status()),
    preview: vi.fn(async (request: GitOperationPreviewRequest) => {
      previewCount += 1;
      if (request.operation === "commit" && conflict) throw new Error("Cannot commit with unresolved merge conflicts.");
      if (request.operation === "commit" && rebase) throw new Error("Cannot commit while a rebase is in progress.");
      if (request.operation === "commit" && !request.commitMessage?.trim()) throw new Error("Git commit message is required.");
      if ((request.operation === "stage-file" || request.operation === "unstage-file" || request.operation === "restore-file") && !request.relativePaths?.length) {
        throw new Error("Git file operation requires at least one affected file.");
      }
      const affectedFiles = request.relativePaths?.length ? request.relativePaths : request.operation === "commit" ? ["src/App.tsx"] : ["src/Login.tsx"];
      return {
        operation: request.operation,
        relativePaths: request.relativePaths ?? [],
        commitMessage: request.commitMessage,
        branchName: request.branchName,
        repositoryRoot: "C:/workspace",
        affectedFiles,
        riskLevel: request.operation === "commit" || request.operation === "restore-file" ? "high" as const : "medium" as const,
        unifiedDiff: "diff --git a/src/Login.tsx b/src/Login.tsx\n@@\n-old\n+new\n",
        fileCount: affectedFiles.length,
        addedLineCount: 1,
        removedLineCount: 1,
        status: status(),
        warnings: detached ? ["Repository is in detached HEAD state."] : [],
        createdAt: `2026-08-02T00:00:0${previewCount}.000Z`
      };
    }),
    execute: vi.fn(async (preview: GitOperationPreview) => {
      if (executeError) throw executeError;
      return {
        preview,
        status: status(),
        commitHash: preview.operation === "commit" ? "def456" : undefined,
        durationMs: 42,
        stdout: preview.operation === "commit" ? "[main def456] Update login\n" : "",
        stderr: ""
      };
    }),
    setConflict(value: boolean) {
      conflict = value;
    },
    setRebase(value: boolean) {
      rebase = value;
    },
    setDetached(value: boolean) {
      detached = value;
    },
    setExecuteError(error: Error | null) {
      executeError = error;
    }
  };
  return service;
}

function createFakeTerminalManager() {
  const listeners: Array<(sessionId: string, data: string) => void> = [];
  let onExitHandler: ((exitCode: number) => void) | undefined;
  const service = {
    onTerminalData: vi.fn((listener: (sessionId: string, data: string) => void) => {
      listeners.push(listener);
      return () => undefined;
    }),
    createCommand: vi.fn((_window: unknown, _request: unknown, onExit?: (exitCode: number) => void) => {
      onExitHandler = onExit;
      return { id: "terminal-1", cwd: "C:/workspace", name: "Agent: npm.cmd", shellKind: "powershell" };
    }),
    kill: vi.fn(() => ({ id: "terminal-1", name: "Agent: npm.cmd", cwd: "C:/workspace", shellKind: "powershell", alive: false, createdAt: "2026-08-02T00:00:00.000Z" })),
    emitData(data: string) {
      listeners.forEach((listener) => listener("terminal-1", data));
    },
    finish(exitCode: number) {
      onExitHandler?.(exitCode);
    }
  };
  return service;
}

async function createService(runtimeProvider = provider(), options: { taskService?: ReturnType<typeof createFakeTaskService>; gitService?: ReturnType<typeof createFakeGitService>; terminalManager?: ReturnType<typeof createFakeTerminalManager>; getWindow?: () => ReturnType<typeof fakeWindow>; getChangedFiles?: () => string[] } = {}) {
  const statePath = path.join(await fsp.mkdtemp(path.join(os.tmpdir(), "levi-agent-")), "agent-state.json");
  const registry = new AIRuntimeProviderRegistry();
  registry.register(runtimeProvider.id, () => runtimeProvider);
  const runtimeManager = new RuntimeManager({ registry, statePath: path.join(path.dirname(statePath), "runtime-state.json"), monitorIntervalMs: 60_000 });
  await runtimeManager.initialize({ startMonitoring: false });
  const service = new AgentService(runtimeManager, {
    statePath,
    getWorkspaceRoot: () => path.dirname(statePath),
    getWorkspaceStatus: () => ({
      state: "ready",
      summary: {
        projectName: "Project",
        rootPath: path.dirname(statePath),
        languages: ["TypeScript"],
        frameworks: ["React"],
        packageManager: "npm",
        likelyEntryPoints: ["src/main.tsx"],
        sourceDirectories: ["src"],
        testDirectories: ["test"],
        scripts: { test: "vitest run" },
        documentationFiles: ["README.md"],
        manifestFiles: ["package.json"],
        includedFileCount: 3,
        excludedFileCount: 1,
        scanTimestamp: "2026-08-01T00:00:00.000Z"
      }
    }),
    taskService: options.taskService as never,
    gitService: options.gitService as never,
    terminalManager: options.terminalManager as never,
    getWindow: options.getWindow as never,
    getChangedFiles: options.getChangedFiles
  });
  await service.initialize();
  return { service, statePath, runtimeProvider, runtimeManager };
}

describe("Coding Agent foundation", () => {
  it("generates a structured execution plan through RuntimeManager without executing actions", async () => {
    const { service, runtimeProvider } = await createService();

    const result = await service.plan({
      prompt: "Build a login page",
      runtimeId: "ollama",
      modelId: "model-a",
      attachments: [{ id: "attachment-1", type: "selected-code", sourceId: "S1", label: "src/main.tsx", relativePath: "src/main.tsx", content: "createRoot(App);" }],
      openFiles: [{ relativePath: "src/main.tsx", language: "typescript" }]
    });

    const session = result.state.sessions[0];
    expect(runtimeProvider.chat).toHaveBeenCalledWith(expect.objectContaining({ model: "model-a", messages: expect.any(Array) }), expect.any(AbortSignal));
    expect(session.status).toBe("WaitingForApproval");
    expect(session.plan?.steps.map((step) => step.title)).toEqual(["Analyze routing", "Plan validation"]);
    expect(session.plan?.approvals).toHaveLength(2);
    expect(session.projectSummary).toMatchObject({ projectName: "Project", openFiles: ["src/main.tsx"], context: { attachmentCount: 1 } });
    expect(session.plan?.progress.completedActions).toBe(0);
  });

  it("tracks approval states, progress, archive, rename, delete, and persistence", async () => {
    const { service, statePath, runtimeManager } = await createService();
    const planned = await service.plan({ prompt: "Add validation", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const actionId = planned.state.sessions[0].plan!.approvals[0].id;

    const approved = await service.approve({ sessionId, actionId });
    expect(approved.sessions[0].plan?.progress).toMatchObject({ approvedActions: 1, completedActions: 0 });
    await service.rename({ sessionId, title: "Validation Plan" });
    await service.archive({ sessionId, archived: true });

    const restored = new AgentService(runtimeManager, { statePath });
    const restoredState = await restored.initialize();
    expect(restoredState.sessions[0]).toMatchObject({ title: "Validation Plan", archived: true });
    expect(fs.readFileSync(statePath, "utf8")).not.toMatch(/(api[_-]?key|token|secret|password)["']?\s*[:=]\s*["'][^"']+/i);

    const deleted = await restored.delete({ sessionId });
    expect(deleted.sessions).toHaveLength(0);
  });

  it("validates IPC payload-shaped requests and rejects unsafe workspace paths", async () => {
    const { service } = await createService();

    await expect(service.plan({ prompt: "", runtimeId: "ollama", modelId: "model-a" })).rejects.toThrow(/prompt/i);
    await expect(service.plan({ prompt: "Read outside", runtimeId: "ollama", modelId: "model-a", attachments: [{ id: "a", type: "file", label: "x", relativePath: "../secret.txt" }] })).rejects.toThrow(/workspace path/i);
    await expect(service.approve({ sessionId: "missing", actionId: "a" })).rejects.toThrow(/not found/i);
  });

  it("wires secure agent IPC through main and preload without autonomous execution", () => {
    const channels = fs.readFileSync(path.join(process.cwd(), "electron/main/ipc-channels.ts"), "utf8");
    const main = fs.readFileSync(path.join(process.cwd(), "electron/main/index.ts"), "utf8");
    const preload = fs.readFileSync(path.join(process.cwd(), "electron/preload/index.ts"), "utf8");
    const service = fs.readFileSync(path.join(process.cwd(), "electron/main/agent-service.ts"), "utf8");

    expect(channels).toContain('agentPlan: "levi:agent:plan"');
    expect(channels).toContain('agentApprove: "levi:agent:approve"');
    expect(channels).toContain('agentExecute: "levi:agent:execute"');
    expect(channels).toContain('agentPreview: "levi:agent:preview"');
    expect(channels).toContain('agentUndo: "levi:agent:undo"');
    expect(channels).toContain('agentQueue: "levi:agent:queue"');
    expect(channels).toContain('agentCancel: "levi:agent:cancel"');
    expect(channels).toContain('agentTaskExecute: "levi:agent:task-execute"');
    expect(channels).toContain('agentTaskVerify: "levi:agent:task-verify"');
    expect(channels).toContain('agentGitPreview: "levi:agent:git-preview"');
    expect(channels).toContain('agentGitExecute: "levi:agent:git-execute"');
    expect(channels).toContain('agentGitStatus: "levi:agent:git-status"');
    expect(channels).toContain('agentTerminalPreview: "levi:agent:terminal-preview"');
    expect(channels).toContain('agentTerminalExecute: "levi:agent:terminal-execute"');
    expect(channels).toContain('agentTerminalCancel: "levi:agent:terminal-cancel"');
    expect(channels).toContain('agentTerminalStatus: "levi:agent:terminal-status"');
    expect(main).toContain("const agentService = new AgentService(aiRuntimeManager");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.agentPlan");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.agentExecute");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.agentTaskExecute");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.agentGitExecute");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.agentTerminalExecute");
    expect(preload).toContain("agent: {");
    expect(preload).toContain("plan: (request: AgentPlanRequest)");
    expect(preload).toContain("execute: (request: AgentExecuteRequest)");
    expect(preload).toContain("taskExecute: (request: AgentTaskExecuteRequest)");
    expect(preload).toContain("gitExecute: (request: AgentGitExecuteRequest)");
    expect(preload).toContain("terminalExecute: (request: AgentTerminalExecuteRequest)");
    expect(service).toContain("this.runtimeManager.chat");
    expect(service).not.toContain("writeWorkspacePath");
    expect(service).not.toContain("taskService.run");
    expect(service).not.toContain("git commit");
  });

  it("previews, executes, and undoes approved create and modify file actions safely", async () => {
    const { service, statePath } = await createService(providerWithActions([
      { type: "create-file", title: "Create generated file", description: "Create a text file.", relativePath: "src/generated.txt", content: "hello\n" },
      { type: "modify-file", title: "Modify existing file", description: "Replace file content.", relativePath: "src/existing.txt", content: "after\r\n" }
    ]));
    const root = path.dirname(statePath);
    await fsp.mkdir(path.join(root, "src"), { recursive: true });
    await fsp.writeFile(path.join(root, "src", "existing.txt"), "before\r\n", "utf8");

    const planned = await service.plan({ prompt: "Create and modify files", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const [createAction, modifyAction] = planned.state.sessions[0].plan!.approvals;

    await service.approve({ sessionId, actionId: createAction.id });
    const createPreview = await service.preview({ sessionId, actionId: createAction.id });
    expect(createPreview.preview).toMatchObject({ targetPath: "src/generated.txt", riskLevel: "low", addedLineCount: 1 });
    expect(fs.existsSync(path.join(root, "src", "generated.txt"))).toBe(false);
    await service.execute({ sessionId, actionId: createAction.id, previewId: createPreview.preview.previewId });
    expect(await fsp.readFile(path.join(root, "src", "generated.txt"), "utf8")).toBe("hello\n");
    await service.undo({ sessionId });
    expect(fs.existsSync(path.join(root, "src", "generated.txt"))).toBe(false);

    await service.approve({ sessionId, actionId: modifyAction.id });
    const modifyPreview = await service.preview({ sessionId, actionId: modifyAction.id });
    expect(modifyPreview.preview.originalContent).toBe("before\r\n");
    expect(modifyPreview.preview.proposedContent).toBe("after\r\n");
    await service.execute({ sessionId, actionId: modifyAction.id, previewId: modifyPreview.preview.previewId });
    expect(await fsp.readFile(path.join(root, "src", "existing.txt"), "utf8")).toBe("after\r\n");
    await service.undo({ sessionId });
    expect(await fsp.readFile(path.join(root, "src", "existing.txt"), "utf8")).toBe("before\r\n");
  });

  it("executes delete, rename file, create folder, rename folder, and stops unsupported actions", async () => {
    const { service, statePath } = await createService(providerWithActions([
      { type: "delete-file", title: "Delete stale file", description: "Remove stale file.", relativePath: "src/stale.txt" },
      { type: "rename-file", title: "Rename file", description: "Move file.", relativePath: "src/old.txt", destinationRelativePath: "src/new.txt" },
      { type: "create-folder", title: "Create folder", description: "Create folder.", relativePath: "src/new-folder" },
      { type: "rename-folder", title: "Rename folder", description: "Rename folder.", relativePath: "src/old-folder", destinationRelativePath: "src/renamed-folder" },
      { type: "run-task", title: "Run test", description: "Unsupported in this milestone.", taskName: "test" }
    ]));
    const root = path.dirname(statePath);
    await fsp.mkdir(path.join(root, "src", "old-folder"), { recursive: true });
    await fsp.writeFile(path.join(root, "src", "stale.txt"), "remove me\n", "utf8");
    await fsp.writeFile(path.join(root, "src", "old.txt"), "move me\n", "utf8");
    const planned = await service.plan({ prompt: "File operations", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const actions = planned.state.sessions[0].plan!.approvals;

    for (const action of actions.slice(0, 4)) {
      await service.approve({ sessionId, actionId: action.id });
      const preview = await service.preview({ sessionId, actionId: action.id });
      await service.execute({ sessionId, actionId: action.id, previewId: preview.preview.previewId });
    }

    expect(fs.existsSync(path.join(root, "src", "stale.txt"))).toBe(false);
    expect(await fsp.readFile(path.join(root, "src", "new.txt"), "utf8")).toBe("move me\n");
    expect(fs.statSync(path.join(root, "src", "new-folder")).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(root, "src", "renamed-folder")).isDirectory()).toBe(true);

    await service.approve({ sessionId, actionId: actions[4].id });
    await expect(service.preview({ sessionId, actionId: actions[4].id })).rejects.toThrow(/workspace file actions/i);
  });

  it("rejects unsafe execution payloads, malformed edits, binary files, and stale previews", async () => {
    const { service, statePath } = await createService(providerWithActions([
      { type: "create-file", title: "Traversal", description: "Bad path.", relativePath: "../outside.txt", content: "x" },
      { type: "modify-file", title: "Malformed edit", description: "Bad edit.", relativePath: "src/edit.txt", edits: [{ kind: "replace", startLine: 3, endLine: 1, content: "x" }] },
      { type: "modify-file", title: "Binary edit", description: "Bad binary.", relativePath: "src/binary.bin", content: "x" },
      { type: "modify-file", title: "Stale edit", description: "Detect stale preview.", relativePath: "src/stale-preview.txt", content: "after\n" }
    ]));
    const root = path.dirname(statePath);
    await fsp.mkdir(path.join(root, "src"), { recursive: true });
    await fsp.writeFile(path.join(root, "src", "edit.txt"), "one\ntwo\n", "utf8");
    await fsp.writeFile(path.join(root, "src", "binary.bin"), Buffer.from([0, 1, 2]));
    await fsp.writeFile(path.join(root, "src", "stale-preview.txt"), "before\n", "utf8");

    const planned = await service.plan({ prompt: "Unsafe file operations", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const actions = planned.state.sessions[0].plan!.approvals;
    for (const action of actions) await service.approve({ sessionId, actionId: action.id });

    await expect(service.preview({ sessionId, actionId: actions[0].id })).rejects.toThrow(/workspace path/i);
    await expect(service.preview({ sessionId, actionId: actions[1].id })).rejects.toThrow(/range/i);
    await expect(service.preview({ sessionId, actionId: actions[2].id })).rejects.toThrow(/Binary/i);
    const preview = await service.preview({ sessionId, actionId: actions[3].id });
    await fsp.writeFile(path.join(root, "src", "stale-preview.txt"), "changed\n", "utf8");
    await expect(service.execute({ sessionId, actionId: actions[3].id, previewId: preview.preview.previewId })).rejects.toThrow(/changed/i);
    const queue = service.queue({ sessionId });
    expect(queue.queue.find((item: { actionId: string; status: string }) => item.actionId === actions[3].id)?.status).toBe("Failed");
  });

  it("runs approved predefined tasks, streams output and problems, and creates a read-only verification summary", async () => {
    const task: TaskDefinition = { id: "npm:test", label: "test", source: "detected", group: "test", command: "npm.cmd", args: ["test"], cwd: ".", problemMatchers: ["$tsc"] };
    const taskService = createFakeTaskService([task]);
    const runtimeProvider = providerWithActions([{ type: "run-task", title: "Run tests", description: "Verify changes.", taskId: "npm:test" }]);
    const { service } = await createService(
      runtimeProvider,
      { taskService, getWindow: fakeWindow, getChangedFiles: () => ["src/Login.tsx"] }
    );
    const planned = await service.plan({ prompt: "Run tests", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const action = planned.state.sessions[0].plan!.approvals[0];

    await expect(service.taskPreview({ sessionId, actionId: action.id })).rejects.toThrow(/approved/i);
    await service.approve({ sessionId, actionId: action.id });
    const preview = await service.taskPreview({ sessionId, actionId: action.id });
    expect(preview.preview).toMatchObject({ taskId: "npm:test", executable: "npm.cmd", args: ["test"], riskLevel: "low", longRunning: false });

    const execution = await service.taskExecute({ sessionId, actionId: action.id, previewId: preview.preview.previewId });
    expect(taskService.run).toHaveBeenCalledWith({ taskId: "npm:test" }, expect.any(Object));
    expect(execution.taskRun).toMatchObject({ status: "Running", terminalSessionId: "terminal-1" });
    taskService.emitOutput({ id: "out-1", source: "task", channel: "test", text: "running tests\n", timestamp: "2026-08-02T00:00:01.000Z", taskRunId: "task-run-1" });
    taskService.emitProblems([{ id: "problem-1", relativePath: "src/app.ts", line: 2, column: 3, severity: "error", message: "boom", source: "test", taskRunId: "task-run-1" }]);
    taskService.finish("succeeded", 0);

    const status = service.taskStatus({ sessionId });
    expect(status.taskRuns[0]).toMatchObject({ status: "Succeeded", exitCode: 0, outputPreview: [expect.objectContaining({ text: "running tests\n" })], problems: [expect.objectContaining({ message: "boom" })] });
    const verification = await service.taskVerify({ sessionId, actionId: action.id });
    expect(runtimeProvider.chat).toHaveBeenCalledTimes(2);
    expect(verification.verification).toMatchObject({ changedFiles: ["src/Login.tsx"] });
  });

  it("executes approved terminal commands through TerminalManager and records live output", async () => {
    const terminalManager = createFakeTerminalManager();
    const runtimeProvider = providerWithActions([{
      type: "run-terminal-command",
      title: "Run terminal tests",
      description: "Run a safe validation command.",
      command: "npm.cmd",
      args: ["test"],
      cwd: ".",
      expectedOutput: "Tests pass.",
      estimatedDurationMs: 1000
    }]);
    const { service, runtimeProvider: providerInstance } = await createService(runtimeProvider, { terminalManager, getWindow: fakeWindow });
    const planned = await service.plan({ prompt: "Run terminal command", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const action = planned.state.sessions[0].plan!.approvals[0];

    await expect(service.terminalPreview({ sessionId, actionId: action.id })).rejects.toThrow(/approved/i);
    await service.approve({ sessionId, actionId: action.id });
    const preview = await service.terminalPreview({ sessionId, actionId: action.id });
    expect(preview.preview).toMatchObject({ executable: "npm.cmd", args: ["test"], riskLevel: "low", expectedOutput: "Tests pass." });
    expect(path.isAbsolute(preview.preview.cwd)).toBe(true);

    const execution = await service.terminalExecute({ sessionId, actionId: action.id, previewId: preview.preview.previewId });
    expect(terminalManager.createCommand).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ command: "npm.cmd", args: ["test"], cwd: preview.preview.cwd }), expect.any(Function));
    expect(execution.terminalRun).toMatchObject({ status: "Running", terminalSessionId: "terminal-1" });
    terminalManager.emitData("running tests\n");
    expect(service.terminalStatus({ sessionId }).terminalRuns[0].outputPreview).toContain("running tests");
    terminalManager.finish(0);
    await waitFor(() => expect(service.terminalStatus({ sessionId }).terminalRuns[0].verification).toBeDefined());
    const finished = service.terminalStatus({ sessionId }).terminalRuns[0];
    expect(finished).toMatchObject({ status: "Succeeded", exitCode: 0, verification: expect.objectContaining({ outputExcerpt: expect.stringContaining("running tests") }) });
    expect(providerInstance.chat).toHaveBeenCalledTimes(2);
  });

  it("rejects dangerous terminal commands, handles cancellation, run-again, queue blocking, and interrupted restore", async () => {
    const terminalManager = createFakeTerminalManager();
    const { service, statePath } = await createService(providerWithActions([
      { type: "run-terminal-command", title: "Chained", description: "Bad chain.", command: "npm.cmd test && npm.cmd build" },
      { type: "run-terminal-command", title: "Shell", description: "Bad shell.", command: "cmd", args: ["/c", "npm test"] },
      { type: "run-terminal-command", title: "Env", description: "Bad env.", command: "npm.cmd", args: ["test", "TOKEN=value"] },
      { type: "run-terminal-command", title: "Safe", description: "Safe command.", command: "npm.cmd", args: ["test"], cwd: "." },
      { type: "run-terminal-command", title: "Second", description: "Second command.", command: "node", args: ["--version"], cwd: "." }
    ]), { terminalManager, getWindow: fakeWindow });
    const planned = await service.plan({ prompt: "Terminal safety", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const actions = planned.state.sessions[0].plan!.approvals;
    for (const action of actions) await service.approve({ sessionId, actionId: action.id });

    await expect(service.terminalPreview({ sessionId, actionId: actions[0].id })).rejects.toThrow(/shell syntax/i);
    await expect(service.terminalPreview({ sessionId, actionId: actions[1].id })).rejects.toThrow(/not allowed/i);
    await expect(service.terminalPreview({ sessionId, actionId: actions[2].id })).rejects.toThrow(/shell syntax/i);

    const preview = await service.terminalPreview({ sessionId, actionId: actions[3].id });
    await service.terminalExecute({ sessionId, actionId: actions[3].id, previewId: preview.preview.previewId });
    await expect(service.terminalExecute({ sessionId, actionId: actions[4].id })).rejects.toThrow(/already running/i);
    await service.terminalCancel({ sessionId, actionId: actions[3].id });
    expect(terminalManager.kill).toHaveBeenCalledWith("terminal-1");
    expect(service.terminalStatus({ sessionId }).terminalRuns.find((run) => run.actionId === actions[3].id)?.status).toBe("Cancelled");

    await service.terminalExecute({ sessionId, actionId: actions[3].id, previewId: preview.preview.previewId });
    terminalManager.finish(1);
    await waitFor(() => expect(service.terminalStatus({ sessionId }).terminalRuns.find((run) => run.actionId === actions[3].id)?.verification).toBeDefined());
    expect(service.terminalStatus({ sessionId }).terminalRuns.find((run) => run.actionId === actions[3].id)).toMatchObject({ status: "Failed", failureReason: "Terminal command failed with exit code 1." });

    const restored = new AgentService(new RuntimeManager({ registry: new AIRuntimeProviderRegistry(), statePath: path.join(path.dirname(statePath), "runtime-restore.json"), monitorIntervalMs: 60_000 }), {
      statePath,
      getWorkspaceRoot: () => path.dirname(statePath),
      terminalManager: createFakeTerminalManager() as never,
      getWindow: fakeWindow as never
    });
    const raw = JSON.parse(await fsp.readFile(statePath, "utf8"));
    raw.sessions[0].plan.terminalRuns = [{
      actionId: actions[4].id,
      commandId: "restore-command",
      executable: "node",
      args: ["--version"],
      cwd: path.dirname(statePath),
      status: "Running",
      terminalSessionId: "terminal-restore",
      outputPreview: "",
      stderrPreview: "",
      updatedAt: "2026-08-02T00:00:00.000Z"
    }];
    await fsp.writeFile(statePath, JSON.stringify(raw), "utf8");
    const restoredState = await restored.initialize();
    expect(restoredState.sessions[0].plan?.terminalRuns[0].status).toBe("Interrupted");
  });

  it("previews and executes approved Git operations through GitService only", async () => {
    const gitService = createFakeGitService();
    const runtimeProvider = providerWithActions([
      { type: "git-operation", title: "Stage login", description: "Stage a reviewed file.", gitOperation: "stage-file", relativePath: "src/Login.tsx" },
      { type: "git-operation", title: "Commit login", description: "Commit staged changes.", gitOperation: "commit", commitMessage: "Update login" },
      { type: "git-operation", title: "Create branch", description: "Create a safe branch.", gitOperation: "create-branch", branchName: "feature/login" },
      { type: "git-operation", title: "Switch branch", description: "Switch to branch.", gitOperation: "switch-branch", branchName: "feature/login" },
      { type: "git-operation", title: "Show diff", description: "Review diff.", gitOperation: "show-diff", affectedFiles: ["src/Login.tsx"] }
    ]);
    const { service } = await createService(runtimeProvider, { gitService });
    const planned = await service.plan({ prompt: "Handle Git operations", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const actions = planned.state.sessions[0].plan!.approvals;

    await expect(service.gitPreview({ sessionId, actionId: actions[0].id })).rejects.toThrow(/approved/i);
    for (const action of actions) {
      await service.approve({ sessionId, actionId: action.id });
      const preview = await service.gitPreview({ sessionId, actionId: action.id });
      expect(preview.preview.repositoryRoot).toBe("C:/workspace");
      expect(preview.preview.fileCount).toBeGreaterThanOrEqual(1);
      const result = await service.gitExecute({ sessionId, actionId: action.id, previewId: preview.preview.previewId });
      expect(result.gitRun.status).toBe("Succeeded");
    }

    expect(gitService.execute).toHaveBeenCalledTimes(actions.length);
    const gitRuns = service.gitStatus({ sessionId }).gitRuns;
    expect(gitRuns.map((run) => run.operation)).toEqual(["stage-file", "commit", "create-branch", "switch-branch", "show-diff"]);
    expect(gitRuns[1]).toMatchObject({ commitHash: "def456", verification: expect.objectContaining({ summary: expect.any(String) }) });
  });

  it("rejects unsafe Git states, stale previews, and concurrent Git actions", async () => {
    const gitService = createFakeGitService();
    const runtimeProvider = providerWithActions([
      { type: "git-operation", title: "Commit bad", description: "Commit conflict.", gitOperation: "commit", commitMessage: "Update login" },
      { type: "git-operation", title: "Restore bad", description: "Reject traversal.", gitOperation: "restore-file", relativePath: "../outside.ts" },
      { type: "git-operation", title: "Stage login", description: "Stage file.", gitOperation: "stage-file", relativePath: "src/Login.tsx" },
      { type: "git-operation", title: "Stage app", description: "Stage another file.", gitOperation: "stage-file", relativePath: "src/App.tsx" }
    ]);
    const { service } = await createService(runtimeProvider, { gitService });
    const planned = await service.plan({ prompt: "Reject unsafe Git", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const actions = planned.state.sessions[0].plan!.approvals;
    for (const action of actions) await service.approve({ sessionId, actionId: action.id });

    gitService.setConflict(true);
    await expect(service.gitPreview({ sessionId, actionId: actions[0].id })).rejects.toThrow(/conflicts/i);
    gitService.setConflict(false);
    gitService.setRebase(true);
    await expect(service.gitPreview({ sessionId, actionId: actions[0].id })).rejects.toThrow(/rebase/i);
    gitService.setRebase(false);
    gitService.setDetached(true);
    const detachedPreview = await service.gitPreview({ sessionId, actionId: actions[0].id });
    expect(detachedPreview.preview.warnings).toContain("Repository is in detached HEAD state.");
    gitService.setDetached(false);

    await expect(service.gitPreview({ sessionId, actionId: actions[1].id })).rejects.toThrow(/affected file/i);
    const preview = await service.gitPreview({ sessionId, actionId: actions[2].id });
    gitService.setExecuteError(new Error("Git repository state changed since preview."));
    await expect(service.gitExecute({ sessionId, actionId: actions[2].id, previewId: preview.preview.previewId })).rejects.toThrow(/changed/i);
    expect(service.gitStatus({ sessionId }).gitRuns.find((run) => run.actionId === actions[2].id)?.status).toBe("Failed");

    gitService.setExecuteError(null);
    const state = service.status({ sessionId });
    if (!("plan" in state) || !state.plan) throw new Error("Expected session state.");
    state.plan.gitRuns.push({
      actionId: actions[3].id,
      operation: "stage-file",
      status: "Executing",
      repositoryRoot: "C:/workspace",
      affectedFiles: ["src/App.tsx"],
      updatedAt: "2026-08-02T00:00:00.000Z"
    });
    await expect(service.gitExecute({ sessionId, actionId: actions[3].id })).rejects.toThrow(/already executing/i);
  });

  it("rejects missing and stale task definitions without running them", async () => {
    const task: TaskDefinition = { id: "npm:test", label: "test", source: "detected", group: "test", command: "npm.cmd", args: ["test"], cwd: ".", problemMatchers: [] };
    const taskService = createFakeTaskService([task]);
    const { service } = await createService(
      providerWithActions([
        { type: "run-task", title: "Missing task", description: "Missing.", taskId: "missing" },
        { type: "run-task", title: "Stale task", description: "Stale.", taskId: "npm:test", taskFingerprint: "old" }
      ]),
      { taskService, getWindow: fakeWindow }
    );
    const planned = await service.plan({ prompt: "Task checks", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const [missing, stale] = planned.state.sessions[0].plan!.approvals;
    await service.approve({ sessionId, actionId: missing.id });
    await service.approve({ sessionId, actionId: stale.id });

    await expect(service.taskPreview({ sessionId, actionId: missing.id })).rejects.toThrow(/missing task/i);
    await expect(service.taskPreview({ sessionId, actionId: stale.id })).rejects.toThrow(/changed/i);
    expect(taskService.run).not.toHaveBeenCalled();
  });

  it("tracks failed, cancelled, long-running, run-again, queue pause, and restart interruption states", async () => {
    const task: TaskDefinition = { id: "npm:dev", label: "dev", source: "detected", group: "dev", command: "npm.cmd", args: ["run", "dev"], cwd: ".", problemMatchers: [] };
    const taskService = createFakeTaskService([task]);
    const { service, statePath, runtimeManager } = await createService(
      providerWithActions([{ type: "run-task", title: "Run dev", description: "Start dev server.", taskId: "npm:dev" }]),
      { taskService, getWindow: fakeWindow }
    );
    const planned = await service.plan({ prompt: "Start dev", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const action = planned.state.sessions[0].plan!.approvals[0];
    await service.approve({ sessionId, actionId: action.id });
    const preview = await service.taskPreview({ sessionId, actionId: action.id });
    expect(preview.preview.longRunning).toBe(true);

    await service.taskExecute({ sessionId, actionId: action.id, previewId: preview.preview.previewId });
    await expect(service.taskExecute({ sessionId, actionId: action.id, previewId: preview.preview.previewId })).rejects.toThrow(/already running/i);
    await service.taskCancel({ sessionId, actionId: action.id });
    expect(service.taskStatus({ sessionId }).taskRuns[0].status).toBe("Cancelled");

    taskService.setRunStatus("failed", 1);
    await service.taskExecute({ sessionId, actionId: action.id, previewId: preview.preview.previewId });
    taskService.finish("failed", 1);
    expect(service.taskStatus({ sessionId }).taskRuns[0]).toMatchObject({ status: "Failed", failureReason: "Task failed with exit code 1." });

    taskService.setRunStatus("running");
    await service.taskExecute({ sessionId, actionId: action.id, previewId: preview.preview.previewId });
    const restored = new AgentService(runtimeManager, { statePath, taskService: taskService as never, getWindow: fakeWindow as never });
    const restoredState = await restored.initialize();
    expect(restoredState.sessions[0].plan?.taskRuns[0].status).toBe("Interrupted");
  });

  it("executes the supported local GitService operations without network or force commands", async () => {
    try {
      execFileSync("git", ["--version"], { stdio: "ignore" });
    } catch {
      return;
    }
    const repo = await fsp.mkdtemp(path.join(os.tmpdir(), "levi-git-service-"));
    const runGit = (args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" }).toString();
    runGit(["init"]);
    runGit(["config", "user.email", "levi@example.test"]);
    runGit(["config", "user.name", "Levi Test"]);
    await fsp.writeFile(path.join(repo, "file.txt"), "one\n", "utf8");
    runGit(["add", "file.txt"]);
    runGit(["commit", "-m", "Initial"]);
    await fsp.mkdir(path.join(repo, "subdir"));
    await expect(new GitService(() => path.join(repo, "subdir")).status()).rejects.toThrow(/outside the selected workspace/i);

    const service = new GitService(() => repo);
    await fsp.writeFile(path.join(repo, "file.txt"), "one\ntwo\n", "utf8");
    const diffPreview = await service.preview({ operation: "show-diff", relativePaths: ["file.txt"] });
    expect(diffPreview.unifiedDiff).toContain("+two");

    const stagePreview = await service.preview({ operation: "stage-file", relativePaths: ["file.txt"] });
    await service.execute(stagePreview);
    expect((await service.status()).entries[0]).toMatchObject({ path: "file.txt", index: "M" });

    const unstagePreview = await service.preview({ operation: "unstage-file", relativePaths: ["file.txt"] });
    await service.execute(unstagePreview);
    expect((await service.status()).entries[0]).toMatchObject({ path: "file.txt", workingTree: "M" });

    const stageAllPreview = await service.preview({ operation: "stage-all" });
    await service.execute(stageAllPreview);
    const commitPreview = await service.preview({ operation: "commit", commitMessage: "Update file" });
    const commitResult = await service.execute(commitPreview);
    expect(commitResult.commitHash).toMatch(/[0-9a-f]+/);

    const branchPreview = await service.preview({ operation: "create-branch", branchName: "feature/git-ops" });
    await service.execute(branchPreview);
    const switchPreview = await service.preview({ operation: "switch-branch", branchName: "feature/git-ops" });
    await service.execute(switchPreview);
    expect((await service.status()).currentBranch).toBe("feature/git-ops");

    await fsp.writeFile(path.join(repo, "file.txt"), "changed again\n", "utf8");
    const restorePreview = await service.preview({ operation: "restore-file", relativePaths: ["file.txt"] });
    await service.execute(restorePreview);
    expect((await fsp.readFile(path.join(repo, "file.txt"), "utf8")).replace(/\r\n/g, "\n")).toBe("one\ntwo\n");
  }, 15_000);

  it("renders the planning-only Agent panel and approval queue", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Coding Agent" }));
    const panel = await screen.findByRole("region", { name: "Coding Agent" });
    await user.click(await within(panel).findByRole("button", { name: /File src\/main\.tsx/i }));
    await waitFor(() => expect(window.levi.chat.previewContext).toHaveBeenCalledWith(expect.objectContaining({ source: "workspace-file", relativePath: "src/main.tsx" })));
    await user.type(within(panel).getByRole("textbox", { name: "Agent Request" }), "Build a login page");
    await user.click(within(panel).getByRole("button", { name: "Generate Plan" }));

    await waitFor(() => expect(window.levi.agent.plan).toHaveBeenCalledWith(expect.objectContaining({ prompt: "Build a login page", modelId: "qwen3.6:latest" })));
    expect(await within(panel).findByRole("region", { name: "Execution Plan" })).toBeInTheDocument();
    expect(within(panel).getByText("Approve file proposal")).toBeInTheDocument();
    expect(within(panel).getByText("0 approved")).toBeInTheDocument();
  });

  it("renders execution preview diff and applies only after explicit approval", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Coding Agent" }));
    const panel = await screen.findByRole("region", { name: "Coding Agent" });
    await user.type(within(panel).getByRole("textbox", { name: "Agent Request" }), "Build a login page");
    await user.click(within(panel).getByRole("button", { name: "Generate Plan" }));
    await user.click(await within(panel).findByRole("button", { name: "Approve" }));
    await user.click(await within(panel).findByRole("button", { name: "Preview" }));

    expect(await within(panel).findByRole("group", { name: "Monaco Diff Review" })).toBeInTheDocument();
    expect(within(panel).getByText("return <form>Login</form>;")).toBeInTheDocument();
    const dialog = within(panel).getByRole("group", { name: "Approval Dialog" });
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(window.levi.agent.execute).toHaveBeenCalledWith(expect.objectContaining({ actionId: "action-1", previewId: "preview-1" })));
  });

  it("renders task approval, running output, terminal reveal, and verification controls", async () => {
    const user = userEvent.setup();
    window.levi.agent.plan = vi.fn(async (request) => ({
      sessionId: "agent-task-1",
      state: {
        sessions: [{
          id: "agent-task-1",
          title: "Run tests",
          status: "WaitingForApproval" as const,
          archived: false,
          runtimeId: request.runtimeId,
          modelId: request.modelId,
          attachments: [],
          messages: [],
          plan: {
            id: "plan-task-1",
            objective: request.prompt,
            summary: "Run validation.",
            estimatedFiles: [],
            progress: { totalSteps: 1, pendingActions: 1, approvedActions: 0, rejectedActions: 0, completedActions: 0 },
            steps: [{ id: "step-task-1", order: 1, title: "Validate", description: "Run tests.", status: "Pending" as const, estimatedFiles: [], actionIds: ["task-action-1"] }],
            approvals: [{
              id: "task-action-1",
              type: "run-task" as const,
              title: "Run test task",
              description: "Run validation tests.",
              status: "Pending" as const,
              stepId: "step-task-1",
              taskId: "npm:test",
              taskName: "test",
              createdAt: "2026-08-01T00:00:00.000Z",
              updatedAt: "2026-08-01T00:00:00.000Z"
            }],
            executionQueue: [],
            taskRuns: [],
            terminalRuns: [],
            gitRuns: [],
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z"
          },
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z"
        }],
        activeSessionId: "agent-task-1",
        updatedAt: "2026-08-01T00:00:00.000Z"
      }
    }));
    window.levi.agent.approve = vi.fn(async (request) => ({
      sessions: [{
        id: request.sessionId,
        title: "Run tests",
        status: "Ready" as const,
        archived: false,
        messages: [],
        attachments: [],
        plan: {
          id: "plan-task-1",
          objective: "Run tests",
          summary: "Run validation.",
          estimatedFiles: [],
          progress: { totalSteps: 1, pendingActions: 0, approvedActions: 1, rejectedActions: 0, completedActions: 0 },
          steps: [{ id: "step-task-1", order: 1, title: "Validate", description: "Run tests.", status: "Approved" as const, estimatedFiles: [], actionIds: [request.actionId] }],
          approvals: [{
            id: request.actionId,
            type: "run-task" as const,
            title: "Run test task",
            description: "Run validation tests.",
            status: "Approved" as const,
            stepId: "step-task-1",
            taskId: "npm:test",
            taskName: "test",
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z"
          }],
          executionQueue: [],
          taskRuns: [],
          terminalRuns: [],
          gitRuns: [],
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z"
        },
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      }],
      activeSessionId: request.sessionId,
      updatedAt: "2026-08-01T00:00:00.000Z"
    }));
    window.levi.agent.taskPreview = vi.fn(async (request) => ({
      sessionId: request.sessionId,
      preview: {
        previewId: "task-preview-1",
        sessionId: request.sessionId,
        actionId: request.actionId,
        taskId: "npm:test",
        taskName: "test",
        source: "detected" as const,
        executable: "npm.cmd",
        args: ["test"],
        cwd: ".",
        expectedPurpose: "Run validation tests.",
        riskLevel: "low" as const,
        longRunning: false,
        definitionFingerprint: "fingerprint",
        createdAt: "2026-08-01T00:00:00.000Z"
      },
      state: {
        sessions: [{
          id: request.sessionId,
          title: "Run tests",
          status: "Ready" as const,
          archived: false,
          messages: [],
          attachments: [],
          plan: {
            id: "plan-task-1",
            objective: "Run tests",
            summary: "Run validation.",
            estimatedFiles: [],
            progress: { totalSteps: 1, pendingActions: 0, approvedActions: 1, rejectedActions: 0, completedActions: 0 },
            steps: [],
            approvals: [],
            executionQueue: [],
            taskRuns: [{
              actionId: request.actionId,
              taskId: "npm:test",
              taskName: "test",
              status: "Running" as const,
              runId: "task-run-1",
              terminalSessionId: "terminal-1",
              startedAt: "2026-08-01T00:00:00.000Z",
              longRunning: false,
              definitionFingerprint: "fingerprint",
              outputPreview: [{ id: "out-1", source: "task" as const, channel: "test", text: "pass\n", timestamp: "2026-08-01T00:00:00.000Z", taskRunId: "task-run-1" }],
              problems: [],
              updatedAt: "2026-08-01T00:00:00.000Z"
            }],
            terminalRuns: [],
            gitRuns: [],
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z"
          },
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z"
        }],
        activeSessionId: request.sessionId,
        updatedAt: "2026-08-01T00:00:00.000Z"
      }
    }));

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Coding Agent" }));
    const panel = await screen.findByRole("region", { name: "Coding Agent" });
    await user.type(within(panel).getByRole("textbox", { name: "Agent Request" }), "Run tests");
    await user.click(within(panel).getByRole("button", { name: "Generate Plan" }));
    await user.click(await within(panel).findByRole("button", { name: "Approve" }));
    await user.click(await within(panel).findByRole("button", { name: "Preview" }));

    expect(await within(panel).findByRole("group", { name: "Task Approval Card" })).toBeInTheDocument();
    expect(within(panel).getByText("npm.cmd")).toBeInTheDocument();
    expect(within(panel).getByText("pass")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Cancel Task" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Reveal Terminal" })).toBeInTheDocument();
  });

  it("renders Git approval, diff, branch, commit, and verification details", async () => {
    const user = userEvent.setup();
    window.levi.agent.plan = vi.fn(async (request) => ({
      sessionId: "agent-git-1",
      state: {
        sessions: [{
          id: "agent-git-1",
          title: "Commit changes",
          status: "WaitingForApproval" as const,
          archived: false,
          runtimeId: request.runtimeId,
          modelId: request.modelId,
          attachments: [],
          messages: [],
          plan: {
            id: "plan-git-1",
            objective: request.prompt,
            summary: "Review Git operation.",
            estimatedFiles: ["src/Login.tsx"],
            progress: { totalSteps: 1, pendingActions: 1, approvedActions: 0, rejectedActions: 0, completedActions: 0 },
            steps: [{ id: "step-git-1", order: 1, title: "Commit", description: "Commit staged work.", status: "Pending" as const, estimatedFiles: ["src/Login.tsx"], actionIds: ["git-action-1"] }],
            approvals: [{
              id: "git-action-1",
              type: "git-operation" as const,
              title: "Commit login changes",
              description: "Commit staged login changes.",
              status: "Pending" as const,
              stepId: "step-git-1",
              gitOperation: "commit",
              commitMessage: "Update login",
              affectedFiles: ["src/Login.tsx"],
              createdAt: "2026-08-01T00:00:00.000Z",
              updatedAt: "2026-08-01T00:00:00.000Z"
            }],
            executionQueue: [],
            taskRuns: [],
            terminalRuns: [],
            gitRuns: [],
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z"
          },
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z"
        }],
        activeSessionId: "agent-git-1",
        updatedAt: "2026-08-01T00:00:00.000Z"
      }
    }));
    window.levi.agent.approve = vi.fn(async (request) => ({
      sessions: [{
        id: request.sessionId,
        title: "Commit changes",
        status: "Ready" as const,
        archived: false,
        messages: [],
        attachments: [],
        plan: {
          id: "plan-git-1",
          objective: "Commit changes",
          summary: "Review Git operation.",
          estimatedFiles: ["src/Login.tsx"],
          progress: { totalSteps: 1, pendingActions: 0, approvedActions: 1, rejectedActions: 0, completedActions: 0 },
          steps: [{ id: "step-git-1", order: 1, title: "Commit", description: "Commit staged work.", status: "Approved" as const, estimatedFiles: ["src/Login.tsx"], actionIds: [request.actionId] }],
          approvals: [{
            id: request.actionId,
            type: "git-operation" as const,
            title: "Commit login changes",
            description: "Commit staged login changes.",
            status: "Approved" as const,
            stepId: "step-git-1",
            gitOperation: "commit",
            commitMessage: "Update login",
            affectedFiles: ["src/Login.tsx"],
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z"
          }],
          executionQueue: [],
          taskRuns: [],
          terminalRuns: [],
          gitRuns: [],
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z"
        },
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      }],
      activeSessionId: request.sessionId,
      updatedAt: "2026-08-01T00:00:00.000Z"
    }));
    window.levi.agent.gitPreview = vi.fn(async (request) => ({
      sessionId: request.sessionId,
      preview: {
        previewId: "git-preview-1",
        sessionId: request.sessionId,
        actionId: request.actionId,
        operation: "commit" as const,
        repositoryRoot: "C:/workspace",
        relativePaths: ["src/Login.tsx"],
        affectedFiles: ["src/Login.tsx"],
        commitMessage: "Update login",
        riskLevel: "high" as const,
        unifiedDiff: "diff --git a/src/Login.tsx b/src/Login.tsx\n@@\n-old\n+new\n",
        fileCount: 1,
        addedLineCount: 1,
        removedLineCount: 1,
        status: {
          repositoryRoot: "C:/workspace",
          currentBranch: "main",
          detachedHead: false,
          headCommit: "abc123",
          hasMergeConflicts: false,
          rebaseInProgress: false,
          entries: [{ path: "src/Login.tsx", index: "M", workingTree: " " }],
          summary: ["## main", "M  src/Login.tsx"]
        },
        warnings: [],
        createdAt: "2026-08-01T00:00:00.000Z"
      },
      state: {
        sessions: [{
          id: request.sessionId,
          title: "Commit changes",
          status: "Ready" as const,
          archived: false,
          messages: [],
          attachments: [],
          plan: {
            id: "plan-git-1",
            objective: "Commit changes",
            summary: "Review Git operation.",
            estimatedFiles: ["src/Login.tsx"],
            progress: { totalSteps: 1, pendingActions: 0, approvedActions: 1, rejectedActions: 0, completedActions: 0 },
            steps: [],
            approvals: [],
            executionQueue: [],
            taskRuns: [],
            terminalRuns: [],
            gitRuns: [{
              actionId: request.actionId,
              operation: "commit" as const,
              status: "Succeeded" as const,
              repositoryRoot: "C:/workspace",
              affectedFiles: ["src/Login.tsx"],
              commitMessage: "Update login",
              commitHash: "def456",
              verification: {
                id: "git-verification-1",
                actionId: request.actionId,
                operation: "commit" as const,
                summary: "Commit created successfully.",
                repositoryRoot: "C:/workspace",
                currentBranch: "main",
                commitHash: "def456",
                durationMs: 42,
                affectedFiles: ["src/Login.tsx"],
                statusLines: ["## main"],
                createdAt: "2026-08-01T00:00:00.000Z"
              },
              updatedAt: "2026-08-01T00:00:00.000Z"
            }],
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z"
          },
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z"
        }],
        activeSessionId: request.sessionId,
        updatedAt: "2026-08-01T00:00:00.000Z"
      }
    }));

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Coding Agent" }));
    const panel = await screen.findByRole("region", { name: "Coding Agent" });
    await user.type(within(panel).getByRole("textbox", { name: "Agent Request" }), "Commit changes");
    await user.click(within(panel).getByRole("button", { name: "Generate Plan" }));
    await user.click(await within(panel).findByRole("button", { name: "Approve" }));
    await user.click(await within(panel).findByRole("button", { name: "Preview" }));

    expect(await within(panel).findByRole("group", { name: "Git Approval Card" })).toBeInTheDocument();
    expect(within(panel).getByText("Update login")).toBeInTheDocument();
    expect(within(panel).getByText("src/Login.tsx")).toBeInTheDocument();
    expect(within(panel).getByRole("group", { name: "Git Diff Review" })).toBeInTheDocument();
    expect(within(panel).getByText("Commit created successfully.")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Approve Git Operation" })).toBeInTheDocument();
  });
});
