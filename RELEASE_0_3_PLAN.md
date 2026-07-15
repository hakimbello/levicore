# M18-004 Release 0.3 Roadmap

Task ID: M18-004

Requirement ID: POST_MVP until approved by the owner

Status: PLANNING ONLY

Scope:

- Roadmap source documents: `COMPETITOR_ANALYSIS.md`, `FEATURE_MATRIX.md`, `BOTTLENECK_ANALYSIS.md`.
- Implementation code modified: none.
- Deliverable file approved by PLAN.md: `RELEASE_0_3_PLAN.md`.

Boundary:

- This roadmap is evidence-backed planning only.
- This roadmap does not change MVP scope or architecture.
- This roadmap does not approve implementation.
- This roadmap does not invent features outside the M18 evidence.
- This roadmap does not propose features that require prompt engineering as the user workflow.
- This roadmap does not propose standalone IDE, autocomplete, team collaboration, marketplace, mobile, voice, cloud sync, or autonomous deployment work.

## Method

Roadmap items are included only when they map to at least one documented competitor bottleneck from `BOTTLENECK_ANALYSIS.md`.

Priority meanings:

- Critical: build first after owner approval because the bottleneck is repeated, high impact, and central to Levi's philosophy.
- High: strong value, but not first-build blocking.
- Medium: useful after core trust and simplicity gaps are handled.
- Low: not a near-term investment, or explicitly rejected because it conflicts with Levi's philosophy.

Engineering effort is a planning estimate only. No implementation design is approved by this document.

## Critical (Build First)

### 1. One-Minute Local-First Model Setup

Problem it solves:

- Provider/model setup complexity.
- Local/offline capability gaps or uncertainty.
- Login/API-key friction.
- Cost predictability pressure from hosted model use.

Evidence supporting it:

- `BOTTLENECK_ANALYSIS.md` Top 10 bottlenecks #1, #2, #6.
- `COMPETITOR_ANALYSIS.md` Cross-Product Findings: most products require sign-in or provider setup; local/offline evidence is strongest for Roo Code and Continue; cost predictability is repeated friction.
- `FEATURE_MATRIX.md` Local Model Support, Offline Capability, Ease Of Setup, and Remote Model Support sections.

Mapped bottleneck:

- Cost predictability and usage-limit pressure.
- Provider/model setup complexity.
- Local/offline capability gaps or uncertainty.
- Login/API-key friction.

User impact: High

Engineering effort: Medium

Competitive value: High

Fits Levi philosophy:

- Apple simplicity: YES
- Local First: YES
- Safety: YES
- Trust: YES
- Low Cost: YES

Priority: Critical

Reason for priority:

- The evidence shows setup, provider choice, local/offline support, and cost are repeated cross-competitor friction points. A simple local-first path directly supports Levi's stated simplicity, local-first, trust, and low-cost philosophy.

### 2. Plain-Language Cost Preview And Budget Guardrails

Problem it solves:

- Users cannot easily predict agent session cost, usage limits, or hosted-model overage.

Evidence supporting it:

- `BOTTLENECK_ANALYSIS.md` Top 10 bottleneck #1.
- `COMPETITOR_ANALYSIS.md` Cursor complaints: pricing and usage-limit confusion from The Verge and Business Insider.
- `COMPETITOR_ANALYSIS.md` Claude Code complaints: heavy-use cost and rate-limit pressure.
- `FEATURE_MATRIX.md` Cost section: Cursor overage, Copilot credits, Cline credits/BYOK, Roo/Continue provider costs, and multiple `UNKNOWN` cost gaps.

Mapped bottleneck:

- Cost predictability and usage-limit pressure.

User impact: High

Engineering effort: Medium

Competitive value: High

Fits Levi philosophy:

- Apple simplicity: YES
- Local First: YES
- Safety: PARTIALLY
- Trust: YES
- Low Cost: YES

Priority: Critical

Reason for priority:

- Cost pressure is one of the strongest repeated findings. Levi already has approved spending and iteration limits, but the evidence supports a user-visible, plain-language cost experience rather than hidden accounting.

### 3. Safe Approval Summary With Low-Friction Review

Problem it solves:

- Approval prompts can create fatigue, but broad auto-approval can enable unsafe actions.

Evidence supporting it:

