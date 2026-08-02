import type { AIChatAttachment } from "../ai-chat";
import type { AIRuntimeProviderId } from "../ai-runtime";
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
  | "git-operation";

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
  gitOperation?: string;
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

export type AgentExecutionPlan = {
  id: string;
  objective: string;
  summary: string;
  steps: AgentPlanStep[];
  approvals: AgentApprovalAction[];
  executionQueue: AgentExecutionQueueItem[];
  taskRuns: AgentTaskRunState[];
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

export type AgentEvent =
  | { type: "state"; state: AgentState }
  | { type: "progress"; sessionId: string; state: AgentState }
  | { type: "preview"; sessionId: string; preview: AgentActionPreview; state: AgentState }
  | { type: "execution"; sessionId: string; actionId: string; state: AgentState }
  | { type: "task-preview"; sessionId: string; preview: AgentTaskPreview; state: AgentState }
  | { type: "task"; sessionId: string; actionId: string; taskRun: AgentTaskRunState; state: AgentState }
  | { type: "task-verification"; sessionId: string; actionId: string; verification: AgentTaskVerificationSummary; state: AgentState };
