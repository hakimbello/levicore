const { serializeProductExperience } = require("./product-experience-serializer");

const CONSUMER_READINESS = Object.freeze({
  READY: "Ready",
  OPEN_PROJECT: "Open a project",
  OLLAMA_NOT_RUNNING: "Ollama is not running",
  SELECT_MODEL: "Select or install a model",
  CHECKING: "Checking AI connection",
  PROJECT_ANALYSIS: "Project analysis required",
  ERROR: "Something went wrong",
});

const AI_CONNECTION = Object.freeze({
  CONNECTED: "Connected",
  NOT_CONNECTED: "Not connected",
  NEEDS_MODEL: "Needs model",
});

const PRIMARY_ACTIONS = Object.freeze({
  OPEN_PROJECT: "openProjectFolder",
  SETUP_OLLAMA: "setupOllama",
  SELECT_MODEL: "selectModel",
  START_BUILDING: "startBuilding",
  ANALYZE_PROJECT: "analyzeProject",
});

const BUILD_TEMPLATES = Object.freeze([
  { id: "landing-page", label: "Landing Page" },
  { id: "web-app", label: "Web App" },
  { id: "api", label: "API" },
  { id: "vscode-extension", label: "VS Code Extension" },
  { id: "existing-project", label: "Existing Project" },
]);

const UNREACHABLE_PROVIDER_STATES = new Set([
  "FAILED",
  "UNAVAILABLE",
  "AUTHENTICATION_FAILED",
]);

const REACHABLE_PROVIDER_STATES = new Set([
  "AVAILABLE",
  "DEGRADED",
]);

function presentHomeState(input = {}, options = {}) {
  const workspaceFolder = resolveWorkspaceFolder(input);
  const ollama = assessOllama(input);
  const model = assessModel(input, ollama);
  const readiness = resolveReadiness(input, workspaceFolder, ollama, model);
  const primaryAction = resolvePrimaryAction(readiness, workspaceFolder, ollama, model, input);
  const aiCardStatus = resolveAiCardStatus(ollama, model);

  return serializeProductExperience({
    title: "Levi",
    tagline: "Build software with local AI.",
    readiness: readiness.label,
    ready: readiness.label === CONSUMER_READINESS.READY,
    ai: {
      status: aiCardStatus,
      ollama: ollama.summary,
      ollamaConfigured: ollama.configured,
      ollamaReachable: ollama.reachable,
      modelInstalled: model.installed,
      modelSelected: model.selected,
      selectedModel: model.selectedName,
      availableModelCount: model.availableCount,
      showSelectModel: !model.usable,
      showSetupGuide: !ollama.reachable || !model.installed,
    },
    project: {
      open: workspaceFolder.open,
      name: workspaceFolder.name,
      path: workspaceFolder.path,
      emptyMessage: workspaceFolder.open ? null : "No project folder open",
      canAnalyze: workspaceFolder.open && Boolean(input.runtimeReady),
    },
    primaryAction: {
      id: primaryAction.id,
      label: primaryAction.label,
    },
    secondaryActions: buildSecondaryActions(primaryAction.id, workspaceFolder, ollama, model),
    buildTemplates: BUILD_TEMPLATES.map((entry) => ({ id: entry.id, label: entry.label })),
    composerLabel: "Levi",
    promptPlaceholder: "Describe what you want to build",
    startBlockedReason: readiness.startBlockedReason || null,
    diagnosticsEnabled: options.diagnosticsEnabled === true,
  });
}

function resolveWorkspaceFolder(input) {
  const folders = Array.isArray(input.workspaceFolders) ? input.workspaceFolders : [];
  const folder = folders[0] || null;
  const leviWorkspace = input.leviWorkspace || {};
  const open = folders.length > 0 || Boolean(leviWorkspace.id);
  const name = folder && folder.name
    ? folder.name
    : leviWorkspace.name && leviWorkspace.name !== "No workspace"
      ? leviWorkspace.name
      : null;
  const path = folder && folder.uri
    ? String(folder.uri.fsPath || folder.uri.path || folder.uri)
    : leviWorkspace.root && leviWorkspace.root !== "Unavailable"
      ? String(leviWorkspace.root)
      : leviWorkspace.uri
        ? String(leviWorkspace.uri)
        : null;
  return { open, name, path };
}

function assessOllama(input) {
  const enabled = input.ollamaEnabled !== false;
  const provider = input.ollamaProvider || null;
  const state = String(provider && provider.state || "").toUpperCase();
  const configured = enabled && Boolean(provider);
  const reachable = configured && REACHABLE_PROVIDER_STATES.has(state);
  const unreachable = configured && (UNREACHABLE_PROVIDER_STATES.has(state) || (!reachable && state === "CONFIGURED" && input.connectionChecked === true));
  let summary = "Ollama is not configured";
  if (!enabled) summary = "Local Ollama is disabled in settings";
  else if (!provider) summary = "Ollama provider is not registered";
  else if (reachable) summary = "Ollama is running";
  else if (UNREACHABLE_PROVIDER_STATES.has(state)) summary = "Ollama is not running";
  else if (state === "CONFIGURED") summary = input.connectionChecked ? "Ollama is configured but not reachable" : "Checking Ollama connection";
  else if (input.checkingConnection) summary = "Checking Ollama connection";
  else summary = "Ollama status is unknown";
  return { enabled, configured, reachable, unreachable, summary, state };
}

