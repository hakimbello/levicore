const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const {
  ModelRequestTypes,
  PrivacyClassifications,
  ProviderErrorCategories,
  RoutingStrategies,
  StreamEventTypes,
} = require("./model-provider-gateway");

const AGENT_ORCHESTRATION_SCHEMA_VERSION = 1;

const AgentStates = Object.freeze({
  CREATED: "CREATED",
  INITIALIZING: "INITIALIZING",
  READY: "READY",
  DEGRADED: "DEGRADED",
  SUSPENDED: "SUSPENDED",
  SHUTTING_DOWN: "SHUTTING_DOWN",
  STOPPED: "STOPPED",
  FAILED: "FAILED",
});

const ConversationStates = Object.freeze({
  CREATED: "CREATED",
  ACTIVE: "ACTIVE",
  WAITING_FOR_MODEL: "WAITING_FOR_MODEL",
  STREAMING: "STREAMING",
  WAITING_FOR_TOOL: "WAITING_FOR_TOOL",
  WAITING_FOR_APPROVAL: "WAITING_FOR_APPROVAL",
  EXECUTING_TOOL: "EXECUTING_TOOL",
  VALIDATING: "VALIDATING",
  REPAIRING: "REPAIRING",
  PAUSED: "PAUSED",
  CANCELLING: "CANCELLING",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
});

const TurnStates = Object.freeze({
  CREATED: "CREATED",
  CLASSIFYING: "CLASSIFYING",
  GATHERING_CONTEXT: "GATHERING_CONTEXT",
  PLANNING: "PLANNING",
  REQUESTING_MODEL: "REQUESTING_MODEL",
  STREAMING: "STREAMING",
  PROCESSING_RESPONSE: "PROCESSING_RESPONSE",
  PROPOSING_TOOLS: "PROPOSING_TOOLS",
  WAITING_FOR_APPROVAL: "WAITING_FOR_APPROVAL",
  EXECUTING_TOOLS: "EXECUTING_TOOLS",
  VALIDATING: "VALIDATING",
  REPAIRING: "REPAIRING",
  SYNTHESIZING: "SYNTHESIZING",
  SUCCEEDED: "SUCCEEDED",
  PARTIALLY_SUCCEEDED: "PARTIALLY_SUCCEEDED",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
  TIMED_OUT: "TIMED_OUT",
});

const RequestClassifications = Object.freeze({
  QUESTION: "QUESTION",
  EXPLANATION: "EXPLANATION",
  CODE_UNDERSTANDING: "CODE_UNDERSTANDING",
  PROJECT_ANALYSIS: "PROJECT_ANALYSIS",
  SEARCH: "SEARCH",
  PLANNING: "PLANNING",
  DEBUGGING: "DEBUGGING",
  REFACTORING: "REFACTORING",
  FEATURE_IMPLEMENTATION: "FEATURE_IMPLEMENTATION",
  TESTING: "TESTING",
  VALIDATION: "VALIDATION",
  REPAIR: "REPAIR",
  DOCUMENTATION: "DOCUMENTATION",
  SECURITY_REVIEW: "SECURITY_REVIEW",
  RELEASE_READINESS: "RELEASE_READINESS",
  CUSTOM: "CUSTOM",
  UNKNOWN: "UNKNOWN",
});

const OrchestrationModes = Object.freeze({
  OFFLINE_ONLY: "OFFLINE_ONLY",
  READ_ONLY: "READ_ONLY",
  PROPOSAL_ONLY: "PROPOSAL_ONLY",
  APPROVAL_GATED: "APPROVAL_GATED",
  EXECUTION_ENABLED: "EXECUTION_ENABLED",
  DIAGNOSTIC: "DIAGNOSTIC",
});

const ToolCallStates = Object.freeze({
  PROPOSED: "PROPOSED",
  VALIDATING: "VALIDATING",
  INVALID: "INVALID",
  WAITING_FOR_APPROVAL: "WAITING_FOR_APPROVAL",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  PARTIALLY_SUCCEEDED: "PARTIALLY_SUCCEEDED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
});

const AgentEventTypes = Object.freeze({
  INITIALIZATION_STARTED: "agent_initialization_started",
  READY: "agent_ready",
  DEGRADED: "agent_degraded",
  FAILED: "agent_failed",
  CONVERSATION_CREATED: "conversation_created",
  CONVERSATION_STARTED: "conversation_started",
  CONVERSATION_PAUSED: "conversation_paused",
  CONVERSATION_RESUMED: "conversation_resumed",
  CONVERSATION_CANCELLED: "conversation_cancelled",
  CONVERSATION_COMPLETED: "conversation_completed",
  CONVERSATION_FAILED: "conversation_failed",
  CONVERSATION_RECOVERED: "conversation_recovered",
  TURN_CREATED: "turn_created",
  TURN_CLASSIFICATION_STARTED: "turn_classification_started",
  TURN_CLASSIFIED: "turn_classified",
  TURN_CONTEXT_STARTED: "turn_context_started",
  TURN_CONTEXT_COMPLETED: "turn_context_completed",
  TURN_PLANNING_STARTED: "turn_planning_started",
  TURN_PLANNING_COMPLETED: "turn_planning_completed",
  TURN_MODEL_REQUEST_STARTED: "turn_model_request_started",
  TURN_STREAM_STARTED: "turn_stream_started",
  TURN_STREAM_EVENT: "turn_stream_event",
  TURN_MODEL_RESPONSE_COMPLETED: "turn_model_response_completed",
  TOOL_CALL_PROPOSED: "tool_call_proposed",
  TOOL_CALL_VALIDATION_FAILED: "tool_call_validation_failed",
  TOOL_CALL_WAITING_FOR_APPROVAL: "tool_call_waiting_for_approval",
  TOOL_CALL_APPROVED: "tool_call_approved",
  TOOL_CALL_REJECTED: "tool_call_rejected",
  TOOL_CALL_STARTED: "tool_call_started",
  TOOL_CALL_COMPLETED: "tool_call_completed",
  TOOL_CALL_FAILED: "tool_call_failed",
  TURN_VALIDATION_STARTED: "turn_validation_started",
  TURN_VALIDATION_COMPLETED: "turn_validation_completed",
  TURN_REPAIR_STARTED: "turn_repair_started",
  TURN_REPAIR_COMPLETED: "turn_repair_completed",
  TURN_SYNTHESIS_STARTED: "turn_synthesis_started",
  TURN_COMPLETED: "turn_completed",
  TURN_PARTIALLY_COMPLETED: "turn_partially_completed",
  TURN_CANCELLED: "turn_cancelled",
  TURN_FAILED: "turn_failed",
  PERSISTED: "agent_persisted",
  RESTORED: "agent_restored",
  CORRUPTION_DETECTED: "agent_corruption_detected",
  SHUTDOWN: "agent_shutdown",
});

const DEFAULT_CONFIGURATION = Object.freeze({
  id: "levi-agent-orchestration",
  schemaVersion: AGENT_ORCHESTRATION_SCHEMA_VERSION,
  mode: OrchestrationModes.PROPOSAL_ONLY,
  defaultRoutingStrategy: RoutingStrategies.PRIVACY_FIRST,
  defaultPrivacyClassification: PrivacyClassifications.USER_CONTENT,
  storagePath: ".levi/agent-orchestration.json",
  maximumTurns: 16,
  maximumModelRequestsPerTurn: 2,
  maximumToolCallsPerTurn: 8,
  maximumTotalToolCalls: 64,
  maximumRepairAttempts: 2,
  maximumValidationAttempts: 2,
  maximumContextPackages: 8,
  maximumContextTokens: 8000,
  maximumConversationMessages: 64,
  maximumConversationBytes: 256000,
  maximumStreamEvents: 256,
  maximumOperationTimeMs: 120000,
  requirePlanForProtectedActions: true,
  requireApprovalForProtectedActions: true,
  enableLearning: true,
  enablePersistence: true,
  enableStreaming: true,
  metadata: Object.freeze({}),
});

const DEFAULT_BOUNDS = Object.freeze({
  maximumConversations: 128,
  maximumRegisteredTools: 128,
  maximumTurnsPerConversation: DEFAULT_CONFIGURATION.maximumTurns,
  maximumMessages: DEFAULT_CONFIGURATION.maximumConversationMessages,
  maximumMessageCharacters: 16000,
  maximumConversationBytes: DEFAULT_CONFIGURATION.maximumConversationBytes,
  maximumContextPackages: DEFAULT_CONFIGURATION.maximumContextPackages,
  maximumContextReferences: 64,
  maximumPlanSteps: 64,
  maximumModelRequests: 128,
  maximumToolCalls: DEFAULT_CONFIGURATION.maximumTotalToolCalls,
  maximumRepeatedToolCalls: 1,
  maximumRepairAttempts: DEFAULT_CONFIGURATION.maximumRepairAttempts,
  maximumValidationAttempts: DEFAULT_CONFIGURATION.maximumValidationAttempts,
  maximumStreamEvents: DEFAULT_CONFIGURATION.maximumStreamEvents,
  maximumEventHistory: 1000,
  maximumPersistedConversations: 32,
  maximumOperationDurationMs: DEFAULT_CONFIGURATION.maximumOperationTimeMs,
  maximumListenerCount: 128,
  maximumUiMessageSize: 64000,
});

const INITIAL_TOOL_DEFINITIONS = Object.freeze([
  runtimeTool("runtime.health", "Runtime Health", "runtime.health", { domain: "runtime", requiredCapabilities: [], deterministic: true }),
  runtimeTool("runtime.capabilities", "Runtime Capabilities", "runtime.capabilities", { domain: "runtime", requiredCapabilities: [], deterministic: true }),
  runtimeTool("runtime.certification", "Runtime Certification", "runtime.certification", { domain: "runtime", requiredCapabilities: ["capability discovery"], deterministic: true }),
  runtimeTool("project.summary", "Project Summary", "project.summary", { domain: "project", requiredCapabilities: ["project assessment"] }),
  runtimeTool("project.assessment", "Project Assessment", "project.assessment", { domain: "project", requiredCapabilities: ["project assessment"] }),
  runtimeTool("project.architecture", "Project Architecture", "project.architecture", { domain: "project", requiredCapabilities: ["architecture analysis"] }),
  runtimeTool("project.blockers", "Project Blockers", "project.blockers", { domain: "project", requiredCapabilities: ["blocker detection"] }),
  runtimeTool("project.risks", "Project Risks", "project.risks", { domain: "project", requiredCapabilities: ["risk detection"] }),
  runtimeTool("project.nextActions", "Project Next Actions", "project.nextActions", { domain: "project", requiredCapabilities: ["project assessment"] }),
  runtimeTool("project.releaseReadiness", "Release Readiness", "project.releaseReadiness", { domain: "project", requiredCapabilities: ["release-readiness assessment"] }),
  runtimeTool("repository.search", "Repository Search", "repository.search", { domain: "repository", requiredCapabilities: ["offline search"], inputSchema: { type: "object", required: ["query"] } }),
  runtimeTool("repository.graphQuery", "Repository Graph Query", "repository.graphQuery", { domain: "repository", requiredCapabilities: ["repository graph querying"] }),
  runtimeTool("code.understand", "Code Understanding", "code.understand", { domain: "code", requiredCapabilities: ["code entity analysis"] }),
  runtimeTool("planning.create", "Create Plan", "planning.create", { domain: "planning", requiredCapabilities: ["planning"] }),
  runtimeTool("planning.validate", "Validate Plan", "planning.validate", { domain: "planning", requiredCapabilities: ["planning"] }),
  runtimeTool("context.build", "Build Context", "context.build", { domain: "context", requiredCapabilities: ["context assembly"] }),
  runtimeTool("model.health", "Model Health", "model.health", { domain: "model", requiredCapabilities: [] }),
  runtimeTool("model.routingPreview", "Model Routing Preview", "model.routingPreview", { domain: "model", requiredCapabilities: [] }),
  runtimeTool("workspace.readFile", "Workspace Read File", "workspaceTools.readFile", { domain: "workspace", requiredCapabilities: [], deterministic: true, inputSchema: { type: "object", required: ["path"] } }),
  runtimeTool("workspace.statFile", "Workspace Stat File", "workspaceTools.statFile", { domain: "workspace", requiredCapabilities: [], deterministic: true, inputSchema: { type: "object", required: ["path"] } }),
  runtimeTool("change.createProposal", "Create Change Proposal", "change.createProposal", { domain: "workspace", requiredCapabilities: [], deterministic: true }),
  runtimeTool("change.validateProposal", "Validate Change Proposal", "change.validateProposal", { domain: "workspace", requiredCapabilities: [], deterministic: true }),
  runtimeTool("change.previewDiff", "Preview Change Diff", "change.preview", { domain: "workspace", requiredCapabilities: [], deterministic: true }),
  runtimeTool("change.applyApproved", "Apply Approved Change", "change.apply", { domain: "workspace", requiredCapabilities: [], sourceChanging: true, approvalSensitive: true, protected: true, timeoutMs: 120000 }),
  runtimeTool("change.validateResult", "Validate Change Result", "validation.run", { domain: "workspace", requiredCapabilities: [], commandExecuting: true, approvalSensitive: true, protected: true, timeoutMs: 120000 }),
  runtimeTool("change.revert", "Revert Change", "change.revert", { domain: "workspace", requiredCapabilities: [], sourceChanging: true, approvalSensitive: true, protected: true, timeoutMs: 120000 }),
  runtimeTool("command.listAllowed", "List Allowed Commands", "command.listAllowed", { domain: "workspace", requiredCapabilities: [], deterministic: true }),
  runtimeTool("command.runValidation", "Run Validation Command", "command.runValidation", { domain: "workspace", requiredCapabilities: [], commandExecuting: true, approvalSensitive: true, protected: true, timeoutMs: 120000 }),
  runtimeTool("sourceControl.status", "Source Control Status", "sourceControl.status", { domain: "source-control", requiredCapabilities: [], deterministic: true }),
  runtimeTool("sourceControl.diff", "Source Control Diff", "sourceControl.diff", { domain: "source-control", requiredCapabilities: [], deterministic: true }),
]);

class AgentOrchestrationEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.runtime = options.runtime || null;
    this.modelGateway = options.modelGateway || null;
    this.configuration = normalizeConfiguration(options.configuration || options.config || {});
    this.bounds = normalizeBounds({ ...options.bounds, ...boundsFromConfiguration(this.configuration) });
    this.clock = normalizeClock(options.clock);
    this.idAdapter = normalizeIdAdapter(options.idAdapter);
    this.state = AgentStates.CREATED;
    this.conversations = new Map();
    this.turns = new Map();
    this.messages = new Map();
    this.tools = new Map();
    this.toolCalls = new Map();
    this.events = [];
    this.listeners = new Map();
    this.stats = emptyStats();
    this.modelClassificationAdapter = options.modelClassificationAdapter || null;
    this.persistenceAdapter = options.persistenceAdapter || new FileAgentPersistenceAdapter({ storagePath: this.configuration.storagePath, clock: this.clock });
    for (const tool of INITIAL_TOOL_DEFINITIONS) this.registerTool(tool);
    for (const tool of safeArray(options.tools)) this.registerTool(tool);
    for (const conversation of safeArray(options.conversations)) this.conversations.set(conversation.id, normalizeConversation(conversation, this));
  }

  initialize(options = {}) {
    this.state = AgentStates.INITIALIZING;
    this.emitLifecycle(AgentEventTypes.INITIALIZATION_STARTED, {});
    try {
      if (options.restore !== false && this.configuration.enablePersistence && options.load !== false) this.load({ emptyOnCorruption: true });
      const health = this.getHealth({ skipChecks: true });
      this.state = health.blockers.length || health.warnings.length ? AgentStates.DEGRADED : AgentStates.READY;
      this.emitLifecycle(this.state === AgentStates.READY ? AgentEventTypes.READY : AgentEventTypes.DEGRADED, { health });
      return { status: this.state, health };
    } catch (error) {
      this.state = AgentStates.FAILED;
      const normalized = normalizeAgentError(error, this, "INITIALIZATION");
      this.emitLifecycle(AgentEventTypes.FAILED, { error: normalized });
      return { status: AgentStates.FAILED, error: normalized };
    }
  }

  shutdown(options = {}) {
    this.state = AgentStates.SHUTTING_DOWN;
    if (this.configuration.enablePersistence && options.save !== false) {
      try { this.save(); } catch (error) { this.stats.lastFailure = normalizeAgentError(error, this, "PERSISTENCE"); }
    }
    this.state = AgentStates.STOPPED;
    this.emitLifecycle(AgentEventTypes.SHUTDOWN, {});
    return { status: AgentStates.STOPPED };
  }

  suspend(reason = "Suspended by caller.") {
    this.state = AgentStates.SUSPENDED;
    return { status: this.state, reason };
  }

  resume(options = {}) {
    if (this.state === AgentStates.SUSPENDED || this.state === AgentStates.STOPPED) this.state = AgentStates.READY;
    return { status: this.state, options: sanitizeForFrontend(options) };
  }

  recover(options = {}) {
    const restored = this.load({ emptyOnCorruption: true, ...options });
    for (const conversation of this.conversations.values()) {
      if ([ConversationStates.WAITING_FOR_MODEL, ConversationStates.STREAMING, ConversationStates.EXECUTING_TOOL, ConversationStates.VALIDATING, ConversationStates.REPAIRING].includes(conversation.state)) {
        conversation.state = ConversationStates.PAUSED;
        conversation.warnings.push("Conversation recovered from interrupted in-flight work; retry is required.");
        conversation.confidence = Math.min(conversation.confidence, 0.65);
        conversation.updatedAt = this.now();
        this.emitLifecycle(AgentEventTypes.CONVERSATION_RECOVERED, { conversationId: conversation.id });
      }
    }
    for (const turn of this.turns.values()) {
      if (![TurnStates.SUCCEEDED, TurnStates.PARTIALLY_SUCCEEDED, TurnStates.CANCELLED, TurnStates.FAILED, TurnStates.TIMED_OUT].includes(turn.state)) {
        turn.state = TurnStates.FAILED;
        turn.error = normalizeAgentError(new Error("Interrupted turn recovered; explicit retry required."), this, "RECOVERY", { turnId: turn.id });
        turn.limitations.push("Protected operations are not auto-resumed after recovery.");
        turn.updatedAt = this.now();
      }
    }
    this.state = AgentStates.READY;
    return { status: "RECOVERED", restored };
  }

  getState() {
    return { state: this.state, conversationCount: this.conversations.size, activeConversations: this.listConversations({ active: true }).length };
  }

  getConfiguration() {
    return clonePlainObject(this.configuration);
  }

  updateConfiguration(patch, options = {}) {
    const next = normalizeConfiguration({ ...this.configuration, ...sanitizeConfigurationPatch(patch) });
    this.configuration = options.replace === true ? next : { ...this.configuration, ...next };
    this.bounds = normalizeBounds({ ...this.bounds, ...boundsFromConfiguration(this.configuration) });
    return this.getConfiguration();
  }

  getHealth(options = {}) {
    const runtimeHealth = this.runtime && typeof this.runtime.getRuntimeHealth === "function" ? safeCall(() => this.runtime.getRuntimeHealth({ skipChecks: true }), null) : null;
    const capabilityState = this.discoverCapabilities();
    const modelHealth = this.modelGateway && typeof this.modelGateway.getGatewayHealth === "function"
      ? safeCall(() => this.modelGateway.getGatewayHealth(), null)
      : safeRuntimeData(this.runtime, "model.health", { check: false }, null);
    const warnings = [];
    const blockers = [];
    if (!this.runtime) blockers.push("LeviApplicationRuntime is unavailable; tool execution is blocked.");
    if (!modelHealth || modelHealth.status === "UNCONFIGURED" || modelHealth.gatewayAvailable === false || modelHealth.summary && !modelHealth.summary.availableProviders) warnings.push("No model provider is available; model-assisted synthesis is unavailable but offline tools remain usable.");
    if (!capabilityState.availableCapabilities.includes("approval gating")) warnings.push("Approval capability is not advertised; protected tools remain approval-blocked.");
    const scores = agentHealthScores({
      runtimeAvailable: Boolean(this.runtime),
      modelAvailable: Boolean(modelHealth && (modelHealth.availableProviders || modelHealth.summary && modelHealth.summary.availableProviders)),
      contextAvailable: capabilityState.availableCapabilities.includes("context assembly"),
      planningAvailable: capabilityState.availableCapabilities.includes("planning"),
      approvalAvailable: capabilityState.availableCapabilities.includes("approval gating"),
      securityAvailable: runtimeHealth ? runtimeHealth.securityStatus !== "UNAVAILABLE" : Boolean(this.runtime),
      validationAvailable: capabilityState.availableCapabilities.includes("validation"),
      persistenceReliable: this.stats.corruptedLoads === 0,
      conversationReliability: reliabilityScore(this.stats.turnsSucceeded, this.stats.turnsFailed + this.stats.turnsCancelled),
      toolAvailable: this.tools.size > 0,
    }, warnings, blockers);
    return {
      agentState: this.state,
      mode: this.configuration.mode,
      configuredTools: this.tools.size,
      conversations: this.conversations.size,
      turns: this.turns.size,
      runtimeAvailability: this.runtime ? "AVAILABLE" : "UNAVAILABLE",
      modelGatewayAvailability: modelHealth && modelHealth.status !== "UNCONFIGURED" ? "AVAILABLE" : "UNCONFIGURED",
      intelligenceAvailability: capabilityState.availableCapabilities.length ? "AVAILABLE" : "DEGRADED",
      contextAvailability: capabilityState.availableCapabilities.includes("context assembly") ? "AVAILABLE" : "UNAVAILABLE",
      planningAvailability: capabilityState.availableCapabilities.includes("planning") ? "AVAILABLE" : "UNAVAILABLE",
      toolAvailability: this.tools.size ? "AVAILABLE" : "UNAVAILABLE",
      approvalIntegrity: capabilityState.availableCapabilities.includes("approval gating") || this.runtime ? "ENFORCED" : "BLOCKED",
      securityIntegrity: this.runtime ? "ENFORCED" : "BLOCKED",
      privacyIntegrity: "ENFORCED",
      validationAvailability: capabilityState.availableCapabilities.includes("validation") ? "AVAILABLE" : "REFERENCE_ONLY",
      persistenceReliability: this.stats.corruptedLoads ? "DEGRADED" : "AVAILABLE",
      conversationReliability: `${Math.round(reliabilityScore(this.stats.turnsSucceeded, this.stats.turnsFailed + this.stats.turnsCancelled))}%`,
      warnings,
      blockers,
      scores,
      overallAgentHealth: scores.overallAgentHealth.value,
      confidence: scores.overallAgentHealth.value / 100,
      completeness: this.tools.size ? 0.9 : 0.65,
      generatedAt: this.now(),
      metadata: sanitizeForFrontend(options.metadata || {}),
    };
  }

  getStats() {
    return clonePlainObject(this.stats);
  }

  snapshot() {
    return sanitizeForPersistence({
      schemaVersion: AGENT_ORCHESTRATION_SCHEMA_VERSION,
      configuration: this.configuration,
      conversations: Array.from(this.conversations.values()).slice(-this.bounds.maximumPersistedConversations).map(summarizeConversation),
      turns: Array.from(this.turns.values()).slice(-this.bounds.maximumPersistedConversations * this.configuration.maximumTurns).map(summarizeTurn),
      messages: Array.from(this.messages.values()).slice(-this.bounds.maximumMessages).map(summarizeMessage),
      tools: Array.from(this.tools.values()).map(summarizeTool),
      toolCalls: Array.from(this.toolCalls.values()).slice(-this.bounds.maximumToolCalls).map(summarizeToolCall),
      events: this.events.slice(-Math.min(this.bounds.maximumEventHistory, 200)),
      statistics: this.stats,
      savedAt: this.now(),
    });
  }

  restore(snapshot) {
    if (!snapshot || Number(snapshot.schemaVersion) !== AGENT_ORCHESTRATION_SCHEMA_VERSION) throw new Error("Unsupported agent orchestration snapshot.");
    this.configuration = normalizeConfiguration(snapshot.configuration || {});
    this.bounds = normalizeBounds({ ...DEFAULT_BOUNDS, ...boundsFromConfiguration(this.configuration) });
    this.conversations = new Map(safeArray(snapshot.conversations).map((conversation) => [conversation.id, normalizeConversation(conversation, this)]));
    this.turns = new Map(safeArray(snapshot.turns).map((turn) => [turn.id, normalizeTurn(turn, this)]));
    this.messages = new Map(safeArray(snapshot.messages).map((message) => [message.id, normalizeMessage(message, this)]));
    this.toolCalls = new Map(safeArray(snapshot.toolCalls).map((toolCall) => [toolCall.id, normalizeToolCall(toolCall, this)]));
    this.stats = { ...emptyStats(), ...(snapshot.statistics || {}) };
    for (const tool of safeArray(snapshot.tools)) this.tools.set(tool.id, normalizeToolDefinition(tool, this));
    for (const conversation of this.conversations.values()) {
      if (![ConversationStates.COMPLETED, ConversationStates.CANCELLED, ConversationStates.FAILED, ConversationStates.EXPIRED].includes(conversation.state)) {
        conversation.state = ConversationStates.PAUSED;
        conversation.warnings.push("Recovered conversation requires explicit retry.");
      }
    }
    this.emitLifecycle(AgentEventTypes.RESTORED, { conversationCount: this.conversations.size, turnCount: this.turns.size });
    return { status: "RESTORED", conversationCount: this.conversations.size, turnCount: this.turns.size };
  }

  save(filePath = this.configuration.storagePath) {
    if (!this.configuration.enablePersistence) return { status: "DISABLED" };
    const result = this.persistenceAdapter.save(this.snapshot(), { filePath });
    this.stats.lastPersistence = this.now();
    this.emitLifecycle(AgentEventTypes.PERSISTED, { path: result.path });
    return result;
  }

  load(options = {}) {
    if (!this.configuration.enablePersistence && !options.force) return { status: "DISABLED" };
    try {
      const result = this.persistenceAdapter.load({ filePath: options.filePath || this.configuration.storagePath, emptyOnCorruption: options.emptyOnCorruption !== false });
      if (result.status === "LOADED") this.restore(result.snapshot);
      return result;
    } catch (error) {
      this.stats.corruptedLoads += 1;
      this.emitLifecycle(AgentEventTypes.CORRUPTION_DETECTED, { error: error.message });
      if (options.emptyOnCorruption !== false) return { status: "EMPTY", corrupted: true, error: error.message };
      throw error;
    }
  }

  createConversation(input = {}, options = {}) {
    if (this.conversations.size >= this.bounds.maximumConversations) throw new Error("Maximum agent conversations exceeded.");
    const conversation = normalizeConversation({
      workspaceId: input.workspaceId || options.workspaceId || null,
      projectId: input.projectId || options.projectId || null,
      sessionId: input.sessionId || null,
      mode: input.mode || options.mode || this.configuration.mode,
      title: input.title || titleFromObjective(input.objective || input.message || input.content),
      objective: input.objective || input.message || input.content || "",
      metadata: input.metadata || {},
    }, this);
    this.conversations.set(conversation.id, conversation);
    this.stats.conversationsCreated += 1;
    this.stats.lastConversation = conversation.id;
    this.emitLifecycle(AgentEventTypes.CONVERSATION_CREATED, { conversationId: conversation.id });
    return clonePlainObject(conversation);
  }

  startConversation(conversationId, options = {}) {
    const conversation = this.requireConversation(conversationId);
    conversation.state = ConversationStates.ACTIVE;
    conversation.updatedAt = this.now();
    this.emitLifecycle(AgentEventTypes.CONVERSATION_STARTED, { conversationId: conversation.id });
    if (conversation.objective && options.execute !== false && conversation.turns.length === 0) {
      return this.sendMessage(conversation.id, { content: conversation.objective }, options);
    }
    return clonePlainObject(conversation);
  }

  async sendMessage(conversationId, input = {}, options = {}) {
    const conversation = this.requireConversation(conversationId);
    if ([ConversationStates.CANCELLED, ConversationStates.COMPLETED, ConversationStates.FAILED, ConversationStates.EXPIRED].includes(conversation.state)) throw new Error("Cannot send a message to a terminal conversation.");
    conversation.state = ConversationStates.ACTIVE;
    const message = normalizeMessage({
      conversationId: conversation.id,
      role: input.role || "user",
      content: input.content || input.message || input.text || "",
      contentType: input.contentType || "text/plain",
      privacyClassification: strictestPrivacy([input.privacyClassification, this.configuration.defaultPrivacyClassification]),
      sourceReferences: input.sourceReferences || [],
      attachments: input.attachments || [],
      metadata: input.metadata || {},
    }, this);
    this.messages.set(message.id, message);
    trimConversationMessages(conversation, message, this);
    const turn = this.createTurn(conversation.id, { userInput: message.content, messageId: message.id, privacyClassification: message.privacyClassification, ...input }, options);
    return this.executeTurn(turn.id, options);
  }

  continueConversation(conversationId, input = {}, options = {}) {
    return this.sendMessage(conversationId, input, options);
  }

  pauseConversation(conversationId, reason = "Paused by caller.") {
    const conversation = this.requireConversation(conversationId);
    conversation.state = ConversationStates.PAUSED;
    conversation.warnings.push(reason);
    conversation.updatedAt = this.now();
    this.emitLifecycle(AgentEventTypes.CONVERSATION_PAUSED, { conversationId, reason });
    return clonePlainObject(conversation);
  }

  resumeConversation(conversationId, options = {}) {
    const conversation = this.requireConversation(conversationId);
    conversation.state = ConversationStates.ACTIVE;
    conversation.updatedAt = this.now();
    this.emitLifecycle(AgentEventTypes.CONVERSATION_RESUMED, { conversationId });
    if (options.retryActiveTurn && conversation.activeTurnId) return this.retryTurn(conversation.activeTurnId, options);
    return clonePlainObject(conversation);
  }

  cancelConversation(conversationId, reason = "Cancelled by caller.") {
    const conversation = this.requireConversation(conversationId);
    conversation.state = ConversationStates.CANCELLING;
    if (conversation.activeTurnId) this.cancelTurn(conversation.activeTurnId, reason);
    conversation.state = ConversationStates.CANCELLED;
    conversation.completedAt = this.now();
    conversation.updatedAt = this.now();
    conversation.limitations.push(reason);
    this.stats.conversationsCancelled += 1;
    this.emitLifecycle(AgentEventTypes.CONVERSATION_CANCELLED, { conversationId, reason });
    return clonePlainObject(conversation);
  }

  completeConversation(conversationId, result = {}) {
    const conversation = this.requireConversation(conversationId);
    conversation.state = ConversationStates.COMPLETED;
    conversation.completedAt = this.now();
    conversation.updatedAt = this.now();
    conversation.confidence = numberOrFallback(result.confidence, conversation.confidence);
    conversation.completeness = numberOrFallback(result.completeness, conversation.completeness);
    if (result.evidence) conversation.evidence = boundedArray(conversation.evidence.concat(safeArray(result.evidence)), this.bounds.maximumContextReferences);
    this.stats.conversationsCompleted += 1;
    this.emitLifecycle(AgentEventTypes.CONVERSATION_COMPLETED, { conversationId });
    return clonePlainObject(conversation);
  }

  failConversation(conversationId, error) {
    const conversation = this.requireConversation(conversationId);
    conversation.state = ConversationStates.FAILED;
    conversation.completedAt = this.now();
    conversation.updatedAt = this.now();
    conversation.limitations.push(error && error.message || String(error));
    this.stats.conversationsFailed += 1;
    this.stats.lastFailure = normalizeAgentError(error, this, "CONVERSATION", { conversationId });
    this.emitLifecycle(AgentEventTypes.CONVERSATION_FAILED, { conversationId, error: this.stats.lastFailure });
    return clonePlainObject(conversation);
  }

  getConversation(conversationId) {
    const conversation = this.conversations.get(requiredString(conversationId, "Conversation id is required."));
    return conversation ? clonePlainObject(conversation) : null;
  }

  listConversations(filter = {}) {
    return Array.from(this.conversations.values()).filter((conversation) => {
      if (filter.active) return ![ConversationStates.COMPLETED, ConversationStates.CANCELLED, ConversationStates.FAILED, ConversationStates.EXPIRED].includes(conversation.state);
      return matchesFilter(conversation, filter);
    }).sort(compareCreated).map(clonePlainObject);
  }

  deleteConversation(conversationId, options = {}) {
    const id = requiredString(conversationId, "Conversation id is required.");
    const conversation = this.conversations.get(id);
    if (!conversation) return false;
    if (!options.force && ![ConversationStates.COMPLETED, ConversationStates.CANCELLED, ConversationStates.FAILED, ConversationStates.EXPIRED].includes(conversation.state)) throw new Error("Only terminal conversations can be deleted without force.");
    this.conversations.delete(id);
    for (const turnId of conversation.turns) this.turns.delete(turnId);
    for (const message of Array.from(this.messages.values())) if (message.conversationId === id) this.messages.delete(message.id);
    for (const toolCall of Array.from(this.toolCalls.values())) if (toolCall.conversationId === id) this.toolCalls.delete(toolCall.id);
    return true;
  }

  createTurn(conversationId, input = {}, options = {}) {
    const conversation = this.requireConversation(conversationId);
    if (conversation.turns.length >= this.configuration.maximumTurns || conversation.turns.length >= this.bounds.maximumTurnsPerConversation) throw new Error("Maximum agent turns exceeded.");
    const turn = normalizeTurn({
      conversationId,
      sequence: conversation.turns.length + 1,
      userInput: input.userInput || input.content || "",
      metadata: { messageId: input.messageId || null, ...sanitizeForFrontend(input.metadata || {}) },
      privacyClassification: input.privacyClassification || this.configuration.defaultPrivacyClassification,
    }, this);
    conversation.turns.push(turn.id);
    conversation.activeTurnId = turn.id;
    conversation.updatedAt = this.now();
    this.turns.set(turn.id, turn);
    this.stats.turnsCreated += 1;
    this.stats.lastTurn = turn.id;
    this.emitLifecycle(AgentEventTypes.TURN_CREATED, { conversationId, turnId: turn.id });
    return clonePlainObject(turn);
  }

  async executeTurn(turnId, options = {}) {
    const startedAt = Date.now();
    const turn = this.requireTurn(turnId);
    const conversation = this.requireConversation(turn.conversationId);
    const timeoutMs = positiveInteger(options.timeoutMs, this.configuration.maximumOperationTimeMs);
    try {
      return await withTimeout(this.executeTurnInternal(turn, conversation, options, startedAt), timeoutMs, () => {
        turn.state = TurnStates.TIMED_OUT;
        throw new Error("Agent turn timed out.");
      });
    } catch (error) {
      const normalized = normalizeAgentError(error, this, error.category || "TURN", { conversationId: conversation.id, turnId: turn.id });
      turn.error = normalized;
      turn.state = turn.state === TurnStates.TIMED_OUT ? TurnStates.TIMED_OUT : TurnStates.FAILED;
      turn.completedAt = this.now();
      turn.updatedAt = this.now();
      conversation.state = ConversationStates.FAILED;
      conversation.updatedAt = this.now();
      this.stats.turnsFailed += 1;
      this.stats.lastFailure = normalized;
      this.emitLifecycle(AgentEventTypes.TURN_FAILED, { conversationId: conversation.id, turnId: turn.id, error: normalized });
      return this.finalizeTurnResult(turn, conversation, "failed", startedAt);
    }
  }

  async executeTurnInternal(turn, conversation, options, startedAt) {
    this.transitionTurn(turn, TurnStates.CLASSIFYING, AgentEventTypes.TURN_CLASSIFICATION_STARTED);
    const classification = await this.classifyRequest(turn.userInput, { conversation, turn, ...options });
    turn.classification = classification.type;
    turn.intent = classification.intent;
    turn.requiredCapabilities = this.resolveRequiredCapabilities(classification, options);
    turn.evidence.push(...classification.evidence);
    this.stats.classifications += 1;
    this.emitLifecycle(AgentEventTypes.TURN_CLASSIFIED, { conversationId: conversation.id, turnId: turn.id, classification: turn.classification });

    const capabilities = this.resolveCapabilities(turn.requiredCapabilities);
    if (capabilities.missingCapabilities.length) {
      this.stats.capabilityBlocks += 1;
      turn.warnings.push(`Missing capabilities: ${capabilities.missingCapabilities.join(", ")}.`);
      turn.limitations.push(...capabilities.viableAlternatives);
    }

    this.transitionTurn(turn, TurnStates.GATHERING_CONTEXT, AgentEventTypes.TURN_CONTEXT_STARTED);
    const context = await this.buildContext(turn, conversation, classification, capabilities, options);
    if (context.package) {
      turn.contextPackageIds.push(context.package.id || context.package.packageId || `context-${turn.id}`);
      conversation.contextPackageIds = uniqueSorted(conversation.contextPackageIds.concat(turn.contextPackageIds));
    }
    turn.contextRequest = context.request;
    turn.evidence.push(...context.evidence);
    turn.warnings.push(...context.warnings);
    turn.limitations.push(...context.limitations);
    this.emitLifecycle(AgentEventTypes.TURN_CONTEXT_COMPLETED, { conversationId: conversation.id, turnId: turn.id, contextPackageIds: turn.contextPackageIds });

    if (this.shouldPlan(classification, capabilities, options)) {
      this.transitionTurn(turn, TurnStates.PLANNING, AgentEventTypes.TURN_PLANNING_STARTED);
      const plan = await this.createOrReusePlan(turn, conversation, context, options);
      if (plan.planId) {
        turn.planId = plan.planId;
        conversation.planIds = uniqueSorted(conversation.planIds.concat(plan.planId));
      }
      turn.evidence.push(...plan.evidence);
      turn.warnings.push(...plan.warnings);
      turn.limitations.push(...plan.limitations);
      this.emitLifecycle(AgentEventTypes.TURN_PLANNING_COMPLETED, { conversationId: conversation.id, turnId: turn.id, planId: turn.planId });
    }

    const deterministicTools = this.proposeDeterministicToolCalls(turn, conversation, classification, context, options);
    for (const call of deterministicTools) this.toolCalls.set(call.id, call);
    turn.proposedToolCalls.push(...deterministicTools.map((call) => summarizeToolCall(call)));
    if (deterministicTools.length) this.transitionTurn(turn, TurnStates.PROPOSING_TOOLS, null);
    for (const call of deterministicTools) this.emitLifecycle(AgentEventTypes.TOOL_CALL_PROPOSED, { conversationId: conversation.id, turnId: turn.id, toolCallId: call.id });

    const executed = await this.executeSafeToolCalls(turn, conversation, deterministicTools, options);
    turn.executedToolCalls.push(...executed.map(summarizeToolCall));

    const model = await this.requestModel(turn, conversation, context, executed, options);
    turn.warnings.push(...model.warnings);
    turn.limitations.push(...model.limitations);
    if (model.requestId) {
      turn.modelRequestIds.push(model.requestId);
      conversation.modelRequestIds = uniqueSorted(conversation.modelRequestIds.concat(model.requestId));
    }
    if (model.responseId) turn.modelResponseIds.push(model.responseId);
    if (model.toolCalls.length) {
      const proposed = model.toolCalls.map((call) => this.proposeToolCall({ ...call, conversationId: conversation.id, turnId: turn.id, modelRequestId: model.requestId }, options));
      turn.proposedToolCalls.push(...proposed.map(summarizeToolCall));
    }

    const validation = await this.validateTurn(turn, conversation, executed, options);
    turn.validationResults.push(...validation.results);
    turn.evidence.push(...validation.evidence);
    turn.warnings.push(...validation.warnings);
    turn.limitations.push(...validation.limitations);

    const repair = validation.failed ? await this.repairTurn(turn, conversation, validation, options) : { results: [], evidence: [], warnings: [], limitations: [] };
    turn.repairResults.push(...repair.results);
    turn.evidence.push(...repair.evidence);
    turn.warnings.push(...repair.warnings);
    turn.limitations.push(...repair.limitations);

    this.transitionTurn(turn, TurnStates.SYNTHESIZING, AgentEventTypes.TURN_SYNTHESIS_STARTED);
    turn.assistantResponse = this.synthesizeFinalResponse(turn, conversation, {
      classification,
      capabilities,
      context,
      planId: turn.planId,
      model,
      executedTools: executed,
      validation,
      repair,
    });
    const terminal = terminalStateForTurn(turn);
    turn.state = terminal;
    turn.completedAt = this.now();
    turn.updatedAt = this.now();
    conversation.state = terminal === TurnStates.SUCCEEDED ? ConversationStates.COMPLETED : terminal === TurnStates.PARTIALLY_SUCCEEDED ? ConversationStates.COMPLETED : ConversationStates.FAILED;
    conversation.completedAt = this.now();
    conversation.updatedAt = this.now();
    conversation.confidence = turn.confidence;
    conversation.completeness = turn.completeness;
    conversation.evidence = boundedArray(conversation.evidence.concat(turn.evidence), this.bounds.maximumContextReferences);
    this.updateTurnStats(turn, Date.now() - startedAt);
    this.recordLearningSignals(conversation, turn, { model, executedTools: executed, validation, repair });
    this.emitLifecycle(terminal === TurnStates.SUCCEEDED ? AgentEventTypes.TURN_COMPLETED : AgentEventTypes.TURN_PARTIALLY_COMPLETED, { conversationId: conversation.id, turnId: turn.id });
    if (conversation.state === ConversationStates.COMPLETED) this.emitLifecycle(AgentEventTypes.CONVERSATION_COMPLETED, { conversationId: conversation.id });
    return this.finalizeTurnResult(turn, conversation, terminal === TurnStates.SUCCEEDED ? "completed" : "partially_completed", startedAt);
  }

  cancelTurn(turnId, reason = "Cancelled by caller.") {
    const turn = this.requireTurn(turnId);
    turn.state = TurnStates.CANCELLED;
    turn.completedAt = this.now();
    turn.updatedAt = this.now();
    turn.limitations.push(reason);
    this.stats.turnsCancelled += 1;
    const conversation = this.conversations.get(turn.conversationId);
    if (conversation) {
      conversation.state = ConversationStates.CANCELLED;
      conversation.completedAt = this.now();
      conversation.updatedAt = this.now();
    }
    for (const requestId of turn.modelRequestIds) this.cancelModelRequest(requestId, reason);
    for (const toolCall of this.listToolCalls({ turnId })) if (![ToolCallStates.SUCCEEDED, ToolCallStates.FAILED, ToolCallStates.CANCELLED].includes(toolCall.state)) this.cancelToolCall(toolCall.id, reason);
    this.emitLifecycle(AgentEventTypes.TURN_CANCELLED, { conversationId: turn.conversationId, turnId, reason });
    return clonePlainObject(turn);
  }

  retryTurn(turnId, options = {}) {
    const original = this.requireTurn(turnId);
    if (![TurnStates.FAILED, TurnStates.TIMED_OUT, TurnStates.CANCELLED, TurnStates.PARTIALLY_SUCCEEDED].includes(original.state)) throw new Error("Only incomplete terminal turns can be retried.");
    const turn = this.createTurn(original.conversationId, {
      userInput: original.userInput,
      privacyClassification: original.metadata.privacyClassification || this.configuration.defaultPrivacyClassification,
      metadata: { retryOf: turnId },
    }, options);
    return this.executeTurn(turn.id, options);
  }

  getTurn(turnId) {
    const turn = this.turns.get(requiredString(turnId, "Turn id is required."));
    return turn ? clonePlainObject(turn) : null;
  }

  listTurns(conversationId, filter = {}) {
    const conversation = conversationId ? this.requireConversation(conversationId) : null;
    const ids = conversation ? conversation.turns : Array.from(this.turns.keys());
    return ids.map((id) => this.turns.get(id)).filter(Boolean).filter((turn) => matchesFilter(turn, filter)).sort(compareSequence).map(clonePlainObject);
  }

  getTurnResult(turnId) {
    const turn = this.requireTurn(turnId);
    return {
      turnId,
      state: turn.state,
      response: clonePlainObject(turn.assistantResponse),
      evidence: turn.evidence.slice(),
      warnings: turn.warnings.slice(),
      limitations: turn.limitations.slice(),
      confidence: turn.confidence,
      completeness: turn.completeness,
    };
  }

  explainTurn(turnId) {
    const turn = this.requireTurn(turnId);
    return {
      turnId,
      classification: turn.classification,
      requiredCapabilities: turn.requiredCapabilities,
      contextPackageIds: turn.contextPackageIds,
      planId: turn.planId,
      modelRequestIds: turn.modelRequestIds,
      proposedToolCalls: turn.proposedToolCalls.map((call) => ({ id: call.id, name: call.name, state: call.state, approvalRequired: call.approvalRequired })),
      executedToolCalls: turn.executedToolCalls.map((call) => ({ id: call.id, name: call.name, state: call.state, operationId: call.operationId })),
      validationResults: turn.validationResults,
      repairResults: turn.repairResults,
      evidence: turn.evidence,
      warnings: turn.warnings,
      limitations: turn.limitations,
    };
  }

  registerTool(tool) {
    if (this.tools.size >= this.bounds.maximumRegisteredTools) throw new Error("Maximum registered agent tools exceeded.");
    const normalized = normalizeToolDefinition(tool, this);
    this.tools.set(normalized.id, normalized);
    return clonePlainObject(normalized);
  }

  unregisterTool(toolId) {
    return this.tools.delete(requiredString(toolId, "Tool id is required."));
  }

  getTool(toolId) {
    const tool = this.tools.get(requiredString(toolId, "Tool id is required."));
    return tool ? clonePlainObject(tool) : null;
  }

  listTools(filter = {}) {
    return Array.from(this.tools.values()).filter((tool) => matchesFilter(tool, filter)).sort(compareById).map(clonePlainObject);
  }

  validateToolCall(toolCall, options = {}) {
    const call = typeof toolCall === "string" ? this.requireToolCall(toolCall) : normalizeToolCall(toolCall, this);
    const tool = this.tools.get(call.toolId) || Array.from(this.tools.values()).find((entry) => entry.name === call.name);
    const errors = [];
    const warnings = [];
    if (!tool) errors.push("Unknown agent tool.");
    if (!isSerializable(call.arguments)) errors.push("Tool arguments must be serializable.");
    if (tool && tool.inputSchema && Array.isArray(tool.inputSchema.required)) {
      for (const key of tool.inputSchema.required) if (call.arguments[key] === undefined) errors.push(`Missing required argument ${key}.`);
    }
    const mode = options.mode || this.configuration.mode;
    if (tool && tool.sourceChanging && [OrchestrationModes.OFFLINE_ONLY, OrchestrationModes.READ_ONLY, OrchestrationModes.PROPOSAL_ONLY].includes(mode)) errors.push("Source-changing tools are unavailable in current orchestration mode.");
    if (tool && tool.commandExecuting && mode !== OrchestrationModes.EXECUTION_ENABLED && mode !== OrchestrationModes.APPROVAL_GATED) errors.push("Command-executing tools require approval-gated or execution-enabled mode.");
    if (tool && (tool.sourceChanging || tool.commandExecuting || tool.securitySensitive || tool.approvalSensitive || !tool.reversible) && this.configuration.requireApprovalForProtectedActions) {
      call.approvalRequired = true;
      warnings.push("Protected tool requires explicit approval.");
    }
    if (tool) {
      const capability = this.resolveCapabilities(tool.requiredCapabilities || []);
      if (capability.missingCapabilities.length) errors.push(`Missing capabilities: ${capability.missingCapabilities.join(", ")}.`);
    }
    const duplicate = this.findDuplicateToolCall(call, tool);
    if (duplicate && duplicate.id !== call.id && !options.allowDuplicate) {
      errors.push("Duplicate tool call prevented.");
      this.stats.duplicateToolCallsPrevented += 1;
    }
    const valid = errors.length === 0;
    if (!valid) {
      call.state = ToolCallStates.INVALID;
      call.error = normalizeAgentError(new Error(errors.join(" ")), this, "TOOL_VALIDATION", { toolCallId: call.id });
    }
    return { valid, errors, warnings, tool: tool ? clonePlainObject(tool) : null, call: clonePlainObject(call) };
  }

  proposeToolCall(input = {}, options = {}) {
    const tool = input.toolId ? this.tools.get(input.toolId) : Array.from(this.tools.values()).find((entry) => entry.name === input.name || entry.runtimeCommandId === input.name);
    const call = normalizeToolCall({
      conversationId: input.conversationId || options.conversationId || null,
      turnId: input.turnId || options.turnId || null,
      modelRequestId: input.modelRequestId || null,
      toolId: tool && tool.id || input.toolId || input.name,
      name: tool && tool.name || input.name || input.toolId,
      arguments: input.arguments || input.args || {},
      approvalRequired: input.approvalRequired,
      metadata: input.metadata || {},
    }, this);
    const validation = this.validateToolCall(call, { ...options, allowDuplicate: options.allowDuplicate === true });
    if (!validation.valid) {
      call.state = ToolCallStates.INVALID;
      call.error = validation.call.error;
      this.emitLifecycle(AgentEventTypes.TOOL_CALL_VALIDATION_FAILED, { conversationId: call.conversationId, turnId: call.turnId, toolCallId: call.id, errors: validation.errors });
    } else if (validation.call.approvalRequired) {
      call.state = ToolCallStates.WAITING_FOR_APPROVAL;
      call.approvalRequired = true;
      this.emitLifecycle(AgentEventTypes.TOOL_CALL_WAITING_FOR_APPROVAL, { conversationId: call.conversationId, turnId: call.turnId, toolCallId: call.id });
    }
    this.toolCalls.set(call.id, call);
    this.stats.toolCallsProposed += 1;
    return clonePlainObject(call);
  }

  async executeToolCall(toolCallId, options = {}) {
    const call = this.requireToolCall(toolCallId);
    const tool = this.requireTool(call.toolId);
    const validation = this.validateToolCall(call, { ...options, allowDuplicate: true });
    if (!validation.valid) {
      call.state = ToolCallStates.INVALID;
      call.error = validation.call.error;
      return clonePlainObject(call);
    }
    if (call.approvalRequired && !options.approved && !call.approvalRequestId) {
      call.state = ToolCallStates.WAITING_FOR_APPROVAL;
      this.stats.approvalRequests += 1;
      this.emitLifecycle(AgentEventTypes.TOOL_CALL_WAITING_FOR_APPROVAL, { conversationId: call.conversationId, turnId: call.turnId, toolCallId: call.id });
      return clonePlainObject(call);
    }
    if (call.approvalRequired && options.rejected) {
      call.state = ToolCallStates.REJECTED;
      this.stats.toolCallsRejected += 1;
      this.emitLifecycle(AgentEventTypes.TOOL_CALL_REJECTED, { conversationId: call.conversationId, turnId: call.turnId, toolCallId: call.id });
      return clonePlainObject(call);
    }
    call.state = ToolCallStates.RUNNING;
    call.updatedAt = this.now();
    this.emitLifecycle(AgentEventTypes.TOOL_CALL_STARTED, { conversationId: call.conversationId, turnId: call.turnId, toolCallId: call.id });
    try {
      if (tool.handlerType !== "runtime-command") throw new Error("Only runtime-command tools are executable.");
      if (!this.runtime || typeof this.runtime.executeCommand !== "function") throw new Error("Runtime unavailable for tool execution.");
      const result = await this.runtime.executeCommand(tool.runtimeCommandId, prepareToolArguments(tool, call), { timeoutMs: tool.timeoutMs || this.configuration.maximumOperationTimeMs });
      call.operationId = result && result.operationId || null;
      call.output = sanitizeForFrontend(result && result.data !== undefined ? result.data : result);
      call.state = result && result.success === false ? ToolCallStates.FAILED : ToolCallStates.SUCCEEDED;
      call.evidence.push({ source: "LeviApplicationRuntime", commandId: tool.runtimeCommandId, operationId: call.operationId, status: result && result.status || call.state });
      call.completedAt = this.now();
      call.updatedAt = this.now();
      if (call.state === ToolCallStates.SUCCEEDED) this.stats.toolCallsSucceeded += 1;
      else this.stats.toolCallsFailed += 1;
      this.emitLifecycle(call.state === ToolCallStates.SUCCEEDED ? AgentEventTypes.TOOL_CALL_COMPLETED : AgentEventTypes.TOOL_CALL_FAILED, { conversationId: call.conversationId, turnId: call.turnId, toolCallId: call.id, operationId: call.operationId });
      return clonePlainObject(call);
    } catch (error) {
      call.state = ToolCallStates.FAILED;
      call.error = normalizeAgentError(error, this, "TOOL_EXECUTION", { toolCallId: call.id });
      call.completedAt = this.now();
      call.updatedAt = this.now();
      this.stats.toolCallsFailed += 1;
      this.emitLifecycle(AgentEventTypes.TOOL_CALL_FAILED, { conversationId: call.conversationId, turnId: call.turnId, toolCallId: call.id, error: call.error });
      return clonePlainObject(call);
    }
  }

  cancelToolCall(toolCallId, reason = "Cancelled by caller.") {
    const call = this.requireToolCall(toolCallId);
    if ([ToolCallStates.SUCCEEDED, ToolCallStates.FAILED, ToolCallStates.CANCELLED, ToolCallStates.REJECTED].includes(call.state)) return clonePlainObject(call);
    call.state = ToolCallStates.CANCELLED;
    call.completedAt = this.now();
    call.updatedAt = this.now();
    call.error = normalizeAgentError(new Error(reason), this, "CANCELLATION", { toolCallId });
    this.emitLifecycle(AgentEventTypes.TOOL_CALL_FAILED, { toolCallId, reason });
    return clonePlainObject(call);
  }

  getToolCall(toolCallId) {
    const call = this.toolCalls.get(requiredString(toolCallId, "Tool call id is required."));
    return call ? clonePlainObject(call) : null;
  }

  listToolCalls(filter = {}) {
    return Array.from(this.toolCalls.values()).filter((call) => matchesFilter(call, filter)).sort(compareCreated).map(clonePlainObject);
  }

  subscribe(listener, filter = {}) {
    if (typeof listener !== "function") throw new Error("Agent event listener must be a function.");
    if (this.listeners.size >= this.bounds.maximumListenerCount) throw new Error("Maximum agent listeners exceeded.");
    const id = this.nextId("agent-subscription", { count: this.listeners.size + 1 });
    this.listeners.set(id, { id, listener, filter: clonePlainObject(filter || {}) });
    return id;
  }

  unsubscribe(subscriptionId) {
    return this.listeners.delete(requiredString(subscriptionId, "Subscription id is required."));
  }

  getEvents(filter = {}) {
    return this.events.filter((event) => eventMatchesFilter(event, filter)).map(clonePlainObject);
  }

  clearEvents(options = {}) {
    const before = this.events.length;
    if (options.keepLast) this.events = this.events.slice(-positiveInteger(options.keepLast, 0));
    else this.events = [];
    return { cleared: before - this.events.length, remaining: this.events.length };
  }

  async classifyRequest(text, context = {}) {
    const deterministic = classifyDeterministically(text, context);
    if (this.modelClassificationAdapter && typeof this.modelClassificationAdapter.classify === "function") {
      try {
        const enriched = await this.modelClassificationAdapter.classify({ text, deterministic, context: sanitizeForFrontend(context) });
        return normalizeClassification({ ...deterministic, ...(enriched || {}), evidence: deterministic.evidence.concat(safeArray(enriched && enriched.evidence)) });
      } catch (error) {
        deterministic.evidence.push({ source: "modelClassificationAdapter", status: "FAILED", message: error.message });
      }
    }
    return deterministic;
  }

  resolveRequiredCapabilities(classification) {
    const caps = [];
    if ([RequestClassifications.PROJECT_ANALYSIS, RequestClassifications.RELEASE_READINESS].includes(classification.type)) caps.push("project assessment");
    if (classification.type === RequestClassifications.CODE_UNDERSTANDING) caps.push("code entity analysis");
    if (classification.type === RequestClassifications.SEARCH) caps.push("offline search");
    if ([RequestClassifications.PLANNING, RequestClassifications.FEATURE_IMPLEMENTATION, RequestClassifications.REFACTORING].includes(classification.type)) caps.push("planning", "context assembly");
    if ([RequestClassifications.DEBUGGING, RequestClassifications.REPAIR].includes(classification.type)) caps.push("context assembly", "repair");
    if (classification.intent && classification.intent.sourceChanging) caps.push("approval gating", "security gating");
    if (classification.intent && classification.intent.requiresModel) caps.push("model provider routing");
    return uniqueSorted(caps);
  }

  resolveCapabilities(requiredCapabilities = []) {
    const state = this.discoverCapabilities();
    const available = new Set(state.availableCapabilities);
    const missing = requiredCapabilities.filter((capability) => !available.has(capability));
    return {
      availableCapabilities: state.availableCapabilities,
      unavailableCapabilities: state.unavailableCapabilities,
      requiredCapabilities: uniqueSorted(requiredCapabilities),
      missingCapabilities: uniqueSorted(missing),
      viableAlternatives: missing.map((capability) => alternativeForCapability(capability)),
      evidence: [{ source: "LeviApplicationRuntime", signal: "capability-discovery", available: state.availableCapabilities.length, missing }],
    };
  }

  discoverCapabilities() {
    if (this.runtime && typeof this.runtime.discoverRuntimeCapabilities === "function") return this.runtime.discoverRuntimeCapabilities({ source: "AgentOrchestrationEngine" });
    return { availableCapabilities: [], unavailableCapabilities: [], generatedAt: this.now() };
  }

  async buildContext(turn, conversation, classification, capabilities, options = {}) {
    const request = {
      workspaceId: conversation.workspaceId,
      projectId: conversation.projectId,
      purpose: purposeForClassification(classification.type),
      objective: conversation.objective || turn.userInput,
      query: turn.userInput,
      selectedFile: options.selectedFile || options.filePath || null,
      symbol: options.symbol || null,
      maximumTokens: Math.min(this.configuration.maximumContextTokens, positiveInteger(options.maximumContextTokens, this.configuration.maximumContextTokens)),
      privacyClassification: strictestPrivacy([options.privacyClassification, this.configuration.defaultPrivacyClassification]),
      evidenceReferences: turn.evidence.slice(0, this.bounds.maximumContextReferences),
      metadata: { classification: classification.type, mode: conversation.mode },
    };
    const result = { request, package: null, evidence: [], warnings: [], limitations: [] };
    if (!capabilities.availableCapabilities.includes("context assembly") || !this.runtime) {
      result.limitations.push("Context assembly capability is unavailable; bounded user input only was used.");
      return result;
    }
    try {
      const response = await this.runtime.executeCommand("context.build", request, { timeoutMs: this.configuration.maximumOperationTimeMs });
      result.package = response && response.data || response;
      result.evidence.push({ source: "context.build", operationId: response && response.operationId || null, status: response && response.status || "UNKNOWN" });
      this.stats.contextPackagesRequested += 1;
      if (result.package && result.package.omissions) result.limitations.push(...safeArray(result.package.omissions).map((entry) => entry.reason || "Context omitted by bounds."));
    } catch (error) {
      result.warnings.push(`Context assembly failed: ${error.message}`);
      result.evidence.push({ source: "context.build", status: "FAILED", message: error.message });
    }
    return result;
  }

  shouldPlan(classification, capabilities, options = {}) {
    if (options.forcePlan === true) return true;
    if (classification.type === RequestClassifications.PLANNING) return true;
    if (classification.intent && (classification.intent.sourceChanging || classification.intent.approvalSensitive || classification.intent.hasValidationRequirement)) return true;
    if ([RequestClassifications.FEATURE_IMPLEMENTATION, RequestClassifications.REFACTORING, RequestClassifications.DEBUGGING, RequestClassifications.REPAIR, RequestClassifications.TESTING].includes(classification.type)) return true;
    return false;
  }

  async createOrReusePlan(turn, conversation, context, options = {}) {
    const result = { planId: null, plan: null, evidence: [], warnings: [], limitations: [] };
    if (conversation.planIds.length && options.reusePlan !== false) {
      result.planId = conversation.planIds[conversation.planIds.length - 1];
      result.evidence.push({ source: "conversation", signal: "reused-plan", planId: result.planId });
      return result;
    }
    const capabilities = this.resolveCapabilities(["planning"]);
    if (capabilities.missingCapabilities.length || !this.runtime) {
      result.limitations.push("Planning capability is unavailable; no plan was created.");
      return result;
    }
    try {
      const response = await this.runtime.executeCommand("planning.create", {
        workspaceId: conversation.workspaceId,
        projectId: conversation.projectId,
        objective: conversation.objective || turn.userInput,
        context: context.package || context.request,
        options: { maximumTasks: this.bounds.maximumPlanSteps },
      });
      result.plan = response && response.data || response;
      result.planId = result.plan && (result.plan.id || result.plan.planId) || this.nextId("agent-plan", { turnId: turn.id });
      result.evidence.push({ source: "planning.create", operationId: response && response.operationId || null, status: response && response.status || "UNKNOWN", planId: result.planId });
      this.stats.plansCreated += 1;
    } catch (error) {
      result.warnings.push(`Planning failed: ${error.message}`);
      result.evidence.push({ source: "planning.create", status: "FAILED", message: error.message });
    }
    return result;
  }

  proposeDeterministicToolCalls(turn, conversation, classification, context, options = {}) {
    const calls = [];
    const base = { conversationId: conversation.id, turnId: turn.id, modelRequestId: null };
    const add = (toolId, args = {}) => {
      if (calls.length >= this.configuration.maximumToolCallsPerTurn) return;
      const tool = this.tools.get(toolId);
      if (!tool) return;
      calls.push(normalizeToolCall({ ...base, toolId, name: tool.name, arguments: args }, this));
    };
    const workspaceId = conversation.workspaceId || options.workspaceId || null;
    if (classification.type === RequestClassifications.SEARCH) add("repository.search", { workspaceId, query: turn.userInput, options: { maximumResults: 10 } });
    if (classification.type === RequestClassifications.CODE_UNDERSTANDING) add("code.understand", { workspaceId, filePath: options.selectedFile || options.filePath, target: turn.userInput });
    if (classification.type === RequestClassifications.PROJECT_ANALYSIS) {
      add("project.summary", { workspaceId });
      add("project.assessment", { workspaceId });
    }
    if (classification.type === RequestClassifications.RELEASE_READINESS) add("project.releaseReadiness", { workspaceId });
    if (classification.type === RequestClassifications.SECURITY_REVIEW) add("project.risks", { workspaceId });
    return calls;
  }

  async executeSafeToolCalls(turn, conversation, calls, options = {}) {
    const executed = [];
    let total = this.listToolCalls({ conversationId: conversation.id }).length;
    for (const call of calls) {
      if (executed.length >= this.configuration.maximumToolCallsPerTurn || total >= this.configuration.maximumTotalToolCalls) {
        turn.limitations.push("Tool-call bound reached.");
        break;
      }
      total += 1;
      const tool = this.tools.get(call.toolId);
      const validation = this.validateToolCall(call, { ...options, allowDuplicate: false, mode: conversation.mode });
      if (!validation.valid) {
        call.state = ToolCallStates.INVALID;
        call.error = validation.call.error;
        this.toolCalls.set(call.id, call);
        continue;
      }
      if (!tool.readOnly || call.approvalRequired) {
        call.state = ToolCallStates.WAITING_FOR_APPROVAL;
        this.toolCalls.set(call.id, call);
        conversation.state = ConversationStates.WAITING_FOR_APPROVAL;
        this.emitLifecycle(AgentEventTypes.TOOL_CALL_WAITING_FOR_APPROVAL, { conversationId: conversation.id, turnId: turn.id, toolCallId: call.id });
        continue;
      }
      this.toolCalls.set(call.id, call);
      const result = await this.executeToolCall(call.id, { ...options, allowDuplicate: true });
      executed.push(result);
      if (result.operationId) {
        conversation.operationIds = uniqueSorted(conversation.operationIds.concat(result.operationId));
        turn.evidence.push({ source: "tool", toolId: result.toolId, operationId: result.operationId, state: result.state });
      }
    }
    return executed;
  }

  async requestModel(turn, conversation, context, executedTools, options = {}) {
    const result = { requestId: null, responseId: null, content: "", toolCalls: [], usage: null, finishReason: null, evidence: [], warnings: [], limitations: [], error: null };
    if (conversation.mode === OrchestrationModes.OFFLINE_ONLY || options.skipModel === true) {
      result.limitations.push("Model request skipped by orchestration mode.");
      return result;
    }
    const providerHealth = this.modelGateway && typeof this.modelGateway.getGatewayHealth === "function" ? this.modelGateway.getGatewayHealth() : null;
    const hasProvider = providerHealth && providerHealth.availableProviders > 0 && providerHealth.availableModels > 0 || providerHealth && providerHealth.configuredProviders > 0;
    if (!hasProvider && !this.runtime) {
      result.limitations.push("No model provider or runtime model command is available.");
      this.stats.noProviderTurns += 1;
      return result;
    }
    const request = this.buildProviderRequest(turn, conversation, context, executedTools, options);
    this.transitionTurn(turn, this.configuration.enableStreaming && request.stream ? TurnStates.STREAMING : TurnStates.REQUESTING_MODEL, this.configuration.enableStreaming && request.stream ? AgentEventTypes.TURN_STREAM_STARTED : AgentEventTypes.TURN_MODEL_REQUEST_STARTED);
    try {
      let response;
      if (this.modelGateway && typeof this.modelGateway.complete === "function") {
        if (request.stream && this.configuration.enableStreaming && typeof this.modelGateway.stream === "function") {
          response = await this.modelGateway.stream(request, (event) => this.handleModelStreamEvent(turn, conversation, event), options.modelOptions || {});
        } else {
          response = await this.modelGateway.complete(request, options.modelOptions || {});
        }
      } else if (this.runtime && typeof this.runtime.executeCommand === "function") {
        const runtimeResponse = await this.runtime.executeCommand("model.complete", request, options.modelOptions || {});
        response = runtimeResponse && runtimeResponse.data || runtimeResponse;
      }
      if (response && (response.status === "UNCONFIGURED" || response.gatewayAvailable === false)) {
        result.limitations.push("No model provider is configured; model-assisted synthesis is unavailable.");
        result.warnings.push(...safeArray(response.warnings));
        this.stats.noProviderTurns += 1;
        return result;
      }
      if (response && response.status && response.status !== "SUCCEEDED" && response.error) {
        result.error = normalizeAgentError(response.error, this, "MODEL", { conversationId: conversation.id, turnId: turn.id });
        result.limitations.push(result.error.userMessage || result.error.message);
        this.stats.modelFailures += 1;
        return result;
      }
      result.requestId = response && response.requestId || request.id || null;
      result.responseId = response && response.id || null;
      result.content = response && response.content || "";
      result.toolCalls = safeArray(response && response.toolCalls).map((call) => ({ name: call.name, arguments: call.arguments || {}, metadata: { providerToolCallId: call.id } }));
      result.usage = response && response.usage || null;
      result.finishReason = response && response.finishReason || null;
      result.evidence.push({ source: "ModelProviderGateway", requestId: result.requestId, responseId: result.responseId, finishReason: result.finishReason });
      this.stats.modelRequests += 1;
      this.emitLifecycle(AgentEventTypes.TURN_MODEL_RESPONSE_COMPLETED, { conversationId: conversation.id, turnId: turn.id, requestId: result.requestId, responseId: result.responseId });
    } catch (error) {
      const normalized = normalizeAgentError(error, this, "MODEL", { conversationId: conversation.id, turnId: turn.id });
      result.error = normalized;
      result.limitations.push(normalized.userMessage || normalized.message);
      this.stats.modelFailures += 1;
      if (normalized.category === ProviderErrorCategories.PRIVACY_POLICY) this.stats.privacyBlocks += 1;
    }
    return result;
  }

  buildProviderRequest(turn, conversation, context, executedTools, options = {}) {
    const privacyClassification = strictestPrivacy([
      this.configuration.defaultPrivacyClassification,
      options.privacyClassification,
      context.request && context.request.privacyClassification,
      ...executedTools.map((tool) => tool.metadata && tool.metadata.privacyClassification),
    ]);
    const prompt = {
      objective: conversation.objective || turn.userInput,
      userInput: turn.userInput,
      conversationSummary: conversationSummary(conversation, this),
      classification: turn.classification,
      activeConstraints: [
        "Do not claim source changes unless runtime execution evidence confirms them.",
        "Protected actions require explicit approval.",
        "Use only bounded context and cited evidence.",
      ],
      contextSummary: summarizeContextPackage(context.package),
      planId: turn.planId,
      toolResults: executedTools.map((call) => ({ toolId: call.toolId, name: call.name, state: call.state, output: boundedValue(call.output, 4000), evidence: call.evidence })),
      expectedOutput: { outcome: true, evidence: true, validationStatus: true, warnings: true, limitations: true, confidence: true, completeness: true },
    };
    return {
      id: this.nextId("agent-model-request", { turnId: turn.id, sequence: turn.modelRequestIds.length + 1 }),
      type: ModelRequestTypes.CHAT,
      prompt: JSON.stringify(prompt),
      messages: [{ role: "USER", content: JSON.stringify(prompt) }],
      stream: this.configuration.enableStreaming && options.stream === true,
      routingStrategy: options.routingStrategy || this.configuration.defaultRoutingStrategy,
      providerId: options.providerId || null,
      modelId: options.modelId || null,
      privacyClassification,
      maximumOutputTokens: options.maximumOutputTokens || 1024,
      tools: this.modelToolDefinitions(conversation.mode),
      metadata: { conversationId: conversation.id, turnId: turn.id, contextPackageIds: turn.contextPackageIds, planId: turn.planId },
    };
  }

  modelToolDefinitions(mode) {
    return Array.from(this.tools.values()).filter((tool) => tool.readOnly || [OrchestrationModes.APPROVAL_GATED, OrchestrationModes.EXECUTION_ENABLED].includes(mode)).map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema || { type: "object" },
      },
    })).slice(0, this.configuration.maximumToolCallsPerTurn);
  }

  handleModelStreamEvent(turn, conversation, event) {
    const normalized = {
      type: event.type || StreamEventTypes.CONTENT_DELTA,
      content: event.content || "",
      toolCalls: safeArray(event.toolCalls),
      usage: event.usage || null,
      sequence: event.sequence || turn.metadata.streamEvents && turn.metadata.streamEvents.length + 1 || 1,
      timestamp: this.now(),
    };
    turn.metadata.streamEvents = boundedArray(safeArray(turn.metadata.streamEvents).concat(normalized), this.configuration.maximumStreamEvents);
    this.emitLifecycle(AgentEventTypes.TURN_STREAM_EVENT, { conversationId: conversation.id, turnId: turn.id, event: normalized });
  }

  async validateTurn(turn, conversation, executedTools, options = {}) {
    const result = { results: [], evidence: [], warnings: [], limitations: [], failed: false };
    if (!executedTools.length) {
      result.results.push({ status: "SKIPPED", reason: "No executed tool calls required validation." });
      return result;
    }
    this.transitionTurn(turn, TurnStates.VALIDATING, AgentEventTypes.TURN_VALIDATION_STARTED);
    if (!this.runtime || !this.resolveCapabilities(["validation"]).availableCapabilities.includes("validation")) {
      result.results.push({ status: "UNAVAILABLE", reason: "Runtime validation capability is unavailable." });
      result.limitations.push("Validation skipped because validation capability is unavailable.");
      this.emitLifecycle(AgentEventTypes.TURN_VALIDATION_COMPLETED, { conversationId: conversation.id, turnId: turn.id, status: "UNAVAILABLE" });
      return result;
    }
    for (let attempt = 0; attempt < this.configuration.maximumValidationAttempts; attempt += 1) {
      try {
        const response = await this.runtime.executeCommand("execution.validate", { conversationId: conversation.id, turnId: turn.id, toolResults: executedTools }, options.validationOptions || {});
        const data = response && response.data || response;
        result.results.push(data);
        result.evidence.push({ source: "execution.validate", operationId: response && response.operationId || null, status: response && response.status || "UNKNOWN" });
        this.stats.validations += 1;
        if (response && response.success === false || data && data.status === "FAILED") {
          result.failed = true;
          this.stats.validationFailures += 1;
        }
        break;
      } catch (error) {
        result.failed = true;
        result.results.push({ status: "FAILED", error: error.message });
        result.warnings.push(`Validation failed: ${error.message}`);
        this.stats.validationFailures += 1;
      }
    }
    this.emitLifecycle(AgentEventTypes.TURN_VALIDATION_COMPLETED, { conversationId: conversation.id, turnId: turn.id, failed: result.failed });
    return result;
  }

  async repairTurn(turn, conversation, validation, options = {}) {
    const result = { results: [], evidence: [], warnings: [], limitations: [] };
    if (!validation.failed) return result;
    if (turn.repairResults.length >= this.configuration.maximumRepairAttempts) {
      result.limitations.push("Repair attempts exhausted.");
      return result;
    }
    this.transitionTurn(turn, TurnStates.REPAIRING, AgentEventTypes.TURN_REPAIR_STARTED);
    if (!this.runtime || !this.resolveCapabilities(["repair"]).availableCapabilities.includes("repair")) {
      result.limitations.push("Repair capability unavailable.");
      this.emitLifecycle(AgentEventTypes.TURN_REPAIR_COMPLETED, { conversationId: conversation.id, turnId: turn.id, status: "UNAVAILABLE" });
      return result;
    }
    try {
      const response = await this.runtime.executeCommand("execution.repair", {
        conversationId: conversation.id,
        turnId: turn.id,
        failureEvidence: validation.results,
        originalObjective: conversation.objective || turn.userInput,
      }, options.repairOptions || {});
      const data = response && response.data || response;
      result.results.push(data);
      result.evidence.push({ source: "execution.repair", operationId: response && response.operationId || null, status: response && response.status || "UNKNOWN" });
      this.stats.repairs += 1;
      if (response && response.success === false) this.stats.repairFailures += 1;
      else this.stats.repairSuccesses += 1;
    } catch (error) {
      result.results.push({ status: "FAILED", error: error.message });
      result.warnings.push(`Repair failed: ${error.message}`);
      this.stats.repairFailures += 1;
    }
    this.emitLifecycle(AgentEventTypes.TURN_REPAIR_COMPLETED, { conversationId: conversation.id, turnId: turn.id });
    return result;
  }

  synthesizeFinalResponse(turn, conversation, context) {
    const modelUnavailable = context.model.limitations.some((entry) => /provider|model/i.test(entry));
    const validationFailed = context.validation.failed;
    const approvalRequired = turn.proposedToolCalls.some((call) => call.state === ToolCallStates.WAITING_FOR_APPROVAL);
    const blocked = turn.error || turn.limitations.some((entry) => /blocked|unavailable|failed/i.test(entry));
    const outcome = approvalRequired ? "approval_required"
      : validationFailed ? "validation_failed"
        : modelUnavailable && context.executedTools.length ? "partially_completed"
          : modelUnavailable ? "provider_unavailable"
            : blocked ? "partially_completed"
              : "completed";
    const actionsTaken = context.executedTools.map((call) => `${call.name}: ${call.state}`);
    const actionsNotTaken = turn.proposedToolCalls.filter((call) => !turn.executedToolCalls.some((executed) => executed.id === call.id)).map((call) => `${call.name}: ${call.state}`);
    turn.confidence = outcome === "completed" ? 0.86 : outcome === "partially_completed" ? 0.68 : 0.45;
    turn.completeness = outcome === "completed" ? 0.9 : outcome === "partially_completed" ? 0.65 : 0.4;
    const content = context.model.content || deterministicResponse(turn, conversation, context);
    return sanitizeForFrontend({
      outcome,
      content,
      actionsTaken,
      actionsNotTaken,
      evidence: boundedArray(turn.evidence.concat(context.model.evidence || []), this.bounds.maximumContextReferences),
      validationStatus: validationFailed ? "FAILED" : context.validation.results.length ? "AVAILABLE" : "SKIPPED",
      warnings: uniqueSorted(turn.warnings.concat(context.model.warnings || [])),
      limitations: uniqueSorted(turn.limitations.concat(context.model.limitations || [])),
      nextRecommendedAction: nextActionForOutcome(outcome),
      confidence: turn.confidence,
      completeness: turn.completeness,
    });
  }

  finalizeTurnResult(turn, conversation, outcome, startedAt) {
    const elapsed = Date.now() - startedAt;
    this.updateAverages(turn, elapsed);
    if (this.configuration.enablePersistence) {
      try { this.save(); } catch (_) { /* health captures persistence failures */ }
    }
    return {
      status: outcome,
      conversation: summarizeConversation(conversation),
      turn: summarizeTurn(turn),
      response: clonePlainObject(turn.assistantResponse),
      evidence: turn.evidence.slice(),
      warnings: turn.warnings.slice(),
      limitations: turn.limitations.slice(),
      confidence: turn.confidence,
      completeness: turn.completeness,
      elapsedMs: elapsed,
    };
  }

  recordLearningSignals(conversation, turn, context) {
    if (!this.configuration.enableLearning || !this.runtime || typeof this.runtime.executeCommand !== "function") return;
    const signals = {
      conversationId: conversation.id,
      turnId: turn.id,
      classification: turn.classification,
      modelRequestIds: turn.modelRequestIds,
      successfulToolSequence: context.executedTools.filter((call) => call.state === ToolCallStates.SUCCEEDED).map((call) => call.toolId),
      rejectedToolProposals: turn.proposedToolCalls.filter((call) => call.state === ToolCallStates.REJECTED).map((call) => call.toolId),
      validationSuccess: context.validation.failed === false,
      repairSuccess: context.repair.results.some((entry) => entry && entry.status === "REPAIRED"),
      confidence: turn.confidence,
      completeness: turn.completeness,
    };
    this.stats.learningSignals += 1;
    this.emitLifecycle("agent_learning_signal_recorded", { conversationId: conversation.id, turnId: turn.id, signals: sanitizeForFrontend(signals) });
  }

  transitionTurn(turn, state, eventType) {
    turn.state = state;
    turn.updatedAt = this.now();
    if (eventType) this.emitLifecycle(eventType, { conversationId: turn.conversationId, turnId: turn.id });
  }

  cancelModelRequest(requestId, reason) {
    if (this.modelGateway && typeof this.modelGateway.cancelRequest === "function") {
      try { this.modelGateway.cancelRequest(requestId, reason); this.stats.modelCancellations += 1; } catch (_) { /* best-effort cancellation */ }
    }
  }

  findDuplicateToolCall(call, tool) {
    const signature = toolCallSignature(call, tool);
    return Array.from(this.toolCalls.values()).find((entry) => toolCallSignature(entry, this.tools.get(entry.toolId)) === signature && [ToolCallStates.SUCCEEDED, ToolCallStates.RUNNING, ToolCallStates.PROPOSED, ToolCallStates.WAITING_FOR_APPROVAL].includes(entry.state));
  }

  emitLifecycle(type, payload = {}) {
    const event = {
      id: this.nextId("agent-event", { type, count: this.events.length + 1 }),
      type,
      agentId: this.configuration.id,
      sequence: this.events.length + 1,
      timestamp: this.now(),
      payload: sanitizeForFrontend(payload),
    };
    this.events.push(event);
    trimArray(this.events, this.bounds.maximumEventHistory);
    this.emit("agent_event", clonePlainObject(event));
    for (const subscription of this.listeners.values()) {
      if (!eventMatchesFilter(event, subscription.filter)) continue;
      try { subscription.listener(clonePlainObject(event)); } catch (_) { this.stats.listenerFailures += 1; }
    }
    return event;
  }

  requireConversation(conversationId) {
    const conversation = this.conversations.get(requiredString(conversationId, "Conversation id is required."));
    if (!conversation) throw new Error(`Unknown agent conversation ${conversationId}.`);
    return conversation;
  }

  requireTurn(turnId) {
    const turn = this.turns.get(requiredString(turnId, "Turn id is required."));
    if (!turn) throw new Error(`Unknown agent turn ${turnId}.`);
    return turn;
  }

  requireTool(toolId) {
    const tool = this.tools.get(requiredString(toolId, "Tool id is required."));
    if (!tool) throw new Error(`Unknown agent tool ${toolId}.`);
    return tool;
  }

  requireToolCall(toolCallId) {
    const call = this.toolCalls.get(requiredString(toolCallId, "Tool call id is required."));
    if (!call) throw new Error(`Unknown agent tool call ${toolCallId}.`);
    return call;
  }

  nextId(prefix, seed = {}) {
    if (this.idAdapter && typeof this.idAdapter.nextId === "function") return this.idAdapter.nextId(prefix, seed);
    const countKey = `_${prefix}Count`;
    this[countKey] = (this[countKey] || 0) + 1;
    const hash = crypto.createHash("sha1").update(stableSerialize({ prefix, seed, count: this[countKey] })).digest("hex").slice(0, 8);
    return `${prefix}-${String(this[countKey]).padStart(6, "0")}-${hash}`;
  }

  now() {
    return this.clock.now();
  }
}

