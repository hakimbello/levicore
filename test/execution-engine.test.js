const assert = require("node:assert/strict");
const test = require("node:test");
const {
  APPROVAL_ACTIONS,
  APPROVAL_DECISIONS,
  APPROVAL_POLICIES,
  ApprovalGateway,
} = require("../src/approval-gateway");
const {
  CONTINUE_STOP_REASONS,
} = require("../src/continue-engine");
const {
  EXECUTION_ENGINE_EVENTS,
  EXECUTION_ENGINE_EVENT_TYPES,
  ExecutionEngine,
} = require("../src/execution-engine");
const {
  REPAIR_RESULTS,
  RepairEngine,
} = require("../src/repair-engine");
const {
  SECURITY_RESULTS,
  SECURITY_SEVERITIES,
  SecurityValidator,
} = require("../src/security-validator");
const {
  EXECUTION_PROGRESS_EVENTS,
  EXECUTION_PROGRESS_EVENT_TYPES,
  EXECUTION_STATES,
  ExecutionSession,
} = require("../src/execution-session");

const BASE_TIME = "2026-07-17T00:00:00.000Z";
const BASE_MS = Date.parse(BASE_TIME);

test("completes a session after successful execution and validation", async () => {
  const session = createSession({
    remainingSteps: ["task-1"],
  });
  const lifecycleEvents = [];
  const progressEvents = [];
  const engine = createEngine({
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: [],
    }),
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: true,
    }),
  });

  engine.on(EXECUTION_ENGINE_EVENTS.LIFECYCLE, (event) => lifecycleEvents.push(event.type));
  session.on(EXECUTION_PROGRESS_EVENTS.PROGRESS, (event) => progressEvents.push(event.type));

  const result = await engine.run(session);

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.OBJECTIVE_COMPLETE);
  assert.equal(result.iterations, 1);
  assert.equal(result.session.currentState, EXECUTION_STATES.COMPLETED);
  assert.deepEqual(nonSecurityEvents(lifecycleEvents), [
    EXECUTION_ENGINE_EVENT_TYPES.EXECUTION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.ITERATION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_COMPLETED,
    EXECUTION_ENGINE_EVENT_TYPES.ITERATION_COMPLETED,
    EXECUTION_ENGINE_EVENT_TYPES.EXECUTION_COMPLETED,
  ]);
  assert.equal(progressEvents.includes(EXECUTION_PROGRESS_EVENT_TYPES.COMPLETED), true);
});

test("continues automatically while ContinueEngine allows it", async () => {
  const session = createSession({
    remainingSteps: ["task-1", "task-2"],
  });
  const progressEvents = [];
  const engine = createEngine({
    executeNextTask: ({ iteration }) => ({
      completedStep: `task-${iteration}`,
      remainingSteps: iteration === 1 ? ["task-2"] : [],
    }),
    validateResults: ({ iteration }) => ({
      validationPassed: true,
      objectiveComplete: iteration === 2,
    }),
  });

  session.on(EXECUTION_PROGRESS_EVENTS.PROGRESS, (event) => progressEvents.push(event.type));

  const result = await engine.run(session);

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.iterations, 2);
  assert.deepEqual(result.session.completedSteps, ["task-1", "task-2"]);
  assert.deepEqual(
    progressEvents.filter((type) => type === EXECUTION_PROGRESS_EVENT_TYPES.CONTINUE),
    [EXECUTION_PROGRESS_EVENT_TYPES.CONTINUE],
  );
});

test("stops gracefully when maxIterations prevents another loop", async () => {
  const engine = createEngine({
    limits: {
      maxIterations: 1,
    },
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: ["task-2"],
    }),
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: false,
    }),
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1", "task-2"],
  }));

  assert.equal(result.status, "PAUSED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.MAX_ITERATIONS);
  assert.equal(result.iterations, 1);
});

test("stops gracefully when maxRuntimeMs is exceeded", async () => {
  let currentMs = BASE_MS;
  const engine = createEngine({
    limits: {
      maxRuntimeMs: 10,
    },
    now: () => currentMs,
    executeNextTask: () => {
      currentMs = BASE_MS + 5;
      return {
        completedStep: "task-1",
        remainingSteps: ["task-2"],
      };
    },
    validateResults: () => {
      currentMs = BASE_MS + 11;
      return {
        validationPassed: true,
        objectiveComplete: false,
      };
    },
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1", "task-2"],
  }));

  assert.equal(result.status, "PAUSED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.MAX_RUNTIME);
  assert.equal(result.runtimeMs, 11);
});

