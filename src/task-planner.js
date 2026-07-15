const path = require("node:path");
const { enforceProjectDecisions } = require("./project-decisions");

const UNKNOWN = "UNKNOWN";
const APPROVAL_STATES = {
  AWAITING_APPROVAL: "AWAITING_APPROVAL",
  APPROVED: "APPROVED",
};
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx", ".py", ".go", ".rs", ".rb", ".java", ".cs"]);
const JAVASCRIPT_EXTENSIONS = new Set([".js", ".jsx", ".mjs"]);
const PYTHON_EXTENSIONS = new Set([".py"]);
const WEBSITE_EXTENSIONS = new Set([".html", ".css", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const WEBSITE_WORDS = new Set(["site", "website", "webpage", "landing", "page", "pages", "homepage"]);
const TASK_STOP_WORDS = new Set([
  "about",
  "add",
  "and",
  "build",
  "business",
  "change",
  "create",
  "existing",
  "feature",
  "fix",
  "for",
  "from",
  "implement",
  "improve",
  "into",
  "make",
  "multi",
  "page",
  "pages",
  "please",
  "refactor",
  "request",
  "single",
  "site",
  "the",
  "this",
  "to",
  "update",
  "website",
  "with",
]);

function createTaskPlan(input) {
  validatePlanInput(input);

  const plan = {
    requirementId: input.requirementId,
    expectedFiles: [...input.expectedFiles],
    acceptanceCriteria: [...input.acceptanceCriteria],
    validationCommands: [...input.validationCommands],
    risks: [...input.risks],
    exclusions: [...input.exclusions],
    approvalState: APPROVAL_STATES.AWAITING_APPROVAL,
  };

  if (input.objective !== undefined) {
    plan.objective = normalizeOptionalString(input.objective, "objective");
  }

  if (input.plannedOperations !== undefined) {
    plan.plannedOperations = normalizePlannedOperations(input.plannedOperations);
  }

  if (input.costEstimate !== undefined) {
    plan.costEstimate = normalizeCostEstimate(input.costEstimate);
  }

  if (input.budgetState !== undefined) {
    plan.budgetState = normalizeBudgetState(input.budgetState);
  }

  return plan;
}

function createTaskPlanFromIntake(input) {
  validatePlanningHandoff(input);

  const intake = input.intake;
  const scope = input.scope;
  const repositorySummary = input.repositorySummary;
  const expectedFiles = inferExpectedFiles(intake, repositorySummary);

  if (expectedFiles.length === 0) {
    throw new Error("Task plan needs repository evidence or a more specific target file before planning can continue.");
  }

  const plannedOperations = plannedOperationsFor(repositorySummary, expectedFiles);
  const baseValidationCommands = validationCommandsFor(repositorySummary, expectedFiles);
  const decisionEnforcement = decisionInputsPresent(input)
    ? enforceProjectDecisions({
        projectId: input.projectId || "default",
        memoryStore: input.memoryStore,
        decisionRecords: input.decisionRecords,
        task: {
          objective: intake.normalizedObjective,
          expectedFiles,
          plannedOperations,
          validationCommands: baseValidationCommands,
        },
      })
    : null;
  const decisionValidationCommands = decisionEnforcement ? decisionEnforcement.validationCommands : [];
  const decisionConstraints = decisionEnforcement ? decisionEnforcement.constraints : [];
  const plan = createTaskPlan({
    requirementId: scope.requirement.id,
    objective: intake.normalizedObjective,
    expectedFiles,
    acceptanceCriteria: acceptanceCriteriaFor(intake, expectedFiles),
    validationCommands: uniqueSorted([...baseValidationCommands, ...decisionValidationCommands]),
    risks: risksFor(intake, decisionEnforcement),
    exclusions: exclusionsFor(expectedFiles),
    plannedOperations,
  });
  const scopeBoundaries = [
    `Plan only for the requested objective: ${intake.normalizedObjective}.`,
    `Limit file changes to: ${expectedFiles.join(", ")}.`,
    "Execution requires explicit approval before any file modification.",
    ...decisionConstraints.map((constraint) => `Project decision constraint: ${constraint}.`),
  ];
  const output = {
    ...plan,
    originalRequest: intake.originalRequest,
    normalizedObjective: intake.normalizedObjective,
    taskType: intake.taskType,
    requestedActionClass: intake.requestedActionClass || UNKNOWN,
    intakeStatus: intake.status,
    scopeDecision: scope.status,
    scopeBoundaries,
    evidence: evidenceFor(repositorySummary, expectedFiles),
  };

  if (decisionEnforcement) {
    output.decisionEnforcement = decisionEnforcement;
    output.decisionConstraints = decisionConstraints;
  }

  return output;
}

function approveTaskPlan(plan) {
  validatePlan(plan);

  return {
    ...plan,
    approvalState: APPROVAL_STATES.APPROVED,
  };
}

function canBeginExecution(plan) {
  validatePlan(plan);
  return plan.approvalState === APPROVAL_STATES.APPROVED;
}

function validatePlanInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Task plan input must be an object.");
  }

  requireString(input.requirementId, "requirementId");
  requireStringArray(input.expectedFiles, "expectedFiles");
  requireStringArray(input.acceptanceCriteria, "acceptanceCriteria");
  requireStringArray(input.validationCommands, "validationCommands");
  requireStringArray(input.risks, "risks");
  requireStringArray(input.exclusions, "exclusions");
}

