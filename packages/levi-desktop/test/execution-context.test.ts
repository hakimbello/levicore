import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ExecutionPlan, PlanExecutionStep, ProjectRuleConflict } from "../src/types/levi-api";
import { hashContent } from "../electron/main/edit-context";
import { createExecutionPlan, discoverPlanningCandidates } from "../electron/main/planning-context";
import {
  applyStep,
  assertRuleSnapshotFresh,
  buildAggregateReview,
  cancelTransaction,
  computeRuleSnapshotFingerprint,
  createExecutionProposalFromModelOutput,
  flattenPlanExecutionSteps,
  getActiveTransactionForRoot,
  keepTransaction,
  prepareExecutionTransaction,
  registerExecutionTransaction,
  rejectStepProposal,
  rollbackTransaction,
  unregisterExecutionTransaction,
  validateExecutionPreconditions,
  type InternalExecutionFileState,
  type InternalExecutionTransaction
} from "../electron/main/execution-context";
import { buildProjectRulesCache, type ProjectRulesCache } from "../electron/main/project-rules-context";
import { scanWorkspace, type WorkspaceScan } from "../electron/main/workspace-context";

async function makeWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "levi-exec-"));
}

async function writeFile(root: string, relativePath: string, content: string | Buffer): Promise<void> {
  const fullPath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content);
}

async function hashTree(root: string): Promise<string> {
  const entries: string[] = [];
  async function walk(directory: string) {
    const children = await fs.readdir(directory, { withFileTypes: true });
    for (const child of children) {
      const absolutePath = path.join(directory, child.name);
      if (child.isDirectory()) {
        await walk(absolutePath);
      } else {
        const relativePath = path.relative(root, absolutePath);
        const content = await fs.readFile(absolutePath);
        entries.push(`${relativePath}:${createHash("sha256").update(content).digest("hex")}`);
      }
    }
  }
  await walk(root);
  return createHash("sha256").update(entries.sort().join("\n")).digest("hex");
}

async function writeFixture(root: string): Promise<void> {
  await writeFile(
    root,
    "package.json",
    JSON.stringify({ name: "exec-fixture", scripts: { test: "vitest run" } }, null, 2)
  );
  await writeFile(root, "src/main.ts", "export const label = 'Old';\n");
  await writeFile(root, "src/util.ts", "export const helper = true;\n");
  await writeFile(root, "README.md", "# Fixture\n");
}

function basePlan(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  const executionOrder: PlanExecutionStep[] = overrides.executionOrder ?? [
    {
      order: 1,
      title: "Update implementation",
      purpose: "Apply the planned code change.",
      affectedFiles: ["src/main.ts"],
      risk: "low"
    }
  ];
  const affectedFiles =
    overrides.affectedFiles ??
    executionOrder.flatMap((step) =>
      step.affectedFiles.map((relativePath) => ({
        relativePath,
        certainty: "confirmed" as const,
        role: "implementation",
        reason: "test fixture",
        evidenceSourceIds: []
      }))
    );
  return {
    planId: "plan-test-1",
    requestId: "req-test-1",
    goal: "Update main module",
    summary: "Change the label export in src/main.ts.",
    confidence: "high",
    estimatedComplexity: "Low",
    estimatedFiles: affectedFiles.length,
    estimatedSteps: executionOrder.length,
    affectedFiles,
    executionOrder,
    dependencies: [],
    validationCommands: ["npm test"],
    risks: [],
    assumptions: [],
    openQuestions: [],
    blockedItems: [],
    suggestedNextAction: "Review and execute.",
    applicableProjectRules: [],
    designConstraints: [],
    ruleConflicts: [],
    ruleSources: [],
    timings: { retrievalMs: 1, modelMs: 2, totalMs: 3 },
    ...overrides
  };
}

