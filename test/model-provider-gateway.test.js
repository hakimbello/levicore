const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { LeviApplicationRuntime, OperationTypes } = require("../src/levi-application-runtime");
const { InMemoryCredentialResolver } = require("../src/credential-resolver");
const {
  ModelCapabilityTypes,
  ModelProviderGateway,
  ModelRequestStates,
  ModelRequestTypes,
  PrivacyClassifications,
  ProviderErrorCategories,
  ProviderStates,
  ProviderTypes,
  RoutingStrategies,
  StreamEventTypes,
} = require("../src/model-provider-gateway");
const { OllamaProviderAdapter } = require("../src/providers/ollama-provider-adapter");
const { OpenAICompatibleProviderAdapter } = require("../src/providers/openai-compatible-provider-adapter");
const { FakeHttpTransport } = require("../src/transports/http-transport");

test("initializes offline with explicit health, constants, and empty provider state", () => {
  const gateway = new ModelProviderGateway({ configuration: { persistenceEnabled: false } });

  const init = gateway.initialize();
  const health = gateway.getGatewayHealth();

  assert.equal(init.status, ProviderStates.UNCONFIGURED);
  assert.equal(health.configuredProviders, 0);
  assert.equal(health.privacyPolicyStatus, "ENFORCED");
  assert.ok(health.warnings.some((warning) => warning.includes("No model providers")));
  assert.equal(ProviderTypes.OLLAMA, "OLLAMA");
  assert.equal(ModelRequestTypes.CHAT, "CHAT");
  assert.equal(OperationTypes.MODEL_PROVIDER, "MODEL_PROVIDER");
});

test("validates provider adapters, normalizes provider/model descriptors, and redacts persistence", () => {
  const gateway = new ModelProviderGateway({ configuration: { persistenceEnabled: false } });
  assert.throws(() => gateway.registerProvider({ id: "bad", type: ProviderTypes.MOCK }, {}), /missing methods/);

  const provider = gateway.registerProvider(localProvider("local", { models: [model("local", "tiny")] }), mockAdapter({ content: "ok" }));
  const snapshot = gateway.snapshot();

  assert.equal(provider.id, "local");
  assert.equal(provider.state, ProviderStates.CONFIGURED);
  assert.equal(gateway.listModels()[0].id, "local:tiny");
  assert.equal(JSON.stringify(snapshot).includes("api-key-secret"), false);
});

test("discovers and completes through Ollama with local-only privacy", async () => {
  const transport = new FakeHttpTransport({
    "GET http://127.0.0.1:11434/api/tags": { status: 200, body: { models: [{ name: "llama3.1", digest: "sha", capabilities: ["completion", "tools"] }] }, timing: { latencyMs: 1 } },
    "POST http://127.0.0.1:11434/api/chat": { status: 200, body: { message: { content: "local answer" }, done: true, prompt_eval_count: 4, eval_count: 2 }, timing: { latencyMs: 2 } },
  });
  const gateway = new ModelProviderGateway({
    configuration: { persistenceEnabled: false },
    providers: [{ configuration: localProvider("ollama-local", { models: [model("ollama-local", "qwen2.5-coder:7b")] }), adapter: new OllamaProviderAdapter({ transport }) }],
  });
  gateway.initialize();

  const health = await gateway.healthCheck("ollama-local");
  const models = await gateway.discoverModels("ollama-local");
  const response = await gateway.complete(chatRequest({ modelId: models[0].id, privacyClassification: PrivacyClassifications.SOURCE_CODE }));

  assert.equal(health.status, ProviderStates.AVAILABLE);
  assert.equal(models[0].local, true);
  assert.ok(models[0].capabilities.includes(ModelCapabilityTypes.TOOL_CALLING));
  assert.equal(response.status, ModelRequestStates.SUCCEEDED);
  assert.equal(response.content, "local answer");
  assert.equal(response.usage.providerId, "ollama-local");
});

