const UNKNOWN = "UNKNOWN";

const INTAKE_STATUSES = {
  READY_FOR_PLANNING: "READY_FOR_PLANNING",
  MORE_INFORMATION_REQUIRED: "MORE_INFORMATION_REQUIRED",
  AMBIGUOUS: "AMBIGUOUS",
  REJECTED: "REJECTED",
};

const SUPPORTED_TASK_TYPES = new Set(["implementation", "analysis", "validation", "review", "planning"]);
const INTENT_RULES = [
  {
    taskType: "implementation",
    words: ["add", "build", "change", "create", "fix", "implement", "improve", "make", "modify", "refactor", "update"],
  },
  {
    taskType: "analysis",
    words: ["analyze", "explain", "inspect", "investigate", "summarize"],
  },
  {
    taskType: "validation",
    words: ["check", "test", "validate", "verify"],
  },
  {
    taskType: "review",
    words: ["audit", "review"],
  },
  {
    taskType: "planning",
    words: ["design", "estimate", "outline", "plan"],
  },
];
const UNSAFE_PHRASES = [
  "bypass approval",
  "disable approval",
  "exfiltrate",
  "format drive",
  "ignore approval",
  "leak secret",
  "rm -rf",
  "steal",
  "wipe",
];
const OUT_OF_SCOPE_PHRASES = [
  "autocomplete",
  "cloud sync",
  "deploy to production",
  "extension marketplace",
  "marketplace",
  "mobile app",
  "standalone ide",
  "team collaboration",
  "voice control",
];

function normalizeTaskIntake(intake) {
  if (!isPlainObject(intake)) {
    return rejectedResult({
      originalRequest: UNKNOWN,
      repositoryPath: UNKNOWN,
      reason: "Task intake is malformed.",
      missingInformation: ["task intake"],
    });
  }

  const originalRequest = stringOrUnknown(intake.originalRequest || intake.taskText);
  const repositoryPath = stringOrUnknown(intake.repositoryPath);
  const taskText = stringOrUnknown(intake.taskText || intake.originalRequest);
  const normalizedObjective = normalizedObjectiveFor(intake.objective, taskText);
  const unsafeReason = unsafeReasonFor(taskText);
  const outOfScopeReason = outOfScopeReasonFor(taskText);
  const ambiguityReasons = ambiguityReasonsFor(intake, taskText);
  const taskType = taskTypeFor(taskText, intake.requestedActionClass);
  const missingInformation = missingInformationFor({
    normalizedObjective,
    repositoryPath,
    taskText,
    taskType,
  });

  if (taskText === UNKNOWN) {
    return rejectedResult({
      originalRequest,
      repositoryPath,
      reason: "Task intake is empty.",
      missingInformation: ["task text"],
    });
  }

  if (unsafeReason) {
    return rejectedResult({
      originalRequest,
      repositoryPath,
      reason: unsafeReason,
      taskText,
      normalizedObjective,
      taskType,
    });
  }

  if (outOfScopeReason) {
    return rejectedResult({
      originalRequest,
      repositoryPath,
      reason: outOfScopeReason,
      taskText,
      normalizedObjective,
      taskType,
    });
  }

  if (ambiguityReasons.length > 0) {
    return result({
      status: INTAKE_STATUSES.AMBIGUOUS,
      originalRequest,
      repositoryPath,
      taskText,
      normalizedObjective,
      taskType,
      missingInformation,
      ambiguityReasons,
      nextQuestions: ["Which specific target should Levi use?"],
      reason: "Task intake is ambiguous.",
    });
  }

  if (missingInformation.length > 0) {
    return result({
      status: INTAKE_STATUSES.MORE_INFORMATION_REQUIRED,
      originalRequest,
      repositoryPath,
      taskText,
      normalizedObjective,
      taskType,
      missingInformation,
      ambiguityReasons,
      nextQuestions: nextQuestionsFor(missingInformation),
      reason: "Task intake needs more information.",
    });
  }

  return result({
    status: INTAKE_STATUSES.READY_FOR_PLANNING,
    originalRequest,
    repositoryPath,
    taskText,
    normalizedObjective,
    taskType,
    missingInformation,
    ambiguityReasons,
    nextQuestions: [],
    reason: "Task intake is ready for planning.",
  });
}