class FileAgentPersistenceAdapter {
  constructor(options = {}) {
    this.storagePath = options.storagePath || DEFAULT_CONFIGURATION.storagePath;
    this.clock = normalizeClock(options.clock);
  }

  save(snapshot, options = {}) {
    const filePath = options.filePath || this.storagePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, filePath);
    return { status: "PERSISTED", path: filePath, savedAt: this.clock.now() };
  }

  load(options = {}) {
    const filePath = options.filePath || this.storagePath;
    if (!fs.existsSync(filePath)) return { status: "EMPTY", path: filePath };
    try {
      return { status: "LOADED", path: filePath, snapshot: JSON.parse(fs.readFileSync(filePath, "utf8")) };
    } catch (error) {
      if (options.emptyOnCorruption) return { status: "EMPTY", path: filePath, corrupted: true, error: error.message };
      throw error;
    }
  }
}

function runtimeTool(id, name, runtimeCommandId, options = {}) {
  return {
    id,
    name: options.name || runtimeCommandId.replace(/\./g, "_"),
    description: options.description || `${name} runtime command.`,
    domain: options.domain || id.split(".")[0],
    version: "1.0.0",
    inputSchema: options.inputSchema || { type: "object" },
    outputSchema: options.outputSchema || { type: "object" },
    requiredCapabilities: options.requiredCapabilities || [],
    readOnly: options.readOnly !== false,
    sourceChanging: options.sourceChanging === true,
    commandExecuting: options.commandExecuting === true,
    securitySensitive: options.securitySensitive === true,
    approvalSensitive: options.approvalSensitive === true,
    deterministic: options.deterministic === true,
    reversible: options.reversible !== false,
    timeoutMs: options.timeoutMs || null,
    handlerType: "runtime-command",
    runtimeCommandId,
    metadata: options.metadata || {},
  };
}

