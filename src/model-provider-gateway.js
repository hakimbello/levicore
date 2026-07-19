const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const { InMemoryCredentialResolver } = require("./credential-resolver");
const {
  ModelCapabilityTypes,
  ModelRequestStates,
  ModelRequestTypes,
  PrivacyClassifications,
  ProviderErrorCategories,
  ProviderStates,
  ProviderTypes,
  RequestPriorities,
  RoutingStrategies,
  StreamEventTypes,
} = require("./model-provider-gateway-constants");

const MODEL_PROVIDER_GATEWAY_SCHEMA_VERSION = 1;

const DEFAULT_BOUNDS = Object.freeze({
  maximumProviders: 16,
  maximumModels: 256,
  maximumRequests: 1000,
  maximumQueuedRequests: 128,
  maximumConcurrentRequests: 4,
  maximumConcurrentRequestsPerProvider: 2,
  maximumRetries: 2,
  maximumFallbackProviders: 4,
  maximumMessages: 64,
  maximumMessageCharacters: 20000,
  maximumToolDefinitions: 32,
  maximumToolSchemaSize: 20000,
  maximumResponseSchemaSize: 20000,
  maximumStreamEvents: 1000,
  maximumBufferedStreamBytes: 500000,
  maximumResponseBytes: 1000000,
  maximumRequestHistory: 500,
  maximumUsageHistory: 1000,
  maximumProviderHeaders: 32,
  maximumHealthCheckDuration: 5000,
  maximumRequestDuration: 60000,
  contextSafetyMarginTokens: 128,
});

const DEFAULT_CONFIGURATION = Object.freeze({
  id: "model-provider-gateway",
  storagePath: path.join(".levi", "model-provider-gateway.json"),
  defaultRoutingStrategy: RoutingStrategies.PRIVACY_FIRST,
  enabled: true,
  offlineMode: true,
  persistenceEnabled: true,
  allowRemoteSourceCode: false,
  allowRemoteSensitiveContent: false,
  metadata: Object.freeze({}),
});

const LIFECYCLE_EVENTS = Object.freeze({
  INITIALIZATION_STARTED: "model_gateway_initialization_started",
  READY: "model_gateway_ready",
  DEGRADED: "model_gateway_degraded",
  FAILED: "model_gateway_failed",
  PROVIDER_REGISTERED: "provider_registered",
  PROVIDER_UNREGISTERED: "provider_unregistered",
  PROVIDER_ENABLED: "provider_enabled",
  PROVIDER_DISABLED: "provider_disabled",
  PROVIDER_HEALTH_CHECK_STARTED: "provider_health_check_started",
  PROVIDER_HEALTH_CHECK_COMPLETED: "provider_health_check_completed",
  PROVIDER_HEALTH_CHECK_FAILED: "provider_health_check_failed",
  MODEL_DISCOVERY_STARTED: "model_discovery_started",
  MODEL_DISCOVERY_COMPLETED: "model_discovery_completed",
  MODEL_REGISTERED: "model_registered",
  MODEL_UNREGISTERED: "model_unregistered",
  REQUEST_CREATED: "model_request_created",
  REQUEST_QUEUED: "model_request_queued",
  ROUTING_STARTED: "model_routing_started",
  ROUTING_COMPLETED: "model_routing_completed",
  REQUEST_STARTED: "model_request_started",
  STREAM_STARTED: "model_stream_started",
  STREAM_EVENT: "model_stream_event",
  RETRY_STARTED: "model_retry_started",
  FALLBACK_STARTED: "model_fallback_started",
  REQUEST_SUCCEEDED: "model_request_succeeded",
  REQUEST_PARTIALLY_SUCCEEDED: "model_request_partially_succeeded",
  REQUEST_CANCELLED: "model_request_cancelled",
  REQUEST_FAILED: "model_request_failed",
  REQUEST_TIMED_OUT: "model_request_timed_out",
  PRIVACY_BLOCKED: "model_privacy_blocked",
  CONTEXT_LIMIT_BLOCKED: "model_context_limit_blocked",
  USAGE_RECORDED: "model_usage_recorded",
  PERSISTED: "model_gateway_persisted",
  RESTORED: "model_gateway_restored",
  CORRUPTION_DETECTED: "model_gateway_corruption_detected",
  SHUTDOWN: "model_gateway_shutdown",
});

class ModelProviderGateway extends EventEmitter {
  constructor(options = {}) {
    super();
    this.configuration = { ...DEFAULT_CONFIGURATION, ...(options.configuration || {}) };
    this.bounds = normalizeBounds(options.bounds || {});
    this.clock = normalizeClock(options.clock);
    this.idAdapter = normalizeIdAdapter(options.idAdapter);
    this.credentialResolver = options.credentialResolver || new InMemoryCredentialResolver();
    this.providers = new Map();
    this.adapters = new Map();
    this.models = new Map();
    this.requests = new Map();
    this.responses = new Map();
    this.usage = [];
    this.queue = [];
    this.running = new Set();
    this.runningByProvider = new Map();
    this.eventLog = [];
    this.stats = emptyStats();
    this.state = ProviderStates.UNCONFIGURED;
    this.migrations = safeArray(options.migrations);
    for (const entry of safeArray(options.providers)) this.registerProvider(entry.configuration || entry, entry.adapter);
    for (const model of safeArray(options.models)) this.registerModel(model);
  }

  initialize(options = {}) {
    this.emitLifecycle(LIFECYCLE_EVENTS.INITIALIZATION_STARTED, {});
    try {
      for (const [providerId, adapter] of this.adapters.entries()) {
        const provider = this.providers.get(providerId);
        if (provider.enabled && adapter && typeof adapter.initialize === "function") adapter.initialize(provider, { gateway: this, options });
      }
      this.state = this.providers.size ? ProviderStates.AVAILABLE : ProviderStates.UNCONFIGURED;
      this.emitLifecycle(this.providers.size ? LIFECYCLE_EVENTS.READY : LIFECYCLE_EVENTS.DEGRADED, { providerCount: this.providers.size });
      return { status: this.state, providerCount: this.providers.size };
    } catch (error) {
      this.state = ProviderStates.FAILED;
      const normalized = this.normalizeError(error, null, ProviderErrorCategories.CONFIGURATION);
      this.emitLifecycle(LIFECYCLE_EVENTS.FAILED, { error: normalized });
      return { status: ProviderStates.FAILED, error: normalized };
    }
  }

  shutdown(options = {}) {
    for (const adapter of this.adapters.values()) if (adapter && typeof adapter.shutdown === "function") adapter.shutdown(options);
    this.state = ProviderStates.DISABLED;
    this.emitLifecycle(LIFECYCLE_EVENTS.SHUTDOWN, {});
    if (this.configuration.persistenceEnabled && options.save !== false) this.save();
    return { status: "SHUTDOWN" };
  }

  registerProvider(configuration, adapter) {
    if (this.providers.size >= this.bounds.maximumProviders) throw this.error("Maximum providers exceeded.", ProviderErrorCategories.RESOURCE_LIMIT);
    validateProviderAdapter(adapter);
    const provider = normalizeProviderConfiguration(configuration, this);
    this.providers.set(provider.id, provider);
    this.adapters.set(provider.id, adapter);
    this.stats.providersRegistered += 1;
    this.emitLifecycle(LIFECYCLE_EVENTS.PROVIDER_REGISTERED, { providerId: provider.id });
    for (const model of provider.models) this.registerModel({ ...model, providerId: provider.id });
    return clonePlainObject(redactProvider(provider));
  }

  unregisterProvider(providerId) {
    const id = requiredString(providerId, "Provider id is required.");
    const existed = this.providers.delete(id);
    this.adapters.delete(id);
    for (const [modelId, model] of Array.from(this.models.entries())) if (model.providerId === id) this.models.delete(modelId);
    if (existed) this.emitLifecycle(LIFECYCLE_EVENTS.PROVIDER_UNREGISTERED, { providerId: id });
    return existed;
  }

