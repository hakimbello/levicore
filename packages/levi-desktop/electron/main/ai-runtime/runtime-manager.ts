import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { app } from "electron";
import type {
  AIChatMessage,
  AIRuntimeDetection,
  AIRuntimeDiagnostics,
  AIRuntimeEmbeddingsResponse,
  AIRuntimeHealthState,
  AIRuntimeInvocationResponse,
  AIRuntimeLifecycleRequest,
  AIRuntimeModel,
  AIRuntimeModelDownload,
  AIRuntimeModelOperationRequest,
  AIRuntimeModelOperationResult,
  AIRuntimeProvider,
  AIRuntimeProviderId,
  AIRuntimeRequest,
  AIRuntimeRequestStatus,
  AIRuntimeRequestSummary,
  AIRuntimeSelectRequest,
  AIRuntimeSelectionMode,
  AIRuntimeState,
  AIRuntimeStreamEvent,
  AIRuntimeStreamResult
} from "../../../src/features/ai-runtime/types";
import { AIRuntimeProviderRegistry, type AIRuntimeProviderFactory } from "./provider-registry";
import { createDefaultRuntimeProviders, type ProviderDependencies } from "./providers";

const STATE_FILE = "ai-runtime-state.json";
const MONITOR_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_PROMPT_LENGTH = 128_000;
const MAX_INPUT_COUNT = 64;
const MAX_RECENT_REQUESTS = 80;
const MAX_DOWNLOADS = 40;
const PROVIDER_IDS: AIRuntimeProviderId[] = ["ollama", "llama-cpp", "koboldcpp", "lm-studio", "openai-compatible"];
const SELECTION_MODES: AIRuntimeSelectionMode[] = ["automatic", "manual"];

type AIRuntimePersistence = {
  selectedRuntimeId?: AIRuntimeProviderId;
  preferredRuntimeId?: AIRuntimeProviderId;
  lastSuccessfulRuntimeId?: AIRuntimeProviderId;
  lastSelectedModelId?: string;
  selectionMode: AIRuntimeSelectionMode;
};

type RuntimeProviderMetrics = {
  requestCount: number;
  failureCount: number;
  runningRequestCount: number;
  queuedRequestCount: number;
  totalOutputTokens: number;
  totalLatencyMs: number;
  tokenThroughput?: number;
};

type RuntimeManagerOptions = ProviderDependencies & {
  statePath?: string;
  registry?: AIRuntimeProviderRegistry;
  monitorIntervalMs?: number;
  maxConcurrentRequestsPerProvider?: number;
};

type QueueEntry = {
  requestId: string;
  providerId: AIRuntimeProviderId;
  resolve: () => void;
  reject: (error: Error) => void;
};

type InvocationKind = "chat" | "completion" | "stream" | "embeddings";

function defaultPersistence(): AIRuntimePersistence {
  return { selectionMode: "automatic" };
}

export class RuntimeManager {
  private readonly registry: AIRuntimeProviderRegistry;
  private readonly statePath: string;
  private readonly monitorIntervalMs: number;
  private readonly maxConcurrentRequestsPerProvider: number;
  private persistence: AIRuntimePersistence = defaultPersistence();
  private detections = new Map<AIRuntimeProviderId, AIRuntimeDetection>();
  private metrics = new Map<AIRuntimeProviderId, RuntimeProviderMetrics>();
  private requests = new Map<string, AIRuntimeRequestSummary>();
  private downloads = new Map<string, AIRuntimeModelDownload>();
  private activeCounts = new Map<AIRuntimeProviderId, number>();
  private pendingQueues = new Map<AIRuntimeProviderId, QueueEntry[]>();
  private controllers = new Map<string, AbortController>();
  private monitor: NodeJS.Timeout | null = null;
  private monitorPromise: Promise<AIRuntimeState> | null = null;
  private requestSequence = 0;

