import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import type {
  ConversationStreamEvent,
  EditStreamEvent,
  ExecutionTransactionStatus,
  AIChatContextSource,
  AIChatEvent,
  AIChatState,
  AgentEvent,
  AgentState,
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
    __leviAgentListeners: Array<(event: AgentEvent) => void>;
  }
}

function mockExecutionTransaction(status: ExecutionTransactionStatus, overrides: Record<string, unknown> = {}) {
  return {
    transactionId: "tx-1",
    planId: "plan-1",
    goal: "Update server timeout",
    workspaceRootPath: "C:\\Users\\LeviUser\\Project",
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
  const agentState: AgentState = {
    sessions: [],
    updatedAt: "2026-08-01T00:00:00.000Z"
  };
  const summary: WorkspaceScanSummary = {
    projectName: "Project",
    rootPath: "C:\\Users\\LeviUser\\Project",
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
        path: "C:\\Users\\LeviUser\\Project",
        name: "Project"
      })),
      starters: vi.fn(async () => []),
      createStarter: vi.fn(async () => ({
        project: { path: "C:\\Users\\LeviUser\\Project", name: "Project" },
        detection: { projectType: "vanilla-web" as const, confidence: 0.8, evidence: [] },
        summary: "Project | vanilla-web",
        commands: [],
        warnings: []
      })),
      cloneRepository: vi.fn(async () => ({
        project: { path: "C:\\Users\\LeviUser\\Project", name: "Project" },
        detection: { projectType: "git" as const, confidence: 0.8, evidence: ["Git repository"] },
        summary: "Project | git",
        stdout: "",
        stderr: "",
        durationMs: 1
      })),
      detect: vi.fn(async () => ({ projectType: "vanilla-web" as const, confidence: 0.8, evidence: [] })),
      mobileEnvironment: vi.fn(async () => ({
        os: process.platform,
        android: {
          jdk: { name: "JDK", status: "missing" as const },
          javaHome: { name: "JAVA_HOME", status: "missing" as const },
          androidSdk: { name: "Android SDK", status: "missing" as const },
          adb: { name: "ADB", status: "missing" as const },
          gradle: { name: "Gradle", status: "missing" as const },
          gradleWrapper: { name: "Gradle wrapper", status: "missing" as const },
          buildTools: { name: "Android build-tools", status: "missing" as const },
          platformTools: { name: "platform-tools", status: "missing" as const },
          platforms: { name: "Android platforms", status: "missing" as const },
          emulator: { name: "Emulator", status: "missing" as const },
          avds: { name: "AVDs", status: "missing" as const, names: [] },
          devices: { name: "Connected devices", status: "missing" as const, targets: [] },
          status: "missing-tools" as const,
          summary: "Missing Android requirements"
        },
        flutter: {
          flutter: { name: "flutter", status: "missing" as const },
          dart: { name: "dart", status: "missing" as const },
          doctor: { name: "Flutter doctor", status: "missing" as const },
          androidTarget: { name: "Flutter Android target", status: "missing" as const },
          iosTarget: { name: "Flutter iOS target", status: "unavailable" as const }
        },
        reactNative: {
          node: { name: "node", status: "ready" as const },
          npm: { name: "npm", status: "ready" as const },
          pnpm: { name: "pnpm", status: "missing" as const },
          yarn: { name: "yarn", status: "missing" as const },
          npx: { name: "npx", status: "ready" as const },
          expoCli: { name: "Expo CLI", status: "missing" as const },
          androidTooling: { name: "React Native Android tooling", status: "missing" as const },
          iosTooling: { name: "React Native iOS tooling", status: "unavailable" as const }
        },
        ios: {
          sourceDevelopment: { name: "iOS source development", status: "ready" as const },
          nativeBuild: { name: "Native iOS build", status: "unavailable" as const },
          xcode: { name: "Xcode", status: "unavailable" as const },
          xcodebuild: { name: "xcodebuild", status: "unavailable" as const },
          swift: { name: "Swift", status: "unavailable" as const },
          swiftPackageManager: { name: "Swift Package Manager", status: "unavailable" as const },
          simulators: { name: "iOS simulators", status: "unavailable" as const },
          devices: { name: "Apple devices", status: "unavailable" as const },
          summary: "iOS source development: available. Native iOS build: requires macOS + Xcode."
        }
      })),
      runCommands: vi.fn(async () => []),
      runApp: vi.fn(async () => ({ status: { running: false, outputPreview: "" } })),
      stopApp: vi.fn(async () => ({ status: { running: false, outputPreview: "" } })),
      runStatus: vi.fn(async () => ({ running: false, outputPreview: "" })),
      viewChanges: vi.fn(async () => ({ createdFiles: [], modifiedFiles: [], deletedFiles: [] }))
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
        rootPath: "C:\\Users\\LeviUser\\Project",
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
      revealAdapterLocation: vi.fn(async () => "C:\\Users\\LeviUser\\Project\\adapters\\node"),
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
        cwd: "C:\\Users\\LeviUser\\Project",
        name: "Terminal 1",
        shellKind: "powershell"
      })),
      write: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
      kill: vi.fn(async () => ({
        id: "terminal-1",
        name: "Terminal 1",
        cwd: "C:\\Users\\LeviUser\\Project",
        shellKind: "powershell",
        alive: false,
        createdAt: new Date().toISOString()
      })),
      rename: vi.fn(async () => ({
        id: "terminal-1",
        name: "Terminal 1",
        cwd: "C:\\Users\\LeviUser\\Project",
        shellKind: "powershell",
        alive: true,
        createdAt: new Date().toISOString()
      })),
      list: vi.fn(async () => []),
      split: vi.fn(async () => ({
        id: "terminal-2",
        cwd: "C:\\Users\\LeviUser\\Project",
        name: "Terminal 2",
        shellKind: "powershell"
      })),
      restart: vi.fn(async () => ({
        id: "terminal-3",
        cwd: "C:\\Users\\LeviUser\\Project",
        name: "Terminal 1",
        shellKind: "powershell"
      })),
      getLayout: vi.fn(async () => ({
        tabs: [{ id: "tab-1", name: "Terminal 1", cwd: "C:\\Users\\LeviUser\\Project" }],
        activeTabId: "tab-1",
        panelTab: "terminal" as const,
        panelVisible: false,
        panelMaximized: false,
        panelHeightPx: 280,
        splitLayout: { type: "pane" as const, tabId: "tab-1" }
      })),
      setLayout: vi.fn(async (layout) => layout),
      revealCwd: vi.fn(async () => "C:\\Users\\LeviUser\\Project"),
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
    agent: {
      newSession: vi.fn(async (request = {}) => ({
        sessions: [
          {
            id: "agent-1",
            title: request.title ?? "New Agent Session",
            status: "Idle" as const,
            archived: false,
            runtimeId: request.runtimeId,
            modelId: request.modelId,
            messages: [],
            attachments: [],
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z"
          }
        ],
        activeSessionId: "agent-1",
        updatedAt: "2026-08-01T00:00:00.000Z"
      })),
      list: vi.fn(async () => agentState),
      delete: vi.fn(async () => agentState),
      rename: vi.fn(async (request) => ({
        sessions: [
          {
            id: request.sessionId,
            title: request.title,
            status: "Idle" as const,
            archived: false,
            messages: [],
            attachments: [],
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z"
          }
        ],
        activeSessionId: request.sessionId,
        updatedAt: "2026-08-01T00:00:00.000Z"
      })),
      archive: vi.fn(async (request) => ({
        ...agentState,
        sessions: agentState.sessions.map((session) => session.id === request.sessionId ? { ...session, archived: request.archived } : session),
        updatedAt: "2026-08-01T00:00:00.000Z"
      })),
      plan: vi.fn(async (request) => ({
        sessionId: request.sessionId ?? "agent-1",
        state: {
          sessions: [
            {
              id: request.sessionId ?? "agent-1",
              title: "Build login page",
              status: "WaitingForApproval" as const,
              archived: false,
              runtimeId: request.runtimeId,
              modelId: request.modelId,
              attachments: request.attachments ?? [],
              projectSummary: {
                projectName: "Project",
                languages: ["TypeScript"],
                frameworks: ["React"],
                buildSystem: ["test"],
                sourceDirectories: ["src"],
                entryPoints: ["src/main.tsx"],
                openFiles: request.openFiles?.map((file: { relativePath: string }) => file.relativePath) ?? [],
                git: { branch: "main", changedFiles: 1, summary: ["## main"] },
                context: { attachmentCount: request.attachments?.length ?? 0, tokenEstimate: 0, labels: request.attachments?.map((item: { label: string }) => item.label) ?? [] }
              },
              messages: [
                { id: "agent-message-user-1", role: "user" as const, content: request.prompt, createdAt: "2026-08-01T00:00:00.000Z" },
                { id: "agent-message-assistant-1", role: "assistant" as const, content: "Plan prepared.", createdAt: "2026-08-01T00:00:00.000Z" }
              ],
              plan: {
                id: "plan-1",
                objective: request.prompt,
                summary: "Plan prepared.",
                estimatedFiles: ["src/Login.tsx"],
                progress: { totalSteps: 2, pendingActions: 1, approvedActions: 0, rejectedActions: 0, completedActions: 0 },
                steps: [
                  { id: "step-1", order: 1, title: "Analyze project", description: "Inspect structure.", status: "Pending" as const, estimatedFiles: ["src/main.tsx"], actionIds: [] },
                  { id: "step-2", order: 2, title: "Create UI", description: "Prepare a login page proposal.", status: "Pending" as const, estimatedFiles: ["src/Login.tsx"], actionIds: ["action-1"] }
                ],
                approvals: [
                  {
                    id: "action-1",
                    type: "modify-file" as const,
                    title: "Approve file proposal",
                    description: "Review future file changes.",
                    status: "Pending" as const,
                    stepId: "step-2",
                    relativePath: "src/Login.tsx",
                    content: "export function Login() {\n  return <form>Login</form>;\n}\n",
                    createdAt: "2026-08-01T00:00:00.000Z",
                    updatedAt: "2026-08-01T00:00:00.000Z"
                  }
                ],
                executionQueue: [],
                taskRuns: [],
                terminalRuns: [],
                gitRuns: [],
                verificationReports: [],
                repairQueue: [],
                repairProgress: [],
                createdAt: "2026-08-01T00:00:00.000Z",
                updatedAt: "2026-08-01T00:00:00.000Z"
              },
              createdAt: "2026-08-01T00:00:00.000Z",
              updatedAt: "2026-08-01T00:00:00.000Z"
            }
          ],
          activeSessionId: request.sessionId ?? "agent-1",
          updatedAt: "2026-08-01T00:00:00.000Z"
        }
      })),
      approve: vi.fn(async (request) => ({
        sessions: [
          {
            id: request.sessionId,
            title: "Build login page",
            status: "Ready" as const,
            archived: false,
            messages: [],
            attachments: [],
            plan: {
              id: "plan-1",
              objective: "Build a login page",
              summary: "Plan prepared.",
              estimatedFiles: ["src/Login.tsx"],
              progress: { totalSteps: 1, pendingActions: 0, approvedActions: 1, rejectedActions: 0, completedActions: 0 },
              steps: [{ id: "step-1", order: 1, title: "Create UI", description: "Prepare a login page proposal.", status: "Approved" as const, estimatedFiles: ["src/Login.tsx"], actionIds: [request.actionId] }],
              approvals: [{
                id: request.actionId,
                type: "modify-file" as const,
                title: "Approve file proposal",
                description: "Review future file changes.",
                status: "Approved" as const,
                stepId: "step-1",
                relativePath: "src/Login.tsx",
                content: "export function Login() {\n  return <form>Login</form>;\n}\n",
                createdAt: "2026-08-01T00:00:00.000Z",
                updatedAt: "2026-08-01T00:00:00.000Z"
              }],
              executionQueue: [{
                actionId: request.actionId,
                type: "modify-file" as const,
                title: "Approve file proposal",
                relativePath: "src/Login.tsx",
                status: "Pending" as const
              }],
              taskRuns: [],
              terminalRuns: [],
              gitRuns: [],
              verificationReports: [],
              repairQueue: [],
              repairProgress: [],
              createdAt: "2026-08-01T00:00:00.000Z",
              updatedAt: "2026-08-01T00:00:00.000Z"
            },
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z"
          }
        ],
        activeSessionId: request.sessionId,
        updatedAt: "2026-08-01T00:00:00.000Z"
      })),
      reject: vi.fn(async () => agentState),
      preview: vi.fn(async (request) => ({
        sessionId: request.sessionId,
        preview: {
          previewId: "preview-1",
          sessionId: request.sessionId,
          actionId: request.actionId,
          actionType: "modify-file" as const,
          targetPath: "src/Login.tsx",
          summary: "Approve file proposal: src/Login.tsx",
          riskLevel: "medium" as const,
          destructive: false,
          originalContent: "export function Login() {\n  return null;\n}\n",
          proposedContent: "export function Login() {\n  return <form>Login</form>;\n}\n",
          addedLineCount: 1,
          removedLineCount: 1,
          diff: [
            { type: "context" as const, oldLineNumber: 1, newLineNumber: 1, content: "export function Login() {" },
            { type: "removed" as const, oldLineNumber: 2, content: "  return null;" },
            { type: "added" as const, newLineNumber: 2, content: "  return <form>Login</form>;" },
            { type: "context" as const, oldLineNumber: 3, newLineNumber: 3, content: "}" }
          ],
          createdAt: "2026-08-01T00:00:00.000Z"
        },
        state: {
          sessions: [{
            id: request.sessionId,
            title: "Build login page",
            status: "Ready" as const,
            archived: false,
            messages: [],
            attachments: [],
            plan: {
              id: "plan-1",
              objective: "Build a login page",
              summary: "Plan prepared.",
              estimatedFiles: ["src/Login.tsx"],
              progress: { totalSteps: 1, pendingActions: 0, approvedActions: 1, rejectedActions: 0, completedActions: 0 },
              steps: [{ id: "step-1", order: 1, title: "Create UI", description: "Prepare a login page proposal.", status: "Approved" as const, estimatedFiles: ["src/Login.tsx"], actionIds: [request.actionId] }],
              approvals: [{
                id: request.actionId,
                type: "modify-file" as const,
                title: "Approve file proposal",
                description: "Review future file changes.",
                status: "Approved" as const,
                stepId: "step-1",
                relativePath: "src/Login.tsx",
                content: "export function Login() {\n  return <form>Login</form>;\n}\n",
                createdAt: "2026-08-01T00:00:00.000Z",
                updatedAt: "2026-08-01T00:00:00.000Z"
              }],
              executionQueue: [{
                actionId: request.actionId,
                type: "modify-file" as const,
                title: "Approve file proposal",
                relativePath: "src/Login.tsx",
                status: "Pending" as const,
                previewId: "preview-1"
              }],
              taskRuns: [],
              terminalRuns: [],
              gitRuns: [],
              verificationReports: [],
              repairQueue: [],
              repairProgress: [],
              createdAt: "2026-08-01T00:00:00.000Z",
              updatedAt: "2026-08-01T00:00:00.000Z"
            },
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z"
          }],
          activeSessionId: request.sessionId,
          updatedAt: "2026-08-01T00:00:00.000Z"
        }
      })),
      execute: vi.fn(async (request) => ({ sessionId: request.sessionId, actionId: request.actionId, state: agentState })),
      undo: vi.fn(async (request) => ({ sessionId: request.sessionId, actionId: "action-1", relativePath: "src/Login.tsx", state: agentState })),
      restoreOperation: vi.fn(async (request) => ({ sessionId: request.sessionId, operationId: request.operationId, restoredPaths: ["src/Login.tsx"], state: agentState })),
      resumeOperation: vi.fn(async (request) => ({ sessionId: request.sessionId, operationId: request.operationId, resumedActionIds: [], state: agentState })),
      queue: vi.fn(async (request) => ({ sessionId: request.sessionId, queue: [], progress: { completed: 0, remaining: 0, estimatedFiles: 0, elapsedMs: 0 } })),
      cancel: vi.fn(async (request) => ({ sessionId: request.sessionId, actionId: request.actionId ?? "action-1", state: agentState })),
      taskPreview: vi.fn(async (request) => ({
        sessionId: request.sessionId,
        preview: {
          previewId: "task-preview-1",
          sessionId: request.sessionId,
          actionId: request.actionId,
          taskId: "npm:test",
          taskName: "test",
          source: "detected" as const,
          executable: "npm.cmd",
          args: ["test"],
          cwd: ".",
          expectedPurpose: "Run validation tests.",
          riskLevel: "low" as const,
          longRunning: false,
          definitionFingerprint: "fingerprint",
          createdAt: "2026-08-01T00:00:00.000Z"
        },
        state: agentState
      })),
      taskExecute: vi.fn(async (request) => ({
        sessionId: request.sessionId,
        actionId: request.actionId,
        taskRun: {
          actionId: request.actionId,
          taskId: "npm:test",
          taskName: "test",
          status: "Running" as const,
          runId: "task-run-1",
          terminalSessionId: "terminal-1",
          startedAt: "2026-08-01T00:00:00.000Z",
          longRunning: false,
          definitionFingerprint: "fingerprint",
          outputPreview: [],
          problems: [],
          updatedAt: "2026-08-01T00:00:00.000Z"
        },
        state: agentState
      })),
      taskCancel: vi.fn(async (request) => ({
        sessionId: request.sessionId,
        actionId: request.actionId,
        taskRun: {
          actionId: request.actionId,
          taskId: "npm:test",
          taskName: "test",
          status: "Cancelled" as const,
          longRunning: false,
          definitionFingerprint: "fingerprint",
          outputPreview: [],
          problems: [],
          updatedAt: "2026-08-01T00:00:00.000Z"
        },
        state: agentState
      })),
      taskStatus: vi.fn(async (request) => ({ sessionId: request.sessionId, taskRuns: [], state: agentState })),
      taskVerify: vi.fn(async (request) => ({
        sessionId: request.sessionId,
        actionId: request.actionId,
        verification: {
          id: "verification-1",
          actionId: request.actionId,
          taskRunId: "task-run-1",
          summary: "Tests passed.",
          exitCode: 0,
          durationMs: 120,
          outputExcerpt: "pass",
          problems: [],
          changedFiles: [],
          createdAt: "2026-08-01T00:00:00.000Z"
        },
        state: agentState
      })),
      terminalPreview: vi.fn(async (request) => ({
        sessionId: request.sessionId,
        preview: {
          previewId: "terminal-preview-1",
          sessionId: request.sessionId,
          actionId: request.actionId,
          executable: "npm.cmd",
          args: ["test"],
          cwd: "C:/workspace",
          purpose: "Run validation.",
          riskLevel: "low" as const,
          expectedOutput: "Tests pass.",
          estimatedDurationMs: 1000,
          commandId: "terminal-command-1",
          createdAt: "2026-08-01T00:00:00.000Z"
        },
        state: agentState
      })),
      terminalExecute: vi.fn(async (request) => ({
        sessionId: request.sessionId,
        actionId: request.actionId,
        terminalRun: {
          actionId: request.actionId,
          commandId: "terminal-command-1",
          executable: "npm.cmd",
          args: ["test"],
          cwd: "C:/workspace",
          status: "Running" as const,
          terminalSessionId: "terminal-1",
          startedAt: "2026-08-01T00:00:00.000Z",
          outputPreview: "running\n",
          stderrPreview: "",
          updatedAt: "2026-08-01T00:00:00.000Z"
        },
        state: agentState
      })),
      terminalCancel: vi.fn(async (request) => ({
        sessionId: request.sessionId,
        actionId: request.actionId,
        terminalRun: {
          actionId: request.actionId,
          commandId: "terminal-command-1",
          executable: "npm.cmd",
          args: ["test"],
          cwd: "C:/workspace",
          status: "Cancelled" as const,
          terminalSessionId: "terminal-1",
          exitCode: 1,
          outputPreview: "cancelled\n",
          stderrPreview: "",
          updatedAt: "2026-08-01T00:00:00.000Z"
        },
        state: agentState
      })),
      terminalStatus: vi.fn(async (request) => ({ sessionId: request.sessionId, terminalRuns: [], state: agentState })),
      gitPreview: vi.fn(async (request) => ({
        sessionId: request.sessionId,
        preview: {
          previewId: "git-preview-1",
          sessionId: request.sessionId,
          actionId: request.actionId,
          operation: "show-diff" as const,
          repositoryRoot: "C:/workspace",
          relativePaths: ["src/Login.tsx"],
          affectedFiles: ["src/Login.tsx"],
          riskLevel: "low" as const,
          unifiedDiff: "diff --git a/src/Login.tsx b/src/Login.tsx\n+change\n",
          fileCount: 1,
          addedLineCount: 1,
          removedLineCount: 0,
          status: {
            repositoryRoot: "C:/workspace",
            currentBranch: "main",
            detachedHead: false,
            headCommit: "abc123",
            hasMergeConflicts: false,
            rebaseInProgress: false,
            entries: [{ path: "src/Login.tsx", index: " ", workingTree: "M" }],
            summary: ["## main", " M src/Login.tsx"]
          },
          warnings: [],
          createdAt: "2026-08-01T00:00:00.000Z"
        },
        state: agentState
      })),
      gitExecute: vi.fn(async (request) => ({
        sessionId: request.sessionId,
        actionId: request.actionId,
        gitRun: {
          actionId: request.actionId,
          operation: "show-diff" as const,
          status: "Succeeded" as const,
          repositoryRoot: "C:/workspace",
          affectedFiles: ["src/Login.tsx"],
          durationMs: 20,
          verification: {
            id: "git-verification-1",
            actionId: request.actionId,
            operation: "show-diff" as const,
            summary: "Diff reviewed.",
            repositoryRoot: "C:/workspace",
            currentBranch: "main",
            affectedFiles: ["src/Login.tsx"],
            statusLines: ["## main", " M src/Login.tsx"],
            createdAt: "2026-08-01T00:00:00.000Z"
          },
          updatedAt: "2026-08-01T00:00:00.000Z"
        },
        state: agentState
      })),
      gitStatus: vi.fn(async (request) => ({ sessionId: request.sessionId, gitRuns: [], state: agentState })),
      verify: vi.fn(async (request) => ({
        sessionId: request.sessionId,
        report: {
          id: "verification-1",
          sessionId: request.sessionId,
          status: "Succeeded" as const,
          summary: "Verification succeeded.",
          checks: [],
          problems: [],
          terminalOutputExcerpt: "",
          taskOutputExcerpt: "",
          gitChangedFiles: [],
          exitCodes: [],
          failures: [],
          warnings: [],
          startedAt: "2026-08-01T00:00:00.000Z",
          completedAt: "2026-08-01T00:00:01.000Z"
        },
        state: agentState
      })),
      repairPlan: vi.fn(async (request) => ({ sessionId: request.sessionId, reportId: request.reportId ?? "verification-1", repairs: [], state: agentState })),
      repairExecute: vi.fn(async (request) => ({
        sessionId: request.sessionId,
        reportId: request.reportId ?? "verification-1",
        attempt: request.attempt ?? 1,
        executedActions: [],
        blockedActions: [],
        repairs: [],
        state: agentState
      })),
      repairStatus: vi.fn(async (request) => ({ sessionId: request.sessionId, repairs: [], reports: [], progress: [], state: agentState })),
      browserPreview: vi.fn(async (request) => ({
        sessionId: request.sessionId,
        preview: {
          previewId: "browser-preview-1",
          sessionId: "browser-1",
          action: "open" as const,
          targetUrl: "https://example.com/",
          sensitive: false,
          purpose: "Open test page",
          riskLevel: "medium" as const,
          createdAt: "2026-08-01T00:00:00.000Z"
        },
        state: agentState
      })),
      browserExecute: vi.fn(async (request) => ({
        sessionId: request.sessionId,
        actionId: request.actionId,
        browserRun: {
          actionId: request.actionId,
          actionType: "browser-open" as const,
          status: "Succeeded" as const,
          session: {
            id: "browser-1",
            status: "Ready" as const,
            currentUrl: "https://example.com/",
            title: "Example Domain",
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
            headless: true
          },
          updatedAt: "2026-08-01T00:00:00.000Z"
        },
        state: agentState
      })),
      browserStatus: vi.fn(async (request) => ({ sessionId: request.sessionId, browserRuns: [], state: agentState })),
      status: vi.fn(async () => agentState),
      onEvent: vi.fn((listener: (event: AgentEvent) => void) => {
        window.__leviAgentListeners.push(listener);
        return () => {
          window.__leviAgentListeners = window.__leviAgentListeners.filter((current) => current !== listener);
        };
      })
    },
    browser: {
      create: vi.fn(async () => ({
        session: {
          id: "browser-1",
          status: "Ready" as const,
          currentUrl: "https://example.com/",
          title: "Example Domain",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
          headless: true
        }
      })),
      status: vi.fn(async () => ({
        sessions: [{
          id: "browser-1",
          status: "Ready" as const,
          currentUrl: "https://example.com/",
          title: "Example Domain",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
          headless: true
        }],
        activeSessionId: "browser-1"
      })),
      snapshot: vi.fn(async () => ({
        snapshot: {
          sessionId: "browser-1",
          url: "https://example.com/",
          title: "Example Domain",
          status: "Ready" as const,
          elements: [
            { ref: "E1", role: "button", name: "Continue", elementType: "button", text: "Continue", enabled: true, sensitive: false }
          ],
          capturedAt: "2026-08-01T00:00:00.000Z"
        }
      })),
      navigate: vi.fn(async () => ({
        session: {
          id: "browser-1",
          status: "Ready" as const,
          currentUrl: "https://example.com/",
          title: "Example Domain",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
          headless: true
        },
        snapshot: {
          sessionId: "browser-1",
          url: "https://example.com/",
          title: "Example Domain",
          status: "Ready" as const,
          elements: [],
          capturedAt: "2026-08-01T00:00:00.000Z"
        }
      })),
      click: vi.fn(async () => ({ session: { id: "browser-1", status: "Ready" as const, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", headless: true } })),
      fill: vi.fn(async () => ({ session: { id: "browser-1", status: "Ready" as const, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", headless: true } })),
      press: vi.fn(async () => ({ session: { id: "browser-1", status: "Ready" as const, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", headless: true } })),
      scroll: vi.fn(async () => ({ session: { id: "browser-1", status: "Ready" as const, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", headless: true } })),
      screenshot: vi.fn(async () => ({
        session: { id: "browser-1", status: "Ready" as const, lastScreenshot: "C:\\tmp\\browser.png", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", headless: true },
        screenshotPath: "C:\\tmp\\browser.png"
      })),
      close: vi.fn(async () => ({ sessionId: "browser-1", status: "Closed" as const }))
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
  window.__leviAgentListeners = [];
  vi.stubGlobal("levi", api);
  Object.defineProperty(window, "levi", {
    value: api,
    configurable: true
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
