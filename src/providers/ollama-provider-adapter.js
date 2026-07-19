const { ModelCapabilityTypes, ProviderErrorCategories, ProviderStates, ProviderTypes } = require("../model-provider-gateway-constants");

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

class OllamaProviderAdapter {
  constructor(options = {}) {
    this.transport = options.transport;
    this.configuration = null;
    this.initialized = false;
    this.controllers = new Map();
  }

  initialize(configuration) {
    if (!this.transport) throw new Error("Ollama adapter transport is required.");
    this.configuration = { ...configuration, baseUrl: configuration.baseUrl || DEFAULT_OLLAMA_BASE_URL };
    this.initialized = true;
    return { status: ProviderStates.CONFIGURED, providerId: configuration.id };
  }

  shutdown() {
    this.initialized = false;
    this.controllers.clear();
    return { status: "SHUTDOWN" };
  }

  async healthCheck(options = {}) {
    const url = joinUrl(this.baseUrl(), "/api/tags");
    const response = await this.transport.request({ method: "GET", url, timeoutMs: options.timeoutMs || this.configuration.connectTimeoutMs || 5000, requestId: options.requestId || `ollama-health-${Date.now()}` });
    if (response.status >= 200 && response.status < 300) return { status: ProviderStates.AVAILABLE, response };
    return { status: ProviderStates.UNAVAILABLE, response };
  }

  async discoverModels(options = {}) {
    const response = await this.transport.request({ method: "GET", url: joinUrl(this.baseUrl(), "/api/tags"), timeoutMs: options.timeoutMs || this.configuration.connectTimeoutMs || 5000, requestId: options.requestId || `ollama-models-${Date.now()}` });
    if (response.status < 200 || response.status >= 300) throw this.normalizeError({ message: `Ollama model discovery returned ${response.status}.`, statusCode: response.status }, null);
    const models = Array.isArray(response.body && response.body.models) ? response.body.models : [];
    return models.map((model) => ({
      id: `${this.configuration.id}:${model.name}`,
      providerId: this.configuration.id,
      name: model.name,
      displayName: model.name,
      family: familyFor(model.name),
      version: model.digest || null,
      capabilities: defaultOllamaCapabilities(model),
      contextWindow: model.contextWindow || this.configuration.metadata && this.configuration.metadata.contextWindow || 4096,
      maximumOutputTokens: model.maximumOutputTokens || 1024,
      tokenizer: "ollama-approximate",
      local: true,
      remote: false,
      enabled: true,
      status: "AVAILABLE",
      latencyClass: "LOCAL",
      qualityClass: "UNKNOWN",
      costClass: "LOCAL_UNKNOWN",
      pricing: this.configuration.pricing || { monetaryCostUnknown: true },
      limitations: model.details ? [] : ["Capabilities are adapter defaults unless configured or observed."],
      metadata: { ollama: model },
    }));
  }

  getCapabilities(modelId) {
    return defaultOllamaCapabilities({ name: modelId });
  }

  async complete(request, options = {}) {
    const payload = ollamaPayload(request, false);
    const response = await this.transport.request({
      method: "POST",
      url: joinUrl(this.baseUrl(), "/api/chat"),
      headers: { "Content-Type": "application/json" },
      body: payload,
      timeoutMs: options.timeoutMs || this.configuration.requestTimeoutMs,
      requestId: request.id,
    }, options);
    if (response.status < 200 || response.status >= 300) throw this.normalizeError({ message: `Ollama returned ${response.status}.`, statusCode: response.status }, request);
    return this.normalizeResponse(response.body, request, { latency: response.timing });
  }

  async stream(request, listener, options = {}) {
    const payload = ollamaPayload(request, true);
    const chunks = [];
    await this.transport.stream({
      method: "POST",
      url: joinUrl(this.baseUrl(), "/api/chat"),
      headers: { "Content-Type": "application/json" },
      body: payload,
      timeoutMs: options.timeoutMs || this.configuration.requestTimeoutMs,
      requestId: request.id,
    }, (event) => {
      const body = event.data || event.body || event;
      const normalized = typeof body === "string" ? parseLines(body) : [body];
      for (const chunk of normalized) {
        if (!chunk) continue;
        const rawContent = chunk.message && chunk.message.content !== undefined ? chunk.message.content : chunk.response;
        const content = typeof rawContent === "string" ? rawContent : "";
        if (content) listener({ type: "CONTENT_DELTA", content, providerId: this.configuration.id, requestId: request.id });
        if (content || chunk.message || typeof chunk.response === "string") chunks.push(chunk);
      }
    }, options);
    const content = chunks.map((chunk) => chunk.message && chunk.message.content || chunk.response || "").join("");
    return this.normalizeResponse({ message: { content }, done: true }, request, {});
  }

  cancel(requestId) {
    return this.transport.cancel(requestId);
  }

  normalizeRequest(request) {
    return ollamaPayload(request, request.stream === true);
  }

