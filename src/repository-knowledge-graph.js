const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { scanRepository } = require("./repository-scanner");
const { buildStructuralIndex, UNKNOWN } = require("./structural-index");
const { summarizeProject } = require("./project-summary");

const GRAPH_SCHEMA_VERSION = 1;

const GRAPH_NODE_TYPES = Object.freeze({
  REPOSITORY: "repository",
  DIRECTORY: "directory",
  FILE: "file",
  MODULE: "module",
  CLASS: "class",
  FUNCTION: "function",
  METHOD: "method",
  INTERFACE: "interface",
  TYPE: "type",
  VARIABLE: "variable",
  TEST: "test",
  CONFIGURATION: "configuration",
  DEPENDENCY: "dependency",
  DECISION: "decision",
});

const GRAPH_EDGE_TYPES = Object.freeze({
  CONTAINS: "contains",
  IMPORTS: "imports",
  EXPORTS: "exports",
  CALLS: "calls",
  REFERENCES: "references",
  EXTENDS: "extends",
  IMPLEMENTS: "implements",
  DEPENDS_ON: "depends_on",
  TESTS: "tests",
  CONFIGURES: "configures",
  DEFINES: "defines",
  MODIFIES: "modifies",
  RELATED_TO: "related_to",
  GOVERNED_BY_DECISION: "governed_by_decision",
});

const KNOWLEDGE_GRAPH_EVENTS = Object.freeze({
  LIFECYCLE: "lifecycle",
});

const KNOWLEDGE_GRAPH_EVENT_TYPES = Object.freeze({
  BUILD_STARTED: "knowledge_graph_build_started",
  BUILD_COMPLETED: "knowledge_graph_build_completed",
  UPDATE_STARTED: "knowledge_graph_update_started",
  UPDATE_COMPLETED: "knowledge_graph_update_completed",
  NODE_ADDED: "knowledge_graph_node_added",
  NODE_REMOVED: "knowledge_graph_node_removed",
  EDGE_ADDED: "knowledge_graph_edge_added",
  EDGE_REMOVED: "knowledge_graph_edge_removed",
  PERSISTED: "knowledge_graph_persisted",
  RESTORED: "knowledge_graph_restored",
  REBUILD_REQUIRED: "knowledge_graph_rebuild_required",
});

const CHANGE_TYPES = Object.freeze({
  CREATED: "created",
  MODIFIED: "modified",
  DELETED: "deleted",
  RENAMED: "renamed",
});

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx", ".py"]);
const CONFIG_FILE_PATTERNS = [
  /^package\.json$/,
  /^tsconfig\.json$/,
  /^jsconfig\.json$/,
  /^next\.config\.[cm]?js$/,
  /^vite\.config\.[cm]?[jt]s$/,
  /^webpack\.config\.[cm]?js$/,
  /^eslint\.config\.[cm]?js$/,
  /^\.eslintrc(\.[a-z0-9]+)?$/,
  /^\.prettierrc(\.[a-z0-9]+)?$/,
  /^pyproject\.toml$/,
  /^requirements\.txt$/,
  /^pytest\.ini$/,
  /^setup\.py$/,
  /^tox\.ini$/,
  /^docker-compose\.ya?ml$/,
  /^Dockerfile$/,
];

class RepositoryKnowledgeGraph extends EventEmitter {
  constructor(options = {}) {
    super();
    this.nodes = new Map();
    this.edges = new Map();
    this.repositoryPath = options.repositoryPath ? path.resolve(options.repositoryPath) : null;
    this.persistencePath = options.persistencePath || null;
    this.scanRepository = options.scanRepository || scanRepository;
    this.summarizeProject = options.summarizeProject || summarizeProject;
    this.languageAnalyzers = normalizeLanguageAnalyzers(options.languageAnalyzers || []);
    this.memoryStore = options.memoryStore || null;
    this.projectId = options.projectId || null;
    this.metadata = clonePlainObject(options.metadata || {});
    this.createdAt = normalizeTimestamp(options.createdAt);
    this.updatedAt = normalizeTimestamp(options.updatedAt || this.createdAt);
  }

  build(repositoryPath, options = {}) {
    const root = path.resolve(repositoryPath || this.repositoryPath || "");
    if (!root) {
      throw new Error("Repository knowledge graph build requires a repository path.");
    }

    this.emitLifecycle(KNOWLEDGE_GRAPH_EVENT_TYPES.BUILD_STARTED, { repositoryPath: root });
    this.clear();
    this.repositoryPath = root;
    this.projectId = options.projectId || this.projectId;

    const scanResult = options.scanResult || this.scanRepository(root);
    const projectSummary = options.projectSummary || this.summarizeProject(scanResult);
    const timestamp = normalizeTimestamp(options.timestamp);

    this.createdAt = timestamp;
    this.updatedAt = timestamp;
    this.metadata = {
      ...this.metadata,
      repositoryPath: root,
      structuralIndexStatus: scanResult.structuralIndex ? scanResult.structuralIndex.status : UNKNOWN,
      projectKnowledge: normalizeProjectKnowledgeMetadata(options),
    };

    this.addRepositoryNode(root, timestamp);
    this.addScannedFiles(scanResult, timestamp);
    this.addStructuralIndex(scanResult.structuralIndex, timestamp);
    this.addDependencies(projectSummary.dependencies, timestamp);
    this.addProjectKnowledge(options, timestamp);
    this.addDurableDecisions(options, timestamp);

    const snapshot = this.snapshot();
    this.emitLifecycle(KNOWLEDGE_GRAPH_EVENT_TYPES.BUILD_COMPLETED, {
      repositoryPath: root,
      nodeCount: snapshot.nodes.length,
      edgeCount: snapshot.edges.length,
    });
    return snapshot;
  }

