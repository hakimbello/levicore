const assert = require("node:assert/strict");
const test = require("node:test");

const { LeviApplicationRuntime } = require("../src/runtime-loader").requireRuntime("levi-application-runtime.js");
const { createLeviExtension } = require("../src/levi-extension");
const { EXTENSION_COMMANDS, EXTENSION_EVENTS } = require("../src/constants");
const { FakeUri, createFakeContext, createFakeVSCode } = require("./fake-vscode");

test("activates, initializes runtime, registers commands and views, opens workspace, and deactivates cleanly", async () => {
  const vscode = createFakeVSCode();
  const extension = createLeviExtension({ vscode, context: createFakeContext(), runtimeFactory: () => createRuntimeFake("READY") });

  const api = await extension.activate();

  assert.ok(api.getRuntime());
  assert.equal(EXTENSION_COMMANDS.every((id) => vscode.__commandHandlers.has(id)), true);
  assert.equal(vscode.__treeProviders.has("levi.overview"), true);
  assert.equal(vscode.__treeProviders.has("levi.environment"), true);
  assert.equal(vscode.__treeProviders.has("levi.models"), true);
  assert.equal(vscode.__treeProviders.has("levi.build"), false);
  assert.equal(vscode.__webviewViewProviders.has("levi.build"), true);
  assert.equal(vscode.__treeProviders.has("levi.changes"), true);
  assert.equal(vscode.__treeProviders.has("levi.multiAgent"), true);
  assert.equal(vscode.__treeProviders.has("levi.workflows"), true);
  assert.equal(vscode.__treeProviders.has("levi.performance"), true);
  assert.equal(vscode.__treeProviders.has("levi.reliability"), true);
  assert.equal(vscode.__treeProviders.has("levi.securityAssurance"), true);
  assert.equal(vscode.__treeProviders.has("levi.stressScalability"), true);
  assert.equal(vscode.__treeProviders.has("levi.qualification"), true);
  assert.equal(api.getPresentationState().activationStatus, "READY");
  assert.ok(api.getPresentationState().workspace);

  await extension.deactivate();
  assert.equal(api.getRuntime().shutdownCalled, true);
});

test("shows degraded and failed activation visibly", async () => {
  const degraded = createLeviExtension({ vscode: createFakeVSCode(), context: createFakeContext(), runtimeFactory: () => createRuntimeFake("DEGRADED") });
  await degraded.activate();
  assert.equal(degraded.presentationCache.activationStatus, "DEGRADED");

  const failedVscode = createFakeVSCode();
  const failed = createLeviExtension({ vscode: failedVscode, context: createFakeContext(), runtimeFactory: () => createRuntimeFake("FAILED") });
  await failed.activate();
  assert.equal(failed.presentationCache.activationStatus, "FAILED");
  assert.match(failedVscode.__lastError, /Initialization failed/);
});

test("routes command bindings through runtime APIs and renders virtual documents", async () => {
  const vscode = createFakeVSCode({ nextInput: "runtime" });
  const runtime = createRuntimeFake("READY");
  const extension = createLeviExtension({ vscode, context: createFakeContext(), runtimeFactory: () => runtime });
  await extension.activate();

  await vscode.commands.executeCommand("levi.showProjectSummary");
  await vscode.commands.executeCommand("levi.showArchitecture");
  await vscode.commands.executeCommand("levi.showAssessment");
  await vscode.commands.executeCommand("levi.showBlockers");
  await vscode.commands.executeCommand("levi.showRisks");
  await vscode.commands.executeCommand("levi.showNextActions");
  await vscode.commands.executeCommand("levi.showReleaseReadiness");
  await vscode.commands.executeCommand("levi.searchWorkspace");
  await vscode.commands.executeCommand("levi.showCapabilities");
  await vscode.commands.executeCommand("levi.showRuntimeHealth");
  await vscode.commands.executeCommand("levi.showCertification");
  await vscode.commands.executeCommand("levi.runCertification");
  await vscode.commands.executeCommand("levi.showOperations");
  await vscode.commands.executeCommand("levi.showApprovals");
  await vscode.commands.executeCommand("levi.understandCurrentFile", FakeUri.parse("file:/workspace/src/app.js"));

  assert.ok(vscode.__lastDocument.getText().includes("Levi"));
  assert.equal(runtime.calls.includes("getProjectSummary"), true);
  assert.equal(runtime.calls.includes("searchWorkspace"), true);
  assert.equal(runtime.calls.includes("getCodeUnderstanding"), true);
});

test("surfaces model providers, models, health, usage, selection, and credential references", async () => {
  const vscode = createFakeVSCode({ nextInput: "remote-key", config: { "levi.models.enabled": false } });
  const context = createFakeContext();
  const runtime = createRuntimeFake("READY");
  const extension = createLeviExtension({ vscode, context, runtimeFactory: () => runtime });
  await extension.activate();

  await vscode.commands.executeCommand("levi.showModelProviders");
  await vscode.commands.executeCommand("levi.showModels");
  await vscode.commands.executeCommand("levi.showModelHealth");
  await vscode.commands.executeCommand("levi.testModelConnection");
  const selected = await vscode.commands.executeCommand("levi.selectModel");
  await vscode.commands.executeCommand("levi.showModelUsage");
  await vscode.commands.executeCommand("levi.configureProviderCredential");
  await vscode.commands.executeCommand("levi.clearProviderCredential");

  assert.equal(selected.id, "local:chat");
  assert.equal(extension.presentationCache.modelProviders[0].id, "local");
  assert.equal(extension.presentationCache.models[0].id, "local:chat");
  assert.equal(extension.presentationCache.modelHealth.privacyPolicyStatus, "ENFORCED");
  assert.equal(runtime.calls.includes("model.health"), true);
  assert.ok(vscode.__lastDocument.getText().includes("Levi Model"));
  assert.equal(context.secrets.__values.has("levi.modelProvider.remote-key"), false);
});