  enableProvider(providerId) {
    const provider = this.requireProvider(providerId);
    provider.enabled = true;
    provider.state = ProviderStates.CONFIGURED;
    this.emitLifecycle(LIFECYCLE_EVENTS.PROVIDER_ENABLED, { providerId });
    return redactProvider(provider);
  }

  disableProvider(providerId) {
    const provider = this.requireProvider(providerId);
    provider.enabled = false;
    provider.state = ProviderStates.DISABLED;
    this.emitLifecycle(LIFECYCLE_EVENTS.PROVIDER_DISABLED, { providerId });
    return redactProvider(provider);
  }

  updateProvider(providerId, patch, options = {}) {
    const provider = this.requireProvider(providerId);
    const next = normalizeProviderConfiguration({ ...provider, ...sanitizeProviderPatch(patch) }, this);
    this.providers.set(providerId, next);
    if (options.reinitialize !== false && this.adapters.has(providerId)) this.adapters.get(providerId).initialize(next, { gateway: this });
    return redactProvider(next);
  }

  getProvider(providerId) {
    const provider = this.providers.get(requiredString(providerId, "Provider id is required."));
    return provider ? redactProvider(provider) : null;
  }

  listProviders(filter = {}) {
    return Array.from(this.providers.values()).filter((provider) => matchesFilter(provider, filter)).sort(compareById).map(redactProvider);
  }

  async discoverModels(providerId, options = {}) {
    const provider = this.requireProvider(providerId);
    const adapter = this.requireAdapter(provider.id);
    this.emitLifecycle(LIFECYCLE_EVENTS.MODEL_DISCOVERY_STARTED, { providerId });
    const models = await adapter.discoverModels(options);
    const registered = models.map((model) => this.registerModel({ ...model, providerId: provider.id }));
    this.stats.modelsDiscovered += registered.length;
    this.emitLifecycle(LIFECYCLE_EVENTS.MODEL_DISCOVERY_COMPLETED, { providerId, modelCount: registered.length });
    return registered;
  }

  registerModel(model) {
    if (this.models.size >= this.bounds.maximumModels) throw this.error("Maximum models exceeded.", ProviderErrorCategories.RESOURCE_LIMIT);
    const normalized = normalizeModelDescriptor(model, this);
    this.models.set(normalized.id, normalized);
    this.emitLifecycle(LIFECYCLE_EVENTS.MODEL_REGISTERED, { modelId: normalized.id, providerId: normalized.providerId });
    return clonePlainObject(normalized);
  }

  unregisterModel(modelId) {
    const existed = this.models.delete(requiredString(modelId, "Model id is required."));
    if (existed) this.emitLifecycle(LIFECYCLE_EVENTS.MODEL_UNREGISTERED, { modelId });
    return existed;
  }

  getModel(modelId) {
    const model = this.models.get(requiredString(modelId, "Model id is required."));
    return model ? clonePlainObject(model) : null;
  }

  listModels(filter = {}) {
    return Array.from(this.models.values()).filter((model) => matchesFilter(model, filter)).sort(compareById).map(clonePlainObject);
  }

  getAvailableModels(options = {}) {
    return this.listModels({ enabled: true }).filter((model) => {
      const provider = this.providers.get(model.providerId);
      return provider && provider.enabled && ![ProviderStates.DISABLED, ProviderStates.AUTHENTICATION_FAILED, ProviderStates.FAILED, ProviderStates.UNAVAILABLE].includes(provider.state);
    });
  }

  getModelCapabilities(modelId) {
    const model = this.requireModel(modelId);
    return model.capabilities.slice();
  }

  async healthCheck(providerId, options = {}) {
    const provider = this.requireProvider(providerId);
    const adapter = this.requireAdapter(providerId);
    this.emitLifecycle(LIFECYCLE_EVENTS.PROVIDER_HEALTH_CHECK_STARTED, { providerId });
    try {
      const health = await adapter.healthCheck(options);
      provider.state = normalizeEnum(health.status || ProviderStates.AVAILABLE, ProviderStates, "provider state");
      provider.health = { ...health, checkedAt: this.now() };
      if (provider.state === ProviderStates.AVAILABLE) this.stats.providersAvailable += 1;
      else if (provider.state === ProviderStates.DEGRADED) this.stats.providersDegraded += 1;
      else this.stats.providersUnavailable += 1;
      this.stats.lastProviderHealthCheck = this.now();
      this.emitLifecycle(LIFECYCLE_EVENTS.PROVIDER_HEALTH_CHECK_COMPLETED, { providerId, state: provider.state });
      return clonePlainObject(provider.health);
    } catch (error) {
      const normalized = this.normalizeError(error, null, ProviderErrorCategories.CONNECTION, { providerId });
      provider.state = ProviderStates.FAILED;
      provider.health = { status: ProviderStates.FAILED, error: normalized, checkedAt: this.now() };
      this.emitLifecycle(LIFECYCLE_EVENTS.PROVIDER_HEALTH_CHECK_FAILED, { providerId, error: normalized });
      return clonePlainObject(provider.health);
    }
  }

  async healthCheckAll(options = {}) {
    const results = [];
    for (const provider of this.listProviders()) results.push(await this.healthCheck(provider.id, options));
    return results;
  }

  route(request, options = {}) {
    const normalized = normalizeModelRequest(request, this, options);
    this.emitLifecycle(LIFECYCLE_EVENTS.ROUTING_STARTED, { requestId: normalized.id });
    const validation = this.validateRequest(normalized, options);
    if (!validation.valid) throw validation.error;
    const requiredCapabilities = requiredCapabilitiesFor(normalized, options);
    const candidates = this.candidateModels(normalized, requiredCapabilities);
    const selected = selectModel(candidates, normalized.routingStrategy, options);
    if (!selected) {
      const error = this.error("No eligible model satisfies the request.", ProviderErrorCategories.MODEL_UNAVAILABLE, { requestId: normalized.id });
      this.emitLifecycle(LIFECYCLE_EVENTS.ROUTING_COMPLETED, { requestId: normalized.id, selectedModel: null });
      throw error;
    }
    const result = {
      requestId: normalized.id,
      consideredModels: candidates.map((entry) => ({ modelId: entry.model.id, providerId: entry.provider.id })),
      rejectedModels: candidates.flatMap((entry) => entry.rejected ? [{ modelId: entry.model.id, reasons: entry.reasons }] : []),
      selectedModel: selected.model,
      selectedProvider: redactProvider(selected.provider),
      fallbackOrder: candidates.filter((entry) => !entry.rejected).map((entry) => entry.model.id).slice(0, this.bounds.maximumFallbackProviders),
      confidence: selected.reasons.length ? 0.75 : 0.9,
      limitations: selected.reasons,
    };
    this.emitLifecycle(LIFECYCLE_EVENTS.ROUTING_COMPLETED, { requestId: normalized.id, selectedModel: selected.model.id, providerId: selected.provider.id });
    return result;
  }

  submit(request, options = {}) {
    if (this.queue.length >= this.bounds.maximumQueuedRequests) throw this.error("Maximum queued model requests exceeded.", ProviderErrorCategories.RESOURCE_LIMIT);
    const normalized = normalizeModelRequest(request, this, options);
    normalized.state = ModelRequestStates.QUEUED;
    this.requests.set(normalized.id, normalized);
    this.queue.push(normalized);
    this.stats.requestsCreated += 1;
    this.emitLifecycle(LIFECYCLE_EVENTS.REQUEST_CREATED, { requestId: normalized.id });
    this.emitLifecycle(LIFECYCLE_EVENTS.REQUEST_QUEUED, { requestId: normalized.id });
    return clonePlainObject(summarizeRequest(normalized));
  }

  async complete(request, options = {}) {
    const normalized = normalizeModelRequest(request, this, options);
    this.requests.set(normalized.id, normalized);
    this.stats.requestsCreated += 1;
    this.emitLifecycle(LIFECYCLE_EVENTS.REQUEST_CREATED, { requestId: normalized.id });
    return this.executeRequest(normalized, { ...options, stream: false });
  }

