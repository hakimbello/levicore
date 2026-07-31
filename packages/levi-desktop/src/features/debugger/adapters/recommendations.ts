import path from "node:path";
import type { DebugAdapterRecommendation } from "./types";
import { BUILTIN_ADAPTER_REGISTRY } from "./registry";

type RecommendationContext = {
  workspaceRoot?: string;
  fileExists: (targetPath: string) => Promise<boolean>;
  dismissed: Set<string>;
};

async function exists(context: RecommendationContext, relativePath: string): Promise<boolean> {
  if (!context.workspaceRoot) return false;
  return context.fileExists(path.resolve(context.workspaceRoot, relativePath));
}

export async function recommendAdapters(context: RecommendationContext): Promise<DebugAdapterRecommendation[]> {
  if (!context.workspaceRoot) return [];
  const recommendations: DebugAdapterRecommendation[] = [];
  const push = (adapterId: string, reason: string) => {
    if (context.dismissed.has(adapterId)) return;
    const definition = BUILTIN_ADAPTER_REGISTRY.find((item) => item.id === adapterId);
    if (!definition) return;
    recommendations.push({
      adapterId,
      displayName: definition.displayName,
      reason
    });
  };

  if (await exists(context, "package.json")) {
    push("node", "Detected package.json in the workspace.");
  }
  if (
    (await exists(context, "pyproject.toml")) ||
    (await exists(context, "requirements.txt")) ||
    (await exists(context, "Pipfile"))
  ) {
    push("python", "Detected Python project files in the workspace.");
  }
  if (await exists(context, ".vscode/launch.json")) {
    push("chrome", "Detected VS Code launch configuration that may include browser debugging.");
  }

  return recommendations;
}
