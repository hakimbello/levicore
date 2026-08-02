import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { IPC_CHANNELS } from "./ipc-channels";
import type {
  ConversationErrorCode,
  ConversationMessage,
  ConversationStartRequest,
  ConversationStreamEvent,
  EditErrorCode,
  EditProposeRequest,
  EditStatus,
  EditStreamEvent,
  ExecutionErrorCode,
  ExecutionPlan,
  ExecutionStreamEvent,
  OllamaStatus,
  PlanningApproveResult,
  PlanningCreateRequest,
  PlanningErrorCode,
  PlanningStatus,
  PlanningStreamEvent,
  ProjectRule,
  ProjectRulesListResult,
  ProjectRulesStatus,
  ProjectRulesStreamEvent,
  SelectedProject,
  UpdateStatusEvent,
  WorkspaceStatus
} from "../../src/types/levi-api";
import {
  DEFAULT_CONVERSATION_MODEL as DEFAULT_CHAT_MODEL,
  DEFAULT_EDIT_MODEL,
  MAX_CONVERSATION_MESSAGE_LENGTH as MAX_CHAT_MESSAGE_LENGTH
} from "../../src/types/levi-api";
import {
  applyInternalProposal,
  asWorkspaceOpenFile,
  buildEditGenerationPrompt,
  createInternalProposal,
  hashContent,
  isLikelyEditRequest,
  isUnsupportedEditScope,
  parseStructuredEditOutput,
  publicProposal,
  readEditableTarget,
  selectEditTarget,
  undoLastEdit,
  validateStructuredEdit,
  type InternalEditProposal,
  type UndoRecord
} from "./edit-context";
import {
  citationsFromSources,
  createWorkspaceStatus,
  isWorkspaceQuestion,
  normalizeSlashes,
  openWorkspaceFileFromSource,
  retrieveWorkspaceContext,
  scanWorkspace,
  type WorkspaceScan,
  type WorkspaceSource
} from "./workspace-context";
import {
  PLANNING_LIMITS,
  buildPlanningPrompt,
  createExecutionPlan,
  discoverPlanningCandidates,
  isPlanningRequest,
  parsePlanningModelOutput,
  type PlanningCandidate
} from "./planning-context";
import {
  applyStep,
  cancelTransaction,
  getActiveTransactionForRoot,
  keepTransaction,
  prepareExecutionTransaction,
  proposeStepContent,
  publicExecutionProposal,
  publicExecutionTransaction,
  registerExecutionTransaction,
  rejectStepProposal,
  rollbackTransaction,
  unregisterExecutionTransaction,
  validateExecutionPreconditions,
  type InternalExecutionTransaction
} from "./execution-context";
import {
  buildActiveRuleContext,
  buildProjectRulesCache,
  formatActiveRuleContextForPrompt,
  openRuleSourceFromId,
  type ProjectRulesCache
} from "./project-rules-context";
import { DesktopDebugService } from "./debug-service";
import { AdapterManager } from "./adapter-manager";
import { DesktopRuntimeService } from "./runtime-service";
import { RuntimeManager } from "./ai-runtime";
import { ChatService } from "./chat-service";
import { AgentService } from "./agent-service";
import { UpdateService } from "./update-service";
import { TerminalManager } from "./terminal-manager";
import { TaskService } from "./tasks/task-service";
import { registerDebugTaskRunner } from "./debug-tasks";
import type { DebugEvent } from "../../src/features/debugger";
import type { AIChatEvent } from "../../src/features/ai-chat";
import type { AgentEvent } from "../../src/features/agent";

const OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags";
const OLLAMA_CHAT_URL = "http://127.0.0.1:11434/api/chat";
const TRUSTED_MODEL_NAMES = new Set(["qwen3.6:latest", "qwen2.5-coder:7b"]);
const SETTINGS_FILE = "desktop-shell.json";
const MAX_CONVERSATION_MESSAGES = 40;
const EDIT_TIMEOUT_MS = 240000;
const PLANNING_TIMEOUT_MS = 180000;
const EXECUTION_TIMEOUT_MS = 240000;
const desktopRuntimeService = new DesktopRuntimeService({ repositoryRoot: getRepositoryRoot() });
const aiRuntimeManager = new RuntimeManager();
const chatService = new ChatService(aiRuntimeManager, { emit: sendChatEvent });
const agentService = new AgentService(aiRuntimeManager, {
  emit: sendAgentEvent,
  getWorkspaceRoot: () => workspaceScan?.rootRealPath ?? selectedProject?.path ?? null,
  getWorkspaceStatus: () => workspaceStatus
});
const updateService = new UpdateService();
const terminalManager = new TerminalManager(
  () => workspaceScan?.rootRealPath ?? selectedProject?.path ?? null,
  getRepositoryRoot
);
const taskService = new TaskService(
  terminalManager,
  () => workspaceScan?.rootRealPath ?? selectedProject?.path ?? null,
  () => workspaceScan?.summary
);
terminalManager.onTerminalData((sessionId, data) => {
  taskService.bindTerminalOutput(sessionId, data);
});
const legacyChatRequestsByWindow = new Map<number, { requestId: string; conversationId: string }>();
const legacyChatConversationsByWindow = new Map<number, string>();
const legacyChatWindowByRequest = new Map<string, number>();
const activeEditGenerations = new Map<number, { requestId: string; controller: AbortController; stoppedByUser: boolean }>();
const activePlanningGenerations = new Map<number, { requestId: string; controller: AbortController; stoppedByUser: boolean }>();
const citationSourcesByWindow = new Map<number, Map<string, WorkspaceSource>>();
const editProposalsByWindow = new Map<number, Map<string, InternalEditProposal>>();
const undoByWindow = new Map<number, UndoRecord>();
const latestPlanByWindow = new Map<number, ExecutionPlan>();
const executionTransactionsByRoot = new Map<string, InternalExecutionTransaction>();
const executionPlansByTransaction = new Map<string, ExecutionPlan>();
const executionTransactionByWindow = new Map<number, string>();
const activeExecutionGenerations = new Map<number, { transactionId: string; controller: AbortController; stoppedByUser: boolean }>();
let projectRulesCache: ProjectRulesCache | null = null;
let projectRulesStatus: ProjectRulesStatus = {
  state: "idle",
  guidanceFileCount: 0,
  activeRuleCount: 0,
  conflictCount: 0,
  suspiciousCount: 0,
  timings: {
    discoveryMs: 0,
    extractionMs: 0,
    enrichmentMs: 0,
    activeContextMs: 0
  }
};
let activeProjectRulesScan: Promise<ProjectRulesListResult> | null = null;
let mainWindow: BrowserWindow | null = null;
let selectedProject: SelectedProject | null = null;
let workspaceScan: WorkspaceScan | null = null;
let workspaceStatus: WorkspaceStatus = createWorkspaceStatus("idle");
let activeWorkspaceScan: Promise<WorkspaceStatus> | null = null;
const debugService = new DesktopDebugService(
  () => workspaceScan?.rootRealPath ?? selectedProject?.path ?? null,
  new AdapterManager(() => workspaceScan?.rootRealPath ?? selectedProject?.path ?? null)
);

function getRepositoryRoot(): string {
  if (process.env.LEVI_REPO_ROOT && path.isAbsolute(process.env.LEVI_REPO_ROOT)) {
    return process.env.LEVI_REPO_ROOT;
  }
  return path.resolve(app.getAppPath(), "..", "..");
}

function getSettingsPath(): string {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

async function readRecentProject(): Promise<SelectedProject | null> {
  try {
    const raw = await fs.readFile(getSettingsPath(), "utf8");
    const parsed = JSON.parse(raw) as { recentProject?: unknown };
    if (isSelectedProject(parsed.recentProject)) {
      selectedProject = parsed.recentProject;
      return parsed.recentProject;
    }
  } catch {
    return null;
  }
  return null;
}

async function writeRecentProject(project: SelectedProject): Promise<void> {
  await fs.mkdir(path.dirname(getSettingsPath()), { recursive: true });
  await fs.writeFile(getSettingsPath(), JSON.stringify({ recentProject: project }, null, 2), "utf8");
}

function isSelectedProject(value: unknown): value is SelectedProject {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SelectedProject>;
  return typeof candidate.path === "string" && path.isAbsolute(candidate.path) && typeof candidate.name === "string";
}

async function openProjectAtPath(directoryPath: string): Promise<SelectedProject | null> {
  if (workspaceScan && getActiveTransactionForRoot(executionTransactionsByRoot, workspaceScan.rootRealPath)) {
    throw new Error("Finish or cancel the active execution transaction before switching workspaces.");
  }
  const project = await validateDirectory(directoryPath);
  if (!project) {
    return null;
  }
  selectedProject = project;
  await writeRecentProject(project);
  await refreshWorkspace();
  return project;
}

function liveAcceptanceEnabled(): boolean {
  return process.env.LEVI_LIVE_ACCEPTANCE === "1" && Boolean(process.env.VITE_DEV_SERVER_URL);
}

const liveTimings: Record<string, number | string> = {};

function recordLiveTiming(key: string, value: number | string): void {
  if (liveAcceptanceEnabled()) {
    liveTimings[key] = value;
  }
}

async function validateDirectory(directoryPath: string): Promise<SelectedProject | null> {
  if (!path.isAbsolute(directoryPath)) {
    return null;
  }

  const stats = await fs.stat(directoryPath);
  if (!stats.isDirectory()) {
    return null;
  }

  return {
    path: directoryPath,
    name: path.basename(directoryPath)
  };
}

async function detectOllamaStatus(): Promise<OllamaStatus> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(OLLAMA_TAGS_URL, { signal: controller.signal });
    if (!response.ok) {
      return { ready: false, modelCount: 0, models: [] };
    }

    const payload = (await response.json()) as { models?: Array<{ name?: unknown }> };
    const models = Array.isArray(payload.models)
      ? payload.models
          .map((model) => (typeof model.name === "string" ? model.name : null))
          .filter((name): name is string => Boolean(name))
      : [];

    const orderedModels = [
      ...models.filter((name) => TRUSTED_MODEL_NAMES.has(name)),
      ...models.filter((name) => !TRUSTED_MODEL_NAMES.has(name))
    ];

    return {
      ready: true,
      modelCount: orderedModels.length,
      models: orderedModels
    };
  } catch {
    return { ready: false, modelCount: 0, models: [] };
  } finally {
    clearTimeout(timeout);
  }
}

function getWebContentsId(window: BrowserWindow): number {
  return window.webContents.id;
}

function sendConversationEvent(window: BrowserWindow, event: ConversationStreamEvent): void {
  if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.conversationEvent, event);
  }
}

function sendEditEvent(window: BrowserWindow, event: EditStreamEvent): void {
  if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.editsEvent, event);
  }
}

function sendPlanningEvent(window: BrowserWindow, event: PlanningStreamEvent): void {
  if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.planningEvent, event);
  }
}

function sendExecutionEvent(window: BrowserWindow, event: ExecutionStreamEvent): void {
  if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.executionEvent, event);
  }
}

function sendProjectRulesEvent(window: BrowserWindow, event: ProjectRulesStreamEvent): void {
  if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.rulesEvent, event);
  }
}

function sendUpdateEvent(window: BrowserWindow, event: UpdateStatusEvent): void {
  if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.updatesEvent, event);
  }
}

function sendDebugEvent(window: BrowserWindow, event: DebugEvent): void {
  if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.debugEvent, event);
  }
}

