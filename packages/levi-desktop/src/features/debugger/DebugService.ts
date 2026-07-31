import { BreakpointManager } from "./BreakpointManager";
import { CallStackStore } from "./CallStackStore";
import { DebugSession, type DebugTransport } from "./DebugSession";
import { EvaluationCache } from "./EvaluationCache";
import { VariableStore } from "./VariableStore";
import { WatchStore } from "./WatchStore";
import { randomId } from "./ids";
import {
  formatCollectionPreview,
  MAX_INLINE_VALUES,
  MAX_VARIABLE_CHILDREN,
  MAX_VARIABLE_DEPTH,
  truncateValue
} from "./variableLimits";
import type {
  DapProtocolMessage,
  DebugCompletionItem,
  DebugConsoleEntry,
  DebugError,
  DebugEvent,
  DebugExceptionBreakpoint,
  DebugExceptionInfo,
  DebugInlineValue,
  DebugEvaluateResult,
  DebugLaunchConfigurationEntry,
  DebugLoadedSource,
  DebugLaunchConfiguration,
  DebugPersistenceState,
  DebugScope,
  DebugSessionState,
  DebugStackFrame,
  DebugState,
  DebugVariable,
  DebugCompoundConfigurationEntry
} from "./DebugEvents";
import { DEFAULT_EXCEPTION_BREAKPOINTS } from "./DebugEvents";
import { DebugSessionHost } from "./DebugSessionHost";
import { resolveConfigurationAdapterId } from "./adapters/registry";

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
  private exceptionBreakpoints: DebugExceptionBreakpoint[] = DEFAULT_EXCEPTION_BREAKPOINTS.map((item) => ({ ...item }));
  private exceptionInfo: DebugExceptionInfo | undefined;
  private inlineValues: DebugInlineValue[] = [];
  private lastEvaluation: DebugEvaluateResult | undefined;
  private readonly evaluationCache = new EvaluationCache();
  private evaluationGeneration = 0;
  private readonly consoleEntries: DebugConsoleEntry[] = [];
  private readonly listeners: Array<(event: DebugEvent) => void> = [];
  private readonly sessionHosts = new Map<string, DebugSessionHost>();
  private activeSessionId: string | null = null;
  private compoundConfigurations: DebugCompoundConfigurationEntry[] = [];

  constructor(private readonly options: DebugServiceOptions) {}

  hydrate(persistence: DebugPersistenceState): void {
    this.breakpoints.replaceAll(persistence.breakpoints);
    this.watches.replaceAll(persistence.watches);
    this.exceptionBreakpoints =
      persistence.exceptionBreakpoints?.map((item) => ({ ...item })) ?? DEFAULT_EXCEPTION_BREAKPOINTS.map((item) => ({ ...item }));
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

  setCompoundConfigurations(configurations: DebugCompoundConfigurationEntry[]): void {
    this.compoundConfigurations = configurations.map((entry) => ({ ...entry }));
    this.emitState();
  }

  getSessionHosts(): DebugSessionHost[] {
    return [...this.sessionHosts.values()];
  }

  selectSession(sessionId: string): DebugState {
    const host = this.sessionHosts.get(sessionId);
    if (!host) {
      this.setError({ code: "INVALID_CONFIGURATION", message: "Debug session was not found.", recoverable: true });
      return this.snapshot();
    }
    if (this.activeSessionId && this.activeSessionId !== sessionId) {
      this.syncActiveToHost(this.sessionHosts.get(this.activeSessionId)!);
    }
    this.activeSessionId = sessionId;
    this.syncActiveFromHost(host);
    this.emitState();
    return this.snapshot();
  }

  async stopAll(): Promise<DebugState> {
    for (const host of this.sessionHosts.values()) {
      await this.stopHost(host);
    }
    this.sessionHosts.clear();
    this.activeSessionId = null;
    this.session = null;
    this.sessionStartedAt = null;
    this.variables.clear();
    this.callStack.clear();
    this.consoleEntries.length = 0;
    this.loadedSources = [];
    this.exceptionInfo = undefined;
    this.inlineValues = [];
    this.setState(this.sessionHosts.size > 0 ? "Running" : "Idle");
    return this.snapshot();
  }

  snapshot(): DebugState {
    const activeHost = this.activeSessionId ? this.sessionHosts.get(this.activeSessionId) : undefined;
    return {
      state: this.state,
      session: this.session
        ? {
            id: this.session.id,
            name: this.session.name,
            type: this.lastLaunchConfiguration?.type ?? "debug",
            startedAt: this.sessionStartedAt ?? new Date().toISOString(),
            adapterId: this.lastLaunchConfiguration ? resolveConfigurationAdapterId(this.lastLaunchConfiguration) : undefined,
            state: activeHost?.state ?? this.state
          }
        : undefined,
      sessions: [...this.sessionHosts.values()].map((host) => host.toManagedSession(host.id === this.activeSessionId ? this.callStack.getActiveFrame() : undefined)),
      activeSessionId: this.activeSessionId ?? undefined,
      launchConfigurations: this.launchConfigurations.map((entry) => ({ ...entry, configuration: { ...entry.configuration } })),
      compoundConfigurations: this.compoundConfigurations.map((entry) => ({ ...entry })),
      selectedLaunchConfigurationName: this.selectedLaunchConfigurationName,
      breakpoints: this.breakpoints.list(),
      watches: this.watches.list(),
      variables: this.variables.list(),
      callStack: this.callStack.list(),
      activeThreadId: this.callStack.getActiveThreadId(),
      activeStackFrame: this.callStack.getActiveFrame(),
      loadedSources: [...this.loadedSources],
      console: [...this.consoleEntries],
      exceptionBreakpoints: this.exceptionBreakpoints.map((item) => ({ ...item })),
      exceptionInfo: this.exceptionInfo ? { ...this.exceptionInfo } : undefined,
      inlineValues: [...this.inlineValues],
      lastEvaluation: this.lastEvaluation ? { ...this.lastEvaluation } : undefined,
      evaluationCache: this.evaluationCache.list(),
      lastLaunchConfiguration: this.lastLaunchConfiguration,
      error: this.error,
      adapters: [],
      adapterRecommendations: []
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

  rememberLaunchConfiguration(configuration: DebugLaunchConfiguration): void {
    this.lastLaunchConfiguration = configuration;
    this.selectedLaunchConfigurationName = configuration.name;
  }

  async startCompound(configurations: DebugLaunchConfiguration[]): Promise<DebugState> {
    const failures: string[] = [];
    for (const configuration of configurations) {
      try {
        await this.start(configuration, configuration, { stopExisting: false });
      } catch (error) {
        failures.push(`${configuration.name}: ${error instanceof Error ? error.message : "Launch failed."}`);
      }
    }
    if (failures.length > 0) {
      this.setError({
        code: "LAUNCH_FAILED",
        message: `Some compound sessions failed to start:\n${failures.join("\n")}`,
        recoverable: true
      });
    }
    return this.snapshot();
  }

  async start(
    configuration: DebugLaunchConfiguration,
    effectiveConfiguration: DebugLaunchConfiguration = configuration,
    options?: { stopExisting?: boolean }
  ): Promise<DebugState> {
    if (options?.stopExisting !== false && this.session) {
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
      const adapterId = resolveConfigurationAdapterId(effectiveConfiguration);
      const host = new DebugSessionHost(configuration, adapterId);
      const session = new DebugSession(host.id, configuration.name, transport);
      host.bindSession(session, () => transport.dispose());
      this.sessionHosts.set(host.id, host);
      this.activeSessionId = host.id;
      this.session = session;
      this.sessionStartedAt = host.startedAt;
      host.state = "Starting";
      session.onEvent((message) => this.handleAdapterEvent(message));
      await session.request("initialize", {
        adapterID: effectiveConfiguration.adapterId ?? effectiveConfiguration.type,
        pathFormat: "path",
        linesStartAt1: true,
        columnsStartAt1: true,
        supportsVariableType: true,
        supportsVariablePaging: true
      });
      await this.syncBreakpoints();
      await this.syncExceptionBreakpoints();
      await session.request(effectiveConfiguration.request, this.launchArguments(effectiveConfiguration), 15000);
      await session.request("configurationDone", {}, 10000).catch(() => undefined);
      host.state = "Running";
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
    const activeHost = this.activeSessionId ? this.sessionHosts.get(this.activeSessionId) : undefined;
    await this.session.request("disconnect", { terminateDebuggee: true }, 5000).catch(() => undefined);
    this.session.dispose();
    if (activeHost) {
      this.sessionHosts.delete(activeHost.id);
      activeHost.dispose();
    }
    this.session = null;
    this.sessionStartedAt = null;
    this.activeSessionId = this.sessionHosts.size > 0 ? [...this.sessionHosts.keys()][0] : null;
    if (this.activeSessionId) {
      this.syncActiveFromHost(this.sessionHosts.get(this.activeSessionId)!);
    } else {
      this.variables.clear();
      this.callStack.clear();
      this.watches.clearValues();
      this.exceptionInfo = undefined;
      this.inlineValues = [];
      this.lastEvaluation = undefined;
      this.evaluationCache.clear();
      this.consoleEntries.length = 0;
      this.loadedSources = [];
    }
    this.setState(this.sessionHosts.size > 0 ? "Running" : "Idle");
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
    if (command === "continue") {
      this.exceptionInfo = undefined;
      this.inlineValues = [];
      this.setState("Running");
    }
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

  async loadVariables(variablesReference: number, depth = 0): Promise<DebugState> {
    if (!this.session) return this.snapshot();
    if (depth >= MAX_VARIABLE_DEPTH) {
      this.emitState();
      return this.snapshot();
    }
    const existingVariable = this.variables.findVariable(variablesReference);
    if (existingVariable?.expanded) {
      this.variables.collapseVariables(variablesReference);
      this.emitState();
      return this.snapshot();
    }
    const variables = await this.requestVariables(variablesReference, depth + 1);
    if (this.variables.scopeByReference(variablesReference)) {
      this.variables.replaceVariables(variablesReference, variables);
    } else {
      this.variables.setExpanded(variablesReference, variables);
    }
    this.emitState();
    return this.snapshot();
  }

  async evaluateExpression(
    expression: string,
    context: "repl" | "watch" | "hover" = "repl",
    frameId?: number
  ): Promise<DebugState> {
    const generation = ++this.evaluationGeneration;
    const activeFrameId = frameId ?? this.callStack.getActiveFrame()?.id;
    const cacheKey = this.evaluationCache.makeKey(expression, context, activeFrameId);
    const cached = this.evaluationCache.get(cacheKey);
    if (cached) {
      this.lastEvaluation = { ...cached, cached: true };
      if (context === "repl") {
        this.addConsole("console", `${expression}\n${cached.result}`);
      }
      this.emit({ type: "evaluation", result: this.lastEvaluation, state: this.snapshot() });
      this.emitState();
      return this.snapshot();
    }

    if (!this.session) {
      this.setError({ code: "IPC_FAILED", message: "No active debug session.", recoverable: true });
      return this.snapshot();
    }

    try {
      const body = await this.session.request("evaluate", {
        expression,
        context,
        frameId: activeFrameId
      });
      if (generation !== this.evaluationGeneration) {
        return this.snapshot();
      }
      const payload = body as {
        result?: unknown;
        type?: unknown;
        variablesReference?: unknown;
        namedVariables?: unknown;
        indexedVariables?: unknown;
        memoryReference?: unknown;
      } | undefined;
      const resultText = typeof payload?.result === "string" ? payload.result : "";
      const type = typeof payload?.type === "string" ? payload.type : undefined;
      const variablesReference = typeof payload?.variablesReference === "number" ? payload.variablesReference : undefined;
      const namedVariables = typeof payload?.namedVariables === "number" ? payload.namedVariables : undefined;
      const indexedVariables = typeof payload?.indexedVariables === "number" ? payload.indexedVariables : undefined;
      const memoryReference = typeof payload?.memoryReference === "string" ? payload.memoryReference : undefined;
      const formattedResult = formatCollectionPreview(type, truncateValue(resultText), namedVariables, indexedVariables);
      const evaluation: DebugEvaluateResult = {
        expression,
        result: formattedResult,
        type,
        variablesReference,
        namedVariables,
        indexedVariables,
        memoryReference
      };
      this.lastEvaluation = evaluation;
      this.evaluationCache.set(cacheKey, expression, context, activeFrameId, evaluation);
      if (context === "repl") {
        this.addConsole("console", `${expression}\n${formattedResult}${type ? ` (${type})` : ""}`);
      }
      this.emit({ type: "evaluation", result: evaluation, state: this.snapshot() });
    } catch (error) {
      if (generation !== this.evaluationGeneration) {
        return this.snapshot();
      }
      const message = error instanceof Error ? error.message : "Evaluation failed.";
      this.lastEvaluation = { expression, result: "", error: message };
      if (context === "repl") {
        this.addConsole("error", message);
      }
      this.emit({ type: "evaluation", result: this.lastEvaluation, state: this.snapshot() });
    }
    this.emitState();
    return this.snapshot();
  }

  async setExceptionBreakpoints(breakpoints: DebugExceptionBreakpoint[]): Promise<DebugState> {
    this.exceptionBreakpoints = breakpoints.map((item) => ({ ...item }));
    await this.persist();
    await this.syncExceptionBreakpoints();
    this.emitState();
    return this.snapshot();
  }

  async refreshLoadedSources(): Promise<DebugState> {
    await this.refreshLoadedSourcesInternal();
    this.emitState();
    return this.snapshot();
  }

  async getCompletions(text: string, column: number, frameId?: number): Promise<DebugCompletionItem[]> {
    if (!this.session) return [];
    try {
      const body = await this.session.request("completions", {
        frameId: frameId ?? this.callStack.getActiveFrame()?.id,
        text,
        column
      }, 3000);
      const targets = ((body as { targets?: unknown } | undefined)?.targets ?? []) as Array<{
        label?: unknown;
        detail?: unknown;
        text?: unknown;
      }>;
      return targets.slice(0, 50).map((target) => ({
        label: typeof target.label === "string" ? target.label : "",
        detail: typeof target.detail === "string" ? target.detail : undefined,
        insertText: typeof target.text === "string" ? target.text : undefined
      })).filter((item) => item.label.length > 0);
    } catch {
      return [];
    }
  }

  cancelEvaluations(): void {
    this.evaluationGeneration += 1;
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
    this.exceptionInfo = undefined;
    this.inlineValues = [];
    this.lastEvaluation = undefined;
    this.evaluationCache.clear();
    this.state = "Idle";
    this.error = undefined;
    this.emitState();
  }

  private handleAdapterEvent(message: DapProtocolMessage): void {
    if (message.event === "initialized") {
      void this.syncBreakpoints();
      void this.refreshLoadedSourcesInternal();
    } else if (message.event === "stopped") {
      this.setState("Paused");
      const body = message.body as {
        threadId?: unknown;
        reason?: unknown;
        text?: unknown;
        description?: unknown;
        allThreadsStopped?: unknown;
      } | undefined;
      const threadId = typeof body?.threadId === "number" ? body.threadId : 1;
      const reason = typeof body?.reason === "string" ? body.reason : undefined;
      if (reason === "exception") {
        this.exceptionInfo = this.parseExceptionInfo(body ?? {}, threadId);
      } else {
        this.exceptionInfo = undefined;
      }
      void this.refreshStoppedState(threadId);
    } else if (message.event === "continued") {
      this.variables.clear();
      this.exceptionInfo = undefined;
      this.inlineValues = [];
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
      void this.refreshLoadedSourcesInternal().then(() => this.emitState());
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
      this.refreshInlineValues();
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
        variables: variablesReference > 0 && scope.expensive !== true ? await this.requestVariables(variablesReference, 1) : []
      });
    }
    this.variables.replaceScopes(hydratedScopes);
  }

  private async requestVariables(variablesReference: number, depth = 1): Promise<DebugVariable[]> {
    if (!this.session || variablesReference <= 0 || depth > MAX_VARIABLE_DEPTH) return [];
    const body = await this.session.request("variables", { variablesReference, count: MAX_VARIABLE_CHILDREN }, 5000).catch(() => null);
    const variables = ((body as { variables?: unknown } | null)?.variables ?? []) as Array<{
      name?: unknown;
      value?: unknown;
      type?: unknown;
      variablesReference?: unknown;
      evaluateName?: unknown;
      namedVariables?: unknown;
      indexedVariables?: unknown;
      memoryReference?: unknown;
    }>;
    const hasMore = variables.length >= MAX_VARIABLE_CHILDREN;
    return variables.slice(0, MAX_VARIABLE_CHILDREN).map((variable) => {
      const type = typeof variable.type === "string" ? variable.type : undefined;
      const rawValue = typeof variable.value === "string" ? variable.value : "";
      const namedVariables = typeof variable.namedVariables === "number" ? variable.namedVariables : undefined;
      const indexedVariables = typeof variable.indexedVariables === "number" ? variable.indexedVariables : undefined;
      const truncated = rawValue.length > MAX_VARIABLE_DEPTH * 512;
      const value = formatCollectionPreview(type, truncateValue(rawValue), namedVariables, indexedVariables);
      return {
        name: typeof variable.name === "string" ? variable.name : "",
        value,
        type,
        variablesReference: typeof variable.variablesReference === "number" ? variable.variablesReference : undefined,
        evaluateName: typeof variable.evaluateName === "string" ? variable.evaluateName : undefined,
        namedVariables,
        indexedVariables,
        memoryReference: typeof variable.memoryReference === "string" ? variable.memoryReference : undefined,
        truncated,
        hasMoreChildren: hasMore
      };
    });
  }

  private refreshInlineValues(): void {
    const values: DebugInlineValue[] = [];
    const seen = new Set<string>();
    for (const scope of this.variables.list()) {
      for (const variable of flattenVariables(scope.variables)) {
        if (seen.has(variable.name) || values.length >= MAX_INLINE_VALUES) continue;
        seen.add(variable.name);
        values.push({ name: variable.name, value: variable.value });
      }
    }
    this.inlineValues = values;
  }

  private parseExceptionInfo(body: Record<string, unknown>, threadId: number): DebugExceptionInfo {
    const description = typeof body.description === "string" ? body.description : undefined;
    const text = typeof body.text === "string" ? body.text : undefined;
    const activeFrame = this.callStack.getActiveFrame();
    return {
      type: description ?? text?.split(":")[0]?.trim(),
      message: text ?? description,
      description,
      stackTrace: text,
      threadId,
      relativePath: activeFrame?.relativePath,
      line: activeFrame?.line,
      module: activeFrame?.sourceName
    };
  }

  private async syncExceptionBreakpoints(): Promise<void> {
    if (!this.session) return;
    const enabled = this.exceptionBreakpoints.filter((item) => item.enabled);
    if (enabled.length === 0) return;
    await this.session
      .request("setExceptionBreakpoints", {
        filters: enabled.map((item) => item.filter),
        exceptionOptions: enabled.map((item) => ({
          path: [{ names: ["*"] }],
          breakMode: "always" as const
        }))
      })
      .catch(() => undefined);
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

  private async refreshLoadedSourcesInternal(): Promise<void> {
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
      module: configuration.module,
      cwd: configuration.cwd,
      args: configuration.args,
      env: configuration.env,
      stopOnEntry: configuration.stopOnEntry,
      console: configuration.console,
      internalConsoleOptions: configuration.internalConsoleOptions,
      runtimeArgs: configuration.runtimeArgs,
      runtimeExecutable: configuration.runtimeExecutable,
      runtimeVersion: configuration.runtimeVersion,
      sourceMaps: configuration.sourceMaps,
      outFiles: configuration.outFiles,
      skipFiles: configuration.skipFiles,
      justMyCode: configuration.justMyCode,
      port: configuration.port,
      host: configuration.host,
      url: configuration.url,
      webRoot: configuration.webRoot,
      python: configuration.python,
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
      exceptionBreakpoints: this.exceptionBreakpoints.map((item) => ({ ...item })),
      lastLaunchConfiguration: this.lastLaunchConfiguration,
      selectedLaunchConfigurationName: this.selectedLaunchConfigurationName
    });
  }

  private async stopHost(host: DebugSessionHost): Promise<void> {
    if (host.dapSession) {
      await host.dapSession.request("disconnect", { terminateDebuggee: true }, 5000).catch(() => undefined);
    }
    host.dispose();
  }

  private syncActiveToHost(host: DebugSessionHost): void {
    host.variables.replaceScopes(this.variables.list());
    host.callStack.replaceThreads(this.callStack.list());
    host.consoleEntries.splice(0, host.consoleEntries.length, ...this.consoleEntries);
    host.loadedSources = [...this.loadedSources];
    host.exceptionInfo = this.exceptionInfo ? { ...this.exceptionInfo } : undefined;
    host.inlineValues = [...this.inlineValues];
    host.state = this.state;
  }

  private syncActiveFromHost(host: DebugSessionHost): void {
    this.session = host.dapSession;
    this.sessionStartedAt = host.startedAt;
    this.lastLaunchConfiguration = host.configuration;
    this.selectedLaunchConfigurationName = host.configuration.name;
    this.variables.replaceScopes(host.variables.list());
    this.callStack.replaceThreads(host.callStack.list());
    this.consoleEntries.splice(0, this.consoleEntries.length, ...host.consoleEntries);
    this.loadedSources = [...host.loadedSources];
    this.exceptionInfo = host.exceptionInfo ? { ...host.exceptionInfo } : undefined;
    this.inlineValues = [...host.inlineValues];
    this.state = host.state;
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

function flattenVariables(variables: DebugVariable[]): DebugVariable[] {
  const result: DebugVariable[] = [];
  for (const variable of variables) {
    result.push(variable);
    if (variable.children?.length) {
      result.push(...flattenVariables(variable.children));
    }
  }
  return result;
}
