import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type DeveloperToolId =
  | "go"
  | "rustc"
  | "cargo"
  | "java"
  | "adb"
  | "android-sdk"
  | "node"
  | "npm"
  | "python"
  | "dotnet"
  | "flutter"
  | "git";

export type DeveloperToolResolution = {
  toolName: string;
  command: string;
  resolvedPath?: string;
  pathSearched: string[];
  fallbackLocationsChecked: string[];
};

const REGISTRY_ENV_KEYS = [
  "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
  "HKCU\\Environment"
];

const WINDOWS_EXECUTABLE_EXTENSIONS = [".exe", ".cmd", ".bat", ".com"];

export function getEffectiveDeveloperEnvironment(): NodeJS.ProcessEnv {
  if (process.platform !== "win32") {
    return { ...process.env };
  }
  const machine = readWindowsRegistryEnvironment(REGISTRY_ENV_KEYS[0]);
  const user = readWindowsRegistryEnvironment(REGISTRY_ENV_KEYS[1]);
  return mergeWindowsEnvironment(process.env, user, machine);
}

export function resolveDeveloperTool(toolId: DeveloperToolId, command: string): DeveloperToolResolution {
  const env = getEffectiveDeveloperEnvironment();
  return resolveDeveloperToolFromEnvironment(toolId, command, env);
}

export function mergeWindowsEnvironment(
  current: NodeJS.ProcessEnv,
  user: NodeJS.ProcessEnv,
  machine: NodeJS.ProcessEnv
): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = {};
  assignCaseInsensitive(merged, machine);
  assignCaseInsensitive(merged, user);
  assignCaseInsensitive(merged, current);
  expandEnvironmentValues(merged);

  const pathEntries = [
    ...splitPath(getCaseInsensitive(machine, "PATH")),
    ...splitPath(getCaseInsensitive(machine, "Path")),
    ...splitPath(getCaseInsensitive(user, "PATH")),
    ...splitPath(getCaseInsensitive(user, "Path")),
    ...splitPath(getCaseInsensitive(current, "PATH")),
    ...splitPath(getCaseInsensitive(current, "Path")),
    ...knownExistingToolDirectories(merged)
  ].map((entry) => expandWindowsEnvironmentValue(entry, merged));

  const mergedPath = dedupePathEntries(pathEntries).join(path.delimiter);
  deleteCaseInsensitive(merged, "PATH");
  merged.Path = mergedPath;
  merged.PATH = mergedPath;
  return merged;
}

export function resolveDeveloperToolFromEnvironment(
  toolId: DeveloperToolId,
  command: string,
  env: NodeJS.ProcessEnv,
  fileExists: (candidate: string) => boolean = fs.existsSync
): DeveloperToolResolution {
  const pathSearched = splitPath(getCaseInsensitive(env, "PATH") ?? getCaseInsensitive(env, "Path"));
  const fallbackLocationsChecked = knownToolFallbackDirectories(toolId, env);
  const pathMatch = findExecutable(command, pathSearched, fileExists);
  const fallbackMatch = pathMatch ?? findExecutable(command, fallbackLocationsChecked, fileExists);
  return {
    toolName: toolId,
    command,
    resolvedPath: fallbackMatch,
    pathSearched,
    fallbackLocationsChecked
  };
}

export function redactedDeveloperToolDiagnostic(resolution: DeveloperToolResolution): string {
  const resolved = resolution.resolvedPath ? `resolved at ${resolution.resolvedPath}` : "not resolved";
  return [
    `${resolution.toolName}: ${resolved}`,
    `PATH entries searched: ${resolution.pathSearched.length}`,
    `fallback locations checked: ${resolution.fallbackLocationsChecked.length}`
  ].join("; ");
}

function readWindowsRegistryEnvironment(key: string): NodeJS.ProcessEnv {
  try {
    const reg = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "reg.exe");
    const output = execFileSync(reg, ["query", key], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
      maxBuffer: 128 * 1024
    });
    return parseRegEnvironment(output);
  } catch {
    return {};
  }
}

function parseRegEnvironment(output: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s{2,}(.+?)\s+REG_(?:SZ|EXPAND_SZ|MULTI_SZ)\s+(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim();
    if (!key || /password|secret|token|key/i.test(key)) continue;
    env[key] = value;
  }
  return env;
}

function assignCaseInsensitive(target: NodeJS.ProcessEnv, source: NodeJS.ProcessEnv): void {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value !== "string") continue;
    deleteCaseInsensitive(target, key);
    target[key] = value;
  }
}

