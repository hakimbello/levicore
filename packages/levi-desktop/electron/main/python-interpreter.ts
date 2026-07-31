import path from "node:path";
import type { DebugLaunchConfiguration } from "../../src/features/debugger/DebugEvents";

type FileProbe = (targetPath: string) => Promise<boolean>;

const VENV_PYTHON_CANDIDATES = [
  ".venv/Scripts/python.exe",
  ".venv/bin/python",
  "venv/Scripts/python.exe",
  "venv/bin/python",
  ".conda/python.exe",
  ".conda/bin/python"
];

export async function resolvePythonInterpreter(
  workspaceRoot: string,
  configuration: DebugLaunchConfiguration,
  fileExists: FileProbe
): Promise<string | undefined> {
  const candidates: string[] = [];
  if (configuration.python) candidates.push(configuration.python);
  if (configuration.runtimeExecutable) candidates.push(configuration.runtimeExecutable);
  for (const relative of VENV_PYTHON_CANDIDATES) {
    candidates.push(relative);
  }

  for (const candidate of candidates) {
    const absolute = path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(workspaceRoot, candidate);
    if (await fileExists(absolute)) return absolute;
  }
  return undefined;
}

export function resolveDebugpySitePackages(leviAdapterRoot: string, adapterId = "python"): string | undefined {
  const current = path.join(leviAdapterRoot, adapterId, "current");
  return current;
}

export function buildPythonAdapterEnvironment(params: {
  leviAdapterRoot: string;
  existingEnv: Record<string, string | undefined>;
  managedInstallPath?: string;
}): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(params.existingEnv)) {
    if (typeof value === "string") merged[key] = value;
  }
  const sitePackages = params.managedInstallPath ?? path.join(params.leviAdapterRoot, "python", "current");
  const existing = merged.PYTHONPATH;
  merged.PYTHONPATH = existing ? `${sitePackages}${path.delimiter}${existing}` : sitePackages;
  return merged;
}

export async function discoverBrowserExecutable(
  configuration: DebugLaunchConfiguration,
  fileExists: FileProbe
): Promise<string | undefined> {
  if (configuration.browserExecutablePath) {
    if (await fileExists(configuration.browserExecutablePath)) {
      return configuration.browserExecutablePath;
    }
    return undefined;
  }
  const defaults =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
        ]
      : process.platform === "darwin"
        ? [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
          ]
        : ["/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"];
  for (const candidate of defaults) {
    if (await fileExists(candidate)) return candidate;
  }
  return undefined;
}
