import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { DebugService as CoreDebugService } from "../../src/features/debugger/DebugService";
import type { DebugTransport } from "../../src/features/debugger/DebugSession";
import type {
  DebugEvent,
  DebugEvaluateRequest,
  DebugLaunchConfigurationEntry,
  DebugLaunchConfiguration,
  DebugLoadVariablesRequest,
  DebugPersistenceState,
  DebugRemoveBreakpointRequest,
  DebugSetBreakpointRequest,
  DebugSetExceptionBreakpointsRequest,
  DebugStartRequest,
  DebugState,
  DebugUpdateWatchRequest,
  DebugCompletionRequest,
  DebugCompletionItem,
  DebugExceptionBreakpoint,
  DebugExceptionBreakpointFilter
} from "../../src/features/debugger/DebugEvents";
import { DEFAULT_EXCEPTION_BREAKPOINTS } from "../../src/features/debugger/DebugEvents";
import {
  validateCustomAdapterDefinition,
  type DebugAdapterInstallRequest,
  type DebugAdapterRegisterCustomRequest,
  type DebugAdapterUninstallRequest
} from "./adapters";
import type { DebugLaunchAdapterDiagnostic, DebugAdapterInstallProgress } from "../../src/features/debugger/DebugEvents";
import { AdapterManager } from "./adapter-manager";
import { loadEnvFile, mergeLaunchEnvironment } from "./env-file";
import { buildDapLaunchArguments } from "./launch-args";
import {
  findCompound,
  findLaunchConfiguration,
  parseCompoundConfigurations,
  runDebugTaskBoundary,
  validateCompoundStart
} from "./debug-tasks";
import { buildPythonAdapterEnvironment, discoverBrowserExecutable, resolvePythonInterpreter } from "./python-interpreter";
import { runAdapterDiagnostics } from "./adapter-diagnostics";
import type { DebugCompoundConfiguration, DebugCompoundConfigurationEntry } from "../../src/features/debugger/DebugEvents";

const DEBUG_STATE_FILE = path.join(".levi", "debug-state.json");
const LEVI_LAUNCH_FILE = path.join(".levi", "launch.json");
const VSCODE_LAUNCH_FILE = path.join(".vscode", "launch.json");
const MAX_STRING_LENGTH = 4000;
const MAX_ARGS = 64;

type WorkspaceProvider = () => string | null;

type AdapterConfig = {
  command: string;
  args: string[];
  env?: Record<string, string>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

const DEFAULT_LAUNCH_CONFIGURATIONS: DebugLaunchConfiguration[] = [
  {
    type: "node",
    request: "launch",
    name: "Node Launch",
    adapterId: "node",
    program: "${workspaceFolder}/src/index.js",
    console: "internalConsole"
  },
  {
    type: "node",
    request: "attach",
    name: "Node Attach",
    adapterId: "node",
    dap: { port: 9229 }
  },
  {
    type: "python",
    request: "launch",
    name: "Python Launch",
    adapterId: "python",
    program: "${workspaceFolder}/main.py",
    console: "internalConsole"
  },
  {
    type: "chrome",
    request: "launch",
    name: "Chrome Launch",
    adapterId: "chrome",
    url: "http://localhost:3000",
    webRoot: "${workspaceFolder}",
    console: "internalConsole"
  },
  {
    type: "chrome",
    request: "attach",
    name: "Chrome Attach",
    adapterId: "chrome",
    port: 9222,
    webRoot: "${workspaceFolder}"
  }
];

function assertSafeRelativePath(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500 || value.includes("\0")) {
    throw new Error(`${fieldName} must be a workspace-relative path.`);
  }
  const normalized = normalizeSlashes(value.trim());
  if (path.isAbsolute(normalized) || normalized.startsWith("../") || normalized === ".." || normalized.includes("/../")) {
    throw new Error(`${fieldName} must stay inside the workspace.`);
  }
  return normalized;
}

function assertSmallString(value: unknown, fieldName: string, required = false): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_STRING_LENGTH || value.includes("\0")) {
    throw new Error(`${fieldName} is invalid.`);
  }
  return value;
}

function assertStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_ARGS) {
    throw new Error(`${fieldName} must be a bounded string array.`);
  }
  return value.map((item) => assertSmallString(item, fieldName, true) as string);
}

function sanitizeDapArguments(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    throw new Error("DAP arguments must be an object.");
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 80)) {
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(key)) {
      throw new Error("DAP argument keys must be simple identifiers.");
    }
    if (typeof item === "string") {
      sanitized[key] = assertSmallString(item, `dap.${key}`);
    } else if (typeof item === "number" || typeof item === "boolean" || item === null) {
      sanitized[key] = item;
    } else if (Array.isArray(item)) {
      sanitized[key] = assertStringArray(item, `dap.${key}`);
    }
  }
  return sanitized;
}

