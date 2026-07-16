# Levi UI Product Requirements

Task ID: M32-001

Requirement ID: POST_MVP until approved by owner

Status: PRODUCT REQUIREMENTS ONLY

Scope:

- Define product requirements for the Levi user interface.
- Do not choose an implementation framework.
- Do not modify implementation files.
- Keep Levi Core as the owner of all business logic.
- Keep the UI as a thin interface over Levi Core.

## 1. Product Goal

The Levi UI helps a solo builder use Levi's controlled software-delivery workflow without learning prompts, patch schemas, provider routing, restore internals, or memory internals.

The UI must make the daily workflow feel calm, clear, fast, and trustworthy:

1. Open a project.
2. Submit a plain-language request.
3. Review a bounded plan.
4. Approve or reject work.
5. Observe execution.
6. Inspect results.
7. Restore when needed.

## 2. Primary Users

Primary user:

- A solo builder working on a software repository who needs scope control, project memory, safe execution, validation, cost awareness, and exact restore.

Secondary user:

- A technical owner reviewing Levi's evidence, decisions, project health, and task history before approving future work.

Non-primary users:

- Teams needing collaboration or role-based controls.
- Users seeking a standalone IDE.
- Users seeking autocomplete.
- Users seeking autonomous deployment.

## 3. Core User Journeys

Daily task journey:

1. User opens Levi.
2. User selects or opens a project.
3. User enters a plain-language request.
4. Levi validates intake, classifies intent, checks scope, and creates a plan.
5. User reviews objective, expected files, acceptance criteria, cost, risk, evidence, and restore readiness.
6. User approves normal work and separately confirms destructive or irreversible actions when present.
7. Levi executes through approved Levi Core workflows.
8. User watches simple progress with status, cost, safety, validation, and restore indicators.
9. User reviews completion results, changed files, commands, known failures, remaining work, memory updates, and restore options.

Recovery journey:

1. User opens Restore and History.
2. User reviews restore point metadata in plain language.
3. User confirms restore when appropriate.
4. Levi Core performs restore and reports exact result.

Understanding journey:

1. User opens Project Health, Project Knowledge, Durable Decisions, or Structural Search.
2. User reviews approved evidence, verified facts, UNKNOWN gaps, warnings, blockers, and recommendations.
3. User returns to the task workflow without configuring prompts or patch rules.

## 4. Information Architecture

Primary navigation sections:

- Dashboard
- Tasks
- Project Knowledge
- Decisions
- Structural Search
- Project Health
- Restore Points
- Settings

Primary workflow areas:

- Project selection
- Task intake
- Plan review
- Approval
- Execution progress
- Completion result
- Restore

Support areas:

- Project Health
- Project Knowledge
- Durable Decisions
- Structural Search
- Advanced Settings

Background-only capabilities:

- Provider routing
- Prompt construction
- Safe Patch schemas
- Context cache internals
- Restore internals
- Memory storage format
- Validation runner internals

## 5. Navigation Model

The UI uses one persistent primary navigation model:

- A top area for product identity, project selector, global status, and settings access.
- A primary navigation list for Dashboard, Tasks, Project Knowledge, Decisions, Structural Search, Project Health, Restore Points, and Settings.
- A main content area for the active screen.
- A status and feedback area visible when work is pending, blocked, running, completed, or restorable.

Navigation requirements:

- The active section must be visually and programmatically clear.
- Keyboard users must be able to reach every navigation item.
- Navigation labels must stay plain and stable.
- Navigation must not expose provider setup as a primary workflow item.
- Navigation must not expose prompt editing or patch schemas.

## 6. Screen Inventory

Core screens:

1. Dashboard.
2. Home and task intake.
3. Plan and approval.
4. Execution progress.
5. Completion result.
6. Project Health.
7. Project Knowledge.
8. Durable Decisions.
9. Structural Search.
10. Restore and history.
11. Advanced settings.

Screen-to-capability map:

