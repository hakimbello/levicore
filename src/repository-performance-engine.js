const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const REPOSITORY_PERFORMANCE_SCHEMA_VERSION = 1;

const PerformanceEngineStates = Object.freeze({
  CREATED: "CREATED",
  INITIALIZING: "INITIALIZING",
  READY: "READY",
  DEGRADED: "DEGRADED",
  SUSPENDED: "SUSPENDED",
  RECOVERING: "RECOVERING",
  SHUTTING_DOWN: "SHUTTING_DOWN",
  STOPPED: "STOPPED",
  FAILED: "FAILED",
});

const RepositoryChangeTypes = Object.freeze({
  CREATED: "CREATED",
  DELETED: "DELETED",
  RENAMED: "RENAMED",
  MODIFIED: "MODIFIED",
  UNCHANGED: "UNCHANGED",
});

const CacheEntryTypes = Object.freeze({
  GRAPH_NODE: "GRAPH_NODE",
  GRAPH_EDGE: "GRAPH_EDGE",
  SYMBOL: "SYMBOL",
  CONTEXT_PACKAGE: "CONTEXT_PACKAGE",
  TOKEN_SUMMARY: "TOKEN_SUMMARY",
  PLAN_SUMMARY: "PLAN_SUMMARY",
  WORKFLOW_SUMMARY: "WORKFLOW_SUMMARY",
  MODEL_REQUEST: "MODEL_REQUEST",
  VALIDATION_EVIDENCE: "VALIDATION_EVIDENCE",
  APPROVAL_EVIDENCE: "APPROVAL_EVIDENCE",
  BENCHMARK: "BENCHMARK",
  METADATA: "METADATA",
});

const InvalidationScopes = Object.freeze({
  FILE: "FILE",
  DEPENDENTS: "DEPENDENTS",
  GRAPH: "GRAPH",
  CONTEXT: "CONTEXT",
  PLAN: "PLAN",
  WORKFLOW: "WORKFLOW",
  PROVIDER: "PROVIDER",
  ALL: "ALL",
});

const BenchmarkScenarios = Object.freeze({
  COLD_INDEX: "coldIndex",
  WARM_INDEX: "warmIndex",
  INCREMENTAL_INDEX: "incrementalIndex",
  FULL_REBUILD: "fullRebuild",
  GRAPH_QUERY: "graphQuery",
  CONTEXT_REUSE: "contextReuse",
  WORKFLOW_CREATE: "workflowCreate",
  WORKFLOW_RESUME: "workflowResume",
  PROVIDER_REUSE: "providerReuse",
  ALL: "all",
});

const PerformanceEventTypes = Object.freeze({
  READY: "performance_engine_ready",
  INDEX_UPDATED: "performance_index_updated",
  CACHE_HIT: "performance_cache_hit",
  CACHE_MISS: "performance_cache_miss",
  CACHE_EVICTED: "performance_cache_evicted",
  CACHE_CLEARED: "performance_cache_cleared",
  INVALIDATED: "performance_invalidated",
  REBUILD_COMPLETED: "performance_rebuild_completed",
  BENCHMARK_COMPLETED: "performance_benchmark_completed",
  MEMORY_BUDGET_EXCEEDED: "performance_memory_budget_exceeded",
  PERSISTED: "performance_persisted",
  RESTORED: "performance_restored",
  CORRUPTION_DETECTED: "performance_corruption_detected",
});

const DEFAULT_CONFIGURATION = Object.freeze({
  id: "levi-repository-performance",
  schemaVersion: REPOSITORY_PERFORMANCE_SCHEMA_VERSION,
  enabled: true,
  storagePath: ".levi/repository-performance.json",
  maximumCacheEntries: 512,
  maximumContextEntries: 64,
  maximumTokenEntries: 128,
  maximumGraphHandles: 512,
  maximumMemoryBytes: 64 * 1024 * 1024,
  maximumGraphMemoryBytes: 24 * 1024 * 1024,
  maximumCacheMemoryBytes: 24 * 1024 * 1024,
  maximumWorkflowMemoryBytes: 8 * 1024 * 1024,
  maximumModelRequestMemoryBytes: 4 * 1024 * 1024,
  maximumUiMemoryBytes: 2 * 1024 * 1024,
  cacheTtlMs: 5 * 60 * 1000,
  maximumParallelism: 4,
  persistenceEnabled: true,
  persistSummaries: true,
  lazyGraphLoadingEnabled: true,
  incrementalIndexingEnabled: true,
  contextReuseEnabled: true,
  tokenReuseEnabled: true,
  benchmarkSampleSize: 8,
  deterministicBenchmarkMode: true,
  metadata: Object.freeze({}),
});

class MemoryRepositoryPerformancePersistenceAdapter {
  constructor() {
    this.snapshot = null;
  }

  save(snapshot) {
    this.snapshot = cloneJson(snapshot);
    return { status: "PERSISTED", path: "memory://repository-performance", savedAt: snapshot.savedAt || Date.now() };
  }

  load() {
    if (!this.snapshot) return { status: "EMPTY", path: "memory://repository-performance" };
    return { status: "LOADED", path: "memory://repository-performance", snapshot: cloneJson(this.snapshot) };
  }
}

class FileRepositoryPerformancePersistenceAdapter {
  constructor(options = {}) {
    this.storagePath = options.storagePath || DEFAULT_CONFIGURATION.storagePath;
    this.root = options.root || options.repositoryPath || process.cwd();
    this.clock = options.clock || { now: () => Date.now() };
  }

