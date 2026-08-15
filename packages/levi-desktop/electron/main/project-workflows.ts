import fs from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { performance } from "node:perf_hooks";
import type { BrowserWindow } from "electron";
import type { SelectedProject, WorkspaceScanSummary } from "../../src/types/levi-api";
import type { TerminalManager } from "./terminal-manager";

const CLONE_TIMEOUT_MS = 120_000;
const GIT_TIMEOUT_MS = 12_000;
const MAX_OUTPUT_CHARS = 16_000;
const SAFE_PROJECT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,119}$/;

export type ProjectType =
  | "vanilla-web"
  | "react"
  | "vite"
  | "nextjs"
  | "node"
  | "typescript"
  | "android-gradle"
  | "kotlin-android"
  | "git"
  | "empty"
  | "unknown";

export type ProjectDetection = {
  projectType: ProjectType;
  framework?: string;
  packageManager?: string;
  buildCommand?: string;
  testCommand?: string;
  devCommand?: string;
  entryPoint?: string;
  confidence: number;
  evidence: string[];
};

export type ProjectStarterCategory =
  | "vanilla-web"
  | "react-vite"
  | "nextjs"
  | "node-api"
  | "empty-project"
  | "empty"
  | "clone-github";

export type StarterFile = {
  relativePath: string;
  content: string;
};

export type StarterCommand = {
  label: string;
  command: string;
  args: string[];
  cwd?: string;
  kind: "install" | "build" | "test" | "dev" | "verify";
  required: boolean;
};

export type ProjectStarterInfo = {
  id: ProjectStarterCategory;
  label: string;
  projectFamily: "web" | "api" | "empty" | "mobile" | "desktop";
  framework?: string;
  language: string;
  packageManager?: string;
  requiredTools: string[];
  initializationActions: "deterministic-files" | "ecosystem-initializer" | "empty";
  expectedFiles: string[];
  verificationStrategy: "build-command" | "syntax-check" | "static-files" | "none";
  description: string;
  installCommand?: StarterCommand;
  buildCommand?: StarterCommand;
  testCommand?: StarterCommand;
  devCommand?: StarterCommand;
  files: StarterFile[];
};

export type NewAppIntent = {
  isNewApplication: boolean;
  starterId: ProjectStarterCategory;
  projectName: string;
  requestedFeatures: string[];
  confidence: number;
  reason: string;
};

export type CloneRepositoryRequest = {
  repositoryUrl: string;
  destinationFolder: string;
};

