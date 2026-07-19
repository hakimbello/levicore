const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const {
  CERTIFICATION_LEVELS,
  CERTIFICATION_PROFILES,
  COMPONENT_STATUSES,
  IntelligenceIntegrationEngine,
} = require("./intelligence-integration-engine");
const { AgentOrchestrationEngine } = require("./agent-orchestration-engine");
const { ControlledWorkspaceToolEngine } = require("./controlled-workspace-tool-engine");
const { DurableWorkflowEngine } = require("./durable-workflow-engine");
const { MultiAgentCoordinationEngine } = require("./multi-agent-coordination-engine");
const { RepositoryPerformanceEngine } = require("./repository-performance-engine");
const { ReliabilityAssuranceEngine } = require("./reliability-assurance-engine");
const { SecurityAssuranceEngine } = require("./security-assurance-engine");
const { StressScalabilityEngine } = require("./stress-scalability-engine");
const { ReleaseQualificationEngine } = require("./release-qualification-engine");
const { APPROVAL_ACTIONS, APPROVAL_DECISIONS, ApprovalGateway } = require("./approval-gateway");
const { SECURITY_RESULTS, SecurityValidator } = require("./security-validator");

const APPLICATION_RUNTIME_SCHEMA_VERSION = 1;

const RuntimeStates = Object.freeze({
  CREATED: "CREATED",
  INITIALIZING: "INITIALIZING",
  READY: "READY",
  DEGRADED: "DEGRADED",
  RECOVERING: "RECOVERING",
  SUSPENDED: "SUSPENDED",
  SHUTTING_DOWN: "SHUTTING_DOWN",
  STOPPED: "STOPPED",
  FAILED: "FAILED",
});

const WorkspaceStates = Object.freeze({
  CLOSED: "CLOSED",
  OPENING: "OPENING",
  OPEN: "OPEN",
  INDEXING: "INDEXING",
  ANALYZING: "ANALYZING",
  READY: "READY",
  DEGRADED: "DEGRADED",
  CLOSING: "CLOSING",
  FAILED: "FAILED",
});

const SessionStates = Object.freeze({
  CREATED: "CREATED",
  ACTIVE: "ACTIVE",
  WAITING_FOR_APPROVAL: "WAITING_FOR_APPROVAL",
  WAITING_FOR_INPUT: "WAITING_FOR_INPUT",
  PAUSED: "PAUSED",
  CANCELLING: "CANCELLING",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  EXPIRED: "EXPIRED",
});

const OperationStates = Object.freeze({
  QUEUED: "QUEUED",
  STARTING: "STARTING",
  RUNNING: "RUNNING",
  WAITING: "WAITING",
  WAITING_FOR_APPROVAL: "WAITING_FOR_APPROVAL",
  PAUSED: "PAUSED",
  CANCELLING: "CANCELLING",
  CANCELLED: "CANCELLED",
  SUCCEEDED: "SUCCEEDED",
  PARTIALLY_SUCCEEDED: "PARTIALLY_SUCCEEDED",
  FAILED: "FAILED",
  TIMED_OUT: "TIMED_OUT",
});

const OperationTypes = Object.freeze({
  INITIALIZE_RUNTIME: "INITIALIZE_RUNTIME",
  SHUTDOWN_RUNTIME: "SHUTDOWN_RUNTIME",
  OPEN_WORKSPACE: "OPEN_WORKSPACE",
  CLOSE_WORKSPACE: "CLOSE_WORKSPACE",
  REFRESH_WORKSPACE: "REFRESH_WORKSPACE",
  ANALYZE_PROJECT: "ANALYZE_PROJECT",
  SEARCH_PROJECT: "SEARCH_PROJECT",
  QUERY_GRAPH: "QUERY_GRAPH",
  UNDERSTAND_CODE: "UNDERSTAND_CODE",
  ASSESS_PROJECT: "ASSESS_PROJECT",
  GENERATE_PROJECT_SUMMARY: "GENERATE_PROJECT_SUMMARY",
  CREATE_PLAN: "CREATE_PLAN",
  VALIDATE_PLAN: "VALIDATE_PLAN",
  BUILD_CONTEXT: "BUILD_CONTEXT",
  EXECUTE_OBJECTIVE: "EXECUTE_OBJECTIVE",
  VALIDATE_EXECUTION: "VALIDATE_EXECUTION",
  REPAIR_EXECUTION: "REPAIR_EXECUTION",
  REQUEST_APPROVAL: "REQUEST_APPROVAL",
  RESPOND_TO_APPROVAL: "RESPOND_TO_APPROVAL",
  GET_SECURITY_STATUS: "GET_SECURITY_STATUS",
  GET_RELEASE_READINESS: "GET_RELEASE_READINESS",
  GET_NEXT_ACTIONS: "GET_NEXT_ACTIONS",
  GET_LEARNING_STATE: "GET_LEARNING_STATE",
  APPLY_ADAPTATION: "APPLY_ADAPTATION",
  ROLLBACK_ADAPTATION: "ROLLBACK_ADAPTATION",
  RUN_HEALTH_CHECK: "RUN_HEALTH_CHECK",
  MODEL_PROVIDER: "MODEL_PROVIDER",
  RUN_CERTIFICATION: "RUN_CERTIFICATION",
  SAVE_STATE: "SAVE_STATE",
  RESTORE_STATE: "RESTORE_STATE",
  CUSTOM: "CUSTOM",
});

