const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const UNKNOWN = "UNKNOWN";
const OPERATION_TYPES = new Set(["create", "update", "delete"]);
const BINARY_LIKE_CONTENT_PATTERN = /[\u0000-\u0008\u000B\u000E-\u001F\u007F]/;

function createRestorePoint(options) {
  validateOptions(options);

  const repositoryRoot = path.resolve(options.repositoryRoot);
  const plannedFiles = new Set(options.plannedFiles.map(normalizePlannedPath));
  const operations = options.operations.map((operation) => normalizeOperation(operation, plannedFiles));
  const timestamp = stringOrUnknown(options.timestamp || new Date().toISOString());
  const requirementId = stringOrUnknown(options.requirementId);
  const files = operations.map((operation) => snapshotFile(repositoryRoot, operation));
  const metadata = {
    id: restorePointId({ repositoryRoot, requirementId, plannedFiles: Array.from(plannedFiles), operations, files }),
    timestamp,
    repositoryRoot,
    requirementId,
    plannedFiles: Array.from(plannedFiles).sort(),
    operationTypes: operationTypes(operations),
  };

  return {
    status: "CREATED",
    metadata,
    files,
  };
}

function inspectRestorePoint(restorePoint) {
  const normalized = normalizeRestorePoint(restorePoint);

  return {
    status: "AVAILABLE",
    metadata: normalized.metadata,
    files: normalized.files.map((file) => ({
      path: file.path,
      operationType: file.operationType,
      existed: file.existed,
    })),
  };
}

function restoreFromRestorePoint(options) {
  validateRestoreOptions(options);

  const repositoryRoot = path.resolve(options.repositoryRoot);
  const restorePoint = normalizeRestorePoint(options.restorePoint);
  const requestedRestorePointId = stringOrUnknown(options.restorePointId);

  if (requestedRestorePointId === UNKNOWN || requestedRestorePointId !== restorePoint.metadata.id) {
    throw new Error("Restore point ID is invalid.");
  }

  if (options.confirmation !== "CONFIRM_RESTORE") {
    return restoreResult("CONFIRMATION_REQUIRED", restorePoint, [], "Explicit restore confirmation is required.");
  }

  const actions = restorePoint.files.map((file) => restoreAction(repositoryRoot, file));

  for (const action of actions) {
    if (action.type === "write") {
      fs.mkdirSync(path.dirname(action.targetPath), { recursive: true });
      fs.writeFileSync(action.targetPath, action.content, "utf8");
      continue;
    }

    if (action.type === "delete" && fs.existsSync(action.targetPath)) {
      fs.unlinkSync(action.targetPath);
    }
  }

  return restoreResult("COMPLETED", restorePoint, actions, null);
}

function validateRestoreOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Restore options are required.");
  }

  if (typeof options.repositoryRoot !== "string" || options.repositoryRoot.trim() === "") {
    throw new Error("Restore repositoryRoot is required.");
  }
}

function normalizeRestorePoint(restorePoint) {
  if (!isPlainObject(restorePoint)) {
    throw new Error("Restore point data is corrupted.");
  }

  if (restorePoint.status !== "CREATED") {
    throw new Error("Restore point data is corrupted.");
  }

  if (!isPlainObject(restorePoint.metadata)) {
    throw new Error("Restore point metadata is corrupted.");
  }

  const metadata = normalizeRestoreMetadata(restorePoint.metadata);

  if (!Array.isArray(restorePoint.files) || restorePoint.files.length === 0) {
    throw new Error("Restore point files are corrupted.");
  }

  const plannedFiles = new Set(metadata.plannedFiles);
  const files = restorePoint.files.map((file) => normalizeRestoreFile(file, plannedFiles));
  const expectedId = restorePointId({
    repositoryRoot: metadata.repositoryRoot,
    requirementId: metadata.requirementId,
    plannedFiles: metadata.plannedFiles,
    operations: files.map((file) => ({
      type: file.operationType,
      path: file.path,
    })),
    files,
  });

  if (metadata.id !== expectedId) {
    throw new Error("Restore point ID does not match restore data.");
  }

  return {
    status: "CREATED",
    metadata,
    files,
  };
}

function normalizeRestoreMetadata(metadata) {
  const id = requiredString(metadata.id, "Restore point metadata ID is corrupted.");
  const timestamp = requiredString(metadata.timestamp, "Restore point metadata timestamp is corrupted.");
  const repositoryRoot = requiredString(metadata.repositoryRoot, "Restore point metadata repository root is corrupted.");
  const requirementId = requiredString(metadata.requirementId, "Restore point metadata requirement ID is corrupted.");

  if (!Array.isArray(metadata.plannedFiles) || metadata.plannedFiles.length === 0) {
    throw new Error("Restore point metadata planned files are corrupted.");
  }

  if (!Array.isArray(metadata.operationTypes) || metadata.operationTypes.length === 0) {
    throw new Error("Restore point metadata operation types are corrupted.");
  }

  return {
    id,
    timestamp,
    repositoryRoot,
    requirementId,
    plannedFiles: metadata.plannedFiles.map(normalizePlannedPath).sort(),
    operationTypes: metadata.operationTypes.map((operationType) => {
      if (!OPERATION_TYPES.has(operationType)) {
        throw new Error("Restore point metadata operation type is corrupted.");
      }

      return operationType;
    }).sort(),
  };
}

