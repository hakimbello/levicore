import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RuntimeManager, validateRuntimeProviderId, validateRuntimeSelectRequest } from "../electron/main/ai-runtime/runtime-manager";
import { AIRuntimeProviderRegistry } from "../electron/main/ai-runtime/provider-registry";
import { createDefaultRuntimeProviders, validateRuntimeEndpoint } from "../electron/main/ai-runtime/providers";
import type { AIRuntimeDetection, AIRuntimeInvocationResponse, AIRuntimeProvider, AIRuntimeProviderId, AIRuntimeRequest, AIRuntimeStreamEvent } from "../src/features/ai-runtime";
import { App } from "../src/app/App";

function fakeDetection(providerId: AIRuntimeProviderId, overrides: Partial<AIRuntimeDetection> = {}): AIRuntimeDetection {
  return {
    providerId,
    installed: true,
    running: true,
    version: "1.0.0",
    endpoint: "http://127.0.0.1:11434",
    supportedModels: [
      {
        id: "model-a",
        displayName: "Model A",
        contextWindow: 8192,
        embeddingSupport: true,
        visionSupport: false,
        toolSupport: false
      }
    ],
    health: "Running",
    latencyMs: 8,
    ...overrides
  };
}

function fakeProvider(id: AIRuntimeProviderId, name: string, detection = fakeDetection(id)): AIRuntimeProvider {
  return {
    id,
    name,
    detect: vi.fn(async () => detection),
    health: vi.fn(async () => detection),
    listModels: vi.fn(async () => detection.supportedModels),
    pullModel: vi.fn(async function* (modelId: string) {
      yield {
        id: "download-1",
        providerId: id,
        modelId,
        status: "Completed" as const,
        progress: 1,
        startedAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z"
      };
    }),
    deleteModel: vi.fn(async (modelId: string) => ({ providerId: id, modelId, status: "Completed" as const, progress: 1 })),
    startRuntime: vi.fn(async (modelId?: string) => ({ providerId: id, modelId: modelId ?? "", status: "Completed" as const, progress: 1 })),
    stopRuntime: vi.fn(async (modelId?: string) => ({ providerId: id, modelId: modelId ?? "", status: "Completed" as const, progress: 1 })),
    restartRuntime: vi.fn(async (modelId?: string) => ({ providerId: id, modelId: modelId ?? "", status: "Completed" as const, progress: 1 })),
    cancelRequest: vi.fn(async () => undefined),
    startModel: vi.fn(async () => undefined),
    stopModel: vi.fn(async () => undefined),
    chat: vi.fn(async (request: AIRuntimeRequest) => ({
      requestId: request.requestId ?? "chat-1",
      providerId: id,
      model: request.model,
      content: "hello",
      latencyMs: 5
    })),
    embeddings: vi.fn(async (input: string | string[], modelId = "model-a") => ({
      requestId: "embeddings-1",
      providerId: id,
      model: modelId,
      embeddings: (Array.isArray(input) ? input : [input]).map(() => [0.1, 0.2]),
      latencyMs: 5
    })),
    completion: vi.fn(async (request: AIRuntimeRequest) => ({
      requestId: request.requestId ?? "completion-1",
      providerId: id,
      model: request.model,
      content: "completed",
      latencyMs: 5
    })),
    stream: async function* (_request: AIRuntimeRequest) {
      const requestId = _request.requestId ?? "stream-1";
      yield { type: "started", requestId, providerId: id, model: _request.model } satisfies AIRuntimeStreamEvent;
      yield { type: "token", requestId, providerId: id, model: _request.model, token: "he" } satisfies AIRuntimeStreamEvent;
      yield { type: "token", requestId, providerId: id, model: _request.model, token: "llo" } satisfies AIRuntimeStreamEvent;
      yield {
        type: "completed",
        requestId,
        providerId: id,
        model: _request.model,
        response: { requestId, providerId: id, model: _request.model, content: "hello", latencyMs: 5 }
      } satisfies AIRuntimeStreamEvent;
    }
  };
}

