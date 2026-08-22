import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { app } from "electron";
import type {
  AgentActionType,
  AgentApprovalAction,
  AgentApprovalRequest,
  AgentArchiveRequest,
  AgentBrowserExecuteRequest,
  AgentBrowserPreviewRequest,
  AgentBrowserStatusRequest,
  AgentCancelRequest,
  AgentDeleteRequest,
  AgentExecuteRequest,
  AgentEvent,
  AgentExecutionPlan,
  AgentGitExecuteRequest,
  AgentGitPreviewRequest,
  AgentGitStatusRequest,
  AgentMessage,
  AgentNewSessionRequest,
  AgentPlanRequest,
  AgentPlanResult,
  AgentPlanStep,
  AgentPreviewRequest,
  AgentProjectSummary,
  AgentQueueRequest,
  AgentRepairPlanRequest,
  AgentRepairExecuteRequest,
  AgentRepairStatusRequest,
  AgentRestoreOperationRequest,
  AgentRenameRequest,
  AgentSession,
  AgentState,
  AgentStatusRequest,
  AgentTerminalCancelRequest,
  AgentTerminalExecuteRequest,
  AgentTerminalPreviewRequest,
  AgentTerminalStatusRequest,
  AgentUndoRequest,
  AgentVerifyRequest
} from "../../src/features/agent";
import type { AIChatAttachment } from "../../src/features/ai-chat";
import type { AIRuntimeProviderId } from "../../src/features/ai-runtime";
import type { WorkspaceStatus } from "../../src/types/levi-api";
import { RuntimeManager, validateModelId, validateRuntimeProviderId } from "./ai-runtime";
import { AgentExecutionService } from "./agent-execution-service";
import {
  detectNewAppIntent,
  shouldBootstrapInChild,
  starterById,
  type ProjectStarterInfo,
  type StarterCommand,
  type StarterFile
} from "./project-workflows";
import type { TaskService } from "./tasks/task-service";
import type { GitService } from "./git-service";
import type { TerminalManager } from "./terminal-manager";
import type { BrowserService } from "./browser-service";
import { listWorkspaceTree } from "./workspace-tree-ipc";
import type { BrowserWindow } from "electron";

const AGENT_STATE_FILE = "coding-agent-state.json";
const MAX_SESSIONS = 80;
const MAX_MESSAGES = 80;
const MAX_PROMPT_LENGTH = 40_000;
const MAX_TITLE_LENGTH = 120;
const MAX_ATTACHMENTS = 12;
const MAX_OPEN_FILES = 24;
const MAX_PLAN_STEPS = 12;
const MAX_ACTIONS = 40;
const GIT_TIMEOUT_MS = 2_000;
const ACTION_TYPES: AgentActionType[] = [
  "create-file",
  "modify-file",
  "delete-file",
  "rename-file",
  "create-folder",
  "rename-folder",
  "run-task",
  "run-terminal-command",
  "git-operation",
  "browser-open",
  "browser-navigate",
  "browser-click",
  "browser-fill",
  "browser-screenshot",
  "browser-close"
];

type AgentServiceOptions = {
  statePath?: string;
  emit?: (event: AgentEvent) => void;
  getWorkspaceRoot?: () => string | null;
  getWorkspaceStatus?: () => WorkspaceStatus;
  getWindow?: () => BrowserWindow | null;
  taskService?: TaskService;
  gitService?: GitService;
  terminalManager?: TerminalManager;
  browserService?: BrowserService;
  getChangedFiles?: () => string[];
};

type AgentPersistence = {
  sessions: AgentSession[];
  activeSessionId?: string;
  recoveryState?: { corruptionRecovered?: boolean };
};

