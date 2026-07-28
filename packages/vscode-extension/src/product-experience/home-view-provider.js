const { EXPERIENCE_BOUNDS } = require("./product-experience-constants");
const { serializeProductExperience } = require("./product-experience-serializer");

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
    main { max-width: 820px; margin: 0 auto; padding: 24px 18px 32px; display: grid; gap: 14px; }
    h1 { margin: 0; font-size: 32px; font-weight: 650; letter-spacing: 0; }
    h2 { margin: 2px 0 0; font-size: 20px; font-weight: 600; letter-spacing: 0; }
    .prompt-shell { display: grid; gap: 12px; }
    textarea { width: 100%; min-height: 180px; box-sizing: border-box; resize: vertical; padding: 12px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); font-family: var(--vscode-font-family); font-size: 14px; line-height: 1.5; }
    textarea:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 0; }
    .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .top-actions { justify-content: space-between; }
    button { min-height: 30px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 2px; padding: 5px 11px; cursor: pointer; font-family: var(--vscode-font-family); }
    button.primary { font-weight: 700; min-height: 40px; padding: 9px 22px; font-size: 14px; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .readiness { min-height: 18px; color: var(--vscode-descriptionForeground); font-size: 13px; }
    .readiness.ready { color: var(--vscode-testing-iconPassed); }
    .readiness.failed { color: var(--vscode-errorForeground); }
    .summary { display: flex; flex-wrap: wrap; gap: 10px; color: var(--vscode-descriptionForeground); font-size: 12px; }
    .summary span { white-space: nowrap; }
    .folder-choice { border: 1px solid var(--vscode-panel-border); padding: 12px; display: grid; gap: 10px; background: var(--vscode-sideBar-background); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
    @media (max-width: 520px) {
      main { padding: 18px 12px 24px; }
      h1 { font-size: 28px; }
      h2 { font-size: 18px; }
      textarea { min-height: 156px; }
      .top-actions { align-items: stretch; }
      button.primary { width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
  </style>
</head>
<body>
  <main>
    <section class="prompt-shell" aria-labelledby="homeQuestion">
      <div>
        <h1 id="title">Levi</h1>
        <h2 id="homeQuestion">What do you want to build?</h2>
      </div>
      <label class="sr-only" for="buildPrompt">Describe what you want to build</label>
      <textarea id="buildPrompt" maxlength="${EXPERIENCE_BOUNDS.maximumInputBytes}" aria-label="What do you want to build?"></textarea>
      <div class="row top-actions">
        <button id="buildButton" class="primary" aria-label="Build">Build</button>
        <div class="row">
          <button id="openProjectFolder" class="secondary" aria-label="Open project">Open Project</button>
          <button id="settings" class="secondary" aria-label="Open Levi settings">Settings</button>
        </div>
      </div>
      <div id="readinessLine" class="readiness" aria-live="polite"></div>
      <div class="summary" aria-label="Current Levi context">
        <span id="projectName"></span>
        <span id="selectedModel"></span>
      </div>
      <div class="row" id="connectionActions">
        <button id="retryConnection" class="secondary" aria-label="Retry local AI connection" hidden>Retry</button>
        <button id="selectModel" class="secondary" aria-label="Change model" hidden>Change Model</button>
      </div>
      <div id="folderChoice" class="folder-choice" hidden>
        <strong>No project folder is open.</strong>
        <div class="meta">Choose where Levi should work. Your prompt will stay here.</div>
        <div class="row">
          <button id="createProjectFolder" class="secondary" aria-label="Create a new project folder">Create New Project Folder</button>
          <button id="openExistingProject" class="secondary" aria-label="Open an existing project">Open Existing Project</button>
        </div>
      </div>
    </section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = ${serialized};
    const byId = (id) => document.getElementById(id);
    function send(command, extra) { vscode.postMessage(Object.assign({ command }, extra || {})); }
    function text(value) { return value === undefined || value === null ? "" : String(value); }
    function placeholder(value) { return text(value).replace(/\\\\n/g, "\\n"); }
    function promptValue() { return byId("buildPrompt").value; }
    function setVisible(id, visible) { byId(id).hidden = !visible; }
    function readinessClass(line) {
      if (/^Ready\\b/.test(line)) return "readiness ready";
      if (/not currently reachable|not found|Not connected/i.test(line)) return "readiness failed";
      return "readiness";
    }
    function build(extra) { send("startBuilding", Object.assign({ prompt: promptValue() }, extra || {})); }
    function render(next) {
      state = next || state || {};
      const prompt = state.prompt || {};
      byId("buildPrompt").placeholder = placeholder(prompt.placeholder || state.promptPlaceholder || "Describe what you want to build");
      if (prompt.value && !byId("buildPrompt").value) byId("buildPrompt").value = text(prompt.value);
      const ai = state.ai || {};
      const line = text(ai.readinessLine || state.readiness || "Checking local AI...");
      byId("readinessLine").textContent = line;
      byId("readinessLine").className = readinessClass(line);
      const project = state.project || {};
      byId("projectName").textContent = project.open ? ("Project: " + text(project.name || "Project folder")) : "Project: none";
      byId("selectedModel").textContent = ai.selectedModel && ai.selectedModel !== "None installed" ? ("Model: " + text(ai.selectedModel)) : "";
      setVisible("retryConnection", Boolean(ai.showRetry));
      setVisible("selectModel", Boolean(ai.showSelectModel));
      setVisible("folderChoice", false);
      byId("buildButton").disabled = false;
    }
    byId("buildButton").addEventListener("click", () => build());
    byId("buildPrompt").addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        build();
      }
    });
    byId("openProjectFolder").addEventListener("click", () => send("openProjectFolder", { prompt: promptValue(), mode: "existing" }));
    byId("createProjectFolder").addEventListener("click", () => send("openProjectFolder", { prompt: promptValue(), mode: "new" }));
    byId("openExistingProject").addEventListener("click", () => send("openProjectFolder", { prompt: promptValue(), mode: "existing" }));
    byId("retryConnection").addEventListener("click", () => send("testConnection", { prompt: promptValue() }));
    byId("selectModel").addEventListener("click", () => send("selectModel", { prompt: promptValue() }));
    byId("settings").addEventListener("click", () => send("openSettings", { prompt: promptValue() }));
    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "homeState") render(event.data.state);
      if (event.data && event.data.type === "folderChoice") setVisible("folderChoice", true);
    });
    render(state);
    byId("buildPrompt").focus();
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
