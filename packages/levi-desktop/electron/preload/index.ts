import { contextBridge, ipcRenderer } from "electron";
import type {
  LeviApi,
  ConversationStreamEvent,
  ConversationStartRequest,
  EditProposeRequest,
  EditStreamEvent,
  ExecutionStreamEvent,
  PlanningCreateRequest,
  PlanningStreamEvent,
  ProjectRuleOpenSourceRequest,
  ProjectRulesStreamEvent,
  TerminalCreateRequest,
  TerminalDataEvent,
  TerminalLayoutState,
  TerminalRenameRequest,
  TerminalResizeRequest,
  TerminalSplitRequest,
  UpdateStatusEvent,
  WorkspaceOpenFileRequest,
  AIRuntimeProviderId,
  AIRuntimeRequest,
  AIRuntimeModelOperationRequest,
  AIRuntimeLifecycleRequest,
  AIRuntimeSelectRequest,
  AIChatArchiveRequest,
  AIChatBudgetRequest,
  AIChatCancelRequest,
  AIChatContextPreviewRequest,
  AIChatDeleteMessageRequest,
  AIChatDeleteRequest,
  AIChatEvent,
  AIChatExportRequest,
  AIChatForkRequest,
  AIChatOpenCitationRequest,
  AIChatNewRequest,
  AIChatRenameRequest,
  AIChatSearchRequest,
  AIChatSendRequest,
  AIChatSetPanelRequest,
  AgentApprovalRequest,
  AgentArchiveRequest,
  AgentBrowserExecuteRequest,
  AgentBrowserPreviewRequest,
  AgentBrowserStatusRequest,
  AgentCancelRequest,
  AgentDeleteRequest,
  AgentExecuteRequest,
  AgentEvent,
  AgentGitExecuteRequest,
  AgentGitPreviewRequest,
  AgentGitStatusRequest,
  AgentNewSessionRequest,
  AgentPlanRequest,
  AgentPreviewRequest,
  AgentQueueRequest,
  AgentRepairPlanRequest,
  AgentRepairStatusRequest,
  AgentRenameRequest,
  AgentStatusRequest,
  AgentTaskCancelRequest,
  AgentTaskExecuteRequest,
  AgentTaskPreviewRequest,
  AgentTaskStatusRequest,
  AgentTaskVerifyRequest,
  AgentTerminalCancelRequest,
  AgentTerminalExecuteRequest,
  AgentTerminalPreviewRequest,
  AgentTerminalStatusRequest,
  AgentUndoRequest,
  AgentVerifyRequest,
  BrowserCreateRequest,
  BrowserElementActionRequest,
  BrowserFillRequest,
  BrowserNavigateRequest,
  BrowserPressRequest,
  BrowserScreenshotRequest,
  BrowserScrollRequest,
  BrowserStatusRequest
} from "../../src/types/levi-api";
import type { TaskEvent } from "../../src/types/task-api";
import type {
  DebugEvent,
  DebugEvaluateRequest,
  DebugLoadVariablesRequest,
  DebugRemoveBreakpointRequest,
  DebugSetBreakpointRequest,
  DebugSetExceptionBreakpointsRequest,
  DebugStartRequest,
  DebugUpdateWatchRequest,
  DebugCompletionRequest,
  DebugAdapterInstallRequest,
  DebugAdapterUninstallRequest,
  DebugAdapterRegisterCustomRequest,
  DebugAdapterDefinition
} from "../../src/features/debugger";
import type {
  LeviApiWithWorkspaceTree,
  WorkspaceReadPathRequest,
  WorkspaceWritePathRequest
} from "../../src/types/workspace-tree-api";

