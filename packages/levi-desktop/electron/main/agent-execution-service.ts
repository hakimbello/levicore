import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { TextDecoder } from "node:util";
import type {
  AgentActionPreview,
  AgentApprovalAction,
  AgentCancelRequest,
  AgentDiffLine,
  AgentExecuteRequest,
  AgentExecutionQueueItem,
  AgentExecutionResult,
  AgentFileEdit,
  AgentPreviewRequest,
  AgentPreviewResult,
  AgentQueueRequest,
  AgentQueueResult,
  AgentRiskLevel,
  AgentSession,
  AgentState,
  AgentUndoMetadata,
  AgentUndoRequest,
  AgentUndoResult
} from "../../src/features/agent";
import { generateLocalDiff, hashContent, writeAtomically } from "./edit-context";
import { getMonacoLanguage, isInsideRoot, normalizeSlashes } from "./workspace-context";

const MAX_TEXT_BYTES = 5 * 1024 * 1024;
const MAX_CONTENT_CHARS = 420_000;
const MAX_DIFF_LINES = 1_000;
const SUPPORTED_ACTIONS = new Set(["create-file", "modify-file", "delete-file", "rename-file", "create-folder", "rename-folder"]);

type AgentExecutionServiceOptions = {
  getWorkspaceRoot: () => string | null;
  snapshot: () => AgentState;
  persistAndEmit: () => Promise<void>;
  emitExecution: (sessionId: string, actionId: string) => void;
  emitPreview: (sessionId: string, preview: AgentActionPreview) => void;
};

type ResolvedWorkspacePath = {
  rootRealPath: string;
  relativePath: string;
  absolutePath: string;
  parentRealPath: string;
};

type UndoRecord =
  | {
      kind: "create-file";
      actionId: string;
      relativePath: string;
      absolutePath: string;
      timestamp: string;
    }
  | {
      kind: "modify-file" | "delete-file";
      actionId: string;
      relativePath: string;
      absolutePath: string;
      previousContent: string;
      previousHash: string;
      appliedHash?: string;
      timestamp: string;
    }
  | {
      kind: "rename-file" | "rename-folder";
      actionId: string;
      relativePath: string;
      destinationRelativePath: string;
      absolutePath: string;
      destinationAbsolutePath: string;
      timestamp: string;
    }
  | {
      kind: "create-folder";
      actionId: string;
      relativePath: string;
      absolutePath: string;
      timestamp: string;
    };

export class AgentExecutionService {
  private readonly previews = new Map<string, AgentActionPreview>();
  private readonly undoBySession = new Map<string, UndoRecord>();

  constructor(private readonly options: AgentExecutionServiceOptions) {}

  async preview(session: AgentSession, rawRequest: unknown): Promise<AgentPreviewResult> {
    const request = validatePreviewRequest(rawRequest);
    const action = requireAction(session, request.actionId);
    requireSupportedApprovedAction(action);
    const preview = await this.createPreview(session.id, action);
    this.previews.set(preview.previewId, preview);
    const item = ensureQueueItem(session, action);
    item.previewId = preview.previewId;
    await this.touch(session);
    this.options.emitPreview(session.id, preview);
    return { sessionId: session.id, preview, state: this.options.snapshot() };
  }

