# Levi UI Architecture

Task ID: M32-002

Requirement ID: POST_MVP until approved by owner

Status: ARCHITECTURE ONLY

This document defines the approved user-interface architecture for Levi. It does not select a frontend framework, approve new runtime dependencies, or write implementation code. Levi Core remains the owner of task planning, provider routing, prompt construction, safe patching, validation, memory, restore, Project Knowledge, Durable Decisions, Structural Search, and Project Health logic.

## 1. Architecture Goals

- Provide a thin, calm interface over existing Levi Core workflows.
- Keep all business logic inside Levi Core modules.
- Keep UI state from becoming a second source of truth for task state, memory, cost, restore, provider routing, validation, Project Knowledge, Durable Decisions, Structural Search, or Project Health.
- Represent every M32 screen with clear purpose, inputs, outputs, shared components, and navigation entry points.
- Support responsive, keyboard-accessible, high-contrast screens without copying Apple assets or layouts.
- Avoid framework assumptions until a later approved task explicitly chooses an implementation approach.
- Avoid external dependencies unless a future task completes OSS evaluation and approval.

## 2. Overall UI Architecture

Levi UI is organized as a presentation layer over Levi Core.

| Layer | Responsibility | Boundary |
|---|---|---|
| User Interface Shell | Presents navigation, screens, status, theme, and interaction states. | No business logic, no provider execution, no prompt construction, no patch validation. |
| Screen Controllers | Coordinate screen inputs, display state, and calls to the UI bridge. | May format Core responses for display, but must not change Core decisions. |
| UI Bridge | Future thin adapter between screens and Levi Core workflows. | Calls approved Levi Core APIs or CLI-compatible workflows only. |
| Levi Core | Owns scan, intake, scope, planning, approval, cost, execution, safe patch, validation, memory, restore, health, knowledge, decisions, and search. | Source of truth for all workflow and repository state. |
| Project Repository | User-selected repository and Levi internal metadata. | Modified only by approved Levi Core workflows, never directly by UI screens. |

Rules:

- Screens request work from Levi Core through the UI Bridge.
- Screens render returned state and evidence.
- Screens do not construct prompts, route providers, validate patch schemas, edit restore internals, or alter memory directly.
- Failed, blocked, UNKNOWN, and approval-required states must be displayed as returned by Levi Core.
- Provider setup, prompt editing, patch schema editing, cache internals, restore internals, and memory storage internals remain outside the primary workflow.

## 3. Navigation Hierarchy

Top level:

- Application title.
- Project selector.
- Current project status.
- Current task status.
- Settings entry point.

Primary navigation:

- Dashboard.
- Tasks.
- Project Knowledge.
- Decisions.
- Structural Search.
- Project Health.
- Restore Points.
- Settings.

Task workflow under Tasks:

1. Home and Task Intake.
2. Plan and Approval.
3. Execution Progress.
4. Completion Result.

Support sections:

- Project Knowledge for approved and verified project facts.
- Decisions for active Durable Decisions and enforcement state.
- Structural Search for symbol and relationship lookup.
- Project Health for readiness, blockers, recommendations, and UNKNOWN gaps.
- Restore Points for history and exact restore.
- Settings for optional advanced preferences and diagnostics.

Background-only capabilities:

- Provider routing.
- Prompt construction.
- Safe Patch schemas.
- Context cache internals.
- Restore internals.
- Memory storage format.
- Validation runner internals.

## 4. Screen Hierarchy

- Dashboard
  - Project summary strip.
  - Current task card.
  - Health summary.
  - Restore readiness.
  - Recent activity.
- Tasks
  - Home and Task Intake.
  - Plan and Approval.
  - Execution Progress.
  - Completion Result.
- Project Knowledge
  - Knowledge list.
  - Knowledge detail.
  - Approval or removal affordance when Levi Core supports it.
- Decisions
  - Decision list.
  - Decision detail.
  - Enforcement explanation.
  - Removal affordance when Levi Core supports it.
- Structural Search
  - Search form.
  - Symbol results.
  - Relationship results.
  - Evidence detail.
- Project Health
  - Overall summary.
  - Signal list.
  - Recommendations.
  - Evidence detail.
- Restore and History
  - Restore point list.
  - Restore point detail.
  - Restore confirmation.
  - Restore result.
- Advanced Settings
  - Optional diagnostics.
  - Optional budget visibility.
  - Optional context and cache visibility.
  - Optional accessibility and theme preferences.

