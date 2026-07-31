import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  BUILTIN_ADAPTER_REGISTRY,
  discoverAdapter,
  getAdapterDefinition,
  isVersionCompatible,
  parseVersionOutput,
  recommendAdapters,
  resolveConfigurationAdapterId,
  validateCustomAdapterDefinition,
  validateCustomAdapterFile,
  containsShellInjection,
  compareVersions
} from "../src/features/debugger/adapters";
import { sanitizeArchiveEntry, isArchiveSizeAllowed } from "../electron/main/adapter-installer";

describe("debug adapter registry", () => {
  it("includes allowlisted built-in adapters", () => {
    expect(BUILTIN_ADAPTER_REGISTRY.map((item) => item.id)).toEqual(["node", "python", "chrome", "custom"]);
  });

  it("discovers workspace js-debug adapters without shell execution", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-adapter-discover-"));
    const entry = "node_modules/@vscode/js-debug/src/dapDebugServer.js";
    await fs.mkdir(path.dirname(path.join(root, entry)), { recursive: true });
    await fs.writeFile(path.join(root, entry), "module.exports = {};\n", "utf8");
    const nodeExecutable = process.execPath;

    const discovery = await discoverAdapter(getAdapterDefinition("node")!, {
      workspaceRoot: root,
      leviAdapterRoot: path.join(root, ".adapters"),
      pathEntries: [path.dirname(nodeExecutable)],
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
    expect(discovery.source).toBe("workspace-dependency");
    expect(discovery.entryPath).toContain("dapDebugServer.js");
  });

  it("reports missing adapters with actionable state", async () => {
    const discovery = await discoverAdapter(getAdapterDefinition("python")!, {
      workspaceRoot: undefined,
      leviAdapterRoot: path.join(os.tmpdir(), "missing-adapters"),
      pathEntries: [],
      environment: {},
      platform: process.platform,
      fileExists: async () => false,
      readFile: async () => "",
      stat: async () => {
        throw new Error("missing");
      }
    });
    expect(discovery.state).toBe("missing");
  });

  it("validates versions and rejects incompatible adapters", () => {
    expect(isVersionCompatible("20.11.0", "18.0.0")).toBe(true);
    expect(isVersionCompatible("16.0.0", "18.0.0")).toBe(false);
    expect(compareVersions("18.10.0", "18.9.0")).toBeGreaterThan(0);
    expect(parseVersionOutput("Python 3.12.2")).toBe("3.12.2");
  });

  it("validates trusted custom adapter definitions and rejects shell injection", () => {
    expect(() =>
      validateCustomAdapterDefinition({
        id: "my-adapter",
        displayName: "Mine",
        executablePath: "C:\\\\adapters\\\\dap.exe",
        languages: ["typescript"],
        requestTypes: ["launch"]
      }).executablePath
    ).toBeTruthy();

    expect(() =>
      validateCustomAdapterDefinition({
        id: "bad id",
        displayName: "Bad",
        executablePath: "C:\\\\adapters\\\\dap.exe",
        languages: [],
        requestTypes: ["launch"]
      })
    ).toThrow();

    expect(containsShellInjection("node && rm -rf /")).toBe(true);
    expect(() =>
      validateCustomAdapterDefinition({
        id: "bad",
        displayName: "Bad",
        executablePath: "C:\\\\adapters\\\\dap.exe",
        args: ["--inspect", "&&", "calc.exe"],
        languages: [],
        requestTypes: ["launch"]
      })
    ).toThrow();
  });

  it("validates debug-adapters.json and resolves launch configuration adapter ids", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-custom-adapters-"));
    await fs.mkdir(path.join(root, ".levi"), { recursive: true });
    await fs.writeFile(
      path.join(root, ".levi", "debug-adapters.json"),
      JSON.stringify({
        adapters: [
          {
            id: "tools",
            displayName: "Tools Adapter",
            executablePath: "C:\\\\tools\\\\dap.exe",
            languages: ["typescript"],
            requestTypes: ["launch"]
          }
        ]
      }),
      "utf8"
    );
    const parsed = validateCustomAdapterFile(JSON.parse(await fs.readFile(path.join(root, ".levi", "debug-adapters.json"), "utf8")));
    expect(parsed[0].id).toBe("tools");
    expect(resolveConfigurationAdapterId({ type: "pwa-node" })).toBe("node");
  });

  it("recommends adapters from workspace files without installing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-adapter-rec-"));
    await fs.writeFile(path.join(root, "package.json"), "{}\n", "utf8");
    const recommendations = await recommendAdapters({
      workspaceRoot: root,
      dismissed: new Set(),
      fileExists: async (target) => {
        try {
          await fs.access(target);
          return true;
        } catch {
          return false;
        }
      }
    });
    expect(recommendations.some((item) => item.adapterId === "node")).toBe(true);
  });

  it("rejects archive traversal and oversized payloads", () => {
    expect(sanitizeArchiveEntry("../outside.txt")).toBeNull();
    expect(sanitizeArchiveEntry("adapter/bin/debug.js")).toBe("adapter\\bin\\debug.js");
    expect(isArchiveSizeAllowed(1024)).toBe(true);
    expect(isArchiveSizeAllowed(1024 * 1024 * 1024)).toBe(false);
    expect(sanitizeArchiveEntry("../escape.js")).toBeNull();
  });
});

describe("Run and Debug adapter UI state", () => {
  it("includes adapter arrays in debug state contract", async () => {
    const state = await window.levi.debug.getState();
    expect(Array.isArray(state.adapters)).toBe(true);
    expect(Array.isArray(state.adapterRecommendations)).toBe(true);
  });
});
