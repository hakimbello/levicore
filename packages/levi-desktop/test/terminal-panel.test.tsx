import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BottomPanel } from "../src/features/terminal/BottomPanel";

vi.mock("@xterm/xterm", () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    cols: 96,
    rows: 10,
    loadAddon: vi.fn(),
    open: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onSelectionChange: vi.fn(() => ({ dispose: vi.fn() })),
    attachCustomKeyEventHandler: vi.fn(),
    dispose: vi.fn(),
    write: vi.fn(),
    getSelection: vi.fn(() => ""),
    hasSelection: vi.fn(() => false),
    clearSelection: vi.fn(),
    scrollToLine: vi.fn(),
    select: vi.fn(),
    buffer: { active: { length: 0, getLine: vi.fn() } }
  }))
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn()
  }))
}));

describe("BottomPanel renderer integration", () => {
  it("restores layout and creates a terminal session when shown", async () => {
    const user = userEvent.setup();
    render(
      <BottomPanel
        selectedProject={{ path: "C:\\Users\\developer\\Project", name: "Project" }}
        debugConsole={[]}
        onEvaluateDebug={vi.fn(async () => undefined)}
        onClearDebugConsole={vi.fn(async () => undefined)}
      />
    );

    await waitFor(() => expect(window.levi.terminal.getLayout).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Show" }));

    await waitFor(() =>
      expect(window.levi.terminal.create).toHaveBeenCalledWith(
        expect.objectContaining({ cols: 96, rows: 10, cwd: "C:\\Users\\developer\\Project" })
      )
    );
  });

  it("switches to the debug console tab", async () => {
    const user = userEvent.setup();
    render(
      <BottomPanel
        selectedProject={null}
        debugConsole={[{ id: "1", timestamp: "now", category: "stdout", output: "hello" }]}
        onEvaluateDebug={vi.fn(async () => undefined)}
        onClearDebugConsole={vi.fn(async () => undefined)}
      />
    );

    await waitFor(() => expect(window.levi.terminal.getLayout).toHaveBeenCalled());
    await user.click(screen.getByRole("tab", { name: "Debug Console" }));
    expect(screen.getByText("hello")).toBeInTheDocument();
  });
});
