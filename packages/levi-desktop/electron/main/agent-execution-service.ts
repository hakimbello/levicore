import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { TextDecoder } from "node:util";
import type { BrowserWindow } from "electron";
import type {
  AgentActionPreview,
  AgentApprovalAction,
  AgentCancelRequest,
  AgentDiffLine,
  AgentExecuteRequest,
  AgentExecutionQueueItem,
  AgentExecutionResult,
  AgentFileEdit,
  AgentGitExecuteRequest,
  AgentGitExecutionResult,
  AgentGitPreview,
  AgentGitPreviewRequest,
  AgentGitPreviewResult,
  AgentGitRunState,
  AgentGitStatusRequest,
  AgentGitStatusResult,
  AgentGitVerificationSummary,
  AgentPreviewRequest,
  AgentPreviewResult,
  AgentQueueRequest,
  AgentQueueResult,
  AgentRiskLevel,
  AgentSession,
  AgentState,
  AgentTaskCancelRequest,
  AgentTaskExecuteRequest,
  AgentTaskExecutionResult,
  AgentTaskPreview,
  AgentTaskPreviewRequest,
  AgentTaskPreviewResult,
  AgentTaskRunState,
  AgentTaskStatusRequest,
  AgentTaskStatusResult,
  AgentTaskVerificationResult,
  AgentTaskVerificationSummary,
  AgentTaskVerifyRequest,
  AgentUndoMetadata,
  AgentUndoRequest,
  AgentUndoResult
} from "../../src/features/agent";
import type { AIRuntimeInvocationResponse } from "../../src/features/ai-runtime";
import type { TaskDefinition, TaskEvent, TaskOutputEntry, TaskProblem, TaskRun } from "../../src/types/task-api";
import { generateLocalDiff, hashContent, writeAtomically } from "./edit-context";
import type { RuntimeManager } from "./ai-runtime";
import type { TaskService } from "./tasks/task-service";
import type { GitOperation, GitOperationPreview, GitRepositoryStatus, GitService } from "./git-service";
import { getMonacoLanguage, isInsideRoot, normalizeSlashes } from "./workspace-context";

const MAX_TEXT_BYTES = 5 * 1024 * 1024;
const MAX_CONTENT_CHARS = 420_000;
const MAX_DIFF_LINES = 1_000;
const MAX_TASK_OUTPUT_ENTRIES = 40;
const MAX_TASK_OUTPUT_CHARS = 12_000;
const MAX_TASK_PROBLEMS = 40;
const MAX_GIT_OUTPUT_CHARS = 12_000;
const MAX_GIT_STATUS_LINES = 80;
const SUPPORTED_ACTIONS = new Set(["create-file", "modify-file", "delete-file", "rename-file", "create-folder", "rename-folder"]);

type AgentExecutionServiceOptions = {
  getWorkspaceRoot: () => string | null;
  snapshot: () => AgentState;
  persistAndEmit: () => Promise<void>;
  emitExecution: (sessionId: string, actionId: string) => void;
  emitPreview: (sessionId: string, preview: AgentActionPreview) => void;
  emitTaskPreview?: (sessionId: string, preview: AgentTaskPreview) => void;
  emitTask?: (sessionId: string, actionId: string, taskRun: AgentTaskRunState) => void;
  emitTaskVerification?: (sessionId: string, actionId: string, verification: AgentTaskVerificationSummary) => void;
  emitGitPreview?: (sessionId: string, preview: AgentGitPreview) => void;
  emitGit?: (sessionId: string, actionId: string, gitRun: AgentGitRunState) => void;
  taskService?: TaskService;
  gitService?: GitService;
  runtimeManager?: RuntimeManager;
  getWindow?: () => BrowserWindow | null;
  getChangedFiles?: () => string[];
};

type ResolvedWorkspacePath = {
  rootRealPath: string;
  relativePath: string;
  absolutePath: string;
  parentRealPath: string;
};

type UndoRecord =
  | {
      kind: "create-file";
      actionId: string;
      relativePath: string;
      absolutePath: string;
      timestamp: string;
    }
  | {
      kind: "modify-file" | "delete-file";
      actionId: string;
      relativePath: string;
      absolutePath: string;
      previousContent: string;
      previousHash: string;
      appliedHash?: string;
      timestamp: string;
    }
  | {
      kind: "rename-file" | "rename-folder";
      actionId: string;
      relativePath: string;
      destinationRelativePath: string;
      absolutePath: string;
      destinationAbsolutePath: string;
      timestamp: string;
    }
  | {
      kind: "create-folder";
      actionId: string;
      relativePath: string;
      absolutePath: string;
      timestamp: string;
    };

export class AgentExecutionService {
  private readonly previews = new Map<string, AgentActionPreview>();
  private readonly taskPreviews = new Map<string, AgentTaskPreview>();
  private readonly gitPreviews = new Map<string, AgentGitPreview>();
  private readonly undoBySession = new Map<string, UndoRecord>();

  constructor(private readonly options: AgentExecutionServiceOptions) {}

  async preview(session: AgentSession, rawRequest: unknown): Promise<AgentPreviewResult> {
    const request = validatePreviewRequest(rawRequest);
    const action = requireAction(session, request.actionId);
    requireSupportedApprovedAction(action);
    const preview = await this.createPreview(session.id, action);
    this.previews.set(preview.previewId, preview);
    const item = ensureQueueItem(session, action);
    item.previewId = preview.previewId;
    await this.touch(session);
    this.options.emitPreview(session.id, preview);
    return { sessionId: session.id, preview, state: this.options.snapshot() };
  }

  async execute(session: AgentSession, rawRequest: unknown): Promise<AgentExecutionResult> {
    const request = validateExecuteRequest(rawRequest);
    const action = requireAction(session, request.actionId);
    requireSupportedApprovedAction(action);
    const queue = ensureQueue(session);
    const item = queue.find((candidate) => candidate.actionId === action.id);
    if (!item) {
      throw new Error("Agent execution queue item was not found.");
    }
    if (queue.some((candidate) => candidate.status === "Executing")) {
      throw new Error("Another agent action is already executing.");
    }
    if (item.status === "Completed") {
      throw new Error("Agent action has already completed.");
    }
    if (item.status === "Rejected" || item.status === "Cancelled") {
      throw new Error("Rejected or cancelled agent actions cannot be executed.");
    }

    const preview = request.previewId ? this.requirePreview(request.previewId, session.id, action.id) : await this.createPreview(session.id, action);
    item.status = "Executing";
    item.startedAt = new Date().toISOString();
    item.error = undefined;
    session.status = "Executing";
    await this.touch(session);
    const activeItem = ensureQueue(session).find((candidate) => candidate.actionId === action.id);
    if (!activeItem) {
      throw new Error("Agent execution queue item was not found.");
    }
    try {
      const undo = await this.applyAction(action, preview);
      this.undoBySession.set(session.id, undo);
      session.plan!.lastUndo = undoMetadata(undo);
      activeItem.status = "Completed";
      activeItem.completedAt = new Date().toISOString();
      session.status = "Ready";
      session.plan!.progress = progressFromSession(session);
      await this.touch(session);
      this.options.emitExecution(session.id, action.id);
      return { sessionId: session.id, actionId: action.id, state: this.options.snapshot() };
    } catch (error) {
      activeItem.status = "Failed";
      activeItem.error = errorMessage(error);
      activeItem.completedAt = new Date().toISOString();
      session.status = "Error";
      session.error = activeItem.error;
      session.plan!.progress = progressFromSession(session);
      await this.touch(session);
      this.options.emitExecution(session.id, action.id);
      throw error;
    }
  }