function assessModel(input, ollama) {
  const models = Array.isArray(input.models) ? input.models : [];
  const availableCount = models.length;
  const selected = input.selectedModel || null;
  const selectedId = selected && selected.id ? String(selected.id) : null;
  const selectedMatches = selectedId ? models.some((model) => model.id === selectedId) : false;
  const installed = availableCount > 0;
  const selectedUsable = Boolean(selectedMatches && selected);
  const usable = ollama.reachable && installed && selectedUsable;
  return {
    installed,
    selected: selectedUsable,
    usable,
    availableCount,
    selectedName: selectedUsable ? (selected.name || selected.id) : (installed ? "Not selected" : "None installed"),
  };
}

function resolveReadiness(input, workspaceFolder, ollama, model) {
  if (input.runtimeFailed) {
    return readiness(CONSUMER_READINESS.ERROR, "Levi could not finish starting. Check the output log and try again.");
  }
  if (input.checkingConnection && !input.connectionChecked) {
    return readiness(CONSUMER_READINESS.CHECKING, "Levi is checking your local AI connection.");
  }
  if (!workspaceFolder.open) {
    return readiness(CONSUMER_READINESS.OPEN_PROJECT, "Open a project folder so Levi knows what to build.");
  }
  if (ollama.enabled && (!ollama.reachable || ollama.unreachable)) {
    return readiness(CONSUMER_READINESS.OLLAMA_NOT_RUNNING, "Start Ollama and make sure it is reachable on your machine.");
  }
  if (!model.installed || !model.selected) {
    return readiness(CONSUMER_READINESS.SELECT_MODEL, "Install a local model in Ollama, then select it in Levi.");
  }
  if (input.projectAnalysisRequired) {
    return readiness(CONSUMER_READINESS.PROJECT_ANALYSIS, "Analyze this project so Levi can understand the codebase.");
  }
  if (model.usable && workspaceFolder.open) {
    return readiness(CONSUMER_READINESS.READY, null);
  }
  return readiness(CONSUMER_READINESS.ERROR, "Levi is not ready yet. Review the AI and project sections above.");
}

function resolvePrimaryAction(readiness, workspaceFolder, ollama, model, input) {
  if (!workspaceFolder.open) return action(PRIMARY_ACTIONS.OPEN_PROJECT, "Open Project Folder");
  if (ollama.enabled && !ollama.reachable) return action(PRIMARY_ACTIONS.SETUP_OLLAMA, "Set Up Ollama");
  if (!model.installed || !model.selected) return action(PRIMARY_ACTIONS.SELECT_MODEL, "Install or Select Model");
  if (input.projectAnalysisRequired) return action(PRIMARY_ACTIONS.ANALYZE_PROJECT, "Analyze Project");
  return action(PRIMARY_ACTIONS.START_BUILDING, "Start Building");
}

function resolveAiCardStatus(ollama, model) {
  if (!ollama.reachable) return AI_CONNECTION.NOT_CONNECTED;
  if (!model.installed || !model.selected) return AI_CONNECTION.NEEDS_MODEL;
  return AI_CONNECTION.CONNECTED;
}

function buildSecondaryActions(primaryId, workspaceFolder, ollama, model) {
  const actions = [];
  if (primaryId !== PRIMARY_ACTIONS.OPEN_PROJECT) actions.push({ id: "openProjectFolder", label: "Open Project Folder" });
  if (workspaceFolder.open && primaryId !== PRIMARY_ACTIONS.ANALYZE_PROJECT) actions.push({ id: "analyzeProject", label: "Analyze Project" });
  actions.push({ id: "testConnection", label: "Test Connection" });
  if (!model.usable) actions.push({ id: ollama.reachable ? "selectModel" : "openSetupGuide", label: ollama.reachable ? "Select Model" : "Open Setup Guide" });
  return actions;
}

function readiness(label, startBlockedReason) {
  return { label, startBlockedReason };
}

function action(id, label) {
  return { id, label };
}

function buildTemplatePrompt(templateId, userPrompt) {
  const prompt = String(userPrompt || "").trim();
  const templates = {
    "landing-page": "Build a landing page",
    "web-app": "Build a web app",
    api: "Build an API",
    "vscode-extension": "Build a VS Code extension",
    "existing-project": "Improve this existing project",
  };
  const prefix = templates[templateId] || "Build software";
  return prompt ? `${prefix}: ${prompt}` : prefix;
}

module.exports = {
  AI_CONNECTION,
  BUILD_TEMPLATES,
  CONSUMER_READINESS,
  PRIMARY_ACTIONS,
  buildTemplatePrompt,
  presentHomeState,
};
