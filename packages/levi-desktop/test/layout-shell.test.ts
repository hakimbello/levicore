import { readFileSync } from "node:fs";
import path from "node:path";

const packageRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(packageRoot, "src");

function readSource(relativePath: string): string {
  return readFileSync(path.join(srcRoot, relativePath), "utf8");
}

function cssRule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`, "s"));
  return match?.groups?.body ?? "";
}

describe("Levi desktop responsive shell layout", () => {
  const mainSource = readSource("main.tsx");
  const globalCss = readSource("styles/global.css");
  const editorTabsCss = readSource("styles/editor-tabs.css");

  it("loads the activity bar stylesheet with the desktop shell", () => {
    expect(mainSource).toContain('import "./styles/global.css";');
    expect(mainSource).toContain('import "./styles/activity-bar.css";');
  });

  it("keeps the root shell on three explicit viewport-filling columns", () => {
    const shell = cssRule(globalCss, ".levi-shell");

    expect(shell).toContain("grid-template-columns: 52px var(--levi-layout-sidebarWidth) minmax(0, 1fr)");
    expect(shell).toContain("width: 100vw");
    expect(shell).toContain("height: 100vh");
    expect(shell).toContain("overflow: hidden");
    expect(cssRule(globalCss, ".levi-shell-no-context")).toContain("grid-template-columns: 52px minmax(0, 1fr)");
    expect(cssRule(globalCss, ".levi-context-sidebar")).toContain("grid-column: 2");
    expect(cssRule(globalCss, ".levi-main")).toContain("grid-column: 3");
    expect(cssRule(globalCss, ".levi-shell-no-context .levi-main")).toContain("grid-column: 2");
  });

  it("bounds the main workspace and docked chat to prevent viewport overflow", () => {
    expect(cssRule(globalCss, ".levi-main")).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(cssRule(globalCss, ".levi-main")).toContain("overflow: hidden");
    expect(cssRule(globalCss, ".levi-main")).toContain("grid-template-rows: auto minmax(0, 1fr) auto");
    expect(cssRule(globalCss, ".levi-workspace-layout")).toContain("overflow: hidden");
    expect(cssRule(globalCss, ".levi-workspace-layout")).toContain("max-width: 100%");
    expect(cssRule(globalCss, ".levi-workspace-layout")).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(cssRule(globalCss, ".levi-workspace-layout-with-ai")).toContain("minmax(340px, clamp(340px, 22vw, 420px))");
    expect(globalCss).not.toContain(".levi-workspace-layout-editor {");
    expect(cssRule(globalCss, ".levi-primary-workspace")).toContain("grid-template-rows: auto minmax(0, 1fr)");
    expect(cssRule(globalCss, ".levi-primary-workspace-body")).toContain("overflow: hidden");
    expect(cssRule(globalCss, ".levi-editor-panel")).toContain("grid-template-rows: max-content max-content minmax(0, 1fr)");
    expect(cssRule(editorTabsCss, ".levi-editor-panel")).toContain("grid-template-rows: max-content max-content minmax(0, 1fr)");
    expect(cssRule(globalCss, ".levi-editor-host")).toContain("height: 100%");
    expect(cssRule(globalCss, ".levi-editor-host")).toContain("overflow: hidden");
    expect(cssRule(globalCss, ".levi-code-editor-host")).toContain("height: 100%");
    expect(cssRule(globalCss, ".levi-bottom-panel")).toContain("max-width: 100%");
    expect(cssRule(globalCss, ".levi-ai-chat-panel")).toContain("width: 100%");
    expect(cssRule(globalCss, ".levi-ai-chat-panel")).toContain("min-height: 0");
    expect(cssRule(globalCss, ".levi-ai-chat-dock-floating")).toContain("width: min(420px, calc(100% - 32px))");
  });

  it("gives bottom-docked chat a real row inside the workspace grid", () => {
    expect(globalCss).toContain(".levi-workspace-layout:has(.levi-ai-chat-dock-bottom)");
    expect(globalCss).toContain("grid-template-rows: minmax(0, 1fr) minmax(260px, 38%)");
    expect(cssRule(globalCss, ".levi-ai-chat-dock-bottom")).toContain("height: 100%");
  });
});
