import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import type {
  AIRuntimeDetection,
  AIRuntimeHealthState,
  AIRuntimeModel,
  AIRuntimeProvider,
  AIRuntimeProviderId,
  AIRuntimeRequest
} from "../../../src/features/ai-runtime/types";

const REQUEST_TIMEOUT_MS = 1800;
const VERSION_TIMEOUT_MS = 1200;
const MAX_RESPONSE_BYTES = 1024 * 1024;

export type RuntimeFetch = typeof fetch;

export type CommandRunner = (command: string, args: string[], timeoutMs: number) => Promise<{ stdout: string; stderr: string }>;

export type ProviderDependencies = {
  env?: NodeJS.ProcessEnv;
  fetch?: RuntimeFetch;
  runCommand?: CommandRunner;
};

type ProviderConfig = {
  id: AIRuntimeProviderId;
  name: string;
  endpoint?: string;
  envKeys: string[];
  versionCommands: string[][];
  versionPath?: string;
  modelsPath: string;
  parseVersion?: (payload: unknown) => string | undefined;
  parseModels: (payload: unknown) => AIRuntimeModel[];
};

export function validateRuntimeEndpoint(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
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
        this.config.versionPath ? this.getJson(this.config.versionPath).catch(() => null) : Promise.resolve(null),
        this.getJson(this.config.modelsPath)
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

  async startModel(_modelId: string): Promise<void> {
    throw new Error(`${this.name} model start is not implemented in the foundation milestone.`);
  }

  async stopModel(_modelId: string): Promise<void> {
    throw new Error(`${this.name} model stop is not implemented in the foundation milestone.`);
  }

  async chat(_request: AIRuntimeRequest): Promise<unknown> {
    throw new Error(`${this.name} chat is reserved for a later milestone.`);
  }

  async embeddings(_input: string | string[], _modelId?: string): Promise<unknown> {
    throw new Error(`${this.name} embeddings are reserved for a later milestone.`);
  }

  async completion(_request: AIRuntimeRequest): Promise<unknown> {
    throw new Error(`${this.name} completion is reserved for a later milestone.`);
  }

  async *stream(_request: AIRuntimeRequest): AsyncIterable<string> {
    throw new Error(`${this.name} streaming is reserved for a later milestone.`);
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

  private async getJson(pathname: string): Promise<unknown> {
    if (!this.endpoint) throw new Error("Runtime endpoint is not configured.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(this.urlFor(pathname), { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Runtime returned HTTP ${response.status}.`);
      }
      const text = await response.text();
      if (text.length > MAX_RESPONSE_BYTES) {
        throw new Error("Runtime response was too large.");
      }
      return text ? JSON.parse(text) : {};
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
    parseModels: parseOpenAIModels
  };
}

function parseOpenAIModels(payload: unknown): AIRuntimeModel[] {
  const data = arrayProp(payload, "data");
  return data.map((model) => modelFromName(stringProp(model, "id") ?? "unknown", { toolSupport: true }));
}

function modelFromName(name: string, options: Partial<AIRuntimeModel> = {}): AIRuntimeModel {
  return {
    id: name,
    displayName: name,
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

function stringProp(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" ? item : undefined;
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
  if (error instanceof Error) return error.name === "AbortError" ? "Runtime request timed out." : error.message;
  return "Runtime request failed.";
}
