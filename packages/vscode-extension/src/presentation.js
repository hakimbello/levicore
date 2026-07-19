const { UI_BOUNDS } = require("./constants");
const { safeText, serializeForExtension } = require("./safe-json");

function overviewModel(state) {
  const health = state.health || {};
  const workspace = state.workspace || {};
  return section("Levi Overview", [
    item("Runtime", health.runtimeState || state.runtimeState || "UNKNOWN", "runtime"),
    item("Health", numericText(health.overallRuntimeHealth), "health"),
    item("Certification", health.certificationState && health.certificationState.currentCertificationLevel || "UNKNOWN", "certification"),
    item("Workspace", workspace.state || "NO_WORKSPACE", "workspace"),
    item("Project", workspace.name || workspace.projectId || "None", "project"),
    item("Capabilities", String((health.availableCapabilities || []).length), "capabilities"),
    item("Degraded", String((health.unavailableCapabilities || []).length), "degraded"),
    item("Active Operations", String(state.activeOperationCount || 0), "operations"),
    item("Pending Approvals", String(state.pendingApprovalCount || 0), "approvals"),
    section("Blockers", listStrings(health.blockers || [], UI_BOUNDS.maximumDisplayedFindings)),
    section("Warnings", listStrings(health.warnings || [], UI_BOUNDS.maximumDisplayedFindings)),
  ]);
}

function projectModel(project = {}) {
  return section("Project", [
    item("Summary", text(project.summary || project.purpose || project.description || "No summary available."), "summary"),
    item("Lifecycle", text(project.lifecycleStage || project.stage || project.status || "UNKNOWN"), "lifecycle"),
    section("Classifications", listStrings(project.classifications || project.classification || [])),
    section("Architecture", listStrings(project.architecture || project.architectureState || project.layers || [])),
    section("Completed Capabilities", listStrings(project.completedCapabilities || project.completed || [])),
    section("Incomplete Capabilities", listStrings(project.incompleteCapabilities || project.incomplete || [])),
    section("Blockers", listStrings(project.blockers || [])),
    section("Risks", listStrings(project.risks || [])),
    section("Technical Debt", listStrings(project.technicalDebt || [])),
    section("Next Actions", listStrings(project.nextActions || [])),
    item("Release Readiness", text(project.releaseReadiness && (project.releaseReadiness.level || project.releaseReadiness.status) || project.ready || "UNKNOWN"), "release"),
    item("Confidence", confidenceText(project.confidence), "confidence"),
    item("Completeness", confidenceText(project.completeness), "completeness"),
    section("Limitations", listStrings(project.limitations || [])),
  ]);
}

function operationsModel(operations = []) {
  const grouped = groupBy(operations.slice(-UI_BOUNDS.maximumDisplayedOperations), (operation) => operation.state || "UNKNOWN");
  return section("Operations", Object.keys(grouped).sort().map((state) => section(state, grouped[state].map(operationItem))));
}

function approvalsModel(approvals = []) {
  const grouped = groupBy(approvals.slice(-UI_BOUNDS.maximumDisplayedApprovals), (approval) => approval.status || "UNKNOWN");
  return section("Approvals", Object.keys(grouped).sort().map((status) => section(status, grouped[status].map(approvalItem))));
}

function diagnosticsModel(state) {
  return section("Diagnostics", [
    item("Activation", state.activationStatus || "UNKNOWN", "activation"),
    item("Last Error", state.lastError ? state.lastError.userMessage || state.lastError.message : "None", "error"),
    section("Extension Events", (state.extensionEvents || []).slice(-UI_BOUNDS.maximumTreeItemsPerSection).map((event) => item(event.type, event.timestamp || "", "event"))),
  ]);
}