function sanitizeEnvironment(value: unknown): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    throw new Error("Environment must be an object.");
  }
  const entries = Object.entries(value).slice(0, 80).map(([key, item]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,80}$/.test(key) || typeof item !== "string" || item.length > 1000) {
      throw new Error("Environment contains an invalid entry.");
    }
    return [key, item] as const;
  });
  return Object.fromEntries(entries);
}

export function validateDebugStartRequest(value: unknown): DebugStartRequest {
  if (!isPlainObject(value)) {
    throw new Error("Debug start request is invalid.");
  }
  const configurationName = assertSmallString(value.configurationName, "configurationName");
  if (configurationName && value.configuration === undefined) {
    return { configurationName };
  }
  if (!isPlainObject(value.configuration)) {
    throw new Error("Debug start request is invalid.");
  }
  const configuration = value.configuration;
  const type = assertSmallString(configuration.type, "type", true) as string;
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(type)) {
    throw new Error("Debug type is invalid.");
  }
  const request = configuration.request;
  if (request !== "launch" && request !== "attach") {
    throw new Error("Debug request must be launch or attach.");
  }
  const program = configuration.program === undefined ? undefined : assertSafeRelativePath(configuration.program, "program");
  const cwd = configuration.cwd === undefined ? undefined : assertSafeRelativePath(configuration.cwd, "cwd");
  const envFile = configuration.envFile === undefined ? undefined : assertSafeRelativePath(configuration.envFile, "envFile");
  const moduleName = assertSmallString(configuration.module, "module");
  const url = assertSmallString(configuration.url, "url");
  const webRoot = configuration.webRoot === undefined ? undefined : assertSafeRelativePath(configuration.webRoot, "webRoot");
  const port = configuration.port === undefined ? undefined : Number(configuration.port);
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error("port must be between 1 and 65535.");
  }
  const host = assertSmallString(configuration.host, "host");
  return {
    configurationName,
    configuration: {
      type,
      request,
      name: assertSmallString(configuration.name, "name", true) as string,
      adapterId: assertSmallString(configuration.adapterId, "adapterId"),
      program,
      module: moduleName,
      cwd,
      envFile,
      args: assertStringArray(configuration.args, "args"),
      env: sanitizeEnvironment(configuration.env),
      stopOnEntry: typeof configuration.stopOnEntry === "boolean" ? configuration.stopOnEntry : undefined,
      console:
        configuration.console === "internalConsole" || configuration.console === "integratedTerminal"
          ? configuration.console
          : undefined,
      internalConsoleOptions:
        configuration.internalConsoleOptions === "neverOpen" ||
        configuration.internalConsoleOptions === "openOnSessionStart" ||
        configuration.internalConsoleOptions === "openOnFirstSessionStart"
          ? configuration.internalConsoleOptions
          : undefined,
      runtimeArgs: assertStringArray(configuration.runtimeArgs, "runtimeArgs"),
      runtimeExecutable: assertSmallString(configuration.runtimeExecutable, "runtimeExecutable"),
      runtimeVersion: assertSmallString(configuration.runtimeVersion, "runtimeVersion"),
      sourceMaps: typeof configuration.sourceMaps === "boolean" ? configuration.sourceMaps : undefined,
      outFiles: assertStringArray(configuration.outFiles, "outFiles"),
      skipFiles: assertStringArray(configuration.skipFiles, "skipFiles"),
      justMyCode: typeof configuration.justMyCode === "boolean" ? configuration.justMyCode : undefined,
      port,
      host,
      url,
      webRoot,
      browserExecutablePath: assertSmallString(configuration.browserExecutablePath, "browserExecutablePath"),
      python: assertSmallString(configuration.python, "python"),
      preLaunchTask: assertSmallString(configuration.preLaunchTask, "preLaunchTask"),
      postDebugTask: assertSmallString(configuration.postDebugTask, "postDebugTask"),
      dap: sanitizeDapArguments(configuration.dap)
    }
  };
}

function validateDebugUpdateWatchRequest(value: unknown): DebugUpdateWatchRequest {
  if (!isPlainObject(value)) throw new Error("Watch update request is invalid.");
  return {
    id: assertSmallString(value.id, "watch id", true) as string,
    expression: assertSmallString(value.expression, "watch expression", true) as string
  };
}

function validateDebugEvaluateRequest(value: unknown): DebugEvaluateRequest {
  if (!isPlainObject(value)) throw new Error("Evaluate request is invalid.");
  const context = value.context === "watch" || value.context === "hover" ? value.context : "repl";
  const frameId = value.frameId === undefined ? undefined : Number(value.frameId);
  if (frameId !== undefined && (!Number.isInteger(frameId) || frameId < 0)) {
    throw new Error("Frame id is invalid.");
  }
  return {
    expression: assertSmallString(value.expression, "expression", true) as string,
    context,
    frameId
  };
}

function validateDebugCompletionRequest(value: unknown): DebugCompletionRequest {
  if (!isPlainObject(value)) throw new Error("Completion request is invalid.");
  const column = Number(value.column);
  if (!Number.isInteger(column) || column < 0 || column > 100000) {
    throw new Error("Completion column is invalid.");
  }
  const frameId = value.frameId === undefined ? undefined : Number(value.frameId);
  if (frameId !== undefined && (!Number.isInteger(frameId) || frameId < 0)) {
    throw new Error("Frame id is invalid.");
  }
  return {
    text: assertSmallString(value.text, "text", true) as string,
    column,
    frameId
  };
}

