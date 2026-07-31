import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { DebugService as CoreDebugService } from "../../src/features/debugger/DebugService";
import type { DebugTransport } from "../../src/features/debugger/DebugSession";
import type {
  DebugEvent,
  DebugLaunchConfiguration,
  DebugPersistenceState,
  DebugRemoveBreakpointRequest,
  DebugSetBreakpointRequest,
  DebugStartRequest,
  DebugState
} from "../../src/features/debugger/DebugEvents";

const DEBUG_STATE_FILE = path.join(".levi", "debug-state.json");
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
  if (!isPlainObject(value) || !isPlainObject(value.configuration)) {
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
      : undefined
  };
}

export class DesktopDebugService {
  private workspaceRoot: string | null = null;
  private adapterProcess: ChildProcessWithoutNullStreams | null = null;
  private readonly service: CoreDebugService;

  constructor(private readonly getWorkspaceRoot: WorkspaceProvider) {
    this.service = new CoreDebugService({
      createAdapter: (configuration) => this.createAdapter(configuration),
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
    }
    return realRoot;
  }

  async getState(): Promise<DebugState> {
    await this.ensureWorkspace().catch(() => undefined);
    return this.service.snapshot();
  }

  async start(rawRequest: unknown): Promise<DebugState> {
    await this.ensureWorkspace();
    const request = validateDebugStartRequest(rawRequest);
    return this.service.start(request.configuration);
  }

  stop(): Promise<DebugState> {
    return this.service.stop();
  }

  restart(): Promise<DebugState> {
    return this.service.restart();
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

  private resolveWorkspacePaths(configuration: DebugLaunchConfiguration, root: string): DebugLaunchConfiguration {
    const resolvePath = (relativePath: string | undefined) => {
      if (!relativePath) return undefined;
      const absolute = path.resolve(root, relativePath);
      const relative = path.relative(root, absolute);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error("Debug paths must stay inside the workspace.");
      }
      return absolute;
    };
    return {
      ...configuration,
      program: resolvePath(configuration.program),
      cwd: resolvePath(configuration.cwd) ?? root
    };
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
