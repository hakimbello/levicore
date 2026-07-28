const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { LeviApplicationRuntime } = require("../src/runtime-loader").requireRuntime("levi-application-runtime.js");
const { createLeviExtension } = require("../src/levi-extension");
const { CONSUMER_READINESS, presentHomeState } = require("../src/product-experience/home-readiness");
const { renderHomeHtml } = require("../src/product-experience/home-view-provider");
const { renderCopilotHtml } = require("../src/product-experience/copilot-view-provider");
const { validateHomeMessage } = require("../src/product-experience/product-experience-serializer");
const { createFakeContext, createFakeVSCode } = require("./fake-vscode");

const baseConfig = {
  "levi.autoInitialize": true,
  "levi.autoAnalyzeWorkspace": false,
  "levi.experience.autoOpenOnFirstRun": true,
  "levi.experience.showBuildWizard": true,
  "levi.ui.showNotifications": false,
  "levi.models.enabled": true,
  "levi.models.defaultProvider": "ollama-local",
  "levi.models.defaultModel": "ollama:qwen2.5-coder:7b",
  "levi.ollama.enabled": true,
  "levi.ollama.defaultModel": "qwen2.5-coder:7b",
  "levi.openAICompatible.enabled": false,
  "levi.diagnostics.enabled": false,
};

test("first run opens prompt-first Levi Home and does not open raw onboarding JSON", async () => {
  const vscode = createFakeVSCode({ config: baseConfig });
  const extension = createLeviExtension({
    vscode,
    context: createFakeContext(),
    runtimeFactory: (options) => new LeviApplicationRuntime(options),
  });
  await extension.activate();

  assert.equal(vscode.__lastWebviewPanel && vscode.__lastWebviewPanel.viewType, "leviHome");
  assert.equal(vscode.__lastWebviewPanel.title, "Levi Home");
  assert.ok(vscode.__lastWebviewPanel.webview.html.indexOf("What do you want to build?") < vscode.__lastWebviewPanel.webview.html.indexOf("readinessLine"));
  assert.match(vscode.__lastWebviewPanel.webview.html, /<textarea id="buildPrompt"/);
  assert.match(vscode.__lastWebviewPanel.webview.html, />Build<\/button>/);
  assert.equal(Boolean(vscode.__lastDocument && vscode.__lastDocument.getText().includes('"steps"')), false);
  await extension.deactivate();
});

test("Home opens with visible prompt above status details and Build as primary action", () => {
  const html = renderHomeHtml(presentHomeState(readyInput()), { nonce: "home1" });

  assert.match(html, /id="buildPrompt"/);
  assert.ok(html.indexOf("buildPrompt") < html.indexOf("readinessLine"));
  assert.match(html, /button id="buildButton" class="primary"/);
  assert.match(html, /Build a website for my restaurant/);
  assert.match(html, /Create a budgeting web app/);
  assert.match(html, /Add authentication to this project/);
  assert.match(html, /Fix the errors in this codebase/);
});