- `BOTTLENECK_ANALYSIS.md` Top 10 bottlenecks #3 and #4.
- `COMPETITOR_ANALYSIS.md` Claude Code complaints: permission-prompt friction and destructive command risk.
- `COMPETITOR_ANALYSIS.md` Cline complaints: approval fatigue versus YOLO risk.
- `COMPETITOR_ANALYSIS.md` Roo Code complaints: auto-approval and command-execution caution.
- `FEATURE_MATRIX.md` Safety and Approval Workflow sections.

Mapped bottleneck:

- Permission fatigue versus unsafe autonomy.
- Destructive command or unsafe tool execution risk.

User impact: High

Engineering effort: Medium

Competitive value: High

Fits Levi philosophy:

- Apple simplicity: YES
- Local First: NEUTRAL
- Safety: YES
- Trust: YES
- Low Cost: NEUTRAL

Priority: Critical

Reason for priority:

- Levi should not copy YOLO-style autonomy, but the evidence shows repeated friction around excessive prompts. A simpler approval summary can preserve user control while reducing repeated approval noise.

### 4. Low-Overhead Restore Points

Problem it solves:

- Users need recovery from agent edits without expensive or unclear checkpoint systems.

Evidence supporting it:

- `BOTTLENECK_ANALYSIS.md` Top 10 bottleneck #5.
- `COMPETITOR_ANALYSIS.md` Cross-Product Findings: Cline has checkpoints, Codex advises Git checkpoints, Copilot rollback docs exist, Roo uses VS Code undo/experimental checkpoints, and several tools remain `UNKNOWN`.
- `FEATURE_MATRIX.md` Rollback and Performance sections: Cline rollback is strong but checkpoint overhead is documented.

Mapped bottleneck:

- Rollback/checkpoint gaps and overhead.

User impact: High

Engineering effort: High

Competitive value: High

Fits Levi philosophy:

- Apple simplicity: YES
- Local First: YES
- Safety: YES
- Trust: YES
- Low Cost: YES

Priority: Critical

Reason for priority:

- Rollback is a core trust signal in agentic editing. The evidence shows competitors either have incomplete rollback evidence or checkpoint overhead. Levi already records changed files, but dedicated recovery is not an approved MVP capability.

## High Value

### 5. Evidence-Cited Context Preview

Problem it solves:

- Users may not know what project context the assistant is using, which weakens trust and can lead to poor edits.

Evidence supporting it:

- `BOTTLENECK_ANALYSIS.md` Top 10 bottleneck #7.
- `COMPETITOR_ANALYSIS.md` Cross-Product Findings: context management is a major competitive category across Claude Code, Continue, Copilot, Cline, Roo, Cursor, Codex, and Windsurf / Devin Desktop.
- `FEATURE_MATRIX.md` Context Quality and Repository Awareness sections.

Mapped bottleneck:

- Context/indexing performance and overhead.
- Repository awareness uncertainty.

User impact: Medium

Engineering effort: Medium

Competitive value: High

Fits Levi philosophy:

- Apple simplicity: YES
- Local First: YES
- Safety: YES
- Trust: YES
- Low Cost: YES

Priority: High

Reason for priority:

- M18 evidence shows context quality is central to competitor value and friction. A cited context preview aligns with Levi's evidence-before-claims philosophy without requiring users to write prompts.

### 6. Provider Health And Fallback Diagnostics

Problem it solves:

- Users experience provider failures, network issues, model availability limits, and plan gating without clear cause.

Evidence supporting it:

- `BOTTLENECK_ANALYSIS.md` Top 10 bottlenecks #2 and #8.
- `COMPETITOR_ANALYSIS.md` GitHub Copilot complaints: operation issues, network errors, compatibility, slow responses, model availability and plan gating.
- `COMPETITOR_ANALYSIS.md` Roo Code complaints: API key validity, internet connection, provider status.
- `FEATURE_MATRIX.md` Remote Model Support, Performance, Cost, and Ease Of Setup sections.

Mapped bottleneck:

- Provider/model setup complexity.
- Operational reliability, network, and IDE compatibility.
- Model availability and plan gating.

User impact: Medium

Engineering effort: Medium

Competitive value: High

Fits Levi philosophy:

- Apple simplicity: YES
- Local First: YES
- Safety: PARTIALLY
- Trust: YES
- Low Cost: YES

Priority: High

Reason for priority:

- Provider failures are a repeated source of confusion across tools. Diagnostics can keep Levi simple by explaining availability and fallback state without exposing provider complexity to the user.

### 7. Lightweight Context Performance Budget

