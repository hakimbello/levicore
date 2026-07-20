const path = require("node:path");
const { requireRuntime } = require("./runtime-loader");
const { LeviApplicationRuntime } = requireRuntime("levi-application-runtime.js");
const { InMemoryCredentialResolver } = requireRuntime("credential-resolver.js");
const { ModelCapabilityTypes, ModelProviderGateway, PrivacyClassifications, ProviderStates, ProviderTypes, RoutingStrategies } = requireRuntime("model-provider-gateway.js");
const { OllamaProviderAdapter } = requireRuntime("providers/ollama-provider-adapter.js");
const { OpenAICompatibleProviderAdapter } = requireRuntime("providers/openai-compatible-provider-adapter.js");
const { NodeHttpTransport } = requireRuntime("transports/http-transport.js");
const { EXTENSION_COMMANDS, EXTENSION_EVENTS, TERMINAL_RUNTIME_EVENTS, UI_BOUNDS } = require("./constants");
const { presentRuntimeError } = require("./errors");
const { renderDocument } = require("./presentation");
const { ProductExperienceController } = require("./product-experience/product-experience-controller");
const { safeText, serializeForExtension } = require("./safe-json");
const { createViewProviders } = require("./view-providers");
const { LeviVirtualDocumentProvider } = require("./virtual-documents");
const { VSCodeSecretCredentialResolver } = require("./vscode-credential-resolver");
const { VSCodeWorkspaceAdapter } = require("./vscode-workspace-adapter");
const { VSCodeWorkspaceMutationAdapter } = require("./vscode-workspace-mutation-adapter");

class LeviVSCodeExtension {
  constructor(options = {}) {
    this.vscode = options.vscode;
    this.context = options.context || { subscriptions: [] };
    this.runtimeFactory = options.runtimeFactory || ((runtimeOptions) => new LeviApplicationRuntime(runtimeOptions));
    this.output = null;
    this.statusBar = null;
    this.modelStatusBar = null;
    this.workspaceAdapter = null;
    this.workspaceMutationAdapter = null;
    this.runtime = null;
    this.modelGateway = null;
    this.agent = null;
    this.agentSubscriptionId = null;
    this.agentPanel = null;
    this.productExperience = null;
    this.credentialResolver = null;
    this.runtimeSubscriptionId = null;
    this.viewProviders = null;
    this.documentProvider = null;
    this.disposables = [];
    this.presentationCache = {
      runtimeState: "CREATED",
      health: null,
      workspace: null,
      productExperience: null,
      project: null,
      operations: [],
      approvals: [],
      modelProviders: [],
      models: [],
      modelHealth: null,
      modelUsage: [],
      agent: {
        health: null,
        conversations: [],
        activeConversation: null,
        activeTurn: null,
        lastResponse: null,
        contextSummary: [],
        planSummary: [],
        mode: "PROPOSAL_ONLY",
      },
      changes: {
        health: null,
        proposals: [],
        activeProposal: null,
        lastValidation: null,
        lastApplication: null,
      },
      multiAgent: {
        health: null,
        teams: [],
        activeTeam: null,
        assignments: [],
        conflicts: [],
        lastPreview: null,
        lastResult: null,
      },
      workflows: {
        health: null,
        items: [],
        activeWorkflow: null,
        steps: [],
        readySteps: [],
        checkpoints: [],
        decisions: [],
        lastResult: null,
      },
      performance: {
        state: "UNCONFIGURED",
        health: null,
        stats: null,
        cache: null,
        memory: null,
        graph: null,
        benchmarks: [],
        activeContexts: [],
        lastBenchmark: null,
      },
      reliability: {
        state: "UNCONFIGURED",
        health: null,
        stats: null,
        scenarios: [],
        runs: [],
        activeRun: null,
        report: null,
        blockers: [],
        findings: [],
        consistency: null,
        recovery: null,
        resources: null,
        certification: null,
      },
      securityAssurance: {
        state: "UNCONFIGURED",
        health: null,
        stats: null,
        scenarios: [],
        runs: [],
        activeRun: null,
        report: null,
        blockers: [],
        findings: [],
        checks: null,
        certification: null,
      },
      stressScalability: {
        state: "UNCONFIGURED",
        health: null,
        stats: null,
        profiles: [],
        repositories: [],
        scenarios: [],
        runs: [],
        activeRun: null,
        report: null,
        blockers: [],
        findings: [],
        checks: null,
        certification: null,
      },
      qualification: {
        state: "UNCONFIGURED",
        health: null,
        stats: null,
        fixtures: [],
        journeys: [],
        suites: [],
        scenarios: [],
        runs: [],
        activeRun: null,
        report: null,
        blockers: [],
        manualVerifications: [],
        defects: [],
        extensionHost: null,
        localOllama: null,
        certification: null,
      },
      activeOperationCount: 0,
      pendingApprovalCount: 0,
      activationStatus: "CREATED",
      extensionEvents: [],
      lastError: null,
    };
    this.pendingRefresh = null;
    this.refreshing = false;
    this.disposed = false;
    this.lifecycleEvents = [];
  }

  async activate() {
    this.recordExtensionEvent(EXTENSION_EVENTS.ACTIVATION_STARTED);
    if (!this.isEnabled()) {
      this.presentationCache.activationStatus = "DISABLED";
      return this.exports();
    }
    this.createChannels();
    this.outputLine("Levi extension activation started.");
    this.workspaceAdapter = new VSCodeWorkspaceAdapter({
      vscode: this.vscode,
      getConfiguration: () => this.workspaceAdapterConfiguration(),
      output: this.output,
    });
    this.workspaceMutationAdapter = new VSCodeWorkspaceMutationAdapter({
      vscode: this.vscode,
      workspaceAdapter: this.workspaceAdapter,
    });
    this.credentialResolver = this.createCredentialResolver();
    this.modelGateway = this.createModelGateway();
    if (this.modelGateway) this.modelGateway.initialize({ source: "vscode" });
    this.runtime = this.runtimeFactory({
      configuration: this.runtimeConfiguration(),
      workspaceAdapter: this.workspaceAdapter,
      components: this.modelGateway ? { ModelProviderGateway: this.modelGateway } : {},
      enableWorkspaceTools: this.config().workspaceTools.enabled !== false,
      workspaceMutationAdapter: this.workspaceMutationAdapter,
      workspaceToolConfiguration: this.workspaceToolConfiguration(),
      enableMultiAgentCoordination: this.config().multiAgent.enabled !== false,
      multiAgentConfiguration: this.multiAgentConfiguration(),
      enableDurableWorkflows: this.config().workflows.enabled !== false,
      workflowConfiguration: this.workflowConfiguration(),
      enableRepositoryPerformance: this.config().performance.enabled !== false,
      performanceConfiguration: this.performanceConfiguration(),
      enableReliabilityAssurance: this.config().reliability.enabled !== false,
      reliabilityConfiguration: this.reliabilityConfiguration(),
      enableSecurityAssurance: this.config().securityAssurance.enabled !== false,
      securityAssuranceConfiguration: this.securityAssuranceConfiguration(),
      enableStressScalability: this.config().stressScalability.enabled !== false,
      stressScalabilityConfiguration: this.stressScalabilityConfiguration(),
      enableReleaseQualification: this.config().qualification.enabled !== false,
      releaseQualificationConfiguration: this.qualificationConfiguration(),
      productExperience: this.productExperience,
      enableAgentOrchestration: this.config().agent.enabled !== false,
      agentConfiguration: this.agentConfiguration(),
    });
    this.productExperience = new ProductExperienceController({
      vscode: this.vscode,
      context: this.context,
      extension: this,
    });
    this.productExperience.loadPreferences();
    const qualificationEngine = this.runtime && this.runtime.releaseQualificationEngine && this.runtime.releaseQualificationEngine();
    if (qualificationEngine) qualificationEngine.productExperience = this.productExperience;
    this.registerViews();
    this.registerCommands();
    this.registerVirtualDocuments();
    this.registerWorkspaceHooks();
    this.registerConfigurationHooks();
    this.subscribeRuntimeEvents();
    this.subscribeAgentEvents();
    this.updateStatus("Levi: Initializing");

    if (this.config().autoInitialize !== false) {
      await this.initializeRuntime();
    }
    if (this.config().autoAnalyzeWorkspace !== false && this.runtime && ["READY", "DEGRADED"].includes(this.runtime.getState().state)) {
      await this.openWorkspace({ analyze: true });
    }
    this.refreshViewsNow();
    return this.exports();
  }

  async deactivate() {
    this.recordExtensionEvent(EXTENSION_EVENTS.DEACTIVATION_STARTED);
    this.outputLine("Levi extension deactivation started.");
    this.disposed = true;
    if (this.pendingRefresh) clearTimeout(this.pendingRefresh);
    if (this.runtime && this.runtimeSubscriptionId) {
      this.runtime.unsubscribe(this.runtimeSubscriptionId);
      this.runtimeSubscriptionId = null;
    }
    if (this.agent && this.agentSubscriptionId) {
      this.agent.unsubscribe(this.agentSubscriptionId);
      this.agentSubscriptionId = null;
    }
    if (this.workspaceAdapter) this.workspaceAdapter.dispose();
    if (this.modelGateway) {
      try {
        this.modelGateway.shutdown({ save: false });
      } catch (error) {
        await this.showError(error);
      }
    }
    if (this.runtime) {
      try {
        this.runtime.save();
        await this.runtime.shutdown({ save: true });
      } catch (error) {
        await this.showError(error);
      }
    }
    for (const disposable of this.disposables.splice(0)) {
      if (disposable && typeof disposable.dispose === "function") disposable.dispose();
    }
    if (this.statusBar && typeof this.statusBar.dispose === "function") this.statusBar.dispose();
    if (this.modelStatusBar && typeof this.modelStatusBar.dispose === "function") this.modelStatusBar.dispose();
    if (this.agentPanel && typeof this.agentPanel.dispose === "function") this.agentPanel.dispose();
    if (this.productExperience && typeof this.productExperience.dispose === "function") this.productExperience.dispose();
    if (this.output && typeof this.output.dispose === "function") this.output.dispose();
    this.recordExtensionEvent(EXTENSION_EVENTS.DEACTIVATED);
    return { status: "DEACTIVATED" };
  }

  exports() {
    return {
      getRuntime: () => this.runtime,
      getWorkspaceAdapter: () => this.workspaceAdapter,
      getPresentationState: () => serializeForExtension(this.presentationCache, { maximumSize: UI_BOUNDS.maximumVirtualDocumentSize }),
      getLifecycleEvents: () => this.lifecycleEvents.slice(),
      deactivate: () => this.deactivate(),
    };
  }

  async initializeRuntime() {
    this.ensureRuntime();
    this.recordExtensionEvent(EXTENSION_EVENTS.RUNTIME_INITIALIZING);
    this.outputLine("Runtime initialization requested.");
    const result = await this.runtime.initialize({ skipChecks: true });
    this.agent = this.runtime.agentEngine && this.runtime.agentEngine();
    if (this.agent && this.config().agent.enabled !== false && this.agent.getState && this.agent.getState().state === "CREATED") {
      this.agent.initialize({ load: this.config().agent.persistConversationSummaries !== false });
    }
    this.presentationCache.runtimeState = this.runtime.getState().state;
    this.presentationCache.health = this.runtime.getRuntimeHealth({ skipChecks: true });
    if (!result.success) {
      this.presentationCache.activationStatus = "FAILED";
      this.recordExtensionEvent(EXTENSION_EVENTS.RUNTIME_FAILED, { error: result.error });
      this.updateStatus("Levi: Failed", result.error && result.error.userMessage);
      await this.showError(result.error || result);
      return result;
    }
    if (this.runtime.getState().state === "DEGRADED") {
      this.presentationCache.activationStatus = "DEGRADED";
      this.recordExtensionEvent(EXTENSION_EVENTS.RUNTIME_DEGRADED);
      this.updateStatus("Levi: Degraded");
    } else {
      this.presentationCache.activationStatus = "READY";
      this.recordExtensionEvent(EXTENSION_EVENTS.RUNTIME_READY);
      this.updateStatus("Levi: Ready");
    }
    this.outputLine(`Runtime initialized: ${this.runtime.getState().state}.`);
    return result;
  }

  async openWorkspace(options = {}) {
    this.ensureRuntime();
    const input = this.workspaceInput();
    const result = await this.withLeviProgress("Opening Levi workspace", "levi.openWorkspace", () => this.runtime.openWorkspace(input, options));
    if (!result.success) return result;
    this.presentationCache.workspace = result.data;
    this.recordExtensionEvent(EXTENSION_EVENTS.WORKSPACE_ATTACHED, { workspaceId: result.data.id });
    this.outputLine(`Workspace attached: ${result.data.name || result.data.id}.`);
    const watcherId = this.workspaceAdapter.watchWorkspace(result.data, (event) => this.onWorkspaceFileEvent(event), {});
    this.disposables.push({ dispose: () => this.workspaceAdapter.unwatchWorkspace(watcherId) });
    this.refreshViewsNow();
    return result;
  }

  async analyzeProject() {
    const workspace = await this.ensureWorkspace();
    return this.withLeviProgress("Analyzing Levi project", "levi.analyzeProject", async () => {
      const result = await this.runtime.analyzeWorkspace(workspace.id, {});
      await this.refreshProjectCache(workspace.id);
      return result;
    });
  }

  async refreshWorkspace() {
    const workspace = await this.ensureWorkspace();
    return this.withLeviProgress("Refreshing Levi workspace", "levi.refreshWorkspace", async () => {
      const result = await this.runtime.refreshWorkspace(workspace.id, {});
      this.presentationCache.workspace = this.runtime.getWorkspace(workspace.id);
      await this.refreshProjectCache(workspace.id);
      return result;
    });
  }

  async showRuntimeHealth() {
    this.presentationCache.health = this.runtime.getRuntimeHealth({ skipChecks: true });
    return this.showDocument("runtime-health", "Runtime Health", this.presentationCache.health);
  }

  async showCapabilities() {
    return this.showDocument("capabilities", "Levi Capabilities", this.runtime.listCommands().map((command) => ({
      id: command.id,
      available: command.available,
      requiredCapabilities: command.requiredCapabilities,
      unavailableReason: command.unavailableReason,
    })));
  }

  async showCertification(run = false) {
    const result = run
      ? await this.withLeviProgress("Running Levi certification", "levi.runCertification", () => this.runtime.executeCommand("runtime.certification", { verifyDeterminism: false }))
      : await this.runtime.executeCommand("runtime.certification", { verifyDeterminism: false });
    const data = result.data || result;
    this.outputLine(`Certification result: ${safeText(data, { maximumSize: 1000 })}`);
    return this.showDocument("certification", "Levi Certification", data);
  }

  async showProjectPart(kind) {
    const workspace = await this.ensureWorkspace();
    const commandByKind = {
      summary: () => this.runtime.getProjectSummary(workspace.id),
      architecture: () => this.runtime.getArchitectureState(workspace.id),
      assessment: () => this.runtime.getProjectAssessment(workspace.id),
      blockers: () => this.runtime.getProjectBlockers(workspace.id),
      risks: () => this.runtime.getProjectRisks(workspace.id),
      nextActions: () => this.runtime.getNextActions(workspace.id),
      releaseReadiness: () => this.runtime.getReleaseReadiness(workspace.id),
    };
    const result = await commandByKind[kind]();
    if (!result.success) return this.showError(result.error || result);
    await this.refreshProjectCache(workspace.id);
    return this.showDocument(`project-${kind}`, `Project ${titleCase(kind)}`, result.data);
  }

  async searchWorkspace() {
    const workspace = await this.ensureWorkspace();
    const query = await this.vscode.window.showInputBox({ prompt: "Search with Levi", placeHolder: "Search query" });
    if (!query) return null;
    const result = await this.withLeviProgress("Searching Levi workspace", "levi.searchWorkspace", () => this.runtime.searchWorkspace(workspace.id, query));
    if (!result.success) return this.showError(result.error || result);
    return this.showDocument("workspace-search", "Levi Workspace Search", result.data);
  }

  async understandCurrentFile(uriInput) {
    const workspace = await this.ensureWorkspace();
    const uri = uriInput || this.vscode.window.activeTextEditor && this.vscode.window.activeTextEditor.document && this.vscode.window.activeTextEditor.document.uri;
    if (!uri) {
      await this.vscode.window.showWarningMessage("Levi needs an active editor or selected file to understand code.");
      return null;
    }
    const resolved = this.workspaceAdapter.resolvePath(workspace, uri.toString ? uri.toString() : String(uri));
    const result = await this.withLeviProgress("Understanding file with Levi", "levi.understandCurrentFile", () => this.runtime.getCodeUnderstanding(workspace.id, { filePath: resolved }));
    if (!result.success) return this.showError(result.error || result);
    return this.showDocument("code-understanding", "Levi Code Understanding", result.data);
  }

  async showOperations() {
    this.presentationCache.operations = this.runtime.listOperations();
    this.refreshViewsNow();
    return this.showDocument("operations", "Levi Operations", this.presentationCache.operations);
  }