function validateDebugSetExceptionBreakpointsRequest(value: unknown): DebugSetExceptionBreakpointsRequest {
  if (!isPlainObject(value)) throw new Error("Exception breakpoint request is invalid.");
  if (!Array.isArray(value.breakpoints) || value.breakpoints.length > 8) {
    throw new Error("Exception breakpoints are invalid.");
  }
  const allowed = new Set(["all", "uncaught", "userUnhandled"]);
  const breakpoints = value.breakpoints.map((item) => {
    if (!isPlainObject(item)) throw new Error("Exception breakpoint entry is invalid.");
    const filter = item.filter;
    if (filter !== "all" && filter !== "uncaught" && filter !== "userUnhandled") {
      throw new Error("Exception breakpoint filter is invalid.");
    }
    if (!allowed.has(filter)) throw new Error("Exception breakpoint filter is invalid.");
    return {
      filter: filter as DebugExceptionBreakpointFilter,
      enabled: item.enabled === true,
      label: assertSmallString(item.label, "label", true) as string
    };
  });
  return { breakpoints };
}

function validateLoadVariablesRequest(value: unknown): DebugLoadVariablesRequest {
  if (!isPlainObject(value)) throw new Error("Variable load request is invalid.");
  const variablesReference = Number(value.variablesReference);
  if (!Number.isInteger(variablesReference) || variablesReference < 1) {
    throw new Error("Variables reference is invalid.");
  }
  return { variablesReference };
}

export function validateDebugSetBreakpointRequest(value: unknown): DebugSetBreakpointRequest {
  if (!isPlainObject(value)) {
    throw new Error("Breakpoint request is invalid.");
  }
  const line = Number(value.line);
  const column = value.column === undefined ? undefined : Number(value.column);
  if (!Number.isInteger(line) || line < 1 || line > 1000000) {
    throw new Error("Breakpoint line is invalid.");
  }
  if (column !== undefined && (!Number.isInteger(column) || column < 1 || column > 100000)) {
    throw new Error("Breakpoint column is invalid.");
  }
  return {
    relativePath: assertSafeRelativePath(value.relativePath, "relativePath"),
    line,
    column,
    enabled: typeof value.enabled === "boolean" ? value.enabled : undefined,
    condition: assertSmallString(value.condition, "condition"),
    logMessage: assertSmallString(value.logMessage, "logMessage"),
    hitCondition: assertSmallString(value.hitCondition, "hitCondition"),
    toggle: value.toggle === true
  };
}

export function validateDebugRemoveBreakpointRequest(value: unknown): DebugRemoveBreakpointRequest {
  if (!isPlainObject(value)) {
    throw new Error("Remove breakpoint request is invalid.");
  }
  const breakpointId = assertSmallString(value.breakpointId, "breakpointId");
  const relativePath = value.relativePath === undefined ? undefined : assertSafeRelativePath(value.relativePath, "relativePath");
  const line = value.line === undefined ? undefined : Number(value.line);
  if (line !== undefined && (!Number.isInteger(line) || line < 1 || line > 1000000)) {
    throw new Error("Breakpoint line is invalid.");
  }
  if (!breakpointId && (!relativePath || line === undefined)) {
    throw new Error("Remove breakpoint requires an id or path and line.");
  }
  return { breakpointId, relativePath, line };
}

function emptyPersistence(): DebugPersistenceState {
  return {
    breakpoints: [],
    watches: [],
    exceptionBreakpoints: DEFAULT_EXCEPTION_BREAKPOINTS.map((item) => ({ ...item }))
  };
}

function coercePersistence(value: unknown): DebugPersistenceState {
  if (!isPlainObject(value)) return emptyPersistence();
  const exceptionBreakpoints = Array.isArray(value.exceptionBreakpoints)
    ? (value.exceptionBreakpoints as DebugExceptionBreakpoint[])
        .filter((item) => item && typeof item.filter === "string" && typeof item.enabled === "boolean")
        .slice(0, 8)
    : DEFAULT_EXCEPTION_BREAKPOINTS.map((item) => ({ ...item }));
  return {
    breakpoints: Array.isArray(value.breakpoints) ? (value.breakpoints as DebugPersistenceState["breakpoints"]) : [],
    watches: Array.isArray(value.watches) ? (value.watches as DebugPersistenceState["watches"]) : [],
    exceptionBreakpoints,
    lastLaunchConfiguration: isPlainObject(value.lastLaunchConfiguration)
      ? validateDebugStartRequest({ configuration: value.lastLaunchConfiguration }).configuration
      : undefined,
    selectedLaunchConfigurationName: assertSmallString(value.selectedLaunchConfigurationName, "selectedLaunchConfigurationName")
  };
}