const IPC_CHANNELS = {
  ollamaGetStatus: "levi:ollama:get-status",
  projectsGetRecent: "levi:projects:get-recent",
  projectsOpenFolder: "levi:projects:open-folder",
  workspaceGetStatus: "levi:workspace:get-status",
  workspaceRefresh: "levi:workspace:refresh",
  workspaceOpenFile: "levi:workspace:open-file",
  workspaceListTree: "levi:workspace:list-tree",
  workspaceReadPath: "levi:workspace:read-path",
  workspaceWritePath: "levi:workspace:write-path",
  updatesGetStatus: "levi:updates:get-status",
  updatesCheck: "levi:updates:check",
  updatesDownload: "levi:updates:download",
  updatesInstall: "levi:updates:install",
  updatesEvent: "levi:updates:event",
  rulesGetStatus: "levi:rules:get-status",
  rulesList: "levi:rules:list",
  rulesRefresh: "levi:rules:refresh",
  rulesOpenSource: "levi:rules:open-source",
  rulesEvent: "levi:rules:event",
  editsPropose: "levi:edits:propose",
  editsCancel: "levi:edits:cancel",
  editsApply: "levi:edits:apply",
  editsReject: "levi:edits:reject",
  editsUndoLast: "levi:edits:undo-last",
  editsGetStatus: "levi:edits:get-status",
  editsEvent: "levi:edits:event",
  planningCreate: "levi:planning:create",
  planningCancel: "levi:planning:cancel",
  planningApprove: "levi:planning:approve",
  planningGetStatus: "levi:planning:get-status",
  planningEvent: "levi:planning:event",
  executionPrepare: "levi:execution:prepare",
  executionProposeStep: "levi:execution:propose-step",
  executionApplyStep: "levi:execution:apply-step",
  executionRejectStep: "levi:execution:reject-step",
  executionRegenerateStep: "levi:execution:regenerate-step",
  executionRollback: "levi:execution:rollback",
  executionKeep: "levi:execution:keep",
  executionCancel: "levi:execution:cancel",
  executionGetStatus: "levi:execution:get-status",
  executionEvent: "levi:execution:event",
  debugStart: "levi:debug:start",
  debugStop: "levi:debug:stop",
  debugStopAll: "levi:debug:stop-all",
  debugSelectSession: "levi:debug:select-session",
  debugRestart: "levi:debug:restart",
  debugPause: "levi:debug:pause",
  debugContinue: "levi:debug:continue",
  debugStepOver: "levi:debug:step-over",
  debugStepInto: "levi:debug:step-into",
  debugStepOut: "levi:debug:step-out",
  debugSetBreakpoint: "levi:debug:set-breakpoint",
  debugRemoveBreakpoint: "levi:debug:remove-breakpoint",
  debugGetBreakpoints: "levi:debug:get-breakpoints",
  debugGetState: "levi:debug:get-state",
  debugSelectConfiguration: "levi:debug:select-configuration",
  debugCreateLaunchConfig: "levi:debug:create-launch-config",
  debugAddWatch: "levi:debug:add-watch",
  debugUpdateWatch: "levi:debug:update-watch",
  debugRemoveWatch: "levi:debug:remove-watch",
  debugLoadVariables: "levi:debug:load-variables",
  debugEvaluate: "levi:debug:evaluate",
  debugClearConsole: "levi:debug:clear-console",
  debugSelectStackFrame: "levi:debug:select-stack-frame",
  debugSetExceptionBreakpoints: "levi:debug:set-exception-breakpoints",
  debugRefreshLoadedSources: "levi:debug:refresh-loaded-sources",
  debugCompletions: "levi:debug:completions",
  debugCancelEvaluations: "levi:debug:cancel-evaluations",
  debugListAdapters: "levi:debug:list-adapters",
  debugScanAdapters: "levi:debug:scan-adapters",
  debugGetAdapterStatus: "levi:debug:get-adapter-status",
  debugInstallAdapter: "levi:debug:install-adapter",
  debugUpdateAdapter: "levi:debug:update-adapter",
  debugUninstallAdapter: "levi:debug:uninstall-adapter",
  debugValidateAdapter: "levi:debug:validate-adapter",
  debugRegisterCustomAdapter: "levi:debug:register-custom-adapter",
  debugRevokeCustomAdapter: "levi:debug:revoke-custom-adapter",
  debugDismissAdapterRecommendation: "levi:debug:dismiss-adapter-recommendation",
  debugCancelAdapterInstall: "levi:debug:cancel-adapter-install",
  debugRevealAdapterLocation: "levi:debug:reveal-adapter-location",
  debugEvent: "levi:debug:event",
  devOpenProjectPath: "levi:dev:open-project-path",
  devInjectPlan: "levi:dev:inject-plan",
  devGetTimings: "levi:dev:get-timings",
  terminalCreate: "levi:terminal:create",
  terminalWrite: "levi:terminal:write",
  terminalResize: "levi:terminal:resize",
  terminalDispose: "levi:terminal:dispose",
  terminalKill: "levi:terminal:kill",
  terminalRename: "levi:terminal:rename",
  terminalList: "levi:terminal:list",
  terminalSplit: "levi:terminal:split",
  terminalRestart: "levi:terminal:restart",
  terminalGetLayout: "levi:terminal:get-layout",
  terminalSetLayout: "levi:terminal:set-layout",
  terminalRevealCwd: "levi:terminal:reveal-cwd",
  terminalData: "levi:terminal:data",
  browserCreate: "levi:browser:create",
  browserStatus: "levi:browser:status",
  browserSnapshot: "levi:browser:snapshot",
  browserNavigate: "levi:browser:navigate",
  browserClick: "levi:browser:click",
  browserFill: "levi:browser:fill",
  browserPress: "levi:browser:press",
  browserScroll: "levi:browser:scroll",
  browserScreenshot: "levi:browser:screenshot",
  browserClose: "levi:browser:close",
  tasksList: "levi:tasks:list",
  tasksRun: "levi:tasks:run",
  tasksCancel: "levi:tasks:cancel",
  tasksHistory: "levi:tasks:history",
  tasksProblems: "levi:tasks:problems",
  tasksOutput: "levi:tasks:output",
  tasksPin: "levi:tasks:pin",
  tasksEvent: "levi:tasks:event",
  runtimeList: "levi:runtime:list",
  runtimeDetect: "levi:runtime:detect",
  runtimeHealth: "levi:runtime:health",
  runtimeModels: "levi:runtime:models",
  runtimeSelect: "levi:runtime:select",
  runtimeDiagnostics: "levi:runtime:diagnostics",
  runtimeChat: "levi:runtime:chat",
  runtimeCompletion: "levi:runtime:completion",
  runtimeStream: "levi:runtime:stream",
  runtimeEmbeddings: "levi:runtime:embeddings",
  runtimePullModel: "levi:runtime:pull-model",
  runtimeDeleteModel: "levi:runtime:delete-model",
  runtimeStart: "levi:runtime:start",
  runtimeStop: "levi:runtime:stop",
  runtimeRestart: "levi:runtime:restart",
  runtimeCancel: "levi:runtime:cancel",
  chatNew: "levi:chat:new",
  chatList: "levi:chat:list",
  chatDelete: "levi:chat:delete",
  chatRename: "levi:chat:rename",
  chatDeleteMessage: "levi:chat:delete-message",
  chatFork: "levi:chat:fork",
  chatArchive: "levi:chat:archive",
  chatSearch: "levi:chat:search",
  chatContextDiscover: "levi:chat:context-discover",
  chatContextPreview: "levi:chat:context-preview",
  chatContextBudget: "levi:chat:context-budget",
  chatOpenCitation: "levi:chat:open-citation",
  chatSend: "levi:chat:send",
  chatCancel: "levi:chat:cancel",
  chatExport: "levi:chat:export",
  chatSetPanel: "levi:chat:set-panel",
  chatPin: "levi:chat:pin",
  chatEvent: "levi:chat:event",
  agentNewSession: "levi:agent:new-session",
  agentList: "levi:agent:list",
  agentDelete: "levi:agent:delete",
  agentRename: "levi:agent:rename",
  agentArchive: "levi:agent:archive",
  agentPlan: "levi:agent:plan",
  agentApprove: "levi:agent:approve",
  agentReject: "levi:agent:reject",
  agentExecute: "levi:agent:execute",
  agentUndo: "levi:agent:undo",
  agentPreview: "levi:agent:preview",
  agentQueue: "levi:agent:queue",
  agentCancel: "levi:agent:cancel",
  agentTaskPreview: "levi:agent:task-preview",
  agentTaskExecute: "levi:agent:task-execute",
  agentTaskCancel: "levi:agent:task-cancel",
  agentTaskStatus: "levi:agent:task-status",
  agentTaskVerify: "levi:agent:task-verify",
  agentTerminalPreview: "levi:agent:terminal-preview",
  agentTerminalExecute: "levi:agent:terminal-execute",
  agentTerminalCancel: "levi:agent:terminal-cancel",
  agentTerminalStatus: "levi:agent:terminal-status",
  agentGitPreview: "levi:agent:git-preview",
  agentGitExecute: "levi:agent:git-execute",
  agentGitStatus: "levi:agent:git-status",
  agentVerify: "levi:agent:verify",
  agentRepairPlan: "levi:agent:repair-plan",
  agentRepairStatus: "levi:agent:repair-status",
  agentBrowserPreview: "levi:agent:browser-preview",
  agentBrowserExecute: "levi:agent:browser-execute",
  agentBrowserStatus: "levi:agent:browser-status",
  agentStatus: "levi:agent:status",
  agentEvent: "levi:agent:event",
  conversationStart: "levi:conversation:start",
  conversationCancel: "levi:conversation:cancel",
  conversationEvent: "levi:conversation:event"
} as const;

