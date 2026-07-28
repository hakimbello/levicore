const {
  EXPERIENCE_BOUNDS,
  LEVI_BUILD_FOCUS_COMMAND_ID,
  LEVI_BUILD_VIEW_ID,
  LEVI_OPEN_CONTAINER_COMMAND_ID,
  PRODUCT_MODES,
} = require("./product-experience-constants");
const { renderCopilotHtml } = require("./copilot-view-provider");
const {
  WIZARD_STEPS,
  TEMPLATE_QUESTIONS,
  createWizardSession,
  formatPlanForComposer,
  generateImplementationPlan,
  mergeAnswers,
  presentWizardState,
  validateAnswers,
} = require("./build-wizard-state");
const { renderBuildWizardHtml } = require("./build-wizard-view-provider");
const { presentHomeState } = require("./home-readiness");
const { renderHomeHtml } = require("./home-view-provider");
const { renderSettingsHtml } = require("./settings-view-provider");
const {
  createBuildTimeline,
  mapAgentEventToTimeline,
  mapRuntimeEventToTimeline,
  presentBuildTimeline,
  transitionBuildStage,
} = require("./build-timeline-state");
const { normalizeProductExperienceState } = require("./product-experience-state");
const { serializeProductExperience, validateCopilotMessage, validateHomeMessage, validateWizardMessage } = require("./product-experience-serializer");

class ProductExperienceController {
  constructor(options = {}) {
    this.vscode = options.vscode;
    this.context = options.context || {};
    this.extension = options.extension;
    this.panel = null;
    this.buildView = null;
    this.homePanel = null;
    this.wizardPanel = null;
    this.settingsPanel = null;
    this.buildWizard = createWizardSession();
    this.pendingComposerPrompt = null;
    this.pendingHomeBuildPrompt = null;
    this.buildTimeline = null;
    this.mode = PRODUCT_MODES.ASK;
    this.preferences = {
      showAdvancedDetails: false,
      compactEnvironment: true,
      timelineExpanded: false,
      preferredPanelLocation: "beside",
      collapsedSections: [],
    };
    this.onboarding = { completed: false };
  }

  configuration() {
    const config = this.extension && this.extension.config ? this.extension.config().experience || {} : {};
    return { ...config, ...this.preferences };
  }

  state() {
    const cache = this.extension && this.extension.presentationCache || {};
    return normalizeProductExperienceState({
      ...cache,
      productExperience: {
        ...(cache.productExperience || {}),
        mode: this.mode,
        preferences: this.preferences,
        onboarding: this.onboarding,
      },
    }, { configuration: this.configuration() });
  }

  refresh() {
    const state = this.state();
    if (this.extension && this.extension.presentationCache) this.extension.presentationCache.productExperience = state;
    this.postState(state);
    this.postHomeState();
    return state;
  }

  homeState(options = {}) {
    return presentHomeState(this.extension && typeof this.extension.homePresentationInput === "function"
      ? this.extension.homePresentationInput(options)
      : {}, {
      diagnosticsEnabled: this.extension && this.extension.config && this.extension.config().diagnostics && this.extension.config().diagnostics.enabled === true,
    });
  }

  wizardState(options = {}) {
    return presentWizardState(this.buildWizard, options);
  }