## 5. Layout System

The shell uses stable regions:

- Top navigation: project identity, task state, and global status.
- Primary navigation: section movement.
- Main content: one screen's primary workflow.
- Secondary panel: supporting evidence, details, or history when space allows.
- Status area: readiness, cost, safety, validation, and restore indicators.
- Footer area: low-priority version, policy, or diagnostic references.

Layout rules:

- One primary action is visually dominant per screen.
- Secondary actions remain quieter and grouped near the related content.
- Evidence appears close to the decision it supports.
- Blocking states appear before optional detail.
- Long tables collapse into stacked summaries on narrow screens.
- Screen content must not require horizontal scrolling for primary workflows.
- UI cards may frame repeated items, dialogs, or focused tools, but page sections remain simple and uncluttered.

## 6. Design Token Strategy

Design tokens are semantic names, not framework bindings.

Token groups:

- Color: canvas, surface, elevated surface, text primary, text secondary, border, focus, accent, success, warning, danger, unknown, running, disabled.
- Typography: app title, screen title, section heading, body, supporting text, metadata, code or path text, button label.
- Spacing: page margin, section gap, control gap, inline gap, compact gap.
- Radius: control radius, panel radius, dialog radius.
- Shadow: low elevation, dialog elevation, focus ring.
- Border: subtle divider, strong divider, selected outline.
- Status: healthy, attention, blocked, unknown, running, completed, failed.

Rules:

- Tokens must work in light and dark appearance.
- Token names must describe purpose, not raw color names.
- Tokens must be centrally defined by the future UI implementation.
- No token may imply a specific frontend framework.

## 7. Typography Scale

| Role | Purpose | Behavior |
|---|---|---|
| App title | Product identity in shell. | Short, stable, never used for dense content. |
| Screen title | Current screen purpose. | One per screen. |
| Section heading | Local grouping. | Short and scannable. |
| Body | Main explanations and labels. | Plain language, high contrast. |
| Supporting text | Secondary context. | Muted but readable. |
| Metadata | IDs, timestamps, status details. | Compact and consistent. |
| Code or path text | File paths, commands, evidence references. | Monospace style when implemented. |
| Button label | Action text. | Verb-led and short. |

Typography rules:

- Use system-readable fonts unless a future approved task selects a type system.
- Do not scale type by viewport width.
- Keep letter spacing neutral.
- Reserve large type for screen-level hierarchy, not compact panels.
- Preserve readable line length for long evidence or result text.

## 8. Spacing System

Spacing uses a small consistent scale:

- Extra small: tight icon and metadata gaps.
- Small: related control gaps.
- Medium: form field and list item spacing.
- Large: section gaps.
- Extra large: page-level breathing room.

Rules:

- Related items stay close together.
- Separate decisions, warnings, and confirmations from routine information.
- Keep primary actions reachable without dense clustering.
- On narrow screens, reduce horizontal space before reducing readability.

## 9. Icon Strategy

- Icons are simple, supportive, and never the only carrier of meaning for critical states.
- Navigation icons may be placeholders until a future approved implementation selects an icon source.
- Status icons must have text labels.
- Destructive icons must be paired with explicit text and confirmation.
- Icons must not copy Apple assets or proprietary layouts.
- No external icon dependency is approved by this architecture document.

## 10. Color System

The color system is semantic and appearance-aware.

Core roles:

- Canvas: page background.
- Surface: panels, cards, and form areas.
- Elevated surface: dialogs and overlays.
- Text primary: main readable text.
- Text secondary: supporting text.
- Border: dividers and containment.
- Focus: keyboard focus ring.
- Accent: primary action and selected navigation.
- Success: completed or healthy states.
- Warning: attention states.
- Danger: blocked, failed, destructive, or unsafe states.
- Unknown: insufficient evidence.
- Running: active work.

Rules:

- Light and dark appearance must preserve contrast.
- Status color must always be accompanied by text.
- Danger and warning colors must not be used decoratively.
- Accent color must be restrained so status and safety information remain clear.

## 11. Component Hierarchy

Top-level component hierarchy for future implementation:

- AppShell
  - TopNavigation
  - ProjectSelector
  - PrimaryNavigation
  - MainContentRegion
  - StatusArea
  - FooterArea
- ScreenLayout
  - ScreenHeader
  - PrimaryActionArea
  - ContentSection
  - SecondaryPanel
  - EvidencePanel
  - EmptyState
  - LoadingState
  - ErrorState