function modelsModel(state) {
  const health = state.modelHealth || {};
  const providers = state.modelProviders || [];
  const models = state.models || [];
  return section("Models", [
    item("Gateway", health.gatewayState || "UNKNOWN", "model-gateway"),
    item("Providers", String(health.configuredProviders || providers.length || 0), "model-providers"),
    item("Available Models", String(health.availableModels || 0), "model-catalog"),
    item("Privacy", health.privacyPolicyStatus || "UNKNOWN", "model-privacy"),
    section("Providers", providers.slice(0, UI_BOUNDS.maximumTreeItemsPerSection).map((provider) => item(provider.name || provider.id, `${provider.state || "UNKNOWN"} ${provider.type || ""}`.trim(), provider.id))),
    section("Models", models.slice(0, UI_BOUNDS.maximumTreeItemsPerSection).map((model) => item(model.name || model.id, `${model.providerId || "unknown"} ${(model.capabilities || []).slice(0, 3).join(", ")}`.trim(), model.id))),
  ]);
}

function agentModel(state) {
  const agent = state.agent || {};
  const conversation = agent.activeConversation || {};
  const turn = agent.activeTurn || {};
  const response = turn.assistantResponse || agent.lastResponse || {};
  return section("Agent", [
    item("Health", agent.health && agent.health.overallAgentHealth !== undefined ? numericText(agent.health.overallAgentHealth) : "UNKNOWN", "agent-health"),
    item("Mode", agent.mode || conversation.mode || "UNKNOWN", "agent-mode"),
    item("Conversation", conversation.title || conversation.id || "None", "agent-conversation"),
    item("Conversation State", conversation.state || "NONE", "agent-conversation-state"),
    item("Turn State", turn.state || "NONE", "agent-turn-state"),
    item("Outcome", response.outcome || "NONE", "agent-outcome"),
    section("Context", listStrings(agent.contextSummary || turn.contextPackageIds || [])),
    section("Plan", listStrings(agent.planSummary || (turn.planId ? [turn.planId] : []))),
    section("Proposed Tools", listStrings(turn.proposedToolCalls || [])),
    section("Warnings", listStrings((response.warnings || []).concat(turn.warnings || []), UI_BOUNDS.maximumDisplayedFindings)),
    section("Limitations", listStrings((response.limitations || []).concat(turn.limitations || []), UI_BOUNDS.maximumDisplayedFindings)),
  ]);
}

function changesModel(state) {
  const changes = state.changes || {};
  const health = changes.health || {};
  const active = changes.activeProposal || {};
  return section("Change Review", [
    item("Health", health.overallWorkspaceToolHealth !== undefined ? numericText(health.overallWorkspaceToolHealth) : "UNKNOWN", "change-health"),
    item("Engine", health.engineState || "UNKNOWN", "change-engine"),
    item("Active Proposal", active.title || active.id || "None", "change-active"),
    item("State", active.state || "NONE", "change-state"),
    item("Risk", active.riskLevel || "NONE", "change-risk"),
    item("Pending Proposals", String((changes.proposals || []).filter((proposal) => ["PROPOSED", "READY_FOR_REVIEW", "APPROVED"].includes(proposal.state)).length), "change-pending"),
    section("Proposals", listStrings(changes.proposals || [])),
    section("Warnings", listStrings((health.warnings || []).concat(active.warnings || []), UI_BOUNDS.maximumDisplayedFindings)),
    section("Blockers", listStrings(health.blockers || [], UI_BOUNDS.maximumDisplayedFindings)),
  ]);
}

