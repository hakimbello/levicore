const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { LeviApplicationRuntime } = require("../src/runtime-loader").requireRuntime("levi-application-runtime.js");
const { createLeviExtension } = require("../src/levi-extension");
const { consumerCommandTitles, DEVELOPER_COMMAND_WHEN } = require("../src/command-metadata");
const {
  LEVI_ACTIVITY_CONTAINER_ID,
  LEVI_BUILD_FOCUS_COMMAND_ID,
  LEVI_BUILD_VIEW_ID,
  LEVI_OPEN_CONTAINER_COMMAND_ID,
} = require("../src/product-experience/product-experience-constants");
const { createFakeContext, createFakeVSCode } = require("./fake-vscode");

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

test("consumer Command Palette contains only approved Levi commands", () => {
  assert.deepEqual(visibleCommandTitles({ diagnosticsEnabled: false }).sort(), consumerCommandTitles().sort());
});

test("internal commands are hidden by default and visible when diagnostics are enabled", () => {
  const consumer = visibleCommandIds({ diagnosticsEnabled: false });
  const developer = visibleCommandIds({ diagnosticsEnabled: true });

  for (const internal of [
    "levi.showRisks",
    "levi.showOperations",
    "levi.showPerformance",
    "levi.showAgentContext",
    "levi.retryWorkflow",
    "levi.restoreWorkflowCheckpoint",
    "levi.reconcileAgentResults",
    "levi.createWorkflowCheckpoint",
    "levi.showSourceControlDiff",
  ]) {
    assert.equal(consumer.includes(internal), false, `${internal} should be hidden in consumer mode`);
    assert.equal(developer.includes(internal), true, `${internal} should be visible with diagnostics enabled`);
  }
});

test("visible Levi commands have clean labels without duplicate prefixes or raw IDs", () => {
  for (const diagnosticsEnabled of [false, true]) {
    for (const title of visibleCommandTitles({ diagnosticsEnabled })) {
      assert.equal(title.startsWith("Levi: Levi:"), false, `${title} must not duplicate the Levi prefix`);
      assert.equal(/levi\.[a-z]/i.test(title), false, `${title} must not expose a raw command ID`);
    }
  }
});

test("Open Home and Open Build Chat appear exactly once", () => {
  const titles = visibleCommandTitles({ diagnosticsEnabled: false });

  assert.equal(titles.filter((title) => title === "Levi: Open Home").length, 1);
  assert.equal(titles.filter((title) => title === "Levi: Open Build Chat").length, 1);
});

test("default sidebar contains only Home Build Projects Settings", () => {
  const visible = manifest.contributes.views.levi.filter((view) => !view.when).map((view) => view.name);

  assert.deepEqual(visible, ["Home", "Build", "Projects", "Settings"]);
  assert.equal(manifest.contributes.views.levi.find((view) => view.id === LEVI_BUILD_VIEW_ID).type, "webview");
});

test("Levi activity-bar container owns the Build view", () => {
  const activityContainers = manifest.contributes.viewsContainers.activitybar || [];
  const leviContainer = activityContainers.find((container) => container.id === LEVI_ACTIVITY_CONTAINER_ID);

  assert.ok(leviContainer);
  assert.equal(leviContainer.title, "Levi");
  assert.equal(manifest.contributes.views[LEVI_ACTIVITY_CONTAINER_ID].some((view) => view.id === LEVI_BUILD_VIEW_ID), true);
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.contributes.views, "workbench.panel.chat"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(manifest.contributes.views, "chat"), false);
});

test("internal sidebar trees are hidden by default and Developer Tools are diagnostics gated", () => {
  const views = manifest.contributes.views.levi;
  const byName = new Map(views.map((view) => [view.name, view]));
  const hiddenNames = ["Environment", "Operations", "Approvals", "AI Models", "Change Review", "Project Rules", "Performance"];

  for (const name of hiddenNames) assert.equal(byName.get(name).when, DEVELOPER_COMMAND_WHEN);
  assert.equal(byName.get("Developer Tools").when, DEVELOPER_COMMAND_WHEN);
  assert.equal(views.some((view) => !view.when && /Runtime|Health|Risks|Technical Debt|Operations|Approvals|Performance|Source Control/i.test(view.name)), false);
});

test("Levi activity command focuses Home", async () => {
  const { extension, vscode } = await createReadyExtension();

  await vscode.commands.executeCommand("levi.openDashboard");

  assert.equal(vscode.__dashboardOpened, true);
  assert.equal(vscode.__lastWebviewPanel.viewType, "leviHome");
  assert.match(vscode.__lastWebviewPanel.webview.html, /id="buildPrompt"/);
  await extension.deactivate();
});

