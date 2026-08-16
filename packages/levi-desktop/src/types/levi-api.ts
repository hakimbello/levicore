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
import type {
  TaskCancelRequest,
  TaskEvent,
  TaskHistoryEntry,
  TaskListResult,
  TaskOutputEntry,
  TaskOutputRequest,
  TaskPinRequest,
  TaskProblem,
  TaskRun,
  TaskRunRequest
} from "./task-api";
import type {
  AIRuntimeDiagnostics,
  AIRuntimeEmbeddingsResponse,
  AIRuntimeInvocationResponse,
  AIRuntimeLifecycleRequest,
  AIRuntimeModel,
  AIRuntimeModelOperationRequest,
  AIRuntimeModelOperationResult,
  AIRuntimeProviderId,
  AIRuntimeRequest,
  AIRuntimeSelectRequest,
  AIRuntimeState,
  AIRuntimeStreamResult
} from "../features/ai-runtime";
import type {
  AIChatAttachment,
  AIChatCancelRequest,
  AIChatArchiveRequest,
  AIChatBudgetRequest,
  AIChatDeleteMessageRequest,
  AIChatDeleteRequest,
  AIChatEvent,
  AIChatContextBudget,
  AIChatContextDiscoveryResult,
  AIChatContextPreviewRequest,
  AIChatContextPreviewResult,
  AIChatExportRequest,
  AIChatExportResult,
  AIChatForkRequest,
  AIChatOpenCitationRequest,
  AIChatNewRequest,
  AIChatRenameRequest,
  AIChatSearchRequest,
  AIChatSendRequest,
  AIChatSendResult,
  AIChatSetPanelRequest,
  AIChatState
} from "../features/ai-chat";
import type {
  BrowserActionResult,
  BrowserCloseResult,
  BrowserCreateRequest,
  BrowserCreateResult,
  BrowserElementActionRequest,
  BrowserFillRequest,
  BrowserNavigateRequest,
  BrowserPageSnapshot,
  BrowserPressRequest,
  BrowserScreenshotRequest,
  BrowserScreenshotResult,
  BrowserScrollRequest,
  BrowserSession,
  BrowserSnapshotResult,
  BrowserStatusRequest,
  BrowserStatusResult
} from "../features/browser";
import type {
  AgentApprovalRequest,
  AgentArchiveRequest,
  AgentBrowserExecuteRequest,
  AgentBrowserExecutionResult,
  AgentBrowserPreviewRequest,
  AgentBrowserPreviewResult,
  AgentBrowserStatusRequest,
  AgentBrowserStatusResult,
  AgentCancelRequest,
  AgentDeleteRequest,
  AgentExecuteRequest,
  AgentExecutionResult,
  AgentEvent,
  AgentGitExecuteRequest,
  AgentGitExecutionResult,
  AgentGitPreviewRequest,
  AgentGitPreviewResult,
  AgentGitStatusRequest,
  AgentGitStatusResult,
  AgentNewSessionRequest,
  AgentPlanRequest,
  AgentPlanResult,
  AgentPreviewRequest,
  AgentPreviewResult,
  AgentQueueRequest,
  AgentQueueResult,
  AgentRepairPlanRequest,
  AgentRepairPlanResult,
  AgentRepairExecuteRequest,
  AgentRepairExecutionResult,
  AgentRepairStatusRequest,
  AgentRepairStatusResult,
  AgentRenameRequest,
  AgentSession,
  AgentState,
  AgentStatusRequest,
  AgentTaskCancelRequest,
  AgentTaskExecuteRequest,
  AgentTaskExecutionResult,
  AgentTaskPreviewRequest,
  AgentTaskPreviewResult,
  AgentTaskStatusRequest,
  AgentTaskStatusResult,
  AgentTaskVerificationResult,
  AgentTaskVerifyRequest,
  AgentTerminalCancelRequest,
  AgentTerminalExecuteRequest,
  AgentTerminalExecutionResult,
  AgentTerminalPreviewRequest,
  AgentTerminalPreviewResult,
  AgentTerminalStatusRequest,
  AgentTerminalStatusResult,
  AgentUndoRequest,
  AgentUndoResult,
  AgentVerifyRequest,
  AgentVerifyResult
} from "../features/agent";