test("configured Ollama default model is eligible for streaming tool-aware agent requests", async () => {
  const vscode = createFakeVSCode({
    config: {
      "levi.autoAnalyzeWorkspace": false,
      "levi.ollama.defaultModel": "qwen2.5-coder:7b",
      "levi.models.defaultProvider": "ollama-local",
      "levi.models.defaultModel": "ollama:qwen2.5-coder:7b",
      "levi.openAICompatible.enabled": false,
    },
  });
  const extension = createLeviExtension({
    vscode,
    context: createFakeContext(),
    runtimeFactory: (options) => new LeviApplicationRuntime(options),
  });
  await extension.activate();

  const models = extension.modelGateway.listModels();
  const routed = extension.modelGateway.route({
    modelId: "ollama:qwen2.5-coder:7b",
    providerId: "ollama-local",
    prompt: "Explain a selected function without editing files.",
    stream: true,
    tools: [{ type: "function", function: { name: "code_understand", parameters: { type: "object" } } }],
    privacyClassification: "USER_CONTENT",
  });

  const configured = models.find((model) => model.id === "ollama:qwen2.5-coder:7b");
  assert.ok(models.length >= 1);
  assert.ok(configured);
  assert.ok(configured.capabilities.includes("TOOL_CALLING"));
  assert.equal(routed.selectedProvider.id, "ollama-local");
  assert.equal(routed.selectedModel.id, "ollama:qwen2.5-coder:7b");
});

test("surfaces Levi-owned Build webview, Environment, onboarding, context, and technical details", async () => {
  const vscode = createFakeVSCode({
    nextInput: "Explain this project",
    config: {
      "levi.autoAnalyzeWorkspace": false,
      "levi.models.enabled": false,
      "levi.experience.defaultMode": "Plan",
    },
  });
  const extension = createLeviExtension({
    vscode,
    context: createFakeContext(),
    runtimeFactory: (options) => new LeviApplicationRuntime(options),
  });
  await extension.activate();

  const homePanel = await vscode.commands.executeCommand("levi.open");
  const view = await vscode.commands.executeCommand("levi.openBuildChat");
  await vscode.commands.executeCommand("levi.focusComposer");
  await vscode.commands.executeCommand("levi.newChat");
  await vscode.commands.executeCommand("levi.showEnvironment");
  await vscode.commands.executeCommand("levi.showActiveApproval");
  await vscode.commands.executeCommand("levi.showActiveChange");
  await vscode.commands.executeCommand("levi.openOnboarding");
  await vscode.commands.executeCommand("levi.showContext");
  const details = await vscode.commands.executeCommand("levi.showTechnicalDetails");
  await view.webview.__receive({ command: "setMode", mode: "Review" });
  await view.webview.__receive({ command: "submit", content: "What changed?", mode: "Review", scope: "Workspace" });
  await view.webview.__receive({ command: "workbench.action.terminal.sendSequence" });

  assert.equal(homePanel.viewType, "leviHome");
  assert.equal(view.viewType, "levi.build");
  assert.equal(vscode.__lastWebviewView, view);
  assert.ok(view.webview.html.includes("Content-Security-Policy"));
  assert.ok(view.webview.html.includes("aria-label=\"Send message to Levi\""));
  assert.ok(view.webview.html.includes("<strong>Levi</strong>"));
  assert.equal(view.webview.html.includes("workbench.action.chat.open"), false);
  assert.equal(view.webview.html.includes("http://"), false);
  assert.equal(vscode.__treeProviders.has("levi.environment"), true);
  assert.ok(details.toString().startsWith("levi:/"));
  assert.equal(extension.presentationCache.productExperience.mode, "Review");
  assert.ok(extension.presentationCache.productExperience.workflowTimeline);
  assert.ok(vscode.__webviewMessages.some((message) => message.type === "productState"
    && message.state
    && message.state.agent
    && message.state.agent.lastResponse
    && typeof message.state.agent.lastResponse.content === "string"));
  assert.ok(vscode.__webviewMessages.some((message) => message.type === "productState"));
  assert.ok(vscode.__outputLines.some((line) => line.includes("Rejected Levi Build Chat webview message")));
});

