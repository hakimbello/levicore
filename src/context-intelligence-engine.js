const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const CONTEXT_SCHEMA_VERSION = 1;

const CONTEXT_PURPOSES = Object.freeze({
  PLANNING: "PLANNING",
  EXECUTION: "EXECUTION",
  REPAIR: "REPAIR",
  VALIDATION: "VALIDATION",
  SECURITY_REVIEW: "SECURITY_REVIEW",
  APPROVAL_REVIEW: "APPROVAL_REVIEW",
  OBJECTIVE_COMPLETION: "OBJECTIVE_COMPLETION",
  CODE_UNDERSTANDING: "CODE_UNDERSTANDING",
  SEARCH: "SEARCH",
  USER_QUERY: "USER_QUERY",
});

const CONTEXT_SOURCES = Object.freeze({
  OBJECTIVE: "OBJECTIVE",
  PLAN: "PLAN",
  TASK: "TASK",
  REPOSITORY_GRAPH: "REPOSITORY_GRAPH",
  OFFLINE_INDEX: "OFFLINE_INDEX",
  PROJECT_KNOWLEDGE: "PROJECT_KNOWLEDGE",
  DURABLE_DECISION: "DURABLE_DECISION",
  CROSS_SESSION_LEARNING: "CROSS_SESSION_LEARNING",
  EXECUTION_HISTORY: "EXECUTION_HISTORY",
  REPAIR_HISTORY: "REPAIR_HISTORY",
  APPROVAL_HISTORY: "APPROVAL_HISTORY",
  SECURITY_FINDING: "SECURITY_FINDING",
  VALIDATION_RESULT: "VALIDATION_RESULT",
  COMPLETION_EVIDENCE: "COMPLETION_EVIDENCE",
  FILE: "FILE",
  SYMBOL: "SYMBOL",
  DEPENDENCY: "DEPENDENCY",
  USER_INSTRUCTION: "USER_INSTRUCTION",
});

const CONTEXT_PACKAGE_STATUSES = Object.freeze({
  READY: "READY",
  PARTIAL: "PARTIAL",
  BLOCKED: "BLOCKED",
  OVER_BUDGET: "OVER_BUDGET",
  INSUFFICIENT: "INSUFFICIENT",
  CONFLICTED: "CONFLICTED",
});

const CONTEXT_EVENTS = Object.freeze({
  LIFECYCLE: "lifecycle",
});

const CONTEXT_EVENT_TYPES = Object.freeze({
  COLLECTION_STARTED: "context_collection_started",
  COLLECTION_COMPLETED: "context_collection_completed",
  ITEM_COLLECTED: "context_item_collected",
  ITEM_RANKED: "context_item_ranked",
  ITEM_SELECTED: "context_item_selected",
  ITEM_OMITTED: "context_item_omitted",
  COMPRESSION_STARTED: "context_compression_started",
  COMPRESSION_COMPLETED: "context_compression_completed",
  CONFLICT_DETECTED: "context_conflict_detected",
  PACKAGE_CREATED: "context_package_created",
  PACKAGE_VALIDATED: "context_package_validated",
  PACKAGE_REFRESHED: "context_package_refreshed",
  BUDGET_EXCEEDED: "context_budget_exceeded",
  INSUFFICIENT: "context_insufficient",
  PERSISTED: "context_persisted",
  RESTORED: "context_restored",
  CORRUPTION_DETECTED: "context_corruption_detected",
});

