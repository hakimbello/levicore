const { EXPERIENCE_BOUNDS, PRODUCT_MODES } = require("./product-experience-constants");
const { escapeHtml, serializeProductExperience } = require("./product-experience-serializer");

function renderCopilotHtml(state = {}, options = {}) {
  const nonce = options.nonce || createNonce();
  const serialized = JSON.stringify(serializeProductExperience(state, { maximumSize: EXPERIENCE_BOUNDS.maximumSerializedStateBytes })).replace(/</g, "\\u003c");
  const modeOptions = Object.values(PRODUCT_MODES).map((mode) => `<option value="${escapeHtml(mode)}">${escapeHtml(mode)}</option>`).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    body { margin: 0; padding: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    header { position: sticky; top: 0; z-index: 1; display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); }
    main { padding: 12px; display: grid; gap: 12px; }
    button, select { min-height: 28px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; padding: 4px 8px; }
    button.secondary, select { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button:disabled, textarea:disabled { opacity: 0.55; cursor: not-allowed; }
    textarea { width: 100%; min-height: 96px; box-sizing: border-box; resize: vertical; padding: 8px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); font-family: var(--vscode-font-family); }
    .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 12px; }
    .status { font-weight: 600; }
    .card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 10px; background: var(--vscode-sideBar-background); }
    .card h2 { font-size: 13px; margin: 0 0 6px; }
    .list { display: grid; gap: 6px; }
    .pill { border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 2px 7px; font-size: 12px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; max-height: 260px; overflow: auto; }
    @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
  </style>
</head>
<body>
  <header>
    <div>
      <div><strong>Levi</strong> <span id="stage" class="status"></span></div>
      <div id="headerMeta" class="meta"></div>
    </div>
    <div class="row">
      <button id="newChat" class="secondary" aria-label="Start a new Levi conversation">New</button>
      <button id="environment" class="secondary" aria-label="Open Levi Environment">Environment</button>
      <button id="settings" class="secondary" aria-label="Show technical details">Details</button>
    </div>
  </header>
  <main>
    <section class="card" aria-labelledby="composerLabel">
      <h2 id="composerLabel">What do you want Levi to do?</h2>
      <div class="row">
        <label>Mode <select id="mode" aria-label="Composer mode">${modeOptions}</select></label>
        <label>Context <select id="scope" class="secondary" aria-label="Context scope"><option>Workspace</option><option>Current file</option><option>Selection</option><option>Workflow</option><option>Change</option></select></label>
        <button id="model" class="secondary" aria-label="Select model">Model</button>
      </div>
      <label class="sr-only" for="message">Message Levi</label>
      <textarea id="message" maxlength="${EXPERIENCE_BOUNDS.maximumInputBytes}" placeholder="Ask, plan, build, fix, review, or learn about this workspace."></textarea>
      <div class="row">
        <button id="send" aria-label="Send message to Levi">Send</button>
        <button id="cancel" class="secondary" aria-label="Cancel active Levi turn">Cancel</button>
        <button id="retry" class="secondary" aria-label="Retry last Levi turn">Retry</button>
        <button id="currentFile" class="secondary" aria-label="Attach current file">Current file</button>
        <button id="selection" class="secondary" aria-label="Attach selected code">Selection</button>
      </div>
      <div id="routing" class="meta" aria-live="polite"></div>
    </section>
    <section class="card" aria-labelledby="activityLabel"><h2 id="activityLabel">Now</h2><div id="activity" class="list"></div></section>
    <section class="card" aria-labelledby="approvalLabel"><h2 id="approvalLabel">Approval</h2><div id="approval" class="list"></div></section>
    <section class="card" aria-labelledby="timelineLabel"><h2 id="timelineLabel">Timeline</h2><div id="timeline" class="list"></div></section>
    <section class="card" aria-labelledby="responseLabel"><h2 id="responseLabel">Response</h2><pre id="response"></pre></section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = ${serialized};
    const byId = (id) => document.getElementById(id);
    function send(command, extra) { vscode.postMessage(Object.assign({ command }, extra || {})); }
    function text(value) { return value === undefined || value === null ? "" : String(value); }
    function setText(id, value) { byId(id).textContent = text(value); }
    function row(title, description) {
      const item = document.createElement("div");
      item.className = "row";
      const strong = document.createElement("strong");
      strong.textContent = title;
      const span = document.createElement("span");
      span.className = "meta";
      span.textContent = description || "";
      item.append(strong, span);
      return item;
    }
    function fillList(id, items, empty) {
      const node = byId(id);
      node.textContent = "";
      if (!items || !items.length) node.append(row(empty, ""));
      else items.forEach((entry) => node.append(row(entry.title || entry.name || entry.label || entry.role || "Item", entry.description || entry.state || entry.status || entry.risk || "")));
    }
    function render(next) {
      state = next || state || {};
      byId("mode").value = state.mode || "Ask";
      setText("stage", state.stage || "Starting");
      setText("headerMeta", [state.workspace && state.workspace.name, state.model && state.model.selected && state.model.selected.name || "No model", state.model && state.model.privacy || "Privacy enforced", state.mode].filter(Boolean).join(" / "));
      setText("routing", [state.model && state.model.selected && (state.model.selected.remote ? "Remote routing requires privacy policy" : "Local/private routing"), state.context && state.context.scope].filter(Boolean).join(" / "));
      fillList("activity", state.activity || [], "Nothing active");
      fillList("approval", state.activeApproval ? [state.activeApproval] : [], "No approval waiting");
      fillList("timeline", state.workflowTimeline && state.workflowTimeline.stages || [], "No workflow running");
      const turn = state.agent && state.agent.activeTurn || {};
      const response = turn.assistantResponse || state.agent && state.agent.lastResponse || {};
      setText("response", typeof response.content === "string" ? response.content : state.status || "Ready when you are.");
      if (state.pendingComposerPrompt) byId("message").value = text(state.pendingComposerPrompt);
    }
    byId("newChat").addEventListener("click", () => send("newChat", { content: byId("message").value, mode: byId("mode").value }));
    byId("send").addEventListener("click", () => send("submit", { content: byId("message").value, mode: byId("mode").value, scope: byId("scope").value }));
    byId("cancel").addEventListener("click", () => send("cancel"));
    byId("retry").addEventListener("click", () => send("retry"));
    byId("mode").addEventListener("change", () => send("setMode", { mode: byId("mode").value }));
    byId("model").addEventListener("click", () => send("selectModel"));
    byId("currentFile").addEventListener("click", () => send("attachCurrentFile"));
    byId("selection").addEventListener("click", () => send("attachSelectedCode"));
    byId("environment").addEventListener("click", () => send("showEnvironment"));
    byId("settings").addEventListener("click", () => send("showTechnicalDetails"));
    byId("message").addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") send("submit", { content: byId("message").value, mode: byId("mode").value, scope: byId("scope").value });
      if (event.key === "Escape") send("cancel");
    });
    window.addEventListener("message", (event) => { if (event.data && event.data.type === "productState") render(event.data.state); });
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
  renderCopilotHtml,
};
