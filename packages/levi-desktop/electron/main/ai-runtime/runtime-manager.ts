import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { app } from "electron";
import type {
  AIRuntimeDetection,
  AIRuntimeDiagnostics,
  AIRuntimeHealthState,
  AIRuntimeModel,
  AIRuntimeProvider,
  AIRuntimeProviderId,
  AIRuntimeSelectRequest,
  AIRuntimeSelectionMode,
  AIRuntimeState
} from "../../../src/features/ai-runtime/types";
import { AIRuntimeProviderRegistry, type AIRuntimeProviderFactory } from "./provider-registry";
import { createDefaultRuntimeProviders, type ProviderDependencies } from "./providers";

const STATE_FILE = "ai-runtime-state.json";
const MONITOR_INTERVAL_MS = 15000;
const PROVIDER_IDS: AIRuntimeProviderId[] = ["ollama", "llama-cpp", "koboldcpp", "lm-studio", "openai-compatible"];
const SELECTION_MODES: AIRuntimeSelectionMode[] = ["automatic", "manual"];

type AIRuntimePersistence = {
  selectedRuntimeId?: AIRuntimeProviderId;
  preferredRuntimeId?: AIRuntimeProviderId;
  lastSuccessfulRuntimeId?: AIRuntimeProviderId;
  lastSelectedModelId?: string;
  selectionMode: AIRuntimeSelectionMode;
};

type RuntimeManagerOptions = ProviderDependencies & {
  statePath?: string;
  registry?: AIRuntimeProviderRegistry;
  monitorIntervalMs?: number;
};

function defaultPersistence(): AIRuntimePersistence {
  return { selectionMode: "automatic" };
}

export class RuntimeManager {
  private readonly registry: AIRuntimeProviderRegistry;
  private readonly statePath: string;
  private readonly monitorIntervalMs: number;
  private persistence: AIRuntimePersistence = defaultPersistence();
  private detections = new Map<AIRuntimeProviderId, AIRuntimeDetection>();
  private monitor: NodeJS.Timeout | null = null;
  private monitorPromise: Promise<AIRuntimeState> | null = null;

  constructor(options: RuntimeManagerOptions = {}) {
    this.registry = options.registry ?? new AIRuntimeProviderRegistry();
    this.statePath =
      options.statePath ??
      path.join(typeof app?.getPath === "function" ? app.getPath("userData") : os.tmpdir(), STATE_FILE);
    this.monitorIntervalMs = options.monitorIntervalMs ?? MONITOR_INTERVAL_MS;
    if (!options.registry) {
      this.registerDefaultProviders(options);
    }
  }

  registerProvider(id: AIRuntimeProviderId, factory: AIRuntimeProviderFactory): void {
    this.registry.register(id, factory);
  }

  async initialize(options: { startMonitoring?: boolean } = {}): Promise<AIRuntimeState> {
    await this.load();
    const state = await this.detect();
    if (options.startMonitoring !== false) {
      this.startMonitoring();
    }
    return state;
  }

  dispose(): void {
    if (this.monitor) {
      clearInterval(this.monitor);
      this.monitor = null;
    }
  }

  list(): AIRuntimeState {
    return this.snapshot();
  }

  async detect(): Promise<AIRuntimeState> {
    await this.refreshProviderSnapshots((provider) => provider.detect());
    await this.persist();
    return this.snapshot();
  }

  async health(providerId?: AIRuntimeProviderId): Promise<AIRuntimeState> {
    const provider = providerId ? this.requireProvider(providerId) : undefined;
    if (provider) {
      await this.capture(provider, () => provider.health());
    } else {
      await this.refreshProviderSnapshots((item) => item.health());
    }
    await this.persist();
    return this.snapshot();
  }

  async models(providerId?: AIRuntimeProviderId): Promise<AIRuntimeModel[]> {
    const id = providerId ?? this.snapshot().selectedRuntimeId ?? this.snapshot().automaticRuntimeId;
    if (!id) return [];
    const provider = this.requireProvider(id);
    try {
      const models = await provider.listModels();
      const current = this.detections.get(id);
      if (current) {
        this.detections.set(id, { ...current, supportedModels: models });
      }
      return models;
    } catch {
      return [];
    }
  }