  async undo(session: AgentSession, rawRequest: unknown): Promise<AgentUndoResult> {
    validateUndoRequest(rawRequest);
    const undo = this.undoBySession.get(session.id);
    if (!undo) {
      throw new Error("No reversible agent action is available.");
    }
    await this.undoRecord(undo);
    this.undoBySession.delete(session.id);
    if (session.plan) {
      session.plan.lastUndo = undefined;
      const item = session.plan.executionQueue.find((candidate) => candidate.actionId === undo.actionId);
      if (item) {
        item.status = "Pending";
        item.completedAt = undefined;
        item.error = undefined;
      }
      session.plan.progress = progressFromSession(session);
    }
    session.status = "Ready";
    session.updatedAt = new Date().toISOString();
    await this.options.persistAndEmit();
    this.options.emitExecution(session.id, undo.actionId);
    return { sessionId: session.id, actionId: undo.actionId, relativePath: undo.relativePath, state: this.options.snapshot() };
  }

  queue(session: AgentSession, rawRequest: unknown): AgentQueueResult {
    const request = validateQueueRequest(rawRequest);
    if (request.sessionId !== session.id) {
      throw new Error("Agent queue request session does not match.");
    }
    const queue = ensureQueue(session);
    const startedAt = queue.map((item) => item.startedAt).filter(Boolean).sort()[0];
    const elapsedMs = startedAt ? Date.now() - Date.parse(startedAt) : 0;
    return {
      sessionId: session.id,
      queue,
      currentActionId: queue.find((item) => item.status === "Executing")?.actionId,
      progress: {
        completed: queue.filter((item) => item.status === "Completed").length,
        remaining: queue.filter((item) => item.status === "Pending").length,
        estimatedFiles: new Set(queue.map((item) => item.relativePath).filter(Boolean)).size,
        elapsedMs
      }
    };
  }

  async cancel(session: AgentSession, rawRequest: unknown): Promise<AgentExecutionResult> {
    const request = validateCancelRequest(rawRequest);
    if (!session.plan) {
      throw new Error("Agent session has no execution plan.");
    }
    const queue = ensureQueue(session);
    const targets = request.actionId ? queue.filter((item) => item.actionId === request.actionId) : queue.filter((item) => item.status === "Pending");
    if (!targets.length) {
      throw new Error("Agent execution queue item was not found.");
    }
    for (const item of targets) {
      if (item.status === "Executing") {
        item.status = "Cancelled";
      } else if (item.status === "Pending" || item.status === "Failed") {
        item.status = "Rejected";
      }
      item.completedAt = new Date().toISOString();
      const action = session.plan.approvals.find((candidate) => candidate.id === item.actionId);
      if (action?.status === "Approved") {
        action.status = "Rejected";
        action.updatedAt = new Date().toISOString();
      }
    }
    session.plan.progress = progressFromSession(session);
    session.status = session.plan.executionQueue.some((item) => item.status === "Executing") ? "Executing" : "Ready";
    await this.touch(session);
    const actionId = request.actionId ?? targets[0].actionId;
    this.options.emitExecution(session.id, actionId);
    return { sessionId: session.id, actionId, state: this.options.snapshot() };
  }

  async taskPreview(session: AgentSession, rawRequest: unknown): Promise<AgentTaskPreviewResult> {
    const request = validateTaskPreviewRequest(rawRequest);
    const action = requireAction(session, request.actionId);
    requireApprovedTaskAction(action);
    const task = await this.resolveTask(action);
    const preview = this.createTaskPreview(session.id, action, task);
    this.taskPreviews.set(preview.previewId, preview);
    const taskRun = ensureTaskRun(session, action, preview);
    taskRun.status = "Approved";
    taskRun.updatedAt = new Date().toISOString();
    await this.touch(session);
    this.options.emitTaskPreview?.(session.id, preview);
    return { sessionId: session.id, preview, state: this.options.snapshot() };
  }

  async taskExecute(session: AgentSession, rawRequest: unknown): Promise<AgentTaskExecutionResult> {
    const request = validateTaskExecuteRequest(rawRequest);
    const action = requireAction(session, request.actionId);
    requireApprovedTaskAction(action);
    if (ensureTaskRuns(session).some((run) => run.status === "Running")) {
      throw new Error("Another agent task action is already running.");
    }
    const task = await this.resolveTask(action);
    const preview = request.previewId ? this.requireTaskPreview(request.previewId, session.id, action.id) : this.createTaskPreview(session.id, action, task);
    assertTaskFingerprint(task, preview.definitionFingerprint);
    const window = this.options.getWindow?.();
    if (!window || window.isDestroyed()) {
      throw new Error("No active Levi window is available for task execution.");
    }
    const taskRun = ensureTaskRun(session, action, preview);
    const startedAt = new Date().toISOString();
    Object.assign(taskRun, {
      status: "Running" as const,
      startedAt,
      endedAt: undefined,
      exitCode: undefined,
      durationMs: undefined,
      failureReason: undefined,
      outputPreview: [],
      problems: [],
      verification: undefined,
      updatedAt: startedAt
    });
    session.status = "Executing";
    await this.touch(session);
    const run = await this.options.taskService!.run({ taskId: task.id }, window);
    taskRun.runId = run.id;
    taskRun.terminalSessionId = run.terminalSessionId;
    taskRun.updatedAt = new Date().toISOString();
    await this.touch(session);
    this.options.emitTask?.(session.id, action.id, taskRun);
    return { sessionId: session.id, actionId: action.id, taskRun, state: this.options.snapshot() };
  }

  async taskCancel(session: AgentSession, rawRequest: unknown): Promise<AgentTaskExecutionResult> {
    const request = validateTaskCancelRequest(rawRequest);
    const taskRun = requireTaskRun(session, request.actionId);
    if (!taskRun.runId) {
      throw new Error("Agent task action has no active task run.");
    }
    const run = await this.options.taskService!.cancel({ runId: taskRun.runId });
    await this.recordTaskCompletion(session, taskRun, run);
    return { sessionId: session.id, actionId: request.actionId, taskRun, state: this.options.snapshot() };
  }

  taskStatus(session: AgentSession, rawRequest: unknown): AgentTaskStatusResult {
    const request = validateTaskStatusRequest(rawRequest);
    const taskRuns = ensureTaskRuns(session);
    return {
      sessionId: session.id,
      taskRuns: request.actionId ? taskRuns.filter((run) => run.actionId === request.actionId) : taskRuns,
      state: this.options.snapshot()
    };
  }

