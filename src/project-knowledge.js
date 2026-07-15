const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { buildContext } = require("./context-builder");
const { summarizeProject } = require("./project-summary");
const { scanRepository } = require("./repository-scanner");

const UNKNOWN = "UNKNOWN";
const PENDING = "PENDING";
const VERIFIED = "VERIFIED";
const APPROVED = "APPROVED";
const REJECTED = "REJECTED";
const APPROVE_PROJECT_KNOWLEDGE = "APPROVE_PROJECT_KNOWLEDGE";
const REJECT_PROJECT_KNOWLEDGE = "REJECT_PROJECT_KNOWLEDGE";
const REMOVE_PROJECT_KNOWLEDGE = "REMOVE_PROJECT_KNOWLEDGE";
const CONTROL_CONFIDENCE_STATES = new Set([APPROVED, VERIFIED]);
const KNOWLEDGE_CATEGORIES = [
  "architecture",
  "languages",
  "frameworks",
  "packageManagers",
  "entryPoints",
  "validationCommands",
  "dependencies",
  "directoryRoles",
  "codingConventions",
  "businessRules",
  "protectedSystems",
];
const SOURCE_EXTENSIONS = new Set([
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
const DOCUMENT_EXTENSIONS = new Set([".md", ".txt"]);
const CONFIG_EXTENSIONS = new Set([".json", ".yml", ".yaml"]);
const SECRET_PATH_PATTERN = /(^|\/|[._-])(env|secret|credential|private[-_]?key|api[-_]?key|token)($|\/|[._-])/i;
const GENERATED_PATH_PATTERN = /(^|\/)(coverage|dist|build|out|generated|\.next)($|\/)|(^|\/).*\.min\.[a-z0-9]+$/i;
const DEPENDENCY_PATH_PATTERN = /(^|\/)(node_modules|vendor)($|\/)/i;
const BINARY_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|exe|dll|so|dylib|bin|wasm)$/i;
const SECRET_KEY_PATTERN = /(api[_-]?key|auth|credential|password|private[_-]?key|secret|token)/i;
const SECRET_VALUE_PATTERN = /\b(api[_-]?key|password|secret|token)\s*[:=]/i;
const ARCHITECTURE_FILE_PATTERN = /(^|\/)(architecture|system-design|design|adr|docs\/architecture)(\.[a-z0-9]+|\/|$)/i;
const CODING_CONVENTION_FILE_PATTERN =
  /(^|\/)(eslint\.config|\.eslintrc|\.prettierrc|prettier\.config|tsconfig|jsconfig|pyproject|ruff|biome\.json)/i;
const VALIDATION_SCRIPT_PATTERN = /^(test|lint|build|check|typecheck|validate|format:check|test:.+)$/i;
const BUSINESS_RULE_PATTERN =
  /\b(business rule|must|must not|required|requires|requirement|constraint|non-goal|scope|acceptance criteria)\b/i;
const CODING_CONVENTION_PATTERN = /\b(coding standard|convention|style|format|lint|typecheck|typescript|eslint|prettier|ruff)\b/i;
const PROTECTED_SYSTEM_PATTERN =
  /\b(protected|do not modify|do not touch|must not modify|approval required|secret|credential|runtime metadata|safe patch|repository boundary|destructive)\b/i;
const MAX_DOCUMENT_FACTS_PER_CATEGORY = 25;

function extractProjectKnowledge(options) {
  validateOptions(options);

  const projectId = stringOrUnknown(options.projectId || "default");
  const scanResult = options.scanResult || scanRepository(options.repositoryPath);
  const projectSummary = options.projectSummary || summarizeProject(scanResult);
  const repositoryRoot = path.resolve(projectSummary.root || scanResult.root || options.repositoryPath);
  const projectMemory = resolveMemoryRecords(options, projectId);
  const context = options.context || buildExtractionContext(projectId, projectSummary, projectMemory);
  const files = safeProjectFiles(projectSummary.files);
  const categories = emptyCategories();

  addSummaryFacts(categories.languages, "languages", projectSummary.languages);
  addSummaryFacts(categories.frameworks, "frameworks", projectSummary.frameworks);
  addSummaryFacts(categories.packageManagers, "packageManagers", projectSummary.packageManagers);
  addSummaryFacts(categories.entryPoints, "entryPoints", projectSummary.entryPoints);
  addDependencyFacts(categories.dependencies, projectSummary.dependencies);
  addDirectoryRoleFacts(categories.directoryRoles, projectSummary.majorDirectories);
  addValidationCommandFacts(categories.validationCommands, repositoryRoot, files, projectSummary.tests);
  addArchitectureFacts(categories.architecture, repositoryRoot, files);
  addDocumentPatternFacts(categories.codingConventions, "codingConventions", repositoryRoot, files, CODING_CONVENTION_PATTERN);
  addDocumentPatternFacts(categories.businessRules, "businessRules", repositoryRoot, files, BUSINESS_RULE_PATTERN);
  addDocumentPatternFacts(categories.protectedSystems, "protectedSystems", repositoryRoot, files, PROTECTED_SYSTEM_PATTERN);
  addCodingConventionConfigFacts(categories.codingConventions, files);
  addMemoryFacts(categories, projectMemory, projectId);
  addUnknownFacts(categories);
  sortCategories(categories);

  return {
    status: "EXTRACTED",
    approvalState: PENDING,
    persistenceState: "NOT_PERSISTED",
    projectId,
    repositoryRoot,
    categories,
    conflicts: detectUnresolvedConflicts(categories),
    evidenceSummary: evidenceSummary(categories, context),
  };
}

function approveProjectKnowledge(options) {
  const result = approveProjectKnowledgeFacts({
    ...options,
    facts: [options.fact],
  });

  return {
    ...result,
    record: result.records[0] || null,
    factResult: result.results[0] || null,
  };
}

function approveProjectKnowledgeFacts(options) {
  validateApprovalOptions(options);

  const projectId = stringOrUnknown(options.projectId || "default");
  const facts = normalizeApprovalFacts(options);
  const existingRecords = options.memoryStore.listRecords(projectId);
  const timestamp = normalizeApprovalTimestamp(options.timestamp);
  const explicitApproval = options.approval === APPROVE_PROJECT_KNOWLEDGE;
  const results = [];
  const records = [];

  for (const fact of facts) {
    const validation = explicitApproval
      ? validateApprovableFact(fact, options.extraction)
      : { ok: false, reason: "Explicit project knowledge approval is required." };

    if (!validation.ok) {
      results.push(rejectedApprovalResult(fact, validation.reason));
      continue;
    }

    const duplicate = findDuplicateKnowledgeRecord(existingRecords, projectId, fact);

    if (duplicate) {
      results.push({
        status: "DUPLICATE",
        reason: "Approved project knowledge fact already exists.",
        record: duplicate,
        fact,
      });
      continue;
    }

    const record = projectKnowledgeRecord({
      fact,
      projectId,
      timestamp,
    });
    const stored = options.memoryStore.addRecord(projectId, record);

    existingRecords.push(stored);
    records.push(stored);
    results.push({
      status: "APPROVED",
      record: stored,
      fact,
    });
  }

  return {
    status: approvalBatchStatus(results),
    projectId,
    records,
    results,
  };
}

function rejectProjectKnowledgeFact(options) {
  if (!isPlainObject(options)) {
    throw new Error("Project knowledge rejection options are required.");
  }

  const explicitRejection = options.rejection === REJECT_PROJECT_KNOWLEDGE;

  return {
    status: explicitRejection ? REJECTED : "REJECTION_REQUIRED",
    reason: explicitRejection ? stringOrUnknown(options.reason || "Project knowledge fact rejected.") : "Explicit project knowledge rejection is required.",
    fact: options.fact ? cloneJson(options.fact) : null,
  };
}

function removeApprovedProjectKnowledge(options) {
  validateRemovalOptions(options);

  const projectId = stringOrUnknown(options.projectId || "default");

  if (options.confirmation !== REMOVE_PROJECT_KNOWLEDGE) {
    return {
      status: "CONFIRMATION_REQUIRED",
      projectId,
      recordId: stringOrUnknown(options.recordId),
      removed: false,
      reason: "Explicit project knowledge removal confirmation is required.",
    };
  }

  const record = options.memoryStore
    .listRecords(projectId)
    .find((candidate) => candidate.id === options.recordId && isApprovedProjectKnowledgeRecord(candidate, projectId));

  if (!record) {
    return {
      status: "NOT_FOUND",
      projectId,
      recordId: stringOrUnknown(options.recordId),
      removed: false,
      reason: "Approved project knowledge record was not found.",
    };
  }

  const removed = options.memoryStore.removeRecord(projectId, options.recordId);

  return {
    status: removed ? "REMOVED" : "NOT_FOUND",
    projectId,
    recordId: options.recordId,
    removed,
    record,
  };
}

function validateApprovalOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Project knowledge approval options are required.");
  }

  if (!isMemoryStore(options.memoryStore)) {
    throw new Error("Project knowledge approval requires a memoryStore.");
  }
}

function validateRemovalOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Project knowledge removal options are required.");
  }

  if (!isMemoryStore(options.memoryStore)) {
    throw new Error("Project knowledge removal requires a memoryStore.");
  }

  if (typeof options.recordId !== "string" || options.recordId.trim() === "") {
    throw new Error("Project knowledge removal requires a recordId.");
  }
}

function normalizeApprovalFacts(options) {
  const facts = options.facts || (options.fact ? [options.fact] : []);

  if (!Array.isArray(facts) || facts.length === 0) {
    throw new Error("Project knowledge approval requires at least one fact.");
  }

  return facts.map(cloneJson);
}

function normalizeApprovalTimestamp(timestamp) {
  if (timestamp === undefined) {
    return new Date().toISOString();
  }

  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) {
    throw new Error("Project knowledge approval timestamp must be valid.");
  }

  return timestamp;
}

function validateApprovableFact(fact, extraction) {
  if (!isPlainObject(fact)) {
    return { ok: false, reason: "Project knowledge fact must be an object." };
  }

  if (!KNOWLEDGE_CATEGORIES.includes(fact.category)) {
    return { ok: false, reason: "Unsupported project knowledge category." };
  }

  if (fact.value === UNKNOWN || fact.value === undefined) {
    return { ok: false, reason: "UNKNOWN project knowledge cannot be approved." };
  }

  if (fact.approvalState === REJECTED) {
    return { ok: false, reason: "Rejected project knowledge cannot be approved." };
  }

  if (!CONTROL_CONFIDENCE_STATES.has(fact.confidenceState)) {
    return { ok: false, reason: "Unverified project knowledge cannot be approved." };
  }

  if (!Array.isArray(fact.evidence) || normalizeEvidence(fact.evidence).length === 0) {
    return { ok: false, reason: "Project knowledge approval requires source evidence." };
  }

  if (containsUnsafePath(fact) || containsSecretValue(fact) || containsModelOutputEvidence(fact)) {
    return { ok: false, reason: "Unsafe or model-output project knowledge cannot be approved." };
  }

  if (isUnresolvedConflictFact(fact, extraction)) {
    return { ok: false, reason: "Unresolved conflicting project knowledge requires review before approval." };
  }

  return { ok: true };
}

