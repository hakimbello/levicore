import path from "node:path";
import type {
  DebugAdapterBuildContext,
  DebugAdapterDefinition,
  DebugAdapterDiscoveryResult,
  DebugAdapterDiscoverySource,
  TrustedCustomAdapterDefinition
} from "./types";
import { JS_DEBUG_ENTRY, JS_DEBUG_LEGACY_ENTRY } from "./registry";

function envAdapterPath(context: DebugAdapterBuildContext, suffix: string): string | undefined {
  const key = `LEVI_DEBUG_ADAPTER_${suffix}`;
  const value = context.environment[key];
  if (!value || !path.isAbsolute(value)) return undefined;
  return value;
}

function envAdapterArgs(context: DebugAdapterBuildContext, suffix: string): string[] {
  const key = `LEVI_DEBUG_ADAPTER_ARGS_${suffix}`;
  const raw = context.environment[key];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string").slice(0, 64);
  } catch {
    return [];
  }
}

async function firstExisting(context: DebugAdapterBuildContext, candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (await context.fileExists(candidate)) return candidate;
  }
  return undefined;
}

async function discoverFromWorkspace(
  context: DebugAdapterBuildContext,
  relativePaths: string[]
): Promise<{ executablePath: string; entryPath?: string; source: DebugAdapterDiscoverySource } | null> {
  if (!context.workspaceRoot) return null;
  for (const relativePath of relativePaths) {
    const absolute = path.resolve(context.workspaceRoot, relativePath);
    if (!(await context.fileExists(absolute))) continue;
    if (relativePath.endsWith(".js")) {
      const node = await findPathExecutable(context, ["node", "node.exe"]);
      if (!node) continue;
      return { executablePath: node, entryPath: absolute, source: "workspace-dependency" };
    }
    return { executablePath: absolute, source: "workspace-dependency" };
  }
  return null;
}

async function findPathExecutable(context: DebugAdapterBuildContext, names: string[]): Promise<string | undefined> {
  for (const directory of context.pathEntries) {
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (await context.fileExists(candidate)) return candidate;
    }
  }
  return undefined;
}

async function discoverFromLeviManaged(
  context: DebugAdapterBuildContext,
  relativePath: string,
  definition: DebugAdapterDefinition
): Promise<{ executablePath: string; entryPath?: string; source: DebugAdapterDiscoverySource } | null> {
  const absolute = path.resolve(context.leviAdapterRoot, relativePath);
  if (!(await context.fileExists(absolute))) return null;
  if (definition.launchCommand.launcher === "node") {
    const node = await findPathExecutable(context, ["node", "node.exe"]);
    if (!node) return null;
    return { executablePath: node, entryPath: absolute, source: "levi-managed" };
  }
  if (definition.launchCommand.launcher === "python") {
    return { executablePath: absolute, source: "levi-managed" };
  }
  return { executablePath: absolute, source: "levi-managed" };
}

async function discoverJsDebugEntry(context: DebugAdapterBuildContext): Promise<string | undefined> {
  const workspaceHit = await discoverFromWorkspace(context, [JS_DEBUG_ENTRY, JS_DEBUG_LEGACY_ENTRY]);
  if (workspaceHit?.entryPath) return workspaceHit.entryPath;
  const managedHit = await discoverFromLeviManaged(context, "node/current/entry.js", {
    id: "node",
    launchCommand: { launcher: "node" }
  } as DebugAdapterDefinition);
  return managedHit?.entryPath;
}

