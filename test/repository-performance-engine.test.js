const assert = require("node:assert/strict");
const test = require("node:test");

const {
  BenchmarkScenarios,
  CacheEntryTypes,
  InvalidationScopes,
  MemoryRepositoryPerformancePersistenceAdapter,
  PerformanceEngineStates,
  RepositoryChangeTypes,
  RepositoryPerformanceEngine,
  normalizeConfiguration,
} = require("../src/repository-performance-engine");
const { LeviApplicationRuntime } = require("../src/levi-application-runtime");

test("normalizes conservative performance configuration and reports health domains", () => {
  const config = normalizeConfiguration({ maximumCacheEntries: 0, maximumParallelism: 99 });
  assert.equal(config.maximumCacheEntries, 1);
  assert.equal(config.maximumParallelism, 32);

  const engine = new RepositoryPerformanceEngine({ persistenceAdapter: new MemoryRepositoryPerformancePersistenceAdapter() });
  const init = engine.initialize({ load: false });
  const health = engine.getHealth();

  assert.equal(init.status, PerformanceEngineStates.READY);
  assert.ok(health.score >= 0);
  for (const domain of ["cache", "indexing", "graph", "contextReuse", "memory", "runtime", "workflow", "provider", "persistence"]) {
    assert.ok(health.domains[domain], `Missing health domain ${domain}`);
  }
});

test("detects incremental created, modified, deleted, and renamed files deterministically", () => {
  const engine = new RepositoryPerformanceEngine({ persistenceAdapter: new MemoryRepositoryPerformancePersistenceAdapter() });
  engine.recordWorkspaceSnapshot("workspace-1", [
    { path: "src/a.js", hash: "hash-a", timestamp: 1, size: 10 },
    { path: "src/b.js", hash: "hash-b", timestamp: 1, size: 20 },
  ]);

  const detected = engine.detectChanges("workspace-1", [
    { path: "src/a.js", hash: "hash-a2", timestamp: 2, size: 11 },
    { path: "src/c.js", hash: "hash-c", timestamp: 1, size: 30 },
    { path: "src/renamed-b.js", hash: "hash-b", timestamp: 1, size: 20 },
  ]);
  const byPath = Object.fromEntries(detected.changes.map((change) => [change.path, change]));

  assert.equal(byPath["src/a.js"].type, RepositoryChangeTypes.MODIFIED);
  assert.equal(byPath["src/c.js"].type, RepositoryChangeTypes.CREATED);
  assert.equal(byPath["src/renamed-b.js"].type, RepositoryChangeTypes.RENAMED);
  assert.equal(byPath["src/renamed-b.js"].fromPath, "src/b.js");
});

test("invalidates dependency dependents without clearing unrelated cache entries", () => {
  const engine = new RepositoryPerformanceEngine({ persistenceAdapter: new MemoryRepositoryPerformancePersistenceAdapter() });
  engine.updateIndexForFile({ workspaceId: "workspace-1", path: "src/core.js", hash: "core", dependencies: [] });
  engine.updateIndexForFile({ workspaceId: "workspace-1", path: "src/feature.js", hash: "feature", dependencies: ["src/core.js"] });
  engine.updateIndexForFile({ workspaceId: "workspace-1", path: "src/unrelated.js", hash: "other", dependencies: [] });
  const affected = engine.putCache({ workspaceId: "workspace-1", key: "feature-context", paths: ["src/feature.js"], value: { summary: "feature" } });
  const unrelated = engine.putCache({ workspaceId: "workspace-1", key: "unrelated-context", paths: ["src/unrelated.js"], value: { summary: "unrelated" } });

  const invalidated = engine.invalidate({ workspaceId: "workspace-1", paths: ["src/core.js"], scope: InvalidationScopes.DEPENDENTS });

  assert.ok(invalidated.affectedPaths.includes("src/core.js"));
  assert.ok(invalidated.affectedPaths.includes("src/feature.js"));
  assert.ok(invalidated.affectedCacheIds.includes(affected.id));
  assert.equal(engine.getCache({ id: affected.id }).cacheHit, false);
  assert.equal(engine.getCache({ id: unrelated.id }).cacheHit, true);
});

test("supports lazy graph handles and context/token reuse with versioned keys", async () => {
  const engine = new RepositoryPerformanceEngine({ persistenceAdapter: new MemoryRepositoryPerformancePersistenceAdapter() });
  const handle = engine.registerGraphHandle({
    workspaceId: "workspace-1",
    key: "node-a",
    loader: () => ({ id: "node-a", neighbors: ["node-b"], prompt: "must not persist" }),
  });
  const loaded = await engine.loadGraphNode(handle.id);
  assert.equal(loaded.handle.value.id, "node-a");
  assert.equal(loaded.handle.value.prompt, undefined);

  engine.storeContextPackage({ workspaceId: "workspace-1", workspaceRevision: 1, dependencyVersion: 1, planId: "plan-1", tokenBudget: 2000, fileUris: ["src/a.js"], context: { files: ["src/a.js"] } });
  assert.equal(engine.reuseContext({ workspaceId: "workspace-1", workspaceRevision: 1, dependencyVersion: 1, planId: "plan-1", tokenBudget: 2000, fileUris: ["src/a.js"] }).reused, true);
  assert.equal(engine.reuseContext({ workspaceId: "workspace-1", workspaceRevision: 2, dependencyVersion: 1, planId: "plan-1", tokenBudget: 2000, fileUris: ["src/a.js"] }).reused, false);

  engine.storeTokenSummary({ workspaceId: "workspace-1", kind: "architecture", workspaceRevision: 1, dependencyVersion: 1, tokenBudget: 1000, summary: "summary" });
  assert.equal(engine.reuseTokenSummary({ workspaceId: "workspace-1", kind: "architecture", workspaceRevision: 1, dependencyVersion: 1, tokenBudget: 1000 }).reused, true);
});