function isUnresolvedConflictFact(fact, extraction) {
  if (!isPlainObject(extraction) || !Array.isArray(extraction.conflicts)) {
    return false;
  }

  return extraction.conflicts.some((conflict) => {
    if (!isPlainObject(conflict) || conflict.status !== "UNRESOLVED" || conflict.category !== fact.category) {
      return false;
    }

    return Array.isArray(conflict.values) && conflict.values.includes(stableSerialize(fact.value));
  });
}

function containsModelOutputEvidence(value) {
  if (typeof value === "string") {
    return value.toLowerCase().includes("model-output");
  }

  if (Array.isArray(value)) {
    return value.some(containsModelOutputEvidence);
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).some(containsModelOutputEvidence);
}

function containsSecretValue(value) {
  if (typeof value === "string") {
    return SECRET_VALUE_PATTERN.test(value);
  }

  if (Array.isArray(value)) {
    return value.some(containsSecretValue);
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.entries(value).some(([key, child]) => SECRET_KEY_PATTERN.test(key) || containsSecretValue(child));
}

function projectKnowledgeRecord(input) {
  return {
    id: projectKnowledgeId(input.projectId, input.fact),
    projectId: input.projectId,
    type: "project-fact",
    source: {
      kind: "project-knowledge",
      category: input.fact.category,
      evidence: normalizeEvidence(input.fact.evidence),
    },
    timestamp: input.timestamp,
    confidenceState: APPROVED,
    value: {
      category: input.fact.category,
      value: sanitizeValue(input.fact.value),
      evidence: normalizeEvidence(input.fact.evidence),
      approvalState: APPROVED,
      extractedConfidenceState: input.fact.confidenceState,
    },
  };
}

function projectKnowledgeId(projectId, fact) {
  return `project-knowledge-${crypto
    .createHash("sha256")
    .update(projectKnowledgeFingerprint(projectId, fact))
    .digest("hex")
    .slice(0, 16)}`;
}

function findDuplicateKnowledgeRecord(records, projectId, fact) {
  const fingerprint = projectKnowledgeFingerprint(projectId, fact);

  return records.find((record) => {
    if (!isApprovedProjectKnowledgeRecord(record, projectId)) {
      return false;
    }

    return projectKnowledgeRecordFingerprint(record) === fingerprint;
  });
}

function isApprovedProjectKnowledgeRecord(record, projectId) {
  if (!isPlainObject(record) || record.type !== "project-fact") {
    return false;
  }

  if (record.projectId !== undefined && record.projectId !== projectId) {
    return false;
  }

  if (!CONTROL_CONFIDENCE_STATES.has(record.confidenceState)) {
    return false;
  }

  if (!isPlainObject(record.source) || record.source.kind !== "project-knowledge") {
    return false;
  }

  if (!isPlainObject(record.value) || !KNOWLEDGE_CATEGORIES.includes(record.value.category)) {
    return false;
  }

  return record.value.value !== UNKNOWN && !containsUnsafePath(record) && !containsModelOutputEvidence(record);
}

function projectKnowledgeFingerprint(projectId, fact) {
  return stableSerialize({
    projectId,
    category: fact.category,
    value: sanitizeValue(fact.value),
  });
}

function projectKnowledgeRecordFingerprint(record) {
  return stableSerialize({
    projectId: record.projectId || UNKNOWN,
    category: record.value.category,
    value: sanitizeValue(record.value.value),
  });
}

function rejectedApprovalResult(fact, reason) {
  return {
    status: REJECTED,
    reason,
    fact,
  };
}

function approvalBatchStatus(results) {
  if (results.every((result) => result.status === "APPROVED")) {
    return "APPROVED";
  }

  if (results.every((result) => result.status === "DUPLICATE")) {
    return "DUPLICATE";
  }

  if (results.every((result) => result.status === REJECTED)) {
    return REJECTED;
  }

  return "PARTIAL";
}

function validateOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Project knowledge extraction options are required.");
  }

  if (!options.repositoryPath && !options.projectSummary && !options.scanResult) {
    throw new Error("Project knowledge extraction requires repositoryPath, projectSummary, or scanResult.");
  }

  if (options.projectMemory !== undefined && !Array.isArray(options.projectMemory)) {
    throw new Error("Project knowledge extraction projectMemory must be an array.");
  }

  if (options.memoryStore !== undefined && !isMemoryStore(options.memoryStore)) {
    throw new Error("Project knowledge extraction memoryStore must provide listRecords.");
  }
}