- WorkflowComponents
  - IntakeForm
  - PlanSummary
  - ApprovalSummary
  - CostSummary
  - DestructiveConfirmation
  - ExecutionTimeline
  - ValidationResultList
  - CompletionSummary
  - RestorePointSummary
- EvidenceComponents
  - EvidenceReference
  - SourceList
  - ConfidenceBadge
  - UnknownBadge
  - StatusBadge
- DataComponents
  - FilterBar
  - ResultList
  - DetailPanel
  - SearchBox
  - EmptyResults

## 12. Shared UI Components

Shared component inventory:

- AppShell: persistent page frame.
- TopNavigation: title, project selector, and status.
- PrimaryNavigation: section navigation.
- ScreenHeader: title, summary, and primary action placement.
- ProjectSelector: selected project and no-project state.
- StatusBadge: HEALTHY, ATTENTION, BLOCKED, UNKNOWN, running, completed, failed.
- CostBadge: FREE, known cost, UNKNOWN, blocked, approval required.
- SafetyBadge: safe, approval required, destructive confirmation required, blocked.
- RestoreBadge: ready, unavailable, exact identity verified, restore failed.
- EvidenceReference: source path, line, command, or module evidence.
- ConfidenceBadge: verified, approved, UNKNOWN, unresolved.
- PrimaryActionButton: one main action per screen.
- SecondaryActionButton: quieter contextual actions.
- ConfirmationDialog: explicit approval and destructive confirmations.
- ApprovalSummary: plan, cost, risk, restore readiness, and required confirmations.
- ErrorNotice: inline, screen-level, or blocking error presentation.
- LoadingNotice: plain-language loading state.
- EmptyState: missing evidence or no-data state.
- FileList: expected files, changed files, restore files.
- CommandList: validation commands and results.
- ActivityTimeline: task and execution history.
- RecommendationList: Project Health recommendations.
- SearchBox: Structural Search entry.
- FilterBar: category, status, confidence, and keyword filtering.
- ResultList: knowledge, decisions, symbols, relationships, restore points.
- DetailPanel: selected item detail with evidence.
- SettingsGroup: optional settings categories.

## 13. State Management Boundaries

Levi Core owns:

- Repository identity.
- Scan results.
- Intake state.
- Scope decisions.
- Task plans.
- Approval state.
- Cost decisions.
- Destructive confirmations.
- Provider readiness and routing.
- Execution state.
- Safe Patch operations and results.
- Validation commands and results.
- Completion reports.
- Verified memory.
- Restore points and restore results.
- Project Knowledge.
- Durable Decisions.
- Structural indexes and search results.
- Project Health signals, summaries, and recommendations.

The UI may own:

- Current route.
- Selected navigation item.
- Expanded or collapsed panels.
- Draft form text before submission.
- Local sort or filter controls before query submission.
- Active detail selection.
- Theme preference display state when supported by Levi Core or approved local preference.
- Focus management.

Rules:

- UI state must be disposable.
- Refreshing the UI must recover authoritative workflow state from Levi Core.
- UI caching must not alter Core decisions.
- UI drafts become Core inputs only through explicit user action.

## 14. Levi Core Integration Boundaries

Future UI Bridge responsibilities:

- Request project selection or project open state.
- Request repository scan and project summary.
- Submit plain-language intake.
- Request intake validation and classification.
- Request scope decision and task plan.
- Request context preview and evidence.
- Request cost estimation and stored cost decision.
- Request approval summary.
- Submit task approval and separate destructive confirmation.
- Start approved execution.
- Read execution progress.
- Read completion report.
- Read and invoke restore workflows.
- Read Project Health signals, summary, and recommendations.
- Read and manage Project Knowledge through approved Core workflows.
- Read and manage Durable Decisions through approved Core workflows.
- Query Structural Search through approved Core workflows.

Forbidden UI Bridge behavior:

- Direct provider execution.
- Prompt construction outside Levi Core.
- Direct Safe Patch operation validation.
- Direct file writes to target repositories.
- Direct modification of `.levi` runtime metadata.
- Direct memory writes.
- Direct restore mutation.
- Price invention or provider routing decisions.
- Direct validation command execution unless Levi Core exposes an approved workflow for it.

## 15. Responsive Breakpoints

Breakpoints are architectural targets, not framework classes.