function normalizeConfiguration(input = {}) {
  const merged = { ...DEFAULT_CONFIGURATION, ...(input || {}) };
  return {
    id: requiredString(merged.id, "Agent configuration id is required."),
    schemaVersion: AGENT_ORCHESTRATION_SCHEMA_VERSION,
    mode: normalizeEnum(merged.mode || OrchestrationModes.PROPOSAL_ONLY, OrchestrationModes, "orchestration mode"),
    defaultRoutingStrategy: normalizeEnum(merged.defaultRoutingStrategy || RoutingStrategies.PRIVACY_FIRST, RoutingStrategies, "routing strategy"),
    defaultPrivacyClassification: normalizeEnum(merged.defaultPrivacyClassification || PrivacyClassifications.USER_CONTENT, PrivacyClassifications, "privacy classification"),
    storagePath: String(merged.storagePath || DEFAULT_CONFIGURATION.storagePath),
    maximumTurns: positiveInteger(merged.maximumTurns, DEFAULT_CONFIGURATION.maximumTurns),
    maximumModelRequestsPerTurn: positiveInteger(merged.maximumModelRequestsPerTurn, DEFAULT_CONFIGURATION.maximumModelRequestsPerTurn),
    maximumToolCallsPerTurn: positiveInteger(merged.maximumToolCallsPerTurn, DEFAULT_CONFIGURATION.maximumToolCallsPerTurn),
    maximumTotalToolCalls: positiveInteger(merged.maximumTotalToolCalls, DEFAULT_CONFIGURATION.maximumTotalToolCalls),
    maximumRepairAttempts: positiveInteger(merged.maximumRepairAttempts, DEFAULT_CONFIGURATION.maximumRepairAttempts),
    maximumValidationAttempts: positiveInteger(merged.maximumValidationAttempts, DEFAULT_CONFIGURATION.maximumValidationAttempts),
    maximumContextPackages: positiveInteger(merged.maximumContextPackages, DEFAULT_CONFIGURATION.maximumContextPackages),
    maximumContextTokens: positiveInteger(merged.maximumContextTokens, DEFAULT_CONFIGURATION.maximumContextTokens),
    maximumConversationMessages: positiveInteger(merged.maximumConversationMessages, DEFAULT_CONFIGURATION.maximumConversationMessages),
    maximumConversationBytes: positiveInteger(merged.maximumConversationBytes, DEFAULT_CONFIGURATION.maximumConversationBytes),
    maximumStreamEvents: positiveInteger(merged.maximumStreamEvents, DEFAULT_CONFIGURATION.maximumStreamEvents),
    maximumOperationTimeMs: positiveInteger(merged.maximumOperationTimeMs, DEFAULT_CONFIGURATION.maximumOperationTimeMs),
    requirePlanForProtectedActions: merged.requirePlanForProtectedActions !== false,
    requireApprovalForProtectedActions: merged.requireApprovalForProtectedActions !== false,
    enableLearning: merged.enableLearning !== false,
    enablePersistence: merged.enablePersistence !== false,
    enableStreaming: merged.enableStreaming !== false,
    metadata: sanitizeForFrontend(merged.metadata || {}),
  };
}