  filePath(configuration = {}) {
    const configured = configuration.storagePath || this.storagePath;
    return path.isAbsolute(configured) ? configured : path.join(this.root, configured);
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
}

class RepositoryPerformanceEngine {
  constructor(options = {}) {
    this.runtime = options.runtime || null;
    this.components = options.components || {};
    this.clock = options.clock || { now: () => Date.now() };
    this.configuration = normalizeConfiguration(options.configuration || {});
    this.persistenceAdapter = options.persistenceAdapter || new FileRepositoryPerformancePersistenceAdapter({
      root: options.repositoryPath || options.root || process.cwd(),
      storagePath: this.configuration.storagePath,
      clock: this.clock,
    });
    this.events = new EventEmitter();
    this.state = PerformanceEngineStates.CREATED;
    this.workspaceRevisions = new Map();
    this.dependencyVersions = new Map();
    this.fileIndex = new Map();
    this.dependencies = new Map();
    this.dependents = new Map();
    this.graphHandles = new Map();
    this.cache = new Map();
    this.contextPackages = new Map();
    this.tokenSummaries = new Map();
    this.benchmarks = [];
    this.activeTasks = new Map();
    this.generation = 0;
    this.lastHealth = null;
    this.corruptionFlags = [];
    this.stats = emptyStats();
  }

  initialize(options = {}) {
    this.state = PerformanceEngineStates.INITIALIZING;
    if (options.load !== false && this.configuration.persistenceEnabled) this.restore({ emptyOnCorruption: true });
    this.state = this.configuration.enabled ? PerformanceEngineStates.READY : PerformanceEngineStates.SUSPENDED;
    this.publish(PerformanceEventTypes.READY, { state: this.state });
    return { status: this.state, health: this.getHealth() };
  }

  shutdown(options = {}) {
    this.state = PerformanceEngineStates.SHUTTING_DOWN;
    const persisted = options.save === false ? { status: "SKIPPED" } : this.save();
    this.state = PerformanceEngineStates.STOPPED;
    return { status: this.state, persisted };
  }

  subscribe(listener) {
    const id = nextId("performance-listener", String(this.events.listenerCount("event") + 1));
    this.events.on("event", listener);
    return id;
  }

  unsubscribe(listener) {
    this.events.off("event", listener);
  }

  publish(type, payload = {}) {
    const event = { id: nextId("performance-event", `${type}:${this.stats.eventsPublished}`), type, timestamp: this.now(), payload };
    this.stats.eventsPublished += 1;
    this.events.emit("event", event);
    return event;
  }

  now() {
    const value = typeof this.clock.now === "function" ? this.clock.now() : Date.now();
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
  }

  getState() {
    return this.state;
  }

  updateConfiguration(configuration = {}) {
    this.configuration = normalizeConfiguration({ ...this.configuration, ...configuration });
    this.enforceMemoryBudget();
    return this.configuration;
  }

  recordWorkspaceSnapshot(workspaceId, files = [], options = {}) {
    const changes = this.detectChanges(workspaceId, files, options);
    const applied = this.applyWorkspaceChanges(workspaceId, changes.changes, { ...options, files });
    return { status: "INDEXED", workspaceId, changes: changes.changes, applied };
  }

  detectChanges(workspaceId = "default", files = [], options = {}) {
    const normalizedFiles = safeArray(files).map((file) => normalizeFileRecord(workspaceId, file, this.now()));
    const byPath = new Map(normalizedFiles.map((file) => [file.path, file]));
    const byHash = new Map(normalizedFiles.map((file) => [file.hash, file]));
    const oldFiles = Array.from(this.fileIndex.values()).filter((file) => file.workspaceId === workspaceId);
    const changes = [];

    for (const file of normalizedFiles) {
      const old = this.fileIndex.get(file.path);
      if (!old) {
        const renamedFrom = oldFiles.find((candidate) => candidate.path !== file.path && candidate.hash === file.hash && !byPath.has(candidate.path));
        changes.push(renamedFrom ? changeRecord(RepositoryChangeTypes.RENAMED, file, { fromPath: renamedFrom.path }) : changeRecord(RepositoryChangeTypes.CREATED, file));
      } else if (old.hash !== file.hash || old.timestamp !== file.timestamp || old.size !== file.size || options.forceModified === true) {
        changes.push(changeRecord(RepositoryChangeTypes.MODIFIED, file, { previousHash: old.hash }));
      } else {
        changes.push(changeRecord(RepositoryChangeTypes.UNCHANGED, file));
      }
    }

    for (const old of oldFiles) {
      if (!byPath.has(old.path) && !byHash.has(old.hash)) changes.push(changeRecord(RepositoryChangeTypes.DELETED, old));
    }

    const changed = changes.filter((entry) => entry.type !== RepositoryChangeTypes.UNCHANGED);
    return { status: "DETECTED", workspaceId, revision: this.workspaceRevision(workspaceId), changes, changedCount: changed.length };
  }

  applyWorkspaceChanges(workspaceId = "default", changes = [], options = {}) {
    const changedPaths = new Set();
    for (const change of safeArray(changes)) {
      if (!change || change.type === RepositoryChangeTypes.UNCHANGED) continue;
      changedPaths.add(change.path);
      if (change.type === RepositoryChangeTypes.DELETED) {
        this.removeFile(change.path);
      } else {
        if (change.fromPath) this.removeFile(change.fromPath);
        this.updateIndexForFile({ ...change.file, path: change.path, workspaceId }, options);
      }
    }
    if (changedPaths.size > 0 || options.bumpRevision === true) {
      this.bumpWorkspaceRevision(workspaceId);
      for (const filePath of changedPaths) this.bumpDependencyVersion(filePath);
      this.invalidate({ workspaceId, paths: Array.from(changedPaths), scope: InvalidationScopes.DEPENDENTS, reason: "workspace changes" });
    }
    this.publish(PerformanceEventTypes.INDEX_UPDATED, { workspaceId, changedPaths: Array.from(changedPaths), fileCount: this.fileIndex.size });
    return { status: "APPLIED", workspaceId, changedPaths: Array.from(changedPaths), revision: this.workspaceRevision(workspaceId) };
  }

  updateIndexForFile(file, options = {}) {
    const normalized = normalizeFileRecord(file.workspaceId || options.workspaceId || "default", file, () => this.now());
    const previous = this.fileIndex.get(normalized.path);
    normalized.version = previous ? previous.version + 1 : 1;
    normalized.updatedAt = this.now();
    normalized.graphNodeIds = safeArray(file.graphNodeIds || file.nodes || []);
    normalized.symbolIds = safeArray(file.symbolIds || file.symbols || []);
    normalized.dependencies = Array.from(new Set(safeArray(file.dependencies || file.imports || [])));
    normalized.dependents = [];
    normalized.status = "INDEXED";
    this.fileIndex.set(normalized.path, normalized);
    this.setDependencies(normalized.path, normalized.dependencies);
    return cloneJson(normalized);
  }

