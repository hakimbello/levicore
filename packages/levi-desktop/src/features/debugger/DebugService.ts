import { BreakpointManager } from "./BreakpointManager";
import { CallStackStore } from "./CallStackStore";
import { DebugSession, type DebugTransport } from "./DebugSession";
import { VariableStore } from "./VariableStore";
import { WatchStore } from "./WatchStore";
import { randomId } from "./ids";
import type {
  DapProtocolMessage,
  DebugConsoleEntry,
  DebugError,
  DebugEvent,
  DebugLaunchConfiguration,
  DebugPersistenceState,
  DebugSessionState,
  DebugState
} from "./DebugEvents";

export type DebugAdapterHandle = {
  session: DebugSession;
  dispose: () => void;
};

export type DebugAdapterFactory = (configuration: DebugLaunchConfiguration) => Promise<DebugTransport>;

type DebugServiceOptions = {
  createAdapter: DebugAdapterFactory;
  onDidChangePersistence?: (state: DebugPersistenceState) => void | Promise<void>;
};

export class DebugService {
  readonly breakpoints = new BreakpointManager();
  readonly variables = new VariableStore();
  readonly callStack = new CallStackStore();
  readonly watches = new WatchStore();

  private state: DebugSessionState = "Idle";
  private session: DebugSession | null = null;
  private sessionStartedAt: string | null = null;
  private lastLaunchConfiguration: DebugLaunchConfiguration | undefined;
  private error: DebugError | undefined;
  private readonly consoleEntries: DebugConsoleEntry[] = [];
  private readonly listeners: Array<(event: DebugEvent) => void> = [];

  constructor(private readonly options: DebugServiceOptions) {}

  hydrate(persistence: DebugPersistenceState): void {
    this.breakpoints.replaceAll(persistence.breakpoints);
    this.watches.replaceAll(persistence.watches);
    this.lastLaunchConfiguration = persistence.lastLaunchConfiguration;
    this.emitState();
  }

  snapshot(): DebugState {
    return {
      state: this.state,
      session: this.session
        ? {
            id: this.session.id,
            name: this.session.name,
            type: this.lastLaunchConfiguration?.type ?? "debug",
            startedAt: this.sessionStartedAt ?? new Date().toISOString()
          }
        : undefined,
      breakpoints: this.breakpoints.list(),
      watches: this.watches.list(),
      variables: this.variables.list(),
      callStack: this.callStack.list(),
      console: [...this.consoleEntries],
      lastLaunchConfiguration: this.lastLaunchConfiguration,
      error: this.error
    };
  }