function sendChatEvent(event: AIChatEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.chatEvent, event);
    }
  }
  if (event.type === "state") return;
  const webContentsId = legacyChatWindowByRequest.get(event.requestId);
  if (webContentsId === undefined) return;
  const legacyWindow = BrowserWindow.getAllWindows().find((window) => getWebContentsId(window) === webContentsId);
  if (!legacyWindow) return;
  if (event.type === "chunk") {
    sendConversationEvent(legacyWindow, { type: "chunk", requestId: event.requestId, content: event.content });
    return;
  }
  if (event.type === "citations") {
    sendConversationEvent(legacyWindow, {
      type: "citations",
      requestId: event.requestId,
      citations: event.citations.map((citation) => ({
        sourceId: citation.sourceId,
        relativePath: citation.relativePath,
        lineStart: citation.lineStart ?? 1,
        lineEnd: citation.lineEnd ?? citation.lineStart ?? 1,
        reason: citation.label
      }))
    });
    return;
  }
  if (event.type === "done") {
    legacyChatWindowByRequest.delete(event.requestId);
    legacyChatRequestsByWindow.delete(webContentsId);
    sendConversationEvent(legacyWindow, { type: "done", requestId: event.requestId });
    return;
  }
  if (event.type === "stopped") {
    legacyChatWindowByRequest.delete(event.requestId);
    legacyChatRequestsByWindow.delete(webContentsId);
    sendConversationEvent(legacyWindow, { type: "stopped", requestId: event.requestId, reason: "user" });
    return;
  }
  if (event.type === "error") {
    legacyChatWindowByRequest.delete(event.requestId);
    legacyChatRequestsByWindow.delete(webContentsId);
    sendConversationEvent(legacyWindow, {
      type: "error",
      requestId: event.requestId,
      code: "UNKNOWN",
      message: event.message,
      recoverable: true
    });
  }
}

function sendAgentEvent(event: AgentEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
      window.webContents.send(IPC_CHANNELS.agentEvent, event);
    }
  }
}

function assertNoIpcArgs(args: unknown[]): void {
  if (args.length > 0) {
    throw new Error("Unexpected IPC arguments.");
  }
}

function getConversationErrorMessage(code: ConversationErrorCode): string {
  switch (code) {
    case "OLLAMA_UNAVAILABLE":
      return "Ollama is not running. Start Ollama, then try again.";
    case "MODEL_MISSING":
      return `${DEFAULT_CHAT_MODEL} is not installed. Install it in Ollama, then try again.`;
    case "REQUEST_TIMEOUT":
      return "The local model request timed out. You can retry.";
    case "STREAM_DISCONNECTED":
      return "The local model stream disconnected before finishing. You can retry.";
    case "MALFORMED_RESPONSE":
      return "Ollama returned malformed stream data. You can retry.";
    case "INVALID_REQUEST":
      return "The conversation request was invalid.";
    case "NO_WORKSPACE_EVIDENCE":
      return "I could not find enough workspace evidence to answer that. Try refreshing the workspace or asking about a specific file.";
    default:
      return "Levi could not complete the local response.";
  }
}

function getEditErrorMessage(code: EditErrorCode): string {
  switch (code) {
    case "NO_WORKSPACE":
      return "Open a workspace before asking Levi to edit a file.";
    case "UNSUPPORTED_SCOPE":
      return "IDE-001D supports one existing text file per edit. This request is outside that scope.";
    case "TARGET_NOT_FOUND":
      return "Levi could not identify one safe target file for this edit.";
    case "MODEL_MISSING":
      return `${DEFAULT_EDIT_MODEL} is not installed. Install it in Ollama, then try again.`;
    case "OLLAMA_UNAVAILABLE":
      return "Ollama is not running. Start Ollama, then try again.";
    case "REQUEST_TIMEOUT":
      return "The edit-generation request timed out. You can retry.";
    case "MALFORMED_RESPONSE":
      return "The coding model returned malformed edit data. You can retry.";
    case "VALIDATION_FAILED":
      return "Levi rejected the proposed edit because it failed safety validation.";
    case "STALE_PROPOSAL":
      return "File changed since this proposal was generated. Regenerate before applying.";
    case "WRITE_FAILED":
      return "Levi could not safely write and verify the file.";
    case "UNDO_UNAVAILABLE":
      return "There is no safe Levi edit to undo.";
    default:
      return "Levi could not complete the edit workflow safely.";
  }
}

function getPlanningErrorMessage(code: PlanningErrorCode): string {
  switch (code) {
    case "NO_WORKSPACE":
      return "Open a workspace before asking Levi to plan a multi-file change.";
    case "NO_RELEVANT_FILES":
      return "Levi could not find relevant workspace files for that plan.";
    case "INSUFFICIENT_EVIDENCE":
      return "Levi found too little evidence to make a useful plan.";
    case "AMBIGUOUS_REQUEST":
      return "The planning request is ambiguous. Add the target feature, framework, or behavior.";
    case "UNSUPPORTED_FRAMEWORK":
      return "Levi could not identify enough framework evidence to plan this safely.";
    case "HUGE_PROJECT":
      return "This workspace is too large for IDE-002 planning. Narrow the request to a package or feature area.";
    case "MODEL_MISSING":
      return `${DEFAULT_CHAT_MODEL} is not installed. Install it in Ollama, then try again.`;
    case "OLLAMA_UNAVAILABLE":
      return "Ollama is not running. Start Ollama, then try again.";
    case "REQUEST_TIMEOUT":
      return "The planning request timed out. You can retry with a narrower goal.";
    case "MALFORMED_RESPONSE":
      return "The planning model returned malformed plan data. You can retry.";
    case "INVALID_REQUEST":
      return "The planning request was invalid.";
    default:
      return "Levi could not complete the planning request.";
  }
}

function getExecutionErrorMessage(code: ExecutionErrorCode): string {
  switch (code) {
    case "NO_WORKSPACE":
      return "Open a workspace before executing a plan.";
    case "STALE_SCAN":
      return "Refresh the workspace before executing this plan.";
    case "NO_EXECUTABLE_STEPS":
      return "This plan has no executable file steps.";
    case "ONLY_POSSIBLE_FILES":
      return "Confirm affected files before execution.";
    case "RULE_CONFLICT":
      return "Resolve material project rule conflicts before execution.";
    case "UNSUPPORTED_OPERATION":
      return "This plan includes unsupported create or delete operations.";
    case "INVALID_PATH":
      return "One or more target paths are invalid or unsafe.";
    case "DUPLICATE_PATH":
      return "The plan contains duplicate target paths.";
    case "ACTIVE_TRANSACTION":
      return "An execution transaction is already active for this workspace.";
    case "MODEL_MISSING":
      return `${DEFAULT_EDIT_MODEL} is not installed. Install it in Ollama, then try again.`;
    case "OLLAMA_UNAVAILABLE":
      return "Ollama is not running. Start Ollama, then try again.";
    case "REQUEST_TIMEOUT":
      return "Execution step generation timed out. You can regenerate or cancel.";
    case "MALFORMED_RESPONSE":
      return "The coding model returned malformed execution data.";
    case "VALIDATION_FAILED":
      return "Levi rejected the proposed step because it failed safety validation.";
    case "STALE_STEP":
      return "The target file changed externally. Regenerate this step or cancel the transaction.";
    case "WRITE_FAILED":
      return "Levi could not safely write and verify the file.";
    case "ROLLBACK_FAILED":
      return "Rollback could not restore every applied file safely.";
    default:
      return "Levi could not complete the execution workflow safely.";
  }
}

function mapExecutionError(error: unknown): { code: ExecutionErrorCode; message: string; recoverable: boolean } {
  const message = error instanceof Error ? error.message : "Execution failed.";
  if (message.includes("No workspace")) {
    return { code: "NO_WORKSPACE", message, recoverable: false };
  }
  if (message.includes("stale") || message.includes("Workspace scan")) {
    return { code: "STALE_SCAN", message, recoverable: true };
  }
  if (message.includes("Possible") || message.includes("requires confirmation")) {
    return { code: "ONLY_POSSIBLE_FILES", message, recoverable: false };
  }
  if (message.includes("rule conflict")) {
    return { code: "RULE_CONFLICT", message, recoverable: false };
  }
  if (message.includes("Unsupported create") || message.includes("Unsupported delete")) {
    return { code: "UNSUPPORTED_OPERATION", message, recoverable: false };
  }
  if (message.includes("Duplicate file paths")) {
    return { code: "DUPLICATE_PATH", message, recoverable: false };
  }
  if (message.includes("already active")) {
    return { code: "ACTIVE_TRANSACTION", message, recoverable: false };
  }
  if (message.includes("changed since") || message.includes("changed externally")) {
    return { code: "STALE_STEP", message, recoverable: true };
  }
  if (message.includes("verification failed") || message.includes("could not safely write")) {
    return { code: "WRITE_FAILED", message, recoverable: false };
  }
  if (message.includes("rollback") || message.includes("Rollback")) {
    return { code: "ROLLBACK_FAILED", message, recoverable: false };
  }
  if (message.includes("cancelled")) {
    return { code: "UNKNOWN", message, recoverable: true };
  }
  if (error instanceof SyntaxError) {
    return { code: "MALFORMED_RESPONSE", message, recoverable: true };
  }
  return { code: "VALIDATION_FAILED", message, recoverable: true };
}

function sendExecutionError(
  window: BrowserWindow,
  code: ExecutionErrorCode,
  options: { transactionId?: string; message?: string; recoverable?: boolean } = {}
): void {
  sendExecutionEvent(window, {
    type: "error",
    transactionId: options.transactionId,
    code,
    message: options.message ?? getExecutionErrorMessage(code),
    recoverable: options.recoverable ?? true
  });
}

function findExecutionTransaction(transactionId: string): InternalExecutionTransaction | undefined {
  for (const transaction of executionTransactionsByRoot.values()) {
    if (transaction.transactionId === transactionId) {
      return transaction;
    }
  }
  return undefined;
}

function assertExecutionTransaction(window: BrowserWindow, transactionId: string): InternalExecutionTransaction {
  const transaction = findExecutionTransaction(transactionId);
  const boundTransactionId = executionTransactionByWindow.get(getWebContentsId(window));
  if (!transaction || boundTransactionId !== transactionId) {
    throw new Error("Execution transaction is not available for this window.");
  }
  return transaction;
}

function getActiveExecutionRoot(): string | null {
  if (!selectedProject) {
    return null;
  }
  return normalizeSlashes(selectedProject.path);
}

function abortActiveExecutionGeneration(webContentsId: number, reason: "user" | "window-closed"): boolean {
  const active = activeExecutionGenerations.get(webContentsId);
  if (!active) {
    return false;
  }
  active.stoppedByUser = reason === "user";
  active.controller.abort(reason);
  const transaction = findExecutionTransaction(active.transactionId);
  if (transaction) {
    cancelTransaction(transaction);
  }
  return true;
}

function removeActiveExecutionGeneration(webContentsId: number, transactionId: string): void {
  const active = activeExecutionGenerations.get(webContentsId);
  if (active?.transactionId === transactionId) {
    activeExecutionGenerations.delete(webContentsId);
  }
}

