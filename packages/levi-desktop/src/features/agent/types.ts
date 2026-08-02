import type { AIChatAttachment } from "../ai-chat";
import type { AIRuntimeProviderId } from "../ai-runtime";

export type AgentSessionStatus = "Idle" | "Planning" | "WaitingForApproval" | "Ready" | "Archived" | "Error";

export type AgentApprovalState = "Pending" | "Approved" | "Rejected" | "Cancelled";

export type AgentActionType =
  | "create-file"
  | "modify-file"
  | "delete-file"
  | "run-task"
  | "run-terminal-command"
  | "git-operation";

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
  taskName?: string;
  command?: string;
  gitOperation?: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentExecutionPlan = {
  id: string;
  objective: string;
  summary: string;
  steps: AgentPlanStep[];
  approvals: AgentApprovalAction[];
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

export type AgentStatusRequest = {
  sessionId?: string;
};

export type AgentPlanResult = {
  sessionId: string;
  state: AgentState;
};

export type AgentEvent =
  | { type: "state"; state: AgentState }
  | { type: "progress"; sessionId: string; state: AgentState };