  async select(rawRequest: unknown): Promise<AIRuntimeState> {
    const request = validateRuntimeSelectRequest(rawRequest);
    if (request.mode) {
      this.persistence.selectionMode = request.mode;
    }
    if (request.runtimeId) {
      this.requireProvider(request.runtimeId);
      this.persistence.selectedRuntimeId = request.runtimeId;
      if (request.preferred) {
        this.persistence.preferredRuntimeId = request.runtimeId;
      }
      this.persistence.selectionMode = request.mode ?? "manual";
    }
    if (request.modelId) {
      this.persistence.lastSelectedModelId = request.modelId;
    }
    if (this.persistence.selectionMode === "automatic") {
      this.persistence.selectedRuntimeId = undefined;
    }
    await this.persist();
    return this.snapshot();
  }

  diagnostics(): AIRuntimeDiagnostics[] {
    return this.snapshot().diagnostics;
  }

  validateProviderId(value: unknown): AIRuntimeProviderId | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !PROVIDER_IDS.includes(value as AIRuntimeProviderId)) {
      throw new Error("Runtime provider id is invalid.");
    }
    return value as AIRuntimeProviderId;
  }

  private startMonitoring(): void {
    if (this.monitor) return;
    this.monitor = setInterval(() => {
      if (!this.monitorPromise) {
        this.monitorPromise = this.health().finally(() => {
          this.monitorPromise = null;
        });
      }
    }, this.monitorIntervalMs);
    this.monitor.unref?.();
  }

  private registerDefaultProviders(dependencies: ProviderDependencies): void {
    for (const provider of createDefaultRuntimeProviders(dependencies)) {
      this.registry.register(provider.id, () => provider);
    }
  }

  private async refreshProviderSnapshots(run: (provider: AIRuntimeProvider) => Promise<AIRuntimeDetection>): Promise<void> {
    await Promise.all(this.registry.list().map((provider) => this.capture(provider, () => run(provider))));
  }

  private async capture(provider: AIRuntimeProvider, run: () => Promise<AIRuntimeDetection>): Promise<void> {
    try {
      const detection = await run();
      this.detections.set(provider.id, sanitizeDetection(provider.id, detection));
      if (detection.running && detection.health === "Running") {
        this.persistence.lastSuccessfulRuntimeId = provider.id;
      }
    } catch (error) {
      this.detections.set(provider.id, {
        providerId: provider.id,
        installed: false,
        running: false,
        supportedModels: [],
        health: "Error",
        error: error instanceof Error ? error.message : "Runtime detection failed."
      });
    }
  }

  private snapshot(): AIRuntimeState {
    const providers = this.registry.list().map((provider) => {
      const detection = this.detections.get(provider.id) ?? emptyDetection(provider.id);
      return {
        id: provider.id,
        name: provider.name,
        installed: detection.installed,
        running: detection.running,
        version: detection.version,
        endpoint: detection.endpoint,
        status: detection.health,
        models: detection.supportedModels,
        latencyMs: detection.latencyMs,
        error: detection.error
      };
    });
    const automaticRuntimeId = providers.find((provider) => provider.running)?.id;
    const selectedRuntimeId =
      this.persistence.selectionMode === "automatic"
        ? automaticRuntimeId
        : this.persistence.selectedRuntimeId ?? this.persistence.preferredRuntimeId ?? automaticRuntimeId;
    const diagnostics = providers.map((provider): AIRuntimeDiagnostics => ({
      providerId: provider.id,
      providerName: provider.name,
      installed: provider.installed,
      running: provider.running,
      version: provider.version,
      endpoint: provider.endpoint,
      supportedModels: provider.models,
      health: provider.status,
      latencyMs: provider.latencyMs,
      error: provider.error,
      checkedAt: new Date().toISOString(),
      selected: provider.id === selectedRuntimeId,
      preferred: provider.id === this.persistence.preferredRuntimeId
    }));
    return {
      providers,
      selectedRuntimeId,
      preferredRuntimeId: this.persistence.preferredRuntimeId,
      automaticRuntimeId,
      lastSuccessfulRuntimeId: this.persistence.lastSuccessfulRuntimeId,
      lastSelectedModelId: this.persistence.lastSelectedModelId,
      selectionMode: this.persistence.selectionMode,
      diagnostics,
      updatedAt: new Date().toISOString()
    };
  }

  private requireProvider(id: AIRuntimeProviderId): AIRuntimeProvider {
    const provider = this.registry.get(id);
    if (!provider) {
      throw new Error("Unknown runtime provider.");
    }
    return provider;
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.statePath, "utf8");
      this.persistence = coercePersistence(JSON.parse(raw));
    } catch {
      this.persistence = defaultPersistence();
    }
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify(this.persistence, null, 2), "utf8");
  }
}