describe("AI runtime manager foundation", () => {
  it("registers providers dynamically and rejects duplicates", () => {
    const registry = new AIRuntimeProviderRegistry();
    const provider = fakeProvider("ollama", "Ollama");

    registry.register("ollama", () => provider);

    expect(registry.ids()).toEqual(["ollama"]);
    expect(registry.list()[0]).toMatchObject({ id: "ollama", name: "Ollama" });
    expect(() => registry.register("ollama", () => provider)).toThrow(/already registered/);
  });

  it("detects health, selects runtimes, and persists selection without secrets", async () => {
    const statePath = path.join(await fsp.mkdtemp(path.join(os.tmpdir(), "levi-ai-runtime-")), "state.json");
    const registry = new AIRuntimeProviderRegistry();
    registry.register("ollama", () => fakeProvider("ollama", "Ollama"));
    registry.register("lm-studio", () => fakeProvider("lm-studio", "LM Studio", fakeDetection("lm-studio", { running: false, health: "Stopped", supportedModels: [] })));
    const manager = new RuntimeManager({ registry, statePath, monitorIntervalMs: 60_000 });

    const detected = await manager.initialize({ startMonitoring: false });
    expect(detected.providers).toHaveLength(2);
    expect(detected.automaticRuntimeId).toBe("ollama");

    const selected = await manager.select({ runtimeId: "ollama", preferred: true, modelId: "model-a" });
    expect(selected).toMatchObject({
      selectedRuntimeId: "ollama",
      preferredRuntimeId: "ollama",
      lastSelectedModelId: "model-a",
      selectionMode: "manual"
    });

    const persisted = fs.readFileSync(statePath, "utf8");
    expect(persisted).toContain("ollama");
    expect(persisted).not.toMatch(/api[_-]?key|token|secret/i);
  });

  it("handles provider failure as an Error diagnostic instead of throwing", async () => {
    const registry = new AIRuntimeProviderRegistry();
    registry.register("koboldcpp", () => ({
      ...fakeProvider("koboldcpp", "KoboldCpp"),
      detect: vi.fn(async () => {
        throw new Error("connection refused");
      })
    }));
    const manager = new RuntimeManager({ registry, statePath: path.join(os.tmpdir(), `levi-runtime-${Date.now()}.json`) });

    const state = await manager.initialize({ startMonitoring: false });

    expect(state.providers[0]).toMatchObject({ id: "koboldcpp", status: "Error", error: "connection refused" });
  });

  it("normalizes chat, completion, embeddings, and stream requests through the selected provider", async () => {
    const registry = new AIRuntimeProviderRegistry();
    registry.register("ollama", () => fakeProvider("ollama", "Ollama"));
    const manager = new RuntimeManager({ registry, statePath: path.join(os.tmpdir(), `levi-runtime-${Date.now()}-invoke.json`) });

    await manager.initialize({ startMonitoring: false });

    await expect(manager.chat({ model: "model-a", messages: [{ role: "user", content: "Hi" }] })).resolves.toMatchObject({ providerId: "ollama", content: "hello" });
    await expect(manager.completion({ model: "model-a", prompt: "Complete" })).resolves.toMatchObject({ providerId: "ollama", content: "completed" });
    await expect(manager.embeddings({ model: "model-a", input: ["one", "two"] })).resolves.toMatchObject({ providerId: "ollama", embeddings: [[0.1, 0.2], [0.1, 0.2]] });
    await expect(manager.stream({ model: "model-a", messages: [{ role: "user", content: "Hi" }] })).resolves.toMatchObject({ providerId: "ollama", content: "hello" });
    expect(manager.list().requests.filter((request) => request.status === "Completed")).toHaveLength(4);
  });

  it("tracks lifecycle operations and model downloads", async () => {
    const registry = new AIRuntimeProviderRegistry();
    registry.register("ollama", () => fakeProvider("ollama", "Ollama"));
    const manager = new RuntimeManager({ registry, statePath: path.join(os.tmpdir(), `levi-runtime-${Date.now()}-ops.json`) });

    await manager.initialize({ startMonitoring: false });

    await expect(manager.pullModel({ providerId: "ollama", modelId: "llama3.1:8b" })).resolves.toMatchObject({ status: "Completed", progress: 1 });
    await expect(manager.deleteModel({ providerId: "ollama", modelId: "llama3.1:8b" })).resolves.toMatchObject({ status: "Completed" });
    await expect(manager.start({ providerId: "ollama" })).resolves.toMatchObject({ status: "Completed" });
    await expect(manager.stop({ providerId: "ollama" })).resolves.toMatchObject({ status: "Completed" });
    await expect(manager.restart({ providerId: "ollama" })).resolves.toMatchObject({ status: "Completed" });
    expect(manager.list().downloads[0]).toMatchObject({ modelId: "llama3.1:8b", status: "Completed" });
  });

  it("cancels running requests without crashing the provider queue", async () => {
    const provider = fakeProvider("ollama", "Ollama");
    provider.completion = vi.fn((_request: AIRuntimeRequest, signal?: AbortSignal) =>
      new Promise<AIRuntimeInvocationResponse>((_resolve, reject) => {
        const abortListener = () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        };
        signal?.addEventListener("abort", abortListener, { once: true });
      })
    );
    const registry = new AIRuntimeProviderRegistry();
    registry.register("ollama", () => provider);
    const manager = new RuntimeManager({ registry, statePath: path.join(os.tmpdir(), `levi-runtime-${Date.now()}-cancel.json`) });
    await manager.initialize({ startMonitoring: false });

    const request = manager.completion({ providerId: "ollama", model: "model-a", prompt: "wait" });
    await waitFor(() => expect(manager.list().requests[0]?.status).toBe("Running"));
    const requestId = manager.list().requests[0].id;
    await manager.cancel({ requestId });

    await expect(request).rejects.toThrow(/cancelled|aborted/i);
    expect(manager.list().requests[0]).toMatchObject({ id: requestId, status: "Cancelled" });
  });

  it("reports compatible fallback providers without silently switching", async () => {
    const failing = fakeProvider("ollama", "Ollama");
    failing.completion = vi.fn(async () => {
      throw new Error("adapter disconnected");
    });
    const registry = new AIRuntimeProviderRegistry();
    registry.register("ollama", () => failing);
    registry.register("lm-studio", () => fakeProvider("lm-studio", "LM Studio"));
    const manager = new RuntimeManager({ registry, statePath: path.join(os.tmpdir(), `levi-runtime-${Date.now()}-fallback.json`) });
    await manager.initialize({ startMonitoring: false });

    await expect(manager.completion({ providerId: "ollama", model: "model-a", prompt: "fail" })).rejects.toThrow(/fallback runtime available: lm-studio/i);
    expect(failing.completion).toHaveBeenCalledTimes(2);
  });

  it("validates IPC payloads and remote endpoint security", () => {
    expect(validateRuntimeProviderId("ollama")).toBe("ollama");
    expect(() => validateRuntimeProviderId("bad")).toThrow(/invalid/);
    expect(validateRuntimeSelectRequest({ runtimeId: "lm-studio", preferred: true })).toMatchObject({ runtimeId: "lm-studio", preferred: true });
    expect(() => validateRuntimeSelectRequest({ modelId: "../secret" })).toThrow(/model id/);
    expect(validateRuntimeEndpoint("http://127.0.0.1:11434")).toBe("http://127.0.0.1:11434");
    expect(validateRuntimeEndpoint("127.0.0.1:11434")).toBe("http://127.0.0.1:11434");
    expect(validateRuntimeEndpoint("https://models.example.com/v1")).toBe("https://models.example.com/v1");
    expect(() => validateRuntimeEndpoint("http://models.example.com")).toThrow(/HTTPS/);
  });

  it("discovers Ollama models through the default provider without arbitrary command input", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const value = String(url);
      if (value.endsWith("/api/version")) return new Response(JSON.stringify({ version: "0.5.1" }));
      if (value.endsWith("/api/tags")) return new Response(JSON.stringify({ models: [{ name: "nomic-embed-text:latest" }, { name: "llama3.1:8b-instruct-q4_K_M" }] }));
      if (value.endsWith("/api/chat")) {
        const body = String(init?.body ?? "");
        return body.includes('"stream":true')
          ? new Response(`${JSON.stringify({ message: { content: "he" } })}\n${JSON.stringify({ message: { content: "llo" }, done: true })}\n`)
          : new Response(JSON.stringify({ message: { content: "hello" }, done_reason: "stop", eval_count: 2 }));
      }
      if (value.endsWith("/api/generate")) return new Response(JSON.stringify({ response: "completed", eval_count: 1 }));
      if (value.endsWith("/api/embeddings")) return new Response(JSON.stringify({ embedding: [0.1, 0.2] }));
      if (value.endsWith("/api/pull")) return new Response(`${JSON.stringify({ status: "pulling", completed: 1, total: 2 })}\n${JSON.stringify({ status: "success", completed: 2, total: 2 })}\n`);
      return new Response("{}", { status: 404 });
    });
    const runCommand = vi.fn(async () => ({ stdout: "ollama version 0.5.1", stderr: "" }));
    const ollama = createDefaultRuntimeProviders({ fetch: fetchMock as typeof fetch, runCommand }).find((provider) => provider.id === "ollama");

    await expect(ollama?.detect()).resolves.toMatchObject({
      providerId: "ollama",
      installed: true,
      running: true,
      version: "ollama version 0.5.1"
    });
    const models = await ollama!.listModels();
    expect(models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "nomic-embed-text:latest", embeddingSupport: true }),
        expect.objectContaining({ id: "llama3.1:8b-instruct-q4_K_M", parameters: "8b", quantization: "q4_K_M" })
      ])
    );
    expect(runCommand).toHaveBeenCalledWith(expect.stringMatching(/ollama/), ["--version"], expect.any(Number));

    await expect(ollama!.chat({ model: "llama3.1:8b-instruct-q4_K_M", messages: [{ role: "user", content: "Hi" }] })).resolves.toMatchObject({ content: "hello", usage: { outputTokens: 2 } });
    await expect(ollama!.completion({ model: "llama3.1:8b-instruct-q4_K_M", prompt: "Hi" })).resolves.toMatchObject({ content: "completed" });
    await expect(ollama!.embeddings("Hi", "nomic-embed-text:latest")).resolves.toMatchObject({ embeddings: [[0.1, 0.2]] });
    const events = [];
    for await (const event of ollama!.stream({ model: "llama3.1:8b-instruct-q4_K_M", messages: [{ role: "user", content: "Hi" }] })) {
      events.push(event);
    }
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "token", token: "he" }), expect.objectContaining({ type: "completed" })]));
    const downloads = [];
    for await (const progress of ollama!.pullModel("llama3.1:8b-instruct-q4_K_M")) {
      downloads.push(progress);
    }
    expect(downloads.at(-1)).toMatchObject({ status: "Completed", progress: 1 });
  });

  it("wires runtime IPC without replacing the existing desktop runtime boundary", () => {
    const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron/main/index.ts"), "utf8");
    const preloadSource = fs.readFileSync(path.join(__dirname, "..", "electron/preload/index.ts"), "utf8");
    const channelsSource = fs.readFileSync(path.join(__dirname, "..", "electron/main/ipc-channels.ts"), "utf8");

    expect(channelsSource).toContain('runtimeList: "levi:runtime:list"');
    expect(mainSource).toContain("const desktopRuntimeService = new DesktopRuntimeService");
    expect(mainSource).toContain("const aiRuntimeManager = new RuntimeManager()");
    expect(mainSource).toContain("ipcMain.handle(IPC_CHANNELS.runtimeSelect");
    expect(preloadSource).toContain("runtime: {");
    expect(preloadSource).toContain("select: (request: AIRuntimeSelectRequest)");
    expect(channelsSource).toContain('runtimeChat: "levi:runtime:chat"');
    expect(channelsSource).toContain('runtimePullModel: "levi:runtime:pull-model"');
    expect(mainSource).toContain("ipcMain.handle(IPC_CHANNELS.runtimeStream");
    expect(preloadSource).toContain("completion: (request: AIRuntimeRequest)");
  });
});

describe("Runtime Manager view", () => {
  it("renders runtime diagnostics and supports manual and automatic selection", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Runtime Manager" }));
    const panel = await screen.findByRole("region", { name: "Runtime Manager" });

    expect(within(panel).getByRole("heading", { name: "Runtime Manager" })).toBeInTheDocument();
    expect(within(panel).getAllByText("Ollama").length).toBeGreaterThan(1);
    expect(within(panel).getByText("qwen3.6:latest")).toBeInTheDocument();
    await user.selectOptions(within(panel).getByLabelText("Selected runtime"), "automatic");
    await waitFor(() => expect(window.levi.runtime.select).toHaveBeenCalledWith({ mode: "automatic" }));
    await user.click(within(panel).getByRole("button", { name: "Detect" }));
    await waitFor(() => expect(window.levi.runtime.detect).toHaveBeenCalled());
  });
});