  removeFile(filePath) {
    this.fileIndex.delete(filePath);
    this.setDependencies(filePath, []);
    for (const deps of this.dependents.values()) deps.delete(filePath);
  }

  setDependencies(filePath, dependencies) {
    const previous = this.dependencies.get(filePath) || new Set();
    for (const dep of previous) {
      const reverse = this.dependents.get(dep);
      if (reverse) reverse.delete(filePath);
    }
    const next = new Set(safeArray(dependencies));
    this.dependencies.set(filePath, next);
    for (const dep of next) {
      if (!this.dependents.has(dep)) this.dependents.set(dep, new Set());
      this.dependents.get(dep).add(filePath);
    }
  }

  listIndexedFiles(filter = {}) {
    return Array.from(this.fileIndex.values()).filter((file) => !filter.workspaceId || file.workspaceId === filter.workspaceId).map(cloneJson);
  }

  getIndexedFile(filePath) {
    return cloneJson(this.fileIndex.get(filePath) || null);
  }

  invalidate(input = {}, options = {}) {
    const paths = new Set(safeArray(input.paths || input.path || input.filePath));
    const scope = input.scope || InvalidationScopes.FILE;
    const affectedPaths = new Set(paths);
    if ([InvalidationScopes.DEPENDENTS, InvalidationScopes.ALL].includes(scope)) {
      for (const filePath of paths) for (const dependent of this.collectDependents(filePath)) affectedPaths.add(dependent);
    }
    if ([InvalidationScopes.GRAPH, InvalidationScopes.ALL].includes(scope)) {
      for (const handle of this.graphHandles.values()) affectedPaths.add(handle.filePath || handle.key);
    }

    const affectedCacheIds = [];
    for (const [id, entry] of this.cache.entries()) {
      if (scope === InvalidationScopes.ALL || cacheEntryTouches(entry, affectedPaths, input)) {
        this.cache.delete(id);
        this.contextPackages.delete(id);
        this.tokenSummaries.delete(id);
        affectedCacheIds.push(id);
      }
    }
    for (const filePath of affectedPaths) this.bumpDependencyVersion(filePath);
    this.stats.invalidations += 1;
    this.stats.cacheInvalidations += affectedCacheIds.length;
    const result = { status: "INVALIDATED", scope, reason: input.reason || options.reason || "manual", affectedPaths: Array.from(affectedPaths), affectedCacheIds };
    this.publish(PerformanceEventTypes.INVALIDATED, result);
    return result;
  }

  collectDependents(filePath) {
    const found = new Set();
    const queue = Array.from(this.dependents.get(filePath) || []);
    while (queue.length > 0) {
      const current = queue.shift();
      if (found.has(current)) continue;
      found.add(current);
      for (const next of this.dependents.get(current) || []) queue.push(next);
    }
    return found;
  }

  registerGraphHandle(input = {}) {
    const id = input.id || nextId("graph-handle", `${input.type || "node"}:${input.key || input.nodeId || this.graphHandles.size}`);
    const handle = {
      id,
      type: input.type || "node",
      key: input.key || input.nodeId || id,
      workspaceId: input.workspaceId || "default",
      workspaceRevision: input.workspaceRevision || this.workspaceRevision(input.workspaceId || "default"),
      dependencyVersion: input.dependencyVersion || this.combinedDependencyVersion(input.paths || input.filePath),
      filePath: input.filePath || null,
      paths: safeArray(input.paths || input.filePath),
      loaderRef: input.loaderRef || null,
      loader: typeof input.loader === "function" ? input.loader : null,
      loaded: input.loaded === true,
      value: input.loaded === true ? sanitizeCachedValue(input.value) : undefined,
      estimatedBytes: estimateBytes(input.summary || input.value || input.key || id),
      generation: ++this.generation,
      lastAccessed: this.now(),
      hitCount: 0,
    };
    this.graphHandles.set(id, handle);
    this.boundMap(this.graphHandles, this.configuration.maximumGraphHandles);
    return cloneGraphHandle(handle, { includeValue: false });
  }

  async loadGraphNode(id, options = {}) {
    const handle = this.graphHandles.get(id);
    if (!handle) return { status: "MISSING", id };
    handle.lastAccessed = this.now();
    handle.hitCount += 1;
    if (!handle.loaded && this.configuration.lazyGraphLoadingEnabled) {
      if (handle.loader) handle.value = sanitizeCachedValue(await handle.loader(handle, options));
      else if (this.runtime && typeof this.runtime.executeCommand === "function") {
        handle.value = sanitizeCachedValue(await this.runtime.executeCommand("repository.graphQuery", { workspaceId: handle.workspaceId, query: { nodeId: handle.key }, options }));
      } else {
        handle.value = { id: handle.key, status: "REFERENCE_ONLY" };
      }
      handle.loaded = true;
      handle.estimatedBytes = estimateBytes(handle.value);
    }
    return { status: "LOADED", handle: cloneGraphHandle(handle, { includeValue: options.includeValue !== false }) };
  }

  async loadGraphEdges(filter = {}) {
    const query = filter.edges || filter.query || { from: filter.from, to: filter.to, type: filter.type };
    if (this.runtime && typeof this.runtime.executeCommand === "function") {
      return this.runtime.executeCommand("repository.graphQuery", { workspaceId: filter.workspaceId, query: { edges: query }, options: filter.options || {} });
    }
    return { status: "REFERENCE_ONLY", edges: [] };
  }

  async getGraph(input = {}) {
    if (input.action === "register") return this.registerGraphHandle(input.handle || input);
    if (input.action === "loadNode" || input.nodeId || input.id) return this.loadGraphNode(input.nodeId || input.id, input.options || input);
    if (input.action === "edges") return this.loadGraphEdges(input);
    return {
      status: "AVAILABLE",
      lazyLoading: this.configuration.lazyGraphLoadingEnabled,
      handles: Array.from(this.graphHandles.values()).map((handle) => cloneGraphHandle(handle, { includeValue: false })),
      graphVersion: this.graphVersion(),
    };
  }

