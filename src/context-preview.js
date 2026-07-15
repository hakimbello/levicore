const UNKNOWN = "UNKNOWN";
const NONE = "NONE";
const CONTROL_CONFIDENCE_STATES = new Set(["APPROVED", "VERIFIED"]);
const SECRET_KEY_PATTERN = /(api[_-]?key|auth|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE_PATTERN = /\b(api[_-]?key|password|secret|token)\s*[:=]/i;

function createContextPreview(context) {
  validateContext(context);

  const taskPlan = isPlainObject(context.taskPlan) ? context.taskPlan : {};
  const details = {
    activeTask: {
      requirementId: stringOrUnknown(taskPlan.requirementId),
      objective: stringOrUnknown(taskPlan.objective),
    },
    approvedRequirements: approvedRequirements(context.approvedRequirements),
    selectedFiles: listOrUnknown(taskPlan.expectedFiles),
    projectFacts: projectFacts(context.repositoryFacts),
    fileEvidence: fileEvidence(context.repositoryFacts),
    verifiedMemory: verifiedMemory(context.projectMemory),
    contextBudget: contextBudget(context.contextBudget),
  };

  return {
    text: renderPreview(details),
    details,
  };
}

function validateContext(context) {
  if (!isPlainObject(context)) {
    throw new Error("Context preview input is required.");
  }
}

function approvedRequirements(requirements) {
  if (!Array.isArray(requirements) || requirements.length === 0) {
    return [UNKNOWN];
  }

  return requirements
    .map((requirement) => {
      if (!isPlainObject(requirement)) {
        return stringOrUnknown(requirement);
      }

      const id = stringOrUnknown(requirement.id);
      const title = stringOrUnknown(requirement.title);
      return title === UNKNOWN ? id : `${id}: ${title}`;
    })
    .filter((value) => value !== UNKNOWN)
    .sort();
}

function projectFacts(facts) {
  if (!Array.isArray(facts) || facts.length === 0) {
    return [
      {
        category: UNKNOWN,
        value: UNKNOWN,
        evidence: [UNKNOWN],
      },
    ];
  }

  return facts.map((fact) => {
    if (!isPlainObject(fact)) {
      return {
        category: UNKNOWN,
        value: stringOrUnknown(fact),
        evidence: [UNKNOWN],
      };
    }

    return {
      category: stringOrUnknown(fact.category),
      value: previewValue(fact.value),
      evidence: evidenceLines(fact.evidence),
    };
  });
}

function fileEvidence(facts) {
  if (!Array.isArray(facts)) {
    return [UNKNOWN];
  }

  const sources = [];

  for (const fact of facts) {
    if (!isPlainObject(fact) || !Array.isArray(fact.evidence)) {
      continue;
    }

    for (const evidence of fact.evidence) {
      if (!isPlainObject(evidence)) {
        continue;
      }

      const source = stringOrUnknown(evidence.source);

      if (source !== UNKNOWN) {
        sources.push(source);
      }
    }
  }

  return uniqueSorted(sources).length === 0 ? [UNKNOWN] : uniqueSorted(sources);
}

function verifiedMemory(records) {
  if (!Array.isArray(records) || records.length === 0) {
    return [NONE];
  }

  const memory = records
    .filter((record) => isPlainObject(record) && CONTROL_CONFIDENCE_STATES.has(record.confidenceState))
    .map((record) => {
      const source = isPlainObject(record.source) ? previewValue(record.source) : UNKNOWN;
      return [
        `Type: ${stringOrUnknown(record.type)}`,
        `State: ${stringOrUnknown(record.confidenceState)}`,
        `Source: ${source}`,
        `Value: ${previewValue(record.value)}`,
      ].join(". ");
    })
    .sort();

  return memory.length === 0 ? [NONE] : memory;
}

function contextBudget(budget) {
  if (!isPlainObject(budget)) {
    return {
      repositoryFacts: UNKNOWN,
      memoryRecords: UNKNOWN,
      serializedCharacters: UNKNOWN,
    };
  }

  return {
    repositoryFacts: stringOrUnknown(budget.repositoryFacts),
    memoryRecords: stringOrUnknown(budget.memoryRecords),
    serializedCharacters: stringOrUnknown(budget.serializedCharacters),
  };
}

function renderPreview(details) {
  return [
    "Context preview",
    `Active task: ${details.activeTask.requirementId}. ${details.activeTask.objective}`,
    `Approved requirements: ${joinList(details.approvedRequirements)}`,
    `Selected files: ${joinList(details.selectedFiles)}`,
    `Project facts: ${details.projectFacts.map(projectFactLine).join(" | ")}`,
    `File evidence: ${joinList(details.fileEvidence)}`,
    `Verified memory: ${joinList(details.verifiedMemory)}`,
    `Context budget: facts ${details.contextBudget.repositoryFacts}; memory ${details.contextBudget.memoryRecords}; characters ${details.contextBudget.serializedCharacters}`,
  ].join("\n");
}

function projectFactLine(fact) {
  return `${fact.category}: ${fact.value} (evidence: ${joinList(fact.evidence)})`;
}

function evidenceLines(evidence) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return [UNKNOWN];
  }

  const lines = evidence
    .map((entry) => {
      if (!isPlainObject(entry)) {
        return UNKNOWN;
      }

      const source = stringOrUnknown(entry.source);
      const signal = stringOrUnknown(entry.signal);

      if (source === UNKNOWN && signal === UNKNOWN) {
        return UNKNOWN;
      }

      return `${source}: ${signal}`;
    })
    .filter((line) => line !== UNKNOWN)
    .sort();

  return lines.length === 0 ? [UNKNOWN] : lines;
}

function previewValue(value) {
  return stringOrUnknown(stableSerialize(sanitizePreviewValue(value)));
}

function sanitizePreviewValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizePreviewValue).filter((entry) => entry !== undefined);
  }

  if (typeof value === "string") {
    return SECRET_VALUE_PATTERN.test(value) ? undefined : value;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const sanitized = {};

  for (const key of Object.keys(value).sort()) {
    if (SECRET_KEY_PATTERN.test(key)) {
      continue;
    }

    const child = sanitizePreviewValue(value[key]);

    if (child !== undefined) {
      sanitized[key] = child;
    }
  }

  return Object.keys(sanitized).length === 0 ? UNKNOWN : sanitized;
}

function listOrUnknown(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return [UNKNOWN];
  }

  const values = value.map(stringOrUnknown).filter((entry) => entry !== UNKNOWN).sort();
  return values.length === 0 ? [UNKNOWN] : values;
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort();
}

function joinList(values) {
  return values.length === 0 ? UNKNOWN : values.join(", ");
}

function stableSerialize(value) {
  if (value === undefined || value === null) {
    return UNKNOWN;
  }

  if (typeof value === "string") {
    return value.trim() === "" ? UNKNOWN : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? UNKNOWN : `[${value.map(stableSerialize).join(", ")}]`;
  }

  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}: ${stableSerialize(value[key])}`)
      .join(", ")}}`;
  }

  return String(value);
}

function stringOrUnknown(value) {
  if (value === undefined || value === null) {
    return UNKNOWN;
  }

  const text = String(value).trim();
  return text === "" ? UNKNOWN : text;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  UNKNOWN,
  createContextPreview,
};
