const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const UNKNOWN = "UNKNOWN";
const RESTORE_SCHEMA_VERSION = 2;
const LEVI_RUNTIME_DIRECTORY = ".levi";
const OPERATION_TYPES = new Set(["create", "update", "delete"]);

function createRestorePoint(options) {
  validateOptions(options);

  const repositoryRoot = path.resolve(options.repositoryRoot);
  const plannedFiles = new Set(options.plannedFiles.map(normalizePlannedPath));
  const operations = options.operations.map((operation) => normalizeOperation(operation, plannedFiles));
  const timestamp = stringOrUnknown(options.timestamp || new Date().toISOString());
  const requirementId = stringOrUnknown(options.requirementId);
  const files = operations.map((operation) => snapshotFile(repositoryRoot, operation));
  const directories = snapshotOperationDirectories(repositoryRoot, operations);
  const runtime = snapshotRuntimeMetadata(repositoryRoot);
  const metadata = {
    schemaVersion: RESTORE_SCHEMA_VERSION,
    id: UNKNOWN,
    timestamp,
    repositoryRoot,
    requirementId,
    plannedFiles: Array.from(plannedFiles).sort(),
    operationTypes: operationTypes(operations),
  };

  metadata.id = restorePointId({
    repositoryRoot,
    requirementId,
    plannedFiles: metadata.plannedFiles,
    operations,
    files,
    directories,
    runtime,
  });

  return {
    status: "CREATED",
    metadata,
    files,
    directories,
    runtime,
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
      byteLength: file.byteLength,
      sha256: file.sha256,
    })),
    runtime: {
      path: normalized.runtime.path,
      existed: normalized.runtime.existed,
      fileCount: normalized.runtime.files.length,
      directoryCount: normalized.runtime.directories.length,
    },
  };
}

