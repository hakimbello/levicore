const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { scanRepository } = require("./repository-scanner");
const { buildStructuralIndex, UNKNOWN } = require("./structural-index");
const { summarizeProject } = require("./project-summary");

const CODE_UNDERSTANDING_SCHEMA_VERSION = 1;

const CODE_ENTITY_TYPES = Object.freeze({
  REPOSITORY: "REPOSITORY",
  DIRECTORY: "DIRECTORY",
  FILE: "FILE",
  MODULE: "MODULE",
  PACKAGE: "PACKAGE",
  NAMESPACE: "NAMESPACE",
  CLASS: "CLASS",
  INTERFACE: "INTERFACE",
  TYPE: "TYPE",
  ENUM: "ENUM",
  FUNCTION: "FUNCTION",
  METHOD: "METHOD",
  CONSTRUCTOR: "CONSTRUCTOR",
  PROPERTY: "PROPERTY",
  VARIABLE: "VARIABLE",
  CONSTANT: "CONSTANT",
  PARAMETER: "PARAMETER",
  IMPORT: "IMPORT",
  EXPORT: "EXPORT",
  DEPENDENCY: "DEPENDENCY",
  TEST: "TEST",
  CONFIGURATION: "CONFIGURATION",
  ROUTE: "ROUTE",
  ENDPOINT: "ENDPOINT",
  DATABASE_MODEL: "DATABASE_MODEL",
  DATABASE_MIGRATION: "DATABASE_MIGRATION",
  DOCUMENTATION: "DOCUMENTATION",
  UNKNOWN: "UNKNOWN",
});

const CODE_RELATIONSHIP_TYPES = Object.freeze({
  CONTAINS: "CONTAINS",
  DECLARES: "DECLARES",
  IMPORTS: "IMPORTS",
  EXPORTS: "EXPORTS",
  REFERENCES: "REFERENCES",
  CALLS: "CALLS",
  CALLED_BY: "CALLED_BY",
  EXTENDS: "EXTENDS",
  IMPLEMENTS: "IMPLEMENTS",
  OVERRIDES: "OVERRIDES",
  DEPENDS_ON: "DEPENDS_ON",
  USED_BY: "USED_BY",
  TESTS: "TESTS",
  TESTED_BY: "TESTED_BY",
  CONFIGURES: "CONFIGURES",
  READS: "READS",
  WRITES: "WRITES",
  ROUTES_TO: "ROUTES_TO",
  CREATES: "CREATES",
  UPDATES: "UPDATES",
  DELETES: "DELETES",
  DOCUMENTS: "DOCUMENTS",
  RELATED_TO: "RELATED_TO",
});

const CODE_FINDING_CODES = Object.freeze({
  UNRESOLVED_SYMBOL: "unresolved_symbol",
  AMBIGUOUS_DEFINITION: "ambiguous_definition",
  CIRCULAR_DEPENDENCY: "circular_dependency",
  DEAD_CODE_CANDIDATE: "dead_code_candidate",
  MISSING_TEST_RELATIONSHIP: "missing_test_relationship",
  ARCHITECTURE_BOUNDARY_VIOLATION: "architecture_boundary_violation",
  STALE_ANALYSIS: "stale_analysis",
  UNSUPPORTED_LANGUAGE: "unsupported_language",
  INCOMPLETE_ANALYSIS: "incomplete_analysis",
  EXCESSIVE_IMPACT_SCOPE: "excessive_impact_scope",
});

