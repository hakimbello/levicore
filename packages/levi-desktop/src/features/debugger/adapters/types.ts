import type { DebugLaunchConfiguration } from "../DebugEvents";

export type DebugAdapterRequestType = "launch" | "attach";

export type DebugAdapterDiscoverySource =
  | "workspace-dependency"
  | "project-binary"
  | "path"
  | "known-directory"
  | "levi-managed"
  | "environment"
  | "custom";

export type DebugAdapterInstallState =
  | "installed"
  | "missing"
  | "invalid"
  | "incompatible"
  | "installing"
  | "update-available";

export type DebugAdapterDiscoveryRule =
  | { kind: "workspace-relative"; relativePaths: string[] }
  | { kind: "path-name"; names: string[]; extensions?: string[] }
  | { kind: "known-directory"; directories: string[]; relativePaths: string[] }
  | { kind: "levi-managed"; relativePath: string }
  | { kind: "environment"; variableSuffix: string };

export type DebugAdapterInstallationOption = {
  id: string;
  label: string;
  kind: "npm-package" | "direct-download" | "python-package";
  npmPackage?: {
    name: string;
    version: string;
    entryRelativePath: string;
    launcher: "node";
  };
  directDownload?: {
    url: string;
    sha256: string;
    filename: string;
    entryRelativePath: string;
    launcher: "node" | "direct";
  };
  pythonPackage?: {
    name: string;
    version: string;
    module: string;
    launcher: "python";
  };
};

export type DebugAdapterLaunchCommandTemplate = {
  launcher: "node" | "python" | "direct";
  entryRelativePath?: string;
  fixedArgs?: string[];
};

export type DebugAdapterDefinition = {
  id: string;
  displayName: string;
  languages: string[];
  requestTypes: DebugAdapterRequestType[];
  minimumVersion?: string;
  versionCommand?: {
    launcher: "node" | "python" | "direct";
    args: string[];
  };
  capabilities?: Record<string, boolean>;
  installationOptions: DebugAdapterInstallationOption[];
  discoveryRules: DebugAdapterDiscoveryRule[];
  launchCommand: DebugAdapterLaunchCommandTemplate;
};

export type DebugAdapterResolvedCommand = {
  command: string;
  args: string[];
  launcher: "node" | "python" | "direct";
  entryPath?: string;
};

export type DebugAdapterDiscoveryResult = {
  adapterId: string;
  state: DebugAdapterInstallState;
  executablePath?: string;
  entryPath?: string;
  detectedVersion?: string;
  source?: DebugAdapterDiscoverySource;
  message?: string;
  launcher?: "node" | "python" | "direct";
};

export type DebugAdapterStatus = {
  id: string;
  displayName: string;
  languages: string[];
  requestTypes: DebugAdapterRequestType[];
  state: DebugAdapterInstallState;
  executablePath?: string;
  entryPath?: string;
  detectedVersion?: string;
  installedVersion?: string;
  source?: DebugAdapterDiscoverySource;
  message?: string;
  trusted?: boolean;
  installPath?: string;
  capabilities?: Record<string, boolean>;
  minimumVersion?: string;
};

export type DebugAdapterRecommendation = {
  adapterId: string;
  displayName: string;
  reason: string;
};

export type DebugLaunchAdapterDiagnostic = {
  adapterId: string;
  configurationName?: string;
  state: DebugAdapterInstallState;
  message: string;
  action?: "install" | "configure" | "trust" | "update" | "rescan";
};

export type DebugAdapterInstallProgress = {
  adapterId: string;
  phase: "download" | "extract" | "install" | "complete" | "cancelled" | "failed";
  percent?: number;
  message?: string;
};

export type TrustedCustomAdapterDefinition = {
  id: string;
  displayName: string;
  executablePath: string;
  args?: string[];
  languages: string[];
  requestTypes: DebugAdapterRequestType[];
  trustedAt: string;
};

export type DebugAdapterPersistenceState = {
  trustedCustomAdapters: TrustedCustomAdapterDefinition[];
  installationMetadata: Record<
    string,
    {
      version: string;
      path: string;
      installedAt: string;
      optionId: string;
    }
  >;
  discoveryCache: Record<
    string,
    {
      executablePath: string;
      entryPath?: string;
      version?: string;
      executableMtimeMs: number;
      cachedAt: string;
    }
  >;
  dismissedRecommendations: string[];
};

export type DebugAdapterInstallRequest = {
  adapterId: string;
  optionId: string;
  confirmed: boolean;
};

export type DebugAdapterUninstallRequest = {
  adapterId: string;
  confirmed: boolean;
};

export type DebugAdapterRegisterCustomRequest = {
  adapter: {
    id: string;
    displayName: string;
    executablePath: string;
    args?: string[];
    languages: string[];
    requestTypes: DebugAdapterRequestType[];
  };
  confirmed: boolean;
};

export type DebugAdapterBuildContext = {
  workspaceRoot?: string;
  leviAdapterRoot: string;
  pathEntries: string[];
  environment: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  fileExists: (targetPath: string) => Promise<boolean>;
  readFile: (targetPath: string) => Promise<string>;
  stat: (targetPath: string) => Promise<{ mtimeMs: number; isFile: () => boolean; isDirectory: () => boolean }>;
};

export function buildAdapterSpawnCommand(
  definition: DebugAdapterDefinition,
  discovery: DebugAdapterDiscoveryResult,
  _configuration: DebugLaunchConfiguration
): DebugAdapterResolvedCommand | null {
  if (!discovery.executablePath) return null;
  const launcher = discovery.launcher ?? definition.launchCommand.launcher;
  if (launcher === "direct") {
    return {
      command: discovery.entryPath ?? discovery.executablePath,
      args: definition.launchCommand.fixedArgs ?? [],
      launcher,
      entryPath: discovery.entryPath ?? discovery.executablePath
    };
  }
  const entryPath = discovery.entryPath;
  if (!entryPath) return null;
  if (launcher === "python" && definition.launchCommand.fixedArgs?.length) {
    return {
      command: discovery.executablePath,
      args: [...definition.launchCommand.fixedArgs, definition.launchCommand.entryRelativePath ?? "debugpy.adapter"],
      launcher,
      entryPath
    };
  }
  return {
    command: discovery.executablePath,
    args: [...(definition.launchCommand.fixedArgs ?? []), entryPath],
    launcher,
    entryPath
  };
}