  async stream(request, listener, options = {}) {
    const normalized = normalizeModelRequest({ ...request, stream: true }, this, options);
    this.requests.set(normalized.id, normalized);
    this.stats.requestsCreated += 1;
    this.emitLifecycle(LIFECYCLE_EVENTS.REQUEST_CREATED, { requestId: normalized.id });
    return this.executeRequest(normalized, { ...options, stream: true, listener });
  }

  async executeRequest(request, options = {}) {
    const startedAt = Date.now();
    request.state = options.stream ? ModelRequestStates.STREAMING : ModelRequestStates.RUNNING;
    this.emitLifecycle(options.stream ? LIFECYCLE_EVENTS.STREAM_STARTED : LIFECYCLE_EVENTS.REQUEST_STARTED, { requestId: request.id });
    let routing;
    try {
      routing = this.route(request, options);
    } catch (error) {
      const normalizedError = error.category ? error : this.normalizeError(error, request, ProviderErrorCategories.INVALID_REQUEST);
      return this.finishRequest(request, ModelRequestStates.FAILED, null, normalizedError, startedAt);
    }
    const fallbackIds = routing.fallbackOrder.slice(0, options.allowFallback === false || request.routingStrategy === RoutingStrategies.EXPLICIT ? 1 : this.bounds.maximumFallbackProviders);
    let lastError = null;
    let attempts = 0;
    for (const modelId of fallbackIds) {
      const model = this.models.get(modelId);
      const provider = this.providers.get(model.providerId);
      const adapter = this.adapters.get(provider.id);
      request.providerId = provider.id;
      request.modelId = model.id;
      if (attempts > 0) this.emitLifecycle(LIFECYCLE_EVENTS.FALLBACK_STARTED, { requestId: request.id, providerId: provider.id, modelId: model.id });
      const retryLimit = Math.min(provider.maximumRetries, this.bounds.maximumRetries, options.maximumRetries === undefined ? provider.maximumRetries : options.maximumRetries);
      for (let retry = 0; retry <= retryLimit; retry += 1) {
        attempts += 1;
        if (retry > 0) {
          request.state = ModelRequestStates.RETRYING;
          this.stats.retries += 1;
          this.emitLifecycle(LIFECYCLE_EVENTS.RETRY_STARTED, { requestId: request.id, attempt: retry + 1 });
        }
        try {
          const output = options.stream
            ? await adapter.stream(request, this.safeStreamListener(options.listener, request), options)
            : await adapter.complete(request, options);
          const response = normalizeModelResponse(output, request, this, { attempts, startedAt, completedAt: Date.now() });
          const validation = this.validateResponse(response, options);
          if (!validation.valid) throw validation.error;
          if (request.responseSchema) response.structuredData = parseStructuredData(response.content, request.responseSchema, this);
          const usage = this.recordUsage(request, response, Date.now() - startedAt);
          response.usage = usage;
          response.cost = usage.cost;
          this.responses.set(response.id, response);
          return this.finishRequest(request, ModelRequestStates.SUCCEEDED, response, null, startedAt);
        } catch (error) {
          lastError = error.category ? error : adapter.normalizeError ? adapter.normalizeError(error, request, options) : this.normalizeError(error, request, ProviderErrorCategories.PROVIDER);
          if (!lastError.retryable || retry >= retryLimit || [ProviderErrorCategories.AUTHENTICATION, ProviderErrorCategories.PRIVACY_POLICY, ProviderErrorCategories.INVALID_REQUEST, ProviderErrorCategories.CONTEXT_LIMIT, ProviderErrorCategories.CANCELLATION].includes(lastError.category)) break;
        }
      }
      this.stats.fallbacks += 1;
    }
    const terminalState = lastError && lastError.category === ProviderErrorCategories.CANCELLATION ? ModelRequestStates.CANCELLED
      : lastError && lastError.category === ProviderErrorCategories.TIMEOUT ? ModelRequestStates.TIMED_OUT
        : ModelRequestStates.FAILED;
    return this.finishRequest(request, terminalState, null, lastError, startedAt);
  }

  safeStreamListener(listener, request) {
    const events = [];
    return (event) => {
      const normalized = normalizeStreamEvent(event, request, events.length + 1, this);
      events.push(normalized);
      if (events.length > this.bounds.maximumStreamEvents) events.shift();
      this.emitLifecycle(LIFECYCLE_EVENTS.STREAM_EVENT, normalized);
      try {
        if (typeof listener === "function") listener(clonePlainObject(normalized));
      } catch (_) {
        this.emitLifecycle(LIFECYCLE_EVENTS.STREAM_EVENT, { type: StreamEventTypes.WARNING, warning: "Stream listener failed.", requestId: request.id });
      }
    };
  }

  finishRequest(request, state, response, error, startedAt) {
    request.state = state;
    request.completedAt = this.now();
    request.error = error || null;
    this.requests.set(request.id, request);
    if (state === ModelRequestStates.SUCCEEDED) {
      this.stats.requestsSucceeded += 1;
      this.stats.lastSuccessfulResponse = response && response.id || null;
      this.emitLifecycle(LIFECYCLE_EVENTS.REQUEST_SUCCEEDED, { requestId: request.id, responseId: response && response.id });
    } else if (state === ModelRequestStates.PARTIALLY_SUCCEEDED) {
      this.stats.requestsPartiallySucceeded += 1;
      this.emitLifecycle(LIFECYCLE_EVENTS.REQUEST_PARTIALLY_SUCCEEDED, { requestId: request.id, responseId: response && response.id });
    } else if (state === ModelRequestStates.CANCELLED) {
      this.stats.requestsCancelled += 1;
      this.emitLifecycle(LIFECYCLE_EVENTS.REQUEST_CANCELLED, { requestId: request.id });
    } else if (state === ModelRequestStates.TIMED_OUT) {
      this.stats.requestsTimedOut += 1;
      this.emitLifecycle(LIFECYCLE_EVENTS.REQUEST_TIMED_OUT, { requestId: request.id, error });
    } else {
      this.stats.requestsFailed += 1;
      this.stats.lastFailure = error;
      this.emitLifecycle(LIFECYCLE_EVENTS.REQUEST_FAILED, { requestId: request.id, error });
    }
    this.stats.lastRequest = request.id;
    this.updateAverageLatency(Date.now() - startedAt);
    if (this.configuration.persistenceEnabled) {
      try { this.save(); } catch (_) { /* persistence health reports failures */ }
    }
    return response ? clonePlainObject(response) : { id: null, requestId: request.id, status: state, error: clonePlainObject(error), createdAt: request.createdAt, completedAt: request.completedAt };
  }

  cancelRequest(requestId, reason = "Cancelled by caller.") {
    const request = this.requireRequest(requestId);
    if ([ModelRequestStates.SUCCEEDED, ModelRequestStates.FAILED, ModelRequestStates.CANCELLED, ModelRequestStates.TIMED_OUT].includes(request.state)) return clonePlainObject(request);
    request.state = ModelRequestStates.CANCELLING;
    request.cancellation = { requested: true, reason, requestedAt: this.now() };
    const adapter = request.providerId && this.adapters.get(request.providerId);
    if (adapter && typeof adapter.cancel === "function") adapter.cancel(request.id, { reason });
    request.state = ModelRequestStates.CANCELLED;
    request.completedAt = this.now();
    this.stats.requestsCancelled += 1;
    this.emitLifecycle(LIFECYCLE_EVENTS.REQUEST_CANCELLED, { requestId, reason });
    return clonePlainObject(request);
  }

  retryRequest(requestId, options = {}) {
    const request = this.requireRequest(requestId);
    if (![ModelRequestStates.FAILED, ModelRequestStates.TIMED_OUT, ModelRequestStates.CANCELLED].includes(request.state)) throw this.error("Only incomplete terminal requests can be retried.", ProviderErrorCategories.INVALID_REQUEST, { requestId });
    return this.complete({ ...request, id: undefined, metadata: { ...request.metadata, retryOf: requestId } }, options);
  }