  putCache(entry = {}) {
    const key = entry.key || entry.id || nextId("cache-key", String(this.cache.size));
    const id = entry.id || stableCacheId(entry.type || CacheEntryTypes.METADATA, key, entry.workspaceRevision, entry.dependencyVersion);
    const now = this.now();
    const normalized = {
      id,
      type: entry.type || CacheEntryTypes.METADATA,
      key,
      workspaceId: entry.workspaceId || "default",
      workspaceRevision: entry.workspaceRevision || this.workspaceRevision(entry.workspaceId || "default"),
      graphVersion: entry.graphVersion || this.graphVersion(),
      dependencyVersion: entry.dependencyVersion || this.combinedDependencyVersion(entry.paths || entry.fileUris || entry.filePath),
      planId: entry.planId || null,
      workflowId: entry.workflowId || null,
      tokenBudget: entry.tokenBudget || null,
      paths: safeArray(entry.paths || entry.fileUris || entry.filePath),
      summary: sanitizeCachedValue(entry.summary || summarizeValue(entry.value)),
      value: sanitizeCachedValue(entry.value),
      evidence: sanitizeCachedValue(safeArray(entry.evidence).slice(0, 32)),
      estimatedBytes: entry.estimatedBytes || estimateBytes(entry.value || entry.summary || key),
      expiresAt: entry.expiresAt || now + (entry.ttlMs || this.configuration.cacheTtlMs),
      lastAccessed: now,
      hitCount: 0,
      generation: ++this.generation,
      protected: entry.protected === true || isProtectedCacheType(entry.type),
    };
    this.cache.set(id, normalized);
    if (normalized.type === CacheEntryTypes.CONTEXT_PACKAGE) this.contextPackages.set(id, normalized);
    if (normalized.type === CacheEntryTypes.TOKEN_SUMMARY) this.tokenSummaries.set(id, normalized);
    this.stats.cacheWrites += 1;
    this.enforceMemoryBudget();
    return cloneCacheEntry(normalized);
  }

  getCache(input = {}) {
    const lookup = typeof input === "string" ? { key: input } : input;
    const entry = this.resolveCacheEntry(lookup);
    if (!entry) {
      this.stats.cacheMisses += 1;
      this.publish(PerformanceEventTypes.CACHE_MISS, { key: lookup.key || lookup.id || null });
      return { status: "MISS", cacheHit: false };
    }
    const now = this.now();
    if (entry.expiresAt && entry.expiresAt < now) {
      this.cache.delete(entry.id);
      this.stats.cacheMisses += 1;
      return { status: "EXPIRED", cacheHit: false };
    }
    if (lookup.workspaceRevision && lookup.workspaceRevision !== entry.workspaceRevision) return { status: "STALE_WORKSPACE_REVISION", cacheHit: false };
    if (lookup.dependencyVersion && lookup.dependencyVersion !== entry.dependencyVersion) return { status: "STALE_DEPENDENCY_VERSION", cacheHit: false };
    entry.lastAccessed = now;
    entry.hitCount += 1;
    this.stats.cacheHits += 1;
    this.publish(PerformanceEventTypes.CACHE_HIT, { id: entry.id, key: entry.key, type: entry.type });
    return { status: "HIT", cacheHit: true, entry: cloneCacheEntry(entry) };
  }

  resolveCacheEntry(lookup = {}) {
    if (lookup.id && this.cache.has(lookup.id)) return this.cache.get(lookup.id);
    if (lookup.key) {
      for (const entry of this.cache.values()) {
        if (entry.key === lookup.key && (!lookup.type || entry.type === lookup.type) && (!lookup.workspaceId || entry.workspaceId === lookup.workspaceId)) return entry;
      }
    }
    return null;
  }

  clearCache(filter = {}) {
    const ids = [];
    for (const [id, entry] of this.cache.entries()) {
      if (filter.preserveProtected === true && entry.protected) continue;
      if (filter.type && entry.type !== filter.type) continue;
      if (filter.workspaceId && entry.workspaceId !== filter.workspaceId) continue;
      ids.push(id);
    }
    for (const id of ids) {
      this.cache.delete(id);
      this.contextPackages.delete(id);
      this.tokenSummaries.delete(id);
    }
    this.publish(PerformanceEventTypes.CACHE_CLEARED, { cleared: ids.length });
    return { status: "CLEARED", cleared: ids.length };
  }

  warmCache(entries = []) {
    const warmed = safeArray(entries).map((entry) => this.putCache({ ...entry, warmed: true }));
    return { status: "WARMED", warmed: warmed.length, entries: warmed };
  }

  getCacheSummary() {
    const memory = this.getMemoryUsage();
    return {
      status: "AVAILABLE",
      entries: this.cache.size,
      contexts: this.contextPackages.size,
      tokenSummaries: this.tokenSummaries.size,
      hitRate: hitRate(this.stats),
      memoryBytes: memory.totalBytes,
      byType: countBy(Array.from(this.cache.values()), "type"),
    };
  }

  storeContextPackage(input = {}) {
    return this.putCache({ ...input, type: CacheEntryTypes.CONTEXT_PACKAGE, key: contextKey(input), value: input.context || input.value || input.summary });
  }

  reuseContext(input = {}) {
    if (!this.configuration.contextReuseEnabled) return { status: "DISABLED", reused: false };
    const lookup = { key: contextKey(input), type: CacheEntryTypes.CONTEXT_PACKAGE, workspaceId: input.workspaceId };
    const result = this.getCache(lookup);
    if (!result.cacheHit) return { ...result, reused: false };
    if (intersects(result.entry.paths, safeArray(input.affectedPaths))) return { status: "INVALIDATED_BY_PATH", reused: false };
    this.stats.contextReuses += 1;
    return { status: "REUSED", reused: true, context: result.entry };
  }

  storeTokenSummary(input = {}) {
    return this.putCache({ ...input, type: CacheEntryTypes.TOKEN_SUMMARY, key: tokenKey(input), value: input.summary || input.value });
  }

