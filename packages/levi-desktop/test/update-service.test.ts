import { UpdateService } from "../electron/main/update-service";

type Listener = (...args: any[]) => void;

class MockUpdateProvider {
  autoDownload = true;
  checkForUpdates = vi.fn<() => Promise<unknown>>();
  downloadUpdate = vi.fn<() => Promise<unknown>>();
  quitAndInstall = vi.fn();
  private readonly listeners = new Map<string, Listener[]>();

  on(event: string, listener: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("UpdateService", () => {
  it("creates an idle update service without automatic downloads", () => {
    const provider = new MockUpdateProvider();
    const service = new UpdateService(provider as never, "0.1.0");

    expect(provider.autoDownload).toBe(false);
    expect(service.getStatus()).toEqual({
      state: "idle",
      currentVersion: "0.1.0"
    });
  });

  it("reports update available through provider events", async () => {
    const provider = new MockUpdateProvider();
    provider.checkForUpdates.mockImplementation(async () => {
      provider.emit("update-available", { version: "0.1.1" });
      return {};
    });
    const service = new UpdateService(provider as never, "0.1.0");

    await expect(service.checkForUpdates()).resolves.toMatchObject({
      state: "update-available",
      currentVersion: "0.1.0",
      availableVersion: "0.1.1"
    });
  });

  it("reports no update available through provider events", async () => {
    const provider = new MockUpdateProvider();
    provider.checkForUpdates.mockImplementation(async () => {
      provider.emit("update-not-available", { version: "0.1.0" });
      return {};
    });
    const service = new UpdateService(provider as never, "0.1.0");

    await expect(service.checkForUpdates()).resolves.toMatchObject({
      state: "update-not-available",
      currentVersion: "0.1.0",
      message: "Levi is up to date."
    });
  });

  it("prevents duplicate update checks while a check is active", async () => {
    const provider = new MockUpdateProvider();
    const check = deferred<unknown>();
    provider.checkForUpdates.mockReturnValue(check.promise);
    const service = new UpdateService(provider as never, "0.1.0");

    const first = service.checkForUpdates();
    const second = service.checkForUpdates();
    expect(provider.checkForUpdates).toHaveBeenCalledTimes(1);

    check.resolve({});
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ state: "update-not-available" }),
      expect.objectContaining({ state: "update-not-available" })
    ]);
  });

  it("reports update check failures without throwing to the renderer", async () => {
    const provider = new MockUpdateProvider();
    provider.checkForUpdates.mockRejectedValue(new Error("feed unavailable"));
    const service = new UpdateService(provider as never, "0.1.0");

    await expect(service.checkForUpdates()).resolves.toMatchObject({
      state: "error",
      currentVersion: "0.1.0",
      error: "feed unavailable"
    });
  });

  it("downloads an available update and requires explicit install approval", async () => {
    const provider = new MockUpdateProvider();
    provider.checkForUpdates.mockImplementation(async () => {
      provider.emit("update-available", { version: "0.1.1" });
      return {};
    });
    provider.downloadUpdate.mockImplementation(async () => {
      provider.emit("download-progress", { percent: 48 });
      provider.emit("update-downloaded", { version: "0.1.1" });
      return [];
    });
    const service = new UpdateService(provider as never, "0.1.0");

    await service.checkForUpdates();
    await expect(service.downloadUpdate()).resolves.toMatchObject({
      state: "downloaded",
      currentVersion: "0.1.0",
      availableVersion: "0.1.1",
      progressPercent: 100
    });
    expect(provider.quitAndInstall).not.toHaveBeenCalled();

    expect(service.installDownloadedUpdate()).toMatchObject({ state: "downloaded" });
    expect(provider.quitAndInstall).toHaveBeenCalledWith(false, true);
  });
});