async function prepareFixture(params?: {
  plan?: ExecutionPlan;
  activeTransactionRoot?: string | null;
}): Promise<{
  root: string;
  scan: WorkspaceScan;
  cache: ProjectRulesCache;
  plan: ExecutionPlan;
  transaction: InternalExecutionTransaction;
}> {
  const root = await makeWorkspace();
  await writeFixture(root);
  const scan = await scanWorkspace(root);
  const cache = await buildProjectRulesCache(scan);
  const plan = params?.plan ?? basePlan();
  const { transaction } = await prepareExecutionTransaction(
    plan,
    scan,
    cache,
    root,
    params?.activeTransactionRoot ?? null
  );
  return { root, scan, cache, plan, transaction };
}

function modelOutputJson(params: {
  transaction: InternalExecutionTransaction;
  step: InternalExecutionFileState;
  proposedContent: string;
  overrides?: Partial<{ transactionId: string; planStepId: string; targetSourceId: string; targetRelativePath: string }>;
}): string {
  return JSON.stringify({
    transactionId: params.overrides?.transactionId ?? params.transaction.transactionId,
    planStepId: params.overrides?.planStepId ?? params.step.planStepId,
    targetSourceId: params.overrides?.targetSourceId ?? `EX${params.step.stepIndex + 1}`,
    targetRelativePath: params.overrides?.targetRelativePath ?? params.step.relativePath,
    summary: "Update file content",
    fullProposedContent: params.proposedContent,
    assumptions: ["single step"],
    suggestedValidationCommands: ["npm test"],
    confidence: "high",
    warnings: []
  });
}

function attachProposal(params: {
  transaction: InternalExecutionTransaction;
  plan: ExecutionPlan;
  scan: WorkspaceScan;
  cache: ProjectRulesCache;
  proposedContent: string;
  stepIndex?: number;
}): void {
  const stepIndex = params.stepIndex ?? params.transaction.currentStepIndex;
  const step = params.transaction.steps[stepIndex];
  const proposal = createExecutionProposalFromModelOutput({
    transaction: params.transaction,
    plan: params.plan,
    scan: params.scan,
    rulesCache: params.cache,
    modelContent: modelOutputJson({
      transaction: params.transaction,
      step,
      proposedContent: params.proposedContent
    }),
    modelMs: 3
  });
  step.proposal = proposal;
  step.status = "proposed";
}

