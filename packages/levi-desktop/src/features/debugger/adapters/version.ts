export function normalizeVersion(value: string): string {
  const match = value.match(/(\d+(?:\.\d+){0,3})/);
  return match?.[1] ?? value.trim();
}

export function compareVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left).split(".").map((part) => Number(part) || 0);
  const rightParts = normalizeVersion(right).split(".").map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

export function isVersionCompatible(detected: string | undefined, minimum: string | undefined): boolean {
  if (!minimum) return true;
  if (!detected) return false;
  return compareVersions(detected, minimum) >= 0;
}

export function parseVersionOutput(output: string): string | undefined {
  const trimmed = output.trim();
  if (!trimmed) return undefined;
  return normalizeVersion(trimmed);
}