  async openBuildWizard(options = {}) {
    const home = this.homeState({ connectionChecked: options.connectionChecked !== false });
    if (!home.ready && options.allowBlocked !== true) {
      await this.extension.vscode.window.showInformationMessage(home.startBlockedReason || "Complete the setup steps on Levi Home before building.");
      this.postHomeState(home);
      return null;
    }
    this.buildWizard = createWizardSession({ goal: options.prompt || "" });
    this.seedWizardFromPrompt(options.prompt || "");
    this.refresh();
    const state = this.wizardState();
    if (!this.vscode.window.createWebviewPanel) {
      return this.extension.showDocument("build-wizard", "Build Wizard", state);
    }
    if (!this.wizardPanel) {
      this.wizardPanel = this.vscode.window.createWebviewPanel("leviBuildWizard", "Build Wizard", this.vscode.ViewColumn ? this.vscode.ViewColumn.One : 1, {
        enableScripts: true,
        retainContextWhenHidden: true,
      });
      this.wizardPanel.webview.html = renderBuildWizardHtml(state);
      if (this.wizardPanel.webview.onDidReceiveMessage) {
        this.extension.track(this.wizardPanel.webview.onDidReceiveMessage((message) => this.handleWizardMessage(message)));
      }
      if (this.wizardPanel.onDidDispose) this.wizardPanel.onDidDispose(() => { this.wizardPanel = null; });
    } else {
      this.wizardPanel.webview.html = renderBuildWizardHtml(state);
    }
    this.postWizardState(state);
    return this.wizardPanel;
  }

  async openHome(options = {}) {
    if (this.extension && typeof this.extension.refreshHomeConnectionState === "function") {
      await this.extension.refreshHomeConnectionState(options);
    }
    this.refresh();
    const state = this.homeState({ connectionChecked: options.connectionChecked !== false });
    if (!this.vscode.window.createWebviewPanel) {
      return this.extension.showDocument("home", "Levi Home", state);
    }
    if (!this.homePanel) {
      this.homePanel = this.vscode.window.createWebviewPanel("leviHome", "Levi Home", this.vscode.ViewColumn ? this.vscode.ViewColumn.One : 1, {
        enableScripts: true,
        retainContextWhenHidden: true,
      });
      this.homePanel.webview.html = renderHomeHtml(state);
      if (this.homePanel.webview.onDidReceiveMessage) {
        this.extension.track(this.homePanel.webview.onDidReceiveMessage((message) => this.handleHomeMessage(message)));
      }
      if (this.homePanel.onDidDispose) this.homePanel.onDidDispose(() => { this.homePanel = null; });
    } else {
      this.homePanel.webview.html = renderHomeHtml(state);
    }
    this.markHomeSeen();
    this.postHomeState(state);
    return this.homePanel;
  }

  markHomeSeen() {
    if (this.onboarding.completed) return;
    this.onboarding = { ...this.onboarding, completed: true };
    this.persistPreference("onboardingCompleted", true);
  }

  showOnboardingDiagnostics() {
    const state = this.refresh();
    return this.extension.showDocument("onboarding", "Levi Onboarding", state.onboarding);
  }

  async openBuildChat(options = {}) {
    const entryPoint = options.entryPoint || "levi.openBuildChat";
    this.refresh();
    if (!this.vscode.window.registerWebviewViewProvider) {
      this.logBuildRoute({
        entryPoint,
        resolvedCommand: "showDocument:build-chat",
        nativeChatInvoked: false,
      });
      return this.extension.showDocument("build-chat", "Levi Build", this.state());
    }
    if (this.vscode.commands && typeof this.vscode.commands.executeCommand === "function") {
      await this.vscode.commands.executeCommand(LEVI_OPEN_CONTAINER_COMMAND_ID);
      await this.vscode.commands.executeCommand(LEVI_BUILD_FOCUS_COMMAND_ID).catch(() => null);
    }
    if (this.buildView && typeof this.buildView.show === "function") this.buildView.show(true);
    this.logBuildRoute({
      entryPoint,
      resolvedCommand: `${LEVI_OPEN_CONTAINER_COMMAND_ID} -> ${LEVI_BUILD_FOCUS_COMMAND_ID}`,
      nativeChatInvoked: false,
    });
    this.postState();
    return this.buildView;
  }