function normalizeBounds(input = {}) {
  const merged = { ...DEFAULT_BOUNDS, ...(input || {}) };
  const output = {};
  for (const [key, value] of Object.entries(DEFAULT_BOUNDS)) output[key] = positiveInteger(merged[key], value);
  return output;
}

function boundsFromConfiguration(config) {
  return {
    maximumTurnsPerConversation: config.maximumTurns,
    maximumMessages: config.maximumConversationMessages,
    maximumConversationBytes: config.maximumConversationBytes,
    maximumContextPackages: config.maximumContextPackages,
    maximumToolCalls: config.maximumTotalToolCalls,
    maximumRepairAttempts: config.maximumRepairAttempts,
    maximumValidationAttempts: config.maximumValidationAttempts,
    maximumStreamEvents: config.maximumStreamEvents,
    maximumOperationDurationMs: config.maximumOperationTimeMs,
  };
}

function normalizeConversation(input = {}, engine) {
  const createdAt = input.createdAt || engine.now();
  return {
    id: input.id || engine.nextId("agent-conversation", { objective: input.objective, createdAt }),
    workspaceId: input.workspaceId || null,
    projectId: input.projectId || input.workspaceId || null,
    sessionId: input.sessionId || null,
    state: normalizeEnum(input.state || ConversationStates.CREATED, ConversationStates, "conversation state"),
    mode: normalizeEnum(input.mode || engine.configuration.mode, OrchestrationModes, "orchestration mode"),
    title: truncate(String(input.title || titleFromObjective(input.objective)), 120),
    objective: truncate(String(input.objective || ""), engine.bounds.maximumMessageCharacters),
    turns: safeArray(input.turns),
    activeTurnId: input.activeTurnId || null,
    planIds: safeArray(input.planIds),
    contextPackageIds: safeArray(input.contextPackageIds),
    modelRequestIds: safeArray(input.modelRequestIds),
    operationIds: safeArray(input.operationIds),
    approvalRequestIds: safeArray(input.approvalRequestIds),
    evidence: safeArray(input.evidence),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    confidence: numberOrFallback(input.confidence, 0.5),
    completeness: numberOrFallback(input.completeness, 0.5),
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    completedAt: input.completedAt || null,
    metadata: sanitizeForFrontend(input.metadata || {}),
  };
}