test("stops gracefully when maxRepairs is exceeded", async () => {
  const engine = createEngine({
    limits: {
      maxRepairs: 1,
    },
    repairEngine: createRepairEngine({
      repair: () => ({
        result: REPAIR_RESULTS.REPAIR_FAILED,
        action: "attempted repair",
      }),
    }),
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: ["task-2"],
    }),
    validateResults: () => ({
      validationPassed: false,
      error: "Validation failed.",
      objectiveComplete: false,
    }),
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1", "task-2"],
  }));

  assert.equal(result.status, "PAUSED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.MAX_REPAIRS);
  assert.equal(result.repairs, 1);
  assert.equal(result.session.currentState, EXECUTION_STATES.REPAIRING);
});

test("repairs failed validation and resumes normal completion", async () => {
  let validationCount = 0;
  const lifecycleEvents = [];
  const engine = createEngine({
    repairEngine: createRepairEngine({
      repair: () => ({
        result: REPAIR_RESULTS.REPAIRED,
        action: "patched failing file",
        metadata: {
          file: "src/app.js",
        },
      }),
    }),
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: [],
    }),
    validateResults: () => {
      validationCount += 1;
      return validationCount === 1
        ? {
            validationPassed: false,
            error: "Syntax check failed.",
          }
        : {
            validationPassed: true,
            objectiveComplete: true,
          };
    },
  });

  engine.on(EXECUTION_ENGINE_EVENTS.LIFECYCLE, (event) => lifecycleEvents.push(event.type));

  const result = await engine.run(createSession({
    remainingSteps: ["task-1"],
  }));

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.repairs, 1);
  assert.equal(validationCount, 2);
  assert.equal(result.session.currentState, EXECUTION_STATES.COMPLETED);
  assert.deepEqual(result.session.metadata.repairHistory, [{
    attempt: 1,
    failureSummary: "Syntax check failed.",
    repairAction: "patched failing file",
    result: REPAIR_RESULTS.REPAIRED,
    timestamp: BASE_TIME,
    metadata: {
      file: "src/app.js",
    },
  }]);
  assert.equal(lifecycleEvents.includes(EXECUTION_ENGINE_EVENT_TYPES.REPAIR_STARTED), true);
  assert.equal(lifecycleEvents.includes(EXECUTION_ENGINE_EVENT_TYPES.REPAIR_COMPLETED), true);
});

test("attempts another repair after a failed repair when bounded attempts remain", async () => {
  let repairCount = 0;
  let validationCount = 0;
  const engine = createEngine({
    limits: {
      maxRepairs: 2,
    },
    repairEngine: createRepairEngine({
      repair: () => {
        repairCount += 1;
        return repairCount === 1
          ? {
              result: REPAIR_RESULTS.REPAIR_FAILED,
              action: "first repair failed",
            }
          : {
              result: REPAIR_RESULTS.RETRY_VALIDATION,
              action: "second repair applied",
            };
      },
    }),
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: [],
    }),
    validateResults: () => {
      validationCount += 1;
      return validationCount === 1
        ? {
            validationPassed: false,
            error: "Test failed.",
          }
        : {
            validationPassed: true,
            objectiveComplete: true,
          };
    },
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1"],
  }));

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.repairs, 2);
  assert.deepEqual(result.session.metadata.repairHistory.map((entry) => entry.result), [
    REPAIR_RESULTS.REPAIR_FAILED,
    REPAIR_RESULTS.RETRY_VALIDATION,
  ]);
});

test("stops when repair engine cannot repair", async () => {
  const engine = createEngine({
    repairEngine: createRepairEngine({
      canRepair: () => false,
    }),
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: ["task-2"],
    }),
    validateResults: () => ({
      validationPassed: false,
      failureDetails: {
        summary: "Unsafe failure.",
      },
    }),
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1", "task-2"],
  }));

  assert.equal(result.status, "PAUSED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.EXECUTION_FAILED);
  assert.equal(result.repairResult, REPAIR_RESULTS.CANNOT_REPAIR);
  assert.equal(result.session.metadata.repairHistory[0].result, REPAIR_RESULTS.CANNOT_REPAIR);
});

