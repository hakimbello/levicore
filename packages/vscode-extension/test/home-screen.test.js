const assert = require("node:assert/strict");
const test = require("node:test");

const { LeviApplicationRuntime } = require("../src/runtime-loader").requireRuntime("levi-application-runtime.js");
const { createLeviExtension } = require("../src/levi-extension");
const { CONSUMER_READINESS, presentHomeState } = require("../src/product-experience/home-readiness");
const { renderHomeHtml } = require("../src/product-experience/home-view-provider");
const { validateHomeMessage } = require("../src/product-experience/product-experience-serializer");
const { createFakeContext, createFakeVSCode } = require("./fake-vscode");

const baseConfig = {
  "levi.autoInitialize": true,
  "levi.autoAnalyzeWorkspace": false,
  "levi.experience.autoOpenOnFirstRun": true,
  "levi.ui.showNotifications": false,
  "levi.models.enabled": true,
  "levi.models.defaultProvider": "ollama-local",
  "levi.models.defaultModel": "ollama:qwen2.5-coder:7b",
  "levi.ollama.enabled": true,
  "levi.ollama.defaultModel": "qwen2.5-coder:7b",
  "levi.openAICompatible.enabled": false,
  "levi.diagnostics.enabled": false,
};

test("first run opens Levi Home and does not open raw onboarding JSON", async () => {
  const vscode = createFakeVSCode({ config: baseConfig });
  const extension = createLeviExtension({
    vscode,
    context: createFakeContext(),
    runtimeFactory: (options) => new LeviApplicationRuntime(options),
  });
  await extension.activate();

  assert.equal(vscode.__lastWebviewPanel && vscode.__lastWebviewPanel.viewType, "leviHome");
  assert.equal(vscode.__lastWebviewPanel.title, "Levi Home");
  assert.ok(vscode.__lastWebviewPanel.webview.html.includes("Build software with local AI."));
  assert.equal(Boolean(vscode.__lastDocument && vscode.__lastDocument.getText().includes('"steps"')), false);
  await extension.deactivate();
});

test("no workspace shows Open a project and Open Project Folder primary action", () => {
  const state = presentHomeState({
    workspaceFolders: [],
    ollamaEnabled: true,
    ollamaProvider: { id: "ollama-local", state: "AVAILABLE" },
    models: [{ id: "ollama:qwen2.5-coder:7b", name: "qwen2.5-coder:7b" }],
    selectedModel: { id: "ollama:qwen2.5-coder:7b", name: "qwen2.5-coder:7b" },
    connectionChecked: true,
    runtimeReady: true,
  });

  assert.equal(state.readiness, CONSUMER_READINESS.OPEN_PROJECT);
  assert.equal(state.primaryAction.id, "openProjectFolder");
  assert.equal(state.primaryAction.label, "Open Project Folder");
});

test("Ollama unreachable shows Ollama is not running", () => {
  const state = presentHomeState({
    workspaceFolders: [{ name: "workspace", uri: { fsPath: "C:/workspace", path: "/workspace" } }],
    ollamaEnabled: true,
    ollamaProvider: { id: "ollama-local", state: "UNAVAILABLE" },
    models: [],
    connectionChecked: true,
    runtimeReady: true,
  });

  assert.equal(state.readiness, CONSUMER_READINESS.OLLAMA_NOT_RUNNING);
  assert.equal(state.ai.status, "Not connected");
  assert.match(state.ai.ollama, /not running/i);
});

test("Ollama reachable but no model shows Select or install a model", () => {
  const state = presentHomeState({
    workspaceFolders: [{ name: "workspace", uri: { fsPath: "C:/workspace", path: "/workspace" } }],
    ollamaEnabled: true,
    ollamaProvider: { id: "ollama-local", state: "AVAILABLE" },
    models: [],
    selectedModel: null,
    connectionChecked: true,
    runtimeReady: true,
  });

  assert.equal(state.readiness, CONSUMER_READINESS.SELECT_MODEL);
  assert.equal(state.primaryAction.id, "selectModel");
});

test("workspace plus usable model shows Ready", () => {
  const state = presentHomeState({
    workspaceFolders: [{ name: "workspace", uri: { fsPath: "C:/workspace", path: "/workspace" } }],
    leviWorkspace: { id: "ws", name: "workspace", uri: "file:/workspace" },
    ollamaEnabled: true,
    ollamaProvider: { id: "ollama-local", state: "AVAILABLE" },
    models: [{ id: "ollama:qwen2.5-coder:7b", name: "qwen2.5-coder:7b" }],
    selectedModel: { id: "ollama:qwen2.5-coder:7b", name: "qwen2.5-coder:7b" },
    connectionChecked: true,
    runtimeReady: true,
  });

  assert.equal(state.readiness, CONSUMER_READINESS.READY);
  assert.equal(state.ready, true);
  assert.equal(state.primaryAction.id, "startBuilding");
});

