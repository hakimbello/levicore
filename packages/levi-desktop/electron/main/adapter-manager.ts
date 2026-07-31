import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { app } from "electron";
import {
  BUILTIN_ADAPTER_REGISTRY,
  buildAdapterSpawnCommand,
  discoverAdapter,
  discoverAllAdapters,
  getAdapterDefinition,
  isVersionCompatible,
  parseVersionOutput,
  recommendAdapters,
  resolveConfigurationAdapterId,
  validateCustomAdapterDefinition,
  validateCustomAdapterFile,
  type DebugAdapterBuildContext,
  type DebugAdapterDiscoveryResult,
  type DebugAdapterInstallProgress,
  type DebugAdapterInstallRequest,
  type DebugAdapterPersistenceState,
  type DebugAdapterRegisterCustomRequest,
  type DebugAdapterResolvedCommand,
  type DebugAdapterStatus,
  type DebugLaunchAdapterDiagnostic,
  type DebugAdapterRecommendation,
  type TrustedCustomAdapterDefinition
} from "../../src/features/debugger/adapters";
import type { DebugLaunchConfiguration } from "../../src/features/debugger/DebugEvents";
import {
  AdapterInstallCancelledError,
  installAdapterOption,
  uninstallManagedAdapter
} from "./adapter-installer";

const ADAPTER_STATE_FILE = "state.json";
const WORKSPACE_CUSTOM_ADAPTERS = path.join(".levi", "debug-adapters.json");
const PROCESS_TIMEOUT_MS = 10_000;
const MAX_PROCESS_OUTPUT = 4096;

type AdapterProgressListener = (progress: DebugAdapterInstallProgress) => void;

function defaultPersistence(): DebugAdapterPersistenceState {
  return {
    trustedCustomAdapters: [],
    installationMetadata: {},
    discoveryCache: {},
    dismissedRecommendations: []
  };
}

