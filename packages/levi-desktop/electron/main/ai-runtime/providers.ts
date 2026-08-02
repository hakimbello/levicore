import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import type {
  AIRuntimeDetection,
  AIRuntimeEmbeddingsResponse,
  AIRuntimeHealthState,
  AIRuntimeInvocationResponse,
  AIRuntimeModel,
  AIRuntimeModelDownload,
  AIRuntimeModelOperationResult,
  AIRuntimeProvider,
  AIRuntimeProviderId,
  AIRuntimeRequest,
  AIRuntimeStreamEvent
} from "../../../src/features/ai-runtime/types";

const REQUEST_TIMEOUT_MS = 60_000;
const HEALTH_TIMEOUT_MS = 1_800;
const VERSION_TIMEOUT_MS = 1_200;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_STREAM_BYTES = 16 * 1024 * 1024;

export type RuntimeFetch = typeof fetch;

export type CommandRunner = (command: string, args: string[], timeoutMs: number) => Promise<{ stdout: string; stderr: string }>;

export type ProviderDependencies = {
  env?: NodeJS.ProcessEnv;
  fetch?: RuntimeFetch;
  runCommand?: CommandRunner;
};

type ProviderProtocol = "ollama" | "openai" | "koboldcpp";

type ProviderConfig = {
  id: AIRuntimeProviderId;
  name: string;
  endpoint?: string;
  envKeys: string[];
  versionCommands: string[][];
  versionPath?: string;
  modelsPath: string;
  protocol: ProviderProtocol;
  chatPath?: string;
  completionPath?: string;
  embeddingsPath?: string;
  pullPath?: string;
  deletePath?: string;
  parseVersion?: (payload: unknown) => string | undefined;
  parseModels: (payload: unknown) => AIRuntimeModel[];
};

type RuntimeFetchOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export function validateRuntimeEndpoint(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(normalizeEndpointInput(value));
  } catch {
    throw new Error("Runtime endpoint must be a valid URL.");
  }
  const localhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";
  if (parsed.protocol !== "https:" && !(localhost && parsed.protocol === "http:")) {
    throw new Error("Remote runtime endpoints must use HTTPS.");
  }
  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  return parsed.toString().replace(/\/$/, "");
}

export function createDefaultCommandRunner(): CommandRunner {
  return (command, args, timeoutMs) =>
    new Promise((resolve, reject) => {
      execFile(command, args, { timeout: timeoutMs, windowsHide: true, shell: false }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      });
    });
}

export function createDefaultRuntimeProviders(dependencies: ProviderDependencies = {}): AIRuntimeProvider[] {
  const env = dependencies.env ?? process.env;
  const fetchImpl = dependencies.fetch ?? fetch;
  const runCommand = dependencies.runCommand ?? createDefaultCommandRunner();
  return [
    new HttpRuntimeProvider(ollamaConfig(env), fetchImpl, runCommand),
    new HttpRuntimeProvider(llamaCppConfig(env), fetchImpl, runCommand),
    new HttpRuntimeProvider(koboldCppConfig(env), fetchImpl, runCommand),
    new HttpRuntimeProvider(lmStudioConfig(env), fetchImpl, runCommand),
    new HttpRuntimeProvider(openAICompatibleConfig(env), fetchImpl, runCommand)
  ];
}