function multiAgentModel(state) {
  const multiAgent = state.multiAgent || {};
  const health = multiAgent.health || {};
  const team = multiAgent.activeTeam || {};
  const assignments = multiAgent.assignments || [];
  const conflicts = multiAgent.conflicts || [];
  return section("Multi-Agent", [
    item("Health", health.scores && health.scores.overallMultiAgentHealth !== undefined ? numericText(health.scores.overallMultiAgentHealth) : "UNKNOWN", "multi-agent-health"),
    item("State", health.coordinatorState || "UNKNOWN", "multi-agent-state"),
    item("Strategy", team.strategy || "NONE", "multi-agent-strategy"),
    item("Team", team.objective || team.id || "None", "multi-agent-team"),
    item("Team State", team.state || "NONE", "multi-agent-team-state"),
    item("Assignments", String(assignments.length), "multi-agent-assignments"),
    item("Conflicts", String(conflicts.length), "multi-agent-conflicts"),
    section("Active Assignments", assignments.slice(0, UI_BOUNDS.maximumTreeItemsPerSection).map((assignment) => item(`${assignment.role}: ${assignment.type}`, `${assignment.state || "UNKNOWN"} ${assignment.objective || ""}`.trim(), assignment.id))),
    section("Conflicts", conflicts.slice(0, UI_BOUNDS.maximumTreeItemsPerSection).map((conflict) => item(conflict.category || conflict.id, `${conflict.severity || "UNKNOWN"} ${conflict.resolutionStatus || ""}`.trim(), conflict.id))),
    section("Warnings", listStrings((health.warnings || []).concat(team.warnings || []), UI_BOUNDS.maximumDisplayedFindings)),
    section("Limitations", listStrings((team.limitations || []).concat(health.blockers || []), UI_BOUNDS.maximumDisplayedFindings)),
  ]);
}

function workflowsModel(state) {
  const workflows = state.workflows || {};
  const health = workflows.health || {};
  const active = workflows.activeWorkflow || {};
  const steps = workflows.steps || [];
  const checkpoints = workflows.checkpoints || [];
  const result = workflows.lastResult || {};
  return section("Workflows", [
    item("Health", health.scores && health.scores.overallWorkflowHealth !== undefined ? numericText(health.scores.overallWorkflowHealth.value || health.scores.overallWorkflowHealth) : "UNKNOWN", "workflow-health"),
    item("State", health.engineState || "UNKNOWN", "workflow-engine-state"),
    item("Workflow", active.title || active.id || "None", "workflow-active"),
    item("Workflow State", active.state || "NONE", "workflow-state"),
    item("Progress", active.progress && active.progress.percentage !== undefined ? `${active.progress.percentage}%` : "0%", "workflow-progress"),
    item("Current Step", (steps.find((step) => ["RUNNING", "QUEUED", "WAITING_FOR_APPROVAL", "WAITING_FOR_INPUT"].includes(step.state)) || {}).title || "None", "workflow-current-step"),
    item("Active Steps", String((steps || []).filter((step) => ["QUEUED", "STARTING", "RUNNING", "VALIDATING", "REPAIRING", "RETRYING"].includes(step.state)).length), "workflow-active-steps"),
    item("Ready Steps", String((workflows.readySteps || []).length), "workflow-ready-steps"),
    item("Blocked Steps", String((steps || []).filter((step) => ["BLOCKED", "BLOCKED_BY_DEPENDENCY"].includes(step.state)).length), "workflow-blocked-steps"),
    item("Failed Steps", String((steps || []).filter((step) => ["FAILED", "TIMED_OUT", "INTERRUPTED"].includes(step.state)).length), "workflow-failed-steps"),
    item("Waiting Approvals", String((steps || []).filter((step) => step.state === "WAITING_FOR_APPROVAL").length), "workflow-approvals"),
    item("Waiting Decisions", String((workflows.decisions || []).filter((decision) => !decision.resolvedAt).length), "workflow-decisions"),
    item("Last Checkpoint", (checkpoints[checkpoints.length - 1] || {}).id || active.currentCheckpointId || "None", "workflow-checkpoint"),
    item("Workspace Revision", active.metadata && active.metadata.workspaceRevision || "UNKNOWN", "workflow-workspace-revision"),
    item("Disposition", result.disposition || "NONE", "workflow-result"),
    section("Workflows", (workflows.items || []).slice(0, UI_BOUNDS.maximumTreeItemsPerSection).map((workflow) => item(workflow.title || workflow.id, `${workflow.state || "UNKNOWN"} ${workflow.progress && workflow.progress.percentage !== undefined ? `${workflow.progress.percentage}%` : ""}`.trim(), workflow.id))),
    section("Steps", steps.slice(0, UI_BOUNDS.maximumTreeItemsPerSection).map((step) => item(`${step.sequence}. ${step.title || step.type}`, `${step.type || "CUSTOM"} ${step.state || "UNKNOWN"} attempt ${step.attempt || 0}/${step.maximumAttempts || 1}`.trim(), step.id))),
    section("Ready", (workflows.readySteps || []).slice(0, UI_BOUNDS.maximumTreeItemsPerSection).map((step) => item(step.title || step.id, `${step.type || "CUSTOM"} ${step.priority || "NORMAL"}`.trim(), step.id))),
    section("Checkpoints", checkpoints.slice(-UI_BOUNDS.maximumTreeItemsPerSection).map((checkpoint) => item(checkpoint.type || checkpoint.id, `${checkpoint.state || "UNKNOWN"} ${checkpoint.createdAt || ""}`.trim(), checkpoint.id))),
    section("Warnings", listStrings((health.warnings || []).concat(active.warnings || []), UI_BOUNDS.maximumDisplayedFindings)),
    section("Limitations", listStrings((active.limitations || []).concat(health.blockers || []), UI_BOUNDS.maximumDisplayedFindings)),
  ]);
}

