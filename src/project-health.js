const { summarizeProject } = require("./project-summary");
const { scanRepository } = require("./repository-scanner");

const HEALTHY = "HEALTHY";
const ATTENTION = "ATTENTION";
const BLOCKED = "BLOCKED";
const UNKNOWN = "UNKNOWN";
const STATUSES = new Set([HEALTHY, ATTENTION, BLOCKED, UNKNOWN]);
const SAFE_CONFIDENCE_STATES = new Set(["APPROVED", "VERIFIED"]);
const SECRET_KEY_PATTERN = /(api[_-]?key|auth|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE_PATTERN = /\b(api[_-]?key|password|secret|token)\s*[:=]/i;
const SECRET_PATH_PATTERN = /(^|\/|[._-])(env|secret|credential|private[-_]?key|api[-_]?key|token)($|\/|[._-])/i;
const GENERATED_PATH_PATTERN = /(^|\/)(coverage|dist|build|out|generated|\.next)($|\/)|(^|\/).*\.min\.[a-z0-9]+$/i;
const DEPENDENCY_PATH_PATTERN = /(^|\/)(node_modules|vendor)($|\/)/i;
const BINARY_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|exe|dll|so|dylib|bin|wasm)$/i;

function collectProjectHealthSignals(options = {}) {
  validateOptions(options);

  const projectId = stringOrUnknown(options.projectId || "default");
  const scanResult = resolveScanResult(options);
  const projectSummary = resolveProjectSummary(options, scanResult);
  const state = isPlainObject(options.state) ? options.state : {};
  const memoryRecords = safeMemoryRecords(options.memoryRecords || []);
  const context = isPlainObject(options.context) ? options.context : null;
  const signals = [
    repositoryScanSignal(scanResult, projectSummary),
    parseFailureSignal(projectSummary),
    languageSignal(projectSummary),
    frameworkSignal(projectSummary),
    dependencySignal(projectSummary),
    entryPointSignal(projectSummary),
    validationCommandSignal(options.taskPlan || state.plan),
    latestValidationSignal(options.latestValidation || state.validation),
    providerReadinessSignal(options.readinessReport || state.readiness),
    providerHealthSignal(options.providerHealth),
    fallbackSignal(options.fallbackDiagnostics),
    costDecisionSignal(options.costDecision || state.costDecision || state.plan && state.plan.budgetState),
    restorePointSignal(options.restorePoint || state.restorePoint || state.patch && state.patch.restorePoint),
    projectKnowledgeSignal(memoryRecords, projectId),
    durableDecisionSignal(memoryRecords, projectId),
    structuralIndexSignal(projectSummary),
    contextBudgetSignal(context || options.contextPreview),
    contextCacheSignal(context),
    knownFailuresSignal(options.knownFailures || state.knownFailures || state.report && state.report.knownFailures, state),
    unknownEvidenceSignal(projectSummary, context),
  ];

  return {
    status: overallStatus(signals),
    projectId,
    repositoryRoot: repositoryRootFrom(options, scanResult, projectSummary),
    signals: signals.map(normalizeSignal).sort(compareSignals),
  };
}

function summarizeProjectHealth(input = {}) {
  validateSummaryInput(input);

  const signals = normalizeSummarySignals(
    input.signals || input.healthSignals || input.report && input.report.signals,
  );
  const statusCounts = countSignalStatuses(signals);
  const overall = summaryOverallStatus(signals);
  const issues = highestSeverityIssues(signals);
  const timestamp = latestSignalTimestamp(signals);
  const summary = {
    overallStatus: overall,
    summary: summaryText(overall, statusCounts),
    signalCounts: statusCounts,
    groups: summaryGroups(signals),
    highestSeverityIssues: issues,
    readyToWork: overall === HEALTHY,
    evidenceReferences: evidenceReferencesFor(issues.length > 0 ? issues : signals),
    repositoryRoot: stringOrUnknown(input.repositoryRoot || input.report && input.report.repositoryRoot),
    projectId: stringOrUnknown(input.projectId || input.report && input.report.projectId),
  };

  if (timestamp !== UNKNOWN) {
    summary.timestamp = timestamp;
  }

  return summary;
}

function recommendProjectHealth(input = {}) {
  validateSummaryInput(input);

  const signals = normalizeSummarySignals(
    input.signals ||
      input.healthSignals ||
      input.report && input.report.signals ||
      input.summary && input.summary.highestSeverityIssues,
  );
  const issueSignals = signals
    .filter((entry) => entry.status === BLOCKED || entry.status === ATTENTION || entry.status === UNKNOWN)
    .sort(compareIssueSignals);

  return {
    projectId: stringOrUnknown(input.projectId || input.report && input.report.projectId || input.summary && input.summary.projectId),
    repositoryRoot: stringOrUnknown(
      input.repositoryRoot || input.report && input.report.repositoryRoot || input.summary && input.summary.repositoryRoot,
    ),
    recommendations: groupedRecommendations(issueSignals),
  };
}

function resolveScanResult(options) {
  if (isPlainObject(options.scanResult)) {
    return options.scanResult;
  }

  if (typeof options.repositoryPath === "string" && options.repositoryPath.trim() !== "") {
    return scanRepository(options.repositoryPath);
  }

  return null;
}

