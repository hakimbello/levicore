import type {
  WorkspaceReadPathRequest,
  WorkspaceReadPathResult,
  WorkspaceTreeResult,
  WorkspaceWritePathRequest,
  WorkspaceWritePathResult
} from "./workspace-tree-api";
import type {
  DebugEvent,
  DebugEvaluateRequest,
  DebugLoadVariablesRequest,
  DebugRemoveBreakpointRequest,
  DebugSetBreakpointRequest,
  DebugSetExceptionBreakpointsRequest,
  DebugStartRequest,
  DebugState,
  DebugUpdateWatchRequest,
  DebugAdapterInstallRequest,
  DebugAdapterUninstallRequest,
  DebugAdapterRegisterCustomRequest,
  DebugAdapterDefinition,
  DebugCompletionRequest,
  DebugCompletionItem
} from "../features/debugger";

export type OllamaStatus = {
  ready: boolean;
  modelCount: number;
  models: string[];
};

export type SelectedProject = {
  path: string;
  name: string;
};

export type TerminalSession = {
  id: string;
  cwd: string;
};

export type TerminalCreateRequest = {
  cols: number;
  rows: number;
};

export type TerminalResizeRequest = {
  id: string;
  cols: number;
  rows: number;
};

export type TerminalDataEvent = {
  id: string;
  data: string;
};

export const DEFAULT_CONVERSATION_MODEL = "qwen3.6:latest";
export const DEFAULT_EDIT_MODEL = "qwen2.5-coder:7b";
export const MAX_CONVERSATION_MESSAGE_LENGTH = 12000;

export type ConversationRole = "user" | "assistant";

export type ConversationMessage = {
  role: ConversationRole;
  content: string;
};

export type ConversationStartRequest = {
  model: typeof DEFAULT_CONVERSATION_MODEL;
  messages: ConversationMessage[];
};

export type ConversationStartResult = {
  requestId: string;
};

export type WorkspaceScanSummary = {
  projectName: string;
  rootPath: string;
  languages: string[];
  frameworks: string[];
  packageManager?: string;
  applicationType?: string;
  likelyEntryPoints: string[];
  sourceDirectories: string[];
  testDirectories: string[];
  scripts: Record<string, string>;
  documentationFiles: string[];
  manifestFiles: string[];
  includedFileCount: number;
  excludedFileCount: number;
  scanTimestamp: string;
};

export type RuntimeConnectionStatus = {
  state: "uninitialized" | "ready" | "degraded" | "failed" | "unavailable";
  runtimeState?: string;
  overallRuntimeHealth?: number;
  workspaceId?: string;
  error?: string;
};

export type WorkspaceStatus = {
  state: "idle" | "scanning" | "ready" | "refresh-required" | "failed";
  summary?: WorkspaceScanSummary;
  error?: string;
  runtime?: RuntimeConnectionStatus;
};

export type UpdateStatusState =
  | "idle"
  | "checking"
  | "update-available"
  | "update-not-available"
  | "downloading"
  | "downloaded"
  | "error";

export type UpdateStatus = {
  state: UpdateStatusState;
  currentVersion: string;
  availableVersion?: string;
  progressPercent?: number;
  message?: string;
  error?: string;
};

export type UpdateStatusEvent = {
  type: "status";
  status: UpdateStatus;
};

export type WorkspaceFileReference = {
  sourceId: string;
  relativePath: string;
  lineStart: number;
  lineEnd: number;
  reason: string;
};

export type WorkspaceOpenFileRequest = {
  sourceId: string;
  lineStart?: number;
};

export type WorkspaceOpenFileResult = {
  sourceId: string;
  relativePath: string;
  content: string;
  language: string;
  lineStart: number;
  readOnly: boolean;
  appliedByLevi?: boolean;
  undoneByLevi?: boolean;
};

export type ProjectRuleCategory =
  | "architecture"
  | "code style"
  | "testing"
  | "dependencies"
  | "security"
  | "accessibility"
  | "design"
  | "naming"
  | "file organization"
  | "build"
  | "generated files"
  | "documentation"
  | "deployment"
  | "product requirements";

export type ProjectRuleStrength = "required" | "prohibited" | "preferred" | "informational";