async function prepareExecutionForPlan(window: BrowserWindow, plan: ExecutionPlan): Promise<InternalExecutionTransaction> {
  if (!selectedProject || !workspaceScan) {
    throw new Error("No workspace is open.");
  }
  const rulesCache = await ensureProjectRules(window);
  if (!rulesCache) {
    throw new Error("Project rules cache is unavailable.");
  }
  const activeRoot = getActiveTransactionForRoot(executionTransactionsByRoot, workspaceScan.rootRealPath)?.workspaceRootRealPath ?? null;
  const { transaction } = await prepareExecutionTransaction(plan, workspaceScan, rulesCache, selectedProject.path, activeRoot);
  registerExecutionTransaction(executionTransactionsByRoot, transaction);
  executionPlansByTransaction.set(transaction.transactionId, plan);
  executionTransactionByWindow.set(getWebContentsId(window), transaction.transactionId);
  return transaction;
}

async function approvePlanningAndPrepare(window: BrowserWindow, planId: string): Promise<PlanningApproveResult> {
  const latestPlan = latestPlanByWindow.get(getWebContentsId(window));
  if (!latestPlan || latestPlan.planId !== planId) {
    throw new Error("Planning proposal is not available.");
  }
  if (!selectedProject || !workspaceScan) {
    throw new Error("No workspace is open.");
  }
  const rulesCache = await ensureProjectRules(window);
  const validation = validateExecutionPreconditions({
    plan: latestPlan,
    scan: workspaceScan,
    rulesCache,
    workspaceRootPath: selectedProject.path,
    activeTransactionRoot: getActiveTransactionForRoot(executionTransactionsByRoot, workspaceScan.rootRealPath)?.workspaceRootRealPath ?? null
  });
  if (!validation.ok) {
    throw new Error(validation.reasons.join(" "));
  }
  const prepareStarted = performance.now();
  const transaction = await prepareExecutionForPlan(window, latestPlan);
  recordLiveTiming("transactionPrepareMs", Math.round(performance.now() - prepareStarted));
  recordLiveTiming("editModel", DEFAULT_EDIT_MODEL);
  const publicTransaction = publicExecutionTransaction(transaction);
  const result: PlanningApproveResult = {
    planId,
    message: "Execution transaction prepared. Review each file step before applying.",
    transaction: publicTransaction
  };
  sendPlanningEvent(window, { type: "approved", ...result });
  sendExecutionEvent(window, { type: "prepared", transaction: publicTransaction });
  return result;
}

async function proposeExecutionStep(window: BrowserWindow, transactionId: string): Promise<void> {
  const webContentsId = getWebContentsId(window);
  const transaction = assertExecutionTransaction(window, transactionId);
  const plan = executionPlansByTransaction.get(transactionId);
  if (!plan || !workspaceScan) {
    throw new Error("Execution plan evidence is unavailable.");
  }
  if (activeExecutionGenerations.has(webContentsId)) {
    throw new Error("An execution step generation is already active.");
  }
  const availability = await ensureEditModelAvailable();
  if (!availability.ok) {
    sendExecutionError(window, availability.code, { transactionId, recoverable: false });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), EXECUTION_TIMEOUT_MS);
  activeExecutionGenerations.set(webContentsId, { transactionId, controller, stoppedByUser: false });
  sendExecutionEvent(window, { type: "status", transactionId, message: "Generating step proposal" });

  try {
    const proposal = await proposeStepContent({
      transaction,
      plan,
      scan: workspaceScan,
      rulesCache: (await ensureProjectRules(window))!,
      requestModel: (prompt, signal) => requestStructuredEditFromOllama(prompt, { signal } as AbortController),
      signal: controller.signal
    });
    recordLiveTiming(`step${proposal.stepIndex}ModelMs`, proposal.timings.modelMs);
    recordLiveTiming(`step${proposal.stepIndex}DiffMs`, proposal.timings.diffMs);
    recordLiveTiming(`step${proposal.stepIndex}TotalMs`, proposal.timings.totalMs);
    if (proposal.stepIndex === 0) {
      recordLiveTiming("firstStepProposalMs", proposal.timings.totalMs);
    }
    const publicTransaction = publicExecutionTransaction(transaction);
    sendExecutionEvent(window, {
      type: "proposal",
      transactionId,
      proposal: publicExecutionProposal(proposal),
      transaction: publicTransaction
    });
  } catch (error) {
    if (controller.signal.aborted) {
      sendExecutionEvent(window, {
        type: "stopped",
        transactionId,
        reason: activeExecutionGenerations.get(webContentsId)?.stoppedByUser ? "user" : "window-closed"
      });
      return;
    }
    const mapped = mapExecutionError(error);
    sendExecutionError(window, mapped.code, {
      transactionId,
      message: mapped.message,
      recoverable: mapped.recoverable
    });
  } finally {
    clearTimeout(timeout);
    removeActiveExecutionGeneration(webContentsId, transactionId);
  }
}

function sendConversationError(
  window: BrowserWindow,
  requestId: string,
  code: ConversationErrorCode,
  recoverable = true
): void {
  sendConversationEvent(window, {
    type: "error",
    requestId,
    code,
    message: getConversationErrorMessage(code),
    recoverable
  });
}

function sendEditError(
  window: BrowserWindow,
  code: EditErrorCode,
  options: { requestId?: string; proposalId?: string; message?: string; recoverable?: boolean } = {}
): void {
  sendEditEvent(window, {
    type: "error",
    requestId: options.requestId,
    proposalId: options.proposalId,
    code,
    message: options.message ?? getEditErrorMessage(code),
    recoverable: options.recoverable ?? true
  });
}

function sendPlanningError(
  window: BrowserWindow,
  code: PlanningErrorCode,
  options: { requestId?: string; message?: string; recoverable?: boolean } = {}
): void {
  sendPlanningEvent(window, {
    type: "error",
    requestId: options.requestId,
    code,
    message: options.message ?? getPlanningErrorMessage(code),
    recoverable: options.recoverable ?? true
  });
}

function isConversationRole(value: unknown): value is ConversationMessage["role"] {
  return value === "user" || value === "assistant";
}

function normalizeConversationMessage(value: unknown): ConversationMessage | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<ConversationMessage>;
  if (!isConversationRole(candidate.role) || typeof candidate.content !== "string") {
    return null;
  }
  const content = candidate.content.trim();
  if (!content || content.length > MAX_CHAT_MESSAGE_LENGTH) {
    return null;
  }
  return { role: candidate.role, content };
}

function validateConversationRequest(value: unknown): ConversationStartRequest {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid conversation request.");
  }
  const candidate = value as Partial<ConversationStartRequest>;
  if (candidate.model !== DEFAULT_CHAT_MODEL) {
    throw new Error("Unsupported model.");
  }
  if (!Array.isArray(candidate.messages) || candidate.messages.length === 0 || candidate.messages.length > MAX_CONVERSATION_MESSAGES) {
    throw new Error("Invalid conversation messages.");
  }
  const messages = candidate.messages.map(normalizeConversationMessage);
  if (messages.some((message) => message === null)) {
    throw new Error("Invalid conversation message.");
  }
  return {
    model: DEFAULT_CHAT_MODEL,
    messages: messages as ConversationMessage[]
  };
}

async function ensureDefaultModelAvailable(): Promise<{ ok: true } | { ok: false; code: "OLLAMA_UNAVAILABLE" | "MODEL_MISSING" }> {
  const status = await detectOllamaStatus();
  if (!status.ready) {
    return { ok: false, code: "OLLAMA_UNAVAILABLE" };
  }
  if (!status.models.includes(DEFAULT_CHAT_MODEL)) {
    return { ok: false, code: "MODEL_MISSING" };
  }
  return { ok: true };
}

async function ensureEditModelAvailable(): Promise<{ ok: true } | { ok: false; code: "OLLAMA_UNAVAILABLE" | "MODEL_MISSING" }> {
  const status = await detectOllamaStatus();
  if (!status.ready) {
    return { ok: false, code: "OLLAMA_UNAVAILABLE" };
  }
  if (!status.models.includes(DEFAULT_EDIT_MODEL)) {
    return { ok: false, code: "MODEL_MISSING" };
  }
  return { ok: true };
}

function abortActiveEditGeneration(webContentsId: number, reason: "user" | "window-closed"): boolean {
  const active = activeEditGenerations.get(webContentsId);
  if (!active) {
    return false;
  }
  active.stoppedByUser = reason === "user";
  active.controller.abort(reason);
  return true;
}

function abortActivePlanningGeneration(webContentsId: number, reason: "user" | "window-closed"): boolean {
  const active = activePlanningGenerations.get(webContentsId);
  if (!active) {
    return false;
  }
  active.stoppedByUser = reason === "user";
  active.controller.abort(reason);
  return true;
}

function removeActiveEditGeneration(webContentsId: number, requestId: string): void {
  const active = activeEditGenerations.get(webContentsId);
  if (active?.requestId === requestId) {
    activeEditGenerations.delete(webContentsId);
  }
}

function removeActivePlanningGeneration(webContentsId: number, requestId: string): void {
  const active = activePlanningGenerations.get(webContentsId);
  if (active?.requestId === requestId) {
    activePlanningGenerations.delete(webContentsId);
  }
}

function getLastUserMessage(request: ConversationStartRequest): ConversationMessage | null {
  for (let index = request.messages.length - 1; index >= 0; index -= 1) {
    if (request.messages[index].role === "user") {
      return request.messages[index];
    }
  }
  return null;
}

function validateEditProposeRequest(value: unknown): EditProposeRequest {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid edit request.");
  }
  const candidate = value as Partial<EditProposeRequest>;
  if (typeof candidate.prompt !== "string") {
    throw new Error("Invalid edit prompt.");
  }
  const prompt = candidate.prompt.trim();
  if (!prompt || prompt.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new Error("Invalid edit prompt.");
  }
  return { prompt };
}

function validatePlanningCreateRequest(value: unknown): PlanningCreateRequest {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid planning request.");
  }
  const candidate = value as Partial<PlanningCreateRequest>;
  if (typeof candidate.prompt !== "string") {
    throw new Error("Invalid planning prompt.");
  }
  const prompt = candidate.prompt.trim();
  if (!prompt || prompt.length > MAX_CHAT_MESSAGE_LENGTH) {
    throw new Error("Invalid planning prompt.");
  }
  return { prompt };
}