export type CloneRepositoryResult = {
  project: SelectedProject;
  detection: ProjectDetection;
  summary: string;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type CreateStarterRequest = {
  starter: ProjectStarterCategory;
  destinationFolder: string;
  projectName?: string;
};

export type CreateStarterResult = {
  project: SelectedProject;
  detection: ProjectDetection;
  summary: string;
  commands: string[];
  needsEnvironmentCheck?: boolean;
  warnings: string[];
};

export type RunAppCommand = {
  id: string;
  label: string;
  command: string;
  args: string[];
  cwd?: string;
  confidence: number;
  longRunning: boolean;
};

export type RunAppStatus = {
  running: boolean;
  terminalSessionId?: string;
  command?: RunAppCommand;
  outputPreview: string;
  startedAt?: string;
  stoppedAt?: string;
  exitCode?: number;
};

export type RunAppResult = {
  status: RunAppStatus;
};

export type ViewChangesResult = {
  createdFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
};

type ExecFile = typeof execFileCallback;

type ProjectWorkflowOptions = {
  getWorkspaceRoot: () => string | null;
  openProjectAtPath: (directoryPath: string) => Promise<SelectedProject | null>;
  refreshWorkspace: () => Promise<unknown>;
  getWorkspaceSummary: () => WorkspaceScanSummary | undefined;
  terminalManager: TerminalManager;
  getWindow: () => BrowserWindow | null;
  execFile?: ExecFile;
};

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeCommand = process.platform === "win32" ? "node.exe" : "node";

export const PROJECT_STARTERS: ProjectStarterInfo[] = [
  {
    id: "vanilla-web",
    label: "Vanilla Web",
    projectFamily: "web",
    framework: "HTML/CSS/JavaScript",
    language: "JavaScript",
    requiredTools: ["node"],
    initializationActions: "deterministic-files",
    expectedFiles: ["index.html", "styles.css", "app.js"],
    verificationStrategy: "syntax-check",
    description: "HTML, CSS, and JavaScript files.",
    buildCommand: { label: "Check JavaScript", command: nodeCommand, args: ["--check", "app.js"], kind: "verify", required: true },
    devCommand: { label: "Open static HTML", command: "open-static", args: ["index.html"], kind: "dev", required: false },
    files: vanillaFiles()
  },
  {
    id: "react-vite",
    label: "React + Vite",
    projectFamily: "web",
    framework: "React + Vite",
    language: "TypeScript",
    packageManager: "npm",
    requiredTools: ["node", "npm"],
    initializationActions: "deterministic-files",
    expectedFiles: ["package.json", "index.html", "src/main.tsx", "src/App.tsx", "src/styles.css", "vite.config.ts", "tsconfig.json"],
    verificationStrategy: "build-command",
    description: "React project initialized with a deterministic Vite scaffold.",
    installCommand: { label: "Install dependencies", command: npmCommand, args: ["install"], kind: "install", required: true },
    buildCommand: { label: "Build", command: npmCommand, args: ["run", "build"], kind: "build", required: true },
    devCommand: { label: "Run dev server", command: npmCommand, args: ["run", "dev"], kind: "dev", required: false },
    files: reactViteFiles()
  },
  {
    id: "nextjs",
    label: "Next.js",
    projectFamily: "web",
    framework: "Next.js",
    language: "TypeScript",
    packageManager: "npm",
    requiredTools: ["node", "npm"],
    initializationActions: "deterministic-files",
    expectedFiles: ["package.json", "app/page.tsx", "app/layout.tsx", "next.config.mjs", "tsconfig.json"],
    verificationStrategy: "build-command",
    description: "Minimal deterministic Next.js App Router starter.",
    installCommand: { label: "Install dependencies", command: npmCommand, args: ["install"], kind: "install", required: true },
    buildCommand: { label: "Build", command: npmCommand, args: ["run", "build"], kind: "build", required: true },
    devCommand: { label: "Run dev server", command: npmCommand, args: ["run", "dev"], kind: "dev", required: false },
    files: nextFiles()
  },
  {
    id: "node-api",
    label: "Node API",
    projectFamily: "api",
    framework: "Node HTTP",
    language: "JavaScript",
    packageManager: "npm",
    requiredTools: ["node", "npm"],
    initializationActions: "deterministic-files",
    expectedFiles: ["package.json", "src/server.js"],
    verificationStrategy: "syntax-check",
    description: "Small Node API starter.",
    buildCommand: { label: "Check server", command: nodeCommand, args: ["--check", "src/server.js"], kind: "verify", required: true },
    devCommand: { label: "Run API", command: nodeCommand, args: ["src/server.js"], kind: "dev", required: false },
    files: nodeApiFiles()
  },
  {
    id: "empty-project",
    label: "Empty Project",
    projectFamily: "empty",
    language: "Plain text",
    requiredTools: [],
    initializationActions: "empty",
    expectedFiles: [],
    verificationStrategy: "none",
    description: "A safe empty workspace.",
    files: []
  },
  {
    id: "empty",
    label: "Empty Project",
    projectFamily: "empty",
    language: "Plain text",
    requiredTools: [],
    initializationActions: "empty",
    expectedFiles: [],
    verificationStrategy: "none",
    description: "A safe empty workspace.",
    files: []
  },
  {
    id: "clone-github",
    label: "Clone GitHub Repository",
    projectFamily: "empty",
    language: "Unknown",
    requiredTools: ["git"],
    initializationActions: "empty",
    expectedFiles: [],
    verificationStrategy: "none",
    description: "Clone a public HTTPS GitHub repository.",
    files: []
  }
];

export function validateGitHubRepositoryUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Repository URL is invalid.");
  }
  if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "github.com") {
    throw new Error("Only public HTTPS GitHub repository URLs are supported.");
  }
  const parts = parsed.pathname.replace(/^\/|\/$/g, "").split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("GitHub repository URL must include owner and repository.");
  }
  if (![parts[0], parts[1]].every((part) => /^[A-Za-z0-9_.-]+$/.test(part)) || parsed.search || parsed.hash) {
    throw new Error("GitHub repository URL contains unsupported characters.");
  }
  return `https://github.com/${parts[0]}/${parts[1].replace(/\.git$/i, "")}.git`;
}