export class AgentService {
  private readonly statePath: string;
  private readonly emit: (event: AgentEvent) => void;
  private readonly executionService: AgentExecutionService;
  private readonly disposables: Array<() => void> = [];
  private persistence: AgentPersistence = defaultPersistence();
  private persistChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly runtimeManager: RuntimeManager,
    private readonly options: AgentServiceOptions = {}
  ) {
    this.statePath =
      options.statePath ??
      path.join(typeof app?.getPath === "function" ? app.getPath("userData") : os.tmpdir(), AGENT_STATE_FILE);
    this.emit = options.emit ?? (() => undefined);
    this.executionService = new AgentExecutionService({
      getWorkspaceRoot: () => this.options.getWorkspaceRoot?.() ?? null,
      snapshot: () => this.snapshot(),
      persistAndEmit: () => this.persistAndEmit(),
      emitExecution: (sessionId, actionId) => this.emit({ type: "execution", sessionId, actionId, state: this.snapshot() }),
      emitPreview: (sessionId, preview) => this.emit({ type: "preview", sessionId, preview, state: this.snapshot() }),
      emitTaskPreview: (sessionId, preview) => this.emit({ type: "task-preview", sessionId, preview, state: this.snapshot() }),
      emitTask: (sessionId, actionId, taskRun) => this.emit({ type: "task", sessionId, actionId, taskRun, state: this.snapshot() }),
      emitTaskVerification: (sessionId, actionId, verification) => this.emit({ type: "task-verification", sessionId, actionId, verification, state: this.snapshot() }),
      emitTerminalPreview: (sessionId, preview) => this.emit({ type: "terminal-preview", sessionId, preview, state: this.snapshot() }),
      emitTerminal: (sessionId, actionId, terminalRun) => this.emit({ type: "terminal", sessionId, actionId, terminalRun, state: this.snapshot() }),
      emitGitPreview: (sessionId, preview) => this.emit({ type: "git-preview", sessionId, preview, state: this.snapshot() }),
      emitGit: (sessionId, actionId, gitRun) => this.emit({ type: "git", sessionId, actionId, gitRun, state: this.snapshot() }),
      emitVerification: (sessionId, report) => this.emit({ type: "verification", sessionId, report, state: this.snapshot() }),
      emitRepairPlan: (sessionId, reportId, repairs) => this.emit({ type: "repair-plan", sessionId, reportId, repairs, state: this.snapshot() }),
      emitBrowserPreview: (sessionId, preview) => this.emit({ type: "browser-preview", sessionId, preview, state: this.snapshot() }),
      emitBrowser: (sessionId, actionId, browserRun) => this.emit({ type: "browser", sessionId, actionId, browserRun, state: this.snapshot() }),
      taskService: this.options.taskService,
      gitService: this.options.gitService,
      terminalManager: this.options.terminalManager,
      browserService: this.options.browserService,
      runtimeManager: this.runtimeManager,
      getWindow: () => this.options.getWindow?.() ?? null,
      getChangedFiles: () => this.options.getChangedFiles?.() ?? []
    });
    const taskEvents = this.options.taskService?.onEvent((event) => this.executionService.handleTaskEvent(event));
    if (taskEvents) this.disposables.push(taskEvents);
    const terminalData = this.options.terminalManager?.onTerminalData((sessionId, data) => this.executionService.handleTerminalData(sessionId, data));
    if (terminalData) this.disposables.push(terminalData);
  }

  async initialize(): Promise<AgentState> {
    await this.load();
    for (const session of this.persistence.sessions) {
      this.executionService.hydrateRecovery(session);
      this.executionService.markInterrupted(session);
    }
    await this.persist();
    return this.snapshot();
  }

  dispose(): void {
    this.executionService.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.();
    }
  }

  list(): AgentState {
    return this.snapshot();
  }

  status(rawRequest: unknown = {}): AgentState | AgentSession {
    const request = validateStatusRequest(rawRequest);
    if (!request.sessionId) return this.snapshot();
    return this.requireSession(request.sessionId);
  }

  async newSession(rawRequest: unknown = {}): Promise<AgentState> {
    const request = validateNewSessionRequest(rawRequest);
    const now = new Date().toISOString();
    const session: AgentSession = {
      id: randomUUID(),
      title: request.title ?? "New Agent Session",
      status: "Idle",
      archived: false,
      runtimeId: request.runtimeId,
      modelId: request.modelId,
      messages: [],
      attachments: [],
      createdAt: now,
      updatedAt: now
    };
    this.persistence.sessions = [session, ...this.persistence.sessions].slice(0, MAX_SESSIONS);
    this.persistence.activeSessionId = session.id;
    await this.persistAndEmit();
    return this.snapshot();
  }

  async rename(rawRequest: unknown): Promise<AgentState> {
    const request = validateRenameRequest(rawRequest);
    const session = this.requireSession(request.sessionId);
    session.title = request.title;
    session.updatedAt = new Date().toISOString();
    await this.persistAndEmit();
    return this.snapshot();
  }

  async archive(rawRequest: unknown): Promise<AgentState> {
    const request = validateArchiveRequest(rawRequest);
    const session = this.requireSession(request.sessionId);
    session.archived = request.archived;
    session.status = request.archived ? "Archived" : session.plan ? "WaitingForApproval" : "Idle";
    session.updatedAt = new Date().toISOString();
    if (request.archived && this.persistence.activeSessionId === session.id) {
      this.persistence.activeSessionId = this.persistence.sessions.find((item) => !item.archived && item.id !== session.id)?.id;
    }
    await this.persistAndEmit();
    return this.snapshot();
  }

  async delete(rawRequest: unknown): Promise<AgentState> {
    const request = validateDeleteRequest(rawRequest);
    this.persistence.sessions = this.persistence.sessions.filter((item) => item.id !== request.sessionId);
    if (this.persistence.activeSessionId === request.sessionId) {
      this.persistence.activeSessionId = this.persistence.sessions.find((item) => !item.archived)?.id ?? this.persistence.sessions[0]?.id;
    }
    await this.persistAndEmit();
    return this.snapshot();
  }

  async plan(rawRequest: unknown): Promise<AgentPlanResult> {
    const request = validatePlanRequest(rawRequest);
    const ownerObjective = ownerObjectiveFromPrompt(request.prompt);
    const session = request.sessionId
      ? this.requireSession(request.sessionId)
      : await this.createSessionForPlan(request);
    const now = new Date().toISOString();
    session.status = "Planning";
    session.runtimeId = request.runtimeId ?? session.runtimeId;
    session.modelId = request.modelId;
    session.attachments = request.attachments ?? [];
    session.error = undefined;
    session.messages = [...session.messages, { id: randomUUID(), role: "user" as const, content: ownerObjective, createdAt: now }].slice(-MAX_MESSAGES);
    this.persistence.activeSessionId = session.id;
    await this.persistAndEmit();

    const projectSummary = await this.analyzeWorkspace(request);
    const workspaceSummary = this.options.getWorkspaceStatus?.().summary;
    const bootstrapPlan = createDeterministicNewAppPlan(ownerObjective, projectSummary, workspaceSummary);
    if (bootstrapPlan) {
      session.projectSummary = projectSummary;
      session.plan = bootstrapPlan;
      session.status = "WaitingForApproval";
      session.messages = [...session.messages, { id: randomUUID(), role: "assistant" as const, content: bootstrapPlan.summary, createdAt: new Date().toISOString() }].slice(-MAX_MESSAGES);
      session.title = session.title === "New Agent Session" ? titleFromPrompt(ownerObjective) : session.title;
      session.updatedAt = new Date().toISOString();
      await this.persistAndEmit();
      this.emit({ type: "progress", sessionId: session.id, state: this.snapshot() });
      return { sessionId: session.id, state: this.snapshot() };
    }
    const existingBuildPlan = createDeterministicExistingProjectBuildPlan(ownerObjective, projectSummary, workspaceSummary);
    if (existingBuildPlan) {
      session.projectSummary = projectSummary;
      session.plan = existingBuildPlan;
      session.status = "WaitingForApproval";
      session.messages = [...session.messages, { id: randomUUID(), role: "assistant" as const, content: existingBuildPlan.summary, createdAt: new Date().toISOString() }].slice(-MAX_MESSAGES);
      session.title = session.title === "New Agent Session" ? titleFromPrompt(ownerObjective) : session.title;
      session.updatedAt = new Date().toISOString();
      await this.persistAndEmit();
      this.emit({ type: "progress", sessionId: session.id, state: this.snapshot() });
      return { sessionId: session.id, state: this.snapshot() };
    }
    try {
      const response = await this.runtimeManager.chat({
        providerId: request.runtimeId ?? session.runtimeId,
        model: request.modelId,
        timeoutMs: 300_000,
        messages: [
          {
            role: "system",
            content:
              "You are Levi's planning-only coding agent. Produce a structured execution plan only. Do not claim to edit files, run commands, use tools, or execute the plan. Return JSON with summary and steps. Every proposed action must wait for user approval."
          },
          {
            role: "user",
            content: buildPlanningPrompt(ownerObjective, projectSummary, request.attachments ?? [])
          }
        ],
        options: { format: "json" }
      });
      session.projectSummary = projectSummary;
      session.plan = createExecutionPlan(ownerObjective, response.content, projectSummary);
      session.status = session.plan.progress.pendingActions > 0 ? "WaitingForApproval" : "Ready";
      session.messages = [...session.messages, { id: randomUUID(), role: "assistant" as const, content: session.plan.summary, createdAt: new Date().toISOString() }].slice(-MAX_MESSAGES);
    } catch (error) {
      session.projectSummary = projectSummary;
      session.plan = createFallbackPlan(ownerObjective, projectSummary);
      session.status = "WaitingForApproval";
      session.error = errorMessage(error);
      session.messages = [
        ...session.messages,
        {
          id: randomUUID(),
          role: "assistant" as const,
          content: `${session.plan.summary}\n\nPlanning used the conservative fallback because the model request failed: ${session.error}`,
          createdAt: new Date().toISOString()
        }
      ].slice(-MAX_MESSAGES);
    }
    session.title = session.title === "New Agent Session" ? titleFromPrompt(ownerObjective) : session.title;
    session.updatedAt = new Date().toISOString();
    await this.persistAndEmit();
    this.emit({ type: "progress", sessionId: session.id, state: this.snapshot() });
    return { sessionId: session.id, state: this.snapshot() };
  }

  async approve(rawRequest: unknown): Promise<AgentState> {
    return this.setApprovalState(validateApprovalRequest(rawRequest), "Approved");
  }

  async reject(rawRequest: unknown): Promise<AgentState> {
    return this.setApprovalState(validateApprovalRequest(rawRequest), "Rejected");
  }

  async preview(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentPreviewRequest>(rawRequest, "Agent preview request is invalid."));
    return this.executionService.preview(session, rawRequest);
  }

  async execute(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentExecuteRequest>(rawRequest, "Agent execute request is invalid."));
    return this.executionService.execute(session, rawRequest);
  }

  async undo(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentUndoRequest>(rawRequest, "Agent undo request is invalid."));
    return this.executionService.undo(session, rawRequest);
  }

  async restoreOperation(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentRestoreOperationRequest>(rawRequest, "Agent restore request is invalid."));
    return this.executionService.restoreOperation(session, rawRequest);
  }

  queue(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentQueueRequest>(rawRequest, "Agent queue request is invalid."));
    return this.executionService.queue(session, rawRequest);
  }

  async cancel(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentCancelRequest>(rawRequest, "Agent cancel request is invalid."));
    return this.executionService.cancel(session, rawRequest);
  }

  async taskPreview(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest(rawRequest, "Agent task preview request is invalid."));
    return this.executionService.taskPreview(session, rawRequest);
  }

  async taskExecute(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest(rawRequest, "Agent task execute request is invalid."));
    return this.executionService.taskExecute(session, rawRequest);
  }

  async taskCancel(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest(rawRequest, "Agent task cancel request is invalid."));
    return this.executionService.taskCancel(session, rawRequest);
  }

  taskStatus(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest(rawRequest, "Agent task status request is invalid."));
    return this.executionService.taskStatus(session, rawRequest);
  }

  async taskVerify(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest(rawRequest, "Agent task verify request is invalid."));
    return this.executionService.taskVerify(session, rawRequest);
  }

  async terminalPreview(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentTerminalPreviewRequest>(rawRequest, "Agent terminal preview request is invalid."));
    return this.executionService.terminalPreview(session, rawRequest);
  }

  async terminalExecute(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentTerminalExecuteRequest>(rawRequest, "Agent terminal execute request is invalid."));
    return this.executionService.terminalExecute(session, rawRequest);
  }

  async terminalCancel(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentTerminalCancelRequest>(rawRequest, "Agent terminal cancel request is invalid."));
    return this.executionService.terminalCancel(session, rawRequest);
  }

  terminalStatus(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentTerminalStatusRequest>(rawRequest, "Agent terminal status request is invalid."));
    return this.executionService.terminalStatus(session, rawRequest);
  }

  async gitPreview(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentGitPreviewRequest>(rawRequest, "Agent Git preview request is invalid."));
    return this.executionService.gitPreview(session, rawRequest);
  }

  async gitExecute(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentGitExecuteRequest>(rawRequest, "Agent Git execute request is invalid."));
    return this.executionService.gitExecute(session, rawRequest);
  }

  gitStatus(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentGitStatusRequest>(rawRequest, "Agent Git status request is invalid."));
    return this.executionService.gitStatus(session, rawRequest);
  }

  async verify(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentVerifyRequest>(rawRequest, "Agent verify request is invalid."));
    return this.executionService.verify(session, rawRequest);
  }

  async repairPlan(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentRepairPlanRequest>(rawRequest, "Agent repair plan request is invalid."));
    return this.executionService.repairPlan(session, rawRequest);
  }

  async repairExecute(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentRepairExecuteRequest>(rawRequest, "Agent repair execute request is invalid."));
    return this.executionService.repairExecute(session, rawRequest);
  }

  repairStatus(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentRepairStatusRequest>(rawRequest, "Agent repair status request is invalid."));
    return this.executionService.repairStatus(session, rawRequest);
  }

  async browserPreview(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentBrowserPreviewRequest>(rawRequest, "Agent browser preview request is invalid."));
    return this.executionService.browserPreview(session, rawRequest);
  }

  async browserExecute(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentBrowserExecuteRequest>(rawRequest, "Agent browser execute request is invalid."));
    return this.executionService.browserExecute(session, rawRequest);
  }

  browserStatus(rawRequest: unknown) {
    const session = this.requireSession(sessionIdFromRequest<AgentBrowserStatusRequest>(rawRequest, "Agent browser status request is invalid."));
    return this.executionService.browserStatus(session, rawRequest);
  }

  private async setApprovalState(request: AgentApprovalRequest, status: "Approved" | "Rejected"): Promise<AgentState> {
    const session = this.requireSession(request.sessionId);
    if (!session.plan) throw new Error("Agent session has no execution plan.");
    const action = session.plan.approvals.find((item) => item.id === request.actionId);
    if (!action) {
      const repair = session.plan.repairQueue?.find((item) => item.id === request.actionId);
      if (!repair) throw new Error("Agent approval action was not found.");
      if (repair.status === "Cancelled" || repair.status === "Completed") throw new Error("Completed or cancelled repair items cannot be changed.");
      repair.status = status === "Approved" ? "Approved" : "Rejected";
      repair.updatedAt = new Date().toISOString();
      if (status === "Approved") {
        session.plan.repairProgress = [
          ...(session.plan.repairProgress ?? []),
          {
            id: randomUUID(),
            stage: "Repair Approved" as const,
            reportId: repair.reportId,
            repairId: repair.id,
            createdAt: repair.updatedAt
          }
        ].slice(-80);
      }
      session.plan.updatedAt = new Date().toISOString();
      session.status = "Ready";
      session.updatedAt = new Date().toISOString();
      await this.persistAndEmit();
      this.emit({ type: "progress", sessionId: session.id, state: this.snapshot() });
      return this.snapshot();
    }
    if (action.status === "Cancelled") throw new Error("Cancelled agent actions cannot be changed.");
    action.status = status;
    action.updatedAt = new Date().toISOString();
    for (const step of session.plan.steps) {
      const actions = session.plan.approvals.filter((item) => item.stepId === step.id);
      if (actions.some((item) => item.status === "Rejected")) step.status = "Rejected";
      else if (actions.length > 0 && actions.every((item) => item.status === "Approved")) step.status = "Approved";
      else step.status = "Pending";
    }
    session.plan.progress = progressFromApprovals(session.plan);
    session.plan.updatedAt = new Date().toISOString();
    session.status = session.plan.progress.pendingActions > 0 ? "WaitingForApproval" : "Ready";
    session.updatedAt = new Date().toISOString();
    await this.persistAndEmit();
    this.emit({ type: "progress", sessionId: session.id, state: this.snapshot() });
    return this.snapshot();
  }

  private async createSessionForPlan(request: AgentPlanRequest): Promise<AgentSession> {
    await this.newSession({ title: titleFromPrompt(request.prompt), runtimeId: request.runtimeId, modelId: request.modelId });
    return this.requireSession(this.persistence.activeSessionId);
  }

  private async analyzeWorkspace(request: AgentPlanRequest): Promise<AgentProjectSummary> {
    const status = this.options.getWorkspaceStatus?.();
    const summary = status?.summary;
    const rootPath = this.options.getWorkspaceRoot?.() ?? summary?.rootPath;
    const treeSummary = await summarizeTree();
    const git = rootPath ? await readGitStatus(rootPath) : { changedFiles: 0, summary: [] };
    const attachmentTokens = (request.attachments ?? []).reduce((total, item) => total + (item.tokenEstimate ?? estimateTokens(item.content ?? "")), 0);
    return {
      projectName: summary?.projectName,
      rootPath,
      languages: summary?.languages ?? [],
      frameworks: summary?.frameworks ?? [],
      packageManager: summary?.packageManager,
      buildSystem: Object.keys(summary?.scripts ?? {}).slice(0, 12),
      sourceDirectories: summary?.sourceDirectories ?? treeSummary.sourceDirectories,
      entryPoints: summary?.likelyEntryPoints ?? [],
      openFiles: (request.openFiles ?? []).map((item) => item.relativePath).slice(0, MAX_OPEN_FILES),
      git,
      context: {
        attachmentCount: request.attachments?.length ?? 0,
        tokenEstimate: attachmentTokens,
        labels: (request.attachments ?? []).map((item) => item.label).slice(0, MAX_ATTACHMENTS)
      }
    };
  }

  private requireSession(sessionId: string | undefined): AgentSession {
    const session = this.persistence.sessions.find((item) => item.id === sessionId);
    if (!session) throw new Error("Agent session was not found.");
    return session;
  }

  private snapshot(): AgentState {
    const workspaceRoot = this.options.getWorkspaceRoot?.();
    const sessions = workspaceRoot
      ? this.persistence.sessions.filter((session) => sessionMatchesWorkspace(session, workspaceRoot))
      : this.persistence.sessions;
    const activeSessionId = sessions.some((session) => session.id === this.persistence.activeSessionId)
      ? this.persistence.activeSessionId
      : sessions.find((session) => !session.archived)?.id ?? sessions[0]?.id;
    return {
      sessions: [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      activeSessionId,
      updatedAt: new Date().toISOString()
    };
  }

  private async persistAndEmit(): Promise<void> {
    await this.persist();
    this.emit({ type: "state", state: this.snapshot() });
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.statePath, "utf8");
      this.persistence = coercePersistence(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        await preserveCorruptState(this.statePath).catch(() => undefined);
      }
      this.persistence = defaultPersistence();
      this.persistence.recoveryState = { corruptionRecovered: (error as NodeJS.ErrnoException).code !== "ENOENT" };
    }
  }

  private async persist(): Promise<void> {
    this.persistChain = this.persistChain
      .catch(() => undefined)
      .then(async () => {
        await fs.mkdir(path.dirname(this.statePath), { recursive: true });
        await writeJsonAtomic(this.statePath, redactPersistence(this.persistence));
      });
    await this.persistChain;
  }
}

