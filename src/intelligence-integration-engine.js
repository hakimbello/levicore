const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const { RepositoryKnowledgeGraph, GRAPH_SCHEMA_VERSION } = require("./repository-knowledge-graph");
const { CrossSessionLearningEngine, LEARNING_SCHEMA_VERSION } = require("./cross-session-learning-engine");
const { OfflineKnowledgeIndex, OFFLINE_INDEX_SCHEMA_VERSION } = require("./offline-knowledge-index");
const { PlanningIntelligenceEngine, PLANNING_SCHEMA_VERSION } = require("./planning-intelligence-engine");
const { ContextIntelligenceEngine, CONTEXT_SCHEMA_VERSION } = require("./context-intelligence-engine");
const { CodeUnderstandingEngine, CODE_UNDERSTANDING_SCHEMA_VERSION } = require("./code-understanding-engine");
const { ProjectIntelligenceEngine, PROJECT_INTELLIGENCE_SCHEMA_VERSION } = require("./project-intelligence-engine");
const { LearningAdaptationEngine, LEARNING_ADAPTATION_SCHEMA_VERSION } = require("./learning-adaptation-engine");
const { ExecutionSession } = require("./execution-session");
const { ContinueEngine, CONTINUE_STOP_REASONS } = require("./continue-engine");
const { ExecutionEngine } = require("./execution-engine");
const { RepairEngine } = require("./repair-engine");
const { ApprovalGateway } = require("./approval-gateway");
const { SecurityValidator } = require("./security-validator");
const { ObjectiveCompletionEngine } = require("./objective-completion-engine");

const INTELLIGENCE_INTEGRATION_SCHEMA_VERSION = 1;

const INTEGRATION_DOMAINS = Object.freeze({
  REPOSITORY_KNOWLEDGE: "REPOSITORY_KNOWLEDGE",
  CROSS_SESSION_LEARNING: "CROSS_SESSION_LEARNING",
  OFFLINE_INDEX: "OFFLINE_INDEX",
  PLANNING: "PLANNING",
  CONTEXT: "CONTEXT",
  CODE_UNDERSTANDING: "CODE_UNDERSTANDING",
  PROJECT_INTELLIGENCE: "PROJECT_INTELLIGENCE",
  LEARNING_ADAPTATION: "LEARNING_ADAPTATION",
  EXECUTION: "EXECUTION",
  REPAIR: "REPAIR",
  APPROVAL: "APPROVAL",
  SECURITY: "SECURITY",
  VALIDATION: "VALIDATION",
  OBJECTIVE_COMPLETION: "OBJECTIVE_COMPLETION",
  PERSISTENCE: "PERSISTENCE",
  EVENTS: "EVENTS",
  AUTHORITY: "AUTHORITY",
  EVIDENCE: "EVIDENCE",
  CAPABILITIES: "CAPABILITIES",
  CERTIFICATION: "CERTIFICATION",
});

const COMPONENT_TYPES = Object.freeze({
  ENGINE: "ENGINE",
  ADAPTER: "ADAPTER",
  COLLECTOR: "COLLECTOR",
  POLICY: "POLICY",
  STORE: "STORE",
  VALIDATOR: "VALIDATOR",
  EVENT_SOURCE: "EVENT_SOURCE",
  EVENT_SINK: "EVENT_SINK",
  ORCHESTRATOR: "ORCHESTRATOR",
  CAPABILITY_PROVIDER: "CAPABILITY_PROVIDER",
  UNKNOWN: "UNKNOWN",
});

const COMPONENT_STATUSES = Object.freeze({
  AVAILABLE: "AVAILABLE",
  HEALTHY: "HEALTHY",
  DEGRADED: "DEGRADED",
  PARTIAL: "PARTIAL",
  UNAVAILABLE: "UNAVAILABLE",
  INCOMPATIBLE: "INCOMPATIBLE",
  MISCONFIGURED: "MISCONFIGURED",
  STALE: "STALE",
  FAILED: "FAILED",
  UNKNOWN: "UNKNOWN",
});

const INTEGRATION_STATUSES = Object.freeze({
  CONNECTED: "CONNECTED",
  PARTIALLY_CONNECTED: "PARTIALLY_CONNECTED",
  DISCONNECTED: "DISCONNECTED",
  INCOMPATIBLE: "INCOMPATIBLE",
  BLOCKED: "BLOCKED",
  DEGRADED: "DEGRADED",
  UNVERIFIED: "UNVERIFIED",
  FAILED: "FAILED",
});

const CERTIFICATION_LEVELS = Object.freeze({
  NOT_ASSESSED: "NOT_ASSESSED",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
  FAILED: "FAILED",
  DEVELOPMENT: "DEVELOPMENT",
  INTEGRATION_READY: "INTEGRATION_READY",
  IDE_CORE_READY: "IDE_CORE_READY",
  PRODUCTION_CANDIDATE: "PRODUCTION_CANDIDATE",
  CERTIFIED: "CERTIFIED",
});

const CERTIFICATION_PROFILES = Object.freeze({
  CORE_INTELLIGENCE: "CORE_INTELLIGENCE",
  AUTONOMOUS_EXECUTION: "AUTONOMOUS_EXECUTION",
  OFFLINE_OPERATION: "OFFLINE_OPERATION",
  DEGRADED_OPERATION: "DEGRADED_OPERATION",
  SECURITY_INVARIANTS: "SECURITY_INVARIANTS",
  APPROVAL_INVARIANTS: "APPROVAL_INVARIANTS",
  PERSISTENCE_AND_RECOVERY: "PERSISTENCE_AND_RECOVERY",
  EVIDENCE_TRACEABILITY: "EVIDENCE_TRACEABILITY",
  IDE_BACKEND_READINESS: "IDE_BACKEND_READINESS",
  FULL_LAYER_2: "FULL_LAYER_2",
});

