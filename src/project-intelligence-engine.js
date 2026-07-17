const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { scanRepository } = require("./repository-scanner");
const { summarizeProject } = require("./project-summary");
const { extractProjectKnowledge } = require("./project-knowledge");

const PROJECT_INTELLIGENCE_SCHEMA_VERSION = 1;

const PROJECT_INTELLIGENCE_DOMAINS = Object.freeze({
  IDENTITY: "IDENTITY",
  PURPOSE: "PURPOSE",
  SCOPE: "SCOPE",
  ARCHITECTURE: "ARCHITECTURE",
  FEATURES: "FEATURES",
  ROADMAP: "ROADMAP",
  EXECUTION: "EXECUTION",
  QUALITY: "QUALITY",
  TESTING: "TESTING",
  SECURITY: "SECURITY",
  DOCUMENTATION: "DOCUMENTATION",
  DEPENDENCIES: "DEPENDENCIES",
  MAINTAINABILITY: "MAINTAINABILITY",
  TECHNICAL_DEBT: "TECHNICAL_DEBT",
  RELEASE_READINESS: "RELEASE_READINESS",
  RISKS: "RISKS",
  BLOCKERS: "BLOCKERS",
  NEXT_ACTIONS: "NEXT_ACTIONS",
  CONFIDENCE: "CONFIDENCE",
  COMPLETENESS: "COMPLETENESS",
});

const PROJECT_CLASSIFICATIONS = Object.freeze({
  LIBRARY: "LIBRARY",
  CLI: "CLI",
  IDE_EXTENSION: "IDE_EXTENSION",
  DESKTOP_APPLICATION: "DESKTOP_APPLICATION",
  WEB_APPLICATION: "WEB_APPLICATION",
  MOBILE_APPLICATION: "MOBILE_APPLICATION",
  API_SERVICE: "API_SERVICE",
  BACKEND_SERVICE: "BACKEND_SERVICE",
  MONOREPO: "MONOREPO",
  MULTI_SERVICE_SYSTEM: "MULTI_SERVICE_SYSTEM",
  AUTOMATION: "AUTOMATION",
  AI_AGENT: "AI_AGENT",
  AI_PLATFORM: "AI_PLATFORM",
  DATA_PIPELINE: "DATA_PIPELINE",
  INFRASTRUCTURE: "INFRASTRUCTURE",
  DOCUMENTATION_PROJECT: "DOCUMENTATION_PROJECT",
  UNKNOWN: "UNKNOWN",
});

const PROJECT_LIFECYCLE_STAGES = Object.freeze({
  IDEA: "IDEA",
  DISCOVERY: "DISCOVERY",
  PLANNING: "PLANNING",
  PROTOTYPE: "PROTOTYPE",
  MVP_BUILD: "MVP_BUILD",
  HARDENING: "HARDENING",
  RELEASE_CANDIDATE: "RELEASE_CANDIDATE",
  PRODUCTION: "PRODUCTION",
  MAINTENANCE: "MAINTENANCE",
  DEPRECATED: "DEPRECATED",
  UNKNOWN: "UNKNOWN",
});

const PROJECT_ASSESSMENT_STATUSES = Object.freeze({
  READY: "READY",
  PARTIAL: "PARTIAL",
  BLOCKED: "BLOCKED",
  CONFLICTED: "CONFLICTED",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
  STALE: "STALE",
  FAILED: "FAILED",
});