  resolveWebviewView(webviewView) {
    this.buildView = webviewView;
    if (webviewView.webview) {
      webviewView.webview.options = {
        ...(webviewView.webview.options || {}),
        enableScripts: true,
      };
      webviewView.webview.html = renderCopilotHtml(this.state());
      if (webviewView.webview.onDidReceiveMessage) {
        this.extension.track(webviewView.webview.onDidReceiveMessage((message) => this.handleMessage(message)));
      }
    }
    if (webviewView.onDidDispose) webviewView.onDidDispose(() => { this.buildView = null; });
    this.logBuildRoute({
      entryPoint: "activitybar-build-view",
      resolvedCommand: LEVI_BUILD_FOCUS_COMMAND_ID,
      nativeChatInvoked: false,
    });
    this.postState();
    return webviewView;
  }

  async openSettings() {
    const state = this.settingsState();
    if (!this.vscode.window.createWebviewPanel) return this.extension.showDocument("settings", "Levi Settings", state);
    if (!this.settingsPanel) {
      this.settingsPanel = this.vscode.window.createWebviewPanel("leviSettings", "Levi Settings", this.vscode.ViewColumn ? this.vscode.ViewColumn.One : 1, {
        enableScripts: true,
        retainContextWhenHidden: true,
      });
      this.settingsPanel.webview.html = renderSettingsHtml(state);
      if (this.settingsPanel.webview.onDidReceiveMessage) {
        this.extension.track(this.settingsPanel.webview.onDidReceiveMessage((message) => this.handleSettingsMessage(message)));
      }
      if (this.settingsPanel.onDidDispose) this.settingsPanel.onDidDispose(() => { this.settingsPanel = null; });
    } else {
      this.settingsPanel.webview.html = renderSettingsHtml(state);
    }
    this.postSettingsState(state);
    return this.settingsPanel;
  }

  settingsState() {
    return this.extension && typeof this.extension.settingsPresentationInput === "function" ? this.extension.settingsPresentationInput() : {};
  }

  focusComposer() {
    return this.openBuildChat({ entryPoint: "levi.focusComposer" });
  }

  logBuildRoute(details = {}) {
    if (!this.extension || typeof this.extension.outputLine !== "function") return;
    const providerClassName = this.constructor && this.constructor.name || "ProductExperienceController";
    this.extension.outputLine([
      "Levi Build route:",
      `requested entry point=${details.entryPoint || "unknown"}`,
      `resolved command=${details.resolvedCommand || LEVI_BUILD_FOCUS_COMMAND_ID}`,
      `resolved view ID=${LEVI_BUILD_VIEW_ID}`,
      `provider class name=${providerClassName}`,
      `native Chat invoked: ${details.nativeChatInvoked === true ? "true" : "false"}`,
    ].join(" "));
  }

  async newChat(input = {}) {
    this.mode = normalizeMode(input.mode || this.mode);
    this.buildTimeline = null;
    this.postBuildTimeline();
    return this.extension.newConversation({ objective: input.content || "" });
  }

  startBuildTimeline(input = {}) {
    this.buildTimeline = createBuildTimeline({
      buildId: input.buildId,
      operationId: input.operationId || null,
      startedAt: new Date().toISOString(),
    });
    const started = transitionBuildStage(this.buildTimeline, "requirements", "active", {
      currentTask: input.currentTask || "Reviewing request",
    });
    if (started.applied) this.buildTimeline = started.timeline;
    this.buildTimeline.latestActivity = input.message || "Build request submitted";
    this.postBuildTimeline();
    return this.buildTimeline;
  }

  handleRuntimeEvent(event = {}) {
    if (!this.buildTimeline) return null;
    const diagnosticsEnabled = this.extension && this.extension.config && this.extension.config().diagnostics && this.extension.config().diagnostics.enabled === true;
    const result = mapRuntimeEventToTimeline(this.buildTimeline, event, { diagnosticsEnabled });
    if (result.applied) {
      this.buildTimeline = result.timeline;
      this.postBuildTimeline();
    }
    return result;
  }