describe("IDE-002B execution context", () => {
  describe("validateExecutionPreconditions", () => {
    it("blocks when no workspace is open", async () => {
      const root = await makeWorkspace();
      await writeFixture(root);
      const scan = await scanWorkspace(root);
      const cache = await buildProjectRulesCache(scan);
      const plan = basePlan();

      const result = validateExecutionPreconditions({
        plan,
        scan,
        rulesCache: cache,
        workspaceRootPath: null,
        activeTransactionRoot: null
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons).toContain("No workspace is open.");
      }
    });

    it("blocks when workspace scan is stale relative to the active root", async () => {
      const root = await makeWorkspace();
      const other = await makeWorkspace();
      await writeFixture(root);
      const scan = await scanWorkspace(root);
      const cache = await buildProjectRulesCache(scan);
      const plan = basePlan();

      const result = validateExecutionPreconditions({
        plan,
        scan,
        rulesCache: cache,
        workspaceRootPath: other,
        activeTransactionRoot: null
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons.some((reason) => reason.includes("stale"))).toBe(true);
      }
    });

    it("blocks when all affected files are marked possible", async () => {
      const root = await makeWorkspace();
      await writeFixture(root);
      const scan = await scanWorkspace(root);
      const cache = await buildProjectRulesCache(scan);
      const plan = basePlan({
        affectedFiles: [
          {
            relativePath: "src/main.ts",
            certainty: "possible",
            role: "implementation",
            reason: "uncertain",
            evidenceSourceIds: []
          }
        ]
      });

      const result = validateExecutionPreconditions({
        plan,
        scan,
        rulesCache: cache,
        workspaceRootPath: scan.rootRealPath,
        activeTransactionRoot: null
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons.some((reason) => reason.includes("Possible"))).toBe(true);
        expect(result.reasons.some((reason) => reason.includes("requires confirmation"))).toBe(true);
      }
    });

    it("blocks when an execution transaction is already active for the workspace", async () => {
      const root = await makeWorkspace();
      await writeFixture(root);
      const scan = await scanWorkspace(root);
      const cache = await buildProjectRulesCache(scan);
      const plan = basePlan();

      const result = validateExecutionPreconditions({
        plan,
        scan,
        rulesCache: cache,
        workspaceRootPath: scan.rootRealPath,
        activeTransactionRoot: scan.rootRealPath
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons.some((reason) => reason.includes("already active"))).toBe(true);
      }
    });

    it("blocks duplicate file paths in execution order", async () => {
      const root = await makeWorkspace();
      await writeFixture(root);
      const scan = await scanWorkspace(root);
      const cache = await buildProjectRulesCache(scan);
      const plan = basePlan({
        executionOrder: [
          {
            order: 1,
            title: "First touch",
            purpose: "First edit",
            affectedFiles: ["src/main.ts"],
            risk: "low"
          },
          {
            order: 2,
            title: "Second touch",
            purpose: "Duplicate edit",
            affectedFiles: ["src/main.ts"],
            risk: "low"
          }
        ]
      });

      const result = validateExecutionPreconditions({
        plan,
        scan,
        rulesCache: cache,
        workspaceRootPath: scan.rootRealPath,
        activeTransactionRoot: null
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons.some((reason) => reason.includes("Duplicate file paths"))).toBe(true);
      }
    });

    it("allows timeout rename plans when execution order deduplicates overlapping groups", async () => {
      const root = await makeWorkspace();
      await fs.mkdir(path.join(root, "src"), { recursive: true });
      await fs.mkdir(path.join(root, "test"), { recursive: true });
      await fs.writeFile(path.join(root, "src/config.ts"), "export const SERVER_TIMEOUT_MS = 30000;\n");
      await fs.writeFile(
        path.join(root, "src/server.ts"),
        'import { SERVER_TIMEOUT_MS } from "./config";\nexport function createServer() { return { timeout: SERVER_TIMEOUT_MS }; }\n'
      );
      await fs.writeFile(path.join(root, "src/routes.ts"), 'import { createServer } from "./server";\nexport const routes = [];\n');
      await fs.writeFile(path.join(root, "test/server.test.ts"), "import '../src/server';\n");
      const scan = await scanWorkspace(root);
      const cache = await buildProjectRulesCache(scan);
      const { candidates } = await discoverPlanningCandidates(
        scan,
        "Rename the server timeout configuration and update all affected files."
      );
      const plan = createExecutionPlan({
        requestId: "timeout-plan",
        prompt: "Rename the server timeout configuration and update all affected files.",
        scan,
        candidates,
        modelOutput: {
          goal: "Rename timeout configuration",
          summary: "Rename SERVER_TIMEOUT_MS across affected files.",
          confidence: "medium",
          risks: [],
          assumptions: [],
          openQuestions: [],
          blockedItems: [],
          suggestedNextAction: "Review and approve."
        },
        timings: { retrievalMs: 1, modelMs: 2, totalMs: 3 }
      });

      const result = validateExecutionPreconditions({
        plan,
        scan,
        rulesCache: cache,
        workspaceRootPath: scan.rootRealPath,
        activeTransactionRoot: null
      });

      expect(result.ok).toBe(true);
      expect(flattenPlanExecutionSteps(plan).map((step) => step.relativePath)).toContain("src/config.ts");
    });

    it("blocks unsupported create and delete operations", async () => {
      const root = await makeWorkspace();
      await writeFixture(root);
      const scan = await scanWorkspace(root);
      const cache = await buildProjectRulesCache(scan);
      const createPlan = basePlan({
        goal: "Add new module",
        summary: "Introduce src/new-file.ts for the feature.",
        executionOrder: [
          {
            order: 1,
            title: "Create module",
            purpose: "Add the new file",
            affectedFiles: ["src/new-file.ts"],
            risk: "medium"
          }
        ],
        affectedFiles: [
          {
            relativePath: "src/new-file.ts",
            certainty: "confirmed",
            role: "implementation",
            reason: "new file",
            evidenceSourceIds: []
          }
        ]
      });
      const deletePlan = basePlan({
        goal: "Remove legacy module",
        summary: "Delete src/legacy.ts because it is unused.",
        executionOrder: [
          {
            order: 1,
            title: "Remove legacy",
            purpose: "Delete the old file",
            affectedFiles: ["src/main.ts"],
            risk: "medium"
          }
        ]
      });

      const createResult = validateExecutionPreconditions({
        plan: createPlan,
        scan,
        rulesCache: cache,
        workspaceRootPath: scan.rootRealPath,
        activeTransactionRoot: null
      });
      const deleteResult = validateExecutionPreconditions({
        plan: deletePlan,
        scan,
        rulesCache: cache,
        workspaceRootPath: scan.rootRealPath,
        activeTransactionRoot: null
      });

      expect(createResult.ok).toBe(false);
      expect(deleteResult.ok).toBe(false);
      if (!createResult.ok) {
        expect(createResult.reasons.some((reason) => reason.includes("Unsupported create"))).toBe(true);
      }
      if (!deleteResult.ok) {
        expect(deleteResult.reasons.some((reason) => reason.includes("Unsupported delete"))).toBe(true);
      }
    });

    it("blocks secret, binary, excluded, and traversal paths", async () => {
      const root = await makeWorkspace();
      await writeFixture(root);
      await writeFile(root, ".env", "TOKEN=secret\n");
      await writeFile(root, "src/logo.png", Buffer.from([0, 1, 2]));
      await writeFile(root, "dist/bundle.js", "generated\n");
      const scan = await scanWorkspace(root);
      const cache = await buildProjectRulesCache(scan);

      const secretPlan = basePlan({
        executionOrder: [
          { order: 1, title: "Secrets", purpose: "bad", affectedFiles: [".env"], risk: "high" }
        ]
      });
      const binaryPlan = basePlan({
        executionOrder: [
          { order: 1, title: "Binary", purpose: "bad", affectedFiles: ["src/logo.png"], risk: "high" }
        ]
      });
      const traversalPlan = basePlan({
        executionOrder: [
          { order: 1, title: "Traversal", purpose: "bad", affectedFiles: ["../outside.ts"], risk: "high" }
        ]
      });
      const excludedPlan = basePlan({
        goal: "Touch generated output",
        summary: "Update dist/bundle.js after build.",
        executionOrder: [
          { order: 1, title: "Generated", purpose: "bad", affectedFiles: ["dist/bundle.js"], risk: "high" }
        ],
        affectedFiles: [
          {
            relativePath: "dist/bundle.js",
            certainty: "confirmed",
            role: "generated",
            reason: "generated bundle",
            evidenceSourceIds: []
          }
        ]
      });

      for (const plan of [secretPlan, binaryPlan, traversalPlan, excludedPlan]) {
        const result = validateExecutionPreconditions({
          plan,
          scan,
          rulesCache: cache,
          workspaceRootPath: scan.rootRealPath,
          activeTransactionRoot: null
        });
        expect(result.ok).toBe(false);
      }

      const secretResult = validateExecutionPreconditions({
        plan: secretPlan,
        scan,
        rulesCache: cache,
        workspaceRootPath: scan.rootRealPath,
        activeTransactionRoot: null
      });
      const binaryResult = validateExecutionPreconditions({
        plan: binaryPlan,
        scan,
        rulesCache: cache,
        workspaceRootPath: scan.rootRealPath,
        activeTransactionRoot: null
      });
      const traversalResult = validateExecutionPreconditions({
        plan: traversalPlan,
        scan,
        rulesCache: cache,
        workspaceRootPath: scan.rootRealPath,
        activeTransactionRoot: null
      });
      const excludedResult = validateExecutionPreconditions({
        plan: excludedPlan,
        scan,
        rulesCache: cache,
        workspaceRootPath: scan.rootRealPath,
        activeTransactionRoot: null
      });

      if (!secretResult.ok) {
        expect(secretResult.reasons.some((reason) => reason.includes("Secret path"))).toBe(true);
      }
      if (!binaryResult.ok) {
        expect(binaryResult.reasons.some((reason) => reason.includes("binary"))).toBe(true);
      }
      if (!traversalResult.ok) {
        expect(traversalResult.reasons.some((reason) => reason.includes("traversal"))).toBe(true);
      }
      if (!excludedResult.ok) {
        expect(
          excludedResult.reasons.some(
            (reason) => reason.includes("Unsupported create") || reason.includes("Excluded")
          )
        ).toBe(true);
      }
    });

    it("blocks material unresolved project rule conflicts", async () => {
      const root = await makeWorkspace();
      await writeFixture(root);
      await writeFile(root, "AGENTS.md", "- Use Jest.\n- Use Vitest.\n");
      const scan = await scanWorkspace(root);
      const cache = await buildProjectRulesCache(scan);
      const conflict: ProjectRuleConflict = {
        conflictId: "conflict-root",
        scopePath: ".",
        category: "testing",
        ruleIds: ["rule-a", "rule-b"],
        summary: "Conflicting test runners",
        resolution: "needs-user-decision"
      };
      const plan = basePlan({ ruleConflicts: [conflict] });

      const result = validateExecutionPreconditions({
        plan,
        scan,
        rulesCache: cache,
        workspaceRootPath: scan.rootRealPath,
        activeTransactionRoot: null
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reasons.some((reason) => reason.includes("Material unresolved project rule conflicts"))).toBe(true);
        expect(result.reasons.some((reason) => reason.includes("conflict-root"))).toBe(true);
      }
    });
  });

  describe("prepareExecutionTransaction", () => {
    it("writes nothing to disk while preparing a transaction", async () => {
      const root = await makeWorkspace();
      await writeFixture(root);
      const beforeHash = await hashTree(root);
      const scan = await scanWorkspace(root);
      const cache = await buildProjectRulesCache(scan);
      const plan = basePlan({
        executionOrder: [
          {
            order: 1,
            title: "Update main",
            purpose: "Change label",
            affectedFiles: ["src/main.ts"],
            risk: "low"
          },
          {
            order: 2,
            title: "Update util",
            purpose: "Change helper",
            affectedFiles: ["src/util.ts"],
            risk: "low"
          }
        ]
      });

      await prepareExecutionTransaction(plan, scan, cache, root);
      const afterHash = await hashTree(root);

      expect(afterHash).toBe(beforeHash);
    });
  });

  describe("flattenPlanExecutionSteps", () => {
    it("preserves plan step order and per-step file order", () => {
      const plan = basePlan({
        executionOrder: [
          {
            order: 1,
            title: "Manifests",
            purpose: "Review configuration",
            affectedFiles: ["package.json", "README.md"],
            risk: "low"
          },
          {
            order: 2,
            title: "Implementation",
            purpose: "Update code",
            affectedFiles: ["src/main.ts"],
            risk: "medium"
          }
        ]
      });

      const flattened = flattenPlanExecutionSteps(plan);

      expect(flattened.map((step) => step.relativePath)).toEqual(["package.json", "README.md", "src/main.ts"]);
      expect(flattened.map((step) => step.planStepId)).toEqual(["1:0", "1:1", "2:0"]);
      expect(flattened.map((step) => step.stepIndex)).toEqual([0, 1, 2]);
      expect(flattened[0].planStepTitle).toBe("Manifests");
      expect(flattened[2].planStepTitle).toBe("Implementation");
    });
  });

  describe("rejectStepProposal", () => {
    it("leaves the on-disk file unchanged when rejecting a proposal", async () => {
      const { root, scan, cache, plan, transaction } = await prepareFixture();
      const step = transaction.steps[0];
      const before = await fs.readFile(path.join(root, step.relativePath), "utf8");

      attachProposal({
        transaction,
        plan,
        scan,
        cache,
        proposedContent: "export const label = 'Proposed';\n"
      });
      rejectStepProposal(transaction);

      const after = await fs.readFile(path.join(root, step.relativePath), "utf8");
      expect(after).toBe(before);
      expect(step.proposal).toBeUndefined();
      expect(step.status).toBe("pending");
      expect(transaction.status).toBe("prepared");
    });
  });

  describe("applyStep", () => {
    it("requires a proposal before applying", async () => {
      const { transaction } = await prepareFixture();
      await expect(applyStep(transaction)).rejects.toThrow(/no proposal/i);
    });

    it("leaves the target file unchanged while generated code is only proposed", async () => {
      const { root, scan, cache, plan, transaction } = await prepareFixture();
      const step = transaction.steps[0];
      const before = await fs.readFile(path.join(root, step.relativePath), "utf8");

      attachProposal({
        transaction,
        plan,
        scan,
        cache,
        proposedContent: "export const label = 'Proposed';\n"
      });

      expect(await fs.readFile(path.join(root, step.relativePath), "utf8")).toBe(before);
      expect(step.status).toBe("proposed");
      expect(step.proposal?.proposedContent).toBe("export const label = 'Proposed';\n");
    });

    it("checks base hash and rejects stale files before writing", async () => {
      const { root, scan, cache, plan, transaction } = await prepareFixture();
      const step = transaction.steps[0];
      attachProposal({
        transaction,
        plan,
        scan,
        cache,
        proposedContent: "export const label = 'New';\n"
      });

      await fs.writeFile(path.join(root, step.relativePath), "export const label = 'External';\n", "utf8");
      await expect(applyStep(transaction)).rejects.toThrow(/changed/i);
      expect(step.status).toBe("failed");
      expect(transaction.status).toBe("failed");
    });

    it("applies atomically and verifies the post-write hash", async () => {
      const { root, scan, cache, plan, transaction } = await prepareFixture();
      const step = transaction.steps[0];
      const proposed = "export const label = 'Applied';\n";
      attachProposal({ transaction, plan, scan, cache, proposedContent: proposed });

      const applied = await applyStep(transaction);
      const onDisk = await fs.readFile(path.join(root, step.relativePath), "utf8");

      expect(applied.content).toBe(proposed);
      expect(onDisk).toBe(proposed);
      expect(hashContent(onDisk)).toBe(step.proposal?.proposedHash);
      expect(step.status).toBe("applied");
    });

    it("prevents duplicate in-flight apply operations", async () => {
      const { root, scan, cache, plan, transaction } = await prepareFixture();
      const step = transaction.steps[0];
      const proposed = "export const label = 'Applied once';\n";
      attachProposal({ transaction, plan, scan, cache, proposedContent: proposed });

      const firstApply = applyStep(transaction);
      await expect(applyStep(transaction)).rejects.toThrow(/already in progress/i);
      await firstApply;

      expect(await fs.readFile(path.join(root, step.relativePath), "utf8")).toBe(proposed);
    });
  });

  describe("rollbackTransaction", () => {
    it("restores applied steps in reverse order with exact original content", async () => {
      const root = await makeWorkspace();
      await writeFixture(root);
      const scan = await scanWorkspace(root);
      const cache = await buildProjectRulesCache(scan);
      const plan = basePlan({
        executionOrder: [
          {
            order: 1,
            title: "Update main",
            purpose: "First file",
            affectedFiles: ["src/main.ts"],
            risk: "low"
          },
          {
            order: 2,
            title: "Update util",
            purpose: "Second file",
            affectedFiles: ["src/util.ts"],
            risk: "low"
          }
        ]
      });
      const { transaction } = await prepareExecutionTransaction(plan, scan, cache, root);
      const mainOriginal = transaction.steps[0].originalContent;
      const utilOriginal = transaction.steps[1].originalContent;

      attachProposal({
        transaction,
        plan,
        scan,
        cache,
        proposedContent: "export const label = 'Applied-main';\n",
        stepIndex: 0
      });
      await applyStep(transaction, 0);

      attachProposal({
        transaction,
        plan,
        scan,
        cache,
        proposedContent: "export const helper = 'applied';\n",
        stepIndex: 1
      });
      await applyStep(transaction, 1);

      const restored = await rollbackTransaction(transaction);

      expect(restored).toEqual(["src/util.ts", "src/main.ts"]);
      expect(await fs.readFile(path.join(root, "src/main.ts"), "utf8")).toBe(mainOriginal);
      expect(await fs.readFile(path.join(root, "src/util.ts"), "utf8")).toBe(utilOriginal);
      expect(transaction.status).toBe("rolled-back");
      expect(transaction.steps.every((step) => step.status === "pending")).toBe(true);
    });

    it("refuses rollback when on-disk content changed after apply", async () => {
      const { root, scan, cache, plan, transaction } = await prepareFixture();
      attachProposal({
        transaction,
        plan,
        scan,
        cache,
        proposedContent: "export const label = 'Applied';\n"
      });
      await applyStep(transaction);
      await fs.writeFile(path.join(root, "src/main.ts"), "export const label = 'Tampered';\n", "utf8");

      await expect(rollbackTransaction(transaction)).rejects.toThrow(/changed after apply/i);
    });
  });

  describe("keepTransaction", () => {
    it("clears rollback content for applied steps", async () => {
      const { root, scan, cache, plan, transaction } = await prepareFixture();
      attachProposal({
        transaction,
        plan,
        scan,
        cache,
        proposedContent: "export const label = 'Kept';\n"
      });
      await applyStep(transaction);
      keepTransaction(transaction);

      expect(transaction.steps[0].originalContent).toBe("");
      expect(transaction.steps[0].proposal).toBeUndefined();
      expect(transaction.status).toBe("kept");
      expect(await fs.readFile(path.join(root, "src/main.ts"), "utf8")).toBe("export const label = 'Kept';\n");
      await expect(rollbackTransaction(transaction)).rejects.toThrow();
    });
  });

  describe("buildAggregateReview", () => {
    it("generates local diffs for applied steps without running validation commands", async () => {
      const { scan, cache, plan, transaction } = await prepareFixture();
      const original = transaction.steps[0].originalContent;
      const proposed = "export const label = 'Reviewed';\n";

      attachProposal({ transaction, plan, scan, cache, proposedContent: proposed });
      await applyStep(transaction);

      const review = buildAggregateReview(transaction);

      expect(review.files).toHaveLength(1);
      expect(review.files[0].relativePath).toBe("src/main.ts");
      expect(review.files[0].addedLineCount).toBeGreaterThan(0);
      expect(review.files[0].removedLineCount).toBeGreaterThan(0);
      expect(review.files[0].diff.some((line) => line.type === "added" && line.content.includes("Reviewed"))).toBe(true);
      expect(review.files[0].diff.some((line) => line.type === "removed" && line.content.includes(original.trim()))).toBe(
        true
      );
      expect(review.totalAdded).toBe(review.files[0].addedLineCount);
      expect(review.totalRemoved).toBe(review.files[0].removedLineCount);
      expect(review.validationCommands).toEqual(["npm test"]);
      expect(review.commandsNotRun).toBe(true);
    });
  });

  describe("createExecutionProposalFromModelOutput", () => {
    it("rejects mismatched transaction, plan step, and target source IDs", async () => {
      const { scan, cache, plan, transaction } = await prepareFixture();
      const step = transaction.steps[0];
      const proposed = "export const label = 'Model';\n";

      expect(() =>
        createExecutionProposalFromModelOutput({
          transaction,
          plan,
          scan,
          rulesCache: cache,
          modelContent: modelOutputJson({
            transaction,
            step,
            proposedContent: proposed,
            overrides: { transactionId: "wrong-transaction" }
          }),
          modelMs: 2
        })
      ).toThrow(/transaction ID/i);

      expect(() =>
        createExecutionProposalFromModelOutput({
          transaction,
          plan,
          scan,
          rulesCache: cache,
          modelContent: modelOutputJson({
            transaction,
            step,
            proposedContent: proposed,
            overrides: { planStepId: "9:9" }
          }),
          modelMs: 2
        })
      ).toThrow(/plan step ID/i);

      expect(() =>
        createExecutionProposalFromModelOutput({
          transaction,
          plan,
          scan,
          rulesCache: cache,
          modelContent: modelOutputJson({
            transaction,
            step,
            proposedContent: proposed,
            overrides: { targetSourceId: "EX99" }
          }),
          modelMs: 2
        })
      ).toThrow(/target source/i);
    });
  });

  describe("cancelTransaction", () => {
    it("sets abortGeneration on the active transaction", async () => {
      const { transaction } = await prepareFixture();
      expect(transaction.abortGeneration).toBe(false);

      cancelTransaction(transaction);

      expect(transaction.abortGeneration).toBe(true);
      expect(transaction.status).toBe("cancelled");
    });

    it("leaves workspace files unchanged when cancelling a proposed step review", async () => {
      const { root, scan, cache, plan, transaction } = await prepareFixture();
      const beforeHash = await hashTree(root);

      attachProposal({
        transaction,
        plan,
        scan,
        cache,
        proposedContent: "export const label = 'Cancelled';\n"
      });
      cancelTransaction(transaction);

      expect(await hashTree(root)).toBe(beforeHash);
      expect(transaction.status).toBe("cancelled");
      expect(transaction.steps[0].status).toBe("proposed");
      expect(transaction.steps[0].proposal).toBeDefined();
    });

    it("builds aggregate review when cancelling with applied steps", async () => {
      const { root, scan, cache, plan, transaction } = await prepareFixture({
        plan: basePlan({
          executionOrder: [
            {
              order: 1,
              title: "First file",
              purpose: "Update main",
              affectedFiles: ["src/main.ts"],
              risk: "low"
            },
            {
              order: 2,
              title: "Second file",
              purpose: "Update util",
              affectedFiles: ["src/util.ts"],
              risk: "low"
            }
          ]
        })
      });
      attachProposal({
        transaction,
        plan,
        scan,
        cache,
        proposedContent: "export const label = 'Applied';\n"
      });
      await applyStep(transaction);
      cancelTransaction(transaction);
      expect(transaction.status).toBe("cancelled");
      expect(transaction.aggregateReview?.files).toHaveLength(1);
    });
  });

  describe("rule snapshot staleness", () => {
    it("pauses execution when project guidance changes after preparation", async () => {
      const { root, scan, cache, plan, transaction } = await prepareFixture();
      const originalFingerprint = computeRuleSnapshotFingerprint(scan, cache);
      expect(transaction.projectRuleSnapshotHash).toBe(originalFingerprint);

      await fs.writeFile(path.join(root, "AGENTS.md"), "# Changed guidance\nUse Vitest.\n", "utf8");
      const refreshedScan = await scanWorkspace(root);
      const refreshedCache = await buildProjectRulesCache(refreshedScan);

      attachProposal({
        transaction,
        plan,
        scan: refreshedScan,
        cache: refreshedCache,
        proposedContent: "export const label = 'Proposed';\n"
      });

      expect(() => assertRuleSnapshotFresh(transaction, refreshedScan, refreshedCache)).toThrow(/stale/i);
      expect(transaction.status).toBe("paused");
    });
  });

  describe("registerExecutionTransaction", () => {
    it("allows only one active transaction across workspace roots", async () => {
      const first = await prepareFixture();
      const second = await prepareFixture();
      const registry = new Map<string, InternalExecutionTransaction>();
      const firstRoot = first.transaction.workspaceRootRealPath;
      const secondRoot = second.transaction.workspaceRootRealPath;

      expect(firstRoot).toBe(first.scan.rootRealPath);
      expect(secondRoot).toBe(second.scan.rootRealPath);
      expect(firstRoot).not.toBe(secondRoot);

      registerExecutionTransaction(registry, first.transaction);
      expect(getActiveTransactionForRoot(registry, firstRoot)).toBe(first.transaction);

      expect(() => registerExecutionTransaction(registry, second.transaction)).toThrow(/already active/i);

      unregisterExecutionTransaction(registry, firstRoot);
      expect(getActiveTransactionForRoot(registry, firstRoot)).toBeUndefined();

      registerExecutionTransaction(registry, second.transaction);
      expect(getActiveTransactionForRoot(registry, secondRoot)).toBe(second.transaction);
    });
  });
});
