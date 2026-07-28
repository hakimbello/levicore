import fs from "node:fs";
import path from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/app/App";
import { LazySurface } from "../src/components/LazySurface";

const packageRoot = path.resolve(__dirname, "..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(packageRoot, relativePath), "utf8");
}

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

describe("Levi desktop lazy loading", () => {
  it("keeps renderer App free of direct Monaco and xterm imports", () => {
    const appSource = readSource("src/app/App.tsx");
    expect(appSource).not.toMatch(/from "@monaco-editor\/react"/);
    expect(appSource).not.toMatch(/from "@xterm\/xterm"/);
    expect(appSource).toMatch(/import\("\.\.\/components\/CodeEditor"\)/);
  });

  it("loads Monaco only through the editor module", () => {
    const editorSource = readSource("src/components/CodeEditor.tsx");
    expect(editorSource).toMatch(/@monaco-editor\/react/);
  });

  it("loads xterm only through the terminal host module", () => {
    const hostSource = readSource("src/features/terminal/TerminalHost.tsx");
    expect(hostSource).toMatch(/@xterm\/xterm/);
    const panelSource = readSource("src/features/terminal/TerminalPanel.tsx");
    expect(panelSource).toMatch(/import\("\.\/TerminalHost"\)/);
  });

  it("lazy-loads planning, execution, and diff review panels from Home", () => {
    const homeSource = readSource("src/features/home/Home.tsx");
    expect(homeSource).toMatch(/import\("\.\/EditReviewPanel"\)/);
    expect(homeSource).toMatch(/import\("\.\/PlanReviewPanel"\)/);
    expect(homeSource).toMatch(/import\("\.\/ExecutionReviewPanel"\)/);
  });

  it("loads Monaco from bundled assets instead of a CDN loader default", () => {
    const setupSource = readSource("src/monaco-setup.ts");
    const editorSource = readSource("src/components/CodeEditor.tsx");
    expect(setupSource).toMatch(/loader\.config\(\{ monaco \}\)/);
    expect(setupSource).toMatch(/from "monaco-editor"/);
    expect(editorSource).toMatch(/monaco-setup/);
  });

  it("renders the Home prompt before Monaco is requested", async () => {
    render(<App />);
    expect(screen.getByRole("textbox", { name: "Prompt" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Read-only editor" })).not.toBeInTheDocument();
    await waitForInitialBridge();
  });

  it("handles lazy surface failures safely", () => {
    function BrokenChild(): never {
      throw new Error("module failed");
    }

    render(
      <LazySurface label="Editor">
        <BrokenChild />
      </LazySurface>
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Editor failed to load.");
  });
});
