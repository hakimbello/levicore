import { CallStackStore } from "./CallStackStore";
import { DebugSession, type DebugTransport } from "./DebugSession";
import { VariableStore } from "./VariableStore";
import { randomId } from "./ids";
import type {
  DebugConsoleEntry,
  DebugExceptionInfo,
  DebugInlineValue,
  DebugLaunchConfiguration,
  DebugLoadedSource,
  DebugManagedSession,
  DebugSessionState,
  DebugStackFrame
} from "./DebugEvents";

export class DebugSessionHost {
  readonly id: string;
  readonly variables = new VariableStore();
  readonly callStack = new CallStackStore();
  readonly consoleEntries: DebugConsoleEntry[] = [];
  loadedSources: DebugLoadedSource[] = [];
  exceptionInfo?: DebugExceptionInfo;
  inlineValues: DebugInlineValue[] = [];
  state: DebugSessionState = "Idle";
  startedAt = new Date().toISOString();
  dapSession: DebugSession | null = null;
  adapterDispose?: () => void;

  constructor(
    readonly configuration: DebugLaunchConfiguration,
    readonly adapterId: string
  ) {
    this.id = randomId("debug-session");
  }

  bindSession(session: DebugSession, dispose?: () => void): void {
    this.dapSession = session;
    this.adapterDispose = dispose;
    this.startedAt = new Date().toISOString();
  }

  dispose(): void {
    this.dapSession?.dispose();
    this.dapSession = null;
    this.adapterDispose?.();
    this.adapterDispose = undefined;
    this.variables.clear();
    this.callStack.clear();
    this.consoleEntries.length = 0;
    this.loadedSources = [];
    this.exceptionInfo = undefined;
    this.inlineValues = [];
    this.state = "Stopped";
  }

  toManagedSession(activeFrame?: DebugStackFrame): DebugManagedSession {
    return {
      id: this.id,
      name: this.configuration.name,
      configurationName: this.configuration.name,
      adapterId: this.adapterId,
      state: this.state,
      startedAt: this.startedAt,
      variables: this.variables.list(),
      callStack: this.callStack.list(),
      activeThreadId: this.callStack.getActiveThreadId(),
      activeStackFrame: activeFrame ?? this.callStack.getActiveFrame(),
      console: [...this.consoleEntries],
      loadedSources: [...this.loadedSources],
      exceptionInfo: this.exceptionInfo ? { ...this.exceptionInfo } : undefined,
      inlineValues: [...this.inlineValues]
    };
  }
}
