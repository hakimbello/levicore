import type { DebugAdapterDefinition } from "./types";

export const JS_DEBUG_ENTRY = "node_modules/@vscode/js-debug/src/dapDebugServer.js";
export const JS_DEBUG_LEGACY_ENTRY = "node_modules/js-debug/src/dapDebugServer.js";

export const BUILTIN_ADAPTER_REGISTRY: DebugAdapterDefinition[] = [
  {
    id: "node",
    displayName: "Node.js / JavaScript / TypeScript",
    languages: ["javascript", "typescript", "javascriptreact", "typescriptreact"],
    requestTypes: ["launch", "attach"],
    minimumVersion: "18.0.0",
    versionCommand: { launcher: "node", args: ["--version"] },
    capabilities: { conditionalBreakpoints: true, exceptionBreakpoints: true, completions: true },
    discoveryRules: [
      { kind: "workspace-relative", relativePaths: [JS_DEBUG_ENTRY, JS_DEBUG_LEGACY_ENTRY] },
      { kind: "levi-managed", relativePath: "node/current/entry.js" },
      { kind: "path-name", names: ["node", "node.exe"] },
      { kind: "environment", variableSuffix: "NODE" }
    ],
    installationOptions: [
      {
        id: "npm-js-debug",
        label: "Install @vscode/js-debug (Levi-managed)",
        kind: "npm-package",
        npmPackage: {
          name: "@vscode/js-debug",
          version: "1.97.1",
          entryRelativePath: "node_modules/@vscode/js-debug/src/dapDebugServer.js",
          launcher: "node"
        }
      }
    ],
    launchCommand: { launcher: "node", fixedArgs: [] }
  },
  {
    id: "python",
    displayName: "Python",
    languages: ["python"],
    requestTypes: ["launch", "attach"],
    minimumVersion: "3.9.0",
    versionCommand: { launcher: "python", args: ["--version"] },
    capabilities: { conditionalBreakpoints: true, exceptionBreakpoints: true },
    discoveryRules: [
      {
        kind: "workspace-relative",
        relativePaths: [
          ".venv/Scripts/python.exe",
          ".venv/bin/python",
          "venv/Scripts/python.exe",
          "venv/bin/python"
        ]
      },
      { kind: "levi-managed", relativePath: "python/current/python.exe" },
      { kind: "path-name", names: ["python", "python3", "python.exe", "python3.exe"] },
      { kind: "environment", variableSuffix: "PYTHON" }
    ],
    installationOptions: [
      {
        id: "pip-debugpy",
        label: "Install debugpy (Levi-managed)",
        kind: "python-package",
        pythonPackage: {
          name: "debugpy",
          version: "1.8.12",
          module: "debugpy.adapter",
          launcher: "python"
        }
      }
    ],
    launchCommand: { launcher: "python", fixedArgs: ["-m"], entryRelativePath: "debugpy.adapter" }
  },
  {
    id: "chrome",
    displayName: "Chrome / Edge",
    languages: ["javascript", "typescript"],
    requestTypes: ["attach"],
    capabilities: { conditionalBreakpoints: true },
    discoveryRules: [
      { kind: "workspace-relative", relativePaths: [JS_DEBUG_ENTRY, JS_DEBUG_LEGACY_ENTRY] },
      { kind: "levi-managed", relativePath: "node/current/entry.js" },
      { kind: "path-name", names: ["chrome", "chrome.exe", "msedge", "msedge.exe"] },
      { kind: "environment", variableSuffix: "CHROME" }
    ],
    installationOptions: [
      {
        id: "npm-js-debug-chrome",
        label: "Install @vscode/js-debug for browser attach",
        kind: "npm-package",
        npmPackage: {
          name: "@vscode/js-debug",
          version: "1.97.1",
          entryRelativePath: "node_modules/@vscode/js-debug/src/dapDebugServer.js",
          launcher: "node"
        }
      }
    ],
    launchCommand: { launcher: "node", fixedArgs: [] }
  },
  {
    id: "custom",
    displayName: "User-defined DAP adapter",
    languages: [],
    requestTypes: ["launch", "attach"],
    capabilities: {},
    discoveryRules: [],
    installationOptions: [],
    launchCommand: { launcher: "direct", fixedArgs: [] }
  }
];

export function getAdapterDefinition(adapterId: string): DebugAdapterDefinition | undefined {
  return BUILTIN_ADAPTER_REGISTRY.find((item) => item.id === adapterId);
}

export function normalizeAdapterId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").toLowerCase();
}

export function resolveConfigurationAdapterId(configuration: { adapterId?: string; type: string }): string {
  const raw = configuration.adapterId ?? configuration.type;
  const normalized = normalizeAdapterId(raw);
  if (normalized === "pwa-node" || normalized === "node2") return "node";
  if (normalized === "debugpy") return "python";
  if (normalized === "pwa-chrome" || normalized === "msedge") return "chrome";
  return getAdapterDefinition(normalized) ? normalized : raw;
}
