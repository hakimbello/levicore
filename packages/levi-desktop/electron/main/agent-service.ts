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
  AgentRepairStatusRequest,
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
};

export class AgentService {
  private readonly statePath: string;
  private readonly emit: (event: AgentEvent) => void;
  private readonly executionService: AgentExecutionService;
  private persistence: AgentPersistence = defaultPersistence();

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
    this.options.taskService?.onEvent((event) => this.executionService.handleTaskEvent(event));
    this.options.terminalManager?.onTerminalData((sessionId, data) => this.executionService.handleTerminalData(sessionId, data));
  }

  async initialize(): Promise<AgentState> {
    await this.load();
    for (const session of this.persistence.sessions) this.executionService.markInterrupted(session);
    await this.persist();
    return this.snapshot();
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
    const session = request.sessionId
      ? this.requireSession(request.sessionId)
      : await this.createSessionForPlan(request);
    const now = new Date().toISOString();
    session.status = "Planning";
    session.runtimeId = request.runtimeId ?? session.runtimeId;
    session.modelId = request.modelId;
    session.attachments = request.attachments ?? [];
    session.error = undefined;
    session.messages = [...session.messages, { id: randomUUID(), role: "user" as const, content: request.prompt, createdAt: now }].slice(-MAX_MESSAGES);
    this.persistence.activeSessionId = session.id;
    await this.persistAndEmit();

    const projectSummary = await this.analyzeWorkspace(request);
    try {
      const response = await this.runtimeManager.chat({
        providerId: request.runtimeId ?? session.runtimeId,
        model: request.modelId,
        messages: [
          {
            role: "system",
            content:
              "You are Levi's planning-only coding agent. Produce a structured execution plan only. Do not claim to edit files, run commands, use tools, or execute the plan. Return JSON with summary and steps. Every proposed action must wait for user approval."
          },
          {
            role: "user",
            content: buildPlanningPrompt(request.prompt, projectSummary, request.attachments ?? [])
          }
        ],
        options: { format: "json" }
      });
      session.projectSummary = projectSummary;
      session.plan = createExecutionPlan(request.prompt, response.content, projectSummary);
      session.status = session.plan.progress.pendingActions > 0 ? "WaitingForApproval" : "Ready";
      session.messages = [...session.messages, { id: randomUUID(), role: "assistant" as const, content: session.plan.summary, createdAt: new Date().toISOString() }].slice(-MAX_MESSAGES);
    } catch (error) {
      session.projectSummary = projectSummary;
      session.plan = createFallbackPlan(request.prompt, projectSummary);
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
    session.title = session.title === "New Agent Session" ? titleFromPrompt(request.prompt) : session.title;
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
    return {
      sessions: [...this.persistence.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      activeSessionId: this.persistence.activeSessionId,
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
    } catch {
      this.persistence = defaultPersistence();
    }
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify(redactPersistence(this.persistence), null, 2), "utf8");
  }
}

function defaultPersistence(): AgentPersistence {
  return { sessions: [] };
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

function buildPlanningPrompt(prompt: string, summary: AgentProjectSummary, attachments: AIChatAttachment[]): string {
  return JSON.stringify({
    instruction: "Return JSON only with shape { summary: string, steps: [{ title, description, estimatedFiles, actions }] }. Actions are proposals only and must not be executed.",
    objective: prompt,
    project: summary,
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
  const candidate = fenced ?? trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  try {
    const parsed = JSON.parse(candidate) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
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
  return { sessions, activeSessionId };
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
    progress: progressFromApprovals(record),
    estimatedFiles: Array.isArray(record.estimatedFiles) ? record.estimatedFiles.slice(0, 40) : [],
    createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString()
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
  const raw = JSON.stringify(persistence).replace(/(api[_-]?key|token|secret|password)["']?\s*[:=]\s*["'][^"']+["']/gi, "$1:REDACTED");
  return JSON.parse(raw) as AgentPersistence;
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
