const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { scanRepository } = require("./repository-scanner");
const { buildStructuralIndex, UNKNOWN } = require("./structural-index");
const { summarizeProject } = require("./project-summary");

const OFFLINE_INDEX_SCHEMA_VERSION = 1;
const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;

const OFFLINE_INDEX_DOCUMENT_TYPES = Object.freeze({
  REPOSITORY: "repository",
  DIRECTORY: "directory",
  FILE: "file",
  SYMBOL: "symbol",
  IMPORT: "import",
  EXPORT: "export",
  REFERENCE: "reference",
  FUNCTION: "function",
  METHOD: "method",
  CLASS: "class",
  INTERFACE: "interface",
  CONFIGURATION: "configuration",
  TEST: "test",
  DEPENDENCY: "dependency",
  PROJECT_KNOWLEDGE: "project_knowledge",
  DURABLE_DECISION: "durable_decision",
  LEARNING_RECORD: "learning_record",
  GRAPH_NODE: "graph_node",
});

const OFFLINE_INDEX_EVENTS = Object.freeze({
  LIFECYCLE: "lifecycle",
});

const OFFLINE_INDEX_EVENT_TYPES = Object.freeze({
  BUILD_STARTED: "offline_index_build_started",
  BUILD_COMPLETED: "offline_index_build_completed",
  UPDATE_STARTED: "offline_index_update_started",
  UPDATE_COMPLETED: "offline_index_update_completed",
  DOCUMENT_ADDED: "offline_index_document_added",
  DOCUMENT_UPDATED: "offline_index_document_updated",
  DOCUMENT_REMOVED: "offline_index_document_removed",
  DOCUMENT_SKIPPED: "offline_index_document_skipped",
  SEARCH_STARTED: "offline_index_search_started",
  SEARCH_COMPLETED: "offline_index_search_completed",
  PERSISTED: "offline_index_persisted",
  RESTORED: "offline_index_restored",
  CORRUPTION_DETECTED: "offline_index_corruption_detected",
  REBUILD_REQUIRED: "offline_index_rebuild_required",
  COMPACTED: "offline_index_compacted",
});

const CHANGE_TYPES = Object.freeze({
  CREATED: "created",
  MODIFIED: "modified",
  DELETED: "deleted",
  RENAMED: "renamed",
});

const DEFAULT_IGNORED_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".levi",
  "coverage",
  "dist",
  "build",
  "out",
  "generated",
  ".next",
  "node_modules",
  "vendor",
]);

const SECRET_NAME_PATTERNS = [
  /(^|[._-])env($|[._-])/i,
  /secret/i,
  /credential/i,
  /private[-_]?key/i,
  /api[-_]?key/i,
  /token/i,
];

const FIELD_WEIGHTS = Object.freeze({
  exactSymbol: 45,
  exactPath: 42,
  title: 18,
  phrase: 16,
  symbol: 14,
  path: 12,
  tag: 9,
  reference: 7,
  token: 4,
  content: 1,
  project: 8,
  language: 5,
  graph: 7,
  learningImportance: 8,
  durableDecision: 12,
  recency: 2,
});

class OfflineKnowledgeIndex extends EventEmitter {
  constructor(options = {}) {
    super();
    this.documents = new Map();
    this.projectId = options.projectId || null;
    this.repositoryPath = options.repositoryPath ? path.resolve(options.repositoryPath) : null;
    this.persistencePath = options.persistencePath || null;
    this.scanRepository = options.scanRepository || scanRepository;
    this.summarizeProject = options.summarizeProject || summarizeProject;
    this.semanticAdapters = normalizeSemanticAdapters(options.semanticAdapters || []);
    this.migrations = Array.isArray(options.migrations) ? options.migrations.slice() : [];
    this.maxFileBytes = normalizePositiveInteger(options.maxFileBytes, DEFAULT_MAX_FILE_BYTES);
    this.ignorePatterns = normalizeIgnorePatterns(options.ignorePatterns || []);
    this.createdAt = normalizeTimestamp(options.createdAt);
    this.updatedAt = normalizeTimestamp(options.updatedAt || this.createdAt);
    this.stats = emptyStats();
  }

  build(repositoryPath, options = {}) {
    const root = path.resolve(repositoryPath || this.repositoryPath || "");
    if (!root) {
      throw new Error("Offline knowledge index build requires a repository path.");
    }

    this.emitLifecycle(OFFLINE_INDEX_EVENT_TYPES.BUILD_STARTED, { repositoryPath: root });
    this.clear({ silent: true });
    this.repositoryPath = root;
    this.projectId = options.projectId || this.projectId || projectIdFor(root);

    const timestamp = normalizeTimestamp(options.timestamp);
    const scanResult = options.scanResult || this.scanRepository(root);
    const projectSummary = options.projectSummary || this.summarizeProject(scanResult);
    const graphSnapshot = normalizeGraphSnapshot(options.repositoryGraph || options.graph || options.graphSnapshot);
    const learningRecords = normalizeLearningRecords(options.learningEngine || options.learningRecords || options.learningSnapshot);

    this.indexMany([
      repositoryDocument(root, this.projectId, scanResult, timestamp),
      ...directoryDocuments(scanResult, this.projectId, timestamp, graphSnapshot),
      ...fileDocuments(scanResult, this.projectId, root, timestamp, graphSnapshot, this.maxFileBytes),
      ...structuralDocuments(scanResult.structuralIndex, this.projectId, timestamp, graphSnapshot),
      ...dependencyDocuments(projectSummary.dependencies, this.projectId, timestamp, graphSnapshot),
      ...projectKnowledgeDocuments(options.projectKnowledgeFacts || options.knowledgeFacts || [], this.projectId, timestamp, graphSnapshot),
      ...durableDecisionDocuments(options.decisionRecords || [], this.projectId, timestamp, graphSnapshot),
      ...learningDocuments(learningRecords, this.projectId, timestamp, graphSnapshot),
      ...graphNodeDocuments(graphSnapshot, this.projectId, timestamp),
    ]);

    this.stats.lastFullBuild = timestamp;
    this.stats.ignoredFiles = Array.isArray(scanResult.skipped) ? scanResult.skipped.length : 0;
    this.recalculateStats();
    this.emitLifecycle(OFFLINE_INDEX_EVENT_TYPES.BUILD_COMPLETED, {
      repositoryPath: root,
      documentCount: this.documents.size,
    });
    return this.snapshot();
  }

