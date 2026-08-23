import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { TextDecoder } from "node:util";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { BrowserWindow } from "electron";
import type {
  AgentActionPreview,
  AgentActionType,
  AgentApprovalAction,
  AgentBrowserExecuteRequest,
  AgentBrowserExecutionResult,
  AgentBrowserPreviewRequest,
  AgentBrowserPreviewResult,
  AgentBrowserRunState,
  AgentBrowserStatusRequest,
  AgentBrowserStatusResult,
  AgentCancelRequest,
  AgentCommandLedgerEntry,
  AgentDiffLine,
  AgentExecuteRequest,
  AgentExecutionQueueItem,
  AgentExecutionResult,
  AgentFailureClassification,
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
  AgentOperationLedgerEntry,
  AgentPreviewRequest,
  AgentPreviewResult,
  AgentQueueRequest,
  AgentQueueResult,
  AgentRecoveredFileSnapshot,
  AgentRepairPlanRequest,
  AgentRepairPlanResult,
  AgentRepairExecuteRequest,
  AgentRepairExecutionResult,
  AgentRepairQueueItem,
  AgentRepairStatusRequest,
  AgentRepairStatusResult,
  AgentRestoreOperationRequest,
  AgentRestoreOperationResult,
  AgentResumeEligibility,
  AgentResumeOperationRequest,
  AgentResumeOperationResult,
  AgentRiskLevel,
  AgentRollbackChoice,
  AgentRollbackConflict,
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
  AgentTerminalCancelRequest,
  AgentTerminalExecuteRequest,
  AgentTerminalExecutionResult,
  AgentTerminalPreview,
  AgentTerminalPreviewRequest,
  AgentTerminalPreviewResult,
  AgentTerminalRunState,
  AgentTerminalStatusRequest,
  AgentTerminalStatusResult,
  AgentTerminalVerificationSummary,
  AgentUndoMetadata,
  AgentUndoRequest,
  AgentUndoResult,
  AgentVerificationCheck,
  AgentVerificationFailure,
  AgentVerificationReport,
  AgentVerifyRequest,
  AgentVerifyResult
} from "../../src/features/agent";
import type { AIRuntimeInvocationResponse } from "../../src/features/ai-runtime";
import type { BrowserActionPreview, BrowserActionResult } from "../../src/features/browser";
import type { TaskDefinition, TaskEvent, TaskOutputEntry, TaskProblem, TaskRun } from "../../src/types/task-api";
import { generateLocalDiff, hashContent, writeAtomically } from "./edit-context";
import type { RuntimeManager } from "./ai-runtime";
import type { TaskService } from "./tasks/task-service";
import type { GitOperation, GitOperationPreview, GitRepositoryStatus, GitService } from "./git-service";
import type { TerminalManager } from "./terminal-manager";
import type { BrowserService } from "./browser-service";
import { getMonacoLanguage, isInsideRoot, normalizeSlashes } from "./workspace-context";