Problem it solves:

- Repository context, indexing, checkpointing, and large context windows can create latency, storage, or cost overhead.

Evidence supporting it:

- `BOTTLENECK_ANALYSIS.md` Top 10 bottleneck #7.
- `COMPETITOR_ANALYSIS.md` Cross-Product Findings: performance bottlenecks recur around context size, indexing, checkpoint storage, token cost, and model latency.
- `FEATURE_MATRIX.md` Performance section: Copilot indexing timing, Cline checkpoint overhead, Roo initial indexing cost, Continue configurable context length.

Mapped bottleneck:

- Context/indexing performance and overhead.
- Cost predictability and usage-limit pressure.

User impact: Medium

Engineering effort: Medium

Competitive value: Medium

Fits Levi philosophy:

- Apple simplicity: YES
- Local First: YES
- Safety: NEUTRAL
- Trust: YES
- Low Cost: YES

Priority: High

Reason for priority:

- Context is useful only if it remains bounded and understandable. The evidence supports performance budgeting as a trust and cost-control layer, not as extra user configuration.

### 8. Prompt-Free Task Intake

Problem it solves:

- Highly configurable tools can require users to understand provider settings, context files, prompts, modes, or YAML before getting good results.

Evidence supporting it:

- `BOTTLENECK_ANALYSIS.md` Top 10 bottleneck #2 and Continue configuration burden.
- `COMPETITOR_ANALYSIS.md` Continue: config.yaml, providers, context providers, rules, prompts, docs, MCP.
- `COMPETITOR_ANALYSIS.md` Cline and Roo: broad provider/model choice and setup complexity.
- `FEATURE_MATRIX.md` Learning Curve and Ease Of Setup sections.

Mapped bottleneck:

- Provider/model setup complexity.
- Configuration burden.
- Ease-of-setup friction.

User impact: Medium

Engineering effort: Medium

Competitive value: High

Fits Levi philosophy:

- Apple simplicity: YES
- Local First: YES
- Safety: YES
- Trust: YES
- Low Cost: YES

Priority: High

Reason for priority:

- The evidence supports reducing setup and prompt/config burden. This item preserves Levi's command-based workflow and rejects prompt engineering as a primary user skill.

## Future

### 9. Adapter Portability And Exit Report

Problem it solves:

- Users can be stranded by product shutdowns, acquisitions, provider changes, or unavailable model plans.

Evidence supporting it:

- `BOTTLENECK_ANALYSIS.md` Top 10 bottleneck #9.
- `COMPETITOR_ANALYSIS.md` Roo Code important status fact: extension shutdown.
- `COMPETITOR_ANALYSIS.md` Continue important status fact: read-only repository and acquisition.
- `FEATURE_MATRIX.md` Objective Cross-Category Notes: product-continuity caveat for Roo Code and Continue.

Mapped bottleneck:

- Product continuity and maintenance risk.
- Provider/model setup complexity.

User impact: High

Engineering effort: Low

Competitive value: Medium

Fits Levi philosophy:

- Apple simplicity: YES
- Local First: YES
- Safety: NEUTRAL
- Trust: YES
- Low Cost: YES

Priority: Medium

Reason for priority:

- Continuity risk has high impact but appears in fewer products than cost/setup/approval bottlenecks. Levi's adapter architecture already partially addresses it, so this belongs after user-facing trust basics.

### 10. Offline Readiness Check

Problem it solves:

- Many tools have uncertain or missing offline capability, while local/offline evidence is strongest only for Roo Code and Continue.

Evidence supporting it:

- `BOTTLENECK_ANALYSIS.md` Top 10 bottleneck #6.
- `COMPETITOR_ANALYSIS.md` Cross-Product Findings: offline capability exists only where local models and local extension/CLI operation are supported; many products remain `UNKNOWN`.
- `FEATURE_MATRIX.md` Offline Capability and Local Model Support sections.

Mapped bottleneck:

- Local/offline capability gaps or uncertainty.

User impact: Medium

Engineering effort: Low

Competitive value: Medium

Fits Levi philosophy:

- Apple simplicity: YES
- Local First: YES
- Safety: NEUTRAL
- Trust: YES
- Low Cost: YES

Priority: Medium

Reason for priority:

- Offline readiness supports Levi's local-first philosophy, but core setup, budget, approval, and rollback work should come first.

### 11. Reliability Evidence Report

Problem it solves:

- Users need to know whether failures came from Levi, the local environment, network access, or provider limits.

Evidence supporting it:

- `BOTTLENECK_ANALYSIS.md` Top 10 bottleneck #8.
- `COMPETITOR_ANALYSIS.md` GitHub Copilot complaints: operation issues, network/firewall/auth issues, slow responses.
- `COMPETITOR_ANALYSIS.md` Roo Code troubleshooting evidence: provider status, internet connection, API key validity.

Mapped bottleneck:

- Operational reliability, network, and IDE compatibility.
- Provider/API setup and availability.

User impact: Medium

Engineering effort: Medium

Competitive value: Medium

Fits Levi philosophy:

- Apple simplicity: YES
- Local First: YES
- Safety: PARTIALLY
- Trust: YES
- Low Cost: YES

Priority: Medium

Reason for priority:

- Reliability evidence improves trust, but it should follow the more fundamental setup, cost, approval, and rollback experience.

## Explicitly Rejected

These ideas appear in competitors or adjacent competitor surfaces, but conflict with Levi's approved philosophy or MVP non-goals. They are intentionally not roadmap candidates.

### R1. Standalone IDE Parity

Problem it would solve:

- IDE-native competitors offer an all-in-one editing environment.

Evidence supporting it:

- `COMPETITOR_ANALYSIS.md` and `FEATURE_MATRIX.md`: Cursor and Windsurf / Devin Desktop are AI IDEs; Copilot has broad IDE integration.
- `BOTTLENECK_ANALYSIS.md` Bottlenecks not worth solving: building a standalone IDE conflicts with Levi philosophy.

Mapped bottleneck:

- IDE/client compatibility across many editor ecosystems.

User impact: Medium

Engineering effort: High

Competitive value: Medium

Fits Levi philosophy:

- Apple simplicity: NO
- Local First: PARTIALLY
- Safety: PARTIALLY
- Trust: PARTIALLY
- Low Cost: NO

Priority: Low

Reason for priority:

- Explicitly rejected. `PRD.md` and `MVP_SCOPE.md` list standalone IDE as a non-goal/out of scope.

### R2. IDE Autocomplete Parity

Problem it would solve:

- Some competitors offer inline suggestions and tab completion.

Evidence supporting it:

- `COMPETITOR_ANALYSIS.md` Cursor and GitHub Copilot sections.
- `FEATURE_MATRIX.md` Editing Workflow section.
- `BOTTLENECK_ANALYSIS.md` Bottlenecks Levi Does Not Solve: native autocomplete parity.

Mapped bottleneck:

- Native autocomplete parity.

User impact: Medium

Engineering effort: High

Competitive value: Medium

Fits Levi philosophy:

- Apple simplicity: NO
- Local First: PARTIALLY
- Safety: PARTIALLY
- Trust: PARTIALLY
- Low Cost: NO

Priority: Low

Reason for priority:

- Explicitly rejected. `PRD.md` and `MVP_SCOPE.md` list autocomplete as a non-goal/out of scope.

### R3. Fully Autonomous YOLO Execution

Problem it would solve:

- It reduces approval interruptions by allowing broad unattended execution.

Evidence supporting it:

- `COMPETITOR_ANALYSIS.md` Claude Code, Cline, and Roo Code safety/approval evidence.
- `BOTTLENECK_ANALYSIS.md` Bottlenecks not worth solving: fully autonomous YOLO-style execution without approval.

Mapped bottleneck:

- Permission fatigue versus unsafe autonomy.
- Destructive command or unsafe tool execution risk.

User impact: High

Engineering effort: Medium

Competitive value: Medium

Fits Levi philosophy:

- Apple simplicity: PARTIALLY
- Local First: NEUTRAL
- Safety: NO
- Trust: NO
- Low Cost: PARTIALLY

Priority: Low

Reason for priority:

- Explicitly rejected. Levi requires approval, user control, repository boundaries, and destructive-action review.

### R4. Extension Marketplace Parity

Problem it would solve:

- Users could install broad third-party extensions inside Levi.

Evidence supporting it:

- `COMPETITOR_ANALYSIS.md` Cursor marketplace, GitHub/Copilot ecosystem, Windsurf / Devin Desktop extension limitations.
- `BOTTLENECK_ANALYSIS.md` extension ecosystem limitations and marketplace compatibility.

Mapped bottleneck:

- Extension ecosystem limitations and interference.

User impact: Medium