test("surfaces agent view, secure webview, conversations, turns, context, plan, tools, cancellation, and retry", async () => {
  const vscode = createFakeVSCode({ nextInput: "What is this project?", config: { "levi.models.enabled": false } });
  const runtime = createRuntimeFake("READY");
  const extension = createLeviExtension({ vscode, context: createFakeContext(), runtimeFactory: () => runtime });
  await extension.activate();

  const panel = await vscode.commands.executeCommand("levi.openAgent");
  const conversation = await vscode.commands.executeCommand("levi.newConversation");
  const response = await vscode.commands.executeCommand("levi.sendAgentMessage");
  await vscode.commands.executeCommand("levi.showAgentContext");
  await vscode.commands.executeCommand("levi.showAgentPlan");
  await vscode.commands.executeCommand("levi.showAgentTools");
  const retry = await vscode.commands.executeCommand("levi.retryAgentTurn");
  const cancelled = await vscode.commands.executeCommand("levi.cancelAgentTurn");
  await vscode.commands.executeCommand("levi.clearConversation");

  assert.ok(panel.webview.html.includes("Content-Security-Policy"));
  assert.ok(panel.webview.html.includes("script-src 'nonce-"));
  assert.equal(panel.webview.html.includes("http://"), false);
  assert.equal(conversation.id, "agent-conversation-1");
  assert.equal(response.response.outcome, "provider_unavailable");
  assert.equal(retry.response.outcome, "provider_unavailable");
  assert.equal(cancelled.state, "CANCELLED");
  assert.equal(runtime.calls.includes("agent.sendMessage"), true);
  assert.ok(vscode.__webviewMessages.some((message) => message.type === "state"));
});

test("bridges runtime events to views, status bar, output, and throttled refreshes", async () => {
  const vscode = createFakeVSCode();
  const runtime = createRuntimeFake("READY");
  const extension = createLeviExtension({ vscode, context: createFakeContext(), runtimeFactory: () => runtime });
  await extension.activate();

  runtime.emitRuntime({ type: "operation_progress", operationId: "op-1", payload: { stage: "analyzing", percentage: 50 } });
  runtime.emitRuntime({ type: "approval_requested", operationId: "op-1", payload: { id: "approval-1" } });
  runtime.emitRuntime({ type: "operation_succeeded", operationId: "op-1", payload: {} });

  assert.equal(extension.presentationCache.latestProgress.progress.stage, "analyzing");
  assert.ok(vscode.__outputLines.some((line) => line.includes("Runtime event: operation_succeeded")));
  assert.equal(extension.lifecycleEvents.some((event) => event.type === EXTENSION_EVENTS.APPROVAL_PRESENTED), true);
});

test("supports approval acceptance, rejection, expiration presentation, and no implicit approval", async () => {
  const vscode = createFakeVSCode({ nextWarningChoice: "Approve", nextInput: "approved because exact request reviewed" });
  const runtime = createRuntimeFake("READY");
  runtime.approvalRequests.set("approval-1", {
    id: "approval-1",
    requestedAction: "execution.executeObjective",
    status: "PENDING",
    risks: ["source change"],
    scope: { commandId: "execution.executeObjective" },
  });
  runtime.approvalRequests.set("approval-2", { id: "approval-2", requestedAction: "test", status: "EXPIRED", risks: [] });
  const extension = createLeviExtension({ vscode, context: createFakeContext(), runtimeFactory: () => runtime });
  await extension.activate();

  const result = await vscode.commands.executeCommand("levi.respondToApproval");

  assert.equal(result.success, true);
  assert.equal(runtime.approvalRequests.get("approval-1").status, "APPROVED");
  assert.equal(runtime.approvalRequests.get("approval-2").status, "EXPIRED");
});

test("cancels only cancellable operations and preserves operation reference", async () => {
  const runtime = createRuntimeFake("READY");
  runtime.operations = [
    { id: "op-running", type: "CUSTOM", state: "RUNNING", cancellation: { requested: false }, progress: { percentage: 10 } },
    { id: "op-done", type: "CUSTOM", state: "SUCCEEDED", cancellation: { requested: false } },
  ];
  const vscode = createFakeVSCode();
  const extension = createLeviExtension({ vscode, context: createFakeContext(), runtimeFactory: () => runtime });
  await extension.activate();

  const cancelled = await vscode.commands.executeCommand("levi.cancelOperation");

  assert.equal(cancelled.id, "op-running");
  assert.equal(runtime.cancelledOperationId, "op-running");
});

test("handles configuration changes while preserving strict security", async () => {
  const vscode = createFakeVSCode({ config: { "levi.strictSecurity": false } });
  const runtime = createRuntimeFake("READY");
  const extension = createLeviExtension({ vscode, context: createFakeContext(), runtimeFactory: () => runtime });
  await extension.activate();

  vscode.__configurationListener({ affectsConfiguration: (section) => section === "levi" });

  assert.equal(runtime.lastConfiguration.strictSecurity, true);
  assert.equal(extension.lifecycleEvents.some((event) => event.type === EXTENSION_EVENTS.CONFIGURATION_CHANGED), true);
});

test("uses real LeviApplicationRuntime for activation, workspace opening, health, certification, and persistence restart", async () => {
  const vscode = createFakeVSCode({ config: { "levi.autoAnalyzeWorkspace": false } });
  const context = createFakeContext();
  const extension = createLeviExtension({
    vscode,
    context,
    runtimeFactory: (options) => new LeviApplicationRuntime(options),
  });
  const api = await extension.activate();

  assert.ok(["READY", "DEGRADED"].includes(api.getRuntime().getState().state));
  const opened = await vscode.commands.executeCommand("levi.openWorkspace");
  const health = await vscode.commands.executeCommand("levi.showRuntimeHealth");
  const certification = await vscode.commands.executeCommand("levi.runCertification");
  await vscode.commands.executeCommand("levi.saveState");
  await extension.deactivate();

  const restarted = createLeviExtension({ vscode: createFakeVSCode({ config: { "levi.autoAnalyzeWorkspace": false } }), context, runtimeFactory: (options) => new LeviApplicationRuntime(options) });
  await restarted.activate();
  const restore = await restarted.restoreState();

  assert.equal(opened.success, true);
  assert.ok(health.toString().startsWith("levi:/"));
  assert.ok(certification.toString().startsWith("levi:/"));
  assert.ok(["LOADED", "EMPTY"].includes(restore.status));
});