function normalizeRestoreFile(file, plannedFiles) {
  if (!isPlainObject(file)) {
    throw new Error("Restore point file is corrupted.");
  }

  const relativePath = normalizeRelativePath(file.path);

  if (!plannedFiles.has(relativePath)) {
    throw new Error(`Restore point file is outside planned files: ${relativePath}`);
  }

  if (!OPERATION_TYPES.has(file.operationType)) {
    throw new Error("Restore point file operation type is corrupted.");
  }

  if (typeof file.existed !== "boolean") {
    throw new Error("Restore point file existence state is corrupted.");
  }

  if (file.existed && typeof file.content !== "string") {
    throw new Error("Restore point file content is corrupted.");
  }

  if (!file.existed && file.content !== null) {
    throw new Error("Restore point absence state is corrupted.");
  }

  if (file.existed && isBinaryLikeContent(file.content)) {
    throw new Error(`Restore point binary-like content is rejected: ${relativePath}`);
  }

  return {
    path: relativePath,
    operationType: file.operationType,
    existed: file.existed,
    content: file.content,
  };
}

function restoreAction(repositoryRoot, file) {
  const targetPath = resolveInsideRepository(repositoryRoot, file.path);

  if (file.existed) {
    return {
      type: "write",
      path: file.path,
      targetPath,
      content: file.content,
    };
  }

  return {
    type: "delete",
    path: file.path,
    targetPath,
    content: null,
  };
}

function restoreResult(status, restorePoint, actions, error) {
  const restoredFiles = actions.map((action) => action.path).sort();

  return {
    status,
    restorePointId: restorePoint.metadata.id,
    restoredFiles,
    summary: restoreSummary(status, restoredFiles, error),
    error,
  };
}

function restoreSummary(status, restoredFiles, error) {
  const files = restoredFiles.length === 0 ? "NONE" : restoredFiles.join(", ");
  const lines = [
    `Status: ${status}`,
    `Restored files: ${files}`,
  ];

  if (error) {
    lines.push(`Error: ${error}`);
  }

  return lines.join("\n");
}

function validateOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Restore point options are required.");
  }

  if (typeof options.repositoryRoot !== "string" || options.repositoryRoot.trim() === "") {
    throw new Error("Restore point repositoryRoot is required.");
  }

  if (!Array.isArray(options.plannedFiles) || options.plannedFiles.length === 0) {
    throw new Error("Restore point plannedFiles are required.");
  }

  if (!Array.isArray(options.operations) || options.operations.length === 0) {
    throw new Error("Restore point operations are required.");
  }
}

function normalizeOperation(operation, plannedFiles) {
  if (!isPlainObject(operation)) {
    throw new Error("Restore point operation must be an object.");
  }

  if (!OPERATION_TYPES.has(operation.type)) {
    throw new Error("Restore point operation type is invalid.");
  }

  const relativePath = normalizeRelativePath(operation.path);

  if (!plannedFiles.has(relativePath)) {
    throw new Error(`Restore point operation is outside planned files: ${relativePath}`);
  }

  return {
    type: operation.type,
    path: relativePath,
  };
}

function snapshotFile(repositoryRoot, operation) {
  const targetPath = resolveInsideRepository(repositoryRoot, operation.path);

  if (!fs.existsSync(targetPath)) {
    return {
      path: operation.path,
      operationType: operation.type,
      existed: false,
      content: null,
    };
  }

  const stats = fs.statSync(targetPath);

  if (!stats.isFile()) {
    throw new Error(`Restore point target is not a file: ${operation.path}`);
  }

  const content = fs.readFileSync(targetPath, "utf8");

  if (isBinaryLikeContent(content)) {
    throw new Error(`Restore point binary-like source content is rejected: ${operation.path}`);
  }

  return {
    path: operation.path,
    operationType: operation.type,
    existed: true,
    content,
  };
}

function restorePointId(input) {
  const canonical = JSON.stringify({
    repositoryRoot: input.repositoryRoot,
    requirementId: input.requirementId,
    plannedFiles: input.plannedFiles.slice().sort(),
    operations: input.operations.map((operation) => ({
      type: operation.type,
      path: operation.path,
    })),
    files: input.files.map((file) => ({
      path: file.path,
      operationType: file.operationType,
      existed: file.existed,
      content: file.content,
    })),
  });

  return `restore-${crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}

function operationTypes(operations) {
  return Array.from(new Set(operations.map((operation) => operation.type))).sort();
}

function isBinaryLikeContent(content) {
  return BINARY_LIKE_CONTENT_PATTERN.test(content);
}

function normalizePlannedPath(filePath) {
  if (typeof filePath !== "string" || filePath.trim() === "" || filePath === UNKNOWN) {
    throw new Error("Restore point planned file path is required.");
  }

  return normalizeRelativePath(filePath);
}

function normalizeRelativePath(filePath) {
  if (typeof filePath !== "string" || filePath.trim() === "" || path.isAbsolute(filePath) || filePath.includes("\0")) {
    throw new Error("Restore point path must be relative.");
  }

  const parts = filePath.split(/[\\/]+/).filter(Boolean);

  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Restore point path must stay inside active repository.");
  }

  return parts.join("/");
}

function resolveInsideRepository(repositoryRoot, relativePath) {
  const targetPath = path.resolve(repositoryRoot, relativePath);
  const relativeToRoot = path.relative(repositoryRoot, targetPath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Restore point path is outside active repository: ${relativePath}`);
  }

  return targetPath;
}

function stringOrUnknown(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return UNKNOWN;
  }

  return value.trim();
}

function requiredString(value, message) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(message);
  }

  return value.trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  UNKNOWN,
  createRestorePoint,
  inspectRestorePoint,
  restoreFromRestorePoint,
};