function buildExtractionContext(projectId, projectSummary, projectMemory) {
  return buildContext({
    projectId,
    taskPlan: {
      requirementId: "POST_MVP until approved by owner",
      objective: "Project Knowledge Extraction",
      expectedFiles: [],
      validationCommands: [],
    },
    approvedRequirements: [],
    projectSummary,
    projectMemory,
  });
}

function resolveMemoryRecords(options, projectId) {
  const records = options.memoryStore ? options.memoryStore.listRecords(projectId) : options.projectMemory || [];

  return records.filter((record) => isControlMemoryRecord(record, projectId)).map(cloneJson).sort(compareStable);
}

function isControlMemoryRecord(record, projectId) {
  if (!isPlainObject(record)) {
    return false;
  }

  if (!CONTROL_CONFIDENCE_STATES.has(record.confidenceState)) {
    return false;
  }

  if (record.projectId !== undefined && record.projectId !== projectId) {
    return false;
  }

  if (isPlainObject(record.source) && record.source.kind === "model-output") {
    return false;
  }

  if (containsUnsafePath(record.source) || containsUnsafePath(record.value)) {
    return false;
  }

  return true;
}

function emptyCategories() {
  return Object.fromEntries(KNOWLEDGE_CATEGORIES.map((category) => [category, []]));
}

