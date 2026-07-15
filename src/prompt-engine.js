const CONTROL_CONFIDENCE_STATES = new Set(["APPROVED", "VERIFIED"]);
const SECRET_KEY_PATTERN = /(api[_-]?key|auth|credential|password|secret|token)/i;

function buildPrompt(input) {
  validateInput(input);

  const taskPlan = sanitizeValue(input.taskPlan);
  const sections = [
    section("Objective", [valueOrUnknown(taskPlan.objective)]),
    section("Scope Boundaries", listValues(taskPlan.scopeBoundaries || taskPlan.scope || "UNKNOWN")),
    section("Expected Files", listValues(taskPlan.expectedFiles)),
    section("Acceptance Criteria", listValues(taskPlan.acceptanceCriteria)),
    section("Validation Commands", listValues(taskPlan.validationCommands)),
    section("Risks", listValues(taskPlan.risks)),
    section("Explicit Exclusions", listValues(taskPlan.exclusions)),
    section("Approved Requirements", serializeCollection(input.approvedRequirements)),
    section("Cited Repository Facts", serializeCollection(input.repositoryFacts)),
    section("Verified Project Memory", serializeCollection(filterMemory(input.projectMemory))),
    section("Required Output", listValues(input.outputInstructions || "UNKNOWN")),
  ];

  return {
    prompt: renderPrompt(sections),
    sections,
  };
}

function validateInput(input) {
  if (!isPlainObject(input)) {
    throw new Error("Prompt engine input is required.");
  }

  if (!isPlainObject(input.taskPlan)) {
    throw new Error("Prompt engine taskPlan is required.");
  }

  if (input.taskPlan.approvalState !== "APPROVED") {
    throw new Error("Prompt engine requires an approved task plan.");
  }

  validateOptionalArray(input.approvedRequirements, "approvedRequirements");
  validateOptionalArray(input.repositoryFacts, "repositoryFacts");
  validateOptionalArray(input.projectMemory, "projectMemory");
}

function validateOptionalArray(value, fieldName) {
  if (value !== undefined && !Array.isArray(value)) {
    throw new Error(`Prompt engine ${fieldName} must be an array.`);
  }
}

function section(title, lines) {
  return {
    title,
    lines: normalizeLines(lines),
  };
}

function renderPrompt(sections) {
  return `${sections
    .map((promptSection) => {
      const lines = promptSection.lines.length > 0 ? promptSection.lines : ["UNKNOWN"];
      return [`## ${promptSection.title}`, ...lines.map((line) => `- ${line}`)].join("\n");
    })
    .join("\n\n")}\n`;
}

function listValues(value) {
  if (value === undefined || value === null) {
    return ["UNKNOWN"];
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? ["UNKNOWN"] : value.map(valueOrUnknown);
  }

  return [valueOrUnknown(value)];
}

function serializeCollection(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return ["UNKNOWN"];
  }

  const serialized = values
    .map(sanitizeValue)
    .filter((value) => value !== undefined)
    .map(stableSerialize)
    .sort();

  return serialized.length === 0 ? ["UNKNOWN"] : serialized;
}

function filterMemory(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.filter((record) => {
    if (!isPlainObject(record)) {
      return false;
    }

    return CONTROL_CONFIDENCE_STATES.has(record.confidenceState);
  });
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue).filter((entry) => entry !== undefined);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const sanitized = {};

  for (const key of Object.keys(value).sort()) {
    if (SECRET_KEY_PATTERN.test(key)) {
      continue;
    }

    const child = sanitizeValue(value[key]);

    if (child !== undefined) {
      sanitized[key] = child;
    }
  }

  return sanitized;
}

function stableSerialize(value) {
  if (value === undefined || value === null) {
    return "UNKNOWN";
  }

  if (typeof value === "string") {
    return value.trim() === "" ? "UNKNOWN" : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(", ")}]`;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const parts = keys.map((key) => `${key}: ${stableSerialize(value[key])}`);
    return `{${parts.join(", ")}}`;
  }

  return String(value);
}

function normalizeLines(lines) {
  return lines.map(valueOrUnknown).filter((line) => line.trim() !== "");
}

function valueOrUnknown(value) {
  const serialized = stableSerialize(value);
  return serialized.trim() === "" ? "UNKNOWN" : serialized;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  buildPrompt,
};
