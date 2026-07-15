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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  UNKNOWN,
  createRestorePoint,
};