test("enforces memory budgets with LRU eviction while preserving protected evidence", () => {
  const engine = new RepositoryPerformanceEngine({
    configuration: { maximumMemoryBytes: 1200, maximumCacheEntries: 3 },
    persistenceAdapter: new MemoryRepositoryPerformancePersistenceAdapter(),
  });
  const protectedEntry = engine.putCache({ type: CacheEntryTypes.VALIDATION_EVIDENCE, key: "validation", value: "x".repeat(900) });
  const oldEntry = engine.putCache({ key: "old", value: "y".repeat(900), ttlMs: 1 });
  engine.putCache({ key: "new", value: "z".repeat(900) });
  const enforced = engine.enforceMemoryBudget();

  assert.equal(engine.getCache({ id: oldEntry.id }).cacheHit, false);
  assert.equal(engine.getCache({ id: protectedEntry.id }).cacheHit, true);
});

test("runs deterministic benchmarks and exposes repository metrics", async () => {
  const engine = new RepositoryPerformanceEngine({ persistenceAdapter: new MemoryRepositoryPerformancePersistenceAdapter(), configuration: { benchmarkSampleSize: 4 } });
  engine.recordWorkspaceSnapshot("workspace-1", [
    { path: "src/a.js", hash: "a", timestamp: 1, size: 10 },
    { path: "src/b.js", hash: "b", timestamp: 1, size: 10, dependencies: ["src/a.js"] },
  ]);
  engine.putCache({ workspaceId: "workspace-1", key: "warm", value: { ok: true } });

  const benchmark = await engine.runBenchmark({ workspaceId: "workspace-1", scenario: BenchmarkScenarios.ALL });
  const stats = engine.getStats();

  assert.equal(benchmark.status, "BENCHMARKED");
  assert.ok(benchmark.benchmark.scenarios.length >= 8);
  assert.equal(stats.repository.indexedFiles, 2);
  assert.equal(stats.stats.benchmarksRun, 1);
});

test("persists metadata only and restores compact state", () => {
  const adapter = new MemoryRepositoryPerformancePersistenceAdapter();
  const engine = new RepositoryPerformanceEngine({ persistenceAdapter: adapter });
  engine.updateIndexForFile({ workspaceId: "workspace-1", path: "src/a.js", hash: "a" });
  engine.putCache({
    workspaceId: "workspace-1",
    key: "provider",
    value: { summary: "safe", prompt: "hide me", credential: "hide me", reasoning: "hide me" },
  });
  const saved = engine.save();
  const snapshotText = JSON.stringify(adapter.snapshot);

  assert.equal(saved.status, "PERSISTED");
  assert.equal(snapshotText.includes("hide me"), false);
  assert.equal(snapshotText.includes("prompt"), false);

  const restored = new RepositoryPerformanceEngine({ persistenceAdapter: adapter });
  assert.equal(restored.restore().status, "LOADED");
  assert.equal(restored.listIndexedFiles({ workspaceId: "workspace-1" }).length, 1);
});

test("integrates with LeviApplicationRuntime performance commands without replacing repository systems", async () => {
  const runtime = new LeviApplicationRuntime({
    enableRepositoryPerformance: true,
    performanceConfiguration: { persistenceEnabled: false },
    components: {
      RepositoryKnowledgeGraph: { findNodes: () => [{ id: "node" }], findEdges: () => [] },
      ContextIntelligenceEngine: { assemble: () => ({ context: "ok" }) },
    },
  });
  const commands = runtime.listCommands().map((command) => command.id);

  assert.ok(commands.includes("performance.health"));
  assert.ok(commands.includes("performance.benchmark"));
  assert.ok(runtime.performanceEngine());
  assert.equal((await runtime.executeCommand("performance.health", {})).success, true);
  assert.equal((await runtime.executeCommand("performance.cache", { action: "put", key: "runtime-cache", value: { ok: true } })).success, true);
  assert.equal((await runtime.executeCommand("performance.cache", { action: "get", key: "runtime-cache" })).data.cacheHit, true);
  assert.equal((await runtime.executeCommand("performance.rebuild", { workspaceId: "workspace-1", full: false })).success, true);
  assert.equal((await runtime.executeCommand("performance.benchmark", { workspaceId: "workspace-1", scenario: "all" })).data.status, "BENCHMARKED");
});
