import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverAdapter, getAdapterDefinition } from "../electron/main/adapters";
import { AdapterManager } from "../electron/main/adapter-manager";
import {
  AdapterInstallCancelledError,
  installAdapterOption,
  verifyAdapterChecksum
} from "../electron/main/adapter-installer";
import { DesktopDebugService } from "../electron/main/debug-service";

describe("AdapterManager", () => {
  it("discovers python executables from PATH entries without shell execution", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-adapter-path-"));
    const binDir = path.join(root, "bin");
    await fs.mkdir(binDir, { recursive: true });
    const pythonExecutable = path.join(binDir, process.platform === "win32" ? "python.exe" : "python");
    await fs.writeFile(pythonExecutable, "", "utf8");

    const discovery = await discoverAdapter(getAdapterDefinition("python")!, {
      workspaceRoot: undefined,
      leviAdapterRoot: path.join(root, "adapters"),
      pathEntries: [binDir],
      environment: {},
      platform: process.platform,
      fileExists: async (target) => {
        try {
          await fs.access(target);
          return true;
        } catch {
          return false;
        }
      },
      readFile: (target) => fs.readFile(target, "utf8"),
      stat: (target) => fs.stat(target)
    });

    expect(discovery.state).toBe("installed");
    expect(discovery.source).toBe("path");
    expect(discovery.executablePath).toBe(pythonExecutable);
  });

  it("requires explicit trust confirmation for custom adapters", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-adapter-trust-"));
    const manager = new AdapterManager(() => root, { adapterRoot: path.join(root, "adapters") });
    await manager.initialize();

    await expect(
      manager.registerTrustedCustomAdapter({
        adapter: {
          id: "tools",
          displayName: "Tools",
          executablePath: path.join(root, "tools-dap.exe"),
          languages: ["typescript"],
          requestTypes: ["launch"]
        },
        confirmed: false
      })
    ).rejects.toThrow(/trust confirmation/i);
  });

  it("blocks launch when the adapter is missing and preserves the launch configuration", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-adapter-launch-"));
    const manager = new AdapterManager(() => root, { adapterRoot: path.join(root, "adapters") });
    const service = new DesktopDebugService(() => root, manager);
    await manager.initialize();

    const configuration = { type: "node", request: "launch" as const, name: "Node Launch", program: "src/main.ts" };
    const state = await service.start({ configuration });

    expect(state.error?.code).toBe("MISSING_ADAPTER");
    expect(state.launchAdapterDiagnostic?.adapterId).toBe("node");
    expect(state.launchAdapterDiagnostic?.action).toMatch(/install|configure|update/);
    expect(state.lastLaunchConfiguration).toMatchObject({ program: "src/main.ts" });
  });
});

describe("adapter installer security", () => {
  it("rejects checksum mismatches", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-adapter-checksum-"));
    const filePath = path.join(root, "adapter.js");
    await fs.writeFile(filePath, "console.log('adapter');\n", "utf8");

    await expect(verifyAdapterChecksum(filePath, "0".repeat(64))).rejects.toThrow(/checksum mismatch/i);
  });

  it("cleans up partial installs after cancellation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-adapter-cancel-"));
    const node = getAdapterDefinition("node");
    const option = node?.installationOptions[0];
    if (!option) throw new Error("Node installation option missing.");

    await expect(
      installAdapterOption({
        adapterId: "node",
        option,
        installRoot: path.join(root, "managed"),
        nodeExecutable: process.execPath,
        npmExecutable: process.platform === "win32" ? "npm.cmd" : "npm",
        onProgress: () => undefined,
        isCancelled: () => true
      })
    ).rejects.toBeInstanceOf(AdapterInstallCancelledError);

    const managedRoot = path.join(root, "managed", "node");
    const entries = await fs.readdir(managedRoot).catch(() => []);
    expect(entries.some((entry) => entry.includes(".tmp-"))).toBe(false);
  });
});