class HttpRuntimeProvider implements AIRuntimeProvider {
  readonly id: AIRuntimeProviderId;
  readonly name: string;
  private readonly endpoint?: string;
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly config: ProviderConfig,
    private readonly fetchImpl: RuntimeFetch,
    private readonly runCommand: CommandRunner
  ) {
    this.id = config.id;
    this.name = config.name;
    this.endpoint = config.endpoint ? validateRuntimeEndpoint(config.endpoint) : undefined;
  }

  async detect(): Promise<AIRuntimeDetection> {
    const [version, health] = await Promise.all([this.detectVersion(), this.health()]);
    return {
      ...health,
      installed: Boolean(version.version) || health.running,
      version: version.version ?? health.version,
      error: health.error ?? version.error
    };
  }

  async health(): Promise<AIRuntimeDetection> {
    if (!this.endpoint) {
      return this.baseDetection("Unavailable", false, false, [], undefined, "Runtime endpoint is not configured.");
    }
    const started = performance.now();
    try {
      const [versionPayload, modelsPayload] = await Promise.all([
        this.config.versionPath ? this.getJson(this.config.versionPath, { timeoutMs: HEALTH_TIMEOUT_MS }).catch(() => null) : Promise.resolve(null),
        this.getJson(this.config.modelsPath, { timeoutMs: HEALTH_TIMEOUT_MS })
      ]);
      const models = this.config.parseModels(modelsPayload);
      return this.baseDetection(
        "Running",
        true,
        true,
        models,
        Math.round(performance.now() - started),
        undefined,
        versionPayload ? this.config.parseVersion?.(versionPayload) : undefined
      );
    } catch (error) {
      return this.baseDetection("Stopped", false, false, [], Math.round(performance.now() - started), errorMessage(error));
    }
  }

  async listModels(): Promise<AIRuntimeModel[]> {
    return (await this.health()).supportedModels;
  }

  async *pullModel(modelId: string, signal?: AbortSignal): AsyncIterable<AIRuntimeModelDownload> {
    if (!this.config.pullPath) {
      throw new Error(`${this.name} does not support provider-managed model downloads.`);
    }
    const requestId = requestIdFor("pull");
    const startedAt = new Date().toISOString();
    const response = await this.fetchResponse(this.config.pullPath, {
      method: "POST",
      body: this.config.protocol === "ollama" ? { name: modelId, stream: true } : { model: modelId },
      signal,
      timeoutMs: REQUEST_TIMEOUT_MS * 10
    });
    let latest: AIRuntimeModelDownload = {
      id: requestId,
      providerId: this.id,
      modelId,
      status: "Running",
      startedAt,
      updatedAt: startedAt
    };
    for await (const payload of readRuntimePayloads(response)) {
      const completed = numberProp(payload, "completed");
      const total = numberProp(payload, "total");
      latest = {
        ...latest,
        status: Boolean((payload as Record<string, unknown>).error) ? "Failed" : "Running",
        progress: total && completed !== undefined ? Math.max(0, Math.min(1, completed / total)) : latest.progress,
        downloadedBytes: completed ?? latest.downloadedBytes,
        totalBytes: total ?? latest.totalBytes,
        message: stringProp(payload, "status") ?? latest.message,
        error: stringProp(payload, "error") ?? latest.error,
        updatedAt: new Date().toISOString()
      };
      yield latest;
      if (latest.status === "Failed") throw new Error(latest.error ?? "Model download failed.");
    }
    yield {
      ...latest,
      status: "Completed",
      progress: 1,
      message: latest.message ?? "Model download completed.",
      updatedAt: new Date().toISOString()
    };
  }

  async deleteModel(modelId: string, signal?: AbortSignal): Promise<AIRuntimeModelOperationResult> {
    if (!this.config.deletePath) {
      return { providerId: this.id, modelId, status: "Failed", error: `${this.name} does not support provider-managed model deletion.` };
    }
    try {
      await this.getJson(this.config.deletePath, {
        method: "DELETE",
        body: this.config.protocol === "ollama" ? { name: modelId } : { model: modelId },
        signal,
        timeoutMs: REQUEST_TIMEOUT_MS
      });
      return { providerId: this.id, modelId, status: "Completed", progress: 1, message: "Model deleted." };
    } catch (error) {
      return { providerId: this.id, modelId, status: "Failed", error: errorMessage(error) };
    }
  }

  async startRuntime(modelId?: string): Promise<AIRuntimeModelOperationResult> {
    const health = await this.health();
    return health.running
      ? { providerId: this.id, modelId: modelId ?? "", status: "Completed", progress: 1, message: `${this.name} is reachable.` }
      : { providerId: this.id, modelId: modelId ?? "", status: "Failed", error: health.error ?? `${this.name} is not reachable.` };
  }

  async stopRuntime(modelId?: string): Promise<AIRuntimeModelOperationResult> {
    return { providerId: this.id, modelId: modelId ?? "", status: "Failed", error: `${this.name} cannot be stopped by Levi without a provider-managed process.` };
  }

  async restartRuntime(modelId?: string): Promise<AIRuntimeModelOperationResult> {
    return this.startRuntime(modelId);
  }

  async cancelRequest(requestId: string): Promise<void> {
    const controller = this.controllers.get(requestId);
    controller?.abort();
    this.controllers.delete(requestId);
  }

  async startModel(modelId: string): Promise<void> {
    const result = await this.startRuntime(modelId);
    if (result.status === "Failed") throw new Error(result.error ?? "Model start failed.");
  }

  async stopModel(modelId: string): Promise<void> {
    const result = await this.stopRuntime(modelId);
    if (result.status === "Failed") throw new Error(result.error ?? "Model stop failed.");
  }

  async chat(request: AIRuntimeRequest, signal?: AbortSignal): Promise<AIRuntimeInvocationResponse> {
    const started = performance.now();
    const requestId = request.requestId ?? requestIdFor("chat");
    const messages = request.messages?.length ? request.messages : [{ role: "user" as const, content: request.prompt ?? "" }];
    const payload = await this.getJson(this.chatPath(), {
      method: "POST",
      body: this.chatBody(request.model, messages, request.options, false),
      signal: this.signalFor(requestId, signal),
      timeoutMs: request.timeoutMs
    });
    this.controllers.delete(requestId);
    return this.normalizedResponse(requestId, request.model, payload, Math.round(performance.now() - started), "chat");
  }

  async embeddings(input: string | string[], modelId = "default", signal?: AbortSignal): Promise<AIRuntimeEmbeddingsResponse> {
    const started = performance.now();
    const requestId = requestIdFor("embeddings");
    const values = Array.isArray(input) ? input : [input];
    if (!this.config.embeddingsPath) {
      throw new Error(`${this.name} does not support embeddings.`);
    }
    if (this.config.protocol === "ollama") {
      const embeddings: number[][] = [];
      for (const value of values) {
        const payload = await this.getJson(this.config.embeddingsPath, {
          method: "POST",
          body: { model: modelId, prompt: value },
          signal,
          timeoutMs: REQUEST_TIMEOUT_MS
        });
        embeddings.push(numberArrayProp(payload, "embedding"));
      }
      return { requestId, providerId: this.id, model: modelId, embeddings, latencyMs: Math.round(performance.now() - started) };
    }
    const payload = await this.getJson(this.config.embeddingsPath, {
      method: "POST",
      body: { model: modelId, input: Array.isArray(input) ? input : input },
      signal,
      timeoutMs: REQUEST_TIMEOUT_MS
    });
    return {
      requestId,
      providerId: this.id,
      model: modelId,
      embeddings: parseOpenAIEmbeddings(payload),
      latencyMs: Math.round(performance.now() - started)
    };
  }

  async completion(request: AIRuntimeRequest, signal?: AbortSignal): Promise<AIRuntimeInvocationResponse> {
    const started = performance.now();
    const requestId = request.requestId ?? requestIdFor("completion");
    const payload = await this.getJson(this.completionPath(), {
      method: "POST",
      body: this.completionBody(request.model, request.prompt ?? messagesToPrompt(request.messages), request.options, false),
      signal: this.signalFor(requestId, signal),
      timeoutMs: request.timeoutMs
    });
    this.controllers.delete(requestId);
    return this.normalizedResponse(requestId, request.model, payload, Math.round(performance.now() - started), "completion");
  }

  async *stream(request: AIRuntimeRequest, signal?: AbortSignal): AsyncIterable<AIRuntimeStreamEvent> {
    const started = performance.now();
    const requestId = request.requestId ?? requestIdFor("stream");
    const model = request.model;
    yield { type: "started", requestId, providerId: this.id, model };
    if (this.config.protocol === "koboldcpp") {
      const response = await this.completion({ ...request, requestId }, signal);
      yield { type: "token", requestId, providerId: this.id, model, token: response.content };
      yield { type: "completed", requestId, providerId: this.id, model, response };
      return;
    }
    const response = await this.fetchResponse(request.messages ? this.chatPath() : this.completionPath(), {
      method: "POST",
      body: request.messages
        ? this.chatBody(model, request.messages, request.options, true)
        : this.completionBody(model, request.prompt ?? "", request.options, true),
      signal: this.signalFor(requestId, signal),
      timeoutMs: request.timeoutMs
    });
    let content = "";
    try {
      for await (const payload of readRuntimePayloads(response)) {
        const token = this.tokenFromStreamPayload(payload);
        if (token) {
          content += token;
          yield { type: "token", requestId, providerId: this.id, model, token };
        }
      }
      yield {
        type: "completed",
        requestId,
        providerId: this.id,
        model,
        response: {
          requestId,
          providerId: this.id,
          model,
          content,
          latencyMs: Math.round(performance.now() - started)
        }
      };
    } finally {
      this.controllers.delete(requestId);
    }
  }

  private chatPath(): string {
    if (this.config.chatPath) return this.config.chatPath;
    throw new Error(`${this.name} does not support chat requests.`);
  }

  private completionPath(): string {
    if (this.config.completionPath) return this.config.completionPath;
    throw new Error(`${this.name} does not support completion requests.`);
  }

  private chatBody(model: string, messages: AIRuntimeRequest["messages"], options: Record<string, unknown> | undefined, stream: boolean): Record<string, unknown> {
    if (this.config.protocol === "ollama") return { model, messages, stream, options: sanitizeOptions(options) };
    return { model, messages, stream, ...sanitizeOptions(options) };
  }

  private completionBody(model: string, prompt: string, options: Record<string, unknown> | undefined, stream: boolean): Record<string, unknown> {
    if (this.config.protocol === "ollama") return { model, prompt, stream, options: sanitizeOptions(options) };
    if (this.config.protocol === "koboldcpp") return { prompt, max_length: numberOption(options, "max_tokens", 256) };
    return { model, prompt, stream, ...sanitizeOptions(options) };
  }

  private normalizedResponse(requestId: string, model: string, payload: unknown, latencyMs: number, mode: "chat" | "completion"): AIRuntimeInvocationResponse {
    if (this.config.protocol === "ollama") {
      const message = objectProp(payload, "message");
      return {
        requestId,
        providerId: this.id,
        model,
        content: stringProp(message, "content") ?? stringProp(payload, "response") ?? "",
        finishReason: stringProp(payload, "done_reason"),
        usage: {
          inputTokens: numberProp(payload, "prompt_eval_count"),
          outputTokens: numberProp(payload, "eval_count")
        },
        latencyMs
      };
    }
    if (this.config.protocol === "koboldcpp") {
      return {
        requestId,
        providerId: this.id,
        model,
        content: stringProp(payload, "results") ?? stringProp(payload, "response") ?? stringProp(payload, "text") ?? "",
        latencyMs
      };
    }
    const choice = arrayProp(payload, "choices")[0];
    const message = objectProp(choice, "message");
    const usage = objectProp(payload, "usage");
    return {
      requestId,
      providerId: this.id,
      model,
      content: mode === "chat" ? stringProp(message, "content") ?? "" : stringProp(choice, "text") ?? "",
      finishReason: stringProp(choice, "finish_reason"),
      usage: {
        inputTokens: numberProp(usage, "prompt_tokens"),
        outputTokens: numberProp(usage, "completion_tokens"),
        totalTokens: numberProp(usage, "total_tokens")
      },
      latencyMs
    };
  }

  private tokenFromStreamPayload(payload: unknown): string {
    if (this.config.protocol === "ollama") {
      const message = objectProp(payload, "message");
      return stringProp(message, "content") ?? stringProp(payload, "response") ?? "";
    }
    const choice = arrayProp(payload, "choices")[0];
    const delta = objectProp(choice, "delta");
    return stringProp(delta, "content") ?? stringProp(choice, "text") ?? "";
  }

  private signalFor(requestId: string, signal?: AbortSignal): AbortSignal | undefined {
    const controller = new AbortController();
    this.controllers.set(requestId, controller);
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    return controller.signal;
  }

  private async detectVersion(): Promise<{ version?: string; error?: string }> {
    for (const [command, ...args] of this.config.versionCommands) {
      try {
        const output = await this.runCommand(command, args, VERSION_TIMEOUT_MS);
        const text = `${output.stdout}\n${output.stderr}`.trim();
        if (text) return { version: firstLine(text) };
      } catch {
        continue;
      }
    }
    return {};
  }

  private async getJson(pathname: string, options: RuntimeFetchOptions = {}): Promise<unknown> {
    const response = await this.fetchResponse(pathname, options);
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error("Runtime response was too large.");
    }
    return text ? JSON.parse(text) : {};
  }

  private async fetchResponse(pathname: string, options: RuntimeFetchOptions = {}): Promise<Response> {
    if (!this.endpoint) throw new Error("Runtime endpoint is not configured.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    try {
      const response = await this.fetchImpl(this.urlFor(pathname), {
        method: options.method ?? "GET",
        headers: options.body === undefined ? undefined : { "content-type": "application/json" },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`Runtime returned HTTP ${response.status}.`);
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  private urlFor(pathname: string): string {
    if (!this.endpoint) throw new Error("Runtime endpoint is not configured.");
    if (this.endpoint.endsWith("/v1") && pathname.startsWith("/v1/")) {
      return `${this.endpoint}${pathname.slice(3)}`;
    }
    return `${this.endpoint}${pathname}`;
  }

  private baseDetection(
    health: AIRuntimeHealthState,
    installed: boolean,
    running: boolean,
    supportedModels: AIRuntimeModel[],
    latencyMs?: number,
    error?: string,
    version?: string
  ): AIRuntimeDetection {
    return {
      providerId: this.id,
      installed,
      running,
      version,
      endpoint: this.endpoint,
      supportedModels,
      health,
      latencyMs,
      error
    };
  }
}

function endpointFromEnv(env: NodeJS.ProcessEnv, keys: string[], fallback?: string): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return fallback;
}

function ollamaConfig(env: NodeJS.ProcessEnv): ProviderConfig {
  return {
    id: "ollama",
    name: "Ollama",
    endpoint: endpointFromEnv(env, ["LEVI_OLLAMA_ENDPOINT", "OLLAMA_HOST"], "http://127.0.0.1:11434"),
    envKeys: ["LEVI_OLLAMA_ENDPOINT", "OLLAMA_HOST"],
    versionCommands: [[process.platform === "win32" ? "ollama.exe" : "ollama", "--version"]],
    versionPath: "/api/version",
    modelsPath: "/api/tags",
    protocol: "ollama",
    chatPath: "/api/chat",
    completionPath: "/api/generate",
    embeddingsPath: "/api/embeddings",
    pullPath: "/api/pull",
    deletePath: "/api/delete",
    parseVersion: (payload) => stringProp(payload, "version"),
    parseModels: (payload) => {
      const models = arrayProp(payload, "models");
      return models.map((model) => modelFromName(stringProp(model, "name") ?? stringProp(model, "model") ?? "unknown"));
    }
  };
}

function llamaCppConfig(env: NodeJS.ProcessEnv): ProviderConfig {
  return {
    id: "llama-cpp",
    name: "llama.cpp server",
    endpoint: endpointFromEnv(env, ["LEVI_LLAMA_CPP_ENDPOINT"], "http://127.0.0.1:8080"),
    envKeys: ["LEVI_LLAMA_CPP_ENDPOINT"],
    versionCommands: [
      [process.platform === "win32" ? "llama-server.exe" : "llama-server", "--version"],
      [process.platform === "win32" ? "server.exe" : "llama.cpp", "--version"]
    ],
    modelsPath: "/v1/models",
    protocol: "openai",
    chatPath: "/v1/chat/completions",
    completionPath: "/v1/completions",
    embeddingsPath: "/v1/embeddings",
    parseModels: parseOpenAIModels
  };
}

function koboldCppConfig(env: NodeJS.ProcessEnv): ProviderConfig {
  return {
    id: "koboldcpp",
    name: "KoboldCpp",
    endpoint: endpointFromEnv(env, ["LEVI_KOBOLDCPP_ENDPOINT"], "http://127.0.0.1:5001"),
    envKeys: ["LEVI_KOBOLDCPP_ENDPOINT"],
    versionCommands: [[process.platform === "win32" ? "koboldcpp.exe" : "koboldcpp", "--version"]],
    modelsPath: "/api/v1/model",
    protocol: "koboldcpp",
    completionPath: "/api/v1/generate",
    parseModels: (payload) => [modelFromName(stringProp(payload, "result") ?? stringProp(payload, "model") ?? "KoboldCpp model")]
  };
}

function lmStudioConfig(env: NodeJS.ProcessEnv): ProviderConfig {
  return {
    id: "lm-studio",
    name: "LM Studio",
    endpoint: endpointFromEnv(env, ["LEVI_LM_STUDIO_ENDPOINT"], "http://127.0.0.1:1234/v1"),
    envKeys: ["LEVI_LM_STUDIO_ENDPOINT"],
    versionCommands: [],
    modelsPath: "/models",
    protocol: "openai",
    chatPath: "/chat/completions",
    completionPath: "/completions",
    embeddingsPath: "/embeddings",
    parseModels: parseOpenAIModels
  };
}

function openAICompatibleConfig(env: NodeJS.ProcessEnv): ProviderConfig {
  return {
    id: "openai-compatible",
    name: "OpenAI Compatible",
    endpoint: endpointFromEnv(env, ["LEVI_OPENAI_COMPATIBLE_ENDPOINT", "OPENAI_BASE_URL"]),
    envKeys: ["LEVI_OPENAI_COMPATIBLE_ENDPOINT", "OPENAI_BASE_URL"],
    versionCommands: [],
    modelsPath: "/v1/models",
    protocol: "openai",
    chatPath: "/v1/chat/completions",
    completionPath: "/v1/completions",
    embeddingsPath: "/v1/embeddings",
    parseModels: parseOpenAIModels
  };
}

function parseOpenAIModels(payload: unknown): AIRuntimeModel[] {
  const data = arrayProp(payload, "data");
  return data.map((model) => modelFromName(stringProp(model, "id") ?? "unknown", { toolSupport: true }));
}

function parseOpenAIEmbeddings(payload: unknown): number[][] {
  const data = arrayProp(payload, "data");
  const embeddings = data.map((item) => numberArrayProp(item, "embedding")).filter((item) => item.length > 0);
  return embeddings.length > 0 ? embeddings : [numberArrayProp(payload, "embedding")].filter((item) => item.length > 0);
}

async function* readRuntimePayloads(response: Response): AsyncIterable<unknown> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_STREAM_BYTES) throw new Error("Runtime stream was too large.");
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const parsed = parseStreamLine(line);
      if (parsed !== undefined) yield parsed;
    }
  }
  buffer += decoder.decode();
  const parsed = parseStreamLine(buffer);
  if (parsed !== undefined) yield parsed;
}