function isTerminalDataEvent(value: unknown): value is TerminalDataEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<TerminalDataEvent>;
  return typeof event.id === "string" && typeof event.data === "string";
}

function isTaskEvent(value: unknown): value is TaskEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<TaskEvent>;
  return event.type === "output" || event.type === "status" || event.type === "problems" || event.type === "output-entry";
}

function isConversationStreamEvent(value: unknown): value is ConversationStreamEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<ConversationStreamEvent>;
  if (typeof event.requestId !== "string" || typeof event.type !== "string") return false;
  if (event.type === "chunk") return typeof (event as { content?: unknown }).content === "string";
  if (event.type === "done") return true;
  if (event.type === "stopped") {
    const reason = (event as { reason?: unknown }).reason;
    return reason === "user" || reason === "window-closed";
  }
  if (event.type === "citations") return Array.isArray((event as { citations?: unknown }).citations);
  if (event.type === "error") {
    const error = event as { code?: unknown; message?: unknown; recoverable?: unknown };
    return typeof error.code === "string" && typeof error.message === "string" && typeof error.recoverable === "boolean";
  }
  return false;
}

function isEditStreamEvent(value: unknown): value is EditStreamEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<EditStreamEvent>;
  if (typeof event.type !== "string") return false;
  if (event.type === "status") {
    return typeof (event as { requestId?: unknown }).requestId === "string" && typeof (event as { message?: unknown }).message === "string";
  }
  if (event.type === "proposal") {
    const proposalEvent = event as { requestId?: unknown; proposal?: unknown };
    return typeof proposalEvent.requestId === "string" && typeof proposalEvent.proposal === "object";
  }
  if (event.type === "rejected" || event.type === "applied") return typeof (event as { proposalId?: unknown }).proposalId === "string";
  if (event.type === "undone") return typeof (event as { relativePath?: unknown }).relativePath === "string";
  if (event.type === "error") {
    const error = event as { code?: unknown; message?: unknown; recoverable?: unknown };
    return typeof error.code === "string" && typeof error.message === "string" && typeof error.recoverable === "boolean";
  }
  return false;
}