function performanceModel(state) {
  const performance = state.performance || {};
  const health = performance.health || {};
  const stats = performance.stats || {};
  const cache = performance.cache || {};
  const memory = performance.memory || {};
  const graph = performance.graph || {};
  const lastBenchmark = performance.lastBenchmark || {};
  const domains = health.domains || {};
  return section("Performance", [
    item("Health", health.score !== undefined ? numericText(health.score) : "UNKNOWN", "performance-health"),
    item("State", performance.state || health.status || "UNKNOWN", "performance-state"),
    item("Cache Entries", String(cache.entries || memory.entries && memory.entries.cache || 0), "performance-cache"),
    item("Cache Hit Rate", cache.hitRate !== undefined ? `${Math.round(Number(cache.hitRate) * 100)}%` : "UNKNOWN", "performance-hit-rate"),
    item("Indexed Files", String(stats.repository && stats.repository.indexedFiles || 0), "performance-indexed-files"),
    item("Dependency Edges", String(stats.repository && stats.repository.dependencyEdges || 0), "performance-dependency-edges"),
    item("Graph Handles", String(graph.handles && graph.handles.length || stats.repository && stats.repository.graphHandles || 0), "performance-graph-handles"),
    item("Memory", memory.totalBytes !== undefined ? `${memory.totalBytes}/${memory.budgetBytes || "?"} bytes` : "UNKNOWN", "performance-memory"),
    item("Contexts", String(cache.contexts || memory.entries && memory.entries.contexts || 0), "performance-contexts"),
    item("Token Summaries", String(cache.tokenSummaries || memory.entries && memory.entries.tokenSummaries || 0), "performance-token-summaries"),
    item("Benchmarks", String((performance.benchmarks || []).length), "performance-benchmarks"),
    item("Last Benchmark", lastBenchmark.id || "None", "performance-last-benchmark"),
    section("Domains", Object.keys(domains).sort().map((name) => item(name, `${domains[name].status || "UNKNOWN"} ${domains[name].score !== undefined ? domains[name].score : ""}`.trim(), `performance-domain-${name}`))),
    section("Benchmark Scenarios", (lastBenchmark.scenarios || []).slice(0, UI_BOUNDS.maximumTreeItemsPerSection).map((scenario) => item(scenario.scenario, `${scenario.estimatedDurationMs || 0}ms ${scenario.throughputPerSecond || 0}/s`, scenario.scenario))),
    section("Critical Failures", listStrings(health.criticalFailures || [], UI_BOUNDS.maximumDisplayedFindings)),
  ]);
}