function normalizeTurn(input = {}, engine) {
  const createdAt = input.createdAt || engine.now();
  return {
    id: input.id || engine.nextId("agent-turn", { conversationId: input.conversationId, sequence: input.sequence, createdAt }),
    conversationId: requiredString(input.conversationId, "Turn conversation id is required."),
    sequence: positiveInteger(input.sequence, 1),
    state: normalizeEnum(input.state || TurnStates.CREATED, TurnStates, "turn state"),
    userInput: truncate(String(input.userInput || ""), engine.bounds.maximumMessageCharacters),
    classification: normalizeEnum(input.classification || RequestClassifications.UNKNOWN, RequestClassifications, "classification"),
    intent: sanitizeForFrontend(input.intent || {}),
    requiredCapabilities: safeArray(input.requiredCapabilities),
    contextRequest: sanitizeForFrontend(input.contextRequest || null),
    contextPackageIds: safeArray(input.contextPackageIds),
    planId: input.planId || null,
    modelRequestIds: safeArray(input.modelRequestIds),
    modelResponseIds: safeArray(input.modelResponseIds),
    proposedToolCalls: safeArray(input.proposedToolCalls),
    executedToolCalls: safeArray(input.executedToolCalls),
    validationResults: safeArray(input.validationResults),
    repairResults: safeArray(input.repairResults),
    assistantResponse: sanitizeForFrontend(input.assistantResponse || null),
    evidence: safeArray(input.evidence),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    confidence: numberOrFallback(input.confidence, 0.5),
    completeness: numberOrFallback(input.completeness, 0.5),
    error: input.error || null,
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    completedAt: input.completedAt || null,
    metadata: sanitizeForFrontend(input.metadata || {}),
  };
}

function normalizeMessage(input = {}, engine) {
  const createdAt = input.createdAt || engine.now();
  return {
    id: input.id || engine.nextId("agent-message", { conversationId: input.conversationId, role: input.role, createdAt }),
    conversationId: requiredString(input.conversationId, "Message conversation id is required."),
    turnId: input.turnId || null,
    role: normalizeMessageRole(input.role || "user"),
    content: truncate(String(input.content || ""), engine.bounds.maximumMessageCharacters),
    contentType: input.contentType || "text/plain",
    privacyClassification: normalizeEnum(input.privacyClassification || engine.configuration.defaultPrivacyClassification, PrivacyClassifications, "privacy classification"),
    sourceReferences: boundedArray(safeArray(input.sourceReferences), engine.bounds.maximumContextReferences),
    attachments: boundedArray(safeArray(input.attachments).map(sanitizeForFrontend), 16),
    toolCalls: safeArray(input.toolCalls),
    toolResults: safeArray(input.toolResults),
    metadata: sanitizeForFrontend(input.metadata || {}),
    createdAt,
  };
}

function normalizeToolDefinition(input = {}, engine) {
  const sourceChanging = input.sourceChanging === true;
  const commandExecuting = input.commandExecuting === true;
  const securitySensitive = input.securitySensitive === true || sourceChanging || commandExecuting;
  const approvalSensitive = input.approvalSensitive === true || securitySensitive || input.reversible === false;
  return {
    id: requiredString(input.id || input.name, "Tool id is required."),
    name: requiredString(input.name || input.id, "Tool name is required."),
    description: String(input.description || "Agent tool."),
    domain: String(input.domain || "custom"),
    version: String(input.version || "1.0.0"),
    inputSchema: sanitizeForFrontend(input.inputSchema || { type: "object" }),
    outputSchema: sanitizeForFrontend(input.outputSchema || { type: "object" }),
    requiredCapabilities: safeArray(input.requiredCapabilities),
    readOnly: sourceChanging || commandExecuting ? false : input.readOnly !== false,
    sourceChanging,
    commandExecuting,
    securitySensitive,
    approvalSensitive,
    deterministic: input.deterministic === true,
    reversible: input.reversible !== false && !sourceChanging,
    timeoutMs: input.timeoutMs || null,
    handlerType: input.handlerType || "runtime-command",
    runtimeCommandId: input.runtimeCommandId || null,
    metadata: sanitizeForFrontend(input.metadata || {}),
  };
}

