const { ModelCapabilityTypes, ProviderErrorCategories, ProviderStates } = require("../model-provider-gateway-constants");

class OpenAICompatibleProviderAdapter {
  constructor(options = {}) {
    this.transport = options.transport;
    this.credentialResolver = options.credentialResolver || null;
    this.configuration = null;
  }

  initialize(configuration, context = {}) {
    if (!this.transport) throw new Error("OpenAI-compatible adapter transport is required.");
    this.configuration = configuration;
    this.context = context;
    return { status: ProviderStates.CONFIGURED, providerId: configuration.id };
  }

  shutdown() {
    return { status: "SHUTDOWN" };
  }

  async healthCheck(options = {}) {
    if (this.configuration.credentialReference && this.credentialResolver && !this.credentialResolver.hasCredential(this.configuration.credentialReference, this.context)) {
      return { status: ProviderStates.AUTHENTICATION_FAILED, credentialReference: this.configuration.credentialReference };
    }
    const url = joinUrl(this.configuration.baseUrl, this.modelsPath());
    const response = await this.transport.request({ method: "GET", url, headers: await this.headers(), timeoutMs: options.timeoutMs || this.configuration.connectTimeoutMs, requestId: options.requestId || `openai-health-${Date.now()}` });
    if (response.status === 401 || response.status === 403) return { status: ProviderStates.AUTHENTICATION_FAILED, response };
    if (response.status >= 200 && response.status < 500) return { status: ProviderStates.AVAILABLE, response };
    return { status: ProviderStates.UNAVAILABLE, response };
  }

  async discoverModels(options = {}) {
    const response = await this.transport.request({ method: "GET", url: joinUrl(this.configuration.baseUrl, this.modelsPath()), headers: await this.headers(), timeoutMs: options.timeoutMs || this.configuration.connectTimeoutMs, requestId: options.requestId || `openai-models-${Date.now()}` });
    if (response.status === 401 || response.status === 403) throw this.normalizeError({ message: "OpenAI-compatible authentication failed.", statusCode: response.status }, null);
    const data = Array.isArray(response.body && response.body.data) ? response.body.data : Array.isArray(response.body && response.body.models) ? response.body.models : [];
    return data.map((model) => this.modelDescriptor(model.id || model.name || model.model, model));
  }

  getCapabilities() {
    return defaultOpenAICompatibleCapabilities(this.configuration);
  }

  async complete(request, options = {}) {
    const response = await this.transport.request({
      method: "POST",
      url: joinUrl(this.configuration.baseUrl, this.chatPath()),
      headers: await this.headers({ "Content-Type": "application/json" }),
      body: this.normalizeRequest(request),
      timeoutMs: options.timeoutMs || this.configuration.requestTimeoutMs,
      requestId: request.id,
    }, options);
    if (response.status === 401 || response.status === 403) throw this.normalizeError({ message: "OpenAI-compatible authentication failed.", statusCode: response.status }, request);
    if (response.status === 429) throw this.normalizeError({ message: "OpenAI-compatible provider rate limited the request.", statusCode: response.status, retryable: true }, request);
    if (response.status < 200 || response.status >= 300) throw this.normalizeError({ message: `OpenAI-compatible provider returned ${response.status}.`, statusCode: response.status }, request);
    return this.normalizeResponse(response.body, request, { latency: response.timing });
  }

  async stream(request, listener, options = {}) {
    await this.transport.stream({
      method: "POST",
      url: joinUrl(this.configuration.baseUrl, this.chatPath()),
      headers: await this.headers({ "Content-Type": "application/json" }),
      body: { ...this.normalizeRequest(request), stream: true },
      timeoutMs: options.timeoutMs || this.configuration.requestTimeoutMs,
      requestId: request.id,
    }, (event) => {
      const chunks = normalizeSse(event.data || event.body || event);
      for (const chunk of chunks) {
        const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta || {};
        if (delta.content) listener({ type: "CONTENT_DELTA", content: delta.content, providerId: this.configuration.id, requestId: request.id });
        if (delta.tool_calls) listener({ type: "TOOL_CALL_DELTA", toolCalls: normalizeOpenAIToolCalls(delta.tool_calls), providerId: this.configuration.id, requestId: request.id });
      }
    }, options);
    return { content: "", finishReason: "stream", usage: { estimated: true }, metadata: { streamed: true } };
  }