| Breakpoint | Width Range | Behavior |
|---|---|---|
| Narrow | Up to 640 px | Collapsed navigation, one content section at a time, stacked results, persistent primary action when practical. |
| Tablet | 641 px to 1024 px | Collapsible side navigation, main content first, secondary panels below or beside when space allows. |
| Desktop | 1025 px and above | Persistent navigation, main content with optional secondary panel, status visible without crowding. |

Rules:

- Primary action remains reachable on every breakpoint.
- Evidence detail may collapse behind a disclosure control on narrow screens.
- Tables become stacked summaries on narrow screens.
- Dialogs must fit narrow screens without horizontal scrolling.

## 16. Accessibility Architecture

- Use landmarks for header, navigation, main content, status, and footer.
- Provide one screen title as the top heading in main content.
- Preserve logical heading order.
- Every form control has a visible label.
- Status changes use polite live-region behavior where appropriate.
- Blocking errors use assertive announcement where appropriate.
- Dialogs trap focus and return focus after close.
- Destructive confirmations require explicit keyboard-accessible controls.
- All interactive elements are reachable by keyboard.
- Focus indicators are visible in light and dark appearance.
- Color is never the only status indicator.
- Reduced-motion preferences must be respected if motion is introduced by a later task.

## 17. Keyboard Navigation Architecture

Keyboard order:

1. Skip to main content.
2. Project selector.
3. Primary navigation.
4. Screen heading and primary action.
5. Main workflow controls.
6. Secondary details.
7. Status area.
8. Footer links.

Rules:

- Tab moves through interactive elements in visual order.
- Arrow-key behavior may be used for navigation lists only when implemented with accessible patterns.
- Enter activates the focused primary command.
- Escape closes non-destructive overlays and returns focus.
- Escape must not confirm destructive actions.
- Confirmation dialogs require explicit confirm and cancel actions.

## 18. Error Presentation Architecture

Error levels:

- Field error: invalid or missing input in the current form.
- Inline warning: issue tied to a specific section.
- Screen alert: blocking state that affects the screen.
- Workflow blocker: state that prevents planning, approval, execution, restore, or completion.
- System unavailable: Core workflow unavailable or project cannot be read.

Rules:

- Errors use plain language.
- Errors preserve Levi Core reason and evidence when available.
- Errors identify the next available action.
- Blocking states appear before optional detail.
- Failed validation cannot be presented as completed.
- Unknown evidence must be presented as UNKNOWN, not guessed.

## 19. Approval Workflow Architecture

The approval workflow is owned by Levi Core and presented by the UI.

Required display:

- Original request.
- Normalized objective.
- Classified task type.
- Scope decision.
- Expected files.
- Acceptance criteria.
- Validation commands.
- Cost state.
- Evidence.
- Risks and exclusions.
- Restore readiness.
- Required normal approval.
- Required destructive confirmation when applicable.

Rules:

- Normal task approval and destructive confirmation are separate.
- Cost approval does not substitute for task approval.
- Approval is disabled when intake, scope, cost, evidence, or destructive confirmation is unresolved.
- Approval summary and execution must refer to the same Core-stored decision.
- UI never edits approved operations or patch schemas.

## 20. Execution Progress Architecture

Execution Progress renders Levi Core execution state.

Stages displayed in plain language:

- Preparing approved context.
- Generating proposed changes through the approved workflow.
- Checking proposed changes.
- Applying safe changes.
- Running validation.
- Recording completion.
- Preparing restore information.

Required display:

- Current stage.
- Overall status.
- Cost state.
- Safety boundary.
- Validation stage.
- Changed files when available.
- Failure reason and next action when blocked.

Rules:

- Provider routing and raw prompts remain hidden.
- Provider execution must occur only behind Levi Core and Model Gateway boundaries.
- Failed generation prevents patch display as applied.
- Failed patching prevents validation and completion.
- Failed validation prevents completed status.

## 21. Project Health Architecture

Project Health displays Core-generated signals, summary, and recommendations.

Inputs:

- Health signals.
- Health summary.
- Recommendations.
- Evidence references.

Outputs:

- Overall status.
- Signal counts.
- Highest-severity issues.
- Ready-to-work indicator.
- Recommendations.
- UNKNOWN gaps.

Rules:

- BLOCKED outranks ATTENTION, ATTENTION outranks UNKNOWN, and UNKNOWN outranks HEALTHY.
- Recommendations come only from existing signals.
- The UI must not collect health signals by executing providers, prompts, patches, or validation commands.
- Evidence stays concise, with detail available on demand.