Engineering effort: High

Competitive value: Medium

Fits Levi philosophy:

- Apple simplicity: NO
- Local First: PARTIALLY
- Safety: NO
- Trust: PARTIALLY
- Low Cost: NO

Priority: Low

Reason for priority:

- Explicitly rejected. `MVP_SCOPE.md` lists marketplace integrations as out of scope, and broad extension loading increases complexity and safety risk.

### R5. Autonomous Deployment Parity

Problem it would solve:

- Competitors or IDEs can ship code directly from the assistant environment.

Evidence supporting it:

- `COMPETITOR_ANALYSIS.md` Windsurf / Devin Desktop: one-click app deploys.
- `BOTTLENECK_ANALYSIS.md` Bottlenecks not worth solving: autonomous deployment parity.

Mapped bottleneck:

- Autonomous deployment parity.

User impact: Medium

Engineering effort: High

Competitive value: Medium

Fits Levi philosophy:

- Apple simplicity: PARTIALLY
- Local First: NO
- Safety: NO
- Trust: NO
- Low Cost: NO

Priority: Low

Reason for priority:

- Explicitly rejected. `PRD.md` and `MVP_SCOPE.md` list autonomous deployment as a non-goal/out of scope.

### R6. Team/Enterprise Collaboration Controls

Problem it would solve:

- Enterprise products provide team policy, RBAC, audit, marketplace, and admin controls.

Evidence supporting it:

- `COMPETITOR_ANALYSIS.md` Cursor enterprise controls, GitHub Copilot Business/Enterprise, Cline enterprise features.
- `BOTTLENECK_ANALYSIS.md` Bottlenecks not worth solving: team/enterprise collaboration parity.

Mapped bottleneck:

- Team/enterprise collaboration parity.

User impact: Low

Engineering effort: High

Competitive value: Low

Fits Levi philosophy:

- Apple simplicity: NO
- Local First: PARTIALLY
- Safety: PARTIALLY
- Trust: PARTIALLY
- Low Cost: NO

Priority: Low

Reason for priority:

- Explicitly rejected. Levi's primary user is a solo builder, and team collaboration is out of scope.

### R7. Prompt-Engineering-First Workflow

Problem it would solve:

- Power users could manually configure prompts, rules, context files, and agent behavior in detail.

Evidence supporting it:

- `COMPETITOR_ANALYSIS.md` Continue config/rules/prompts; Claude Code rules/skills; Cline/Roo rules and custom modes.
- `BOTTLENECK_ANALYSIS.md` configuration burden and provider/model setup complexity.

Mapped bottleneck:

- Configuration burden.
- Provider/model setup complexity.

User impact: Medium

Engineering effort: Medium

Competitive value: Low

Fits Levi philosophy:

- Apple simplicity: NO
- Local First: PARTIALLY
- Safety: PARTIALLY
- Trust: PARTIALLY
- Low Cost: PARTIALLY

Priority: Low

Reason for priority:

- Explicitly rejected as a primary workflow. M18 evidence shows configuration burden is a bottleneck; Levi should not make prompt engineering the path to good results.

## Roadmap Summary

Critical roadmap items:

1. One-Minute Local-First Model Setup.
2. Plain-Language Cost Preview And Budget Guardrails.
3. Safe Approval Summary With Low-Friction Review.
4. Low-Overhead Restore Points.

High Value roadmap items:

1. Evidence-Cited Context Preview.
2. Provider Health And Fallback Diagnostics.
3. Lightweight Context Performance Budget.
4. Prompt-Free Task Intake.

Future roadmap items:

1. Adapter Portability And Exit Report.
2. Offline Readiness Check.
3. Reliability Evidence Report.

Explicitly rejected ideas:

1. Standalone IDE parity.
2. IDE autocomplete parity.
3. Fully autonomous YOLO execution.
4. Extension marketplace parity.
5. Autonomous deployment parity.
6. Team/enterprise collaboration controls.
7. Prompt-engineering-first workflow.

## Validation Plan

Required validation after file creation:

- `git diff --check`
- `git status --short`

# M18-005 Release Approval Review

Task ID: M18-005

Requirement ID: POST_MVP until approved by the owner

Status: PLANNING AND REVIEW ONLY

Scope:

