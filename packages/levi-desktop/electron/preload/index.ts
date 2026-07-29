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
  TerminalResizeRequest,
  WorkspaceOpenFileRequest
} from "../../src/types/levi-api";
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
  devOpenProjectPath: "levi:dev:open-project-path",
  devInjectPlan: "levi:dev:inject-plan",
  devGetTimings: "levi:dev:get-timings",
  terminalCreate: "levi:terminal:create",
  terminalWrite: "levi:terminal:write",
  terminalResize: "levi:terminal:resize",
  terminalDispose: "levi:terminal:dispose",
  terminalData: "levi:terminal:data",
  conversationStart: "levi:conversation:start",
  conversationCancel: "levi:conversation:cancel",
  conversationEvent: "levi:conversation:event"
} as const;

function isTerminalDataEvent(value: unknown): value is TerminalDataEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<TerminalDataEvent>;
  return typeof event.id === "string" && typeof event.data === "string";
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
  terminal: {
    create: (request: TerminalCreateRequest) => ipcRenderer.invoke(IPC_CHANNELS.terminalCreate, request),
    write: (id: string, data: string) => ipcRenderer.invoke(IPC_CHANNELS.terminalWrite, id, data),
    resize: (request: TerminalResizeRequest) => ipcRenderer.invoke(IPC_CHANNELS.terminalResize, request),
    dispose: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.terminalDispose, id),
    onData: (listener: (event: TerminalDataEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        if (isTerminalDataEvent(payload)) listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.terminalData, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.terminalData, handler);
    }
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