function addSummaryFacts(target, category, value) {
  if (value === UNKNOWN || value === undefined || value === null) {
    return;
  }

  for (const entry of asArray(value)) {
    if (!isPlainObject(entry)) {
      continue;
    }

    const evidence = normalizeEvidence(entry.evidence);

    if (evidence.length === 0) {
      continue;
    }

    target.push(createFact(category, entry.name || entry.value || UNKNOWN, evidence));
  }
}

function addDependencyFacts(target, dependencies) {
  if (!Array.isArray(dependencies)) {
    return;
  }

  for (const manifest of dependencies) {
    if (!isPlainObject(manifest) || !Array.isArray(manifest.dependencies)) {
      continue;
    }

    for (const dependency of manifest.dependencies) {
      if (!isPlainObject(dependency)) {
        continue;
      }

      const evidence = normalizeEvidence(dependency.evidence || { source: manifest.source, signal: "dependency manifest" });

      if (evidence.length === 0) {
        continue;
      }

      target.push(
        createFact(
          "dependencies",
          {
            name: stringOrUnknown(dependency.name),
            version: stringOrUnknown(dependency.version),
            group: stringOrUnknown(dependency.group),
          },
          evidence,
        ),
      );
    }
  }
}

function addDirectoryRoleFacts(target, directories) {
  if (!Array.isArray(directories)) {
    return;
  }

  for (const directory of directories) {
    if (!isPlainObject(directory) || typeof directory.name !== "string") {
      continue;
    }

    const evidence = normalizeEvidence(directory.evidence);

    if (evidence.length === 0) {
      continue;
    }

    target.push(
      createFact(
        "directoryRoles",
        {
          directory: directory.name,
          role: directoryRole(directory.name),
        },
        evidence,
      ),
    );
  }
}

function addValidationCommandFacts(target, repositoryRoot, files, tests) {
  addSummaryFacts(target, "validationCommands", tests);
  addPythonTestCommandFact(target, tests);

  const packageFiles = files.filter((file) => file.path === "package.json");

  for (const file of packageFiles) {
    const packageJson = readJsonFile(repositoryRoot, file.path);

    if (!packageJson || !isPlainObject(packageJson.scripts)) {
      continue;
    }

    for (const [name, command] of Object.entries(packageJson.scripts).sort(compareEntries)) {
      if (!VALIDATION_SCRIPT_PATTERN.test(name) || typeof command !== "string" || command.trim() === "") {
        continue;
      }

      target.push(
        createFact("validationCommands", `npm run ${name}`, [
          {
            source: file.path,
            signal: `package.json scripts.${name}`,
          },
        ]),
      );
    }
  }

  if (files.some((file) => file.path === "pytest.ini" || file.path === "pyproject.toml")) {
    target.push(
      createFact("validationCommands", "pytest", [
        {
          source: files.find((file) => file.path === "pytest.ini" || file.path === "pyproject.toml").path,
          signal: "Python test configuration",
        },
      ]),
    );
  }
}