function reliabilityModel(state) {
  const reliability = state.reliability || {};
  const health = reliability.health || {};
  const stats = reliability.stats && reliability.stats.stats || reliability.stats || {};
  const activeRun = reliability.activeRun || {};
  const report = reliability.report || {};
  const certification = reliability.certification || report.certification || {};
  const consistency = reliability.consistency || report.consistency || {};
  const resources = reliability.resources || report.resources || {};
  const blockers = reliability.blockers || report.blockers || [];
  return section("Reliability", [
    item("Health", health.score !== undefined ? numericText(health.score) : "UNKNOWN", "reliability-health"),
    item("State", health.engineState || reliability.state || "UNKNOWN", "reliability-state"),
    item("Certification", certification.level || "NOT_ASSESSED", "reliability-certification"),
    item("Active Run", activeRun.name || activeRun.id || "None", "reliability-active-run"),
    item("Run State", activeRun.state || "NONE", "reliability-run-state"),
    item("Score", activeRun.reliabilityScore !== undefined ? numericText(activeRun.reliabilityScore) : "UNKNOWN", "reliability-score"),
    item("Scenarios", String((reliability.scenarios || []).length), "reliability-scenarios"),
    item("Findings", String((reliability.findings || []).length), "reliability-findings"),
    item("Blockers", String(blockers.length), "reliability-blockers"),
    item("Consistency", consistency.valid === false ? "INVALID" : consistency.valid === true ? "VALID" : "UNKNOWN", "reliability-consistency"),
    item("Resources", resources.resourceCleanupValid === false ? "LEAK SUSPECTED" : resources.resourceCleanupValid === true ? "CLEAN" : "UNKNOWN", "reliability-resources"),
    section("Recent Runs", (reliability.runs || []).slice(-UI_BOUNDS.maximumTreeItemsPerSection).map((run) => item(run.name || run.id, `${run.state || "UNKNOWN"} ${run.reliabilityScore !== undefined ? run.reliabilityScore : ""}`.trim(), run.id))),
    section("Blockers", blockers.slice(0, UI_BOUNDS.maximumDisplayedFindings).map((finding) => item(finding.title || finding.id, `${finding.severity || "UNKNOWN"} ${finding.component || ""}`.trim(), finding.id))),
    section("Domains", Object.keys(health.domains || {}).sort().map((name) => item(name, `${health.domains[name].status || "UNKNOWN"} ${health.domains[name].score !== undefined ? health.domains[name].score : ""}`.trim(), `reliability-domain-${name}`))),
    section("Statistics", [
      item("Runs Completed", String(stats.runsCompleted || 0), "reliability-stat-runs"),
      item("Scenarios Passed", String(stats.scenariosPassed || 0), "reliability-stat-scenarios"),
      item("Protected Resume Blocks", String(stats.protectedResumeAttemptsBlocked || 0), "reliability-stat-protected"),
      item("Corruption Fallbacks", String(stats.corruptionFallbacks || 0), "reliability-stat-corruption"),
    ]),
  ]);
}