export type ProjectRuleSource = {
  sourceId: string;
  relativePath: string;
  scopePath: string;
  kind: "guidance" | "design" | "configuration";
};

export type ProjectRule = {
  ruleId: string;
  text: string;
  sourceId: string;
  sourcePath: string;
  lineStart: number;
  lineEnd: number;
  scopePath: string;
  category: ProjectRuleCategory;
  strength: ProjectRuleStrength;
  confidence: "low" | "medium" | "high";
  extraction: "deterministic" | "model-assisted";
  suspicious?: boolean;
};

export type ProjectRuleConflict = {
  conflictId: string;
  scopePath: string;
  category: ProjectRuleCategory;
  ruleIds: string[];
  summary: string;
  resolution: "more-specific-wins" | "user-instruction-wins" | "security-wins" | "needs-user-decision";
};

export type DesignContextSummary = {
  tokens: Array<{
    name: string;
    value: string;
    category: "color" | "typography" | "spacing" | "radius" | "shadow" | "breakpoint" | "motion" | "unknown";
    sourcePath: string;
    lineStart: number;
    lineEnd: number;
  }>;
  components: Array<{
    name: string;
    kind: string;
    sourcePath: string;
    lineStart: number;
    lineEnd: number;
  }>;
  conventions: Array<{
    text: string;
    sourcePath: string;
    lineStart: number;
    lineEnd: number;
  }>;
  sources: string[];
};

export type ActiveRuleContext = {
  rules: ProjectRule[];
  conflicts: ProjectRuleConflict[];
  design?: DesignContextSummary;
  omittedRules: Array<{
    ruleId: string;
    reason: string;
  }>;
  sourceCitations: ProjectRuleSource[];
  totals: {
    applicableRules: number;
    omittedRules: number;
    conflicts: number;
    contextChars: number;
  };
};

export type ProjectRulesStatus = {
  state: "idle" | "scanning" | "ready" | "enriching" | "ready-without-model-enrichment" | "failed";
  guidanceFileCount: number;
  activeRuleCount: number;
  conflictCount: number;
  suspiciousCount: number;
  error?: string;
  timings: {
    discoveryMs: number;
    extractionMs: number;
    enrichmentMs: number;
    activeContextMs: number;
  };
};

export type ProjectRulesListResult = {
  status: ProjectRulesStatus;
  sources: ProjectRuleSource[];
  rules: ProjectRule[];
  conflicts: ProjectRuleConflict[];
  design: DesignContextSummary;
  suspiciousRules: ProjectRule[];
};

export type ProjectRulesRefreshResult = ProjectRulesListResult;

export type ProjectRuleOpenSourceRequest = {
  ruleId: string;
};

export type ProjectRulesStreamEvent =
  | {
      type: "status";
      status: ProjectRulesStatus;
    }
  | {
      type: "updated";
      result: ProjectRulesListResult;
    };

export type PlanConfidence = "low" | "medium" | "high";
export type PlanComplexity = "Very Low" | "Low" | "Medium" | "High" | "Very High";
export type PlanFileCertainty = "confirmed" | "possible";
export type PlanRiskLevel = "low" | "medium" | "high";

export type PlanAffectedFile = {
  relativePath: string;
  certainty: PlanFileCertainty;
  role: string;
  reason: string;
  evidenceSourceIds: string[];
};

export type PlanExecutionStep = {
  order: number;
  title: string;
  purpose: string;
  affectedFiles: string[];
  risk: PlanRiskLevel;
  ruleIds?: string[];
};

export type ExecutionPlan = {
  planId: string;
  requestId: string;
  goal: string;
  summary: string;
  confidence: PlanConfidence;
  estimatedComplexity: PlanComplexity;
  estimatedFiles: number;
  estimatedSteps: number;
  affectedFiles: PlanAffectedFile[];
  executionOrder: PlanExecutionStep[];
  dependencies: string[];
  validationCommands: string[];
  risks: string[];
  assumptions: string[];
  openQuestions: string[];
  blockedItems: string[];
  suggestedNextAction: string;
  applicableProjectRules: ProjectRule[];
  designConstraints: string[];
  ruleConflicts: ProjectRuleConflict[];
  ruleSources: ProjectRuleSource[];
  timings: {
    retrievalMs: number;
    modelMs: number;
    totalMs: number;
  };
};