  cancel(requestId) {
    return this.transport.cancel(requestId);
  }

  normalizeRequest(request) {
    const body = {
      model: request.modelId && request.modelId.includes(":") ? request.modelId.split(":").slice(1).join(":") : request.modelId,
      messages: request.messages && request.messages.length ? request.messages.map((message) => ({
        role: roleToOpenAI(message.role),
        content: message.content || "",
        name: message.name || undefined,
        tool_call_id: message.toolCallId || undefined,
      })) : [{ role: "user", content: request.prompt || "" }],
      stream: request.stream === true,
    };
    if (request.systemInstruction) body.messages.unshift({ role: "system", content: request.systemInstruction });
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.topP !== undefined) body.top_p = request.topP;
    if (request.maximumOutputTokens !== undefined) body.max_tokens = request.maximumOutputTokens;
    if (request.stop !== undefined) body.stop = request.stop;
    if (request.seed !== undefined) body.seed = request.seed;
    if (request.tools && request.tools.length) body.tools = request.tools;
    if (request.responseSchema) body.response_format = { type: "json_schema", json_schema: request.responseSchema };
    return body;
  }

  normalizeResponse(response, request, options = {}) {
    const choice = response && response.choices && response.choices[0] || {};
    const message = choice.message || {};
    return {
      providerId: this.configuration.id,
      modelId: request.modelId,
      content: message.content || response.output_text || response.text || "",
      messages: message.content ? [{ role: "ASSISTANT", content: message.content }] : [],
      toolCalls: normalizeOpenAIToolCalls(message.tool_calls || []),
      finishReason: choice.finish_reason || response.finish_reason || "unknown",
      usage: normalizeOpenAIUsage(response.usage),
      latency: options.latency || {},
      metadata: { providerPayloadReference: "openai-compatible-response" },
    };
  }

  normalizeError(error, request) {
    const statusCode = error.statusCode || null;
    let category = ProviderErrorCategories.PROVIDER;
    if (statusCode === 401) category = ProviderErrorCategories.AUTHENTICATION;
    else if (statusCode === 403) category = ProviderErrorCategories.AUTHORIZATION;
    else if (statusCode === 404) category = ProviderErrorCategories.MODEL_NOT_FOUND;
    else if (statusCode === 429) category = ProviderErrorCategories.RATE_LIMIT;
    return {
      code: `OPENAI_COMPATIBLE_${category}`,
      category,
      providerId: this.configuration && this.configuration.id,
      modelId: request && request.modelId,
      requestId: request && request.id,
      message: error.message || "OpenAI-compatible request failed.",
      userMessage: error.message || "OpenAI-compatible provider failed.",
      retryable: category === ProviderErrorCategories.RATE_LIMIT || category === ProviderErrorCategories.CONNECTION,
      retryAfterMs: error.retryAfterMs || null,
      recoverable: category !== ProviderErrorCategories.AUTHENTICATION,
      severity: "ERROR",
      statusCode,
      providerCode: error.providerCode || null,
      details: {},
      suggestedActions: category === ProviderErrorCategories.AUTHENTICATION ? ["Update provider credential."] : ["Check provider endpoint and model."],
      metadata: {},
    };
  }

  estimateTokens(input) {
    const text = typeof input === "string" ? input : JSON.stringify(input || {});
    return { tokens: Math.ceil(text.length / 4), estimated: true, tokenizer: "openai-compatible-approximate" };
  }

  async headers(extra = {}) {
    const headers = { ...(this.configuration.headers || {}), ...extra };
    if (this.configuration.credentialReference && this.credentialResolver) {
      const credential = await this.credentialResolver.getCredential(this.configuration.credentialReference, this.context);
      if (credential) headers.Authorization = `Bearer ${credential}`;
    }
    return headers;
  }

  modelDescriptor(name, metadata = {}) {
    return {
      id: `${this.configuration.id}:${name}`,
      providerId: this.configuration.id,
      name,
      displayName: name,
      family: String(name || "").split("-")[0] || "unknown",
      version: metadata.created ? String(metadata.created) : null,
      capabilities: defaultOpenAICompatibleCapabilities(this.configuration),
      contextWindow: metadata.contextWindow || this.configuration.metadata && this.configuration.metadata.contextWindow || 8192,
      maximumOutputTokens: metadata.maximumOutputTokens || 2048,
      tokenizer: "openai-compatible-approximate",
      local: false,
      remote: true,
      enabled: true,
      status: "AVAILABLE",
      latencyClass: "REMOTE",
      qualityClass: "UNKNOWN",
      costClass: this.configuration.pricing ? "CONFIGURED" : "UNKNOWN",
      pricing: this.configuration.pricing || { monetaryCostUnknown: true },
      limitations: ["Capabilities are provider-compatible declarations unless verified."],
      metadata,
    };
  }

  chatPath() {
    return this.configuration.metadata && this.configuration.metadata.chatPath || "/v1/chat/completions";
  }

  modelsPath() {
    return this.configuration.metadata && this.configuration.metadata.modelsPath || "/v1/models";
  }
}

