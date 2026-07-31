import type { DebugLaunchConfiguration } from "../../src/features/debugger/DebugEvents";
import { resolveConfigurationAdapterId } from "../../src/features/debugger/adapters/registry";

export type ResolvedLaunchArguments = {
  request: "launch" | "attach";
  arguments: Record<string, unknown>;
};

export function buildDapLaunchArguments(
  configuration: DebugLaunchConfiguration,
  options?: { browserExecutable?: string; nodeRuntime?: string }
): ResolvedLaunchArguments {
  const adapterId = resolveConfigurationAdapterId(configuration);
  const request = configuration.request;
  const base: Record<string, unknown> = {
    name: configuration.name,
    type: mapDapType(configuration.type, adapterId),
    request,
    cwd: configuration.cwd,
    env: configuration.env,
    stopOnEntry: configuration.stopOnEntry,
    console: configuration.console ?? "internalConsole",
    internalConsoleOptions: configuration.internalConsoleOptions,
    sourceMaps: configuration.sourceMaps,
    outFiles: configuration.outFiles,
    skipFiles: configuration.skipFiles,
    justMyCode: configuration.justMyCode
  };

  if (adapterId === "node") {
    Object.assign(base, {
      program: configuration.program,
      args: configuration.args,
      runtimeArgs: configuration.runtimeArgs,
      runtimeExecutable: configuration.runtimeExecutable ?? options?.nodeRuntime,
      runtimeVersion: configuration.runtimeVersion,
      port: configuration.port,
      address: configuration.host,
      sourceMaps: configuration.sourceMaps ?? true,
      resolveSourceMapLocations: configuration.outFiles ?? ["${workspaceFolder}/**", "!**/node_modules/**"]
    });
  } else if (adapterId === "python") {
    Object.assign(base, {
      program: configuration.program,
      module: configuration.module,
      args: configuration.args,
      python: configuration.python ?? configuration.runtimeExecutable,
      port: configuration.port,
      host: configuration.host,
      django: false,
      jinja: false,
      justMyCode: configuration.justMyCode ?? true
    });
  } else if (adapterId === "chrome") {
    Object.assign(base, {
      url: configuration.url,
      webRoot: configuration.webRoot,
      port: configuration.port ?? (configuration.dap?.port as number | undefined),
      address: configuration.host ?? (configuration.dap?.address as string | undefined),
      sourceMaps: configuration.sourceMaps ?? true,
      runtimeExecutable: options?.browserExecutable ?? configuration.browserExecutablePath,
      file: configuration.program,
      ...(configuration.dap ?? {})
    });
  } else {
    Object.assign(base, configuration.dap ?? {});
    if (configuration.program) base.program = configuration.program;
    if (configuration.args) base.args = configuration.args;
  }

  return { request, arguments: base };
}

function mapDapType(type: string, adapterId: string): string {
  if (adapterId === "node") return type === "node" ? "pwa-node" : type;
  if (adapterId === "python") return type === "python" ? "debugpy" : type;
  if (adapterId === "chrome") {
    if (type === "chrome" || type === "pwa-chrome") return "pwa-chrome";
    if (type === "msedge") return "pwa-msedge";
    return type;
  }
  return type;
}
