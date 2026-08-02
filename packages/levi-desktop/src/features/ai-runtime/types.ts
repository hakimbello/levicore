export type AIRuntimeProviderId = "ollama" | "llama-cpp" | "koboldcpp" | "lm-studio" | "openai-compatible";

export type AIRuntimeHealthState = "Running" | "Stopped" | "Unavailable" | "Busy" | "Error";

export type AIRuntimeModel = {
  id: string;
  displayName: string;
  contextWindow?: number;
  parameters?: string;
  quantization?: string;
  embeddingSupport: boolean;
  visionSupport: boolean;
  toolSupport: boolean;
};

export type AIRuntimeRequestStatus = "Queued" | "Running" | "Cancelled" | "Failed" | "Completed";

export type AIRuntimeModelOperationStatus = "Idle" | "Queued" | "Running" | "Completed" | "Failed" | "Cancelled";

export type AIRuntimeDetection = {
  providerId: AIRuntimeProviderId;
  installed: boolean;
  running: boolean;
  version?: string;
  endpoint?: string;
  supportedModels: AIRuntimeModel[];
  health: AIRuntimeHealthState;
  latencyMs?: number;
  error?: string;
};

export type AIRuntimeDiagnostics = AIRuntimeDetection & {
  providerName: string;
  checkedAt: string;
  selected: boolean;
  preferred: boolean;
  requestCount: number;
  failureCount: number;
  runningRequestCount: number;
  queuedRequestCount: number;
  memoryUsageMb?: number;
  contextWindow?: number;
  tokenThroughput?: number;
};

export type AIRuntimeProviderSummary = {
  id: AIRuntimeProviderId;
  name: string;
  installed: boolean;
  running: boolean;
  version?: string;
  endpoint?: string;
  status: AIRuntimeHealthState;
  models: AIRuntimeModel[];
  latencyMs?: number;
  requestCount: number;
  failureCount: number;
  runningRequestCount: number;
  queuedRequestCount: number;
  tokenThroughput?: number;
  memoryUsageMb?: number;
  error?: string;
};

export type AIRuntimeSelectionMode = "automatic" | "manual";

export type AIRuntimeRequestSummary = {
  id: string;
  providerId: AIRuntimeProviderId;
  modelId: string;
  type: "chat" | "completion" | "stream" | "embeddings" | "pull-model" | "delete-model" | "start" | "stop" | "restart";
  status: AIRuntimeRequestStatus;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  latencyMs?: number;
  error?: string;
};

export type AIRuntimeModelDownload = {
  id: string;
  providerId: AIRuntimeProviderId;
  modelId: string;
  status: AIRuntimeModelOperationStatus;
  progress?: number;
  downloadedBytes?: number;
  totalBytes?: number;
  message?: string;
  error?: string;
  startedAt: string;
  updatedAt: string;
};

export type AIRuntimeState = {
  providers: AIRuntimeProviderSummary[];
  selectedRuntimeId?: AIRuntimeProviderId;
  preferredRuntimeId?: AIRuntimeProviderId;
  automaticRuntimeId?: AIRuntimeProviderId;
  lastSuccessfulRuntimeId?: AIRuntimeProviderId;
  lastSelectedModelId?: string;
  selectionMode: AIRuntimeSelectionMode;
  diagnostics: AIRuntimeDiagnostics[];
  requests: AIRuntimeRequestSummary[];
  downloads: AIRuntimeModelDownload[];
  updatedAt?: string;
};

export type AIRuntimeSelectRequest = {
  runtimeId?: AIRuntimeProviderId;
  modelId?: string;
  preferred?: boolean;
  mode?: AIRuntimeSelectionMode;
};

export type AIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AIRuntimeUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type AIRuntimeRequest = {
  model: string;
  providerId?: AIRuntimeProviderId;
  messages?: AIChatMessage[];
  prompt?: string;
  input?: string | string[];
  options?: Record<string, unknown>;
  timeoutMs?: number;
  requestId?: string;
};

export type AIRuntimeInvocationResponse = {
  requestId: string;
  providerId: AIRuntimeProviderId;
  model: string;
  content: string;
  finishReason?: string;
  usage?: AIRuntimeUsage;
  latencyMs: number;
  fallbackProviderIds?: AIRuntimeProviderId[];
};

export type AIRuntimeEmbeddingsResponse = {
  requestId: string;
  providerId: AIRuntimeProviderId;
  model: string;
  embeddings: number[][];
  latencyMs: number;
};

export type AIRuntimeStreamEvent =
  | { type: "queued"; requestId: string; providerId: AIRuntimeProviderId; model: string }
  | { type: "started"; requestId: string; providerId: AIRuntimeProviderId; model: string }
  | { type: "token"; requestId: string; providerId: AIRuntimeProviderId; model: string; token: string }
  | { type: "completed"; requestId: string; providerId: AIRuntimeProviderId; model: string; response: AIRuntimeInvocationResponse }
  | { type: "cancelled"; requestId: string; providerId: AIRuntimeProviderId; model: string }
  | { type: "failed"; requestId: string; providerId: AIRuntimeProviderId; model: string; error: string; fallbackProviderIds?: AIRuntimeProviderId[] };

export type AIRuntimeStreamResult = {
  requestId: string;
  providerId: AIRuntimeProviderId;
  model: string;
  events: AIRuntimeStreamEvent[];
  content: string;
  fallbackProviderIds?: AIRuntimeProviderId[];
};

export type AIRuntimeModelOperationRequest = {
  providerId?: AIRuntimeProviderId;
  modelId: string;
};

export type AIRuntimeLifecycleRequest = {
  providerId?: AIRuntimeProviderId;
  modelId?: string;
};

export type AIRuntimeModelOperationResult = {
  providerId: AIRuntimeProviderId;
  modelId: string;
  status: AIRuntimeModelOperationStatus;
  progress?: number;
  message?: string;
  error?: string;
};

export type AIRuntimeProvider = {
  id: AIRuntimeProviderId;
  name: string;
  detect(): Promise<AIRuntimeDetection>;
  health(): Promise<AIRuntimeDetection>;
  listModels(): Promise<AIRuntimeModel[]>;
  pullModel(modelId: string, signal?: AbortSignal): AsyncIterable<AIRuntimeModelDownload>;
  deleteModel(modelId: string, signal?: AbortSignal): Promise<AIRuntimeModelOperationResult>;
  startRuntime(modelId?: string): Promise<AIRuntimeModelOperationResult>;
  stopRuntime(modelId?: string): Promise<AIRuntimeModelOperationResult>;
  restartRuntime(modelId?: string): Promise<AIRuntimeModelOperationResult>;
  cancelRequest(requestId: string): Promise<void>;
  startModel(modelId: string): Promise<void>;
  stopModel(modelId: string): Promise<void>;
  chat(request: AIRuntimeRequest, signal?: AbortSignal): Promise<AIRuntimeInvocationResponse>;
  embeddings(input: string | string[], modelId?: string, signal?: AbortSignal): Promise<AIRuntimeEmbeddingsResponse>;
  completion(request: AIRuntimeRequest, signal?: AbortSignal): Promise<AIRuntimeInvocationResponse>;
  stream(request: AIRuntimeRequest, signal?: AbortSignal): AsyncIterable<AIRuntimeStreamEvent>;
};