test("stops and emits restore_required when repair requires restore", async () => {
  const lifecycleEvents = [];
  const engine = createEngine({
    repairEngine: createRepairEngine({
      repair: () => ({
        result: REPAIR_RESULTS.RESTORE_REQUIRED,
        action: "restore from point",
      }),
    }),
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: ["task-2"],
    }),
    validateResults: () => ({
      validationPassed: false,
      error: "Repair would be unsafe.",
    }),
  });

  engine.on(EXECUTION_ENGINE_EVENTS.LIFECYCLE, (event) => lifecycleEvents.push(event.type));

  const result = await engine.run(createSession({
    remainingSteps: ["task-1", "task-2"],
  }));

  assert.equal(result.status, "PAUSED");
  assert.equal(result.repairResult, REPAIR_RESULTS.RESTORE_REQUIRED);
  assert.equal(lifecycleEvents.includes(EXECUTION_ENGINE_EVENT_TYPES.RESTORE_REQUIRED), true);
});

test("emits repair events in deterministic order", async () => {
  const lifecycleEvents = [];
  const engine = createEngine({
    repairEngine: createRepairEngine(),
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: [],
    }),
    validateResults: ({ repairs }) => repairs === 0
      ? {
          validationPassed: false,
          error: "Needs repair.",
        }
      : {
          validationPassed: true,
          objectiveComplete: true,
        },
  });

  engine.on(EXECUTION_ENGINE_EVENTS.LIFECYCLE, (event) => lifecycleEvents.push(event.type));

  await engine.run(createSession({
    remainingSteps: ["task-1"],
  }));

  const nonSecurityLifecycleEvents = nonSecurityEvents(lifecycleEvents);
  const repairStart = nonSecurityLifecycleEvents.indexOf(EXECUTION_ENGINE_EVENT_TYPES.REPAIR_STARTED);

  assert.deepEqual(nonSecurityLifecycleEvents.slice(repairStart, repairStart + 7), [
    EXECUTION_ENGINE_EVENT_TYPES.REPAIR_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.REPAIR_PLAN_CREATED,
    EXECUTION_ENGINE_EVENT_TYPES.REPAIR_ATTEMPTED,
    EXECUTION_ENGINE_EVENT_TYPES.REPAIR_COMPLETED,
    EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_COMPLETED,
    EXECUTION_ENGINE_EVENT_TYPES.ITERATION_COMPLETED,
  ]);
});

test("repair history remains available in session snapshots", async () => {
  const engine = createEngine({
    repairEngine: createRepairEngine(),
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: [],
    }),
    validateResults: ({ repairs }) => repairs === 0
      ? {
          validationPassed: false,
          error: "Needs repair.",
        }
      : {
          validationPassed: true,
          objectiveComplete: true,
        },
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1"],
  }));

  assert.equal(Array.isArray(result.session.metadata.repairHistory), true);
  assert.equal(result.session.metadata.repairHistory.length, 1);
});

test("allows safe pending actions through security validation", async () => {
  let executed = false;
  const engine = createEngine({
    securityValidator: createSecurityValidator({
      actionValidators: [() => null],
    }),
    executeNextTask: () => {
      executed = true;
      return {
        completedStep: "read",
        remainingSteps: [],
      };
    },
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: true,
    }),
  });

  const result = await engine.run(createSession({
    remainingSteps: ["read"],
    metadata: {
      pendingActions: [{
        action: APPROVAL_ACTIONS.SAFE_FILE_READ,
        safe: true,
      }],
    },
  }));

  assert.equal(executed, true);
  assert.equal(result.status, "COMPLETED");
  assert.deepEqual(result.session.metadata.securityFindings || [], []);
});

test("records warning findings and continues execution", async () => {
  const lifecycleEvents = [];
  const engine = createEngine({
    securityValidator: createSecurityValidator({
      actionValidators: [() => securityFinding({
        ruleId: "shell-warning",
        status: SECURITY_RESULTS.WARNING,
        severity: SECURITY_SEVERITIES.MEDIUM,
        evidence: {
          command: "npm test",
        },
      })],
    }),
    executeNextTask: () => ({
      completedStep: "command",
      remainingSteps: [],
    }),
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: true,
    }),
  });

  engine.on(EXECUTION_ENGINE_EVENTS.LIFECYCLE, (event) => lifecycleEvents.push(event.type));

  const result = await engine.run(createSession({
    remainingSteps: ["command"],
    metadata: {
      pendingActions: [{
        action: APPROVAL_ACTIONS.EXECUTE_SHELL_COMMAND,
        safe: true,
      }],
    },
  }));

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.session.metadata.securityFindings.length, 1);
  assert.equal(result.session.metadata.securityFindings[0].ruleId, "shell-warning");
  assert.equal(lifecycleEvents.includes(EXECUTION_ENGINE_EVENT_TYPES.SECURITY_WARNING), true);
});