test("Build Chat is reachable from command and Home Build without auto-submit", async () => {
  const { extension, runtime, vscode } = await createReadyExtension();

  const opened = await vscode.commands.executeCommand("levi.openBuildChat");
  const commandView = extension.productExperience.buildView;
  const callsBefore = runtime.calls.filter((call) => call === "agent.sendMessage").length;
  await vscode.commands.executeCommand("levi.focusComposer");
  await extension.productExperience.handleHomeMessage({ command: "startBuilding", prompt: "Fix the errors in this codebase" });

  assert.equal(opened.viewType, LEVI_BUILD_VIEW_ID);
  assert.equal(vscode.__lastWebviewView.viewType, LEVI_BUILD_VIEW_ID);
  assert.equal(extension.productExperience.buildView, commandView);
  assert.equal(extension.productExperience.buildView.viewType, LEVI_BUILD_VIEW_ID);
  assert.match(extension.productExperience.buildView.webview.html, /id="message"/);
  assert.equal(runtime.calls.filter((call) => call === "agent.sendMessage").length, callsBefore);
});

test("Build view is a Levi-owned WebviewViewProvider", async () => {
  const { extension, vscode } = await createReadyExtension();
  const registration = vscode.__webviewViewProviders.get(LEVI_BUILD_VIEW_ID);

  assert.ok(registration);
  assert.equal(registration.provider, extension.productExperience);
  assert.equal(registration.provider.constructor.name, "ProductExperienceController");
  assert.equal(vscode.__treeProviders.has(LEVI_BUILD_VIEW_ID), false);
  await extension.deactivate();
});

test("Open Build Chat and focusComposer resolve to the same Levi Build view", async () => {
  const { extension, vscode } = await createReadyExtension();

  const opened = await vscode.commands.executeCommand("levi.openBuildChat");
  const focused = await vscode.commands.executeCommand("levi.focusComposer");

  assert.equal(opened, focused);
  assert.equal(opened.viewType, LEVI_BUILD_VIEW_ID);
  assert.equal(extension.productExperience.buildView, opened);
  assert.deepEqual(
    vscode.__executedCommands.filter((entry) => entry.id === LEVI_OPEN_CONTAINER_COMMAND_ID || entry.id === LEVI_BUILD_FOCUS_COMMAND_ID).map((entry) => entry.id),
    [LEVI_OPEN_CONTAINER_COMMAND_ID, LEVI_BUILD_FOCUS_COMMAND_ID, LEVI_OPEN_CONTAINER_COMMAND_ID, LEVI_BUILD_FOCUS_COMMAND_ID],
  );
  await extension.deactivate();
});

test("Levi consumer Build commands never execute a VS Code native Chat command", async () => {
  const { extension, vscode } = await createReadyExtension();

  await vscode.commands.executeCommand("levi.openBuildChat");
  await vscode.commands.executeCommand("levi.focusComposer");

  const nestedCommands = vscode.__executedCommands
    .map((entry) => entry.id)
    .filter((id) => !["levi.openBuildChat", "levi.focusComposer"].includes(id));
  assert.equal(nestedCommands.some((id) => /chat/i.test(id)), false);
  assert.equal(vscode.__nativeChatInvoked, false);
  assert.ok(vscode.__outputLines.some((line) => line.includes("native Chat invoked: false")));
  await extension.deactivate();
});

test("Levi does not contribute views to native Chat, chat participants, or Sessions panels", () => {
  const contributions = manifest.contributes || {};
  const allViews = Object.values(contributions.views || {}).flat();
  const serialized = JSON.stringify({
    viewsContainers: contributions.viewsContainers || {},
    views: contributions.views || {},
    menus: contributions.menus || {},
  });

  assert.equal(Object.prototype.hasOwnProperty.call(contributions, "chatParticipants"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(contributions, "chatParticipant"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(contributions.views || {}, "chat"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(contributions.views || {}, "workbench.panel.chat"), false);
  assert.equal(allViews.some((view) => /sessions/i.test(view.id || view.name || "")), false);
  assert.doesNotMatch(serialized, /workbench\.panel\.chat|workbench\.action\.chat\.open|chat\.focus|chat\.open/i);
});

test("Build webview Send calls Levi runtime and renders Ollama response", async () => {
  const { extension, runtime, vscode } = await createReadyExtension();

  const view = await vscode.commands.executeCommand("levi.openBuildChat");
  const callsBefore = runtime.calls.filter((call) => call === "agent.sendMessage").length;
  await view.webview.__receive({ command: "submit", content: "Explain what files are in this project.", mode: "Ask", scope: "Workspace" });

  assert.equal(runtime.calls.filter((call) => call === "agent.sendMessage").length, callsBefore + 1);
  assert.equal(runtime.lastAgentMessage.message.content, "Explain what files are in this project.");
  assert.equal(runtime.lastAgentMessage.options.stream, true);
  assert.equal(extension.presentationCache.agent.lastResponse.content, "Ollama qwen2.5-coder:7b response inside Levi.");
  assert.ok(vscode.__webviewMessages.some((message) => message.type === "productState"
    && message.state
    && message.state.agent
    && message.state.agent.lastResponse
    && message.state.agent.lastResponse.content === "Ollama qwen2.5-coder:7b response inside Levi."));
  await extension.deactivate();
});

test("Build Chat and Home do not open raw model-health JSON", async () => {
  const { extension, vscode } = await createReadyExtension();
  await vscode.commands.executeCommand("levi.openBuildChat");
  vscode.__lastDocument = null;

  await extension.productExperience.handleHomeMessage({ command: "testConnection" });

  assert.equal(vscode.__lastDocument, null);
  await extension.deactivate();
});

test("consumer path has no native Chat or sign-in routing", () => {
  const sourceRoot = path.join(__dirname, "..", "src");
  const files = listJavaScriptFiles(sourceRoot);
  const forbidden = [
    /vscode\.chat/,
    /vscode\.lm/,
    /createChatParticipant/,
    /selectChatModels/,
    /languageModels/,
    /workbench\.action\.chat\.open/,
    /authentication\.getSession/,
    /getSession\([^)]*github/i,
    /getSession\([^)]*microsoft/i,
  ];

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(text, pattern, `${path.relative(sourceRoot, file)} must not use ${pattern}`);
    }
  }
});

function visibleCommandTitles(options) {
  const commandById = new Map(manifest.contributes.commands.map((command) => [command.command, command]));
  return visibleCommandIds(options).map((id) => {
    const command = commandById.get(id);
    return `${command.category}: ${command.title}`;
  });
}

function visibleCommandIds({ diagnosticsEnabled }) {
  const palette = manifest.contributes.menus.commandPalette || [];
  return palette
    .filter((entry) => {
      if (!entry.when) return true;
      if (entry.when === "false") return false;
      if (entry.when === DEVELOPER_COMMAND_WHEN) return diagnosticsEnabled === true;
      return false;
    })
    .map((entry) => entry.command);
}

function listJavaScriptFiles(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(absolute);
    return entry.name.endsWith(".js") ? [absolute] : [];
  });
}

