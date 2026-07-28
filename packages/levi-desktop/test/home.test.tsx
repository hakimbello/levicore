import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

async function waitForInitialBridge() {
  await waitFor(() => expect(window.levi.ollama.getStatus).toHaveBeenCalled());
}

describe("Levi desktop Home", () => {
  it("renders only the approved four-item sidebar navigation", async () => {
    render(<App />);

    const nav = screen.getByRole("navigation", { name: "Primary" });
    const buttons = within(nav).getAllByRole("button");

    expect(buttons).toHaveLength(4);
    expect(buttons.map((button) => button.textContent)).toEqual(["New Chat", "Projects", "History", "Settings"]);
    await waitFor(() => expect(screen.getByText("Local AI Ready")).toBeInTheDocument());
    expect(screen.getByText("2 models available")).toBeInTheDocument();
  });

  it("renders the main prompt textbox", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "What do you want to build?" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Prompt" })).toHaveAttribute(
      "placeholder",
      "Ask Levi to explain, inspect, or safely propose a one-file change."
    );
    await waitForInitialBridge();
  });

  it("keeps sidebar and prompt controls in keyboard order", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.tab();
    expect(screen.getByRole("button", { name: "New Chat" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Projects" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "History" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Settings" })).toHaveFocus();
    await waitForInitialBridge();
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

    await user.click(screen.getByRole("button", { name: "Expand" }));

    await waitFor(() => expect(window.levi.terminal.create).toHaveBeenCalledWith({ cols: 96, rows: 10 }));
  });
});
