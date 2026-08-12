import type { AgentApprovalAction, AgentSession, AgentVerificationReport } from "../agent";

type BuildPhase = "idle" | "planning" | "ready" | "building" | "verifying" | "completed" | "blocked" | "cancelled";

type BuildReviewPanelProps = {
  session: AgentSession;
  phase: BuildPhase;
  error: string | null;
  verification: AgentVerificationReport | null;
  onApproveBuild: () => Promise<void>;
  onCancel: () => Promise<void>;
  onEditPlan: () => void;
};

function actions(session: AgentSession): AgentApprovalAction[] {
  return session.plan?.approvals ?? [];
}

function filesFor(session: AgentSession, predicate: (action: AgentApprovalAction) => boolean): string[] {
  return Array.from(
    new Set(
      actions(session)
        .filter(predicate)
        .flatMap((action) => [action.relativePath, action.destinationRelativePath, ...(action.affectedFiles ?? [])])
        .filter((value): value is string => Boolean(value))
    )
  );
}

function commandsFor(session: AgentSession): string[] {
  return actions(session)
    .filter((action) => action.type === "run-terminal-command")
    .map((action) => [action.command, ...(action.args ?? [])].filter(Boolean).join(" "))
    .filter(Boolean);
}

function estimatedRisk(session: AgentSession): "low" | "medium" | "high" {
  const planActions = actions(session);
  if (planActions.some((action) => action.type === "delete-file" || action.type === "git-operation")) {
    return "high";
  }
  if (planActions.some((action) => action.type === "modify-file" || action.type === "rename-file" || action.type === "rename-folder" || action.type === "run-terminal-command")) {
    return "medium";
  }
  return "low";
}

function phaseLabel(phase: BuildPhase): string {
  if (phase === "planning") return "Planning build";
  if (phase === "ready") return "Ready for approval";
  if (phase === "building") return "Building";
  if (phase === "verifying") return "Running verification";
  if (phase === "completed") return "Completed";
  if (phase === "blocked") return "Blocked";
  if (phase === "cancelled") return "Cancelled";
  return "Understanding request";
}

export function BuildReviewPanel({ session, phase, error, verification, onApproveBuild, onCancel, onEditPlan }: BuildReviewPanelProps) {
  const created = filesFor(session, (action) => action.type === "create-file" || action.type === "create-folder");
  const modified = filesFor(session, (action) => action.type === "modify-file" || action.type === "rename-file" || action.type === "rename-folder");
  const deleted = filesFor(session, (action) => action.type === "delete-file");
  const commands = commandsFor(session);
  const plan = session.plan;
  const canApprove = phase === "ready" && Boolean(plan?.approvals.length);

  return (
    <section className="levi-plan-review levi-build-review" aria-label="Build approval review">
      <div className="levi-plan-header">
        <div>
          <div className="levi-plan-kicker">{phaseLabel(phase)}</div>
          <h2>{plan?.objective ?? session.title}</h2>
          <p>{plan?.summary ?? "Levi is preparing a controlled build plan."}</p>
        </div>
        <div className="levi-plan-confidence">
          <span>{estimatedRisk(session)}</span>
          <strong>{phaseLabel(phase)}</strong>
        </div>
      </div>

      <div className="levi-plan-stats" aria-label="Build review summary">
        <div>
          <span>Actions</span>
          <strong>{plan?.approvals.length ?? 0}</strong>
        </div>
        <div>
          <span>Files</span>
          <strong>{new Set([...created, ...modified, ...deleted]).size}</strong>
        </div>
        <div>
          <span>Risk</span>
          <strong>{estimatedRisk(session)}</strong>
        </div>
      </div>

      <div className="levi-plan-grid">
        <div className="levi-plan-section">
          <h3>Created</h3>
          {created.length ? created.map((file) => <code key={file}>{file}</code>) : <p>None listed.</p>}
        </div>
        <div className="levi-plan-section">
          <h3>Modified</h3>
          {modified.length ? modified.map((file) => <code key={file}>{file}</code>) : <p>None listed.</p>}
        </div>
      </div>

      {deleted.length ? (
        <div className="levi-plan-section levi-plan-blocked">
          <h3>Deletes Require Separate Approval</h3>
          {deleted.map((file) => <code key={file}>{file}</code>)}
        </div>
      ) : null}

      <div className="levi-plan-section">
        <h3>Commands Expected</h3>
        {commands.length ? commands.map((command) => <code key={command}>{command}</code>) : <p>No commands listed.</p>}
      </div>

      <div className="levi-plan-section">
        <h3>Workspace Root</h3>
        <code>{session.projectSummary?.rootPath ?? "Current workspace"}</code>
      </div>

      {verification ? (
        <div className={verification.status === "Succeeded" ? "levi-plan-section" : "levi-plan-section levi-plan-blocked"}>
          <h3>Verification</h3>
          <p>{verification.status}: {verification.summary}</p>
        </div>
      ) : null}

      {error ? <div className="levi-plan-notice">{error}</div> : null}

      <div className="levi-plan-actions">
        <button type="button" className="levi-secondary-button" disabled={phase === "building" || phase === "verifying"} onClick={onEditPlan}>
          Edit Plan
        </button>
        <button type="button" className="levi-secondary-button" disabled={phase === "building" || phase === "verifying"} onClick={() => void onCancel()}>
          Cancel
        </button>
        <button type="button" className="levi-apply-button" disabled={!canApprove} onClick={() => void onApproveBuild()}>
          {phase === "building" || phase === "verifying" ? "Building..." : "Approve and Build"}
        </button>
      </div>
    </section>
  );
}

export type { BuildPhase };