function restoreFromRestorePoint(options) {
  validateRestoreOptions(options);

  const repositoryRoot = path.resolve(options.repositoryRoot);
  const restorePoint = normalizeRestorePoint(options.restorePoint);
  const requestedRestorePointId = stringOrUnknown(options.restorePointId);

  if (path.resolve(restorePoint.metadata.repositoryRoot) !== repositoryRoot) {
    throw new Error("Restore point repository root does not match active repository.");
  }

  if (requestedRestorePointId === UNKNOWN || requestedRestorePointId !== restorePoint.metadata.id) {
    throw new Error("Restore point ID is invalid.");
  }

  if (options.confirmation !== "CONFIRM_RESTORE") {
    return restoreResult("CONFIRMATION_REQUIRED", restorePoint, [], "Explicit restore confirmation is required.");
  }

  const actions = [
    ...restorePoint.files.map((file) => restoreFileAction(repositoryRoot, file, "project")),
    ...projectDirectoryCleanupActions(repositoryRoot, restorePoint.directories),
    ...runtimeRestoreActions(repositoryRoot, restorePoint.runtime),
  ];
  const currentSnapshots = actions.map(snapshotRestoreTarget);

  try {
    applyRestoreActions(actions);
  } catch (error) {
    try {
      rollbackRestoreTargets(currentSnapshots);
    } catch (rollbackError) {
      return restoreResult("FAILED", restorePoint, [], `${error.message}; rollback failed: ${rollbackError.message}`);
    }

    return restoreResult("FAILED", restorePoint, [], error.message);
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
  const directories = normalizeDirectorySnapshots(restorePoint.directories);
  const runtime = normalizeRuntimeSnapshot(restorePoint.runtime);
  const expectedId = restorePointId({
    repositoryRoot: metadata.repositoryRoot,
    requirementId: metadata.requirementId,
    plannedFiles: metadata.plannedFiles,
    operations: files.map((file) => ({
      type: file.operationType,
      path: file.path,
    })),
    files,
    directories,
    runtime,
  });

  if (metadata.id !== expectedId) {
    throw new Error("Restore point ID does not match restore data.");
  }

  return {
    status: "CREATED",
    metadata,
    files,
    directories,
    runtime,
  };
}

function normalizeRestoreMetadata(metadata) {
  if (metadata.schemaVersion !== RESTORE_SCHEMA_VERSION) {
    throw new Error("Restore point metadata schema version is corrupted.");
  }

  const id = requiredString(metadata.id, "Restore point metadata ID is corrupted.");
  const timestamp = requiredString(metadata.timestamp, "Restore point metadata timestamp is corrupted.");
  const repositoryRoot = path.resolve(
    requiredString(metadata.repositoryRoot, "Restore point metadata repository root is corrupted."),
  );
  const requirementId = requiredString(metadata.requirementId, "Restore point metadata requirement ID is corrupted.");

  if (!Array.isArray(metadata.plannedFiles) || metadata.plannedFiles.length === 0) {
    throw new Error("Restore point metadata planned files are corrupted.");
  }

  if (!Array.isArray(metadata.operationTypes) || metadata.operationTypes.length === 0) {
    throw new Error("Restore point metadata operation types are corrupted.");
  }

  return {
    schemaVersion: RESTORE_SCHEMA_VERSION,
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

  return {
    path: relativePath,
    operationType: file.operationType,
    ...normalizeByteSnapshot(file, "Restore point file"),
  };
}

function normalizeDirectorySnapshots(directories) {
  if (!Array.isArray(directories)) {
    throw new Error("Restore point directories are corrupted.");
  }

  return directories.map(normalizeDirectorySnapshot).sort(compareDirectorySnapshots);
}

function normalizeDirectorySnapshot(directory) {
  if (!isPlainObject(directory)) {
    throw new Error("Restore point directory is corrupted.");
  }

  const relativePath = normalizeRelativePath(directory.path);

  if (typeof directory.existed !== "boolean") {
    throw new Error("Restore point directory existence state is corrupted.");
  }

  return {
    path: relativePath,
    existed: directory.existed,
  };
}

function normalizeRuntimeSnapshot(runtime) {
  if (!isPlainObject(runtime)) {
    throw new Error("Restore point runtime metadata is corrupted.");
  }

  const runtimePath = normalizeRelativePath(runtime.path);

  if (runtimePath !== LEVI_RUNTIME_DIRECTORY) {
    throw new Error("Restore point runtime path is corrupted.");
  }

  if (typeof runtime.existed !== "boolean") {
    throw new Error("Restore point runtime existence state is corrupted.");
  }

  if (!Array.isArray(runtime.files) || !Array.isArray(runtime.directories)) {
    throw new Error("Restore point runtime entries are corrupted.");
  }

  const files = runtime.files.map(normalizeRuntimeFile).sort(comparePathEntries);
  const directories = runtime.directories.map(normalizeRuntimeDirectory).sort(compareDirectorySnapshots);

  if (!runtime.existed && (files.length > 0 || directories.length > 0)) {
    throw new Error("Restore point runtime absence state is corrupted.");
  }

  return {
    path: LEVI_RUNTIME_DIRECTORY,
    existed: runtime.existed,
    files,
    directories,
  };
}

function normalizeRuntimeFile(file) {
  if (!isPlainObject(file)) {
    throw new Error("Restore point runtime file is corrupted.");
  }

  const relativePath = normalizeRelativePath(file.path);

  if (!isLeviRuntimePath(relativePath) || relativePath === LEVI_RUNTIME_DIRECTORY) {
    throw new Error(`Restore point runtime file is outside runtime metadata: ${relativePath}`);
  }

  return {
    path: relativePath,
    ...normalizeByteSnapshot(file, "Restore point runtime file"),
  };
}

function normalizeRuntimeDirectory(directory) {
  const normalized = normalizeDirectorySnapshot(directory);

  if (!isLeviRuntimePath(normalized.path)) {
    throw new Error(`Restore point runtime directory is outside runtime metadata: ${normalized.path}`);
  }

  return normalized;
}

function normalizeByteSnapshot(file, label) {
  if (typeof file.existed !== "boolean") {
    throw new Error(`${label} existence state is corrupted.`);
  }

  if (!file.existed) {
    if (file.contentBase64 !== null || file.byteLength !== 0 || file.sha256 !== null) {
      throw new Error(`${label} absence state is corrupted.`);
    }

    return {
      existed: false,
      contentBase64: null,
      byteLength: 0,
      sha256: null,
    };
  }

  const bytes = decodeBase64(file.contentBase64, `${label} content is corrupted.`);

  if (!Number.isInteger(file.byteLength) || file.byteLength < 0 || file.byteLength !== bytes.length) {
    throw new Error(`${label} byte length is corrupted.`);
  }

  const sha256 = requiredString(file.sha256, `${label} checksum is corrupted.`);

  if (sha256 !== hashBytes(bytes)) {
    throw new Error(`${label} checksum does not match content.`);
  }

  return {
    existed: true,
    contentBase64: file.contentBase64,
    byteLength: file.byteLength,
    sha256,
  };
}

function restoreFileAction(repositoryRoot, file, scope) {
  const targetPath = resolveInsideRepository(repositoryRoot, file.path);

  if (file.existed) {
    return {
      type: "write-file",
      scope,
      path: file.path,
      targetPath,
      contentBase64: file.contentBase64,
    };
  }

  return {
    type: "delete-file",
    scope,
    path: file.path,
    targetPath,
    contentBase64: null,
  };
}

function projectDirectoryCleanupActions(repositoryRoot, directories) {
  return directories
    .filter((directory) => !directory.existed)
    .sort(compareDirectoriesDeepestFirst)
    .map((directory) => ({
      type: "remove-empty-directory",
      scope: "project",
      path: directory.path,
      targetPath: resolveInsideRepository(repositoryRoot, directory.path),
    }));
}

function runtimeRestoreActions(repositoryRoot, runtime) {
  const current = snapshotRuntimeMetadata(repositoryRoot);
  const snapshotFiles = new Map(runtime.files.map((file) => [file.path, file]));
  const currentFiles = new Map(current.files.map((file) => [file.path, file]));
  const snapshotDirectories = new Set(runtime.directories.map((directory) => directory.path));
  const currentDirectories = new Set(current.directories.map((directory) => directory.path));
  const actions = [];

  if (runtime.existed) {
    for (const directory of runtime.directories.slice().sort(compareDirectoriesShallowestFirst)) {
      actions.push({
        type: "ensure-directory",
        scope: "runtime",
        path: directory.path,
        targetPath: resolveInsideRepository(repositoryRoot, directory.path),
      });
    }

    for (const file of runtime.files) {
      actions.push(restoreFileAction(repositoryRoot, file, "runtime"));
    }
  }

  for (const filePath of Array.from(currentFiles.keys()).sort()) {
    if (!snapshotFiles.has(filePath)) {
      actions.push({
        type: "delete-file",
        scope: "runtime",
        path: filePath,
        targetPath: resolveInsideRepository(repositoryRoot, filePath),
        contentBase64: null,
      });
    }
  }

  for (const directoryPath of Array.from(currentDirectories).sort(comparePathDepthDescending)) {
    if (!snapshotDirectories.has(directoryPath)) {
      actions.push({
        type: "remove-empty-directory",
        scope: "runtime",
        path: directoryPath,
        targetPath: resolveInsideRepository(repositoryRoot, directoryPath),
      });
    }
  }

  return actions;
}

function snapshotRestoreTarget(action) {
  if (action.type === "write-file" || action.type === "delete-file") {
    return snapshotCurrentFileAction(action);
  }

  return snapshotCurrentDirectoryAction(action);
}

function snapshotCurrentFileAction(action) {
  if (!fs.existsSync(action.targetPath)) {
    return {
      kind: "file",
      path: action.path,
      targetPath: action.targetPath,
      existed: false,
      contentBase64: null,
    };
  }

  const stats = fs.statSync(action.targetPath);

  if (!stats.isFile()) {
    throw new Error(`Restore target is not a file: ${action.path}`);
  }

  return {
    kind: "file",
    path: action.path,
    targetPath: action.targetPath,
    existed: true,
    contentBase64: fs.readFileSync(action.targetPath).toString("base64"),
  };
}

function snapshotCurrentDirectoryAction(action) {
  if (!fs.existsSync(action.targetPath)) {
    return {
      kind: "directory",
      path: action.path,
      targetPath: action.targetPath,
      existed: false,
    };
  }

  const stats = fs.statSync(action.targetPath);

  if (!stats.isDirectory()) {
    throw new Error(`Restore target is not a directory: ${action.path}`);
  }

  return {
    kind: "directory",
    path: action.path,
    targetPath: action.targetPath,
    existed: true,
  };
}

function applyRestoreActions(actions) {
  for (const action of actions) {
    applyRestoreAction(action);
  }
}

function applyRestoreAction(action) {
  if (action.type === "write-file") {
    fs.mkdirSync(path.dirname(action.targetPath), { recursive: true });
    fs.writeFileSync(action.targetPath, decodeBase64(action.contentBase64, "Restore content is corrupted."));
    return;
  }

  if (action.type === "delete-file") {
    deleteFileIfPresent(action.targetPath, action.path);
    return;
  }

  if (action.type === "ensure-directory") {
    ensureDirectory(action.targetPath, action.path);
    return;
  }

  if (action.type === "remove-empty-directory") {
    removeDirectoryIfEmpty(action.targetPath, action.path, false);
  }
}

function rollbackRestoreTargets(snapshots) {
  const errors = [];

  for (const snapshot of snapshots.slice().reverse()) {
    try {
      restoreCurrentSnapshot(snapshot);
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
}

function restoreCurrentSnapshot(snapshot) {
  if (snapshot.kind === "file") {
    restoreFileSnapshot(snapshot);
    return;
  }

  restoreDirectorySnapshot(snapshot);
}

function restoreFileSnapshot(snapshot) {
  if (snapshot.existed) {
    fs.mkdirSync(path.dirname(snapshot.targetPath), { recursive: true });
    fs.writeFileSync(snapshot.targetPath, decodeBase64(snapshot.contentBase64, "Rollback content is corrupted."));
    return;
  }

  deleteFileIfPresent(snapshot.targetPath, snapshot.path);
}

function restoreDirectorySnapshot(snapshot) {
  if (snapshot.existed) {
    ensureDirectory(snapshot.targetPath, snapshot.path);
    return;
  }

  removeDirectoryIfEmpty(snapshot.targetPath, snapshot.path, true);
}

function restoreResult(status, restorePoint, actions, error) {
  const restoredFiles = actions
    .filter((action) => action.scope === "project" && (action.type === "write-file" || action.type === "delete-file"))
    .map((action) => action.path)
    .sort();
  const runtimeFiles = actions
    .filter((action) => action.scope === "runtime" && (action.type === "write-file" || action.type === "delete-file"))
    .map((action) => action.path)
    .sort();

  return {
    status,
    restorePointId: restorePoint.metadata.id,
    restoredFiles,
    runtimeFiles,
    summary: restoreSummary(status, restoredFiles, runtimeFiles, error),
    error,
  };
}

function restoreSummary(status, restoredFiles, runtimeFiles, error) {
  const files = restoredFiles.length === 0 ? "NONE" : restoredFiles.join(", ");
  const runtime = runtimeFiles.length === 0 ? "NONE" : runtimeFiles.join(", ");
  const lines = [
    `Status: ${status}`,
    `Restored files: ${files}`,
    `Runtime metadata restored: ${runtime}`,
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
    return missingFileSnapshot(operation.path, operation.type);
  }

  const stats = fs.statSync(targetPath);

  if (!stats.isFile()) {
    throw new Error(`Restore point target is not a file: ${operation.path}`);
  }

  return existingFileSnapshot(operation.path, operation.type, fs.readFileSync(targetPath));
}

function snapshotOperationDirectories(repositoryRoot, operations) {
  const directories = new Map();

  for (const operation of operations) {
    for (const directoryPath of parentDirectories(operation.path)) {
      if (!directories.has(directoryPath)) {
        directories.set(directoryPath, snapshotDirectory(repositoryRoot, directoryPath));
      }
    }
  }

  return Array.from(directories.values()).sort(compareDirectorySnapshots);
}

function snapshotRuntimeMetadata(repositoryRoot) {
  const runtimePath = path.join(repositoryRoot, LEVI_RUNTIME_DIRECTORY);

  if (!fs.existsSync(runtimePath)) {
    return {
      path: LEVI_RUNTIME_DIRECTORY,
      existed: false,
      files: [],
      directories: [],
    };
  }

  const stats = fs.statSync(runtimePath);

  if (!stats.isDirectory()) {
    throw new Error("Levi runtime metadata path is not a directory.");
  }

  const files = [];
  const directories = [snapshotDirectory(repositoryRoot, LEVI_RUNTIME_DIRECTORY)];

  collectRuntimeEntries(repositoryRoot, runtimePath, files, directories);

  return {
    path: LEVI_RUNTIME_DIRECTORY,
    existed: true,
    files: files.sort(comparePathEntries),
    directories: directories.sort(compareDirectorySnapshots),
  };
}

function collectRuntimeEntries(repositoryRoot, directoryPath, files, directories) {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(directoryPath, entry.name);
    const relativePath = toRelativePath(repositoryRoot, entryPath);

    if (entry.isDirectory()) {
      directories.push(snapshotDirectory(repositoryRoot, relativePath));
      collectRuntimeEntries(repositoryRoot, entryPath, files, directories);
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(`Levi runtime metadata entry is unsupported: ${relativePath}`);
    }

    files.push(existingRuntimeFileSnapshot(relativePath, fs.readFileSync(entryPath)));
  }
}

function existingFileSnapshot(relativePath, operationType, bytes) {
  return {
    path: relativePath,
    operationType,
    existed: true,
    contentBase64: bytes.toString("base64"),
    byteLength: bytes.length,
    sha256: hashBytes(bytes),
  };
}

function existingRuntimeFileSnapshot(relativePath, bytes) {
  return {
    path: relativePath,
    existed: true,
    contentBase64: bytes.toString("base64"),
    byteLength: bytes.length,
    sha256: hashBytes(bytes),
  };
}

function missingFileSnapshot(relativePath, operationType) {
  return {
    path: relativePath,
    operationType,
    existed: false,
    contentBase64: null,
    byteLength: 0,
    sha256: null,
  };
}

function snapshotDirectory(repositoryRoot, relativePath) {
  const targetPath = resolveInsideRepository(repositoryRoot, relativePath);

  return {
    path: normalizeRelativePath(relativePath),
    existed: fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory(),
  };
}

function parentDirectories(relativePath) {
  const directories = [];
  let directoryPath = path.posix.dirname(relativePath);

  while (directoryPath && directoryPath !== ".") {
    directories.push(directoryPath);
    directoryPath = path.posix.dirname(directoryPath);
  }

  return directories;
}

function restorePointId(input) {
  const canonical = JSON.stringify({
    schemaVersion: RESTORE_SCHEMA_VERSION,
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
      contentBase64: file.contentBase64,
      byteLength: file.byteLength,
      sha256: file.sha256,
    })),
    directories: input.directories.map((directory) => ({
      path: directory.path,
      existed: directory.existed,
    })),
    runtime: {
      path: input.runtime.path,
      existed: input.runtime.existed,
      files: input.runtime.files.map((file) => ({
        path: file.path,
        existed: file.existed,
        contentBase64: file.contentBase64,
        byteLength: file.byteLength,
        sha256: file.sha256,
      })),
      directories: input.runtime.directories.map((directory) => ({
        path: directory.path,
        existed: directory.existed,
      })),
    },
  });

  return `restore-${crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16)}`;
}