function defaultPersistence(): AgentPersistence {
  return { sessions: [] };
}

function sessionMatchesWorkspace(session: AgentSession, workspaceRoot: string): boolean {
  const rootPath = session.projectSummary?.rootPath;
  if (!rootPath) return true;
  return normalizePathForCompare(rootPath) === normalizePathForCompare(workspaceRoot);
}

function normalizePathForCompare(value: string): string {
  return path.resolve(value).replace(/\\/g, "/").toLowerCase();
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    if (process.platform !== "win32" || ((error as NodeJS.ErrnoException).code !== "EEXIST" && (error as NodeJS.ErrnoException).code !== "EPERM")) throw error;
    await fs.rm(filePath, { force: true });
    await fs.rename(temporaryPath, filePath);
  }
}

async function preserveCorruptState(filePath: string): Promise<void> {
  const backupPath = `${filePath}.corrupt-${Date.now()}`;
  await fs.copyFile(filePath, backupPath);
}

function validateNewSessionRequest(value: unknown): AgentNewSessionRequest {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    title: record.title === undefined ? undefined : validateTitle(record.title),
    runtimeId: record.runtimeId === undefined ? undefined : validateRuntimeProviderId(record.runtimeId),
    modelId: record.modelId === undefined ? undefined : validateModelId(record.modelId)
  };
}

function validateRenameRequest(value: unknown): AgentRenameRequest {
  if (!value || typeof value !== "object") throw new Error("Agent rename request is invalid.");
  const record = value as Record<string, unknown>;
  return { sessionId: validateId(record.sessionId, "sessionId"), title: validateTitle(record.title) };
}

function validateArchiveRequest(value: unknown): AgentArchiveRequest {
  if (!value || typeof value !== "object") throw new Error("Agent archive request is invalid.");
  const record = value as Record<string, unknown>;
  return { sessionId: validateId(record.sessionId, "sessionId"), archived: record.archived === true };
}

function validateDeleteRequest(value: unknown): AgentDeleteRequest {
  if (!value || typeof value !== "object") throw new Error("Agent delete request is invalid.");
  return { sessionId: validateId((value as Record<string, unknown>).sessionId, "sessionId") };
}

function validateStatusRequest(value: unknown): AgentStatusRequest {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return { sessionId: record.sessionId === undefined ? undefined : validateId(record.sessionId, "sessionId") };
}

function validatePlanRequest(value: unknown): AgentPlanRequest {
  if (!value || typeof value !== "object") throw new Error("Agent plan request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: record.sessionId === undefined ? undefined : validateId(record.sessionId, "sessionId"),
    prompt: validatePrompt(record.prompt),
    runtimeId: record.runtimeId === undefined ? undefined : validateRuntimeProviderId(record.runtimeId),
    modelId: validateModelId(record.modelId),
    attachments: record.attachments === undefined ? undefined : validateAttachments(record.attachments),
    openFiles: Array.isArray(record.openFiles) ? record.openFiles.slice(0, MAX_OPEN_FILES).map(validateOpenFile) : undefined
  };
}

function validateApprovalRequest(value: unknown): AgentApprovalRequest {
  if (!value || typeof value !== "object") throw new Error("Agent approval request is invalid.");
  const record = value as Record<string, unknown>;
  return { sessionId: validateId(record.sessionId, "sessionId"), actionId: validateId(record.actionId, "actionId") };
}

function sessionIdFromRequest<T extends { sessionId: string }>(value: unknown, message: string): T["sessionId"] {
  if (!value || typeof value !== "object") throw new Error(message);
  return validateId((value as Record<string, unknown>).sessionId, "sessionId");
}

function validateAttachments(value: unknown): AIChatAttachment[] {
  if (!Array.isArray(value) || value.length > MAX_ATTACHMENTS) throw new Error("Agent attachments are invalid.");
  return value.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error("Agent attachment is invalid.");
    const record = item as Record<string, unknown>;
    return {
      id: validateId(record.id ?? randomUUID(), "attachmentId"),
      sourceId: record.sourceId === undefined ? `S${index + 1}` : validateId(record.sourceId, "sourceId"),
      type: validateAttachmentType(record.type),
      label: validateTitle(record.label),
      relativePath: record.relativePath === undefined ? undefined : validateRelativePath(record.relativePath),
      lineStart: record.lineStart === undefined ? undefined : validateLine(record.lineStart, "lineStart"),
      lineEnd: record.lineEnd === undefined ? undefined : validateLine(record.lineEnd, "lineEnd"),
      language: record.language === undefined ? undefined : validateTinyString(record.language, "language"),
      content: record.content === undefined ? undefined : validateAttachmentContent(record.content),
      tokenEstimate: record.tokenEstimate === undefined ? undefined : validateNonNegativeInteger(record.tokenEstimate, "tokenEstimate"),
      charCount: record.charCount === undefined ? undefined : validateNonNegativeInteger(record.charCount, "charCount"),
      truncated: record.truncated === true,
      preview: record.preview === undefined ? undefined : validateAttachmentContent(record.preview)
    };
  });
}

