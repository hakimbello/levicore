import type { AIChatAttachment } from "../ai-chat";
import type { AIRuntimeProviderId } from "../ai-runtime";
import type { BrowserActionPreview, BrowserActionResult, BrowserSession } from "../browser";
import type { TaskDefinition, TaskOutputEntry, TaskProblem, TaskRun } from "../../types/task-api";

export type AgentSessionStatus = "Idle" | "Planning" | "WaitingForApproval" | "Ready" | "Executing" | "Archived" | "Error";

export type AgentApprovalState = "Pending" | "Approved" | "Rejected" | "Cancelled";

export type AgentActionType =
  | "create-file"
  | "modify-file"
  | "delete-file"
  | "rename-file"
  | "create-folder"
  | "rename-folder"
  | "run-task"
  | "run-terminal-command"
  | "git-operation"
  | "browser-open"
  | "browser-navigate"
  | "browser-click"
  | "browser-fill"
  | "browser-screenshot"
  | "browser-close";

export type AgentFileEditKind = "insert" | "replace" | "append" | "delete-range" | "whole-file";

export type AgentFileEdit = {
  kind: AgentFileEditKind;
  content?: string;
  line?: number;
  startLine?: number;
  endLine?: number;
  find?: string;
  replace?: string;
};

export type AgentMessageRole = "user" | "assistant" | "system";

export type AgentMessage = {
  id: string;
  role: AgentMessageRole;
  content: string;
  createdAt: string;
};

export type AgentPlanStepStatus = "Pending" | "Approved" | "Rejected" | "Blocked";

export type AgentPlanStep = {
  id: string;
  order: number;
  title: string;
  description: string;
  status: AgentPlanStepStatus;
  estimatedFiles: string[];
  actionIds: string[];
};