  async execute(session: AgentSession, rawRequest: unknown): Promise<AgentExecutionResult> {
    const request = validateExecuteRequest(rawRequest);
    const action = requireAction(session, request.actionId);
    requireSupportedApprovedAction(action);
    const queue = ensureQueue(session);
    const item = queue.find((candidate) => candidate.actionId === action.id);
    if (!item) {
      throw new Error("Agent execution queue item was not found.");
    }
    if (queue.some((candidate) => candidate.status === "Executing")) {
      throw new Error("Another agent action is already executing.");
    }
    if (item.status === "Completed") {
      throw new Error("Agent action has already completed.");
    }
    if (item.status === "Rejected" || item.status === "Cancelled") {
      throw new Error("Rejected or cancelled agent actions cannot be executed.");
    }

    const preview = request.previewId ? this.requirePreview(request.previewId, session.id, action.id) : await this.createPreview(session.id, action);
    item.status = "Executing";
    item.startedAt = new Date().toISOString();
    item.error = undefined;
    session.status = "Executing";
    await this.touch(session);
    const activeItem = ensureQueue(session).find((candidate) => candidate.actionId === action.id);
    if (!activeItem) {
      throw new Error("Agent execution queue item was not found.");
    }
    try {
      const undo = await this.applyAction(action, preview);
      this.undoBySession.set(session.id, undo);
      session.plan!.lastUndo = undoMetadata(undo);
      activeItem.status = "Completed";
      activeItem.completedAt = new Date().toISOString();
      session.status = "Ready";
      session.plan!.progress = progressFromSession(session);
      await this.touch(session);
      this.options.emitExecution(session.id, action.id);
      return { sessionId: session.id, actionId: action.id, state: this.options.snapshot() };
    } catch (error) {
      activeItem.status = "Failed";
      activeItem.error = errorMessage(error);
      activeItem.completedAt = new Date().toISOString();
      session.status = "Error";
      session.error = activeItem.error;
      session.plan!.progress = progressFromSession(session);
      await this.touch(session);
      this.options.emitExecution(session.id, action.id);
      throw error;
    }
  }

  async undo(session: AgentSession, rawRequest: unknown): Promise<AgentUndoResult> {
    validateUndoRequest(rawRequest);
    const undo = this.undoBySession.get(session.id);
    if (!undo) {
      throw new Error("No reversible agent action is available.");
    }
    await this.undoRecord(undo);
    this.undoBySession.delete(session.id);
    if (session.plan) {
      session.plan.lastUndo = undefined;
      const item = session.plan.executionQueue.find((candidate) => candidate.actionId === undo.actionId);
      if (item) {
        item.status = "Pending";
        item.completedAt = undefined;
        item.error = undefined;
      }
      session.plan.progress = progressFromSession(session);
    }
    session.status = "Ready";
    session.updatedAt = new Date().toISOString();
    await this.options.persistAndEmit();
    this.options.emitExecution(session.id, undo.actionId);
    return { sessionId: session.id, actionId: undo.actionId, relativePath: undo.relativePath, state: this.options.snapshot() };
  }

  queue(session: AgentSession, rawRequest: unknown): AgentQueueResult {
    const request = validateQueueRequest(rawRequest);
    if (request.sessionId !== session.id) {
      throw new Error("Agent queue request session does not match.");
    }
    const queue = ensureQueue(session);
    const startedAt = queue.map((item) => item.startedAt).filter(Boolean).sort()[0];
    const elapsedMs = startedAt ? Date.now() - Date.parse(startedAt) : 0;
    return {
      sessionId: session.id,
      queue,
      currentActionId: queue.find((item) => item.status === "Executing")?.actionId,
      progress: {
        completed: queue.filter((item) => item.status === "Completed").length,
        remaining: queue.filter((item) => item.status === "Pending").length,
        estimatedFiles: new Set(queue.map((item) => item.relativePath).filter(Boolean)).size,
        elapsedMs
      }
    };
  }

  async cancel(session: AgentSession, rawRequest: unknown): Promise<AgentExecutionResult> {
    const request = validateCancelRequest(rawRequest);
    if (!session.plan) {
      throw new Error("Agent session has no execution plan.");
    }
    const queue = ensureQueue(session);
    const targets = request.actionId ? queue.filter((item) => item.actionId === request.actionId) : queue.filter((item) => item.status === "Pending");
    if (!targets.length) {
      throw new Error("Agent execution queue item was not found.");
    }
    for (const item of targets) {
      if (item.status === "Executing") {
        item.status = "Cancelled";
      } else if (item.status === "Pending" || item.status === "Failed") {
        item.status = "Rejected";
      }
      item.completedAt = new Date().toISOString();
      const action = session.plan.approvals.find((candidate) => candidate.id === item.actionId);
      if (action?.status === "Approved") {
        action.status = "Rejected";
        action.updatedAt = new Date().toISOString();
      }
    }
    session.plan.progress = progressFromSession(session);
    session.status = session.plan.executionQueue.some((item) => item.status === "Executing") ? "Executing" : "Ready";
    await this.touch(session);
    const actionId = request.actionId ?? targets[0].actionId;
    this.options.emitExecution(session.id, actionId);
    return { sessionId: session.id, actionId, state: this.options.snapshot() };
  }