function validateAttachmentType(value: unknown): AIChatAttachment["type"] {
  if (
    value === "current-file" ||
    value === "open-tab" ||
    value === "file" ||
    value === "workspace-file" ||
    value === "workspace-folder" ||
    value === "selected-code" ||
    value === "selection" ||
    value === "clipboard" ||
    value === "project-rules" ||
    value === "workspace-summary" ||
    value === "git-diff" ||
    value === "problems" ||
    value === "task-output" ||
    value === "terminal-output" ||
    value === "image-placeholder"
  ) return value;
  throw new Error("Agent attachment type is invalid.");
}

function validateOpenFile(value: unknown): NonNullable<AgentPlanRequest["openFiles"]>[number] {
  if (!value || typeof value !== "object") throw new Error("Agent open file entry is invalid.");
  const record = value as Record<string, unknown>;
  return {
    relativePath: validateRelativePath(record.relativePath),
    language: record.language === undefined ? undefined : validateTinyString(record.language, "language")
  };
}

function validateId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 140 || value.includes("\0")) throw new Error(`${field} is invalid.`);
  return value;
}

function validateTitle(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_TITLE_LENGTH || value.includes("\0")) throw new Error("Agent title is invalid.");
  return value.trim();
}

function validatePrompt(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_PROMPT_LENGTH || value.includes("\0")) throw new Error("Agent prompt is invalid.");
  return value.trim();
}

function validateRelativePath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500 || path.isAbsolute(value) || value.includes("\0") || value.includes("..")) {
    throw new Error("Agent workspace path is invalid.");
  }
  return value.replace(/\\/g, "/");
}

function validateLine(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 1_000_000) throw new Error(`${field} is invalid.`);
  return value as number;
}

function validateNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 1_000_000_000) throw new Error(`${field} is invalid.`);
  return value as number;
}

function validateTinyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > 80 || value.includes("\0")) throw new Error(`${field} is invalid.`);
  return value;
}

function validateAttachmentContent(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_PROMPT_LENGTH || value.includes("\0")) throw new Error("Agent attachment content is invalid.");
  return value;
}

function ownerObjectiveFromPrompt(prompt: string): string {
  return prompt.split(/\n\s*Treat this as build execution intent/i)[0]?.trim() || prompt.trim();
}

function createDeterministicNewAppPlan(
  objective: string,
  projectSummary: AgentProjectSummary,
  workspaceSummary: WorkspaceStatus["summary"] | undefined
): AgentExecutionPlan | null {
  const intent = detectNewAppIntent(objective);
  if (!intent.isNewApplication) return null;
  const starter = starterById(intent.starterId);
  const slug = intent.projectName;
  const targetDescription = projectSummary.rootPath ? ` Target workspace: ${projectSummary.rootPath}.` : "";
  const useExistingMobileRoot = starter.id === "android-compose" && isAndroidWorkspace(workspaceSummary);
  const childFolder = useExistingMobileRoot ? "" : shouldBootstrapInChild(workspaceSummary) ? slug : "";
  const now = new Date().toISOString();
  const approvals: AgentApprovalAction[] = [];
  const steps: AgentPlanStep[] = [];

  const createStep = (title: string, description: string, estimatedFiles: string[]): AgentPlanStep => {
    const step: AgentPlanStep = {
      id: randomUUID(),
      order: steps.length + 1,
      title,
      description,
      status: "Pending",
      estimatedFiles: uniqueStrings(estimatedFiles.map((file) => scopedPath(childFolder, file))),
      actionIds: []
    };
    steps.push(step);
    return step;
  };
  const addAction = (step: AgentPlanStep, action: Omit<AgentApprovalAction, "id" | "status" | "stepId" | "createdAt" | "updatedAt">) => {
    const item: AgentApprovalAction = {
      ...action,
      id: randomUUID(),
      status: "Pending",
      stepId: step.id,
      createdAt: now,
      updatedAt: now
    };
    approvals.push(item);
    step.actionIds.push(item.id);
  };

  if (!useExistingMobileRoot) {
    const starterFiles = starterFilesForProject(starter, slug);
    const bootstrapStep = createStep(
      `Bootstrap ${starter.label}`,
      childFolder
        ? `Create the deterministic ${starter.label} starter in ${childFolder}.`
        : `Create the deterministic ${starter.label} starter in the workspace root.`,
      starter.expectedFiles
    );
    for (const file of starterFiles) {
      addAction(bootstrapStep, {
        type: "create-file",
        title: `Create ${file.relativePath}`,
        description: `Write deterministic starter file ${file.relativePath}.`,
        relativePath: scopedPath(childFolder, file.relativePath),
        content: file.content
      });
    }

    if (starter.installCommand) {
      const installStep = createStep("Prepare starter dependencies", `Prepare dependencies required by ${starter.label}.`, ["package.json"]);
      addAction(installStep, terminalAction(starter.installCommand, childFolder, starter.installCommand.label, "Prepare deterministic starter dependencies."));
    }

    if (starter.buildCommand) {
      const verifyStep = createStep("Verify starter", "Run the starter verification command before applying feature work.", starter.expectedFiles);
      addAction(verifyStep, terminalAction(starter.buildCommand, childFolder, starter.buildCommand.label, "Verify the deterministic starter."));
    }
  }

  const featureFiles = featureFilesForIntent(intent.requestedFeatures, starter);
  if (featureFiles.length) {
    const featureStep = createStep("Implement requested features", `Apply the requested features: ${intent.requestedFeatures.join(", ")}.`, featureFiles.map((file) => file.relativePath));
    for (const file of featureFiles) {
      addAction(featureStep, {
        type: "modify-file",
        title: `Update ${file.relativePath}`,
        description: `Apply requested feature implementation to ${file.relativePath}.`,
        relativePath: scopedPath(childFolder, file.relativePath),
        content: file.content
      });
    }
  }

  if (starter.buildCommand) {
    const finalStep = createStep("Verify completed app", "Run final verification after feature implementation.", starter.expectedFiles);
    addAction(finalStep, terminalAction(starter.buildCommand, childFolder, "Run final verification", "Verify the completed generated app."));
  }

  const estimatedFiles = uniqueStrings(steps.flatMap((step) => step.estimatedFiles)).slice(0, 40);
  const plan: AgentExecutionPlan = {
    id: randomUUID(),
    objective,
    summary: useExistingMobileRoot
      ? `Deterministic Android feature plan will update the current Kotlin + Compose workspace. ${intent.reason}${targetDescription}`
      : `Deterministic new-app plan selected ${starter.label} for ${slug}. ${intent.reason}${targetDescription}`,
    planningMode: "deterministic-bootstrap",
    starterId: starter.id,
    starterLabel: starter.label,
    projectSlug: slug,
    featurePlanningStatus: featureFiles.length ? "Planned" : "NotRequired",
    plannerRetries: 0,
    milestones: steps.map((step) => step.title),
    steps,
    approvals,
    executionQueue: [],
    taskRuns: [],
    terminalRuns: [],
    gitRuns: [],
    browserRuns: [],
    verificationReports: [],
    repairQueue: [],
    repairProgress: [],
    estimatedFiles,
    progress: { totalSteps: steps.length, pendingActions: 0, approvedActions: 0, rejectedActions: 0, completedActions: 0 },
    createdAt: now,
    updatedAt: now
  };
  plan.progress = progressFromApprovals(plan);
  return plan;
}

function createDeterministicExistingProjectBuildPlan(
  objective: string,
  projectSummary: AgentProjectSummary,
  workspaceSummary: WorkspaceStatus["summary"] | undefined
): AgentExecutionPlan | null {
  const text = objective.toLowerCase();
  const explicitExistingProject = /\b(existing|current|this)\b.{0,40}\b(project|workspace|repo|repository|app|application)\b/.test(text);
  if (detectNewAppIntent(objective).isNewApplication || !/\b(build|verify|compile|test)\b/.test(text)) return null;
  if (!explicitExistingProject) return null;
  if (!workspaceSummary || !shouldBootstrapInChild(workspaceSummary)) return null;
  const script = workspaceSummary.scripts.build ? "build" : workspaceSummary.scripts.test ? "test" : undefined;
  if (!script) return null;
  const now = new Date().toISOString();
  const stepId = randomUUID();
  const actionId = randomUUID();
  const command = packageManagerCommand(workspaceSummary.packageManager);
  const action: AgentApprovalAction = {
    id: actionId,
    type: "run-terminal-command",
    title: `Run ${script}`,
    description: `Run the existing project's ${script} script for verification.`,
    status: "Pending",
    stepId,
    command,
    args: ["run", script],
    cwd: ".",
    expectedOutput: "Command exits successfully",
    estimatedDurationMs: 120_000,
    createdAt: now,
    updatedAt: now
  };
  const step: AgentPlanStep = {
    id: stepId,
    order: 1,
    title: "Verify existing project",
    description: `Use the detected ${projectSummary.frameworks.join(", ") || "project"} configuration without scaffolding new files.`,
    status: "Pending",
    estimatedFiles: projectSummary.entryPoints.slice(0, 8),
    actionIds: [actionId]
  };
  const plan: AgentExecutionPlan = {
    id: randomUUID(),
    objective,
    summary: `Deterministic existing-project verification will run ${command} run ${script}. No new project scaffold will be created.`,
    planningMode: "deterministic-existing-project",
    featurePlanningStatus: "NotRequired",
    plannerRetries: 0,
    milestones: [step.title],
    steps: [step],
    approvals: [action],
    executionQueue: [],
    taskRuns: [],
    terminalRuns: [],
    gitRuns: [],
    browserRuns: [],
    verificationReports: [],
    repairQueue: [],
    repairProgress: [],
    estimatedFiles: step.estimatedFiles,
    progress: { totalSteps: 1, pendingActions: 1, approvedActions: 0, rejectedActions: 0, completedActions: 0 },
    createdAt: now,
    updatedAt: now
  };
  plan.progress = progressFromApprovals(plan);
  return plan;
}