function addPythonTestCommandFact(target, tests) {
  if (!Array.isArray(tests)) {
    return;
  }

  const pythonTest = tests.find((test) => {
    if (!isPlainObject(test) || typeof test.name !== "string") {
      return false;
    }

    return /(^|\/)(tests?\/.*|test_.*|.*_test)\.py$/.test(test.name);
  });

  if (!pythonTest) {
    return;
  }

  target.push(
    createFact("validationCommands", "pytest", [
      {
        source: pythonTest.name,
        signal: "Python test filename",
      },
    ]),
  );
}

function addArchitectureFacts(target, repositoryRoot, files) {
  for (const file of files) {
    if (!ARCHITECTURE_FILE_PATTERN.test(file.path)) {
      continue;
    }

    target.push(
      createFact("architecture", `Architecture evidence file: ${file.path}`, [
        {
          source: file.path,
          signal: "architecture filename",
        },
      ]),
    );

    for (const heading of documentHeadings(repositoryRoot, file.path)) {
      target.push(
        createFact("architecture", `Architecture section: ${heading.text}`, [
          {
            source: file.path,
            signal: `heading line ${heading.lineNumber}`,
          },
        ]),
      );
    }
  }
}

function addDocumentPatternFacts(target, category, repositoryRoot, files, pattern) {
  let added = 0;

  for (const file of files.filter(isDocumentFile)) {
    if (added >= MAX_DOCUMENT_FACTS_PER_CATEGORY) {
      return;
    }

    for (const line of matchingDocumentLines(repositoryRoot, file.path, pattern)) {
      if (added >= MAX_DOCUMENT_FACTS_PER_CATEGORY) {
        return;
      }

      target.push(
        createFact(category, line.text, [
          {
            source: file.path,
            signal: `line ${line.lineNumber}`,
          },
        ]),
      );
      added += 1;
    }
  }
}

function addCodingConventionConfigFacts(target, files) {
  for (const file of files) {
    if (!CODING_CONVENTION_FILE_PATTERN.test(file.path)) {
      continue;
    }

    target.push(
      createFact("codingConventions", `Coding convention configuration: ${file.path}`, [
        {
          source: file.path,
          signal: "configuration filename",
        },
      ]),
    );
  }
}

function addMemoryFacts(categories, records) {
  for (const record of records) {
    const category = memoryCategory(record);

    if (!category || !categories[category]) {
      continue;
    }

    const evidence = normalizeEvidence(memoryEvidence(record.source));

    if (evidence.length === 0) {
      continue;
    }

    categories[category].push(
      createFact(category, memoryValue(record), evidence, {
        confidenceState: record.confidenceState,
      }),
    );
  }
}

function memoryCategory(record) {
  const value = record.value;

  if (isPlainObject(value) && typeof value.category === "string" && KNOWLEDGE_CATEGORIES.includes(value.category)) {
    return value.category;
  }

  if (record.type === "approved-decision") {
    return "businessRules";
  }

  if (record.type === "project-fact") {
    return "architecture";
  }

  return null;
}

function memoryValue(record) {
  const value = record.value;

  if (isPlainObject(value)) {
    if (value.value !== undefined) {
      return sanitizeValue(value.value);
    }

    if (value.text !== undefined) {
      return sanitizeValue(value.text);
    }
  }

  return sanitizeValue(value);
}

function memoryEvidence(source) {
  if (!isPlainObject(source)) {
    return [];
  }

  return {
    source: source.source || source.path || source.file || source.requirementId || UNKNOWN,
    signal: source.signal || source.kind || "memory record",
  };
}

