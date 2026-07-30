import path from "node:path";
import type { RuntimeConnectionStatus, SelectedProject } from "../../src/types/levi-api";

type RuntimeEnvelope = {
  success?: boolean;
  data?: unknown;
  error?: { message?: string } | string | null;
};

type RuntimeState = {
  state?: string;
};

type RuntimeInstance = {
  initialize: (options?: unknown) => Promise<RuntimeEnvelope> | RuntimeEnvelope;
  executeCommand: (commandId: string, input?: unknown, options?: unknown) => Promise<RuntimeEnvelope> | RuntimeEnvelope;
  getState?: () => RuntimeState;
  shutdown?: (options?: unknown) => Promise<RuntimeEnvelope> | RuntimeEnvelope;
};

type RuntimeFactory = (options: unknown) => RuntimeInstance;

type RuntimeModule = {
  LeviApplicationRuntime: RuntimeFactory;
};

type DesktopRuntimeServiceOptions = {
  repositoryRoot: string;
  runtimeFactory?: RuntimeFactory;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Runtime service request failed.";
}

function envelopeError(envelope: RuntimeEnvelope): string {
  if (typeof envelope.error === "string") {
    return envelope.error;
  }
  if (envelope.error?.message) {
    return envelope.error.message;
  }
  return "Runtime command did not complete successfully.";
}

function workspaceIdFromEnvelope(envelope: RuntimeEnvelope): string | undefined {
  const data = envelope.data;
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const id = (data as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

export class DesktopRuntimeService {
  private readonly repositoryRoot: string;
  private readonly runtimeFactory?: RuntimeFactory;
  private runtime: RuntimeInstance | null = null;
  private initPromise: Promise<RuntimeInstance | null> | null = null;
  private workspaceId: string | null = null;
  private workspaceRootPath: string | null = null;
  private status: RuntimeConnectionStatus = { state: "uninitialized" };

  constructor(options: DesktopRuntimeServiceOptions) {
    this.repositoryRoot = options.repositoryRoot;
    this.runtimeFactory = options.runtimeFactory;
  }

  getStatusSnapshot(): RuntimeConnectionStatus {
    return { ...this.status };
  }

  async syncWorkspace(project: SelectedProject): Promise<RuntimeConnectionStatus> {
    const runtime = await this.ensureRuntime();
    if (!runtime) {
      return this.getStatusSnapshot();
    }

    try {
      const envelope =
        this.workspaceId && this.workspaceRootPath === project.path
          ? await runtime.executeCommand("workspace.refresh", { workspaceId: this.workspaceId }, { fast: true })
          : await runtime.executeCommand(
              "workspace.open",
              {
                uri: project.path,
                rootPath: project.path,
                name: project.name,
                metadata: { source: "levi-desktop" }
              },
              { fast: true }
            );
      if (envelope.success === false) {
        this.status = {
          ...this.status,
          state: "failed",
          error: envelopeError(envelope)
        };
        return this.getStatusSnapshot();
      }
      const nextWorkspaceId = workspaceIdFromEnvelope(envelope);
      if (nextWorkspaceId) {
        this.workspaceId = nextWorkspaceId;
        this.workspaceRootPath = project.path;
      }
      this.status = {
        ...this.status,
        state: this.status.runtimeState === "READY" ? "ready" : "degraded",
        workspaceId: this.workspaceId ?? undefined,
        error: undefined
      };
      return this.getStatusSnapshot();
    } catch (error) {
      this.status = {
        ...this.status,
        state: "failed",
        error: errorMessage(error)
      };
      return this.getStatusSnapshot();
    }
  }

  async shutdown(): Promise<void> {
    if (!this.runtime?.shutdown) {
      return;
    }
    await this.runtime.shutdown({ save: false });
  }

  private async ensureRuntime(): Promise<RuntimeInstance | null> {
    if (this.runtime) {
      return this.runtime;
    }
    if (!this.initPromise) {
      this.initPromise = this.createRuntime();
    }
    return this.initPromise;
  }

  private async createRuntime(): Promise<RuntimeInstance | null> {
    try {
      const factory = this.runtimeFactory ?? this.loadRuntimeFactory();
      const runtime = factory({
        configuration: {
          persistenceEnabled: false,
          autoSaveEnabled: false,
          storageRoot: ".levi/desktop-runtime"
        }
      });
      const initialized = await runtime.initialize({ skipChecks: true });
      if (initialized.success === false) {
        this.status = {
          state: "failed",
          error: envelopeError(initialized)
        };
        return null;
      }
      this.runtime = runtime;
      await this.refreshHealth(runtime);
      return runtime;
    } catch (error) {
      this.status = {
        state: "unavailable",
        error: errorMessage(error)
      };
      return null;
    }
  }

  private loadRuntimeFactory(): RuntimeFactory {
    const runtimePath = path.join(this.repositoryRoot, "src", "levi-application-runtime.js");
    const runtimeModule = require(runtimePath) as RuntimeModule;
    return runtimeModule.LeviApplicationRuntime;
  }

  private async refreshHealth(runtime: RuntimeInstance): Promise<void> {
    const state = runtime.getState?.().state;
    const envelope = await runtime.executeCommand("runtime.health", {});
    const health = envelope.data && typeof envelope.data === "object" ? (envelope.data as { overallRuntimeHealth?: unknown }) : {};
    this.status = {
      state: state === "READY" ? "ready" : "degraded",
      runtimeState: state,
      overallRuntimeHealth: typeof health.overallRuntimeHealth === "number" ? health.overallRuntimeHealth : undefined
    };
  }
}