  handleAgentEvent(event = {}) {
    if (!this.buildTimeline) return null;
    const diagnosticsEnabled = this.extension && this.extension.config && this.extension.config().diagnostics && this.extension.config().diagnostics.enabled === true;
    const result = mapAgentEventToTimeline(this.buildTimeline, event, { diagnosticsEnabled });
    if (result.applied) {
      this.buildTimeline = result.timeline;
      this.postBuildTimeline();
    }
    return result;
  }

  buildTimelineState(options = {}) {
    if (!this.buildTimeline) return null;
    const diagnosticsEnabled = options.diagnosticsEnabled === true
      || (this.extension && this.extension.config && this.extension.config().diagnostics && this.extension.config().diagnostics.enabled === true);
    return presentBuildTimeline(this.buildTimeline, { nowMs: Date.now(), diagnosticsEnabled });
  }

  toggleTimelineDetails() {
    if (!this.buildTimeline) return null;
    this.buildTimeline.detailsExpanded = !this.buildTimeline.detailsExpanded;
    return this.postBuildTimeline();
  }

  async submit(input = {}) {
    this.mode = normalizeMode(input.mode || this.mode);
    const content = String(input.content || "").slice(0, EXPERIENCE_BOUNDS.maximumInputBytes);
    if (!content.trim()) return null;
    this.startBuildTimeline({ message: "Build request submitted", currentTask: "Reviewing request" });
    const modePrefix = this.mode === PRODUCT_MODES.ASK ? "" : `[${this.mode}] `;
    return this.extension.sendAgentMessage({ content: `${modePrefix}${content}`, privacyClassification: input.privacyClassification });
  }

  async cancel() {
    return this.extension.cancelAgentTurn();
  }

  async retry() {
    return this.extension.retryAgentTurn();
  }

  setMode(mode) {
    this.mode = normalizeMode(mode);
    this.persistPreference("selectedMode", this.mode);
    return this.refresh();
  }

  selectModel() {
    return this.extension.selectModel();
  }

  attachCurrentFile() {
    return this.extension.understandCurrentFile();
  }

  attachSelectedCode() {
    const editor = this.vscode.window.activeTextEditor;
    const selection = editor && editor.selection;
    const text = editor && editor.document && selection && typeof editor.document.getText === "function" ? editor.document.getText(selection) : "";
    const bounded = String(text || "").slice(0, EXPERIENCE_BOUNDS.maximumInputBytes);
    if (this.extension.presentationCache) this.extension.presentationCache.selectedCode = bounded ? { available: true, preview: bounded.slice(0, 200) } : null;
    this.refresh();
    return this.extension.showDocument("selected-code-context", "Levi Selected Code Context", this.extension.presentationCache.selectedCode || { available: false });
  }

  showEnvironment() {
    this.refresh();
    return this.extension.showDocument("environment", "Levi Environment", this.state());
  }

  showActiveWorkflow() {
    return this.extension.showWorkflow();
  }

  showActiveApproval() {
    const state = this.refresh();
    return this.extension.showDocument("active-approval", "Levi Active Approval", state.activeApproval || { status: "No approval waiting" });
  }

  showActiveChange() {
    const state = this.refresh();
    return this.extension.showDocument("active-change", "Levi Active Change", state.changes || {});
  }

  openOnboarding() {
    return this.openHome();
  }

  showContext() {
    const state = this.refresh();
    return this.extension.showDocument("context", "Levi Context", state.context);
  }

  showTechnicalDetails() {
    const state = this.refresh();
    return this.extension.showDocument("technical-details", "Levi Technical Details", serializeProductExperience(state, { maximumSize: EXPERIENCE_BOUNDS.maximumSerializedStateBytes }));
  }