function normalizeToolCall(input = {}, engine) {
  const createdAt = input.createdAt || engine.now();
  return {
    id: input.id || engine.nextId("agent-tool-call", { toolId: input.toolId, turnId: input.turnId, args: input.arguments }),
    conversationId: input.conversationId || null,
    turnId: input.turnId || null,
    modelRequestId: input.modelRequestId || null,
    toolId: requiredString(input.toolId || input.name, "Tool call tool id is required."),
    name: requiredString(input.name || input.toolId, "Tool call name is required."),
    arguments: sanitizeForFrontend(input.arguments || {}),
    state: normalizeEnum(input.state || ToolCallStates.PROPOSED, ToolCallStates, "tool call state"),
    approvalRequired: input.approvalRequired === true,
    approvalRequestId: input.approvalRequestId || null,
    operationId: input.operationId || null,
    output: sanitizeForFrontend(input.output || null),
    validation: sanitizeForFrontend(input.validation || null),
    evidence: safeArray(input.evidence),
    error: input.error || null,
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    completedAt: input.completedAt || null,
    metadata: sanitizeForFrontend(input.metadata || {}),
  };
}

function classifyDeterministically(text, context = {}) {
  const value = String(text || "").trim();
  const lower = value.toLowerCase();
  const intent = {
    sourceChanging: /\b(implement|change|modify|edit|write|delete|remove|refactor|fix|patch|create file|update)\b/.test(lower),
    commandExecuting: /\b(run|execute|shell|terminal|npm|test command|build command)\b/.test(lower),
    securitySensitive: /\b(secret|credential|auth|security|vulnerability|permission|token)\b/.test(lower),
    approvalSensitive: /\b(approve|approval|protected|destructive|irreversible)\b/.test(lower),
    hasValidationRequirement: /\b(test|validate|verify|check|ci)\b/.test(lower),
    requiresModel: true,
  };
  let type = RequestClassifications.QUESTION;
  if (/\b(explain|why|how does|what is)\b/.test(lower)) type = RequestClassifications.EXPLANATION;
  if (/\b(understand|summarize this file|current file|symbol|function|class)\b/.test(lower) || context.selectedFile) type = RequestClassifications.CODE_UNDERSTANDING;
  if (/\b(search|find|grep|where is)\b/.test(lower)) type = RequestClassifications.SEARCH;
  if (/\b(project|architecture|assessment|analyze|overview)\b/.test(lower)) type = RequestClassifications.PROJECT_ANALYSIS;
  if (/\b(plan|steps|roadmap)\b/.test(lower)) type = RequestClassifications.PLANNING;
  if (/\b(debug|bug|failure|failing|broken)\b/.test(lower)) type = RequestClassifications.DEBUGGING;
  if (/\b(refactor|rename|cleanup)\b/.test(lower)) type = RequestClassifications.REFACTORING;
  if (/\b(implement|feature|add support|build)\b/.test(lower)) type = RequestClassifications.FEATURE_IMPLEMENTATION;
  if (/\b(test|coverage|unit test|integration test)\b/.test(lower)) type = RequestClassifications.TESTING;
  if (/\b(validate|verify|check readiness)\b/.test(lower)) type = RequestClassifications.VALIDATION;
  if (/\b(repair|fix validation|restore)\b/.test(lower)) type = RequestClassifications.REPAIR;
  if (/\b(document|docs|readme|comment)\b/.test(lower)) type = RequestClassifications.DOCUMENTATION;
  if (/\b(security|vulnerability|threat|secret|credential)\b/.test(lower)) type = RequestClassifications.SECURITY_REVIEW;
  if (/\b(release readiness|ship|release)\b/.test(lower)) type = RequestClassifications.RELEASE_READINESS;
  return normalizeClassification({
    type,
    intent,
    confidence: value ? 0.75 : 0.2,
    evidence: [{ source: "deterministic-classifier", matchedText: value.slice(0, 120), type, intent }],
  });
}

function normalizeClassification(input = {}) {
  return {
    type: normalizeEnum(input.type || RequestClassifications.UNKNOWN, RequestClassifications, "classification"),
    intent: sanitizeForFrontend(input.intent || {}),
    confidence: numberOrFallback(input.confidence, 0.5),
    evidence: safeArray(input.evidence),
    warnings: safeArray(input.warnings),
  };
}

function prepareToolArguments(tool, call) {
  const args = { ...(call.arguments || {}) };
  if (tool.runtimeCommandId && tool.runtimeCommandId.startsWith("project.") && args.workspaceId === undefined) args.workspaceId = call.metadata && call.metadata.workspaceId || null;
  return args;
}

function terminalStateForTurn(turn) {
  if (turn.error) return TurnStates.FAILED;
  if (turn.proposedToolCalls.some((call) => call.state === ToolCallStates.WAITING_FOR_APPROVAL)) return TurnStates.PARTIALLY_SUCCEEDED;
  if (turn.validationResults.some((result) => result && result.status === "FAILED")) return TurnStates.PARTIALLY_SUCCEEDED;
  if (turn.limitations.length || turn.warnings.length) return TurnStates.PARTIALLY_SUCCEEDED;
  return TurnStates.SUCCEEDED;
}

function deterministicResponse(turn, conversation, context) {
  const toolSummaries = context.executedTools.map((call) => `${call.name} returned ${call.state}`).join("; ");
  if (context.model.limitations.length) return `Model-assisted synthesis is unavailable. ${toolSummaries || "No runtime tools were executed."}`.trim();
  return toolSummaries || `Processed ${turn.classification.toLowerCase()} request.`;
}

function purposeForClassification(type) {
  const map = {
    [RequestClassifications.DEBUGGING]: "debugging",
    [RequestClassifications.SECURITY_REVIEW]: "security",
    [RequestClassifications.PLANNING]: "planning",
    [RequestClassifications.CODE_UNDERSTANDING]: "code-understanding",
    [RequestClassifications.PROJECT_ANALYSIS]: "project-analysis",
  };
  return map[type] || "agent-turn";
}

function nextActionForOutcome(outcome) {
  if (outcome === "approval_required") return "Review the proposed tool call and approve or reject it explicitly.";
  if (outcome === "provider_unavailable") return "Configure a local or approved remote model provider, or continue with offline tools.";
  if (outcome === "validation_failed") return "Inspect validation evidence before claiming completion.";
  if (outcome === "partially_completed") return "Review warnings and limitations before continuing.";
  return "Review the evidence-backed response.";
}

function summarizeConversation(conversation) {
  return clonePlainObject({
    id: conversation.id,
    workspaceId: conversation.workspaceId,
    projectId: conversation.projectId,
    sessionId: conversation.sessionId,
    state: conversation.state,
    mode: conversation.mode,
    title: conversation.title,
    objective: truncate(conversation.objective, 500),
    turns: conversation.turns.slice(),
    activeTurnId: conversation.activeTurnId,
    planIds: conversation.planIds.slice(),
    contextPackageIds: conversation.contextPackageIds.slice(),
    modelRequestIds: conversation.modelRequestIds.slice(),
    operationIds: conversation.operationIds.slice(),
    approvalRequestIds: conversation.approvalRequestIds.slice(),
    evidence: conversation.evidence.slice(0, 32),
    warnings: conversation.warnings.slice(0, 32),
    limitations: conversation.limitations.slice(0, 32),
    confidence: conversation.confidence,
    completeness: conversation.completeness,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    completedAt: conversation.completedAt,
    metadata: conversation.metadata,
  });
}

function summarizeTurn(turn) {
  return clonePlainObject({
    id: turn.id,
    conversationId: turn.conversationId,
    sequence: turn.sequence,
    state: turn.state,
    userInput: truncate(turn.userInput, 500),
    classification: turn.classification,
    intent: turn.intent,
    requiredCapabilities: turn.requiredCapabilities,
    contextRequest: turn.contextRequest,
    contextPackageIds: turn.contextPackageIds,
    planId: turn.planId,
    modelRequestIds: turn.modelRequestIds,
    modelResponseIds: turn.modelResponseIds,
    proposedToolCalls: turn.proposedToolCalls.map(summarizeToolCall),
    executedToolCalls: turn.executedToolCalls.map(summarizeToolCall),
    validationResults: turn.validationResults,
    repairResults: turn.repairResults,
    assistantResponse: boundedValue(turn.assistantResponse, 8000),
    evidence: turn.evidence.slice(0, 32),
    warnings: turn.warnings.slice(0, 32),
    limitations: turn.limitations.slice(0, 32),
    confidence: turn.confidence,
    completeness: turn.completeness,
    error: turn.error,
    createdAt: turn.createdAt,
    updatedAt: turn.updatedAt,
    completedAt: turn.completedAt,
    metadata: turn.metadata,
  });
}

function summarizeMessage(message) {
  return clonePlainObject({ ...message, content: truncate(message.content, 500) });
}

function summarizeTool(tool) {
  return clonePlainObject(tool);
}

function summarizeToolCall(toolCall) {
  return clonePlainObject({
    id: toolCall.id,
    conversationId: toolCall.conversationId,
    turnId: toolCall.turnId,
    modelRequestId: toolCall.modelRequestId,
    toolId: toolCall.toolId,
    name: toolCall.name,
    arguments: boundedValue(toolCall.arguments, 2000),
    state: toolCall.state,
    approvalRequired: toolCall.approvalRequired,
    approvalRequestId: toolCall.approvalRequestId,
    operationId: toolCall.operationId,
    output: boundedValue(toolCall.output, 4000),
    validation: toolCall.validation,
    evidence: safeArray(toolCall.evidence).slice(0, 16),
    error: toolCall.error,
    createdAt: toolCall.createdAt,
    updatedAt: toolCall.updatedAt,
    completedAt: toolCall.completedAt,
    metadata: toolCall.metadata,
  });
}

function summarizeContextPackage(pkg) {
  if (!pkg) return null;
  return sanitizeForFrontend({
    id: pkg.id || pkg.packageId || null,
    status: pkg.status || null,
    purpose: pkg.purpose || pkg.request && pkg.request.purpose || null,
    selectedItems: safeArray(pkg.items || pkg.selectedItems).map((item) => ({ id: item.id, title: item.title, source: item.source, path: item.path, authority: item.authority })),
    omittedItems: safeArray(pkg.omitted || pkg.omissions).map((item) => ({ id: item.id, reason: item.reason })),
    estimatedTokens: pkg.estimatedTokens || pkg.tokens || null,
    findings: safeArray(pkg.findings).slice(0, 16),
  });
}

function trimConversationMessages(conversation, message, engine) {
  const ids = safeArray(conversation.metadata.messageIds).concat(message.id).slice(-engine.configuration.maximumConversationMessages);
  conversation.metadata.messageIds = ids;
  const byConversation = Array.from(engine.messages.values()).filter((entry) => entry.conversationId === conversation.id).sort(compareCreated);
  const overflow = byConversation.length - engine.configuration.maximumConversationMessages;
  for (const old of overflow > 0 ? byConversation.slice(0, overflow) : []) engine.messages.delete(old.id);
  const size = JSON.stringify(ids.map((id) => engine.messages.get(id)).filter(Boolean)).length;
  if (size > engine.configuration.maximumConversationBytes) conversation.warnings.push("Conversation message summaries were trimmed by byte bounds.");
}

function conversationSummary(conversation, engine) {
  const turns = conversation.turns.map((id) => engine.turns.get(id)).filter(Boolean).slice(-4);
  return turns.map((turn) => ({ sequence: turn.sequence, classification: turn.classification, state: turn.state, outcome: turn.assistantResponse && turn.assistantResponse.outcome })).filter(Boolean);
}

function agentHealthScores(input, warnings, blockers) {
  const scores = {
    configuration: score("configuration", 100),
    runtimeAvailability: score("runtimeAvailability", input.runtimeAvailable ? 100 : 0),
    modelGatewayAvailability: score("modelGatewayAvailability", input.modelAvailable ? 100 : 70),
    intelligenceAvailability: score("intelligenceAvailability", input.runtimeAvailable ? 90 : 40),
    contextAvailability: score("contextAvailability", input.contextAvailable ? 100 : 65),
    planningAvailability: score("planningAvailability", input.planningAvailable ? 100 : 70),
    toolAvailability: score("toolAvailability", input.toolAvailable ? 100 : 0),
    approvalIntegrity: score("approvalIntegrity", input.approvalAvailable ? 100 : 80),
    securityIntegrity: score("securityIntegrity", input.securityAvailable ? 100 : 70),
    privacyIntegrity: score("privacyIntegrity", 100),
    validationAvailability: score("validationAvailability", input.validationAvailable ? 100 : 75),
    persistenceReliability: score("persistenceReliability", input.persistenceReliable ? 100 : 70),
    conversationReliability: score("conversationReliability", input.conversationReliability),
  };
  const average = Object.values(scores).reduce((sum, entry) => sum + entry.value, 0) / Object.values(scores).length;
  scores.overallAgentHealth = score("overallAgentHealth", blockers.length ? Math.min(50, average) : warnings.length ? Math.min(90, average) : average);
  return scores;
}

function score(label, value) {
  const bounded = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return { value: bounded, deductions: bounded < 100 ? [{ reason: label, value: 100 - bounded }] : [], evidence: [{ source: "AgentOrchestrationEngine", signal: label }] };
}

function emptyStats() {
  return {
    conversationsCreated: 0,
    conversationsCompleted: 0,
    conversationsCancelled: 0,
    conversationsFailed: 0,
    turnsCreated: 0,
    turnsSucceeded: 0,
    turnsPartiallySucceeded: 0,
    turnsFailed: 0,
    turnsCancelled: 0,
    classifications: 0,
    contextPackagesRequested: 0,
    plansCreated: 0,
    modelRequests: 0,
    modelFailures: 0,
    modelCancellations: 0,
    toolCallsProposed: 0,
    toolCallsApproved: 0,
    toolCallsRejected: 0,
    toolCallsSucceeded: 0,
    toolCallsFailed: 0,
    duplicateToolCallsPrevented: 0,
    approvalRequests: 0,
    validations: 0,
    validationFailures: 0,
    repairs: 0,
    repairSuccesses: 0,
    repairFailures: 0,
    privacyBlocks: 0,
    securityBlocks: 0,
    capabilityBlocks: 0,
    noProviderTurns: 0,
    averageTurnDurationMs: 0,
    averageConfidence: 0,
    averageCompleteness: 0,
    learningSignals: 0,
    listenerFailures: 0,
    corruptedLoads: 0,
    lastConversation: null,
    lastTurn: null,
    lastFailure: null,
    lastPersistence: null,
  };
}

function normalizeAgentError(error, engine, category, input = {}) {
  const message = error && error.message || String(error || "Agent orchestration error.");
  return {
    id: input.id || engine.nextId("agent-error", { category, message }),
    category: error && error.category || category || "UNKNOWN",
    code: error && error.code || normalizeToken(message),
    message,
    userMessage: error && error.userMessage || message,
    conversationId: input.conversationId || null,
    turnId: input.turnId || null,
    toolCallId: input.toolCallId || null,
    severity: input.severity || error && error.severity || "ERROR",
    recoverable: error && error.recoverable === true,
    retryable: error && error.retryable === true,
    details: sanitizeForFrontend(error && error.details || {}),
    createdAt: engine.now(),
  };
}