  private async createPreview(sessionId: string, action: AgentApprovalAction): Promise<AgentActionPreview> {
    const target = await this.resolvePath(action.relativePath);
    const now = new Date().toISOString();
    let destination: ResolvedWorkspacePath | undefined;
    let originalContent: string | undefined;
    let proposedContent: string | undefined;
    let diff: AgentDiffLine[] = [];
    let addedLineCount = 0;
    let removedLineCount = 0;

    if (action.destinationRelativePath) {
      destination = await this.resolvePath(action.destinationRelativePath);
    }

    if (action.type === "create-file") {
      await assertPathMissing(target.absolutePath, "Target file already exists.");
      proposedContent = validateTextContent(action.content, "File content");
      const result = generateLocalDiff("", proposedContent);
      diff = result.lines.slice(0, MAX_DIFF_LINES);
      addedLineCount = result.addedLineCount;
      removedLineCount = result.removedLineCount;
    } else if (action.type === "modify-file") {
      originalContent = await readTextFile(target.absolutePath, target.rootRealPath);
      proposedContent = applyFileEdits(originalContent, action);
      const result = generateLocalDiff(originalContent, proposedContent);
      diff = result.lines.slice(0, MAX_DIFF_LINES);
      addedLineCount = result.addedLineCount;
      removedLineCount = result.removedLineCount;
    } else if (action.type === "delete-file") {
      originalContent = await readTextFile(target.absolutePath, target.rootRealPath);
      const result = generateLocalDiff(originalContent, "");
      diff = result.lines.slice(0, MAX_DIFF_LINES);
      addedLineCount = result.addedLineCount;
      removedLineCount = result.removedLineCount;
    } else if (action.type === "rename-file") {
      if (!destination) throw new Error("Rename file actions require a destination path.");
      await assertExistingKind(target.absolutePath, "file");
      await assertPathMissing(destination.absolutePath, "Destination file already exists.");
    } else if (action.type === "create-folder") {
      await assertPathMissing(target.absolutePath, "Target folder already exists.");
    } else if (action.type === "rename-folder") {
      if (!destination) throw new Error("Rename folder actions require a destination path.");
      await assertExistingKind(target.absolutePath, "folder");
      await assertPathMissing(destination.absolutePath, "Destination folder already exists.");
    } else {
      throw new Error("Agent action is not supported by the file executor.");
    }

    return {
      previewId: randomUUID(),
      sessionId,
      actionId: action.id,
      actionType: action.type,
      targetPath: target.relativePath,
      destinationPath: destination?.relativePath,
      summary: previewSummary(action),
      riskLevel: riskFor(action),
      destructive: action.type === "delete-file" || action.type === "rename-file" || action.type === "rename-folder",
      originalContent,
      proposedContent,
      addedLineCount,
      removedLineCount,
      diff,
      createdAt: now
    };
  }

