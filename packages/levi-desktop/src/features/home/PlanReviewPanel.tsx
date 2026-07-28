import { useState } from "react";
import type { ExecutionPlan } from "../../types/levi-api";
import { formatPlanForClipboard, type PlanActionNotice } from "./plan-format";

type PlanReviewPanelProps = {
  plan: ExecutionPlan;
  notice: PlanActionNotice | null;
  approveDisabled?: boolean;
  approveTitle?: string;
  onApprove: () => Promise<void>;
  onRefine: () => void;
  onAskQuestion: () => void;
};

export function PlanReviewPanel({ plan, notice, approveDisabled = false, approveTitle, onApprove, onRefine, onAskQuestion }: PlanReviewPanelProps) {
  const [copyLabel, setCopyLabel] = useState("Copy Plan");

  async function copyPlan() {
    await navigator.clipboard?.writeText(formatPlanForClipboard(plan));
    setCopyLabel("Copied");
    window.setTimeout(() => setCopyLabel("Copy Plan"), 1600);
  }

  return (
    <section className="levi-plan-review" aria-label="Execution plan review">
      <div className="levi-plan-header">
        <div>
          <div className="levi-plan-kicker">Read-only execution plan</div>
          <h2>{plan.goal}</h2>
          <p>{plan.summary}</p>
        </div>
        <div className="levi-plan-confidence">
          <span>{plan.confidence}</span>
          <strong>{plan.estimatedComplexity}</strong>
        </div>
      </div>

      <div className="levi-plan-stats" aria-label="Estimated work">
        <div>
          <span>Files</span>
          <strong>{plan.estimatedFiles}</strong>
        </div>
        <div>
          <span>Steps</span>
          <strong>{plan.estimatedSteps}</strong>
        </div>
        <div>
          <span>Model</span>
          <strong>Planning</strong>
        </div>
      </div>

      <div className="levi-plan-section">
        <h3>Affected Files</h3>
        <div className="levi-plan-files">
          {plan.affectedFiles.map((file) => (
            <div key={file.relativePath} className="levi-plan-file">
              <div>
                <strong>{file.relativePath}</strong>
                <span>{file.role}</span>
              </div>
              <em>{file.certainty === "confirmed" ? "Confirmed" : "Possible"}</em>
            </div>
          ))}
        </div>
      </div>

      <div className="levi-plan-section">
        <h3>Execution Timeline</h3>
        <ol className="levi-plan-steps">
          {plan.executionOrder.map((step) => (
            <li key={step.order}>
              <div>
                <strong>{step.title}</strong>
                <span>{step.purpose}</span>
                <small>{step.affectedFiles.join(", ")}</small>
              </div>
              <em>{step.risk} risk</em>
            </li>
          ))}
        </ol>
      </div>

      <div className="levi-plan-grid">
        <div className="levi-plan-section">
          <h3>Risks</h3>
          {plan.risks.map((risk) => (
            <p key={risk}>{risk}</p>
          ))}
        </div>
        <div className="levi-plan-section">
          <h3>Assumptions</h3>
          {plan.assumptions.map((assumption) => (
            <p key={assumption}>{assumption}</p>
          ))}
        </div>
      </div>

      {plan.openQuestions.length ? (
        <div className="levi-plan-section">
          <h3>Open Questions</h3>
          {plan.openQuestions.map((question) => (
            <p key={question}>{question}</p>
          ))}
        </div>
      ) : null}

      {plan.blockedItems.length ? (
        <div className="levi-plan-section levi-plan-blocked">
          <h3>Blocked Items</h3>
          {plan.blockedItems.map((item) => (
            <p key={item}>{item}</p>
          ))}
        </div>
      ) : null}

      {plan.validationCommands.length ? (
        <div className="levi-plan-section">
          <h3>Recommended Validation</h3>
          <div className="levi-plan-commands">
            {plan.validationCommands.map((command) => (
              <code key={command}>{command}</code>
            ))}
          </div>
        </div>
      ) : null}

      {plan.applicableProjectRules.length ? (
        <div className="levi-plan-section">
          <h3>Applicable Project Rules</h3>
          <div className="levi-plan-rules">
            {plan.applicableProjectRules.map((rule) => (
              <div key={rule.ruleId} className="levi-plan-rule">
                <strong>{rule.text}</strong>
                <span>
                  {rule.sourcePath}:{rule.lineStart}-{rule.lineEnd} · scope {rule.scopePath}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {plan.designConstraints.length ? (
        <div className="levi-plan-section">
          <h3>Design Constraints</h3>
          {plan.designConstraints.map((constraint) => (
            <p key={constraint}>{constraint}</p>
          ))}
        </div>
      ) : null}

      {plan.ruleConflicts.length ? (
        <div className="levi-plan-section levi-plan-blocked">
          <h3>Rule Conflicts</h3>
          {plan.ruleConflicts.map((conflict) => (
            <p key={conflict.conflictId}>{conflict.summary}</p>
          ))}
        </div>
      ) : null}

      {plan.ruleSources.length ? (
        <div className="levi-plan-section">
          <h3>Rule Sources</h3>
          <div className="levi-plan-commands">
            {plan.ruleSources.map((source) => (
              <code key={source.sourceId}>{source.relativePath} · scope {source.scopePath}</code>
            ))}
          </div>
        </div>
      ) : null}

      <div className="levi-plan-next">{plan.suggestedNextAction}</div>
      {notice ? <div className="levi-plan-notice">{notice.message}</div> : null}

      <div className="levi-plan-actions">
        <button type="button" className="levi-secondary-button" onClick={onRefine}>
          Refine Plan
        </button>
        <button type="button" className="levi-secondary-button" onClick={onAskQuestion}>
          Ask Question
        </button>
        <button type="button" className="levi-secondary-button" onClick={() => void copyPlan()}>
          {copyLabel}
        </button>
        <button
          type="button"
          className="levi-apply-button"
          disabled={approveDisabled}
          title={approveTitle ?? "Approve this read-only plan to start a controlled execution transaction."}
          onClick={() => void onApprove()}
        >
          Approve
        </button>
      </div>
    </section>
  );
}
