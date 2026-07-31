import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BreakpointManager, DebugSession, WatchStore, encodeDapMessage } from "../src/features/debugger";
import { validateDebugSetBreakpointRequest, validateDebugStartRequest } from "../electron/main/debug-service";
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
    await user.clear(within(launch).getByLabelText("Program"));
    await user.type(within(launch).getByLabelText("Program"), "src/main.ts");
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