function sanitizeConfigurationPatch(patch = {}) {
  const allowed = new Set(Object.keys(DEFAULT_CONFIGURATION));
  return Object.fromEntries(Object.entries(patch || {}).filter(([key]) => allowed.has(key)));
}

function strictestPrivacy(values) {
  const order = [
    PrivacyClassifications.PUBLIC,
    PrivacyClassifications.INTERNAL,
    PrivacyClassifications.REPOSITORY_METADATA,
    PrivacyClassifications.USER_CONTENT,
    PrivacyClassifications.SOURCE_CODE,
    PrivacyClassifications.SENSITIVE,
    PrivacyClassifications.SECRET,
    PrivacyClassifications.PROHIBITED_REMOTE,
  ];
  const normalized = values.filter(Boolean).map((value) => normalizeEnum(value, PrivacyClassifications, "privacy classification"));
  return normalized.sort((a, b) => order.indexOf(b) - order.indexOf(a))[0] || PrivacyClassifications.USER_CONTENT;
}

function alternativeForCapability(capability) {
  if (capability === "model provider routing") return "Continue with offline runtime tools or configure a provider.";
  if (capability === "context assembly") return "Use current user input and previously assembled context only.";
  if (capability === "planning") return "Return a proposal without creating a durable plan.";
  return `Capability ${capability} is unavailable; skip dependent tools.`;
}

function safeRuntimeData(runtime, commandId, input, fallback) {
  if (!runtime || typeof runtime.executeCommand !== "function") return fallback;
  return fallback;
}

function updateMovingAverage(current, value, count) {
  return count <= 1 ? value : ((current * (count - 1)) + value) / count;
}

AgentOrchestrationEngine.prototype.updateTurnStats = function updateTurnStats(turn, durationMs) {
  if (turn.state === TurnStates.SUCCEEDED) this.stats.turnsSucceeded += 1;
  else if (turn.state === TurnStates.PARTIALLY_SUCCEEDED) this.stats.turnsPartiallySucceeded += 1;
  else if (turn.state === TurnStates.CANCELLED) this.stats.turnsCancelled += 1;
  else this.stats.turnsFailed += 1;
  this.stats.averageTurnDurationMs = updateMovingAverage(this.stats.averageTurnDurationMs, durationMs, Math.max(1, this.stats.turnsSucceeded + this.stats.turnsPartiallySucceeded + this.stats.turnsFailed + this.stats.turnsCancelled));
};

AgentOrchestrationEngine.prototype.updateAverages = function updateAverages(turn) {
  const total = Math.max(1, this.stats.turnsSucceeded + this.stats.turnsPartiallySucceeded + this.stats.turnsFailed + this.stats.turnsCancelled);
  this.stats.averageConfidence = updateMovingAverage(this.stats.averageConfidence, turn.confidence, total);
  this.stats.averageCompleteness = updateMovingAverage(this.stats.averageCompleteness, turn.completeness, total);
};

AgentOrchestrationEngine.prototype.multiAgentCoordinator = function multiAgentCoordinator() {
  if (this.multiAgentCoordinationEngine) return this.multiAgentCoordinationEngine;
  if (this.runtime && typeof this.runtime.multiAgentEngine === "function") return this.runtime.multiAgentEngine();
  return null;
};

AgentOrchestrationEngine.prototype.getDelegationPreview = async function getDelegationPreview(turnIdOrInput, options = {}) {
  const coordinator = this.multiAgentCoordinator();
  if (!coordinator) return { status: "UNCONFIGURED", delegate: false, limitations: ["MultiAgentCoordinationEngine is unavailable."] };
  const input = typeof turnIdOrInput === "string" ? this.delegationInputForTurn(turnIdOrInput, options) : turnIdOrInput || {};
  return coordinator.getDelegationPreview(input, options);
};

AgentOrchestrationEngine.prototype.delegateTurn = async function delegateTurn(turnId, options = {}) {
  const coordinator = this.multiAgentCoordinator();
  if (!coordinator) return { status: "UNCONFIGURED", delegate: false, limitations: ["MultiAgentCoordinationEngine is unavailable."] };
  const input = this.delegationInputForTurn(turnId, options);
  const preview = coordinator.getDelegationPreview(input, options);
  if (!preview.eligibility || preview.eligibility.delegate === false) return { status: "NOT_DELEGATED", preview };
  const team = coordinator.createTeam({ ...input, plan: preview.plan }, options);
  const result = await coordinator.startTeam(team.id, options);
  const turn = this.turns.get(turnId);
  if (turn) {
    turn.metadata = { ...(turn.metadata || {}), multiAgentTeamId: team.id };
    turn.evidence = boundedArray((turn.evidence || []).concat({ source: "MultiAgentCoordinationEngine", teamId: team.id }), this.bounds.maximumContextReferences);
  }
  return { status: "DELEGATED", team: result, preview };
};

AgentOrchestrationEngine.prototype.getTeamForTurn = function getTeamForTurn(turnId) {
  const turn = this.turns.get(turnId);
  const teamId = turn && turn.metadata && turn.metadata.multiAgentTeamId;
  const coordinator = this.multiAgentCoordinator();
  return coordinator && teamId ? coordinator.getTeam(teamId) : null;
};

AgentOrchestrationEngine.prototype.cancelDelegation = function cancelDelegation(teamId, reason = "Cancelled through AgentOrchestrationEngine.") {
  const coordinator = this.multiAgentCoordinator();
  return coordinator ? coordinator.cancelTeam(teamId, reason) : { status: "UNCONFIGURED" };
};

AgentOrchestrationEngine.prototype.reconcileDelegation = function reconcileDelegation(teamId, options = {}) {
  const coordinator = this.multiAgentCoordinator();
  return coordinator ? coordinator.reconcileTeam(teamId, options) : { status: "UNCONFIGURED" };
};

AgentOrchestrationEngine.prototype.delegationInputForTurn = function delegationInputForTurn(turnId, options = {}) {
  const turn = this.getTurn(turnId);
  if (!turn) throw new Error(`Turn does not exist: ${turnId}.`);
  const conversation = this.getConversation(turn.conversationId) || {};
  return {
    objective: options.objective || turn.userInput && (turn.userInput.content || turn.userInput.message) || conversation.objective || "Coordinate agent turn.",
    workspaceId: conversation.workspaceId || options.workspaceId || null,
    projectId: conversation.projectId || options.projectId || null,
    conversationId: conversation.id || null,
    turnId,
    sourceChanging: turn.classification && turn.classification.intent && turn.classification.intent.sourceChanging || false,
    securitySensitive: turn.classification && turn.classification.intent && turn.classification.intent.securitySensitive || false,
    privacyClassification: turn.privacyClassification || this.configuration.defaultPrivacyClassification,
    scope: options.scope || {},
  };
};

AgentOrchestrationEngine.prototype.workflowCoordinator = function workflowCoordinator() {
  if (this.durableWorkflowEngine) return this.durableWorkflowEngine;
  if (this.runtime && typeof this.runtime.workflowEngine === "function") return this.runtime.workflowEngine();
  return null;
};

AgentOrchestrationEngine.prototype.createWorkflowFromTurn = async function createWorkflowFromTurn(turnId, options = {}) {
  const engine = this.workflowCoordinator();
  if (!engine) return { status: "UNCONFIGURED", workflowAvailable: false, limitations: ["DurableWorkflowEngine is unavailable."] };
  const turn = this.turns.get(turnId) || this.getTurn(turnId);
  if (!turn) throw new Error(`Turn does not exist: ${turnId}.`);
  const conversation = this.getConversation(turn.conversationId) || {};
  const objective = options.objective || turn.userInput && (turn.userInput.content || turn.userInput.message) || conversation.objective || "Execute durable agent objective.";
  const sourceChanging = turn.classification && turn.classification.intent && turn.classification.intent.sourceChanging === true || /\b(implement|edit|change|modify|patch|refactor|fix|create|delete|rename)\b/i.test(objective);
  if (options.force !== true && !sourceChanging && String(objective).split(/\s+/).length < 12) {
    return { status: "NOT_CREATED", workflowAvailable: true, reason: "Objective is simple enough for normal short-turn flow." };
  }
  const workflow = engine.createWorkflow({
    objective,
    title: options.title || `Workflow for ${conversation.title || turnId}`,
    workspaceId: conversation.workspaceId || options.workspaceId || null,
    projectId: conversation.projectId || options.projectId || null,
    conversationId: conversation.id || null,
    plan: options.plan || turn.plan || turn.metadata && turn.metadata.acceptedPlan || null,
    steps: options.steps || undefined,
    sourceChanging,
    metadata: { source: "AgentOrchestrationEngine", turnId },
  }, options);
  turn.metadata = { ...(turn.metadata || {}), workflowId: workflow.id };
  turn.evidence = boundedArray((turn.evidence || []).concat({ source: "DurableWorkflowEngine", workflowId: workflow.id }), this.bounds.maximumContextReferences);
  return { status: "WORKFLOW_CREATED", workflow };
};

AgentOrchestrationEngine.prototype.getWorkflowForTurn = function getWorkflowForTurn(turnId) {
  const turn = this.turns.get(turnId) || this.getTurn(turnId);
  const workflowId = turn && turn.metadata && turn.metadata.workflowId;
  const engine = this.workflowCoordinator();
  return engine && workflowId ? engine.getWorkflow(workflowId) : null;
};

AgentOrchestrationEngine.prototype.continueTurnWithWorkflow = async function continueTurnWithWorkflow(turnId, workflowId, options = {}) {
  const engine = this.workflowCoordinator();
  if (!engine) return { status: "UNCONFIGURED", workflowAvailable: false };
  const id = workflowId || this.getWorkflowForTurn(turnId) && this.getWorkflowForTurn(turnId).id;
  if (!id) return this.createWorkflowFromTurn(turnId, options);
  const workflow = options.start === false ? engine.getWorkflow(id) : await engine.startWorkflow(id, options);
  return { status: "WORKFLOW_CONTINUED", workflow, result: engine.getWorkflowResult(id) };
};

AgentOrchestrationEngine.prototype.cancelWorkflowForTurn = function cancelWorkflowForTurn(turnId, reason = "Cancelled through AgentOrchestrationEngine.") {
  const engine = this.workflowCoordinator();
  const workflow = this.getWorkflowForTurn(turnId);
  return engine && workflow ? engine.cancelWorkflow(workflow.id, reason) : { status: "UNCONFIGURED_OR_MISSING" };
};

function eventMatchesFilter(event, filter = {}) {
  if (filter.type && event.type !== filter.type) return false;
  if (filter.types && !safeArray(filter.types).includes(event.type)) return false;
  if (filter.conversationId && event.payload && event.payload.conversationId !== filter.conversationId) return false;
  if (filter.turnId && event.payload && event.payload.turnId !== filter.turnId) return false;
  return true;
}

function matchesFilter(record, filter = {}) {
  return Object.entries(filter || {}).every(([key, value]) => value === undefined || value === null || key === "active" || record[key] === value);
}

function normalizeMessageRole(value) {
  const role = String(value || "").toLowerCase();
  if (["user", "assistant", "system", "tool"].includes(role)) return role;
  return "user";
}

function normalizeEnum(value, table, label) {
  const raw = String(value || "").toUpperCase();
  if (Object.values(table).includes(raw)) return raw;
  if (Object.values(table).includes(value)) return value;
  throw new Error(`Invalid ${label}: ${value}.`);
}

function normalizeClock(clock = {}) {
  return { now: typeof clock.now === "function" ? () => String(clock.now()) : () => new Date().toISOString() };
}

function normalizeIdAdapter(adapter = null) {
  return adapter && typeof adapter.nextId === "function" ? adapter : null;
}

function safeArray(value) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function clonePlainObject(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sanitizeForFrontend(value, seen = new WeakSet()) {
  if (value === undefined || typeof value === "function") return undefined;
  if (value instanceof Error) return { message: value.message, category: value.category || "UNKNOWN" };
  if (value === null || typeof value !== "object") return typeof value === "string" && looksSecret(value) ? "[REDACTED]" : value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeForFrontend(entry, seen)).filter((entry) => entry !== undefined);
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (["adapter", "transport", "instance", "handler", "runtime", "stack", "authorization", "headers"].includes(key) || looksSecret(key)) {
      output[key] = "[REDACTED]";
      continue;
    }
    const sanitized = sanitizeForFrontend(value[key], seen);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function sanitizeForPersistence(value) {
  return sanitizeForFrontend(value);
}

function boundedValue(value, maximumSize) {
  const sanitized = sanitizeForFrontend(value);
  const text = JSON.stringify(sanitized);
  if (!text || text.length <= maximumSize) return sanitized;
  return { truncated: true, originalSize: text.length, preview: text.slice(0, maximumSize) };
}

function looksSecret(value) {
  return /secret|token|password|credential|api[-_]?key|authorization/i.test(String(value || ""));
}

function isSerializable(value) {
  try { JSON.stringify(value); return true; } catch (_) { return false; }
}

function requiredString(value, message) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(message);
  return value.trim();
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function numberOrFallback(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function truncate(value, max = 1000) {
  const text = String(value || "");
  return text.length <= max ? text : `${text.slice(0, max)}... [truncated]`;
}

function boundedArray(values, max) {
  return safeArray(values).slice(0, max);
}

function trimArray(values, max) {
  if (values.length > max) values.splice(0, values.length - max);
}

function uniqueSorted(values) {
  return Array.from(new Set(safeArray(values).filter(Boolean))).sort();
}

function compareById(left, right) { return left.id.localeCompare(right.id); }
function compareCreated(left, right) { return String(left.createdAt || "").localeCompare(String(right.createdAt || "")) || left.id.localeCompare(right.id); }
function compareSequence(left, right) { return left.sequence - right.sequence || compareCreated(left, right); }

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function toolCallSignature(call, tool) {
  return stableSerialize({ toolId: call.toolId, command: tool && tool.runtimeCommandId, arguments: call.arguments, workspaceRevision: call.metadata && call.metadata.workspaceRevision, planStep: call.metadata && call.metadata.planStep, contextRevision: call.metadata && call.metadata.contextRevision });
}

function normalizeToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function titleFromObjective(value) {
  return truncate(String(value || "Agent Conversation").replace(/\s+/g, " ").trim(), 80);
}

function reliabilityScore(successes, failures) {
  const total = Number(successes || 0) + Number(failures || 0);
  return total ? Number(successes || 0) / total * 100 : 100;
}

function withTimeout(promise, timeoutMs, onTimeout) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { onTimeout(); } catch (_) { /* ignore */ }
      reject(Object.assign(new Error("Agent operation timed out."), { category: "TIMEOUT" }));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function safeCall(fn, fallback) {
  try { return fn(); } catch (_) { return fallback; }
}

module.exports = {
  AGENT_ORCHESTRATION_SCHEMA_VERSION,
  AgentConversationStates: ConversationStates,
  AgentEventTypes,
  AgentOrchestrationEngine,
  AgentStates,
  ConversationStates,
  DEFAULT_BOUNDS,
  DEFAULT_CONFIGURATION,
  FileAgentPersistenceAdapter,
  OrchestrationModes,
  RequestClassifications,
  ToolCallStates,
  TurnStates,
};
