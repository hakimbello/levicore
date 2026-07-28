const assert = require("node:assert/strict");
const test = require("node:test");

const { createLeviExtension } = require("../src/levi-extension");
const {
  WIZARD_STEPS,
  createWizardSession,
  formatPlanForComposer,
  generateImplementationPlan,
  presentWizardState,
} = require("../src/product-experience/build-wizard-state");
const { renderBuildWizardHtml } = require("../src/product-experience/build-wizard-view-provider");
const { validateWizardMessage } = require("../src/product-experience/product-experience-serializer");
const { createFakeContext, createFakeVSCode } = require("./fake-vscode");

const baseConfig = {
  "levi.autoInitialize": true,
  "levi.autoAnalyzeWorkspace": false,
  "levi.experience.autoOpenOnFirstRun": false,
  "levi.ui.showNotifications": false,
  "levi.models.enabled": true,
  "levi.ollama.enabled": true,
  "levi.openAICompatible.enabled": false,
  "levi.diagnostics.enabled": false,
};

function createReadyRuntime() {
  return {
    calls: [],
    initialize: () => Promise.resolve({ success: true, status: "SUCCEEDED", data: { state: "READY" } }),
    getState: () => ({ state: "READY" }),
    getRuntimeHealth: () => ({ runtimeState: "READY", overallRuntimeHealth: 100, blockers: [], warnings: [] }),
    executeCommand(commandId) {
      this.calls.push(commandId);
      if (commandId === "model.health") {
        return Promise.resolve({
          success: true,
          data: {
            summary: { availableModels: 1, defaultModelId: "local:chat" },
            providers: [{ id: "ollama-local", state: "AVAILABLE" }],
            models: [{ id: "local:chat", name: "chat", providerId: "ollama-local" }],
          },
        });
      }
      return Promise.resolve({ success: true, data: {} });
    },
    listOperations: () => [],
    agentEngine: () => null,
    subscribe: () => "sub-1",
    unsubscribe: () => {},
    save: () => {},
    shutdown: () => Promise.resolve(),
  };
}

async function createReadyExtension() {
  const runtime = createReadyRuntime();
  const vscode = createFakeVSCode({
    config: baseConfig,
    files: { "file:/workspace/src/app.js": "console.log('stay');\n" },
  });
  const extension = createLeviExtension({ vscode, context: createFakeContext(), runtimeFactory: () => runtime });
  await extension.activate();
  await extension.refreshHomeConnectionState({ connectionChecked: true });
  extension.presentationCache.selectedModel = { id: "local:chat", name: "chat" };
  return { extension, runtime, vscode };
}

test("Build Wizard opens from Home Start Building", async () => {
  const { extension } = await createReadyExtension();
  await extension.openHome({ connectionChecked: true });
  await extension.productExperience.startBuildingFromHome();

  assert.equal(extension.productExperience.wizardPanel.viewType, "leviBuildWizard");
  assert.equal(extension.productExperience.wizardPanel.title, "Build Wizard");
  assert.match(extension.productExperience.wizardPanel.webview.html, /What do you want to build/i);
  await extension.deactivate();
});

test("template selection advances wizard state", () => {
  const session = createWizardSession();
  session.templateId = "landing-page";
  session.step = WIZARD_STEPS.TEMPLATE;
  const state = presentWizardState(session);

  assert.equal(state.templates.find((entry) => entry.id === "landing-page").selected, true);
  assert.equal(state.canProceed, true);
});

test("question flow shows template-specific fields", () => {
  const session = {
    step: WIZARD_STEPS.QUESTIONS,
    templateId: "landing-page",
    answers: { businessName: "Acme", framework: "Next.js", styling: "Tailwind" },
    plan: null,
    approved: false,
  };
  const state = presentWizardState(session);
  const html = renderBuildWizardHtml(state, { nonce: "wizard1" });

  assert.equal(state.step, 2);
  assert.ok(state.questions.some((question) => question.id === "businessName"));
  assert.ok(state.questions.some((question) => question.id === "framework"));
  assert.match(html, /Business Name/);
  assert.match(html, /Step 2 of 5/);
});

test("plan generation produces architecture, folders, dependencies, and risks", () => {
  const plan = generateImplementationPlan("rest-api", {
    projectName: "Orders API",
    language: "TypeScript",
    framework: "Express",
    authentication: "JWT",
    database: "PostgreSQL",
    features: ["OpenAPI generation", "Docker", "Testing framework"],
  });

  assert.equal(plan.name, "Orders API");
  assert.ok(plan.architecture);
  assert.ok(plan.folderStructure.length);
  assert.ok(plan.packages.length);
  assert.ok(plan.dependencies.length);
  assert.ok(plan.estimatedFiles > 0);
  assert.ok(plan.securityConsiderations.length);
  assert.ok(plan.testingStrategy.length);
  assert.ok(plan.potentialRisks.length);
  assert.equal(plan.codeGenerationStarted, false);
});

