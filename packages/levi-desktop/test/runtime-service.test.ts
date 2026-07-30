import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DesktopRuntimeService } from "../electron/main/runtime-service";

const packageRoot = path.resolve(__dirname, "..");

type FakeCall = {
  commandId: string;
  input: unknown;
};

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(packageRoot, relativePath), "utf8");
}

function createRuntimeFake(options: { failWorkspaceOpen?: boolean } = {}) {
  const calls: FakeCall[] = [];
  return {
    calls,
    runtime: {
      initialize: async () => ({ success: true, data: { runtimeState: "READY" } }),
      getState: () => ({ state: "READY" }),
      executeCommand: async (commandId: string, input: unknown) => {
        calls.push({ commandId, input });
        if (commandId === "runtime.health") {
          return { success: true, data: { overallRuntimeHealth: 100 } };
        }
        if (commandId === "workspace.open" && options.failWorkspaceOpen) {
          return { success: false, error: { message: "Runtime workspace open failed." } };
        }
        if (commandId === "workspace.open") {
          return { success: true, data: { id: "workspace-1" } };
        }
        if (commandId === "workspace.refresh") {
          return { success: true, data: { id: "workspace-1" } };
        }
        throw new Error(`Unexpected command ${commandId}`);
      },
      shutdown: async () => ({ success: true })
    }
  };
}

describe("desktop runtime service boundary", () => {
  it("routes runtime communication through the main-process service boundary", async () => {
    const fake = createRuntimeFake();
    const service = new DesktopRuntimeService({
      repositoryRoot: "C:\\LeviCore",
      runtimeFactory: () => fake.runtime
    });

    const status = await service.syncWorkspace({ path: "C:\\Project", name: "Project" });

    expect(status).toMatchObject({
      state: "ready",
      runtimeState: "READY",
      overallRuntimeHealth: 100,
      workspaceId: "workspace-1"
    });
    expect(fake.calls.map((call) => call.commandId)).toEqual(["runtime.health", "workspace.open"]);
    expect(fake.calls[1].input).toMatchObject({
      uri: "C:\\Project",
      rootPath: "C:\\Project",
      name: "Project"
    });
  });

  it("handles runtime IPC-backed workspace failures without throwing", async () => {
    const fake = createRuntimeFake({ failWorkspaceOpen: true });
    const service = new DesktopRuntimeService({
      repositoryRoot: "C:\\LeviCore",
      runtimeFactory: () => fake.runtime
    });

    await expect(service.syncWorkspace({ path: "C:\\Project", name: "Project" })).resolves.toMatchObject({
      state: "failed",
      error: "Runtime workspace open failed."
    });
  });

  it("returns runtime state through existing workspace IPC instead of a duplicate renderer API", () => {
    const mainSource = readSource("electron/main/index.ts");
    const preloadSource = readSource("electron/preload/index.ts");
    const typeSource = readSource("src/types/levi-api.ts");

    expect(mainSource).toContain("ipcMain.handle(IPC_CHANNELS.workspaceGetStatus, () => withRuntimeStatus(workspaceStatus))");
    expect(mainSource).toContain("desktopRuntimeService.syncWorkspace");
    expect(preloadSource).toContain("getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.workspaceGetStatus)");
    expect(preloadSource).not.toContain("runtime: {");
    expect(typeSource).toContain("runtime?: RuntimeConnectionStatus");
  });
});