  async taskVerify(session: AgentSession, rawRequest: unknown): Promise<AgentTaskVerificationResult> {
    const request = validateTaskVerifyRequest(rawRequest);
    const taskRun = requireTaskRun(session, request.actionId);
    if (taskRun.status === "Running") {
      throw new Error("Cannot verify a running task.");
    }
    const verification = await this.createVerification(session, taskRun);
    taskRun.verification = verification;
    taskRun.updatedAt = new Date().toISOString();
    await this.touch(session);
    this.options.emitTaskVerification?.(session.id, request.actionId, verification);
    return { sessionId: session.id, actionId: request.actionId, verification, state: this.options.snapshot() };
  }

  async gitPreview(session: AgentSession, rawRequest: unknown): Promise<AgentGitPreviewResult> {
    const request = validateGitPreviewRequest(rawRequest);
    const action = requireAction(session, request.actionId);
    requireApprovedGitAction(action);
    const preview = await this.createGitPreview(session.id, action);
    this.gitPreviews.set(preview.previewId, preview);
    const gitRun = ensureGitRun(session, action, preview);
    gitRun.status = "Approved";
    gitRun.updatedAt = new Date().toISOString();
    await this.touch(session);
    this.options.emitGitPreview?.(session.id, preview);
    return { sessionId: session.id, preview, state: this.options.snapshot() };
  }

  async gitExecute(session: AgentSession, rawRequest: unknown): Promise<AgentGitExecutionResult> {
    const request = validateGitExecuteRequest(rawRequest);
    const action = requireAction(session, request.actionId);
    requireApprovedGitAction(action);
    if (ensureGitRuns(session).some((run) => run.status === "Executing")) {
      throw new Error("Another agent Git action is already executing.");
    }
    const preview = request.previewId ? this.requireGitPreview(request.previewId, session.id, action.id) : await this.createGitPreview(session.id, action);
    const gitRun = ensureGitRun(session, action, preview);
    const startedAt = new Date().toISOString();
    Object.assign(gitRun, {
      status: "Executing" as const,
      startedAt,
      endedAt: undefined,
      durationMs: undefined,
      commitHash: undefined,
      stdout: undefined,
      stderr: undefined,
      failureReason: undefined,
      verification: undefined,
      updatedAt: startedAt
    });
    session.status = "Executing";
    await this.touch(session);
    try {
      const result = await this.options.gitService!.execute(toGitOperationPreview(preview));
      gitRun.status = "Succeeded";
      gitRun.endedAt = new Date().toISOString();
      gitRun.durationMs = result.durationMs;
      gitRun.commitHash = result.commitHash;
      gitRun.stdout = result.stdout.slice(-MAX_GIT_OUTPUT_CHARS);
      gitRun.stderr = result.stderr.slice(-MAX_GIT_OUTPUT_CHARS);
      gitRun.updatedAt = gitRun.endedAt;
      const verification = await this.createGitVerification(session, gitRun, result.status);
      gitRun.verification = verification;
      session.status = "Ready";
      session.plan!.progress = progressFromSession(session);
      await this.touch(session);
      this.options.emitGit?.(session.id, action.id, gitRun);
      return { sessionId: session.id, actionId: action.id, gitRun, state: this.options.snapshot() };
    } catch (error) {
      gitRun.status = "Failed";
      gitRun.endedAt = new Date().toISOString();
      gitRun.failureReason = errorMessage(error);
      gitRun.updatedAt = gitRun.endedAt;
      session.status = "Error";
      session.error = gitRun.failureReason;
      session.plan!.progress = progressFromSession(session);
      await this.touch(session);
      this.options.emitGit?.(session.id, action.id, gitRun);
      throw error;
    }
  }

  gitStatus(session: AgentSession, rawRequest: unknown): AgentGitStatusResult {
    const request = validateGitStatusRequest(rawRequest);
    const gitRuns = ensureGitRuns(session);
    return {
      sessionId: session.id,
      gitRuns: request.actionId ? gitRuns.filter((run) => run.actionId === request.actionId) : gitRuns,
      state: this.options.snapshot()
    };
  }

  handleTaskEvent(event: TaskEvent): void {
    for (const session of this.options.snapshot().sessions) {
      for (const taskRun of session.plan?.taskRuns ?? []) {
        if (event.type === "output-entry" && taskRun.runId && event.entry.taskRunId === taskRun.runId) {
          taskRun.outputPreview = boundedOutput([...taskRun.outputPreview, event.entry]);
          taskRun.updatedAt = new Date().toISOString();
          void this.touch(session);
          this.options.emitTask?.(session.id, taskRun.actionId, taskRun);
        } else if (event.type === "problems" && taskRun.runId) {
          taskRun.problems = event.problems.filter((problem) => problem.taskRunId === taskRun.runId).slice(0, MAX_TASK_PROBLEMS);
          taskRun.updatedAt = new Date().toISOString();
          void this.touch(session);
          this.options.emitTask?.(session.id, taskRun.actionId, taskRun);
        } else if (event.type === "status" && taskRun.runId === event.run.id) {
          void this.recordTaskCompletion(session, taskRun, event.run);
        }
      }
    }
  }

  markInterrupted(session: AgentSession): void {
    for (const taskRun of session.plan?.taskRuns ?? []) {
      if (taskRun.status === "Running") {
        taskRun.status = "Interrupted";
        taskRun.endedAt = new Date().toISOString();
        taskRun.failureReason = "Task was interrupted before Levi shut down.";
        taskRun.updatedAt = taskRun.endedAt;
      }
    }
    for (const gitRun of session.plan?.gitRuns ?? []) {
      if (gitRun.status === "Executing") {
        gitRun.status = "Interrupted";
        gitRun.endedAt = new Date().toISOString();
        gitRun.failureReason = "Git operation was interrupted before Levi shut down.";
        gitRun.updatedAt = gitRun.endedAt;
      }
    }
  }