export type AgentApprovalAction = {
  id: string;
  type: AgentActionType;
  title: string;
  description: string;
  status: AgentApprovalState;
  stepId?: string;
  relativePath?: string;
  destinationRelativePath?: string;
  content?: string;
  edits?: AgentFileEdit[];
  taskId?: string;
  taskFingerprint?: string;
  taskName?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  expectedOutput?: string;
  estimatedDurationMs?: number;
  gitOperation?: string;
  commitMessage?: string;
  branchName?: string;
  affectedFiles?: string[];
  browserSessionId?: string;
  browserUrl?: string;
  browserElementRef?: string;
  browserValue?: string;
  browserFullPage?: boolean;
  headless?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AgentDiffLine = {
  type: "context" | "added" | "removed";
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
};

export type AgentRiskLevel = "low" | "medium" | "high";

export type AgentActionPreview = {
  previewId: string;
  sessionId: string;
  actionId: string;
  actionType: AgentActionType;
  targetPath: string;
  destinationPath?: string;
  summary: string;
  riskLevel: AgentRiskLevel;
  destructive: boolean;
  originalContent?: string;
  proposedContent?: string;
  addedLineCount: number;
  removedLineCount: number;
  diff: AgentDiffLine[];
  createdAt: string;
};

export type AgentExecutionQueueStatus = "Pending" | "Executing" | "Completed" | "Failed" | "Rejected" | "Cancelled";

export type AgentExecutionQueueItem = {
  actionId: string;
  type: AgentActionType;
  title: string;
  relativePath?: string;
  destinationRelativePath?: string;
  status: AgentExecutionQueueStatus;
  previewId?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
};

export type AgentUndoMetadata = {
  actionId: string;
  relativePath: string;
  destinationRelativePath?: string;
  actionType: AgentActionType;
  timestamp: string;
};

export type AgentTaskActionStatus = "Pending" | "Approved" | "Running" | "Succeeded" | "Failed" | "Cancelled" | "Interrupted";

export type AgentTaskPreview = {
  previewId: string;
  sessionId: string;
  actionId: string;
  taskId: string;
  taskName: string;
  source: TaskDefinition["source"];
  executable: string;
  args: string[];
  cwd?: string;
  expectedPurpose: string;
  riskLevel: AgentRiskLevel;
  longRunning: boolean;
  definitionFingerprint: string;
  createdAt: string;
};

export type AgentTaskRunState = {
  actionId: string;
  taskId: string;
  taskName: string;
  status: AgentTaskActionStatus;
  runId?: string;
  terminalSessionId?: string;
  startedAt?: string;
  endedAt?: string;
  exitCode?: number;
  durationMs?: number;
  longRunning: boolean;
  definitionFingerprint: string;
  outputPreview: TaskOutputEntry[];
  problems: TaskProblem[];
  failureReason?: string;
  verification?: AgentTaskVerificationSummary;
  updatedAt: string;
};

export type AgentTaskVerificationSummary = {
  id: string;
  actionId: string;
  taskRunId?: string;
  summary: string;
  exitCode?: number;
  durationMs?: number;
  outputExcerpt: string;
  problems: TaskProblem[];
  changedFiles: string[];
  createdAt: string;
};

export type AgentTerminalActionStatus = "Pending" | "Approved" | "Running" | "Succeeded" | "Failed" | "Cancelled" | "Interrupted";
export type AgentTerminalResultStatus = "completed" | "failed" | "cancelled" | "infrastructure-error";

export type AgentTerminalPreview = {
  previewId: string;
  sessionId: string;
  actionId: string;
  executable: string;
  args: string[];
  cwd: string;
  purpose: string;
  riskLevel: AgentRiskLevel;
  expectedOutput?: string;
  estimatedDurationMs?: number;
  commandId: string;
  createdAt: string;
};

export type AgentTerminalRunState = {
  actionId: string;
  commandId: string;
  executable: string;
  args: string[];
  cwd: string;
  status: AgentTerminalActionStatus;
  resultStatus?: AgentTerminalResultStatus;
  terminalSessionId?: string;
  startedAt?: string;
  endedAt?: string;
  exitCode?: number;
  durationMs?: number;
  outputPreview: string;
  stderrPreview: string;
  failureReason?: string;
  verification?: AgentTerminalVerificationSummary;
  updatedAt: string;
};

export type AgentTerminalVerificationSummary = {
  id: string;
  actionId: string;
  commandId: string;
  summary: string;
  exitCode?: number;
  durationMs?: number;
  outputExcerpt: string;
  warnings: string[];
  errors: string[];
  createdAt: string;
};

export type AgentGitOperation =
  | "status"
  | "stage-file"
  | "unstage-file"
  | "stage-all"
  | "commit"
  | "pull"
  | "push"
  | "create-branch"
  | "switch-branch"
  | "restore-file"
  | "show-diff";

export type AgentGitActionStatus = "Pending" | "Approved" | "Executing" | "Succeeded" | "Failed" | "Rejected" | "Cancelled" | "Interrupted";

export type AgentGitStatusEntry = {
  path: string;
  index: string;
  workingTree: string;
};

export type AgentGitRepositoryStatus = {
  repositoryRoot: string;
  currentBranch?: string;
  detachedHead: boolean;
  headCommit?: string;
  hasMergeConflicts: boolean;
  rebaseInProgress: boolean;
  entries: AgentGitStatusEntry[];
  summary: string[];
};

export type AgentGitPreview = {
  previewId: string;
  sessionId: string;
  actionId: string;
  operation: AgentGitOperation;
  repositoryRoot: string;
  relativePaths: string[];
  affectedFiles: string[];
  commitMessage?: string;
  branchName?: string;
  riskLevel: AgentRiskLevel;
  unifiedDiff: string;
  fileCount: number;
  addedLineCount: number;
  removedLineCount: number;
  status: AgentGitRepositoryStatus;
  warnings: string[];
  createdAt: string;
};

export type AgentGitRunState = {
  actionId: string;
  operation: AgentGitOperation;
  status: AgentGitActionStatus;
  repositoryRoot: string;
  affectedFiles: string[];
  commitMessage?: string;
  branchName?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  commitHash?: string;
  stdout?: string;
  stderr?: string;
  failureReason?: string;
  verification?: AgentGitVerificationSummary;
  updatedAt: string;
};

export type AgentGitVerificationSummary = {
  id: string;
  actionId: string;
  operation: AgentGitOperation;
  summary: string;
  repositoryRoot: string;
  currentBranch?: string;
  commitHash?: string;
  durationMs?: number;
  affectedFiles: string[];
  statusLines: string[];
  createdAt: string;
};

export type AgentBrowserActionStatus = "Pending" | "Approved" | "Executing" | "Succeeded" | "Failed" | "Rejected" | "Cancelled";

export type AgentBrowserRunState = {
  actionId: string;
  actionType: AgentActionType;
  status: AgentBrowserActionStatus;
  preview?: BrowserActionPreview;
  session?: BrowserSession;
  result?: BrowserActionResult;
  screenshotPath?: string;
  failureReason?: string;
  startedAt?: string;
  endedAt?: string;
  updatedAt: string;
};

export type AgentBrowserPreviewRequest = {
  sessionId: string;
  actionId: string;
};

export type AgentBrowserExecuteRequest = {
  sessionId: string;
  actionId: string;
};

export type AgentBrowserStatusRequest = {
  sessionId: string;
  actionId?: string;
};

export type AgentBrowserPreviewResult = {
  sessionId: string;
  preview: BrowserActionPreview;
  state: AgentState;
};

export type AgentBrowserExecutionResult = {
  sessionId: string;
  actionId: string;
  browserRun: AgentBrowserRunState;
  state: AgentState;
};

export type AgentBrowserStatusResult = {
  sessionId: string;
  browserRuns: AgentBrowserRunState[];
  state: AgentState;
};

export type AgentVerificationStatus = "Succeeded" | "Failed" | "Warnings";
export type AgentVerificationCheckStatus = "not-run" | "succeeded" | "failed" | "warnings";
export type AgentFailureClassification =
  | "Compilation"
  | "Type errors"
  | "Lint"
  | "Runtime"
  | "Missing dependency"
  | "Missing import"
  | "Syntax"
  | "Unknown";
export type AgentRepairStatus = "Pending" | "Approved" | "Rejected" | "Cancelled" | "Executing" | "Completed" | "Blocked";

export type AgentVerificationCheck = {
  kind: "build" | "test" | "lint" | "typecheck";
  status: AgentVerificationCheckStatus;
  actionId?: string;
  taskRunId?: string;
  exitCode?: number;
  durationMs?: number;
  summary: string;
};

export type AgentVerificationFailure = {
  id: string;
  classification: AgentFailureClassification;
  source: "task" | "terminal" | "problems" | "git" | "execution";
  message: string;
  affectedFiles: string[];
  details?: Record<string, unknown>;
  actionId?: string;
  exitCode?: number;
  severity: "error" | "warning";
};

export type AgentVerificationReport = {
  id: string;
  sessionId: string;
  status: AgentVerificationStatus;
  summary: string;
  checks: AgentVerificationCheck[];
  problems: TaskProblem[];
  terminalOutputExcerpt: string;
  taskOutputExcerpt: string;
  gitChangedFiles: string[];
  exitCodes: Array<{ source: "task" | "terminal"; actionId: string; exitCode?: number }>;
  failures: AgentVerificationFailure[];
  warnings: string[];
  startedAt: string;
  completedAt: string;
};

export type AgentRepairQueueItem = {
  id: string;
  reportId: string;
  attempt: number;
  problem: string;
  likelyCause: string;
  affectedFiles: string[];
  suggestedFix: string;
  actions: AgentApprovalAction[];
  requiresFreshApproval: boolean;
  blockers: string[];
  confidence: number;
  estimatedRisk: AgentRiskLevel;
  classification: AgentFailureClassification;
  status: AgentRepairStatus;
  createdAt: string;
  updatedAt: string;
};

export type AgentRepairProgressEntry = {
  id: string;
  stage: "Verification Started" | "Verification Complete" | "Repair Planned" | "Repair Approved" | "Repair Executing" | "Repair Complete";
  reportId?: string;
  repairId?: string;
  attempt?: number;
  createdAt: string;
};

export type AgentExecutionPlan = {
  id: string;
  objective: string;
  summary: string;
  planningMode?: "ai" | "deterministic-bootstrap" | "deterministic-existing-project" | "ai-with-bootstrap";
  starterId?: string;
  starterLabel?: string;
  projectSlug?: string;
  featurePlanningStatus?: "NotRequired" | "Planned" | "Retrying" | "TimedOut" | "Failed";
  plannerRetries?: number;
  milestones?: string[];
  steps: AgentPlanStep[];
  approvals: AgentApprovalAction[];
  executionQueue: AgentExecutionQueueItem[];
  taskRuns: AgentTaskRunState[];
  terminalRuns: AgentTerminalRunState[];
  gitRuns: AgentGitRunState[];
  browserRuns?: AgentBrowserRunState[];
  verificationReports: AgentVerificationReport[];
  repairQueue: AgentRepairQueueItem[];
  repairProgress: AgentRepairProgressEntry[];
  lastUndo?: AgentUndoMetadata;
  estimatedFiles: string[];
  progress: {
    totalSteps: number;
    pendingActions: number;
    approvedActions: number;
    rejectedActions: number;
    completedActions: number;
  };
  createdAt: string;
  updatedAt: string;
};

export type AgentProjectSummary = {
  projectName?: string;
  rootPath?: string;
  languages: string[];
  frameworks: string[];
  packageManager?: string;
  buildSystem: string[];
  sourceDirectories: string[];
  entryPoints: string[];
  openFiles: string[];
  git: {
    branch?: string;
    changedFiles: number;
    summary: string[];
  };
  context: {
    attachmentCount: number;
    tokenEstimate: number;
    labels: string[];
  };
};

export type AgentSession = {
  id: string;
  title: string;
  status: AgentSessionStatus;
  archived: boolean;
  runtimeId?: AIRuntimeProviderId;
  modelId?: string;
  messages: AgentMessage[];
  plan?: AgentExecutionPlan;
  projectSummary?: AgentProjectSummary;
  attachments: AIChatAttachment[];
  createdAt: string;
  updatedAt: string;
  error?: string;
};

export type AgentState = {
  sessions: AgentSession[];
  activeSessionId?: string;
  updatedAt: string;
};

export type AgentNewSessionRequest = {
  title?: string;
  runtimeId?: AIRuntimeProviderId;
  modelId?: string;
};

export type AgentDeleteRequest = {
  sessionId: string;
};

export type AgentRenameRequest = {
  sessionId: string;
  title: string;
};

export type AgentArchiveRequest = {
  sessionId: string;
  archived: boolean;
};

export type AgentPlanRequest = {
  sessionId?: string;
  prompt: string;
  runtimeId?: AIRuntimeProviderId;
  modelId: string;
  attachments?: AIChatAttachment[];
  openFiles?: Array<{ relativePath: string; language?: string }>;
};

export type AgentApprovalRequest = {
  sessionId: string;
  actionId: string;
};

export type AgentPreviewRequest = {
  sessionId: string;
  actionId: string;
};

export type AgentExecuteRequest = {
  sessionId: string;
  actionId: string;
  previewId?: string;
};

export type AgentUndoRequest = {
  sessionId: string;
};

export type AgentQueueRequest = {
  sessionId: string;
};

export type AgentCancelRequest = {
  sessionId: string;
  actionId?: string;
};

export type AgentTaskPreviewRequest = {
  sessionId: string;
  actionId: string;
};

export type AgentTaskExecuteRequest = {
  sessionId: string;
  actionId: string;
  previewId?: string;
};

export type AgentTaskCancelRequest = {
  sessionId: string;
  actionId: string;
};

export type AgentTaskStatusRequest = {
  sessionId: string;
  actionId?: string;
};

export type AgentTaskVerifyRequest = {
  sessionId: string;
  actionId: string;
};

export type AgentTerminalPreviewRequest = {
  sessionId: string;
  actionId: string;
};

export type AgentTerminalExecuteRequest = {
  sessionId: string;
  actionId: string;
  previewId?: string;
};

export type AgentTerminalCancelRequest = {
  sessionId: string;
  actionId: string;
};

export type AgentTerminalStatusRequest = {
  sessionId: string;
  actionId?: string;
};

export type AgentGitPreviewRequest = {
  sessionId: string;
  actionId: string;
};

export type AgentGitExecuteRequest = {
  sessionId: string;
  actionId: string;
  previewId?: string;
};

export type AgentGitStatusRequest = {
  sessionId: string;
  actionId?: string;
};

export type AgentVerifyRequest = {
  sessionId: string;
};

export type AgentRepairPlanRequest = {
  sessionId: string;
  reportId?: string;
};

export type AgentRepairStatusRequest = {
  sessionId: string;
  repairId?: string;
};

export type AgentRepairExecuteRequest = {
  sessionId: string;
  reportId?: string;
  repairId?: string;
  attempt?: number;
};

export type AgentStatusRequest = {
  sessionId?: string;
};

export type AgentPlanResult = {
  sessionId: string;
  state: AgentState;
};

export type AgentPreviewResult = {
  sessionId: string;
  preview: AgentActionPreview;
  state: AgentState;
};

export type AgentExecutionResult = {
  sessionId: string;
  actionId: string;
  state: AgentState;
};

export type AgentQueueResult = {
  sessionId: string;
  queue: AgentExecutionQueueItem[];
  currentActionId?: string;
  progress: {
    completed: number;
    remaining: number;
    estimatedFiles: number;
    elapsedMs: number;
  };
};

export type AgentUndoResult = {
  sessionId: string;
  actionId: string;
  relativePath: string;
  state: AgentState;
};

export type AgentTaskPreviewResult = {
  sessionId: string;
  preview: AgentTaskPreview;
  state: AgentState;
};

export type AgentTaskExecutionResult = {
  sessionId: string;
  actionId: string;
  taskRun: AgentTaskRunState;
  state: AgentState;
};

export type AgentTaskStatusResult = {
  sessionId: string;
  taskRuns: AgentTaskRunState[];
  state: AgentState;
};

export type AgentTaskVerificationResult = {
  sessionId: string;
  actionId: string;
  verification: AgentTaskVerificationSummary;
  state: AgentState;
};

export type AgentTerminalPreviewResult = {
  sessionId: string;
  preview: AgentTerminalPreview;
  state: AgentState;
};

export type AgentTerminalExecutionResult = {
  sessionId: string;
  actionId: string;
  terminalRun: AgentTerminalRunState;
  state: AgentState;
};

export type AgentTerminalStatusResult = {
  sessionId: string;
  terminalRuns: AgentTerminalRunState[];
  state: AgentState;
};

export type AgentGitPreviewResult = {
  sessionId: string;
  preview: AgentGitPreview;
  state: AgentState;
};

export type AgentGitExecutionResult = {
  sessionId: string;
  actionId: string;
  gitRun: AgentGitRunState;
  state: AgentState;
};

export type AgentGitStatusResult = {
  sessionId: string;
  gitRuns: AgentGitRunState[];
  state: AgentState;
};

export type AgentVerifyResult = {
  sessionId: string;
  report: AgentVerificationReport;
  state: AgentState;
};

export type AgentRepairPlanResult = {
  sessionId: string;
  reportId: string;
  repairs: AgentRepairQueueItem[];
  state: AgentState;
};

export type AgentRepairStatusResult = {
  sessionId: string;
  repairs: AgentRepairQueueItem[];
  reports: AgentVerificationReport[];
  progress: AgentRepairProgressEntry[];
  state: AgentState;
};

export type AgentRepairExecutionResult = {
  sessionId: string;
  reportId: string;
  attempt: number;
  executedActions: AgentExecutionQueueItem[];
  blockedActions: AgentApprovalAction[];
  repairs: AgentRepairQueueItem[];
  state: AgentState;
};

export type AgentEvent =
  | { type: "state"; state: AgentState }
  | { type: "progress"; sessionId: string; state: AgentState }
  | { type: "preview"; sessionId: string; preview: AgentActionPreview; state: AgentState }
  | { type: "execution"; sessionId: string; actionId: string; state: AgentState }
  | { type: "task-preview"; sessionId: string; preview: AgentTaskPreview; state: AgentState }
  | { type: "task"; sessionId: string; actionId: string; taskRun: AgentTaskRunState; state: AgentState }
  | { type: "task-verification"; sessionId: string; actionId: string; verification: AgentTaskVerificationSummary; state: AgentState }
  | { type: "terminal-preview"; sessionId: string; preview: AgentTerminalPreview; state: AgentState }
  | { type: "terminal"; sessionId: string; actionId: string; terminalRun: AgentTerminalRunState; state: AgentState }
  | { type: "git-preview"; sessionId: string; preview: AgentGitPreview; state: AgentState }
  | { type: "git"; sessionId: string; actionId: string; gitRun: AgentGitRunState; state: AgentState }
  | { type: "browser-preview"; sessionId: string; preview: BrowserActionPreview; state: AgentState }
  | { type: "browser"; sessionId: string; actionId: string; browserRun: AgentBrowserRunState; state: AgentState }
  | { type: "verification"; sessionId: string; report: AgentVerificationReport; state: AgentState }
  | { type: "repair-plan"; sessionId: string; reportId: string; repairs: AgentRepairQueueItem[]; state: AgentState };