| Capability | UI surface | Notes |
|---|---|---|
| Repository scan and project summary | Home, Dashboard, Project Health | Show concise repository identity and evidence status. |
| Prompt-free intake and intent classification | Home and task intake | User enters plain language only. |
| Scope checking | Plan and approval | Show allowed, blocked, ambiguous, or UNKNOWN outcome. |
| Real task planning | Plan and approval | Show objective, files, criteria, validation, risk, and exclusions. |
| Cost estimation and budget guardrails | Plan and approval, Execution progress, Completion result | Show cost class, budget state, UNKNOWN gaps, and blocked cost states. |
| Approval summary | Plan and approval | One primary approval action when ready. |
| Destructive confirmation | Plan and approval | Separate explicit confirmation. |
| Context preview and evidence | Plan and approval | Show concise cited evidence only. |
| Context budget and cache | Project Health, Plan and approval | Surface status only; internals remain background-only. |
| Provider readiness and health | Project Health, status area | Show readiness and clear next step; routing remains background-only. |
| Public execution | Execution progress | Show status and stages, not provider internals. |
| Safe Patch | Execution progress, Completion result | Show changed files and safety boundaries, not schemas. |
| Validation runner | Execution progress, Completion result | Show commands and pass/fail results. |
| Completion reporting | Completion result | Show actual work, known failures, remaining work, memory result. |
| Verified memory | Completion result, Project Knowledge | Show verified outcome and approved facts, not memory storage internals. |
| Exact restore identity | Restore and history | Show restore point, changed files, identity result, and confirmation. |
| Project Knowledge | Project Knowledge | Show extracted, approved, retrieved, and UNKNOWN facts. |
| Durable Decisions | Decisions | Show active decisions, enforcement effects, review, and removal. |
| Structural Search | Structural Search | Search symbols and relationships from deterministic index. |
| Project Health | Project Health, Dashboard | Show status, signals, summary, recommendations, blockers, and UNKNOWN gaps. |

## 7. Interaction Principles

- One primary action per screen.
- Secondary actions must be visually quieter than the primary action.
- Advanced controls are hidden by default.
- Every action that changes project state must be traceable to a Levi Core workflow.
- Irreversible or destructive actions require explicit confirmation.
- User-facing text must use plain language.
- The UI must prefer clear status over technical detail.
- The UI must never ask users to write prompts, patch schemas, or routing instructions.

## 8. Visual Design Principles

The UI should be Apple-inspired without copying Apple assets or layouts.

Visual direction:

- Beautiful, calm, clear, and professional.
- Clean whitespace.
- Strong typography and spacing.
- Minimal visual noise.
- Muted colors with high contrast.
- Rounded corners used with restraint.
- Subtle shadows only for hierarchy.
- Simple icon placeholders only until icon assets are approved.
- No animation in M32-001.

Visual hierarchy:

- The current primary task should be the strongest visual signal.
- Status, cost, safety, evidence, and restore information should be easy to scan.
- Dense operational details should be progressively disclosed.

## 9. Progressive Disclosure Rules

Always visible:

- Current project.
- Primary action.
- Current workflow status.
- Approval state.
- Blocking issues.
- Cost state.
- Restore readiness when relevant.

Visible on demand:

- Evidence details.
- Validation command output.
- Provider diagnostics.
- Context budget details.
- Advanced settings.
- Full Project Knowledge and Durable Decision records.
- Structural relationship details.

Never exposed as a normal user workflow:

- Prompt templates.
- Patch schemas.
- Provider routing rules.
- Memory storage internals.
- Restore data internals.
- Cache internals.

## 10. Plain-Language Standards

The UI must use short, direct wording.

Required wording behavior:

- Say "Ready", "Needs attention", "Blocked", or "Unknown" instead of internal status names when space allows.
- Explain blockers with one plain reason and one next step.
- Mark missing evidence as UNKNOWN.
- Avoid provider jargon unless the user opens diagnostics.
- Avoid implementation terms such as prompt engine, safe patch schema, model gateway, or memory adapter in primary screens.
- Use exact file paths, commands, costs, and validation results where evidence matters.

## 11. Accessibility Requirements

Accessibility requirements:

- Full keyboard navigation.
- Visible focus states.
- Logical heading order.
- Accessible names for controls.
- Sufficient color contrast in light and dark appearance.
- Status messages available without relying on color alone.
- Destructive actions announced clearly before confirmation.
- Form errors connected to the relevant fields.
- Responsive layouts that preserve reading order.

Accessibility expectations:

- The primary action must be reachable by keyboard.
- Modal or confirmation flows must retain focus.
- Empty, loading, success, warning, blocked, and error states must be understandable to assistive technology.