  reuseTokenSummary(input = {}) {
    if (!this.configuration.tokenReuseEnabled) return { status: "DISABLED", reused: false };
    const result = this.getCache({ key: tokenKey(input), type: CacheEntryTypes.TOKEN_SUMMARY, workspaceId: input.workspaceId });
    if (!result.cacheHit) return { ...result, reused: false };
    this.stats.tokenReuses += 1;
    return { status: "REUSED", reused: true, summary: result.entry };
  }

  getMemoryUsage() {
    const cacheBytes = sum(Array.from(this.cache.values()), (entry) => entry.estimatedBytes);
    const graphBytes = sum(Array.from(this.graphHandles.values()), (entry) => entry.estimatedBytes);
    const contextBytes = sum(Array.from(this.contextPackages.values()), (entry) => entry.estimatedBytes);
    const tokenBytes = sum(Array.from(this.tokenSummaries.values()), (entry) => entry.estimatedBytes);
    const indexBytes = estimateBytes(Array.from(this.fileIndex.values()).map((file) => ({ path: file.path, hash: file.hash, dependencies: file.dependencies })));
    return {
      status: "AVAILABLE",
      totalBytes: cacheBytes + graphBytes + indexBytes,
      cacheBytes,
      graphBytes,
      contextBytes,
      tokenBytes,
      indexBytes,
      budgetBytes: this.configuration.maximumMemoryBytes,
      withinBudget: cacheBytes + graphBytes + indexBytes <= this.configuration.maximumMemoryBytes,
      entries: { cache: this.cache.size, graphHandles: this.graphHandles.size, files: this.fileIndex.size, contexts: this.contextPackages.size, tokenSummaries: this.tokenSummaries.size },
    };
  }

  enforceMemoryBudget() {
    let memory = this.getMemoryUsage();
    const evicted = [];
    while ((memory.totalBytes > this.configuration.maximumMemoryBytes || this.cache.size > this.configuration.maximumCacheEntries) && this.cache.size > 0) {
      const candidate = this.evictableCacheEntries()[0];
      if (!candidate) break;
      this.cache.delete(candidate.id);
      this.contextPackages.delete(candidate.id);
      this.tokenSummaries.delete(candidate.id);
      evicted.push(candidate.id);
      this.stats.cacheEvictions += 1;
      this.publish(PerformanceEventTypes.CACHE_EVICTED, { id: candidate.id, reason: "memory-budget" });
      memory = this.getMemoryUsage();
    }
    if (evicted.length > 0) this.publish(PerformanceEventTypes.MEMORY_BUDGET_EXCEEDED, { evicted, memory });
    return { status: evicted.length > 0 ? "EVICTED" : "WITHIN_BUDGET", evicted, memory };
  }

  evictableCacheEntries() {
    const now = this.now();
    return Array.from(this.cache.values())
      .filter((entry) => !entry.protected)
      .sort((a, b) => {
        const expiredA = a.expiresAt && a.expiresAt < now ? 0 : 1;
        const expiredB = b.expiresAt && b.expiresAt < now ? 0 : 1;
        if (expiredA !== expiredB) return expiredA - expiredB;
        if (a.hitCount !== b.hitCount) return a.hitCount - b.hitCount;
        return a.lastAccessed - b.lastAccessed || a.generation - b.generation;
      });
  }

  async rebuild(input = {}, options = {}) {
    const workspaceId = input.workspaceId || options.workspaceId || "default";
    const full = input.full === true || options.full === true;
    const changedPaths = safeArray(input.paths || input.changedPaths);
    if (full) {
      this.bumpWorkspaceRevision(workspaceId);
      this.invalidate({ workspaceId, scope: InvalidationScopes.ALL, reason: "full rebuild" });
    } else if (changedPaths.length > 0) {
      this.invalidate({ workspaceId, paths: changedPaths, scope: InvalidationScopes.DEPENDENTS, reason: "incremental rebuild" });
    }
    const graphQuery = this.runtime && typeof this.runtime.executeCommand === "function"
      ? await maybeRuntimeCommand(this.runtime, "repository.graphQuery", { workspaceId, query: input.query || {} })
      : { status: "REFERENCE_ONLY" };
    const result = { status: "REBUILT", workspaceId, full, revision: this.workspaceRevision(workspaceId), graphVersion: this.graphVersion(), graphQuery };
    this.stats.rebuilds += 1;
    this.publish(PerformanceEventTypes.REBUILD_COMPLETED, result);
    return result;
  }

  async runBenchmark(input = {}, options = {}) {
    const workspaceId = input.workspaceId || options.workspaceId || "default";
    const scenarios = expandScenarios(input.scenario || input.scenarios || BenchmarkScenarios.ALL);
    const sampleSize = clampNumber(input.sampleSize || this.configuration.benchmarkSampleSize, 1, 100);
    const base = {
      files: Math.max(1, this.listIndexedFiles({ workspaceId }).length),
      cache: Math.max(1, this.cache.size),
      graph: Math.max(1, this.graphHandles.size),
      contexts: Math.max(1, this.contextPackages.size),
      workflows: componentAvailable(this.runtime, "workflowEngine") ? 2 : 1,
      providers: componentAvailable(this.runtime, "modelGateway") ? 2 : 1,
    };
    const results = scenarios.map((scenario) => deterministicScenarioResult(scenario, base, sampleSize));
    const benchmark = {
      id: nextId("benchmark", `${workspaceId}:${this.benchmarks.length}:${scenarios.join(",")}`),
      workspaceId,
      deterministic: this.configuration.deterministicBenchmarkMode !== false,
      sampleSize,
      scenarios: results,
      totals: {
        estimatedDurationMs: sum(results, (result) => result.estimatedDurationMs),
        operations: sum(results, (result) => result.operations),
        cacheHitRate: hitRate(this.stats),
      },
      createdAt: this.now(),
    };
    this.benchmarks.push(benchmark);
    this.stats.benchmarksRun += 1;
    this.stats.lastBenchmarkId = benchmark.id;
    this.putCache({ type: CacheEntryTypes.BENCHMARK, key: benchmark.id, value: benchmark, protected: false, ttlMs: this.configuration.cacheTtlMs });
    this.publish(PerformanceEventTypes.BENCHMARK_COMPLETED, benchmark);
    return { status: "BENCHMARKED", benchmark };
  }