const OperationPriorities = Object.freeze({
  LOW: "LOW",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

const ErrorCategories = Object.freeze({
  CONFIGURATION: "CONFIGURATION",
  INITIALIZATION: "INITIALIZATION",
  WORKSPACE: "WORKSPACE",
  SESSION: "SESSION",
  COMMAND: "COMMAND",
  CAPABILITY: "CAPABILITY",
  ENGINE: "ENGINE",
  ADAPTER: "ADAPTER",
  VALIDATION: "VALIDATION",
  SECURITY: "SECURITY",
  APPROVAL: "APPROVAL",
  EXECUTION: "EXECUTION",
  CANCELLATION: "CANCELLATION",
  TIMEOUT: "TIMEOUT",
  PERSISTENCE: "PERSISTENCE",
  RECOVERY: "RECOVERY",
  RESOURCE_LIMIT: "RESOURCE_LIMIT",
  CONTRACT: "CONTRACT",
  UNKNOWN: "UNKNOWN",
});

const ErrorSeverities = Object.freeze({
  INFO: "INFO",
  WARNING: "WARNING",
  ERROR: "ERROR",
  CRITICAL: "CRITICAL",
});

const ApprovalStatuses = Object.freeze({
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
  FAILED: "FAILED",
});

const RuntimeEventTypes = Object.freeze({
  RUNTIME_CREATED: "runtime_created",
  RUNTIME_INITIALIZATION_STARTED: "runtime_initialization_started",
  RUNTIME_CONFIGURATION_VALIDATED: "runtime_configuration_validated",
  RUNTIME_COMPONENT_REGISTERED: "runtime_component_registered",
  RUNTIME_COMPONENT_UNAVAILABLE: "runtime_component_unavailable",
  RUNTIME_CAPABILITIES_DISCOVERED: "runtime_capabilities_discovered",
  RUNTIME_READY: "runtime_ready",
  RUNTIME_DEGRADED: "runtime_degraded",
  RUNTIME_SUSPENDED: "runtime_suspended",
  RUNTIME_RESUMED: "runtime_resumed",
  RUNTIME_SHUTDOWN_STARTED: "runtime_shutdown_started",
  RUNTIME_STOPPED: "runtime_stopped",
  RUNTIME_FAILED: "runtime_failed",
  RUNTIME_RECOVERY_STARTED: "runtime_recovery_started",
  RUNTIME_RECOVERY_COMPLETED: "runtime_recovery_completed",
  RUNTIME_RECOVERY_FAILED: "runtime_recovery_failed",
  WORKSPACE_OPEN_REQUESTED: "workspace_open_requested",
  WORKSPACE_VALIDATION_STARTED: "workspace_validation_started",
  WORKSPACE_VALIDATED: "workspace_validated",
  WORKSPACE_OPENED: "workspace_opened",
  WORKSPACE_INITIALIZATION_STARTED: "workspace_initialization_started",
  WORKSPACE_ANALYSIS_STARTED: "workspace_analysis_started",
  WORKSPACE_ANALYSIS_COMPLETED: "workspace_analysis_completed",
  WORKSPACE_READY: "workspace_ready",
  WORKSPACE_DEGRADED: "workspace_degraded",
  WORKSPACE_CLOSE_REQUESTED: "workspace_close_requested",
  WORKSPACE_CLOSED: "workspace_closed",
  WORKSPACE_FAILED: "workspace_failed",
  SESSION_CREATED: "session_created",
  SESSION_STARTED: "session_started",
  SESSION_PAUSED: "session_paused",
  SESSION_RESUMED: "session_resumed",
  SESSION_WAITING_FOR_APPROVAL: "session_waiting_for_approval",
  SESSION_CANCELLED: "session_cancelled",
  SESSION_COMPLETED: "session_completed",
  SESSION_FAILED: "session_failed",
  OPERATION_SUBMITTED: "operation_submitted",
  OPERATION_QUEUED: "operation_queued",
  OPERATION_STARTED: "operation_started",
  OPERATION_PROGRESS: "operation_progress",
  OPERATION_WAITING: "operation_waiting",
  OPERATION_WAITING_FOR_APPROVAL: "operation_waiting_for_approval",
  OPERATION_RESUMED: "operation_resumed",
  OPERATION_CANCELLATION_REQUESTED: "operation_cancellation_requested",
  OPERATION_CANCELLED: "operation_cancelled",
  OPERATION_SUCCEEDED: "operation_succeeded",
  OPERATION_PARTIALLY_SUCCEEDED: "operation_partially_succeeded",
  OPERATION_FAILED: "operation_failed",
  OPERATION_TIMED_OUT: "operation_timed_out",
  APPROVAL_REQUESTED: "approval_requested",
  APPROVAL_RESOLVED: "approval_resolved",
  APPROVAL_EXPIRED: "approval_expired",
  COMMAND_REGISTERED: "command_registered",
  COMMAND_UNREGISTERED: "command_unregistered",
  COMMAND_EXECUTION_STARTED: "command_execution_started",
  COMMAND_EXECUTION_COMPLETED: "command_execution_completed",
  COMMAND_EXECUTION_FAILED: "command_execution_failed",
  RUNTIME_HEALTH_CHECKED: "runtime_health_checked",
  RUNTIME_PERSISTED: "runtime_persisted",
  RUNTIME_RESTORED: "runtime_restored",
  RUNTIME_CORRUPTION_DETECTED: "runtime_corruption_detected",
  RUNTIME_ANALYSIS_PARTIAL: "runtime_analysis_partial",
});

const DEFAULT_CONFIGURATION = Object.freeze({
  id: "levi-application-runtime",
  version: "0.6.0",
  schemaVersion: APPLICATION_RUNTIME_SCHEMA_VERSION,
  storageRoot: ".levi",
  workspaceStorageRoot: ".levi/workspaces",
  offlineMode: true,
  strictSecurity: true,
  approvalPolicy: "SAFE_ONLY",
  defaultTimeoutMs: 30000,
  shutdownTimeoutMs: 5000,
  maximumConcurrentOperations: 2,
  maximumQueuedOperations: 128,
  maximumSessions: 64,
  maximumWorkspaces: 16,
  maximumEventHistory: 1000,
  maximumOperationHistory: 500,
  maximumResultSize: 256000,
  eventBufferSize: 256,
  persistenceEnabled: true,
  autoSaveEnabled: false,
  autoSaveIntervalMs: 60000,
  recoveryEnabled: true,
  diagnosticsEnabled: true,
  featureFlags: Object.freeze({
    refreshIndexOnOpen: true,
    refreshGraphOnOpen: true,
    refreshCodeUnderstandingOnOpen: true,
    refreshProjectIntelligenceOnOpen: true,
    allowProtectedCommandReplacement: false,
  }),
  metadata: Object.freeze({}),
});

const DEFAULT_BOUNDS = Object.freeze({
  maximumRegisteredComponents: 128,
  maximumCommands: 280,
  maximumWorkspaces: DEFAULT_CONFIGURATION.maximumWorkspaces,
  maximumSessions: DEFAULT_CONFIGURATION.maximumSessions,
  maximumOperations: 1000,
  maximumQueuedOperations: DEFAULT_CONFIGURATION.maximumQueuedOperations,
  maximumConcurrentOperations: DEFAULT_CONFIGURATION.maximumConcurrentOperations,
  maximumChildOperations: 32,
  maximumOperationDepth: 8,
  maximumEventHistory: DEFAULT_CONFIGURATION.maximumEventHistory,
  maximumListeners: 128,
  maximumResultSize: DEFAULT_CONFIGURATION.maximumResultSize,
  maximumWarningCount: 64,
  maximumEvidenceReferences: 128,
  maximumPersistedOperationHistory: 250,
  maximumPersistedSessionHistory: 250,
  maximumRecoveryAttempts: 3,
  maximumInitializationTime: 30000,
  maximumOperationTime: 30000,
  maximumShutdownTime: 5000,
});

const PRIORITY_ORDER = Object.freeze({
  [OperationPriorities.CRITICAL]: 0,
  [OperationPriorities.HIGH]: 1,
  [OperationPriorities.NORMAL]: 2,
  [OperationPriorities.LOW]: 3,
});

const STATE_TRANSITIONS = Object.freeze({
  runtime: freezeTransitions(RuntimeStates, {
    CREATED: ["INITIALIZING", "RECOVERING", "FAILED"],
    INITIALIZING: ["READY", "DEGRADED", "FAILED", "SHUTTING_DOWN"],
    READY: ["SUSPENDED", "RECOVERING", "SHUTTING_DOWN", "DEGRADED", "FAILED"],
    DEGRADED: ["READY", "SUSPENDED", "RECOVERING", "SHUTTING_DOWN", "FAILED"],
    RECOVERING: ["READY", "DEGRADED", "FAILED"],
    SUSPENDED: ["READY", "DEGRADED", "SHUTTING_DOWN", "FAILED"],
    SHUTTING_DOWN: ["STOPPED", "FAILED"],
    STOPPED: ["INITIALIZING"],
    FAILED: ["RECOVERING", "SHUTTING_DOWN"],
  }),
  workspace: freezeTransitions(WorkspaceStates, {
    CLOSED: ["OPENING"],
    OPENING: ["OPEN", "DEGRADED", "FAILED", "CLOSING"],
    OPEN: ["INDEXING", "ANALYZING", "READY", "DEGRADED", "CLOSING", "FAILED"],
    INDEXING: ["ANALYZING", "READY", "DEGRADED", "CLOSING", "FAILED"],
    ANALYZING: ["READY", "DEGRADED", "CLOSING", "FAILED"],
    READY: ["INDEXING", "ANALYZING", "DEGRADED", "CLOSING", "FAILED"],
    DEGRADED: ["READY", "CLOSING", "FAILED"],
    CLOSING: ["CLOSED", "FAILED"],
    FAILED: ["CLOSING", "OPENING"],
  }),
  session: freezeTransitions(SessionStates, {
    CREATED: ["ACTIVE", "EXPIRED", "FAILED", "CANCELLED"],
    ACTIVE: ["WAITING_FOR_APPROVAL", "WAITING_FOR_INPUT", "PAUSED", "CANCELLING", "COMPLETED", "FAILED", "EXPIRED"],
    WAITING_FOR_APPROVAL: ["ACTIVE", "CANCELLING", "FAILED", "EXPIRED"],
    WAITING_FOR_INPUT: ["ACTIVE", "CANCELLING", "FAILED", "EXPIRED"],
    PAUSED: ["ACTIVE", "CANCELLING", "FAILED", "EXPIRED"],
    CANCELLING: ["CANCELLED", "FAILED"],
    CANCELLED: [],
    COMPLETED: [],
    FAILED: [],
    EXPIRED: [],
  }),
  operation: freezeTransitions(OperationStates, {
    QUEUED: ["STARTING", "CANCELLING", "CANCELLED", "FAILED", "TIMED_OUT"],
    STARTING: ["RUNNING", "CANCELLING", "FAILED", "TIMED_OUT"],
    RUNNING: ["WAITING", "WAITING_FOR_APPROVAL", "PAUSED", "CANCELLING", "SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "TIMED_OUT"],
    WAITING: ["RUNNING", "CANCELLING", "FAILED", "TIMED_OUT"],
    WAITING_FOR_APPROVAL: ["RUNNING", "CANCELLING", "FAILED", "TIMED_OUT"],
    PAUSED: ["RUNNING", "CANCELLING", "FAILED", "TIMED_OUT"],
    CANCELLING: ["CANCELLED", "FAILED"],
    CANCELLED: [],
    SUCCEEDED: [],
    PARTIALLY_SUCCEEDED: [],
    FAILED: [],
    TIMED_OUT: [],
  }),
});

class LeviApplicationRuntime extends EventEmitter {
  constructor(options = {}) {
    super();
    this.clock = normalizeClock(options.clock);
    this.idAdapter = normalizeIdAdapter(options.idAdapter);
    this.configuration = normalizeRuntimeConfiguration(options.configuration || options.config || {});
    this.bounds = normalizeBounds({ ...options.bounds, ...boundsFromConfiguration(this.configuration) });
    this.state = RuntimeStates.CREATED;
    this.previousReadyState = RuntimeStates.READY;
    this.components = new Map();
    this.workspaceAdapters = new Map();
    this.persistenceAdapter = options.persistenceAdapter || new FileRuntimePersistenceAdapter({
      storageRoot: this.configuration.storageRoot,
      clock: this.clock,
    });
    this.eventAdapters = safeArray(options.eventAdapters);
    this.workspaces = new Map();
    this.sessions = new Map();
    this.operations = new Map();
    this.operationOrder = 0;
    this.queue = [];
    this.running = new Set();
    this.waiters = new Map();
    this.commands = new Map();
    this.aliases = new Map();
    this.approvalRequests = new Map();
    this.securityDecisions = new Map();
    this.eventLog = [];
    this.listeners = new Map();
    this.healthHistory = [];
    this.recoveryAttempts = 0;
    this.stats = emptyStats();

    this.intelligenceIntegrationEngine = options.intelligenceIntegrationEngine || options.components && options.components.IntelligenceIntegrationEngine || new IntelligenceIntegrationEngine({
      repositoryPath: options.repositoryPath || null,
      now: () => this.now(),
    });
    this.securityValidator = options.securityValidator || options.components && options.components.SecurityValidator || new SecurityValidator({ now: () => this.now() });
    this.approvalGateway = options.approvalGateway || options.components && options.components.ApprovalGateway || new ApprovalGateway({
      policy: this.configuration.approvalPolicy,
      now: () => this.now(),
    });

    this.registerComponent("IntelligenceIntegrationEngine", this.intelligenceIntegrationEngine, { required: true, protected: true });
    this.registerComponent("SecurityValidator", this.securityValidator, { required: true, protected: true });
    this.registerComponent("ApprovalGateway", this.approvalGateway, { required: true, protected: true });
    for (const [key, value] of Object.entries(options.components || {})) {
      if (value && !["IntelligenceIntegrationEngine", "SecurityValidator", "ApprovalGateway"].includes(key)) {
        this.registerComponent(key, value, descriptorForComponent(key, value));
      }
    }
    for (const component of safeArray(options.componentDescriptors)) {
      this.registerComponent(component.id || component.name, component.instance || component.adapter || component.runtime || component, component);
    }
    this.controlledWorkspaceToolEngine = options.controlledWorkspaceToolEngine || options.components && options.components.ControlledWorkspaceToolEngine || null;
    if (!this.controlledWorkspaceToolEngine && options.enableWorkspaceTools === true) {
      this.controlledWorkspaceToolEngine = new ControlledWorkspaceToolEngine({
        workspaceAdapter: options.workspaceMutationAdapter || options.workspaceToolAdapter || null,
        commandAdapter: options.commandExecutionAdapter || null,
        sourceControlAdapter: options.sourceControlAdapter || null,
        configuration: options.workspaceToolConfiguration || {},
        persistenceAdapter: options.workspaceToolPersistenceAdapter,
      });
    }
    if (this.controlledWorkspaceToolEngine && !this.components.has("ControlledWorkspaceToolEngine")) {
      this.registerComponent("ControlledWorkspaceToolEngine", this.controlledWorkspaceToolEngine, descriptorForComponent("ControlledWorkspaceToolEngine", this.controlledWorkspaceToolEngine));
    }
    this.agentOrchestrationEngine = options.agentOrchestrationEngine || options.components && options.components.AgentOrchestrationEngine || null;
    if (!this.agentOrchestrationEngine && options.enableAgentOrchestration === true) {
      const modelGatewayDescriptor = this.components.get("ModelProviderGateway");
      this.agentOrchestrationEngine = new AgentOrchestrationEngine({
        runtime: this,
        modelGateway: modelGatewayDescriptor && modelGatewayDescriptor.instance || null,
        configuration: options.agentConfiguration || {},
      });
    }
    if (this.agentOrchestrationEngine && !this.components.has("AgentOrchestrationEngine")) {
      if (!this.agentOrchestrationEngine.runtime) this.agentOrchestrationEngine.runtime = this;
      this.registerComponent("AgentOrchestrationEngine", this.agentOrchestrationEngine, descriptorForComponent("AgentOrchestrationEngine", this.agentOrchestrationEngine));
    }
    this.multiAgentCoordinationEngine = options.multiAgentCoordinationEngine || options.components && options.components.MultiAgentCoordinationEngine || null;
    if (!this.multiAgentCoordinationEngine && options.enableMultiAgentCoordination === true) {
      const modelGatewayDescriptor = this.components.get("ModelProviderGateway");
      const workspaceToolsDescriptor = this.components.get("ControlledWorkspaceToolEngine");
      this.multiAgentCoordinationEngine = new MultiAgentCoordinationEngine({
        runtime: this,
        agentOrchestrator: this.agentOrchestrationEngine,
        modelGateway: modelGatewayDescriptor && modelGatewayDescriptor.instance || null,
        workspaceTools: workspaceToolsDescriptor && workspaceToolsDescriptor.instance || null,
        configuration: options.multiAgentConfiguration || {},
        persistenceAdapter: options.multiAgentPersistenceAdapter,
      });
    }
    if (this.multiAgentCoordinationEngine && !this.components.has("MultiAgentCoordinationEngine")) {
      if (!this.multiAgentCoordinationEngine.runtime) this.multiAgentCoordinationEngine.runtime = this;
      this.registerComponent("MultiAgentCoordinationEngine", this.multiAgentCoordinationEngine, descriptorForComponent("MultiAgentCoordinationEngine", this.multiAgentCoordinationEngine));
    }
    this.durableWorkflowEngine = options.durableWorkflowEngine || options.workflowEngine || options.components && options.components.DurableWorkflowEngine || null;
    if (!this.durableWorkflowEngine && options.enableDurableWorkflows === true) {
      const modelGatewayDescriptor = this.components.get("ModelProviderGateway");
      const workspaceToolsDescriptor = this.components.get("ControlledWorkspaceToolEngine");
      this.durableWorkflowEngine = new DurableWorkflowEngine({
        runtime: this,
        agentOrchestrator: this.agentOrchestrationEngine,
        multiAgentCoordinator: this.multiAgentCoordinationEngine,
        modelGateway: modelGatewayDescriptor && modelGatewayDescriptor.instance || null,
        workspaceTools: workspaceToolsDescriptor && workspaceToolsDescriptor.instance || null,
        intelligenceIntegrationEngine: this.intelligenceIntegrationEngine,
        configuration: options.workflowConfiguration || options.durableWorkflowConfiguration || {},
        persistenceAdapter: options.workflowPersistenceAdapter || options.durableWorkflowPersistenceAdapter,
        clock: this.clock,
      });
    }
    if (this.durableWorkflowEngine && !this.components.has("DurableWorkflowEngine")) {
      if (!this.durableWorkflowEngine.runtime) this.durableWorkflowEngine.runtime = this;
      this.registerComponent("DurableWorkflowEngine", this.durableWorkflowEngine, descriptorForComponent("DurableWorkflowEngine", this.durableWorkflowEngine));
    }
    if (this.durableWorkflowEngine && typeof this.durableWorkflowEngine.subscribe === "function") {
      this.workflowEventSubscriptionId = this.durableWorkflowEngine.subscribe((event) => {
        this.publish({
          type: event.type,
          source: "DurableWorkflowEngine",
          payload: event.payload || {},
        });
      });
    }

    this.repositoryPerformanceEngine = options.repositoryPerformanceEngine || options.performanceEngine || options.components && options.components.RepositoryPerformanceEngine || null;
    if (!this.repositoryPerformanceEngine && options.enableRepositoryPerformance === true) {
      const modelGatewayDescriptor = this.components.get("ModelProviderGateway");
      const workspaceToolsDescriptor = this.components.get("ControlledWorkspaceToolEngine");
      this.repositoryPerformanceEngine = new RepositoryPerformanceEngine({
        runtime: this,
        components: options.components || {},
        configuration: options.performanceConfiguration || options.repositoryPerformanceConfiguration || {},
        persistenceAdapter: options.performancePersistenceAdapter || options.repositoryPerformancePersistenceAdapter,
        repositoryPath: options.repositoryPath || process.cwd(),
        clock: this.clock,
        modelGateway: modelGatewayDescriptor && modelGatewayDescriptor.instance || null,
        workspaceTools: workspaceToolsDescriptor && workspaceToolsDescriptor.instance || null,
        workflowEngine: this.durableWorkflowEngine,
      });
    }
    if (this.repositoryPerformanceEngine && !this.components.has("RepositoryPerformanceEngine")) {
      if (!this.repositoryPerformanceEngine.runtime) this.repositoryPerformanceEngine.runtime = this;
      this.registerComponent("RepositoryPerformanceEngine", this.repositoryPerformanceEngine, descriptorForComponent("RepositoryPerformanceEngine", this.repositoryPerformanceEngine));
    }
    if (this.repositoryPerformanceEngine && !this.repositoryPerformanceEngine.runtime) this.repositoryPerformanceEngine.runtime = this;
    if (this.repositoryPerformanceEngine && typeof this.repositoryPerformanceEngine.subscribe === "function") {
      this.performanceEventSubscriptionId = this.repositoryPerformanceEngine.subscribe((event) => {
        this.publish({
          type: event.type,
          source: "RepositoryPerformanceEngine",
          payload: event.payload || {},
        });
      });
    }

    this.reliabilityAssuranceEngine = options.reliabilityAssuranceEngine || options.reliabilityEngine || options.components && options.components.ReliabilityAssuranceEngine || null;
    if (!this.reliabilityAssuranceEngine && options.enableReliabilityAssurance === true) {
      this.reliabilityAssuranceEngine = new ReliabilityAssuranceEngine({
        runtime: this,
        components: options.components || {},
        configuration: options.reliabilityConfiguration || options.reliabilityAssuranceConfiguration || {},
        persistenceAdapter: options.reliabilityPersistenceAdapter || options.reliabilityAssurancePersistenceAdapter,
        clock: this.clock,
      });
    }
    if (this.reliabilityAssuranceEngine && !this.components.has("ReliabilityAssuranceEngine")) {
      if (!this.reliabilityAssuranceEngine.runtime) this.reliabilityAssuranceEngine.runtime = this;
      this.registerComponent("ReliabilityAssuranceEngine", this.reliabilityAssuranceEngine, descriptorForComponent("ReliabilityAssuranceEngine", this.reliabilityAssuranceEngine));
    }
    if (this.reliabilityAssuranceEngine && !this.reliabilityAssuranceEngine.runtime) this.reliabilityAssuranceEngine.runtime = this;
    if (this.reliabilityAssuranceEngine && typeof this.reliabilityAssuranceEngine.subscribe === "function") {
      this.reliabilityEventSubscriptionId = this.reliabilityAssuranceEngine.subscribe((event) => {
        this.publish({
          type: event.type,
          source: "ReliabilityAssuranceEngine",
          payload: event.payload || {},
        });
      });
    }

    this.securityAssuranceEngineInstance = options.securityAssuranceEngine || options.securityAuditEngine || options.components && options.components.SecurityAssuranceEngine || null;
    if (!this.securityAssuranceEngineInstance && options.enableSecurityAssurance === true) {
      this.securityAssuranceEngineInstance = new SecurityAssuranceEngine({
        runtime: this,
        components: options.components || {},
        configuration: options.securityAssuranceConfiguration || options.securityAuditConfiguration || {},
        persistenceAdapter: options.securityAssurancePersistenceAdapter || options.securityAuditPersistenceAdapter,
        clock: this.clock,
      });
    }
    if (this.securityAssuranceEngineInstance && !this.components.has("SecurityAssuranceEngine")) {
      if (!this.securityAssuranceEngineInstance.runtime) this.securityAssuranceEngineInstance.runtime = this;
      this.registerComponent("SecurityAssuranceEngine", this.securityAssuranceEngineInstance, descriptorForComponent("SecurityAssuranceEngine", this.securityAssuranceEngineInstance));
    }
    if (this.securityAssuranceEngineInstance && !this.securityAssuranceEngineInstance.runtime) this.securityAssuranceEngineInstance.runtime = this;
    if (this.securityAssuranceEngineInstance && typeof this.securityAssuranceEngineInstance.subscribe === "function") {
      this.securityAssuranceEventSubscriptionId = this.securityAssuranceEngineInstance.subscribe((event) => {
        this.publish({
          type: event.type,
          source: "SecurityAssuranceEngine",
          payload: event.payload || {},
        });
      });
    }

    this.stressScalabilityEngineInstance = options.stressScalabilityEngine || options.stressEngine || options.components && options.components.StressScalabilityEngine || null;
    if (!this.stressScalabilityEngineInstance && options.enableStressScalability === true) {
      this.stressScalabilityEngineInstance = new StressScalabilityEngine({
        runtime: this,
        components: options.components || {},
        configuration: options.stressScalabilityConfiguration || options.stressConfiguration || {},
        persistenceAdapter: options.stressScalabilityPersistenceAdapter || options.stressPersistenceAdapter,
        clock: this.clock,
      });
    }
    if (this.stressScalabilityEngineInstance && !this.components.has("StressScalabilityEngine")) {
      if (!this.stressScalabilityEngineInstance.runtime) this.stressScalabilityEngineInstance.runtime = this;
      this.registerComponent("StressScalabilityEngine", this.stressScalabilityEngineInstance, descriptorForComponent("StressScalabilityEngine", this.stressScalabilityEngineInstance));
    }
    if (this.stressScalabilityEngineInstance && !this.stressScalabilityEngineInstance.runtime) this.stressScalabilityEngineInstance.runtime = this;
    if (this.stressScalabilityEngineInstance && typeof this.stressScalabilityEngineInstance.subscribe === "function") {
      this.stressScalabilityEventSubscriptionId = this.stressScalabilityEngineInstance.subscribe((event) => {
        this.publish({
          type: event.type,
          source: "StressScalabilityEngine",
          payload: event.payload || {},
        });
      });
    }

    this.releaseQualificationEngineInstance = options.releaseQualificationEngine || options.qualificationEngine || options.components && options.components.ReleaseQualificationEngine || null;
    if (!this.releaseQualificationEngineInstance && options.enableReleaseQualification === true) {
      this.releaseQualificationEngineInstance = new ReleaseQualificationEngine({
        runtime: this,
        components: options.components || {},
        productExperience: options.productExperience || null,
        configuration: options.releaseQualificationConfiguration || options.qualificationConfiguration || {},
        persistenceAdapter: options.releaseQualificationPersistenceAdapter || options.qualificationPersistenceAdapter,
        fixtureAdapter: options.releaseQualificationFixtureAdapter || options.qualificationFixtureAdapter,
        extensionHostAdapter: options.extensionHostQualificationAdapter,
        localModelAdapter: options.localModelQualificationAdapter,
        clock: this.clock,
      });
    }
    if (this.releaseQualificationEngineInstance && !this.components.has("ReleaseQualificationEngine")) {
      if (!this.releaseQualificationEngineInstance.runtime) this.releaseQualificationEngineInstance.runtime = this;
      this.registerComponent("ReleaseQualificationEngine", this.releaseQualificationEngineInstance, descriptorForComponent("ReleaseQualificationEngine", this.releaseQualificationEngineInstance));
    }
    if (this.releaseQualificationEngineInstance && !this.releaseQualificationEngineInstance.runtime) this.releaseQualificationEngineInstance.runtime = this;
    if (this.releaseQualificationEngineInstance && typeof this.releaseQualificationEngineInstance.subscribe === "function") {
      this.releaseQualificationEventSubscriptionId = this.releaseQualificationEngineInstance.subscribe((event) => {
        this.publish({
          type: event.type,
          source: "ReleaseQualificationEngine",
          payload: event.payload || {},
        });
      });
    }

    const defaultWorkspaceAdapter = options.workspaceAdapter || new UriWorkspaceAdapter({ clock: this.clock });
    this.registerWorkspaceAdapter("default", defaultWorkspaceAdapter, { default: true });
    for (const [id, adapter] of Object.entries(options.workspaceAdapters || {})) {
      this.registerWorkspaceAdapter(id, adapter);
    }

    this.registerBuiltInCommands();
    this.publish({ type: RuntimeEventTypes.RUNTIME_CREATED, source: "runtime", payload: { state: this.state } });
  }

  async initialize(options = {}) {
    const operation = this.createOperation({
      type: OperationTypes.INITIALIZE_RUNTIME,
      command: "runtime.initialize",
      input: options,
      priority: OperationPriorities.CRITICAL,
    });
    this.transitionOperation(operation, OperationStates.STARTING);
    this.transitionOperation(operation, OperationStates.RUNNING);
    this.stats.initializationAttempts += 1;
    this.transitionRuntime(RuntimeStates.INITIALIZING);
    this.publish({ type: RuntimeEventTypes.RUNTIME_INITIALIZATION_STARTED, operationId: operation.id });
    try {
      const config = normalizeRuntimeConfiguration({ ...this.configuration, ...(options.configuration || {}) });
      this.configuration = config;
      validateRuntimeConfiguration(config, this.bounds);
      this.publish({ type: RuntimeEventTypes.RUNTIME_CONFIGURATION_VALIDATED, operationId: operation.id });
      this.emitRegisteredComponents();
      const capabilityState = this.discoverRuntimeCapabilities();
      this.publish({ type: RuntimeEventTypes.RUNTIME_CAPABILITIES_DISCOVERED, operationId: operation.id, payload: capabilityState });
      const health = this.evaluateRuntimeHealth({ operationId: operation.id, skipChecks: options.skipChecks === true });
      const blockers = health.blockers || [];
      const critical = blockers.some((blocker) => blocker.severity === ErrorSeverities.CRITICAL || String(blocker.severity).toUpperCase() === "CRITICAL");
      if (critical) {
        const error = this.normalizeError(new Error("Runtime initialization blocked by critical health caps."), ErrorCategories.INITIALIZATION, {
          operationId: operation.id,
          severity: ErrorSeverities.CRITICAL,
          evidence: blockers,
        });
        this.transitionRuntime(RuntimeStates.FAILED);
        this.stats.failedInitializations += 1;
        this.publish({ type: RuntimeEventTypes.RUNTIME_FAILED, operationId: operation.id, payload: { blockers, error } });
        this.finishOperation(operation, OperationStates.FAILED, health, error);
        return envelopeFor(operation, this, false, health, error);
      } else if (health.overallRuntimeHealth < 100 || health.certificationState.levelBelowIdeCoreReady || health.warnings.length > 0) {
        this.transitionRuntime(RuntimeStates.DEGRADED);
        this.stats.degradedInitializations += 1;
        this.publish({ type: RuntimeEventTypes.RUNTIME_DEGRADED, operationId: operation.id, payload: health });
      } else {
        this.transitionRuntime(RuntimeStates.READY);
        this.stats.successfulInitializations += 1;
        this.publish({ type: RuntimeEventTypes.RUNTIME_READY, operationId: operation.id, payload: health });
      }
      this.stats.lastInitialization = this.now();
      this.finishOperation(operation, OperationStates.SUCCEEDED, health);
      return envelopeFor(operation, this, this.state !== RuntimeStates.FAILED, health);
    } catch (error) {
      const normalized = this.normalizeError(error, ErrorCategories.INITIALIZATION, { operationId: operation.id, severity: ErrorSeverities.CRITICAL });
      this.transitionRuntime(RuntimeStates.FAILED);
      this.stats.failedInitializations += 1;
      this.publish({ type: RuntimeEventTypes.RUNTIME_FAILED, operationId: operation.id, payload: { error: normalized } });
      this.finishOperation(operation, OperationStates.FAILED, null, normalized);
      return envelopeFor(operation, this, false, null, normalized);
    }
  }

  async shutdown(options = {}) {
    const operation = this.createOperation({ type: OperationTypes.SHUTDOWN_RUNTIME, command: "runtime.shutdown", input: options, priority: OperationPriorities.CRITICAL });
    this.transitionOperation(operation, OperationStates.STARTING);
    this.transitionOperation(operation, OperationStates.RUNNING);
    this.transitionRuntime(RuntimeStates.SHUTTING_DOWN);
    this.publish({ type: RuntimeEventTypes.RUNTIME_SHUTDOWN_STARTED, operationId: operation.id });
    for (const queued of this.queue.splice(0)) this.cancelOperation(queued.id, "Runtime is shutting down.");
    if (this.configuration.autoSaveEnabled || options.save === true) await this.save();
    this.transitionRuntime(RuntimeStates.STOPPED);
    this.stats.lastShutdown = this.now();
    this.finishOperation(operation, OperationStates.SUCCEEDED, { state: this.state });
    this.publish({ type: RuntimeEventTypes.RUNTIME_STOPPED, operationId: operation.id });
    return envelopeFor(operation, this, true, { state: this.state });
  }

  suspend(reason = "Suspended by caller.") {
    this.previousReadyState = [RuntimeStates.DEGRADED, RuntimeStates.READY].includes(this.state) ? this.state : RuntimeStates.READY;
    this.transitionRuntime(RuntimeStates.SUSPENDED);
    this.publish({ type: RuntimeEventTypes.RUNTIME_SUSPENDED, payload: { reason } });
    return this.getState();
  }

  resume(options = {}) {
    const target = options.targetState || this.previousReadyState || RuntimeStates.READY;
    this.transitionRuntime(target);
    this.publish({ type: RuntimeEventTypes.RUNTIME_RESUMED, payload: { state: this.state } });
    this.processQueue();
    return this.getState();
  }

  recover(options = {}) {
    this.recoveryAttempts += 1;
    if (this.recoveryAttempts > this.bounds.maximumRecoveryAttempts) {
      const error = this.normalizeError(new Error("Maximum recovery attempts exceeded."), ErrorCategories.RECOVERY, { retryable: false });
      this.publish({ type: RuntimeEventTypes.RUNTIME_RECOVERY_FAILED, payload: { error } });
      this.transitionRuntime(RuntimeStates.FAILED);
      return { status: "FAILED", error };
    }
    this.transitionRuntime(RuntimeStates.RECOVERING);
    this.stats.recoveryAttempts += 1;
    this.publish({ type: RuntimeEventTypes.RUNTIME_RECOVERY_STARTED, payload: { attempt: this.recoveryAttempts } });
    try {
      const loaded = options.snapshot ? this.restore(options.snapshot) : this.load(options);
      this.state = RuntimeStates.RECOVERING;
      for (const operation of this.operations.values()) {
        if ([OperationStates.QUEUED, OperationStates.STARTING, OperationStates.RUNNING, OperationStates.WAITING, OperationStates.WAITING_FOR_APPROVAL, OperationStates.PAUSED, OperationStates.CANCELLING].includes(operation.state)) {
          operation.state = OperationStates.FAILED;
          operation.error = this.normalizeError(new Error("Operation interrupted during runtime recovery."), ErrorCategories.RECOVERY, { operationId: operation.id, recoverable: true });
          operation.completedAt = this.now();
          operation.updatedAt = operation.completedAt;
        }
      }
      this.expireApprovals();
      const health = this.evaluateRuntimeHealth({ recovery: true });
      this.transitionRuntime(health.blockers.length ? RuntimeStates.DEGRADED : RuntimeStates.READY);
      this.stats.successfulRecoveries += 1;
      this.stats.lastRecovery = this.now();
      this.publish({ type: RuntimeEventTypes.RUNTIME_RECOVERY_COMPLETED, payload: { state: this.state, health } });
      return { status: "RECOVERED", loaded, health };
    } catch (error) {
      const normalized = this.normalizeError(error, ErrorCategories.RECOVERY, { severity: ErrorSeverities.CRITICAL });
      this.stats.failedRecoveries += 1;
      this.transitionRuntime(RuntimeStates.FAILED);
      this.publish({ type: RuntimeEventTypes.RUNTIME_RECOVERY_FAILED, payload: { error: normalized } });
      return { status: "FAILED", error: normalized };
    }
  }

  getState() {
    return { state: this.state, runtimeId: this.configuration.id, updatedAt: this.now() };
  }

  getConfiguration() {
    return clonePlainObject(this.configuration);
  }

  updateConfiguration(patch, options = {}) {
    const next = normalizeRuntimeConfiguration(deepMerge(this.configuration, patch || {}));
    validateRuntimeConfiguration(next, this.bounds);
    if (options.apply !== false) this.configuration = next;
    return clonePlainObject(next);
  }

  getRuntimeHealth(options = {}) {
    const health = this.evaluateRuntimeHealth(options);
    this.publish({ type: RuntimeEventTypes.RUNTIME_HEALTH_CHECKED, payload: health });
    return health;
  }

  getRuntimeStats() {
    return {
      ...clonePlainObject(this.stats),
      queuedOperations: this.queue.length,
      runningOperations: this.running.size,
      workspaces: this.workspaces.size,
      sessions: this.sessions.size,
      operations: this.operations.size,
      commands: this.commands.size,
    };
  }

  snapshot() {
    return serializeForFrontend({
      schemaVersion: APPLICATION_RUNTIME_SCHEMA_VERSION,
      runtimeState: this.state,
      configuration: this.configuration,
      workspaces: Array.from(this.workspaces.values()),
      sessions: Array.from(this.sessions.values()).slice(-this.bounds.maximumPersistedSessionHistory),
      operations: Array.from(this.operations.values()).slice(-this.bounds.maximumPersistedOperationHistory).map(summarizeOperation),
      commands: this.listCommands().map(commandSnapshotMetadata),
      approvalRequests: Array.from(this.approvalRequests.values()),
      eventCheckpoints: this.eventLog.slice(-Math.min(32, this.configuration.eventBufferSize)).map(compactRuntimeEvent),
      runtimeHealthHistory: this.healthHistory.slice(-3).map(compactRuntimeHealth),
      statistics: this.stats,
      savedAt: this.now(),
    }, { maximumResultSize: this.bounds.maximumResultSize });
  }

  restore(snapshot) {
    const normalized = normalizeRuntimeSnapshot(snapshot);
    this.state = normalized.runtimeState;
    this.configuration = normalizeRuntimeConfiguration(normalized.configuration);
    this.workspaces = new Map(normalized.workspaces.map((workspace) => [workspace.id, normalizeWorkspaceDescriptor(workspace, this)]));
    this.sessions = new Map(normalized.sessions.map((session) => [session.id, normalizeRuntimeSession(session, this)]));
    this.operations = new Map(normalized.operations.map((operation) => [operation.id, normalizeRuntimeOperation(operation, this)]));
    this.approvalRequests = new Map(normalized.approvalRequests.map((request) => [request.id, normalizeApprovalRequest(request, this)]));
    this.eventLog = normalized.eventCheckpoints.map((event, index) => normalizeRuntimeEvent(event, this, event.sequence || index + 1));
    this.healthHistory = safeArray(normalized.runtimeHealthHistory);
    this.stats = { ...emptyStats(), ...clonePlainObject(normalized.statistics || {}) };
    this.publish({ type: RuntimeEventTypes.RUNTIME_RESTORED, payload: { workspaceCount: this.workspaces.size } });
    return { status: "RESTORED", workspaceCount: this.workspaces.size, sessionCount: this.sessions.size, operationCount: this.operations.size };
  }

  save() {
    if (!this.configuration.persistenceEnabled) return { status: "DISABLED" };
    const snapshot = this.snapshot();
    const result = this.persistenceAdapter.save(snapshot, { configuration: this.configuration });
    this.publish({ type: RuntimeEventTypes.RUNTIME_PERSISTED, payload: result });
    return result;
  }

  load(options = {}) {
    if (!this.configuration.persistenceEnabled && options.force !== true) return { status: "DISABLED" };
    try {
      const result = this.persistenceAdapter.load({ configuration: this.configuration, emptyOnMissing: true, emptyOnCorruption: true });
      if (!result || result.status === "EMPTY" || !result.snapshot) return result || { status: "EMPTY" };
      this.restore(result.snapshot);
      return { status: "LOADED", restored: true };
    } catch (error) {
      this.stats.corruptedLoads += 1;
      const normalized = this.normalizeError(error, ErrorCategories.PERSISTENCE, { recoverable: true });
      this.publish({ type: RuntimeEventTypes.RUNTIME_CORRUPTION_DETECTED, payload: { error: normalized } });
      if (options.emptyOnCorruption !== false) return { status: "EMPTY", error: normalized, recoveryRequired: true };
      throw error;
    }
  }

  async openWorkspace(input, options = {}) {
    const operation = this.createOperation({ type: OperationTypes.OPEN_WORKSPACE, command: "workspace.open", input, priority: options.priority || OperationPriorities.HIGH });
    return this.runImmediateOperation(operation, () => this.openWorkspaceInternal(input, options, operation));
  }

  async closeWorkspace(workspaceId, options = {}) {
    const operation = this.createOperation({ type: OperationTypes.CLOSE_WORKSPACE, command: "workspace.close", input: { workspaceId }, workspaceId, priority: options.priority || OperationPriorities.HIGH });
    return this.runImmediateOperation(operation, async () => {
      const workspace = this.requireWorkspace(workspaceId);
      this.transitionWorkspace(workspace, WorkspaceStates.CLOSING);
      this.publish({ type: RuntimeEventTypes.WORKSPACE_CLOSE_REQUESTED, workspaceId: workspace.id, operationId: operation.id });
      const adapter = this.resolveWorkspaceAdapter(workspace);
      if (adapter && typeof adapter.closeWorkspace === "function") await maybePromise(adapter.closeWorkspace(workspace, options));
      this.transitionWorkspace(workspace, WorkspaceStates.CLOSED);
      this.stats.workspacesClosed += 1;
      this.publish({ type: RuntimeEventTypes.WORKSPACE_CLOSED, workspaceId: workspace.id, operationId: operation.id });
      return workspace;
    });
  }

  async refreshWorkspace(workspaceId, options = {}) {
    return this.analyzeWorkspace(workspaceId, { ...options, refresh: true });
  }

  getWorkspace(workspaceId) {
    const workspace = this.workspaces.get(requiredString(workspaceId, "Workspace id is required."));
    return workspace ? clonePlainObject(workspace) : null;
  }

  listWorkspaces(filter = {}) {
    return Array.from(this.workspaces.values()).filter((workspace) => matchesFilter(workspace, filter)).sort(compareById).map(clonePlainObject);
  }

  getWorkspaceHealth(workspaceId, options = {}) {
    const workspace = this.requireWorkspace(workspaceId);
    return {
      workspaceId: workspace.id,
      state: workspace.state,
      health: clonePlainObject(workspace.health || {}),
      capabilities: this.getWorkspaceCapabilities(workspaceId, options),
      limitations: clonePlainObject(workspace.limitations || []),
      confidence: workspace.state === WorkspaceStates.READY ? 1 : workspace.state === WorkspaceStates.DEGRADED ? 0.65 : 0.4,
      completeness: workspace.state === WorkspaceStates.READY ? 1 : 0.7,
      checkedAt: this.now(),
    };
  }

  getWorkspaceCapabilities(workspaceId, options = {}) {
    this.requireWorkspace(workspaceId);
    const capabilities = this.discoverRuntimeCapabilities(options);
    return capabilities.availableCapabilities;
  }

  async analyzeWorkspace(workspaceId, options = {}) {
    const workspace = this.requireWorkspace(workspaceId);
    const operation = this.createOperation({ type: OperationTypes.ANALYZE_PROJECT, command: "workspace.analyze", input: { workspaceId, options }, workspaceId, projectId: workspace.projectId, priority: options.priority || OperationPriorities.NORMAL });
    return this.runImmediateOperation(operation, () => this.initializeWorkspace(workspace, options, operation));
  }

  createSession(input, options = {}) {
    if (this.sessions.size >= this.bounds.maximumSessions) throw this.normalizeError(new Error("Maximum sessions exceeded."), ErrorCategories.RESOURCE_LIMIT);
    const session = normalizeRuntimeSession(input, this, options);
    this.sessions.set(session.id, session);
    this.stats.sessionsCreated += 1;
    this.publish({ type: RuntimeEventTypes.SESSION_CREATED, sessionId: session.id, workspaceId: session.workspaceId, projectId: session.projectId });
    return clonePlainObject(session);
  }

  startSession(sessionId, options = {}) {
    const session = this.requireSession(sessionId);
    this.transitionSession(session, SessionStates.ACTIVE, options);
    this.publish({ type: RuntimeEventTypes.SESSION_STARTED, sessionId: session.id });
    return clonePlainObject(session);
  }

  pauseSession(sessionId, reason = "Paused by caller.") {
    const session = this.requireSession(sessionId);
    this.transitionSession(session, SessionStates.PAUSED, { metadata: { pauseReason: reason } });
    this.publish({ type: RuntimeEventTypes.SESSION_PAUSED, sessionId: session.id, payload: { reason } });
    return clonePlainObject(session);
  }

  resumeSession(sessionId, options = {}) {
    const session = this.requireSession(sessionId);
    this.transitionSession(session, SessionStates.ACTIVE, options);
    this.publish({ type: RuntimeEventTypes.SESSION_RESUMED, sessionId: session.id });
    return clonePlainObject(session);
  }

  cancelSession(sessionId, reason = "Cancelled by caller.") {
    const session = this.requireSession(sessionId);
    if (session.state === SessionStates.CANCELLED) return clonePlainObject(session);
    this.transitionSession(session, SessionStates.CANCELLING, { metadata: { cancelReason: reason } });
    for (const operationId of session.operationIds) this.cancelOperation(operationId, reason);
    this.transitionSession(session, SessionStates.CANCELLED, { metadata: { cancelReason: reason } });
    this.stats.sessionsCancelled += 1;
    this.publish({ type: RuntimeEventTypes.SESSION_CANCELLED, sessionId: session.id, payload: { reason } });
    return clonePlainObject(session);
  }

  completeSession(sessionId, result = {}) {
    const session = this.requireSession(sessionId);
    this.transitionSession(session, SessionStates.COMPLETED, { evidence: safeArray(result.evidence), metadata: result.metadata || {} });
    this.stats.sessionsCompleted += 1;
    this.publish({ type: RuntimeEventTypes.SESSION_COMPLETED, sessionId: session.id, payload: { result } });
    return clonePlainObject(session);
  }

  failSession(sessionId, error) {
    const session = this.requireSession(sessionId);
    const normalized = this.normalizeError(error, ErrorCategories.SESSION, { sessionId: session.id });
    this.transitionSession(session, SessionStates.FAILED, { metadata: { error: normalized } });
    this.stats.sessionsFailed += 1;
    this.publish({ type: RuntimeEventTypes.SESSION_FAILED, sessionId: session.id, payload: { error: normalized } });
    return clonePlainObject(session);
  }

  getSession(sessionId) {
    const session = this.sessions.get(requiredString(sessionId, "Session id is required."));
    return session ? clonePlainObject(session) : null;
  }

  listSessions(filter = {}) {
    return Array.from(this.sessions.values()).filter((session) => matchesFilter(session, filter)).sort(compareById).map(clonePlainObject);
  }

  submitOperation(input, options = {}) {
    if (this.operations.size >= this.bounds.maximumOperations) throw this.normalizeError(new Error("Maximum operations exceeded."), ErrorCategories.RESOURCE_LIMIT);
    if (this.queue.length >= this.bounds.maximumQueuedOperations) throw this.normalizeError(new Error("Maximum queued operations exceeded."), ErrorCategories.RESOURCE_LIMIT);
    const operation = this.createOperation(input, options);
    if (operation.parentOperationId) {
      const parent = this.operations.get(operation.parentOperationId);
      if (parent) {
        if (parent.childOperationIds.length >= this.bounds.maximumChildOperations) throw this.normalizeError(new Error("Maximum child operations exceeded."), ErrorCategories.RESOURCE_LIMIT, { operationId: parent.id });
        parent.childOperationIds.push(operation.id);
      }
    }
    this.queue.push(operation);
    this.sortQueue();
    this.stats.operationsSubmitted += 1;
    this.stats.operationsQueued += 1;
    this.publish({ type: RuntimeEventTypes.OPERATION_SUBMITTED, operationId: operation.id, sessionId: operation.sessionId, workspaceId: operation.workspaceId });
    this.publish({ type: RuntimeEventTypes.OPERATION_QUEUED, operationId: operation.id, sessionId: operation.sessionId, workspaceId: operation.workspaceId });
    this.processQueue();
    return clonePlainObject(operation);
  }

  async executeOperation(input, options = {}) {
    const operation = this.submitOperation(input, options);
    return this.waitForOperation(operation.id, options);
  }

  cancelOperation(operationId, reason = "Cancelled by caller.") {
    const operation = this.requireOperation(operationId);
    if ([OperationStates.CANCELLED, OperationStates.SUCCEEDED, OperationStates.PARTIALLY_SUCCEEDED, OperationStates.FAILED, OperationStates.TIMED_OUT].includes(operation.state)) {
      return clonePlainObject(operation);
    }
    operation.cancellation = { requested: true, reason, requestedAt: this.now(), safeToInterrupt: operation.state !== OperationStates.RUNNING };
    this.publish({ type: RuntimeEventTypes.OPERATION_CANCELLATION_REQUESTED, operationId: operation.id, payload: operation.cancellation });
    if (operation.state === OperationStates.QUEUED) {
      this.queue = this.queue.filter((queued) => queued.id !== operation.id);
      this.transitionOperation(operation, OperationStates.CANCELLED);
      operation.completedAt = this.now();
      this.stats.operationsCancelled += 1;
      this.publish({ type: RuntimeEventTypes.OPERATION_CANCELLED, operationId: operation.id, payload: { reason } });
      this.resolveWaiters(operation);
    } else {
      this.transitionOperation(operation, OperationStates.CANCELLING);
      this.transitionOperation(operation, OperationStates.CANCELLED);
      operation.completedAt = this.now();
      this.stats.operationsCancelled += 1;
      this.publish({ type: RuntimeEventTypes.OPERATION_CANCELLED, operationId: operation.id, payload: { reason } });
      this.resolveWaiters(operation);
    }
    for (const childId of operation.childOperationIds) this.cancelOperation(childId, reason);
    return clonePlainObject(operation);
  }

  pauseOperation(operationId, reason = "Paused by caller.") {
    const operation = this.requireOperation(operationId);
    this.transitionOperation(operation, OperationStates.PAUSED);
    operation.metadata.pauseReason = reason;
    return clonePlainObject(operation);
  }

  resumeOperation(operationId, options = {}) {
    const operation = this.requireOperation(operationId);
    if (operation.state === OperationStates.PAUSED || operation.state === OperationStates.WAITING) {
      this.transitionOperation(operation, OperationStates.RUNNING);
      this.publish({ type: RuntimeEventTypes.OPERATION_RESUMED, operationId: operation.id, payload: options });
    }
    return clonePlainObject(operation);
  }

  async retryOperation(operationId, options = {}) {
    const previous = this.requireOperation(operationId);
    if (![OperationStates.FAILED, OperationStates.TIMED_OUT, OperationStates.CANCELLED, OperationStates.PARTIALLY_SUCCEEDED].includes(previous.state)) {
      throw this.normalizeError(new Error("Only terminal incomplete operations can be retried."), ErrorCategories.VALIDATION, { operationId });
    }
    return this.executeOperation({
      sessionId: previous.sessionId,
      workspaceId: previous.workspaceId,
      projectId: previous.projectId,
      type: previous.type,
      command: previous.command,
      input: previous.input,
      priority: previous.priority,
      parentOperationId: previous.parentOperationId,
      metadata: { retryOf: operationId, ...options.metadata },
    }, options);
  }

  getOperation(operationId) {
    const operation = this.operations.get(requiredString(operationId, "Operation id is required."));
    return operation ? clonePlainObject(operation) : null;
  }

  listOperations(filter = {}) {
    return Array.from(this.operations.values()).filter((operation) => matchesFilter(operation, filter)).sort(compareOperationRecords).map(clonePlainObject);
  }

  waitForOperation(operationId, options = {}) {
    const operation = this.requireOperation(operationId);
    if (isTerminalOperation(operation.state)) return Promise.resolve(envelopeFor(operation, this, operation.state === OperationStates.SUCCEEDED || operation.state === OperationStates.PARTIALLY_SUCCEEDED, operation.result && operation.result.data, operation.error));
    const timeoutMs = normalizePositiveInteger(options.timeoutMs, this.configuration.defaultTimeoutMs);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const current = this.operations.get(operationId);
        if (current && !isTerminalOperation(current.state)) {
          this.transitionOperation(current, OperationStates.TIMED_OUT);
          current.error = this.normalizeError(new Error("Operation timed out."), ErrorCategories.TIMEOUT, { operationId });
          current.completedAt = this.now();
          this.stats.operationsTimedOut += 1;
          this.publish({ type: RuntimeEventTypes.OPERATION_TIMED_OUT, operationId, payload: { timeoutMs } });
        }
        resolve(envelopeFor(this.operations.get(operationId) || operation, this, false, null, this.operations.get(operationId) && this.operations.get(operationId).error));
      }, timeoutMs);
      const waiters = this.waiters.get(operationId) || [];
      waiters.push((finished) => {
        clearTimeout(timer);
        resolve(envelopeFor(finished, this, finished.state === OperationStates.SUCCEEDED || finished.state === OperationStates.PARTIALLY_SUCCEEDED, finished.result && finished.result.data, finished.error));
      });
      this.waiters.set(operationId, waiters);
    });
  }

  getOperationResult(operationId) {
    const operation = this.requireOperation(operationId);
    return operation.result ? clonePlainObject(operation.result) : null;
  }

  getOperationProgress(operationId) {
    const operation = this.requireOperation(operationId);
    return clonePlainObject(operation.progress);
  }

  registerCommand(command) {
    if (this.commands.size >= this.bounds.maximumCommands) throw this.normalizeError(new Error("Maximum commands exceeded."), ErrorCategories.RESOURCE_LIMIT);
    const normalized = normalizeRuntimeCommand(command, this);
    if (this.commands.has(normalized.id)) {
      const existing = this.commands.get(normalized.id);
      if (existing.protected && !this.configuration.featureFlags.allowProtectedCommandReplacement) {
        throw this.normalizeError(new Error(`Protected command already exists: ${normalized.id}.`), ErrorCategories.COMMAND);
      }
      throw this.normalizeError(new Error(`Duplicate command id: ${normalized.id}.`), ErrorCategories.COMMAND);
    }
    this.commands.set(normalized.id, normalized);
    for (const alias of safeArray(normalized.aliases)) {
      if (this.aliases.has(alias) && this.aliases.get(alias) !== normalized.id) {
        this.aliases.set(alias, null);
      } else {
        this.aliases.set(alias, normalized.id);
      }
    }
    this.publish({ type: RuntimeEventTypes.COMMAND_REGISTERED, payload: { commandId: normalized.id } });
    return commandMetadata(normalized);
  }

  unregisterCommand(commandId) {
    const id = this.resolveCommandId(commandId);
    const command = this.commands.get(id);
    if (!command) return false;
    if (command.protected && !this.configuration.featureFlags.allowProtectedCommandReplacement) {
      throw this.normalizeError(new Error(`Protected command cannot be unregistered: ${id}.`), ErrorCategories.COMMAND);
    }
    this.commands.delete(id);
    for (const [alias, target] of Array.from(this.aliases.entries())) if (target === id) this.aliases.delete(alias);
    this.publish({ type: RuntimeEventTypes.COMMAND_UNREGISTERED, payload: { commandId: id } });
    return true;
  }

  async executeCommand(commandId, input = {}, options = {}) {
    const id = this.resolveCommandId(commandId);
    const command = this.commands.get(id);
    if (!command) throw this.normalizeError(new Error(`Unknown command: ${commandId}.`), ErrorCategories.COMMAND);
    const operation = this.createOperation({
      type: command.operationType || OperationTypes.CUSTOM,
      command: command.id,
      input,
      sessionId: options.sessionId,
      workspaceId: input.workspaceId || options.workspaceId,
      projectId: input.projectId || options.projectId,
      priority: options.priority || OperationPriorities.NORMAL,
      metadata: { commandId: command.id },
    }, options);
    return this.runImmediateOperation(operation, () => this.invokeCommand(command, input, options, operation));
  }

  listCommands(filter = {}) {
    return Array.from(this.commands.values()).map((command) => this.decorateCommandAvailability(command)).filter((command) => matchesFilter(command, filter)).sort(compareById).map(commandMetadata);
  }

  getCommand(commandId) {
    const id = this.resolveCommandId(commandId);
    const command = this.commands.get(id);
    return command ? commandMetadata(this.decorateCommandAvailability(command)) : null;
  }

  query(input, options = {}) {
    const type = input && input.type || input && input.command || "project.summary";
    return this.executeCommand(type, input, options);
  }

  getProjectSummary(workspaceId, options = {}) { return this.executeCommand("project.summary", { workspaceId }, options); }
  getArchitectureState(workspaceId, options = {}) { return this.executeCommand("project.architecture", { workspaceId }, options); }
  getProjectAssessment(workspaceId, options = {}) { return this.executeCommand("project.assessment", { workspaceId }, options); }
  getReleaseReadiness(workspaceId, options = {}) { return this.executeCommand("project.releaseReadiness", { workspaceId }, options); }
  getProjectBlockers(workspaceId, options = {}) { return this.executeCommand("project.blockers", { workspaceId }, options); }
  getProjectRisks(workspaceId, options = {}) { return this.executeCommand("project.risks", { workspaceId }, options); }
  getNextActions(workspaceId, options = {}) { return this.executeCommand("project.nextActions", { workspaceId }, options); }
  searchWorkspace(workspaceId, query, options = {}) { return this.executeCommand("repository.search", { workspaceId, query }, options); }
  queryRepositoryGraph(workspaceId, query, options = {}) { return this.executeCommand("repository.graphQuery", { workspaceId, query }, options); }
  getCodeUnderstanding(workspaceId, input = {}, options = {}) { return this.executeCommand("code.understand", { workspaceId, ...input }, options); }
  getContextPackage(workspaceId, input = {}, options = {}) { return this.executeCommand("context.build", { workspaceId, ...input }, options); }
  getPlan(workspaceId, planId, options = {}) { return this.executeCommand("planning.create", { workspaceId, planId }, options); }
  getLearningState(workspaceId, options = {}) { return this.executeCommand("learning.status", { workspaceId }, options); }
  getCertificationState(options = {}) { return this.executeCommand("runtime.certification", {}, options); }

  subscribe(listener, filter = {}) {
    if (typeof listener !== "function") throw this.normalizeError(new Error("Runtime event listener must be a function."), ErrorCategories.VALIDATION);
    if (this.listeners.size >= this.bounds.maximumListeners) throw this.normalizeError(new Error("Maximum event listeners exceeded."), ErrorCategories.RESOURCE_LIMIT);
    const id = this.nextId("subscription", { filter, count: this.listeners.size + 1 });
    this.listeners.set(id, { id, listener, filter: clonePlainObject(filter || {}) });
    return id;
  }

  unsubscribe(subscriptionId) {
    return this.listeners.delete(requiredString(subscriptionId, "Subscription id is required."));
  }

  publish(event) {
    const sequence = (this.eventLog[this.eventLog.length - 1] && this.eventLog[this.eventLog.length - 1].sequence || 0) + 1;
    const normalized = normalizeRuntimeEvent({
      ...event,
      runtimeId: this.configuration.id,
      timestamp: event.timestamp || this.now(),
    }, this, sequence);
    this.eventLog.push(normalized);
    trimArray(this.eventLog, this.bounds.maximumEventHistory);
    this.stats.eventsPublished += 1;
    this.emit("runtime_event", clonePlainObject(normalized));
    for (const subscription of this.listeners.values()) {
      if (!eventMatchesFilter(normalized, subscription.filter)) continue;
      try {
        subscription.listener(clonePlainObject(normalized));
      } catch (error) {
        this.stats.listenerFailures += 1;
      }
    }
    for (const adapter of this.eventAdapters) {
      if (adapter && typeof adapter.publish === "function") {
        try { adapter.publish(clonePlainObject(normalized)); } catch (_) { this.stats.listenerFailures += 1; }
      }
    }
    return clonePlainObject(normalized);
  }

  getEvents(filter = {}) {
    return this.eventLog.filter((event) => eventMatchesFilter(event, filter)).map(clonePlainObject);
  }

  clearEvents(options = {}) {
    const before = this.eventLog.length;
    if (options.keepLast) this.eventLog = this.eventLog.slice(-normalizePositiveInteger(options.keepLast, 0));
    else this.eventLog = [];
    return { cleared: before - this.eventLog.length, remaining: this.eventLog.length };
  }

  registerComponent(id, instance, descriptor = {}) {
    const normalizedId = requiredString(id, "Component id is required.");
    if (this.components.size >= this.bounds.maximumRegisteredComponents) throw this.normalizeError(new Error("Maximum registered components exceeded."), ErrorCategories.RESOURCE_LIMIT);
    this.components.set(normalizedId, {
      id: normalizedId,
      instance,
      required: descriptor.required === true,
      protected: descriptor.protected === true,
      capabilities: safeArray(descriptor.capabilities),
      metadata: clonePlainObject(descriptor.metadata || {}),
      registeredAt: this.now(),
    });
    if (this.intelligenceIntegrationEngine && typeof this.intelligenceIntegrationEngine.registerComponent === "function" && normalizedId !== "IntelligenceIntegrationEngine") {
      try {
        this.intelligenceIntegrationEngine.registerComponent({
          id: `runtime:${normalizeToken(normalizedId)}`,
          name: normalizedId,
          capabilities: safeArray(descriptor.capabilities),
          metadata: { requiredMethods: descriptor.requiredMethods || [], domain: descriptor.domain },
          instance,
        });
      } catch (_) {
        // The runtime remains usable even if optional component advertisement is rejected.
      }
    }
    return this.components.get(normalizedId);
  }

  registerWorkspaceAdapter(id, adapter, options = {}) {
    validateWorkspaceAdapter(adapter);
    const normalizedId = requiredString(id, "Workspace adapter id is required.");
    this.workspaceAdapters.set(normalizedId, { id: normalizedId, adapter, default: options.default === true });
    return { id: normalizedId, default: options.default === true };
  }

  normalizeError(error, category = ErrorCategories.UNKNOWN, input = {}) {
    return normalizeRuntimeError(error, this, category, input);
  }

  transitionRuntime(state) {
    validateTransition(this.state, state, STATE_TRANSITIONS.runtime, "runtime");
    this.state = state;
    return this.state;
  }

  transitionWorkspace(workspace, state) {
    validateTransition(workspace.state, state, STATE_TRANSITIONS.workspace, "workspace");
    workspace.state = state;
    workspace.updatedAt = this.now();
    this.workspaces.set(workspace.id, workspace);
    return workspace;
  }

  transitionSession(session, state, input = {}) {
    validateTransition(session.state, state, STATE_TRANSITIONS.session, "session");
    session.state = state;
    session.updatedAt = this.now();
    if (input.metadata) session.metadata = { ...session.metadata, ...clonePlainObject(input.metadata) };
    if (input.evidence) session.evidence = boundedArray(session.evidence.concat(safeArray(input.evidence)), this.bounds.maximumEvidenceReferences);
    this.sessions.set(session.id, session);
    return session;
  }

  transitionOperation(operation, state) {
    validateTransition(operation.state, state, STATE_TRANSITIONS.operation, "operation");
    operation.state = state;
    if (state === OperationStates.STARTING && !operation.startedAt) operation.startedAt = this.now();
    operation.updatedAt = this.now();
    this.operations.set(operation.id, operation);
    return operation;
  }

  createOperation(input = {}, options = {}) {
    const operation = normalizeRuntimeOperation(input, this, options);
    operation.progress.operationId = operation.id;
    this.operations.set(operation.id, operation);
    const session = operation.sessionId && this.sessions.get(operation.sessionId);
    if (session && !session.operationIds.includes(operation.id)) {
      session.operationIds.push(operation.id);
      session.currentOperationId = operation.id;
      session.updatedAt = this.now();
    }
    return operation;
  }

  async runImmediateOperation(operation, fn) {
    this.transitionOperation(operation, OperationStates.STARTING);
    this.publish({ type: RuntimeEventTypes.OPERATION_STARTED, operationId: operation.id, sessionId: operation.sessionId, workspaceId: operation.workspaceId });
    this.transitionOperation(operation, OperationStates.RUNNING);
    try {
      const data = await maybePromise(fn());
      if (operation.state === OperationStates.WAITING_FOR_APPROVAL) {
        operation.output = data === undefined ? null : serializeForFrontend(data, { maximumResultSize: this.bounds.maximumResultSize });
        this.resolveWaiters(operation);
        return envelopeFor(operation, this, false, data);
      }
      if (operation.state === OperationStates.CANCELLED || operation.state === OperationStates.CANCELLING) {
        this.finishOperation(operation, OperationStates.CANCELLED, data);
        return envelopeFor(operation, this, false, data, operation.error);
      }
      const partial = Boolean(data && data.partial === true);
      this.finishOperation(operation, partial ? OperationStates.PARTIALLY_SUCCEEDED : OperationStates.SUCCEEDED, data);
      return envelopeFor(operation, this, true, data);
    } catch (error) {
      const normalized = this.normalizeError(error, ErrorCategories.EXECUTION, { operationId: operation.id, sessionId: operation.sessionId, workspaceId: operation.workspaceId });
      this.finishOperation(operation, OperationStates.FAILED, null, normalized);
      return envelopeFor(operation, this, false, null, normalized);
    }
  }

  finishOperation(operation, state, data, error = null) {
    if (!isTerminalOperation(operation.state)) this.transitionOperation(operation, state);
    operation.completedAt = operation.completedAt || this.now();
    operation.output = data === undefined ? null : serializeForFrontend(data, { maximumResultSize: this.bounds.maximumResultSize });
    operation.error = error || null;
    operation.result = normalizeRuntimeResult({
      operationId: operation.id,
      success: state === OperationStates.SUCCEEDED,
      partial: state === OperationStates.PARTIALLY_SUCCEEDED,
      status: state,
      data: operation.output,
      error,
      evidence: operation.evidence,
      confidence: state === OperationStates.SUCCEEDED ? 1 : state === OperationStates.PARTIALLY_SUCCEEDED ? 0.7 : 0,
      completeness: state === OperationStates.SUCCEEDED ? 1 : state === OperationStates.PARTIALLY_SUCCEEDED ? 0.7 : 0,
    }, this);
    this.updateFinalProgress(operation, state);
    this.stats.lastOperation = operation.completedAt;
    if (state === OperationStates.SUCCEEDED) this.stats.operationsSucceeded += 1;
    if (state === OperationStates.PARTIALLY_SUCCEEDED) this.stats.operationsPartiallySucceeded += 1;
    if (state === OperationStates.FAILED) this.stats.operationsFailed += 1;
    if (state === OperationStates.CANCELLED) this.stats.operationsCancelled += 1;
    if (state === OperationStates.TIMED_OUT) this.stats.operationsTimedOut += 1;
    this.updateAverageOperationDuration(operation);
    this.publish({
      type: eventTypeForOperationState(state),
      operationId: operation.id,
      sessionId: operation.sessionId,
      workspaceId: operation.workspaceId,
      payload: { state, resultId: operation.result.id, error },
    });
    this.resolveWaiters(operation);
    if (this.configuration.autoSaveEnabled) {
      try { this.save(); } catch (_) { /* autosave failures are visible through health */ }
    }
    return operation;
  }

  async processQueue() {
    if (![RuntimeStates.READY, RuntimeStates.DEGRADED, RuntimeStates.INITIALIZING].includes(this.state)) return;
    while (this.running.size < this.bounds.maximumConcurrentOperations && this.queue.length) {
      const operation = this.queue.shift();
      if (operation.cancellation && operation.cancellation.requested) {
        this.finishOperation(operation, OperationStates.CANCELLED, null);
        continue;
      }
      this.running.add(operation.id);
      this.executeQueuedOperation(operation).finally(() => {
        this.running.delete(operation.id);
        this.processQueue();
      });
    }
  }

  async executeQueuedOperation(operation) {
    this.transitionOperation(operation, OperationStates.STARTING);
    this.publish({ type: RuntimeEventTypes.OPERATION_STARTED, operationId: operation.id, sessionId: operation.sessionId, workspaceId: operation.workspaceId });
    this.transitionOperation(operation, OperationStates.RUNNING);
    const timeoutMs = normalizePositiveInteger(operation.metadata.timeoutMs, this.configuration.defaultTimeoutMs);
    let timer = null;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error("Operation timed out."), { category: ErrorCategories.TIMEOUT })), timeoutMs);
      });
      const work = this.dispatchOperation(operation);
      const data = await Promise.race([work, timeout]);
      clearTimeout(timer);
      if (operation.state === OperationStates.WAITING_FOR_APPROVAL) {
        operation.output = data === undefined ? null : serializeForFrontend(data, { maximumResultSize: this.bounds.maximumResultSize });
        this.resolveWaiters(operation);
        return;
      }
      this.finishOperation(operation, OperationStates.SUCCEEDED, data);
    } catch (error) {
      clearTimeout(timer);
      const category = error.category || ErrorCategories.EXECUTION;
      const state = category === ErrorCategories.TIMEOUT ? OperationStates.TIMED_OUT : OperationStates.FAILED;
      const normalized = this.normalizeError(error, category, { operationId: operation.id, sessionId: operation.sessionId, workspaceId: operation.workspaceId });
      this.finishOperation(operation, state, null, normalized);
    }
  }

  async dispatchOperation(operation) {
    if (operation.command) {
      const command = this.commands.get(operation.command);
      if (command) return this.invokeCommand(command, operation.input || {}, {}, operation);
    }
    if (operation.type === OperationTypes.OPEN_WORKSPACE) return this.openWorkspaceInternal(operation.input, {}, operation);
    if (operation.type === OperationTypes.CLOSE_WORKSPACE) return this.closeWorkspace(operation.workspaceId || operation.input.workspaceId);
    return { status: "NO_HANDLER", operationType: operation.type };
  }

  async invokeCommand(command, input, options, operation) {
    this.stats.commandsExecuted += 1;
    this.publish({ type: RuntimeEventTypes.COMMAND_EXECUTION_STARTED, operationId: operation.id, workspaceId: operation.workspaceId, payload: { commandId: command.id } });
    try {
      this.validateCommandAvailability(command, input, operation);
      await this.enforceSecurity(command, input, operation);
      const approval = await this.enforceApproval(command, input, operation);
      if (approval && approval.pending) {
        this.publish({ type: RuntimeEventTypes.COMMAND_EXECUTION_COMPLETED, operationId: operation.id, payload: { commandId: command.id, pendingApproval: approval.request.id } });
        return { partial: true, status: OperationStates.WAITING_FOR_APPROVAL, approvalRequest: approval.request };
      }
      const result = await maybePromise(command.handler(input, { runtime: this, operation, options, components: this.componentInstances() }));
      this.publish({ type: RuntimeEventTypes.COMMAND_EXECUTION_COMPLETED, operationId: operation.id, payload: { commandId: command.id } });
      return result;
    } catch (error) {
      this.stats.commandFailures += 1;
      const normalized = error && error.code && error.category ? error : this.normalizeError(error, error.category || ErrorCategories.COMMAND, { operationId: operation.id, workspaceId: operation.workspaceId });
      this.publish({ type: RuntimeEventTypes.COMMAND_EXECUTION_FAILED, operationId: operation.id, payload: { commandId: command.id, error: normalized } });
      throw normalized;
    }
  }

  async enforceSecurity(command, input, operation) {
    if (!command.securitySensitive) return null;
    if (!this.securityValidator || typeof this.securityValidator.validateAction !== "function") {
      throw this.normalizeError(new Error("Security validator is unavailable for a security-sensitive command."), ErrorCategories.SECURITY, { operationId: operation.id, severity: ErrorSeverities.CRITICAL });
    }
    const decision = this.securityValidator.validateAction({
      action: command.id,
      command: command.id,
      input: clonePlainObject(input || {}),
      workspaceId: operation.workspaceId,
      projectId: operation.projectId,
    }, { operationId: operation.id, runtimeId: this.configuration.id });
    const normalized = {
      id: this.nextId("security", { operationId: operation.id, decision }),
      operationId: operation.id,
      workspaceId: operation.workspaceId,
      projectId: operation.projectId,
      status: decision.status || SECURITY_RESULTS.SAFE,
      findings: safeArray(decision.findings),
      createdAt: this.now(),
    };
    this.securityDecisions.set(normalized.id, normalized);
    operation.security = normalized;
    operation.securityDecisionIds = uniqueSorted([...(operation.securityDecisionIds || []), normalized.id]);
    if ([SECURITY_RESULTS.BLOCKED, SECURITY_RESULTS.REQUIRES_REVIEW].includes(normalized.status)) {
      throw this.normalizeError(new Error(`Security decision ${normalized.status} blocked command ${command.id}.`), ErrorCategories.SECURITY, { operationId: operation.id, severity: normalized.status === SECURITY_RESULTS.BLOCKED ? ErrorSeverities.CRITICAL : ErrorSeverities.ERROR, evidence: normalized.findings });
    }
    return normalized;
  }

  async enforceApproval(command, input, operation) {
    if (!command.approvalSensitive) return null;
    if (!this.approvalGateway || typeof this.approvalGateway.evaluate !== "function") {
      throw this.normalizeError(new Error("Approval gateway is unavailable for an approval-sensitive command."), ErrorCategories.APPROVAL, { operationId: operation.id, severity: ErrorSeverities.CRITICAL });
    }
    if (input && input.approvalRequestId) {
      const request = this.approvalRequests.get(input.approvalRequestId);
      if (request && request.status === ApprovalStatuses.APPROVED) return { approved: true, request };
    }
    const decision = this.approvalGateway.evaluate({
      action: approvalActionForCommand(command),
      riskLevel: command.securitySensitive ? "HIGH" : "MEDIUM",
      safe: false,
      reason: `Approval is required to execute ${command.id}.`,
      metadata: { commandId: command.id, operationId: operation.id },
    }, { timestamp: this.now() });
    if (decision.decision === APPROVAL_DECISIONS.DENIED) {
      throw this.normalizeError(new Error(`Approval denied command ${command.id}.`), ErrorCategories.APPROVAL, { operationId: operation.id });
    }
    if (decision.decision === APPROVAL_DECISIONS.REQUIRES_APPROVAL) {
      const request = normalizeApprovalRequest({
        sessionId: operation.sessionId,
        operationId: operation.id,
        workspaceId: operation.workspaceId,
        projectId: operation.projectId,
        type: "COMMAND",
        title: `Approve ${command.name}`,
        description: command.description,
        requestedAction: command.id,
        risks: command.securitySensitive ? ["security-sensitive command"] : ["approval-sensitive command"],
        scope: { commandId: command.id, input: serializeForFrontend(input, { maximumResultSize: this.bounds.maximumResultSize }) },
        evidence: operation.evidence,
        status: ApprovalStatuses.PENDING,
        requestedAt: this.now(),
        expiresAt: input && input.approvalExpiresAt || null,
      }, this);
      this.approvalRequests.set(request.id, request);
      operation.approval = request;
      operation.approvalRequestIds = uniqueSorted([...(operation.approvalRequestIds || []), request.id]);
      this.transitionOperation(operation, OperationStates.WAITING_FOR_APPROVAL);
      if (operation.sessionId) {
        const session = this.sessions.get(operation.sessionId);
        if (session) {
          session.approvalRequestIds = uniqueSorted([...session.approvalRequestIds, request.id]);
          if (session.state === SessionStates.ACTIVE) this.transitionSession(session, SessionStates.WAITING_FOR_APPROVAL);
          this.publish({ type: RuntimeEventTypes.SESSION_WAITING_FOR_APPROVAL, sessionId: session.id, operationId: operation.id });
        }
      }
      this.stats.approvalsRequested += 1;
      this.publish({ type: RuntimeEventTypes.APPROVAL_REQUESTED, operationId: operation.id, sessionId: operation.sessionId, workspaceId: operation.workspaceId, payload: request });
      return { pending: true, request };
    }
    return { approved: true };
  }

  respondToApproval(input) {
    const request = this.approvalRequests.get(requiredString(input && input.approvalRequestId || input && input.id, "Approval request id is required."));
    if (!request) throw this.normalizeError(new Error("Approval request does not exist."), ErrorCategories.APPROVAL);
    if (request.status !== ApprovalStatuses.PENDING) return clonePlainObject(request);
    const decision = String(input.decision || "").toUpperCase();
    if (decision !== ApprovalStatuses.APPROVED && decision !== ApprovalStatuses.REJECTED) {
      throw this.normalizeError(new Error("Approval decision must be APPROVED or REJECTED."), ErrorCategories.APPROVAL);
    }
    request.status = decision;
    request.decision = { decision, decidedBy: input.decidedBy || "external", reason: input.reason || null, evidence: safeArray(input.evidence) };
    request.resolvedAt = this.now();
    this.approvalRequests.set(request.id, request);
    if (decision === ApprovalStatuses.APPROVED) this.stats.approvalsApproved += 1;
    if (decision === ApprovalStatuses.REJECTED) this.stats.approvalsRejected += 1;
    const operation = request.operationId && this.operations.get(request.operationId);
    if (operation) {
      operation.approval = request;
      if (decision === ApprovalStatuses.APPROVED) {
        if (operation.state === OperationStates.WAITING_FOR_APPROVAL) this.transitionOperation(operation, OperationStates.RUNNING);
        this.publish({ type: RuntimeEventTypes.OPERATION_RESUMED, operationId: operation.id, payload: { approvalRequestId: request.id } });
      } else {
        const error = this.normalizeError(new Error("Approval request was rejected."), ErrorCategories.APPROVAL, { operationId: operation.id });
        this.finishOperation(operation, OperationStates.FAILED, null, error);
      }
    }
    if (request.sessionId) {
      const session = this.sessions.get(request.sessionId);
      if (session && session.state === SessionStates.WAITING_FOR_APPROVAL && decision === ApprovalStatuses.APPROVED) this.transitionSession(session, SessionStates.ACTIVE);
      if (session && decision === ApprovalStatuses.REJECTED) this.failSession(session.id, "Approval request was rejected.");
    }
    this.publish({ type: RuntimeEventTypes.APPROVAL_RESOLVED, operationId: request.operationId, sessionId: request.sessionId, payload: request });
    return clonePlainObject(request);
  }

  async openWorkspaceInternal(input, options, operation) {
    if (this.workspaces.size >= this.bounds.maximumWorkspaces) throw this.normalizeError(new Error("Maximum workspaces exceeded."), ErrorCategories.RESOURCE_LIMIT, { operationId: operation.id });
    const adapter = this.selectWorkspaceAdapter(input);
    this.publish({ type: RuntimeEventTypes.WORKSPACE_OPEN_REQUESTED, operationId: operation.id, payload: { input: summarizeInput(input) } });
    this.progress(operation, "validate", "Validating workspace.", 1, 13);
    this.publish({ type: RuntimeEventTypes.WORKSPACE_VALIDATION_STARTED, operationId: operation.id });
    const validation = await maybePromise(adapter.validateWorkspace(input, options));
    if (validation === false || validation && validation.valid === false) throw this.normalizeError(new Error(validation && validation.message || "Workspace validation failed."), ErrorCategories.WORKSPACE, { operationId: operation.id });
    this.publish({ type: RuntimeEventTypes.WORKSPACE_VALIDATED, operationId: operation.id });
    const uri = await maybePromise(adapter.normalizeUri(input));
    const opened = adapter.openWorkspace ? await maybePromise(adapter.openWorkspace(input, options)) : {};
    const projectId = input.projectId || opened.projectId || stableId("project", uri);
    const workspace = normalizeWorkspaceDescriptor({
      ...opened,
      id: input.id || opened.id || stableId("workspace", uri),
      uri,
      name: input.name || opened.name || workspaceNameFromUri(uri),
      rootPath: input.rootPath || opened.rootPath || uri,
      projectId,
      state: WorkspaceStates.OPEN,
      repositoryType: input.repositoryType || opened.repositoryType || "unknown",
      openedAt: this.now(),
      capabilities: this.discoverRuntimeCapabilities().availableCapabilities,
      limitations: [],
      health: { status: "OPEN", evidence: [] },
      metadata: { adapterId: this.adapterIdFor(adapter), ...(input.metadata || {}), ...(opened.metadata || {}) },
    }, this);
    this.workspaces.set(workspace.id, workspace);
    this.stats.workspacesOpened += 1;
    this.publish({ type: RuntimeEventTypes.WORKSPACE_OPENED, workspaceId: workspace.id, projectId: workspace.projectId, operationId: operation.id });
    const initialized = await this.initializeWorkspace(workspace, options, operation);
    return initialized;
  }

  async initializeWorkspace(workspace, options, operation) {
    const steps = [
      ["load_persisted_state", "Load available persisted state.", () => this.loadWorkspaceState(workspace, options)],
      ["integration_health", "Inspect integration health.", () => this.safeIntegrationHealth({ skipChecks: options.fast === true })],
      ["discover_capabilities", "Discover available capabilities.", () => this.discoverRuntimeCapabilities()],
      ["repository_knowledge", "Initialize repository knowledge.", () => this.callComponent("RepositoryKnowledgeGraph", "build", workspace.rootPath, { workspace })],
      ["offline_index", "Refresh offline index.", () => this.configuration.featureFlags.refreshIndexOnOpen ? this.callComponent("OfflineKnowledgeIndex", "build", workspace.rootPath, { workspace }) : null],
      ["repository_graph", "Refresh repository graph.", () => this.configuration.featureFlags.refreshGraphOnOpen ? this.callComponent("RepositoryKnowledgeGraph", "build", workspace.rootPath, { workspace }) : null],
      ["code_understanding", "Refresh code understanding.", () => this.configuration.featureFlags.refreshCodeUnderstandingOnOpen ? this.callComponent("CodeUnderstandingEngine", "analyzeRepository", workspace.rootPath, { workspace }) : null],
      ["project_intelligence", "Refresh project intelligence.", () => this.configuration.featureFlags.refreshProjectIntelligenceOnOpen ? this.callComponent("ProjectIntelligenceEngine", "analyzeProject", workspace.projectId, { workspace }) : null],
    ];
    const evidence = [];
    const limitations = [];
    this.publish({ type: RuntimeEventTypes.WORKSPACE_INITIALIZATION_STARTED, workspaceId: workspace.id, projectId: workspace.projectId, operationId: operation.id });
    this.publish({ type: RuntimeEventTypes.WORKSPACE_ANALYSIS_STARTED, workspaceId: workspace.id, projectId: workspace.projectId, operationId: operation.id });
    this.transitionWorkspace(workspace, WorkspaceStates.ANALYZING);
    let current = 4;
    for (const [stage, message, fn] of steps) {
      if (operation.cancellation && operation.cancellation.requested) throw this.normalizeError(new Error("Workspace initialization was cancelled."), ErrorCategories.CANCELLATION, { operationId: operation.id });
      this.progress(operation, stage, message, current++, 13);
      try {
        const output = await maybePromise(fn());
        evidence.push({ stage, status: "completed", recordId: output && output.id || null });
      } catch (error) {
        limitations.push({ stage, message: error.message });
        evidence.push({ stage, status: "partial", error: error.message });
        this.publish({ type: RuntimeEventTypes.RUNTIME_ANALYSIS_PARTIAL, workspaceId: workspace.id, operationId: operation.id, payload: { stage, message: error.message } });
      }
    }
    workspace.capabilities = this.discoverRuntimeCapabilities().availableCapabilities;
    workspace.limitations = limitations;
    workspace.health = {
      status: limitations.length ? "DEGRADED" : "READY",
      evidence,
      updatedAt: this.now(),
    };
    workspace.lastAnalyzedAt = this.now();
    workspace.revision = await this.safeWorkspaceRevision(workspace);
    this.transitionWorkspace(workspace, limitations.length ? WorkspaceStates.DEGRADED : WorkspaceStates.READY);
    this.publish({ type: RuntimeEventTypes.WORKSPACE_ANALYSIS_COMPLETED, workspaceId: workspace.id, projectId: workspace.projectId, operationId: operation.id, payload: { limitations } });
    this.publish({ type: limitations.length ? RuntimeEventTypes.WORKSPACE_DEGRADED : RuntimeEventTypes.WORKSPACE_READY, workspaceId: workspace.id, projectId: workspace.projectId, operationId: operation.id, payload: workspace.health });
    return clonePlainObject(workspace);
  }

  progress(operation, stage, message, current, total, metadata = {}) {
    const previous = operation.progress || {};
    const boundedCurrent = total ? Math.min(total, Math.max(previous.current || 0, current || 0)) : current || 0;
    const percentage = total ? Math.max(previous.percentage || 0, Math.min(100, Math.round((boundedCurrent / total) * 100))) : previous.percentage || 0;
    const progress = normalizeRuntimeProgress({
      operationId: operation.id,
      stage,
      message,
      current: boundedCurrent,
      total,
      percentage,
      indeterminate: total === undefined || total === null,
      cancellable: true,
      metadata,
    }, this);
    operation.progress = progress;
    operation.currentStage = stage;
    if (!operation.stages.includes(stage)) operation.stages.push(stage);
    this.publish({ type: RuntimeEventTypes.OPERATION_PROGRESS, operationId: operation.id, sessionId: operation.sessionId, workspaceId: operation.workspaceId, payload: progress });
    return progress;
  }

  updateFinalProgress(operation, state) {
    if ([OperationStates.SUCCEEDED, OperationStates.PARTIALLY_SUCCEEDED].includes(state)) this.progress(operation, "complete", "Operation completed.", 100, 100, { final: true });
    if ([OperationStates.FAILED, OperationStates.CANCELLED, OperationStates.TIMED_OUT].includes(state)) {
      operation.progress = normalizeRuntimeProgress({ ...operation.progress, operationId: operation.id, stage: operation.currentStage || "terminal", message: `Operation ${state.toLowerCase()}.`, cancellable: false }, this);
    }
  }

  evaluateRuntimeHealth(options = {}) {
    const integrationHealth = this.safeIntegrationHealth(options);
    const capabilities = this.discoverRuntimeCapabilities(options);
    const certification = this.safeCertification(options);
    const scores = calculateRuntimeHealthScores({
      runtime: this,
      integrationHealth,
      capabilities,
      certification,
    });
    const health = {
      runtimeState: this.state,
      configurationValidity: "VALID",
      registeredComponents: Array.from(this.components.keys()).sort(),
      availableCapabilities: capabilities.availableCapabilities,
      unavailableCapabilities: capabilities.unavailableCapabilities,
      integrationHealth,
      certificationState: certification,
      workspaces: this.listWorkspaces(),
      sessions: this.listSessions(),
      queuedOperations: this.queue.length,
      runningOperations: this.running.size,
      failedOperations: this.listOperations({ state: OperationStates.FAILED }).length,
      persistenceStatus: this.configuration.persistenceEnabled ? this.persistenceAdapter.status ? this.persistenceAdapter.status() : { status: "AVAILABLE" } : { status: "DISABLED" },
      eventStatus: { listeners: this.listeners.size, history: this.eventLog.length, listenerFailures: this.stats.listenerFailures },
      securityStatus: this.securityValidator ? { status: "AVAILABLE" } : { status: "UNAVAILABLE" },
      approvalStatus: this.approvalGateway ? { status: "AVAILABLE", pending: Array.from(this.approvalRequests.values()).filter((request) => request.status === ApprovalStatuses.PENDING).length } : { status: "UNAVAILABLE" },
      warnings: scores.warnings,
      blockers: scores.blockers,
      confidence: scores.confidence,
      completeness: scores.completeness,
      scores: scores.scores,
      ...scores.summary,
      createdAt: this.now(),
    };
    this.healthHistory.push(health);
    trimArray(this.healthHistory, 20);
    this.updateAverageConfidence(health.confidence, health.completeness);
    return serializeForFrontend(health, { maximumResultSize: this.bounds.maximumResultSize });
  }

  safeIntegrationHealth(options = {}) {
    if (!this.intelligenceIntegrationEngine || typeof this.intelligenceIntegrationEngine.getPlatformHealth !== "function") return { status: "UNAVAILABLE", blockers: [] };
    try {
      return this.intelligenceIntegrationEngine.getPlatformHealth(options);
    } catch (error) {
      return { status: "FAILED", error: this.normalizeError(error, ErrorCategories.ENGINE), blockers: [error.message] };
    }
  }

  safeCertification(options = {}) {
    if (!this.intelligenceIntegrationEngine || typeof this.intelligenceIntegrationEngine.generateReadinessReport !== "function") {
      return { status: "UNAVAILABLE", currentCertificationLevel: CERTIFICATION_LEVELS.NOT_ASSESSED, levelBelowIdeCoreReady: true };
    }
    try {
      const report = this.intelligenceIntegrationEngine.generateReadinessReport({ verifyDeterminism: options.verifyDeterminism === true ? true : false });
      return {
        status: "AVAILABLE",
        currentCertificationLevel: report.currentCertificationLevel,
        ideBackendReadiness: report.ideBackendReadiness === true,
        levelBelowIdeCoreReady: levelRank(report.currentCertificationLevel) < levelRank(CERTIFICATION_LEVELS.IDE_CORE_READY),
        blockers: safeArray(report.blockers),
        requiredActions: safeArray(report.requiredActions),
        confidence: report.confidence,
        completeness: report.completeness,
      };
    } catch (error) {
      return { status: "FAILED", currentCertificationLevel: CERTIFICATION_LEVELS.NOT_ASSESSED, levelBelowIdeCoreReady: true, error: this.normalizeError(error, ErrorCategories.ENGINE) };
    }
  }

  discoverRuntimeCapabilities(options = {}) {
    const fromIntegration = this.intelligenceIntegrationEngine && typeof this.intelligenceIntegrationEngine.listCapabilities === "function"
      ? this.intelligenceIntegrationEngine.listCapabilities()
      : [];
    const componentCapabilities = Array.from(this.components.values()).flatMap((component) => safeArray(component.capabilities));
    const commandCapabilities = Array.from(this.commands.values()).flatMap((command) => command.requiredCapabilities);
    const names = uniqueSorted(fromIntegration.map((capability) => capability.name).concat(componentCapabilities, commandCapabilities));
    const available = new Set(fromIntegration.filter((capability) => ![COMPONENT_STATUSES.UNAVAILABLE, COMPONENT_STATUSES.FAILED, COMPONENT_STATUSES.INCOMPATIBLE].includes(capability.status)).map((capability) => capability.name));
    for (const capability of componentCapabilities) available.add(capability);
    return {
      availableCapabilities: names.filter((name) => available.has(name) || !commandCapabilities.includes(name)).sort(),
      unavailableCapabilities: names.filter((name) => commandCapabilities.includes(name) && !available.has(name)).sort(),
      source: "IntelligenceIntegrationEngine",
      generatedAt: this.now(),
      metadata: clonePlainObject(options.metadata || {}),
    };
  }

  registerBuiltInCommands() {
    for (const command of builtInCommandDefinitions()) this.registerCommand({ ...command, protected: true });
  }

  decorateCommandAvailability(command) {
    const capabilityState = this.discoverRuntimeCapabilities({ skipCommands: true });
    const unavailable = command.requiredCapabilities.filter((capability) => capabilityState.unavailableCapabilities.includes(capability));
    return { ...command, available: unavailable.length === 0, unavailableReason: unavailable.length ? `Missing capabilities: ${unavailable.join(", ")}` : null };
  }

  validateCommandAvailability(command, input, operation) {
    const decorated = this.decorateCommandAvailability(command);
    if (!decorated.available && command.requiredCapabilities.length) {
      throw this.normalizeError(new Error(decorated.unavailableReason), ErrorCategories.CAPABILITY, { operationId: operation.id, workspaceId: operation.workspaceId, recoverable: true });
    }
    if (command.requiredWorkspaceState && command.requiredWorkspaceState.length) {
      const workspaceId = input.workspaceId || operation.workspaceId;
      const workspace = workspaceId && this.workspaces.get(workspaceId);
      if (!workspace || !command.requiredWorkspaceState.includes(workspace.state)) {
        throw this.normalizeError(new Error(`Command ${command.id} requires workspace state ${command.requiredWorkspaceState.join(" or ")}.`), ErrorCategories.WORKSPACE, { operationId: operation.id, workspaceId });
      }
    }
    if (command.requiresSession && !operation.sessionId) {
      throw this.normalizeError(new Error(`Command ${command.id} requires a session.`), ErrorCategories.SESSION, { operationId: operation.id });
    }
  }

  resolveCommandId(commandId) {
    const id = requiredString(commandId, "Command id is required.");
    if (this.commands.has(id)) return id;
    if (this.aliases.has(id)) {
      const target = this.aliases.get(id);
      if (!target) throw this.normalizeError(new Error(`Command alias is ambiguous: ${id}.`), ErrorCategories.COMMAND);
      return target;
    }
    return id;
  }

  componentInstances() {
    return Object.fromEntries(Array.from(this.components.entries()).map(([id, descriptor]) => [id, descriptor.instance]));
  }

  callComponent(componentId, method, ...args) {
    const component = this.components.get(componentId);
    if (!component || !component.instance || typeof component.instance[method] !== "function") {
      throw new Error(`${componentId}.${method} is unavailable.`);
    }
    return component.instance[method](...args);
  }

  requireWorkspace(workspaceId) {
    const workspace = this.workspaces.get(requiredString(workspaceId, "Workspace id is required."));
    if (!workspace) throw this.normalizeError(new Error(`Workspace does not exist: ${workspaceId}.`), ErrorCategories.WORKSPACE, { workspaceId });
    return workspace;
  }

  requireSession(sessionId) {
    const session = this.sessions.get(requiredString(sessionId, "Session id is required."));
    if (!session) throw this.normalizeError(new Error(`Session does not exist: ${sessionId}.`), ErrorCategories.SESSION, { sessionId });
    return session;
  }

  requireOperation(operationId) {
    const operation = this.operations.get(requiredString(operationId, "Operation id is required."));
    if (!operation) throw this.normalizeError(new Error(`Operation does not exist: ${operationId}.`), ErrorCategories.EXECUTION, { operationId });
    return operation;
  }

  selectWorkspaceAdapter(input = {}) {
    if (input.adapterId) {
      const record = this.workspaceAdapters.get(input.adapterId);
      if (!record) throw this.normalizeError(new Error(`Workspace adapter does not exist: ${input.adapterId}.`), ErrorCategories.ADAPTER);
      return record.adapter;
    }
    const firstDefault = Array.from(this.workspaceAdapters.values()).find((record) => record.default);
    if (firstDefault) return firstDefault.adapter;
    const first = Array.from(this.workspaceAdapters.values())[0];
    if (!first) throw this.normalizeError(new Error("No workspace adapter is registered."), ErrorCategories.ADAPTER, { severity: ErrorSeverities.CRITICAL });
    return first.adapter;
  }

  resolveWorkspaceAdapter(workspace) {
    const adapterId = workspace && workspace.metadata && workspace.metadata.adapterId;
    if (adapterId && this.workspaceAdapters.has(adapterId)) return this.workspaceAdapters.get(adapterId).adapter;
    return this.selectWorkspaceAdapter({});
  }

  adapterIdFor(adapter) {
    const record = Array.from(this.workspaceAdapters.values()).find((entry) => entry.adapter === adapter);
    return record ? record.id : "default";
  }

  async safeWorkspaceRevision(workspace) {
    const adapter = this.resolveWorkspaceAdapter(workspace);
    if (adapter && typeof adapter.getWorkspaceRevision === "function") {
      try { return await maybePromise(adapter.getWorkspaceRevision(workspace)); } catch (_) { return workspace.revision || null; }
    }
    return workspace.revision || null;
  }

  loadWorkspaceState(workspace) {
    return { status: "REFERENCE_ONLY", workspaceId: workspace.id };
  }

  expireApprovals() {
    const now = Date.parse(this.now());
    for (const request of this.approvalRequests.values()) {
      if (request.status === ApprovalStatuses.PENDING && request.expiresAt && Date.parse(request.expiresAt) <= now) {
        request.status = ApprovalStatuses.EXPIRED;
        request.resolvedAt = this.now();
        this.stats.approvalsExpired += 1;
        this.publish({ type: RuntimeEventTypes.APPROVAL_EXPIRED, operationId: request.operationId, sessionId: request.sessionId, payload: request });
      }
    }
  }

  emitRegisteredComponents() {
    for (const id of Array.from(this.components.keys()).sort()) {
      this.publish({ type: RuntimeEventTypes.RUNTIME_COMPONENT_REGISTERED, payload: { componentId: id } });
    }
  }

  sortQueue() {
    this.queue.sort((left, right) => PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] || left.sequence - right.sequence);
  }

  resolveWaiters(operation) {
    const waiters = this.waiters.get(operation.id) || [];
    this.waiters.delete(operation.id);
    for (const resolve of waiters) resolve(clonePlainObject(operation));
  }

  nextId(prefix, input = {}) {
    return this.idAdapter.next(prefix, { ...input, runtimeId: this.configuration.id });
  }

  now() {
    const value = this.clock.now();
    return typeof value === "string" ? new Date(value).toISOString() : new Date(value).toISOString();
  }

  updateAverageOperationDuration(operation) {
    if (!operation.startedAt || !operation.completedAt) return;
    const duration = Math.max(0, Date.parse(operation.completedAt) - Date.parse(operation.startedAt || operation.createdAt));
    this.stats.averageOperationDuration = runningAverage(this.stats.averageOperationDuration, this.stats.operationsSucceeded + this.stats.operationsFailed + this.stats.operationsCancelled + this.stats.operationsTimedOut, duration);
  }

  updateAverageConfidence(confidence, completeness) {
    const count = this.healthHistory.length || 1;
    this.stats.averageConfidence = runningAverage(this.stats.averageConfidence, count, confidence);
    this.stats.averageCompleteness = runningAverage(this.stats.averageCompleteness, count, completeness);
  }
}

