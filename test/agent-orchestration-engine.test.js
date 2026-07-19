const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  AgentOrchestrationEngine,
  AgentStates,
  ConversationStates,
  OrchestrationModes,
  RequestClassifications,
  ToolCallStates,
  TurnStates,
} = require("../src/agent-orchestration-engine");
const { LeviApplicationRuntime } = require("../src/levi-application-runtime");
const { ModelCapabilityTypes, ModelProviderGateway, PrivacyClassifications, ProviderStates, ProviderTypes } = require("../src/model-provider-gateway");

test("normalizes configuration, conversations, turns, messages, tools, calls, states, and deterministic ids", () => {
  const agent = createAgent();
  const tool = agent.registerTool({ id: "fixture.inspect", name: "fixture_inspect", description: "Inspect", readOnly: true, handlerType: "runtime-command", runtimeCommandId: "runtime.health" });
  const conversation = agent.createConversation({ objective: "Explain the project", workspaceId: "workspace-1" });
  const turn = agent.createTurn(conversation.id, { userInput: "Explain this project" });
  const call = agent.proposeToolCall({ conversationId: conversation.id, turnId: turn.id, toolId: tool.id, name: tool.name, arguments: {} });

  assert.equal(agent.getConfiguration().mode, OrchestrationModes.PROPOSAL_ONLY);
  assert.equal(Object.isFrozen(AgentStates), true);
  assert.equal(conversation.state, ConversationStates.CREATED);
  assert.equal(turn.state, TurnStates.CREATED);
  assert.equal(call.state, ToolCallStates.PROPOSED);
  assert.match(conversation.id, /^agent-conversation-/);
});

test("initializes degraded without provider but preserves offline question flow", async () => {
  const runtime = createRuntimeFake({ modelAvailable: false });
  const agent = createAgent({ runtime, modelGateway: null });
  const init = agent.initialize({ load: false });
  const conversation = agent.createConversation({ objective: "What is this project?", workspaceId: "workspace-1" });
  const result = await agent.sendMessage(conversation.id, { content: "What is this project?" }, { skipModel: false });

  assert.equal(init.status, AgentStates.DEGRADED);
  assert.equal(result.status, "partially_completed");
  assert.equal(result.response.outcome, "partially_completed");
  assert.ok(result.response.limitations.some((entry) => /model provider/i.test(entry)));
  assert.equal(agent.getStats().noProviderTurns >= 1, true);
});

test("classifies source-changing, command-execution, search, code, and release requests deterministically", async () => {
  const agent = createAgent();
  const feature = await agent.classifyRequest("Implement a new feature and run tests");
  const search = await agent.classifyRequest("Search for repository graph code");
  const code = await agent.classifyRequest("Explain the current file symbol", { selectedFile: "src/app.js" });
  const release = await agent.classifyRequest("Check release readiness");

  assert.equal(feature.type, RequestClassifications.FEATURE_IMPLEMENTATION);
  assert.equal(feature.intent.sourceChanging, true);
  assert.equal(feature.intent.commandExecuting, true);
  assert.equal(search.type, RequestClassifications.SEARCH);
  assert.equal(code.type, RequestClassifications.CODE_UNDERSTANDING);
  assert.equal(release.type, RequestClassifications.RELEASE_READINESS);
});

test("resolves capabilities and reports missing alternatives without invoking unsupported tools", async () => {
  const runtime = createRuntimeFake({ capabilities: ["project assessment"] });
  const agent = createAgent({ runtime });
  const capabilities = agent.resolveCapabilities(["context assembly", "planning"]);
  const conversation = agent.createConversation({ objective: "Plan a refactor", workspaceId: "workspace-1" });
  const result = await agent.sendMessage(conversation.id, { content: "Plan a refactor" }, { skipModel: true });

  assert.deepEqual(capabilities.missingCapabilities.sort(), ["context assembly", "planning"]);
  assert.ok(result.limitations.some((entry) => /Planning capability is unavailable/i.test(entry)));
  assert.equal(runtime.calls.includes("context.build"), false);
});