  handleHomeMessage(message) {
    const parsed = validateHomeMessage(message, { maximumSize: EXPERIENCE_BOUNDS.maximumSerializedStateBytes });
    if (!parsed.valid) {
      this.extension.outputLine(`Rejected Levi Home webview message: ${parsed.reason}`);
      return null;
    }
    const handlers = {
      testConnection: () => this.extension.testModelConnectionFromHome(),
      selectModel: () => this.extension.selectModel().then(() => this.refreshHomeAfterAction()),
      openSetupGuide: () => this.extension.showHomeSetupGuide(),
      openProjectFolder: () => this.extension.openProjectFolder().then(() => this.refreshHomeAfterAction()),
      analyzeProject: () => this.extension.analyzeProject().then(() => this.refreshHomeAfterAction()),
      setupOllama: () => this.extension.showHomeSetupGuide(),
      openComposer: () => this.prefillComposerFromHome(parsed.message.prompt || ""),
      openSettings: () => this.openSettings(),
      startBuilding: () => this.startBuildingFromHome({ prompt: parsed.message.prompt || "" }),
    };
    const handler = handlers[parsed.message.command];
    return handler ? handler() : null;
  }

  handleWizardMessage(message) {
    const parsed = validateWizardMessage(message, { maximumSize: EXPERIENCE_BOUNDS.maximumSerializedStateBytes });
    if (!parsed.valid) {
      this.extension.outputLine(`Rejected Levi Build Wizard message: ${parsed.reason}`);
      return null;
    }
    const handlers = {
      selectTemplate: () => this.selectWizardTemplate(parsed.message.templateId),
      updateAnswers: () => this.updateWizardAnswers(parsed.message.answers),
      nextStep: () => this.advanceWizardStep(),
      previousStep: () => this.rewindWizardStep(),
      generatePlan: () => this.generateWizardPlan(),
      approvePlan: () => this.approveWizardPlan(),
      editPlan: () => this.editWizardPlan(),
      cancelWizard: () => this.cancelBuildWizard(),
      launchComposer: () => this.launchComposerFromWizard(),
    };
    const handler = handlers[parsed.message.command];
    return handler ? handler() : null;
  }

  selectWizardTemplate(templateId) {
    this.buildWizard.templateId = String(templateId || "");
    this.buildWizard.answers = {};
    this.buildWizard.plan = null;
    this.buildWizard.approved = false;
    return this.postWizardState();
  }

  seedWizardFromPrompt(prompt) {
    const goal = String(prompt || "").trim();
    if (!goal) return;
    const templateId = inferTemplateFromPrompt(goal);
    this.buildWizard.templateId = templateId;
    this.buildWizard.answers = answersFromPrompt(templateId, goal);
    this.buildWizard.step = WIZARD_STEPS.QUESTIONS;
  }

  updateWizardAnswers(answers = {}) {
    const questions = TEMPLATE_QUESTIONS[this.buildWizard.templateId] || [];
    this.buildWizard.answers = mergeAnswers(this.buildWizard, answers, questions);
    return this.postWizardState();
  }

  advanceWizardStep() {
    const step = Number(this.buildWizard.step) || WIZARD_STEPS.TEMPLATE;
    if (step === WIZARD_STEPS.TEMPLATE && !this.buildWizard.templateId) return this.postWizardState();
    if (step === WIZARD_STEPS.QUESTIONS) return this.generateWizardPlan();
    if (step === WIZARD_STEPS.PLAN && !this.buildWizard.plan) return this.postWizardState();
    if (step === WIZARD_STEPS.PLAN) this.buildWizard.step = WIZARD_STEPS.APPROVAL;
    else if (step < WIZARD_STEPS.LAUNCH) this.buildWizard.step = step + 1;
    return this.postWizardState();
  }

  rewindWizardStep() {
    const step = Number(this.buildWizard.step) || WIZARD_STEPS.TEMPLATE;
    if (step === WIZARD_STEPS.PLAN) this.buildWizard.step = WIZARD_STEPS.QUESTIONS;
    else if (step === WIZARD_STEPS.QUESTIONS) this.buildWizard.step = WIZARD_STEPS.TEMPLATE;
    else if (step > WIZARD_STEPS.TEMPLATE) this.buildWizard.step = step - 1;
    return this.postWizardState();
  }