export type {
  BrowserActionKind,
  BrowserActionPreview,
  BrowserActionResult,
  BrowserCloseResult,
  BrowserCreateRequest,
  BrowserCreateResult,
  BrowserElementActionRequest,
  BrowserElementSnapshot,
  BrowserFillRequest,
  BrowserNavigateRequest,
  BrowserPageSnapshot,
  BrowserPressRequest,
  BrowserScreenshotRequest,
  BrowserScreenshotResult,
  BrowserScrollRequest,
  BrowserSession,
  BrowserSessionRequest,
  BrowserSessionStatus,
  BrowserSnapshotResult,
  BrowserStatusRequest,
  BrowserStatusResult
} from "../features/browser";

export type {
  AgentActionType,
  AgentActionPreview,
  AgentApprovalAction,
  AgentApprovalRequest,
  AgentApprovalState,
  AgentArchiveRequest,
  AgentBrowserActionStatus,
  AgentBrowserExecuteRequest,
  AgentBrowserExecutionResult,
  AgentBrowserPreviewRequest,
  AgentBrowserPreviewResult,
  AgentBrowserRunState,
  AgentBrowserStatusRequest,
  AgentBrowserStatusResult,
  AgentCancelRequest,
  AgentDeleteRequest,
  AgentDiffLine,
  AgentExecuteRequest,
  AgentExecutionQueueItem,
  AgentExecutionQueueStatus,
  AgentExecutionResult,
  AgentEvent,
  AgentExecutionPlan,
  AgentFileEdit,
  AgentFileEditKind,
  AgentGitActionStatus,
  AgentGitExecuteRequest,
  AgentGitExecutionResult,
  AgentGitOperation,
  AgentGitPreview,
  AgentGitPreviewRequest,
  AgentGitPreviewResult,
  AgentGitRepositoryStatus,
  AgentGitRunState,
  AgentGitStatusEntry,
  AgentGitStatusRequest,
  AgentGitStatusResult,
  AgentGitVerificationSummary,
  AgentMessage,
  AgentMessageRole,
  AgentNewSessionRequest,
  AgentPlanRequest,
  AgentPlanResult,
  AgentPlanStep,
  AgentPlanStepStatus,
  AgentPreviewRequest,
  AgentPreviewResult,
  AgentProjectSummary,
  AgentQueueRequest,
  AgentQueueResult,
  AgentRepairPlanRequest,
  AgentRepairPlanResult,
  AgentRepairExecuteRequest,
  AgentRepairExecutionResult,
  AgentRepairProgressEntry,
  AgentRepairQueueItem,
  AgentRepairStatus,
  AgentRepairStatusRequest,
  AgentRepairStatusResult,
  AgentRenameRequest,
  AgentRiskLevel,
  AgentSession,
  AgentSessionStatus,
  AgentState,
  AgentStatusRequest,
  AgentTaskActionStatus,
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
  AgentTerminalActionStatus,
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
  AgentVerificationCheckStatus,
  AgentVerificationFailure,
  AgentVerificationReport,
  AgentVerificationStatus,
  AgentVerifyRequest,
  AgentVerifyResult
} from "../features/agent";

export type {
  AIRuntimeDetection,
  AIRuntimeDiagnostics,
  AIRuntimeEmbeddingsResponse,
  AIRuntimeHealthState,
  AIRuntimeInvocationResponse,
  AIRuntimeLifecycleRequest,
  AIRuntimeModel,
  AIRuntimeModelDownload,
  AIRuntimeModelOperationRequest,
  AIRuntimeModelOperationResult,
  AIRuntimeProviderId,
  AIRuntimeProviderSummary,
  AIRuntimeRequest,
  AIRuntimeRequestStatus,
  AIRuntimeRequestSummary,
  AIRuntimeSelectRequest,
  AIRuntimeSelectionMode,
  AIRuntimeState,
  AIRuntimeStreamEvent,
  AIRuntimeStreamResult
} from "../features/ai-runtime";

export type {
  AIChatAttachment,
  AIChatArchiveRequest,
  AIChatBudgetRequest,
  AIChatCancelRequest,
  AIChatConversation,
  AIChatCitation,
  AIChatContextBudget,
  AIChatContextDiscoveryResult,
  AIChatContextPreviewRequest,
  AIChatContextPreviewResult,
  AIChatContextSource,
  AIChatDeleteMessageRequest,
  AIChatDeleteRequest,
  AIChatDockPosition,
  AIChatEvent,
  AIChatExportRequest,
  AIChatExportResult,
  AIChatForkRequest,
  AIChatMessage,
  AIChatOpenCitationRequest,
  AIChatNewRequest,
  AIChatPanelState,
  AIChatRenameRequest,
  AIChatSearchRequest,
  AIChatSendRequest,
  AIChatSendResult,
  AIChatSetPanelRequest,
  AIChatState
} from "../features/ai-chat";