- Documents reviewed: `COMPETITOR_ANALYSIS.md`, `FEATURE_MATRIX.md`, `BOTTLENECK_ANALYSIS.md`, `RELEASE_0_3_PLAN.md`.
- Implementation code modified: none.
- Review basis: Levi philosophy from `LEVI_CONSTITUTION.md`, `PRD.md`, `ARCHITECTURE.md`, `PLAN.md`, and M18 evidence documents.

Review rule:

- `APPROVED` means the item can remain in Release 0.3 planning as written.
- `APPROVED_WITH_CHANGES` means the item is evidence-backed but must be narrowed before implementation planning.
- `REJECTED` means the item conflicts with Levi philosophy, architecture, or scope discipline.

## Roadmap Item Review

| Item | Outcome | Bottleneck mapping | Evidence support | User problem | Philosophy / architecture review | Required change or disposition |
|---|---|---|---|---|---|---|
| One-Minute Local-First Model Setup | APPROVED_WITH_CHANGES | Cost predictability; provider/model setup; local/offline gaps; login/API-key friction. | M18-001 Cross-Product Findings; M18-002 Local Model Support, Offline Capability, Ease Of Setup; M18-003 Top 10 #1, #2, #6. | Users face provider choice, credential setup, and hosted-cost friction. | Preserves Apple simplicity, Local First, Trust, and Low Cost. Must not duplicate Phase 2 provider implementation tasks already listed in PLAN.md. | Narrow to setup UX/readiness flow only; do not reimplement provider adapters already covered by M11/M12. |
| Plain-Language Cost Preview And Budget Guardrails | APPROVED_WITH_CHANGES | Cost predictability and usage-limit pressure. | M18-001 Cursor/Claude/Cline cost evidence; M18-002 Cost; M18-003 Top 10 #1. | Users need to understand likely cost before running agent work. | Strong fit for Trust and Low Cost. Levi already has spending/iteration limit requirements, so this must not duplicate Model Gateway accounting. | Narrow to user-visible explanation and preview of existing cost metadata/limits; no new billing system. |
| Safe Approval Summary With Low-Friction Review | APPROVED_WITH_CHANGES | Permission fatigue versus unsafe autonomy; destructive command risk. | M18-001 Claude/Cline/Roo approval evidence; M18-002 Safety and Approval Workflow; M18-003 Top 10 #3, #4. | Users need fewer repetitive prompts without surrendering control. | Strong fit for Apple simplicity, Safety, and Trust. Must not weaken approved explicit approval rules. | Narrow to summarizing planned actions and approvals; no YOLO/bypass mode. |
| Low-Overhead Restore Points | APPROVED | Rollback/checkpoint gaps and overhead. | M18-001 rollback findings; M18-002 Rollback and Performance; M18-003 Top 10 #5. | Users need reliable recovery from agent edits. | Strong fit for Safety, Trust, Local First, and Low Cost. Does not duplicate current MVP because dedicated restore is not approved MVP scope. | Keep for Release 0.3 planning. |
| Evidence-Cited Context Preview | APPROVED_WITH_CHANGES | Context/indexing performance; repository awareness uncertainty. | M18-001 context findings; M18-002 Context Quality and Repository Awareness; M18-003 Top 10 #7. | Users need to trust what context the assistant will use. | Strong fit for evidence-before-claims and Trust. Must not duplicate existing context-builder/prompt-engine internals. | Narrow to a human-readable preview of already selected cited context; no prompt engineering UI. |
| Provider Health And Fallback Diagnostics | APPROVED_WITH_CHANGES | Provider/model setup; operational reliability; model availability and plan gating. | M18-001 Copilot/Roo reliability evidence; M18-002 Remote Model Support, Performance, Cost, Ease Of Setup; M18-003 Top 10 #2, #8. | Users need clear failure reasons when providers or fallback paths fail. | Fits Apple simplicity and Trust if it explains, not exposes, provider complexity. Must not duplicate M17-FIX-001 fallback execution. | Narrow to diagnostics/reporting around provider health and existing fallback behavior; do not add new routing architecture. |
| Lightweight Context Performance Budget | APPROVED_WITH_CHANGES | Context/indexing overhead; cost predictability. | M18-001 performance findings; M18-002 Performance; M18-003 Top 10 #7. | Users need bounded context that does not silently become slow or expensive. | Fits Apple simplicity and Low Cost only if automatic. | Make automatic/default; avoid user-facing knobs unless absolutely required. |
| Prompt-Free Task Intake | APPROVED | Provider/model setup complexity; configuration burden; ease-of-setup friction. | M18-001 Continue/Cline/Roo setup evidence; M18-002 Learning Curve and Ease Of Setup; M18-003 configuration burden. | Users should not need prompt engineering or YAML configuration to get useful work. | Strong fit for Apple simplicity and Trust. Does not conflict with CLI architecture if implemented through existing workflow boundaries. | Keep for Release 0.3 planning. |
| Adapter Portability And Exit Report | APPROVED | Product continuity and maintenance risk; provider/model setup complexity. | M18-001 Roo shutdown and Continue read-only/acquisition evidence; M18-002 continuity caveat; M18-003 Top 10 #9. | Users need confidence they are not trapped by providers or abandoned tools. | Fits Trust, Local First, Low Cost, and adapter architecture. | Keep as future backlog item. |
| Offline Readiness Check | APPROVED_WITH_CHANGES | Local/offline capability gaps or uncertainty. | M18-001 offline findings; M18-002 Offline Capability and Local Model Support; M18-003 Top 10 #6. | Users need to know whether a task can run without remote model access. | Fits Local First and Trust. Must not duplicate local provider implementation. | Narrow to readiness check/reporting; provider support remains owned by existing provider tasks. |
| Reliability Evidence Report | APPROVED | Operational reliability, network, and provider availability. | M18-001 Copilot operation issues and Roo troubleshooting evidence; M18-003 Top 10 #8. | Users need failures attributed to Levi, environment, network, or provider limits. | Fits Trust and evidence-before-claims. Compatible with CLI/reporting architecture. | Keep as future backlog item. |
| Standalone IDE Parity | REJECTED | IDE/client compatibility across many editor ecosystems. | M18-001 Cursor/Windsurf IDE evidence; M18-003 not-worth-solving section. | Would address IDE-native convenience. | Conflicts with PRD and MVP_SCOPE non-goal: standalone IDE. High complexity and scope expansion. | Keep explicitly rejected. |
| IDE Autocomplete Parity | REJECTED | Native autocomplete parity. | M18-001 Cursor/Copilot autocomplete evidence; M18-003 Bottlenecks Levi Does Not Solve. | Would address inline suggestion parity. | Conflicts with PRD and MVP_SCOPE non-goal: autocomplete. | Keep explicitly rejected. |
| Fully Autonomous YOLO Execution | REJECTED | Permission fatigue versus unsafe autonomy; destructive command risk. | M18-001 Claude/Cline/Roo safety evidence; M18-003 not-worth-solving section. | Would reduce approval interruptions. | Conflicts with Levi user control, approval, trust boundaries, and safety philosophy. | Keep explicitly rejected; do not implement bypass/YOLO mode. |
| Extension Marketplace Parity | REJECTED | Extension ecosystem limitations and interference. | M18-001 Cursor/Copilot ecosystem and Windsurf extension evidence; M18-003 extension marketplace bottleneck. | Would provide broad extension ecosystem. | Conflicts with MVP_SCOPE marketplace non-goal and increases safety/configuration complexity. | Keep explicitly rejected. |
| Autonomous Deployment Parity | REJECTED | Autonomous deployment parity. | M18-001 Windsurf / Devin Desktop one-click deploy evidence; M18-003 not-worth-solving section. | Would ship code directly from assistant environment. | Conflicts with PRD and MVP_SCOPE autonomous deployment non-goal and safety philosophy. | Keep explicitly rejected. |
| Team/Enterprise Collaboration Controls | REJECTED | Team/enterprise collaboration parity. | M18-001 Cursor/Copilot/Cline enterprise evidence; M18-003 not-worth-solving section. | Would support teams and enterprise admins. | Conflicts with solo-builder focus and team collaboration non-goal. | Keep explicitly rejected. |
| Prompt-Engineering-First Workflow | REJECTED | Configuration burden; provider/model setup complexity. | M18-001 Continue/Claude/Cline/Roo prompt/rule/config evidence; M18-003 configuration burden. | Would serve power users who want manual prompt/config control. | Conflicts with Apple simplicity and the documented configuration-burden bottleneck. | Keep explicitly rejected as a primary workflow. |

