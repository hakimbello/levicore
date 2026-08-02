import type { AIChatAttachment } from "../ai-chat";
import type { AIRuntimeProviderId } from "../ai-runtime";

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

export type AgentExecutionPlan = {
  id: string;
  objective: string;
  summary: string;
  steps: AgentPlanStep[];
  approvals: AgentApprovalAction[];
  executionQueue: AgentExecutionQueueItem[];
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

export type AgentEvent =
  | { type: "state"; state: AgentState }
  | { type: "progress"; sessionId: string; state: AgentState }
  | { type: "preview"; sessionId: string; preview: AgentActionPreview; state: AgentState }
  | { type: "execution"; sessionId: string; actionId: string; state: AgentState };