function addUnknownFacts(categories) {
  for (const category of KNOWLEDGE_CATEGORIES) {
    if (categories[category].length > 0) {
      continue;
    }

    categories[category].push({
      category,
      value: UNKNOWN,
      confidenceState: UNKNOWN,
      approvalState: PENDING,
      evidence: [
        {
          source: UNKNOWN,
          signal: `No ${category} evidence found.`,
        },
      ],
    });
  }
}

function createFact(category, value, evidence, options = {}) {
  return {
    category,
    value: sanitizeValue(value),
    confidenceState: options.confidenceState || VERIFIED,
    approvalState: PENDING,
    evidence: normalizeEvidence(evidence),
  };
}

function normalizeEvidence(evidence) {
  return asArray(evidence)
    .map((entry) => {
      if (!isPlainObject(entry)) {
        return null;
      }

      const source = normalizeSource(entry.source);
      const signal = stringOrUnknown(entry.signal);

      if (source === UNKNOWN || signal === UNKNOWN) {
        return null;
      }

      return { source, signal };
    })
    .filter(Boolean)
    .sort(compareStable);
}

function normalizeSource(source) {
  const text = stringOrUnknown(source).replace(/\\/g, "/");

  if (text === UNKNOWN || containsUnsafePath(text)) {
    return UNKNOWN;
  }

  const extension = path.extname(text).toLowerCase();

  if (extension && !SOURCE_EXTENSIONS.has(extension)) {
    return UNKNOWN;
  }

  return text;
}

function safeProjectFiles(files) {
  if (!Array.isArray(files)) {
    return [];
  }

  return files
    .filter((file) => isPlainObject(file) && typeof file.path === "string")
    .filter((file) => !containsUnsafePath(file.path))
    .map((file) => ({ path: file.path.replace(/\\/g, "/") }))
    .sort(comparePathEntries);
}

function matchingDocumentLines(repositoryRoot, relativePath, pattern) {
  return readSafeTextFile(repositoryRoot, relativePath)
    .split(/\r?\n/)
    .map((line, index) => ({
      lineNumber: index + 1,
      text: line.trim(),
    }))
    .filter((line) => line.text.length > 0 && line.text.length <= 240)
    .filter((line) => !SECRET_VALUE_PATTERN.test(line.text))
    .filter((line) => pattern.test(line.text))
    .map((line) => ({
      lineNumber: line.lineNumber,
      text: line.text.replace(/\s+/g, " "),
    }));
}

function documentHeadings(repositoryRoot, relativePath) {
  return readSafeTextFile(repositoryRoot, relativePath)
    .split(/\r?\n/)
    .map((line, index) => {
      const match = line.match(/^\s{0,3}#{1,4}\s+(.+?)\s*#*\s*$/);

      if (!match) {
        return null;
      }

      return {
        lineNumber: index + 1,
        text: match[1].trim().replace(/\s+/g, " "),
      };
    })
    .filter(Boolean);
}

function readSafeTextFile(repositoryRoot, relativePath) {
  if (containsUnsafePath(relativePath) || !isDocumentFile({ path: relativePath })) {
    return "";
  }

  const targetPath = path.join(repositoryRoot, relativePath);

  try {
    return fs.readFileSync(targetPath, "utf8");
  } catch (error) {
    return "";
  }
}

function readJsonFile(repositoryRoot, relativePath) {
  if (containsUnsafePath(relativePath) || path.extname(relativePath).toLowerCase() !== ".json") {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
  } catch (error) {
    return null;
  }
}

function isDocumentFile(file) {
  return DOCUMENT_EXTENSIONS.has(path.extname(file.path).toLowerCase());
}

function sanitizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue).filter((entry) => entry !== undefined);
  }

  if (typeof value === "string") {
    return containsUnsafePath(value) || SECRET_VALUE_PATTERN.test(value) ? undefined : value.trim();
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

  return Object.keys(sanitized).length === 0 ? UNKNOWN : sanitized;
}