export type PlanningCreateRequest = {
  prompt: string;
};

export type PlanningCreateResult = {
  requestId: string;
};

export type PlanningApproveResult = {
  planId: string;
  message: string;
  transaction: ExecutionPublicTransaction;
};

export type ExecutionTransactionStatus =
  | "prepared"
  | "generating"
  | "step-proposed"
  | "applying"
  | "step-applied"
  | "paused"
  | "completed"
  | "kept"
  | "rolled-back"
  | "cancelled"
  | "failed";

export type ExecutionStepStatus = "pending" | "proposed" | "applied" | "failed";

export type ExecutionPublicProposal = {
  proposalId: string;
  transactionId: string;
  planStepId: string;
  stepIndex: number;
  relativePath: string;
  summary: string;
  assumptions: string[];
  warnings: string[];
  suggestedValidationCommands: string[];
  confidence: "low" | "medium" | "high";
  addedLineCount: number;
  removedLineCount: number;
  diff: EditDiffLine[];
  appliedProjectRules: ProjectRule[];
  ruleConflicts: ProjectRuleConflict[];
  timings: {
    modelMs: number;
    diffMs: number;
    totalMs: number;
  };
};

export type ExecutionPublicStep = {
  stepIndex: number;
  planStepId: string;
  planStepOrder: number;
  planStepTitle: string;
  relativePath: string;
  status: ExecutionStepStatus;
  proposal?: ExecutionPublicProposal;
};

export type ExecutionAggregateFileReview = {
  relativePath: string;
  addedLineCount: number;
  removedLineCount: number;
  diff: EditDiffLine[];
  validationStatus: "passed" | "failed" | "unavailable";
};

export type ExecutionAggregateReview = {
  files: ExecutionAggregateFileReview[];
  totalAdded: number;
  totalRemoved: number;
  validationCommands: string[];
  commandsNotRun: true;
};

export type ExecutionPublicTransaction = {
  transactionId: string;
  planId: string;
  goal: string;
  workspaceRootPath: string;
  scanTimestamp: string;
  status: ExecutionTransactionStatus;
  steps: ExecutionPublicStep[];
  currentStepIndex: number;
  appliedProjectRules: ProjectRule[];
  ruleConflicts: ProjectRuleConflict[];
  unsupportedOperations: {
    creates: string[];
    deletes: string[];
  };
  validationCommands: string[];
  aggregateReview?: ExecutionAggregateReview;
  failureMessage?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  totals: {
    stepCount: number;
    appliedCount: number;
    pendingCount: number;
  };
};

export type ExecutionPrepareResult = {
  transaction: ExecutionPublicTransaction;
};

export type ExecutionProposeStepResult = {
  transaction: ExecutionPublicTransaction;
  proposal: ExecutionPublicProposal;
};

export type ExecutionApplyStepResult = {
  transaction: ExecutionPublicTransaction;
  relativePath: string;
  content: string;
  language: string;
  stepIndex: number;
};

export type ExecutionRollbackResult = {
  transaction: ExecutionPublicTransaction;
  restoredPaths: string[];
};

export type ExecutionKeepResult = {
  transaction: ExecutionPublicTransaction;
};

export type ExecutionCancelResult = {
  transaction: ExecutionPublicTransaction;
};

export type ExecutionRejectStepResult = {
  transaction: ExecutionPublicTransaction;
};

export type ExecutionStatus = {
  activeTransaction?: ExecutionPublicTransaction;
  route: {
    stepGeneration: typeof DEFAULT_EDIT_MODEL;
  };
};

export type ExecutionErrorCode =
  | "NO_WORKSPACE"
  | "STALE_SCAN"
  | "NO_EXECUTABLE_STEPS"
  | "ONLY_POSSIBLE_FILES"
  | "RULE_CONFLICT"
  | "UNSUPPORTED_OPERATION"
  | "INVALID_PATH"
  | "DUPLICATE_PATH"
  | "ACTIVE_TRANSACTION"
  | "MODEL_MISSING"
  | "OLLAMA_UNAVAILABLE"
  | "REQUEST_TIMEOUT"
  | "MALFORMED_RESPONSE"
  | "VALIDATION_FAILED"
  | "STALE_STEP"
  | "WRITE_FAILED"
  | "ROLLBACK_FAILED"
  | "UNKNOWN";