  getStats() {
    return {
      status: "AVAILABLE",
      stats: { ...this.stats, hitRate: hitRate(this.stats) },
      repository: {
        indexedFiles: this.fileIndex.size,
        dependencyEdges: sum(Array.from(this.dependencies.values()), (deps) => deps.size),
        graphHandles: this.graphHandles.size,
        workspaceRevisions: Object.fromEntries(this.workspaceRevisions),
      },
      cache: this.getCacheSummary(),
      memory: this.getMemoryUsage(),
      lastBenchmark: this.benchmarks[this.benchmarks.length - 1] || null,
    };
  }

  getHealth() {
    const memory = this.getMemoryUsage();
    const dependencyInvalid = this.hasInvalidDependencyGraph();
    const criticalFailures = [];
    if (this.corruptionFlags.length > 0) criticalFailures.push("corrupted graph/cache poisoning");
    if (dependencyInvalid) criticalFailures.push("invalid dependency graph");
    if (!memory.withinBudget && this.evictableCacheEntries().length === 0) criticalFailures.push("memory exhaustion");
    const domains = {
      cache: domainScore(this.cache.size <= this.configuration.maximumCacheEntries, "Cache entries are bounded.", "Cache entry limit exceeded."),
      indexing: domainScore(this.fileIndex.size >= 0, "Incremental index is available.", "Incremental index unavailable."),
      graph: domainScore(!dependencyInvalid, "Dependency graph is valid.", "Dependency graph has invalid references."),
      contextReuse: domainScore(this.configuration.contextReuseEnabled, "Context reuse enabled.", "Context reuse disabled.", 80),
      memory: domainScore(memory.withinBudget, "Memory usage is within budget.", "Memory budget exceeded."),
      runtime: domainScore(Boolean(this.runtime), "Runtime integration available.", "Runtime integration is reference-only.", 85),
      workflow: domainScore(componentAvailable(this.runtime, "workflowEngine"), "Workflow coordinator available.", "Workflow coordinator unavailable.", 85),
      provider: domainScore(componentAvailable(this.runtime, "modelGateway"), "Provider gateway observable.", "Provider gateway unavailable.", 85),
      persistence: domainScore(this.configuration.persistenceEnabled, "Metadata persistence enabled.", "Metadata persistence disabled.", 85),
    };
    const overall = Math.max(0, Math.min(100, Math.round(sum(Object.values(domains), (domain) => domain.score) / Object.keys(domains).length) - criticalFailures.length * 20));
    this.lastHealth = { status: criticalFailures.length > 0 ? "CRITICAL" : overall >= 90 ? "HEALTHY" : "DEGRADED", score: overall, domains, criticalFailures, checkedAt: this.now() };
    return cloneJson(this.lastHealth);
  }

  hasInvalidDependencyGraph() {
    for (const [filePath, deps] of this.dependencies.entries()) {
      if (!this.fileIndex.has(filePath)) continue;
      for (const dep of deps) if (dep === filePath) return true;
    }
    return false;
  }

  snapshot() {
    return {
      schemaVersion: REPOSITORY_PERFORMANCE_SCHEMA_VERSION,
      id: this.configuration.id,
      savedAt: this.now(),
      state: this.state,
      configuration: sanitizeConfiguration(this.configuration),
      stats: { ...this.stats },
      workspaceRevisions: Object.fromEntries(this.workspaceRevisions),
      dependencyVersions: Object.fromEntries(this.dependencyVersions),
      fileIndex: Array.from(this.fileIndex.values()).map((file) => ({
        path: file.path,
        workspaceId: file.workspaceId,
        hash: file.hash,
        timestamp: file.timestamp,
        size: file.size,
        version: file.version,
        dependencies: safeArray(file.dependencies),
        graphNodeIds: safeArray(file.graphNodeIds),
        symbolIds: safeArray(file.symbolIds),
        updatedAt: file.updatedAt,
      })),
      cacheMetadata: Array.from(this.cache.values()).map((entry) => ({
        id: entry.id,
        type: entry.type,
        key: entry.key,
        workspaceId: entry.workspaceId,
        workspaceRevision: entry.workspaceRevision,
        dependencyVersion: entry.dependencyVersion,
        graphVersion: entry.graphVersion,
        planId: entry.planId,
        workflowId: entry.workflowId,
        tokenBudget: entry.tokenBudget,
        paths: safeArray(entry.paths),
        summary: entry.summary,
        estimatedBytes: entry.estimatedBytes,
        expiresAt: entry.expiresAt,
        lastAccessed: entry.lastAccessed,
        hitCount: entry.hitCount,
        generation: entry.generation,
        protected: entry.protected,
      })),
      graphHandles: Array.from(this.graphHandles.values()).map((handle) => cloneGraphHandle(handle, { includeValue: false })),
      benchmarks: this.benchmarks.slice(-16).map((benchmark) => ({ ...benchmark, scenarios: safeArray(benchmark.scenarios) })),
    };
  }

  restore(options = {}) {
    const loaded = this.persistenceAdapter && typeof this.persistenceAdapter.load === "function"
      ? this.persistenceAdapter.load({ configuration: this.configuration, emptyOnCorruption: options.emptyOnCorruption === true })
      : { status: "EMPTY" };
    if (loaded.status !== "LOADED" || !loaded.snapshot) {
      if (loaded.corrupted) this.corruptionFlags.push("persistence-corruption");
      return loaded;
    }
    this.restoreSnapshot(loaded.snapshot);
    this.publish(PerformanceEventTypes.RESTORED, { path: loaded.path });
    return loaded;
  }

