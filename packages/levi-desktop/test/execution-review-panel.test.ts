import fs from "node:fs";
import path from "node:path";
import { act, createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ExecutionReviewPanel } from "../src/features/home/ExecutionReviewPanel";
import type { ExecutionPlan, ExecutionPublicProposal, ExecutionPublicTransaction } from "../src/types/levi-api";

const packageRoot = path.resolve(__dirname, "..");

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(packageRoot, relativePath), "utf8");
}

function testPlan(): ExecutionPlan {
  return {
    planId: "plan-1",
    requestId: "request-1",
    goal: "Update implementation",
    summary: "Update the target file.",
    confidence: "high",
    estimatedComplexity: "Low",
    estimatedFiles: 1,
    estimatedSteps: 1,
    affectedFiles: [
      {
        relativePath: "src/main.ts",
        certainty: "confirmed",
        role: "implementation",
        reason: "test fixture",
        evidenceSourceIds: []
      }
    ],
    executionOrder: [
      {
        order: 1,
        title: "Update implementation",
        purpose: "Apply generated code after review.",
        affectedFiles: ["src/main.ts"],
        risk: "low"
      }
    ],
    dependencies: [],
    validationCommands: ["npm test"],
    risks: [],
    assumptions: [],
    openQuestions: [],
    blockedItems: [],
    suggestedNextAction: "Review generated code.",
    applicableProjectRules: [],
    designConstraints: [],
    ruleConflicts: [],
    ruleSources: [],
    timings: { retrievalMs: 1, modelMs: 2, totalMs: 3 }
  };
}

function testProposal(): ExecutionPublicProposal {
  return {
    proposalId: "proposal-1",
    transactionId: "tx-1",
    planStepId: "1:0",
    stepIndex: 0,
    relativePath: "src/main.ts",
    summary: "Update label export",
    assumptions: [],
    warnings: [],
    suggestedValidationCommands: ["npm test"],
    confidence: "high",
    addedLineCount: 1,
    removedLineCount: 1,
    diff: [
      { type: "removed", oldLineNumber: 1, content: "export const label = 'Old';" },
      { type: "added", newLineNumber: 1, content: "export const label = 'New';" }
    ],
    appliedProjectRules: [],
    ruleConflicts: [],
    timings: { modelMs: 1, diffMs: 1, totalMs: 2 }
  };
}

function testTransaction(): ExecutionPublicTransaction {
  return {
    transactionId: "tx-1",
    planId: "plan-1",
    goal: "Update implementation",
    workspaceRootPath: "C:\\Users\\LeviUser\\Project",
    scanTimestamp: "2026-07-29T00:00:00.000Z",
    status: "step-proposed",
    steps: [
      {
        stepIndex: 0,
        planStepId: "1:0",
        planStepOrder: 1,
        planStepTitle: "Update implementation",
        relativePath: "src/main.ts",
        status: "proposed",
        proposal: testProposal()
      }
    ],
    currentStepIndex: 0,
    appliedProjectRules: [],
    ruleConflicts: [],
    unsupportedOperations: { creates: [], deletes: [] },
    validationCommands: ["npm test"],
    createdAt: "2026-07-29T00:00:00.000Z",
    totals: { stepCount: 1, appliedCount: 0, pendingCount: 1 }
  };
}

function renderReview(overrides: Partial<{
  onApplyStep: () => Promise<void>;
  onCancel: () => Promise<void>;
}> = {}) {
  const props = {
    transaction: testTransaction(),
    plan: testPlan(),
    error: null,
    onApplyStep: vi.fn(async () => undefined),
    onRejectStep: vi.fn(async () => undefined),
    onRegenerateStep: vi.fn(async () => undefined),
    onCancel: vi.fn(async () => undefined),
    onKeep: vi.fn(async () => undefined),
    onRollback: vi.fn(async () => undefined),
    onProposeStep: vi.fn(async () => undefined),
    ...overrides
  };
  render(createElement(ExecutionReviewPanel, props));
  return props;
}

describe("ExecutionReviewPanel live regression guards", () => {
  it("does not treat step-applied mid-transaction as final aggregate review", () => {
    const source = readSource("src/features/home/ExecutionReviewPanel.tsx");
    expect(source).toMatch(/const allStepsComplete = transaction\.status === "completed"/);
    expect(source).not.toMatch(/transaction\.status === "completed" \|\| transaction\.status === "step-applied"/);
  });

  it("offers keep and rollback when a cancelled transaction has applied steps", () => {
    const source = readSource("src/features/home/ExecutionReviewPanel.tsx");
    expect(source).toMatch(/stoppedWithApplied/);
    expect(source).toMatch(/transaction\.status === "cancelled"/);
  });

  it("displays generated code diff for review without applying", () => {
    const { onApplyStep } = renderReview();

    expect(screen.getByRole("table", { name: "Step diff" })).toBeInTheDocument();
    expect(screen.getByText("export const label = 'Old';")).toBeInTheDocument();
    expect(screen.getByText("export const label = 'New';")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply Code" })).toBeInTheDocument();
    expect(onApplyStep).not.toHaveBeenCalled();
  });

  it("cancels review without applying code", async () => {
    const user = userEvent.setup();
    const onApplyStep = vi.fn(async () => undefined);
    const onCancel = vi.fn(async () => undefined);
    renderReview({ onApplyStep, onCancel });

    await user.click(screen.getByRole("button", { name: "Cancel Transaction" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onApplyStep).not.toHaveBeenCalled();
  });

  it("applies generated code only after explicit Apply Code", async () => {
    const user = userEvent.setup();
    const onApplyStep = vi.fn(async () => undefined);
    renderReview({ onApplyStep });

    expect(onApplyStep).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Apply Code" }));

    expect(onApplyStep).toHaveBeenCalledTimes(1);
  });

  it("prevents duplicate Apply Code operations", async () => {
    let finishApply: () => void = () => undefined;
    const onApplyStep = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishApply = () => resolve();
        })
    );
    renderReview({ onApplyStep });

    const applyButton = screen.getByRole("button", { name: "Apply Code" });
    fireEvent.click(applyButton);
    fireEvent.click(applyButton);

    expect(onApplyStep).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishApply();
    });
  });
});