  private async applyAction(action: AgentApprovalAction, preview: AgentActionPreview): Promise<UndoRecord> {
    const target = await this.resolvePath(preview.targetPath);
    if (action.type === "create-file") {
      await assertPathMissing(target.absolutePath, "Target file already exists.");
      await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
      await writeAtomically(target.absolutePath, preview.proposedContent ?? "");
      const written = await readTextFile(target.absolutePath, target.rootRealPath);
      if (hashContent(written) !== hashContent(preview.proposedContent ?? "")) {
        throw new Error("Post-write verification failed.");
      }
      return { kind: "create-file", actionId: action.id, relativePath: target.relativePath, absolutePath: target.absolutePath, timestamp: new Date().toISOString() };
    }
    if (action.type === "modify-file") {
      const current = await readTextFile(target.absolutePath, target.rootRealPath);
      if (hashContent(current) !== hashContent(preview.originalContent ?? "")) {
        throw new Error("File changed since the agent preview was prepared.");
      }
      await writeAtomically(target.absolutePath, preview.proposedContent ?? "");
      const written = await readTextFile(target.absolutePath, target.rootRealPath);
      const proposedHash = hashContent(preview.proposedContent ?? "");
      if (hashContent(written) !== proposedHash) {
        throw new Error("Post-write verification failed.");
      }
      return {
        kind: "modify-file",
        actionId: action.id,
        relativePath: target.relativePath,
        absolutePath: target.absolutePath,
        previousContent: preview.originalContent ?? "",
        previousHash: hashContent(preview.originalContent ?? ""),
        appliedHash: proposedHash,
        timestamp: new Date().toISOString()
      };
    }
    if (action.type === "delete-file") {
      const current = await readTextFile(target.absolutePath, target.rootRealPath);
      if (hashContent(current) !== hashContent(preview.originalContent ?? "")) {
        throw new Error("File changed since the agent preview was prepared.");
      }
      await fs.unlink(target.absolutePath);
      return {
        kind: "delete-file",
        actionId: action.id,
        relativePath: target.relativePath,
        absolutePath: target.absolutePath,
        previousContent: preview.originalContent ?? "",
        previousHash: hashContent(preview.originalContent ?? ""),
        timestamp: new Date().toISOString()
      };
    }
    if (action.type === "rename-file" || action.type === "rename-folder") {
      if (!preview.destinationPath) throw new Error("Rename action has no destination path.");
      const destination = await this.resolvePath(preview.destinationPath);
      await assertPathMissing(destination.absolutePath, "Destination already exists.");
      await assertExistingKind(target.absolutePath, action.type === "rename-file" ? "file" : "folder");
      await fs.mkdir(path.dirname(destination.absolutePath), { recursive: true });
      await fs.rename(target.absolutePath, destination.absolutePath);
      return {
        kind: action.type,
        actionId: action.id,
        relativePath: target.relativePath,
        destinationRelativePath: destination.relativePath,
        absolutePath: target.absolutePath,
        destinationAbsolutePath: destination.absolutePath,
        timestamp: new Date().toISOString()
      };
    }
    if (action.type === "create-folder") {
      await assertPathMissing(target.absolutePath, "Target folder already exists.");
      await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
      await fs.mkdir(target.absolutePath);
      return { kind: "create-folder", actionId: action.id, relativePath: target.relativePath, absolutePath: target.absolutePath, timestamp: new Date().toISOString() };
    }
    throw new Error("Agent action is not supported by the file executor.");
  }

  private async undoRecord(undo: UndoRecord): Promise<void> {
    if (undo.kind === "create-file") {
      await fs.unlink(undo.absolutePath);
      return;
    }
    if (undo.kind === "modify-file") {
      const current = await readTextFile(undo.absolutePath, path.dirname(undo.absolutePath));
      if (undo.appliedHash && hashContent(current) !== undo.appliedHash) {
        throw new Error("Cannot undo because the file changed after the agent applied it.");
      }
      await writeAtomically(undo.absolutePath, undo.previousContent);
      const restored = await readTextFile(undo.absolutePath, path.dirname(undo.absolutePath));
      if (hashContent(restored) !== undo.previousHash) {
        throw new Error("Undo verification failed.");
      }
      return;
    }
    if (undo.kind === "delete-file") {
      await assertPathMissing(undo.absolutePath, "Cannot undo delete because the path now exists.");
      await fs.mkdir(path.dirname(undo.absolutePath), { recursive: true });
      await writeAtomically(undo.absolutePath, undo.previousContent);
      return;
    }
    if (undo.kind === "rename-file" || undo.kind === "rename-folder") {
      await assertPathMissing(undo.absolutePath, "Cannot undo rename because the original path now exists.");
      await fs.mkdir(path.dirname(undo.absolutePath), { recursive: true });
      await fs.rename(undo.destinationAbsolutePath, undo.absolutePath);
      return;
    }
    if (undo.kind === "create-folder") {
      await fs.rmdir(undo.absolutePath);
    }
  }