  update(changes, options = {}) {
    const normalizedChanges = normalizeChanges(changes);
    const timestamp = normalizeTimestamp(options.timestamp);
    this.emitLifecycle(OFFLINE_INDEX_EVENT_TYPES.UPDATE_STARTED, { changeCount: normalizedChanges.length });
    let skippedUnchanged = 0;
    let ignoredFiles = 0;

    for (const change of normalizedChanges) {
      if (change.type === CHANGE_TYPES.DELETED) {
        this.removeByPath(change.path);
        continue;
      }

      if (change.type === CHANGE_TYPES.RENAMED) {
        this.renamePath(change.oldPath, change.newPath, options);
        continue;
      }

      const relativePath = change.path;
      const ignored = this.shouldIgnore(relativePath);
      if (ignored) {
        ignoredFiles += 1;
        this.emitLifecycle(OFFLINE_INDEX_EVENT_TYPES.DOCUMENT_SKIPPED, { path: relativePath, reason: ignored });
        continue;
      }

      const currentHash = fileContentHash(this.repositoryPath, relativePath, this.maxFileBytes);
      const existingFile = this.findFileDocumentByPath(relativePath);
      if (existingFile && existingFile.contentHash === currentHash) {
        skippedUnchanged += 1;
        this.emitLifecycle(OFFLINE_INDEX_EVENT_TYPES.DOCUMENT_SKIPPED, { path: relativePath, reason: "unchanged" });
        continue;
      }

      this.removeByPath(relativePath);
      this.indexFilePath(relativePath, {
        ...options,
        timestamp,
      });
    }

    this.stats.lastIncrementalUpdate = timestamp;
    this.stats.skippedUnchangedFiles += skippedUnchanged;
    this.stats.ignoredFiles += ignoredFiles;
    this.recalculateStats();
    this.emitLifecycle(OFFLINE_INDEX_EVENT_TYPES.UPDATE_COMPLETED, {
      changeCount: normalizedChanges.length,
      skippedUnchangedFiles: skippedUnchanged,
      ignoredFiles,
    });
    return this.snapshot();
  }

  indexDocument(document) {
    const normalized = normalizeIndexDocument(document, {
      projectId: this.projectId,
    });
    const existing = this.documents.get(normalized.id);

    if (existing && existing.contentHash === normalized.contentHash) {
      this.emitLifecycle(OFFLINE_INDEX_EVENT_TYPES.DOCUMENT_SKIPPED, { id: normalized.id, reason: "unchanged" });
      return clonePlainObject(existing);
    }

    const next = existing
      ? {
          ...normalized,
          indexedAt: existing.indexedAt,
          updatedAt: normalizeTimestamp(normalized.updatedAt),
        }
      : normalized;

    this.documents.set(next.id, next);
    this.emitLifecycle(existing ? OFFLINE_INDEX_EVENT_TYPES.DOCUMENT_UPDATED : OFFLINE_INDEX_EVENT_TYPES.DOCUMENT_ADDED, {
      document: clonePlainObject(next),
    });
    this.recalculateStats();
    return clonePlainObject(next);
  }

  indexMany(documents) {
    return (Array.isArray(documents) ? documents : [documents]).filter(Boolean).map((document) => this.indexDocument(document));
  }

  remove(id) {
    const documentId = requiredString(id, "Offline knowledge index document id is required.");
    const existing = this.documents.get(documentId);
    if (!existing) {
      return false;
    }
    this.documents.delete(documentId);
    this.emitLifecycle(OFFLINE_INDEX_EVENT_TYPES.DOCUMENT_REMOVED, { document: clonePlainObject(existing) });
    this.recalculateStats();
    return true;
  }

  removeByPath(filePath) {
    const normalizedPath = normalizePath(filePath);
    const ids = Array.from(this.documents.values())
      .filter((document) => document.path === normalizedPath || document.metadata.filePath === normalizedPath)
      .map((document) => document.id);
    for (const id of ids) {
      this.remove(id);
    }
    return ids.length;
  }

  renamePath(oldPath, newPath, options = {}) {
    const oldRelativePath = normalizePath(oldPath);
    const newRelativePath = normalizePath(newPath);
    this.removeByPath(oldRelativePath);
    if (!this.shouldIgnore(newRelativePath)) {
      this.indexFilePath(newRelativePath, options);
    }
    return this.findFileDocumentByPath(newRelativePath);
  }

  search(query, options = {}) {
    const normalizedQuery = normalizeSearchQuery(query, options);
    this.emitLifecycle(OFFLINE_INDEX_EVENT_TYPES.SEARCH_STARTED, { query: normalizedQuery.original });
    const filters = normalizeSearchFilters(options.filters || options);
    const lexical = Array.from(this.documents.values())
      .filter((document) => matchesDocumentFilters(document, filters))
      .map((document) => scoreDocument(document, normalizedQuery, filters, options))
      .filter((entry) => entry.matched || normalizedQuery.tokens.length === 0)
      .sort(compareSearchResults);

    let ranked = lexical;
    for (const adapter of this.semanticAdapters) {
      if (typeof adapter.rank === "function") {
        ranked = adapter.rank(ranked, { query: normalizedQuery, options }) || ranked;
      }
    }

    const limit = normalizePositiveInteger(options.limit, 50);
    const results = ranked.slice(0, limit).map((entry) => ({
      ...clonePlainObject(entry.document),
      score: entry.score,
      matches: clonePlainObject(entry.matches),
    }));
    this.emitLifecycle(OFFLINE_INDEX_EVENT_TYPES.SEARCH_COMPLETED, {
      query: normalizedQuery.original,
      count: results.length,
    });
    return results;
  }

  searchSymbols(query, options = {}) {
    return this.search(query, {
      ...options,
      filters: {
        ...(options.filters || {}),
        types: [
          OFFLINE_INDEX_DOCUMENT_TYPES.SYMBOL,
          OFFLINE_INDEX_DOCUMENT_TYPES.FUNCTION,
          OFFLINE_INDEX_DOCUMENT_TYPES.METHOD,
          OFFLINE_INDEX_DOCUMENT_TYPES.CLASS,
          OFFLINE_INDEX_DOCUMENT_TYPES.INTERFACE,
        ],
      },
    });
  }

