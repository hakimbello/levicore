import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import type {
  ConversationStreamEvent,
  EditStreamEvent,
  ExecutionTransactionStatus,
  AIChatContextSource,
  AIChatEvent,
  AIChatState,
  LeviApi,
  PlanningStreamEvent,
  ProjectRulesStreamEvent,
  UpdateStatusEvent,
  WorkspaceScanSummary
} from "../src/types/levi-api";
import type { DebugEvent } from "../src/features/debugger";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

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
    __leviUpdateListeners: Array<(event: UpdateStatusEvent) => void>;
    __leviDebugListeners: Array<(event: DebugEvent) => void>;
    __leviChatListeners: Array<(event: AIChatEvent) => void>;
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
  const chatContextSources: AIChatContextSource[] = ["current-file", "workspace-file", "workspace-folder", "selected-code", "open-tabs", "workspace-summary", "project-rules", "problems", "task-output", "git-diff", "clipboard"];
  const chatState: AIChatState = {
    conversations: [],
    panel: { dockPosition: "right" },
    updatedAt: "2026-08-01T00:00:00.000Z"
  };
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
    updates: {
      getStatus: vi.fn(async () => ({
        state: "idle" as const,
        currentVersion: "0.1.0"
      })),
      checkForUpdates: vi.fn(async () => ({
        state: "update-not-available" as const,
        currentVersion: "0.1.0",
        message: "Levi is up to date."
      })),
      downloadUpdate: vi.fn(async () => ({
        state: "downloaded" as const,
        currentVersion: "0.1.0",
        availableVersion: "0.1.1",
        progressPercent: 100
      })),
      installDownloadedUpdate: vi.fn(async () => ({
        state: "downloaded" as const,
        currentVersion: "0.1.0",
        availableVersion: "0.1.1",
        progressPercent: 100
      })),
      onEvent: vi.fn((listener: (event: UpdateStatusEvent) => void) => {
        window.__leviUpdateListeners.push(listener);
        return () => {
          window.__leviUpdateListeners = window.__leviUpdateListeners.filter((current) => current !== listener);
        };
      })
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
    debug: {
      start: vi.fn(async (request) => ({
        state: "Stopped" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        lastLaunchConfiguration: request.configuration ?? undefined,
        adapters: [],
        adapterRecommendations: [],
        error: {
          code: "MISSING_ADAPTER" as const,
          message: 'Missing debug adapter for "node".',
          recoverable: true
        }
      })),
      stop: vi.fn(async () => ({
        state: "Stopped" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      stopAll: vi.fn(async () => ({
        state: "Stopped" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      restart: vi.fn(async () => ({
        state: "Stopped" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      pause: vi.fn(async () => ({
        state: "Paused" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      continue: vi.fn(async () => ({
        state: "Running" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      stepOver: vi.fn(async () => ({
        state: "Paused" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      stepInto: vi.fn(async () => ({
        state: "Paused" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      stepOut: vi.fn(async () => ({
        state: "Paused" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      setBreakpoint: vi.fn(async (request) => ({
        state: "Idle" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: request.toggle
          ? [
              {
                id: `${request.relativePath}:${request.line}:1`,
                relativePath: request.relativePath,
                line: request.line,
                enabled: true,
                condition: request.condition,
                logMessage: request.logMessage,
                createdAt: "2026-07-31T00:00:00.000Z",
                updatedAt: "2026-07-31T00:00:00.000Z"
              }
            ]
          : [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      removeBreakpoint: vi.fn(async () => ({
        state: "Idle" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      getBreakpoints: vi.fn(async () => []),
      selectSession: vi.fn(async () => ({
        state: "Running" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      getState: vi.fn(async () => ({
        state: "Idle" as const,
        launchConfigurations: [
          {
            id: ".levi/launch.json:Node Launch",
            name: "Node Launch",
            source: ".levi/launch.json" as const,
            default: true,
            configuration: {
              type: "node",
              request: "launch" as const,
              name: "Node Launch",
              adapterId: "node",
              program: "src/main.ts"
            }
          }
        ],
        compoundConfigurations: [],
        sessions: [],
        selectedLaunchConfigurationName: "Node Launch",
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      selectConfiguration: vi.fn(async (name) => ({
        state: "Idle" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        selectedLaunchConfigurationName: name,
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      createLaunchConfig: vi.fn(async () => ({
        state: "Idle" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      addWatch: vi.fn(async (expression) => ({
        state: "Idle" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [
          {
            id: "watch-1",
            expression,
            enabled: true,
            createdAt: "2026-07-31T00:00:00.000Z",
            updatedAt: "2026-07-31T00:00:00.000Z"
          }
        ],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      updateWatch: vi.fn(async (request) => ({
        state: "Idle" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [
          {
            id: request.id,
            expression: request.expression,
            enabled: true,
            createdAt: "2026-07-31T00:00:00.000Z",
            updatedAt: "2026-07-31T00:00:00.000Z"
          }
        ],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      removeWatch: vi.fn(async () => ({
        state: "Idle" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      loadVariables: vi.fn(async () => ({
        state: "Paused" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      evaluate: vi.fn(async (request) => ({
        state: "Paused" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [
          {
            id: "console-1",
            timestamp: "2026-07-31T00:00:00.000Z",
            category: "console" as const,
            output: request.expression
          }
        ],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        lastEvaluation: {
          expression: request.expression,
          result: request.expression
        },
        adapters: [],
        adapterRecommendations: []
      })),
      clearConsole: vi.fn(async () => ({
        state: "Paused" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      selectStackFrame: vi.fn(async () => ({
        state: "Paused" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      setExceptionBreakpoints: vi.fn(async () => ({
        state: "Idle" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      refreshLoadedSources: vi.fn(async () => ({
        state: "Running" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [{ name: "main.ts", relativePath: "src/main.ts" }],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      getCompletions: vi.fn(async () => [{ label: "count", insertText: "count" }]),
      cancelEvaluations: vi.fn(async () => undefined),
      listAdapters: vi.fn(async () => []),
      scanAdapters: vi.fn(async () => ({
        state: "Idle" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      getAdapterStatus: vi.fn(async () => ({
        state: "Idle" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      installAdapter: vi.fn(async () => ({
        state: "Idle" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [{ id: "node", displayName: "Node.js", languages: ["typescript"], requestTypes: ["launch" as const], state: "installed" as const }],
        adapterRecommendations: []
      })),
      updateAdapter: vi.fn(async () => ({
        state: "Idle" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      uninstallAdapter: vi.fn(async () => ({
        state: "Idle" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      validateAdapter: vi.fn(async () => ({
        state: "Idle" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      registerCustomAdapter: vi.fn(async () => ({
        state: "Idle" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      revokeCustomAdapter: vi.fn(async () => ({
        state: "Idle" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      dismissAdapterRecommendation: vi.fn(async () => ({
        state: "Idle" as const,
        launchConfigurations: [],
        compoundConfigurations: [],
        sessions: [],
        breakpoints: [],
        watches: [],
        variables: [],
        callStack: [],
        loadedSources: [],
        console: [],
        exceptionBreakpoints: [],
        inlineValues: [],
        evaluationCache: [],
        adapters: [],
        adapterRecommendations: []
      })),
      cancelAdapterInstall: vi.fn(async () => undefined),
      revealAdapterLocation: vi.fn(async () => "C:\\Users\\developer\\Project\\adapters\\node"),
      onEvent: vi.fn((listener: (event: DebugEvent) => void) => {
        window.__leviDebugListeners.push(listener);
        return () => {
          window.__leviDebugListeners = window.__leviDebugListeners.filter((current) => current !== listener);
        };
      })
    },
    terminal: {
      create: vi.fn(async () => ({
        id: "terminal-1",
        cwd: "C:\\Users\\developer\\Project",
        name: "Terminal 1",
        shellKind: "powershell"
      })),
      write: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
      kill: vi.fn(async () => ({
        id: "terminal-1",
        name: "Terminal 1",
        cwd: "C:\\Users\\developer\\Project",
        shellKind: "powershell",
        alive: false,
        createdAt: new Date().toISOString()
      })),
      rename: vi.fn(async () => ({
        id: "terminal-1",
        name: "Terminal 1",
        cwd: "C:\\Users\\developer\\Project",
        shellKind: "powershell",
        alive: true,
        createdAt: new Date().toISOString()
      })),
      list: vi.fn(async () => []),
      split: vi.fn(async () => ({
        id: "terminal-2",
        cwd: "C:\\Users\\developer\\Project",
        name: "Terminal 2",
        shellKind: "powershell"
      })),
      restart: vi.fn(async () => ({
        id: "terminal-3",
        cwd: "C:\\Users\\developer\\Project",
        name: "Terminal 1",
        shellKind: "powershell"
      })),
      getLayout: vi.fn(async () => ({
        tabs: [{ id: "tab-1", name: "Terminal 1", cwd: "C:\\Users\\developer\\Project" }],
        activeTabId: "tab-1",
        panelTab: "terminal" as const,
        panelVisible: false,
        panelMaximized: false,
        panelHeightPx: 280,
        splitLayout: { type: "pane" as const, tabId: "tab-1" }
      })),
      setLayout: vi.fn(async (layout) => layout),
      revealCwd: vi.fn(async () => "C:\\Users\\developer\\Project"),
      onData: vi.fn(() => () => undefined)
    },
    tasks: {
      list: vi.fn(async () => ({
        detected: [
          {
            id: "builtin:build",
            label: "Build",
            source: "builtin" as const,
            group: "build" as const,
            command: "npm.cmd",
            args: ["run", "build"],
            problemMatchers: ["$tsc"]
          }
        ],
        recent: [],
        running: [],
        failed: [],
        pinned: []
      })),
      run: vi.fn(async () => ({
        id: "run-1",
        taskId: "builtin:build",
        label: "Build",
        status: "running" as const,
        terminalSessionId: "terminal-1",
        startedAt: new Date().toISOString()
      })),
      cancel: vi.fn(async () => ({
        id: "run-1",
        taskId: "builtin:build",
        label: "Build",
        status: "cancelled" as const
      })),
      history: vi.fn(async () => []),
      problems: vi.fn(async () => []),
      output: vi.fn(async () => []),
      pin: vi.fn(async (_request) => ({
        detected: [],
        recent: [],
        running: [],
        failed: [],
        pinned: ["builtin:build"]
      })),
      onEvent: vi.fn(() => () => undefined)
    },
    runtime: {
      list: vi.fn(async () => ({
        providers: [
          {
            id: "ollama" as const,
            name: "Ollama",
            installed: true,
            running: true,
            version: "0.5.0",
            endpoint: "http://127.0.0.1:11434",
            status: "Running" as const,
            models: [
              {
                id: "qwen3.6:latest",
                displayName: "qwen3.6:latest",
                contextWindow: 32768,
                embeddingSupport: false,
                visionSupport: false,
                toolSupport: false
              }
            ],
            latencyMs: 12,
            requestCount: 0,
            failureCount: 0,
            runningRequestCount: 0,
            queuedRequestCount: 0
          },
          {
            id: "lm-studio" as const,
            name: "LM Studio",
            installed: false,
            running: false,
            status: "Stopped" as const,
            models: [],
            requestCount: 0,
            failureCount: 0,
            runningRequestCount: 0,
            queuedRequestCount: 0
          }
        ],
        selectedRuntimeId: "ollama" as const,
        preferredRuntimeId: "ollama" as const,
        automaticRuntimeId: "ollama" as const,
        lastSuccessfulRuntimeId: "ollama" as const,
        lastSelectedModelId: "qwen3.6:latest",
        selectionMode: "manual" as const,
        requests: [],
        downloads: [],
        diagnostics: [
          {
            providerId: "ollama" as const,
            providerName: "Ollama",
            installed: true,
            running: true,
            version: "0.5.0",
            endpoint: "http://127.0.0.1:11434",
            supportedModels: [],
            health: "Running" as const,
            latencyMs: 12,
            checkedAt: "2026-08-01T00:00:00.000Z",
            selected: true,
            preferred: true,
            requestCount: 0,
            failureCount: 0,
            runningRequestCount: 0,
            queuedRequestCount: 0
          }
        ]
      })),
      detect: vi.fn(async () => window.levi.runtime.list()),
      health: vi.fn(async () => window.levi.runtime.list()),
      models: vi.fn(async () => [
        {
          id: "qwen3.6:latest",
          displayName: "qwen3.6:latest",
          embeddingSupport: false,
          visionSupport: false,
          toolSupport: false
        }
      ]),
      select: vi.fn(async (request) => ({
        providers: [],
        selectedRuntimeId: request.runtimeId,
        preferredRuntimeId: request.preferred ? request.runtimeId : undefined,
        lastSelectedModelId: request.modelId,
        selectionMode: request.mode ?? "manual",
        requests: [],
        downloads: [],
        diagnostics: []
      })),
      diagnostics: vi.fn(async () => []),
      chat: vi.fn(async (request) => ({
        requestId: "runtime-chat-1",
        providerId: request.providerId ?? "ollama",
        model: request.model,
        content: "ok",
        latencyMs: 4
      })),
      completion: vi.fn(async (request) => ({
        requestId: "runtime-completion-1",
        providerId: request.providerId ?? "ollama",
        model: request.model,
        content: "ok",
        latencyMs: 4
      })),
      stream: vi.fn(async (request) => ({
        requestId: "runtime-stream-1",
        providerId: request.providerId ?? "ollama",
        model: request.model,
        events: [],
        content: "ok"
      })),
      embeddings: vi.fn(async (request) => ({
        requestId: "runtime-embeddings-1",
        providerId: request.providerId ?? "ollama",
        model: request.model,
        embeddings: [[0.1, 0.2]],
        latencyMs: 4
      })),
      pullModel: vi.fn(async (request) => ({
        providerId: request.providerId ?? "ollama",
        modelId: request.modelId,
        status: "Completed" as const,
        progress: 1
      })),
      deleteModel: vi.fn(async (request) => ({
        providerId: request.providerId ?? "ollama",
        modelId: request.modelId,
        status: "Completed" as const,
        progress: 1
      })),
      start: vi.fn(async (request) => ({
        providerId: request.providerId ?? "ollama",
        modelId: request.modelId ?? "",
        status: "Completed" as const,
        progress: 1
      })),
      stop: vi.fn(async (request) => ({
        providerId: request.providerId ?? "ollama",
        modelId: request.modelId ?? "",
        status: "Failed" as const,
        error: "Provider-managed stop is unavailable."
      })),
      restart: vi.fn(async (request) => ({
        providerId: request.providerId ?? "ollama",
        modelId: request.modelId ?? "",
        status: "Completed" as const,
        progress: 1
      })),
      cancel: vi.fn(async () => window.levi.runtime.list())
    },
    chat: {
      list: vi.fn(async () => chatState),
      new: vi.fn(async (request = {}) => ({
        conversations: [
          {
            id: "chat-1",
            title: request.title ?? "New Chat",
            messages: [],
            runtimeId: request.runtimeId,
            modelId: request.modelId,
            pinned: false,
            archived: false,
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z"
          }
        ],
        activeConversationId: "chat-1",
        panel: chatState.panel,
        updatedAt: "2026-08-01T00:00:00.000Z"
      })),
      delete: vi.fn(async () => chatState),
      rename: vi.fn(async (request) => ({
        conversations: [
          {
            id: request.conversationId,
            title: request.title,
            messages: [],
            pinned: false,
            archived: false,
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z"
          }
        ],
        activeConversationId: request.conversationId,
        panel: chatState.panel,
        updatedAt: "2026-08-01T00:00:00.000Z"
      })),
      deleteMessage: vi.fn(async () => chatState),
      fork: vi.fn(async (request) => ({
        conversations: [
          {
            id: "chat-fork-1",
            title: "New Chat (Fork)",
            messages: [],
            pinned: false,
            archived: false,
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z"
          }
        ],
        activeConversationId: "chat-fork-1",
        panel: chatState.panel,
        updatedAt: "2026-08-01T00:00:00.000Z"
      })),
      send: vi.fn(async (request) => ({
        requestId: "chat-request-1",
        state: {
          conversations: [
            {
              id: request.conversationId ?? "chat-1",
              title: "New Chat",
              runtimeId: request.runtimeId,
              modelId: request.modelId,
              pinned: false,
              archived: false,
              createdAt: "2026-08-01T00:00:00.000Z",
              updatedAt: "2026-08-01T00:00:00.000Z",
              messages: [
                {
                  id: "chat-message-user-1",
                  role: "user" as const,
                  content: request.content,
                  attachments: request.attachments,
                  createdAt: "2026-08-01T00:00:00.000Z",
                  status: "done" as const
                },
                {
                  id: "chat-message-assistant-1",
                  role: "assistant" as const,
                  content: "",
                  createdAt: "2026-08-01T00:00:00.000Z",
                  status: "streaming" as const
                }
              ]
            }
          ],
          activeConversationId: request.conversationId ?? "chat-1",
          panel: chatState.panel,
          updatedAt: "2026-08-01T00:00:00.000Z"
        }
      })),
      cancel: vi.fn(async () => chatState),
      export: vi.fn(async (request) => ({
        conversationId: request.conversationId,
        format: request.format ?? "markdown",
        markdown: "# New Chat\n",
        json: request.format === "json" ? "{\"title\":\"New Chat\"}" : undefined
      })),
      archive: vi.fn(async (request) => ({
        ...chatState,
        conversations: chatState.conversations.map((conversation) => conversation.id === request.conversationId ? { ...conversation, archived: request.archived } : conversation),
        updatedAt: "2026-08-01T00:00:00.000Z"
      })),
      search: vi.fn(async () => chatState),
      discoverContext: vi.fn(async () => ({
        supports: chatContextSources,
        recentFiles: [
          { kind: "folder" as const, relativePath: "src", name: "src" },
          { kind: "file" as const, relativePath: "src/main.tsx", name: "main.tsx" }
        ]
      })),
      previewContext: vi.fn(async (request) => ({
        attachment: {
          id: `attachment-${request.source}`,
          type: request.source,
          sourceId: "S1",
          label: request.label ?? request.relativePath ?? request.source,
          relativePath: request.relativePath,
          content: request.content ?? "preview",
          tokenEstimate: 2,
          confirmed: request.confirmSensitive
        },
        budget: {
          conversationTokens: 0,
          attachmentTokens: 2,
          draftTokens: 0,
          totalTokens: 2,
          maxTokens: 32768,
          remainingTokens: 31744,
          exceedsBudget: false,
          oversizedAttachments: []
        }
      })),
      budget: vi.fn(async () => ({
        conversationTokens: 0,
        attachmentTokens: 0,
        draftTokens: 0,
        totalTokens: 0,
        maxTokens: 32768,
        remainingTokens: 31744,
        exceedsBudget: false,
        oversizedAttachments: []
      })),
      openCitation: vi.fn(async () => ({
        id: "attachment-citation",
        type: "workspace-file" as const,
        sourceId: "S1",
        label: "src/main.tsx",
        relativePath: "src/main.tsx",
        content: "console.log('read only');\n",
        lineStart: 1,
        lineEnd: 1,
        tokenEstimate: 8
      })),
      setPanel: vi.fn(async (request) => ({
        ...chatState,
        panel: { dockPosition: request.dockPosition },
        updatedAt: "2026-08-01T00:00:00.000Z"
      })),
      pin: vi.fn(async () => chatState),
      onEvent: vi.fn((listener: (event: AIChatEvent) => void) => {
        window.__leviChatListeners.push(listener);
        return () => {
          window.__leviChatListeners = window.__leviChatListeners.filter((current) => current !== listener);
        };
      })
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
  window.__leviUpdateListeners = [];
  window.__leviDebugListeners = [];
  window.__leviChatListeners = [];
  vi.stubGlobal("levi", api);
  Object.defineProperty(window, "levi", {
    value: api,
    configurable: true
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