function parseStreamLine(line: string): unknown | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
  if (!payload || payload === "[DONE]") return undefined;
  try {
    return JSON.parse(payload);
  } catch {
    return undefined;
  }
}

function modelFromName(name: string, options: Partial<AIRuntimeModel> = {}): AIRuntimeModel {
  return {
    id: name,
    displayName: name,
    contextWindow: inferContextWindow(name),
    parameters: inferParameters(name),
    quantization: inferQuantization(name),
    embeddingSupport: /embed/i.test(name) || options.embeddingSupport === true,
    visionSupport: /vision|llava|moondream/i.test(name) || options.visionSupport === true,
    toolSupport: options.toolSupport === true
  };
}

function inferParameters(name: string): string | undefined {
  return name.match(/(\d+(?:\.\d+)?\s?[bB])/u)?.[1]?.replace(/\s+/g, "");
}

function inferQuantization(name: string): string | undefined {
  return name.match(/\b(q[2-8]_[A-Za-z0-9_]+|q[2-8]|fp16|f16|bf16)\b/i)?.[1];
}

function inferContextWindow(name: string): number | undefined {
  const match = name.match(/\b(4k|8k|16k|32k|64k|128k|256k)\b/i)?.[1];
  if (!match) return undefined;
  return Number.parseInt(match, 10) * 1024;
}