export function validateRuntimeSelectRequest(value: unknown): AIRuntimeSelectRequest {
  if (!value || typeof value !== "object") {
    throw new Error("Runtime selection request is invalid.");
  }
  const request = value as Record<string, unknown>;
  const runtimeId = request.runtimeId === undefined ? undefined : validateRuntimeProviderId(request.runtimeId);
  const modelId = request.modelId === undefined ? undefined : validateSmallString(request.modelId, "modelId");
  const preferred = request.preferred === undefined ? undefined : request.preferred === true;
  const mode = request.mode === undefined ? undefined : validateSelectionMode(request.mode);
  if (!runtimeId && !modelId && !mode) {
    throw new Error("Runtime selection request is empty.");
  }
  return { runtimeId, modelId, preferred, mode };
}

export function validateRuntimeProviderId(value: unknown): AIRuntimeProviderId {
  if (typeof value !== "string" || !PROVIDER_IDS.includes(value as AIRuntimeProviderId)) {
    throw new Error("Runtime provider id is invalid.");
  }
  return value as AIRuntimeProviderId;
}

function validateSelectionMode(value: unknown): AIRuntimeSelectionMode {
  if (typeof value !== "string" || !SELECTION_MODES.includes(value as AIRuntimeSelectionMode)) {
    throw new Error("Runtime selection mode is invalid.");
  }
  return value as AIRuntimeSelectionMode;
}

function validateSmallString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 300 || value.includes("\0")) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return value;
}

function coercePersistence(value: unknown): AIRuntimePersistence {
  if (!value || typeof value !== "object") return defaultPersistence();
  const record = value as Record<string, unknown>;
  return {
    selectedRuntimeId: optionalProviderId(record.selectedRuntimeId),
    preferredRuntimeId: optionalProviderId(record.preferredRuntimeId),
    lastSuccessfulRuntimeId: optionalProviderId(record.lastSuccessfulRuntimeId),
    lastSelectedModelId: typeof record.lastSelectedModelId === "string" ? record.lastSelectedModelId.slice(0, 300) : undefined,
    selectionMode: record.selectionMode === "manual" ? "manual" : "automatic"
  };
}

function optionalProviderId(value: unknown): AIRuntimeProviderId | undefined {
  return typeof value === "string" && PROVIDER_IDS.includes(value as AIRuntimeProviderId) ? (value as AIRuntimeProviderId) : undefined;
}

function sanitizeDetection(providerId: AIRuntimeProviderId, detection: AIRuntimeDetection): AIRuntimeDetection {
  return {
    providerId,
    installed: detection.installed === true,
    running: detection.running === true,
    version: detection.version,
    endpoint: detection.endpoint,
    supportedModels: Array.isArray(detection.supportedModels) ? detection.supportedModels.slice(0, 200) : [],
    health: sanitizeHealth(detection.health),
    latencyMs: typeof detection.latencyMs === "number" ? detection.latencyMs : undefined,
    error: detection.error
  };
}

function sanitizeHealth(value: AIRuntimeHealthState): AIRuntimeHealthState {
  return ["Running", "Stopped", "Unavailable", "Busy", "Error"].includes(value) ? value : "Error";
}

function emptyDetection(providerId: AIRuntimeProviderId): AIRuntimeDetection {
  return {
    providerId,
    installed: false,
    running: false,
    supportedModels: [],
    health: "Unavailable"
  };
}
