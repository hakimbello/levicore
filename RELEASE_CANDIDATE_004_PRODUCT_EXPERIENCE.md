# RC-004 / L4-001 Product Experience, Copilot UI, and Environment Panel

## Milestone Purpose

RC-004 turns the VS Code shell into a cohesive Levi product experience. The interface now centers on a primary Levi Copilot panel and a compact Environment panel while retaining the existing technical TreeViews and virtual documents.

## Product Principles

- Simple surface, powerful runtime underneath
- Plain-language state
- Progressive disclosure
- Visible approval and safety boundaries
- No raw JSON by default
- Technical details on demand
- Offline and local-model friendly
- VS Code-native look and behavior

## Primary User Journeys

- Open Levi and ask what the project needs
- Plan or build through existing agent orchestration
- See what Levi is doing now
- Inspect context and model routing
- Review pending approvals
- Inspect active changes and validation
- Check workflow and multi-agent progress
- Understand whether Git/commit/push are available
- Recover safely after reload without auto-resuming protected work

## Copilot Architecture

`ProductExperienceController` owns the Copilot panel lifecycle and routes panel messages to existing extension methods. Those methods use `LeviApplicationRuntime` commands and existing component boundaries. Composer modes are `Ask`, `Plan`, `Build`, `Fix`, `Review`, and `Teach`; they are presentation presets, not new orchestration engines.

The Copilot header shows Levi state, workspace, model, local/remote routing, privacy, and current mode. The composer supports bounded multiline input, submit, cancel, retry, mode selection, context-scope selection, model selection, current-file attachment, selected-code attachment, keyboard submit/cancel, and disabled-state friendly semantics.

## Environment Panel Architecture

`levi.environment` summarizes Workspace, Git, Changes, Workflow, Agents, Models, Validation, Approvals, Performance, Reliability, Security, and Context from normalized product state. It is a TreeView, so it remains lightweight and consistent with VS Code.

## Normalized Product State

`product-experience-state.js` aggregates the existing presentation cache into a bounded, frontend-safe product model. Internal states map to plain stages: Understanding, Gathering Context, Planning, Preparing Changes, Reviewing, Waiting for Approval, Applying, Testing, Repairing, Complete, Needs Attention, and Cancelled.

## Presentation Adapter

Product presenters convert runtime-shaped state into cards and summaries:

- Approval cards
- Change review
- Workflow timeline
- Multi-agent team
- Model picker
- Git readiness
- Context and evidence
- Onboarding

## Approval-Card Contract

Approval cards show what Levi wants to do, why, exact scope, risk, workspace, branch when known, diff summary, validation plan, rollback availability, expiration, warnings, limitations, and available actions. UI state never grants approval; runtime confirmation through existing approval commands remains required.

## Change-Review Contract

Change review shows proposal summary, file list, operations, additions/deletions, risk indicators, stale status, protected-path warnings, diff navigation, approval/application state, validation result, and revert eligibility.

## Workflow-Timeline Contract

The timeline summarizes stages and expandable evidence without rendering the full workflow dependency graph by default. Technical graph details remain available through existing workflow commands and technical details.

## Model-Picker Contract

The model picker shows provider/model status, local/remote indicators, availability, privacy policy, selection, refresh/test/settings actions, and never exposes credential values.

## Git Presentation Contract

Git presentation uses available source-control/runtime adapter evidence. Commit and push are shown unavailable unless safe approved operations exist. Push must show exact remote and branch when implemented later. Force push remains unavailable.

## Onboarding Flow

Onboarding checks workspace, workspace trust, local model, model selection, Git availability, and safe read-only runtime operation. Cloud configuration is optional.

## Empty States and Errors

No-provider, no-workspace, no-Git, no-approval, no-change, no-workflow, and unavailable capability states are rendered as plain-language unavailable states rather than fake success.

## Accessibility

The Copilot panel includes labels, aria labels, keyboard submit/cancel, screen-reader-only composer labeling, non-color status labels, and reduced-motion CSS handling.

## Webview Security

The Copilot webview uses a restrictive CSP with nonce-based script/style execution. Messages are serialized, bounded, schema checked, and allowlisted. Model output is rendered with text APIs, not arbitrary HTML.

## Configuration

Added:

- `levi.experience.enabled`
- `levi.experience.defaultMode`
- `levi.experience.showAdvancedDetails`
- `levi.experience.compactEnvironment`
- `levi.experience.autoOpenOnFirstRun`
- `levi.experience.showCompletionNotifications`
- `levi.experience.timelineExpanded`
- `levi.experience.preferredPanelLocation`

No setting weakens security, approval, privacy, or workspace trust.

## Persistence

Persistence is limited to compact UI preferences and safe workspace presentation references through VS Code mementos. Credentials, complete source, raw prompts by default, private reasoning, unbounded responses, approval authority, unsafe HTML, and provider payloads are not persisted.

## Recovery

Recovery UX reports interrupted workflows, interrupted protected actions, stale approvals, stale proposals, and preserved state. It requires explicit retry and does not auto-resume mutation, commands, commit, or push.

## Testing Strategy

Automated tests cover product state normalization, plain-language mapping, safe serialization, webview message validation, approval cards, change review, workflow timelines, multi-agent presentation, onboarding, Git unavailable state, webview CSP/accessibility markers, extension activation, product commands, Environment view registration, manifest validation, and full root regression.

## Manual Verification Checklist

Documented for RC-005:

- Launch Extension Development Host
- Complete onboarding
- Connect local Ollama
- Select model
- Open Copilot panel
- Ask project question
- Inspect context
- Use Plan mode
- Use Build mode
- Inspect workflow timeline
- Inspect multi-agent state
- Inspect Environment panel
- Inspect Git state
- Inspect validation state
- Generate change proposal
- Inspect approval card
- Reject
- Regenerate
- Approve
- Apply
- Validate
- Revert
- Reload extension
- Inspect recovery UX
- Test keyboard navigation
- Test screen-reader labels
- Test reduced motion
- Test no-provider empty state
- Test untrusted workspace state
- Verify no credentials, private reasoning, or complete source appears in UI or logs

## Known Limitations

RC-004 is automated product-shell readiness. Live Extension Development Host validation and visual/manual accessibility checks are deferred to RC-005. Commit and push remain unavailable unless future safe approved runtime operations are added.

## Readiness Criteria for RC-005

RC-005 can begin when automated tests, syntax checks, manifest validation, runtime integration, and product command flows pass with no known approval, security, privacy, or persistence regressions.
