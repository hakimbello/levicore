export type DebugSessionState =
  | "Idle"
  | "Starting"
  | "Running"
  | "Paused"
  | "Stopping"
  | "Stopped"
  | "Terminated";

export type DebugErrorCode =
  | "NO_WORKSPACE"
  | "MISSING_ADAPTER"
  | "INVALID_CONFIGURATION"
  | "LAUNCH_FAILED"
  | "ADAPTER_CRASH"
  | "TIMEOUT"
  | "IPC_FAILED"
  | "UNKNOWN";

export type DebugError = {
  code: DebugErrorCode;
  message: string;
  recoverable: boolean;
};

export type DebugLaunchConfiguration = {
  type: string;
  request: "launch" | "attach";
  name: string;
  adapterId?: string;
  program?: string;
  cwd?: string;
  args?: string[];
  env?: Record<string, string>;
  stopOnEntry?: boolean;
  console?: "internalConsole" | "integratedTerminal";
  runtimeArgs?: string[];
  dap?: Record<string, unknown>;
};

export type DebugStartRequest = {
  configuration?: DebugLaunchConfiguration;
  configurationName?: string;
};

export type DebugLaunchConfigurationSource = ".vscode/launch.json" | ".levi/launch.json" | "detected";

export type DebugLaunchConfigurationEntry = {
  id: string;
  name: string;
  configuration: DebugLaunchConfiguration;
  source: DebugLaunchConfigurationSource;
  default?: boolean;
};

export type DebugBreakpoint = {
  id: string;
  relativePath: string;
  line: number;
  column?: number;
  enabled: boolean;
  condition?: string;
  logMessage?: string;
  hitCondition?: string;
  verified?: boolean;
  message?: string;
  createdAt: string;
  updatedAt: string;
};

export type DebugSetBreakpointRequest = {
  relativePath: string;
  line: number;
  column?: number;
  enabled?: boolean;
  condition?: string;
  logMessage?: string;
  hitCondition?: string;
  toggle?: boolean;
};

export type DebugRemoveBreakpointRequest = {
  breakpointId?: string;
  relativePath?: string;
  line?: number;
};

export type DebugVariable = {
  name: string;
  value: string;
  type?: string;
  variablesReference?: number;
  evaluateName?: string;
  namedVariables?: number;
  indexedVariables?: number;
  memoryReference?: string;
  children?: DebugVariable[];
  expanded?: boolean;
  truncated?: boolean;
  hasMoreChildren?: boolean;
};

export type DebugScope = {
  name: string;
  variablesReference: number;
  expensive: boolean;
  variables: DebugVariable[];
};

export type DebugStackFrame = {
  id: number;
  name: string;
  relativePath?: string;
  sourceName?: string;
  line?: number;
  column?: number;
};

export type DebugThread = {
  id: number;
  name: string;
  stopped?: boolean;
  frames: DebugStackFrame[];
};

export type DebugWatchExpression = {
  id: string;
  expression: string;
  enabled: boolean;
  value?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type DebugConsoleEntry = {
  id: string;
  timestamp: string;
  category: "stdout" | "stderr" | "console" | "telemetry" | "error" | "info";
  output: string;
};

export type DebugLoadedSource = {
  name?: string;
  relativePath?: string;
};

export type DebugExceptionBreakpointFilter = "all" | "uncaught" | "userUnhandled";

export type DebugExceptionBreakpoint = {
  filter: DebugExceptionBreakpointFilter;
  enabled: boolean;
  label: string;
};

export type DebugExceptionInfo = {
  type?: string;
  message?: string;
  description?: string;
  stackTrace?: string;
  module?: string;
  threadId?: number;
  relativePath?: string;
  line?: number;
};

export type DebugInlineValue = {
  name: string;
  value: string;
};

export type DebugEvaluateResult = {
  expression: string;
  result: string;
  type?: string;
  variablesReference?: number;
  namedVariables?: number;
  indexedVariables?: number;
  memoryReference?: string;
  error?: string;
  cached?: boolean;
};

export type DebugEvaluationCacheEntry = {
  key: string;
  expression: string;
  context: "repl" | "watch" | "hover";
  frameId?: number;
  result: DebugEvaluateResult;
  timestamp: string;
};

export type DebugCompletionRequest = {
  text: string;
  column: number;
  frameId?: number;
};

export type DebugCompletionItem = {
  label: string;
  detail?: string;
  insertText?: string;
};

export type DebugSetExceptionBreakpointsRequest = {
  breakpoints: DebugExceptionBreakpoint[];
};

export type DebugSessionSummary = {
  id: string;
  name: string;
  type: string;
  startedAt: string;
};

export type DebugState = {
  state: DebugSessionState;
  session?: DebugSessionSummary;
  launchConfigurations: DebugLaunchConfigurationEntry[];
  selectedLaunchConfigurationName?: string;
  breakpoints: DebugBreakpoint[];
  watches: DebugWatchExpression[];
  variables: DebugScope[];
  callStack: DebugThread[];
  activeThreadId?: number;
  activeStackFrame?: DebugStackFrame;
  loadedSources: DebugLoadedSource[];
  console: DebugConsoleEntry[];
  exceptionBreakpoints: DebugExceptionBreakpoint[];
  exceptionInfo?: DebugExceptionInfo;
  inlineValues: DebugInlineValue[];
  lastEvaluation?: DebugEvaluateResult;
  evaluationCache: DebugEvaluationCacheEntry[];
  lastLaunchConfiguration?: DebugLaunchConfiguration;
  error?: DebugError;
};

export type DebugPersistenceState = {
  breakpoints: DebugBreakpoint[];
  watches: DebugWatchExpression[];
  exceptionBreakpoints?: DebugExceptionBreakpoint[];
  lastLaunchConfiguration?: DebugLaunchConfiguration;
  selectedLaunchConfigurationName?: string;
};

export type DebugEvaluateRequest = {
  expression: string;
  context?: "repl" | "watch" | "hover";
  frameId?: number;
};

export type DebugLoadVariablesRequest = {
  variablesReference: number;
};

export type DebugUpdateWatchRequest = {
  id: string;
  expression: string;
};

export type DebugEvent =
  | {
      type: "state";
      state: DebugState;
    }
  | {
      type: "console";
      entry: DebugConsoleEntry;
      state: DebugState;
    }
  | {
      type: "navigation";
      frame: DebugStackFrame;
      state: DebugState;
    }
  | {
      type: "evaluation";
      result: DebugEvaluateResult;
      state: DebugState;
    }
  | {
      type: "error";
      error: DebugError;
      state: DebugState;
    };

export const DEFAULT_EXCEPTION_BREAKPOINTS: DebugExceptionBreakpoint[] = [
  { filter: "all", enabled: false, label: "All Exceptions" },
  { filter: "uncaught", enabled: false, label: "Uncaught Exceptions" },
  { filter: "userUnhandled", enabled: false, label: "User-Unhandled Exceptions" }
];

export type DapProtocolMessage = {
  seq: number;
  type: "request" | "response" | "event";
  command?: string;
  event?: string;
  request_seq?: number;
  success?: boolean;
  message?: string;
  body?: unknown;
  arguments?: unknown;
};

export function isTerminalDebugState(state: DebugSessionState): boolean {
  return state === "Idle" || state === "Stopped" || state === "Terminated";
}