function resolveProjectSummary(options, scanResult) {
  if (isPlainObject(options.projectSummary)) {
    return options.projectSummary;
  }

  if (scanResult) {
    return summarizeProject(scanResult);
  }

  return null;
}

function repositoryScanSignal(scanResult, projectSummary) {
  if (!scanResult && !projectSummary) {
    return signal({
      category: "repository",
      name: "scan-status",
      status: UNKNOWN,
      label: "Repository scan",
      detail: "Repository scan evidence is UNKNOWN.",
      evidence: unknownEvidence("repository scan result"),
    });
  }

  const files = Array.isArray((projectSummary || scanResult).files) ? (projectSummary || scanResult).files.length : UNKNOWN;
  const skipped = Array.isArray((projectSummary || scanResult).skipped) ? (projectSummary || scanResult).skipped.length : 0;

  return signal({
    category: "repository",
    name: "scan-status",
    status: HEALTHY,
    label: "Repository scan",
    detail: `Repository scan completed with ${files} supported file(s).`,
    evidence: [{ source: "repository-scanner", signal: `files=${files}; skipped=${skipped}` }],
  });
}

function parseFailureSignal(projectSummary) {
  const parseFailures = structuralIndex(projectSummary).parseFailures;

  if (!Array.isArray(parseFailures)) {
    return signal({
      category: "repository",
      name: "parse-failures",
      status: UNKNOWN,
      label: "Parse failures",
      detail: "Parse failure evidence is UNKNOWN.",
      evidence: unknownEvidence("structural index parse failures"),
    });
  }

  if (parseFailures.length > 0) {
    return signal({
      category: "repository",
      name: "parse-failures",
      status: ATTENTION,
      label: "Parse failures",
      detail: `${parseFailures.length} file(s) could not be structurally indexed.`,
      evidence: parseFailures.map((failure) => evidenceFromPath(failure.path, failure.reason)),
    });
  }

  return signal({
    category: "repository",
    name: "parse-failures",
    status: HEALTHY,
    label: "Parse failures",
    detail: "No structural parse failures were reported.",
    evidence: [{ source: "structural-index", signal: "parseFailures=0" }],
  });
}

function languageSignal(projectSummary) {
  return summaryCollectionSignal({
    projectSummary,
    category: "repository",
    name: "languages",
    label: "Detected languages",
    value: projectSummary && projectSummary.languages,
    healthyDetail: (count) => `${count} language signal(s) found.`,
    unknownDetail: "Detected language evidence is UNKNOWN.",
  });
}

function frameworkSignal(projectSummary) {
  return summaryCollectionSignal({
    projectSummary,
    category: "repository",
    name: "frameworks",
    label: "Detected frameworks",
    value: projectSummary && projectSummary.frameworks,
    healthyDetail: (count) => `${count} framework signal(s) found.`,
    unknownDetail: "Framework evidence is UNKNOWN.",
  });
}

function dependencySignal(projectSummary) {
  return summaryCollectionSignal({
    projectSummary,
    category: "repository",
    name: "dependencies",
    label: "Dependency evidence",
    value: projectSummary && projectSummary.dependencies,
    healthyDetail: (count) => `${count} dependency manifest signal(s) found.`,
    unknownDetail: "Dependency evidence is UNKNOWN.",
  });
}

function entryPointSignal(projectSummary) {
  return summaryCollectionSignal({
    projectSummary,
    category: "repository",
    name: "entry-points",
    label: "Entry point evidence",
    value: projectSummary && projectSummary.entryPoints,
    healthyDetail: (count) => `${count} entry point signal(s) found.`,
    unknownDetail: "Entry point evidence is UNKNOWN.",
  });
}

function summaryCollectionSignal(input) {
  if (!input.projectSummary || input.value === UNKNOWN || input.value === undefined || input.value === null) {
    return signal({
      category: input.category,
      name: input.name,
      status: UNKNOWN,
      label: input.label,
      detail: input.unknownDetail,
      evidence: unknownEvidence(input.name),
    });
  }

  const values = Array.isArray(input.value) ? input.value : [input.value];
  const evidence = values.flatMap(extractEvidence).sort(compareEvidence);

  if (values.length === 0 || evidence.length === 0) {
    return signal({
      category: input.category,
      name: input.name,
      status: UNKNOWN,
      label: input.label,
      detail: input.unknownDetail,
      evidence: unknownEvidence(input.name),
    });
  }

  return signal({
    category: input.category,
    name: input.name,
    status: HEALTHY,
    label: input.label,
    detail: input.healthyDetail(values.length),
    evidence,
  });
}

function validationCommandSignal(taskPlan) {
  if (!isPlainObject(taskPlan) || !Array.isArray(taskPlan.validationCommands)) {
    return signal({
      category: "validation",
      name: "validation-command-availability",
      status: UNKNOWN,
      label: "Validation commands",
      detail: "Validation command evidence is UNKNOWN.",
      evidence: unknownEvidence("task plan validationCommands"),
    });
  }

  const commands = taskPlan.validationCommands.filter((command) => typeof command === "string" && command.trim() !== "" && command !== UNKNOWN);

  if (commands.length === 0) {
    return signal({
      category: "validation",
      name: "validation-command-availability",
      status: ATTENTION,
      label: "Validation commands",
      detail: "No usable validation commands are present in the task plan.",
      evidence: [{ source: "task-plan", signal: "validationCommands=0" }],
    });
  }

  return signal({
    category: "validation",
    name: "validation-command-availability",
    status: HEALTHY,
    label: "Validation commands",
    detail: `${commands.length} validation command(s) are available from the task plan.`,
    evidence: commands.map((command) => ({ source: "task-plan", signal: sanitizeText(command) })),
  });
}