export async function validateNewProjectDestination(destinationFolder: string, projectName?: string): Promise<string> {
  if (typeof destinationFolder !== "string" || !path.isAbsolute(destinationFolder) || destinationFolder.includes("\0")) {
    throw new Error("Destination folder must be an absolute path.");
  }
  const target = projectName ? path.resolve(destinationFolder, validateProjectName(projectName)) : path.resolve(destinationFolder);
  const parent = projectName ? path.resolve(destinationFolder) : path.dirname(target);
  const parentStats = await fs.stat(parent).catch(() => null);
  if (!parentStats?.isDirectory()) {
    throw new Error("Destination parent folder does not exist.");
  }
  const existing = await fs.readdir(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (existing && existing.length > 0) {
    throw new Error("Destination folder is not empty.");
  }
  return target;
}

export function starterById(id: ProjectStarterCategory): ProjectStarterInfo {
  const starter = PROJECT_STARTERS.find((item) => item.id === id);
  if (!starter || starter.id === "clone-github") throw new Error("Starter is not supported.");
  return starter;
}

export function safeProjectSlug(prompt: string): string {
  const normalized = prompt
    .toLowerCase()
    .replace(/\btracking\b/g, "tracker")
    .replace(/[`"'’]/g, "")
    .replace(/\b(build|create|make|generate|scaffold|implement|add|me|a|an|the|simple|basic|new|app|application|website|web|site|project|with|using|for|and|local|data|persistence|dashboard|list|form|workout|workouts)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  const selected = words.length ? words.slice(0, 3) : ["levi", "app"];
  const slug = selected.join("-").replace(/^-+|-+$/g, "").slice(0, 60);
  return slug || "levi-app";
}

export function detectNewAppIntent(prompt: string): NewAppIntent {
  const text = prompt.toLowerCase();
  const isNewApplication = /\b(build|create|make|generate|scaffold)\b/.test(text) && /\b(app|application|website|site|api|dashboard|tool|tracker|calculator)\b/.test(text);
  let starterId: ProjectStarterCategory = "react-vite";
  let reason = "General web application defaults to React + Vite.";
  if (/\bcalculator\b/.test(text)) {
    starterId = "vanilla-web";
    reason = "Calculator prompts use the fast static web starter.";
  } else if (/\bnext(?:\.js|js)?\b/.test(text)) {
    starterId = "nextjs";
    reason = "Prompt requested Next.js.";
  } else if (/\b(node|express|api|backend|server)\b/.test(text) && !/\bwebsite|site|frontend\b/.test(text)) {
    starterId = "node-api";
    reason = "Prompt requested a Node/API backend.";
  } else if (/\breact|vite\b/.test(text)) {
    starterId = "react-vite";
    reason = "Prompt requested React or Vite.";
  } else if (/\b(calculator|static|landing page|homepage|portfolio|simple website|website|site)\b/.test(text) && !/\bapp|application|dashboard|tracker|saas\b/.test(text)) {
    starterId = "vanilla-web";
    reason = "Prompt describes a simple static website.";
  }
  return {
    isNewApplication,
    starterId,
    projectName: safeProjectSlug(prompt),
    requestedFeatures: extractRequestedFeatures(prompt),
    confidence: isNewApplication ? 0.82 : 0.25,
    reason
  };
}

export function shouldBootstrapInChild(summary: WorkspaceScanSummary | undefined): boolean {
  if (!summary) return false;
  return summary.includedFileCount > 0 || summary.manifestFiles.length > 0 || summary.sourceDirectories.length > 0 || summary.likelyEntryPoints.length > 0;
}

function extractRequestedFeatures(prompt: string): string[] {
  const text = prompt.toLowerCase();
  const features: string[] = [];
  if (/\bdashboard\b/.test(text)) features.push("dashboard");
  if (/\bworkout|fitness|tracker|tracking\b/.test(text)) features.push("workout tracking");
  if (/\bform|add\b/.test(text)) features.push("add form");
  if (/\blocal storage|local data|persistence|persist\b/.test(text)) features.push("local persistence");
  if (/\bcalculator\b/.test(text)) features.push("calculator");
  return unique(features.length ? features : [prompt.replace(/\s+/g, " ").trim().slice(0, 120)]);
}

export function detectProjectFromSummary(summary: WorkspaceScanSummary): ProjectDetection {
  const scripts = summary.scripts;
  const manifests = new Set(summary.manifestFiles.map((file) => file.replace(/\\/g, "/")));
  const entryPoints = new Set(summary.likelyEntryPoints.map((file) => file.replace(/\\/g, "/")));
  const frameworks = new Set(summary.frameworks);
  const languages = new Set(summary.languages);
  const evidence: string[] = [];
  let projectType: ProjectType = "unknown";
  let framework: string | undefined;
  let confidence = 0.35;

  if (frameworks.has("Next.js")) {
    projectType = "nextjs";
    framework = "Next.js";
    confidence = 0.95;
    evidence.push("Next.js dependency or config");
  } else if (frameworks.has("Vite")) {
    projectType = "vite";
    framework = frameworks.has("React") ? "React + Vite" : "Vite";
    confidence = frameworks.has("React") ? 0.93 : 0.86;
    evidence.push("Vite dependency or config");
  } else if (frameworks.has("React")) {
    projectType = "react";
    framework = "React";
    confidence = 0.82;
    evidence.push("React dependency");
  } else if (manifests.has("settings.gradle") || manifests.has("settings.gradle.kts") || manifests.has("build.gradle") || manifests.has("build.gradle.kts")) {
    projectType = languages.has("Kotlin") ? "kotlin-android" : "android-gradle";
    framework = languages.has("Kotlin") ? "Kotlin Android" : "Android Gradle";
    confidence = 0.82;
    evidence.push("Gradle metadata");
  } else if (manifests.has("package.json")) {
    projectType = "node";
    framework = "Node";
    confidence = 0.78;
    evidence.push("package.json");
  } else if (languages.has("HTML") || entryPoints.has("index.html") || summary.likelyEntryPoints.some((entry) => entry.endsWith(".html"))) {
    projectType = "vanilla-web";
    framework = "HTML/CSS/JS";
    confidence = 0.78;
    evidence.push("HTML entry point");
  }

  if (languages.has("TypeScript") && projectType === "node") {
    projectType = "typescript";
    evidence.push("TypeScript sources");
  }
  return {
    projectType,
    framework,
    packageManager: summary.packageManager,
    buildCommand: commandForScript(summary.packageManager, scripts, ["build", "compile"]),
    testCommand: commandForScript(summary.packageManager, scripts, ["test", "test:unit"]),
    devCommand: commandForScript(summary.packageManager, scripts, ["dev", "develop", "start", "serve"]),
    entryPoint: summary.likelyEntryPoints[0],
    confidence,
    evidence
  };
}

export function detectRunCommands(summary: WorkspaceScanSummary): RunAppCommand[] {
  const detection = detectProjectFromSummary(summary);
  const commands: RunAppCommand[] = [];
  const pm = packageManagerExecutable(summary.packageManager);
  const addScript = (script: string, label: string, confidence: number) => {
    if (!summary.scripts[script]) return;
    commands.push({
      id: `script:${script}`,
      label,
      command: pm,
      args: packageManagerArgs(summary.packageManager, script),
      confidence,
      longRunning: /^(dev|develop|start|serve)$/.test(script)
    });
  };

  if (detection.projectType === "vite" || detection.projectType === "nextjs") addScript("dev", "Run dev server", 0.96);
  addScript("start", "Run start script", 0.82);
  addScript("serve", "Run serve script", 0.76);
  addScript("dev", "Run dev script", 0.72);

  const htmlEntry = summary.likelyEntryPoints.map((entry) => entry.replace(/\\/g, "/")).find((entry) => entry === "index.html" || entry.endsWith(".html"));
  if (htmlEntry) {
    commands.push({ id: `static:${htmlEntry}`, label: "Open static HTML", command: "open-static", args: [htmlEntry], confidence: 0.74, longRunning: false });
  } else if (detection.projectType === "vanilla-web") {
    commands.push({ id: "static:index.html", label: "Open static HTML", command: "open-static", args: ["index.html"], confidence: 0.7, longRunning: false });
  }

  return uniqueRunCommands(commands).sort((left, right) => right.confidence - left.confidence);
}

export async function analyzeGitChanges(repositoryRoot: string, execFile: ExecFile = execFileCallback): Promise<ViewChangesResult> {
  const result = await exec(execFile, "git", ["status", "--porcelain"], repositoryRoot, GIT_TIMEOUT_MS).catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (/not a git repository/i.test(message)) {
      return { stdout: (await listWorkspaceFiles(repositoryRoot)).map((file) => `?? ${file}`).join("\n"), stderr: "" };
    }
    throw error;
  });
  const createdFiles: string[] = [];
  const modifiedFiles: string[] = [];
  const deletedFiles: string[] = [];
  for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) {
    const index = line[0] ?? " ";
    const worktree = line[1] ?? " ";
    const file = line.slice(3).split(" -> ").pop()?.replace(/\\/g, "/") ?? "";
    if (!file) continue;
    if (index === "?" || index === "A" || worktree === "A") createdFiles.push(file);
    else if (index === "D" || worktree === "D") deletedFiles.push(file);
    else modifiedFiles.push(file);
  }
  return {
    createdFiles: unique(createdFiles),
    modifiedFiles: unique(modifiedFiles),
    deletedFiles: unique(deletedFiles)
  };
}

async function listWorkspaceFiles(repositoryRoot: string): Promise<string[]> {
  const ignored = new Set([".git", ".levi", "node_modules", "dist", "build", ".next", "coverage"]);
  const files: string[] = [];
  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        files.push(normalizeSlashes(path.relative(repositoryRoot, absolutePath)));
      }
    }
  }
  await walk(repositoryRoot);
  return files;
}

export class ProjectWorkflowService {
  private runStatus: RunAppStatus = { running: false, outputPreview: "" };
  private stopTerminalListener?: () => void;

  constructor(private readonly options: ProjectWorkflowOptions) {}

  starters(): ProjectStarterInfo[] {
    return PROJECT_STARTERS.map((starter) => ({ ...starter }));
  }

  async detect(): Promise<ProjectDetection> {
    const summary = this.options.getWorkspaceSummary();
    if (!summary) {
      return { projectType: "unknown", confidence: 0, evidence: [] };
    }
    const detection = detectProjectFromSummary(summary);
    const root = this.options.getWorkspaceRoot();
    if (root && detection.projectType === "unknown" && await exists(path.join(root, ".git"))) {
      return { ...detection, projectType: "git", confidence: 0.55, evidence: [...detection.evidence, "Git repository"] };
    }
    return detection;
  }

  runCommands(): RunAppCommand[] {
    const summary = this.options.getWorkspaceSummary();
    return summary ? detectRunCommands(summary) : [];
  }

  async cloneRepository(request: CloneRepositoryRequest): Promise<CloneRepositoryResult> {
    const repositoryUrl = validateGitHubRepositoryUrl(request.repositoryUrl);
    const destination = await validateNewProjectDestination(request.destinationFolder);
    await fs.mkdir(destination, { recursive: true });
    const started = performance.now();
    const result = await exec(this.options.execFile ?? execFileCallback, "git", ["clone", "--progress", repositoryUrl, destination], path.dirname(destination), CLONE_TIMEOUT_MS);
    const project = await this.options.openProjectAtPath(destination);
    if (!project) throw new Error("Cloned repository could not be opened.");
    await this.options.refreshWorkspace();
    const detection = await this.detect();
    return {
      project,
      detection,
      summary: conciseSummary(project, detection),
      stdout: result.stdout.slice(-MAX_OUTPUT_CHARS),
      stderr: result.stderr.slice(-MAX_OUTPUT_CHARS),
      durationMs: Math.round(performance.now() - started)
    };
  }

  async createStarter(request: CreateStarterRequest): Promise<CreateStarterResult> {
    if (request.starter === "clone-github") {
      throw new Error("Use Clone Repository for GitHub starters.");
    }
    const destination = await validateNewProjectDestination(request.destinationFolder, request.projectName);
    await fs.mkdir(destination, { recursive: true });
    const commands: string[] = [];
    const warnings: string[] = [];
    let needsEnvironmentCheck = false;
    const starter = starterById(request.starter);
    if (starter.initializationActions === "empty") {
      await fs.writeFile(path.join(destination, ".gitkeep"), "", "utf8");
    } else {
      await writeStarterFiles(destination, starter);
    }
    if (starter.installCommand) commands.push(commandText(starter.installCommand));
    if (starter.buildCommand) commands.push(commandText(starter.buildCommand));
    const project = await this.options.openProjectAtPath(destination);
    if (!project) throw new Error("Created project could not be opened.");
    await this.options.refreshWorkspace();
    const detection = await this.detect();
    return { project, detection, summary: conciseSummary(project, detection), commands, needsEnvironmentCheck, warnings };
  }

  async startRun(commandId?: string): Promise<RunAppResult> {
    if (this.runStatus.running) return { status: { ...this.runStatus } };
    const commands = this.runCommands();
    const command = commandId ? commands.find((item) => item.id === commandId) : commands[0];
    if (!command || command.confidence < 0.7) {
      throw new Error("Levi could not detect a confident run command.");
    }
    const workspaceRoot = this.options.getWorkspaceRoot();
    if (!workspaceRoot) throw new Error("Open a workspace before running an app.");
    if (command.command === "open-static") {
      this.runStatus = { running: false, command, outputPreview: `Static entry: ${command.args[0]}`, startedAt: new Date().toISOString(), stoppedAt: new Date().toISOString(), exitCode: 0 };
      return { status: { ...this.runStatus } };
    }
    const window = this.options.getWindow();
    if (!window || window.isDestroyed()) throw new Error("No active Levi window is available.");
    const terminal = this.options.terminalManager.createCommand(
      window,
      { command: command.command, args: command.args, cwd: path.resolve(workspaceRoot, command.cwd ?? "."), name: command.label, cols: 96, rows: 16 },
      (exitCode) => {
        this.runStatus = { ...this.runStatus, running: false, stoppedAt: new Date().toISOString(), exitCode };
      }
    );
    this.stopTerminalListener = this.options.terminalManager.onTerminalData((sessionId, data) => {
      if (sessionId !== terminal.id) return;
      this.runStatus = { ...this.runStatus, outputPreview: `${this.runStatus.outputPreview}${data}`.slice(-MAX_OUTPUT_CHARS) };
    });
    this.runStatus = { running: true, terminalSessionId: terminal.id, command, outputPreview: "", startedAt: new Date().toISOString() };
    return { status: { ...this.runStatus } };
  }

  stopRun(): RunAppResult {
    if (this.runStatus.terminalSessionId) {
      this.options.terminalManager.kill(this.runStatus.terminalSessionId);
    }
    this.stopTerminalListener?.();
    this.stopTerminalListener = undefined;
    this.runStatus = { ...this.runStatus, running: false, stoppedAt: new Date().toISOString() };
    return { status: { ...this.runStatus } };
  }

  getRunStatus(): RunAppStatus {
    return { ...this.runStatus };
  }

  async viewChanges(): Promise<ViewChangesResult> {
    const workspaceRoot = this.options.getWorkspaceRoot();
    if (!workspaceRoot) throw new Error("Open a workspace before viewing changes.");
    return analyzeGitChanges(workspaceRoot, this.options.execFile);
  }
}

function validateProjectName(value: string): string {
  const name = value.trim();
  if (!SAFE_PROJECT_NAME.test(name) || name === "." || name === "..") throw new Error("Project name is invalid.");
  return name;
}

function packageManagerExecutable(value: string | undefined): string {
  if (value === "pnpm") return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  if (value === "yarn") return process.platform === "win32" ? "yarn.cmd" : "yarn";
  if (value === "bun") return process.platform === "win32" ? "bun.exe" : "bun";
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function packageManagerArgs(manager: string | undefined, script: string): string[] {
  return manager === "yarn" && script !== "install" ? [script] : ["run", script];
}

function commandForScript(manager: string | undefined, scripts: Record<string, string>, names: string[]): string | undefined {
  const script = names.find((name) => Boolean(scripts[name]));
  if (!script) return undefined;
  return `${packageManagerExecutable(manager)} ${packageManagerArgs(manager, script).join(" ")}`;
}

function conciseSummary(project: SelectedProject, detection: ProjectDetection): string {
  const parts = [project.name, detection.framework ?? detection.projectType];
  if (detection.packageManager) parts.push(detection.packageManager);
  if (detection.devCommand) parts.push(`dev: ${detection.devCommand}`);
  if (detection.buildCommand) parts.push(`build: ${detection.buildCommand}`);
  return parts.filter(Boolean).join(" | ");
}

function uniqueRunCommands(commands: RunAppCommand[]): RunAppCommand[] {
  const seen = new Set<string>();
  return commands.filter((command) => {
    const key = `${command.command} ${command.args.join(" ")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function commandText(command: StarterCommand): string {
  return [command.command, ...command.args].join(" ");
}

async function writeStarterFiles(destination: string, starter: ProjectStarterInfo): Promise<void> {
  for (const file of starter.files) {
    const target = path.join(destination, file.relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, "utf8");
  }
}

function vanillaFiles(): StarterFile[] {
  return [
    {
      relativePath: "index.html",
      content: "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n  <title>Levi App</title>\n  <link rel=\"stylesheet\" href=\"styles.css\">\n</head>\n<body>\n  <main id=\"app\"></main>\n  <script src=\"app.js\"></script>\n</body>\n</html>\n"
    },
    {
      relativePath: "styles.css",
      content: "body {\n  margin: 0;\n  font-family: system-ui, sans-serif;\n  background: #f7f7fb;\n  color: #1f2937;\n}\n\n#app {\n  min-height: 100vh;\n}\n"
    },
    {
      relativePath: "app.js",
      content: "document.querySelector('#app').innerHTML = '<h1>Ready to build with Levi</h1>';\n"
    }
  ];
}

function reactViteFiles(): StarterFile[] {
  return [
    {
      relativePath: "package.json",
      content: `${JSON.stringify({
        name: "levi-react-app",
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: { dev: "vite --host 127.0.0.1", build: "tsc -b && vite build", preview: "vite preview --host 127.0.0.1" },
        dependencies: { "@vitejs/plugin-react": "^4.7.0", "vite": "^7.0.6", "typescript": "^5.8.3", "react": "^19.1.1", "react-dom": "^19.1.1" },
        devDependencies: { "@types/react": "^19.1.8", "@types/react-dom": "^19.1.6" }
      }, null, 2)}\n`
    },
    {
      relativePath: "index.html",
      content: "<!doctype html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n  <title>Levi React App</title>\n</head>\n<body>\n  <div id=\"root\"></div>\n  <script type=\"module\" src=\"/src/main.tsx\"></script>\n</body>\n</html>\n"
    },
    {
      relativePath: "vite.config.ts",
      content: "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()]\n});\n"
    },
    {
      relativePath: "tsconfig.json",
      content: `${JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          useDefineForClassFields: true,
          lib: ["DOM", "DOM.Iterable", "ES2020"],
          allowJs: false,
          skipLibCheck: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          forceConsistentCasingInFileNames: true,
          module: "ESNext",
          moduleResolution: "Bundler",
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: "react-jsx"
        },
        include: ["src"],
        references: []
      }, null, 2)}\n`
    },
    {
      relativePath: "src/main.tsx",
      content: "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\nimport './styles.css';\n\ncreateRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n"
    },
    {
      relativePath: "src/App.tsx",
      content: "export default function App() {\n  return (\n    <main className=\"app-shell\">\n      <h1>Ready to build with Levi</h1>\n    </main>\n  );\n}\n"
    },
    {
      relativePath: "src/styles.css",
      content: ":root {\n  color: #172033;\n  background: #f5f7fb;\n  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif;\n}\n\nbody {\n  margin: 0;\n}\n\nbutton,\ninput {\n  font: inherit;\n}\n\n.app-shell {\n  min-height: 100vh;\n  display: grid;\n  place-items: center;\n  padding: 24px;\n}\n"
    }
  ];
}

function nextFiles(): StarterFile[] {
  return [
    {
      relativePath: "package.json",
      content: `${JSON.stringify({
        name: "levi-next-app",
        version: "0.1.0",
        private: true,
        scripts: { dev: "next dev", build: "next build", start: "next start" },
        dependencies: { next: "^16.0.0", react: "^19.1.1", "react-dom": "^19.1.1", typescript: "^5.8.3", "@types/react": "^19.1.8", "@types/node": "^24.1.0" },
        devDependencies: {}
      }, null, 2)}\n`
    },
    { relativePath: "next.config.mjs", content: "const nextConfig = {};\n\nexport default nextConfig;\n" },
    { relativePath: "tsconfig.json", content: `${JSON.stringify({ compilerOptions: { target: "ES2020", lib: ["dom", "dom.iterable", "esnext"], allowJs: false, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: "esnext", moduleResolution: "bundler", resolveJsonModule: true, isolatedModules: true, jsx: "preserve", incremental: true }, include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"], exclude: ["node_modules"] }, null, 2)}\n` },
    { relativePath: "next-env.d.ts", content: "/// <reference types=\"next\" />\n/// <reference types=\"next/image-types/global\" />\n" },
    { relativePath: "app/layout.tsx", content: "import './globals.css';\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang=\"en\"><body>{children}</body></html>;\n}\n" },
    { relativePath: "app/page.tsx", content: "export default function Page() {\n  return <main className=\"page\"><h1>Ready to build with Levi</h1></main>;\n}\n" },
    { relativePath: "app/globals.css", content: "body { margin: 0; font-family: system-ui, sans-serif; background: #f7f7fb; color: #172033; }\n.page { min-height: 100vh; display: grid; place-items: center; }\n" }
  ];
}

function nodeApiFiles(): StarterFile[] {
  return [
    {
      relativePath: "package.json",
      content: `${JSON.stringify({ name: "levi-node-api", version: "0.1.0", private: true, scripts: { start: "node src/server.js", dev: "node src/server.js", test: "node --test", build: "node --check src/server.js" } }, null, 2)}\n`
    },
    {
      relativePath: "src/server.js",
      content: "const http = require('node:http');\n\nconst server = http.createServer((_request, response) => {\n  response.writeHead(200, { 'content-type': 'application/json' });\n  response.end(JSON.stringify({ ok: true }));\n});\n\nserver.listen(process.env.PORT || 3000, () => {\n  console.log('API listening');\n});\n"
    }
  ];
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function exec(execFile: ExecFile, executable: string, args: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(executable, args, { cwd, timeout: timeoutMs, windowsHide: true, maxBuffer: MAX_OUTPUT_CHARS * 2 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr.toString().trim() || stdout.toString().trim() || error.message));
      else resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}
