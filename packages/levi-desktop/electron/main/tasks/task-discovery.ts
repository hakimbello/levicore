import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { WorkspaceScanSummary } from "../../../src/types/levi-api";
import type { TaskDefinition, TaskGroup, TaskSource } from "./task-types";

const VSCODE_TASKS = path.join(".vscode", "tasks.json");
const LEVI_TASKS = path.join(".levi", "tasks.json");

const BUILTIN_SCRIPT_MAP: Array<{ group: TaskGroup; matchers: string[]; patterns: RegExp[] }> = [
  { group: "build", matchers: ["$tsc"], patterns: [/^build$/i, /^compile$/i] },
  { group: "test", matchers: ["$pytest"], patterns: [/^test$/i, /^test:.+/i] },
  { group: "lint", matchers: ["$eslint-compact", "$eslint-stylish"], patterns: [/^lint$/i, /^eslint$/i] },
  { group: "format", matchers: [], patterns: [/^format$/i, /^fmt$/i, /^prettier$/i] },
  { group: "run", matchers: [], patterns: [/^start$/i, /^run$/i, /^serve$/i] },
  { group: "dev", matchers: [], patterns: [/^dev$/i, /^develop$/i] },
  { group: "watch", matchers: [], patterns: [/^watch$/i] }
];