export type ExecutionStreamEvent =
  | {
      type: "status";
      transactionId: string;
      message: string;
    }
  | {
      type: "prepared";
      transaction: ExecutionPublicTransaction;
    }
  | {
      type: "proposal";
      transactionId: string;
      proposal: ExecutionPublicProposal;
      transaction: ExecutionPublicTransaction;
    }
  | {
      type: "applied";
      transactionId: string;
      relativePath: string;
      stepIndex: number;
      transaction: ExecutionPublicTransaction;
    }
  | {
      type: "rolled-back";
      transactionId: string;
      restoredPaths: string[];
      transaction: ExecutionPublicTransaction;
    }
  | {
      type: "kept";
      transactionId: string;
      transaction: ExecutionPublicTransaction;
    }
  | {
      type: "cancelled";
      transactionId: string;
      transaction: ExecutionPublicTransaction;
    }
  | {
      type: "stopped";
      transactionId: string;
      reason: "user" | "window-closed";
    }
  | {
      type: "error";
      transactionId?: string;
      code: ExecutionErrorCode;
      message: string;
      recoverable: boolean;
    };

export type PlanningStatus = {
  latestPlan?: ExecutionPlan;
  activeRequestId?: string;
  route: {
    planning: typeof DEFAULT_CONVERSATION_MODEL;
  };
};

export type PlanningErrorCode =
  | "NO_WORKSPACE"
  | "NO_RELEVANT_FILES"
  | "INSUFFICIENT_EVIDENCE"
  | "AMBIGUOUS_REQUEST"
  | "UNSUPPORTED_FRAMEWORK"
  | "HUGE_PROJECT"
  | "MODEL_MISSING"
  | "OLLAMA_UNAVAILABLE"
  | "REQUEST_TIMEOUT"
  | "MALFORMED_RESPONSE"
  | "INVALID_REQUEST"
  | "UNKNOWN";

export type PlanningStreamEvent =
  | {
      type: "status";
      requestId: string;
      message: string;
    }
  | {
      type: "plan";
      requestId: string;
      plan: ExecutionPlan;
    }
  | {
      type: "approved";
      planId: string;
      message: string;
      transaction: ExecutionPublicTransaction;
    }
  | {
      type: "stopped";
      requestId: string;
      reason: "user" | "window-closed";
    }
  | {
      type: "error";
      requestId?: string;
      code: PlanningErrorCode;
      message: string;
      recoverable: boolean;
    };

export type EditDiffLine = {
  type: "context" | "added" | "removed";
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
};

export type EditProposal = {
  proposalId: string;
  requestId: string;
  relativePath: string;
  summary: string;
  assumptions: string[];
  warnings: string[];
  suggestedValidationCommands: string[];
  confidence: "low" | "medium" | "high";
  addedLineCount: number;
  removedLineCount: number;
  diff: EditDiffLine[];
  appliedProjectRules: ProjectRule[];
  ruleConflicts: ProjectRuleConflict[];
  status: "pending" | "applied" | "rejected" | "stale";
  timings: {
    retrievalMs: number;
    modelMs: number;
    diffMs: number;
    totalMs: number;
  };
};

export type EditProposeRequest = {
  prompt: string;
};

export type EditProposeResult = {
  requestId: string;
};

export type EditApplyResult = {
  proposalId: string;
  relativePath: string;
  content: string;
  language: string;
  lineStart: number;
  readOnly: true;
  applied: true;
  timings: {
    applyMs: number;
  };
};

export type EditUndoResult = {
  relativePath: string;
  content: string;
  language: string;
  lineStart: number;
  readOnly: true;
  undone: true;
};

export type EditStatus = {
  pendingProposalId?: string;
  canUndo: boolean;
  lastAppliedPath?: string;
  route: {
    conversation: typeof DEFAULT_CONVERSATION_MODEL;
    editGeneration: typeof DEFAULT_EDIT_MODEL;
  };
};

export type EditErrorCode =
  | "NO_WORKSPACE"
  | "UNSUPPORTED_SCOPE"
  | "TARGET_NOT_FOUND"
  | "MODEL_MISSING"
  | "OLLAMA_UNAVAILABLE"
  | "REQUEST_TIMEOUT"
  | "MALFORMED_RESPONSE"
  | "VALIDATION_FAILED"
  | "STALE_PROPOSAL"
  | "WRITE_FAILED"
  | "UNDO_UNAVAILABLE"
  | "UNKNOWN";