function validatePlanningHandoff(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Task planning handoff input must be an object.");
  }

  if (!input.intake || typeof input.intake !== "object" || Array.isArray(input.intake)) {
    throw new Error("Task planning intake is required.");
  }

  if (!input.scope || typeof input.scope !== "object" || Array.isArray(input.scope)) {
    throw new Error("Task planning scope decision is required.");
  }

  if (!input.repositorySummary || typeof input.repositorySummary !== "object" || Array.isArray(input.repositorySummary)) {
    throw new Error("Task planning repository evidence is required.");
  }

  if (input.intake.proceedToPlanning !== true) {
    throw new Error("Task planning requires validated intake.");
  }

  if (input.scope.proceedToPlanning !== true || !input.scope.requirement) {
    throw new Error("Task planning requires an in-scope decision.");
  }

  requireString(input.intake.originalRequest, "originalRequest");
  requireString(input.intake.normalizedObjective, "normalizedObjective");
  requireString(input.intake.taskType, "taskType");
}

function validatePlan(plan) {
  validatePlanInput(plan);

  if (!Object.values(APPROVAL_STATES).includes(plan.approvalState)) {
    throw new Error("Task plan approvalState is required.");
  }

  if (plan.costEstimate !== undefined) {
    normalizeCostEstimate(plan.costEstimate);
  }

  if (plan.objective !== undefined) {
    normalizeOptionalString(plan.objective, "objective");
  }

  if (plan.plannedOperations !== undefined) {
    normalizePlannedOperations(plan.plannedOperations);
  }

  if (plan.budgetState !== undefined) {
    normalizeBudgetState(plan.budgetState);
  }
}

function attachCostEstimate(plan, costEstimate) {
  validatePlan(plan);

  return {
    ...plan,
    costEstimate: normalizeCostEstimate(costEstimate),
  };
}

function attachBudgetState(plan, budgetState) {
  validatePlan(plan);

  return {
    ...plan,
    budgetState: normalizeBudgetState(budgetState),
  };
}

function normalizeCostEstimate(costEstimate) {
  if (!costEstimate || typeof costEstimate !== "object" || Array.isArray(costEstimate)) {
    throw new Error("Task plan costEstimate must be an object.");
  }

  for (const fieldName of [
    "selectedProvider",
    "selectedModel",
    "costClass",
    "currency",
    "evidenceSource",
  ]) {
    requireString(costEstimate[fieldName], `costEstimate.${fieldName}`);
  }

  return JSON.parse(JSON.stringify(costEstimate));
}

function normalizeBudgetState(budgetState) {
  if (!budgetState || typeof budgetState !== "object" || Array.isArray(budgetState)) {
    throw new Error("Task plan budgetState must be an object.");
  }

  if (!["ALLOWED", "APPROVAL_REQUIRED", "BLOCKED"].includes(budgetState.status)) {
    throw new Error("Task plan budgetState.status is required.");
  }

  for (const fieldName of ["provider", "model", "reason"]) {
    requireString(budgetState[fieldName], `budgetState.${fieldName}`);
  }

  if (budgetState.estimatedCost === undefined) {
    throw new Error("Task plan budgetState.estimatedCost is required.");
  }

  if (!budgetState.budgetCeiling || typeof budgetState.budgetCeiling !== "object") {
    throw new Error("Task plan budgetState.budgetCeiling is required.");
  }

  if (!budgetState.pricingEvidence || typeof budgetState.pricingEvidence !== "object") {
    throw new Error("Task plan budgetState.pricingEvidence is required.");
  }

  return JSON.parse(JSON.stringify(budgetState));
}