function isPlanningStreamEvent(value: unknown): value is PlanningStreamEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<PlanningStreamEvent>;
  if (typeof event.type !== "string") return false;
  if (event.type === "status") {
    return typeof (event as { requestId?: unknown }).requestId === "string" && typeof (event as { message?: unknown }).message === "string";
  }
  if (event.type === "plan") {
    const planEvent = event as { requestId?: unknown; plan?: unknown };
    return typeof planEvent.requestId === "string" && typeof planEvent.plan === "object";
  }
  if (event.type === "approved") {
    const approved = event as { planId?: unknown; message?: unknown; transaction?: unknown };
    return typeof approved.planId === "string" && typeof approved.message === "string" && typeof approved.transaction === "object";
  }
  if (event.type === "stopped") {
    const stopped = event as { requestId?: unknown; reason?: unknown };
    return typeof stopped.requestId === "string" && (stopped.reason === "user" || stopped.reason === "window-closed");
  }
  if (event.type === "error") {
    const error = event as { code?: unknown; message?: unknown; recoverable?: unknown };
    return typeof error.code === "string" && typeof error.message === "string" && typeof error.recoverable === "boolean";
  }
  return false;
}

function isProjectRulesStreamEvent(value: unknown): value is ProjectRulesStreamEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<ProjectRulesStreamEvent>;
  if (event.type === "status") return typeof (event as { status?: { state?: unknown } }).status?.state === "string";
  if (event.type === "updated") return typeof (event as { result?: unknown }).result === "object";
  return false;
}

function isUpdateStatusEvent(value: unknown): value is UpdateStatusEvent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const event = value as Partial<UpdateStatusEvent>;
  const status = event.status as { state?: unknown; currentVersion?: unknown; progressPercent?: unknown } | undefined;
  return (
    event.type === "status" &&
    Boolean(status) &&
    typeof status?.state === "string" &&
    ["idle", "checking", "update-available", "update-not-available", "downloading", "downloaded", "error"].includes(status.state) &&
    typeof status.currentVersion === "string" &&
    (status.progressPercent === undefined || typeof status.progressPercent === "number")
  );
}

function isExecutionStreamEvent(value: unknown): value is ExecutionStreamEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<ExecutionStreamEvent>;
  if (typeof event.type !== "string") return false;
  if (event.type === "status") {
    return typeof (event as { transactionId?: unknown }).transactionId === "string" && typeof (event as { message?: unknown }).message === "string";
  }
  if (event.type === "prepared" || event.type === "kept" || event.type === "cancelled") {
    return typeof (event as { transaction?: unknown }).transaction === "object";
  }
  if (event.type === "proposal" || event.type === "applied" || event.type === "rolled-back") {
    return typeof (event as { transactionId?: unknown }).transactionId === "string";
  }
  if (event.type === "stopped") {
    const stopped = event as { transactionId?: unknown; reason?: unknown };
    return typeof stopped.transactionId === "string" && (stopped.reason === "user" || stopped.reason === "window-closed");
  }
  if (event.type === "error") {
    const error = event as { code?: unknown; message?: unknown; recoverable?: unknown };
    return typeof error.code === "string" && typeof error.message === "string" && typeof error.recoverable === "boolean";
  }
  return false;
}

function isDebugState(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const state = value as {
    state?: unknown;
    breakpoints?: unknown;
    watches?: unknown;
    variables?: unknown;
    callStack?: unknown;
    console?: unknown;
    exceptionBreakpoints?: unknown;
    inlineValues?: unknown;
    evaluationCache?: unknown;
  };
  return (
    typeof state.state === "string" &&
    ["Idle", "Starting", "Running", "Paused", "Stopping", "Stopped", "Terminated"].includes(state.state) &&
    Array.isArray(state.breakpoints) &&
    Array.isArray(state.watches) &&
    Array.isArray(state.variables) &&
    Array.isArray(state.callStack) &&
    Array.isArray((state as { launchConfigurations?: unknown }).launchConfigurations) &&
    Array.isArray((state as { loadedSources?: unknown }).loadedSources) &&
    Array.isArray(state.console) &&
    Array.isArray(state.exceptionBreakpoints) &&
    Array.isArray(state.inlineValues) &&
    Array.isArray(state.evaluationCache) &&
    Array.isArray((state as { adapters?: unknown }).adapters) &&
    Array.isArray((state as { adapterRecommendations?: unknown }).adapterRecommendations)
  );
}

function isDebugEvent(value: unknown): value is DebugEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as { type?: unknown; state?: unknown; error?: unknown; entry?: unknown; result?: unknown };
  if (event.type === "state") return isDebugState(event.state);
  if (event.type === "console") return isDebugState(event.state) && typeof event.entry === "object";
  if (event.type === "navigation") return isDebugState(event.state) && typeof (event as { frame?: unknown }).frame === "object";
  if (event.type === "evaluation") return isDebugState(event.state) && typeof event.result === "object";
  if (event.type === "adapter-progress") return isDebugState(event.state) && typeof (event as { progress?: unknown }).progress === "object";
  if (event.type === "error") {
    const error = event.error as { code?: unknown; message?: unknown; recoverable?: unknown } | undefined;
    return (
      isDebugState(event.state) &&
      Boolean(error) &&
      typeof error?.code === "string" &&
      typeof error.message === "string" &&
      typeof error.recoverable === "boolean"
    );
  }
  return false;
}

