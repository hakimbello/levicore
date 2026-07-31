import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BreakpointManager, DebugService, DebugSession, EvaluationCache, VariableStore, WatchStore, encodeDapMessage } from "../src/features/debugger";
import { DesktopDebugService, validateDebugSetBreakpointRequest, validateDebugStartRequest } from "../electron/main/debug-service";
import { AdapterManager } from "../electron/main/adapter-manager";
import { truncateValue, MAX_VARIABLE_CHILDREN } from "../src/features/debugger/variableLimits";
import { App } from "../src/app/App";

vi.mock("@xterm/xterm", () => {
  class MockTerminal {
    cols = 96;
    rows = 10;
    loadAddon = vi.fn();
    open = vi.fn();
    write = vi.fn();
    dispose = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
  }
  return { Terminal: MockTerminal };
});

vi.mock("@xterm/addon-fit", () => {
  class MockFitAddon {
    fit = vi.fn();
  }
  return { FitAddon: MockFitAddon };
});

describe("DAP debugger foundation", () => {
  it("encodes requests and resolves DAP responses without blocking the renderer contract", async () => {
    let dataListener: ((data: string) => void) | undefined;
    const writes: string[] = [];
    const session = new DebugSession("debug-session-1", "Launch", {
      write: (message) => {
        writes.push(message);
      },
      onData: (listener) => {
        dataListener = listener;
        return () => undefined;
      },
      dispose: vi.fn()
    });

    const request = session.request("initialize", { adapterID: "node" });
    expect(writes[0]).toContain("Content-Length:");
    expect(writes[0]).toContain('"command":"initialize"');

    dataListener?.(
      encodeDapMessage({
        seq: 1,
        type: "response",
        request_seq: 1,
        command: "initialize",
        success: true,
        body: { supportsConfigurationDoneRequest: true }
      })
    );

    await expect(request).resolves.toEqual({ supportsConfigurationDoneRequest: true });
  });

  it("stores toggleable conditional breakpoints and watch expressions", () => {
    const breakpoints = new BreakpointManager();
    const breakpoint = breakpoints.set({
      relativePath: "src/main.ts",
      line: 12,
      condition: "count > 3",
      logMessage: "count changed"
    });

    expect(breakpoints.list()).toHaveLength(1);
    expect(breakpoint.condition).toBe("count > 3");
    breakpoints.setEnabled(breakpoint.id, false);
    expect(breakpoints.list()[0].enabled).toBe(false);
    expect(breakpoints.toggle({ relativePath: "src/main.ts", line: 12 })).toBeNull();
    expect(breakpoints.list()).toHaveLength(0);

    const watches = new WatchStore();
    const watch = watches.add("count");
    watches.setValue(watch.id, "4");
    expect(watches.list()[0]).toMatchObject({ expression: "count", value: "4" });

    const variables = new VariableStore();
    variables.replaceScopes([{ name: "Local", variablesReference: 1, expensive: false, variables: [{ name: "obj", value: "{...}", variablesReference: 2 }] }]);
    variables.setExpanded(2, [{ name: "child", value: "1" }]);
    expect(variables.list()[0].variables[0]).toMatchObject({ expanded: true, children: [{ name: "child", value: "1" }] });
    variables.collapseVariables(2);
    expect(variables.list()[0].variables[0]).toMatchObject({ expanded: false, children: [] });
  });

  it("validates debug IPC requests as workspace-relative and adapter-id based", () => {
    expect(() =>
      validateDebugStartRequest({
        configuration: {
          type: "node",
          request: "launch",
          name: "Launch",
          program: "../outside.js"
        }
      })
    ).toThrow(/inside the workspace/);

    expect(() =>
      validateDebugSetBreakpointRequest({
        relativePath: "C:\\outside\\main.ts",
        line: 1
      })
    ).toThrow(/workspace/);

    expect(
      validateDebugStartRequest({
        configuration: {
          type: "node",
          request: "launch",
          name: "Launch",
          adapterId: "node",
          program: "src/main.ts",
          args: ["--inspect"]
        }
      }).configuration
    ).toMatchObject({ type: "node", program: "src/main.ts", args: ["--inspect"] });
  });

  it("hydrates threads, stack frames, scopes, variables, watches, and console output from DAP", async () => {
    let dataListener: ((data: string) => void) | undefined;
    let responseSeq = 100;
    const service = new DebugService({
      createAdapter: async () => ({
        onData: (listener) => {
          dataListener = listener;
          return () => undefined;
        },
        write: (message) => {
          const payload = JSON.parse(message.slice(message.indexOf("\r\n\r\n") + 4)) as { seq: number; command: string };
          const bodies: Record<string, unknown> = {
            initialize: {},
            launch: {},
            configurationDone: {},
            threads: { threads: [{ id: 7, name: "Main Thread" }] },
            stackTrace: {
              stackFrames: [
                {
                  id: 42,
                  name: "main",
                  source: { path: "C:/repo/src/main.ts", name: "main.ts" },
                  line: 12,
                  column: 3
                }
              ]
            },
            scopes: { scopes: [{ name: "Local", variablesReference: 8, expensive: false }] },
            variables: { variables: [{ name: "count", value: "4", type: "number", variablesReference: 0 }] },
            evaluate: { result: "4" },
            setBreakpoints: { breakpoints: [{ line: 12, verified: true }] },
            loadedSources: { sources: [{ name: "main.ts", path: "C:/repo/src/main.ts" }] }
          };
          dataListener?.(
            encodeDapMessage({
              seq: responseSeq++,
              type: "response",
              request_seq: payload.seq,
              command: payload.command,
              success: true,
              body: bodies[payload.command] ?? {}
            })
          );
        },
        dispose: vi.fn()
      }),
      resolveSourcePath: (relativePath) => `C:/repo/${relativePath}`,
      relativizeSourcePath: (sourcePath) => sourcePath.replace("C:/repo/", "")
    });
    await service.addWatch("count");
    await service.start({ type: "node", request: "launch", name: "Node Launch", program: "src/main.ts" });

    dataListener?.(
      encodeDapMessage({
        seq: responseSeq++,
        type: "event",
        event: "stopped",
        body: { threadId: 7, reason: "breakpoint" }
      })
    );
    dataListener?.(
      encodeDapMessage({
        seq: responseSeq++,
        type: "event",
        event: "output",
        body: { category: "stdout", output: "hello\n" }
      })
    );

    await waitFor(() => expect(service.snapshot().activeStackFrame?.relativePath).toBe("src/main.ts"));
    expect(service.snapshot().variables[0]).toMatchObject({ name: "Local", variables: [{ name: "count", value: "4" }] });
    expect(service.snapshot().watches[0]).toMatchObject({ expression: "count", value: "4" });
    expect(service.snapshot().console[0]).toMatchObject({ category: "stdout", output: "hello\n" });
  });

  it("creates and loads workspace launch.json configurations with VS Code-compatible names", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "levi-debug-launch-"));
    const adapterManager = new AdapterManager(() => root, { adapterRoot: path.join(root, "adapters") });
    const service = new DesktopDebugService(() => root, adapterManager);
    await adapterManager.initialize();

    const state = await service.getState();

    expect(state.launchConfigurations.map((entry) => entry.name)).toEqual(
      expect.arrayContaining(["Node Launch", "Node Attach", "Python Launch", "Chrome Attach"])
    );
    await expect(fs.readFile(path.join(root, ".levi", "launch.json"), "utf8")).resolves.toContain("Node Launch");

    const vscodeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "levi-debug-vscode-launch-"));
    await fs.mkdir(path.join(vscodeRoot, ".vscode"), { recursive: true });
    await fs.writeFile(
      path.join(vscodeRoot, ".vscode", "launch.json"),
      JSON.stringify({ version: "0.2.0", configurations: [{ type: "node", request: "launch", name: "Workspace App", program: "${workspaceFolder}/app.js" }] }),
      "utf8"
    );
    const vscodeService = new DesktopDebugService(() => vscodeRoot, new AdapterManager(() => vscodeRoot, { adapterRoot: path.join(vscodeRoot, "adapters") }));
    await vscodeService.initializeAdapters();
    const vscodeState = await vscodeService.getState();

    expect(vscodeState.launchConfigurations[0]).toMatchObject({ name: "Workspace App", source: ".vscode/launch.json" });
  });

  it("caches evaluations and exposes structured hover results without duplicate adapter calls", async () => {
    let evaluateCalls = 0;
    let dataListener: ((data: string) => void) | undefined;
    let responseSeq = 200;
    const service = new DebugService({
      createAdapter: async () => ({
        onData: (listener) => {
          dataListener = listener;
          return () => undefined;
        },
        write: (message) => {
          const payload = JSON.parse(message.slice(message.indexOf("\r\n\r\n") + 4)) as { seq: number; command: string; arguments?: { expression?: string } };
          if (payload.command === "evaluate") evaluateCalls += 1;
          const bodies: Record<string, unknown> = {
            initialize: {},
            launch: {},
            configurationDone: {},
            setBreakpoints: { breakpoints: [] },
            setExceptionBreakpoints: {},
            evaluate: { result: "42", type: "number", variablesReference: 0 }
          };
          dataListener?.(
            encodeDapMessage({
              seq: responseSeq++,
              type: "response",
              request_seq: payload.seq,
              command: payload.command,
              success: true,
              body: bodies[payload.command] ?? {}
            })
          );
        },
        dispose: vi.fn()
      }),
      resolveSourcePath: (relativePath) => `C:/repo/${relativePath}`,
      relativizeSourcePath: (sourcePath) => sourcePath.replace("C:/repo/", "")
    });

    await service.start({ type: "node", request: "launch", name: "Node Launch", program: "src/main.ts" });
    await service.evaluateExpression("count", "hover", 1);
    await service.evaluateExpression("count", "hover", 1);

    expect(evaluateCalls).toBe(1);
    expect(service.snapshot().lastEvaluation).toMatchObject({ expression: "count", result: "42", type: "number", cached: true });
    expect(service.snapshot().evaluationCache).toHaveLength(1);
  });

  it("limits variable payloads and truncates oversized values", () => {
    expect(truncateValue("x".repeat(5000)).endsWith("…")).toBe(true);
    const cache = new EvaluationCache();
    cache.set("k", "expr", "repl", 1, { expression: "expr", result: "1" });
    expect(cache.get("k")).toMatchObject({ result: "1" });
    expect(cache.list()).toHaveLength(1);
  });

  it("parses exception stops and refreshes inline values from scopes", async () => {
    let dataListener: ((data: string) => void) | undefined;
    let responseSeq = 300;
    const service = new DebugService({
      createAdapter: async () => ({
        onData: (listener) => {
          dataListener = listener;
          return () => undefined;
        },
        write: (message) => {
          const payload = JSON.parse(message.slice(message.indexOf("\r\n\r\n") + 4)) as { seq: number; command: string };
          const bodies: Record<string, unknown> = {
            initialize: {},
            launch: {},
            configurationDone: {},
            setBreakpoints: { breakpoints: [] },
            setExceptionBreakpoints: {},
            threads: { threads: [{ id: 1, name: "Main" }] },
            stackTrace: { stackFrames: [{ id: 2, name: "main", source: { path: "C:/repo/src/main.ts" }, line: 8 }] },
            scopes: { scopes: [{ name: "Local", variablesReference: 3, expensive: false }] },
            variables: { variables: [{ name: "count", value: "42", type: "number", variablesReference: 0 }] },
            loadedSources: { sources: [] }
          };
          dataListener?.(
            encodeDapMessage({
              seq: responseSeq++,
              type: "response",
              request_seq: payload.seq,
              command: payload.command,
              success: true,
              body: bodies[payload.command] ?? {}
            })
          );
        },
        dispose: vi.fn()
      }),
      resolveSourcePath: (relativePath) => `C:/repo/${relativePath}`,
      relativizeSourcePath: (sourcePath) => sourcePath.replace("C:/repo/", "")
    });

    await service.start({ type: "node", request: "launch", name: "Node Launch", program: "src/main.ts" });
    dataListener?.(
      encodeDapMessage({
        seq: responseSeq++,
        type: "event",
        event: "stopped",
        body: { threadId: 1, reason: "exception", text: "Error: boom", description: "Error" }
      })
    );

    await waitFor(() => expect(service.snapshot().exceptionInfo?.message).toBe("Error: boom"));
    expect(service.snapshot().inlineValues).toEqual([{ name: "count", value: "42" }]);
    expect(service.snapshot().variables[0]?.variables.length).toBeLessThanOrEqual(MAX_VARIABLE_CHILDREN);
  });
});