const PROJECT_FINDING_SEVERITIES = Object.freeze({
  INFO: "INFO",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

const PROJECT_FINDING_STATUSES = Object.freeze({
  OPEN: "OPEN",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  RESOLVED: "RESOLVED",
  ACCEPTED_RISK: "ACCEPTED_RISK",
  STALE: "STALE",
  DISMISSED: "DISMISSED",
});

const PROJECT_FEATURE_STATES = Object.freeze({
  PLANNED: "PLANNED",
  READY: "READY",
  IN_PROGRESS: "IN_PROGRESS",
  IMPLEMENTED: "IMPLEMENTED",
  VALIDATED: "VALIDATED",
  BLOCKED: "BLOCKED",
  FAILED: "FAILED",
  DEFERRED: "DEFERRED",
  REMOVED: "REMOVED",
  UNKNOWN: "UNKNOWN",
});

const PROJECT_BLOCKER_CATEGORIES = Object.freeze({
  MISSING_CAPABILITY: "MISSING_CAPABILITY",
  FAILED_VALIDATION: "FAILED_VALIDATION",
  SECURITY_CRITICAL: "SECURITY_CRITICAL",
  UNRESOLVED_DEPENDENCY: "UNRESOLVED_DEPENDENCY",
  ARCHITECTURE_CONFLICT: "ARCHITECTURE_CONFLICT",
  PLAN_BLOCKED: "PLAN_BLOCKED",
  EXECUTION_FAILURE: "EXECUTION_FAILURE",
  APPROVAL_REQUIRED: "APPROVAL_REQUIRED",
  MISSING_EVIDENCE: "MISSING_EVIDENCE",
  STALE_STATE: "STALE_STATE",
  RESOURCE_BOUND: "RESOURCE_BOUND",
  UNKNOWN: "UNKNOWN",
});

const PROJECT_RISK_CATEGORIES = Object.freeze({
  ARCHITECTURE: "ARCHITECTURE",
  SECURITY: "SECURITY",
  QUALITY: "QUALITY",
  TESTING: "TESTING",
  DEPENDENCY: "DEPENDENCY",
  PERFORMANCE: "PERFORMANCE",
  DATA: "DATA",
  RELEASE: "RELEASE",
  MAINTAINABILITY: "MAINTAINABILITY",
  EXECUTION: "EXECUTION",
  DOCUMENTATION: "DOCUMENTATION",
  OPERATIONS: "OPERATIONS",
  COST: "COST",
  COMPLIANCE: "COMPLIANCE",
  UNKNOWN: "UNKNOWN",
});

const PROJECT_DEBT_CATEGORIES = Object.freeze({
  DUPLICATION: "DUPLICATION",
  COMPLEXITY: "COMPLEXITY",
  OVERSIZED_MODULE: "OVERSIZED_MODULE",
  WEAK_BOUNDARY: "WEAK_BOUNDARY",
  CIRCULAR_DEPENDENCY: "CIRCULAR_DEPENDENCY",
  MISSING_TEST: "MISSING_TEST",
  MISSING_DOCUMENTATION: "MISSING_DOCUMENTATION",
  STALE_DEPENDENCY: "STALE_DEPENDENCY",
  DEAD_CODE_CANDIDATE: "DEAD_CODE_CANDIDATE",
  UNRESOLVED_SYMBOL: "UNRESOLVED_SYMBOL",
  INCONSISTENT_CONVENTION: "INCONSISTENT_CONVENTION",
  TEMPORARY_WORKAROUND: "TEMPORARY_WORKAROUND",
  KNOWN_DEFECT: "KNOWN_DEFECT",
  DEFERRED_REFACTOR: "DEFERRED_REFACTOR",
  UNKNOWN: "UNKNOWN",
});

const PROJECT_EFFORT_CATEGORIES = Object.freeze({
  SMALL: "SMALL",
  MEDIUM: "MEDIUM",
  LARGE: "LARGE",
  UNKNOWN: "UNKNOWN",
});

const PROJECT_READINESS_LEVELS = Object.freeze({
  NOT_READY: "NOT_READY",
  EARLY: "EARLY",
  MVP_CANDIDATE: "MVP_CANDIDATE",
  RELEASE_CANDIDATE: "RELEASE_CANDIDATE",
  READY_WITH_RISK: "READY_WITH_RISK",
  READY: "READY",
  UNKNOWN: "UNKNOWN",
});

const PROJECT_ACTION_TYPES = Object.freeze({
  FIX_BLOCKER: "FIX_BLOCKER",
  RESOLVE_SECURITY_FINDING: "RESOLVE_SECURITY_FINDING",
  REPAIR_FAILURE: "REPAIR_FAILURE",
  COMPLETE_TASK: "COMPLETE_TASK",
  ADD_VALIDATION: "ADD_VALIDATION",
  ADD_TEST: "ADD_TEST",
  UPDATE_DOCUMENTATION: "UPDATE_DOCUMENTATION",
  RESOLVE_CONFLICT: "RESOLVE_CONFLICT",
  REDUCE_TECHNICAL_DEBT: "REDUCE_TECHNICAL_DEBT",
  REFRESH_ANALYSIS: "REFRESH_ANALYSIS",
  REQUEST_APPROVAL: "REQUEST_APPROVAL",
  PREPARE_RELEASE: "PREPARE_RELEASE",
  NO_ACTION: "NO_ACTION",
});

const PROJECT_SCORE_DOMAINS = Object.freeze({
  architectureHealth: "architectureHealth",
  codeHealth: "codeHealth",
  testingHealth: "testingHealth",
  securityPosture: "securityPosture",
  documentationHealth: "documentationHealth",
  maintainability: "maintainability",
  dependencyHealth: "dependencyHealth",
  executionReliability: "executionReliability",
  planningHealth: "planningHealth",
  contextQuality: "contextQuality",
  technicalDebtHealth: "technicalDebtHealth",
  releaseReadiness: "releaseReadiness",
  overallHealth: "overallHealth",
});

const PROJECT_INTELLIGENCE_EVENTS = Object.freeze({
  LIFECYCLE: "lifecycle",
});

const PROJECT_INTELLIGENCE_EVENT_TYPES = Object.freeze({
  PROJECT_ANALYSIS_STARTED: "project_analysis_started",
  PROJECT_ANALYSIS_COMPLETED: "project_analysis_completed",
  PROJECT_PROFILE_CREATED: "project_profile_created",
  PROJECT_PROFILE_REFRESHED: "project_profile_refreshed",
  PROJECT_ASSESSMENT_STARTED: "project_assessment_started",
  PROJECT_ASSESSMENT_COMPLETED: "project_assessment_completed",
  PROJECT_ASSESSMENT_REFRESHED: "project_assessment_refreshed",
  PROJECT_FINDING_CREATED: "project_finding_created",
  PROJECT_CONFLICT_DETECTED: "project_conflict_detected",
  PROJECT_BLOCKER_DETECTED: "project_blocker_detected",
  PROJECT_RISK_DETECTED: "project_risk_detected",
  PROJECT_SCORE_CALCULATED: "project_score_calculated",
  PROJECT_READINESS_CALCULATED: "project_readiness_calculated",
  PROJECT_RECOMMENDATION_CREATED: "project_recommendation_created",
  PROJECT_ASSESSMENT_VALIDATED: "project_assessment_validated",
  PROJECT_ASSESSMENT_COMPARED: "project_assessment_compared",
  PROJECT_INTELLIGENCE_PERSISTED: "project_intelligence_persisted",
  PROJECT_INTELLIGENCE_RESTORED: "project_intelligence_restored",
  PROJECT_INTELLIGENCE_CORRUPTION_DETECTED: "project_intelligence_corruption_detected",
  PROJECT_ANALYSIS_PARTIAL: "project_analysis_partial",
  PROJECT_ANALYSIS_INSUFFICIENT: "project_analysis_insufficient",
});

const DEFAULT_BOUNDS = Object.freeze({
  maximumCollectedRecords: 1000,
  maximumFindings: 300,
  maximumFeatures: 200,
  maximumObjectives: 100,
  maximumRisks: 100,
  maximumBlockers: 100,
  maximumTechnicalDebtItems: 100,
  maximumRecommendations: 50,
  maximumEvidencePerConclusion: 10,
  maximumAnalysisTimeMs: 30000,
  maximumHistoricalAssessments: 20,
  minimumReadyConfidence: 0.7,
});

const DEFAULT_WEIGHTS = Object.freeze({
  architectureHealth: 0.1,
  codeHealth: 0.1,
  testingHealth: 0.1,
  securityPosture: 0.12,
  documentationHealth: 0.07,
  maintainability: 0.08,
  dependencyHealth: 0.07,
  executionReliability: 0.09,
  planningHealth: 0.08,
  contextQuality: 0.06,
  technicalDebtHealth: 0.08,
  releaseReadiness: 0.05,
});

const AUTHORITY = Object.freeze({
  current_instruction: 1,
  durable_decision: 0.95,
  explicit_specification: 0.9,
  repository_state: 0.84,
  validated_execution: 0.8,
  accepted_plan: 0.74,
  documentation: 0.66,
  learning: 0.55,
  inferred_convention: 0.42,
  heuristic: 0.3,
});

class ProjectIntelligenceEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.projectId = options.projectId || null;
    this.repositoryPath = options.repositoryPath ? path.resolve(options.repositoryPath) : null;
    this.persistencePath = options.persistencePath || null;
    this.scanRepository = options.scanRepository || scanRepository;
    this.summarizeProject = options.summarizeProject || summarizeProject;
    this.collectors = normalizeCollectors(options.collectors || []);
    this.repositoryGraph = options.repositoryGraph || null;
    this.offlineIndex = options.offlineIndex || null;
    this.codeUnderstandingEngine = options.codeUnderstandingEngine || options.codeUnderstanding || null;
    this.planningEngine = options.planningEngine || null;
    this.contextEngine = options.contextEngine || null;
    this.learningEngine = options.learningEngine || null;
    this.summaryAdapter = typeof options.summaryAdapter === "function" ? options.summaryAdapter : null;
    this.planningAdapter = options.planningAdapter || null;
    this.contextAdapter = options.contextAdapter || null;
    this.migrations = Array.isArray(options.migrations) ? options.migrations.slice() : [];
    this.bounds = normalizeBounds(options.bounds || {});
    this.weights = normalizeWeights(options.weights || {});
    this.profiles = new Map();
    this.assessments = new Map();
    this.scoreExplanations = new Map();
    this.comparisons = new Map();
    this.createdAt = normalizeTimestamp(options.createdAt);
    this.updatedAt = normalizeTimestamp(options.updatedAt || this.createdAt);
    this.stats = emptyStats();
  }

  analyzeProject(projectId = this.projectId || "default", options = {}) {
    const normalizedProjectId = requiredString(projectId, "Project intelligence projectId is required.");
    this.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_ANALYSIS_STARTED, { projectId: normalizedProjectId });
    const profile = this.createProfile(normalizedProjectId, options);
    const assessment = this.assessProject(normalizedProjectId, { ...options, profile });
    this.stats.projectsAnalyzed += 1;
    this.stats.lastAnalysis = assessment.createdAt;
    this.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_ANALYSIS_COMPLETED, {
      projectId: normalizedProjectId,
      profileId: profile.id,
      assessmentId: assessment.id,
      status: assessment.status,
    });
    return { profile, assessment };
  }

  createProfile(projectId = this.projectId || "default", options = {}) {
    const normalizedProjectId = requiredString(projectId, "Project profile projectId is required.");
    const evidence = this.collectEvidence(normalizedProjectId, options);
    const profile = normalizeProfile(buildProfile(this, normalizedProjectId, evidence, options), this);
    const existing = this.profiles.has(normalizedProjectId);
    this.profiles.set(normalizedProjectId, profile);
    this.stats.profilesCreated += existing ? 0 : 1;
    this.updatedAt = profile.updatedAt;
    this.emitLifecycle(existing ? PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_PROFILE_REFRESHED : PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_PROFILE_CREATED, {
      projectId: normalizedProjectId,
      profile: clonePlainObject(profile),
    });
    return clonePlainObject(profile);
  }

  refreshProfile(projectId = this.projectId || "default", options = {}) {
    return this.createProfile(projectId, { ...options, refresh: true });
  }

  assessProject(projectId = this.projectId || "default", options = {}) {
    const normalizedProjectId = requiredString(projectId, "Project assessment projectId is required.");
    this.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_ASSESSMENT_STARTED, { projectId: normalizedProjectId });
    const evidence = this.collectEvidence(normalizedProjectId, options);
    const profile = options.profile ? normalizeProfile(options.profile, this) : this.getProfile(normalizedProjectId) || this.createProfile(normalizedProjectId, options);
    const assessment = normalizeAssessment(buildAssessment(this, normalizedProjectId, profile, evidence, options), this);
    this.addAssessment(normalizedProjectId, assessment);
    this.stats.assessmentsCreated += 1;
    this.updatedAt = assessment.createdAt;
    this.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_ASSESSMENT_COMPLETED, {
      projectId: normalizedProjectId,
      assessmentId: assessment.id,
      status: assessment.status,
    });
    return clonePlainObject(assessment);
  }

  refreshAssessment(projectId = this.projectId || "default", options = {}) {
    const assessment = this.assessProject(projectId, { ...options, refresh: true });
    this.stats.assessmentsRefreshed += 1;
    this.stats.lastRefresh = assessment.createdAt;
    this.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_ASSESSMENT_REFRESHED, {
      projectId,
      assessmentId: assessment.id,
    });
    return assessment;
  }

  getProfile(projectId = this.projectId || "default") {
    const profile = this.profiles.get(projectId);
    return profile ? clonePlainObject(profile) : null;
  }

  getAssessment(projectId = this.projectId || "default") {
    const list = this.assessments.get(projectId) || [];
    return list.length > 0 ? clonePlainObject(list[list.length - 1]) : null;
  }

  getProjectSummary(projectId = this.projectId || "default", options = {}) {
    const profile = this.getProfile(projectId) || this.createProfile(projectId, options);
    const assessment = this.getAssessment(projectId) || this.assessProject(projectId, { ...options, profile });
    const summary = deterministicProjectSummary(profile, assessment);
    return this.summaryAdapter ? this.summaryAdapter(summary, { projectId, profile, assessment, options }) || summary : summary;
  }

  getArchitectureAssessment(projectId = this.projectId || "default", options = {}) {
    return domainAssessment(this.requireAssessment(projectId, options), PROJECT_INTELLIGENCE_DOMAINS.ARCHITECTURE);
  }

  getFeatureAssessment(projectId = this.projectId || "default", options = {}) {
    const assessment = this.requireAssessment(projectId, options);
    return {
      completedCapabilities: clonePlainObject(assessment.completedCapabilities),
      incompleteCapabilities: clonePlainObject(assessment.incompleteCapabilities),
      findings: assessment.findings.filter((finding) => finding.domain === PROJECT_INTELLIGENCE_DOMAINS.FEATURES),
    };
  }

  getExecutionAssessment(projectId = this.projectId || "default", options = {}) {
    return domainAssessment(this.requireAssessment(projectId, options), PROJECT_INTELLIGENCE_DOMAINS.EXECUTION);
  }

  getQualityAssessment(projectId = this.projectId || "default", options = {}) {
    return domainAssessment(this.requireAssessment(projectId, options), PROJECT_INTELLIGENCE_DOMAINS.QUALITY);
  }

  getTestingAssessment(projectId = this.projectId || "default", options = {}) {
    return domainAssessment(this.requireAssessment(projectId, options), PROJECT_INTELLIGENCE_DOMAINS.TESTING);
  }

  getSecurityAssessment(projectId = this.projectId || "default", options = {}) {
    return domainAssessment(this.requireAssessment(projectId, options), PROJECT_INTELLIGENCE_DOMAINS.SECURITY);
  }

  getDocumentationAssessment(projectId = this.projectId || "default", options = {}) {
    return domainAssessment(this.requireAssessment(projectId, options), PROJECT_INTELLIGENCE_DOMAINS.DOCUMENTATION);
  }

  getDependencyAssessment(projectId = this.projectId || "default", options = {}) {
    return domainAssessment(this.requireAssessment(projectId, options), PROJECT_INTELLIGENCE_DOMAINS.DEPENDENCIES);
  }

  getTechnicalDebtAssessment(projectId = this.projectId || "default", options = {}) {
    const assessment = this.requireAssessment(projectId, options);
    return {
      technicalDebt: clonePlainObject(assessment.technicalDebt),
      findings: assessment.findings.filter((finding) => finding.domain === PROJECT_INTELLIGENCE_DOMAINS.TECHNICAL_DEBT),
      score: assessment.scores.technicalDebtHealth,
    };
  }

  getReleaseReadiness(projectId = this.projectId || "default", options = {}) {
    return clonePlainObject(this.requireAssessment(projectId, options).releaseReadiness);
  }

  getBlockers(projectId = this.projectId || "default", options = {}) {
    return clonePlainObject(this.requireAssessment(projectId, options).blockers);
  }

  getRisks(projectId = this.projectId || "default", options = {}) {
    return clonePlainObject(this.requireAssessment(projectId, options).risks);
  }

  getNextActions(projectId = this.projectId || "default", options = {}) {
    return clonePlainObject(this.requireAssessment(projectId, options).nextActions);
  }

  compareAssessments(projectId = this.projectId || "default", firstId, secondId) {
    const list = this.assessments.get(projectId) || [];
    const first = list.find((assessment) => assessment.id === firstId);
    const second = list.find((assessment) => assessment.id === secondId);
    if (!first || !second) throw new Error("Project assessment comparison requires two known assessments.");
    const comparison = {
      id: `project-comparison:${stableHash({ projectId, firstId, secondId })}`,
      projectId,
      firstId,
      secondId,
      scoreChanges: compareScores(first.scores, second.scores),
      readinessChange: { from: first.releaseReadiness.level, to: second.releaseReadiness.level },
      resolvedFindings: diffById(first.findings, second.findings).removed,
      newFindings: diffById(first.findings, second.findings).added,
      changedBlockers: diffByStable(first.blockers, second.blockers),
      changedRisks: diffByStable(first.risks, second.risks),
      changedFeatureStates: compareFeatureStates(first, second),
      confidenceChange: Number((second.confidence - first.confidence).toFixed(6)),
      completenessChange: Number((second.completeness - first.completeness).toFixed(6)),
      createdAt: new Date().toISOString(),
    };
    this.comparisons.set(comparison.id, comparison);
    this.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_ASSESSMENT_COMPARED, {
      projectId,
      comparisonId: comparison.id,
    });
    return clonePlainObject(comparison);
  }

  explainScore(projectId = this.projectId || "default", domain) {
    const assessment = this.requireAssessment(projectId);
    const normalizedDomain = requiredString(domain, "Project score domain is required.");
    const explanation = this.scoreExplanations.get(`${assessment.id}:${normalizedDomain}`);
    if (explanation) return clonePlainObject(explanation);
    const score = assessment.scores[normalizedDomain];
    if (!score) return null;
    return {
      domain: normalizedDomain,
      baseline: 70,
      additions: [],
      deductions: score.deductions || [],
      caps: assessment.releaseReadiness.caps || [],
      evidence: score.evidence,
      confidenceCalculation: {
        sourceConfidence: score.confidence,
        assessmentConfidence: assessment.confidence,
      },
      value: score.value,
    };
  }

  explainConclusion(projectId = this.projectId || "default", conclusionIdOrCode) {
    const assessment = this.requireAssessment(projectId);
    const conclusion = assessment.findings.find((finding) => finding.id === conclusionIdOrCode || finding.code === conclusionIdOrCode) ||
      assessment.nextActions.find((action) => action.id === conclusionIdOrCode || action.type === conclusionIdOrCode) ||
      (assessment.releaseReadiness.id === conclusionIdOrCode || assessment.releaseReadiness.level === conclusionIdOrCode ? assessment.releaseReadiness : null);
    if (!conclusion) return null;
    return {
      conclusion: clonePlainObject(conclusion),
      sourceEvidence: clonePlainObject(conclusion.evidence || []),
      authorityOrdering: clonePlainObject(AUTHORITY),
      conflicts: assessment.findings.filter((finding) => finding.code.includes("conflict")),
      limitations: assessment.metadata.limitations || [],
      confidence: conclusion.confidence || assessment.confidence,
    };
  }

  validateAssessment(projectId = this.projectId || "default", assessmentId) {
    const assessment = assessmentId ? (this.assessments.get(projectId) || []).find((candidate) => candidate.id === assessmentId) : this.getAssessment(projectId);
    if (!assessment) throw new Error("Project assessment validation requires a known assessment.");
    const findings = [];
    if (!assessment.profileId) findings.push(validationFinding("missing_profile", "Assessment profileId is required."));
    for (const [domain, score] of Object.entries(assessment.scores)) {
      if (score.value < 0 || score.value > 100) findings.push(validationFinding("score_range", `${domain} score is outside 0-100.`));
      if (!Array.isArray(score.evidence) || score.evidence.length === 0) findings.push(validationFinding("score_evidence", `${domain} score lacks evidence.`));
    }
    if (assessment.releaseReadiness.level === PROJECT_READINESS_LEVELS.READY && (hasCriticalBlocker(assessment) || hasCriticalSecurity(assessment))) {
      findings.push(validationFinding("readiness_consistency", "READY is inconsistent with critical blockers or security findings."));
    }
    if (assessment.confidence < 0 || assessment.confidence > 1) findings.push(validationFinding("confidence_bounds", "Confidence is outside 0-1."));
    if (assessment.completeness < 0 || assessment.completeness > 1) findings.push(validationFinding("completeness_bounds", "Completeness is outside 0-1."));
    if (duplicateIds(assessment.findings)) findings.push(validationFinding("duplicate_findings", "Duplicate finding IDs detected."));
    if (assessment.nextActions.some((action) => !action.evidence || action.evidence.length === 0)) {
      findings.push(validationFinding("recommendation_traceability", "A recommendation lacks evidence."));
    }
    const result = {
      status: findings.length === 0 ? "VALID" : "INVALID",
      assessmentId: assessment.id,
      findings,
    };
    this.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_ASSESSMENT_VALIDATED, {
      projectId,
      assessmentId: assessment.id,
      status: result.status,
    });
    return result;
  }

  getStats() {
    this.recalculateStats();
    return clonePlainObject(this.stats);
  }

  snapshot() {
    return {
      schemaVersion: PROJECT_INTELLIGENCE_SCHEMA_VERSION,
      projectId: this.projectId,
      repositoryPath: this.repositoryPath,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      bounds: clonePlainObject(this.bounds),
      weights: clonePlainObject(this.weights),
      profiles: Array.from(this.profiles.values()).sort(compareProfiles).map(clonePlainObject),
      assessments: Array.from(this.assessments.entries()).sort(compareEntries).flatMap(([, assessments]) => assessments.map(clonePlainObject)),
      scoreExplanations: Array.from(this.scoreExplanations.values()).map(clonePlainObject),
      comparisons: Array.from(this.comparisons.values()).map(clonePlainObject),
      stats: this.getStats(),
    };
  }

  restore(snapshot) {
    const migrated = migrateSnapshot(snapshot, this.migrations);
    validateSnapshot(migrated);
    this.profiles.clear();
    this.assessments.clear();
    this.scoreExplanations.clear();
    this.comparisons.clear();
    this.projectId = migrated.projectId || this.projectId;
    this.repositoryPath = migrated.repositoryPath || this.repositoryPath;
    this.createdAt = normalizeTimestamp(migrated.createdAt);
    this.updatedAt = normalizeTimestamp(migrated.updatedAt || migrated.createdAt);
    this.bounds = normalizeBounds(migrated.bounds || {});
    this.weights = normalizeWeights(migrated.weights || {});
    for (const profile of migrated.profiles || []) this.profiles.set(profile.projectId, normalizeProfile(profile, this));
    for (const assessment of migrated.assessments || []) this.addAssessment(assessment.projectId, normalizeAssessment(assessment, this), { silent: true });
    for (const explanation of migrated.scoreExplanations || []) this.scoreExplanations.set(`${explanation.assessmentId}:${explanation.domain}`, clonePlainObject(explanation));
    for (const comparison of migrated.comparisons || []) this.comparisons.set(comparison.id, clonePlainObject(comparison));
    this.stats = { ...emptyStats(), ...clonePlainObject(migrated.stats || {}) };
    this.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_INTELLIGENCE_RESTORED, {
      profileCount: this.profiles.size,
      assessmentCount: Array.from(this.assessments.values()).flat().length,
    });
    return this.snapshot();
  }

  save(filePath = this.persistencePath || defaultPersistencePath(this.repositoryPath)) {
    const targetPath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const tempPath = `${targetPath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(this.snapshot(), null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, targetPath);
    this.persistencePath = targetPath;
    this.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_INTELLIGENCE_PERSISTED, {
      path: targetPath,
      schemaVersion: PROJECT_INTELLIGENCE_SCHEMA_VERSION,
    });
    return { status: "PERSISTED", path: targetPath, schemaVersion: PROJECT_INTELLIGENCE_SCHEMA_VERSION };
  }

  load(filePath = this.persistencePath || defaultPersistencePath(this.repositoryPath), options = {}) {
    const targetPath = path.resolve(filePath);
    try {
      this.restore(JSON.parse(fs.readFileSync(targetPath, "utf8")));
      this.persistencePath = targetPath;
      return { status: "LOADED", path: targetPath, schemaVersion: PROJECT_INTELLIGENCE_SCHEMA_VERSION };
    } catch (error) {
      this.stats.corruptedLoads += 1;
      this.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_INTELLIGENCE_CORRUPTION_DETECTED, {
        path: targetPath,
        reason: error.message,
      });
      if (options.emptyOnCorruption === true) {
        this.profiles.clear();
        this.assessments.clear();
        this.scoreExplanations.clear();
        this.comparisons.clear();
        this.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_INTELLIGENCE_RESTORED, { profileCount: 0, assessmentCount: 0 });
        return { status: "EMPTY", path: targetPath, error: error.message };
      }
      return { status: "CORRUPT", path: targetPath, error: error.message };
    }
  }

  collectEvidence(projectId, options = {}) {
    const startedAt = Date.now();
    const records = [];
    const findings = [];
    const add = (record) => {
      if (!record || records.length >= this.bounds.maximumCollectedRecords) return;
      records.push(normalizeEvidenceRecord(record, projectId));
    };
    const addFinding = (finding) => {
      if (!finding || findings.length >= this.bounds.maximumFindings) return;
      findings.push(normalizeFinding(finding, this, projectId));
    };
    const repositoryPath = path.resolve(options.repositoryPath || this.repositoryPath || ".");
    const scanResult = options.scanResult || safeCall(() => this.scanRepository(repositoryPath));
    const projectSummary = options.projectSummary || (scanResult ? safeCall(() => this.summarizeProject(scanResult)) : null);
    if (projectSummary) add({ source: "project_metadata", authority: "repository_state", type: "project_summary", value: projectSummary, evidence: [{ source: ".", signal: "project summary" }], confidence: 0.84 });
    const packageManifest = readPackageManifest(repositoryPath);
    if (packageManifest) add({ source: "package_manifest", authority: "explicit_specification", type: "package_manifest", value: packageManifest, evidence: [{ source: "package.json", signal: "package manifest" }], confidence: 0.9 });
    const documentation = readProjectDocumentation(repositoryPath);
    for (const doc of documentation) add({ source: "project_documentation", authority: "documentation", type: "documentation", value: doc, evidence: [{ source: doc.path, signal: "project documentation" }], confidence: 0.66 });
    if (scanResult) {
      const knowledge = safeCall(() => extractProjectKnowledge({ repositoryPath, scanResult, projectSummary }));
      if (knowledge) add({ source: "project_knowledge", authority: "repository_state", type: "project_knowledge", value: knowledge, evidence: [{ source: ".", signal: "project knowledge extraction" }], confidence: 0.78 });
    }
    const graphSnapshot = snapshotFor(options.repositoryGraph || this.repositoryGraph);
    if (graphSnapshot) add({ source: "repository_graph", authority: "repository_state", type: "repository_graph", value: graphSnapshot, evidence: [{ source: "repository-graph", signal: "graph snapshot" }], confidence: 0.82 });
    const indexSnapshot = snapshotFor(options.offlineIndex || this.offlineIndex);
    if (indexSnapshot) add({ source: "offline_index", authority: "repository_state", type: "offline_index", value: indexSnapshot, evidence: [{ source: "offline-index", signal: "index snapshot" }], confidence: 0.72 });
    const code = options.codeUnderstanding || options.codeUnderstandingEngine || this.codeUnderstandingEngine;
    const codeSnapshot = snapshotFor(code);
    if (codeSnapshot) add({ source: "code_understanding", authority: "repository_state", type: "code_understanding", value: codeSnapshot, evidence: [{ source: "code-understanding", signal: "code understanding snapshot" }], confidence: 0.86 });
    if (code && typeof code.getArchitectureView === "function") {
      const architectureView = safeCall(() => code.getArchitectureView(options.codeUnderstandingOptions || {}));
      if (architectureView) add({ source: "code_understanding", authority: "repository_state", type: "architecture_view", value: architectureView, evidence: [{ source: "code-understanding", signal: "architecture view" }], confidence: 0.86 });
    }
    const planningSnapshot = snapshotFor(options.planningEngine || this.planningEngine);
    if (planningSnapshot) add({ source: "planning_intelligence", authority: "accepted_plan", type: "planning", value: planningSnapshot, evidence: [{ source: "planning", signal: "planning snapshot" }], confidence: 0.74 });
    const contextSnapshot = snapshotFor(options.contextEngine || this.contextEngine);
    if (contextSnapshot) add({ source: "context_intelligence", authority: "inferred_convention", type: "context", value: contextSnapshot, evidence: [{ source: "context", signal: "context snapshot" }], confidence: 0.62 });
    const learningSnapshot = snapshotFor(options.learningEngine || this.learningEngine);
    if (learningSnapshot) add({ source: "cross_session_learning", authority: "learning", type: "learning", value: learningSnapshot, evidence: [{ source: "learning", signal: "learning snapshot" }], confidence: 0.55 });
    addList(recordsFrom(options.durableDecisions || options.decisionRecords), "durable_decision", "durable_decision", 0.95, add);
    addList(recordsFrom(options.executionHistory), "execution_history", "validated_execution", 0.75, add);
    addList(recordsFrom(options.repairHistory), "repair_history", "validated_execution", 0.7, add);
    addList(recordsFrom(options.approvalHistory), "approval_history", "validated_execution", 0.72, add);
    addList(recordsFrom(options.securityFindings), "security_finding", "validated_execution", 0.86, add);
    addList(recordsFrom(options.validationResults), "validation_result", "validated_execution", 0.84, add);
    addList(recordsFrom(options.completionEvidence), "completion_evidence", "validated_execution", 0.82, add);
    addList(recordsFrom(options.currentInstructions || options.currentInstruction), "current_instruction", "current_instruction", 1, add);
    for (const collector of [...this.collectors, ...normalizeCollectors(options.collectors || [])]) {
      const output = collector.collect({ projectId, repositoryPath, options: clonePlainObject(options), engine: this });
      const normalized = normalizeCollectorOutput(output, projectId);
      for (const record of normalized.records) add(record);
      for (const finding of normalized.findings) addFinding(finding);
    }
    if (records.length >= this.bounds.maximumCollectedRecords || Date.now() - startedAt > this.bounds.maximumAnalysisTimeMs) {
      addFinding({
        domain: PROJECT_INTELLIGENCE_DOMAINS.COMPLETENESS,
        code: "partial_collection",
        severity: PROJECT_FINDING_SEVERITIES.MEDIUM,
        title: "Project evidence collection was partial",
        description: "Collection reached a configured project-intelligence bound.",
        evidence: [{ source: "project-intelligence", signal: "collection bounds" }],
        confidence: 0.8,
      });
      this.stats.partialAnalyses += 1;
      this.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_ANALYSIS_PARTIAL, { projectId });
    }
    const sourceCount = new Set(records.map((record) => record.source)).size;
    if (sourceCount < 2) {
      addFinding({
        domain: PROJECT_INTELLIGENCE_DOMAINS.COMPLETENESS,
        code: "insufficient_collectors",
        severity: PROJECT_FINDING_SEVERITIES.MEDIUM,
        title: "Project assessment has insufficient evidence",
        description: "Only a small subset of project intelligence collectors produced evidence.",
        evidence: [{ source: "project-intelligence", signal: `${sourceCount} collector sources` }],
        confidence: 0.9,
      });
      this.stats.insufficientAnalyses += 1;
      this.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_ANALYSIS_INSUFFICIENT, { projectId, sourceCount });
    }
    return {
      projectId,
      records: dedupeBy(records, evidenceRecordKey),
      findings: dedupeBy(findings, (finding) => finding.id),
      sourceCount,
      collectedAt: new Date().toISOString(),
    };
  }

  addAssessment(projectId, assessment, options = {}) {
    const list = this.assessments.get(projectId) || [];
    list.push(assessment);
    while (list.length > this.bounds.maximumHistoricalAssessments) list.shift();
    this.assessments.set(projectId, list);
    if (!options.silent) {
      for (const score of Object.values(assessment.scores)) {
        this.scoreExplanations.set(`${assessment.id}:${score.domain}`, {
          assessmentId: assessment.id,
          domain: score.domain,
          baseline: score.metadata.baseline || 70,
          additions: score.metadata.additions || [],
          deductions: score.deductions || [],
          caps: score.metadata.caps || [],
          evidence: score.evidence,
          confidenceCalculation: score.metadata.confidenceCalculation || {},
          value: score.value,
        });
      }
    }
  }

  requireAssessment(projectId, options = {}) {
    return this.getAssessment(projectId) || this.assessProject(projectId, options);
  }

  recalculateStats() {
    const assessments = Array.from(this.assessments.values()).flat();
    const findings = assessments.flatMap((assessment) => assessment.findings);
    this.stats.findings = findings.length;
    this.stats.blockers = assessments.reduce((total, assessment) => total + assessment.blockers.length, 0);
    this.stats.risks = assessments.reduce((total, assessment) => total + assessment.risks.length, 0);
    this.stats.technicalDebtItems = assessments.reduce((total, assessment) => total + assessment.technicalDebt.length, 0);
    this.stats.recommendations = assessments.reduce((total, assessment) => total + assessment.nextActions.length, 0);
    this.stats.readinessLevels = {};
    for (const assessment of assessments) this.stats.readinessLevels[assessment.releaseReadiness.level] = (this.stats.readinessLevels[assessment.releaseReadiness.level] || 0) + 1;
    this.stats.averageConfidence = average(assessments.map((assessment) => assessment.confidence));
    this.stats.averageCompleteness = average(assessments.map((assessment) => assessment.completeness));
  }

  emitLifecycle(type, payload = {}) {
    this.emit(PROJECT_INTELLIGENCE_EVENTS.LIFECYCLE, {
      type,
      timestamp: new Date().toISOString(),
      schemaVersion: PROJECT_INTELLIGENCE_SCHEMA_VERSION,
      ...payload,
    });
  }
}

function buildProfile(engine, projectId, evidence, options) {
  const packageRecord = latestRecord(evidence.records, "package_manifest");
  const packageJson = packageRecord && packageRecord.value;
  const summary = latestRecord(evidence.records, "project_summary")?.value;
  const docs = evidence.records.filter((record) => record.type === "documentation").map((record) => record.value);
  const codeSnapshot = latestRecord(evidence.records, "code_understanding")?.value;
  const architecture = latestRecord(evidence.records, "architecture_view")?.value || {};
  const decisions = evidence.records.filter((record) => record.source === "durable_decision" || record.type === "durable_decision").map((record) => record.value);
  const nameEvidence = [
    packageJson && packageJson.name ? evidenceEntry("package.json", "package name", AUTHORITY.explicit_specification) : null,
    summary && summary.root ? evidenceEntry(".", "repository root", AUTHORITY.repository_state) : null,
  ].filter(Boolean);
  const name = options.name || packageJson?.name || path.basename(summary?.root || engine.repositoryPath || process.cwd());
  const description = options.description || packageJson?.description || firstReadmeDescription(docs) || `Project ${name}`;
  const classification = classifyProject({ packageJson, summary, docs, codeSnapshot });
  const lifecycleStage = inferLifecycleStage({ evidence, codeSnapshot, packageJson });
  const objectives = synthesizeObjectives(evidence, engine.bounds.maximumObjectives);
  const languages = uniqueSorted([
    ...namesFromSummary(summary && summary.languages),
    ...Object.keys(codeSnapshot?.stats?.languages || {}),
  ]);
  const frameworks = uniqueSorted(namesFromSummary(summary && summary.frameworks));
  const packages = uniqueSorted([
    ...dependencyNames(summary && summary.dependencies),
    ...Object.keys(packageJson?.dependencies || {}),
    ...Object.keys(packageJson?.devDependencies || {}),
  ]);
  return {
    id: `project-profile:${stableHash({ projectId, name })}`,
    projectId,
    name,
    description,
    classification,
    lifecycleStage,
    objectives,
    users: normalizeStringArray(options.users || inferredUsers(docs)),
    domains: uniqueSorted([classification.primary, ...classification.secondary, ...domainHints(docs)].filter(Boolean)),
    languages,
    frameworks,
    packages,
    entryPoints: uniqueSorted([...(summary?.entryPoints || []).map((entry) => entry.name || entry.value).filter(Boolean), ...(architecture.entryPoints || []).map((entry) => entry.path || entry.name).filter(Boolean)]),
    architectureStyle: architectureStyleFrom(architecture, docs),
    modules: normalizeArchitectureEntities(architecture.modules || codeSnapshot?.entities?.filter((entity) => ["MODULE", "FILE"].includes(entity.type)) || []),
    externalIntegrations: normalizeArchitectureEntities(architecture.externalIntegrations || codeSnapshot?.entities?.filter((entity) => entity.type === "DEPENDENCY") || []),
    persistenceSystems: normalizeArchitectureEntities(architecture.persistenceBoundaries || []),
    deploymentTargets: deploymentTargets(packageJson, summary, docs),
    constraints: uniqueSorted([...options.constraints || [], ...constraintsFromDocs(docs), ...decisions.map(decisionText).filter(Boolean)]),
    conventions: uniqueSorted(conventionsFromKnowledge(evidence)),
    decisions: decisions.map(normalizeDecision),
    metadata: {
      evidence: nameEvidence,
      classificationEvidence: classification.evidence,
      sourceCount: evidence.sourceCount,
      secondaryClassifications: classification.secondary,
    },
    createdAt: normalizeTimestamp(options.createdAt),
    updatedAt: normalizeTimestamp(options.updatedAt),
  };
}

function buildAssessment(engine, projectId, profile, evidence, options) {
  const createdAt = normalizeTimestamp(options.createdAt);
  const codeSnapshot = latestRecord(evidence.records, "code_understanding")?.value;
  const architectureView = latestRecord(evidence.records, "architecture_view")?.value || {};
  const planning = latestRecord(evidence.records, "planning")?.value;
  const context = latestRecord(evidence.records, "context")?.value;
  const learning = latestRecord(evidence.records, "learning")?.value;
  const validationResults = evidence.records.filter((record) => record.type === "validation_result").map((record) => record.value);
  const securityFindings = evidence.records.filter((record) => record.type === "security_finding").map((record) => record.value);
  const executionHistory = evidence.records.filter((record) => record.type === "execution_history").map((record) => record.value);
  const repairHistory = evidence.records.filter((record) => record.type === "repair_history").map((record) => record.value);
  const approvalHistory = evidence.records.filter((record) => record.type === "approval_history").map((record) => record.value);
  const completionEvidence = evidence.records.filter((record) => record.type === "completion_evidence").map((record) => record.value);
  const features = synthesizeFeatures(planning, codeSnapshot, validationResults, completionEvidence, engine.bounds.maximumFeatures);
  const completedCapabilities = features.filter((feature) => [PROJECT_FEATURE_STATES.VALIDATED, PROJECT_FEATURE_STATES.IMPLEMENTED].includes(feature.state));
  const incompleteCapabilities = features.filter((feature) => ![PROJECT_FEATURE_STATES.VALIDATED, PROJECT_FEATURE_STATES.IMPLEMENTED, PROJECT_FEATURE_STATES.REMOVED].includes(feature.state));
  const findings = [];
  for (const finding of evidence.findings) findings.push(finding);
  findings.push(...detectConflicts(profile, evidence, validationResults, securityFindings));
  const technicalDebt = boundedTechnicalDebt(detectTechnicalDebt(codeSnapshot, architectureView, profile), engine.bounds.maximumTechnicalDebtItems);
  const blockers = boundedBlockers(detectBlockers(planning, validationResults, securityFindings, executionHistory, approvalHistory, evidence), engine.bounds.maximumBlockers);
  const risks = boundedRisks(detectRisks(profile, architectureView, codeSnapshot, securityFindings, validationResults, technicalDebt, evidence), engine.bounds.maximumRisks);
  for (const blocker of blockers) findings.push(findingFromBlocker(blocker, projectId));
  for (const risk of risks) findings.push(findingFromRisk(risk, projectId));
  for (const debt of technicalDebt) findings.push(findingFromDebt(debt, projectId));
  const dedupedFindings = dedupeBy(findings.map((finding) => normalizeFinding(finding, engine, projectId)), (finding) => finding.metadata.dedupeKey || finding.id).slice(0, engine.bounds.maximumFindings);
  const confidence = calculateConfidence(evidence, dedupedFindings, validationResults);
  const completeness = calculateCompleteness(evidence, profile, features, dedupedFindings);
  const scoreContext = { profile, evidence, codeSnapshot, architectureView, planning, context, learning, validationResults, securityFindings, executionHistory, repairHistory, completionEvidence, technicalDebt, blockers, risks, findings: dedupedFindings, confidence, completeness };
  const scores = calculateScores(engine, scoreContext);
  const releaseReadiness = calculateReleaseReadiness(engine, scoreContext, scores);
  const nextActions = boundedRecommendations(recommendNextActions({ blockers, risks, technicalDebt, features, validationResults, securityFindings, releaseReadiness, confidence }), engine.bounds.maximumRecommendations);
  const status = assessmentStatus({ blockers, findings: dedupedFindings, confidence, completeness, releaseReadiness });
  const assessment = {
    id: `project-assessment:${stableHash({ projectId, profileId: profile.id, createdAt, findings: dedupedFindings.map((finding) => finding.id), readiness: releaseReadiness.level })}`,
    projectId,
    profileId: profile.id,
    summary: assessmentSummary(profile, releaseReadiness, scores, blockers, risks),
    currentState: {
      intended: profile.objectives,
      implemented: completedCapabilities,
      active: incompleteCapabilities.filter((feature) => [PROJECT_FEATURE_STATES.IN_PROGRESS, PROJECT_FEATURE_STATES.READY].includes(feature.state)),
      blocked: incompleteCapabilities.filter((feature) => feature.state === PROJECT_FEATURE_STATES.BLOCKED),
    },
    completedCapabilities,
    incompleteCapabilities,
    blockers,
    risks,
    technicalDebt,
    findings: dedupedFindings,
    recommendations: nextActions,
    nextActions,
    scores,
    releaseReadiness,
    confidence,
    completeness,
    evidence: limitEvidence(evidence.records.flatMap((record) => record.evidence), engine.bounds.maximumEvidencePerConclusion * 4),
    status,
    metadata: {
      sourceCount: evidence.sourceCount,
      limitations: limitationsFor(evidence, completeness, confidence),
      approvalHistory,
      repairHistory,
      completionEvidence,
    },
    createdAt,
  };
  emitAssessmentEvents(engine, assessment);
  maybePublishAdapters(engine, assessment, profile);
  return assessment;
}

function classifyProject(input) {
  const candidates = [];
  const pkg = input.packageJson || {};
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const files = (input.summary?.files || []).map((file) => file.path || "");
  const docText = (input.docs || []).map((doc) => `${doc.path} ${doc.content}`).join(" ").toLowerCase();
  const add = (classification, confidence, evidence) => candidates.push({ classification, confidence, evidence });
  if (pkg.bin) add(PROJECT_CLASSIFICATIONS.CLI, 0.9, [evidenceEntry("package.json", "bin entry", AUTHORITY.explicit_specification)]);
  if (pkg.engines?.vscode || deps.vscode || deps["@types/vscode"]) add(PROJECT_CLASSIFICATIONS.IDE_EXTENSION, 0.9, [evidenceEntry("package.json", "VS Code extension metadata", AUTHORITY.explicit_specification)]);
  if (deps.electron) add(PROJECT_CLASSIFICATIONS.DESKTOP_APPLICATION, 0.82, [evidenceEntry("package.json", "electron dependency", AUTHORITY.explicit_specification)]);
  if (deps.next || deps.react || deps.vite || files.some((file) => /^(pages|app)\//.test(file))) add(PROJECT_CLASSIFICATIONS.WEB_APPLICATION, 0.76, [evidenceEntry("repository", "web framework evidence", AUTHORITY.repository_state)]);
  if (deps.express || deps.fastify || files.some((file) => /routes?|api/.test(file))) add(PROJECT_CLASSIFICATIONS.API_SERVICE, 0.72, [evidenceEntry("repository", "API route evidence", AUTHORITY.repository_state)]);
  if (pkg.workspaces || files.some((file) => /^packages\//.test(file))) add(PROJECT_CLASSIFICATIONS.MONOREPO, 0.82, [evidenceEntry("package.json", "workspace evidence", AUTHORITY.explicit_specification)]);
  if (/\b(ai|agent|model|llm|autonomous)\b/.test(`${pkg.name || ""} ${pkg.description || ""} ${docText}`)) add(PROJECT_CLASSIFICATIONS.AI_AGENT, 0.68, [evidenceEntry("documentation", "AI terminology", AUTHORITY.documentation)]);
  if (/\b(platform|core)\b/.test(`${pkg.name || ""} ${pkg.description || ""} ${docText}`) && candidates.some((entry) => entry.classification === PROJECT_CLASSIFICATIONS.AI_AGENT)) add(PROJECT_CLASSIFICATIONS.AI_PLATFORM, 0.7, [evidenceEntry("documentation", "AI platform terminology", AUTHORITY.documentation)]);
  if (files.length > 0 && files.every((file) => /\.(md|txt)$/i.test(file))) add(PROJECT_CLASSIFICATIONS.DOCUMENTATION_PROJECT, 0.75, [evidenceEntry("repository", "documentation-only files", AUTHORITY.repository_state)]);
  if (Object.keys(deps).length > 0 && !candidates.length) add(PROJECT_CLASSIFICATIONS.LIBRARY, 0.45, [evidenceEntry("package.json", "package manifest", AUTHORITY.heuristic)]);
  const sorted = candidates.sort((left, right) =>
    right.confidence - left.confidence ||
    classificationPriority(right.classification) - classificationPriority(left.classification) ||
    left.classification.localeCompare(right.classification));
  const primary = sorted[0] || { classification: PROJECT_CLASSIFICATIONS.UNKNOWN, confidence: 0.2, evidence: [evidenceEntry("project-intelligence", "no classification evidence", AUTHORITY.heuristic)] };
  return {
    primary: primary.classification,
    secondary: uniqueSorted(sorted.slice(1).map((entry) => entry.classification)),
    confidence: primary.confidence,
    evidence: sorted.flatMap((entry) => entry.evidence),
  };
}

function inferLifecycleStage(input) {
  const validations = input.evidence.records.filter((record) => record.type === "validation_result").map((record) => record.value);
  const security = input.evidence.records.filter((record) => record.type === "security_finding").map((record) => record.value);
  const plans = input.evidence.records.find((record) => record.type === "planning")?.value?.plans || [];
  const completions = input.evidence.records.filter((record) => record.type === "completion_evidence").map((record) => record.value);
  const hasTests = input.codeSnapshot?.entities?.some((entity) => entity.type === "TEST") || false;
  const failedValidation = validations.some((entry) => entry.passed === false || entry.status === "failed" || entry.status === "FAILED");
  const criticalSecurity = security.some((entry) => ["CRITICAL", "HIGH"].includes(entry.severity) && !["RESOLVED", "DISMISSED"].includes(entry.status));
  if (/deprecated/i.test(`${input.packageJson?.description || ""}`)) return PROJECT_LIFECYCLE_STAGES.DEPRECATED;
  if (plans.some((plan) => plan.status === "BLOCKED") || failedValidation || criticalSecurity) return PROJECT_LIFECYCLE_STAGES.HARDENING;
  if (completions.length > 0 && hasTests && validations.some((entry) => entry.passed === true || entry.status === "PASSED")) return PROJECT_LIFECYCLE_STAGES.RELEASE_CANDIDATE;
  if (plans.some((plan) => plan.status === "ACTIVE" || plan.status === "READY")) return PROJECT_LIFECYCLE_STAGES.MVP_BUILD;
  if (input.codeSnapshot?.entities?.length > 0) return PROJECT_LIFECYCLE_STAGES.PROTOTYPE;
  return PROJECT_LIFECYCLE_STAGES.DISCOVERY;
}

function classificationPriority(classification) {
  return {
    [PROJECT_CLASSIFICATIONS.AI_PLATFORM]: 100,
    [PROJECT_CLASSIFICATIONS.IDE_EXTENSION]: 95,
    [PROJECT_CLASSIFICATIONS.DESKTOP_APPLICATION]: 90,
    [PROJECT_CLASSIFICATIONS.WEB_APPLICATION]: 85,
    [PROJECT_CLASSIFICATIONS.API_SERVICE]: 80,
    [PROJECT_CLASSIFICATIONS.BACKEND_SERVICE]: 78,
    [PROJECT_CLASSIFICATIONS.MOBILE_APPLICATION]: 76,
    [PROJECT_CLASSIFICATIONS.MULTI_SERVICE_SYSTEM]: 74,
    [PROJECT_CLASSIFICATIONS.MONOREPO]: 72,
    [PROJECT_CLASSIFICATIONS.AI_AGENT]: 70,
    [PROJECT_CLASSIFICATIONS.CLI]: 65,
    [PROJECT_CLASSIFICATIONS.AUTOMATION]: 60,
    [PROJECT_CLASSIFICATIONS.DATA_PIPELINE]: 55,
    [PROJECT_CLASSIFICATIONS.INFRASTRUCTURE]: 50,
    [PROJECT_CLASSIFICATIONS.LIBRARY]: 45,
    [PROJECT_CLASSIFICATIONS.DOCUMENTATION_PROJECT]: 40,
    [PROJECT_CLASSIFICATIONS.UNKNOWN]: 0,
  }[classification] || 0;
}

function synthesizeObjectives(evidence, limit) {
  const objectives = [];
  for (const record of evidence.records) {
    if (record.type === "current_instruction") objectives.push(objectiveFrom(record.value, "active", "current_instruction", record));
    if (record.type === "planning") {
      for (const plan of record.value.plans || []) objectives.push(objectiveFrom(plan.objective, planStatusObjectiveState(plan.status), "accepted_plan", record, { planId: plan.id }));
    }
    if (record.type === "completion_evidence") objectives.push(objectiveFrom(record.value.objective || record.value.summary || "Completed objective", "completed", "completion_evidence", record));
    if (record.type === "documentation") {
      const lines = String(record.value.content || "").split(/\r?\n/).filter((line) => /\b(objective|goal|purpose|accomplish)\b/i.test(line)).slice(0, 3);
      for (const line of lines) objectives.push(objectiveFrom(line.replace(/^#+\s*/, ""), "intended", "documentation", record));
    }
  }
  return dedupeBy(objectives.filter((entry) => entry.text), (entry) => `${entry.state}:${entry.text.toLowerCase()}`).slice(0, limit);
}

function synthesizeFeatures(planning, codeSnapshot, validationResults, completionEvidence, limit) {
  const features = [];
  for (const plan of planning?.plans || []) {
    for (const task of plan.tasks || []) {
      features.push({
        id: `feature:${stableHash({ planId: plan.id, taskId: task.id })}`,
        name: task.title || task.id,
        state: featureStateFromTask(task, validationResults, completionEvidence),
        taskIds: [task.id],
        planIds: [plan.id],
        evidence: [{ source: task.id, signal: `task status ${task.status}` }],
        confidence: task.confidence || 0.65,
        metadata: { acceptanceCriteria: task.acceptanceCriteria || [] },
      });
    }
  }
  for (const entity of codeSnapshot?.entities || []) {
    if (!["FUNCTION", "CLASS", "ROUTE", "ENDPOINT", "MODULE"].includes(entity.type)) continue;
    const existing = features.find((feature) => normalizeText(feature.name).includes(normalizeText(entity.name)) || normalizeText(entity.name).includes(normalizeText(feature.name)));
    if (!existing) {
      features.push({
        id: `feature:${stableHash({ entityId: entity.id })}`,
        name: entity.name,
        state: PROJECT_FEATURE_STATES.IMPLEMENTED,
        entityIds: [entity.id],
        evidence: [{ source: entity.path || entity.id, signal: "repository entity exists" }],
        confidence: 0.55,
        metadata: { implementedWithoutValidation: true },
      });
    }
  }
  return dedupeBy(features, (feature) => feature.id).slice(0, limit);
}

function detectBlockers(planning, validationResults, securityFindings, executionHistory, approvalHistory, evidence) {
  const blockers = [];
  for (const result of validationResults) {
    if (result.passed === false || ["FAILED", "failed"].includes(result.status)) {
      blockers.push(blocker(PROJECT_BLOCKER_CATEGORIES.FAILED_VALIDATION, PROJECT_FINDING_SEVERITIES.HIGH, "Validation failed", "A validation result indicates required checks are failing.", result.evidence || [{ source: result.id || "validation", signal: result.status || "failed validation" }], "Fix the failing validation and rerun checks.", 0.85));
    }
  }
  for (const finding of securityFindings) {
    if (["CRITICAL", "HIGH"].includes(finding.severity) && !["RESOLVED", "DISMISSED"].includes(finding.status)) {
      blockers.push(blocker(PROJECT_BLOCKER_CATEGORIES.SECURITY_CRITICAL, finding.severity, "Critical security finding", finding.title || "Open high-severity security finding blocks release readiness.", finding.evidence || [{ source: finding.id || "security", signal: finding.severity }], "Resolve or explicitly accept the security risk.", 0.9));
    }
  }
  for (const plan of planning?.plans || []) {
    if (plan.status === "BLOCKED") {
      blockers.push(blocker(PROJECT_BLOCKER_CATEGORIES.PLAN_BLOCKED, PROJECT_FINDING_SEVERITIES.HIGH, "Plan is blocked", `Plan ${plan.id} is blocked.`, [{ source: plan.id, signal: "plan status BLOCKED" }], "Resolve the blocking plan finding or replan.", 0.8));
    }
  }
  for (const entry of executionHistory) {
    if (entry.status === "FAILED" || entry.stopReason === "EXECUTION_FAILED") {
      blockers.push(blocker(PROJECT_BLOCKER_CATEGORIES.EXECUTION_FAILURE, PROJECT_FINDING_SEVERITIES.HIGH, "Execution failed", "Autonomous execution history contains a failed run.", entry.evidence || [{ source: entry.id || "execution", signal: entry.stopReason || entry.status }], "Inspect the failed execution and repair the failure.", 0.78));
    }
  }
  for (const approval of approvalHistory) {
    if (approval.status === "PENDING" || approval.decision === "REQUIRES_APPROVAL") {
      blockers.push(blocker(PROJECT_BLOCKER_CATEGORIES.APPROVAL_REQUIRED, PROJECT_FINDING_SEVERITIES.MEDIUM, "Approval required", "A pending approval blocks autonomous progress.", approval.evidence || [{ source: approval.id || "approval", signal: "pending approval" }], "Request or record the required approval.", 0.78));
    }
  }
  if (evidence.sourceCount < 2) {
    blockers.push(blocker(PROJECT_BLOCKER_CATEGORIES.MISSING_EVIDENCE, PROJECT_FINDING_SEVERITIES.MEDIUM, "Missing project evidence", "Project intelligence lacks enough collector sources for a confident assessment.", [{ source: "project-intelligence", signal: `${evidence.sourceCount} collector sources` }], "Refresh project analysis after graph, code, plan, or validation evidence is available.", 0.9));
  }
  return dedupeBy(blockers, (entry) => entry.id);
}

function detectRisks(profile, architectureView, codeSnapshot, securityFindings, validationResults, technicalDebt, evidence) {
  const risks = [];
  if ((architectureView.detectedCycles || []).length > 0) risks.push(risk(PROJECT_RISK_CATEGORIES.ARCHITECTURE, PROJECT_FINDING_SEVERITIES.MEDIUM, "Dependency cycles exist", "Architecture view reports dependency cycles.", [{ source: "code-understanding", signal: "detected cycles" }], 0.8));
  if ((architectureView.detectedCrossBoundaryViolations || []).length > 0) risks.push(risk(PROJECT_RISK_CATEGORIES.ARCHITECTURE, PROJECT_FINDING_SEVERITIES.MEDIUM, "Boundary violations exist", "Architecture view reports cross-boundary violations.", [{ source: "code-understanding", signal: "boundary violations" }], 0.8));
  if (securityFindings.some((finding) => ["CRITICAL", "HIGH"].includes(finding.severity))) risks.push(risk(PROJECT_RISK_CATEGORIES.SECURITY, PROJECT_FINDING_SEVERITIES.HIGH, "High security risk", "Open high-severity security findings are present.", [{ source: "security", signal: "high severity finding" }], 0.88));
  if (!codeSnapshot?.entities?.some((entity) => entity.type === "TEST")) risks.push(risk(PROJECT_RISK_CATEGORIES.TESTING, PROJECT_FINDING_SEVERITIES.MEDIUM, "Weak test evidence", "No test entities were found in code-understanding evidence.", [{ source: "code-understanding", signal: "no test entities" }], 0.65));
  if (!profile.deploymentTargets.length) risks.push(risk(PROJECT_RISK_CATEGORIES.RELEASE, PROJECT_FINDING_SEVERITIES.LOW, "No deployment evidence", "No deployment target was found.", [{ source: "project profile", signal: "empty deployment targets" }], 0.55));
  if (validationResults.some((result) => result.passed === false || result.status === "FAILED")) risks.push(risk(PROJECT_RISK_CATEGORIES.QUALITY, PROJECT_FINDING_SEVERITIES.HIGH, "Validation quality risk", "A validation result failed.", [{ source: "validation", signal: "failed validation" }], 0.86));
  if (technicalDebt.length > 0) risks.push(risk(PROJECT_RISK_CATEGORIES.MAINTAINABILITY, PROJECT_FINDING_SEVERITIES.MEDIUM, "Technical debt present", "Code-understanding findings indicate technical debt.", [{ source: "code-understanding", signal: "technical debt findings" }], 0.75));
  if (evidence.sourceCount < 3) risks.push(risk(PROJECT_RISK_CATEGORIES.DOCUMENTATION, PROJECT_FINDING_SEVERITIES.LOW, "Limited evidence coverage", "Few project intelligence sources were available.", [{ source: "project-intelligence", signal: "limited source count" }], 0.7));
  return dedupeBy(risks, (entry) => entry.id);
}

function detectTechnicalDebt(codeSnapshot, architectureView, profile) {
  const debt = [];
  for (const finding of codeSnapshot?.findings || []) {
    if (finding.code === "dead_code_candidate") debt.push(debtItem(PROJECT_DEBT_CATEGORIES.DEAD_CODE_CANDIDATE, PROJECT_FINDING_SEVERITIES.LOW, "Dead code candidate", finding.description, finding.evidence, PROJECT_EFFORT_CATEGORIES.SMALL, finding.confidence, finding.entityIds));
    if (finding.code === "unresolved_symbol") debt.push(debtItem(PROJECT_DEBT_CATEGORIES.UNRESOLVED_SYMBOL, PROJECT_FINDING_SEVERITIES.MEDIUM, "Unresolved symbol", finding.description, finding.evidence, PROJECT_EFFORT_CATEGORIES.MEDIUM, finding.confidence, finding.entityIds));
    if (finding.code === "circular_dependency") debt.push(debtItem(PROJECT_DEBT_CATEGORIES.CIRCULAR_DEPENDENCY, PROJECT_FINDING_SEVERITIES.MEDIUM, "Circular dependency", finding.description, finding.evidence, PROJECT_EFFORT_CATEGORIES.MEDIUM, finding.confidence, finding.entityIds));
    if (finding.code === "architecture_boundary_violation") debt.push(debtItem(PROJECT_DEBT_CATEGORIES.WEAK_BOUNDARY, PROJECT_FINDING_SEVERITIES.MEDIUM, "Weak architecture boundary", finding.description, finding.evidence, PROJECT_EFFORT_CATEGORIES.MEDIUM, finding.confidence, finding.entityIds));
  }
  if (!codeSnapshot?.relationships?.some((relationship) => relationship.type === "TESTS" || relationship.type === "TESTED_BY")) {
    debt.push(debtItem(PROJECT_DEBT_CATEGORIES.MISSING_TEST, PROJECT_FINDING_SEVERITIES.MEDIUM, "Missing test relationships", "No explicit test relationships were found.", [{ source: "code-understanding", signal: "no test relationships" }], PROJECT_EFFORT_CATEGORIES.MEDIUM, 0.6, []));
  }
  if (!profile.modules.length && !profile.architectureStyle) {
    debt.push(debtItem(PROJECT_DEBT_CATEGORIES.MISSING_DOCUMENTATION, PROJECT_FINDING_SEVERITIES.LOW, "Missing architecture evidence", "Architecture structure is not documented or visible enough for high confidence.", [{ source: "project profile", signal: "empty architecture style" }], PROJECT_EFFORT_CATEGORIES.SMALL, 0.55, []));
  }
  if ((architectureView.detectedCycles || []).length > 0) {
    debt.push(debtItem(PROJECT_DEBT_CATEGORIES.CIRCULAR_DEPENDENCY, PROJECT_FINDING_SEVERITIES.MEDIUM, "Architecture cycle", "Architecture view contains dependency cycles.", [{ source: "code-understanding", signal: "detected cycles" }], PROJECT_EFFORT_CATEGORIES.MEDIUM, 0.8, []));
  }
  return dedupeBy(debt, (entry) => entry.id);
}

function calculateScores(engine, context) {
  const scores = {};
  scores.architectureHealth = score("architectureHealth", [
    deduction(context.architectureView.detectedCycles?.length > 0, 18, "Architecture cycles detected", [{ source: "code-understanding", signal: "detected cycles" }]),
    deduction(context.architectureView.detectedCrossBoundaryViolations?.length > 0, 14, "Boundary violations detected", [{ source: "code-understanding", signal: "boundary violations" }]),
    addition(context.profile.modules.length > 0, 6, "Modules were identified", [{ source: "project profile", signal: "module evidence" }]),
  ], context.confidence);
  scores.codeHealth = score("codeHealth", [
    deduction(context.findings.some((finding) => finding.code.includes("unresolved")), 18, "Unresolved symbols detected", [{ source: "code-understanding", signal: "unresolved symbols" }]),
    deduction(context.findings.some((finding) => finding.code.includes("dead_code")), 8, "Dead-code candidates detected", [{ source: "code-understanding", signal: "dead code candidates" }]),
  ], context.confidence);
  scores.testingHealth = score("testingHealth", [
    deduction(!context.codeSnapshot?.entities?.some((entity) => entity.type === "TEST"), 25, "No test entities found", [{ source: "code-understanding", signal: "test entities" }]),
    deduction(context.validationResults.some((entry) => entry.passed === false || entry.status === "FAILED"), 30, "Validation failed", [{ source: "validation", signal: "failed validation" }]),
    addition(context.validationResults.some((entry) => entry.passed === true || entry.status === "PASSED"), 10, "Validation passed", [{ source: "validation", signal: "passed validation" }]),
  ], context.confidence);
  scores.securityPosture = score("securityPosture", [
    deduction(context.securityFindings.some((entry) => entry.severity === "CRITICAL"), 55, "Critical security finding open", [{ source: "security", signal: "critical finding" }]),
    deduction(context.securityFindings.some((entry) => entry.severity === "HIGH"), 35, "High security finding open", [{ source: "security", signal: "high finding" }]),
  ], context.confidence);
  scores.documentationHealth = score("documentationHealth", [
    deduction(!context.evidence.records.some((record) => record.type === "documentation"), 20, "No project documentation collector evidence", [{ source: "documentation", signal: "missing documentation" }]),
    addition(context.evidence.records.some((record) => record.type === "documentation"), 8, "Project documentation exists", [{ source: "documentation", signal: "documentation evidence" }]),
  ], context.confidence);
  scores.maintainability = score("maintainability", [
    deduction(context.technicalDebt.length > 0, Math.min(30, context.technicalDebt.length * 6), "Technical debt detected", [{ source: "project intelligence", signal: "technical debt" }]),
  ], context.confidence);
  scores.dependencyHealth = score("dependencyHealth", [
    deduction(context.profile.packages.length === 0, 10, "No dependency evidence", [{ source: "project profile", signal: "dependency evidence missing" }]),
    deduction(context.findings.some((finding) => finding.code.includes("stale")), 12, "Stale evidence affects dependency confidence", [{ source: "project intelligence", signal: "stale evidence" }]),
  ], context.confidence);
  scores.executionReliability = score("executionReliability", [
    deduction(context.executionHistory.some((entry) => entry.status === "FAILED" || entry.stopReason === "EXECUTION_FAILED"), 30, "Execution failures present", [{ source: "execution", signal: "failed execution" }]),
    deduction(context.repairHistory.filter((entry) => entry.result === "REPAIR_FAILED").length > 0, 15, "Repair failures present", [{ source: "repair", signal: "failed repair" }]),
    addition(context.executionHistory.some((entry) => entry.status === "COMPLETED"), 8, "Completed execution exists", [{ source: "execution", signal: "completed execution" }]),
  ], context.confidence);
  scores.planningHealth = score("planningHealth", [
    deduction(!context.planning?.plans?.length, 12, "No planning evidence", [{ source: "planning", signal: "missing plans" }]),
    deduction(context.planning?.plans?.some((plan) => plan.status === "BLOCKED"), 25, "Blocked plan exists", [{ source: "planning", signal: "blocked plan" }]),
  ], context.confidence);
  scores.contextQuality = score("contextQuality", [
    deduction(!context.context?.packages?.length, 10, "No context package evidence", [{ source: "context", signal: "missing context packages" }]),
    deduction(context.findings.some((finding) => finding.code.includes("conflict")), 20, "Context or project conflicts visible", [{ source: "project intelligence", signal: "conflict findings" }]),
  ], context.confidence);
  scores.technicalDebtHealth = score("technicalDebtHealth", [
    deduction(context.technicalDebt.length > 0, Math.min(45, context.technicalDebt.length * 8), "Technical debt items exist", [{ source: "project intelligence", signal: "technical debt" }]),
  ], context.confidence);
  scores.releaseReadiness = score("releaseReadiness", [
    deduction(context.blockers.length > 0, Math.min(60, context.blockers.length * 18), "Release blockers exist", [{ source: "project intelligence", signal: "blockers" }]),
    deduction(context.confidence < engine.bounds.minimumReadyConfidence, 15, "Confidence below ready threshold", [{ source: "project intelligence", signal: "confidence threshold" }]),
    addition(context.completionEvidence.length > 0, 10, "Objective completion evidence exists", [{ source: "completion", signal: "completion evidence" }]),
  ], context.confidence);
  scores.overallHealth = overallScore(scores, engine.weights, context);
  for (const value of Object.values(scores)) {
    engine.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_SCORE_CALCULATED, { domain: value.domain, value: value.value });
  }
  return scores;
}

function score(domain, factors, confidence) {
  const baseline = 70;
  const additions = factors.filter((factor) => factor && factor.kind === "addition");
  const deductions = factors.filter((factor) => factor && factor.kind === "deduction");
  const value = clampScore(baseline + additions.reduce((total, item) => total + item.value, 0) - deductions.reduce((total, item) => total + item.value, 0));
  const scoreEvidence = limitEvidence([...additions, ...deductions].flatMap((factor) => factor.evidence), 12);
  return {
    domain,
    value,
    confidence: normalizeScore(confidence, 0.6),
    evidence: scoreEvidence.length > 0 ? scoreEvidence : [{ source: "project-intelligence", signal: `${domain} baseline score` }],
    deductions: deductions.map((item) => ({ reason: item.reason, value: item.value, evidence: item.evidence })),
    metadata: { baseline, additions: additions.map((item) => ({ reason: item.reason, value: item.value, evidence: item.evidence })) },
  };
}

function overallScore(scores, weights, context) {
  let weighted = 0;
  let totalWeight = 0;
  for (const [domain, weight] of Object.entries(weights)) {
    if (!scores[domain]) continue;
    weighted += scores[domain].value * weight;
    totalWeight += weight;
  }
  const caps = [];
  let value = totalWeight > 0 ? weighted / totalWeight : 0;
  if (context.securityFindings.some((entry) => entry.severity === "CRITICAL")) {
    value = Math.min(value, 45);
    caps.push({ reason: "open critical security issue caps overall health", value: 45 });
  }
  if (context.validationResults.some((entry) => entry.passed === false || entry.status === "FAILED")) {
    value = Math.min(value, 60);
    caps.push({ reason: "failed required validation caps overall health", value: 60 });
  }
  if (context.confidence < 0.5) {
    value = Math.min(value, 65);
    caps.push({ reason: "insufficient evidence caps health confidence", value: 65 });
  }
  return {
    domain: "overallHealth",
    value: clampScore(value),
    confidence: context.confidence,
    evidence: limitEvidence(Object.values(scores).flatMap((score) => score.evidence), 12),
    deductions: caps.map((cap) => ({ reason: cap.reason, value: cap.value, evidence: [] })),
    metadata: { baseline: 70, weights, caps },
  };
}

function calculateReleaseReadiness(engine, context, scores) {
  const caps = [];
  let level = PROJECT_READINESS_LEVELS.UNKNOWN;
  if (hasCriticalBlocker(context) || hasCriticalSecurity(context)) {
    level = PROJECT_READINESS_LEVELS.NOT_READY;
    caps.push({ reason: "critical blocker or security finding", level });
  } else if (context.validationResults.some((entry) => entry.passed === false || entry.status === "FAILED")) {
    level = PROJECT_READINESS_LEVELS.NOT_READY;
    caps.push({ reason: "failed required validation", level });
  } else if (context.confidence < engine.bounds.minimumReadyConfidence) {
    level = scores.releaseReadiness.value >= 70 ? PROJECT_READINESS_LEVELS.READY_WITH_RISK : PROJECT_READINESS_LEVELS.EARLY;
    caps.push({ reason: "confidence below configured minimum", level });
  } else if (context.blockers.length > 0) {
    level = PROJECT_READINESS_LEVELS.EARLY;
  } else if (scores.releaseReadiness.value >= 88 && context.completionEvidence.length > 0) {
    level = PROJECT_READINESS_LEVELS.READY;
  } else if (scores.releaseReadiness.value >= 76) {
    level = PROJECT_READINESS_LEVELS.RELEASE_CANDIDATE;
  } else if (scores.releaseReadiness.value >= 62) {
    level = PROJECT_READINESS_LEVELS.MVP_CANDIDATE;
  } else {
    level = PROJECT_READINESS_LEVELS.EARLY;
  }
  const readiness = {
    id: `release-readiness:${stableHash({ level, blockers: context.blockers.map((entry) => entry.id), confidence: context.confidence })}`,
    level,
    score: scores.releaseReadiness.value,
    confidence: context.confidence,
    blockers: context.blockers.map((entry) => entry.id),
    caps,
    evidence: limitEvidence([
      ...context.validationResults.flatMap((entry) => entry.evidence || []),
      ...context.securityFindings.flatMap((entry) => entry.evidence || []),
      ...context.completionEvidence.flatMap((entry) => entry.evidence || []),
    ], 10),
    metadata: { minimumReadyConfidence: engine.bounds.minimumReadyConfidence },
  };
  engine.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_READINESS_CALCULATED, { level, score: readiness.score });
  return readiness;
}

function recommendNextActions(input) {
  const actions = [];
  for (const blocker of input.blockers) {
    actions.push(action(actionTypeForBlocker(blocker), blocker.title, blocker.possibleResolution, blocker.evidence, priorityForSeverity(blocker.severity) + 40, blocker.confidence, { blockerId: blocker.id, releaseCriticality: true }));
  }
  for (const finding of input.securityFindings.filter((entry) => ["CRITICAL", "HIGH"].includes(entry.severity))) {
    actions.push(action(PROJECT_ACTION_TYPES.RESOLVE_SECURITY_FINDING, finding.title || "Resolve security finding", "Resolve or explicitly accept the security finding.", finding.evidence || [], priorityForSeverity(finding.severity) + 35, finding.confidence || 0.85, { securityFindingId: finding.id }));
  }
  for (const result of input.validationResults.filter((entry) => entry.passed === false || entry.status === "FAILED")) {
    actions.push(action(PROJECT_ACTION_TYPES.ADD_VALIDATION, "Fix failing validation", "Address the failed validation and rerun it.", result.evidence || [], 85, result.confidence || 0.82, { validationId: result.id }));
  }
  for (const feature of input.features.filter((entry) => [PROJECT_FEATURE_STATES.READY, PROJECT_FEATURE_STATES.IN_PROGRESS, PROJECT_FEATURE_STATES.PLANNED].includes(entry.state))) {
    actions.push(action(PROJECT_ACTION_TYPES.COMPLETE_TASK, `Complete ${feature.name}`, "Complete the next planned feature or task.", feature.evidence || [], 55, feature.confidence || 0.6, { taskIds: feature.taskIds || [] }));
  }
  for (const debt of input.technicalDebt) {
    actions.push(action(PROJECT_ACTION_TYPES.REDUCE_TECHNICAL_DEBT, debt.title, debt.remediation, debt.evidence, debt.severity === PROJECT_FINDING_SEVERITIES.MEDIUM ? 52 : 42, debt.confidence, { debtId: debt.id, effort: debt.effort }));
  }
  if ([PROJECT_READINESS_LEVELS.RELEASE_CANDIDATE, PROJECT_READINESS_LEVELS.READY_WITH_RISK].includes(input.releaseReadiness.level)) {
    actions.push(action(PROJECT_ACTION_TYPES.PREPARE_RELEASE, "Prepare release evidence", "Confirm validation, documentation, rollback, and acceptance evidence before release.", input.releaseReadiness.evidence, 50, input.releaseReadiness.confidence, { readinessLevel: input.releaseReadiness.level }));
  }
  if (actions.length === 0) actions.push(action(PROJECT_ACTION_TYPES.NO_ACTION, "No immediate project action", "No open blocker, risk, or readiness gap was detected from available evidence.", [{ source: "project-intelligence", signal: "no action evidence" }], 1, 0.5, {}));
  return dedupeBy(actions, (entry) => entry.id).sort((left, right) => right.priority - left.priority || left.type.localeCompare(right.type));
}

function detectConflicts(profile, evidence, validationResults, securityFindings) {
  const findings = [];
  const nameValues = evidence.records
    .filter((record) => ["package_manifest", "documentation"].includes(record.type))
    .map((record) => record.type === "package_manifest" ? record.value.name : projectNameFromDoc(record.value))
    .filter(Boolean);
  if (uniqueSorted(nameValues).length > 1) findings.push(conflictFinding("duplicated_project_identity", "Project identity sources disagree.", nameValues.map((value) => ({ source: value, signal: "project name" }))));
  if (validationResults.some((result) => result.passed === false || result.status === "FAILED") && evidence.records.some((record) => record.type === "completion_evidence")) {
    findings.push(conflictFinding("validation_vs_completion_claim", "Completion evidence conflicts with failed validation.", [{ source: "validation", signal: "failed validation with completion claim" }]));
  }
  if (securityFindings.some((finding) => finding.severity === "CRITICAL") && evidence.records.some((record) => record.type === "completion_evidence")) {
    findings.push(conflictFinding("release_claim_vs_security_state", "Completion or release evidence conflicts with critical security state.", [{ source: "security", signal: "critical security finding" }]));
  }
  const docArchitecture = evidence.records.filter((record) => record.type === "documentation" && /architecture/i.test(record.value.content || ""));
  if (docArchitecture.length > 0 && profile.modules.length === 0) {
    findings.push(conflictFinding("architecture_description_vs_graph", "Documentation mentions architecture but graph/code evidence lacks modules.", docArchitecture.flatMap((record) => record.evidence)));
  }
  for (const record of evidence.records) {
    if (isStale(record.timestamp)) findings.push(conflictFinding("stale_source_conflict", `Evidence from ${record.source} appears stale.`, record.evidence, PROJECT_FINDING_STATUSES.STALE));
  }
  return findings;
}

function normalizeProfile(input, engine) {
  const timestamp = normalizeTimestamp(input.updatedAt || input.createdAt);
  return {
    id: input.id || `project-profile:${stableHash({ projectId: input.projectId, name: input.name })}`,
    projectId: requiredString(input.projectId || engine.projectId || "default", "Project profile projectId is required."),
    name: requiredString(input.name, "Project profile name is required."),
    description: requiredString(input.description || "No description available.", "Project profile description is required."),
    classification: normalizeClassification(input.classification || {}),
    lifecycleStage: normalizeEnum(input.lifecycleStage || PROJECT_LIFECYCLE_STAGES.UNKNOWN, PROJECT_LIFECYCLE_STAGES, "project lifecycle stage"),
    objectives: safeArray(input.objectives).map(clonePlainObject),
    users: normalizeStringArray(input.users || []),
    domains: normalizeStringArray(input.domains || []),
    languages: normalizeStringArray(input.languages || []),
    frameworks: normalizeStringArray(input.frameworks || []),
    packages: normalizeStringArray(input.packages || []),
    entryPoints: normalizeStringArray(input.entryPoints || []),
    architectureStyle: input.architectureStyle || null,
    modules: safeArray(input.modules).map(clonePlainObject),
    externalIntegrations: safeArray(input.externalIntegrations).map(clonePlainObject),
    persistenceSystems: safeArray(input.persistenceSystems).map(clonePlainObject),
    deploymentTargets: normalizeStringArray(input.deploymentTargets || []),
    constraints: normalizeStringArray(input.constraints || []),
    conventions: normalizeStringArray(input.conventions || []),
    decisions: safeArray(input.decisions).map(clonePlainObject),
    metadata: clonePlainObject(input.metadata || {}),
    createdAt: normalizeTimestamp(input.createdAt || timestamp),
    updatedAt: timestamp,
  };
}

function normalizeAssessment(input, engine) {
  return {
    id: requiredString(input.id, "Project assessment id is required."),
    projectId: requiredString(input.projectId || engine.projectId || "default", "Project assessment projectId is required."),
    profileId: requiredString(input.profileId, "Project assessment profileId is required."),
    summary: requiredString(input.summary, "Project assessment summary is required."),
    currentState: clonePlainObject(input.currentState || {}),
    completedCapabilities: safeArray(input.completedCapabilities).map(clonePlainObject),
    incompleteCapabilities: safeArray(input.incompleteCapabilities).map(clonePlainObject),
    blockers: safeArray(input.blockers).map(clonePlainObject),
    risks: safeArray(input.risks).map(clonePlainObject),
    technicalDebt: safeArray(input.technicalDebt).map(clonePlainObject),
    findings: safeArray(input.findings).map((finding) => normalizeFinding(finding, engine, input.projectId)),
    recommendations: safeArray(input.recommendations || input.nextActions).map(clonePlainObject),
    nextActions: safeArray(input.nextActions || input.recommendations).map(clonePlainObject),
    scores: normalizeScores(input.scores || {}),
    releaseReadiness: clonePlainObject(input.releaseReadiness || { level: PROJECT_READINESS_LEVELS.UNKNOWN }),
    confidence: normalizeScore(input.confidence, 0.5),
    completeness: normalizeScore(input.completeness, 0.5),
    evidence: limitEvidence(safeArray(input.evidence), engine.bounds.maximumEvidencePerConclusion * 4),
    status: normalizeEnum(input.status || PROJECT_ASSESSMENT_STATUSES.PARTIAL, PROJECT_ASSESSMENT_STATUSES, "project assessment status"),
    metadata: clonePlainObject(input.metadata || {}),
    createdAt: normalizeTimestamp(input.createdAt),
  };
}

function normalizeScores(scores) {
  const normalized = {};
  for (const domain of Object.keys(PROJECT_SCORE_DOMAINS)) {
    const score = scores[domain] || { domain, value: 0, confidence: 0, evidence: [], deductions: [], metadata: {} };
    normalized[domain] = {
      domain,
      value: clampScore(score.value),
      confidence: normalizeScore(score.confidence, 0.5),
      evidence: safeArray(score.evidence).map(clonePlainObject),
      deductions: safeArray(score.deductions).map(clonePlainObject),
      metadata: clonePlainObject(score.metadata || {}),
    };
  }
  return normalized;
}

function normalizeFinding(input, engine, projectId) {
  const domain = normalizeEnum(input.domain || PROJECT_INTELLIGENCE_DOMAINS.QUALITY, PROJECT_INTELLIGENCE_DOMAINS, "project finding domain");
  const code = requiredString(input.code || "project_finding", "Project finding code is required.");
  const timestamp = normalizeTimestamp(input.updatedAt || input.createdAt);
  const dedupeKey = input.metadata?.dedupeKey || stableHash({ domain, code, title: input.title, evidence: input.evidence || [], entityIds: input.entityIds || [], taskIds: input.taskIds || [] });
  return {
    id: input.id || `project-finding:${dedupeKey}`,
    projectId: input.projectId || projectId || engine.projectId || "default",
    domain,
    code,
    severity: input.severity || PROJECT_FINDING_SEVERITIES.LOW,
    title: requiredString(input.title || code, "Project finding title is required."),
    description: requiredString(input.description || input.title || code, "Project finding description is required."),
    status: input.status || PROJECT_FINDING_STATUSES.OPEN,
    entityIds: normalizeStringArray(input.entityIds || []),
    relationshipIds: normalizeStringArray(input.relationshipIds || []),
    taskIds: normalizeStringArray(input.taskIds || []),
    planIds: normalizeStringArray(input.planIds || []),
    evidence: limitEvidence(safeArray(input.evidence), engine.bounds.maximumEvidencePerConclusion),
    confidence: normalizeScore(input.confidence, 0.6),
    recommendation: input.recommendation || null,
    metadata: { ...clonePlainObject(input.metadata || {}), dedupeKey },
    createdAt: normalizeTimestamp(input.createdAt || timestamp),
    updatedAt: timestamp,
  };
}

function normalizeEvidenceRecord(input, projectId) {
  const timestamp = normalizeTimestamp(input.timestamp || input.updatedAt || input.createdAt);
  return {
    id: input.id || `project-evidence:${stableHash({ source: input.source, type: input.type, value: evidenceValueFingerprint(input.value), timestamp })}`,
    source: requiredString(input.source || "unknown", "Project evidence source is required."),
    projectId: input.projectId || projectId || "default",
    type: input.type || "record",
    value: clonePlainObject(input.value === undefined ? input : input.value),
    authority: input.authority || "heuristic",
    authorityScore: AUTHORITY[input.authority] || AUTHORITY.heuristic,
    evidence: limitEvidence(safeArray(input.evidence), 10),
    version: input.version || null,
    timestamp,
    confidence: normalizeScore(input.confidence, AUTHORITY[input.authority] || 0.5),
    metadata: clonePlainObject(input.metadata || {}),
  };
}

function normalizeCollectorOutput(output, projectId) {
  if (!output) return { records: [], findings: [] };
  const list = Array.isArray(output) ? output : [output];
  const records = [];
  const findings = [];
  for (const entry of list) {
    if (Array.isArray(entry.records) || Array.isArray(entry.findings)) {
      records.push(...safeArray(entry.records).map((record) => ({ source: entry.source || record.source, projectId: entry.projectId || projectId, version: entry.version, timestamp: entry.timestamp, confidence: entry.confidence, metadata: entry.metadata, ...record })));
      findings.push(...safeArray(entry.findings));
    } else {
      records.push(entry);
    }
  }
  return { records, findings };
}

function normalizeCollectors(collectors) {
  return safeArray(collectors).filter(Boolean).map((collector) => {
    if (!collector || typeof collector.collect !== "function") throw new Error("Project intelligence collector requires collect().");
    return collector;
  });
}

function normalizeClassification(input) {
  const primary = normalizeEnum(input.primary || PROJECT_CLASSIFICATIONS.UNKNOWN, PROJECT_CLASSIFICATIONS, "project classification");
  return {
    primary,
    secondary: normalizeStringArray(input.secondary || []).filter((entry) => Object.values(PROJECT_CLASSIFICATIONS).includes(entry)),
    confidence: normalizeScore(input.confidence, primary === PROJECT_CLASSIFICATIONS.UNKNOWN ? 0.2 : 0.6),
    evidence: safeArray(input.evidence).map(clonePlainObject),
  };
}

function normalizeBounds(input) {
  return {
    ...DEFAULT_BOUNDS,
    ...Object.fromEntries(Object.entries(input || {}).filter(([, value]) => Number.isInteger(value) && value > 0)),
    minimumReadyConfidence: normalizeScore(input.minimumReadyConfidence, DEFAULT_BOUNDS.minimumReadyConfidence),
  };
}

function normalizeWeights(input) {
  const weights = { ...DEFAULT_WEIGHTS, ...Object.fromEntries(Object.entries(input || {}).filter(([, value]) => Number.isFinite(value) && value >= 0)) };
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, value / total]));
}

function emptyStats() {
  return {
    projectsAnalyzed: 0,
    profilesCreated: 0,
    assessmentsCreated: 0,
    assessmentsRefreshed: 0,
    findings: 0,
    blockers: 0,
    risks: 0,
    technicalDebtItems: 0,
    recommendations: 0,
    readinessLevels: {},
    averageConfidence: 0,
    averageCompleteness: 0,
    corruptedLoads: 0,
    partialAnalyses: 0,
    insufficientAnalyses: 0,
    lastAnalysis: null,
    lastRefresh: null,
  };
}

function emitAssessmentEvents(engine, assessment) {
  for (const finding of assessment.findings) {
    engine.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_FINDING_CREATED, { finding });
    if (finding.code.includes("conflict")) engine.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_CONFLICT_DETECTED, { finding });
  }
  for (const blocker of assessment.blockers) engine.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_BLOCKER_DETECTED, { blocker });
  for (const risk of assessment.risks) engine.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_RISK_DETECTED, { risk });
  for (const action of assessment.nextActions) engine.emitLifecycle(PROJECT_INTELLIGENCE_EVENT_TYPES.PROJECT_RECOMMENDATION_CREATED, { action });
}

function maybePublishAdapters(engine, assessment, profile) {
  if (engine.planningAdapter && typeof engine.planningAdapter.recordProjectEvidence === "function") {
    engine.planningAdapter.recordProjectEvidence({ profile: clonePlainObject(profile), assessment: clonePlainObject(assessment) });
  }
  if (engine.contextAdapter && typeof engine.contextAdapter.recordProjectContext === "function") {
    engine.contextAdapter.recordProjectContext(projectContextRecords(profile, assessment));
  }
}

function projectContextRecords(profile, assessment) {
  return [
    { source: "PROJECT_INTELLIGENCE", title: "Project summary", content: assessment.summary, metadata: { profileId: profile.id, assessmentId: assessment.id } },
    { source: "PROJECT_INTELLIGENCE", title: "Release readiness", content: assessment.releaseReadiness.level, metadata: assessment.releaseReadiness },
    { source: "PROJECT_INTELLIGENCE", title: "Blockers", content: stableSerialize(assessment.blockers), metadata: { count: assessment.blockers.length } },
    { source: "PROJECT_INTELLIGENCE", title: "Next actions", content: stableSerialize(assessment.nextActions), metadata: { count: assessment.nextActions.length } },
  ];
}

function deterministicProjectSummary(profile, assessment) {
  return {
    identity: `${profile.name}: ${profile.description}`,
    purpose: profile.objectives.map((objective) => `${objective.state}: ${objective.text}`),
    currentState: assessment.currentState,
    architecture: {
      style: profile.architectureStyle,
      modules: profile.modules.map((module) => module.name || module.path),
      integrations: profile.externalIntegrations.map((entry) => entry.name || entry.path),
    },
    completedWork: assessment.completedCapabilities.map((feature) => feature.name),
    incompleteWork: assessment.incompleteCapabilities.map((feature) => `${feature.state}: ${feature.name}`),
    blockers: assessment.blockers.map((blocker) => blocker.title),
    risks: assessment.risks.map((risk) => risk.title),
    health: {
      overall: assessment.scores.overallHealth.value,
      domains: Object.fromEntries(Object.entries(assessment.scores).map(([domain, score]) => [domain, score.value])),
    },
    releaseReadiness: assessment.releaseReadiness.level,
    nextActions: assessment.nextActions.map((action) => `${action.type}: ${action.title}`),
    confidenceAndEvidenceLimitations: {
      confidence: assessment.confidence,
      completeness: assessment.completeness,
      limitations: assessment.metadata.limitations || [],
    },
  };
}

function domainAssessment(assessment, domain) {
  return {
    domain,
    findings: assessment.findings.filter((finding) => finding.domain === domain),
    risks: assessment.risks.filter((risk) => risk.domain === domain || risk.category === domain),
    blockers: assessment.blockers.filter((blocker) => blocker.domain === domain),
    scores: Object.values(assessment.scores).filter((score) => score.domain.toLowerCase().includes(domain.toLowerCase().split("_")[0])),
    evidence: assessment.evidence,
  };
}

function readPackageManifest(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  } catch (error) {
    return null;
  }
}

function readProjectDocumentation(root) {
  return ["README.md", "ARCHITECTURE.md", "PRD.md", "docs/architecture.md"]
    .map((relativePath) => {
      try {
        return { path: relativePath, content: fs.readFileSync(path.join(root, relativePath), "utf8") };
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
}

function snapshotFor(input) {
  if (!input) return null;
  if (typeof input.snapshot === "function") return input.snapshot();
  return input;
}

function recordsFrom(input) {
  if (!input) return [];
  if (typeof input.list === "function") return input.list();
  if (typeof input.snapshot === "function") return safeArray(input.snapshot().records || input.snapshot().findings || input.snapshot().assessments);
  return safeArray(input);
}

function addList(list, source, authority, confidence, add) {
  for (const value of list) add({ source, authority, type: source, value, evidence: value.evidence || [{ source, signal: value.id || value.status || source }], confidence });
}

function latestRecord(records, type) {
  return records.filter((record) => record.type === type).sort((left, right) => right.timestamp.localeCompare(left.timestamp))[0] || null;
}

function namesFromSummary(entries) {
  return safeArray(entries).map((entry) => entry.name || entry.value).filter(Boolean);
}

function dependencyNames(groups) {
  return safeArray(groups).flatMap((group) => safeArray(group.dependencies)).map((entry) => entry.name).filter(Boolean);
}

function firstReadmeDescription(docs) {
  const readme = docs.find((doc) => /readme/i.test(doc.path));
  if (!readme) return null;
  return String(readme.content || "").split(/\r?\n/).find((line) => line.trim() && !line.startsWith("#")) || null;
}

function inferredUsers(docs) {
  const text = docs.map((doc) => doc.content).join("\n").toLowerCase();
  if (/\bdeveloper|engineer|codex|agent\b/.test(text)) return ["developers"];
  return [];
}

function domainHints(docs) {
  const text = docs.map((doc) => doc.content).join("\n").toLowerCase();
  return ["security", "testing", "release", "automation", "ai"].filter((domain) => text.includes(domain));
}

function normalizeArchitectureEntities(entries) {
  return safeArray(entries).map((entry) => ({
    id: entry.id || stableHash(entry),
    name: entry.name || entry.qualifiedName || entry.path || "unknown",
    path: entry.path || null,
    type: entry.type || null,
    evidence: entry.evidence || entry.metadata?.evidence || [],
  })).sort((left, right) => left.name.localeCompare(right.name));
}

function architectureStyleFrom(architecture, docs) {
  if (architecture.dependencyLayers && architecture.dependencyLayers.length > 1) return "layered";
  const text = docs.map((doc) => doc.content).join("\n").toLowerCase();
  if (text.includes("event")) return "event-driven";
  if (text.includes("service")) return "service-oriented";
  if (text.includes("layer")) return "layered";
  return null;
}

function deploymentTargets(packageJson, summary, docs) {
  const values = [];
  const scripts = packageJson?.scripts || {};
  if (scripts.deploy) values.push("package script deploy");
  if ((summary?.files || []).some((file) => /Dockerfile|docker-compose|vercel\.json|netlify|fly\.toml|render\.yaml/.test(file.path))) values.push("deployment configuration");
  if (docs.some((doc) => /\bdeploy|deployment|release\b/i.test(doc.content))) values.push("documented deployment");
  return uniqueSorted(values);
}

function constraintsFromDocs(docs) {
  return docs.flatMap((doc) => String(doc.content || "").split(/\r?\n/).filter((line) => /\b(must|must not|required|constraint)\b/i.test(line)).slice(0, 8)).map((line) => line.trim());
}

function conventionsFromKnowledge(evidence) {
  const knowledge = latestRecord(evidence.records, "project_knowledge")?.value;
  return safeArray(knowledge?.categories?.codingConventions).map((fact) => stableReadable(fact.value)).filter((value) => value !== "UNKNOWN");
}

function normalizeDecision(decision) {
  return {
    id: decision.id || stableHash(decision),
    statement: decisionText(decision),
    status: decision.status || decision.confidenceState || "UNKNOWN",
    evidence: decision.evidence || decision.value?.evidence || decision.source?.evidence || [],
  };
}

function decisionText(decision) {
  return decision.statement || decision.value?.statement || decision.value?.value || decision.title || null;
}

function objectiveFrom(value, state, source, record, metadata = {}) {
  const text = typeof value === "string" ? value : value && (value.objective || value.title || value.summary);
  return {
    id: `objective:${stableHash({ text, state, source })}`,
    text: String(text || "").trim(),
    state,
    source,
    evidence: record.evidence || [],
    confidence: record.confidence || 0.6,
    metadata,
  };
}

function planStatusObjectiveState(status) {
  if (status === "COMPLETED") return "completed";
  if (status === "BLOCKED") return "blocked";
  if (status === "CANCELLED") return "abandoned";
  if (["ACTIVE", "READY", "DRAFT", "PLANNING"].includes(status)) return "active";
  return "intended";
}

function featureStateFromTask(task, validationResults, completionEvidence) {
  if (completionEvidence.some((entry) => safeArray(entry.completedTaskIds).includes(task.id))) return PROJECT_FEATURE_STATES.VALIDATED;
  if (task.status === "COMPLETED" && validationResults.some((entry) => entry.passed === true || entry.status === "PASSED")) return PROJECT_FEATURE_STATES.VALIDATED;
  if (task.status === "COMPLETED") return PROJECT_FEATURE_STATES.IMPLEMENTED;
  if (task.status === "RUNNING") return PROJECT_FEATURE_STATES.IN_PROGRESS;
  if (task.status === "READY") return PROJECT_FEATURE_STATES.READY;
  if (task.status === "BLOCKED") return PROJECT_FEATURE_STATES.BLOCKED;
  if (task.status === "FAILED") return PROJECT_FEATURE_STATES.FAILED;
  if (task.status === "SKIPPED") return PROJECT_FEATURE_STATES.DEFERRED;
  if (task.status === "CANCELLED") return PROJECT_FEATURE_STATES.REMOVED;
  return PROJECT_FEATURE_STATES.PLANNED;
}

function blocker(category, severity, title, description, evidence, possibleResolution, confidence) {
  return {
    id: `project-blocker:${stableHash({ category, title, evidence })}`,
    category,
    domain: PROJECT_INTELLIGENCE_DOMAINS.BLOCKERS,
    severity,
    title,
    description,
    affectedObjectives: [],
    affectedFeatures: [],
    evidence: safeArray(evidence),
    possibleResolution,
    confidence,
  };
}

function risk(category, severity, title, description, evidence, confidence) {
  return {
    id: `project-risk:${stableHash({ category, title, evidence })}`,
    category,
    domain: riskDomain(category),
    severity,
    title,
    description,
    evidence: safeArray(evidence),
    mitigation: mitigationForRisk(category),
    confidence,
  };
}

function debtItem(category, severity, title, description, evidence, effort, confidence, entityIds = []) {
  return {
    id: `project-debt:${stableHash({ category, title, entityIds, evidence })}`,
    category,
    severity,
    scope: entityIds.length > 0 ? "entity" : "project",
    affectedEntities: normalizeStringArray(entityIds),
    title,
    description,
    evidence: safeArray(evidence),
    remediation: remediationForDebt(category),
    estimatedImpact: severity === PROJECT_FINDING_SEVERITIES.MEDIUM ? "moderate maintainability impact" : "localized maintainability impact",
    effort,
    confidence,
  };
}

function action(type, title, description, evidence, priority, confidence, metadata) {
  return {
    id: `project-action:${stableHash({ type, title, evidence })}`,
    type,
    title,
    description,
    whyPrioritized: `${type} is prioritized from severity, validation, dependency, confidence, effort, and release-critical evidence.`,
    priority,
    evidence: safeArray(evidence),
    confidence,
    metadata,
  };
}

function findingFromBlocker(blocker, projectId) {
  return {
    projectId,
    domain: PROJECT_INTELLIGENCE_DOMAINS.BLOCKERS,
    code: blocker.category.toLowerCase(),
    severity: blocker.severity,
    title: blocker.title,
    description: blocker.description,
    evidence: blocker.evidence,
    confidence: blocker.confidence,
    recommendation: blocker.possibleResolution,
    metadata: { blockerId: blocker.id },
  };
}

function findingFromRisk(riskEntry, projectId) {
  return {
    projectId,
    domain: PROJECT_INTELLIGENCE_DOMAINS.RISKS,
    code: `risk_${riskEntry.category.toLowerCase()}`,
    severity: riskEntry.severity,
    title: riskEntry.title,
    description: riskEntry.description,
    evidence: riskEntry.evidence,
    confidence: riskEntry.confidence,
    recommendation: riskEntry.mitigation,
    metadata: { riskId: riskEntry.id },
  };
}

function findingFromDebt(debt, projectId) {
  return {
    projectId,
    domain: PROJECT_INTELLIGENCE_DOMAINS.TECHNICAL_DEBT,
    code: debt.category.toLowerCase(),
    severity: debt.severity,
    title: debt.title,
    description: debt.description,
    entityIds: debt.affectedEntities,
    evidence: debt.evidence,
    confidence: debt.confidence,
    recommendation: debt.remediation,
    metadata: { debtId: debt.id, effort: debt.effort },
  };
}

function conflictFinding(code, description, evidence, status = PROJECT_FINDING_STATUSES.OPEN) {
  return {
    domain: PROJECT_INTELLIGENCE_DOMAINS.CONFIDENCE,
    code,
    severity: PROJECT_FINDING_SEVERITIES.MEDIUM,
    title: code.replace(/_/g, " "),
    description,
    status,
    evidence,
    confidence: 0.75,
    recommendation: "Resolve the conflict or refresh stale evidence.",
  };
}

function calculateConfidence(evidence, findings, validationResults) {
  const sourceFactor = Math.min(1, evidence.sourceCount / 8);
  const authorityAverage = average(evidence.records.map((record) => record.authorityScore));
  const validationBoost = validationResults.some((entry) => entry.passed === true || entry.status === "PASSED") ? 0.08 : 0;
  const conflictPenalty = findings.filter((finding) => finding.code.includes("conflict")).length * 0.08;
  const heuristicPenalty = evidence.records.filter((record) => record.authority === "heuristic").length * 0.01;
  return normalizeScore(sourceFactor * 0.35 + authorityAverage * 0.45 + validationBoost + 0.2 - conflictPenalty - heuristicPenalty, 0.5);
}

function calculateCompleteness(evidence, profile, features, findings) {
  const required = ["project_summary", "package_manifest", "code_understanding", "planning", "validation_result", "security_finding", "documentation"];
  const present = new Set(evidence.records.map((record) => record.type));
  const coverage = required.filter((type) => present.has(type)).length / required.length;
  const profileCoverage = [profile.name, profile.description, profile.classification.primary !== PROJECT_CLASSIFICATIONS.UNKNOWN, profile.languages.length > 0, profile.modules.length > 0].filter(Boolean).length / 5;
  const featureCoverage = features.length > 0 ? 1 : 0.35;
  const penalty = findings.some((finding) => finding.code === "partial_collection" || finding.code === "insufficient_collectors") ? 0.15 : 0;
  return normalizeScore(coverage * 0.5 + profileCoverage * 0.3 + featureCoverage * 0.2 - penalty, 0.5);
}

function assessmentStatus(input) {
  if (input.findings.some((finding) => finding.code.includes("conflict"))) return PROJECT_ASSESSMENT_STATUSES.CONFLICTED;
  if (input.blockers.some((blocker) => ["CRITICAL", "HIGH"].includes(blocker.severity))) return PROJECT_ASSESSMENT_STATUSES.BLOCKED;
  if (input.completeness < 0.35) return PROJECT_ASSESSMENT_STATUSES.INSUFFICIENT_EVIDENCE;
  if (input.findings.some((finding) => finding.status === PROJECT_FINDING_STATUSES.STALE)) return PROJECT_ASSESSMENT_STATUSES.STALE;
  if ([PROJECT_READINESS_LEVELS.READY, PROJECT_READINESS_LEVELS.READY_WITH_RISK].includes(input.releaseReadiness.level)) return PROJECT_ASSESSMENT_STATUSES.READY;
  return PROJECT_ASSESSMENT_STATUSES.PARTIAL;
}

function assessmentSummary(profile, readiness, scores, blockers, risks) {
  return `${profile.name} is classified as ${profile.classification.primary} in ${profile.lifecycleStage}. Release readiness is ${readiness.level} with overall health ${scores.overallHealth.value}. ${blockers.length} blockers and ${risks.length} risks are visible from evidence.`;
}

function limitationsFor(evidence, completeness, confidence) {
  const limitations = [];
  if (evidence.sourceCount < 3) limitations.push("Limited collector coverage reduces confidence.");
  if (completeness < 0.75) limitations.push("Assessment completeness is partial.");
  if (confidence < 0.7) limitations.push("Conclusion confidence is below ready threshold.");
  return limitations;
}

function validationFinding(code, description) {
  return {
    code,
    severity: PROJECT_FINDING_SEVERITIES.MEDIUM,
    title: code.replace(/_/g, " "),
    description,
  };
}

function compareScores(first, second) {
  return Object.fromEntries(Object.keys(PROJECT_SCORE_DOMAINS).map((domain) => [domain, {
    from: first[domain]?.value || 0,
    to: second[domain]?.value || 0,
    delta: Number(((second[domain]?.value || 0) - (first[domain]?.value || 0)).toFixed(6)),
  }]));
}

function diffById(first, second) {
  const firstIds = new Set(first.map((entry) => entry.id));
  const secondIds = new Set(second.map((entry) => entry.id));
  return {
    added: second.filter((entry) => !firstIds.has(entry.id)),
    removed: first.filter((entry) => !secondIds.has(entry.id)),
  };
}

function diffByStable(first, second) {
  const firstSet = new Set(first.map(stableSerialize));
  const secondSet = new Set(second.map(stableSerialize));
  return {
    added: second.filter((entry) => !firstSet.has(stableSerialize(entry))),
    removed: first.filter((entry) => !secondSet.has(stableSerialize(entry))),
  };
}

function compareFeatureStates(first, second) {
  const before = new Map([...first.completedCapabilities, ...first.incompleteCapabilities].map((feature) => [feature.id, feature.state]));
  return [...second.completedCapabilities, ...second.incompleteCapabilities]
    .filter((feature) => before.has(feature.id) && before.get(feature.id) !== feature.state)
    .map((feature) => ({ id: feature.id, from: before.get(feature.id), to: feature.state }));
}

function evidenceEntry(source, signal, authority) {
  return { source, signal, authority };
}

function addition(condition, value, reason, evidence) {
  return condition ? { kind: "addition", value, reason, evidence } : null;
}

function deduction(condition, value, reason, evidence) {
  return condition ? { kind: "deduction", value, reason, evidence } : null;
}

function hasCriticalBlocker(assessmentOrContext) {
  return safeArray(assessmentOrContext.blockers).some((blocker) => blocker.severity === PROJECT_FINDING_SEVERITIES.CRITICAL || blocker.category === PROJECT_BLOCKER_CATEGORIES.SECURITY_CRITICAL);
}

function hasCriticalSecurity(assessmentOrContext) {
  return safeArray(assessmentOrContext.securityFindings).some((finding) => finding.severity === PROJECT_FINDING_SEVERITIES.CRITICAL) ||
    safeArray(assessmentOrContext.findings).some((finding) => finding.domain === PROJECT_INTELLIGENCE_DOMAINS.SECURITY && finding.severity === PROJECT_FINDING_SEVERITIES.CRITICAL);
}

function boundedBlockers(values, limit) { return values.slice(0, limit); }
function boundedRisks(values, limit) { return values.slice(0, limit); }
function boundedTechnicalDebt(values, limit) { return values.slice(0, limit); }
function boundedRecommendations(values, limit) { return values.slice(0, limit); }

function riskDomain(category) {
  if (PROJECT_INTELLIGENCE_DOMAINS[category]) return PROJECT_INTELLIGENCE_DOMAINS[category];
  if (category === PROJECT_RISK_CATEGORIES.RELEASE) return PROJECT_INTELLIGENCE_DOMAINS.RELEASE_READINESS;
  return PROJECT_INTELLIGENCE_DOMAINS.RISKS;
}

function mitigationForRisk(category) {
  return `Review ${category.toLowerCase()} evidence and address the highest-confidence risk first.`;
}

function remediationForDebt(category) {
  return `Reduce ${category.toLowerCase().replace(/_/g, " ")} with a targeted refactor or validation-backed cleanup.`;
}

function actionTypeForBlocker(blocker) {
  if (blocker.category === PROJECT_BLOCKER_CATEGORIES.SECURITY_CRITICAL) return PROJECT_ACTION_TYPES.RESOLVE_SECURITY_FINDING;
  if (blocker.category === PROJECT_BLOCKER_CATEGORIES.FAILED_VALIDATION) return PROJECT_ACTION_TYPES.ADD_VALIDATION;
  if (blocker.category === PROJECT_BLOCKER_CATEGORIES.APPROVAL_REQUIRED) return PROJECT_ACTION_TYPES.REQUEST_APPROVAL;
  if (blocker.category === PROJECT_BLOCKER_CATEGORIES.EXECUTION_FAILURE) return PROJECT_ACTION_TYPES.REPAIR_FAILURE;
  return PROJECT_ACTION_TYPES.FIX_BLOCKER;
}

function priorityForSeverity(severity) {
  return { CRITICAL: 60, HIGH: 45, MEDIUM: 30, LOW: 15, INFO: 5 }[severity] || 10;
}

function projectNameFromDoc(doc) {
  const heading = String(doc.content || "").split(/\r?\n/).find((line) => /^#\s+/.test(line));
  return heading ? heading.replace(/^#\s+/, "").trim() : null;
}

function isStale(timestamp) {
  const age = Date.now() - Date.parse(timestamp);
  return Number.isFinite(age) && age > 90 * 24 * 60 * 60 * 1000;
}

function evidenceValueFingerprint(value) {
  if (value && typeof value === "object") {
    return { id: value.id, status: value.status, name: value.name, title: value.title, path: value.path };
  }
  return value;
}

function limitEvidence(evidence, limit) {
  return dedupeBy(safeArray(evidence).filter(Boolean).map((entry) => {
    if (typeof entry === "string") return { source: entry, signal: "evidence" };
    return clonePlainObject(entry);
  }), stableSerialize).slice(0, limit);
}

function duplicateIds(values) {
  const ids = values.map((entry) => entry.id);
  return new Set(ids).size !== ids.length;
}

function validateSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) throw new Error("Project intelligence snapshot must be an object.");
  if (snapshot.schemaVersion !== PROJECT_INTELLIGENCE_SCHEMA_VERSION) throw new Error("Project intelligence snapshot schema version is unsupported.");
  if (!Array.isArray(snapshot.profiles) || !Array.isArray(snapshot.assessments)) throw new Error("Project intelligence snapshot requires profiles and assessments.");
}

function migrateSnapshot(snapshot, migrations) {
  let current = clonePlainObject(snapshot);
  for (const migration of migrations) if (typeof migration === "function") current = migration(current);
  return current;
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

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null) return new Date().toISOString();
  const timestamp = typeof value === "number" ? new Date(value).toISOString() : String(value);
  if (Number.isNaN(Date.parse(timestamp))) throw new Error("Project intelligence timestamp must be valid.");
  return timestamp;
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stableReadable(value) {
  if (typeof value === "string") return value;
  return stableSerialize(value);
}

function safeCall(callback) {
  try {
    return callback();
  } catch (error) {
    return null;
  }
}

function average(values) {
  const filtered = values.map(Number).filter(Number.isFinite);
  return filtered.length ? Number((filtered.reduce((sum, value) => sum + value, 0) / filtered.length).toFixed(6)) : 0;
}

function defaultPersistencePath(repositoryPath) {
  if (!repositoryPath) throw new Error("Project intelligence persistence requires a repository path or file path.");
  return path.join(repositoryPath, ".levi", "project-intelligence.json");
}

function dedupeBy(values, keyFn) {
  const byKey = new Map();
  for (const value of safeArray(values)) {
    const key = keyFn(value);
    if (!byKey.has(key)) byKey.set(key, value);
  }
  return Array.from(byKey.values());
}

function evidenceRecordKey(record) {
  return stableSerialize({ source: record.source, type: record.type, value: evidenceValueFingerprint(record.value) });
}

function safeArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function requiredString(value, message) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(message);
  return value.trim();
}

function stableHash(value) {
  return crypto.createHash("sha256").update(stableSerialize(value)).digest("hex").slice(0, 16);
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compareProfiles(left, right) {
  return left.projectId.localeCompare(right.projectId) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

function compareEntries(left, right) {
  return left[0].localeCompare(right[0]);
}

module.exports = {
  PROJECT_ACTION_TYPES,
  PROJECT_ASSESSMENT_STATUSES,
  PROJECT_BLOCKER_CATEGORIES,
  PROJECT_CLASSIFICATIONS,
  PROJECT_DEBT_CATEGORIES,
  PROJECT_EFFORT_CATEGORIES,
  PROJECT_FEATURE_STATES,
  PROJECT_FINDING_SEVERITIES,
  PROJECT_FINDING_STATUSES,
  PROJECT_INTELLIGENCE_DOMAINS,
  PROJECT_INTELLIGENCE_EVENTS,
  PROJECT_INTELLIGENCE_EVENT_TYPES,
  PROJECT_INTELLIGENCE_SCHEMA_VERSION,
  PROJECT_LIFECYCLE_STAGES,
  PROJECT_READINESS_LEVELS,
  PROJECT_RISK_CATEGORIES,
  PROJECT_SCORE_DOMAINS,
  ProjectIntelligenceEngine,
};
