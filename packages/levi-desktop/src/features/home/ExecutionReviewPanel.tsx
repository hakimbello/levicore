import { useState } from "react";
import type { ExecutionPlan, ExecutionPublicProposal, ExecutionPublicTransaction } from "../../types/levi-api";

type ExecutionReviewPanelProps = {
  transaction: ExecutionPublicTransaction;
  plan: ExecutionPlan;
  error: string | null;
  onApplyStep: () => Promise<void>;
  onRejectStep: () => Promise<void>;
  onRegenerateStep: () => Promise<void>;
  onCancel: () => Promise<void>;
  onKeep: () => Promise<void>;
  onRollback: () => Promise<void>;
  onProposeStep: () => Promise<void>;
};

function currentProposal(transaction: ExecutionPublicTransaction): ExecutionPublicProposal | undefined {
  return transaction.steps[transaction.currentStepIndex]?.proposal;
}

function currentStep(transaction: ExecutionPublicTransaction) {
  return transaction.steps[transaction.currentStepIndex];
}

export function ExecutionReviewPanel({
  transaction,
  plan,
  error,
  onApplyStep,
  onRejectStep,
  onRegenerateStep,
  onCancel,
  onKeep,
  onRollback,
  onProposeStep
}: ExecutionReviewPanelProps) {
  const [busy, setBusy] = useState<"apply" | "reject" | "keep" | "rollback" | null>(null);
  const step = currentStep(transaction);
  const proposal = currentProposal(transaction);
  const hasAppliedSteps = transaction.totals.appliedCount > 0;
  const allStepsComplete = transaction.status === "completed";
  const stoppedWithApplied =
    hasAppliedSteps && (transaction.status === "cancelled" || transaction.status === "failed" || transaction.status === "paused");
  const isFinalized = transaction.status === "kept" || transaction.status === "rolled-back";
  const showAggregateFinalize = (allStepsComplete || stoppedWithApplied) && !isFinalized;
  const showStepReview = Boolean(proposal) && !showAggregateFinalize && !isFinalized;
  const showPrepare =
    !showAggregateFinalize &&
    !showStepReview &&
    !isFinalized &&
    transaction.status !== "cancelled" &&
    transaction.status !== "failed" &&
    transaction.status !== "paused" &&
    transaction.totals.appliedCount < transaction.totals.stepCount;

  async function run(action: "apply" | "reject" | "keep" | "rollback") {
    setBusy(action);
    try {
      if (action === "apply") {
        await onApplyStep();
      } else if (action === "reject") {
        await onRejectStep();
      } else if (action === "keep") {
        await onKeep();
      } else {
        await onRollback();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="levi-edit-review levi-execution-review" aria-label="Execution transaction review">
      <div className="levi-edit-review-header">
        <div>
          <div className="levi-edit-kicker">Approved multi-file execution</div>
          <h2>{transaction.goal}</h2>
          <p>
            {transaction.totals.appliedCount} of {transaction.totals.stepCount} files applied · status {transaction.status}
          </p>
        </div>
        <div className="levi-edit-counts" aria-label="Execution progress">
          <span>
            {transaction.totals.appliedCount}/{transaction.totals.stepCount}
          </span>
        </div>
      </div>

      {transaction.failureMessage ? <div className="levi-edit-error">{transaction.failureMessage}</div> : null}
      {error ? <div className="levi-edit-error">{error}</div> : null}

      <div className="levi-edit-meta">
        <div>Current step: {step ? `${step.relativePath} — ${step.planStepTitle}` : "None"}</div>
        <div>Step model: qwen2.5-coder:7b</div>
        {transaction.status === "generating" ? <div>Generating step proposal…</div> : null}
      </div>

      {showPrepare ? (
        <div className="levi-edit-note">
          <strong>Ready for step review</strong>
          <div>
            {transaction.totals.appliedCount === 0
              ? "No file has been modified yet. Generate the first step proposal to continue."
              : "Generate the next step proposal to continue."}
          </div>
          <button type="button" className="levi-secondary-button" onClick={() => void onProposeStep()}>
            Generate Step Proposal
          </button>
        </div>
      ) : null}

      {showStepReview && proposal ? (
        <>
          <div className="levi-edit-meta">
            <div>{proposal.summary}</div>
            <div>
              +{proposal.addedLineCount} / -{proposal.removedLineCount}
            </div>
          </div>

          {proposal.assumptions.length ? (
            <div className="levi-edit-note">
              <strong>Assumptions</strong>
              {proposal.assumptions.map((assumption) => (
                <div key={assumption}>{assumption}</div>
              ))}
            </div>
          ) : null}

          {proposal.warnings.length ? (
            <div className="levi-edit-note">
              <strong>Warnings</strong>
              {proposal.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          ) : null}

          {proposal.appliedProjectRules.length ? (
            <div className="levi-edit-note levi-rule-note">
              <strong>Project rules applied</strong>
              {proposal.appliedProjectRules.map((rule) => (
                <div key={rule.ruleId}>
                  {rule.text}{" "}
                  <span>
                    {rule.sourcePath}:{rule.lineStart}-{rule.lineEnd}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="levi-diff" role="table" aria-label="Step diff">
            {proposal.diff.map((line, index) => (
              <div key={`${index}-${line.type}`} className={`levi-diff-line levi-diff-${line.type}`} role="row">
                <span className="levi-diff-num" role="cell">
                  {line.oldLineNumber ?? ""}
                </span>
                <span className="levi-diff-num" role="cell">
                  {line.newLineNumber ?? ""}
                </span>
                <span className="levi-diff-marker" role="cell">
                  {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                </span>
                <code role="cell">{line.content || " "}</code>
              </div>
            ))}
          </div>

          <div className="levi-edit-actions">
            <button type="button" className="levi-secondary-button" disabled={busy !== null} onClick={() => void run("reject")}>
              Reject Step
            </button>
            <button type="button" className="levi-secondary-button" disabled={busy !== null} onClick={() => void onRegenerateStep()}>
              Regenerate
            </button>
            <button type="button" className="levi-secondary-button" disabled={busy !== null} onClick={() => void onCancel()}>
              Cancel Transaction
            </button>
            <button type="button" className="levi-apply-button" disabled={busy !== null} onClick={() => void run("apply")}>
              Apply Step
            </button>
          </div>
        </>
      ) : null}

      {showAggregateFinalize ? (
        <>
          <div className="levi-edit-note">
            <strong>{allStepsComplete ? "Aggregate review" : "Applied changes review"}</strong>
            <div>
              Modified files: {transaction.aggregateReview?.files.map((file) => file.relativePath).join(", ") || "None yet"}
            </div>
            <div>
              Total diff: +{transaction.aggregateReview?.totalAdded ?? 0} / -{transaction.aggregateReview?.totalRemoved ?? 0}
            </div>
          </div>

          {transaction.aggregateReview?.files.map((file) => (
            <div key={file.relativePath} className="levi-edit-note">
              <strong>{file.relativePath}</strong>
              <div>
                +{file.addedLineCount} / -{file.removedLineCount} · validation {file.validationStatus}
              </div>
            </div>
          )) ?? null}

          {(transaction.aggregateReview?.validationCommands.length ?? plan.validationCommands.length) ? (
            <div className="levi-edit-note">
              <strong>Recommended — not run</strong>
              {(transaction.aggregateReview?.validationCommands ?? plan.validationCommands).map((command) => (
                <code key={command}>{command}</code>
              ))}
            </div>
          ) : null}

          <div className="levi-edit-actions">
            <button type="button" className="levi-secondary-button" disabled={busy !== null} onClick={() => void run("rollback")}>
              Roll Back Transaction
            </button>
            <button type="button" className="levi-apply-button" disabled={busy !== null} onClick={() => void run("keep")}>
              Keep Changes
            </button>
          </div>
        </>
      ) : null}

      {isFinalized ? (
        <div className="levi-edit-note">
          <strong>Transaction finalized</strong>
          <div>Status: {transaction.status}</div>
        </div>
      ) : null}
    </section>
  );
}