function securityAssuranceModel(state) {
  const security = state.securityAssurance || {};
  const health = security.health || {};
  const stats = security.stats && security.stats.stats || security.stats || {};
  const activeRun = security.activeRun || {};
  const report = security.report || {};
  const certification = security.certification || {};
  const blockers = security.blockers || report.releaseBlockers || [];
  const checks = security.checks && security.checks.checks || security.checks || {};
  return section("Security Assurance", [
    item("Health", health.score !== undefined ? numericText(health.score) : "UNKNOWN", "security-health"),
    item("State", health.engineState || security.state || "UNKNOWN", "security-state"),
    item("Certification", certification.level || report.certificationLevel || "NOT_EVALUATED", "security-certification"),
    item("Active Audit", activeRun.name || activeRun.id || "None", "security-active-run"),
    item("Audit State", activeRun.state || "NONE", "security-run-state"),
    item("Score", activeRun.securityScore !== undefined ? numericText(activeRun.securityScore) : report.score !== undefined ? numericText(report.score) : "UNKNOWN", "security-score"),
    item("Scenarios", String((security.scenarios || []).length), "security-scenarios"),
    item("Findings", String((security.findings || []).length), "security-findings"),
    item("Blockers", String(blockers.length), "security-blockers"),
    section("Recent Audits", (security.runs || []).slice(-UI_BOUNDS.maximumTreeItemsPerSection).map((run) => item(run.name || run.id, `${run.state || "UNKNOWN"} ${run.securityScore !== undefined ? run.securityScore : ""}`.trim(), run.id))),
    section("Blockers", blockers.slice(0, UI_BOUNDS.maximumDisplayedFindings).map((finding) => item(finding.title || finding.id, `${finding.severity || "UNKNOWN"} ${finding.component || ""}`.trim(), finding.id))),
    section("Checks", Object.keys(checks).sort().map((name) => item(name, `${checks[name].status || "UNKNOWN"} ${checks[name].score !== undefined ? checks[name].score : ""}`.trim(), `security-check-${name}`))),
    section("Domains", Object.keys(health.domains || {}).sort().map((name) => item(name, `${health.domains[name].status || "UNKNOWN"} ${health.domains[name].score !== undefined ? health.domains[name].score : ""}`.trim(), `security-domain-${name}`))),
    section("Statistics", [
      item("Audits Completed", String(stats.auditsCompleted || 0), "security-stat-audits"),
      item("Scenarios Passed", String(stats.scenariosPassed || 0), "security-stat-scenarios"),
      item("Findings Created", String(stats.findingsCreated || 0), "security-stat-findings"),
      item("Release Blockers", String(stats.releaseBlockers || blockers.length || 0), "security-stat-blockers"),
    ]),
  ]);
}

function stressScalabilityModel(state) {
  const stress = state.stressScalability || {};
  const health = stress.health || {};
  const stats = stress.stats && stress.stats.stats || stress.stats || {};
  const activeRun = stress.activeRun || {};
  const report = stress.report || {};
  const certification = stress.certification || report.certification || {};
  const blockers = stress.blockers || report.releaseBlockers || [];
  const metrics = report.metrics || activeRun.metrics || {};
  return section("Stress & Scalability", [
    item("Health", health.score !== undefined ? numericText(health.score) : "UNKNOWN", "stress-health"),
    item("State", health.engineState || stress.state || "UNKNOWN", "stress-state"),
    item("Certification", certification.level || report.certificationLevel || "NOT_EVALUATED", "stress-certification"),
    item("Active Run", activeRun.name || activeRun.id || "None", "stress-active-run"),
    item("Run State", activeRun.state || "NONE", "stress-run-state"),
    item("Score", activeRun.score !== undefined && activeRun.score !== null ? numericText(activeRun.score) : report.score !== undefined ? numericText(report.score) : "UNKNOWN", "stress-score"),
    item("Profiles", String((stress.profiles || []).length), "stress-profiles"),
    item("Repositories", String((stress.repositories || []).length), "stress-repositories"),
    item("Scenarios", String((stress.scenarios || []).length), "stress-scenarios"),
    item("Blockers", String(blockers.length), "stress-blockers"),
    section("Metrics", [
      item("Latency P95", metrics.latency && metrics.latency.p95Ms !== undefined ? `${metrics.latency.p95Ms}ms` : "UNKNOWN", "stress-latency"),
      item("Throughput", metrics.throughput && metrics.throughput.operationsPerSecond !== undefined ? `${metrics.throughput.operationsPerSecond}/s` : "UNKNOWN", "stress-throughput"),
      item("Queue Depth", metrics.queue && metrics.queue.depthMaximum !== undefined ? String(metrics.queue.depthMaximum) : "UNKNOWN", "stress-queue"),
      item("Peak Memory", metrics.memory && metrics.memory.peakBytes !== undefined ? `${metrics.memory.peakBytes}/${metrics.memory.budgetBytes || "?"} bytes` : "UNKNOWN", "stress-memory"),
      item("Cache Hit Rate", metrics.cache && metrics.cache.hitRate !== undefined ? `${Math.round(Number(metrics.cache.hitRate) * 100)}%` : "UNKNOWN", "stress-cache"),
      item("Events Dropped", metrics.event && metrics.event.dropped !== undefined ? String(metrics.event.dropped) : "UNKNOWN", "stress-events"),
    ]),
    section("Recent Runs", (stress.runs || []).slice(-UI_BOUNDS.maximumTreeItemsPerSection).map((run) => item(run.name || run.id, `${run.state || "UNKNOWN"} ${run.score !== undefined && run.score !== null ? run.score : ""}`.trim(), run.id))),
    section("Blockers", blockers.slice(0, UI_BOUNDS.maximumDisplayedFindings).map((finding) => item(finding.title || finding.id, `${finding.severity || "UNKNOWN"} ${finding.component || ""}`.trim(), finding.id))),
    section("Domains", Object.keys(health.domains || {}).sort().map((name) => item(name, `${health.domains[name].status || "UNKNOWN"} ${health.domains[name].score !== undefined ? health.domains[name].score : ""}`.trim(), `stress-domain-${name}`))),
    section("Statistics", [
      item("Runs Completed", String(stats.runsCompleted || 0), "stress-stat-runs"),
      item("Scenarios Passed", String(stats.scenariosPassed || 0), "stress-stat-scenarios"),
      item("Operations", String(stats.operationsAttempted || 0), "stress-stat-operations"),
      item("Release Blockers", String(stats.releaseBlockersDetected || blockers.length || 0), "stress-stat-blockers"),
    ]),
  ]);
}

