export function getProjectDisplayName(projectPath: string): string {
  const normalized = projectPath.replace(/\\/g, "/").replace(/\/$/, "");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || "Project";
}