function messagesToPrompt(messages: AIRuntimeRequest["messages"]): string {
  return messages?.map((message) => `${message.role}: ${message.content}`).join("\n") ?? "";
}

function normalizeEndpointInput(value: string): string {
  const trimmed = value.trim();
  if (/^[\w.-]+:\d+(?:\/.*)?$/u.test(trimmed) && !trimmed.includes("://")) {
    return `http://${trimmed}`;
  }
  return trimmed;
}

function sanitizeOptions(options: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!options) return {};
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (!/^[A-Za-z0-9_.-]{1,80}$/u.test(key) || /api[_-]?key|token|secret|password/i.test(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      safe[key] = value;
    }
  }
  return safe;
}

function numberOption(options: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = options?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function requestIdFor(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function objectProp(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = (value as Record<string, unknown>)[key];
  return item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : undefined;
}

function stringProp(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" ? item : undefined;
}

function numberProp(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "number" && Number.isFinite(item) ? item : undefined;
}

function numberArrayProp(value: unknown, key: string): number[] {
  if (!value || typeof value !== "object") return [];
  const item = (value as Record<string, unknown>)[key];
  return Array.isArray(item) ? item.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry)) : [];
}

function arrayProp(value: unknown, key: string): unknown[] {
  if (!value || typeof value !== "object") return [];
  const item = (value as Record<string, unknown>)[key];
  return Array.isArray(item) ? item : [];
}

function firstLine(value: string): string {
  return value.split(/\r?\n/)[0]?.trim().slice(0, 120) ?? "";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.name === "AbortError" ? "Runtime request timed out or was cancelled." : error.message;
  return "Runtime request failed.";
}