  getRequest(requestId) {
    const request = this.requests.get(requiredString(requestId, "Request id is required."));
    return request ? clonePlainObject(summarizeRequest(request)) : null;
  }

  listRequests(filter = {}) {
    return Array.from(this.requests.values()).filter((request) => matchesFilter(request, filter)).sort(compareCreated).map((request) => clonePlainObject(summarizeRequest(request)));
  }

  getResponse(responseId) {
    const response = this.responses.get(requiredString(responseId, "Response id is required."));
    return response ? clonePlainObject(response) : null;
  }

  getUsage(filter = {}) {
    return this.usage.filter((record) => matchesFilter(record, filter)).map(clonePlainObject);
  }

  estimateTokens(input, options = {}) {
    const adapter = options.modelId && this.models.has(options.modelId) ? this.adapters.get(this.models.get(options.modelId).providerId) : null;
    if (adapter && typeof adapter.estimateTokens === "function") return adapter.estimateTokens(input, options);
    const text = typeof input === "string" ? input : JSON.stringify(input || {});
    return { tokens: Math.ceil(text.length / 4) + estimateMessageOverhead(input), estimated: true, tokenizer: "levi-fallback-approximate" };
  }

  estimateCost(request, options = {}) {
    const normalized = normalizeModelRequest(request, this, { ...options, preserveId: true });
    const model = normalized.modelId && this.models.get(normalized.modelId) || null;
    const pricing = (model && model.pricing) || (normalized.providerId && this.providers.get(normalized.providerId) && this.providers.get(normalized.providerId).pricing) || null;
    const estimate = this.estimateTokens(normalized, { modelId: model && model.id });
    if (!pricing || pricing.monetaryCostUnknown) return { known: false, monetaryCostUnknown: true, estimatedTokens: estimate.tokens, currency: pricing && pricing.currency || null };
    const inputCost = (pricing.inputPerMillionTokens || 0) * estimate.tokens / 1000000;
    const outputCost = (pricing.outputPerMillionTokens || 0) * (normalized.maximumOutputTokens || 0) / 1000000;
    const flat = pricing.flatRequestPrice || 0;
    return { known: true, amount: Number((inputCost + outputCost + flat).toFixed(8)), currency: pricing.currency || "USD", estimatedTokens: estimate.tokens, pricing };
  }

  validateRequest(request, options = {}) {
    try {
      validateModelRequest(request, this, options);
      const routing = this.preflightPrivacy(request, options);
      if (!routing.allowed) throw this.error(routing.reason, ProviderErrorCategories.PRIVACY_POLICY, { requestId: request.id });
      const model = request.modelId && this.models.get(request.modelId);
      if (model) enforceContextWindow(request, model, this);
      return { valid: true };
    } catch (error) {
      const normalized = error.category ? error : this.normalizeError(error, request, error.category || ProviderErrorCategories.INVALID_REQUEST);
      if (normalized.category === ProviderErrorCategories.PRIVACY_POLICY) {
        this.stats.privacyBlocks += 1;
        this.emitLifecycle(LIFECYCLE_EVENTS.PRIVACY_BLOCKED, { requestId: request.id, error: normalized });
      }
      if (normalized.category === ProviderErrorCategories.CONTEXT_LIMIT) {
        this.stats.contextLimitBlocks += 1;
        this.emitLifecycle(LIFECYCLE_EVENTS.CONTEXT_LIMIT_BLOCKED, { requestId: request.id, error: normalized });
      }
      return { valid: false, error: normalized };
    }
  }

  validateResponse(response) {
    if (!response || typeof response !== "object") return { valid: false, error: this.error("Model response must be an object.", ProviderErrorCategories.INVALID_RESPONSE) };
    if (response.status === ModelRequestStates.SUCCEEDED && typeof response.content !== "string" && !response.structuredData && !response.toolCalls.length) return { valid: false, error: this.error("Model response has no content, structure, or tool calls.", ProviderErrorCategories.INVALID_RESPONSE) };
    return { valid: true };
  }

  preflightPrivacy(request) {
    const classification = request.privacyClassification;
    if (classification === PrivacyClassifications.SECRET) return { allowed: false, reason: "SECRET content cannot be sent to any provider." };
    if (!classification) return { allowed: false, reason: "Privacy classification is required before model dispatch." };
    return { allowed: true };
  }

  candidateModels(request, requiredCapabilities) {
    const models = this.getAvailableModels();
    const explicit = request.modelId ? models.filter((model) => model.id === request.modelId || model.name === request.modelId) : models;
    const byProvider = request.providerId ? explicit.filter((model) => model.providerId === request.providerId) : explicit;
    return byProvider.map((model) => {
      const provider = this.providers.get(model.providerId);
      const reasons = [];
      if (!provider || !provider.enabled) reasons.push("Provider is disabled.");
      for (const capability of requiredCapabilities) if (!model.capabilities.includes(capability)) reasons.push(`Missing capability ${capability}.`);
      const privacy = privacyAllowedForProvider(request.privacyClassification, provider, this.configuration);
      if (!privacy.allowed) reasons.push(privacy.reason);
      try { enforceContextWindow(request, model, this); } catch (error) { reasons.push(error.message); }
      return { model, provider, rejected: reasons.length > 0, reasons };
    });
  }

  recordUsage(request, response, latencyMs) {
    const reported = response.usage || {};
    const estimate = this.estimateTokens(request, { modelId: request.modelId });
    const inputTokens = numberOrFallback(reported.inputTokens, estimate.tokens);
    const outputTokens = numberOrFallback(reported.outputTokens, Math.ceil(String(response.content || "").length / 4));
    const cost = this.estimateCost(request);
    const record = normalizeUsageRecord({
      requestId: request.id,
      providerId: request.providerId,
      modelId: request.modelId,
      inputTokens,
      outputTokens,
      totalTokens: numberOrFallback(reported.totalTokens, inputTokens + outputTokens),
      cachedInputTokens: reported.cachedInputTokens || 0,
      reasoningTokens: reported.reasoningTokens || 0,
      estimated: reported.estimated !== false,
      tokenizer: reported.tokenizer || estimate.tokenizer,
      cost,
      latencyMs,
      metadata: {},
    }, this);
    this.usage.push(record);
    trimArray(this.usage, this.bounds.maximumUsageHistory);
    this.stats.totalInputTokens += inputTokens;
    this.stats.totalOutputTokens += outputTokens;
    this.stats[record.estimated ? "estimatedTokens" : "reportedTokens"] += record.totalTokens;
    if (cost.known) this.stats.knownMonetaryCost += cost.amount;
    else this.stats.unknownCostRequests += 1;
    this.stats.lastSuccessfulResponse = response.id;
    this.emitLifecycle(LIFECYCLE_EVENTS.USAGE_RECORDED, { requestId: request.id, usageId: record.id });
    return record;
  }

  getGatewayHealth() {
    const providers = this.listProviders();
    const models = this.listModels();
    const warnings = [];
    const blockers = [];
    if (!providers.length) warnings.push("No model providers are configured; Levi remains deterministic offline.");
    const privacyOk = true;
    const scores = gatewayHealthScores(this, providers, models, warnings, blockers);
    return {
      gatewayState: this.state,
      configuredProviders: providers.length,
      availableProviders: providers.filter((provider) => provider.state === ProviderStates.AVAILABLE || provider.state === ProviderStates.CONFIGURED).length,
      degradedProviders: providers.filter((provider) => provider.state === ProviderStates.DEGRADED).length,
      unavailableProviders: providers.filter((provider) => [ProviderStates.UNAVAILABLE, ProviderStates.FAILED, ProviderStates.AUTHENTICATION_FAILED].includes(provider.state)).length,
      availableModels: this.getAvailableModels().length,
      requiredCapabilityCoverage: coverageFor(models),
      localModelAvailability: models.some((model) => model.local),
      remoteModelAvailability: models.some((model) => model.remote),
      privacyPolicyStatus: privacyOk ? "ENFORCED" : "FAILED",
      credentialResolutionStatus: "REFERENCE_ONLY",
      queueStatus: { queued: this.queue.length, running: this.running.size },
      requestReliability: reliability(this.stats),
      streamingReliability: this.stats.streamedResponses ? reliability(this.stats) : "UNVERIFIED",
      usageAccountingStatus: "AVAILABLE",
      persistenceStatus: this.configuration.persistenceEnabled ? "AVAILABLE" : "DISABLED",
      warnings,
      blockers,
      confidence: scores.overallGatewayHealth.value / 100,
      completeness: providers.length ? 0.9 : 0.7,
      scores,
      overallGatewayHealth: scores.overallGatewayHealth.value,
      createdAt: this.now(),
    };
  }