function rejectedResult(input) {
  return result({
    status: INTAKE_STATUSES.REJECTED,
    originalRequest: input.originalRequest,
    repositoryPath: input.repositoryPath,
    taskText: input.taskText || UNKNOWN,
    normalizedObjective: input.normalizedObjective || UNKNOWN,
    taskType: input.taskType || UNKNOWN,
    missingInformation: input.missingInformation || [],
    ambiguityReasons: [],
    nextQuestions: [],
    reason: input.reason,
  });
}

function result(input) {
  return {
    status: input.status,
    originalRequest: input.originalRequest,
    repositoryPath: input.repositoryPath,
    taskText: input.taskText,
    normalizedObjective: input.normalizedObjective,
    taskType: input.taskType,
    missingInformation: [...input.missingInformation].sort(),
    ambiguityReasons: [...input.ambiguityReasons].sort(),
    nextQuestions: [...input.nextQuestions].sort(),
    proceedToPlanning: input.status === INTAKE_STATUSES.READY_FOR_PLANNING,
    approvalRequired: true,
    reason: input.reason,
  };
}

function normalizedObjectiveFor(objective, taskText) {
  const source = stringOrUnknown(objective) === UNKNOWN ? taskText : objective;
  const normalized = stringOrUnknown(source);

  if (normalized === UNKNOWN) {
    return UNKNOWN;
  }

  return stripPolitePrefix(normalized).split(/[.!?]\s+/)[0].slice(0, 160).trim() || UNKNOWN;
}

function taskTypeFor(taskText, requestedActionClass) {
  const text = stringOrUnknown(taskText);

  if (text === UNKNOWN) {
    return UNKNOWN;
  }

  const lower = ` ${text.toLowerCase()} `;

  for (const rule of INTENT_RULES) {
    if (rule.words.some((word) => lower.includes(` ${word} `))) {
      return rule.taskType;
    }
  }

  if (["CREATE", "FIX", "REFACTOR", "UPDATE"].includes(requestedActionClass)) {
    return "implementation";
  }

  return UNKNOWN;
}

function missingInformationFor(input) {
  const missing = [];

  if (input.repositoryPath === UNKNOWN) {
    missing.push("repository path");
  }

  if (input.taskText === UNKNOWN) {
    missing.push("task text");
  }

  if (input.normalizedObjective === UNKNOWN) {
    missing.push("objective");
  }

  if (input.taskType === UNKNOWN) {
    missing.push("task type");
  }

  return missing;
}

function ambiguityReasonsFor(intake, taskText) {
  const reasons = [];

  if (Array.isArray(intake.ambiguity)) {
    reasons.push(...intake.ambiguity.filter((entry) => typeof entry === "string" && entry.trim() !== ""));
  }

  if (isAmbiguousPronounOnly(taskText)) {
    reasons.push("Request uses unclear wording.");
  }

  return [...new Set(reasons)];
}

function unsafeReasonFor(taskText) {
  return phraseReason(taskText, UNSAFE_PHRASES, "Task intake is rejected because it requests unsafe work.");
}

function outOfScopeReasonFor(taskText) {
  return phraseReason(taskText, OUT_OF_SCOPE_PHRASES, "Task intake is rejected because it is out of scope.");
}

function phraseReason(taskText, phrases, reason) {
  const text = stringOrUnknown(taskText);

  if (text === UNKNOWN) {
    return null;
  }

  const lower = text.toLowerCase();
  return phrases.some((phrase) => lower.includes(phrase)) ? reason : null;
}

function nextQuestionsFor(missingInformation) {
  const questions = [];

  if (missingInformation.includes("objective")) {
    questions.push("What should Levi do?");
  }

  if (missingInformation.includes("task type")) {
    questions.push("Is this implementation, analysis, validation, review, or planning?");
  }

  if (missingInformation.includes("repository path")) {
    questions.push("Which repository should Levi use?");
  }

  return questions;
}

function isAmbiguousPronounOnly(taskText) {
  const text = stringOrUnknown(taskText);

  if (text === UNKNOWN) {
    return false;
  }

  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.some((word) => ["it", "stuff", "thing", "things", "something", "that"].includes(word));
}

function stripPolitePrefix(value) {
  return value.replace(/^(please|can you|could you|would you)\s+/i, "").trim();
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
  INTAKE_STATUSES,
  SUPPORTED_TASK_TYPES,
  UNKNOWN,
  normalizeTaskIntake,
};