  generateWizardPlan() {
    const questions = TEMPLATE_QUESTIONS[this.buildWizard.templateId] || [];
    const validation = validateAnswers(this.buildWizard.answers, questions);
    if (!validation.valid) {
      this.postWizardState({ blockedReason: validation.reason });
      return null;
    }
    this.buildWizard.plan = generateImplementationPlan(this.buildWizard.templateId, {
      ...(this.buildWizard.answers || {}),
      projectGoal: this.buildWizard.goal || "",
    });
    this.buildWizard.step = WIZARD_STEPS.PLAN;
    this.buildWizard.approved = false;
    return this.postWizardState();
  }

  approveWizardPlan() {
    if (!this.buildWizard.plan) return this.postWizardState();
    this.buildWizard.approved = true;
    this.buildWizard.step = WIZARD_STEPS.LAUNCH;
    return this.postWizardState();
  }

  editWizardPlan() {
    this.buildWizard.approved = false;
    this.buildWizard.step = WIZARD_STEPS.QUESTIONS;
    return this.postWizardState();
  }

  cancelBuildWizard() {
    this.buildWizard = createWizardSession();
    if (this.wizardPanel && typeof this.wizardPanel.dispose === "function") {
      this.wizardPanel.dispose();
      this.wizardPanel = null;
    }
    return null;
  }

  async launchComposerFromWizard() {
    if (!this.buildWizard.approved || !this.buildWizard.plan) {
      return this.postWizardState({ blockedReason: "Approve the plan before launching Levi Composer." });
    }
    this.pendingComposerPrompt = formatPlanForComposer(this.buildWizard.plan);
    await this.extension.openProductExperience();
    this.mode = PRODUCT_MODES.BUILD;
    this.persistPreference("selectedMode", this.mode);
    this.refresh();
    if (this.wizardPanel && typeof this.wizardPanel.dispose === "function") {
      this.wizardPanel.dispose();
      this.wizardPanel = null;
    }
    this.buildWizard = createWizardSession();
    return { routed: "composer", autoSubmit: false };
  }

  async startBuildingFromHome(input = {}) {
    return this.handleHomeBuild(input);
  }

  async handleHomeBuild(input = {}) {
    const prompt = String(input.prompt || "").slice(0, EXPERIENCE_BOUNDS.maximumInputBytes);
    this.pendingHomeBuildPrompt = prompt;
    this.persistPreference("pendingHomeBuildPrompt", prompt);
    if (!this.extension.hasProjectFolder()) {
      const choice = await this.extension.chooseProjectFolderForPrompt(prompt);
      if (!choice) {
        this.postFolderChoice();
        return null;
      }
      await this.extension.openProjectFolder({ mode: choice, prompt });
      return this.resumePendingHomeBuildIfReady();
    }
    if (this.shouldUseBuildWizard(prompt)) {
      return this.openBuildWizard({ connectionChecked: true, allowBlocked: true, prompt });
    }
    return this.prefillComposerFromHome(prompt);
  }

  async resumePendingHomeBuildIfReady() {
    if (!this.pendingHomeBuildPrompt || !this.extension.hasProjectFolder()) {
      this.postHomeState();
      return null;
    }
    return this.handleHomeBuild({ prompt: this.pendingHomeBuildPrompt });
  }

  shouldUseBuildWizard(prompt) {
    const config = this.extension && this.extension.config ? this.extension.config().experience || {} : {};
    if (config.showBuildWizard === false) return false;
    const text = String(prompt || "").toLowerCase();
    if (/\b(fix|error|bug|auth|authentication|codebase|this project|existing project)\b/.test(text)) return false;
    return true;
  }