function defaultOpenAICompatibleCapabilities(configuration = {}) {
  const caps = [
    ModelCapabilityTypes.CHAT,
    ModelCapabilityTypes.STREAMING,
    ModelCapabilityTypes.TOOL_CALLING,
    ModelCapabilityTypes.STRUCTURED_OUTPUT,
    ModelCapabilityTypes.JSON_MODE,
    ModelCapabilityTypes.SYSTEM_MESSAGES,
    ModelCapabilityTypes.MULTI_TURN,
    ModelCapabilityTypes.TEMPERATURE,
    ModelCapabilityTypes.TOP_P,
    ModelCapabilityTypes.STOP_SEQUENCES,
    ModelCapabilityTypes.SEED,
    ModelCapabilityTypes.TOKEN_USAGE,
    ModelCapabilityTypes.CANCELLATION,
  ];
  if (configuration.metadata && configuration.metadata.supportsEmbeddings) caps.push(ModelCapabilityTypes.EMBEDDINGS);
  return caps;
}

function normalizeOpenAIToolCalls(calls) {
  if (!Array.isArray(calls)) return [];
  return calls.map((call, index) => ({
    id: call.id || `tool-${index}`,
    name: call.function && call.function.name || call.name || "unknown",
    arguments: parseArguments(call.function && call.function.arguments || call.arguments || {}),
    index: call.index === undefined ? index : call.index,
    status: "CREATED",
    providerPayloadReference: "openai-compatible-tool-call",
    metadata: {},
  }));
}

function parseArguments(value) {
  if (typeof value !== "string") return value || {};
  try { return JSON.parse(value); } catch (_) { return { parseError: true, raw: value }; }
}

function normalizeOpenAIUsage(usage = {}) {
  return {
    inputTokens: usage.prompt_tokens || usage.input_tokens || null,
    outputTokens: usage.completion_tokens || usage.output_tokens || null,
    totalTokens: usage.total_tokens || null,
    cachedInputTokens: usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens || null,
    reasoningTokens: usage.completion_tokens_details && usage.completion_tokens_details.reasoning_tokens || null,
    estimated: usage.total_tokens === undefined,
    tokenizer: "openai-compatible",
  };
}

function roleToOpenAI(role) {
  const value = String(role || "").toLowerCase();
  if (value === "developer") return "system";
  if (["system", "user", "assistant", "tool"].includes(value)) return value;
  return "user";
}

function normalizeSse(value) {
  if (typeof value !== "string") return [value];
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line) => line !== "data: [DONE]").map((line) => {
    const text = line.startsWith("data:") ? line.slice(5).trim() : line;
    try { return JSON.parse(text); } catch (_) { return { choices: [{ delta: { content: text } }] }; }
  });
}

function joinUrl(base, pathname) {
  return `${String(base).replace(/\/+$/, "")}${pathname}`;
}

module.exports = {
  OpenAICompatibleProviderAdapter,
};
