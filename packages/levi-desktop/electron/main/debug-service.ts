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
  DebugStartRequest,
  DebugState,
  DebugUpdateWatchRequest
} from "../../src/features/debugger/DebugEvents";

const DEBUG_STATE_FILE = path.join(".levi", "debug-state.json");
const LEVI_LAUNCH_FILE = path.join(".levi", "launch.json");
const VSCODE_LAUNCH_FILE = path.join(".vscode", "launch.json");
const MAX_STRING_LENGTH = 4000;
const MAX_ARGS = 64;

type WorkspaceProvider = () => string | null;

type AdapterConfig = {
  command: string;
  args: string[];
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
    request: "attach",
    name: "Chrome Attach",
    adapterId: "chrome",
    dap: { port: 9222, webRoot: "${workspaceFolder}" }
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
  return {
    configurationName,
    configuration: {
      type,
      request,
      name: assertSmallString(configuration.name, "name", true) as string,
      adapterId: assertSmallString(configuration.adapterId, "adapterId"),
      program,
      cwd,
      args: assertStringArray(configuration.args, "args"),
      env: sanitizeEnvironment(configuration.env),
      stopOnEntry: typeof configuration.stopOnEntry === "boolean" ? configuration.stopOnEntry : undefined,
      console:
        configuration.console === "internalConsole" || configuration.console === "integratedTerminal"
          ? configuration.console
          : undefined,
      runtimeArgs: assertStringArray(configuration.runtimeArgs, "runtimeArgs"),
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
    watches: []
  };
}

function coercePersistence(value: unknown): DebugPersistenceState {
  if (!isPlainObject(value)) return emptyPersistence();
  return {
    breakpoints: Array.isArray(value.breakpoints) ? (value.breakpoints as DebugPersistenceState["breakpoints"]) : [],
    watches: Array.isArray(value.watches) ? (value.watches as DebugPersistenceState["watches"]) : [],
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

export class DesktopDebugService {
  private workspaceRoot: string | null = null;
  private adapterProcess: ChildProcessWithoutNullStreams | null = null;
  private readonly service: CoreDebugService;

  constructor(private readonly getWorkspaceRoot: WorkspaceProvider) {
    this.service = new CoreDebugService({
      createAdapter: (configuration) => this.createAdapter(configuration),
      resolveSourcePath: (relativePath) => this.resolveSourcePath(relativePath),
      relativizeSourcePath: (sourcePath) => this.relativeSourcePath(sourcePath),
      onDidChangePersistence: (state) => this.persist(state)
    });
  }

  onEvent(listener: (event: DebugEvent) => void): () => void {
    return this.service.onEvent(listener);
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
    }
    return realRoot;
  }

  async getState(): Promise<DebugState> {
    await this.ensureWorkspace().catch(() => undefined);
    return this.service.snapshot();
  }

  async start(rawRequest: unknown): Promise<DebugState> {
    const root = await this.ensureWorkspace();
    const request = validateDebugStartRequest(rawRequest);
    const configuration =
      request.configuration ??
      this.service.snapshot().launchConfigurations.find((entry) => entry.name === request.configurationName)?.configuration ??
      this.service.snapshot().launchConfigurations.find((entry) => entry.name === this.service.snapshot().selectedLaunchConfigurationName)?.configuration;
    if (!configuration) {
      throw new Error("No debug configuration is selected.");
    }
    const effectiveConfiguration = this.resolveWorkspacePaths(configuration, root);
    return this.service.start(configuration, effectiveConfiguration);
  }

  stop(): Promise<DebugState> {
    return this.service.stop();
  }

  restart(): Promise<DebugState> {
    const configuration = this.service.snapshot().lastLaunchConfiguration;
    if (!configuration) return this.service.restart();
    return this.start({ configuration });
  }

  pause(): Promise<DebugState> {
    return this.service.control("pause");
  }

  continue(): Promise<DebugState> {
    return this.service.control("continue");
  }

  stepOver(): Promise<DebugState> {
    return this.service.control("next");
  }

  stepInto(): Promise<DebugState> {
    return this.service.control("stepIn");
  }

  stepOut(): Promise<DebugState> {
    return this.service.control("stepOut");
  }

  async setBreakpoint(rawRequest: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    return this.service.setBreakpoint(validateDebugSetBreakpointRequest(rawRequest));
  }

  async removeBreakpoint(rawRequest: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    const request = validateDebugRemoveBreakpointRequest(rawRequest);
    return this.service.removeBreakpoint(request.breakpointId, request.relativePath, request.line);
  }

  async addWatch(rawExpression: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    const expression = assertSmallString(rawExpression, "watch expression", true) as string;
    return this.service.addWatch(expression);
  }

  async removeWatch(rawId: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    const id = assertSmallString(rawId, "watch id", true) as string;
    return this.service.removeWatch(id);
  }

  async updateWatch(rawRequest: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    const request = validateDebugUpdateWatchRequest(rawRequest);
    return this.service.updateWatch(request.id, request.expression);
  }

  async loadVariables(rawRequest: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    const request = validateLoadVariablesRequest(rawRequest);
    return this.service.loadVariables(request.variablesReference);
  }

  async evaluate(rawRequest: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    const request = validateDebugEvaluateRequest(rawRequest);
    return this.service.evaluateExpression(request.expression, request.context, request.frameId);
  }

  async clearConsole(): Promise<DebugState> {
    await this.ensureWorkspace();
    return this.service.clearConsole();
  }

  async selectConfiguration(rawName: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    const name = assertSmallString(rawName, "configuration name", true) as string;
    return this.service.selectLaunchConfiguration(name);
  }

  async createLaunchConfig(): Promise<DebugState> {
    const root = await this.ensureWorkspace();
    await this.ensureLeviLaunchFile(root);
    await this.refreshLaunchConfigurations();
    return this.service.snapshot();
  }

  async selectStackFrame(rawRequest: unknown): Promise<DebugState> {
    if (!isPlainObject(rawRequest)) throw new Error("Stack frame request is invalid.");
    const threadId = Number(rawRequest.threadId);
    const frameId = Number(rawRequest.frameId);
    if (!Number.isInteger(threadId) || !Number.isInteger(frameId)) {
      throw new Error("Stack frame request is invalid.");
    }
    return this.service.selectStackFrame(threadId, frameId);
  }

  async dispose(): Promise<void> {
    await this.service.stop();
    this.killAdapter();
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
    this.service.setLaunchConfigurations(configs.length > 0 ? configs : this.detectLaunchConfigurations());
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

  private resolveAdapter(configuration: DebugLaunchConfiguration): AdapterConfig | null {
    const adapterId = (configuration.adapterId ?? configuration.type).replace(/[^A-Za-z0-9_]/g, "_").toUpperCase();
    const command = process.env[`LEVI_DEBUG_ADAPTER_${adapterId}`];
    if (!command || !path.isAbsolute(command)) {
      return null;
    }
    const argsRaw = process.env[`LEVI_DEBUG_ADAPTER_ARGS_${adapterId}`];
    let args: string[] = [];
    if (argsRaw) {
      try {
        const parsed = JSON.parse(argsRaw) as unknown;
        args = assertStringArray(parsed, "debug adapter args") ?? [];
      } catch {
        args = [];
      }
    }
    return { command, args };
  }

  private async createAdapter(configuration: DebugLaunchConfiguration): Promise<DebugTransport> {
    const root = await this.ensureWorkspace();
    const adapter = this.resolveAdapter(configuration);
    if (!adapter) {
      throw new Error(`Missing debug adapter for "${configuration.adapterId ?? configuration.type}".`);
    }
    try {
      await fs.access(adapter.command);
    } catch {
      throw new Error(`Debug adapter executable is not available for "${configuration.adapterId ?? configuration.type}".`);
    }
    this.killAdapter();
    const child = spawn(adapter.command, adapter.args, {
      cwd: root,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        ...(configuration.env ?? {})
      }
    });
    this.adapterProcess = child;

    child.stderr.on("data", (chunk: Buffer) => {
      const message = chunk.toString("utf8").trim();
      if (message) {
        this.service.setError({
          code: "ADAPTER_CRASH",
          message,
          recoverable: true
        });
      }
    });
    child.on("exit", (code, signal) => {
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
}