function packageManagerCommand(value: string | undefined): string {
  if (value === "pnpm") return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  if (value === "yarn") return process.platform === "win32" ? "yarn.cmd" : "yarn";
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function isAndroidWorkspace(summary: WorkspaceStatus["summary"] | undefined): boolean {
  if (!summary) return false;
  return summary.manifestFiles.some((file) => /(^|\/|\\)(settings\.gradle(\.kts)?|build\.gradle(\.kts)?|AndroidManifest\.xml)$/i.test(file))
    && (summary.languages.some((language) => /^kotlin$/i.test(language)) || summary.sourceDirectories.some((directory) => normalizeSlashes(directory).startsWith("app/src/main")));
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function starterFilesForProject(starter: ProjectStarterInfo, slug: string): StarterFile[] {
  return starter.files.map((file) => {
    if (file.relativePath !== "package.json") return file;
    try {
      const parsed = JSON.parse(file.content) as Record<string, unknown>;
      parsed.name = slug;
      return { ...file, content: `${JSON.stringify(parsed, null, 2)}\n` };
    } catch {
      return file;
    }
  });
}

function terminalAction(
  command: StarterCommand,
  childFolder: string,
  title: string,
  description: string
): Omit<AgentApprovalAction, "id" | "status" | "stepId" | "createdAt" | "updatedAt"> {
  return {
    type: "run-terminal-command",
    title,
    description,
    command: command.command,
    args: command.args,
    cwd: childFolder || command.cwd || ".",
    expectedOutput: command.kind === "install" ? "Dependencies installed" : "Command exits successfully",
    estimatedDurationMs: command.kind === "install" ? 120_000 : 60_000
  };
}

function featureFilesForIntent(features: string[], starter: ProjectStarterInfo): StarterFile[] {
  if (features.includes("calculator") && starter.id === "vanilla-web") return calculatorFiles();
  if (features.includes("workout tracking") && starter.id === "react-vite") return fitnessReactFiles();
  if (features.includes("workout tracking") && starter.id === "android-compose") return androidFitnessFiles();
  return [];
}

function scopedPath(prefix: string, relativePath: string): string {
  return prefix ? `${prefix}/${relativePath}` : relativePath;
}

function fitnessReactFiles(): StarterFile[] {
  return [
    {
      relativePath: "src/App.tsx",
      content: `import { FormEvent, useEffect, useMemo, useState } from 'react';

type Workout = {
  id: string;
  name: string;
  minutes: number;
  intensity: 'Easy' | 'Moderate' | 'Hard';
  completedAt: string;
};

const STORAGE_KEY = 'levi-fitness-workouts';

const starterWorkouts: Workout[] = [
  { id: 'seed-1', name: 'Morning mobility', minutes: 18, intensity: 'Easy', completedAt: '2026-08-10' },
  { id: 'seed-2', name: 'Strength circuit', minutes: 42, intensity: 'Hard', completedAt: '2026-08-12' }
];

export default function App() {
  const [workouts, setWorkouts] = useState<Workout[]>(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) as Workout[] : starterWorkouts;
  });
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState(30);
  const [intensity, setIntensity] = useState<Workout['intensity']>('Moderate');

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
  }, [workouts]);

  const stats = useMemo(() => {
    const totalMinutes = workouts.reduce((sum, workout) => sum + workout.minutes, 0);
    const hardSessions = workouts.filter((workout) => workout.intensity === 'Hard').length;
    return { totalMinutes, hardSessions, sessions: workouts.length };
  }, [workouts]);

  function addWorkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setWorkouts((current) => [
      {
        id: crypto.randomUUID(),
        name: trimmed,
        minutes,
        intensity,
        completedAt: new Date().toISOString().slice(0, 10)
      },
      ...current
    ]);
    setName('');
    setMinutes(30);
    setIntensity('Moderate');
  }

  return (
    <main className="app-shell">
      <section className="dashboard" aria-label="Fitness dashboard">
        <div>
          <p className="eyebrow">Fitness Tracker</p>
          <h1>Training dashboard</h1>
        </div>
        <div className="metric-row">
          <article><span>Sessions</span><strong>{stats.sessions}</strong></article>
          <article><span>Minutes</span><strong>{stats.totalMinutes}</strong></article>
          <article><span>Hard days</span><strong>{stats.hardSessions}</strong></article>
        </div>
      </section>

      <section className="content-grid">
        <form className="workout-form" onSubmit={addWorkout}>
          <h2>Add workout</h2>
          <label>
            Workout
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Tempo run" />
          </label>
          <label>
            Minutes
            <input type="number" min="1" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} />
          </label>
          <label>
            Intensity
            <select value={intensity} onChange={(event) => setIntensity(event.target.value as Workout['intensity'])}>
              <option>Easy</option>
              <option>Moderate</option>
              <option>Hard</option>
            </select>
          </label>
          <button type="submit">Add workout</button>
        </form>

        <section className="workout-list" aria-label="Workout list">
          <h2>Workout list</h2>
          {workouts.map((workout) => (
            <article key={workout.id} className="workout-item">
              <div>
                <strong>{workout.name}</strong>
                <span>{workout.completedAt}</span>
              </div>
              <p>{workout.minutes} min · {workout.intensity}</p>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
`
    },
    {
      relativePath: "src/styles.css",
      content: `:root {
  color: #172033;
  background: #eef2f7;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  margin: 0;
}

button,
input,
select {
  font: inherit;
}

.app-shell {
  min-height: 100vh;
  padding: 32px;
}

.dashboard {
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(220px, 1fr) minmax(280px, 620px);
  align-items: end;
  border-bottom: 1px solid #cbd5e1;
  padding-bottom: 28px;
}

.eyebrow {
  color: #0f766e;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0;
  margin: 0 0 8px;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  font-size: clamp(2rem, 5vw, 4.5rem);
  line-height: 1;
  margin-bottom: 0;
}

.metric-row,
.content-grid {
  display: grid;
  gap: 16px;
}

.metric-row {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.metric-row article,
.workout-form,
.workout-item {
  background: #ffffff;
  border: 1px solid #d6dee8;
  border-radius: 8px;
  padding: 18px;
}

.metric-row span,
.workout-item span {
  color: #64748b;
  display: block;
  font-size: 0.85rem;
}

.metric-row strong {
  display: block;
  font-size: 2rem;
  margin-top: 6px;
}

.content-grid {
  grid-template-columns: minmax(260px, 360px) 1fr;
  margin-top: 28px;
}

.workout-form {
  display: grid;
  gap: 14px;
}

.workout-form label {
  display: grid;
  gap: 6px;
  font-weight: 700;
}

.workout-form input,
.workout-form select {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 10px 12px;
}

.workout-form button {
  background: #0f766e;
  border: 0;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  font-weight: 800;
  padding: 12px;
}

.workout-list {
  display: grid;
  gap: 12px;
}

.workout-item {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.workout-item p {
  margin: 0;
}

@media (max-width: 760px) {
  .app-shell {
    padding: 20px;
  }

  .dashboard,
  .content-grid,
  .metric-row {
    grid-template-columns: 1fr;
  }

  .workout-item {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
}
`
    }
  ];
}

function androidFitnessFiles(): StarterFile[] {
  return [
    {
      relativePath: "app/src/main/java/app/levi/generated/MainActivity.kt",
      content: `package app.levi.generated

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class CompletedWorkout(
  val id: String,
  val name: String,
  val minutes: Int,
  val completedAt: String
)

private const val PREFS_NAME = "trucker_fitness"
private const val HISTORY_KEY = "history"

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContent {
      MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
          TruckerFitnessApp()
        }
      }
    }
  }
}

@Composable
fun TruckerFitnessApp() {
  val context = LocalContext.current
  val history = remember {
    mutableStateListOf<CompletedWorkout>().also { list ->
      list.addAll(loadHistory(context))
    }
  }
  val customName = remember { mutableStateOf("") }
  val totalMinutes = history.sumOf { it.minutes }

  fun addWorkout(name: String, minutes: Int) {
    val workout = CompletedWorkout(
      id = System.currentTimeMillis().toString(),
      name = name,
      minutes = minutes,
      completedAt = SimpleDateFormat("MMM d, HH:mm", Locale.US).format(Date())
    )
    history.add(0, workout)
    saveHistory(context, history)
  }

  Column(
    modifier = Modifier
      .fillMaxSize()
      .verticalScroll(rememberScrollState())
      .padding(20.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp)
  ) {
    Text("Trucker Fitness", style = MaterialTheme.typography.headlineMedium)
    Text("Offline-first workouts designed for short stops and long routes.")

    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
      MetricCard("Sessions", history.size.toString(), Modifier.weight(1f))
      MetricCard("Minutes", totalMinutes.toString(), Modifier.weight(1f))
    }

    Text("Workout list", style = MaterialTheme.typography.titleLarge)
    PresetWorkout("5-minute workout", "Cab mobility and breathing reset", 5, ::addWorkout)
    PresetWorkout("10-minute workout", "Core, squats, and shoulder work", 10, ::addWorkout)
    PresetWorkout("20-minute workout", "Full body no-equipment circuit", 20, ::addWorkout)

    Card(modifier = Modifier.fillMaxWidth()) {
      Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Add completed workout", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(
          value = customName.value,
          onValueChange = { customName.value = it },
          label = { Text("Workout name") },
          modifier = Modifier.fillMaxWidth()
        )
        Button(
          onClick = {
            val name = customName.value.trim().ifEmpty { "Custom truck-stop workout" }
            addWorkout(name, 15)
            customName.value = ""
          }
        ) {
          Text("Add completed workout")
        }
      }
    }

    Text("Workout history", style = MaterialTheme.typography.titleLarge)
    if (history.isEmpty()) {
      Text("No completed workouts yet. Choose a 5, 10, or 20 minute workout to begin.")
    } else {
      history.forEach { workout ->
        Card(modifier = Modifier.fillMaxWidth()) {
          Column(modifier = Modifier.padding(16.dp)) {
            Text(workout.name, style = MaterialTheme.typography.titleMedium)
            Spacer(modifier = Modifier.height(4.dp))
            Text("${'$'}{workout.minutes} minutes - ${'$'}{workout.completedAt}")
          }
        }
      }
    }
  }
}

@Composable
fun MetricCard(label: String, value: String, modifier: Modifier = Modifier) {
  Card(modifier = modifier) {
    Column(modifier = Modifier.padding(16.dp)) {
      Text(label)
      Text(value, style = MaterialTheme.typography.headlineSmall)
    }
  }
}

@Composable
fun PresetWorkout(title: String, description: String, minutes: Int, onComplete: (String, Int) -> Unit) {
  Card(modifier = Modifier.fillMaxWidth()) {
    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Text(title, style = MaterialTheme.typography.titleMedium)
      Text(description)
      Button(onClick = { onComplete(title, minutes) }) {
        Text("Complete ${'$'}minutes-minute workout")
      }
    }
  }
}

fun loadHistory(context: Context): List<CompletedWorkout> {
  val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(HISTORY_KEY, "") ?: ""
  if (raw.isBlank()) return emptyList()
  return raw.split("\\n").mapNotNull { line ->
    val parts = line.split("|")
    if (parts.size != 4) null else CompletedWorkout(parts[0], parts[1], parts[2].toIntOrNull() ?: 0, parts[3])
  }
}

fun saveHistory(context: Context, history: List<CompletedWorkout>) {
  val raw = history.joinToString("\\n") { workout ->
    listOf(workout.id, workout.name.replace("|", " "), workout.minutes.toString(), workout.completedAt).joinToString("|")
  }
  context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    .edit()
    .putString(HISTORY_KEY, raw)
    .apply()
}
`
    }
  ];
}

function calculatorFiles(): StarterFile[] {
  return [
    {
      relativePath: "index.html",
      content: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Calculator</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="calculator" aria-label="Calculator">
    <output id="display">0</output>
    <div class="keys" id="keys"></div>
  </main>
  <script src="app.js"></script>
</body>
</html>
`
    },
    {
      relativePath: "styles.css",
      content: `body {
  align-items: center;
  background: #edf2f4;
  color: #202631;
  display: flex;
  font-family: system-ui, sans-serif;
  justify-content: center;
  margin: 0;
  min-height: 100vh;
}

.calculator {
  background: #ffffff;
  border: 1px solid #ccd6e0;
  border-radius: 8px;
  box-shadow: 0 18px 60px rgba(15, 23, 42, 0.14);
  padding: 18px;
  width: min(360px, calc(100vw - 32px));
}

output {
  background: #101828;
  border-radius: 6px;
  color: #f8fafc;
  display: block;
  font-size: 2.5rem;
  margin-bottom: 14px;
  min-height: 72px;
  overflow: hidden;
  padding: 12px;
  text-align: right;
}

.keys {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, 1fr);
}

button {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  min-height: 54px;
}

button.operator,
button.equals {
  background: #0f766e;
  color: white;
}
`
    },
    {
      relativePath: "app.js",
      content: `const display = document.querySelector('#display');
const keys = document.querySelector('#keys');
const buttons = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', 'C', '+', '='];
let expression = '';

function render() {
  display.textContent = expression || '0';
}

function calculate() {
  if (!/^[0-9+\\-*\\/. ]+$/.test(expression)) return;
  try {
    expression = String(Function('"use strict"; return (' + expression + ')')());
  } catch {
    expression = '';
  }
  render();
}

for (const label of buttons) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if ('+-*/'.includes(label)) button.className = 'operator';
  if (label === '=') button.className = 'equals';
  button.addEventListener('click', () => {
    if (label === 'C') expression = '';
    else if (label === '=') calculate();
    else expression += label;
    render();
  });
  keys.append(button);
}

render();
`
    }
  ];
}

function buildPlanningPrompt(prompt: string, summary: AgentProjectSummary, attachments: AIChatAttachment[]): string {
  const existingProject = Boolean(
    summary.rootPath &&
    (summary.entryPoints.length > 0 || summary.buildSystem.length > 0 || summary.sourceDirectories.length > 0)
  );
  return JSON.stringify({
    instruction:
      "Return JSON only with shape { summary: string, steps: [{ title, description, estimatedFiles, actions }] }. Actions are proposals only and must not be executed. For build/create/implement/add requests, provide concrete executable actions using existing action types: create-folder, create-file, modify-file, run-terminal-command, run-task, git-operation, rename-file, rename-folder, delete-file. File actions must include relativePath and complete content for create-file or whole-file edits for modify-file when known. Terminal actions must use structured command, args, cwd, and expectedOutput. Never include shell wrappers, destructive commands, publishing, deployment, secrets, or paths outside the workspace. If the request creates a new application and this workspace already contains an existing project, place all generated files under a sanitized child folder inside the current workspace instead of contaminating the existing project root.",
    objective: prompt,
    project: {
      ...summary,
      existingProject,
      newApplicationSafeDefault: existingProject ? "Use a sanitized child folder for generated app files." : "Use the selected workspace root when it is suitable and empty."
    },
    context: attachments.map((attachment) => ({
      sourceId: attachment.sourceId,
      label: attachment.label,
      type: attachment.type,
      relativePath: attachment.relativePath,
      lineStart: attachment.lineStart,
      lineEnd: attachment.lineEnd,
      preview: attachment.preview ?? attachment.content?.slice(0, 1_200)
    }))
  });
}

function createExecutionPlan(objective: string, modelContent: string, projectSummary: AgentProjectSummary): AgentExecutionPlan {
  const parsed = parsePlanContent(modelContent);
  if (!parsed) return createFallbackPlan(objective, projectSummary);
  const now = new Date().toISOString();
  const approvals: AgentApprovalAction[] = [];
  const steps: AgentPlanStep[] = parsed.steps.slice(0, MAX_PLAN_STEPS).map((step, index) => {
    const stepId = randomUUID();
    const actionIds = step.actions.slice(0, MAX_ACTIONS - approvals.length).map((action) => {
      const item: AgentApprovalAction = {
        id: randomUUID(),
        type: action.type,
        title: action.title,
        description: action.description,
        status: "Pending",
        stepId,
        relativePath: action.relativePath,
        destinationRelativePath: action.destinationRelativePath,
        content: action.content,
        edits: action.edits,
        taskId: action.taskId,
        taskFingerprint: action.taskFingerprint,
        taskName: action.taskName,
        command: action.command,
        args: action.args,
        cwd: action.cwd,
        expectedOutput: action.expectedOutput,
        estimatedDurationMs: action.estimatedDurationMs,
        gitOperation: action.gitOperation,
        commitMessage: action.commitMessage,
        branchName: action.branchName,
        affectedFiles: action.affectedFiles,
        browserSessionId: action.browserSessionId,
        browserUrl: action.browserUrl,
        browserElementRef: action.browserElementRef,
        browserValue: action.browserValue,
        browserFullPage: action.browserFullPage,
        headless: action.headless,
        createdAt: now,
        updatedAt: now
      };
      approvals.push(item);
      return item.id;
    });
    return {
      id: stepId,
      order: index + 1,
      title: step.title,
      description: step.description,
      status: "Pending",
      estimatedFiles: step.estimatedFiles,
      actionIds
    };
  });
  if (approvals.length === 0) {
    const action = createApproval("modify-file", "Review proposed workspace changes", "Review the plan and approve concrete edits in a later milestone.", steps[0]?.id, parsed.estimatedFiles[0]);
    approvals.push(action);
    if (steps[0]) steps[0].actionIds.push(action.id);
  }
  const plan: AgentExecutionPlan = {
    id: randomUUID(),
    objective,
    summary: parsed.summary,
    steps,
    approvals,
    executionQueue: [],
    taskRuns: [],
    terminalRuns: [],
    gitRuns: [],
    browserRuns: [],
    verificationReports: [],
    repairQueue: [],
    repairProgress: [],
    estimatedFiles: Array.from(new Set(steps.flatMap((step) => step.estimatedFiles))).slice(0, 40),
    progress: { totalSteps: steps.length, pendingActions: 0, approvedActions: 0, rejectedActions: 0, completedActions: 0 },
    createdAt: now,
    updatedAt: now
  };
  plan.progress = progressFromApprovals(plan);
  return plan;
}

function createFallbackPlan(objective: string, projectSummary: AgentProjectSummary): AgentExecutionPlan {
  const now = new Date().toISOString();
  const steps: AgentPlanStep[] = [
    {
      id: randomUUID(),
      order: 1,
      title: "Analyze project shape",
      description: `Use the detected ${projectSummary.frameworks.join(", ") || "project"} structure, package metadata, open files, and explicit context before proposing changes.`,
      status: "Pending",
      estimatedFiles: projectSummary.openFiles.slice(0, 4),
      actionIds: []
    },
    {
      id: randomUUID(),
      order: 2,
      title: "Identify implementation targets",
      description: "Locate routing, UI, state, and test files needed for the requested change without reading the full workspace automatically.",
      status: "Pending",
      estimatedFiles: projectSummary.entryPoints.slice(0, 6),
      actionIds: []
    },
    {
      id: randomUUID(),
      order: 3,
      title: "Prepare approved changes",
      description: "Create a user-reviewed list of file edits and validation steps. No edits or commands run in this milestone.",
      status: "Pending",
      estimatedFiles: projectSummary.sourceDirectories.slice(0, 4),
      actionIds: []
    },
    {
      id: randomUUID(),
      order: 4,
      title: "Plan validation",
      description: "Propose tests, tasks, or debug checks that the user may approve later.",
      status: "Pending",
      estimatedFiles: [],
      actionIds: []
    }
  ];
  const approvals = [
    createApproval("modify-file", "Approve future file modifications", "Allow a later milestone to propose concrete file changes for this plan.", steps[2].id, steps[2].estimatedFiles[0]),
    createApproval("run-task", "Approve future validation task", "Allow a later milestone to run an explicit validation task after review.", steps[3].id)
  ];
  steps[2].actionIds.push(approvals[0].id);
  steps[3].actionIds.push(approvals[1].id);
  const plan: AgentExecutionPlan = {
    id: randomUUID(),
    objective,
    summary: `Planning-only execution plan for: ${objective}`,
    steps,
    approvals,
    executionQueue: [],
    taskRuns: [],
    terminalRuns: [],
    gitRuns: [],
    browserRuns: [],
    verificationReports: [],
    repairQueue: [],
    repairProgress: [],
    estimatedFiles: Array.from(new Set(steps.flatMap((step) => step.estimatedFiles))).slice(0, 40),
    progress: { totalSteps: steps.length, pendingActions: approvals.length, approvedActions: 0, rejectedActions: 0, completedActions: 0 },
    createdAt: now,
    updatedAt: now
  };
  return plan;
}

function createApproval(type: AgentActionType, title: string, description: string, stepId?: string, relativePath?: string): AgentApprovalAction {
  const now = new Date().toISOString();
  return { id: randomUUID(), type, title, description, status: "Pending", stepId, relativePath, createdAt: now, updatedAt: now };
}

type ParsedStep = {
  title: string;
  description: string;
  estimatedFiles: string[];
  actions: Array<{
    type: AgentActionType;
    title: string;
    description: string;
    relativePath?: string;
    destinationRelativePath?: string;
    content?: string;
    edits?: AgentApprovalAction["edits"];
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
  }>;
};

function parsePlanContent(content: string): { summary: string; steps: ParsedStep[]; estimatedFiles: string[] } | null {
  const parsed = parseJsonObject(content);
  if (!parsed) return null;
  const summary = typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim().slice(0, 1_000) : "Execution plan prepared.";
  const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : [];
  const steps = rawSteps.map(parseStep).filter(Boolean).slice(0, MAX_PLAN_STEPS) as ParsedStep[];
  if (steps.length === 0) return null;
  return { summary, steps, estimatedFiles: Array.from(new Set(steps.flatMap((step) => step.estimatedFiles))) };
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const candidate = fenced ?? (start >= 0 && end > start ? trimmed.slice(start, end + 1) : "");
  if (!candidate) return null;
  for (const attempt of [candidate, candidate.replace(/,\s*([}\]])/g, "$1")]) {
    try {
      const parsed = JSON.parse(attempt) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      // Try the next structured recovery candidate.
    }
  }
  return null;
}

function parseStep(value: unknown): ParsedStep | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const title = typeof record.title === "string" && record.title.trim() ? record.title.trim().slice(0, 120) : "Plan step";
  const description = typeof record.description === "string" ? record.description.trim().slice(0, 1_000) : "";
  const estimatedFiles = Array.isArray(record.estimatedFiles) ? record.estimatedFiles.map((item) => typeof item === "string" ? item : "").filter(Boolean).map((item) => item.slice(0, 500)).slice(0, 12) : [];
  const actions = Array.isArray(record.actions) ? record.actions.map(parseAction).filter(Boolean).slice(0, MAX_ACTIONS) as ParsedStep["actions"] : [];
  return { title, description, estimatedFiles, actions };
}

function parseAction(value: unknown): ParsedStep["actions"][number] | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const type = ACTION_TYPES.includes(record.type as AgentActionType) ? record.type as AgentActionType : "modify-file";
  return {
    type,
    title: typeof record.title === "string" && record.title.trim() ? record.title.trim().slice(0, 120) : actionTitle(type),
    description: typeof record.description === "string" ? record.description.trim().slice(0, 1_000) : "",
    relativePath: typeof record.relativePath === "string" && !path.isAbsolute(record.relativePath) && !record.relativePath.includes("..") ? record.relativePath.slice(0, 500).replace(/\\/g, "/") : undefined,
    destinationRelativePath: parseRelativeAlias(record.destinationRelativePath ?? record.toRelativePath ?? record.newRelativePath),
    content: typeof record.content === "string" ? record.content.slice(0, MAX_PROMPT_LENGTH) : typeof record.proposedContent === "string" ? record.proposedContent.slice(0, MAX_PROMPT_LENGTH) : undefined,
    edits: Array.isArray(record.edits) ? record.edits.map(parseFileEdit).filter(Boolean).slice(0, 40) as AgentApprovalAction["edits"] : undefined,
    taskId: typeof record.taskId === "string" ? record.taskId.slice(0, 120) : undefined,
    taskFingerprint: typeof record.taskFingerprint === "string" ? record.taskFingerprint.slice(0, 160) : undefined,
    taskName: typeof record.taskName === "string" ? record.taskName.slice(0, 120) : undefined,
    command: typeof record.command === "string" ? record.command.slice(0, 500) : undefined,
    args: Array.isArray(record.args) ? record.args.filter((item) => typeof item === "string").map((item) => item.slice(0, 500)).slice(0, 80) : undefined,
    cwd: parseRelativeAlias(record.cwd ?? record.workingDirectory),
    expectedOutput: typeof record.expectedOutput === "string" ? record.expectedOutput.slice(0, 500) : undefined,
    estimatedDurationMs: Number.isInteger(record.estimatedDurationMs) && (record.estimatedDurationMs as number) >= 0 ? record.estimatedDurationMs as number : undefined,
    gitOperation: typeof record.gitOperation === "string" ? record.gitOperation.slice(0, 120) : undefined,
    commitMessage: typeof record.commitMessage === "string" ? record.commitMessage.trim().slice(0, 300) : undefined,
    branchName: typeof record.branchName === "string" ? record.branchName.trim().slice(0, 120) : undefined,
    affectedFiles: Array.isArray(record.affectedFiles) ? record.affectedFiles.filter((item) => typeof item === "string" && !path.isAbsolute(item) && !item.includes("..")).map((item) => item.slice(0, 500).replace(/\\/g, "/")).slice(0, 80) : undefined,
    browserSessionId: typeof record.browserSessionId === "string" ? record.browserSessionId.slice(0, 140) : undefined,
    browserUrl: typeof record.browserUrl === "string" ? record.browserUrl.slice(0, 2_000) : typeof record.url === "string" ? record.url.slice(0, 2_000) : undefined,
    browserElementRef: typeof record.browserElementRef === "string" ? record.browserElementRef.slice(0, 20) : typeof record.elementRef === "string" ? record.elementRef.slice(0, 20) : undefined,
    browserValue: typeof record.browserValue === "string" ? record.browserValue.slice(0, 4_000) : typeof record.value === "string" ? record.value.slice(0, 4_000) : undefined,
    browserFullPage: record.browserFullPage === true || record.fullPage === true,
    headless: record.headless === undefined ? undefined : record.headless !== false
  };
}

function parseRelativeAlias(value: unknown): string | undefined {
  return typeof value === "string" && !path.isAbsolute(value) && !value.includes("..") ? value.slice(0, 500).replace(/\\/g, "/") : undefined;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseFileEdit(value: unknown): NonNullable<AgentApprovalAction["edits"]>[number] | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (kind !== "insert" && kind !== "replace" && kind !== "append" && kind !== "delete-range" && kind !== "whole-file") return null;
  return {
    kind,
    content: typeof record.content === "string" ? record.content.slice(0, MAX_PROMPT_LENGTH) : undefined,
    line: Number.isInteger(record.line) ? record.line as number : undefined,
    startLine: Number.isInteger(record.startLine) ? record.startLine as number : undefined,
    endLine: Number.isInteger(record.endLine) ? record.endLine as number : undefined,
    find: typeof record.find === "string" ? record.find.slice(0, MAX_PROMPT_LENGTH) : undefined,
    replace: typeof record.replace === "string" ? record.replace.slice(0, MAX_PROMPT_LENGTH) : undefined
  };
}

function actionTitle(type: AgentActionType): string {
  if (type === "create-file") return "Create file";
  if (type === "modify-file") return "Modify file";
  if (type === "delete-file") return "Delete file";
  if (type === "rename-file") return "Rename file";
  if (type === "create-folder") return "Create folder";
  if (type === "rename-folder") return "Rename folder";
  if (type === "run-task") return "Run task";
  if (type === "run-terminal-command") return "Run terminal command";
  if (type === "browser-open") return "Open browser";
  if (type === "browser-navigate") return "Navigate browser";
  if (type === "browser-click") return "Click browser element";
  if (type === "browser-fill") return "Fill browser field";
  if (type === "browser-screenshot") return "Take browser screenshot";
  if (type === "browser-close") return "Close browser";
  return "Run Git operation";
}

function progressFromApprovals(plan: AgentExecutionPlan): AgentExecutionPlan["progress"] {
  const queue = Array.isArray(plan.executionQueue) ? plan.executionQueue : [];
  const taskRuns = Array.isArray(plan.taskRuns) ? plan.taskRuns : [];
  const terminalRuns = Array.isArray(plan.terminalRuns) ? plan.terminalRuns : [];
  const gitRuns = Array.isArray(plan.gitRuns) ? plan.gitRuns : [];
  const browserRuns = Array.isArray(plan.browserRuns) ? plan.browserRuns : [];
  return {
    totalSteps: plan.steps.length,
    pendingActions: plan.approvals.filter((item) => item.status === "Pending").length,
    approvedActions: plan.approvals.filter((item) => item.status === "Approved").length,
    rejectedActions: plan.approvals.filter((item) => item.status === "Rejected").length + queue.filter((item) => item.status === "Rejected").length,
    completedActions:
      queue.filter((item) => item.status === "Completed").length +
      taskRuns.filter((item) => item.status === "Succeeded").length +
      terminalRuns.filter((item) => item.status === "Succeeded").length +
      gitRuns.filter((item) => item.status === "Succeeded").length +
      browserRuns.filter((item) => item.status === "Succeeded").length
  };
}

async function summarizeTree(): Promise<{ sourceDirectories: string[] }> {
  try {
    const tree = await listWorkspaceTree();
    return {
      sourceDirectories: tree.nodes.filter((node) => node.kind === "folder").map((node) => node.relativePath).slice(0, 12)
    };
  } catch {
    return { sourceDirectories: [] };
  }
}

async function readGitStatus(rootPath: string): Promise<AgentProjectSummary["git"]> {
  try {
    const { stdout } = await execFileText("git", ["status", "--short", "--branch"], rootPath, GIT_TIMEOUT_MS);
    const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 40);
    const branch = lines[0]?.startsWith("## ") ? lines[0].slice(3).split("...")[0] : undefined;
    return {
      branch,
      changedFiles: Math.max(0, lines.filter((line) => !line.startsWith("## ")).length),
      summary: lines.slice(0, 12)
    };
  } catch {
    return { changedFiles: 0, summary: [] };
  }
}

function execFileText(command: string, args: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: 64 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolve({ stdout: stdout.toString() });
    });
  });
}

function coercePersistence(value: unknown): AgentPersistence {
  if (!value || typeof value !== "object") return defaultPersistence();
  const record = value as Record<string, unknown>;
  const sessions = Array.isArray(record.sessions) ? record.sessions.map(coerceSession).filter(Boolean).slice(0, MAX_SESSIONS) as AgentSession[] : [];
  const activeSessionId = typeof record.activeSessionId === "string" && sessions.some((item) => item.id === record.activeSessionId) ? record.activeSessionId : sessions[0]?.id;
  const recoveryState = record.recoveryState && typeof record.recoveryState === "object" ? { corruptionRecovered: (record.recoveryState as { corruptionRecovered?: unknown }).corruptionRecovered === true } : undefined;
  return { sessions, activeSessionId, recoveryState };
}

function coerceSession(value: unknown): AgentSession | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.title !== "string") return null;
  return {
    id: record.id,
    title: record.title.slice(0, MAX_TITLE_LENGTH),
    status: coerceStatus(record.status, record.archived === true),
    archived: record.archived === true,
    runtimeId: optionalProvider(record.runtimeId),
    modelId: typeof record.modelId === "string" ? record.modelId.slice(0, 300) : undefined,
    messages: Array.isArray(record.messages) ? record.messages.map(coerceMessage).filter(Boolean).slice(-MAX_MESSAGES) as AgentMessage[] : [],
    plan: coercePlan(record.plan),
    projectSummary: coerceProjectSummary(record.projectSummary),
    attachments: Array.isArray(record.attachments) ? validateAttachments(record.attachments).slice(0, MAX_ATTACHMENTS) : [],
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString(),
    error: typeof record.error === "string" ? record.error.slice(0, 500) : undefined
  };
}

function coerceStatus(value: unknown, archived: boolean): AgentSession["status"] {
  if (archived) return "Archived";
  if (value === "Idle" || value === "Planning" || value === "WaitingForApproval" || value === "Ready" || value === "Executing" || value === "Error") return value;
  return "Idle";
}

function coerceMessage(value: unknown): AgentMessage | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.content !== "string") return null;
  const role = record.role === "user" || record.role === "assistant" || record.role === "system" ? record.role : "assistant";
  return { id: record.id, role, content: record.content.slice(0, MAX_PROMPT_LENGTH), createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString() };
}

function coercePlan(value: unknown): AgentExecutionPlan | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as AgentExecutionPlan;
  if (typeof record.id !== "string" || typeof record.objective !== "string" || !Array.isArray(record.steps) || !Array.isArray(record.approvals)) return undefined;
  return {
    ...record,
    steps: record.steps.slice(0, MAX_PLAN_STEPS),
    approvals: record.approvals.slice(0, MAX_ACTIONS),
    executionQueue: Array.isArray(record.executionQueue) ? record.executionQueue.slice(0, MAX_ACTIONS) : [],
    taskRuns: Array.isArray(record.taskRuns) ? record.taskRuns.slice(0, MAX_ACTIONS) : [],
    terminalRuns: Array.isArray(record.terminalRuns) ? record.terminalRuns.slice(0, MAX_ACTIONS) : [],
    gitRuns: Array.isArray(record.gitRuns) ? record.gitRuns.slice(0, MAX_ACTIONS) : [],
    browserRuns: Array.isArray(record.browserRuns) ? record.browserRuns.slice(0, MAX_ACTIONS) : [],
    verificationReports: Array.isArray(record.verificationReports) ? record.verificationReports.slice(0, 20) : [],
    repairQueue: Array.isArray(record.repairQueue) ? record.repairQueue.slice(0, MAX_ACTIONS) : [],
    repairProgress: Array.isArray(record.repairProgress) ? record.repairProgress.slice(-80) : [],
    lastUndo: record.lastUndo && typeof record.lastUndo === "object" ? record.lastUndo : undefined,
    recovery: coerceRecovery(record.recovery),
    progress: progressFromApprovals(record),
    estimatedFiles: Array.isArray(record.estimatedFiles) ? record.estimatedFiles.slice(0, 40) : [],
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString()
  };
}

function coerceRecovery(value: unknown): AgentExecutionPlan["recovery"] {
  if (!value || typeof value !== "object") return undefined;
  const record = value as NonNullable<AgentExecutionPlan["recovery"]>;
  const operations = Array.isArray(record.operations)
    ? record.operations.filter((operation) => operation && typeof operation === "object" && typeof operation.operationId === "string").slice(-100)
    : [];
  const interruptedOperationIds = Array.isArray(record.interruptedOperationIds)
    ? record.interruptedOperationIds.filter((item): item is string => typeof item === "string").slice(-100)
    : [];
  return {
    schemaVersion: 1,
    operations,
    interruptedOperationIds,
    corruptionRecovered: record.corruptionRecovered === true
  };
}

function coerceProjectSummary(value: unknown): AgentProjectSummary | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as AgentProjectSummary;
  return {
    projectName: typeof record.projectName === "string" ? record.projectName : undefined,
    rootPath: typeof record.rootPath === "string" ? record.rootPath : undefined,
    languages: Array.isArray(record.languages) ? record.languages.filter((item) => typeof item === "string").slice(0, 20) : [],
    frameworks: Array.isArray(record.frameworks) ? record.frameworks.filter((item) => typeof item === "string").slice(0, 20) : [],
    packageManager: typeof record.packageManager === "string" ? record.packageManager : undefined,
    buildSystem: Array.isArray(record.buildSystem) ? record.buildSystem.filter((item) => typeof item === "string").slice(0, 20) : [],
    sourceDirectories: Array.isArray(record.sourceDirectories) ? record.sourceDirectories.filter((item) => typeof item === "string").slice(0, 20) : [],
    entryPoints: Array.isArray(record.entryPoints) ? record.entryPoints.filter((item) => typeof item === "string").slice(0, 20) : [],
    openFiles: Array.isArray(record.openFiles) ? record.openFiles.filter((item) => typeof item === "string").slice(0, MAX_OPEN_FILES) : [],
    git: record.git && typeof record.git === "object" ? record.git : { changedFiles: 0, summary: [] },
    context: record.context && typeof record.context === "object" ? record.context : { attachmentCount: 0, tokenEstimate: 0, labels: [] }
  };
}

function redactPersistence(persistence: AgentPersistence): AgentPersistence {
  return redactValue(persistence) as AgentPersistence;
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactSecretText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /api[_-]?key|token|secret|password|authorization|credential/i.test(key) ? "[REDACTED]" : redactValue(item)
  ]));
}

function redactSecretText(value: string): string {
  return value
    .replace(/\b(authorization\s*:\s*bearer)\s+[^\s"'`]+/gi, "$1 [REDACTED]")
    .replace(/\b(api[_-]?key|token|secret|password|credential)(\s*[=:]\s*)[^\s"'`]+/gi, "$1$2[REDACTED]")
    .replace(/\b(sk-[A-Za-z0-9_-]{12,})\b/g, "[REDACTED]");
}

function optionalProvider(value: unknown): AIRuntimeProviderId | undefined {
  try {
    return value === undefined ? undefined : validateRuntimeProviderId(value);
  } catch {
    return undefined;
  }
}

function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

function titleFromPrompt(content: string): string {
  return content.replace(/\s+/g, " ").trim().slice(0, 48) || "New Agent Session";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Agent planning failed.";
}