export type {
  TaskCancelRequest,
  TaskDefinition,
  TaskEvent,
  TaskHistoryEntry,
  TaskListResult,
  TaskOutputEntry,
  TaskOutputRequest,
  TaskPinRequest,
  TaskProblem,
  TaskRun,
  TaskRunRequest,
  TaskStatus
} from "./task-api";

export type OllamaStatus = {
  ready: boolean;
  modelCount: number;
  models: string[];
};

export type SelectedProject = {
  path: string;
  name: string;
};

export type ProjectType =
  | "vanilla-web"
  | "react"
  | "vite"
  | "nextjs"
  | "node"
  | "typescript"
  | "android-gradle"
  | "kotlin-android"
  | "flutter"
  | "react-native"
  | "expo"
  | "ios"
  | "git"
  | "empty"
  | "unknown";

export type MobilePlatform = "android" | "ios" | "flutter" | "react-native" | "expo";
export type MobileLanguage = "kotlin" | "java" | "swift" | "dart" | "typescript" | "javascript";
export type MobileFramework = "jetpack-compose" | "android-views" | "swiftui" | "flutter" | "react-native" | "expo";
export type MobileBuildSystem = "gradle" | "xcode" | "swift-package-manager" | "flutter" | "npm";
export type UniversalRunTargetKind =
  | "browser"
  | "android-device"
  | "android-emulator"
  | "ios-simulator"
  | "ios-device"
  | "desktop"
  | "local-server";

export type MobileProjectModel = {
  platform: MobilePlatform;
  language: MobileLanguage;
  framework: MobileFramework;
  buildSystem: MobileBuildSystem;
  requiredTools: string[];
  buildCommand?: string;
  testCommand?: string;
  runCommand?: string;
  deviceTargets: UniversalRunTargetKind[];
  emulatorTargets: UniversalRunTargetKind[];
  packageIdentifier?: string;
  minimumPlatformVersion?: string;
  projectRoot: string;
  modules: string[];
  appModule?: string;
  confidence: number;
  evidence: string[];
};

export type MobileToolStatus = "ready" | "missing" | "unavailable" | "unknown";

export type MobileTool = {
  name: string;
  status: MobileToolStatus;
  version?: string;
  detail?: string;
  executablePath?: string;
  guidance?: string;
};

export type AndroidDeviceTarget = {
  id: string;
  kind: "android-device" | "android-emulator";
  state: "device" | "offline" | "unauthorized" | "unknown";
  model?: string;
  product?: string;
  name?: string;
};

export type MobileEnvironment = {
  os: NodeJS.Platform;
  android: {
    jdk: MobileTool;
    javaHome: MobileTool;
    androidSdk: MobileTool;
    adb: MobileTool;
    gradle: MobileTool;
    gradleWrapper: MobileTool;
    buildTools: MobileTool;
    platformTools: MobileTool;
    platforms: MobileTool;
    emulator: MobileTool;
    avds: MobileTool & { names: string[] };
    devices: MobileTool & { targets: AndroidDeviceTarget[] };
    status: "ready" | "missing-tools" | "no-targets" | "unknown";
    summary: string;
  };
  flutter: {
    flutter: MobileTool;
    dart: MobileTool;
    doctor: MobileTool;
    androidTarget: MobileTool;
    iosTarget: MobileTool;
  };
  reactNative: {
    node: MobileTool;
    npm: MobileTool;
    pnpm: MobileTool;
    yarn: MobileTool;
    npx: MobileTool;
    expoCli: MobileTool;
    androidTooling: MobileTool;
    iosTooling: MobileTool;
  };
  ios: {
    sourceDevelopment: MobileTool;
    nativeBuild: MobileTool;
    xcode: MobileTool;
    xcodebuild: MobileTool;
    swift: MobileTool;
    swiftPackageManager: MobileTool;
    simulators: MobileTool;
    devices: MobileTool;
    summary: string;
  };
};

export type ProjectDetection = {
  projectType: ProjectType;
  framework?: string;
  packageManager?: string;
  buildCommand?: string;
  testCommand?: string;
  devCommand?: string;
  entryPoint?: string;
  mobile?: MobileProjectModel;
  runTargets?: UniversalRunTargetKind[];
  confidence: number;
  evidence: string[];
};