  private async createPreview(sessionId: string, action: AgentApprovalAction): Promise<AgentActionPreview> {
    const target = await this.resolvePath(action.relativePath);
    const now = new Date().toISOString();
    let destination: ResolvedWorkspacePath | undefined;
    let originalContent: string | undefined;
    let proposedContent: string | undefined;
    let diff: AgentDiffLine[] = [];
    let addedLineCount = 0;
    let removedLineCount = 0;

    if (action.destinationRelativePath) {
      destination = await this.resolvePath(action.destinationRelativePath);
    }

    if (action.type === "create-file") {
      await assertPathMissing(target.absolutePath, "Target file already exists.");
      proposedContent = validateTextContent(action.content, "File content");
      const result = generateLocalDiff("", proposedContent);
      diff = result.lines.slice(0, MAX_DIFF_LINES);
      addedLineCount = result.addedLineCount;
      removedLineCount = result.removedLineCount;
    } else if (action.type === "modify-file") {
      originalContent = await readTextFile(target.absolutePath, target.rootRealPath);
      proposedContent = applyFileEdits(originalContent, action);
      const result = generateLocalDiff(originalContent, proposedContent);
      diff = result.lines.slice(0, MAX_DIFF_LINES);
      addedLineCount = result.addedLineCount;
      removedLineCount = result.removedLineCount;
    } else if (action.type === "delete-file") {
      originalContent = await readTextFile(target.absolutePath, target.rootRealPath);
      const result = generateLocalDiff(originalContent, "");
      diff = result.lines.slice(0, MAX_DIFF_LINES);
      addedLineCount = result.addedLineCount;
      removedLineCount = result.removedLineCount;
    } else if (action.type === "rename-file") {
      if (!destination) throw new Error("Rename file actions require a destination path.");
      await assertExistingKind(target.absolutePath, "file");
      await assertPathMissing(destination.absolutePath, "Destination file already exists.");
    } else if (action.type === "create-folder") {
      await assertPathMissing(target.absolutePath, "Target folder already exists.");
    } else if (action.type === "rename-folder") {
      if (!destination) throw new Error("Rename folder actions require a destination path.");
      await assertExistingKind(target.absolutePath, "folder");
      await assertPathMissing(destination.absolutePath, "Destination folder already exists.");
    } else {
      throw new Error("Agent action is not supported by the file executor.");
    }

    return {
      previewId: randomUUID(),
      sessionId,
      actionId: action.id,
      actionType: action.type,
      targetPath: target.relativePath,
      destinationPath: destination?.relativePath,
      summary: previewSummary(action),
      riskLevel: riskFor(action),
      destructive: action.type === "delete-file" || action.type === "rename-file" || action.type === "rename-folder",
      originalContent,
      proposedContent,
      addedLineCount,
      removedLineCount,
      diff,
      createdAt: now
    };
  }

  private async applyAction(action: AgentApprovalAction, preview: AgentActionPreview): Promise<UndoRecord> {
    const target = await this.resolvePath(preview.targetPath);
    if (action.type === "create-file") {
      await assertPathMissing(target.absolutePath, "Target file already exists.");
      await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
      await writeAtomically(target.absolutePath, preview.proposedContent ?? "");
      const written = await readTextFile(target.absolutePath, target.rootRealPath);
      if (hashContent(written) !== hashContent(preview.proposedContent ?? "")) {
        throw new Error("Post-write verification failed.");
      }
      return { kind: "create-file", actionId: action.id, relativePath: target.relativePath, absolutePath: target.absolutePath, timestamp: new Date().toISOString() };
    }
    if (action.type === "modify-file") {
      const current = await readTextFile(target.absolutePath, target.rootRealPath);
      if (hashContent(current) !== hashContent(preview.originalContent ?? "")) {
        throw new Error("File changed since the agent preview was prepared.");
      }
      await writeAtomically(target.absolutePath, preview.proposedContent ?? "");
      const written = await readTextFile(target.absolutePath, target.rootRealPath);
      const proposedHash = hashContent(preview.proposedContent ?? "");
      if (hashContent(written) !== proposedHash) {
        throw new Error("Post-write verification failed.");
      }
      return {
        kind: "modify-file",
        actionId: action.id,
        relativePath: target.relativePath,
        absolutePath: target.absolutePath,
        previousContent: preview.originalContent ?? "",
        previousHash: hashContent(preview.originalContent ?? ""),
        appliedHash: proposedHash,
        timestamp: new Date().toISOString()
      };
    }
    if (action.type === "delete-file") {
      const current = await readTextFile(target.absolutePath, target.rootRealPath);
      if (hashContent(current) !== hashContent(preview.originalContent ?? "")) {
        throw new Error("File changed since the agent preview was prepared.");
      }
      await fs.unlink(target.absolutePath);
      return {
        kind: "delete-file",
        actionId: action.id,
        relativePath: target.relativePath,
        absolutePath: target.absolutePath,
        previousContent: preview.originalContent ?? "",
        previousHash: hashContent(preview.originalContent ?? ""),
        timestamp: new Date().toISOString()
      };
    }
    if (action.type === "rename-file" || action.type === "rename-folder") {
      if (!preview.destinationPath) throw new Error("Rename action has no destination path.");
      const destination = await this.resolvePath(preview.destinationPath);
      await assertPathMissing(destination.absolutePath, "Destination already exists.");
      await assertExistingKind(target.absolutePath, action.type === "rename-file" ? "file" : "folder");
      await fs.mkdir(path.dirname(destination.absolutePath), { recursive: true });
      await fs.rename(target.absolutePath, destination.absolutePath);
      return {
        kind: action.type,
        actionId: action.id,
        relativePath: target.relativePath,
        destinationRelativePath: destination.relativePath,
        absolutePath: target.absolutePath,
        destinationAbsolutePath: destination.absolutePath,
        timestamp: new Date().toISOString()
      };
    }
    if (action.type === "create-folder") {
      await assertPathMissing(target.absolutePath, "Target folder already exists.");
      await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
      await fs.mkdir(target.absolutePath);
      return { kind: "create-folder", actionId: action.id, relativePath: target.relativePath, absolutePath: target.absolutePath, timestamp: new Date().toISOString() };
    }
    throw new Error("Agent action is not supported by the file executor.");
  }

  private async undoRecord(undo: UndoRecord): Promise<void> {
    if (undo.kind === "create-file") {
      await fs.unlink(undo.absolutePath);
      return;
    }
    if (undo.kind === "modify-file") {
      const current = await readTextFile(undo.absolutePath, path.dirname(undo.absolutePath));
      if (undo.appliedHash && hashContent(current) !== undo.appliedHash) {
        throw new Error("Cannot undo because the file changed after the agent applied it.");
      }
      await writeAtomically(undo.absolutePath, undo.previousContent);
      const restored = await readTextFile(undo.absolutePath, path.dirname(undo.absolutePath));
      if (hashContent(restored) !== undo.previousHash) {
        throw new Error("Undo verification failed.");
      }
      return;
    }
    if (undo.kind === "delete-file") {
      await assertPathMissing(undo.absolutePath, "Cannot undo delete because the path now exists.");
      await fs.mkdir(path.dirname(undo.absolutePath), { recursive: true });
      await writeAtomically(undo.absolutePath, undo.previousContent);
      return;
    }
    if (undo.kind === "rename-file" || undo.kind === "rename-folder") {
      await assertPathMissing(undo.absolutePath, "Cannot undo rename because the original path now exists.");
      await fs.mkdir(path.dirname(undo.absolutePath), { recursive: true });
      await fs.rename(undo.destinationAbsolutePath, undo.absolutePath);
      return;
    }
    if (undo.kind === "create-folder") {
      await fs.rmdir(undo.absolutePath);
    }
  }

  private requirePreview(previewId: string, sessionId: string, actionId: string): AgentActionPreview {
    const preview = this.previews.get(previewId);
    if (!preview || preview.sessionId !== sessionId || preview.actionId !== actionId) {
      throw new Error("Agent action preview was not found.");
    }
    return preview;
  }