function stripJsonComments(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function launchFilePayload(configurations = DEFAULT_LAUNCH_CONFIGURATIONS): string {
  return JSON.stringify({ version: "0.2.0", configurations }, null, 2);
}

function substituteWorkspaceFolder(value: Record<string, unknown> | undefined, root: string): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const substitute = (item: unknown): unknown => {
    if (typeof item === "string") return item.replace(/\$\{workspaceFolder\}/g, root);
    if (Array.isArray(item)) return item.map(substitute);
    if (isPlainObject(item)) return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, substitute(child)]));
    return item;
  };
  return substitute(value) as Record<string, unknown>;
}

function validateDebugAdapterInstallRequest(value: unknown): DebugAdapterInstallRequest {
  if (!isPlainObject(value)) throw new Error("Adapter install request is invalid.");
  if (value.confirmed !== true) throw new Error("Adapter install requires confirmation.");
  return {
    adapterId: assertSmallString(value.adapterId, "adapterId", true) as string,
    optionId: assertSmallString(value.optionId, "optionId", true) as string,
    confirmed: true
  };
}

function validateDebugAdapterUninstallRequest(value: unknown): DebugAdapterUninstallRequest {
  if (!isPlainObject(value)) throw new Error("Adapter uninstall request is invalid.");
  if (value.confirmed !== true) throw new Error("Adapter uninstall requires confirmation.");
  return {
    adapterId: assertSmallString(value.adapterId, "adapterId", true) as string,
    confirmed: true
  };
}

function validateDebugAdapterRegisterCustomRequest(value: unknown): DebugAdapterRegisterCustomRequest {
  if (!isPlainObject(value)) throw new Error("Custom adapter registration request is invalid.");
  if (value.confirmed !== true) throw new Error("Custom adapter registration requires trust confirmation.");
  if (!isPlainObject(value.adapter)) throw new Error("Custom adapter payload is invalid.");
  return {
    adapter: validateCustomAdapterDefinition(value.adapter),
    confirmed: true
  };
}

export class DesktopDebugService {
  private workspaceRoot: string | null = null;
  private adapterProcess: ChildProcessWithoutNullStreams | null = null;
  private readonly adapterProcesses = new Map<string, ChildProcessWithoutNullStreams>();
  private readonly service: CoreDebugService;
  private lastLaunchDiagnostic: DebugLaunchAdapterDiagnostic | undefined;
  private lastInstallProgress: DebugAdapterInstallProgress | undefined;
  private compoundConfigurations: DebugCompoundConfiguration[] = [];
  private adapterListeners: Array<(event: DebugEvent) => void> = [];

  constructor(
    private readonly getWorkspaceRoot: WorkspaceProvider,
    private readonly adapterManager: AdapterManager
  ) {
    this.service = new CoreDebugService({
      createAdapter: (configuration) => this.createAdapter(configuration),
      resolveSourcePath: (relativePath) => this.resolveSourcePath(relativePath),
      relativizeSourcePath: (sourcePath) => this.relativeSourcePath(sourcePath),
      onDidChangePersistence: (state) => this.persist(state)
    });
    this.adapterManager.onProgress((progress) => {
      this.lastInstallProgress = progress;
      this.emitAdapterEvent({ type: "adapter-progress", progress, state: this.service.snapshot() as DebugState });
    });
  }

  async initializeAdapters(): Promise<void> {
    await this.adapterManager.initialize();
  }

  onEvent(listener: (event: DebugEvent) => void): () => void {
    this.adapterListeners.push(listener);
    const unsubscribe = this.service.onEvent(listener);
    return () => {
      unsubscribe();
      this.adapterListeners = this.adapterListeners.filter((item) => item !== listener);
    };
  }

  private emitAdapterEvent(event: DebugEvent): void {
    void this.enrichedState().then((state) => {
      const enriched = { ...event, state } as DebugEvent;
      for (const listener of this.adapterListeners) listener(enriched);
    });
  }

  private async enrichedState(): Promise<DebugState> {
    const snapshot = this.service.snapshot();
    return {
      ...snapshot,
      adapters: this.adapterManager.getStatuses(),
      adapterRecommendations: this.adapterManager.getRecommendations(),
      launchAdapterDiagnostic: this.lastLaunchDiagnostic,
      adapterInstallProgress: this.lastInstallProgress,
      adapterDiagnostics: this.adapterManager.getDiagnostics(),
      compoundConfigurations: this.compoundConfigurations.map((entry) => ({ ...entry, source: ".levi/launch.json" as const }))
    };
  }