test("blocks unsafe pending actions before execution", async () => {
  let executed = false;
  const engine = createEngine({
    securityValidator: createSecurityValidator({
      actionValidators: [() => securityFinding({
        ruleId: "dangerous-delete",
        status: SECURITY_RESULTS.BLOCKED,
        severity: SECURITY_SEVERITIES.CRITICAL,
        evidence: {
          path: "src/app.js",
        },
      })],
    }),
    executeNextTask: () => {
      executed = true;
      return {
        completedStep: "delete",
        remainingSteps: [],
      };
    },
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: true,
    }),
  });

  const result = await engine.run(createSession({
    remainingSteps: ["delete"],
    metadata: {
      pendingActions: [{
        action: APPROVAL_ACTIONS.DELETE_FILE,
      }],
    },
  }));

  assert.equal(executed, false);
  assert.equal(result.status, "PAUSED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.SECURITY_STOP);
  assert.equal(result.securityResult, SECURITY_RESULTS.BLOCKED);
  assert.equal(result.session.metadata.securityStop, true);
});

test("pauses through approval when security review is required", async () => {
  let executed = false;
  const engine = createEngine({
    securityValidator: createSecurityValidator({
      actionValidators: [() => securityFinding({
        ruleId: "network-review",
        status: SECURITY_RESULTS.REQUIRES_REVIEW,
        severity: SECURITY_SEVERITIES.HIGH,
        evidence: {
          host: "example.com",
        },
      })],
    }),
    executeNextTask: () => {
      executed = true;
      return {
        completedStep: "network",
        remainingSteps: [],
      };
    },
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: true,
    }),
  });

  const result = await engine.run(createSession({
    remainingSteps: ["network"],
    metadata: {
      pendingActions: [{
        action: APPROVAL_ACTIONS.NETWORK_OPERATION,
      }],
    },
  }));

  assert.equal(executed, false);
  assert.equal(result.status, "PAUSED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.APPROVAL_REQUIRED);
  assert.equal(result.securityResult, SECURITY_RESULTS.REQUIRES_REVIEW);
  assert.equal(result.approvalRequest.action.action, APPROVAL_ACTIONS.SECURITY_REVIEW);
  assert.equal(result.session.currentState, EXECUTION_STATES.WAITING_FOR_APPROVAL);
});

test("detects post-execution security findings", async () => {
  const engine = createEngine({
    securityValidator: createSecurityValidator({
      resultValidators: [(result, context) => context.phase === "post_execution"
        ? securityFinding({
            ruleId: "post-exec-secret",
            status: SECURITY_RESULTS.WARNING,
            evidence: {
              file: result.changedFile,
            },
          })
        : null],
    }),
    executeNextTask: () => ({
      changedFile: "src/config.js",
      completedStep: "task-1",
      remainingSteps: [],
    }),
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: true,
    }),
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1"],
  }));

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.session.metadata.securityFindings[0].ruleId, "post-exec-secret");
});

test("blocks before automatic continuation", async () => {
  const engine = createEngine({
    securityValidator: createSecurityValidator({
      sessionValidators: [(session, context) => context.phase === "pre_continuation"
        ? securityFinding({
            ruleId: "pre-continuation-block",
            status: SECURITY_RESULTS.BLOCKED,
            severity: SECURITY_SEVERITIES.CRITICAL,
            evidence: {
              sessionId: session.sessionId,
            },
          })
        : null],
    }),
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: ["task-2"],
    }),
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: false,
    }),
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1", "task-2"],
  }));

  assert.equal(result.status, "PAUSED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.SECURITY_STOP);
  assert.equal(result.session.metadata.securityFindings[0].ruleId, "pre-continuation-block");
});