function operationTypes(operations) {
  return Array.from(new Set(operations.map((operation) => operation.type))).sort();
}

function deleteFileIfPresent(targetPath, relativePath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  const stats = fs.statSync(targetPath);

  if (!stats.isFile()) {
    throw new Error(`Restore target is not a file: ${relativePath}`);
  }

  fs.unlinkSync(targetPath);
}

function ensureDirectory(targetPath, relativePath) {
  if (fs.existsSync(targetPath) && !fs.statSync(targetPath).isDirectory()) {
    throw new Error(`Restore target is not a directory: ${relativePath}`);
  }

  fs.mkdirSync(targetPath, { recursive: true });
}

function removeDirectoryIfEmpty(targetPath, relativePath, failIfNotEmpty) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  const stats = fs.statSync(targetPath);

  if (!stats.isDirectory()) {
    throw new Error(`Restore target is not a directory: ${relativePath}`);
  }

  if (fs.readdirSync(targetPath).length > 0) {
    if (failIfNotEmpty) {
      throw new Error(`Restore directory is not empty: ${relativePath}`);
    }

    return;
  }

  fs.rmdirSync(targetPath);
}

function decodeBase64(value, message) {
  if (typeof value !== "string") {
    throw new Error(message);
  }

  const bytes = Buffer.from(value, "base64");

  if (bytes.toString("base64") !== value) {
    throw new Error(message);
  }

  return bytes;
}

function hashBytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
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

function toRelativePath(repositoryRoot, filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join("/");
}

function isLeviRuntimePath(filePath) {
  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[0] === LEVI_RUNTIME_DIRECTORY;
}

function comparePathEntries(left, right) {
  return left.path.localeCompare(right.path);
}

function compareDirectorySnapshots(left, right) {
  return left.path.localeCompare(right.path);
}

function compareDirectoriesDeepestFirst(left, right) {
  return comparePathDepthDescending(left.path, right.path) || left.path.localeCompare(right.path);
}

function compareDirectoriesShallowestFirst(left, right) {
  return comparePathDepthAscending(left.path, right.path) || left.path.localeCompare(right.path);
}

function comparePathDepthDescending(left, right) {
  return pathDepth(right) - pathDepth(left) || left.localeCompare(right);
}

function comparePathDepthAscending(left, right) {
  return pathDepth(left) - pathDepth(right) || left.localeCompare(right);
}

function pathDepth(filePath) {
  return filePath.split("/").filter(Boolean).length;
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
