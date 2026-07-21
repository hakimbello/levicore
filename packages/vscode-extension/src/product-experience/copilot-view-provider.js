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
    .pill { border: 1px solid var(--vscode-panel-border); border-radius: 999px; padding: 2px 7px; font-size: 12px; display: inline-block; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; max-height: 260px; overflow: auto; }
    .timeline-shell { display: grid; gap: 8px; }
    .timeline-summary { display: grid; gap: 4px; }
    .timeline-stages { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    .timeline-stage { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: start; }
    .timeline-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 4px; border: 1px solid var(--vscode-panel-border); }
    .timeline-stage.active .timeline-dot { background: var(--vscode-progressBar-background); }
    .timeline-stage.complete .timeline-dot { background: var(--vscode-testing-iconPassed); }
    .timeline-stage.blocked .timeline-dot, .timeline-stage.failed .timeline-dot { background: var(--vscode-errorForeground); }
    .timeline-stage.skipped .timeline-dot { background: var(--vscode-descriptionForeground); }
    .timeline-stage-title { font-weight: 600; font-size: 12px; }
    .timeline-stage-meta { font-size: 12px; color: var(--vscode-descriptionForeground); }
    .timeline-alert { border-left: 3px solid var(--vscode-errorForeground); padding-left: 8px; }
    .timeline-success { border-left: 3px solid var(--vscode-testing-iconPassed); padding-left: 8px; }
    .check-row { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
    @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; transition: none !important; animation: none !important; } }
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
    <section class="card" aria-labelledby="buildTimelineLabel">
      <div class="row" style="justify-content: space-between;">
        <h2 id="buildTimelineLabel">Live Build Timeline</h2>
        <button id="toggleTimelineDetails" class="secondary" aria-expanded="false" aria-controls="buildTimelineDetails">Details</button>
      </div>
      <div id="buildTimelineLive" class="sr-only" aria-live="polite" aria-atomic="true"></div>
      <div class="timeline-shell">
        <div id="buildTimelineSummary" class="timeline-summary"></div>
        <ol id="buildTimelineStages" class="timeline-stages" aria-label="Build stages"></ol>
        <div id="buildTimelineReview" class="list"></div>
        <div id="buildTimelineTesting" class="list"></div>
        <div id="buildTimelineActivity" class="meta"></div>
        <div id="buildTimelineBlocker" hidden></div>
        <div id="buildTimelineCompletion" hidden></div>
        <div id="buildTimelineDetails" hidden class="list"></div>
      </div>
      <div class="row" style="margin-top: 8px;">
        <button id="openChangeReview" class="secondary" aria-label="Open change review">Review changes</button>
        <button id="openValidationDetails" class="secondary" aria-label="Open validation details">Validation details</button>
      </div>
    </section>
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
    <section class="card" aria-labelledby="responseLabel"><h2 id="responseLabel">Response</h2><pre id="response"></pre></section>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = ${serialized};
    let buildTimeline = state.buildTimeline || null;
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
    function renderBuildTimeline(next) {
      buildTimeline = next || buildTimeline;
      const summary = byId("buildTimelineSummary");
      const stagesNode = byId("buildTimelineStages");
      const reviewNode = byId("buildTimelineReview");
      const testingNode = byId("buildTimelineTesting");
      const activityNode = byId("buildTimelineActivity");
      const blockerNode = byId("buildTimelineBlocker");
      const completionNode = byId("buildTimelineCompletion");
      const detailsNode = byId("buildTimelineDetails");
      const liveNode = byId("buildTimelineLive");
      const toggle = byId("toggleTimelineDetails");
      summary.textContent = "";
      stagesNode.textContent = "";
      reviewNode.textContent = "";
      testingNode.textContent = "";
      activityNode.textContent = "";
      blockerNode.hidden = true;
      completionNode.hidden = true;
      detailsNode.hidden = true;
      if (!buildTimeline) {
        summary.append(row("No active build", "Send a request to start the live build timeline."));
        liveNode.textContent = "No active build.";
        toggle.setAttribute("aria-expanded", "false");
        return;
      }
      const current = buildTimeline.currentStage || {};
      const headline = document.createElement("div");
      headline.className = "row";
      const title = document.createElement("strong");
      title.textContent = text(buildTimeline.statusLabel || "In progress");
      const stagePill = document.createElement("span");
      stagePill.className = "pill";
      stagePill.textContent = text(current.label || buildTimeline.currentStageId || "Build");
      headline.append(title, stagePill);
      summary.append(headline);
      const active = document.createElement("div");
      active.className = "meta";
      if (buildTimeline.showProgressPercentage) active.textContent = text(buildTimeline.activeLabel) + " (" + text(buildTimeline.progressPercentage) + "%)";
      else active.textContent = text(buildTimeline.activeLabel || buildTimeline.latestActivity || "Build in progress");
      summary.append(active);
      if (buildTimeline.elapsedLabel) summary.append(row("Elapsed", buildTimeline.elapsedLabel));
      (buildTimeline.stages || []).forEach((stage) => {
        const item = document.createElement("li");
        item.className = "timeline-stage " + text(stage.status);
        const dot = document.createElement("span");
        dot.className = "timeline-dot";
        dot.setAttribute("aria-hidden", "true");
        const body = document.createElement("div");
        const stageTitle = document.createElement("div");
        stageTitle.className = "timeline-stage-title";
        stageTitle.textContent = text(stage.label);
        const stageMeta = document.createElement("div");
        stageMeta.className = "timeline-stage-meta";
        const parts = [stage.statusLabel];
        if (stage.currentTask) parts.push(stage.currentTask);
        if (stage.elapsedLabel) parts.push(stage.elapsedLabel);
        if (stage.showProgressPercentage) parts.push(stage.progressPercentage + "%");
        if (stage.completionEvidence) parts.push(stage.completionEvidence);
        if (stage.blockerReason) parts.push(stage.blockerReason);
        if (stage.failureReason) parts.push(stage.failureReason);
        stageMeta.textContent = parts.filter(Boolean).join(" · ");
        body.append(stageTitle, stageMeta);
        item.append(dot, body);
        stagesNode.append(item);
      });
      if (buildTimeline.review) {
        reviewNode.append(row("Review evidence", ""));
        if (buildTimeline.review.approvalStatus) reviewNode.append(row("Approval status", buildTimeline.review.approvalStatus));
        (buildTimeline.review.filesToCreate || []).forEach((file) => reviewNode.append(row("Create", file)));
        (buildTimeline.review.filesToModify || []).forEach((file) => reviewNode.append(row("Modify", file)));
        (buildTimeline.review.filesToDelete || []).forEach((file) => reviewNode.append(row("Delete", file)));
        if (buildTimeline.review.riskSummary) reviewNode.append(row("Risk", buildTimeline.review.riskSummary));
        (buildTimeline.review.warnings || []).forEach((warning) => reviewNode.append(row("Warning", warning)));
      }
      if (buildTimeline.checks && buildTimeline.checks.length) {
        testingNode.append(row("Validation checks", ""));
        buildTimeline.checks.forEach((check) => {
          const line = document.createElement("div");
          line.className = "check-row";
          const label = document.createElement("span");
          label.textContent = text(check.label || check.id);
          const status = document.createElement("span");
          status.className = "meta";
          status.textContent = text(check.status);
          line.append(label, status);
          testingNode.append(line);
        });
      }
      if (buildTimeline.latestActivity) activityNode.textContent = "Latest activity: " + text(buildTimeline.latestActivity);
      if (buildTimeline.overallStatus === "blocked" || buildTimeline.overallStatus === "failed") {
        blockerNode.hidden = false;
        blockerNode.className = "timeline-alert";
        blockerNode.textContent = text((buildTimeline.blockers || []).join(" · ") || buildTimeline.activeLabel || "Build blocked");
      }
      if (buildTimeline.completionSummary) {
        completionNode.hidden = false;
        completionNode.className = buildTimeline.overallStatus === "complete" ? "timeline-success" : "timeline-alert";
        const summaryLines = [];
        const completion = buildTimeline.completionSummary;
        if (completion.finalStatus) summaryLines.push("Status: " + completion.finalStatus);
        if (completion.filesCreated !== null && completion.filesCreated !== undefined) summaryLines.push("Files created: " + completion.filesCreated);
        if (completion.filesModified !== null && completion.filesModified !== undefined) summaryLines.push("Files modified: " + completion.filesModified);
        if (completion.filesDeleted !== null && completion.filesDeleted !== undefined) summaryLines.push("Files deleted: " + completion.filesDeleted);
        if (completion.checksPassed !== null && completion.checksPassed !== undefined) summaryLines.push("Checks passed: " + completion.checksPassed);
        if (completion.checksFailed !== null && completion.checksFailed !== undefined) summaryLines.push("Checks failed: " + completion.checksFailed);
        if (completion.elapsedLabel) summaryLines.push("Elapsed: " + completion.elapsedLabel);
        if (completion.cancellationReason) summaryLines.push(completion.cancellationReason);
        completionNode.textContent = summaryLines.join(" · ");
      }
      if (buildTimeline.detailsExpanded) {
        detailsNode.hidden = false;
        detailsNode.append(row("Build ID", buildTimeline.buildId));
        if (buildTimeline.operationId) detailsNode.append(row("Operation", buildTimeline.operationId));
        if (buildTimeline.turnId) detailsNode.append(row("Turn", buildTimeline.turnId));
      }
      toggle.setAttribute("aria-expanded", buildTimeline.detailsExpanded ? "true" : "false");
      liveNode.textContent = text(buildTimeline.activeLabel || buildTimeline.statusLabel || "Build updated");
    }
    function render(next) {
      state = next || state || {};
      if (state.buildTimeline) buildTimeline = state.buildTimeline;
      byId("mode").value = state.mode || "Ask";
      setText("stage", state.stage || "Starting");
      setText("headerMeta", [state.workspace && state.workspace.name, state.model && state.model.selected && state.model.selected.name || "No model", state.model && state.model.privacy || "Privacy enforced", state.mode].filter(Boolean).join(" / "));
      setText("routing", [state.model && state.model.selected && (state.model.selected.remote ? "Remote routing requires privacy policy" : "Local/private routing"), state.context && state.context.scope].filter(Boolean).join(" / "));
      fillList("activity", state.activity || [], "Nothing active");
      fillList("approval", state.activeApproval ? [state.activeApproval] : [], "No approval waiting");
      const turn = state.agent && state.agent.activeTurn || {};
      const response = turn.assistantResponse || state.agent && state.agent.lastResponse || {};
      setText("response", typeof response.content === "string" ? response.content : state.status || "Ready when you are.");
      if (state.pendingComposerPrompt) byId("message").value = text(state.pendingComposerPrompt);
      renderBuildTimeline(buildTimeline);
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
    byId("toggleTimelineDetails").addEventListener("click", () => send("toggleTimelineDetails"));
    byId("openChangeReview").addEventListener("click", () => send("openChangeReview"));
    byId("openValidationDetails").addEventListener("click", () => send("openValidationDetails"));
    byId("message").addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") send("submit", { content: byId("message").value, mode: byId("mode").value, scope: byId("scope").value });
      if (event.key === "Escape") send("cancel");
    });
    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "productState") render(event.data.state);
      if (event.data && event.data.type === "buildTimeline") renderBuildTimeline(event.data.state);
    });
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