  private async prepareLaunchConfiguration(configuration: DebugLaunchConfiguration, root: string): Promise<DebugLaunchConfiguration> {
    const preLaunch = runDebugTaskBoundary(configuration.preLaunchTask, "preLaunch");
    if (!preLaunch.supported || !preLaunch.success) {
      throw new Error(preLaunch.message ?? "preLaunchTask is not supported.");
    }
    let env = configuration.env;
    if (configuration.envFile) {
      const envFileValues = await loadEnvFile(root, configuration.envFile, (target) => fs.readFile(target, "utf8"));
      env = mergeLaunchEnvironment(process.env, envFileValues, configuration.env);
    }
    const resolvedPaths = this.resolveWorkspacePaths({ ...configuration, env }, root);
    const adapterId = configuration.adapterId ?? configuration.type;
    const browserExecutable =
      adapterId === "chrome" || configuration.type.includes("chrome") || configuration.type === "msedge"
        ? await discoverBrowserExecutable(resolvedPaths, async (target) => {
            try {
              await fs.access(target);
              return true;
            } catch {
              return false;
            }
          })
        : undefined;
    const pythonInterpreter =
      configuration.type === "python" || configuration.adapterId === "python"
        ? await resolvePythonInterpreter(root, resolvedPaths, async (target) => {
            try {
              await fs.access(target);
              return true;
            } catch {
              return false;
            }
          })
        : undefined;
    const dapLaunch = buildDapLaunchArguments(resolvedPaths, {
      browserExecutable,
      nodeRuntime: resolvedPaths.runtimeExecutable
    });
    return {
      ...resolvedPaths,
      python: pythonInterpreter ?? resolvedPaths.python,
      env,
      dap: { ...dapLaunch.arguments, ...(resolvedPaths.dap ?? {}) }
    };
  }

  async start(rawRequest: unknown): Promise<DebugState> {
    const root = await this.ensureWorkspace();
    const request = validateDebugStartRequest(rawRequest);
    const configurationName = request.configurationName ?? request.configuration?.name;
    const compound = configurationName ? findCompound(this.compoundConfigurations, configurationName) : undefined;
    if (compound) {
      validateCompoundStart(compound, this.compoundConfigurations);
      const configs = compound.configurations
        .map((name) => findLaunchConfiguration(this.service.snapshot().launchConfigurations, name))
        .filter((item): item is DebugLaunchConfiguration => Boolean(item));
      if (configs.length !== compound.configurations.length) {
        throw new Error("Compound configuration references unknown launch configurations.");
      }
      const prepared = [];
      for (const config of configs) {
        prepared.push(await this.prepareLaunchConfiguration(config, root));
      }
      await this.service.startCompound(prepared);
      return this.enrichedState();
    }

    const configuration =
      request.configuration ??
      this.service.snapshot().launchConfigurations.find((entry) => entry.name === request.configurationName)?.configuration ??
      this.service.snapshot().launchConfigurations.find((entry) => entry.name === this.service.snapshot().selectedLaunchConfigurationName)?.configuration;
    if (!configuration) {
      throw new Error("No debug configuration is selected.");
    }
    const resolved = await this.adapterManager.resolveLaunchAdapter(configuration);
    this.lastLaunchDiagnostic = resolved.diagnostic;
    if (!resolved.command) {
      this.service.rememberLaunchConfiguration(configuration);
      this.service.setError({
        code: "MISSING_ADAPTER",
        message: resolved.diagnostic?.message ?? `Missing debug adapter for "${configuration.adapterId ?? configuration.type}".`,
        recoverable: true
      });
      return this.enrichedState();
    }
    try {
      const effectiveConfiguration = await this.prepareLaunchConfiguration(configuration, root);
      await this.service.start(configuration, effectiveConfiguration);
    } catch (error) {
      this.service.rememberLaunchConfiguration(configuration);
      this.service.setError({
        code: "LAUNCH_FAILED",
        message: error instanceof Error ? error.message : "Debug launch failed.",
        recoverable: true
      });
    }
    return this.enrichedState();
  }

  stop(): Promise<DebugState> {
    return this.wrapState(async () => {
      await this.service.stop();
      this.killAdapter();
    });
  }

  stopAll(): Promise<DebugState> {
    return this.wrapState(async () => {
      await this.service.stopAll();
      this.killAllAdapters();
    });
  }

  selectSession(sessionId: unknown): Promise<DebugState> {
    const id = assertSmallString(sessionId, "session id", true) as string;
    return this.wrapState(async () => this.service.selectSession(id));
  }