class UriWorkspaceAdapter {
  constructor(options = {}) {
    this.clock = normalizeClock(options.clock);
    this.watchers = new Map();
  }

  normalizeUri(input) {
    const uri = typeof input === "string" ? input : input && (input.uri || input.rootPath || input.id);
    return requiredString(uri, "Workspace uri is required.");
  }

  validateWorkspace(input) {
    this.normalizeUri(input);
    return { valid: true, evidence: [{ source: "UriWorkspaceAdapter", signal: "uri accepted" }] };
  }

  openWorkspace(input) {
    const uri = this.normalizeUri(input);
    return {
      uri,
      name: input && input.name || workspaceNameFromUri(uri),
      rootPath: input && input.rootPath || uri,
      repositoryType: input && input.repositoryType || "uri",
      metadata: { openedBy: "UriWorkspaceAdapter" },
    };
  }

  closeWorkspace() {
    return { status: "CLOSED" };
  }

  getWorkspaceMetadata(workspace) {
    return clonePlainObject(workspace.metadata || {});
  }

  getWorkspaceRevision(workspace) {
    return workspace.revision || stableHash({ uri: workspace.uri, timestamp: workspace.openedAt || this.clock.now() });
  }

  listFiles() {
    return [];
  }

  readFile() {
    throw new Error("UriWorkspaceAdapter does not provide file reads.");
  }