function qualificationModel(state) {
  const qualification = state.qualification || {};
  const health = qualification.health || {};
  const stats = qualification.stats && qualification.stats.stats || qualification.stats || {};
  const activeRun = qualification.activeRun || {};
  const report = qualification.report || {};
  const certification = qualification.certification || report.certification || {};
  const blockers = qualification.blockers || report.releaseBlockers || [];
  const manual = qualification.manualVerifications || [];
  const defects = qualification.defects || [];
  return section("Release Qualification", [
    item("Health", health.score !== undefined ? numericText(health.score) : "UNKNOWN", "qualification-health"),
    item("State", health.engineState || qualification.state || "UNKNOWN", "qualification-state"),
    item("Certification", certification.level || report.certification || "NOT_EVALUATED", "qualification-certification"),
    item("Active Run", activeRun.name || activeRun.id || "None", "qualification-active-run"),
    item("Run State", activeRun.state || "NONE", "qualification-run-state"),
    item("Score", activeRun.score !== undefined && activeRun.score !== null ? numericText(activeRun.score) : report.score !== undefined ? numericText(report.score) : "UNKNOWN", "qualification-score"),
    item("Fixtures", String((qualification.fixtures || []).length), "qualification-fixtures"),
    item("Journeys", String((qualification.journeys || []).length), "qualification-journeys"),
    item("Scenarios", String((qualification.scenarios || []).length), "qualification-scenarios"),
    item("Manual Pending", String(report.manualScenariosPending !== undefined ? report.manualScenariosPending : manual.filter((record) => record.status === "PENDING").length), "qualification-manual-pending"),
    item("Defects", String(defects.length), "qualification-defects"),
    item("Blockers", String(blockers.length), "qualification-blockers"),
    item("Extension Host", report.extensionHostReadiness || "UNKNOWN", "qualification-extension-host"),
    item("Local Ollama", report.localModelReadiness || "UNKNOWN", "qualification-local-model"),
    section("Recent Runs", (qualification.runs || []).slice(-UI_BOUNDS.maximumTreeItemsPerSection).map((run) => item(run.name || run.id, `${run.state || "UNKNOWN"} ${run.score !== undefined && run.score !== null ? run.score : ""}`.trim(), run.id))),
    section("Pending Manual Checks", manual.filter((record) => record.status === "PENDING").slice(0, UI_BOUNDS.maximumTreeItemsPerSection).map((record) => item(record.title || record.id, record.metadata && record.metadata.section || record.scenarioId || "", record.id))),
    section("Blockers", blockers.slice(0, UI_BOUNDS.maximumDisplayedFindings).map((defect) => item(defect.title || defect.id, `${defect.severity || "UNKNOWN"} ${defect.domain || ""}`.trim(), defect.id))),
    section("Statistics", [
      item("Runs Completed", String(stats.runsCompleted || 0), "qualification-stat-runs"),
      item("Automated Passed", String(stats.automatedScenariosPassed || 0), "qualification-stat-automated"),
      item("Manual Created", String(stats.manualChecksCreated || 0), "qualification-stat-manual"),
      item("Defects Created", String(stats.defectsCreated || 0), "qualification-stat-defects"),
    ]),
  ]);
}

