import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { performance } from "node:perf_hooks";
import type { AgentRiskLevel } from "../../src/features/agent";

const GIT_TIMEOUT_MS = 10_000;
const GIT_DIFF_TIMEOUT_MS = 15_000;
const MAX_DIFF_CHARS = 120_000;
const MAX_STATUS_LINES = 200;
const SUPPORTED_OPERATIONS = new Set<GitOperation>([
  "status",
  "stage-file",
  "unstage-file",
  "stage-all",
  "commit",
  "create-branch",
  "switch-branch",
  "restore-file",
  "show-diff"
]);

export type GitOperation =
  | "status"
  | "stage-file"
  | "unstage-file"
  | "stage-all"
  | "commit"
  | "create-branch"
  | "switch-branch"
  | "restore-file"
  | "show-diff";

export type GitStatusEntry = {
  path: string;
  index: string;
  workingTree: string;
};

export type GitRepositoryStatus = {
  repositoryRoot: string;
  currentBranch?: string;
  detachedHead: boolean;
  headCommit?: string;
  hasMergeConflicts: boolean;
  rebaseInProgress: boolean;
  entries: GitStatusEntry[];
  summary: string[];
};

export type GitOperationPreviewRequest = {
  operation: GitOperation;
  relativePaths?: string[];
  commitMessage?: string;
  branchName?: string;
};

export type GitOperationPreview = Omit<GitOperationPreviewRequest, "relativePaths"> & {
  repositoryRoot: string;
  relativePaths: string[];
  affectedFiles: string[];
  riskLevel: AgentRiskLevel;
  unifiedDiff: string;
  fileCount: number;
  addedLineCount: number;
  removedLineCount: number;
  status: GitRepositoryStatus;
  warnings: string[];
  createdAt: string;
};

export type GitOperationResult = {
  preview: GitOperationPreview;
  status: GitRepositoryStatus;
  commitHash?: string;
  durationMs: number;
  stdout: string;
  stderr: string;
};

export class GitService {
  constructor(private readonly getWorkspaceRoot: () => string | null) {}

