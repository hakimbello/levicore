import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { discoverAdapter, discoverJsDebugEntry } from "../electron/main/adapters";
import { getAdapterDefinition } from "../src/features/debugger/adapters";
import { AdapterManager } from "../electron/main/adapter-manager";
import { DesktopDebugService } from "../electron/main/debug-service";
import { encodeDapMessage } from "../src/features/debugger/DebugSession";
import { parseEnvFileContent, assertSafeRelativeEnvPath } from "../electron/main/env-file";
import { validateCompoundStart, runDebugTaskBoundary } from "../electron/main/debug-tasks";

const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "debug");

function hasRuntime(command: string, args: string[] = ["--version"]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

async function runDapHandshake(entryPath: string, nodeExecutable: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(nodeExecutable, [entryPath], { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("DAP initialize timed out."));
    }, 10000);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.includes('"event":"initialized"') || stdout.includes('"command":"initialize"')) {
        clearTimeout(timer);
        child.kill();
        resolve();
      }
    });
    child.on("error", reject);
    child.stdin.write(
      encodeDapMessage({
        seq: 1,
        type: "request",
        command: "initialize",
        arguments: { adapterID: "node", clientID: "levi", clientName: "Levi", pathFormat: "path", linesStartAt1: true, columnsStartAt1: true }
      })
    );
  });
}

describe("debug launch integration failures", () => {
  it("rejects invalid envFile paths", () => {
    expect(() => assertSafeRelativeEnvPath("../secrets.env")).toThrow(/workspace-relative/i);
  });

  it("rejects recursive compound configurations", () => {
    expect(() =>
      validateCompoundStart(
        { name: "Loop", configurations: ["Loop"] },
        [{ name: "Loop", configurations: ["Loop"] }]
      )
    ).toThrow(/recursive/i);
  });

  it("reports unsupported preLaunchTask diagnostics", async () => {
    const result = await runDebugTaskBoundary("build", "preLaunch");
    expect(result.supported).toBe(false);
    expect(result.message).toMatch(/task runner/i);
  });

  it("parses env files without exposing secrets in diagnostics output", () => {
    const parsed = parseEnvFileContent("# comment\nAPI_KEY=secret\nNAME=Levi\n");
    expect(parsed.API_KEY).toBe("secret");
    expect(parsed.NAME).toBe("Levi");
  });
});

describe("real adapter qualification", () => {
  let nodeAvailable = false;
  let pythonAvailable = false;

  beforeAll(async () => {
    nodeAvailable = await hasRuntime(process.platform === "win32" ? "node.exe" : "node");
    const pythonCommand = process.platform === "win32" ? "python.exe" : "python3";
    pythonAvailable = await hasRuntime(pythonCommand);
  });

  it("qualifies Node.js js-debug discovery and DAP initialize", async (ctx) => {
    if (!nodeAvailable) {
      ctx.skip();
      return;
    }
    const root = path.join(fixturesRoot, "node-js");
    const context = {
      workspaceRoot: root,
      leviAdapterRoot: path.join(root, ".adapters"),
      pathEntries: [path.dirname(process.execPath)],
      environment: process.env,
      platform: process.platform,
      fileExists: async (target: string) => {
        try {
          await fs.access(target);
          return true;
        } catch {
          return false;
        }
      },
      readFile: (target: string) => fs.readFile(target, "utf8"),
      stat: (target: string) => fs.stat(target)
    };
    const discovery = await discoverAdapter(getAdapterDefinition("node")!, context);
    expect(["installed", "missing"]).toContain(discovery.state);
    const entry = await discoverJsDebugEntry(context);
    if (!entry) {
      ctx.skip(true, "@vscode/js-debug is not installed in the Node fixture workspace or Levi-managed directory.");
      return;
    }
    await expect(runDapHandshake(entry, process.execPath)).resolves.toBeUndefined();
  });

  it("qualifies Python interpreter discovery for fixture workspace", async (ctx) => {
    if (!pythonAvailable) {
      ctx.skip();
      return;
    }
    const root = path.join(fixturesRoot, "python");
    const discovery = await discoverAdapter(getAdapterDefinition("python")!, {
      workspaceRoot: root,
      leviAdapterRoot: path.join(root, ".adapters"),
      pathEntries: (process.env.PATH ?? "").split(path.delimiter),
      environment: process.env,
      platform: process.platform,
      fileExists: async (target: string) => {
        try {
          await fs.access(target);
          return true;
        } catch {
          return false;
        }
      },
      readFile: (target: string) => fs.readFile(target, "utf8"),
      stat: (target: string) => fs.stat(target)
    });
    expect(discovery.state).toBe("installed");
    expect(discovery.executablePath).toBeTruthy();
  });

  it("blocks launch when js-debug entry point is missing", async (ctx) => {
    if (!nodeAvailable) {
      ctx.skip();
      return;
    }
    const root = await fs.mkdtemp(path.join(fixturesRoot, "missing-entry-"));
    const manager = new AdapterManager(() => root, { adapterRoot: path.join(root, "adapters") });
    const service = new DesktopDebugService(() => root, manager);
    await manager.initialize();
    const state = await service.start({
      configuration: { type: "node", request: "launch", name: "Missing Entry", program: "index.js" }
    });
    expect(state.error?.code).toMatch(/MISSING_ADAPTER|LAUNCH_FAILED/);
    expect(state.lastLaunchConfiguration?.name).toBe("Missing Entry");
  });
});

describe("debug session cleanup", () => {
  it("disposes adapter processes on stopAll", async () => {
    const root = await fs.mkdtemp(path.join(fixturesRoot, "cleanup-"));
    const manager = new AdapterManager(() => root, { adapterRoot: path.join(root, "adapters") });
    const service = new DesktopDebugService(() => root, manager);
    await manager.initialize();
    await service.dispose();
    const state = await service.getState();
    expect(state.sessions).toEqual([]);
    expect(state.state).toBe("Idle");
  });
});