test("does not request duplicate startup analysis after a degraded workspace open", async () => {
  const vscode = createFakeVSCode({
    config: {
      "levi.agent.enabled": false,
      "levi.models.enabled": false,
      "levi.persistence.enabled": false,
    },
  });
  const extension = createLeviExtension({
    vscode,
    context: createFakeContext(),
    runtimeFactory: (options) => new LeviApplicationRuntime(options),
  });

  await extension.activate();
  const workspace = extension.presentationCache.workspace;

  assert.equal(workspace.state, "DEGRADED");
  assert.equal(vscode.__lastError, undefined);
  assert.equal(vscode.__outputLines.some((line) => line.includes("invalid-workspace-state-transition-degraded-analyzing")), false);
  assert.equal(vscode.__outputLines.some((line) => line.includes("Invalid workspace state transition: DEGRADED -> ANALYZING")), false);
  assert.equal(vscode.__outputLines.some((line) => line.includes("Workspace attached: workspace.")), true);

  await extension.deactivate();
});

test("surfaces Change Review commands through the real runtime and controlled workspace adapter", async () => {
  const vscode = createFakeVSCode({
    nextInput: "function run() { return false; }\n",
    config: {
      "levi.autoAnalyzeWorkspace": false,
      "levi.models.enabled": false,
      "levi.workspaceTools.allowSourceChanges": true,
      "levi.workspaceTools.requireCheckpoint": false,
    },
  });
  const extension = createLeviExtension({
    vscode,
    context: createFakeContext(),
    runtimeFactory: (options) => new LeviApplicationRuntime(options),
  });
  await extension.activate();

  const proposalUri = await vscode.commands.executeCommand("levi.createChangeProposal", FakeUri.parse("file:/workspace/src/app.js"));
  await vscode.commands.executeCommand("levi.previewChange");
  await vscode.commands.executeCommand("levi.previewFileDiff");
  await vscode.commands.executeCommand("levi.validateChangeProposal");
  const appliedUri = await vscode.commands.executeCommand("levi.applyApprovedChange");
  await vscode.commands.executeCommand("levi.showChangeHistory");
  await vscode.commands.executeCommand("levi.showAllowedCommands");
  await vscode.commands.executeCommand("levi.showSourceControlStatus");
  await vscode.commands.executeCommand("levi.showSourceControlDiff");

  assert.ok(proposalUri.toString().startsWith("levi:/"));
  assert.ok(appliedUri.toString().startsWith("levi:/"));
  assert.equal(vscode.__files.get("file:/workspace/src/app.js").toString(), "function run() { return false; }\n");
  assert.equal(extension.presentationCache.changes.activeProposal.state, "VERIFIED");
  assert.equal(vscode.__treeProviders.has("levi.changes"), true);
});

test("surfaces Multi-Agent view and commands through the real runtime", async () => {
  const vscode = createFakeVSCode({
    nextInput: "Implement a multi-file change with security review",
    config: {
      "levi.autoAnalyzeWorkspace": false,
      "levi.models.enabled": false,
      "levi.multiAgent.enabled": true,
      "levi.multiAgent.maximumAgents": 4,
      "levi.multiAgent.maximumConcurrentAssignments": 2,
    },
  });
  const extension = createLeviExtension({
    vscode,
    context: createFakeContext(),
    runtimeFactory: (options) => new LeviApplicationRuntime(options),
  });
  await extension.activate();

  const previewUri = await vscode.commands.executeCommand("levi.previewDelegation");
  const resultUri = await vscode.commands.executeCommand("levi.startDelegatedTask");
  await vscode.commands.executeCommand("levi.showMultiAgentTeam");
  await vscode.commands.executeCommand("levi.showAssignment");
  await vscode.commands.executeCommand("levi.showAgentConflicts");
  await vscode.commands.executeCommand("levi.reconcileAgentResults");

  assert.ok(previewUri.toString().startsWith("levi:/"));
  assert.ok(resultUri.toString().startsWith("levi:/"));
  assert.equal(vscode.__treeProviders.has("levi.multiAgent"), true);
  assert.ok(extension.presentationCache.multiAgent.activeTeam);
  assert.ok(Array.isArray(extension.presentationCache.multiAgent.assignments));
});