  stat(workspace, uri) {
    return { uri: uri || workspace.uri, type: "workspace", exists: true };
  }

  watchWorkspace(workspace, listener) {
    const id = stableId("watch", { workspaceId: workspace.id, count: this.watchers.size + 1 });
    this.watchers.set(id, { workspaceId: workspace.id, listener });
    return id;
  }

  unwatchWorkspace(subscriptionId) {
    return this.watchers.delete(subscriptionId);
  }

  resolvePath(workspace, input) {
    return `${workspace.uri}/${String(input || "").replace(/^\/+/, "")}`;
  }
}

class FileRuntimePersistenceAdapter {
  constructor(options = {}) {
    this.storageRoot = options.storageRoot || ".levi";
    this.clock = normalizeClock(options.clock);
  }

  filePath(configuration = {}) {
    const root = configuration.storageRoot || this.storageRoot || ".levi";
    return path.join(root, "application-runtime.json");
  }

  save(snapshot, options = {}) {
    const filePath = this.filePath(options.configuration || {});
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, filePath);
    return { status: "PERSISTED", path: filePath, savedAt: this.clock.now() };
  }

  load(options = {}) {
    const filePath = this.filePath(options.configuration || {});
    if (!fs.existsSync(filePath)) return { status: "EMPTY", path: filePath };
    try {
      return { status: "LOADED", path: filePath, snapshot: JSON.parse(fs.readFileSync(filePath, "utf8")) };
    } catch (error) {
      if (options.emptyOnCorruption) return { status: "EMPTY", path: filePath, corrupted: true, error: error.message };
      throw error;
    }
  }

  status() {
    return { status: "AVAILABLE", storageRoot: this.storageRoot };
  }
}

