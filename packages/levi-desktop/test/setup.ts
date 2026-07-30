import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import type {
  ConversationStreamEvent,
  EditStreamEvent,
  ExecutionTransactionStatus,
  LeviApi,
  PlanningStreamEvent,
  ProjectRulesStreamEvent,
  WorkspaceScanSummary
} from "../src/types/levi-api";

vi.mock("../src/monaco-setup", () => ({
  loader: {
    config: vi.fn()
  }
}));

vi.mock("@monaco-editor/react", () => ({
  default: ({ value }: { value: string }) =>
    createElement("textarea", {
      "aria-label": "Read-only editor",
      readOnly: true,
      value
    }),
  loader: {
    config: vi.fn()
  }
}));

declare global {
  interface Window {
    __leviConversationListeners: Array<(event: ConversationStreamEvent) => void>;
    __leviEditListeners: Array<(event: EditStreamEvent) => void>;
    __leviPlanningListeners: Array<(event: PlanningStreamEvent) => void>;
    __leviRulesListeners: Array<(event: ProjectRulesStreamEvent) => void>;
  }
}

function mockExecutionTransaction(status: ExecutionTransactionStatus, overrides: Record<string, unknown> = {}) {
  return {
    transactionId: "tx-1",
    planId: "plan-1",
    goal: "Update server timeout",
    workspaceRootPath: "C:\\Users\\developer\\Project",
    scanTimestamp: new Date().toISOString(),
    status,
    steps: [
      {
        stepIndex: 0,
        planStepId: "1:0",
        planStepOrder: 1,
        planStepTitle: "Update implementation",
        relativePath: "src/main.ts",
        status: "pending" as const
      }
    ],
    currentStepIndex: 0,
    appliedProjectRules: [],
    ruleConflicts: [],
    unsupportedOperations: { creates: [], deletes: [] },
    validationCommands: ["npm test"],
    createdAt: new Date().toISOString(),
    totals: { stepCount: 1, appliedCount: 0, pendingCount: 1 },
    ...overrides
  };
}