function renderDocument(title, value) {
  const sanitized = serializeForExtension(value, { maximumSize: UI_BOUNDS.maximumVirtualDocumentSize });
  return `# ${title}\n\n\`\`\`json\n${JSON.stringify(sanitized, null, 2)}\n\`\`\`\n`;
}

function flattenModel(model, depth = 0) {
  if (!model) return [];
  const rows = [`${"  ".repeat(depth)}- ${model.label}${model.description ? `: ${model.description}` : ""}`];
  for (const child of model.children || []) rows.push(...flattenModel(child, depth + 1));
  return rows;
}

function section(label, children = []) {
  return { kind: "section", label, children: children.flat().filter(Boolean) };
}

function item(label, description = "", id = null) {
  return { kind: "item", id, label, description: String(description === undefined || description === null ? "" : description), children: [] };
}

function operationItem(operation) {
  return item(
    `${operation.type || operation.command || operation.id}`,
    `${operation.state || "UNKNOWN"} ${operation.progress && operation.progress.stage ? `- ${operation.progress.stage}` : ""} ${operation.progress && operation.progress.percentage !== undefined ? `(${operation.progress.percentage}%)` : ""}`.trim(),
    operation.id
  );
}

function approvalItem(approval) {
  return item(
    approval.requestedAction || approval.title || approval.id,
    `${approval.status || "UNKNOWN"} ${approval.risks && approval.risks.length ? `- ${approval.risks.join(", ")}` : ""}`.trim(),
    approval.id
  );
}

function listStrings(values, maximum = UI_BOUNDS.maximumTreeItemsPerSection) {
  const entries = normalizeList(values).slice(0, maximum).map((value, index) => item(titleFor(value, index), detailFor(value), value && value.id || null));
  if (normalizeList(values).length > maximum) entries.push(item("Truncated", `${normalizeList(values).length - maximum} additional item(s) hidden by UI bounds.`));
  if (entries.length === 0) entries.push(item("None", ""));
  return entries;
}

function normalizeList(values) {
  if (values === undefined || values === null) return [];
  return Array.isArray(values) ? values : [values];
}

function titleFor(value, index) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return String(value);
  return value.title || value.name || value.id || value.code || `Item ${index + 1}`;
}

function detailFor(value) {
  if (typeof value === "string") return "";
  if (!value || typeof value !== "object") return "";
  return value.description || value.summary || value.message || safeText(value, { maximumSize: 300 });
}

function text(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return safeText(value, { maximumSize: 500 });
}

function numericText(value) {
  return Number.isFinite(Number(value)) ? String(Math.round(Number(value))) : "UNKNOWN";
}

function confidenceText(value) {
  if (!Number.isFinite(Number(value))) return "UNKNOWN";
  const number = Number(value);
  return number <= 1 ? `${Math.round(number * 100)}%` : `${Math.round(number)}%`;
}

function groupBy(values, keyFn) {
  const result = {};
  for (const value of values || []) {
    const key = keyFn(value);
    if (!result[key]) result[key] = [];
    result[key].push(value);
  }
  return result;
}

module.exports = {
  agentModel,
  approvalsModel,
  changesModel,
  diagnosticsModel,
  flattenModel,
  modelsModel,
  multiAgentModel,
  operationsModel,
  overviewModel,
  performanceModel,
  projectModel,
  qualificationModel,
  reliabilityModel,
  renderDocument,
  securityAssuranceModel,
  stressScalabilityModel,
  workflowsModel,
};
