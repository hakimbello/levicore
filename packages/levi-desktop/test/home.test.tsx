import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/app/App";
import type { ExecutionPublicTransaction } from "../src/types/levi-api";

const lazySurfaceWait = { timeout: 5000 };

vi.mock("@xterm/xterm", () => {
  class MockTerminal {
    cols = 96;
    rows = 10;
    loadAddon = vi.fn();
    open = vi.fn();
    write = vi.fn();
    dispose = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    onSelectionChange = vi.fn(() => ({ dispose: vi.fn() }));
    attachCustomKeyEventHandler = vi.fn();
    getSelection = vi.fn(() => "");
    hasSelection = vi.fn(() => false);
    clearSelection = vi.fn();
    scrollToLine = vi.fn();
    select = vi.fn();
    buffer = { active: { length: 0, getLine: vi.fn() } };
  }
  return { Terminal: MockTerminal };
});

vi.mock("@xterm/addon-fit", () => {
  class MockFitAddon {
    fit = vi.fn();
  }
  return { FitAddon: MockFitAddon };
});

async function waitForInitialBridge() {
  await waitFor(() => expect(window.levi.ollama.getStatus).toHaveBeenCalled());
}

function historyTransaction(): ExecutionPublicTransaction {
  return {
    transactionId: "history-tx-1",
    planId: "plan-1",
    goal: "Update server timeout",
    workspaceRootPath: "C:\\Users\\LeviUser\\Project",
    scanTimestamp: "2026-07-29T00:00:00.000Z",
    status: "kept",
    steps: [
      {
        stepIndex: 0,
        planStepId: "1:0",
        planStepOrder: 1,
        planStepTitle: "Update implementation",
        relativePath: "src/main.ts",
        status: "applied"
      }
    ],
    currentStepIndex: 0,
    appliedProjectRules: [],
    ruleConflicts: [],
    unsupportedOperations: { creates: [], deletes: [] },
    validationCommands: ["npm test"],
    aggregateReview: {
      files: [
        {
          relativePath: "src/main.ts",
          addedLineCount: 1,
          removedLineCount: 1,
          diff: [],
          validationStatus: "passed"
        }
      ],
      totalAdded: 1,
      totalRemoved: 1,
      validationCommands: ["npm test"],
      commandsNotRun: true
    },
    createdAt: "2026-07-29T12:00:00.000Z",
    completedAt: "2026-07-29T12:02:00.000Z",
    totals: { stepCount: 1, appliedCount: 1, pendingCount: 0 }
  };
}