## 22. Project Knowledge Architecture

Project Knowledge displays approved or verified facts through Levi Core workflows.

Inputs:

- Approved facts.
- Verified facts.
- UNKNOWN facts.
- Evidence.
- Confidence.
- Category.
- Project identity.
- Approval timestamp when available.

Outputs:

- Knowledge list.
- Knowledge detail.
- Review, approve, or remove actions only when Core supports them.

Rules:

- Rejected, unresolved, unverified, removed, secret-like, and foreign-project knowledge are excluded.
- Model output cannot appear as approved knowledge without verification.
- Planning effects remain owned by Levi Core.
- UI never writes Project Knowledge directly.

## 23. Durable Decisions Architecture

Durable Decisions displays active approved decisions and enforcement state.

Inputs:

- Active approved decisions.
- Decision category.
- Decision statement.
- Evidence.
- Confidence.
- Approval timestamp.
- Enforcement status.

Outputs:

- Decision list.
- Decision detail.
- Enforcement explanation.
- Review or removal action when Core supports it.

Rules:

- Enforcement states are ALLOWED, APPROVAL_REQUIRED, BLOCKED, or UNKNOWN.
- Conflicting active decisions are shown as requiring review, not guessed.
- Removed, rejected, unresolved, unverified, secret-like, foreign-project, and model-output decisions do not appear as active controls.
- UI must not modify Project Knowledge while handling Durable Decisions.

## 24. Structural Search Architecture

Structural Search queries existing Core structural indexes.

Inputs:

- Query text.
- Symbol filters.
- Relationship filters.
- Category filters.
- Existing structural index state.

Outputs:

- Symbol results.
- Relationship results.
- Evidence source.
- Confidence state where applicable.
- UNKNOWN state when evidence is insufficient.

Rules:

- Search display uses the existing Structural Symbol Index and Relationship Search outputs.
- The UI must not rescan repositories during search display.
- Results are repository-isolated.
- Result ordering follows Core ordering.
- Missing evidence is shown as UNKNOWN or empty, not inferred.

## 25. Restore Architecture

Restore and History presents Core restore points and results.

Inputs:

- Restore point list.
- Restore point detail.
- Changed files.
- Task history.
- Exact identity status.
- Restore readiness.

Outputs:

- Restore point inspection.
- Restore confirmation.
- Restore result.
- Partial failure display when applicable.

Rules:

- Restore requires explicit confirmation.
- Restore internals are not exposed.
- UI never mutates repository files directly.
- Exact identity result is displayed as returned by Levi Core.
- Partial restore failure must be prominent and plain.

## 26. Advanced Settings Architecture

Advanced Settings is optional and outside the primary workflow.

Allowed categories:

- Provider diagnostics.
- Budget ceiling review.
- Context budget visibility.
- Cache visibility.
- Accessibility preferences.
- Theme preference.
- Restore diagnostics.

Rules:

- Advanced Settings must not be required to complete the main task workflow.
- Provider configuration must not appear in the primary workflow.
- Prompt editing is not allowed.
- Patch schema editing is not allowed.
- Defaults should work when Levi Core has enough evidence.
- Settings screens may request diagnostics from Levi Core but must not route providers or execute prompts.

## 27. Screen Architecture Matrix

### Dashboard

Purpose:

- Give a concise view of selected project readiness, current task state, health, restore readiness, and recent activity.

Inputs:

- Project identity.
- Repository scan summary.
- Current task state.
- Project Health summary.
- Restore readiness.
- Cost, safety, and UNKNOWN indicators.
- Recent activity from Levi Core.

Outputs:

- Start or continue task command.
- Navigation to relevant blocker, plan, execution, health, or restore detail.

Shared components:

- AppShell.
- ScreenHeader.
- ProjectSelector.
- StatusBadge.
- CostBadge.
- SafetyBadge.
- RestoreBadge.
- RecommendationList.
- ActivityTimeline.
- PrimaryActionButton.

Navigation entry points:

- Default landing screen after project selection.
- Primary navigation: Dashboard.
- Completion result return path.

### Home and Task Intake

Purpose:

- Let the user select or confirm a project and submit a plain-language request.

Inputs:

- Project identity or no-project state.
- Plain-language request draft.
- Existing intake state when resuming.

Outputs:

- Submitted original request.
- Intake validation result.
- Classified task type.
- Navigation to Plan and Approval when Core allows planning.

Shared components:

- AppShell.
- ScreenHeader.
- ProjectSelector.
- IntakeForm.
- StatusBadge.
- ErrorNotice.
- EmptyState.
- PrimaryActionButton.

Navigation entry points:

- Dashboard primary action.
- Primary navigation: Tasks.
- Restart task action from Completion Result.

### Plan and Approval

Purpose:

- Present a bounded plan from Levi Core and collect required approvals.

Inputs:

- Original request.
- Normalized objective.
- Task type.
- Scope decision.
- Task plan.
- Expected files.
- Acceptance criteria.
- Validation commands.
- Cost decision.
- Evidence.
- Restore readiness.
- Destructive action requirements.
- Durable Decision enforcement results.

Outputs:

- Normal task approval.
- Explicit cost approval when Core requires it.
- Separate destructive confirmation when Core requires it.
- Navigation to Execution Progress when fully approved.

Shared components:

- AppShell.
- ScreenHeader.
- PlanSummary.
- ApprovalSummary.
- CostSummary.
- EvidencePanel.
- FileList.
- CommandList.
- SafetyBadge.
- RestoreBadge.
- ConfirmationDialog.
- ErrorNotice.
- PrimaryActionButton.

Navigation entry points:

- Home and Task Intake after valid planning.
- Dashboard current task card.
- Primary navigation: Tasks.

### Execution Progress

Purpose:

- Show Core-owned execution status for an approved task.

Inputs:

- Approved task ID.
- Execution stage.
- Provider readiness state as reported by Core.
- Cost state.
- Safe Patch status.
- Validation status.
- Changed-file records.
- Failure state when present.

Outputs:

- View results when complete.
- Cancel or stop action only when Levi Core supports it.
- Navigation to Completion Result.

Shared components:

- AppShell.
- ScreenHeader.
- ExecutionTimeline.
- StatusBadge.
- CostBadge.
- SafetyBadge.
- FileList.
- CommandList.
- ErrorNotice.
- LoadingNotice.
- PrimaryActionButton.

Navigation entry points:

- Plan and Approval after approval.
- Dashboard current task card.
- Primary navigation: Tasks.

### Completion Result

Purpose:

- Present final task outcome, actual changes, validation results, memory result, remaining work, and restore options.

Inputs:

- Completion report.
- Actual changed files.
- Validation commands and results.
- Known failures.
- Remaining work.
- Verified memory result.
- Restore point state.

Outputs:

- Finish task.
- Review restore.
- Resolve remaining work when applicable.
- Navigate to Restore and History.

Shared components:

- AppShell.
- ScreenHeader.
- CompletionSummary.
- FileList.
- CommandList.
- StatusBadge.
- RestoreBadge.
- EvidencePanel.
- ErrorNotice.
- PrimaryActionButton.

Navigation entry points:

- Execution Progress completion.
- Dashboard current or recent task card.
- Primary navigation: Tasks.

### Project Health

Purpose:

- Show readiness, blockers, recommendations, UNKNOWN gaps, and evidence-backed health signals.

Inputs:

- Project Health signals.
- Health summary.
- Recommendations.
- Evidence references.

Outputs:

- Review recommended next step.
- Navigate to related section such as Plan, Knowledge, Decisions, Search, or Restore.

Shared components:

- AppShell.
- ScreenHeader.
- StatusBadge.
- RecommendationList.
- EvidenceReference.
- FilterBar.
- DetailPanel.
- EmptyState.
- PrimaryActionButton.

Navigation entry points:

- Primary navigation: Project Health.
- Dashboard health summary.
- Status area blocker link.

### Project Knowledge

Purpose:

- Display approved and verified project knowledge with evidence and confidence.

Inputs:

- Approved facts.
- Verified facts.
- UNKNOWN facts.
- Categories.
- Evidence.
- Confidence state.
- Approval timestamps.

Outputs:

- Review selected knowledge.
- Approve eligible extracted knowledge when Core supports it.
- Remove approved knowledge when Core supports it.

Shared components:

- AppShell.
- ScreenHeader.
- FilterBar.
- ResultList.
- DetailPanel.
- EvidenceReference.
- ConfidenceBadge.
- UnknownBadge.
- EmptyState.
- PrimaryActionButton.

Navigation entry points:

- Primary navigation: Project Knowledge.
- Dashboard evidence links.
- Plan evidence links.
- Completion verified memory link.