## 12. Responsive Behavior

Desktop:

- Persistent navigation and broad content layout.
- Main workflow and supporting status can appear side by side when space allows.

Tablet:

- Navigation may compact.
- Main content remains the priority.
- Secondary panels stack below the primary workflow.

Narrow:

- Navigation collapses into a simple accessible control.
- One screen section is shown at a time.
- Primary action remains visible without horizontal scrolling.
- Tables become stacked summaries or cards.

Responsive constraints:

- Text must not overlap.
- Controls must remain reachable.
- Status and approval actions must remain visible and understandable.

## 13. Light And Dark Appearance

Light appearance:

- Quiet neutral background.
- White or near-white content surfaces.
- High-contrast text.
- Muted status colors.

Dark appearance:

- Dark neutral background.
- Elevated surfaces with subtle contrast.
- High-contrast text.
- Status colors adjusted for readability.

Theme rules:

- Light and dark appearance must preserve the same information hierarchy.
- Appearance changes must not alter workflow state.
- Color must not be the only status indicator.

## 14. Status And Feedback Behavior

Status states:

- Ready
- Needs attention
- Blocked
- Running
- Completed
- Failed
- Unknown

Feedback requirements:

- Every workflow step should report current state.
- Blocking states must include the blocking reason.
- UNKNOWN states must explain what evidence is missing.
- Completion must show exact changed files and validation results.
- Failure must show what stopped and what remains.

## 15. Error-State Behavior

Error states must:

- Use plain language.
- Preserve the user's entered request.
- Avoid blame.
- State whether project files were changed.
- State whether restore is available.
- Provide one clear next step when evidence supports it.

Error states must not:

- Hide blockers.
- Mark failed work as completed.
- Expose secrets.
- Expose raw provider credentials or internal routing details.
- Suggest unapproved scope expansion.

## 16. Approval And Destructive-Action Behavior

Approval behavior:

- Plans remain unapproved until the user explicitly approves.
- The approval screen must show objective, expected files, planned operations, validation commands, cost state, risks, exclusions, evidence, and restore readiness.
- The primary action is approve only when the plan is complete and allowed.
- Rejection or cancellation must preserve project state.

Destructive-action behavior:

- Delete, overwrite, broad rewrite, restore, and irreversible actions require separate confirmation.
- Destructive confirmation must be visually distinct from normal approval.
- The UI must show what files or state could change before confirmation.
- No bypass or unattended destructive mode is allowed.

## 17. Cost Display Behavior

Cost display must show:

- FREE local task state when known.
- Known remote cost class or estimate when evidence exists.
- Budget ceiling when configured.
- UNKNOWN pricing when pricing evidence is missing.
- BLOCKED cost when cost exceeds policy.
- Whether cost approval is still required.

Cost display must not:

- Invent pricing.
- Hide UNKNOWN costs.
- Treat cost approval as normal task approval.
- Expose provider credentials or billing internals.

## 18. Restore Behavior

Restore UI must show:

- Latest restore point.
- Files created, updated, or deleted by Levi when known.
- Whether exact restore identity is available.
- Whether pre-existing runtime state is preserved.
- Clear confirmation before restore.
- Restore result after completion.

Restore UI must not:

- Remove unrelated files.
- Hide partial restore failures.
- Present restore as available when evidence is UNKNOWN.
- Expose restore internals unless needed for diagnostics.

## 19. Project Health Display Behavior

Project Health must show:

- Overall status.
- Short summary.
- Signal counts by status.
- Highest-severity blockers or warnings.
- Ready-to-work indicator.
- Recommendations.
- Evidence references.
- UNKNOWN gaps.

Project Health must separate:

- Verified evidence.
- Approved knowledge.
- Warnings.
- Blockers.
- UNKNOWN values.

Acceptance criteria:

- A user can understand whether the project is ready for work.
- Blockers are not hidden.
- Recommendations are based only on health signals.

## 20. Project Knowledge Display Behavior

Project Knowledge must show:

- Approved facts.
- Verified facts.
- UNKNOWN facts.
- Source evidence.
- Confidence state.
- Category.
- Project identity.
- Approval timestamp when available.

Project Knowledge must support:

- Review by category.
- Review by keyword.
- Review by evidence.
- Removal of approved facts where Levi Core supports it.

