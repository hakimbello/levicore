import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatService } from "../electron/main/chat-service";
import { RuntimeManager } from "../electron/main/ai-runtime/runtime-manager";
import { AIRuntimeProviderRegistry } from "../electron/main/ai-runtime/provider-registry";
import type {
  AIRuntimeDetection,
  AIRuntimeInvocationResponse,
  AIRuntimeProvider,
  AIRuntimeProviderId,
  AIRuntimeRequest,
  AIRuntimeStreamEvent
} from "../src/features/ai-runtime";
import type { AIChatEvent } from "../src/features/ai-chat";
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

function provider(options: {
  id?: AIRuntimeProviderId;
  stream?: (request: AIRuntimeRequest, signal?: AbortSignal) => AsyncIterable<AIRuntimeStreamEvent>;
} = {}): AIRuntimeProvider {
  const id = options.id ?? "ollama";
  const info = detection(id);
  return {
    id,
    name: "Test Runtime",
    detect: vi.fn(async () => info),
    health: vi.fn(async () => info),
    listModels: vi.fn(async () => info.supportedModels),
    startModel: vi.fn(async () => undefined),
    stopModel: vi.fn(async () => undefined),
    pullModel: vi.fn(async function* (modelId: string) {
      yield { id: "download-1", providerId: id, modelId, status: "Completed" as const, progress: 1, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    }),
    deleteModel: vi.fn(async (modelId: string) => ({ providerId: id, modelId, status: "Completed" as const, progress: 1 })),
    startRuntime: vi.fn(async (modelId?: string) => ({ providerId: id, modelId: modelId ?? "", status: "Completed" as const, progress: 1 })),
    stopRuntime: vi.fn(async (modelId?: string) => ({ providerId: id, modelId: modelId ?? "", status: "Completed" as const, progress: 1 })),
    restartRuntime: vi.fn(async (modelId?: string) => ({ providerId: id, modelId: modelId ?? "", status: "Completed" as const, progress: 1 })),
    cancelRequest: vi.fn(async () => undefined),
    chat: vi.fn(async (request: AIRuntimeRequest): Promise<AIRuntimeInvocationResponse> => ({ requestId: request.requestId ?? "chat-1", providerId: id, model: request.model, content: "ok", latencyMs: 1 })),
    completion: vi.fn(async (request: AIRuntimeRequest): Promise<AIRuntimeInvocationResponse> => ({ requestId: request.requestId ?? "completion-1", providerId: id, model: request.model, content: "ok", latencyMs: 1 })),
    embeddings: vi.fn(async (_input: string | string[], modelId = "model-a") => ({ requestId: "embeddings-1", providerId: id, model: modelId, embeddings: [[0.1]], latencyMs: 1 })),
    stream: vi.fn(options.stream ?? async function* (request: AIRuntimeRequest): AsyncIterable<AIRuntimeStreamEvent> {
      const requestId = request.requestId ?? "stream-1";
      yield { type: "started", requestId, providerId: id, model: request.model } satisfies AIRuntimeStreamEvent;
      yield { type: "token", requestId, providerId: id, model: request.model, token: "he" } satisfies AIRuntimeStreamEvent;
      yield { type: "token", requestId, providerId: id, model: request.model, token: "llo" } satisfies AIRuntimeStreamEvent;
      yield { type: "completed", requestId, providerId: id, model: request.model, response: { requestId, providerId: id, model: request.model, content: "hello", latencyMs: 1 } } satisfies AIRuntimeStreamEvent;
    })
  };
}

async function createService(runtimeProvider = provider()) {
  const statePath = path.join(await fsp.mkdtemp(path.join(os.tmpdir(), "levi-ai-chat-")), "chat-state.json");
  const registry = new AIRuntimeProviderRegistry();
  registry.register(runtimeProvider.id, () => runtimeProvider);
  const runtimeManager = new RuntimeManager({ registry, statePath: path.join(path.dirname(statePath), "runtime-state.json"), monitorIntervalMs: 60_000 });
  await runtimeManager.initialize({ startMonitoring: false });
  const events: AIChatEvent[] = [];
  const service = new ChatService(runtimeManager, { statePath, emit: (event) => events.push(event) });
  await service.initialize();
  return { service, statePath, events, runtimeProvider, runtimeManager };
}

describe("AI chat foundation", () => {
  it("creates conversations, persists panel state, and restores history", async () => {
    const { service, statePath, runtimeManager } = await createService();

    const created = await service.newChat({ title: "Runtime notes", runtimeId: "ollama", modelId: "model-a" });
    const conversationId = created.activeConversationId;
    expect(created.conversations[0]).toMatchObject({ title: "Runtime notes", runtimeId: "ollama", modelId: "model-a" });

    await service.rename({ conversationId, title: "Pinned Runtime Notes" });
    await service.pin({ conversationId });
    await service.setPanel({ dockPosition: "bottom" });

    const restored = new ChatService(runtimeManager, { statePath });
    const state = await restored.initialize();
    expect(state.panel.dockPosition).toBe("bottom");
    expect(state.conversations[0]).toMatchObject({ title: "Pinned Runtime Notes", pinned: true });
    expect(fs.readFileSync(statePath, "utf8")).not.toMatch(/api[_-]?key|token|secret|password/i);
  });

  it("streams assistant messages through RuntimeManager and includes explicit attachments", async () => {
    const { service, events, runtimeProvider } = await createService();
    const done = new Promise<AIChatEvent>((resolve) => {
      const timer = setInterval(() => {
        const event = events.find((item) => item.type === "done");
        if (event) {
          clearInterval(timer);
          resolve(event);
        }
      }, 1);
    });

    await service.send({
      content: "Explain this file",
      runtimeId: "ollama",
      modelId: "model-a",
      attachments: [{ id: "attachment-1", type: "current-file", label: "src/main.ts", relativePath: "src/main.ts", language: "typescript", content: "export const value = 1;" }]
    });

    await done;
    const state = service.list();
    expect(state.conversations[0].messages.at(-1)).toMatchObject({ role: "assistant", content: "hello", status: "done" });
    expect(runtimeProvider.stream).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "model-a",
        messages: expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining("Attached context") })])
      }),
      expect.any(AbortSignal)
    );
  });

  it("cancels abandoned chat requests without crashing the renderer boundary", async () => {
    const runtimeProvider = provider({
      stream: async function* (request, signal) {
        const requestId = request.requestId ?? "stream-1";
        yield { type: "started", requestId, providerId: "ollama", model: request.model };
        await new Promise<void>((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
      }
    });
    const { service, events } = await createService(runtimeProvider);

    const { requestId } = await service.send({ content: "Stop this", runtimeId: "ollama", modelId: "model-a" });
    await service.cancel({ requestId });

    await waitFor(() => expect(events.some((event) => event.type === "stopped")).toBe(true));
    expect(service.list().conversations[0].messages.at(-1)).toMatchObject({ status: "stopped" });
  });

  it("validates workspace-only attachments and rejects malformed payloads", async () => {
    const { service } = await createService();

    await expect(service.send({ content: "Read outside", runtimeId: "ollama", modelId: "model-a", attachments: [{ type: "file", label: "secret", relativePath: "../secret.txt" }] })).rejects.toThrow(/attachment path/i);
    await expect(service.setPanel({ dockPosition: "center" })).rejects.toThrow(/dock position/i);
    await expect(service.send({ content: "", runtimeId: "ollama", modelId: "model-a" })).rejects.toThrow(/content/i);
  });

  it("archives, searches, and exports conversations as markdown or JSON", async () => {
    const { service } = await createService();
    const state = await service.newChat({ title: "Workspace Context", runtimeId: "ollama", modelId: "model-a" });
    const conversationId = state.activeConversationId!;

    expect(service.search({ query: "workspace" }).conversations).toHaveLength(1);
    const archived = await service.archive({ conversationId, archived: true });
    expect(archived.conversations.find((conversation) => conversation.id === conversationId)?.archived).toBe(true);
    expect(service.search({ query: "workspace" }).conversations).toHaveLength(0);
    expect(service.search({ query: "workspace", includeArchived: true }).conversations).toHaveLength(1);

    const markdown = await service.export({ conversationId, format: "markdown" });
    expect(markdown).toMatchObject({ conversationId, format: "markdown" });
    expect(markdown.markdown).toContain("# Workspace Context");
    const json = await service.export({ conversationId, format: "json" });
    expect(json.format).toBe("json");
    expect(JSON.parse(json.json ?? "{}")).toMatchObject({ title: "Workspace Context", archived: true });
  });

  it("previews explicit context, calculates budget, and blocks oversized payloads", async () => {
    const { service } = await createService();
    const preview = await service.previewContext({ source: "selected-code", label: "src/main.ts:1-1", relativePath: "src/main.ts", lineStart: 1, lineEnd: 1, content: "export const value = 1;" });

    expect(preview.attachment).toMatchObject({ type: "selected-code", label: "src/main.ts:1-1", relativePath: "src/main.ts", lineStart: 1, sourceId: expect.stringMatching(/^S\d+/) });
    expect(preview.budget.totalTokens).toBeGreaterThan(0);
    expect(service.budget({ modelId: "model-a", draft: "Explain it", attachments: [preview.attachment] })).toMatchObject({ exceedsBudget: false });
    await expect(service.previewContext({ source: "workspace-file", relativePath: ".env" })).rejects.toThrow(/Sensitive files require explicit confirmation/i);

    const oversized = { ...preview.attachment, id: "huge", label: "Huge", tokenEstimate: 9_000 };
    await expect(service.send({ content: "Explain this", runtimeId: "ollama", modelId: "model-a", attachments: [oversized] })).rejects.toThrow(/context exceeds/i);
  });

  it("extracts verified source citations from streamed responses", async () => {
    const runtimeProvider = provider({
      stream: async function* (request): AsyncIterable<AIRuntimeStreamEvent> {
        const requestId = request.requestId ?? "stream-1";
        yield { type: "started", requestId, providerId: "ollama", model: request.model };
        yield { type: "token", requestId, providerId: "ollama", model: request.model, token: "Use [S1:1], not [S999]." };
        yield { type: "completed", requestId, providerId: "ollama", model: request.model, response: { requestId, providerId: "ollama", model: request.model, content: "Use [S1:1], not [S999].", latencyMs: 1 } };
      }
    });
    const { service, events } = await createService(runtimeProvider);
    const done = new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (events.some((item) => item.type === "done")) {
          clearInterval(timer);
          resolve();
        }
      }, 1);
    });

    await service.send({
      content: "Where is this defined?",
      runtimeId: "ollama",
      modelId: "model-a",
      attachments: [{ id: "attachment-1", type: "selected-code", sourceId: "S1", label: "src/main.ts", relativePath: "src/main.ts", lineStart: 1, lineEnd: 1, content: "export const value = 1;" }]
    });
    await done;

    const assistant = service.list().conversations[0].messages.at(-1);
    expect(assistant?.citations).toEqual([{ sourceId: "S1", relativePath: "src/main.ts", lineStart: 1, lineEnd: 1, label: "src/main.ts" }]);
    expect(events.some((event) => event.type === "citations")).toBe(true);
    expect(service.openCitation({ conversationId: service.list().conversations[0].id, sourceId: "S1" })).toMatchObject({ relativePath: "src/main.ts" });
  });

  it("forks conversations and deletes individual messages through persisted chat state", async () => {
    const { service, events } = await createService();
    const done = new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (events.some((item) => item.type === "done")) {
          clearInterval(timer);
          resolve();
        }
      }, 1);
    });
    await service.send({ content: "Create a branch of this chat", runtimeId: "ollama", modelId: "model-a" });
    await done;
    const source = service.list().conversations[0];
    const assistant = source.messages.find((message) => message.role === "assistant");
    expect(assistant).toBeDefined();

    const forked = await service.fork({ conversationId: source.id, messageId: assistant?.id });
    expect(forked.activeConversationId).not.toBe(source.id);
    expect(forked.conversations[0].messages).toHaveLength(2);

    const deleted = await service.deleteMessage({ conversationId: source.id, messageId: source.messages[0].id });
    expect(deleted.conversations.find((conversation) => conversation.id === source.id)?.messages).toHaveLength(1);
  });

  it("wires secure chat IPC through main and preload without provider-specific renderer calls", () => {
    const channels = fs.readFileSync(path.join(process.cwd(), "electron/main/ipc-channels.ts"), "utf8");
    const main = fs.readFileSync(path.join(process.cwd(), "electron/main/index.ts"), "utf8");
    const preload = fs.readFileSync(path.join(process.cwd(), "electron/preload/index.ts"), "utf8");

    expect(channels).toContain('chatSend: "levi:chat:send"');
    expect(channels).toContain('chatCancel: "levi:chat:cancel"');
    expect(channels).toContain('chatFork: "levi:chat:fork"');
    expect(channels).toContain('chatDeleteMessage: "levi:chat:delete-message"');
    expect(channels).toContain('chatContextPreview: "levi:chat:context-preview"');
    expect(channels).toContain('chatOpenCitation: "levi:chat:open-citation"');
    expect(main).toContain("const chatService = new ChatService(aiRuntimeManager");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.chatSend");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.chatFork");
    expect(main).toContain("chatService.send({");
    expect(main).toContain("ipcMain.handle(IPC_CHANNELS.conversationStart");
    expect(preload).toContain("chat: {");
    expect(preload).toContain("send: (request: AIChatSendRequest)");
    expect(preload).toContain("fork: (request: AIChatForkRequest)");
    expect(preload).toContain("previewContext: (request: AIChatContextPreviewRequest)");
    expect(preload).not.toContain("ollama.generate");
  });

  it("renders the docked chat panel with markdown, runtime switching, and streaming updates", async () => {
    const user = userEvent.setup();
    render(<App />);

    const panel = await screen.findByRole("complementary", { name: "AI Chat" });
    await user.selectOptions(within(panel).getByLabelText("Dock position"), "bottom");
    await waitFor(() => expect(window.levi.chat.setPanel).toHaveBeenCalledWith({ dockPosition: "bottom" }));
    await user.type(within(panel).getByLabelText("AI Chat Prompt"), "Show `code`");
    await user.click(within(panel).getByRole("button", { name: "Send Chat" }));

    await waitFor(() => expect(window.levi.chat.send).toHaveBeenCalledWith(expect.objectContaining({ content: "Show `code`", modelId: "qwen3.6:latest" })));
    act(() => {
      window.__leviChatListeners.forEach((listener) => listener({ type: "chunk", requestId: "chat-request-1", conversationId: "chat-1", messageId: "chat-message-assistant-1", content: "`ok`" }));
    });
    expect(await within(panel).findByText("ok")).toBeInTheDocument();
  });

  it("renders workspace context controls and attaches selected safe context", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);

    const panel = await screen.findByRole("complementary", { name: "AI Chat" });
    await user.click(await within(panel).findByRole("button", { name: /File src\/main\.tsx/i }));

    await waitFor(() => expect(window.levi.chat.previewContext).toHaveBeenCalledWith(expect.objectContaining({ source: "workspace-file", relativePath: "src/main.tsx", confirmSensitive: true })));
    expect(await within(panel).findByText(/S1 src\/main\.tsx/i)).toBeInTheDocument();
  });
});