test("streams Ollama content without appending terminal response objects", async () => {
  const transport = new FakeHttpTransport({
    "POST http://127.0.0.1:11434/api/chat": {
      status: 200,
      body: [
        "{\"model\":\"qwen2.5-coder:7b\",\"message\":{\"role\":\"assistant\",\"content\":\"local\"},\"done\":false}",
        "{\"model\":\"qwen2.5-coder:7b\",\"message\":{\"role\":\"assistant\",\"content\":\" answer\"},\"done\":false}",
        "{\"model\":\"qwen2.5-coder:7b\",\"message\":{\"role\":\"assistant\",\"content\":\"\"},\"done\":true}",
      ].join("\n"),
      timing: { latencyMs: 2 },
    },
  });
  const gateway = new ModelProviderGateway({
    configuration: { persistenceEnabled: false },
    providers: [{ configuration: localProvider("ollama-local", { models: [model("ollama-local", "qwen2.5-coder:7b")] }), adapter: new OllamaProviderAdapter({ transport }) }],
  });
  gateway.initialize();

  const events = [];
  const response = await gateway.stream(chatRequest({ modelId: "ollama-local:qwen2.5-coder:7b" }), (event) => events.push(event));

  assert.equal(response.status, ModelRequestStates.SUCCEEDED);
  assert.equal(response.content, "local answer");
  assert.equal(events.map((event) => event.content).join(""), "local answer");
  assert.equal(response.content.includes("[object Object]"), false);
});

test("routes OpenAI-compatible requests with credential references and tool call normalization", async () => {
  const credentials = new InMemoryCredentialResolver({ "remote-key": "api-key-secret" });
  const transport = new FakeHttpTransport({
    "GET https://models.example.test/v1/models": (input) => {
      assert.equal(input.headers.Authorization, "Bearer api-key-secret");
      return { status: 200, body: { data: [{ id: "gpt-test" }] }, timing: { latencyMs: 1 } };
    },
    "POST https://models.example.test/v1/chat/completions": (input) => {
      assert.equal(input.headers.Authorization, "Bearer api-key-secret");
      return {
        status: 200,
        body: {
          choices: [{ message: { content: "remote answer", tool_calls: [{ id: "call-1", function: { name: "lookup", arguments: "{\"q\":\"levi\"}" } }] }, finish_reason: "tool_calls" }],
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        },
        timing: { latencyMs: 2 },
      };
    },
  });
  const gateway = new ModelProviderGateway({
    configuration: { persistenceEnabled: false, allowRemoteSourceCode: false },
    credentialResolver: credentials,
    providers: [{
      configuration: remoteProvider("remote", { credentialReference: "remote-key" }),
      adapter: new OpenAICompatibleProviderAdapter({ transport, credentialResolver: credentials }),
    }],
  });
  gateway.initialize();

  const discovered = await gateway.discoverModels("remote");
  const response = await gateway.complete(chatRequest({
    modelId: discovered[0].id,
    privacyClassification: PrivacyClassifications.PUBLIC,
    tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }],
  }));

  assert.equal(response.content, "remote answer");
  assert.equal(response.toolCalls[0].name, "lookup");
  assert.equal(response.usage.totalTokens, 8);
  assert.equal(JSON.stringify(gateway.snapshot()).includes("api-key-secret"), false);
});

test("blocks secrets and remote source code while allowing local fallback", async () => {
  const gateway = new ModelProviderGateway({
    configuration: { persistenceEnabled: false, allowRemoteSourceCode: false, defaultRoutingStrategy: RoutingStrategies.PRIVACY_FIRST },
    providers: [
      { configuration: remoteProvider("remote", { models: [model("remote", "remote-fast", { remote: true, local: false })] }), adapter: mockAdapter({ content: "remote" }) },
      { configuration: localProvider("local", { models: [model("local", "local-safe", { local: true })] }), adapter: mockAdapter({ content: "local" }) },
    ],
  });
  gateway.initialize();

  const routed = gateway.route(chatRequest({ privacyClassification: PrivacyClassifications.SOURCE_CODE }));
  const secret = await gateway.complete(chatRequest({ prompt: "api_key=sk-test-secret", privacyClassification: PrivacyClassifications.PUBLIC }));

  assert.equal(routed.selectedProvider.id, "local");
  assert.equal(secret.status, ModelRequestStates.FAILED);
  assert.equal(secret.error.category, ProviderErrorCategories.PRIVACY_POLICY);
});