describe("Levi desktop Home", () => {
  it("renders only the approved four-item sidebar navigation", async () => {
    render(<App />);

    const nav = screen.getByRole("navigation", { name: "Primary" });
    const buttons = within(nav).getAllByRole("button");

    expect(buttons).toHaveLength(4);
    expect(buttons.map((button) => button.textContent)).toEqual(["New Chat", "Projects", "History", "Settings"]);
    await waitForInitialBridge();
    expect(screen.getByText("Local AI")).toBeInTheDocument();
  });

  it("renders one primary Home composer and hides secondary panels by default", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "What do you want to build?" })).toBeInTheDocument();
    const prompt = screen.getByRole("textbox", { name: "Prompt" });
    expect(prompt).toHaveAttribute(
      "placeholder",
      "Ask Levi to explain, inspect, or safely propose a one-file change."
    );
    expect(screen.getAllByRole("textbox")).toEqual([prompt]);
    expect(screen.queryByRole("complementary", { name: "AI Chat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Debug toolbar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "New terminal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Maximize panel" })).not.toBeInTheDocument();
    await waitForInitialBridge();
  });

  it("keeps Home context choices behind Add context", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByRole("button", { name: "Current file" })).not.toBeInTheDocument();
    await user.click(screen.getByText("Add context"));

    expect(screen.getByRole("button", { name: "Current file" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Selected code" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Project Rules" }).length).toBeGreaterThan(1);
    expect(screen.getByRole("button", { name: "Image" })).toBeInTheDocument();
    await waitForInitialBridge();
  });

  it("toggles the right AI panel only from workspace", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByRole("button", { name: "Open AI panel" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Explorer" }));
    await user.click(await screen.findByRole("button", { name: "Open AI panel" }));

    expect(await screen.findByRole("complementary", { name: "AI Chat" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close AI panel" }));
    expect(screen.queryByRole("complementary", { name: "AI Chat" })).not.toBeInTheDocument();
    await waitForInitialBridge();
  });

  it("keeps activity bar and sidebar controls in keyboard order", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.tab();
    expect(screen.getByRole("button", { name: "Explorer" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Levi AI" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Search" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Run and Debug" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Tasks" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Source Control" })).toHaveFocus();
    await waitForInitialBridge();
  });

  it("opens Settings diagnostics from the existing sidebar item", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitForInitialBridge();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    await user.click(within(nav).getByRole("button", { name: "Settings" }));

    expect(await screen.findByRole("region", { name: "Settings" }, lazySurfaceWait)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Provider diagnostics" })).toBeInTheDocument();
    expect(screen.getByText("qwen3.6:latest, qwen2.5-coder:7b")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "What do you want to build?" })).not.toBeInTheDocument();
  });

  it("checks for updates through Settings IPC", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitForInitialBridge();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    await user.click(within(nav).getByRole("button", { name: "Settings" }));

    expect(await screen.findByRole("region", { name: "Update diagnostics" }, lazySurfaceWait)).toBeInTheDocument();
    expect(screen.getByText("0.1.0")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check for Updates" }));

    await waitFor(() => expect(window.levi.updates.checkForUpdates).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Up to date")).toBeInTheDocument();
  });

  it("renders update availability, download progress, and explicit install approval", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitForInitialBridge();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    await user.click(within(nav).getByRole("button", { name: "Settings" }));
    await screen.findByRole("region", { name: "Update diagnostics" }, lazySurfaceWait);

    act(() => {
      for (const listener of window.__leviUpdateListeners) {
        listener({
          type: "status",
          status: {
            state: "update-available",
            currentVersion: "0.1.0",
            availableVersion: "0.1.1"
          }
        });
      }
    });
    expect(await screen.findByText("Update available")).toBeInTheDocument();
    expect(screen.getByText("Version 0.1.1 is available.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Download Update" }));
    await waitFor(() => expect(window.levi.updates.downloadUpdate).toHaveBeenCalledTimes(1));

    act(() => {
      for (const listener of window.__leviUpdateListeners) {
        listener({
          type: "status",
          status: {
            state: "downloaded",
            currentVersion: "0.1.0",
            availableVersion: "0.1.1",
            progressPercent: 100
          }
        });
      }
    });
    expect(await screen.findByText("Downloaded")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Install Update" }));

    await waitFor(() => expect(window.levi.updates.installDownloadedUpdate).toHaveBeenCalledTimes(1));
  });

  it("opens History from the existing sidebar item with an empty state", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitForInitialBridge();
    await user.click(screen.getByRole("button", { name: "History" }));

    expect(await screen.findByRole("region", { name: "History" }, lazySurfaceWait)).toBeInTheDocument();
    expect(screen.getByText("No execution history yet. Approved execution transactions will appear here during this session.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "What do you want to build?" })).not.toBeInTheDocument();
  });

  it("renders existing execution entries in History", async () => {
    vi.mocked(window.levi.execution.getStatus).mockResolvedValue({
      activeTransaction: historyTransaction(),
      route: {
        stepGeneration: "qwen2.5-coder:7b"
      }
    });
    const user = userEvent.setup();
    render(<App />);

    await waitForInitialBridge();
    await user.click(screen.getByRole("button", { name: "History" }));

    expect(await screen.findByRole("region", { name: "History" }, lazySurfaceWait)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Update server timeout" })).toBeInTheDocument();
    expect(screen.getByText("src/main.ts")).toBeInTheDocument();
    expect(screen.getByText("kept")).toBeInTheDocument();
    expect(screen.getByText("1/1 files applied")).toBeInTheDocument();
  });

  it("does not render example prompts", async () => {
    render(<App />);

    expect(screen.queryByText(/example/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/try/i)).not.toBeInTheDocument();
    await waitForInitialBridge();
  });

  it("does not render disallowed navigation", async () => {
    render(<App />);

    expect(screen.queryByText("Agents")).not.toBeInTheDocument();
    expect(screen.queryByText("Automations")).not.toBeInTheDocument();
    expect(screen.queryByText("Marketplace")).not.toBeInTheDocument();
    expect(screen.queryByText("Developer Tools")).not.toBeInTheDocument();
    await waitForInitialBridge();
  });

  it("obtains Ollama status through the preload bridge", async () => {
    render(<App />);

    await waitFor(() => expect(window.levi.ollama.getStatus).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("http://127.0.0.1")).not.toBeInTheDocument();
  });

  it("updates selected-project state when opening a project", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Projects" }));

    await waitFor(() => expect(window.levi.projects.openFolder).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText("Project").length).toBeGreaterThan(0);
  });

  it("creates terminal sessions through IPC exposed by preload", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(window.levi.terminal.getLayout).toHaveBeenCalled());
    await screen.findByRole("tab", { name: "Terminal" });
    await user.click(screen.getByRole("button", { name: "Show" }));

    await waitFor(() =>
      expect(window.levi.terminal.create).toHaveBeenCalledWith(
        expect.objectContaining({ cols: 96, rows: 10, cwd: expect.any(String) })
      )
    );
  });
});