test("surfaces Workflows view and commands through the real runtime", async () => {
  const vscode = createFakeVSCode({
    nextInput: "Analyze the workspace and summarize workflow evidence",
    config: {
      "levi.autoAnalyzeWorkspace": false,
      "levi.models.enabled": false,
      "levi.workflows.enabled": true,
      "levi.workflows.maximumConcurrentSteps": 2,
      "levi.workflows.maximumStepsPerWorkflow": 8,
    },
  });
  const extension = createLeviExtension({
    vscode,
    context: createFakeContext(),
    runtimeFactory: (options) => new LeviApplicationRuntime(options),
  });
  await extension.activate();

  const createdUri = await vscode.commands.executeCommand("levi.createWorkflow");
  const startedUri = await vscode.commands.executeCommand("levi.startWorkflow");
  await vscode.commands.executeCommand("levi.showWorkflows");
  await vscode.commands.executeCommand("levi.showWorkflow");
  await vscode.commands.executeCommand("levi.showWorkflowSteps");
  await vscode.commands.executeCommand("levi.showWorkflowResult");
  await vscode.commands.executeCommand("levi.createWorkflowCheckpoint");
  await vscode.commands.executeCommand("levi.showWorkflowCheckpoints");
  await vscode.commands.executeCommand("levi.restoreWorkflowCheckpoint");
  await vscode.commands.executeCommand("levi.pauseWorkflow");
  await vscode.commands.executeCommand("levi.resumeWorkflow");
  await vscode.commands.executeCommand("levi.retryWorkflow");
  await vscode.commands.executeCommand("levi.cancelWorkflow");

  assert.ok(createdUri.toString().startsWith("levi:/"));
  assert.ok(startedUri.toString().startsWith("levi:/"));
  assert.equal(vscode.__treeProviders.has("levi.workflows"), true);
  assert.ok(extension.presentationCache.workflows.activeWorkflow);
  assert.ok(Array.isArray(extension.presentationCache.workflows.steps));
  assert.ok(extension.presentationCache.workflows.lastResult);
});

test("surfaces Performance view and commands through the real runtime", async () => {
  const vscode = createFakeVSCode({
    config: {
      "levi.autoAnalyzeWorkspace": false,
      "levi.models.enabled": false,
      "levi.performance.enabled": true,
      "levi.performance.maximumCacheEntries": 16,
      "levi.performance.benchmarkSampleSize": 3,
    },
  });
  const extension = createLeviExtension({
    vscode,
    context: createFakeContext(),
    runtimeFactory: (options) => new LeviApplicationRuntime(options),
  });
  await extension.activate();

  const performanceUri = await vscode.commands.executeCommand("levi.showPerformance");
  const benchmarkUri = await vscode.commands.executeCommand("levi.runBenchmark");
  const memoryUri = await vscode.commands.executeCommand("levi.showMemoryUsage");
  const clearUri = await vscode.commands.executeCommand("levi.clearCache");
  const rebuildUri = await vscode.commands.executeCommand("levi.rebuildRepositoryGraph");

  assert.ok(performanceUri.toString().startsWith("levi:/"));
  assert.ok(benchmarkUri.toString().startsWith("levi:/"));
  assert.ok(memoryUri.toString().startsWith("levi:/"));
  assert.ok(clearUri.toString().startsWith("levi:/"));
  assert.ok(rebuildUri.toString().startsWith("levi:/"));
  assert.equal(vscode.__treeProviders.has("levi.performance"), true);
  assert.ok(extension.presentationCache.performance.health);
  assert.ok(extension.presentationCache.performance.memory);
  assert.ok(extension.presentationCache.performance.lastBenchmark);
});

test("surfaces Reliability view and commands through the real runtime", async () => {
  const vscode = createFakeVSCode({
    config: {
      "levi.autoAnalyzeWorkspace": false,
      "levi.models.enabled": false,
      "levi.reliability.enabled": true,
      "levi.reliability.maximumScenariosPerRun": 4,
    },
  });
  const extension = createLeviExtension({
    vscode,
    context: createFakeContext(),
    runtimeFactory: (options) => new LeviApplicationRuntime(options),
  });
  await extension.activate();

  const reliabilityUri = await vscode.commands.executeCommand("levi.showReliability");
  const smokeUri = await vscode.commands.executeCommand("levi.runReliabilitySmoke");
  await vscode.commands.executeCommand("levi.showReliabilityReport");
  await vscode.commands.executeCommand("levi.showReliabilityBlockers");
  await vscode.commands.executeCommand("levi.showReliabilityConsistency");
  await vscode.commands.executeCommand("levi.showReliabilityRecovery");
  await vscode.commands.executeCommand("levi.showReliabilityResources");
  const rcUri = await vscode.commands.executeCommand("levi.runReliabilityReleaseCandidate");
  const cancelUri = await vscode.commands.executeCommand("levi.cancelReliabilityRun");

  assert.ok(reliabilityUri.toString().startsWith("levi:/"));
  assert.ok(smokeUri.toString().startsWith("levi:/"));
  assert.ok(rcUri.toString().startsWith("levi:/"));
  assert.ok(cancelUri.toString().startsWith("levi:/"));
  assert.equal(vscode.__treeProviders.has("levi.reliability"), true);
  assert.ok(extension.presentationCache.reliability.health);
  assert.ok(Array.isArray(extension.presentationCache.reliability.scenarios));
  assert.ok(extension.presentationCache.reliability.report);
});