test("handles structured output, malformed structure, streaming events, and cancellation", async () => {
  const adapter = mockAdapter({
    content: "{\"answer\":42}",
    streamEvents: [{ type: StreamEventTypes.CONTENT_DELTA, content: "hel" }, { type: StreamEventTypes.CONTENT_DELTA, content: "lo" }],
    streamContent: "hello",
  });
  const gateway = new ModelProviderGateway({
    configuration: { persistenceEnabled: false },
    providers: [{ configuration: localProvider("local", { models: [model("local", "json", { capabilities: [ModelCapabilityTypes.CHAT, ModelCapabilityTypes.STRUCTURED_OUTPUT, ModelCapabilityTypes.STREAMING] })] }), adapter }],
  });
  gateway.initialize();

  const structured = await gateway.complete(chatRequest({ modelId: "local:json", responseSchema: { required: ["answer"] } }));
  adapter.content = "{}";
  const malformed = await gateway.complete(chatRequest({ modelId: "local:json", responseSchema: { required: ["answer"] } }));
  const events = [];
  const streamed = await gateway.stream(chatRequest({ modelId: "local:json" }), (event) => events.push(event));
  const submitted = gateway.submit(chatRequest({ modelId: "local:json" }));
  const cancelled = gateway.cancelRequest(submitted.id, "test cancellation");

  assert.deepEqual(structured.structuredData, { answer: 42 });
  assert.equal(malformed.status, ModelRequestStates.FAILED);
  assert.equal(malformed.error.category, ProviderErrorCategories.STRUCTURED_OUTPUT);
  assert.equal(streamed.content, "hello");
  assert.equal(events.map((event) => event.sequence).join(","), "1,2");
  assert.equal(cancelled.state, ModelRequestStates.CANCELLED);
  assert.equal(adapter.cancelled.has(submitted.id), false);
});

test("preserves provider cancellation as a cancelled request state", async () => {
  const gateway = new ModelProviderGateway({
    configuration: { persistenceEnabled: false },
    providers: [{ configuration: localProvider("local", { models: [model("local", "chat")] }), adapter: mockAdapter({ failCategory: ProviderErrorCategories.CANCELLATION, failMessage: "HTTP request cancelled." }) }],
  });
  gateway.initialize();

  const cancelled = await gateway.complete(chatRequest({ modelId: "local:chat" }));

  assert.equal(cancelled.status, ModelRequestStates.CANCELLED);
  assert.equal(cancelled.error.category, ProviderErrorCategories.CANCELLATION);
});

test("retries provider errors, falls back, records usage, and restores snapshots", async () => {
  const flaky = mockAdapter({ failCount: 1, content: "after retry" });
  const fallback = mockAdapter({ content: "fallback" });
  const gateway = new ModelProviderGateway({
    configuration: { persistenceEnabled: false, defaultRoutingStrategy: RoutingStrategies.FALLBACK_CHAIN },
    providers: [
      { configuration: localProvider("primary", { maximumRetries: 1, models: [model("primary", "a")] }), adapter: flaky },
      { configuration: localProvider("fallback", { models: [model("fallback", "b")] }), adapter: fallback },
    ],
  });
  gateway.initialize();

  const response = await gateway.complete(chatRequest({ providerId: "primary" }));
  const usage = gateway.getUsage();
  const restored = new ModelProviderGateway({ configuration: { persistenceEnabled: false } });
  const result = restored.restore(gateway.snapshot());

  assert.equal(response.content, "after retry");
  assert.equal(flaky.attempts, 2);
  assert.equal(usage.length, 1);
  assert.equal(result.status, "RESTORED");
  assert.equal(restored.listModels().length, 2);
});

test("enforces queue, model context, and persistence corruption bounds", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "levi-model-gateway-"));
  const filePath = path.join(dir, "gateway.json");
  const gateway = new ModelProviderGateway({
    configuration: { persistenceEnabled: true, storagePath: filePath },
    bounds: { maximumQueuedRequests: 1, contextSafetyMarginTokens: 0 },
    providers: [{ configuration: localProvider("local", { models: [model("local", "tiny", { contextWindow: 2 })] }), adapter: mockAdapter({ content: "ok" }) }],
  });
  gateway.initialize();

  gateway.submit(chatRequest({ modelId: "local:tiny", prompt: "a" }));
  assert.throws(() => gateway.submit(chatRequest({ modelId: "local:tiny", prompt: "b" })), (error) => error && /Maximum queued/.test(error.message));
  const limited = await gateway.complete(chatRequest({ modelId: "local:tiny", prompt: "this prompt is too large" }));
  gateway.save(filePath);
  fs.writeFileSync(filePath, "{not-json", "utf8");
  const loaded = gateway.load(filePath);

  assert.equal(limited.status, ModelRequestStates.FAILED);
  assert.equal(limited.error.category, ProviderErrorCategories.CONTEXT_LIMIT);
  assert.equal(loaded.status, "EMPTY");
  assert.equal(loaded.corrupted, true);
});