function createDefaultApi(): LeviApi {
  const summary: WorkspaceScanSummary = {
    projectName: "Project",
    rootPath: "C:\\Users\\developer\\Project",
    languages: ["TypeScript"],
    frameworks: ["React"],
    packageManager: "npm",
    likelyEntryPoints: ["src/main.tsx"],
    sourceDirectories: ["src"],
    testDirectories: ["test"],
    scripts: { test: "vitest run" },
    documentationFiles: ["README.md"],
    manifestFiles: ["package.json", "README.md"],
    includedFileCount: 3,
    excludedFileCount: 1,
    scanTimestamp: "2026-07-23T00:00:00.000Z"
  };
  return {
    ollama: {
      getStatus: vi.fn(async () => ({
        ready: true,
        modelCount: 2,
        models: ["qwen3.6:latest", "qwen2.5-coder:7b"]
      }))
    },
    projects: {
      getRecent: vi.fn(async () => null),
      openFolder: vi.fn(async () => ({
        path: "C:\\Users\\developer\\Project",
        name: "Project"
      }))
    },
    workspace: {
      getStatus: vi.fn(async () => ({
        state: "idle" as const
      })),
      refresh: vi.fn(async () => ({
        state: "ready" as const,
        summary
      })),
      openFile: vi.fn(async () => ({
        sourceId: "WS1",
        relativePath: "src/main.tsx",
        content: "console.log('read only');\n",
        language: "typescript",
        lineStart: 1,
        readOnly: true as const
      })),
      listTree: vi.fn(async () => ({
        projectName: "Project",
        rootPath: "C:\\Users\\developer\\Project",
        nodes: [
          {
            name: "src",
            relativePath: "src",
            kind: "folder" as const,
            children: [{ name: "main.tsx", relativePath: "src/main.tsx", kind: "file" as const }]
          }
        ],
        nodeCount: 2,
        truncated: false
      })),
      readPath: vi.fn(async () => ({
        relativePath: "src/main.tsx",
        content: "console.log('read only');\n",
        language: "typescript",
        readOnly: false as const
      })),
      writePath: vi.fn(async () => ({
        relativePath: "src/main.tsx",
        bytesWritten: 26,
        savedAt: "2026-07-29T00:00:00.000Z"
      }))
    },
    rules: {
      getStatus: vi.fn(async () => ({
        state: "ready-without-model-enrichment" as const,
        guidanceFileCount: 1,
        activeRuleCount: 1,
        conflictCount: 0,
        suspiciousCount: 0,
        timings: { discoveryMs: 1, extractionMs: 1, enrichmentMs: 0, activeContextMs: 0 }
      })),
      list: vi.fn(async () => ({
        status: {
          state: "ready-without-model-enrichment" as const,
          guidanceFileCount: 1,
          activeRuleCount: 1,
          conflictCount: 0,
          suspiciousCount: 0,
          timings: { discoveryMs: 1, extractionMs: 1, enrichmentMs: 0, activeContextMs: 0 }
        },
        sources: [{ sourceId: "rule-source-1", relativePath: "AGENTS.md", scopePath: ".", kind: "guidance" as const }],
        rules: [
          {
            ruleId: "rule-1",
            text: "Use Vitest.",
            sourceId: "rule-source-1",
            sourcePath: "AGENTS.md",
            lineStart: 1,
            lineEnd: 1,
            scopePath: ".",
            category: "testing" as const,
            strength: "preferred" as const,
            confidence: "high" as const,
            extraction: "deterministic" as const
          }
        ],
        conflicts: [],
        design: { tokens: [], components: [], conventions: [], sources: [] },
        suspiciousRules: []
      })),
      refresh: vi.fn(async () => window.levi.rules.list()),
      openSource: vi.fn(async () => ({
        sourceId: "rule-1",
        relativePath: "AGENTS.md",
        content: "Use Vitest.\n",
        language: "markdown",
        lineStart: 1,
        readOnly: true as const
      })),
      onEvent: vi.fn((listener: (event: ProjectRulesStreamEvent) => void) => {
        window.__leviRulesListeners.push(listener);
        return () => {
          window.__leviRulesListeners = window.__leviRulesListeners.filter((current) => current !== listener);
        };
      })
    },
    edits: {
      propose: vi.fn(async () => ({
        requestId: "edit-1"
      })),
      cancel: vi.fn(async () => undefined),
      apply: vi.fn(async () => ({
        proposalId: "proposal-1",
        relativePath: "src/main.tsx",
        content: "console.log('changed');\n",
        language: "typescript",
        lineStart: 1,
        readOnly: true as const,
        applied: true as const,
        timings: { applyMs: 4 }
      })),
      reject: vi.fn(async () => undefined),
      undoLast: vi.fn(async () => ({
        relativePath: "src/main.tsx",
        content: "console.log('read only');\n",
        language: "typescript",
        lineStart: 1,
        readOnly: true as const,
        undone: true as const
      })),
      getStatus: vi.fn(async () => ({
        canUndo: false,
        route: {
          conversation: "qwen3.6:latest" as const,
          editGeneration: "qwen2.5-coder:7b" as const
        }
      })),
      onEvent: vi.fn((listener: (event: EditStreamEvent) => void) => {
        window.__leviEditListeners.push(listener);
        return () => {
          window.__leviEditListeners = window.__leviEditListeners.filter((current) => current !== listener);
        };
      })
    },
    planning: {
      create: vi.fn(async () => ({
        requestId: "plan-1"
      })),
      cancel: vi.fn(async () => undefined),
      approve: vi.fn(async (planId: string) => ({
        planId,
        message: "Execution transaction prepared. Review each file step before applying.",
        transaction: mockExecutionTransaction("prepared")
      })),
      getStatus: vi.fn(async () => ({
        route: {
          planning: "qwen3.6:latest" as const
        }
      })),
      onEvent: vi.fn((listener: (event: PlanningStreamEvent) => void) => {
        window.__leviPlanningListeners.push(listener);
        return () => {
          window.__leviPlanningListeners = window.__leviPlanningListeners.filter((current) => current !== listener);
        };
      })
    },
    execution: {
      prepare: vi.fn(async () => ({
        transaction: mockExecutionTransaction("prepared")
      })),
      proposeStep: vi.fn(async () => ({
        transaction: mockExecutionTransaction("step-proposed"),
        proposal: {
          proposalId: "proposal-1",
          transactionId: "tx-1",
          planStepId: "1:0",
          stepIndex: 0,
          relativePath: "src/main.ts",
          summary: "Update main",
          assumptions: [],
          warnings: [],
          suggestedValidationCommands: [],
          confidence: "medium" as const,
          addedLineCount: 1,
          removedLineCount: 1,
          diff: [],
          appliedProjectRules: [],
          ruleConflicts: [],
          timings: { modelMs: 1, diffMs: 0, totalMs: 1 }
        }
      })),
      applyStep: vi.fn(async () => ({
        transaction: mockExecutionTransaction("step-applied", {
          currentStepIndex: 1,
          totals: { stepCount: 1, appliedCount: 1, pendingCount: 0 }
        }),
        relativePath: "src/main.ts",
        content: "updated",
        language: "typescript",
        stepIndex: 0
      })),
      rejectStep: vi.fn(async () => ({
        transaction: mockExecutionTransaction("prepared", {
          totals: { stepCount: 1, appliedCount: 0, pendingCount: 1 }
        })
      })),
      regenerateStep: vi.fn(async () => ({
        transaction: mockExecutionTransaction("step-proposed", {
          totals: { stepCount: 1, appliedCount: 0, pendingCount: 1 }
        }),
        proposal: {
          proposalId: "proposal-2",
          transactionId: "tx-1",
          planStepId: "1:0",
          stepIndex: 0,
          relativePath: "src/main.ts",
          summary: "Update main again",
          assumptions: [],
          warnings: [],
          suggestedValidationCommands: [],
          confidence: "medium" as const,
          addedLineCount: 1,
          removedLineCount: 1,
          diff: [],
          appliedProjectRules: [],
          ruleConflicts: [],
          timings: { modelMs: 1, diffMs: 0, totalMs: 1 }
        }
      })),
      rollback: vi.fn(async () => ({
        transaction: mockExecutionTransaction("rolled-back", {
          totals: { stepCount: 1, appliedCount: 0, pendingCount: 1 }
        }),
        restoredPaths: ["src/main.ts"]
      })),
      keep: vi.fn(async () => ({
        transaction: mockExecutionTransaction("kept", {
          totals: { stepCount: 1, appliedCount: 1, pendingCount: 0 }
        })
      })),
      cancel: vi.fn(async () => ({
        transaction: mockExecutionTransaction("cancelled", {
          totals: { stepCount: 1, appliedCount: 0, pendingCount: 1 }
        })
      })),
      getStatus: vi.fn(async () => ({
        route: {
          stepGeneration: "qwen2.5-coder:7b" as const
        }
      })),
      onEvent: vi.fn(() => () => undefined)
    },
    terminal: {
      create: vi.fn(async () => ({
        id: "terminal-1",
        cwd: "C:\\Users\\developer\\Project"
      })),
      write: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
      onData: vi.fn(() => () => undefined)
    },
    conversation: {
      start: vi.fn(async () => ({
        requestId: "conversation-1"
      })),
      cancel: vi.fn(async () => undefined),
      onEvent: vi.fn((listener: (event: ConversationStreamEvent) => void) => {
        window.__leviConversationListeners.push(listener);
        return () => {
          window.__leviConversationListeners = window.__leviConversationListeners.filter((current) => current !== listener);
        };
      })
    }
  };
}

beforeEach(() => {
  const api = createDefaultApi();
  window.__leviConversationListeners = [];
  window.__leviEditListeners = [];
  window.__leviPlanningListeners = [];
  window.__leviRulesListeners = [];
  vi.stubGlobal("levi", api);
  Object.defineProperty(window, "levi", {
    value: api,
    configurable: true
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