## Final Release 0.3 Scope

Approved for owner consideration after required narrowing:

1. One-Minute Local-First Model Setup, narrowed to setup UX/readiness only.
2. Plain-Language Cost Preview And Budget Guardrails, narrowed to user-visible explanation of existing cost metadata and limits.
3. Safe Approval Summary With Low-Friction Review, narrowed to safer summaries without YOLO/bypass behavior.
4. Low-Overhead Restore Points.
5. Evidence-Cited Context Preview, narrowed to previewing already selected cited context.
6. Provider Health And Fallback Diagnostics, narrowed to diagnostics around existing routing/fallback behavior.
7. Lightweight Context Performance Budget, automatic by default.
8. Prompt-Free Task Intake.

Owner approval recommendation:

- APPROVE_WITH_CHANGES.

Reason:

- The roadmap is evidence-backed and aligned with Levi's philosophy, but several items must be narrowed to avoid duplicating Phase 2 provider/context/fallback work and to preserve Apple simplicity.

## Deferred Backlog

1. Adapter Portability And Exit Report.
2. Offline Readiness Check, narrowed to readiness/reporting rather than provider implementation.
3. Reliability Evidence Report.

Reason for deferral:

- These items are evidence-backed and philosophy-aligned, but they are less urgent than setup, cost, approval, rollback, and context trust.