test("Ctrl+Enter submits the Home build action", () => {
  const html = renderHomeHtml(presentHomeState(readyInput()), { nonce: "home2" });

  assert.match(html, /metaKey \|\| event\.ctrlKey/);
  assert.match(html, /event\.key === "Enter"/);
  assert.match(html, /send\("startBuilding"/);
});

test("typed prompt survives folder selection and no-folder choices are available", async () => {
  const runtime = createReadyRuntime();
  const vscode = createFakeVSCode({
    config: { ...baseConfig, "levi.experience.autoOpenOnFirstRun": false },
    workspaceFolders: [],
    nextMessageChoice: "Open Existing Project",
  });
  const extension = createLeviExtension({ vscode, context: createFakeContext(), runtimeFactory: () => runtime });
  await extension.activate();
  await extension.openHome({ connectionChecked: true });

  await extension.productExperience.handleHomeMessage({ command: "startBuilding", prompt: "Build me a simple business website." });

  assert.equal(extension.productExperience.pendingHomeBuildPrompt, "Build me a simple business website.");
  assert.deepEqual(vscode.__folderCommands.map((entry) => entry.id), ["workbench.action.openFolder"]);
  assert.match(vscode.__infoMessages[0], /Choose where Levi should build/);
  await extension.deactivate();
});

test("create-new-project folder choice is available when no folder is open", async () => {
  const runtime = createReadyRuntime();
  const vscode = createFakeVSCode({
    config: { ...baseConfig, "levi.experience.autoOpenOnFirstRun": false },
    workspaceFolders: [],
    nextMessageChoice: "Create New Project Folder",
  });
  const extension = createLeviExtension({ vscode, context: createFakeContext(), runtimeFactory: () => runtime });
  await extension.activate();

  await extension.productExperience.handleHomeMessage({ command: "startBuilding", prompt: "Create a budgeting web app" });

  assert.deepEqual(vscode.__folderCommands.map((entry) => entry.id), ["workbench.action.files.openFolder"]);
  assert.equal(extension.productExperience.pendingHomeBuildPrompt, "Create a budgeting web app");
  await extension.deactivate();
});

test("prompt routes into Build Wizard as project goal", async () => {
  const { extension } = await createReadyExtension();

  await extension.productExperience.handleHomeMessage({ command: "startBuilding", prompt: "Build a website for my restaurant" });

  assert.equal(extension.productExperience.wizardPanel.viewType, "leviBuildWizard");
  assert.equal(extension.productExperience.buildWizard.goal, "Build a website for my restaurant");
  assert.equal(extension.productExperience.buildWizard.templateId, "landing-page");
  assert.match(extension.productExperience.wizardPanel.webview.html, /Goal:/);
  await extension.deactivate();
});

test("sufficient existing-project prompt prefills Composer without auto-submit", async () => {
  const { extension, runtime, vscode } = await createReadyExtension();

  const result = await extension.productExperience.handleHomeMessage({ command: "startBuilding", prompt: "Fix the errors in this codebase" });

  assert.equal(result.autoSubmit, false);
  assert.equal(extension.productExperience.buildView.viewType, "levi.build");
  assert.ok(vscode.__webviewMessages.some((message) => message.type === "productState"
    && message.state.pendingComposerPrompt === "Fix the errors in this codebase"));
  assert.equal(runtime.calls.includes("agent.sendMessage"), false);
  await extension.deactivate();
});

test("successful model-health overrides stale unavailable provider state", () => {
  const state = presentHomeState({
    ...readyInput(),
    ollamaProvider: { id: "ollama-local", state: "UNAVAILABLE" },
    ollamaReadiness: { status: "READY", selectedModelName: "qwen2.5-coder:7b" },
  });

  assert.equal(state.ai.readinessLine, "Ready · qwen2.5-coder:7b");
  assert.equal(state.ai.ollamaReachable, true);
  assert.equal(state.ai.selectedModel, "qwen2.5-coder:7b");
});

test("qwen2.5-coder returned by health is shown as installed", () => {
  const state = presentHomeState(readyInput());

  assert.equal(state.ai.availableModelCount, 1);
  assert.equal(state.ai.selectedModel, "qwen2.5-coder:7b");
  assert.notEqual(state.ai.selectedModel, "None installed");
});

test("reachable Ollama never displays download guidance and failed health shows Retry", () => {
  const readyHtml = renderHomeHtml(presentHomeState(readyInput()), { nonce: "home3" });
  const failedHtml = renderHomeHtml(presentHomeState({
    ...readyInput(),
    models: [],
    selectedModel: null,
    ollamaReadiness: { status: "UNREACHABLE" },
  }), { nonce: "home4" });

  assert.doesNotMatch(readyHtml, /download Ollama|Install Ollama/i);
  assert.match(failedHtml, /id="retryConnection"/);
});

test("Home Retry does not open raw model-health JSON", async () => {
  const { extension, vscode } = await createReadyExtension();
  await extension.openHome({ connectionChecked: true });
  vscode.__lastDocument = null;

  await extension.productExperience.handleHomeMessage({ command: "testConnection" });

  assert.equal(vscode.__lastDocument, null);
  await extension.deactivate();
});

test("consumer sidebar contains only Home, Build, Projects, and Settings by default", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  const visible = manifest.contributes.views.levi.filter((view) => !view.when).map((view) => view.name);

  assert.deepEqual(visible, ["Home", "Build", "Projects", "Settings"]);
});

test("Developer Tools are hidden by default and appear when diagnostics are enabled", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  const developer = manifest.contributes.views.levi.find((view) => view.name === "Developer Tools");

  assert.equal(developer.when, "config.levi.diagnostics.enabled");
  assert.ok(manifest.contributes.views.levi.filter((view) => view.when === "config.levi.diagnostics.enabled").length > 5);
});

test("Composer prompt is immediate and timeline is hidden before a build begins", () => {
  const html = renderCopilotHtml({ mode: "Build", workspace: { name: "workspace" }, model: { selected: { name: "qwen2.5-coder:7b" } } }, { nonce: "composer1" });

  assert.match(html, /id="message"/);
  assert.match(html, /id="send"/);
  assert.match(html, /id="buildTimelineSection"[^>]*hidden/);
});