  restoreSnapshot(snapshot = {}) {
    if (snapshot.schemaVersion !== REPOSITORY_PERFORMANCE_SCHEMA_VERSION) throw new Error("Unsupported repository performance snapshot schema.");
    this.workspaceRevisions = new Map(Object.entries(snapshot.workspaceRevisions || {}));
    this.dependencyVersions = new Map(Object.entries(snapshot.dependencyVersions || {}));
    this.fileIndex.clear();
    this.dependencies.clear();
    this.dependents.clear();
    for (const file of safeArray(snapshot.fileIndex)) this.updateIndexForFile(file);
    this.cache.clear();
    this.contextPackages.clear();
    this.tokenSummaries.clear();
    for (const entry of safeArray(snapshot.cacheMetadata)) this.putCache({ ...entry, value: entry.summary, ttlMs: Math.max(0, (entry.expiresAt || this.now()) - this.now()) });
    this.graphHandles = new Map(safeArray(snapshot.graphHandles).map((handle) => [handle.id, { ...handle, loaded: false }]));
    this.benchmarks = safeArray(snapshot.benchmarks);
    this.stats = { ...emptyStats(), ...(snapshot.stats || {}) };
    return { status: "RESTORED" };
  }

  save() {
    if (!this.configuration.persistenceEnabled) return { status: "DISABLED" };
    const snapshot = this.snapshot();
    const result = this.persistenceAdapter && typeof this.persistenceAdapter.save === "function"
      ? this.persistenceAdapter.save(snapshot, { configuration: this.configuration })
      : { status: "UNAVAILABLE" };
    if (result.status === "PERSISTED") this.publish(PerformanceEventTypes.PERSISTED, { path: result.path });
    return result;
  }

  workspaceRevision(workspaceId = "default") {
    return this.workspaceRevisions.get(workspaceId) || 0;
  }

  bumpWorkspaceRevision(workspaceId = "default") {
    const next = this.workspaceRevision(workspaceId) + 1;
    this.workspaceRevisions.set(workspaceId, next);
    return next;
  }

  bumpDependencyVersion(filePath) {
    const next = (this.dependencyVersions.get(filePath) || 0) + 1;
    this.dependencyVersions.set(filePath, next);
    return next;
  }

  combinedDependencyVersion(paths) {
    return safeArray(paths).reduce((total, filePath) => total + (this.dependencyVersions.get(filePath) || 0), 0);
  }

  graphVersion() {
    return sum(Array.from(this.workspaceRevisions.values()), (revision) => revision) + sum(Array.from(this.dependencyVersions.values()), (version) => version);
  }

  boundMap(map, maximum) {
    while (map.size > maximum) {
      const candidate = Array.from(map.values()).sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0))[0];
      if (!candidate) break;
      map.delete(candidate.id);
    }
  }
}

function normalizeConfiguration(input = {}) {
  const config = { ...DEFAULT_CONFIGURATION, ...input };
  config.maximumCacheEntries = clampNumber(config.maximumCacheEntries, 1, 100000);
  config.maximumContextEntries = clampNumber(config.maximumContextEntries, 1, 100000);
  config.maximumTokenEntries = clampNumber(config.maximumTokenEntries, 1, 100000);
  config.maximumGraphHandles = clampNumber(config.maximumGraphHandles, 1, 100000);
  config.maximumMemoryBytes = clampNumber(config.maximumMemoryBytes, 1024, 1024 * 1024 * 1024);
  config.cacheTtlMs = clampNumber(config.cacheTtlMs, 0, 24 * 60 * 60 * 1000);
  config.maximumParallelism = clampNumber(config.maximumParallelism, 1, 32);
  config.benchmarkSampleSize = clampNumber(config.benchmarkSampleSize, 1, 1000);
  return config;
}

function emptyStats() {
  return {
    cacheHits: 0,
    cacheMisses: 0,
    cacheWrites: 0,
    cacheEvictions: 0,
    cacheInvalidations: 0,
    invalidations: 0,
    contextReuses: 0,
    tokenReuses: 0,
    rebuilds: 0,
    benchmarksRun: 0,
    eventsPublished: 0,
    lastBenchmarkId: null,
  };
}

function normalizeFileRecord(workspaceId, file, now) {
  const filePath = file.path || file.filePath || file.uri || file.id;
  if (!filePath) throw new Error("RepositoryPerformanceEngine requires file.path.");
  const timestamp = Number(file.timestamp ?? file.mtimeMs ?? file.modifiedAt ?? now());
  const size = Number(file.size ?? file.bytes ?? estimateBytes(file.content || file.summary || filePath));
  return {
    path: filePath,
    workspaceId,
    hash: file.hash || hashValue(`${filePath}:${timestamp}:${size}:${file.content || ""}`),
    timestamp,
    size,
  };
}

function changeRecord(type, file, extra = {}) {
  return { type, path: file.path, workspaceId: file.workspaceId, file: cloneJson(file), ...extra };
}

function cacheEntryTouches(entry, affectedPaths, input = {}) {
  if (input.workspaceId && entry.workspaceId !== input.workspaceId) return false;
  if (input.planId && entry.planId === input.planId) return true;
  if (input.workflowId && entry.workflowId === input.workflowId) return true;
  if (input.type && entry.type === input.type) return true;
  if (affectedPaths.size === 0) return false;
  return intersects(entry.paths, Array.from(affectedPaths));
}

function contextKey(input = {}) {
  return [
    "context",
    input.workspaceId || "default",
    input.workspaceRevision ?? "",
    input.graphVersion ?? "",
    input.dependencyVersion ?? "",
    input.planId || "",
    input.tokenBudget || "",
    safeArray(input.fileUris || input.paths || input.filePath).sort().join("|"),
  ].join(":");
}

function tokenKey(input = {}) {
  return [
    "tokens",
    input.workspaceId || "default",
    input.kind || input.type || "summary",
    input.workspaceRevision ?? "",
    input.dependencyVersion ?? "",
    input.tokenBudget || "",
    safeArray(input.paths || input.fileUris || input.filePath).sort().join("|"),
  ].join(":");
}

