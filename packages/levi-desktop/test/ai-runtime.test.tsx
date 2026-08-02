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
import type { AIRuntimeDetection, AIRuntimeProvider, AIRuntimeProviderId, AIRuntimeRequest } from "../src/features/ai-runtime";
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
    startModel: vi.fn(async () => undefined),
    stopModel: vi.fn(async () => undefined),
    chat: vi.fn(async () => ({})),
    embeddings: vi.fn(async () => ({})),
    completion: vi.fn(async () => ({})),
    stream: async function* (_request: AIRuntimeRequest) {
      yield "";
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

  it("validates IPC payloads and remote endpoint security", () => {
    expect(validateRuntimeProviderId("ollama")).toBe("ollama");
    expect(() => validateRuntimeProviderId("bad")).toThrow(/invalid/);
    expect(validateRuntimeSelectRequest({ runtimeId: "lm-studio", preferred: true })).toMatchObject({ runtimeId: "lm-studio", preferred: true });
    expect(validateRuntimeEndpoint("http://127.0.0.1:11434")).toBe("http://127.0.0.1:11434");
    expect(validateRuntimeEndpoint("https://models.example.com/v1")).toBe("https://models.example.com/v1");
    expect(() => validateRuntimeEndpoint("http://models.example.com")).toThrow(/HTTPS/);
  });

  it("discovers Ollama models through the default provider without arbitrary command input", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const value = String(url);
      return {
        ok: true,
        status: 200,
        text: async () =>
          value.endsWith("/api/version")
            ? JSON.stringify({ version: "0.5.1" })
            : JSON.stringify({ models: [{ name: "nomic-embed-text:latest" }, { name: "llama3.1:8b-instruct-q4_K_M" }] })
      } as Response;
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