test("approval step exposes Approve and Edit Plan actions", () => {
  const plan = generateImplementationPlan("web-app", { projectName: "Portal", framework: "Next.js" });
  const session = { step: WIZARD_STEPS.APPROVAL, templateId: "web-app", answers: { projectName: "Portal" }, plan, approved: false };
  const state = presentWizardState(session);
  const html = renderBuildWizardHtml(state, { nonce: "wizard2" });

  assert.equal(state.step, 4);
  assert.equal(state.actions.primary, "Approve");
  assert.equal(state.actions.tertiary, "Edit Plan");
  assert.match(html, /Approve this plan/i);
});

test("composer prefill uses approved plan without auto submit", async () => {
  const { extension, vscode } = await createReadyExtension();
  const plan = generateImplementationPlan("vscode-extension", {
    extensionName: "Hello Levi",
    purpose: "Sample commands",
    capabilities: ["Commands", "Webviews"],
    targetVersion: "1.90+",
  });
  extension.productExperience.buildWizard = {
    step: WIZARD_STEPS.LAUNCH,
    templateId: "vscode-extension",
    answers: { extensionName: "Hello Levi", purpose: "Sample commands" },
    plan,
    approved: true,
  };
  const result = await extension.productExperience.launchComposerFromWizard();

  assert.equal(result.autoSubmit, false);
  assert.equal(extension.productExperience.buildView.viewType, "levi.build");
  assert.ok(vscode.__webviewMessages.some((message) => message.type === "productState"
    && message.state.pendingComposerPrompt
    && message.state.pendingComposerPrompt.includes("Build Plan")));
  assert.match(formatPlanForComposer(plan), /Security considerations/);
  await extension.deactivate();
});

test("cancel closes wizard and resets session", async () => {
  const { extension } = await createReadyExtension();
  await extension.productExperience.openBuildWizard({ connectionChecked: true });
  extension.productExperience.selectWizardTemplate("web-app");
  extension.productExperience.cancelBuildWizard();

  assert.equal(extension.productExperience.wizardPanel, null);
  assert.equal(extension.productExperience.buildWizard.templateId, null);
  await extension.deactivate();
});

test("back button returns to previous step", () => {
  const session = {
    step: WIZARD_STEPS.QUESTIONS,
    templateId: "web-app",
    answers: { projectName: "App" },
    plan: null,
    approved: false,
  };
  const controller = {
    buildWizard: { ...session },
    postWizardState() { return presentWizardState(this.buildWizard); },
    rewindWizardStep() {
      const step = Number(this.buildWizard.step);
      if (step === WIZARD_STEPS.QUESTIONS) this.buildWizard.step = WIZARD_STEPS.TEMPLATE;
      return this.postWizardState();
    },
  };
  const next = controller.rewindWizardStep();
  assert.equal(next.step, 1);
});

test("wizard does not mutate workspace files", async () => {
  const { extension, runtime, vscode } = await createReadyExtension();
  const before = new Map(vscode.__files);
  await extension.productExperience.openBuildWizard({ connectionChecked: true });
  extension.productExperience.selectWizardTemplate("landing-page");
  extension.productExperience.updateWizardAnswers({ businessName: "Acme", framework: "Next.js", styling: "Tailwind" });
  extension.productExperience.generateWizardPlan();
  extension.productExperience.approveWizardPlan();

  assert.equal(vscode.__files.get("file:/workspace/src/app.js").toString(), before.get("file:/workspace/src/app.js").toString());
  assert.ok(!runtime.calls.some((call) => /change\.|validation\./.test(String(call))));
  await extension.deactivate();
});

test("wizard does not execute workspace commands automatically", async () => {
  const { extension, runtime } = await createReadyExtension();
  await extension.productExperience.openBuildWizard({ connectionChecked: true });
  extension.productExperience.selectWizardTemplate("rest-api");
  extension.productExperience.updateWizardAnswers({
    projectName: "API",
    language: "TypeScript",
    framework: "Express",
    authentication: "JWT",
    database: "PostgreSQL",
  });
  extension.productExperience.generateWizardPlan();
  extension.productExperience.approveWizardPlan();

  assert.ok(!runtime.calls.includes("agent.sendMessage"));
  assert.ok(!runtime.calls.some((call) => String(call).startsWith("change.")));
  await extension.deactivate();
});

test("validates allowlisted wizard webview messages", () => {
  assert.equal(validateWizardMessage({ command: "selectTemplate", templateId: "web-app" }).valid, true);
  assert.equal(validateWizardMessage({ command: "launchComposer" }).valid, true);
  assert.equal(validateWizardMessage({ command: "workbench.action.openFolder" }).valid, false);
});

test("renders secure Build Wizard HTML with progress indicator", () => {
  const html = renderBuildWizardHtml(presentWizardState(createWizardSession()), { nonce: "abc777" });

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'nonce-abc777'/);
  assert.match(html, /Step 1 of 5/);
  assert.equal(html.includes("http://"), false);
});