export type EditStreamEvent =
  | {
      type: "status";
      requestId: string;
      message: string;
    }
  | {
      type: "proposal";
      requestId: string;
      proposal: EditProposal;
    }
  | {
      type: "rejected";
      proposalId: string;
    }
  | {
      type: "applied";
      proposalId: string;
      relativePath: string;
    }
  | {
      type: "undone";
      relativePath: string;
    }
  | {
      type: "error";
      requestId?: string;
      proposalId?: string;
      code: EditErrorCode;
      message: string;
      recoverable: boolean;
    };

export type ConversationErrorCode =
  | "OLLAMA_UNAVAILABLE"
  | "MODEL_MISSING"
  | "REQUEST_TIMEOUT"
  | "STREAM_DISCONNECTED"
  | "MALFORMED_RESPONSE"
  | "INVALID_REQUEST"
  | "NO_WORKSPACE_EVIDENCE"
  | "UNKNOWN";

export type ConversationStreamEvent =
  | {
      type: "chunk";
      requestId: string;
      content: string;
    }
  | {
      type: "done";
      requestId: string;
    }
  | {
      type: "stopped";
      requestId: string;
      reason: "user" | "window-closed";
    }
  | {
      type: "citations";
      requestId: string;
      citations: WorkspaceFileReference[];
    }
  | {
      type: "error";
      requestId: string;
      code: ConversationErrorCode;
      message: string;
      recoverable: boolean;
    };

