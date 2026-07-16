(function initializeLeviUi() {
  const UNKNOWN = "UNKNOWN";

  const state = {
    dashboard: null,
  };

  const elements = {
    loading: document.getElementById("loading-state"),
    error: document.getElementById("error-state"),
    errorMessage: document.querySelector("[data-error-message]"),
    dashboard: document.getElementById("home"),
    topProjectName: document.getElementById("top-project-name"),
    projectOption: document.getElementById("project-option"),
    projectTitle: document.getElementById("project-title"),
    projectContext: document.getElementById("project-context"),
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

  elements.taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitIntake();
  });

  loadDashboard();

  async function loadDashboard() {
    showLoading();

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
        showError(dashboard.error && dashboard.error.detail ? dashboard.error.detail : "Project needs attention.");
        return;
      }

      renderDashboard(dashboard);
    } catch (error) {
      showError(error.message);
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
      elements.intakeResult.textContent = safeHomeText(error.message);
    } finally {
      const canCreateTask = Boolean(state.dashboard && state.dashboard.controls && state.dashboard.controls.canCreateTask);
      elements.createPlanButton.disabled = !canCreateTask;
      elements.createPlanButton.textContent = "Create Plan";
    }
  }

  function renderDashboard(dashboard) {
    const projectName = textValue(dashboard.project && dashboard.project.name);
    const canCreateTask = Boolean(dashboard.controls && dashboard.controls.canCreateTask);

    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.dashboard.hidden = false;
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
        detail.textContent = safeHomeText(item.detail);

        article.append(label, value, detail);
        return article;
      }),
    );
  }

  function renderHealth(health) {
    elements.healthStatus.textContent = plainStatus(health.overallStatus);
    elements.healthStatus.className = `status-pill ${statusClass(health.overallStatus)}`;
    elements.healthText.textContent = safeHomeText(health.summary);

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
        title.textContent = safeHomeText(issue.label);
        const detail = document.createElement("span");
        detail.textContent = issue.detail ? ` ${safeHomeText(issue.detail)}` : "";
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
        ? safeHomeText(emptyStates[0])
        : "No task started.";
      elements.activityList.replaceChildren();
      return;
    }

    elements.activityEmpty.hidden = true;
    elements.activityList.replaceChildren(
      ...activity.map((entry) => {
        const item = document.createElement("li");
        const label = document.createElement("strong");
        label.textContent = safeHomeText(entry.label);
        const detailText = activityDetailText(entry.detail);
        const detail = document.createElement("span");
        detail.textContent = detailText ? ` ${detailText}` : "";
        item.append(label, detail);
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
        item.textContent = safeHomeText(question);
        list.append(item);
      });
      elements.intakeResult.append(list);
    }
  }

  function appendResultLine(list, labelText, value) {
    const label = document.createElement("dt");
    label.textContent = labelText;
    const detail = document.createElement("dd");
    detail.textContent = safeHomeText(value);
    list.append(label, detail);
  }

  function showLoading() {
    elements.loading.hidden = false;
    elements.error.hidden = true;
    elements.dashboard.hidden = true;
    elements.footerStatus.textContent = "Checking project";
  }

  function showError(message) {
    elements.loading.hidden = true;
    elements.error.hidden = false;
    elements.dashboard.hidden = true;
    elements.topProjectName.textContent = "Project blocked";
    elements.errorMessage.textContent = safeHomeText(message);
    elements.footerStatus.textContent = "Blocked";
  }

  function plainStatus(value) {
    const text = textValue(value).toUpperCase();

    if (["HEALTHY", "READY", "READY_FOR_PLANNING", "APPROVED", "COMPLETED", "ALLOWED", "FREE"].includes(text)) {
      return text === "FREE" ? "Free" : "Ready";
    }

    if (["LOW", "MEDIUM", "HIGH"].includes(text)) {
      return titleCase(text);
    }

    if (["ATTENTION", "NEEDS ATTENTION", "PARTIAL", "MORE_INFORMATION_REQUIRED", "AMBIGUOUS", "APPROVAL_REQUIRED"].includes(text)) {
      return "Needs attention";
    }

    if (["BLOCKED", "FAILED", "ERROR", "REJECTED", "NOT_READY"].includes(text)) {
      return "Blocked";
    }

    if (text === "EMPTY" || text === "NOT STARTED") {
      return "Not started";
    }

    return "Unknown";
  }

  function statusClass(value) {
    const text = textValue(value).toLowerCase();

    if (text.includes("healthy") || text.includes("ready") || text.includes("allowed") || text.includes("free") || text === "low") {
      return "ready";
    }

    if (text.includes("attention") || text.includes("partial") || text.includes("ambiguous") || text.includes("information") || text === "medium" || text === "high") {
      return "attention";
    }

    if (text.includes("blocked") || text.includes("failed") || text.includes("error") || text.includes("rejected") || text.includes("not_ready")) {
      return "blocked";
    }

    if (text.includes("empty") || text.includes("not started")) {
      return "empty";
    }

    if (text.includes("loading") || text.includes("checking")) {
      return "loading";
    }

    return "unknown";
  }

  function safeHomeText(value) {
    return textValue(value)
      .replace(/\bproviders?\b/gi, "model setup")
      .replace(/\bprompt(?:s|ing)?\b/gi, "request")
      .replace(/\bpatch(?:es)?\b/gi, "change set")
      .replace(/\bmemory\b/gi, "Project Knowledge");
  }

  function activityDetailText(value) {
    const text = safeHomeText(value);

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
      for (const key of ["name", "label", "detail", "reason", "action", "status", "path", "source", "signal", "originalRequest", "normalizedObjective", "taskType"]) {
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
