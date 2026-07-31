import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { app, type BrowserWindow } from "electron";
import { IPC_CHANNELS } from "../ipc-channels";
import type { TerminalManager } from "../terminal-manager";
import type { WorkspaceScanSummary } from "../../../src/types/levi-api";
import { discoverTasks } from "./task-discovery";
import { parseProblemsFromOutput } from "./problem-matchers";
import {
  validateTaskCancelRequest,
  validateTaskOutputRequest,
  validateTaskPinRequest,
  validateTaskRunRequest
} from "./task-validation";
import type {
  TaskDefinition,
  TaskEvent,
  TaskHistoryEntry,
  TaskListResult,
  TaskOutputEntry,
  TaskPersistenceState,
  TaskProblem,
  TaskRun,
  TaskStatus
} from "./task-types";

const STATE_FILE = "task-state.json";
const MAX_HISTORY = 100;
const MAX_OUTPUT_ENTRIES = 2000;

type WorkspaceProvider = () => string | null;
type SummaryProvider = () => WorkspaceScanSummary | undefined;

type ActiveRun = TaskRun & {
  task: TaskDefinition;
  outputBuffer: string;
  window: BrowserWindow;
};

function defaultPersistence(): TaskPersistenceState {
  return { recentTaskIds: [], pinnedTaskIds: [], history: [] };
}

export class TaskService {
  private definitions: TaskDefinition[] = [];
  private activeRuns = new Map<string, ActiveRun>();
  private problems: TaskProblem[] = [];
  private outputEntries: TaskOutputEntry[] = [];
  private persistence: TaskPersistenceState = defaultPersistence();
  private readonly statePath: string;
  private listeners: Array<(event: TaskEvent) => void> = [];

  constructor(
    private readonly terminalManager: TerminalManager,
    private readonly getWorkspaceRoot: WorkspaceProvider,
    private readonly getWorkspaceSummary: SummaryProvider,
    options?: { statePath?: string }
  ) {
    this.statePath =
      options?.statePath ??
      path.join(typeof app?.getPath === "function" ? app.getPath("userData") : os.tmpdir(), STATE_FILE);
  }

  onEvent(listener: (event: TaskEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((item) => item !== listener);
    };
  }

  private emit(event: TaskEvent, window?: BrowserWindow): void {
    for (const listener of this.listeners) {
      listener(event);
    }
    const target = window ?? [...this.activeRuns.values()].find((run) => run.id === (event.type === "status" ? event.run.id : event.type === "output" ? event.runId : ""))?.window;
    if (target && !target.isDestroyed()) {
      target.webContents.send(IPC_CHANNELS.tasksEvent, event);
    }
  }

  async initialize(): Promise<void> {
    try {
      const raw = await fs.readFile(this.statePath, "utf8");
      const parsed = JSON.parse(raw) as TaskPersistenceState;
      this.persistence = {
        recentTaskIds: Array.isArray(parsed.recentTaskIds) ? parsed.recentTaskIds.slice(0, 32) : [],
        pinnedTaskIds: Array.isArray(parsed.pinnedTaskIds) ? parsed.pinnedTaskIds.slice(0, 32) : [],
        history: Array.isArray(parsed.history) ? parsed.history.slice(0, MAX_HISTORY) : []
      };
    } catch {
      this.persistence = defaultPersistence();
    }
    await this.refreshDefinitions();
  }