  private requirePreview(previewId: string, sessionId: string, actionId: string): AgentActionPreview {
    const preview = this.previews.get(previewId);
    if (!preview || preview.sessionId !== sessionId || preview.actionId !== actionId) {
      throw new Error("Agent action preview was not found.");
    }
    return preview;
  }

  private async resolvePath(relativePath: unknown): Promise<ResolvedWorkspacePath> {
    const workspaceRoot = this.options.getWorkspaceRoot();
    if (!workspaceRoot) {
      throw new Error("No workspace is open.");
    }
    const rootRealPath = await fs.realpath(workspaceRoot);
    const normalized = validateRelativePath(relativePath);
    const absolutePath = path.resolve(rootRealPath, normalized);
    if (!isInsideRoot(rootRealPath, absolutePath)) {
      throw new Error("Agent workspace path escapes the selected project.");
    }
    const parentRealPath = await nearestExistingParentRealPath(path.dirname(absolutePath), rootRealPath);
    if (!isInsideRoot(rootRealPath, parentRealPath)) {
      throw new Error("Agent workspace path resolves outside the selected project.");
    }
    return { rootRealPath, relativePath: normalizeSlashes(path.relative(rootRealPath, absolutePath)), absolutePath, parentRealPath };
  }

  private async touch(session: AgentSession): Promise<void> {
    if (session.plan) {
      ensureQueue(session);
      session.plan.progress = progressFromSession(session);
      session.plan.updatedAt = new Date().toISOString();
    }
    session.updatedAt = new Date().toISOString();
    await this.options.persistAndEmit();
  }
}

function validatePreviewRequest(value: unknown): AgentPreviewRequest {
  if (!value || typeof value !== "object") throw new Error("Agent preview request is invalid.");
  const record = value as Record<string, unknown>;
  return { sessionId: validateId(record.sessionId, "sessionId"), actionId: validateId(record.actionId, "actionId") };
}

function validateExecuteRequest(value: unknown): AgentExecuteRequest {
  if (!value || typeof value !== "object") throw new Error("Agent execute request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    actionId: validateId(record.actionId, "actionId"),
    previewId: record.previewId === undefined ? undefined : validateId(record.previewId, "previewId")
  };
}

function validateUndoRequest(value: unknown): AgentUndoRequest {
  if (!value || typeof value !== "object") throw new Error("Agent undo request is invalid.");
  return { sessionId: validateId((value as Record<string, unknown>).sessionId, "sessionId") };
}

function validateQueueRequest(value: unknown): AgentQueueRequest {
  if (!value || typeof value !== "object") throw new Error("Agent queue request is invalid.");
  return { sessionId: validateId((value as Record<string, unknown>).sessionId, "sessionId") };
}

function validateCancelRequest(value: unknown): AgentCancelRequest {
  if (!value || typeof value !== "object") throw new Error("Agent cancel request is invalid.");
  const record = value as Record<string, unknown>;
  return {
    sessionId: validateId(record.sessionId, "sessionId"),
    actionId: record.actionId === undefined ? undefined : validateId(record.actionId, "actionId")
  };
}

function validateId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 140 || value.includes("\0")) throw new Error(`${field} is invalid.`);
  return value;
}

function validateRelativePath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500 || path.isAbsolute(value) || value.includes("\0")) {
    throw new Error("Agent workspace path is invalid.");
  }
  const normalized = normalizeSlashes(value).replace(/^\.\//, "");
  if (!normalized || normalized.split("/").includes("..")) {
    throw new Error("Agent workspace path is invalid.");
  }
  return normalized;
}

function validateTextContent(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > MAX_CONTENT_CHARS || value.includes("\0")) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function requireAction(session: AgentSession, actionId: string): AgentApprovalAction {
  if (!session.plan) throw new Error("Agent session has no execution plan.");
  const action = session.plan.approvals.find((item) => item.id === actionId);
  if (!action) throw new Error("Agent approval action was not found.");
  return action;
}