Acceptance criteria:

- Rejected, unresolved, unverified, removed, secret-like, and foreign-project knowledge are excluded.
- Model output is not shown as approved knowledge without verification.

## 21. Durable Decisions Display Behavior

Durable Decisions must show:

- Active approved decisions.
- Decision category.
- Decision statement.
- Source evidence.
- Confidence.
- Approval timestamp.
- Enforcement status.
- Review and removal controls.

Decision enforcement display must show:

- ALLOWED, APPROVAL_REQUIRED, BLOCKED, or UNKNOWN in plain language.
- Matching decision and reason.
- Protected subsystem approval needs.
- Dependency policy blocks.
- Validation requirements injected into planning.

Acceptance criteria:

- Removed, rejected, unresolved, unverified, secret-like, foreign-project, and model-output decisions do not appear as active controls.
- Conflicting active decisions are shown as requiring review, not guessed.

## 22. Structural Search Display Behavior

Structural Search must support:

- Symbol search.
- Relationship search.
- Search by name, type, language, path, export status, module, parent, route, API endpoint, React component, hook, middleware, configuration file, and keyword where evidence exists.

Structural Search must show:

- Symbol ID.
- Name.
- Type.
- Path.
- Line number when available.
- Language.
- Parent.
- Export status.
- Evidence source.
- Relationship source and target when available.
- Confidence state for relationships.

Acceptance criteria:

- Results come from deterministic structural indexes.
- UNKNOWN is shown when evidence is insufficient.
- No repository rescan is required by search display itself.

## 23. Advanced Settings Behavior

Advanced Settings contains optional controls only.

Allowed categories:

- Provider diagnostics.
- Budget ceiling review.
- Context budget visibility.
- Cache visibility.
- Accessibility preferences.
- Theme preference.
- Restore diagnostics.

Rules:

- Advanced Settings must not be required for the primary task workflow.
- Provider configuration must not appear in the primary workflow.
- Prompt editing and patch schema editing are not allowed.
- Defaults should work without configuration when Levi Core has enough evidence.

## 24. Empty States

Empty states must explain what is missing and what the user can do next.

Required empty states:

- No project selected.
- No task started.
- No plan available.
- No execution history.
- No Project Knowledge.
- No Durable Decisions.
- No Structural Search index.
- No restore points.
- No Project Health evidence.

Empty states must not imply work has completed when it has not.

## 25. Loading States

Loading states must:

- Identify what Levi is checking or preparing.
- Avoid technical internals in primary screens.
- Preserve the user's current work.
- Avoid animation requirements in M32-001.
- Never imply provider execution unless Levi Core is actually executing through the approved workflow.

Loading examples:

- Checking project.
- Building plan.
- Preparing approval summary.
- Running approved work.
- Checking validation results.
- Loading restore history.

## 26. Success Criteria

Product success criteria:

- A new user understands the primary action without documentation.
- A user can open a project, submit a request, review a plan, approve it, observe execution, inspect results, and restore changes.
- Project Knowledge and Durable Decisions affect planning only through approved evidence.
- Structural Search supports real repository questions.
- Project Health presents concise actionable information.
- Advanced settings remain optional.
- Existing Release 0.3 functionality does not regress.

Screen success criteria:

- Every screen has one primary action.
- Every screen has an empty, loading, error, and success state where relevant.
- Every screen preserves scope, evidence, safety, cost, status, and restore expectations where relevant.

## 27. Non-Goals

The UI does not include:

- Prompt-engineering interface.
- Exposed patch schemas.
- Provider setup in the primary workflow.
- Standalone IDE behavior.
- Autocomplete.
- Marketplace.
- Autonomous deployment.
- Team collaboration.
- Mobile application.
- Voice control.
- Manual context selection as a required workflow.
- Framework selection.
- UI implementation details.

## Core Screen Acceptance Criteria

### Dashboard

- Shows selected project, readiness, current task state, Project Health summary, restore readiness, and recent activity.
- Provides one primary action: start or continue the current task.
- Surfaces blockers, cost state, safety state, and UNKNOWN gaps without requiring advanced settings.
- Does not expose prompt, patch, provider routing, cache, restore, or memory internals.

### Home And Task Intake