export type LeviApi = {
  ollama: {
    getStatus: () => Promise<OllamaStatus>;
  };
  projects: {
    getRecent: () => Promise<SelectedProject | null>;
    openFolder: () => Promise<SelectedProject | null>;
  };
  workspace: {
    getStatus: () => Promise<WorkspaceStatus>;
    refresh: () => Promise<WorkspaceStatus>;
    openFile: (request: WorkspaceOpenFileRequest) => Promise<WorkspaceOpenFileResult>;
    listTree: () => Promise<WorkspaceTreeResult>;
    readPath: (request: WorkspaceReadPathRequest) => Promise<WorkspaceReadPathResult>;
    writePath: (request: WorkspaceWritePathRequest) => Promise<WorkspaceWritePathResult>;
  };
  updates: {
    getStatus: () => Promise<UpdateStatus>;
    checkForUpdates: () => Promise<UpdateStatus>;
    downloadUpdate: () => Promise<UpdateStatus>;
    installDownloadedUpdate: () => Promise<UpdateStatus>;
    onEvent: (listener: (event: UpdateStatusEvent) => void) => () => void;
  };
  rules: {
    getStatus: () => Promise<ProjectRulesStatus>;
    list: () => Promise<ProjectRulesListResult>;
    refresh: () => Promise<ProjectRulesRefreshResult>;
    openSource: (request: ProjectRuleOpenSourceRequest) => Promise<WorkspaceOpenFileResult>;
    onEvent: (listener: (event: ProjectRulesStreamEvent) => void) => () => void;
  };
  edits: {
    propose: (request: EditProposeRequest) => Promise<EditProposeResult>;
    cancel: (requestId: string) => Promise<void>;
    apply: (proposalId: string) => Promise<EditApplyResult>;
    reject: (proposalId: string) => Promise<void>;
    undoLast: () => Promise<EditUndoResult>;
    getStatus: () => Promise<EditStatus>;
    onEvent: (listener: (event: EditStreamEvent) => void) => () => void;
  };
  planning: {
    create: (request: PlanningCreateRequest) => Promise<PlanningCreateResult>;
    cancel: (requestId: string) => Promise<void>;
    approve: (planId: string) => Promise<PlanningApproveResult>;
    getStatus: () => Promise<PlanningStatus>;
    onEvent: (listener: (event: PlanningStreamEvent) => void) => () => void;
  };
  execution: {
    prepare: (planId: string) => Promise<ExecutionPrepareResult>;
    proposeStep: (transactionId: string) => Promise<ExecutionProposeStepResult>;
    applyStep: (transactionId: string) => Promise<ExecutionApplyStepResult>;
    rejectStep: (transactionId: string) => Promise<ExecutionRejectStepResult>;
    regenerateStep: (transactionId: string) => Promise<ExecutionProposeStepResult>;
    rollback: (transactionId: string) => Promise<ExecutionRollbackResult>;
    keep: (transactionId: string) => Promise<ExecutionKeepResult>;
    cancel: (transactionId: string) => Promise<ExecutionCancelResult>;
    getStatus: () => Promise<ExecutionStatus>;
    onEvent: (listener: (event: ExecutionStreamEvent) => void) => () => void;
  };
  debug: {
    start: (request: DebugStartRequest) => Promise<DebugState>;
    stop: () => Promise<DebugState>;
    restart: () => Promise<DebugState>;
    pause: () => Promise<DebugState>;
    continue: () => Promise<DebugState>;
    stepOver: () => Promise<DebugState>;
    stepInto: () => Promise<DebugState>;
    stepOut: () => Promise<DebugState>;
    setBreakpoint: (request: DebugSetBreakpointRequest) => Promise<DebugState>;
    removeBreakpoint: (request: DebugRemoveBreakpointRequest) => Promise<DebugState>;
    getBreakpoints: () => Promise<DebugState["breakpoints"]>;
    getState: () => Promise<DebugState>;
    selectConfiguration: (name: string) => Promise<DebugState>;
    createLaunchConfig: () => Promise<DebugState>;
    addWatch: (expression: string) => Promise<DebugState>;
    updateWatch: (request: DebugUpdateWatchRequest) => Promise<DebugState>;
    removeWatch: (id: string) => Promise<DebugState>;
    loadVariables: (request: DebugLoadVariablesRequest) => Promise<DebugState>;
    evaluate: (request: DebugEvaluateRequest) => Promise<DebugState>;
    clearConsole: () => Promise<DebugState>;
    selectStackFrame: (request: { threadId: number; frameId: number }) => Promise<DebugState>;
    setExceptionBreakpoints: (request: DebugSetExceptionBreakpointsRequest) => Promise<DebugState>;
    refreshLoadedSources: () => Promise<DebugState>;
    getCompletions: (request: DebugCompletionRequest) => Promise<DebugCompletionItem[]>;
    cancelEvaluations: () => Promise<void>;
    listAdapters: () => Promise<DebugAdapterDefinition[]>;
    scanAdapters: () => Promise<DebugState>;
    getAdapterStatus: (adapterId: string) => Promise<DebugState>;
    installAdapter: (request: DebugAdapterInstallRequest) => Promise<DebugState>;
    updateAdapter: (request: DebugAdapterInstallRequest) => Promise<DebugState>;
    uninstallAdapter: (request: DebugAdapterUninstallRequest) => Promise<DebugState>;
    validateAdapter: (adapterId: string) => Promise<DebugState>;
    registerCustomAdapter: (request: DebugAdapterRegisterCustomRequest) => Promise<DebugState>;
    revokeCustomAdapter: (adapterId: string) => Promise<DebugState>;
    dismissAdapterRecommendation: (adapterId: string) => Promise<DebugState>;
    cancelAdapterInstall: () => Promise<void>;
    revealAdapterLocation: (adapterId: string) => Promise<string>;
    onEvent: (listener: (event: DebugEvent) => void) => () => void;
  };
  terminal: {
    create: (request: TerminalCreateRequest) => Promise<TerminalSession>;
    write: (id: string, data: string) => Promise<void>;
    resize: (request: TerminalResizeRequest) => Promise<void>;
    dispose: (id: string) => Promise<void>;
    onData: (listener: (event: TerminalDataEvent) => void) => () => void;
  };
  conversation: {
    start: (request: ConversationStartRequest) => Promise<ConversationStartResult>;
    cancel: (requestId: string) => Promise<void>;
    onEvent: (listener: (event: ConversationStreamEvent) => void) => () => void;
  };
  dev?: {
    openProjectPath: (directoryPath: string) => Promise<SelectedProject | null>;
    injectPlan: (plan: ExecutionPlan) => Promise<{ planId: string }>;
    getTimings: () => Promise<Record<string, number | string>>;
  };
};

declare global {
  interface Window {
    levi: LeviApi;
  }
}