const CONTEXT_FINDING_SEVERITIES = Object.freeze({
  INFO: "INFO",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

const DEFAULT_BOUNDS = Object.freeze({
  maximumPackageTokens: 8000,
  reservedResponseTokens: 1000,
  perSourceTokenLimits: {},
  perItemTokenLimit: 1200,
  minimumAuthorityThreshold: 0,
  minimumRelevanceThreshold: 0,
  maximumItems: 50,
  maximumFiles: 12,
  maximumSymbols: 20,
  maximumHistoryEntries: 12,
});

const AUTHORITY = Object.freeze({
  [CONTEXT_SOURCES.USER_INSTRUCTION]: 1,
  [CONTEXT_SOURCES.DURABLE_DECISION]: 0.95,
  [CONTEXT_SOURCES.TASK]: 0.92,
  [CONTEXT_SOURCES.PLAN]: 0.88,
  [CONTEXT_SOURCES.SECURITY_FINDING]: 0.86,
  [CONTEXT_SOURCES.VALIDATION_RESULT]: 0.84,
  [CONTEXT_SOURCES.COMPLETION_EVIDENCE]: 0.82,
  [CONTEXT_SOURCES.REPOSITORY_GRAPH]: 0.78,
  [CONTEXT_SOURCES.OFFLINE_INDEX]: 0.72,
  [CONTEXT_SOURCES.PROJECT_KNOWLEDGE]: 0.7,
  [CONTEXT_SOURCES.CROSS_SESSION_LEARNING]: 0.62,
  [CONTEXT_SOURCES.EXECUTION_HISTORY]: 0.52,
  [CONTEXT_SOURCES.REPAIR_HISTORY]: 0.68,
  [CONTEXT_SOURCES.APPROVAL_HISTORY]: 0.74,
  [CONTEXT_SOURCES.FILE]: 0.8,
  [CONTEXT_SOURCES.SYMBOL]: 0.8,
  [CONTEXT_SOURCES.DEPENDENCY]: 0.72,
  [CONTEXT_SOURCES.OBJECTIVE]: 0.9,
});

const PROTECTED_SOURCES = new Set([
  CONTEXT_SOURCES.USER_INSTRUCTION,
  CONTEXT_SOURCES.DURABLE_DECISION,
  CONTEXT_SOURCES.SECURITY_FINDING,
  CONTEXT_SOURCES.VALIDATION_RESULT,
]);

class ContextIntelligenceEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.packages = new Map();
    this.projectId = options.projectId || null;
    this.repositoryPath = options.repositoryPath ? path.resolve(options.repositoryPath) : null;
    this.persistencePath = options.persistencePath || null;
    this.collectors = normalizeCollectors(options.collectors || []);
    this.tokenEstimator = typeof options.tokenEstimator === "function" ? options.tokenEstimator : null;
    this.reranker = typeof options.reranker === "function" ? options.reranker : null;
    this.summarizer = typeof options.summarizer === "function" ? options.summarizer : null;
    this.repositoryGraph = options.repositoryGraph || null;
    this.offlineIndex = options.offlineIndex || null;
    this.learningEngine = options.learningEngine || null;
    this.planningEngine = options.planningEngine || null;
    this.decisionRecords = Array.isArray(options.decisionRecords) ? options.decisionRecords.slice() : [];
    this.projectKnowledgeFacts = Array.isArray(options.projectKnowledgeFacts) ? options.projectKnowledgeFacts.slice() : [];
    this.bounds = normalizeBounds(options.bounds || {});
    this.migrations = Array.isArray(options.migrations) ? options.migrations.slice() : [];
  }

  createRequest(input) {
    if (!isPlainObject(input)) throw new Error("Context request input must be an object.");
    return {
      id: input.id || `context-request:${stableHash({
        projectId: input.projectId || this.projectId,
        purpose: input.purpose,
        objective: input.objective,
        planId: input.planId,
        taskId: input.taskId,
      })}`,
      projectId: requiredString(input.projectId || this.projectId || "default", "Context request projectId is required."),
      purpose: normalizePurpose(input.purpose || CONTEXT_PURPOSES.USER_QUERY),
      objective: requiredString(input.objective || "Context request", "Context request objective is required."),
      planId: input.planId || (input.plan && input.plan.id) || null,
      taskId: input.taskId || (input.task && input.task.id) || null,
      plan: input.plan ? clonePlainObject(input.plan) : null,
      task: input.task ? clonePlainObject(input.task) : null,
      userInstructions: normalizeStringArray(input.userInstructions || input.userInstruction),
      acceptanceCriteria: normalizeStringArray(input.acceptanceCriteria || (input.task && input.task.acceptanceCriteria) || (input.plan && input.plan.acceptanceCriteria) || []),
      paths: normalizeStringArray(input.paths || input.path || (input.task && input.task.outputs) || []),
      symbols: normalizeStringArray(input.symbols || input.symbol || []),
      metadata: clonePlainObject(input.metadata || {}),
      createdAt: normalizeTimestamp(input.createdAt),
    };
  }

  collect(requestInput, options = {}) {
    const request = isContextRequest(requestInput) ? requestInput : this.createRequest(requestInput);
    this.emitLifecycle(CONTEXT_EVENT_TYPES.COLLECTION_STARTED, { requestId: request.id, purpose: request.purpose });
    const items = [];
    items.push(...objectiveItems(request));
    items.push(...userInstructionItems(request));
    items.push(...planItems(request));
    items.push(...taskItems(request));
    items.push(...decisionItems(options.decisionRecords || this.decisionRecords, request));
    items.push(...projectKnowledgeItems(options.projectKnowledgeFacts || this.projectKnowledgeFacts, request));
    items.push(...graphItems(options.repositoryGraph || this.repositoryGraph, request));
    items.push(...indexItems(options.offlineIndex || this.offlineIndex, request));
    items.push(...learningItems(options.learningEngine || this.learningEngine, request));
    items.push(...executionEvidenceItems(options.executionSession || options.session || request.metadata.session, request));
    items.push(...historyItems(options, request));
    for (const collector of [...this.collectors, ...normalizeCollectors(options.collectors || [])]) {
      const output = collector.collect({ request: clonePlainObject(request), options: clonePlainObject(options), engine: this });
      items.push(...normalizeCollectorOutput(output));
    }
    const normalized = items.map((item) => normalizeContextItem(item, request, this)).sort(compareItems);
    for (const item of normalized) {
      this.emitLifecycle(CONTEXT_EVENT_TYPES.ITEM_COLLECTED, { requestId: request.id, item: clonePlainObject(item) });
    }
    this.emitLifecycle(CONTEXT_EVENT_TYPES.COLLECTION_COMPLETED, { requestId: request.id, count: normalized.length });
    return normalized;
  }

  rank(items, requestInput, options = {}) {
    const request = isContextRequest(requestInput) ? requestInput : this.createRequest(requestInput);
    let ranked = (Array.isArray(items) ? items : []).map((item) => {
      const normalized = normalizeContextItem(item, request, this);
      const score = rankItem(normalized, request, options);
      const output = { ...normalized, metadata: { ...normalized.metadata, rankScore: score } };
      this.emitLifecycle(CONTEXT_EVENT_TYPES.ITEM_RANKED, { requestId: request.id, itemId: output.id, rank: score });
      return output;
    });
    if (this.reranker) {
      ranked = this.reranker(ranked, request, options) || ranked;
    }
    return ranked.sort((left, right) => right.metadata.rankScore - left.metadata.rankScore || compareItems(left, right));
  }

  select(items, requestInput, options = {}) {
    const request = isContextRequest(requestInput) ? requestInput : this.createRequest(requestInput);
    const bounds = normalizeBounds({ ...this.bounds, ...(options.bounds || {}) });
    const ranked = this.rank(items, request, options);
    const selected = [];
    const omitted = [];
    const sourceTokens = new Map();
    let total = 0;
    let fileCount = 0;
    let symbolCount = 0;
    let historyCount = 0;
    const selectedKeys = new Set();
    const seenKeys = new Set();
    for (const item of ranked) {
      const rank = item.metadata.rankScore || 0;
      const duplicateKey = itemIdentity(item);
      if (selectedKeys.has(duplicateKey) || seenKeys.has(duplicateKey)) {
        omitted.push(omission(item, "duplicate", rank, true));
        continue;
      }
      seenKeys.add(duplicateKey);
      if (isInactiveLearning(item)) {
        omitted.push(omission(item, String(item.metadata.status || "").toLowerCase() || "superseded", rank, false));
        continue;
      }
      if (!isMandatory(item, request) && item.authority < bounds.minimumAuthorityThreshold) {
        omitted.push(omission(item, "low authority", rank, true));
        continue;
      }
      if (!isMandatory(item, request) && item.relevance < bounds.minimumRelevanceThreshold) {
        omitted.push(omission(item, "irrelevant", rank, true));
        continue;
      }
      if (item.risk === "stale" && !isMandatory(item, request)) {
        omitted.push(omission(item, "stale", rank, true));
        continue;
      }
      if (selected.length >= bounds.maximumItems && !isMandatory(item, request)) {
        omitted.push(omission(item, "over budget", rank, true));
        continue;
      }
      if (item.source === CONTEXT_SOURCES.FILE && fileCount >= bounds.maximumFiles && !isMandatory(item, request)) {
        omitted.push(omission(item, "source limit exceeded", rank, true));
        continue;
      }
      if (item.source === CONTEXT_SOURCES.SYMBOL && symbolCount >= bounds.maximumSymbols && !isMandatory(item, request)) {
        omitted.push(omission(item, "source limit exceeded", rank, true));
        continue;
      }
      if (historySources().has(item.source) && historyCount >= bounds.maximumHistoryEntries && !isMandatory(item, request)) {
        omitted.push(omission(item, "source limit exceeded", rank, true));
        continue;
      }
      const sourceLimit = bounds.perSourceTokenLimits[item.source];
      const usedForSource = sourceTokens.get(item.source) || 0;
      if (sourceLimit && usedForSource + item.estimatedTokens > sourceLimit && !isMandatory(item, request)) {
        omitted.push(omission(item, "source limit exceeded", rank, true));
        continue;
      }
      const availableBudget = bounds.maximumPackageTokens - bounds.reservedResponseTokens;
      if (total + item.estimatedTokens > availableBudget && !isMandatory(item, request)) {
        omitted.push(omission(item, "over budget", rank, true));
        continue;
      }
      selected.push(item);
      selectedKeys.add(duplicateKey);
      total += item.estimatedTokens;
      sourceTokens.set(item.source, usedForSource + item.estimatedTokens);
      if (item.source === CONTEXT_SOURCES.FILE) fileCount += 1;
      if (item.source === CONTEXT_SOURCES.SYMBOL) symbolCount += 1;
      if (historySources().has(item.source)) historyCount += 1;
      this.emitLifecycle(CONTEXT_EVENT_TYPES.ITEM_SELECTED, { requestId: request.id, itemId: item.id });
    }
    for (const entry of omitted) {
      this.emitLifecycle(CONTEXT_EVENT_TYPES.ITEM_OMITTED, { requestId: request.id, omission: entry });
    }
    return { selected, omitted };
  }

  compress(items, requestInput, options = {}) {
    const request = isContextRequest(requestInput) ? requestInput : this.createRequest(requestInput);
    const bounds = normalizeBounds({ ...this.bounds, ...(options.bounds || {}) });
    this.emitLifecycle(CONTEXT_EVENT_TYPES.COMPRESSION_STARTED, { requestId: request.id, count: items.length });
    const compressed = items.map((input) => {
      const item = normalizeContextItem(input, request, this);
      if (isProtected(item, request)) return item;
      const limit = bounds.perItemTokenLimit;
      if (item.estimatedTokens <= limit) return item;
      let content = compactWhitespace(item.content);
      if (this.summarizer) content = this.summarizer(item, request, options) || content;
      if (this.estimateTokens(content) > limit) content = truncateByTokens(content, limit, this);
      const next = normalizeContextItem({
        ...item,
        content,
        summary: item.summary || deterministicSummary(item),
        metadata: reducedMetadata(item.metadata),
        estimatedTokens: undefined,
      }, request, this);
      return next;
    });
    this.emitLifecycle(CONTEXT_EVENT_TYPES.COMPRESSION_COMPLETED, { requestId: request.id, count: compressed.length });
    return compressed;
  }

  assemble(requestInput, options = {}) {
    const request = isContextRequest(requestInput) ? requestInput : this.createRequest(requestInput);
    const collected = this.collect(request, options);
    const findings = this.detectFindings(collected, request, options);
    const selected = this.select(collected, request, options);
    const compressed = this.compress(selected.selected, request, options);
    const packageInput = {
      id: options.packageId || `context-package:${stableHash({ requestId: request.id, revision: options.revision || 1 })}`,
      projectId: request.projectId,
      purpose: request.purpose,
      objective: request.objective,
      planId: request.planId,
      taskId: request.taskId,
      items: compressed,
      omittedItems: selected.omitted,
      findings,
      tokenBudget: normalizeBounds({ ...this.bounds, ...(options.bounds || {}) }).maximumPackageTokens,
      estimatedTokens: compressed.reduce((total, item) => total + item.estimatedTokens, 0),
      status: packageStatus(compressed, selected.omitted, findings, request, normalizeBounds({ ...this.bounds, ...(options.bounds || {}) })),
      metadata: {
        request,
        revision: options.revision || 1,
        selectionExplanation: selectionExplanation(compressed, selected.omitted),
      },
      createdAt: normalizeTimestamp(options.createdAt),
    };
    if (packageInput.status === CONTEXT_PACKAGE_STATUSES.OVER_BUDGET) this.emitLifecycle(CONTEXT_EVENT_TYPES.BUDGET_EXCEEDED, { packageId: packageInput.id });
    if (packageInput.status === CONTEXT_PACKAGE_STATUSES.INSUFFICIENT) this.emitLifecycle(CONTEXT_EVENT_TYPES.INSUFFICIENT, { packageId: packageInput.id });
    for (const finding of findings.filter((finding) => finding.code.includes("conflict"))) {
      this.emitLifecycle(CONTEXT_EVENT_TYPES.CONFLICT_DETECTED, { packageId: packageInput.id, finding });
    }
    const pkg = normalizeContextPackage(packageInput);
    this.packages.set(pkg.id, pkg);
    this.emitLifecycle(CONTEXT_EVENT_TYPES.PACKAGE_CREATED, { package: clonePlainObject(pkg) });
    this.validatePackage(pkg);
    return clonePlainObject(pkg);
  }

  refresh(packageId, changes = [], options = {}) {
    const current = this.requirePackage(packageId);
    const request = current.metadata.request;
    const refreshed = this.assemble(request, {
      ...options,
      packageId,
      revision: (current.metadata.revision || 1) + 1,
    });
    refreshed.metadata.refreshReasons = normalizeStringArray(changes).length > 0 ? normalizeStringArray(changes) : ["context refresh requested"];
    this.packages.set(packageId, refreshed);
    this.emitLifecycle(CONTEXT_EVENT_TYPES.PACKAGE_REFRESHED, { packageId, revision: refreshed.metadata.revision });
    return clonePlainObject(refreshed);
  }

  validatePackage(packageOrId, options = {}) {
    const pkg = typeof packageOrId === "string" ? this.requirePackage(packageOrId) : normalizeContextPackage(packageOrId);
    const findings = [...pkg.findings];
    const request = pkg.metadata.request || {};
    if (!pkg.objective && !pkg.taskId) findings.push(contextFinding("missing_objective", "HIGH", "Objective or task context missing", "A context package requires objective or task context.", []));
    if (request.userInstructions && request.userInstructions.length > 0 && !pkg.items.some((item) => item.source === CONTEXT_SOURCES.USER_INSTRUCTION)) {
      findings.push(contextFinding("missing_user_instruction", "CRITICAL", "Mandatory user instruction missing", "Current user instructions must be selected.", []));
    }
    if (request.acceptanceCriteria && request.acceptanceCriteria.length > 0 && !pkg.items.some((item) => item.tags.includes("acceptance-criteria"))) {
      findings.push(contextFinding("missing_acceptance_criteria", "HIGH", "Acceptance criteria missing", "Acceptance criteria are required for this package.", []));
    }
    if (pkg.items.some(isInactiveLearning)) findings.push(contextFinding("inactive_learning_selected", "HIGH", "Inactive learning selected", "Archived, rejected, or superseded learning cannot be selected by default.", []));
    if (pkg.estimatedTokens < 0 || !Number.isFinite(pkg.estimatedTokens)) findings.push(contextFinding("invalid_token_estimate", "HIGH", "Invalid token estimate", "Package token estimate must be valid.", []));
    if (request.purpose === CONTEXT_PURPOSES.EXECUTION && request.paths && request.paths.length > 0 && !request.paths.every((target) => pkg.items.some((item) => item.path === target))) {
      findings.push(contextFinding("missing_execution_target", "HIGH", "Execution target missing", "Direct execution targets must be included.", []));
    }
    if (request.purpose === CONTEXT_PURPOSES.REPAIR && !pkg.items.some((item) => item.source === CONTEXT_SOURCES.REPAIR_HISTORY || item.source === CONTEXT_SOURCES.VALIDATION_RESULT)) {
      findings.push(contextFinding("missing_failure_evidence", "HIGH", "Failure evidence missing", "Repair context requires failure evidence.", []));
    }
    const criticalConflict = findings.some((finding) => finding.severity === "CRITICAL" && finding.code.includes("conflict"));
    const validated = {
      status: criticalConflict ? CONTEXT_PACKAGE_STATUSES.CONFLICTED : findings.some((finding) => ["HIGH", "CRITICAL"].includes(finding.severity)) ? CONTEXT_PACKAGE_STATUSES.PARTIAL : pkg.status,
      findings,
    };
    if (typeof packageOrId === "string") {
      const next = { ...pkg, status: validated.status, findings };
      this.packages.set(packageOrId, next);
    }
    this.emitLifecycle(CONTEXT_EVENT_TYPES.PACKAGE_VALIDATED, { packageId: pkg.id, validation: validated });
    return clonePlainObject(validated);
  }

  explainSelection(packageOrId) {
    const pkg = typeof packageOrId === "string" ? this.requirePackage(packageOrId) : normalizeContextPackage(packageOrId);
    return {
      packageId: pkg.id,
      selected: pkg.items.map((item) => ({
        itemId: item.id,
        source: item.source,
        title: item.title,
        authority: item.authority,
        relevance: item.relevance,
        estimatedTokens: item.estimatedTokens,
        reason: selectionReason(item),
      })),
      omitted: pkg.omittedItems.map(clonePlainObject),
      findings: pkg.findings.map(clonePlainObject),
    };
  }

  getPackage(id) {
    const pkg = this.packages.get(id);
    return pkg ? clonePlainObject(pkg) : null;
  }

  listPackages(filter = {}) {
    const projectIds = normalizeStringSet(filter.projectId || filter.projectIds);
    const purposes = normalizeStringSet(filter.purpose || filter.purposes);
    return Array.from(this.packages.values())
      .filter((pkg) => (projectIds.size === 0 || projectIds.has(pkg.projectId)) && (purposes.size === 0 || purposes.has(pkg.purpose)))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .map(clonePlainObject);
  }

  estimateTokens(value) {
    if (this.tokenEstimator) return this.tokenEstimator(value);
    return Math.ceil(stableSerialize(value).length / 4);
  }

  snapshot() {
    return {
      schemaVersion: CONTEXT_SCHEMA_VERSION,
      projectId: this.projectId,
      repositoryPath: this.repositoryPath,
      bounds: clonePlainObject(this.bounds),
      packages: Array.from(this.packages.values()).sort((left, right) => left.id.localeCompare(right.id)).map(compactPackageForPersistence),
    };
  }

  restore(snapshot) {
    const migrated = migrateSnapshot(snapshot, this.migrations);
    validateSnapshot(migrated);
    this.packages.clear();
    this.projectId = migrated.projectId || this.projectId;
    this.repositoryPath = migrated.repositoryPath || this.repositoryPath;
    this.bounds = normalizeBounds(migrated.bounds || this.bounds);
    for (const pkg of migrated.packages) this.packages.set(pkg.id, normalizeContextPackage(pkg));
    this.emitLifecycle(CONTEXT_EVENT_TYPES.RESTORED, { packageCount: this.packages.size });
    return this.snapshot();
  }

  save(filePath = this.persistencePath || defaultPersistencePath(this.repositoryPath)) {
    const targetPath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${JSON.stringify(this.snapshot(), null, 2)}\n`, "utf8");
    this.persistencePath = targetPath;
    this.emitLifecycle(CONTEXT_EVENT_TYPES.PERSISTED, { path: targetPath });
    return { status: "PERSISTED", path: targetPath, schemaVersion: CONTEXT_SCHEMA_VERSION };
  }

  load(filePath = this.persistencePath || defaultPersistencePath(this.repositoryPath), options = {}) {
    const targetPath = path.resolve(filePath);
    try {
      this.restore(JSON.parse(fs.readFileSync(targetPath, "utf8")));
      this.persistencePath = targetPath;
      return { status: "LOADED", path: targetPath, schemaVersion: CONTEXT_SCHEMA_VERSION };
    } catch (error) {
      this.emitLifecycle(CONTEXT_EVENT_TYPES.CORRUPTION_DETECTED, { path: targetPath, reason: error.message });
      if (options.emptyOnCorruption === true) {
        this.packages.clear();
        this.emitLifecycle(CONTEXT_EVENT_TYPES.RESTORED, { packageCount: 0, reason: error.message });
        return { status: "EMPTY", path: targetPath, error: error.message };
      }
      return { status: "CORRUPT", path: targetPath, error: error.message };
    }
  }

  detectFindings(items, request, options = {}) {
    const findings = [];
    const decisions = items.filter((item) => item.source === CONTEXT_SOURCES.DURABLE_DECISION);
    const userInstructions = items.filter((item) => item.source === CONTEXT_SOURCES.USER_INSTRUCTION);
    for (const instruction of userInstructions) {
      for (const decision of decisions) {
        if (contradicts(instruction.content, decision.content)) {
          findings.push(contextFinding("user_instruction_decision_conflict", "CRITICAL", "User instruction conflicts with durable decision", "Current user instruction conflicts with an active durable decision.", [instruction.id, decision.id], [
            { source: instruction.sourceId, signal: instruction.content },
            { source: decision.sourceId, signal: decision.content },
          ]));
        }
      }
    }
    const taskText = `${request.objective} ${request.task ? `${request.task.title} ${request.task.description}` : ""}`;
    for (const decision of decisions) {
      if (contradicts(taskText, decision.content)) {
        findings.push(contextFinding("task_decision_conflict", "CRITICAL", "Task conflicts with durable decision", "The requested task conflicts with a durable decision.", [decision.id]));
      }
    }
    for (const item of items) {
      if (item.risk === "stale") {
        findings.push(contextFinding("stale_context", item.authority >= 0.8 ? "HIGH" : "MEDIUM", "Stale context detected", `${item.title} may be stale.`, [item.id]));
      }
    }
    const criteria = normalizeStringArray(request.acceptanceCriteria);
    if (criteria.some((left) => criteria.some((right) => left !== right && contradicts(left, right)))) {
      findings.push(contextFinding("acceptance_criteria_conflict", "HIGH", "Acceptance criteria conflict", "Acceptance criteria contain contradictory requirements.", []));
    }
    return findings;
  }

  requirePackage(id) {
    const pkg = this.packages.get(id);
    if (!pkg) throw new Error("Context package was not found.");
    return pkg;
  }

  emitLifecycle(type, payload = {}) {
    this.emit(CONTEXT_EVENTS.LIFECYCLE, {
      type,
      timestamp: new Date().toISOString(),
      schemaVersion: CONTEXT_SCHEMA_VERSION,
      ...payload,
    });
  }
}

function objectiveItems(request) {
  return [{
    source: CONTEXT_SOURCES.OBJECTIVE,
    sourceId: request.id,
    projectId: request.projectId,
    purpose: request.purpose,
    title: "Current objective",
    content: request.objective,
    summary: request.objective,
    tags: ["objective", "mandatory"],
    authority: AUTHORITY[CONTEXT_SOURCES.OBJECTIVE],
    relevance: 1,
    confidence: 1,
    metadata: { mandatory: true },
  }];
}

function userInstructionItems(request) {
  return request.userInstructions.map((instruction, index) => ({
    source: CONTEXT_SOURCES.USER_INSTRUCTION,
    sourceId: `${request.id}:instruction:${index}`,
    projectId: request.projectId,
    purpose: request.purpose,
    title: "Current user instruction",
    content: instruction,
    summary: instruction,
    tags: ["user-instruction", "mandatory"],
    authority: AUTHORITY[CONTEXT_SOURCES.USER_INSTRUCTION],
    relevance: 1,
    confidence: 1,
    metadata: { mandatory: true },
  }));
}

function planItems(request) {
  const items = [];
  if (request.plan) {
    items.push({
      source: CONTEXT_SOURCES.PLAN,
      sourceId: request.plan.id,
      projectId: request.projectId,
      purpose: request.purpose,
      title: request.plan.summary || request.plan.objective,
      content: stableSerialize({
        objective: request.plan.objective,
        acceptanceCriteria: request.plan.acceptanceCriteria,
        constraints: request.plan.constraints,
        findings: request.plan.metadata && request.plan.metadata.validation && request.plan.metadata.validation.findings,
      }),
      summary: request.plan.summary,
      tags: ["plan"],
      authority: AUTHORITY[CONTEXT_SOURCES.PLAN],
      relevance: purposeBoost(request.purpose, CONTEXT_SOURCES.PLAN),
      metadata: { planId: request.plan.id, version: request.plan.version },
    });
    for (const criterion of normalizeStringArray(request.plan.acceptanceCriteria)) {
      items.push(acceptanceItem(request, criterion, request.plan.id));
    }
  }
  return items;
}

function taskItems(request) {
  const items = [];
  if (request.task) {
    items.push({
      source: CONTEXT_SOURCES.TASK,
      sourceId: request.task.id,
      projectId: request.projectId,
      purpose: request.purpose,
      title: request.task.title,
      content: stableSerialize({
        description: request.task.description,
        acceptanceCriteria: request.task.acceptanceCriteria,
        validationRequirements: request.task.validationRequirements,
        securityRequirements: request.task.securityRequirements,
        inputs: request.task.inputs,
        outputs: request.task.outputs,
      }),
      summary: request.task.description,
      path: asArray(request.task.outputs)[0] || null,
      tags: ["task", "mandatory", request.task.type].filter(Boolean),
      authority: AUTHORITY[CONTEXT_SOURCES.TASK],
      relevance: 1,
      confidence: request.task.confidence || 0.8,
      metadata: { taskId: request.task.id, mandatory: true, directExecutionTarget: request.purpose === CONTEXT_PURPOSES.EXECUTION },
    });
    for (const criterion of normalizeStringArray(request.task.acceptanceCriteria)) {
      items.push(acceptanceItem(request, criterion, request.task.id));
    }
  }
  for (const criterion of request.acceptanceCriteria) items.push(acceptanceItem(request, criterion, request.taskId || request.id));
  return items;
}

function acceptanceItem(request, criterion, sourceId) {
  return {
    source: CONTEXT_SOURCES.TASK,
    sourceId: `${sourceId}:acceptance:${stableHash(criterion)}`,
    projectId: request.projectId,
    purpose: request.purpose,
    title: "Acceptance criterion",
    content: criterion,
    summary: criterion,
    tags: ["acceptance-criteria", "mandatory"],
    authority: 0.96,
    relevance: 1,
    confidence: 1,
    metadata: { mandatory: true, protected: true },
  };
}

function decisionItems(records, request) {
  return asArray(records).filter((record) => record && record.type === "approved-decision").map((record) => ({
    source: CONTEXT_SOURCES.DURABLE_DECISION,
    sourceId: record.id,
    projectId: record.projectId || request.projectId,
    purpose: request.purpose,
    title: record.value && (record.value.category || record.value.decisionId) || record.id,
    content: record.value && (record.value.statement || record.value.summary) || stableSerialize(record.value || record),
    summary: record.value && record.value.statement || "Approved project decision.",
    path: evidencePath(record.value && record.value.evidence || record.source),
    tags: ["durable-decision", "mandatory", record.value && record.value.category].filter(Boolean),
    authority: AUTHORITY[CONTEXT_SOURCES.DURABLE_DECISION],
    relevance: relevanceForText(record.value && record.value.statement, request),
    confidence: 0.95,
    metadata: { decisionId: record.id, status: record.confidenceState || "APPROVED", protected: true, mandatory: true },
  }));
}

function projectKnowledgeItems(facts, request) {
  return asArray(facts).map((fact) => ({
    source: CONTEXT_SOURCES.PROJECT_KNOWLEDGE,
    sourceId: fact.id || stableHash(fact),
    projectId: request.projectId,
    purpose: request.purpose,
    title: fact.category || fact.title || "Project knowledge",
    content: stableSerialize(fact.value || fact.summary || fact),
    summary: String(fact.summary || fact.value || fact.category || "Project knowledge"),
    path: evidencePath(fact.evidence),
    tags: ["project-knowledge", fact.category].filter(Boolean),
    authority: AUTHORITY[CONTEXT_SOURCES.PROJECT_KNOWLEDGE],
    relevance: relevanceForText(stableSerialize(fact), request),
    confidence: Number(fact.confidence || 0.7),
    metadata: { fact },
  }));
}

function graphItems(graph, request) {
  const snapshot = graph && typeof graph.snapshot === "function" ? graph.snapshot() : graph;
  if (!snapshot || !Array.isArray(snapshot.nodes)) return [];
  const tokens = requestTokens(request);
  return snapshot.nodes
    .filter((node) => matchesPathOrSymbol(node, request) || tokens.some((token) => `${node.name} ${node.path} ${node.type}`.toLowerCase().includes(token)))
    .slice(0, 30)
    .map((node) => ({
      source: node.type === "dependency" ? CONTEXT_SOURCES.DEPENDENCY : node.type === "file" ? CONTEXT_SOURCES.FILE : node.type === "function" || node.type === "method" || node.type === "class" ? CONTEXT_SOURCES.SYMBOL : CONTEXT_SOURCES.REPOSITORY_GRAPH,
      sourceId: node.id,
      projectId: request.projectId,
      purpose: request.purpose,
      title: node.name,
      content: `${node.type} ${node.name} ${node.path || ""}`,
      summary: `${node.type} ${node.name}`,
      path: node.path,
      symbol: node.type === "file" ? null : node.name,
      language: node.language,
      tags: ["repository-graph", node.type],
      authority: AUTHORITY[CONTEXT_SOURCES.REPOSITORY_GRAPH],
      relevance: relevanceForText(`${node.name} ${node.path} ${node.type}`, request),
      confidence: 0.8,
      metadata: { graphNodeId: node.id, graphNodeIds: [node.id], version: snapshot.updatedAt || snapshot.createdAt },
    }));
}

function indexItems(index, request) {
  if (!index || typeof index.search !== "function") return [];
  return index.search(queryForRequest(request), { limit: 20 }).map((document) => ({
    source: sourceForIndexDocument(document),
    sourceId: document.id,
    projectId: document.projectId || request.projectId,
    purpose: request.purpose,
    title: document.title,
    content: document.content,
    summary: document.title,
    path: document.path,
    symbol: document.symbols && document.symbols[0],
    language: document.language,
    tags: ["offline-index", ...asArray(document.tags)],
    authority: AUTHORITY[CONTEXT_SOURCES.OFFLINE_INDEX],
    relevance: Math.min(1, Number(document.score || 0) / 100),
    confidence: Number(document.metadata && document.metadata.confidence || 0.75),
    metadata: { indexDocumentId: document.id, contentHash: document.contentHash, graphNodeIds: document.references || [], score: document.score },
  }));
}

function learningItems(learning, request) {
  const records = learningRecords(learning, request);
  return records
    .filter((record) => !["ARCHIVED", "REJECTED", "SUPERSEDED"].includes(record.status))
    .map((record) => ({
      source: CONTEXT_SOURCES.CROSS_SESSION_LEARNING,
      sourceId: record.id,
      projectId: record.projectId || request.projectId,
      purpose: request.purpose,
      title: record.title,
      content: record.summary,
      summary: record.summary,
      path: evidencePath(record.evidence),
      tags: ["learning", record.type, ...asArray(record.tags)],
      authority: AUTHORITY[CONTEXT_SOURCES.CROSS_SESSION_LEARNING],
      relevance: relevanceForText(`${record.title} ${record.summary}`, request),
      confidence: Number(record.confidence || 0.6),
      metadata: { status: record.status, importance: record.importance || 0, useCount: record.useCount || 0, graphNodeIds: record.metadata && record.metadata.graphNodeIds || [] },
    }));
}

function executionEvidenceItems(sessionInput, request) {
  const session = sessionInput && typeof sessionInput.snapshot === "function" ? sessionInput.snapshot() : sessionInput;
  if (!session || !isPlainObject(session)) return [];
  const items = [];
  items.push({
    source: CONTEXT_SOURCES.EXECUTION_HISTORY,
    sourceId: session.sessionId,
    projectId: request.projectId,
    purpose: request.purpose,
    title: "Execution session",
    content: stableSerialize({ currentState: session.currentState, completedSteps: session.completedSteps, remainingSteps: session.remainingSteps, errors: session.errors }),
    summary: `Execution session ${session.sessionId}`,
    tags: ["execution-history"],
    authority: AUTHORITY[CONTEXT_SOURCES.EXECUTION_HISTORY],
    relevance: purposeBoost(request.purpose, CONTEXT_SOURCES.EXECUTION_HISTORY),
    metadata: { sessionId: session.sessionId, updatedAt: session.updatedAt },
  });
  for (const repair of asArray(session.metadata && session.metadata.repairHistory)) items.push(historyItem(CONTEXT_SOURCES.REPAIR_HISTORY, repair, request, "Repair history"));
  for (const finding of asArray(session.metadata && session.metadata.securityFindings)) items.push(historyItem(CONTEXT_SOURCES.SECURITY_FINDING, finding, request, finding.title || "Security finding", finding.severity === "CRITICAL" ? 0.95 : 0.85));
  if (session.metadata && (session.metadata.validationResult || session.metadata.validationPassed !== undefined || session.metadata.validationStatus)) {
    items.push(historyItem(CONTEXT_SOURCES.VALIDATION_RESULT, session.metadata.validationResult || { validationPassed: session.metadata.validationPassed, validationStatus: session.metadata.validationStatus }, request, "Validation result"));
  }
  for (const completion of asArray(session.metadata && session.metadata.completionHistory)) items.push(historyItem(CONTEXT_SOURCES.COMPLETION_EVIDENCE, completion, request, "Completion evidence"));
  if (session.metadata && session.metadata.approvalRequest) items.push(historyItem(CONTEXT_SOURCES.APPROVAL_HISTORY, session.metadata.approvalRequest, request, "Approval request"));
  return items;
}

function historyItems(options, request) {
  return [
    ...asArray(options.executionHistory).map((entry) => historyItem(CONTEXT_SOURCES.EXECUTION_HISTORY, entry, request, "Execution history")),
    ...asArray(options.repairHistory).map((entry) => historyItem(CONTEXT_SOURCES.REPAIR_HISTORY, entry, request, "Repair history")),
    ...asArray(options.approvalHistory).map((entry) => historyItem(CONTEXT_SOURCES.APPROVAL_HISTORY, entry, request, "Approval history")),
    ...asArray(options.securityFindings).map((entry) => historyItem(CONTEXT_SOURCES.SECURITY_FINDING, entry, request, entry.title || "Security finding", entry.severity === "CRITICAL" ? 0.95 : 0.85)),
    ...asArray(options.validationResults).map((entry) => historyItem(CONTEXT_SOURCES.VALIDATION_RESULT, entry, request, "Validation result")),
    ...asArray(options.completionEvidence).map((entry) => historyItem(CONTEXT_SOURCES.COMPLETION_EVIDENCE, entry, request, "Completion evidence")),
  ];
}

function historyItem(source, entry, request, title, authority) {
  return {
    source,
    sourceId: entry.id || stableHash(entry),
    projectId: request.projectId,
    purpose: request.purpose,
    title,
    content: stableSerialize(entry),
    summary: entry.summary || entry.description || title,
    path: entry.path || evidencePath(entry.evidence),
    tags: [source.toLowerCase()],
    authority: authority || AUTHORITY[source],
    relevance: purposeBoost(request.purpose, source),
    confidence: entry.confidence || 0.75,
    risk: entry.stale === true ? "stale" : entry.severity === "CRITICAL" ? "critical" : "normal",
    metadata: clonePlainObject(entry),
  };
}

function normalizeContextItem(input, request, engine) {
  if (!isPlainObject(input)) throw new Error("Context item must be an object.");
  const source = normalizeSource(input.source);
  const content = String(input.content || input.summary || input.title || "");
  const estimatedTokens = input.estimatedTokens || engine.estimateTokens(content);
  const createdAt = normalizeTimestamp(input.createdAt);
  return {
    id: input.id || `context-item:${stableHash({ source, sourceId: input.sourceId, projectId: input.projectId || request.projectId, path: input.path, symbol: input.symbol, contentHash: input.metadata && input.metadata.contentHash || stableHash(content), version: input.metadata && input.metadata.version })}`,
    source,
    sourceId: requiredString(String(input.sourceId || `${source}:${stableHash(content)}`), "Context item sourceId is required."),
    projectId: requiredString(input.projectId || request.projectId, "Context item projectId is required."),
    purpose: normalizePurpose(input.purpose || request.purpose),
    title: requiredString(input.title || source, "Context item title is required."),
    content,
    summary: String(input.summary || deterministicSummary(input)),
    path: input.path || null,
    symbol: input.symbol || null,
    language: input.language || null,
    tags: uniqueSorted(asArray(input.tags).map((tag) => String(tag).toLowerCase())),
    authority: normalizeScore(input.authority, AUTHORITY[source] || 0.5),
    relevance: normalizeScore(input.relevance, relevanceForText(content, request)),
    confidence: normalizeScore(input.confidence, 0.75),
    freshness: normalizeScore(input.freshness, freshnessFor(input.updatedAt || input.createdAt)),
    risk: input.risk || riskForItem(input),
    estimatedTokens,
    metadata: clonePlainObject(input.metadata || {}),
    createdAt,
    updatedAt: normalizeTimestamp(input.updatedAt || createdAt),
  };
}

function normalizeContextPackage(input) {
  if (!isPlainObject(input)) throw new Error("Context package must be an object.");
  return {
    id: requiredString(input.id, "Context package id is required."),
    projectId: requiredString(input.projectId, "Context package projectId is required."),
    purpose: normalizePurpose(input.purpose),
    objective: requiredString(input.objective, "Context package objective is required."),
    planId: input.planId || null,
    taskId: input.taskId || null,
    items: asArray(input.items).map((item) => ({ ...clonePlainObject(item) })),
    omittedItems: asArray(input.omittedItems).map(clonePlainObject),
    findings: asArray(input.findings).map(clonePlainObject),
    tokenBudget: Number(input.tokenBudget || 0),
    estimatedTokens: Number(input.estimatedTokens || 0),
    status: normalizePackageStatus(input.status || CONTEXT_PACKAGE_STATUSES.READY),
    metadata: clonePlainObject(input.metadata || {}),
    createdAt: normalizeTimestamp(input.createdAt),
  };
}

function packageStatus(items, omittedItems, findings, request, bounds) {
  if (findings.some((finding) => finding.severity === "CRITICAL" && finding.code.includes("conflict"))) return CONTEXT_PACKAGE_STATUSES.CONFLICTED;
  if (items.reduce((total, item) => total + item.estimatedTokens, 0) > bounds.maximumPackageTokens) return CONTEXT_PACKAGE_STATUSES.OVER_BUDGET;
  if (!items.some((item) => item.source === CONTEXT_SOURCES.OBJECTIVE || item.source === CONTEXT_SOURCES.TASK)) return CONTEXT_PACKAGE_STATUSES.INSUFFICIENT;
  if (findings.some((finding) => ["HIGH", "CRITICAL"].includes(finding.severity))) return CONTEXT_PACKAGE_STATUSES.PARTIAL;
  if (omittedItems.some((item) => item.reason === "over budget")) return CONTEXT_PACKAGE_STATUSES.PARTIAL;
  return CONTEXT_PACKAGE_STATUSES.READY;
}

function rankItem(item, request) {
  let score = 0;
  score += item.authority * 35;
  score += item.relevance * 30;
  score += item.confidence * 10;
  score += item.freshness * 6;
  score += purposeBoost(request.purpose, item.source) * 15;
  score += pathOrSymbolBoost(item, request) * 12;
  score += Number(item.metadata.importance || 0) * 8;
  score += Math.min(Number(item.metadata.useCount || 0), 10) * 0.5;
  if (isMandatory(item, request)) score += 100;
  if (item.source === CONTEXT_SOURCES.USER_INSTRUCTION) score += 50;
  if (item.source === CONTEXT_SOURCES.DURABLE_DECISION) score += 25;
  if (item.risk === "critical") score += 15;
  if (item.risk === "stale") score -= 12;
  score -= Math.log2(Math.max(1, item.estimatedTokens)) * 1.5;
  return Number(score.toFixed(6));
}

function purposeBoost(purpose, source) {
  const matrix = {
    [CONTEXT_PURPOSES.PLANNING]: [CONTEXT_SOURCES.OBJECTIVE, CONTEXT_SOURCES.PLAN, CONTEXT_SOURCES.DURABLE_DECISION, CONTEXT_SOURCES.REPOSITORY_GRAPH, CONTEXT_SOURCES.CROSS_SESSION_LEARNING, CONTEXT_SOURCES.OFFLINE_INDEX],
    [CONTEXT_PURPOSES.EXECUTION]: [CONTEXT_SOURCES.TASK, CONTEXT_SOURCES.FILE, CONTEXT_SOURCES.SYMBOL, CONTEXT_SOURCES.DEPENDENCY, CONTEXT_SOURCES.OFFLINE_INDEX, CONTEXT_SOURCES.VALIDATION_RESULT],
    [CONTEXT_PURPOSES.REPAIR]: [CONTEXT_SOURCES.REPAIR_HISTORY, CONTEXT_SOURCES.VALIDATION_RESULT, CONTEXT_SOURCES.FILE, CONTEXT_SOURCES.EXECUTION_HISTORY],
    [CONTEXT_PURPOSES.SECURITY_REVIEW]: [CONTEXT_SOURCES.SECURITY_FINDING, CONTEXT_SOURCES.DURABLE_DECISION, CONTEXT_SOURCES.DEPENDENCY, CONTEXT_SOURCES.FILE, CONTEXT_SOURCES.APPROVAL_HISTORY],
    [CONTEXT_PURPOSES.OBJECTIVE_COMPLETION]: [CONTEXT_SOURCES.COMPLETION_EVIDENCE, CONTEXT_SOURCES.VALIDATION_RESULT, CONTEXT_SOURCES.PLAN, CONTEXT_SOURCES.TASK, CONTEXT_SOURCES.SECURITY_FINDING],
  };
  return (matrix[purpose] || []).includes(source) ? 1 : 0.35;
}

function isMandatory(item, request) {
  return item.metadata.mandatory === true ||
    item.tags.includes("mandatory") ||
    item.source === CONTEXT_SOURCES.USER_INSTRUCTION ||
    item.source === CONTEXT_SOURCES.DURABLE_DECISION && item.relevance > 0 ||
    item.source === CONTEXT_SOURCES.SECURITY_FINDING && item.risk === "critical";
}

function isProtected(item, request) {
  return isMandatory(item, request) ||
    PROTECTED_SOURCES.has(item.source) ||
    item.tags.includes("acceptance-criteria") ||
    item.metadata.directExecutionTarget === true ||
    item.metadata.protected === true;
}

function omission(item, reason, rank, retrievable) {
  return {
    itemId: item.id,
    reason,
    rank,
    estimatedTokens: item.estimatedTokens,
    canBeRetrievedLater: retrievable === true,
  };
}

function contextFinding(code, severity, title, description, itemIds = [], evidence = [], metadata = {}) {
  return {
    id: `context-finding:${stableHash({ code, itemIds, evidence, title })}`,
    code,
    severity,
    title,
    description,
    itemIds: normalizeStringArray(itemIds),
    evidence: asArray(evidence).map(clonePlainObject),
    metadata: clonePlainObject(metadata),
    createdAt: new Date().toISOString(),
  };
}

function sourceForIndexDocument(document) {
  if (document.type === "file" || document.type === "test" || document.type === "configuration") return CONTEXT_SOURCES.FILE;
  if (["symbol", "function", "method", "class", "interface"].includes(document.type)) return CONTEXT_SOURCES.SYMBOL;
  if (document.type === "dependency") return CONTEXT_SOURCES.DEPENDENCY;
  if (document.type === "durable_decision") return CONTEXT_SOURCES.DURABLE_DECISION;
  if (document.type === "learning_record") return CONTEXT_SOURCES.CROSS_SESSION_LEARNING;
  if (document.type === "project_knowledge") return CONTEXT_SOURCES.PROJECT_KNOWLEDGE;
  return CONTEXT_SOURCES.OFFLINE_INDEX;
}

function learningRecords(learning, request) {
  if (!learning) return [];
  if (typeof learning.retrieve === "function") return learning.retrieve({ projectId: request.projectId, keywords: requestTokens(request), limit: 20 });
  if (typeof learning.list === "function") return learning.list({ status: "ACTIVE", projectId: request.projectId });
  if (typeof learning.snapshot === "function") return asArray(learning.snapshot().records).filter((record) => record.status === "ACTIVE");
  return asArray(learning);
}

function queryForRequest(request) {
  return [request.objective, request.task && request.task.title, request.paths.join(" "), request.symbols.join(" ")].filter(Boolean).join(" ");
}

function requestTokens(request) {
  return tokenize(queryForRequest(request));
}

function relevanceForText(text, request) {
  const tokens = requestTokens(request);
  if (tokens.length === 0) return 0.5;
  const haystack = String(text || "").toLowerCase();
  const matches = tokens.filter((token) => haystack.includes(token)).length;
  return Math.min(1, matches / tokens.length);
}

function pathOrSymbolBoost(item, request) {
  const pathMatch = item.path && request.paths.some((target) => item.path === target || item.path.includes(target) || target.includes(item.path));
  const symbolMatch = item.symbol && request.symbols.some((symbol) => item.symbol === symbol || item.symbol.includes(symbol));
  return pathMatch || symbolMatch ? 1 : 0;
}

function matchesPathOrSymbol(node, request) {
  return request.paths.some((target) => node.path === target || String(node.path || "").includes(target)) ||
    request.symbols.some((symbol) => node.name === symbol || String(node.name || "").includes(symbol));
}

function staleVersion(item) {
  return item.metadata && item.metadata.stale === true || item.risk === "stale";
}

function contradicts(left, right) {
  const leftText = String(left || "").toLowerCase();
  const rightText = String(right || "").toLowerCase();
  const leftNegates = /\b(no|never|must not|do not|forbid|forbidden|avoid)\b/.test(leftText);
  const rightNegates = /\b(no|never|must not|do not|forbid|forbidden|avoid)\b/.test(rightText);
  const shared = tokenize(leftText).some((token) => tokenize(rightText).includes(token) && !["must", "not", "with", "from", "this", "that"].includes(token));
  return shared && leftNegates !== rightNegates;
}

function deterministicSummary(item) {
  return `${item.title || item.source}: ${String(item.content || item.summary || "").slice(0, 160)}`;
}

function compactWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateByTokens(content, maxTokens, engine) {
  let output = String(content).slice(0, Math.max(1, maxTokens * 3));
  while (engine.estimateTokens(output) > maxTokens && output.length > 1) {
    output = output.slice(0, Math.max(1, output.length - 4));
  }
  return output;
}

function reducedMetadata(metadata) {
  const keep = {};
  for (const key of ["graphNodeIds", "contentHash", "version", "importance", "confidence", "status", "mandatory", "protected", "directExecutionTarget"]) {
    if (metadata && metadata[key] !== undefined) keep[key] = metadata[key];
  }
  return keep;
}

function selectionReason(item) {
  if (item.source === CONTEXT_SOURCES.USER_INSTRUCTION) return "Current user instruction has highest authority.";
  if (item.source === CONTEXT_SOURCES.DURABLE_DECISION) return "Relevant durable decision is authoritative.";
  if (item.tags.includes("acceptance-criteria")) return "Acceptance criteria are mandatory.";
  return `Selected for ${item.source} authority and relevance.`;
}

function selectionExplanation(items, omitted) {
  return {
    selectedCount: items.length,
    omittedCount: omitted.length,
    selectedItemIds: items.map((item) => item.id),
  };
}

function dedupeItems(items) {
  const byKey = new Map();
  for (const item of items) {
    const key = itemIdentity(item);
    const existing = byKey.get(key);
    if (!existing || rankItem(item, { objective: item.title, paths: [], symbols: [] }) > rankItem(existing, { objective: existing.title, paths: [], symbols: [] })) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values()).sort(compareItems);
}

function itemIdentity(item) {
  return stableSerialize({
    source: item.source,
    sourceId: item.sourceId,
    projectId: item.projectId,
    path: item.path,
    symbol: item.symbol,
    contentHash: item.metadata && (item.metadata.contentHash || item.metadata.version) || stableHash(item.content),
  });
}

function normalizeCollectorOutput(output) {
  if (!output) return [];
  if (Array.isArray(output)) return output;
  if (Array.isArray(output.items)) return output.items;
  return [output];
}

function normalizeCollectors(collectors) {
  return asArray(collectors).filter(Boolean).map((collector) => {
    if (!collector || typeof collector.collect !== "function") throw new Error("Context collector requires collect().");
    return collector;
  });
}

function normalizeBounds(input) {
  return {
    ...DEFAULT_BOUNDS,
    ...clonePlainObject(input || {}),
    perSourceTokenLimits: {
      ...DEFAULT_BOUNDS.perSourceTokenLimits,
      ...clonePlainObject(input && input.perSourceTokenLimits || {}),
    },
  };
}

function isContextRequest(value) {
  return isPlainObject(value) && value.id && value.purpose && value.objective && Array.isArray(value.paths);
}

function isInactiveLearning(item) {
  return item.source === CONTEXT_SOURCES.CROSS_SESSION_LEARNING && ["ARCHIVED", "REJECTED", "SUPERSEDED"].includes(item.metadata.status);
}

function historySources() {
  return new Set([CONTEXT_SOURCES.EXECUTION_HISTORY, CONTEXT_SOURCES.REPAIR_HISTORY, CONTEXT_SOURCES.APPROVAL_HISTORY, CONTEXT_SOURCES.VALIDATION_RESULT, CONTEXT_SOURCES.COMPLETION_EVIDENCE]);
}

function riskForItem(input) {
  if (input.risk) return input.risk;
  if (input.metadata && input.metadata.stale === true) return "stale";
  const text = `${input.title || ""} ${input.content || ""}`;
  if (/\b(secret|token|credential|auth|permission|delete|shell|network|critical)\b/i.test(text)) return "security-sensitive";
  return "normal";
}

function freshnessFor(timestamp) {
  if (!timestamp) return 0.75;
  const ageMs = Math.max(0, Date.now() - Date.parse(timestamp));
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return Math.max(0, 1 - ageMs / thirtyDays);
}

function evidencePath(evidence) {
  const entry = asArray(evidence).find((candidate) => candidate && typeof candidate.source === "string");
  return entry ? entry.source : null;
}

function compactPackageForPersistence(pkg) {
  return {
    ...clonePlainObject(pkg),
    items: pkg.items.map((item) => ({
      ...item,
      content: item.metadata && item.metadata.protected ? item.content : item.content.slice(0, 1000),
    })),
  };
}

function validateSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) throw new Error("Context intelligence snapshot must be an object.");
  if (snapshot.schemaVersion !== CONTEXT_SCHEMA_VERSION) throw new Error("Context intelligence snapshot schema version is unsupported.");
  if (!Array.isArray(snapshot.packages)) throw new Error("Context intelligence snapshot requires packages.");
}

function migrateSnapshot(snapshot, migrations) {
  let current = clonePlainObject(snapshot);
  for (const migration of migrations) {
    if (typeof migration === "function") current = migration(current);
  }
  return current;
}

function defaultPersistencePath(repositoryPath) {
  if (!repositoryPath) throw new Error("Context intelligence persistence requires a repository path or file path.");
  return path.join(repositoryPath, ".levi", "context-intelligence.json");
}

function normalizePurpose(purpose) {
  if (!Object.values(CONTEXT_PURPOSES).includes(purpose)) throw new Error("Context purpose is invalid.");
  return purpose;
}

function normalizeSource(source) {
  if (!Object.values(CONTEXT_SOURCES).includes(source)) throw new Error("Context source is invalid.");
  return source;
}

function normalizePackageStatus(status) {
  if (!Object.values(CONTEXT_PACKAGE_STATUSES).includes(status)) throw new Error("Context package status is invalid.");
  return status;
}

function normalizeStringArray(value) {
  return uniqueSorted(asArray(value).map((entry) => String(entry).trim()).filter(Boolean));
}

function normalizeStringSet(value) {
  return new Set(normalizeStringArray(value));
}

function tokenize(value) {
  return normalizeStringArray(String(value || "").toLowerCase().split(/[^a-z0-9_$.-]+/i)).filter((token) => token.length > 1);
}

function normalizeScore(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null) return new Date().toISOString();
  const timestamp = typeof value === "number" ? new Date(value).toISOString() : String(value);
  if (Number.isNaN(Date.parse(timestamp))) throw new Error("Context timestamp must be valid.");
  return timestamp;
}

function compareItems(left, right) {
  return left.source.localeCompare(right.source) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
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

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  CONTEXT_EVENTS,
  CONTEXT_EVENT_TYPES,
  CONTEXT_PACKAGE_STATUSES,
  CONTEXT_PURPOSES,
  CONTEXT_SCHEMA_VERSION,
  CONTEXT_SOURCES,
  ContextIntelligenceEngine,
};
