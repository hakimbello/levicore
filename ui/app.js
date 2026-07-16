(function initializeLeviUi() {
  const state = {
    dashboard: null,
  };

  const elements = {
    loading: document.getElementById("loading-state"),
    error: document.getElementById("error-state"),
    errorMessage: document.querySelector("[data-error-message]"),
    dashboard: document.getElementById("dashboard"),
    projectTitle: document.getElementById("project-title"),
    projectRoot: document.getElementById("project-root"),
    newTaskButton: document.getElementById("new-task-button"),
    taskInput: document.getElementById("task-input"),
    taskForm: document.getElementById("task-form"),
    intakeResult: document.getElementById("intake-result"),
    statusSummary: document.querySelector("[data-status-summary]"),
    healthStatus: document.getElementById("health-status"),
    healthText: document.getElementById("health-text"),
    healthIssues: document.getElementById("health-issues"),
    repositoryDetails: document.querySelector("[data-repository-details]"),
    activityEmpty: document.getElementById("activity-empty"),
    activityList: document.getElementById("activity-list"),
    footerStatus: document.getElementById("footer-status"),
  };

  elements.newTaskButton.addEventListener("click", () => {
    elements.taskInput.focus();
  });

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
    const requestText = elements.taskInput.value;
    elements.intakeResult.hidden = false;
    elements.intakeResult.className = "result-panel loading";
    elements.intakeResult.textContent = "Checking request.";

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
      elements.intakeResult.className = "result-panel danger";
      elements.intakeResult.textContent = error.message;
    }
  }

  function renderDashboard(dashboard) {
    elements.loading.hidden = true;
    elements.error.hidden = true;
    elements.dashboard.hidden = false;
    elements.projectTitle.textContent = dashboard.project.name;
    elements.projectRoot.textContent = dashboard.project.root;
    elements.newTaskButton.disabled = !dashboard.controls.canCreateTask;
    elements.footerStatus.textContent = dashboard.readyToWork ? "Ready" : "Needs attention";

    renderStatusSummary(dashboard.statusSummary);
    renderHealth(dashboard.health);
    renderRepository(dashboard.repository);
    renderActivity(dashboard.recentActivity, dashboard.emptyStates);
  }

  function renderStatusSummary(items) {
    elements.statusSummary.replaceChildren(
      ...items.map((item) => {
        const article = document.createElement("article");
        article.className = "status-card";

        const label = document.createElement("p");
        label.className = "status-label";
        label.textContent = item.label;

        const value = document.createElement("p");
        value.className = `status-value ${statusClass(item.value)}`;
        value.textContent = item.value;

        const detail = document.createElement("p");
        detail.className = "status-detail";
        detail.textContent = item.detail;

        article.append(label, value, detail);
        return article;
      }),
    );
  }

  function renderHealth(health) {
    elements.healthStatus.textContent = plainStatus(health.overallStatus);
    elements.healthStatus.className = `status-pill ${statusClass(health.overallStatus)}`;
    elements.healthText.textContent = health.summary;

    const issues = health.highestSeverityIssues.length > 0
      ? health.highestSeverityIssues
      : health.recommendations.slice(0, 3).map((recommendation) => ({
          label: recommendation.action,
          detail: recommendation.reason,
          status: recommendation.priority,
        }));

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
        title.textContent = issue.label;
        const detail = document.createElement("span");
        detail.textContent = issue.detail ? ` ${issue.detail}` : "";
        item.append(title, detail);
        return item;
      }),
    );
  }

  function renderRepository(repository) {
    const rows = [
      ["Files", String(repository.fileCount)],
      ["Languages", repository.languages.join(", ")],
      ["Frameworks", repository.frameworks.join(", ")],
      ["Package managers", repository.packageManagers.join(", ")],
      ["Entry points", repository.entryPoints.join(", ")],
      ["Tests", repository.tests.join(", ")],
      ["Top folders", repository.majorDirectories.join(", ")],
    ];

    elements.repositoryDetails.replaceChildren(
      ...rows.flatMap(([labelText, valueText]) => {
        const label = document.createElement("dt");
        label.textContent = labelText;
        const value = document.createElement("dd");
        value.textContent = valueText;
        return [label, value];
      }),
    );
  }

  function renderActivity(activity, emptyStates) {
    if (!activity.length) {
      elements.activityEmpty.hidden = false;
      elements.activityEmpty.querySelector("p").textContent = emptyStates && emptyStates.length
        ? emptyStates[0]
        : "No task started.";
      elements.activityList.replaceChildren();
      return;
    }

    elements.activityEmpty.hidden = true;
    elements.activityList.replaceChildren(
      ...activity.map((entry) => {
        const item = document.createElement("li");
        const label = document.createElement("strong");
        label.textContent = entry.label;
        const detail = document.createElement("span");
        detail.textContent = entry.detail ? ` ${entry.detail}` : "";
        item.append(label, detail);
        return item;
      }),
    );
  }

  function renderIntakeResult(result) {
    elements.intakeResult.className = `result-panel ${statusClass(result.status)}`;

    const title = document.createElement("strong");
    title.textContent = plainStatus(result.status);

    const original = document.createElement("p");
    original.textContent = `Original request: ${result.originalRequest}`;

    const objective = document.createElement("p");
    objective.textContent = `Objective: ${result.normalizedObjective}`;

    const type = document.createElement("p");
    type.textContent = `Task type: ${result.taskType}`;

    const reason = document.createElement("p");
    reason.textContent = result.reason;

    elements.intakeResult.replaceChildren(title, original, objective, type, reason);

    if (Array.isArray(result.nextQuestions) && result.nextQuestions.length > 0) {
      const list = document.createElement("ul");
      list.className = "plain-list";
      result.nextQuestions.forEach((question) => {
        const item = document.createElement("li");
        item.textContent = question;
        list.append(item);
      });
      elements.intakeResult.append(list);
    }
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
    elements.errorMessage.textContent = message;
    elements.footerStatus.textContent = "Blocked";
  }

  function plainStatus(value) {
    const text = String(value || "UNKNOWN").toUpperCase();

    if (text === "HEALTHY" || text === "READY" || text === "READY_FOR_PLANNING") {
      return "Ready";
    }

    if (text === "ATTENTION" || text === "PARTIAL" || text === "MORE_INFORMATION_REQUIRED" || text === "AMBIGUOUS") {
      return "Needs attention";
    }

    if (text === "BLOCKED" || text === "FAILED" || text === "ERROR" || text === "REJECTED") {
      return "Blocked";
    }

    if (text === "EMPTY") {
      return "Not started";
    }

    return "Unknown";
  }

  function statusClass(value) {
    const text = String(value || "UNKNOWN").toLowerCase();

    if (text.includes("healthy") || text.includes("ready")) {
      return "ready";
    }

    if (text.includes("attention") || text.includes("partial") || text.includes("ambiguous") || text.includes("information")) {
      return "attention";
    }

    if (text.includes("blocked") || text.includes("failed") || text.includes("error") || text.includes("rejected")) {
      return "blocked";
    }

    if (text.includes("empty") || text.includes("not started")) {
      return "empty";
    }

    return "unknown";
  }
}());
