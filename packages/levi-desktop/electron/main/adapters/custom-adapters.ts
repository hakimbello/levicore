import path from "node:path";
import type { DebugAdapterRequestType, TrustedCustomAdapterDefinition } from "../../../src/features/debugger/adapters/types";
import { normalizeAdapterId } from "../../../src/features/debugger/adapters/registry";

const ADAPTER_ID_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const MAX_ARGS = 64;
const MAX_LANGUAGES = 32;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertAdapterId(value: unknown): string {
  if (typeof value !== "string" || !ADAPTER_ID_PATTERN.test(value)) {
    throw new Error("Adapter id must be a lowercase identifier.");
  }
  return value;
}

function assertAbsoluteExecutable(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error(`${fieldName} must be an absolute executable path.`);
  }
  if (!path.isAbsolute(value)) {
    throw new Error(`${fieldName} must be absolute.`);
  }
  if (/[;&|`$<>]/.test(value)) {
    throw new Error(`${fieldName} contains invalid shell characters.`);
  }
  return path.normalize(value);
}

function assertStringArray(value: unknown, fieldName: string, maxItems: number): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new Error(`${fieldName} must be a bounded string array.`);
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || item.length === 0 || item.length > 500 || /[;&|`$<>]/.test(item)) {
      throw new Error(`${fieldName}[${index}] is invalid.`);
    }
    return item;
  });
}

function assertRequestTypes(value: unknown): DebugAdapterRequestType[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 2) {
    throw new Error("requestTypes must include launch and/or attach.");
  }
  const types = value.map((item) => {
    if (item !== "launch" && item !== "attach") {
      throw new Error("requestTypes entries must be launch or attach.");
    }
    return item;
  });
  return [...new Set(types)];
}

export function validateCustomAdapterDefinition(value: unknown): Omit<TrustedCustomAdapterDefinition, "trustedAt"> {
  if (!isPlainObject(value)) {
    throw new Error("Custom adapter definition is invalid.");
  }
  return {
    id: assertAdapterId(value.id),
    displayName: typeof value.displayName === "string" && value.displayName.length <= 120 ? value.displayName : "Custom adapter",
    executablePath: assertAbsoluteExecutable(value.executablePath, "executablePath"),
    args: assertStringArray(value.args, "args", MAX_ARGS),
    languages: (assertStringArray(value.languages, "languages", MAX_LANGUAGES) ?? []).map((item) => item.toLowerCase()),
    requestTypes: assertRequestTypes(value.requestTypes ?? ["launch", "attach"])
  };
}

export function validateCustomAdapterFile(value: unknown): Omit<TrustedCustomAdapterDefinition, "trustedAt">[] {
  if (!isPlainObject(value)) {
    throw new Error("debug-adapters.json must be an object.");
  }
  const adapters = value.adapters;
  if (!Array.isArray(adapters) || adapters.length > 16) {
    throw new Error("debug-adapters.json adapters must be a bounded array.");
  }
  const seen = new Set<string>();
  return adapters.map((item) => {
    const validated = validateCustomAdapterDefinition(item);
    const normalized = normalizeAdapterId(validated.id);
    if (seen.has(normalized)) {
      throw new Error(`Duplicate custom adapter id "${validated.id}".`);
    }
    seen.add(normalized);
    return validated;
  });
}

export function containsShellInjection(value: string): boolean {
  return /[;&|`$<>]/.test(value) || value.includes("&&") || value.includes("||");
}