function latestValidationSignal(validation) {
  if (!isPlainObject(validation) || typeof validation.status !== "string") {
    return signal({
      category: "validation",
      name: "latest-validation-status",
      status: UNKNOWN,
      label: "Latest validation",
      detail: "Latest validation status is UNKNOWN.",
      evidence: unknownEvidence("validation state"),
    });
  }

  const failedResults = Array.isArray(validation.results)
    ? validation.results.filter((result) => result && result.exitCode !== 0)
    : [];
  const status = validation.status === "COMPLETED" ? HEALTHY : BLOCKED;

  return signal({
    category: "validation",
    name: "latest-validation-status",
    status,
    label: "Latest validation",
    detail: status === HEALTHY ? "Latest validation completed successfully." : "Latest validation did not complete successfully.",
    evidence: validationEvidence(validation, failedResults),
  });
}

function providerReadinessSignal(readiness) {
  if (!isPlainObject(readiness) || typeof readiness.overallReadiness !== "string") {
    return signal({
      category: "provider",
      name: "provider-readiness",
      status: UNKNOWN,
      label: "Provider readiness",
      detail: "Provider readiness evidence is UNKNOWN.",
      evidence: unknownEvidence("local readiness report"),
    });
  }

  const status = readiness.overallReadiness === "READY"
    ? HEALTHY
    : readiness.overallReadiness === "NOT_READY"
      ? BLOCKED
      : readiness.overallReadiness === "PARTIAL"
        ? ATTENTION
        : UNKNOWN;

  return signal({
    category: "provider",
    name: "provider-readiness",
    status,
    label: "Provider readiness",
    detail: `Provider readiness is ${readiness.overallReadiness}.`,
    evidence: [
      {
        source: "local-readiness-check",
        signal: `overallReadiness=${stringOrUnknown(readiness.overallReadiness)}`,
      },
      {
        source: "local-readiness-check",
        signal: `registeredProviders=${registeredProviderCount(readiness)}`,
      },
    ],
  });
}

function providerHealthSignal(providerHealth) {
  if (!isPlainObject(providerHealth) || !Array.isArray(providerHealth.providers)) {
    return signal({
      category: "provider",
      name: "provider-health",
      status: UNKNOWN,
      label: "Provider health",
      detail: "Provider health evidence is UNKNOWN.",
      evidence: unknownEvidence("provider health report"),
    });
  }

  const providers = providerHealth.providers;
  const unhealthy = providers.filter((provider) => provider.healthStatus === "UNAVAILABLE");
  const degraded = providers.filter((provider) => provider.healthStatus === "DEGRADED");
  const unknown = providers.filter((provider) => provider.healthStatus === UNKNOWN);
  const status = unhealthy.length > 0 ? BLOCKED : degraded.length > 0 ? ATTENTION : unknown.length > 0 ? UNKNOWN : HEALTHY;

  return signal({
    category: "provider",
    name: "provider-health",
    status,
    label: "Provider health",
    detail: providerHealthDetail(providers, unhealthy, degraded, unknown),
    evidence: providers.map((provider) => ({
      source: "provider-health",
      signal: `${stringOrUnknown(provider.providerName)} ${stringOrUnknown(provider.healthStatus)} ${stringOrUnknown(provider.reason)}`,
    })),
    timestamp: providerHealth.checkedAt,
  });
}

function fallbackSignal(diagnostics) {
  if (!isPlainObject(diagnostics)) {
    return signal({
      category: "provider",
      name: "fallback-availability",
      status: UNKNOWN,
      label: "Fallback availability",
      detail: "Fallback availability evidence is UNKNOWN.",
      evidence: unknownEvidence("fallback diagnostics"),
    });
  }

  const status = diagnostics.fallbackExecutionAvailable === true
    ? HEALTHY
    : diagnostics.fallbackExecutionStatus === "NO_FALLBACK"
      ? ATTENTION
      : diagnostics.fallbackExecutionStatus === "UNAVAILABLE"
        ? BLOCKED
        : UNKNOWN;

  return signal({
    category: "provider",
    name: "fallback-availability",
    status,
    label: "Fallback availability",
    detail: stringOrUnknown(diagnostics.reason),
    evidence: [{ source: "provider-health", signal: `fallbackStatus=${stringOrUnknown(diagnostics.fallbackExecutionStatus)}` }],
    timestamp: diagnostics.checkedAt,
  });
}

