export type TaskSource = "builtin" | "vscode" | "levi" | "detected";
export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type TaskGroup = "build" | "test" | "lint" | "format" | "run" | "dev" | "watch" | "none";
export type TaskProblemSeverity = "error" | "warning" | "info";
export type TaskOutputSource = "task" | "levi" | "git" | "debugger" | "extension";

export type TaskDefinition = {
  id: string;
  label: string;
  source: TaskSource;
  group: TaskGroup;
  command: string;
  args: string[];
  cwd?: string;
  problemMatchers: string[];
  pinned?: boolean;
};

export type TaskProblem = {
  id: string;
  relativePath: string;
  line: number;
  column: number;
  severity: TaskProblemSeverity;
  message: string;
  source: string;
  taskRunId?: string;
};

export type TaskOutputEntry = {
  id: string;
  source: TaskOutputSource;
  channel: string;
  text: string;
  timestamp: string;
  taskRunId?: string;
};

export type TaskRun = {
  id: string;
  taskId: string;
  label: string;
  status: TaskStatus;
  terminalSessionId?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  exitCode?: number;
};

export type TaskHistoryEntry = {
  id: string;
  taskId: string;
  label: string;
  status: TaskStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  exitCode?: number;
};

export type TaskListResult = {
  detected: TaskDefinition[];
  recent: TaskHistoryEntry[];
  running: TaskRun[];
  failed: TaskRun[];
  pinned: string[];
};

export type TaskRunRequest = {
  taskId: string;
};

export type TaskCancelRequest = {
  runId: string;
};

export type TaskOutputRequest = {
  source?: TaskOutputSource;
  channel?: string;
};

export type TaskPinRequest = {
  taskId: string;
  pinned: boolean;
};

export type TaskEvent =
  | { type: "output"; runId: string; data: string }
  | { type: "status"; run: TaskRun }
  | { type: "problems"; problems: TaskProblem[] }
  | { type: "output-entry"; entry: TaskOutputEntry };