function builtInCommandDefinitions() {
  return [
    command("runtime.health", "Runtime Health", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.getRuntimeHealth(input)),
    command("runtime.capabilities", "Runtime Capabilities", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.discoverRuntimeCapabilities(input)),
    command("runtime.certification", "Runtime Certification", OperationTypes.RUN_CERTIFICATION, ["capability discovery"], (input, { runtime }) => runtime.safeCertification(input)),
    command("workspace.open", "Open Workspace", OperationTypes.OPEN_WORKSPACE, [], (input, { runtime, options }) => runtime.openWorkspaceInternal(input, options, runtime.operations.get(options.operationId) || runtime.createOperation({ type: OperationTypes.OPEN_WORKSPACE, input }))),
    command("workspace.close", "Close Workspace", OperationTypes.CLOSE_WORKSPACE, [], (input, { runtime, options }) => runtime.closeWorkspace(input.workspaceId, options)),
    command("workspace.refresh", "Refresh Workspace", OperationTypes.REFRESH_WORKSPACE, [], (input, { runtime, options }) => runtime.refreshWorkspace(input.workspaceId, options)),
    command("workspace.analyze", "Analyze Workspace", OperationTypes.ANALYZE_PROJECT, ["project assessment"], (input, { runtime, options }) => runtime.analyzeWorkspace(input.workspaceId, options)),
    command("project.summary", "Project Summary", OperationTypes.GENERATE_PROJECT_SUMMARY, ["project assessment"], (input, { runtime }) => runtime.callProject("getProjectSummary", input.workspaceId, input)),
    command("project.assessment", "Project Assessment", OperationTypes.ASSESS_PROJECT, ["project assessment"], (input, { runtime }) => runtime.callProject("assessProject", input.workspaceId, input)),
    command("project.architecture", "Project Architecture", OperationTypes.ASSESS_PROJECT, ["architecture analysis"], (input, { runtime }) => runtime.callProject("getArchitectureAssessment", input.workspaceId, input)),
    command("project.blockers", "Project Blockers", OperationTypes.ASSESS_PROJECT, ["blocker detection"], (input, { runtime }) => runtime.callProject("getBlockers", input.workspaceId, input)),
    command("project.risks", "Project Risks", OperationTypes.ASSESS_PROJECT, ["risk detection"], (input, { runtime }) => runtime.callProject("getRisks", input.workspaceId, input)),
    command("project.nextActions", "Project Next Actions", OperationTypes.GET_NEXT_ACTIONS, ["project assessment"], (input, { runtime }) => runtime.callProject("getNextActions", input.workspaceId, input)),
    command("project.releaseReadiness", "Release Readiness", OperationTypes.GET_RELEASE_READINESS, ["release-readiness assessment"], (input, { runtime }) => runtime.callProject("getReleaseReadiness", input.workspaceId, input)),
    command("repository.search", "Repository Search", OperationTypes.SEARCH_PROJECT, ["offline search"], (input, { runtime }) => runtime.callComponent("OfflineKnowledgeIndex", "search", input.query || input.text || "", input.options || {})),
    command("repository.graphQuery", "Repository Graph Query", OperationTypes.QUERY_GRAPH, ["repository graph querying"], (input, { runtime }) => runtime.graphQuery(input)),
    command("code.understand", "Code Understand", OperationTypes.UNDERSTAND_CODE, ["code entity analysis"], (input, { runtime }) => runtime.codeUnderstanding(input)),
    command("planning.create", "Create Plan", OperationTypes.CREATE_PLAN, ["planning"], (input, { runtime }) => runtime.planning(input)),
    command("planning.validate", "Validate Plan", OperationTypes.VALIDATE_PLAN, ["planning"], (input, { runtime }) => runtime.callComponent("PlanningIntelligenceEngine", "validatePlan", input.planId, input.context || {})),
    command("context.build", "Build Context", OperationTypes.BUILD_CONTEXT, ["context assembly"], (input, { runtime }) => runtime.callComponent("ContextIntelligenceEngine", "assemble", input, input.options || {})),
    command("execution.executeObjective", "Execute Objective", OperationTypes.EXECUTE_OBJECTIVE, ["execution"], (input, { runtime }) => runtime.callComponent("ExecutionEngine", "run", input.session, input.options || {}), { securitySensitive: true, approvalSensitive: true, requiresSession: true, cancellable: true }),
    command("execution.validate", "Validate Execution", OperationTypes.VALIDATE_EXECUTION, ["validation"], (input) => ({ status: "REFERENCE_ONLY", input }), { securitySensitive: true }),
    command("execution.repair", "Repair Execution", OperationTypes.REPAIR_EXECUTION, ["repair"], (input, { runtime }) => runtime.callComponent("RepairEngine", "repair", input.context || input, input.options || {}), { securitySensitive: true, approvalSensitive: true }),
    command("approval.respond", "Respond To Approval", OperationTypes.RESPOND_TO_APPROVAL, ["approval gating"], (input, { runtime }) => runtime.respondToApproval(input)),
    command("security.status", "Security Status", OperationTypes.GET_SECURITY_STATUS, ["security gating"], (input, { runtime }) => ({ decisions: Array.from(runtime.securityDecisions.values()), status: runtime.securityValidator ? "AVAILABLE" : "UNAVAILABLE" })),
    command("learning.status", "Learning Status", OperationTypes.GET_LEARNING_STATE, ["durable learning"], (input, { runtime }) => runtime.learningState(input)),
    command("learning.applyAdaptation", "Apply Adaptation", OperationTypes.APPLY_ADAPTATION, ["bounded adaptation"], (input, { runtime }) => runtime.callComponent("LearningAdaptationEngine", "applyAdaptation", input.adaptationId, input.options || {}), { securitySensitive: true, approvalSensitive: true }),
    command("learning.rollbackAdaptation", "Rollback Adaptation", OperationTypes.ROLLBACK_ADAPTATION, ["bounded adaptation"], (input, { runtime }) => runtime.callComponent("LearningAdaptationEngine", "rollbackAdaptation", input.adaptationId, input.options || {}), { securitySensitive: true, approvalSensitive: true }),
    command("model.providers", "Model Providers", OperationTypes.MODEL_PROVIDER, [], (input, { runtime }) => runtime.modelGatewayCommand("providers", input)),
    command("model.models", "Model Catalog", OperationTypes.MODEL_PROVIDER, [], (input, { runtime }) => runtime.modelGatewayCommand("models", input)),
    command("model.health", "Model Provider Health", OperationTypes.MODEL_PROVIDER, [], (input, { runtime }) => runtime.modelGatewayCommand("health", input)),
    command("model.routingPreview", "Model Routing Preview", OperationTypes.MODEL_PROVIDER, [], (input, { runtime }) => runtime.modelGatewayCommand("routingPreview", input)),
    command("model.complete", "Model Completion", OperationTypes.MODEL_PROVIDER, [], (input, { runtime }) => runtime.modelGatewayCommand("complete", input), { timeoutMs: 120000 }),
    command("model.cancel", "Cancel Model Request", OperationTypes.MODEL_PROVIDER, [], (input, { runtime }) => runtime.modelGatewayCommand("cancel", input)),
    command("model.usage", "Model Usage", OperationTypes.MODEL_PROVIDER, [], (input, { runtime }) => runtime.modelGatewayCommand("usage", input)),
    command("agent.createConversation", "Create Agent Conversation", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.agentCommand("createConversation", input)),
    command("agent.sendMessage", "Send Agent Message", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.agentCommand("sendMessage", input), { timeoutMs: 120000 }),
    command("agent.continueConversation", "Continue Agent Conversation", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.agentCommand("continueConversation", input), { timeoutMs: 120000 }),
    command("agent.cancelConversation", "Cancel Agent Conversation", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.agentCommand("cancelConversation", input)),
    command("agent.getConversation", "Get Agent Conversation", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.agentCommand("getConversation", input)),
    command("agent.listConversations", "List Agent Conversations", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.agentCommand("listConversations", input)),
    command("agent.getTurn", "Get Agent Turn", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.agentCommand("getTurn", input)),
    command("agent.retryTurn", "Retry Agent Turn", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.agentCommand("retryTurn", input), { timeoutMs: 120000 }),
    command("agent.listTools", "List Agent Tools", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.agentCommand("listTools", input)),
    command("agent.getHealth", "Agent Health", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.agentCommand("getHealth", input)),
    command("workspaceTools.health", "Workspace Tool Health", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.workspaceToolsCommand("health", input)),
    command("workspaceTools.list", "List Workspace Tools", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("list", input)),
    command("workspaceTools.readFile", "Read Workspace File", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("readFile", input), { securitySensitive: true }),
    command("workspaceTools.statFile", "Stat Workspace File", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("statFile", input)),
    command("change.createProposal", "Create Change Proposal", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("createProposal", input)),
    command("change.validateProposal", "Validate Change Proposal", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("validateProposal", input)),
    command("change.preview", "Preview Change", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("preview", input)),
    command("change.apply", "Apply Approved Change", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("apply", input), { securitySensitive: true, approvalSensitive: true, timeoutMs: 120000 }),
    command("change.get", "Get Change Proposal", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("getProposal", input)),
    command("change.list", "List Change Proposals", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("listProposals", input)),
    command("change.reject", "Reject Change Proposal", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("reject", input)),
    command("change.revert", "Revert Change", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("revert", input), { securitySensitive: true, approvalSensitive: true, timeoutMs: 120000 }),
    command("validation.run", "Run Change Validation", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("validateChange", input), { securitySensitive: true, approvalSensitive: true, timeoutMs: 120000 }),
    command("validation.get", "Get Validation Profiles", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("validationProfiles", input)),
    command("command.listAllowed", "List Allowed Workspace Commands", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("listAllowedCommands", input)),
    command("command.runValidation", "Run Workspace Validation Command", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("runCommand", input), { securitySensitive: true, approvalSensitive: true, timeoutMs: 120000 }),
    command("command.cancel", "Cancel Workspace Command", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("cancelCommand", input)),
    command("sourceControl.status", "Source Control Status", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("sourceControlStatus", input)),
    command("sourceControl.diff", "Source Control Diff", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("sourceControlDiff", input)),
    command("sourceControl.checkpoint", "Source Control Checkpoint", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("sourceControlCheckpoint", input), { securitySensitive: true, approvalSensitive: true }),
    command("sourceControl.restore", "Source Control Restore", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workspaceToolsCommand("sourceControlRestore", input), { securitySensitive: true, approvalSensitive: true }),
    command("multiAgent.health", "Multi-Agent Health", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.multiAgentCommand("health", input)),
    command("multiAgent.roles", "Multi-Agent Roles", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.multiAgentCommand("roles", input)),
    command("multiAgent.previewDelegation", "Preview Multi-Agent Delegation", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.multiAgentCommand("previewDelegation", input)),
    command("multiAgent.createTeam", "Create Multi-Agent Team", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.multiAgentCommand("createTeam", input)),
    command("multiAgent.startTeam", "Start Multi-Agent Team", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.multiAgentCommand("startTeam", input), { timeoutMs: 120000 }),
    command("multiAgent.cancelTeam", "Cancel Multi-Agent Team", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.multiAgentCommand("cancelTeam", input)),
    command("multiAgent.getTeam", "Get Multi-Agent Team", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.multiAgentCommand("getTeam", input)),
    command("multiAgent.listTeams", "List Multi-Agent Teams", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.multiAgentCommand("listTeams", input)),
    command("multiAgent.getAssignment", "Get Multi-Agent Assignment", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.multiAgentCommand("getAssignment", input)),
    command("multiAgent.listAssignments", "List Multi-Agent Assignments", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.multiAgentCommand("listAssignments", input)),
    command("multiAgent.retryAssignment", "Retry Multi-Agent Assignment", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.multiAgentCommand("retryAssignment", input), { timeoutMs: 120000 }),
    command("multiAgent.requestRevision", "Request Multi-Agent Assignment Revision", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.multiAgentCommand("requestRevision", input)),
    command("multiAgent.getConflicts", "Get Multi-Agent Conflicts", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.multiAgentCommand("getConflicts", input)),
    command("multiAgent.resolveConflict", "Resolve Multi-Agent Conflict", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.multiAgentCommand("resolveConflict", input), { securitySensitive: true }),
    command("multiAgent.reconcile", "Reconcile Multi-Agent Results", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.multiAgentCommand("reconcile", input), { timeoutMs: 120000 }),
    command("workflow.health", "Workflow Health", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.workflowCommand("health", input)),
    command("workflow.create", "Create Workflow", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("create", input)),
    command("workflow.validate", "Validate Workflow", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("validate", input)),
    command("workflow.start", "Start Workflow", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("start", input), { timeoutMs: 120000 }),
    command("workflow.pause", "Pause Workflow", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("pause", input)),
    command("workflow.resume", "Resume Workflow", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("resume", input)),
    command("workflow.cancel", "Cancel Workflow", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("cancel", input)),
    command("workflow.retry", "Retry Workflow", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("retry", input), { timeoutMs: 120000 }),
    command("workflow.get", "Get Workflow", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("get", input)),
    command("workflow.list", "List Workflows", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("list", input)),
    command("workflow.explain", "Explain Workflow", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("explain", input)),
    command("workflow.getResult", "Get Workflow Result", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("getResult", input)),
    command("workflow.listSteps", "List Workflow Steps", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("listSteps", input)),
    command("workflow.getStep", "Get Workflow Step", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("getStep", input)),
    command("workflow.retryStep", "Retry Workflow Step", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("retryStep", input), { timeoutMs: 120000 }),
    command("workflow.skipStep", "Skip Workflow Step", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("skipStep", input)),
    command("workflow.getReadySteps", "Get Ready Workflow Steps", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("getReadySteps", input)),
    command("workflow.createCheckpoint", "Create Workflow Checkpoint", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("createCheckpoint", input)),
    command("workflow.listCheckpoints", "List Workflow Checkpoints", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("listCheckpoints", input)),
    command("workflow.restoreCheckpoint", "Restore Workflow Checkpoint", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("restoreCheckpoint", input), { securitySensitive: true, approvalSensitive: true }),
    command("workflow.resolveDecision", "Resolve Workflow Decision", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("resolveDecision", input)),
    command("workflow.tick", "Tick Workflow Scheduler", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.workflowCommand("tick", input), { timeoutMs: 120000 }),
    command("performance.health", "Repository Performance Health", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.performanceCommand("health", input)),
    command("performance.stats", "Repository Performance Stats", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.performanceCommand("stats", input)),
    command("performance.cache", "Repository Performance Cache", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.performanceCommand("cache", input)),
    command("performance.invalidate", "Repository Performance Invalidate", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.performanceCommand("invalidate", input)),
    command("performance.rebuild", "Repository Performance Rebuild", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.performanceCommand("rebuild", input), { timeoutMs: 120000 }),
    command("performance.benchmark", "Repository Performance Benchmark", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.performanceCommand("benchmark", input), { timeoutMs: 120000 }),
    command("performance.memory", "Repository Performance Memory", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.performanceCommand("memory", input)),
    command("performance.contextReuse", "Repository Performance Context Reuse", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.performanceCommand("contextReuse", input)),
    command("performance.graph", "Repository Performance Graph", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.performanceCommand("graph", input)),
    command("reliability.health", "Reliability Health", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.reliabilityCommand("health", input)),
    command("reliability.stats", "Reliability Stats", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.reliabilityCommand("stats", input)),
    command("reliability.scenarios", "Reliability Scenarios", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.reliabilityCommand("scenarios", input)),
    command("reliability.run", "Run Reliability Diagnostics", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.reliabilityCommand("run", input), { timeoutMs: 120000 }),
    command("reliability.cancel", "Cancel Reliability Diagnostics", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.reliabilityCommand("cancel", input)),
    command("reliability.report", "Reliability Report", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.reliabilityCommand("report", input)),
    command("reliability.consistency", "Reliability Consistency", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.reliabilityCommand("consistency", input)),
    command("reliability.recovery", "Reliability Recovery", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.reliabilityCommand("recovery", input)),
    command("reliability.resources", "Reliability Resources", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.reliabilityCommand("resources", input)),
    command("reliability.findings", "Reliability Findings", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.reliabilityCommand("findings", input)),
    command("reliability.certify", "Reliability Certification", OperationTypes.RUN_CERTIFICATION, [], (input, { runtime }) => runtime.reliabilityCommand("certify", input), { timeoutMs: 120000 }),
    command("securityAssurance.health", "Security Assurance Health", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.securityAssuranceCommand("health", input)),
    command("securityAssurance.stats", "Security Assurance Stats", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("stats", input)),
    command("securityAssurance.scenarios", "Security Assurance Scenarios", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("scenarios", input)),
    command("securityAssurance.run", "Run Security Audit", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("run", input), { timeoutMs: 120000 }),
    command("securityAssurance.cancel", "Cancel Security Audit", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("cancel", input)),
    command("securityAssurance.report", "Security Assurance Report", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("report", input)),
    command("securityAssurance.findings", "Security Assurance Findings", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("findings", input)),
    command("securityAssurance.check", "Security Assurance Check", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.securityAssuranceCommand("check", input)),
    command("securityAssurance.certify", "Security Assurance Certification", OperationTypes.RUN_CERTIFICATION, [], (input, { runtime }) => runtime.securityAssuranceCommand("certify", input), { timeoutMs: 120000 }),
    command("security.health", "Security Health", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.securityAssuranceCommand("health", input)),
    command("security.stats", "Security Stats", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("stats", input)),
    command("security.threatModel", "Security Threat Model", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("threatModel", input)),
    command("security.assets", "Security Assets", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("assets", input)),
    command("security.boundaries", "Security Trust Boundaries", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("boundaries", input)),
    command("security.scenarios", "Security Scenarios", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("scenarios", input)),
    command("security.createAudit", "Create Security Audit", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("createAudit", input)),
    command("security.startAudit", "Start Security Audit", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("startAudit", input), { timeoutMs: 120000 }),
    command("security.cancelAudit", "Cancel Security Audit", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("cancel", input)),
    command("security.listAudits", "List Security Audits", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("listAudits", input)),
    command("security.getReport", "Get Security Report", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("report", input)),
    command("security.findings", "Security Findings", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("findings", input)),
    command("security.blockers", "Security Blockers", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.securityAssuranceCommand("blockers", input)),
    command("security.checkApprovals", "Check Approval Security", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.securityAssuranceCommand("checkApprovalSecurity", input)),
    command("security.checkWorkspaceIsolation", "Check Workspace Isolation", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.securityAssuranceCommand("checkWorkspaceIsolation", input)),
    command("security.checkCommandSecurity", "Check Command Security", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.securityAssuranceCommand("checkCommandSecurity", input)),
    command("security.checkSourceControl", "Check Source Control Security", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.securityAssuranceCommand("checkSourceControl", input)),
    command("security.checkPromptInjection", "Check Prompt Injection Security", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.securityAssuranceCommand("checkPromptInjection", input)),
    command("security.checkSecrets", "Check Secret Handling", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.securityAssuranceCommand("checkSecrets", input)),
    command("security.checkProviders", "Check Provider Security", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.securityAssuranceCommand("checkProviders", input)),
    command("security.checkPrivacy", "Check Privacy Security", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.securityAssuranceCommand("checkPrivacy", input)),
    command("security.checkWebview", "Check Webview Security", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.securityAssuranceCommand("checkWebview", input)),
    command("security.checkPersistence", "Check Persistence Security", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.securityAssuranceCommand("checkPersistence", input)),
    command("security.checkSerialization", "Check Serialization Security", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.securityAssuranceCommand("checkSerialization", input)),
    command("security.checkDependencies", "Check Dependency Security", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.securityAssuranceCommand("checkDependencies", input)),
    command("security.checkSupplyChain", "Check Supply Chain Security", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.securityAssuranceCommand("checkSupplyChain", input)),
    command("security.checkResources", "Check Resource Abuse Security", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.securityAssuranceCommand("checkResources", input)),
    command("security.certify", "Security Certification", OperationTypes.RUN_CERTIFICATION, [], (input, { runtime }) => runtime.securityAssuranceCommand("certify", input), { timeoutMs: 120000 }),
    command("stress.health", "Stress Scalability Health", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.stressScalabilityCommand("health", input)),
    command("stress.stats", "Stress Scalability Stats", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.stressScalabilityCommand("stats", input)),
    command("stress.profiles", "Stress Load Profiles", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.stressScalabilityCommand("profiles", input)),
    command("stress.repositories", "Stress Synthetic Repositories", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.stressScalabilityCommand("repositories", input)),
    command("stress.scenarios", "Stress Scenarios", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.stressScalabilityCommand("scenarios", input)),
    command("stress.createRun", "Create Stress Run", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.stressScalabilityCommand("createRun", input)),
    command("stress.startRun", "Start Stress Run", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.stressScalabilityCommand("startRun", input), { timeoutMs: 120000 }),
    command("stress.run", "Run Stress Profile", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.stressScalabilityCommand("run", input), { timeoutMs: 120000 }),
    command("stress.cancel", "Cancel Stress Run", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.stressScalabilityCommand("cancel", input)),
    command("stress.listRuns", "List Stress Runs", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.stressScalabilityCommand("listRuns", input)),
    command("stress.report", "Stress Report", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.stressScalabilityCommand("report", input)),
    command("stress.findings", "Stress Findings", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.stressScalabilityCommand("findings", input)),
    command("stress.blockers", "Stress Blockers", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.stressScalabilityCommand("blockers", input)),
    command("stress.check", "Stress Checks", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.stressScalabilityCommand("check", input)),
    command("stress.checkRepository", "Check Repository Stress", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.stressScalabilityCommand("checkRepository", input)),
    command("stress.checkConcurrency", "Check Concurrency Stress", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.stressScalabilityCommand("checkConcurrency", input)),
    command("stress.checkAgents", "Check Agent Stress", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.stressScalabilityCommand("checkAgents", input)),
    command("stress.checkMultiAgent", "Check Multi-Agent Stress", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.stressScalabilityCommand("checkMultiAgent", input)),
    command("stress.checkWorkflows", "Check Workflow Stress", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.stressScalabilityCommand("checkWorkflows", input)),
    command("stress.checkProviders", "Check Provider Stress", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.stressScalabilityCommand("checkProviders", input)),
    command("stress.checkQueues", "Check Queue Stability", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.stressScalabilityCommand("checkQueues", input)),
    command("stress.checkMemory", "Check Memory Stability", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.stressScalabilityCommand("checkMemory", input)),
    command("stress.checkCache", "Check Cache Efficiency", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.stressScalabilityCommand("checkCache", input)),
    command("stress.checkEvents", "Check Event Stability", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.stressScalabilityCommand("checkEvents", input)),
    command("stress.checkPersistence", "Check Stress Persistence", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.stressScalabilityCommand("checkPersistence", input)),
    command("stress.checkCancellation", "Check Stress Cancellation", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.stressScalabilityCommand("checkCancellation", input)),
    command("stress.checkPresentation", "Check Presentation Pressure", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.stressScalabilityCommand("checkPresentation", input)),
    command("stress.cleanup", "Stress Cleanup", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.stressScalabilityCommand("cleanup", input)),
    command("stress.certify", "Stress Scalability Certification", OperationTypes.RUN_CERTIFICATION, [], (input, { runtime }) => runtime.stressScalabilityCommand("certify", input), { timeoutMs: 120000 }),
    command("qualification.health", "Release Qualification Health", OperationTypes.RUN_HEALTH_CHECK, [], (input, { runtime }) => runtime.releaseQualificationCommand("health", input)),
    command("qualification.stats", "Release Qualification Stats", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.releaseQualificationCommand("stats", input)),
    command("qualification.fixtures", "Release Qualification Fixtures", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.releaseQualificationCommand("fixtures", input)),
    command("qualification.journeys", "Release Qualification Journeys", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.releaseQualificationCommand("journeys", input)),
    command("qualification.suites", "Release Qualification Suites", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.releaseQualificationCommand("suites", input)),
    command("qualification.scenarios", "Release Qualification Scenarios", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.releaseQualificationCommand("scenarios", input)),
    command("qualification.createRun", "Create Release Qualification Run", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.releaseQualificationCommand("createRun", input)),
    command("qualification.startRun", "Start Release Qualification Run", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.releaseQualificationCommand("startRun", input), { timeoutMs: 120000 }),
    command("qualification.run", "Run Release Qualification", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.releaseQualificationCommand("run", input), { timeoutMs: 120000 }),
    command("qualification.cancel", "Cancel Release Qualification", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.releaseQualificationCommand("cancel", input)),
    command("qualification.report", "Release Qualification Report", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.releaseQualificationCommand("report", input)),
    command("qualification.blockers", "Release Qualification Blockers", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.releaseQualificationCommand("blockers", input)),
    command("qualification.manual", "Release Qualification Manual Checks", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.releaseQualificationCommand("manual", input)),
    command("qualification.defects", "Release Qualification Defects", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.releaseQualificationCommand("defects", input)),
    command("qualification.extensionHost", "Extension Host Qualification", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.releaseQualificationCommand("extensionHost", input)),
    command("qualification.localOllama", "Local Ollama Qualification", OperationTypes.CUSTOM, [], (input, { runtime }) => runtime.releaseQualificationCommand("localOllama", input)),
    command("qualification.certify", "Release Qualification Certification", OperationTypes.RUN_CERTIFICATION, [], (input, { runtime }) => runtime.releaseQualificationCommand("certify", input), { timeoutMs: 120000 }),
    command("persistence.save", "Save Runtime State", OperationTypes.SAVE_STATE, ["persistence"], (input, { runtime }) => runtime.save()),
    command("persistence.restore", "Restore Runtime State", OperationTypes.RESTORE_STATE, ["recovery"], (input, { runtime }) => runtime.restore(input.snapshot), { securitySensitive: true, approvalSensitive: true }),
  ];
}