test("Home and timeline rendering do not mutate files or execute commands", async () => {
  const { extension, runtime, vscode } = await createReadyExtension();
  const before = new Map(vscode.__files);
  const callsBefore = runtime.calls.length;

  renderHomeHtml(presentHomeState(readyInput()), { nonce: "render1" });
  renderCopilotHtml({ buildTimeline: null }, { nonce: "render2" });

  assert.deepEqual(new Map(vscode.__files), before);
  assert.equal(runtime.calls.length, callsBefore);
  await extension.deactivate();
});

test("existing approvals remain enforced and no Home prompt is auto-submitted", async () => {
  const { extension } = await createReadyExtension();

  await extension.productExperience.handleHomeMessage({ command: "startBuilding", prompt: "Fix the errors in this codebase" });

  assert.equal(validateHomeMessage({ command: "approveChange" }).valid, false);
  assert.equal(extension.productExperience.buildTimeline, null);
  await extension.deactivate();
});

test("validates allowlisted Levi Home webview messages", () => {
  assert.equal(validateHomeMessage({ command: "startBuilding", prompt: "Build" }).valid, true);
  assert.equal(validateHomeMessage({ command: "openSettings" }).valid, true);
  assert.equal(validateHomeMessage({ command: "workbench.action.openFolder" }).valid, false);
});

test("renders secure Levi Home webview HTML", () => {
  const html = renderHomeHtml(presentHomeState({}, {}), { nonce: "abc999" });

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'nonce-abc999'/);
  assert.match(html, /What do you want to build/i);
  assert.match(html, /aria-label="Build"/);
});

function readyInput() {
  return {
    workspaceFolders: [{ name: "workspace", uri: { fsPath: "C:/workspace", path: "/workspace" } }],
    leviWorkspace: { id: "ws", name: "workspace", uri: "file:/workspace" },
    ollamaEnabled: true,
    ollamaEndpoint: "http://127.0.0.1:11434",
    ollamaProvider: { id: "ollama-local", state: "AVAILABLE" },
    ollamaReadiness: { status: "READY", selectedModelName: "qwen2.5-coder:7b" },
    models: [{ id: "ollama:qwen2.5-coder:7b", name: "qwen2.5-coder:7b", providerId: "ollama-local", local: true }],
    selectedModel: { id: "ollama:qwen2.5-coder:7b", name: "qwen2.5-coder:7b", providerId: "ollama-local", local: true },
    connectionChecked: true,
    runtimeReady: true,
  };
}

async function createReadyExtension() {
  const runtime = createReadyRuntime();
  const vscode = createFakeVSCode({
    config: { ...baseConfig, "levi.experience.autoOpenOnFirstRun": false },
    files: { "file:/workspace/src/app.js": "console.log('stay');\n" },
  });
  const extension = createLeviExtension({ vscode, context: createFakeContext(), runtimeFactory: () => runtime });
  await extension.activate();
  await extension.refreshHomeConnectionState({ connectionChecked: true });
  extension.presentationCache.selectedModel = { id: "ollama:qwen2.5-coder:7b", name: "qwen2.5-coder:7b", providerId: "ollama-local", local: true };
  return { extension, runtime, vscode };
}

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
            summary: { availableModels: 1, defaultModelId: "ollama:qwen2.5-coder:7b" },
            providers: [{ id: "ollama-local", state: "AVAILABLE" }],
            models: [{ id: "ollama:qwen2.5-coder:7b", name: "qwen2.5-coder:7b", providerId: "ollama-local", local: true }],
          },
        });
      }
      if (commandId === "model.models") {
        return Promise.resolve({
          success: true,
          data: { models: [{ id: "ollama:qwen2.5-coder:7b", name: "qwen2.5-coder:7b", providerId: "ollama-local", local: true }] },
        });
      }
      this.calls.push(commandId);
      return Promise.resolve({ success: true, data: {} });
    },
    listOperations: () => [],
    agentEngine: () => ({
      subscribe: () => "agent-sub",
      unsubscribe: () => {},
      sendMessage: () => Promise.resolve({ success: true }),
      cancelTurn: () => Promise.resolve({ success: true }),
      retryTurn: () => Promise.resolve({ success: true }),
      createConversation: () => ({ id: "conv-1" }),
    }),
    subscribe: () => "sub-1",
    unsubscribe: () => {},
    save: () => {},
    shutdown: () => Promise.resolve(),
  };
}
