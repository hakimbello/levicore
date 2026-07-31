import path from "node:path";

const MAX_ENV_FILE_BYTES = 256 * 1024;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertSafeRelativeEnvPath(value: string): string {
  const normalized = value.replace(/\\/g, "/").trim();
  if (!normalized || normalized.includes("\0") || normalized.length > 500) {
    throw new Error("envFile path is invalid.");
  }
  if (normalized.startsWith("/") || normalized.startsWith("../") || normalized.includes("/../") || normalized === "..") {
    throw new Error("envFile must be workspace-relative.");
  }
  return normalized;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseEnvFileContent(content: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    entries[key] = unquote(line.slice(separator + 1));
    if (Object.keys(entries).length >= 256) break;
  }
  return entries;
}

export async function loadEnvFile(
  workspaceRoot: string,
  envFile: string,
  readFile: (targetPath: string) => Promise<string>
): Promise<Record<string, string>> {
  const relativePath = assertSafeRelativeEnvPath(envFile);
  const absolutePath = path.resolve(workspaceRoot, relativePath);
  const content = await readFile(absolutePath);
  if (content.length > MAX_ENV_FILE_BYTES) {
    throw new Error("envFile exceeds the maximum allowed size.");
  }
  if (content.includes("\0")) {
    throw new Error("envFile must be UTF-8 text.");
  }
  return parseEnvFileContent(content);
}

export function mergeLaunchEnvironment(
  base: Record<string, string | undefined>,
  envFileValues: Record<string, string>,
  launchEnv?: Record<string, string>
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (typeof value === "string") merged[key] = value;
  }
  for (const [key, value] of Object.entries(envFileValues)) {
    merged[key] = value;
  }
  if (launchEnv) {
    for (const [key, value] of Object.entries(launchEnv)) {
      merged[key] = value;
    }
  }
  return merged;
}

export function redactEnvironmentForDiagnostics(env: Record<string, string>): Record<string, string> {
  const sensitive = /(key|token|secret|password|passwd|credential|auth)/i;
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, sensitive.test(key) ? "[redacted]" : value.length > 120 ? `${value.slice(0, 117)}…` : value])
  );
}

export { assertSafeRelativeEnvPath, MAX_ENV_FILE_BYTES };