async function requestStructuredEditFromOllama(prompt: string, controller: AbortController): Promise<{ content: string; modelMs: number }> {
  const started = performance.now();
  const response = await fetch(OLLAMA_CHAT_URL, {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: DEFAULT_EDIT_MODEL,
      stream: false,
      think: false,
      format: "json",
      options: {
        temperature: 0.1,
        num_predict: 8192
      },
      messages: [
        {
          role: "system",
          content:
            "You generate safe single-file code edits for Levi. Return strict JSON only. Do not include Markdown. Do not claim files were changed or validation was run."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });
  const modelMs = Math.round(performance.now() - started);
  if (!response.ok) {
    throw new Error("Ollama edit request failed.");
  }
  const payload = (await response.json()) as { message?: { content?: unknown }; response?: unknown };
  const content = typeof payload.message?.content === "string" ? payload.message.content : typeof payload.response === "string" ? payload.response : "";
  if (!content.trim()) {
    throw new Error("Ollama returned an empty edit response.");
  }
  return { content, modelMs };
}

async function requestStructuredPlanFromOllama(
  prompt: string,
  controller: AbortController,
  timeoutMs: number
): Promise<{ content: string; modelMs: number }> {
  const started = performance.now();
  const timeoutError = new Error("Planning request timed out.");
  const response = await Promise.race([
    fetch(OLLAMA_CHAT_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: DEFAULT_CHAT_MODEL,
        stream: false,
        think: false,
        format: "json",
        options: {
          temperature: 0.2,
          num_predict: 768
        },
        messages: [
          {
            role: "system",
            content:
              "You create read-only software execution plans for Levi. Return strict JSON only. Never write code. Never claim edits occurred. Never invent files. Never claim validation was run."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    }),
    new Promise<Response>((_, reject) => {
      const timer = setTimeout(() => {
        controller.abort("timeout");
        reject(timeoutError);
      }, timeoutMs);
      controller.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
    })
  ]);
  const modelMs = Math.round(performance.now() - started);
  if (!response.ok) {
    throw new Error("Ollama planning request failed.");
  }
  const payload = (await response.json()) as { message?: { content?: unknown }; response?: unknown };
  const content = typeof payload.message?.content === "string" ? payload.message.content : typeof payload.response === "string" ? payload.response : "";
  if (!content.trim()) {
    throw new Error("Ollama returned an empty planning response.");
  }
  return { content, modelMs };
}

function getEditProposalMap(webContentsId: number): Map<string, InternalEditProposal> {
  const existing = editProposalsByWindow.get(webContentsId);
  if (existing) {
    return existing;
  }
  const next = new Map<string, InternalEditProposal>();
  editProposalsByWindow.set(webContentsId, next);
  return next;
}

function getEditStatus(webContentsId: number): EditStatus {
  const proposals = editProposalsByWindow.get(webContentsId);
  const pending = proposals ? Array.from(proposals.values()).find((proposal) => proposal.status === "pending") : undefined;
  const undo = undoByWindow.get(webContentsId);
  return {
    pendingProposalId: pending?.proposalId,
    canUndo: Boolean(undo),
    lastAppliedPath: undo?.relativePath,
    route: {
      conversation: DEFAULT_CHAT_MODEL,
      editGeneration: DEFAULT_EDIT_MODEL
    }
  };
}

function getPlanningStatus(webContentsId: number): PlanningStatus {
  const active = activePlanningGenerations.get(webContentsId);
  const latestPlan = latestPlanByWindow.get(webContentsId);
  return {
    latestPlan,
    activeRequestId: active?.requestId,
    route: {
      planning: DEFAULT_CHAT_MODEL
    }
  };
}

function emptyProjectRulesList(): ProjectRulesListResult {
  return {
    status: projectRulesStatus,
    sources: [],
    rules: [],
    conflicts: [],
    design: {
      tokens: [],
      components: [],
      conventions: [],
      sources: []
    },
    suspiciousRules: []
  };
}

function publicProjectRulesList(): ProjectRulesListResult {
  if (!projectRulesCache) {
    return emptyProjectRulesList();
  }
  return {
    status: projectRulesCache.status,
    sources: projectRulesCache.sources,
    rules: projectRulesCache.rules,
    conflicts: projectRulesCache.conflicts,
    design: projectRulesCache.design,
    suspiciousRules: projectRulesCache.suspiciousRules
  };
}

function invalidateProjectRules(status: ProjectRulesStatus["state"] = "idle", error?: string): void {
  projectRulesCache = null;
  activeProjectRulesScan = null;
  projectRulesStatus = {
    state: status,
    guidanceFileCount: 0,
    activeRuleCount: 0,
    conflictCount: 0,
    suspiciousCount: 0,
    error,
    timings: {
      discoveryMs: 0,
      extractionMs: 0,
      enrichmentMs: 0,
      activeContextMs: 0
    }
  };
}

async function refreshProjectRules(window?: BrowserWindow): Promise<ProjectRulesListResult> {
  if (activeProjectRulesScan) {
    return activeProjectRulesScan;
  }
  if (!workspaceScan) {
    invalidateProjectRules("idle");
    return emptyProjectRulesList();
  }
  projectRulesStatus = {
    ...projectRulesStatus,
    state: "scanning",
    error: undefined
  };
  if (window) {
    sendProjectRulesEvent(window, { type: "status", status: projectRulesStatus });
  }
  activeProjectRulesScan = (async () => {
    try {
      const cache = await buildProjectRulesCache(workspaceScan as WorkspaceScan);
      projectRulesCache = cache;
      projectRulesStatus = cache.status;
      const result = publicProjectRulesList();
      if (window) {
        sendProjectRulesEvent(window, { type: "updated", result });
      }
      return result;
    } catch (error) {
      invalidateProjectRules("failed", error instanceof Error ? error.message : "Project rule scan failed.");
      return emptyProjectRulesList();
    } finally {
      activeProjectRulesScan = null;
    }
  })();
  return activeProjectRulesScan;
}

async function ensureProjectRules(window?: BrowserWindow): Promise<ProjectRulesCache | null> {
  if (projectRulesCache) {
    return projectRulesCache;
  }
  await refreshProjectRules(window);
  return projectRulesCache;
}

function ruleSourcesForCitations(rules: ProjectRule[], scan: WorkspaceScan): WorkspaceSource[] {
  const sources: WorkspaceSource[] = [];
  for (const rule of rules) {
    const record = scan.files.find((file) => file.relativePath === rule.sourcePath);
    if (!record?.contentEligible) {
      continue;
    }
    sources.push({
      id: rule.ruleId,
      relativePath: rule.sourcePath,
      lineStart: rule.lineStart,
      lineEnd: rule.lineEnd,
      reason: `Project rule: ${rule.text}`,
      excerpt: "",
      absolutePath: record.absolutePath
    });
  }
  return sources;
}

async function createWorkspacePlan(window: BrowserWindow, requestId: string, request: PlanningCreateRequest): Promise<void> {
  const webContentsId = getWebContentsId(window);
  const controller = new AbortController();
  const totalStarted = performance.now();
  let fallbackScan: WorkspaceScan | null = null;
  let fallbackCandidates: PlanningCandidate[] = [];
  let fallbackRetrievalMs = 0;
  let fallbackActiveRules: ReturnType<typeof buildActiveRuleContext> | undefined;
  let planningTimedOut = false;
  activePlanningGenerations.set(webContentsId, { requestId, controller, stoppedByUser: false });

  try {
    if (!isPlanningRequest(request.prompt)) {
      sendPlanningError(window, "AMBIGUOUS_REQUEST", { requestId, recoverable: false });
      return;
    }
    if (!selectedProject) {
      sendPlanningError(window, "NO_WORKSPACE", { requestId });
      return;
    }
    if (!workspaceScan) {
      const refreshed = await refreshWorkspace();
      if (refreshed.state !== "ready" || !workspaceScan) {
        sendPlanningError(window, "NO_WORKSPACE", { requestId });
        return;
      }
    }
    if (workspaceScan.summary.includedFileCount > PLANNING_LIMITS.hugeProjectFileThreshold) {
      sendPlanningError(window, "HUGE_PROJECT", { requestId, recoverable: false });
      return;
    }

    const availability = await ensureDefaultModelAvailable();
    if (!availability.ok) {
      sendPlanningError(window, availability.code, { requestId });
      return;
    }

    sendPlanningEvent(window, { type: "status", requestId, message: "Analyzing workspace evidence" });
    const retrievalStarted = performance.now();
    const { candidates, sources } = await discoverPlanningCandidates(workspaceScan, request.prompt);
    const retrievalMs = Math.round(performance.now() - retrievalStarted);
    fallbackScan = workspaceScan;
    fallbackCandidates = candidates;
    fallbackRetrievalMs = retrievalMs;
    if (candidates.length === 0) {
      sendPlanningError(window, "NO_RELEVANT_FILES", { requestId });
      return;
    }
    if (!candidates.some((candidate: PlanningCandidate) => candidate.certainty === "confirmed")) {
      sendPlanningError(window, "INSUFFICIENT_EVIDENCE", {
        requestId,
        message: "Levi found only uncertain file matches. Narrow the request or name the feature area.",
        recoverable: true
      });
      return;
    }

    const rulesCache = await Promise.race([
      ensureProjectRules(window),
      new Promise<ProjectRulesCache | null>((resolve) => {
        setTimeout(() => resolve(projectRulesCache), 30000);
      })
    ]);
    const activeRulesStarted = performance.now();
    const activeRules = rulesCache
      ? buildActiveRuleContext(rulesCache, {
          prompt: request.prompt,
          includeDesign: /\b(ui|design|button|component|style|css|tailwind|token|accessib|focus|keyboard)\b/i.test(request.prompt)
        })
      : undefined;
    if (activeRules && projectRulesCache) {
      projectRulesCache.status.timings.activeContextMs = Math.round(performance.now() - activeRulesStarted);
      projectRulesStatus = projectRulesCache.status;
    }
    fallbackActiveRules = activeRules;

    sendPlanningEvent(window, { type: "status", requestId, message: "Generating read-only execution plan" });
    const planningPrompt = buildPlanningPrompt(
      workspaceScan,
      request.prompt,
      candidates,
      sources,
      activeRules ? formatActiveRuleContextForPrompt(activeRules) : undefined
    );
    const modelPhaseStarted = performance.now();
    const watchdog = setInterval(() => {
      if (performance.now() - modelPhaseStarted >= PLANNING_TIMEOUT_MS) {
        planningTimedOut = true;
        controller.abort("timeout");
      }
    }, 1000);
    try {
      const { content, modelMs } = await requestStructuredPlanFromOllama(planningPrompt, controller, PLANNING_TIMEOUT_MS);
      const modelOutput = parsePlanningModelOutput(content);
      const plan = createExecutionPlan({
        requestId,
        prompt: request.prompt,
        scan: workspaceScan,
        candidates,
        modelOutput,
        activeRules,
        timings: {
          retrievalMs,
          modelMs,
          totalMs: Math.round(performance.now() - totalStarted)
        }
      });
      latestPlanByWindow.set(webContentsId, plan);
      recordLiveTiming("planningModel", DEFAULT_CHAT_MODEL);
      recordLiveTiming("planningModelMs", plan.timings.modelMs);
      recordLiveTiming("planningTotalMs", plan.timings.totalMs);
      sendPlanningEvent(window, { type: "plan", requestId, plan });
    } finally {
      clearInterval(watchdog);
    }
  } catch (error) {
    const active = activePlanningGenerations.get(webContentsId);
    const timedOut =
      planningTimedOut ||
      controller.signal.reason === "timeout" ||
      (error instanceof Error && error.message === "Planning request timed out.");
    if (timedOut) {
      if (active?.stoppedByUser) {
        sendPlanningEvent(window, { type: "stopped", requestId, reason: "user" });
      } else if (fallbackScan && fallbackCandidates.length) {
        sendPlanningEvent(window, { type: "status", requestId, message: "Using read-only deterministic planning fallback" });
        const plan = createExecutionPlan({
          requestId,
          prompt: request.prompt,
          scan: fallbackScan,
          candidates: fallbackCandidates,
          modelOutput: {
            goal: request.prompt,
            summary: "The local planning model timed out, so Levi produced a conservative read-only plan from deterministic workspace evidence.",
            confidence: "low",
            risks: ["The planning model timed out before refining this plan.", "No validation commands were run."],
            assumptions: ["This fallback plan uses scanned workspace metadata and candidate files only."],
            openQuestions: ["Should this be refined once qwen3.6 responds faster or the request is narrowed?"],
            blockedItems: ["qwen3.6 timed out before completing the structured planning response."],
            suggestedNextAction: "Review the affected files and refine the plan before IDE-002B execution."
          },
          activeRules: fallbackActiveRules,
          timings: {
            retrievalMs: fallbackRetrievalMs,
            modelMs: PLANNING_TIMEOUT_MS,
            totalMs: Math.round(performance.now() - totalStarted)
          }
        });
        latestPlanByWindow.set(webContentsId, plan);
        sendPlanningEvent(window, { type: "plan", requestId, plan });
      } else {
        sendPlanningError(window, "REQUEST_TIMEOUT", { requestId });
      }
      return;
    }
    if (controller.signal.aborted && !active?.stoppedByUser) {
      sendPlanningEvent(window, { type: "stopped", requestId, reason: "window-closed" });
      return;
    }
    if (active?.stoppedByUser) {
      sendPlanningEvent(window, { type: "stopped", requestId, reason: "user" });
      return;
    }
    if ((error instanceof SyntaxError || /malformed|empty planning response/i.test(error instanceof Error ? error.message : "")) && fallbackScan && fallbackCandidates.length) {
      const plan = createExecutionPlan({
        requestId,
        prompt: request.prompt,
        scan: fallbackScan,
        candidates: fallbackCandidates,
        modelOutput: {
          goal: request.prompt,
          summary: "The local planning model returned unusable structured data, so Levi produced a conservative read-only plan from deterministic workspace evidence.",
          confidence: "low",
          risks: ["The planning model response could not be used.", "No validation commands were run."],
          assumptions: ["This fallback plan uses scanned workspace metadata and candidate files only."],
          openQuestions: ["Should the request be refined before execution is available?"],
          blockedItems: ["qwen3.6 did not return valid structured planning data."],
          suggestedNextAction: "Review and refine this plan before IDE-002B execution."
        },
        activeRules: fallbackActiveRules,
        timings: {
          retrievalMs: fallbackRetrievalMs,
          modelMs: Math.round(performance.now() - totalStarted - fallbackRetrievalMs),
          totalMs: Math.round(performance.now() - totalStarted)
        }
      });
      latestPlanByWindow.set(webContentsId, plan);
      sendPlanningEvent(window, { type: "plan", requestId, plan });
      return;
    }
    sendPlanningError(window, error instanceof SyntaxError ? "MALFORMED_RESPONSE" : "UNKNOWN", {
      requestId,
      message: error instanceof Error ? error.message : undefined
    });
  } finally {
    removeActivePlanningGeneration(webContentsId, requestId);
  }
}

async function proposeWorkspaceEdit(window: BrowserWindow, requestId: string, request: EditProposeRequest): Promise<void> {
  const webContentsId = getWebContentsId(window);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), EDIT_TIMEOUT_MS);
  const totalStarted = performance.now();
  activeEditGenerations.set(webContentsId, { requestId, controller, stoppedByUser: false });

  try {
    if (!isLikelyEditRequest(request.prompt)) {
      sendEditError(window, "UNSUPPORTED_SCOPE", {
        requestId,
        message: "This looks like a question rather than a concrete single-file edit request.",
        recoverable: false
      });
      return;
    }
    const unsupported = isUnsupportedEditScope(request.prompt);
    if (unsupported) {
      sendEditError(window, "UNSUPPORTED_SCOPE", { requestId, message: unsupported, recoverable: false });
      return;
    }
    if (!selectedProject) {
      sendEditError(window, "NO_WORKSPACE", { requestId });
      return;
    }
    if (!workspaceScan) {
      const refreshed = await refreshWorkspace();
      if (refreshed.state !== "ready" || !workspaceScan) {
        sendEditError(window, "NO_WORKSPACE", { requestId });
        return;
      }
    }

    const availability = await ensureEditModelAvailable();
    if (!availability.ok) {
      sendEditError(window, availability.code, { requestId });
      return;
    }

    sendEditEvent(window, { type: "status", requestId, message: "Retrieving workspace evidence" });
    const retrievalStarted = performance.now();
    const retrieval = await retrieveWorkspaceContext(workspaceScan, request.prompt);
    const retrievalMs = Math.round(performance.now() - retrievalStarted);
    const target = selectEditTarget(workspaceScan, retrieval.sources, request.prompt);
    if (!target) {
      sendEditError(window, "TARGET_NOT_FOUND", { requestId });
      return;
    }
    const { content: originalContent, absolutePath } = await readEditableTarget(workspaceScan, target);
    const baseHash = hashContent(originalContent);
    const rulesCache = await ensureProjectRules(window);
    const activeRulesStarted = performance.now();
    const activeRules = rulesCache
      ? buildActiveRuleContext(rulesCache, {
          prompt: request.prompt,
          targetPath: target.relativePath,
          includeDesign: /\b(ui|design|button|component|style|css|tailwind|token|accessib|focus|keyboard)\b/i.test(request.prompt)
        })
      : undefined;
    if (activeRules && projectRulesCache) {
      projectRulesCache.status.timings.activeContextMs = Math.round(performance.now() - activeRulesStarted);
      projectRulesStatus = projectRulesCache.status;
    }
    sendEditEvent(window, { type: "status", requestId, message: "Generating edit proposal" });

    const editPrompt = buildEditGenerationPrompt({
      request: request.prompt,
      target,
      currentContent: originalContent,
      workspaceEvidence: retrieval.context,
      projectRulesContext: activeRules ? formatActiveRuleContextForPrompt(activeRules) : undefined
    });
    const { content: modelContent, modelMs } = await requestStructuredEditFromOllama(editPrompt, controller);
    const structured = parseStructuredEditOutput(modelContent);
    if (hashContent(originalContent) !== baseHash) {
      sendEditError(window, "STALE_PROPOSAL", { requestId });
      return;
    }
    const { proposedContent, warnings } = validateStructuredEdit({
      structured,
      target,
      originalContent,
      prompt: request.prompt,
      appliedProjectRules: activeRules?.rules
    });
    const diffStarted = performance.now();
    const proposal = createInternalProposal({
      requestId,
      target,
      absolutePath,
      originalContent,
      proposedContent,
      structured,
      warnings,
      appliedProjectRules: activeRules?.rules,
      ruleConflicts: activeRules?.conflicts,
      timings: {
        retrievalMs,
        modelMs,
        diffMs: 0,
        totalMs: 0
      },
      workspaceRootRealPath: workspaceScan.rootRealPath
    });
    proposal.timings.diffMs = Math.round(performance.now() - diffStarted);
    proposal.timings.totalMs = Math.round(performance.now() - totalStarted);
    getEditProposalMap(webContentsId).set(proposal.proposalId, proposal);
    sendEditEvent(window, { type: "proposal", requestId, proposal: publicProposal(proposal) });
  } catch (error) {
    if (controller.signal.aborted) {
      sendEditError(window, controller.signal.reason === "timeout" ? "REQUEST_TIMEOUT" : "UNKNOWN", {
        requestId,
        message: controller.signal.reason === "timeout" ? getEditErrorMessage("REQUEST_TIMEOUT") : "Edit generation was stopped.",
        recoverable: true
      });
      return;
    }
    sendEditError(window, error instanceof SyntaxError ? "MALFORMED_RESPONSE" : "VALIDATION_FAILED", {
      requestId,
      message: error instanceof Error ? error.message : undefined
    });
  } finally {
    clearTimeout(timeout);
    removeActiveEditGeneration(webContentsId, requestId);
  }
}

async function refreshWorkspace(): Promise<WorkspaceStatus> {
  if (activeWorkspaceScan) {
    return withRuntimeStatus(createWorkspaceStatus("scanning", workspaceStatus.summary, "A workspace scan is already running."));
  }
  if (!selectedProject) {
    workspaceScan = null;
    latestPlanByWindow.clear();
    invalidateProjectRules("idle");
    workspaceStatus = createWorkspaceStatus("idle");
    return withRuntimeStatus(workspaceStatus);
  }
  if (workspaceScan && getActiveTransactionForRoot(executionTransactionsByRoot, workspaceScan.rootRealPath)) {
    return withRuntimeStatus(
      createWorkspaceStatus(
        "refresh-required",
        workspaceStatus.summary,
        "Finish or cancel the active execution transaction before refreshing the workspace."
      )
    );
  }

  workspaceStatus = createWorkspaceStatus("scanning", workspaceStatus.summary);
  invalidateProjectRules("scanning");
  activeWorkspaceScan = (async () => {
    try {
      const scan = await scanWorkspace(selectedProject.path);
      workspaceScan = scan;
      citationSourcesByWindow.clear();
      editProposalsByWindow.clear();
      undoByWindow.clear();
      latestPlanByWindow.clear();
      await refreshProjectRules();
      workspaceStatus = {
        ...createWorkspaceStatus("ready", scan.summary),
        runtime: await desktopRuntimeService.syncWorkspace(selectedProject!)
      };
      return workspaceStatus;
    } catch (error) {
      workspaceScan = null;
      citationSourcesByWindow.clear();
      editProposalsByWindow.clear();
      undoByWindow.clear();
      latestPlanByWindow.clear();
      invalidateProjectRules("failed", error instanceof Error ? error.message : "Workspace scan failed.");
      workspaceStatus = createWorkspaceStatus(
        "failed",
        undefined,
        error instanceof Error ? error.message : "Workspace scan failed."
      );
      return withRuntimeStatus(workspaceStatus);
    } finally {
      activeWorkspaceScan = null;
    }
  })();

  return activeWorkspaceScan;
}

function withRuntimeStatus(status: WorkspaceStatus): WorkspaceStatus {
  return {
    ...status,
    runtime: desktopRuntimeService.getStatusSnapshot()
  };
}

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.ollamaGetStatus, () => detectOllamaStatus());
  ipcMain.handle(IPC_CHANNELS.projectsGetRecent, () => readRecentProject());
  ipcMain.handle(IPC_CHANNELS.projectsOpenFolder, async () => {
    if (workspaceScan && getActiveTransactionForRoot(executionTransactionsByRoot, workspaceScan.rootRealPath)) {
      throw new Error("Finish or cancel the active execution transaction before switching workspaces.");
    }
    const result = await dialog.showOpenDialog({
      title: "Open Project Folder",
      properties: ["openDirectory"]
    });
    const directoryPath = result.filePaths[0];
    if (result.canceled || !directoryPath) {
      return null;
    }
    const project = await validateDirectory(directoryPath);
    if (!project) {
      return null;
    }
    return openProjectAtPath(directoryPath);
  });
  ipcMain.handle(IPC_CHANNELS.workspaceGetStatus, () => withRuntimeStatus(workspaceStatus));
  ipcMain.handle(IPC_CHANNELS.workspaceRefresh, () => refreshWorkspace());
  ipcMain.handle(IPC_CHANNELS.workspaceOpenFile, async (event, request) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow || !workspaceScan) {
      throw new Error("Workspace is not ready.");
    }
    const sourceMap = citationSourcesByWindow.get(getWebContentsId(eventWindow)) ?? new Map<string, WorkspaceSource>();
    return openWorkspaceFileFromSource(workspaceScan, sourceMap, request);
  });
  ipcMain.handle(IPC_CHANNELS.updatesGetStatus, (_event, ...args) => {
    assertNoIpcArgs(args);
    return updateService.getStatus();
  });
  ipcMain.handle(IPC_CHANNELS.updatesCheck, (_event, ...args) => {
    assertNoIpcArgs(args);
    return updateService.checkForUpdates();
  });
  ipcMain.handle(IPC_CHANNELS.updatesDownload, (_event, ...args) => {
    assertNoIpcArgs(args);
    return updateService.downloadUpdate();
  });
  ipcMain.handle(IPC_CHANNELS.updatesInstall, (_event, ...args) => {
    assertNoIpcArgs(args);
    return updateService.installDownloadedUpdate();
  });
  ipcMain.handle(IPC_CHANNELS.rulesGetStatus, () => projectRulesStatus);
  ipcMain.handle(IPC_CHANNELS.rulesList, async (event) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!workspaceScan) {
      return emptyProjectRulesList();
    }
    await ensureProjectRules(eventWindow ?? undefined);
    return publicProjectRulesList();
  });
  ipcMain.handle(IPC_CHANNELS.rulesRefresh, async (event) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!workspaceScan) {
      return emptyProjectRulesList();
    }
    projectRulesCache = null;
    activeProjectRulesScan = null;
    return refreshProjectRules(eventWindow ?? undefined);
  });
  ipcMain.handle(IPC_CHANNELS.rulesOpenSource, async (_event, request) => {
    if (!workspaceScan) {
      throw new Error("Workspace is not ready.");
    }
    if (!request || typeof (request as { ruleId?: unknown }).ruleId !== "string") {
      throw new Error("Invalid rule source request.");
    }
    const cache = await ensureProjectRules();
    if (!cache) {
      throw new Error("Project rules are not ready.");
    }
    return openRuleSourceFromId(workspaceScan, cache, (request as { ruleId: string }).ruleId);
  });
  ipcMain.handle(IPC_CHANNELS.editsGetStatus, (event) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow) {
      throw new Error("Edit status requests require a window.");
    }
    return getEditStatus(getWebContentsId(eventWindow));
  });
  ipcMain.handle(IPC_CHANNELS.planningGetStatus, (event) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow) {
      throw new Error("Planning status requests require a window.");
    }
    return getPlanningStatus(getWebContentsId(eventWindow));
  });
  ipcMain.handle(IPC_CHANNELS.planningCreate, (event, rawRequest) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow) {
      throw new Error("Planning requests require a window.");
    }
    const webContentsId = getWebContentsId(eventWindow);
    if (activePlanningGenerations.has(webContentsId)) {
      throw new Error("A planning request is already active.");
    }
    const requestId = randomUUID();
    let request: PlanningCreateRequest;
    try {
      request = validatePlanningCreateRequest(rawRequest);
    } catch {
      sendPlanningError(eventWindow, "INVALID_REQUEST", { requestId, recoverable: false });
      return { requestId };
    }
    void createWorkspacePlan(eventWindow, requestId, request);
    return { requestId };
  });
  ipcMain.handle(IPC_CHANNELS.planningCancel, (event, requestId) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow || typeof requestId !== "string") {
      return;
    }
    const active = activePlanningGenerations.get(getWebContentsId(eventWindow));
    if (active?.requestId === requestId) {
      abortActivePlanningGeneration(getWebContentsId(eventWindow), "user");
    }
  });
  ipcMain.handle(IPC_CHANNELS.planningApprove, (event, planId) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow || typeof planId !== "string") {
      throw new Error("Invalid plan.");
    }
    return approvePlanningAndPrepare(eventWindow, planId);
  });
  ipcMain.handle(IPC_CHANNELS.executionPrepare, async (event, planId) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow || typeof planId !== "string") {
      throw new Error("Invalid plan.");
    }
    const latestPlan = latestPlanByWindow.get(getWebContentsId(eventWindow));
    if (!latestPlan || latestPlan.planId !== planId) {
      throw new Error("Planning proposal is not available.");
    }
    const transaction = await prepareExecutionForPlan(eventWindow, latestPlan);
    const publicTransaction = publicExecutionTransaction(transaction);
    sendExecutionEvent(eventWindow, { type: "prepared", transaction: publicTransaction });
    return { transaction: publicTransaction };
  });
  ipcMain.handle(IPC_CHANNELS.executionGetStatus, (event) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow) {
      throw new Error("Execution status requests require a window.");
    }
    const transactionId = executionTransactionByWindow.get(getWebContentsId(eventWindow));
    const transaction = transactionId ? findExecutionTransaction(transactionId) : undefined;
    return {
      activeTransaction: transaction ? publicExecutionTransaction(transaction) : undefined,
      route: {
        stepGeneration: DEFAULT_EDIT_MODEL
      }
    };
  });
  ipcMain.handle(IPC_CHANNELS.executionProposeStep, (event, transactionId) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow || typeof transactionId !== "string") {
      throw new Error("Invalid execution transaction.");
    }
    void proposeExecutionStep(eventWindow, transactionId);
    return { transactionId };
  });
  ipcMain.handle(IPC_CHANNELS.executionApplyStep, async (event, transactionId) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow || typeof transactionId !== "string") {
      throw new Error("Invalid execution transaction.");
    }
    const transaction = assertExecutionTransaction(eventWindow, transactionId);
    try {
      const rulesCache = await ensureProjectRules(eventWindow);
      if (!rulesCache || !workspaceScan) {
        throw new Error("Project rules cache is unavailable.");
      }
      const result = await applyStep(transaction, transaction.currentStepIndex, {
        scan: workspaceScan,
        rulesCache
      });
      const publicTransaction = publicExecutionTransaction(transaction);
      sendExecutionEvent(eventWindow, {
        type: "applied",
        transactionId,
        relativePath: result.relativePath,
        stepIndex: result.stepIndex,
        transaction: publicTransaction
      });
      return { transaction: publicTransaction, ...result };
    } catch (error) {
      const mapped = mapExecutionError(error);
      transaction.failureMessage = mapped.message;
      sendExecutionError(eventWindow, mapped.code, {
        transactionId,
        message: mapped.message,
        recoverable: mapped.recoverable
      });
      throw error;
    }
  });
  ipcMain.handle(IPC_CHANNELS.executionRejectStep, (event, transactionId) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow || typeof transactionId !== "string") {
      throw new Error("Invalid execution transaction.");
    }
    const transaction = assertExecutionTransaction(eventWindow, transactionId);
    rejectStepProposal(transaction);
    return { transaction: publicExecutionTransaction(transaction) };
  });
  ipcMain.handle(IPC_CHANNELS.executionRegenerateStep, (event, transactionId) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow || typeof transactionId !== "string") {
      throw new Error("Invalid execution transaction.");
    }
    const transaction = assertExecutionTransaction(eventWindow, transactionId);
    if (transaction.steps[transaction.currentStepIndex]?.proposal) {
      rejectStepProposal(transaction);
    }
    void proposeExecutionStep(eventWindow, transactionId);
    return { transactionId };
  });
  ipcMain.handle(IPC_CHANNELS.executionCancel, (event, transactionId) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow || typeof transactionId !== "string") {
      throw new Error("Invalid execution transaction.");
    }
    abortActiveExecutionGeneration(getWebContentsId(eventWindow), "user");
    const transaction = assertExecutionTransaction(eventWindow, transactionId);
    cancelTransaction(transaction);
    const publicTransaction = publicExecutionTransaction(transaction);
    sendExecutionEvent(eventWindow, { type: "cancelled", transactionId, transaction: publicTransaction });
    return { transaction: publicTransaction };
  });
  ipcMain.handle(IPC_CHANNELS.executionKeep, (event, transactionId) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow || typeof transactionId !== "string") {
      throw new Error("Invalid execution transaction.");
    }
    const transaction = assertExecutionTransaction(eventWindow, transactionId);
    keepTransaction(transaction);
    const publicTransaction = publicExecutionTransaction(transaction);
    unregisterExecutionTransaction(executionTransactionsByRoot, transaction.workspaceRootRealPath);
    executionTransactionByWindow.delete(getWebContentsId(eventWindow));
    executionPlansByTransaction.delete(transactionId);
    sendExecutionEvent(eventWindow, { type: "kept", transactionId, transaction: publicTransaction });
    return { transaction: publicTransaction };
  });
  ipcMain.handle(IPC_CHANNELS.executionRollback, async (event, transactionId) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow || typeof transactionId !== "string") {
      throw new Error("Invalid execution transaction.");
    }
    const transaction = assertExecutionTransaction(eventWindow, transactionId);
    try {
      const restoredPaths = await rollbackTransaction(transaction);
      const publicTransaction = publicExecutionTransaction(transaction);
      unregisterExecutionTransaction(executionTransactionsByRoot, transaction.workspaceRootRealPath);
      executionTransactionByWindow.delete(getWebContentsId(eventWindow));
      executionPlansByTransaction.delete(transactionId);
      sendExecutionEvent(eventWindow, { type: "rolled-back", transactionId, restoredPaths, transaction: publicTransaction });
      return { transaction: publicTransaction, restoredPaths };
    } catch (error) {
      const mapped = mapExecutionError(error);
      sendExecutionError(eventWindow, mapped.code, {
        transactionId,
        message: mapped.message,
        recoverable: false
      });
      throw error;
    }
  });
  ipcMain.handle(IPC_CHANNELS.debugStart, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return debugService.start(request);
  });
  ipcMain.handle(IPC_CHANNELS.debugStop, (_event, ...args) => {
    assertNoIpcArgs(args);
    return debugService.stop();
  });
  ipcMain.handle(IPC_CHANNELS.debugStopAll, (_event, ...args) => {
    assertNoIpcArgs(args);
    return debugService.stopAll();
  });
  ipcMain.handle(IPC_CHANNELS.debugSelectSession, (_event, sessionId, ...args) => {
    assertNoIpcArgs(args);
    return debugService.selectSession(sessionId);
  });
  ipcMain.handle(IPC_CHANNELS.debugRestart, (_event, ...args) => {
    assertNoIpcArgs(args);
    return debugService.restart();
  });
  ipcMain.handle(IPC_CHANNELS.debugPause, (_event, ...args) => {
    assertNoIpcArgs(args);
    return debugService.pause();
  });
  ipcMain.handle(IPC_CHANNELS.debugContinue, (_event, ...args) => {
    assertNoIpcArgs(args);
    return debugService.continue();
  });
  ipcMain.handle(IPC_CHANNELS.debugStepOver, (_event, ...args) => {
    assertNoIpcArgs(args);
    return debugService.stepOver();
  });
  ipcMain.handle(IPC_CHANNELS.debugStepInto, (_event, ...args) => {
    assertNoIpcArgs(args);
    return debugService.stepInto();
  });
  ipcMain.handle(IPC_CHANNELS.debugStepOut, (_event, ...args) => {
    assertNoIpcArgs(args);
    return debugService.stepOut();
  });
  ipcMain.handle(IPC_CHANNELS.debugSetBreakpoint, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return debugService.setBreakpoint(request);
  });
  ipcMain.handle(IPC_CHANNELS.debugRemoveBreakpoint, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return debugService.removeBreakpoint(request);
  });
  ipcMain.handle(IPC_CHANNELS.debugGetBreakpoints, async (_event, ...args) => {
    assertNoIpcArgs(args);
    return (await debugService.getState()).breakpoints;
  });
  ipcMain.handle(IPC_CHANNELS.debugGetState, (_event, ...args) => {
    assertNoIpcArgs(args);
    return debugService.getState();
  });
  ipcMain.handle(IPC_CHANNELS.debugSelectConfiguration, async (_event, name, ...args) => {
    assertNoIpcArgs(args);
    return debugService.selectConfiguration(name);
  });
  ipcMain.handle(IPC_CHANNELS.debugCreateLaunchConfig, async (_event, ...args) => {
    assertNoIpcArgs(args);
    return debugService.createLaunchConfig();
  });
  ipcMain.handle(IPC_CHANNELS.debugAddWatch, async (_event, expression, ...args) => {
    assertNoIpcArgs(args);
    return debugService.addWatch(expression);
  });
  ipcMain.handle(IPC_CHANNELS.debugUpdateWatch, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return debugService.updateWatch(request);
  });
  ipcMain.handle(IPC_CHANNELS.debugRemoveWatch, async (_event, id, ...args) => {
    assertNoIpcArgs(args);
    return debugService.removeWatch(id);
  });
  ipcMain.handle(IPC_CHANNELS.debugLoadVariables, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return debugService.loadVariables(request);
  });
  ipcMain.handle(IPC_CHANNELS.debugEvaluate, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return debugService.evaluate(request);
  });
  ipcMain.handle(IPC_CHANNELS.debugClearConsole, async (_event, ...args) => {
    assertNoIpcArgs(args);
    return debugService.clearConsole();
  });
  ipcMain.handle(IPC_CHANNELS.debugSelectStackFrame, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return debugService.selectStackFrame(request);
  });
  ipcMain.handle(IPC_CHANNELS.debugSetExceptionBreakpoints, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return debugService.setExceptionBreakpoints(request);
  });
  ipcMain.handle(IPC_CHANNELS.debugRefreshLoadedSources, async (_event, ...args) => {
    assertNoIpcArgs(args);
    return debugService.refreshLoadedSources();
  });
  ipcMain.handle(IPC_CHANNELS.debugCompletions, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return debugService.getCompletions(request);
  });
  ipcMain.handle(IPC_CHANNELS.debugCancelEvaluations, (_event, ...args) => {
    assertNoIpcArgs(args);
    debugService.cancelEvaluations();
  });
  ipcMain.handle(IPC_CHANNELS.debugListAdapters, (_event, ...args) => {
    assertNoIpcArgs(args);
    return debugService.listAdapterDefinitions();
  });
  ipcMain.handle(IPC_CHANNELS.debugScanAdapters, async (_event, ...args) => {
    assertNoIpcArgs(args);
    return debugService.scanAdapters();
  });
  ipcMain.handle(IPC_CHANNELS.debugGetAdapterStatus, async (_event, adapterId, ...args) => {
    assertNoIpcArgs(args);
    return debugService.getAdapterStatus(adapterId);
  });
  ipcMain.handle(IPC_CHANNELS.debugInstallAdapter, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return debugService.installAdapter(request);
  });
  ipcMain.handle(IPC_CHANNELS.debugUpdateAdapter, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return debugService.updateAdapter(request);
  });
  ipcMain.handle(IPC_CHANNELS.debugUninstallAdapter, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return debugService.uninstallAdapter(request);
  });
  ipcMain.handle(IPC_CHANNELS.debugValidateAdapter, async (_event, adapterId, ...args) => {
    assertNoIpcArgs(args);
    return debugService.validateAdapter(adapterId);
  });
  ipcMain.handle(IPC_CHANNELS.debugRegisterCustomAdapter, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return debugService.registerTrustedCustomAdapter(request);
  });
  ipcMain.handle(IPC_CHANNELS.debugRevokeCustomAdapter, async (_event, adapterId, ...args) => {
    assertNoIpcArgs(args);
    return debugService.revokeTrustedCustomAdapter(adapterId);
  });
  ipcMain.handle(IPC_CHANNELS.debugDismissAdapterRecommendation, async (_event, adapterId, ...args) => {
    assertNoIpcArgs(args);
    return debugService.dismissAdapterRecommendation(adapterId);
  });
  ipcMain.handle(IPC_CHANNELS.debugCancelAdapterInstall, (_event, ...args) => {
    assertNoIpcArgs(args);
    debugService.cancelAdapterInstall();
  });
  ipcMain.handle(IPC_CHANNELS.debugRevealAdapterLocation, (_event, adapterId, ...args) => {
    assertNoIpcArgs(args);
    const location = debugService.revealAdapterLocation(adapterId);
    shell.showItemInFolder(location);
    return location;
  });
  ipcMain.handle(IPC_CHANNELS.editsPropose, (event, rawRequest) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow) {
      throw new Error("Edit requests require a window.");
    }
    const webContentsId = getWebContentsId(eventWindow);
    if (activeEditGenerations.has(webContentsId)) {
      throw new Error("An edit generation is already active.");
    }
    const requestId = randomUUID();
    let request: EditProposeRequest;
    try {
      request = validateEditProposeRequest(rawRequest);
    } catch {
      sendEditError(eventWindow, "VALIDATION_FAILED", { requestId, message: "The edit request was invalid.", recoverable: false });
      return { requestId };
    }
    void proposeWorkspaceEdit(eventWindow, requestId, request);
    return { requestId };
  });
  ipcMain.handle(IPC_CHANNELS.editsCancel, (event, requestId) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow || typeof requestId !== "string") {
      return;
    }
    const active = activeEditGenerations.get(getWebContentsId(eventWindow));
    if (active?.requestId === requestId) {
      abortActiveEditGeneration(getWebContentsId(eventWindow), "user");
    }
  });
  ipcMain.handle(IPC_CHANNELS.editsReject, (event, proposalId) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow || typeof proposalId !== "string") {
      throw new Error("Invalid edit proposal.");
    }
    const proposals = getEditProposalMap(getWebContentsId(eventWindow));
    const proposal = proposals.get(proposalId);
    if (proposal) {
      proposal.status = "rejected";
      proposals.delete(proposalId);
    }
    sendEditEvent(eventWindow, { type: "rejected", proposalId });
  });
  ipcMain.handle(IPC_CHANNELS.editsApply, async (event, proposalId) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow || typeof proposalId !== "string") {
      throw new Error("Invalid edit proposal.");
    }
    const webContentsId = getWebContentsId(eventWindow);
    const proposal = getEditProposalMap(webContentsId).get(proposalId);
    if (!proposal || proposal.status !== "pending") {
      sendEditError(eventWindow, "STALE_PROPOSAL", { proposalId, recoverable: false });
      throw new Error("Proposal is not available.");
    }
    const started = performance.now();
    try {
      const { result, undo } = await applyInternalProposal(proposal);
      result.timings.applyMs = Math.round(performance.now() - started);
      undoByWindow.set(webContentsId, undo);
      getEditProposalMap(webContentsId).delete(proposalId);
      sendEditEvent(eventWindow, { type: "applied", proposalId, relativePath: result.relativePath });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      sendEditError(eventWindow, message?.includes("changed since") ? "STALE_PROPOSAL" : "WRITE_FAILED", {
        proposalId,
        message
      });
      throw error;
    }
  });
  ipcMain.handle(IPC_CHANNELS.editsUndoLast, async (event) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow) {
      throw new Error("Undo requests require a window.");
    }
    const webContentsId = getWebContentsId(eventWindow);
    const undo = undoByWindow.get(webContentsId);
    if (!undo) {
      sendEditError(eventWindow, "UNDO_UNAVAILABLE", { recoverable: false });
      throw new Error("No Levi edit is available to undo.");
    }
    try {
      const result = await undoLastEdit(undo);
      undoByWindow.delete(webContentsId);
      sendEditEvent(eventWindow, { type: "undone", relativePath: result.relativePath });
      return result;
    } catch (error) {
      sendEditError(eventWindow, "UNDO_UNAVAILABLE", {
        message: error instanceof Error ? error.message : undefined
      });
      throw error;
    }
  });
  ipcMain.handle(IPC_CHANNELS.terminalCreate, (event, request, ...args) => {
    assertNoIpcArgs(args);
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow) {
      throw new Error("Terminal requests require a window.");
    }
    return terminalManager.create(eventWindow, request);
  });
  ipcMain.handle(IPC_CHANNELS.terminalWrite, (_event, id, data, ...args) => {
    assertNoIpcArgs(args);
    terminalManager.write(id, data);
  });
  ipcMain.handle(IPC_CHANNELS.terminalResize, (_event, request, ...args) => {
    assertNoIpcArgs(args);
    terminalManager.resize(request);
  });
  ipcMain.handle(IPC_CHANNELS.terminalDispose, (_event, id, ...args) => {
    assertNoIpcArgs(args);
    terminalManager.dispose(id);
  });
  ipcMain.handle(IPC_CHANNELS.terminalKill, (_event, id, ...args) => {
    assertNoIpcArgs(args);
    return terminalManager.kill(id);
  });
  ipcMain.handle(IPC_CHANNELS.terminalRename, (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return terminalManager.rename(request);
  });
  ipcMain.handle(IPC_CHANNELS.terminalList, (_event, ...args) => {
    assertNoIpcArgs(args);
    return terminalManager.list();
  });
  ipcMain.handle(IPC_CHANNELS.terminalSplit, (event, request, ...args) => {
    assertNoIpcArgs(args);
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow) {
      throw new Error("Terminal requests require a window.");
    }
    return terminalManager.split(eventWindow, request);
  });
  ipcMain.handle(IPC_CHANNELS.terminalRestart, (_event, id, ...args) => {
    assertNoIpcArgs(args);
    return terminalManager.restart(id);
  });
  ipcMain.handle(IPC_CHANNELS.terminalGetLayout, (_event, ...args) => {
    assertNoIpcArgs(args);
    return terminalManager.getLayout();
  });
  ipcMain.handle(IPC_CHANNELS.terminalSetLayout, async (_event, layout, ...args) => {
    assertNoIpcArgs(args);
    return terminalManager.setLayout(layout);
  });
  ipcMain.handle(IPC_CHANNELS.terminalRevealCwd, (_event, id, ...args) => {
    assertNoIpcArgs(args);
    return terminalManager.revealCwd(id);
  });
  ipcMain.handle(IPC_CHANNELS.tasksList, (_event, ...args) => {
    assertNoIpcArgs(args);
    return taskService.list();
  });
  ipcMain.handle(IPC_CHANNELS.tasksRun, (event, request, ...args) => {
    assertNoIpcArgs(args);
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow) {
      throw new Error("Task requests require a window.");
    }
    return taskService.run(request, eventWindow);
  });
  ipcMain.handle(IPC_CHANNELS.tasksCancel, (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return taskService.cancel(request);
  });
  ipcMain.handle(IPC_CHANNELS.tasksHistory, (_event, ...args) => {
    assertNoIpcArgs(args);
    return taskService.getHistory();
  });
  ipcMain.handle(IPC_CHANNELS.tasksProblems, (_event, ...args) => {
    assertNoIpcArgs(args);
    return taskService.getProblems();
  });
  ipcMain.handle(IPC_CHANNELS.tasksOutput, (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return taskService.getOutput(request);
  });
  ipcMain.handle(IPC_CHANNELS.tasksPin, (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return taskService.pin(request);
  });
  ipcMain.handle(IPC_CHANNELS.runtimeList, (_event, ...args) => {
    assertNoIpcArgs(args);
    return aiRuntimeManager.list();
  });
  ipcMain.handle(IPC_CHANNELS.runtimeDetect, async (_event, ...args) => {
    assertNoIpcArgs(args);
    return aiRuntimeManager.detect();
  });
  ipcMain.handle(IPC_CHANNELS.runtimeHealth, async (_event, providerId, ...args) => {
    assertNoIpcArgs(args);
    return aiRuntimeManager.health(aiRuntimeManager.validateProviderId(providerId));
  });
  ipcMain.handle(IPC_CHANNELS.runtimeModels, async (_event, providerId, ...args) => {
    assertNoIpcArgs(args);
    return aiRuntimeManager.models(aiRuntimeManager.validateProviderId(providerId));
  });
  ipcMain.handle(IPC_CHANNELS.runtimeSelect, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return aiRuntimeManager.select(request);
  });
  ipcMain.handle(IPC_CHANNELS.runtimeDiagnostics, (_event, ...args) => {
    assertNoIpcArgs(args);
    return aiRuntimeManager.diagnostics();
  });
  ipcMain.handle(IPC_CHANNELS.runtimeChat, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return aiRuntimeManager.chat(request);
  });
  ipcMain.handle(IPC_CHANNELS.runtimeCompletion, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return aiRuntimeManager.completion(request);
  });
  ipcMain.handle(IPC_CHANNELS.runtimeStream, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return aiRuntimeManager.stream(request);
  });
  ipcMain.handle(IPC_CHANNELS.runtimeEmbeddings, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return aiRuntimeManager.embeddings(request);
  });
  ipcMain.handle(IPC_CHANNELS.runtimePullModel, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return aiRuntimeManager.pullModel(request);
  });
  ipcMain.handle(IPC_CHANNELS.runtimeDeleteModel, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return aiRuntimeManager.deleteModel(request);
  });
  ipcMain.handle(IPC_CHANNELS.runtimeStart, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return aiRuntimeManager.start(request);
  });
  ipcMain.handle(IPC_CHANNELS.runtimeStop, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return aiRuntimeManager.stop(request);
  });
  ipcMain.handle(IPC_CHANNELS.runtimeRestart, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return aiRuntimeManager.restart(request);
  });
  ipcMain.handle(IPC_CHANNELS.runtimeCancel, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return aiRuntimeManager.cancel(request);
  });
  ipcMain.handle(IPC_CHANNELS.chatList, (_event, ...args) => {
    assertNoIpcArgs(args);
    return chatService.list();
  });
  ipcMain.handle(IPC_CHANNELS.chatNew, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return chatService.newChat(request);
  });
  ipcMain.handle(IPC_CHANNELS.chatDelete, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return chatService.delete(request);
  });
  ipcMain.handle(IPC_CHANNELS.chatRename, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return chatService.rename(request);
  });
  ipcMain.handle(IPC_CHANNELS.chatDeleteMessage, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return chatService.deleteMessage(request);
  });
  ipcMain.handle(IPC_CHANNELS.chatFork, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return chatService.fork(request);
  });
  ipcMain.handle(IPC_CHANNELS.chatArchive, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return chatService.archive(request);
  });
  ipcMain.handle(IPC_CHANNELS.chatSearch, (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return chatService.search(request);
  });
  ipcMain.handle(IPC_CHANNELS.chatContextDiscover, async (_event, ...args) => {
    assertNoIpcArgs(args);
    return chatService.discoverContext();
  });
  ipcMain.handle(IPC_CHANNELS.chatContextPreview, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return chatService.previewContext(request);
  });
  ipcMain.handle(IPC_CHANNELS.chatContextBudget, (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return chatService.budget(request);
  });
  ipcMain.handle(IPC_CHANNELS.chatOpenCitation, (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return chatService.openCitation(request);
  });
  ipcMain.handle(IPC_CHANNELS.chatSend, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return chatService.send(request);
  });
  ipcMain.handle(IPC_CHANNELS.chatCancel, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return chatService.cancel(request);
  });
  ipcMain.handle(IPC_CHANNELS.chatExport, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return chatService.export(request);
  });
  ipcMain.handle(IPC_CHANNELS.chatSetPanel, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return chatService.setPanel(request);
  });
  ipcMain.handle(IPC_CHANNELS.chatPin, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return chatService.pin(request);
  });
  ipcMain.handle(IPC_CHANNELS.agentNewSession, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return agentService.newSession(request);
  });
  ipcMain.handle(IPC_CHANNELS.agentList, (_event, ...args) => {
    assertNoIpcArgs(args);
    return agentService.list();
  });
  ipcMain.handle(IPC_CHANNELS.agentDelete, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return agentService.delete(request);
  });
  ipcMain.handle(IPC_CHANNELS.agentRename, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return agentService.rename(request);
  });
  ipcMain.handle(IPC_CHANNELS.agentArchive, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return agentService.archive(request);
  });
  ipcMain.handle(IPC_CHANNELS.agentPlan, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return agentService.plan(request);
  });
  ipcMain.handle(IPC_CHANNELS.agentApprove, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return agentService.approve(request);
  });
  ipcMain.handle(IPC_CHANNELS.agentReject, async (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return agentService.reject(request);
  });
  ipcMain.handle(IPC_CHANNELS.agentStatus, (_event, request, ...args) => {
    assertNoIpcArgs(args);
    return agentService.status(request);
  });
  ipcMain.handle(IPC_CHANNELS.conversationStart, async (event, rawRequest) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow) {
      throw new Error("Conversation requests require a window.");
    }
    const webContentsId = getWebContentsId(eventWindow);
    if (legacyChatRequestsByWindow.has(webContentsId)) {
      throw new Error("A generation is already active.");
    }
    const requestId = randomUUID();
    let request: ConversationStartRequest;
    try {
      request = validateConversationRequest(rawRequest);
    } catch {
      sendConversationError(eventWindow, requestId, "INVALID_REQUEST", false);
      return { requestId };
    }
    const lastUser = getLastUserMessage(request);
    if (!lastUser) {
      sendConversationError(eventWindow, requestId, "INVALID_REQUEST", false);
      return { requestId };
    }
    try {
      const existingConversationId = request.messages.length > 1 ? legacyChatConversationsByWindow.get(webContentsId) : undefined;
      const result = await chatService.send({
        conversationId: existingConversationId,
        content: lastUser.content,
        modelId: request.model
      });
      const conversationId = result.state.activeConversationId;
      if (conversationId) {
        legacyChatRequestsByWindow.set(webContentsId, { requestId: result.requestId, conversationId });
        legacyChatConversationsByWindow.set(webContentsId, conversationId);
        legacyChatWindowByRequest.set(result.requestId, webContentsId);
      }
      return { requestId: result.requestId };
    } catch (error) {
      sendConversationEvent(eventWindow, {
        type: "error",
        requestId,
        code: "UNKNOWN",
        message: error instanceof Error ? error.message : "Levi could not start the local response. You can retry.",
        recoverable: true
      });
      return { requestId };
    }
  });
  ipcMain.handle(IPC_CHANNELS.conversationCancel, (event, requestId) => {
    const eventWindow = BrowserWindow.fromWebContents(event.sender);
    if (!eventWindow || typeof requestId !== "string") {
      return;
    }
    void chatService.cancel({ requestId });
  });

  if (liveAcceptanceEnabled()) {
    ipcMain.handle(IPC_CHANNELS.devOpenProjectPath, async (_event, directoryPath) => {
      if (typeof directoryPath !== "string" || !path.isAbsolute(directoryPath)) {
        throw new Error("Invalid project path.");
      }
      return openProjectAtPath(directoryPath);
    });
    ipcMain.handle(IPC_CHANNELS.devInjectPlan, (event, plan) => {
      if (!liveAcceptanceEnabled()) {
        throw new Error("Live acceptance is not enabled.");
      }
      const eventWindow = BrowserWindow.fromWebContents(event.sender);
      if (!eventWindow || !plan || typeof plan !== "object") {
        throw new Error("Invalid plan payload.");
      }
      latestPlanByWindow.set(getWebContentsId(eventWindow), plan as ExecutionPlan);
      sendPlanningEvent(eventWindow, { type: "plan", requestId: "live-inject", plan: plan as ExecutionPlan });
      return { planId: (plan as ExecutionPlan).planId };
    });
    ipcMain.handle(IPC_CHANNELS.devGetTimings, () => ({ ...liveTimings }));
  }
}