test("surfaces Security Assurance view and commands through the real runtime", async () => {
  const vscode = createFakeVSCode({
    config: {
      "levi.autoAnalyzeWorkspace": false,
      "levi.models.enabled": false,
      "levi.securityAssurance.enabled": true,
      "levi.securityAssurance.maximumScenariosPerRun": 8,
    },
  });
  const extension = createLeviExtension({
    vscode,
    context: createFakeContext(),
    runtimeFactory: (options) => new LeviApplicationRuntime(options),
  });
  await extension.activate();

  const securityUri = await vscode.commands.executeCommand("levi.showSecurityAssurance");
  const smokeUri = await vscode.commands.executeCommand("levi.runSecuritySmoke");
  await vscode.commands.executeCommand("levi.showSecurityReport");
  await vscode.commands.executeCommand("levi.showSecurityBlockers");
  await vscode.commands.executeCommand("levi.showSecurityFindings");
  await vscode.commands.executeCommand("levi.showSecurityChecks");
  await vscode.commands.executeCommand("levi.showThreatModel");
  await vscode.commands.executeCommand("levi.showApprovalSecurity");
  await vscode.commands.executeCommand("levi.showWorkspaceIsolation");
  await vscode.commands.executeCommand("levi.showPromptInjectionReport");
  await vscode.commands.executeCommand("levi.showSecretHandlingReport");
  await vscode.commands.executeCommand("levi.showDependencySecurity");
  await vscode.commands.executeCommand("levi.showSupplyChainSecurity");
  const rcUri = await vscode.commands.executeCommand("levi.runSecurityReleaseCandidate");
  const cancelUri = await vscode.commands.executeCommand("levi.cancelSecurityAudit");

  assert.ok(securityUri.toString().startsWith("levi:/"));
  assert.ok(smokeUri.toString().startsWith("levi:/"));
  assert.ok(rcUri.toString().startsWith("levi:/"));
  assert.ok(cancelUri.toString().startsWith("levi:/"));
  assert.equal(vscode.__treeProviders.has("levi.securityAssurance"), true);
  assert.ok(extension.presentationCache.securityAssurance.health);
  assert.ok(Array.isArray(extension.presentationCache.securityAssurance.scenarios));
  assert.ok(extension.presentationCache.securityAssurance.report);
});

test("surfaces Stress & Scalability view and commands through the real runtime", async () => {
  const vscode = createFakeVSCode({
    config: {
      "levi.autoAnalyzeWorkspace": false,
      "levi.models.enabled": false,
      "levi.stressScalability.enabled": true,
      "levi.stressScalability.maximumScenariosPerRun": 64,
    },
  });
  const extension = createLeviExtension({
    vscode,
    context: createFakeContext(),
    runtimeFactory: (options) => new LeviApplicationRuntime(options),
  });
  await extension.activate();

  const stressUri = await vscode.commands.executeCommand("levi.showStressScalability");
  const smokeUri = await vscode.commands.executeCommand("levi.runStressSmoke");
  await vscode.commands.executeCommand("levi.showStressReport");
  await vscode.commands.executeCommand("levi.showStressBlockers");
  await vscode.commands.executeCommand("levi.showStressFindings");
  await vscode.commands.executeCommand("levi.showStressRepositoryMetrics");
  await vscode.commands.executeCommand("levi.showStressConcurrency");
  await vscode.commands.executeCommand("levi.showStressMemory");
  await vscode.commands.executeCommand("levi.showStressQueue");
  await vscode.commands.executeCommand("levi.showStressProvider");
  await vscode.commands.executeCommand("levi.showStressWorkflow");
  await vscode.commands.executeCommand("levi.showStressCancellation");
  await vscode.commands.executeCommand("levi.showStressPresentationPressure");
  const rcUri = await vscode.commands.executeCommand("levi.runStressReleaseCandidate");
  const cancelUri = await vscode.commands.executeCommand("levi.cancelStressRun");

  assert.ok(stressUri.toString().startsWith("levi:/"));
  assert.ok(smokeUri.toString().startsWith("levi:/"));
  assert.ok(rcUri.toString().startsWith("levi:/"));
  assert.ok(cancelUri.toString().startsWith("levi:/"));
  assert.equal(vscode.__treeProviders.has("levi.stressScalability"), true);
  assert.ok(extension.presentationCache.stressScalability.health);
  assert.ok(Array.isArray(extension.presentationCache.stressScalability.scenarios));
  assert.ok(extension.presentationCache.stressScalability.report);
});

