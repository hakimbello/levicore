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
  children?: DebugVariable[];
  expanded?: boolean;
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
  lastLaunchConfiguration?: DebugLaunchConfiguration;
  error?: DebugError;
};

export type DebugPersistenceState = {
  breakpoints: DebugBreakpoint[];
  watches: DebugWatchExpression[];
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
      type: "error";
      error: DebugError;
      state: DebugState;
    };

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