export type ProjectStarterCategory =
  | "vanilla-web"
  | "react-vite"
  | "nextjs"
  | "node-api"
  | "android-compose"
  | "empty-project"
  | "empty"
  | "clone-github";

export type StarterCommandInfo = {
  label: string;
  command: string;
  args: string[];
  cwd?: string;
  kind: "install" | "build" | "test" | "dev" | "verify";
  required: boolean;
};

export type ProjectStarterInfo = {
  id: ProjectStarterCategory;
  label: string;
  projectFamily?: "web" | "api" | "empty" | "mobile" | "desktop";
  framework?: string;
  language?: string;
  packageManager?: string;
  requiredTools?: string[];
  initializationActions?: "deterministic-files" | "ecosystem-initializer" | "empty";
  expectedFiles?: string[];
  verificationStrategy?: "build-command" | "syntax-check" | "static-files" | "none";
  description: string;
  installCommand?: string | StarterCommandInfo;
  buildCommand?: StarterCommandInfo;
  testCommand?: StarterCommandInfo;
  devCommand?: StarterCommandInfo;
  verificationCommand?: string;
};

export type CloneRepositoryRequest = {
  repositoryUrl: string;
  destinationFolder: string;
};

export type CloneRepositoryResult = {
  project: SelectedProject;
  detection: ProjectDetection;
  summary: string;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type CreateStarterRequest = {
  starter: ProjectStarterCategory;
  destinationFolder: string;
  projectName?: string;
};

export type CreateStarterResult = {
  project: SelectedProject;
  detection: ProjectDetection;
  summary: string;
  commands: string[];
  needsEnvironmentCheck?: boolean;
  warnings: string[];
};

export type RunAppCommand = {
  id: string;
  label: string;
  command: string;
  args: string[];
  cwd?: string;
  confidence: number;
  longRunning: boolean;
};

export type RunAppStatus = {
  running: boolean;
  terminalSessionId?: string;
  command?: RunAppCommand;
  target?: AndroidDeviceTarget;
  outputPreview: string;
  startedAt?: string;
  stoppedAt?: string;
  exitCode?: number;
};

export type RunAppResult = {
  status: RunAppStatus;
};

export type ViewChangesResult = {
  createdFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
};

export type TerminalSession = {
  id: string;
  cwd: string;
  name: string;
  shellKind: string;
};

export type TerminalSessionMetadata = {
  id: string;
  name: string;
  cwd: string;
  shellKind: string;
  alive: boolean;
  createdAt: string;
};

export type TerminalCreateRequest = {
  cols: number;
  rows: number;
  name?: string;
  cwd?: string;
};

export type TerminalResizeRequest = {
  id: string;
  cols: number;
  rows: number;
};

export type TerminalRenameRequest = {
  id: string;
  name: string;
};

export type TerminalSplitRequest = {
  sourceId: string;
  direction: "horizontal" | "vertical";
  cols: number;
  rows: number;
  cwd?: string;
};

export type TerminalSplitNode =
  | { type: "pane"; tabId: string }
  | { type: "split"; direction: "horizontal" | "vertical"; children: [TerminalSplitNode, TerminalSplitNode] };

export type TerminalLayoutTab = {
  id: string;
  name: string;
  cwd: string;
  sessionId?: string;
};

export type TerminalLayoutState = {
  tabs: TerminalLayoutTab[];
  activeTabId: string | null;
  panelTab: "terminal" | "problems" | "output" | "debug-console";
  panelVisible: boolean;
  panelMaximized: boolean;
  panelHeightPx: number;
  splitLayout: TerminalSplitNode | null;
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
  columnStart?: number;
};

export type WorkspaceOpenFileResult = {
  sourceId: string;
  relativePath: string;
  content: string;
  language: string;
  lineStart: number;
  columnStart?: number;
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
    starters: () => Promise<ProjectStarterInfo[]>;
    createStarter: (request: CreateStarterRequest) => Promise<CreateStarterResult>;
    cloneRepository: (request: CloneRepositoryRequest) => Promise<CloneRepositoryResult>;
    detect: () => Promise<ProjectDetection>;
    mobileEnvironment: () => Promise<MobileEnvironment>;
    runCommands: () => Promise<RunAppCommand[]>;
    runApp: (request?: { commandId?: string }) => Promise<RunAppResult>;
    stopApp: () => Promise<RunAppResult>;
    runStatus: () => Promise<RunAppStatus>;
    viewChanges: () => Promise<ViewChangesResult>;
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
    stopAll: () => Promise<DebugState>;
    selectSession: (sessionId: string) => Promise<DebugState>;
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
    kill: (id: string) => Promise<TerminalSessionMetadata>;
    rename: (request: TerminalRenameRequest) => Promise<TerminalSessionMetadata>;
    list: () => Promise<TerminalSessionMetadata[]>;
    split: (request: TerminalSplitRequest) => Promise<TerminalSession>;
    restart: (id: string) => Promise<TerminalSession>;
    getLayout: () => Promise<TerminalLayoutState>;
    setLayout: (layout: TerminalLayoutState) => Promise<TerminalLayoutState>;
    revealCwd: (id: string) => Promise<string>;
    onData: (listener: (event: TerminalDataEvent) => void) => () => void;
  };
  tasks: {
    list: () => Promise<TaskListResult>;
    run: (request: TaskRunRequest) => Promise<TaskRun>;
    cancel: (request: TaskCancelRequest) => Promise<TaskRun>;
    history: () => Promise<TaskHistoryEntry[]>;
    problems: () => Promise<TaskProblem[]>;
    output: (request?: TaskOutputRequest) => Promise<TaskOutputEntry[]>;
    pin: (request: TaskPinRequest) => Promise<TaskListResult>;
    onEvent: (listener: (event: TaskEvent) => void) => () => void;
  };
  runtime: {
    list: () => Promise<AIRuntimeState>;
    detect: () => Promise<AIRuntimeState>;
    health: (providerId?: AIRuntimeProviderId) => Promise<AIRuntimeState>;
    models: (providerId?: AIRuntimeProviderId) => Promise<AIRuntimeModel[]>;
    select: (request: AIRuntimeSelectRequest) => Promise<AIRuntimeState>;
    diagnostics: () => Promise<AIRuntimeDiagnostics[]>;
    chat: (request: AIRuntimeRequest) => Promise<AIRuntimeInvocationResponse>;
    completion: (request: AIRuntimeRequest) => Promise<AIRuntimeInvocationResponse>;
    stream: (request: AIRuntimeRequest) => Promise<AIRuntimeStreamResult>;
    embeddings: (request: AIRuntimeRequest) => Promise<AIRuntimeEmbeddingsResponse>;
    pullModel: (request: AIRuntimeModelOperationRequest) => Promise<AIRuntimeModelOperationResult>;
    deleteModel: (request: AIRuntimeModelOperationRequest) => Promise<AIRuntimeModelOperationResult>;
    start: (request: AIRuntimeLifecycleRequest) => Promise<AIRuntimeModelOperationResult>;
    stop: (request: AIRuntimeLifecycleRequest) => Promise<AIRuntimeModelOperationResult>;
    restart: (request: AIRuntimeLifecycleRequest) => Promise<AIRuntimeModelOperationResult>;
    cancel: (request: { requestId: string }) => Promise<AIRuntimeState>;
  };
  chat: {
    list: () => Promise<AIChatState>;
    new: (request?: AIChatNewRequest) => Promise<AIChatState>;
    delete: (request: AIChatDeleteRequest) => Promise<AIChatState>;
    rename: (request: AIChatRenameRequest) => Promise<AIChatState>;
    deleteMessage: (request: AIChatDeleteMessageRequest) => Promise<AIChatState>;
    fork: (request: AIChatForkRequest) => Promise<AIChatState>;
    archive: (request: AIChatArchiveRequest) => Promise<AIChatState>;
    search: (request: AIChatSearchRequest) => Promise<AIChatState>;
    discoverContext: () => Promise<AIChatContextDiscoveryResult>;
    previewContext: (request: AIChatContextPreviewRequest) => Promise<AIChatContextPreviewResult>;
    budget: (request: AIChatBudgetRequest) => Promise<AIChatContextBudget>;
    openCitation: (request: AIChatOpenCitationRequest) => Promise<AIChatAttachment>;
    send: (request: AIChatSendRequest) => Promise<AIChatSendResult>;
    cancel: (request: AIChatCancelRequest) => Promise<AIChatState>;
    export: (request: AIChatExportRequest) => Promise<AIChatExportResult>;
    setPanel: (request: AIChatSetPanelRequest) => Promise<AIChatState>;
    pin: (request: AIChatDeleteRequest) => Promise<AIChatState>;
    onEvent: (listener: (event: AIChatEvent) => void) => () => void;
  };
  agent: {
    newSession: (request?: AgentNewSessionRequest) => Promise<AgentState>;
    list: () => Promise<AgentState>;
    delete: (request: AgentDeleteRequest) => Promise<AgentState>;
    rename: (request: AgentRenameRequest) => Promise<AgentState>;
    archive: (request: AgentArchiveRequest) => Promise<AgentState>;
    plan: (request: AgentPlanRequest) => Promise<AgentPlanResult>;
    approve: (request: AgentApprovalRequest) => Promise<AgentState>;
    reject: (request: AgentApprovalRequest) => Promise<AgentState>;
    preview: (request: AgentPreviewRequest) => Promise<AgentPreviewResult>;
    execute: (request: AgentExecuteRequest) => Promise<AgentExecutionResult>;
    undo: (request: AgentUndoRequest) => Promise<AgentUndoResult>;
    queue: (request: AgentQueueRequest) => Promise<AgentQueueResult>;
    cancel: (request: AgentCancelRequest) => Promise<AgentExecutionResult>;
    taskPreview: (request: AgentTaskPreviewRequest) => Promise<AgentTaskPreviewResult>;
    taskExecute: (request: AgentTaskExecuteRequest) => Promise<AgentTaskExecutionResult>;
    taskCancel: (request: AgentTaskCancelRequest) => Promise<AgentTaskExecutionResult>;
    taskStatus: (request: AgentTaskStatusRequest) => Promise<AgentTaskStatusResult>;
    taskVerify: (request: AgentTaskVerifyRequest) => Promise<AgentTaskVerificationResult>;
    terminalPreview: (request: AgentTerminalPreviewRequest) => Promise<AgentTerminalPreviewResult>;
    terminalExecute: (request: AgentTerminalExecuteRequest) => Promise<AgentTerminalExecutionResult>;
    terminalCancel: (request: AgentTerminalCancelRequest) => Promise<AgentTerminalExecutionResult>;
    terminalStatus: (request: AgentTerminalStatusRequest) => Promise<AgentTerminalStatusResult>;
    gitPreview: (request: AgentGitPreviewRequest) => Promise<AgentGitPreviewResult>;
    gitExecute: (request: AgentGitExecuteRequest) => Promise<AgentGitExecutionResult>;
    gitStatus: (request: AgentGitStatusRequest) => Promise<AgentGitStatusResult>;
    verify: (request: AgentVerifyRequest) => Promise<AgentVerifyResult>;
    repairPlan: (request: AgentRepairPlanRequest) => Promise<AgentRepairPlanResult>;
    repairExecute: (request: AgentRepairExecuteRequest) => Promise<AgentRepairExecutionResult>;
    repairStatus: (request: AgentRepairStatusRequest) => Promise<AgentRepairStatusResult>;
    browserPreview: (request: AgentBrowserPreviewRequest) => Promise<AgentBrowserPreviewResult>;
    browserExecute: (request: AgentBrowserExecuteRequest) => Promise<AgentBrowserExecutionResult>;
    browserStatus: (request: AgentBrowserStatusRequest) => Promise<AgentBrowserStatusResult>;
    status: (request?: AgentStatusRequest) => Promise<AgentState | AgentSession>;
    onEvent: (listener: (event: AgentEvent) => void) => () => void;
  };
  browser: {
    create: (request?: BrowserCreateRequest) => Promise<BrowserCreateResult>;
    status: (request?: BrowserStatusRequest) => Promise<BrowserStatusResult>;
    snapshot: (request: { sessionId: string }) => Promise<BrowserSnapshotResult>;
    navigate: (request: BrowserNavigateRequest) => Promise<BrowserActionResult>;
    click: (request: BrowserElementActionRequest) => Promise<BrowserActionResult>;
    fill: (request: BrowserFillRequest) => Promise<BrowserActionResult>;
    press: (request: BrowserPressRequest) => Promise<BrowserActionResult>;
    scroll: (request: BrowserScrollRequest) => Promise<BrowserActionResult>;
    screenshot: (request: BrowserScreenshotRequest) => Promise<BrowserScreenshotResult>;
    close: (request: { sessionId: string }) => Promise<BrowserCloseResult>;
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
