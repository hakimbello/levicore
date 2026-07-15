const fs = require("node:fs");
const path = require("node:path");
const { createCodingExecutor } = require("./coding-executor");

const OPERATION_TYPES = new Set(["create", "update", "delete"]);
const OPERATION_KEYS = new Set([
  "type",
  "path",
  "content",
  "approved",
  "destructive",
  "destructiveAction",
  "destructiveConfirmation",
]);
const BINARY_LIKE_CONTENT_PATTERN = /[\u0000-\u0008\u000B\u000E-\u001F\u007F]/;

function applySafePatch(options) {
  validateOptions(options);

  const repositoryRoot = path.resolve(options.repositoryRoot);
  const plannedFiles = new Set(options.plannedFiles.map(normalizePlannedPath));
  const executor = createCodingExecutor({
    repositoryRoot,
    plannedFiles: Array.from(plannedFiles),
    limits: options.limits,
  });
  let operations;
  const changes = [];
  const rollback = [];

  try {
    operations = options.operations.map((operation) => normalizeOperation(operation, plannedFiles));
  } catch (error) {
    return result("FAILED", changes, rollback, error.message);
  }

  for (const operation of operations) {
    try {
      const snapshot = snapshotTarget(repositoryRoot, operation.path);
      const result = executor.execute({
        operations: [operation],
      });
      const change = result.changes[0];

      if (change && change.changed) {
        changes.push(change);
        rollback.push(createRollbackOperation(operation.path, snapshot));
      }
    } catch (error) {
      return result("FAILED", changes, rollback, error.message);
    }
  }

  return result("COMPLETED", changes, rollback, null);
}

function validateOptions(options) {
  if (!isPlainObject(options)) {
    throw new Error("Safe patch options are required.");
  }

  if (typeof options.repositoryRoot !== "string" || options.repositoryRoot.trim() === "") {
    throw new Error("Safe patch repositoryRoot is required.");
  }

  if (!Array.isArray(options.plannedFiles) || options.plannedFiles.length === 0) {
    throw new Error("Safe patch plannedFiles are required.");
  }

  if (!Array.isArray(options.operations)) {
    throw new Error("Safe patch operations are required.");
  }

  if (!isPlainObject(options.limits)) {
    throw new Error("Safe patch limits are required.");
  }
}

function normalizeOperation(operation, plannedFiles) {
  if (!isPlainObject(operation)) {
    throw new Error("Safe patch operation must be an object.");
  }

  for (const key of Object.keys(operation)) {
    if (!OPERATION_KEYS.has(key)) {
      throw new Error(`Safe patch operation field is unsupported: ${key}`);
    }
  }

  if (!OPERATION_TYPES.has(operation.type)) {
    throw new Error("Safe patch operation type is invalid.");
  }

  if (typeof operation.path !== "string" || operation.path.trim() === "") {
    throw new Error("Safe patch operation path is required.");
  }

  const relativePath = normalizeRelativePath(operation.path);

  if (!plannedFiles.has(relativePath)) {
    throw new Error(`Safe patch operation is outside planned boundaries: ${relativePath}`);
  }

  if ((operation.type === "create" || operation.type === "update") && typeof operation.content !== "string") {
    throw new Error("Safe patch create or update content is required.");
  }

  if ((operation.type === "create" || operation.type === "update") && isBinaryLikeContent(operation.content)) {
    throw new Error("Safe patch binary-like content is rejected.");
  }

  if (operation.type === "delete" && operation.content !== undefined) {
    throw new Error("Safe patch delete operation must not include content.");
  }

  if (isDestructiveOperation(operation) && operation.destructiveConfirmation !== true) {
    throw new Error(`Destructive confirmation required: ${relativePath}`);
  }

  if (operation.type === "delete") {
    return {
      type: operation.type,
      path: relativePath,
      destructive: true,
      destructiveConfirmation: true,
    };
  }

  return {
    type: operation.type,
    path: relativePath,
    content: operation.content,
    destructive: operation.destructive === true,
    destructiveConfirmation: operation.destructiveConfirmation === true,
  };
}

function isDestructiveOperation(operation) {
  return operation.type === "delete" || operation.destructive === true;
}

function isBinaryLikeContent(content) {
  return BINARY_LIKE_CONTENT_PATTERN.test(content);
}

function snapshotTarget(repositoryRoot, relativePath) {
  const targetPath = resolveInsideRepository(repositoryRoot, relativePath);

  if (!fs.existsSync(targetPath)) {
    return {
      existed: false,
      content: null,
    };
  }

  const stats = fs.statSync(targetPath);

  if (!stats.isFile()) {
    throw new Error(`Safe patch target is not a file: ${relativePath}`);
  }

  return {
    existed: true,
    content: fs.readFileSync(targetPath, "utf8"),
  };
}

function createRollbackOperation(relativePath, snapshot) {
  if (!snapshot.existed) {
    return {
      type: "delete",
      path: relativePath,
      destructive: true,
      destructiveConfirmation: true,
    };
  }

  return {
    type: "update",
    path: relativePath,
    content: snapshot.content,
  };
}

function result(status, changes, rollback, error) {
  return {
    status,
    changes: changes.map((change) => ({
      type: change.type,
      path: change.path,
      changed: change.changed,
    })),
    rollback: rollback.map((operation) => ({ ...operation })),
    summary: summarize(status, changes, error),
    error,
  };
}

function summarize(status, changes, error) {
  const changedFiles = changes.map((change) => change.path).sort();
  const lines = [
    `Status: ${status}`,
    `Changed files: ${changedFiles.length === 0 ? "NONE" : changedFiles.join(", ")}`,
  ];

  if (error) {
    lines.push(`Error: ${error}`);
  }

  return lines.join("\n");
}

function normalizePlannedPath(filePath) {
  if (typeof filePath !== "string" || filePath.trim() === "" || filePath === "UNKNOWN") {
    throw new Error("Safe patch planned file path is required.");
  }

  return normalizeRelativePath(filePath);
}

function normalizeRelativePath(filePath) {
  if (path.isAbsolute(filePath) || filePath.includes("\0")) {
    throw new Error("Safe patch path must be relative.");
  }

  const parts = filePath.split(/[\\/]+/).filter(Boolean);

  if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Safe patch path must stay inside active repository.");
  }

  return parts.join("/");
}

function resolveInsideRepository(repositoryRoot, relativePath) {
  const targetPath = path.resolve(repositoryRoot, relativePath);
  const relativeToRoot = path.relative(repositoryRoot, targetPath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new Error(`Safe patch path is outside active repository: ${relativePath}`);
  }

  return targetPath;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  applySafePatch,
};