test("blocks before objective completion", async () => {
  const engine = createEngine({
    securityValidator: createSecurityValidator({
      sessionValidators: [(session, context) => context.phase === "pre_completion"
        ? securityFinding({
            ruleId: "pre-completion-block",
            status: SECURITY_RESULTS.BLOCKED,
            severity: SECURITY_SEVERITIES.CRITICAL,
            evidence: {
              sessionId: session.sessionId,
            },
          })
        : null],
    }),
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: [],
    }),
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: true,
    }),
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1"],
  }));

  assert.equal(result.status, "PAUSED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.SECURITY_STOP);
  assert.notEqual(result.session.currentState, EXECUTION_STATES.COMPLETED);
});

test("suppresses duplicate security findings during a session", async () => {
  const duplicateFinding = securityFinding({
    ruleId: "duplicate-secret",
    status: SECURITY_RESULTS.WARNING,
    evidence: {
      file: "src/config.js",
    },
  });
  const engine = createEngine({
    securityValidator: createSecurityValidator({
      resultValidators: [() => duplicateFinding],
    }),
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: [],
    }),
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: true,
    }),
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1"],
  }));

  assert.equal(result.session.metadata.securityFindings.length, 1);
});

test("security findings remain snapshot compatible", async () => {
  const engine = createEngine({
    securityValidator: createSecurityValidator({
      resultValidators: [() => securityFinding({
        ruleId: "snapshot-warning",
        status: SECURITY_RESULTS.WARNING,
        evidence: {
          file: "src/app.js",
        },
      })],
    }),
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: [],
    }),
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: true,
    }),
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1"],
  }));

  assert.equal(Array.isArray(result.session.metadata.securityFindings), true);
  assert.equal(result.session.metadata.securityFindings[0].ruleId, "snapshot-warning");
});

test("emits security events in deterministic order for pending actions", async () => {
  const lifecycleEvents = [];
  const engine = createEngine({
    securityValidator: createSecurityValidator({
      actionValidators: [() => securityFinding({
        ruleId: "order-warning",
        status: SECURITY_RESULTS.WARNING,
        evidence: {
          action: "read",
        },
      })],
    }),
    executeNextTask: () => ({
      completedStep: "read",
      remainingSteps: [],
    }),
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: true,
    }),
  });

  engine.on(EXECUTION_ENGINE_EVENTS.LIFECYCLE, (event) => lifecycleEvents.push(event.type));

  await engine.run(createSession({
    remainingSteps: ["read"],
    metadata: {
      pendingActions: [{
        action: APPROVAL_ACTIONS.SAFE_FILE_READ,
        safe: true,
      }],
    },
  }));

  assert.deepEqual(lifecycleEvents.slice(2, 5), [
    EXECUTION_ENGINE_EVENT_TYPES.SECURITY_VALIDATION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.SECURITY_VALIDATION_COMPLETED,
    EXECUTION_ENGINE_EVENT_TYPES.SECURITY_WARNING,
  ]);
});

test("security warnings remain compatible with repair loops", async () => {
  let validationCount = 0;
  const engine = createEngine({
    securityValidator: createSecurityValidator({
      resultValidators: [() => securityFinding({
        ruleId: "repair-compatible-warning",
        status: SECURITY_RESULTS.WARNING,
        evidence: {
          file: "src/app.js",
        },
      })],
    }),
    repairEngine: createRepairEngine(),
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: [],
    }),
    validateResults: () => {
      validationCount += 1;
      return validationCount === 1
        ? {
            validationPassed: false,
            error: "Needs repair.",
          }
        : {
            validationPassed: true,
            objectiveComplete: true,
          };
    },
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1"],
  }));

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.repairs, 1);
  assert.equal(result.session.metadata.securityFindings.length, 1);
});

test("security warnings remain compatible with continuation", async () => {
  const engine = createEngine({
    securityValidator: createSecurityValidator({
      sessionValidators: [(session, context) => context.phase === "pre_continuation"
        ? securityFinding({
            ruleId: "continuation-warning",
            status: SECURITY_RESULTS.WARNING,
            evidence: {
              phase: context.phase,
            },
          })
        : null],
    }),
    executeNextTask: ({ iteration }) => ({
      completedStep: `task-${iteration}`,
      remainingSteps: iteration === 1 ? ["task-2"] : [],
    }),
    validateResults: ({ iteration }) => ({
      validationPassed: true,
      objectiveComplete: iteration === 2,
    }),
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1", "task-2"],
  }));

  assert.equal(result.status, "COMPLETED");
  assert.equal(result.iterations, 2);
  assert.equal(result.session.metadata.securityFindings.some((finding) => finding.ruleId === "continuation-warning"), true);
});

