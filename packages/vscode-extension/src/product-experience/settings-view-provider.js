const { escapeHtml, serializeProductExperience } = require("./product-experience-serializer");

function renderSettingsHtml(state = {}, options = {}) {
  const nonce = options.nonce || createNonce();
  const serialized = JSON.stringify(serializeProductExperience(state)).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    main { max-width: 720px; margin: 0 auto; padding: 22px 16px 32px; display: grid; gap: 18px; }
    h1 { margin: 0; font-size: 26px; font-weight: 650; letter-spacing: 0; }
    h2 { margin: 0 0 10px; font-size: 16px; font-weight: 600; letter-spacing: 0; }
    section { display: grid; gap: 10px; }
    .row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; }
    .label { font-weight: 600; }
    .value { color: var(--vscode-descriptionForeground); overflow-wrap: anywhere; }
    button { min-height: 30px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 2px; padding: 5px 11px; cursor: pointer; font-family: var(--vscode-font-family); }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    label.toggle { justify-content: flex-start; gap: 10px; }
    input[type="checkbox"] { margin: 0; }
  </style>
</head>
<body>
  <main>
    <h1>Settings</h1>
    <section aria-labelledby="localAiLabel">
      <h2 id="localAiLabel">Local AI</h2>
      <div class="row"><span class="label">Connection</span><span id="connection" class="value"></span></div>
      <div class="row"><span class="label">Endpoint</span><span id="endpoint" class="value"></span></div>
      <div class="row"><span class="label">Selected model</span><span id="model" class="value"></span></div>
      <div class="row" style="justify-content:flex-start;">
        <button id="testConnection">Test connection</button>
        <button id="changeModel" class="secondary">Change model</button>
      </div>
    </section>
    <section aria-labelledby="behaviorLabel">
      <h2 id="behaviorLabel">Behavior</h2>
      <label class="row toggle"><input id="askEdits" type="checkbox" disabled>Ask before edits</label>
      <label class="row toggle"><input id="askCommands" type="checkbox" disabled>Ask before commands</label>
      <label class="row toggle"><input id="showWizard" type="checkbox" disabled>Show Build Wizard</label>
    </section>
    <section aria-labelledby="advancedLabel">
      <h2 id="advancedLabel">Advanced</h2>
      <label class="row toggle"><input id="developerTools" type="checkbox">Enable Developer Tools</label>
    </section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = ${serialized};
    const byId = (id) => document.getElementById(id);
    function send(command, extra) { vscode.postMessage(Object.assign({ command }, extra || {})); }
    function text(value) { return value === undefined || value === null || value === "" ? "Not set" : String(value); }
    function render(next) {
      state = next || state || {};
      byId("connection").textContent = text(state.connection);
      byId("endpoint").textContent = text(state.endpoint);
      byId("model").textContent = text(state.selectedModel);
      byId("askEdits").checked = state.askBeforeEdits !== false;
      byId("askCommands").checked = state.askBeforeCommands !== false;
      byId("showWizard").checked = state.showBuildWizard !== false;
      byId("developerTools").checked = state.developerTools === true;
    }
    byId("testConnection").addEventListener("click", () => send("testConnection"));
    byId("changeModel").addEventListener("click", () => send("changeModel"));
    byId("developerTools").addEventListener("change", () => send("enableDeveloperTools", { enabled: byId("developerTools").checked }));
    window.addEventListener("message", (event) => { if (event.data && event.data.type === "settingsState") render(event.data.state); });
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
  renderSettingsHtml,
};