test("project name and path are visible when a folder is open", () => {
  const html = renderHomeHtml(presentHomeState({
    workspaceFolders: [{ name: "my-app", uri: { fsPath: "C:/Users/dev/my-app", path: "/C:/Users/dev/my-app" } }],
    ollamaEnabled: true,
    ollamaProvider: { id: "ollama-local", state: "AVAILABLE" },
    models: [{ id: "ollama:qwen2.5-coder:7b", name: "qwen2.5-coder:7b" }],
    selectedModel: { id: "ollama:qwen2.5-coder:7b", name: "qwen2.5-coder:7b" },
    connectionChecked: true,
    runtimeReady: true,
  }), { nonce: "home123" });

  assert.match(html, /my-app/);
  assert.match(html, /C:\/Users\/dev\/my-app|C:\\Users\\dev\\my-app/);
});

test("consumer Home screen does not expose internal runtime states", () => {
  const html = renderHomeHtml(presentHomeState({
    workspaceFolders: [{ name: "workspace", uri: { fsPath: "C:/workspace", path: "/workspace" } }],
    ollamaEnabled: true,
    ollamaProvider: { id: "ollama-local", state: "DEGRADED" },
    models: [{ id: "ollama:qwen2.5-coder:7b", name: "qwen2.5-coder:7b" }],
    selectedModel: { id: "ollama:qwen2.5-coder:7b", name: "qwen2.5-coder:7b" },
    connectionChecked: true,
    runtimeReady: true,
    runtimeFailed: false,
  }), { nonce: "home456" });

  for (const forbidden of ["DEGRADED", "UNKNOWN", "CREATED", "PROPOSAL_ONLY", "Gateway AVAILABLE"]) {
    assert.equal(html.includes(forbidden), false, `Home HTML must not include ${forbidden}`);
  }
});

test("Start Building opens Build Wizard instead of composer directly", async () => {
  const runtime = createReadyRuntime();
  const vscode = createFakeVSCode({
    config: { ...baseConfig, "levi.experience.autoOpenOnFirstRun": false },
    files: { "file:/workspace/src/app.js": "console.log('stay');\n" },
  });
  const extension = createLeviExtension({
    vscode,
    context: createFakeContext(),
    runtimeFactory: () => runtime,
  });
  await extension.activate();
  await extension.refreshHomeConnectionState({ connectionChecked: true });
  extension.presentationCache.selectedModel = { id: "local:chat", name: "chat" };
  await extension.openHome({ connectionChecked: true });

  await extension.productExperience.startBuildingFromHome();

  assert.equal(extension.productExperience.wizardPanel.viewType, "leviBuildWizard");
  assert.equal(extension.productExperience.panel, null);
  await extension.deactivate();
});

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

test("developer diagnostics remain accessible when diagnostics are enabled", async () => {
  const vscode = createFakeVSCode({
    config: { ...baseConfig, "levi.diagnostics.enabled": true, "levi.experience.autoOpenOnFirstRun": false },
  });
  const extension = createLeviExtension({
    vscode,
    context: createFakeContext(),
    runtimeFactory: (options) => new LeviApplicationRuntime(options),
  });
  await extension.activate();
  await extension.showOnboardingDiagnostics();

  assert.ok(vscode.__lastDocument);
  assert.match(vscode.__lastDocument.getText(), /Levi Onboarding/);
  assert.match(vscode.__lastDocument.getText(), /"steps"/);
  await extension.deactivate();
});

test("validates allowlisted Levi Home webview messages", () => {
  assert.equal(validateHomeMessage({ command: "startBuilding" }).valid, true);
  assert.equal(validateHomeMessage({ command: "workbench.action.openFolder" }).valid, false);
});

test("renders secure Levi Home webview HTML", () => {
  const html = renderHomeHtml(presentHomeState({}, {}), { nonce: "abc999" });

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'nonce-abc999'/);
  assert.match(html, /Build Wizard guides you/i);
  assert.match(html, /aria-label="Open Levi composer"/);
  assert.equal(html.includes("http://"), false);
});

test("does not treat configured Ollama as connected before health check", () => {
  const state = presentHomeState({
    workspaceFolders: [{ name: "workspace", uri: { fsPath: "C:/workspace", path: "/workspace" } }],
    ollamaEnabled: true,
    ollamaProvider: { id: "ollama-local", state: "CONFIGURED" },
    models: [{ id: "ollama:qwen2.5-coder:7b", name: "qwen2.5-coder:7b" }],
    selectedModel: { id: "ollama:qwen2.5-coder:7b", name: "qwen2.5-coder:7b" },
    connectionChecked: true,
    runtimeReady: true,
  });

  assert.equal(state.ai.ollamaReachable, false);
  assert.equal(state.readiness, CONSUMER_READINESS.OLLAMA_NOT_RUNNING);
});