const ALLOWED_COMMANDS = new Set([
  "npm",
  "npm.cmd",
  "pnpm",
  "pnpm.cmd",
  "yarn",
  "yarn.cmd",
  "bun",
  "bun.cmd",
  "cargo",
  "cargo.exe",
  "go",
  "go.exe",
  "python",
  "python3",
  "python.exe",
  "dotnet",
  "dotnet.exe",
  "node",
  "node.exe",
  "npx",
  "npx.cmd"
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function packageManagerCommand(manager: string | undefined): string {
  if (manager === "pnpm") return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  if (manager === "yarn") return process.platform === "win32" ? "yarn.cmd" : "yarn";
  if (manager === "bun") return process.platform === "win32" ? "bun.cmd" : "bun";
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function classifyScript(scriptName: string): { group: TaskGroup; matchers: string[] } {
  for (const entry of BUILTIN_SCRIPT_MAP) {
    if (entry.patterns.some((pattern) => pattern.test(scriptName))) {
      return { group: entry.group, matchers: entry.matchers };
    }
  }
  return { group: "none", matchers: [] };
}

function validateCommand(command: string): string {
  const base = path.basename(command).toLowerCase();
  if (!ALLOWED_COMMANDS.has(base)) {
    throw new Error(`Task command "${command}" is not allowed.`);
  }
  return command;
}

function validateArgs(args: unknown): string[] {
  if (!Array.isArray(args)) return [];
  return args
    .filter((arg): arg is string => typeof arg === "string" && arg.length <= 500)
    .slice(0, 64);
}

function parseTaskEntry(entry: unknown, source: TaskSource, workspaceRoot: string): TaskDefinition | null {
  if (!isPlainObject(entry)) return null;
  const label = typeof entry.label === "string" ? entry.label.trim() : "";
  if (!label || label.length > 120) return null;
  const commandRaw = typeof entry.command === "string" ? entry.command.trim() : "";
  if (!commandRaw) return null;
  const args = validateArgs(entry.args);
  const command = validateCommand(path.basename(commandRaw) === commandRaw ? commandRaw : path.basename(commandRaw));
  const groupValue = typeof entry.group === "string" ? entry.group : isPlainObject(entry.group) ? String(entry.group.kind ?? "none") : "none";
  const group = (["build", "test", "lint", "format", "run", "dev", "watch"].includes(groupValue) ? groupValue : "none") as TaskGroup;
  const cwd = typeof entry.options === "object" && entry.options && typeof (entry.options as Record<string, unknown>).cwd === "string"
    ? (entry.options as Record<string, unknown>).cwd as string
    : undefined;
  const problemMatchers = Array.isArray(entry.problemMatcher)
    ? entry.problemMatcher.filter((item): item is string => typeof item === "string").slice(0, 8)
    : typeof entry.problemMatcher === "string"
      ? [entry.problemMatcher]
      : [];
  if (cwd) {
    const resolved = path.resolve(workspaceRoot, cwd);
    const relative = path.relative(workspaceRoot, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  }
  return {
    id: `${source}:${slug(label)}`,
    label,
    source,
    group,
    command,
    args,
    cwd,
    problemMatchers
  };
}

async function readTasksFile(relativePath: string, workspaceRoot: string, source: TaskSource): Promise<TaskDefinition[]> {
  const absolutePath = path.join(workspaceRoot, relativePath);
  try {
    const raw = await fs.readFile(absolutePath, "utf8");
    const parsed = JSON.parse(raw) as { tasks?: unknown[] };
    if (!Array.isArray(parsed.tasks)) return [];
    const tasks: TaskDefinition[] = [];
    for (const entry of parsed.tasks.slice(0, 64)) {
      try {
        const task = parseTaskEntry(entry, source, workspaceRoot);
        if (task) tasks.push(task);
      } catch {
        continue;
      }
    }
    return tasks;
  } catch {
    return [];
  }
}

function buildPackageScriptTasks(summary: WorkspaceScanSummary): TaskDefinition[] {
  const pm = packageManagerCommand(summary.packageManager);
  const tasks: TaskDefinition[] = [];
  for (const [scriptName] of Object.entries(summary.scripts).slice(0, 32)) {
    const { group, matchers } = classifyScript(scriptName);
    tasks.push({
      id: `detected:${slug(scriptName)}`,
      label: scriptName,
      source: "detected",
      group,
      command: pm,
      args: pm.includes("yarn") && !pm.includes("npm") ? [scriptName] : ["run", scriptName],
      problemMatchers: matchers
    });
  }
  return tasks;
}

function buildBuiltinTasks(summary: WorkspaceScanSummary, manifestPaths: Set<string>): TaskDefinition[] {
  const tasks: TaskDefinition[] = [];
  const pm = packageManagerCommand(summary.packageManager);
  const scripts = summary.scripts;

  const addIf = (label: string, group: TaskGroup, matchers: string[], predicate: boolean, command: string, args: string[]) => {
    if (!predicate) return;
    tasks.push({
      id: `builtin:${slug(label)}`,
      label,
      source: "builtin",
      group,
      command,
      args,
      problemMatchers: matchers
    });
  };

  addIf("Build", "build", ["$tsc"], Boolean(scripts.build || scripts.compile || manifestPaths.has("Cargo.toml")), manifestPaths.has("Cargo.toml") ? "cargo" : pm, manifestPaths.has("Cargo.toml") ? ["build"] : scripts.build ? ["run", "build"] : ["run", "compile"]);
  addIf("Test", "test", ["$pytest", "$go"], Boolean(scripts.test || manifestPaths.has("Cargo.toml") || manifestPaths.has("go.mod")), manifestPaths.has("Cargo.toml") ? "cargo" : manifestPaths.has("go.mod") ? "go" : pm, manifestPaths.has("Cargo.toml") ? ["test"] : manifestPaths.has("go.mod") ? ["test", "./..."] : ["run", "test"]);
  addIf("Lint", "lint", ["$eslint-compact", "$eslint-stylish"], Boolean(scripts.lint || scripts.eslint), pm, ["run", scripts.lint ? "lint" : "eslint"]);
  addIf("Format", "format", [], Boolean(scripts.format || scripts.fmt || scripts.prettier), pm, ["run", scripts.format ? "format" : scripts.fmt ? "fmt" : "prettier"]);
  addIf("Run", "run", [], Boolean(scripts.start || scripts.run || scripts.serve), pm, ["run", scripts.start ? "start" : scripts.run ? "run" : "serve"]);
  addIf("Dev", "dev", [], Boolean(scripts.dev || scripts.develop), pm, ["run", scripts.dev ? "dev" : "develop"]);
  addIf("Watch", "watch", [], Boolean(scripts.watch), pm, ["run", "watch"]);

  if (manifestPaths.has("go.mod")) {
    addIf("Go Build", "build", ["$go"], true, "go", ["build", "./..."]);
    addIf("Go Test", "test", ["$go"], true, "go", ["test", "./..."]);
  }

  if (summary.languages.includes("Python")) {
    addIf("Python Test", "test", ["$pytest", "$python"], true, process.platform === "win32" ? "python.exe" : "python3", ["-m", "pytest"]);
  }

  if (manifestPaths.has("package.json") || manifestPaths.has("package.json".replace("/", path.sep))) {
    // dotnet detection via csproj presence handled below
  }

  return tasks;
}

export async function discoverTasks(workspaceRoot: string, summary?: WorkspaceScanSummary): Promise<TaskDefinition[]> {
  const vscodeTasks = await readTasksFile(VSCODE_TASKS, workspaceRoot, "vscode");
  const leviTasks = await readTasksFile(LEVI_TASKS, workspaceRoot, "levi");
  const manifestPaths = new Set((summary?.manifestFiles ?? []).map((file) => file.replace(/\\/g, "/")));
  const builtin = summary ? buildBuiltinTasks(summary, manifestPaths) : [];
  const detected = summary ? buildPackageScriptTasks(summary) : [];
  const merged = new Map<string, TaskDefinition>();
  for (const task of [...builtin, ...detected, ...vscodeTasks, ...leviTasks]) {
    merged.set(task.id, task);
  }
  return Array.from(merged.values()).sort((left, right) => left.label.localeCompare(right.label));
}

export function createTaskId(label: string): string {
  return randomUUID();
}

export { ALLOWED_COMMANDS, validateCommand, validateArgs };