test("stops immediately when ContinueEngine returns false", async () => {
  const lifecycleEvents = [];
  const engine = createEngine({
    executeNextTask: () => ({
      completedStep: "task-1",
      remainingSteps: ["task-2"],
    }),
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: false,
      approvalRequired: true,
    }),
  });

  engine.on(EXECUTION_ENGINE_EVENTS.LIFECYCLE, (event) => lifecycleEvents.push(event.type));

  const result = await engine.run(createSession({
    remainingSteps: ["task-1", "task-2"],
  }));

  assert.equal(result.status, "PAUSED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.APPROVAL_REQUIRED);
  assert.equal(result.iterations, 1);
  assert.deepEqual(lifecycleEvents.slice(-2), [
    EXECUTION_ENGINE_EVENT_TYPES.ITERATION_COMPLETED,
    EXECUTION_ENGINE_EVENT_TYPES.EXECUTION_PAUSED,
  ]);
});

test("pauses execution when an action requires approval", async () => {
  let executed = false;
  const lifecycleEvents = [];
  const approvalGateway = createApprovalGateway({
    policy: APPROVAL_POLICIES.DESTRUCTIVE_ONLY,
  });
  const engine = createEngine({
    approvalGateway,
    executeNextTask: () => {
      executed = true;
      return {
        completedStep: "delete",
        remainingSteps: [],
      };
    },
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: true,
    }),
  });

  engine.on(EXECUTION_ENGINE_EVENTS.LIFECYCLE, (event) => lifecycleEvents.push(event));

  const result = await engine.run(createSession({
    remainingSteps: ["delete"],
    metadata: {
      pendingActions: [{
        action: APPROVAL_ACTIONS.DELETE_FILE,
        metadata: {
          path: "src/old.js",
        },
      }],
    },
  }));

  assert.equal(executed, false);
  assert.equal(result.status, "PAUSED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.APPROVAL_REQUIRED);
  assert.equal(result.approvalRequest.action.action, APPROVAL_ACTIONS.DELETE_FILE);
  assert.equal(result.session.currentState, EXECUTION_STATES.WAITING_FOR_APPROVAL);
  assert.equal(result.session.approvalRequired, true);
  assert.equal(lifecycleEvents.at(-1).type, EXECUTION_ENGINE_EVENT_TYPES.EXECUTION_PAUSED);
  assert.equal(lifecycleEvents.at(-1).approvalRequest.id, result.approvalRequest.id);
});

test("resumes a paused session after approval", async () => {
  let executeCount = 0;
  const approvalGateway = createApprovalGateway({
    policy: APPROVAL_POLICIES.DESTRUCTIVE_ONLY,
  });
  const engine = createEngine({
    approvalGateway,
    executeNextTask: () => {
      executeCount += 1;
      return {
        completedStep: "delete",
        remainingSteps: [],
      };
    },
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: true,
    }),
  });
  const session = createSession({
    remainingSteps: ["delete"],
    metadata: {
      pendingActions: [{
        action: APPROVAL_ACTIONS.DELETE_FILE,
        metadata: {
          path: "src/old.js",
        },
      }],
    },
  });

  const paused = await engine.run(session);
  approvalGateway.approveRequest(paused.approvalRequest.id);
  const resumed = await engine.resume(session);

  assert.equal(executeCount, 1);
  assert.equal(resumed.status, "COMPLETED");
  assert.equal(resumed.stopReason, CONTINUE_STOP_REASONS.OBJECTIVE_COMPLETE);
  assert.equal(resumed.session.approvalRequired, false);
  assert.equal(resumed.session.metadata.approvalRequest, undefined);
  assert.deepEqual(resumed.session.metadata.approvedApprovalRequestIds, [paused.approvalRequest.id]);
});