function requireSupportedApprovedAction(action: AgentApprovalAction): void {
  if (action.status !== "Approved") {
    throw new Error("Agent action must be approved before execution preview.");
  }
  if (!SUPPORTED_ACTIONS.has(action.type)) {
    throw new Error("Only approved workspace file actions can be executed in this milestone.");
  }
}

function ensureQueue(session: AgentSession): AgentExecutionQueueItem[] {
  if (!session.plan) throw new Error("Agent session has no execution plan.");
  const existing = new Map((session.plan.executionQueue ?? []).map((item) => [item.actionId, item]));
  session.plan.executionQueue = session.plan.approvals.map((action) => ({
    actionId: action.id,
    type: action.type,
    title: action.title,
    relativePath: action.relativePath,
    destinationRelativePath: action.destinationRelativePath,
    status: existing.get(action.id)?.status ?? "Pending",
    previewId: existing.get(action.id)?.previewId,
    startedAt: existing.get(action.id)?.startedAt,
    completedAt: existing.get(action.id)?.completedAt,
    error: existing.get(action.id)?.error
  }));
  return session.plan.executionQueue;
}

function ensureQueueItem(session: AgentSession, action: AgentApprovalAction): AgentExecutionQueueItem {
  const item = ensureQueue(session).find((candidate) => candidate.actionId === action.id);
  if (!item) throw new Error("Agent execution queue item was not found.");
  return item;
}

function progressFromSession(session: AgentSession): NonNullable<AgentSession["plan"]>["progress"] {
  const plan = session.plan;
  if (!plan) return { totalSteps: 0, pendingActions: 0, approvedActions: 0, rejectedActions: 0, completedActions: 0 };
  const queue = ensureQueue(session);
  return {
    totalSteps: plan.steps.length,
    pendingActions: plan.approvals.filter((item) => item.status === "Pending").length,
    approvedActions: plan.approvals.filter((item) => item.status === "Approved").length,
    rejectedActions: plan.approvals.filter((item) => item.status === "Rejected").length + queue.filter((item) => item.status === "Rejected").length,
    completedActions: queue.filter((item) => item.status === "Completed").length
  };
}

async function readTextFile(absolutePath: string, rootRealPath: string): Promise<string> {
  const realPath = await fs.realpath(absolutePath);
  if (!isInsideRoot(rootRealPath, realPath)) {
    throw new Error("Agent file target is outside the workspace.");
  }
  const stats = await fs.stat(realPath);
  if (!stats.isFile()) {
    throw new Error("Agent file target is not a file.");
  }
  if (stats.size > MAX_TEXT_BYTES) {
    throw new Error("Agent file target exceeds the safe size limit.");
  }
  const buffer = await fs.readFile(realPath);
  if (buffer.includes(0)) {
    throw new Error("Binary files cannot be edited by the agent.");
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error("Agent file target is not valid UTF-8.");
  }
}

async function assertExistingKind(absolutePath: string, kind: "file" | "folder"): Promise<void> {
  const stats = await fs.stat(absolutePath);
  if (kind === "file" && !stats.isFile()) throw new Error("Agent target is not a file.");
  if (kind === "folder" && !stats.isDirectory()) throw new Error("Agent target is not a folder.");
}