describe("Run and Debug view", () => {
  it("starts debug sessions, toggles breakpoints, and manages watches through typed IPC", async () => {
    const user = userEvent.setup();
    vi.mocked(window.levi.projects.getRecent).mockResolvedValue({
      path: "C:\\Users\\developer\\Project",
      name: "Project"
    });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Run and Debug" }));
    expect(await screen.findByRole("region", { name: "Run and Debug" })).toBeInTheDocument();

    const launch = screen.getByRole("region", { name: "Launch configuration" });
    const programInput = within(launch).getByLabelText("Program");
    await waitFor(() => expect(programInput).toHaveValue("src/main.ts"));
    await user.clear(programInput);
    await user.type(programInput, "src/main.ts");
    await user.click(within(launch).getByRole("button", { name: "Start Debugging" }));
    await waitFor(() =>
      expect(window.levi.debug.start).toHaveBeenCalledWith({
        configuration: expect.objectContaining({
          type: "node",
          request: "launch",
          program: "src/main.ts"
        })
      })
    );

    const breakpoints = screen.getByRole("region", { name: "Breakpoints" });
    await user.type(within(breakpoints).getByLabelText("Path"), "src/main.ts");
    await user.clear(within(breakpoints).getByLabelText("Line"));
    await user.type(within(breakpoints).getByLabelText("Line"), "12");
    await user.type(within(breakpoints).getByLabelText("Condition"), "count > 3");
    await user.click(within(breakpoints).getByRole("button", { name: "Toggle Breakpoint" }));
    await waitFor(() =>
      expect(window.levi.debug.setBreakpoint).toHaveBeenCalledWith(
        expect.objectContaining({ relativePath: "src/main.ts", line: 12, condition: "count > 3", toggle: true })
      )
    );

    const watch = screen.getByRole("region", { name: "Watch" });
    await user.type(within(watch).getByPlaceholderText("expression"), "count");
    await user.click(within(watch).getByRole("button", { name: "Add Watch" }));
    await waitFor(() => expect(window.levi.debug.addWatch).toHaveBeenCalledWith("count"));
  });
});