function costDecisionSignal(costDecision) {
  if (!isPlainObject(costDecision) || typeof costDecision.status !== "string") {
    return signal({
      category: "cost",
      name: "cost-decision-readiness",
      status: UNKNOWN,
      label: "Cost decision",
      detail: "Cost decision evidence is UNKNOWN.",
      evidence: unknownEvidence("cost decision"),
    });
  }

  const status = costDecision.status === "ALLOWED" ? HEALTHY : costDecision.status === "BLOCKED" ? BLOCKED : ATTENTION;

  return signal({
    category: "cost",
    name: "cost-decision-readiness",
    status,
    label: "Cost decision",
    detail: stringOrUnknown(costDecision.reason),
    evidence: [
      { source: "budget-guardrails", signal: `status=${stringOrUnknown(costDecision.status)}` },
      { source: "budget-guardrails", signal: `costClass=${stringOrUnknown(costDecision.costClass)}` },
    ],
  });
}

function restorePointSignal(restorePoint) {
  if (!isPlainObject(restorePoint)) {
    return signal({
      category: "restore",
      name: "restore-point-readiness",
      status: UNKNOWN,
      label: "Restore point",
      detail: "Restore point evidence is UNKNOWN.",
      evidence: unknownEvidence("restore point"),
    });
  }

  const metadata = isPlainObject(restorePoint.metadata) ? restorePoint.metadata : {};
  const status = restorePoint.status === "CREATED" || restorePoint.status === "AVAILABLE" ? HEALTHY : ATTENTION;

  return signal({
    category: "restore",
    name: "restore-point-readiness",
    status,
    label: "Restore point",
    detail: status === HEALTHY ? "A Levi restore point is available." : "Restore point state requires attention.",
    evidence: [
      { source: "restore-points", signal: `status=${stringOrUnknown(restorePoint.status)}` },
      { source: "restore-points", signal: `operationTypes=${listString(metadata.operationTypes)}` },
    ],
    timestamp: metadata.timestamp,
  });
}

function projectKnowledgeSignal(memoryRecords, projectId) {
  const records = filteredControlRecords(memoryRecords, projectId, "project-fact");

  if (records.length === 0) {
    return signal({
      category: "knowledge",
      name: "project-knowledge-availability",
      status: UNKNOWN,
      label: "Project Knowledge",
      detail: "No approved or verified Project Knowledge records are available.",
      evidence: unknownEvidence("project knowledge memory records"),
    });
  }

  return signal({
    category: "knowledge",
    name: "project-knowledge-availability",
    status: HEALTHY,
    label: "Project Knowledge",
    detail: `${records.length} approved or verified Project Knowledge record(s) are available.`,
    evidence: records.map(memoryEvidence),
    timestamp: latestTimestamp(records),
  });
}

function durableDecisionSignal(memoryRecords, projectId) {
  const records = filteredControlRecords(memoryRecords, projectId, "approved-decision");

  if (records.length === 0) {
    return signal({
      category: "knowledge",
      name: "durable-decision-availability",
      status: UNKNOWN,
      label: "Durable Decisions",
      detail: "No approved Durable Project Decision records are available.",
      evidence: unknownEvidence("durable decision memory records"),
    });
  }

  return signal({
    category: "knowledge",
    name: "durable-decision-availability",
    status: HEALTHY,
    label: "Durable Decisions",
    detail: `${records.length} approved Durable Project Decision record(s) are available.`,
    evidence: records.map(memoryEvidence),
    timestamp: latestTimestamp(records),
  });
}

function structuralIndexSignal(projectSummary) {
  const index = structuralIndex(projectSummary);

  if (!Array.isArray(index.symbols)) {
    return signal({
      category: "structure",
      name: "structural-index-availability",
      status: UNKNOWN,
      label: "Structural index",
      detail: "Structural index evidence is UNKNOWN.",
      evidence: unknownEvidence("structural index"),
    });
  }

  if (index.status === UNKNOWN || index.symbols.length === 0) {
    return signal({
      category: "structure",
      name: "structural-index-availability",
      status: UNKNOWN,
      label: "Structural index",
      detail: "No structural symbols are available.",
      evidence: [{ source: "structural-index", signal: "symbols=0" }],
    });
  }

  return signal({
    category: "structure",
    name: "structural-index-availability",
    status: HEALTHY,
    label: "Structural index",
    detail: `${index.symbols.length} structural symbol(s) are available.`,
    evidence: [{ source: "structural-index", signal: `symbols=${index.symbols.length}; relationships=${relationshipCount(index)}` }],
  });
}

function contextBudgetSignal(context) {
  const budget = isPlainObject(context) && isPlainObject(context.contextBudget) ? context.contextBudget : null;

  if (!budget) {
    return signal({
      category: "context",
      name: "context-budget-status",
      status: UNKNOWN,
      label: "Context budget",
      detail: "Context budget evidence is UNKNOWN.",
      evidence: unknownEvidence("context budget"),
    });
  }

  const budgetStatus = stringOrUnknown(budget.budgetStatus);
  const status = budgetStatus === "WITHIN_BUDGET" ? HEALTHY : budgetStatus === "OVER_BUDGET" ? BLOCKED : budgetStatus === "NEAR_LIMIT" ? ATTENTION : UNKNOWN;

  return signal({
    category: "context",
    name: "context-budget-status",
    status,
    label: "Context budget",
    detail: budget.reason || `Context budget status is ${budgetStatus}.`,
    evidence: [
      { source: "context-budget", signal: `budgetStatus=${budgetStatus}` },
      { source: "context-budget", signal: `totalEstimatedTokens=${stringOrUnknown(budget.totalEstimatedTokens)}` },
    ],
  });
}