test("coordinates context, planning, local model request, response normalization, and learning signal events", async () => {
  const runtime = createRuntimeFake({ modelAvailable: true });
  const gateway = createGateway({ content: "Evidence-backed answer" });
  const agent = createAgent({ runtime, modelGateway: gateway });
  const events = [];
  agent.subscribe((event) => events.push(event.type));
  agent.initialize({ load: false });
  const conversation = agent.createConversation({ objective: "Plan a feature", workspaceId: "workspace-1" });
  const result = await agent.sendMessage(conversation.id, { content: "Plan a feature" });

  assert.equal(result.response.outcome, "completed");
  assert.equal(result.response.content, "Evidence-backed answer");
  assert.equal(runtime.calls.includes("context.build"), true);
  assert.equal(runtime.calls.includes("planning.create"), true);
  assert.ok(result.turn.modelRequestIds.length);
  assert.ok(events.includes("turn_model_response_completed"));
  assert.ok(events.includes("agent_learning_signal_recorded"));
});

test("supports streaming events and cancellation without live providers", async () => {
  const gateway = createGateway({ content: "hello", stream: true });
  const agent = createAgent({ runtime: createRuntimeFake({ modelAvailable: true }), modelGateway: gateway });
  const streamEvents = [];
  agent.subscribe((event) => { if (event.type === "turn_stream_event") streamEvents.push(event); });
  const conversation = agent.createConversation({ objective: "Explain streaming", workspaceId: "workspace-1" });
  const result = await agent.sendMessage(conversation.id, { content: "Explain streaming" }, { stream: true });
  const cancelled = agent.cancelConversation(conversation.id, "test cancel after completion");

  assert.ok(streamEvents.length >= 1);
  assert.equal(result.response.content, "hello");
  assert.equal(cancelled.state, ConversationStates.CANCELLED);
});

test("validates tools, blocks malformed and duplicate calls, and requires approval for protected tools", async () => {
  const runtime = createRuntimeFake({ modelAvailable: false });
  const agent = createAgent({ runtime });
  const conversation = agent.createConversation({ objective: "Inspect", workspaceId: "workspace-1" });
  const turn = agent.createTurn(conversation.id, { userInput: "Inspect" });
  agent.registerTool({ id: "protected.write", name: "protected_write", description: "Write", readOnly: false, sourceChanging: true, approvalSensitive: true, handlerType: "runtime-command", runtimeCommandId: "execution.executeObjective" });

  const protectedCall = agent.proposeToolCall({ conversationId: conversation.id, turnId: turn.id, toolId: "protected.write", name: "protected_write", arguments: { path: "src/app.js" } });
  const malformed = agent.validateToolCall({ conversationId: conversation.id, turnId: turn.id, toolId: "repository.search", name: "repository_search", arguments: undefined });
  const first = agent.proposeToolCall({ conversationId: conversation.id, turnId: turn.id, toolId: "runtime.health", name: "runtime_health", arguments: {} });
  const duplicate = agent.proposeToolCall({ conversationId: conversation.id, turnId: turn.id, toolId: "runtime.health", name: "runtime_health", arguments: {} });

  assert.equal(protectedCall.state, ToolCallStates.INVALID);
  assert.equal(protectedCall.error.message.includes("Source-changing tools are unavailable"), true);
  assert.equal(malformed.valid, false);
  assert.equal(first.state, ToolCallStates.PROPOSED);
  assert.equal(duplicate.state, ToolCallStates.INVALID);
  assert.equal(agent.getStats().duplicateToolCallsPrevented >= 1, true);
});

test("executes read-only runtime tools and preserves operation evidence", async () => {
  const runtime = createRuntimeFake({ modelAvailable: false });
  const agent = createAgent({ runtime });
  const conversation = agent.createConversation({ objective: "Search runtime", workspaceId: "workspace-1" });
  const result = await agent.sendMessage(conversation.id, { content: "Search runtime" }, { skipModel: true });

  assert.equal(runtime.calls.includes("repository.search"), true);
  assert.ok(result.response.actionsTaken.some((entry) => entry.includes("repository_search")));
  assert.ok(result.evidence.some((entry) => entry.operationId === "op-repository.search"));
});

test("coordinates validation and bounded repair while distinguishing partial completion", async () => {
  const runtime = createRuntimeFake({ modelAvailable: false, validationFails: true, repairAvailable: true });
  const agent = createAgent({ runtime, configuration: { maximumRepairAttempts: 1 } });
  const conversation = agent.createConversation({ objective: "Search runtime", workspaceId: "workspace-1" });
  const result = await agent.sendMessage(conversation.id, { content: "Search runtime" }, { skipModel: true });

  assert.equal(result.status, "partially_completed");
  assert.equal(result.response.validationStatus, "FAILED");
  assert.equal(runtime.calls.includes("execution.validate"), true);
  assert.equal(runtime.calls.includes("execution.repair"), true);
});