  async ensureWorkspace(): Promise<string> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      throw new Error("Open a workspace before debugging.");
    }
    const realRoot = await fs.realpath(root);
    if (this.workspaceRoot !== realRoot) {
      this.workspaceRoot = realRoot;
      await this.load();
      await this.refreshLaunchConfigurations();
      await this.adapterManager.scanAdapters();
    }
    return realRoot;
  }

  async getState(): Promise<DebugState> {
    await this.ensureWorkspace().catch(() => undefined);
    return this.enrichedState();
  }

  private async wrapState(action: () => Promise<unknown>): Promise<DebugState> {
    await action();
    return this.enrichedState();
  }

  restart(): Promise<DebugState> {
    const configuration = this.service.snapshot().lastLaunchConfiguration;
    if (!configuration) return this.wrapState(() => this.service.restart());
    return this.start({ configuration });
  }

  pause(): Promise<DebugState> {
    return this.wrapState(() => this.service.control("pause"));
  }

  continue(): Promise<DebugState> {
    return this.wrapState(() => this.service.control("continue"));
  }

  stepOver(): Promise<DebugState> {
    return this.wrapState(() => this.service.control("next"));
  }

  stepInto(): Promise<DebugState> {
    return this.wrapState(() => this.service.control("stepIn"));
  }

  stepOut(): Promise<DebugState> {
    return this.wrapState(() => this.service.control("stepOut"));
  }

  async setBreakpoint(rawRequest: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    return this.wrapState(() => this.service.setBreakpoint(validateDebugSetBreakpointRequest(rawRequest)));
  }

  async removeBreakpoint(rawRequest: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    const request = validateDebugRemoveBreakpointRequest(rawRequest);
    return this.wrapState(() => this.service.removeBreakpoint(request.breakpointId, request.relativePath, request.line));
  }

  async addWatch(rawExpression: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    const expression = assertSmallString(rawExpression, "watch expression", true) as string;
    return this.wrapState(() => this.service.addWatch(expression));
  }

  async removeWatch(rawId: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    const id = assertSmallString(rawId, "watch id", true) as string;
    return this.wrapState(() => this.service.removeWatch(id));
  }

  async updateWatch(rawRequest: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    const request = validateDebugUpdateWatchRequest(rawRequest);
    return this.wrapState(() => this.service.updateWatch(request.id, request.expression));
  }

  async loadVariables(rawRequest: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    const request = validateLoadVariablesRequest(rawRequest);
    return this.wrapState(() => this.service.loadVariables(request.variablesReference));
  }

  async evaluate(rawRequest: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    const request = validateDebugEvaluateRequest(rawRequest);
    return this.wrapState(() => this.service.evaluateExpression(request.expression, request.context, request.frameId));
  }

  async setExceptionBreakpoints(rawRequest: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    const request = validateDebugSetExceptionBreakpointsRequest(rawRequest);
    return this.wrapState(() => this.service.setExceptionBreakpoints(request.breakpoints));
  }

  async refreshLoadedSources(): Promise<DebugState> {
    await this.ensureWorkspace();
    return this.wrapState(() => this.service.refreshLoadedSources());
  }

  async getCompletions(rawRequest: unknown): Promise<DebugCompletionItem[]> {
    await this.ensureWorkspace();
    const request = validateDebugCompletionRequest(rawRequest);
    return this.service.getCompletions(request.text, request.column, request.frameId);
  }

  cancelEvaluations(): void {
    this.service.cancelEvaluations();
  }

  async clearConsole(): Promise<DebugState> {
    await this.ensureWorkspace();
    return this.wrapState(() => Promise.resolve(this.service.clearConsole()));
  }

  async selectConfiguration(rawName: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    const name = assertSmallString(rawName, "configuration name", true) as string;
    return this.wrapState(() => this.service.selectLaunchConfiguration(name));
  }

  async createLaunchConfig(): Promise<DebugState> {
    const root = await this.ensureWorkspace();
    await this.ensureLeviLaunchFile(root);
    await this.refreshLaunchConfigurations();
    return this.enrichedState();
  }

  async selectStackFrame(rawRequest: unknown): Promise<DebugState> {
    if (!isPlainObject(rawRequest)) throw new Error("Stack frame request is invalid.");
    const threadId = Number(rawRequest.threadId);
    const frameId = Number(rawRequest.frameId);
    if (!Number.isInteger(threadId) || !Number.isInteger(frameId)) {
      throw new Error("Stack frame request is invalid.");
    }
    return this.wrapState(() => Promise.resolve(this.service.selectStackFrame(threadId, frameId)));
  }

  listAdapterDefinitions() {
    return this.adapterManager.listDefinitions();
  }

  async scanAdapters(): Promise<DebugState> {
    await this.adapterManager.scanAdapters();
    return this.enrichedState();
  }

  async getAdapterStatus(adapterId: unknown): Promise<DebugState> {
    const id = assertSmallString(adapterId, "adapter id", true) as string;
    await this.adapterManager.getAdapterStatus(id);
    return this.enrichedState();
  }

  async installAdapter(rawRequest: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    await this.adapterManager.installAdapter(validateDebugAdapterInstallRequest(rawRequest));
    return this.enrichedState();
  }

  async updateAdapter(rawRequest: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    await this.adapterManager.updateAdapter(validateDebugAdapterInstallRequest(rawRequest));
    return this.enrichedState();
  }

  async uninstallAdapter(rawRequest: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    const request = validateDebugAdapterUninstallRequest(rawRequest);
    await this.adapterManager.uninstallAdapter(request.adapterId, request.confirmed);
    return this.enrichedState();
  }

  async validateAdapter(adapterId: unknown): Promise<DebugState> {
    const id = assertSmallString(adapterId, "adapter id", true) as string;
    await this.adapterManager.validateAdapter(id);
    return this.enrichedState();
  }

  async registerTrustedCustomAdapter(rawRequest: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    await this.adapterManager.registerTrustedCustomAdapter(validateDebugAdapterRegisterCustomRequest(rawRequest));
    return this.enrichedState();
  }

  async revokeTrustedCustomAdapter(adapterId: unknown): Promise<DebugState> {
    const id = assertSmallString(adapterId, "adapter id", true) as string;
    await this.adapterManager.revokeTrustedCustomAdapter(id);
    return this.enrichedState();
  }

  async dismissAdapterRecommendation(adapterId: unknown): Promise<DebugState> {
    const id = assertSmallString(adapterId, "adapter id", true) as string;
    this.adapterManager.dismissRecommendation(id);
    return this.enrichedState();
  }

  cancelAdapterInstall(): void {
    this.adapterManager.cancelInstall();
  }

  revealAdapterLocation(adapterId: unknown): string {
    const id = assertSmallString(adapterId, "adapter id", true) as string;
    const status = this.adapterManager.getStatuses().find((item) => item.id === id);
    return status?.installPath ?? status?.executablePath ?? this.adapterManager.getManagedRoot();
  }

  async dispose(): Promise<void> {
    await this.service.stopAll();
    this.killAllAdapters();
  }

  private async load(): Promise<void> {
    if (!this.workspaceRoot) {
      this.service.hydrate(emptyPersistence());
      return;
    }
    try {
      const raw = await fs.readFile(path.join(this.workspaceRoot, DEBUG_STATE_FILE), "utf8");
      this.service.hydrate(coercePersistence(JSON.parse(raw)));
    } catch {
      this.service.hydrate(emptyPersistence());
    }
  }

  private async persist(state: DebugPersistenceState): Promise<void> {
    if (!this.workspaceRoot) return;
    const filePath = path.join(this.workspaceRoot, DEBUG_STATE_FILE);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
  }

  private async refreshLaunchConfigurations(): Promise<void> {
    if (!this.workspaceRoot) {
      this.service.setLaunchConfigurations([]);
      return;
    }
    await this.ensureLeviLaunchFile(this.workspaceRoot);
    const configs = [
      ...(await this.readLaunchFile(path.join(this.workspaceRoot, VSCODE_LAUNCH_FILE), ".vscode/launch.json")),
      ...(await this.readLaunchFile(path.join(this.workspaceRoot, LEVI_LAUNCH_FILE), ".levi/launch.json"))
    ];
    const launchEntries = configs.length > 0 ? configs : this.detectLaunchConfigurations();
    this.service.setLaunchConfigurations(launchEntries);
    const compoundEntries: DebugCompoundConfigurationEntry[] = [];
    for (const source of [".vscode/launch.json", ".levi/launch.json"] as const) {
      try {
        const filePath = path.join(this.workspaceRoot, source === ".vscode/launch.json" ? VSCODE_LAUNCH_FILE : LEVI_LAUNCH_FILE);
        const raw = await fs.readFile(filePath, "utf8");
        const parsed = JSON.parse(stripJsonComments(raw)) as { compounds?: unknown };
        const names = new Set(launchEntries.map((entry) => entry.name));
        for (const compound of parseCompoundConfigurations(parsed.compounds, names, source)) {
          compoundEntries.push({ ...compound, source });
        }
        this.compoundConfigurations = compoundEntries.map(({ source: _source, ...rest }) => rest);
      } catch {
        // ignore missing launch files
      }
    }
    this.service.setCompoundConfigurations(compoundEntries);
  }

  private async ensureLeviLaunchFile(root: string): Promise<void> {
    const leviLaunchPath = path.join(root, LEVI_LAUNCH_FILE);
    const vscodeLaunchPath = path.join(root, VSCODE_LAUNCH_FILE);
    try {
      await fs.access(leviLaunchPath);
      return;
    } catch {
      try {
        await fs.access(vscodeLaunchPath);
        return;
      } catch {
        await fs.mkdir(path.dirname(leviLaunchPath), { recursive: true });
        await fs.writeFile(leviLaunchPath, launchFilePayload(), "utf8");
      }
    }
  }

  private async readLaunchFile(filePath: string, source: DebugLaunchConfigurationEntry["source"]): Promise<DebugLaunchConfigurationEntry[]> {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(stripJsonComments(raw)) as { configurations?: unknown };
      const configurations = Array.isArray(parsed.configurations) ? parsed.configurations : [];
      return configurations
        .map((configuration, index): DebugLaunchConfigurationEntry | null => {
          try {
            const validated = validateDebugStartRequest({ configuration }).configuration;
            if (!validated) return null;
            return {
              id: `${source}:${validated.name}`,
              name: validated.name,
              configuration: validated,
              source,
              default: index === 0
            } satisfies DebugLaunchConfigurationEntry;
          } catch {
            return null;
          }
        })
        .filter((entry): entry is DebugLaunchConfigurationEntry => entry !== null);
    } catch {
      return [];
    }
  }

  private detectLaunchConfigurations(): DebugLaunchConfigurationEntry[] {
    return DEFAULT_LAUNCH_CONFIGURATIONS.map((configuration, index) => ({
      id: `detected:${configuration.name}`,
      name: configuration.name,
      configuration,
      source: "detected",
      default: index === 0
    }));
  }

  private resolveWorkspacePaths(configuration: DebugLaunchConfiguration, root: string): DebugLaunchConfiguration {
    const resolvePath = (relativePath: string | undefined) => {
      if (!relativePath) return undefined;
      const substituted = relativePath.replace(/\$\{workspaceFolder\}/g, root);
      const absolute = path.isAbsolute(substituted) ? path.resolve(substituted) : path.resolve(root, substituted);
      const relative = path.relative(root, absolute);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Debug paths must stay inside the workspace.");
      }
      return absolute;
    };
    return {
      ...configuration,
      program: resolvePath(configuration.program),
      cwd: resolvePath(configuration.cwd) ?? root,
      args: configuration.args?.map((arg) => arg.replace(/\$\{workspaceFolder\}/g, root)),
      runtimeArgs: configuration.runtimeArgs?.map((arg) => arg.replace(/\$\{workspaceFolder\}/g, root)),
      dap: substituteWorkspaceFolder(configuration.dap, root)
    };
  }

  private resolveSourcePath(relativePath: string): string {
    if (!this.workspaceRoot) return relativePath;
    return path.resolve(this.workspaceRoot, relativePath);
  }

  private relativeSourcePath(sourcePath: string): string | undefined {
    if (!this.workspaceRoot) return normalizeSlashes(sourcePath);
    const normalizedPath = sourcePath.replace(/\$\{workspaceFolder\}/g, this.workspaceRoot);
    const absolute = path.isAbsolute(normalizedPath) ? path.resolve(normalizedPath) : path.resolve(this.workspaceRoot, normalizedPath);
    const relative = path.relative(this.workspaceRoot, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return undefined;
    }
    return normalizeSlashes(relative);
  }

  private async createAdapter(configuration: DebugLaunchConfiguration): Promise<DebugTransport> {
    const root = await this.ensureWorkspace();
    const resolved = await this.adapterManager.resolveLaunchAdapter(configuration);
    this.lastLaunchDiagnostic = resolved.diagnostic;
    if (!resolved.command) {
      throw new Error(resolved.diagnostic?.message ?? `Missing debug adapter for "${configuration.adapterId ?? configuration.type}".`);
    }
    if (resolved.command.entryPath) {
      try {
        await fs.access(resolved.command.entryPath);
      } catch {
        throw new Error("Adapter DAP entry point was not found.");
      }
    }
    const metadata = this.adapterManager.getStatuses().find((item) => item.id === (configuration.adapterId ?? configuration.type));
    const managedPath = metadata?.installPath;
    const spawnEnv =
      resolved.command.launcher === "python"
        ? buildPythonAdapterEnvironment({
            leviAdapterRoot: this.adapterManager.getManagedRoot(),
            existingEnv: { ...process.env, ...(configuration.env ?? {}) },
            managedInstallPath: managedPath
          })
        : { ...process.env, ...(configuration.env ?? {}) };

    try {
      await fs.access(resolved.command.command);
    } catch {
      throw new Error(`Debug adapter executable is not available for "${configuration.adapterId ?? configuration.type}".`);
    }

    const child = spawn(resolved.command.command, resolved.command.args, {
      cwd: configuration.cwd ?? root,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: spawnEnv
    });
    this.adapterProcess = child;
    const sessionKey = `${configuration.name}:${Date.now()}`;
    this.adapterProcesses.set(sessionKey, child);

    child.stderr.on("data", (chunk: Buffer) => {
      const message = chunk.toString("utf8").trim();
      if (message && !/(password|secret|token|key)=/i.test(message)) {
        this.service.setError({
          code: "ADAPTER_CRASH",
          message,
          recoverable: true
        });
      }
    });
    child.on("exit", (code, signal) => {
      this.adapterProcesses.delete(sessionKey);
      if (this.adapterProcess !== child) return;
      this.adapterProcess = null;
      this.service.setState("Terminated");
      if (code && code !== 0) {
        this.service.setError({
          code: "ADAPTER_CRASH",
          message: `Debug adapter exited with code ${code}${signal ? ` (${signal})` : ""}.`,
          recoverable: true
        });
      }
    });

    return {
      write: (message) => child.stdin.write(message),
      onData: (listener) => {
        const handler = (chunk: Buffer) => listener(chunk);
        child.stdout.on("data", handler);
        return () => child.stdout.off("data", handler);
      },
      dispose: () => {
        this.adapterProcesses.delete(sessionKey);
        if (this.adapterProcess === child) {
          this.adapterProcess = null;
        }
        if (!child.killed) child.kill();
      }
    };
  }

  private killAdapter(): void {
    if (this.adapterProcess && !this.adapterProcess.killed) {
      this.adapterProcess.kill();
    }
    this.adapterProcess = null;
  }

  private killAllAdapters(): void {
    for (const child of this.adapterProcesses.values()) {
      if (!child.killed) child.kill();
    }
    this.adapterProcesses.clear();
    this.adapterProcess = null;
  }
}