function descriptorForComponent(key, value) {
  if (key === "ModelProviderGateway") {
    return {
      required: false,
      domain: "model-provider-gateway",
      capabilities: [
        "model provider routing",
        "model provider health",
        "model catalog",
        "model completion",
        "model streaming",
        "model usage accounting",
        "provider credential references",
      ],
      requiredMethods: ["listProviders", "listModels", "getGatewayHealth", "complete", "route", "cancelRequest", "getUsage"],
      metadata: { schema: "Layer3.ModelProviderGateway.v1" },
    };
  }
  if (key === "AgentOrchestrationEngine") {
    return {
      required: false,
      domain: "agent-orchestration",
      capabilities: [
        "agent orchestration",
        "agent conversations",
        "agent request classification",
        "agent tool registry",
        "agent response synthesis",
        "agent persistence",
      ],
      requiredMethods: ["createConversation", "sendMessage", "continueConversation", "cancelConversation", "getConversation", "listConversations", "getHealth"],
      metadata: { schema: "Layer3.AgentOrchestration.v1" },
    };
  }
  if (key === "ControlledWorkspaceToolEngine") {
    return {
      required: false,
      domain: "controlled-workspace-tools",
      capabilities: [
        "controlled workspace tools",
        "workspace file reads",
        "change proposals",
        "patch preview",
        "approval-bound mutations",
        "validation command allowlisting",
        "source-control checkpoints",
      ],
      requiredMethods: ["listTools", "createProposal", "validateProposal", "previewProposal", "applyPatch", "validateChange", "getHealth"],
      metadata: { schema: "Layer3.ControlledWorkspaceTools.v1" },
    };
  }
  if (key === "MultiAgentCoordinationEngine") {
    return {
      required: false,
      domain: "multi-agent-coordination",
      capabilities: [
        "bounded delegation",
        "role specialization",
        "parallel independent analysis",
        "independent change review",
        "conflict detection",
        "result reconciliation",
        "multi-agent evidence lineage",
      ],
      requiredMethods: ["shouldDelegate", "createDelegationPlan", "createTeam", "startTeam", "executeDelegationPlan", "reconcileTeam", "getHealth"],
      metadata: { schema: "Layer3.MultiAgentCoordination.v1" },
    };
  }
  if (key === "DurableWorkflowEngine") {
    return {
      required: false,
      domain: "durable-workflows",
      capabilities: [
        "durable workflows",
        "dependency scheduling",
        "resumable execution",
        "approval checkpoints",
        "user-input checkpoints",
        "workflow recovery",
        "bounded retries",
        "repair orchestration",
        "workflow evidence lineage",
        "workflow progress",
        "partial-completion reporting",
      ],
      requiredMethods: ["createWorkflow", "validateWorkflow", "startWorkflow", "pauseWorkflow", "resumeWorkflow", "cancelWorkflow", "getWorkflow", "listWorkflows", "getHealth"],
      metadata: { schema: "Layer3.DurableWorkflows.v1" },
    };
  }
  if (key === "RepositoryPerformanceEngine") {
    return {
      required: false,
      domain: "repository-performance",
      capabilities: [
        "repository performance",
        "incremental indexing",
        "dependency-aware invalidation",
        "lazy graph loading",
        "context reuse",
        "token reuse",
        "memory budgeting",
        "repository benchmarks",
        "scalability metrics",
      ],
      requiredMethods: ["getHealth", "getStats", "getCacheSummary", "invalidate", "rebuild", "runBenchmark", "getMemoryUsage", "reuseContext", "getGraph"],
      metadata: { schema: "Layer3.RepositoryPerformance.v1" },
    };
  }
  if (key === "ReliabilityAssuranceEngine") {
    return {
      required: false,
      domain: "reliability-assurance",
      capabilities: [
        "reliability diagnostics",
        "fault-tolerance certification",
        "state-machine verification",
        "event-integrity verification",
        "persistence-integrity verification",
        "recovery verification",
        "protected-action non-resume verification",
        "resource cleanup verification",
        "release-candidate blockers",
      ],
      requiredMethods: ["getHealth", "runDiagnostics", "certify", "checkConsistency", "verifyRecovery", "checkResources", "getReliabilityReport"],
      metadata: { schema: "ReleaseCandidate.ReliabilityAssurance.v1" },
    };
  }
  if (key === "SecurityAssuranceEngine") {
    return {
      required: false,
      domain: "security-assurance",
      capabilities: [
        "release-candidate security assurance",
        "threat scenario registry",
        "policy verification",
        "prompt-injection diagnostics",
        "authority-boundary verification",
        "workspace-isolation verification",
        "path and URI validation verification",
        "command-policy verification",
        "secret-leak scanning",
        "provider privacy verification",
        "webview security verification",
        "persistence redaction verification",
        "serialization safety verification",
        "release blockers",
        "security certification evidence",
      ],
      requiredMethods: ["getHealth", "startRun", "checkAll", "certifySecurity", "getSecurityReport", "getReleaseBlockers", "getThreatModel", "listAssets", "listTrustBoundaries"],
      metadata: { schema: "ReleaseCandidate.SecurityAssurance.v1" },
    };
  }
  if (key === "StressScalabilityEngine") {
    return {
      required: false,
      domain: "stress-scalability",
      capabilities: [
        "stress-health",
        "load-profiles",
        "synthetic-repositories",
        "sustained-load-runs",
        "concurrency-probes",
        "memory-pressure-probes",
        "queue-pressure-probes",
        "provider-pressure-probes",
        "persistence-recovery-probes",
        "cancellation-probes",
        "presentation-pressure-probes",
        "scalability-certification",
      ],
      requiredMethods: ["getHealth", "runStress", "checkAll", "certifyScalability", "getScalabilityReport", "getReleaseBlockers"],
      metadata: { schema: "ReleaseCandidate.StressScalability.v1" },
    };
  }
  if (key === "ReleaseQualificationEngine") {
    return {
      required: false,
      domain: "release-qualification",
      capabilities: [
        "qualification-health",
        "project-fixtures",
        "user-journeys",
        "automated-qualification",
        "manual-verification-records",
        "defect-management",
        "extension-host-harness",
        "local-ollama-qualification",
        "readiness-evaluation",
        "qualification-certification",
      ],
      requiredMethods: ["getHealth", "startRun", "runQualification", "evaluateReadiness", "getQualificationReport", "getReleaseBlockers", "certifyQualification", "listFixtures", "listJourneys", "listScenarios"],
      metadata: { schema: "ReleaseCandidate.ReleaseQualification.v1" },
    };
  }
  return { required: false };
}

LeviApplicationRuntime.prototype.callProject = function callProject(method, workspaceId, input = {}) {
  const workspace = workspaceId ? this.requireWorkspace(workspaceId) : null;
  return this.callComponent("ProjectIntelligenceEngine", method, workspace ? workspace.projectId : input.projectId || "default", input.options || {});
};

LeviApplicationRuntime.prototype.graphQuery = function graphQuery(input = {}) {
  const query = input.query || {};
  if (query.nodeId) return this.callComponent("RepositoryKnowledgeGraph", "getNeighbors", query.nodeId, input.options || {});
  if (query.edges) return this.callComponent("RepositoryKnowledgeGraph", "findEdges", query.edges);
  return this.callComponent("RepositoryKnowledgeGraph", "findNodes", query.nodes || query);
};

LeviApplicationRuntime.prototype.codeUnderstanding = function codeUnderstanding(input = {}) {
  if (input.filePath) return this.callComponent("CodeUnderstandingEngine", "getFileSummary", input.filePath, input.options || {});
  if (input.symbol || input.entityId) return this.callComponent("CodeUnderstandingEngine", "getSymbolSummary", input.symbol || input.entityId, input.options || {});
  if (input.target) return this.callComponent("CodeUnderstandingEngine", "explainCode", input.target, input.options || {});
  return this.callComponent("CodeUnderstandingEngine", "getArchitectureView", input.options || {});
};

LeviApplicationRuntime.prototype.planning = function planning(input = {}) {
  if (input.planId) return this.callComponent("PlanningIntelligenceEngine", "getPlan", input.planId);
  return this.callComponent("PlanningIntelligenceEngine", "createPlan", input.objective || "Plan objective", input.context || {}, input.options || {});
};

LeviApplicationRuntime.prototype.learningState = function learningState(input = {}) {
  const adaptation = this.components.get("LearningAdaptationEngine");
  const learning = this.components.get("CrossSessionLearningEngine");
  return {
    adaptations: adaptation && adaptation.instance && typeof adaptation.instance.listAdaptations === "function" ? adaptation.instance.listAdaptations(input.filter || {}) : [],
    rules: adaptation && adaptation.instance && typeof adaptation.instance.listRules === "function" ? adaptation.instance.listRules(input.filter || {}) : [],
    records: learning && learning.instance && typeof learning.instance.list === "function" ? learning.instance.list(input.filter || {}) : [],
  };
};

LeviApplicationRuntime.prototype.modelGateway = function modelGateway() {
  const descriptor = this.components.get("ModelProviderGateway");
  return descriptor && descriptor.instance || null;
};

LeviApplicationRuntime.prototype.modelGatewayCommand = async function modelGatewayCommand(kind, input = {}) {
  const gateway = this.modelGateway();
  if (!gateway) {
    return {
      status: "UNCONFIGURED",
      gatewayAvailable: false,
      providers: [],
      models: [],
      warnings: ["ModelProviderGateway is not registered with the LeviApplicationRuntime."],
    };
  }
  if (kind === "providers") return { status: "AVAILABLE", gatewayAvailable: true, providers: gateway.listProviders(input.filter || {}) };
  if (kind === "models") {
    const models = input.availableOnly && typeof gateway.getAvailableModels === "function"
      ? gateway.getAvailableModels(input.filter || {})
      : gateway.listModels(input.filter || {});
    return { status: "AVAILABLE", gatewayAvailable: true, models };
  }
  if (kind === "health") {
    const summary = typeof gateway.getGatewayHealth === "function" ? gateway.getGatewayHealth() : { gatewayState: "UNKNOWN" };
    const providers = input.check === true && typeof gateway.healthCheckAll === "function" ? await gateway.healthCheckAll(input.options || {}) : [];
    return { status: "AVAILABLE", gatewayAvailable: true, summary, providers };
  }
  if (kind === "routingPreview") return { status: "AVAILABLE", gatewayAvailable: true, routing: gateway.route(input.request || input, input.options || {}) };
  if (kind === "complete") return gateway.complete(input.request || input, input.options || {});
  if (kind === "cancel") return gateway.cancelRequest(input.requestId || input.id, input.reason || "Cancelled through LeviApplicationRuntime.");
  if (kind === "usage") return { status: "AVAILABLE", gatewayAvailable: true, usage: gateway.getUsage(input.filter || {}), stats: gateway.getStats ? gateway.getStats() : {} };
  return { status: "UNKNOWN_MODEL_COMMAND", kind };
};

LeviApplicationRuntime.prototype.agentEngine = function agentEngine() {
  const descriptor = this.components.get("AgentOrchestrationEngine");
  return descriptor && descriptor.instance || null;
};

LeviApplicationRuntime.prototype.agentCommand = function agentCommand(kind, input = {}) {
  const agent = this.agentEngine();
  if (!agent) {
    return {
      status: "UNCONFIGURED",
      agentAvailable: false,
      warnings: ["AgentOrchestrationEngine is not registered with the LeviApplicationRuntime."],
    };
  }
  if (kind === "createConversation") return agent.createConversation(input, input.options || {});
  if (kind === "sendMessage") return agent.sendMessage(input.conversationId, input.message || input, input.options || {});
  if (kind === "continueConversation") return agent.continueConversation(input.conversationId, input.message || input, input.options || {});
  if (kind === "cancelConversation") return agent.cancelConversation(input.conversationId, input.reason || "Cancelled through LeviApplicationRuntime.");
  if (kind === "getConversation") return agent.getConversation(input.conversationId || input.id);
  if (kind === "listConversations") return agent.listConversations(input.filter || {});
  if (kind === "getTurn") return agent.getTurn(input.turnId || input.id);
  if (kind === "retryTurn") return agent.retryTurn(input.turnId || input.id, input.options || {});
  if (kind === "listTools") return agent.listTools(input.filter || {});
  if (kind === "getHealth") return agent.getHealth(input.options || input || {});
  return { status: "UNKNOWN_AGENT_COMMAND", kind };
};

LeviApplicationRuntime.prototype.workspaceToolsEngine = function workspaceToolsEngine() {
  const descriptor = this.components.get("ControlledWorkspaceToolEngine");
  return descriptor && descriptor.instance || null;
};

LeviApplicationRuntime.prototype.workspaceToolsCommand = async function workspaceToolsCommand(kind, input = {}) {
  const engine = this.workspaceToolsEngine();
  if (!engine) {
    return {
      status: "UNCONFIGURED",
      workspaceToolsAvailable: false,
      warnings: ["ControlledWorkspaceToolEngine is not registered with the LeviApplicationRuntime."],
    };
  }
  if (kind === "health") return engine.getHealth(input.options || input || {});
  if (kind === "list") return { status: "AVAILABLE", tools: engine.listTools(input.filter || {}) };
  if (kind === "readFile") return engine.readFile(input, input.options || {});
  if (kind === "statFile") return engine.statFile(input, input.options || {});
  if (kind === "createProposal") return engine.createProposal(input, input.options || {});
  if (kind === "validateProposal") return engine.validateProposal(input.proposalId || input.id || input.proposal || input, input.options || {});
  if (kind === "preview") return engine.previewProposal(input);
  if (kind === "apply") {
    const proposal = engine.getProposal(input.proposalId || input.id);
    const approval = input.approval || runtimeApprovalForProposal(this, input.approvalRequestId, proposal);
    return engine.applyPatch({ ...input, approval }, input.options || {});
  }
  if (kind === "getProposal") return engine.getProposal(input.proposalId || input.id);
  if (kind === "listProposals") return { status: "AVAILABLE", proposals: engine.listProposals(input.filter || {}) };
  if (kind === "reject") return engine.rejectProposal(input);
  if (kind === "revert") return engine.revertChange(input);
  if (kind === "validateChange") return engine.validateChange(input, input.options || {});
  if (kind === "validationProfiles") return { status: "AVAILABLE", profiles: engine.listValidationProfiles(input.filter || {}) };
  if (kind === "listAllowedCommands") return { status: "AVAILABLE", commands: engine.listAllowedCommands(input.filter || {}) };
  if (kind === "runCommand") return engine.runCommand(input, input.options || {});
  if (kind === "cancelCommand") return engine.cancelCommand(input);
  if (kind === "sourceControlStatus") return engine.sourceControlStatus(input);
  if (kind === "sourceControlDiff") return engine.sourceControlDiff(input);
  if (kind === "sourceControlCheckpoint") return engine.sourceControlCheckpoint(input);
  if (kind === "sourceControlRestore") return engine.sourceControlRestore(input);
  return { status: "UNKNOWN_WORKSPACE_TOOL_COMMAND", kind };
};

LeviApplicationRuntime.prototype.multiAgentEngine = function multiAgentEngine() {
  const descriptor = this.components.get("MultiAgentCoordinationEngine");
  return descriptor && descriptor.instance || null;
};

LeviApplicationRuntime.prototype.multiAgentCommand = async function multiAgentCommand(kind, input = {}) {
  const engine = this.multiAgentEngine();
  if (!engine) {
    return {
      status: "UNCONFIGURED",
      multiAgentAvailable: false,
      warnings: ["MultiAgentCoordinationEngine is not registered with the LeviApplicationRuntime."],
    };
  }
  if (kind === "health") return engine.getHealth(input.options || input || {});
  if (kind === "roles") return { status: "AVAILABLE", roles: engine.listRoles(input.filter || {}) };
  if (kind === "previewDelegation") return engine.getDelegationPreview(input, input.options || {});
  if (kind === "createTeam") return engine.createTeam(input, input.options || {});
  if (kind === "startTeam") return engine.startTeam(input.teamId || input.id, input.options || {});
  if (kind === "cancelTeam") return engine.cancelTeam(input.teamId || input.id, input.reason || "Cancelled through LeviApplicationRuntime.");
  if (kind === "getTeam") return engine.getTeam(input.teamId || input.id);
  if (kind === "listTeams") return { status: "AVAILABLE", teams: engine.listTeams(input.filter || {}) };
  if (kind === "getAssignment") return engine.getAssignment(input.assignmentId || input.id);
  if (kind === "listAssignments") return { status: "AVAILABLE", assignments: engine.listAssignments(input.teamId, input.filter || {}) };
  if (kind === "retryAssignment") return engine.retryAssignment(input.assignmentId || input.id, input.options || {});
  if (kind === "requestRevision") return engine.reviseAssignment(input.assignmentId || input.id, { instructions: input.instructions || input.reason || "", ...(input.revision || {}) }, input.options || {});
  if (kind === "getConflicts") return { status: "AVAILABLE", conflicts: engine.listConflicts(input.filter || {}) };
  if (kind === "resolveConflict") return engine.resolveConflict(input.conflictId || input.id, input.resolution || input, input.options || {});
  if (kind === "reconcile") return engine.reconcileTeam(input.teamId || input.id, input.options || {});
  return { status: "UNKNOWN_MULTI_AGENT_COMMAND", kind };
};

LeviApplicationRuntime.prototype.workflowEngine = function workflowEngine() {
  const descriptor = this.components.get("DurableWorkflowEngine");
  return descriptor && descriptor.instance || null;
};

LeviApplicationRuntime.prototype.workflowCommand = async function workflowCommand(kind, input = {}) {
  const engine = this.workflowEngine();
  if (!engine) {
    return {
      status: "UNCONFIGURED",
      workflowAvailable: false,
      warnings: ["DurableWorkflowEngine is not registered with the LeviApplicationRuntime."],
    };
  }
  if (kind === "health") return engine.getHealth(input.options || input || {});
  if (kind === "create") return engine.createWorkflow(input.workflow || input, input.options || {});
  if (kind === "validate") return engine.validateWorkflow(input.workflowId || input.id || input.workflow || input, input.options || {});
  if (kind === "start") return engine.startWorkflow(input.workflowId || input.id, input.options || {});
  if (kind === "pause") return engine.pauseWorkflow(input.workflowId || input.id, input.reason || "Paused through LeviApplicationRuntime.");
  if (kind === "resume") return engine.resumeWorkflow(input.workflowId || input.id, input.options || {});
  if (kind === "cancel") return engine.cancelWorkflow(input.workflowId || input.id, input.reason || "Cancelled through LeviApplicationRuntime.");
  if (kind === "retry") return engine.retryWorkflow(input.workflowId || input.id, input.options || {});
  if (kind === "get") return engine.getWorkflow(input.workflowId || input.id);
  if (kind === "list") return { status: "AVAILABLE", workflows: engine.listWorkflows(input.filter || {}) };
  if (kind === "explain") return engine.explainWorkflow(input.workflowId || input.id);
  if (kind === "getResult") return engine.getWorkflowResult(input.workflowId || input.id);
  if (kind === "listSteps") return { status: "AVAILABLE", steps: engine.listSteps(input.workflowId || input.id, input.filter || {}) };
  if (kind === "getStep") return engine.getStep(input.stepId || input.id);
  if (kind === "retryStep") return engine.retryStep(input.stepId || input.id, input.options || {});
  if (kind === "skipStep") return engine.skipStep(input.stepId || input.id, input.reason || "Skipped through LeviApplicationRuntime.", input.options || {});
  if (kind === "getReadySteps") return { status: "AVAILABLE", steps: engine.getReadySteps(input.workflowId || input.id, input.options || {}) };
  if (kind === "createCheckpoint") return engine.createCheckpoint(input.workflowId || input.id, input.checkpoint || input, input.options || {});
  if (kind === "listCheckpoints") return { status: "AVAILABLE", checkpoints: engine.listCheckpoints(input.workflowId || input.id, input.filter || {}) };
  if (kind === "restoreCheckpoint") return engine.restoreCheckpoint(input.checkpointId || input.id, input.options || {});
  if (kind === "resolveDecision") return engine.resolveDecision(input.decisionId || input.id, input.decision || input, input.options || {});
  if (kind === "tick") return engine.tick(input.options || input || {});
  return { status: "UNKNOWN_WORKFLOW_COMMAND", kind };
};