function contextCacheSignal(context) {
  const cache = isPlainObject(context) && isPlainObject(context.contextCache) ? context.contextCache : null;

  if (!cache) {
    return signal({
      category: "context",
      name: "context-cache-status",
      status: UNKNOWN,
      label: "Context cache",
      detail: "Context cache evidence is UNKNOWN.",
      evidence: unknownEvidence("context cache"),
    });
  }

  return signal({
    category: "context",
    name: "context-cache-status",
    status: cache.cacheHit === true || cache.cacheMiss === true ? HEALTHY : UNKNOWN,
    label: "Context cache",
    detail: stringOrUnknown(cache.cacheReason),
    evidence: [{ source: "context-cache", signal: `cacheHit=${Boolean(cache.cacheHit)}; cacheMiss=${Boolean(cache.cacheMiss)}` }],
    timestamp: cache.cacheTimestamp,
  });
}

function knownFailuresSignal(knownFailures, state) {
  const failures = normalizeKnownFailures(knownFailures, state);

  if (failures.length === 0) {
    return signal({
      category: "problems",
      name: "known-failures",
      status: HEALTHY,
      label: "Known failures",
      detail: "No known failures are recorded.",
      evidence: [{ source: "task-state", signal: "knownFailures=0" }],
    });
  }

  return signal({
    category: "problems",
    name: "known-failures",
    status: BLOCKED,
    label: "Known failures",
    detail: `${failures.length} known failure(s) are recorded.`,
    evidence: failures.map((failure) => ({ source: "task-state", signal: sanitizeText(failure) })),
  });
}

function unknownEvidenceSignal(projectSummary, context) {
  const unknowns = [];

  for (const [name, value] of Object.entries({
    languages: projectSummary && projectSummary.languages,
    frameworks: projectSummary && projectSummary.frameworks,
    dependencies: projectSummary && projectSummary.dependencies,
    entryPoints: projectSummary && projectSummary.entryPoints,
    contextBudget: context && context.contextBudget,
    contextCache: context && context.contextCache,
  })) {
    if (value === UNKNOWN || value === undefined || value === null) {
      unknowns.push(name);
    }
  }

  return signal({
    category: "unknown",
    name: "unknown-signals",
    status: unknowns.length === 0 ? HEALTHY : UNKNOWN,
    label: "UNKNOWN signals",
    detail: unknowns.length === 0 ? "No core UNKNOWN health signals were found." : `${unknowns.length} health signal(s) are UNKNOWN.`,
    evidence: unknowns.length === 0
      ? [{ source: "project-health", signal: "unknownSignals=0" }]
      : unknowns.map((name) => ({ source: "project-health", signal: `${name}=UNKNOWN` })),
  });
}

function normalizeSignal(input) {
  const status = STATUSES.has(input.status) ? input.status : UNKNOWN;
  const normalized = {
    signalId: normalizeSignalId(input),
    category: stringOrUnknown(input.category),
    status,
    label: stringOrUnknown(input.label),
    detail: stringOrUnknown(input.detail),
    evidence: normalizeEvidence(input.evidence),
    severity: severityFor(status),
  };
  const timestamp = normalizeTimestamp(input.timestamp);

  if (timestamp !== UNKNOWN) {
    normalized.timestamp = timestamp;
  }

  return normalized;
}

