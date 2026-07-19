const { EXPERIENCE_BOUNDS, PRODUCT_MODES } = require("./product-experience-constants");
const { renderCopilotHtml } = require("./copilot-view-provider");
const { normalizeProductExperienceState } = require("./product-experience-state");
const { serializeProductExperience, validateCopilotMessage } = require("./product-experience-serializer");

class ProductExperienceController {
  constructor(options = {}) {
    this.vscode = options.vscode;
    this.context = options.context || {};
    this.extension = options.extension;
    this.panel = null;
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
    return state;
  }

  async openCopilot() {
    this.refresh();
    if (!this.vscode.window.createWebviewPanel) return this.extension.showDocument("product-copilot", "Levi", this.state());
    if (!this.panel) {
      this.panel = this.vscode.window.createWebviewPanel("leviCopilot", "Levi", this.vscode.ViewColumn ? this.vscode.ViewColumn.One : 1, {
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
    const state = this.refresh();
    return this.extension.showDocument("onboarding", "Levi Onboarding", state.onboarding);
  }

  showContext() {
    const state = this.refresh();
    return this.extension.showDocument("context", "Levi Context", state.context);
  }

  showTechnicalDetails() {
    const state = this.refresh();
    return this.extension.showDocument("technical-details", "Levi Technical Details", serializeProductExperience(state, { maximumSize: EXPERIENCE_BOUNDS.maximumSerializedStateBytes }));
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
    this.panel.webview.postMessage({ type: "productState", state: state || this.state() });
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
    this.panel = null;
  }
}

function normalizeMode(mode) {
  return Object.values(PRODUCT_MODES).includes(mode) ? mode : PRODUCT_MODES.ASK;
}

module.exports = {
  ProductExperienceController,
};
