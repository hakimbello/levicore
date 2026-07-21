const { EXPERIENCE_BOUNDS, PRODUCT_MODES } = require("./product-experience-constants");
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
const { normalizeProductExperienceState } = require("./product-experience-state");
const { serializeProductExperience, validateCopilotMessage, validateHomeMessage, validateWizardMessage } = require("./product-experience-serializer");

class ProductExperienceController {
  constructor(options = {}) {
    this.vscode = options.vscode;
    this.context = options.context || {};
    this.extension = options.extension;
    this.panel = null;
    this.homePanel = null;
    this.wizardPanel = null;
    this.buildWizard = createWizardSession();
    this.pendingComposerPrompt = null;
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
    if (!home.ready) {
      await this.extension.vscode.window.showInformationMessage(home.startBlockedReason || "Complete the setup steps on Levi Home before building.");
      this.postHomeState(home);
      return null;
    }
    this.buildWizard = createWizardSession();
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

  async openCopilot() {
    this.refresh();
    if (!this.vscode.window.createWebviewPanel) return this.extension.showDocument("product-copilot", "Levi", this.state());
    if (!this.panel) {
      this.panel = this.vscode.window.createWebviewPanel("leviCopilot", "Levi Composer", this.vscode.ViewColumn ? this.vscode.ViewColumn.One : 1, {
        enableScripts: true,
        retainContextWhenHidden: true,
      });
      this.panel.webview.html = renderCopilotHtml(this.state());
      if (this.panel.webview.onDidReceiveMessage) {
        this.extension.track(this.panel.webview.onDidReceiveMessage((message) => this.handleMessage(message)));
      }
      if (this.panel.onDidDispose) this.panel.onDidDispose(() => { this.panel = null; });
    }
    this.postState();
    return this.panel;
  }

  focusComposer() {
    if (!this.panel) return this.openCopilot();
    this.postState();
    return this.panel;
  }

  async newChat(input = {}) {
    this.mode = normalizeMode(input.mode || this.mode);
    return this.extension.newConversation({ objective: input.content || "" });
  }

  async submit(input = {}) {
    this.mode = normalizeMode(input.mode || this.mode);
    const content = String(input.content || "").slice(0, EXPERIENCE_BOUNDS.maximumInputBytes);
    if (!content.trim()) return null;
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
      openComposer: () => this.extension.openProductExperience(),
      startBuilding: () => this.openBuildWizard({ connectionChecked: true }),
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
    this.buildWizard.plan = generateImplementationPlan(this.buildWizard.templateId, this.buildWizard.answers);
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

  async startBuildingFromHome() {
    return this.openBuildWizard({ connectionChecked: true });
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
      this.extension.outputLine(`Rejected Levi Copilot webview message: ${parsed.reason}`);
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
      openOnboarding: () => this.openOnboarding(),
    };
    return handlers[parsed.message.command]();
  }

  postState(state = null) {
    if (!this.panel || !this.panel.webview || typeof this.panel.webview.postMessage !== "function") return;
    const payload = state || this.state();
    if (this.pendingComposerPrompt) {
      payload.pendingComposerPrompt = this.pendingComposerPrompt;
      this.pendingComposerPrompt = null;
    }
    this.panel.webview.postMessage({ type: "productState", state: payload });
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

  loadPreferences() {
    const globalState = this.context && this.context.globalState;
    if (!globalState || typeof globalState.get !== "function") return;
    const saved = globalState.get("levi.productExperience");
    if (saved && typeof saved === "object") {
      this.preferences = { ...this.preferences, ...(saved.preferences || {}) };
      this.mode = normalizeMode(saved.selectedMode || saved.mode || this.mode);
      this.onboarding = { ...this.onboarding, ...(saved.onboarding || {}) };
    }
  }

  persistPreference(key, value) {
    const globalState = this.context && this.context.globalState;
    if (!globalState || typeof globalState.update !== "function") return;
    const next = {
      preferences: this.preferences,
      selectedMode: key === "selectedMode" ? value : this.mode,
      onboarding: this.onboarding,
    };
    globalState.update("levi.productExperience", next);
  }

  dispose() {
    if (this.panel && typeof this.panel.dispose === "function") this.panel.dispose();
    if (this.homePanel && typeof this.homePanel.dispose === "function") this.homePanel.dispose();
    if (this.wizardPanel && typeof this.wizardPanel.dispose === "function") this.wizardPanel.dispose();
    this.panel = null;
    this.homePanel = null;
    this.wizardPanel = null;
  }
}

function normalizeMode(mode) {
  return Object.values(PRODUCT_MODES).includes(mode) ? mode : PRODUCT_MODES.ASK;
}

module.exports = {
  ProductExperienceController,
};
