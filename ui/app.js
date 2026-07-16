(function initializeLeviUi() {
  const UNKNOWN = "UNKNOWN";

  const state = {
    dashboard: null,
    execution: null,
    health: null,
    plan: null,
    route: "home",
  };

  const elements = {
    main: document.getElementById("main"),
    pageTitle: document.querySelector(".brand-block h1"),
    loading: document.getElementById("loading-state"),
    error: document.getElementById("error-state"),
    errorMessage: document.querySelector("[data-error-message]"),
    dashboard: document.getElementById("home"),
    navItems: Array.from(document.querySelectorAll(".nav-item")),
    topProjectName: document.getElementById("top-project-name"),
    projectOption: document.getElementById("project-option"),
    projectTitle: document.getElementById("project-title"),
    projectContext: document.getElementById("project-context"),
    projectStrip: document.querySelector(".project-strip"),
    taskInput: document.getElementById("task-input"),
    taskForm: document.getElementById("task-form"),
    createPlanButton: document.getElementById("create-plan-button"),
    intakeResult: document.getElementById("intake-result"),
    statusSummary: document.querySelector("[data-status-summary]"),
    healthStatus: document.getElementById("health-status"),
    healthText: document.getElementById("health-text"),
    healthIssues: document.getElementById("health-issues"),
    repositoryRootValue: document.getElementById("repository-root-value"),
    repositoryDetails: document.querySelector("[data-repository-details]"),
    activityEmpty: document.getElementById("activity-empty"),
    activityList: document.getElementById("activity-list"),
    footerStatus: document.getElementById("footer-status"),
  };

  elements.plan = createPlanScreen();
  elements.main.append(elements.plan.section);
  elements.execution = createExecutionScreen();
  elements.main.append(elements.execution.section);
  elements.projectHealth = createProjectHealthScreen();
  elements.main.append(elements.projectHealth.section);
  elements.planShortcut = document.createElement("a");
  elements.planShortcut.className = "secondary-action plan-shortcut";
  elements.planShortcut.href = "#plan-approval";
  elements.planShortcut.textContent = "Review Plan";
  elements.planShortcut.hidden = true;
  elements.executionShortcut = document.createElement("a");
  elements.executionShortcut.className = "secondary-action plan-shortcut";
  elements.executionShortcut.href = "#execution-progress";
  elements.executionShortcut.textContent = "View Progress";
  elements.executionShortcut.hidden = true;
  elements.projectStrip.append(elements.planShortcut);
  elements.projectStrip.append(elements.executionShortcut);

  elements.taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitIntake();
  });

  elements.plan.approveButton.addEventListener("click", submitPlanApproval);
  elements.plan.editButton.addEventListener("click", (event) => {
    event.preventDefault();
    window.location.hash = "#new-task";
    window.setTimeout(() => elements.taskInput.focus(), 0);
  });
  elements.plan.costCheckbox.addEventListener("change", updatePlanApproveState);
  elements.plan.destructiveCheckbox.addEventListener("change", updatePlanApproveState);
  elements.execution.primaryAction.addEventListener("click", handleExecutionPrimaryAction);
  elements.projectHealth.primaryAction.addEventListener("click", handleProjectHealthPrimaryAction);
  window.addEventListener("hashchange", applyRoute);

  applyRoute();
  loadDashboard();

  async function loadDashboard() {
    if (state.route === "home") {
      showLoading();
    }

    try {
      const response = await fetch("/api/home", {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Levi could not load project information.");
      }

      const dashboard = await response.json();
      state.dashboard = dashboard;

      if (dashboard.status === "ERROR") {
        if (state.route === "home") {
          showError(dashboard.error && dashboard.error.detail ? dashboard.error.detail : "Project needs attention.");
        }
        return;
      }

      renderDashboard(dashboard);
    } catch (error) {
      if (state.route === "home") {
        showError(error.message);
      }
    }
  }

  async function loadPlanApproval() {
    showPlanLoading();

    try {
      const response = await fetch("/api/plan", {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Levi could not load the plan.");
      }

      renderPlanApproval(await response.json());
    } catch (error) {
      showPlanError(error.message);
    }
  }

  async function loadExecutionCompletion() {
    showExecutionLoading();

    try {
      const response = await fetch("/api/execution", {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Levi could not load execution information.");
      }

      renderExecutionCompletion(await response.json());
    } catch (error) {
      showExecutionError(error.message);
    }
  }

  async function loadProjectHealth() {
    showProjectHealthLoading();

    try {
      const response = await fetch("/api/health", {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Levi could not load Project Health.");
      }

      renderProjectHealth(await response.json());
    } catch (error) {
      showProjectHealthError(error.message);
    }
  }

  async function submitIntake() {
    if (elements.createPlanButton.disabled) {
      return;
    }

    const requestText = elements.taskInput.value;
    elements.intakeResult.hidden = false;
    elements.intakeResult.className = "result-panel loading";
    elements.intakeResult.textContent = "Checking request.";
    elements.createPlanButton.disabled = true;
    elements.createPlanButton.textContent = "Checking";

    try {
      const response = await fetch("/api/intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ requestText }),
      });

      if (!response.ok) {
        throw new Error("Levi could not check this request.");
      }

      renderIntakeResult(await response.json());
    } catch (error) {
      elements.intakeResult.className = "result-panel blocked";
      elements.intakeResult.textContent = safeUiText(error.message);
    } finally {
      const canCreateTask = Boolean(state.dashboard && state.dashboard.controls && state.dashboard.controls.canCreateTask);
      elements.createPlanButton.disabled = !canCreateTask;
      elements.createPlanButton.textContent = "Create Plan";
    }
  }

  async function submitPlanApproval() {
    const plan = state.plan;

    if (!plan || elements.plan.approveButton.disabled) {
      return;
    }

    elements.plan.approveButton.disabled = true;
    elements.plan.approveButton.textContent = "Approving";
    elements.plan.submitResult.hidden = true;

    try {
      const response = await fetch("/api/plan/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          costApproved: elements.plan.costCheckbox.checked,
          destructiveConfirmed: elements.plan.destructiveCheckbox.checked,
        }),
      });

      if (!response.ok) {
        throw new Error("Levi could not record approval.");
      }

      renderPlanApproval(await response.json());
      await loadDashboard();
    } catch (error) {
      elements.plan.submitResult.hidden = false;
      elements.plan.submitResult.className = "result-panel blocked";
      elements.plan.submitResult.textContent = safeUiText(error.message);
      updatePlanApproveState();
    }
  }

  function handleExecutionPrimaryAction(event) {
    event.preventDefault();

    const action = state.execution && state.execution.actions && state.execution.actions.primary;

    if (!action || !action.href) {
      return;
    }

    if (action.href === "#execution-progress") {
      loadExecutionCompletion();
      return;
    }

    window.location.hash = action.href;
  }

  function handleProjectHealthPrimaryAction(event) {
    event.preventDefault();

    const action = state.health && state.health.actions && state.health.actions.primary;

    if (!action) {
      return;
    }

    if (action.href) {
      window.location.hash = action.href;
      return;
    }

    if (action.target === "recommendations") {
      elements.projectHealth.recommendations.scrollIntoView({ block: "start" });
      const firstDetail = elements.projectHealth.recommendations.querySelector("details");
      if (firstDetail) {
        firstDetail.open = true;
        firstDetail.querySelector("summary").focus();
      }
    }
  }

  function applyRoute() {
    const hash = window.location.hash || "#home";
    if (hash === "#plan-approval" || hash === "#approval") {
      state.route = "plan";
    } else if (hash === "#health" || hash === "#project-health" || hash === "#health-recommendations") {
      state.route = "health";
    } else if (["#execution-progress", "#completion-result", "#execution", "#completion"].includes(hash)) {
      state.route = "execution";
    } else {
      state.route = "home";
    }
    updateNavState(hash);

    if (state.route === "plan") {
      elements.pageTitle.textContent = "Plan";
      loadPlanApproval();
      return;
    }

    if (state.route === "execution") {
      elements.pageTitle.textContent = "Execution";
      loadExecutionCompletion();
      return;
    }

    if (state.route === "health") {
      elements.pageTitle.textContent = "Health";
      loadProjectHealth();
      return;
    }

    elements.pageTitle.textContent = "Home";
    showHomeFromState();
    scrollHomeTarget(hash);
  }

  function updateNavState(hash) {
    const activeHref = state.route === "plan" || state.route === "execution"
      ? "#new-task"
      : state.route === "health"
        ? "#health"
        : hash;

    elements.navItems.forEach((item) => {
      const active = item.getAttribute("href") === activeHref || (!activeHref || activeHref === "#home") && item.getAttribute("href") === "#home";
      item.classList.toggle("active", active);

      if (active) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });
  }

  function scrollHomeTarget(hash) {
    if (!hash || hash === "#home" || state.route !== "home") {
      return;
    }

    const target = document.querySelector(hash);

    if (target) {
      window.setTimeout(() => target.scrollIntoView({ block: "start" }), 0);
    }
  }

  function renderDashboard(dashboard) {
    const projectName = textValue(dashboard.project && dashboard.project.name);
    const canCreateTask = Boolean(dashboard.controls && dashboard.controls.canCreateTask);

    elements.topProjectName.textContent = projectName;
    elements.projectOption.textContent = projectName === UNKNOWN ? "Current project" : projectName;
    elements.projectTitle.textContent = projectName;
    elements.projectContext.textContent = projectContextText(dashboard);
    elements.taskInput.disabled = !canCreateTask;
    elements.createPlanButton.disabled = !canCreateTask;
    elements.footerStatus.textContent = dashboard.readyToWork ? "Ready" : "Needs attention";

    if (!canCreateTask) {
      elements.taskInput.placeholder = "Select a project before creating a plan.";
    }

    renderStatusSummary(dashboard.statusSummary || []);
    renderHealth(dashboard.health || {});
    renderRepository(dashboard.repository || {});
    renderActivity(dashboard.recentActivity || [], dashboard.emptyStates || []);
    renderPlanShortcut(dashboard);

    if (state.route === "home") {
      elements.loading.hidden = true;
      elements.error.hidden = true;
      elements.dashboard.hidden = false;
      elements.plan.section.hidden = true;
      elements.execution.section.hidden = true;
      elements.projectHealth.section.hidden = true;
    }
  }

  function renderPlanShortcut(dashboard) {
    const recentActivity = Array.isArray(dashboard.recentActivity) ? dashboard.recentActivity : [];
    const hasPlan = recentActivity.some((entry) => textValue(entry.label).toLowerCase().includes("plan"));
    const hasExecution = recentActivity.some((entry) => /execution|validation|completion|restore/i.test(textValue(entry.label)));
    elements.planShortcut.hidden = !hasPlan;
    elements.executionShortcut.hidden = !hasExecution;
  }

  function projectContextText(dashboard) {
    if (dashboard.status === "EMPTY") {
      return "No project selected.";
    }

    if (dashboard.readyToWork) {
      return "Ready for a planned task.";
    }

    return "Needs attention before work starts.";
  }

  function renderStatusSummary(items) {
    const visibleItems = items.length > 0
      ? items
      : [{ label: "Readiness", value: "Unknown", detail: "Project readiness is UNKNOWN." }];

    elements.statusSummary.replaceChildren(
      ...visibleItems.map((item) => {
        const article = document.createElement("article");
        article.className = "status-chip";

        const label = document.createElement("span");
        label.className = "status-label";
        label.textContent = textValue(item.label);

        const value = document.createElement("strong");
        value.className = `status-value ${statusClass(item.value)}`;
        value.textContent = plainStatus(item.value);

        const detail = document.createElement("span");
        detail.className = "status-detail";
        detail.textContent = safeUiText(item.detail);

        article.append(label, value, detail);
        return article;
      }),
    );
  }

  function renderHealth(health) {
    elements.healthStatus.textContent = plainStatus(health.overallStatus);
    elements.healthStatus.className = `status-pill ${statusClass(health.overallStatus)}`;
    elements.healthText.textContent = safeUiText(health.summary);

    const issues = Array.isArray(health.highestSeverityIssues) && health.highestSeverityIssues.length > 0
      ? health.highestSeverityIssues
      : Array.isArray(health.recommendations)
        ? health.recommendations.slice(0, 3).map((recommendation) => ({
            label: recommendation.action,
            detail: recommendation.reason,
            status: recommendation.priority,
          }))
        : [];

    if (issues.length === 0) {
      const item = document.createElement("li");
      item.textContent = "No Project Health recommendations.";
      elements.healthIssues.replaceChildren(item);
      return;
    }

    elements.healthIssues.replaceChildren(
      ...issues.map((issue) => {
        const item = document.createElement("li");
        const title = document.createElement("strong");
        title.textContent = safeUiText(issue.label);
        const detail = document.createElement("span");
        detail.textContent = issue.detail ? ` ${safeUiText(issue.detail)}` : "";
        item.append(title, detail);
        return item;
      }),
    );
  }

  function renderRepository(repository) {
    elements.repositoryRootValue.textContent = textValue(repository.root);

    const rows = [
      ["Files", repository.fileCount],
      ["Languages", repository.languages],
      ["Frameworks", repository.frameworks],
      ["Package managers", repository.packageManagers],
      ["Entry points", repository.entryPoints],
      ["Tests", repository.tests],
      ["Top folders", repository.majorDirectories],
    ];

    elements.repositoryDetails.replaceChildren(
      ...rows.flatMap(([labelText, value]) => {
        const label = document.createElement("dt");
        label.textContent = labelText;
        const detail = document.createElement("dd");
        detail.textContent = textValue(value);
        return [label, detail];
      }),
    );
  }

  function renderActivity(activity, emptyStates) {
    if (!activity.length) {
      elements.activityEmpty.hidden = false;
      elements.activityEmpty.querySelector("p").textContent = emptyStates && emptyStates.length
        ? safeUiText(emptyStates[0])
        : "No task started.";
      elements.activityList.replaceChildren();
      return;
    }

    elements.activityEmpty.hidden = true;
    elements.activityList.replaceChildren(
      ...activity.map((entry) => {
        const item = document.createElement("li");
        const label = document.createElement("strong");
        label.textContent = safeUiText(entry.label);
        const detailText = activityDetailText(entry.detail);
        const detail = document.createElement("span");
        detail.textContent = detailText ? ` ${detailText}` : "";
        item.append(label, detail);

        const activityLabel = textValue(entry.label).toLowerCase();

        if (activityLabel.includes("plan")) {
          const link = document.createElement("a");
          link.className = "inline-action";
          link.href = "#plan-approval";
          link.textContent = "Review";
          item.append(link);
        }

        if (activityLabel.includes("execution") || activityLabel.includes("validation") || activityLabel.includes("completion")) {
          const link = document.createElement("a");
          link.className = "inline-action";
          link.href = "#execution-progress";
          link.textContent = "Open";
          item.append(link);
        }

        return item;
      }),
    );
  }

  function renderIntakeResult(result) {
    elements.intakeResult.className = `result-panel ${statusClass(result.status)}`;

    const title = document.createElement("strong");
    title.textContent = plainStatus(result.status);

    const details = document.createElement("dl");
    details.className = "result-details";
    appendResultLine(details, "Original request", result.originalRequest);
    appendResultLine(details, "Objective", result.normalizedObjective);
    appendResultLine(details, "Task type", result.taskType);
    appendResultLine(details, "Result", result.reason);

    elements.intakeResult.replaceChildren(title, details);

    if (Array.isArray(result.nextQuestions) && result.nextQuestions.length > 0) {
      const list = document.createElement("ul");
      list.className = "plain-list";
      result.nextQuestions.forEach((question) => {
        const item = document.createElement("li");
        item.textContent = safeUiText(question);
        list.append(item);
      });
      elements.intakeResult.append(list);
    }
  }

  function renderPlanApproval(plan) {
    state.plan = plan;
    updateProjectLabels(plan.project);

    if (plan.status === "ERROR") {
      showPlanError(plan.error && plan.error.detail ? plan.error.detail : plan.approval && plan.approval.reason);
      return;
    }

    if (plan.status === "EMPTY") {
      showPlanEmpty(plan);
      return;
    }

    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.dashboard.hidden = true;
    elements.plan.section.hidden = false;
    elements.projectHealth.section.hidden = true;
    elements.plan.loading.hidden = true;
    elements.plan.error.hidden = true;
    elements.plan.empty.hidden = true;
    elements.plan.content.hidden = false;
    elements.footerStatus.textContent = textValue(plan.approval && plan.approval.label);

    elements.plan.projectName.textContent = textValue(plan.project && plan.project.name);
    elements.plan.objective.textContent = safeUiText(plan.objective);
    elements.plan.approvalStatus.textContent = textValue(plan.approval && plan.approval.label);
    elements.plan.approvalStatus.className = `status-pill ${statusClass(plan.approval && plan.approval.status)}`;
    elements.plan.nextAction.textContent = safeUiText(plan.approval && plan.approval.nextRequiredAction);

    renderDefinitionRows(elements.plan.meta, [
      ["Requirement", plan.plan && plan.plan.requirementId],
      ["Task type", plan.plan && plan.plan.taskType],
      ["Approval state", plan.plan && plan.plan.approvalState],
    ]);
    renderList(elements.plan.summaryList, plan.summary, "No plan summary is available.");
    renderCountRow(elements.plan.counts, plan.plan && plan.plan.operationCounts);
    renderFileList(elements.plan.files, plan.plan && plan.plan.plannedFiles);
    renderList(elements.plan.acceptance, plan.plan && plan.plan.acceptanceCriteria, "Acceptance criteria are UNKNOWN.");
    renderList(elements.plan.validationCommands, plan.validation && plan.validation.commands, "Validation commands are UNKNOWN.");
    renderCost(plan.cost || {});
    renderRestore(plan.restore || {});
    renderDecisions(plan.decisions || {});
    renderContextEvidence(plan.contextEvidence || {});
    renderRisks(plan.risks || {});
    renderDestructive(plan.destructive || {});
    renderConfirmations(plan);
    renderSubmitResult(plan.submitResult);
    updatePlanApproveState();
  }

  function renderExecutionCompletion(execution) {
    state.execution = execution;
    updateProjectLabels(execution.project);

    if (execution.status === "ERROR") {
      showExecutionError(execution.error && execution.error.detail ? execution.error.detail : execution.summary);
      return;
    }

    if (execution.status === "EMPTY") {
      showExecutionEmpty(execution);
      return;
    }

    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.dashboard.hidden = true;
    elements.plan.section.hidden = true;
    elements.execution.section.hidden = false;
    elements.projectHealth.section.hidden = true;
    elements.execution.loading.hidden = true;
    elements.execution.error.hidden = true;
    elements.execution.empty.hidden = true;
    elements.execution.content.hidden = false;
    elements.footerStatus.textContent = plainStatus(execution.status);

    elements.execution.projectName.textContent = textValue(execution.project && execution.project.name);
    elements.execution.headline.textContent = safeUiText(execution.headline);
    elements.execution.objective.textContent = safeUiText(execution.objective);
    elements.execution.summary.textContent = safeUiText(execution.summary);
    elements.execution.statusBadge.textContent = plainStatus(execution.status);
    elements.execution.statusBadge.className = `status-pill ${statusClass(execution.status)}`;
    elements.execution.currentStep.textContent = safeUiText(execution.currentStep);
    elements.execution.failure.hidden = textValue(execution.failureReason) === UNKNOWN;
    elements.execution.failure.textContent = safeUiText(execution.failureReason);
    elements.execution.primaryAction.textContent = safeUiText(execution.actions && execution.actions.primary && execution.actions.primary.label);

    renderExecutionTimeline(execution.progress || []);
    renderChangedFiles(execution.changedFiles || {});
    renderExecutionValidation(execution.validation || {});
    renderExecutionCost(execution.cost || {});
    renderExecutionRestore(execution.restore || {});
    renderCompletionSummary(execution.completion || {});
    renderExecutionHealth(execution.projectHealth || {});
    renderList(elements.execution.warnings, execution.warnings, "No warnings reported by Levi Core.");
    renderList(elements.execution.knownFailures, execution.knownFailures, "No known failures reported.");
    renderList(elements.execution.remainingWork, execution.remainingWork, "No remaining work reported.");
    renderExecutionActions(execution.actions || {});
  }

  function renderExecutionTimeline(steps) {
    elements.execution.timeline.replaceChildren(
      ...steps.map((step) => {
        const item = document.createElement("li");
        item.className = `timeline-step ${statusClass(step.status)}`;
        const marker = document.createElement("span");
        marker.className = "timeline-marker";
        marker.textContent = timelineMarker(step.status);
        const body = document.createElement("div");
        const label = document.createElement("strong");
        label.textContent = safeUiText(step.label);
        const detail = document.createElement("span");
        detail.textContent = safeUiText(step.detail);
        body.append(label, detail);
        item.append(marker, body);
        return item;
      }),
    );
  }

  function timelineMarker(status) {
    const text = textValue(status).toUpperCase();

    if (text === "COMPLETED") {
      return "Done";
    }

    if (text === "CURRENT") {
      return "Now";
    }

    if (text === "FAILED") {
      return "Stop";
    }

    return "Next";
  }

  function renderChangedFiles(changedFiles) {
    renderCountRow(elements.execution.changeCounts, {
      create: Array.isArray(changedFiles.created) ? changedFiles.created.length : 0,
      update: Array.isArray(changedFiles.updated) ? changedFiles.updated.length : 0,
      delete: Array.isArray(changedFiles.deleted) ? changedFiles.deleted.length : 0,
    });
    renderFileGroup(elements.execution.createdFiles, "Created", changedFiles.created);
    renderFileGroup(elements.execution.updatedFiles, "Updated", changedFiles.updated);
    renderFileGroup(elements.execution.deletedFiles, "Deleted", changedFiles.deleted);
    renderFileGroup(elements.execution.changedFiles, "Changed", changedFiles.changed);
  }

  function renderFileGroup(list, labelText, values) {
    const files = listValues(values);

    if (files.length === 0) {
      const item = document.createElement("li");
      item.textContent = `${labelText}: none recorded.`;
      list.replaceChildren(item);
      return;
    }

    list.replaceChildren(
      ...files.map((filePath) => {
        const item = document.createElement("li");
        item.className = "file-row";
        const strong = document.createElement("strong");
        strong.textContent = safeUiText(filePath);
        const span = document.createElement("span");
        span.textContent = labelText;
        item.append(strong, span);
        return item;
      }),
    );
  }

  function renderExecutionValidation(validation) {
    elements.execution.validationStatus.textContent = textValue(validation.label);
    elements.execution.validationStatus.className = `status-pill ${statusClass(validation.status)}`;
    renderList(elements.execution.validationCommands, validation.commands, "Validation commands are UNKNOWN.");

    const results = Array.isArray(validation.results) ? validation.results : [];

    if (results.length === 0) {
      const item = document.createElement("li");
      item.textContent = "Validation results are not available yet.";
      elements.execution.validationResults.replaceChildren(item);
      return;
    }

    elements.execution.validationResults.replaceChildren(
      ...results.map((result) => {
        const item = document.createElement("li");
        item.className = "validation-row";
        const command = document.createElement("strong");
        command.textContent = safeUiText(result.command);
        const meta = document.createElement("span");
        meta.textContent = `${plainStatus(result.status)}. Exit code: ${textValue(result.exitCode)}.`;
        const output = document.createElement("p");
        output.textContent = safeUiText(result.output);
        item.append(command, meta, output);
        return item;
      }),
    );
  }

  function renderExecutionCost(cost) {
    elements.execution.costStatus.textContent = textValue(cost.label);
    elements.execution.costStatus.className = `status-pill ${statusClass(cost.status)}`;
    renderDefinitionRows(elements.execution.costDetails, [
      ["Decision", cost.detail],
      ["Cost class", cost.costClass],
      ["Estimate", cost.estimatedCost],
      ["Ceiling", cost.budgetCeiling],
    ]);
  }

  function renderExecutionRestore(restore) {
    elements.execution.restoreStatus.textContent = textValue(restore.label);
    elements.execution.restoreStatus.className = `status-pill ${statusClass(restore.status)}`;
    elements.execution.restoreDetail.textContent = safeUiText(restore.detail);
    renderList(elements.execution.restoreFiles, restore.files, "Restore files are UNKNOWN.");
  }

  function renderCompletionSummary(completion) {
    elements.execution.completionStatus.textContent = textValue(completion.label);
    elements.execution.completionStatus.className = `status-pill ${statusClass(completion.status)}`;
    renderDefinitionRows(elements.execution.completionDetails, [
      ["Requirement", completion.requirementId],
      ["Summary", completion.summary],
      ["Project Knowledge", completion.memoryUpdated ? "Updated" : "Not recorded"],
    ]);
    renderList(elements.execution.commandsRun, completion.commandsRun, "No completion commands recorded.");
  }

  function renderExecutionHealth(health) {
    elements.execution.healthStatus.textContent = textValue(health.label);
    elements.execution.healthStatus.className = `status-pill ${statusClass(health.status)}`;
    elements.execution.healthSummary.textContent = safeUiText(health.summary);

    const issues = Array.isArray(health.issues) ? health.issues : [];
    const recommendations = Array.isArray(health.recommendations) ? health.recommendations : [];
    renderList(
      elements.execution.healthIssues,
      issues.length > 0 ? issues.map((issue) => `${safeUiText(issue.label)} ${safeUiText(issue.detail)}`) : recommendations.map((recommendation) => `${safeUiText(recommendation.action)} ${safeUiText(recommendation.reason)}`),
      "Project Health details are UNKNOWN for this result.",
    );
  }

  function renderExecutionActions(actions) {
    const secondary = Array.isArray(actions.secondary) ? actions.secondary : [];
    elements.execution.secondaryActions.replaceChildren(
      ...secondary.map((action) => {
        const link = document.createElement("a");
        link.className = "secondary-action";
        link.href = action.enabled === false ? "#execution-progress" : safeHref(action.href);
        link.textContent = safeUiText(action.label);

        if (action.enabled === false) {
          link.setAttribute("aria-disabled", "true");
          link.classList.add("disabled");
        }

        return link;
      }),
    );
  }

  function renderProjectHealth(health) {
    state.health = health;
    updateProjectLabels(health.project);

    if (health.status === "ERROR") {
      showProjectHealthError(health.error && health.error.detail ? health.error.detail : health.summary);
      return;
    }

    if (health.status === "EMPTY") {
      showProjectHealthEmpty(health);
      return;
    }

    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.dashboard.hidden = true;
    elements.plan.section.hidden = true;
    elements.execution.section.hidden = true;
    elements.projectHealth.section.hidden = false;
    elements.projectHealth.loading.hidden = true;
    elements.projectHealth.error.hidden = true;
    elements.projectHealth.empty.hidden = true;
    elements.projectHealth.content.hidden = false;
    elements.footerStatus.textContent = textValue(health.readiness && health.readiness.label);

    elements.projectHealth.projectName.textContent = textValue(health.project && health.project.name);
    elements.projectHealth.headline.textContent = safeUiText(health.headline);
    elements.projectHealth.statusBadge.textContent = plainStatus(health.status);
    elements.projectHealth.statusBadge.className = `status-pill ${statusClass(health.status)}`;
    elements.projectHealth.summary.textContent = safeUiText(health.summary);
    elements.projectHealth.readinessLabel.textContent = textValue(health.readiness && health.readiness.label);
    elements.projectHealth.readinessDetail.textContent = safeUiText(health.readiness && health.readiness.detail);
    elements.projectHealth.primaryAction.textContent = safeUiText(health.actions && health.actions.primary && health.actions.primary.label);

    renderProjectHealthCounts(health.counts || {});
    renderKnownProblems(health.knownProblems || []);
    renderProjectHealthCards(health.cards || []);
    renderHealthRecommendationGroups(health.recommendations || []);
    renderHealthEvidenceReferences(health.evidenceReferences || []);
  }

  function renderProjectHealthCounts(counts) {
    const rows = [
      ["Healthy", counts.healthy],
      ["Attention", counts.attention],
      ["Blocked", counts.blocked],
      ["Unknown", counts.unknown],
    ];

    elements.projectHealth.counts.replaceChildren(
      ...rows.map(([labelText, value]) => {
        const item = document.createElement("article");
        item.className = "health-count";
        const number = document.createElement("strong");
        number.textContent = textValue(value);
        const label = document.createElement("span");
        label.textContent = labelText;
        item.append(number, label);
        return item;
      }),
    );
  }

  function renderKnownProblems(problems) {
    const items = Array.isArray(problems) ? problems : [];

    if (items.length === 0) {
      const item = document.createElement("li");
      item.textContent = "No known problems are recorded.";
      elements.projectHealth.knownProblems.replaceChildren(item);
      return;
    }

    elements.projectHealth.knownProblems.replaceChildren(
      ...items.map((problem) => {
        const item = document.createElement("li");
        item.className = "health-problem-row";
        const badge = document.createElement("span");
        badge.className = `status-pill ${statusClass(problem.status)}`;
        badge.textContent = plainStatus(problem.status);
        const body = document.createElement("div");
        const title = document.createElement("strong");
        title.textContent = safeUiText(problem.label);
        const detail = document.createElement("span");
        detail.textContent = safeUiText(problem.detail);
        body.append(title, detail);
        item.append(badge, body);
        return item;
      }),
    );
  }

  function renderProjectHealthCards(cards) {
    elements.projectHealth.cards.replaceChildren(
      ...cards.map((card) => {
        const article = document.createElement("article");
        article.className = "health-card";

        const header = document.createElement("div");
        header.className = "health-card-header";
        const heading = document.createElement("div");
        const eyebrow = document.createElement("p");
        eyebrow.className = "eyebrow";
        eyebrow.textContent = safeUiText(card.subtitle);
        const title = document.createElement("h3");
        title.textContent = textValue(card.title);
        heading.append(eyebrow, title);
        const status = document.createElement("span");
        status.className = `status-pill ${statusClass(card.status)}`;
        status.textContent = plainStatus(card.status);
        header.append(heading, status);

        const explanation = document.createElement("p");
        explanation.className = "health-card-copy";
        explanation.textContent = safeUiText(card.explanation);

        const evidence = document.createElement("ul");
        evidence.className = "plain-list compact-list";
        renderInlineList(evidence, card.evidenceSummary, "Evidence is UNKNOWN.");

        const details = document.createElement("details");
        details.className = "health-details";
        const summary = document.createElement("summary");
        summary.textContent = "Details";
        const signalList = document.createElement("ul");
        signalList.className = "plain-list compact-list";
        renderHealthSignals(signalList, card.signals);
        details.append(summary, signalList);

        article.append(header, explanation, evidence, details);
        return article;
      }),
    );
  }

  function renderInlineList(list, values, emptyText) {
    const items = listValues(values);

    if (items.length === 0) {
      const item = document.createElement("li");
      item.textContent = emptyText;
      list.replaceChildren(item);
      return;
    }

    list.replaceChildren(
      ...items.map((value) => {
        const item = document.createElement("li");
        item.textContent = safeUiText(value);
        return item;
      }),
    );
  }

  function renderHealthSignals(list, signals) {
    const items = Array.isArray(signals) ? signals : [];

    if (items.length === 0) {
      const item = document.createElement("li");
      item.textContent = "Signal evidence is UNKNOWN.";
      list.replaceChildren(item);
      return;
    }

    list.replaceChildren(
      ...items.map((signal) => {
        const item = document.createElement("li");
        const title = document.createElement("strong");
        title.textContent = `${safeUiText(signal.label)} - ${plainStatus(signal.status)}`;
        const detail = document.createElement("span");
        detail.textContent = ` ${safeUiText(signal.detail)}`;
        item.append(title, detail);

        const evidence = Array.isArray(signal.evidence) ? signal.evidence.map((entry) => entry.text) : [];
        if (evidence.length > 0) {
          const evidenceList = document.createElement("ul");
          evidenceList.className = "plain-list compact-list";
          renderInlineList(evidenceList, evidence, "Evidence is UNKNOWN.");
          item.append(evidenceList);
        }

        if (textValue(signal.timestamp) !== UNKNOWN) {
          const timestamp = document.createElement("p");
          timestamp.className = "muted";
          timestamp.textContent = `Timestamp: ${safeUiText(signal.timestamp)}`;
          item.append(timestamp);
        }

        return item;
      }),
    );
  }

  function renderHealthRecommendationGroups(groups) {
    const priorities = Array.isArray(groups) ? groups : [];

    elements.projectHealth.recommendationGroups.replaceChildren(
      ...priorities.map((group) => {
        const section = document.createElement("section");
        section.className = "recommendation-group";
        const heading = document.createElement("h3");
        heading.textContent = safeUiText(group.label || group.priority);
        section.append(heading);

        const items = Array.isArray(group.items) ? group.items : [];
        if (items.length === 0) {
          const empty = document.createElement("p");
          empty.className = "muted";
          empty.textContent = `No ${safeUiText(group.label || group.priority).toLowerCase()} recommendations.`;
          section.append(empty);
          return section;
        }

        section.append(...items.map(recommendationElement));
        return section;
      }),
    );
  }

  function recommendationElement(recommendation) {
    const details = document.createElement("details");
    details.className = "recommendation-item";
    const summary = document.createElement("summary");
    const body = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = safeUiText(recommendation.title);
    const reason = document.createElement("span");
    reason.textContent = safeUiText(recommendation.reason);
    body.append(title, reason);
    summary.append(body);

    const action = document.createElement("p");
    action.className = "recommendation-action";
    action.textContent = safeUiText(recommendation.action);

    const meta = document.createElement("dl");
    meta.className = "details-grid compact";
    renderDefinitionRows(meta, [
      ["Related signals", recommendation.relatedSignalIds],
      ["Timestamp", recommendation.timestamp],
    ]);

    const evidence = document.createElement("ul");
    evidence.className = "plain-list compact-list";
    renderInlineList(
      evidence,
      Array.isArray(recommendation.supportingEvidence) ? recommendation.supportingEvidence.map((entry) => entry.text) : [],
      "Supporting evidence is UNKNOWN.",
    );

    details.append(summary, action, meta, evidence);
    return details;
  }

  function renderHealthEvidenceReferences(references) {
    const items = Array.isArray(references) ? references.map((reference) => reference.text) : [];
    renderInlineList(elements.projectHealth.evidenceReferences, items, "Evidence references are UNKNOWN.");
  }

  function updateProjectLabels(project) {
    const projectName = textValue(project && project.name);
    elements.topProjectName.textContent = projectName;
    elements.projectOption.textContent = projectName === UNKNOWN ? "Current project" : projectName;
  }

  function showPlanLoading() {
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.dashboard.hidden = true;
    elements.execution.section.hidden = true;
    elements.projectHealth.section.hidden = true;
    elements.plan.section.hidden = false;
    elements.plan.loading.hidden = false;
    elements.plan.error.hidden = true;
    elements.plan.empty.hidden = true;
    elements.plan.content.hidden = true;
    elements.footerStatus.textContent = "Reviewing plan";
  }

  function showPlanError(message) {
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.dashboard.hidden = true;
    elements.execution.section.hidden = true;
    elements.projectHealth.section.hidden = true;
    elements.plan.section.hidden = false;
    elements.plan.loading.hidden = true;
    elements.plan.error.hidden = false;
    elements.plan.empty.hidden = true;
    elements.plan.content.hidden = true;
    elements.plan.errorMessage.textContent = safeUiText(message);
    elements.footerStatus.textContent = "Blocked";
  }

  function showPlanEmpty(plan) {
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.dashboard.hidden = true;
    elements.execution.section.hidden = true;
    elements.projectHealth.section.hidden = true;
    elements.plan.section.hidden = false;
    elements.plan.loading.hidden = true;
    elements.plan.error.hidden = true;
    elements.plan.empty.hidden = false;
    elements.plan.content.hidden = true;
    elements.plan.emptyProject.textContent = textValue(plan.project && plan.project.name);
    elements.plan.emptyMessage.textContent = safeUiText(plan.summary && plan.summary[0]);
    elements.footerStatus.textContent = "No plan";
  }

  function showHomeFromState() {
    elements.plan.section.hidden = true;
    elements.execution.section.hidden = true;
    elements.projectHealth.section.hidden = true;

    if (!state.dashboard) {
      showLoading();
      return;
    }

    if (state.dashboard.status === "ERROR") {
      showError(state.dashboard.error && state.dashboard.error.detail ? state.dashboard.error.detail : "Project needs attention.");
      return;
    }

    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.dashboard.hidden = false;
    elements.footerStatus.textContent = state.dashboard.readyToWork ? "Ready" : "Needs attention";
  }

  function showLoading() {
    elements.loading.hidden = false;
    elements.error.hidden = true;
    elements.dashboard.hidden = true;
    elements.plan.section.hidden = true;
    elements.execution.section.hidden = true;
    elements.projectHealth.section.hidden = true;
    elements.footerStatus.textContent = "Checking project";
  }

  function showError(message) {
    elements.loading.hidden = true;
    elements.error.hidden = false;
    elements.dashboard.hidden = true;
    elements.plan.section.hidden = true;
    elements.execution.section.hidden = true;
    elements.projectHealth.section.hidden = true;
    elements.topProjectName.textContent = "Project blocked";
    elements.errorMessage.textContent = safeUiText(message);
    elements.footerStatus.textContent = "Blocked";
  }

  function showExecutionLoading() {
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.dashboard.hidden = true;
    elements.plan.section.hidden = true;
    elements.execution.section.hidden = false;
    elements.projectHealth.section.hidden = true;
    elements.execution.loading.hidden = false;
    elements.execution.error.hidden = true;
    elements.execution.empty.hidden = true;
    elements.execution.content.hidden = true;
    elements.footerStatus.textContent = "Loading execution";
  }

  function showExecutionError(message) {
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.dashboard.hidden = true;
    elements.plan.section.hidden = true;
    elements.execution.section.hidden = false;
    elements.projectHealth.section.hidden = true;
    elements.execution.loading.hidden = true;
    elements.execution.error.hidden = false;
    elements.execution.empty.hidden = true;
    elements.execution.content.hidden = true;
    elements.execution.errorMessage.textContent = safeUiText(message);
    elements.footerStatus.textContent = "Blocked";
  }

  function showExecutionEmpty(execution) {
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.dashboard.hidden = true;
    elements.plan.section.hidden = true;
    elements.execution.section.hidden = false;
    elements.projectHealth.section.hidden = true;
    elements.execution.loading.hidden = true;
    elements.execution.error.hidden = true;
    elements.execution.empty.hidden = false;
    elements.execution.content.hidden = true;
    elements.execution.emptyProject.textContent = textValue(execution.project && execution.project.name);
    elements.execution.emptyMessage.textContent = safeUiText(execution.summary);
    elements.footerStatus.textContent = "No execution";
  }

  function showProjectHealthLoading() {
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.dashboard.hidden = true;
    elements.plan.section.hidden = true;
    elements.execution.section.hidden = true;
    elements.projectHealth.section.hidden = false;
    elements.projectHealth.loading.hidden = false;
    elements.projectHealth.error.hidden = true;
    elements.projectHealth.empty.hidden = true;
    elements.projectHealth.content.hidden = true;
    elements.footerStatus.textContent = "Loading health";
  }

  function showProjectHealthError(message) {
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.dashboard.hidden = true;
    elements.plan.section.hidden = true;
    elements.execution.section.hidden = true;
    elements.projectHealth.section.hidden = false;
    elements.projectHealth.loading.hidden = true;
    elements.projectHealth.error.hidden = false;
    elements.projectHealth.empty.hidden = true;
    elements.projectHealth.content.hidden = true;
    elements.projectHealth.errorMessage.textContent = safeUiText(message);
    elements.footerStatus.textContent = "Blocked";
  }

  function showProjectHealthEmpty(health) {
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.dashboard.hidden = true;
    elements.plan.section.hidden = true;
    elements.execution.section.hidden = true;
    elements.projectHealth.section.hidden = false;
    elements.projectHealth.loading.hidden = true;
    elements.projectHealth.error.hidden = true;
    elements.projectHealth.empty.hidden = false;
    elements.projectHealth.content.hidden = true;
    elements.projectHealth.emptyProject.textContent = textValue(health.project && health.project.name);
    elements.projectHealth.emptyMessage.textContent = safeUiText(health.summary);
    elements.footerStatus.textContent = "No health evidence";
  }

  function appendResultLine(list, labelText, value) {
    const label = document.createElement("dt");
    label.textContent = labelText;
    const detail = document.createElement("dd");
    detail.textContent = safeUiText(value);
    list.append(label, detail);
  }

  function renderDefinitionRows(list, rows) {
    list.replaceChildren(
      ...rows.flatMap(([labelText, value]) => {
        const label = document.createElement("dt");
        label.textContent = labelText;
        const detail = document.createElement("dd");
        detail.textContent = safeUiText(value);
        return [label, detail];
      }),
    );
  }

  function renderList(list, values, emptyText) {
    const items = listValues(values);

    if (items.length === 0) {
      const item = document.createElement("li");
      item.textContent = emptyText;
      list.replaceChildren(item);
      return;
    }

    list.replaceChildren(
      ...items.map((value) => {
        const item = document.createElement("li");
        item.textContent = safeUiText(value);
        return item;
      }),
    );
  }

  function renderCountRow(container, counts) {
    const items = [
      ["Create", counts && counts.create],
      ["Update", counts && counts.update],
      ["Delete", counts && counts.delete],
    ];

    container.replaceChildren(
      ...items.map(([labelText, value]) => {
        const item = document.createElement("article");
        item.className = "count-chip";
        const valueElement = document.createElement("strong");
        valueElement.textContent = textValue(value);
        const label = document.createElement("span");
        label.textContent = labelText;
        item.append(valueElement, label);
        return item;
      }),
    );
  }

  function renderFileList(list, files) {
    const plannedFiles = Array.isArray(files) ? files : [];

    if (plannedFiles.length === 0) {
      const item = document.createElement("li");
      item.textContent = "Planned files are UNKNOWN.";
      list.replaceChildren(item);
      return;
    }

    list.replaceChildren(
      ...plannedFiles.map((file) => {
        const item = document.createElement("li");
        const path = document.createElement("strong");
        path.textContent = safeUiText(file.path);
        const action = document.createElement("span");
        action.textContent = safeUiText(file.action);
        item.className = file.destructive ? "file-row warning" : "file-row";
        item.append(path, action);
        return item;
      }),
    );
  }

  function renderCost(cost) {
    elements.plan.costStatus.textContent = textValue(cost.label);
    elements.plan.costStatus.className = `status-pill ${statusClass(cost.status)}`;
    renderDefinitionRows(elements.plan.costDetails, [
      ["Decision", cost.detail],
      ["Cost class", cost.costClass],
      ["Estimate", cost.estimatedCost],
      ["Ceiling", cost.budgetCeiling],
      ["Cost approval", cost.approved ? "Approved" : cost.approvalRequired ? "Required" : "Not required"],
    ]);
  }

  function renderRestore(restore) {
    elements.plan.restoreStatus.textContent = textValue(restore.label);
    elements.plan.restoreStatus.className = `status-pill ${statusClass(restore.status)}`;
    elements.plan.restoreDetail.textContent = safeUiText(restore.detail);
  }

  function renderDecisions(decisions) {
    elements.plan.decisionStatus.textContent = textValue(decisions.label);
    elements.plan.decisionStatus.className = `status-pill ${statusClass(decisions.status)}`;
    elements.plan.decisionReason.textContent = safeUiText(decisions.reason);
    renderList(elements.plan.decisionConstraints, decisions.constraints, "No Project Decision constraints are attached.");

    const decisionRows = Array.isArray(decisions.decisions) ? decisions.decisions : [];
    elements.plan.decisionDetails.replaceChildren(
      ...decisionRows.map((decision) => {
        const item = document.createElement("li");
        const title = document.createElement("strong");
        title.textContent = safeUiText(decision.category);
        const detail = document.createElement("span");
        detail.textContent = ` ${safeUiText(decision.statement)}`;
        item.append(title, detail);
        return item;
      }),
    );

    if (decisionRows.length === 0) {
      const item = document.createElement("li");
      item.textContent = "No active Project Decision details.";
      elements.plan.decisionDetails.replaceChildren(item);
    }
  }

  function renderContextEvidence(contextEvidence) {
    renderList(elements.plan.contextFiles, contextEvidence.selectedFiles, "Selected files are UNKNOWN.");
    renderList(elements.plan.contextEvidence, contextEvidence.fileEvidence, "File evidence is UNKNOWN.");
    renderList(elements.plan.contextFacts, contextEvidence.verifiedFacts, "Verified project facts are UNKNOWN.");
    renderList(elements.plan.contextKnowledge, contextEvidence.projectKnowledge, "Project Knowledge evidence is UNKNOWN.");
    elements.plan.contextBudget.textContent = safeUiText(contextEvidence.budget);
  }

  function renderRisks(risks) {
    elements.plan.riskStatus.textContent = risks.status === "CLEAR" ? "Clear" : "Needs attention";
    elements.plan.riskStatus.className = `status-pill ${statusClass(risks.status)}`;
    renderList(elements.plan.riskList, risks.risks, "Risks are UNKNOWN.");
    renderList(elements.plan.blockerList, risks.blockers, "No blockers reported by Levi Core.");
  }

  function renderDestructive(destructive) {
    elements.plan.destructiveWarning.hidden = !destructive.required;
    elements.plan.destructiveStatus.textContent = textValue(destructive.label);
    elements.plan.destructiveStatus.className = `status-pill ${statusClass(destructive.status)}`;
    renderList(elements.plan.destructiveActions, destructive.actions, "No destructive actions are planned.");
  }

  function renderConfirmations(plan) {
    const required = Array.isArray(plan.actions && plan.actions.requiredConfirmations)
      ? plan.actions.requiredConfirmations
      : [];

    elements.plan.confirmations.hidden = required.length === 0;
    elements.plan.destructiveConfirmationRow.hidden = !required.includes("destructiveConfirmed");
    elements.plan.costConfirmationRow.hidden = !required.includes("costApproved");
    elements.plan.destructiveCheckbox.checked = false;
    elements.plan.costCheckbox.checked = false;
  }

  function renderSubmitResult(result) {
    if (!result) {
      elements.plan.submitResult.hidden = true;
      elements.plan.submitResult.textContent = "";
      return;
    }

    elements.plan.submitResult.hidden = false;
    elements.plan.submitResult.className = `result-panel ${statusClass(result.status)}`;
    elements.plan.submitResult.textContent = safeUiText(result.message || result.status);
  }

  function updatePlanApproveState() {
    const plan = state.plan;

    if (!plan || !plan.actions) {
      elements.plan.approveButton.disabled = true;
      elements.plan.approveButton.textContent = "Approve";
      return;
    }

    const required = Array.isArray(plan.actions.requiredConfirmations) ? plan.actions.requiredConfirmations : [];
    const missingDestructive = required.includes("destructiveConfirmed") && !elements.plan.destructiveCheckbox.checked;
    const missingCost = required.includes("costApproved") && !elements.plan.costCheckbox.checked;
    const blocked = !plan.actions.canApprove || missingDestructive || missingCost;

    elements.plan.approveButton.disabled = blocked;
    elements.plan.approveButton.textContent = textValue(plan.actions.primaryLabel);
  }

  function createProjectHealthScreen() {
    const section = document.createElement("section");
    section.id = "project-health-screen";
    section.className = "health-screen dashboard";
    section.hidden = true;
    section.setAttribute("aria-labelledby", "health-heading");
    section.innerHTML = [
      '<section class="state-panel" data-health-loading aria-live="polite">',
      '<p class="state-kicker">Project Health</p>',
      "<h2>Loading Project Health</h2>",
      "<p>Levi is reading recorded health signals and recommendations.</p>",
      "</section>",
      '<section class="state-panel danger" data-health-error hidden>',
      '<p class="state-kicker">Blocked</p>',
      "<h2>Project Health needs attention</h2>",
      '<p data-health-error-message>Levi could not read Project Health.</p>',
      "</section>",
      '<section class="state-panel" data-health-empty hidden>',
      '<p class="state-kicker">Project Health</p>',
      "<h2>No Project Health evidence</h2>",
      '<p><strong data-health-empty-project>Current project</strong></p>',
      '<p data-health-empty-message>Project Health evidence is not available yet.</p>',
      '<a class="secondary-action" href="#home">Return Home</a>',
      "</section>",
      '<div class="health-content" data-health-content hidden>',
      '<section class="project-strip plan-project-strip">',
      "<div>",
      '<p class="eyebrow">Selected project</p>',
      '<h2 data-health-project-name>Current project</h2>',
      "</div>",
      '<span class="status-pill unknown" data-health-status>Unknown</span>',
      "</section>",
      '<section class="approval-panel health-hero" aria-labelledby="health-heading">',
      "<div>",
      '<p class="eyebrow">Project Health</p>',
      '<h2 id="health-heading" data-health-headline>Project health is unknown</h2>',
      '<p class="health-readiness" data-health-readiness-label>Needs Evidence</p>',
      '<p class="project-context" data-health-summary>Project Health evidence is UNKNOWN.</p>',
      '<p class="project-context" data-health-readiness-detail>Gather missing evidence before relying on Project Health.</p>',
      "</div>",
      '<div class="approval-actions">',
      '<button class="primary-action" type="button" data-health-primary>Review Evidence</button>',
      "</div>",
      "</section>",
      '<section class="health-count-row" data-health-counts aria-label="Project Health signal counts"></section>',
      '<section class="section-panel plan-section">',
      '<div class="section-heading"><p class="eyebrow">Attention</p><h2>What needs attention</h2></div>',
      '<ul class="plain-list" data-health-known-problems></ul>',
      "</section>",
      '<section class="section-panel plan-section">',
      '<div class="section-heading"><p class="eyebrow">Signals</p><h2>Daily health cards</h2></div>',
      '<div class="health-card-grid" data-health-cards></div>',
      "</section>",
      '<section id="health-recommendations" class="section-panel plan-section" data-health-recommendations>',
      '<div class="section-heading"><p class="eyebrow">Recommendations</p><h2>What to do next</h2></div>',
      '<div class="recommendation-groups" data-health-recommendation-groups></div>',
      "</section>",
      '<details class="disclosure-panel">',
      '<summary><span><span class="eyebrow">Evidence</span><strong>Supporting evidence</strong></span></summary>',
      '<ul class="plain-list compact-list" data-health-evidence></ul>',
      "</details>",
      "</div>",
    ].join("");

    return {
      section,
      loading: section.querySelector("[data-health-loading]"),
      error: section.querySelector("[data-health-error]"),
      errorMessage: section.querySelector("[data-health-error-message]"),
      empty: section.querySelector("[data-health-empty]"),
      emptyProject: section.querySelector("[data-health-empty-project]"),
      emptyMessage: section.querySelector("[data-health-empty-message]"),
      content: section.querySelector("[data-health-content]"),
      projectName: section.querySelector("[data-health-project-name]"),
      statusBadge: section.querySelector("[data-health-status]"),
      headline: section.querySelector("[data-health-headline]"),
      readinessLabel: section.querySelector("[data-health-readiness-label]"),
      summary: section.querySelector("[data-health-summary]"),
      readinessDetail: section.querySelector("[data-health-readiness-detail]"),
      primaryAction: section.querySelector("[data-health-primary]"),
      counts: section.querySelector("[data-health-counts]"),
      knownProblems: section.querySelector("[data-health-known-problems]"),
      cards: section.querySelector("[data-health-cards]"),
      recommendations: section.querySelector("[data-health-recommendations]"),
      recommendationGroups: section.querySelector("[data-health-recommendation-groups]"),
      evidenceReferences: section.querySelector("[data-health-evidence]"),
    };
  }

  function createExecutionScreen() {
    const section = document.createElement("section");
    section.id = "execution-progress";
    section.className = "execution-screen dashboard";
    section.hidden = true;
    section.setAttribute("aria-labelledby", "execution-heading");
    section.innerHTML = [
      '<section class="state-panel" data-execution-loading aria-live="polite">',
      '<p class="state-kicker">Execution</p>',
      "<h2>Loading execution details</h2>",
      "<p>Levi is reading recorded workflow progress.</p>",
      "</section>",
      '<section class="state-panel danger" data-execution-error hidden>',
      '<p class="state-kicker">Blocked</p>',
      "<h2>Execution needs attention</h2>",
      '<p data-execution-error-message>Levi could not read execution state.</p>',
      "</section>",
      '<section class="state-panel" data-execution-empty hidden>',
      '<p class="state-kicker">Execution</p>',
      "<h2>No execution history</h2>",
      '<p><strong data-execution-empty-project>Current project</strong></p>',
      '<p data-execution-empty-message>No execution history is available.</p>',
      '<a class="secondary-action" href="#plan-approval">Review Plan</a>',
      "</section>",
      '<div class="execution-content" data-execution-content hidden>',
      '<section class="project-strip plan-project-strip">',
      "<div>",
      '<p class="eyebrow">Selected project</p>',
      '<h2 data-execution-project-name>Current project</h2>',
      "</div>",
      '<span class="status-pill unknown" data-execution-status>Unknown</span>',
      "</section>",
      '<section class="approval-panel execution-hero" aria-labelledby="execution-heading">',
      "<div>",
      '<p class="eyebrow">Execution progress</p>',
      '<h2 id="execution-heading" data-execution-headline>Execution</h2>',
      '<p class="project-context" data-execution-objective>UNKNOWN</p>',
      '<p class="project-context" data-execution-summary>Execution evidence is UNKNOWN.</p>',
      '<dl class="details-grid compact"><dt>Current step</dt><dd data-execution-current-step>UNKNOWN</dd></dl>',
      '<p class="result-panel blocked" data-execution-failure hidden></p>',
      "</div>",
      '<div class="approval-actions">',
      '<button class="primary-action" type="button" data-execution-primary>Review Plan</button>',
      "</div>",
      '<div class="secondary-actions" data-execution-secondary></div>',
      "</section>",
      '<section class="section-panel plan-section">',
      '<div class="section-heading"><p class="eyebrow">Progress</p><h2>Workflow steps</h2></div>',
      '<ol class="execution-timeline" data-execution-timeline></ol>',
      "</section>",
      '<section id="execution-changes" class="section-panel plan-section">',
      '<div class="section-heading"><p class="eyebrow">Changes</p><h2>Changed files</h2></div>',
      '<section class="count-row" data-execution-change-counts aria-label="Changed file counts"></section>',
      '<details class="disclosure-panel nested-disclosure" open><summary><span><span class="eyebrow">Files</span><strong>Created</strong></span></summary><ul class="file-list" data-execution-created></ul></details>',
      '<details class="disclosure-panel nested-disclosure" open><summary><span><span class="eyebrow">Files</span><strong>Updated</strong></span></summary><ul class="file-list" data-execution-updated></ul></details>',
      '<details class="disclosure-panel nested-disclosure"><summary><span><span class="eyebrow">Files</span><strong>Deleted</strong></span></summary><ul class="file-list" data-execution-deleted></ul></details>',
      '<details class="disclosure-panel nested-disclosure"><summary><span><span class="eyebrow">Files</span><strong>Changed</strong></span></summary><ul class="file-list" data-execution-changed></ul></details>',
      "</section>",
      '<section class="status-grid">',
      '<article class="section-panel plan-section">',
      '<div class="section-heading inline-heading"><div><p class="eyebrow">Cost</p><h2>Cost result</h2></div><span class="status-pill unknown" data-execution-cost-status>Unknown</span></div>',
      '<dl class="details-grid" data-execution-cost-details></dl>',
      "</article>",
      '<article class="section-panel plan-section">',
      '<div class="section-heading inline-heading"><div><p class="eyebrow">Restore</p><h2>Restore point</h2></div><span class="status-pill unknown" data-execution-restore-status>Unknown</span></div>',
      '<p class="muted" data-execution-restore-detail>Restore state is UNKNOWN.</p>',
      '<ul class="plain-list" data-execution-restore-files></ul>',
      "</article>",
      "</section>",
      '<section class="section-panel plan-section">',
      '<div class="section-heading inline-heading"><div><p class="eyebrow">Validation</p><h2>Validation results</h2></div><span class="status-pill unknown" data-execution-validation-status>Unknown</span></div>',
      '<h3>Commands</h3><ul class="plain-list command-list" data-execution-validation-commands></ul>',
      '<h3>Results</h3><ul class="plain-list validation-list" data-execution-validation-results></ul>',
      "</section>",
      '<section id="completion-result" class="section-panel plan-section">',
      '<div class="section-heading inline-heading"><div><p class="eyebrow">Completion</p><h2>Completion result</h2></div><span class="status-pill unknown" data-completion-status>Unknown</span></div>',
      '<dl class="details-grid" data-completion-details></dl>',
      '<h3>Commands run</h3><ul class="plain-list command-list" data-completion-commands></ul>',
      "</section>",
      '<details class="disclosure-panel" open>',
      '<summary><span><span class="eyebrow">Attention</span><strong>Warnings and remaining work</strong></span></summary>',
      '<h3>Warnings</h3><ul class="plain-list" data-execution-warnings></ul>',
      '<h3>Known failures</h3><ul class="plain-list" data-execution-known-failures></ul>',
      '<h3>Remaining work</h3><ul class="plain-list" data-execution-remaining-work></ul>',
      "</details>",
      '<details class="disclosure-panel">',
      '<summary><span><span class="eyebrow">Health</span><strong>Project Health summary</strong></span><span class="status-pill unknown" data-execution-health-status>Unknown</span></summary>',
      '<p data-execution-health-summary>Project Health summary is UNKNOWN.</p>',
      '<ul class="plain-list" data-execution-health-issues></ul>',
      "</details>",
      "</div>",
    ].join("");

    return {
      section,
      loading: section.querySelector("[data-execution-loading]"),
      error: section.querySelector("[data-execution-error]"),
      errorMessage: section.querySelector("[data-execution-error-message]"),
      empty: section.querySelector("[data-execution-empty]"),
      emptyProject: section.querySelector("[data-execution-empty-project]"),
      emptyMessage: section.querySelector("[data-execution-empty-message]"),
      content: section.querySelector("[data-execution-content]"),
      projectName: section.querySelector("[data-execution-project-name]"),
      statusBadge: section.querySelector("[data-execution-status]"),
      headline: section.querySelector("[data-execution-headline]"),
      objective: section.querySelector("[data-execution-objective]"),
      summary: section.querySelector("[data-execution-summary]"),
      currentStep: section.querySelector("[data-execution-current-step]"),
      failure: section.querySelector("[data-execution-failure]"),
      primaryAction: section.querySelector("[data-execution-primary]"),
      secondaryActions: section.querySelector("[data-execution-secondary]"),
      timeline: section.querySelector("[data-execution-timeline]"),
      changeCounts: section.querySelector("[data-execution-change-counts]"),
      createdFiles: section.querySelector("[data-execution-created]"),
      updatedFiles: section.querySelector("[data-execution-updated]"),
      deletedFiles: section.querySelector("[data-execution-deleted]"),
      changedFiles: section.querySelector("[data-execution-changed]"),
      costStatus: section.querySelector("[data-execution-cost-status]"),
      costDetails: section.querySelector("[data-execution-cost-details]"),
      restoreStatus: section.querySelector("[data-execution-restore-status]"),
      restoreDetail: section.querySelector("[data-execution-restore-detail]"),
      restoreFiles: section.querySelector("[data-execution-restore-files]"),
      validationStatus: section.querySelector("[data-execution-validation-status]"),
      validationCommands: section.querySelector("[data-execution-validation-commands]"),
      validationResults: section.querySelector("[data-execution-validation-results]"),
      completionStatus: section.querySelector("[data-completion-status]"),
      completionDetails: section.querySelector("[data-completion-details]"),
      commandsRun: section.querySelector("[data-completion-commands]"),
      warnings: section.querySelector("[data-execution-warnings]"),
      knownFailures: section.querySelector("[data-execution-known-failures]"),
      remainingWork: section.querySelector("[data-execution-remaining-work]"),
      healthStatus: section.querySelector("[data-execution-health-status]"),
      healthSummary: section.querySelector("[data-execution-health-summary]"),
      healthIssues: section.querySelector("[data-execution-health-issues]"),
    };
  }

  function createPlanScreen() {
    const section = document.createElement("section");
    section.id = "plan-approval";
    section.className = "plan-screen dashboard";
    section.hidden = true;
    section.setAttribute("aria-labelledby", "plan-heading");
    section.innerHTML = [
      '<section class="state-panel" data-plan-loading aria-live="polite">',
      '<p class="state-kicker">Reviewing plan</p>',
      "<h2>Loading approval details</h2>",
      "<p>Levi is preparing the bounded plan review.</p>",
      "</section>",
      '<section class="state-panel danger" data-plan-error hidden>',
      '<p class="state-kicker">Blocked</p>',
      "<h2>Plan needs attention</h2>",
      '<p data-plan-error-message>Levi could not read the current plan.</p>',
      "</section>",
      '<section class="state-panel" data-plan-empty hidden>',
      '<p class="state-kicker">Plan approval</p>',
      "<h2>No plan ready for approval</h2>",
      '<p><strong data-plan-empty-project>Current project</strong></p>',
      '<p data-plan-empty-message>Create a plan from Home before approving work.</p>',
      '<a class="secondary-action" href="#new-task">Edit Request</a>',
      "</section>",
      '<div class="plan-content" data-plan-content hidden>',
      '<section class="project-strip plan-project-strip">',
      "<div>",
      '<p class="eyebrow">Selected project</p>',
      '<h2 data-plan-project-name>Current project</h2>',
      "</div>",
      '<span class="status-pill unknown" data-plan-approval-status>Unknown</span>',
      "</section>",
      '<section class="approval-panel" aria-labelledby="plan-heading">',
      "<div>",
      '<p class="eyebrow">Plan approval</p>',
      '<h2 id="plan-heading" data-plan-objective>UNKNOWN</h2>',
      '<p class="project-context" data-plan-next-action>Review the plan before approval.</p>',
      '<dl class="details-grid compact" data-plan-meta></dl>',
      "</div>",
      '<div class="approval-actions">',
      '<button class="primary-action" type="button" data-plan-approve>Approve</button>',
      '<a class="secondary-action" href="#new-task" data-plan-edit>Edit Request</a>',
      "</div>",
      '<div class="result-panel" data-plan-submit-result hidden></div>',
      '<div class="confirmation-panel" data-plan-confirmations hidden>',
      '<label data-destructive-confirmation-row><input type="checkbox" data-destructive-confirmed> Confirm destructive actions separately.</label>',
      '<label data-cost-confirmation-row><input type="checkbox" data-cost-approved> Approve the cost decision separately.</label>',
      "</div>",
      '<h3 class="subsection-title">What Levi will do</h3>',
      '<ul class="plain-list summary-list" data-plan-summary></ul>',
      "</section>",
      '<section class="count-row" data-plan-counts aria-label="Operation counts"></section>',
      '<section class="section-panel plan-section">',
      '<div class="section-heading"><p class="eyebrow">Files</p><h2>Planned files</h2></div>',
      '<ul class="file-list" data-plan-files></ul>',
      "</section>",
      '<section class="section-panel plan-section">',
      '<div class="section-heading"><p class="eyebrow">Validation</p><h2>Validation commands</h2></div>',
      '<ul class="plain-list command-list" data-plan-validation></ul>',
      "</section>",
      '<section class="status-grid">',
      '<article class="section-panel plan-section">',
      '<div class="section-heading inline-heading"><div><p class="eyebrow">Cost</p><h2>Cost decision</h2></div><span class="status-pill unknown" data-plan-cost-status>Unknown</span></div>',
      '<dl class="details-grid" data-plan-cost-details></dl>',
      "</article>",
      '<article class="section-panel plan-section">',
      '<div class="section-heading inline-heading"><div><p class="eyebrow">Restore</p><h2>Restore point</h2></div><span class="status-pill unknown" data-plan-restore-status>Unknown</span></div>',
      '<p class="muted" data-plan-restore-detail>Restore evidence is UNKNOWN.</p>',
      "</article>",
      "</section>",
      '<section class="section-panel plan-section warning-panel" data-destructive-warning hidden>',
      '<div class="section-heading inline-heading"><div><p class="eyebrow">Safety</p><h2>Destructive actions</h2></div><span class="status-pill attention" data-plan-destructive-status>Required</span></div>',
      '<ul class="plain-list" data-plan-destructive-actions></ul>',
      "</section>",
      '<details class="disclosure-panel" open>',
      '<summary><span><span class="eyebrow">Risk</span><strong>Risks and blockers</strong></span><span class="status-pill unknown" data-plan-risk-status>Unknown</span></summary>',
      '<h3>Blockers</h3><ul class="plain-list" data-plan-blockers></ul>',
      '<h3>Risks</h3><ul class="plain-list" data-plan-risks></ul>',
      "</details>",
      '<details class="disclosure-panel">',
      '<summary><span><span class="eyebrow">Project Decision</span><strong>Constraints</strong></span><span class="status-pill unknown" data-plan-decision-status>Unknown</span></summary>',
      '<p data-plan-decision-reason>Project Decision evidence is UNKNOWN.</p>',
      '<h3>Constraints</h3><ul class="plain-list" data-plan-decision-constraints></ul>',
      '<h3>Decision details</h3><ul class="plain-list" data-plan-decision-details></ul>',
      "</details>",
      '<details class="disclosure-panel">',
      '<summary><span><span class="eyebrow">Context</span><strong>Evidence summary</strong></span></summary>',
      '<h3>Selected files</h3><ul class="plain-list" data-plan-context-files></ul>',
      '<h3>File evidence</h3><ul class="plain-list" data-plan-context-evidence></ul>',
      '<h3>Verified facts</h3><ul class="plain-list" data-plan-context-facts></ul>',
      '<h3>Project Knowledge</h3><ul class="plain-list" data-plan-context-knowledge></ul>',
      '<p class="muted" data-plan-context-budget>Context budget is UNKNOWN.</p>',
      "</details>",
      '<details class="disclosure-panel">',
      '<summary><span><span class="eyebrow">Acceptance</span><strong>Acceptance criteria</strong></span></summary>',
      '<ul class="plain-list" data-plan-acceptance></ul>',
      "</details>",
      "</div>",
    ].join("");

    return {
      section,
      loading: section.querySelector("[data-plan-loading]"),
      error: section.querySelector("[data-plan-error]"),
      errorMessage: section.querySelector("[data-plan-error-message]"),
      empty: section.querySelector("[data-plan-empty]"),
      emptyProject: section.querySelector("[data-plan-empty-project]"),
      emptyMessage: section.querySelector("[data-plan-empty-message]"),
      content: section.querySelector("[data-plan-content]"),
      projectName: section.querySelector("[data-plan-project-name]"),
      objective: section.querySelector("[data-plan-objective]"),
      nextAction: section.querySelector("[data-plan-next-action]"),
      approvalStatus: section.querySelector("[data-plan-approval-status]"),
      approveButton: section.querySelector("[data-plan-approve]"),
      editButton: section.querySelector("[data-plan-edit]"),
      submitResult: section.querySelector("[data-plan-submit-result]"),
      confirmations: section.querySelector("[data-plan-confirmations]"),
      destructiveConfirmationRow: section.querySelector("[data-destructive-confirmation-row]"),
      destructiveCheckbox: section.querySelector("[data-destructive-confirmed]"),
      costConfirmationRow: section.querySelector("[data-cost-confirmation-row]"),
      costCheckbox: section.querySelector("[data-cost-approved]"),
      meta: section.querySelector("[data-plan-meta]"),
      summaryList: section.querySelector("[data-plan-summary]"),
      counts: section.querySelector("[data-plan-counts]"),
      files: section.querySelector("[data-plan-files]"),
      acceptance: section.querySelector("[data-plan-acceptance]"),
      validationCommands: section.querySelector("[data-plan-validation]"),
      costStatus: section.querySelector("[data-plan-cost-status]"),
      costDetails: section.querySelector("[data-plan-cost-details]"),
      restoreStatus: section.querySelector("[data-plan-restore-status]"),
      restoreDetail: section.querySelector("[data-plan-restore-detail]"),
      destructiveWarning: section.querySelector("[data-destructive-warning]"),
      destructiveStatus: section.querySelector("[data-plan-destructive-status]"),
      destructiveActions: section.querySelector("[data-plan-destructive-actions]"),
      riskStatus: section.querySelector("[data-plan-risk-status]"),
      riskList: section.querySelector("[data-plan-risks]"),
      blockerList: section.querySelector("[data-plan-blockers]"),
      decisionStatus: section.querySelector("[data-plan-decision-status]"),
      decisionReason: section.querySelector("[data-plan-decision-reason]"),
      decisionConstraints: section.querySelector("[data-plan-decision-constraints]"),
      decisionDetails: section.querySelector("[data-plan-decision-details]"),
      contextFiles: section.querySelector("[data-plan-context-files]"),
      contextEvidence: section.querySelector("[data-plan-context-evidence]"),
      contextFacts: section.querySelector("[data-plan-context-facts]"),
      contextKnowledge: section.querySelector("[data-plan-context-knowledge]"),
      contextBudget: section.querySelector("[data-plan-context-budget]"),
    };
  }

  function listValues(values) {
    const rawValues = Array.isArray(values) ? values : [values];
    const items = rawValues.map(textValue).filter((entry) => entry !== UNKNOWN && entry !== "NONE");
    return Array.from(new Set(items));
  }

  function safeHref(value) {
    const text = textValue(value);

    if (text.startsWith("#")) {
      return text;
    }

    return "#home";
  }

  function plainStatus(value) {
    const text = textValue(value).toUpperCase();

    if (["HEALTHY", "READY", "READY_FOR_PLANNING", "APPROVED", "COMPLETED", "ALLOWED", "FREE", "CONFIRMED", "CLEAR", "PLANNED", "AVAILABLE"].includes(text)) {
      return text === "FREE" ? "Free" : "Ready";
    }

    if (["RUNNING", "EXECUTING", "CURRENT"].includes(text)) {
      return "Running";
    }

    if (["LOW", "MEDIUM", "HIGH", "ACTION_REQUIRED", "CONFIRMATION_REQUIRED", "DESTRUCTIVE_CONFIRMATION_REQUIRED", "APPROVAL_REQUIRED", "REQUIRED", "PARTIAL", "WAITING_TO_START", "WAITING_FOR_APPROVAL"].includes(text)) {
      return text === "LOW" || text === "MEDIUM" || text === "HIGH" ? titleCase(text) : "Needs attention";
    }

    if (["ATTENTION", "NEEDS ATTENTION", "MORE_INFORMATION_REQUIRED", "AMBIGUOUS"].includes(text)) {
      return "Needs attention";
    }

    if (["BLOCKED", "FAILED", "ERROR", "REJECTED", "NOT_READY", "PROVIDER_UNAVAILABLE", "COST_BLOCKED", "UNAVAILABLE"].includes(text)) {
      return "Blocked";
    }

    if (text === "EMPTY" || text === "NOT STARTED" || text === "MISSING") {
      return text === "MISSING" ? "Missing" : "Not started";
    }

    return "Unknown";
  }

  function statusClass(value) {
    const text = textValue(value).toLowerCase();

    if (text.includes("healthy") || text.includes("ready") || text.includes("allowed") || text.includes("free") || text.includes("approved") || text.includes("confirmed") || text.includes("clear") || text.includes("planned") || text === "completed" || text === "available" || text === "low") {
      return "ready";
    }

    if (text.includes("running") || text.includes("executing") || text === "current") {
      return "running";
    }

    if (text.includes("attention") || text.includes("partial") || text.includes("ambiguous") || text.includes("information") || text.includes("required") || text.includes("waiting") || text === "medium" || text === "high") {
      return "attention";
    }

    if (text.includes("blocked") || text.includes("failed") || text.includes("error") || text.includes("rejected") || text.includes("not_ready") || text.includes("unavailable")) {
      return "blocked";
    }

    if (text.includes("empty") || text.includes("not started") || text.includes("missing") || text.includes("not_started")) {
      return "empty";
    }

    if (text.includes("loading") || text.includes("checking")) {
      return "loading";
    }

    return "unknown";
  }

  function safeUiText(value) {
    return textValue(value)
      .replace(/\bproviders?\b/gi, "model setup")
      .replace(/\bprompt(?:s|ing)?\b/gi, "request")
      .replace(/\bpatch(?:es)?\b/gi, "change set")
      .replace(/\bmemory\b/gi, "Project Knowledge");
  }

  function activityDetailText(value) {
    const text = safeUiText(value);

    if (text === UNKNOWN) {
      return "";
    }

    const normalized = text.toUpperCase();
    const workflowStatuses = {
      APPROVED: "Approved",
      COMPLETED: "Completed",
      EMPTY: "Not started",
      FAILED: "Failed",
      PARTIAL: "Partial",
      READY_FOR_PLANNING: "Ready for planning",
      READY_FOR_REVIEW: "Ready for review",
    };

    return workflowStatuses[normalized] || text;
  }

  function textValue(value) {
    if (value === undefined || value === null) {
      return UNKNOWN;
    }

    if (typeof value === "string") {
      const text = value.trim();
      return text === "" ? UNKNOWN : text;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    if (Array.isArray(value)) {
      const values = value.map(textValue).filter((entry) => entry !== UNKNOWN);
      return values.length > 0 ? Array.from(new Set(values)).join(", ") : UNKNOWN;
    }

    if (typeof value === "object") {
      for (const key of ["name", "label", "detail", "reason", "action", "status", "path", "source", "signal", "statement", "message", "originalRequest", "normalizedObjective", "taskType"]) {
        const text = textValue(value[key]);

        if (text !== UNKNOWN) {
          return text;
        }
      }
    }

    return UNKNOWN;
  }

  function titleCase(value) {
    return textValue(value).toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
  }
}());