function expandScenarios(input) {
  const scenarios = safeArray(input);
  if (scenarios.length === 0 || scenarios.includes(BenchmarkScenarios.ALL) || scenarios.includes("all")) {
    return [
      BenchmarkScenarios.COLD_INDEX,
      BenchmarkScenarios.WARM_INDEX,
      BenchmarkScenarios.INCREMENTAL_INDEX,
      BenchmarkScenarios.FULL_REBUILD,
      BenchmarkScenarios.GRAPH_QUERY,
      BenchmarkScenarios.CONTEXT_REUSE,
      BenchmarkScenarios.WORKFLOW_CREATE,
      BenchmarkScenarios.WORKFLOW_RESUME,
      BenchmarkScenarios.PROVIDER_REUSE,
    ];
  }
  return scenarios;
}

function deterministicScenarioResult(scenario, base, sampleSize) {
  const multipliers = {
    [BenchmarkScenarios.COLD_INDEX]: 11,
    [BenchmarkScenarios.WARM_INDEX]: 4,
    [BenchmarkScenarios.INCREMENTAL_INDEX]: 2,
    [BenchmarkScenarios.FULL_REBUILD]: 16,
    [BenchmarkScenarios.GRAPH_QUERY]: 3,
    [BenchmarkScenarios.CONTEXT_REUSE]: 1,
    [BenchmarkScenarios.WORKFLOW_CREATE]: 5,
    [BenchmarkScenarios.WORKFLOW_RESUME]: 3,
    [BenchmarkScenarios.PROVIDER_REUSE]: 2,
  };
  const operations = Math.max(1, Math.round((base.files + base.graph + base.cache) / 3));
  const estimatedDurationMs = (multipliers[scenario] || 5) * sampleSize + operations;
  return {
    scenario,
    sampleSize,
    operations,
    estimatedDurationMs,
    throughputPerSecond: Number((operations / Math.max(1, estimatedDurationMs / 1000)).toFixed(2)),
    cacheReusable: [BenchmarkScenarios.WARM_INDEX, BenchmarkScenarios.CONTEXT_REUSE, BenchmarkScenarios.PROVIDER_REUSE].includes(scenario),
    parallelismSafe: ![BenchmarkScenarios.FULL_REBUILD].includes(scenario),
  };
}

function isProtectedCacheType(type) {
  return [CacheEntryTypes.VALIDATION_EVIDENCE, CacheEntryTypes.APPROVAL_EVIDENCE, CacheEntryTypes.WORKFLOW_SUMMARY].includes(type);
}

function stableCacheId(type, key, workspaceRevision, dependencyVersion) {
  return nextId("cache", `${type}:${key}:${workspaceRevision || 0}:${dependencyVersion || 0}`);
}

function cloneCacheEntry(entry) {
  if (!entry) return null;
  const copy = { ...entry, value: sanitizeCachedValue(entry.value), summary: sanitizeCachedValue(entry.summary), evidence: sanitizeCachedValue(entry.evidence) };
  return cloneJson(copy);
}

function cloneGraphHandle(handle, options = {}) {
  const copy = { ...handle };
  if (options.includeValue !== true) delete copy.value;
  delete copy.loader;
  return cloneJson(copy);
}

function summarizeValue(value) {
  if (value == null) return null;
  if (typeof value === "string") return value.slice(0, 512);
  if (Array.isArray(value)) return { kind: "array", length: value.length };
  if (typeof value === "object") return { kind: "object", keys: Object.keys(value).filter((key) => !isSensitiveKey(key)).slice(0, 32) };
  return String(value);
}

function sanitizeCachedValue(value) {
  if (value == null) return value;
  if (typeof value === "string") return redactSensitive(value.slice(0, 4000));
  if (Array.isArray(value)) return value.slice(0, 64).map(sanitizeCachedValue);
  if (typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value).slice(0, 64)) {
      if (isSensitiveKey(key)) continue;
      out[key] = sanitizeCachedValue(entry);
    }
    return out;
  }
  return value;
}

function isSensitiveKey(key) {
  return /prompt|credential|secret|token|api[-_]?key|password|reasoning/i.test(key);
}

function sanitizeConfiguration(configuration) {
  const copy = { ...configuration };
  delete copy.credentials;
  delete copy.providerCredentials;
  delete copy.prompts;
  return copy;
}

function redactSensitive(value) {
  return value.replace(/(api[-_]?key|token|password|secret)=([^&\s]+)/gi, "$1=[redacted]");
}

async function maybeRuntimeCommand(runtime, commandId, input) {
  try {
    return await runtime.executeCommand(commandId, input);
  } catch (error) {
    return { status: "UNAVAILABLE", commandId, error: error.message };
  }
}

function componentAvailable(runtime, method) {
  return Boolean(runtime && typeof runtime[method] === "function" && runtime[method]());
}

function domainScore(ok, okSummary, issue, degradedScore = 70) {
  return { score: ok ? 100 : degradedScore, status: ok ? "HEALTHY" : "DEGRADED", summary: ok ? okSummary : issue };
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) counts[item[key] || "unknown"] = (counts[item[key] || "unknown"] || 0) + 1;
  return counts;
}

function hitRate(stats) {
  const total = stats.cacheHits + stats.cacheMisses;
  return total === 0 ? 0 : Number((stats.cacheHits / total).toFixed(4));
}

function sum(items, getter) {
  return safeArray(items).reduce((total, item) => total + Number(getter(item) || 0), 0);
}

function intersects(left, right) {
  const rightSet = new Set(safeArray(right));
  return safeArray(left).some((item) => rightSet.has(item));
}

function safeArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function estimateBytes(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value == null ? "" : value), "utf8");
  } catch (error) {
    return 1024;
  }
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function nextId(prefix, seed) {
  return `${prefix}-${hashValue(seed).slice(0, 16)}`;
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

module.exports = {
  BenchmarkScenarios,
  CacheEntryTypes,
  DEFAULT_CONFIGURATION,
  FileRepositoryPerformancePersistenceAdapter,
  InvalidationScopes,
  MemoryRepositoryPerformancePersistenceAdapter,
  PerformanceEngineStates,
  PerformanceEventTypes,
  REPOSITORY_PERFORMANCE_SCHEMA_VERSION,
  RepositoryChangeTypes,
  RepositoryPerformanceEngine,
  normalizeConfiguration,
};