const leviApi: LeviApiWithWorkspaceTree = {
  ollama: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.ollamaGetStatus)
  },
  projects: {
    getRecent: () => ipcRenderer.invoke(IPC_CHANNELS.projectsGetRecent),
    openFolder: () => ipcRenderer.invoke(IPC_CHANNELS.projectsOpenFolder)
  },
  workspace: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceGetStatus),
    refresh: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceRefresh),
    openFile: (request: WorkspaceOpenFileRequest) => ipcRenderer.invoke(IPC_CHANNELS.workspaceOpenFile, request),
    listTree: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceListTree),
    readPath: (request: WorkspaceReadPathRequest) => ipcRenderer.invoke(IPC_CHANNELS.workspaceReadPath, request),
    writePath: (request: WorkspaceWritePathRequest) => ipcRenderer.invoke(IPC_CHANNELS.workspaceWritePath, request)
  },
  updates: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.updatesGetStatus),
    checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.updatesCheck),
    downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.updatesDownload),
    installDownloadedUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.updatesInstall),
    onEvent: (listener: (event: UpdateStatusEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        if (isUpdateStatusEvent(payload)) {
          listener(payload);
        }
      };
      ipcRenderer.on(IPC_CHANNELS.updatesEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.updatesEvent, handler);
    }
  },
  rules: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.rulesGetStatus),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.rulesList),
    refresh: () => ipcRenderer.invoke(IPC_CHANNELS.rulesRefresh),
    openSource: (request: ProjectRuleOpenSourceRequest) => ipcRenderer.invoke(IPC_CHANNELS.rulesOpenSource, request),
    onEvent: (listener: (event: ProjectRulesStreamEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        if (isProjectRulesStreamEvent(payload)) listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.rulesEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.rulesEvent, handler);
    }
  },
  edits: {
    propose: (request: EditProposeRequest) => ipcRenderer.invoke(IPC_CHANNELS.editsPropose, request),
    cancel: (requestId: string) => ipcRenderer.invoke(IPC_CHANNELS.editsCancel, requestId),
    apply: (proposalId: string) => ipcRenderer.invoke(IPC_CHANNELS.editsApply, proposalId),
    reject: (proposalId: string) => ipcRenderer.invoke(IPC_CHANNELS.editsReject, proposalId),
    undoLast: () => ipcRenderer.invoke(IPC_CHANNELS.editsUndoLast),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.editsGetStatus),
    onEvent: (listener: (event: EditStreamEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        if (isEditStreamEvent(payload)) listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.editsEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.editsEvent, handler);
    }
  },
  planning: {
    create: (request: PlanningCreateRequest) => ipcRenderer.invoke(IPC_CHANNELS.planningCreate, request),
    cancel: (requestId: string) => ipcRenderer.invoke(IPC_CHANNELS.planningCancel, requestId),
    approve: (planId: string) => ipcRenderer.invoke(IPC_CHANNELS.planningApprove, planId),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.planningGetStatus),
    onEvent: (listener: (event: PlanningStreamEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        if (isPlanningStreamEvent(payload)) listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.planningEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.planningEvent, handler);
    }
  },
  execution: {
    prepare: (planId: string) => ipcRenderer.invoke(IPC_CHANNELS.executionPrepare, planId),
    proposeStep: (transactionId: string) => ipcRenderer.invoke(IPC_CHANNELS.executionProposeStep, transactionId),
    applyStep: (transactionId: string) => ipcRenderer.invoke(IPC_CHANNELS.executionApplyStep, transactionId),
    rejectStep: (transactionId: string) => ipcRenderer.invoke(IPC_CHANNELS.executionRejectStep, transactionId),
    regenerateStep: (transactionId: string) => ipcRenderer.invoke(IPC_CHANNELS.executionRegenerateStep, transactionId),
    rollback: (transactionId: string) => ipcRenderer.invoke(IPC_CHANNELS.executionRollback, transactionId),
    keep: (transactionId: string) => ipcRenderer.invoke(IPC_CHANNELS.executionKeep, transactionId),
    cancel: (transactionId: string) => ipcRenderer.invoke(IPC_CHANNELS.executionCancel, transactionId),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.executionGetStatus),
    onEvent: (listener: (event: ExecutionStreamEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        if (isExecutionStreamEvent(payload)) listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.executionEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.executionEvent, handler);
    }
  },
  debug: {
    start: (request: DebugStartRequest) => ipcRenderer.invoke(IPC_CHANNELS.debugStart, request),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.debugStop),
    stopAll: () => ipcRenderer.invoke(IPC_CHANNELS.debugStopAll),
    selectSession: (sessionId: string) => ipcRenderer.invoke(IPC_CHANNELS.debugSelectSession, sessionId),
    restart: () => ipcRenderer.invoke(IPC_CHANNELS.debugRestart),
    pause: () => ipcRenderer.invoke(IPC_CHANNELS.debugPause),
    continue: () => ipcRenderer.invoke(IPC_CHANNELS.debugContinue),
    stepOver: () => ipcRenderer.invoke(IPC_CHANNELS.debugStepOver),
    stepInto: () => ipcRenderer.invoke(IPC_CHANNELS.debugStepInto),
    stepOut: () => ipcRenderer.invoke(IPC_CHANNELS.debugStepOut),
    setBreakpoint: (request: DebugSetBreakpointRequest) => ipcRenderer.invoke(IPC_CHANNELS.debugSetBreakpoint, request),
    removeBreakpoint: (request: DebugRemoveBreakpointRequest) => ipcRenderer.invoke(IPC_CHANNELS.debugRemoveBreakpoint, request),
    getBreakpoints: () => ipcRenderer.invoke(IPC_CHANNELS.debugGetBreakpoints),
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.debugGetState),
    selectConfiguration: (name: string) => ipcRenderer.invoke(IPC_CHANNELS.debugSelectConfiguration, name),
    createLaunchConfig: () => ipcRenderer.invoke(IPC_CHANNELS.debugCreateLaunchConfig),
    addWatch: (expression: string) => ipcRenderer.invoke(IPC_CHANNELS.debugAddWatch, expression),
    updateWatch: (request: DebugUpdateWatchRequest) => ipcRenderer.invoke(IPC_CHANNELS.debugUpdateWatch, request),
    removeWatch: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.debugRemoveWatch, id),
    loadVariables: (request: DebugLoadVariablesRequest) => ipcRenderer.invoke(IPC_CHANNELS.debugLoadVariables, request),
    evaluate: (request: DebugEvaluateRequest) => ipcRenderer.invoke(IPC_CHANNELS.debugEvaluate, request),
    clearConsole: () => ipcRenderer.invoke(IPC_CHANNELS.debugClearConsole),
    selectStackFrame: (request: { threadId: number; frameId: number }) => ipcRenderer.invoke(IPC_CHANNELS.debugSelectStackFrame, request),
    setExceptionBreakpoints: (request: DebugSetExceptionBreakpointsRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.debugSetExceptionBreakpoints, request),
    refreshLoadedSources: () => ipcRenderer.invoke(IPC_CHANNELS.debugRefreshLoadedSources),
    getCompletions: (request: DebugCompletionRequest) => ipcRenderer.invoke(IPC_CHANNELS.debugCompletions, request),
    cancelEvaluations: () => ipcRenderer.invoke(IPC_CHANNELS.debugCancelEvaluations),
    listAdapters: () => ipcRenderer.invoke(IPC_CHANNELS.debugListAdapters) as Promise<DebugAdapterDefinition[]>,
    scanAdapters: () => ipcRenderer.invoke(IPC_CHANNELS.debugScanAdapters),
    getAdapterStatus: (adapterId: string) => ipcRenderer.invoke(IPC_CHANNELS.debugGetAdapterStatus, adapterId),
    installAdapter: (request: DebugAdapterInstallRequest) => ipcRenderer.invoke(IPC_CHANNELS.debugInstallAdapter, request),
    updateAdapter: (request: DebugAdapterInstallRequest) => ipcRenderer.invoke(IPC_CHANNELS.debugUpdateAdapter, request),
    uninstallAdapter: (request: DebugAdapterUninstallRequest) => ipcRenderer.invoke(IPC_CHANNELS.debugUninstallAdapter, request),
    validateAdapter: (adapterId: string) => ipcRenderer.invoke(IPC_CHANNELS.debugValidateAdapter, adapterId),
    registerCustomAdapter: (request: DebugAdapterRegisterCustomRequest) =>
      ipcRenderer.invoke(IPC_CHANNELS.debugRegisterCustomAdapter, request),
    revokeCustomAdapter: (adapterId: string) => ipcRenderer.invoke(IPC_CHANNELS.debugRevokeCustomAdapter, adapterId),
    dismissAdapterRecommendation: (adapterId: string) => ipcRenderer.invoke(IPC_CHANNELS.debugDismissAdapterRecommendation, adapterId),
    cancelAdapterInstall: () => ipcRenderer.invoke(IPC_CHANNELS.debugCancelAdapterInstall),
    revealAdapterLocation: (adapterId: string) => ipcRenderer.invoke(IPC_CHANNELS.debugRevealAdapterLocation, adapterId),
    onEvent: (listener: (event: DebugEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        if (isDebugEvent(payload)) listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.debugEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.debugEvent, handler);
    }
  },
  terminal: {
    create: (request: TerminalCreateRequest) => ipcRenderer.invoke(IPC_CHANNELS.terminalCreate, request),
    write: (id: string, data: string) => ipcRenderer.invoke(IPC_CHANNELS.terminalWrite, id, data),
    resize: (request: TerminalResizeRequest) => ipcRenderer.invoke(IPC_CHANNELS.terminalResize, request),
    dispose: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.terminalDispose, id),
    kill: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.terminalKill, id),
    rename: (request: TerminalRenameRequest) => ipcRenderer.invoke(IPC_CHANNELS.terminalRename, request),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.terminalList),
    split: (request: TerminalSplitRequest) => ipcRenderer.invoke(IPC_CHANNELS.terminalSplit, request),
    restart: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.terminalRestart, id),
    getLayout: () => ipcRenderer.invoke(IPC_CHANNELS.terminalGetLayout),
    setLayout: (layout: TerminalLayoutState) => ipcRenderer.invoke(IPC_CHANNELS.terminalSetLayout, layout),
    revealCwd: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.terminalRevealCwd, id),
    onData: (listener: (event: TerminalDataEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        if (isTerminalDataEvent(payload)) listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.terminalData, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.terminalData, handler);
    }
  },
  tasks: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.tasksList),
    run: (request: { taskId: string }) => ipcRenderer.invoke(IPC_CHANNELS.tasksRun, request),
    cancel: (request: { runId: string }) => ipcRenderer.invoke(IPC_CHANNELS.tasksCancel, request),
    history: () => ipcRenderer.invoke(IPC_CHANNELS.tasksHistory),
    problems: () => ipcRenderer.invoke(IPC_CHANNELS.tasksProblems),
    output: (request?: { source?: string; channel?: string }) => ipcRenderer.invoke(IPC_CHANNELS.tasksOutput, request),
    pin: (request: { taskId: string; pinned: boolean }) => ipcRenderer.invoke(IPC_CHANNELS.tasksPin, request),
    onEvent: (listener: (event: TaskEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        if (isTaskEvent(payload)) listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.tasksEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.tasksEvent, handler);
    }
  },
  runtime: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.runtimeList),
    detect: () => ipcRenderer.invoke(IPC_CHANNELS.runtimeDetect),
    health: (providerId?: AIRuntimeProviderId) => ipcRenderer.invoke(IPC_CHANNELS.runtimeHealth, providerId),
    models: (providerId?: AIRuntimeProviderId) => ipcRenderer.invoke(IPC_CHANNELS.runtimeModels, providerId),
    select: (request: AIRuntimeSelectRequest) => ipcRenderer.invoke(IPC_CHANNELS.runtimeSelect, request),
    diagnostics: () => ipcRenderer.invoke(IPC_CHANNELS.runtimeDiagnostics),
    chat: (request: AIRuntimeRequest) => ipcRenderer.invoke(IPC_CHANNELS.runtimeChat, request),
    completion: (request: AIRuntimeRequest) => ipcRenderer.invoke(IPC_CHANNELS.runtimeCompletion, request),
    stream: (request: AIRuntimeRequest) => ipcRenderer.invoke(IPC_CHANNELS.runtimeStream, request),
    embeddings: (request: AIRuntimeRequest) => ipcRenderer.invoke(IPC_CHANNELS.runtimeEmbeddings, request),
    pullModel: (request: AIRuntimeModelOperationRequest) => ipcRenderer.invoke(IPC_CHANNELS.runtimePullModel, request),
    deleteModel: (request: AIRuntimeModelOperationRequest) => ipcRenderer.invoke(IPC_CHANNELS.runtimeDeleteModel, request),
    start: (request: AIRuntimeLifecycleRequest) => ipcRenderer.invoke(IPC_CHANNELS.runtimeStart, request),
    stop: (request: AIRuntimeLifecycleRequest) => ipcRenderer.invoke(IPC_CHANNELS.runtimeStop, request),
    restart: (request: AIRuntimeLifecycleRequest) => ipcRenderer.invoke(IPC_CHANNELS.runtimeRestart, request),
    cancel: (request: { requestId: string }) => ipcRenderer.invoke(IPC_CHANNELS.runtimeCancel, request)
  },
  chat: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.chatList),
    new: (request?: AIChatNewRequest) => ipcRenderer.invoke(IPC_CHANNELS.chatNew, request ?? {}),
    delete: (request: AIChatDeleteRequest) => ipcRenderer.invoke(IPC_CHANNELS.chatDelete, request),
    rename: (request: AIChatRenameRequest) => ipcRenderer.invoke(IPC_CHANNELS.chatRename, request),
    deleteMessage: (request: AIChatDeleteMessageRequest) => ipcRenderer.invoke(IPC_CHANNELS.chatDeleteMessage, request),
    fork: (request: AIChatForkRequest) => ipcRenderer.invoke(IPC_CHANNELS.chatFork, request),
    archive: (request: AIChatArchiveRequest) => ipcRenderer.invoke(IPC_CHANNELS.chatArchive, request),
    search: (request: AIChatSearchRequest) => ipcRenderer.invoke(IPC_CHANNELS.chatSearch, request),
    discoverContext: () => ipcRenderer.invoke(IPC_CHANNELS.chatContextDiscover),
    previewContext: (request: AIChatContextPreviewRequest) => ipcRenderer.invoke(IPC_CHANNELS.chatContextPreview, request),
    budget: (request: AIChatBudgetRequest) => ipcRenderer.invoke(IPC_CHANNELS.chatContextBudget, request),
    openCitation: (request: AIChatOpenCitationRequest) => ipcRenderer.invoke(IPC_CHANNELS.chatOpenCitation, request),
    send: (request: AIChatSendRequest) => ipcRenderer.invoke(IPC_CHANNELS.chatSend, request),
    cancel: (request: AIChatCancelRequest) => ipcRenderer.invoke(IPC_CHANNELS.chatCancel, request),
    export: (request: AIChatExportRequest) => ipcRenderer.invoke(IPC_CHANNELS.chatExport, request),
    setPanel: (request: AIChatSetPanelRequest) => ipcRenderer.invoke(IPC_CHANNELS.chatSetPanel, request),
    pin: (request: AIChatDeleteRequest) => ipcRenderer.invoke(IPC_CHANNELS.chatPin, request),
    onEvent: (listener: (event: AIChatEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: AIChatEvent) => listener(payload);
      ipcRenderer.on(IPC_CHANNELS.chatEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.chatEvent, handler);
    }
  },
  agent: {
    newSession: (request?: AgentNewSessionRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentNewSession, request ?? {}),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.agentList),
    delete: (request: AgentDeleteRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentDelete, request),
    rename: (request: AgentRenameRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentRename, request),
    archive: (request: AgentArchiveRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentArchive, request),
    plan: (request: AgentPlanRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentPlan, request),
    approve: (request: AgentApprovalRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentApprove, request),
    reject: (request: AgentApprovalRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentReject, request),
    preview: (request: AgentPreviewRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentPreview, request),
    execute: (request: AgentExecuteRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentExecute, request),
    undo: (request: AgentUndoRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentUndo, request),
    queue: (request: AgentQueueRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentQueue, request),
    cancel: (request: AgentCancelRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentCancel, request),
    taskPreview: (request: AgentTaskPreviewRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentTaskPreview, request),
    taskExecute: (request: AgentTaskExecuteRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentTaskExecute, request),
    taskCancel: (request: AgentTaskCancelRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentTaskCancel, request),
    taskStatus: (request: AgentTaskStatusRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentTaskStatus, request),
    taskVerify: (request: AgentTaskVerifyRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentTaskVerify, request),
    terminalPreview: (request: AgentTerminalPreviewRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentTerminalPreview, request),
    terminalExecute: (request: AgentTerminalExecuteRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentTerminalExecute, request),
    terminalCancel: (request: AgentTerminalCancelRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentTerminalCancel, request),
    terminalStatus: (request: AgentTerminalStatusRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentTerminalStatus, request),
    gitPreview: (request: AgentGitPreviewRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentGitPreview, request),
    gitExecute: (request: AgentGitExecuteRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentGitExecute, request),
    gitStatus: (request: AgentGitStatusRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentGitStatus, request),
    verify: (request: AgentVerifyRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentVerify, request),
    repairPlan: (request: AgentRepairPlanRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentRepairPlan, request),
    repairStatus: (request: AgentRepairStatusRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentRepairStatus, request),
    browserPreview: (request: AgentBrowserPreviewRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentBrowserPreview, request),
    browserExecute: (request: AgentBrowserExecuteRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentBrowserExecute, request),
    browserStatus: (request: AgentBrowserStatusRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentBrowserStatus, request),
    status: (request?: AgentStatusRequest) => ipcRenderer.invoke(IPC_CHANNELS.agentStatus, request ?? {}),
    onEvent: (listener: (event: AgentEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: AgentEvent) => listener(payload);
      ipcRenderer.on(IPC_CHANNELS.agentEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.agentEvent, handler);
    }
  },
  browser: {
    create: (request?: BrowserCreateRequest) => ipcRenderer.invoke(IPC_CHANNELS.browserCreate, request ?? {}),
    status: (request?: BrowserStatusRequest) => ipcRenderer.invoke(IPC_CHANNELS.browserStatus, request ?? {}),
    snapshot: (request: { sessionId: string }) => ipcRenderer.invoke(IPC_CHANNELS.browserSnapshot, request),
    navigate: (request: BrowserNavigateRequest) => ipcRenderer.invoke(IPC_CHANNELS.browserNavigate, request),
    click: (request: BrowserElementActionRequest) => ipcRenderer.invoke(IPC_CHANNELS.browserClick, request),
    fill: (request: BrowserFillRequest) => ipcRenderer.invoke(IPC_CHANNELS.browserFill, request),
    press: (request: BrowserPressRequest) => ipcRenderer.invoke(IPC_CHANNELS.browserPress, request),
    scroll: (request: BrowserScrollRequest) => ipcRenderer.invoke(IPC_CHANNELS.browserScroll, request),
    screenshot: (request: BrowserScreenshotRequest) => ipcRenderer.invoke(IPC_CHANNELS.browserScreenshot, request),
    close: (request: { sessionId: string }) => ipcRenderer.invoke(IPC_CHANNELS.browserClose, request)
  },
  conversation: {
    start: (request: ConversationStartRequest) => ipcRenderer.invoke(IPC_CHANNELS.conversationStart, request),
    cancel: (requestId: string) => ipcRenderer.invoke(IPC_CHANNELS.conversationCancel, requestId),
    onEvent: (listener: (event: ConversationStreamEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        if (isConversationStreamEvent(payload)) listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.conversationEvent, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.conversationEvent, handler);
    }
  },
  dev: {
    openProjectPath: (directoryPath: string) => ipcRenderer.invoke(IPC_CHANNELS.devOpenProjectPath, directoryPath),
    injectPlan: (plan: unknown) => ipcRenderer.invoke(IPC_CHANNELS.devInjectPlan, plan),
    getTimings: () => ipcRenderer.invoke(IPC_CHANNELS.devGetTimings)
  }
};

contextBridge.exposeInMainWorld("levi", leviApi);
