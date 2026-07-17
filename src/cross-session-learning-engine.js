const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const LEARNING_SCHEMA_VERSION = 1;

const LEARNING_RECORD_TYPES = Object.freeze({
  PROJECT_CONVENTION: "project_convention",
  USER_PREFERENCE: "user_preference",
  ARCHITECTURE_PATTERN: "architecture_pattern",
  DURABLE_DECISION: "durable_decision",
  SUCCESSFUL_STRATEGY: "successful_strategy",
  FAILED_STRATEGY: "failed_strategy",
  REPAIR_OUTCOME: "repair_outcome",
  APPROVAL_PATTERN: "approval_pattern",
  SECURITY_LESSON: "security_lesson",
  VALIDATION_LESSON: "validation_lesson",
  COMPLETION_LESSON: "completion_lesson",
  REPOSITORY_FACT: "repository_fact",
});

const LEARNING_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  SUPERSEDED: "SUPERSEDED",
  CONFLICTED: "CONFLICTED",
  REJECTED: "REJECTED",
  ARCHIVED: "ARCHIVED",
});

const LEARNING_CONFLICT_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  RESOLVED: "RESOLVED",
});

const CROSS_SESSION_LEARNING_EVENTS = Object.freeze({
  LIFECYCLE: "lifecycle",
});

const CROSS_SESSION_LEARNING_EVENT_TYPES = Object.freeze({
  RECORDED: "learning_recorded",
  UPDATED: "learning_updated",
  RETRIEVED: "learning_retrieved",
  USED: "learning_used",
  CONFLICT_DETECTED: "learning_conflict_detected",
  CONFLICT_RESOLVED: "learning_conflict_resolved",
  SUPERSEDED: "learning_superseded",
  ARCHIVED: "learning_archived",
  PERSISTED: "learning_persisted",
  RESTORED: "learning_restored",
  EXTRACTION_STARTED: "learning_extraction_started",
  EXTRACTION_COMPLETED: "learning_extraction_completed",
});

const DURABLE_DECISION_AUTHORITY_BONUS = 0.25;
const CONFIRMING_EVIDENCE_BOOST = 0.08;
const CONTRADICTORY_EVIDENCE_PENALTY = 0.2;

class CrossSessionLearningEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.records = new Map();
    this.semanticIndex = new Map();
    this.conflicts = new Map();
    this.projectId = options.projectId || null;
    this.repositoryPath = options.repositoryPath ? path.resolve(options.repositoryPath) : null;
    this.persistencePath = options.persistencePath || null;
    this.extractors = normalizeExtractors(options.extractors || []);
    this.repositoryGraph = options.repositoryGraph || null;
    this.memoryStore = options.memoryStore || null;
    this.migrations = Array.isArray(options.migrations) ? options.migrations.slice() : [];
    this.createdAt = normalizeTimestamp(options.createdAt);
    this.updatedAt = normalizeTimestamp(options.updatedAt || this.createdAt);
    this.metadata = clonePlainObject(options.metadata || {});
  }

  record(input, options = {}) {
    let normalized = normalizeLearningRecord(input, {
      projectId: options.projectId || this.projectId,
      timestamp: options.timestamp,
    });
    const graph = options.repositoryGraph || this.repositoryGraph;
    const existingBySemanticKey = this.semanticIndex.get(normalized.metadata.semanticKey);
    const existing = existingBySemanticKey ? this.records.get(existingBySemanticKey) : null;

    attachGraphLinks(normalized, graph);

    if (existing && isContradictory(existing, normalized)) {
      if (normalized.id === existing.id) {
        normalized = {
          ...normalized,
          id: `learning:${stableHash({
            semanticKey: normalized.metadata.semanticKey,
            summary: normalized.summary,
            evidence: normalized.evidence,
          })}`,
        };
      }
      const conflict = this.createConflict([existing.id, normalized.id], contradictionReason(existing, normalized), normalized.evidence, options);
      const nextRecord = {
        ...normalized,
        status: existing.type === LEARNING_RECORD_TYPES.DURABLE_DECISION ? LEARNING_STATUSES.CONFLICTED : normalized.status,
        metadata: {
          ...normalized.metadata,
          conflictId: conflict.id,
        },
      };
      const reduced = reduceConfidence(existing);
      this.records.set(existing.id, reduced);
      this.emitLifecycle(CROSS_SESSION_LEARNING_EVENT_TYPES.UPDATED, { record: clonePlainObject(reduced) });
      this.records.set(nextRecord.id, nextRecord);
      if (existing.type !== LEARNING_RECORD_TYPES.DURABLE_DECISION) {
        this.semanticIndex.set(nextRecord.metadata.semanticKey, nextRecord.id);
      }
      this.emitLifecycle(CROSS_SESSION_LEARNING_EVENT_TYPES.RECORDED, { record: clonePlainObject(nextRecord) });
      return clonePlainObject(nextRecord);
    }

    if (existing) {
      const merged = mergeConfirmingRecord(existing, normalized);
      attachGraphLinks(merged, graph);
      this.records.set(merged.id, merged);
      this.emitLifecycle(CROSS_SESSION_LEARNING_EVENT_TYPES.UPDATED, { record: clonePlainObject(merged) });
      return clonePlainObject(merged);
    }

    this.records.set(normalized.id, normalized);
    this.semanticIndex.set(normalized.metadata.semanticKey, normalized.id);
    this.emitLifecycle(CROSS_SESSION_LEARNING_EVENT_TYPES.RECORDED, { record: clonePlainObject(normalized) });
    return clonePlainObject(normalized);
  }

  recordMany(inputs, options = {}) {
    const records = Array.isArray(inputs) ? inputs : [inputs];
    return records.map((input) => this.record(input, options));
  }

  learnFromSession(session, context = {}) {
    const snapshot = normalizeSessionSnapshot(session);
    const startedAt = normalizeTimestamp(context.timestamp);
    this.emitLifecycle(CROSS_SESSION_LEARNING_EVENT_TYPES.EXTRACTION_STARTED, {
      sessionId: snapshot.sessionId,
      projectId: context.projectId || this.projectId || snapshot.metadata.projectId || null,
    });

    const candidates = [
      ...extractSessionCandidates(snapshot, context),
      ...extractDurableDecisionCandidates(context),
      ...extractRepositoryChangeCandidates(context),
      ...extractUserCorrectionCandidates(context),
    ];

    for (const extractor of this.extractors) {
      const extracted = extractor.extract({
        session: snapshot,
        context: clonePlainObject(context),
        engine: this,
      });
      candidates.push(...normalizeExtractorOutput(extracted));
    }

    const promoted = candidates
      .filter((candidate) => shouldPromoteCandidate(candidate, context))
      .map((candidate) => this.record({
        ...candidate,
        projectId: candidate.projectId || context.projectId || this.projectId || snapshot.metadata.projectId || snapshot.sessionId,
        source: candidate.source || {
          kind: "execution-session",
          sessionId: snapshot.sessionId,
        },
        metadata: {
          ...clonePlainObject(candidate.metadata || {}),
          sessionId: snapshot.sessionId,
          extractedAt: startedAt,
        },
      }, {
        projectId: context.projectId || this.projectId || snapshot.metadata.projectId || snapshot.sessionId,
        repositoryGraph: context.repositoryGraph || this.repositoryGraph,
        timestamp: startedAt,
      }));

    this.emitLifecycle(CROSS_SESSION_LEARNING_EVENT_TYPES.EXTRACTION_COMPLETED, {
      sessionId: snapshot.sessionId,
      candidateCount: candidates.length,
      promotedCount: promoted.length,
    });
    return promoted;
  }

  retrieve(query = {}, options = {}) {
    const filtered = this.list({
      ...query,
      status: query.status || LEARNING_STATUSES.ACTIVE,
    });
    const ranked = this.rank(filtered, {
      ...options,
      ...query,
    });
    const limit = normalizeLimit(options.limit || query.limit);
    const results = ranked.slice(0, limit);
    this.emitLifecycle(CROSS_SESSION_LEARNING_EVENT_TYPES.RETRIEVED, {
      query: clonePlainObject(query),
      count: results.length,
    });
    return results;
  }

  rank(records, context = {}) {
    const candidates = (Array.isArray(records) ? records : []).map(normalizeRankRecord);
    return candidates
      .map((record) => ({
        ...record,
        score: rankRecord(record, context, this.repositoryGraph),
      }))
      .sort(compareRankedRecords)
      .map(clonePlainObject);
  }

  markUsed(id, options = {}) {
    const record = this.requireRecord(id);
    const timestamp = normalizeTimestamp(options.timestamp);
    const updated = {
      ...record,
      lastUsedAt: timestamp,
      useCount: record.useCount + 1,
      updatedAt: timestamp,
    };
    this.records.set(updated.id, updated);
    this.emitLifecycle(CROSS_SESSION_LEARNING_EVENT_TYPES.USED, { record: clonePlainObject(updated) });
    return clonePlainObject(updated);
  }

  supersede(id, replacement, options = {}) {
    const current = this.requireRecord(id);
    const replacementRecord = this.record({
      ...replacement,
      projectId: replacement.projectId || current.projectId,
      type: replacement.type || current.type,
      scope: replacement.scope || current.scope,
      metadata: {
        ...clonePlainObject(replacement.metadata || {}),
        supersedes: current.id,
      },
    }, options);
    const timestamp = normalizeTimestamp(options.timestamp);
    const superseded = {
      ...current,
      status: LEARNING_STATUSES.SUPERSEDED,
      updatedAt: timestamp,
      metadata: {
        ...clonePlainObject(current.metadata || {}),
        replacedBy: replacementRecord.id,
      },
    };
    this.records.set(current.id, superseded);
    this.emitLifecycle(CROSS_SESSION_LEARNING_EVENT_TYPES.SUPERSEDED, {
      record: clonePlainObject(superseded),
      replacement: clonePlainObject(replacementRecord),
    });
    return {
      record: clonePlainObject(superseded),
      replacement: clonePlainObject(replacementRecord),
    };
  }

  resolveConflict(conflictId, resolution = {}, options = {}) {
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) {
      throw new Error("Cross-session learning conflict was not found.");
    }
    const timestamp = normalizeTimestamp(options.timestamp);
    const resolved = {
      ...conflict,
      status: LEARNING_CONFLICT_STATUSES.RESOLVED,
      resolvedAt: timestamp,
      resolution: clonePlainObject(resolution),
      metadata: {
        ...clonePlainObject(conflict.metadata || {}),
        ...clonePlainObject(resolution.metadata || {}),
      },
    };

    if (resolution.winningRecordId) {
      for (const recordId of conflict.conflictingRecordIds) {
        const record = this.records.get(recordId);
        if (!record) {
          continue;
        }
        const nextStatus = recordId === resolution.winningRecordId ? LEARNING_STATUSES.ACTIVE : LEARNING_STATUSES.SUPERSEDED;
        this.records.set(recordId, {
          ...record,
          status: nextStatus,
          updatedAt: timestamp,
          metadata: {
            ...clonePlainObject(record.metadata || {}),
            conflictResolution: conflictId,
          },
        });
      }
    }

    this.conflicts.set(conflictId, resolved);
    this.emitLifecycle(CROSS_SESSION_LEARNING_EVENT_TYPES.CONFLICT_RESOLVED, { conflict: clonePlainObject(resolved) });
    return clonePlainObject(resolved);
  }

  archive(id, options = {}) {
    const record = this.requireRecord(id);
    const timestamp = normalizeTimestamp(options.timestamp);
    const archived = {
      ...record,
      status: LEARNING_STATUSES.ARCHIVED,
      updatedAt: timestamp,
    };
    this.records.set(id, archived);
    this.emitLifecycle(CROSS_SESSION_LEARNING_EVENT_TYPES.ARCHIVED, { record: clonePlainObject(archived) });
    return clonePlainObject(archived);
  }

  delete(id) {
    const record = this.records.get(id);
    if (!record) {
      return false;
    }
    this.records.delete(id);
    if (record.metadata && record.metadata.semanticKey) {
      this.semanticIndex.delete(record.metadata.semanticKey);
    }
    return true;
  }

  get(id) {
    const record = this.records.get(id);
    return record ? clonePlainObject(record) : null;
  }

  list(filter = {}) {
    const normalized = normalizeLearningFilter(filter);
    return Array.from(this.records.values())
      .filter((record) => matchesLearningFilter(record, normalized))
      .sort(compareLearningRecords)
      .map(clonePlainObject);
  }

  snapshot() {
    return {
      schemaVersion: LEARNING_SCHEMA_VERSION,
      projectId: this.projectId,
      repositoryPath: this.repositoryPath,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      metadata: clonePlainObject(this.metadata),
      records: Array.from(this.records.values()).sort(compareLearningRecords).map(clonePlainObject),
      conflicts: Array.from(this.conflicts.values()).sort(compareConflicts).map(clonePlainObject),
    };
  }

  restore(snapshot) {
    const migrated = migrateSnapshot(snapshot, this.migrations);
    validateSnapshot(migrated);
    this.records.clear();
    this.semanticIndex.clear();
    this.conflicts.clear();
    this.projectId = migrated.projectId || this.projectId;
    this.repositoryPath = migrated.repositoryPath || this.repositoryPath;
    this.createdAt = normalizeTimestamp(migrated.createdAt);
    this.updatedAt = normalizeTimestamp(migrated.updatedAt || migrated.createdAt);
    this.metadata = clonePlainObject(migrated.metadata || {});

    for (const record of migrated.records) {
      const normalized = normalizeLearningRecord(record, { projectId: this.projectId });
      this.records.set(normalized.id, normalized);
      this.semanticIndex.set(normalized.metadata.semanticKey, normalized.id);
    }

    for (const conflict of migrated.conflicts || []) {
      const normalized = normalizeConflict(conflict);
      this.conflicts.set(normalized.id, normalized);
    }

    this.emitLifecycle(CROSS_SESSION_LEARNING_EVENT_TYPES.RESTORED, {
      recordCount: this.records.size,
      conflictCount: this.conflicts.size,
    });
    return this.snapshot();
  }

  save(filePath = this.persistencePath || defaultPersistencePath(this.repositoryPath)) {
    const targetPath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${JSON.stringify(this.snapshot(), null, 2)}\n`, "utf8");
    this.persistencePath = targetPath;
    this.emitLifecycle(CROSS_SESSION_LEARNING_EVENT_TYPES.PERSISTED, { path: targetPath });
    return {
      status: "PERSISTED",
      path: targetPath,
      schemaVersion: LEARNING_SCHEMA_VERSION,
    };
  }

  load(filePath = this.persistencePath || defaultPersistencePath(this.repositoryPath), options = {}) {
    const targetPath = path.resolve(filePath);
    try {
      const snapshot = JSON.parse(fs.readFileSync(targetPath, "utf8"));
      this.restore(snapshot);
      this.persistencePath = targetPath;
      return {
        status: "LOADED",
        path: targetPath,
        schemaVersion: LEARNING_SCHEMA_VERSION,
      };
    } catch (error) {
      if (options.emptyOnCorruption === true) {
        this.records.clear();
        this.semanticIndex.clear();
        this.conflicts.clear();
        this.emitLifecycle(CROSS_SESSION_LEARNING_EVENT_TYPES.RESTORED, {
          recordCount: 0,
          conflictCount: 0,
          reason: error.message,
        });
        return {
          status: "EMPTY",
          path: targetPath,
          error: error.message,
        };
      }
      return {
        status: "CORRUPT",
        path: targetPath,
        error: error.message,
      };
    }
  }

  createConflict(recordIds, reason, evidence, options = {}) {
    const timestamp = normalizeTimestamp(options.timestamp);
    const conflict = normalizeConflict({
      id: `learning-conflict:${stableHash({ recordIds: recordIds.slice().sort(), reason, evidence })}`,
      conflictingRecordIds: uniqueSorted(recordIds),
      reason,
      evidence: normalizeEvidenceArray(evidence),
      status: LEARNING_CONFLICT_STATUSES.ACTIVE,
      createdAt: timestamp,
      resolvedAt: null,
      resolution: {},
      metadata: clonePlainObject(options.metadata || {}),
    });
    this.conflicts.set(conflict.id, conflict);
    this.emitLifecycle(CROSS_SESSION_LEARNING_EVENT_TYPES.CONFLICT_DETECTED, { conflict: clonePlainObject(conflict) });
    return conflict;
  }

  requireRecord(id) {
    const record = this.records.get(id);
    if (!record) {
      throw new Error("Cross-session learning record was not found.");
    }
    return record;
  }

  emitLifecycle(type, payload = {}) {
    this.emit(CROSS_SESSION_LEARNING_EVENTS.LIFECYCLE, {
      type,
      timestamp: new Date().toISOString(),
      schemaVersion: LEARNING_SCHEMA_VERSION,
      ...payload,
    });
  }
}

function normalizeLearningRecord(input, defaults = {}) {
  if (!isPlainObject(input)) {
    throw new Error("Cross-session learning record input must be an object.");
  }
  const type = normalizeLearningType(input.type);
  const projectId = requiredString(input.projectId || defaults.projectId, "Cross-session learning projectId is required.");
  const title = requiredString(input.title, "Cross-session learning title is required.");
  const summary = requiredString(input.summary, "Cross-session learning summary is required.");
  const scope = requiredString(input.scope || "project", "Cross-session learning scope is required.");
  const tags = uniqueSorted(asArray(input.tags).map(normalizeTag).filter(Boolean));
  const evidence = normalizeEvidenceArray(input.evidence || []);
  const semanticKey = input.semanticKey || semanticKeyFor({ type, projectId, title, scope, tags, metadata: input.metadata || {} });
  const timestamp = normalizeTimestamp(input.updatedAt || input.createdAt || defaults.timestamp);

  return {
    id: input.id || `learning:${stableHash(semanticKey)}`,
    type,
    projectId,
    title,
    summary,
    evidence,
    confidence: normalizeScore(input.confidence, defaultConfidenceFor(input, evidence)),
    importance: normalizeScore(input.importance, defaultImportanceFor(input)),
    source: normalizeSource(input.source),
    scope,
    status: normalizeStatus(input.status || LEARNING_STATUSES.ACTIVE),
    tags,
    metadata: {
      ...clonePlainObject(input.metadata || {}),
      semanticKey,
    },
    createdAt: normalizeTimestamp(input.createdAt || timestamp),
    updatedAt: timestamp,
    lastUsedAt: input.lastUsedAt ? normalizeTimestamp(input.lastUsedAt) : null,
    useCount: normalizeUseCount(input.useCount),
  };
}

function normalizeSessionSnapshot(session) {
  const source = session && typeof session.snapshot === "function" ? session.snapshot() : session;
  if (!isPlainObject(source)) {
    throw new Error("Cross-session learning requires an execution session snapshot.");
  }
  return {
    sessionId: requiredString(source.sessionId, "Cross-session learning sessionId is required."),
    objective: requiredString(source.objective, "Cross-session learning objective is required."),
    currentState: requiredString(source.currentState || "UNKNOWN", "Cross-session learning currentState is required."),
    completedSteps: normalizeStringArray(source.completedSteps || []),
    remainingSteps: normalizeStringArray(source.remainingSteps || []),
    approvalRequired: source.approvalRequired === true,
    errors: Array.isArray(source.errors) ? source.errors.map(clonePlainObject) : [],
    metadata: clonePlainObject(source.metadata || {}),
    startedAt: source.startedAt || null,
    updatedAt: source.updatedAt || null,
  };
}

function extractSessionCandidates(session, context) {
  const candidates = [];
  const projectId = context.projectId || session.metadata.projectId;
  const source = { kind: "execution-session", sessionId: session.sessionId };
  const validationPassed = session.metadata.validationPassed === true;
  const completed = session.currentState === "COMPLETED" || session.metadata.objectiveComplete === true;
  const failed = session.currentState === "FAILED" ||
    session.metadata.executionFailed === true ||
    session.metadata.validationPassed === false ||
    session.errors.length > 0;

  if (completed && validationPassed) {
    candidates.push({
      type: LEARNING_RECORD_TYPES.SUCCESSFUL_STRATEGY,
      projectId,
      title: `Successful strategy for ${session.objective}`,
      summary: `Completed ${session.completedSteps.length} steps with validation passing.`,
      evidence: evidenceFromSession(session, "successful completion"),
      confidence: 0.82,
      importance: 0.7,
      source,
      scope: "project",
      tags: ["execution", "success"],
      metadata: { promotionReason: "high-confidence successful outcome", completedSteps: session.completedSteps },
    });
  }

  if (failed) {
    candidates.push({
      type: LEARNING_RECORD_TYPES.FAILED_STRATEGY,
      projectId,
      title: `Failed strategy for ${session.objective}`,
      summary: session.errors[0] && session.errors[0].message ? session.errors[0].message : "Execution or validation failed.",
      evidence: evidenceFromSession(session, "failed execution"),
      confidence: 0.78,
      importance: session.errors.length > 1 ? 0.8 : 0.65,
      source,
      scope: "project",
      tags: ["execution", "failure"],
      metadata: { promotionReason: "high-severity failure" },
    });
  }

  const repairHistory = Array.isArray(session.metadata.repairHistory) ? session.metadata.repairHistory : [];
  for (const repair of repairHistory) {
    const success = ["REPAIRED", "RETRY_VALIDATION"].includes(repair.result);
    candidates.push({
      type: LEARNING_RECORD_TYPES.REPAIR_OUTCOME,
      projectId,
      title: `${success ? "Successful" : "Failed"} repair: ${repair.repairAction || repair.action || "repair attempt"}`,
      summary: repair.failureSummary || repair.result || "Repair outcome recorded.",
      evidence: repair.evidence || evidenceFromSession(session, "repair history"),
      confidence: success ? 0.8 : 0.72,
      importance: success ? 0.68 : 0.76,
      source,
      scope: "project",
      tags: ["repair", success ? "success" : "failure"],
      metadata: { promotionReason: success ? "high-confidence successful outcome" : "high-severity failure", repair },
    });
  }

  const approvalRecords = approvalEvidenceFromSession(session);
  for (const approval of approvalRecords) {
    candidates.push({
      type: LEARNING_RECORD_TYPES.APPROVAL_PATTERN,
      projectId,
      title: approval.title,
      summary: approval.summary,
      evidence: approval.evidence,
      confidence: approval.denied ? 0.84 : 0.72,
      importance: approval.denied ? 0.82 : 0.64,
      source,
      scope: "project",
      tags: ["approval", approval.denied ? "denied" : "approved"],
      metadata: { promotionReason: approval.denied ? "explicit user decision" : "approval history", approval },
    });
  }

  const securityFindings = Array.isArray(session.metadata.securityFindings) ? session.metadata.securityFindings : [];
  for (const finding of securityFindings) {
    if (!["HIGH", "CRITICAL"].includes(String(finding.severity || "").toUpperCase()) && finding.status !== "BLOCKED") {
      continue;
    }
    candidates.push({
      type: LEARNING_RECORD_TYPES.SECURITY_LESSON,
      projectId,
      title: finding.title || `Security lesson ${finding.ruleId || finding.id}`,
      summary: finding.description || finding.remediation || "High-severity security finding.",
      evidence: finding.evidence || evidenceFromSession(session, "security finding"),
      confidence: 0.86,
      importance: finding.severity === "CRITICAL" ? 0.95 : 0.86,
      source,
      scope: "project",
      tags: ["security", String(finding.severity || "HIGH").toLowerCase()],
      metadata: { promotionReason: "high-severity failure", securityFinding: finding },
    });
  }

  if (session.metadata.validationPassed !== undefined || session.metadata.validationStatus) {
    candidates.push({
      type: LEARNING_RECORD_TYPES.VALIDATION_LESSON,
      projectId,
      title: `Validation ${validationPassed ? "passed" : "failed"} for ${session.objective}`,
      summary: validationPassed ? "Validation passed after execution." : "Validation did not pass after execution.",
      evidence: evidenceFromSession(session, "validation outcome"),
      confidence: validationPassed ? 0.74 : 0.8,
      importance: validationPassed ? 0.58 : 0.72,
      source,
      scope: "project",
      tags: ["validation", validationPassed ? "success" : "failure"],
      metadata: { promotionReason: validationPassed ? "high-confidence successful outcome" : "high-severity failure" },
    });
  }

  const completionHistory = Array.isArray(session.metadata.completionHistory) ? session.metadata.completionHistory : [];
  for (const completion of completionHistory) {
    const result = String(completion.result || "UNKNOWN");
    if (!["COMPLETE", "BLOCKED", "REQUIRES_REVIEW", "INCOMPLETE"].includes(result)) {
      continue;
    }
    candidates.push({
      type: LEARNING_RECORD_TYPES.COMPLETION_LESSON,
      projectId,
      title: `Objective completion ${result}`,
      summary: completion.reasons && completion.reasons.length > 0 ? completion.reasons.join("; ") : `Completion result was ${result}.`,
      evidence: completion.findings || evidenceFromSession(session, "completion history"),
      confidence: result === "COMPLETE" ? 0.78 : 0.74,
      importance: result === "BLOCKED" ? 0.84 : 0.66,
      source,
      scope: "project",
      tags: ["completion", result.toLowerCase()],
      metadata: { promotionReason: result === "COMPLETE" ? "high-confidence successful outcome" : "durable architectural consequence", completion },
    });
  }

  return candidates;
}

function extractDurableDecisionCandidates(context) {
  return asArray(context.decisionRecords)
    .filter((record) => isPlainObject(record) && record.type === "approved-decision")
    .map((record) => ({
      type: LEARNING_RECORD_TYPES.DURABLE_DECISION,
      projectId: context.projectId || record.projectId,
      title: record.value && (record.value.category || record.value.decisionId) || record.id,
      summary: record.value && (record.value.statement || record.value.summary) || "Approved durable project decision.",
      evidence: record.value && record.value.evidence || record.source || [],
      confidence: 0.95,
      importance: 0.92,
      source: record.source || { kind: "project-decision", recordId: record.id },
      scope: record.value && record.value.scope || "project",
      tags: ["durable-decision", record.value && record.value.category].filter(Boolean),
      metadata: { promotionReason: "explicit user decision", durableDecisionId: record.id, decisionRecord: record },
    }));
}

function extractRepositoryChangeCandidates(context) {
  return asArray(context.repositoryChanges)
    .filter((change) => isPlainObject(change) && (change.path || change.newPath))
    .map((change) => ({
      type: LEARNING_RECORD_TYPES.REPOSITORY_FACT,
      projectId: context.projectId,
      title: `Repository change: ${change.path || change.newPath}`,
      summary: `Repository file ${change.path || change.newPath} was ${change.type || "changed"}.`,
      evidence: { source: change.path || change.newPath, signal: change.type || "repository change" },
      confidence: 0.7,
      importance: 0.55,
      source: { kind: "repository-change" },
      scope: "project",
      tags: ["repository", change.type || "changed"],
      metadata: { promotionReason: "repository change", paths: [change.path || change.newPath], change },
    }));
}

function extractUserCorrectionCandidates(context) {
  return asArray(context.userCorrections)
    .filter((correction) => isPlainObject(correction) && correction.summary)
    .map((correction) => ({
      type: LEARNING_RECORD_TYPES.USER_PREFERENCE,
      projectId: context.projectId,
      title: correction.title || "User correction",
      summary: correction.summary,
      evidence: correction.evidence || { source: "user", signal: "explicit correction" },
      confidence: 0.9,
      importance: 0.85,
      source: { kind: "user-correction" },
      scope: correction.scope || "project",
      tags: ["user-preference", ...asArray(correction.tags)],
      metadata: { promotionReason: "explicit user decision", correction },
    }));
}

function shouldPromoteCandidate(candidate, context) {
  if (!candidate || !candidate.type) {
    return false;
  }
  const reason = candidate.metadata && candidate.metadata.promotionReason;
  if (reason) {
    return true;
  }
  if (candidate.explicit === true || candidate.durable === true) {
    return true;
  }
  if (candidate.confidence >= 0.8 && asArray(candidate.evidence).length > 0) {
    return true;
  }
  if (context.promoteAll === true) {
    return true;
  }
  return false;
}

function approvalEvidenceFromSession(session) {
  const metadata = session.metadata || {};
  const results = [];
  if (metadata.approvalRequest) {
    results.push({
      title: `Approval required: ${metadata.approvalRequest.action || metadata.approvalRequest.id}`,
      summary: metadata.approvalRequest.reason || "Approval request paused execution.",
      evidence: { source: "approval-request", signal: metadata.approvalRequest.id || "approval required" },
      denied: false,
    });
  }
  for (const action of asArray(metadata.deniedActions || metadata.rejectedActions)) {
    results.push({
      title: `Rejected action: ${action.action || action.type || "action"}`,
      summary: action.reason || "Action was rejected or denied.",
      evidence: action.evidence || { source: "approval", signal: action.action || action.type || "denied action" },
      denied: true,
    });
  }
  for (const id of asArray(metadata.approvedApprovalRequestIds)) {
    results.push({
      title: `Approved request ${id}`,
      summary: "Approval request was explicitly approved.",
      evidence: { source: "approval", signal: id },
      denied: false,
    });
  }
  return results;
}

function evidenceFromSession(session, signal) {
  return [{
    source: session.sessionId,
    signal,
  }];
}

function mergeConfirmingRecord(existing, incoming) {
  const evidence = mergeEvidence(existing.evidence, incoming.evidence);
  const timestamp = normalizeTimestamp(incoming.updatedAt);
  return {
    ...existing,
    summary: existing.summary,
    evidence,
    confidence: Math.min(1, Math.max(existing.confidence, incoming.confidence) + CONFIRMING_EVIDENCE_BOOST),
    importance: Math.min(1, Math.max(existing.importance, incoming.importance) + (evidence.length > existing.evidence.length ? 0.03 : 0)),
    tags: uniqueSorted([...existing.tags, ...incoming.tags]),
    metadata: {
      ...clonePlainObject(existing.metadata || {}),
      ...clonePlainObject(incoming.metadata || {}),
      semanticKey: existing.metadata.semanticKey,
    },
    updatedAt: timestamp,
  };
}

function reduceConfidence(record) {
  return {
    ...record,
    confidence: Math.max(0, record.confidence - CONTRADICTORY_EVIDENCE_PENALTY),
    updatedAt: new Date().toISOString(),
  };
}

function isContradictory(existing, incoming) {
  const contradicts = asArray(incoming.metadata && (incoming.metadata.contradicts || incoming.metadata.contradictsRecordId));
  if (contradicts.includes(existing.id) || contradicts.includes(existing.metadata.semanticKey)) {
    return true;
  }
  if (incoming.metadata && incoming.metadata.contradiction === true) {
    return true;
  }
  return existing.metadata.semanticKey === incoming.metadata.semanticKey &&
    existing.summary.toLowerCase() !== incoming.summary.toLowerCase() &&
    (incoming.status === LEARNING_STATUSES.CONFLICTED || incoming.metadata.conflictsWithActive === true);
}

function contradictionReason(existing, incoming) {
  if (existing.type === LEARNING_RECORD_TYPES.DURABLE_DECISION) {
    return "New learning contradicts an authoritative durable decision.";
  }
  return `Learning record contradicts existing active lesson: ${existing.title}`;
}

function rankRecord(record, context, repositoryGraph) {
  let score = 0;
  if (!context.projectId || context.projectId === record.projectId) {
    score += 0.25;
  }
  if (!context.scope || context.scope === record.scope || record.scope === "project") {
    score += 0.12;
  }
  score += record.confidence * 0.2;
  score += record.importance * 0.2;
  score += Math.min(record.useCount, 10) * 0.015;
  score += tagScore(record, context.tags || context.tag) * 0.1;
  score += recencyScore(record.updatedAt) * 0.05;
  if (record.type === LEARNING_RECORD_TYPES.DURABLE_DECISION) {
    score += DURABLE_DECISION_AUTHORITY_BONUS;
  }
  if (repositoryGraph && graphProximityMatches(record, context)) {
    score += 0.12;
  }
  if (record.status !== LEARNING_STATUSES.ACTIVE) {
    score -= 1;
  }
  return Number(score.toFixed(6));
}

function tagScore(record, tags) {
  const desired = new Set(asArray(tags).map(normalizeTag).filter(Boolean));
  if (desired.size === 0) {
    return 0;
  }
  const matches = record.tags.filter((tag) => desired.has(tag)).length;
  return matches / desired.size;
}

function recencyScore(timestamp) {
  const ageMs = Math.max(0, Date.now() - Date.parse(timestamp));
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return Math.max(0, 1 - ageMs / thirtyDays);
}

function graphProximityMatches(record, context) {
  const graphNodeIds = new Set(asArray(record.metadata && record.metadata.graphNodeIds));
  if (graphNodeIds.size === 0) {
    return false;
  }
  const contextNodeIds = asArray(context.graphNodeIds || context.graphNodeId);
  return contextNodeIds.some((id) => graphNodeIds.has(id));
}

function attachGraphLinks(record, repositoryGraph) {
  if (!repositoryGraph || typeof repositoryGraph.findNodes !== "function") {
    return record;
  }
  const paths = uniqueSorted([
    ...asArray(record.metadata && record.metadata.paths),
    ...record.evidence.map((entry) => entry.source).filter((source) => typeof source === "string" && source.includes(".")),
  ].map((entry) => String(entry).replace(/\\/g, "/")));
  const graphNodeIds = new Set(asArray(record.metadata && record.metadata.graphNodeIds));
  for (const sourcePath of paths) {
    for (const node of repositoryGraph.findNodes({ path: sourcePath })) {
      graphNodeIds.add(node.id);
    }
  }
  if (graphNodeIds.size > 0) {
    record.metadata = {
      ...record.metadata,
      paths,
      graphNodeIds: Array.from(graphNodeIds).sort(),
    };
  }
  return record;
}

function normalizeExtractors(extractors) {
  return (Array.isArray(extractors) ? extractors : [extractors]).filter(Boolean).map((extractor) => {
    if (!isPlainObject(extractor) || typeof extractor.extract !== "function") {
      throw new Error("Cross-session learning extractor requires extract(context).");
    }
    return extractor;
  });
}

function normalizeExtractorOutput(output) {
  if (!output) {
    return [];
  }
  if (Array.isArray(output)) {
    return output;
  }
  if (Array.isArray(output.records)) {
    return output.records;
  }
  return [output];
}

function normalizeLearningType(type) {
  const normalized = requiredString(type, "Cross-session learning type is required.");
  if (!Object.values(LEARNING_RECORD_TYPES).includes(normalized)) {
    throw new Error("Cross-session learning type is invalid.");
  }
  return normalized;
}

function normalizeStatus(status) {
  const normalized = requiredString(status, "Cross-session learning status is required.");
  if (!Object.values(LEARNING_STATUSES).includes(normalized)) {
    throw new Error("Cross-session learning status is invalid.");
  }
  return normalized;
}

function normalizeConflict(conflict) {
  if (!isPlainObject(conflict)) {
    throw new Error("Cross-session learning conflict must be an object.");
  }
  return {
    id: requiredString(conflict.id, "Cross-session learning conflict id is required."),
    conflictingRecordIds: uniqueSorted(asArray(conflict.conflictingRecordIds).map((entry) => requiredString(entry, "Conflict record id is required."))),
    reason: requiredString(conflict.reason, "Cross-session learning conflict reason is required."),
    evidence: normalizeEvidenceArray(conflict.evidence || []),
    status: Object.values(LEARNING_CONFLICT_STATUSES).includes(conflict.status) ? conflict.status : LEARNING_CONFLICT_STATUSES.ACTIVE,
    createdAt: normalizeTimestamp(conflict.createdAt),
    resolvedAt: conflict.resolvedAt ? normalizeTimestamp(conflict.resolvedAt) : null,
    resolution: clonePlainObject(conflict.resolution || {}),
    metadata: clonePlainObject(conflict.metadata || {}),
  };
}

function normalizeEvidenceArray(evidence) {
  return asArray(evidence).map((entry) => {
    if (typeof entry === "string") {
      return { source: entry, signal: "evidence" };
    }
    if (!isPlainObject(entry)) {
      return { source: "unknown", signal: String(entry) };
    }
    return {
      source: requiredString(entry.source || "unknown", "Learning evidence source is required."),
      signal: requiredString(entry.signal || entry.title || entry.description || "evidence", "Learning evidence signal is required."),
      ...clonePlainObject(entry),
    };
  });
}

function normalizeSource(source) {
  if (source === undefined || source === null) {
    return { kind: "unknown" };
  }
  if (typeof source === "string") {
    return { kind: source };
  }
  if (!isPlainObject(source)) {
    return { kind: "unknown", value: String(source) };
  }
  return clonePlainObject(source);
}

function normalizeLearningFilter(filter) {
  return {
    ids: normalizeStringSet(filter.ids || filter.id),
    types: normalizeStringSet(filter.types || filter.type),
    projectIds: normalizeStringSet(filter.projectIds || filter.projectId),
    statuses: normalizeStringSet(filter.statuses || filter.status),
    scopes: normalizeStringSet(filter.scopes || filter.scope),
    tags: normalizeStringSet(filter.tags || filter.tag),
    keywords: normalizeStringSet(filter.keywords || filter.keyword),
  };
}

function matchesLearningFilter(record, filter) {
  return setMatches(filter.ids, record.id) &&
    setMatches(filter.types, record.type) &&
    setMatches(filter.projectIds, record.projectId) &&
    setMatches(filter.statuses, record.status) &&
    setMatches(filter.scopes, record.scope) &&
    tagsMatch(record.tags, filter.tags) &&
    keywordsMatch(record, filter.keywords);
}

function normalizeRankRecord(record) {
  return normalizeLearningRecord(record, { projectId: record.projectId });
}

function validateSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    throw new Error("Cross-session learning snapshot must be an object.");
  }
  if (snapshot.schemaVersion !== LEARNING_SCHEMA_VERSION) {
    throw new Error("Cross-session learning snapshot schema version is unsupported.");
  }
  if (!Array.isArray(snapshot.records)) {
    throw new Error("Cross-session learning snapshot requires records.");
  }
}

function migrateSnapshot(snapshot, migrations) {
  let current = clonePlainObject(snapshot);
  for (const migration of migrations) {
    if (typeof migration === "function") {
      current = migration(current);
    }
  }
  return current;
}

function defaultPersistencePath(repositoryPath) {
  if (!repositoryPath) {
    throw new Error("Cross-session learning persistence requires a repository path or file path.");
  }
  return path.join(repositoryPath, ".levi", "cross-session-learning.json");
}

function semanticKeyFor(input) {
  return stableSerialize({
    type: input.type,
    projectId: input.projectId,
    title: normalizeSemanticText(input.title),
    scope: input.scope,
    tags: input.tags,
    key: input.metadata && (input.metadata.semanticKeyHint || input.metadata.durableDecisionId),
  });
}

function defaultConfidenceFor(input, evidence) {
  if (input.type === LEARNING_RECORD_TYPES.DURABLE_DECISION) {
    return 0.95;
  }
  if (input.source && input.source.kind === "user-correction") {
    return 0.9;
  }
  return evidence.length > 0 ? 0.65 : 0.5;
}

function defaultImportanceFor(input) {
  if (input.type === LEARNING_RECORD_TYPES.DURABLE_DECISION) {
    return 0.9;
  }
  if (input.type === LEARNING_RECORD_TYPES.SECURITY_LESSON) {
    return 0.8;
  }
  return 0.5;
}

function normalizeScore(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, number));
}

function normalizeUseCount(value) {
  if (value === undefined || value === null) {
    return 0;
  }
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeLimit(value) {
  if (value === undefined || value === null) {
    return 50;
  }
  return Number.isInteger(value) && value > 0 ? Math.min(value, 500) : 50;
}

function normalizeStringArray(value) {
  return asArray(value).map((entry) => String(entry)).filter(Boolean);
}

function normalizeStringSet(value) {
  return new Set(normalizeStringArray(value));
}

function normalizeTag(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSemanticText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function setMatches(filters, value) {
  if (filters.size === 0) {
    return true;
  }
  const normalized = String(value || "").toLowerCase();
  return Array.from(filters).some((filter) => normalized === filter.toLowerCase() || normalized.includes(filter.toLowerCase()));
}

function tagsMatch(recordTags, filters) {
  if (filters.size === 0) {
    return true;
  }
  const tags = new Set(recordTags);
  return Array.from(filters).every((tag) => tags.has(tag.toLowerCase()));
}

function keywordsMatch(record, filters) {
  if (filters.size === 0) {
    return true;
  }
  const text = [
    record.id,
    record.type,
    record.title,
    record.summary,
    record.scope,
    record.tags.join(" "),
    JSON.stringify(record.metadata),
  ].join(" ").toLowerCase();
  return Array.from(filters).every((keyword) => text.includes(keyword.toLowerCase()));
}

function mergeEvidence(left, right) {
  const byKey = new Map();
  for (const evidence of [...left, ...right]) {
    byKey.set(stableSerialize({ source: evidence.source, signal: evidence.signal }), evidence);
  }
  return Array.from(byKey.values());
}

function compareRankedRecords(left, right) {
  return right.score - left.score || compareLearningRecords(left, right);
}

function compareLearningRecords(left, right) {
  return left.projectId.localeCompare(right.projectId) ||
    left.type.localeCompare(right.type) ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id);
}

function compareConflicts(left, right) {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function requiredString(value, message) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }
  return value.trim();
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null) {
    return new Date().toISOString();
  }
  const timestamp = typeof value === "number" ? new Date(value).toISOString() : String(value);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error("Cross-session learning timestamp must be valid.");
  }
  return timestamp;
}

function stableHash(value) {
  return crypto.createHash("sha256").update(stableSerialize(value)).digest("hex").slice(0, 16);
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  CROSS_SESSION_LEARNING_EVENTS,
  CROSS_SESSION_LEARNING_EVENT_TYPES,
  CrossSessionLearningEngine,
  LEARNING_CONFLICT_STATUSES,
  LEARNING_RECORD_TYPES,
  LEARNING_SCHEMA_VERSION,
  LEARNING_STATUSES,
};