  normalizeResponse(response, request, options = {}) {
    const content = response && response.message && response.message.content || response && response.response || response && response.content || "";
    const toolCalls = normalizeOllamaToolCalls(response && response.message && response.message.tool_calls);
    return {
      providerId: this.configuration.id,
      modelId: request.modelId,
      content,
      messages: content ? [{ role: "ASSISTANT", content }] : [],
      toolCalls,
      finishReason: response && response.done === false ? "length" : "stop",
      usage: {
        inputTokens: numberOrNull(response && (response.prompt_eval_count || response.prompt_eval_count_total)),
        outputTokens: numberOrNull(response && response.eval_count),
        totalTokens: numberOrNull(response && response.prompt_eval_count) + numberOrNull(response && response.eval_count) || null,
        estimated: false,
        tokenizer: "ollama",
      },
      latency: options.latency || {},
      metadata: { providerPayloadReference: "ollama-chat-response" },
    };
  }

  normalizeError(error, request) {
    if (error && error.code === "CANCELLED") {
      return {
        code: "OLLAMA_REQUEST_CANCELLED",
        category: ProviderErrorCategories.CANCELLATION,
        providerId: this.configuration && this.configuration.id,
        modelId: request && request.modelId,
        requestId: request && request.id,
        message: error.message || "Ollama request cancelled.",
        userMessage: "Ollama request cancelled.",
        retryable: false,
        recoverable: true,
        severity: "INFO",
        statusCode: null,
        details: {},
        suggestedActions: [],
        metadata: {},
      };
    }
    return {
      code: "OLLAMA_ERROR",
      category: error && error.statusCode === 404 ? ProviderErrorCategories.MODEL_NOT_FOUND : ProviderErrorCategories.CONNECTION,
      providerId: this.configuration && this.configuration.id,
      modelId: request && request.modelId,
      requestId: request && request.id,
      message: error.message || "Ollama request failed.",
      userMessage: "Ollama is unavailable or returned an invalid response.",
      retryable: true,
      recoverable: true,
      severity: "ERROR",
      statusCode: error.statusCode || null,
      details: {},
      suggestedActions: ["Check Ollama is running.", "Verify the configured model is installed."],
      metadata: {},
    };
  }

  estimateTokens(input) {
    const text = typeof input === "string" ? input : JSON.stringify(input || {});
    return { tokens: Math.ceil(text.length / 4), estimated: true, tokenizer: "ollama-approximate" };
  }

  baseUrl() {
    return this.configuration && this.configuration.baseUrl || DEFAULT_OLLAMA_BASE_URL;
  }
}

function ollamaPayload(request, stream) {
  const messages = request.messages && request.messages.length
    ? request.messages.map((message) => ({ role: roleToOllama(message.role), content: message.content || "" }))
    : [{ role: "user", content: request.prompt || "" }];
  if (request.systemInstruction) messages.unshift({ role: "system", content: request.systemInstruction });
  const payload = {
    model: request.modelId && request.modelId.includes(":") ? request.modelId.split(":").slice(1).join(":") : request.modelId,
    messages,
    stream,
    options: {},
  };
  if (request.temperature !== undefined) payload.options.temperature = request.temperature;
  if (request.topP !== undefined) payload.options.top_p = request.topP;
  if (request.seed !== undefined) payload.options.seed = request.seed;
  if (request.maximumOutputTokens !== undefined) payload.options.num_predict = request.maximumOutputTokens;
  if (request.responseSchema) payload.format = request.responseSchema;
  if (request.tools && request.tools.length) payload.tools = request.tools;
  return payload;
}

function roleToOllama(role) {
  const value = String(role || "").toLowerCase();
  if (value === "developer") return "system";
  if (value === "tool") return "tool";
  if (["system", "user", "assistant"].includes(value)) return value;
  return "user";
}

function defaultOllamaCapabilities(model) {
  const caps = [
    ModelCapabilityTypes.CHAT,
    ModelCapabilityTypes.STREAMING,
    ModelCapabilityTypes.JSON_MODE,
    ModelCapabilityTypes.STRUCTURED_OUTPUT,
    ModelCapabilityTypes.SYSTEM_MESSAGES,
    ModelCapabilityTypes.MULTI_TURN,
    ModelCapabilityTypes.TEMPERATURE,
    ModelCapabilityTypes.TOP_P,
    ModelCapabilityTypes.SEED,
    ModelCapabilityTypes.TOKEN_USAGE,
    ModelCapabilityTypes.CANCELLATION,
  ];
  if (model && Array.isArray(model.capabilities) && model.capabilities.some((capability) => String(capability).toLowerCase() === "tools")) caps.push(ModelCapabilityTypes.TOOL_CALLING);
  if (model && model.details && /embed/i.test(model.name || "")) caps.push(ModelCapabilityTypes.EMBEDDINGS);
  return caps;
}

function normalizeOllamaToolCalls(calls) {
  if (!Array.isArray(calls)) return [];
  return calls.map((call, index) => ({
    id: call.id || `ollama-tool-${index}`,
    name: call.function && call.function.name || call.name || "unknown",
    arguments: call.function && call.function.arguments || call.arguments || {},
    index,
    status: "CREATED",
    providerPayloadReference: "ollama-tool-call",
    metadata: {},
  }));
}

function familyFor(name) {
  return String(name || "").split(":")[0] || "unknown";
}

function joinUrl(base, pathname) {
  return `${String(base).replace(/\/+$/, "")}${pathname}`;
}

function parseLines(text) {
  return String(text).split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch (_) { return { response: line }; }
  });
}

function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

module.exports = {
  DEFAULT_OLLAMA_BASE_URL,
  OllamaProviderAdapter,
};