test("exposes gateway through LeviApplicationRuntime commands and component capabilities", async () => {
  const gateway = new ModelProviderGateway({
    configuration: { persistenceEnabled: false },
    providers: [{ configuration: localProvider("local", { models: [model("local", "chat")] }), adapter: mockAdapter({ content: "runtime answer" }) }],
  });
  gateway.initialize();
  const runtime = new LeviApplicationRuntime({ components: { ModelProviderGateway: gateway } });
  await runtime.initialize({ skipChecks: true });

  const providers = await runtime.executeCommand("model.providers", {});
  const complete = await runtime.executeCommand("model.complete", chatRequest({ modelId: "local:chat" }));
  const commands = runtime.listCommands();
  const capabilityState = runtime.discoverRuntimeCapabilities();

  assert.equal(providers.success, true);
  assert.equal(providers.data.providers[0].id, "local");
  assert.equal(complete.success, true);
  assert.equal(complete.data.content, "runtime answer");
  assert.ok(commands.some((command) => command.id === "model.complete"));
  assert.ok(capabilityState.availableCapabilities.includes("model provider routing"));
});

function chatRequest(input = {}) {
  return {
    type: ModelRequestTypes.CHAT,
    prompt: "Hello Levi",
    privacyClassification: PrivacyClassifications.PUBLIC,
    ...input,
  };
}

function localProvider(id, input = {}) {
  return {
    id,
    name: id,
    type: ProviderTypes.OLLAMA,
    enabled: true,
    local: true,
    remote: false,
    maximumRetries: 0,
    ...input,
  };
}

function remoteProvider(id, input = {}) {
  return {
    id,
    name: id,
    type: ProviderTypes.OPENAI_COMPATIBLE,
    baseUrl: "https://models.example.test",
    enabled: true,
    local: false,
    remote: true,
    credentialReference: "api-key-reference",
    allowedPrivacyClassifications: [PrivacyClassifications.PUBLIC, PrivacyClassifications.INTERNAL, PrivacyClassifications.USER_CONTENT],
    maximumRetries: 0,
    ...input,
  };
}

function model(providerId, name, input = {}) {
  return {
    id: `${providerId}:${name}`,
    providerId,
    name,
    capabilities: [ModelCapabilityTypes.CHAT, ModelCapabilityTypes.STREAMING, ModelCapabilityTypes.TOOL_CALLING, ModelCapabilityTypes.STRUCTURED_OUTPUT],
    contextWindow: 4096,
    maximumOutputTokens: 512,
    enabled: true,
    local: true,
    remote: false,
    pricing: { monetaryCostUnknown: true },
    ...input,
  };
}

function mockAdapter(options = {}) {
  return {
    initialized: false,
    attempts: 0,
    content: options.content || "ok",
    cancelled: new Set(),
    initialize() { this.initialized = true; return { status: ProviderStates.CONFIGURED }; },
    shutdown() { this.initialized = false; return { status: "SHUTDOWN" }; },
    healthCheck() { return { status: ProviderStates.AVAILABLE }; },
    discoverModels() { return options.models || []; },
    getCapabilities() { return [ModelCapabilityTypes.CHAT]; },
    complete(request) {
      this.attempts += 1;
      if (options.failCategory) {
        throw { category: options.failCategory, message: options.failMessage || "mock failure", retryable: false };
      }
      if (options.failCount && this.attempts <= options.failCount) {
        throw { category: ProviderErrorCategories.CONNECTION, message: "temporary", retryable: true };
      }
      return { providerId: request.providerId, modelId: request.modelId, content: this.content, usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4, estimated: false } };
    },
    stream(request, listener) {
      this.attempts += 1;
      for (const event of options.streamEvents || []) listener(event);
      return { providerId: request.providerId, modelId: request.modelId, content: options.streamContent || this.content, usage: { estimated: true } };
    },
    cancel(requestId) { this.cancelled.add(requestId); return true; },
    normalizeRequest(request) { return request; },
    normalizeResponse(response) { return response; },
    normalizeError(error, request) {
      return {
        code: "MOCK",
        category: error.category || ProviderErrorCategories.PROVIDER,
        providerId: request && request.providerId,
        modelId: request && request.modelId,
        requestId: request && request.id,
        message: error.message || "mock error",
        userMessage: error.message || "mock error",
        retryable: error.retryable === true,
        recoverable: true,
        severity: "ERROR",
        details: {},
        suggestedActions: [],
        metadata: {},
      };
    },
    estimateTokens(input) {
      const text = typeof input === "string" ? input : JSON.stringify(input || {});
      return { tokens: Math.ceil(text.length / 4), estimated: true, tokenizer: "mock" };
    },
  };
}
