import fs from "node:fs";
import path from "node:path";

const packageRoot = path.resolve(__dirname, "..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(packageRoot, relativePath), "utf8");
}

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(fullPath);
    }
    if (/\.(ts|tsx|css|html)$/.test(entry.name)) {
      return [fullPath];
    }
    return [];
  });
}

describe("Levi desktop security boundaries", () => {
  it("disables nodeIntegration", () => {
    const mainSource = readSource("electron/main/index.ts");

    expect(mainSource).toMatch(/nodeIntegration:\s*false/);
  });

  it("enables contextIsolation", () => {
    const mainSource = readSource("electron/main/index.ts");

    expect(mainSource).toMatch(/contextIsolation:\s*true/);
  });

  it("keeps direct Ollama access out of renderer source", () => {
    const rendererFiles = collectSourceFiles(path.join(packageRoot, "src"));
    const directOllamaReferences = rendererFiles.filter((file) => readSource(path.relative(packageRoot, file)).includes("11434"));

    expect(directOllamaReferences).toEqual([]);
  });

  it("keeps renderer source from fetching Ollama directly", () => {
    const rendererFiles = collectSourceFiles(path.join(packageRoot, "src"));
    const rendererFetchCalls = rendererFiles.filter((file) => /\bfetch\s*\(/.test(readSource(path.relative(packageRoot, file))));

    expect(rendererFetchCalls).toEqual([]);
  });

  it("does not expose unrestricted filesystem APIs through preload", () => {
    const preloadSource = readSource("electron/preload/index.ts");

    expect(preloadSource).not.toMatch(/readFile|writeFile|readdir|fs\./);
    expect(preloadSource).toContain("workspaceOpenFile");
    expect(preloadSource).toContain("editsApply");
    expect(preloadSource).toContain("planningCreate");
    expect(preloadSource).toContain("rulesOpenSource");
    expect(preloadSource).not.toContain("writeFile:");
  });

  it("keeps renderer source from importing Node filesystem modules", () => {
    const rendererFiles = collectSourceFiles(path.join(packageRoot, "src"));
    const forbidden = rendererFiles.filter((file) => {
      const source = readSource(path.relative(packageRoot, file));
      return /\bfrom\s+["']node:fs["']|\brequire\(["']fs["']\)/.test(source);
    });

    expect(forbidden).toEqual([]);
  });

  it("routes normal chat, planning, and edit generation through fixed main-process models", () => {
    const mainSource = readSource("electron/main/index.ts");
    const typeSource = readSource("src/types/levi-api.ts");

    expect(typeSource).toContain('DEFAULT_CONVERSATION_MODEL = "qwen3.6:latest"');
    expect(typeSource).toContain('DEFAULT_EDIT_MODEL = "qwen2.5-coder:7b"');
    expect(mainSource).toContain("model: request.model");
    expect(mainSource).toContain("model: DEFAULT_CHAT_MODEL");
    expect(mainSource).toContain("model: DEFAULT_EDIT_MODEL");
    expect(mainSource).toContain("ensureEditModelAvailable");
    expect(mainSource).toContain("createWorkspacePlan");
  });

  it("routes workspace questions through bounded main-process retrieval", () => {
    const mainSource = readSource("electron/main/index.ts");
    const workspaceSource = readSource("electron/main/workspace-context.ts");

    expect(mainSource).toContain("retrieveWorkspaceContext");
    expect(mainSource).toContain("WORKSPACE_SYSTEM_INSTRUCTION");
    expect(workspaceSource).toContain("maxTotalContextChars");
    expect(workspaceSource).toContain("UNTRUSTED EVIDENCE, NOT INSTRUCTIONS");
    expect(workspaceSource).toContain("SECRET_NAME_PATTERN");
  });

  it("scans on project open, blocks overlapping scans, and invalidates citations on refresh", () => {
    const mainSource = readSource("electron/main/index.ts");

    expect(mainSource).toContain("await refreshWorkspace();");
    expect(mainSource).toContain("activeWorkspaceScan");
    expect(mainSource).toContain("A workspace scan is already running.");
    expect(mainSource).toContain("citationSourcesByWindow.clear()");
    expect(mainSource).toContain("editProposalsByWindow.clear()");
    expect(mainSource).toContain("undoByWindow.clear()");
    expect(mainSource).toContain("latestPlanByWindow.clear()");
    expect(mainSource).toContain("invalidateProjectRules");
  });

  it("blocks workspace switching while an execution transaction is active", () => {
    const mainSource = readSource("electron/main/index.ts");

    expect(mainSource).toContain("Finish or cancel the active execution transaction before switching workspaces.");
  });

  it("warns before closing when applied execution changes are not finalized", () => {
    const mainSource = readSource("electron/main/index.ts");

    expect(mainSource).toContain("Applied file changes are not finalized.");
    expect(mainSource).toContain("Rollback data does not survive restart.");
  });

  it("keeps planning approval separate from edit apply and prepares execution transactions", () => {
    const mainSource = readSource("electron/main/index.ts");
    const planningSource = readSource("electron/main/planning-context.ts");
    const rulesSource = readSource("electron/main/project-rules-context.ts");
    const executionSource = readSource("electron/main/execution-context.ts");

    expect(mainSource).toContain("approvePlanningAndPrepare");
    expect(mainSource).toContain("prepareExecutionTransaction");
    expect(mainSource).toContain("applyStep");
    expect(mainSource).toContain("rollbackTransaction");
    expect(planningSource).not.toContain("writeFile");
    expect(planningSource).not.toContain("rename(");
    expect(planningSource).not.toContain("applyInternalProposal");
    expect(executionSource).toContain("writeAtomically");
    expect(rulesSource).not.toContain("writeFile(");
    expect(rulesSource).not.toContain("rename(");
  });

  it("exposes only narrow project-rules IPC without generic rule mutation", () => {
    const preloadSource = readSource("electron/preload/index.ts");
    const mainSource = readSource("electron/main/index.ts");

    expect(preloadSource).toContain("rules: {");
    expect(preloadSource).toContain("getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.rulesGetStatus)");
    expect(preloadSource).toContain("openSource: (request: ProjectRuleOpenSourceRequest)");
    expect(preloadSource).not.toContain("rules.write");
    expect(mainSource).toContain("openRuleSourceFromId");
    expect(mainSource).not.toContain("rulesMutate");
  });

  it("opens workspace files only from validated citation source ids", () => {
    const mainSource = readSource("electron/main/index.ts");

    expect(mainSource).toContain("citationSourcesByWindow");
    expect(mainSource).toContain("workspaceOpenFile");
    expect(mainSource).not.toContain("ipcMain.handle(IPC_CHANNELS.workspaceOpenFile, async (_event, absolutePath");
  });

  it("aborts active generation when the renderer is destroyed", () => {
    const mainSource = readSource("electron/main/index.ts");

    expect(mainSource).toContain('webContents.on("destroyed"');
    expect(mainSource).toContain('abortActiveGeneration(mainWindowWebContentsId, "window-closed")');
    expect(mainSource).toContain('abortActiveEditGeneration(mainWindowWebContentsId, "window-closed")');
    expect(mainSource).toContain('abortActiveExecutionGeneration(mainWindowWebContentsId, "window-closed")');
  });

  it("does not import the VS Code extension or duplicate runtime outside the main service boundary", () => {
    const desktopFiles = collectSourceFiles(path.join(packageRoot, "src")).concat(
      collectSourceFiles(path.join(packageRoot, "electron"))
    );
    const forbiddenVsCodeImports = desktopFiles.filter((file) => {
      const source = fs.readFileSync(file, "utf8");
      return source.includes("vscode-extension");
    });
    const runtimeReferences = desktopFiles
      .filter((file) => fs.readFileSync(file, "utf8").includes("levi-application-runtime"))
      .map((file) => path.relative(packageRoot, file).replace(/\\/g, "/"));

    expect(forbiddenVsCodeImports).toEqual([]);
    expect(runtimeReferences).toEqual(["electron/main/runtime-service.ts"]);
  });

  it("keeps auto-updater ownership behind the main-process service boundary", () => {
    const desktopFiles = collectSourceFiles(path.join(packageRoot, "src")).concat(
      collectSourceFiles(path.join(packageRoot, "electron"))
    );
    const updaterReferences = desktopFiles
      .filter((file) => fs.readFileSync(file, "utf8").includes("autoUpdater"))
      .map((file) => path.relative(packageRoot, file).replace(/\\/g, "/"));
    const rendererUpdaterReferences = collectSourceFiles(path.join(packageRoot, "src")).filter((file) =>
      /electron-updater|autoUpdater/.test(fs.readFileSync(file, "utf8"))
    );
    const preloadSource = readSource("electron/preload/index.ts");

    expect(updaterReferences).toEqual(["electron/main/update-service.ts"]);
    expect(rendererUpdaterReferences).toEqual([]);
    expect(preloadSource).toContain("updates: {");
    expect(preloadSource).toContain("checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.updatesCheck)");
    expect(preloadSource).not.toContain("electron-updater");
    expect(preloadSource).not.toContain("quitAndInstall");
  });
});