  private async resolvePath(relativePath: unknown): Promise<ResolvedWorkspacePath> {
    const workspaceRoot = this.options.getWorkspaceRoot();
    if (!workspaceRoot) {
      throw new Error("No workspace is open.");
    }
    const rootRealPath = await fs.realpath(workspaceRoot);
    const normalized = validateRelativePath(relativePath);
    const absolutePath = path.resolve(rootRealPath, normalized);
    if (!isInsideRoot(rootRealPath, absolutePath)) {
      throw new Error("Agent workspace path escapes the selected project.");
    }
    const parentRealPath = await nearestExistingParentRealPath(path.dirname(absolutePath), rootRealPath);
    if (!isInsideRoot(rootRealPath, parentRealPath)) {
      throw new Error("Agent workspace path resolves outside the selected project.");
    }
    return { rootRealPath, relativePath: normalizeSlashes(path.relative(rootRealPath, absolutePath)), absolutePath, parentRealPath };
  }

  private async touch(session: AgentSession): Promise<void> {
    if (session.plan) {
      ensureQueue(session);
      session.plan.progress = progressFromSession(session);
      session.plan.updatedAt = new Date().toISOString();
    }
    session.updatedAt = new Date().toISOString();
    await this.options.persistAndEmit();
  }

  private async resolveTask(action: AgentApprovalAction): Promise<TaskDefinition> {
    if (!this.options.taskService) {
      throw new Error("TaskService is unavailable.");
    }
    const taskId = action.taskId ?? action.taskName;
    if (!taskId) {
      throw new Error("Agent task action is missing a task ID.");
    }
    const tasks = await this.options.taskService.list();
    const task = tasks.detected.find((item) => item.id === taskId || item.label === taskId);
    if (!task) {
      throw new Error("Agent task action references a missing task.");
    }
    if (action.taskFingerprint && taskFingerprint(task) !== action.taskFingerprint) {
      throw new Error("Agent task definition changed since planning.");
    }
    return task;
  }

  private createTaskPreview(sessionId: string, action: AgentApprovalAction, task: TaskDefinition): AgentTaskPreview {
    return {
      previewId: randomUUID(),
      sessionId,
      actionId: action.id,
      taskId: task.id,
      taskName: task.label,
      source: task.source,
      executable: task.command,
      args: [...task.args],
      cwd: task.cwd,
      expectedPurpose: action.description || action.title,
      riskLevel: taskRisk(task),
      longRunning: isLongRunningTask(task),
      definitionFingerprint: taskFingerprint(task),
      createdAt: new Date().toISOString()
    };
  }

  private requireTaskPreview(previewId: string, sessionId: string, actionId: string): AgentTaskPreview {
    const preview = this.taskPreviews.get(previewId);
    if (!preview || preview.sessionId !== sessionId || preview.actionId !== actionId) {
      throw new Error("Agent task preview was not found.");
    }
    return preview;
  }

  private async recordTaskCompletion(session: AgentSession, taskRun: AgentTaskRunState, run: TaskRun): Promise<void> {
    if (run.status === "running" || run.status === "queued") {
      taskRun.status = "Running";
    } else if (run.status === "succeeded") {
      taskRun.status = "Succeeded";
      session.status = "Ready";
    } else if (run.status === "cancelled") {
      taskRun.status = "Cancelled";
      session.status = "Ready";
      taskRun.failureReason = "Task was cancelled.";
    } else {
      taskRun.status = "Failed";
      session.status = "Error";
      taskRun.failureReason = `Task failed with exit code ${run.exitCode ?? 1}.`;
      session.error = taskRun.failureReason;
    }
    taskRun.runId = run.id;
    taskRun.terminalSessionId = run.terminalSessionId;
    taskRun.startedAt = run.startedAt ?? taskRun.startedAt;
    taskRun.endedAt = run.endedAt ?? taskRun.endedAt;
    taskRun.exitCode = run.exitCode;
    taskRun.durationMs = run.durationMs;
    taskRun.outputPreview = boundedOutput(this.options.taskService?.getOutput({ source: "task" }).filter((entry) => entry.taskRunId === run.id) ?? taskRun.outputPreview);
    taskRun.problems = (this.options.taskService?.getProblems().filter((problem) => problem.taskRunId === run.id) ?? taskRun.problems).slice(0, MAX_TASK_PROBLEMS);
    taskRun.updatedAt = new Date().toISOString();
    await this.touch(session);
    this.options.emitTask?.(session.id, taskRun.actionId, taskRun);
  }

  private async createVerification(session: AgentSession, taskRun: AgentTaskRunState): Promise<AgentTaskVerificationSummary> {
    const outputExcerpt = taskRun.outputPreview.map((entry) => entry.text).join("").slice(-MAX_TASK_OUTPUT_CHARS);
    const changedFiles = this.options.getChangedFiles?.().slice(0, 40) ?? [];
    const fallback = `${taskRun.taskName} ${taskRun.status.toLowerCase()}${taskRun.exitCode === undefined ? "" : ` with exit code ${taskRun.exitCode}`}.`;
    let summary = fallback;
    if (this.options.runtimeManager && session.modelId) {
      try {
        const response: AIRuntimeInvocationResponse = await this.options.runtimeManager.chat({
          providerId: session.runtimeId,
          model: session.modelId,
          messages: [
            {
              role: "system",
              content: "Summarize approved Levi task results. Do not propose edits, run commands, request retries, or trigger follow-up actions."
            },
            {
              role: "user",
              content: JSON.stringify({
                task: taskRun.taskName,
                status: taskRun.status,
                exitCode: taskRun.exitCode,
                durationMs: taskRun.durationMs,
                outputExcerpt,
                problems: taskRun.problems,
                changedFiles
              })
            }
          ]
        });
        summary = response.content.slice(0, 2_000);
      } catch {
        summary = fallback;
      }
    }
    return {
      id: randomUUID(),
      actionId: taskRun.actionId,
      taskRunId: taskRun.runId,
      summary,
      exitCode: taskRun.exitCode,
      durationMs: taskRun.durationMs,
      outputExcerpt,
      problems: taskRun.problems.slice(0, MAX_TASK_PROBLEMS),
      changedFiles,
      createdAt: new Date().toISOString()
    };
  }

  private async createGitPreview(sessionId: string, action: AgentApprovalAction): Promise<AgentGitPreview> {
    if (!this.options.gitService) throw new Error("GitService is unavailable.");
    const operation = normalizeGitOperation(action.gitOperation);
    const preview = await this.options.gitService.preview({
      operation,
      relativePaths: gitActionPaths(action),
      commitMessage: action.commitMessage,
      branchName: action.branchName
    });
    return {
      previewId: randomUUID(),
      sessionId,
      actionId: action.id,
      operation: preview.operation,
      repositoryRoot: preview.repositoryRoot,
      relativePaths: preview.relativePaths,
      affectedFiles: preview.affectedFiles,
      commitMessage: preview.commitMessage,
      branchName: preview.branchName,
      riskLevel: preview.riskLevel,
      unifiedDiff: preview.unifiedDiff,
      fileCount: preview.fileCount,
      addedLineCount: preview.addedLineCount,
      removedLineCount: preview.removedLineCount,
      status: preview.status,
      warnings: preview.warnings,
      createdAt: preview.createdAt
    };
  }