LeviApplicationRuntime.prototype.performanceEngine = function performanceEngine() {
  const descriptor = this.components.get("RepositoryPerformanceEngine");
  return descriptor && descriptor.instance || null;
};

LeviApplicationRuntime.prototype.performanceCommand = async function performanceCommand(kind, input = {}) {
  const engine = this.performanceEngine();
  if (!engine) {
    return {
      status: "UNCONFIGURED",
      performanceAvailable: false,
      warnings: ["RepositoryPerformanceEngine is not registered with the LeviApplicationRuntime."],
    };
  }
  if (kind === "health") return engine.getHealth(input.options || input || {});
  if (kind === "stats") return engine.getStats(input.options || input || {});
  if (kind === "cache") {
    const action = input.action || "summary";
    if (action === "clear") return engine.clearCache(input.filter || input);
    if (action === "warm") return engine.warmCache(input.entries || []);
    if (action === "put") return engine.putCache(input.entry || input);
    if (action === "get") return engine.getCache(input.lookup || input);
    return engine.getCacheSummary();
  }
  if (kind === "invalidate") return engine.invalidate(input, input.options || {});
  if (kind === "rebuild") return engine.rebuild(input, input.options || {});
  if (kind === "benchmark") return engine.runBenchmark(input, input.options || {});
  if (kind === "memory") {
    if (input.action === "enforce") return engine.enforceMemoryBudget();
    return engine.getMemoryUsage();
  }
  if (kind === "contextReuse") {
    if (input.action === "store") return engine.storeContextPackage(input.context || input);
    return engine.reuseContext(input.context || input);
  }
  if (kind === "graph") return engine.getGraph(input);
  return { status: "UNKNOWN_PERFORMANCE_COMMAND", kind };
};

LeviApplicationRuntime.prototype.reliabilityEngine = function reliabilityEngine() {
  const descriptor = this.components.get("ReliabilityAssuranceEngine");
  return descriptor && descriptor.instance || null;
};

LeviApplicationRuntime.prototype.reliabilityCommand = async function reliabilityCommand(kind, input = {}) {
  const engine = this.reliabilityEngine();
  if (!engine) {
    return {
      status: "UNCONFIGURED",
      reliabilityAvailable: false,
      warnings: ["ReliabilityAssuranceEngine is not registered with the LeviApplicationRuntime."],
    };
  }
  if (kind === "health") return engine.getHealth(input.options || input || {});
  if (kind === "stats") return engine.getStats(input.options || input || {});
  if (kind === "scenarios") {
    if (input.action === "register") return engine.registerScenario(input.scenario || input);
    if (input.action === "unregister") return engine.unregisterScenario(input.scenarioId || input.id);
    return { status: "AVAILABLE", scenarios: engine.listScenarios(input.filter || input || {}) };
  }
  if (kind === "run") return engine.runDiagnostics(input, input.options || {});
  if (kind === "cancel") return engine.cancelRun(input.runId || input.id, input.reason || "Cancelled through LeviApplicationRuntime.");
  if (kind === "report") return engine.getReliabilityReport(input.runId || input.id || null);
  if (kind === "consistency") return engine.checkConsistency(input);
  if (kind === "recovery") {
    if (input.scenarioId) {
      const scenario = engine.scenarios && engine.scenarios.get(input.scenarioId);
      if (scenario) return engine.verifyRecovery(scenario, input.observed || {});
    }
    return engine.lastRecoveryReport || { status: "UNAVAILABLE", warnings: ["No recovery report has been produced yet."] };
  }
  if (kind === "resources") return engine.checkResources(input);
  if (kind === "findings") return { status: "AVAILABLE", findings: engine.listFindings(input.filter || input || {}) };
  if (kind === "certify") return engine.certify(input);
  return { status: "UNKNOWN_RELIABILITY_COMMAND", kind };
};

LeviApplicationRuntime.prototype.securityAssuranceEngine = function securityAssuranceEngine() {
  const descriptor = this.components.get("SecurityAssuranceEngine");
  return descriptor && descriptor.instance || null;
};

LeviApplicationRuntime.prototype.securityAssuranceCommand = async function securityAssuranceCommand(kind, input = {}) {
  const engine = this.securityAssuranceEngine();
  if (!engine) {
    return {
      status: "UNCONFIGURED",
      securityAssuranceAvailable: false,
      warnings: ["SecurityAssuranceEngine is not registered with the LeviApplicationRuntime."],
    };
  }
  if (kind === "health") return engine.getHealth(input.options || input || {});
  if (kind === "stats") return engine.getStats(input.options || input || {});
  if (kind === "threatModel") return { status: "AVAILABLE", threatModel: engine.getThreatModel(input.id || input.threatModelId || "levi-rc002-threat-model") };
  if (kind === "assets") return { status: "AVAILABLE", assets: engine.listAssets(input.filter || input || {}) };
  if (kind === "boundaries") return { status: "AVAILABLE", boundaries: engine.listTrustBoundaries(input.filter || input || {}) };
  if (kind === "scenarios") {
    if (input.action === "register") return engine.registerScenario(input.scenario || input);
    if (input.action === "unregister") return engine.unregisterScenario(input.scenarioId || input.id);
    return { status: "AVAILABLE", scenarios: engine.listScenarios(input.filter || input || {}) };
  }
  if (kind === "createAudit") return engine.createRun(input, input.options || {});
  if (kind === "startAudit") return engine.startRun(input.runId || input.id, input.options || {});
  if (kind === "run") return engine.runAudit(input, input.options || {});
  if (kind === "cancel") return engine.cancelRun(input.runId || input.id, input.reason || "Cancelled through LeviApplicationRuntime.");
  if (kind === "listAudits") return { status: "AVAILABLE", runs: engine.listRuns(input.filter || input || {}) };
  if (kind === "report") return engine.getSecurityReport({ runId: input.runId || input.id || null });
  if (kind === "findings") return { status: "AVAILABLE", findings: engine.listFindings(input.filter || input || {}) };
  if (kind === "blockers") return { status: "AVAILABLE", blockers: engine.getReleaseBlockers(input.filter || input || {}) };
  if (kind === "checkApprovalSecurity") return engine.checkApprovalIntegrity(input.target || {}, input.options || {});
  if (kind === "checkWorkspaceIsolation") return engine.checkWorkspaceIsolation(input.target || {}, input.options || {});
  if (kind === "checkCommandSecurity") return engine.checkCommandSafety(input.target || {}, input.options || {});
  if (kind === "checkSourceControl") return engine.checkSourceControlSecurity(input.target || {}, input.options || {});
  if (kind === "checkPromptInjection") return engine.checkPromptInjection(input.target || {}, input.options || {});
  if (kind === "checkSecrets") return engine.checkSecretHandling(input.target || {}, input.options || {});
  if (kind === "checkProviders") return engine.checkProviderSafety(input.target || {}, input.options || {});
  if (kind === "checkPrivacy") return engine.checkPrivacyIntegrity(input.target || {}, input.options || {});
  if (kind === "checkWebview") return engine.checkWebviewSafety(input.target || {}, input.options || {});
  if (kind === "checkPersistence") return engine.checkPersistenceSafety(input.target || {}, input.options || {});
  if (kind === "checkSerialization") return engine.checkSerializationSafety(input.target || {}, input.options || {});
  if (kind === "checkDependencies") return engine.checkDependencySecurity(input.options || input || {});
  if (kind === "checkSupplyChain") return engine.checkSupplyChain(input.options || input || {});
  if (kind === "checkResources") return engine.checkResourceAbuse(input.target || {}, input.options || {});
  if (kind === "check") {
    const target = input.target || {};
    const options = input.options || {};
    if (input.domain === "authority") return engine.checkAuthorityIntegrity(target, options);
    if (input.domain === "approval") return engine.checkApprovalIntegrity(target, options);
    if (input.domain === "privacy") return engine.checkPrivacyIntegrity(target, options);
    if (input.domain === "workspace") return engine.checkWorkspaceIsolation(target, options);
    if (input.domain === "path") return engine.checkPathSafety(target, options);
    if (input.domain === "command") return engine.checkCommandSafety(target, options);
    if (input.domain === "credential") return engine.checkCredentialSafety(target, options);
    if (input.domain === "persistence") return engine.checkPersistenceSafety(target, options);
    if (input.domain === "provider") return engine.checkProviderSafety(target, options);
    if (input.domain === "webview") return engine.checkWebviewSafety(target, options);
    if (input.domain === "serialization") return engine.checkSerializationSafety(target, options);
    if (input.domain === "dependency") return engine.checkDependencies(options);
    if (input.domain === "sourceControl") return engine.checkSourceControlSecurity(target, options);
    if (input.domain === "promptInjection") return engine.checkPromptInjection(target, options);
    if (input.domain === "secretHandling") return engine.checkSecretHandling(target, options);
    if (input.domain === "supplyChain") return engine.checkSupplyChain(options);
    if (input.domain === "resourceAbuse") return engine.checkResourceAbuse(target, options);
    return engine.checkAll(input);
  }
  if (kind === "certify") {
    if (input.evaluate === true) return engine.evaluateSecurity(input.options || input);
    return engine.certifySecurity(input.profile || "RELEASE_CANDIDATE", input.options || input || {});
  }
  return { status: "UNKNOWN_SECURITY_ASSURANCE_COMMAND", kind };
};

LeviApplicationRuntime.prototype.stressScalabilityEngine = function stressScalabilityEngine() {
  const descriptor = this.components.get("StressScalabilityEngine");
  return descriptor && descriptor.instance || null;
};

LeviApplicationRuntime.prototype.stressScalabilityCommand = async function stressScalabilityCommand(kind, input = {}) {
  const engine = this.stressScalabilityEngine();
  if (!engine) {
    return {
      status: "UNCONFIGURED",
      stressScalabilityAvailable: false,
      warnings: ["StressScalabilityEngine is not registered with the LeviApplicationRuntime."],
    };
  }
  if (kind === "health") return engine.getHealth(input.options || input || {});
  if (kind === "stats") return engine.getStats(input.options || input || {});
  if (kind === "profiles") {
    if (input.action === "register") return engine.registerProfile(input.profile || input);
    if (input.action === "unregister") return engine.unregisterProfile(input.profileId || input.id);
    return { status: "AVAILABLE", profiles: engine.listProfiles(input.filter || input || {}) };
  }
  if (kind === "repositories") {
    if (input.action === "register") return engine.registerSyntheticRepository(input.repository || input);
    return { status: "AVAILABLE", repositories: engine.listSyntheticRepositories(input.filter || input || {}) };
  }
  if (kind === "scenarios") {
    if (input.action === "register") return engine.registerScenario(input.scenario || input);
    if (input.action === "unregister") return engine.unregisterScenario(input.scenarioId || input.id);
    return { status: "AVAILABLE", scenarios: engine.listScenarios(input.filter || input || {}) };
  }
  if (kind === "createRun") return engine.createRun(input, input.options || {});
  if (kind === "startRun") return engine.startRun(input.runId || input.id, input.options || {});
  if (kind === "run") return engine.runStress(input, input.options || {});
  if (kind === "cancel") return engine.cancelRun(input.runId || input.id, input.reason || "Cancelled through LeviApplicationRuntime.");
  if (kind === "listRuns") return { status: "AVAILABLE", runs: engine.listRuns(input.filter || input || {}) };
  if (kind === "report") return engine.getScalabilityReport({ runId: input.runId || input.id || null });
  if (kind === "findings") return { status: "AVAILABLE", findings: engine.listFindings(input.filter || input || {}) };
  if (kind === "blockers") return { status: "AVAILABLE", blockers: engine.getReleaseBlockers(input.filter || input || {}) };
  if (kind === "checkRepository") return engine.checkRepositoryStress(input.options || input || {});
  if (kind === "checkConcurrency") return engine.checkConcurrency(input.options || input || {});
  if (kind === "checkAgents") return engine.checkAgentStress(input.options || input || {});
  if (kind === "checkMultiAgent") return engine.checkMultiAgentStress(input.options || input || {});
  if (kind === "checkWorkflows") return engine.checkWorkflowStress(input.options || input || {});
  if (kind === "checkProviders") return engine.checkProviderStress(input.options || input || {});
  if (kind === "checkQueues") return engine.checkQueueStability(input.options || input || {});
  if (kind === "checkMemory") return engine.checkMemoryStability(input.options || input || {});
  if (kind === "checkCache") return engine.checkCacheEfficiency(input.options || input || {});
  if (kind === "checkEvents") return engine.checkEventStability(input.options || input || {});
  if (kind === "checkPersistence") return engine.checkPersistenceRecovery(input.options || input || {});
  if (kind === "checkCancellation") return engine.checkCancellation(input.options || input || {});
  if (kind === "checkPresentation") return engine.checkPresentationPressure(input.options || input || {});
  if (kind === "cleanup") return engine.checkCleanup(input.options || input || {});
  if (kind === "check") return engine.checkAll(input.options || input || {});
  if (kind === "certify") {
    if (input.evaluate === true) return engine.evaluateScalability(input.options || input);
    return engine.certifyScalability(input.profile || "RELEASE_CANDIDATE", input.options || input || {});
  }
  return { status: "UNKNOWN_STRESS_SCALABILITY_COMMAND", kind };
};

LeviApplicationRuntime.prototype.releaseQualificationEngine = function releaseQualificationEngine() {
  const descriptor = this.components.get("ReleaseQualificationEngine");
  return descriptor && descriptor.instance || null;
};

LeviApplicationRuntime.prototype.releaseQualificationCommand = async function releaseQualificationCommand(kind, input = {}) {
  const engine = this.releaseQualificationEngine();
  if (!engine) {
    return {
      status: "UNCONFIGURED",
      qualificationAvailable: false,
      warnings: ["ReleaseQualificationEngine is not registered with the LeviApplicationRuntime."],
    };
  }
  if (kind === "health") return engine.getHealth(input.options || input || {});
  if (kind === "stats") return engine.getStats(input.options || input || {});
  if (kind === "fixtures") {
    if (input.action === "register") return engine.registerFixture(input.fixture || input);
    if (input.action === "unregister") return engine.unregisterFixture(input.fixtureId || input.id);
    if (input.action === "prepare") return engine.prepareFixture(input.fixtureId || input.id, input.options || {});
    if (input.action === "cleanup") return engine.cleanupFixture(input.fixtureId || input.id, input.options || {});
    return { status: "AVAILABLE", fixtures: engine.listFixtures(input.filter || input || {}) };
  }
  if (kind === "journeys") {
    if (input.action === "register") return engine.registerJourney(input.journey || input);
    if (input.action === "unregister") return engine.unregisterJourney(input.journeyId || input.id);
    return { status: "AVAILABLE", journeys: engine.listJourneys(input.filter || input || {}) };
  }
  if (kind === "suites") {
    if (input.action === "register") return engine.registerSuite(input.suite || input);
    if (input.action === "unregister") return engine.unregisterSuite(input.suiteId || input.id);
    return { status: "AVAILABLE", suites: engine.listSuites(input.filter || input || {}) };
  }
  if (kind === "scenarios") {
    if (input.action === "register") return engine.registerScenario(input.scenario || input);
    if (input.action === "unregister") return engine.unregisterScenario(input.scenarioId || input.id);
    return { status: "AVAILABLE", scenarios: engine.listScenarios(input.filter || input || {}) };
  }
  if (kind === "createRun") return engine.createRun(input, input.options || {});
  if (kind === "startRun") return engine.startRun(input.runId || input.id, input.options || {});
  if (kind === "run") return engine.runQualification(input, input.options || {});
  if (kind === "cancel") return engine.cancelRun(input.runId || input.id, input.reason || "Cancelled through LeviApplicationRuntime.");
  if (kind === "report") return engine.getQualificationReport({ runId: input.runId || input.id || null });
  if (kind === "blockers") return { status: "AVAILABLE", blockers: engine.getReleaseBlockers(input.filter || input || {}) };
  if (kind === "manual") {
    if (input.action === "create") return engine.createManualVerification(input.record || input, input.options || {});
    if (input.action === "update") return engine.updateManualVerification(input.recordId || input.id, input.patch || input, input.options || {});
    if (input.action === "complete") return engine.completeManualVerification(input.recordId || input.id, input.result || input, input.options || {});
    if (input.pending === true) return { status: "AVAILABLE", manualVerifications: engine.getPendingManualVerifications(input.filter || {}) };
    return { status: "AVAILABLE", manualVerifications: engine.listManualVerifications(input.filter || input || {}) };
  }
  if (kind === "defects") {
    if (input.action === "create") return engine.createDefect(input.defect || input, input.options || {});
    if (input.action === "update") return engine.updateDefect(input.defectId || input.id, input.patch || input);
    if (input.action === "resolve") return engine.resolveDefect(input.defectId || input.id, input.resolution || input, input.options || {});
    if (input.action === "verify") return engine.verifyDefect(input.defectId || input.id, input.evidence || [], input.options || {});
    return { status: "AVAILABLE", defects: engine.listDefects(input.filter || input || {}) };
  }
  if (kind === "extensionHost") return engine.checkExtensionHost(input.options || input || {});
  if (kind === "localOllama") return engine.checkLocalOllama(input.options || input || {});
  if (kind === "readiness") return engine.evaluateReadiness(input.options || input || {});
  if (kind === "certify") {
    if (input.evaluate === true) return engine.evaluateReadiness(input.options || input || {});
    return engine.certifyQualification(input.profile || "RELEASE_CANDIDATE", input.options || input || {});
  }
  return { status: "UNKNOWN_RELEASE_QUALIFICATION_COMMAND", kind };
};

function runtimeApprovalForProposal(runtime, approvalRequestId, proposal) {
  if (!approvalRequestId || !proposal) return null;
  const request = runtime.approvalRequests && runtime.approvalRequests.get(approvalRequestId);
  if (!request || request.status !== ApprovalStatuses.APPROVED) return null;
  return {
    id: request.id,
    proposalId: proposal.id,
    proposalHash: proposal.proposalHash,
    workspaceRevision: proposal.workspaceRevision,
    status: "APPROVED",
    decidedBy: request.decision && request.decision.decidedBy || "runtime-approval",
    decidedAt: request.resolvedAt || runtime.now(),
    reason: request.decision && request.decision.reason || "Runtime approval request approved.",
  };
}

function command(id, name, operationType, requiredCapabilities, handler, extra = {}) {
  return {
    id,
    name,
    description: extra.description || `${name} command.`,
    domain: id.split(".")[0],
    version: "1.0.0",
    inputSchema: extra.inputSchema || { type: "object" },
    outputSchema: extra.outputSchema || { type: "object" },
    requiredCapabilities,
    requiredWorkspaceState: extra.requiredWorkspaceState || [],
    requiresSession: extra.requiresSession === true,
    securitySensitive: extra.securitySensitive === true,
    approvalSensitive: extra.approvalSensitive === true,
    cancellable: extra.cancellable !== false,
    timeoutMs: extra.timeoutMs || null,
    operationType,
    handler,
    metadata: extra.metadata || {},
  };
}

function normalizeRuntimeConfiguration(input = {}) {
  const merged = deepMerge(DEFAULT_CONFIGURATION, input);
  const config = {
    id: requiredString(merged.id, "Runtime configuration id is required."),
    version: requiredString(merged.version, "Runtime configuration version is required."),
    schemaVersion: Number(merged.schemaVersion || APPLICATION_RUNTIME_SCHEMA_VERSION),
    storageRoot: requiredString(merged.storageRoot, "Runtime configuration storageRoot is required."),
    workspaceStorageRoot: requiredString(merged.workspaceStorageRoot, "Runtime configuration workspaceStorageRoot is required."),
    offlineMode: merged.offlineMode !== false,
    strictSecurity: merged.strictSecurity !== false,
    approvalPolicy: requiredString(merged.approvalPolicy, "Runtime configuration approvalPolicy is required.").toUpperCase(),
    defaultTimeoutMs: normalizePositiveInteger(merged.defaultTimeoutMs, DEFAULT_CONFIGURATION.defaultTimeoutMs),
    shutdownTimeoutMs: normalizePositiveInteger(merged.shutdownTimeoutMs, DEFAULT_CONFIGURATION.shutdownTimeoutMs),
    maximumConcurrentOperations: normalizePositiveInteger(merged.maximumConcurrentOperations, DEFAULT_CONFIGURATION.maximumConcurrentOperations),
    maximumQueuedOperations: normalizePositiveInteger(merged.maximumQueuedOperations, DEFAULT_CONFIGURATION.maximumQueuedOperations),
    maximumSessions: normalizePositiveInteger(merged.maximumSessions, DEFAULT_CONFIGURATION.maximumSessions),
    maximumWorkspaces: normalizePositiveInteger(merged.maximumWorkspaces, DEFAULT_CONFIGURATION.maximumWorkspaces),
    maximumEventHistory: normalizePositiveInteger(merged.maximumEventHistory, DEFAULT_CONFIGURATION.maximumEventHistory),
    maximumOperationHistory: normalizePositiveInteger(merged.maximumOperationHistory, DEFAULT_CONFIGURATION.maximumOperationHistory),
    maximumResultSize: normalizePositiveInteger(merged.maximumResultSize, DEFAULT_CONFIGURATION.maximumResultSize),
    eventBufferSize: normalizePositiveInteger(merged.eventBufferSize, DEFAULT_CONFIGURATION.eventBufferSize),
    persistenceEnabled: merged.persistenceEnabled !== false,
    autoSaveEnabled: merged.autoSaveEnabled === true,
    autoSaveIntervalMs: normalizePositiveInteger(merged.autoSaveIntervalMs, DEFAULT_CONFIGURATION.autoSaveIntervalMs),
    recoveryEnabled: merged.recoveryEnabled !== false,
    diagnosticsEnabled: merged.diagnosticsEnabled !== false,
    featureFlags: clonePlainObject({ ...DEFAULT_CONFIGURATION.featureFlags, ...(merged.featureFlags || {}) }),
    metadata: clonePlainObject(merged.metadata || {}),
  };
  return Object.freeze(config);
}

function validateRuntimeConfiguration(config, bounds) {
  if (config.schemaVersion !== APPLICATION_RUNTIME_SCHEMA_VERSION) throw new Error("Unsupported runtime configuration schema version.");
  if (config.maximumConcurrentOperations > bounds.maximumConcurrentOperations) throw new Error("Configured concurrency exceeds runtime bounds.");
  if (config.maximumQueuedOperations > bounds.maximumQueuedOperations) throw new Error("Configured queue size exceeds runtime bounds.");
  if (config.maximumWorkspaces > bounds.maximumWorkspaces) throw new Error("Configured workspace limit exceeds runtime bounds.");
  if (config.maximumSessions > bounds.maximumSessions) throw new Error("Configured session limit exceeds runtime bounds.");
  if (config.maximumResultSize > bounds.maximumResultSize) throw new Error("Configured result-size limit exceeds runtime bounds.");
  return true;
}

function boundsFromConfiguration(config) {
  return {
    maximumWorkspaces: config.maximumWorkspaces,
    maximumSessions: config.maximumSessions,
    maximumQueuedOperations: config.maximumQueuedOperations,
    maximumConcurrentOperations: config.maximumConcurrentOperations,
    maximumEventHistory: config.maximumEventHistory,
    maximumOperationTime: config.defaultTimeoutMs,
    maximumShutdownTime: config.shutdownTimeoutMs,
    maximumResultSize: config.maximumResultSize,
  };
}

function normalizeWorkspaceDescriptor(input = {}, runtime) {
  const timestamp = runtime.now();
  return {
    id: input.id || runtime.nextId("workspace", input.uri || input.rootPath || input.name || timestamp),
    uri: requiredString(input.uri || input.rootPath || input.id, "Workspace uri is required."),
    name: input.name || workspaceNameFromUri(input.uri || input.rootPath || input.id),
    rootPath: input.rootPath || input.uri || null,
    projectId: input.projectId || stableId("project", input.uri || input.rootPath || input.id),
    state: normalizeEnum(input.state || WorkspaceStates.CLOSED, WorkspaceStates, "workspace state"),
    revision: input.revision || null,
    repositoryType: input.repositoryType || "unknown",
    openedAt: input.openedAt || null,
    lastAnalyzedAt: input.lastAnalyzedAt || null,
    capabilities: safeArray(input.capabilities),
    limitations: safeArray(input.limitations),
    health: clonePlainObject(input.health || {}),
    metadata: clonePlainObject(input.metadata || {}),
  };
}