test("stops gracefully when an action is denied", async () => {
  let executed = false;
  const engine = createEngine({
    approvalGateway: createApprovalGateway({
      policy: APPROVAL_POLICIES.CUSTOM,
      customPolicy: () => APPROVAL_DECISIONS.DENIED,
    }),
    executeNextTask: () => {
      executed = true;
      return {
        completedStep: "install",
        remainingSteps: [],
      };
    },
    validateResults: () => ({
      validationPassed: true,
      objectiveComplete: true,
    }),
  });

  const result = await engine.run(createSession({
    remainingSteps: ["install"],
    metadata: {
      pendingActions: [{
        action: APPROVAL_ACTIONS.INSTALL_PACKAGE,
        metadata: {
          packageName: "left-pad",
        },
      }],
    },
  }));

  assert.equal(executed, false);
  assert.equal(result.status, "PAUSED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.SECURITY_STOP);
  assert.equal(result.approvalDecision, APPROVAL_DECISIONS.DENIED);
  assert.equal(result.session.metadata.securityStop, true);
});

test("handles execution errors as graceful execution_failed stops", async () => {
  const engine = createEngine({
    executeNextTask: () => {
      throw new Error("executor failed");
    },
    validateResults: () => ({
      validationPassed: true,
    }),
  });

  const result = await engine.run(createSession({
    remainingSteps: ["task-1"],
  }));

  assert.equal(result.status, "PAUSED");
  assert.equal(result.stopReason, CONTINUE_STOP_REASONS.EXECUTION_FAILED);
  assert.equal(result.error, "executor failed");
  assert.equal(result.session.currentState, EXECUTION_STATES.FAILED);
});

test("emits lifecycle events in deterministic order across a continue loop", async () => {
  const lifecycleEvents = [];
  const engine = createEngine({
    executeNextTask: ({ iteration }) => ({
      completedStep: `task-${iteration}`,
      remainingSteps: iteration === 1 ? ["task-2"] : [],
    }),
    validateResults: ({ iteration }) => ({
      validationPassed: true,
      objectiveComplete: iteration === 2,
    }),
  });

  engine.on(EXECUTION_ENGINE_EVENTS.LIFECYCLE, (event) => lifecycleEvents.push(event.type));

  await engine.run(createSession({
    remainingSteps: ["task-1", "task-2"],
  }));

  assert.deepEqual(nonSecurityEvents(lifecycleEvents), [
    EXECUTION_ENGINE_EVENT_TYPES.EXECUTION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.ITERATION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_COMPLETED,
    EXECUTION_ENGINE_EVENT_TYPES.ITERATION_COMPLETED,
    EXECUTION_ENGINE_EVENT_TYPES.ITERATION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_STARTED,
    EXECUTION_ENGINE_EVENT_TYPES.VALIDATION_COMPLETED,
    EXECUTION_ENGINE_EVENT_TYPES.ITERATION_COMPLETED,
    EXECUTION_ENGINE_EVENT_TYPES.EXECUTION_COMPLETED,
  ]);
});

function createEngine(options) {
  return new ExecutionEngine({
    now: options.now || (() => BASE_MS),
    limits: {
      maxIterations: 5,
      maxRuntimeMs: 1000,
      maxRepairs: 2,
      ...(options.limits || {}),
    },
    executeNextTask: options.executeNextTask,
    validateResults: options.validateResults,
    continueEngine: options.continueEngine,
    repairEngine: options.repairEngine,
    securityValidator: options.securityValidator,
    approvalGateway: options.approvalGateway,
    getPendingActions: options.getPendingActions,
  });
}

function createSecurityValidator(options = {}) {
  return new SecurityValidator({
    now: () => BASE_TIME,
    ...options,
  });
}

function nonSecurityEvents(events) {
  return events.filter((event) => !String(event).startsWith("security_"));
}

function securityFinding(input) {
  return {
    ruleId: input.ruleId,
    title: input.title || input.ruleId,
    description: input.description || `${input.ruleId} detected.`,
    severity: input.severity || SECURITY_SEVERITIES.MEDIUM,
    status: input.status || SECURITY_RESULTS.WARNING,
    evidence: input.evidence || {},
    remediation: input.remediation || "Review and remediate the finding.",
    metadata: input.metadata || {},
  };
}

function createRepairEngine(options = {}) {
  return new RepairEngine({
    canRepair: () => true,
    createRepairPlan: () => ({
      action: "repair validation failure",
    }),
    repair: () => ({
      result: REPAIR_RESULTS.REPAIRED,
      action: "repair validation failure",
    }),
    ...options,
  });
}

function createApprovalGateway(options = {}) {
  return new ApprovalGateway({
    now: () => BASE_TIME,
    ...options,
  });
}

function createSession(input = {}) {
  return new ExecutionSession({
    sessionId: "session-1",
    objective: "Implement bounded execution.",
    currentState: EXECUTION_STATES.IDLE,
    startedAt: BASE_TIME,
    updatedAt: BASE_TIME,
    ...input,
  });
}