const MAX_TEXT_BYTES = 5 * 1024 * 1024;
const MAX_CONTENT_CHARS = 420_000;
const MAX_DIFF_LINES = 1_000;
const MAX_TASK_OUTPUT_ENTRIES = 40;
const MAX_TASK_OUTPUT_CHARS = 12_000;
const MAX_TASK_PROBLEMS = 40;
const MAX_GIT_OUTPUT_CHARS = 12_000;
const MAX_GIT_STATUS_LINES = 80;
const MAX_TERMINAL_OUTPUT_CHARS = 12_000;
const MAX_VERIFICATION_REPORTS = 20;
const MAX_REPAIR_ITEMS = 20;
const MAX_REPAIR_TEXT = 2_000;
const MAX_REPAIR_ATTEMPTS = 3;
const MAX_TERMINAL_ARG_LENGTH = 500;
const MAX_TERMINAL_ARGS = 80;
const SUPPORTED_ACTIONS = new Set(["create-file", "modify-file", "delete-file", "rename-file", "create-folder", "rename-folder"]);
const AUTOMATIC_REPAIR_ACTIONS = new Set(["create-file", "modify-file", "create-folder"]);
const DIRECT_PROCESS_EXECUTABLES = new Set([
  "node",
  "node.exe",
  "npm",
  "npm.cmd",
  "npx",
  "npx.cmd",
  "gradle",
  "gradle.bat",
  "gradlew.bat",
  "gradlew",
  "python",
  "python.exe",
  "dotnet",
  "dotnet.exe",
  "cargo",
  "cargo.exe",
  "go",
  "go.exe"
]);
const SAFE_TERMINAL_EXECUTABLES = new Set([
  "node",
  "node.exe",
  "npm",
  "npm.cmd",
  "npx",
  "npx.cmd",
  "pnpm",
  "pnpm.cmd",
  "yarn",
  "yarn.cmd",
  "bun",
  "bun.exe",
  "gradle",
  "gradle.bat",
  "python",
  "python.exe",
  "python3",
  "py",
  "py.exe",
  "gradlew.bat",
  "gradlew",
  "dotnet",
  "dotnet.exe",
  "cargo",
  "cargo.exe",
  "go",
  "go.exe"
]);
const BLOCKED_TERMINAL_EXECUTABLES = new Set(["cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "pwsh.exe", "bash", "zsh", "sh", "git", "git.exe"]);
const SAFE_RESUME_FILE_ACTIONS = new Set<AgentActionType>(["create-folder", "create-file", "modify-file", "rename-file", "rename-folder"]);
const SAFE_RESUME_COMMAND_WORDS = /\b(build|test|typecheck|lint|check|install|ci|assemble|verify|restore)\b/i;
const UNSAFE_RESUME_COMMAND_WORDS = /\b(dev|serve|start|watch|preview|publish|deploy|push|login|token|secret|credential|password|key)\b/i;
const SHELL_OPERATOR_PATTERN = /(&&|\|\||;|>>|>|<|\||`|\$\(|\$\{|\*|\?)/;
const ENV_INJECTION_PATTERN = /(^|[\s])([A-Za-z_][A-Za-z0-9_]*=|%[A-Za-z_][A-Za-z0-9_]*%|\$[A-Za-z_][A-Za-z0-9_]*)/;
const POWERSHELL_INVOKE_PATTERN = /\b(invoke-expression|iex)\b/i;

type AgentExecutionServiceOptions = {
  getWorkspaceRoot: () => string | null;
  snapshot: () => AgentState;
  persistAndEmit: () => Promise<void>;
  emitExecution: (sessionId: string, actionId: string) => void;
  emitPreview: (sessionId: string, preview: AgentActionPreview) => void;
  emitTaskPreview?: (sessionId: string, preview: AgentTaskPreview) => void;
  emitTask?: (sessionId: string, actionId: string, taskRun: AgentTaskRunState) => void;
  emitTaskVerification?: (sessionId: string, actionId: string, verification: AgentTaskVerificationSummary) => void;
  emitTerminalPreview?: (sessionId: string, preview: AgentTerminalPreview) => void;
  emitTerminal?: (sessionId: string, actionId: string, terminalRun: AgentTerminalRunState) => void;
  emitGitPreview?: (sessionId: string, preview: AgentGitPreview) => void;
  emitGit?: (sessionId: string, actionId: string, gitRun: AgentGitRunState) => void;
  emitVerification?: (sessionId: string, report: AgentVerificationReport) => void;
  emitRepairPlan?: (sessionId: string, reportId: string, repairs: AgentRepairQueueItem[]) => void;
  emitBrowserPreview?: (sessionId: string, preview: BrowserActionPreview) => void;
  emitBrowser?: (sessionId: string, actionId: string, browserRun: AgentBrowserRunState) => void;
  taskService?: TaskService;
  gitService?: GitService;
  terminalManager?: TerminalManager;
  browserService?: BrowserService;
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
      appliedHash?: string;
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
      previousContent?: string;
      previousHash?: string;
      appliedHash?: string;
      timestamp: string;
    }
  | {
      kind: "create-folder";
      actionId: string;
      relativePath: string;
      absolutePath: string;
      timestamp: string;
    };

type OperationRollbackPlan = {
  restoredPaths: string[];
  conflicts: AgentRollbackConflict[];
  apply: Array<() => Promise<void>>;
};

export class AgentExecutionService {
  private readonly previews = new Map<string, AgentActionPreview>();
  private readonly taskPreviews = new Map<string, AgentTaskPreview>();
  private readonly terminalPreviews = new Map<string, AgentTerminalPreview>();
  private readonly terminalProcesses = new Map<string, ChildProcessWithoutNullStreams>();
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
    let activeItem = ensureQueue(session).find((candidate) => candidate.actionId === action.id);
    if (!activeItem) {
      throw new Error("Agent execution queue item was not found.");
    }
    const operation = await this.beginFileOperation(session, action, preview);
    await this.touch(session);
    activeItem = ensureQueue(session).find((candidate) => candidate.actionId === action.id);
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
      await this.completeFileOperation(session, operation, "Completed", undo);
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
      await this.completeFileOperation(session, operation, "Failed", undefined, activeItem.error);
      session.plan!.progress = progressFromSession(session);
      await this.touch(session);
      this.options.emitExecution(session.id, action.id);
      throw error;
    }
  }

  async undo(session: AgentSession, rawRequest: unknown): Promise<AgentUndoResult> {
    const request = validateUndoRequest(rawRequest);
    const operation = latestRollbackOperation(session);
    if (!operation) throw new Error("No reversible agent operation is available.");
    const workspaceRoot = this.options.getWorkspaceRoot();
    if (!workspaceRoot) throw new Error("No workspace is open.");
    try {
      const restoredPaths = await this.rollbackOperation(session, operation, workspaceRoot, request.choices);
      this.undoBySession.delete(session.id);
      if (session.plan) {
        session.plan.lastUndo = undefined;
        for (const item of session.plan.executionQueue) {
          if (operation.actionsCompleted.includes(item.actionId)) {
            item.status = "Pending";
            item.completedAt = undefined;
            item.error = undefined;
          }
        }
        session.plan.progress = progressFromSession(session);
      }
      session.status = "Ready";
      session.updatedAt = new Date().toISOString();
      await this.options.persistAndEmit();
      this.options.emitExecution(session.id, operation.actionId ?? operation.operationId);
      return {
        sessionId: session.id,
        actionId: operation.actionId ?? operation.operationId,
        operationId: operation.operationId,
        relativePath: restoredPaths[0] ?? "",
        restoredPaths,
        state: this.options.snapshot()
      };
    } catch (error) {
      await this.options.persistAndEmit();
      throw error;
    }
  }

  async restoreOperation(session: AgentSession, rawRequest: unknown): Promise<AgentRestoreOperationResult> {
    const request = validateRestoreOperationRequest(rawRequest);
    if (request.sessionId !== session.id) throw new Error("Agent restore request session does not match.");
    const workspaceRoot = this.options.getWorkspaceRoot();
    const operation = session.plan?.recovery?.operations.find((item) => item.operationId === request.operationId);
    if (!workspaceRoot || !operation) throw new Error("Agent operation was not found.");
    try {
      const restoredPaths = await this.rollbackOperation(session, operation, workspaceRoot, request.choices);
      await this.touch(session);
      this.options.emitExecution(session.id, operation.actionId ?? operation.operationId);
      return { sessionId: session.id, operationId: operation.operationId, restoredPaths, state: this.options.snapshot() };
    } catch (error) {
      await this.options.persistAndEmit();
      throw error;
    }
  }

  async resumeOperation(session: AgentSession, rawRequest: unknown): Promise<AgentResumeOperationResult> {
    const request = validateResumeOperationRequest(rawRequest);
    if (request.sessionId !== session.id) throw new Error("Agent resume request session does not match.");
    if (!session.plan) throw new Error("Agent session has no execution plan.");
    const recovery = ensureRecovery(session);
    const operation = recovery.operations.find((item) => item.operationId === request.operationId);
    if (!operation) throw new Error("Agent operation was not found.");
    const workspaceRoot = this.options.getWorkspaceRoot();
    if (!workspaceRoot || (operation.workspaceRoot && path.resolve(operation.workspaceRoot) !== path.resolve(workspaceRoot))) {
      await this.persistResumeConflict(session, operation, "Workspace no longer matches.");
      throw new Error("Workspace no longer matches.");
    }

    operation.status = "inspecting";
    await this.touch(session);
    const eligibility = await this.evaluateResumeEligibility(session, operation);
    operation.resumeEligibility = eligibility;
    operation.resumePointer = pointerForResume(session, operation);
    if (!eligibility.available) {
      await this.persistResumeConflict(session, operation, eligibility.reason ?? "Resume Where Safe is unavailable.");
      throw new Error(eligibility.reason ?? "Resume Where Safe is unavailable.");
    }

    operation.status = "resumable";
    await this.touch(session);
    operation.status = "resuming";
    recovery.activeOperationId = operation.operationId;
    session.status = "Executing";
    session.error = undefined;
    await this.touch(session);

    const resumedActionIds: string[] = [];
    try {
      for (const actionId of operation.resumePointer?.remainingActionIds ?? []) {
        if (operation.actionsCompleted.includes(actionId)) continue;
        const action = requireAction(session, actionId);
        operation.resumePointer = {
          lastCompletedActionId: operation.actionsCompleted[operation.actionsCompleted.length - 1],
          currentActionId: actionId,
          remainingActionIds: (operation.resumePointer?.remainingActionIds ?? []).filter((id) => id !== actionId)
        };
        await this.touch(session);

        const actionEligibility = await this.evaluateResumeAction(session, operation, action);
        if (!actionEligibility.safe) {
          await this.persistResumeConflict(session, operation, actionEligibility.reason);
          throw new Error(actionEligibility.reason);
        }

        if (SAFE_RESUME_FILE_ACTIONS.has(action.type)) {
          let item = ensureQueueItem(session, action);
          if (item.status === "Completed") continue;
          item.status = "Executing";
          item.startedAt = item.startedAt ?? new Date().toISOString();
          const preview = actionEligibility.preview ?? await this.createPreview(session.id, action);
          const currentOperation = await this.beginFileOperation(session, action, preview);
          await this.touch(session);
          item = ensureQueueItem(session, action);
          const undo = await this.applyAction(action, preview);
          this.undoBySession.set(session.id, undo);
          session.plan.lastUndo = undoMetadata(undo);
          item.status = "Completed";
          item.completedAt = new Date().toISOString();
          item.error = undefined;
          await this.completeFileOperation(session, currentOperation, "Completed", undo);
          resumedActionIds.push(action.id);
          this.options.emitExecution(session.id, action.id);
        } else if (action.type === "run-terminal-command") {
          const terminalPreview = actionEligibility.terminalPreview ?? await this.createTerminalPreview(session.id, action);
          this.terminalPreviews.set(terminalPreview.previewId, terminalPreview);
          await this.terminalExecute(session, { sessionId: session.id, actionId: action.id, previewId: terminalPreview.previewId });
          operation.commandsExecuted = appendCommandLedger(operation.commandsExecuted, terminalPreview, "running");
          const run = await this.waitForTerminalResume(session, action.id);
          operation.commandsExecuted = appendCommandLedger(operation.commandsExecuted, terminalPreview, commandLedgerStatus(run));
          if (run.status !== "Succeeded") {
            operation.actionsFailed = uniqueStrings([...operation.actionsFailed, action.id]);
            await this.persistResumeConflict(session, operation, run.failureReason ?? "Resumed command failed.");
            throw new Error(run.failureReason ?? "Resumed command failed.");
          }
          operation.actionsCompleted = uniqueStrings([...operation.actionsCompleted, action.id]);
          operation.resumePointer.lastCompletedActionId = action.id;
          resumedActionIds.push(action.id);
        }
        operation.resumePointer = pointerForResume(session, operation);
      }

      const nextEligibility = await this.evaluateResumeEligibility(session, operation);
      operation.resumeEligibility = nextEligibility;
      operation.resumePointer = pointerForResume(session, operation);
      operation.status = nextEligibility.remaining > 0 ? "running" : "verifying";
      await this.touch(session);
      const report = await this.verify(session, { sessionId: session.id });
      const current = ensureRecovery(session).operations.find((item) => item.operationId === operation.operationId);
      if (current) {
        current.verificationResult = report.report.status;
        current.status = report.report.status === "Failed" ? "blocked" : "completed";
        current.completedAt = report.report.completedAt;
        current.conflict = report.report.status === "Failed" ? report.report.summary : undefined;
        current.resumeEligibility = await this.evaluateResumeEligibility(session, current);
        current.resumePointer = pointerForResume(session, current);
      }
      return { sessionId: session.id, operationId: operation.operationId, resumedActionIds, state: report.state };
    } catch (error) {
      await this.persistResumeConflict(session, operation, errorMessage(error));
      throw error;
    }
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
    const recovery = session.plan.recovery;
    if (recovery?.activeOperationId) {
      const operation = recovery.operations.find((item) => item.operationId === recovery.activeOperationId);
      if (operation) {
        operation.status = "cancelled";
        operation.completedAt = new Date().toISOString();
        operation.conflict = "Build cancelled.";
      }
      recovery.activeOperationId = undefined;
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

  async terminalPreview(session: AgentSession, rawRequest: unknown): Promise<AgentTerminalPreviewResult> {
    const request = validateTerminalPreviewRequest(rawRequest);
    const action = requireAction(session, request.actionId);
    requireApprovedTerminalAction(action);
    const preview = await this.createTerminalPreview(session.id, action);
    this.terminalPreviews.set(preview.previewId, preview);
    const terminalRun = ensureTerminalRun(session, action, preview);
    terminalRun.status = "Approved";
    terminalRun.updatedAt = new Date().toISOString();
    await this.touch(session);
    this.options.emitTerminalPreview?.(session.id, preview);
    return { sessionId: session.id, preview, state: this.options.snapshot() };
  }

  async terminalExecute(session: AgentSession, rawRequest: unknown): Promise<AgentTerminalExecutionResult> {
    const request = validateTerminalExecuteRequest(rawRequest);
    const action = requireAction(session, request.actionId);
    requireApprovedTerminalAction(action);
    if (ensureTerminalRuns(session).some((run) => run.status === "Running")) {
      throw new Error("Another agent terminal command is already running.");
    }
    const preview = request.previewId ? this.requireTerminalPreview(request.previewId, session.id, action.id) : await this.createTerminalPreview(session.id, action);
    const freshPreview = await this.createTerminalPreview(session.id, action);
    if (terminalPreviewFingerprint(preview) !== terminalPreviewFingerprint(freshPreview)) {
      throw new Error("Terminal command changed since preview.");
    }
    const terminalRun = ensureTerminalRun(session, action, preview);
    const startedAt = new Date().toISOString();
    Object.assign(terminalRun, {
      status: "Running" as const,
      startedAt,
      resultStatus: undefined,
      endedAt: undefined,
      exitCode: undefined,
      durationMs: undefined,
      terminalSessionId: undefined,
      outputPreview: "",
      stderrPreview: "",
      failureReason: undefined,
      verification: undefined,
      updatedAt: startedAt
    });
    session.status = "Executing";
    await this.touch(session);
    if (shouldUseDirectProcessExecution(preview)) {
      this.startDirectTerminalProcess(session, terminalRun, preview);
    } else {
      if (!this.options.terminalManager) throw new Error("TerminalManager is unavailable.");
      const window = this.options.getWindow?.();
      if (!window || window.isDestroyed()) throw new Error("No active Levi window is available for terminal execution.");
      try {
        const terminal = this.options.terminalManager.createCommand(
          window,
          {
            command: preview.executable,
            args: preview.args,
            cwd: preview.cwd,
            name: `Agent: ${preview.executable}`,
            cols: 96,
            rows: 16
          },
          (exitCode) => {
            void this.recordTerminalCompletion(session, terminalRun, exitCode);
          }
        );
        terminalRun.terminalSessionId = terminal.id;
      } catch (error) {
        if (!canDirectProcessExecute(preview)) {
          await this.recordTerminalInfrastructureFailure(session, terminalRun, error);
          return { sessionId: session.id, actionId: action.id, terminalRun, state: this.options.snapshot() };
        }
        this.startDirectTerminalProcess(session, terminalRun, preview);
      }
    }
    terminalRun.updatedAt = new Date().toISOString();
    await this.touch(session);
    this.options.emitTerminal?.(session.id, action.id, terminalRun);
    return { sessionId: session.id, actionId: action.id, terminalRun, state: this.options.snapshot() };
  }

  async terminalCancel(session: AgentSession, rawRequest: unknown): Promise<AgentTerminalExecutionResult> {
    const request = validateTerminalCancelRequest(rawRequest);
    const terminalRun = requireTerminalRun(session, request.actionId);
    if (terminalRun.status !== "Running") {
      throw new Error("Agent terminal command is not running.");
    }
    const child = this.terminalProcesses.get(terminalRun.actionId);
    if (child) {
      child.kill();
    } else if (terminalRun.terminalSessionId) {
      this.options.terminalManager?.kill(terminalRun.terminalSessionId);
    }
    await this.recordTerminalCompletion(session, terminalRun, terminalRun.exitCode ?? 1, "Cancelled");
    return { sessionId: session.id, actionId: request.actionId, terminalRun, state: this.options.snapshot() };
  }

  terminalStatus(session: AgentSession, rawRequest: unknown): AgentTerminalStatusResult {
    const request = validateTerminalStatusRequest(rawRequest);
    const terminalRuns = ensureTerminalRuns(session);
    return {
      sessionId: session.id,
      terminalRuns: request.actionId ? terminalRuns.filter((run) => run.actionId === request.actionId) : terminalRuns,
      state: this.options.snapshot()
    };
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

  async browserPreview(session: AgentSession, rawRequest: unknown): Promise<AgentBrowserPreviewResult> {
    const request = validateBrowserPreviewRequest(rawRequest);
    const action = requireAction(session, request.actionId);
    requireApprovedBrowserAction(action);
    if (!this.options.browserService) throw new Error("BrowserService is unavailable.");
    const preview = this.options.browserService.preview(browserRequestFromAction(action));
    const run = ensureBrowserRun(session, action, preview);
    run.status = "Approved";
    run.preview = preview;
    run.updatedAt = new Date().toISOString();
    await this.touch(session);
    this.options.emitBrowserPreview?.(session.id, preview);
    return { sessionId: session.id, preview, state: this.options.snapshot() };
  }

  async browserExecute(session: AgentSession, rawRequest: unknown): Promise<AgentBrowserExecutionResult> {
    const request = validateBrowserExecuteRequest(rawRequest);
    const action = requireAction(session, request.actionId);
    requireApprovedBrowserAction(action);
    if (!this.options.browserService) throw new Error("BrowserService is unavailable.");
    if (ensureBrowserRuns(session).some((run) => run.status === "Executing")) {
      throw new Error("Another agent browser action is already executing.");
    }
    const preview = this.options.browserService.preview(browserRequestFromAction(action));
    const run = ensureBrowserRun(session, action, preview);
    const startedAt = new Date().toISOString();
    Object.assign(run, {
      status: "Executing" as const,
      preview,
      failureReason: undefined,
      result: undefined,
      screenshotPath: undefined,
      startedAt,
      endedAt: undefined,
      updatedAt: startedAt
    });
    session.status = "Executing";
    await this.touch(session);
    try {
      const result = await executeBrowserAction(this.options.browserService, action);
      run.status = "Succeeded";
      run.result = "session" in result ? result as BrowserActionResult : undefined;
      run.session = "session" in result ? result.session : undefined;
      run.screenshotPath = "screenshotPath" in result ? result.screenshotPath : undefined;
      run.endedAt = new Date().toISOString();
      run.updatedAt = run.endedAt;
      session.status = "Ready";
      session.plan!.progress = progressFromSession(session);
      await this.touch(session);
      this.options.emitBrowser?.(session.id, action.id, run);
      return { sessionId: session.id, actionId: action.id, browserRun: run, state: this.options.snapshot() };
    } catch (error) {
      run.status = "Failed";
      run.failureReason = errorMessage(error);
      run.endedAt = new Date().toISOString();
      run.updatedAt = run.endedAt;
      session.status = "Error";
      session.error = run.failureReason;
      session.plan!.progress = progressFromSession(session);
      await this.touch(session);
      this.options.emitBrowser?.(session.id, action.id, run);
      throw error;
    }
  }

  browserStatus(session: AgentSession, rawRequest: unknown): AgentBrowserStatusResult {
    const request = validateBrowserStatusRequest(rawRequest);
    const runs = ensureBrowserRuns(session);
    return {
      sessionId: session.id,
      browserRuns: request.actionId ? runs.filter((run) => run.actionId === request.actionId) : runs,
      state: this.options.snapshot()
    };
  }

  async verify(session: AgentSession, rawRequest: unknown): Promise<AgentVerifyResult> {
    const request = validateVerifyRequest(rawRequest);
    if (request.sessionId !== session.id) throw new Error("Agent verification request session does not match.");
    if (!session.plan) throw new Error("Agent session has no execution plan.");
    const startedAt = new Date().toISOString();
    addRepairProgress(session, "Verification Started", { createdAt: startedAt });
    const operation = latestRollbackOperation(session);
    if (operation) operation.status = "verifying";
    const report = this.createVerificationReport(session, startedAt);
    const reports = ensureVerificationReports(session);
    reports.unshift(report);
    session.plan.verificationReports = reports.slice(0, MAX_VERIFICATION_REPORTS);
    addRepairProgress(session, "Verification Complete", { reportId: report.id, createdAt: report.completedAt });
    if (operation) {
      operation.verificationResult = report.status;
      operation.status = report.status === "Failed" ? "blocked" : "completed";
      operation.completedAt = report.completedAt;
      operation.conflict = report.status === "Failed" ? report.summary : undefined;
      if (session.plan.recovery?.activeOperationId === operation.operationId) session.plan.recovery.activeOperationId = undefined;
    }
    session.status = report.status === "Failed" ? "Error" : "Ready";
    session.error = report.status === "Failed" ? report.summary : undefined;
    await this.touch(session);
    this.options.emitVerification?.(session.id, report);
    return { sessionId: session.id, report, state: this.options.snapshot() };
  }

  async repairPlan(session: AgentSession, rawRequest: unknown): Promise<AgentRepairPlanResult> {
    const request = validateRepairPlanRequest(rawRequest);
    if (request.sessionId !== session.id) throw new Error("Agent repair plan request session does not match.");
    if (!session.plan) throw new Error("Agent session has no execution plan.");
    const report = request.reportId
      ? ensureVerificationReports(session).find((item) => item.id === request.reportId)
      : ensureVerificationReports(session)[0];
    if (!report) throw new Error("Agent verification report was not found.");
    if (report.status !== "Failed" && report.failures.length === 0) {
      throw new Error("Agent repair planning requires a failed verification report.");
    }
    const repairs = await this.createRepairPlan(session, report);
    const queue = ensureRepairQueue(session);
    const withoutReport = queue.filter((item) => item.reportId !== report.id);
    session.plan.repairQueue = [...repairs, ...withoutReport].slice(0, MAX_REPAIR_ITEMS);
    addRepairProgress(session, "Repair Planned", { reportId: report.id });
    session.status = "WaitingForApproval";
    await this.touch(session);
    this.options.emitRepairPlan?.(session.id, report.id, repairs);
    return { sessionId: session.id, reportId: report.id, repairs, state: this.options.snapshot() };
  }

  async repairExecute(session: AgentSession, rawRequest: unknown): Promise<AgentRepairExecutionResult> {
    const request = validateRepairExecuteRequest(rawRequest);
    if (request.sessionId !== session.id) throw new Error("Agent repair execute request session does not match.");
    if (!session.plan) throw new Error("Agent session has no execution plan.");
    const report = request.reportId
      ? ensureVerificationReports(session).find((item) => item.id === request.reportId)
      : ensureVerificationReports(session)[0];
    if (!report) throw new Error("Agent verification report was not found.");
    const attempt = clampRepairAttempt(request.attempt);
    if (attempt > MAX_REPAIR_ATTEMPTS) throw new Error("Agent repair retry limit reached.");
    const repairs = ensureRepairQueue(session)
      .filter((repair) => repair.reportId === report.id)
      .filter((repair) => !request.repairId || repair.id === request.repairId)
      .filter((repair) => repair.status !== "Rejected" && repair.status !== "Cancelled" && repair.status !== "Completed");
    if (!repairs.length) throw new Error("No executable repair actions are available.");

    const executedActions: AgentExecutionQueueItem[] = [];
    const blockedActions: AgentApprovalAction[] = [];
    addRepairProgress(session, "Repair Executing", { reportId: report.id, attempt });
    const activeOperation = latestRollbackOperation(session);
    if (activeOperation) {
      activeOperation.status = "repairing";
      activeOperation.repairAttempts = Math.max(activeOperation.repairAttempts, attempt);
    }
    session.status = "Executing";
    await this.touch(session);

    for (const repair of repairs) {
      const repairExecutedActions: AgentExecutionQueueItem[] = [];
      const repairBlockedActions: AgentApprovalAction[] = [];
      repair.attempt = attempt;
      repair.status = "Executing";
      repair.updatedAt = new Date().toISOString();
      for (const action of repair.actions ?? []) {
        const blocker = repairApprovalBlocker(action, repair, report, session);
        if (blocker) {
          repair.blockers = uniqueStrings([...(repair.blockers ?? []), blocker]);
          repair.requiresFreshApproval = true;
          blockedActions.push(action);
          repairBlockedActions.push(action);
          continue;
        }
        const planAction = attachRepairAction(session, action);
        let item = ensureQueueItem(session, planAction);
        let operation: AgentOperationLedgerEntry | undefined;
        try {
          item.status = "Executing";
          item.startedAt = new Date().toISOString();
          const preview = await this.createPreview(session.id, planAction);
          if (preview.destructive || preview.riskLevel === "high") {
            item.status = "Pending";
            const message = "Repair action requires fresh approval because its preview is high risk.";
            repair.blockers = uniqueStrings([...(repair.blockers ?? []), message]);
            repair.requiresFreshApproval = true;
            blockedActions.push(planAction);
            repairBlockedActions.push(planAction);
            continue;
          }
          operation = await this.beginFileOperation(session, planAction, preview);
          await this.touch(session);
          item = ensureQueueItem(session, planAction);
          const undo = await this.applyAction(planAction, preview);
          this.undoBySession.set(session.id, undo);
          session.plan.lastUndo = undoMetadata(undo);
          item.status = "Completed";
          item.completedAt = new Date().toISOString();
          item.error = undefined;
          await this.completeFileOperation(session, operation, "Completed", undo);
          executedActions.push(item);
          repairExecutedActions.push(item);
          this.options.emitExecution(session.id, planAction.id);
        } catch (error) {
          item.status = "Failed";
          item.error = errorMessage(error);
          item.completedAt = new Date().toISOString();
          if (operation) await this.completeFileOperation(session, operation, "Failed", undefined, item.error);
          repair.blockers = uniqueStrings([...(repair.blockers ?? []), item.error]);
          blockedActions.push(planAction);
          repairBlockedActions.push(planAction);
        }
      }
      repair.status = repairBlockedActions.length && repairExecutedActions.length === 0 ? "Blocked" : "Completed";
      repair.updatedAt = new Date().toISOString();
      addRepairProgress(session, "Repair Complete", { reportId: report.id, repairId: repair.id, attempt });
    }

    session.status = blockedActions.length && executedActions.length === 0 ? "Error" : "Ready";
    session.error = blockedActions.length && executedActions.length === 0 ? "Repair actions require fresh approval or failed validation." : undefined;
    session.plan.progress = progressFromSession(session);
    await this.touch(session);
    return { sessionId: session.id, reportId: report.id, attempt, executedActions, blockedActions, repairs, state: this.options.snapshot() };
  }

  repairStatus(session: AgentSession, rawRequest: unknown): AgentRepairStatusResult {
    const request = validateRepairStatusRequest(rawRequest);
    if (request.sessionId !== session.id) throw new Error("Agent repair status request session does not match.");
    const repairs = ensureRepairQueue(session);
    return {
      sessionId: session.id,
      repairs: request.repairId ? repairs.filter((item) => item.id === request.repairId) : repairs,
      reports: ensureVerificationReports(session),
      progress: ensureRepairProgress(session),
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

  handleTerminalData(terminalSessionId: string, data: string): void {
    for (const session of this.options.snapshot().sessions) {
      for (const terminalRun of session.plan?.terminalRuns ?? []) {
        if (terminalRun.terminalSessionId === terminalSessionId && terminalRun.status === "Running") {
          terminalRun.outputPreview = boundTerminalOutput(`${terminalRun.outputPreview}${data}`);
          if (isLikelyStderr(data)) {
            terminalRun.stderrPreview = boundTerminalOutput(`${terminalRun.stderrPreview}${data}`);
          }
          terminalRun.updatedAt = new Date().toISOString();
          void this.touch(session);
          this.options.emitTerminal?.(session.id, terminalRun.actionId, terminalRun);
        }
      }
    }
  }

  hydrateRecovery(session: AgentSession): void {
    const workspaceRoot = this.options.getWorkspaceRoot();
    const operations = session.plan?.recovery?.operations ?? [];
    if (!workspaceRoot || !session.plan || !operations.length) return;
    const latest = [...operations].reverse().find((operation) => (operation.status === "completed" || operation.status === "Completed") && operation.actionId && operation.actionType);
    const undo = latest ? undoRecordFromOperation(latest, workspaceRoot) : undefined;
    if (undo) {
      this.undoBySession.set(session.id, undo);
      session.plan.lastUndo = undoMetadata(undo);
    } else if (latest?.snapshots[0]) {
      session.plan.lastUndo = {
        actionId: latest.actionId ?? latest.operationId,
        relativePath: latest.snapshots[0].relativePath,
        destinationRelativePath: latest.snapshots[0].destinationRelativePath,
        actionType: latest.actionType ?? "modify-file",
        timestamp: latest.completedAt ?? latest.startedAt
      };
    }
    for (const operation of operations) {
      if (operation.status === "interrupted" || operation.status === "resume-conflict" || operation.status === "resumable") {
        operation.resumePointer = pointerForResume(session, operation);
        operation.resumeEligibility = syncResumeEligibility(session, operation);
      }
    }
  }

  markInterrupted(session: AgentSession): void {
    const recovery = session.plan?.recovery;
    if (recovery) {
      for (const operation of recovery.operations) {
        if (operation.status === "Executing" || operation.status === "running" || operation.status === "verifying" || operation.status === "repairing" || operation.status === "rolling-back") {
          operation.status = "interrupted";
          operation.completedAt = new Date().toISOString();
          operation.conflict = "Levi was interrupted during a build.";
          operation.resumePointer = pointerForResume(session, operation);
          operation.resumeEligibility = syncResumeEligibility(session, operation);
          recovery.interruptedOperationIds = uniqueStrings([...recovery.interruptedOperationIds, operation.operationId]).slice(-100);
          if (recovery.activeOperationId === operation.operationId) recovery.activeOperationId = undefined;
        }
      }
    }
    for (const taskRun of session.plan?.taskRuns ?? []) {
      if (taskRun.status === "Running") {
        taskRun.status = "Interrupted";
        taskRun.endedAt = new Date().toISOString();
        taskRun.failureReason = "Task was interrupted before Levi shut down.";
        taskRun.updatedAt = taskRun.endedAt;
      }
    }
    for (const terminalRun of session.plan?.terminalRuns ?? []) {
      if (terminalRun.status === "Running") {
        this.terminalProcesses.get(terminalRun.actionId)?.kill();
        this.terminalProcesses.delete(terminalRun.actionId);
        terminalRun.status = "Interrupted";
        terminalRun.resultStatus = "cancelled";
        terminalRun.endedAt = new Date().toISOString();
        terminalRun.failureReason = "Terminal command was interrupted before Levi shut down.";
        terminalRun.updatedAt = terminalRun.endedAt;
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
    for (const browserRun of session.plan?.browserRuns ?? []) {
      if (browserRun.status === "Executing") {
        browserRun.status = "Cancelled";
        browserRun.endedAt = new Date().toISOString();
        browserRun.failureReason = "Browser action was interrupted before Levi shut down.";
        browserRun.updatedAt = browserRun.endedAt;
      }
    }
  }

  dispose(): void {
    for (const child of this.terminalProcesses.values()) {
      child.kill();
    }
    this.terminalProcesses.clear();
  }

  private createVerificationReport(session: AgentSession, startedAt: string): AgentVerificationReport {
    const plan = session.plan;
    if (!plan) throw new Error("Agent session has no execution plan.");
    const taskRuns = ensureTaskRuns(session);
    const terminalRuns = ensureTerminalRuns(session);
    const gitRuns = ensureGitRuns(session);
    const queue = ensureQueue(session);
    const problems = taskRuns.flatMap((run) => run.problems ?? []).slice(0, MAX_TASK_PROBLEMS);
    const taskOutputExcerpt = boundTerminalOutput(taskRuns.flatMap((run) => run.outputPreview ?? []).map((entry) => entry.text).join(""));
    const terminalOutputExcerpt = boundTerminalOutput(terminalRuns.filter((run) => run.resultStatus !== "infrastructure-error").map((run) => run.outputPreview).join("\n"));
    const gitChangedFiles = uniqueStrings([
      ...(this.options.getChangedFiles?.() ?? []),
      ...gitRuns.flatMap((run) => run.affectedFiles ?? [])
    ]).slice(0, MAX_GIT_STATUS_LINES);
    const exitCodes = [
      ...taskRuns.map((run) => ({ source: "task" as const, actionId: run.actionId, exitCode: run.exitCode })),
      ...terminalRuns.map((run) => ({ source: "terminal" as const, actionId: run.actionId, exitCode: run.exitCode }))
    ];
    const failures: AgentVerificationFailure[] = [];
    const warnings: string[] = [];
    for (const taskRun of taskRuns) {
      const output = (taskRun.outputPreview ?? []).map((entry) => entry.text).join("");
      if (taskRun.status === "Failed" || (typeof taskRun.exitCode === "number" && taskRun.exitCode !== 0)) {
        failures.push(createVerificationFailure({
          source: "task",
          severity: "error",
          message: taskRun.failureReason ?? `${taskRun.taskName} failed${taskRun.exitCode === undefined ? "" : ` with exit code ${taskRun.exitCode}`}.`,
          text: `${taskRun.taskName}\n${taskRun.failureReason ?? ""}\n${output}`,
          affectedFiles: taskRun.problems.map((problem) => problem.relativePath),
          actionId: taskRun.actionId,
          exitCode: taskRun.exitCode
        }));
      } else if (taskRun.status === "Cancelled" || taskRun.status === "Interrupted") {
        warnings.push(`${taskRun.taskName} was ${taskRun.status.toLowerCase()}.`);
      }
    }
    for (const terminalRun of terminalRuns) {
      if (terminalRun.status === "Failed" || (typeof terminalRun.exitCode === "number" && terminalRun.exitCode !== 0)) {
        const affectedFiles = inferAffectedFilesFromTerminalOutput(`${terminalRun.stderrPreview}\n${terminalRun.outputPreview}`);
        const infrastructureError = terminalRun.resultStatus === "infrastructure-error";
        const details = terminalFailureDetails(terminalRun, session, affectedFiles);
        failures.push(createVerificationFailure({
          source: "terminal",
          severity: "error",
          message: infrastructureError
            ? terminalRun.failureReason ?? "Terminal execution failed."
            : terminalRun.failureReason ?? `${terminalRun.executable} failed${terminalRun.exitCode === undefined ? "" : ` with exit code ${terminalRun.exitCode}`}.`,
          text: infrastructureError
            ? `Terminal execution failed while launching ${terminalRun.executable}.`
            : JSON.stringify(details),
          affectedFiles,
          details,
          actionId: terminalRun.actionId,
          exitCode: terminalRun.exitCode
        }));
      } else if (terminalRun.status === "Cancelled" || terminalRun.status === "Interrupted") {
        warnings.push(`${terminalRun.executable} was ${terminalRun.status.toLowerCase()}.`);
      }
      warnings.push(...(terminalRun.verification?.warnings ?? []));
    }
    for (const problem of problems) {
      const severity = problem.severity === "error" ? "error" : "warning";
      const failure = createVerificationFailure({
        source: "problems",
        severity,
        message: problem.message,
        text: `${problem.source} ${problem.message}`,
        affectedFiles: [problem.relativePath]
      });
      if (severity === "error") failures.push(failure);
      else warnings.push(problem.message);
    }
    for (const item of queue.filter((candidate) => candidate.status === "Failed")) {
      failures.push(createVerificationFailure({
        source: "execution",
        severity: "error",
        message: item.error ?? `${item.title} failed.`,
        text: `${item.type} ${item.error ?? ""}`,
        affectedFiles: [item.relativePath, item.destinationRelativePath].filter(Boolean) as string[],
        actionId: item.actionId
      }));
    }
    for (const gitRun of gitRuns) {
      if (gitRun.status === "Failed") {
        failures.push(createVerificationFailure({
          source: "git",
          severity: "error",
          message: gitRun.failureReason ?? `${gitRun.operation} failed.`,
          text: `${gitRun.operation}\n${gitRun.stderr ?? ""}\n${gitRun.stdout ?? ""}`,
          affectedFiles: gitRun.affectedFiles,
          actionId: gitRun.actionId
        }));
      }
    }
    const checks = createVerificationChecks(taskRuns, failures);
    const hasWarnings = warnings.length > 0 || failures.some((failure) => failure.severity === "warning");
    const status = failures.some((failure) => failure.severity === "error") ? "Failed" : hasWarnings ? "Warnings" : "Succeeded";
    const summary = status === "Succeeded"
      ? "Verification succeeded. No failed build, test, lint, typecheck, terminal, Git, or problem results were found."
      : status === "Warnings"
        ? `Verification completed with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}.`
        : `Verification failed with ${failures.filter((failure) => failure.severity === "error").length} issue${failures.filter((failure) => failure.severity === "error").length === 1 ? "" : "s"}.`;
    return {
      id: randomUUID(),
      sessionId: session.id,
      status,
      summary,
      checks,
      problems,
      terminalOutputExcerpt,
      taskOutputExcerpt,
      gitChangedFiles,
      exitCodes,
      failures: failures.slice(0, MAX_REPAIR_ITEMS),
      warnings: uniqueStrings(warnings).slice(0, MAX_REPAIR_ITEMS),
      startedAt,
      completedAt: new Date().toISOString()
    };
  }

  private async createRepairPlan(session: AgentSession, report: AgentVerificationReport): Promise<AgentRepairQueueItem[]> {
    const fallback = await this.createFallbackRepairPlan(session, report);
    if (fallback.some((repair) => repair.actions.length > 0)) return fallback;
    if (hasOnlyInfrastructureFailures(report)) return fallback;
    if (!this.options.runtimeManager || !session.modelId) return fallback;
    try {
      const response: AIRuntimeInvocationResponse = await this.options.runtimeManager.chat({
        providerId: session.runtimeId,
        model: session.modelId,
        timeoutMs: 300_000,
        messages: [
          {
            role: "system",
            content: "Create structured repair actions for Levi. Return JSON only: {\"repairs\":[{\"problem\":\"...\",\"likelyCause\":\"...\",\"affectedFiles\":[\"src/file.ts\"],\"suggestedFix\":\"...\",\"confidence\":0.75,\"estimatedRisk\":\"low\",\"classification\":\"Type errors\",\"actions\":[{\"type\":\"modify-file\",\"title\":\"Fix type error\",\"description\":\"...\",\"relativePath\":\"src/file.ts\",\"edits\":[{\"kind\":\"replace\",\"find\":\"old\",\"replace\":\"new\"}]}]}]}. Actions must be concrete and limited to create-file, modify-file, or create-folder unless fresh user approval is needed. Do not use Markdown or shell commands for code repairs."
          },
          {
            role: "user",
            content: JSON.stringify({
              summary: report.summary,
              failures: report.failures,
              warnings: report.warnings,
              problems: report.problems,
              gitChangedFiles: report.gitChangedFiles,
              taskOutputExcerpt: report.taskOutputExcerpt,
              terminalOutputExcerpt: report.terminalOutputExcerpt
            })
          }
        ],
        options: { format: "json" }
      });
      const repairs = parseRepairPlan(response.content, report);
      return repairs.length ? repairs : fallback;
    } catch {
      return fallback;
    }
  }

  private async createFallbackRepairPlan(session: AgentSession, report: AgentVerificationReport): Promise<AgentRepairQueueItem[]> {
    const fallback = fallbackRepairs(report);
    if (fallback.some((repair) => repair.actions.length > 0)) return fallback;
    const workspaceRoot = this.options.getWorkspaceRoot();
    if (!workspaceRoot) return fallback;
    try {
      const rootRealPath = await fs.realpath(workspaceRoot);
      const snippets: string[] = [];
      for (const relativePath of uniqueStrings(report.failures.flatMap((failure) => failure.affectedFiles)).slice(0, 5)) {
        const normalized = normalizeSlashes(relativePath);
        if (!normalized || normalized.split("/").includes("..") || path.isAbsolute(normalized)) continue;
        const absolutePath = path.resolve(rootRealPath, normalized);
        if (!isInsideRoot(rootRealPath, absolutePath)) continue;
        const content = await fs.readFile(absolutePath, "utf8").catch(() => "");
        if (content) snippets.push(`${normalized}\n${content.slice(0, MAX_REPAIR_TEXT)}`);
      }
      if (!snippets.length) return fallback;
      const enrichedReport = {
        ...report,
        terminalOutputExcerpt: boundTerminalOutput(`${report.terminalOutputExcerpt}\n${snippets.join("\n")}`)
      };
      const enrichedFallback = fallbackRepairs(enrichedReport);
      return enrichedFallback.some((repair) => repair.actions.length > 0) ? enrichedFallback : fallback;
    } catch {
      return fallback;
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
      return { kind: "create-file", actionId: action.id, relativePath: target.relativePath, absolutePath: target.absolutePath, appliedHash: hashContent(written), timestamp: new Date().toISOString() };
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
      const previousContent = action.type === "rename-file" ? await readTextFile(target.absolutePath, target.rootRealPath) : undefined;
      const previousHash = previousContent === undefined ? undefined : hashContent(previousContent);
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
        previousContent,
        previousHash,
        appliedHash: previousHash,
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

  private async beginFileOperation(session: AgentSession, action: AgentApprovalAction, preview: AgentActionPreview): Promise<AgentOperationLedgerEntry> {
    const recovery = ensureRecovery(session);
    const snapshot = snapshotFromPreview(preview);
    const existing = recovery.activeOperationId
      ? recovery.operations.find((item) => item.operationId === recovery.activeOperationId && item.planId === session.plan?.id && item.status !== "rolled-back")
      : undefined;
    if (existing) {
      existing.status = "running";
      existing.actionId = existing.actionId ?? action.id;
      existing.actionType = existing.actionType ?? action.type;
      existing.approvedScope = uniqueStrings([...existing.approvedScope, preview.targetPath, preview.destinationPath ?? "", ...(action.affectedFiles ?? [])]).filter(Boolean);
      existing.actionsAttempted = uniqueStrings([...existing.actionsAttempted, action.id]);
      appendSnapshot(existing, snapshot);
      appendOperationFileLists(existing, action, preview);
      return existing;
    }
    const gitBefore = await this.safeGitStatus();
    const now = new Date().toISOString();
    const workspaceRoot = this.options.getWorkspaceRoot() ?? undefined;
    const operation: AgentOperationLedgerEntry = {
      operationId: randomUUID(),
      sessionId: session.id,
      planId: session.plan?.id,
      workspaceRoot,
      actionId: action.id,
      actionType: action.type,
      title: session.plan?.objective ?? action.title,
      status: "running",
      userRequest: session.plan?.objective ?? "",
      approvedScope: uniqueStrings([preview.targetPath, preview.destinationPath ?? "", ...(action.affectedFiles ?? [])]).filter(Boolean),
      actionsAttempted: [action.id],
      actionsCompleted: [],
      actionsFailed: [],
      filesCreated: action.type === "create-file" || action.type === "create-folder" ? [preview.targetPath] : [],
      filesModified: action.type === "modify-file" ? [preview.targetPath] : [],
      filesDeleted: action.type === "delete-file" ? [preview.targetPath] : [],
      filesRenamed: preview.destinationPath && (action.type === "rename-file" || action.type === "rename-folder") ? [{ from: preview.targetPath, to: preview.destinationPath }] : [],
      commandsExecuted: [],
      repairAttempts: session.plan?.repairQueue?.filter((repair) => repair.status === "Executing" || repair.status === "Completed").length ?? 0,
      gitHeadBefore: gitBefore?.headCommit,
      gitBranchBefore: gitBefore?.currentBranch,
      gitDirtyBefore: gitBefore ? gitBefore.entries.length > 0 : undefined,
      filesBefore: [snapshot],
      filesAfter: [],
      snapshots: [snapshot],
      startedAt: now
    };
    recovery.operations = [...recovery.operations, operation].slice(-100);
    recovery.activeOperationId = operation.operationId;
    return operation;
  }

  private async completeFileOperation(
    session: AgentSession,
    operation: AgentOperationLedgerEntry,
    status: AgentOperationLedgerEntry["status"],
    undo?: UndoRecord,
    error?: string
  ): Promise<void> {
    const recovery = ensureRecovery(session);
    const current = recovery.operations.find((item) => item.operationId === operation.operationId);
    if (!current) return;
    const gitAfter = await this.safeGitStatus();
    const completedAt = new Date().toISOString();
    current.status = status === "Failed" ? "blocked" : hasPendingFileActions(session, current) ? "running" : "completed";
    current.completedAt = current.status === "completed" || current.status === "blocked" ? completedAt : undefined;
    current.gitHeadAfter = gitAfter?.headCommit;
    current.gitBranchAfter = gitAfter?.currentBranch;
    current.gitDirtyAfter = gitAfter ? gitAfter.entries.length > 0 : undefined;
    if (status === "Completed" && undo) {
      current.actionsCompleted = uniqueStrings([...current.actionsCompleted, undo.actionId]);
      current.filesAfter = current.snapshots;
    }
    if (status === "Failed") {
      current.actionsFailed = uniqueStrings([...current.actionsFailed, operation.actionId ?? ""]);
      current.conflict = error;
    }
    if (undo) {
      current.snapshots = current.snapshots.map((snapshot) => snapshot.relativePath === undo.relativePath ? snapshotWithUndo(snapshot, undo) : snapshot);
      current.filesBefore = current.snapshots;
      current.filesAfter = current.snapshots;
    }
    if (current.status === "completed" || current.status === "blocked") {
      recovery.activeOperationId = undefined;
    }
  }

  private async evaluateResumeEligibility(session: AgentSession, operation: AgentOperationLedgerEntry): Promise<AgentResumeEligibility> {
    const pointer = pointerForResume(session, operation);
    const safeActionIds: string[] = [];
    const blockedActionIds: string[] = [];
    let reason: string | undefined;
    for (const actionId of pointer.remainingActionIds) {
      const action = session.plan?.approvals.find((item) => item.id === actionId);
      if (!action) {
        blockedActionIds.push(actionId);
        reason = "Remaining action requires missing snapshot state.";
        break;
      }
      const result = await this.evaluateResumeAction(session, operation, action);
      if (result.safe) {
        safeActionIds.push(actionId);
      } else {
        blockedActionIds.push(actionId);
        reason = result.reason;
        break;
      }
    }
    return {
      available: pointer.remainingActionIds.length > 0 && blockedActionIds.length === 0,
      reason: blockedActionIds.length ? reason : pointer.remainingActionIds.length ? undefined : "No remaining actions to resume.",
      safeActionIds,
      blockedActionIds,
      completed: operation.actionsCompleted.length,
      remaining: pointer.remainingActionIds.length,
      evaluatedAt: new Date().toISOString()
    };
  }

  private async evaluateResumeAction(
    session: AgentSession,
    operation: AgentOperationLedgerEntry,
    action: AgentApprovalAction
  ): Promise<{ safe: true; preview?: AgentActionPreview; terminalPreview?: AgentTerminalPreview } | { safe: false; reason: string }> {
    if (action.status !== "Approved") return { safe: false, reason: "Remaining action requires approval." };
    if (action.type === "delete-file" || action.type === "git-operation" || action.type.startsWith("browser-")) {
      return { safe: false, reason: "Remaining action requires fresh approval." };
    }
    if (SAFE_RESUME_FILE_ACTIONS.has(action.type)) {
      try {
        const preview = await this.createPreview(session.id, action);
        const snapshot = snapshotForAction(operation, action.id, preview.targetPath, preview.destinationPath);
        const staleReason = snapshot ? await this.validateSnapshotPrecondition(snapshot, preview) : undefined;
        if (staleReason) return { safe: false, reason: staleReason };
        return { safe: true, preview };
      } catch (error) {
        return { safe: false, reason: resumeReasonFromError(error) };
      }
    }
    if (action.type === "run-terminal-command") {
      try {
        const preview = await this.createTerminalPreview(session.id, action);
        if (!isSafeResumeTerminalPreview(preview)) return { safe: false, reason: "Remaining command requires approval." };
        const prior = latestTerminalRun(session, action.id);
        if (prior && prior.status !== "Interrupted" && prior.status !== "Cancelled" && prior.status !== "Failed") {
          return { safe: false, reason: "Command already ran or is still running." };
        }
        return { safe: true, terminalPreview: preview };
      } catch (error) {
        return { safe: false, reason: resumeReasonFromError(error) };
      }
    }
    return { safe: false, reason: "Remaining action requires fresh approval." };
  }

  private async validateSnapshotPrecondition(snapshot: AgentRecoveredFileSnapshot, preview: AgentActionPreview): Promise<string | undefined> {
    if (preview.actionType === "modify-file" && snapshot.beforeHash && hashContent(preview.originalContent ?? "") !== snapshot.beforeHash) {
      return "File changed since interruption.";
    }
    if (preview.actionType === "create-file" && snapshot.afterHash) {
      const target = await this.resolvePath(preview.targetPath);
      try {
        const current = await readTextFile(target.absolutePath, target.rootRealPath);
        if (hashContent(current) === snapshot.afterHash) return undefined;
        return "File changed since interruption.";
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        return resumeReasonFromError(error);
      }
    }
    if ((preview.actionType === "rename-file" || preview.actionType === "rename-folder") && snapshot.destinationRelativePath !== preview.destinationPath) {
      return "Rename target changed since interruption.";
    }
    return undefined;
  }

  private async persistResumeConflict(session: AgentSession, operation: AgentOperationLedgerEntry, reason: string): Promise<void> {
    operation.status = "resume-conflict";
    operation.conflict = reason;
    operation.resumeEligibility = {
      available: false,
      reason,
      safeActionIds: [],
      blockedActionIds: operation.resumePointer?.currentActionId ? [operation.resumePointer.currentActionId] : [],
      completed: operation.actionsCompleted.length,
      remaining: operation.resumePointer?.remainingActionIds.length ?? 0,
      evaluatedAt: new Date().toISOString()
    };
    if (session.plan?.recovery?.activeOperationId === operation.operationId) session.plan.recovery.activeOperationId = undefined;
    session.status = "Error";
    session.error = reason;
    await this.touch(session);
  }

  private async waitForTerminalResume(session: AgentSession, actionId: string): Promise<AgentTerminalRunState> {
    const started = Date.now();
    while (Date.now() - started < 30_000) {
      const run = latestTerminalRun(session, actionId);
      if (run && run.status !== "Running") return run;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("Resumed command did not finish within the bounded verification window.");
  }

  private async safeGitStatus(): Promise<GitRepositoryStatus | undefined> {
    try {
      return await this.options.gitService?.status();
    } catch {
      return undefined;
    }
  }

  private async rollbackOperation(
    session: AgentSession,
    operation: AgentOperationLedgerEntry,
    workspaceRoot: string,
    choices: Record<string, AgentRollbackChoice> | undefined
  ): Promise<string[]> {
    const recovery = ensureRecovery(session);
    const current = recovery.operations.find((item) => item.operationId === operation.operationId);
    if (!current) throw new Error("Agent operation was not found.");
    current.status = "rolling-back";
    current.rollbackConflicts = [];
    current.conflict = undefined;
    await this.options.persistAndEmit();
    const plan = await buildRollbackPlan(current, workspaceRoot, choices);
    if (plan.conflicts.length) {
      current.status = "rollback-conflict";
      current.rollbackConflicts = plan.conflicts;
      current.conflict = "This file changed after Levi's operation.";
      throw new Error("This file changed after Levi's operation.");
    }
    try {
      for (const apply of plan.apply) await apply();
      const gitAfter = await this.safeGitStatus();
      current.status = "rolled-back";
      current.completedAt = new Date().toISOString();
      current.gitHeadAfter = gitAfter?.headCommit;
      current.gitBranchAfter = gitAfter?.currentBranch;
      current.gitDirtyAfter = gitAfter ? gitAfter.entries.length > 0 : undefined;
      current.rollbackConflicts = [];
      current.conflict = undefined;
      if (recovery.activeOperationId === current.operationId) recovery.activeOperationId = undefined;
      return plan.restoredPaths;
    } catch (error) {
      current.status = "rollback-failed";
      current.conflict = errorMessage(error);
      throw error;
    }
  }

  private async undoRecord(undo: UndoRecord): Promise<void> {
    if (undo.kind === "create-file") {
      try {
        const current = await readTextFile(undo.absolutePath, path.dirname(undo.absolutePath));
        if (undo.appliedHash && hashContent(current) !== undo.appliedHash) {
          throw new Error("This file changed after Levi's operation.");
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      await fs.unlink(undo.absolutePath);
      return;
    }
    if (undo.kind === "modify-file") {
      const current = await readTextFile(undo.absolutePath, path.dirname(undo.absolutePath));
      if (undo.appliedHash && hashContent(current) !== undo.appliedHash) {
        throw new Error("This file changed after Levi's operation.");
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
      if (undo.kind === "rename-file" && undo.appliedHash) {
        const current = await readTextFile(undo.destinationAbsolutePath, path.dirname(undo.destinationAbsolutePath));
        if (hashContent(current) !== undo.appliedHash) {
          throw new Error("This file changed after Levi's operation.");
        }
      }
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

  private async createTerminalPreview(sessionId: string, action: AgentApprovalAction): Promise<AgentTerminalPreview> {
    const command = validateTerminalCommand(action);
    const cwd = await this.resolveTerminalCwd(command.cwd);
    return {
      previewId: randomUUID(),
      sessionId,
      actionId: action.id,
      executable: command.executable,
      args: command.args,
      cwd,
      purpose: action.description || action.title,
      riskLevel: terminalRisk(command.executable, command.args),
      expectedOutput: action.expectedOutput,
      estimatedDurationMs: action.estimatedDurationMs,
      commandId: command.commandId,
      createdAt: new Date().toISOString()
    };
  }

  private async resolveTerminalCwd(relativeCwd: string): Promise<string> {
    const workspaceRoot = this.options.getWorkspaceRoot();
    if (!workspaceRoot) throw new Error("No workspace is open.");
    const rootRealPath = await fs.realpath(workspaceRoot);
    const target = path.resolve(rootRealPath, relativeCwd);
    if (!isInsideRoot(rootRealPath, target)) throw new Error("Agent terminal working directory escapes the selected project.");
    const realPath = await fs.realpath(target);
    if (!isInsideRoot(rootRealPath, realPath)) throw new Error("Agent terminal working directory resolves outside the selected project.");
    const stat = await fs.stat(realPath);
    if (!stat.isDirectory()) throw new Error("Agent terminal working directory must be an existing folder.");
    return realPath;
  }

  private requireTerminalPreview(previewId: string, sessionId: string, actionId: string): AgentTerminalPreview {
    const preview = this.terminalPreviews.get(previewId);
    if (!preview || preview.sessionId !== sessionId || preview.actionId !== actionId) {
      throw new Error("Agent terminal preview was not found.");
    }
    return preview;
  }

  private startDirectTerminalProcess(session: AgentSession, terminalRun: AgentTerminalRunState, preview: AgentTerminalPreview): void {
    let completed = false;
    try {
      const launch = resolveDirectProcessLaunch(preview);
      const child = spawn(launch.executable, launch.args, {
        cwd: preview.cwd,
        env: { ...process.env },
        shell: false,
        windowsHide: true
      });
      this.terminalProcesses.set(terminalRun.actionId, child);
      child.stdout.on("data", (chunk) => {
        this.recordDirectTerminalData(session, terminalRun, String(chunk), "stdout");
      });
      child.stderr.on("data", (chunk) => {
        this.recordDirectTerminalData(session, terminalRun, String(chunk), "stderr");
      });
      child.on("error", (error) => {
        if (completed) return;
        completed = true;
        this.terminalProcesses.delete(terminalRun.actionId);
        void this.recordTerminalInfrastructureFailure(session, terminalRun, error);
      });
      child.on("close", (exitCode, signal) => {
        if (completed) return;
        completed = true;
        this.terminalProcesses.delete(terminalRun.actionId);
        const code = typeof exitCode === "number" ? exitCode : signal ? 1 : 0;
        void this.recordTerminalCompletion(session, terminalRun, code);
      });
    } catch (error) {
      void this.recordTerminalInfrastructureFailure(session, terminalRun, error);
    }
  }

  private recordDirectTerminalData(session: AgentSession, terminalRun: AgentTerminalRunState, data: string, stream: "stdout" | "stderr"): void {
    if (terminalRun.status !== "Running") return;
    terminalRun.outputPreview = boundTerminalOutput(`${terminalRun.outputPreview}${data}`);
    if (stream === "stderr") {
      terminalRun.stderrPreview = boundTerminalOutput(`${terminalRun.stderrPreview}${data}`);
    }
    terminalRun.updatedAt = new Date().toISOString();
    void this.touch(session);
    this.options.emitTerminal?.(session.id, terminalRun.actionId, terminalRun);
  }

  private async recordTerminalCompletion(session: AgentSession, terminalRun: AgentTerminalRunState, exitCode: number, forcedStatus?: AgentTerminalRunState["status"]): Promise<void> {
    if (terminalRun.status !== "Running" && forcedStatus !== "Cancelled") return;
    this.terminalProcesses.delete(terminalRun.actionId);
    terminalRun.exitCode = exitCode;
    terminalRun.endedAt = new Date().toISOString();
    terminalRun.durationMs = terminalRun.startedAt ? Math.max(0, Date.parse(terminalRun.endedAt) - Date.parse(terminalRun.startedAt)) : undefined;
    terminalRun.status = forcedStatus ?? (exitCode === 0 ? "Succeeded" : "Failed");
    terminalRun.resultStatus = terminalRun.status === "Cancelled" ? "cancelled" : exitCode === 0 ? "completed" : "failed";
    if (terminalRun.status === "Failed") {
      const infrastructureMessage = terminalExitInfrastructureMessage(terminalRun);
      if (infrastructureMessage) {
        terminalRun.resultStatus = "infrastructure-error";
        terminalRun.failureReason = infrastructureMessage;
        session.status = "Error";
        session.error = infrastructureMessage;
      } else {
        terminalRun.failureReason = `Terminal command failed with exit code ${exitCode}.`;
        session.status = "Ready";
        session.error = undefined;
      }
    } else {
      session.status = "Ready";
      terminalRun.failureReason = terminalRun.status === "Cancelled" ? "Terminal command was cancelled." : undefined;
    }
    terminalRun.verification = await this.createTerminalVerification(session, terminalRun);
    terminalRun.updatedAt = terminalRun.endedAt;
    session.plan!.progress = progressFromSession(session);
    await this.touch(session);
    this.options.emitTerminal?.(session.id, terminalRun.actionId, terminalRun);
  }

  private async recordTerminalInfrastructureFailure(session: AgentSession, terminalRun: AgentTerminalRunState, error: unknown): Promise<void> {
    if (terminalRun.status !== "Running") return;
    this.terminalProcesses.delete(terminalRun.actionId);
    const message = `Terminal execution failed: ${errorMessage(error)}`;
    terminalRun.status = "Failed";
    terminalRun.resultStatus = "infrastructure-error";
    terminalRun.exitCode = undefined;
    terminalRun.endedAt = new Date().toISOString();
    terminalRun.durationMs = terminalRun.startedAt ? Math.max(0, Date.parse(terminalRun.endedAt) - Date.parse(terminalRun.startedAt)) : undefined;
    terminalRun.failureReason = message;
    terminalRun.verification = await this.createTerminalVerification(session, terminalRun);
    terminalRun.updatedAt = terminalRun.endedAt;
    session.status = "Error";
    session.error = message;
    session.plan!.progress = progressFromSession(session);
    await this.touch(session);
    this.options.emitTerminal?.(session.id, terminalRun.actionId, terminalRun);
  }

  private async createTerminalVerification(session: AgentSession, terminalRun: AgentTerminalRunState): Promise<AgentTerminalVerificationSummary> {
    const outputExcerpt = terminalRun.outputPreview.slice(-MAX_TERMINAL_OUTPUT_CHARS);
    const warnings = linesMatching(outputExcerpt, /\b(warn|warning|deprecated)\b/i);
    const errors = linesMatching(`${terminalRun.stderrPreview}\n${outputExcerpt}`, /\b(error|failed|exception)\b/i);
    const fallback = `${terminalRun.executable} ${terminalRun.status.toLowerCase()}${terminalRun.exitCode === undefined ? "" : ` with exit code ${terminalRun.exitCode}`}.`;
    let summary = fallback;
    if (this.options.runtimeManager && session.modelId && terminalRun.resultStatus !== "infrastructure-error") {
      try {
        const response: AIRuntimeInvocationResponse = await this.options.runtimeManager.chat({
          providerId: session.runtimeId,
          model: session.modelId,
          messages: [
            {
              role: "system",
              content: "Summarize approved Levi terminal command results. Do not propose edits, run commands, request retries, or trigger follow-up actions."
            },
            {
              role: "user",
              content: JSON.stringify({
                executable: terminalRun.executable,
                args: terminalRun.args,
                cwd: terminalRun.cwd,
                status: terminalRun.status,
                exitCode: terminalRun.exitCode,
                durationMs: terminalRun.durationMs,
                outputExcerpt,
                warnings,
                errors
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
      actionId: terminalRun.actionId,
      commandId: terminalRun.commandId,
      summary,
      exitCode: terminalRun.exitCode,
      durationMs: terminalRun.durationMs,
      outputExcerpt,
      warnings,
      errors,
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
  const record = value as Record<string, unknown>;
  return { sessionId: validateId(record.sessionId, "sessionId"), choices: validateRollbackChoices(record.choices) };
}

function validateRestoreOperationRequest(value: unknown): AgentRestoreOperationRequest {
  if (!value || typeof value !== "object") throw new Error("Agent restore request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    operationId: validateId(record.operationId, "operationId"),
    choices: validateRollbackChoices(record.choices)
  };
}

function validateResumeOperationRequest(value: unknown): AgentResumeOperationRequest {
  if (!value || typeof value !== "object") throw new Error("Agent resume request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    operationId: validateId(record.operationId, "operationId")
  };
}

function validateRollbackChoices(value: unknown): Record<string, AgentRollbackChoice> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Agent rollback choices are invalid.");
  const choices: Record<string, AgentRollbackChoice> = {};
  for (const [rawPath, rawChoice] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
    const relativePath = validateRelativePath(rawPath);
    if (rawChoice !== "keep-current" && rawChoice !== "restore-snapshot") throw new Error("Agent rollback choice is invalid.");
    choices[relativePath] = rawChoice;
  }
  return choices;
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

function validateTerminalPreviewRequest(value: unknown): AgentTerminalPreviewRequest {
  if (!value || typeof value !== "object") throw new Error("Agent terminal preview request is invalid.");
  const record = value as Record<string, unknown>;
  return { sessionId: validateId(record.sessionId, "sessionId"), actionId: validateId(record.actionId, "actionId") };
}

function validateTerminalExecuteRequest(value: unknown): AgentTerminalExecuteRequest {
  if (!value || typeof value !== "object") throw new Error("Agent terminal execute request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    actionId: validateId(record.actionId, "actionId"),
    previewId: record.previewId === undefined ? undefined : validateId(record.previewId, "previewId")
  };
}

function validateTerminalCancelRequest(value: unknown): AgentTerminalCancelRequest {
  if (!value || typeof value !== "object") throw new Error("Agent terminal cancel request is invalid.");
  const record = value as Record<string, unknown>;
  return { sessionId: validateId(record.sessionId, "sessionId"), actionId: validateId(record.actionId, "actionId") };
}

function validateTerminalStatusRequest(value: unknown): AgentTerminalStatusRequest {
  if (!value || typeof value !== "object") throw new Error("Agent terminal status request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    actionId: record.actionId === undefined ? undefined : validateId(record.actionId, "actionId")
  };
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

function validateBrowserPreviewRequest(value: unknown): AgentBrowserPreviewRequest {
  if (!value || typeof value !== "object") throw new Error("Agent browser preview request is invalid.");
  const record = value as Record<string, unknown>;
  return { sessionId: validateId(record.sessionId, "sessionId"), actionId: validateId(record.actionId, "actionId") };
}

function validateBrowserExecuteRequest(value: unknown): AgentBrowserExecuteRequest {
  if (!value || typeof value !== "object") throw new Error("Agent browser execute request is invalid.");
  const record = value as Record<string, unknown>;
  return { sessionId: validateId(record.sessionId, "sessionId"), actionId: validateId(record.actionId, "actionId") };
}

function validateBrowserStatusRequest(value: unknown): AgentBrowserStatusRequest {
  if (!value || typeof value !== "object") throw new Error("Agent browser status request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    actionId: record.actionId === undefined ? undefined : validateId(record.actionId, "actionId")
  };
}

function validateVerifyRequest(value: unknown): AgentVerifyRequest {
  if (!value || typeof value !== "object") throw new Error("Agent verify request is invalid.");
  return { sessionId: validateId((value as Record<string, unknown>).sessionId, "sessionId") };
}

function validateRepairPlanRequest(value: unknown): AgentRepairPlanRequest {
  if (!value || typeof value !== "object") throw new Error("Agent repair plan request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    reportId: record.reportId === undefined ? undefined : validateId(record.reportId, "reportId")
  };
}

function validateRepairStatusRequest(value: unknown): AgentRepairStatusRequest {
  if (!value || typeof value !== "object") throw new Error("Agent repair status request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    repairId: record.repairId === undefined ? undefined : validateId(record.repairId, "repairId")
  };
}

function validateRepairExecuteRequest(value: unknown): AgentRepairExecuteRequest {
  if (!value || typeof value !== "object") throw new Error("Agent repair execute request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    reportId: record.reportId === undefined ? undefined : validateId(record.reportId, "reportId"),
    repairId: record.repairId === undefined ? undefined : validateId(record.repairId, "repairId"),
    attempt: Number.isInteger(record.attempt) ? record.attempt as number : undefined
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

function requireApprovedTerminalAction(action: AgentApprovalAction): void {
  if (action.status !== "Approved") {
    throw new Error("Agent terminal command must be approved before execution.");
  }
  if (action.type !== "run-terminal-command") {
    throw new Error("Only approved terminal command actions can use the terminal executor.");
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

function requireApprovedBrowserAction(action: AgentApprovalAction): void {
  if (action.status !== "Approved") {
    throw new Error("Agent browser action must be approved before execution.");
  }
  if (!action.type.startsWith("browser-")) {
    throw new Error("Only approved browser actions can use the browser executor.");
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

function ensureRecovery(session: AgentSession): NonNullable<NonNullable<AgentSession["plan"]>["recovery"]> {
  if (!session.plan) throw new Error("Agent session has no execution plan.");
  session.plan.recovery = session.plan.recovery ?? { schemaVersion: 1, operations: [], interruptedOperationIds: [] };
  session.plan.recovery.operations = session.plan.recovery.operations.slice(-100);
  session.plan.recovery.interruptedOperationIds = session.plan.recovery.interruptedOperationIds.slice(-100);
  return session.plan.recovery;
}

function appendSnapshot(operation: AgentOperationLedgerEntry, snapshot: AgentRecoveredFileSnapshot): void {
  const key = snapshot.destinationRelativePath ? `${snapshot.relativePath}->${snapshot.destinationRelativePath}` : snapshot.relativePath;
  const existingIndex = operation.snapshots.findIndex((item) => (item.destinationRelativePath ? `${item.relativePath}->${item.destinationRelativePath}` : item.relativePath) === key);
  if (existingIndex >= 0) {
    operation.snapshots[existingIndex] = {
      ...snapshot,
      beforeContent: operation.snapshots[existingIndex].beforeContent,
      beforeHash: operation.snapshots[existingIndex].beforeHash,
      kind: operation.snapshots[existingIndex].kind
    };
  } else {
    operation.snapshots.push(snapshot);
  }
  operation.filesBefore = operation.snapshots;
}

function appendOperationFileLists(operation: AgentOperationLedgerEntry, action: AgentApprovalAction, preview: AgentActionPreview): void {
  if (action.type === "create-file" || action.type === "create-folder") operation.filesCreated = uniqueStrings([...operation.filesCreated, preview.targetPath]);
  if (action.type === "modify-file") operation.filesModified = uniqueStrings([...operation.filesModified, preview.targetPath]);
  if (action.type === "delete-file") operation.filesDeleted = uniqueStrings([...operation.filesDeleted, preview.targetPath]);
  if (preview.destinationPath && (action.type === "rename-file" || action.type === "rename-folder")) {
    operation.filesRenamed = [...operation.filesRenamed.filter((item) => item.from !== preview.targetPath), { from: preview.targetPath, to: preview.destinationPath }];
  }
}

function hasPendingFileActions(session: AgentSession, operation: AgentOperationLedgerEntry): boolean {
  const queue = session.plan?.executionQueue ?? [];
  return queue.some((item) =>
    SUPPORTED_ACTIONS.has(item.type)
    && item.status !== "Completed"
    && item.status !== "Rejected"
    && item.status !== "Cancelled"
    && !operation.actionsFailed.includes(item.actionId)
  );
}

function pointerForResume(session: AgentSession, operation: AgentOperationLedgerEntry) {
  const queue = session.plan?.executionQueue ?? [];
  const actionIds = (session.plan?.approvals ?? [])
    .filter((action) => action.status !== "Rejected" && action.status !== "Cancelled")
    .filter((action) => {
      const item = queue.find((candidate) => candidate.actionId === action.id);
      return item?.status !== "Rejected" && item?.status !== "Cancelled";
    })
    .map((action) => action.id);
  const attempted = new Set(operation.actionsAttempted);
  const completed = new Set(operation.actionsCompleted);
  const failed = new Set(operation.actionsFailed);
  const operationStarted = new Set([...operation.actionsAttempted, ...operation.actionsCompleted, ...operation.actionsFailed]);
  const startIndex = actionIds.findIndex((actionId) => operationStarted.has(actionId));
  const remainingActionIds = actionIds
    .slice(startIndex >= 0 ? startIndex : 0)
    .filter((actionId) => !completed.has(actionId) && !failed.has(actionId))
    .filter((actionId) => attempted.has(actionId) || operationStarted.size > 0);
  return {
    lastCompletedActionId: operation.actionsCompleted[operation.actionsCompleted.length - 1],
    currentActionId: remainingActionIds[0],
    remainingActionIds
  };
}

function syncResumeEligibility(session: AgentSession, operation: AgentOperationLedgerEntry): AgentResumeEligibility {
  const pointer = pointerForResume(session, operation);
  const safeActionIds: string[] = [];
  const blockedActionIds: string[] = [];
  let reason: string | undefined;
  for (const actionId of pointer.remainingActionIds) {
    const action = session.plan?.approvals.find((item) => item.id === actionId);
    if (!action) {
      blockedActionIds.push(actionId);
      reason = "Remaining action requires missing snapshot state.";
      break;
    }
    const safe = action.status === "Approved" && (
      SAFE_RESUME_FILE_ACTIONS.has(action.type)
      || (action.type === "run-terminal-command" && isLikelySafeResumeTerminalAction(action))
    );
    if (safe) {
      safeActionIds.push(actionId);
    } else {
      blockedActionIds.push(actionId);
      reason = action.status !== "Approved" ? "Remaining action requires approval." : "Remaining action requires fresh approval.";
      break;
    }
  }
  return {
    available: pointer.remainingActionIds.length > 0 && blockedActionIds.length === 0,
    reason: blockedActionIds.length ? reason : pointer.remainingActionIds.length ? undefined : "No remaining actions to resume.",
    safeActionIds,
    blockedActionIds,
    completed: operation.actionsCompleted.length,
    remaining: pointer.remainingActionIds.length,
    evaluatedAt: new Date().toISOString()
  };
}

function isLikelySafeResumeTerminalAction(action: AgentApprovalAction): boolean {
  try {
    const command = validateTerminalCommand(action);
    const text = `${command.executable} ${command.args.join(" ")}`.toLowerCase();
    return SAFE_TERMINAL_EXECUTABLES.has(path.basename(command.executable).toLowerCase())
      && SAFE_RESUME_COMMAND_WORDS.test(text)
      && !UNSAFE_RESUME_COMMAND_WORDS.test(text);
  } catch {
    return false;
  }
}

function snapshotForAction(operation: AgentOperationLedgerEntry, actionId: string, relativePath: string, destinationPath?: string): AgentRecoveredFileSnapshot | undefined {
  return operation.snapshots.find((snapshot) =>
    snapshot.relativePath === relativePath
    || snapshot.destinationRelativePath === relativePath
    || (destinationPath !== undefined && snapshot.destinationRelativePath === destinationPath)
    || operation.actionId === actionId
  );
}

function latestTerminalRun(session: AgentSession, actionId: string): AgentTerminalRunState | undefined {
  return [...(session.plan?.terminalRuns ?? [])].reverse().find((run) => run.actionId === actionId);
}

function isSafeResumeTerminalPreview(preview: AgentTerminalPreview): boolean {
  const command = `${preview.executable} ${preview.args.join(" ")}`.toLowerCase();
  if (UNSAFE_RESUME_COMMAND_WORDS.test(command)) return false;
  if (!SAFE_RESUME_COMMAND_WORDS.test(command)) return false;
  return SAFE_TERMINAL_EXECUTABLES.has(path.basename(preview.executable).toLowerCase());
}

function appendCommandLedger(commands: AgentCommandLedgerEntry[], preview: AgentTerminalPreview, status: AgentCommandLedgerEntry["status"]): AgentCommandLedgerEntry[] {
  const next = commands.filter((command) => command.actionId !== preview.actionId || command.commandId !== preview.commandId);
  next.push({
    actionId: preview.actionId,
    commandId: preview.commandId,
    executable: preview.executable,
    args: [...preview.args],
    cwd: preview.cwd,
    status
  });
  return next.slice(-40);
}

function commandLedgerStatus(run: AgentTerminalRunState): AgentCommandLedgerEntry["status"] {
  if (run.status === "Succeeded") return "succeeded";
  if (run.status === "Cancelled") return "cancelled";
  if (run.status === "Interrupted") return "interrupted";
  return "failed";
}

function resumeReasonFromError(error: unknown): string {
  const message = errorMessage(error);
  if (/changed/i.test(message)) return "File changed since interruption.";
  if (/approval/i.test(message)) return "Remaining action requires approval.";
  if (/workspace|outside|escapes/i.test(message)) return "Workspace no longer matches.";
  if (/exists|already/i.test(message)) return message;
  return message || "Resume Where Safe is unavailable.";
}

function snapshotFromPreview(preview: AgentActionPreview): AgentRecoveredFileSnapshot {
  if (preview.actionType === "create-file") {
    return {
      relativePath: preview.targetPath,
      kind: "missing",
      afterContent: preview.proposedContent ?? "",
      afterHash: hashContent(preview.proposedContent ?? "")
    };
  }
  if (preview.actionType === "modify-file") {
    return {
      relativePath: preview.targetPath,
      kind: "file",
      beforeContent: preview.originalContent ?? "",
      beforeHash: hashContent(preview.originalContent ?? ""),
      afterContent: preview.proposedContent ?? "",
      afterHash: hashContent(preview.proposedContent ?? "")
    };
  }
  if (preview.actionType === "delete-file") {
    return {
      relativePath: preview.targetPath,
      kind: "file",
      beforeContent: preview.originalContent ?? "",
      beforeHash: hashContent(preview.originalContent ?? "")
    };
  }
  return {
    relativePath: preview.targetPath,
    destinationRelativePath: preview.destinationPath,
    kind: preview.actionType === "rename-folder" || preview.actionType === "create-folder" ? "folder" : "file"
  };
}

function snapshotWithUndo(snapshot: AgentRecoveredFileSnapshot, undo: UndoRecord): AgentRecoveredFileSnapshot {
  if (undo.kind === "create-file") return { ...snapshot, afterHash: undo.appliedHash };
  if (undo.kind === "modify-file") return { ...snapshot, beforeContent: undo.previousContent, beforeHash: undo.previousHash, afterHash: undo.appliedHash };
  if (undo.kind === "delete-file") return { ...snapshot, beforeContent: undo.previousContent, beforeHash: undo.previousHash };
  if (undo.kind === "rename-file") return { ...snapshot, beforeContent: undo.previousContent, beforeHash: undo.previousHash, afterHash: undo.appliedHash };
  return snapshot;
}

async function buildRollbackPlan(
  operation: AgentOperationLedgerEntry,
  workspaceRoot: string,
  choices: Record<string, AgentRollbackChoice> | undefined
): Promise<OperationRollbackPlan> {
  const rootRealPath = await fs.realpath(workspaceRoot);
  const apply: Array<() => Promise<void>> = [];
  const restoredPaths: string[] = [];
  const conflicts: AgentRollbackConflict[] = [];
  const snapshots = coalesceRollbackSnapshots(operation.snapshots);
  for (const snapshot of [...snapshots].reverse()) {
    const relativePath = snapshot.relativePath;
    const currentRelativePath = snapshot.destinationRelativePath ?? snapshot.relativePath;
    const absolutePath = path.resolve(rootRealPath, relativePath);
    const currentAbsolutePath = path.resolve(rootRealPath, currentRelativePath);
    const choice = choices?.[relativePath] ?? choices?.[currentRelativePath];
    const conflict = await rollbackConflict(snapshot, rootRealPath, currentRelativePath, currentAbsolutePath, choice);
    if (conflict) {
      conflicts.push(conflict);
      continue;
    }
    if (choice === "keep-current") {
      continue;
    }
    restoredPaths.push(relativePath);
    apply.push(async () => {
      if (snapshot.destinationRelativePath) {
        await assertPathMissing(absolutePath, "Cannot undo rename because the original path now exists.");
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.rename(currentAbsolutePath, absolutePath);
        return;
      }
      if (snapshot.kind === "missing") {
        await fs.rm(currentAbsolutePath, { recursive: true, force: false });
        return;
      }
      if (snapshot.beforeContent !== undefined) {
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await writeAtomically(absolutePath, snapshot.beforeContent);
      }
    });
  }
  return { restoredPaths: uniqueStrings(restoredPaths), conflicts, apply };
}

function coalesceRollbackSnapshots(snapshots: AgentRecoveredFileSnapshot[]): AgentRecoveredFileSnapshot[] {
  const byPath = new Map<string, AgentRecoveredFileSnapshot>();
  for (const snapshot of snapshots) {
    const key = snapshot.destinationRelativePath ? `${snapshot.relativePath}->${snapshot.destinationRelativePath}` : snapshot.relativePath;
    const existing = byPath.get(key);
    byPath.set(key, existing ? {
      ...snapshot,
      beforeContent: existing.beforeContent,
      beforeHash: existing.beforeHash,
      kind: existing.kind,
      afterContent: snapshot.afterContent ?? existing.afterContent,
      afterHash: snapshot.afterHash ?? existing.afterHash
    } : snapshot);
  }
  return [...byPath.values()];
}

async function rollbackConflict(
  snapshot: AgentRecoveredFileSnapshot,
  rootRealPath: string,
  currentRelativePath: string,
  currentAbsolutePath: string,
  choice: AgentRollbackChoice | undefined
): Promise<AgentRollbackConflict | undefined> {
  if (choice === "keep-current" || choice === "restore-snapshot") return undefined;
  const current = await readTextIfExists(currentAbsolutePath, rootRealPath);
  if (snapshot.destinationRelativePath) {
    if (!current.exists) return { relativePath: currentRelativePath, message: "This file changed after Levi's operation.", snapshotContent: snapshot.beforeContent };
    if (snapshot.afterHash && current.hash !== snapshot.afterHash) {
      return { relativePath: currentRelativePath, message: "This file changed after Levi's operation.", currentContent: current.content, snapshotContent: snapshot.beforeContent };
    }
    return undefined;
  }
  if (snapshot.kind === "missing") {
    if (!current.exists) return undefined;
    if (snapshot.afterHash && current.hash !== snapshot.afterHash) {
      return { relativePath: currentRelativePath, message: "This file changed after Levi's operation.", currentContent: current.content };
    }
    return undefined;
  }
  if (snapshot.afterHash) {
    if (!current.exists || current.hash !== snapshot.afterHash) {
      return { relativePath: currentRelativePath, message: "This file changed after Levi's operation.", currentContent: current.content, snapshotContent: snapshot.beforeContent };
    }
    return undefined;
  }
  if (!current.exists) return undefined;
  return { relativePath: currentRelativePath, message: "This file changed after Levi's operation.", currentContent: current.content, snapshotContent: snapshot.beforeContent };
}

async function readTextIfExists(absolutePath: string, rootRealPath: string): Promise<{ exists: boolean; content?: string; hash?: string }> {
  try {
    const content = await readTextFile(absolutePath, rootRealPath);
    return { exists: true, content, hash: hashContent(content) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false };
    throw error;
  }
}

function latestRollbackOperation(session: AgentSession): AgentOperationLedgerEntry | undefined {
  const operations = session.plan?.recovery?.operations ?? [];
  return [...operations].reverse().find((operation) =>
    operation.snapshots.length > 0
    && operation.status !== "rolled-back"
    && operation.status !== "rollback-failed"
    && operation.status !== "cancelled"
    && operation.status !== "Cancelled"
    && operation.status !== "Undone"
  );
}

function undoRecordFromOperation(operation: AgentOperationLedgerEntry, workspaceRoot: string): UndoRecord | undefined {
  const snapshot = operation.snapshots[0];
  if (!snapshot || !operation.actionId || !operation.actionType) return undefined;
  const absolutePath = path.resolve(workspaceRoot, snapshot.relativePath);
  const timestamp = operation.completedAt ?? operation.startedAt;
  if (operation.actionType === "create-file") {
    return { kind: "create-file", actionId: operation.actionId, relativePath: snapshot.relativePath, absolutePath, appliedHash: snapshot.afterHash, timestamp };
  }
  if (operation.actionType === "modify-file" && snapshot.beforeContent !== undefined && snapshot.beforeHash) {
    return { kind: "modify-file", actionId: operation.actionId, relativePath: snapshot.relativePath, absolutePath, previousContent: snapshot.beforeContent, previousHash: snapshot.beforeHash, appliedHash: snapshot.afterHash, timestamp };
  }
  if (operation.actionType === "delete-file" && snapshot.beforeContent !== undefined && snapshot.beforeHash) {
    return { kind: "delete-file", actionId: operation.actionId, relativePath: snapshot.relativePath, absolutePath, previousContent: snapshot.beforeContent, previousHash: snapshot.beforeHash, timestamp };
  }
  if ((operation.actionType === "rename-file" || operation.actionType === "rename-folder") && snapshot.destinationRelativePath) {
    return {
      kind: operation.actionType,
      actionId: operation.actionId,
      relativePath: snapshot.relativePath,
      destinationRelativePath: snapshot.destinationRelativePath,
      absolutePath,
      destinationAbsolutePath: path.resolve(workspaceRoot, snapshot.destinationRelativePath),
      previousContent: snapshot.beforeContent,
      previousHash: snapshot.beforeHash,
      appliedHash: snapshot.afterHash,
      timestamp
    };
  }
  if (operation.actionType === "create-folder") {
    return { kind: "create-folder", actionId: operation.actionId, relativePath: snapshot.relativePath, absolutePath, timestamp };
  }
  return undefined;
}

function markRecoveryOperation(session: AgentSession, actionId: string, status: AgentOperationLedgerEntry["status"], conflict?: string): void {
  const operations = session.plan?.recovery?.operations ?? [];
  const operation = [...operations].reverse().find((item) => item.actionId === actionId);
  if (!operation) return;
  applyRecoveryOperationStatus(operation, status, conflict);
}

function markRecoveryOperationById(session: AgentSession, operationId: string, status: AgentOperationLedgerEntry["status"], conflict?: string): void {
  const operation = session.plan?.recovery?.operations.find((item) => item.operationId === operationId);
  if (!operation) return;
  applyRecoveryOperationStatus(operation, status, conflict);
}

function applyRecoveryOperationStatus(operation: AgentOperationLedgerEntry, status: AgentOperationLedgerEntry["status"], conflict?: string): void {
  operation.status = status;
  operation.completedAt = new Date().toISOString();
  operation.conflict = conflict;
}

function ensureTaskRuns(session: AgentSession): AgentTaskRunState[] {
  if (!session.plan) throw new Error("Agent session has no execution plan.");
  session.plan.taskRuns = Array.isArray(session.plan.taskRuns) ? session.plan.taskRuns : [];
  return session.plan.taskRuns;
}

function ensureTerminalRuns(session: AgentSession): AgentTerminalRunState[] {
  if (!session.plan) throw new Error("Agent session has no execution plan.");
  session.plan.terminalRuns = Array.isArray(session.plan.terminalRuns) ? session.plan.terminalRuns : [];
  return session.plan.terminalRuns;
}

function ensureTerminalRun(session: AgentSession, action: AgentApprovalAction, preview: AgentTerminalPreview): AgentTerminalRunState {
  const runs = ensureTerminalRuns(session);
  let run = runs.find((item) => item.actionId === action.id);
  if (!run) {
    run = {
      actionId: action.id,
      commandId: preview.commandId,
      executable: preview.executable,
      args: preview.args,
      cwd: preview.cwd,
      status: "Pending",
      outputPreview: "",
      stderrPreview: "",
      updatedAt: new Date().toISOString()
    };
    runs.push(run);
  }
  run.commandId = preview.commandId;
  run.executable = preview.executable;
  run.args = preview.args;
  run.cwd = preview.cwd;
  return run;
}

function requireTerminalRun(session: AgentSession, actionId: string): AgentTerminalRunState {
  const run = ensureTerminalRuns(session).find((item) => item.actionId === actionId);
  if (!run) throw new Error("Agent terminal command run state was not found.");
  return run;
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

function ensureBrowserRuns(session: AgentSession): AgentBrowserRunState[] {
  if (!session.plan) throw new Error("Agent session has no execution plan.");
  session.plan.browserRuns = Array.isArray(session.plan.browserRuns) ? session.plan.browserRuns : [];
  return session.plan.browserRuns;
}

function ensureBrowserRun(session: AgentSession, action: AgentApprovalAction, preview: BrowserActionPreview): AgentBrowserRunState {
  const runs = ensureBrowserRuns(session);
  let run = runs.find((item) => item.actionId === action.id);
  if (!run) {
    run = {
      actionId: action.id,
      actionType: action.type,
      status: "Pending",
      preview,
      updatedAt: new Date().toISOString()
    };
    runs.push(run);
  }
  run.actionType = action.type;
  run.preview = preview;
  return run;
}

function ensureVerificationReports(session: AgentSession): AgentVerificationReport[] {
  if (!session.plan) throw new Error("Agent session has no execution plan.");
  session.plan.verificationReports = Array.isArray(session.plan.verificationReports) ? session.plan.verificationReports : [];
  return session.plan.verificationReports;
}

function ensureRepairQueue(session: AgentSession): AgentRepairQueueItem[] {
  if (!session.plan) throw new Error("Agent session has no execution plan.");
  session.plan.repairQueue = Array.isArray(session.plan.repairQueue) ? session.plan.repairQueue : [];
  return session.plan.repairQueue;
}

function ensureRepairProgress(session: AgentSession): NonNullable<AgentSession["plan"]>["repairProgress"] {
  if (!session.plan) throw new Error("Agent session has no execution plan.");
  session.plan.repairProgress = Array.isArray(session.plan.repairProgress) ? session.plan.repairProgress : [];
  return session.plan.repairProgress;
}

function addRepairProgress(
  session: AgentSession,
  stage: NonNullable<AgentSession["plan"]>["repairProgress"][number]["stage"],
  options: { reportId?: string; repairId?: string; attempt?: number; createdAt?: string } = {}
): void {
  ensureRepairProgress(session).push({
    id: randomUUID(),
    stage,
    reportId: options.reportId,
    repairId: options.repairId,
    attempt: options.attempt,
    createdAt: options.createdAt ?? new Date().toISOString()
  });
  session.plan!.repairProgress = session.plan!.repairProgress.slice(-80);
}

function clampRepairAttempt(value: unknown): number {
  if (!Number.isInteger(value)) return 1;
  return Math.max(1, Math.min(MAX_REPAIR_ATTEMPTS + 1, value as number));
}

function attachRepairAction(session: AgentSession, action: AgentApprovalAction): AgentApprovalAction {
  const existing = session.plan!.approvals.find((item) => item.id === action.id);
  if (existing) {
    existing.status = "Approved";
    existing.updatedAt = new Date().toISOString();
    return existing;
  }
  const now = new Date().toISOString();
  const planAction: AgentApprovalAction = {
    ...action,
    id: action.id || randomUUID(),
    status: "Approved",
    createdAt: action.createdAt || now,
    updatedAt: now
  };
  session.plan!.approvals.push(planAction);
  return planAction;
}

function repairApprovalBlocker(
  action: AgentApprovalAction,
  repair: AgentRepairQueueItem,
  report: AgentVerificationReport,
  session: AgentSession
): string | null {
  if (!AUTOMATIC_REPAIR_ACTIONS.has(action.type)) {
    return "Repair action requires fresh approval because it is not an automatic file repair.";
  }
  const targets = [action.relativePath, action.destinationRelativePath, ...(action.affectedFiles ?? [])].filter((value): value is string => Boolean(value));
  if (targets.length === 0 && action.type !== "create-folder") {
    return "Repair action has no concrete workspace target.";
  }
  if (targets.some((target) => path.isAbsolute(target) || target.includes("\0") || normalizeSlashes(target).split("/").includes(".."))) {
    return "Repair action targets an unsafe path.";
  }
  if (action.type === "delete-file" || action.type === "git-operation" || action.type.startsWith("browser-")) {
    return "Repair action requires fresh approval because it is destructive or external.";
  }
  if (!isRepairRelatedToBuild(targets, repair, report, session)) {
    return "Repair action is materially outside the approved build scope.";
  }
  return null;
}

function isRepairRelatedToBuild(
  targets: string[],
  repair: AgentRepairQueueItem,
  report: AgentVerificationReport,
  session: AgentSession
): boolean {
  const evidence = uniqueStrings([
    ...repair.affectedFiles,
    ...report.failures.flatMap((failure) => failure.affectedFiles),
    ...report.problems.map((problem) => problem.relativePath),
    ...session.plan!.estimatedFiles,
    ...(session.plan!.approvals
      .flatMap((action) => [action.relativePath, action.destinationRelativePath, ...(action.affectedFiles ?? [])])
      .filter((value): value is string => Boolean(value)))
  ]).map((value) => normalizeSlashes(value));
  if (evidence.length === 0) return false;
  return targets.every((target) => {
    const normalized = normalizeSlashes(target);
    return evidence.some((item) => normalized === item || normalized.startsWith(`${path.posix.dirname(item)}/`) || item.startsWith(`${path.posix.dirname(normalized)}/`));
  });
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
      (plan.terminalRuns ?? []).filter((item) => item.status === "Succeeded").length +
      (plan.gitRuns ?? []).filter((item) => item.status === "Succeeded").length +
      (plan.browserRuns ?? []).filter((item) => item.status === "Succeeded").length
  };
}

function createVerificationChecks(taskRuns: AgentTaskRunState[], failures: AgentVerificationFailure[]): AgentVerificationCheck[] {
  const kinds: AgentVerificationCheck["kind"][] = ["build", "test", "lint", "typecheck"];
  return kinds.map((kind) => {
    const matching = taskRuns.filter((run) => inferVerificationKind(run.taskName) === kind);
    if (!matching.length) {
      return { kind, status: "not-run", summary: `${kind} was not run through an approved TaskService action.` };
    }
    const failed = matching.find((run) => run.status === "Failed" || (typeof run.exitCode === "number" && run.exitCode !== 0));
    const warning = failures.some((failure) => failure.severity === "warning" && matching.some((run) => run.actionId === failure.actionId));
    const latest = matching[matching.length - 1];
    return {
      kind,
      status: failed ? "failed" : warning ? "warnings" : "succeeded",
      actionId: latest.actionId,
      taskRunId: latest.runId,
      exitCode: latest.exitCode,
      durationMs: latest.durationMs,
      summary: failed ? `${kind} failed.` : warning ? `${kind} completed with warnings.` : `${kind} succeeded.`
    };
  });
}

function inferVerificationKind(value: string): AgentVerificationCheck["kind"] | undefined {
  const text = value.toLowerCase();
  if (/\b(typecheck|type-check|tsc)\b/.test(text)) return "typecheck";
  if (/\blint\b/.test(text)) return "lint";
  if (/\btest|spec|vitest|jest\b/.test(text)) return "test";
  if (/\bbuild|compile\b/.test(text)) return "build";
  return undefined;
}

function createVerificationFailure(options: {
  source: AgentVerificationFailure["source"];
  severity: AgentVerificationFailure["severity"];
  message: string;
  text: string;
  affectedFiles: string[];
  details?: Record<string, unknown>;
  actionId?: string;
  exitCode?: number;
}): AgentVerificationFailure {
  return {
    id: randomUUID(),
    classification: classifyFailure(options.text),
    source: options.source,
    message: truncateText(options.message, 600),
    affectedFiles: uniqueStrings(options.affectedFiles.filter(Boolean)).slice(0, 20),
    details: options.details,
    actionId: options.actionId,
    exitCode: options.exitCode,
    severity: options.severity
  };
}

function classifyFailure(value: string): AgentFailureClassification {
  const text = value.toLowerCase();
  if (/\b(module not found|cannot find module|missing dependency|enoent|package not found)\b/.test(text)) return "Missing dependency";
  if (/\b(cannot find name|cannot find namespace|not assignable|property .* does not exist|ts\d{4}|type error|typescript)\b/.test(text)) return "Type errors";
  if (/\b(missing import|cannot find symbol|is not defined|no-undef)\b/.test(text)) return "Missing import";
  if (/\b(syntaxerror|unexpected token|unterminated|parse error|parsererror)\b/.test(text)) return "Syntax";
  if (/\b(eslint|lint|prettier|stylelint)\b/.test(text)) return "Lint";
  if (/\b(compilation|compile|build failed|failed to compile)\b/.test(text)) return "Compilation";
  if (/\b(runtime|exception|crash|timeout|econnrefused|unhandled)\b/.test(text)) return "Runtime";
  return "Unknown";
}

function fallbackRepairs(report: AgentVerificationReport): AgentRepairQueueItem[] {
  const now = new Date().toISOString();
  const failures = report.failures.filter((failure) => failure.severity === "error").slice(0, 5);
  return failures.map((failure) => {
    const actions = deterministicFallbackRepairActions(failure, report, now);
    return {
      id: randomUUID(),
      reportId: report.id,
      attempt: 1,
      problem: failure.message,
      likelyCause: likelyCauseFor(failure.classification),
      affectedFiles: failure.affectedFiles,
      suggestedFix: actions.length ? "Apply the structured syntax repair inferred from verification output." : suggestedFixFor(failure.classification),
      actions,
      requiresFreshApproval: actions.length === 0,
      blockers: actions.length ? [] : ["No structured repair action was generated."],
      confidence: actions.length ? 0.72 : failure.classification === "Unknown" ? 0.35 : 0.6,
      estimatedRisk: failure.affectedFiles.length > 1 ? "medium" : "low",
      classification: failure.classification,
      status: "Pending" as const,
      createdAt: now,
      updatedAt: now
    };
  });
}

function deterministicFallbackRepairActions(failure: AgentVerificationFailure, report: AgentVerificationReport, now: string): AgentApprovalAction[] {
  const target = failure.affectedFiles.find((file) => file && !path.isAbsolute(file) && !normalizeSlashes(file).split("/").includes(".."));
  if (!target) return [];
  const text = `${failure.message}\n${report.terminalOutputExcerpt}`.replace(/\r\n/g, "\n");
  if (/org\.jetbrains\.kotlin\.android/i.test(text) && /no longer required for Kotlin support since AGP 9\.0/i.test(text)) {
    return [
      {
        id: randomUUID(),
        type: "modify-file",
        title: "Remove obsolete Kotlin Android plugin",
        description: "Remove the Kotlin Android plugin line rejected by AGP 9.0 and keep Kotlin support provided by the Android Gradle plugin.",
        status: "Pending",
        relativePath: normalizeSlashes(target),
        edits: [{ kind: "replace", find: "  id(\"org.jetbrains.kotlin.android\")\n", replace: "" }],
        affectedFiles: [normalizeSlashes(target)],
        createdAt: now,
        updatedAt: now
      }
    ];
  }
  const assignment = text.match(/\b(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*;/);
  if (!assignment) return [];
  const original = assignment[0];
  const replacement = `${assignment[1]} ${assignment[2]} = 0;`;
  return [
    {
      id: randomUUID(),
      type: "modify-file",
      title: "Repair invalid assignment",
      description: "Replace the missing assignment value reported by verification.",
      status: "Pending",
      relativePath: normalizeSlashes(target),
      edits: [{ kind: "replace", find: original, replace: replacement }],
      affectedFiles: [normalizeSlashes(target)],
      createdAt: now,
      updatedAt: now
    }
  ];
}

function parseRepairPlan(content: string, report: AgentVerificationReport): AgentRepairQueueItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  const values = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { repairs?: unknown }).repairs) ? (parsed as { repairs: unknown[] }).repairs : [];
  const now = new Date().toISOString();
  return values.slice(0, MAX_REPAIR_ITEMS).map((value) => {
    const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const classification = parseFailureClassification(record.classification);
    const actions = parseRepairActions(record.actions, now);
    return {
      id: randomUUID(),
      reportId: report.id,
      attempt: 1,
      problem: sanitizeRepairText(record.problem, "Verification failure needs repair planning."),
      likelyCause: sanitizeRepairText(record.likelyCause, likelyCauseFor(classification)),
      affectedFiles: parseAffectedFiles(record.affectedFiles),
      suggestedFix: sanitizeRepairText(record.suggestedFix, suggestedFixFor(classification)),
      actions,
      requiresFreshApproval: actions.some((action) => !AUTOMATIC_REPAIR_ACTIONS.has(action.type)),
      blockers: actions.length ? [] : ["No structured repair action was generated."],
      confidence: clampConfidence(record.confidence),
      estimatedRisk: parseRisk(record.estimatedRisk),
      classification,
      status: "Pending" as const,
      createdAt: now,
      updatedAt: now
    };
  }).filter((item) => item.problem && item.suggestedFix);
}

function parseRepairActions(value: unknown, now: string): AgentApprovalAction[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => parseRepairAction(item, now)).filter(Boolean).slice(0, 8) as AgentApprovalAction[];
}

function parseRepairAction(value: unknown, now: string): AgentApprovalAction | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "";
  if (
    type !== "create-file" &&
    type !== "modify-file" &&
    type !== "create-folder" &&
    type !== "delete-file" &&
    type !== "run-terminal-command" &&
    type !== "run-task" &&
    type !== "git-operation"
  ) return null;
  return {
    id: randomUUID(),
    type,
    title: typeof record.title === "string" && record.title.trim() ? record.title.trim().slice(0, 120) : "Repair action",
    description: typeof record.description === "string" ? record.description.trim().slice(0, 1_000) : "",
    status: "Pending",
    relativePath: parseRepairRelativePath(record.relativePath),
    destinationRelativePath: parseRepairRelativePath(record.destinationRelativePath),
    content: typeof record.content === "string" ? record.content.slice(0, MAX_CONTENT_CHARS) : undefined,
    edits: Array.isArray(record.edits) ? record.edits.map(parseRepairFileEdit).filter(Boolean).slice(0, 40) as AgentFileEdit[] : undefined,
    taskId: typeof record.taskId === "string" ? record.taskId.slice(0, 120) : undefined,
    taskName: typeof record.taskName === "string" ? record.taskName.slice(0, 120) : undefined,
    command: typeof record.command === "string" ? record.command.slice(0, 500) : undefined,
    args: Array.isArray(record.args) ? record.args.filter((item): item is string => typeof item === "string").map((item) => item.slice(0, 500)).slice(0, 80) : undefined,
    cwd: parseRepairRelativePath(record.cwd),
    gitOperation: typeof record.gitOperation === "string" ? record.gitOperation.slice(0, 120) : undefined,
    affectedFiles: Array.isArray(record.affectedFiles) ? parseAffectedFiles(record.affectedFiles) : undefined,
    createdAt: now,
    updatedAt: now
  };
}

function parseRepairRelativePath(value: unknown): string | undefined {
  if (typeof value !== "string" || path.isAbsolute(value) || value.includes("\0")) return undefined;
  const normalized = normalizeSlashes(value).replace(/^\.\//, "");
  if (!normalized || normalized.split("/").includes("..")) return undefined;
  return normalized.slice(0, 500);
}

function parseRepairFileEdit(value: unknown): AgentFileEdit | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (kind !== "insert" && kind !== "replace" && kind !== "append" && kind !== "delete-range" && kind !== "whole-file") return null;
  return {
    kind,
    content: typeof record.content === "string" ? record.content.slice(0, MAX_CONTENT_CHARS) : undefined,
    line: Number.isInteger(record.line) ? record.line as number : undefined,
    startLine: Number.isInteger(record.startLine) ? record.startLine as number : undefined,
    endLine: Number.isInteger(record.endLine) ? record.endLine as number : undefined,
    find: typeof record.find === "string" ? record.find.slice(0, MAX_CONTENT_CHARS) : undefined,
    replace: typeof record.replace === "string" ? record.replace.slice(0, MAX_CONTENT_CHARS) : undefined
  };
}

function parseFailureClassification(value: unknown): AgentFailureClassification {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (normalized === "compilation") return "Compilation";
  if (normalized === "type errors" || normalized === "type error") return "Type errors";
  if (normalized === "lint") return "Lint";
  if (normalized === "runtime") return "Runtime";
  if (normalized === "missing dependency") return "Missing dependency";
  if (normalized === "missing import") return "Missing import";
  if (normalized === "syntax") return "Syntax";
  return "Unknown";
}

function parseRisk(value: unknown): AgentRiskLevel {
  return value === "low" || value === "medium" || value === "high" ? value : "medium";
}

function parseAffectedFiles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 500 && !path.isAbsolute(item) && !item.includes("\0")).map((item) => normalizeSlashes(item).replace(/^\.\//, "")).filter((item) => !item.split("/").includes(".."))).slice(0, 20);
}

function sanitizeRepairText(value: unknown, fallback: string): string {
  return truncateText(typeof value === "string" ? value.replace(/\0/g, "").trim() : fallback, MAX_REPAIR_TEXT);
}

function clampConfidence(value: unknown): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0.5;
  return Math.max(0, Math.min(1, numeric));
}

function likelyCauseFor(classification: AgentFailureClassification): string {
  switch (classification) {
    case "Missing dependency":
      return "A required package or module is not installed or cannot be resolved.";
    case "Missing import":
      return "A referenced symbol is not imported or is outside the visible module scope.";
    case "Type errors":
      return "The current implementation does not satisfy the project's TypeScript contracts.";
    case "Syntax":
      return "The changed source likely contains malformed syntax.";
    case "Lint":
      return "The change violates configured lint or formatting rules.";
    case "Compilation":
      return "The build pipeline failed while compiling the project.";
    case "Runtime":
      return "The executed code failed at runtime or timed out.";
    default:
      return "The verification output did not match a known failure pattern.";
  }
}

function suggestedFixFor(classification: AgentFailureClassification): string {
  switch (classification) {
    case "Missing dependency":
      return "Review imports and package manifests, then propose an approved dependency or import correction.";
    case "Missing import":
      return "Inspect the affected file and propose an approved import or symbol reference fix.";
    case "Type errors":
      return "Inspect the reported type mismatch and propose an approved code change that preserves the intended API.";
    case "Syntax":
      return "Inspect the reported file region and propose an approved syntax correction.";
    case "Lint":
      return "Inspect the lint output and propose an approved style-safe source change.";
    case "Compilation":
      return "Inspect build output and affected files, then propose the smallest approved source correction.";
    case "Runtime":
      return "Inspect the failing path and propose an approved guard, initialization, or logic fix.";
    default:
      return "Review the bounded output and propose a minimal approved follow-up action.";
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function truncateText(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function browserRequestFromAction(action: AgentApprovalAction): Record<string, unknown> {
  const sessionId = action.browserSessionId;
  switch (action.type) {
    case "browser-open":
      return { action: "open", url: action.browserUrl, headless: action.headless ?? true, purpose: action.description };
    case "browser-navigate":
      return { action: "navigate", sessionId, url: action.browserUrl, purpose: action.description };
    case "browser-click":
      return { action: "click", sessionId, elementRef: action.browserElementRef, purpose: action.description };
    case "browser-fill":
      return { action: "fill", sessionId, elementRef: action.browserElementRef, value: action.browserValue ?? "", purpose: action.description };
    case "browser-screenshot":
      return { action: "screenshot", sessionId, fullPage: action.browserFullPage, purpose: action.description };
    case "browser-close":
      return { action: "close", sessionId, purpose: action.description };
    default:
      throw new Error("Unsupported browser action.");
  }
}

async function executeBrowserAction(browserService: BrowserService, action: AgentApprovalAction): Promise<BrowserActionResult | { session: BrowserActionResult["session"]; screenshotPath?: string } | { sessionId: string; status: "Closed" }> {
  const request = browserRequestFromAction(action);
  if (action.type === "browser-open") return browserService.create(request);
  if (action.type === "browser-navigate") return browserService.navigate(request);
  if (action.type === "browser-click") return browserService.click(request);
  if (action.type === "browser-fill") return browserService.fill(request);
  if (action.type === "browser-screenshot") return browserService.screenshot(request);
  if (action.type === "browser-close") return browserService.close(request);
  throw new Error("Unsupported browser action.");
}

function validateTerminalCommand(action: AgentApprovalAction): { executable: string; args: string[]; cwd: string; commandId: string } {
  const command = splitCommand(action.command);
  const executable = validateTerminalExecutable(command.executable);
  const args = validateTerminalArgs(action.args ?? command.args);
  const cwd = validateTerminalCwd(action.cwd ?? action.relativePath);
  return {
    executable,
    args,
    cwd,
    commandId: createHash("sha256").update(JSON.stringify({ executable, args, cwd })).digest("hex").slice(0, 24)
  };
}

function splitCommand(value: unknown): { executable: string; args: string[] } {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 1_000 || value.includes("\0")) {
    throw new Error("Agent terminal command is invalid.");
  }
  assertNoShellSyntax(value);
  const parts = value.trim().split(/\s+/);
  return { executable: parts[0], args: parts.slice(1) };
}

function validateTerminalExecutable(value: string): string {
  if (!value || value.length > 120 || value.includes("\0") || SHELL_OPERATOR_PATTERN.test(value) || ENV_INJECTION_PATTERN.test(value)) {
    throw new Error("Agent terminal executable is invalid.");
  }
  if (path.isAbsolute(value) || value.includes("/") || value.includes("\\")) {
    throw new Error("Agent terminal executable must come from the configured allowlist.");
  }
  const normalized = path.basename(value).toLowerCase();
  if (BLOCKED_TERMINAL_EXECUTABLES.has(normalized) || !SAFE_TERMINAL_EXECUTABLES.has(normalized)) {
    throw new Error("Agent terminal executable is not allowed.");
  }
  return value;
}

function validateTerminalArgs(values: unknown): string[] {
  if (!Array.isArray(values) || values.length > MAX_TERMINAL_ARGS) throw new Error("Agent terminal arguments are invalid.");
  return values.map((value) => {
    if (typeof value !== "string" || value.length > MAX_TERMINAL_ARG_LENGTH || value.includes("\0")) {
      throw new Error("Agent terminal argument is invalid.");
    }
    assertNoShellSyntax(value);
    if (/^-c$/i.test(value) || /^\/c$/i.test(value)) throw new Error("Shell command execution flags are not allowed.");
    return value;
  });
}

function validateTerminalCwd(value: unknown): string {
  if (value === undefined) return ".";
  if (typeof value !== "string" || value.length > 500 || path.isAbsolute(value) || value.includes("\0")) throw new Error("Agent terminal working directory is invalid.");
  const normalized = value.trim() ? normalizeSlashes(value).replace(/^\.\//, "") : ".";
  if (normalized.split("/").includes("..")) throw new Error("Agent terminal working directory is invalid.");
  return normalized === "" ? "." : normalized;
}

function assertNoShellSyntax(value: string): void {
  if (SHELL_OPERATOR_PATTERN.test(value) || ENV_INJECTION_PATTERN.test(value) || POWERSHELL_INVOKE_PATTERN.test(value)) {
    throw new Error("Agent terminal command contains unsupported shell syntax.");
  }
}

function terminalRisk(executable: string, args: string[]): AgentRiskLevel {
  const command = `${executable} ${args.join(" ")}`.toLowerCase();
  if (/\b(test|lint|typecheck|--version|-v)\b/.test(command)) return "low";
  if (/\b(build|install|add|remove|run|start|dev)\b/.test(command)) return "medium";
  return "medium";
}

function terminalPreviewFingerprint(preview: AgentTerminalPreview): string {
  return JSON.stringify({ executable: preview.executable, args: preview.args, cwd: preview.cwd, commandId: preview.commandId });
}

function canDirectProcessExecute(preview: AgentTerminalPreview): boolean {
  return DIRECT_PROCESS_EXECUTABLES.has(path.basename(preview.executable).toLowerCase());
}

function shouldUseDirectProcessExecution(preview: AgentTerminalPreview): boolean {
  return canDirectProcessExecute(preview);
}

function resolveDirectProcessLaunch(preview: AgentTerminalPreview): { executable: string; args: string[] } {
  const base = path.basename(preview.executable).toLowerCase();
  if (base === "npm" || base === "npm.cmd") {
    return { executable: process.execPath, args: [resolveNodePackageCli("npm"), ...preview.args] };
  }
  if (base === "npx" || base === "npx.cmd") {
    return { executable: process.execPath, args: [resolveNodePackageCli("npx"), ...preview.args] };
  }
  if (process.platform === "win32" && (base === "gradlew.bat" || base === "gradle.bat")) {
    return { executable: process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe", args: ["/d", "/s", "/c", preview.executable, ...preview.args] };
  }
  return { executable: preview.executable, args: preview.args };
}

function terminalExitInfrastructureMessage(run: AgentTerminalRunState): string | undefined {
  const base = path.basename(run.executable).toLowerCase();
  const text = `${run.stderrPreview}\n${run.outputPreview}`.toLowerCase();
  const bridgeMissing = /not recognized as an internal or external command|cannot find the path specified|no such file or directory|command not found/.test(text);
  if (bridgeMissing && /^(gradlew\.bat|gradle\.bat|gradlew|gradle|node|node\.exe|npm|npm\.cmd|npx|npx\.cmd|python|python\.exe|dotnet|dotnet\.exe|cargo|cargo\.exe|go|go\.exe)$/.test(base)) {
    return `Terminal execution failed: ${run.executable} could not be launched.`;
  }
  return undefined;
}

function resolveNodePackageCli(command: "npm" | "npx"): string {
  const cliFile = command === "npm" ? "npm-cli.js" : "npx-cli.js";
  const npmExecPath = process.env.npm_execpath && path.basename(process.env.npm_execpath).toLowerCase() === cliFile ? process.env.npm_execpath : undefined;
  const candidates = [
    npmExecPath,
    process.env.npm_execpath ? path.join(path.dirname(process.env.npm_execpath), cliFile) : undefined,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", cliFile),
    ...findPathExecutables(command === "npm" ? ["npm.cmd", "npm"] : ["npx.cmd", "npx"]).flatMap((executable) => [
      path.join(path.dirname(executable), "node_modules", "npm", "bin", cliFile),
      path.join(path.dirname(path.dirname(executable)), "node_modules", "npm", "bin", cliFile)
    ])
  ].filter((candidate): candidate is string => Boolean(candidate));
  const match = candidates.find((candidate) => existsSync(candidate));
  if (!match) {
    throw new Error(`${command} CLI could not be resolved without a shell.`);
  }
  return match;
}

function findPathExecutables(names: string[]): string[] {
  const extensions = process.platform === "win32" ? ["", ".cmd", ".exe", ".bat"] : [""];
  const paths = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const matches: string[] = [];
  for (const directory of paths) {
    for (const name of names) {
      const hasExtension = Boolean(path.extname(name));
      const candidates = hasExtension ? [path.join(directory, name)] : extensions.map((extension) => path.join(directory, `${name}${extension}`));
      for (const candidate of candidates) {
        if (existsSync(candidate)) matches.push(candidate);
      }
    }
  }
  return matches;
}

function boundTerminalOutput(value: string): string {
  return value.length > MAX_TERMINAL_OUTPUT_CHARS ? value.slice(value.length - MAX_TERMINAL_OUTPUT_CHARS) : value;
}

function isLikelyStderr(data: string): boolean {
  return /\b(error|failed|exception|warning)\b/i.test(data);
}

function linesMatching(value: string, pattern: RegExp): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && pattern.test(line)).slice(-20);
}

function inferAffectedFilesFromTerminalOutput(output: string): string[] {
  const files = new Set<string>();
  const normalized = output.replace(/\r\n/g, "\n");
  for (const match of normalized.matchAll(/Build file '([^']+?build\.gradle(?:\.kts)?)'/g)) {
    const buildFile = relativeGradleBuildPath(match[1]);
    if (buildFile) files.add(buildFile);
  }
  const patterns = [
    /(?:^|\s)([A-Za-z0-9_.\-\/\\]+?\.(?:tsx?|jsx?|css|scss|json|html|vue|svelte|cs|go|rs|py|java|kt|gradle\.kts|gradle))(?:[:(]\d+)?/g,
    /(?:^|\n)\s*(?:at\s+)?([A-Za-z0-9_.\-\/\\]+?\.(?:tsx?|jsx?|css|scss|json|html|vue|svelte|cs|go|rs|py|java|kt|gradle\.kts|gradle))\b/g
  ];
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const value = normalizeSlashes(match[1]).replace(/^\.\//, "");
      if (!value || path.isAbsolute(value) || value.split("/").includes("..")) continue;
      files.add(value);
      if (files.size >= 10) break;
    }
  }
  return [...files];
}

function relativeGradleBuildPath(value: string): string | undefined {
  const normalized = normalizeSlashes(value);
  const moduleBuild = normalized.match(/(?:^|\/)([^/]+\/build\.gradle(?:\.kts)?)$/i)?.[1];
  if (moduleBuild) return moduleBuild;
  const rootBuild = normalized.match(/(?:^|\/)(build\.gradle(?:\.kts)?)$/i)?.[1];
  return rootBuild;
}

function terminalFailureDetails(terminalRun: AgentTerminalRunState, session: AgentSession, affectedFiles: string[]): Record<string, unknown> {
  return {
    command: terminalRun.executable,
    args: terminalRun.args,
    cwd: terminalRun.cwd,
    exitCode: terminalRun.exitCode,
    resultStatus: terminalRun.resultStatus ?? "failed",
    projectType: session.plan?.starterLabel ?? session.plan?.planningMode ?? "unknown",
    relevantFiles: affectedFiles,
    stderr: terminalRun.stderrPreview,
    stdout: terminalRun.outputPreview
  };
}

function hasOnlyInfrastructureFailures(report: AgentVerificationReport): boolean {
  const errors = report.failures.filter((failure) => failure.severity === "error");
  return errors.length > 0 && errors.every((failure) => failure.source === "terminal" && /^Terminal execution failed\b/i.test(failure.message));
}

function normalizeGitOperation(value: unknown): GitOperation {
  if (
    value === "status" ||
    value === "stage-file" ||
    value === "unstage-file" ||
    value === "stage-all" ||
    value === "commit" ||
    value === "pull" ||
    value === "push" ||
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