function isAllowedAppUrl(url: string): boolean {
  if (process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL)) {
    return true;
  }
  return url.startsWith("file://");
}

async function createWindow(): Promise<void> {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    title: "Levi",
    backgroundColor: "#f7f8fa",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://levicore.local/")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedAppUrl(url)) {
      event.preventDefault();
    }
  });
  mainWindow.on("close", (event) => {
    if (!workspaceScan) {
      return;
    }
    const active = getActiveTransactionForRoot(executionTransactionsByRoot, workspaceScan.rootRealPath);
    if (!active) {
      return;
    }
    const hasAppliedSteps = active.steps.some((step) => step.status === "applied");
    const isFinalized = active.status === "kept" || active.status === "rolled-back" || active.status === "cancelled";
    if (!hasAppliedSteps || isFinalized) {
      return;
    }
    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: "warning",
      buttons: ["Stay Open", "Close Anyway"],
      defaultId: 0,
      cancelId: 0,
      title: "Active Execution Transaction",
      message: "Applied file changes are not finalized.",
      detail:
        "Keep or roll back the transaction before closing if you need rollback protection. Rollback data does not survive restart."
    });
    if (choice === 0) {
      event.preventDefault();
    }
  });
  const mainWindowWebContentsId = getWebContentsId(mainWindow);
  const updateWindow = mainWindow;
  const unsubscribeUpdates = updateService.onStatus((status) => {
    sendUpdateEvent(updateWindow, { type: "status", status });
  });
  const unsubscribeDebug = debugService.onEvent((event) => {
    sendDebugEvent(updateWindow, event);
  });
  mainWindow.webContents.on("destroyed", () => {
    unsubscribeUpdates();
    unsubscribeDebug();
    const legacyActive = legacyChatRequestsByWindow.get(mainWindowWebContentsId);
    if (legacyActive) {
      void chatService.cancel({ requestId: legacyActive.requestId });
      legacyChatWindowByRequest.delete(legacyActive.requestId);
    }
    legacyChatRequestsByWindow.delete(mainWindowWebContentsId);
    legacyChatConversationsByWindow.delete(mainWindowWebContentsId);
    abortActiveEditGeneration(mainWindowWebContentsId, "window-closed");
    abortActivePlanningGeneration(mainWindowWebContentsId, "window-closed");
    abortActiveExecutionGeneration(mainWindowWebContentsId, "window-closed");
    void debugService.stop();
    citationSourcesByWindow.delete(mainWindowWebContentsId);
    editProposalsByWindow.delete(mainWindowWebContentsId);
    undoByWindow.delete(mainWindowWebContentsId);
    latestPlanByWindow.delete(mainWindowWebContentsId);
    executionTransactionByWindow.delete(mainWindowWebContentsId);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../../../dist/index.html"));
  }
}

app.whenReady().then(async () => {
  await readRecentProject();
  registerIpc();
  await debugService.initializeAdapters();
  await terminalManager.initialize();
  await taskService.initialize();
  await aiRuntimeManager.initialize();
  await chatService.initialize();
  await agentService.initialize();
  registerDebugTaskRunner(async (taskName) => {
    if (!mainWindow) {
      return { success: false, message: "No active window is available to run tasks." };
    }
    return taskService.runByName(taskName, mainWindow);
  });
  await createWindow();

  if (liveAcceptanceEnabled() && process.env.LEVI_OPEN_PROJECT_PATH) {
    try {
      await openProjectAtPath(process.env.LEVI_OPEN_PROJECT_PATH);
    } catch (error) {
      console.error("Failed to open live acceptance project:", error);
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("before-quit", () => {
  invalidateProjectRules("idle");
  void debugService.dispose();
  void desktopRuntimeService.shutdown();
  aiRuntimeManager.dispose();
  terminalManager.disposeAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
