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
  DebugLaunchConfigurationEntry,
  DebugLoadedSource,
  DebugLaunchConfiguration,
  DebugPersistenceState,
  DebugScope,
  DebugSessionState,
  DebugStackFrame,
  DebugState,
  DebugVariable
} from "./DebugEvents";

export type DebugAdapterHandle = {
  session: DebugSession;
  dispose: () => void;
};

export type DebugAdapterFactory = (configuration: DebugLaunchConfiguration) => Promise<DebugTransport>;

type DebugServiceOptions = {
  createAdapter: DebugAdapterFactory;
  resolveSourcePath?: (relativePath: string) => string;
  relativizeSourcePath?: (sourcePath: string) => string | undefined;
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
  private selectedLaunchConfigurationName: string | undefined;
  private error: DebugError | undefined;
  private launchConfigurations: DebugLaunchConfigurationEntry[] = [];
  private loadedSources: DebugLoadedSource[] = [];
  private readonly consoleEntries: DebugConsoleEntry[] = [];
  private readonly listeners: Array<(event: DebugEvent) => void> = [];

  constructor(private readonly options: DebugServiceOptions) {}

  hydrate(persistence: DebugPersistenceState): void {
    this.breakpoints.replaceAll(persistence.breakpoints);
    this.watches.replaceAll(persistence.watches);
    this.lastLaunchConfiguration = persistence.lastLaunchConfiguration;
    this.selectedLaunchConfigurationName = persistence.selectedLaunchConfigurationName ?? persistence.lastLaunchConfiguration?.name;
    this.emitState();
  }

  setLaunchConfigurations(configurations: DebugLaunchConfigurationEntry[]): void {
    this.launchConfigurations = configurations.map((entry) => ({ ...entry, configuration: { ...entry.configuration } }));
    if (!this.selectedLaunchConfigurationName || !this.launchConfigurations.some((entry) => entry.name === this.selectedLaunchConfigurationName)) {
      this.selectedLaunchConfigurationName =
        this.lastLaunchConfiguration?.name ??
        this.launchConfigurations.find((entry) => entry.default)?.name ??
        this.launchConfigurations[0]?.name;
    }
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
      launchConfigurations: this.launchConfigurations.map((entry) => ({ ...entry, configuration: { ...entry.configuration } })),
      selectedLaunchConfigurationName: this.selectedLaunchConfigurationName,
      breakpoints: this.breakpoints.list(),
      watches: this.watches.list(),
      variables: this.variables.list(),
      callStack: this.callStack.list(),
      activeThreadId: this.callStack.getActiveThreadId(),
      activeStackFrame: this.callStack.getActiveFrame(),
      loadedSources: [...this.loadedSources],
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

  async selectLaunchConfiguration(name: string): Promise<DebugState> {
    const configuration = this.launchConfigurations.find((entry) => entry.name === name)?.configuration;
    if (!configuration) {
      this.setError({
        code: "INVALID_CONFIGURATION",
        message: `Debug configuration "${name}" is not available.`,
        recoverable: false
      });
      return this.snapshot();
    }
    this.selectedLaunchConfigurationName = name;
    this.lastLaunchConfiguration = configuration;
    await this.persist();
    this.emitState();
    return this.snapshot();
  }

  async start(configuration: DebugLaunchConfiguration, effectiveConfiguration: DebugLaunchConfiguration = configuration): Promise<DebugState> {
    if (this.session) {
      await this.stop();
    }
    this.error = undefined;
    this.lastLaunchConfiguration = configuration;
    this.selectedLaunchConfigurationName = configuration.name;
    this.loadedSources = [];
    await this.persist();
    this.setState("Starting");

    try {
      const transport = await this.options.createAdapter(effectiveConfiguration);
      const session = new DebugSession(randomId("debug-session"), configuration.name, transport);
      this.session = session;
      this.sessionStartedAt = new Date().toISOString();
      session.onEvent((message) => this.handleAdapterEvent(message));
      await session.request("initialize", {
        adapterID: effectiveConfiguration.adapterId ?? effectiveConfiguration.type,
        pathFormat: "path",
        linesStartAt1: true,
        columnsStartAt1: true,
        supportsVariableType: true
      });
      await this.syncBreakpoints();
      await session.request(effectiveConfiguration.request, this.launchArguments(effectiveConfiguration), 15000);
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
    this.watches.clearValues();
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
    if (command !== "pause") {
      this.variables.clear();
      this.callStack.replaceThreads(this.callStack.list().map((thread) => ({ ...thread, stopped: false, frames: [] })));
    }
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
    await this.evaluateWatches();
    this.emitState();
    return this.snapshot();
  }

  async updateWatch(id: string, expression: string): Promise<DebugState> {
    this.watches.updateExpression(id, expression);
    await this.persist();
    await this.evaluateWatches();
    this.emitState();
    return this.snapshot();
  }

  async removeWatch(id: string): Promise<DebugState> {
    this.watches.remove(id);
    await this.persist();
    this.emitState();
    return this.snapshot();
  }

  async loadVariables(variablesReference: number): Promise<DebugState> {
    if (!this.session) return this.snapshot();
    const existingVariable = this.variables.findVariable(variablesReference);
    if (existingVariable?.expanded) {
      this.variables.collapseVariables(variablesReference);
      this.emitState();
      return this.snapshot();
    }
    const variables = await this.requestVariables(variablesReference);
    if (this.variables.scopeByReference(variablesReference)) {
      this.variables.replaceVariables(variablesReference, variables);
    } else {
      this.variables.setExpanded(variablesReference, variables);
    }
    this.emitState();
    return this.snapshot();
  }

  async evaluateExpression(expression: string, context: "repl" | "watch" | "hover" = "repl", frameId?: number): Promise<DebugState> {
    if (!this.session) {
      this.setError({ code: "IPC_FAILED", message: "No active debug session.", recoverable: true });
      return this.snapshot();
    }
    try {
      const body = await this.session.request("evaluate", {
        expression,
        context,
        frameId: frameId ?? this.callStack.getActiveFrame()?.id
      });
      const result = (body as { result?: unknown; type?: unknown } | undefined)?.result;
      this.addConsole("console", `${expression}\n${typeof result === "string" ? result : ""}`);
    } catch (error) {
      this.addConsole("error", error instanceof Error ? error.message : "Evaluation failed.");
    }
    this.emitState();
    return this.snapshot();
  }

  clearConsole(): DebugState {
    this.consoleEntries.length = 0;
    this.emitState();
    return this.snapshot();
  }

  selectStackFrame(threadId: number, frameId: number): DebugState {
    const frame = this.callStack.setActiveFrame(threadId, frameId);
    if (frame) {
      this.variables.clear();
      void this.refreshScopes(frame.id);
      this.emit({ type: "navigation", frame, state: this.snapshot() });
    }
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
    this.loadedSources = [];
    this.state = "Idle";
    this.error = undefined;
    this.emitState();
  }

  private handleAdapterEvent(message: DapProtocolMessage): void {
    if (message.event === "initialized") {
      void this.syncBreakpoints();
      void this.refreshLoadedSources();
    } else if (message.event === "stopped") {
      this.setState("Paused");
      const body = message.body as { threadId?: unknown; reason?: unknown } | undefined;
      const threadId = typeof body?.threadId === "number" ? body.threadId : 1;
      void this.refreshStoppedState(threadId);
    } else if (message.event === "continued") {
      this.variables.clear();
      this.setState("Running");
    } else if (message.event === "terminated" || message.event === "exited") {
      this.variables.clear();
      this.callStack.clear();
      this.setState("Terminated");
    } else if (message.event === "output") {
      const body = message.body as { category?: unknown; output?: unknown } | undefined;
      this.addConsole(
        body?.category === "stderr" ? "stderr" : body?.category === "stdout" ? "stdout" : body?.category === "telemetry" ? "telemetry" : "console",
        typeof body?.output === "string" ? body.output : ""
      );
    } else if (message.event === "breakpoint") {
      const body = message.body as { breakpoint?: { source?: { path?: unknown; name?: unknown }; line?: unknown; verified?: unknown; message?: unknown } } | undefined;
      const breakpoint = body?.breakpoint;
      const rawPath = typeof breakpoint?.source?.path === "string" ? breakpoint.source.path : undefined;
      this.breakpoints.updateAdapterBreakpoint({
        relativePath: rawPath ? this.toRelativePath(rawPath) : undefined,
        line: typeof breakpoint?.line === "number" ? breakpoint.line : undefined,
        verified: typeof breakpoint?.verified === "boolean" ? breakpoint.verified : undefined,
        message: typeof breakpoint?.message === "string" ? breakpoint.message : undefined
      });
      this.emitState();
    } else if (message.event === "loadedSource") {
      void this.refreshLoadedSources();
    }
  }

  private async syncBreakpoints(): Promise<void> {
    if (!this.session) return;
    const byPath = new Map<string, ReturnType<BreakpointManager["list"]>>();
    for (const breakpoint of this.breakpoints.list()) {
      byPath.set(breakpoint.relativePath, [...(byPath.get(breakpoint.relativePath) ?? []), breakpoint]);
    }
    for (const [relativePath, breakpoints] of byPath) {
      const enabledBreakpoints = breakpoints.filter((breakpoint) => breakpoint.enabled);
      const body = await this.session
        .request("setBreakpoints", {
          source: { path: this.sourcePath(relativePath) },
          breakpoints: enabledBreakpoints.map((breakpoint) => ({
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
            line: typeof breakpoint.line === "number" ? breakpoint.line : enabledBreakpoints[index]?.line ?? 1,
            verified: breakpoint.verified,
            message: breakpoint.message
          }))
        );
      }
    }
    this.emitState();
  }

  private async refreshStoppedState(threadId: number): Promise<void> {
    if (!this.session) return;
    await this.refreshThreads(threadId);
    const activeFrame = this.callStack.getActiveFrame();
    if (activeFrame) {
      await this.refreshScopes(activeFrame.id);
      await this.evaluateWatches(activeFrame.id);
      this.emit({ type: "navigation", frame: activeFrame, state: this.snapshot() });
    }
    this.emitState();
  }

  private async refreshThreads(stoppedThreadId: number): Promise<void> {
    if (!this.session) return;
    const threadsBody = await this.session.request("threads", {}, 5000).catch(() => ({ threads: [{ id: stoppedThreadId, name: `Thread ${stoppedThreadId}` }] }));
    const threads = ((threadsBody as { threads?: Array<{ id?: unknown; name?: unknown }> }).threads ?? [])
      .map((thread) => ({
        id: typeof thread.id === "number" ? thread.id : stoppedThreadId,
        name: typeof thread.name === "string" ? thread.name : `Thread ${stoppedThreadId}`,
        stopped: thread.id === stoppedThreadId,
        frames: []
      }));
    this.callStack.replaceThreads(threads);
    for (const thread of threads) {
      const stackBody = await this.session.request("stackTrace", { threadId: thread.id, startFrame: 0, levels: 50 }, 5000).catch(() => null);
      const frames = ((stackBody as { stackFrames?: unknown } | null)?.stackFrames ?? []) as Array<{
        id?: unknown;
        name?: unknown;
        source?: { path?: unknown; name?: unknown };
        line?: unknown;
        column?: unknown;
      }>;
      this.callStack.setFrames(
        thread.id,
        frames.map((frame, index): DebugStackFrame => ({
          id: typeof frame.id === "number" ? frame.id : index,
          name: typeof frame.name === "string" ? frame.name : `Frame ${index + 1}`,
          relativePath: typeof frame.source?.path === "string" ? this.toRelativePath(frame.source.path) : undefined,
          sourceName: typeof frame.source?.name === "string" ? frame.source.name : undefined,
          line: typeof frame.line === "number" ? frame.line : undefined,
          column: typeof frame.column === "number" ? frame.column : undefined
        })),
        thread.id === stoppedThreadId
      );
    }
  }

  private async refreshScopes(frameId: number): Promise<void> {
    if (!this.session) return;
    const scopesBody = await this.session.request("scopes", { frameId }, 5000).catch(() => null);
    const scopes = ((scopesBody as { scopes?: unknown } | null)?.scopes ?? []) as Array<{
      name?: unknown;
      variablesReference?: unknown;
      expensive?: unknown;
    }>;
    const hydratedScopes: DebugScope[] = [];
    for (const scope of scopes) {
      const variablesReference = typeof scope.variablesReference === "number" ? scope.variablesReference : 0;
      hydratedScopes.push({
        name: typeof scope.name === "string" ? scope.name : "Scope",
        variablesReference,
        expensive: scope.expensive === true,
        variables: variablesReference > 0 && scope.expensive !== true ? await this.requestVariables(variablesReference) : []
      });
    }
    this.variables.replaceScopes(hydratedScopes);
  }

  private async requestVariables(variablesReference: number): Promise<DebugVariable[]> {
    if (!this.session || variablesReference <= 0) return [];
    const body = await this.session.request("variables", { variablesReference }, 5000).catch(() => null);
    const variables = ((body as { variables?: unknown } | null)?.variables ?? []) as Array<{
      name?: unknown;
      value?: unknown;
      type?: unknown;
      variablesReference?: unknown;
      evaluateName?: unknown;
    }>;
    return variables.map((variable) => ({
      name: typeof variable.name === "string" ? variable.name : "",
      value: typeof variable.value === "string" ? variable.value : "",
      type: typeof variable.type === "string" ? variable.type : undefined,
      variablesReference: typeof variable.variablesReference === "number" ? variable.variablesReference : undefined,
      evaluateName: typeof variable.evaluateName === "string" ? variable.evaluateName : undefined
    }));
  }

  private async evaluateWatches(frameId = this.callStack.getActiveFrame()?.id): Promise<void> {
    if (!this.session) return;
    for (const watch of this.watches.list().filter((item) => item.enabled)) {
      try {
        const body = await this.session.request("evaluate", {
          expression: watch.expression,
          context: "watch",
          frameId
        }, 5000);
        const result = (body as { result?: unknown } | undefined)?.result;
        this.watches.setValue(watch.id, typeof result === "string" ? result : "");
      } catch (error) {
        this.watches.setValue(watch.id, undefined, error instanceof Error ? error.message : "Evaluation failed.");
      }
    }
  }

  private async refreshLoadedSources(): Promise<void> {
    if (!this.session) return;
    const body = await this.session.request("loadedSources", {}, 5000).catch(() => null);
    const sources = ((body as { sources?: unknown } | null)?.sources ?? []) as Array<{ name?: unknown; path?: unknown }>;
    this.loadedSources = sources.map((source) => ({
      name: typeof source.name === "string" ? source.name : undefined,
      relativePath: typeof source.path === "string" ? this.toRelativePath(source.path) : undefined
    }));
    this.emitState();
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

  private sourcePath(relativePath: string): string {
    return this.options.resolveSourcePath?.(relativePath) ?? relativePath;
  }

  private toRelativePath(sourcePath: string): string | undefined {
    return this.options.relativizeSourcePath?.(sourcePath) ?? sourcePath;
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
      lastLaunchConfiguration: this.lastLaunchConfiguration,
      selectedLaunchConfigurationName: this.selectedLaunchConfigurationName
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
