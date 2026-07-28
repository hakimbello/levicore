import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildProjectRulesCache } from "../dist-electron/electron/main/project-rules-context.js";
import { scanWorkspace } from "../dist-electron/electron/main/workspace-context.js";
import {
  applyStep,
  buildAggregateReview,
  createExecutionProposalFromModelOutput,
  flattenPlanExecutionSteps,
  keepTransaction,
  prepareExecutionTransaction,
  rollbackTransaction,
  validateExecutionPreconditions
} from "../dist-electron/electron/main/execution-context.js";
import { hashContent } from "../dist-electron/electron/main/edit-context.js";

const fixture = path.join(process.env.TEMP ?? "/tmp", "levi-fixture-002b");

function plan(overrides = {}) {
  const executionOrder = overrides.executionOrder ?? [
    { order: 1, title: "Config", purpose: "Rename timeout constant", affectedFiles: ["src/config.ts"], risk: "low" },
    { order: 2, title: "Server", purpose: "Update server import", affectedFiles: ["src/server.ts"], risk: "low" },
    { order: 3, title: "Routes", purpose: "Update routes import", affectedFiles: ["src/routes.ts"], risk: "low" },
    { order: 4, title: "Tests", purpose: "Update test expectations", affectedFiles: ["test/server.test.ts"], risk: "low" }
  ];
  const affectedFiles = executionOrder.flatMap((step) =>
    step.affectedFiles.map((relativePath) => ({
      relativePath,
      certainty: "confirmed",
      role: "implementation",
      reason: "fixture",
      evidenceSourceIds: []
    }))
  );
  return {
    planId: "fixture-plan-1",
    requestId: "req-1",
    goal: "Rename server timeout configuration and update affected files.",
    summary: "Rename SERVER_TIMEOUT_MS across config, server, routes, and tests.",
    confidence: "high",
    estimatedComplexity: "Medium",
    estimatedFiles: affectedFiles.length,
    estimatedSteps: executionOrder.length,
    affectedFiles,
    executionOrder,
    dependencies: [],
    validationCommands: ["npm test", "npm run typecheck"],
    risks: [],
    assumptions: [],
    openQuestions: [],
    blockedItems: [],
    suggestedNextAction: "Review and approve.",
    applicableProjectRules: [],
    designConstraints: [],
    ruleConflicts: [],
    ruleSources: [],
    timings: { retrievalMs: 1, modelMs: 2, totalMs: 3 },
    ...overrides
  };
}

function modelJson(tx, step, content) {
  return JSON.stringify({
    transactionId: tx.transactionId,
    planStepId: step.planStepId,
    targetSourceId: `EX${step.stepIndex + 1}`,
    targetRelativePath: step.relativePath,
    summary: "Fixture proposal",
    fullProposedContent: content,
    assumptions: [],
    suggestedValidationCommands: ["npm test"],
    confidence: "high",
    warnings: []
  });
}

async function hashTree(root) {
  const entries = [];
  async function walk(dir) {
    for (const child of await fs.readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, child.name);
      if (child.isDirectory()) {
        await walk(abs);
      } else {
        entries.push(`${path.relative(root, abs)}:${createHash("sha256").update(await fs.readFile(abs)).digest("hex")}`);
      }
    }
  }
  await walk(root);
  return createHash("sha256").update(entries.sort().join("\n")).digest("hex");
}

const scan = await scanWorkspace(fixture);
const cache = await buildProjectRulesCache(scan);
const p = plan();
const pre = validateExecutionPreconditions({
  plan: p,
  scan,
  rulesCache: cache,
  workspaceRootPath: scan.rootRealPath,
  activeTransactionRoot: null
});
console.log("PRECONDITIONS", pre.ok ? "PASS" : pre.reasons.join("; "));
const before = await hashTree(fixture);
const { transaction } = await prepareExecutionTransaction(p, scan, cache, scan.rootRealPath);
console.log("PREPARE writes nothing:", before === (await hashTree(fixture)));
console.log("STEPS", flattenPlanExecutionSteps(p).map((s) => s.relativePath).join(", "));

const proposals = [
  "export const REQUEST_TIMEOUT_MS = 30000;\n",
  'import { REQUEST_TIMEOUT_MS } from "./config";\n\nexport function createServer() {\n  return { timeout: REQUEST_TIMEOUT_MS };\n}\n',
  'import { createServer } from "./server";\n\nexport const routes = [{ path: "/", handler: createServer }];\n',
  'import { describe, expect, it } from "vitest";\nimport { createServer } from "../src/server";\n\ndescribe("server", () => {\n  it("uses configured timeout", () => {\n    expect(createServer().timeout).toBe(30000);\n  });\n});\n'
];

for (let i = 0; i < 3; i += 1) {
  const step = transaction.steps[i];
  const proposal = createExecutionProposalFromModelOutput({
    transaction,
    plan: p,
    scan,
    rulesCache: cache,
    modelContent: modelJson(transaction, step, proposals[i]),
    modelMs: 1
  });
  step.proposal = proposal;
  step.status = "proposed";
  await applyStep(transaction, i, { scan, rulesCache: cache });
  console.log("APPLIED", step.relativePath);
}

const step3 = transaction.steps[3];
const proposal3 = createExecutionProposalFromModelOutput({
  transaction,
  plan: p,
  scan,
  rulesCache: cache,
  modelContent: modelJson(transaction, step3, proposals[3]),
  modelMs: 1
});
step3.proposal = proposal3;
step3.status = "proposed";
await fs.writeFile(path.join(fixture, "test/server.test.ts"), "// tampered\n", "utf8");
let failed = false;
try {
  await applyStep(transaction, 3, { scan, rulesCache: cache });
} catch (error) {
  failed = true;
  console.log("FAILURE STOP", error instanceof Error ? error.message : error);
}
console.log("FAILED AS EXPECTED", failed, "STATUS", transaction.status);

const restored = await rollbackTransaction(transaction);
console.log("ROLLBACK", restored.join(", "));
const config = await fs.readFile(path.join(fixture, "src/config.ts"), "utf8");
console.log("CONFIG RESTORED", config.includes("SERVER_TIMEOUT_MS"));
const review = buildAggregateReview(transaction);
keepTransaction(transaction);
console.log("KEEP STATUS", transaction.status, "COMMANDS NOT RUN", review.commandsNotRun);