export async function discoverAdapter(
  definition: DebugAdapterDefinition,
  context: DebugAdapterBuildContext,
  customAdapter?: TrustedCustomAdapterDefinition
): Promise<DebugAdapterDiscoveryResult> {
  if (definition.id === "custom") {
    if (!customAdapter) {
      return { adapterId: "custom", state: "missing", message: "No trusted custom adapter is configured." };
    }
    if (!(await context.fileExists(customAdapter.executablePath))) {
      return {
        adapterId: "custom",
        state: "invalid",
        executablePath: customAdapter.executablePath,
        source: "custom",
        message: "Custom adapter executable is missing."
      };
    }
    return {
      adapterId: "custom",
      state: "installed",
      executablePath: customAdapter.executablePath,
      source: "custom",
      launcher: "direct",
      message: customAdapter.displayName
    };
  }

  const envSuffix = definition.id.toUpperCase();
  const envPath = envAdapterPath(context, envSuffix);
  if (envPath && (await context.fileExists(envPath))) {
    const args = envAdapterArgs(context, envSuffix);
    if (args.length > 0) {
      const node = await findPathExecutable(context, ["node", "node.exe"]);
      if (node) {
        return {
          adapterId: definition.id,
          state: "installed",
          executablePath: node,
          entryPath: envPath,
          source: "environment",
          launcher: "node"
        };
      }
    }
    return {
      adapterId: definition.id,
      state: "installed",
      executablePath: envPath,
      source: "environment",
      launcher: "direct"
    };
  }

  for (const rule of definition.discoveryRules) {
    if (rule.kind === "workspace-relative") {
      const hit = await discoverFromWorkspace(context, rule.relativePaths);
      if (hit) {
        const launcher =
          hit.entryPath && definition.launchCommand.launcher === "node"
            ? "node"
            : definition.launchCommand.launcher;
        return {
          adapterId: definition.id,
          state: "installed",
          executablePath: hit.executablePath,
          entryPath: hit.entryPath,
          source: hit.source,
          launcher
        };
      }
    }
    if (rule.kind === "levi-managed") {
      const hit = await discoverFromLeviManaged(context, rule.relativePath, definition);
      if (hit) {
        return {
          adapterId: definition.id,
          state: "installed",
          executablePath: hit.executablePath,
          entryPath: hit.entryPath ?? hit.executablePath,
          source: hit.source,
          launcher: definition.launchCommand.launcher
        };
      }
    }
    if (rule.kind === "path-name") {
      const executable = await findPathExecutable(context, rule.names);
      if (executable) {
        if (definition.id === "node" || definition.id === "chrome") {
          const entryPath = await discoverJsDebugEntry(context);
          if (entryPath) {
            return {
              adapterId: definition.id,
              state: "installed",
              executablePath: executable,
              entryPath,
              source: "path",
              launcher: "node"
            };
          }
        }
        if (definition.id === "python") {
          return {
            adapterId: definition.id,
            state: "installed",
            executablePath: executable,
            source: "path",
            launcher: "python"
          };
        }
        return {
          adapterId: definition.id,
          state: "installed",
          executablePath: executable,
          source: "path",
          launcher: definition.launchCommand.launcher
        };
      }
    }
    if (rule.kind === "known-directory") {
      for (const directory of rule.directories) {
        for (const relativePath of rule.relativePaths) {
          const candidate = path.join(directory, relativePath);
          if (await context.fileExists(candidate)) {
            return {
              adapterId: definition.id,
              state: "installed",
              executablePath: candidate,
              source: "known-directory",
              launcher: definition.launchCommand.launcher
            };
          }
        }
      }
    }
  }

  return {
    adapterId: definition.id,
    state: "missing",
    message: `${definition.displayName} was not found. Install or configure an adapter.`
  };
}

export async function discoverAllAdapters(
  definitions: DebugAdapterDefinition[],
  context: DebugAdapterBuildContext,
  customAdapters: TrustedCustomAdapterDefinition[]
): Promise<DebugAdapterDiscoveryResult[]> {
  const results: DebugAdapterDiscoveryResult[] = [];
  for (const definition of definitions) {
    if (definition.id === "custom") {
      for (const custom of customAdapters) {
        results.push(await discoverAdapter(definition, context, custom));
      }
      if (customAdapters.length === 0) {
        results.push(await discoverAdapter(definition, context));
      }
      continue;
    }
    results.push(await discoverAdapter(definition, context));
  }
  return results;
}