async function createReadyExtension() {
  const runtime = createReadyRuntime();
  const vscode = createFakeVSCode({
    config: {
      "levi.autoInitialize": true,
      "levi.autoAnalyzeWorkspace": false,
      "levi.experience.autoOpenOnFirstRun": false,
      "levi.ui.showNotifications": false,
      "levi.models.enabled": true,
      "levi.models.defaultProvider": "ollama-local",
      "levi.models.defaultModel": "ollama:qwen2.5-coder:7b",
      "levi.ollama.enabled": true,
      "levi.ollama.defaultModel": "qwen2.5-coder:7b",
      "levi.openAICompatible.enabled": false,
      "levi.diagnostics.enabled": false,
    },
  });
  const extension = createLeviExtension({ vscode, context: createFakeContext(), runtimeFactory: () => runtime });
  await extension.activate();
  await extension.refreshHomeConnectionState({ connectionChecked: true });
  return { extension, runtime, vscode };
}

function createReadyRuntime() {
  const agentState = { conversations: [], turns: [] };
  return {
    calls: [],
    workspace: null,
    initialize: () => Promise.resolve({ success: true, status: "SUCCEEDED", data: { state: "READY" } }),
    getState: () => ({ state: "READY" }),
    getRuntimeHealth: () => ({ runtimeState: "READY", overallRuntimeHealth: 100, blockers: [], warnings: [] }),
    openWorkspace(input) {
      this.calls.push("openWorkspace");
      this.workspace = { id: "workspace-1", name: input && input.name || "workspace", projectId: "project-1", state: "READY", uri: "file:/workspace" };
      return Promise.resolve({ success: true, data: this.workspace });
    },
    getWorkspace() {
      return this.workspace;
    },
    executeCommand(commandId, input) {
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
      if (commandId === "agent.createConversation") {
        const conversation = { id: "conv-1", title: "Explain what files are in this project.", objective: "Explain what files are in this project.", workspaceId: "workspace-1", projectId: "project-1", state: "ACTIVE", turns: [], activeTurnId: null };
        agentState.conversations = [conversation];
        this.conversation = conversation;
        return Promise.resolve({ success: true, data: conversation });
      }
      if (commandId === "agent.sendMessage") {
        this.lastAgentMessage = input;
        const turn = {
          id: "turn-1",
          conversationId: "conv-1",
          state: "COMPLETED",
          assistantResponse: { content: "Ollama qwen2.5-coder:7b response inside Levi.", modelId: "ollama:qwen2.5-coder:7b", providerId: "ollama-local" },
          contextPackageIds: [],
        };
        agentState.turns = [turn];
        agentState.conversations[0].activeTurnId = turn.id;
        agentState.conversations[0].turns = [turn.id];
        return Promise.resolve({
          success: true,
          data: {
            response: turn.assistantResponse,
          },
        });
      }
      return Promise.resolve({ success: true, data: {} });
    },
    listOperations: () => [],
    agentEngine: () => ({
      getHealth: () => ({ agentState: "READY", overallAgentHealth: 100, privacyIntegrity: "ENFORCED" }),
      listConversations: () => agentState.conversations,
      listTurns: (conversationId) => agentState.turns.filter((turn) => turn.conversationId === conversationId),
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
