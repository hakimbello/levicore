import path from "node:path";
import type { TaskProblem, TaskProblemSeverity } from "./task-types";

export type ProblemMatcherDefinition = {
  id: string;
  owner: string;
  pattern: RegExp;
  severity?: TaskProblemSeverity;
  fileIndex: number;
  lineIndex: number;
  columnIndex: number;
  messageIndex: number;
  severityIndex?: number;
};

const MATCHERS: ProblemMatcherDefinition[] = [
  {
    id: "$tsc",
    owner: "typescript",
    pattern: /^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)$/,
    fileIndex: 1,
    lineIndex: 2,
    columnIndex: 3,
    severityIndex: 4,
    messageIndex: 5
  },
  {
    id: "$eslint-compact",
    owner: "eslint",
    pattern: /^(.+):\s+line\s+(\d+),\s+col\s+(\d+),\s+(Error|Warning|Info)\s+-\s+(.+)$/,
    fileIndex: 1,
    lineIndex: 2,
    columnIndex: 3,
    severityIndex: 4,
    messageIndex: 5
  },
  {
    id: "$eslint-stylish",
    owner: "eslint",
    pattern: /^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+(.+)$/,
    fileIndex: 4,
    lineIndex: 1,
    columnIndex: 2,
    severityIndex: 3,
    messageIndex: 4
  },
  {
    id: "$pytest",
    owner: "pytest",
    pattern: /^(.+):(\d+):\s+(.*)$/,
    severity: "error",
    fileIndex: 1,
    lineIndex: 2,
    columnIndex: 0,
    messageIndex: 3
  },
  {
    id: "$cargo",
    owner: "cargo",
    pattern: /^(error|warning)\[.*\]:\s+(.+)$/,
    severityIndex: 1,
    fileIndex: 0,
    lineIndex: 0,
    columnIndex: 0,
    messageIndex: 2
  },
  {
    id: "$cargo-location",
    owner: "cargo",
    pattern: /^\s*-->\s+(.+):(\d+):(\d+)$/,
    fileIndex: 1,
    lineIndex: 2,
    columnIndex: 3,
    messageIndex: 0
  },
  {
    id: "$go",
    owner: "go",
    pattern: /^(.+\.go):(\d+):(\d+):\s+(.+)$/,
    severity: "error",
    fileIndex: 1,
    lineIndex: 2,
    columnIndex: 3,
    messageIndex: 4
  },
  {
    id: "$dotnet",
    owner: "dotnet",
    pattern: /^(.+\.(?:cs|fs|vb))\((\d+),(\d+)\):\s+(error|warning)\s+\w+\d+:\s+(.+)$/,
    fileIndex: 1,
    lineIndex: 2,
    columnIndex: 3,
    severityIndex: 4,
    messageIndex: 5
  },
  {
    id: "$flutter",
    owner: "flutter",
    pattern: /^(.+\.(?:dart)):(\d+):(\d+):\s+(Error|Warning):\s+(.+)$/,
    fileIndex: 1,
    lineIndex: 2,
    columnIndex: 3,
    severityIndex: 4,
    messageIndex: 5
  },
  {
    id: "$gcc",
    owner: "gcc",
    pattern: /^(.+):(\d+):(\d+):\s+(error|warning):\s+(.+)$/,
    fileIndex: 1,
    lineIndex: 2,
    columnIndex: 3,
    severityIndex: 4,
    messageIndex: 5
  },
  {
    id: "$python",
    owner: "python",
    pattern: /^File "(.+)", line (\d+)(?:, in .*)?\s*$/i,
    severity: "error",
    fileIndex: 1,
    lineIndex: 2,
    columnIndex: 0,
    messageIndex: 0
  }
];

function normalizeSeverity(value: string | undefined, fallback: TaskProblemSeverity = "error"): TaskProblemSeverity {
  const normalized = value?.toLowerCase();
  if (normalized === "warning" || normalized === "warn") return "warning";
  if (normalized === "info") return "info";
  if (normalized === "error") return "error";
  return fallback;
}

function normalizeRelativePath(filePath: string, workspaceRoot: string): string {
  const normalized = filePath.replace(/\\/g, "/").trim();
  if (!normalized || normalized === "0") return "";
  if (path.isAbsolute(normalized)) {
    const relative = path.relative(workspaceRoot, normalized).replace(/\\/g, "/");
    if (!relative.startsWith("..") && !path.isAbsolute(relative)) return relative;
    return "";
  }
  return normalized.replace(/^\.\/+/, "");
}

export function parseProblemsFromOutput(
  chunk: string,
  matcherIds: string[],
  workspaceRoot: string,
  source: string,
  taskRunId?: string
): TaskProblem[] {
  const selected = matcherIds.length > 0 ? MATCHERS.filter((matcher) => matcherIds.includes(matcher.id)) : MATCHERS;
  const problems: TaskProblem[] = [];
  const lines = chunk.split(/\r?\n/);
  let pendingMessage: string | undefined;

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;

    for (const matcher of selected) {
      const match = trimmed.match(matcher.pattern);
      if (!match) continue;
      const relativePath = normalizeRelativePath(match[matcher.fileIndex] ?? "", workspaceRoot);
      if (!relativePath && matcher.fileIndex !== 0) continue;
      const severity = normalizeSeverity(
        matcher.severityIndex ? match[matcher.severityIndex] : undefined,
        matcher.severity ?? "error"
      );
      const message = (match[matcher.messageIndex] ?? pendingMessage ?? trimmed).trim();
      if (!message && !relativePath) continue;
      problems.push({
        id: `${taskRunId ?? "problem"}:${problems.length}:${relativePath}:${match[matcher.lineIndex] ?? 0}`,
        relativePath,
        line: Number.parseInt(match[matcher.lineIndex] ?? "1", 10) || 1,
        column: Number.parseInt(match[matcher.columnIndex] ?? "1", 10) || 1,
        severity,
        message: message || trimmed,
        source,
        taskRunId
      });
      pendingMessage = undefined;
      break;
    }

    if (/^(error|warning):/.test(trimmed)) {
      pendingMessage = trimmed;
    }
  }

  return problems;
}

export function listProblemMatcherIds(): string[] {
  return MATCHERS.map((matcher) => matcher.id);
}