const CODE_FINDING_SEVERITIES = Object.freeze({
  INFO: "INFO",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

const CODE_UNDERSTANDING_EVENTS = Object.freeze({
  LIFECYCLE: "lifecycle",
});

const CODE_UNDERSTANDING_EVENT_TYPES = Object.freeze({
  CODE_ANALYSIS_STARTED: "code_analysis_started",
  CODE_ANALYSIS_COMPLETED: "code_analysis_completed",
  FILE_ANALYSIS_STARTED: "file_analysis_started",
  FILE_ANALYSIS_COMPLETED: "file_analysis_completed",
  ENTITY_DISCOVERED: "entity_discovered",
  ENTITY_UPDATED: "entity_updated",
  ENTITY_REMOVED: "entity_removed",
  RELATIONSHIP_DISCOVERED: "relationship_discovered",
  RELATIONSHIP_REMOVED: "relationship_removed",
  CODE_ANALYSIS_SKIPPED: "code_analysis_skipped",
  ARCHITECTURE_ANALYSIS_COMPLETED: "architecture_analysis_completed",
  IMPACT_ANALYSIS_STARTED: "impact_analysis_started",
  IMPACT_ANALYSIS_COMPLETED: "impact_analysis_completed",
  CODE_FINDING_CREATED: "code_finding_created",
  CODE_UNDERSTANDING_PERSISTED: "code_understanding_persisted",
  CODE_UNDERSTANDING_RESTORED: "code_understanding_restored",
  CODE_UNDERSTANDING_CORRUPTION_DETECTED: "code_understanding_corruption_detected",
});

const CHANGE_TYPES = Object.freeze({
  CREATED: "created",
  MODIFIED: "modified",
  DELETED: "deleted",
  RENAMED: "renamed",
});

const DEFAULT_BOUNDS = Object.freeze({
  maximumFiles: 1000,
  maximumFileBytes: 1024 * 1024,
  maximumEntities: 10000,
  maximumRelationships: 20000,
  maximumTraversalDepth: 4,
  maximumImpactResults: 200,
  maximumAnalysisTimeMs: 30000,
  ignoredPaths: [],
  ignoredLanguages: [],
});

class CodeUnderstandingEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.projectId = options.projectId || null;
    this.repositoryPath = options.repositoryPath ? path.resolve(options.repositoryPath) : null;
    this.persistencePath = options.persistencePath || null;
    this.scanRepository = options.scanRepository || scanRepository;
    this.summarizeProject = options.summarizeProject || summarizeProject;
    this.languageAnalyzers = normalizeAnalyzers(options.languageAnalyzers || []);
    this.repositoryGraph = options.repositoryGraph || null;
    this.offlineIndex = options.offlineIndex || null;
    this.contextEngine = options.contextEngine || null;
    this.planningEngine = options.planningEngine || null;
    this.summaryAdapter = typeof options.summaryAdapter === "function" ? options.summaryAdapter : null;
    this.migrations = Array.isArray(options.migrations) ? options.migrations.slice() : [];
    this.bounds = normalizeBounds(options.bounds || {});
    this.entities = new Map();
    this.relationships = new Map();
    this.findings = new Map();
    this.fileHashes = new Map();
    this.results = [];
    this.createdAt = normalizeTimestamp(options.createdAt);
    this.updatedAt = normalizeTimestamp(options.updatedAt || this.createdAt);
    this.stats = emptyStats();
  }

  analyzeRepository(repositoryPath = this.repositoryPath, options = {}) {
    const root = path.resolve(repositoryPath || "");
    if (!root) {
      throw new Error("Code understanding analysis requires a repository path.");
    }
    const startedAt = Date.now();
    const timestamp = normalizeTimestamp(options.timestamp);
    this.emitLifecycle(CODE_UNDERSTANDING_EVENT_TYPES.CODE_ANALYSIS_STARTED, { repositoryPath: root });
    this.clear({ silent: true });
    this.repositoryPath = root;
    this.projectId = options.projectId || this.projectId || projectIdFor(root);
    this.createdAt = timestamp;
    this.updatedAt = timestamp;

    const scanResult = options.scanResult || this.scanRepository(root);
    const files = boundedFiles(scanResult.files, this.bounds, root, (file, reason) => {
      this.stats.filesSkipped += 1;
      this.emitLifecycle(CODE_UNDERSTANDING_EVENT_TYPES.CODE_ANALYSIS_SKIPPED, { path: file.path, reason });
      this.addFinding({
        code: reason === "language" ? CODE_FINDING_CODES.UNSUPPORTED_LANGUAGE : CODE_FINDING_CODES.INCOMPLETE_ANALYSIS,
        severity: CODE_FINDING_SEVERITIES.LOW,
        title: reason === "language" ? "Unsupported language skipped" : "File skipped by analysis bounds",
        description: `Code understanding skipped ${file.path} because of ${reason}.`,
        evidence: [{ source: file.path, signal: reason }],
        confidence: 0.8,
      });
    });
    const boundedScan = {
      ...scanResult,
      files,
      structuralIndex: buildStructuralIndex({ ...scanResult, files }),
    };
    this.addRepositoryEntity(root, timestamp);
    this.addFileTree(boundedScan, root, timestamp);
    this.addStructuralIndex(boundedScan.structuralIndex, timestamp);
    this.addDependencies(this.summarizeProject(boundedScan).dependencies, timestamp);
    this.addStructuralFindings(boundedScan.structuralIndex);
    this.integrateAdapters(options);
    this.recalculateSummaries();
    this.detectUnresolvedSymbols();
    this.detectBoundaryViolations(options);
    this.detectDeadCode(options);
    this.recalculateStats();
    this.stats.repositoriesAnalyzed += 1;
    this.stats.lastFullAnalysis = timestamp;

    const result = this.createResult({
      target: { type: CODE_ENTITY_TYPES.REPOSITORY, path: "." },
      startedAt,
      metadata: { repositoryPath: root, structuralIndexStatus: boundedScan.structuralIndex.status },
    });
    this.results.push(result);
    this.emitLifecycle(CODE_UNDERSTANDING_EVENT_TYPES.CODE_ANALYSIS_COMPLETED, {
      repositoryPath: root,
      entityCount: this.entities.size,
      relationshipCount: this.relationships.size,
      findingCount: this.findings.size,
    });
    return clonePlainObject(result);
  }

  analyzeFile(filePath, options = {}) {
    const relativePath = normalizePath(filePath);
    const root = path.resolve(options.repositoryPath || this.repositoryPath || ".");
    const fullPath = path.join(root, relativePath);
    const timestamp = normalizeTimestamp(options.timestamp);
    this.emitLifecycle(CODE_UNDERSTANDING_EVENT_TYPES.FILE_ANALYSIS_STARTED, { path: relativePath });
    const content = String(options.content !== undefined ? options.content : fs.readFileSync(fullPath, "utf8"));
    const contentHash = sha256(content);
    if (!options.force && this.fileHashes.get(relativePath) === contentHash) {
      this.stats.filesSkipped += 1;
      this.emitLifecycle(CODE_UNDERSTANDING_EVENT_TYPES.CODE_ANALYSIS_SKIPPED, { path: relativePath, reason: "unchanged" });
      return this.createResult({
        target: { type: CODE_ENTITY_TYPES.FILE, path: relativePath },
        entities: this.listEntities({ path: relativePath }),
        relationships: this.getRelationshipsForPath(relativePath),
        confidence: 1,
        completeness: 1,
        metadata: { skipped: true, reason: "unchanged" },
      });
    }
    this.removePath(relativePath);
    this.addFileEntity(relativePath, root, timestamp, contentHash);
    this.addContentAnalysis(relativePath, content, options.language || languageForPath(relativePath), {
      ...options,
      timestamp,
      contentHash,
    });
    this.fileHashes.set(relativePath, contentHash);
    this.recalculateSummaries();
    this.recalculateStats();
    this.updatedAt = timestamp;
    const result = this.createResult({
      target: { type: CODE_ENTITY_TYPES.FILE, path: relativePath },
      entities: this.listEntities({ path: relativePath }),
      relationships: this.getRelationshipsForPath(relativePath),
      confidence: 0.8,
      completeness: 0.75,
    });
    this.emitLifecycle(CODE_UNDERSTANDING_EVENT_TYPES.FILE_ANALYSIS_COMPLETED, {
      path: relativePath,
      entityCount: result.entities.length,
      relationshipCount: result.relationships.length,
    });
    return clonePlainObject(result);
  }

  analyzeContent(content, language = UNKNOWN, options = {}) {
    const relativePath = normalizePath(options.path || `content.${extensionForLanguage(language)}`);
    const timestamp = normalizeTimestamp(options.timestamp);
    const beforeEntities = this.entities.size;
    const beforeRelationships = this.relationships.size;
    this.addContentAnalysis(relativePath, String(content || ""), language, {
      ...options,
      timestamp,
      contentHash: sha256(content || ""),
      detached: true,
    });
    this.recalculateSummaries();
    return this.createResult({
      target: { type: CODE_ENTITY_TYPES.FILE, path: relativePath, language },
      entities: this.listEntities({ path: relativePath }),
      relationships: this.getRelationshipsForPath(relativePath),
      confidence: this.entities.size > beforeEntities || this.relationships.size > beforeRelationships ? 0.65 : 0.4,
      completeness: 0.5,
      metadata: { detached: true },
    });
  }

  update(changes, options = {}) {
    const normalized = normalizeChanges(changes);
    const timestamp = normalizeTimestamp(options.timestamp);
    for (const change of normalized) {
      if (change.type === CHANGE_TYPES.DELETED) {
        this.removePath(change.path);
        this.fileHashes.delete(change.path);
        continue;
      }
      if (change.type === CHANGE_TYPES.RENAMED) {
        this.removePath(change.oldPath);
        this.fileHashes.delete(change.oldPath);
        this.analyzeFile(change.newPath, { ...options, timestamp, force: true });
        continue;
      }
      this.analyzeFile(change.path, { ...options, timestamp, force: change.type === CHANGE_TYPES.CREATED });
    }
    this.stats.lastIncrementalUpdate = timestamp;
    this.updatedAt = timestamp;
    return this.snapshot();
  }

  getEntity(id) {
    const entity = this.entities.get(id);
    return entity ? clonePlainObject(entity) : null;
  }

  findEntity(query, options = {}) {
    const filters = normalizeEntityQuery(query);
    return Array.from(this.entities.values())
      .filter((entity) => matchesEntity(entity, filters))
      .map((entity) => scoreEntity(entity, filters, options))
      .filter((entry) => entry.score > 0 || filters.empty)
      .sort((left, right) => right.score - left.score || compareEntities(left.entity, right.entity))
      .slice(0, normalizePositiveInteger(options.limit, 50))
      .map((entry) => clonePlainObject({ ...entry.entity, confidence: entry.confidence, evidence: entry.evidence }));
  }

  listEntities(filter = {}) {
    const filters = normalizeEntityFilter(filter);
    return Array.from(this.entities.values())
      .filter((entity) => filterMatchesEntity(entity, filters))
      .sort(compareEntities)
      .map(clonePlainObject);
  }

  getRelationships(entityId, options = {}) {
    const direction = options.direction || "both";
    const types = normalizeStringSet(options.types || options.type);
    return Array.from(this.relationships.values())
      .filter((relationship) => (types.size === 0 || types.has(relationship.type)))
      .filter((relationship) =>
        (direction === "out" || direction === "both") && relationship.sourceId === entityId ||
        (direction === "in" || direction === "both") && relationship.targetId === entityId)
      .sort(compareRelationships)
      .map(clonePlainObject);
  }

  findDefinitions(query, options = {}) {
    return this.findEntity(query, options).filter((entity) => definitionTypes().has(entity.type));
  }

  findReferences(entityIdOrQuery, options = {}) {
    const ids = this.resolveEntityIds(entityIdOrQuery);
    return Array.from(this.relationships.values())
      .filter((relationship) => ids.has(relationship.targetId) || ids.has(relationship.sourceId))
      .filter((relationship) => relationship.type !== CODE_RELATIONSHIP_TYPES.CONTAINS)
      .sort(compareRelationships)
      .slice(0, normalizePositiveInteger(options.limit, 100))
      .map(clonePlainObject);
  }

  findCallers(entityIdOrQuery, options = {}) {
    const ids = this.resolveEntityIds(entityIdOrQuery);
    return this.relationshipsByTypes([CODE_RELATIONSHIP_TYPES.CALLS])
      .filter((relationship) => ids.has(relationship.targetId))
      .map((relationship) => this.entities.get(relationship.sourceId))
      .filter(Boolean)
      .sort(compareEntities)
      .slice(0, normalizePositiveInteger(options.limit, 100))
      .map(clonePlainObject);
  }

  findCallees(entityIdOrQuery, options = {}) {
    const ids = this.resolveEntityIds(entityIdOrQuery);
    return this.relationshipsByTypes([CODE_RELATIONSHIP_TYPES.CALLS])
      .filter((relationship) => ids.has(relationship.sourceId))
      .map((relationship) => this.entities.get(relationship.targetId))
      .filter(Boolean)
      .sort(compareEntities)
      .slice(0, normalizePositiveInteger(options.limit, 100))
      .map(clonePlainObject);
  }

  traceDependency(entityIdOrQuery, options = {}) {
    const roots = Array.from(this.resolveEntityIds(entityIdOrQuery));
    return this.traverse(roots, [CODE_RELATIONSHIP_TYPES.DEPENDS_ON, CODE_RELATIONSHIP_TYPES.IMPORTS], "out", options);
  }

  traceDataFlow(entityIdOrQuery, options = {}) {
    const roots = Array.from(this.resolveEntityIds(entityIdOrQuery));
    const trace = this.traverse(roots, [
      CODE_RELATIONSHIP_TYPES.READS,
      CODE_RELATIONSHIP_TYPES.WRITES,
      CODE_RELATIONSHIP_TYPES.CALLS,
      CODE_RELATIONSHIP_TYPES.ROUTES_TO,
    ], "out", options);
    return {
      ...trace,
      confidence: Math.min(trace.confidence, 0.55),
      completeness: "heuristic",
      limitations: ["Local data-flow tracing uses relationship evidence only and is not a full static analysis."],
    };
  }

  getArchitectureView(options = {}) {
    const dependencies = this.relationshipsByTypes([CODE_RELATIONSHIP_TYPES.DEPENDS_ON, CODE_RELATIONSHIP_TYPES.IMPORTS]);
    const view = {
      projectId: this.projectId || "default",
      modules: this.listEntities({ type: [CODE_ENTITY_TYPES.MODULE, CODE_ENTITY_TYPES.FILE] }),
      packages: this.listEntities({ type: CODE_ENTITY_TYPES.PACKAGE }),
      entryPoints: this.listEntities().filter((entity) => entity.tags.includes("entry-point") || entity.type === CODE_ENTITY_TYPES.ROUTE || entity.type === CODE_ENTITY_TYPES.ENDPOINT),
      dependencyLayers: dependencyLayers(this.entities, dependencies),
      publicInterfaces: this.listEntities().filter((entity) => entity.metadata.exported === true || [CODE_ENTITY_TYPES.EXPORT, CODE_ENTITY_TYPES.INTERFACE].includes(entity.type)),
      testBoundaries: this.listEntities({ type: CODE_ENTITY_TYPES.TEST }),
      configurationBoundaries: this.listEntities({ type: CODE_ENTITY_TYPES.CONFIGURATION }),
      persistenceBoundaries: this.listEntities().filter((entity) => [CODE_ENTITY_TYPES.DATABASE_MODEL, CODE_ENTITY_TYPES.DATABASE_MIGRATION].includes(entity.type)),
      externalIntegrations: this.listEntities({ type: CODE_ENTITY_TYPES.DEPENDENCY }),
      detectedCycles: findCycles(dependencies),
      detectedCrossBoundaryViolations: this.detectBoundaryViolations(options),
      findings: Array.from(this.findings.values()).filter((finding) =>
        [CODE_FINDING_CODES.CIRCULAR_DEPENDENCY, CODE_FINDING_CODES.ARCHITECTURE_BOUNDARY_VIOLATION].includes(finding.code)),
      metadata: { generatedAt: new Date().toISOString() },
    };
    for (const cycle of view.detectedCycles) {
      this.addFinding({
        code: CODE_FINDING_CODES.CIRCULAR_DEPENDENCY,
        severity: CODE_FINDING_SEVERITIES.MEDIUM,
        title: "Circular dependency detected",
        description: `A dependency cycle was detected: ${cycle.join(" -> ")}.`,
        entityIds: cycle,
        evidence: cycle.map((id) => ({ source: id, signal: "dependency cycle" })),
        confidence: 0.8,
      });
    }
    this.emitLifecycle(CODE_UNDERSTANDING_EVENT_TYPES.ARCHITECTURE_ANALYSIS_COMPLETED, {
      moduleCount: view.modules.length,
      cycleCount: view.detectedCycles.length,
    });
    return clonePlainObject(view);
  }

  getFileSummary(filePath, options = {}) {
    const relativePath = normalizePath(filePath);
    const entities = this.listEntities({ path: relativePath });
    const relationships = this.getRelationshipsForPath(relativePath);
    const summary = deterministicFileSummary(relativePath, entities, relationships);
    return this.summaryAdapter ? this.summaryAdapter(summary, { type: "file", path: relativePath, options }) || summary : summary;
  }

  getSymbolSummary(entityIdOrQuery, options = {}) {
    const entity = this.resolveEntities(entityIdOrQuery)[0];
    if (!entity) {
      return null;
    }
    const relationships = this.getRelationships(entity.id);
    const summary = deterministicSymbolSummary(entity, relationships);
    return this.summaryAdapter ? this.summaryAdapter(summary, { type: "symbol", entity, options }) || summary : summary;
  }

  explainCode(target, options = {}) {
    const entity = typeof target === "string" ? this.resolveEntities(target)[0] : null;
    if (entity) {
      return {
        target: clonePlainObject(entity),
        summary: this.getSymbolSummary(entity.id, options),
        relationships: this.getRelationships(entity.id),
        evidence: relationshipEvidence(this.getRelationships(entity.id)),
        confidence: 0.8,
      };
    }
    const relativePath = normalizePath(target && target.path || target);
    return {
      target: { path: relativePath },
      summary: this.getFileSummary(relativePath, options),
      entities: this.listEntities({ path: relativePath }),
      relationships: this.getRelationshipsForPath(relativePath),
      confidence: 0.75,
    };
  }

  analyzeChangeImpact(change, options = {}) {
    this.emitLifecycle(CODE_UNDERSTANDING_EVENT_TYPES.IMPACT_ANALYSIS_STARTED, { change: clonePlainObject(change || {}) });
    const targets = affectedEntitiesForChange(this, change);
    const directIds = new Set(targets.map((entity) => entity.id));
    const impact = this.traverse(Array.from(directIds), [
      CODE_RELATIONSHIP_TYPES.CALLS,
      CODE_RELATIONSHIP_TYPES.CALLED_BY,
      CODE_RELATIONSHIP_TYPES.DEPENDS_ON,
      CODE_RELATIONSHIP_TYPES.IMPORTS,
      CODE_RELATIONSHIP_TYPES.TESTED_BY,
      CODE_RELATIONSHIP_TYPES.TESTS,
      CODE_RELATIONSHIP_TYPES.CONFIGURES,
      CODE_RELATIONSHIP_TYPES.ROUTES_TO,
    ], "both", { ...options, limit: this.bounds.maximumImpactResults });
    const transitiveIds = new Set(impact.entities.map((entity) => entity.id));
    const allIds = new Set([...directIds, ...transitiveIds]);
    const relationships = Array.from(this.relationships.values()).filter((relationship) =>
      allIds.has(relationship.sourceId) || allIds.has(relationship.targetId));
    const impactedPaths = new Set(Array.from(allIds).map((id) => this.entities.get(id)?.path).filter(Boolean));
    const relatedTests = uniqueEntities([
      ...Array.from(allIds).map((id) => this.entities.get(id)).filter((entity) => entity && entity.type === CODE_ENTITY_TYPES.TEST),
      ...this.listEntities({ type: CODE_ENTITY_TYPES.TEST }).filter((testEntity) =>
        sourceCandidatesForTest(testEntity.path).some((candidate) => impactedPaths.has(candidate)) ||
        this.getRelationships(testEntity.id, { direction: "out", type: CODE_RELATIONSHIP_TYPES.TESTS })
          .some((relationship) => impactedPaths.has(this.entities.get(relationship.targetId)?.path))),
    ]);
    if (impact.entities.length >= this.bounds.maximumImpactResults) {
      this.addFinding({
        code: CODE_FINDING_CODES.EXCESSIVE_IMPACT_SCOPE,
        severity: CODE_FINDING_SEVERITIES.MEDIUM,
        title: "Impact scope reached configured bound",
        description: "Change impact analysis stopped at the configured maximum result count.",
        entityIds: Array.from(allIds),
        evidence: [{ source: "impact-analysis", signal: "maximumImpactResults" }],
        confidence: 0.8,
      });
    }
    const result = {
      id: `impact:${stableHash({ change, directIds: Array.from(directIds) })}`,
      projectId: this.projectId || "default",
      directlyAffectedEntities: targets.map(clonePlainObject),
      transitiveDependents: impact.entities.map(clonePlainObject),
      callers: uniqueEntities(targets.flatMap((entity) => this.findCallers(entity.id))),
      callees: uniqueEntities(targets.flatMap((entity) => this.findCallees(entity.id))),
      relatedTests: relatedTests.map(clonePlainObject),
      configurationImpact: relationships.filter((relationship) => relationship.type === CODE_RELATIONSHIP_TYPES.CONFIGURES).map(clonePlainObject),
      likelyValidationScope: validationScopeFor(targets, relatedTests),
      architecturalBoundariesCrossed: boundaryCrossings(relationships, this.entities),
      confidence: impact.confidence,
      evidence: impact.evidence,
      metadata: { traversalDepth: impact.depth, bounded: impact.bounded },
      createdAt: new Date().toISOString(),
    };
    this.emitLifecycle(CODE_UNDERSTANDING_EVENT_TYPES.IMPACT_ANALYSIS_COMPLETED, {
      impactId: result.id,
      directCount: result.directlyAffectedEntities.length,
      transitiveCount: result.transitiveDependents.length,
    });
    return clonePlainObject(result);
  }

  detectDeadCode(options = {}) {
    const candidates = this.listEntities()
      .filter((entity) => deadCodeEligibleTypes().has(entity.type))
      .filter((entity) => entity.metadata.exported !== true)
      .filter((entity) => !entity.tags.includes("entry-point") && !entity.tags.includes("framework-convention"))
      .filter((entity) => this.getRelationships(entity.id, { direction: "in" }).filter((rel) => rel.type !== CODE_RELATIONSHIP_TYPES.CONTAINS && rel.type !== CODE_RELATIONSHIP_TYPES.DECLARES).length === 0)
      .filter((entity) => !isRuntimeRegistered(entity, this.relationships));
    for (const entity of candidates) {
      this.addFinding({
        code: CODE_FINDING_CODES.DEAD_CODE_CANDIDATE,
        severity: CODE_FINDING_SEVERITIES.LOW,
        title: "Dead code candidate",
        description: `${entity.qualifiedName} has no known inbound references and is not exported.`,
        entityIds: [entity.id],
        evidence: [{ source: entity.path, signal: "no inbound references" }],
        confidence: 0.55,
      });
    }
    return candidates.map(clonePlainObject);
  }

  detectUnresolvedSymbols() {
    return Array.from(this.findings.values())
      .filter((finding) => finding.code === CODE_FINDING_CODES.UNRESOLVED_SYMBOL)
      .sort(compareFindings)
      .map(clonePlainObject);
  }

  detectBoundaryViolations(options = {}) {
    const violations = [];
    const rules = Array.isArray(options.boundaryRules) ? options.boundaryRules : [];
    for (const rule of rules) {
      for (const relationship of this.relationships.values()) {
        const source = this.entities.get(relationship.sourceId);
        const target = this.entities.get(relationship.targetId);
        if (!source || !target) {
          continue;
        }
        if (matchesBoundaryRule(source, target, relationship, rule)) {
          const finding = this.addFinding({
            code: CODE_FINDING_CODES.ARCHITECTURE_BOUNDARY_VIOLATION,
            severity: rule.severity || CODE_FINDING_SEVERITIES.MEDIUM,
            title: rule.title || "Architecture boundary violation",
            description: rule.description || `${source.path} depends on ${target.path}.`,
            entityIds: [source.id, target.id],
            relationshipIds: [relationship.id],
            evidence: [relationship.evidence],
            confidence: relationship.confidence,
            metadata: { ruleId: rule.id || "custom-boundary" },
          });
          violations.push(finding);
        }
      }
    }
    return violations.map(clonePlainObject);
  }

  getStats() {
    this.recalculateStats();
    return clonePlainObject(this.stats);
  }

  snapshot() {
    return {
      schemaVersion: CODE_UNDERSTANDING_SCHEMA_VERSION,
      projectId: this.projectId,
      repositoryPath: this.repositoryPath,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      bounds: clonePlainObject(this.bounds),
      stats: this.getStats(),
      fileHashes: Object.fromEntries(Array.from(this.fileHashes.entries()).sort(compareEntries)),
      entities: Array.from(this.entities.values()).sort(compareEntities).map(clonePlainObject),
      relationships: Array.from(this.relationships.values()).sort(compareRelationships).map(clonePlainObject),
      findings: Array.from(this.findings.values()).sort(compareFindings).map(clonePlainObject),
      results: this.results.map(clonePlainObject),
    };
  }

  restore(snapshot) {
    const migrated = migrateSnapshot(snapshot, this.migrations);
    validateSnapshot(migrated);
    this.clear({ silent: true });
    this.projectId = migrated.projectId || this.projectId;
    this.repositoryPath = migrated.repositoryPath || this.repositoryPath;
    this.createdAt = normalizeTimestamp(migrated.createdAt);
    this.updatedAt = normalizeTimestamp(migrated.updatedAt || migrated.createdAt);
    this.bounds = normalizeBounds(migrated.bounds || this.bounds);
    this.stats = { ...emptyStats(), ...clonePlainObject(migrated.stats || {}) };
    this.fileHashes = new Map(Object.entries(migrated.fileHashes || {}).sort(compareEntries));
    for (const entity of migrated.entities) this.entities.set(entity.id, normalizeEntity(entity, this));
    for (const relationship of migrated.relationships) this.relationships.set(relationship.id, normalizeRelationship(relationship, this));
    for (const finding of migrated.findings) this.findings.set(finding.id, normalizeFinding(finding));
    this.results = Array.isArray(migrated.results) ? migrated.results.map(clonePlainObject) : [];
    this.emitLifecycle(CODE_UNDERSTANDING_EVENT_TYPES.CODE_UNDERSTANDING_RESTORED, {
      entityCount: this.entities.size,
      relationshipCount: this.relationships.size,
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
    this.emitLifecycle(CODE_UNDERSTANDING_EVENT_TYPES.CODE_UNDERSTANDING_PERSISTED, {
      path: targetPath,
      schemaVersion: CODE_UNDERSTANDING_SCHEMA_VERSION,
    });
    return { status: "PERSISTED", path: targetPath, schemaVersion: CODE_UNDERSTANDING_SCHEMA_VERSION };
  }

  load(filePath = this.persistencePath || defaultPersistencePath(this.repositoryPath), options = {}) {
    const targetPath = path.resolve(filePath);
    try {
      this.restore(JSON.parse(fs.readFileSync(targetPath, "utf8")));
      this.persistencePath = targetPath;
      return { status: "LOADED", path: targetPath, schemaVersion: CODE_UNDERSTANDING_SCHEMA_VERSION };
    } catch (error) {
      this.emitLifecycle(CODE_UNDERSTANDING_EVENT_TYPES.CODE_UNDERSTANDING_CORRUPTION_DETECTED, {
        path: targetPath,
        reason: error.message,
      });
      if (options.emptyOnCorruption === true) {
        this.clear({ silent: true });
        this.emitLifecycle(CODE_UNDERSTANDING_EVENT_TYPES.CODE_UNDERSTANDING_RESTORED, { entityCount: 0, relationshipCount: 0 });
        return { status: "EMPTY", path: targetPath, error: error.message };
      }
      return { status: "CORRUPT", path: targetPath, error: error.message };
    }
  }

  clear(options = {}) {
    this.entities.clear();
    this.relationships.clear();
    this.findings.clear();
    this.fileHashes.clear();
    this.results = [];
    this.stats = emptyStats();
    if (!options.silent) {
      this.updatedAt = new Date().toISOString();
    }
  }

  addRepositoryEntity(root, timestamp) {
    this.addEntity({
      type: CODE_ENTITY_TYPES.REPOSITORY,
      name: path.basename(root) || root,
      qualifiedName: path.basename(root) || root,
      path: ".",
      language: "Repository",
      metadata: { repositoryPath: root },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  addFileTree(scanResult, root, timestamp) {
    const repository = this.listEntities({ type: CODE_ENTITY_TYPES.REPOSITORY })[0];
    for (const file of safeFiles(scanResult.files)) {
      const relativePath = normalizePath(file.path);
      const parts = relativePath.split("/");
      let parent = repository;
      let directoryPath = "";
      for (let index = 0; index < parts.length - 1; index += 1) {
        directoryPath = directoryPath ? `${directoryPath}/${parts[index]}` : parts[index];
        const directory = this.addEntity({
          type: CODE_ENTITY_TYPES.DIRECTORY,
          name: parts[index],
          qualifiedName: directoryPath,
          path: directoryPath,
          language: "Directory",
          metadata: {},
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        if (parent) this.addRelationship({ type: CODE_RELATIONSHIP_TYPES.CONTAINS, sourceId: parent.id, targetId: directory.id, path: directoryPath, evidence: { source: directoryPath, signal: "directory hierarchy" }, createdAt: timestamp, updatedAt: timestamp });
        parent = directory;
      }
      const fileEntity = this.addFileEntity(relativePath, root, timestamp);
      if (parent) this.addRelationship({ type: CODE_RELATIONSHIP_TYPES.CONTAINS, sourceId: parent.id, targetId: fileEntity.id, path: relativePath, evidence: { source: relativePath, signal: "file hierarchy" }, createdAt: timestamp, updatedAt: timestamp });
      if (repository && fileEntity.type === CODE_ENTITY_TYPES.CONFIGURATION) {
        this.addRelationship({
          type: CODE_RELATIONSHIP_TYPES.CONFIGURES,
          sourceId: fileEntity.id,
          targetId: repository.id,
          path: relativePath,
          confidence: 0.9,
          evidence: { source: relativePath, signal: "configuration file" },
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }
  }

  addFileEntity(relativePath, root, timestamp, contentHash) {
    const fullPath = path.join(root || this.repositoryPath || ".", relativePath);
    const hash = contentHash || safeFileHash(fullPath, this.bounds.maximumFileBytes);
    if (hash) this.fileHashes.set(relativePath, hash);
    const type = fileEntityType(relativePath);
    return this.addEntity({
      type,
      name: path.posix.basename(relativePath),
      qualifiedName: relativePath,
      path: relativePath,
      language: languageForPath(relativePath),
      summary: deterministicPathRole(relativePath),
      tags: fileTags(relativePath, type),
      metadata: { filePath: relativePath, role: deterministicPathRole(relativePath) },
      contentHash: hash,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  addStructuralIndex(structuralIndex, timestamp) {
    const symbolToEntity = new Map();
    for (const symbol of safeArray(structuralIndex && structuralIndex.symbols)) {
      const entity = this.addEntity(entityFromStructuralSymbol(symbol, this, timestamp));
      symbolToEntity.set(symbol.symbolId, entity);
      const fileEntity = this.findFileEntity(symbol.path);
      if (fileEntity) {
        this.addRelationship({
          type: CODE_RELATIONSHIP_TYPES.DECLARES,
          sourceId: fileEntity.id,
          targetId: entity.id,
          path: symbol.path,
          range: rangeForLine(symbol.lineNumber),
          confidence: 0.95,
          evidence: symbol.evidence || { source: symbol.path, signal: symbol.signal || "structural symbol" },
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }
    for (const relationship of safeArray(structuralIndex && structuralIndex.relationships)) {
      const source = entityForRelationshipSymbol(this, relationship.sourceSymbol);
      const target = entityForRelationshipSymbol(this, relationship.targetSymbol) || this.findFileEntity(relationship.targetPath);
      if (!source || !target) {
        if (relationship.relationshipType === "function-call" && relationship.targetSymbol === UNKNOWN) {
          this.addFinding({
            code: CODE_FINDING_CODES.UNRESOLVED_SYMBOL,
            severity: CODE_FINDING_SEVERITIES.LOW,
            title: "Unresolved symbol reference",
            description: `Could not resolve ${targetNameFromRelationship(relationship)} in ${relationship.sourcePath}.`,
            entityIds: source ? [source.id] : [],
            evidence: [relationship.evidence || { source: relationship.sourcePath, signal: "unresolved call" }],
            confidence: 0.45,
          });
        }
        continue;
      }
      this.addRelationship(relationshipFromStructuralRelationship(relationship, source.id, target.id, this, timestamp));
      if (relationship.relationshipType === "function-call") {
        this.addRelationship({
          type: CODE_RELATIONSHIP_TYPES.CALLED_BY,
          sourceId: target.id,
          targetId: source.id,
          path: relationship.sourcePath,
          range: rangeForLine(relationship.lineNumber),
          confidence: confidenceFromStructural(relationship),
          evidence: relationship.evidence || { source: relationship.sourcePath, signal: "inverse call" },
          metadata: { inverseOf: relationship.relationshipId },
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
      if (relationship.relationshipType === "module-dependency") {
        this.addRelationship({
          type: CODE_RELATIONSHIP_TYPES.USED_BY,
          sourceId: target.id,
          targetId: source.id,
          path: relationship.sourcePath,
          range: rangeForLine(relationship.lineNumber),
          confidence: confidenceFromStructural(relationship),
          evidence: relationship.evidence || { source: relationship.sourcePath, signal: "inverse dependency" },
          metadata: { inverseOf: relationship.relationshipId },
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }
    this.addTestRelationships(timestamp);
    this.addDocumentationRelationships(timestamp);
  }

  addContentAnalysis(relativePath, content, language, options = {}) {
    const analyzer = analyzerFor(this.languageAnalyzers, relativePath, language);
    const timestamp = normalizeTimestamp(options.timestamp);
    if (analyzer) {
      const output = analyzer.analyze({
        content,
        language,
        path: relativePath,
        projectId: this.projectId || "default",
        engine: this,
        options: clonePlainObject(options),
      }) || {};
      this.addAnalyzerOutput(output, relativePath, language, timestamp, options.contentHash);
      return;
    }
    const structuralLanguages = new Set(["JavaScript", "TypeScript", "Python"]);
    if (!options.detached && structuralLanguages.has(languageForPath(relativePath))) {
      const structuralIndex = buildStructuralIndex({
        root: this.repositoryPath || process.cwd(),
        files: [{ path: relativePath }],
        detected: { entryPoints: [] },
      });
      this.addStructuralIndex(structuralIndex, timestamp);
      return;
    }
    this.addAnalyzerOutput(fallbackAnalyzeContent(content, language, relativePath), relativePath, language, timestamp, options.contentHash);
  }

  addAnalyzerOutput(output, relativePath, language, timestamp, contentHash) {
    const fileEntity = this.findFileEntity(relativePath) || this.addEntity({
      type: fileEntityType(relativePath),
      name: path.posix.basename(relativePath),
      qualifiedName: relativePath,
      path: relativePath,
      language,
      contentHash,
      tags: fileTags(relativePath, fileEntityType(relativePath)),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const localByName = new Map();
    for (const input of safeArray(output.entities)) {
      const entity = this.addEntity({
        ...input,
        path: input.path || relativePath,
        language: input.language || language,
        createdAt: input.createdAt || timestamp,
        updatedAt: input.updatedAt || timestamp,
      });
      localByName.set(entity.name, entity);
      this.addRelationship({
        type: CODE_RELATIONSHIP_TYPES.DECLARES,
        sourceId: fileEntity.id,
        targetId: entity.id,
        path: relativePath,
        range: entity.range,
        confidence: 0.7,
        evidence: { source: relativePath, signal: "language analyzer entity" },
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    for (const input of safeArray(output.relationships)) {
      const source = this.entities.get(input.sourceId) || localByName.get(input.sourceName) || fileEntity;
      const target = this.entities.get(input.targetId) || localByName.get(input.targetName) || this.findEntity(input.targetName || "", { limit: 1 })[0];
      if (!target) {
        this.addFinding({
          code: CODE_FINDING_CODES.UNRESOLVED_SYMBOL,
          severity: CODE_FINDING_SEVERITIES.LOW,
          title: "Unresolved analyzer reference",
          description: `Could not resolve ${input.targetName || input.targetId || "reference"} in ${relativePath}.`,
          entityIds: [source.id],
          evidence: [input.evidence || { source: relativePath, signal: "analyzer relationship" }],
          confidence: 0.45,
        });
        continue;
      }
      this.addRelationship({
        type: input.type || CODE_RELATIONSHIP_TYPES.REFERENCES,
        sourceId: source.id,
        targetId: target.id,
        path: input.path || relativePath,
        range: input.range || null,
        confidence: normalizeScore(input.confidence, 0.65),
        evidence: input.evidence || { source: relativePath, signal: "language analyzer relationship" },
        metadata: input.metadata || {},
        createdAt: input.createdAt || timestamp,
        updatedAt: input.updatedAt || timestamp,
      });
    }
    for (const diagnostic of safeArray(output.diagnostics)) {
      this.addFinding({
        code: diagnostic.code || CODE_FINDING_CODES.INCOMPLETE_ANALYSIS,
        severity: diagnostic.severity || CODE_FINDING_SEVERITIES.LOW,
        title: diagnostic.title || "Analyzer diagnostic",
        description: diagnostic.description || "The analyzer returned a diagnostic.",
        entityIds: diagnostic.entityIds || [],
        relationshipIds: diagnostic.relationshipIds || [],
        evidence: diagnostic.evidence || [{ source: relativePath, signal: "language analyzer diagnostic" }],
        confidence: normalizeScore(diagnostic.confidence, 0.6),
        metadata: diagnostic.metadata || {},
      });
    }
  }

  addDependencies(dependencies, timestamp) {
    for (const dependency of safeArray(dependencies)) {
      const entity = this.addEntity({
        type: CODE_ENTITY_TYPES.DEPENDENCY,
        name: dependency.name,
        qualifiedName: dependency.name,
        path: dependency.source || dependency.path || "package.json",
        language: "Dependency",
        metadata: clonePlainObject(dependency),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      const config = this.findFileEntity(entity.path) || this.listEntities({ type: CODE_ENTITY_TYPES.REPOSITORY })[0];
      if (config) {
        this.addRelationship({
          type: CODE_RELATIONSHIP_TYPES.DEPENDS_ON,
          sourceId: config.id,
          targetId: entity.id,
          path: entity.path,
          confidence: 0.9,
          evidence: { source: entity.path, signal: "dependency manifest" },
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }
  }

  addStructuralFindings(structuralIndex) {
    for (const entry of safeArray(structuralIndex && structuralIndex.unsupported)) {
      this.addFinding({
        code: CODE_FINDING_CODES.UNSUPPORTED_LANGUAGE,
        severity: CODE_FINDING_SEVERITIES.LOW,
        title: "Unsupported language",
        description: entry.reason || "Structural analysis does not support this source language.",
        evidence: [{ source: entry.path, signal: entry.reason || "unsupported language" }],
        confidence: 0.8,
      });
    }
    for (const entry of safeArray(structuralIndex && structuralIndex.parseFailures)) {
      this.addFinding({
        code: CODE_FINDING_CODES.INCOMPLETE_ANALYSIS,
        severity: CODE_FINDING_SEVERITIES.LOW,
        title: "Incomplete structural analysis",
        description: entry.reason || "Source structure could not be fully indexed.",
        evidence: [{ source: entry.path, signal: entry.reason || "parse failure" }],
        confidence: 0.7,
      });
    }
  }

  addTestRelationships(timestamp) {
    const tests = this.listEntities({ type: CODE_ENTITY_TYPES.TEST });
    const files = this.listEntities({ type: CODE_ENTITY_TYPES.FILE });
    for (const test of tests) {
      const candidates = sourceCandidatesForTest(test.path);
      const target = files.find((file) => candidates.includes(file.path));
      if (!target) {
        continue;
      }
      this.addRelationship({
        type: CODE_RELATIONSHIP_TYPES.TESTS,
        sourceId: test.id,
        targetId: target.id,
        path: test.path,
        confidence: 0.7,
        evidence: { source: test.path, signal: "test filename convention" },
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      this.addRelationship({
        type: CODE_RELATIONSHIP_TYPES.TESTED_BY,
        sourceId: target.id,
        targetId: test.id,
        path: target.path,
        confidence: 0.7,
        evidence: { source: test.path, signal: "test filename convention" },
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }

  addDocumentationRelationships(timestamp) {
    const docs = this.listEntities({ type: CODE_ENTITY_TYPES.DOCUMENTATION });
    const repository = this.listEntities({ type: CODE_ENTITY_TYPES.REPOSITORY })[0];
    for (const doc of docs) {
      if (repository) {
        this.addRelationship({
          type: CODE_RELATIONSHIP_TYPES.DOCUMENTS,
          sourceId: doc.id,
          targetId: repository.id,
          path: doc.path,
          confidence: 0.5,
          evidence: { source: doc.path, signal: "documentation file" },
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
    }
  }

  integrateAdapters(options = {}) {
    const snapshot = this.snapshot();
    if (this.repositoryGraph && typeof this.repositoryGraph.build === "function" && options.updateRepositoryGraph === true) {
      this.repositoryGraph.build(this.repositoryPath, { scanResult: options.scanResult, projectId: this.projectId });
    }
    if (this.offlineIndex && typeof this.offlineIndex.indexMany === "function") {
      this.offlineIndex.indexMany(indexableSummaries(snapshot));
    }
  }

  addEntity(input) {
    if (this.entities.size >= this.bounds.maximumEntities && !this.entities.has(input.id)) {
      this.addFinding({
        code: CODE_FINDING_CODES.INCOMPLETE_ANALYSIS,
        severity: CODE_FINDING_SEVERITIES.MEDIUM,
        title: "Entity bound reached",
        description: "Code understanding stopped adding entities at the configured maximum.",
        evidence: [{ source: input.path || "analysis", signal: "maximumEntities" }],
        confidence: 0.9,
      });
      return normalizeEntity(input, this);
    }
    const normalized = normalizeEntity(input, this);
    const existing = this.entities.get(normalized.id);
    const next = existing ? {
      ...existing,
      ...normalized,
      metadata: { ...clonePlainObject(existing.metadata), ...clonePlainObject(normalized.metadata) },
      tags: uniqueSorted([...existing.tags, ...normalized.tags]),
      createdAt: existing.createdAt,
      updatedAt: normalized.updatedAt,
    } : normalized;
    this.entities.set(next.id, next);
    this.emitLifecycle(existing ? CODE_UNDERSTANDING_EVENT_TYPES.ENTITY_UPDATED : CODE_UNDERSTANDING_EVENT_TYPES.ENTITY_DISCOVERED, {
      entity: clonePlainObject(next),
    });
    return clonePlainObject(next);
  }

  addRelationship(input) {
    if (this.relationships.size >= this.bounds.maximumRelationships && !this.relationships.has(input.id)) {
      this.addFinding({
        code: CODE_FINDING_CODES.INCOMPLETE_ANALYSIS,
        severity: CODE_FINDING_SEVERITIES.MEDIUM,
        title: "Relationship bound reached",
        description: "Code understanding stopped adding relationships at the configured maximum.",
        evidence: [input.evidence || { source: input.path || "analysis", signal: "maximumRelationships" }],
        confidence: 0.9,
      });
      return normalizeRelationship(input, this);
    }
    const normalized = normalizeRelationship(input, this);
    const existing = this.relationships.get(normalized.id);
    const next = existing ? {
      ...existing,
      ...normalized,
      metadata: { ...clonePlainObject(existing.metadata), ...clonePlainObject(normalized.metadata) },
      createdAt: existing.createdAt,
      updatedAt: normalized.updatedAt,
    } : normalized;
    this.relationships.set(next.id, next);
    if (!existing) {
      this.emitLifecycle(CODE_UNDERSTANDING_EVENT_TYPES.RELATIONSHIP_DISCOVERED, { relationship: clonePlainObject(next) });
    }
    return clonePlainObject(next);
  }

  addFinding(input) {
    const finding = normalizeFinding(input);
    const key = `${finding.code}:${stableHash({ evidence: finding.evidence, entityIds: finding.entityIds, relationshipIds: finding.relationshipIds })}`;
    const existing = Array.from(this.findings.values()).find((candidate) => candidate.metadata.dedupeKey === key);
    if (existing) {
      return clonePlainObject(existing);
    }
    const next = { ...finding, metadata: { ...finding.metadata, dedupeKey: key } };
    this.findings.set(next.id, next);
    this.emitLifecycle(CODE_UNDERSTANDING_EVENT_TYPES.CODE_FINDING_CREATED, { finding: clonePlainObject(next) });
    return clonePlainObject(next);
  }

  removePath(relativePath) {
    const normalizedPath = normalizePath(relativePath);
    const entityIds = Array.from(this.entities.values())
      .filter((entity) => entity.path === normalizedPath || entity.metadata.filePath === normalizedPath)
      .map((entity) => entity.id);
    for (const relationship of Array.from(this.relationships.values())) {
      if (entityIds.includes(relationship.sourceId) || entityIds.includes(relationship.targetId) || relationship.path === normalizedPath) {
        this.relationships.delete(relationship.id);
        this.emitLifecycle(CODE_UNDERSTANDING_EVENT_TYPES.RELATIONSHIP_REMOVED, { relationship: clonePlainObject(relationship) });
      }
    }
    for (const id of entityIds) {
      const entity = this.entities.get(id);
      this.entities.delete(id);
      this.emitLifecycle(CODE_UNDERSTANDING_EVENT_TYPES.ENTITY_REMOVED, { entity: clonePlainObject(entity) });
    }
  }

  findFileEntity(relativePath) {
    const normalizedPath = normalizePath(relativePath);
    return Array.from(this.entities.values())
      .find((entity) => [CODE_ENTITY_TYPES.FILE, CODE_ENTITY_TYPES.TEST, CODE_ENTITY_TYPES.CONFIGURATION, CODE_ENTITY_TYPES.DOCUMENTATION, CODE_ENTITY_TYPES.DATABASE_MIGRATION].includes(entity.type) && entity.path === normalizedPath) || null;
  }

  getRelationshipsForPath(relativePath) {
    const normalizedPath = normalizePath(relativePath);
    return Array.from(this.relationships.values())
      .filter((relationship) => relationship.path === normalizedPath || this.entities.get(relationship.sourceId)?.path === normalizedPath || this.entities.get(relationship.targetId)?.path === normalizedPath)
      .sort(compareRelationships)
      .map(clonePlainObject);
  }

  resolveEntityIds(entityIdOrQuery) {
    return new Set(this.resolveEntities(entityIdOrQuery).map((entity) => entity.id));
  }

  resolveEntities(entityIdOrQuery) {
    if (this.entities.has(entityIdOrQuery)) {
      return [this.entities.get(entityIdOrQuery)];
    }
    if (typeof entityIdOrQuery === "object" && entityIdOrQuery && this.entities.has(entityIdOrQuery.id)) {
      return [this.entities.get(entityIdOrQuery.id)];
    }
    return this.findEntity(entityIdOrQuery, { limit: 20 });
  }

  relationshipsByTypes(types) {
    const normalized = new Set(types);
    return Array.from(this.relationships.values()).filter((relationship) => normalized.has(relationship.type)).sort(compareRelationships);
  }

  traverse(rootIds, types, direction, options = {}) {
    const maxDepth = normalizePositiveInteger(options.maxDepth, this.bounds.maximumTraversalDepth);
    const limit = normalizePositiveInteger(options.limit, this.bounds.maximumImpactResults);
    const typeSet = new Set(types);
    const visited = new Set(rootIds);
    const queue = rootIds.map((id) => ({ id, depth: 0 }));
    const entities = [];
    const relationships = [];
    while (queue.length > 0 && entities.length < limit) {
      const current = queue.shift();
      if (current.depth >= maxDepth) {
        continue;
      }
      for (const relationship of this.relationships.values()) {
        if (!typeSet.has(relationship.type)) {
          continue;
        }
        const outward = direction === "out" || direction === "both";
        const inward = direction === "in" || direction === "both";
        const nextId = outward && relationship.sourceId === current.id
          ? relationship.targetId
          : inward && relationship.targetId === current.id
            ? relationship.sourceId
            : null;
        if (!nextId || visited.has(nextId)) {
          continue;
        }
        const entity = this.entities.get(nextId);
        if (!entity) {
          continue;
        }
        visited.add(nextId);
        entities.push(clonePlainObject(entity));
        relationships.push(clonePlainObject(relationship));
        queue.push({ id: nextId, depth: current.depth + 1 });
        if (entities.length >= limit) {
          break;
        }
      }
    }
    return {
      roots: rootIds,
      entities,
      relationships,
      depth: maxDepth,
      bounded: entities.length >= limit,
      confidence: relationships.length > 0 ? average(relationships.map((relationship) => relationship.confidence)) : 0.4,
      evidence: relationshipEvidence(relationships),
    };
  }

  createResult(input) {
    const entities = safeArray(input.entities || Array.from(this.entities.values()));
    const relationships = safeArray(input.relationships || Array.from(this.relationships.values()));
    const findings = safeArray(input.findings || Array.from(this.findings.values()));
    return {
      id: input.id || `code-result:${stableHash({ projectId: this.projectId, target: input.target, createdAt: input.createdAt || Date.now() })}`,
      projectId: this.projectId || "default",
      target: clonePlainObject(input.target || {}),
      entities: entities.sort(compareEntities).map(clonePlainObject),
      relationships: relationships.sort(compareRelationships).map(clonePlainObject),
      findings: findings.sort(compareFindings).map(clonePlainObject),
      evidence: safeArray(input.evidence || [
        ...entities.flatMap((entity) => entity.metadata && entity.metadata.evidence || []),
        ...relationshipEvidence(relationships),
      ]),
      confidence: normalizeScore(input.confidence, confidenceFromFindings(findings)),
      completeness: normalizeScore(input.completeness, completenessFromBounds(this)),
      metadata: clonePlainObject(input.metadata || {}),
      createdAt: normalizeTimestamp(input.createdAt),
    };
  }

  recalculateSummaries() {
    for (const entity of this.entities.values()) {
      if (entity.type === CODE_ENTITY_TYPES.FILE || entity.type === CODE_ENTITY_TYPES.TEST || entity.type === CODE_ENTITY_TYPES.CONFIGURATION || entity.type === CODE_ENTITY_TYPES.DOCUMENTATION) {
        entity.summary = deterministicFileSummary(entity.path, this.listEntities({ path: entity.path }), this.getRelationshipsForPath(entity.path)).summary;
      } else if (!entity.summary || entity.summary === UNKNOWN) {
        entity.summary = deterministicSymbolSummary(entity, this.getRelationships(entity.id)).summary;
      }
    }
  }

  recalculateStats() {
    const languages = {};
    const entityTypes = {};
    const relationshipTypes = {};
    for (const entity of this.entities.values()) {
      if (entity.language) languages[entity.language] = (languages[entity.language] || 0) + 1;
      entityTypes[entity.type] = (entityTypes[entity.type] || 0) + 1;
    }
    for (const relationship of this.relationships.values()) {
      relationshipTypes[relationship.type] = (relationshipTypes[relationship.type] || 0) + 1;
    }
    this.stats = {
      ...this.stats,
      filesAnalyzed: this.listEntities().filter((entity) => fileLikeTypes().has(entity.type)).length,
      entities: this.entities.size,
      relationships: this.relationships.size,
      languages,
      entityTypes,
      relationshipTypes,
      unsupportedFiles: Array.from(this.findings.values()).filter((finding) => finding.code === CODE_FINDING_CODES.UNSUPPORTED_LANGUAGE).length,
      unresolvedSymbols: Array.from(this.findings.values()).filter((finding) => finding.code === CODE_FINDING_CODES.UNRESOLVED_SYMBOL).length,
      deadCodeCandidates: Array.from(this.findings.values()).filter((finding) => finding.code === CODE_FINDING_CODES.DEAD_CODE_CANDIDATE).length,
    };
  }

  emitLifecycle(type, payload = {}) {
    this.emit(CODE_UNDERSTANDING_EVENTS.LIFECYCLE, {
      type,
      timestamp: new Date().toISOString(),
      schemaVersion: CODE_UNDERSTANDING_SCHEMA_VERSION,
      ...payload,
    });
  }
}

function normalizeEntity(input, engine) {
  const type = normalizeEnum(input.type || CODE_ENTITY_TYPES.UNKNOWN, CODE_ENTITY_TYPES, "code entity type");
  const entityPath = input.path === undefined || input.path === null ? null : normalizePath(input.path);
  const name = requiredString(input.name || path.posix.basename(entityPath || type.toLowerCase()), "Code entity name is required.");
  const qualifiedName = requiredString(input.qualifiedName || qualifiedNameFor(name, input, entityPath), "Code entity qualifiedName is required.");
  const timestamp = normalizeTimestamp(input.updatedAt || input.createdAt);
  const entity = {
    id: input.id || entityId({
      projectId: input.projectId || engine.projectId || "default",
      type,
      path: entityPath,
      qualifiedName,
      signature: input.signature || null,
      range: stableRange(input.range),
    }),
    projectId: input.projectId || engine.projectId || "default",
    type,
    name,
    qualifiedName,
    path: entityPath,
    language: input.language || (entityPath ? languageForPath(entityPath) : UNKNOWN),
    range: input.range === undefined ? null : normalizeNullableRange(input.range),
    signature: input.signature || null,
    visibility: input.visibility || null,
    modifiers: normalizeStringArray(input.modifiers || []),
    parameters: safeArray(input.parameters).map(clonePlainObject),
    returnType: input.returnType || null,
    documentation: input.documentation || null,
    summary: input.summary || UNKNOWN,
    tags: normalizeStringArray(input.tags || []),
    metadata: clonePlainObject(input.metadata || {}),
    contentHash: input.contentHash || null,
    createdAt: normalizeTimestamp(input.createdAt || timestamp),
    updatedAt: timestamp,
  };
  return entity;
}

function normalizeRelationship(input, engine) {
  const type = normalizeEnum(input.type || CODE_RELATIONSHIP_TYPES.RELATED_TO, CODE_RELATIONSHIP_TYPES, "code relationship type");
  const timestamp = normalizeTimestamp(input.updatedAt || input.createdAt);
  const relationship = {
    id: input.id || relationshipId({
      projectId: input.projectId || engine.projectId || "default",
      type,
      sourceId: requiredString(input.sourceId, "Code relationship sourceId is required."),
      targetId: requiredString(input.targetId, "Code relationship targetId is required."),
      path: input.path || null,
      range: stableRange(input.range),
      evidence: input.evidence || {},
    }),
    projectId: input.projectId || engine.projectId || "default",
    type,
    sourceId: requiredString(input.sourceId, "Code relationship sourceId is required."),
    targetId: requiredString(input.targetId, "Code relationship targetId is required."),
    path: input.path === undefined || input.path === null ? null : normalizePath(input.path),
    range: input.range === undefined ? null : normalizeNullableRange(input.range),
    confidence: normalizeScore(input.confidence, 0.6),
    evidence: clonePlainObject(input.evidence || {}),
    metadata: clonePlainObject(input.metadata || {}),
    createdAt: normalizeTimestamp(input.createdAt || timestamp),
    updatedAt: timestamp,
  };
  return relationship;
}

function normalizeFinding(input) {
  const code = requiredString(input.code, "Code understanding finding code is required.");
  const timestamp = normalizeTimestamp(input.createdAt);
  return {
    id: input.id || `code-finding:${stableHash({ code, title: input.title, entityIds: input.entityIds || [], relationshipIds: input.relationshipIds || [], evidence: input.evidence || [] })}`,
    code,
    severity: input.severity || CODE_FINDING_SEVERITIES.LOW,
    title: requiredString(input.title, "Code understanding finding title is required."),
    description: requiredString(input.description, "Code understanding finding description is required."),
    entityIds: normalizeStringArray(input.entityIds || []),
    relationshipIds: normalizeStringArray(input.relationshipIds || []),
    evidence: safeArray(input.evidence).map(clonePlainObject),
    confidence: normalizeScore(input.confidence, 0.6),
    metadata: clonePlainObject(input.metadata || {}),
    createdAt: timestamp,
  };
}

function entityFromStructuralSymbol(symbol, engine, timestamp) {
  const type = entityTypeFromStructural(symbol.type, symbol.path);
  return {
    type,
    name: symbol.name,
    qualifiedName: symbol.parent && symbol.parent !== UNKNOWN ? `${symbol.parent}.${symbol.name}` : `${symbol.path}:${symbol.name}`,
    path: symbol.path,
    language: symbol.language || languageForPath(symbol.path),
    range: rangeForLine(symbol.lineNumber),
    summary: `${type.toLowerCase()} ${symbol.name} in ${symbol.path}`,
    tags: uniqueSorted([
      symbol.type,
      symbol.exported ? "exported" : null,
      symbol.type === "entry-point" ? "entry-point" : null,
    ].filter(Boolean)),
    metadata: {
      structuralSymbolId: symbol.symbolId,
      structuralType: symbol.type,
      parent: symbol.parent || UNKNOWN,
      exported: symbol.exported === true,
      evidence: [symbol.evidence || { source: symbol.path, signal: symbol.signal || "structural symbol" }],
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function relationshipFromStructuralRelationship(relationship, sourceId, targetId, engine, timestamp) {
  return {
    type: relationshipTypeFromStructural(relationship.relationshipType),
    sourceId,
    targetId,
    path: relationship.sourcePath,
    range: rangeForLine(relationship.lineNumber),
    confidence: confidenceFromStructural(relationship),
    evidence: relationship.evidence || { source: relationship.sourcePath, signal: relationship.relationshipType },
    metadata: {
      structuralRelationshipId: relationship.relationshipId,
      structuralRelationshipType: relationship.relationshipType,
      targetPath: relationship.targetPath,
      confidenceState: relationship.confidenceState,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function fallbackAnalyzeContent(content, language, relativePath) {
  const lines = String(content || "").split(/\r?\n/);
  const entities = [];
  const relationships = [];
  const normalizedLanguage = language || languageForPath(relativePath);
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    const importMatch = trimmed.match(/^(?:import\s+.*?from\s+|import\s+|from\s+)(["']?)([^"'\s;]+)\1/) ||
      trimmed.match(/require\(["']([^"']+)["']\)/);
    if (importMatch) {
      entities.push({
        type: CODE_ENTITY_TYPES.IMPORT,
        name: importMatch[2] || importMatch[1],
        qualifiedName: `${relativePath}:import:${importMatch[2] || importMatch[1]}`,
        range: rangeForLine(lineNumber),
        summary: "Fallback import extraction.",
        tags: ["fallback", "reduced-confidence"],
        metadata: { reducedConfidence: true },
      });
    }
    const exportMatch = trimmed.match(/^export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)?\s*([A-Za-z_$][\w$]*)?/);
    if (exportMatch) {
      entities.push({
        type: CODE_ENTITY_TYPES.EXPORT,
        name: exportMatch[1] || "default",
        qualifiedName: `${relativePath}:export:${exportMatch[1] || "default"}`,
        range: rangeForLine(lineNumber),
        tags: ["fallback", "reduced-confidence"],
        metadata: { reducedConfidence: true },
      });
    }
    const functionMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/) ||
      trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(?[^=]*=>/) ||
      trimmed.match(/^def\s+([A-Za-z_]\w*)\s*\(/);
    if (functionMatch) {
      entities.push({
        type: CODE_ENTITY_TYPES.FUNCTION,
        name: functionMatch[1],
        qualifiedName: `${relativePath}:${functionMatch[1]}`,
        range: rangeForLine(lineNumber),
        tags: ["fallback", "reduced-confidence"],
        metadata: { reducedConfidence: true },
      });
    }
    const classMatch = trimmed.match(/^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/) || trimmed.match(/^class\s+([A-Za-z_]\w*)/);
    if (classMatch) {
      entities.push({
        type: CODE_ENTITY_TYPES.CLASS,
        name: classMatch[1],
        qualifiedName: `${relativePath}:${classMatch[1]}`,
        range: rangeForLine(lineNumber),
        tags: ["fallback", "reduced-confidence"],
        metadata: { reducedConfidence: true },
      });
    }
    const calls = Array.from(trimmed.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g))
      .map((match) => match[1])
      .filter((name) => !["if", "for", "while", "switch", "function", "return"].includes(name));
    for (const call of calls) {
      relationships.push({
        type: CODE_RELATIONSHIP_TYPES.REFERENCES,
        sourceName: path.posix.basename(relativePath),
        targetName: call,
        path: relativePath,
        range: rangeForLine(lineNumber),
        confidence: 0.35,
        evidence: { source: relativePath, lineNumber, signal: `fallback reference: ${call}` },
      });
    }
  });
  if (isConfigurationPath(relativePath)) {
    entities.push({
      type: CODE_ENTITY_TYPES.CONFIGURATION,
      name: path.posix.basename(relativePath),
      qualifiedName: relativePath,
      tags: ["fallback", "configuration"],
      metadata: { reducedConfidence: true },
    });
  }
  if (isTestPath(relativePath)) {
    entities.push({
      type: CODE_ENTITY_TYPES.TEST,
      name: path.posix.basename(relativePath),
      qualifiedName: relativePath,
      tags: ["fallback", "test"],
      metadata: { reducedConfidence: true },
    });
  }
  if (isDocumentationPath(relativePath)) {
    entities.push({
      type: CODE_ENTITY_TYPES.DOCUMENTATION,
      name: path.posix.basename(relativePath),
      qualifiedName: relativePath,
      tags: ["fallback", "documentation"],
      metadata: { reducedConfidence: true },
    });
  }
  return {
    entities,
    relationships,
    diagnostics: [{
      code: CODE_FINDING_CODES.INCOMPLETE_ANALYSIS,
      severity: CODE_FINDING_SEVERITIES.LOW,
      title: "Fallback analysis used",
      description: `No specialized analyzer was available for ${normalizedLanguage}.`,
      evidence: [{ source: relativePath, signal: "deterministic fallback analyzer" }],
      confidence: 0.5,
      metadata: { reducedConfidence: true },
    }],
    metadata: { fallback: true, reducedConfidence: true },
  };
}

function normalizeAnalyzers(analyzers) {
  return safeArray(analyzers).map((analyzer) => {
    if (!analyzer || typeof analyzer.analyze !== "function") {
      throw new Error("Code understanding language analyzer requires analyze().");
    }
    return {
      ...analyzer,
      extensions: new Set(safeArray(analyzer.extensions).map((entry) => String(entry).toLowerCase())),
      languages: new Set(safeArray(analyzer.languages).map((entry) => String(entry).toLowerCase())),
    };
  });
}

function analyzerFor(analyzers, relativePath, language) {
  const extension = path.extname(relativePath).toLowerCase();
  const normalizedLanguage = String(language || languageForPath(relativePath)).toLowerCase();
  return analyzers.find((analyzer) =>
    analyzer.extensions.has(extension) ||
    analyzer.languages.has(normalizedLanguage) ||
    analyzer.extensions.size === 0 && analyzer.languages.size === 0);
}

function entityForRelationshipSymbol(engine, symbol) {
  if (!symbol || symbol === UNKNOWN) {
    return null;
  }
  const normalizedPath = normalizePath(symbol.path);
  return Array.from(engine.entities.values()).find((entity) =>
    entity.path === normalizedPath &&
    (entity.metadata.structuralSymbolId === symbol.symbolId || entity.name === symbol.name));
}

function entityTypeFromStructural(type, relativePath) {
  if (type === "module") return CODE_ENTITY_TYPES.MODULE;
  if (type === "class") return modelLikePath(relativePath) ? CODE_ENTITY_TYPES.DATABASE_MODEL : CODE_ENTITY_TYPES.CLASS;
  if (type === "interface") return CODE_ENTITY_TYPES.INTERFACE;
  if (type === "type") return CODE_ENTITY_TYPES.TYPE;
  if (type === "enum") return CODE_ENTITY_TYPES.ENUM;
  if (["function", "react-component", "hook", "api-handler", "entry-point", "middleware"].includes(type)) return CODE_ENTITY_TYPES.FUNCTION;
  if (type === "method") return CODE_ENTITY_TYPES.METHOD;
  if (type === "constant") return CODE_ENTITY_TYPES.CONSTANT;
  if (type === "variable") return CODE_ENTITY_TYPES.VARIABLE;
  if (type === "import") return CODE_ENTITY_TYPES.IMPORT;
  if (type === "export") return CODE_ENTITY_TYPES.EXPORT;
  if (type === "configuration") return CODE_ENTITY_TYPES.CONFIGURATION;
  if (type === "route") return CODE_ENTITY_TYPES.ROUTE;
  if (type === "api-endpoint") return CODE_ENTITY_TYPES.ENDPOINT;
  return CODE_ENTITY_TYPES.UNKNOWN;
}

function relationshipTypeFromStructural(type) {
  if (type === "import") return CODE_RELATIONSHIP_TYPES.IMPORTS;
  if (type === "module-dependency") return CODE_RELATIONSHIP_TYPES.DEPENDS_ON;
  if (type === "export") return CODE_RELATIONSHIP_TYPES.EXPORTS;
  if (type === "function-call") return CODE_RELATIONSHIP_TYPES.CALLS;
  if (type === "class-inheritance") return CODE_RELATIONSHIP_TYPES.EXTENDS;
  if (type === "interface-implementation") return CODE_RELATIONSHIP_TYPES.IMPLEMENTS;
  if (type === "configuration-reference") return CODE_RELATIONSHIP_TYPES.CONFIGURES;
  if (["route-to-handler", "api-endpoint-to-handler"].includes(type)) return CODE_RELATIONSHIP_TYPES.ROUTES_TO;
  return CODE_RELATIONSHIP_TYPES.REFERENCES;
}

function fileEntityType(relativePath) {
  if (/migrations?\//i.test(relativePath)) return CODE_ENTITY_TYPES.DATABASE_MIGRATION;
  if (isDocumentationPath(relativePath)) return CODE_ENTITY_TYPES.DOCUMENTATION;
  if (isTestPath(relativePath)) return CODE_ENTITY_TYPES.TEST;
  if (isConfigurationPath(relativePath)) return CODE_ENTITY_TYPES.CONFIGURATION;
  return CODE_ENTITY_TYPES.FILE;
}

function languageForPath(relativePath) {
  const extension = path.extname(String(relativePath || "")).toLowerCase();
  if ([".js", ".jsx", ".mjs"].includes(extension)) return "JavaScript";
  if ([".ts", ".tsx"].includes(extension)) return "TypeScript";
  if (extension === ".py") return "Python";
  if (extension === ".json") return "JSON";
  if ([".yml", ".yaml"].includes(extension)) return "YAML";
  if (extension === ".md") return "Markdown";
  if (extension === ".sql") return "SQL";
  return UNKNOWN;
}

function normalizeBounds(input) {
  return {
    ...DEFAULT_BOUNDS,
    ...Object.fromEntries(Object.entries(input || {}).filter(([, value]) => !Array.isArray(value) && value !== undefined && value !== null)),
    ignoredPaths: normalizeRegExpArray(input.ignoredPaths || DEFAULT_BOUNDS.ignoredPaths),
    ignoredLanguages: normalizeStringArray(input.ignoredLanguages || DEFAULT_BOUNDS.ignoredLanguages),
  };
}

function boundedFiles(files, bounds, root, onSkip) {
  const output = [];
  const start = Date.now();
  for (const file of safeFiles(files)) {
    if (output.length >= bounds.maximumFiles) {
      onSkip(file, "maximumFiles");
      continue;
    }
    if (Date.now() - start > bounds.maximumAnalysisTimeMs) {
      onSkip(file, "maximumAnalysisTimeMs");
      continue;
    }
    if (bounds.ignoredPaths.some((pattern) => pattern.test(file.path))) {
      onSkip(file, "ignoredPath");
      continue;
    }
    if (bounds.ignoredLanguages.includes(languageForPath(file.path))) {
      onSkip(file, "language");
      continue;
    }
    const fullPath = path.join(root, file.path);
    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).size > bounds.maximumFileBytes) {
        onSkip(file, "maximumFileBytes");
        continue;
      }
    } catch (error) {
      onSkip(file, "unreadable");
      continue;
    }
    output.push(file);
  }
  return output;
}

function indexableSummaries(snapshot) {
  return [
    ...snapshot.entities.map((entity) => ({
      id: `code-understanding:${entity.id}`,
      type: offlineDocumentTypeForEntity(entity),
      projectId: snapshot.projectId,
      path: entity.path,
      language: entity.language,
      title: entity.qualifiedName,
      content: entity.summary || entity.documentation || entity.qualifiedName,
      symbols: [entity.name, entity.qualifiedName].filter(Boolean),
      tags: entity.tags,
      references: [entity.id],
      metadata: { codeUnderstandingEntityId: entity.id, contentHash: entity.contentHash },
      indexedAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    })),
    ...snapshot.relationships.map((relationship) => ({
      id: `code-understanding:${relationship.id}`,
      type: offlineDocumentTypeForRelationship(relationship),
      projectId: snapshot.projectId,
      path: relationship.path,
      language: null,
      title: `${relationship.type} ${relationship.sourceId} -> ${relationship.targetId}`,
      content: stableSerialize(relationship.evidence),
      symbols: [],
      tags: [relationship.type.toLowerCase()],
      references: [relationship.sourceId, relationship.targetId],
      metadata: { codeUnderstandingRelationshipId: relationship.id },
      indexedAt: relationship.createdAt,
      updatedAt: relationship.updatedAt,
    })),
  ];
}

function offlineDocumentTypeForEntity(entity) {
  if (entity.type === CODE_ENTITY_TYPES.REPOSITORY) return "repository";
  if (entity.type === CODE_ENTITY_TYPES.DIRECTORY) return "directory";
  if (entity.type === CODE_ENTITY_TYPES.FILE || entity.type === CODE_ENTITY_TYPES.DOCUMENTATION || entity.type === CODE_ENTITY_TYPES.DATABASE_MIGRATION) return "file";
  if (entity.type === CODE_ENTITY_TYPES.FUNCTION || entity.type === CODE_ENTITY_TYPES.ROUTE || entity.type === CODE_ENTITY_TYPES.ENDPOINT) return "function";
  if (entity.type === CODE_ENTITY_TYPES.METHOD || entity.type === CODE_ENTITY_TYPES.CONSTRUCTOR) return "method";
  if (entity.type === CODE_ENTITY_TYPES.CLASS || entity.type === CODE_ENTITY_TYPES.DATABASE_MODEL) return "class";
  if (entity.type === CODE_ENTITY_TYPES.INTERFACE) return "interface";
  if (entity.type === CODE_ENTITY_TYPES.CONFIGURATION) return "configuration";
  if (entity.type === CODE_ENTITY_TYPES.TEST) return "test";
  if (entity.type === CODE_ENTITY_TYPES.DEPENDENCY) return "dependency";
  if (entity.type === CODE_ENTITY_TYPES.IMPORT) return "import";
  if (entity.type === CODE_ENTITY_TYPES.EXPORT) return "export";
  return "symbol";
}

function offlineDocumentTypeForRelationship(relationship) {
  if ([CODE_RELATIONSHIP_TYPES.IMPORTS, CODE_RELATIONSHIP_TYPES.DEPENDS_ON].includes(relationship.type)) return "import";
  if (relationship.type === CODE_RELATIONSHIP_TYPES.EXPORTS) return "export";
  return "reference";
}

function deterministicFileSummary(relativePath, entities, relationships) {
  const declarations = entities.filter((entity) => !fileLikeTypes().has(entity.type)).map((entity) => entity.name);
  const imports = relationships.filter((relationship) => relationship.type === CODE_RELATIONSHIP_TYPES.IMPORTS).length;
  const exports = relationships.filter((relationship) => relationship.type === CODE_RELATIONSHIP_TYPES.EXPORTS).length;
  const tests = relationships.filter((relationship) => [CODE_RELATIONSHIP_TYPES.TESTS, CODE_RELATIONSHIP_TYPES.TESTED_BY].includes(relationship.type)).length;
  const role = deterministicPathRole(relativePath);
  return {
    path: relativePath,
    role,
    declarations: uniqueSorted(declarations),
    imports,
    exports,
    relationships: relationships.length,
    tests,
    summary: `${relativePath} is ${article(role)} ${role} with ${declarations.length} declarations, ${imports} imports, ${exports} exports, and ${tests} test links.`,
    confidence: entities.some((entity) => entity.metadata.reducedConfidence) ? 0.55 : 0.8,
  };
}

function deterministicSymbolSummary(entity, relationships) {
  const inbound = relationships.filter((relationship) => relationship.targetId === entity.id).length;
  const outbound = relationships.filter((relationship) => relationship.sourceId === entity.id).length;
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    path: entity.path,
    summary: `${entity.qualifiedName} is a ${entity.type.toLowerCase()} in ${entity.path || "the repository"} with ${inbound} inbound and ${outbound} outbound relationships.`,
    inbound,
    outbound,
    confidence: entity.metadata.reducedConfidence ? 0.55 : 0.8,
  };
}

function dependencyLayers(entities, dependencies) {
  const byDirectory = new Map();
  for (const entity of entities.values()) {
    if (!entity.path || ![CODE_ENTITY_TYPES.FILE, CODE_ENTITY_TYPES.MODULE, CODE_ENTITY_TYPES.PACKAGE].includes(entity.type)) continue;
    const directory = path.posix.dirname(entity.path);
    if (!byDirectory.has(directory)) byDirectory.set(directory, []);
    byDirectory.get(directory).push(entity.id);
  }
  return Array.from(byDirectory.entries()).sort(compareEntries).map(([name, entityIds]) => ({
    name,
    entityIds: uniqueSorted(entityIds),
    dependsOn: uniqueSorted(dependencies
      .filter((relationship) => entityIds.includes(relationship.sourceId))
      .map((relationship) => entities.get(relationship.targetId)?.path)
      .filter(Boolean)
      .map((targetPath) => path.posix.dirname(targetPath))),
  }));
}

function findCycles(relationships) {
  const adjacency = new Map();
  for (const relationship of relationships) {
    if (!adjacency.has(relationship.sourceId)) adjacency.set(relationship.sourceId, []);
    adjacency.get(relationship.sourceId).push(relationship.targetId);
  }
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  function visit(id, stack) {
    if (visiting.has(id)) {
      const index = stack.indexOf(id);
      if (index >= 0) cycles.push(stack.slice(index));
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of adjacency.get(id) || []) visit(next, [...stack, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of adjacency.keys()) visit(id, []);
  return cycles.map((cycle) => uniqueSorted(cycle)).filter((cycle, index, all) =>
    index === all.findIndex((candidate) => stableSerialize(candidate) === stableSerialize(cycle)));
}

function affectedEntitiesForChange(engine, change) {
  const changes = safeArray(change && change.files ? change.files : change);
  const targets = [];
  for (const item of changes) {
    if (typeof item === "string") {
      targets.push(...engine.listEntities({ path: item }));
      continue;
    }
    if (item && item.path) targets.push(...engine.listEntities({ path: item.path }));
    if (item && item.symbol) targets.push(...engine.findEntity(item.symbol));
    if (item && item.entityId && engine.getEntity(item.entityId)) targets.push(engine.getEntity(item.entityId));
  }
  return uniqueEntities(targets);
}

function validationScopeFor(targets, relatedTests) {
  return uniqueSorted([
    ...relatedTests.map((test) => test.path),
    ...targets.filter((entity) => entity.type === CODE_ENTITY_TYPES.CONFIGURATION).map(() => "configuration validation"),
    ...targets.filter((entity) => entity.type === CODE_ENTITY_TYPES.DEPENDENCY).map(() => "dependency validation"),
    targets.length > 0 ? "targeted tests" : null,
  ].filter(Boolean));
}

function boundaryCrossings(relationships, entities) {
  return relationships
    .map((relationship) => {
      const source = entities.get(relationship.sourceId);
      const target = entities.get(relationship.targetId);
      if (!source || !target || !source.path || !target.path) return null;
      const sourceRoot = source.path.split("/")[0];
      const targetRoot = target.path.split("/")[0];
      return sourceRoot !== targetRoot ? { sourceRoot, targetRoot, relationshipId: relationship.id } : null;
    })
    .filter(Boolean);
}

function matchesBoundaryRule(source, target, relationship, rule) {
  const sourceMatches = rule.from ? new RegExp(rule.from).test(source.path || "") : true;
  const targetMatches = rule.to ? new RegExp(rule.to).test(target.path || "") : true;
  const typeMatches = rule.relationshipType ? relationship.type === rule.relationshipType : true;
  return sourceMatches && targetMatches && typeMatches;
}

function normalizeEntityQuery(query) {
  if (typeof query === "string") {
    return { text: query.trim().toLowerCase(), empty: query.trim() === "" };
  }
  return {
    text: String(query && (query.text || query.query || query.name || query.qualifiedName) || "").trim().toLowerCase(),
    path: query && query.path ? normalizePath(query.path) : null,
    type: query && query.type ? normalizeStringSet(query.type) : new Set(),
    empty: false,
  };
}

function matchesEntity(entity, filters) {
  if (filters.path && entity.path !== filters.path) return false;
  if (filters.type && filters.type.size > 0 && !filters.type.has(entity.type)) return false;
  if (!filters.text) return true;
  const text = [entity.id, entity.name, entity.qualifiedName, entity.path, entity.summary, ...entity.tags].filter(Boolean).join(" ").toLowerCase();
  return text.includes(filters.text) || tokenize(filters.text).every((token) => text.includes(token));
}

function scoreEntity(entity, filters) {
  if (!filters.text) return { entity, score: 1, confidence: 0.7, evidence: [{ source: entity.path, signal: "unfiltered entity list" }] };
  const exact = [entity.id, entity.name, entity.qualifiedName, entity.path].filter(Boolean).map((value) => value.toLowerCase()).includes(filters.text);
  const fuzzy = tokenize(filters.text).filter((token) => `${entity.name} ${entity.qualifiedName} ${entity.path} ${entity.summary}`.toLowerCase().includes(token)).length;
  const score = (exact ? 100 : 0) + fuzzy * 10;
  return {
    entity,
    score,
    confidence: exact ? 0.95 : Math.min(0.85, 0.45 + fuzzy * 0.12),
    evidence: [{ source: entity.path, signal: exact ? "exact symbol lookup" : "fuzzy normalized-name lookup" }],
  };
}

function normalizeEntityFilter(filter) {
  return {
    ids: normalizeStringSet(filter.ids || filter.id),
    types: normalizeStringSet(filter.types || filter.type),
    paths: normalizeStringSet(filter.paths || filter.path),
    languages: normalizeStringSet(filter.languages || filter.language),
    tags: normalizeStringSet(filter.tags || filter.tag),
  };
}

function filterMatchesEntity(entity, filter) {
  return setMatches(filter.ids, entity.id) &&
    setMatches(filter.types, entity.type) &&
    setMatches(filter.paths, entity.path) &&
    setMatches(filter.languages, entity.language) &&
    (filter.tags.size === 0 || Array.from(filter.tags).every((tag) => entity.tags.includes(tag)));
}

function normalizeChanges(changes) {
  return safeArray(changes).map((change) => {
    if (!change || typeof change !== "object") throw new Error("Code understanding change must be an object.");
    if (!Object.values(CHANGE_TYPES).includes(change.type)) throw new Error("Code understanding change type is invalid.");
    if (change.type === CHANGE_TYPES.RENAMED) {
      return { type: change.type, oldPath: normalizePath(change.oldPath), newPath: normalizePath(change.newPath) };
    }
    return { type: change.type, path: normalizePath(change.path) };
  });
}

function validateSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) throw new Error("Code understanding snapshot must be an object.");
  if (snapshot.schemaVersion !== CODE_UNDERSTANDING_SCHEMA_VERSION) throw new Error("Code understanding snapshot schema version is unsupported.");
  if (!Array.isArray(snapshot.entities) || !Array.isArray(snapshot.relationships) || !Array.isArray(snapshot.findings)) {
    throw new Error("Code understanding snapshot requires entities, relationships, and findings.");
  }
}

function migrateSnapshot(snapshot, migrations) {
  let current = clonePlainObject(snapshot);
  for (const migration of migrations) {
    if (typeof migration === "function") current = migration(current);
  }
  return current;
}

function emptyStats() {
  return {
    repositoriesAnalyzed: 0,
    filesAnalyzed: 0,
    filesSkipped: 0,
    entities: 0,
    relationships: 0,
    languages: {},
    entityTypes: {},
    relationshipTypes: {},
    unsupportedFiles: 0,
    unresolvedSymbols: 0,
    deadCodeCandidates: 0,
    lastFullAnalysis: null,
    lastIncrementalUpdate: null,
  };
}

function normalizeEnum(value, constants, label) {
  const normalized = requiredString(value, `${label} is required.`);
  if (!Object.values(constants).includes(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function entityId(input) {
  return `code-entity:${stableHash({
    projectId: input.projectId,
    type: input.type,
    path: input.path,
    qualifiedName: input.qualifiedName,
    signature: input.signature,
  })}`;
}

function relationshipId(input) {
  return `code-relationship:${stableHash({
    projectId: input.projectId,
    type: input.type,
    sourceId: input.sourceId,
    targetId: input.targetId,
    path: input.path,
    range: input.range && input.range.startLine ? { startLine: input.range.startLine } : null,
    evidence: input.evidence && input.evidence.signal,
  })}`;
}

function qualifiedNameFor(name, input, entityPath) {
  if (input.metadata && input.metadata.parent && input.metadata.parent !== UNKNOWN) return `${input.metadata.parent}.${name}`;
  if (entityPath) return `${entityPath}:${name}`;
  return name;
}

function confidenceFromStructural(relationship) {
  return relationship.confidenceState === "VERIFIED" ? 0.9 : 0.45;
}

function confidenceFromFindings(findings) {
  if (findings.some((finding) => ["HIGH", "CRITICAL"].includes(finding.severity))) return 0.55;
  if (findings.length > 0) return 0.75;
  return 0.9;
}

function completenessFromBounds(engine) {
  const bounded = Array.from(engine.findings.values()).some((finding) =>
    finding.code === CODE_FINDING_CODES.INCOMPLETE_ANALYSIS || finding.code === CODE_FINDING_CODES.UNSUPPORTED_LANGUAGE);
  return bounded ? 0.75 : 0.95;
}

function safeFiles(files) {
  return safeArray(files).filter((file) => file && typeof file.path === "string").map((file) => ({ path: normalizePath(file.path) }));
}

function safeFileHash(filePath, maxBytes) {
  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size > maxBytes) return null;
    return sha256(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return null;
  }
}

function targetNameFromRelationship(relationship) {
  if (relationship.targetSymbol && relationship.targetSymbol !== UNKNOWN && relationship.targetSymbol.name) return relationship.targetSymbol.name;
  return relationship.targetPath || UNKNOWN;
}

function rangeForLine(lineNumber) {
  return Number.isInteger(lineNumber) ? { startLine: lineNumber, startColumn: 1, endLine: lineNumber, endColumn: 1 } : null;
}

function normalizeNullableRange(range) {
  if (range === null) return null;
  if (!isPlainObject(range)) throw new Error("Code range must be an object or null.");
  return clonePlainObject(range);
}

function stableRange(range) {
  if (!range) return null;
  return { startLine: range.startLine || range.line || null, startColumn: range.startColumn || null };
}

function relationshipEvidence(relationships) {
  return safeArray(relationships).map((relationship) => relationship.evidence).filter((entry) => entry && Object.keys(entry).length > 0).map(clonePlainObject);
}

function isConfigurationPath(relativePath) {
  return /(^|\/)(package\.json|tsconfig\.json|jsconfig\.json|.*config\.[cm]?[jt]s|\.eslintrc.*|\.prettierrc.*|requirements\.txt|pyproject\.toml|pytest\.ini|Dockerfile)$/i.test(relativePath);
}

function isTestPath(relativePath) {
  return /(^|\/)(test|tests|__tests__)\/|(\.|-)(test|spec)\.[A-Za-z0-9]+$/i.test(relativePath);
}

function isDocumentationPath(relativePath) {
  return /\.(md|txt)$/i.test(relativePath) || /(^|\/)(README|CHANGELOG|ARCHITECTURE)(\.[A-Za-z0-9]+)?$/i.test(relativePath);
}

function modelLikePath(relativePath) {
  return /(^|\/)(models?|schema|entities)\//i.test(relativePath) || /model\.[cm]?[jt]s$/i.test(relativePath);
}

function deterministicPathRole(relativePath) {
  if (isDocumentationPath(relativePath)) return "documentation";
  if (isTestPath(relativePath)) return "test";
  if (isConfigurationPath(relativePath)) return "configuration";
  if (/migrations?\//i.test(relativePath)) return "database migration";
  if (/routes?|api/.test(relativePath)) return "routing";
  if (/models?|schema/.test(relativePath)) return "persistence";
  return "source file";
}

function fileTags(relativePath, type) {
  return uniqueSorted([type.toLowerCase(), languageForPath(relativePath).toLowerCase(), deterministicPathRole(relativePath).replace(/\s+/g, "-")]);
}

function sourceCandidatesForTest(relativePath) {
  const basename = path.posix.basename(relativePath).replace(/(\.|-)(test|spec)(\.[^.]+)$/i, "$3");
  const directory = path.posix.dirname(relativePath).replace(/(^|\/)(test|tests|__tests__)($|\/)/, "$1src$2");
  return uniqueSorted([
    path.posix.join(directory, basename),
    path.posix.join("src", basename),
    basename,
  ].map(normalizePath));
}

function definitionTypes() {
  return new Set([
    CODE_ENTITY_TYPES.CLASS,
    CODE_ENTITY_TYPES.INTERFACE,
    CODE_ENTITY_TYPES.TYPE,
    CODE_ENTITY_TYPES.ENUM,
    CODE_ENTITY_TYPES.FUNCTION,
    CODE_ENTITY_TYPES.METHOD,
    CODE_ENTITY_TYPES.CONSTRUCTOR,
    CODE_ENTITY_TYPES.PROPERTY,
    CODE_ENTITY_TYPES.VARIABLE,
    CODE_ENTITY_TYPES.CONSTANT,
    CODE_ENTITY_TYPES.MODULE,
    CODE_ENTITY_TYPES.ROUTE,
    CODE_ENTITY_TYPES.ENDPOINT,
    CODE_ENTITY_TYPES.DATABASE_MODEL,
  ]);
}

function fileLikeTypes() {
  return new Set([
    CODE_ENTITY_TYPES.FILE,
    CODE_ENTITY_TYPES.TEST,
    CODE_ENTITY_TYPES.CONFIGURATION,
    CODE_ENTITY_TYPES.DOCUMENTATION,
    CODE_ENTITY_TYPES.DATABASE_MIGRATION,
  ]);
}

function deadCodeEligibleTypes() {
  return new Set([
    CODE_ENTITY_TYPES.FUNCTION,
    CODE_ENTITY_TYPES.METHOD,
    CODE_ENTITY_TYPES.CLASS,
    CODE_ENTITY_TYPES.VARIABLE,
    CODE_ENTITY_TYPES.CONSTANT,
  ]);
}

function isRuntimeRegistered(entity, relationships) {
  return Array.from(relationships.values()).some((relationship) =>
    relationship.targetId === entity.id &&
    [CODE_RELATIONSHIP_TYPES.ROUTES_TO, CODE_RELATIONSHIP_TYPES.CONFIGURES, CODE_RELATIONSHIP_TYPES.TESTS, CODE_RELATIONSHIP_TYPES.TESTED_BY].includes(relationship.type));
}

function uniqueEntities(entities) {
  const byId = new Map();
  for (const entity of entities.filter(Boolean)) byId.set(entity.id, entity);
  return Array.from(byId.values()).sort(compareEntities).map(clonePlainObject);
}

function extensionForLanguage(language) {
  const normalized = String(language || "").toLowerCase();
  if (normalized.includes("javascript")) return "js";
  if (normalized.includes("typescript")) return "ts";
  if (normalized.includes("python")) return "py";
  if (normalized.includes("markdown")) return "md";
  return "txt";
}

function article(value) {
  return /^[aeiou]/i.test(value) ? "an" : "a";
}

function defaultPersistencePath(repositoryPath) {
  if (!repositoryPath) throw new Error("Code understanding persistence requires a repository path or file path.");
  return path.join(repositoryPath, ".levi", "code-understanding.json");
}

function normalizePath(value) {
  const normalized = requiredString(String(value || ""), "Code understanding path is required.").replace(/\\/g, "/").replace(/^\.\//, "");
  return normalized === "." ? "." : normalized.split("/").filter(Boolean).join("/");
}

function normalizeRegExpArray(values) {
  return safeArray(values).map((value) => value instanceof RegExp ? value : new RegExp(String(value)));
}

function normalizeStringArray(value) {
  return uniqueSorted(safeArray(value).map((entry) => String(entry).trim()).filter(Boolean));
}

function normalizeStringSet(value) {
  return new Set(normalizeStringArray(value));
}

function setMatches(filters, value) {
  if (filters.size === 0) return true;
  const normalized = String(value || "");
  return Array.from(filters).some((filter) => normalized === filter || normalized.includes(filter));
}

function normalizeScore(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function normalizePositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null) return new Date().toISOString();
  const timestamp = typeof value === "number" ? new Date(value).toISOString() : String(value);
  if (Number.isNaN(Date.parse(timestamp))) throw new Error("Code understanding timestamp must be valid.");
  return timestamp;
}

function tokenize(value) {
  return String(value || "").toLowerCase().split(/[^a-z0-9_$.-]+/i).filter((token) => token.length > 1);
}

function average(values) {
  return values.length === 0 ? 0 : Number((values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length).toFixed(6));
}

function projectIdFor(root) {
  return `project:${stableHash(path.resolve(root))}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function stableHash(value) {
  return sha256(stableSerialize(value)).slice(0, 16);
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isPlainObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compareEntities(left, right) {
  return left.type.localeCompare(right.type) ||
    String(left.path || "").localeCompare(String(right.path || "")) ||
    left.qualifiedName.localeCompare(right.qualifiedName) ||
    left.id.localeCompare(right.id);
}

function compareRelationships(left, right) {
  return left.type.localeCompare(right.type) ||
    String(left.path || "").localeCompare(String(right.path || "")) ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.targetId.localeCompare(right.targetId) ||
    left.id.localeCompare(right.id);
}

function compareFindings(left, right) {
  return left.code.localeCompare(right.code) || left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}

function compareEntries(left, right) {
  return left[0].localeCompare(right[0]);
}

module.exports = {
  CHANGE_TYPES,
  CODE_ENTITY_TYPES,
  CODE_FINDING_CODES,
  CODE_FINDING_SEVERITIES,
  CODE_RELATIONSHIP_TYPES,
  CODE_UNDERSTANDING_EVENTS,
  CODE_UNDERSTANDING_EVENT_TYPES,
  CODE_UNDERSTANDING_SCHEMA_VERSION,
  CodeUnderstandingEngine,
};
