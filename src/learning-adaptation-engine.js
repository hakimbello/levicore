const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const LEARNING_ADAPTATION_SCHEMA_VERSION = 1;

const LEARNING_DOMAINS = Object.freeze({
  USER_PREFERENCE: "USER_PREFERENCE",
  PROJECT_CONVENTION: "PROJECT_CONVENTION",
  CODING_STYLE: "CODING_STYLE",
  ARCHITECTURE: "ARCHITECTURE",
  PLANNING: "PLANNING",
  CONTEXT_SELECTION: "CONTEXT_SELECTION",
  TOOL_SELECTION: "TOOL_SELECTION",
  EXECUTION: "EXECUTION",
  VALIDATION: "VALIDATION",
  TESTING: "TESTING",
  SECURITY: "SECURITY",
  REPAIR: "REPAIR",
  APPROVAL: "APPROVAL",
  DOCUMENTATION: "DOCUMENTATION",
  RELEASE: "RELEASE",
  WORKFLOW: "WORKFLOW",
  RECOMMENDATION: "RECOMMENDATION",
  COST: "COST",
  PERFORMANCE: "PERFORMANCE",
  UNKNOWN: "UNKNOWN",
});

const LEARNING_SOURCE_TYPES = Object.freeze({
  USER_INSTRUCTION: "USER_INSTRUCTION",
  USER_CORRECTION: "USER_CORRECTION",
  USER_ACCEPTANCE: "USER_ACCEPTANCE",
  USER_REJECTION: "USER_REJECTION",
  DURABLE_DECISION: "DURABLE_DECISION",
  PLAN_OUTCOME: "PLAN_OUTCOME",
  TASK_OUTCOME: "TASK_OUTCOME",
  EXECUTION_OUTCOME: "EXECUTION_OUTCOME",
  REPAIR_OUTCOME: "REPAIR_OUTCOME",
  APPROVAL_OUTCOME: "APPROVAL_OUTCOME",
  VALIDATION_OUTCOME: "VALIDATION_OUTCOME",
  SECURITY_OUTCOME: "SECURITY_OUTCOME",
  CONTEXT_OUTCOME: "CONTEXT_OUTCOME",
  TOOL_OUTCOME: "TOOL_OUTCOME",
  CODE_ANALYSIS: "CODE_ANALYSIS",
  PROJECT_ASSESSMENT: "PROJECT_ASSESSMENT",
  REPOSITORY_EVIDENCE: "REPOSITORY_EVIDENCE",
  DOCUMENTATION: "DOCUMENTATION",
  IMPORTED_LEARNING: "IMPORTED_LEARNING",
  HEURISTIC: "HEURISTIC",
  UNKNOWN: "UNKNOWN",
});

const LEARNING_STATUSES = Object.freeze({
  CANDIDATE: "CANDIDATE",
  ELIGIBLE: "ELIGIBLE",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  REJECTED: "REJECTED",
  SUPERSEDED: "SUPERSEDED",
  EXPIRED: "EXPIRED",
  STALE: "STALE",
  CONFLICTED: "CONFLICTED",
  ROLLED_BACK: "ROLLED_BACK",
  ARCHIVED: "ARCHIVED",
});

const ADAPTATION_TYPES = Object.freeze({
  CONTEXT_WEIGHT: "CONTEXT_WEIGHT",
  CONTEXT_EXCLUSION: "CONTEXT_EXCLUSION",
  CONTEXT_PRIORITY: "CONTEXT_PRIORITY",
  PLANNING_PREFERENCE: "PLANNING_PREFERENCE",
  TASK_DECOMPOSITION: "TASK_DECOMPOSITION",
  TOOL_PREFERENCE: "TOOL_PREFERENCE",
  TOOL_AVOIDANCE: "TOOL_AVOIDANCE",
  VALIDATION_REQUIREMENT: "VALIDATION_REQUIREMENT",
  TEST_REQUIREMENT: "TEST_REQUIREMENT",
  SECURITY_REQUIREMENT: "SECURITY_REQUIREMENT",
  REPAIR_STRATEGY: "REPAIR_STRATEGY",
  APPROVAL_POLICY_HINT: "APPROVAL_POLICY_HINT",
  CODING_CONVENTION: "CODING_CONVENTION",
  ARCHITECTURE_CONVENTION: "ARCHITECTURE_CONVENTION",
  DOCUMENTATION_CONVENTION: "DOCUMENTATION_CONVENTION",
  RECOMMENDATION_WEIGHT: "RECOMMENDATION_WEIGHT",
  WORKFLOW_PATTERN: "WORKFLOW_PATTERN",
  COST_PREFERENCE: "COST_PREFERENCE",
  PERFORMANCE_PREFERENCE: "PERFORMANCE_PREFERENCE",
  NO_ADAPTATION: "NO_ADAPTATION",
});

const SIGNAL_POLARITIES = Object.freeze({
  POSITIVE: "POSITIVE",
  NEGATIVE: "NEGATIVE",
  NEUTRAL: "NEUTRAL",
  MIXED: "MIXED",
  UNKNOWN: "UNKNOWN",
});

const LEARNING_SCOPES = Object.freeze({
  GLOBAL: "GLOBAL",
  USER: "USER",
  PROJECT: "PROJECT",
  REPOSITORY: "REPOSITORY",
  LANGUAGE: "LANGUAGE",
  FRAMEWORK: "FRAMEWORK",
  MODULE: "MODULE",
  FILE: "FILE",
  SYMBOL: "SYMBOL",
  TASK: "TASK",
  SESSION: "SESSION",
});

const ADAPTATION_STATUSES = Object.freeze({
  PROPOSED: "PROPOSED",
  APPROVED: "APPROVED",
  APPLIED: "APPLIED",
  PARTIALLY_APPLIED: "PARTIALLY_APPLIED",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
  SUPERSEDED: "SUPERSEDED",
  EXPIRED: "EXPIRED",
  ROLLED_BACK: "ROLLED_BACK",
  FAILED: "FAILED",
});

const RULE_STABILITY = Object.freeze({
  VOLATILE: "VOLATILE",
  EMERGING: "EMERGING",
  STABLE: "STABLE",
  ESTABLISHED: "ESTABLISHED",
  DISPUTED: "DISPUTED",
  UNKNOWN: "UNKNOWN",
});

const LEARNING_EVENTS = Object.freeze({
  LIFECYCLE: "lifecycle",
});

const LEARNING_EVENT_TYPES = Object.freeze({
  LEARNING_SIGNAL_INGESTED: "learning_signal_ingested",
  LEARNING_SIGNAL_DUPLICATE_SKIPPED: "learning_signal_duplicate_skipped",
  LEARNING_SIGNAL_EVALUATED: "learning_signal_evaluated",
  LEARNING_CANDIDATE_ELIGIBLE: "learning_candidate_eligible",
  LEARNING_CANDIDATE_REJECTED: "learning_candidate_rejected",
  LEARNING_RULE_CREATED: "learning_rule_created",
  LEARNING_RULE_UPDATED: "learning_rule_updated",
  LEARNING_RULE_ACTIVATED: "learning_rule_activated",
  LEARNING_RULE_SUSPENDED: "learning_rule_suspended",
  LEARNING_RULE_REJECTED: "learning_rule_rejected",
  LEARNING_RULE_SUPERSEDED: "learning_rule_superseded",
  LEARNING_RULE_EXPIRED: "learning_rule_expired",
  LEARNING_RULE_STALE: "learning_rule_stale",
  LEARNING_RULE_CONFLICTED: "learning_rule_conflicted",
  LEARNING_RULE_ROLLED_BACK: "learning_rule_rolled_back",
  LEARNING_FEEDBACK_RECORDED: "learning_feedback_recorded",
  ADAPTATION_PROPOSED: "adaptation_proposed",
  ADAPTATION_APPROVED: "adaptation_approved",
  ADAPTATION_APPLIED: "adaptation_applied",
  ADAPTATION_PARTIALLY_APPLIED: "adaptation_partially_applied",
  ADAPTATION_REJECTED: "adaptation_rejected",
  ADAPTATION_FAILED: "adaptation_failed",
  ADAPTATION_ROLLED_BACK: "adaptation_rolled_back",
  ADAPTATION_ROLLBACK_FAILED: "adaptation_rollback_failed",
  LEARNING_CONFLICT_DETECTED: "learning_conflict_detected",
  LEARNING_VALIDATION_COMPLETED: "learning_validation_completed",
  LEARNING_ANALYSIS_PARTIAL: "learning_analysis_partial",
  LEARNING_PERSISTED: "learning_persisted",
  LEARNING_RESTORED: "learning_restored",
  LEARNING_CORRUPTION_DETECTED: "learning_corruption_detected",
});

const AUTHORITY = Object.freeze({
  current_user_instruction: 1,
  current_project_instruction: 0.96,
  durable_decision: 0.93,
  security_policy: 0.9,
  repository_state: 0.84,
  validated_execution: 0.8,
  approval_decision: 0.76,
  accepted_plan: 0.72,
  project_learning: 0.64,
  user_learning: 0.6,
  cross_session_learning: 0.54,
  inferred_convention: 0.42,
  heuristic: 0.28,
});

const DEFAULT_THRESHOLDS = Object.freeze({
  minimumObservations: 2,
  minimumIndependentSessions: 2,
  minimumSuccessfulOutcomes: 1,
  maximumConflictRatio: 0.34,
  minimumConfidence: 0.55,
  maximumEvidenceAgeMs: 90 * 24 * 60 * 60 * 1000,
  globalMinimumObservations: 4,
  globalMinimumIndependentSessions: 3,
  securityMinimumObservations: 3,
  approvalMinimumObservations: 3,
  explicitApprovalRequired: false,
});

const DEFAULT_BOUNDS = Object.freeze({
  maximumSignals: 2000,
  maximumSignalsPerDerivation: 500,
  maximumFeedbackRecords: 1000,
  maximumRules: 500,
  maximumAdaptations: 500,
  maximumEvidencePerRule: 12,
  maximumConflicts: 200,
  maximumHistoricalVersions: 10,
  maximumRollbackHistory: 50,
  maximumCollectorRecords: 1000,
  maximumProcessingTimeMs: 30000,
  maximumAdaptationWeightChange: 0.2,
  maximumCumulativeWeightChange: 0.5,
  maximumRuleAgeMs: 180 * 24 * 60 * 60 * 1000,
  maximumHeuristicInfluence: 0.2,
});

class LearningAdaptationEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.projectId = options.projectId || null;
    this.repositoryPath = options.repositoryPath ? path.resolve(options.repositoryPath) : null;
    this.persistencePath = options.persistencePath || null;
    this.crossSessionLearningEngine = options.crossSessionLearningEngine || options.learningEngine || null;
    this.projectIntelligenceEngine = options.projectIntelligenceEngine || null;
    this.codeUnderstandingEngine = options.codeUnderstandingEngine || null;
    this.contextEngine = options.contextEngine || null;
    this.planningEngine = options.planningEngine || null;
    this.repositoryGraph = options.repositoryGraph || null;
    this.offlineIndex = options.offlineIndex || null;
    this.collectors = normalizeCollectors(options.collectors || []);
    this.adapters = normalizeAdapters(options.adapters || {});
    this.thresholds = normalizeThresholds(options.thresholds || {});
    this.bounds = normalizeBounds(options.bounds || {});
    this.migrations = Array.isArray(options.migrations) ? options.migrations.slice() : [];
    this.signals = new Map();
    this.feedback = new Map();
    this.rules = new Map();
    this.evaluations = new Map();
    this.adaptations = new Map();
    this.conflicts = new Map();
    this.applicationHistory = [];
    this.rollbackHistory = [];
    this.createdAt = normalizeTimestamp(options.createdAt);
    this.updatedAt = normalizeTimestamp(options.updatedAt || this.createdAt);
    this.stats = emptyStats();
  }

  ingestSignal(signal) {
    const normalized = normalizeSignal(signal, this);
    const existing = this.signals.get(normalized.id);
    if (existing) {
      this.stats.duplicateSignalsSkipped += 1;
      this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_SIGNAL_DUPLICATE_SKIPPED, { signalId: normalized.id });
      return clonePlainObject(existing);
    }
    if (this.signals.size >= this.bounds.maximumSignals) {
      this.stats.partialAnalyses += 1;
      this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_ANALYSIS_PARTIAL, { reason: "maximumSignals" });
      return clonePlainObject(normalized);
    }
    this.signals.set(normalized.id, normalized);
    this.stats.signalsIngested += 1;
    this.stats.lastIngestion = normalized.createdAt;
    this.updatedAt = normalized.createdAt;
    this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_SIGNAL_INGESTED, { signal: clonePlainObject(normalized) });
    return clonePlainObject(normalized);
  }

  ingestSignals(signals) {
    return safeArray(signals).map((signal) => this.ingestSignal(signal));
  }

  recordFeedback(feedback) {
    const normalized = normalizeFeedback(feedback, this);
    const existing = this.feedback.get(normalized.id);
    if (existing) return clonePlainObject(existing);
    if (this.feedback.size >= this.bounds.maximumFeedbackRecords) {
      this.stats.partialAnalyses += 1;
      this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_ANALYSIS_PARTIAL, { reason: "maximumFeedbackRecords" });
      return clonePlainObject(normalized);
    }
    this.feedback.set(normalized.id, normalized);
    this.stats.feedbackRecords += 1;
    this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_FEEDBACK_RECORDED, { feedback: clonePlainObject(normalized) });
    const signal = signalFromFeedback(normalized);
    if (signal) this.ingestSignal(signal);
    return clonePlainObject(normalized);
  }

  deriveSignals(projectId = this.projectId || "default", options = {}) {
    const startedAt = Date.now();
    const records = [];
    const add = (record) => {
      if (records.length < this.bounds.maximumCollectorRecords) records.push(record);
    };
    for (const collector of [...this.collectors, ...normalizeCollectors(options.collectors || [])]) {
      const output = collector.collect({ projectId, options: clonePlainObject(options), engine: this });
      for (const record of normalizeCollectorOutput(output, projectId).records) add(record);
    }
    addSnapshotRecords(this.crossSessionLearningEngine, "cross_session_learning", projectId, add);
    addSnapshotRecords(this.projectIntelligenceEngine, "project_intelligence", projectId, add);
    addSnapshotRecords(this.codeUnderstandingEngine, "code_understanding", projectId, add);
    addSnapshotRecords(this.contextEngine, "context_intelligence", projectId, add);
    addSnapshotRecords(this.planningEngine, "planning_intelligence", projectId, add);
    addSnapshotRecords(this.repositoryGraph, "repository_graph", projectId, add);
    addSnapshotRecords(this.offlineIndex, "offline_index", projectId, add);
    addList(options.executionHistory, LEARNING_SOURCE_TYPES.EXECUTION_OUTCOME, projectId, add);
    addList(options.taskHistory, LEARNING_SOURCE_TYPES.TASK_OUTCOME, projectId, add);
    addList(options.repairHistory, LEARNING_SOURCE_TYPES.REPAIR_OUTCOME, projectId, add);
    addList(options.approvalHistory, LEARNING_SOURCE_TYPES.APPROVAL_OUTCOME, projectId, add);
    addList(options.securityFindings, LEARNING_SOURCE_TYPES.SECURITY_OUTCOME, projectId, add);
    addList(options.validationResults, LEARNING_SOURCE_TYPES.VALIDATION_OUTCOME, projectId, add);
    addList(options.completionEvidence, LEARNING_SOURCE_TYPES.EXECUTION_OUTCOME, projectId, add);
    addList(options.durableDecisions || options.decisionRecords, LEARNING_SOURCE_TYPES.DURABLE_DECISION, projectId, add);
    addList(options.projectInstructions, LEARNING_SOURCE_TYPES.USER_INSTRUCTION, projectId, add);
    addList(options.userCorrections, LEARNING_SOURCE_TYPES.USER_CORRECTION, projectId, add);
    addList(options.acceptedPatches, LEARNING_SOURCE_TYPES.USER_ACCEPTANCE, projectId, add);
    addList(options.rejectedPatches, LEARNING_SOURCE_TYPES.USER_REJECTION, projectId, add);
    const signals = records.slice(0, this.bounds.maximumSignalsPerDerivation).map((record) => signalFromRecord(record, projectId)).filter(Boolean);
    const ingested = this.ingestSignals(signals);
    if (records.length >= this.bounds.maximumCollectorRecords || Date.now() - startedAt > this.bounds.maximumProcessingTimeMs) {
      this.stats.partialAnalyses += 1;
      this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_ANALYSIS_PARTIAL, { projectId, reason: "collector bounds" });
    }
    this.stats.lastDerivation = new Date().toISOString();
    return ingested;
  }

  evaluateSignal(signalId, options = {}) {
    return this.evaluateCandidate(signalId, options);
  }

  evaluateCandidate(candidateId, options = {}) {
    const signal = this.signals.get(candidateId) || this.getRule(candidateId);
    if (!signal) throw new Error("Learning candidate was not found.");
    const signals = signal.sourceSignals ? signal.sourceSignals.map((id) => this.signals.get(id)).filter(Boolean) : relatedSignals(this, signal);
    const evaluation = evaluateSignals(signal, signals, this, options);
    this.evaluations.set(evaluation.id, evaluation);
    this.stats.candidatesEvaluated += 1;
    if (evaluation.eligible) {
      this.stats.eligibleCandidates += 1;
      this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_CANDIDATE_ELIGIBLE, { evaluation });
    } else {
      this.stats.rejectedCandidates += 1;
      this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_CANDIDATE_REJECTED, { evaluation });
    }
    this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_SIGNAL_EVALUATED, { evaluation });
    return clonePlainObject(evaluation);
  }

  createRule(input, options = {}) {
    const rule = normalizeRule(input, this);
    const existing = this.rules.get(rule.id);
    if (existing) {
      const updated = mergeRule(existing, rule, this.bounds.maximumHistoricalVersions);
      this.rules.set(updated.id, updated);
      this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_RULE_UPDATED, { rule: clonePlainObject(updated) });
      return clonePlainObject(updated);
    }
    if (this.rules.size >= this.bounds.maximumRules) {
      this.stats.partialAnalyses += 1;
      this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_ANALYSIS_PARTIAL, { reason: "maximumRules" });
      return clonePlainObject(rule);
    }
    this.rules.set(rule.id, rule);
    this.stats.rulesCreated += 1;
    this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_RULE_CREATED, { rule: clonePlainObject(rule) });
    if (options.activate === true) return this.activateRule(rule.id, options);
    return clonePlainObject(rule);
  }

  deriveRules(projectId = this.projectId || "default", options = {}) {
    const groups = groupSignals(this.listSignals({ projectId }).slice(0, this.bounds.maximumSignalsPerDerivation));
    const rules = [];
    for (const group of groups) {
      const evaluation = evaluateSignals(group.signals[0], group.signals, this, options);
      this.evaluations.set(evaluation.id, evaluation);
      this.stats.candidatesEvaluated += 1;
      if (!evaluation.eligible) {
        this.stats.rejectedCandidates += 1;
        continue;
      }
      this.stats.eligibleCandidates += 1;
      const rule = this.createRule(ruleFromGroup(projectId, group, evaluation), { activate: options.activate === true });
      rules.push(rule);
    }
    this.stats.lastDerivation = new Date().toISOString();
    return rules;
  }

  activateRule(ruleId, options = {}) {
    return this.transitionRule(ruleId, LEARNING_STATUSES.ACTIVE, LEARNING_EVENT_TYPES.LEARNING_RULE_ACTIVATED, { reason: options.reason });
  }

  suspendRule(ruleId, reason) {
    return this.transitionRule(ruleId, LEARNING_STATUSES.SUSPENDED, LEARNING_EVENT_TYPES.LEARNING_RULE_SUSPENDED, { reason });
  }

  rejectRule(ruleId, reason) {
    return this.transitionRule(ruleId, LEARNING_STATUSES.REJECTED, LEARNING_EVENT_TYPES.LEARNING_RULE_REJECTED, { reason });
  }

  supersedeRule(ruleId, replacementId) {
    const rule = this.requireRule(ruleId);
    const replacement = this.requireRule(replacementId);
    const next = { ...rule, status: LEARNING_STATUSES.SUPERSEDED, supersededBy: replacement.id, updatedAt: new Date().toISOString() };
    const replacementNext = { ...replacement, supersedes: uniqueSorted([...replacement.supersedes, rule.id]), updatedAt: next.updatedAt };
    this.rules.set(rule.id, next);
    this.rules.set(replacement.id, replacementNext);
    this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_RULE_SUPERSEDED, { ruleId, replacementId });
    return clonePlainObject(next);
  }

  expireRule(ruleId, reason) {
    return this.transitionRule(ruleId, LEARNING_STATUSES.EXPIRED, LEARNING_EVENT_TYPES.LEARNING_RULE_EXPIRED, { reason });
  }

  rollbackRule(ruleId, options = {}) {
    const rule = this.requireRule(ruleId);
    const related = this.listAdaptations({ ruleId: rule.id, status: ADAPTATION_STATUSES.APPLIED });
    const rollbacks = this.rollbackAdaptations(related.map((adaptation) => adaptation.id), options);
    const next = { ...rule, status: LEARNING_STATUSES.ROLLED_BACK, updatedAt: new Date().toISOString(), metadata: { ...rule.metadata, rollbackReason: options.reason || null } };
    this.rules.set(rule.id, next);
    this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_RULE_ROLLED_BACK, { ruleId, rollbacks });
    return clonePlainObject(next);
  }

  proposeAdaptations(projectId = this.projectId || "default", options = {}) {
    const activeRules = this.listRules({ projectId, status: LEARNING_STATUSES.ACTIVE });
    const proposals = [];
    for (const rule of activeRules) {
      if (isRuleExpiredOrStale(rule, this, options)) {
        this.markRuleStale(rule.id, "Rule evidence is stale or expired.");
        continue;
      }
      const adaptation = adaptationFromRule(rule, this, options);
      if (!adaptation || adaptation.type === ADAPTATION_TYPES.NO_ADAPTATION) continue;
      proposals.push(this.addAdaptation(adaptation));
    }
    return proposals;
  }

  applyAdaptation(adaptationId, options = {}) {
    const adaptation = this.requireAdaptation(adaptationId);
    if (prohibitedAdaptation(adaptation)) {
      return this.finishAdaptation(adaptation, ADAPTATION_STATUSES.REJECTED, { error: "Prohibited adaptation rejected." }, LEARNING_EVENT_TYPES.ADAPTATION_REJECTED);
    }
    const adapter = adapterFor(this.adapters, adaptation.target);
    if (!adapter || typeof adapter.apply !== "function") {
      return this.finishAdaptation(adaptation, ADAPTATION_STATUSES.PARTIALLY_APPLIED, { reason: "No target adapter available." }, LEARNING_EVENT_TYPES.ADAPTATION_PARTIALLY_APPLIED);
    }
    try {
      const priorState = typeof adapter.getState === "function" ? adapter.getState(adaptation.target, adaptation) : adaptation.priorState;
      const response = adapter.apply(adaptation, options);
      const resultingState = response && response.resultingState !== undefined ? response.resultingState : response;
      const next = {
        ...adaptation,
        status: ADAPTATION_STATUSES.APPLIED,
        priorState: clonePlainObject(priorState || {}),
        resultingState: clonePlainObject(resultingState || {}),
        appliedTo: uniqueSorted([...adaptation.appliedTo, adaptation.target.subsystem || adaptation.target.id || "adapter"]),
        appliedAt: new Date().toISOString(),
        metadata: { ...adaptation.metadata, adapterResponse: clonePlainObject(response || {}) },
      };
      this.adaptations.set(next.id, next);
      this.applicationHistory.push({ adaptationId: next.id, appliedAt: next.appliedAt, priorState: next.priorState, resultingState: next.resultingState });
      this.trimHistory();
      this.stats.adaptationsApplied += 1;
      this.stats.lastAdaptation = next.appliedAt;
      this.emitLifecycle(LEARNING_EVENT_TYPES.ADAPTATION_APPLIED, { adaptation: clonePlainObject(next) });
      return clonePlainObject(next);
    } catch (error) {
      return this.finishAdaptation(adaptation, ADAPTATION_STATUSES.FAILED, { error: error.message }, LEARNING_EVENT_TYPES.ADAPTATION_FAILED);
    }
  }

  applyAdaptations(adaptationIds, options = {}) {
    return safeArray(adaptationIds).map((id) => this.applyAdaptation(id, options));
  }

  rollbackAdaptation(adaptationId, options = {}) {
    const adaptation = this.requireAdaptation(adaptationId);
    const adapter = adapterFor(this.adapters, adaptation.target);
    if (!adaptation.reversible) {
      return this.finishAdaptation(adaptation, ADAPTATION_STATUSES.FAILED, { error: "Adaptation is not reversible." }, LEARNING_EVENT_TYPES.ADAPTATION_ROLLBACK_FAILED);
    }
    if (!adapter || typeof adapter.rollback !== "function") {
      this.stats.rollbackFailures += 1;
      this.emitLifecycle(LEARNING_EVENT_TYPES.ADAPTATION_ROLLBACK_FAILED, { adaptationId, reason: "No rollback adapter available." });
      return { ...clonePlainObject(adaptation), rollbackStatus: "FAILED", rollbackError: "No rollback adapter available." };
    }
    try {
      const response = adapter.rollback(adaptation, options);
      const next = { ...adaptation, status: ADAPTATION_STATUSES.ROLLED_BACK, rolledBackAt: new Date().toISOString(), metadata: { ...adaptation.metadata, rollbackResponse: clonePlainObject(response || {}) } };
      this.adaptations.set(next.id, next);
      this.rollbackHistory.push({ adaptationId: next.id, rolledBackAt: next.rolledBackAt, response: clonePlainObject(response || {}) });
      this.trimHistory();
      this.stats.adaptationsRolledBack += 1;
      this.stats.lastRollback = next.rolledBackAt;
      this.emitLifecycle(LEARNING_EVENT_TYPES.ADAPTATION_ROLLED_BACK, { adaptation: clonePlainObject(next) });
      return clonePlainObject(next);
    } catch (error) {
      this.stats.rollbackFailures += 1;
      this.emitLifecycle(LEARNING_EVENT_TYPES.ADAPTATION_ROLLBACK_FAILED, { adaptationId, reason: error.message });
      return { ...clonePlainObject(adaptation), rollbackStatus: "FAILED", rollbackError: error.message };
    }
  }

  rollbackAdaptations(adaptationIds, options = {}) {
    return safeArray(adaptationIds).map((id) => this.rollbackAdaptation(id, options));
  }

  getSignal(id) { return cloneOrNull(this.signals.get(id)); }
  listSignals(filter = {}) { return filterValues(this.signals, filter).sort(compareSignals).map(clonePlainObject); }
  getRule(id) { return cloneOrNull(this.rules.get(id)); }
  listRules(filter = {}) { return filterValues(this.rules, filter).sort(compareRules).map(clonePlainObject); }
  getAdaptation(id) { return cloneOrNull(this.adaptations.get(id)); }
  listAdaptations(filter = {}) { return filterValues(this.adaptations, filter).sort(compareAdaptations).map(clonePlainObject); }
  getFeedback(id) { return cloneOrNull(this.feedback.get(id)); }
  listFeedback(filter = {}) { return filterValues(this.feedback, filter).sort(compareFeedback).map(clonePlainObject); }

  getApplicableRules(context = {}) {
    return this.listRules({ status: LEARNING_STATUSES.ACTIVE, projectId: context.projectId || this.projectId })
      .filter((rule) => ruleApplies(rule, context));
  }

  getApplicableAdaptations(context = {}) {
    return this.listAdaptations({ projectId: context.projectId || this.projectId })
      .filter((adaptation) => [ADAPTATION_STATUSES.PROPOSED, ADAPTATION_STATUSES.APPLIED, ADAPTATION_STATUSES.PARTIALLY_APPLIED].includes(adaptation.status))
      .filter((adaptation) => adaptationApplies(adaptation, context));
  }

  explainRule(ruleId) {
    const rule = this.requireRule(ruleId);
    const evaluation = latestEvaluationFor(this.evaluations, rule.id, rule.sourceSignals);
    const adaptations = this.listAdaptations({ ruleId });
    return {
      rule: clonePlainObject(rule),
      sourceSignals: rule.sourceSignals.map((id) => this.getSignal(id)).filter(Boolean),
      authorityOrdering: clonePlainObject(AUTHORITY),
      supportingEvidence: clonePlainObject(rule.supportingEvidence),
      conflictingEvidence: clonePlainObject(rule.conflictingEvidence),
      eligibilityDecision: evaluation || null,
      confidenceCalculation: confidenceBreakdown(rule),
      stabilityCalculation: stabilityBreakdown(rule),
      freshness: rule.freshness,
      scope: rule.scope,
      adaptationsDerived: adaptations,
      limitations: limitationsForRule(rule),
    };
  }

  explainAdaptation(adaptationId) {
    const adaptation = this.requireAdaptation(adaptationId);
    return {
      adaptation: clonePlainObject(adaptation),
      originatingRule: this.getRule(adaptation.ruleId),
      target: clonePlainObject(adaptation.target),
      priorState: clonePlainObject(adaptation.priorState),
      resultingState: clonePlainObject(adaptation.resultingState),
      bounds: clonePlainObject(adaptation.bounds),
      rationale: adaptation.rationale,
      evidence: clonePlainObject(adaptation.evidence),
      confidence: adaptation.confidence,
      applicationResult: adaptation.metadata.adapterResponse || null,
      rollbackInformation: {
        reversible: adaptation.reversible,
        rolledBackAt: adaptation.rolledBackAt,
        response: adaptation.metadata.rollbackResponse || null,
      },
      risks: adaptation.metadata.risks || [],
    };
  }

  analyzeLearningImpact(projectId = this.projectId || "default", options = {}) {
    const rules = this.listRules({ projectId, status: LEARNING_STATUSES.ACTIVE });
    const adaptations = this.listAdaptations({ projectId });
    return {
      projectId,
      affectedSubsystems: uniqueSorted(adaptations.map((adaptation) => adaptation.target.subsystem || adaptation.type)),
      affectedProjects: uniqueSorted([projectId]),
      affectedModules: uniqueSorted(rules.flatMap((rule) => scopeTargets(rule, "MODULE"))),
      affectedPlans: uniqueSorted(adaptations.filter((adaptation) => adaptation.target.subsystem === "planning").map((adaptation) => adaptation.target.id || adaptation.target.subsystem)),
      affectedContextPolicies: adaptations.filter((adaptation) => adaptation.target.subsystem === "context"),
      affectedValidationPolicies: adaptations.filter((adaptation) => adaptation.type === ADAPTATION_TYPES.VALIDATION_REQUIREMENT || adaptation.type === ADAPTATION_TYPES.TEST_REQUIREMENT),
      possibleBehaviorChanges: adaptations.map((adaptation) => adaptation.rationale),
      riskLevel: adaptations.some((adaptation) => adaptation.type.includes("SECURITY") || adaptation.type.includes("APPROVAL")) ? "MEDIUM" : "LOW",
      confidence: average(rules.map((rule) => rule.confidence)),
      rollbackPath: adaptations.filter((adaptation) => adaptation.reversible).map((adaptation) => ({ adaptationId: adaptation.id, action: "rollbackAdaptation" })),
      evidence: uniqueEvidence(rules.flatMap((rule) => rule.supportingEvidence)),
      metadata: { options: clonePlainObject(options) },
    };
  }

  detectConflicts(projectId = this.projectId || "default", options = {}) {
    const conflicts = [];
    const active = this.listRules({ projectId, status: LEARNING_STATUSES.ACTIVE });
    const highAuthoritySignals = this.listSignals({ projectId }).filter((signal) => signal.authority >= AUTHORITY.durable_decision);
    for (const rule of active) {
      for (const signal of highAuthoritySignals) {
        if (conflictsWithRule(rule, signal)) conflicts.push(this.addConflict("rule_vs_current_instruction", rule, signal));
      }
    }
    for (let i = 0; i < active.length; i += 1) {
      for (let j = i + 1; j < active.length; j += 1) {
        if (rulesConflict(active[i], active[j])) conflicts.push(this.addConflict("rule_vs_rule", active[i], active[j]));
      }
    }
    for (const rule of active) {
      if (rule.scope === LEARNING_SCOPES.GLOBAL) {
        const projectRule = active.find((candidate) => candidate.id !== rule.id && candidate.scope === LEARNING_SCOPES.PROJECT && normalizeText(candidate.condition) === normalizeText(rule.condition));
        if (projectRule) conflicts.push(this.addConflict("global_rule_vs_project_rule", rule, projectRule));
      }
      if (rule.metadata.acceptedPattern === true && this.listSignals({ projectId, polarity: SIGNAL_POLARITIES.NEGATIVE }).some((signal) => signal.sourceType === LEARNING_SOURCE_TYPES.VALIDATION_OUTCOME && sameSubject(rule, signal))) {
        conflicts.push(this.addConflict("accepted_pattern_vs_failed_validation", rule, { id: "validation", evidence: [{ source: "validation", signal: "failed validation" }] }));
      }
    }
    return dedupeBy(conflicts, (conflict) => conflict.id).slice(0, this.bounds.maximumConflicts).map(clonePlainObject);
  }

  detectStaleLearning(projectId = this.projectId || "default", options = {}) {
    const stale = [];
    for (const rule of this.listRules({ projectId })) {
      if (isRuleExpiredOrStale(rule, this, options)) {
        stale.push(this.markRuleStale(rule.id, "Rule exceeded freshness or age bounds."));
      }
    }
    return stale;
  }

  validateLearning(projectId = this.projectId || "default", options = {}) {
    const findings = [];
    const duplicateSignals = hasDuplicateIds(Array.from(this.signals.values()));
    const duplicateRules = hasDuplicateIds(Array.from(this.rules.values()));
    if (duplicateSignals) findings.push(validationFinding("duplicate_signals", "Duplicate signal IDs detected."));
    if (duplicateRules) findings.push(validationFinding("duplicate_rules", "Duplicate rule IDs detected."));
    for (const rule of this.listRules({ projectId })) {
      if (!Object.values(RULE_STABILITY).includes(rule.stability)) findings.push(validationFinding("invalid_stability", `Rule ${rule.id} has invalid stability.`));
      if (rule.confidence < 0 || rule.confidence > 1) findings.push(validationFinding("invalid_confidence", `Rule ${rule.id} confidence is outside bounds.`));
      if (rule.supportingEvidence.length === 0) findings.push(validationFinding("missing_rule_evidence", `Rule ${rule.id} lacks evidence.`));
      if (rule.status === LEARNING_STATUSES.ACTIVE && rule.conflictingEvidence.length > rule.supportingEvidence.length) findings.push(validationFinding("conflicting_active_rule", `Rule ${rule.id} has too much conflicting evidence.`));
    }
    for (const adaptation of this.listAdaptations({ projectId })) {
      if (Math.abs(Number(adaptation.weight || 0)) > this.bounds.maximumAdaptationWeightChange) findings.push(validationFinding("adaptation_bounds", `Adaptation ${adaptation.id} exceeds weight bounds.`));
      if (adaptation.status === ADAPTATION_STATUSES.APPLIED && Object.keys(adaptation.priorState || {}).length === 0) findings.push(validationFinding("missing_prior_state", `Adaptation ${adaptation.id} lacks prior state.`));
      if (!adaptation.reversible) findings.push(validationFinding("non_reversible_adaptation", `Adaptation ${adaptation.id} is not reversible.`));
      if (prohibitedAdaptation(adaptation)) findings.push(validationFinding("prohibited_adaptation", `Adaptation ${adaptation.id} violates safety invariants.`));
    }
    const conflicts = this.detectConflicts(projectId, options);
    if (conflicts.length > 0) findings.push(validationFinding("learning_conflicts", "Conflicting learning remains visible."));
    const result = {
      status: findings.some((finding) => finding.severity === "HIGH") ? "INVALID" : "VALID",
      projectId,
      findings,
      conflicts,
      metadata: { collectorLimitations: this.stats.partialAnalyses },
    };
    this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_VALIDATION_COMPLETED, result);
    return result;
  }

  getStats() {
    this.recalculateStats();
    return clonePlainObject(this.stats);
  }

  snapshot() {
    return {
      schemaVersion: LEARNING_ADAPTATION_SCHEMA_VERSION,
      projectId: this.projectId,
      repositoryPath: this.repositoryPath,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      thresholds: clonePlainObject(this.thresholds),
      bounds: clonePlainObject(this.bounds),
      signals: Array.from(this.signals.values()).sort(compareSignals).map(clonePlainObject),
      feedback: Array.from(this.feedback.values()).sort(compareFeedback).map(clonePlainObject),
      rules: Array.from(this.rules.values()).sort(compareRules).map(clonePlainObject),
      evaluations: Array.from(this.evaluations.values()).sort(compareEvaluations).map(clonePlainObject),
      adaptations: Array.from(this.adaptations.values()).sort(compareAdaptations).map(clonePlainObject),
      conflicts: Array.from(this.conflicts.values()).sort(compareConflicts).map(clonePlainObject),
      applicationHistory: this.applicationHistory.map(clonePlainObject),
      rollbackHistory: this.rollbackHistory.map(clonePlainObject),
      stats: this.getStats(),
    };
  }

  restore(snapshot) {
    const migrated = migrateSnapshot(snapshot, this.migrations);
    validateSnapshot(migrated);
    this.signals.clear();
    this.feedback.clear();
    this.rules.clear();
    this.evaluations.clear();
    this.adaptations.clear();
    this.conflicts.clear();
    this.projectId = migrated.projectId || this.projectId;
    this.repositoryPath = migrated.repositoryPath || this.repositoryPath;
    this.createdAt = normalizeTimestamp(migrated.createdAt);
    this.updatedAt = normalizeTimestamp(migrated.updatedAt || migrated.createdAt);
    this.thresholds = normalizeThresholds(migrated.thresholds || {});
    this.bounds = normalizeBounds(migrated.bounds || {});
    for (const signal of migrated.signals) this.signals.set(signal.id, normalizeSignal(signal, this));
    for (const feedback of migrated.feedback) this.feedback.set(feedback.id, normalizeFeedback(feedback, this));
    for (const rule of migrated.rules) this.rules.set(rule.id, normalizeRule(rule, this));
    for (const evaluation of migrated.evaluations) this.evaluations.set(evaluation.id, normalizeEvaluation(evaluation, this));
    for (const adaptation of migrated.adaptations) this.adaptations.set(adaptation.id, normalizeAdaptation(adaptation, this));
    for (const conflict of migrated.conflicts || []) this.conflicts.set(conflict.id, clonePlainObject(conflict));
    this.applicationHistory = safeArray(migrated.applicationHistory).map(clonePlainObject);
    this.rollbackHistory = safeArray(migrated.rollbackHistory).map(clonePlainObject);
    this.stats = { ...emptyStats(), ...clonePlainObject(migrated.stats || {}) };
    this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_RESTORED, { signalCount: this.signals.size, ruleCount: this.rules.size });
    return this.snapshot();
  }

  save(filePath = this.persistencePath || defaultPersistencePath(this.repositoryPath)) {
    const targetPath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const tempPath = `${targetPath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(this.snapshot(), null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, targetPath);
    this.persistencePath = targetPath;
    this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_PERSISTED, { path: targetPath, schemaVersion: LEARNING_ADAPTATION_SCHEMA_VERSION });
    return { status: "PERSISTED", path: targetPath, schemaVersion: LEARNING_ADAPTATION_SCHEMA_VERSION };
  }

  load(filePath = this.persistencePath || defaultPersistencePath(this.repositoryPath), options = {}) {
    const targetPath = path.resolve(filePath);
    try {
      this.restore(JSON.parse(fs.readFileSync(targetPath, "utf8")));
      this.persistencePath = targetPath;
      return { status: "LOADED", path: targetPath, schemaVersion: LEARNING_ADAPTATION_SCHEMA_VERSION };
    } catch (error) {
      this.stats.corruptedLoads += 1;
      this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_CORRUPTION_DETECTED, { path: targetPath, reason: error.message });
      if (options.emptyOnCorruption === true) {
        this.signals.clear();
        this.feedback.clear();
        this.rules.clear();
        this.evaluations.clear();
        this.adaptations.clear();
        this.conflicts.clear();
        this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_RESTORED, { signalCount: 0, ruleCount: 0 });
        return { status: "EMPTY", path: targetPath, error: error.message };
      }
      return { status: "CORRUPT", path: targetPath, error: error.message };
    }
  }

  transitionRule(ruleId, status, eventType, metadata = {}) {
    const rule = this.requireRule(ruleId);
    const next = { ...rule, status, updatedAt: new Date().toISOString(), metadata: { ...rule.metadata, ...metadata } };
    this.rules.set(rule.id, next);
    this.emitLifecycle(eventType, { rule: clonePlainObject(next) });
    return clonePlainObject(next);
  }

  markRuleStale(ruleId, reason) {
    const rule = this.requireRule(ruleId);
    const next = { ...rule, status: LEARNING_STATUSES.STALE, freshness: Math.min(rule.freshness, 0.2), updatedAt: new Date().toISOString(), metadata: { ...rule.metadata, staleReason: reason } };
    this.rules.set(next.id, next);
    this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_RULE_STALE, { rule: clonePlainObject(next), reason });
    return clonePlainObject(next);
  }

  addAdaptation(input) {
    const adaptation = normalizeAdaptation(input, this);
    const existing = this.adaptations.get(adaptation.id);
    if (existing) return clonePlainObject(existing);
    if (this.adaptations.size >= this.bounds.maximumAdaptations) {
      this.stats.partialAnalyses += 1;
      this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_ANALYSIS_PARTIAL, { reason: "maximumAdaptations" });
      return clonePlainObject(adaptation);
    }
    this.adaptations.set(adaptation.id, adaptation);
    this.stats.adaptationsProposed += 1;
    this.emitLifecycle(LEARNING_EVENT_TYPES.ADAPTATION_PROPOSED, { adaptation: clonePlainObject(adaptation) });
    return clonePlainObject(adaptation);
  }

  finishAdaptation(adaptation, status, metadata, eventType) {
    const next = { ...adaptation, status, metadata: { ...adaptation.metadata, ...metadata } };
    this.adaptations.set(next.id, next);
    if (status === ADAPTATION_STATUSES.REJECTED) this.stats.adaptationsRejected += 1;
    if (status === ADAPTATION_STATUSES.PARTIALLY_APPLIED) this.stats.partialApplications += 1;
    this.emitLifecycle(eventType, { adaptation: clonePlainObject(next) });
    return clonePlainObject(next);
  }

  addConflict(type, left, right) {
    const conflict = {
      id: `learning-conflict:${stableHash({ type, left: left.id, right: right.id })}`,
      type,
      projectId: left.projectId || right.projectId || this.projectId || "default",
      leftId: left.id,
      rightId: right.id,
      evidence: uniqueEvidence([...(left.evidence || left.supportingEvidence || []), ...(right.evidence || right.supportingEvidence || [])]),
      status: "OPEN",
      createdAt: new Date().toISOString(),
    };
    if (!this.conflicts.has(conflict.id)) {
      this.conflicts.set(conflict.id, conflict);
      this.stats.conflicts += 1;
      this.emitLifecycle(LEARNING_EVENT_TYPES.LEARNING_CONFLICT_DETECTED, { conflict: clonePlainObject(conflict) });
      if (this.rules.has(left.id)) this.transitionRule(left.id, LEARNING_STATUSES.CONFLICTED, LEARNING_EVENT_TYPES.LEARNING_RULE_CONFLICTED, { conflictId: conflict.id });
    }
    return clonePlainObject(this.conflicts.get(conflict.id));
  }

  requireRule(id) {
    const rule = this.rules.get(id);
    if (!rule) throw new Error("Learning rule was not found.");
    return rule;
  }

  requireAdaptation(id) {
    const adaptation = this.adaptations.get(id);
    if (!adaptation) throw new Error("Adaptation was not found.");
    return adaptation;
  }

  recalculateStats() {
    const rules = Array.from(this.rules.values());
    const adaptations = Array.from(this.adaptations.values());
    this.stats.activeRules = rules.filter((rule) => rule.status === LEARNING_STATUSES.ACTIVE).length;
    this.stats.suspendedRules = rules.filter((rule) => rule.status === LEARNING_STATUSES.SUSPENDED).length;
    this.stats.staleRules = rules.filter((rule) => rule.status === LEARNING_STATUSES.STALE).length;
    this.stats.conflictedRules = rules.filter((rule) => rule.status === LEARNING_STATUSES.CONFLICTED).length;
    this.stats.supersededRules = rules.filter((rule) => rule.status === LEARNING_STATUSES.SUPERSEDED).length;
    this.stats.adaptationsApplied = adaptations.filter((adaptation) => adaptation.status === ADAPTATION_STATUSES.APPLIED).length;
    this.stats.partialApplications = adaptations.filter((adaptation) => adaptation.status === ADAPTATION_STATUSES.PARTIALLY_APPLIED).length;
    this.stats.adaptationsRejected = adaptations.filter((adaptation) => adaptation.status === ADAPTATION_STATUSES.REJECTED).length;
    this.stats.adaptationsRolledBack = adaptations.filter((adaptation) => adaptation.status === ADAPTATION_STATUSES.ROLLED_BACK).length;
    this.stats.averageConfidence = average(rules.map((rule) => rule.confidence));
    this.stats.averageStability = average(rules.map((rule) => stabilityScore(rule.stability)));
  }

  trimHistory() {
    while (this.applicationHistory.length > this.bounds.maximumHistoricalVersions) this.applicationHistory.shift();
    while (this.rollbackHistory.length > this.bounds.maximumRollbackHistory) this.rollbackHistory.shift();
  }

  emitLifecycle(type, payload = {}) {
    this.emit(LEARNING_EVENTS.LIFECYCLE, {
      type,
      timestamp: new Date().toISOString(),
      schemaVersion: LEARNING_ADAPTATION_SCHEMA_VERSION,
      ...payload,
    });
  }
}

function normalizeSignal(input, engine) {
  if (!isPlainObject(input)) throw new Error("Learning signal must be an object.");
  const projectId = input.projectId || engine.projectId || "default";
  const domain = normalizeEnum(input.domain || domainFromSource(input.sourceType), LEARNING_DOMAINS, "learning domain");
  const sourceType = normalizeEnum(input.sourceType || LEARNING_SOURCE_TYPES.UNKNOWN, LEARNING_SOURCE_TYPES, "learning source type");
  const scope = normalizeEnum(input.scope || LEARNING_SCOPES.PROJECT, LEARNING_SCOPES, "learning scope");
  const polarity = normalizeEnum(input.polarity || polarityFromOutcome(input.outcome), SIGNAL_POLARITIES, "learning signal polarity");
  const evidence = uniqueEvidence(safeArray(input.evidence));
  const value = input.value === undefined ? input.subject || input.action || input.outcome || "UNKNOWN" : input.value;
  const contentHash = input.contentHash || stableHash({ domain, sourceType, action: input.action, outcome: input.outcome, subject: input.subject, value, polarity, scope, evidence });
  const createdAt = normalizeTimestamp(input.createdAt || input.timestamp);
  return {
    id: input.id || `learning-signal:${stableHash({ projectId, sessionId: input.sessionId || null, sourceType, sourceId: input.sourceId || null, subject: input.subject, action: input.action, value, polarity, scope, contentHash })}`,
    projectId,
    sessionId: input.sessionId || null,
    domain,
    sourceType,
    sourceId: input.sourceId || null,
    action: input.action || null,
    outcome: input.outcome || null,
    subject: input.subject || null,
    value: clonePlainObject(value),
    polarity,
    strength: normalizeScore(input.strength, polarity === SIGNAL_POLARITIES.NEGATIVE ? 0.6 : 0.7),
    confidence: normalizeScore(input.confidence, authorityFor(input.authority, sourceType)),
    evidence,
    authority: normalizeAuthority(input.authority, sourceType),
    scope,
    timestamp: normalizeTimestamp(input.timestamp || createdAt),
    contentHash,
    metadata: clonePlainObject(input.metadata || {}),
    createdAt,
  };
}

function normalizeRule(input, engine) {
  if (!isPlainObject(input)) throw new Error("Learning rule must be an object.");
  const projectId = input.projectId || engine.projectId || "default";
  const domain = normalizeEnum(input.domain || LEARNING_DOMAINS.UNKNOWN, LEARNING_DOMAINS, "learning rule domain");
  const scope = normalizeEnum(input.scope || LEARNING_SCOPES.PROJECT, LEARNING_SCOPES, "learning rule scope");
  const condition = normalizeCondition(input.condition || {});
  const behavior = normalizeBehavior(input.behavior || {});
  const id = input.id || `learning-rule:${stableHash({ projectId, domain, scope, condition: normalizeText(stableSerialize(condition)), behavior: normalizeText(stableSerialize(behavior)) })}`;
  const createdAt = normalizeTimestamp(input.createdAt);
  return {
    id,
    projectId,
    domain,
    title: requiredString(input.title || titleFromBehavior(domain, behavior), "Learning rule title is required."),
    description: requiredString(input.description || "Derived learning rule.", "Learning rule description is required."),
    condition,
    behavior,
    scope,
    status: normalizeEnum(input.status || LEARNING_STATUSES.CANDIDATE, LEARNING_STATUSES, "learning rule status"),
    authority: normalizeScore(input.authority, 0.5),
    sourceSignals: normalizeStringArray(input.sourceSignals || []),
    supportingEvidence: limitEvidence(input.supportingEvidence || input.evidence, engine.bounds.maximumEvidencePerRule),
    conflictingEvidence: limitEvidence(input.conflictingEvidence || [], engine.bounds.maximumEvidencePerRule),
    positiveObservations: integer(input.positiveObservations, 0),
    negativeObservations: integer(input.negativeObservations, 0),
    confidence: normalizeScore(input.confidence, 0.5),
    stability: normalizeEnum(input.stability || RULE_STABILITY.UNKNOWN, RULE_STABILITY, "learning rule stability"),
    freshness: normalizeScore(input.freshness, 1),
    applicability: normalizeScore(input.applicability, 0.7),
    version: integer(input.version, 1),
    supersedes: normalizeStringArray(input.supersedes || []),
    supersededBy: input.supersededBy || null,
    expiresAt: input.expiresAt || null,
    metadata: clonePlainObject(input.metadata || {}),
    createdAt,
    updatedAt: normalizeTimestamp(input.updatedAt || createdAt),
  };
}

function normalizeAdaptation(input, engine) {
  if (!isPlainObject(input)) throw new Error("Adaptation must be an object.");
  const projectId = input.projectId || engine.projectId || "default";
  const type = normalizeEnum(input.type || ADAPTATION_TYPES.NO_ADAPTATION, ADAPTATION_TYPES, "adaptation type");
  const target = clonePlainObject(input.target || { subsystem: targetSubsystemFor(type) });
  const operation = input.operation || operationForType(type);
  const weight = boundedWeight(input.weight, engine.bounds.maximumAdaptationWeightChange);
  const bounds = {
    minimum: Number.isFinite(Number(input.bounds && input.bounds.minimum)) ? Number(input.bounds.minimum) : -engine.bounds.maximumAdaptationWeightChange,
    maximum: Number.isFinite(Number(input.bounds && input.bounds.maximum)) ? Number(input.bounds.maximum) : engine.bounds.maximumAdaptationWeightChange,
    cumulativeMaximum: engine.bounds.maximumCumulativeWeightChange,
    ...clonePlainObject(input.bounds || {}),
  };
  const createdAt = normalizeTimestamp(input.createdAt);
  return {
    id: input.id || `adaptation:${stableHash({ projectId, ruleId: input.ruleId, type, target, operation, value: input.value, weight })}`,
    projectId,
    ruleId: requiredString(input.ruleId || "none", "Adaptation ruleId is required."),
    type,
    target,
    operation,
    value: clonePlainObject(input.value === undefined ? weight : input.value),
    weight,
    bounds,
    rationale: requiredString(input.rationale || "Derived from eligible learning rule.", "Adaptation rationale is required."),
    evidence: limitEvidence(input.evidence || [], engine.bounds.maximumEvidencePerRule),
    confidence: normalizeScore(input.confidence, 0.5),
    status: normalizeEnum(input.status || ADAPTATION_STATUSES.PROPOSED, ADAPTATION_STATUSES, "adaptation status"),
    appliedTo: normalizeStringArray(input.appliedTo || []),
    priorState: clonePlainObject(input.priorState || {}),
    resultingState: clonePlainObject(input.resultingState || {}),
    reversible: input.reversible !== false,
    createdAt,
    appliedAt: input.appliedAt || null,
    rolledBackAt: input.rolledBackAt || null,
    metadata: clonePlainObject(input.metadata || {}),
  };
}

function normalizeFeedback(input, engine) {
  if (!isPlainObject(input)) throw new Error("Feedback record must be an object.");
  const projectId = input.projectId || engine.projectId || "default";
  const timestamp = normalizeTimestamp(input.timestamp || input.createdAt);
  return {
    id: input.id || `feedback:${stableHash({ projectId, sessionId: input.sessionId, targetType: input.targetType, targetId: input.targetId, action: input.action, outcome: input.outcome, correction: input.correction, timestamp: input.stableTimestamp || null })}`,
    projectId,
    sessionId: input.sessionId || null,
    targetType: input.targetType || "UNKNOWN",
    targetId: input.targetId || null,
    action: input.action || null,
    outcome: input.outcome || null,
    accepted: input.accepted === true,
    partiallyAccepted: input.partiallyAccepted === true,
    rejected: input.rejected === true,
    corrected: input.corrected === true || input.correction !== undefined,
    correction: input.correction || null,
    reason: input.reason || null,
    evidence: uniqueEvidence(input.evidence || []),
    confidence: normalizeScore(input.confidence, input.corrected || input.correction ? 0.92 : 0.75),
    timestamp,
    metadata: clonePlainObject(input.metadata || {}),
  };
}

function normalizeEvaluation(input, engine) {
  const createdAt = normalizeTimestamp(input.createdAt);
  return {
    id: input.id || `learning-evaluation:${stableHash({ projectId: input.projectId || engine.projectId, candidateId: input.candidateId, decision: input.decision, createdAt })}`,
    projectId: input.projectId || engine.projectId || "default",
    candidateId: requiredString(input.candidateId, "Learning evaluation candidateId is required."),
    eligible: input.eligible === true,
    decision: input.decision || (input.eligible ? "ELIGIBLE" : "REJECTED"),
    reasons: normalizeStringArray(input.reasons || []),
    authority: normalizeScore(input.authority, 0.5),
    evidenceCount: integer(input.evidenceCount, 0),
    supportingCount: integer(input.supportingCount, 0),
    conflictingCount: integer(input.conflictingCount, 0),
    confidence: normalizeScore(input.confidence, 0.5),
    stability: normalizeEnum(input.stability || RULE_STABILITY.UNKNOWN, RULE_STABILITY, "learning evaluation stability"),
    freshness: normalizeScore(input.freshness, 1),
    scope: normalizeEnum(input.scope || LEARNING_SCOPES.PROJECT, LEARNING_SCOPES, "learning evaluation scope"),
    requiredApproval: input.requiredApproval === true,
    metadata: clonePlainObject(input.metadata || {}),
    createdAt,
  };
}

function evaluateSignals(candidate, signals, engine, options = {}) {
  const all = dedupeBy(safeArray(signals).filter(Boolean), (signal) => signal.id);
  const negativeCandidate = candidate.polarity === SIGNAL_POLARITIES.NEGATIVE ||
    all.filter((signal) => signal.polarity === SIGNAL_POLARITIES.NEGATIVE).length >
      all.filter((signal) => signal.polarity === SIGNAL_POLARITIES.POSITIVE).length;
  const supporting = negativeCandidate
    ? all.filter((signal) => signal.polarity === SIGNAL_POLARITIES.NEGATIVE || signal.polarity === SIGNAL_POLARITIES.MIXED)
    : all.filter((signal) => signal.polarity === SIGNAL_POLARITIES.POSITIVE || signal.polarity === SIGNAL_POLARITIES.NEUTRAL);
  const conflicting = negativeCandidate
    ? all.filter((signal) => signal.polarity === SIGNAL_POLARITIES.POSITIVE)
    : all.filter((signal) => signal.polarity === SIGNAL_POLARITIES.NEGATIVE || signal.polarity === SIGNAL_POLARITIES.MIXED);
  const sessions = new Set(all.map((signal) => signal.sessionId).filter(Boolean));
  const successCount = negativeCandidate ? supporting.length : supporting.filter(successfulSignal).length;
  const thresholds = thresholdsFor(candidate, engine.thresholds);
  const conflictRatio = all.length === 0 ? 0 : conflicting.length / all.length;
  const authority = Math.max(...all.map((signal) => signal.authority), candidate.authority || 0);
  const freshness = freshnessFor(all, engine.thresholds.maximumEvidenceAgeMs);
  const stability = stabilityFor(supporting.length, sessions.size, conflictRatio, successCount);
  const confidence = normalizeScore(average(all.map((signal) => signal.confidence)) + supporting.length * 0.04 - conflicting.length * 0.08 + authority * 0.15, 0.5);
  const reasons = [];
  if (supporting.length < thresholds.minimumObservations) reasons.push("minimum observations not met");
  if (sessions.size < thresholds.minimumIndependentSessions) reasons.push("independent-session threshold not met");
  if (successCount < thresholds.minimumSuccessfulOutcomes) reasons.push("successful-outcome threshold not met");
  if (conflictRatio > thresholds.maximumConflictRatio) reasons.push("conflict ratio too high");
  if (confidence < thresholds.minimumConfidence) reasons.push("confidence below threshold");
  if (freshness < 0.35) reasons.push("evidence is stale");
  if (thresholds.explicitApprovalRequired && !all.some((signal) => signal.sourceType === LEARNING_SOURCE_TYPES.USER_ACCEPTANCE || signal.sourceType === LEARNING_SOURCE_TYPES.USER_CORRECTION)) reasons.push("explicit approval required");
  const higherAuthorityConflict = all.some((signal) => signal.authority > authority && signal.polarity === SIGNAL_POLARITIES.NEGATIVE);
  if (higherAuthorityConflict) reasons.push("higher-authority conflict");
  const eligible = reasons.length === 0;
  return normalizeEvaluation({
    projectId: candidate.projectId || engine.projectId || "default",
    candidateId: candidate.id,
    eligible,
    decision: eligible ? "ELIGIBLE" : "REJECTED",
    reasons: eligible ? ["Eligibility thresholds met."] : reasons,
    authority,
    evidenceCount: all.reduce((total, signal) => total + signal.evidence.length, 0),
    supportingCount: supporting.length,
    conflictingCount: conflicting.length,
    confidence,
    stability,
    freshness,
    scope: candidate.scope || LEARNING_SCOPES.PROJECT,
    requiredApproval: thresholds.explicitApprovalRequired,
    metadata: { conflictRatio, sessionCount: sessions.size, thresholds },
  }, engine);
}

function groupSignals(signals) {
  const groups = new Map();
  for (const signal of signals) {
    const key = stableSerialize({
      projectId: signal.projectId,
      domain: signal.domain,
      scope: signal.scope,
      subject: normalizeText(signal.subject || stableSerialize(signal.value)),
      action: normalizeText(signal.action || ""),
      value: normalizeText(stableSerialize(signal.value)),
    });
    if (!groups.has(key)) groups.set(key, { key, signals: [] });
    groups.get(key).signals.push(signal);
  }
  return Array.from(groups.values()).sort((left, right) => left.key.localeCompare(right.key));
}

function ruleFromGroup(projectId, group, evaluation) {
  const first = group.signals[0];
  const supporting = group.signals.filter((signal) => signal.polarity !== SIGNAL_POLARITIES.NEGATIVE);
  const conflicting = group.signals.filter((signal) => signal.polarity === SIGNAL_POLARITIES.NEGATIVE || signal.polarity === SIGNAL_POLARITIES.MIXED);
  const behavior = behaviorFromSignal(first, supporting.length >= conflicting.length);
  return {
    projectId,
    domain: first.domain,
    title: titleFromBehavior(first.domain, behavior),
    description: `Adapt ${first.domain.toLowerCase().replace(/_/g, " ")} behavior for ${first.subject || stableReadable(first.value)}.`,
    condition: { subject: first.subject, action: first.action, scope: first.scope, value: first.value },
    behavior,
    scope: first.scope,
    status: LEARNING_STATUSES.ELIGIBLE,
    authority: evaluation.authority,
    sourceSignals: group.signals.map((signal) => signal.id),
    supportingEvidence: uniqueEvidence(supporting.flatMap((signal) => signal.evidence)),
    conflictingEvidence: uniqueEvidence(conflicting.flatMap((signal) => signal.evidence)),
    positiveObservations: supporting.length,
    negativeObservations: conflicting.length,
    confidence: evaluation.confidence,
    stability: evaluation.stability,
    freshness: evaluation.freshness,
    applicability: 0.75,
    metadata: {
      signalKey: group.key,
      acceptedPattern: supporting.some((signal) => signal.sourceType === LEARNING_SOURCE_TYPES.USER_ACCEPTANCE),
    },
  };
}

function adaptationFromRule(rule, engine, options) {
  const type = adaptationTypeForRule(rule);
  const subsystem = targetSubsystemFor(type);
  const positive = rule.positiveObservations >= rule.negativeObservations;
  const weight = boundedWeight((positive ? 1 : -1) * Math.min(engine.bounds.maximumAdaptationWeightChange, 0.05 + rule.confidence * 0.15), engine.bounds.maximumAdaptationWeightChange);
  return {
    projectId: rule.projectId,
    ruleId: rule.id,
    type,
    target: {
      subsystem,
      id: rule.behavior.target || rule.condition.subject || rule.domain,
      scope: rule.scope,
    },
    operation: operationForType(type),
    value: rule.behavior.value === undefined ? weight : rule.behavior.value,
    weight,
    bounds: {
      minimum: -engine.bounds.maximumAdaptationWeightChange,
      maximum: engine.bounds.maximumAdaptationWeightChange,
      cumulativeMaximum: engine.bounds.maximumCumulativeWeightChange,
    },
    rationale: `Apply ${rule.title} because ${rule.positiveObservations} supporting observations exceeded ${rule.negativeObservations} conflicts.`,
    evidence: rule.supportingEvidence,
    confidence: rule.confidence,
    status: ADAPTATION_STATUSES.PROPOSED,
    reversible: true,
    metadata: {
      risks: risksForAdaptation(type),
      reevaluateWhen: "rule freshness changes, project structure changes, or higher-authority conflict appears",
    },
  };
}

function behaviorFromSignal(signal, positive) {
  const value = signal.value && typeof signal.value === "object" ? signal.value : { value: signal.value };
  if (signal.domain === LEARNING_DOMAINS.CONTEXT_SELECTION) return { kind: positive ? "increase_context_weight" : "decrease_context_weight", target: signal.subject || value.source || "context", value: positive ? "prefer" : "avoid" };
  if (signal.domain === LEARNING_DOMAINS.PLANNING) return { kind: positive ? "prefer_planning_pattern" : "avoid_planning_pattern", target: signal.subject || "planning", value };
  if (signal.domain === LEARNING_DOMAINS.TOOL_SELECTION) return { kind: positive ? "prefer_tool" : "avoid_tool", target: signal.subject || value.tool || "tool", value };
  if (signal.domain === LEARNING_DOMAINS.VALIDATION || signal.domain === LEARNING_DOMAINS.TESTING) return { kind: "require_validation", target: signal.subject || "validation", value };
  if (signal.domain === LEARNING_DOMAINS.SECURITY) return { kind: "add_security_requirement", target: signal.subject || "security", value };
  if (signal.domain === LEARNING_DOMAINS.REPAIR) return { kind: positive ? "prefer_repair_strategy" : "avoid_repair_strategy", target: signal.subject || "repair", value };
  if (signal.domain === LEARNING_DOMAINS.CODING_STYLE || signal.domain === LEARNING_DOMAINS.PROJECT_CONVENTION) return { kind: "coding_convention", target: signal.subject || "style", value };
  return { kind: "recommendation_weight", target: signal.subject || signal.domain, value };
}

function adaptationTypeForRule(rule) {
  const kind = rule.behavior.kind || "";
  if (kind.includes("context") && kind.includes("weight")) return ADAPTATION_TYPES.CONTEXT_WEIGHT;
  if (kind.includes("context") && kind.includes("avoid")) return ADAPTATION_TYPES.CONTEXT_EXCLUSION;
  if (kind.includes("planning")) return ADAPTATION_TYPES.PLANNING_PREFERENCE;
  if (kind.includes("tool") && kind.includes("avoid")) return ADAPTATION_TYPES.TOOL_AVOIDANCE;
  if (kind.includes("tool")) return ADAPTATION_TYPES.TOOL_PREFERENCE;
  if (kind.includes("validation")) return ADAPTATION_TYPES.VALIDATION_REQUIREMENT;
  if (kind.includes("test")) return ADAPTATION_TYPES.TEST_REQUIREMENT;
  if (kind.includes("security")) return ADAPTATION_TYPES.SECURITY_REQUIREMENT;
  if (kind.includes("repair")) return ADAPTATION_TYPES.REPAIR_STRATEGY;
  if (kind.includes("approval")) return ADAPTATION_TYPES.APPROVAL_POLICY_HINT;
  if (kind.includes("architecture")) return ADAPTATION_TYPES.ARCHITECTURE_CONVENTION;
  if (kind.includes("documentation")) return ADAPTATION_TYPES.DOCUMENTATION_CONVENTION;
  if (kind.includes("coding")) return ADAPTATION_TYPES.CODING_CONVENTION;
  if (kind.includes("workflow")) return ADAPTATION_TYPES.WORKFLOW_PATTERN;
  return ADAPTATION_TYPES.RECOMMENDATION_WEIGHT;
}

function signalFromFeedback(feedback) {
  return {
    projectId: feedback.projectId,
    sessionId: feedback.sessionId,
    domain: domainFromFeedback(feedback),
    sourceType: feedback.corrected ? LEARNING_SOURCE_TYPES.USER_CORRECTION : feedback.accepted || feedback.partiallyAccepted ? LEARNING_SOURCE_TYPES.USER_ACCEPTANCE : feedback.rejected ? LEARNING_SOURCE_TYPES.USER_REJECTION : LEARNING_SOURCE_TYPES.HEURISTIC,
    sourceId: feedback.id,
    action: feedback.action,
    outcome: feedback.outcome,
    subject: feedback.targetId || feedback.targetType,
    value: feedback.correction || feedback.reason || feedback.outcome,
    polarity: feedback.rejected ? SIGNAL_POLARITIES.NEGATIVE : feedback.partiallyAccepted || feedback.corrected ? SIGNAL_POLARITIES.MIXED : feedback.accepted ? SIGNAL_POLARITIES.POSITIVE : SIGNAL_POLARITIES.NEUTRAL,
    strength: feedback.corrected ? 0.9 : feedback.rejected ? 0.75 : 0.7,
    confidence: feedback.confidence,
    evidence: feedback.evidence,
    authority: feedback.corrected ? AUTHORITY.current_user_instruction : AUTHORITY.validated_execution,
    scope: scopeFromFeedback(feedback),
    timestamp: feedback.timestamp,
    metadata: {
      feedbackId: feedback.id,
      accepted: feedback.accepted,
      partiallyAccepted: feedback.partiallyAccepted,
      rejected: feedback.rejected,
      corrected: feedback.corrected,
      reason: feedback.reason,
    },
  };
}

function signalFromRecord(record, projectId) {
  const sourceType = record.sourceType || record.type || LEARNING_SOURCE_TYPES.UNKNOWN;
  const normalizedSourceType = Object.values(LEARNING_SOURCE_TYPES).includes(sourceType) ? sourceType : sourceTypeFromRecord(record);
  return {
    projectId: record.projectId || projectId,
    sessionId: record.sessionId || record.value?.sessionId || null,
    domain: domainFromSource(normalizedSourceType, record),
    sourceType: normalizedSourceType,
    sourceId: record.id || record.value?.id || null,
    action: record.action || record.value?.action || record.value?.title || record.type,
    outcome: record.outcome || record.value?.outcome || record.value?.status || record.value?.result,
    subject: record.subject || record.value?.targetId || record.value?.name || record.value?.title || record.type,
    value: record.value,
    polarity: polarityFromRecord(record),
    strength: record.strength || 0.65,
    confidence: record.confidence || 0.6,
    evidence: record.evidence || record.value?.evidence || [{ source: record.source || "collector", signal: record.type || normalizedSourceType }],
    authority: authorityFor(record.authority, normalizedSourceType),
    scope: record.scope || LEARNING_SCOPES.PROJECT,
    timestamp: record.timestamp || record.value?.createdAt || record.value?.updatedAt,
    metadata: { source: record.source, collectorVersion: record.version },
  };
}

function addSnapshotRecords(engine, source, projectId, add) {
  const snapshot = snapshotFor(engine);
  if (!snapshot) return;
  if (source === "cross_session_learning") {
    for (const record of safeArray(snapshot.records).filter((entry) => entry.status === "ACTIVE" || entry.status === "SUPERSEDED")) {
      add({ source, projectId, type: LEARNING_SOURCE_TYPES.IMPORTED_LEARNING, value: record, evidence: record.evidence || [], confidence: record.confidence || 0.55 });
    }
    return;
  }
  if (source === "project_intelligence") {
    for (const assessment of safeArray(snapshot.assessments)) add({ source, projectId, type: LEARNING_SOURCE_TYPES.PROJECT_ASSESSMENT, value: assessment, evidence: assessment.evidence || [], confidence: assessment.confidence || 0.65 });
    return;
  }
  if (source === "code_understanding") {
    for (const finding of safeArray(snapshot.findings)) add({ source, projectId, type: LEARNING_SOURCE_TYPES.CODE_ANALYSIS, value: finding, evidence: finding.evidence || [], confidence: finding.confidence || 0.6 });
    return;
  }
  add({ source, projectId, type: LEARNING_SOURCE_TYPES.REPOSITORY_EVIDENCE, value: compactSnapshot(snapshot), evidence: [{ source, signal: "snapshot" }], confidence: 0.55 });
}

function addList(values, sourceType, projectId, add) {
  for (const value of safeArray(values)) add({ source: sourceType.toLowerCase(), projectId, type: sourceType, value, evidence: value.evidence || [{ source: sourceType.toLowerCase(), signal: value.id || value.status || sourceType }], confidence: value.confidence || 0.65 });
}

function normalizeCollectorOutput(output, projectId) {
  if (!output) return { records: [], outcomes: [] };
  const items = Array.isArray(output) ? output : [output];
  const records = [];
  const outcomes = [];
  for (const item of items) {
    records.push(...safeArray(item.records).map((record) => ({ source: item.source || record.source, projectId: item.projectId || projectId, version: item.version, timestamp: item.timestamp, confidence: item.confidence, metadata: item.metadata, ...record })));
    outcomes.push(...safeArray(item.outcomes).map((record) => ({ source: item.source || record.source, projectId: item.projectId || projectId, version: item.version, timestamp: item.timestamp, confidence: item.confidence, metadata: item.metadata, ...record })));
    if (!item.records && !item.outcomes) records.push(item);
  }
  return { records: [...records, ...outcomes] };
}

function normalizeCollectors(collectors) {
  return safeArray(collectors).filter(Boolean).map((collector) => {
    if (!collector || typeof collector.collect !== "function") throw new Error("Learning adaptation collector requires collect().");
    return collector;
  });
}

function normalizeAdapters(adapters) {
  if (adapters instanceof Map) return adapters;
  return new Map(Object.entries(adapters || {}));
}

function adapterFor(adapters, target) {
  return adapters.get(target.subsystem) || adapters.get(target.id) || adapters.get(target.type);
}

function relatedSignals(engine, candidate) {
  const source = candidate.sourceSignals ? candidate.sourceSignals.map((id) => engine.signals.get(id)).filter(Boolean) : [candidate];
  if (candidate.domain && candidate.subject) {
    return engine.listSignals({ projectId: candidate.projectId, domain: candidate.domain })
      .filter((signal) => normalizeText(signal.subject || stableSerialize(signal.value)) === normalizeText(candidate.subject || stableSerialize(candidate.value)));
  }
  return source;
}

function thresholdsFor(candidate, thresholds) {
  const next = { ...thresholds };
  if (candidate.scope === LEARNING_SCOPES.GLOBAL) {
    next.minimumObservations = Math.max(next.minimumObservations, thresholds.globalMinimumObservations);
    next.minimumIndependentSessions = Math.max(next.minimumIndependentSessions, thresholds.globalMinimumIndependentSessions);
  }
  if (candidate.domain === LEARNING_DOMAINS.SECURITY) next.minimumObservations = Math.max(next.minimumObservations, thresholds.securityMinimumObservations);
  if (candidate.domain === LEARNING_DOMAINS.APPROVAL) next.minimumObservations = Math.max(next.minimumObservations, thresholds.approvalMinimumObservations);
  return next;
}

function mergeRule(existing, rule, maxVersions) {
  const materialChange = stableSerialize(existing.condition) !== stableSerialize(rule.condition) || stableSerialize(existing.behavior) !== stableSerialize(rule.behavior);
  return {
    ...existing,
    ...rule,
    id: existing.id,
    createdAt: existing.createdAt,
    version: materialChange ? existing.version + 1 : existing.version,
    sourceSignals: uniqueSorted([...existing.sourceSignals, ...rule.sourceSignals]),
    supportingEvidence: limitEvidence([...existing.supportingEvidence, ...rule.supportingEvidence], 20),
    conflictingEvidence: limitEvidence([...existing.conflictingEvidence, ...rule.conflictingEvidence], 20),
    positiveObservations: existing.positiveObservations + rule.positiveObservations,
    negativeObservations: existing.negativeObservations + rule.negativeObservations,
    metadata: {
      ...existing.metadata,
      ...rule.metadata,
      versions: [...safeArray(existing.metadata.versions), { version: existing.version, updatedAt: existing.updatedAt }].slice(-maxVersions),
    },
    updatedAt: new Date().toISOString(),
  };
}

function isRuleExpiredOrStale(rule, engine, options = {}) {
  if (rule.expiresAt && Date.parse(rule.expiresAt) <= Date.now()) return true;
  if (Date.now() - Date.parse(rule.updatedAt) > (options.maximumRuleAgeMs || engine.bounds.maximumRuleAgeMs)) return true;
  if (rule.freshness < 0.25) return true;
  return false;
}

function conflictsWithRule(rule, signal) {
  if (signal.polarity !== SIGNAL_POLARITIES.NEGATIVE && signal.polarity !== SIGNAL_POLARITIES.MIXED) return false;
  return normalizeText(signal.subject || stableSerialize(signal.value)) === normalizeText(rule.condition.subject || stableSerialize(rule.condition.value));
}

function rulesConflict(left, right) {
  return left.id !== right.id &&
    left.projectId === right.projectId &&
    left.domain === right.domain &&
    normalizeText(left.condition.subject || stableSerialize(left.condition)) === normalizeText(right.condition.subject || stableSerialize(right.condition)) &&
    stableSerialize(left.behavior) !== stableSerialize(right.behavior);
}

function sameSubject(rule, signal) {
  return normalizeText(rule.condition.subject || stableSerialize(rule.condition.value)) === normalizeText(signal.subject || stableSerialize(signal.value));
}

function prohibitedAdaptation(adaptation) {
  const text = stableSerialize(adaptation).toLowerCase();
  return /disable security|bypass approval|suppress critical|remove mandatory test|unauthorized execution|immutable architecture/.test(text) ||
    adaptation.type === ADAPTATION_TYPES.SECURITY_REQUIREMENT && /disable|bypass|suppress/.test(text) ||
    adaptation.type === ADAPTATION_TYPES.APPROVAL_POLICY_HINT && /bypass|never ask|disable/.test(text);
}

function ruleApplies(rule, context) {
  if (context.projectId && rule.projectId !== context.projectId) return false;
  if (context.domain && rule.domain !== context.domain) return false;
  if (context.scope && rule.scope !== context.scope) return false;
  if (context.subject && normalizeText(rule.condition.subject || "") !== normalizeText(context.subject)) return false;
  return true;
}

function adaptationApplies(adaptation, context) {
  if (context.projectId && adaptation.projectId !== context.projectId) return false;
  if (context.subsystem && adaptation.target.subsystem !== context.subsystem) return false;
  if (context.type && adaptation.type !== context.type) return false;
  return true;
}

function latestEvaluationFor(evaluations, ruleId, signalIds) {
  return Array.from(evaluations.values())
    .filter((evaluation) => evaluation.candidateId === ruleId || signalIds.includes(evaluation.candidateId))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] || null;
}

function confidenceBreakdown(rule) {
  return {
    confidence: rule.confidence,
    positiveObservations: rule.positiveObservations,
    negativeObservations: rule.negativeObservations,
    authority: rule.authority,
    freshness: rule.freshness,
  };
}

function stabilityBreakdown(rule) {
  return {
    stability: rule.stability,
    observations: rule.positiveObservations + rule.negativeObservations,
    conflictRatio: (rule.positiveObservations + rule.negativeObservations) === 0 ? 0 : rule.negativeObservations / (rule.positiveObservations + rule.negativeObservations),
    freshness: rule.freshness,
  };
}

function limitationsForRule(rule) {
  const limitations = [];
  if (rule.stability === RULE_STABILITY.VOLATILE || rule.stability === RULE_STABILITY.EMERGING) limitations.push("Learning is not yet established.");
  if (rule.conflictingEvidence.length > 0) limitations.push("Conflicting evidence remains visible.");
  if (rule.scope === LEARNING_SCOPES.GLOBAL) limitations.push("Global-scope learning requires stronger evidence and careful review.");
  return limitations;
}

function scopeTargets(rule, scope) {
  return rule.scope === scope ? [rule.condition.subject || rule.behavior.target].filter(Boolean) : [];
}

function validationFinding(code, description) {
  return { code, severity: "MEDIUM", title: code.replace(/_/g, " "), description };
}

function domainFromFeedback(feedback) {
  if (/context/i.test(feedback.targetType || "")) return LEARNING_DOMAINS.CONTEXT_SELECTION;
  if (/plan|task/i.test(feedback.targetType || "")) return LEARNING_DOMAINS.PLANNING;
  if (/tool/i.test(feedback.targetType || "")) return LEARNING_DOMAINS.TOOL_SELECTION;
  if (/repair/i.test(feedback.targetType || "")) return LEARNING_DOMAINS.REPAIR;
  if (/validation|test/i.test(feedback.targetType || "")) return LEARNING_DOMAINS.VALIDATION;
  return LEARNING_DOMAINS.USER_PREFERENCE;
}

function domainFromSource(sourceType, record = {}) {
  const source = sourceType || LEARNING_SOURCE_TYPES.UNKNOWN;
  if ([LEARNING_SOURCE_TYPES.USER_INSTRUCTION, LEARNING_SOURCE_TYPES.USER_CORRECTION, LEARNING_SOURCE_TYPES.USER_ACCEPTANCE, LEARNING_SOURCE_TYPES.USER_REJECTION].includes(source)) return LEARNING_DOMAINS.USER_PREFERENCE;
  if (source === LEARNING_SOURCE_TYPES.PLAN_OUTCOME || source === LEARNING_SOURCE_TYPES.TASK_OUTCOME) return LEARNING_DOMAINS.PLANNING;
  if (source === LEARNING_SOURCE_TYPES.EXECUTION_OUTCOME) return LEARNING_DOMAINS.EXECUTION;
  if (source === LEARNING_SOURCE_TYPES.REPAIR_OUTCOME) return LEARNING_DOMAINS.REPAIR;
  if (source === LEARNING_SOURCE_TYPES.APPROVAL_OUTCOME) return LEARNING_DOMAINS.APPROVAL;
  if (source === LEARNING_SOURCE_TYPES.VALIDATION_OUTCOME) return LEARNING_DOMAINS.VALIDATION;
  if (source === LEARNING_SOURCE_TYPES.SECURITY_OUTCOME) return LEARNING_DOMAINS.SECURITY;
  if (source === LEARNING_SOURCE_TYPES.CONTEXT_OUTCOME) return LEARNING_DOMAINS.CONTEXT_SELECTION;
  if (source === LEARNING_SOURCE_TYPES.TOOL_OUTCOME) return LEARNING_DOMAINS.TOOL_SELECTION;
  if (source === LEARNING_SOURCE_TYPES.CODE_ANALYSIS) return LEARNING_DOMAINS.CODING_STYLE;
  if (source === LEARNING_SOURCE_TYPES.PROJECT_ASSESSMENT) return LEARNING_DOMAINS.RECOMMENDATION;
  if (source === LEARNING_SOURCE_TYPES.DURABLE_DECISION) return LEARNING_DOMAINS.PROJECT_CONVENTION;
  return record.domain || LEARNING_DOMAINS.UNKNOWN;
}

function sourceTypeFromRecord(record) {
  const source = String(record.source || record.type || "").toLowerCase();
  if (source.includes("validation")) return LEARNING_SOURCE_TYPES.VALIDATION_OUTCOME;
  if (source.includes("security")) return LEARNING_SOURCE_TYPES.SECURITY_OUTCOME;
  if (source.includes("repair")) return LEARNING_SOURCE_TYPES.REPAIR_OUTCOME;
  if (source.includes("approval")) return LEARNING_SOURCE_TYPES.APPROVAL_OUTCOME;
  if (source.includes("execution")) return LEARNING_SOURCE_TYPES.EXECUTION_OUTCOME;
  if (source.includes("context")) return LEARNING_SOURCE_TYPES.CONTEXT_OUTCOME;
  if (source.includes("planning")) return LEARNING_SOURCE_TYPES.PLAN_OUTCOME;
  if (source.includes("code")) return LEARNING_SOURCE_TYPES.CODE_ANALYSIS;
  if (source.includes("project")) return LEARNING_SOURCE_TYPES.PROJECT_ASSESSMENT;
  return LEARNING_SOURCE_TYPES.IMPORTED_LEARNING;
}

function polarityFromOutcome(outcome) {
  const text = String(outcome || "").toLowerCase();
  if (/success|passed|complete|accepted|approved|repaired|resolved/.test(text)) return SIGNAL_POLARITIES.POSITIVE;
  if (/fail|rejected|denied|blocked|regression|rollback|error/.test(text)) return SIGNAL_POLARITIES.NEGATIVE;
  if (/partial|mixed|corrected/.test(text)) return SIGNAL_POLARITIES.MIXED;
  return SIGNAL_POLARITIES.UNKNOWN;
}

function polarityFromRecord(record) {
  if (record.polarity && Object.values(SIGNAL_POLARITIES).includes(record.polarity)) return record.polarity;
  const value = record.value || {};
  return polarityFromOutcome(record.outcome || value.outcome || value.status || value.result || value.decision || value.passed);
}

function scopeFromFeedback(feedback) {
  if (feedback.metadata && feedback.metadata.scope && Object.values(LEARNING_SCOPES).includes(feedback.metadata.scope)) return feedback.metadata.scope;
  if (feedback.targetType === "file") return LEARNING_SCOPES.FILE;
  if (feedback.targetType === "task") return LEARNING_SCOPES.TASK;
  if (feedback.sessionId) return LEARNING_SCOPES.SESSION;
  return LEARNING_SCOPES.PROJECT;
}

function authorityFor(authority, sourceType) {
  if (Number.isFinite(Number(authority))) return normalizeScore(authority, 0.5);
  if (authority && AUTHORITY[authority] !== undefined) return AUTHORITY[authority];
  return normalizeAuthority(sourceType, sourceType);
}

function normalizeAuthority(authority, sourceType) {
  if (Number.isFinite(Number(authority))) return normalizeScore(authority, 0.5);
  if (authority && AUTHORITY[authority] !== undefined) return AUTHORITY[authority];
  if (sourceType === LEARNING_SOURCE_TYPES.USER_INSTRUCTION || sourceType === LEARNING_SOURCE_TYPES.USER_CORRECTION) return AUTHORITY.current_user_instruction;
  if (sourceType === LEARNING_SOURCE_TYPES.DURABLE_DECISION) return AUTHORITY.durable_decision;
  if (sourceType === LEARNING_SOURCE_TYPES.SECURITY_OUTCOME) return AUTHORITY.security_policy;
  if (sourceType === LEARNING_SOURCE_TYPES.REPOSITORY_EVIDENCE || sourceType === LEARNING_SOURCE_TYPES.CODE_ANALYSIS) return AUTHORITY.repository_state;
  if ([LEARNING_SOURCE_TYPES.EXECUTION_OUTCOME, LEARNING_SOURCE_TYPES.VALIDATION_OUTCOME, LEARNING_SOURCE_TYPES.REPAIR_OUTCOME].includes(sourceType)) return AUTHORITY.validated_execution;
  if (sourceType === LEARNING_SOURCE_TYPES.APPROVAL_OUTCOME) return AUTHORITY.approval_decision;
  if (sourceType === LEARNING_SOURCE_TYPES.PLAN_OUTCOME || sourceType === LEARNING_SOURCE_TYPES.TASK_OUTCOME) return AUTHORITY.accepted_plan;
  if (sourceType === LEARNING_SOURCE_TYPES.IMPORTED_LEARNING) return AUTHORITY.cross_session_learning;
  if (sourceType === LEARNING_SOURCE_TYPES.HEURISTIC) return AUTHORITY.heuristic;
  return 0.5;
}

function successfulSignal(signal) {
  return signal.polarity === SIGNAL_POLARITIES.POSITIVE && /success|passed|complete|accepted|approved|repaired|resolved/i.test(`${signal.outcome || ""} ${stableSerialize(signal.value)}`);
}

function freshnessFor(signals, maximumAgeMs) {
  if (signals.length === 0) return 0;
  const values = signals.map((signal) => {
    const age = Date.now() - Date.parse(signal.timestamp);
    if (!Number.isFinite(age) || age <= 0) return 1;
    return Math.max(0, 1 - age / maximumAgeMs);
  });
  return average(values);
}

function stabilityFor(supporting, sessions, conflictRatio, successes) {
  if (conflictRatio > 0.45) return RULE_STABILITY.DISPUTED;
  if (supporting >= 5 && sessions >= 3 && successes >= 3) return RULE_STABILITY.ESTABLISHED;
  if (supporting >= 3 && sessions >= 2) return RULE_STABILITY.STABLE;
  if (supporting >= 2) return RULE_STABILITY.EMERGING;
  if (supporting >= 1) return RULE_STABILITY.VOLATILE;
  return RULE_STABILITY.UNKNOWN;
}

function stabilityScore(stability) {
  return {
    [RULE_STABILITY.VOLATILE]: 0.2,
    [RULE_STABILITY.EMERGING]: 0.45,
    [RULE_STABILITY.STABLE]: 0.72,
    [RULE_STABILITY.ESTABLISHED]: 0.9,
    [RULE_STABILITY.DISPUTED]: 0.25,
    [RULE_STABILITY.UNKNOWN]: 0.1,
  }[stability] || 0;
}

function normalizeThresholds(input) {
  return {
    ...DEFAULT_THRESHOLDS,
    ...Object.fromEntries(Object.entries(input || {}).filter(([, value]) => Number.isFinite(Number(value)) || typeof value === "boolean")),
  };
}

function normalizeBounds(input) {
  return {
    ...DEFAULT_BOUNDS,
    ...Object.fromEntries(Object.entries(input || {}).filter(([, value]) => Number.isFinite(Number(value)))),
  };
}

function normalizeCondition(input) { return clonePlainObject(input || {}); }
function normalizeBehavior(input) { return clonePlainObject(input || {}); }

function titleFromBehavior(domain, behavior) {
  return `${domain.toLowerCase().replace(/_/g, " ")} ${String(behavior.kind || "adaptation").replace(/_/g, " ")}`;
}

function targetSubsystemFor(type) {
  if (String(type).startsWith("CONTEXT")) return "context";
  if ([ADAPTATION_TYPES.PLANNING_PREFERENCE, ADAPTATION_TYPES.TASK_DECOMPOSITION].includes(type)) return "planning";
  if ([ADAPTATION_TYPES.VALIDATION_REQUIREMENT, ADAPTATION_TYPES.TEST_REQUIREMENT].includes(type)) return "validation";
  if (type === ADAPTATION_TYPES.REPAIR_STRATEGY) return "repair";
  if (type === ADAPTATION_TYPES.RECOMMENDATION_WEIGHT) return "recommendation";
  if (type === ADAPTATION_TYPES.SECURITY_REQUIREMENT) return "security";
  if (type === ADAPTATION_TYPES.APPROVAL_POLICY_HINT) return "approval";
  return "learning";
}

function operationForType(type) {
  if ([ADAPTATION_TYPES.CONTEXT_WEIGHT, ADAPTATION_TYPES.RECOMMENDATION_WEIGHT].includes(type)) return "adjust_weight";
  if ([ADAPTATION_TYPES.CONTEXT_EXCLUSION, ADAPTATION_TYPES.TOOL_AVOIDANCE].includes(type)) return "reduce_preference";
  if ([ADAPTATION_TYPES.VALIDATION_REQUIREMENT, ADAPTATION_TYPES.TEST_REQUIREMENT, ADAPTATION_TYPES.SECURITY_REQUIREMENT].includes(type)) return "add_requirement";
  return "set_preference";
}

function risksForAdaptation(type) {
  if ([ADAPTATION_TYPES.SECURITY_REQUIREMENT, ADAPTATION_TYPES.APPROVAL_POLICY_HINT].includes(type)) return ["Must preserve security and approval invariants."];
  if (type === ADAPTATION_TYPES.CONTEXT_EXCLUSION) return ["May hide useful context if over-applied; bounded by authority rules."];
  return ["Reevaluate when evidence changes."];
}

function compactSnapshot(snapshot) {
  return {
    schemaVersion: snapshot.schemaVersion,
    projectId: snapshot.projectId,
    repositoryPath: snapshot.repositoryPath,
    stats: snapshot.stats,
    counts: Object.fromEntries(Object.entries(snapshot).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length])),
  };
}

function snapshotFor(input) {
  if (!input) return null;
  if (typeof input.snapshot === "function") return input.snapshot();
  return input;
}

function filterValues(map, filter) {
  const filters = clonePlainObject(filter || {});
  return Array.from(map.values()).filter((value) => Object.entries(filters).every(([key, expected]) => {
    if (expected === undefined || expected === null) return true;
    if (Array.isArray(expected)) return expected.includes(value[key]);
    return value[key] === expected;
  }));
}

function boundedWeight(value, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Number(Math.max(-maximum, Math.min(maximum, number)).toFixed(6));
}

function normalizeEnum(value, constants, label) {
  const normalized = requiredString(value, `${label} is required.`);
  if (!Object.values(constants).includes(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function normalizeStringArray(value) {
  return uniqueSorted(safeArray(value).map((entry) => String(entry).trim()).filter(Boolean));
}

function normalizeScore(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function integer(value, fallback) {
  return Number.isInteger(value) ? value : fallback;
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null) return new Date().toISOString();
  const timestamp = typeof value === "number" ? new Date(value).toISOString() : String(value);
  if (Number.isNaN(Date.parse(timestamp))) throw new Error("Learning adaptation timestamp must be valid.");
  return timestamp;
}

function defaultPersistencePath(repositoryPath) {
  if (!repositoryPath) throw new Error("Learning adaptation persistence requires a repository path or file path.");
  return path.join(repositoryPath, ".levi", "learning-adaptation.json");
}

function validateSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) throw new Error("Learning adaptation snapshot must be an object.");
  if (snapshot.schemaVersion !== LEARNING_ADAPTATION_SCHEMA_VERSION) throw new Error("Learning adaptation snapshot schema version is unsupported.");
  if (!Array.isArray(snapshot.signals) || !Array.isArray(snapshot.rules) || !Array.isArray(snapshot.adaptations)) throw new Error("Learning adaptation snapshot requires signals, rules, and adaptations.");
}

function migrateSnapshot(snapshot, migrations) {
  let current = clonePlainObject(snapshot);
  for (const migration of migrations) if (typeof migration === "function") current = migration(current);
  return current;
}

function emptyStats() {
  return {
    signalsIngested: 0,
    duplicateSignalsSkipped: 0,
    feedbackRecords: 0,
    candidatesEvaluated: 0,
    eligibleCandidates: 0,
    rejectedCandidates: 0,
    rulesCreated: 0,
    activeRules: 0,
    suspendedRules: 0,
    staleRules: 0,
    conflictedRules: 0,
    supersededRules: 0,
    adaptationsProposed: 0,
    adaptationsApplied: 0,
    partialApplications: 0,
    adaptationsRejected: 0,
    adaptationsRolledBack: 0,
    rollbackFailures: 0,
    conflicts: 0,
    corruptedLoads: 0,
    partialAnalyses: 0,
    averageConfidence: 0,
    averageStability: 0,
    lastIngestion: null,
    lastDerivation: null,
    lastAdaptation: null,
    lastRollback: null,
  };
}

function hasDuplicateIds(values) {
  const ids = values.map((value) => value.id);
  return new Set(ids).size !== ids.length;
}

function uniqueEvidence(evidence) {
  return limitEvidence(evidence, 100);
}

function limitEvidence(evidence, limit) {
  return dedupeBy(safeArray(evidence).filter(Boolean).map((entry) => {
    if (typeof entry === "string") return { source: entry, signal: "evidence" };
    return clonePlainObject(entry);
  }), stableSerialize).slice(0, limit);
}

function dedupeBy(values, keyFn) {
  const byKey = new Map();
  for (const value of safeArray(values)) {
    const key = keyFn(value);
    if (!byKey.has(key)) byKey.set(key, value);
  }
  return Array.from(byKey.values());
}

function safeArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function clonePlainObject(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function cloneOrNull(value) {
  return value ? clonePlainObject(value) : null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function requiredString(value, message) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(message);
  return value.trim();
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stableReadable(value) {
  return typeof value === "string" ? value : stableSerialize(value);
}

function stableHash(value) {
  return crypto.createHash("sha256").update(stableSerialize(value)).digest("hex").slice(0, 16);
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function average(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.length ? Number((numbers.reduce((sum, value) => sum + value, 0) / numbers.length).toFixed(6)) : 0;
}

function compareSignals(left, right) { return left.projectId.localeCompare(right.projectId) || left.domain.localeCompare(right.domain) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id); }
function compareRules(left, right) { return left.projectId.localeCompare(right.projectId) || left.domain.localeCompare(right.domain) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id); }
function compareAdaptations(left, right) { return left.projectId.localeCompare(right.projectId) || left.type.localeCompare(right.type) || left.id.localeCompare(right.id); }
function compareFeedback(left, right) { return left.projectId.localeCompare(right.projectId) || left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id); }
function compareEvaluations(left, right) { return left.projectId.localeCompare(right.projectId) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id); }
function compareConflicts(left, right) { return left.projectId.localeCompare(right.projectId) || left.type.localeCompare(right.type) || left.id.localeCompare(right.id); }

module.exports = {
  ADAPTATION_STATUSES,
  ADAPTATION_TYPES,
  LEARNING_ADAPTATION_SCHEMA_VERSION,
  LEARNING_DOMAINS,
  LEARNING_EVENT_TYPES,
  LEARNING_EVENTS,
  LEARNING_SCOPES,
  LEARNING_SOURCE_TYPES,
  LEARNING_STATUSES,
  LearningAdaptationEngine,
  RULE_STABILITY,
  SIGNAL_POLARITIES,
};