- Shows current project or no-project state.
- Provides one primary action: submit a plain-language request.
- Preserves original request text.
- Shows prompt-free intake and intent classification outcome.
- Does not expose prompt templates, provider configuration, or context selection.

### Plan And Approval

- Shows objective, expected files, acceptance criteria, validation commands, risks, exclusions, cost state, evidence, and restore readiness.
- Provides one primary action: approve plan when allowed.
- Blocks approval when intake, scope, cost, or required evidence is unresolved.
- Requires separate confirmation for destructive or irreversible actions.
- Does not expose patch schemas.

### Execution Progress

- Shows current stage, status, cost state, safety boundary, and validation stage.
- Provides one primary action appropriate to state, such as cancel when supported by Levi Core or view results when complete.
- Does not execute providers outside Levi Core.
- Does not show raw prompt or provider routing internals.

### Completion Result

- Shows actual changed files, validation commands, validation results, known failures, remaining work, memory result, and restore option.
- Provides one primary action: finish, review restore, or resolve remaining work depending on status.
- Clearly distinguishes completed, failed, and partial outcomes.
- Does not mark failed validation as completed.

### Project Health

- Shows overall status, signal counts, highest-severity issues, recommendations, ready-to-work state, and evidence references.
- Provides one primary action: review recommended next step.
- Shows blockers and UNKNOWN gaps clearly.
- Does not collect new health signals by executing providers, prompts, patches, or validation commands.

### Project Knowledge

- Shows approved and verified knowledge with source evidence and confidence.
- Provides one primary action: review selected knowledge or approve eligible extracted knowledge when Levi Core supports it.
- Excludes rejected, unresolved, unverified, removed, secret-like, and foreign-project facts.
- Does not turn model output into approved knowledge.

### Durable Decisions

- Shows active approved decisions, enforcement status, evidence, confidence, and review/removal controls.
- Provides one primary action: review selected decision.
- Shows approval-required, blocked, allowed, and UNKNOWN enforcement states in plain language.
- Does not modify Project Knowledge.

### Structural Search

- Provides one primary action: search.
- Shows symbol and relationship results from deterministic repository structure.
- Shows UNKNOWN where evidence is insufficient.
- Does not require repository rescan during search display.

### Restore And History

- Shows restore points, changed files, task history, exact identity status, and restore readiness.
- Provides one primary action: inspect or restore selected point depending on state.
- Requires explicit confirmation before restore.
- Shows partial restore failure clearly.

### Advanced Settings

- Provides one primary action: save supported preferences.
- Keeps advanced controls optional.
- Hides provider configuration from the primary workflow.
- Does not include prompt editing or patch schema editing.

## Capability Coverage Validation

Release 0.3 capabilities with UI surfaces:

- One-minute local readiness: Project Health, status area, Advanced Settings diagnostics.
- Cost preview and budget guardrails: Plan and Approval, Execution Progress, Completion Result.
- Approval summary and destructive action highlighting: Plan and Approval.
- Restore points and restore workflow: Restore and History, Completion Result.
- Context preview and evidence display: Plan and Approval.
- Provider health and fallback diagnostics: Project Health, Advanced Settings diagnostics.
- Context budget and cache: Project Health, Advanced Settings diagnostics.
- Prompt-free intake and classification: Home and Task Intake.
- Real public execution, safe patch, validation, completion, memory, and restore: Execution Progress, Completion Result, Restore and History.

Release 0.4A capabilities with UI surfaces:

- Project Knowledge: Project Knowledge.
- Durable Project Decisions: Durable Decisions.
- Structural Code Search: Structural Search.
- Project Health: Project Health and Dashboard.
- Simple User Interface: All core screens.

Intentionally background-only:

- Model Gateway routing.
- Prompt Engine construction.
- Safe Patch schema details.
- Context cache internals.
- Restore storage internals.
- Runtime metadata internals.
- Memory store format.

## Validation Checklist

- Every required M32 screen is represented.
- Every Release 0.3 capability has a UI surface or is marked background-only.
- Every Release 0.4A capability has a UI surface or is marked background-only.
- Every core screen defines one primary action.
- Advanced controls remain optional.
- Prompt-engineering UI is excluded.
- Patch schemas are excluded.
- Provider setup is excluded from the primary workflow.
- No implementation framework is selected.
- No implementation files are modified by this document.
