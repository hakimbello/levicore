const { serializeProductExperience } = require("./product-experience-serializer");

const CONSUMER_READINESS = Object.freeze({
  READY: "Ready",
  OPEN_PROJECT: "Open a project",
  OLLAMA_NOT_RUNNING: "Ollama is installed but not currently reachable",
  SELECT_MODEL: "Ollama found · Select a model",
  CHECKING: "Checking local AI...",
  PROJECT_ANALYSIS: "Project analysis required",
  ERROR: "Something went wrong",
});

const AI_CONNECTION = Object.freeze({
  CONNECTED: "Ready",
  NOT_CONNECTED: "Not connected",
  NEEDS_MODEL: "Select a model",
});

const PRIMARY_ACTIONS = Object.freeze({
  OPEN_PROJECT: "openProjectFolder",
  SETUP_OLLAMA: "testConnection",
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
  const primaryAction = resolvePrimaryAction(readiness, ollama, model, input);
  const aiCardStatus = resolveAiCardStatus(ollama, model);

  return serializeProductExperience({
    title: "Levi",
    tagline: "What do you want to build?",
    readiness: readiness.label,
    ready: readiness.label === CONSUMER_READINESS.READY,
    prompt: {
      value: input.pendingPrompt || "",
      placeholder: [
        "Build a website for my restaurant",
        "Create a budgeting web app",
        "Add authentication to this project",
        "Fix the errors in this codebase",
      ].join("\n"),
    },
    ai: {
      status: aiCardStatus,
      ollama: ollama.summary,
      ollamaConfigured: ollama.configured,
      ollamaReachable: ollama.reachable,
      readinessLine: ollama.readinessLine,
      endpoint: ollama.endpoint,
      modelInstalled: model.installed,
      modelSelected: model.selected,
      selectedModel: model.selectedName,
      availableModelCount: model.availableCount,
      showSelectModel: ollama.reachable && !model.usable,
      showRetry: ollama.failure === true,
      showSetupGuide: ollama.notFound === true,
    },
    project: {
      open: workspaceFolder.open,
      name: workspaceFolder.name || "No project open",
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
  if (input.ollamaReadiness) return normalizeOllamaReadiness(input.ollamaReadiness, input);
  const enabled = input.ollamaEnabled !== false;
  const provider = input.ollamaProvider || null;
  const state = String(provider && (provider.state || provider.status) || "").toUpperCase();
  const configured = enabled && Boolean(provider);
  const reachable = configured && REACHABLE_PROVIDER_STATES.has(state);
  const unreachable = configured && (UNREACHABLE_PROVIDER_STATES.has(state) || (!reachable && state === "CONFIGURED" && input.connectionChecked === true));
  let summary = "Ollama was not found";
  if (!enabled) summary = "Local Ollama is disabled";
  else if (reachable) summary = "Ollama found · Select a model";
  else if (unreachable) summary = "Ollama is installed but not currently reachable";
  else if (input.checkingConnection) summary = "Checking local AI...";
  return {
    enabled,
    configured,
    reachable,
    unreachable,
    failure: unreachable,
    notFound: enabled && !provider && input.connectionChecked === true,
    summary,
    readinessLine: summary,
    state,
    endpoint: input.ollamaEndpoint || "http://127.0.0.1:11434",
  };
}

function normalizeOllamaReadiness(readiness = {}, input = {}) {
  const enabled = input.ollamaEnabled !== false;
  const status = String(readiness.status || "").toUpperCase();
  const reachable = status === "READY" || status === "NEEDS_MODEL";
  const failure = status === "UNREACHABLE";
  const notFound = status === "NOT_FOUND";
  const selectedModel = readiness.selectedModelName || readiness.selectedModel || null;
  const line = status === "READY" && selectedModel
    ? `Ready · ${selectedModel}`
    : status === "NEEDS_MODEL"
      ? "Ollama found · Select a model"
      : failure
        ? "Ollama is installed but not currently reachable"
        : notFound
          ? "Ollama was not found"
          : "Checking local AI...";
  return {
    enabled,
    configured: enabled && !notFound,
    reachable,
    unreachable: failure,
    failure,
    notFound,
    summary: line,
    readinessLine: line,
    state: status,
    endpoint: readiness.endpoint || input.ollamaEndpoint || "http://127.0.0.1:11434",
  };
}

function assessModel(input, ollama) {
  const models = Array.isArray(input.models) ? input.models : [];
  const availableCount = models.length;
  const selected = input.selectedModel || null;
  const selectedId = selected && selected.id ? String(selected.id) : null;
  const selectedName = selected && selected.name ? String(selected.name) : null;
  const selectedMatches = selectedId
    ? models.some((model) => model.id === selectedId || model.name === selectedId || `ollama:${model.name}` === selectedId)
    : selectedName
      ? models.some((model) => model.name === selectedName)
      : false;
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
    return readiness(CONSUMER_READINESS.CHECKING, null);
  }
  if (ollama.enabled && (!ollama.reachable || ollama.unreachable)) {
    return readiness(ollama.readinessLine || CONSUMER_READINESS.OLLAMA_NOT_RUNNING, null);
  }
  if (!model.installed || !model.selected) {
    return readiness(CONSUMER_READINESS.SELECT_MODEL, null);
  }
  if (input.projectAnalysisRequired) {
    return readiness(CONSUMER_READINESS.PROJECT_ANALYSIS, null);
  }
  if (model.usable) {
    return readiness(CONSUMER_READINESS.READY, null);
  }
  return readiness(CONSUMER_READINESS.CHECKING, null);
}

function resolvePrimaryAction(readiness, ollama, model, input) {
  if (input.runtimeFailed) return action(PRIMARY_ACTIONS.START_BUILDING, "Build");
  if (ollama.enabled && !ollama.reachable) return action(PRIMARY_ACTIONS.SETUP_OLLAMA, "Retry");
  if (!model.installed || !model.selected) return action(PRIMARY_ACTIONS.SELECT_MODEL, "Select Model");
  if (input.projectAnalysisRequired) return action(PRIMARY_ACTIONS.ANALYZE_PROJECT, "Analyze Project");
  return action(PRIMARY_ACTIONS.START_BUILDING, "Build");
}

function resolveAiCardStatus(ollama, model) {
  if (!ollama.reachable) return AI_CONNECTION.NOT_CONNECTED;
  if (!model.installed || !model.selected) return AI_CONNECTION.NEEDS_MODEL;
  return AI_CONNECTION.CONNECTED;
}

function buildSecondaryActions(primaryId, workspaceFolder, ollama, model) {
  const actions = [];
  if (!workspaceFolder.open) actions.push({ id: "openProjectFolder", label: "Open Project" });
  if (model.installed && !model.selected) actions.push({ id: "selectModel", label: "Change Model" });
  if (ollama.failure) actions.push({ id: "testConnection", label: "Retry" });
  return actions.filter((entry) => entry.id !== primaryId);
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