function inferExpectedFiles(intake, repositorySummary) {
  const objective = intake.normalizedObjective;
  const files = normalizedProjectFiles(repositorySummary);
  const explicitFiles = explicitFilesFromText(objective);

  if (explicitFiles.length > 0) {
    return explicitFiles;
  }

  if (isWebsiteRequest(objective)) {
    return websiteExpectedFiles(objective, files);
  }

  const matchedFiles = matchRelevantFiles(objective, files);

  if (matchedFiles.length > 0) {
    return expandRelatedFiles(matchedFiles, files).slice(0, 5);
  }

  const entryPointFiles = filesFromDetections(repositorySummary.entryPoints).filter((filePath) =>
    files.some((file) => file.path === filePath),
  );

  if (entryPointFiles.length > 0) {
    return expandRelatedFiles(entryPointFiles, files).slice(0, 5);
  }

  const sourceFiles = files.filter((file) => SOURCE_EXTENSIONS.has(path.extname(file.path).toLowerCase()));

  if (sourceFiles.length > 0) {
    return expandRelatedFiles(
      sourceFiles
        .map((file) => file.path)
        .sort()
        .slice(0, 3),
      files,
    );
  }

  return [];
}

function explicitFilesFromText(text) {
  const filePattern = /(?:^|[\s"'`(])([A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)*\.(?:c|cc|cpp|cs|css|go|h|hpp|html|java|js|jsx|json|md|mjs|py|rb|rs|ts|tsx|txt|yml|yaml))(?:$|[\s"'`).,;:])/gi;
  const files = [];
  let match;

  while ((match = filePattern.exec(text)) !== null) {
    const normalized = normalizeRelativePath(match[1]);

    if (normalized) {
      files.push(normalized);
    }
  }

  return uniqueSorted(files);
}

function websiteExpectedFiles(objective, files) {
  const webFiles = files.filter((file) => WEBSITE_EXTENSIONS.has(path.extname(file.path).toLowerCase()));

  if (webFiles.length > 0) {
    const matched = matchRelevantFiles(
      objective,
      webFiles.filter((file) => path.extname(file.path).toLowerCase() === ".html"),
    );
    const htmlFiles = matched.length > 0 ? matched : preferredWebsiteHtmlFiles(webFiles);
    const expectedFiles = expandRelatedFiles(htmlFiles, webFiles);

    if (needsWebsiteScript(objective)) {
      expectedFiles.push(...existingScriptFiles(webFiles));
    }

    return uniqueSorted(expectedFiles).slice(0, 6);
  }

  const pages = websitePagesFor(objective);
  const filesNeeded = pages.map((page) => (page === "home" ? "index.html" : `${page}.html`));
  filesNeeded.push("styles.css");

  if (needsWebsiteScript(objective)) {
    filesNeeded.push("script.js");
  }

  return uniqueSorted(filesNeeded);
}

function preferredWebsiteHtmlFiles(files) {
  const htmlFiles = files
    .map((file) => file.path)
    .filter((filePath) => path.extname(filePath).toLowerCase() === ".html")
    .sort();

  const indexFile = htmlFiles.find((filePath) => path.basename(filePath).toLowerCase() === "index.html");

  if (indexFile) {
    return [indexFile];
  }

  return htmlFiles.slice(0, 3);
}

function websitePagesFor(objective) {
  const lower = objective.toLowerCase();
  const pages = ["home"];
  const multiPage = /\bmulti[-\s]?page\b/.test(lower) || /\bpages\b/.test(lower);

  if (multiPage) {
    pages.push("about", "services", "contact");
  }

  const requestedPages = [
    ["about", /\babout\b/],
    ["services", /\bservices?\b/],
    ["contact", /\bcontact\b/],
    ["menu", /\bmenu\b/],
    ["pricing", /\bpricing\b/],
    ["portfolio", /\bportfolio\b/],
    ["gallery", /\bgallery\b/],
    ["blog", /\bblog\b/],
  ];

  if (!/\bsingle[-\s]?page\b/.test(lower) && !/\blanding page\b/.test(lower)) {
    for (const [page, pattern] of requestedPages) {
      if (pattern.test(lower)) {
        pages.push(page);
      }
    }
  }

  return uniqueSorted(pages);
}

function needsWebsiteScript(objective) {
  return /\b(carousel|dynamic|filter|form|interactive|menu|search|toggle)\b/i.test(objective);
}

function existingScriptFiles(files) {
  return files
    .map((file) => file.path)
    .filter((filePath) => JAVASCRIPT_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
    .sort()
    .slice(0, 2);
}

function isWebsiteRequest(text) {
  const tokens = tokenize(text);
  return tokens.some((token) => WEBSITE_WORDS.has(token));
}

function matchRelevantFiles(objective, files) {
  const tokens = tokenize(objective).filter((token) => !TASK_STOP_WORDS.has(token));

  if (tokens.length === 0) {
    return [];
  }

  return files
    .map((file) => ({
      path: file.path,
      score: scoreFile(file.path, tokens),
    }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .map((match) => match.path);
}

function scoreFile(filePath, tokens) {
  const normalized = filePath.toLowerCase();
  const basename = path.basename(normalized, path.extname(normalized));
  let score = 0;

  for (const token of tokens) {
    if (basename === token) {
      score += 4;
    } else if (basename.includes(token)) {
      score += 3;
    } else if (normalized.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function expandRelatedFiles(selectedFiles, files) {
  const selected = uniqueSorted(selectedFiles);
  const selectedExtensions = new Set(selected.map((filePath) => path.extname(filePath).toLowerCase()));
  const related = [...selected];

  if ([...selectedExtensions].some((extension) => [".html", ".jsx", ".tsx"].includes(extension))) {
    related.push(
      ...files
        .map((file) => file.path)
        .filter((filePath) => path.extname(filePath).toLowerCase() === ".css")
        .sort()
        .slice(0, 2),
    );
  }

  return uniqueSorted(related);
}

function validationCommandsFor(repositorySummary, expectedFiles) {
  const commands = [];
  const accessCommand = fileAccessCommand(expectedFiles);

  if (accessCommand) {
    commands.push(accessCommand);
  }

  commands.push(...testCommandsFromSummary(repositorySummary));

  for (const filePath of expectedFiles) {
    const extension = path.extname(filePath).toLowerCase();

    if (JAVASCRIPT_EXTENSIONS.has(extension)) {
      commands.push(`node --check ${quoteCommandArg(filePath)}`);
    }

    if (PYTHON_EXTENSIONS.has(extension)) {
      commands.push(`python -m py_compile ${quoteCommandArg(filePath)}`);
    }
  }

  return uniqueSorted(commands);
}

function fileAccessCommand(expectedFiles) {
  if (expectedFiles.length === 0) {
    return null;
  }

  return `node -e "const fs=require('node:fs'); for (const file of process.argv.slice(1)) fs.accessSync(file)" ${expectedFiles
    .map(quoteCommandArg)
    .join(" ")}`;
}

function testCommandsFromSummary(repositorySummary) {
  if (!Array.isArray(repositorySummary.tests)) {
    return [];
  }

  return uniqueSorted(
    repositorySummary.tests
      .map((test) => (test && typeof test.name === "string" ? test.name : null))
      .filter((name) => name === "npm test"),
  );
}

function acceptanceCriteriaFor(intake, expectedFiles) {
  const criteria = [
    `The implementation satisfies the request: ${intake.normalizedObjective}.`,
    `The original request remains preserved exactly as: ${intake.originalRequest}.`,
    `Changes are limited to the planned files: ${expectedFiles.join(", ")}.`,
    "The plan remains AWAITING_APPROVAL until the user explicitly approves execution.",
  ];

  if (isWebsiteRequest(intake.normalizedObjective)) {
    criteria.push("The planned website files describe the requested product, business, or feature.");
  }

  if (intake.requestedActionClass === "FIX") {
    criteria.push("The bug fix targets the reported failure without unrelated behavior changes.");
  }

  if (intake.requestedActionClass === "REFACTOR") {
    criteria.push("The refactor preserves existing behavior while improving the requested code area.");
  }

  return criteria;
}

function plannedOperationsFor(repositorySummary, expectedFiles) {
  const existingFiles = new Set(normalizedProjectFiles(repositorySummary).map((file) => file.path));

  return expectedFiles.map((filePath) => ({
    type: existingFiles.has(filePath) ? "update" : "create",
    path: filePath,
  }));
}

function risksFor(intake, decisionEnforcement) {
  const risks = ["Low: planning only; execution remains blocked until explicit approval."];

  if (intake.requestedActionClass === "REFACTOR") {
    risks.push("Medium: refactors can change behavior if later execution edits exceed the approved file boundaries.");
  }

  if (intake.requestedActionClass === "FIX") {
    risks.push("Medium: bug fixes require validation evidence from the target project before completion.");
  }

  if (decisionEnforcement && decisionEnforcement.status !== "ALLOWED") {
    risks.push(`Decision enforcement ${decisionEnforcement.status}: ${decisionEnforcement.reason}`);
  }

  return risks;
}

function exclusionsFor(expectedFiles) {
  return [
    "Do not execute providers during intake or planning.",
    "Do not generate code during intake or planning.",
    "Do not apply patches during intake or planning.",
    `Do not modify files outside: ${expectedFiles.join(", ")}.`,
  ];
}

function evidenceFor(repositorySummary, expectedFiles) {
  const existingFiles = new Set(normalizedProjectFiles(repositorySummary).map((file) => file.path));

  return expectedFiles.map((filePath) => ({
    file: filePath,
    source: existingFiles.has(filePath) ? "repository-scan" : "task-request",
  }));
}

function filesFromDetections(detections) {
  if (!Array.isArray(detections)) {
    return [];
  }

  return uniqueSorted(
    detections
      .map((entry) => (entry && typeof entry.name === "string" ? normalizeRelativePath(entry.name) : null))
      .filter(Boolean),
  );
}

function normalizedProjectFiles(repositorySummary) {
  if (!Array.isArray(repositorySummary.files)) {
    return [];
  }

  return repositorySummary.files
    .map((file) => {
      if (!file || typeof file.path !== "string") {
        return null;
      }

      const normalized = normalizeRelativePath(file.path);
      return normalized ? { path: normalized } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.path.localeCompare(right.path));
}

function normalizeRelativePath(filePath) {
  if (typeof filePath !== "string" || filePath.trim() === "" || path.isAbsolute(filePath) || filePath.includes("\0")) {
    return null;
  }

  const parts = filePath.split(/[\\/]+/).filter(Boolean);

  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    return null;
  }

  return parts.join("/");
}

function tokenize(value) {
  if (typeof value !== "string") {
    return [];
  }

  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function quoteCommandArg(value) {
  if (/^[A-Za-z0-9_./-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '\\"')}"`;
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort();
}

function decisionInputsPresent(input) {
  return Boolean(
    Array.isArray(input.decisionRecords) ||
      (input.memoryStore && typeof input.memoryStore.listRecords === "function"),
  );
}

function normalizePlannedOperations(plannedOperations) {
  if (!Array.isArray(plannedOperations)) {
    throw new Error("Task plan plannedOperations must be an array.");
  }

  return plannedOperations.map((operation) => {
    if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
      throw new Error("Task plan planned operation must be an object.");
    }

    if (!["create", "update", "delete"].includes(operation.type)) {
      throw new Error("Task plan planned operation type is invalid.");
    }

    requireString(operation.path, "plannedOperation.path");

    return {
      type: operation.type,
      path: operation.path,
    };
  });
}

function normalizeOptionalString(value, fieldName) {
  requireString(value, fieldName);
  return value;
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Task plan ${fieldName} is required.`);
  }
}

function requireStringArray(value, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Task plan ${fieldName} is required.`);
  }

  for (const item of value) {
    requireString(item, fieldName);
  }
}

module.exports = {
  APPROVAL_STATES,
  attachBudgetState,
  attachCostEstimate,
  approveTaskPlan,
  canBeginExecution,
  createTaskPlanFromIntake,
  createTaskPlan,
};