function splitPathEntries(): string[] {
  return (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
}

export class AdapterManager {
  private persistence: DebugAdapterPersistenceState = defaultPersistence();
  private adapterRoot: string;
  private activeInstall: { adapterId: string; cancel: () => void } | null = null;
  private progressListeners: AdapterProgressListener[] = [];
  private lastStatuses: DebugAdapterStatus[] = [];
  private lastRecommendations: DebugAdapterRecommendation[] = [];

  constructor(
    private readonly getWorkspaceRoot: () => string | null,
    options?: { adapterRoot?: string }
  ) {
    this.adapterRoot =
      options?.adapterRoot ??
      path.join(typeof app?.getPath === "function" ? app.getPath("userData") : os.tmpdir(), "debug-adapters");
  }

  onProgress(listener: AdapterProgressListener): () => void {
    this.progressListeners.push(listener);
    return () => {
      this.progressListeners = this.progressListeners.filter((item) => item !== listener);
    };
  }

  getManagedRoot(): string {
    return this.adapterRoot;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.adapterRoot, { recursive: true });
    await this.load();
    await this.scanAdapters();
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(path.join(this.adapterRoot, ADAPTER_STATE_FILE), "utf8");
      this.persistence = coercePersistence(JSON.parse(raw));
    } catch {
      this.persistence = defaultPersistence();
    }
    await this.loadWorkspaceCustomDefinitions();
  }

  private async loadWorkspaceCustomDefinitions(): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) return;
    try {
      const raw = await fs.readFile(path.join(root, WORKSPACE_CUSTOM_ADAPTERS), "utf8");
      const parsed = validateCustomAdapterFile(JSON.parse(raw));
      for (const adapter of parsed) {
        if (this.persistence.trustedCustomAdapters.some((item) => item.id === adapter.id)) continue;
      }
    } catch {
      // Workspace custom definitions remain untrusted until explicit registration.
    }
  }

  async persist(): Promise<void> {
    await fs.mkdir(this.adapterRoot, { recursive: true });
    await fs.writeFile(path.join(this.adapterRoot, ADAPTER_STATE_FILE), JSON.stringify(this.persistence, null, 2), "utf8");
  }

  listDefinitions() {
    return BUILTIN_ADAPTER_REGISTRY.map((item) => ({ ...item, installationOptions: [...item.installationOptions] }));
  }

  getStatuses(): DebugAdapterStatus[] {
    return this.lastStatuses.map((item) => ({ ...item }));
  }

  getRecommendations(): DebugAdapterRecommendation[] {
    return this.lastRecommendations.map((item) => ({ ...item }));
  }

  async scanAdapters(): Promise<DebugAdapterStatus[]> {
    const context = await this.buildContext();
    const discoveries = await discoverAllAdapters(BUILTIN_ADAPTER_REGISTRY, context, this.persistence.trustedCustomAdapters);
    const statuses: DebugAdapterStatus[] = [];

    for (const definition of BUILTIN_ADAPTER_REGISTRY) {
      if (definition.id === "custom") {
        for (const custom of this.persistence.trustedCustomAdapters) {
          const discovery = await discoverAdapter(definition, context, custom);
          statuses.push(await this.toStatus(definition, discovery, custom));
        }
        continue;
      }
      const discovery = discoveries.find((item) => item.adapterId === definition.id) ?? {
        adapterId: definition.id,
        state: "missing" as const
      };
      statuses.push(await this.toStatus(definition, discovery));
    }

    this.lastStatuses = statuses;
    this.lastRecommendations = await recommendAdapters({
      workspaceRoot: context.workspaceRoot,
      fileExists: context.fileExists,
      dismissed: new Set(this.persistence.dismissedRecommendations)
    });
    return this.getStatuses();
  }

  async getAdapterStatus(adapterId: string): Promise<DebugAdapterStatus | null> {
    await this.scanAdapters();
    return this.getStatuses().find((item) => item.id === adapterId) ?? null;
  }

  async resolveLaunchAdapter(configuration: DebugLaunchConfiguration): Promise<{
    command: DebugAdapterResolvedCommand | null;
    diagnostic?: DebugLaunchAdapterDiagnostic;
  }> {
    const adapterId = resolveConfigurationAdapterId(configuration);
    const definition = getAdapterDefinition(adapterId);
    if (!definition && adapterId !== "custom") {
      return {
        command: null,
        diagnostic: {
          adapterId,
          configurationName: configuration.name,
          state: "invalid",
          message: `Unknown debug adapter "${adapterId}".`,
          action: "configure"
        }
      };
    }

    const custom = this.persistence.trustedCustomAdapters.find((item) => item.id === adapterId);
    const context = await this.buildContext();
    const discovery = await discoverAdapter(
      definition ?? getAdapterDefinition("custom")!,
      context,
      custom
    );
    const validated = await this.applyVersionValidation(definition ?? getAdapterDefinition("custom")!, discovery);
    if (validated.state !== "installed") {
      return {
        command: null,
        diagnostic: {
          adapterId,
          configurationName: configuration.name,
          state: validated.state,
          message: validated.message ?? `${adapterId} adapter is not available.`,
          action: validated.state === "missing" ? "install" : validated.state === "incompatible" ? "update" : "configure"
        }
      };
    }

    const spawnCommand = buildAdapterSpawnCommand(definition ?? getAdapterDefinition("custom")!, validated, configuration);
    if (!spawnCommand) {
      return {
        command: null,
        diagnostic: {
          adapterId,
          configurationName: configuration.name,
          state: "invalid",
          message: "Adapter command could not be constructed.",
          action: "configure"
        }
      };
    }

    if (custom?.args?.length) {
      spawnCommand.args = [...spawnCommand.args, ...custom.args];
    }

    return { command: spawnCommand };
  }

  async validateAdapter(adapterId: string): Promise<DebugAdapterStatus> {
    await this.scanAdapters();
    const status = this.getStatuses().find((item) => item.id === adapterId);
    if (!status) throw new Error(`Adapter "${adapterId}" is not registered.`);
    return status;
  }

  async installAdapter(request: DebugAdapterInstallRequest): Promise<DebugAdapterStatus[]> {
    if (!request.confirmed) {
      throw new Error("Installation requires explicit user confirmation.");
    }
    const definition = getAdapterDefinition(request.adapterId);
    if (!definition) throw new Error("Adapter is not allowlisted.");
    const option = definition.installationOptions.find((item) => item.id === request.optionId);
    if (!option) throw new Error("Installation option is not allowlisted.");

    let cancelled = false;
    const cancel = () => {
      cancelled = true;
    };
    this.activeInstall = { adapterId: request.adapterId, cancel };
    this.emitProgress({ adapterId: request.adapterId, phase: "install", percent: 0, message: "Starting installation…" });

    try {
      const result = await installAdapterOption({
        adapterId: request.adapterId,
        option,
        installRoot: this.adapterRoot,
        nodeExecutable: await this.findNodeExecutable(),
        pythonExecutable: await this.findPythonExecutable(),
        npmExecutable: process.platform === "win32" ? "npm.cmd" : "npm",
        onProgress: (update) => this.emitProgress({ adapterId: request.adapterId, phase: update.phase, percent: update.percent, message: update.message }),
        isCancelled: () => cancelled
      });
      this.persistence.installationMetadata[request.adapterId] = {
        version: result.version,
        path: result.installPath,
        installedAt: new Date().toISOString(),
        optionId: request.optionId
      };
      delete this.persistence.discoveryCache[request.adapterId];
      await this.persist();
      this.emitProgress({ adapterId: request.adapterId, phase: "complete", percent: 100, message: "Installation complete." });
      return this.scanAdapters();
    } catch (error) {
      if (error instanceof AdapterInstallCancelledError) {
        await uninstallManagedAdapter(this.adapterRoot, request.adapterId).catch(() => undefined);
        this.emitProgress({ adapterId: request.adapterId, phase: "cancelled", message: "Installation cancelled." });
      } else {
        this.emitProgress({
          adapterId: request.adapterId,
          phase: "failed",
          message: error instanceof Error ? error.message : "Installation failed."
        });
      }
      throw error;
    } finally {
      this.activeInstall = null;
    }
  }

  cancelInstall(): void {
    this.activeInstall?.cancel();
  }

  async updateAdapter(request: DebugAdapterInstallRequest): Promise<DebugAdapterStatus[]> {
    await this.installAdapter(request);
    return this.scanAdapters();
  }

  async uninstallAdapter(adapterId: string, confirmed: boolean): Promise<DebugAdapterStatus[]> {
    if (!confirmed) throw new Error("Uninstall requires explicit user confirmation.");
    if (!getAdapterDefinition(adapterId)) throw new Error("Adapter is not allowlisted.");
    await uninstallManagedAdapter(this.adapterRoot, adapterId);
    delete this.persistence.installationMetadata[adapterId];
    delete this.persistence.discoveryCache[adapterId];
    await this.persist();
    return this.scanAdapters();
  }

  async registerTrustedCustomAdapter(request: DebugAdapterRegisterCustomRequest): Promise<DebugAdapterStatus[]> {
    if (!request.confirmed) throw new Error("Custom adapter registration requires explicit trust confirmation.");
    const validated = validateCustomAdapterDefinition(request.adapter);
    const entry: TrustedCustomAdapterDefinition = {
      ...validated,
      trustedAt: new Date().toISOString()
    };
    this.persistence.trustedCustomAdapters = [
      ...this.persistence.trustedCustomAdapters.filter((item) => item.id !== entry.id),
      entry
    ];
    await this.persist();
    return this.scanAdapters();
  }

  async revokeTrustedCustomAdapter(adapterId: string): Promise<DebugAdapterStatus[]> {
    this.persistence.trustedCustomAdapters = this.persistence.trustedCustomAdapters.filter((item) => item.id !== adapterId);
    await this.persist();
    return this.scanAdapters();
  }

  dismissRecommendation(adapterId: string): DebugAdapterRecommendation[] {
    if (!this.persistence.dismissedRecommendations.includes(adapterId)) {
      this.persistence.dismissedRecommendations.push(adapterId);
      void this.persist();
    }
    this.lastRecommendations = this.lastRecommendations.filter((item) => item.adapterId !== adapterId);
    return this.getRecommendations();
  }

  private emitProgress(progress: DebugAdapterInstallProgress): void {
    for (const listener of this.progressListeners) listener(progress);
  }

  private async buildContext(): Promise<DebugAdapterBuildContext> {
    const workspaceRoot = this.getWorkspaceRoot();
    return {
      workspaceRoot: workspaceRoot ?? undefined,
      leviAdapterRoot: this.adapterRoot,
      pathEntries: splitPathEntries(),
      environment: { ...process.env },
      platform: process.platform,
      fileExists: async (targetPath) => {
        try {
          await fs.access(targetPath);
          return true;
        } catch {
          return false;
        }
      },
      readFile: (targetPath) => fs.readFile(targetPath, "utf8"),
      stat: (targetPath) => fs.stat(targetPath)
    };
  }

  private async toStatus(
    definition: NonNullable<ReturnType<typeof getAdapterDefinition>>,
    discovery: DebugAdapterDiscoveryResult,
    custom?: TrustedCustomAdapterDefinition
  ): Promise<DebugAdapterStatus> {
    const validated = await this.applyVersionValidation(definition, discovery);
    const metadata = this.persistence.installationMetadata[definition.id];
    return {
      id: definition.id,
      displayName: custom?.displayName ?? definition.displayName,
      languages: custom?.languages ?? definition.languages,
      requestTypes: custom?.requestTypes ?? definition.requestTypes,
      state: validated.state,
      executablePath: validated.executablePath,
      entryPath: validated.entryPath,
      detectedVersion: validated.detectedVersion,
      installedVersion: metadata?.version,
      source: validated.source,
      message: validated.message,
      trusted: custom ? true : undefined,
      installPath: metadata?.path,
      capabilities: definition.capabilities,
      minimumVersion: definition.minimumVersion
    };
  }

  private async applyVersionValidation(
    definition: NonNullable<ReturnType<typeof getAdapterDefinition>>,
    discovery: DebugAdapterDiscoveryResult
  ): Promise<DebugAdapterDiscoveryResult> {
    if (discovery.state !== "installed" || !discovery.executablePath) return discovery;

    let mtimeMs = 0;
    try {
      mtimeMs = (await fs.stat(discovery.executablePath)).mtimeMs;
    } catch {
      return { ...discovery, state: "invalid", message: "Adapter executable is not accessible." };
    }

    const cached = this.persistence.discoveryCache[definition.id];
    if (
      cached &&
      cached.executablePath === discovery.executablePath &&
      cached.executableMtimeMs === mtimeMs &&
      cached.version &&
      isVersionCompatible(cached.version, definition.minimumVersion)
    ) {
      return {
        ...discovery,
        detectedVersion: cached.version,
        state: "installed"
      };
    }

    const detectedVersion = await this.detectVersion(definition, discovery);
    if (definition.minimumVersion && detectedVersion && !isVersionCompatible(detectedVersion, definition.minimumVersion)) {
      return {
        ...discovery,
        detectedVersion,
        state: "incompatible",
        message: `Detected version ${detectedVersion} is below the minimum ${definition.minimumVersion}.`
      };
    }

    if (detectedVersion) {
      this.persistence.discoveryCache[definition.id] = {
        executablePath: discovery.executablePath,
        entryPath: discovery.entryPath,
        version: detectedVersion,
        executableMtimeMs: mtimeMs,
        cachedAt: new Date().toISOString()
      };
      await this.persist();
    }

    return {
      ...discovery,
      detectedVersion,
      state: "installed"
    };
  }

  private async detectVersion(
    definition: NonNullable<ReturnType<typeof getAdapterDefinition>>,
    discovery: DebugAdapterDiscoveryResult
  ): Promise<string | undefined> {
    if (!definition.versionCommand || !discovery.executablePath) return undefined;
    const launcher = definition.versionCommand.launcher;
    const command =
      launcher === "node"
        ? discovery.executablePath
        : launcher === "python"
          ? discovery.executablePath
          : discovery.executablePath;
    try {
      const output = await runBoundedProcess(command, definition.versionCommand.args);
      return parseVersionOutput(output);
    } catch {
      return undefined;
    }
  }

  private async findNodeExecutable(): Promise<string> {
    const context = await this.buildContext();
    for (const directory of context.pathEntries) {
      for (const name of ["node", "node.exe"]) {
        const candidate = path.join(directory, name);
        if (await context.fileExists(candidate)) return candidate;
      }
    }
    return process.execPath;
  }

  private async findPythonExecutable(): Promise<string | undefined> {
    const context = await this.buildContext();
    for (const directory of context.pathEntries) {
      for (const name of ["python", "python3", "python.exe", "python3.exe"]) {
        const candidate = path.join(directory, name);
        if (await context.fileExists(candidate)) return candidate;
      }
    }
    return undefined;
  }
}

function runBoundedProcess(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Version command timed out."));
    }, PROCESS_TIMEOUT_MS);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = (stdout + chunk.toString("utf8")).slice(0, MAX_PROCESS_OUTPUT);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString("utf8")).slice(0, MAX_PROCESS_OUTPUT);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr || stdout || `Process exited with code ${code ?? -1}.`));
        return;
      }
      resolve(stdout || stderr);
    });
  });
}

function coercePersistence(value: unknown): DebugAdapterPersistenceState {
  if (!value || typeof value !== "object") return defaultPersistence();
  const record = value as Partial<DebugAdapterPersistenceState>;
  return {
    trustedCustomAdapters: Array.isArray(record.trustedCustomAdapters) ? record.trustedCustomAdapters : [],
    installationMetadata: record.installationMetadata && typeof record.installationMetadata === "object" ? record.installationMetadata : {},
    discoveryCache: record.discoveryCache && typeof record.discoveryCache === "object" ? record.discoveryCache : {},
    dismissedRecommendations: Array.isArray(record.dismissedRecommendations) ? record.dismissedRecommendations : []
  };
}

export type { DebugAdapterInstallProgress };