function normalizeRuntimeSession(input = {}, runtime, options = {}) {
  const timestamp = runtime.now();
  return {
    id: input.id || runtime.nextId("session", { workspaceId: input.workspaceId, objective: input.objective, timestamp }),
    workspaceId: input.workspaceId || null,
    projectId: input.projectId || null,
    type: input.type || "project",
    state: normalizeEnum(input.state || SessionStates.CREATED, SessionStates, "session state"),
    objective: input.objective || "",
    currentOperationId: input.currentOperationId || null,
    operationIds: safeArray(input.operationIds),
    approvalRequestIds: safeArray(input.approvalRequestIds),
    securityDecisionIds: safeArray(input.securityDecisionIds),
    contextPackageIds: safeArray(input.contextPackageIds),
    planIds: safeArray(input.planIds),
    executionIds: safeArray(input.executionIds),
    evidence: safeArray(input.evidence),
    metadata: clonePlainObject(input.metadata || {}),
    createdAt: input.createdAt || timestamp,
    updatedAt: input.updatedAt || timestamp,
    expiresAt: input.expiresAt || options.expiresAt || null,
  };
}

function normalizeRuntimeOperation(input = {}, runtime, options = {}) {
  const timestamp = runtime.now();
  const priority = normalizeEnum(input.priority || options.priority || OperationPriorities.NORMAL, OperationPriorities, "operation priority");
  return {
    id: input.id || runtime.nextId("operation", { type: input.type, command: input.command, sequence: runtime.operationOrder + 1 }),
    sequence: ++runtime.operationOrder,
    sessionId: input.sessionId || options.sessionId || null,
    workspaceId: input.workspaceId || options.workspaceId || null,
    projectId: input.projectId || options.projectId || null,
    type: normalizeEnum(input.type || OperationTypes.CUSTOM, OperationTypes, "operation type"),
    command: input.command || null,
    state: normalizeEnum(input.state || OperationStates.QUEUED, OperationStates, "operation state"),
    priority,
    input: clonePlainObject(input.input === undefined ? input : input.input),
    output: input.output === undefined ? null : clonePlainObject(input.output),
    progress: normalizeRuntimeProgress(input.progress || { operationId: input.id || "pending", stage: "queued", message: "Queued.", current: 0, total: 100, percentage: 0, cancellable: true }, runtime),
    currentStage: input.currentStage || "queued",
    stages: safeArray(input.stages || ["queued"]),
    result: input.result || null,
    error: input.error || null,
    cancellation: input.cancellation || { requested: false },
    approval: input.approval || null,
    security: input.security || null,
    evidence: safeArray(input.evidence),
    childOperationIds: safeArray(input.childOperationIds),
    parentOperationId: input.parentOperationId || null,
    startedAt: input.startedAt || null,
    completedAt: input.completedAt || null,
    createdAt: input.createdAt || timestamp,
    updatedAt: input.updatedAt || timestamp,
    metadata: { timeoutMs: options.timeoutMs || input.timeoutMs || null, ...(input.metadata || {}) },
  };
}

function normalizeRuntimeProgress(input = {}, runtime) {
  const total = input.total === undefined || input.total === null ? null : Math.max(0, Number(input.total));
  const current = Math.max(0, Number(input.current || 0));
  const percentage = input.percentage === undefined ? (total ? Math.round((current / total) * 100) : 0) : Number(input.percentage);
  return {
    operationId: input.operationId || "pending",
    stage: input.stage || "unknown",
    message: input.message || "",
    current,
    total,
    percentage: Math.max(0, Math.min(100, Math.round(percentage))),
    indeterminate: input.indeterminate === true || total === null,
    cancellable: input.cancellable !== false,
    metadata: clonePlainObject(input.metadata || {}),
    timestamp: input.timestamp || runtime.now(),
  };
}

function normalizeRuntimeResult(input = {}, runtime) {
  const timestamp = runtime.now();
  return {
    id: input.id || runtime.nextId("result", { operationId: input.operationId, status: input.status, timestamp }),
    operationId: requiredString(input.operationId, "Runtime result operationId is required."),
    success: input.success === true,
    partial: input.partial === true,
    status: input.status || (input.success ? "SUCCEEDED" : "FAILED"),
    data: input.data === undefined ? null : clonePlainObject(input.data),
    warnings: safeArray(input.warnings),
    limitations: safeArray(input.limitations),
    evidence: safeArray(input.evidence),
    confidence: normalizeUnit(input.confidence, input.success ? 1 : 0),
    completeness: normalizeUnit(input.completeness, input.success ? 1 : 0),
    error: input.error || null,
    metadata: clonePlainObject(input.metadata || {}),
    createdAt: input.createdAt || timestamp,
  };
}

function normalizeRuntimeError(error, runtime, category, input = {}) {
  const source = error && error.code && error.category ? error : {};
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : source.message || "Runtime error.";
  const timestamp = runtime.now();
  return {
    id: source.id || runtime.nextId("error", { code: source.code || input.code || normalizeToken(message), timestamp }),
    code: source.code || input.code || normalizeToken(message),
    category: normalizeEnum(source.category || input.category || category || ErrorCategories.UNKNOWN, ErrorCategories, "error category"),
    message,
    userMessage: source.userMessage || input.userMessage || message,
    operationId: source.operationId || input.operationId || null,
    sessionId: source.sessionId || input.sessionId || null,
    workspaceId: source.workspaceId || input.workspaceId || null,
    retryable: source.retryable === true || input.retryable === true,
    recoverable: source.recoverable === true || input.recoverable === true,
    severity: normalizeEnum(source.severity || input.severity || ErrorSeverities.ERROR, ErrorSeverities, "error severity"),
    cause: source.cause || (error instanceof Error && error.name ? error.name : null),
    details: clonePlainObject(source.details || input.details || {}),
    evidence: safeArray(source.evidence || input.evidence),
    suggestedActions: safeArray(source.suggestedActions || input.suggestedActions),
    metadata: clonePlainObject(source.metadata || input.metadata || {}),
    createdAt: source.createdAt || timestamp,
  };
}

function normalizeRuntimeEvent(input = {}, runtime, sequence) {
  return {
    id: input.id || runtime.nextId("event", { type: input.type, sequence }),
    sequence,
    type: requiredString(input.type, "Runtime event type is required."),
    source: input.source || "runtime",
    runtimeId: input.runtimeId || runtime.configuration.id,
    workspaceId: input.workspaceId || null,
    projectId: input.projectId || null,
    sessionId: input.sessionId || null,
    operationId: input.operationId || null,
    payload: serializeForFrontend(input.payload || {}, { maximumResultSize: runtime.bounds.maximumResultSize }),
    evidence: safeArray(input.evidence),
    timestamp: input.timestamp || runtime.now(),
    metadata: clonePlainObject(input.metadata || {}),
  };
}

function normalizeRuntimeCommand(command, runtime) {
  if (!command || typeof command.handler !== "function") throw new Error("Runtime command handler is required.");
  return {
    id: requiredString(command.id, "Runtime command id is required."),
    name: requiredString(command.name || command.id, "Runtime command name is required."),
    description: command.description || "",
    domain: command.domain || command.id.split(".")[0],
    version: command.version || "1.0.0",
    inputSchema: clonePlainObject(command.inputSchema || {}),
    outputSchema: clonePlainObject(command.outputSchema || {}),
    requiredCapabilities: safeArray(command.requiredCapabilities),
    requiredWorkspaceState: safeArray(command.requiredWorkspaceState),
    requiresSession: command.requiresSession === true,
    securitySensitive: command.securitySensitive === true,
    approvalSensitive: command.approvalSensitive === true,
    cancellable: command.cancellable !== false,
    timeoutMs: command.timeoutMs || runtime.configuration.defaultTimeoutMs,
    handler: command.handler,
    aliases: safeArray(command.aliases),
    protected: command.protected === true,
    operationType: command.operationType || OperationTypes.CUSTOM,
    metadata: clonePlainObject(command.metadata || {}),
  };
}

function normalizeApprovalRequest(input = {}, runtime) {
  const timestamp = input.requestedAt || runtime.now();
  return {
    id: input.id || runtime.nextId("approval", { operationId: input.operationId, requestedAction: input.requestedAction, timestamp }),
    sessionId: input.sessionId || null,
    operationId: input.operationId || null,
    workspaceId: input.workspaceId || null,
    projectId: input.projectId || null,
    type: input.type || "COMMAND",
    title: input.title || "Approval requested",
    description: input.description || "",
    requestedAction: input.requestedAction || null,
    risks: safeArray(input.risks),
    scope: clonePlainObject(input.scope || {}),
    evidence: safeArray(input.evidence),
    status: normalizeEnum(input.status || ApprovalStatuses.PENDING, ApprovalStatuses, "approval status"),
    decision: input.decision || null,
    requestedAt: timestamp,
    expiresAt: input.expiresAt || null,
    resolvedAt: input.resolvedAt || null,
    metadata: clonePlainObject(input.metadata || {}),
  };
}

function normalizeRuntimeSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) throw new Error("Runtime snapshot must be an object.");
  if (Number(snapshot.schemaVersion) !== APPLICATION_RUNTIME_SCHEMA_VERSION) throw new Error("Unsupported runtime snapshot schema version.");
  return {
    schemaVersion: APPLICATION_RUNTIME_SCHEMA_VERSION,
    runtimeState: normalizeEnum(snapshot.runtimeState || RuntimeStates.CREATED, RuntimeStates, "runtime state"),
    configuration: snapshot.configuration || {},
    workspaces: safeArray(snapshot.workspaces),
    sessions: safeArray(snapshot.sessions),
    operations: safeArray(snapshot.operations),
    commands: safeArray(snapshot.commands),
    approvalRequests: safeArray(snapshot.approvalRequests),
    eventCheckpoints: safeArray(snapshot.eventCheckpoints),
    runtimeHealthHistory: safeArray(snapshot.runtimeHealthHistory),
    statistics: snapshot.statistics || {},
  };
}

function calculateRuntimeHealthScores(input) {
  const warnings = [];
  const blockers = [];
  const deductions = {};
  const runtime = input.runtime;
  const securityMissing = !runtime.securityValidator;
  const approvalMissing = !runtime.approvalGateway;
  const certificationBelow = input.certification.levelBelowIdeCoreReady === true;
  const persistenceUnavailable = runtime.configuration.persistenceEnabled && input.integrationHealth.persistenceStatus === "PARTIAL";
  if (securityMissing) blockers.push({ severity: ErrorSeverities.CRITICAL, reason: "Security enforcement unavailable." });
  if (approvalMissing) blockers.push({ severity: ErrorSeverities.CRITICAL, reason: "Approval gating unavailable." });
  if (certificationBelow) warnings.push("Certification is below IDE_CORE_READY.");
  if (persistenceUnavailable) warnings.push("Persistence is degraded.");
  if (runtime.queue.length > runtime.bounds.maximumQueuedOperations) blockers.push({ severity: ErrorSeverities.ERROR, reason: "Operation queue bound exceeded." });
  deductions.initialization = runtime.state === RuntimeStates.FAILED ? 100 : runtime.state === RuntimeStates.DEGRADED ? 20 : 0;
  deductions.configuration = 0;
  deductions.componentAvailability = securityMissing || approvalMissing ? 100 : 0;
  deductions.capabilityCoverage = input.capabilities.unavailableCapabilities.length * 5;
  deductions.workspaceReadiness = runtime.workspaces.size ? Array.from(runtime.workspaces.values()).filter((workspace) => workspace.state !== WorkspaceStates.READY).length * 15 : 0;
  deductions.operationReliability = Array.from(runtime.operations.values()).filter((operation) => [OperationStates.FAILED, OperationStates.TIMED_OUT].includes(operation.state)).length * 5;
  deductions.eventReliability = runtime.stats.listenerFailures * 10;
  deductions.persistenceReliability = persistenceUnavailable ? 20 : 0;
  deductions.securityIntegrity = securityMissing ? 100 : 0;
  deductions.approvalIntegrity = approvalMissing ? 100 : 0;
  deductions.integrationCertification = certificationBelow ? 25 : 0;
  const scores = {};
  for (const [domain, deduction] of Object.entries(deductions)) {
    scores[domain] = score(domain, 100 - deduction);
  }
  let overall = average(Object.values(scores).map((entry) => entry.value));
  if (securityMissing) overall = Math.min(overall, 40);
  if (approvalMissing) overall = Math.min(overall, 50);
  if (certificationBelow) overall = Math.min(overall, 85);
  scores.overallRuntimeHealth = score("overallRuntimeHealth", overall);
  return {
    warnings: warnings.slice(0, runtime.bounds.maximumWarningCount),
    blockers,
    confidence: normalizeUnit(overall / 100, 0.8),
    completeness: normalizeUnit(1 - (warnings.length + blockers.length) / 10, 0.8),
    scores,
    summary: {
      initialization: scores.initialization.value,
      configuration: scores.configuration.value,
      componentAvailability: scores.componentAvailability.value,
      capabilityCoverage: scores.capabilityCoverage.value,
      workspaceReadiness: scores.workspaceReadiness.value,
      operationReliability: scores.operationReliability.value,
      eventReliability: scores.eventReliability.value,
      persistenceReliability: scores.persistenceReliability.value,
      securityIntegrity: scores.securityIntegrity.value,
      approvalIntegrity: scores.approvalIntegrity.value,
      integrationCertification: scores.integrationCertification.value,
      overallRuntimeHealth: scores.overallRuntimeHealth.value,
    },
  };
}

function score(label, value) {
  const bounded = Math.max(0, Math.min(100, Math.round(value)));
  return {
    value: bounded,
    baseline: 100,
    deductions: bounded < 100 ? [{ reason: label, value: 100 - bounded }] : [],
    caps: [],
    evidence: [{ source: "LeviApplicationRuntime", signal: label }],
    confidence: 0.9,
  };
}

function validateWorkspaceAdapter(adapter) {
  const required = ["normalizeUri", "validateWorkspace", "openWorkspace", "closeWorkspace", "getWorkspaceMetadata", "getWorkspaceRevision", "listFiles", "readFile", "stat", "watchWorkspace", "unwatchWorkspace", "resolvePath"];
  const missing = required.filter((method) => !adapter || typeof adapter[method] !== "function");
  if (missing.length) throw new Error(`Workspace adapter missing methods: ${missing.join(", ")}.`);
}

function validateTransition(fromState, toState, transitions, label) {
  if (fromState === toState) return true;
  if (!transitions[fromState] || !transitions[fromState].includes(toState)) throw new Error(`Invalid ${label} state transition: ${fromState} -> ${toState}.`);
  return true;
}

function freezeTransitions(constants, transitions) {
  const result = {};
  for (const state of Object.values(constants)) result[state] = Object.freeze(transitions[state] || []);
  return Object.freeze(result);
}

function serializeForFrontend(value, options = {}) {
  const seen = new WeakSet();
  const maximumResultSize = options.maximumResultSize || DEFAULT_CONFIGURATION.maximumResultSize;
  const sanitized = sanitize(value, seen);
  const text = JSON.stringify(sanitized);
  if (text.length <= maximumResultSize) return sanitized;
  return {
    truncated: true,
    originalSize: text.length,
    maximumResultSize,
    preview: text.slice(0, Math.max(0, maximumResultSize - 128)),
  };
}

function sanitize(value, seen) {
  if (value === undefined || typeof value === "function") return undefined;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value instanceof Date) return value.toISOString();
  if (value === null || typeof value !== "object") return typeof value === "string" && isSecretValue(value) ? "[REDACTED]" : value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, seen)).filter((entry) => entry !== undefined);
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (typeof value[key] === "function") continue;
    if (["stack", "adapter", "handler", "instance", "runtime"].includes(key) || isSecretKey(key)) {
      output[key] = "[REDACTED]";
      continue;
    }
    const sanitized = sanitize(value[key], seen);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function approvalActionForCommand(command) {
  if (command.id.startsWith("learning.")) return APPROVAL_ACTIONS.MODIFY_CONFIGURATION;
  if (command.id.startsWith("persistence.")) return APPROVAL_ACTIONS.MODIFY_CONFIGURATION;
  if (command.id.startsWith("execution.")) return APPROVAL_ACTIONS.EXECUTE_SHELL_COMMAND;
  return APPROVAL_ACTIONS.SECURITY_REVIEW;
}

function commandMetadata(command) {
  const copy = clonePlainObject(command);
  delete copy.handler;
  return copy;
}

function commandSnapshotMetadata(command) {
  return {
    id: command.id,
    domain: command.domain,
    operationType: command.operationType,
    securitySensitive: command.securitySensitive === true,
    approvalSensitive: command.approvalSensitive === true,
    protected: command.protected === true,
  };
}

function compactRuntimeEvent(event = {}) {
  return {
    type: event.type,
    operationId: event.operationId || null,
    sessionId: event.sessionId || null,
    workspaceId: event.workspaceId || null,
    sequence: event.sequence || null,
    timestamp: event.timestamp || null,
  };
}

function compactRuntimeHealth(health = {}) {
  return {
    runtimeState: health.runtimeState || null,
    overallRuntimeHealth: health.overallRuntimeHealth,
    blockers: safeArray(health.blockers).slice(0, 8),
    warnings: safeArray(health.warnings).slice(0, 8),
    checkedAt: health.checkedAt || health.generatedAt || null,
  };
}

function summarizeOperation(operation) {
  return {
    ...clonePlainObject(operation),
    input: summarizeInput(operation.input),
    output: summarizeInput(operation.output),
  };
}

function envelopeFor(operation, runtime, success, data, error = null) {
  const op = runtime.operations.get(operation.id) || operation;
  return serializeForFrontend({
    id: op.result && op.result.id || runtime.nextId("result", { operationId: op.id, success }),
    operationId: op.id,
    success,
    partial: op.state === OperationStates.PARTIALLY_SUCCEEDED || op.state === OperationStates.WAITING_FOR_APPROVAL,
    status: op.state,
    data: data === undefined ? op.output : data,
    warnings: [],
    limitations: [],
    evidence: op.evidence || [],
    confidence: success ? 1 : 0,
    completeness: success ? 1 : 0,
    error,
    metadata: { frontendSafe: true },
    createdAt: runtime.now(),
  }, { maximumResultSize: runtime.bounds.maximumResultSize });
}

function eventTypeForOperationState(state) {
  if (state === OperationStates.SUCCEEDED) return RuntimeEventTypes.OPERATION_SUCCEEDED;
  if (state === OperationStates.PARTIALLY_SUCCEEDED) return RuntimeEventTypes.OPERATION_PARTIALLY_SUCCEEDED;
  if (state === OperationStates.CANCELLED) return RuntimeEventTypes.OPERATION_CANCELLED;
  if (state === OperationStates.TIMED_OUT) return RuntimeEventTypes.OPERATION_TIMED_OUT;
  return RuntimeEventTypes.OPERATION_FAILED;
}

function isTerminalOperation(state) {
  return [OperationStates.CANCELLED, OperationStates.SUCCEEDED, OperationStates.PARTIALLY_SUCCEEDED, OperationStates.FAILED, OperationStates.TIMED_OUT].includes(state);
}

function eventMatchesFilter(event, filter = {}) {
  if (filter.type && event.type !== filter.type) return false;
  if (filter.types && !safeArray(filter.types).includes(event.type)) return false;
  if (filter.workspaceId && event.workspaceId !== filter.workspaceId) return false;
  if (filter.sessionId && event.sessionId !== filter.sessionId) return false;
  if (filter.operationId && event.operationId !== filter.operationId) return false;
  return true;
}

function matchesFilter(record, filter = {}) {
  return Object.entries(filter || {}).every(([key, value]) => value === undefined || record[key] === value);
}

function normalizeBounds(input = {}) {
  const result = { ...DEFAULT_BOUNDS };
  for (const [key, value] of Object.entries(input || {})) result[key] = normalizePositiveInteger(value, result[key] || 1);
  return Object.freeze(result);
}

function normalizeClock(clock) {
  if (clock && typeof clock.now === "function") return clock;
  if (typeof clock === "function") return { now: clock };
  return { now: () => new Date().toISOString() };
}

function normalizeIdAdapter(adapter) {
  if (adapter && typeof adapter.next === "function") return adapter;
  let sequence = 0;
  return {
    next(prefix, input = {}) {
      sequence += 1;
      return `${prefix}-${String(sequence).padStart(6, "0")}-${stableHash(input).slice(0, 8)}`;
    },
  };
}

function maybePromise(value) {
  return value && typeof value.then === "function" ? value : Promise.resolve(value);
}

function requiredString(value, message) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(message);
  return value.trim();
}

function normalizeEnum(value, constants, label) {
  const normalized = String(value || "").toUpperCase();
  if (!Object.values(constants).includes(normalized)) throw new Error(`Invalid ${label}: ${value}.`);
  return normalized;
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizeUnit(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Number(Math.max(0, Math.min(1, number)).toFixed(6));
}

function safeArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function clonePlainObject(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(left, right) {
  const output = clonePlainObject(left || {});
  for (const [key, value] of Object.entries(right || {})) {
    output[key] = isPlainObject(value) && isPlainObject(output[key]) ? deepMerge(output[key], value) : value;
  }
  return output;
}

function stableHash(value) {
  return crypto.createHash("sha256").update(stableSerialize(value)).digest("hex").slice(0, 16);
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function stableId(prefix, value) {
  return `${prefix}-${stableHash(value)}`;
}

function normalizeToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))).sort((left, right) => String(left).localeCompare(String(right)));
}

function average(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
}

function runningAverage(previous, count, value) {
  const currentCount = Math.max(1, count);
  return Number((((previous || 0) * Math.max(0, currentCount - 1) + Number(value || 0)) / currentCount).toFixed(6));
}

function boundedArray(values, max) {
  return safeArray(values).slice(-max);
}

function trimArray(values, max) {
  if (values.length > max) values.splice(0, values.length - max);
}

function compareById(left, right) {
  return String(left.id).localeCompare(String(right.id));
}

function compareOperationRecords(left, right) {
  return left.createdAt.localeCompare(right.createdAt) || left.sequence - right.sequence || left.id.localeCompare(right.id);
}

function workspaceNameFromUri(uri) {
  const text = String(uri || "workspace").replace(/[\\\/]+$/, "");
  const parts = text.split(/[\\\/:]+/).filter(Boolean);
  return parts[parts.length - 1] || "workspace";
}

function summarizeInput(input) {
  return serializeForFrontend(input, { maximumResultSize: 4096 });
}

function isSecretKey(key) {
  const value = String(key);
  if (/safety|status|policy|integrity|classification|category/i.test(value)) return false;
  return /secret|token|password|api[-_]?key|credential|authorization/i.test(value);
}

function isSecretValue(value) {
  return /\bsk-[A-Za-z0-9_-]{6,}\b|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|\b(?:token|password|secret|api[_-]?key|authorization)\s*[:=]\s*[^,\s"']+/i.test(String(value));
}

function levelRank(level) {
  return [
    CERTIFICATION_LEVELS.NOT_ASSESSED,
    CERTIFICATION_LEVELS.INSUFFICIENT_EVIDENCE,
    CERTIFICATION_LEVELS.FAILED,
    CERTIFICATION_LEVELS.DEVELOPMENT,
    CERTIFICATION_LEVELS.INTEGRATION_READY,
    CERTIFICATION_LEVELS.IDE_CORE_READY,
    CERTIFICATION_LEVELS.PRODUCTION_CANDIDATE,
    CERTIFICATION_LEVELS.CERTIFIED,
  ].indexOf(level);
}

function emptyStats() {
  return {
    initializationAttempts: 0,
    successfulInitializations: 0,
    degradedInitializations: 0,
    failedInitializations: 0,
    workspacesOpened: 0,
    workspacesClosed: 0,
    workspaceFailures: 0,
    sessionsCreated: 0,
    sessionsCompleted: 0,
    sessionsCancelled: 0,
    sessionsFailed: 0,
    operationsSubmitted: 0,
    operationsQueued: 0,
    operationsSucceeded: 0,
    operationsPartiallySucceeded: 0,
    operationsFailed: 0,
    operationsCancelled: 0,
    operationsTimedOut: 0,
    commandsExecuted: 0,
    commandFailures: 0,
    approvalsRequested: 0,
    approvalsApproved: 0,
    approvalsRejected: 0,
    approvalsExpired: 0,
    recoveryAttempts: 0,
    successfulRecoveries: 0,
    failedRecoveries: 0,
    corruptedLoads: 0,
    eventsPublished: 0,
    listenerFailures: 0,
    averageOperationDuration: 0,
    averageConfidence: 0,
    averageCompleteness: 0,
    lastInitialization: null,
    lastOperation: null,
    lastRecovery: null,
    lastShutdown: null,
  };
}

module.exports = {
  APPLICATION_RUNTIME_SCHEMA_VERSION,
  ApprovalStatuses,
  DEFAULT_CONFIGURATION,
  ErrorCategories,
  ErrorSeverities,
  FileRuntimePersistenceAdapter,
  ControlledWorkspaceToolEngine,
  DurableWorkflowEngine,
  LeviApplicationRuntime,
  MultiAgentCoordinationEngine,
  OperationPriorities,
  OperationStates,
  OperationTypes,
  RuntimeEventTypes,
  RuntimeStates,
  SessionStates,
  RepositoryPerformanceEngine,
  ReliabilityAssuranceEngine,
  SecurityAssuranceEngine,
  StressScalabilityEngine,
  ReleaseQualificationEngine,
  UriWorkspaceAdapter,
  WorkspaceStates,
  normalizeRuntimeConfiguration,
  serializeForFrontend,
};
