import type {
  DebugCompoundConfiguration,
  DebugLaunchConfiguration,
  DebugLaunchConfigurationEntry
} from "../../src/features/debugger/DebugEvents";

export type ParsedLaunchFile = {
  configurations: DebugLaunchConfigurationEntry[];
  compounds: DebugCompoundConfiguration[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseCompoundConfigurations(
  value: unknown,
  configurationNames: Set<string>,
  source: DebugLaunchConfigurationEntry["source"]
): DebugCompoundConfiguration[] {
  if (!Array.isArray(value)) return [];
  const compounds: DebugCompoundConfiguration[] = [];
  for (const item of value.slice(0, 32)) {
    if (!isPlainObject(item)) continue;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!name || name.length > 120) continue;
    if (!Array.isArray(item.configurations) || item.configurations.length === 0 || item.configurations.length > 16) continue;
    const configurations = item.configurations
      .filter((entry): entry is string => typeof entry === "string" && entry.length > 0 && entry.length <= 120)
      .filter((entry) => configurationNames.has(entry));
    if (configurations.length === 0) continue;
    if (configurations.includes(name)) {
      throw new Error(`Compound "${name}" cannot reference itself.`);
    }
    compounds.push({
      name,
      configurations,
      stopAll: item.stopAll === true
    });
  }
  return compounds;
}

export function validateCompoundStart(
  compound: DebugCompoundConfiguration,
  compounds: DebugCompoundConfiguration[],
  stack: string[] = []
): void {
  if (stack.includes(compound.name)) {
    throw new Error(`Recursive compound configuration detected: ${[...stack, compound.name].join(" → ")}`);
  }
  const nextStack = [...stack, compound.name];
  for (const configName of compound.configurations) {
    const nested = compounds.find((item) => item.name === configName);
    if (nested) validateCompoundStart(nested, compounds, nextStack);
  }
}

export function findLaunchConfiguration(
  configurations: DebugLaunchConfigurationEntry[],
  name: string
): DebugLaunchConfiguration | undefined {
  return configurations.find((entry) => entry.name === name)?.configuration;
}

export function findCompound(compounds: DebugCompoundConfiguration[], name: string): DebugCompoundConfiguration | undefined {
  return compounds.find((item) => item.name === name);
}

export type DebugTaskOrchestrationResult = {
  supported: boolean;
  success: boolean;
  message?: string;
};

export function runDebugTaskBoundary(taskName: string | undefined, phase: "preLaunch" | "postDebug"): DebugTaskOrchestrationResult {
  if (!taskName) {
    return { supported: true, success: true };
  }
  return {
    supported: false,
    success: false,
    message: `${phase === "preLaunch" ? "preLaunchTask" : "postDebugTask"} "${taskName}" is not supported because Levi does not yet provide a task runner. Remove the task reference or run the task manually before debugging.`
  };
}