### Durable Decisions

Purpose:

- Display active approved project decisions and explain enforcement effects.

Inputs:

- Active decisions.
- Decision categories.
- Decision IDs.
- Evidence.
- Confidence.
- Approval timestamps.
- Enforcement statuses.

Outputs:

- Review selected decision.
- Remove approved decision when Core supports it.
- Navigate to affected plan or blocker when relevant.

Shared components:

- AppShell.
- ScreenHeader.
- FilterBar.
- ResultList.
- DetailPanel.
- EvidenceReference.
- ConfidenceBadge.
- StatusBadge.
- ConfirmationDialog.
- EmptyState.
- PrimaryActionButton.

Navigation entry points:

- Primary navigation: Decisions.
- Plan enforcement links.
- Project Health decision signals.

### Structural Search

Purpose:

- Search symbols and relationships from deterministic repository structure.

Inputs:

- Search query.
- Symbol filters.
- Relationship filters.
- Existing structural index.
- Repository identity.

Outputs:

- Symbol results.
- Relationship results.
- Evidence detail.
- UNKNOWN or empty state where evidence is absent.

Shared components:

- AppShell.
- ScreenHeader.
- SearchBox.
- FilterBar.
- ResultList.
- DetailPanel.
- EvidenceReference.
- UnknownBadge.
- EmptyResults.
- PrimaryActionButton.

Navigation entry points:

- Primary navigation: Structural Search.
- Project Health structural index signal.
- Plan evidence links when structural evidence is cited.

### Restore and History

Purpose:

- Inspect task history, restore points, exact identity status, and restore results.

Inputs:

- Restore point list.
- Restore point detail.
- Changed files.
- Task history.
- Exact identity status.
- Restore readiness.

Outputs:

- Inspect selected restore point.
- Confirm restore when applicable.
- Display restore result.

Shared components:

- AppShell.
- ScreenHeader.
- RestorePointSummary.
- ActivityTimeline.
- FileList.
- RestoreBadge.
- ConfirmationDialog.
- ErrorNotice.
- DetailPanel.
- PrimaryActionButton.

Navigation entry points:

- Primary navigation: Restore Points.
- Completion Result restore option.
- Dashboard restore readiness link.

### Advanced Settings

Purpose:

- Provide optional diagnostics and preferences outside the primary workflow.

Inputs:

- Provider diagnostics from Core.
- Budget ceiling state from Core.
- Context budget visibility.
- Cache visibility.
- Theme preference state.
- Accessibility preference state.
- Restore diagnostics from Core.

Outputs:

- Save supported preferences.
- Open diagnostics detail.
- Navigate to relevant health or restore screen.

Shared components:

- AppShell.
- ScreenHeader.
- SettingsGroup.
- StatusBadge.
- CostBadge.
- RestoreBadge.
- DetailPanel.
- ErrorNotice.
- PrimaryActionButton.

Navigation entry points:

- Primary navigation: Settings.
- Top navigation settings entry.
- Project Health diagnostic links.

## 28. Validation Strategy

Architecture validation:

- Every M32 screen is represented.
- Every screen defines purpose, inputs, outputs, shared components, and navigation entry points.
- No frontend framework is selected.
- No external UI dependency is approved.
- No implementation code is written by this document.
- UI architecture keeps all business logic inside Levi Core modules.
- UI communicates through a future thin adapter or bridge that calls existing Levi Core workflows.
- UI state does not become a second source of truth.
- Responsive and accessible structure is defined without copying Apple assets or layouts.

Future implementation validation:

- Responsive layout checks for narrow, tablet, and desktop.
- Keyboard navigation smoke checks.
- Accessibility smoke checks.
- Deterministic rendering checks.
- CLI and repository regression checks.
- Confirmation that provider execution, prompt execution, patch execution, validation execution, and repository modification remain behind Levi Core workflows.

## 29. Explicit Non-Goals

This architecture does not:

- Select a frontend framework.
- Approve external UI dependencies.
- Implement `src/ui-bridge.js`.
- Implement `src/ui-server.js`.
- Implement `ui/index.html`.
- Implement `ui/app.js`.
- Implement `ui/styles.css`.
- Add provider setup to the primary workflow.
- Add prompt editing.
- Add exposed patch schemas.
- Add standalone IDE behavior.
- Add autonomous deployment.
- Move Levi Core business logic into UI files.