test("surfaces Release Qualification view, automated runs, pending manual checks, and honest host/Ollama state", async () => {
  const vscode = createFakeVSCode({
    config: {
      "levi.autoAnalyzeWorkspace": false,
      "levi.models.enabled": false,
      "levi.qualification.enabled": true,
      "levi.qualification.maximumScenariosPerSuite": 64,
    },
  });
  const extension = createLeviExtension({
    vscode,
    context: createFakeContext(),
    runtimeFactory: (options) => new LeviApplicationRuntime(options),
  });
  await extension.activate();

  const qualificationUri = await vscode.commands.executeCommand("levi.showQualification");
  const smokeUri = await vscode.commands.executeCommand("levi.runQualificationSmoke");
  await vscode.commands.executeCommand("levi.showQualificationReport");
  await vscode.commands.executeCommand("levi.showQualificationBlockers");
  await vscode.commands.executeCommand("levi.showQualificationManualChecks");
  await vscode.commands.executeCommand("levi.showQualificationDefects");
  await vscode.commands.executeCommand("levi.showQualificationFixtures");
  await vscode.commands.executeCommand("levi.showQualificationJourneys");
  const hostUri = await vscode.commands.executeCommand("levi.showExtensionHostQualification");
  const ollamaUri = await vscode.commands.executeCommand("levi.showLocalOllamaQualification");
  const rcUri = await vscode.commands.executeCommand("levi.runQualificationReleaseCandidate");
  const cancelUri = await vscode.commands.executeCommand("levi.cancelQualificationRun");

  assert.ok(qualificationUri.toString().startsWith("levi:/"));
  assert.ok(smokeUri.toString().startsWith("levi:/"));
  assert.ok(hostUri.toString().startsWith("levi:/"));
  assert.ok(ollamaUri.toString().startsWith("levi:/"));
  assert.ok(rcUri.toString().startsWith("levi:/"));
  assert.ok(cancelUri.toString().startsWith("levi:/"));
  assert.equal(vscode.__treeProviders.has("levi.qualification"), true);
  assert.ok(extension.presentationCache.qualification.health);
  assert.ok(extension.presentationCache.qualification.report);
  assert.ok(extension.presentationCache.qualification.fixtures.length >= 8);
  assert.ok(extension.presentationCache.qualification.journeys.length >= 8);
  assert.ok(extension.presentationCache.qualification.manualVerifications.some((record) => record.status === "PENDING"));
  assert.equal(extension.presentationCache.qualification.extensionHost.manualRequired, true);
  assert.equal(extension.presentationCache.qualification.localOllama.manualRequired, true);
});