  constructor(options: RuntimeManagerOptions = {}) {
    this.registry = options.registry ?? new AIRuntimeProviderRegistry();
    this.statePath =
      options.statePath ??
      path.join(typeof app?.getPath === "function" ? app.getPath("userData") : os.tmpdir(), STATE_FILE);
    this.monitorIntervalMs = options.monitorIntervalMs ?? MONITOR_INTERVAL_MS;
    this.maxConcurrentRequestsPerProvider = Math.max(1, Math.min(8, options.maxConcurrentRequestsPerProvider ?? 1));
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
    for (const controller of this.controllers.values()) {
      controller.abort();
    }
    this.controllers.clear();
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
        this.detections.set(id, { ...current, supportedModels: sanitizeModels(models) });
      }
      return sanitizeModels(models);
    } catch {
      return [];
    }
  }

  async chat(rawRequest: unknown): Promise<AIRuntimeInvocationResponse> {
    const request = this.validateInferenceRequest(rawRequest, "chat");
    return this.invokeWithRetry("chat", request, (provider, item, signal) => provider.chat(item, signal));
  }

  async completion(rawRequest: unknown): Promise<AIRuntimeInvocationResponse> {
    const request = this.validateInferenceRequest(rawRequest, "completion");
    return this.invokeWithRetry("completion", request, (provider, item, signal) => provider.completion(item, signal));
  }

  async embeddings(rawRequest: unknown): Promise<AIRuntimeEmbeddingsResponse> {
    const request = this.validateInferenceRequest(rawRequest, "embeddings");
    return this.invokeWithRetry("embeddings", request, (provider, item, signal) => provider.embeddings(item.input ?? item.prompt ?? "", item.model, signal));
  }

  async stream(rawRequest: unknown): Promise<AIRuntimeStreamResult> {
    const request = this.validateInferenceRequest(rawRequest, "stream");
    const events: AIRuntimeStreamEvent[] = [];
    let content = "";
    let finalResponse: AIRuntimeInvocationResponse | undefined;
    for await (const event of this.streamEvents(request)) {
      events.push(event);
      if (event.type === "token") content += event.token;
      if (event.type === "completed") finalResponse = event.response;
    }
    return {
      requestId: events[0]?.requestId ?? request.requestId ?? "",
      providerId: finalResponse?.providerId ?? request.providerId ?? this.resolveProviderForRequest(request),
      model: request.model,
      events,
      content,
      fallbackProviderIds: finalResponse?.fallbackProviderIds
    };
  }

  async *streamEvents(rawRequest: unknown): AsyncIterable<AIRuntimeStreamEvent> {
    const request = this.validateInferenceRequest(rawRequest, "stream");
    const providerId = this.resolveProviderForRequest(request);
    const provider = this.requireProvider(providerId);
    const requestId = request.requestId ?? this.nextRequestId("stream");
    yield { type: "queued", requestId, providerId, model: request.model };
    try {
      const result = await this.runQueued(providerId, request.model, "stream", requestId, async (signal) => {
        const events: AIRuntimeStreamEvent[] = [];
        try {
          for await (const event of provider.stream({ ...request, requestId }, signal)) {
            events.push(event);
          }
        } catch (error) {
          await provider.cancelRequest(requestId).catch(() => undefined);
          throw error;
        }
        return events;
      });
      for (const event of result) yield event;
    } catch (error) {
      const fallbackProviderIds = this.compatibleFallbacks(providerId, request.model);
      yield {
        type: isAbortError(error) ? "cancelled" : "failed",
        requestId,
        providerId,
        model: request.model,
        error: errorMessage(error),
        fallbackProviderIds
      } as AIRuntimeStreamEvent;
    }
  }

  async pullModel(rawRequest: unknown): Promise<AIRuntimeModelOperationResult> {
    const request = this.validateModelOperationRequest(rawRequest);
    const providerId = request.providerId ?? this.resolveProviderForModelOperation();
    const provider = this.requireProvider(providerId);
    const requestId = this.nextRequestId("pull-model");
    const startedAt = new Date().toISOString();
    this.downloads.set(requestId, {
      id: requestId,
      providerId,
      modelId: request.modelId,
      status: "Queued",
      startedAt,
      updatedAt: startedAt
    });
    return this.runQueued(providerId, request.modelId, "pull-model", requestId, async (signal) => {
      let latest: AIRuntimeModelDownload | undefined;
      try {
        for await (const progress of provider.pullModel(request.modelId, signal)) {
          latest = {
            ...progress,
            id: requestId,
            providerId,
            modelId: request.modelId,
            updatedAt: new Date().toISOString()
          };
          this.downloads.set(requestId, latest);
        }
        await this.capture(provider, () => provider.health());
        return {
          providerId,
          modelId: request.modelId,
          status: "Completed",
          progress: 1,
          message: latest?.message ?? "Model download completed."
        };
      } catch (error) {
        const failed = {
          id: requestId,
          providerId,
          modelId: request.modelId,
          status: isAbortError(error) ? "Cancelled" as const : "Failed" as const,
          error: errorMessage(error),
          startedAt,
          updatedAt: new Date().toISOString()
        };
        this.downloads.set(requestId, failed);
        throw error;
      }
    });
  }

  async deleteModel(rawRequest: unknown): Promise<AIRuntimeModelOperationResult> {
    const request = this.validateModelOperationRequest(rawRequest);
    const providerId = request.providerId ?? this.resolveProviderForModelOperation();
    const provider = this.requireProvider(providerId);
    const requestId = this.nextRequestId("delete-model");
    const result = await this.runQueued(providerId, request.modelId, "delete-model", requestId, (signal) => provider.deleteModel(request.modelId, signal));
    await this.capture(provider, () => provider.health());
    return result;
  }

  async start(rawRequest: unknown): Promise<AIRuntimeModelOperationResult> {
    const request = this.validateLifecycleRequest(rawRequest);
    const providerId = request.providerId ?? this.resolveProviderForModelOperation();
    return this.runLifecycle("start", providerId, request.modelId);
  }

  async stop(rawRequest: unknown): Promise<AIRuntimeModelOperationResult> {
    const request = this.validateLifecycleRequest(rawRequest);
    const providerId = request.providerId ?? this.resolveProviderForModelOperation();
    return this.runLifecycle("stop", providerId, request.modelId);
  }

  async restart(rawRequest: unknown): Promise<AIRuntimeModelOperationResult> {
    const request = this.validateLifecycleRequest(rawRequest);
    const providerId = request.providerId ?? this.resolveProviderForModelOperation();
    return this.runLifecycle("restart", providerId, request.modelId);
  }

  async cancel(rawRequest: unknown): Promise<AIRuntimeState> {
    const requestId = validateSmallStringFromObject(rawRequest, "requestId");
    const summary = this.requests.get(requestId);
    if (!summary) return this.snapshot();
    const provider = this.registry.get(summary.providerId);
    this.controllers.get(requestId)?.abort();
    await provider?.cancelRequest(requestId).catch(() => undefined);
    const pending = this.pendingQueues.get(summary.providerId) ?? [];
    const pendingIndex = pending.findIndex((entry) => entry.requestId === requestId);
    if (pendingIndex >= 0) {
      const [entry] = pending.splice(pendingIndex, 1);
      entry.reject(abortError());
    }
    this.updateRequest(requestId, { status: "Cancelled", completedAt: new Date().toISOString() });
    this.updateQueuedCounts();
    return this.snapshot();
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
    return validateRuntimeProviderId(value);
  }

  private async invokeWithRetry<T extends AIRuntimeInvocationResponse | AIRuntimeEmbeddingsResponse>(
    kind: InvocationKind,
    request: AIRuntimeRequest,
    run: (provider: AIRuntimeProvider, request: AIRuntimeRequest, signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const providerId = this.resolveProviderForRequest(request);
    const provider = this.requireProvider(providerId);
    const requestId = request.requestId ?? this.nextRequestId(kind);
    const prepared = { ...request, requestId };
    try {
      const response = await this.runQueued(providerId, request.model, kind, requestId, (signal) => run(provider, prepared, signal));
      if ("content" in response) {
        return { ...response, fallbackProviderIds: this.compatibleFallbacks(providerId, request.model) };
      }
      return response;
    } catch (firstError) {
      if (isAbortError(firstError)) throw firstError;
      this.bumpFailure(providerId);
      try {
        const retryId = `${requestId}-retry`;
        return await this.runQueued(providerId, request.model, kind, retryId, (signal) => run(provider, { ...prepared, requestId: retryId }, signal));
      } catch (secondError) {
        const fallbackProviderIds = this.compatibleFallbacks(providerId, request.model);
        const message = fallbackProviderIds.length > 0
          ? `${errorMessage(secondError)} Compatible fallback runtime available: ${fallbackProviderIds.join(", ")}.`
          : errorMessage(secondError);
        throw new Error(message);
      }
    }
  }

  private async runLifecycle(type: "start" | "stop" | "restart", providerId: AIRuntimeProviderId, modelId?: string): Promise<AIRuntimeModelOperationResult> {
    const provider = this.requireProvider(providerId);
    const requestId = this.nextRequestId(type);
    const result = await this.runQueued(providerId, modelId ?? "", type, requestId, () => {
      if (type === "start") return provider.startRuntime(modelId);
      if (type === "stop") return provider.stopRuntime(modelId);
      return provider.restartRuntime(modelId);
    });
    await this.capture(provider, () => provider.health());
    return result;
  }

  private async runQueued<T>(
    providerId: AIRuntimeProviderId,
    modelId: string,
    type: AIRuntimeRequestSummary["type"],
    requestId: string,
    run: (signal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const now = new Date().toISOString();
    this.requests.set(requestId, { id: requestId, providerId, modelId, type, status: "Queued", queuedAt: now });
    this.trimRequestHistory();
    this.updateQueuedCounts();
    await this.acquire(providerId, requestId);
    const controller = new AbortController();
    this.controllers.set(requestId, controller);
    const started = performance.now();
    this.updateRequest(requestId, { status: "Running", startedAt: new Date().toISOString() });
    this.updateQueuedCounts();
    try {
      const result = await withTimeout(run(controller.signal), REQUEST_TIMEOUT_MS, controller);
      this.markRequestDone(providerId, requestId, "Completed", Math.round(performance.now() - started));
      return result;
    } catch (error) {
      this.markRequestDone(providerId, requestId, isAbortError(error) ? "Cancelled" : "Failed", Math.round(performance.now() - started), errorMessage(error));
      if (!isAbortError(error)) this.bumpFailure(providerId);
      throw error;
    } finally {
      this.controllers.delete(requestId);
      this.release(providerId);
      this.updateQueuedCounts();
    }
  }

  private acquire(providerId: AIRuntimeProviderId, requestId: string): Promise<void> {
    const active = this.activeCounts.get(providerId) ?? 0;
    if (active < this.maxConcurrentRequestsPerProvider) {
      this.activeCounts.set(providerId, active + 1);
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const entries = this.pendingQueues.get(providerId) ?? [];
      entries.push({ requestId, providerId, resolve: () => {
        this.activeCounts.set(providerId, (this.activeCounts.get(providerId) ?? 0) + 1);
        resolve();
      }, reject });
      this.pendingQueues.set(providerId, entries);
      this.updateQueuedCounts();
    });
  }

  private release(providerId: AIRuntimeProviderId): void {
    this.activeCounts.set(providerId, Math.max(0, (this.activeCounts.get(providerId) ?? 1) - 1));
    const entries = this.pendingQueues.get(providerId) ?? [];
    const next = entries.shift();
    if (entries.length > 0) this.pendingQueues.set(providerId, entries);
    else this.pendingQueues.delete(providerId);
    if (next) next.resolve();
  }

  private resolveProviderForRequest(request: AIRuntimeRequest): AIRuntimeProviderId {
    if (request.providerId) return request.providerId;
    const state = this.snapshot();
    const id = state.selectedRuntimeId ?? state.automaticRuntimeId ?? state.lastSuccessfulRuntimeId;
    if (!id) throw new Error("No available runtime provider is selected.");
    return id;
  }

  private resolveProviderForModelOperation(): AIRuntimeProviderId {
    const state = this.snapshot();
    const id = state.selectedRuntimeId ?? state.automaticRuntimeId ?? state.preferredRuntimeId;
    if (!id) throw new Error("No runtime provider is selected.");
    return id;
  }

  private compatibleFallbacks(providerId: AIRuntimeProviderId, modelId: string): AIRuntimeProviderId[] {
    return this.snapshot().providers
      .filter((provider) => provider.id !== providerId && provider.running)
      .filter((provider) => provider.models.some((model) => model.id === modelId) || provider.models.length > 0)
      .map((provider) => provider.id);
  }

  private validateInferenceRequest(value: unknown, kind: InvocationKind): AIRuntimeRequest {
    if (!value || typeof value !== "object") throw new Error("Runtime request is invalid.");
    const record = value as Record<string, unknown>;
    const providerId = record.providerId === undefined ? undefined : validateRuntimeProviderId(record.providerId);
    const model = validateModelId(record.model);
    const messages = record.messages === undefined ? undefined : validateMessages(record.messages);
    const prompt = record.prompt === undefined ? undefined : validatePrompt(record.prompt);
    const input = record.input === undefined ? undefined : validateInput(record.input);
    const timeoutMs = record.timeoutMs === undefined ? undefined : validateTimeout(record.timeoutMs);
    const options = record.options === undefined ? undefined : validateOptions(record.options);
    if ((kind === "chat" || kind === "stream") && !messages?.length && !prompt) throw new Error("Runtime chat request requires messages or prompt.");
    if (kind === "completion" && !prompt && !messages?.length) throw new Error("Runtime completion request requires a prompt.");
    if (kind === "embeddings" && input === undefined && prompt === undefined) throw new Error("Runtime embeddings request requires input.");
    return { providerId, model, messages, prompt, input, timeoutMs, options };
  }

  private validateModelOperationRequest(value: unknown): AIRuntimeModelOperationRequest {
    if (!value || typeof value !== "object") throw new Error("Runtime model operation request is invalid.");
    const record = value as Record<string, unknown>;
    return {
      providerId: record.providerId === undefined ? undefined : validateRuntimeProviderId(record.providerId),
      modelId: validateModelId(record.modelId)
    };
  }

  private validateLifecycleRequest(value: unknown): AIRuntimeLifecycleRequest {
    if (!value || typeof value !== "object") throw new Error("Runtime lifecycle request is invalid.");
    const record = value as Record<string, unknown>;
    return {
      providerId: record.providerId === undefined ? undefined : validateRuntimeProviderId(record.providerId),
      modelId: record.modelId === undefined ? undefined : validateModelId(record.modelId)
    };
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
        error: errorMessage(error)
      });
    }
  }

  private snapshot(): AIRuntimeState {
    const providers = this.registry.list().map((provider) => {
      const detection = this.detections.get(provider.id) ?? emptyDetection(provider.id);
      const metrics = this.metricsFor(provider.id);
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
        requestCount: metrics.requestCount,
        failureCount: metrics.failureCount,
        runningRequestCount: metrics.runningRequestCount,
        queuedRequestCount: metrics.queuedRequestCount,
        tokenThroughput: metrics.tokenThroughput,
        memoryUsageMb: undefined,
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
      preferred: provider.id === this.persistence.preferredRuntimeId,
      requestCount: provider.requestCount,
      failureCount: provider.failureCount,
      runningRequestCount: provider.runningRequestCount,
      queuedRequestCount: provider.queuedRequestCount,
      memoryUsageMb: provider.memoryUsageMb,
      contextWindow: provider.models.find((model) => model.contextWindow)?.contextWindow,
      tokenThroughput: provider.tokenThroughput
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
      requests: Array.from(this.requests.values()).sort((a, b) => b.queuedAt.localeCompare(a.queuedAt)),
      downloads: Array.from(this.downloads.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      updatedAt: new Date().toISOString()
    };
  }

  private metricsFor(providerId: AIRuntimeProviderId): RuntimeProviderMetrics {
    const existing = this.metrics.get(providerId);
    if (existing) return existing;
    const created = { requestCount: 0, failureCount: 0, runningRequestCount: 0, queuedRequestCount: 0, totalOutputTokens: 0, totalLatencyMs: 0 };
    this.metrics.set(providerId, created);
    return created;
  }

  private markRequestDone(providerId: AIRuntimeProviderId, requestId: string, status: AIRuntimeRequestStatus, latencyMs: number, error?: string): void {
    const metrics = this.metricsFor(providerId);
    metrics.requestCount += 1;
    metrics.totalLatencyMs += latencyMs;
    if (status === "Failed") metrics.failureCount += 1;
    this.updateRequest(requestId, { status, latencyMs, error, completedAt: new Date().toISOString() });
  }

  private bumpFailure(providerId: AIRuntimeProviderId): void {
    this.metricsFor(providerId).failureCount += 1;
  }

  private updateRequest(requestId: string, updates: Partial<AIRuntimeRequestSummary>): void {
    const current = this.requests.get(requestId);
    if (!current) return;
    this.requests.set(requestId, { ...current, ...updates });
  }

  private updateQueuedCounts(): void {
    for (const provider of PROVIDER_IDS) {
      const metrics = this.metricsFor(provider);
      metrics.runningRequestCount = Array.from(this.requests.values()).filter((request) => request.providerId === provider && request.status === "Running").length;
      metrics.queuedRequestCount = Array.from(this.requests.values()).filter((request) => request.providerId === provider && request.status === "Queued").length;
    }
  }

  private trimRequestHistory(): void {
    const requests = Array.from(this.requests.values()).sort((a, b) => b.queuedAt.localeCompare(a.queuedAt));
    for (const request of requests.slice(MAX_RECENT_REQUESTS)) {
      if (request.status !== "Running" && request.status !== "Queued") this.requests.delete(request.id);
    }
    const downloads = Array.from(this.downloads.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    for (const item of downloads.slice(MAX_DOWNLOADS)) {
      if (item.status !== "Running" && item.status !== "Queued") this.downloads.delete(item.id);
    }
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

  private nextRequestId(prefix: string): string {
    this.requestSequence += 1;
    return `${prefix}-${Date.now().toString(36)}-${this.requestSequence}`;
  }
}

export function validateRuntimeSelectRequest(value: unknown): AIRuntimeSelectRequest {
  if (!value || typeof value !== "object") {
    throw new Error("Runtime selection request is invalid.");
  }
  const request = value as Record<string, unknown>;
  const runtimeId = request.runtimeId === undefined ? undefined : validateRuntimeProviderId(request.runtimeId);
  const modelId = request.modelId === undefined ? undefined : validateModelId(request.modelId);
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

export function validateModelId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 300 ||
    value.includes("\0") ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,299}$/u.test(value)
  ) {
    throw new Error("Runtime model id is invalid.");
  }
  return value;
}

function validateSelectionMode(value: unknown): AIRuntimeSelectionMode {
  if (typeof value !== "string" || !SELECTION_MODES.includes(value as AIRuntimeSelectionMode)) {
    throw new Error("Runtime selection mode is invalid.");
  }
  return value as AIRuntimeSelectionMode;
}

function validatePrompt(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_PROMPT_LENGTH || value.includes("\0")) {
    throw new Error("Runtime prompt is invalid.");
  }
  return value;
}