  onEvent(listener: (event: DebugEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  setState(state: DebugSessionState): void {
    this.state = state;
    this.emitState();
  }

  setError(error: DebugError): void {
    this.error = error;
    this.addConsole("error", error.message);
    this.emit({ type: "error", error, state: this.snapshot() });
  }

  async start(configuration: DebugLaunchConfiguration): Promise<DebugState> {
    if (this.session) {
      await this.stop();
    }
    this.error = undefined;
    this.lastLaunchConfiguration = configuration;
    await this.persist();
    this.setState("Starting");

    try {
      const transport = await this.options.createAdapter(configuration);
      const session = new DebugSession(randomId("debug-session"), configuration.name, transport);
      this.session = session;
      this.sessionStartedAt = new Date().toISOString();
      session.onEvent((message) => this.handleAdapterEvent(message));
      await session.request("initialize", {
        adapterID: configuration.adapterId ?? configuration.type,
        pathFormat: "path",
        linesStartAt1: true,
        columnsStartAt1: true,
        supportsVariableType: true
      });
      await this.syncBreakpoints();
      await session.request(configuration.request, this.launchArguments(configuration), 15000);
      await session.request("configurationDone", {}, 10000).catch(() => undefined);
      this.setState("Running");
    } catch (error) {
      this.variables.clear();
      this.callStack.clear();
      this.session?.dispose();
      this.session = null;
      this.sessionStartedAt = null;
      this.state = "Stopped";
      this.setError({
        code: error instanceof Error && /adapter/i.test(error.message) ? "MISSING_ADAPTER" : "LAUNCH_FAILED",
        message: error instanceof Error ? error.message : "Debug launch failed.",
        recoverable: true
      });
      this.emitState();
    }
    return this.snapshot();
  }

  async stop(): Promise<DebugState> {
    if (!this.session) {
      this.setState("Stopped");
      return this.snapshot();
    }
    this.setState("Stopping");
    await this.session.request("disconnect", { terminateDebuggee: true }, 5000).catch(() => undefined);
    this.session.dispose();
    this.session = null;
    this.sessionStartedAt = null;
    this.variables.clear();
    this.callStack.clear();
    this.setState("Stopped");
    return this.snapshot();
  }

  async restart(): Promise<DebugState> {
    const configuration = this.lastLaunchConfiguration;
    if (!configuration) {
      this.setError({
        code: "INVALID_CONFIGURATION",
        message: "No previous debug configuration is available.",
        recoverable: false
      });
      return this.snapshot();
    }
    await this.stop();
    return this.start(configuration);
  }

  async control(command: "pause" | "continue" | "next" | "stepIn" | "stepOut"): Promise<DebugState> {
    if (!this.session) {
      this.setError({
        code: "IPC_FAILED",
        message: "No active debug session.",
        recoverable: true
      });
      return this.snapshot();
    }
    const threadId = this.callStack.list().find((thread) => thread.stopped)?.id ?? 1;
    await this.session.request(command, command === "pause" ? { threadId } : { threadId }, 5000).catch((error) => {
      this.setError({
        code: "IPC_FAILED",
        message: error instanceof Error ? error.message : `${command} failed.`,
        recoverable: true
      });
    });
    if (command === "continue") this.setState("Running");
    return this.snapshot();
  }

  async setBreakpoint(request: Parameters<BreakpointManager["set"]>[0]): Promise<DebugState> {
    if (request.toggle) {
      this.breakpoints.toggle(request);
    } else {
      this.breakpoints.set(request);
    }
    await this.persist();
    await this.syncBreakpoints();
    this.emitState();
    return this.snapshot();
  }

  async removeBreakpoint(breakpointId?: string, relativePath?: string, line?: number): Promise<DebugState> {
    if (breakpointId) {
      this.breakpoints.removeById(breakpointId);
    } else if (relativePath && typeof line === "number") {
      this.breakpoints.removeAt(relativePath, line);
    }
    await this.persist();
    await this.syncBreakpoints();
    this.emitState();
    return this.snapshot();
  }

  async setBreakpointEnabled(breakpointId: string, enabled: boolean): Promise<DebugState> {
    this.breakpoints.setEnabled(breakpointId, enabled);
    await this.persist();
    await this.syncBreakpoints();
    this.emitState();
    return this.snapshot();
  }

  async addWatch(expression: string): Promise<DebugState> {
    this.watches.add(expression);
    await this.persist();
    this.emitState();
    return this.snapshot();
  }

  async removeWatch(id: string): Promise<DebugState> {
    this.watches.remove(id);
    await this.persist();
    this.emitState();
    return this.snapshot();
  }

  clearRuntimeState(): void {
    this.session?.dispose();
    this.session = null;
    this.sessionStartedAt = null;
    this.variables.clear();
    this.callStack.clear();
    this.consoleEntries.length = 0;
    this.state = "Idle";
    this.error = undefined;
    this.emitState();
  }

  private handleAdapterEvent(message: DapProtocolMessage): void {
    if (message.event === "initialized") {
      void this.syncBreakpoints();
    } else if (message.event === "stopped") {
      this.setState("Paused");
      const body = message.body as { threadId?: unknown; reason?: unknown } | undefined;
      const threadId = typeof body?.threadId === "number" ? body.threadId : 1;
      this.callStack.setFrames(threadId, [], true);
    } else if (message.event === "continued") {
      this.setState("Running");
    } else if (message.event === "terminated" || message.event === "exited") {
      this.variables.clear();
      this.callStack.clear();
      this.setState("Terminated");
    } else if (message.event === "output") {
      const body = message.body as { category?: unknown; output?: unknown } | undefined;
      this.addConsole(
        body?.category === "stderr" ? "stderr" : body?.category === "telemetry" ? "telemetry" : "console",
        typeof body?.output === "string" ? body.output : ""
      );
    }
  }

  private async syncBreakpoints(): Promise<void> {
    if (!this.session) return;
    const byPath = new Map<string, ReturnType<BreakpointManager["list"]>>();
    for (const breakpoint of this.breakpoints.list().filter((item) => item.enabled)) {
      byPath.set(breakpoint.relativePath, [...(byPath.get(breakpoint.relativePath) ?? []), breakpoint]);
    }
    for (const [relativePath, breakpoints] of byPath) {
      const body = await this.session
        .request("setBreakpoints", {
          source: { path: relativePath },
          breakpoints: breakpoints.map((breakpoint) => ({
            line: breakpoint.line,
            column: breakpoint.column,
            condition: breakpoint.condition,
            logMessage: breakpoint.logMessage,
            hitCondition: breakpoint.hitCondition
          }))
        })
        .catch(() => null);
      const responseBreakpoints = (body as { breakpoints?: Array<{ line?: number; verified?: boolean; message?: string }> } | null)
        ?.breakpoints;
      if (Array.isArray(responseBreakpoints)) {
        this.breakpoints.updateVerification(
          relativePath,
          responseBreakpoints.map((breakpoint, index) => ({
            line: typeof breakpoint.line === "number" ? breakpoint.line : breakpoints[index]?.line ?? 1,
            verified: breakpoint.verified,
            message: breakpoint.message
          }))
        );
      }
    }
  }

  private launchArguments(configuration: DebugLaunchConfiguration): Record<string, unknown> {
    return {
      name: configuration.name,
      type: configuration.type,
      request: configuration.request,
      program: configuration.program,
      cwd: configuration.cwd,
      args: configuration.args,
      env: configuration.env,
      stopOnEntry: configuration.stopOnEntry,
      console: configuration.console,
      runtimeArgs: configuration.runtimeArgs,
      ...(configuration.dap ?? {})
    };
  }

  private addConsole(category: DebugConsoleEntry["category"], output: string): void {
    if (!output) return;
    const entry: DebugConsoleEntry = {
      id: randomId("debug-console"),
      timestamp: new Date().toISOString(),
      category,
      output
    };
    this.consoleEntries.push(entry);
    if (this.consoleEntries.length > 500) this.consoleEntries.shift();
    this.emit({ type: "console", entry, state: this.snapshot() });
  }

  private async persist(): Promise<void> {
    await this.options.onDidChangePersistence?.({
      breakpoints: this.breakpoints.list(),
      watches: this.watches.list(),
      lastLaunchConfiguration: this.lastLaunchConfiguration
    });
  }

  private emitState(): void {
    this.emit({ type: "state", state: this.snapshot() });
  }

  private emit(event: DebugEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