  getStats() {
    return clonePlainObject(this.stats);
  }

  snapshot() {
    return sanitizeForPersistence({
      schemaVersion: MODEL_PROVIDER_GATEWAY_SCHEMA_VERSION,
      configuration: this.configuration,
      providers: Array.from(this.providers.values()).map(redactProvider),
      models: Array.from(this.models.values()),
      capabilityObservations: [],
      healthSummaries: Array.from(this.providers.values()).map((provider) => ({ providerId: provider.id, health: provider.health || null })),
      routingPreferences: { defaultRoutingStrategy: this.configuration.defaultRoutingStrategy },
      usageSummaries: this.usage.slice(-this.bounds.maximumUsageHistory),
      requestSummaries: Array.from(this.requests.values()).slice(-this.bounds.maximumRequestHistory).map(summarizeRequest),
      pricingReferences: Array.from(this.providers.values()).map((provider) => ({ providerId: provider.id, pricing: provider.pricing })),
      statistics: this.stats,
      savedAt: this.now(),
      metadata: {},
    });
  }

  restore(snapshot) {
    if (!snapshot || Number(snapshot.schemaVersion) !== MODEL_PROVIDER_GATEWAY_SCHEMA_VERSION) throw new Error("Unsupported model provider gateway snapshot.");
    this.configuration = { ...DEFAULT_CONFIGURATION, ...(snapshot.configuration || {}) };
    this.providers = new Map(safeArray(snapshot.providers).map((provider) => [provider.id, normalizeProviderConfiguration(provider, this)]));
    this.models = new Map(safeArray(snapshot.models).map((model) => [model.id, normalizeModelDescriptor(model, this)]));
    this.usage = safeArray(snapshot.usageSummaries).map((record) => normalizeUsageRecord(record, this));
    this.requests = new Map(safeArray(snapshot.requestSummaries).map((request) => [request.id, normalizeModelRequest(request, this, { preserveId: true })]));
    this.stats = { ...emptyStats(), ...(snapshot.statistics || {}) };
    for (const provider of this.providers.values()) provider.state = provider.enabled ? ProviderStates.CONFIGURED : ProviderStates.DISABLED;
    this.emitLifecycle(LIFECYCLE_EVENTS.RESTORED, { providerCount: this.providers.size, modelCount: this.models.size });
    return { status: "RESTORED", providerCount: this.providers.size, modelCount: this.models.size };
  }