function containsUnsafePath(value) {
  if (typeof value === "string") {
    const normalized = value.replace(/\\/g, "/");
    return (
      isLeviRuntimePath(normalized) ||
      SECRET_PATH_PATTERN.test(normalized) ||
      GENERATED_PATH_PATTERN.test(normalized) ||
      DEPENDENCY_PATH_PATTERN.test(normalized) ||
      BINARY_EXTENSION_PATTERN.test(normalized)
    );
  }

  if (Array.isArray(value)) {
    return value.some(containsUnsafePath);
  }

  if (!isPlainObject(value)) {
    return false;
  }

  return Object.values(value).some(containsUnsafePath);
}

function isLeviRuntimePath(filePath) {
  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[0] === ".levi";
}

function directoryRole(directory) {
  const normalized = directory.toLowerCase();
  const roles = new Map([
    ["src", "source code"],
    ["lib", "library code"],
    ["bin", "command-line entry points"],
    ["test", "tests"],
    ["tests", "tests"],
    ["spec", "tests"],
    ["docs", "documentation"],
    ["doc", "documentation"],
    ["public", "public assets"],
    ["static", "static assets"],
    ["assets", "assets"],
    ["app", "application code"],
    ["pages", "routes"],
    ["routes", "routes"],
    ["components", "components"],
    ["config", "configuration"],
    ["scripts", "automation scripts"],
  ]);

  return roles.get(normalized) || UNKNOWN;
}

function detectUnresolvedConflicts(categories) {
  const conflicts = [];
  addMultiValueConflict(conflicts, "packageManagers", categories.packageManagers);
  addMultiValueConflict(conflicts, "frameworks", categories.frameworks);

  return conflicts.sort(compareStable);
}

function addMultiValueConflict(conflicts, category, facts) {
  const knownFacts = facts.filter((fact) => fact.value !== UNKNOWN);
  const values = uniqueSorted(knownFacts.map((fact) => stableSerialize(fact.value)));

  if (values.length <= 1) {
    return;
  }

  conflicts.push({
    category,
    status: "UNRESOLVED",
    values,
    evidence: knownFacts.flatMap((fact) => fact.evidence).sort(compareStable),
  });
}

function evidenceSummary(categories, context) {
  const facts = Object.values(categories).flat();
  const evidenceCount = facts.reduce((total, fact) => total + fact.evidence.length, 0);

  return {
    factCount: facts.length,
    evidenceCount,
    contextFactsUsed: Array.isArray(context.repositoryFacts) ? context.repositoryFacts.length : 0,
    memoryRecordsUsed: Array.isArray(context.projectMemory) ? context.projectMemory.length : 0,
  };
}

function sortCategories(categories) {
  for (const category of KNOWLEDGE_CATEGORIES) {
    categories[category] = categories[category]
      .filter((fact) => fact.value !== undefined)
      .sort(compareStable);
  }
}

function asArray(value) {
  if (value === undefined || value === null || value === UNKNOWN) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort();
}

function stringOrUnknown(value) {
  if (value === undefined || value === null) {
    return UNKNOWN;
  }

  const text = String(value).trim();
  return text === "" ? UNKNOWN : text;
}

function compareEntries(left, right) {
  return left[0].localeCompare(right[0]);
}

function comparePathEntries(left, right) {
  return left.path.localeCompare(right.path);
}

function compareStable(left, right) {
  return stableSerialize(left).localeCompare(stableSerialize(right));
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
    return `[${value.map(stableSerialize).join(", ")}]`;
  }

  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}: ${stableSerialize(value[key])}`)
      .join(", ")}}`;
  }

  return String(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isMemoryStore(value) {
  return isPlainObject(value) && typeof value.listRecords === "function";
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  APPROVE_PROJECT_KNOWLEDGE,
  KNOWLEDGE_CATEGORIES,
  REJECT_PROJECT_KNOWLEDGE,
  REMOVE_PROJECT_KNOWLEDGE,
  UNKNOWN,
  approveProjectKnowledge,
  approveProjectKnowledgeFacts,
  extractProjectKnowledge,
  rejectProjectKnowledgeFact,
  removeApprovedProjectKnowledge,
};