## Explicitly Rejected Ideas

1. Standalone IDE parity.
2. IDE autocomplete parity.
3. Fully autonomous YOLO execution.
4. Extension marketplace parity.
5. Autonomous deployment parity.
6. Team/enterprise collaboration controls.
7. Prompt-engineering-first workflow.

Recommended disposition:

- Keep rejected unless owner explicitly changes PRD, MVP_SCOPE, ARCHITECTURE, and PLAN after MVP completion.

## Risks

| Risk | Evidence | Impact | Mitigation before implementation |
|---|---|---|---|
| Scope creep into IDE/autocomplete/marketplace behavior | Competitors implement IDE, autocomplete, and extension ecosystems; Levi docs mark these non-goals. | High | Keep rejected items explicitly out of scope in each implementation plan. |
| Duplicate Phase 2 provider/context/fallback work | PLAN.md already contains provider, context, prompt, pipeline, safe patch, and fallback tasks. | Medium | Each Release 0.3 task must state which existing module it extends and which work it must not duplicate. |
| Configuration burden sneaks back in | Continue/Cline/Roo evidence shows setup/config complexity as a bottleneck. | High | Require default-first UX and reject prompt-engineering-first or YAML-first workflows. |
| Safety weakened by prompt-fatigue fixes | Claude/Cline/Roo evidence shows auto/bypass modes can create risk. | High | Keep explicit approvals for destructive and irreversible actions. |
| Cost preview overclaims precision | M18 evidence includes provider cost uncertainty and plan changes. | Medium | Present estimates as cost classes/ranges and mark unknown provider costs as UNKNOWN. |
| Restore points add performance overhead | Cline evidence shows checkpoints can slow large repositories. | Medium | Require low-overhead design validation before implementation approval. |

## Success Metrics

These are planning metrics for owner review, not implementation acceptance criteria.

| Metric | Target |
|---|---|
| Setup simplicity | A new user can reach a usable local-first model path without learning provider internals or prompt engineering. |
| Cost trust | A task plan shows plain-language cost class, budget guardrail, and UNKNOWN cost gaps before execution. |
| Approval clarity | User can approve a concise action summary while destructive/irreversible actions still require explicit approval. |
| Restore trust | User can identify and restore from the most recent Levi-managed edit boundary without unrelated file loss. |
| Context trust | User can see the cited project context Levi will use before model execution. |
| Local-first confidence | Levi can report whether a task is ready for local/offline execution or why it is not. |
| Scope discipline | No Release 0.3 item modifies MVP non-goals, standalone IDE scope, autocomplete scope, marketplace scope, or autonomous deployment scope. |

## Exit Criteria Before Implementation Begins

1. Owner approves the M18 planning documents.
2. Each approved Release 0.3 item is converted into a separate PLAN.md task before implementation.
3. Each task maps to documented M18 evidence and at least one competitor bottleneck.
4. Each task lists exact expected files and validation commands.
5. Each task states what it must not duplicate from existing Phase 2 work.
6. Each task preserves CLI-first architecture and Levi-owned interfaces.
7. Each task explicitly excludes prompt-engineering-first workflows, YOLO execution, IDE parity, autocomplete, marketplace, and autonomous deployment.
8. Any external dependency receives OSS evaluation before integration.
9. No implementation begins until the task-specific plan is approved.

## M18-005 Validation Plan

Required validation after review:

- `git diff --check`
- `git status --short`
