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
  error?: string;
};

export type AIRuntimeSelectionMode = "automatic" | "manual";

export type AIRuntimeState = {
  providers: AIRuntimeProviderSummary[];
  selectedRuntimeId?: AIRuntimeProviderId;
  preferredRuntimeId?: AIRuntimeProviderId;
  automaticRuntimeId?: AIRuntimeProviderId;
  lastSuccessfulRuntimeId?: AIRuntimeProviderId;
  lastSelectedModelId?: string;
  selectionMode: AIRuntimeSelectionMode;
  diagnostics: AIRuntimeDiagnostics[];
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

export type AIRuntimeRequest = {
  model: string;
  messages?: AIChatMessage[];
  prompt?: string;
};

export type AIRuntimeProvider = {
  id: AIRuntimeProviderId;
  name: string;
  detect(): Promise<AIRuntimeDetection>;
  health(): Promise<AIRuntimeDetection>;
  listModels(): Promise<AIRuntimeModel[]>;
  startModel(modelId: string): Promise<void>;
  stopModel(modelId: string): Promise<void>;
  chat(request: AIRuntimeRequest): Promise<unknown>;
  embeddings(input: string | string[], modelId?: string): Promise<unknown>;
  completion(request: AIRuntimeRequest): Promise<unknown>;
  stream(request: AIRuntimeRequest): AsyncIterable<string>;
};
