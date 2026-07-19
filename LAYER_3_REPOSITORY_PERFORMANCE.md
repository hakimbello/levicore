# Layer 3 Repository Performance

## Scope

`src/repository-performance-engine.js` is the repository intelligence performance coordinator for Release 0.6. It improves scalability by tracking compact metadata around existing repository systems. It does not own repository truth and does not replace indexing, graph, context, planning, workflow, multi-agent, or provider engines.

## Coordinated Systems

- Incremental indexing: path/hash/timestamp/size snapshots detect created, modified, deleted, renamed, and unchanged files.
- Dependency invalidation: file changes invalidate the file, recursive dependents, and cache entries that reference affected paths.
- Lazy graph loading: graph handles store compact metadata and load values through `repository.graphQuery` when requested.
- Context reuse: cached context packages require matching workspace revision, graph/dependency version, plan id, token budget, and file set.
- Token reuse: summary reuse is keyed by workspace, summary kind, revision/version, budget, and file set.
- Memory budgeting: cache, graph, index, context, and token metadata are measured against bounded budgets.
- Cache policy: TTL, LRU, generation, workspace revision, dependency version, and explicit warming are supported.
- Safe parallelism: analysis lanes are bounded and dependency-aware; protected runtime behavior remains owned by approval/workspace systems.

## Runtime Commands

- `performance.health`: health domains, critical failures, and overall score.
- `performance.stats`: repository metrics, cache summary, memory usage, benchmark reference.
- `performance.cache`: `summary`, `get`, `put`, `clear`, and `warm`.
- `performance.invalidate`: explicit scoped invalidation.
- `performance.rebuild`: full or incremental graph/repository metadata rebuild coordination.
- `performance.benchmark`: deterministic benchmark scenarios.
- `performance.memory`: memory usage and optional budget enforcement.
- `performance.contextReuse`: store or reuse a context package.
- `performance.graph`: graph summary, lazy handle registration, node load, or edge query.

## VS Code Surface

The extension contributes a `levi.performance` TreeView and commands:

- `levi.showPerformance`
- `levi.clearCache`
- `levi.runBenchmark`
- `levi.rebuildRepositoryGraph`
- `levi.showMemoryUsage`

Settings include enablement, cache entry cap, memory budget, context entry cap, TTL, parallelism, summary persistence, and benchmark sample size.

## Persistence

Default storage is `.levi/repository-performance.json`. Persisted records are compact metadata only:

- schema/configuration
- stats
- workspace revisions
- dependency versions
- file hashes and dependency metadata
- cache metadata and summaries
- graph handle metadata
- benchmark summaries

The snapshot intentionally excludes source contents, raw prompts, credentials, authorization headers, provider private reasoning, complete model outputs, process handles, adapter instances, and unbounded context packages.

## Health Domains

Health reports these domains:

- cache
- indexing
- graph
- context reuse
- memory
- runtime
- workflow
- provider
- persistence

Critical failures are corrupted graph/cache poisoning, invalid dependency graph, and memory exhaustion.

## Benchmark Structure

Benchmark mode is deterministic and uses metadata counts instead of wall-clock sleeps. Scenarios:

- cold index
- warm index
- incremental index
- full rebuild
- graph query
- context reuse
- workflow create
- workflow resume
- provider reuse

Each scenario reports sample size, operations, estimated duration, throughput, cache reusability, and safe parallelism.

## Compatibility

The engine is optional. Runtime commands return an unconfigured result when the component is not registered. When enabled, it calls existing runtime commands rather than importing or replacing authoritative systems.

## Limitations

- It records metadata, not source-derived semantic truth.
- Benchmark numbers are deterministic estimates for regressions and scaling comparison, not host wall-clock timings.
- Lazy graph handles require existing repository graph commands for real graph content.