  private requireGitPreview(previewId: string, sessionId: string, actionId: string): AgentGitPreview {
    const preview = this.gitPreviews.get(previewId);
    if (!preview || preview.sessionId !== sessionId || preview.actionId !== actionId) {
      throw new Error("Agent Git preview was not found.");
    }
    return preview;
  }

  private async createGitVerification(session: AgentSession, gitRun: AgentGitRunState, status: GitRepositoryStatus): Promise<AgentGitVerificationSummary> {
    const fallback = `${gitRun.operation} ${gitRun.status.toLowerCase()}${gitRun.commitHash ? ` at ${gitRun.commitHash}` : ""}.`;
    let summary = fallback;
    if (this.options.runtimeManager && session.modelId) {
      try {
        const response: AIRuntimeInvocationResponse = await this.options.runtimeManager.chat({
          providerId: session.runtimeId,
          model: session.modelId,
          messages: [
            {
              role: "system",
              content: "Summarize approved Levi Git operation results. Do not propose edits, run commands, request retries, or trigger follow-up actions."
            },
            {
              role: "user",
              content: JSON.stringify({
                operation: gitRun.operation,
                status: gitRun.status,
                repositoryRoot: gitRun.repositoryRoot,
                affectedFiles: gitRun.affectedFiles,
                branchName: gitRun.branchName,
                commitHash: gitRun.commitHash,
                durationMs: gitRun.durationMs,
                stdout: gitRun.stdout,
                stderr: gitRun.stderr,
                statusLines: status.summary
              })
            }
          ]
        });
        summary = response.content.slice(0, 2_000);
      } catch {
        summary = fallback;
      }
    }
    return {
      id: randomUUID(),
      actionId: gitRun.actionId,
      operation: gitRun.operation,
      summary,
      repositoryRoot: gitRun.repositoryRoot,
      currentBranch: status.currentBranch,
      commitHash: gitRun.commitHash,
      durationMs: gitRun.durationMs,
      affectedFiles: gitRun.affectedFiles.slice(0, 80),
      statusLines: status.summary.slice(0, MAX_GIT_STATUS_LINES),
      createdAt: new Date().toISOString()
    };
  }
}

function validatePreviewRequest(value: unknown): AgentPreviewRequest {
  if (!value || typeof value !== "object") throw new Error("Agent preview request is invalid.");
  const record = value as Record<string, unknown>;
  return { sessionId: validateId(record.sessionId, "sessionId"), actionId: validateId(record.actionId, "actionId") };
}

function validateExecuteRequest(value: unknown): AgentExecuteRequest {
  if (!value || typeof value !== "object") throw new Error("Agent execute request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    actionId: validateId(record.actionId, "actionId"),
    previewId: record.previewId === undefined ? undefined : validateId(record.previewId, "previewId")
  };
}

function validateUndoRequest(value: unknown): AgentUndoRequest {
  if (!value || typeof value !== "object") throw new Error("Agent undo request is invalid.");
  return { sessionId: validateId((value as Record<string, unknown>).sessionId, "sessionId") };
}

function validateQueueRequest(value: unknown): AgentQueueRequest {
  if (!value || typeof value !== "object") throw new Error("Agent queue request is invalid.");
  return { sessionId: validateId((value as Record<string, unknown>).sessionId, "sessionId") };
}

function validateCancelRequest(value: unknown): AgentCancelRequest {
  if (!value || typeof value !== "object") throw new Error("Agent cancel request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    actionId: record.actionId === undefined ? undefined : validateId(record.actionId, "actionId")
  };
}

function validateTaskPreviewRequest(value: unknown): AgentTaskPreviewRequest {
  if (!value || typeof value !== "object") throw new Error("Agent task preview request is invalid.");
  const record = value as Record<string, unknown>;
  return { sessionId: validateId(record.sessionId, "sessionId"), actionId: validateId(record.actionId, "actionId") };
}

function validateTaskExecuteRequest(value: unknown): AgentTaskExecuteRequest {
  if (!value || typeof value !== "object") throw new Error("Agent task execute request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    actionId: validateId(record.actionId, "actionId"),
    previewId: record.previewId === undefined ? undefined : validateId(record.previewId, "previewId")
  };
}

function validateTaskCancelRequest(value: unknown): AgentTaskCancelRequest {
  if (!value || typeof value !== "object") throw new Error("Agent task cancel request is invalid.");
  const record = value as Record<string, unknown>;
  return { sessionId: validateId(record.sessionId, "sessionId"), actionId: validateId(record.actionId, "actionId") };
}

function validateTaskStatusRequest(value: unknown): AgentTaskStatusRequest {
  if (!value || typeof value !== "object") throw new Error("Agent task status request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    actionId: record.actionId === undefined ? undefined : validateId(record.actionId, "actionId")
  };
}

function validateTaskVerifyRequest(value: unknown): AgentTaskVerifyRequest {
  if (!value || typeof value !== "object") throw new Error("Agent task verify request is invalid.");
  const record = value as Record<string, unknown>;
  return { sessionId: validateId(record.sessionId, "sessionId"), actionId: validateId(record.actionId, "actionId") };
}

function validateGitPreviewRequest(value: unknown): AgentGitPreviewRequest {
  if (!value || typeof value !== "object") throw new Error("Agent Git preview request is invalid.");
  const record = value as Record<string, unknown>;
  return { sessionId: validateId(record.sessionId, "sessionId"), actionId: validateId(record.actionId, "actionId") };
}

function validateGitExecuteRequest(value: unknown): AgentGitExecuteRequest {
  if (!value || typeof value !== "object") throw new Error("Agent Git execute request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    actionId: validateId(record.actionId, "actionId"),
    previewId: record.previewId === undefined ? undefined : validateId(record.previewId, "previewId")
  };
}

function validateGitStatusRequest(value: unknown): AgentGitStatusRequest {
  if (!value || typeof value !== "object") throw new Error("Agent Git status request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    actionId: record.actionId === undefined ? undefined : validateId(record.actionId, "actionId")
  };
}

function validateId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 140 || value.includes("\0")) throw new Error(`${field} is invalid.`);
  return value;
}

function validateRelativePath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500 || path.isAbsolute(value) || value.includes("\0")) {
    throw new Error("Agent workspace path is invalid.");
  }
  const normalized = normalizeSlashes(value).replace(/^\.\//, "");
  if (!normalized || normalized.split("/").includes("..")) {
    throw new Error("Agent workspace path is invalid.");
  }
  return normalized;
}

function validateTextContent(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > MAX_CONTENT_CHARS || value.includes("\0")) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function requireAction(session: AgentSession, actionId: string): AgentApprovalAction {
  if (!session.plan) throw new Error("Agent session has no execution plan.");
  const action = session.plan.approvals.find((item) => item.id === actionId);
  if (!action) throw new Error("Agent approval action was not found.");
  return action;
}

