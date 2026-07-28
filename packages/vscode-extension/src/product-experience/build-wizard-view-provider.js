const { EXPERIENCE_BOUNDS } = require("./product-experience-constants");
const { escapeHtml, serializeProductExperience } = require("./product-experience-serializer");

function renderBuildWizardHtml(state = {}, options = {}) {
  const nonce = options.nonce || createNonce();
  const serialized = JSON.stringify(serializeProductExperience(state, { maximumSize: EXPERIENCE_BOUNDS.maximumSerializedStateBytes })).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
    main { max-width: 820px; margin: 0 auto; padding: 24px 20px 32px; }
    h1 { margin: 0; font-size: 26px; font-weight: 600; }
    .progress { margin: 10px 0 20px; color: var(--vscode-descriptionForeground); font-size: 13px; font-weight: 600; }
    .progress-bar { height: 4px; background: var(--vscode-panel-border); border-radius: 999px; overflow: hidden; margin-top: 6px; }
    .progress-fill { height: 100%; background: var(--vscode-button-background); transition: width 0.2s ease; }
    .subtitle { margin: 6px 0 0; color: var(--vscode-descriptionForeground); font-size: 14px; }
    .goal { margin-top: 14px; padding: 10px 12px; border: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); color: var(--vscode-descriptionForeground); font-size: 13px; }
    .card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 16px; }
    .card { border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 18px 16px; background: var(--vscode-sideBar-background); cursor: pointer; min-height: 88px; display: flex; flex-direction: column; gap: 8px; }
    .card:hover { border-color: var(--vscode-focusBorder); }
    .card.selected { outline: 2px solid var(--vscode-focusBorder); background: var(--vscode-list-activeSelectionBackground); }
    .card-icon { font-size: 28px; line-height: 1; }
    .card-label { font-size: 16px; font-weight: 600; }
    .form { display: grid; gap: 14px; margin-top: 16px; }
    .field label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
    .field input, .field select, .field textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); font-family: var(--vscode-font-family); font-size: 13px; }
    .field textarea { min-height: 72px; resize: vertical; }
    .checks { display: grid; gap: 8px; }
    .checks label { font-weight: 400; display: flex; gap: 8px; align-items: center; }
    .plan-section { border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 14px; margin-top: 12px; background: var(--vscode-sideBar-background); }
    .plan-section h3 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vscode-descriptionForeground); }
    .plan-section ul { margin: 0; padding-left: 18px; }
    .plan-section li { margin: 4px 0; font-size: 13px; }
    .approval-note { margin-top: 16px; padding: 12px; border-left: 3px solid var(--vscode-inputValidation-infoBorder); color: var(--vscode-descriptionForeground); font-size: 13px; }
    .launch-note { margin-top: 16px; font-size: 14px; color: var(--vscode-descriptionForeground); }
    .blocked { margin-top: 12px; padding: 10px 12px; border-left: 3px solid var(--vscode-inputValidation-warningBorder); color: var(--vscode-descriptionForeground); font-size: 13px; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
    button { min-height: 36px; padding: 8px 16px; border: 0; border-radius: 2px; cursor: pointer; font-size: 13px; font-family: var(--vscode-font-family); }
    button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); font-weight: 600; min-height: 40px; padding: 10px 20px; font-size: 14px; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .hidden { display: none !important; }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Build Wizard</h1>
      <div class="progress" id="progressLabel" aria-live="polite"></div>
      <div class="progress-bar" aria-hidden="true"><div class="progress-fill" id="progressFill"></div></div>
      <p class="subtitle" id="stepTitle"></p>
      <div class="goal hidden" id="projectGoal"></div>
    </header>
    <div id="blocked" class="blocked hidden"></div>

    <section id="step1">
      <div class="card-grid" id="templateGrid" role="listbox" aria-label="Project templates"></div>
    </section>

    <section id="step2" class="hidden">
      <form class="form" id="questionForm"></form>
    </section>

    <section id="step3" class="hidden">
      <div id="planView"></div>
    </section>

    <section id="step4" class="hidden">
      <div id="approvalSummary"></div>
      <div class="approval-note">Approve this plan to continue. Levi will not write code until you send a message in the composer.</div>
    </section>

    <section id="step5" class="hidden">
      <p class="launch-note">Your plan is ready. Open Levi Composer to review and send when you are ready. Nothing runs automatically.</p>
      <div id="launchSummary"></div>
    </section>

    <div class="actions">
      <button type="button" id="backBtn" class="secondary hidden" aria-label="Go back">Back</button>
      <button type="button" id="editPlanBtn" class="secondary hidden" aria-label="Edit plan">Edit Plan</button>
      <button type="button" id="primaryBtn" class="primary" aria-label="Primary action"></button>
      <button type="button" id="cancelBtn" class="secondary" aria-label="Cancel wizard">Cancel</button>
    </div>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let state = ${serialized};
    let draftAnswers = {};
    const byId = (id) => document.getElementById(id);
    function send(command, extra) { vscode.postMessage(Object.assign({ command }, extra || {})); }
    function text(value) { return value === undefined || value === null ? "" : String(value); }
    function show(id, visible) { byId(id).classList.toggle("hidden", !visible); }
    function renderTemplates() {
      const grid = byId("templateGrid");
      grid.textContent = "";
      (state.templates || []).forEach((entry) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "card" + (entry.selected ? " selected" : "");
        card.setAttribute("role", "option");
        card.innerHTML = '<span class="card-icon">' + text(entry.icon) + '</span><span class="card-label">' + text(entry.label) + '</span>';
        card.addEventListener("click", () => send("selectTemplate", { templateId: entry.id }));
        grid.appendChild(card);
      });
    }
    function renderQuestions() {
      const form = byId("questionForm");
      form.textContent = "";
      draftAnswers = Object.assign({}, state.answers || {});
      (state.questions || []).forEach((question) => {
        const wrap = document.createElement("div");
        wrap.className = "field";
        const label = document.createElement("label");
        label.textContent = question.label + (question.required ? " *" : "");
        label.setAttribute("for", "field-" + question.id);
        wrap.appendChild(label);
        if (question.type === "multiselect") {
          const checks = document.createElement("div");
          checks.className = "checks";
          (question.options || []).forEach((option) => {
            const row = document.createElement("label");
            const input = document.createElement("input");
            input.type = "checkbox";
            input.value = option;
            input.checked = Array.isArray(draftAnswers[question.id]) && draftAnswers[question.id].includes(option);
            input.addEventListener("change", () => {
              const current = Array.isArray(draftAnswers[question.id]) ? draftAnswers[question.id].slice() : [];
              draftAnswers[question.id] = input.checked
                ? (current.includes(option) ? current : current.concat(option))
                : current.filter((entry) => entry !== option);
              send("updateAnswers", { answers: draftAnswers });
            });
            row.append(input, document.createTextNode(option));
            checks.appendChild(row);
          });
          wrap.appendChild(checks);
        } else if (question.type === "select") {
          const select = document.createElement("select");
          select.id = "field-" + question.id;
          (question.options || []).forEach((option) => {
            const item = document.createElement("option");
            item.value = option;
            item.textContent = option;
            if (draftAnswers[question.id] === option) item.selected = true;
            select.appendChild(item);
          });
          select.addEventListener("change", () => {
            draftAnswers[question.id] = select.value;
            send("updateAnswers", { answers: draftAnswers });
          });
          wrap.appendChild(select);
        } else {
          const input = document.createElement(question.type === "text" ? "input" : "textarea");
          input.id = "field-" + question.id;
          if (question.type === "text") input.type = "text";
          input.value = text(draftAnswers[question.id]);
          input.addEventListener("input", () => {
            draftAnswers[question.id] = input.value;
            send("updateAnswers", { answers: draftAnswers });
          });
          wrap.appendChild(input);
        }
        form.appendChild(wrap);
      });
    }
    function listSection(title, items) {
      const section = document.createElement("div");
      section.className = "plan-section";
      const heading = document.createElement("h3");
      heading.textContent = title;
      section.appendChild(heading);
      const list = document.createElement("ul");
      (items || []).forEach((item) => {
        const li = document.createElement("li");
        li.textContent = text(item);
        list.appendChild(li);
      });
      section.appendChild(list);
      return section;
    }
    function renderPlan(targetId) {
      const node = byId(targetId);
      node.textContent = "";
      const plan = state.plan || {};
      if (plan.summary) {
        const summary = document.createElement("p");
        summary.textContent = plan.summary;
        node.appendChild(summary);
      }
      node.appendChild(listSection("Architecture", [plan.architecture]));
      node.appendChild(listSection("Folder structure", plan.folderStructure || []));
      node.appendChild(listSection("Packages", plan.packages || []));
      node.appendChild(listSection("Dependencies", plan.dependencies || []));
      const estimate = document.createElement("div");
      estimate.className = "plan-section";
      estimate.innerHTML = "<h3>Estimated files</h3><p>" + text(plan.estimatedFiles) + "</p>";
      node.appendChild(estimate);
      node.appendChild(listSection("Security considerations", plan.securityConsiderations || []));
      node.appendChild(listSection("Testing strategy", plan.testingStrategy || []));
      node.appendChild(listSection("Potential risks", plan.potentialRisks || []));
    }
    function render(next) {
      state = next || state || {};
      const step = Number(state.step) || 1;
      byId("progressLabel").textContent = state.progressLabel || ("Step " + step + " of 5");
      byId("progressFill").style.width = ((step / 5) * 100) + "%";
      byId("stepTitle").textContent = state.stepTitle || "";
      const goal = text(state.goal);
      show("projectGoal", Boolean(goal));
      byId("projectGoal").textContent = goal ? ("Goal: " + goal) : "";
      const blocked = text(state.blockedReason);
      show("blocked", Boolean(blocked));
      byId("blocked").textContent = blocked;
      show("step1", step === 1);
      show("step2", step === 2);
      show("step3", step === 3);
      show("step4", step === 4);
      show("step5", step === 5);
      if (step === 1) renderTemplates();
      if (step === 2) renderQuestions();
      if (step === 3) renderPlan("planView");
      if (step === 4) renderPlan("approvalSummary");
      if (step === 5) renderPlan("launchSummary");
      const actions = state.actions || {};
      byId("primaryBtn").textContent = actions.primary || "Next";
      byId("primaryBtn").disabled = !state.canProceed;
      show("backBtn", actions.showBack === true);
      show("editPlanBtn", step === 4);
    }
    byId("primaryBtn").addEventListener("click", () => {
      const step = Number(state.step) || 1;
      if (step === 1) send("nextStep");
      else if (step === 2) send("generatePlan");
      else if (step === 3) send("nextStep");
      else if (step === 4) send("approvePlan");
      else if (step === 5) send("launchComposer");
    });
    byId("backBtn").addEventListener("click", () => send("previousStep"));
    byId("editPlanBtn").addEventListener("click", () => send("editPlan"));
    byId("cancelBtn").addEventListener("click", () => send("cancelWizard"));
    window.addEventListener("message", (event) => { if (event.data && event.data.type === "wizardState") render(event.data.state); });
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
  renderBuildWizardHtml,
};