  async status(): Promise<GitRepositoryStatus> {
    const repositoryRoot = await this.repositoryRoot();
    const [status, branch, head] = await Promise.all([
      git(repositoryRoot, ["status", "--short", "--branch"], GIT_TIMEOUT_MS),
      git(repositoryRoot, ["branch", "--show-current"], GIT_TIMEOUT_MS).catch(() => ({ stdout: "", stderr: "" })),
      git(repositoryRoot, ["rev-parse", "--short", "HEAD"], GIT_TIMEOUT_MS).catch(() => ({ stdout: "", stderr: "" }))
    ]);
    const lines = status.stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean).slice(0, MAX_STATUS_LINES);
    const entries = lines.filter((line) => !line.startsWith("## ")).map(parseStatusLine);
    const currentBranch = branch.stdout.trim() || undefined;
    return {
      repositoryRoot,
      currentBranch,
      detachedHead: !currentBranch,
      headCommit: head.stdout.trim() || undefined,
      hasMergeConflicts: entries.some((entry) => entry.index === "U" || entry.workingTree === "U" || entry.index + entry.workingTree === "AA" || entry.index + entry.workingTree === "DD"),
      rebaseInProgress: await hasRebaseState(repositoryRoot),
      entries,
      summary: lines.slice(0, 40)
    };
  }

  async preview(request: GitOperationPreviewRequest): Promise<GitOperationPreview> {
    validateOperation(request.operation);
    const status = await this.status();
    const relativePaths = await this.validateRelativePaths(status.repositoryRoot, request.relativePaths ?? []);
    const affectedFiles = affectedFilesFor(request.operation, status, relativePaths);
    validateRequestShape(request, affectedFiles);
    const warnings = validateRepositoryState(request, status);
    const diff = await this.diffForPreview(status.repositoryRoot, request.operation, affectedFiles);
    const counts = countDiff(diff);
    return {
      operation: request.operation,
      relativePaths,
      commitMessage: request.commitMessage,
      branchName: request.branchName,
      repositoryRoot: status.repositoryRoot,
      affectedFiles,
      riskLevel: riskForGitOperation(request.operation),
      unifiedDiff: diff.slice(0, MAX_DIFF_CHARS),
      fileCount: affectedFiles.length,
      addedLineCount: counts.added,
      removedLineCount: counts.removed,
      status,
      warnings,
      createdAt: new Date().toISOString()
    };
  }

  async execute(preview: GitOperationPreview): Promise<GitOperationResult> {
    const startedAt = performance.now();
    const current = await this.preview({
      operation: preview.operation,
      relativePaths: preview.relativePaths,
      commitMessage: preview.commitMessage,
      branchName: preview.branchName
    });
    if (fingerprintPreview(current) !== fingerprintPreview(preview)) {
      throw new Error("Git repository state changed since preview.");
    }

    let stdout = "";
    let stderr = "";
    let commitHash: string | undefined;
    if (preview.operation === "status" || preview.operation === "show-diff") {
      // Read-only operations are validated and tracked but do not mutate Git state.
    } else if (preview.operation === "stage-file") {
      ({ stdout, stderr } = await git(preview.repositoryRoot, ["add", "--", ...preview.relativePaths], GIT_TIMEOUT_MS));
    } else if (preview.operation === "unstage-file") {
      ({ stdout, stderr } = await git(preview.repositoryRoot, ["restore", "--staged", "--", ...preview.relativePaths], GIT_TIMEOUT_MS));
    } else if (preview.operation === "stage-all") {
      ({ stdout, stderr } = await git(preview.repositoryRoot, ["add", "-A"], GIT_TIMEOUT_MS));
    } else if (preview.operation === "commit") {
      ({ stdout, stderr } = await git(preview.repositoryRoot, ["commit", "-m", preview.commitMessage ?? ""], GIT_TIMEOUT_MS));
      const hash = await git(preview.repositoryRoot, ["rev-parse", "--short", "HEAD"], GIT_TIMEOUT_MS);
      commitHash = hash.stdout.trim() || undefined;
    } else if (preview.operation === "create-branch") {
      ({ stdout, stderr } = await git(preview.repositoryRoot, ["branch", preview.branchName ?? ""], GIT_TIMEOUT_MS));
    } else if (preview.operation === "switch-branch") {
      ({ stdout, stderr } = await git(preview.repositoryRoot, ["switch", preview.branchName ?? ""], GIT_TIMEOUT_MS));
    } else if (preview.operation === "restore-file") {
      ({ stdout, stderr } = await git(preview.repositoryRoot, ["restore", "--worktree", "--", ...preview.relativePaths], GIT_TIMEOUT_MS));
    }
    return {
      preview,
      status: await this.status(),
      commitHash,
      durationMs: Math.round(performance.now() - startedAt),
      stdout,
      stderr
    };
  }

  private async repositoryRoot(): Promise<string> {
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) throw new Error("No workspace is open.");
    const workspaceRealPath = await fs.realpath(workspaceRoot);
    const result = await git(workspaceRealPath, ["rev-parse", "--show-toplevel"], GIT_TIMEOUT_MS);
    const repositoryRoot = path.resolve(result.stdout.trim());
    const repositoryRealPath = await fs.realpath(repositoryRoot);
    if (!isInside(workspaceRealPath, repositoryRealPath)) {
      throw new Error("Git repository is outside the selected workspace.");
    }
    return repositoryRealPath;
  }

  private async validateRelativePaths(repositoryRoot: string, values: string[]): Promise<string[]> {
    const unique = Array.from(new Set(values.map(validateRelativePath))).slice(0, 80);
    const repositoryRealPath = await fs.realpath(repositoryRoot);
    for (const relativePath of unique) {
      const absolutePath = path.resolve(repositoryRealPath, relativePath);
      if (!isInside(repositoryRealPath, absolutePath)) throw new Error("Git path escapes the repository.");
      const parentRealPath = await nearestExistingParentRealPath(path.dirname(absolutePath), repositoryRealPath);
      if (!isInside(repositoryRealPath, parentRealPath)) throw new Error("Git path resolves outside the repository.");
      try {
        const realPath = await fs.realpath(absolutePath);
        if (!isInside(repositoryRealPath, realPath)) throw new Error("Git path resolves outside the repository.");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return unique;
  }

  private async diffForPreview(repositoryRoot: string, operation: GitOperation, affectedFiles: string[]): Promise<string> {
    if (operation === "commit" || operation === "unstage-file") {
      return (await git(repositoryRoot, ["diff", "--cached", "--", ...affectedFiles], GIT_DIFF_TIMEOUT_MS, MAX_DIFF_CHARS + 1024)).stdout;
    }
    if (operation === "stage-file" || operation === "stage-all" || operation === "restore-file" || operation === "show-diff") {
      return (await git(repositoryRoot, ["diff", "--", ...affectedFiles], GIT_DIFF_TIMEOUT_MS, MAX_DIFF_CHARS + 1024)).stdout;
    }
    return "";
  }
}

function validateOperation(operation: string): asserts operation is GitOperation {
  if (!SUPPORTED_OPERATIONS.has(operation as GitOperation)) throw new Error("Git operation is not supported.");
}

function validateRequestShape(request: GitOperationPreviewRequest, affectedFiles: string[]): void {
  if ((request.operation === "stage-file" || request.operation === "unstage-file" || request.operation === "restore-file") && affectedFiles.length === 0) {
    throw new Error("Git file operation requires at least one affected file.");
  }
  if (request.operation === "commit" && (!request.commitMessage || !request.commitMessage.trim())) {
    throw new Error("Git commit message is required.");
  }
  if ((request.operation === "create-branch" || request.operation === "switch-branch") && !validateBranchName(request.branchName)) {
    throw new Error("Git branch name is invalid.");
  }
}

function validateRepositoryState(request: GitOperationPreviewRequest, status: GitRepositoryStatus): string[] {
  const warnings: string[] = [];
  if (status.rebaseInProgress && request.operation === "commit") throw new Error("Cannot commit while a rebase is in progress.");
  if (status.hasMergeConflicts && request.operation === "commit") throw new Error("Cannot commit with unresolved merge conflicts.");
  if (status.detachedHead && request.operation === "commit") warnings.push("Repository is in detached HEAD state.");
  if (request.operation === "commit" && !status.entries.some((entry) => entry.index !== " " && entry.index !== "?")) {
    throw new Error("No staged changes are available to commit.");
  }
  return warnings;
}

function affectedFilesFor(operation: GitOperation, status: GitRepositoryStatus, relativePaths: string[]): string[] {
  if (relativePaths.length) return relativePaths;
  if (operation === "status" || operation === "stage-all" || operation === "show-diff") {
    return status.entries.map((entry) => entry.path).slice(0, 80);
  }
  if (operation === "commit") {
    return status.entries.filter((entry) => entry.index !== " " && entry.index !== "?").map((entry) => entry.path).slice(0, 80);
  }
  return [];
}

function parseStatusLine(line: string): GitStatusEntry {
  const index = line[0] ?? " ";
  const workingTree = line[1] ?? " ";
  const rawPath = line.slice(3).trim();
  const renameParts = rawPath.split(" -> ");
  return { index, workingTree, path: renameParts[renameParts.length - 1].replace(/\\/g, "/") };
}

function countDiff(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) added += 1;
    else if (line.startsWith("-")) removed += 1;
  }
  return { added, removed };
}

