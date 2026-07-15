const path = require("node:path");

const UNKNOWN = "UNKNOWN";
const NONE = "NONE";
const CONTROL_CONFIDENCE_STATES = new Set(["APPROVED", "VERIFIED"]);
const SECRET_KEY_PATTERN = /(api[_-]?key|auth|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE_PATTERN = /\b(api[_-]?key|password|secret|token)\s*[:=]/i;
const SECRET_PATH_PATTERN = /(^|\/|[._-])(env|secret|credential|private[-_]?key|api[-_]?key|token)($|\/|[._-])/i;
const SUPPORTED_SOURCE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cpp",
  ".cs",
  ".css",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".java",
  ".js",
  ".jsx",
  ".json",
  ".md",
  ".mjs",
  ".py",
  ".rb",
  ".rs",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);

function createContextPreview(context) {
  validateContext(context);

  const taskPlan = isPlainObject(context.taskPlan) ? context.taskPlan : {};
  const repositoryRoot = stringOrNull(context.repositoryRoot || context.root);
  const approved = approvedRequirements(context.approvedRequirements);
  const details = {
    activeTask: {
      requirementId: stringOrUnknown(taskPlan.requirementId),
      objective: stringOrUnknown(taskPlan.objective),
    },
    approvedRequirements: approved,
    selectedFiles: listOrUnknown(taskPlan.expectedFiles),
    projectFacts: projectFacts(context.repositoryFacts, repositoryRoot),
    factGroups: factGroups(context.repositoryFacts, repositoryRoot, approved),
    fileEvidence: fileEvidence(context.repositoryFacts, repositoryRoot),
    verifiedMemory: verifiedMemory(context.projectMemory, repositoryRoot),
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

function projectFacts(facts, repositoryRoot) {
  if (!Array.isArray(facts) || facts.length === 0) {
    return [
      {
        category: UNKNOWN,
        value: UNKNOWN,
        evidence: [unknownEvidence()],
      },
    ];
  }

  return facts.map((fact) => {
    if (!isPlainObject(fact)) {
      return {
        category: UNKNOWN,
        value: stringOrUnknown(fact),
        evidence: [unknownEvidence()],
      };
    }

    return {
      category: stringOrUnknown(fact.category),
      value: previewValue(fact.value),
      evidence: evidenceItems(fact.evidence, repositoryRoot),
    };
  });
}

function factGroups(facts, repositoryRoot, approved) {
  const grouped = {
    approved,
    verified: [],
    unknown: [],
  };

  for (const fact of projectFacts(facts, repositoryRoot)) {
    const line = projectFactLine(fact);

    if (fact.value === UNKNOWN || fact.evidence.every((entry) => entry.source === UNKNOWN)) {
      grouped.unknown.push(line);
      continue;
    }

    grouped.verified.push(line);
  }

  grouped.verified = grouped.verified.length === 0 ? [NONE] : grouped.verified.sort();
  grouped.unknown = grouped.unknown.length === 0 ? [NONE] : grouped.unknown.sort();

  return grouped;
}

function fileEvidence(facts, repositoryRoot) {
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

      const source = normalizeSourcePath(evidence.source, repositoryRoot);

      if (source !== UNKNOWN) {
        sources.push(source);
      }
    }
  }

  return uniqueSorted(sources).length === 0 ? [UNKNOWN] : uniqueSorted(sources);
}

