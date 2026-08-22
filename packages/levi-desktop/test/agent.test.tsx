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
import type { WorkspaceScanSummary } from "../src/types/levi-api";
import type { AgentSession } from "../src/features/agent";
import { App } from "../src/app/App";

const lazySurfaceWait = { timeout: 5000 };

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

function providerWithResponses(contents: string[]): AIRuntimeProvider {
  const runtime = provider(contents[0]);
  let index = 0;
  runtime.chat = vi.fn(async (request: AIRuntimeRequest): Promise<AIRuntimeInvocationResponse> => {
    const content = contents[Math.min(index, contents.length - 1)];
    index += 1;
    return { requestId: request.requestId ?? `agent-chat-${index}`, providerId: runtime.id, model: request.model, content, latencyMs: 1 };
  });
  return runtime;
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
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
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
    },
    listenerCount() {
      return listeners.length;
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
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
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
    },
    listenerCount() {
      return listeners.length;
    }
  };
  return service;
}

const nodeExecutable = process.platform === "win32" ? "node.exe" : "node";

function createFakeBrowserService() {
  const session = {
    id: "browser-1",
    status: "Ready" as const,
    currentUrl: "https://example.com/",
    title: "Example Domain",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    headless: true
  };
  return {
    preview: vi.fn((request: Record<string, unknown>) => ({
      previewId: "browser-preview-1",
      sessionId: typeof request.sessionId === "string" ? request.sessionId : undefined,
      action: request.action as "open",
      targetUrl: typeof request.url === "string" ? request.url : undefined,
      sensitive: false,
      purpose: typeof request.purpose === "string" ? request.purpose : undefined,
      riskLevel: "medium" as const,
      createdAt: "2026-08-01T00:00:00.000Z"
    })),
    create: vi.fn(async () => ({
      session,
      snapshot: {
        sessionId: session.id,
        url: session.currentUrl,
        title: session.title,
        status: session.status,
        elements: [{ ref: "E1", role: "button", name: "Continue", elementType: "button", text: "Continue", enabled: true, sensitive: false }],
        capturedAt: "2026-08-01T00:00:00.000Z"
      }
    })),
    navigate: vi.fn(async () => ({ session })),
    click: vi.fn(async () => ({ session })),
    fill: vi.fn(async () => ({ session })),
    screenshot: vi.fn(async () => ({ session, screenshotPath: "C:\\tmp\\browser.png" })),
    close: vi.fn(async () => ({ sessionId: session.id, status: "Closed" as const }))
  };
}