function deleteCaseInsensitive(env: NodeJS.ProcessEnv, key: string): void {
  for (const existing of Object.keys(env)) {
    if (existing.toLowerCase() === key.toLowerCase()) delete env[existing];
  }
}

function getCaseInsensitive(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const found = Object.keys(env).find((item) => item.toLowerCase() === key.toLowerCase());
  return found ? env[found] : undefined;
}

function splitPath(value: string | undefined): string[] {
  return (value ?? "").split(path.delimiter).map((entry) => entry.trim()).filter(Boolean);
}

function dedupePathEntries(entries: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of entries) {
    const normalized = path.resolve(entry).toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(entry);
  }
  return result;
}

function expandWindowsEnvironmentValue(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/%([^%]+)%/g, (match, name: string) => getCaseInsensitive(env, name) ?? match);
}

function expandEnvironmentValues(env: NodeJS.ProcessEnv): void {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== "string" || key.toLowerCase() === "path") continue;
    env[key] = expandWindowsEnvironmentValue(value, env);
  }
}

function knownExistingToolDirectories(env: NodeJS.ProcessEnv): string[] {
  return dedupePathEntries([
    ...knownToolFallbackDirectories("go", env),
    ...knownToolFallbackDirectories("rustc", env),
    ...knownToolFallbackDirectories("java", env),
    ...knownToolFallbackDirectories("adb", env),
    ...knownToolFallbackDirectories("node", env),
    ...knownToolFallbackDirectories("python", env),
    ...knownToolFallbackDirectories("dotnet", env),
    ...knownToolFallbackDirectories("flutter", env),
    ...knownToolFallbackDirectories("git", env)
  ]).filter((entry) => fs.existsSync(entry));
}

function knownToolFallbackDirectories(toolId: DeveloperToolId, env: NodeJS.ProcessEnv): string[] {
  const userProfile = getCaseInsensitive(env, "USERPROFILE") ?? os.homedir();
  const localAppData = getCaseInsensitive(env, "LOCALAPPDATA") ?? path.join(userProfile, "AppData", "Local");
  const programFiles = getCaseInsensitive(env, "ProgramFiles") ?? "C:\\Program Files";
  const programFilesX86 = getCaseInsensitive(env, "ProgramFiles(x86)") ?? "C:\\Program Files (x86)";
  const javaHome = getCaseInsensitive(env, "JAVA_HOME");
  const androidHome = getCaseInsensitive(env, "ANDROID_HOME") ?? getCaseInsensitive(env, "ANDROID_SDK_ROOT");
  const candidates: Record<DeveloperToolId, string[]> = {
    go: [path.join(programFiles, "Go", "bin")],
    rustc: [path.join(userProfile, ".cargo", "bin")],
    cargo: [path.join(userProfile, ".cargo", "bin")],
    java: [
      ...(javaHome ? [path.join(javaHome, "bin")] : []),
      path.join(programFiles, "Android", "Android Studio", "jbr", "bin")
    ],
    adb: [
      ...(androidHome ? [path.join(androidHome, "platform-tools")] : []),
      path.join(localAppData, "Android", "Sdk", "platform-tools")
    ],
    "android-sdk": [
      ...(androidHome ? [path.join(androidHome, "platform-tools")] : []),
      path.join(localAppData, "Android", "Sdk", "platform-tools")
    ],
    node: [path.dirname(process.execPath), path.join(programFiles, "nodejs"), path.join(programFilesX86, "nodejs")],
    npm: [path.dirname(process.execPath), path.join(programFiles, "nodejs"), path.join(programFilesX86, "nodejs")],
    python: [path.join(localAppData, "Programs", "Python"), path.join(programFiles, "Python314"), path.join(programFiles, "Python313")],
    dotnet: [path.join(programFiles, "dotnet"), path.join(programFilesX86, "dotnet")],
    flutter: [path.join(localAppData, "flutter", "bin"), "C:\\src\\flutter\\bin"],
    git: [path.join(programFiles, "Git", "cmd"), path.join(programFiles, "Git", "bin")]
  };
  return candidates[toolId].map((entry) => expandWindowsEnvironmentValue(entry, env));
}

function findExecutable(
  command: string,
  directories: string[],
  fileExists: (candidate: string) => boolean
): string | undefined {
  if (path.isAbsolute(command)) return fileExists(command) ? command : undefined;
  const extensions = path.extname(command)
    ? [""]
    : process.platform === "win32"
      ? WINDOWS_EXECUTABLE_EXTENSIONS
      : [""];
  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`);
      if (fileExists(candidate)) return candidate;
    }
  }
  return undefined;
}
