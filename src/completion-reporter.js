function createCompletionReport(input) {
  validateReportInput(input);

  const validationFailed = input.validationResults.some((result) => result.exitCode !== 0);
  const status = validationFailed ? "FAILED" : input.status;

  const report = {
    requirementId: input.requirementId,
    filesChanged: [...input.filesChanged],
    changeSummary: input.changeSummary,
    commandsRun: input.validationResults.map((result) => ({
      command: result.command,
      cwd: result.cwd,
    })),
    validationResults: input.validationResults.map((result) => ({
      command: result.command,
      cwd: result.cwd,
      exitCode: result.exitCode,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    })),
    knownFailures: validationFailed ? input.knownFailures : [],
    remainingWork: input.remainingWork,
    status,
  };

  if (input.projectHealthSummary) {
    report.projectHealthSummary = input.projectHealthSummary;
  }

  return report;
}

function recordVerifiedTaskOutcome(memoryStore, projectId, report) {
  if (report.status !== "COMPLETED") {
    return null;
  }

  return memoryStore.addRecord(projectId, {
    type: "task-outcome",
    source: {
      kind: "completion-report",
      requirementId: report.requirementId,
    },
    confidenceState: "VERIFIED",
    value: report,
  });
}

function validateReportInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Completion report input is required.");
  }

  requireString(input.requirementId, "requirementId");
  requireStringArray(input.filesChanged, "filesChanged");
  requireString(input.changeSummary, "changeSummary");
  requireValidationResults(input.validationResults);
  requireStringArray(input.remainingWork, "remainingWork");

  if (!["COMPLETED", "PARTIAL", "FAILED"].includes(input.status)) {
    throw new Error("Completion report status is required.");
  }

  if (input.knownFailures && !Array.isArray(input.knownFailures)) {
    throw new Error("Completion report knownFailures must be an array.");
  }

  if (
    input.projectHealthSummary &&
    (typeof input.projectHealthSummary !== "object" || Array.isArray(input.projectHealthSummary))
  ) {
    throw new Error("Completion report projectHealthSummary must be an object.");
  }
}

function requireValidationResults(results) {
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("Completion report validationResults are required.");
  }

  for (const result of results) {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("Completion report validation result must be an object.");
    }

    requireString(result.command, "validation command");
    requireString(result.cwd, "validation cwd");

    if (!Number.isInteger(result.exitCode)) {
      throw new Error("Completion report validation exitCode is required.");
    }
  }
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Completion report ${fieldName} is required.`);
  }
}

function requireStringArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`Completion report ${fieldName} is required.`);
  }

  for (const item of value) {
    requireString(item, fieldName);
  }
}

module.exports = {
  createCompletionReport,
  recordVerifiedTaskOutcome,
};