  update(changes, options = {}) {
    const normalizedChanges = normalizeChanges(changes);
    const timestamp = normalizeTimestamp(options.timestamp);
    this.emitLifecycle(KNOWLEDGE_GRAPH_EVENT_TYPES.UPDATE_STARTED, {
      changeCount: normalizedChanges.length,
    });

    for (const change of normalizedChanges) {
      if (change.type === CHANGE_TYPES.DELETED) {
        this.removeFileGraph(change.path);
        continue;
      }

      if (change.type === CHANGE_TYPES.RENAMED) {
        this.removeFileGraph(change.oldPath);
        this.addIncrementalFile(change.newPath, options, timestamp);
        this.addEdge({
          type: GRAPH_EDGE_TYPES.MODIFIES,
          sourceId: this.repositoryNodeId(),
          targetId: fileNodeId(change.newPath),
          evidence: {
            source: change.newPath,
            signal: `renamed from ${change.oldPath}`,
          },
          confidence: "VERIFIED",
        });
        continue;
      }

      if (change.type === CHANGE_TYPES.MODIFIED) {
        this.removeFileGraph(change.path);
        this.addIncrementalFile(change.path, options, timestamp);
        this.addEdge({
          type: GRAPH_EDGE_TYPES.MODIFIES,
          sourceId: this.repositoryNodeId(),
          targetId: fileNodeId(change.path),
          evidence: {
            source: change.path,
            signal: "incremental file modification",
          },
          confidence: "VERIFIED",
        });
        continue;
      }

      if (change.type === CHANGE_TYPES.CREATED) {
        this.addIncrementalFile(change.path, options, timestamp);
      }
    }

    this.updatedAt = timestamp;
    const snapshot = this.snapshot();
    this.emitLifecycle(KNOWLEDGE_GRAPH_EVENT_TYPES.UPDATE_COMPLETED, {
      changeCount: normalizedChanges.length,
      nodeCount: snapshot.nodes.length,
      edgeCount: snapshot.edges.length,
    });
    return snapshot;
  }

  addNode(node) {
    const normalized = normalizeNode(node);
    const existing = this.nodes.get(normalized.id);
    const next = existing
      ? {
          ...existing,
          ...normalized,
          metadata: {
            ...clonePlainObject(existing.metadata || {}),
            ...clonePlainObject(normalized.metadata || {}),
          },
          createdAt: existing.createdAt,
          updatedAt: normalizeTimestamp(normalized.updatedAt),
        }
      : normalized;

    this.nodes.set(next.id, next);
    if (!existing) {
      this.emitLifecycle(KNOWLEDGE_GRAPH_EVENT_TYPES.NODE_ADDED, { node: clonePlainObject(next) });
    }
    return clonePlainObject(next);
  }

  addEdge(edge) {
    const normalized = normalizeEdge(edge);
    const existing = this.edges.get(normalized.id);
    const next = existing
      ? {
          ...existing,
          ...normalized,
          metadata: {
            ...clonePlainObject(existing.metadata || {}),
            ...clonePlainObject(normalized.metadata || {}),
          },
          createdAt: existing.createdAt,
          updatedAt: normalizeTimestamp(normalized.updatedAt),
        }
      : normalized;

    this.edges.set(next.id, next);
    if (!existing) {
      this.emitLifecycle(KNOWLEDGE_GRAPH_EVENT_TYPES.EDGE_ADDED, { edge: clonePlainObject(next) });
    }
    return clonePlainObject(next);
  }

  removeNode(id) {
    const nodeId = requiredString(id, "Repository knowledge graph node id is required.");
    const existing = this.nodes.get(nodeId);
    if (!existing) {
      return false;
    }

    const incidentEdges = Array.from(this.edges.values())
      .filter((edge) => edge.sourceId === nodeId || edge.targetId === nodeId)
      .map((edge) => edge.id);

    for (const edgeId of incidentEdges) {
      this.removeEdge(edgeId);
    }

    this.nodes.delete(nodeId);
    this.emitLifecycle(KNOWLEDGE_GRAPH_EVENT_TYPES.NODE_REMOVED, { node: clonePlainObject(existing) });
    return true;
  }

  removeEdge(id) {
    const edgeId = requiredString(id, "Repository knowledge graph edge id is required.");
    const existing = this.edges.get(edgeId);
    if (!existing) {
      return false;
    }

    this.edges.delete(edgeId);
    this.emitLifecycle(KNOWLEDGE_GRAPH_EVENT_TYPES.EDGE_REMOVED, { edge: clonePlainObject(existing) });
    return true;
  }

  getNode(id) {
    const node = this.nodes.get(id);
    return node ? clonePlainObject(node) : null;
  }

  getNeighbors(id, options = {}) {
    const direction = options.direction || "both";
    const edgeTypes = normalizeStringSet(options.edgeTypes || options.edgeType || options.type);
    const neighbors = [];

    for (const edge of this.edges.values()) {
      if (edgeTypes.size > 0 && !edgeTypes.has(edge.type)) {
        continue;
      }

      if ((direction === "out" || direction === "both") && edge.sourceId === id && this.nodes.has(edge.targetId)) {
        neighbors.push({ edge: clonePlainObject(edge), node: clonePlainObject(this.nodes.get(edge.targetId)) });
      }

      if ((direction === "in" || direction === "both") && edge.targetId === id && this.nodes.has(edge.sourceId)) {
        neighbors.push({ edge: clonePlainObject(edge), node: clonePlainObject(this.nodes.get(edge.sourceId)) });
      }
    }

    return neighbors.sort(compareNeighborEntries);
  }

  findNodes(query = {}) {
    const filters = normalizeNodeQuery(query);
    return Array.from(this.nodes.values())
      .filter((node) => matchesNodeQuery(node, filters))
      .sort(compareNodes)
      .map(clonePlainObject);
  }

  findEdges(query = {}) {
    const filters = normalizeEdgeQuery(query);
    return Array.from(this.edges.values())
      .filter((edge) => matchesEdgeQuery(edge, filters))
      .sort(compareEdges)
      .map(clonePlainObject);
  }

  getDependencies(id, options = {}) {
    return traverseTyped(this, id, [GRAPH_EDGE_TYPES.DEPENDS_ON, GRAPH_EDGE_TYPES.IMPORTS], "out", options);
  }