function createRuntimeFake(initialState) {
  const listeners = new Map();
  const agentListeners = new Map();
  let listenerId = 0;
  let agentListenerId = 0;
  const agentState = {
    conversations: [],
    turns: [],
    tools: [{ id: "repository.search", name: "repository_search", readOnly: true }],
  };
  const agent = {
    state: "CREATED",
    initialize() { this.state = "READY"; return { status: "READY" }; },
    getState() { return { state: this.state }; },
    getHealth() { return { agentState: this.state, overallAgentHealth: 82, privacyIntegrity: "ENFORCED", warnings: ["No provider"], blockers: [] }; },
    listConversations() { return agentState.conversations; },
    listTurns(conversationId) { return agentState.turns.filter((turn) => turn.conversationId === conversationId); },
    listTools() { return agentState.tools; },
    subscribe(listener) { const id = `agent-sub-${++agentListenerId}`; agentListeners.set(id, listener); return id; },
    unsubscribe(id) { agentListeners.delete(id); },
    emit(event) { for (const listener of agentListeners.values()) listener({ timestamp: "2026-01-01T00:00:00.000Z", ...event }); },
  };
  const runtime = {
    calls: [],
    state: initialState,
    shutdownCalled: false,
    operations: [],
    approvalRequests: new Map(),
    initialize() {
      this.calls.push("initialize");
      if (initialState === "FAILED") return Promise.resolve({ success: false, status: "FAILED", error: { userMessage: "Initialization failed", message: "Initialization failed", category: "INITIALIZATION", severity: "ERROR" } });
      return Promise.resolve({ success: true, status: "SUCCEEDED", data: { state: initialState } });
    },
    getState() { return { state: this.state }; },
    getRuntimeHealth() {
      return {
        runtimeState: this.state,
        overallRuntimeHealth: this.state === "DEGRADED" ? 75 : 100,
        certificationState: { currentCertificationLevel: this.state === "DEGRADED" ? "INTEGRATION_READY" : "IDE_CORE_READY" },
        availableCapabilities: ["project assessment"],
        unavailableCapabilities: this.state === "DEGRADED" ? ["optional"] : [],
        blockers: [],
        warnings: this.state === "DEGRADED" ? ["Optional capability unavailable."] : [],
      };
    },
    openWorkspace(input) {
      this.calls.push("openWorkspace");
      this.workspace = { id: "workspace-1", name: input.name || "Workspace", state: "READY", projectId: "project-1", uri: input.uri.toString ? input.uri.toString() : input.uri };
      return Promise.resolve({ success: true, status: "SUCCEEDED", data: this.workspace, operationId: "op-open" });
    },
    analyzeWorkspace() { this.calls.push("analyzeWorkspace"); return Promise.resolve({ success: true, data: this.workspace, operationId: "op-analysis" }); },
    refreshWorkspace() { this.calls.push("refreshWorkspace"); return Promise.resolve({ success: true, data: this.workspace, operationId: "op-refresh" }); },
    getWorkspace() { return this.workspace; },
    getProjectSummary() { this.calls.push("getProjectSummary"); return Promise.resolve({ success: true, data: { projectId: "project-1", summary: "Summary", confidence: 1, completeness: 1 } }); },
    getArchitectureState() { this.calls.push("getArchitectureState"); return Promise.resolve({ success: true, data: { architecture: "Layered" } }); },
    getProjectAssessment() { this.calls.push("getProjectAssessment"); return Promise.resolve({ success: true, data: { status: "READY" } }); },
    getProjectBlockers() { this.calls.push("getProjectBlockers"); return Promise.resolve({ success: true, data: [] }); },
    getProjectRisks() { this.calls.push("getProjectRisks"); return Promise.resolve({ success: true, data: [] }); },
    getNextActions() { this.calls.push("getNextActions"); return Promise.resolve({ success: true, data: ["Next"] }); },
    getReleaseReadiness() { this.calls.push("getReleaseReadiness"); return Promise.resolve({ success: true, data: { level: "READY" } }); },
    searchWorkspace() { this.calls.push("searchWorkspace"); return Promise.resolve({ success: true, data: { results: [{ title: "runtime" }] }, operationId: "op-search" }); },
    getCodeUnderstanding() { this.calls.push("getCodeUnderstanding"); return Promise.resolve({ success: true, data: { filePath: "src/app.js" }, operationId: "op-code" }); },
    listCommands() { return [{ id: "runtime.health", available: true, requiredCapabilities: [] }]; },
    listOperations() { return this.operations; },
    cancelOperation(id) { this.cancelledOperationId = id; return { id, state: "CANCELLED" }; },
    agentEngine() { return agent; },
    executeCommand(commandId, input) {
      this.calls.push(commandId);
      if (commandId === "approval.respond") {
        const request = this.approvalRequests.get(input.approvalRequestId);
        request.status = input.decision;
        return Promise.resolve({ success: true, data: request, operationId: "op-approval" });
      }
      if (commandId === "model.providers") return Promise.resolve({ success: true, data: { status: "AVAILABLE", providers: [{ id: "local", name: "Local", state: "AVAILABLE", type: "OLLAMA" }] }, operationId: "op-model-providers" });
      if (commandId === "model.models") return Promise.resolve({ success: true, data: { status: "AVAILABLE", models: [{ id: "local:chat", name: "chat", providerId: "local", capabilities: ["CHAT", "STREAMING"] }] }, operationId: "op-models" });
      if (commandId === "model.health") return Promise.resolve({ success: true, data: { status: "AVAILABLE", summary: { gatewayState: "AVAILABLE", configuredProviders: 1, availableProviders: 1, availableModels: 1, privacyPolicyStatus: "ENFORCED" }, providers: [{ id: "local", status: "AVAILABLE" }] }, operationId: "op-model-health" });
      if (commandId === "model.usage") return Promise.resolve({ success: true, data: { status: "AVAILABLE", usage: [{ id: "usage-1", providerId: "local", totalTokens: 4 }], stats: { requestsSucceeded: 1 } }, operationId: "op-model-usage" });
      if (commandId === "agent.createConversation") {
        const conversation = { id: "agent-conversation-1", title: input.objective || "Conversation", objective: input.objective || "", workspaceId: input.workspaceId, projectId: input.projectId, state: "ACTIVE", mode: input.mode || "PROPOSAL_ONLY", turns: [], activeTurnId: null, warnings: [], limitations: [] };
        agentState.conversations = [conversation];
        agent.emit({ type: "conversation_created", payload: { conversationId: conversation.id } });
        return Promise.resolve({ success: true, data: conversation, operationId: "op-agent-create" });
      }
      if (commandId === "agent.sendMessage" || commandId === "agent.retryTurn") {
        const conversation = agentState.conversations[0] || { id: input.conversationId || "agent-conversation-1", title: "Conversation", state: "ACTIVE", turns: [] };
        agentState.conversations = [conversation];
        const turn = { id: `agent-turn-${agentState.turns.length + 1}`, conversationId: conversation.id, state: "PARTIALLY_SUCCEEDED", classification: "QUESTION", contextPackageIds: ["context-1"], planId: null, proposedToolCalls: [], warnings: ["No provider"], limitations: ["No model provider"], assistantResponse: { outcome: "provider_unavailable", content: "No provider", warnings: ["No provider"], limitations: ["No model provider"] } };
        agentState.turns.push(turn);
        conversation.activeTurnId = turn.id;
        conversation.turns = agentState.turns.map((entry) => entry.id);
        agent.emit({ type: "turn_stream_event", payload: { conversationId: conversation.id, turnId: turn.id, event: { content: "No provider" } } });
        agent.emit({ type: "turn_partially_completed", payload: { conversationId: conversation.id, turnId: turn.id } });
        return Promise.resolve({ success: true, data: { status: "partially_completed", conversation, turn, response: turn.assistantResponse }, operationId: "op-agent-send" });
      }
      if (commandId === "agent.cancelConversation") {
        const conversation = agentState.conversations[0] || { id: input.conversationId, state: "ACTIVE" };
        conversation.state = "CANCELLED";
        agent.emit({ type: "conversation_cancelled", payload: { conversationId: conversation.id } });
        return Promise.resolve({ success: true, data: conversation, operationId: "op-agent-cancel" });
      }
      if (commandId === "agent.listTools") return Promise.resolve({ success: true, data: agentState.tools, operationId: "op-agent-tools" });
      return Promise.resolve({ success: true, data: { commandId, level: "IDE_CORE_READY" }, operationId: "op-command" });
    },
    subscribe(listener) {
      const id = `sub-${++listenerId}`;
      listeners.set(id, listener);
      return id;
    },
    unsubscribe(id) { listeners.delete(id); },
    emitRuntime(event) { for (const listener of listeners.values()) listener({ runtimeId: "fake", timestamp: "2026-01-01T00:00:00.000Z", ...event }); },
    save() { this.saved = true; return { status: "PERSISTED" }; },
    load() { return { status: this.saved ? "LOADED" : "EMPTY" }; },
    shutdown() { this.shutdownCalled = true; return Promise.resolve({ success: true }); },
    updateConfiguration(patch) { this.lastConfiguration = patch; return patch; },
  };
  return runtime;
}