function validateMessages(value: unknown): AIChatMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) throw new Error("Runtime messages are invalid.");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Runtime message is invalid.");
    const record = item as Record<string, unknown>;
    if (record.role !== "system" && record.role !== "user" && record.role !== "assistant") throw new Error("Runtime message role is invalid.");
    return { role: record.role, content: validatePrompt(record.content) };
  });
}

function validateInput(value: unknown): string | string[] {
  if (typeof value === "string") return validatePrompt(value);
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_INPUT_COUNT) throw new Error("Runtime input is invalid.");
  return value.map(validatePrompt);
}

function validateTimeout(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1_000 || value > 300_000) {
    throw new Error("Runtime timeout is invalid.");
  }
  return value;
}

function validateOptions(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Runtime options are invalid.");
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z0-9_.-]{1,80}$/u.test(key) || /api[_-]?key|token|secret|password/i.test(key)) continue;
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null) result[key] = item;
  }
  return result;
}

function validateSmallStringFromObject(value: unknown, fieldName: string): string {
  if (!value || typeof value !== "object") throw new Error("Runtime cancel request is invalid.");
  const item = (value as Record<string, unknown>)[fieldName];
  if (typeof item !== "string" || item.length === 0 || item.length > 300 || item.includes("\0")) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return item;
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
    version: sanitizeOptionalString(detection.version),
    endpoint: sanitizeOptionalString(detection.endpoint),
    supportedModels: sanitizeModels(detection.supportedModels),
    health: sanitizeHealth(detection.health),
    latencyMs: typeof detection.latencyMs === "number" ? detection.latencyMs : undefined,
    error: sanitizeOptionalString(detection.error)
  };
}

function sanitizeModels(models: AIRuntimeModel[]): AIRuntimeModel[] {
  return Array.isArray(models)
    ? models.slice(0, 200).map((model) => ({
        id: validateModelId(model.id),
        displayName: sanitizeOptionalString(model.displayName) ?? model.id,
        contextWindow: typeof model.contextWindow === "number" ? model.contextWindow : undefined,
        parameters: sanitizeOptionalString(model.parameters),
        quantization: sanitizeOptionalString(model.quantization),
        embeddingSupport: model.embeddingSupport === true,
        visionSupport: model.visionSupport === true,
        toolSupport: model.toolSupport === true
      }))
    : [];
}

function sanitizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && !value.includes("\0") ? value.slice(0, 500) : undefined;
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  return new Promise((resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("Runtime request timed out."));
    }, timeoutMs);
    promise.then(resolve, reject).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || /cancelled|aborted/i.test(error.message));
}

function abortError(): Error {
  const error = new Error("Runtime request was cancelled.");
  error.name = "AbortError";
  return error;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.name === "AbortError" ? "Runtime request was cancelled." : error.message;
  return "Runtime request failed.";
}
