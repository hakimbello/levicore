const UNKNOWN = "UNKNOWN";
const { normalizeTaskIntake } = require("./intent-classifier");

const ACTION_RULES = [
  {
    actionClass: "FIX",
    words: ["bug", "crash", "error", "fail", "fix", "broken", "issue"],
  },
  {
    actionClass: "REFACTOR",
    words: ["refactor", "cleanup", "clean up", "restructure", "simplify"],
  },
  {
    actionClass: "CREATE",
    words: ["add", "build", "create", "implement", "make", "new"],
  },
  {
    actionClass: "UPDATE",
    words: ["change", "improve", "modify", "update"],
  },
];

const AMBIGUOUS_WORDS = new Set(["it", "stuff", "thing", "things", "something", "whatever"]);

function createTaskIntake(input) {
  validateInput(input);

  const taskText = input.taskText;
  const normalizedText = normalizeText(taskText);
  const objective = objectiveFromText(normalizedText);
  const requestedActionClass = requestedActionClassFromText(normalizedText);
  const missingInformation = missingInformationFor(objective, requestedActionClass);
  const ambiguity = ambiguityFor(normalizedText);
  const intake = {
    repositoryPath: stringOrUnknown(input.repositoryPath),
    taskText,
    originalRequest: taskText,
    objective,
    requestedActionClass,
    requirementId: UNKNOWN,
    scopeRequest: {
      requirementId: UNKNOWN,
      taskText,
      objective,
      requestedActionClass,
      ambiguous: ambiguity.length > 0,
    },
    planningRequest: {
      objective,
      taskText,
      requestedActionClass,
      expectedFiles: [UNKNOWN],
      acceptanceCriteria: [UNKNOWN],
      validationCommands: [UNKNOWN],
    },
    missingInformation,
    ambiguity,
    boundaries: {
      approvalRequired: true,
      providerExecution: false,
      promptGeneration: false,
      codeGeneration: false,
      patchApplication: false,
      validationExecution: false,
      fileModification: false,
    },
    reason: reasonFor(missingInformation, ambiguity),
  };
  const normalized = normalizeTaskIntake(intake);

  return {
    ...intake,
    status: normalized.status,
    normalizedObjective: normalized.normalizedObjective,
    taskType: normalized.taskType,
    missingInformation: normalized.missingInformation,
    ambiguityReasons: normalized.ambiguityReasons,
    nextQuestions: normalized.nextQuestions,
    proceedToPlanning: normalized.proceedToPlanning,
    reason: normalized.reason,
    planningRequest: {
      ...intake.planningRequest,
      objective: normalized.normalizedObjective,
      taskType: normalized.taskType,
    },
    intentClassification: normalized,
  };
}

function validateInput(input) {
  if (!isPlainObject(input)) {
    throw new Error("Task intake input is required.");
  }

  if (typeof input.taskText !== "string") {
    throw new Error("Task intake task text is required.");
  }
}

function objectiveFromText(normalizedText) {
  if (normalizedText === UNKNOWN) {
    return UNKNOWN;
  }

  if (isAmbiguousText(normalizedText)) {
    return UNKNOWN;
  }

  return normalizedText;
}

function requestedActionClassFromText(normalizedText) {
  if (normalizedText === UNKNOWN) {
    return UNKNOWN;
  }

  const padded = ` ${normalizedText.toLowerCase()} `;

  for (const rule of ACTION_RULES) {
    if (rule.words.some((word) => padded.includes(` ${word} `))) {
      return rule.actionClass;
    }
  }

  return UNKNOWN;
}

function missingInformationFor(objective, requestedActionClass) {
  const missing = [];

  if (objective === UNKNOWN) {
    missing.push("objective");
  }

  if (requestedActionClass === UNKNOWN) {
    missing.push("requested action class");
  }

  return missing;
}

function ambiguityFor(normalizedText) {
  if (normalizedText === UNKNOWN) {
    return [];
  }

  const words = new Set(normalizedText.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const matches = [...AMBIGUOUS_WORDS].filter((word) => words.has(word));

  if (matches.length === 0) {
    return [];
  }

  return ["Request uses unclear wording."];
}

function reasonFor(missingInformation, ambiguity) {
  if (ambiguity.length > 0) {
    return "Task intake needs review because the request is ambiguous.";
  }

  if (missingInformation.length > 0) {
    return "Task intake needs review because information is missing.";
  }

  return "Task intake is ready for scope checking.";
}

function isAmbiguousText(normalizedText) {
  return ambiguityFor(normalizedText).length > 0;
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return UNKNOWN;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized === "" ? UNKNOWN : normalized;
}

function stringOrUnknown(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return UNKNOWN;
  }

  return value.trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  UNKNOWN,
  createTaskIntake,
};