  searchPaths(query, options = {}) {
    return this.search(query, {
      ...options,
      pathBoost: true,
    });
  }

  searchReferences(query, options = {}) {
    return this.search(query, {
      ...options,
      filters: {
        ...(options.filters || {}),
        types: [
          OFFLINE_INDEX_DOCUMENT_TYPES.IMPORT,
          OFFLINE_INDEX_DOCUMENT_TYPES.EXPORT,
          OFFLINE_INDEX_DOCUMENT_TYPES.REFERENCE,
        ],
      },
    });
  }

  get(id) {
    const document = this.documents.get(id);
    return document ? clonePlainObject(document) : null;
  }

  list(filter = {}) {
    const normalized = normalizeSearchFilters(filter);
    return Array.from(this.documents.values())
      .filter((document) => matchesDocumentFilters(document, normalized))
      .sort(compareDocuments)
      .map(clonePlainObject);
  }

  getStats() {
    this.recalculateStats();
    return clonePlainObject(this.stats);
  }

  compact() {
    const before = this.documents.size;
    const byId = new Map();
    for (const document of this.documents.values()) {
      byId.set(document.id, normalizeIndexDocument(document, { projectId: this.projectId }));
    }
    this.documents = byId;
    this.recalculateStats();
    this.emitLifecycle(OFFLINE_INDEX_EVENT_TYPES.COMPACTED, {
      before,
      after: this.documents.size,
    });
    return this.snapshot();
  }

  clear(options = {}) {
    this.documents.clear();
    this.stats = emptyStats();
    if (!options.silent) {
      this.emitLifecycle(OFFLINE_INDEX_EVENT_TYPES.COMPACTED, { before: 0, after: 0 });
    }
  }

  snapshot() {
    return {
      schemaVersion: OFFLINE_INDEX_SCHEMA_VERSION,
      projectId: this.projectId,
      repositoryPath: this.repositoryPath,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      stats: this.getStats(),
      documents: Array.from(this.documents.values()).sort(compareDocuments).map(clonePlainObject),
    };
  }

  restore(snapshot) {
    const migrated = migrateSnapshot(snapshot, this.migrations);
    validateSnapshot(migrated);
    this.documents.clear();
    this.projectId = migrated.projectId || this.projectId;
    this.repositoryPath = migrated.repositoryPath || this.repositoryPath;
    this.createdAt = normalizeTimestamp(migrated.createdAt);
    this.updatedAt = normalizeTimestamp(migrated.updatedAt || migrated.createdAt);
    for (const document of migrated.documents) {
      const normalized = normalizeIndexDocument(document, { projectId: this.projectId });
      this.documents.set(normalized.id, normalized);
    }
    this.stats = {
      ...emptyStats(),
      ...clonePlainObject(migrated.stats || {}),
    };
    this.recalculateStats();
    this.emitLifecycle(OFFLINE_INDEX_EVENT_TYPES.RESTORED, { documentCount: this.documents.size });
    return this.snapshot();
  }