function riskForGitOperation(operation: GitOperation): AgentRiskLevel {
  if (operation === "status" || operation === "show-diff") return "low";
  if (operation === "commit" || operation === "restore-file" || operation === "switch-branch") return "high";
  return "medium";
}

function validateRelativePath(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500 || path.isAbsolute(value) || value.includes("\0")) {
    throw new Error("Git path is invalid.");
  }
  const normalized = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.split("/").includes("..")) throw new Error("Git path is invalid.");
  return normalized;
}

function validateBranchName(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const name = value.trim();
  return (
    name.length > 0 &&
    name.length <= 120 &&
    !name.startsWith("-") &&
    !name.startsWith("/") &&
    !name.endsWith("/") &&
    !name.endsWith(".") &&
    !name.includes("\\") &&
    !name.includes("..") &&
    !name.includes("@{") &&
    !name.includes("//") &&
    !name.includes("\0") &&
    !/[\s~^:?*[\\\]]/.test(name) &&
    !name.split("/").some((part) => part.length === 0 || part.endsWith(".lock"))
  );
}

function fingerprintPreview(preview: GitOperationPreview): string {
  return JSON.stringify({
    operation: preview.operation,
    relativePaths: preview.relativePaths,
    commitMessage: preview.commitMessage,
    branchName: preview.branchName,
    affectedFiles: preview.affectedFiles,
    status: preview.status.summary,
    diff: preview.unifiedDiff
  });
}

async function hasRebaseState(repositoryRoot: string): Promise<boolean> {
  const gitDir = (await git(repositoryRoot, ["rev-parse", "--git-dir"], GIT_TIMEOUT_MS)).stdout.trim();
  const absoluteGitDir = path.isAbsolute(gitDir) ? gitDir : path.resolve(repositoryRoot, gitDir);
  return (await exists(path.join(absoluteGitDir, "rebase-merge"))) || (await exists(path.join(absoluteGitDir, "rebase-apply")));
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function nearestExistingParentRealPath(candidatePath: string, rootRealPath: string): Promise<string> {
  let current = path.resolve(candidatePath);
  const root = path.resolve(rootRealPath);
  while (isInside(root, current)) {
    try {
      return await fs.realpath(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const next = path.dirname(current);
      if (next === current) break;
      current = next;
    }
  }
  return root;
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function git(cwd: string, args: string[], timeoutMs: number, maxBuffer = 256 * 1024): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.toString().trim() || stdout.toString().trim() || error.message));
      } else {
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      }
    });
  });
}