async function createService(runtimeProvider = provider(), options: { taskService?: ReturnType<typeof createFakeTaskService>; gitService?: ReturnType<typeof createFakeGitService>; terminalManager?: ReturnType<typeof createFakeTerminalManager>; browserService?: ReturnType<typeof createFakeBrowserService>; getWindow?: () => ReturnType<typeof fakeWindow>; getChangedFiles?: () => string[]; workspaceSummary?: WorkspaceScanSummary } = {}) {
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
      summary: options.workspaceSummary ?? {
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
    browserService: options.browserService as never,
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

  it("uses deterministic React + Vite bootstrap for new fitness apps without model planning", async () => {
    const runtimeProvider = provider();
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "levi-agent-new-app-"));
    const { service } = await createService(runtimeProvider, {
      workspaceSummary: {
        projectName: "Empty",
        rootPath: root,
        languages: [],
        frameworks: [],
        packageManager: undefined,
        likelyEntryPoints: [],
        sourceDirectories: [],
        testDirectories: [],
        scripts: {},
        documentationFiles: [],
        manifestFiles: [],
        includedFileCount: 0,
        excludedFileCount: 0,
        scanTimestamp: "2026-08-01T00:00:00.000Z"
      }
    });

    const result = await service.plan({
      prompt: "Build me a simple fitness tracking web app with a dashboard, workout list, add-workout form, and local data persistence.",
      runtimeId: "ollama",
      modelId: "model-a"
    });

    const plan = result.state.sessions[0].plan!;
    expect(runtimeProvider.chat).not.toHaveBeenCalled();
    expect(plan.planningMode).toBe("deterministic-bootstrap");
    expect(plan.starterId).toBe("react-vite");
    expect(plan.projectSlug).toBe("fitness-tracker");
    expect(plan.approvals.some((action) => action.type === "create-file" && action.relativePath === "package.json")).toBe(true);
    expect(plan.approvals.some((action) => action.type === "run-terminal-command" && action.command?.includes("npm"))).toBe(true);
    expect(plan.approvals.some((action) => action.type === "modify-file" && action.relativePath === "src/App.tsx" && action.content?.includes("localStorage"))).toBe(true);
    expect(plan.milestones).toContain("Verify completed app");
  });

  it("places deterministic new apps in a child folder when the workspace is non-empty", async () => {
    const runtimeProvider = provider();
    const { service } = await createService(runtimeProvider);

    const result = await service.plan({
      prompt: "Build me a calculator app",
      runtimeId: "ollama",
      modelId: "model-a"
    });

    const plan = result.state.sessions[0].plan!;
    expect(runtimeProvider.chat).not.toHaveBeenCalled();
    expect(plan.starterId).toBe("vanilla-web");
    expect(plan.approvals.map((action) => action.relativePath).filter(Boolean)).toContain("calculator/index.html");
    expect(plan.approvals.some((action) => action.type === "run-terminal-command" && action.cwd === "calculator")).toBe(true);
  });

  it("updates an existing Android starter in place for Android build prompts", async () => {
    const runtimeProvider = provider();
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "levi-agent-android-app-"));
    const { service } = await createService(runtimeProvider, {
      workspaceSummary: {
        projectName: "TruckerFitness",
        rootPath: root,
        languages: ["Kotlin"],
        frameworks: ["Jetpack Compose"],
        packageManager: undefined,
        likelyEntryPoints: ["app/src/main/java/app/levi/generated/MainActivity.kt"],
        sourceDirectories: ["app/src/main"],
        testDirectories: [],
        scripts: {},
        documentationFiles: [],
        manifestFiles: ["settings.gradle.kts", "build.gradle.kts", "gradlew.bat", "app/build.gradle.kts", "app/src/main/AndroidManifest.xml"],
        includedFileCount: 8,
        excludedFileCount: 0,
        scanTimestamp: "2026-08-19T00:00:00.000Z"
      }
    });

    const result = await service.plan({
      prompt: "Build me an Android fitness app for truck drivers using Kotlin and Jetpack Compose.",
      runtimeId: "ollama",
      modelId: "model-a"
    });

    const plan = result.state.sessions[0].plan!;
    expect(runtimeProvider.chat).not.toHaveBeenCalled();
    expect(plan.starterId).toBe("android-compose");
    expect(plan.approvals.some((action) => action.type === "create-file" && action.relativePath?.startsWith("trucker-fitness/"))).toBe(false);
    expect(plan.approvals.some((action) => action.type === "modify-file" && action.relativePath === "app/src/main/java/app/levi/generated/MainActivity.kt" && action.content?.includes("Trucker Fitness"))).toBe(true);
    expect(plan.approvals.some((action) => action.type === "run-terminal-command" && action.command === (process.platform === "win32" ? "gradlew.bat" : "./gradlew") && action.cwd === ".")).toBe(true);
  });

  it("recovers structured plans from fenced JSON with trailing commas", async () => {
    const malformed = "```json\n{\"summary\":\"Recovered plan\",\"steps\":[{\"title\":\"Edit\",\"description\":\"\",\"estimatedFiles\":[\"src/App.tsx\",],\"actions\":[{\"type\":\"modify-file\",\"title\":\"Edit app\",\"description\":\"\",\"relativePath\":\"src/App.tsx\",},],},],}\n```";
    const { service } = await createService(provider(malformed));

    const result = await service.plan({ prompt: "Update the existing dashboard copy", runtimeId: "ollama", modelId: "model-a" });

    const plan = result.state.sessions[0].plan!;
    expect(plan.summary).toBe("Recovered plan");
    expect(plan.approvals[0]).toMatchObject({ type: "modify-file", relativePath: "src/App.tsx" });
  });

  it("previews and executes approved browser actions through BrowserService only", async () => {
    const browserService = createFakeBrowserService();
    const browserProvider = provider(JSON.stringify({
      summary: "Open the app in a browser after approval.",
      steps: [
        {
          title: "Open browser",
          description: "Open the local app URL.",
          estimatedFiles: [],
          actions: [
            {
              type: "browser-open",
              title: "Open app URL",
              description: "Open a browser session for the approved URL.",
              browserUrl: "https://example.com",
              headless: true
            }
          ]
        }
      ]
    }));
    const { service } = await createService(browserProvider, { browserService });
    const planned = await service.plan({ prompt: "Open the browser", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const actionId = planned.state.sessions[0].plan!.approvals[0].id;

    await expect(service.browserPreview({ sessionId, actionId })).rejects.toThrow(/approved/i);
    await service.approve({ sessionId, actionId });
    const preview = await service.browserPreview({ sessionId, actionId });
    expect(preview.preview).toMatchObject({ action: "open", targetUrl: "https://example.com" });

    const executed = await service.browserExecute({ sessionId, actionId });
    expect(browserService.create).toHaveBeenCalledWith(expect.objectContaining({ action: "open", url: "https://example.com" }));
    expect(executed.browserRun.status).toBe("Succeeded");
    expect(executed.browserRun.result?.snapshot?.elements[0].ref).toBe("E1");
    expect(executed.state.sessions[0].plan?.progress.completedActions).toBe(1);
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

  it("recovers corrupt persistence, isolates project sessions, redacts secrets, and bounds operation history", async () => {
    const { service, statePath, runtimeManager } = await createService(providerWithActions([
      { type: "run-terminal-command", title: "Secret command", description: "Run with token.", command: nodeExecutable, args: ["--token=super-secret-value"], cwd: "." }
    ]));
    const root = path.dirname(statePath);
    const planned = await service.plan({ prompt: "Run secret command", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    await service.approve({ sessionId, actionId: planned.state.sessions[0].plan!.approvals[0].id });

    const raw = await fsp.readFile(statePath, "utf8");
    expect(raw).not.toContain("super-secret-value");
    expect(raw).toContain("[REDACTED]");

    const parsed = JSON.parse(raw);
    const session = parsed.sessions[0];
    session.plan.recovery = {
      schemaVersion: 1,
      operations: Array.from({ length: 120 }, (_, index) => ({
        operationId: `op-${index}`,
        sessionId,
        title: `Operation ${index}`,
        status: "Completed",
        userRequest: "Bound history",
        approvedScope: [],
        actionsAttempted: [],
        actionsCompleted: [],
        actionsFailed: [],
        filesCreated: [],
        filesModified: [],
        filesDeleted: [],
        filesRenamed: [],
        commandsExecuted: [],
        repairAttempts: 0,
        snapshots: [],
        startedAt: "2026-08-01T00:00:00.000Z"
      })),
      interruptedOperationIds: []
    };
    await fsp.writeFile(statePath, JSON.stringify(parsed), "utf8");
    const bounded = new AgentService(runtimeManager, { statePath, getWorkspaceRoot: () => root });
    const boundedState = await bounded.initialize();
    expect(boundedState.sessions[0].plan?.recovery?.operations).toHaveLength(100);

    const otherRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "levi-agent-other-"));
    const isolated = new AgentService(runtimeManager, { statePath, getWorkspaceRoot: () => otherRoot });
    const isolatedState = await isolated.initialize();
    expect(isolatedState.sessions).toHaveLength(0);

    await fsp.writeFile(statePath, "{not json", "utf8");
    const corrupt = new AgentService(runtimeManager, { statePath, getWorkspaceRoot: () => root });
    const recovered = await corrupt.initialize();
    expect(recovered.sessions).toHaveLength(0);
    expect((await fsp.readdir(path.dirname(statePath))).some((file) => file.includes("agent-state.json.corrupt-"))).toBe(true);
  });

  it("marks incomplete file operations interrupted after crash recovery", async () => {
    const { statePath, runtimeManager } = await createService();
    const root = path.dirname(statePath);
    const sessionId = "session-crash";
    await fsp.writeFile(statePath, JSON.stringify({
      sessions: [{
        id: sessionId,
        title: "Interrupted build",
        status: "Executing",
        archived: false,
        messages: [{ id: "m1", role: "user", content: "Build cancelled", createdAt: "2026-08-01T00:00:00.000Z" }],
        projectSummary: { projectName: "Project", rootPath: root, languages: [], frameworks: [], buildSystem: [], sourceDirectories: [], entryPoints: [], openFiles: [], git: { changedFiles: 0, summary: [] }, context: { attachmentCount: 0, tokenEstimate: 0, labels: [] } },
        attachments: [],
        plan: {
          id: "plan-crash",
          objective: "Build cancelled",
          summary: "Interrupted plan",
          steps: [],
          approvals: [],
          executionQueue: [],
          taskRuns: [],
          terminalRuns: [],
          gitRuns: [],
          browserRuns: [],
          verificationReports: [],
          repairQueue: [],
          repairProgress: [],
          estimatedFiles: [],
          progress: { totalSteps: 0, pendingActions: 0, approvedActions: 0, rejectedActions: 0, completedActions: 0 },
          recovery: {
            schemaVersion: 1,
            operations: [{
              operationId: "op-crash",
              sessionId,
              title: "Partial write",
              status: "Executing",
              userRequest: "Build cancelled",
              approvedScope: ["src/a.ts"],
              actionsAttempted: ["a1"],
              actionsCompleted: [],
              actionsFailed: [],
              filesCreated: ["src/a.ts"],
              filesModified: [],
              filesDeleted: [],
              filesRenamed: [],
              commandsExecuted: [],
              repairAttempts: 0,
              snapshots: [],
              startedAt: "2026-08-01T00:00:00.000Z"
            }],
            interruptedOperationIds: []
          },
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z"
        },
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      }],
      activeSessionId: sessionId
    }), "utf8");

    const restored = new AgentService(runtimeManager, { statePath, getWorkspaceRoot: () => root });
    const state = await restored.initialize();
    expect(state.sessions[0].plan?.recovery?.operations[0]).toMatchObject({ status: "Interrupted", conflict: "Levi was interrupted during this operation." });
    expect(state.sessions[0].plan?.recovery?.interruptedOperationIds).toContain("op-crash");
  });

  it("validates IPC payload-shaped requests and rejects unsafe workspace paths", async () => {
    const { service } = await createService();

    await expect(service.plan({ prompt: "", runtimeId: "ollama", modelId: "model-a" })).rejects.toThrow(/prompt/i);
    await expect(service.plan({ prompt: "Read outside", runtimeId: "ollama", modelId: "model-a", attachments: [{ id: "a", type: "file", label: "x", relativePath: "../secret.txt" }] })).rejects.toThrow(/workspace path/i);
    await expect(service.approve({ sessionId: "missing", actionId: "a" })).rejects.toThrow(/not found/i);
  });

  it("unsubscribes task and terminal listeners on dispose", async () => {
    const taskService = createFakeTaskService([{ id: "npm:test", label: "test", source: "detected", group: "test", command: "npm.cmd", args: ["test"], cwd: "C:/workspace", problemMatchers: [] }]);
    const terminalManager = createFakeTerminalManager();
    const { service } = await createService(provider(), { taskService, terminalManager });

    expect(taskService.listenerCount()).toBe(1);
    expect(terminalManager.listenerCount()).toBe(1);
    service.dispose();
    expect(taskService.listenerCount()).toBe(0);
    expect(terminalManager.listenerCount()).toBe(0);
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
    expect(channels).toContain('agentRestoreOperation: "levi:agent:restore-operation"');
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
    expect(channels).toContain('agentVerify: "levi:agent:verify"');
    expect(channels).toContain('agentRepairPlan: "levi:agent:repair-plan"');
    expect(channels).toContain('agentRepairExecute: "levi:agent:repair-execute"');
    expect(channels).toContain('agentRepairStatus: "levi:agent:repair-status"');
    expect(main).toContain("const agentService = new AgentService(aiRuntimeManager");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.agentPlan");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.agentExecute");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.agentRestoreOperation");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.agentTaskExecute");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.agentGitExecute");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.agentTerminalExecute");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.agentVerify");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.agentRepairPlan");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.agentRepairExecute");
    expect(preload).toContain("agent: {");
    expect(preload).toContain("plan: (request: AgentPlanRequest)");
    expect(preload).toContain("execute: (request: AgentExecuteRequest)");
    expect(preload).toContain("restoreOperation: (request: AgentRestoreOperationRequest)");
    expect(preload).toContain("taskExecute: (request: AgentTaskExecuteRequest)");
    expect(preload).toContain("gitExecute: (request: AgentGitExecuteRequest)");
    expect(preload).toContain("terminalExecute: (request: AgentTerminalExecuteRequest)");
    expect(preload).toContain("verify: (request: AgentVerifyRequest)");
    expect(preload).toContain("repairPlan: (request: AgentRepairPlanRequest)");
    expect(preload).toContain("repairExecute: (request: AgentRepairExecuteRequest)");
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

  it("persists recovery ledger and resumes undo after restart", async () => {
    const { service, statePath, runtimeManager } = await createService(providerWithActions([
      { type: "create-file", title: "Create resumable file", description: "Create a text file.", relativePath: "src/resume.txt", content: "hello\n" }
    ]));
    const root = path.dirname(statePath);
    const planned = await service.plan({ prompt: "Create resumable file", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const action = planned.state.sessions[0].plan!.approvals[0];

    await service.approve({ sessionId, actionId: action.id });
    const preview = await service.preview({ sessionId, actionId: action.id });
    const executed = await service.execute({ sessionId, actionId: action.id, previewId: preview.preview.previewId });
    expect(executed.state.sessions[0].plan?.recovery?.operations[0]).toMatchObject({ status: "Completed", filesCreated: ["src/resume.txt"] });

    const restored = new AgentService(runtimeManager, { statePath, getWorkspaceRoot: () => root });
    const restoredState = await restored.initialize();
    expect(restoredState.sessions[0].messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(restoredState.sessions[0].plan?.lastUndo).toMatchObject({ relativePath: "src/resume.txt" });
    await restored.undo({ sessionId });
    expect(fs.existsSync(path.join(root, "src", "resume.txt"))).toBe(false);
  });

  it("restores a selected completed operation from recovery history", async () => {
    const { service, statePath } = await createService(providerWithActions([
      { type: "create-file", title: "Create restorable file", description: "Create a text file.", relativePath: "src/restore.txt", content: "restore\n" }
    ]));
    const root = path.dirname(statePath);
    const planned = await service.plan({ prompt: "Create restorable file", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const action = planned.state.sessions[0].plan!.approvals[0];

    await service.approve({ sessionId, actionId: action.id });
    const preview = await service.preview({ sessionId, actionId: action.id });
    const executed = await service.execute({ sessionId, actionId: action.id, previewId: preview.preview.previewId });
    const operationId = executed.state.sessions[0].plan!.recovery!.operations[0].operationId;

    const restored = await service.restoreOperation({ sessionId, operationId });
    expect(restored).toMatchObject({ sessionId, operationId, restoredPaths: ["src/restore.txt"] });
    expect(restored.state.sessions[0].plan?.recovery?.operations[0]).toMatchObject({ status: "Undone" });
    expect(fs.existsSync(path.join(root, "src", "restore.txt"))).toBe(false);
  });

  it("protects manual edits and created-file collisions during undo", async () => {
    const { service, statePath } = await createService(providerWithActions([
      { type: "create-file", title: "Create user-touched file", description: "Create a text file.", relativePath: "src/touched.txt", content: "agent\n" }
    ]));
    const root = path.dirname(statePath);
    const planned = await service.plan({ prompt: "Create user touched file", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const action = planned.state.sessions[0].plan!.approvals[0];

    await service.approve({ sessionId, actionId: action.id });
    const preview = await service.preview({ sessionId, actionId: action.id });
    await service.execute({ sessionId, actionId: action.id, previewId: preview.preview.previewId });
    await fsp.writeFile(path.join(root, "src", "touched.txt"), "manual\n", "utf8");

    await expect(service.undo({ sessionId })).rejects.toThrow(/changed after Levi's operation/i);
    const status = service.status({ sessionId }) as AgentSession;
    expect(status.plan?.recovery?.operations[0]).toMatchObject({ status: "Conflict" });
    expect(await fsp.readFile(path.join(root, "src", "touched.txt"), "utf8")).toBe("manual\n");
  });

  it("restores delete and rename operations with file-level recovery", async () => {
    const { service, statePath } = await createService(providerWithActions([
      { type: "delete-file", title: "Delete stale file", description: "Remove stale file.", relativePath: "src/delete-me.txt" },
      { type: "rename-file", title: "Rename file", description: "Move file.", relativePath: "src/from.txt", destinationRelativePath: "src/to.txt" }
    ]));
    const root = path.dirname(statePath);
    await fsp.mkdir(path.join(root, "src"), { recursive: true });
    await fsp.writeFile(path.join(root, "src", "delete-me.txt"), "delete\n", "utf8");
    await fsp.writeFile(path.join(root, "src", "from.txt"), "rename\n", "utf8");
    const planned = await service.plan({ prompt: "Delete and rename files", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const [deleteAction, renameAction] = planned.state.sessions[0].plan!.approvals;

    await service.approve({ sessionId, actionId: deleteAction.id });
    const deletePreview = await service.preview({ sessionId, actionId: deleteAction.id });
    await service.execute({ sessionId, actionId: deleteAction.id, previewId: deletePreview.preview.previewId });
    await service.undo({ sessionId });
    expect(await fsp.readFile(path.join(root, "src", "delete-me.txt"), "utf8")).toBe("delete\n");

    await service.approve({ sessionId, actionId: renameAction.id });
    const renamePreview = await service.preview({ sessionId, actionId: renameAction.id });
    await service.execute({ sessionId, actionId: renameAction.id, previewId: renamePreview.preview.previewId });
    await service.undo({ sessionId });
    expect(await fsp.readFile(path.join(root, "src", "from.txt"), "utf8")).toBe("rename\n");
    expect(fs.existsSync(path.join(root, "src", "to.txt"))).toBe(false);
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

  it("creates successful verification reports from approved TaskService results without running tasks", async () => {
    const task: TaskDefinition = { id: "npm:test", label: "test", source: "detected", group: "test", command: "npm.cmd", args: ["test"], cwd: ".", problemMatchers: [] };
    const taskService = createFakeTaskService([task]);
    const { service } = await createService(providerWithActions([{ type: "run-task", title: "Run tests", description: "Verify tests.", taskId: "npm:test" }]), { taskService, getWindow: fakeWindow, getChangedFiles: () => ["src/Login.tsx"] });
    const planned = await service.plan({ prompt: "Verify success", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const action = planned.state.sessions[0].plan!.approvals[0];

    await service.approve({ sessionId, actionId: action.id });
    const preview = await service.taskPreview({ sessionId, actionId: action.id });
    await service.taskExecute({ sessionId, actionId: action.id, previewId: preview.preview.previewId });
    taskService.emitOutput({ id: "out-success", source: "task", channel: "test", text: "tests passed\n", timestamp: "2026-08-02T00:00:01.000Z", taskRunId: "task-run-1" });
    taskService.finish("succeeded", 0);

    const verified = await service.verify({ sessionId });
    expect(taskService.run).toHaveBeenCalledTimes(1);
    expect(verified.report).toMatchObject({ status: "Succeeded", gitChangedFiles: ["src/Login.tsx"] });
    expect(verified.report.checks.find((check) => check.kind === "test")).toMatchObject({ status: "succeeded", exitCode: 0 });
    expect(verified.state.sessions[0].plan?.verificationReports[0].id).toBe(verified.report.id);
  });

  it("classifies failed verification, generates structured repairs, and executes related file repairs automatically", async () => {
    const planContent = JSON.stringify({
      summary: "Run typecheck.",
      steps: [{
        title: "Verify types",
        description: "Run typecheck.",
        estimatedFiles: ["src/Login.tsx"],
        actions: [{ type: "run-task", title: "Run typecheck", description: "Verify TypeScript.", taskId: "npm:typecheck" }]
      }]
    });
    const repairContent = JSON.stringify({
      repairs: [{
        problem: "TypeScript cannot find name LoginProps.",
        likelyCause: "The component props type is missing or not imported.",
        affectedFiles: ["src/Login.tsx"],
        suggestedFix: "Add or import the LoginProps type in src/Login.tsx.",
        confidence: 0.82,
        estimatedRisk: "low",
        classification: "Type errors",
        actions: [{
          type: "modify-file",
          title: "Add LoginProps type",
          description: "Add the missing props type used by the component.",
          relativePath: "src/Login.tsx",
          content: "type LoginProps = { title: string };\nexport function Login(_props: LoginProps) {\n  return null;\n}\n"
        }]
      }]
    });
    const task: TaskDefinition = { id: "npm:typecheck", label: "typecheck", source: "detected", group: "build", command: "npm.cmd", args: ["run", "typecheck"], cwd: ".", problemMatchers: ["$tsc"] };
    const taskService = createFakeTaskService([task]);
    const runtimeProvider = providerWithResponses([planContent, repairContent]);
    const { service, statePath } = await createService(runtimeProvider, { taskService, getWindow: fakeWindow });
    const root = path.dirname(statePath);
    await fsp.mkdir(path.join(root, "src"), { recursive: true });
    await fsp.writeFile(path.join(root, "src", "Login.tsx"), "export function Login(_props: LoginProps) {\n  return null;\n}\n", "utf8");
    const planned = await service.plan({ prompt: "Verify failure", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const action = planned.state.sessions[0].plan!.approvals[0];

    await expect(service.verify({ sessionId: "" })).rejects.toThrow(/sessionId/i);
    await service.approve({ sessionId, actionId: action.id });
    const preview = await service.taskPreview({ sessionId, actionId: action.id });
    await service.taskExecute({ sessionId, actionId: action.id, previewId: preview.preview.previewId });
    taskService.emitOutput({ id: "out-fail", source: "task", channel: "typecheck", text: "error TS2304: Cannot find name 'LoginProps'.\n", timestamp: "2026-08-02T00:00:01.000Z", taskRunId: "task-run-1" });
    taskService.emitProblems([{ id: "problem-ts", relativePath: "src/Login.tsx", line: 4, column: 12, severity: "error", message: "Cannot find name 'LoginProps'.", source: "tsc", taskRunId: "task-run-1" }]);
    taskService.finish("failed", 2);

    const verified = await service.verify({ sessionId });
    expect(verified.report.status).toBe("Failed");
    expect(verified.report.failures.map((failure) => failure.classification)).toContain("Type errors");
    expect(verified.report.checks.find((check) => check.kind === "typecheck")).toMatchObject({ status: "failed", exitCode: 2 });

    const plannedRepair = await service.repairPlan({ sessionId, reportId: verified.report.id });
    expect(plannedRepair.repairs[0]).toMatchObject({ status: "Pending", classification: "Type errors", affectedFiles: ["src/Login.tsx"] });
    expect(plannedRepair.repairs[0].actions).toHaveLength(1);
    const executed = await service.repairExecute({ sessionId, reportId: verified.report.id, attempt: 1 });
    expect(executed.executedActions).toHaveLength(1);
    expect(await fsp.readFile(path.join(root, "src", "Login.tsx"), "utf8")).toContain("type LoginProps");
    expect(executed.repairs[0]).toMatchObject({ status: "Completed", requiresFreshApproval: false });
    expect(executed.state.sessions[0].plan?.repairProgress.map((entry) => entry.stage)).toEqual(expect.arrayContaining(["Repair Executing", "Repair Complete"]));
    const status = service.repairStatus({ sessionId });
    expect(status.repairs[0]).toMatchObject({ id: plannedRepair.repairs[0].id, status: "Completed" });
    await expect(service.repairPlan({ sessionId: "missing", reportId: verified.report.id })).rejects.toThrow(/not found/i);
  });

  it("executes approved non-interactive terminal commands directly and records stdout, stderr, and exit code", async () => {
    const runtimeProvider = providerWithActions([{
      type: "run-terminal-command",
      title: "Run terminal tests",
      description: "Run a safe validation command.",
      command: nodeExecutable,
      args: ["-e", "process.stdout.write('running tests\\n'),process.stderr.write('src/index.ts(1,7): error TS1109: Expression expected.\\n'),process.exit(7)"],
      cwd: ".",
      expectedOutput: "Tests fail with compiler output.",
      estimatedDurationMs: 1000
    }]);
    const { service, runtimeProvider: providerInstance } = await createService(runtimeProvider);
    const planned = await service.plan({ prompt: "Run terminal command", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const action = planned.state.sessions[0].plan!.approvals[0];

    await expect(service.terminalPreview({ sessionId, actionId: action.id })).rejects.toThrow(/approved/i);
    await service.approve({ sessionId, actionId: action.id });
    const preview = await service.terminalPreview({ sessionId, actionId: action.id });
    expect(preview.preview).toMatchObject({ executable: nodeExecutable, riskLevel: "medium", expectedOutput: "Tests fail with compiler output." });
    expect(path.isAbsolute(preview.preview.cwd)).toBe(true);

    const execution = await service.terminalExecute({ sessionId, actionId: action.id, previewId: preview.preview.previewId });
    expect(execution.terminalRun).toMatchObject({ status: "Running", terminalSessionId: undefined });
    await waitFor(() => expect(service.terminalStatus({ sessionId }).terminalRuns[0].verification).toBeDefined());
    const finished = service.terminalStatus({ sessionId }).terminalRuns[0];
    expect(finished).toMatchObject({
      status: "Failed",
      resultStatus: "failed",
      exitCode: 7,
      outputPreview: expect.stringContaining("running tests"),
      stderrPreview: expect.stringContaining("src/index.ts"),
      verification: expect.objectContaining({ outputExcerpt: expect.stringContaining("running tests") })
    });
    const verified = await service.verify({ sessionId });
    const terminalFailure = verified.report.failures.find((failure) => failure.source === "terminal");
    expect(terminalFailure).toMatchObject({
      source: "terminal",
      exitCode: 7,
      affectedFiles: ["src/index.ts"],
      details: expect.objectContaining({
        command: nodeExecutable,
        exitCode: 7,
        relevantFiles: ["src/index.ts"],
        stderr: expect.stringContaining("src/index.ts"),
        stdout: expect.stringContaining("running tests")
      })
    });
    expect(providerInstance.chat).toHaveBeenCalledTimes(2);
  });

  it("distinguishes terminal infrastructure failures from project command failures", async () => {
    const runtimeProvider = providerWithActions([{
      type: "run-terminal-command",
      title: "Run missing wrapper",
      description: "Run an allowed executable that is not present.",
      command: "gradlew.bat",
      args: ["test"],
      cwd: "."
    }]);
    const { service, runtimeProvider: providerInstance } = await createService(runtimeProvider);
    const planned = await service.plan({ prompt: "Run missing wrapper", runtimeId: "ollama", modelId: "model-a" });
    const sessionId = planned.sessionId;
    const action = planned.state.sessions[0].plan!.approvals[0];
    await service.approve({ sessionId, actionId: action.id });
    const preview = await service.terminalPreview({ sessionId, actionId: action.id });

    await service.terminalExecute({ sessionId, actionId: action.id, previewId: preview.preview.previewId });
    await waitFor(() => expect(service.terminalStatus({ sessionId }).terminalRuns[0].resultStatus).toBe("infrastructure-error"));
    const failed = service.terminalStatus({ sessionId }).terminalRuns[0];
    expect(failed).toMatchObject({
      status: "Failed",
      resultStatus: "infrastructure-error",
      failureReason: expect.stringContaining("Terminal execution failed")
    });

    const verified = await service.verify({ sessionId });
    expect(verified.report.terminalOutputExcerpt).toBe("");
    expect(verified.report.failures[0]).toMatchObject({
      source: "terminal",
      message: expect.stringContaining("Terminal execution failed"),
      affectedFiles: []
    });
    const repairs = await service.repairPlan({ sessionId, reportId: verified.report.id });
    expect(repairs.repairs[0]).toMatchObject({
      actions: [],
      requiresFreshApproval: true,
      blockers: ["No structured repair action was generated."]
    });
    expect(providerInstance.chat).toHaveBeenCalledTimes(1);
  });

  it("rejects dangerous terminal commands, handles cancellation, run-again, queue blocking, and interrupted restore", async () => {
    const terminalManager = createFakeTerminalManager();
    const { service, statePath } = await createService(providerWithActions([
      { type: "run-terminal-command", title: "Chained", description: "Bad chain.", command: "npm.cmd test && npm.cmd build" },
      { type: "run-terminal-command", title: "Shell", description: "Bad shell.", command: "cmd", args: ["/c", "npm test"] },
      { type: "run-terminal-command", title: "Env", description: "Bad env.", command: "npm.cmd", args: ["test", "TOKEN=value"] },
      { type: "run-terminal-command", title: "Safe", description: "Safe command.", command: nodeExecutable, args: ["-e", "setInterval(function(){},1000)"], cwd: "." },
      { type: "run-terminal-command", title: "Second", description: "Second command.", command: nodeExecutable, args: ["--version"], cwd: "." },
      { type: "run-terminal-command", title: "Failing", description: "Failing command.", command: nodeExecutable, args: ["-e", "process.stderr.write('compile failed\\n'),process.exit(1)"], cwd: "." }
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
    expect(terminalManager.kill).not.toHaveBeenCalled();
    expect(service.terminalStatus({ sessionId }).terminalRuns.find((run) => run.actionId === actions[3].id)).toMatchObject({ status: "Cancelled", resultStatus: "cancelled" });

    const nextPreview = await service.terminalPreview({ sessionId, actionId: actions[4].id });
    await service.terminalExecute({ sessionId, actionId: actions[4].id, previewId: nextPreview.preview.previewId });
    await waitFor(() => expect(service.terminalStatus({ sessionId }).terminalRuns.find((run) => run.actionId === actions[4].id)?.verification).toBeDefined());
    expect(service.terminalStatus({ sessionId }).terminalRuns.find((run) => run.actionId === actions[4].id)).toMatchObject({ status: "Succeeded", resultStatus: "completed", exitCode: 0 });

    const failingPreview = await service.terminalPreview({ sessionId, actionId: actions[5].id });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await service.terminalExecute({ sessionId, actionId: actions[5].id, previewId: failingPreview.preview.previewId });
      await waitFor(() => expect(service.terminalStatus({ sessionId }).terminalRuns.find((run) => run.actionId === actions[5].id)?.verification).toBeDefined());
      const failed = service.terminalStatus({ sessionId }).terminalRuns.find((run) => run.actionId === actions[5].id);
      expect(failed).toMatchObject({ status: "Failed", resultStatus: "failed", exitCode: 1, failureReason: "Terminal command failed with exit code 1." });
    }

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
      executable: nodeExecutable,
      args: ["--version"],
      cwd: path.dirname(statePath),
      status: "Running",
      resultStatus: undefined,
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
    const panel = await screen.findByRole("region", { name: "Coding Agent" }, lazySurfaceWait);
    const browserPanel = await within(panel).findByRole("region", { name: "Browser Automation" });
    expect(await within(browserPanel).findByText("Example Domain")).toBeInTheDocument();
    expect(within(browserPanel).getByRole("button", { name: "Reload" })).toBeInTheDocument();
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
    const panel = await screen.findByRole("region", { name: "Coding Agent" }, lazySurfaceWait);
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
            verificationReports: [],
            repairQueue: [],
            repairProgress: [],
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
          verificationReports: [],
          repairQueue: [],
          repairProgress: [],
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
            verificationReports: [],
            repairQueue: [],
            repairProgress: [],
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
    const panel = await screen.findByRole("region", { name: "Coding Agent" }, lazySurfaceWait);
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
            verificationReports: [],
            repairQueue: [],
            repairProgress: [],
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
          verificationReports: [],
          repairQueue: [],
          repairProgress: [],
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
            verificationReports: [],
            repairQueue: [],
            repairProgress: [],
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
    const panel = await screen.findByRole("region", { name: "Coding Agent" }, lazySurfaceWait);
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

  it("renders verification reports and approval-gated repair suggestions", async () => {
    const user = userEvent.setup();
    const report = {
      id: "verification-ui-1",
      sessionId: "agent-verify-ui",
      status: "Failed" as const,
      summary: "Verification failed with 1 issue.",
      checks: [{ kind: "typecheck" as const, status: "failed" as const, actionId: "task-1", taskRunId: "run-1", exitCode: 2, durationMs: 1000, summary: "typecheck failed." }],
      problems: [{ id: "problem-1", relativePath: "src/Login.tsx", line: 4, column: 12, severity: "error" as const, message: "Cannot find name LoginProps.", source: "tsc", taskRunId: "run-1" }],
      terminalOutputExcerpt: "",
      taskOutputExcerpt: "error TS2304: Cannot find name LoginProps.\n",
      gitChangedFiles: ["src/Login.tsx"],
      exitCodes: [{ source: "task" as const, actionId: "task-1", exitCode: 2 }],
      failures: [{ id: "failure-1", classification: "Type errors" as const, source: "problems" as const, message: "Cannot find name LoginProps.", affectedFiles: ["src/Login.tsx"], severity: "error" as const }],
      warnings: [],
      startedAt: "2026-08-01T00:00:00.000Z",
      completedAt: "2026-08-01T00:00:01.000Z"
    };
    const repair = {
      id: "repair-1",
      reportId: report.id,
      attempt: 1,
      problem: "Cannot find name LoginProps.",
      likelyCause: "The props type is missing.",
      affectedFiles: ["src/Login.tsx"],
      suggestedFix: "Add or import LoginProps.",
      actions: [],
      requiresFreshApproval: true,
      blockers: ["No structured repair action was generated."],
      confidence: 0.82,
      estimatedRisk: "low" as const,
      classification: "Type errors" as const,
      status: "Pending" as const,
      createdAt: "2026-08-01T00:00:01.000Z",
      updatedAt: "2026-08-01T00:00:01.000Z"
    };
    const baseState = {
      sessions: [{
        id: "agent-verify-ui",
        title: "Verify changes",
        status: "Ready" as const,
        archived: false,
        attachments: [],
        messages: [],
        plan: {
          id: "plan-verify-ui",
          objective: "Verify changes",
          summary: "Verify completed work.",
          estimatedFiles: ["src/Login.tsx"],
          progress: { totalSteps: 1, pendingActions: 0, approvedActions: 0, rejectedActions: 0, completedActions: 0 },
          steps: [],
          approvals: [],
          executionQueue: [],
          taskRuns: [],
          terminalRuns: [],
          gitRuns: [],
          verificationReports: [],
          repairQueue: [],
          repairProgress: [],
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z"
        },
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      }],
      activeSessionId: "agent-verify-ui",
      updatedAt: "2026-08-01T00:00:00.000Z"
    };
    window.levi.agent.plan = vi.fn(async () => ({ sessionId: "agent-verify-ui", state: baseState }));
    window.levi.agent.verify = vi.fn(async () => ({
      sessionId: "agent-verify-ui",
      report,
      state: {
        ...baseState,
        sessions: [{ ...baseState.sessions[0], plan: { ...baseState.sessions[0].plan, verificationReports: [report] } }]
      }
    }));
    window.levi.agent.repairPlan = vi.fn(async () => ({
      sessionId: "agent-verify-ui",
      reportId: report.id,
      repairs: [repair],
      state: {
        ...baseState,
        sessions: [{ ...baseState.sessions[0], plan: { ...baseState.sessions[0].plan, verificationReports: [report], repairQueue: [repair] } }]
      }
    }));
    window.levi.agent.approve = vi.fn(async () => ({
      ...baseState,
      sessions: [{ ...baseState.sessions[0], plan: { ...baseState.sessions[0].plan, verificationReports: [report], repairQueue: [{ ...repair, status: "Approved" as const }] } }]
    }));

    render(<App />);
    await user.click(screen.getByRole("button", { name: "Coding Agent" }));
    const panel = await screen.findByRole("region", { name: "Coding Agent" }, lazySurfaceWait);
    await user.type(within(panel).getByRole("textbox", { name: "Agent Request" }), "Verify changes");
    await user.click(within(panel).getByRole("button", { name: "Generate Plan" }));
    await user.click(await within(panel).findByRole("button", { name: "Verify" }));
    expect(await within(panel).findByText("Verification failed with 1 issue.")).toBeInTheDocument();
    expect(within(panel).getByText("Type errors: Cannot find name LoginProps. (src/Login.tsx)")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Plan Repairs" }));
    expect(await within(panel).findByText("Add or import LoginProps.")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Approve" }));
    expect(window.levi.agent.approve).toHaveBeenCalledWith({ sessionId: "agent-verify-ui", actionId: "repair-1" });
  });
});