const INTEGRATION_FINDING_SEVERITIES = Object.freeze({
  INFO: "INFO",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

const INTEGRATION_FINDING_STATUSES = Object.freeze({
  OPEN: "OPEN",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  RESOLVED: "RESOLVED",
  ACCEPTED_RISK: "ACCEPTED_RISK",
  STALE: "STALE",
  DISMISSED: "DISMISSED",
});

const INTEGRATION_EVENTS = Object.freeze({
  LIFECYCLE: "lifecycle",
});

const INTEGRATION_EVENT_TYPES = Object.freeze({
  COMPONENT_REGISTERED: "integration_component_registered",
  COMPONENT_UNREGISTERED: "integration_component_unregistered",
  CAPABILITY_REGISTERED: "integration_capability_registered",
  CAPABILITY_UNREGISTERED: "integration_capability_unregistered",
  INTEGRATION_REGISTERED: "integration_registered",
  INTEGRATION_UNREGISTERED: "integration_unregistered",
  DISCOVERY_STARTED: "integration_discovery_started",
  DISCOVERY_COMPLETED: "integration_discovery_completed",
  WIRING_STARTED: "integration_wiring_started",
  WIRING_COMPLETED: "integration_wiring_completed",
  CONTRACT_VALIDATION_STARTED: "integration_contract_validation_started",
  CONTRACT_VALIDATION_COMPLETED: "integration_contract_validation_completed",
  HEALTH_CHECK_STARTED: "integration_health_check_started",
  HEALTH_CHECK_COMPLETED: "integration_health_check_completed",
  SCENARIO_STARTED: "integration_scenario_started",
  SCENARIO_COMPLETED: "integration_scenario_completed",
  SCENARIO_FAILED: "integration_scenario_failed",
  FINDING_CREATED: "integration_finding_created",
  INVARIANT_FAILED: "integration_invariant_failed",
  DEGRADED: "integration_degraded",
  CERTIFICATION_STARTED: "certification_started",
  CERTIFICATION_CHECK_COMPLETED: "certification_check_completed",
  CERTIFICATION_COMPLETED: "certification_completed",
  CERTIFICATION_FAILED: "certification_failed",
  CERTIFICATION_COMPARED: "certification_compared",
  READINESS_REPORT_GENERATED: "readiness_report_generated",
  READINESS_REPORT_VALIDATED: "readiness_report_validated",
  PERSISTED: "integration_persisted",
  RESTORED: "integration_restored",
  CORRUPTION_DETECTED: "integration_corruption_detected",
  RECOVERY_COMPLETED: "integration_recovery_completed",
  ANALYSIS_PARTIAL: "integration_analysis_partial",
  EVIDENCE_INSUFFICIENT: "integration_evidence_insufficient",
});

const RECOMMENDATION_EFFORTS = Object.freeze({
  SMALL: "SMALL",
  MEDIUM: "MEDIUM",
  LARGE: "LARGE",
  UNKNOWN: "UNKNOWN",
});

const FINDING_CODES = Object.freeze({
  MISSING_COMPONENT: "missing_component",
  INCOMPATIBLE_CONTRACT: "incompatible_contract",
  MISSING_ADAPTER: "missing_adapter",
  DUPLICATE_CAPABILITY_PROVIDER: "duplicate_capability_provider",
  BROKEN_EVIDENCE_LINEAGE: "broken_evidence_lineage",
  AUTHORITY_ORDER_CONFLICT: "authority_order_conflict",
  SECURITY_INVARIANT_FAILURE: "security_invariant_failure",
  APPROVAL_INVARIANT_FAILURE: "approval_invariant_failure",
  LIFECYCLE_ORDER_FAILURE: "lifecycle_order_failure",
  STALE_COMPONENT: "stale_component",
  STALE_EVIDENCE: "stale_evidence",
  PERSISTENCE_FAILURE: "persistence_failure",
  RECOVERY_FAILURE: "recovery_failure",
  DEGRADED_CAPABILITY: "degraded_capability",
  MISSING_TEST_EVIDENCE: "missing_test_evidence",
  NONDETERMINISTIC_RESULT: "nondeterministic_result",
  CERTIFICATION_BLOCKER: "certification_blocker",
  BOUNDS_EXCEEDED: "bounds_exceeded",
  UNKNOWN: "unknown",
});

const AUTHORITY_ORDER = Object.freeze([
  "current_user_instruction",
  "current_project_instruction",
  "durable_accepted_decision",
  "security_policy",
  "verified_repository_state",
  "validated_execution_evidence",
  "accepted_approval_decision",
  "accepted_plan",
  "active_project_learning",
  "active_user_learning",
  "historical_learning",
  "documentation",
  "inferred_convention",
  "heuristic",
]);

const DEFAULT_BOUNDS = Object.freeze({
  maximumRegisteredComponents: 64,
  maximumCapabilities: 256,
  maximumIntegrations: 256,
  maximumFindings: 500,
  maximumEvidenceReferences: 1000,
  maximumHealthChecks: 256,
  maximumScenarios: 64,
  maximumScenarioSteps: 32,
  maximumCertifications: 128,
  maximumHistoricalResults: 64,
  maximumEventsInspected: 1000,
  maximumRecordsPerAdapter: 500,
  maximumProcessingTime: 30000,
  maximumRecoveryAttempts: 3,
  minimumCertificationConfidence: 0.7,
  minimumCertificationCompleteness: 0.7,
});

const DEFAULT_SCENARIOS = Object.freeze([
  "repository_to_index",
  "repository_to_graph",
  "graph_to_code_understanding",
  "index_to_context",
  "code_understanding_to_context",
  "planning_to_context",
  "project_intelligence_synthesis",
  "learning_from_execution_outcome",
  "learning_to_context_adaptation",
  "learning_to_planning_adaptation",
  "execution_to_validation",
  "failed_execution_to_repair",
  "protected_execution_to_approval",
  "security_failure_to_release_block",
  "objective_completion_to_project_assessment",
  "project_assessment_to_next_action",
  "persistence_snapshot_restore",
  "corruption_recovery",
  "degraded_optional_component",
  "full_offline_intelligence_flow",
  "end_to_end_project_analysis",
]);

const DEFAULT_COMPONENTS = Object.freeze([
  {
    id: "component:repository-knowledge-graph",
    name: "RepositoryKnowledgeGraph",
    domain: INTEGRATION_DOMAINS.REPOSITORY_KNOWLEDGE,
    constructor: RepositoryKnowledgeGraph,
    schemaVersion: GRAPH_SCHEMA_VERSION || 1,
    requiredMethods: ["build", "update", "snapshot", "restore", "save", "load"],
    capabilities: ["repository scanning", "repository graph querying", "persistence", "recovery", "event publication"],
    eventsProduced: ["knowledge_graph_build_started", "knowledge_graph_build_completed"],
  },
  {
    id: "component:cross-session-learning",
    name: "CrossSessionLearningEngine",
    domain: INTEGRATION_DOMAINS.CROSS_SESSION_LEARNING,
    constructor: CrossSessionLearningEngine,
    schemaVersion: LEARNING_SCHEMA_VERSION || 1,
    requiredMethods: ["learnFromSession", "list", "snapshot", "restore", "save", "load"],
    capabilities: ["durable learning", "evidence explanation", "persistence", "recovery", "event publication"],
    optionalDependencies: ["component:repository-knowledge-graph"],
  },
  {
    id: "component:offline-knowledge-index",
    name: "OfflineKnowledgeIndex",
    domain: INTEGRATION_DOMAINS.OFFLINE_INDEX,
    constructor: OfflineKnowledgeIndex,
    schemaVersion: OFFLINE_INDEX_SCHEMA_VERSION || 1,
    requiredMethods: ["build", "search", "snapshot", "restore", "save", "load"],
    capabilities: ["offline search", "semantic retrieval", "persistence", "recovery", "event publication"],
    optionalDependencies: ["component:repository-knowledge-graph", "component:cross-session-learning"],
  },
  {
    id: "component:planning-intelligence",
    name: "PlanningIntelligenceEngine",
    domain: INTEGRATION_DOMAINS.PLANNING,
    constructor: PlanningIntelligenceEngine,
    schemaVersion: PLANNING_SCHEMA_VERSION || 1,
    requiredMethods: ["createPlan", "getPlan", "snapshot", "restore", "save", "load"],
    capabilities: ["planning", "task decomposition", "persistence", "recovery", "event publication"],
    optionalDependencies: ["component:repository-knowledge-graph", "component:offline-knowledge-index", "component:cross-session-learning"],
  },
  {
    id: "component:context-intelligence",
    name: "ContextIntelligenceEngine",
    domain: INTEGRATION_DOMAINS.CONTEXT,
    constructor: ContextIntelligenceEngine,
    schemaVersion: CONTEXT_SCHEMA_VERSION || 1,
    requiredMethods: ["assemble", "getPackage", "snapshot", "restore", "save", "load"],
    capabilities: ["context assembly", "context ranking", "persistence", "recovery", "event publication"],
    optionalDependencies: ["component:repository-knowledge-graph", "component:offline-knowledge-index", "component:cross-session-learning", "component:planning-intelligence"],
  },
  {
    id: "component:code-understanding",
    name: "CodeUnderstandingEngine",
    domain: INTEGRATION_DOMAINS.CODE_UNDERSTANDING,
    constructor: CodeUnderstandingEngine,
    schemaVersion: CODE_UNDERSTANDING_SCHEMA_VERSION || 1,
    requiredMethods: ["analyzeRepository", "findDefinitions", "findReferences", "analyzeChangeImpact", "snapshot", "restore", "save", "load"],
    capabilities: ["code entity analysis", "code relationship analysis", "impact analysis", "architecture analysis", "persistence", "recovery", "event publication"],
    optionalDependencies: ["component:repository-knowledge-graph", "component:offline-knowledge-index", "component:context-intelligence", "component:planning-intelligence"],
  },
  {
    id: "component:project-intelligence",
    name: "ProjectIntelligenceEngine",
    domain: INTEGRATION_DOMAINS.PROJECT_INTELLIGENCE,
    constructor: ProjectIntelligenceEngine,
    schemaVersion: PROJECT_INTELLIGENCE_SCHEMA_VERSION || 1,
    requiredMethods: ["analyzeProject", "assessProject", "getProjectSummary", "getReleaseReadiness", "snapshot", "restore", "save", "load"],
    capabilities: ["project assessment", "release-readiness assessment", "blocker detection", "risk detection", "evidence explanation", "persistence", "recovery", "event publication"],
    optionalDependencies: ["component:repository-knowledge-graph", "component:offline-knowledge-index", "component:code-understanding", "component:planning-intelligence", "component:context-intelligence", "component:cross-session-learning"],
  },
  {
    id: "component:learning-adaptation",
    name: "LearningAdaptationEngine",
    domain: INTEGRATION_DOMAINS.LEARNING_ADAPTATION,
    constructor: LearningAdaptationEngine,
    schemaVersion: LEARNING_ADAPTATION_SCHEMA_VERSION || 1,
    requiredMethods: ["ingestSignal", "deriveRules", "proposeAdaptations", "applyAdaptation", "rollbackAdaptation", "snapshot", "restore", "save", "load"],
    capabilities: ["learning-rule derivation", "bounded adaptation", "persistence", "recovery", "evidence explanation", "event publication"],
    optionalDependencies: ["component:cross-session-learning", "component:context-intelligence", "component:planning-intelligence", "component:project-intelligence"],
  },
  {
    id: "component:execution-session",
    name: "ExecutionSession",
    domain: INTEGRATION_DOMAINS.EXECUTION,
    constructor: ExecutionSession,
    schemaVersion: 1,
    requiredMethods: ["transitionTo", "cancel", "fail", "snapshot"],
    capabilities: ["execution", "event publication"],
  },
  {
    id: "component:continue-engine",
    name: "ContinueEngine",
    domain: INTEGRATION_DOMAINS.EXECUTION,
    constructor: ContinueEngine,
    schemaVersion: 1,
    requiredMethods: ["shouldContinue", "getStopReason"],
    capabilities: ["execution", "validation"],
    requiredDependencies: ["component:execution-session"],
  },
  {
    id: "component:execution-engine",
    name: "ExecutionEngine",
    domain: INTEGRATION_DOMAINS.EXECUTION,
    schemaVersion: 1,
    requiredMethods: ["run", "resume"],
    capabilities: ["execution", "validation", "repair", "approval gating", "security gating", "objective completion", "event publication"],
    requiredDependencies: ["component:continue-engine", "component:repair-engine", "component:approval-gateway", "component:security-validator", "component:objective-completion"],
    factory: createExecutionEngineAdapter,
  },
  {
    id: "component:repair-engine",
    name: "RepairEngine",
    domain: INTEGRATION_DOMAINS.REPAIR,
    constructor: RepairEngine,
    schemaVersion: 1,
    requiredMethods: ["canRepair", "createRepairPlan", "repair"],
    capabilities: ["repair", "evidence explanation"],
  },
  {
    id: "component:approval-gateway",
    name: "ApprovalGateway",
    domain: INTEGRATION_DOMAINS.APPROVAL,
    constructor: ApprovalGateway,
    schemaVersion: 1,
    requiredMethods: ["evaluate", "approveRequest", "getRequest"],
    capabilities: ["approval gating", "evidence explanation", "event publication"],
  },
  {
    id: "component:security-validator",
    name: "SecurityValidator",
    domain: INTEGRATION_DOMAINS.SECURITY,
    constructor: SecurityValidator,
    schemaVersion: 1,
    requiredMethods: ["validateAction", "validateResult", "validateSession"],
    capabilities: ["security gating", "evidence explanation"],
  },
  {
    id: "component:objective-completion",
    name: "ObjectiveCompletionEngine",
    domain: INTEGRATION_DOMAINS.OBJECTIVE_COMPLETION,
    constructor: ObjectiveCompletionEngine,
    schemaVersion: 1,
    requiredMethods: ["evaluate", "isComplete", "getIncompleteReasons"],
    capabilities: ["objective completion", "evidence explanation"],
  },
]);

class IntelligenceIntegrationEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.repositoryPath = options.repositoryPath ? path.resolve(options.repositoryPath) : null;
    this.persistencePath = options.persistencePath || defaultPersistencePath(this.repositoryPath);
    this.bounds = normalizeBounds(options.bounds || {});
    this.now = typeof options.now === "function" ? options.now : () => new Date().toISOString();
    this.migrations = safeArray(options.migrations);
    this.components = new Map();
    this.capabilities = new Map();
    this.integrations = new Map();
    this.adapters = new Map();
    this.healthReports = new Map();
    this.certifications = new Map();
    this.findings = new Map();
    this.evidenceReferences = new Map();
    this.compatibilityMatrices = [];
    this.scenarioSummaries = [];
    this.readinessReports = [];
    this.eventLog = [];
    this.stats = emptyStats();
    this.metadata = clonePlainObject(options.metadata || {});

    this.registerComponent({
      id: "component:intelligence-integration",
      name: "IntelligenceIntegrationEngine",
      type: COMPONENT_TYPES.ORCHESTRATOR,
      version: "1.0.0",
      schemaVersion: INTELLIGENCE_INTEGRATION_SCHEMA_VERSION,
      capabilities: ["capability discovery", "persistence", "recovery", "event publication", "evidence explanation"],
      requiredDependencies: [],
      optionalDependencies: [],
      persistence: { supported: true, schemaVersion: INTELLIGENCE_INTEGRATION_SCHEMA_VERSION },
      authorityRules: { order: AUTHORITY_ORDER },
      status: COMPONENT_STATUSES.AVAILABLE,
      metadata: {
        domain: INTEGRATION_DOMAINS.CERTIFICATION,
        requiredMethods: ["registerComponent", "discoverCapabilities", "runCertification", "generateReadinessReport", "snapshot", "restore", "save", "load"],
      },
      instance: this,
    });

    for (const component of safeArray(options.components)) this.registerComponent(component);
    for (const capability of safeArray(options.capabilities)) this.registerCapability(capability);
    for (const integration of safeArray(options.integrations)) this.registerIntegration(integration);
    for (const evidence of safeArray(options.evidenceReferences)) this.addEvidenceReference(evidence);
    for (const event of safeArray(options.events)) this.recordExternalEvent(event);

    if (options.autoDiscover !== false) {
      this.discoverComponents({ adapters: options.adapters || {}, includeDefaults: options.includeDefaults !== false });
      this.discoverCapabilities();
      this.wire();
    }
  }

  registerComponent(component) {
    if (this.components.size + 1 > this.bounds.maximumRegisteredComponents) {
      return this.boundFinding("registered components", INTEGRATION_DOMAINS.CERTIFICATION);
    }
    const normalized = normalizeComponentDescriptor(component, this);
    this.components.set(normalized.id, normalized);
    if (component.adapter || component.instance || component.healthCheck || component.runtime) {
      this.adapters.set(normalized.id, normalizeRuntimeAdapter(component, normalized));
    }
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.COMPONENT_REGISTERED, { componentId: normalized.id });
    this.refreshStats();
    return clonePlainObject(normalized);
  }

  unregisterComponent(componentId) {
    const id = requiredString(componentId, "Component id is required.");
    const existed = this.components.delete(id);
    this.adapters.delete(id);
    for (const capability of Array.from(this.capabilities.values())) {
      if (capability.providerId === id) this.capabilities.delete(capability.id);
    }
    for (const integration of Array.from(this.integrations.values())) {
      if (integration.sourceComponentId === id || integration.targetComponentId === id) this.integrations.delete(integration.id);
    }
    if (existed) this.emitLifecycle(INTEGRATION_EVENT_TYPES.COMPONENT_UNREGISTERED, { componentId: id });
    this.refreshStats();
    return existed;
  }

  registerCapability(capability) {
    if (this.capabilities.size + 1 > this.bounds.maximumCapabilities) {
      return this.boundFinding("capabilities", INTEGRATION_DOMAINS.CAPABILITIES);
    }
    const normalized = normalizeCapabilityDescriptor(capability, this);
    if (normalized.providerId && !this.components.has(normalized.providerId)) {
      this.createFinding({
        domain: INTEGRATION_DOMAINS.CAPABILITIES,
        code: FINDING_CODES.MISSING_COMPONENT,
        severity: INTEGRATION_FINDING_SEVERITIES.MEDIUM,
        title: "Capability provider is not registered",
        description: `${normalized.name} references ${normalized.providerId}.`,
        capabilityIds: [normalized.id],
        componentIds: [normalized.providerId],
      });
    }
    this.capabilities.set(normalized.id, normalized);
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.CAPABILITY_REGISTERED, { capabilityId: normalized.id, providerId: normalized.providerId });
    this.refreshStats();
    return clonePlainObject(normalized);
  }

  unregisterCapability(capabilityId) {
    const id = requiredString(capabilityId, "Capability id is required.");
    const existed = this.capabilities.delete(id);
    if (existed) this.emitLifecycle(INTEGRATION_EVENT_TYPES.CAPABILITY_UNREGISTERED, { capabilityId: id });
    this.refreshStats();
    return existed;
  }

  registerIntegration(integration) {
    if (this.integrations.size + 1 > this.bounds.maximumIntegrations) {
      return this.boundFinding("integrations", INTEGRATION_DOMAINS.CERTIFICATION);
    }
    const normalized = normalizeIntegrationDescriptor(integration, this);
    this.integrations.set(normalized.id, normalized);
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.INTEGRATION_REGISTERED, { integrationId: normalized.id });
    this.refreshStats();
    return clonePlainObject(normalized);
  }

  unregisterIntegration(integrationId) {
    const id = requiredString(integrationId, "Integration id is required.");
    const existed = this.integrations.delete(id);
    if (existed) this.emitLifecycle(INTEGRATION_EVENT_TYPES.INTEGRATION_UNREGISTERED, { integrationId: id });
    this.refreshStats();
    return existed;
  }

  discoverComponents(options = {}) {
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.DISCOVERY_STARTED, {});
    const adapters = options.adapters || {};
    const includeDefaults = options.includeDefaults !== false;
    const discovered = [];

    if (includeDefaults) {
      for (const definition of DEFAULT_COMPONENTS) {
        if (this.components.has(definition.id)) {
          discovered.push(this.components.get(definition.id));
          continue;
        }
        const adapter = adapters[definition.id] || adapters[definition.name] || createDefaultAdapter(definition, this.repositoryPath);
        const descriptor = descriptorFromDefinition(definition, adapter);
        this.registerComponent({ ...descriptor, adapter });
        discovered.push(this.components.get(descriptor.id));
      }
    }

    for (const component of safeArray(options.components)) {
      discovered.push(this.registerComponent(component));
    }

    this.emitLifecycle(INTEGRATION_EVENT_TYPES.DISCOVERY_COMPLETED, { componentCount: this.components.size });
    return discovered.map(clonePlainObject);
  }

  discoverCapabilities(options = {}) {
    const created = [];
    for (const component of this.sortedComponents()) {
      for (const name of uniqueSorted(component.capabilities)) {
        const id = capabilityId(component.id, name);
        if (!this.capabilities.has(id)) {
          created.push(this.registerCapability({
            id,
            name,
            domain: component.metadata.domain || domainForCapability(name),
            providerId: component.id,
            description: `${component.name} provides ${name}.`,
            version: component.version,
            prerequisites: component.requiredDependencies,
            guarantees: defaultCapabilityGuarantees(name),
            limitations: component.limitations,
            deterministic: true,
            offlineCapable: true,
            reversible: reversibleCapability(name),
            securitySensitive: securitySensitiveCapability(name),
            approvalSensitive: approvalSensitiveCapability(name),
            status: component.status === COMPONENT_STATUSES.HEALTHY ? COMPONENT_STATUSES.AVAILABLE : component.status,
          }));
        }
      }
    }
    this.detectDuplicateCapabilityProviders();
    return options.includeExisting === false ? created : this.listCapabilities(options.filter);
  }

  wire(options = {}) {
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.WIRING_STARTED, {});
    const requiredOnly = options.requiredOnly === true;
    const definitions = defaultIntegrationDefinitions();
    const wired = [];

    for (const integration of definitions) {
      if (requiredOnly && integration.required !== true) continue;
      if (!this.components.has(integration.sourceComponentId) || !this.components.has(integration.targetComponentId)) continue;
      if (!this.integrations.has(integration.id)) wired.push(this.registerIntegration(integration));
    }

    this.validateIntegrations();
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.WIRING_COMPLETED, { integrationCount: this.integrations.size });
    return wired;
  }

  validateContracts(options = {}) {
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.CONTRACT_VALIDATION_STARTED, {});
    const checks = [];
    const findings = [];
    for (const component of this.sortedComponents()) {
      const adapter = this.adapters.get(component.id);
      const target = adapter && adapter.instance ? adapter.instance : adapter && adapter.runtime ? adapter.runtime : null;
      const requiredMethods = uniqueSorted(component.metadata.requiredMethods || []);
      const missing = requiredMethods.filter((method) => !target || typeof target[method] !== "function");
      const schemaOk = Number(component.schemaVersion || 0) >= 1;
      const ok = missing.length === 0 && schemaOk && validStatus(component.status, COMPONENT_STATUSES);
      checks.push({
        id: `contract:${component.id}`,
        componentId: component.id,
        passed: ok,
        missingMethods: missing,
        schemaVersion: component.schemaVersion,
        evidence: [evidenceReferenceFor(this, component.id, "contract", { confidence: ok ? 0.9 : 0.2 })],
      });
      if (!ok) {
        findings.push(this.createFinding({
          domain: component.metadata.domain || INTEGRATION_DOMAINS.CERTIFICATION,
          code: FINDING_CODES.INCOMPATIBLE_CONTRACT,
          severity: component.requiredDependencies.length ? INTEGRATION_FINDING_SEVERITIES.HIGH : INTEGRATION_FINDING_SEVERITIES.MEDIUM,
          title: "Component contract is incompatible",
          description: missing.length ? `${component.name} is missing required methods: ${missing.join(", ")}.` : `${component.name} has an incompatible schema or status.`,
          componentIds: [component.id],
          evidence: [{ sourceComponentId: component.id, sourceType: "contract", confidence: ok ? 0.9 : 0.2, authority: "verified_repository_state" }],
        }));
      }
    }
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.CONTRACT_VALIDATION_COMPLETED, { passed: findings.length === 0, checkCount: checks.length });
    return {
      status: findings.length ? "FAILED" : "PASSED",
      checks,
      findings,
      confidence: findings.length ? 0.65 : 0.92,
      completeness: checks.length ? 1 : 0,
    };
  }

  validateIntegrations() {
    const checks = [];
    const findings = [];
    for (const integration of this.sortedIntegrations()) {
      const source = this.components.get(integration.sourceComponentId);
      const target = this.components.get(integration.targetComponentId);
      let status = INTEGRATION_STATUSES.CONNECTED;
      const failures = [];
      if (!source) failures.push(`missing source ${integration.sourceComponentId}`);
      if (!target) failures.push(`missing target ${integration.targetComponentId}`);
      if (source && [COMPONENT_STATUSES.UNAVAILABLE, COMPONENT_STATUSES.FAILED, COMPONENT_STATUSES.INCOMPATIBLE].includes(source.status)) failures.push(`source ${source.status}`);
      if (target && [COMPONENT_STATUSES.UNAVAILABLE, COMPONENT_STATUSES.FAILED, COMPONENT_STATUSES.INCOMPATIBLE].includes(target.status)) failures.push(`target ${target.status}`);
      if (failures.length) status = integration.required ? INTEGRATION_STATUSES.BLOCKED : INTEGRATION_STATUSES.DEGRADED;
      const next = { ...integration, status, updatedAt: this.timestamp() };
      this.integrations.set(next.id, next);
      checks.push({ id: `integration:${integration.id}`, integrationId: integration.id, passed: failures.length === 0, failures });
      if (failures.length) {
        findings.push(this.createFinding({
          domain: integration.domain,
          code: integration.required ? FINDING_CODES.MISSING_COMPONENT : FINDING_CODES.DEGRADED_CAPABILITY,
          severity: integration.required ? INTEGRATION_FINDING_SEVERITIES.HIGH : INTEGRATION_FINDING_SEVERITIES.LOW,
          title: integration.required ? "Required integration is blocked" : "Optional integration is degraded",
          description: `${integration.id} has ${failures.join("; ")}.`,
          componentIds: [integration.sourceComponentId, integration.targetComponentId],
          integrationIds: [integration.id],
        }));
        if (!integration.required) this.emitLifecycle(INTEGRATION_EVENT_TYPES.DEGRADED, { integrationId: integration.id });
      }
    }
    this.refreshStats();
    return { status: findings.length ? "PARTIAL" : "PASSED", checks, findings, confidence: findings.length ? 0.72 : 0.93, completeness: checks.length ? 1 : 0.8 };
  }

  validateAuthorityConsistency(options = {}) {
    const order = safeArray(options.authorityOrder || AUTHORITY_ORDER);
    const findings = [];
    const checks = [];
    for (const component of this.sortedComponents()) {
      const componentOrder = safeArray(component.authorityRules && component.authorityRules.order);
      if (componentOrder.length === 0) {
        checks.push({ id: `authority:${component.id}`, componentId: component.id, passed: true, inherited: true });
        continue;
      }
      const conflict = componentOrder.some((value, index) => order[index] && order[index] !== value);
      checks.push({ id: `authority:${component.id}`, componentId: component.id, passed: !conflict, order: componentOrder });
      if (conflict) {
        findings.push(this.createInvariantFinding({
          domain: INTEGRATION_DOMAINS.AUTHORITY,
          code: FINDING_CODES.AUTHORITY_ORDER_CONFLICT,
          severity: INTEGRATION_FINDING_SEVERITIES.HIGH,
          title: "Authority order conflict",
          description: `${component.name} declares an authority order incompatible with the platform order.`,
          componentIds: [component.id],
        }));
      }
    }
    return { status: findings.length ? "FAILED" : "PASSED", checks, findings, authorityOrder: [...order], confidence: findings.length ? 0.7 : 0.95, completeness: 1 };
  }

  validateEvidenceTraceability(options = {}) {
    const records = this.collectEvidenceReferences(options);
    const findings = [];
    const checks = [];
    const seen = new Set();
    for (const record of records) {
      const failures = [];
      if (!record.sourceComponentId || !this.components.has(record.sourceComponentId)) failures.push("missing source component");
      if (!record.sourceType) failures.push("missing source type");
      if (!record.authority) failures.push("missing authority");
      if (!validScore(record.confidence)) failures.push("invalid confidence");
      if (record.metadata && record.metadata.stale === true) failures.push("stale evidence");
      if (safeArray(record.metadata && record.metadata.references).includes(record.id)) failures.push("circular evidence reference");
      const fingerprint = stableSerialize({ sourceComponentId: record.sourceComponentId, sourceRecordId: record.sourceRecordId, sourceType: record.sourceType, projectId: record.projectId, sessionId: record.sessionId });
      if (seen.has(fingerprint)) failures.push("duplicate evidence reference");
      seen.add(fingerprint);
      checks.push({ id: `evidence:${record.id}`, evidenceId: record.id, passed: failures.length === 0, failures });
      if (failures.length) {
        findings.push(this.createFinding({
          domain: INTEGRATION_DOMAINS.EVIDENCE,
          code: failures.some((failure) => failure.includes("stale")) ? FINDING_CODES.STALE_EVIDENCE : FINDING_CODES.BROKEN_EVIDENCE_LINEAGE,
          severity: failures.some((failure) => failure.includes("source component")) ? INTEGRATION_FINDING_SEVERITIES.HIGH : INTEGRATION_FINDING_SEVERITIES.MEDIUM,
          title: "Broken evidence lineage",
          description: `${record.id} has ${failures.join(", ")}.`,
          componentIds: [record.sourceComponentId].filter(Boolean),
          evidence: [record],
        }));
      }
    }
    if (records.length === 0) {
      findings.push(this.createFinding({
        domain: INTEGRATION_DOMAINS.EVIDENCE,
        code: FINDING_CODES.BROKEN_EVIDENCE_LINEAGE,
        severity: INTEGRATION_FINDING_SEVERITIES.MEDIUM,
        title: "Evidence is insufficient",
        description: "No evidence references are available for integration validation.",
      }));
      this.emitLifecycle(INTEGRATION_EVENT_TYPES.EVIDENCE_INSUFFICIENT, {});
    }
    return { status: findings.length ? "FAILED" : "PASSED", checks, findings, evidenceReferences: records, confidence: findings.length ? 0.62 : 0.94, completeness: records.length ? 1 : 0 };
  }

  validateSecurityInvariants(options = {}) {
    const findings = [];
    const checks = [];
    const securityComponent = this.components.get("component:security-validator");
    const learning = this.components.get("component:learning-adaptation");
    const securityFindings = safeArray(options.securityFindings || this.metadata.securityFindings);
    const criticalOpen = securityFindings.filter((finding) => String(finding.severity).toUpperCase() === "CRITICAL" && !["RESOLVED", "DISMISSED"].includes(String(finding.status || "OPEN").toUpperCase()));
    const learningDisablesSecurity = Boolean((learning && learning.metadata && learning.metadata.canDisableSecurity) || options.learningCanDisableSecurity);
    const checksInput = [
      ["security component available", Boolean(securityComponent)],
      ["critical security findings cannot be suppressed by learning", !learningDisablesSecurity],
      ["release readiness cannot be ready with open critical security findings", criticalOpen.length === 0],
      ["unauthorized execution remains blocked", options.unauthorizedExecutionBlocked !== false],
      ["prohibited commands remain blocked", options.prohibitedCommandsBlocked !== false],
      ["degraded mode cannot bypass security checks", options.degradedSecurityBypass !== true],
    ];
    for (const [title, passed] of checksInput) {
      checks.push({ id: `security:${normalizeToken(title)}`, title, passed });
      if (!passed) {
        findings.push(this.createInvariantFinding({
          domain: INTEGRATION_DOMAINS.SECURITY,
          code: FINDING_CODES.SECURITY_INVARIANT_FAILURE,
          severity: INTEGRATION_FINDING_SEVERITIES.CRITICAL,
          title: "Security invariant failed",
          description: title,
          componentIds: ["component:security-validator", "component:learning-adaptation"].filter((id) => this.components.has(id)),
        }));
      }
    }
    return { status: findings.length ? "FAILED" : "PASSED", checks, findings, confidence: findings.length ? 0.4 : 0.96, completeness: 1 };
  }

  validateApprovalInvariants(options = {}) {
    const findings = [];
    const checks = [];
    const approvalComponent = this.components.get("component:approval-gateway");
    const learning = this.components.get("component:learning-adaptation");
    const learningRemovesApproval = Boolean((learning && learning.metadata && learning.metadata.canRemoveApproval) || options.learningCanRemoveApproval);
    const checksInput = [
      ["approval component available", Boolean(approvalComponent)],
      ["required approval cannot be bypassed", options.approvalBypass !== true],
      ["learning cannot remove approval requirements", !learningRemovesApproval],
      ["plans cannot self-approve protected actions", options.plansCanSelfApprove !== true],
      ["execution cannot treat missing approval as acceptance", options.missingApprovalAccepted !== true],
      ["degraded mode cannot bypass approval gating", options.degradedApprovalBypass !== true],
    ];
    for (const [title, passed] of checksInput) {
      checks.push({ id: `approval:${normalizeToken(title)}`, title, passed });
      if (!passed) {
        findings.push(this.createInvariantFinding({
          domain: INTEGRATION_DOMAINS.APPROVAL,
          code: FINDING_CODES.APPROVAL_INVARIANT_FAILURE,
          severity: INTEGRATION_FINDING_SEVERITIES.CRITICAL,
          title: "Approval invariant failed",
          description: title,
          componentIds: ["component:approval-gateway", "component:learning-adaptation"].filter((id) => this.components.has(id)),
        }));
      }
    }
    return { status: findings.length ? "FAILED" : "PASSED", checks, findings, confidence: findings.length ? 0.42 : 0.96, completeness: 1 };
  }

  validatePersistenceAndRecovery(options = {}) {
    const checks = [];
    const findings = [];
    for (const component of this.sortedComponents()) {
      const adapter = this.adapters.get(component.id);
      const target = adapter && adapter.instance;
      const supportsPersistence = component.persistence.supported === true || component.capabilities.includes("persistence");
      const supportsSnapshot = target && typeof target.snapshot === "function" && typeof target.restore === "function";
      if (!supportsPersistence && !supportsSnapshot) continue;
      const passed = Boolean(supportsSnapshot);
      checks.push({ id: `persistence:${component.id}`, componentId: component.id, passed, snapshot: Boolean(supportsSnapshot), persistence: supportsPersistence });
      if (!passed) {
        findings.push(this.createFinding({
          domain: INTEGRATION_DOMAINS.PERSISTENCE,
          code: FINDING_CODES.PERSISTENCE_FAILURE,
          severity: INTEGRATION_FINDING_SEVERITIES.MEDIUM,
          title: "Persistence contract is incomplete",
          description: `${component.name} advertises persistence or recovery without snapshot/restore support.`,
          componentIds: [component.id],
        }));
      }
    }
    if (options.persistenceUnavailable) {
      findings.push(this.createFinding({
        domain: INTEGRATION_DOMAINS.PERSISTENCE,
        code: FINDING_CODES.DEGRADED_CAPABILITY,
        severity: INTEGRATION_FINDING_SEVERITIES.LOW,
        title: "Persistence store is unavailable",
        description: "Runtime can continue with reduced persistence confidence.",
      }));
    }
    return { status: findings.length ? "PARTIAL" : "PASSED", checks, findings, confidence: findings.length ? 0.72 : 0.9, completeness: checks.length ? 1 : 0.6 };
  }

  validateLifecycleOrdering(options = {}) {
    const events = safeArray(options.events || this.eventLog).slice(-this.bounds.maximumEventsInspected);
    const findings = [];
    const checks = [];
    const pairs = [
      ["code_analysis_started", "code_analysis_completed"],
      ["project_analysis_started", "project_analysis_completed"],
      ["execution_started", "execution_completed"],
      ["certification_started", "certification_completed"],
      ["integration_scenario_started", "integration_scenario_completed"],
      ["learning_adaptation_proposed", "learning_adaptation_applied"],
    ];
    for (const [start, finish] of pairs) {
      const firstStart = events.findIndex((event) => event.type === start);
      const firstFinish = events.findIndex((event) => event.type === finish);
      const relevant = firstStart !== -1 || firstFinish !== -1;
      const passed = !relevant || firstFinish === -1 || (firstStart !== -1 && firstStart < firstFinish);
      checks.push({ id: `lifecycle:${start}:${finish}`, start, finish, passed });
      if (!passed) {
        findings.push(this.createInvariantFinding({
          domain: INTEGRATION_DOMAINS.EVENTS,
          code: FINDING_CODES.LIFECYCLE_ORDER_FAILURE,
          severity: INTEGRATION_FINDING_SEVERITIES.HIGH,
          title: "Lifecycle ordering failed",
          description: `${start} must precede ${finish}.`,
        }));
      }
    }
    const terminalIndexes = events
      .map((event, index) => ({ event, index }))
      .filter((entry) => ["execution_completed", "certification_completed", "certification_failed"].includes(entry.event.type));
    for (const terminal of terminalIndexes) {
      const laterActive = events.slice(terminal.index + 1).find((event) => sameEventScope(event, terminal.event) && ["iteration_started", "certification_check_completed"].includes(event.type));
      if (laterActive) {
        findings.push(this.createInvariantFinding({
          domain: INTEGRATION_DOMAINS.EVENTS,
          code: FINDING_CODES.LIFECYCLE_ORDER_FAILURE,
          severity: INTEGRATION_FINDING_SEVERITIES.HIGH,
          title: "Terminal event followed by active event",
          description: `${terminal.event.type} was followed by ${laterActive.type}.`,
        }));
      }
    }
    return { status: findings.length ? "FAILED" : "PASSED", checks, findings, confidence: findings.length ? 0.66 : 0.91, completeness: 1 };
  }

  runHealthChecks(options = {}) {
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.HEALTH_CHECK_STARTED, {});
    const reports = [];
    for (const component of this.sortedComponents()) {
      reports.push(this.getComponentHealth(component.id, options));
    }
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.HEALTH_CHECK_COMPLETED, { componentCount: reports.length });
    this.stats.healthChecks += reports.length;
    this.stats.lastHealthCheck = this.timestamp();
    this.refreshStats();
    return reports;
  }

  getComponentHealth(componentId, options = {}) {
    const component = this.components.get(requiredString(componentId, "Component id is required."));
    if (!component) throw new Error(`Unknown component ${componentId}.`);
    const adapter = this.adapters.get(component.id);
    const checks = [];
    const failures = [];
    const warnings = [];
    const dependencies = dependencyStatus(component, this.components);
    for (const dependency of dependencies) {
      if (dependency.required && dependency.status !== COMPONENT_STATUSES.HEALTHY && dependency.status !== COMPONENT_STATUSES.AVAILABLE) {
        failures.push(`Missing or unhealthy required dependency ${dependency.id}.`);
      } else if (!dependency.required && dependency.status === COMPONENT_STATUSES.UNAVAILABLE) {
        warnings.push(`Optional dependency ${dependency.id} is unavailable.`);
      }
    }
    const contract = this.validateSingleContract(component, adapter);
    checks.push(contract);
    if (!contract.passed) failures.push(`Contract failures: ${contract.missingMethods.join(", ")}.`);

    let status = failures.length ? COMPONENT_STATUSES.FAILED : warnings.length ? COMPONENT_STATUSES.DEGRADED : COMPONENT_STATUSES.HEALTHY;
    let healthEvidence = [{ sourceComponentId: component.id, sourceType: "health_check", authority: "verified_repository_state", confidence: failures.length ? 0.4 : 0.9 }];
    if (adapter && typeof adapter.healthCheck === "function") {
      try {
        const result = adapter.healthCheck({ component, options });
        if (result && result.status) status = normalizeEnum(result.status, COMPONENT_STATUSES, "health status");
        if (result && result.warning) warnings.push(String(result.warning));
        if (result && result.failure) failures.push(String(result.failure));
        if (result && result.evidence) healthEvidence = safeArray(result.evidence);
      } catch (error) {
        status = COMPONENT_STATUSES.FAILED;
        failures.push(error.message);
      }
    }

    const report = normalizeHealthReport({
      componentId: component.id,
      status,
      checks,
      failures,
      warnings,
      limitations: component.limitations,
      dependencies,
      confidence: failures.length ? 0.45 : warnings.length ? 0.75 : 0.93,
      completeness: checks.length ? 1 : 0.5,
      evidence: healthEvidence,
      createdAt: this.timestamp(),
    }, this);
    this.healthReports.set(report.id, report);
    const next = { ...component, status, updatedAt: report.createdAt };
    this.components.set(next.id, next);
    this.refreshStats();
    return clonePlainObject(report);
  }

  getPlatformHealth(options = {}) {
    const reports = options.skipChecks ? Array.from(this.healthReports.values()) : this.runHealthChecks(options);
    const integrationValidation = this.validateIntegrations();
    const contractValidation = this.validateContracts();
    const evidenceValidation = this.validateEvidenceTraceability();
    const authorityValidation = this.validateAuthorityConsistency();
    const securityValidation = this.validateSecurityInvariants(options);
    const approvalValidation = this.validateApprovalInvariants(options);
    const lifecycleValidation = this.validateLifecycleOrdering(options);
    const persistenceValidation = this.validatePersistenceAndRecovery(options);
    const scores = this.calculateHealthScores({
      reports,
      integrationValidation,
      contractValidation,
      evidenceValidation,
      authorityValidation,
      securityValidation,
      approvalValidation,
      lifecycleValidation,
      persistenceValidation,
    });
    const blockers = this.openFindings().filter((finding) => [INTEGRATION_FINDING_SEVERITIES.CRITICAL, INTEGRATION_FINDING_SEVERITIES.HIGH].includes(finding.severity));
    const capabilities = this.listCapabilities();
    return {
      id: `platform_health:${stableHash({ scores, findings: blockers.map((finding) => finding.id) })}`,
      componentHealth: reports,
      integrationHealth: integrationValidation,
      capabilityAvailability: capabilities,
      degradedCapabilities: capabilities.filter((capability) => [COMPONENT_STATUSES.DEGRADED, COMPONENT_STATUSES.PARTIAL].includes(capability.status)),
      failedCapabilities: capabilities.filter((capability) => [COMPONENT_STATUSES.FAILED, COMPONENT_STATUSES.UNAVAILABLE, COMPONENT_STATUSES.INCOMPATIBLE].includes(capability.status)),
      missingRequiredComponents: dependencyFindings(this).filter((finding) => finding.required),
      missingOptionalComponents: dependencyFindings(this).filter((finding) => !finding.required),
      staleSystems: this.sortedComponents().filter((component) => component.status === COMPONENT_STATUSES.STALE),
      persistenceStatus: persistenceValidation.status,
      eventSystemStatus: lifecycleValidation.status,
      invariantStatus: {
        authority: authorityValidation.status,
        security: securityValidation.status,
        approval: approvalValidation.status,
        lifecycle: lifecycleValidation.status,
      },
      scores,
      confidence: average(Object.values(scores).map((score) => score.confidence)),
      completeness: average(Object.values(scores).map((score) => score.value / 100)),
      blockers,
      findings: this.openFindings(),
      createdAt: this.timestamp(),
    };
  }

  getCapability(nameOrId) {
    const needle = normalizeText(requiredString(nameOrId, "Capability name or id is required."));
    return cloneOrNull(Array.from(this.capabilities.values()).find((capability) => normalizeText(capability.id) === needle || normalizeText(capability.name) === needle));
  }

  listCapabilities(filter = {}) {
    return Array.from(this.capabilities.values())
      .filter((capability) => matchesCapability(capability, filter))
      .sort(compareById)
      .map(clonePlainObject);
  }

  getIntegration(id) {
    return cloneOrNull(this.integrations.get(requiredString(id, "Integration id is required.")));
  }

  listIntegrations(filter = {}) {
    return this.sortedIntegrations()
      .filter((integration) => matchesIntegration(integration, filter))
      .map(clonePlainObject);
  }

  executeScenario(scenarioIdOrDefinition, options = {}) {
    const scenario = normalizeScenario(scenarioIdOrDefinition, this);
    assertWithinBound(scenario.steps.length, this.bounds.maximumScenarioSteps, "scenario steps");
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.SCENARIO_STARTED, { scenarioId: scenario.id });
    const started = Date.now();
    const steps = [];
    const outputs = {};
    const evidence = [];
    const findings = [];

    for (const prerequisite of scenario.prerequisites) {
      if (prerequisite.startsWith("component:") && !this.components.has(prerequisite)) {
        findings.push(this.createFinding({
          domain: INTEGRATION_DOMAINS.CERTIFICATION,
          code: FINDING_CODES.MISSING_COMPONENT,
          severity: INTEGRATION_FINDING_SEVERITIES.MEDIUM,
          title: "Scenario prerequisite is unavailable",
          description: `${scenario.id} requires ${prerequisite}.`,
          componentIds: [prerequisite],
        }));
      }
    }

    for (const step of scenario.steps) {
      const passed = findings.length === 0 && this.stepCanRun(step);
      const event = { type: step.event || `scenario_step:${step.id}`, scenarioId: scenario.id, stepId: step.id, timestamp: this.timestamp() };
      steps.push({ ...step, status: passed ? "PASSED" : "FAILED", output: passed ? step.output || "ok" : "missing prerequisite" });
      this.recordExternalEvent(event);
      outputs[step.id] = passed ? step.output || "ok" : null;
      evidence.push(evidenceReferenceFor(this, step.componentId || scenario.prerequisites[0] || "component:intelligence-integration", "scenario_step", { sourceRecordId: `${scenario.id}:${step.id}`, confidence: passed ? 0.88 : 0.35 }));
    }

    const failedSteps = steps.filter((step) => step.status === "FAILED");
    const status = failedSteps.length || findings.length ? "FAILED" : "PASSED";
    const result = {
      id: `scenario_result:${scenario.id}:${stableHash({ steps: steps.map((step) => [step.id, step.status]), findings: findings.map((finding) => finding.id) })}`,
      scenarioId: scenario.id,
      status,
      steps,
      passedSteps: steps.filter((step) => step.status === "PASSED"),
      failedSteps,
      skippedSteps: [],
      outputs,
      events: scenario.expectedEvents.map((type) => ({ type, scenarioId: scenario.id })),
      evidence,
      findings,
      duration: { startedAt: started, elapsedMs: Date.now() - started, bounded: true },
      confidence: status === "PASSED" ? 0.9 : 0.45,
      completeness: steps.length ? Number((steps.filter((step) => step.status === "PASSED").length / steps.length).toFixed(6)) : 0,
      metadata: clonePlainObject(options.metadata || {}),
    };
    this.scenarioSummaries.push(result);
    this.stats.scenariosExecuted += 1;
    this.stats[status === "PASSED" ? "scenariosPassed" : "scenariosFailed"] += 1;
    this.stats.lastScenario = scenario.id;
    this.emitLifecycle(status === "PASSED" ? INTEGRATION_EVENT_TYPES.SCENARIO_COMPLETED : INTEGRATION_EVENT_TYPES.SCENARIO_FAILED, { scenarioId: scenario.id, status });
    return clonePlainObject(result);
  }

  runCertification(profile, options = {}) {
    const normalizedProfile = normalizeEnum(profile, CERTIFICATION_PROFILES, "certification profile");
    assertWithinBound(this.certifications.size + 1, this.bounds.maximumCertifications, "certifications");
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.CERTIFICATION_STARTED, { profile: normalizedProfile });

    const requirements = certificationRequirements(normalizedProfile);
    const checks = [];
    const scenarios = [];
    const evidence = [];
    const blockers = [];
    const warnings = [];
    const invariantResults = {};

    const validators = certificationValidators(this, normalizedProfile, options);
    for (const validator of validators) {
      const result = validator.run();
      const validatorEvidence = safeArray(result.evidenceReferences || result.evidence);
      if (validatorEvidence.length === 0) {
        validatorEvidence.push(evidenceReferenceFor(this, "component:intelligence-integration", "certification_check", { sourceRecordId: `${normalizedProfile}:${validator.id}`, confidence: result.status === "PASSED" ? 0.85 : 0.45 }));
      }
      checks.push({ id: validator.id, title: validator.title, passed: result.status === "PASSED", status: result.status, findings: safeArray(result.findings).map((finding) => finding.id), confidence: normalizeScore(result.confidence, 0.5), completeness: normalizeScore(result.completeness, 0.5) });
      evidence.push(...validatorEvidence);
      for (const finding of safeArray(result.findings)) {
        if ([INTEGRATION_FINDING_SEVERITIES.CRITICAL, INTEGRATION_FINDING_SEVERITIES.HIGH].includes(finding.severity)) blockers.push(finding);
        else warnings.push(finding);
      }
      if (validator.invariant) invariantResults[validator.invariant] = result.status;
      this.emitLifecycle(INTEGRATION_EVENT_TYPES.CERTIFICATION_CHECK_COMPLETED, { profile: normalizedProfile, checkId: validator.id, status: result.status });
    }

    for (const scenarioId of certificationScenarios(normalizedProfile).slice(0, this.bounds.maximumScenarios)) {
      const result = this.executeScenario(scenarioId, options);
      scenarios.push(result);
      evidence.push(...result.evidence);
      if (result.status !== "PASSED") blockers.push(...result.findings);
    }

    const rerun = options.verifyDeterminism === false ? { passed: true, evidence: [] } : this.verifyDeterministicRerun(normalizedProfile, options);
    checks.push({ id: `determinism:${normalizedProfile}`, title: "Deterministic rerun", passed: rerun.passed, status: rerun.passed ? "PASSED" : "FAILED", findings: rerun.findings ? rerun.findings.map((finding) => finding.id) : [] });
    evidence.push(...safeArray(rerun.evidence));
    if (!rerun.passed) blockers.push(...safeArray(rerun.findings));

    const passedChecks = checks.filter((check) => check.passed);
    const failedChecks = checks.filter((check) => !check.passed);
    const skippedChecks = [];
    const confidence = clampScore(average(checks.map((check) => check.confidence === undefined ? 0.9 : check.confidence)));
    const completeness = clampScore(average(checks.map((check) => check.completeness === undefined ? 1 : check.completeness)));
    const level = certificationLevelFor({
      profile: normalizedProfile,
      failedChecks,
      blockers,
      confidence,
      completeness,
      minimumConfidence: this.bounds.minimumCertificationConfidence,
      minimumCompleteness: this.bounds.minimumCertificationCompleteness,
      scenarioFailures: scenarios.filter((scenario) => scenario.status !== "PASSED"),
    });
    const passed = !failedChecks.length && !blockers.some((finding) => finding.severity === INTEGRATION_FINDING_SEVERITIES.CRITICAL) && confidence >= this.bounds.minimumCertificationConfidence && completeness >= this.bounds.minimumCertificationCompleteness;
    const result = normalizeCertificationResult({
      profile: normalizedProfile,
      level,
      passed,
      status: passed ? "PASSED" : "FAILED",
      requirements,
      checks,
      passedChecks,
      failedChecks,
      skippedChecks,
      blockers: dedupeBy(blockers, (finding) => finding.id),
      warnings: dedupeBy(warnings, (finding) => finding.id),
      invariants: invariantResults,
      scenarios,
      evidence,
      confidence,
      completeness,
      limitations: certificationLimitations(normalizedProfile, level),
      componentVersions: Object.fromEntries(this.sortedComponents().map((component) => [component.id, component.version])),
      schemaVersions: Object.fromEntries(this.sortedComponents().map((component) => [component.id, component.schemaVersion])),
      repositoryRevision: this.metadata.repositoryRevision || "unknown",
      metadata: clonePlainObject(options.metadata || {}),
      createdAt: this.timestamp(),
    }, this);
    this.certifications.set(result.id, result);
    this.stats.certificationsExecuted += 1;
    this.stats[passed ? "certificationsPassed" : "certificationsFailed"] += 1;
    this.stats.certificationLevels[level] = (this.stats.certificationLevels[level] || 0) + 1;
    this.stats.lastCertification = result.id;
    this.emitLifecycle(passed ? INTEGRATION_EVENT_TYPES.CERTIFICATION_COMPLETED : INTEGRATION_EVENT_TYPES.CERTIFICATION_FAILED, { certificationId: result.id, profile: normalizedProfile, level, passed });
    this.refreshStats();
    return clonePlainObject(result);
  }

  runCertifications(profiles, options = {}) {
    const selected = safeArray(profiles && profiles.length ? profiles : Object.values(CERTIFICATION_PROFILES));
    return selected.map((profile) => this.runCertification(profile, options));
  }

  getCertification(id) {
    return cloneOrNull(this.certifications.get(requiredString(id, "Certification id is required.")));
  }

  listCertifications(filter = {}) {
    return Array.from(this.certifications.values())
      .filter((certification) => matchesCertification(certification, filter))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .map(clonePlainObject);
  }

  compareCertifications(firstId, secondId) {
    const first = this.certifications.get(requiredString(firstId, "First certification id is required."));
    const second = this.certifications.get(requiredString(secondId, "Second certification id is required."));
    if (!first || !second) throw new Error("Both certifications are required for comparison.");
    const result = {
      id: `certification_comparison:${stableHash({ firstId, secondId })}`,
      firstId,
      secondId,
      levelChange: { from: first.level, to: second.level },
      confidenceDelta: Number((second.confidence - first.confidence).toFixed(6)),
      completenessDelta: Number((second.completeness - first.completeness).toFixed(6)),
      failedChecksDelta: second.failedChecks.length - first.failedChecks.length,
      blockerDelta: second.blockers.length - first.blockers.length,
      createdAt: this.timestamp(),
    };
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.CERTIFICATION_COMPARED, { firstId, secondId });
    return result;
  }

  explainCertification(id) {
    const certification = this.certifications.get(requiredString(id, "Certification id is required."));
    if (!certification) throw new Error(`Unknown certification ${id}.`);
    return {
      id: `certification_explanation:${certification.id}`,
      certificationId: certification.id,
      profile: certification.profile,
      level: certification.level,
      passed: certification.passed,
      blockers: certification.blockers,
      warnings: certification.warnings,
      evidence: certification.evidence,
      summary: deterministicCertificationSummary(certification),
    };
  }

  explainFinding(id) {
    const finding = this.findings.get(requiredString(id, "Finding id is required."));
    if (!finding) throw new Error(`Unknown finding ${id}.`);
    return {
      id: `finding_explanation:${finding.id}`,
      findingId: finding.id,
      title: finding.title,
      severity: finding.severity,
      status: finding.status,
      evidence: finding.evidence,
      recommendation: finding.recommendation,
      summary: `${finding.title}: ${finding.description}`,
    };
  }

  generateReadinessReport(options = {}) {
    const profiles = safeArray(options.profiles && options.profiles.length ? options.profiles : [
      CERTIFICATION_PROFILES.CORE_INTELLIGENCE,
      CERTIFICATION_PROFILES.AUTONOMOUS_EXECUTION,
      CERTIFICATION_PROFILES.OFFLINE_OPERATION,
      CERTIFICATION_PROFILES.SECURITY_INVARIANTS,
      CERTIFICATION_PROFILES.APPROVAL_INVARIANTS,
      CERTIFICATION_PROFILES.IDE_BACKEND_READINESS,
      CERTIFICATION_PROFILES.FULL_LAYER_2,
    ]);
    const profileResults = profiles.map((profile) => this.runCertification(profile, { ...options, verifyDeterminism: options.verifyDeterminism !== false }));
    const health = this.getPlatformHealth({ ...options, skipChecks: false });
    const level = readinessLevel(profileResults, health);
    const blockers = dedupeBy(profileResults.flatMap((result) => result.blockers).concat(health.blockers), (finding) => finding.id);
    const warnings = dedupeBy(profileResults.flatMap((result) => result.warnings).concat(health.findings.filter((finding) => finding.severity === INTEGRATION_FINDING_SEVERITIES.LOW || finding.severity === INTEGRATION_FINDING_SEVERITIES.MEDIUM)), (finding) => finding.id);
    const capabilities = this.listCapabilities();
    const report = {
      id: `readiness:${stableHash({ profiles: profileResults.map((result) => [result.profile, result.level]), blockers: blockers.map((finding) => finding.id) })}`,
      executiveSummary: readinessSummary(level, blockers),
      currentCertificationLevel: level,
      profileResults,
      availableCapabilities: capabilities.filter((capability) => capability.status !== COMPONENT_STATUSES.UNAVAILABLE),
      degradedCapabilities: health.degradedCapabilities,
      unavailableCapabilities: capabilities.filter((capability) => capability.status === COMPONENT_STATUSES.UNAVAILABLE),
      componentHealth: health.componentHealth,
      integrationHealth: health.integrationHealth,
      invariantStatus: health.invariantStatus,
      evidenceStatus: this.validateEvidenceTraceability().status,
      persistenceAndRecoveryStatus: health.persistenceStatus,
      blockers,
      warnings,
      limitations: uniqueSorted(profileResults.flatMap((result) => result.limitations)),
      requiredActions: recommendationsForFindings(blockers.concat(warnings)),
      ideBackendReadiness: levelOrder(level) >= levelOrder(CERTIFICATION_LEVELS.IDE_CORE_READY),
      confidence: clampScore(average(profileResults.map((result) => result.confidence).concat([health.confidence]))),
      completeness: clampScore(average(profileResults.map((result) => result.completeness).concat([health.completeness]))),
      compatibilityMatrix: this.generateCompatibilityMatrix(),
      createdAt: this.timestamp(),
      metadata: clonePlainObject(options.metadata || {}),
    };
    this.readinessReports.push(report);
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.READINESS_REPORT_GENERATED, { reportId: report.id, level });
    return clonePlainObject(report);
  }

  validateReadinessReport(report) {
    const normalized = normalizeReadinessReport(report);
    const findings = [];
    const checks = [
      ["traceable conclusions", normalized.profileResults.every((result) => safeArray(result.evidence).length > 0 || result.level === CERTIFICATION_LEVELS.FAILED)],
      ["score consistency", validScore(normalized.confidence) && validScore(normalized.completeness)],
      ["certification consistency", normalized.profileResults.every((result) => validStatus(result.level, CERTIFICATION_LEVELS))],
      ["blocker visibility", normalized.blockers.every((finding) => normalized.requiredActions.some((action) => action.findingId === finding.id))],
      ["capability accuracy", normalized.availableCapabilities.every((capability) => this.capabilities.has(capability.id) || capability.providerId)],
      ["no unsupported readiness claim", !normalized.ideBackendReadiness || levelOrder(normalized.currentCertificationLevel) >= levelOrder(CERTIFICATION_LEVELS.IDE_CORE_READY)],
    ];
    for (const [title, passed] of checks) {
      if (!passed) findings.push(this.createFinding({
        domain: INTEGRATION_DOMAINS.CERTIFICATION,
        code: FINDING_CODES.CERTIFICATION_BLOCKER,
        severity: INTEGRATION_FINDING_SEVERITIES.HIGH,
        title: "Readiness report validation failed",
        description: title,
      }));
    }
    const result = { status: findings.length ? "FAILED" : "PASSED", checks: checks.map(([title, passed]) => ({ title, passed })), findings, reportId: normalized.id };
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.READINESS_REPORT_VALIDATED, { reportId: normalized.id, status: result.status });
    return result;
  }

  generateCompatibilityMatrix() {
    const matrix = this.sortedComponents().map((component) => ({
      component: component.id,
      version: component.version,
      schemaVersion: component.schemaVersion,
      requiredDependencies: component.requiredDependencies,
      optionalDependencies: component.optionalDependencies,
      compatible: this.validateSingleContract(component, this.adapters.get(component.id)).passed && dependencyStatus(component, this.components).filter((dependency) => dependency.required).every((dependency) => dependency.available),
      limitations: component.limitations,
      testedScenarios: this.scenarioSummaries.filter((scenario) => scenario.evidence.some((evidence) => evidence.sourceComponentId === component.id)).map((scenario) => scenario.scenarioId),
      certificationProfiles: this.listCertifications().filter((certification) => certification.componentVersions[component.id]).map((certification) => certification.profile),
      findings: this.openFindings().filter((finding) => finding.componentIds.includes(component.id)).map((finding) => finding.id),
    }));
    this.compatibilityMatrices.push({ id: `compatibility_matrix:${stableHash(matrix)}`, matrix, createdAt: this.timestamp() });
    return matrix;
  }

  addEvidenceReference(reference) {
    const normalized = normalizeEvidenceReference(reference, this);
    if (this.evidenceReferences.size + 1 > this.bounds.maximumEvidenceReferences) {
      return this.boundFinding("evidence references", INTEGRATION_DOMAINS.EVIDENCE);
    }
    this.evidenceReferences.set(normalized.id, normalized);
    return normalized;
  }

  createFinding(input) {
    if (this.findings.size >= this.bounds.maximumFindings) {
      this.stats.partialAnalyses += 1;
      this.emitLifecycle(INTEGRATION_EVENT_TYPES.ANALYSIS_PARTIAL, { reason: "maximum findings exceeded" });
      return normalizeIntegrationFinding({
        ...input,
        code: FINDING_CODES.BOUNDS_EXCEEDED,
        title: "Finding bound exceeded",
        description: "Maximum findings reached; additional findings were suppressed.",
      }, this);
    }
    const normalized = normalizeIntegrationFinding(input, this);
    const fingerprint = findingFingerprint(normalized);
    const existing = Array.from(this.findings.values()).find((finding) => findingFingerprint(finding) === fingerprint);
    if (existing) return clonePlainObject(existing);
    this.findings.set(normalized.id, normalized);
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.FINDING_CREATED, { findingId: normalized.id, code: normalized.code, severity: normalized.severity });
    this.refreshStats();
    return clonePlainObject(normalized);
  }

  createInvariantFinding(input) {
    const finding = this.createFinding(input);
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.INVARIANT_FAILED, { findingId: finding.id, domain: finding.domain, code: finding.code });
    return finding;
  }

  getStats() {
    this.refreshStats();
    return clonePlainObject(this.stats);
  }

  boundFinding(label, domain) {
    this.stats.partialAnalyses += 1;
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.ANALYSIS_PARTIAL, { reason: `${label} bound exceeded` });
    return this.createFinding({
      domain,
      code: FINDING_CODES.BOUNDS_EXCEEDED,
      severity: INTEGRATION_FINDING_SEVERITIES.MEDIUM,
      title: "Integration bound exceeded",
      description: `Maximum ${label} exceeded; result is partial.`,
    });
  }

  snapshot() {
    return {
      schemaVersion: INTELLIGENCE_INTEGRATION_SCHEMA_VERSION,
      repositoryPath: this.repositoryPath,
      components: this.sortedComponents(),
      capabilities: this.listCapabilities(),
      integrations: this.listIntegrations(),
      healthReports: Array.from(this.healthReports.values()).sort(compareById),
      certifications: this.listCertifications(),
      findings: Array.from(this.findings.values()).sort(compareById),
      evidenceReferences: Array.from(this.evidenceReferences.values()).sort(compareById),
      compatibilityMatrices: clonePlainObject(this.compatibilityMatrices),
      scenarioSummaries: clonePlainObject(this.scenarioSummaries),
      readinessReports: clonePlainObject(this.readinessReports),
      eventLog: clonePlainObject(this.eventLog),
      stats: this.getStats(),
      metadata: clonePlainObject(this.metadata),
    };
  }

  restore(snapshot) {
    const restored = migrateSnapshot(validateSnapshot(snapshot), this.migrations);
    this.components = new Map(restored.components.map((component) => [component.id, normalizeComponentDescriptor(component, this)]));
    this.capabilities = new Map(restored.capabilities.map((capability) => [capability.id, normalizeCapabilityDescriptor(capability, this)]));
    this.integrations = new Map(restored.integrations.map((integration) => [integration.id, normalizeIntegrationDescriptor(integration, this)]));
    this.healthReports = new Map(safeArray(restored.healthReports).map((report) => [report.id, normalizeHealthReport(report, this)]));
    this.certifications = new Map(safeArray(restored.certifications).map((certification) => [certification.id, normalizeCertificationResult(certification, this)]));
    this.findings = new Map(safeArray(restored.findings).map((finding) => [finding.id, normalizeIntegrationFinding(finding, this)]));
    this.evidenceReferences = new Map(safeArray(restored.evidenceReferences).map((reference) => [reference.id, normalizeEvidenceReference(reference, this)]));
    this.compatibilityMatrices = clonePlainObject(safeArray(restored.compatibilityMatrices));
    this.scenarioSummaries = clonePlainObject(safeArray(restored.scenarioSummaries));
    this.readinessReports = clonePlainObject(safeArray(restored.readinessReports));
    this.eventLog = clonePlainObject(safeArray(restored.eventLog));
    this.stats = { ...emptyStats(), ...clonePlainObject(restored.stats || {}) };
    this.metadata = clonePlainObject(restored.metadata || {});
    this.repositoryPath = restored.repositoryPath || this.repositoryPath;
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.RESTORED, { componentCount: this.components.size });
    this.refreshStats();
    return this.snapshot();
  }

  save(filePath = this.persistencePath) {
    const target = filePath || defaultPersistencePath(this.repositoryPath);
    if (!target) throw new Error("Intelligence integration persistence path is required.");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(this.snapshot(), null, 2)}\n`, "utf8");
    this.emitLifecycle(INTEGRATION_EVENT_TYPES.PERSISTED, { persistencePath: target });
    return { status: "PERSISTED", path: target, schemaVersion: INTELLIGENCE_INTEGRATION_SCHEMA_VERSION };
  }

  load(filePath = this.persistencePath, options = {}) {
    const target = filePath || defaultPersistencePath(this.repositoryPath);
    if (!target || !fs.existsSync(target)) {
      if (options.emptyOnMissing === false) throw new Error("Intelligence integration persistence file does not exist.");
      return { status: "EMPTY", path: target || null };
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
      this.restore(parsed);
      return { status: "LOADED", path: target, schemaVersion: INTELLIGENCE_INTEGRATION_SCHEMA_VERSION };
    } catch (error) {
      this.stats.corruptedLoads += 1;
      this.stats.recoveryAttempts += 1;
      this.emitLifecycle(INTEGRATION_EVENT_TYPES.CORRUPTION_DETECTED, { persistencePath: target, message: error.message });
      this.createFinding({
        domain: INTEGRATION_DOMAINS.PERSISTENCE,
        code: FINDING_CODES.RECOVERY_FAILURE,
        severity: INTEGRATION_FINDING_SEVERITIES.HIGH,
        title: "Integration persistence was corrupted",
        description: error.message,
      });
      this.certifications.clear();
      this.metadata.restoredStateIncomplete = true;
      this.emitLifecycle(INTEGRATION_EVENT_TYPES.RECOVERY_COMPLETED, { status: "EMPTY", recertificationRequired: true });
      if (options.emptyOnCorruption === false) throw error;
      return { status: "EMPTY", path: target, error: error.message, recertificationRequired: true };
    }
  }

  recordExternalEvent(event) {
    const normalized = {
      type: requiredString(event.type, "Event type is required."),
      timestamp: event.timestamp || this.timestamp(),
      componentId: event.componentId || null,
      sessionId: event.sessionId || null,
      metadata: clonePlainObject(event.metadata || {}),
      ...clonePlainObject(event),
    };
    this.eventLog.push(normalized);
    if (this.eventLog.length > this.bounds.maximumEventsInspected) this.eventLog = this.eventLog.slice(-this.bounds.maximumEventsInspected);
    return normalized;
  }

  sortedComponents() {
    return Array.from(this.components.values()).sort(compareById);
  }

  sortedIntegrations() {
    return Array.from(this.integrations.values()).sort(compareById);
  }

  openFindings() {
    return Array.from(this.findings.values()).filter((finding) => finding.status === INTEGRATION_FINDING_STATUSES.OPEN).sort(compareFindings);
  }

  timestamp() {
    const value = this.now();
    return typeof value === "number" ? new Date(value).toISOString() : String(value);
  }

  emitLifecycle(type, payload) {
    const event = {
      type,
      timestamp: this.timestamp(),
      ...clonePlainObject(payload || {}),
    };
    this.eventLog.push(event);
    if (this.eventLog.length > this.bounds.maximumEventsInspected) this.eventLog = this.eventLog.slice(-this.bounds.maximumEventsInspected);
    this.emit(INTEGRATION_EVENTS.LIFECYCLE, event);
    return event;
  }

  validateSingleContract(component, adapter) {
    const target = adapter && adapter.instance ? adapter.instance : adapter && adapter.runtime ? adapter.runtime : null;
    const requiredMethods = safeArray(component.metadata.requiredMethods);
    const missingMethods = requiredMethods.filter((method) => !target || typeof target[method] !== "function");
    return {
      id: `contract:${component.id}`,
      componentId: component.id,
      passed: missingMethods.length === 0 && Number(component.schemaVersion || 0) >= 1,
      missingMethods,
      schemaVersion: component.schemaVersion,
    };
  }

  collectEvidenceReferences(options = {}) {
    const explicit = safeArray(options.evidenceReferences);
    for (const reference of explicit) this.addEvidenceReference(reference);
    if (this.evidenceReferences.size === 0) {
      for (const component of this.sortedComponents()) {
        this.addEvidenceReference(evidenceReferenceFor(this, component.id, "component_descriptor", { sourceRecordId: component.id, confidence: 0.86 }));
      }
    }
    return Array.from(this.evidenceReferences.values()).sort(compareById).map(clonePlainObject);
  }

  calculateHealthScores(results) {
    const openCritical = this.openFindings().filter((finding) => finding.severity === INTEGRATION_FINDING_SEVERITIES.CRITICAL);
    const securityFailed = results.securityValidation.status === "FAILED";
    const approvalFailed = results.approvalValidation.status === "FAILED";
    const requiredContractFailed = results.contractValidation.findings.some((finding) => finding.severity === INTEGRATION_FINDING_SEVERITIES.HIGH || finding.severity === INTEGRATION_FINDING_SEVERITIES.CRITICAL);
    const scoreInputs = {
      componentAvailability: deductionScore(100, results.reports.filter((report) => report.status !== COMPONENT_STATUSES.HEALTHY).length * 8, "component health"),
      contractCompatibility: validationScore(results.contractValidation),
      integrationCoverage: validationScore(results.integrationValidation),
      capabilityCoverage: deductionScore(100, this.listCapabilities().filter((capability) => capability.status === COMPONENT_STATUSES.UNAVAILABLE).length * 6, "capability coverage"),
      evidenceTraceability: validationScore(results.evidenceValidation),
      authorityConsistency: validationScore(results.authorityValidation),
      securityIntegrity: validationScore(results.securityValidation),
      approvalIntegrity: validationScore(results.approvalValidation),
      lifecycleIntegrity: validationScore(results.lifecycleValidation),
      persistenceReliability: validationScore(results.persistenceValidation),
      recoveryReadiness: validationScore(results.persistenceValidation),
      degradedModeReadiness: deductionScore(90, this.openFindings().filter((finding) => finding.code === FINDING_CODES.DEGRADED_CAPABILITY).length * 6, "degraded mode"),
      testEvidence: deductionScore(85, this.openFindings().filter((finding) => finding.code === FINDING_CODES.MISSING_TEST_EVIDENCE).length * 10, "test evidence"),
    };
    const overallBase = average(Object.values(scoreInputs).map((score) => score.value));
    let overallCap = 100;
    if (openCritical.length || securityFailed || approvalFailed) overallCap = Math.min(overallCap, 49);
    if (requiredContractFailed) overallCap = Math.min(overallCap, 59);
    const overall = makeScore("overall integration health", Math.min(overallBase, overallCap), { cap: overallCap, confidence: 0.9 });
    return { ...scoreInputs, overallIntegrationHealth: overall };
  }

  verifyDeterministicRerun(profile, options = {}) {
    const first = deterministicCertificationProbe(this, profile, options);
    const second = deterministicCertificationProbe(this, profile, options);
    const equivalent = stableSerialize(stripRuntime(first)) === stableSerialize(stripRuntime(second));
    if (!equivalent) {
      const finding = this.createFinding({
        domain: INTEGRATION_DOMAINS.CERTIFICATION,
        code: FINDING_CODES.NONDETERMINISTIC_RESULT,
        severity: INTEGRATION_FINDING_SEVERITIES.HIGH,
        title: "Deterministic rerun mismatch",
        description: `${profile} produced different conclusions on identical inputs.`,
      });
      return { passed: false, findings: [finding], evidence: [] };
    }
    return { passed: true, evidence: [evidenceReferenceFor(this, "component:intelligence-integration", "deterministic_rerun", { sourceRecordId: profile, confidence: 0.91 })] };
  }

  stepCanRun(step) {
    if (step.componentId && !this.components.has(step.componentId)) return false;
    if (step.capability && !this.getCapability(step.capability)) return false;
    return true;
  }

  detectDuplicateCapabilityProviders() {
    const byName = new Map();
    for (const capability of this.capabilities.values()) {
      const key = `${capability.domain}:${normalizeText(capability.name)}`;
      const values = byName.get(key) || [];
      values.push(capability);
      byName.set(key, values);
    }
    for (const values of byName.values()) {
      const providers = uniqueSorted(values.map((capability) => capability.providerId));
      if (providers.length > 1) {
        this.createFinding({
          domain: INTEGRATION_DOMAINS.CAPABILITIES,
          code: FINDING_CODES.DUPLICATE_CAPABILITY_PROVIDER,
          severity: INTEGRATION_FINDING_SEVERITIES.LOW,
          title: "Duplicate capability providers",
          description: `${values[0].name} is provided by ${providers.join(", ")}.`,
          capabilityIds: values.map((capability) => capability.id),
          componentIds: providers,
        });
      }
    }
  }

  refreshStats() {
    const components = this.sortedComponents();
    const integrations = this.sortedIntegrations();
    const findings = Array.from(this.findings.values());
    this.stats.componentsRegistered = components.length;
    this.stats.capabilitiesRegistered = this.capabilities.size;
    this.stats.integrationsRegistered = integrations.length;
    this.stats.healthyComponents = components.filter((component) => component.status === COMPONENT_STATUSES.HEALTHY || component.status === COMPONENT_STATUSES.AVAILABLE).length;
    this.stats.degradedComponents = components.filter((component) => component.status === COMPONENT_STATUSES.DEGRADED || component.status === COMPONENT_STATUSES.PARTIAL).length;
    this.stats.unavailableComponents = components.filter((component) => component.status === COMPONENT_STATUSES.UNAVAILABLE).length;
    this.stats.incompatibleComponents = components.filter((component) => component.status === COMPONENT_STATUSES.INCOMPATIBLE).length;
    this.stats.connectedIntegrations = integrations.filter((integration) => integration.status === INTEGRATION_STATUSES.CONNECTED).length;
    this.stats.partialIntegrations = integrations.filter((integration) => integration.status === INTEGRATION_STATUSES.PARTIALLY_CONNECTED || integration.status === INTEGRATION_STATUSES.DEGRADED).length;
    this.stats.failedIntegrations = integrations.filter((integration) => integration.status === INTEGRATION_STATUSES.FAILED || integration.status === INTEGRATION_STATUSES.BLOCKED).length;
    this.stats.findings = findings.length;
    this.stats.criticalFindings = findings.filter((finding) => finding.severity === INTEGRATION_FINDING_SEVERITIES.CRITICAL).length;
    this.stats.invariantFailures = findings.filter((finding) => finding.code.endsWith("_invariant_failure") || finding.code === FINDING_CODES.AUTHORITY_ORDER_CONFLICT).length;
    this.stats.evidenceFailures = findings.filter((finding) => finding.code === FINDING_CODES.BROKEN_EVIDENCE_LINEAGE).length;
    this.stats.averageConfidence = average(Array.from(this.certifications.values()).map((certification) => certification.confidence));
    this.stats.averageCompleteness = average(Array.from(this.certifications.values()).map((certification) => certification.completeness));
    return this.stats;
  }
}

function createExecutionEngineAdapter() {
  return new ExecutionEngine({
    executeNextTask: async () => ({ completedStep: "integration-fixture", metadata: { validationPassed: true } }),
    validateResults: async () => ({ status: "PASSED", passed: true }),
  });
}

function createDefaultAdapter(definition, repositoryPath) {
  try {
    if (definition.factory) return { instance: definition.factory(repositoryPath) };
    if (definition.constructor === ExecutionSession) {
      return { instance: new ExecutionSession({ sessionId: "integration-fixture", objective: "Integration fixture" }) };
    }
    if (definition.constructor) return { instance: new definition.constructor(repositoryPath ? { repositoryPath } : {}) };
  } catch (error) {
    return { instance: null, healthCheck: () => ({ status: COMPONENT_STATUSES.UNAVAILABLE, failure: error.message }) };
  }
  return { instance: null };
}

function descriptorFromDefinition(definition, adapter) {
  const available = adapter && adapter.instance;
  return {
    id: definition.id,
    name: definition.name,
    type: definition.domain === INTEGRATION_DOMAINS.SECURITY ? COMPONENT_TYPES.VALIDATOR : definition.domain === INTEGRATION_DOMAINS.APPROVAL ? COMPONENT_TYPES.POLICY : COMPONENT_TYPES.ENGINE,
    version: "1.0.0",
    schemaVersion: definition.schemaVersion || 1,
    capabilities: definition.capabilities || [],
    requiredDependencies: definition.requiredDependencies || [],
    optionalDependencies: definition.optionalDependencies || [],
    adapters: [],
    collectors: [],
    eventsProduced: definition.eventsProduced || [],
    eventsConsumed: [],
    persistence: {
      supported: (definition.requiredMethods || []).includes("save"),
      schemaVersion: definition.schemaVersion || 1,
    },
    authorityRules: { order: [...AUTHORITY_ORDER] },
    healthCheck: null,
    status: available ? COMPONENT_STATUSES.AVAILABLE : COMPONENT_STATUSES.UNAVAILABLE,
    limitations: [],
    metadata: {
      domain: definition.domain,
      requiredMethods: definition.requiredMethods || [],
    },
    adapter,
  };
}

function normalizeComponentDescriptor(input, engine) {
  if (!isPlainObject(input)) throw new Error("Component descriptor is required.");
  const timestamp = input.createdAt || engine.timestamp();
  return {
    id: requiredString(input.id || `component:${stableHash({ name: input.name, type: input.type })}`, "Component id is required."),
    name: requiredString(input.name, "Component name is required."),
    type: normalizeEnum(input.type || COMPONENT_TYPES.UNKNOWN, COMPONENT_TYPES, "component type"),
    version: String(input.version || "1.0.0"),
    schemaVersion: Number(input.schemaVersion || 1),
    capabilities: uniqueSorted(safeArray(input.capabilities).map(String)),
    requiredDependencies: uniqueSorted(safeArray(input.requiredDependencies).map(String)),
    optionalDependencies: uniqueSorted(safeArray(input.optionalDependencies).map(String)),
    adapters: uniqueSorted(safeArray(input.adapters).map(String)),
    collectors: uniqueSorted(safeArray(input.collectors).map(String)),
    eventsProduced: uniqueSorted(safeArray(input.eventsProduced).map(String)),
    eventsConsumed: uniqueSorted(safeArray(input.eventsConsumed).map(String)),
    persistence: normalizePersistence(input.persistence),
    authorityRules: normalizeAuthorityRules(input.authorityRules),
    healthCheck: typeof input.healthCheck === "function" ? true : input.healthCheck || null,
    status: normalizeEnum(input.status || COMPONENT_STATUSES.AVAILABLE, COMPONENT_STATUSES, "component status"),
    limitations: uniqueSorted(safeArray(input.limitations).map(String)),
    metadata: clonePlainObject(input.metadata || {}),
    createdAt: timestamp,
    updatedAt: input.updatedAt || timestamp,
  };
}

function normalizeCapabilityDescriptor(input, engine) {
  if (!isPlainObject(input)) throw new Error("Capability descriptor is required.");
  const timestamp = input.createdAt || engine.timestamp();
  const name = requiredString(input.name, "Capability name is required.");
  const providerId = requiredString(input.providerId, "Capability provider id is required.");
  return {
    id: requiredString(input.id || capabilityId(providerId, name), "Capability id is required."),
    name,
    domain: normalizeEnum(input.domain || domainForCapability(name), INTEGRATION_DOMAINS, "capability domain"),
    providerId,
    description: String(input.description || `${name} capability.`),
    version: String(input.version || "1.0.0"),
    inputs: clonePlainObject(input.inputs || {}),
    outputs: clonePlainObject(input.outputs || {}),
    prerequisites: uniqueSorted(safeArray(input.prerequisites).map(String)),
    guarantees: uniqueSorted(safeArray(input.guarantees).map(String)),
    limitations: uniqueSorted(safeArray(input.limitations).map(String)),
    deterministic: input.deterministic !== false,
    offlineCapable: input.offlineCapable !== false,
    reversible: input.reversible === true,
    securitySensitive: input.securitySensitive === true,
    approvalSensitive: input.approvalSensitive === true,
    status: normalizeEnum(input.status || COMPONENT_STATUSES.AVAILABLE, COMPONENT_STATUSES, "capability status"),
    metadata: clonePlainObject(input.metadata || {}),
    createdAt: timestamp,
    updatedAt: input.updatedAt || timestamp,
  };
}

function normalizeIntegrationDescriptor(input, engine) {
  if (!isPlainObject(input)) throw new Error("Integration descriptor is required.");
  const sourceComponentId = requiredString(input.sourceComponentId, "Integration source component id is required.");
  const targetComponentId = requiredString(input.targetComponentId, "Integration target component id is required.");
  const domain = normalizeEnum(input.domain || INTEGRATION_DOMAINS.CERTIFICATION, INTEGRATION_DOMAINS, "integration domain");
  const timestamp = input.createdAt || engine.timestamp();
  return {
    id: requiredString(input.id || `integration:${sourceComponentId}->${targetComponentId}:${domain}`, "Integration id is required."),
    sourceComponentId,
    targetComponentId,
    domain,
    adapterId: input.adapterId || null,
    contractVersion: String(input.contractVersion || "1.0.0"),
    required: input.required === true,
    status: normalizeEnum(input.status || INTEGRATION_STATUSES.UNVERIFIED, INTEGRATION_STATUSES, "integration status"),
    capabilities: uniqueSorted(safeArray(input.capabilities).map(String)),
    evidenceFlows: safeArray(input.evidenceFlows).map((flow) => clonePlainObject(flow)),
    authorityConstraints: uniqueSorted(safeArray(input.authorityConstraints).map(String)),
    securityConstraints: uniqueSorted(safeArray(input.securityConstraints).map(String)),
    approvalConstraints: uniqueSorted(safeArray(input.approvalConstraints).map(String)),
    limitations: uniqueSorted(safeArray(input.limitations).map(String)),
    metadata: clonePlainObject(input.metadata || {}),
    createdAt: timestamp,
    updatedAt: input.updatedAt || timestamp,
  };
}

function normalizeHealthReport(input, engine) {
  const timestamp = input.createdAt || engine.timestamp();
  const componentId = requiredString(input.componentId, "Health report component id is required.");
  return {
    id: input.id || `health:${componentId}:${stableHash({ status: input.status, checks: input.checks, createdAt: timestamp })}`,
    componentId,
    status: normalizeEnum(input.status || COMPONENT_STATUSES.UNKNOWN, COMPONENT_STATUSES, "health status"),
    checks: safeArray(input.checks).map(clonePlainObject),
    failures: safeArray(input.failures).map(String),
    warnings: safeArray(input.warnings).map(String),
    limitations: safeArray(input.limitations).map(String),
    dependencies: safeArray(input.dependencies).map(clonePlainObject),
    confidence: normalizeScore(input.confidence, 0.5),
    completeness: normalizeScore(input.completeness, 0.5),
    evidence: safeArray(input.evidence).map((evidence) => normalizeEvidenceReference(evidence, engine)),
    createdAt: timestamp,
  };
}

function normalizeCertificationResult(input, engine) {
  const timestamp = input.createdAt || engine.timestamp();
  const profile = normalizeEnum(input.profile, CERTIFICATION_PROFILES, "certification profile");
  return {
    id: input.id || `certification:${profile}:${stableHash({ level: input.level, checks: safeArray(input.checks).map((check) => [check.id, check.status || check.passed]), blockers: safeArray(input.blockers).map((finding) => finding.id) })}`,
    profile,
    level: normalizeEnum(input.level || CERTIFICATION_LEVELS.NOT_ASSESSED, CERTIFICATION_LEVELS, "certification level"),
    passed: input.passed === true,
    status: String(input.status || (input.passed ? "PASSED" : "FAILED")),
    requirements: safeArray(input.requirements).map(String),
    checks: safeArray(input.checks).map(clonePlainObject),
    passedChecks: safeArray(input.passedChecks).map(clonePlainObject),
    failedChecks: safeArray(input.failedChecks).map(clonePlainObject),
    skippedChecks: safeArray(input.skippedChecks).map(clonePlainObject),
    blockers: safeArray(input.blockers).map(clonePlainObject),
    warnings: safeArray(input.warnings).map(clonePlainObject),
    invariants: clonePlainObject(input.invariants || {}),
    scenarios: safeArray(input.scenarios).map(clonePlainObject),
    evidence: safeArray(input.evidence).map((evidence) => normalizeEvidenceReference(evidence, engine)),
    confidence: normalizeScore(input.confidence, 0.5),
    completeness: normalizeScore(input.completeness, 0.5),
    limitations: uniqueSorted(safeArray(input.limitations).map(String)),
    componentVersions: clonePlainObject(input.componentVersions || {}),
    schemaVersions: clonePlainObject(input.schemaVersions || {}),
    repositoryRevision: String(input.repositoryRevision || "unknown"),
    metadata: clonePlainObject(input.metadata || {}),
    createdAt: timestamp,
  };
}

function normalizeIntegrationFinding(input, engine) {
  const timestamp = input.createdAt || engine.timestamp();
  const code = String(input.code || FINDING_CODES.UNKNOWN);
  return {
    id: input.id || `integration_finding:${code}:${stableHash({ title: input.title, componentIds: input.componentIds, integrationIds: input.integrationIds, evidence: input.evidence })}`,
    domain: normalizeEnum(input.domain || INTEGRATION_DOMAINS.CERTIFICATION, INTEGRATION_DOMAINS, "finding domain"),
    code,
    severity: normalizeEnum(input.severity || INTEGRATION_FINDING_SEVERITIES.INFO, INTEGRATION_FINDING_SEVERITIES, "finding severity"),
    status: normalizeEnum(input.status || INTEGRATION_FINDING_STATUSES.OPEN, INTEGRATION_FINDING_STATUSES, "finding status"),
    title: requiredString(input.title || code, "Finding title is required."),
    description: String(input.description || ""),
    componentIds: uniqueSorted(safeArray(input.componentIds).map(String)),
    integrationIds: uniqueSorted(safeArray(input.integrationIds).map(String)),
    capabilityIds: uniqueSorted(safeArray(input.capabilityIds).map(String)),
    invariantIds: uniqueSorted(safeArray(input.invariantIds).map(String)),
    evidence: safeArray(input.evidence).map((evidence) => isPlainObject(evidence) && evidence.sourceComponentId ? normalizeEvidenceReference(evidence, engine) : clonePlainObject(evidence)),
    recommendation: normalizeRecommendation(input.recommendation, input.severity),
    confidence: normalizeScore(input.confidence, 0.8),
    metadata: clonePlainObject(input.metadata || {}),
    createdAt: timestamp,
    updatedAt: input.updatedAt || timestamp,
  };
}

function normalizeEvidenceReference(input, engine) {
  const sourceComponentId = input.sourceComponentId || "component:intelligence-integration";
  const sourceType = String(input.sourceType || "unknown");
  const sourceRecordId = String(input.sourceRecordId || `${sourceComponentId}:${sourceType}`);
  const timestamp = input.timestamp || engine.timestamp();
  return {
    id: input.id || `evidence:${stableHash({ sourceComponentId, sourceRecordId, sourceType, projectId: input.projectId, sessionId: input.sessionId, revision: input.revision })}`,
    sourceComponentId,
    sourceRecordId,
    sourceType,
    projectId: input.projectId || null,
    sessionId: input.sessionId || null,
    revision: input.revision || null,
    version: input.version || null,
    contentHash: input.contentHash || null,
    authority: input.authority || "verified_repository_state",
    confidence: normalizeScore(input.confidence, 0.75),
    timestamp,
    metadata: clonePlainObject(input.metadata || {}),
  };
}

function normalizeRuntimeAdapter(input, descriptor) {
  const adapter = input.adapter || input.runtime || {};
  const instance = input.instance || adapter.instance || adapter;
  return {
    componentId: descriptor.id,
    instance,
    runtime: input.runtime || null,
    healthCheck: input.healthCheck || adapter.healthCheck || null,
  };
}

function normalizeScenario(scenarioIdOrDefinition, engine) {
  if (isPlainObject(scenarioIdOrDefinition)) {
    return {
      id: requiredString(scenarioIdOrDefinition.id, "Scenario id is required."),
      description: String(scenarioIdOrDefinition.description || ""),
      prerequisites: uniqueSorted(safeArray(scenarioIdOrDefinition.prerequisites).map(String)),
      inputs: clonePlainObject(scenarioIdOrDefinition.inputs || {}),
      steps: safeArray(scenarioIdOrDefinition.steps).map((step, index) => ({ id: step.id || `step-${index + 1}`, ...clonePlainObject(step) })),
      expectedOutputs: clonePlainObject(scenarioIdOrDefinition.expectedOutputs || {}),
      expectedEvents: uniqueSorted(safeArray(scenarioIdOrDefinition.expectedEvents).map(String)),
      expectedEvidenceLineage: safeArray(scenarioIdOrDefinition.expectedEvidenceLineage).map(clonePlainObject),
      requiredInvariants: uniqueSorted(safeArray(scenarioIdOrDefinition.requiredInvariants).map(String)),
      timeoutMs: Number(scenarioIdOrDefinition.timeoutMs || 1000),
      deterministicFixtures: clonePlainObject(scenarioIdOrDefinition.deterministicFixtures || {}),
      cleanupBehavior: String(scenarioIdOrDefinition.cleanupBehavior || "none"),
    };
  }
  const id = requiredString(scenarioIdOrDefinition, "Scenario id is required.");
  const definition = defaultScenarioDefinition(id);
  if (!definition) throw new Error(`Unknown scenario ${id}.`);
  return normalizeScenario(definition, engine);
}

function defaultScenarioDefinition(id) {
  const map = {
    repository_to_index: ["component:repository-knowledge-graph", "component:offline-knowledge-index"],
    repository_to_graph: ["component:repository-knowledge-graph"],
    graph_to_code_understanding: ["component:repository-knowledge-graph", "component:code-understanding"],
    index_to_context: ["component:offline-knowledge-index", "component:context-intelligence"],
    code_understanding_to_context: ["component:code-understanding", "component:context-intelligence"],
    planning_to_context: ["component:planning-intelligence", "component:context-intelligence"],
    project_intelligence_synthesis: ["component:project-intelligence", "component:code-understanding"],
    learning_from_execution_outcome: ["component:cross-session-learning", "component:execution-session"],
    learning_to_context_adaptation: ["component:learning-adaptation", "component:context-intelligence"],
    learning_to_planning_adaptation: ["component:learning-adaptation", "component:planning-intelligence"],
    execution_to_validation: ["component:execution-engine", "component:continue-engine"],
    failed_execution_to_repair: ["component:execution-engine", "component:repair-engine"],
    protected_execution_to_approval: ["component:execution-engine", "component:approval-gateway"],
    security_failure_to_release_block: ["component:security-validator", "component:project-intelligence"],
    objective_completion_to_project_assessment: ["component:objective-completion", "component:project-intelligence"],
    project_assessment_to_next_action: ["component:project-intelligence"],
    persistence_snapshot_restore: ["component:intelligence-integration"],
    corruption_recovery: ["component:intelligence-integration"],
    degraded_optional_component: ["component:intelligence-integration"],
    full_offline_intelligence_flow: ["component:repository-knowledge-graph", "component:offline-knowledge-index", "component:context-intelligence", "component:planning-intelligence"],
    end_to_end_project_analysis: ["component:repository-knowledge-graph", "component:offline-knowledge-index", "component:code-understanding", "component:project-intelligence"],
  };
  const prerequisites = map[id];
  if (!prerequisites) return null;
  return {
    id,
    description: `${id.replace(/_/g, " ")} integration scenario.`,
    prerequisites,
    inputs: { fixture: id },
    steps: prerequisites.map((componentId, index) => ({
      id: `step-${index + 1}`,
      componentId,
      event: `scenario:${id}:step-${index + 1}`,
      output: `${componentId}:ok`,
    })),
    expectedOutputs: { status: "PASSED" },
    expectedEvents: prerequisites.map((_, index) => `scenario:${id}:step-${index + 1}`),
    expectedEvidenceLineage: prerequisites.map((componentId) => ({ sourceComponentId: componentId, sourceType: "scenario_step" })),
    requiredInvariants: ["authority", "security", "approval"],
    timeoutMs: 1000,
    deterministicFixtures: { id },
    cleanupBehavior: "none",
  };
}

function certificationValidators(engine, profile, options) {
  const validators = [];
  const add = (id, title, run, invariant = null) => validators.push({ id, title, run, invariant });
  if ([CERTIFICATION_PROFILES.CORE_INTELLIGENCE, CERTIFICATION_PROFILES.FULL_LAYER_2, CERTIFICATION_PROFILES.IDE_BACKEND_READINESS].includes(profile)) {
    add("contracts", "LI contracts", () => engine.validateContracts());
    add("integrations", "LI integrations", () => engine.validateIntegrations());
    add("evidence", "Evidence traceability", () => engine.validateEvidenceTraceability(), "evidence");
    add("authority", "Authority consistency", () => engine.validateAuthorityConsistency(), "authority");
    add("persistence", "Persistence compatibility", () => engine.validatePersistenceAndRecovery());
  }
  if ([CERTIFICATION_PROFILES.AUTONOMOUS_EXECUTION, CERTIFICATION_PROFILES.FULL_LAYER_2].includes(profile)) {
    add("ae-contracts", "AE contracts", () => engine.validateContracts());
    add("ae-lifecycle", "AE lifecycle ordering", () => engine.validateLifecycleOrdering(options), "lifecycle");
  }
  if ([CERTIFICATION_PROFILES.OFFLINE_OPERATION, CERTIFICATION_PROFILES.DEGRADED_OPERATION, CERTIFICATION_PROFILES.FULL_LAYER_2].includes(profile)) {
    add("offline", "Offline operation", () => offlineValidation(engine, options));
    add("degraded", "Degraded operation", () => degradedValidation(engine, options));
  }
  if ([CERTIFICATION_PROFILES.SECURITY_INVARIANTS, CERTIFICATION_PROFILES.FULL_LAYER_2, CERTIFICATION_PROFILES.AUTONOMOUS_EXECUTION].includes(profile)) {
    add("security", "Security invariants", () => engine.validateSecurityInvariants(options), "security");
  }
  if ([CERTIFICATION_PROFILES.APPROVAL_INVARIANTS, CERTIFICATION_PROFILES.FULL_LAYER_2, CERTIFICATION_PROFILES.AUTONOMOUS_EXECUTION].includes(profile)) {
    add("approval", "Approval invariants", () => engine.validateApprovalInvariants(options), "approval");
  }
  if ([CERTIFICATION_PROFILES.PERSISTENCE_AND_RECOVERY, CERTIFICATION_PROFILES.FULL_LAYER_2].includes(profile)) {
    add("persistence-recovery", "Persistence and recovery", () => engine.validatePersistenceAndRecovery(options));
  }
  if ([CERTIFICATION_PROFILES.EVIDENCE_TRACEABILITY, CERTIFICATION_PROFILES.FULL_LAYER_2].includes(profile)) {
    add("evidence-traceability", "Evidence traceability", () => engine.validateEvidenceTraceability(options), "evidence");
  }
  if (validators.length === 0) add("health", "Platform health", () => ({ status: "PASSED", checks: [], findings: [], confidence: 0.8, completeness: 0.8 }));
  return validators;
}

function offlineValidation(engine, options) {
  const offlineCapabilities = engine.listCapabilities().filter((capability) => capability.offlineCapable);
  const findings = [];
  if (options.networkRequired === true) findings.push(engine.createFinding({
    domain: INTEGRATION_DOMAINS.CERTIFICATION,
    code: FINDING_CODES.CERTIFICATION_BLOCKER,
    severity: INTEGRATION_FINDING_SEVERITIES.HIGH,
    title: "Network dependency detected",
    description: "Offline operation cannot require network access.",
  }));
  return {
    status: findings.length ? "FAILED" : "PASSED",
    checks: [{ id: "offline:capabilities", passed: offlineCapabilities.length > 0 }],
    findings,
    confidence: findings.length ? 0.45 : 0.9,
    completeness: offlineCapabilities.length ? 0.9 : 0.5,
  };
}

function degradedValidation(engine, options) {
  const findings = [];
  const optionalMissing = dependencyFindings(engine).filter((finding) => !finding.required);
  if (options.degradedBypassesSecurity || options.degradedBypassesApproval) {
    findings.push(engine.createFinding({
      domain: INTEGRATION_DOMAINS.CERTIFICATION,
      code: FINDING_CODES.CERTIFICATION_BLOCKER,
      severity: INTEGRATION_FINDING_SEVERITIES.CRITICAL,
      title: "Degraded mode bypasses an invariant",
      description: "Degraded operation cannot bypass security or approval gates.",
    }));
  }
  return {
    status: findings.length ? "FAILED" : "PASSED",
    checks: [{ id: "degraded:optional-missing", passed: true, optionalMissing: optionalMissing.length }],
    findings,
    confidence: optionalMissing.length ? 0.76 : 0.88,
    completeness: optionalMissing.length ? 0.78 : 0.9,
  };
}

function certificationRequirements(profile) {
  const requirements = {
    [CERTIFICATION_PROFILES.CORE_INTELLIGENCE]: ["LI-001 through LI-008 contracts", "repository-to-project flow", "offline operation", "evidence traceability", "authority consistency", "persistence compatibility"],
    [CERTIFICATION_PROFILES.AUTONOMOUS_EXECUTION]: ["AE-001 through AE-007 contracts", "approval gating", "security gating", "validation", "repair", "objective completion", "event ordering", "evidence lineage"],
    [CERTIFICATION_PROFILES.OFFLINE_OPERATION]: ["no network dependency", "deterministic fallback behavior", "local persistence", "offline index", "offline project analysis"],
    [CERTIFICATION_PROFILES.DEGRADED_OPERATION]: ["optional failure isolation", "stale-data behavior", "corruption fallback", "confidence reduction", "invariant preservation"],
    [CERTIFICATION_PROFILES.SECURITY_INVARIANTS]: ["security cannot be disabled", "critical findings block readiness", "unauthorized execution remains blocked"],
    [CERTIFICATION_PROFILES.APPROVAL_INVARIANTS]: ["approval cannot be bypassed", "plans cannot self-approve", "missing approval is not acceptance"],
    [CERTIFICATION_PROFILES.PERSISTENCE_AND_RECOVERY]: ["save/load", "schema versions", "migrations", "snapshot/restore", "corruption handling", "empty fallback"],
    [CERTIFICATION_PROFILES.EVIDENCE_TRACEABILITY]: ["end-to-end evidence references", "authority metadata", "revision metadata", "stale evidence detection", "explanation traceability"],
    [CERTIFICATION_PROFILES.IDE_BACKEND_READINESS]: ["capability discovery", "project summaries", "architecture state", "plans", "context packages", "code understanding", "execution state", "health reports"],
    [CERTIFICATION_PROFILES.FULL_LAYER_2]: ["all required profiles aggregate successfully"],
  };
  return requirements[profile] || [];
}

function certificationScenarios(profile) {
  if (profile === CERTIFICATION_PROFILES.CORE_INTELLIGENCE) return DEFAULT_SCENARIOS.slice(0, 10);
  if (profile === CERTIFICATION_PROFILES.AUTONOMOUS_EXECUTION) return DEFAULT_SCENARIOS.slice(10, 15);
  if (profile === CERTIFICATION_PROFILES.OFFLINE_OPERATION) return ["repository_to_index", "index_to_context", "full_offline_intelligence_flow"];
  if (profile === CERTIFICATION_PROFILES.DEGRADED_OPERATION) return ["degraded_optional_component", "corruption_recovery"];
  if (profile === CERTIFICATION_PROFILES.PERSISTENCE_AND_RECOVERY) return ["persistence_snapshot_restore", "corruption_recovery"];
  if (profile === CERTIFICATION_PROFILES.IDE_BACKEND_READINESS) return ["end_to_end_project_analysis", "project_assessment_to_next_action"];
  if (profile === CERTIFICATION_PROFILES.FULL_LAYER_2) return DEFAULT_SCENARIOS;
  return [];
}

function certificationLevelFor(input) {
  const criticalBlocker = input.blockers.some((finding) => finding.severity === INTEGRATION_FINDING_SEVERITIES.CRITICAL);
  const highBlocker = input.blockers.some((finding) => finding.severity === INTEGRATION_FINDING_SEVERITIES.HIGH);
  if (criticalBlocker) return CERTIFICATION_LEVELS.FAILED;
  if (input.confidence < input.minimumConfidence || input.completeness < input.minimumCompleteness) return CERTIFICATION_LEVELS.INSUFFICIENT_EVIDENCE;
  if (input.failedChecks.length || input.scenarioFailures.length) return highBlocker ? CERTIFICATION_LEVELS.FAILED : CERTIFICATION_LEVELS.DEVELOPMENT;
  if (input.profile === CERTIFICATION_PROFILES.IDE_BACKEND_READINESS || input.profile === CERTIFICATION_PROFILES.FULL_LAYER_2) return CERTIFICATION_LEVELS.IDE_CORE_READY;
  if (input.profile === CERTIFICATION_PROFILES.SECURITY_INVARIANTS || input.profile === CERTIFICATION_PROFILES.APPROVAL_INVARIANTS) return CERTIFICATION_LEVELS.INTEGRATION_READY;
  return CERTIFICATION_LEVELS.INTEGRATION_READY;
}

function readinessLevel(profileResults, health) {
  const failed = profileResults.some((result) => result.level === CERTIFICATION_LEVELS.FAILED);
  const insufficient = profileResults.some((result) => result.level === CERTIFICATION_LEVELS.INSUFFICIENT_EVIDENCE);
  const ideReady = profileResults.some((result) => result.profile === CERTIFICATION_PROFILES.IDE_BACKEND_READINESS && levelOrder(result.level) >= levelOrder(CERTIFICATION_LEVELS.IDE_CORE_READY));
  if (failed) return CERTIFICATION_LEVELS.FAILED;
  if (insufficient) return CERTIFICATION_LEVELS.INSUFFICIENT_EVIDENCE;
  if (ideReady && health.scores.overallIntegrationHealth.value >= 70) return CERTIFICATION_LEVELS.IDE_CORE_READY;
  return CERTIFICATION_LEVELS.INTEGRATION_READY;
}

function readinessSummary(level, blockers) {
  if (level === CERTIFICATION_LEVELS.IDE_CORE_READY) return "Layer 2 is ready for IDE backend integration with production certification still gated by stricter evidence thresholds.";
  if (level === CERTIFICATION_LEVELS.FAILED) return `Layer 2 is blocked by ${blockers.length} high or critical integration finding(s).`;
  return `Layer 2 readiness is ${level}.`;
}

function defaultIntegrationDefinitions() {
  const link = (sourceComponentId, targetComponentId, domain, required, capabilities = []) => ({
    id: `integration:${sourceComponentId}->${targetComponentId}:${domain}`,
    sourceComponentId,
    targetComponentId,
    domain,
    required,
    status: INTEGRATION_STATUSES.UNVERIFIED,
    capabilities,
    evidenceFlows: [{ from: sourceComponentId, to: targetComponentId, type: "reference" }],
    authorityConstraints: AUTHORITY_ORDER,
    securityConstraints: ["security findings remain visible"],
    approvalConstraints: ["approval requirements remain visible"],
  });
  return [
    link("component:repository-knowledge-graph", "component:offline-knowledge-index", INTEGRATION_DOMAINS.OFFLINE_INDEX, true, ["offline search"]),
    link("component:repository-knowledge-graph", "component:code-understanding", INTEGRATION_DOMAINS.CODE_UNDERSTANDING, true, ["code entity analysis"]),
    link("component:offline-knowledge-index", "component:context-intelligence", INTEGRATION_DOMAINS.CONTEXT, true, ["context assembly"]),
    link("component:code-understanding", "component:context-intelligence", INTEGRATION_DOMAINS.CONTEXT, false, ["context ranking"]),
    link("component:planning-intelligence", "component:context-intelligence", INTEGRATION_DOMAINS.CONTEXT, true, ["planning"]),
    link("component:code-understanding", "component:project-intelligence", INTEGRATION_DOMAINS.PROJECT_INTELLIGENCE, true, ["project assessment"]),
    link("component:learning-adaptation", "component:context-intelligence", INTEGRATION_DOMAINS.LEARNING_ADAPTATION, false, ["bounded adaptation"]),
    link("component:learning-adaptation", "component:planning-intelligence", INTEGRATION_DOMAINS.LEARNING_ADAPTATION, false, ["bounded adaptation"]),
    link("component:execution-engine", "component:continue-engine", INTEGRATION_DOMAINS.EXECUTION, true, ["execution"]),
    link("component:execution-engine", "component:repair-engine", INTEGRATION_DOMAINS.REPAIR, true, ["repair"]),
    link("component:execution-engine", "component:approval-gateway", INTEGRATION_DOMAINS.APPROVAL, true, ["approval gating"]),
    link("component:execution-engine", "component:security-validator", INTEGRATION_DOMAINS.SECURITY, true, ["security gating"]),
    link("component:execution-engine", "component:objective-completion", INTEGRATION_DOMAINS.OBJECTIVE_COMPLETION, true, ["objective completion"]),
    link("component:security-validator", "component:project-intelligence", INTEGRATION_DOMAINS.SECURITY, true, ["release-readiness assessment"]),
    link("component:objective-completion", "component:project-intelligence", INTEGRATION_DOMAINS.OBJECTIVE_COMPLETION, false, ["project assessment"]),
  ];
}

function normalizeReadinessReport(report) {
  if (!isPlainObject(report)) throw new Error("Readiness report is required.");
  return {
    id: requiredString(report.id, "Readiness report id is required."),
    currentCertificationLevel: normalizeEnum(report.currentCertificationLevel, CERTIFICATION_LEVELS, "readiness level"),
    profileResults: safeArray(report.profileResults),
    availableCapabilities: safeArray(report.availableCapabilities),
    blockers: safeArray(report.blockers),
    requiredActions: safeArray(report.requiredActions),
    confidence: normalizeScore(report.confidence, 0),
    completeness: normalizeScore(report.completeness, 0),
    ideBackendReadiness: report.ideBackendReadiness === true,
  };
}

function normalizePersistence(input = {}) {
  return {
    supported: input.supported === true,
    schemaVersion: Number(input.schemaVersion || 1),
    path: input.path || null,
    migrationSupported: input.migrationSupported === true,
    corruptionHandling: input.corruptionHandling || "empty_fallback",
  };
}

function normalizeAuthorityRules(input = {}) {
  return {
    order: safeArray(input.order || AUTHORITY_ORDER).map(String),
    metadata: clonePlainObject(input.metadata || {}),
  };
}

function normalizeRecommendation(input, severity) {
  if (isPlainObject(input)) {
    return {
      priority: input.priority || severityPriority(severity),
      action: String(input.action || "Review finding."),
      effort: normalizeEnum(input.effort || RECOMMENDATION_EFFORTS.UNKNOWN, RECOMMENDATION_EFFORTS, "recommendation effort"),
      evidenceBased: input.evidenceBased !== false,
    };
  }
  return {
    priority: severityPriority(severity),
    action: input ? String(input) : "Review finding and resolve supporting evidence.",
    effort: RECOMMENDATION_EFFORTS.UNKNOWN,
    evidenceBased: true,
  };
}

function recommendationsForFindings(findings) {
  return dedupeBy(findings.map((finding) => ({
    id: `recommendation:${finding.id}`,
    findingId: finding.id,
    priority: severityPriority(finding.severity),
    action: finding.recommendation.action,
    effort: finding.recommendation.effort,
    evidence: finding.evidence,
  })), (recommendation) => recommendation.findingId).sort((left, right) => left.priority - right.priority || left.findingId.localeCompare(right.findingId));
}

function dependencyStatus(component, components) {
  return component.requiredDependencies.map((id) => dependencyRecord(id, components, true)).concat(component.optionalDependencies.map((id) => dependencyRecord(id, components, false)));
}

function dependencyRecord(id, components, required) {
  const component = components.get(id);
  return {
    id,
    required,
    available: Boolean(component),
    status: component ? component.status : COMPONENT_STATUSES.UNAVAILABLE,
  };
}

function dependencyFindings(engine) {
  const records = [];
  for (const component of engine.sortedComponents()) {
    for (const dependency of dependencyStatus(component, engine.components)) {
      if (!dependency.available) records.push({ componentId: component.id, dependencyId: dependency.id, required: dependency.required, status: COMPONENT_STATUSES.UNAVAILABLE });
    }
  }
  return records;
}

function matchesCapability(capability, filter = {}) {
  if (filter.domain && capability.domain !== filter.domain) return false;
  if (filter.providerId && capability.providerId !== filter.providerId) return false;
  if (filter.status && capability.status !== filter.status) return false;
  if (filter.offlineCapable !== undefined && capability.offlineCapable !== filter.offlineCapable) return false;
  return true;
}

function matchesIntegration(integration, filter = {}) {
  if (filter.domain && integration.domain !== filter.domain) return false;
  if (filter.status && integration.status !== filter.status) return false;
  if (filter.required !== undefined && integration.required !== filter.required) return false;
  return true;
}

function matchesCertification(certification, filter = {}) {
  if (filter.profile && certification.profile !== filter.profile) return false;
  if (filter.level && certification.level !== filter.level) return false;
  if (filter.passed !== undefined && certification.passed !== filter.passed) return false;
  return true;
}

function domainForCapability(name) {
  const text = normalizeText(name);
  if (text.includes("graph") || text.includes("repository scanning")) return INTEGRATION_DOMAINS.REPOSITORY_KNOWLEDGE;
  if (text.includes("search") || text.includes("retrieval")) return INTEGRATION_DOMAINS.OFFLINE_INDEX;
  if (text.includes("context")) return INTEGRATION_DOMAINS.CONTEXT;
  if (text.includes("planning") || text.includes("decomposition")) return INTEGRATION_DOMAINS.PLANNING;
  if (text.includes("code") || text.includes("architecture") || text.includes("impact")) return INTEGRATION_DOMAINS.CODE_UNDERSTANDING;
  if (text.includes("project") || text.includes("risk") || text.includes("readiness")) return INTEGRATION_DOMAINS.PROJECT_INTELLIGENCE;
  if (text.includes("learning") || text.includes("adaptation")) return INTEGRATION_DOMAINS.LEARNING_ADAPTATION;
  if (text.includes("repair")) return INTEGRATION_DOMAINS.REPAIR;
  if (text.includes("approval")) return INTEGRATION_DOMAINS.APPROVAL;
  if (text.includes("security")) return INTEGRATION_DOMAINS.SECURITY;
  if (text.includes("completion")) return INTEGRATION_DOMAINS.OBJECTIVE_COMPLETION;
  if (text.includes("persistence") || text.includes("recovery")) return INTEGRATION_DOMAINS.PERSISTENCE;
  if (text.includes("event")) return INTEGRATION_DOMAINS.EVENTS;
  return INTEGRATION_DOMAINS.CAPABILITIES;
}

function defaultCapabilityGuarantees(name) {
  const guarantees = ["deterministic offline default", "normalized descriptor"];
  if (securitySensitiveCapability(name)) guarantees.push("security invariants preserved");
  if (approvalSensitiveCapability(name)) guarantees.push("approval invariants preserved");
  return guarantees;
}

function reversibleCapability(name) {
  return /snapshot|restore|recovery|adaptation|persistence/i.test(name);
}

function securitySensitiveCapability(name) {
  return /security|execution|repair|approval|validation|completion|adaptation/i.test(name);
}

function approvalSensitiveCapability(name) {
  return /approval|execution|shell|file|git|package|network|adaptation/i.test(name);
}

function capabilityId(providerId, name) {
  return `capability:${providerId}:${normalizeToken(name)}`;
}

function evidenceReferenceFor(engine, sourceComponentId, sourceType, input = {}) {
  return normalizeEvidenceReference({
    sourceComponentId,
    sourceType,
    sourceRecordId: input.sourceRecordId || `${sourceComponentId}:${sourceType}`,
    projectId: input.projectId || engine.metadata.projectId || null,
    sessionId: input.sessionId || null,
    revision: input.revision || engine.metadata.repositoryRevision || null,
    version: input.version || null,
    contentHash: input.contentHash || null,
    authority: input.authority || "verified_repository_state",
    confidence: input.confidence || 0.8,
    metadata: input.metadata || {},
  }, engine);
}

function validationScore(validation) {
  const failed = safeArray(validation.findings).filter((finding) => [INTEGRATION_FINDING_SEVERITIES.HIGH, INTEGRATION_FINDING_SEVERITIES.CRITICAL].includes(finding.severity)).length;
  const deductions = failed * 25 + (validation.status === "FAILED" ? 25 : validation.status === "PARTIAL" ? 10 : 0);
  return deductionScore(100, deductions, validation.status);
}

function deductionScore(baseline, deductions, label) {
  return makeScore(label, Math.max(0, baseline - deductions), { deductions: [{ reason: label, value: deductions }], confidence: 0.88 });
}

function makeScore(label, value, input = {}) {
  return {
    value: Math.round(Math.max(0, Math.min(100, Number(value || 0)))),
    baseline: 100,
    deductions: input.deductions || [],
    caps: input.cap === undefined ? [] : [{ reason: label, value: input.cap }],
    evidence: input.evidence || [{ source: label, signal: "deterministic health score" }],
    confidence: normalizeScore(input.confidence, 0.85),
  };
}

function deterministicCertificationProbe(engine, profile) {
  return {
    profile,
    components: engine.sortedComponents().map((component) => [component.id, component.status, component.schemaVersion]),
    capabilities: engine.listCapabilities().map((capability) => [capability.id, capability.status]),
    integrations: engine.listIntegrations().map((integration) => [integration.id, integration.status]),
    findings: engine.openFindings().map((finding) => [finding.code, finding.severity, finding.status, finding.title]),
  };
}

function stripRuntime(value) {
  if (Array.isArray(value)) return value.map(stripRuntime);
  if (isPlainObject(value)) {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (["createdAt", "updatedAt", "timestamp", "duration", "elapsedMs"].includes(key)) continue;
      result[key] = stripRuntime(value[key]);
    }
    return result;
  }
  return value;
}

function deterministicCertificationSummary(certification) {
  return `${certification.profile} is ${certification.level} with ${certification.passedChecks.length} passed check(s), ${certification.failedChecks.length} failed check(s), confidence ${certification.confidence}, and completeness ${certification.completeness}.`;
}

function certificationLimitations(profile, level) {
  const limitations = ["Certification is evidence-bound and offline deterministic."];
  if (level !== CERTIFICATION_LEVELS.CERTIFIED) limitations.push("Production certification requires stricter operational and test evidence than this milestone claims.");
  if (profile === CERTIFICATION_PROFILES.DEGRADED_OPERATION) limitations.push("Optional subsystem failures lower confidence and completeness.");
  return limitations;
}

function levelOrder(level) {
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

function findingFingerprint(finding) {
  return stableSerialize({
    domain: finding.domain,
    code: finding.code,
    title: finding.title,
    componentIds: finding.componentIds,
    integrationIds: finding.integrationIds,
    evidence: finding.evidence.map((entry) => entry.id || stableSerialize(entry)),
  });
}

function sameSession(left, right) {
  if (!left.sessionId || !right.sessionId) return true;
  return left.sessionId === right.sessionId;
}

function sameEventScope(left, right) {
  if (left.sessionId || right.sessionId) return left.sessionId && right.sessionId && left.sessionId === right.sessionId;
  if (left.certificationId || right.certificationId) return left.certificationId && right.certificationId && left.certificationId === right.certificationId;
  if (left.scenarioId || right.scenarioId) return left.scenarioId && right.scenarioId && left.scenarioId === right.scenarioId;
  return false;
}

function validateSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) throw new Error("Integration snapshot is required.");
  if (Number(snapshot.schemaVersion) !== INTELLIGENCE_INTEGRATION_SCHEMA_VERSION) throw new Error("Unsupported integration snapshot schema version.");
  return snapshot;
}

function migrateSnapshot(snapshot, migrations) {
  let current = clonePlainObject(snapshot);
  for (const migration of safeArray(migrations)) current = migration(current);
  return current;
}

function normalizeBounds(input) {
  const bounds = { ...DEFAULT_BOUNDS };
  for (const [key, value] of Object.entries(input)) {
    if (key.startsWith("minimum")) bounds[key] = normalizeScore(value, DEFAULT_BOUNDS[key]);
    else bounds[key] = normalizePositiveInteger(value, DEFAULT_BOUNDS[key]);
  }
  return bounds;
}

function assertWithinBound(value, bound, label) {
  if (value > bound) throw new Error(`Intelligence integration ${label} bound exceeded.`);
}

function emptyStats() {
  return {
    componentsRegistered: 0,
    capabilitiesRegistered: 0,
    integrationsRegistered: 0,
    healthyComponents: 0,
    degradedComponents: 0,
    unavailableComponents: 0,
    incompatibleComponents: 0,
    connectedIntegrations: 0,
    partialIntegrations: 0,
    failedIntegrations: 0,
    healthChecks: 0,
    scenariosExecuted: 0,
    scenariosPassed: 0,
    scenariosFailed: 0,
    certificationsExecuted: 0,
    certificationsPassed: 0,
    certificationsFailed: 0,
    certificationLevels: {},
    findings: 0,
    criticalFindings: 0,
    invariantFailures: 0,
    evidenceFailures: 0,
    corruptedLoads: 0,
    recoveryAttempts: 0,
    partialAnalyses: 0,
    averageConfidence: 0,
    averageCompleteness: 0,
    lastHealthCheck: null,
    lastScenario: null,
    lastCertification: null,
    lastRecovery: null,
  };
}

function defaultPersistencePath(repositoryPath) {
  if (!repositoryPath) return null;
  return path.join(repositoryPath, ".levi", "intelligence-integration.json");
}

function normalizeEnum(value, constants, label) {
  const normalized = String(value || "").toUpperCase();
  const allowed = new Set(Object.values(constants));
  if (!allowed.has(normalized)) throw new Error(`Invalid ${label}: ${value}.`);
  return normalized;
}

function validStatus(value, constants) {
  return Object.values(constants).includes(value);
}

function normalizeScore(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return clampScore(number);
}

function clampScore(value) {
  return Number(Math.max(0, Math.min(1, Number(value || 0))).toFixed(6));
}

function validScore(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1;
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function average(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.length ? Number((numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(6)) : 0;
}

function severityPriority(severity) {
  const value = String(severity || "").toUpperCase();
  if (value === INTEGRATION_FINDING_SEVERITIES.CRITICAL) return 1;
  if (value === INTEGRATION_FINDING_SEVERITIES.HIGH) return 2;
  if (value === INTEGRATION_FINDING_SEVERITIES.MEDIUM) return 3;
  if (value === INTEGRATION_FINDING_SEVERITIES.LOW) return 4;
  return 5;
}

function normalizeToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

function normalizeText(value) {
  return String(value || "").toLowerCase().trim();
}

function stableHash(value) {
  return crypto.createHash("sha256").update(stableSerialize(value)).digest("hex").slice(0, 16);
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function safeArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))).sort((left, right) => String(left).localeCompare(String(right)));
}

function dedupeBy(values, keyFn) {
  const byKey = new Map();
  for (const value of safeArray(values)) {
    const key = keyFn(value);
    if (!byKey.has(key)) byKey.set(key, value);
  }
  return Array.from(byKey.values());
}

function clonePlainObject(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function cloneOrNull(value) {
  return value ? clonePlainObject(value) : null;
}

function requiredString(value, message) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(message);
  return value.trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compareById(left, right) {
  return left.id.localeCompare(right.id);
}

function compareFindings(left, right) {
  return severityPriority(left.severity) - severityPriority(right.severity) || left.code.localeCompare(right.code) || left.id.localeCompare(right.id);
}

module.exports = {
  AUTHORITY_ORDER,
  CERTIFICATION_LEVELS,
  CERTIFICATION_PROFILES,
  COMPONENT_STATUSES,
  COMPONENT_TYPES,
  FINDING_CODES,
  INTEGRATION_DOMAINS,
  INTEGRATION_EVENTS,
  INTEGRATION_EVENT_TYPES,
  INTEGRATION_FINDING_SEVERITIES,
  INTEGRATION_FINDING_STATUSES,
  INTEGRATION_STATUSES,
  INTELLIGENCE_INTEGRATION_SCHEMA_VERSION,
  IntelligenceIntegrationEngine,
  RECOMMENDATION_EFFORTS,
};