  getDependents(id, options = {}) {
    return traverseTyped(this, id, [GRAPH_EDGE_TYPES.DEPENDS_ON, GRAPH_EDGE_TYPES.IMPORTS], "in", options);
  }

  getReferences(id, options = {}) {
    return traverseTyped(this, id, [GRAPH_EDGE_TYPES.REFERENCES, GRAPH_EDGE_TYPES.DEFINES], "in", options);
  }

  getCallers(id, options = {}) {
    return traverseTyped(this, id, [GRAPH_EDGE_TYPES.CALLS], "in", options);
  }

  getCallees(id, options = {}) {
    return traverseTyped(this, id, [GRAPH_EDGE_TYPES.CALLS], "out", options);
  }

  getImpactSet(id, options = {}) {
    const maxDepth = normalizeDepth(options.maxDepth, 3);
    const visited = new Set([id]);
    const queue = [{ id, depth: 0 }];
    const impacted = [];
    const edgeTypes = normalizeStringSet(options.edgeTypes || [
      GRAPH_EDGE_TYPES.IMPORTS,
      GRAPH_EDGE_TYPES.DEPENDS_ON,
      GRAPH_EDGE_TYPES.CALLS,
      GRAPH_EDGE_TYPES.REFERENCES,
      GRAPH_EDGE_TYPES.DEFINES,
      GRAPH_EDGE_TYPES.TESTS,
      GRAPH_EDGE_TYPES.CONFIGURES,
    ]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.depth >= maxDepth) {
        continue;
      }

      for (const neighbor of this.getNeighbors(current.id, { direction: "in", edgeTypes: Array.from(edgeTypes) })) {
        if (visited.has(neighbor.node.id)) {
          continue;
        }

        visited.add(neighbor.node.id);
        impacted.push(neighbor.node);
        queue.push({ id: neighbor.node.id, depth: current.depth + 1 });
      }
    }