  async cancelOperation() {
    const operations = this.runtime.listOperations().filter((operation) => operation.cancellation && operation.cancellation.requested !== true && !["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(operation.state));
    if (!operations.length) {
      await this.vscode.window.showInformationMessage("No cancellable Levi operation is active.");
      return null;
    }
    const selected = await this.vscode.window.showQuickPick(operations.map((operation) => ({
      label: `${operation.type} (${operation.state})`,
      description: operation.id,
      operation,
    })), { placeHolder: "Select a Levi operation to cancel" });
    if (!selected) return null;
    this.recordExtensionEvent(EXTENSION_EVENTS.OPERATION_CANCEL_REQUESTED, { operationId: selected.operation.id });
    const result = this.runtime.cancelOperation(selected.operation.id, "Cancelled from VS Code.");
    this.refreshViewsNow();
    return result;
  }

  async showApprovals() {
    this.presentationCache.approvals = this.approvals();
    this.refreshViewsNow();
    return this.showDocument("approvals", "Levi Approvals", this.presentationCache.approvals);
  }

  async respondToApproval() {
    const pending = this.approvals().filter((approval) => approval.status === "PENDING");
    if (!pending.length) {
      await this.vscode.window.showInformationMessage("No pending Levi approval requests.");
      return null;
    }
    const selected = await this.vscode.window.showQuickPick(pending.map((approval) => ({
      label: approval.requestedAction || approval.title,
      description: approval.id,
      detail: `Risks: ${(approval.risks || []).join(", ") || "none"}`,
      approval,
    })), { placeHolder: "Select a Levi approval request" });
    if (!selected) return null;
    this.recordExtensionEvent(EXTENSION_EVENTS.APPROVAL_PRESENTED, { approvalRequestId: selected.approval.id });
    const decision = await this.vscode.window.showWarningMessage(
      `Levi approval requested: ${selected.approval.requestedAction || selected.approval.title}`,
      { modal: true, detail: safeText({ risks: selected.approval.risks, scope: selected.approval.scope }, { maximumSize: 1000 }) },
      "Approve",
      "Reject"
    );
    if (!decision) return null;
    const reason = await this.vscode.window.showInputBox({ prompt: `Reason for ${decision.toLowerCase()}ing this Levi request`, value: "" });
    const response = await this.runtime.executeCommand("approval.respond", {
      approvalRequestId: selected.approval.id,
      decision: decision === "Approve" ? "APPROVED" : "REJECTED",
      reason: reason || null,
    });
    this.recordExtensionEvent(EXTENSION_EVENTS.APPROVAL_RESOLVED, { approvalRequestId: selected.approval.id, decision });
    this.refreshViewsNow();
    if (!response.success) await this.showError(response.error || response);
    return response;
  }

  async saveState() {
    const result = this.runtime.save();
    this.outputLine(`Runtime state saved: ${safeText(result, { maximumSize: 1000 })}`);
    return result;
  }

  async restoreState() {
    try {
      const result = this.runtime.load({ emptyOnCorruption: true });
      this.recordExtensionEvent(result && result.status === "LOADED" ? EXTENSION_EVENTS.PERSISTENCE_RESTORED : EXTENSION_EVENTS.PERSISTENCE_FAILED, result);
      this.refreshViewsNow();
      return result;
    } catch (error) {
      this.recordExtensionEvent(EXTENSION_EVENTS.PERSISTENCE_FAILED, { error: error.message });
      await this.showError(error);
      return null;
    }
  }

  async showModelProviders() {
    const result = await this.runtime.executeCommand("model.providers", {});
    const data = result.data || result;
    this.presentationCache.modelProviders = data.providers || [];
    this.updateModelStatus();
    this.refreshViewsNow();
    return this.showDocument("model-providers", "Levi Model Providers", data);
  }

  async showModels() {
    const result = await this.runtime.executeCommand("model.models", { availableOnly: false });
    const data = result.data || result;
    this.presentationCache.models = data.models || [];
    this.updateModelStatus();
    this.refreshViewsNow();
    return this.showDocument("models", "Levi Models", data);
  }

  async showModelHealth(check = false) {
    const result = await this.withLeviProgress("Checking Levi model providers", "levi.showModelHealth", () => this.runtime.executeCommand("model.health", { check }));
    const data = result.data || result;
    this.presentationCache.modelHealth = data.summary || data;
    if (Array.isArray(data.providers) && data.providers.length) this.presentationCache.modelProviders = data.providers;
    this.updateModelStatus();
    this.refreshViewsNow();
    return this.showDocument("model-health", "Levi Model Provider Health", data);
  }

  async selectModel() {
    const result = await this.runtime.executeCommand("model.models", { availableOnly: false });
    const models = result.data && result.data.models || [];
    if (!models.length) {
      await this.vscode.window.showInformationMessage("No Levi model is configured.");
      return null;
    }
    const selected = await this.vscode.window.showQuickPick(models.map((model) => ({
      label: model.name || model.id,
      description: model.providerId,
      detail: (model.capabilities || []).join(", "),
      model,
    })), { placeHolder: "Select default Levi model" });
    if (!selected) return null;
    this.presentationCache.selectedModel = selected.model;
    this.updateModelStatus();
    return selected.model;
  }

  async showModelUsage() {
    const result = await this.runtime.executeCommand("model.usage", {});
    const data = result.data || result;
    this.presentationCache.modelUsage = data.usage || [];
    this.refreshViewsNow();
    return this.showDocument("model-usage", "Levi Model Usage", data);
  }

  async configureProviderCredential() {
    const reference = await this.vscode.window.showInputBox({ prompt: "Credential reference", placeHolder: "openai-compatible-api-key" });
    if (!reference) return null;
    const value = await this.vscode.window.showInputBox({ prompt: `Secret value for ${reference}`, password: true });
    if (!value) return null;
    const result = await this.credentialResolver.setCredential(reference, value);
    await this.vscode.window.showInformationMessage(`Stored Levi provider credential reference: ${reference}`);
    return result;
  }

  async clearProviderCredential() {
    const reference = await this.vscode.window.showInputBox({ prompt: "Credential reference to clear", placeHolder: "openai-compatible-api-key" });
    if (!reference) return null;
    const result = await this.credentialResolver.clearCredential(reference);
    await this.vscode.window.showInformationMessage(`Cleared Levi provider credential reference: ${reference}`);
    return result;
  }

  async openProductExperience() {
    return this.productExperience.openCopilot();
  }

  async focusComposer() {
    return this.productExperience.focusComposer();
  }

  async newProductChat() {
    return this.productExperience.newChat({ mode: this.config().experience.defaultMode });
  }

  async showEnvironment() {
    return this.productExperience.showEnvironment();
  }

  async showActiveWorkflow() {
    return this.productExperience.showActiveWorkflow();
  }

  async showActiveApproval() {
    return this.productExperience.showActiveApproval();
  }

  async showActiveChange() {
    return this.productExperience.showActiveChange();
  }

  async openOnboarding() {
    return this.productExperience.openOnboarding();
  }

  async showContext() {
    return this.productExperience.showContext();
  }

  async showTechnicalDetails() {
    return this.productExperience.showTechnicalDetails();
  }

  async openAgent() {
    this.ensureRuntime();
    this.refreshAgentPresentationCache();
    if (!this.vscode.window.createWebviewPanel) {
      return this.showDocument("agent", "Levi Agent", this.presentationCache.agent);
    }
    if (!this.agentPanel) {
      this.agentPanel = this.vscode.window.createWebviewPanel("leviAgent", "Levi Agent", this.vscode.ViewColumn ? this.vscode.ViewColumn.One : 1, {
        enableScripts: true,
        retainContextWhenHidden: true,
      });
      this.agentPanel.webview.html = this.agentWebviewHtml(this.presentationCache.agent);
      if (this.agentPanel.webview.onDidReceiveMessage) {
        this.track(this.agentPanel.webview.onDidReceiveMessage((message) => this.handleAgentWebviewMessage(message)));
      }
      if (this.agentPanel.onDidDispose) this.agentPanel.onDidDispose(() => { this.agentPanel = null; });
    }
    this.postAgentWebviewState();
    return this.agentPanel;
  }

  async newConversation(input = {}) {
    const workspace = this.presentationCache.workspace || await this.ensureWorkspace();
    const objective = input.objective || await this.vscode.window.showInputBox({ prompt: "Levi agent objective", placeHolder: "Ask a project question or request a proposal" });
    if (!objective) return null;
    const result = await this.runtime.executeCommand("agent.createConversation", {
      workspaceId: workspace && workspace.id,
      projectId: workspace && workspace.projectId,
      objective,
      mode: this.config().agent.defaultMode,
    });
    const conversation = result.data || result;
    this.presentationCache.agent.activeConversation = conversation;
    this.refreshAgentPresentationCache();
    this.postAgentWebviewState();
    return conversation;
  }

  async sendAgentMessage(input = {}) {
    let conversation = this.presentationCache.agent.activeConversation;
    if (!conversation && this.config().agent.autoCreateConversation !== false) conversation = await this.newConversation({ objective: input.content || input.message || "" });
    if (!conversation || !conversation.id) {
      await this.vscode.window.showInformationMessage("Create a Levi agent conversation first.");
      return null;
    }
    const content = input.content || input.message || await this.vscode.window.showInputBox({ prompt: "Message Levi agent", placeHolder: "Ask a question or request a proposal" });
    if (!content) return null;
    const result = await this.withLeviProgress("Running Levi agent turn", "levi.sendAgentMessage", () => this.runtime.executeCommand("agent.sendMessage", {
      conversationId: conversation.id,
      message: { content, privacyClassification: input.privacyClassification },
      options: { stream: this.config().agent.enableStreaming !== false },
    }));
    const data = result.data || result;
    this.presentationCache.agent.lastResponse = data.response || data;
    this.refreshAgentPresentationCache();
    this.postAgentWebviewState();
    return data;
  }

  async cancelAgentTurn() {
    const turn = this.presentationCache.agent.activeTurn;
    const conversation = this.presentationCache.agent.activeConversation;
    if (!turn || !conversation) {
      await this.vscode.window.showInformationMessage("No active Levi agent turn is available.");
      return null;
    }
    const result = await this.runtime.executeCommand("agent.cancelConversation", { conversationId: conversation.id, reason: "Cancelled from VS Code." });
    this.refreshAgentPresentationCache();
    this.postAgentWebviewState();
    return result.data || result;
  }

  async retryAgentTurn() {
    const turn = this.presentationCache.agent.activeTurn;
    if (!turn) {
      await this.vscode.window.showInformationMessage("No Levi agent turn is available to retry.");
      return null;
    }
    const result = await this.withLeviProgress("Retrying Levi agent turn", "levi.retryAgentTurn", () => this.runtime.executeCommand("agent.retryTurn", { turnId: turn.id }));
    this.refreshAgentPresentationCache();
    this.postAgentWebviewState();
    return result.data || result;
  }

  async showAgentContext() {
    this.refreshAgentPresentationCache();
    return this.showDocument("agent-context", "Levi Agent Context", {
      contextSummary: this.presentationCache.agent.contextSummary,
      activeTurn: this.presentationCache.agent.activeTurn,
    });
  }

  async showAgentPlan() {
    this.refreshAgentPresentationCache();
    return this.showDocument("agent-plan", "Levi Agent Plan", {
      planSummary: this.presentationCache.agent.planSummary,
      activeConversation: this.presentationCache.agent.activeConversation,
    });
  }

  async showAgentTools() {
    const result = await this.runtime.executeCommand("agent.listTools", {});
    return this.showDocument("agent-tools", "Levi Agent Tools", result.data || result);
  }

  async clearConversation() {
    const conversation = this.presentationCache.agent.activeConversation;
    if (!conversation) return null;
    const result = await this.runtime.executeCommand("agent.cancelConversation", { conversationId: conversation.id, reason: "Cleared from VS Code." });
    this.presentationCache.agent.activeConversation = null;
    this.presentationCache.agent.activeTurn = null;
    this.presentationCache.agent.lastResponse = null;
    this.refreshAgentPresentationCache();
    this.postAgentWebviewState();
    return result.data || result;
  }

  async createChangeProposal(uriInput) {
    const workspace = await this.ensureWorkspace();
    const uri = uriInput && uriInput.toString ? uriInput : this.vscode.window.activeTextEditor && this.vscode.window.activeTextEditor.document && this.vscode.window.activeTextEditor.document.uri;
    if (!uri) {
      await this.vscode.window.showInformationMessage("Open a file before creating a Levi change proposal.");
      return null;
    }
    const relativePath = this.workspaceMutationAdapter.relative(uri);
    const read = await this.workspaceMutationAdapter.readFile(workspace, uri, {});
    const proposed = await this.vscode.window.showInputBox({ prompt: "Replacement text for Levi change proposal", value: read.content });
    if (proposed === undefined) return null;
    const result = await this.runtime.executeCommand("change.createProposal", {
      workspace,
      title: `Update ${relativePath}`,
      fileChanges: [{
        operation: "UPDATE",
        path: relativePath,
        originalContent: read.content,
        proposedContent: proposed,
        expectedHash: read.hash,
      }],
    });
    const proposal = result.data || result;
    this.presentationCache.changes.activeProposal = proposal;
    await this.refreshChangesPresentationCache();
    return this.showDocument("change-proposal", "Levi Change Proposal", proposal);
  }

  async previewChange() {
    const proposal = this.activeChangeProposal();
    if (!proposal) return this.noActiveChange();
    const result = await this.runtime.executeCommand("change.preview", { proposalId: proposal.id });
    const preview = result.data || result;
    this.presentationCache.changes.activeProposal = { ...proposal, preview };
    return this.showDocument("change-preview", "Levi Change Preview", preview);
  }

  async previewFileDiff() {
    const proposal = this.activeChangeProposal();
    if (!proposal) return this.noActiveChange();
    const result = await this.runtime.executeCommand("change.preview", { proposalId: proposal.id });
    const preview = result.data || result;
    const uri = this.documentProvider.setDocument(`diff-${proposal.id}`, `Levi Diff ${proposal.id}`, preview.patch && preview.patch.diff || preview);
    const document = await this.vscode.workspace.openTextDocument(uri);
    return this.vscode.window.showTextDocument(document);
  }

  async validateChangeProposal() {
    const proposal = this.activeChangeProposal();
    if (!proposal) return this.noActiveChange();
    const result = await this.runtime.executeCommand("change.validateProposal", { proposalId: proposal.id });
    this.presentationCache.changes.lastValidation = result.data || result;
    await this.refreshChangesPresentationCache();
    return this.showDocument("change-validation", "Levi Change Validation", result.data || result);
  }

  async applyApprovedChange() {
    const proposal = this.activeChangeProposal();
    if (!proposal) return this.noActiveChange();
    if (this.vscode.workspace.isTrusted === false) {
      await this.vscode.window.showWarningMessage("Levi workspace changes are blocked because this VS Code workspace is untrusted.");
      return null;
    }
    const choice = await this.vscode.window.showWarningMessage(`Apply approved Levi change ${proposal.id}?`, { modal: true }, "Approve", "Cancel");
    if (choice !== "Approve") return null;
    const pending = await this.runtime.executeCommand("change.apply", { proposalId: proposal.id });
    if (pending.status === "WAITING_FOR_APPROVAL" || pending.data && pending.data.approvalRequest) {
      const request = pending.approvalRequest || pending.data.approvalRequest;
      await this.runtime.executeCommand("approval.respond", { approvalRequestId: request.id, decision: "APPROVED", decidedBy: "vscode-user" });
      const applied = await this.runtime.executeCommand("change.apply", { proposalId: proposal.id, approvalRequestId: request.id });
      this.presentationCache.changes.lastApplication = applied.data || applied;
      await this.refreshChangesPresentationCache();
      return this.showDocument("change-application", "Levi Change Application", applied.data || applied);
    }
    this.presentationCache.changes.lastApplication = pending.data || pending;
    await this.refreshChangesPresentationCache();
    return this.showDocument("change-application", "Levi Change Application", pending.data || pending);
  }

  async rejectChange() {
    const proposal = this.activeChangeProposal();
    if (!proposal) return this.noActiveChange();
    const result = await this.runtime.executeCommand("change.reject", { proposalId: proposal.id, decidedBy: "vscode-user", reason: "Rejected in VS Code." });
    await this.refreshChangesPresentationCache();
    return this.showDocument("change-rejection", "Levi Change Rejection", result.data || result);
  }

  async revertChange() {
    const proposal = this.activeChangeProposal();
    if (!proposal) return this.noActiveChange();
    const choice = await this.vscode.window.showWarningMessage(`Revert Levi change ${proposal.id}?`, { modal: true }, "Approve", "Cancel");
    if (choice !== "Approve") return null;
    const pending = await this.runtime.executeCommand("change.revert", { proposalId: proposal.id });
    if (pending.status === "WAITING_FOR_APPROVAL" || pending.data && pending.data.approvalRequest) {
      const request = pending.approvalRequest || pending.data.approvalRequest;
      await this.runtime.executeCommand("approval.respond", { approvalRequestId: request.id, decision: "APPROVED", decidedBy: "vscode-user" });
      return this.runtime.executeCommand("change.revert", { proposalId: proposal.id, approvalRequestId: request.id });
    }
    return pending.data || pending;
  }

  async showChangeHistory() {
    await this.refreshChangesPresentationCache();
    return this.showDocument("change-history", "Levi Change History", this.presentationCache.changes);
  }

  async runChangeValidation() {
    const proposal = this.activeChangeProposal();
    if (!proposal) return this.noActiveChange();
    const result = await this.runtime.executeCommand("validation.run", { proposalId: proposal.id });
    this.presentationCache.changes.lastValidation = result.data || result;
    await this.refreshChangesPresentationCache();
    return this.showDocument("change-runtime-validation", "Levi Runtime Validation", result.data || result);
  }

  async showValidationResult() {
    return this.showDocument("validation-result", "Levi Validation Result", this.presentationCache.changes.lastValidation || {});
  }

  async showAllowedCommands() {
    const result = await this.runtime.executeCommand("command.listAllowed", {});
    return this.showDocument("allowed-commands", "Levi Allowed Commands", result.data || result);
  }

  async showSourceControlStatus() {
    const workspace = this.presentationCache.workspace || await this.ensureWorkspace();
    const result = await this.runtime.executeCommand("sourceControl.status", { workspace });
    return this.showDocument("source-control-status", "Levi Source Control Status", result.data || result);
  }

  async showSourceControlDiff() {
    const workspace = this.presentationCache.workspace || await this.ensureWorkspace();
    const result = await this.runtime.executeCommand("sourceControl.diff", { workspace });
    return this.showDocument("source-control-diff", "Levi Source Control Diff", result.data || result);
  }

  async showMultiAgentTeam() {
    await this.refreshMultiAgentPresentationCache();
    return this.showDocument("multi-agent-team", "Levi Multi-Agent Team", this.presentationCache.multiAgent);
  }

  async previewDelegation(input = {}) {
    const workspace = this.presentationCache.workspace || await this.ensureWorkspace();
    const objective = input.objective || await this.vscode.window.showInputBox({ prompt: "Delegation objective", placeHolder: "Describe the bounded task to evaluate" });
    if (!objective) return null;
    const result = await this.runtime.executeCommand("multiAgent.previewDelegation", {
      objective,
      workspaceId: workspace.id,
      projectId: workspace.projectId,
      sourceChanging: /implement|change|edit|fix|patch|refactor/i.test(objective),
      securitySensitive: /security|auth|token|secret|credential|permission/i.test(objective),
    });
    this.presentationCache.multiAgent.lastPreview = result.data || result;
    await this.refreshMultiAgentPresentationCache();
    return this.showDocument("delegation-preview", "Levi Delegation Preview", result.data || result);
  }

  async startDelegatedTask(input = {}) {
    const preview = input.preview || this.presentationCache.multiAgent.lastPreview || await this.previewDelegation(input);
    if (!preview) return null;
    if (preview.eligibility && preview.eligibility.delegate === false) {
      await this.vscode.window.showInformationMessage("Delegation is not warranted for this objective.");
      return this.showDocument("delegation-preview", "Levi Delegation Preview", preview);
    }
    const created = await this.runtime.executeCommand("multiAgent.createTeam", {
      objective: preview.plan.objective,
      workspaceId: preview.plan.workspaceId,
      projectId: preview.plan.projectId,
      plan: preview.plan,
    });
    const team = created.data || created;
    this.presentationCache.multiAgent.activeTeam = team;
    const started = await this.withLeviProgress("Running Levi delegated team", "levi.startDelegatedTask", () => this.runtime.executeCommand("multiAgent.startTeam", { teamId: team.id }));
    this.presentationCache.multiAgent.lastResult = started.data || started;
    await this.refreshMultiAgentPresentationCache();
    return this.showDocument("delegated-team-result", "Levi Delegated Team Result", started.data || started);
  }

  async cancelDelegatedTask() {
    const team = this.presentationCache.multiAgent.activeTeam;
    if (!team) {
      await this.vscode.window.showInformationMessage("No Levi multi-agent team is active.");
      return null;
    }
    const result = await this.runtime.executeCommand("multiAgent.cancelTeam", { teamId: team.id, reason: "Cancelled from VS Code." });
    await this.refreshMultiAgentPresentationCache();
    return this.showDocument("multi-agent-cancelled", "Levi Multi-Agent Cancellation", result.data || result);
  }

  async showAssignment() {
    await this.refreshMultiAgentPresentationCache();
    const assignment = this.presentationCache.multiAgent.assignments[0];
    if (!assignment) {
      await this.vscode.window.showInformationMessage("No Levi multi-agent assignment is available.");
      return null;
    }
    const result = await this.runtime.executeCommand("multiAgent.getAssignment", { assignmentId: assignment.id });
    return this.showDocument("multi-agent-assignment", "Levi Multi-Agent Assignment", result.data || result);
  }

  async retryAssignment() {
    await this.refreshMultiAgentPresentationCache();
    const assignment = this.presentationCache.multiAgent.assignments.find((entry) => ["FAILED", "REJECTED"].includes(entry.state)) || this.presentationCache.multiAgent.assignments[0];
    if (!assignment) return this.showAssignment();
    const result = await this.runtime.executeCommand("multiAgent.retryAssignment", { assignmentId: assignment.id, options: { execute: false } });
    await this.refreshMultiAgentPresentationCache();
    return this.showDocument("multi-agent-assignment-retry", "Levi Assignment Retry", result.data || result);
  }

  async requestAssignmentRevision() {
    await this.refreshMultiAgentPresentationCache();
    const assignment = this.presentationCache.multiAgent.assignments[0];
    if (!assignment) return this.showAssignment();
    const instructions = await this.vscode.window.showInputBox({ prompt: "Revision instructions" });
    if (!instructions) return null;
    const result = await this.runtime.executeCommand("multiAgent.requestRevision", { assignmentId: assignment.id, instructions, options: { execute: false } });
    await this.refreshMultiAgentPresentationCache();
    return this.showDocument("multi-agent-assignment-revision", "Levi Assignment Revision", result.data || result);
  }

  async showAgentConflicts() {
    const result = await this.runtime.executeCommand("multiAgent.getConflicts", {});
    this.presentationCache.multiAgent.conflicts = result.data && result.data.conflicts || result.conflicts || [];
    return this.showDocument("multi-agent-conflicts", "Levi Agent Conflicts", result.data || result);
  }

  async resolveAgentConflict() {
    await this.refreshMultiAgentPresentationCache();
    const conflict = this.presentationCache.multiAgent.conflicts[0];
    if (!conflict) {
      await this.vscode.window.showInformationMessage("No Levi multi-agent conflict is available.");
      return null;
    }
    const result = await this.runtime.executeCommand("multiAgent.resolveConflict", {
      conflictId: conflict.id,
      resolution: { method: conflict.severity === "CRITICAL" ? "ESCALATE_TO_USER" : "DEFER", rationale: "Resolved from VS Code command without bypassing approval." },
    });
    await this.refreshMultiAgentPresentationCache();
    return this.showDocument("multi-agent-conflict-resolution", "Levi Conflict Resolution", result.data || result);
  }

  async reconcileAgentResults() {
    const team = this.presentationCache.multiAgent.activeTeam;
    if (!team) return this.showMultiAgentTeam();
    const result = await this.runtime.executeCommand("multiAgent.reconcile", { teamId: team.id });
    this.presentationCache.multiAgent.lastResult = result.data || result;
    await this.refreshMultiAgentPresentationCache();
    return this.showDocument("multi-agent-reconciliation", "Levi Multi-Agent Reconciliation", result.data || result);
  }

  async showWorkflows() {
    await this.refreshWorkflowPresentationCache();
    return this.showDocument("workflows", "Levi Workflows", this.presentationCache.workflows);
  }

  async createWorkflow(input = {}) {
    const workspace = this.presentationCache.workspace || await this.ensureWorkspace();
    const objective = input.objective || await this.vscode.window.showInputBox({ prompt: "Workflow objective", value: "Execute a bounded multi-step Levi objective" });
    if (!objective) return null;
    const result = await this.runtime.executeCommand("workflow.create", {
      objective,
      title: input.title || objective.slice(0, 80),
      workspaceId: workspace && workspace.id,
      projectId: workspace && workspace.projectId,
      steps: input.steps,
      plan: input.plan,
      metadata: { source: "vscode" },
    });
    this.presentationCache.workflows.activeWorkflow = result.data || result;
    await this.refreshWorkflowPresentationCache();
    return this.showDocument("workflow-created", "Levi Workflow Created", result.data || result);
  }

  async startWorkflow() {
    const workflow = this.activeWorkflow() || await this.createWorkflow();
    if (!workflow) return null;
    const result = await this.withLeviProgress("Running Levi workflow", "levi.startWorkflow", () => this.runtime.executeCommand("workflow.start", { workflowId: workflow.id }));
    this.presentationCache.workflows.lastResult = result.data || result;
    await this.refreshWorkflowPresentationCache();
    return this.showDocument("workflow-start", "Levi Workflow Start", result.data || result);
  }

  async pauseWorkflow() {
    const workflow = this.activeWorkflow();
    if (!workflow) return this.noActiveWorkflow();
    const result = await this.runtime.executeCommand("workflow.pause", { workflowId: workflow.id, reason: "Paused from VS Code." });
    await this.refreshWorkflowPresentationCache();
    return this.showDocument("workflow-pause", "Levi Workflow Pause", result.data || result);
  }

  async resumeWorkflow() {
    const workflow = this.activeWorkflow();
    if (!workflow) return this.noActiveWorkflow();
    const result = await this.runtime.executeCommand("workflow.resume", { workflowId: workflow.id, options: { reconfirmApproval: false } });
    await this.refreshWorkflowPresentationCache();
    return this.showDocument("workflow-resume", "Levi Workflow Resume", result.data || result);
  }

  async cancelWorkflow() {
    const workflow = this.activeWorkflow();
    if (!workflow) return this.noActiveWorkflow();
    const result = await this.runtime.executeCommand("workflow.cancel", { workflowId: workflow.id, reason: "Cancelled from VS Code." });
    await this.refreshWorkflowPresentationCache();
    return this.showDocument("workflow-cancel", "Levi Workflow Cancel", result.data || result);
  }

  async retryWorkflow() {
    const workflow = this.activeWorkflow();
    if (!workflow) return this.noActiveWorkflow();
    const result = await this.runtime.executeCommand("workflow.retry", { workflowId: workflow.id, options: { reconfirmApproval: false } });
    await this.refreshWorkflowPresentationCache();
    return this.showDocument("workflow-retry", "Levi Workflow Retry", result.data || result);
  }

  async showWorkflow() {
    const workflow = this.activeWorkflow();
    if (!workflow) return this.noActiveWorkflow();
    const result = await this.runtime.executeCommand("workflow.explain", { workflowId: workflow.id });
    return this.showDocument("workflow-detail", "Levi Workflow", result.data || result);
  }

  async showWorkflowResult() {
    const workflow = this.activeWorkflow();
    if (!workflow) return this.noActiveWorkflow();
    const result = await this.runtime.executeCommand("workflow.getResult", { workflowId: workflow.id });
    this.presentationCache.workflows.lastResult = result.data || result;
    return this.showDocument("workflow-result", "Levi Workflow Result", result.data || result);
  }

  async showWorkflowSteps() {
    const workflow = this.activeWorkflow();
    if (!workflow) return this.noActiveWorkflow();
    const result = await this.runtime.executeCommand("workflow.listSteps", { workflowId: workflow.id });
    this.presentationCache.workflows.steps = result.data && result.data.steps || result.steps || [];
    return this.showDocument("workflow-steps", "Levi Workflow Steps", this.presentationCache.workflows.steps);
  }

  async retryWorkflowStep() {
    const step = this.activeWorkflowStep((entry) => ["FAILED", "TIMED_OUT", "INTERRUPTED"].includes(entry.state)) || this.activeWorkflowStep();
    if (!step) return this.noActiveWorkflowStep();
    const result = await this.runtime.executeCommand("workflow.retryStep", { stepId: step.id, options: { execute: false, reconfirmApproval: false } });
    await this.refreshWorkflowPresentationCache();
    return this.showDocument("workflow-step-retry", "Levi Workflow Step Retry", result.data || result);
  }

  async skipWorkflowStep() {
    const step = this.activeWorkflowStep((entry) => ["FAILED", "BLOCKED", "BLOCKED_BY_DEPENDENCY", "WAITING_FOR_DEPENDENCY"].includes(entry.state)) || this.activeWorkflowStep();
    if (!step) return this.noActiveWorkflowStep();
    const result = await this.runtime.executeCommand("workflow.skipStep", { stepId: step.id, reason: "Skipped from VS Code." });
    await this.refreshWorkflowPresentationCache();
    return this.showDocument("workflow-step-skip", "Levi Workflow Step Skip", result.data || result);
  }

  async showWorkflowCheckpoints() {
    const workflow = this.activeWorkflow();
    if (!workflow) return this.noActiveWorkflow();
    const result = await this.runtime.executeCommand("workflow.listCheckpoints", { workflowId: workflow.id });
    this.presentationCache.workflows.checkpoints = result.data && result.data.checkpoints || result.checkpoints || [];
    return this.showDocument("workflow-checkpoints", "Levi Workflow Checkpoints", this.presentationCache.workflows.checkpoints);
  }

  async createWorkflowCheckpoint() {
    const workflow = this.activeWorkflow();
    if (!workflow) return this.noActiveWorkflow();
    const result = await this.runtime.executeCommand("workflow.createCheckpoint", { workflowId: workflow.id, type: "MANUAL", metadata: { source: "vscode" } });
    await this.refreshWorkflowPresentationCache();
    return this.showDocument("workflow-checkpoint", "Levi Workflow Checkpoint", result.data || result);
  }

  async restoreWorkflowCheckpoint() {
    const checkpoint = (this.presentationCache.workflows.checkpoints || []).slice(-1)[0];
    if (!checkpoint) {
      await this.vscode.window.showInformationMessage("No Levi workflow checkpoint is selected.");
      return null;
    }
    const result = await this.runtime.executeCommand("workflow.restoreCheckpoint", { checkpointId: checkpoint.id, options: { rebindApprovals: false } });
    await this.refreshWorkflowPresentationCache();
    return this.showDocument("workflow-checkpoint-restore", "Levi Workflow Checkpoint Restore", result.data || result);
  }

  async resolveWorkflowDecision() {
    const decision = (this.presentationCache.workflows.decisions || []).find((entry) => !entry.resolvedAt);
    if (!decision) {
      await this.vscode.window.showInformationMessage("No Levi workflow decision is waiting.");
      return null;
    }
    const selectedOption = await this.vscode.window.showInputBox({ prompt: decision.question, value: decision.options && decision.options[0] && (decision.options[0].id || decision.options[0].label || decision.options[0]) || "" });
    if (!selectedOption) return null;
    const result = await this.runtime.executeCommand("workflow.resolveDecision", { decisionId: decision.id, selectedOption, authority: "user" });
    await this.refreshWorkflowPresentationCache();
    return this.showDocument("workflow-decision", "Levi Workflow Decision", result.data || result);
  }

  async showPerformance() {
    await this.refreshPerformancePresentationCache();
    return this.showDocument("performance", "Levi Repository Performance", this.presentationCache.performance);
  }

  async clearCache() {
    const result = await this.runtime.executeCommand("performance.cache", { action: "clear" });
    await this.refreshPerformancePresentationCache();
    return this.showDocument("performance-cache-clear", "Levi Performance Cache", result.data || result);
  }

  async runBenchmark() {
    const workspace = this.presentationCache.workspace || await this.ensureWorkspace();
    const result = await this.withLeviProgress("Running Levi repository benchmark", "levi.runBenchmark", () => this.runtime.executeCommand("performance.benchmark", { workspaceId: workspace.id, scenario: "all" }));
    const benchmark = result.data && result.data.benchmark || result.benchmark || result.data || result;
    this.presentationCache.performance.lastBenchmark = benchmark;
    if (benchmark && benchmark.id) this.presentationCache.performance.benchmarks = (this.presentationCache.performance.benchmarks || []).concat(benchmark).slice(-10);
    await this.refreshPerformancePresentationCache();
    return this.showDocument("performance-benchmark", "Levi Performance Benchmark", result.data || result);
  }

  async rebuildRepositoryGraph() {
    const workspace = this.presentationCache.workspace || await this.ensureWorkspace();
    const result = await this.withLeviProgress("Rebuilding Levi repository graph", "levi.rebuildRepositoryGraph", () => this.runtime.executeCommand("performance.rebuild", { workspaceId: workspace.id, full: false }));
    await this.refreshPerformancePresentationCache();
    return this.showDocument("performance-rebuild", "Levi Repository Graph Rebuild", result.data || result);
  }

  async showMemoryUsage() {
    const result = await this.runtime.executeCommand("performance.memory", {});
    this.presentationCache.performance.memory = result.data || result;
    await this.refreshPerformancePresentationCache();
    return this.showDocument("performance-memory", "Levi Performance Memory", result.data || result);
  }

  async showReliability() {
    await this.refreshReliabilityPresentationCache();
    return this.showDocument("reliability", "Levi Reliability", this.presentationCache.reliability);
  }

  async runReliabilityProfile(profile) {
    const result = await this.withLeviProgress(`Running Levi reliability ${profile}`, `levi.runReliability${titleCase(profile.toLowerCase())}`, () => this.runtime.executeCommand("reliability.run", { profile }));
    const data = result.data || result;
    this.presentationCache.reliability.activeRun = data.run || null;
    this.presentationCache.reliability.report = data.report || null;
    await this.refreshReliabilityPresentationCache();
    return this.showDocument(`reliability-${profile.toLowerCase()}`, `Levi Reliability ${profile}`, data);
  }

  async cancelReliabilityRun() {
    const run = this.presentationCache.reliability.activeRun || (this.presentationCache.reliability.runs || []).find((entry) => !["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "INVALID", "EXPIRED"].includes(entry.state));
    const result = await this.runtime.executeCommand("reliability.cancel", { runId: run && run.id, reason: "Cancelled from VS Code." });
    await this.refreshReliabilityPresentationCache();
    return this.showDocument("reliability-cancel", "Levi Reliability Cancellation", result.data || result);
  }

  async showReliabilityReport() {
    const result = await this.runtime.executeCommand("reliability.report", { runId: this.presentationCache.reliability.activeRun && this.presentationCache.reliability.activeRun.id });
    this.presentationCache.reliability.report = result.data || result;
    await this.refreshReliabilityPresentationCache();
    return this.showDocument("reliability-report", "Levi Reliability Report", result.data || result);
  }

  async showReliabilityBlockers() {
    const result = await this.runtime.executeCommand("reliability.findings", { filter: { releaseBlocking: true } });
    const data = result.data || result;
    this.presentationCache.reliability.blockers = data.findings || [];
    await this.refreshReliabilityPresentationCache();
    return this.showDocument("reliability-blockers", "Levi Reliability Blockers", data);
  }

  async showReliabilityConsistency() {
    const result = await this.runtime.executeCommand("reliability.consistency", { target: "runtime" });
    this.presentationCache.reliability.consistency = result.data || result;
    await this.refreshReliabilityPresentationCache();
    return this.showDocument("reliability-consistency", "Levi Reliability Consistency", result.data || result);
  }

  async showReliabilityRecovery() {
    const result = await this.runtime.executeCommand("reliability.recovery", {});
    this.presentationCache.reliability.recovery = result.data || result;
    await this.refreshReliabilityPresentationCache();
    return this.showDocument("reliability-recovery", "Levi Reliability Recovery", result.data || result);
  }

  async showReliabilityResources() {
    const result = await this.runtime.executeCommand("reliability.resources", { target: "vscode" });
    this.presentationCache.reliability.resources = result.data || result;
    await this.refreshReliabilityPresentationCache();
    return this.showDocument("reliability-resources", "Levi Reliability Resources", result.data || result);
  }

  async showSecurityAssurance() {
    await this.refreshSecurityAssurancePresentationCache();
    return this.showDocument("security-assurance", "Levi Security Assurance", this.presentationCache.securityAssurance);
  }

  async runSecurityProfile(profile) {
    const result = await this.withLeviProgress(`Running Levi security ${profile}`, `levi.runSecurity${titleCase(profile.toLowerCase())}`, () => this.runtime.executeCommand("securityAssurance.run", { profile }));
    const data = result.data || result;
    this.presentationCache.securityAssurance.activeRun = data.run || null;
    this.presentationCache.securityAssurance.report = data.report || null;
    await this.refreshSecurityAssurancePresentationCache();
    return this.showDocument(`security-${profile.toLowerCase()}`, `Levi Security ${profile}`, data);
  }

  async cancelSecurityAudit() {
    const run = this.presentationCache.securityAssurance.activeRun || (this.presentationCache.securityAssurance.runs || []).find((entry) => !["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "INVALID", "EXPIRED"].includes(entry.state));
    const result = await this.runtime.executeCommand("securityAssurance.cancel", { runId: run && run.id, reason: "Cancelled from VS Code." });
    await this.refreshSecurityAssurancePresentationCache();
    return this.showDocument("security-cancel", "Levi Security Audit Cancellation", result.data || result);
  }

  async showSecurityReport() {
    const result = await this.runtime.executeCommand("securityAssurance.report", { runId: this.presentationCache.securityAssurance.activeRun && this.presentationCache.securityAssurance.activeRun.id });
    this.presentationCache.securityAssurance.report = result.data || result;
    await this.refreshSecurityAssurancePresentationCache();
    return this.showDocument("security-report", "Levi Security Report", result.data || result);
  }

  async showSecurityBlockers() {
    const result = await this.runtime.executeCommand("securityAssurance.findings", { filter: { releaseBlocking: true } });
    const data = result.data || result;
    this.presentationCache.securityAssurance.blockers = data.findings || [];
    await this.refreshSecurityAssurancePresentationCache();
    return this.showDocument("security-blockers", "Levi Security Blockers", data);
  }

  async showSecurityFindings() {
    const result = await this.runtime.executeCommand("securityAssurance.findings", {});
    const data = result.data || result;
    this.presentationCache.securityAssurance.findings = data.findings || [];
    await this.refreshSecurityAssurancePresentationCache();
    return this.showDocument("security-findings", "Levi Security Findings", data);
  }

  async showSecurityChecks() {
    const result = await this.runtime.executeCommand("securityAssurance.check", {});
    this.presentationCache.securityAssurance.checks = result.data || result;
    await this.refreshSecurityAssurancePresentationCache();
    return this.showDocument("security-checks", "Levi Security Checks", result.data || result);
  }

  async showThreatModel() {
    const result = await this.runtime.executeCommand("security.threatModel", {});
    return this.showDocument("security-threat-model", "Levi Security Threat Model", result.data || result);
  }

  async showApprovalSecurity() {
    const result = await this.runtime.executeCommand("security.checkApprovals", {});
    return this.showDocument("security-approval", "Levi Approval Security", result.data || result);
  }

  async showWorkspaceIsolation() {
    const result = await this.runtime.executeCommand("security.checkWorkspaceIsolation", {});
    return this.showDocument("security-workspace-isolation", "Levi Workspace Isolation", result.data || result);
  }

  async showPromptInjectionReport() {
    const result = await this.runtime.executeCommand("security.checkPromptInjection", {});
    return this.showDocument("security-prompt-injection", "Levi Prompt Injection Security", result.data || result);
  }

  async showSecretHandlingReport() {
    const result = await this.runtime.executeCommand("security.checkSecrets", {});
    return this.showDocument("security-secret-handling", "Levi Secret Handling Security", result.data || result);
  }

  async showDependencySecurity() {
    const result = await this.runtime.executeCommand("security.checkDependencies", {});
    return this.showDocument("security-dependencies", "Levi Dependency Security", result.data || result);
  }

  async showSupplyChainSecurity() {
    const result = await this.runtime.executeCommand("security.checkSupplyChain", {});
    return this.showDocument("security-supply-chain", "Levi Supply Chain Security", result.data || result);
  }

  async showStressScalability() {
    await this.refreshStressScalabilityPresentationCache();
    return this.showDocument("stress-scalability", "Levi Stress & Scalability", this.presentationCache.stressScalability);
  }

  async runStressProfile(profile) {
    const result = await this.withLeviProgress(`Running Levi stress ${profile}`, `levi.runStress${titleCase(profile.toLowerCase())}`, () => this.runtime.executeCommand("stress.run", { profile }));
    const data = result.data || result;
    this.presentationCache.stressScalability.activeRun = data.run || null;
    this.presentationCache.stressScalability.report = data.report || null;
    await this.refreshStressScalabilityPresentationCache();
    return this.showDocument(`stress-${profile.toLowerCase()}`, `Levi Stress ${profile}`, data);
  }

  async cancelStressRun() {
    const run = this.presentationCache.stressScalability.activeRun || (this.presentationCache.stressScalability.runs || []).find((entry) => !["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "INVALID", "EXPIRED"].includes(entry.state));
    const result = await this.runtime.executeCommand("stress.cancel", { runId: run && run.id, reason: "Cancelled from VS Code." });
    await this.refreshStressScalabilityPresentationCache();
    return this.showDocument("stress-cancel", "Levi Stress Run Cancellation", result.data || result);
  }

  async showStressReport() {
    const result = await this.runtime.executeCommand("stress.report", { runId: this.presentationCache.stressScalability.activeRun && this.presentationCache.stressScalability.activeRun.id });
    this.presentationCache.stressScalability.report = result.data || result;
    await this.refreshStressScalabilityPresentationCache();
    return this.showDocument("stress-report", "Levi Stress Report", result.data || result);
  }

  async showStressBlockers() {
    const result = await this.runtime.executeCommand("stress.blockers", {});
    const data = result.data || result;
    this.presentationCache.stressScalability.blockers = data.blockers || [];
    await this.refreshStressScalabilityPresentationCache();
    return this.showDocument("stress-blockers", "Levi Stress Blockers", data);
  }

  async showStressFindings() {
    const result = await this.runtime.executeCommand("stress.findings", {});
    const data = result.data || result;
    this.presentationCache.stressScalability.findings = data.findings || [];
    await this.refreshStressScalabilityPresentationCache();
    return this.showDocument("stress-findings", "Levi Stress Findings", data);
  }

  async showStressDomain(commandId, title, documentId) {
    const result = await this.runtime.executeCommand(commandId, {});
    await this.refreshStressScalabilityPresentationCache();
    return this.showDocument(documentId, title, result.data || result);
  }

  async showQualification() {
    await this.refreshQualificationPresentationCache();
    return this.showDocument("qualification", "Levi Release Qualification", this.presentationCache.qualification);
  }

  async runQualificationProfile(profile) {
    const result = await this.withLeviProgress(`Running Levi qualification ${profile}`, `levi.runQualification${titleCase(profile.toLowerCase())}`, () => this.runtime.executeCommand("qualification.run", { profile }));
    const data = result.data || result;
    this.presentationCache.qualification.activeRun = data.run || null;
    this.presentationCache.qualification.report = data.report || null;
    await this.refreshQualificationPresentationCache();
    return this.showDocument(`qualification-${profile.toLowerCase()}`, `Levi Qualification ${profile}`, this.qualificationRunDocument(profile, data));
  }

  qualificationRunDocument(profile, data = {}) {
    const run = data.run || this.presentationCache.qualification.activeRun || {};
    const results = Array.isArray(data.results) ? data.results : [];
    return {
      status: data.status || run.state || "UNKNOWN",
      profile,
      run: {
        id: run.id || null,
        name: run.name || null,
        state: run.state || null,
        score: run.score,
        certification: run.certification || null,
        completedScenarioCount: Array.isArray(run.completedScenarioIds) ? run.completedScenarioIds.length : 0,
        failedScenarioCount: Array.isArray(run.failedScenarioIds) ? run.failedScenarioIds.length : 0,
        manualScenarioCount: Array.isArray(run.manualScenarioIds) ? run.manualScenarioIds.length : 0,
        blockerCount: Array.isArray(run.blockers) ? run.blockers.length : 0,
        startedAt: run.startedAt || null,
        completedAt: run.completedAt || null,
      },
      report: data.report || this.presentationCache.qualification.report || null,
      resultPreview: results.slice(0, UI_BOUNDS.maximumTreeItemsPerSection).map((entry) => ({
        id: entry.id,
        scenarioId: entry.scenarioId,
        domain: entry.domain,
        disposition: entry.disposition,
        manual: Boolean(entry.manualResult),
        defectCount: Array.isArray(entry.defects) ? entry.defects.length : 0,
      })),
      qualification: this.presentationCache.qualification,
      warnings: data.warnings || [],
      limitations: data.limitations || [],
    };
  }

  async cancelQualificationRun() {
    const run = this.presentationCache.qualification.activeRun || (this.presentationCache.qualification.runs || []).find((entry) => !["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "BLOCKED", "CANCELLED", "TIMED_OUT", "INVALID", "EXPIRED"].includes(entry.state));
    const result = await this.runtime.executeCommand("qualification.cancel", { runId: run && run.id, reason: "Cancelled from VS Code." });
    await this.refreshQualificationPresentationCache();
    return this.showDocument("qualification-cancel", "Levi Qualification Cancellation", result.data || result);
  }

  async showQualificationReport() {
    const result = await this.runtime.executeCommand("qualification.report", { runId: this.presentationCache.qualification.activeRun && this.presentationCache.qualification.activeRun.id });
    this.presentationCache.qualification.report = result.data || result;
    await this.refreshQualificationPresentationCache();
    return this.showDocument("qualification-report", "Levi Qualification Report", result.data || result);
  }

  async showQualificationBlockers() {
    const result = await this.runtime.executeCommand("qualification.blockers", {});
    const data = result.data || result;
    this.presentationCache.qualification.blockers = data.blockers || [];
    await this.refreshQualificationPresentationCache();
    return this.showDocument("qualification-blockers", "Levi Qualification Blockers", data);
  }

  async showQualificationManualChecks() {
    const result = await this.runtime.executeCommand("qualification.manual", { pending: false });
    const data = result.data || result;
    this.presentationCache.qualification.manualVerifications = data.manualVerifications || [];
    await this.refreshQualificationPresentationCache();
    return this.showDocument("qualification-manual", "Levi Qualification Manual Checks", data);
  }

  async showQualificationDefects() {
    const result = await this.runtime.executeCommand("qualification.defects", {});
    const data = result.data || result;
    this.presentationCache.qualification.defects = data.defects || [];
    await this.refreshQualificationPresentationCache();
    return this.showDocument("qualification-defects", "Levi Qualification Defects", data);
  }

  async showQualificationFixtures() {
    const result = await this.runtime.executeCommand("qualification.fixtures", {});
    const data = result.data || result;
    this.presentationCache.qualification.fixtures = data.fixtures || [];
    await this.refreshQualificationPresentationCache();
    return this.showDocument("qualification-fixtures", "Levi Qualification Fixtures", data);
  }

  async showQualificationJourneys() {
    const result = await this.runtime.executeCommand("qualification.journeys", {});
    const data = result.data || result;
    this.presentationCache.qualification.journeys = data.journeys || [];
    await this.refreshQualificationPresentationCache();
    return this.showDocument("qualification-journeys", "Levi Qualification Journeys", data);
  }

  async showExtensionHostQualification() {
    const result = await this.runtime.executeCommand("qualification.extensionHost", {});
    this.presentationCache.qualification.extensionHost = result.data || result;
    await this.refreshQualificationPresentationCache();
    return this.showDocument("qualification-extension-host", "Levi Extension Host Qualification", result.data || result);
  }

  async showLocalOllamaQualification() {
    const result = await this.runtime.executeCommand("qualification.localOllama", {});
    this.presentationCache.qualification.localOllama = result.data || result;
    await this.refreshQualificationPresentationCache();
    return this.showDocument("qualification-local-ollama", "Levi Local Ollama Qualification", result.data || result);
  }

  activeChangeProposal() {
    return this.presentationCache.changes && this.presentationCache.changes.activeProposal || (this.presentationCache.changes.proposals || [])[0] || null;
  }

  activeWorkflow() {
    return this.presentationCache.workflows && this.presentationCache.workflows.activeWorkflow || (this.presentationCache.workflows.items || [])[0] || null;
  }

  activeWorkflowStep(predicate = null) {
    const steps = this.presentationCache.workflows && this.presentationCache.workflows.steps || [];
    return predicate ? steps.find(predicate) : steps[0] || null;
  }

  async noActiveWorkflow() {
    await this.vscode.window.showInformationMessage("No Levi workflow is selected.");
    return null;
  }

  async noActiveWorkflowStep() {
    await this.vscode.window.showInformationMessage("No Levi workflow step is selected.");
    return null;
  }

  async noActiveChange() {
    await this.vscode.window.showInformationMessage("No Levi change proposal is selected.");
    return null;
  }

  registerCommands() {
    const bindings = {
      "levi.openDashboard": () => this.vscode.commands.executeCommand("workbench.view.extension.levi"),
      "levi.open": () => this.openProductExperience(),
      "levi.focusComposer": () => this.focusComposer(),
      "levi.newChat": () => this.newProductChat(),
      "levi.showEnvironment": () => this.showEnvironment(),
      "levi.showActiveWorkflow": () => this.showActiveWorkflow(),
      "levi.showActiveApproval": () => this.showActiveApproval(),
      "levi.showActiveChange": () => this.showActiveChange(),
      "levi.initialize": () => this.initializeRuntime(),
      "levi.openWorkspace": () => this.openWorkspace({ analyze: false }),
      "levi.refreshWorkspace": () => this.refreshWorkspace(),
      "levi.analyzeProject": () => this.analyzeProject(),
      "levi.showProjectSummary": () => this.showProjectPart("summary"),
      "levi.showArchitecture": () => this.showProjectPart("architecture"),
      "levi.showAssessment": () => this.showProjectPart("assessment"),
      "levi.showBlockers": () => this.showProjectPart("blockers"),
      "levi.showRisks": () => this.showProjectPart("risks"),
      "levi.showNextActions": () => this.showProjectPart("nextActions"),
      "levi.showReleaseReadiness": () => this.showProjectPart("releaseReadiness"),
      "levi.searchWorkspace": () => this.searchWorkspace(),
      "levi.showCapabilities": () => this.showCapabilities(),
      "levi.showRuntimeHealth": () => this.showRuntimeHealth(),
      "levi.showCertification": () => this.showCertification(false),
      "levi.runCertification": () => this.showCertification(true),
      "levi.showOperations": () => this.showOperations(),
      "levi.cancelOperation": () => this.cancelOperation(),
      "levi.showApprovals": () => this.showApprovals(),
      "levi.respondToApproval": () => this.respondToApproval(),
      "levi.saveState": () => this.saveState(),
      "levi.restoreState": () => this.restoreState(),
      "levi.understandCurrentFile": (uri) => this.understandCurrentFile(uri),
      "levi.showModelProviders": () => this.showModelProviders(),
      "levi.showModels": () => this.showModels(),
      "levi.showModelHealth": () => this.showModelHealth(false),
      "levi.selectModel": () => this.selectModel(),
      "levi.testModelConnection": () => this.showModelHealth(true),
      "levi.showModelUsage": () => this.showModelUsage(),
      "levi.configureProviderCredential": () => this.configureProviderCredential(),
      "levi.clearProviderCredential": () => this.clearProviderCredential(),
      "levi.openOnboarding": () => this.openOnboarding(),
      "levi.showContext": () => this.showContext(),
      "levi.showTechnicalDetails": () => this.showTechnicalDetails(),
      "levi.openAgent": () => this.openAgent(),
      "levi.newConversation": () => this.newConversation(),
      "levi.sendAgentMessage": () => this.sendAgentMessage(),
      "levi.cancelAgentTurn": () => this.cancelAgentTurn(),
      "levi.retryAgentTurn": () => this.retryAgentTurn(),
      "levi.showAgentContext": () => this.showAgentContext(),
      "levi.showAgentPlan": () => this.showAgentPlan(),
      "levi.showAgentTools": () => this.showAgentTools(),
      "levi.clearConversation": () => this.clearConversation(),
      "levi.createChangeProposal": (uri) => this.createChangeProposal(uri),
      "levi.previewChange": () => this.previewChange(),
      "levi.previewFileDiff": () => this.previewFileDiff(),
      "levi.validateChangeProposal": () => this.validateChangeProposal(),
      "levi.applyApprovedChange": () => this.applyApprovedChange(),
      "levi.rejectChange": () => this.rejectChange(),
      "levi.revertChange": () => this.revertChange(),
      "levi.showChangeHistory": () => this.showChangeHistory(),
      "levi.runChangeValidation": () => this.runChangeValidation(),
      "levi.showValidationResult": () => this.showValidationResult(),
      "levi.showAllowedCommands": () => this.showAllowedCommands(),
      "levi.showSourceControlStatus": () => this.showSourceControlStatus(),
      "levi.showSourceControlDiff": () => this.showSourceControlDiff(),
      "levi.showMultiAgentTeam": () => this.showMultiAgentTeam(),
      "levi.previewDelegation": () => this.previewDelegation(),
      "levi.startDelegatedTask": () => this.startDelegatedTask(),
      "levi.cancelDelegatedTask": () => this.cancelDelegatedTask(),
      "levi.showAssignment": () => this.showAssignment(),
      "levi.retryAssignment": () => this.retryAssignment(),
      "levi.requestAssignmentRevision": () => this.requestAssignmentRevision(),
      "levi.showAgentConflicts": () => this.showAgentConflicts(),
      "levi.resolveAgentConflict": () => this.resolveAgentConflict(),
      "levi.reconcileAgentResults": () => this.reconcileAgentResults(),
      "levi.showWorkflows": () => this.showWorkflows(),
      "levi.createWorkflow": () => this.createWorkflow(),
      "levi.startWorkflow": () => this.startWorkflow(),
      "levi.pauseWorkflow": () => this.pauseWorkflow(),
      "levi.resumeWorkflow": () => this.resumeWorkflow(),
      "levi.cancelWorkflow": () => this.cancelWorkflow(),
      "levi.retryWorkflow": () => this.retryWorkflow(),
      "levi.showWorkflow": () => this.showWorkflow(),
      "levi.showWorkflowResult": () => this.showWorkflowResult(),
      "levi.showWorkflowSteps": () => this.showWorkflowSteps(),
      "levi.retryWorkflowStep": () => this.retryWorkflowStep(),
      "levi.skipWorkflowStep": () => this.skipWorkflowStep(),
      "levi.showWorkflowCheckpoints": () => this.showWorkflowCheckpoints(),
      "levi.createWorkflowCheckpoint": () => this.createWorkflowCheckpoint(),
      "levi.restoreWorkflowCheckpoint": () => this.restoreWorkflowCheckpoint(),
      "levi.resolveWorkflowDecision": () => this.resolveWorkflowDecision(),
      "levi.showPerformance": () => this.showPerformance(),
      "levi.clearCache": () => this.clearCache(),
      "levi.runBenchmark": () => this.runBenchmark(),
      "levi.rebuildRepositoryGraph": () => this.rebuildRepositoryGraph(),
      "levi.showMemoryUsage": () => this.showMemoryUsage(),
      "levi.showReliability": () => this.showReliability(),
      "levi.runReliabilitySmoke": () => this.runReliabilityProfile("SMOKE"),
      "levi.runReliabilityStandard": () => this.runReliabilityProfile("STANDARD"),
      "levi.runReliabilityStrict": () => this.runReliabilityProfile("STRICT"),
      "levi.runReliabilityReleaseCandidate": () => this.runReliabilityProfile("RELEASE_CANDIDATE"),
      "levi.cancelReliabilityRun": () => this.cancelReliabilityRun(),
      "levi.showReliabilityReport": () => this.showReliabilityReport(),
      "levi.showReliabilityBlockers": () => this.showReliabilityBlockers(),
      "levi.showReliabilityConsistency": () => this.showReliabilityConsistency(),
      "levi.showReliabilityRecovery": () => this.showReliabilityRecovery(),
      "levi.showReliabilityResources": () => this.showReliabilityResources(),
      "levi.showSecurityAssurance": () => this.showSecurityAssurance(),
      "levi.runSecuritySmoke": () => this.runSecurityProfile("SMOKE"),
      "levi.runSecurityStandard": () => this.runSecurityProfile("STANDARD"),
      "levi.runSecurityStrict": () => this.runSecurityProfile("STRICT"),
      "levi.runSecurityReleaseCandidate": () => this.runSecurityProfile("RELEASE_CANDIDATE"),
      "levi.cancelSecurityAudit": () => this.cancelSecurityAudit(),
      "levi.showSecurityReport": () => this.showSecurityReport(),
      "levi.showSecurityBlockers": () => this.showSecurityBlockers(),
      "levi.showSecurityFindings": () => this.showSecurityFindings(),
      "levi.showSecurityChecks": () => this.showSecurityChecks(),
      "levi.showThreatModel": () => this.showThreatModel(),
      "levi.showApprovalSecurity": () => this.showApprovalSecurity(),
      "levi.showWorkspaceIsolation": () => this.showWorkspaceIsolation(),
      "levi.showPromptInjectionReport": () => this.showPromptInjectionReport(),
      "levi.showSecretHandlingReport": () => this.showSecretHandlingReport(),
      "levi.showDependencySecurity": () => this.showDependencySecurity(),
      "levi.showSupplyChainSecurity": () => this.showSupplyChainSecurity(),
      "levi.showStressScalability": () => this.showStressScalability(),
      "levi.runStressSmoke": () => this.runStressProfile("SMOKE"),
      "levi.runStressStandard": () => this.runStressProfile("STANDARD"),
      "levi.runStressStrict": () => this.runStressProfile("STRICT"),
      "levi.runStressReleaseCandidate": () => this.runStressProfile("RELEASE_CANDIDATE"),
      "levi.cancelStressRun": () => this.cancelStressRun(),
      "levi.showStressReport": () => this.showStressReport(),
      "levi.showStressBlockers": () => this.showStressBlockers(),
      "levi.showStressFindings": () => this.showStressFindings(),
      "levi.showStressRepositoryMetrics": () => this.showStressDomain("stress.checkRepository", "Levi Repository Stress", "stress-repository"),
      "levi.showStressConcurrency": () => this.showStressDomain("stress.checkConcurrency", "Levi Concurrency Stress", "stress-concurrency"),
      "levi.showStressMemory": () => this.showStressDomain("stress.checkMemory", "Levi Memory Stress", "stress-memory"),
      "levi.showStressQueue": () => this.showStressDomain("stress.checkQueues", "Levi Queue Stress", "stress-queue"),
      "levi.showStressProvider": () => this.showStressDomain("stress.checkProviders", "Levi Provider Stress", "stress-provider"),
      "levi.showStressWorkflow": () => this.showStressDomain("stress.checkWorkflows", "Levi Workflow Stress", "stress-workflow"),
      "levi.showStressCancellation": () => this.showStressDomain("stress.checkCancellation", "Levi Cancellation Stress", "stress-cancellation"),
      "levi.showStressPresentationPressure": () => this.showStressDomain("stress.checkPresentation", "Levi Presentation Pressure", "stress-presentation"),
      "levi.showQualification": () => this.showQualification(),
      "levi.runQualificationSmoke": () => this.runQualificationProfile("SMOKE"),
      "levi.runQualificationStandard": () => this.runQualificationProfile("STANDARD"),
      "levi.runQualificationStrict": () => this.runQualificationProfile("STRICT"),
      "levi.runQualificationReleaseCandidate": () => this.runQualificationProfile("RELEASE_CANDIDATE"),
      "levi.cancelQualificationRun": () => this.cancelQualificationRun(),
      "levi.showQualificationReport": () => this.showQualificationReport(),
      "levi.showQualificationBlockers": () => this.showQualificationBlockers(),
      "levi.showQualificationManualChecks": () => this.showQualificationManualChecks(),
      "levi.showQualificationDefects": () => this.showQualificationDefects(),
      "levi.showQualificationFixtures": () => this.showQualificationFixtures(),
      "levi.showQualificationJourneys": () => this.showQualificationJourneys(),
      "levi.showExtensionHostQualification": () => this.showExtensionHostQualification(),
      "levi.showLocalOllamaQualification": () => this.showLocalOllamaQualification(),
    };
    for (const commandId of EXTENSION_COMMANDS) {
      const disposable = this.vscode.commands.registerCommand(commandId, (...args) => this.runExtensionCommand(commandId, () => bindings[commandId](...args)));
      this.track(disposable);
    }
  }

  async runExtensionCommand(commandId, fn) {
    this.recordExtensionEvent(EXTENSION_EVENTS.COMMAND_STARTED, { commandId });
    try {
      const result = await fn();
      this.recordExtensionEvent(EXTENSION_EVENTS.COMMAND_COMPLETED, { commandId });
      this.refreshViews();
      return result;
    } catch (error) {
      this.presentationCache.lastError = error.error || error;
      this.recordExtensionEvent(EXTENSION_EVENTS.COMMAND_FAILED, { commandId, error: error.message || error.userMessage });
      await this.showError(error);
      return null;
    }
  }

  registerViews() {
    this.viewProviders = createViewProviders(this.vscode);
    const viewMap = {
      "levi.overview": this.viewProviders.overview,
      "levi.environment": this.viewProviders.environment,
      "levi.project": this.viewProviders.project,
      "levi.operations": this.viewProviders.operations,
      "levi.approvals": this.viewProviders.approvals,
      "levi.models": this.viewProviders.models,
      "levi.agent": this.viewProviders.agent,
      "levi.changes": this.viewProviders.changes,
      "levi.multiAgent": this.viewProviders.multiAgent,
      "levi.workflows": this.viewProviders.workflows,
      "levi.performance": this.viewProviders.performance,
      "levi.reliability": this.viewProviders.reliability,
      "levi.securityAssurance": this.viewProviders.securityAssurance,
      "levi.stressScalability": this.viewProviders.stressScalability,
      "levi.qualification": this.viewProviders.qualification,
      "levi.diagnostics": this.viewProviders.diagnostics,
    };
    for (const [id, provider] of Object.entries(viewMap)) {
      this.track(this.vscode.window.registerTreeDataProvider(id, provider));
      this.track(provider);
    }
  }

  registerVirtualDocuments() {
    this.documentProvider = new LeviVirtualDocumentProvider(this.vscode);
    this.track(this.vscode.workspace.registerTextDocumentContentProvider("levi", this.documentProvider));
    this.track(this.documentProvider);
  }

  registerWorkspaceHooks() {
    if (this.vscode.workspace.onDidChangeWorkspaceFolders) {
      this.track(this.vscode.workspace.onDidChangeWorkspaceFolders((event) => this.onWorkspaceFoldersChanged(event)));
    }
  }

  registerConfigurationHooks() {
    if (this.vscode.workspace.onDidChangeConfiguration) {
      this.track(this.vscode.workspace.onDidChangeConfiguration((event) => this.onConfigurationChanged(event)));
    }
  }

  subscribeRuntimeEvents() {
    this.runtimeSubscriptionId = this.runtime.subscribe((event) => this.onRuntimeEvent(event));
  }

  subscribeAgentEvents() {
    this.agent = this.runtime && this.runtime.agentEngine && this.runtime.agentEngine();
    if (!this.agent || typeof this.agent.subscribe !== "function" || this.agentSubscriptionId) return;
    this.agentSubscriptionId = this.agent.subscribe((event) => this.onAgentEvent(event));
  }

  onRuntimeEvent(event) {
    this.outputRuntimeEvent(event);
    if (event.type === "operation_progress") {
      this.coalesceProgress(event);
    }
    if (event.type === "approval_requested") {
      this.recordExtensionEvent(EXTENSION_EVENTS.APPROVAL_PRESENTED, { operationId: event.operationId });
    }
    this.updateStatusFromRuntimeEvent(event);
    if (TERMINAL_RUNTIME_EVENTS.includes(event.type)) this.refreshViewsNow();
    else this.refreshViews();
  }

  onAgentEvent(event) {
    this.recordExtensionEvent(EXTENSION_EVENTS.AGENT_EVENT, { type: event.type, payload: event.payload });
    this.outputLine(`Agent event: ${event.type}`);
    this.refreshAgentPresentationCache();
    this.postAgentWebviewState();
    this.refreshViews();
  }

  onWorkspaceFileEvent(event) {
    this.outputLine(`Workspace changed: ${event.type} ${event.uri}`);
    if (this.presentationCache.workspace) {
      this.presentationCache.workspace.revision = event.revision;
      this.presentationCache.workspace.health = {
        ...(this.presentationCache.workspace.health || {}),
        status: "STALE",
        warning: "Workspace files changed; refresh Levi analysis when ready.",
      };
    }
    this.refreshViews();
  }

  async onWorkspaceFoldersChanged(event) {
    this.recordExtensionEvent(event.added && event.added.length ? EXTENSION_EVENTS.WORKSPACE_ATTACHED : EXTENSION_EVENTS.WORKSPACE_DETACHED, {
      added: event.added && event.added.length || 0,
      removed: event.removed && event.removed.length || 0,
    });
    if (this.presentationCache.workspace) {
      this.presentationCache.workspace.health = {
        status: "STALE",
        warning: "Workspace folders changed; Levi workspace state should be reopened.",
      };
    }
    this.refreshViewsNow();
  }

  onConfigurationChanged(event) {
    if (event && typeof event.affectsConfiguration === "function" && !event.affectsConfiguration("levi")) return;
    this.recordExtensionEvent(EXTENSION_EVENTS.CONFIGURATION_CHANGED);
    const config = this.config();
    if (config.strictSecurity === false && this.runtime) {
      this.outputLine("Strict security cannot be disabled silently; preserving runtime strict security.");
    }
    if (this.runtime) {
      try {
        this.runtime.updateConfiguration({
          offlineMode: config.offlineMode !== false,
          strictSecurity: true,
          persistenceEnabled: config.persistence && config.persistence.enabled !== false,
        });
      } catch (error) {
        this.showError(error);
      }
    }
    this.refreshViewsNow();
  }

  async refreshProjectCache(workspaceId) {
    const parts = {};
    const calls = [
      ["summary", () => this.runtime.getProjectSummary(workspaceId)],
      ["architecture", () => this.runtime.getArchitectureState(workspaceId)],
      ["assessment", () => this.runtime.getProjectAssessment(workspaceId)],
      ["blockers", () => this.runtime.getProjectBlockers(workspaceId)],
      ["risks", () => this.runtime.getProjectRisks(workspaceId)],
      ["nextActions", () => this.runtime.getNextActions(workspaceId)],
      ["releaseReadiness", () => this.runtime.getReleaseReadiness(workspaceId)],
    ];
    for (const [key, fn] of calls) {
      try {
        const result = await fn();
        parts[key] = result.success ? result.data : { limitations: [result.error && result.error.userMessage || "Unavailable"] };
      } catch (error) {
        parts[key] = { limitations: [error.message] };
      }
    }
    this.presentationCache.project = normalizeProjectPresentation(parts);
    this.refreshViewsNow();
  }

  refreshViews() {
    if (this.disposed || this.pendingRefresh) return;
    this.pendingRefresh = setTimeout(() => {
      this.pendingRefresh = null;
      this.refreshViewsNow();
    }, UI_BOUNDS.refreshThrottleMs);
  }

  refreshViewsNow() {
    if (this.disposed || this.refreshing) return;
    this.refreshing = true;
    try {
      this.refreshPresentationCache();
      if (this.viewProviders) {
        for (const provider of Object.values(this.viewProviders)) provider.setState(this.presentationCache);
      }
      this.recordExtensionEvent(EXTENSION_EVENTS.VIEW_REFRESHED);
    } finally {
      this.refreshing = false;
    }
  }

  refreshPresentationCache() {
    if (!this.runtime) return;
    try {
      this.presentationCache.runtimeState = this.runtime.getState().state;
      this.presentationCache.operations = this.runtime.listOperations().slice(-UI_BOUNDS.maximumDisplayedOperations);
      this.presentationCache.approvals = this.approvals();
      this.refreshModelPresentationCache();
      this.refreshAgentPresentationCache();
      this.refreshChangesPresentationCache();
      this.refreshMultiAgentPresentationCache();
      this.refreshWorkflowPresentationCache();
      this.refreshPerformancePresentationCache();
      this.refreshReliabilityPresentationCache();
      this.refreshSecurityAssurancePresentationCache();
      this.refreshStressScalabilityPresentationCache();
      this.refreshQualificationPresentationCache();
      this.presentationCache.activeOperationCount = this.presentationCache.operations.filter((operation) => ["QUEUED", "STARTING", "RUNNING", "WAITING", "WAITING_FOR_APPROVAL", "PAUSED", "CANCELLING"].includes(operation.state)).length;
      this.presentationCache.pendingApprovalCount = this.presentationCache.approvals.filter((approval) => approval.status === "PENDING").length;
      this.refreshProductExperiencePresentationCache();
    } catch (error) {
      this.presentationCache.lastError = error;
    }
  }

  refreshProductExperiencePresentationCache() {
    if (!this.productExperience) return;
    this.productExperience.refresh();
  }

  approvals() {
    if (!this.runtime || !this.runtime.approvalRequests) return [];
    return Array.from(this.runtime.approvalRequests.values()).slice(-UI_BOUNDS.maximumDisplayedApprovals).map((approval) => serializeForExtension(approval));
  }

  async ensureWorkspace() {
    if (this.presentationCache.workspace && this.presentationCache.workspace.id) return this.presentationCache.workspace;
    const result = await this.openWorkspace({ analyze: false });
    if (!result || !result.success) throw result && result.error || new Error("Levi workspace is unavailable.");
    return result.data;
  }

  workspaceInput() {
    const folders = Array.isArray(this.vscode.workspace.workspaceFolders) ? this.vscode.workspace.workspaceFolders : [];
    if (folders.length === 1) return { uri: folders[0].uri, name: folders[0].name };
    if (folders.length > 1) return { uri: folders[0].uri, name: "Multi-root Workspace", metadata: { folders: folders.map((folder) => folder.uri.toString()) } };
    return { uri: this.vscode.workspace.workspaceFile || "untitled:levi-workspace", name: this.vscode.workspace.name || "Untitled Workspace" };
  }

  async withLeviProgress(title, commandId, fn) {
    const location = this.config().ui && this.config().ui.progressLocation === "window"
      ? this.vscode.ProgressLocation.Window
      : this.vscode.ProgressLocation.Notification;
    let operationId = null;
    return this.vscode.window.withProgress({ title, location, cancellable: true }, async (progress, token) => {
      const progressSubscription = this.runtime.subscribe((event) => {
        if (event.type !== "operation_progress") return;
        if (operationId && event.operationId !== operationId) return;
        progress.report({
          message: event.payload && event.payload.message || event.payload && event.payload.stage || "Working",
          increment: event.payload && event.payload.percentage || 0,
        });
      }, { types: ["operation_progress", "operation_succeeded", "operation_failed", "operation_cancelled", "operation_timed_out"] });
      if (token && token.onCancellationRequested) {
        token.onCancellationRequested(() => {
          if (operationId) this.runtime.cancelOperation(operationId, `Cancelled from ${commandId}.`);
        });
      }
      try {
        const result = await fn();
        operationId = result && result.operationId || operationId;
        if (result && result.success === false) await this.showError(result.error || result);
        return result;
      } finally {
        this.runtime.unsubscribe(progressSubscription);
      }
    });
  }

  async showDocument(key, title, data) {
    const uri = this.documentProvider.setDocument(key, title, data);
    const document = await this.vscode.workspace.openTextDocument(uri);
    await this.vscode.window.showTextDocument(document, { preview: true });
    return uri;
  }

  createChannels() {
    this.output = this.vscode.window.createOutputChannel("Levi");
    this.statusBar = this.vscode.window.createStatusBarItem(this.vscode.StatusBarAlignment.Left, 50);
    this.statusBar.command = "levi.open";
    this.statusBar.text = "Levi: Starting";
    this.statusBar.tooltip = "Open Levi";
    this.statusBar.show();
    this.modelStatusBar = this.vscode.window.createStatusBarItem(this.vscode.StatusBarAlignment.Left, 49);
    this.modelStatusBar.command = "levi.showModelHealth";
    this.modelStatusBar.text = "Levi Model: Offline";
    this.modelStatusBar.tooltip = "Show Levi model provider health";
    this.modelStatusBar.show();
  }

  updateStatus(text, tooltip) {
    if (!this.statusBar) return;
    this.statusBar.text = text;
    this.statusBar.tooltip = tooltip || this.statusTooltip();
    this.updateModelStatus();
  }

  updateStatusFromRuntimeEvent(event) {
    if (event.type === "runtime_ready") this.updateStatus("Levi: Ready");
    else if (event.type === "runtime_degraded") this.updateStatus("Levi: Degraded");
    else if (event.type === "runtime_failed") this.updateStatus("Levi: Failed");
    else if (event.type === "workspace_analysis_started" || event.type === "operation_progress") this.updateStatus("Levi: Analyzing");
    else if (event.type === "operation_waiting_for_approval" || event.type === "approval_requested") this.updateStatus("Levi: Waiting for Approval");
    else if (event.type === "workflow_started" || event.type === "workflow_step_started") this.updateStatus("Levi Workflow: Running");
    else if (event.type === "workflow_waiting_for_approval") this.updateStatus("Levi Workflow: Waiting for Approval");
    else if (event.type === "workflow_waiting_for_input") this.updateStatus("Levi Workflow: Waiting for Input");
    else if (event.type === "workflow_paused") this.updateStatus("Levi Workflow: Paused");
    else if (event.type === "workflow_blocked") this.updateStatus("Levi Workflow: Blocked");
    else if (event.type === "workflow_failed") this.updateStatus("Levi Workflow: Failed");
    else if (event.type === "workflow_completed" || event.type === "workflow_partially_completed") this.updateStatus("Levi Workflow: Complete");
    else if (event.type === "performance_benchmark_completed") this.updateStatus("Levi Performance: Benchmarked");
    else if (event.type === "performance_rebuild_completed") this.updateStatus("Levi Performance: Graph Ready");
    else if (event.type === "performance_memory_budget_exceeded") this.updateStatus("Levi Performance: Memory Bounded");
    else if (event.type === "reliability_run_started") this.updateStatus("Levi Reliability: Running");
    else if (event.type === "reliability_run_completed") this.updateStatus("Levi Reliability: Complete");
    else if (event.type === "reliability_run_partially_completed") this.updateStatus("Levi Reliability: Partial");
    else if (event.type === "reliability_run_failed" || event.type === "reliability_certification_blocked") this.updateStatus("Levi Reliability: Blocked");
    else if (event.type === "reliability_release_blocker_detected") this.updateStatus("Levi Reliability: Blocker");
    else if (event.type === "security_audit_started") this.updateStatus("Levi Security: Auditing");
    else if (event.type === "security_audit_completed") this.updateStatus("Levi Security: Complete");
    else if (event.type === "security_audit_partially_completed") this.updateStatus("Levi Security: Partial");
    else if (event.type === "security_audit_failed" || event.type === "security_certification_blocked") this.updateStatus("Levi Security: Blocked");
    else if (event.type === "security_release_blocker_detected") this.updateStatus("Levi Security: Blocker");
    else if (event.type === "security_certification_completed") this.updateStatus("Levi Security: Certified");
    else if (event.type === "stress_run_started") this.updateStatus("Levi Stress: Running");
    else if (event.type === "stress_run_completed") this.updateStatus("Levi Stress: Complete");
    else if (event.type === "stress_run_partially_completed") this.updateStatus("Levi Stress: Partial");
    else if (event.type === "stress_run_failed" || event.type === "stress_certification_blocked") this.updateStatus("Levi Stress: Blocked");
    else if (event.type === "stress_release_blocker_detected") this.updateStatus("Levi Stress: Blocker");
    else if (event.type === "stress_certification_completed") this.updateStatus("Levi Stress: Certified");
  }

  statusTooltip() {
    const health = this.presentationCache.health || {};
    return `Levi runtime: ${this.presentationCache.runtimeState || "UNKNOWN"}\nHealth: ${health.overallRuntimeHealth || "UNKNOWN"}\nWorkspace: ${this.presentationCache.workspace && this.presentationCache.workspace.name || "None"}`;
  }

  updateModelStatus() {
    if (!this.modelStatusBar) return;
    const health = this.presentationCache.modelHealth || {};
    const selected = this.presentationCache.selectedModel;
    const providers = this.presentationCache.modelProviders || [];
    const available = Number(health.availableProviders || 0);
    const configured = Number(health.configuredProviders || providers.length || 0);
    const label = selected ? selected.name || selected.id : available ? `${available}/${configured} Provider(s)` : configured ? "Configured" : "Offline";
    this.modelStatusBar.text = `Levi Model: ${label}`;
    this.modelStatusBar.tooltip = `Model gateway: ${health.gatewayState || "UNKNOWN"}\nProviders: ${configured}\nAvailable models: ${health.availableModels || 0}\nPrivacy: ${health.privacyPolicyStatus || "UNKNOWN"}`;
  }

  outputRuntimeEvent(event) {
    if (!event || !this.output) return;
    if (["operation_progress"].includes(event.type)) return;
    this.outputLine(`Runtime event: ${event.type} ${event.operationId || event.workspaceId || ""}`.trim());
    if (event.payload && (event.payload.error || event.payload.warning)) this.outputLine(safeText(event.payload, { maximumSize: 1000 }));
  }

  outputLine(message) {
    if (!this.output) return;
    const text = String(message || "");
    this.output.appendLine(text.length > UI_BOUNDS.maximumOutputMessageSize ? `${text.slice(0, UI_BOUNDS.maximumOutputMessageSize)}... [truncated]` : text);
  }

  coalesceProgress(event) {
    this.presentationCache.latestProgress = {
      operationId: event.operationId,
      progress: event.payload,
      timestamp: event.timestamp,
    };
  }

  recordExtensionEvent(type, payload = {}) {
    const event = {
      type,
      payload: serializeForExtension(payload, { maximumSize: 1000, diagnostics: this.config().diagnostics && this.config().diagnostics.enabled }),
      timestamp: new Date().toISOString(),
    };
    this.lifecycleEvents.push(event);
    this.presentationCache.extensionEvents.push(event);
    if (this.lifecycleEvents.length > UI_BOUNDS.maximumUiEventQueue) this.lifecycleEvents.splice(0, this.lifecycleEvents.length - UI_BOUNDS.maximumUiEventQueue);
    if (this.presentationCache.extensionEvents.length > UI_BOUNDS.maximumUiEventQueue) this.presentationCache.extensionEvents.splice(0, this.presentationCache.extensionEvents.length - UI_BOUNDS.maximumUiEventQueue);
    this.outputLine(`Extension event: ${type}`);
    return event;
  }

  refreshModelPresentationCache() {
    if (!this.modelGateway) {
      this.presentationCache.modelHealth = { gatewayState: "UNCONFIGURED", configuredProviders: 0, availableModels: 0, privacyPolicyStatus: "ENFORCED" };
      this.updateModelStatus();
      return;
    }
    try {
      this.presentationCache.modelProviders = this.modelGateway.listProviders();
      this.presentationCache.models = this.modelGateway.listModels();
      this.presentationCache.modelHealth = this.modelGateway.getGatewayHealth();
    } catch (error) {
      this.presentationCache.lastError = error;
    }
    this.updateModelStatus();
  }

  refreshAgentPresentationCache() {
    const agent = this.runtime && this.runtime.agentEngine && this.runtime.agentEngine();
    this.agent = agent || this.agent;
    if (!agent) {
      this.presentationCache.agent = {
        ...(this.presentationCache.agent || {}),
        health: { agentState: "UNCONFIGURED", overallAgentHealth: 70, privacyIntegrity: "ENFORCED" },
        conversations: [],
        activeConversation: null,
        activeTurn: null,
        mode: this.config().agent.defaultMode,
      };
      return;
    }
    try {
      const health = agent.getHealth ? agent.getHealth({ skipChecks: true }) : null;
      const conversations = agent.listConversations ? agent.listConversations({}) : [];
      const active = this.presentationCache.agent.activeConversation && conversations.find((entry) => entry.id === this.presentationCache.agent.activeConversation.id)
        || conversations.find((entry) => !["COMPLETED", "CANCELLED", "FAILED", "EXPIRED"].includes(entry.state))
        || conversations[conversations.length - 1]
        || null;
      const turns = active && agent.listTurns ? agent.listTurns(active.id, {}) : [];
      const activeTurn = active && (turns.find((turn) => turn.id === active.activeTurnId) || turns[turns.length - 1]) || null;
      this.presentationCache.agent = {
        health,
        conversations: conversations.slice(-UI_BOUNDS.maximumTreeItemsPerSection),
        activeConversation: active,
        activeTurn,
        lastResponse: activeTurn && activeTurn.assistantResponse || this.presentationCache.agent.lastResponse,
        contextSummary: activeTurn && activeTurn.contextPackageIds || [],
        planSummary: activeTurn && activeTurn.planId ? [activeTurn.planId] : [],
        mode: this.config().agent.defaultMode,
      };
    } catch (error) {
      this.presentationCache.lastError = error;
    }
  }

  refreshChangesPresentationCache() {
    const engine = this.runtime && this.runtime.workspaceToolsEngine && this.runtime.workspaceToolsEngine();
    if (!engine) {
      this.presentationCache.changes = {
        ...(this.presentationCache.changes || {}),
        health: { engineState: "UNCONFIGURED", overallWorkspaceToolHealth: 70 },
        proposals: [],
        activeProposal: null,
      };
      return;
    }
    try {
      const proposals = engine.listProposals ? engine.listProposals({}) : [];
      const active = this.presentationCache.changes.activeProposal && proposals.find((proposal) => proposal.id === this.presentationCache.changes.activeProposal.id)
        || proposals.find((proposal) => ["READY_FOR_REVIEW", "APPROVED", "APPLYING", "FAILED"].includes(proposal.state))
        || proposals[0]
        || null;
      this.presentationCache.changes = {
        ...(this.presentationCache.changes || {}),
        health: engine.getHealth ? engine.getHealth({ skipChecks: true }) : null,
        proposals: proposals.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
        activeProposal: active,
      };
    } catch (error) {
      this.presentationCache.lastError = error;
    }
  }

  refreshMultiAgentPresentationCache() {
    const engine = this.runtime && this.runtime.multiAgentEngine && this.runtime.multiAgentEngine();
    if (!engine) {
      this.presentationCache.multiAgent = {
        ...(this.presentationCache.multiAgent || {}),
        health: { coordinatorState: "UNCONFIGURED", scores: { overallMultiAgentHealth: 70 }, warnings: ["MultiAgentCoordinationEngine is unavailable."] },
        teams: [],
        activeTeam: null,
        assignments: [],
        conflicts: [],
      };
      return;
    }
    try {
      const health = engine.getHealth ? engine.getHealth({ skipChecks: true }) : null;
      const teams = engine.listTeams ? engine.listTeams({}) : [];
      const active = this.presentationCache.multiAgent.activeTeam && teams.find((team) => team.id === this.presentationCache.multiAgent.activeTeam.id)
        || teams.find((team) => ["ACTIVE", "WAITING", "WAITING_FOR_APPROVAL", "RECONCILING", "VALIDATING", "REPAIRING", "PAUSED"].includes(team.state))
        || teams[0]
        || null;
      const assignments = active && engine.listAssignments ? engine.listAssignments(active.id, {}) : [];
      const conflicts = engine.listConflicts ? engine.listConflicts(active ? { teamId: active.id } : {}) : [];
      this.presentationCache.multiAgent = {
        ...(this.presentationCache.multiAgent || {}),
        health,
        teams: teams.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
        activeTeam: active,
        assignments: assignments.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
        conflicts: conflicts.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
      };
    } catch (error) {
      this.presentationCache.lastError = error;
    }
  }

  refreshWorkflowPresentationCache() {
    const engine = this.runtime && this.runtime.workflowEngine && this.runtime.workflowEngine();
    if (!engine) {
      this.presentationCache.workflows = {
        ...(this.presentationCache.workflows || {}),
        health: { engineState: "UNCONFIGURED", scores: { overallWorkflowHealth: { value: 70 } }, warnings: ["DurableWorkflowEngine is unavailable."] },
        items: [],
        activeWorkflow: null,
        steps: [],
        readySteps: [],
        checkpoints: [],
        decisions: [],
      };
      return;
    }
    try {
      const health = engine.getHealth ? engine.getHealth({ skipChecks: true }) : null;
      const workflows = engine.listWorkflows ? engine.listWorkflows({}) : [];
      const active = this.presentationCache.workflows.activeWorkflow && workflows.find((workflow) => workflow.id === this.presentationCache.workflows.activeWorkflow.id)
        || workflows.find((workflow) => ["RUNNING", "QUEUED", "WAITING", "WAITING_FOR_APPROVAL", "WAITING_FOR_INPUT", "PAUSED", "SUSPENDED", "RECOVERING", "BLOCKED", "FAILED"].includes(workflow.state))
        || workflows[0]
        || null;
      const steps = active && engine.listSteps ? engine.listSteps(active.id, {}) : [];
      const readySteps = active && engine.getReadySteps ? engine.getReadySteps(active.id, {}) : [];
      const checkpoints = active && engine.listCheckpoints ? engine.listCheckpoints(active.id, {}) : [];
      const decisions = engine.listDecisions ? engine.listDecisions(active ? { workflowId: active.id } : {}) : [];
      this.presentationCache.workflows = {
        ...(this.presentationCache.workflows || {}),
        health,
        items: workflows.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
        activeWorkflow: active,
        steps: steps.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
        readySteps: readySteps.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
        checkpoints: checkpoints.slice(-UI_BOUNDS.maximumTreeItemsPerSection),
        decisions: decisions.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
        lastResult: active && engine.getWorkflowResult ? engine.getWorkflowResult(active.id) : this.presentationCache.workflows.lastResult,
      };
    } catch (error) {
      this.presentationCache.lastError = error;
    }
  }

  refreshPerformancePresentationCache() {
    const engine = this.runtime && this.runtime.performanceEngine && this.runtime.performanceEngine();
    if (!engine) {
      this.presentationCache.performance = {
        ...(this.presentationCache.performance || {}),
        state: "UNCONFIGURED",
        health: { status: "DEGRADED", score: 70, criticalFailures: [], domains: {}, warnings: ["RepositoryPerformanceEngine is unavailable."] },
        stats: null,
        cache: null,
        memory: null,
        graph: null,
      };
      return;
    }
    try {
      const health = engine.getHealth ? engine.getHealth({ skipChecks: true }) : null;
      const stats = engine.getStats ? engine.getStats({}) : null;
      const cache = engine.getCacheSummary ? engine.getCacheSummary() : stats && stats.cache;
      const memory = engine.getMemoryUsage ? engine.getMemoryUsage() : stats && stats.memory;
      const graph = engine.graphHandles ? {
        status: "AVAILABLE",
        handles: Array.from(engine.graphHandles.values()).map((handle) => ({ id: handle.id, type: handle.type, key: handle.key, loaded: handle.loaded })),
      } : null;
      const lastBenchmark = stats && stats.lastBenchmark || this.presentationCache.performance.lastBenchmark || null;
      this.presentationCache.performance = {
        ...(this.presentationCache.performance || {}),
        state: engine.getState ? engine.getState() : "READY",
        health,
        stats,
        cache,
        memory,
        graph,
        lastBenchmark,
        benchmarks: lastBenchmark && lastBenchmark.id
          ? (this.presentationCache.performance.benchmarks || []).concat(lastBenchmark).filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index).slice(-10)
          : this.presentationCache.performance.benchmarks || [],
        activeContexts: cache && cache.contexts ? Array(cache.contexts).fill(0).map((_, index) => ({ id: `context-${index + 1}` })) : [],
      };
    } catch (error) {
      this.presentationCache.lastError = error;
    }
  }

  refreshReliabilityPresentationCache() {
    const engine = this.runtime && this.runtime.reliabilityEngine && this.runtime.reliabilityEngine();
    if (!engine) {
      this.presentationCache.reliability = {
        ...(this.presentationCache.reliability || {}),
        state: "UNCONFIGURED",
        health: { status: "DEGRADED", score: 70, warnings: ["ReliabilityAssuranceEngine is unavailable."], domains: {} },
        scenarios: [],
        runs: [],
        findings: [],
        blockers: [],
      };
      return;
    }
    try {
      const health = engine.getHealth ? engine.getHealth({ skipChecks: true }) : null;
      const stats = engine.getStats ? engine.getStats({}) : null;
      const scenarios = engine.listScenarios ? engine.listScenarios({}) : [];
      const runs = engine.listRuns ? engine.listRuns({}) : [];
      const activeRun = runs.find((run) => !["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "INVALID", "EXPIRED"].includes(run.state)) || runs[runs.length - 1] || null;
      const findings = engine.listFindings ? engine.listFindings({}) : [];
      const blockers = findings.filter((finding) => finding.releaseBlocking && finding.status === "OPEN");
      const report = engine.getReliabilityReport ? engine.getReliabilityReport(activeRun && activeRun.id || null) : this.presentationCache.reliability.report;
      this.presentationCache.reliability = {
        ...(this.presentationCache.reliability || {}),
        state: engine.state || "READY",
        health,
        stats,
        scenarios: scenarios.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
        runs: runs.slice(-UI_BOUNDS.maximumTreeItemsPerSection),
        activeRun,
        report,
        findings: findings.slice(0, UI_BOUNDS.maximumDisplayedFindings),
        blockers: blockers.slice(0, UI_BOUNDS.maximumDisplayedFindings),
        consistency: report && report.consistency || this.presentationCache.reliability.consistency,
        recovery: report && report.recovery || this.presentationCache.reliability.recovery,
        resources: report && report.resources || this.presentationCache.reliability.resources,
        certification: report && report.certification || this.presentationCache.reliability.certification,
      };
    } catch (error) {
      this.presentationCache.lastError = error;
    }
  }

  refreshSecurityAssurancePresentationCache() {
    const engine = this.runtime && this.runtime.securityAssuranceEngine && this.runtime.securityAssuranceEngine();
    if (!engine) {
      this.presentationCache.securityAssurance = {
        ...(this.presentationCache.securityAssurance || {}),
        state: "UNCONFIGURED",
        health: { status: "DEGRADED", score: 70, warnings: ["SecurityAssuranceEngine is unavailable."], domains: {} },
        scenarios: [],
        runs: [],
        findings: [],
        blockers: [],
      };
      return;
    }
    try {
      const health = engine.getHealth ? engine.getHealth({ skipChecks: true }) : null;
      const stats = engine.getStats ? engine.getStats({}) : null;
      const scenarios = engine.listScenarios ? engine.listScenarios({}) : [];
      const runs = engine.listRuns ? engine.listRuns({}) : [];
      const activeRun = runs.find((run) => !["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "INVALID", "EXPIRED"].includes(run.state)) || runs[runs.length - 1] || null;
      const findings = engine.listFindings ? engine.listFindings({}) : [];
      const blockers = findings.filter((finding) => finding.releaseBlocking && finding.status === "OPEN");
      const report = engine.getSecurityReport ? engine.getSecurityReport({ runId: activeRun && activeRun.id || null }) : this.presentationCache.securityAssurance.report;
      this.presentationCache.securityAssurance = {
        ...(this.presentationCache.securityAssurance || {}),
        state: engine.state || "READY",
        health,
        stats,
        scenarios: scenarios.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
        runs: runs.slice(-UI_BOUNDS.maximumTreeItemsPerSection),
        activeRun,
        report,
        findings: findings.slice(0, UI_BOUNDS.maximumDisplayedFindings),
        blockers: blockers.slice(0, UI_BOUNDS.maximumDisplayedFindings),
        certification: engine.lastCertification || report && { level: report.certificationLevel } || this.presentationCache.securityAssurance.certification,
      };
    } catch (error) {
      this.presentationCache.lastError = error;
    }
  }

  refreshStressScalabilityPresentationCache() {
    const engine = this.runtime && this.runtime.stressScalabilityEngine && this.runtime.stressScalabilityEngine();
    if (!engine) {
      this.presentationCache.stressScalability = {
        ...(this.presentationCache.stressScalability || {}),
        state: "UNCONFIGURED",
        health: { status: "DEGRADED", score: 70, warnings: ["StressScalabilityEngine is unavailable."], domains: {} },
        profiles: [],
        repositories: [],
        scenarios: [],
        runs: [],
        findings: [],
        blockers: [],
      };
      return;
    }
    try {
      const health = engine.getHealth ? engine.getHealth({ skipChecks: true }) : null;
      const stats = engine.getStats ? engine.getStats({}) : null;
      const profiles = engine.listProfiles ? engine.listProfiles({}) : [];
      const repositories = engine.listSyntheticRepositories ? engine.listSyntheticRepositories({}) : [];
      const scenarios = engine.listScenarios ? engine.listScenarios({}) : [];
      const runs = engine.listRuns ? engine.listRuns({}) : [];
      const activeRun = runs.find((run) => !["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT", "INVALID", "EXPIRED"].includes(run.state)) || runs[runs.length - 1] || null;
      const findings = engine.listFindings ? engine.listFindings({}) : [];
      const blockers = engine.getReleaseBlockers ? engine.getReleaseBlockers({}) : findings.filter((finding) => finding.releaseBlocking && finding.status === "OPEN");
      const report = engine.getScalabilityReport ? engine.getScalabilityReport({ runId: activeRun && activeRun.id || null }) : this.presentationCache.stressScalability.report;
      this.presentationCache.stressScalability = {
        ...(this.presentationCache.stressScalability || {}),
        state: engine.state || "READY",
        health,
        stats,
        profiles: profiles.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
        repositories: repositories.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
        scenarios: scenarios.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
        runs: runs.slice(-UI_BOUNDS.maximumTreeItemsPerSection),
        activeRun,
        report,
        findings: findings.slice(0, UI_BOUNDS.maximumDisplayedFindings),
        blockers: blockers.slice(0, UI_BOUNDS.maximumDisplayedFindings),
        certification: engine.certification || report && { level: report.certificationLevel } || this.presentationCache.stressScalability.certification,
      };
    } catch (error) {
      this.presentationCache.lastError = error;
    }
  }

  refreshQualificationPresentationCache() {
    const engine = this.runtime && this.runtime.releaseQualificationEngine && this.runtime.releaseQualificationEngine();
    if (!engine) {
      this.presentationCache.qualification = {
        ...(this.presentationCache.qualification || {}),
        state: "UNCONFIGURED",
        health: { status: "DEGRADED", score: 70, warnings: ["ReleaseQualificationEngine is unavailable."] },
        fixtures: [],
        journeys: [],
        suites: [],
        scenarios: [],
        runs: [],
        manualVerifications: [],
        defects: [],
        blockers: [],
      };
      return;
    }
    try {
      const health = engine.getHealth ? engine.getHealth({ skipChecks: true }) : null;
      const stats = engine.getStats ? engine.getStats({}) : null;
      const fixtures = engine.listFixtures ? engine.listFixtures({}) : [];
      const journeys = engine.listJourneys ? engine.listJourneys({}) : [];
      const suites = engine.listSuites ? engine.listSuites({}) : [];
      const scenarios = engine.listScenarios ? engine.listScenarios({}) : [];
      const runs = engine.listRuns ? engine.listRuns({}) : [];
      const activeRun = runs.find((run) => !["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED", "BLOCKED", "CANCELLED", "TIMED_OUT", "INVALID", "EXPIRED"].includes(run.state)) || runs[runs.length - 1] || null;
      const manualVerifications = engine.listManualVerifications ? engine.listManualVerifications({}) : [];
      const defects = engine.listDefects ? engine.listDefects({}) : [];
      const blockers = engine.getReleaseBlockers ? engine.getReleaseBlockers({}) : defects.filter((defect) => defect.releaseBlocking && defect.status === "OPEN");
      const report = engine.getQualificationReport ? engine.getQualificationReport({ runId: activeRun && activeRun.id || null }) : this.presentationCache.qualification.report;
      this.presentationCache.qualification = {
        ...(this.presentationCache.qualification || {}),
        state: engine.state || "READY",
        health,
        stats,
        fixtures: fixtures.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
        journeys: journeys.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
        suites: suites.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
        scenarios: scenarios.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
        runs: runs.slice(-UI_BOUNDS.maximumTreeItemsPerSection),
        activeRun,
        report,
        blockers: blockers.slice(0, UI_BOUNDS.maximumDisplayedFindings),
        manualVerifications: manualVerifications.slice(0, UI_BOUNDS.maximumTreeItemsPerSection),
        defects: defects.slice(0, UI_BOUNDS.maximumDisplayedFindings),
        certification: engine.certification || report && { level: report.certification } || this.presentationCache.qualification.certification,
      };
    } catch (error) {
      this.presentationCache.lastError = error;
    }
  }

  postAgentWebviewState() {
    if (!this.agentPanel || !this.agentPanel.webview || typeof this.agentPanel.webview.postMessage !== "function") return;
    const message = serializeForExtension({ type: "state", agent: this.presentationCache.agent }, { maximumSize: UI_BOUNDS.maximumAgentWebviewMessageSize });
    this.agentPanel.webview.postMessage(message);
  }

  handleAgentWebviewMessage(message) {
    const parsed = validateAgentWebviewMessage(message, UI_BOUNDS.maximumAgentWebviewMessageSize);
    if (!parsed.valid) {
      this.outputLine(`Rejected Levi Agent webview message: ${parsed.reason}`);
      return null;
    }
    const handlers = {
      newConversation: () => this.newConversation({ objective: parsed.message.objective }),
      sendMessage: () => this.sendAgentMessage({ content: parsed.message.content }),
      cancelTurn: () => this.cancelAgentTurn(),
      retryTurn: () => this.retryAgentTurn(),
      clearConversation: () => this.clearConversation(),
      showContext: () => this.showAgentContext(),
      showPlan: () => this.showAgentPlan(),
      showTools: () => this.showAgentTools(),
    };
    return handlers[parsed.message.command]();
  }

  agentWebviewHtml(state) {
    const nonce = createNonce();
    const serialized = JSON.stringify(serializeForExtension(state || {}, { maximumSize: UI_BOUNDS.maximumAgentWebviewMessageSize })).replace(/</g, "\\u003c");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    body { margin: 0; padding: 12px; font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); }
    header { display: flex; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 6px 10px; cursor: pointer; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    textarea { box-sizing: border-box; width: 100%; min-height: 84px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); padding: 8px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
    .panel { border-top: 1px solid var(--vscode-panel-border); padding: 10px 0; }
    .muted { color: var(--vscode-descriptionForeground); }
    pre { white-space: pre-wrap; word-break: break-word; background: var(--vscode-textCodeBlock-background); padding: 8px; max-height: 320px; overflow: auto; }
  </style>
</head>
<body>
  <header><strong>Levi Agent</strong><span id="status" class="muted"></span></header>
  <textarea id="message" maxlength="${UI_BOUNDS.maximumAgentWebviewMessageSize}" placeholder="Ask Levi about this workspace"></textarea>
  <div class="row">
    <button id="new">New</button>
    <button id="send">Send</button>
    <button id="cancel" class="secondary">Cancel</button>
    <button id="retry" class="secondary">Retry</button>
    <button id="clear" class="secondary">Clear</button>
  </div>
  <div class="row">
    <button id="context" class="secondary">Context</button>
    <button id="plan" class="secondary">Plan</button>
    <button id="tools" class="secondary">Tools</button>
  </div>
  <section class="panel"><div class="muted">Conversation</div><pre id="conversation"></pre></section>
  <section class="panel"><div class="muted">Response</div><pre id="response"></pre></section>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = ${serialized};
    const byId = (id) => document.getElementById(id);
    function send(command, extra) { vscode.postMessage(Object.assign({ command }, extra || {})); }
    function render(next) {
      state = next || state || {};
      const conversation = state.activeConversation || {};
      const turn = state.activeTurn || {};
      const response = turn.assistantResponse || state.lastResponse || {};
      byId("status").textContent = [state.mode || "", conversation.state || "NO_CONVERSATION", turn.state || ""].filter(Boolean).join(" / ");
      byId("conversation").textContent = JSON.stringify({ id: conversation.id, title: conversation.title, state: conversation.state, turn: turn.id, classification: turn.classification, tools: turn.proposedToolCalls }, null, 2);
      byId("response").textContent = typeof response.content === "string" ? response.content : JSON.stringify(response, null, 2);
    }
    byId("new").addEventListener("click", () => send("newConversation", { objective: byId("message").value }));
    byId("send").addEventListener("click", () => send("sendMessage", { content: byId("message").value }));
    byId("cancel").addEventListener("click", () => send("cancelTurn"));
    byId("retry").addEventListener("click", () => send("retryTurn"));
    byId("clear").addEventListener("click", () => send("clearConversation"));
    byId("context").addEventListener("click", () => send("showContext"));
    byId("plan").addEventListener("click", () => send("showPlan"));
    byId("tools").addEventListener("click", () => send("showTools"));
    window.addEventListener("message", (event) => { if (event.data && event.data.type === "state") render(event.data.agent); });
    render(state);
  </script>
</body>
</html>`;
  }

  createCredentialResolver() {
    if (this.context && this.context.secrets) return new VSCodeSecretCredentialResolver(this.context);
    return new InMemoryCredentialResolver();
  }

  createModelGateway() {
    const config = this.config();
    if (config.models && config.models.enabled === false) return null;
    const providers = [];
    const transport = new NodeHttpTransport({ timeoutMs: config.models.requestTimeoutMs });
    if (!config.ollama || config.ollama.enabled !== false) {
      providers.push({
        configuration: {
          id: "ollama-local",
          name: "Ollama Local",
          type: ProviderTypes.OLLAMA,
          baseUrl: config.ollama && config.ollama.baseUrl || "http://127.0.0.1:11434",
          enabled: true,
          local: true,
          remote: false,
          allowRemoteContent: false,
          defaultModel: config.ollama && config.ollama.defaultModel || null,
          models: config.ollama && config.ollama.defaultModel ? [{
            id: `ollama:${config.ollama.defaultModel}`,
            name: config.ollama.defaultModel,
            local: true,
            remote: false,
            capabilities: defaultOllamaModelCapabilities(),
            latencyClass: "LOCAL",
            costClass: "LOCAL_UNKNOWN",
          }] : [],
        },
        adapter: new OllamaProviderAdapter({
          baseUrl: config.ollama && config.ollama.baseUrl || "http://127.0.0.1:11434",
          transport,
        }),
      });
    }
    if (config.openAICompatible && config.openAICompatible.enabled && config.openAICompatible.baseUrl) {
      providers.push({
        configuration: {
          id: "openai-compatible",
          name: "OpenAI Compatible",
          type: ProviderTypes.OPENAI_COMPATIBLE,
          baseUrl: config.openAICompatible.baseUrl,
          enabled: true,
          local: false,
          remote: true,
          allowRemoteContent: config.models.allowRemoteSourceCode || config.models.allowRemoteSensitiveContent,
          allowedPrivacyClassifications: [PrivacyClassifications.PUBLIC, PrivacyClassifications.INTERNAL, PrivacyClassifications.USER_CONTENT],
          credentialReference: config.openAICompatible.credentialKey || "openai-compatible-api-key",
          defaultModel: config.openAICompatible.defaultModel || null,
          models: config.openAICompatible.defaultModel ? [{ id: `openai-compatible:${config.openAICompatible.defaultModel}`, name: config.openAICompatible.defaultModel, remote: true }] : [],
        },
        adapter: new OpenAICompatibleProviderAdapter({
          baseUrl: config.openAICompatible.baseUrl,
          credentialReference: config.openAICompatible.credentialKey || "openai-compatible-api-key",
          credentialResolver: this.credentialResolver,
          transport,
        }),
      });
    }
    return new ModelProviderGateway({
      configuration: {
        defaultRoutingStrategy: config.models.routingStrategy || RoutingStrategies.PRIVACY_FIRST,
        defaultProviderId: config.models.defaultProvider || null,
        defaultModelId: config.models.defaultModel || null,
        allowRemoteSourceCode: config.models.allowRemoteSourceCode === true,
        allowRemoteSensitiveContent: config.models.allowRemoteSensitiveContent === true,
        requestTimeoutMs: config.models.requestTimeoutMs,
        maximumRetries: config.models.maximumRetries,
        persistenceEnabled: false,
      },
      credentialResolver: this.credentialResolver,
      providers,
    });
  }

  runtimeConfiguration() {
    const config = this.config();
    return {
      storageRoot: this.storageRoot(),
      workspaceStorageRoot: path.join(this.storageRoot(), "workspaces"),
      offlineMode: config.offlineMode !== false,
      strictSecurity: config.strictSecurity !== false,
      persistenceEnabled: !config.persistence || config.persistence.enabled !== false,
      diagnosticsEnabled: config.diagnostics && config.diagnostics.enabled === true,
    };
  }

  agentConfiguration() {
    const config = this.config();
    return {
      mode: config.agent.defaultMode,
      maximumTurns: config.agent.maximumTurns,
      maximumToolCallsPerTurn: config.agent.maximumToolCalls,
      maximumTotalToolCalls: config.agent.maximumToolCalls,
      requirePlanForProtectedActions: config.agent.requirePlanForProtectedActions !== false,
      requireApprovalForProtectedActions: true,
      enableStreaming: config.agent.enableStreaming !== false,
      enablePersistence: config.agent.persistConversationSummaries !== false,
      storagePath: path.join(this.storageRoot(), "agent-orchestration.json"),
    };
  }

  workspaceToolConfiguration() {
    const config = this.config();
    const workspaceTools = config.workspaceTools || {};
    return {
      storagePath: path.join(this.storageRoot(), "controlled-workspace-tools.json"),
      allowSourceChanges: workspaceTools.allowSourceChanges === true,
      allowCommandExecution: workspaceTools.allowCommandExecution === true,
      allowFileCreation: workspaceTools.allowFileCreation === true,
      allowFileDeletion: workspaceTools.allowFileDeletion === true,
      allowFileRename: workspaceTools.allowFileRename === true,
      requireApprovalForSourceChanges: workspaceTools.requireApproval !== false,
      requireApprovalForCommands: workspaceTools.requireApproval !== false,
      requireApprovalForGitChanges: workspaceTools.requireApproval !== false,
      requireCheckpointBeforeMutation: workspaceTools.requireCheckpoint !== false,
    };
  }

  multiAgentConfiguration() {
    const config = this.config();
    const multiAgent = config.multiAgent || {};
    return {
      enabled: multiAgent.enabled !== false,
      defaultStrategy: multiAgent.defaultStrategy || "ADAPTIVE_BOUNDED",
      maximumAgentsPerTeam: multiAgent.maximumAgents,
      maximumConcurrentAssignments: multiAgent.maximumConcurrentAssignments,
      maximumDelegationRounds: multiAgent.maximumDelegationRounds,
      requireIndependentReviewForSourceChanges: multiAgent.requireIndependentChangeReview !== false,
      requireIndependentReviewForSecurityChanges: multiAgent.requireSecurityReviewForSensitiveChanges !== false,
      allowSameModelForReview: multiAgent.allowSameModelForReview !== false,
      enablePersistence: multiAgent.persistTeamSummaries !== false,
      storagePath: path.join(this.storageRoot(), "multi-agent-coordination.json"),
    };
  }

  workflowConfiguration() {
    const config = this.config();
    const workflows = config.workflows || {};
    return {
      enabled: workflows.enabled !== false,
      maximumActiveWorkflows: workflows.maximumActiveWorkflows,
      maximumConcurrentSteps: workflows.maximumConcurrentSteps,
      maximumStepsPerWorkflow: workflows.maximumStepsPerWorkflow,
      maximumRetriesPerStep: workflows.maximumRetriesPerStep,
      maximumRepairAttemptsPerStep: workflows.maximumRepairAttempts,
      checkpointIntervalMs: workflows.checkpointIntervalMs,
      autoCheckpointEnabled: workflows.autoCheckpoint !== false,
      allowSafeAutomaticResume: workflows.allowSafeAutomaticResume === true,
      archiveCompletedWorkflows: workflows.archiveCompleted === true,
      persistenceEnabled: workflows.persistHistory !== false,
      storagePath: path.join(this.storageRoot(), "durable-workflows.json"),
    };
  }

  performanceConfiguration() {
    const config = this.config();
    const performance = config.performance || {};
    return {
      enabled: performance.enabled !== false,
      maximumCacheEntries: performance.maximumCacheEntries,
      maximumMemoryBytes: performance.maximumMemoryBytes,
      maximumContextEntries: performance.maximumContextEntries,
      cacheTtlMs: performance.cacheTtlMs,
      maximumParallelism: performance.maximumParallelism,
      persistSummaries: performance.persistSummaries !== false,
      benchmarkSampleSize: performance.benchmarkSampleSize,
      persistenceEnabled: performance.persistSummaries !== false,
      storagePath: path.join(this.storageRoot(), "repository-performance.json"),
    };
  }

  reliabilityConfiguration() {
    const config = this.config();
    const reliability = config.reliability || {};
    return {
      enabled: reliability.enabled !== false,
      failClosed: reliability.failClosed !== false,
      deterministicMode: true,
      maximumDiagnosticRuns: reliability.maximumDiagnosticRuns,
      maximumConcurrentRuns: reliability.maximumConcurrentRuns,
      maximumScenariosPerRun: reliability.maximumScenariosPerRun,
      maximumRunDurationMs: reliability.maximumRunDurationMs,
      maximumScenarioDurationMs: reliability.maximumScenarioDurationMs,
      enableFaultInjection: false,
      enableResourceLeakDetection: reliability.enableResourceLeakDetection !== false,
      enableEventIntegrityChecks: reliability.enableEventIntegrityChecks !== false,
      enableStateMachineChecks: reliability.enableStateMachineChecks !== false,
      enableRecoveryChecks: reliability.enableRecoveryChecks !== false,
      enablePersistenceChecks: reliability.enablePersistenceChecks !== false,
      enableConcurrencyChecks: reliability.enableConcurrencyChecks !== false,
      requireCleanShutdown: reliability.requireCleanShutdown !== false,
      requireProtectedActionNonResume: reliability.requireProtectedActionNonResume !== false,
      persistenceEnabled: reliability.persistReports !== false,
      autoPersistReports: reliability.persistReports !== false,
      storagePath: path.join(this.storageRoot(), "reliability-assurance.json"),
    };
  }

  securityAssuranceConfiguration() {
    const config = this.config();
    const security = config.securityAssurance || {};
    return {
      enabled: security.enabled !== false,
      failClosed: security.failClosed !== false,
      deterministicMode: true,
      maximumAuditRuns: security.maximumAuditRuns,
      maximumConcurrentRuns: security.maximumConcurrentRuns,
      maximumScenariosPerRun: security.maximumScenariosPerRun,
      maximumPayloadBytes: security.maximumPayloadBytes,
      maximumPromptCharacters: security.maximumPromptCharacters,
      maximumToolArgumentsBytes: security.maximumToolArgumentsBytes,
      maximumWebviewMessageBytes: security.maximumWebviewMessageBytes,
      maximumEventRate: security.maximumEventRate,
      maximumQueueDepth: security.maximumQueueDepth,
      maximumAgentDepth: security.maximumAgentDepth,
      maximumWorkflowSteps: security.maximumWorkflowSteps,
      maximumAttackVariants: security.maximumAttackVariants,
      maximumAttacksPerScenario: security.maximumAttacksPerScenario || security.maximumAttackVariants,
      maximumAuditDurationMs: security.maximumAuditDurationMs || security.maximumRunDurationMs,
      maximumRunDurationMs: security.maximumRunDurationMs,
      maximumScenarioDurationMs: security.maximumScenarioDurationMs,
      enablePromptInjectionTests: security.enablePromptInjectionTests !== false,
      enableApprovalTests: security.enableApprovalTests !== false && security.enableApprovalBypassTests !== false,
      enableApprovalBypassTests: security.enableApprovalBypassTests !== false,
      enableWorkspaceIsolationTests: security.enableWorkspaceIsolationTests !== false,
      enablePathTests: security.enablePathTests !== false,
      enableCommandTests: security.enableCommandTests !== false,
      enableSecretLeakTests: security.enableSecretLeakTests !== false,
      enableProviderTests: security.enableProviderTests !== false && security.enableProviderPrivacyTests !== false,
      enableProviderPrivacyTests: security.enableProviderPrivacyTests !== false,
      enableWebviewTests: security.enableWebviewTests !== false,
      enablePersistenceTests: security.enablePersistenceTests !== false,
      enableSerializationTests: security.enableSerializationTests !== false,
      enableResourceAbuseTests: security.enableResourceAbuseTests !== false,
      enableDependencyTests: security.enableDependencyTests !== false && security.enableDependencyReview !== false,
      enableDependencyReview: security.enableDependencyReview !== false,
      enableSupplyChainTests: security.enableSupplyChainTests !== false,
      requireWorkspaceTrust: security.requireWorkspaceTrust !== false,
      requireExplicitProtectedApproval: security.requireExplicitProtectedApproval !== false,
      requireSecretRedaction: security.requireSecretRedaction !== false,
      requireRemotePrivacyPolicy: security.requireRemotePrivacyPolicy !== false,
      persistenceEnabled: security.persistReports !== false,
      autoPersistReports: security.persistReports !== false,
    };
  }

  stressScalabilityConfiguration() {
    const config = this.config();
    const stress = config.stressScalability || {};
    return {
      enabled: stress.enabled !== false,
      failClosed: stress.failClosed !== false,
      deterministicMode: true,
      maximumRuns: stress.maximumRuns,
      maximumConcurrentRuns: stress.maximumConcurrentRuns,
      maximumScenariosPerRun: stress.maximumScenariosPerRun,
      maximumSyntheticFiles: stress.maximumSyntheticFiles,
      maximumSyntheticDirectories: stress.maximumSyntheticDirectories,
      maximumSyntheticSymbols: stress.maximumSyntheticSymbols,
      maximumSyntheticDependencies: stress.maximumSyntheticDependencies,
      maximumRepositoryBytes: stress.maximumRepositoryBytes,
      maximumConcurrentOperations: stress.maximumConcurrentOperations,
      maximumConcurrentModelRequests: stress.maximumConcurrentModelRequests,
      maximumConcurrentAgentTurns: stress.maximumConcurrentAgentTurns,
      maximumConcurrentAssignments: stress.maximumConcurrentAssignments,
      maximumConcurrentWorkflows: stress.maximumConcurrentWorkflows,
      maximumConcurrentWorkflowSteps: stress.maximumConcurrentWorkflowSteps,
      maximumQueueDepth: stress.maximumQueueDepth,
      maximumEventRatePerSecond: stress.maximumEventRatePerSecond,
      maximumListeners: stress.maximumListeners,
      maximumCacheEntries: stress.maximumCacheEntries,
      maximumCacheBytes: stress.maximumCacheBytes,
      maximumContextPackages: stress.maximumContextPackages,
      maximumConversationMessages: stress.maximumConversationMessages,
      maximumProposalFiles: stress.maximumProposalFiles,
      maximumPatchBytes: stress.maximumPatchBytes,
      maximumPersistenceCycles: stress.maximumPersistenceCycles,
      maximumRecoveryCycles: stress.maximumRecoveryCycles,
      maximumCancellationRate: stress.maximumCancellationRate,
      maximumRunDurationMs: stress.maximumRunDurationMs,
      maximumScenarioDurationMs: stress.maximumScenarioDurationMs,
      maximumWarmupDurationMs: stress.maximumWarmupDurationMs,
      maximumCooldownDurationMs: stress.maximumCooldownDurationMs,
      memoryBudgetBytes: stress.memoryBudgetBytes,
      warningMemoryRatio: stress.warningMemoryRatio,
      criticalMemoryRatio: stress.criticalMemoryRatio,
      enableRepositoryStress: stress.enableRepositoryStress !== false,
      enableConcurrencyStress: stress.enableConcurrencyStress !== false,
      enableProviderStress: stress.enableProviderStress !== false,
      enableWorkflowStress: stress.enableWorkflowStress !== false,
      enableMemoryStress: stress.enableMemoryStress !== false,
      enableQueueStress: stress.enableQueueStress !== false,
      enablePersistenceStress: stress.enablePersistenceStress !== false,
      enableRecoveryStress: stress.enableRecoveryStress !== false,
      enableCancellationStress: stress.enableCancellationStress !== false,
      enablePresentationStress: stress.enablePresentationStress !== false,
      persistReports: stress.persistReports !== false,
    };
  }

  qualificationConfiguration() {
    const config = this.config();
    const qualification = config.qualification || {};
    return {
      enabled: qualification.enabled !== false,
      failClosed: qualification.failClosed !== false,
      deterministicMode: true,
      maximumSuites: qualification.maximumSuites,
      maximumScenariosPerSuite: qualification.maximumScenariosPerSuite,
      maximumConcurrentScenarios: qualification.maximumConcurrentScenarios,
      maximumFixtures: qualification.maximumFixtures,
      maximumDefects: qualification.maximumDefects,
      maximumEvidenceItems: qualification.maximumEvidenceItems,
      maximumArtifacts: qualification.maximumArtifacts,
      maximumScenarioDurationMs: qualification.maximumScenarioDurationMs,
      maximumRunDurationMs: qualification.maximumRunDurationMs,
      maximumReloadCycles: qualification.maximumReloadCycles,
      maximumRepairAttempts: qualification.maximumRepairAttempts,
      maximumProviderRetries: qualification.maximumProviderRetries,
      maximumWorkspaceBytes: qualification.maximumWorkspaceBytes,
      maximumGeneratedFiles: qualification.maximumGeneratedFiles,
      maximumManualChecklistItems: qualification.maximumManualChecklistItems,
      requireExtensionHostVerification: qualification.requireExtensionHostVerification !== false,
      requireLocalModelVerification: qualification.requireLocalModelVerification !== false,
      requireSourceChangeWorkflow: qualification.requireSourceChangeWorkflow !== false,
      requireValidationWorkflow: qualification.requireValidationWorkflow !== false,
      requireRecoveryWorkflow: qualification.requireRecoveryWorkflow !== false,
      requireSecurityBaseline: qualification.requireSecurityBaseline !== false,
      requireReliabilityBaseline: qualification.requireReliabilityBaseline !== false,
      requireScalabilityBaseline: qualification.requireScalabilityBaseline !== false,
      requireAccessibilityVerification: qualification.requireAccessibilityVerification !== false,
      requireNoCriticalDefects: qualification.requireNoCriticalDefects !== false,
      persistenceEnabled: qualification.persistReports !== false,
      persistReports: qualification.persistReports !== false,
    };
  }

  workspaceAdapterConfiguration() {
    const config = this.config();
    return {
      maximumFiles: config.workspace && config.workspace.maxFiles || UI_BOUNDS.maximumWorkspaceFiles,
      maximumFileBytes: config.workspace && config.workspace.maxFileBytes || UI_BOUNDS.maximumFileBytes,
      exclude: config.workspace && config.workspace.exclude,
    };
  }

  storageRoot() {
    const uri = this.context.globalStorageUri || this.context.storageUri;
    if (uri && uri.fsPath) return path.join(uri.fsPath, "runtime");
    if (this.context.globalStoragePath) return path.join(this.context.globalStoragePath, "runtime");
    return path.join(this.context.extensionPath || process.cwd(), ".levi-vscode", "runtime");
  }

  config() {
    const raw = this.vscode.workspace.getConfiguration ? this.vscode.workspace.getConfiguration("levi") : {};
    return {
      enabled: raw.get ? raw.get("enabled", true) : raw.enabled !== false,
      autoInitialize: raw.get ? raw.get("autoInitialize", true) : raw.autoInitialize !== false,
      autoAnalyzeWorkspace: raw.get ? raw.get("autoAnalyzeWorkspace", true) : raw.autoAnalyzeWorkspace !== false,
      offlineMode: raw.get ? raw.get("offlineMode", true) : raw.offlineMode !== false,
      strictSecurity: raw.get ? raw.get("strictSecurity", true) : raw.strictSecurity !== false,
      persistence: { enabled: raw.get ? raw.get("persistence.enabled", true) : !raw.persistence || raw.persistence.enabled !== false },
      workspace: {
        maxFiles: raw.get ? raw.get("workspace.maxFiles", UI_BOUNDS.maximumWorkspaceFiles) : raw.workspace && raw.workspace.maxFiles,
        maxFileBytes: raw.get ? raw.get("workspace.maxFileBytes", UI_BOUNDS.maximumFileBytes) : raw.workspace && raw.workspace.maxFileBytes,
        exclude: raw.get ? raw.get("workspace.exclude", undefined) : raw.workspace && raw.workspace.exclude,
      },
      ui: {
        showNotifications: raw.get ? raw.get("ui.showNotifications", true) : !raw.ui || raw.ui.showNotifications !== false,
        progressLocation: raw.get ? raw.get("ui.progressLocation", "notification") : raw.ui && raw.ui.progressLocation || "notification",
      },
      diagnostics: {
        enabled: raw.get ? raw.get("diagnostics.enabled", false) : raw.diagnostics && raw.diagnostics.enabled === true,
      },
      experience: {
        enabled: raw.get ? raw.get("experience.enabled", true) : !raw.experience || raw.experience.enabled !== false,
        defaultMode: raw.get ? raw.get("experience.defaultMode", "Ask") : raw.experience && raw.experience.defaultMode || "Ask",
        showAdvancedDetails: raw.get ? raw.get("experience.showAdvancedDetails", false) : raw.experience && raw.experience.showAdvancedDetails === true,
        compactEnvironment: raw.get ? raw.get("experience.compactEnvironment", true) : !raw.experience || raw.experience.compactEnvironment !== false,
        autoOpenOnFirstRun: raw.get ? raw.get("experience.autoOpenOnFirstRun", false) : raw.experience && raw.experience.autoOpenOnFirstRun === true,
        showCompletionNotifications: raw.get ? raw.get("experience.showCompletionNotifications", true) : !raw.experience || raw.experience.showCompletionNotifications !== false,
        timelineExpanded: raw.get ? raw.get("experience.timelineExpanded", false) : raw.experience && raw.experience.timelineExpanded === true,
        preferredPanelLocation: raw.get ? raw.get("experience.preferredPanelLocation", "beside") : raw.experience && raw.experience.preferredPanelLocation || "beside",
      },
      performance: {
        enabled: raw.get ? raw.get("performance.enabled", true) : !raw.performance || raw.performance.enabled !== false,
        maximumCacheEntries: raw.get ? raw.get("performance.maximumCacheEntries", 512) : raw.performance && raw.performance.maximumCacheEntries || 512,
        maximumMemoryBytes: raw.get ? raw.get("performance.maximumMemoryBytes", 64 * 1024 * 1024) : raw.performance && raw.performance.maximumMemoryBytes || 64 * 1024 * 1024,
        maximumContextEntries: raw.get ? raw.get("performance.maximumContextEntries", 64) : raw.performance && raw.performance.maximumContextEntries || 64,
        cacheTtlMs: raw.get ? raw.get("performance.cacheTtlMs", 300000) : raw.performance && raw.performance.cacheTtlMs || 300000,
        maximumParallelism: raw.get ? raw.get("performance.maximumParallelism", 4) : raw.performance && raw.performance.maximumParallelism || 4,
        persistSummaries: raw.get ? raw.get("performance.persistSummaries", true) : !raw.performance || raw.performance.persistSummaries !== false,
        benchmarkSampleSize: raw.get ? raw.get("performance.benchmarkSampleSize", 8) : raw.performance && raw.performance.benchmarkSampleSize || 8,
      },
      reliability: {
        enabled: raw.get ? raw.get("reliability.enabled", true) : !raw.reliability || raw.reliability.enabled !== false,
        failClosed: raw.get ? raw.get("reliability.failClosed", true) : !raw.reliability || raw.reliability.failClosed !== false,
        maximumDiagnosticRuns: raw.get ? raw.get("reliability.maximumDiagnosticRuns", 32) : raw.reliability && raw.reliability.maximumDiagnosticRuns || 32,
        maximumConcurrentRuns: raw.get ? raw.get("reliability.maximumConcurrentRuns", 1) : raw.reliability && raw.reliability.maximumConcurrentRuns || 1,
        maximumScenariosPerRun: raw.get ? raw.get("reliability.maximumScenariosPerRun", 32) : raw.reliability && raw.reliability.maximumScenariosPerRun || 32,
        maximumRunDurationMs: raw.get ? raw.get("reliability.maximumRunDurationMs", 120000) : raw.reliability && raw.reliability.maximumRunDurationMs || 120000,
        maximumScenarioDurationMs: raw.get ? raw.get("reliability.maximumScenarioDurationMs", 30000) : raw.reliability && raw.reliability.maximumScenarioDurationMs || 30000,
        enableResourceLeakDetection: raw.get ? raw.get("reliability.enableResourceLeakDetection", true) : !raw.reliability || raw.reliability.enableResourceLeakDetection !== false,
        enableEventIntegrityChecks: raw.get ? raw.get("reliability.enableEventIntegrityChecks", true) : !raw.reliability || raw.reliability.enableEventIntegrityChecks !== false,
        enableStateMachineChecks: raw.get ? raw.get("reliability.enableStateMachineChecks", true) : !raw.reliability || raw.reliability.enableStateMachineChecks !== false,
        enableRecoveryChecks: raw.get ? raw.get("reliability.enableRecoveryChecks", true) : !raw.reliability || raw.reliability.enableRecoveryChecks !== false,
        enablePersistenceChecks: raw.get ? raw.get("reliability.enablePersistenceChecks", true) : !raw.reliability || raw.reliability.enablePersistenceChecks !== false,
        enableConcurrencyChecks: raw.get ? raw.get("reliability.enableConcurrencyChecks", true) : !raw.reliability || raw.reliability.enableConcurrencyChecks !== false,
        requireCleanShutdown: raw.get ? raw.get("reliability.requireCleanShutdown", true) : !raw.reliability || raw.reliability.requireCleanShutdown !== false,
        requireProtectedActionNonResume: raw.get ? raw.get("reliability.requireProtectedActionNonResume", true) : !raw.reliability || raw.reliability.requireProtectedActionNonResume !== false,
        persistReports: raw.get ? raw.get("reliability.persistReports", true) : !raw.reliability || raw.reliability.persistReports !== false,
      },
      securityAssurance: {
        enabled: raw.get ? raw.get("securityAssurance.enabled", true) : !raw.securityAssurance || raw.securityAssurance.enabled !== false,
        failClosed: raw.get ? raw.get("securityAssurance.failClosed", true) : !raw.securityAssurance || raw.securityAssurance.failClosed !== false,
        maximumAuditRuns: raw.get ? raw.get("securityAssurance.maximumAuditRuns", 32) : raw.securityAssurance && raw.securityAssurance.maximumAuditRuns || 32,
        maximumConcurrentRuns: raw.get ? raw.get("securityAssurance.maximumConcurrentRuns", 1) : raw.securityAssurance && raw.securityAssurance.maximumConcurrentRuns || 1,
        maximumScenariosPerRun: raw.get ? raw.get("securityAssurance.maximumScenariosPerRun", 96) : raw.securityAssurance && raw.securityAssurance.maximumScenariosPerRun || 96,
        maximumPayloadBytes: raw.get ? raw.get("securityAssurance.maximumPayloadBytes", 8192) : raw.securityAssurance && raw.securityAssurance.maximumPayloadBytes || 8192,
        maximumPromptCharacters: raw.get ? raw.get("securityAssurance.maximumPromptCharacters", 12000) : raw.securityAssurance && raw.securityAssurance.maximumPromptCharacters || 12000,
        maximumToolArgumentsBytes: raw.get ? raw.get("securityAssurance.maximumToolArgumentsBytes", 8192) : raw.securityAssurance && raw.securityAssurance.maximumToolArgumentsBytes || 8192,
        maximumWebviewMessageBytes: raw.get ? raw.get("securityAssurance.maximumWebviewMessageBytes", 16384) : raw.securityAssurance && raw.securityAssurance.maximumWebviewMessageBytes || 16384,
        maximumEventRate: raw.get ? raw.get("securityAssurance.maximumEventRate", 128) : raw.securityAssurance && raw.securityAssurance.maximumEventRate || 128,
        maximumQueueDepth: raw.get ? raw.get("securityAssurance.maximumQueueDepth", 128) : raw.securityAssurance && raw.securityAssurance.maximumQueueDepth || 128,
        maximumAgentDepth: raw.get ? raw.get("securityAssurance.maximumAgentDepth", 4) : raw.securityAssurance && raw.securityAssurance.maximumAgentDepth || 4,
        maximumWorkflowSteps: raw.get ? raw.get("securityAssurance.maximumWorkflowSteps", 64) : raw.securityAssurance && raw.securityAssurance.maximumWorkflowSteps || 64,
        maximumAttackVariants: raw.get ? raw.get("securityAssurance.maximumAttackVariants", 8) : raw.securityAssurance && raw.securityAssurance.maximumAttackVariants || 8,
        maximumAttacksPerScenario: raw.get ? raw.get("securityAssurance.maximumAttacksPerScenario", 8) : raw.securityAssurance && raw.securityAssurance.maximumAttacksPerScenario || 8,
        maximumAuditDurationMs: raw.get ? raw.get("securityAssurance.maximumAuditDurationMs", 120000) : raw.securityAssurance && raw.securityAssurance.maximumAuditDurationMs || 120000,
        maximumRunDurationMs: raw.get ? raw.get("securityAssurance.maximumRunDurationMs", 120000) : raw.securityAssurance && raw.securityAssurance.maximumRunDurationMs || 120000,
        maximumScenarioDurationMs: raw.get ? raw.get("securityAssurance.maximumScenarioDurationMs", 30000) : raw.securityAssurance && raw.securityAssurance.maximumScenarioDurationMs || 30000,
        enablePromptInjectionTests: raw.get ? raw.get("securityAssurance.enablePromptInjectionTests", true) : !raw.securityAssurance || raw.securityAssurance.enablePromptInjectionTests !== false,
        enableApprovalTests: raw.get ? raw.get("securityAssurance.enableApprovalTests", true) : !raw.securityAssurance || raw.securityAssurance.enableApprovalTests !== false,
        enableApprovalBypassTests: raw.get ? raw.get("securityAssurance.enableApprovalBypassTests", true) : !raw.securityAssurance || raw.securityAssurance.enableApprovalBypassTests !== false,
        enableWorkspaceIsolationTests: raw.get ? raw.get("securityAssurance.enableWorkspaceIsolationTests", true) : !raw.securityAssurance || raw.securityAssurance.enableWorkspaceIsolationTests !== false,
        enablePathTests: raw.get ? raw.get("securityAssurance.enablePathTests", true) : !raw.securityAssurance || raw.securityAssurance.enablePathTests !== false,
        enableCommandTests: raw.get ? raw.get("securityAssurance.enableCommandTests", true) : !raw.securityAssurance || raw.securityAssurance.enableCommandTests !== false,
        enableSecretLeakTests: raw.get ? raw.get("securityAssurance.enableSecretLeakTests", true) : !raw.securityAssurance || raw.securityAssurance.enableSecretLeakTests !== false,
        enableProviderTests: raw.get ? raw.get("securityAssurance.enableProviderTests", true) : !raw.securityAssurance || raw.securityAssurance.enableProviderTests !== false,
        enableProviderPrivacyTests: raw.get ? raw.get("securityAssurance.enableProviderPrivacyTests", true) : !raw.securityAssurance || raw.securityAssurance.enableProviderPrivacyTests !== false,
        enableWebviewTests: raw.get ? raw.get("securityAssurance.enableWebviewTests", true) : !raw.securityAssurance || raw.securityAssurance.enableWebviewTests !== false,
        enablePersistenceTests: raw.get ? raw.get("securityAssurance.enablePersistenceTests", true) : !raw.securityAssurance || raw.securityAssurance.enablePersistenceTests !== false,
        enableSerializationTests: raw.get ? raw.get("securityAssurance.enableSerializationTests", true) : !raw.securityAssurance || raw.securityAssurance.enableSerializationTests !== false,
        enableResourceAbuseTests: raw.get ? raw.get("securityAssurance.enableResourceAbuseTests", true) : !raw.securityAssurance || raw.securityAssurance.enableResourceAbuseTests !== false,
        enableDependencyTests: raw.get ? raw.get("securityAssurance.enableDependencyTests", true) : !raw.securityAssurance || raw.securityAssurance.enableDependencyTests !== false,
        enableDependencyReview: raw.get ? raw.get("securityAssurance.enableDependencyReview", true) : !raw.securityAssurance || raw.securityAssurance.enableDependencyReview !== false,
        enableSupplyChainTests: raw.get ? raw.get("securityAssurance.enableSupplyChainTests", true) : !raw.securityAssurance || raw.securityAssurance.enableSupplyChainTests !== false,
        requireWorkspaceTrust: raw.get ? raw.get("securityAssurance.requireWorkspaceTrust", true) : !raw.securityAssurance || raw.securityAssurance.requireWorkspaceTrust !== false,
        requireExplicitProtectedApproval: raw.get ? raw.get("securityAssurance.requireExplicitProtectedApproval", true) : !raw.securityAssurance || raw.securityAssurance.requireExplicitProtectedApproval !== false,
        requireSecretRedaction: raw.get ? raw.get("securityAssurance.requireSecretRedaction", true) : !raw.securityAssurance || raw.securityAssurance.requireSecretRedaction !== false,
        requireRemotePrivacyPolicy: raw.get ? raw.get("securityAssurance.requireRemotePrivacyPolicy", true) : !raw.securityAssurance || raw.securityAssurance.requireRemotePrivacyPolicy !== false,
        persistReports: raw.get ? raw.get("securityAssurance.persistReports", true) : !raw.securityAssurance || raw.securityAssurance.persistReports !== false,
      },
      stressScalability: {
        enabled: raw.get ? raw.get("stressScalability.enabled", true) : !raw.stressScalability || raw.stressScalability.enabled !== false,
        failClosed: raw.get ? raw.get("stressScalability.failClosed", true) : !raw.stressScalability || raw.stressScalability.failClosed !== false,
        maximumRuns: raw.get ? raw.get("stressScalability.maximumRuns", 32) : raw.stressScalability && raw.stressScalability.maximumRuns || 32,
        maximumConcurrentRuns: raw.get ? raw.get("stressScalability.maximumConcurrentRuns", 1) : raw.stressScalability && raw.stressScalability.maximumConcurrentRuns || 1,
        maximumScenariosPerRun: raw.get ? raw.get("stressScalability.maximumScenariosPerRun", 64) : raw.stressScalability && raw.stressScalability.maximumScenariosPerRun || 64,
        maximumSyntheticFiles: raw.get ? raw.get("stressScalability.maximumSyntheticFiles", 100000) : raw.stressScalability && raw.stressScalability.maximumSyntheticFiles || 100000,
        maximumSyntheticDirectories: raw.get ? raw.get("stressScalability.maximumSyntheticDirectories", 20000) : raw.stressScalability && raw.stressScalability.maximumSyntheticDirectories || 20000,
        maximumSyntheticSymbols: raw.get ? raw.get("stressScalability.maximumSyntheticSymbols", 1000000) : raw.stressScalability && raw.stressScalability.maximumSyntheticSymbols || 1000000,
        maximumSyntheticDependencies: raw.get ? raw.get("stressScalability.maximumSyntheticDependencies", 250000) : raw.stressScalability && raw.stressScalability.maximumSyntheticDependencies || 250000,
        maximumRepositoryBytes: raw.get ? raw.get("stressScalability.maximumRepositoryBytes", 256 * 1024 * 1024) : raw.stressScalability && raw.stressScalability.maximumRepositoryBytes || 256 * 1024 * 1024,
        maximumConcurrentOperations: raw.get ? raw.get("stressScalability.maximumConcurrentOperations", 16) : raw.stressScalability && raw.stressScalability.maximumConcurrentOperations || 16,
        maximumConcurrentModelRequests: raw.get ? raw.get("stressScalability.maximumConcurrentModelRequests", 4) : raw.stressScalability && raw.stressScalability.maximumConcurrentModelRequests || 4,
        maximumConcurrentAgentTurns: raw.get ? raw.get("stressScalability.maximumConcurrentAgentTurns", 4) : raw.stressScalability && raw.stressScalability.maximumConcurrentAgentTurns || 4,
        maximumConcurrentAssignments: raw.get ? raw.get("stressScalability.maximumConcurrentAssignments", 8) : raw.stressScalability && raw.stressScalability.maximumConcurrentAssignments || 8,
        maximumConcurrentWorkflows: raw.get ? raw.get("stressScalability.maximumConcurrentWorkflows", 4) : raw.stressScalability && raw.stressScalability.maximumConcurrentWorkflows || 4,
        maximumConcurrentWorkflowSteps: raw.get ? raw.get("stressScalability.maximumConcurrentWorkflowSteps", 16) : raw.stressScalability && raw.stressScalability.maximumConcurrentWorkflowSteps || 16,
        maximumQueueDepth: raw.get ? raw.get("stressScalability.maximumQueueDepth", 256) : raw.stressScalability && raw.stressScalability.maximumQueueDepth || 256,
        maximumEventRatePerSecond: raw.get ? raw.get("stressScalability.maximumEventRatePerSecond", 256) : raw.stressScalability && raw.stressScalability.maximumEventRatePerSecond || 256,
        maximumListeners: raw.get ? raw.get("stressScalability.maximumListeners", 64) : raw.stressScalability && raw.stressScalability.maximumListeners || 64,
        maximumCacheEntries: raw.get ? raw.get("stressScalability.maximumCacheEntries", 1024) : raw.stressScalability && raw.stressScalability.maximumCacheEntries || 1024,
        maximumCacheBytes: raw.get ? raw.get("stressScalability.maximumCacheBytes", 64 * 1024 * 1024) : raw.stressScalability && raw.stressScalability.maximumCacheBytes || 64 * 1024 * 1024,
        maximumContextPackages: raw.get ? raw.get("stressScalability.maximumContextPackages", 128) : raw.stressScalability && raw.stressScalability.maximumContextPackages || 128,
        maximumConversationMessages: raw.get ? raw.get("stressScalability.maximumConversationMessages", 1000) : raw.stressScalability && raw.stressScalability.maximumConversationMessages || 1000,
        maximumProposalFiles: raw.get ? raw.get("stressScalability.maximumProposalFiles", 128) : raw.stressScalability && raw.stressScalability.maximumProposalFiles || 128,
        maximumPatchBytes: raw.get ? raw.get("stressScalability.maximumPatchBytes", 2 * 1024 * 1024) : raw.stressScalability && raw.stressScalability.maximumPatchBytes || 2 * 1024 * 1024,
        maximumPersistenceCycles: raw.get ? raw.get("stressScalability.maximumPersistenceCycles", 8) : raw.stressScalability && raw.stressScalability.maximumPersistenceCycles || 8,
        maximumRecoveryCycles: raw.get ? raw.get("stressScalability.maximumRecoveryCycles", 8) : raw.stressScalability && raw.stressScalability.maximumRecoveryCycles || 8,
        maximumCancellationRate: raw.get ? raw.get("stressScalability.maximumCancellationRate", 64) : raw.stressScalability && raw.stressScalability.maximumCancellationRate || 64,
        maximumRunDurationMs: raw.get ? raw.get("stressScalability.maximumRunDurationMs", 120000) : raw.stressScalability && raw.stressScalability.maximumRunDurationMs || 120000,
        maximumScenarioDurationMs: raw.get ? raw.get("stressScalability.maximumScenarioDurationMs", 30000) : raw.stressScalability && raw.stressScalability.maximumScenarioDurationMs || 30000,
        maximumWarmupDurationMs: raw.get ? raw.get("stressScalability.maximumWarmupDurationMs", 5000) : raw.stressScalability && raw.stressScalability.maximumWarmupDurationMs || 5000,
        maximumCooldownDurationMs: raw.get ? raw.get("stressScalability.maximumCooldownDurationMs", 5000) : raw.stressScalability && raw.stressScalability.maximumCooldownDurationMs || 5000,
        memoryBudgetBytes: raw.get ? raw.get("stressScalability.memoryBudgetBytes", 128 * 1024 * 1024) : raw.stressScalability && raw.stressScalability.memoryBudgetBytes || 128 * 1024 * 1024,
        warningMemoryRatio: raw.get ? raw.get("stressScalability.warningMemoryRatio", 0.75) : raw.stressScalability && raw.stressScalability.warningMemoryRatio || 0.75,
        criticalMemoryRatio: raw.get ? raw.get("stressScalability.criticalMemoryRatio", 0.9) : raw.stressScalability && raw.stressScalability.criticalMemoryRatio || 0.9,
        enableRepositoryStress: raw.get ? raw.get("stressScalability.enableRepositoryStress", true) : !raw.stressScalability || raw.stressScalability.enableRepositoryStress !== false,
        enableConcurrencyStress: raw.get ? raw.get("stressScalability.enableConcurrencyStress", true) : !raw.stressScalability || raw.stressScalability.enableConcurrencyStress !== false,
        enableProviderStress: raw.get ? raw.get("stressScalability.enableProviderStress", true) : !raw.stressScalability || raw.stressScalability.enableProviderStress !== false,
        enableWorkflowStress: raw.get ? raw.get("stressScalability.enableWorkflowStress", true) : !raw.stressScalability || raw.stressScalability.enableWorkflowStress !== false,
        enableMemoryStress: raw.get ? raw.get("stressScalability.enableMemoryStress", true) : !raw.stressScalability || raw.stressScalability.enableMemoryStress !== false,
        enableQueueStress: raw.get ? raw.get("stressScalability.enableQueueStress", true) : !raw.stressScalability || raw.stressScalability.enableQueueStress !== false,
        enablePersistenceStress: raw.get ? raw.get("stressScalability.enablePersistenceStress", true) : !raw.stressScalability || raw.stressScalability.enablePersistenceStress !== false,
        enableRecoveryStress: raw.get ? raw.get("stressScalability.enableRecoveryStress", true) : !raw.stressScalability || raw.stressScalability.enableRecoveryStress !== false,
        enableCancellationStress: raw.get ? raw.get("stressScalability.enableCancellationStress", true) : !raw.stressScalability || raw.stressScalability.enableCancellationStress !== false,
        enablePresentationStress: raw.get ? raw.get("stressScalability.enablePresentationStress", true) : !raw.stressScalability || raw.stressScalability.enablePresentationStress !== false,
        persistReports: raw.get ? raw.get("stressScalability.persistReports", true) : !raw.stressScalability || raw.stressScalability.persistReports !== false,
      },
      qualification: {
        enabled: raw.get ? raw.get("qualification.enabled", true) : !raw.qualification || raw.qualification.enabled !== false,
        failClosed: raw.get ? raw.get("qualification.failClosed", true) : !raw.qualification || raw.qualification.failClosed !== false,
        maximumSuites: raw.get ? raw.get("qualification.maximumSuites", 16) : raw.qualification && raw.qualification.maximumSuites || 16,
        maximumScenariosPerSuite: raw.get ? raw.get("qualification.maximumScenariosPerSuite", 64) : raw.qualification && raw.qualification.maximumScenariosPerSuite || 64,
        maximumConcurrentScenarios: raw.get ? raw.get("qualification.maximumConcurrentScenarios", 1) : raw.qualification && raw.qualification.maximumConcurrentScenarios || 1,
        maximumFixtures: raw.get ? raw.get("qualification.maximumFixtures", 16) : raw.qualification && raw.qualification.maximumFixtures || 16,
        maximumDefects: raw.get ? raw.get("qualification.maximumDefects", 128) : raw.qualification && raw.qualification.maximumDefects || 128,
        maximumEvidenceItems: raw.get ? raw.get("qualification.maximumEvidenceItems", 256) : raw.qualification && raw.qualification.maximumEvidenceItems || 256,
        maximumArtifacts: raw.get ? raw.get("qualification.maximumArtifacts", 64) : raw.qualification && raw.qualification.maximumArtifacts || 64,
        maximumScenarioDurationMs: raw.get ? raw.get("qualification.maximumScenarioDurationMs", 30000) : raw.qualification && raw.qualification.maximumScenarioDurationMs || 30000,
        maximumRunDurationMs: raw.get ? raw.get("qualification.maximumRunDurationMs", 120000) : raw.qualification && raw.qualification.maximumRunDurationMs || 120000,
        maximumReloadCycles: raw.get ? raw.get("qualification.maximumReloadCycles", 2) : raw.qualification && raw.qualification.maximumReloadCycles || 2,
        maximumRepairAttempts: raw.get ? raw.get("qualification.maximumRepairAttempts", 2) : raw.qualification && raw.qualification.maximumRepairAttempts || 2,
        maximumProviderRetries: raw.get ? raw.get("qualification.maximumProviderRetries", 1) : raw.qualification && raw.qualification.maximumProviderRetries || 1,
        maximumWorkspaceBytes: raw.get ? raw.get("qualification.maximumWorkspaceBytes", 2 * 1024 * 1024) : raw.qualification && raw.qualification.maximumWorkspaceBytes || 2 * 1024 * 1024,
        maximumGeneratedFiles: raw.get ? raw.get("qualification.maximumGeneratedFiles", 64) : raw.qualification && raw.qualification.maximumGeneratedFiles || 64,
      maximumManualChecklistItems: raw.get ? raw.get("qualification.maximumManualChecklistItems", 256) : raw.qualification && raw.qualification.maximumManualChecklistItems || 256,
        requireExtensionHostVerification: raw.get ? raw.get("qualification.requireExtensionHostVerification", true) : !raw.qualification || raw.qualification.requireExtensionHostVerification !== false,
        requireLocalModelVerification: raw.get ? raw.get("qualification.requireLocalModelVerification", true) : !raw.qualification || raw.qualification.requireLocalModelVerification !== false,
        requireSourceChangeWorkflow: raw.get ? raw.get("qualification.requireSourceChangeWorkflow", true) : !raw.qualification || raw.qualification.requireSourceChangeWorkflow !== false,
        requireValidationWorkflow: raw.get ? raw.get("qualification.requireValidationWorkflow", true) : !raw.qualification || raw.qualification.requireValidationWorkflow !== false,
        requireRecoveryWorkflow: raw.get ? raw.get("qualification.requireRecoveryWorkflow", true) : !raw.qualification || raw.qualification.requireRecoveryWorkflow !== false,
        requireSecurityBaseline: raw.get ? raw.get("qualification.requireSecurityBaseline", true) : !raw.qualification || raw.qualification.requireSecurityBaseline !== false,
        requireReliabilityBaseline: raw.get ? raw.get("qualification.requireReliabilityBaseline", true) : !raw.qualification || raw.qualification.requireReliabilityBaseline !== false,
        requireScalabilityBaseline: raw.get ? raw.get("qualification.requireScalabilityBaseline", true) : !raw.qualification || raw.qualification.requireScalabilityBaseline !== false,
        requireAccessibilityVerification: raw.get ? raw.get("qualification.requireAccessibilityVerification", true) : !raw.qualification || raw.qualification.requireAccessibilityVerification !== false,
        requireNoCriticalDefects: raw.get ? raw.get("qualification.requireNoCriticalDefects", true) : !raw.qualification || raw.qualification.requireNoCriticalDefects !== false,
        persistReports: raw.get ? raw.get("qualification.persistReports", true) : !raw.qualification || raw.qualification.persistReports !== false,
      },
      models: {
        enabled: raw.get ? raw.get("models.enabled", true) : !raw.models || raw.models.enabled !== false,
        routingStrategy: raw.get ? raw.get("models.routingStrategy", RoutingStrategies.PRIVACY_FIRST) : raw.models && raw.models.routingStrategy || RoutingStrategies.PRIVACY_FIRST,
        defaultProvider: raw.get ? raw.get("models.defaultProvider", "") : raw.models && raw.models.defaultProvider || "",
        defaultModel: raw.get ? raw.get("models.defaultModel", "") : raw.models && raw.models.defaultModel || "",
        allowRemoteSourceCode: raw.get ? raw.get("models.allowRemoteSourceCode", false) : raw.models && raw.models.allowRemoteSourceCode === true,
        allowRemoteSensitiveContent: raw.get ? raw.get("models.allowRemoteSensitiveContent", false) : raw.models && raw.models.allowRemoteSensitiveContent === true,
        requestTimeoutMs: raw.get ? raw.get("models.requestTimeoutMs", 30000) : raw.models && raw.models.requestTimeoutMs || 30000,
        maximumRetries: raw.get ? raw.get("models.maximumRetries", 1) : raw.models && raw.models.maximumRetries || 1,
      },
      ollama: {
        enabled: raw.get ? raw.get("ollama.enabled", true) : !raw.ollama || raw.ollama.enabled !== false,
        baseUrl: raw.get ? raw.get("ollama.baseUrl", "http://127.0.0.1:11434") : raw.ollama && raw.ollama.baseUrl || "http://127.0.0.1:11434",
        defaultModel: raw.get ? raw.get("ollama.defaultModel", "") : raw.ollama && raw.ollama.defaultModel || "",
      },
      openAICompatible: {
        enabled: raw.get ? raw.get("openAICompatible.enabled", false) : raw.openAICompatible && raw.openAICompatible.enabled === true,
        baseUrl: raw.get ? raw.get("openAICompatible.baseUrl", "") : raw.openAICompatible && raw.openAICompatible.baseUrl || "",
        defaultModel: raw.get ? raw.get("openAICompatible.defaultModel", "") : raw.openAICompatible && raw.openAICompatible.defaultModel || "",
        credentialKey: raw.get ? raw.get("openAICompatible.credentialKey", "openai-compatible-api-key") : raw.openAICompatible && raw.openAICompatible.credentialKey || "openai-compatible-api-key",
      },
      agent: {
        enabled: raw.get ? raw.get("agent.enabled", true) : !raw.agent || raw.agent.enabled !== false,
        defaultMode: raw.get ? raw.get("agent.defaultMode", "PROPOSAL_ONLY") : raw.agent && raw.agent.defaultMode || "PROPOSAL_ONLY",
        maximumTurns: raw.get ? raw.get("agent.maximumTurns", 16) : raw.agent && raw.agent.maximumTurns || 16,
        maximumToolCalls: raw.get ? raw.get("agent.maximumToolCalls", 8) : raw.agent && raw.agent.maximumToolCalls || 8,
        enableStreaming: raw.get ? raw.get("agent.enableStreaming", true) : !raw.agent || raw.agent.enableStreaming !== false,
        requirePlanForProtectedActions: raw.get ? raw.get("agent.requirePlanForProtectedActions", true) : !raw.agent || raw.agent.requirePlanForProtectedActions !== false,
        autoCreateConversation: raw.get ? raw.get("agent.autoCreateConversation", true) : !raw.agent || raw.agent.autoCreateConversation !== false,
        persistConversationSummaries: raw.get ? raw.get("agent.persistConversationSummaries", true) : !raw.agent || raw.agent.persistConversationSummaries !== false,
      },
      workspaceTools: {
        enabled: raw.get ? raw.get("workspaceTools.enabled", true) : !raw.workspaceTools || raw.workspaceTools.enabled !== false,
        allowSourceChanges: raw.get ? raw.get("workspaceTools.allowSourceChanges", false) : raw.workspaceTools && raw.workspaceTools.allowSourceChanges === true,
        allowCommandExecution: raw.get ? raw.get("workspaceTools.allowCommandExecution", false) : raw.workspaceTools && raw.workspaceTools.allowCommandExecution === true,
        allowFileCreation: raw.get ? raw.get("workspaceTools.allowFileCreation", false) : raw.workspaceTools && raw.workspaceTools.allowFileCreation === true,
        allowFileDeletion: raw.get ? raw.get("workspaceTools.allowFileDeletion", false) : raw.workspaceTools && raw.workspaceTools.allowFileDeletion === true,
        allowFileRename: raw.get ? raw.get("workspaceTools.allowFileRename", false) : raw.workspaceTools && raw.workspaceTools.allowFileRename === true,
        requireApproval: raw.get ? raw.get("workspaceTools.requireApproval", true) : !raw.workspaceTools || raw.workspaceTools.requireApproval !== false,
        requireCheckpoint: raw.get ? raw.get("workspaceTools.requireCheckpoint", true) : !raw.workspaceTools || raw.workspaceTools.requireCheckpoint !== false,
      },
      multiAgent: {
        enabled: raw.get ? raw.get("multiAgent.enabled", true) : !raw.multiAgent || raw.multiAgent.enabled !== false,
        defaultStrategy: raw.get ? raw.get("multiAgent.defaultStrategy", "ADAPTIVE_BOUNDED") : raw.multiAgent && raw.multiAgent.defaultStrategy || "ADAPTIVE_BOUNDED",
        maximumAgents: raw.get ? raw.get("multiAgent.maximumAgents", 4) : raw.multiAgent && raw.multiAgent.maximumAgents || 4,
        maximumConcurrentAssignments: raw.get ? raw.get("multiAgent.maximumConcurrentAssignments", 2) : raw.multiAgent && raw.multiAgent.maximumConcurrentAssignments || 2,
        maximumDelegationRounds: raw.get ? raw.get("multiAgent.maximumDelegationRounds", 2) : raw.multiAgent && raw.multiAgent.maximumDelegationRounds || 2,
        requireIndependentChangeReview: raw.get ? raw.get("multiAgent.requireIndependentChangeReview", true) : !raw.multiAgent || raw.multiAgent.requireIndependentChangeReview !== false,
        requireSecurityReviewForSensitiveChanges: raw.get ? raw.get("multiAgent.requireSecurityReviewForSensitiveChanges", true) : !raw.multiAgent || raw.multiAgent.requireSecurityReviewForSensitiveChanges !== false,
        allowSameModelForReview: raw.get ? raw.get("multiAgent.allowSameModelForReview", true) : !raw.multiAgent || raw.multiAgent.allowSameModelForReview !== false,
        persistTeamSummaries: raw.get ? raw.get("multiAgent.persistTeamSummaries", true) : !raw.multiAgent || raw.multiAgent.persistTeamSummaries !== false,
      },
      workflows: {
        enabled: raw.get ? raw.get("workflows.enabled", true) : !raw.workflows || raw.workflows.enabled !== false,
        maximumActiveWorkflows: raw.get ? raw.get("workflows.maximumActiveWorkflows", 2) : raw.workflows && raw.workflows.maximumActiveWorkflows || 2,
        maximumConcurrentSteps: raw.get ? raw.get("workflows.maximumConcurrentSteps", 2) : raw.workflows && raw.workflows.maximumConcurrentSteps || 2,
        maximumStepsPerWorkflow: raw.get ? raw.get("workflows.maximumStepsPerWorkflow", 64) : raw.workflows && raw.workflows.maximumStepsPerWorkflow || 64,
        maximumRetriesPerStep: raw.get ? raw.get("workflows.maximumRetriesPerStep", 2) : raw.workflows && raw.workflows.maximumRetriesPerStep || 2,
        maximumRepairAttempts: raw.get ? raw.get("workflows.maximumRepairAttempts", 1) : raw.workflows && raw.workflows.maximumRepairAttempts || 1,
        checkpointIntervalMs: raw.get ? raw.get("workflows.checkpointIntervalMs", 60000) : raw.workflows && raw.workflows.checkpointIntervalMs || 60000,
        autoCheckpoint: raw.get ? raw.get("workflows.autoCheckpoint", true) : !raw.workflows || raw.workflows.autoCheckpoint !== false,
        allowSafeAutomaticResume: raw.get ? raw.get("workflows.allowSafeAutomaticResume", false) : raw.workflows && raw.workflows.allowSafeAutomaticResume === true,
        archiveCompleted: raw.get ? raw.get("workflows.archiveCompleted", false) : raw.workflows && raw.workflows.archiveCompleted === true,
        persistHistory: raw.get ? raw.get("workflows.persistHistory", true) : !raw.workflows || raw.workflows.persistHistory !== false,
      },
    };
  }

  isEnabled() {
    return this.config().enabled !== false;
  }

  track(disposable) {
    if (disposable) {
      this.disposables.push(disposable);
      if (Array.isArray(this.context.subscriptions)) this.context.subscriptions.push(disposable);
    }
    return disposable;
  }

  ensureRuntime() {
    if (!this.runtime) throw new Error("Levi runtime is not available.");
  }

  showError(error) {
    this.presentationCache.lastError = error && error.error || error;
    return presentRuntimeError(this.vscode, this.output, error, {
      diagnostics: this.config().diagnostics.enabled,
      showNotifications: this.config().ui.showNotifications,
    });
  }
}

function createLeviExtension(options) {
  return new LeviVSCodeExtension(options);
}

function defaultOllamaModelCapabilities() {
  return [
    ModelCapabilityTypes.CHAT,
    ModelCapabilityTypes.STREAMING,
    ModelCapabilityTypes.TOOL_CALLING,
    ModelCapabilityTypes.JSON_MODE,
    ModelCapabilityTypes.STRUCTURED_OUTPUT,
    ModelCapabilityTypes.SYSTEM_MESSAGES,
    ModelCapabilityTypes.MULTI_TURN,
    ModelCapabilityTypes.TEMPERATURE,
    ModelCapabilityTypes.TOP_P,
    ModelCapabilityTypes.SEED,
    ModelCapabilityTypes.TOKEN_USAGE,
    ModelCapabilityTypes.CANCELLATION,
  ];
}

function normalizeProjectPresentation(parts) {
  const summary = parts.summary || {};
  const assessment = parts.assessment || {};
  return {
    ...summary,
    assessment,
    architecture: parts.architecture,
    blockers: Array.isArray(parts.blockers) ? parts.blockers : parts.blockers && parts.blockers.blockers || parts.blockers || [],
    risks: Array.isArray(parts.risks) ? parts.risks : parts.risks && parts.risks.risks || parts.risks || [],
    nextActions: Array.isArray(parts.nextActions) ? parts.nextActions : parts.nextActions && parts.nextActions.actions || parts.nextActions || [],
    releaseReadiness: parts.releaseReadiness,
    confidence: summary.confidence || assessment.confidence,
    completeness: summary.completeness || assessment.completeness,
    limitations: [].concat(summary.limitations || [], assessment.limitations || []),
  };
}

function titleCase(value) {
  return String(value || "").replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function createNonce() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let index = 0; index < 32; index += 1) value += alphabet[Math.floor(Math.random() * alphabet.length)];
  return value;
}

function validateAgentWebviewMessage(message, maximumSize) {
  const allowed = new Set(["newConversation", "sendMessage", "cancelTurn", "retryTurn", "clearConversation", "showContext", "showPlan", "showTools"]);
  if (!message || typeof message !== "object" || Array.isArray(message)) return { valid: false, reason: "Message must be an object." };
  const size = JSON.stringify(message).length;
  if (size > maximumSize) return { valid: false, reason: "Message exceeds UI bounds." };
  if (!allowed.has(message.command)) return { valid: false, reason: "Command is not allowlisted." };
  if (message.content !== undefined && typeof message.content !== "string") return { valid: false, reason: "Content must be text." };
  if (message.objective !== undefined && typeof message.objective !== "string") return { valid: false, reason: "Objective must be text." };
  return { valid: true, message };
}

module.exports = {
  LeviVSCodeExtension,
  createLeviExtension,
  validateAgentWebviewMessage,
};
