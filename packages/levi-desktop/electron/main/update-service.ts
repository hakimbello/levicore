import { app } from "electron";
import { autoUpdater, type AppUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater";
import type { UpdateStatus, UpdateStatusState } from "../../src/types/levi-api";

type UpdateProvider = Pick<AppUpdater, "autoDownload" | "checkForUpdates" | "downloadUpdate" | "quitAndInstall" | "on">;

type UpdateListener = (status: UpdateStatus) => void;

const allowedStates: ReadonlySet<UpdateStatusState> = new Set([
  "idle",
  "checking",
  "update-available",
  "update-not-available",
  "downloading",
  "downloaded",
  "error"
]);

function isUpdateStatusState(value: string): value is UpdateStatusState {
  return allowedStates.has(value as UpdateStatusState);
}

export class UpdateService {
  private status: UpdateStatus;
  private checking: Promise<UpdateStatus> | null = null;
  private downloading: Promise<UpdateStatus> | null = null;
  private installing = false;
  private readonly listeners = new Set<UpdateListener>();

  constructor(
    private readonly provider: UpdateProvider = autoUpdater,
    currentVersion = app.getVersion()
  ) {
    this.status = {
      state: "idle",
      currentVersion
    };
    this.provider.autoDownload = false;
    this.registerProviderEvents();
  }

  getStatus(): UpdateStatus {
    return { ...this.status };
  }

  onStatus(listener: UpdateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    if (this.checking) {
      return this.checking;
    }
    if (this.status.state === "checking" || this.status.state === "downloading") {
      return this.getStatus();
    }
    this.setStatus({ state: "checking" });
    this.checking = this.provider
      .checkForUpdates()
      .then(() => {
        if (this.status.state === "checking") {
          this.setStatus({ state: "update-not-available" });
        }
        return this.getStatus();
      })
      .catch((error: unknown) => {
        this.setStatus({
          state: "error",
          error: error instanceof Error ? error.message : "Update check failed."
        });
        return this.getStatus();
      })
      .finally(() => {
        this.checking = null;
      });
    return this.checking;
  }

  async downloadUpdate(): Promise<UpdateStatus> {
    if (this.downloading) {
      return this.downloading;
    }
    if (this.status.state !== "update-available") {
      this.setStatus({
        state: "error",
        error: "No update is available to download."
      });
      return this.getStatus();
    }
    this.setStatus({ state: "downloading" });
    this.downloading = this.provider
      .downloadUpdate()
      .then(() => this.getStatus())
      .catch((error: unknown) => {
        this.setStatus({
          state: "error",
          error: error instanceof Error ? error.message : "Update download failed."
        });
        return this.getStatus();
      })
      .finally(() => {
        this.downloading = null;
      });
    return this.downloading;
  }

  installDownloadedUpdate(): UpdateStatus {
    if (this.status.state !== "downloaded") {
      this.setStatus({
        state: "error",
        error: "No downloaded update is ready to install."
      });
      return this.getStatus();
    }
    if (!this.installing) {
      this.installing = true;
      this.provider.quitAndInstall(false, true);
    }
    return this.getStatus();
  }

  private registerProviderEvents(): void {
    this.provider.on("update-available", (info: UpdateInfo) => {
      this.setStatus({
        state: "update-available",
        availableVersion: typeof info.version === "string" ? info.version : undefined,
        message: "Update available."
      });
    });
    this.provider.on("update-not-available", () => {
      this.setStatus({
        state: "update-not-available",
        message: "Levi is up to date."
      });
    });
    this.provider.on("download-progress", (progress: ProgressInfo) => {
      this.setStatus({
        state: "downloading",
        progressPercent: clampProgress(progress.percent)
      });
    });
    this.provider.on("update-downloaded", (info: UpdateInfo) => {
      this.setStatus({
        state: "downloaded",
        availableVersion: typeof info.version === "string" ? info.version : this.status.availableVersion,
        progressPercent: 100,
        message: "Update downloaded. Install when ready."
      });
    });
    this.provider.on("error", (error: Error) => {
      this.setStatus({
        state: "error",
        error: error.message || "Update failed."
      });
    });
  }

  private setStatus(next: Partial<UpdateStatus> & { state: UpdateStatusState }): void {
    if (!isUpdateStatusState(next.state)) {
      throw new Error("Invalid update status.");
    }
    this.status = {
      currentVersion: this.status.currentVersion,
      availableVersion: next.availableVersion ?? (next.state === "idle" ? undefined : this.status.availableVersion),
      state: next.state,
      progressPercent: next.progressPercent,
      message: next.message,
      error: next.error
    };
    const status = this.getStatus();
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}

function clampProgress(percent: number): number {
  if (!Number.isFinite(percent)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(percent)));
}