  async refreshDefinitions(): Promise<TaskDefinition[]> {
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) {
      this.definitions = [];
      return [];
    }
    this.definitions = await discoverTasks(workspaceRoot, this.getWorkspaceSummary());
    for (const taskId of this.persistence.pinnedTaskIds) {
      const task = this.definitions.find((item) => item.id === taskId);
      if (task) task.pinned = true;
    }
    return this.definitions;
  }

  async list(): Promise<TaskListResult> {
    await this.refreshDefinitions();
    const running = [...this.activeRuns.values()].map((run) => this.publicRun(run));
    const failed = this.persistence.history
      .filter((entry) => entry.status === "failed")
      .slice(0, 16)
      .map((entry) => ({
        id: entry.id,
        taskId: entry.taskId,
        label: entry.label,
        status: entry.status,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        durationMs: entry.durationMs,
        exitCode: entry.exitCode
      }));
    return {
      detected: this.definitions,
      recent: this.persistence.history.slice(0, 16),
      running,
      failed,
      pinned: [...this.persistence.pinnedTaskIds]
    };
  }

  getHistory(): TaskHistoryEntry[] {
    return [...this.persistence.history];
  }

  getProblems(): TaskProblem[] {
    return [...this.problems];
  }

  getOutput(request?: unknown): TaskOutputEntry[] {
    const validated = validateTaskOutputRequest(request);
    return this.outputEntries.filter((entry) => {
      if (validated.source && entry.source !== validated.source) return false;
      if (validated.channel && entry.channel !== validated.channel) return false;
      return true;
    });
  }

  async run(request: unknown, window: BrowserWindow): Promise<TaskRun> {
    const { taskId } = validateTaskRunRequest(request);
    await this.refreshDefinitions();
    const task = this.definitions.find((item) => item.id === taskId);
    if (!task) {
      throw new Error("Unknown task.");
    }
    return this.runTask(task, window);
  }

  async runByName(taskName: string, window: BrowserWindow): Promise<{ success: boolean; message?: string }> {
    await this.refreshDefinitions();
    const task = this.definitions.find((item) => item.label === taskName || item.id === taskName);
    if (!task) {
      return { success: false, message: `Task "${taskName}" was not found in the workspace.` };
    }
    const run = await this.runTask(task, window);
    return new Promise((resolve) => {
      if (run.status !== "running") {
        resolve({ success: run.status === "succeeded" });
        return;
      }
      const unsubscribe = this.onEvent((event) => {
        if (event.type !== "status" || event.run.id !== run.id) return;
        if (event.run.status === "running" || event.run.status === "queued") return;
        unsubscribe();
        resolve({
          success: event.run.status === "succeeded",
          message: event.run.status === "failed" ? `Task "${taskName}" failed with exit code ${event.run.exitCode ?? 1}.` : undefined
        });
      });
    });
  }

  async cancel(request: unknown): Promise<TaskRun> {
    const { runId } = validateTaskCancelRequest(request);
    const active = this.activeRuns.get(runId);
    if (!active) {
      throw new Error("Unknown task run.");
    }
    if (active.terminalSessionId) {
      this.terminalManager.kill(active.terminalSessionId);
    }
    return this.finishRun(active, "cancelled", active.exitCode);
  }

  async pin(request: unknown): Promise<TaskListResult> {
    const { taskId, pinned } = validateTaskPinRequest(request);
    if (pinned) {
      if (!this.persistence.pinnedTaskIds.includes(taskId)) {
        this.persistence.pinnedTaskIds.unshift(taskId);
        this.persistence.pinnedTaskIds = this.persistence.pinnedTaskIds.slice(0, 32);
      }
    } else {
      this.persistence.pinnedTaskIds = this.persistence.pinnedTaskIds.filter((item) => item !== taskId);
    }
    await this.persist();
    return this.list();
  }

  appendOutput(entry: Omit<TaskOutputEntry, "id" | "timestamp">): TaskOutputEntry {
    const fullEntry: TaskOutputEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: new Date().toISOString()
    };
    this.outputEntries.push(fullEntry);
    if (this.outputEntries.length > MAX_OUTPUT_ENTRIES) {
      this.outputEntries.splice(0, this.outputEntries.length - MAX_OUTPUT_ENTRIES);
    }
    this.emit({ type: "output-entry", entry: fullEntry });
    return fullEntry;
  }

  bindTerminalOutput(sessionId: string, data: string): void {
    for (const run of this.activeRuns.values()) {
      if (run.terminalSessionId === sessionId) {
        this.handleOutput(run, data);
        return;
      }
    }
  }

  private async runTask(task: TaskDefinition, window: BrowserWindow): Promise<TaskRun> {
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) {
      throw new Error("Open a workspace before running tasks.");
    }
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const active: ActiveRun = {
      id: runId,
      taskId: task.id,
      label: task.label,
      status: "running",
      startedAt,
      task,
      outputBuffer: "",
      window
    };
    this.activeRuns.set(runId, active);
    this.trackRecentTask(task.id);
    this.emit({ type: "status", run: this.publicRun(active) }, window);

    const terminal = this.terminalManager.createCommand(
      window,
      {
        command: task.command,
        args: task.args,
        cwd: task.cwd ? path.resolve(workspaceRoot, task.cwd) : workspaceRoot,
        name: task.label,
        cols: 96,
        rows: 16
      },
      (exitCode) => {
        const current = this.activeRuns.get(runId);
        if (!current) return;
        void this.finishRun(current, exitCode === 0 ? "succeeded" : "failed", exitCode);
      }
    );
    active.terminalSessionId = terminal.id;

    this.appendOutput({
      source: "task",
      channel: task.label,
      text: `Started task: ${task.label}\n> ${task.command} ${task.args.join(" ")}\n`,
      taskRunId: runId
    });

    return this.publicRun(active);
  }

  private handleOutput(run: ActiveRun, chunk: string): void {
    run.outputBuffer += chunk;
    this.appendOutput({
      source: "task",
      channel: run.label,
      text: chunk,
      taskRunId: run.id
    });
    this.emit({ type: "output", runId: run.id, data: chunk }, run.window);
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) return;
    const parsed = parseProblemsFromOutput(chunk, run.task.problemMatchers, workspaceRoot, run.label, run.id);
    if (parsed.length === 0) return;
    this.problems = [...this.problems.filter((problem) => problem.taskRunId !== run.id), ...parsed];
    this.emit({ type: "problems", problems: this.problems }, run.window);
  }

  private async finishRun(run: ActiveRun, status: TaskStatus, exitCode?: number): Promise<TaskRun> {
    const endedAt = new Date().toISOString();
    const durationMs = run.startedAt ? Date.parse(endedAt) - Date.parse(run.startedAt) : undefined;
    run.status = status;
    run.endedAt = endedAt;
    run.durationMs = durationMs;
    run.exitCode = exitCode;
    this.activeRuns.delete(run.id);

    const historyEntry: TaskHistoryEntry = {
      id: run.id,
      taskId: run.taskId,
      label: run.label,
      status,
      startedAt: run.startedAt ?? endedAt,
      endedAt,
      durationMs,
      exitCode
    };
    this.persistence.history.unshift(historyEntry);
    this.persistence.history = this.persistence.history.slice(0, MAX_HISTORY);
    await this.persist();
    this.emit({ type: "status", run: this.publicRun(run) }, run.window);
    return this.publicRun(run);
  }

  private publicRun(run: ActiveRun | TaskRun): TaskRun {
    return {
      id: run.id,
      taskId: run.taskId,
      label: run.label,
      status: run.status,
      terminalSessionId: run.terminalSessionId,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      durationMs: run.durationMs,
      exitCode: run.exitCode
    };
  }

  private trackRecentTask(taskId: string): void {
    this.persistence.recentTaskIds = [taskId, ...this.persistence.recentTaskIds.filter((item) => item !== taskId)].slice(0, 32);
    void this.persist();
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify(this.persistence, null, 2), "utf8");
  }
}