test("persists, restores, recovers interrupted turns, and does not auto-resume protected work", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "levi-agent-"));
  const storagePath = path.join(dir, "agent.json");
  const agent = createAgent({ configuration: { enablePersistence: true, storagePath } });
  const conversation = agent.createConversation({ objective: "Recover me", workspaceId: "workspace-1" });
  const turn = agent.createTurn(conversation.id, { userInput: "Recover me" });
  agent.turns.get(turn.id).state = TurnStates.REQUESTING_MODEL;
  agent.save(storagePath);

  const restored = createAgent({ configuration: { enablePersistence: true, storagePath } });
  restored.recover({ filePath: storagePath });
  const recoveredTurn = restored.getTurn(turn.id);

  assert.equal(recoveredTurn.state, TurnStates.FAILED);
  assert.ok(recoveredTurn.limitations.some((entry) => /not auto-resumed/i.test(entry)));
});

test("falls back safely on corrupted persistence and reports deterministic health caps", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "levi-agent-corrupt-"));
  const storagePath = path.join(dir, "agent.json");
  fs.writeFileSync(storagePath, "{bad-json", "utf8");
  const agent = createAgent({ runtime: null, configuration: { enablePersistence: true, storagePath } });
  const loaded = agent.load({ filePath: storagePath, emptyOnCorruption: true });
  const health = agent.getHealth();

  assert.equal(loaded.status, "EMPTY");
  assert.equal(health.runtimeAvailability, "UNAVAILABLE");
  assert.ok(health.blockers.some((entry) => /runtime/i.test(entry)));
  assert.equal(health.privacyIntegrity, "ENFORCED");
});

test("integrates with LeviApplicationRuntime agent commands without requiring the component", async () => {
  const emptyRuntime = new LeviApplicationRuntime();
  await emptyRuntime.initialize({ skipChecks: true });
  const unconfigured = await emptyRuntime.executeCommand("agent.getHealth", {});

  const runtime = new LeviApplicationRuntime({ enableAgentOrchestration: true, agentConfiguration: { enablePersistence: false }, components: { ModelProviderGateway: createGateway({ content: "runtime answer" }) } });
  await runtime.initialize({ skipChecks: true });
  runtime.agentEngine().initialize({ load: false });
  const conversation = await runtime.executeCommand("agent.createConversation", { objective: "What is Levi?", workspaceId: "workspace-1" });
  const response = await runtime.executeCommand("agent.sendMessage", { conversationId: conversation.data.id, message: { content: "What is Levi?" } });
  const tools = await runtime.executeCommand("agent.listTools", {});

  assert.equal(unconfigured.data.status, "UNCONFIGURED");
  assert.equal(response.success, true);
  assert.ok(tools.data.some((tool) => tool.id === "repository.search"));
});