function verifiedMemory(records, repositoryRoot) {
  if (!Array.isArray(records) || records.length === 0) {
    return [NONE];
  }

  const memory = records
    .filter((record) => {
      if (!isPlainObject(record) || !CONTROL_CONFIDENCE_STATES.has(record.confidenceState)) {
        return false;
      }

      return !isPlainObject(record.source) || record.source.kind !== "model-output";
    })
    .map((record) => {
      const source = memorySource(record.source, repositoryRoot);
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

function memorySource(source, repositoryRoot) {
  if (!isPlainObject(source)) {
    return UNKNOWN;
  }

  const kind = stringOrUnknown(source.kind);
  const sourcePath = normalizeSourcePath(source.source || source.path || source.file, repositoryRoot);

  if (sourcePath !== UNKNOWN) {
    return `${kind}: ${sourcePath}`;
  }

  if (source.source !== undefined || source.path !== undefined || source.file !== undefined) {
    return kind;
  }

  return previewValue(source);
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
    `Approved facts: ${joinList(details.factGroups.approved)}`,
    `Selected files: ${joinList(details.selectedFiles)}`,
    `Verified project facts: ${joinList(details.factGroups.verified)}`,
    `UNKNOWN facts: ${joinList(details.factGroups.unknown)}`,
    `File evidence: ${joinList(details.fileEvidence)}`,
    `Verified memory: ${joinList(details.verifiedMemory)}`,
    `Context budget: facts ${details.contextBudget.repositoryFacts}; memory ${details.contextBudget.memoryRecords}; characters ${details.contextBudget.serializedCharacters}`,
  ].join("\n");
}

function projectFactLine(fact) {
  return `${fact.category}: ${fact.value} (evidence: ${joinList(fact.evidence.map(evidenceLine))})`;
}

function evidenceItems(evidence, repositoryRoot) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return [unknownEvidence()];
  }

  const items = evidence
    .map((entry) => {
      if (!isPlainObject(entry)) {
        return unknownEvidence();
      }

      const source = normalizeSourcePath(entry.source, repositoryRoot);
      const signal = stringOrUnknown(entry.signal);
      const type = evidenceType(entry);

      if (source === UNKNOWN && signal === UNKNOWN) {
        return unknownEvidence();
      }

      return { source, type, signal };
    })
    .filter((entry) => entry.source !== UNKNOWN)
    .sort(compareEvidence);

  return items.length === 0 ? [unknownEvidence()] : items;
}

function evidenceLine(evidence) {
  if (!isPlainObject(evidence) || evidence.source === UNKNOWN) {
    return UNKNOWN;
  }

  return `${evidence.source} [${evidence.type}]: ${evidence.signal}`;
}

function evidenceType(entry) {
  return stringOrUnknown(entry.type || entry.evidenceType || "source");
}

function unknownEvidence() {
  return {
    source: UNKNOWN,
    type: UNKNOWN,
    signal: UNKNOWN,
  };
}

function normalizeSourcePath(source, repositoryRoot) {
  const text = stringOrUnknown(source);

  if (text === UNKNOWN) {
    return UNKNOWN;
  }

  const slashPath = text.replace(/\\/g, "/");
  let relativePath = slashPath;

  if (path.isAbsolute(text) || /^[A-Za-z]:\//.test(slashPath)) {
    if (!repositoryRoot) {
      return UNKNOWN;
    }

    const normalizedRoot = path.resolve(repositoryRoot);
    const normalizedSource = path.resolve(text);
    const relativeToRoot = path.relative(normalizedRoot, normalizedSource);

    if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
      return UNKNOWN;
    }

    relativePath = relativeToRoot.replace(/\\/g, "/");
  }

  const parts = relativePath.split("/").filter(Boolean);

  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    return UNKNOWN;
  }

  const normalized = parts.join("/");

  if (SECRET_PATH_PATTERN.test(normalized)) {
    return UNKNOWN;
  }

  const extension = path.extname(normalized).toLowerCase();

  if (extension && !SUPPORTED_SOURCE_EXTENSIONS.has(extension)) {
    return UNKNOWN;
  }

  return normalized;
}

function compareEvidence(left, right) {
  const leftText = evidenceLine(left);
  const rightText = evidenceLine(right);

  return leftText.localeCompare(rightText);
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

function stringOrNull(value) {
  const text = stringOrUnknown(value);
  return text === UNKNOWN ? null : text;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  UNKNOWN,
  createContextPreview,
};