function requireSupportedApprovedAction(action: AgentApprovalAction): void {
  if (action.status !== "Approved") {
    throw new Error("Agent action must be approved before execution preview.");
  }
  if (!SUPPORTED_ACTIONS.has(action.type)) {
    throw new Error("Only approved workspace file actions can be executed in this milestone.");
  }
}

function requireApprovedTaskAction(action: AgentApprovalAction): void {
  if (action.status !== "Approved") {
    throw new Error("Agent task action must be approved before execution.");
  }
  if (action.type !== "run-task") {
    throw new Error("Only approved task actions can use the task executor.");
  }
}

function requireApprovedGitAction(action: AgentApprovalAction): void {
  if (action.status !== "Approved") {
    throw new Error("Agent Git action must be approved before execution.");
  }
  if (action.type !== "git-operation") {
    throw new Error("Only approved Git actions can use the Git executor.");
  }
}

function ensureQueue(session: AgentSession): AgentExecutionQueueItem[] {
  if (!session.plan) throw new Error("Agent session has no execution plan.");
  const existing = new Map((session.plan.executionQueue ?? []).map((item) => [item.actionId, item]));
  session.plan.executionQueue = session.plan.approvals.map((action) => ({
    actionId: action.id,
    type: action.type,
    title: action.title,
    relativePath: action.relativePath,
    destinationRelativePath: action.destinationRelativePath,
    status: existing.get(action.id)?.status ?? "Pending",
    previewId: existing.get(action.id)?.previewId,
    startedAt: existing.get(action.id)?.startedAt,
    completedAt: existing.get(action.id)?.completedAt,
    error: existing.get(action.id)?.error
  }));
  return session.plan.executionQueue;
}

function ensureQueueItem(session: AgentSession, action: AgentApprovalAction): AgentExecutionQueueItem {
  const item = ensureQueue(session).find((candidate) => candidate.actionId === action.id);
  if (!item) throw new Error("Agent execution queue item was not found.");
  return item;
}

function ensureTaskRuns(session: AgentSession): AgentTaskRunState[] {
  if (!session.plan) throw new Error("Agent session has no execution plan.");
  session.plan.taskRuns = Array.isArray(session.plan.taskRuns) ? session.plan.taskRuns : [];
  return session.plan.taskRuns;
}

function ensureGitRuns(session: AgentSession): AgentGitRunState[] {
  if (!session.plan) throw new Error("Agent session has no execution plan.");
  session.plan.gitRuns = Array.isArray(session.plan.gitRuns) ? session.plan.gitRuns : [];
  return session.plan.gitRuns;
}

function ensureGitRun(session: AgentSession, action: AgentApprovalAction, preview: AgentGitPreview): AgentGitRunState {
  const runs = ensureGitRuns(session);
  let run = runs.find((item) => item.actionId === action.id);
  if (!run) {
    run = {
      actionId: action.id,
      operation: preview.operation,
      status: "Pending",
      repositoryRoot: preview.repositoryRoot,
      affectedFiles: preview.affectedFiles,
      commitMessage: preview.commitMessage,
      branchName: preview.branchName,
      updatedAt: new Date().toISOString()
    };
    runs.push(run);
  }
  run.operation = preview.operation;
  run.repositoryRoot = preview.repositoryRoot;
  run.affectedFiles = preview.affectedFiles;
  run.commitMessage = preview.commitMessage;
  run.branchName = preview.branchName;
  return run;
}

function ensureTaskRun(session: AgentSession, action: AgentApprovalAction, preview: AgentTaskPreview): AgentTaskRunState {
  const runs = ensureTaskRuns(session);
  let run = runs.find((item) => item.actionId === action.id);
  if (!run) {
    run = {
      actionId: action.id,
      taskId: preview.taskId,
      taskName: preview.taskName,
      status: "Pending",
      longRunning: preview.longRunning,
      definitionFingerprint: preview.definitionFingerprint,
      outputPreview: [],
      problems: [],
      updatedAt: new Date().toISOString()
    };
    runs.push(run);
  }
  run.taskId = preview.taskId;
  run.taskName = preview.taskName;
  run.longRunning = preview.longRunning;
  run.definitionFingerprint = preview.definitionFingerprint;
  return run;
}

function requireTaskRun(session: AgentSession, actionId: string): AgentTaskRunState {
  const run = ensureTaskRuns(session).find((item) => item.actionId === actionId);
  if (!run) throw new Error("Agent task action run state was not found.");
  return run;
}

function progressFromSession(session: AgentSession): NonNullable<AgentSession["plan"]>["progress"] {
  const plan = session.plan;
  if (!plan) return { totalSteps: 0, pendingActions: 0, approvedActions: 0, rejectedActions: 0, completedActions: 0 };
  const queue = ensureQueue(session);
  return {
    totalSteps: plan.steps.length,
    pendingActions: plan.approvals.filter((item) => item.status === "Pending").length,
    approvedActions: plan.approvals.filter((item) => item.status === "Approved").length,
    rejectedActions: plan.approvals.filter((item) => item.status === "Rejected").length + queue.filter((item) => item.status === "Rejected").length,
    completedActions:
      queue.filter((item) => item.status === "Completed").length +
      (plan.taskRuns ?? []).filter((item) => item.status === "Succeeded").length +
      (plan.gitRuns ?? []).filter((item) => item.status === "Succeeded").length
  };
}

function normalizeGitOperation(value: unknown): GitOperation {
  if (
    value === "status" ||
    value === "stage-file" ||
    value === "unstage-file" ||
    value === "stage-all" ||
    value === "commit" ||
    value === "create-branch" ||
    value === "switch-branch" ||
    value === "restore-file" ||
    value === "show-diff"
  ) return value;
  throw new Error("Agent Git operation is not supported.");
}

function gitActionPaths(action: AgentApprovalAction): string[] {
  const paths = action.affectedFiles?.length ? action.affectedFiles : action.relativePath ? [action.relativePath] : [];
  return paths.map(validateRelativePath).slice(0, 80);
}

function toGitOperationPreview(preview: AgentGitPreview): GitOperationPreview {
  return {
    operation: preview.operation,
      relativePaths: preview.relativePaths,
    commitMessage: preview.commitMessage,
    branchName: preview.branchName,
    repositoryRoot: preview.repositoryRoot,
    affectedFiles: preview.affectedFiles,
    riskLevel: preview.riskLevel,
    unifiedDiff: preview.unifiedDiff,
    fileCount: preview.fileCount,
    addedLineCount: preview.addedLineCount,
    removedLineCount: preview.removedLineCount,
    status: preview.status,
    warnings: preview.warnings,
    createdAt: preview.createdAt
  };
}

function taskFingerprint(task: TaskDefinition): string {
  return createHash("sha256")
    .update(JSON.stringify({ id: task.id, label: task.label, source: task.source, group: task.group, command: task.command, args: task.args, cwd: task.cwd }))
    .digest("hex");
}