test("protects runtime and extension code from deprecated provider imports", () => {
  const runtime = fs.readFileSync(path.join(__dirname, "..", "src", "levi-application-runtime.js"), "utf8");
  const extension = fs.readFileSync(path.join(__dirname, "..", "packages", "vscode-extension", "src", "levi-extension.js"), "utf8");

  assert.equal(/require\(["']\.\/model-gateway["']\)/.test(runtime), false);
  assert.equal(/require\(["'].*providers\/ollama-provider["']\)/.test(extension), false);
  assert.equal(/require\(["'].*providers\/remote-provider["']\)/.test(extension), false);
  assert.ok(extension.includes("model-provider-gateway"));
});

function createAgent(options = {}) {
  return new AgentOrchestrationEngine({
    runtime: Object.prototype.hasOwnProperty.call(options, "runtime") ? options.runtime : createRuntimeFake({ modelAvailable: false }),
    modelGateway: options.modelGateway || null,
    configuration: { enablePersistence: false, ...(options.configuration || {}) },
    clock: { now: () => "2026-07-18T00:00:00.000Z" },
  });
}

function createRuntimeFake(options = {}) {
  const capabilities = options.capabilities || ["project assessment", "architecture analysis", "blocker detection", "risk detection", "release-readiness assessment", "offline search", "repository graph querying", "code entity analysis", "planning", "context assembly", "approval gating", "security gating", "validation", "repair", "model provider routing"];
  return {
    calls: [],
    discoverRuntimeCapabilities() {
      return { availableCapabilities: capabilities.slice(), unavailableCapabilities: [], generatedAt: "2026-07-18T00:00:00.000Z" };
    },
    getRuntimeHealth() {
      return { runtimeState: "READY", overallRuntimeHealth: 100, securityStatus: "AVAILABLE" };
    },
    executeCommand(commandId, input) {
      this.calls.push(commandId);
      if (commandId === "context.build") return Promise.resolve({ success: true, status: "SUCCEEDED", operationId: "op-context", data: { id: "context-1", items: [{ id: "item-1", title: "Project facts", source: "test" }], estimatedTokens: 100, omissions: [] } });
      if (commandId === "planning.create") return Promise.resolve({ success: true, status: "SUCCEEDED", operationId: "op-plan", data: { id: "plan-1", tasks: [{ id: "task-1", title: "Inspect" }] } });
      if (commandId === "repository.search") return Promise.resolve({ success: true, status: "SUCCEEDED", operationId: "op-repository.search", data: { results: [{ title: input.query || "runtime" }] } });
      if (commandId === "project.summary") return Promise.resolve({ success: true, status: "SUCCEEDED", operationId: "op-project.summary", data: { summary: "Project summary" } });
      if (commandId === "project.assessment") return Promise.resolve({ success: true, status: "SUCCEEDED", operationId: "op-project.assessment", data: { status: "READY" } });
      if (commandId === "project.releaseReadiness") return Promise.resolve({ success: true, status: "SUCCEEDED", operationId: "op-project.releaseReadiness", data: { level: "READY" } });
      if (commandId === "model.complete") {
        if (!options.modelAvailable) return Promise.resolve({ success: true, data: { status: "UNCONFIGURED", gatewayAvailable: false, warnings: ["No model"] } });
        return Promise.resolve({ success: true, status: "SUCCEEDED", operationId: "op-model", data: { id: "response-1", requestId: "request-1", content: "runtime model", finishReason: "stop", toolCalls: [] } });
      }
      if (commandId === "execution.validate") {
        if (options.validationFails) return Promise.resolve({ success: false, status: "FAILED", operationId: "op-validation", data: { status: "FAILED" } });
        return Promise.resolve({ success: true, status: "SUCCEEDED", operationId: "op-validation", data: { status: "PASSED" } });
      }
      if (commandId === "execution.repair") {
        if (!options.repairAvailable) return Promise.resolve({ success: false, status: "FAILED", operationId: "op-repair", data: { status: "CANNOT_REPAIR" } });
        return Promise.resolve({ success: true, status: "SUCCEEDED", operationId: "op-repair", data: { status: "REPAIRED" } });
      }
      return Promise.resolve({ success: true, status: "SUCCEEDED", operationId: `op-${commandId}`, data: { commandId } });
    },
  };
}

function createGateway(options = {}) {
  const adapter = {
    initialize() { return { status: ProviderStates.CONFIGURED }; },
    shutdown() { return { status: "SHUTDOWN" }; },
    healthCheck() { return { status: ProviderStates.AVAILABLE }; },
    discoverModels() { return []; },
    getCapabilities() { return [ModelCapabilityTypes.CHAT, ModelCapabilityTypes.STREAMING, ModelCapabilityTypes.TOOL_CALLING]; },
    complete(request) { return { providerId: "local", modelId: request.modelId || "local:chat", content: options.content || "answer", usage: { estimated: true }, finishReason: "stop", toolCalls: [] }; },
    stream(request, listener) {
      listener({ type: "CONTENT_DELTA", content: options.content || "hello" });
      return { providerId: "local", modelId: request.modelId || "local:chat", content: options.content || "hello", usage: { estimated: true }, finishReason: "stop", toolCalls: [] };
    },
    cancel() { return true; },
    normalizeRequest(request) { return request; },
    normalizeResponse(response) { return response; },
    normalizeError(error) { return { category: "PROVIDER", message: error.message || "provider", retryable: false }; },
  };
  const gateway = new ModelProviderGateway({
    configuration: { persistenceEnabled: false },
    providers: [{
      configuration: {
        id: "local",
        type: ProviderTypes.MOCK,
        enabled: true,
        local: true,
        remote: false,
        models: [{ id: "local:chat", name: "chat", providerId: "local", enabled: true, local: true, remote: false, capabilities: [ModelCapabilityTypes.CHAT, ModelCapabilityTypes.STREAMING, ModelCapabilityTypes.TOOL_CALLING], contextWindow: 4096, pricing: { monetaryCostUnknown: true } }],
      },
      adapter,
    }],
  });
  gateway.initialize();
  return gateway;
}