  async prefillComposerFromHome(prompt) {
    const text = String(prompt || "").slice(0, EXPERIENCE_BOUNDS.maximumInputBytes);
    this.pendingComposerPrompt = text;
    this.pendingHomeBuildPrompt = null;
    this.persistPreference("pendingHomeBuildPrompt", null);
    await this.extension.openProductExperience();
    this.mode = PRODUCT_MODES.BUILD;
    this.persistPreference("selectedMode", this.mode);
    this.refresh();
    return { routed: "composer", autoSubmit: false };
  }

  async refreshHomeAfterAction() {
    if (this.extension && typeof this.extension.refreshHomeConnectionState === "function") {
      await this.extension.refreshHomeConnectionState({ connectionChecked: true });
    }
    this.refresh();
    return this.postHomeState();
  }

  handleMessage(message) {
    const parsed = validateCopilotMessage(message, { maximumSize: EXPERIENCE_BOUNDS.maximumSerializedStateBytes });
    if (!parsed.valid) {
      this.extension.outputLine(`Rejected Levi Build Chat webview message: ${parsed.reason}`);
      return null;
    }
    const handlers = {
      newChat: () => this.newChat(parsed.message),
      submit: () => this.submit(parsed.message),
      cancel: () => this.cancel(),
      retry: () => this.retry(),
      setMode: () => this.setMode(parsed.message.mode),
      selectModel: () => this.selectModel(),
      attachCurrentFile: () => this.attachCurrentFile(),
      attachSelectedCode: () => this.attachSelectedCode(),
      showContext: () => this.showContext(),
      showEnvironment: () => this.showEnvironment(),
      showTechnicalDetails: () => this.showTechnicalDetails(),
      openSettings: () => this.openSettings(),
      openOnboarding: () => this.openOnboarding(),
      toggleTimelineDetails: () => this.toggleTimelineDetails(),
      openChangeReview: () => this.showActiveChange(),
      openValidationDetails: () => this.extension.showValidationResult(),
    };
    return handlers[parsed.message.command]();
  }

  postState(state = null) {
    const targets = this.webviewTargets();
    if (!targets.length) return;
    const payload = state || this.state();
    payload.buildTimeline = this.buildTimelineState();
    if (this.pendingComposerPrompt) {
      payload.pendingComposerPrompt = this.pendingComposerPrompt;
      this.pendingComposerPrompt = null;
    }
    for (const target of targets) {
      target.webview.postMessage({ type: "productState", state: payload });
    }
  }

  postBuildTimeline() {
    for (const target of this.webviewTargets()) {
      target.webview.postMessage({ type: "buildTimeline", state: this.buildTimelineState() });
    }
  }

  webviewTargets() {
    return [this.buildView, this.panel].filter((target) => target && target.webview && typeof target.webview.postMessage === "function");
  }

  postWizardState(options = {}) {
    const state = this.wizardState(options);
    if (!this.wizardPanel || !this.wizardPanel.webview || typeof this.wizardPanel.webview.postMessage !== "function") return state;
    this.wizardPanel.webview.postMessage({ type: "wizardState", state });
    return state;
  }

  postHomeState(state = null) {
    if (!this.homePanel || !this.homePanel.webview || typeof this.homePanel.webview.postMessage !== "function") return;
    this.homePanel.webview.postMessage({ type: "homeState", state: state || this.homeState({ connectionChecked: true }) });
  }

  postFolderChoice() {
    if (!this.homePanel || !this.homePanel.webview || typeof this.homePanel.webview.postMessage !== "function") return;
    this.homePanel.webview.postMessage({ type: "folderChoice" });
  }

  postSettingsState(state = null) {
    if (!this.settingsPanel || !this.settingsPanel.webview || typeof this.settingsPanel.webview.postMessage !== "function") return;
    this.settingsPanel.webview.postMessage({ type: "settingsState", state: state || this.settingsState() });
  }