async function assertPathMissing(absolutePath: string, message: string): Promise<void> {
  try {
    await fs.lstat(absolutePath);
    throw new Error(message);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

async function nearestExistingParentRealPath(parentPath: string, rootRealPath: string): Promise<string> {
  let current = parentPath;
  while (isInsideRoot(rootRealPath, current)) {
    try {
      const stats = await fs.stat(current);
      if (!stats.isDirectory()) {
        throw new Error("Agent workspace parent path is not a folder.");
      }
      return fs.realpath(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const next = path.dirname(current);
      if (next === current) break;
      current = next;
    }
  }
  throw new Error("Agent workspace parent path escapes the selected project.");
}

function applyFileEdits(originalContent: string, action: AgentApprovalAction): string {
  if (typeof action.content === "string") {
    return normalizeProposedLineEndings(originalContent, validateTextContent(action.content, "Proposed file content"));
  }
  if (!action.edits?.length) {
    throw new Error("Modify file action has no concrete edit payload.");
  }
  let next = originalContent;
  for (const edit of action.edits) {
    next = applyOneEdit(next, edit);
  }
  next = normalizeProposedLineEndings(originalContent, next);
  if (hashContent(next) === hashContent(originalContent)) {
    throw new Error("Modify file action does not change the target.");
  }
  return next;
}

function applyOneEdit(content: string, edit: AgentFileEdit): string {
  if (edit.kind === "whole-file") {
    return validateTextContent(edit.content, "Whole-file edit content");
  }
  if (edit.kind === "append") {
    const append = validateTextContent(edit.content, "Append edit content");
    const eol = detectLineEnding(content);
    return `${content}${content && !content.endsWith("\n") ? eol : ""}${append}`;
  }
  if (edit.kind === "replace" && typeof edit.find === "string") {
    const replacement = validateTextContent(edit.replace ?? edit.content ?? "", "Replacement edit content");
    const first = content.indexOf(edit.find);
    if (first < 0 || content.indexOf(edit.find, first + edit.find.length) >= 0) {
      throw new Error("Replace edit find text must match exactly once.");
    }
    return `${content.slice(0, first)}${replacement}${content.slice(first + edit.find.length)}`;
  }

  const lines = splitLines(content);
  const eol = detectLineEnding(content);
  if (edit.kind === "insert") {
    const line = validateLine(edit.line, "insert line", lines.length + 1);
    lines.splice(line - 1, 0, ...splitLines(validateTextContent(edit.content, "Insert edit content")));
    return lines.join(eol);
  }
  if (edit.kind === "replace") {
    const range = validateRange(edit.startLine, edit.endLine, lines.length);
    lines.splice(range.start - 1, range.end - range.start + 1, ...splitLines(validateTextContent(edit.content ?? edit.replace ?? "", "Replacement edit content")));
    return lines.join(eol);
  }
  if (edit.kind === "delete-range") {
    const range = validateRange(edit.startLine, edit.endLine, lines.length);
    lines.splice(range.start - 1, range.end - range.start + 1);
    return lines.join(eol);
  }
  throw new Error("Agent file edit kind is invalid.");
}

function splitLines(content: string): string[] {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function validateLine(value: unknown, label: string, max: number): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > max) {
    throw new Error(`${label} is invalid.`);
  }
  return value as number;
}

function validateRange(start: unknown, end: unknown, max: number): { start: number; end: number } {
  const startLine = validateLine(start, "range start", max);
  const endLine = validateLine(end, "range end", max);
  if (endLine < startLine) {
    throw new Error("Edit line range is invalid.");
  }
  return { start: startLine, end: endLine };
}

function detectLineEnding(content: string): "\r\n" | "\n" {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeProposedLineEndings(original: string, proposed: string): string {
  const eol = detectLineEnding(original);
  const normalized = proposed.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return eol === "\r\n" ? normalized.replace(/\n/g, "\r\n") : normalized;
}

function previewSummary(action: AgentApprovalAction): string {
  const target = action.relativePath ?? "workspace";
  if (action.type === "rename-file" || action.type === "rename-folder") {
    return `${action.title}: ${target} -> ${action.destinationRelativePath}`;
  }
  return `${action.title}: ${target}`;
}

function riskFor(action: AgentApprovalAction): AgentRiskLevel {
  if (action.type === "delete-file") return "high";
  if (action.type === "modify-file" || action.type === "rename-file" || action.type === "rename-folder") return "medium";
  return "low";
}

function undoMetadata(undo: UndoRecord): AgentUndoMetadata {
  return {
    actionId: undo.actionId,
    actionType: undo.kind,
    relativePath: undo.relativePath,
    destinationRelativePath: "destinationRelativePath" in undo ? undo.destinationRelativePath : undefined,
    timestamp: undo.timestamp
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Agent action execution failed.";
}