    return impacted.sort(compareNodes);
  }

  snapshot() {
    return {
      schemaVersion: GRAPH_SCHEMA_VERSION,
      repositoryPath: this.repositoryPath,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      metadata: clonePlainObject(this.metadata),
      nodes: Array.from(this.nodes.values()).sort(compareNodes).map(clonePlainObject),
      edges: Array.from(this.edges.values()).sort(compareEdges).map(clonePlainObject),
    };
  }

  restore(snapshot) {
    validateSnapshot(snapshot);
    this.clear();
    this.repositoryPath = snapshot.repositoryPath || null;
    this.createdAt = normalizeTimestamp(snapshot.createdAt);
    this.updatedAt = normalizeTimestamp(snapshot.updatedAt || snapshot.createdAt);
    this.metadata = clonePlainObject(snapshot.metadata || {});

    for (const node of snapshot.nodes) {
      this.nodes.set(node.id, normalizeNode(node));
    }

    for (const edge of snapshot.edges) {
      this.edges.set(edge.id, normalizeEdge(edge));
    }

    this.emitLifecycle(KNOWLEDGE_GRAPH_EVENT_TYPES.RESTORED, {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.size,
    });
    return this.snapshot();
  }

  save(filePath = this.persistencePath || defaultPersistencePath(this.repositoryPath)) {
    const targetPath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${JSON.stringify(this.snapshot(), null, 2)}\n`, "utf8");
    this.persistencePath = targetPath;
    this.emitLifecycle(KNOWLEDGE_GRAPH_EVENT_TYPES.PERSISTED, { path: targetPath });
    return {
      status: "PERSISTED",
      path: targetPath,
      schemaVersion: GRAPH_SCHEMA_VERSION,
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
        schemaVersion: GRAPH_SCHEMA_VERSION,
      };
    } catch (error) {
      this.emitLifecycle(KNOWLEDGE_GRAPH_EVENT_TYPES.REBUILD_REQUIRED, {
        path: targetPath,
        reason: error.message,
      });

      if (options.rebuildOnCorruption === true && (options.repositoryPath || this.repositoryPath)) {
        this.build(options.repositoryPath || this.repositoryPath, options);
        return {
          status: "REBUILT",
          path: targetPath,
          schemaVersion: GRAPH_SCHEMA_VERSION,
        };
      }

      return {
        status: "REBUILD_REQUIRED",
        path: targetPath,
        error: error.message,
      };
    }
  }

  clear() {
    this.nodes.clear();
    this.edges.clear();
  }

  addRepositoryNode(root, timestamp) {
    this.addNode({
      id: repositoryNodeId(root),
      type: GRAPH_NODE_TYPES.REPOSITORY,
      name: path.basename(root) || root,
      path: ".",
      language: "Repository",
      range: null,
      metadata: {
        repositoryPath: root,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  addScannedFiles(scanResult, timestamp) {
    const files = Array.isArray(scanResult.files) ? scanResult.files : [];
    for (const file of files) {
      const relativePath = normalizeRelativePath(file.path);
      this.addDirectoryHierarchy(relativePath, timestamp);
      this.addFileNodes(relativePath, timestamp);
    }
  }

  addDirectoryHierarchy(relativePath, timestamp) {
    const parts = relativePath.split("/");
    let parentId = this.repositoryNodeId();
    let directoryPath = "";

    for (let index = 0; index < parts.length - 1; index += 1) {
      directoryPath = directoryPath ? `${directoryPath}/${parts[index]}` : parts[index];
      const id = directoryNodeId(directoryPath);
      this.addNode({
        id,
        type: GRAPH_NODE_TYPES.DIRECTORY,
        name: parts[index],
        path: directoryPath,
        language: "Directory",
        range: null,
        metadata: {},
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      this.addEdge({
        type: GRAPH_EDGE_TYPES.CONTAINS,
        sourceId: parentId,
        targetId: id,
        evidence: { source: directoryPath, signal: "repository directory hierarchy" },
        confidence: "VERIFIED",
      });
      parentId = id;
    }

    const fileId = fileNodeId(relativePath);
    this.addEdge({
      type: GRAPH_EDGE_TYPES.CONTAINS,
      sourceId: parentId,
      targetId: fileId,
      evidence: { source: relativePath, signal: "repository file hierarchy" },
      confidence: "VERIFIED",
    });
  }

  addFileNodes(relativePath, timestamp) {
    this.addNode({
      id: fileNodeId(relativePath),
      type: GRAPH_NODE_TYPES.FILE,
      name: path.posix.basename(relativePath),
      path: relativePath,
      language: languageForPath(relativePath),
      range: null,
      metadata: {
        filePath: relativePath,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    if (isConfigurationPath(relativePath)) {
      const configurationId = configurationNodeId(relativePath);
      this.addNode({
        id: configurationId,
        type: GRAPH_NODE_TYPES.CONFIGURATION,
        name: path.posix.basename(relativePath),
        path: relativePath,
        language: "Configuration",
        range: null,
        metadata: {
          filePath: relativePath,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      this.addEdge({
        type: GRAPH_EDGE_TYPES.DEFINES,
        sourceId: fileNodeId(relativePath),
        targetId: configurationId,
        evidence: { source: relativePath, signal: "configuration file" },
        confidence: "VERIFIED",
      });
      this.addEdge({
        type: GRAPH_EDGE_TYPES.CONFIGURES,
        sourceId: configurationId,
        targetId: this.repositoryNodeId(),
        evidence: { source: relativePath, signal: "configuration file" },
        confidence: "VERIFIED",
      });
    }

    if (isTestPath(relativePath)) {
      const testId = testNodeId(relativePath);
      this.addNode({
        id: testId,
        type: GRAPH_NODE_TYPES.TEST,
        name: path.posix.basename(relativePath),
        path: relativePath,
        language: languageForPath(relativePath),
        range: null,
        metadata: {
          filePath: relativePath,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      this.addEdge({
        type: GRAPH_EDGE_TYPES.DEFINES,
        sourceId: fileNodeId(relativePath),
        targetId: testId,
        evidence: { source: relativePath, signal: "test file" },
        confidence: "VERIFIED",
      });
      this.addTestEdges(relativePath, testId);
    }
  }

  addTestEdges(relativePath, testId) {
    const candidatePaths = sourceCandidatesForTest(relativePath);
    const target = candidatePaths.map(fileNodeId).find((id) => this.nodes.has(id)) || this.repositoryNodeId();
    this.addEdge({
      type: GRAPH_EDGE_TYPES.TESTS,
      sourceId: testId,
      targetId: target,
      evidence: { source: relativePath, signal: "test naming convention" },
      confidence: target === this.repositoryNodeId() ? "INFERRED" : "VERIFIED",
    });
  }

  addStructuralIndex(structuralIndex, timestamp) {
    if (!structuralIndex || !Array.isArray(structuralIndex.symbols)) {
      return;
    }

    for (const symbol of structuralIndex.symbols) {
      const node = graphNodeFromSymbol(symbol, timestamp);
      if (!node) {
        continue;
      }
      this.addNode(node);
      this.addEdge({
        type: GRAPH_EDGE_TYPES.DEFINES,
        sourceId: fileNodeId(symbol.path),
        targetId: node.id,
        evidence: {
          source: symbol.path,
          lineNumber: symbol.lineNumber,
          signal: symbol.signal || "structural symbol",
        },
        confidence: "VERIFIED",
      });
    }

    if (Array.isArray(structuralIndex.relationships)) {
      for (const relationship of structuralIndex.relationships) {
        this.addStructuralRelationship(relationship);
      }
    }
  }

  addStructuralRelationship(relationship) {
    const sourceId = nodeIdFromRelationshipSymbol(relationship.sourceSymbol) || fileNodeId(relationship.sourcePath);
    let targetId = nodeIdFromRelationshipSymbol(relationship.targetSymbol);

    if (!targetId && relationship.targetPath && relationship.targetPath !== UNKNOWN && this.nodes.has(fileNodeId(relationship.targetPath))) {
      targetId = fileNodeId(relationship.targetPath);
    }

    if (!targetId && isExternalDependencyRelationship(relationship)) {
      targetId = dependencyNodeId(relationship.targetPath || targetNameFromRelationship(relationship));
      this.addDependencyNode(targetNameFromRelationship(relationship), null, {
        source: relationship.sourcePath,
        signal: relationship.relationshipType,
      });
    }

    if (!targetId || !this.nodes.has(sourceId)) {
      return;
    }

    const graphEdgeType = graphEdgeTypeFromStructuralRelationship(relationship.relationshipType);
    this.addEdge({
      type: graphEdgeType,
      sourceId,
      targetId,
      evidence: relationship.evidence || {
        source: relationship.sourcePath,
        signal: relationship.relationshipType,
      },
      confidence: relationship.confidenceState || "INFERRED",
      metadata: {
        structuralRelationshipId: relationship.relationshipId,
        sourcePath: relationship.sourcePath,
        targetPath: relationship.targetPath,
      },
    });

    if (graphEdgeType !== GRAPH_EDGE_TYPES.REFERENCES) {
      this.addEdge({
        type: GRAPH_EDGE_TYPES.REFERENCES,
        sourceId,
        targetId,
        evidence: {
          ...(relationship.evidence || { source: relationship.sourcePath }),
          signal: `references via ${relationship.relationshipType}`,
        },
        confidence: relationship.confidenceState || "INFERRED",
        metadata: {
          derivedFrom: relationship.relationshipType,
          structuralRelationshipId: relationship.relationshipId,
        },
      });
    }
  }

  addDependencies(dependencySummaries, timestamp) {
    if (!Array.isArray(dependencySummaries)) {
      return;
    }

    for (const manifest of dependencySummaries) {
      if (!manifest || !Array.isArray(manifest.dependencies)) {
        continue;
      }

      for (const dependency of manifest.dependencies) {
        this.addDependencyNode(dependency.name, timestamp, dependency.evidence, dependency);
        const dependencyId = dependencyNodeId(dependency.name);
        this.addEdge({
          type: GRAPH_EDGE_TYPES.DEPENDS_ON,
          sourceId: this.repositoryNodeId(),
          targetId: dependencyId,
          evidence: dependency.evidence || { source: manifest.source, signal: dependency.name },
          confidence: "VERIFIED",
          metadata: {
            source: manifest.source,
            group: dependency.group || UNKNOWN,
            version: dependency.version || UNKNOWN,
          },
        });

        if (manifest.source && this.nodes.has(fileNodeId(manifest.source))) {
          this.addEdge({
            type: GRAPH_EDGE_TYPES.DEFINES,
            sourceId: fileNodeId(manifest.source),
            targetId: dependencyId,
            evidence: dependency.evidence || { source: manifest.source, signal: dependency.name },
            confidence: "VERIFIED",
          });
        }
      }
    }
  }

  addDependencyNode(name, timestamp, evidence = {}, dependency = {}) {
    const dependencyName = requiredString(name, "Repository knowledge graph dependency name is required.");
    this.addNode({
      id: dependencyNodeId(dependencyName),
      type: GRAPH_NODE_TYPES.DEPENDENCY,
      name: dependencyName,
      path: null,
      language: null,
      range: null,
      metadata: {
        version: dependency.version || UNKNOWN,
        group: dependency.group || UNKNOWN,
        evidence: clonePlainObject(evidence || {}),
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  addProjectKnowledge(options, timestamp) {
    const facts = normalizeProjectKnowledgeFacts(options);
    for (const fact of facts) {
      const factId = `knowledge:${stableHash(fact)}`;
      this.addNode({
        id: factId,
        type: GRAPH_NODE_TYPES.DECISION,
        name: fact.category || fact.id || "project knowledge",
        path: null,
        language: null,
        range: null,
        metadata: {
          kind: "project-knowledge",
          fact: clonePlainObject(fact),
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      this.addEdge({
        type: GRAPH_EDGE_TYPES.RELATED_TO,
        sourceId: this.repositoryNodeId(),
        targetId: factId,
        evidence: fact.evidence || { source: "project-knowledge", signal: fact.category || "project fact" },
        confidence: fact.confidenceState || fact.confidence || "VERIFIED",
      });
    }
  }

  addDurableDecisions(options, timestamp) {
    const decisions = normalizeDecisionRecords({
      ...options,
      memoryStore: options.memoryStore || this.memoryStore,
    }, options.projectId || this.projectId || this.repositoryPath);
    for (const decision of decisions) {
      const nodeId = decisionNodeId(decision);
      this.addNode({
        id: nodeId,
        type: GRAPH_NODE_TYPES.DECISION,
        name: decision.value && decision.value.category ? decision.value.category : decision.id,
        path: null,
        language: null,
        range: null,
        metadata: {
          kind: "approved-decision",
          record: clonePlainObject(decision),
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      this.addEdge({
        type: GRAPH_EDGE_TYPES.GOVERNED_BY_DECISION,
        sourceId: this.repositoryNodeId(),
        targetId: nodeId,
        evidence: decision.source || { source: "memory", signal: "approved decision" },
        confidence: decision.confidenceState || "APPROVED",
      });

      for (const sourcePath of decisionEvidencePaths(decision)) {
        if (!this.nodes.has(fileNodeId(sourcePath))) {
          continue;
        }
        this.addEdge({
          type: GRAPH_EDGE_TYPES.GOVERNED_BY_DECISION,
          sourceId: fileNodeId(sourcePath),
          targetId: nodeId,
          evidence: { source: sourcePath, signal: "decision evidence" },
          confidence: "APPROVED",
        });
      }
    }
  }

  addIncrementalFile(relativePath, options, timestamp) {
    const normalizedPath = normalizeRelativePath(relativePath);
    this.addDirectoryHierarchy(normalizedPath, timestamp);
    this.addFileNodes(normalizedPath, timestamp);

    for (const analyzer of analyzersForPath(this.languageAnalyzers, normalizedPath)) {
      const analysis = analyzer.analyzeFile({
        repositoryRoot: this.repositoryPath,
        filePath: normalizedPath,
        content: readOptionalFile(this.repositoryPath, normalizedPath),
        language: languageForPath(normalizedPath),
        graph: this,
        options,
      });
      this.addAnalyzerResult(analysis, timestamp);
    }

    if (SOURCE_EXTENSIONS.has(path.extname(normalizedPath).toLowerCase())) {
      const structuralIndex = buildStructuralIndex({
        root: this.repositoryPath,
        files: [{ path: normalizedPath }],
        detected: { entryPoints: [] },
      });
      this.addStructuralIndex(structuralIndex, timestamp);
    }
  }

  addAnalyzerResult(analysis, timestamp) {
    if (!analysis || typeof analysis !== "object") {
      return;
    }

    for (const node of Array.isArray(analysis.nodes) ? analysis.nodes : []) {
      this.addNode({ ...node, createdAt: node.createdAt || timestamp, updatedAt: node.updatedAt || timestamp });
    }

    for (const edge of Array.isArray(analysis.edges) ? analysis.edges : []) {
      this.addEdge({ ...edge, createdAt: edge.createdAt || timestamp, updatedAt: edge.updatedAt || timestamp });
    }
  }

  removeFileGraph(relativePath) {
    const normalizedPath = normalizeRelativePath(relativePath);
    const nodeIds = Array.from(this.nodes.values())
      .filter((node) => node.path === normalizedPath || node.metadata && node.metadata.filePath === normalizedPath)
      .map((node) => node.id);

    for (const nodeId of nodeIds) {
      this.removeNode(nodeId);
    }
  }

  repositoryNodeId() {
    return repositoryNodeId(this.repositoryPath);
  }

  emitLifecycle(type, payload = {}) {
    this.emit(KNOWLEDGE_GRAPH_EVENTS.LIFECYCLE, {
      type,
      timestamp: new Date().toISOString(),
      schemaVersion: GRAPH_SCHEMA_VERSION,
      ...payload,
    });
  }
}

function createStructuralLanguageAnalyzer() {
  return {
    id: "levi-structural-index",
    extensions: Array.from(SOURCE_EXTENSIONS),
    analyzeFile(input) {
      const structuralIndex = buildStructuralIndex({
        root: input.repositoryRoot,
        files: [{ path: input.filePath }],
        detected: { entryPoints: [] },
      });
      const nodes = [];
      const edges = [];
      const timestamp = new Date().toISOString();

      for (const symbol of structuralIndex.symbols || []) {
        const node = graphNodeFromSymbol(symbol, timestamp);
        if (node) {
          nodes.push(node);
          edges.push({
            type: GRAPH_EDGE_TYPES.DEFINES,
            sourceId: fileNodeId(symbol.path),
            targetId: node.id,
            evidence: { source: symbol.path, lineNumber: symbol.lineNumber, signal: symbol.signal },
            confidence: "VERIFIED",
          });
        }
      }

      return { nodes, edges, metadata: { structuralIndex } };
    },
  };
}

function graphNodeFromSymbol(symbol, timestamp) {
  if (!symbol || !symbol.path || symbol.path === UNKNOWN || !symbol.name || symbol.name === UNKNOWN) {
    return null;
  }

  const type = graphNodeTypeFromSymbol(symbol.type);
  if (!type) {
    return null;
  }

  return {
    id: symbolNodeId(symbol),
    type,
    name: symbol.name,
    path: normalizeRelativePath(symbol.path),
    language: symbol.language || languageForPath(symbol.path),
    range: {
      startLine: normalizeLineNumber(symbol.lineNumber),
      endLine: normalizeLineNumber(symbol.lineNumber),
    },
    metadata: {
      filePath: normalizeRelativePath(symbol.path),
      symbolId: symbol.symbolId,
      symbolType: symbol.type,
      parent: symbol.parent || UNKNOWN,
      exported: symbol.exported === true,
      signal: symbol.signal || UNKNOWN,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function graphNodeTypeFromSymbol(symbolType) {
  if (symbolType === "module") {
    return GRAPH_NODE_TYPES.MODULE;
  }
  if (symbolType === "class") {
    return GRAPH_NODE_TYPES.CLASS;
  }
  if (["function", "react-component", "hook", "api-handler", "api-endpoint", "middleware", "entry-point"].includes(symbolType)) {
    return GRAPH_NODE_TYPES.FUNCTION;
  }
  if (symbolType === "method") {
    return GRAPH_NODE_TYPES.METHOD;
  }
  if (symbolType === "interface") {
    return GRAPH_NODE_TYPES.INTERFACE;
  }
  if (["type", "enum"].includes(symbolType)) {
    return GRAPH_NODE_TYPES.TYPE;
  }
  if (["variable", "constant"].includes(symbolType)) {
    return GRAPH_NODE_TYPES.VARIABLE;
  }
  if (symbolType === "configuration") {
    return GRAPH_NODE_TYPES.CONFIGURATION;
  }
  return null;
}

function graphEdgeTypeFromStructuralRelationship(type) {
  if (type === "import") {
    return GRAPH_EDGE_TYPES.IMPORTS;
  }
  if (type === "module-dependency") {
    return GRAPH_EDGE_TYPES.DEPENDS_ON;
  }
  if (type === "export") {
    return GRAPH_EDGE_TYPES.EXPORTS;
  }
  if (type === "function-call") {
    return GRAPH_EDGE_TYPES.CALLS;
  }
  if (type === "class-inheritance") {
    return GRAPH_EDGE_TYPES.EXTENDS;
  }
  if (type === "interface-implementation") {
    return GRAPH_EDGE_TYPES.IMPLEMENTS;
  }
  if (type === "configuration-reference") {
    return GRAPH_EDGE_TYPES.CONFIGURES;
  }
  return GRAPH_EDGE_TYPES.REFERENCES;
}

function nodeIdFromRelationshipSymbol(symbol) {
  if (!symbol || symbol === UNKNOWN || !symbol.path || symbol.path === UNKNOWN) {
    return null;
  }
  return symbolNodeId(symbol);
}

function isExternalDependencyRelationship(relationship) {
  const target = relationship.targetPath || targetNameFromRelationship(relationship);
  return ["import", "module-dependency"].includes(relationship.relationshipType) &&
    typeof target === "string" &&
    target !== UNKNOWN &&
    !target.startsWith(".");
}

function targetNameFromRelationship(relationship) {
  if (relationship.targetSymbol && relationship.targetSymbol !== UNKNOWN && relationship.targetSymbol.name) {
    return relationship.targetSymbol.name;
  }
  return relationship.targetPath || UNKNOWN;
}

function normalizeNode(node) {
  if (!isPlainObject(node)) {
    throw new Error("Repository knowledge graph node must be an object.");
  }
  const id = node.id || deterministicNodeId(node);
  const type = requiredGraphType(node.type, GRAPH_NODE_TYPES, "node type");
  return {
    id: requiredString(id, "Repository knowledge graph node id is required."),
    type,
    name: requiredString(node.name, "Repository knowledge graph node name is required."),
    path: node.path === undefined ? null : normalizeNullablePath(node.path),
    language: node.language === undefined ? null : normalizeNullableString(node.language),
    range: node.range === undefined ? null : normalizeRange(node.range),
    metadata: clonePlainObject(node.metadata || {}),
    createdAt: normalizeTimestamp(node.createdAt),
    updatedAt: normalizeTimestamp(node.updatedAt || node.createdAt),
  };
}

function normalizeEdge(edge) {
  if (!isPlainObject(edge)) {
    throw new Error("Repository knowledge graph edge must be an object.");
  }
  const type = requiredGraphType(edge.type, GRAPH_EDGE_TYPES, "edge type");
  const normalized = {
    id: edge.id || deterministicEdgeId(edge),
    type,
    sourceId: requiredString(edge.sourceId, "Repository knowledge graph edge sourceId is required."),
    targetId: requiredString(edge.targetId, "Repository knowledge graph edge targetId is required."),
    evidence: clonePlainObject(edge.evidence || {}),
    confidence: normalizeNullableString(edge.confidence || "INFERRED"),
    metadata: clonePlainObject(edge.metadata || {}),
    createdAt: normalizeTimestamp(edge.createdAt),
    updatedAt: normalizeTimestamp(edge.updatedAt || edge.createdAt),
  };
  normalized.id = requiredString(normalized.id, "Repository knowledge graph edge id is required.");
  return normalized;
}

function deterministicNodeId(node) {
  return `${node.type}:${stableHash({
    type: node.type,
    name: node.name,
    path: node.path || null,
    language: node.language || null,
  })}`;
}

function deterministicEdgeId(edge) {
  return `edge:${stableHash({
    type: edge.type,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    evidence: normalizeEvidenceFingerprint(edge.evidence),
  })}`;
}

function normalizeEvidenceFingerprint(evidence) {
  if (!isPlainObject(evidence)) {
    return {};
  }
  return {
    source: evidence.source || null,
    lineNumber: evidence.lineNumber || null,
    signal: evidence.signal || null,
  };
}

function normalizeLanguageAnalyzers(analyzers) {
  const normalized = Array.isArray(analyzers) ? analyzers.slice() : [analyzers];
  return normalized.filter(Boolean).map((analyzer) => {
    if (!isPlainObject(analyzer) || typeof analyzer.analyzeFile !== "function") {
      throw new Error("Repository knowledge graph language analyzer requires analyzeFile.");
    }
    return {
      ...analyzer,
      extensions: new Set(Array.isArray(analyzer.extensions) ? analyzer.extensions.map((entry) => entry.toLowerCase()) : []),
      languages: new Set(Array.isArray(analyzer.languages) ? analyzer.languages.map((entry) => String(entry).toLowerCase()) : []),
    };
  });
}

function analyzersForPath(analyzers, relativePath) {
  const extension = path.extname(relativePath).toLowerCase();
  const language = languageForPath(relativePath).toLowerCase();
  return analyzers.filter((analyzer) =>
    analyzer.extensions.size === 0 && analyzer.languages.size === 0 ||
    analyzer.extensions.has(extension) ||
    analyzer.languages.has(language));
}

function normalizeChanges(changes) {
  const list = Array.isArray(changes) ? changes : [changes];
  return list.map((change) => {
    if (!isPlainObject(change)) {
      throw new Error("Repository knowledge graph update change must be an object.");
    }
    if (!Object.values(CHANGE_TYPES).includes(change.type)) {
      throw new Error("Repository knowledge graph update change type is invalid.");
    }
    if (change.type === CHANGE_TYPES.RENAMED) {
      return {
        type: change.type,
        oldPath: normalizeRelativePath(requiredString(change.oldPath, "Repository knowledge graph rename oldPath is required.")),
        newPath: normalizeRelativePath(requiredString(change.newPath, "Repository knowledge graph rename newPath is required.")),
      };
    }
    return {
      type: change.type,
      path: normalizeRelativePath(requiredString(change.path, "Repository knowledge graph update path is required.")),
    };
  });
}

function validateSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    throw new Error("Repository knowledge graph snapshot must be an object.");
  }
  if (snapshot.schemaVersion !== GRAPH_SCHEMA_VERSION) {
    throw new Error("Repository knowledge graph snapshot schema version is unsupported.");
  }
  if (!Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) {
    throw new Error("Repository knowledge graph snapshot requires nodes and edges.");
  }
}

function normalizeNodeQuery(query) {
  return {
    ids: normalizeStringSet(query.ids || query.id),
    types: normalizeStringSet(query.types || query.type),
    names: normalizeStringSet(query.names || query.name),
    paths: normalizeStringSet(query.paths || query.path),
    languages: normalizeStringSet(query.languages || query.language),
    keywords: normalizeStringSet(query.keywords || query.keyword),
  };
}

function normalizeEdgeQuery(query) {
  return {
    ids: normalizeStringSet(query.ids || query.id),
    types: normalizeStringSet(query.types || query.type),
    sourceIds: normalizeStringSet(query.sourceIds || query.sourceId),
    targetIds: normalizeStringSet(query.targetIds || query.targetId),
    keywords: normalizeStringSet(query.keywords || query.keyword),
  };
}

function matchesNodeQuery(node, query) {
  return setMatches(query.ids, node.id) &&
    setMatches(query.types, node.type) &&
    setMatches(query.names, node.name) &&
    setMatches(query.paths, node.path) &&
    setMatches(query.languages, node.language) &&
    keywordMatches(query.keywords, [node.id, node.type, node.name, node.path, node.language, JSON.stringify(node.metadata)]);
}

function matchesEdgeQuery(edge, query) {
  return setMatches(query.ids, edge.id) &&
    setMatches(query.types, edge.type) &&
    setMatches(query.sourceIds, edge.sourceId) &&
    setMatches(query.targetIds, edge.targetId) &&
    keywordMatches(query.keywords, [edge.id, edge.type, edge.sourceId, edge.targetId, JSON.stringify(edge.evidence), JSON.stringify(edge.metadata)]);
}

function traverseTyped(graph, id, types, direction, options) {
  const maxDepth = normalizeDepth(options.maxDepth, 1);
  const visited = new Set([id]);
  const queue = [{ id, depth: 0 }];
  const results = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.depth >= maxDepth) {
      continue;
    }

    for (const neighbor of graph.getNeighbors(current.id, { direction, edgeTypes: types })) {
      if (visited.has(neighbor.node.id)) {
        continue;
      }
      visited.add(neighbor.node.id);
      results.push(neighbor.node);
      queue.push({ id: neighbor.node.id, depth: current.depth + 1 });
    }
  }

  return results.sort(compareNodes);
}

function repositoryNodeId(root) {
  return `repository:${stableHash(path.resolve(root || "."))}`;
}

function directoryNodeId(relativePath) {
  return `directory:${normalizeRelativePath(relativePath)}`;
}

function fileNodeId(relativePath) {
  return `file:${normalizeRelativePath(relativePath)}`;
}

function configurationNodeId(relativePath) {
  return `configuration:${normalizeRelativePath(relativePath)}`;
}

function testNodeId(relativePath) {
  return `test:${normalizeRelativePath(relativePath)}`;
}

function dependencyNodeId(name) {
  return `dependency:${String(name).trim().toLowerCase()}`;
}

function decisionNodeId(decision) {
  return `decision:${decision.id || stableHash(decision)}`;
}

function symbolNodeId(symbol) {
  return `symbol:${graphNodeTypeFromSymbol(symbol.type)}:${normalizeRelativePath(symbol.path)}:${symbol.name}:${symbol.parent || UNKNOWN}`;
}

function isConfigurationPath(relativePath) {
  const name = path.posix.basename(relativePath);
  return CONFIG_FILE_PATTERNS.some((pattern) => pattern.test(name));
}

function isTestPath(relativePath) {
  return /(^|\/)(test|tests|__tests__)\/|(\.|-)(test|spec)\.[A-Za-z0-9]+$/i.test(relativePath);
}

function sourceCandidatesForTest(relativePath) {
  const fileName = path.posix.basename(relativePath).replace(/(\.|-)(test|spec)(\.[^.]+)$/i, "$3");
  const directory = path.posix.dirname(relativePath);
  const withoutTestPrefix = directory.replace(/(^|\/)(test|tests|__tests__)($|\/)/, "$1src$2");
  return [
    path.posix.join(withoutTestPrefix, fileName),
    path.posix.join("src", fileName),
    fileName,
  ].map(normalizeRelativePath);
}

function normalizeProjectKnowledgeMetadata(options) {
  const facts = normalizeProjectKnowledgeFacts(options);
  return {
    factCount: facts.length,
  };
}

function normalizeProjectKnowledgeFacts(options) {
  if (Array.isArray(options.projectKnowledgeFacts)) {
    return options.projectKnowledgeFacts.map(clonePlainObject);
  }
  if (Array.isArray(options.knowledgeFacts)) {
    return options.knowledgeFacts.map(clonePlainObject);
  }
  return [];
}

function normalizeDecisionRecords(options, projectId) {
  if (Array.isArray(options.decisionRecords)) {
    return options.decisionRecords.filter(isDecisionRecord).map(clonePlainObject);
  }
  if (options.memoryStore && typeof options.memoryStore.listRecords === "function" && projectId) {
    return options.memoryStore.listRecords(projectId).filter(isDecisionRecord).map(clonePlainObject);
  }
  return [];
}

function isDecisionRecord(record) {
  return isPlainObject(record) && record.type === "approved-decision";
}

function decisionEvidencePaths(decision) {
  const paths = [];
  const value = decision.value || {};
  for (const evidence of asArray(value.evidence || value.sourceEvidence || [])) {
    if (evidence && typeof evidence.source === "string") {
      paths.push(normalizeRelativePath(evidence.source));
    }
  }
  if (decision.source && typeof decision.source.source === "string") {
    paths.push(normalizeRelativePath(decision.source.source));
  }
  return uniqueSorted(paths.filter(Boolean));
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

function defaultPersistencePath(repositoryPath) {
  if (!repositoryPath) {
    throw new Error("Repository knowledge graph persistence requires a repository path or file path.");
  }
  return path.join(repositoryPath, ".levi", "repository-knowledge-graph.json");
}

function readOptionalFile(root, relativePath) {
  try {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
  } catch (error) {
    return "";
  }
}

function requiredGraphType(value, types, label) {
  const normalized = requiredString(value, `Repository knowledge graph ${label} is required.`);
  if (!Object.values(types).includes(normalized)) {
    throw new Error(`Repository knowledge graph ${label} is invalid.`);
  }
  return normalized;
}

function requiredString(value, message) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }
  return value.trim();
}

function normalizeNullableString(value) {
  if (value === null) {
    return null;
  }
  return requiredString(String(value), "Repository knowledge graph string value is required.");
}

function normalizeNullablePath(value) {
  if (value === null) {
    return null;
  }
  return normalizeRelativePath(String(value));
}

function normalizeRelativePath(value) {
  return requiredString(String(value), "Repository knowledge graph path is required.").replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeRange(range) {
  if (range === null) {
    return null;
  }
  if (!isPlainObject(range)) {
    throw new Error("Repository knowledge graph node range must be an object or null.");
  }
  return clonePlainObject(range);
}

function normalizeLineNumber(value) {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function normalizeTimestamp(value) {
  if (value === undefined || value === null) {
    return new Date().toISOString();
  }
  const timestamp = typeof value === "number" ? new Date(value).toISOString() : String(value);
  if (Number.isNaN(Date.parse(timestamp))) {
    throw new Error("Repository knowledge graph timestamp must be valid.");
  }
  return timestamp;
}

function normalizeStringSet(value) {
  return new Set(asArray(value).map((entry) => String(entry).trim()).filter(Boolean));
}

function setMatches(filters, value) {
  if (filters.size === 0) {
    return true;
  }
  const normalized = value === null || value === undefined ? "" : String(value).toLowerCase();
  return Array.from(filters).some((filter) => normalized === filter.toLowerCase() || normalized.includes(filter.toLowerCase()));
}

function keywordMatches(filters, values) {
  if (filters.size === 0) {
    return true;
  }
  const text = values.filter((value) => value !== null && value !== undefined).join(" ").toLowerCase();
  return Array.from(filters).every((keyword) => text.includes(keyword.toLowerCase()));
}

function normalizeDepth(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function compareNeighborEntries(left, right) {
  return compareNodes(left.node, right.node) || compareEdges(left.edge, right.edge);
}

function compareNodes(left, right) {
  return left.type.localeCompare(right.type) ||
    String(left.path || "").localeCompare(String(right.path || "")) ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id);
}

function compareEdges(left, right) {
  return left.type.localeCompare(right.type) ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.targetId.localeCompare(right.targetId) ||
    left.id.localeCompare(right.id);
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

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  CHANGE_TYPES,
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_TYPES,
  GRAPH_SCHEMA_VERSION,
  KNOWLEDGE_GRAPH_EVENTS,
  KNOWLEDGE_GRAPH_EVENT_TYPES,
  RepositoryKnowledgeGraph,
  createStructuralLanguageAnalyzer,
};