function assertTaskFingerprint(task: TaskDefinition, fingerprint: string): void {
  if (taskFingerprint(task) !== fingerprint) {
    throw new Error("Agent task definition changed since preview.");
  }
}

function isLongRunningTask(task: TaskDefinition): boolean {
  return task.group === "dev" || task.group === "watch" || /\b(dev|watch|serve|start)\b/i.test(task.label);
}

function taskRisk(task: TaskDefinition): AgentRiskLevel {
  if (task.group === "dev" || task.group === "watch") return "medium";
  if (task.group === "test" || task.group === "lint" || task.group === "build") return "low";
  return "medium";
}

function boundedOutput(entries: TaskOutputEntry[]): TaskOutputEntry[] {
  const tail = entries.slice(-MAX_TASK_OUTPUT_ENTRIES);
  let total = 0;
  const bounded: TaskOutputEntry[] = [];
  for (const entry of [...tail].reverse()) {
    if (total >= MAX_TASK_OUTPUT_CHARS) break;
    const remaining = MAX_TASK_OUTPUT_CHARS - total;
    const text = entry.text.length > remaining ? entry.text.slice(entry.text.length - remaining) : entry.text;
    bounded.unshift({ ...entry, text });
    total += text.length;
  }
  return bounded;
}

async function readTextFile(absolutePath: string, rootRealPath: string): Promise<string> {
  const realPath = await fs.realpath(absolutePath);
  if (!isInsideRoot(rootRealPath, realPath)) {
    throw new Error("Agent file target is outside the workspace.");
  }
  const stats = await fs.stat(realPath);
  if (!stats.isFile()) {
    throw new Error("Agent file target is not a file.");
  }
  if (stats.size > MAX_TEXT_BYTES) {
    throw new Error("Agent file target exceeds the safe size limit.");
  }
  const buffer = await fs.readFile(realPath);
  if (buffer.includes(0)) {
    throw new Error("Binary files cannot be edited by the agent.");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error("Agent file target is not valid UTF-8.");
  }
}

async function assertExistingKind(absolutePath: string, kind: "file" | "folder"): Promise<void> {
  const stats = await fs.stat(absolutePath);
  if (kind === "file" && !stats.isFile()) throw new Error("Agent target is not a file.");
  if (kind === "folder" && !stats.isDirectory()) throw new Error("Agent target is not a folder.");
}

async function assertPathMissing(absolutePath: string, message: string): Promise<void> {
  try {
    await fs.lstat(absolutePath);
    throw new Error(message);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

async function nearestExistingParentRealPath(parentPath: string, rootRealPath: string): Promise<string> {
  let current = parentPath;
  while (isInsideRoot(rootRealPath, current)) {
    try {
      const stats = await fs.stat(current);
      if (!stats.isDirectory()) {
        throw new Error("Agent workspace parent path is not a folder.");
      }
      return fs.realpath(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const next = path.dirname(current);
      if (next === current) break;
      current = next;
    }
  }
  throw new Error("Agent workspace parent path escapes the selected project.");
}

function applyFileEdits(originalContent: string, action: AgentApprovalAction): string {
  if (typeof action.content === "string") {
    return normalizeProposedLineEndings(originalContent, validateTextContent(action.content, "Proposed file content"));
  }
  if (!action.edits?.length) {
    throw new Error("Modify file action has no concrete edit payload.");
  }
  let next = originalContent;
  for (const edit of action.edits) {
    next = applyOneEdit(next, edit);
  }
  next = normalizeProposedLineEndings(originalContent, next);
  if (hashContent(next) === hashContent(originalContent)) {
    throw new Error("Modify file action does not change the target.");
  }
  return next;
}

function applyOneEdit(content: string, edit: AgentFileEdit): string {
  if (edit.kind === "whole-file") {
    return validateTextContent(edit.content, "Whole-file edit content");
  }
  if (edit.kind === "append") {
    const append = validateTextContent(edit.content, "Append edit content");
    const eol = detectLineEnding(content);
    return `${content}${content && !content.endsWith("\n") ? eol : ""}${append}`;
  }
  if (edit.kind === "replace" && typeof edit.find === "string") {
    const replacement = validateTextContent(edit.replace ?? edit.content ?? "", "Replacement edit content");
    const first = content.indexOf(edit.find);
    if (first < 0 || content.indexOf(edit.find, first + edit.find.length) >= 0) {
      throw new Error("Replace edit find text must match exactly once.");
    }
    return `${content.slice(0, first)}${replacement}${content.slice(first + edit.find.length)}`;
  }

  const lines = splitLines(content);
  const eol = detectLineEnding(content);
  if (edit.kind === "insert") {
    const line = validateLine(edit.line, "insert line", lines.length + 1);
    lines.splice(line - 1, 0, ...splitLines(validateTextContent(edit.content, "Insert edit content")));
    return lines.join(eol);
  }
  if (edit.kind === "replace") {
    const range = validateRange(edit.startLine, edit.endLine, lines.length);
    lines.splice(range.start - 1, range.end - range.start + 1, ...splitLines(validateTextContent(edit.content ?? edit.replace ?? "", "Replacement edit content")));
    return lines.join(eol);
  }
  if (edit.kind === "delete-range") {
    const range = validateRange(edit.startLine, edit.endLine, lines.length);
    lines.splice(range.start - 1, range.end - range.start + 1);
    return lines.join(eol);
  }
  throw new Error("Agent file edit kind is invalid.");
}

function splitLines(content: string): string[] {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function validateLine(value: unknown, label: string, max: number): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > max) {
    throw new Error(`${label} is invalid.`);
  }
  return value as number;
}

function validateRange(start: unknown, end: unknown, max: number): { start: number; end: number } {
  const startLine = validateLine(start, "range start", max);
  const endLine = validateLine(end, "range end", max);
  if (endLine < startLine) {
    throw new Error("Edit line range is invalid.");
  }
  return { start: startLine, end: endLine };
}

function detectLineEnding(content: string): "\r\n" | "\n" {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeProposedLineEndings(original: string, proposed: string): string {
  const eol = detectLineEnding(original);
  const normalized = proposed.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return eol === "\r\n" ? normalized.replace(/\n/g, "\r\n") : normalized;
}

function previewSummary(action: AgentApprovalAction): string {
  const target = action.relativePath ?? "workspace";
  if (action.type === "rename-file" || action.type === "rename-folder") {
    return `${action.title}: ${target} -> ${action.destinationRelativePath}`;
  }
  return `${action.title}: ${target}`;
}

function riskFor(action: AgentApprovalAction): AgentRiskLevel {
  if (action.type === "delete-file") return "high";
  if (action.type === "modify-file" || action.type === "rename-file" || action.type === "rename-folder") return "medium";
  return "low";
}

function undoMetadata(undo: UndoRecord): AgentUndoMetadata {
  return {
    actionId: undo.actionId,
    actionType: undo.kind,
    relativePath: undo.relativePath,
    destinationRelativePath: "destinationRelativePath" in undo ? undo.destinationRelativePath : undefined,
    timestamp: undo.timestamp
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Agent action execution failed.";
}