function normalizeSignalId(input) {
  const existing = stringOrUnknown(input.signalId);

  if (existing !== UNKNOWN) {
    return existing.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  }

  return `health-${input.category}-${input.name}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

function normalizeSummarySignals(signals) {
  if (!Array.isArray(signals)) {
    return [];
  }

  return signals
    .filter(isPlainObject)
    .map((entry) => normalizeSignal({
      signalId: entry.signalId,
      category: entry.category,
      name: entry.name || entry.label,
      status: entry.status,
      label: entry.label,
      detail: entry.detail,
      evidence: entry.evidence,
      timestamp: entry.timestamp,
    }))
    .sort(compareSignals);
}

function countSignalStatuses(signals) {
  const counts = {
    HEALTHY: 0,
    ATTENTION: 0,
    BLOCKED: 0,
    UNKNOWN: 0,
  };

  for (const entry of signals) {
    const status = STATUSES.has(entry.status) ? entry.status : UNKNOWN;
    counts[status] += 1;
  }

  return counts;
}

function summaryOverallStatus(signals) {
  const counts = countSignalStatuses(signals);

  if (counts.BLOCKED > 0) {
    return BLOCKED;
  }

  if (counts.ATTENTION > 0) {
    return ATTENTION;
  }

  if (counts.UNKNOWN > 0 || signals.length === 0) {
    return UNKNOWN;
  }

  return HEALTHY;
}

function highestSeverityIssues(signals) {
  const blockers = signals.filter((entry) => entry.status === BLOCKED).sort(compareIssueSignals);
  const warnings = signals.filter((entry) => entry.status === ATTENTION).sort(compareIssueSignals);
  const unknowns = signals.filter((entry) => entry.status === UNKNOWN).sort(compareIssueSignals);

  if (blockers.length > 0) {
    return blockers.map(issueSummary);
  }

  if (warnings.length > 0) {
    return warnings.map(issueSummary);
  }

  if (unknowns.length > 0) {
    return unknowns.map(issueSummary);
  }

  return [];
}

function summaryGroups(signals) {
  return {
    blockers: signals.filter((entry) => entry.status === BLOCKED).map(signalReference),
    warnings: signals.filter((entry) => entry.status === ATTENTION).map(signalReference),
    unknown: signals.filter((entry) => entry.status === UNKNOWN).map(signalReference),
    healthy: signals.filter((entry) => entry.status === HEALTHY).map(signalReference),
    approvedKnowledge: signals
      .filter((entry) => entry.category === "knowledge" && entry.status === HEALTHY)
      .map(signalReference),
  };
}

function signalReference(signalEntry) {
  return {
    signalId: signalEntry.signalId,
    category: signalEntry.category,
    status: signalEntry.status,
    label: signalEntry.label,
  };
}

function issueSummary(signalEntry) {
  const issue = {
    signalId: signalEntry.signalId,
    category: signalEntry.category,
    status: signalEntry.status,
    severity: signalEntry.severity,
    label: signalEntry.label,
    detail: signalEntry.detail,
    evidence: signalEntry.evidence,
  };

  if (signalEntry.timestamp) {
    issue.timestamp = signalEntry.timestamp;
  }

  return issue;
}

function evidenceReferencesFor(signals) {
  return signals
    .flatMap((signalEntry) => signalEntry.evidence.map((evidence) => ({
      signalId: signalEntry.signalId,
      label: signalEntry.label,
      source: evidence.source,
      signal: evidence.signal,
    })))
    .filter((entry) => entry.source !== UNKNOWN || entry.signal !== UNKNOWN)
    .sort(compareEvidenceReferences)
    .slice(0, 12);
}

function summaryText(status, counts) {
  if (status === BLOCKED) {
    return `${counts.BLOCKED} blocker(s) need attention before work can proceed.`;
  }

  if (status === ATTENTION) {
    return `${counts.ATTENTION} warning signal(s) need review.`;
  }

  if (status === UNKNOWN) {
    if (counts.UNKNOWN === 0) {
      return "Project health signals are UNKNOWN.";
    }

    return `${counts.UNKNOWN} signal(s) are UNKNOWN.`;
  }

  return "Project health signals are healthy.";
}

function latestSignalTimestamp(signals) {
  const timestamps = signals
    .map((entry) => normalizeTimestamp(entry.timestamp))
    .filter((timestamp) => timestamp !== UNKNOWN)
    .sort();

  return timestamps.length > 0 ? timestamps[timestamps.length - 1] : UNKNOWN;
}

function groupedRecommendations(signals) {
  const groups = new Map();

  for (const signalEntry of signals) {
    const priority = recommendationPriority(signalEntry.status);
    const key = `${priority}:${signalEntry.status}:${signalEntry.category}`;
    const group = groups.get(key) || {
      priority,
      status: signalEntry.status,
      category: signalEntry.category,
      signals: [],
    };

    group.signals.push(signalEntry);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map(recommendationForGroup)
    .sort(compareRecommendations);
}

function recommendationForGroup(group) {
  const supportingSignals = uniqueSorted(group.signals.map((entry) => entry.signalId));
  const category = plainCategory(group.category);
  const recommendationId = recommendationIdFor(group.priority, group.status, group.category);

  return {
    recommendationId,
    priority: group.priority,
    category: group.category,
    action: recommendationAction(group.status, category),
    reason: recommendationReason(group.status, group.signals, category),
    supportingSignalIds: supportingSignals,
    evidenceReferences: recommendationEvidence(group.signals),
  };
}

function recommendationPriority(status) {
  if (status === BLOCKED) {
    return "HIGH";
  }

  if (status === ATTENTION) {
    return "MEDIUM";
  }

  return "LOW";
}

function recommendationAction(status, category) {
  if (status === BLOCKED) {
    return `Resolve ${category} blocker.`;
  }

  if (status === ATTENTION) {
    return `Review ${category} warning.`;
  }

  return `Gather evidence for ${category}.`;
}

function recommendationReason(status, signals, category) {
  const count = signals.length;
  const labels = uniqueSorted(signals.map((entry) => entry.label)).slice(0, 3).join(", ");

  if (status === BLOCKED) {
    return `${count} ${category} blocker signal(s): ${labels}.`;
  }

  if (status === ATTENTION) {
    return `${count} ${category} warning signal(s): ${labels}.`;
  }

  return `${count} ${category} signal(s) have UNKNOWN evidence: ${labels}.`;
}

function recommendationEvidence(signals) {
  return signals
    .flatMap((signalEntry) => signalEntry.evidence.map((evidence) => ({
      signalId: signalEntry.signalId,
      source: evidence.source,
      signal: evidence.signal,
    })))
    .filter(isSafeEvidenceReference)
    .sort(compareRecommendationEvidence)
    .filter(uniqueEvidenceReference)
    .slice(0, 12);
}

function isSafeEvidenceReference(reference) {
  return (
    isSafeEvidenceValue(reference.source) &&
    isSafeEvidenceValue(reference.signal) &&
    (reference.source !== UNKNOWN || reference.signal !== UNKNOWN)
  );
}

function isSafeEvidenceValue(value) {
  const normalized = stringOrUnknown(value).replace(/\\/g, "/");

  if (normalized === UNKNOWN) {
    return true;
  }

  return (
    !SECRET_KEY_PATTERN.test(normalized) &&
    !SECRET_VALUE_PATTERN.test(normalized) &&
    !SECRET_PATH_PATTERN.test(normalized) &&
    !GENERATED_PATH_PATTERN.test(normalized) &&
    !DEPENDENCY_PATH_PATTERN.test(normalized) &&
    !BINARY_EXTENSION_PATTERN.test(normalized) &&
    !/(^|\/)\.levi($|\/)/i.test(normalized)
  );
}

function uniqueEvidenceReference(reference, index, references) {
  return references.findIndex((entry) =>
    entry.signalId === reference.signalId &&
      entry.source === reference.source &&
      entry.signal === reference.signal,
  ) === index;
}

function recommendationIdFor(priority, status, category) {
  return `health-rec-${slug(priority)}-${slug(status)}-${slug(category)}`;
}

function plainCategory(category) {
  return stringOrUnknown(category).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() || "project health";
}

function slug(value) {
  return stringOrUnknown(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function signal(input) {
  return input;
}

function structuralIndex(projectSummary) {
  return isPlainObject(projectSummary) && isPlainObject(projectSummary.structuralIndex)
    ? projectSummary.structuralIndex
    : {};
}

function validationEvidence(validation, failedResults) {
  if (!Array.isArray(validation.results) || validation.results.length === 0) {
    return [{ source: "validation-runner", signal: `status=${stringOrUnknown(validation.status)}` }];
  }

  const results = failedResults.length > 0 ? failedResults : validation.results;
  return results.map((result) => ({
    source: "validation-runner",
    signal: `${sanitizeText(result.command)} exitCode=${stringOrUnknown(result.exitCode)}`,
  }));
}

function registeredProviderCount(readiness) {
  const registered = readiness.providers && Array.isArray(readiness.providers.registered)
    ? readiness.providers.registered.length
    : UNKNOWN;
  return registered;
}

function providerHealthDetail(providers, unhealthy, degraded, unknown) {
  if (providers.length === 0) {
    return "No provider health records are available.";
  }

  if (unhealthy.length > 0) {
    return `${unhealthy.length} provider(s) are unavailable.`;
  }

  if (degraded.length > 0) {
    return `${degraded.length} provider(s) are degraded.`;
  }

  if (unknown.length > 0) {
    return `${unknown.length} provider(s) have UNKNOWN health.`;
  }

  return "All provider health records are healthy.";
}

function relationshipCount(index) {
  return Array.isArray(index.relationships) ? index.relationships.length : UNKNOWN;
}

function filteredControlRecords(records, projectId, type) {
  return records
    .filter((record) => {
      if (!isPlainObject(record) || record.type !== type) {
        return false;
      }

      if (record.projectId !== undefined && record.projectId !== projectId) {
        return false;
      }

      if (!SAFE_CONFIDENCE_STATES.has(record.confidenceState)) {
        return false;
      }

      if (record.source && record.source.kind === "model-output") {
        return false;
      }

      return !containsUnsafeValue(record);
    })
    .sort(compareRecords);
}

function safeMemoryRecords(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.filter((record) => isPlainObject(record) && !containsUnsafeValue(record)).sort(compareRecords);
}

function memoryEvidence(record) {
  return {
    source: "memory-store",
    signal: `${stringOrUnknown(record.type)} ${stringOrUnknown(record.confidenceState)} ${stringOrUnknown(record.id)}`,
  };
}

function latestTimestamp(records) {
  const timestamps = records
    .map((record) => normalizeTimestamp(record.timestamp))
    .filter((timestamp) => timestamp !== UNKNOWN)
    .sort();

  return timestamps.length > 0 ? timestamps[timestamps.length - 1] : UNKNOWN;
}

function normalizeKnownFailures(knownFailures, state) {
  const failures = [];

  if (Array.isArray(knownFailures)) {
    failures.push(...knownFailures.map(sanitizeText).filter((entry) => entry !== UNKNOWN));
  }

  if (isPlainObject(state) && isPlainObject(state.execution) && state.execution.status === "FAILED") {
    failures.push(sanitizeText(state.execution.error || "Execution failed."));
  }

  return uniqueSorted(failures);
}

function extractEvidence(value) {
  const evidence = [];
  collectEvidence(value, evidence);
  return evidence.filter((entry) => entry.source !== UNKNOWN).sort(compareEvidence);
}

function collectEvidence(value, evidence) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectEvidence(entry, evidence));
    return;
  }

  if (!isPlainObject(value)) {
    return;
  }

  if (typeof value.source === "string" && typeof value.signal === "string") {
    evidence.push({
      source: normalizeSource(value.source),
      signal: sanitizeText(value.signal),
    });
    return;
  }

  for (const child of Object.values(value)) {
    collectEvidence(child, evidence);
  }
}

function normalizeEvidence(evidence) {
  const values = Array.isArray(evidence) ? evidence : [];
  const normalized = values
    .map((entry) => {
      if (!isPlainObject(entry)) {
        return null;
      }

      const source = normalizeSource(entry.source);
      const signalText = sanitizeText(entry.signal);

      if (source === UNKNOWN && signalText === UNKNOWN) {
        return null;
      }

      return {
        source,
        signal: signalText,
      };
    })
    .filter(Boolean)
    .sort(compareEvidence);

  return normalized.length > 0 ? normalized : unknownEvidence("health signal");
}

function unknownEvidence(source) {
  return [{ source: sanitizeText(source), signal: UNKNOWN }];
}

function evidenceFromPath(filePath, signalText) {
  return {
    source: normalizeSource(filePath),
    signal: sanitizeText(signalText),
  };
}

function normalizeSource(source) {
  const text = sanitizeText(source);

  if (text === UNKNOWN) {
    return UNKNOWN;
  }

  const normalized = text.replace(/\\/g, "/");

  if (isUnsafePath(normalized)) {
    return UNKNOWN;
  }

  return normalized;
}

function containsUnsafeValue(value) {
  if (typeof value === "string") {
    return SECRET_VALUE_PATTERN.test(value) || isUnsafePath(value);
  }

  if (Array.isArray(value)) {
    return value.some(containsUnsafeValue);
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.entries(value).some(([key, child]) => SECRET_KEY_PATTERN.test(key) || containsUnsafeValue(child));
}

function isUnsafePath(value) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.replace(/\\/g, "/");
  return (
    normalized.split("/").filter(Boolean)[0] === ".levi" ||
    SECRET_PATH_PATTERN.test(normalized) ||
    GENERATED_PATH_PATTERN.test(normalized) ||
    DEPENDENCY_PATH_PATTERN.test(normalized) ||
    BINARY_EXTENSION_PATTERN.test(normalized)
  );
}

function repositoryRootFrom(options, scanResult, projectSummary) {
  return stringOrUnknown(
    options.repositoryPath ||
      scanResult && scanResult.root ||
      projectSummary && projectSummary.root,
  );
}

function overallStatus(signals) {
  const statuses = signals.map((entry) => entry.status);

  if (statuses.includes(BLOCKED)) {
    return BLOCKED;
  }

  if (statuses.includes(ATTENTION)) {
    return ATTENTION;
  }

  if (statuses.includes(UNKNOWN)) {
    return UNKNOWN;
  }

  return HEALTHY;
}

function severityFor(status) {
  if (status === HEALTHY) {
    return "INFO";
  }

  if (status === ATTENTION) {
    return "WARNING";
  }

  if (status === BLOCKED) {
    return "BLOCKER";
  }

  return UNKNOWN;
}

function compareSignals(left, right) {
  return left.category.localeCompare(right.category) || left.signalId.localeCompare(right.signalId);
}

function compareIssueSignals(left, right) {
  return statusPriority(left.status) - statusPriority(right.status) || compareSignals(left, right);
}

function compareRecommendations(left, right) {
  return (
    recommendationPriorityRank(left.priority) - recommendationPriorityRank(right.priority) ||
    left.category.localeCompare(right.category) ||
    left.recommendationId.localeCompare(right.recommendationId)
  );
}

function recommendationPriorityRank(priority) {
  if (priority === "HIGH") {
    return 0;
  }

  if (priority === "MEDIUM") {
    return 1;
  }

  return 2;
}

function statusPriority(status) {
  if (status === BLOCKED) {
    return 0;
  }

  if (status === ATTENTION) {
    return 1;
  }

  if (status === UNKNOWN) {
    return 2;
  }

  return 3;
}

function compareEvidence(left, right) {
  return `${left.source} ${left.signal}`.localeCompare(`${right.source} ${right.signal}`);
}

function compareEvidenceReferences(left, right) {
  return (
    left.signalId.localeCompare(right.signalId) ||
    left.source.localeCompare(right.source) ||
    left.signal.localeCompare(right.signal)
  );
}

function compareRecommendationEvidence(left, right) {
  return compareEvidenceReferences(left, right);
}

function compareRecords(left, right) {
  return (
    stringOrUnknown(left.type).localeCompare(stringOrUnknown(right.type)) ||
    stringOrUnknown(left.id).localeCompare(stringOrUnknown(right.id)) ||
    stringOrUnknown(left.timestamp).localeCompare(stringOrUnknown(right.timestamp))
  );
}

function normalizeTimestamp(timestamp) {
  if (typeof timestamp !== "string" || timestamp.trim() === "") {
    return UNKNOWN;
  }

  return Number.isNaN(Date.parse(timestamp)) ? UNKNOWN : timestamp.trim();
}

function listString(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return UNKNOWN;
  }

  return value.map(stringOrUnknown).filter((entry) => entry !== UNKNOWN).sort().join(", ");
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort();
}

function sanitizeText(value) {
  const text = stringOrUnknown(value);

  if (text === UNKNOWN || SECRET_VALUE_PATTERN.test(text)) {
    return UNKNOWN;
  }

  return text.replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[REDACTED]");
}

function stringOrUnknown(value) {
  if (value === undefined || value === null) {
    return UNKNOWN;
  }

  const text = String(value).trim();
  return text === "" ? UNKNOWN : text;
}

function validateOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Project health options are required.");
  }
}

function validateSummaryInput(input) {
  if (!isPlainObject(input)) {
    throw new Error("Project health summary input is required.");
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  ATTENTION,
  BLOCKED,
  HEALTHY,
  UNKNOWN,
  collectProjectHealthSignals,
  recommendProjectHealth,
  summarizeProjectHealth,
};
