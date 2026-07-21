const { EXPERIENCE_BOUNDS } = require("./product-experience-constants");
const { escapeHtml, serializeProductExperience } = require("./product-experience-serializer");

function renderHomeHtml(state = {}, options = {}) {
  const nonce = options.nonce || createNonce();
  const serialized = JSON.stringify(serializeProductExperience(state, { maximumSize: EXPERIENCE_BOUNDS.maximumSerializedStateBytes })).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    body { margin: 0; padding: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    main { max-width: 760px; margin: 0 auto; padding: 20px 16px 28px; display: grid; gap: 16px; }
    h1 { margin: 0; font-size: 28px; font-weight: 600; }
    .tagline { margin: 4px 0 0; color: var(--vscode-descriptionForeground); }
    .card { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 14px; background: var(--vscode-sideBar-background); }
    .card h2 { margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vscode-descriptionForeground); }
    .status-pill { display: inline-block; border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 600; border: 1px solid var(--vscode-panel-border); margin-bottom: 10px; }
    .status-ready { color: var(--vscode-testing-iconPassed); }
    .status-blocked { color: var(--vscode-errorForeground); }
    .status-pending { color: var(--vscode-descriptionForeground); }
    .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .detail { margin: 6px 0; font-size: 13px; }
    button { min-height: 28px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 2px; padding: 4px 10px; cursor: pointer; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button.primary { font-weight: 600; min-height: 32px; padding: 6px 14px; }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
    .template-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-top: 8px; }
    .template { text-align: left; }
    .template.selected { outline: 1px solid var(--vscode-focusBorder); }
    textarea { width: 100%; min-height: 88px; box-sizing: border-box; resize: vertical; padding: 8px; margin-top: 8px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); font-family: var(--vscode-font-family); }
    .composer-note { margin-top: 8px; font-size: 12px; color: var(--vscode-descriptionForeground); }
    .blocked { border-left: 3px solid var(--vscode-inputValidation-warningBorder); padding-left: 10px; margin-top: 8px; color: var(--vscode-descriptionForeground); font-size: 12px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
    @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1 id="title">Levi</h1>
      <p id="tagline" class="tagline">Build software with local AI.</p>
    </header>

    <section class="card" aria-labelledby="readinessLabel">
      <h2 id="readinessLabel">Levi status</h2>
      <div id="readinessPill" class="status-pill status-pending" aria-live="polite"></div>
      <div id="startBlocked" class="blocked" hidden></div>
    </section>

    <section class="card" aria-labelledby="aiLabel">
      <h2 id="aiLabel">AI status</h2>
      <div id="aiStatus" class="detail"></div>
      <div id="ollamaStatus" class="detail meta"></div>
      <div id="selectedModel" class="detail"></div>
      <div id="modelCount" class="detail meta"></div>
      <div class="row" style="margin-top: 10px;">
        <button id="testConnection" class="secondary" aria-label="Test AI connection">Test Connection</button>
        <button id="selectModel" class="secondary" aria-label="Select AI model" hidden>Select Model</button>
        <button id="openSetupGuide" class="secondary" aria-label="Open Levi setup guide" hidden>Open Setup Guide</button>
      </div>
    </section>

    <section class="card" aria-labelledby="projectLabel">
      <h2 id="projectLabel">Project</h2>
      <div id="projectName" class="detail"></div>
      <div id="projectPath" class="detail meta"></div>
      <div id="projectEmpty" class="detail meta" hidden></div>
      <div class="row" style="margin-top: 10px;">
        <button id="openProjectFolder" class="secondary" aria-label="Open project folder">Open Project Folder</button>
        <button id="analyzeProject" class="secondary" aria-label="Analyze project" hidden>Analyze Project</button>
      </div>
    </section>

    <section class="card" aria-labelledby="buildLabel">
      <h2 id="buildLabel">Start building with Levi</h2>
      <p class="meta">The Build Wizard guides you through planning before Levi writes any code.</p>
      <div class="row" style="margin-top: 10px;">
        <button id="primaryAction" class="primary" aria-label="Primary next action"></button>
        <button id="openComposer" class="secondary" aria-label="Open Levi composer">Open Levi Composer</button>
      </div>
      <div id="composerNote" class="composer-note">Use the Build Wizard for a guided plan, or open the composer directly.</div>
    </section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = ${serialized};
    const byId = (id) => document.getElementById(id);
    function send(command, extra) { vscode.postMessage(Object.assign({ command }, extra || {})); }
    function text(value) { return value === undefined || value === null ? "" : String(value); }
    function setText(id, value) { byId(id).textContent = text(value); }
    function setVisible(id, visible) { byId(id).hidden = !visible; }
    function statusClass(label) {
      if (label === "Ready") return "status-ready";
      if (label === "Checking AI connection") return "status-pending";
      return "status-blocked";
    }
    function render(next) {
      state = next || state || {};
      setText("title", state.title || "Levi");
      setText("tagline", state.tagline || "Build software with local AI.");
      const readiness = state.readiness || "Checking AI connection";
      const pill = byId("readinessPill");
      pill.textContent = readiness;
      pill.className = "status-pill " + statusClass(readiness);
      const blocked = text(state.startBlockedReason);
      setVisible("startBlocked", Boolean(blocked));
      setText("startBlocked", blocked);
      setText("aiStatus", "Connection: " + text(state.ai && state.ai.status));
      setText("ollamaStatus", "Ollama: " + text(state.ai && state.ai.ollama));
      setText("selectedModel", "Selected model: " + text(state.ai && state.ai.selectedModel));
      setText("modelCount", "Available models: " + text(state.ai && state.ai.availableModelCount));
      setVisible("selectModel", Boolean(state.ai && state.ai.showSelectModel && state.ai.ollamaReachable));
      setVisible("openSetupGuide", Boolean(state.ai && state.ai.showSetupGuide));
      const project = state.project || {};
      if (project.open) {
        setVisible("projectEmpty", false);
        setText("projectName", project.name || "Project folder");
        setText("projectPath", project.path || "");
        setVisible("analyzeProject", Boolean(project.canAnalyze));
      } else {
        setText("projectName", "");
        setText("projectPath", "");
        setVisible("projectEmpty", true);
        setText("projectEmpty", project.emptyMessage || "No project folder open");
        setVisible("analyzeProject", false);
      }
      const primary = state.primaryAction || {};
      byId("primaryAction").textContent = primary.label || "Start Building";
      byId("primaryAction").dataset.action = primary.id || "startBuilding";
      byId("primaryAction").disabled = primary.id === "startBuilding" && !state.ready;
      setText("composerNote", state.ready
        ? "The Build Wizard creates a plan before any code is written."
        : "Complete the steps above before Levi can start building.");
    }
    byId("testConnection").addEventListener("click", () => send("testConnection"));
    byId("selectModel").addEventListener("click", () => send("selectModel"));
    byId("openSetupGuide").addEventListener("click", () => send("openSetupGuide"));
    byId("openProjectFolder").addEventListener("click", () => send("openProjectFolder"));
    byId("analyzeProject").addEventListener("click", () => send("analyzeProject"));
    byId("openComposer").addEventListener("click", () => send("openComposer"));
    byId("primaryAction").addEventListener("click", (event) => {
      const action = event.currentTarget.dataset.action || "startBuilding";
      if (action === "startBuilding") send("startBuilding");
      else send(action);
    });
    window.addEventListener("message", (event) => { if (event.data && event.data.type === "homeState") render(event.data.state); });
    render(state);
  </script>
</body>
</html>`;
}

function createNonce() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";
  for (let index = 0; index < 32; index += 1) value += alphabet[Math.floor(Math.random() * alphabet.length)];
  return value;
}

module.exports = {
  createNonce,
  renderHomeHtml,
};
