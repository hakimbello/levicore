import { useState } from "react";
import type { EditProposal } from "../../types/levi-api";

type EditReviewPanelProps = {
  proposal: EditProposal;
  error: string | null;
  onApply: () => Promise<void>;
  onReject: () => Promise<void>;
  onRegenerate: () => Promise<void>;
};

export function EditReviewPanel({ proposal, error, onApply, onReject, onRegenerate }: EditReviewPanelProps) {
  const [busy, setBusy] = useState<"apply" | "reject" | null>(null);

  async function run(action: "apply" | "reject") {
    setBusy(action);
    try {
      await (action === "apply" ? onApply() : onReject());
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="levi-edit-review" aria-label="Edit proposal review">
      <div className="levi-edit-review-header">
        <div>
          <div className="levi-edit-kicker">Unapplied diff preview</div>
          <h2>{proposal.relativePath}</h2>
          <p>{proposal.summary}</p>
        </div>
        <div className="levi-edit-counts" aria-label="Diff line counts">
          <span>+{proposal.addedLineCount}</span>
          <span>-{proposal.removedLineCount}</span>
        </div>
      </div>

      <div className="levi-edit-meta">
        <div>Confidence: {proposal.confidence}</div>
        <div>
          Timings: retrieval {proposal.timings.retrievalMs}ms, model {proposal.timings.modelMs}ms, diff {proposal.timings.diffMs}ms
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

      {proposal.suggestedValidationCommands.length ? (
        <div className="levi-edit-note">
          <strong>Suggested validation</strong>
          {proposal.suggestedValidationCommands.map((command) => (
            <code key={command}>{command}</code>
          ))}
        </div>
      ) : null}

      {proposal.appliedProjectRules.length ? (
        <div className="levi-edit-note levi-rule-note">
          <strong>Project rules applied</strong>
          {proposal.appliedProjectRules.map((rule) => (
            <div key={rule.ruleId}>
              {rule.text} <span>{rule.sourcePath}:{rule.lineStart}-{rule.lineEnd}</span>
            </div>
          ))}
        </div>
      ) : null}

      {proposal.ruleConflicts.length ? (
        <div className="levi-edit-note levi-rule-conflict-note">
          <strong>Rule conflicts</strong>
          {proposal.ruleConflicts.map((conflict) => (
            <div key={conflict.conflictId}>{conflict.summary}</div>
          ))}
        </div>
      ) : null}

      {error ? <div className="levi-edit-error">{error}</div> : null}

      <div className="levi-diff" role="table" aria-label="Local diff">
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
          Reject
        </button>
        {error ? (
          <button type="button" className="levi-secondary-button" disabled={busy !== null} onClick={() => void onRegenerate()}>
            Regenerate
          </button>
        ) : null}
        <button type="button" className="levi-apply-button" disabled={busy !== null || proposal.status === "stale"} onClick={() => void run("apply")}>
          {busy === "apply" ? "Applying..." : "Apply"}
        </button>
      </div>
    </section>
  );
}