  save(filePath = this.configuration.storagePath) {
    if (!this.configuration.persistenceEnabled) return { status: "DISABLED" };
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(this.snapshot(), null, 2)}\n`, "utf8");
    this.stats.lastPersistence = this.now();
    this.emitLifecycle(LIFECYCLE_EVENTS.PERSISTED, { path: filePath });
    return { status: "PERSISTED", path: filePath };
  }

  load(filePath = this.configuration.storagePath, options = {}) {
    if (!fs.existsSync(filePath)) return { status: "EMPTY", path: filePath };
    try {
      const snapshot = migrateSnapshot(JSON.parse(fs.readFileSync(filePath, "utf8")), this.migrations);
      const result = this.restore(snapshot);
      return { status: "LOADED", path: filePath, result };
    } catch (error) {
      this.stats.corruptedLoads += 1;
      this.emitLifecycle(LIFECYCLE_EVENTS.CORRUPTION_DETECTED, { path: filePath, error: error.message });
      if (options.emptyOnCorruption !== false) return { status: "EMPTY", path: filePath, corrupted: true };
      throw error;
    }
  }

  requireProvider(providerId) {
    const provider = this.providers.get(requiredString(providerId, "Provider id is required."));
    if (!provider) throw this.error(`Unknown provider ${providerId}.`, ProviderErrorCategories.CONFIGURATION, { providerId });
    return provider;
  }

  requireAdapter(providerId) {
    const adapter = this.adapters.get(requiredString(providerId, "Provider id is required."));
    if (!adapter) throw this.error(`Provider adapter missing for ${providerId}.`, ProviderErrorCategories.CONFIGURATION, { providerId });
    return adapter;
  }

  requireModel(modelId) {
    const model = this.models.get(requiredString(modelId, "Model id is required."));
    if (!model) throw this.error(`Unknown model ${modelId}.`, ProviderErrorCategories.MODEL_NOT_FOUND, { modelId });
    return model;
  }

  requireRequest(requestId) {
    const request = this.requests.get(requiredString(requestId, "Request id is required."));
    if (!request) throw this.error(`Unknown model request ${requestId}.`, ProviderErrorCategories.INVALID_REQUEST, { requestId });
    return request;
  }

  normalizeError(error, request = null, category = ProviderErrorCategories.UNKNOWN, input = {}) {
    return normalizeProviderError(error, this, request, category, input);
  }

  error(message, category, input = {}) {
    return this.normalizeError(new Error(message), null, category, input);
  }

  emitLifecycle(type, payload) {
    const event = { id: this.nextId("event", { type, count: this.eventLog.length + 1 }), type, payload: sanitizeForFrontend(payload || {}), timestamp: this.now() };
    this.eventLog.push(event);
    trimArray(this.eventLog, 1000);
    this.emit("lifecycle", clonePlainObject(event));
    return event;
  }

  nextId(prefix, input = {}) {
    return this.idAdapter.next(prefix, input);
  }

  now() {
    const value = this.clock.now();
    return typeof value === "string" ? new Date(value).toISOString() : new Date(value).toISOString();
  }

  updateAverageLatency(latencyMs) {
    const count = Math.max(1, this.stats.requestsSucceeded + this.stats.requestsFailed + this.stats.requestsTimedOut);
    this.stats.averageLatency = Number((((this.stats.averageLatency || 0) * (count - 1) + latencyMs) / count).toFixed(3));
  }
}

function normalizeProviderConfiguration(input = {}, gateway) {
  const id = requiredString(input.id || input.name, "Provider id is required.");
  const type = normalizeEnum(input.type || ProviderTypes.UNKNOWN, ProviderTypes, "provider type");
  const headers = sanitizeHeaders(input.headers || {});
  if (Object.keys(headers).length > gateway.bounds.maximumProviderHeaders) throw new Error("Maximum provider headers exceeded.");
  return {
    id,
    name: input.name || id,
    type,
    state: normalizeEnum(input.state || (input.enabled === false ? ProviderStates.DISABLED : ProviderStates.CONFIGURED), ProviderStates, "provider state"),
    enabled: input.enabled !== false,
    baseUrl: input.baseUrl || null,
    transportId: input.transportId || null,
    authenticationType: input.authenticationType || "NONE",
    credentialReference: input.credentialReference || null,
    defaultModel: input.defaultModel || null,
    models: safeArray(input.models),
    requestTimeoutMs: positiveInteger(input.requestTimeoutMs, 30000),
    connectTimeoutMs: positiveInteger(input.connectTimeoutMs, 5000),
    maximumRetries: positiveInteger(input.maximumRetries, 0),
    retryBackoffMs: positiveInteger(input.retryBackoffMs, 100),
    maximumConcurrentRequests: positiveInteger(input.maximumConcurrentRequests, gateway.bounds.maximumConcurrentRequestsPerProvider),
    maximumQueuedRequests: positiveInteger(input.maximumQueuedRequests, gateway.bounds.maximumQueuedRequests),
    supportsDiscovery: input.supportsDiscovery !== false,
    allowRemoteContent: input.allowRemoteContent === true,
    allowedPrivacyClassifications: safeArray(input.allowedPrivacyClassifications || defaultAllowedPrivacy(type)),
    blockedPrivacyClassifications: safeArray(input.blockedPrivacyClassifications || [PrivacyClassifications.SECRET]),
    headers,
    pricing: input.pricing || null,
    health: input.health || null,
    metadata: clonePlainObject(input.metadata || {}),
  };
}

function normalizeModelDescriptor(input = {}, gateway) {
  const providerId = requiredString(input.providerId, "Model providerId is required.");
  const name = requiredString(input.name || input.id, "Model name is required.");
  const id = input.id || `${providerId}:${name}`;
  return {
    id,
    providerId,
    name,
    displayName: input.displayName || name,
    family: input.family || "unknown",
    version: input.version || null,
    capabilities: uniqueSorted(safeArray(input.capabilities || [ModelCapabilityTypes.CHAT])),
    contextWindow: positiveInteger(input.contextWindow, 4096),
    maximumOutputTokens: positiveInteger(input.maximumOutputTokens, 1024),
    tokenizer: input.tokenizer || "approximate",
    local: input.local === true,
    remote: input.remote === true,
    enabled: input.enabled !== false,
    status: input.status || "AVAILABLE",
    latencyClass: input.latencyClass || "UNKNOWN",
    qualityClass: input.qualityClass || "UNKNOWN",
    costClass: input.costClass || "UNKNOWN",
    pricing: input.pricing || null,
    limitations: safeArray(input.limitations),
    metadata: clonePlainObject(input.metadata || {}),
  };
}

function normalizeModelRequest(input = {}, gateway, options = {}) {
  const id = options.preserveId && input.id ? input.id : input.id || gateway.nextId("model-request", { type: input.type, createdAt: gateway.now() });
  const messages = normalizeMessages(input.messages || [], gateway);
  const prompt = input.prompt || (messages.length ? null : "");
  return {
    id,
    type: normalizeEnum(input.type || ModelRequestTypes.CHAT, ModelRequestTypes, "model request type"),
    state: normalizeEnum(input.state || ModelRequestStates.CREATED, ModelRequestStates, "model request state"),
    providerId: input.providerId || null,
    modelId: input.modelId || null,
    routingStrategy: normalizeEnum(input.routingStrategy || gateway.configuration.defaultRoutingStrategy || RoutingStrategies.PRIVACY_FIRST, RoutingStrategies, "routing strategy"),
    priority: normalizeEnum(input.priority || RequestPriorities.NORMAL, RequestPriorities, "request priority"),
    messages,
    prompt,
    systemInstruction: input.systemInstruction || null,
    tools: safeArray(input.tools),
    responseSchema: input.responseSchema || null,
    temperature: input.temperature,
    topP: input.topP,
    maximumOutputTokens: positiveInteger(input.maximumOutputTokens, 512),
    stop: input.stop || null,
    seed: input.seed,
    stream: input.stream === true,
    privacyClassification: normalizeEnum(input.privacyClassification || PrivacyClassifications.INTERNAL, PrivacyClassifications, "privacy classification"),
    projectId: input.projectId || null,
    workspaceId: input.workspaceId || null,
    sessionId: input.sessionId || null,
    operationId: input.operationId || null,
    contextReferences: safeArray(input.contextReferences),
    metadata: clonePlainObject(input.metadata || {}),
    createdAt: input.createdAt || gateway.now(),
    completedAt: input.completedAt || null,
    cancellation: input.cancellation || { requested: false },
  };
}

function normalizeMessages(messages, gateway) {
  if (!Array.isArray(messages)) throw new Error("Model request messages must be an array.");
  if (messages.length > gateway.bounds.maximumMessages) throw new Error("Maximum model messages exceeded.");
  return messages.map((message, index) => {
    const content = message.content === undefined || message.content === null ? "" : String(message.content);
    if (content.length > gateway.bounds.maximumMessageCharacters) throw new Error("Maximum model message characters exceeded.");
    return {
      id: message.id || gateway.nextId("message", { index, contentHash: stableHash(content) }),
      role: normalizeRole(message.role || "USER"),
      content,
      name: message.name || null,
      toolCallId: message.toolCallId || null,
      toolCalls: safeArray(message.toolCalls),
      attachments: safeArray(message.attachments),
      privacyClassification: normalizeEnum(message.privacyClassification || PrivacyClassifications.INTERNAL, PrivacyClassifications, "message privacy classification"),
      metadata: clonePlainObject(message.metadata || {}),
    };
  });
}

function normalizeModelResponse(input = {}, request, gateway, context = {}) {
  const createdAt = gateway.now();
  return {
    id: input.id || gateway.nextId("model-response", { requestId: request.id, createdAt }),
    requestId: request.id,
    providerId: input.providerId || request.providerId,
    modelId: input.modelId || request.modelId,
    status: input.status || ModelRequestStates.SUCCEEDED,
    content: input.content || "",
    messages: safeArray(input.messages),
    toolCalls: safeArray(input.toolCalls).map((call, index) => normalizeToolCall(call, gateway, index)),
    structuredData: input.structuredData || null,
    finishReason: input.finishReason || "unknown",
    usage: input.usage || null,
    cost: input.cost || null,
    latency: input.latency || { latencyMs: context.completedAt && context.startedAt ? context.completedAt - context.startedAt : null },
    attempts: context.attempts || input.attempts || 1,
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    evidence: safeArray(input.evidence),
    confidence: normalizeUnit(input.confidence, 0.8),
    completeness: normalizeUnit(input.completeness, 1),
    error: input.error || null,
    metadata: sanitizeForFrontend(input.metadata || {}),
    createdAt,
    completedAt: gateway.now(),
  };
}

function normalizeToolCall(input = {}, gateway, index = 0) {
  return {
    id: input.id || gateway.nextId("tool-call", { index, name: input.name }),
    name: input.name || "unknown",
    arguments: input.arguments || {},
    index: input.index === undefined ? index : input.index,
    status: input.status || "CREATED",
    providerPayloadReference: input.providerPayloadReference || null,
    metadata: sanitizeForFrontend(input.metadata || {}),
  };
}

function normalizeUsageRecord(input = {}, gateway) {
  const timestamp = input.timestamp || gateway.now();
  return {
    id: input.id || gateway.nextId("usage", { requestId: input.requestId, timestamp }),
    requestId: input.requestId,
    providerId: input.providerId,
    modelId: input.modelId,
    inputTokens: Number(input.inputTokens || 0),
    outputTokens: Number(input.outputTokens || 0),
    totalTokens: Number(input.totalTokens || (Number(input.inputTokens || 0) + Number(input.outputTokens || 0))),
    cachedInputTokens: Number(input.cachedInputTokens || 0),
    reasoningTokens: Number(input.reasoningTokens || 0),
    estimated: input.estimated !== false,
    tokenizer: input.tokenizer || "unknown",
    cost: input.cost || { known: false, monetaryCostUnknown: true },
    currency: input.currency || input.cost && input.cost.currency || null,
    latencyMs: Number(input.latencyMs || 0),
    timestamp,
    metadata: sanitizeForFrontend(input.metadata || {}),
  };
}

function normalizeProviderError(error, gateway, request, category, input = {}) {
  const source = error && error.category ? error : {};
  const message = error && error.message || source.message || "Provider error.";
  const createdAt = gateway.now();
  return {
    id: source.id || gateway.nextId("provider-error", { message, createdAt }),
    code: source.code || input.code || normalizeToken(message),
    category: normalizeEnum(source.category || input.category || category || ProviderErrorCategories.UNKNOWN, ProviderErrorCategories, "provider error category"),
    providerId: source.providerId || input.providerId || request && request.providerId || null,
    modelId: source.modelId || input.modelId || request && request.modelId || null,
    requestId: source.requestId || input.requestId || request && request.id || null,
    message,
    userMessage: source.userMessage || input.userMessage || message,
    retryable: source.retryable === true || input.retryable === true,
    retryAfterMs: source.retryAfterMs || input.retryAfterMs || null,
    recoverable: source.recoverable === true || input.recoverable === true,
    severity: source.severity || input.severity || "ERROR",
    statusCode: source.statusCode || input.statusCode || null,
    providerCode: source.providerCode || input.providerCode || null,
    details: sanitizeForFrontend(source.details || input.details || {}),
    suggestedActions: safeArray(source.suggestedActions || input.suggestedActions),
    metadata: sanitizeForFrontend(source.metadata || input.metadata || {}),
    createdAt,
  };
}

function validateProviderAdapter(adapter) {
  const required = ["initialize", "shutdown", "healthCheck", "discoverModels", "getCapabilities", "complete", "stream", "cancel", "normalizeRequest", "normalizeResponse", "normalizeError"];
  const missing = required.filter((method) => !adapter || typeof adapter[method] !== "function");
  if (missing.length) throw new Error(`Provider adapter missing methods: ${missing.join(", ")}.`);
}

function validateModelRequest(request, gateway, options = {}) {
  if (!request.prompt && request.messages.length === 0) throw new Error("Model request requires prompt or messages.");
  if (request.tools.length > gateway.bounds.maximumToolDefinitions) throw new Error("Maximum tool definitions exceeded.");
  if (JSON.stringify(request.tools).length > gateway.bounds.maximumToolSchemaSize) throw new Error("Maximum tool schema size exceeded.");
  if (request.responseSchema && JSON.stringify(request.responseSchema).length > gateway.bounds.maximumResponseSchemaSize) throw new Error("Maximum response schema size exceeded.");
  if (request.privacyClassification === PrivacyClassifications.SECRET) throw gateway.error("SECRET content cannot be sent to a model provider.", ProviderErrorCategories.PRIVACY_POLICY, { requestId: request.id });
  if (containsSecretLikeContent(request)) throw gateway.error("Secret-like content was detected in model request.", ProviderErrorCategories.PRIVACY_POLICY, { requestId: request.id });
  if (request.modelId && !gateway.models.has(request.modelId) && !Array.from(gateway.models.values()).some((model) => model.name === request.modelId)) throw gateway.error("Requested model is not registered.", ProviderErrorCategories.MODEL_NOT_FOUND, { requestId: request.id, modelId: request.modelId });
}

function requiredCapabilitiesFor(request, options = {}) {
  const caps = [];
  if (request.type === ModelRequestTypes.CHAT) caps.push(ModelCapabilityTypes.CHAT);
  if (request.type === ModelRequestTypes.TEXT_COMPLETION) caps.push(ModelCapabilityTypes.TEXT_COMPLETION);
  if (request.type === ModelRequestTypes.STRUCTURED_GENERATION || request.responseSchema) caps.push(ModelCapabilityTypes.STRUCTURED_OUTPUT);
  if (request.type === ModelRequestTypes.EMBEDDING) caps.push(ModelCapabilityTypes.EMBEDDINGS);
  if (request.stream) caps.push(ModelCapabilityTypes.STREAMING);
  if (request.tools.length) caps.push(ModelCapabilityTypes.TOOL_CALLING);
  return uniqueSorted(caps.concat(safeArray(options.requiredCapabilities)));
}

function privacyAllowedForProvider(classification, provider, config) {
  if (!provider) return { allowed: false, reason: "Provider is unavailable." };
  if (classification === PrivacyClassifications.SECRET) return { allowed: false, reason: "SECRET content cannot be dispatched." };
  if (provider.blockedPrivacyClassifications.includes(classification)) return { allowed: false, reason: `${classification} is blocked for provider ${provider.id}.` };
  const remote = [ProviderTypes.OPENAI_COMPATIBLE, ProviderTypes.REMOTE_CUSTOM].includes(provider.type);
  if (classification === PrivacyClassifications.PROHIBITED_REMOTE && remote) return { allowed: false, reason: "PROHIBITED_REMOTE content requires a local provider." };
  if (classification === PrivacyClassifications.SOURCE_CODE && remote && !config.allowRemoteSourceCode && !provider.allowRemoteContent) return { allowed: false, reason: "Remote source-code routing is disabled." };
  if (classification === PrivacyClassifications.SENSITIVE && remote && !config.allowRemoteSensitiveContent) return { allowed: false, reason: "Remote sensitive-content routing is disabled." };
  if (remote && !provider.allowedPrivacyClassifications.includes(classification)) return { allowed: false, reason: `${classification} is not allowed for remote provider ${provider.id}.` };
  return { allowed: true };
}

function enforceContextWindow(request, model, gateway) {
  const estimate = gateway.estimateTokens(request, { modelId: model.id });
  const reserved = request.maximumOutputTokens || 0;
  const total = estimate.tokens + reserved + gateway.bounds.contextSafetyMarginTokens;
  if (total > model.contextWindow) {
    throw gateway.error(`Context window exceeded: estimated ${total} token(s) for ${model.contextWindow} window.`, ProviderErrorCategories.CONTEXT_LIMIT, {
      requestId: request.id,
      modelId: model.id,
      details: { estimatedInputTokens: estimate.tokens, reservedOutputTokens: reserved, safetyMargin: gateway.bounds.contextSafetyMarginTokens, contextWindow: model.contextWindow, suggestedReduction: total - model.contextWindow },
    });
  }
}

function selectModel(candidates, strategy) {
  const eligible = candidates.filter((entry) => !entry.rejected);
  if (!eligible.length) return null;
  const sorted = eligible.slice();
  if (strategy === RoutingStrategies.REMOTE_FIRST) sorted.sort((a, b) => Number(a.model.local) - Number(b.model.local));
  else if ([RoutingStrategies.LOCAL_FIRST, RoutingStrategies.PRIVACY_FIRST].includes(strategy)) sorted.sort((a, b) => Number(b.model.local) - Number(a.model.local));
  else if (strategy === RoutingStrategies.LOWEST_COST) sorted.sort((a, b) => costRank(a.model) - costRank(b.model));
  else if (strategy === RoutingStrategies.HIGHEST_CAPABILITY) sorted.sort((a, b) => b.model.capabilities.length - a.model.capabilities.length);
  return sorted[0];
}

function parseStructuredData(content, schema, gateway) {
  try {
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    if (schema && schema.required) {
      for (const field of schema.required) if (parsed[field] === undefined) throw new Error(`Missing required structured field ${field}.`);
    }
    return parsed;
  } catch (error) {
    gateway.stats.structuredOutputFailures += 1;
    throw gateway.error(`Malformed structured output: ${error.message}`, ProviderErrorCategories.STRUCTURED_OUTPUT);
  }
}

function normalizeStreamEvent(event, request, sequence, gateway) {
  const type = normalizeEnum(event.type || StreamEventTypes.CONTENT_DELTA, StreamEventTypes, "stream event type");
  return {
    id: gateway.nextId("stream-event", { requestId: request.id, sequence }),
    sequence,
    type,
    requestId: request.id,
    providerId: event.providerId || request.providerId || null,
    modelId: event.modelId || request.modelId || null,
    content: event.content || null,
    toolCalls: safeArray(event.toolCalls),
    usage: event.usage || null,
    warning: event.warning || null,
    timestamp: gateway.now(),
    metadata: sanitizeForFrontend(event.metadata || {}),
  };
}

function gatewayHealthScores(gateway, providers, models, warnings, blockers) {
  const scores = {
    configuration: score("configuration", 100 - (providers.filter((provider) => provider.state === ProviderStates.MISCONFIGURED).length * 25)),
    providerAvailability: score("providerAvailability", providers.length ? providers.filter((provider) => provider.enabled).length / providers.length * 100 : 70),
    modelAvailability: score("modelAvailability", models.length ? gateway.getAvailableModels().length / models.length * 100 : 70),
    capabilityCoverage: score("capabilityCoverage", coverageFor(models).length ? 90 : 70),
    privacyIntegrity: score("privacyIntegrity", 100),
    credentialReadiness: score("credentialReadiness", providers.some((provider) => provider.credentialReference) ? 85 : 100),
    requestReliability: score("requestReliability", reliabilityScore(gateway.stats)),
    streamingReliability: score("streamingReliability", gateway.stats.streamedResponses ? reliabilityScore(gateway.stats) : 75),
    contextManagement: score("contextManagement", gateway.stats.contextLimitBlocks ? 85 : 100),
    structuredOutputReliability: score("structuredOutputReliability", gateway.stats.structuredOutputFailures ? 70 : 100),
    usageAccounting: score("usageAccounting", 100),
    persistenceReliability: score("persistenceReliability", gateway.stats.corruptedLoads ? 70 : 100),
  };
  const overall = average(Object.values(scores).map((entry) => entry.value));
  scores.overallGatewayHealth = score("overallGatewayHealth", blockers.length ? Math.min(50, overall) : warnings.length ? Math.min(90, overall) : overall);
  return scores;
}

function coverageFor(models) {
  return uniqueSorted(models.flatMap((model) => model.capabilities));
}

function reliability(stats) {
  return `${Math.round(reliabilityScore(stats))}%`;
}

function reliabilityScore(stats) {
  const total = stats.requestsSucceeded + stats.requestsFailed + stats.requestsTimedOut + stats.requestsCancelled;
  if (!total) return 100;
  return (stats.requestsSucceeded / total) * 100;
}

function score(label, value) {
  const bounded = Math.max(0, Math.min(100, Math.round(value)));
  return { value: bounded, deductions: bounded < 100 ? [{ reason: label, value: 100 - bounded }] : [], evidence: [{ source: "ModelProviderGateway", signal: label }] };
}

function emptyStats() {
  return {
    providersRegistered: 0,
    providersAvailable: 0,
    providersDegraded: 0,
    providersUnavailable: 0,
    modelsDiscovered: 0,
    modelsAvailable: 0,
    requestsCreated: 0,
    requestsSucceeded: 0,
    requestsPartiallySucceeded: 0,
    requestsFailed: 0,
    requestsCancelled: 0,
    requestsTimedOut: 0,
    retries: 0,
    fallbacks: 0,
    privacyBlocks: 0,
    contextLimitBlocks: 0,
    structuredOutputFailures: 0,
    toolCallResponses: 0,
    streamedResponses: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    estimatedTokens: 0,
    reportedTokens: 0,
    knownMonetaryCost: 0,
    unknownCostRequests: 0,
    averageLatency: 0,
    averageRetries: 0,
    queueOverflows: 0,
    corruptedLoads: 0,
    lastProviderHealthCheck: null,
    lastRequest: null,
    lastSuccessfulResponse: null,
    lastFailure: null,
    lastPersistence: null,
  };
}

function sanitizeProviderPatch(patch = {}) {
  const clone = clonePlainObject(patch);
  delete clone.credential;
  delete clone.apiKey;
  delete clone.token;
  return clone;
}

function redactProvider(provider) {
  const clone = clonePlainObject(provider);
  delete clone.credential;
  if (clone.headers) clone.headers = sanitizeHeaders(clone.headers);
  return clone;
}

function sanitizeHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    result[key] = /authorization|api[-_]?key|token|credential/i.test(key) ? "[REDACTED]" : value;
  }
  return result;
}

function sanitizeForPersistence(value) {
  const sanitized = sanitizeForFrontend(value);
  if (sanitized && sanitized.configuration) delete sanitized.configuration.credential;
  return sanitized;
}

function sanitizeForFrontend(value, seen = new WeakSet()) {
  if (value === undefined || typeof value === "function") return undefined;
  if (value === null || typeof value !== "object") return typeof value === "string" && /secret|token|password|credential|authorization/i.test(value) ? "[REDACTED]" : value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeForFrontend(entry, seen)).filter((entry) => entry !== undefined);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (/secret|token|password|credential|authorization/i.test(key) || ["adapter", "transport", "instance", "handler", "stack"].includes(key)) {
      result[key] = "[REDACTED]";
      continue;
    }
    const sanitized = sanitizeForFrontend(value[key], seen);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  return result;
}

function summarizeRequest(request) {
  return {
    ...clonePlainObject(request),
    messages: request.messages.map((message) => ({ ...message, content: `[${String(message.content || "").length} chars]` })),
    prompt: request.prompt ? `[${String(request.prompt).length} chars]` : request.prompt,
  };
}

function containsSecretLikeContent(request) {
  const text = [request.prompt, request.systemInstruction, ...request.messages.map((message) => message.content)].filter(Boolean).join("\n");
  return /(api[_-]?key|authorization:\s*bearer|password\s*=|secret\s*=)/i.test(text);
}

function estimateMessageOverhead(input) {
  return input && Array.isArray(input.messages) ? input.messages.length * 4 : 0;
}

function defaultAllowedPrivacy(type) {
  if ([ProviderTypes.OLLAMA, ProviderTypes.LOCAL_CUSTOM, ProviderTypes.MOCK].includes(type)) return Object.values(PrivacyClassifications).filter((value) => value !== PrivacyClassifications.SECRET);
  return [PrivacyClassifications.PUBLIC, PrivacyClassifications.INTERNAL, PrivacyClassifications.REPOSITORY_METADATA, PrivacyClassifications.USER_CONTENT];
}

function normalizeRole(role) {
  const normalized = String(role || "").toUpperCase();
  if (!["SYSTEM", "DEVELOPER", "USER", "ASSISTANT", "TOOL"].includes(normalized)) throw new Error(`Invalid model message role: ${role}.`);
  return normalized;
}

function costRank(model) {
  if (!model.pricing || model.pricing.monetaryCostUnknown) return 1000;
  return Number(model.pricing.flatRequestPrice || 0) + Number(model.pricing.inputPerMillionTokens || 0) + Number(model.pricing.outputPerMillionTokens || 0);
}

function numberOrFallback(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : Number(fallback || 0);
}

function normalizeBounds(input) {
  const result = { ...DEFAULT_BOUNDS };
  for (const [key, value] of Object.entries(input || {})) result[key] = positiveInteger(value, result[key] || 1);
  return Object.freeze(result);
}

function migrateSnapshot(snapshot, migrations) {
  let current = snapshot;
  for (const migration of safeArray(migrations)) current = migration(current);
  return current;
}

function normalizeClock(clock) {
  if (clock && typeof clock.now === "function") return clock;
  if (typeof clock === "function") return { now: clock };
  return { now: () => new Date().toISOString() };
}

function normalizeIdAdapter(adapter) {
  if (adapter && typeof adapter.next === "function") return adapter;
  let sequence = 0;
  return { next(prefix, input = {}) { sequence += 1; return `${prefix}-${String(sequence).padStart(6, "0")}-${stableHash(input).slice(0, 8)}`; } };
}

function normalizeEnum(value, constants, label) {
  const normalized = String(value || "").toUpperCase();
  if (!Object.values(constants).includes(normalized)) throw new Error(`Invalid ${label}: ${value}.`);
  return normalized;
}

function normalizeUnit(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function requiredString(value, message) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(message);
  return value.trim();
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function safeArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value === undefined ? null : value));
}

function stableHash(value) {
  return crypto.createHash("sha256").update(stableSerialize(value)).digest("hex").slice(0, 16);
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function matchesFilter(record, filter = {}) {
  return Object.entries(filter).every(([key, value]) => value === undefined || record[key] === value);
}

function compareById(left, right) { return left.id.localeCompare(right.id); }
function compareCreated(left, right) { return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id); }
function trimArray(values, max) { if (values.length > max) values.splice(0, values.length - max); }
function average(values) { return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0; }
function normalizeToken(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown"; }

module.exports = {
  DEFAULT_BOUNDS,
  DEFAULT_CONFIGURATION,
  LIFECYCLE_EVENTS,
  MODEL_PROVIDER_GATEWAY_SCHEMA_VERSION,
  ModelProviderGateway,
  ModelCapabilityTypes,
  ModelRequestStates,
  ModelRequestTypes,
  PrivacyClassifications,
  ProviderErrorCategories,
  ProviderStates,
  ProviderTypes,
  RequestPriorities,
  RoutingStrategies,
  StreamEventTypes,
};
