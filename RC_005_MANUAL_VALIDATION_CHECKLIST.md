# RC-005 Manual Validation Checklist

Each item must be completed by a human operator. Automated qualification must leave these items `PENDING` until evidence is recorded.

Evidence fields for every item:

- Operator:
- Date/time:
- Workspace or fixture:
- Commands/actions performed:
- Expected result:
- Observed result:
- Screenshot/log/reference:
- Status: PENDING

## Environment

1. Launch VS Code from the repository workspace.
   Expected result: Levi extension activates without initialization errors.

2. Open `Levi: Show Environment`.
   Expected result: Workspace, model, Git, approval, validation, security, reliability, and qualification states are visible and truthful.

3. Run `ollama --version` and `ollama list`.
   Expected result: Levi shows available local models, or an honest local-provider-unavailable state.

## Extension Development Host

1. Run `npm.cmd --prefix packages/vscode-extension run dev`.
   Expected result: Extension Development Host opens with Levi installed from this workspace.

2. Run `Levi: Show Qualification`.
   Expected result: `levi.qualification` opens and shows health, fixtures, journeys, scenarios, report, pending manual checks, and blockers.

3. Run `Levi: Run Qualification Smoke`.
   Expected result: automated smoke qualification completes without critical defects.

4. Run `Levi: Run Qualification Release Candidate`.
   Expected result: automated RC qualification completes as `MANUAL_VERIFICATION_REQUIRED` unless all manual evidence has been recorded.

## Onboarding

1. Run `Levi: Open Onboarding`.
   Expected result: workspace, trust, model, Git, and safe read-only checks are shown without fake success.

2. Select a local model when available.
   Expected result: model selection is reflected in Environment and Copilot state without exposing credentials.

## Conversation

1. Open Levi Copilot.
   Expected result: CSP is active, composer is usable, and state is readable.

2. Ask “What is this project and what should I work on first?”
   Expected result: answer is grounded in project context and does not reveal private reasoning or complete protected source content.

3. Open context details.
   Expected result: context is bounded, sourced, and redacted where needed.

## Product Experience

1. Switch through Ask, Plan, Build, Fix, Review, and Teach modes.
   Expected result: modes change presentation and intent, not authority or approval behavior.

2. Inspect active workflow and timeline.
   Expected result: workflow state, blocked steps, approvals, validation, and evidence are truthful.

3. Inspect multi-agent state.
   Expected result: assignments and findings are bounded and cannot approve one another.

## Source Change Safety

1. Generate a change proposal on a fixture or test workspace.
   Expected result: proposal shows exact files, scope, risks, validation plan, and approval requirement.

2. Reject the approval.
   Expected result: no source mutation occurs.

3. Approve only after reviewing the proposal.
   Expected result: mutation goes through `ControlledWorkspaceToolEngine`.

4. Validate the change.
   Expected result: validation result is shown with commands/evidence and no fake pass.

5. Revert the change when available.
   Expected result: revert path is explicit and bounded.

## Failure Modes

1. Disable or remove local provider availability.
   Expected result: Levi shows provider-unavailable state and preserves offline behavior.

2. Open an untrusted workspace.
   Expected result: protected actions remain blocked or unavailable.

3. Reload the Extension Development Host during an incomplete workflow.
   Expected result: protected work is not auto-resumed; user must explicitly retry.

## Git

1. Open source-control status from Levi.
   Expected result: Git state is truthful. Commit/push are unavailable unless safe approved operations exist.

2. Inspect diff presentation.
   Expected result: diff scope is bounded and does not expose unrelated protected content.

## Accessibility

1. Navigate Copilot and Environment with keyboard only.
   Expected result: focus order is usable and all commands remain reachable.

2. Inspect screen-reader labels.
   Expected result: composer, send/cancel, mode selection, approval actions, and status text have meaningful labels.

3. Enable reduced motion.
   Expected result: UI remains usable without motion-dependent cues.

## Sensitive Data

1. Inspect output channel, virtual documents, webview state, and reports after a conversation and qualification run.
   Expected result: no credentials, authorization headers, secret environment variables, private prompts, private reasoning, or complete protected source content are exposed.