  save(filePath = this.persistencePath || defaultPersistencePath(this.repositoryPath)) {
    const targetPath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const tempPath = `${targetPath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(this.snapshot(), null, 2)}\n`, "utf8");
    fs.renameSync(tempPath, targetPath);
    this.persistencePath = targetPath;
    this.emitLifecycle(OFFLINE_INDEX_EVENT_TYPES.PERSISTED, { path: targetPath });
    return {
      status: "PERSISTED",
      path: targetPath,
      schemaVersion: OFFLINE_INDEX_SCHEMA_VERSION,
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
        schemaVersion: OFFLINE_INDEX_SCHEMA_VERSION,
      };
    } catch (error) {
      this.emitLifecycle(OFFLINE_INDEX_EVENT_TYPES.CORRUPTION_DETECTED, {
        path: targetPath,
        reason: error.message,
      });
      if (options.rebuildOnCorruption === true && (options.repositoryPath || this.repositoryPath)) {
        this.emitLifecycle(OFFLINE_INDEX_EVENT_TYPES.REBUILD_REQUIRED, {
          path: targetPath,
          reason: error.message,
        });
        this.build(options.repositoryPath || this.repositoryPath, options);
        return {
          status: "REBUILT",
          path: targetPath,
          schemaVersion: OFFLINE_INDEX_SCHEMA_VERSION,
        };
      }
      if (options.emptyOnCorruption === true) {
        this.clear({ silent: true });
        this.emitLifecycle(OFFLINE_INDEX_EVENT_TYPES.RESTORED, { documentCount: 0, reason: error.message });
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

  indexFilePath(relativePath, options = {}) {
    const normalizedPath = normalizePath(relativePath);
    const timestamp = normalizeTimestamp(options.timestamp);
    const scanResult = {
      root: this.repositoryPath,
      files: [{ path: normalizedPath }],
      skipped: [],
      detected: { entryPoints: [] },
    };
    scanResult.structuralIndex = buildStructuralIndex(scanResult);
    const graphSnapshot = normalizeGraphSnapshot(options.repositoryGraph || options.graph || options.graphSnapshot);
    this.indexMany([
      ...fileDocuments(scanResult, this.projectId, this.repositoryPath, timestamp, graphSnapshot, this.maxFileBytes),
      ...structuralDocuments(scanResult.structuralIndex, this.projectId, timestamp, graphSnapshot),
    ]);
  }

  findFileDocumentByPath(filePath) {
    const normalizedPath = normalizePath(filePath);
    return Array.from(this.documents.values()).find((document) =>
      document.type === OFFLINE_INDEX_DOCUMENT_TYPES.FILE && document.path === normalizedPath) || null;
  }

  shouldIgnore(relativePath) {
    return shouldIgnorePath(this.repositoryPath, relativePath, {
      ignorePatterns: this.ignorePatterns,
      maxFileBytes: this.maxFileBytes,
    });
  }

  recalculateStats() {
    const stats = {
      ...this.stats,
      documentCount: this.documents.size,
      fileCount: 0,
      symbolCount: 0,
      totalIndexedBytes: 0,
      languages: {},
      documentTypes: {},
    };
    for (const document of this.documents.values()) {
      stats.totalIndexedBytes += Buffer.byteLength(document.content || "", "utf8");
      stats.documentTypes[document.type] = (stats.documentTypes[document.type] || 0) + 1;
      if (document.language) {
        stats.languages[document.language] = (stats.languages[document.language] || 0) + 1;
      }
      if (document.type === OFFLINE_INDEX_DOCUMENT_TYPES.FILE) {
        stats.fileCount += 1;
      }
      if (document.symbols.length > 0 || symbolDocumentTypes().has(document.type)) {
        stats.symbolCount += document.symbols.length || 1;
      }
    }
    this.stats = stats;
  }

  emitLifecycle(type, payload = {}) {
    this.emit(OFFLINE_INDEX_EVENTS.LIFECYCLE, {
      type,
      timestamp: new Date().toISOString(),
      schemaVersion: OFFLINE_INDEX_SCHEMA_VERSION,
      ...payload,
    });
  }
}

function repositoryDocument(root, projectId, scanResult, timestamp) {
  return {
    id: `repository:${stableHash(root)}`,
    type: OFFLINE_INDEX_DOCUMENT_TYPES.REPOSITORY,
    projectId,
    path: ".",
    language: "Repository",
    title: path.basename(root) || root,
    content: `Repository ${root}`,
    symbols: [],
    tags: ["repository"],
    references: [],
    metadata: {
      repositoryPath: root,
      fileCount: Array.isArray(scanResult.files) ? scanResult.files.length : 0,
    },
    indexedAt: timestamp,
    updatedAt: timestamp,
  };
}

function directoryDocuments(scanResult, projectId, timestamp, graphSnapshot) {
  const directories = new Set();
  for (const file of safeFiles(scanResult.files)) {
    const parts = normalizePath(file.path).split("/");
    let current = "";
    for (let index = 0; index < parts.length - 1; index += 1) {
      current = current ? `${current}/${parts[index]}` : parts[index];
      directories.add(current);
    }
  }
  return Array.from(directories).sort().map((directoryPath) => ({
    id: `directory:${directoryPath}`,
    type: OFFLINE_INDEX_DOCUMENT_TYPES.DIRECTORY,
    projectId,
    path: directoryPath,
    language: "Directory",
    title: directoryPath,
    content: `Directory ${directoryPath}`,
    symbols: [],
    tags: ["directory"],
    references: graphReferencesForPath(graphSnapshot, directoryPath),
    metadata: {
      graphNodeIds: graphReferencesForPath(graphSnapshot, directoryPath),
    },
    indexedAt: timestamp,
    updatedAt: timestamp,
  }));
}

function fileDocuments(scanResult, projectId, root, timestamp, graphSnapshot, maxFileBytes) {
  const documents = [];
  for (const file of safeFiles(scanResult.files)) {
    const relativePath = normalizePath(file.path);
    const fullPath = path.join(root, relativePath);
    const ignored = shouldIgnorePath(root, relativePath, { maxFileBytes });
    if (ignored) {
      continue;
    }
    const content = readTextFile(fullPath);
    const type = fileDocumentType(relativePath);
    const references = graphReferencesForPath(graphSnapshot, relativePath);
    documents.push({
      id: `file:${relativePath}`,
      type,
      projectId,
      path: relativePath,
      language: languageForPath(relativePath),
      title: path.posix.basename(relativePath),
      content,
      symbols: [],
      tags: fileTags(relativePath, type),
      references,
      metadata: {
        filePath: relativePath,
        graphNodeIds: references,
      },
      contentHash: sha256(content),
      indexedAt: timestamp,
      updatedAt: timestamp,
    });
  }
  return documents;
}

function structuralDocuments(structuralIndex, projectId, timestamp, graphSnapshot) {
  if (!structuralIndex || !Array.isArray(structuralIndex.symbols)) {
    return [];
  }
  const documents = [];
  for (const symbol of structuralIndex.symbols) {
    if (!symbol || !symbol.path || symbol.path === UNKNOWN || !symbol.name || symbol.name === UNKNOWN) {
      continue;
    }
    const type = documentTypeForSymbol(symbol.type);
    const references = graphReferencesForSymbol(graphSnapshot, symbol);
    documents.push({
      id: `symbol:${stableHash({ path: symbol.path, name: symbol.name, type: symbol.type, parent: symbol.parent || UNKNOWN })}`,
      type,
      projectId,
      path: normalizePath(symbol.path),
      language: symbol.language || languageForPath(symbol.path),
      title: symbol.name,
      content: `${symbol.type} ${symbol.name} ${symbol.parent || ""} ${symbol.signal || ""}`,
      symbols: [symbol.name],
      tags: uniqueSorted(["symbol", symbol.type, symbol.exported ? "exported" : null].filter(Boolean)),
      references,
      metadata: {
        filePath: normalizePath(symbol.path),
        symbolId: symbol.symbolId,
        symbolType: symbol.type,
        parent: symbol.parent || UNKNOWN,
        lineNumber: symbol.lineNumber || 1,
        graphNodeIds: references,
      },
      indexedAt: timestamp,
      updatedAt: timestamp,
    });
  }
  for (const relationship of Array.isArray(structuralIndex.relationships) ? structuralIndex.relationships : []) {
    const type = documentTypeForRelationship(relationship.relationshipType);
    const title = relationshipTitle(relationship);
    const sourcePath = normalizePath(relationship.sourcePath || "UNKNOWN");
    const references = graphReferencesForRelationship(graphSnapshot, relationship);
    documents.push({
      id: `relationship:${stableHash({
        type: relationship.relationshipType,
        sourcePath,
        source: relationship.sourceSymbol,
        target: relationship.targetSymbol,
        targetPath: relationship.targetPath,
        lineNumber: relationship.lineNumber,
      })}`,
      type,
      projectId,
      path: sourcePath,
      language: languageForPath(sourcePath),
      title,
      content: `${relationship.relationshipType} ${title} ${relationship.evidence ? relationship.evidence.signal || "" : ""}`,
      symbols: relationshipSymbols(relationship),
      tags: uniqueSorted(["reference", relationship.relationshipType].filter(Boolean)),
      references,
      metadata: {
        filePath: sourcePath,
        relationshipId: relationship.relationshipId,
        relationshipType: relationship.relationshipType,
        targetPath: relationship.targetPath,
        lineNumber: relationship.lineNumber || 1,
        graphNodeIds: references,
      },
      indexedAt: timestamp,
      updatedAt: timestamp,
    });
  }
  return documents;
}

function dependencyDocuments(dependencySummaries, projectId, timestamp, graphSnapshot) {
  const documents = [];
  for (const manifest of Array.isArray(dependencySummaries) ? dependencySummaries : []) {
    if (!manifest || !Array.isArray(manifest.dependencies)) {
      continue;
    }
    for (const dependency of manifest.dependencies) {
      const references = graphReferencesForDependency(graphSnapshot, dependency.name);
      documents.push({
        id: `dependency:${String(dependency.name).toLowerCase()}`,
        type: OFFLINE_INDEX_DOCUMENT_TYPES.DEPENDENCY,
        projectId,
        path: manifest.source || null,
        language: null,
        title: dependency.name,
        content: `${dependency.name} ${dependency.version || ""} ${dependency.group || ""}`,
        symbols: [dependency.name],
        tags: ["dependency", dependency.group || "dependency"],
        references,
        metadata: {
          source: manifest.source,
          version: dependency.version || UNKNOWN,
          group: dependency.group || UNKNOWN,
          graphNodeIds: references,
        },
        indexedAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }
  return documents;
}

function projectKnowledgeDocuments(facts, projectId, timestamp, graphSnapshot) {
  return (Array.isArray(facts) ? facts : []).map((fact) => {
    const title = fact.category || fact.title || "project knowledge";
    const content = stableReadable(fact.value || fact.summary || fact);
    const references = graphReferencesForEvidence(graphSnapshot, fact.evidence);
    return {
      id: `project-knowledge:${stableHash({ title, content })}`,
      type: OFFLINE_INDEX_DOCUMENT_TYPES.PROJECT_KNOWLEDGE,
      projectId,
      path: evidencePath(fact.evidence),
      language: null,
      title,
      content,
      symbols: [],
      tags: uniqueSorted(["project-knowledge", fact.category].filter(Boolean)),
      references,
      metadata: {
        fact: clonePlainObject(fact),
        graphNodeIds: references,
      },
      indexedAt: timestamp,
      updatedAt: timestamp,
    };
  });
}

function durableDecisionDocuments(records, projectId, timestamp, graphSnapshot) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => record && record.type === "approved-decision")
    .map((record) => {
      const value = record.value || {};
      const title = value.category || value.decisionId || record.id;
      const content = value.statement || value.summary || stableReadable(value);
      const references = graphReferencesForEvidence(graphSnapshot, value.evidence || record.source);
      return {
        id: `durable-decision:${record.id || stableHash(record)}`,
        type: OFFLINE_INDEX_DOCUMENT_TYPES.DURABLE_DECISION,
        projectId: record.projectId || projectId,
        path: evidencePath(value.evidence || record.source),
        language: null,
        title,
        content,
        symbols: [],
        tags: uniqueSorted(["durable-decision", value.category].filter(Boolean)),
        references,
        metadata: {
          record: clonePlainObject(record),
          authoritative: true,
          graphNodeIds: references,
        },
        indexedAt: timestamp,
        updatedAt: timestamp,
      };
    });
}

function learningDocuments(records, projectId, timestamp, graphSnapshot) {
  return (Array.isArray(records) ? records : [])
    .filter((record) => !["ARCHIVED", "REJECTED", "SUPERSEDED"].includes(record.status))
    .map((record) => {
      const references = uniqueSorted([
        ...asArray(record.references),
        ...asArray(record.metadata && record.metadata.graphNodeIds),
        ...graphReferencesForEvidence(graphSnapshot, record.evidence),
      ]);
      return {
        id: `learning-record:${record.id}`,
        type: OFFLINE_INDEX_DOCUMENT_TYPES.LEARNING_RECORD,
        projectId: record.projectId || projectId,
        path: evidencePath(record.evidence),
        language: null,
        title: record.title,
        content: record.summary,
        symbols: [],
        tags: uniqueSorted(["learning", record.type, ...asArray(record.tags)]),
        references,
        metadata: {
          record: clonePlainObject(record),
          importance: record.importance || 0,
          confidence: record.confidence || 0,
          graphNodeIds: references,
        },
        indexedAt: timestamp,
        updatedAt: timestamp,
      };
    });
}

function graphNodeDocuments(graphSnapshot, projectId, timestamp) {
  if (!graphSnapshot || !Array.isArray(graphSnapshot.nodes)) {
    return [];
  }
  return graphSnapshot.nodes.map((node) => ({
    id: `graph-node:${node.id}`,
    type: OFFLINE_INDEX_DOCUMENT_TYPES.GRAPH_NODE,
    projectId,
    path: node.path || null,
    language: node.language || null,
    title: node.name,
    content: `${node.type} ${node.name} ${node.path || ""}`,
    symbols: node.name ? [node.name] : [],
    tags: uniqueSorted(["graph-node", node.type].filter(Boolean)),
    references: [node.id],
    metadata: {
      graphNode: clonePlainObject(node),
      graphNodeIds: [node.id],
    },
    indexedAt: timestamp,
    updatedAt: timestamp,
  }));
}

function normalizeIndexDocument(document, defaults = {}) {
  if (!isPlainObject(document)) {
    throw new Error("Offline knowledge index document must be an object.");
  }
  const type = normalizeDocumentType(document.type);
  const title = requiredString(document.title, "Offline knowledge index document title is required.");
  const content = String(document.content || "");
  const symbols = uniqueSorted(asArray(document.symbols).map(String).filter(Boolean));
  const tags = uniqueSorted(asArray(document.tags).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean));
  const references = uniqueSorted(asArray(document.references).map(String).filter(Boolean));
  const pathValue = document.path === undefined || document.path === null ? null : normalizePath(document.path);
  const tokens = [
    ...tokenize(title),
    ...tokenize(content),
    ...symbols.flatMap(tokenize),
    ...tags.flatMap(tokenize),
    ...references.flatMap(tokenize),
    ...tokenize(pathValue || ""),
  ].sort();
  const timestamp = normalizeTimestamp(document.updatedAt || document.indexedAt);
  const contentHash = document.contentHash || sha256(stableSerialize({
    type,
    path: pathValue,
    title,
    content,
    symbols,
    tags,
    references,
    metadata: document.metadata || {},
  }));
  return {
    id: document.id || `document:${stableHash({ type, path: pathValue, title })}`,
    type,
    projectId: requiredString(document.projectId || defaults.projectId, "Offline knowledge index document projectId is required."),
    path: pathValue,
    language: document.language === undefined || document.language === null ? null : String(document.language),
    title,
    content,
    tokens,
    symbols,
    tags,
    references,
    metadata: clonePlainObject(document.metadata || {}),
    contentHash,
    indexedAt: normalizeTimestamp(document.indexedAt || timestamp),
    updatedAt: timestamp,
  };
}

function scoreDocument(document, query, filters, options) {
  const matches = {};
  let score = 0;
  let matched = query.tokens.length === 0 && query.phrase.length === 0;
  const normalizedPath = String(document.path || "").toLowerCase();
  const normalizedTitle = document.title.toLowerCase();
  const normalizedContent = document.content.toLowerCase();
  const normalizedSymbols = document.symbols.map((symbol) => symbol.toLowerCase());
  const normalizedTags = document.tags.map((tag) => tag.toLowerCase());

  if (filters.projectIds.size > 0 && filters.projectIds.has(document.projectId)) {
    score += FIELD_WEIGHTS.project;
    matches.project = true;
  }
  if (filters.languages.size > 0 && document.language && filters.languages.has(document.language)) {
    score += FIELD_WEIGHTS.language;
    matches.language = true;
  }
  if (query.phrase && normalizedContent.includes(query.phrase)) {
    score += FIELD_WEIGHTS.phrase;
    matches.phrase = true;
    matched = true;
  }
  if (query.phrase && normalizedTitle.includes(query.phrase)) {
    score += FIELD_WEIGHTS.title;
    matches.titlePhrase = true;
    matched = true;
  }
  if (query.phrase && normalizedPath === query.phrase) {
    score += FIELD_WEIGHTS.exactPath;
    matches.exactPath = true;
    matched = true;
  }
  if (query.phrase && normalizedSymbols.includes(query.phrase)) {
    score += FIELD_WEIGHTS.exactSymbol;
    matches.exactSymbol = true;
    matched = true;
  }

  const tokenCounts = tokenFrequency(document.tokens);
  let overlap = 0;
  for (const token of query.tokens) {
    if (normalizedTitle.includes(token)) {
      score += FIELD_WEIGHTS.title;
      matches.title = true;
      matched = true;
    }
    if (normalizedPath.includes(token)) {
      score += options.pathBoost ? FIELD_WEIGHTS.exactPath : FIELD_WEIGHTS.path;
      matches.path = true;
      matched = true;
    }
    if (normalizedSymbols.some((symbol) => symbol === token || symbol.includes(token))) {
      score += normalizedSymbols.includes(token) ? FIELD_WEIGHTS.exactSymbol : FIELD_WEIGHTS.symbol;
      matches.symbol = true;
      matched = true;
    }
    if (normalizedTags.includes(token)) {
      score += FIELD_WEIGHTS.tag;
      matches.tag = true;
      matched = true;
    }
    if (document.references.some((reference) => reference.toLowerCase().includes(token))) {
      score += FIELD_WEIGHTS.reference;
      matches.reference = true;
      matched = true;
    }
    if (tokenCounts.has(token)) {
      overlap += 1;
      score += FIELD_WEIGHTS.token * tokenCounts.get(token);
      matched = true;
    } else if (normalizedContent.includes(token)) {
      score += FIELD_WEIGHTS.content;
      matched = true;
    }
  }
  if (overlap > 0) {
    matches.tokenOverlap = overlap;
  }
  if (document.type === OFFLINE_INDEX_DOCUMENT_TYPES.DURABLE_DECISION || document.metadata.authoritative === true) {
    score += FIELD_WEIGHTS.durableDecision;
  }
  if (document.type === OFFLINE_INDEX_DOCUMENT_TYPES.LEARNING_RECORD) {
    score += FIELD_WEIGHTS.learningImportance * Number(document.metadata.importance || 0);
  }
  if (filters.graphNodeIds.size > 0 && document.references.some((reference) => filters.graphNodeIds.has(reference))) {
    score += FIELD_WEIGHTS.graph;
    matches.graph = true;
  }
  score += recencyScore(document.updatedAt) * FIELD_WEIGHTS.recency;

  return {
    document,
    score: Number(score.toFixed(6)),
    matches,
    matched,
  };
}

function normalizeSearchQuery(query, options = {}) {
  const original = typeof query === "string" ? query : String(query && query.text || query && query.query || "");
  const phrase = original.trim().toLowerCase();
  return {
    original,
    phrase,
    tokens: tokenize(original),
    options: clonePlainObject(options || {}),
  };
}

function normalizeSearchFilters(input = {}) {
  return {
    ids: normalizeStringSet(input.ids || input.id),
    types: normalizeStringSet(input.types || input.type),
    projectIds: normalizeStringSet(input.projectIds || input.projectId),
    paths: normalizeStringSet(input.paths || input.path),
    languages: normalizeStringSet(input.languages || input.language),
    tags: normalizeStringSet(input.tags || input.tag),
    graphNodeIds: normalizeStringSet(input.graphNodeIds || input.graphNodeId),
  };
}

function matchesDocumentFilters(document, filters) {
  return setMatches(filters.ids, document.id) &&
    setMatches(filters.types, document.type) &&
    setMatches(filters.projectIds, document.projectId) &&
    setMatches(filters.paths, document.path) &&
    setMatches(filters.languages, document.language) &&
    tagsMatch(document.tags, filters.tags) &&
    referencesMatch(document.references, filters.graphNodeIds);
}

function shouldIgnorePath(root, relativePath, options = {}) {
  const normalizedPath = normalizePath(relativePath);
  const parts = normalizedPath.split("/");
  if (parts.some((part) => DEFAULT_IGNORED_DIRECTORIES.has(part))) {
    return "ignored-directory";
  }
  if (options.ignorePatterns && options.ignorePatterns.some((pattern) => pattern.test(normalizedPath))) {
    return "custom-ignore";
  }
  if (SECRET_NAME_PATTERNS.some((pattern) => pattern.test(path.posix.basename(normalizedPath)))) {
    return "secret-like";
  }
  const fullPath = root ? path.join(root, normalizedPath) : normalizedPath;
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  const stats = fs.statSync(fullPath);
  if (stats.size > normalizePositiveInteger(options.maxFileBytes, DEFAULT_MAX_FILE_BYTES)) {
    return "oversized";
  }
  if (isBinaryFile(fullPath)) {
    return "binary";
  }
  if (/\.min\.[a-z0-9]+$/i.test(path.posix.basename(normalizedPath))) {
    return "generated";
  }
  return null;
}

function normalizeGraphSnapshot(input) {
  if (!input) {
    return null;
  }
  if (typeof input.snapshot === "function") {
    return input.snapshot();
  }
  return input;
}

function normalizeLearningRecords(input) {
  if (!input) {
    return [];
  }
  if (typeof input.list === "function") {
    return input.list({ status: "ACTIVE" });
  }
  if (Array.isArray(input)) {
    return input;
  }
  if (Array.isArray(input.records)) {
    return input.records;
  }
  if (typeof input.snapshot === "function") {
    const snapshot = input.snapshot();
    return Array.isArray(snapshot.records) ? snapshot.records : [];
  }
  return [];
}

function graphReferencesForPath(graphSnapshot, relativePath) {
  if (!graphSnapshot || !Array.isArray(graphSnapshot.nodes)) {
    return [];
  }
  const normalizedPath = normalizePath(relativePath);
  return graphSnapshot.nodes
    .filter((node) => normalizeNullablePath(node.path) === normalizedPath || node.metadata && normalizeNullablePath(node.metadata.filePath) === normalizedPath)
    .map((node) => node.id)
    .sort();
}

function graphReferencesForSymbol(graphSnapshot, symbol) {
  if (!graphSnapshot || !Array.isArray(graphSnapshot.nodes)) {
    return [];
  }
  const normalizedPath = normalizePath(symbol.path);
  return graphSnapshot.nodes
    .filter((node) => node.path === normalizedPath && node.name === symbol.name)
    .map((node) => node.id)
    .sort();
}

function graphReferencesForRelationship(graphSnapshot, relationship) {
  return uniqueSorted([
    ...graphReferencesForPath(graphSnapshot, relationship.sourcePath || ""),
    ...graphReferencesForPath(graphSnapshot, relationship.targetPath || ""),
  ]);
}

function graphReferencesForDependency(graphSnapshot, name) {
  if (!graphSnapshot || !Array.isArray(graphSnapshot.nodes)) {
    return [];
  }
  const normalized = String(name).toLowerCase();
  return graphSnapshot.nodes
    .filter((node) => node.type === "dependency" && String(node.name).toLowerCase() === normalized)
    .map((node) => node.id)
    .sort();
}

function graphReferencesForEvidence(graphSnapshot, evidence) {
  return uniqueSorted(asArray(evidence).flatMap((entry) => {
    if (typeof entry === "string") {
      return graphReferencesForPath(graphSnapshot, entry);
    }
    if (entry && typeof entry.source === "string") {
      return graphReferencesForPath(graphSnapshot, entry.source);
    }
    return [];
  }));
}

function fileContentHash(root, relativePath, maxFileBytes) {
  const ignored = shouldIgnorePath(root, relativePath, { maxFileBytes });
  if (ignored) {
    return null;
  }
  return sha256(readTextFile(path.join(root, normalizePath(relativePath))));
}

function fileDocumentType(relativePath) {
  if (isConfigurationPath(relativePath)) {
    return OFFLINE_INDEX_DOCUMENT_TYPES.CONFIGURATION;
  }
  if (isTestPath(relativePath)) {
    return OFFLINE_INDEX_DOCUMENT_TYPES.TEST;
  }
  return OFFLINE_INDEX_DOCUMENT_TYPES.FILE;
}

function documentTypeForSymbol(symbolType) {
  if (symbolType === "function" || ["react-component", "hook", "api-handler", "api-endpoint", "middleware", "entry-point"].includes(symbolType)) {
    return OFFLINE_INDEX_DOCUMENT_TYPES.FUNCTION;
  }
  if (symbolType === "method") {
    return OFFLINE_INDEX_DOCUMENT_TYPES.METHOD;
  }
  if (symbolType === "class") {
    return OFFLINE_INDEX_DOCUMENT_TYPES.CLASS;
  }
  if (symbolType === "interface") {
    return OFFLINE_INDEX_DOCUMENT_TYPES.INTERFACE;
  }
  if (symbolType === "configuration") {
    return OFFLINE_INDEX_DOCUMENT_TYPES.CONFIGURATION;
  }
  return OFFLINE_INDEX_DOCUMENT_TYPES.SYMBOL;
}

function documentTypeForRelationship(relationshipType) {
  if (relationshipType === "import" || relationshipType === "module-dependency") {
    return OFFLINE_INDEX_DOCUMENT_TYPES.IMPORT;
  }
  if (relationshipType === "export") {
    return OFFLINE_INDEX_DOCUMENT_TYPES.EXPORT;
  }
  return OFFLINE_INDEX_DOCUMENT_TYPES.REFERENCE;
}

function symbolDocumentTypes() {
  return new Set([
    OFFLINE_INDEX_DOCUMENT_TYPES.SYMBOL,
    OFFLINE_INDEX_DOCUMENT_TYPES.FUNCTION,
    OFFLINE_INDEX_DOCUMENT_TYPES.METHOD,
    OFFLINE_INDEX_DOCUMENT_TYPES.CLASS,
    OFFLINE_INDEX_DOCUMENT_TYPES.INTERFACE,
  ]);
}

function fileTags(relativePath, type) {
  return uniqueSorted([
    "file",
    type,
    languageForPath(relativePath).toLowerCase(),
    path.posix.dirname(relativePath),
  ].filter(Boolean));
}

function relationshipTitle(relationship) {
  const source = relationship.sourceSymbol && relationship.sourceSymbol !== UNKNOWN ? relationship.sourceSymbol.name : relationship.sourcePath;
  const target = relationship.targetSymbol && relationship.targetSymbol !== UNKNOWN ? relationship.targetSymbol.name : relationship.targetPath;
  return `${source} -> ${target}`;
}

function relationshipSymbols(relationship) {
  return uniqueSorted([
    relationship.sourceSymbol && relationship.sourceSymbol !== UNKNOWN ? relationship.sourceSymbol.name : null,
    relationship.targetSymbol && relationship.targetSymbol !== UNKNOWN ? relationship.targetSymbol.name : null,
  ].filter(Boolean));
}

function evidencePath(evidence) {
  const entry = asArray(evidence).find((candidate) => candidate && typeof candidate.source === "string");
  return entry ? normalizePath(entry.source) : null;
}

function normalizeDocumentType(type) {
  const normalized = requiredString(type, "Offline knowledge index document type is required.");
  if (!Object.values(OFFLINE_INDEX_DOCUMENT_TYPES).includes(normalized)) {
    throw new Error("Offline knowledge index document type is invalid.");
  }
  return normalized;
}

function validateSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    throw new Error("Offline knowledge index snapshot must be an object.");
  }
  if (snapshot.schemaVersion !== OFFLINE_INDEX_SCHEMA_VERSION) {
    throw new Error("Offline knowledge index snapshot schema version is unsupported.");
  }
  if (!Array.isArray(snapshot.documents)) {
    throw new Error("Offline knowledge index snapshot requires documents.");
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

function emptyStats() {
  return {
    documentCount: 0,
    fileCount: 0,
    symbolCount: 0,
    totalIndexedBytes: 0,
    languages: {},
    documentTypes: {},
    lastFullBuild: null,
    lastIncrementalUpdate: null,
    skippedUnchangedFiles: 0,
    ignoredFiles: 0,
  };
}

function normalizeChanges(changes) {
  return (Array.isArray(changes) ? changes : [changes]).map((change) => {
    if (!isPlainObject(change)) {
      throw new Error("Offline knowledge index change must be an object.");
    }
    if (!Object.values(CHANGE_TYPES).includes(change.type)) {
      throw new Error("Offline knowledge index change type is invalid.");
    }
    if (change.type === CHANGE_TYPES.RENAMED) {
      return {
        type: change.type,
        oldPath: normalizePath(requiredString(change.oldPath, "Offline knowledge index rename oldPath is required.")),
        newPath: normalizePath(requiredString(change.newPath, "Offline knowledge index rename newPath is required.")),
      };
    }
    return {
      type: change.type,
      path: normalizePath(requiredString(change.path, "Offline knowledge index change path is required.")),
    };
  });
}

function normalizeSemanticAdapters(adapters) {
  return (Array.isArray(adapters) ? adapters : [adapters]).filter(Boolean);
}

function normalizeIgnorePatterns(patterns) {
  return (Array.isArray(patterns) ? patterns : [patterns]).filter(Boolean).map((pattern) =>
    pattern instanceof RegExp ? pattern : new RegExp(String(pattern)));
}

function tokenize(value) {
  return String(value || "")
    .toLowerCase()
    .split(/[^a-z0-9_$.-]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function tokenFrequency(tokens) {
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

function recencyScore(timestamp) {
  const ageMs = Math.max(0, Date.now() - Date.parse(timestamp));
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return Math.max(0, 1 - ageMs / thirtyDays);
}

function compareSearchResults(left, right) {
  return right.score - left.score || compareDocuments(left.document, right.document);
}

function compareDocuments(left, right) {
  return left.type.localeCompare(right.type) ||
    String(left.path || "").localeCompare(String(right.path || "")) ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id);
}

function setMatches(filters, value) {
  if (filters.size === 0) {
    return true;
  }
  const normalized = String(value || "").toLowerCase();
  return Array.from(filters).some((filter) => normalized === filter.toLowerCase() || normalized.includes(filter.toLowerCase()));
}

function tagsMatch(tags, filters) {
  if (filters.size === 0) {
    return true;
  }
  const normalized = new Set(tags);
  return Array.from(filters).every((filter) => normalized.has(filter.toLowerCase()));
}

function referencesMatch(references, filters) {
  if (filters.size === 0) {
    return true;
  }
  return references.some((reference) => filters.has(reference));
}

function normalizeStringSet(value) {
  return new Set(asArray(value).map((entry) => String(entry).trim()).filter(Boolean));
}

function normalizePath(value) {
  return requiredString(String(value), "Offline knowledge index path is required.").replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeNullablePath(value) {
  if (value === undefined || value === null) {
    return null;
  }
  return normalizePath(value);
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null) {
    return new Date().toISOString();
  }
  const timestamp = typeof value === "number" ? new Date(value).toISOString() : String(value);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error("Offline knowledge index timestamp must be valid.");
  }
  return timestamp;
}

function normalizePositiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function languageForPath(relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  if ([".js", ".jsx", ".mjs"].includes(extension)) {
    return "JavaScript";
  }
  if ([".ts", ".tsx"].includes(extension)) {
    return "TypeScript";
  }
  if (extension === ".py") {
    return "Python";
  }
  if (extension === ".json") {
    return "JSON";
  }
  if ([".yml", ".yaml"].includes(extension)) {
    return "YAML";
  }
  if (extension === ".md") {
    return "Markdown";
  }
  return UNKNOWN;
}

function isConfigurationPath(relativePath) {
  return /(^|\/)(package\.json|tsconfig\.json|jsconfig\.json|.*config\.[cm]?[jt]s|\.eslintrc.*|\.prettierrc.*|requirements\.txt|pyproject\.toml|pytest\.ini|Dockerfile)$/i.test(relativePath);
}

function isTestPath(relativePath) {
  return /(^|\/)(test|tests|__tests__)\/|(\.|-)(test|spec)\.[A-Za-z0-9]+$/i.test(relativePath);
}

function isBinaryFile(filePath) {
  const buffer = Buffer.alloc(512);
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    for (let index = 0; index < bytesRead; index += 1) {
      if (buffer[index] === 0) {
        return true;
      }
    }
    return false;
  } catch (error) {
    return true;
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
  }
}

function readTextFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function defaultPersistencePath(repositoryPath) {
  if (!repositoryPath) {
    throw new Error("Offline knowledge index persistence requires a repository path or file path.");
  }
  return path.join(repositoryPath, ".levi", "offline-knowledge-index.json");
}

function safeFiles(files) {
  return Array.isArray(files) ? files.filter((file) => file && typeof file.path === "string") : [];
}

function projectIdFor(root) {
  return `project:${stableHash(path.resolve(root))}`;
}

function stableReadable(value) {
  if (typeof value === "string") {
    return value;
  }
  return stableSerialize(value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function stableHash(value) {
  return sha256(stableSerialize(value)).slice(0, 16);
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

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function requiredString(value, message) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }
  return value.trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  CHANGE_TYPES,
  OFFLINE_INDEX_DOCUMENT_TYPES,
  OFFLINE_INDEX_EVENTS,
  OFFLINE_INDEX_EVENT_TYPES,
  OFFLINE_INDEX_SCHEMA_VERSION,
  OfflineKnowledgeIndex,
};
