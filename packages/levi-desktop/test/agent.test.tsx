import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgentService } from "../electron/main/agent-service";
import { RuntimeManager } from "../electron/main/ai-runtime/runtime-manager";
import { AIRuntimeProviderRegistry } from "../electron/main/ai-runtime/provider-registry";
import type {
  AIRuntimeDetection,
  AIRuntimeInvocationResponse,
  AIRuntimeProvider,
  AIRuntimeProviderId,
  AIRuntimeRequest
} from "../src/features/ai-runtime";
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

async function createService(runtimeProvider = provider()) {
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
    })
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

  it("wires secure agent IPC through main and preload without task, terminal, git, or file execution", () => {
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
    expect(main).toContain("const agentService = new AgentService(aiRuntimeManager");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.agentPlan");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.agentExecute");
    expect(preload).toContain("agent: {");
    expect(preload).toContain("plan: (request: AgentPlanRequest)");
    expect(preload).toContain("execute: (request: AgentExecuteRequest)");
    expect(service).toContain("this.runtimeManager.chat");
    expect(service).not.toContain("writeWorkspacePath");
    expect(service).not.toContain("terminalManager");
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
});