  handleSettingsMessage(message) {
    if (!message || typeof message !== "object") return null;
    const handlers = {
      testConnection: () => this.extension.testModelConnectionFromHome().then(() => this.postSettingsState()),
      changeModel: () => this.extension.selectModel().then(() => this.postSettingsState()),
      enableDeveloperTools: () => this.extension.setDeveloperToolsEnabled(message.enabled === true).then(() => this.postSettingsState()),
    };
    const handler = handlers[message.command];
    return handler ? handler() : null;
  }

  loadPreferences() {
    const globalState = this.context && this.context.globalState;
    if (!globalState || typeof globalState.get !== "function") return;
    const saved = globalState.get("levi.productExperience");
    if (saved && typeof saved === "object") {
      this.preferences = { ...this.preferences, ...(saved.preferences || {}) };
      this.mode = normalizeMode(saved.selectedMode || saved.mode || this.mode);
      this.onboarding = { ...this.onboarding, ...(saved.onboarding || {}) };
      this.pendingHomeBuildPrompt = saved.pendingHomeBuildPrompt || null;
    }
  }

  persistPreference(key, value) {
    const globalState = this.context && this.context.globalState;
    if (!globalState || typeof globalState.update !== "function") return;
    const next = {
      preferences: this.preferences,
      selectedMode: key === "selectedMode" ? value : this.mode,
      onboarding: this.onboarding,
      pendingHomeBuildPrompt: key === "pendingHomeBuildPrompt" ? value : this.pendingHomeBuildPrompt,
    };
    globalState.update("levi.productExperience", next);
  }

  dispose() {
    if (this.panel && typeof this.panel.dispose === "function") this.panel.dispose();
    if (this.buildView && typeof this.buildView.dispose === "function") this.buildView.dispose();
    if (this.homePanel && typeof this.homePanel.dispose === "function") this.homePanel.dispose();
    if (this.wizardPanel && typeof this.wizardPanel.dispose === "function") this.wizardPanel.dispose();
    if (this.settingsPanel && typeof this.settingsPanel.dispose === "function") this.settingsPanel.dispose();
    this.panel = null;
    this.buildView = null;
    this.homePanel = null;
    this.wizardPanel = null;
    this.settingsPanel = null;
    this.buildTimeline = null;
  }
}

function normalizeMode(mode) {
  return Object.values(PRODUCT_MODES).includes(mode) ? mode : PRODUCT_MODES.ASK;
}

function inferTemplateFromPrompt(prompt) {
  const text = String(prompt || "").toLowerCase();
  if (/restaurant|website|site|landing|business/.test(text)) return "landing-page";
  if (/api|endpoint|server/.test(text)) return "rest-api";
  if (/mobile|ios|android/.test(text)) return "mobile-app";
  if (/vs code|vscode|extension/.test(text)) return "vscode-extension";
  if (/existing|codebase|fix|error|auth/.test(text)) return "existing-project";
  return "web-app";
}

function answersFromPrompt(templateId, prompt) {
  const goal = String(prompt || "").trim();
  if (templateId === "landing-page") return { businessName: inferName(goal, "Business Website"), targetAudience: "Customers" };
  if (templateId === "web-app") return { projectName: inferName(goal, "Web App") };
  if (templateId === "mobile-app") return { appName: inferName(goal, "Mobile App") };
  if (templateId === "rest-api") return { projectName: inferName(goal, "API") };
  if (templateId === "vscode-extension") return { extensionName: inferName(goal, "VS Code Extension"), purpose: goal };
  if (templateId === "existing-project") return { goals: goal };
  return {};
}

function inferName(prompt, fallback) {
  const text = String(prompt || "").replace(/[.?!]+$/g, "").trim();
  if (!text) return fallback;
  return text.length > 80 ? text.slice(0, 80) : text;
}

module.exports = {
  ProductExperienceController,
};
