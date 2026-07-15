# M18-003 Bottleneck Analysis

Task ID: M18-003

Requirement ID: POST_MVP until approved by the owner

Status: PLANNING AND ANALYSIS ONLY

Scope:

- Products analyzed: Cursor, Claude Code, OpenAI Codex, GitHub Copilot, Cline, Roo Code, Continue, Windsurf / Devin Desktop.
- Evidence sources: `COMPETITOR_ANALYSIS.md`, `FEATURE_MATRIX.md`, and approved Levi source-of-truth documents.
- Implementation code modified: none.
- Deliverable file approved by PLAN.md: `BOTTLENECK_ANALYSIS.md`.

Boundary:

- This document identifies evidence-supported bottlenecks only.
- This document does not recommend implementation.
- This document does not prioritize features.
- This document does not rank products.
- `UNKNOWN` means the reviewed evidence does not support a reliable conclusion.

## Evidence Sources

- `COMPETITOR_ANALYSIS.md`: M18-001 product research, source index, verified facts, complaints, requested improvements, and evidence gaps.
- `FEATURE_MATRIX.md`: M18-002 objective matrix by product and category.
- `PRD.md`: Levi product problem, goals, constraints, and non-goals.
- `MVP_SCOPE.md`: approved MVP requirement coverage.
- `ARCHITECTURE.md`: Levi design principles, trust boundaries, adapter rule, task state machine, and module responsibilities.
- `PLAN.md`: M18-003 approved deliverable and acceptance criteria.

## Method

Frequency:

- High: repeated across four or more products, or supported by a study/report as a common problem.
- Medium: appears in two or three products, or is documented as an important product limitation or warning.
- Low: appears in one product or one incident/report.
- UNKNOWN: evidence is insufficient.

User impact:

- High: can block work, create unsafe/destructive outcomes, create major cost surprises, or undermine project trust.
- Medium: creates repeated friction, setup burden, delay, or unclear operation.
- Low: creates localized friction but is unlikely to block most users.
- UNKNOWN: impact is not supported by reviewed evidence.

Levi already solves it:

- YES: approved Levi scope directly addresses the bottleneck at the workflow/policy level.
- PARTIALLY: approved Levi scope addresses part of the bottleneck, or only addresses it through a principle/interface but not a complete user-visible solution.
- NO: approved Levi scope does not address the bottleneck, or the requested solution would be out of scope.

Important limitation:

- Levi coverage is evaluated against approved documents, not new implementation validation. No implementation behavior was tested for this planning task.

## Individual Competitor Bottlenecks

### Cursor

Facts from evidence:

- M18-001 records pricing and usage-limit confusion from The Verge and Business Insider.
- M18-001 and M18-002 mark Cursor approval workflow, rollback, local model support, offline support, and detailed context mechanics as `UNKNOWN`.
- Cursor advertises codebase understanding, agents, CLI, cloud agents, and enterprise controls.

| Bottleneck | Description | Evidence source | Frequency | User impact | Root cause | Existing competitor solution | Levi already solves it | Confidence |
|---|---|---|---|---|---|---|---|---|
| Cost predictability | Users may struggle to predict usage-based spending and overage from agent work. | `COMPETITOR_ANALYSIS.md` Cursor complaints; `FEATURE_MATRIX.md` Cost; The Verge and Business Insider sources cited in M18-001. | Medium | High | Hosted model inference costs are exposed through plan limits and usage-based billing. | Cursor has public tiers and overage controls, but M18-001 evidence shows communication/limit confusion. | PARTIALLY | High |
| Approval and rollback transparency | Reviewed evidence did not verify a detailed user approval workflow or rollback/checkpoint workflow. | `COMPETITOR_ANALYSIS.md` Cursor verified facts and evidence gaps; `FEATURE_MATRIX.md` Approval Workflow and Rollback. | UNKNOWN | Medium | Public docs reviewed did not expose enough safety recovery mechanics. | Enterprise auto-run controls and access controls are documented; detailed user rollback remains `UNKNOWN`. | PARTIALLY | Medium |
| Local/offline uncertainty | Reviewed evidence did not verify local model or offline model inference support. | `COMPETITOR_ANALYSIS.md` Cursor verified facts; `FEATURE_MATRIX.md` Local Model Support and Offline Capability. | UNKNOWN | Medium | Product evidence centers hosted IDE/agent usage and remote model providers. | `UNKNOWN`. | PARTIALLY | Medium |

Interpretation, not recommendation:

- Cursor's strongest evidenced bottleneck is cost predictability. Other Cursor bottlenecks are mostly evidence gaps, not proven complaint frequency.

### Claude Code

Facts from evidence:

- M18-001 cites Claude Code docs, TechRadar, Tom's Hardware, and Business Insider.
- Claude Code documents permission modes, auto mode, bypass mode warnings, context compaction, memory, rules, skills, and protected categories.
- External evidence includes permission-prompt friction, high-use cost pressure, and a destructive infrastructure incident.

| Bottleneck | Description | Evidence source | Frequency | User impact | Root cause | Existing competitor solution | Levi already solves it | Confidence |
|---|---|---|---|---|---|---|---|---|
| Permission fatigue | Users can be interrupted by routine permission prompts during agent work. | `COMPETITOR_ANALYSIS.md` Claude Code complaints; Claude Code permission docs; TechRadar source cited in M18-001. | Medium | Medium | Safety-first approval prompts pause agent execution. | Auto mode, accept-edits mode, dontAsk, and bypass modes reduce prompts. | PARTIALLY | High |
| Unsafe autonomy risk | Broad permissions can enable destructive commands or infrastructure changes. | `COMPETITOR_ANALYSIS.md` Claude Code complaints; Tom's Hardware incident; Claude Code bypass/protected command docs. | Low | High | Agent command authority can exceed safe review boundaries. | Protected paths, deny/ask rules, plan mode, classifier-based auto mode, and bypass warnings. | YES | High |
| Cost and rate-limit pressure | Heavy or parallel Claude Code use can create high inference costs and rate-limit pressure. | `COMPETITOR_ANALYSIS.md` Claude Code complaints; Business Insider source cited in M18-001. | Medium | High | Remote model usage accumulates through long-running agent sessions. | Subscription/API access paths and rate limits. | PARTIALLY | High |
| Rollback gap | Dedicated rollback/checkpoint capability was not verified from reviewed docs. | `COMPETITOR_ANALYSIS.md` Claude Code verified facts and evidence gaps; `FEATURE_MATRIX.md` Rollback. | UNKNOWN | Medium | Reviewed evidence shows Git workflows but not dedicated restore. | Ordinary Git workflows. | PARTIALLY | Medium |

Interpretation, not recommendation:

- Claude Code shows the clearest evidence of the autonomy/safety tradeoff: prompts can slow work, while weaker approval boundaries can create severe harm.

### OpenAI Codex

Facts from evidence:

- M18-001 records Codex CLI installation, sign-in, slash commands, local repository inspection, permissions, sandboxing, and Git checkpoint guidance.
- M18-001 marks public complaint patterns, exact cost, local model support, and offline support as `UNKNOWN`.

| Bottleneck | Description | Evidence source | Frequency | User impact | Root cause | Existing competitor solution | Levi already solves it | Confidence |
|---|---|---|---|---|---|---|---|---|
| Cost transparency gap | Exact Codex cost from reviewed Codex docs was not verified. | `COMPETITOR_ANALYSIS.md` OpenAI Codex cost and evidence gaps; `FEATURE_MATRIX.md` Cost. | UNKNOWN | Medium | Reviewed docs tied usage to OpenAI/ChatGPT/API plans without fully extracted task-level cost detail. | OpenAI/ChatGPT/API plan structure. | PARTIALLY | Medium |
| Local/offline uncertainty | Reviewed evidence did not verify local model inference or offline operation. | `COMPETITOR_ANALYSIS.md` OpenAI Codex verified facts and evidence gaps; `FEATURE_MATRIX.md` Local Model Support and Offline Capability. | UNKNOWN | Medium | Evidence centers OpenAI-hosted model usage. | `UNKNOWN`. | PARTIALLY | Medium |
| Rollback detail gap | Codex advises Git checkpoints, but built-in rollback details were not verified. | `COMPETITOR_ANALYSIS.md` OpenAI Codex rollback; `FEATURE_MATRIX.md` Rollback. | UNKNOWN | Medium | Recovery relies on Git discipline in reviewed evidence. | Git checkpoints before and after tasks. | PARTIALLY | Medium |
| Public complaint evidence gap | M18-001 did not collect enough current Codex-specific public complaint evidence. | `COMPETITOR_ANALYSIS.md` OpenAI Codex complaints and requested improvements. | UNKNOWN | UNKNOWN | Evidence was stronger for capabilities than complaint patterns. | `UNKNOWN`. | UNKNOWN | High |

Interpretation, not recommendation:

- Codex has strong documented controls, but M18-001 evidence was not enough to quantify user bottleneck frequency.

### GitHub Copilot

Facts from evidence:

- M18-001 cites GitHub docs and a Copilot user-problem study covering 473 GitHub issues, 706 GitHub discussions, and 142 Stack Overflow posts.
- The study found operation issues and compatibility issues were the most common problems.
- GitHub docs include repository indexing, supported models, AI credits, cloud/local sandboxes, content filters, and troubleshooting topics.

| Bottleneck | Description | Evidence source | Frequency | User impact | Root cause | Existing competitor solution | Levi already solves it | Confidence |
|---|---|---|---|---|---|---|---|---|
| Operational reliability | Users encounter internal errors, network errors, and slow responses. | `COMPETITOR_ANALYSIS.md` GitHub Copilot complaints; Copilot study; GitHub troubleshooting docs cited in M18-001. | High | Medium | Hosted service, network, IDE, and extension dependencies. | Troubleshooting docs, logs, firewall guidance, and model/client controls. | PARTIALLY | High |
| IDE/client compatibility | Compatibility issues occur across editor/IDE environments. | `COMPETITOR_ANALYSIS.md` GitHub Copilot complaints; Copilot study. | High | Medium | Broad client support creates client/version variability. | Supported IDE docs and troubleshooting. | NO | High |
| Model availability and plan gating | Model availability depends on plan and client and can change. | `COMPETITOR_ANALYSIS.md` GitHub Copilot verified facts; `FEATURE_MATRIX.md` Remote Model Support and Cost. | Medium | Medium | Hosted model catalog is controlled by plan, client, and policy. | Plan-based model access, AI credits, enterprise controls. | PARTIALLY | High |
| Repository indexing delay | Initial indexing can take up to 60 seconds for large repositories. | `COMPETITOR_ANALYSIS.md` GitHub Copilot performance; `FEATURE_MATRIX.md` Performance. | Low | Low | Semantic index creation has startup cost. | Repository indexing and semantic code search. | PARTIALLY | High |

Interpretation, not recommendation:

- Copilot's broad platform integration creates many access points, but also increases the surface for compatibility and policy friction.

### Cline

Facts from evidence:

- M18-001 cites Cline install, provider, Plan/Act, checkpoints, and Auto Approve docs.
- Cline documents provider setup, local runtimes, BYOK, pay-as-you-go credits, ClinePass, explicit approvals, Auto Approve, YOLO mode warnings, `.clineignore`, and checkpoints.

| Bottleneck | Description | Evidence source | Frequency | User impact | Root cause | Existing competitor solution | Levi already solves it | Confidence |
|---|---|---|---|---|---|---|---|---|
| Provider/model setup complexity | Users must choose among Cline provider, BYOK, local runtimes, and many models. | `COMPETITOR_ANALYSIS.md` Cline complaints; `FEATURE_MATRIX.md` Installation, Learning Curve, Remote Model Support. | Medium | Medium | Power-user flexibility creates onboarding choices. | Cline provider, free model options, ClinePass, BYOK, local runtime docs. | PARTIALLY | High |
| Cost and token management | Pay-as-you-go/provider usage requires users to understand model spend. | `COMPETITOR_ANALYSIS.md` Cline complaints; `FEATURE_MATRIX.md` Cost. | Medium | Medium | Remote and BYOK models bill by provider or credits. | Credits, ClinePass, free model options, BYOK. | PARTIALLY | High |
| Approval fatigue versus YOLO risk | Default approvals slow work; YOLO can approve risky actions automatically. | `COMPETITOR_ANALYSIS.md` Cline complaints; Cline Auto Approve docs cited in M18-001; `FEATURE_MATRIX.md` Safety and Approval Workflow. | Medium | High | Tool-using agents need human control, but frequent prompts create friction. | Auto Approve, YOLO, Plan/Act, `.clineignore`. | PARTIALLY | High |
| Checkpoint overhead | Checkpoints may use significant storage and slow very large repositories. | `COMPETITOR_ANALYSIS.md` Cline performance; `FEATURE_MATRIX.md` Rollback and Performance. | Low | Medium | Shadow Git snapshots after tool use create overhead. | Checkpoints with restore options. | NO | High |

Interpretation, not recommendation:

- Cline exposes many controls openly, which helps power users but increases setup, model, approval, and cost decisions.

### Roo Code

Facts from evidence:

- M18-001 cites Roo docs, FAQ, provider docs, and VS Marketplace listing.
- Roo supports local models, many remote providers, codebase indexing with embeddings/Qdrant, per-tool approval, VS Code undo, and experimental checkpoints.
- M18-001 records that the Roo Code Extension was shut down on May 15, 2026.

| Bottleneck | Description | Evidence source | Frequency | User impact | Root cause | Existing competitor solution | Levi already solves it | Confidence |
|---|---|---|---|---|---|---|---|---|
| Product continuity | The Roo Code Extension was officially shut down. | `COMPETITOR_ANALYSIS.md` Roo Code important status fact; `FEATURE_MATRIX.md` Installation and Continuity notes. | Low | High | Product/project lifecycle changed. | Docs point users to alternatives. | PARTIALLY | High |
| Provider/API setup and availability | FAQ troubleshooting includes API key validity, internet connection, and provider status. | `COMPETITOR_ANALYSIS.md` Roo Code complaints; Roo FAQ cited in M18-001. | Medium | Medium | Many external providers create credential and availability dependencies. | Provider docs and local model options. | PARTIALLY | High |
| Extension/editor interference | FAQ mentions unwanted changes and markdown write failures caused by interfering extensions/settings. | `COMPETITOR_ANALYSIS.md` Roo Code complaints; Roo FAQ cited in M18-001. | Low | Medium | Runs inside VS Code extension environment where other extensions/settings can interfere. | Troubleshooting guidance; VS Code undo. | NO | High |
| Indexing cost/overhead | Codebase indexing has an initial expensive step and requires OpenAI API key/Qdrant. | `COMPETITOR_ANALYSIS.md` Roo Code performance and cost; `FEATURE_MATRIX.md` Performance and Repository Awareness. | Low | Medium | Semantic indexing depends on embeddings and storage. | Incremental updates after initial indexing. | PARTIALLY | High |
| Auto-approval/command risk | Roo warns users to be cautious with command execution and auto-approval. | `COMPETITOR_ANALYSIS.md` Roo Code complaints; `FEATURE_MATRIX.md` Safety and Approval Workflow. | Medium | High | Agent tool access can execute shell commands or make unwanted changes. | Per-tool approval by default; auto-approval optional. | YES | High |

Interpretation, not recommendation:

- Roo is strong evidence for local/offline agent design, but its shutdown status turns product continuity into the dominant bottleneck.

### Continue

Facts from evidence:

- M18-001 cites Continue docs, CLI docs, configuration docs, permissions docs, repository status, and acquisition page.
- Continue supports CLI, VS Code, JetBrains, config.yaml, context providers, local/Ollama/self-hosted models, tool permissions, TUI/headless modes, and final-release changes.
- M18-001 records that the repository is no longer actively maintained and is read-only.

| Bottleneck | Description | Evidence source | Frequency | User impact | Root cause | Existing competitor solution | Levi already solves it | Confidence |
|---|---|---|---|---|---|---|---|---|
| Product continuity | Continue's repository is read-only and no longer actively maintained after acquisition/final release. | `COMPETITOR_ANALYSIS.md` Continue important status fact; `FEATURE_MATRIX.md` Product-continuity caveat. | Low | High | Product ownership and maintenance status changed. | Final 2.0.0 release. | PARTIALLY | High |
| Configuration burden | Users may need config.yaml, API keys, providers, context providers, rules, prompts, and MCP setup. | `COMPETITOR_ANALYSIS.md` Continue facts and complaints; `FEATURE_MATRIX.md` Learning Curve and Context Quality. | Medium | Medium | High configurability requires explicit setup choices. | Config reference, local YAML, login/API key first-run paths. | PARTIALLY | High |
| Automation approval limitation | Headless mode excludes ask tools because no user can approve. | `COMPETITOR_ANALYSIS.md` Continue complaints; Continue tool permissions docs cited in M18-001; `FEATURE_MATRIX.md` Approval Workflow. | Low | Medium | Non-interactive automation cannot pause for approval. | `--auto`, `--readonly`, allow/ask/exclude permissions. | PARTIALLY | High |
| Authentication and telemetry concerns | Final release removed anonymous telemetry and authentication, indicating prior friction. | `COMPETITOR_ANALYSIS.md` Continue complaints/requested improvements. | Low | Medium | Product design previously included auth/telemetry paths. | Final release removed telemetry/auth and fixed bugs. | PARTIALLY | Medium |

Interpretation, not recommendation:

- Continue is useful evidence for configurable local-first design, but active maintenance status is a hard constraint on future use.

### Windsurf / Devin Desktop

Facts from evidence:

- M18-001 records that Windsurf docs redirect to Devin Desktop docs.
- Devin Desktop docs cover desktop install, onboarding, login/API-key fallback, settings import, local folders, remote SSH, dev containers, agent panel, terminal, browser previews, AI commit messages, one-click deploys, MCP, and extension limitations.
- M18-001 marks pricing, approval workflow, rollback, safety controls, model/provider list, local model support, and offline behavior as `UNKNOWN`.

| Bottleneck | Description | Evidence source | Frequency | User impact | Root cause | Existing competitor solution | Levi already solves it | Confidence |
|---|---|---|---|---|---|---|---|---|
| Login/API-key friction | User must log in; manual API-key login may be needed if normal login fails. | `COMPETITOR_ANALYSIS.md` Windsurf / Devin Desktop complaints; `FEATURE_MATRIX.md` Installation and Ease Of Setup. | Low | Medium | Desktop agent uses account/API-key access. | Manual API-key login fallback. | PARTIALLY | High |
| Extension ecosystem limitation | Users cannot install extensions through any marketplace; some extensions are incompatible. | `COMPETITOR_ANALYSIS.md` Windsurf / Devin Desktop complaints; `FEATURE_MATRIX.md` Extensibility. | Low | Medium | Controlled IDE environment limits extension compatibility. | MCP support exists. | NO | High |
| Safety/approval/rollback transparency gap | Reviewed docs did not expose detailed approval, safety, or rollback controls. | `COMPETITOR_ANALYSIS.md` Windsurf / Devin Desktop evidence gaps; `FEATURE_MATRIX.md` Safety, Approval Workflow, Rollback. | UNKNOWN | Medium | Public docs reviewed did not provide enough control/recovery detail. | `UNKNOWN`. | PARTIALLY | Medium |
| Pricing/model transparency gap | Docs mention credits/usage and model settings, but specific pricing/provider details were not extracted. | `COMPETITOR_ANALYSIS.md` Windsurf / Devin Desktop cost and model facts; `FEATURE_MATRIX.md` Cost and Remote Model Support. | UNKNOWN | Medium | Reviewed evidence did not establish clear cost/provider model. | `UNKNOWN`. | PARTIALLY | Medium |

Interpretation, not recommendation:

- Windsurf / Devin Desktop evidence is the least complete for safety, rollback, pricing, and provider details; the strongest verified bottleneck is extension compatibility.

## Top 10 Cross-Competitor Bottlenecks

This list is not a feature priority order. It is a cross-competitor evidence synthesis ordered by repeated evidence, impact, and confidence.

| # | Bottleneck | Competitors with evidence | Evidence source | Frequency | User impact | Levi already solves it | Confidence |
|---|---|---|---|---|---|---|---|
| 1 | Cost predictability and usage-limit pressure | Cursor, Claude Code, GitHub Copilot, Cline, Roo Code, Continue, Windsurf / Devin Desktop | M18-001 Cross-Product Findings; product cost sections; M18-002 Cost | High | High | PARTIALLY | High |
| 2 | Provider/model setup complexity | Cline, Roo Code, Continue, GitHub Copilot, Windsurf / Devin Desktop, Claude Code | M18-001 Cross-Product Findings; M18-002 Remote Model Support and Ease Of Setup | High | Medium | PARTIALLY | High |
| 3 | Permission fatigue versus unsafe autonomy | Claude Code, Cline, Roo Code, Continue, OpenAI Codex | M18-001 Cross-Product Findings; product approval/safety sections; M18-002 Safety and Approval Workflow | High | High | PARTIALLY | High |
| 4 | Destructive command or unsafe tool execution risk | Claude Code, Cline, Roo Code, OpenAI Codex, GitHub Copilot | M18-001 safety sections; Tom's Hardware incident cited in M18-001; M18-002 Safety | Medium | High | YES | High |
| 5 | Rollback/checkpoint gaps and overhead | Cursor, Claude Code, OpenAI Codex, GitHub Copilot, Cline, Roo Code, Continue, Windsurf / Devin Desktop | M18-001 Cross-Product Findings; M18-002 Rollback | High | Medium | PARTIALLY | High |
| 6 | Local/offline capability gaps or uncertainty | Cursor, Claude Code, OpenAI Codex, GitHub Copilot, Cline, Windsurf / Devin Desktop | M18-001 Cross-Product Findings; M18-002 Local Model Support and Offline Capability | High | Medium | PARTIALLY | High |
| 7 | Context/indexing performance and overhead | Claude Code, GitHub Copilot, Cline, Roo Code, Continue | M18-001 Cross-Product Findings; M18-002 Context Quality, Performance, Repository Awareness | Medium | Medium | PARTIALLY | High |
| 8 | Operational reliability, network, and IDE compatibility | GitHub Copilot, Roo Code, Windsurf / Devin Desktop, Cline | Copilot study cited in M18-001; Roo FAQ cited in M18-001; M18-002 Installation and Extensibility | Medium | Medium | PARTIALLY | High |
| 9 | Product continuity and maintenance risk | Roo Code, Continue | M18-001 Roo Code and Continue status facts; M18-002 Product-continuity caveat | Medium | High | PARTIALLY | High |
| 10 | Extension ecosystem limitations and interference | GitHub Copilot, Roo Code, Continue, Windsurf / Devin Desktop | Copilot study cited in M18-001; Roo FAQ; Windsurf / Devin Desktop docs; M18-002 Extensibility | Medium | Medium | NO | High |

## Bottlenecks Levi Already Solves

Facts from approved Levi documents:

- `MVP_SCOPE.md` requires task planning before file changes, approval before execution, repository boundaries, destructive-action approval, validation, exact completion reporting, memory isolation, and spending/iteration limits.
- `ARCHITECTURE.md` requires explicit state transitions, trust boundaries, shell command approval through an approved plan, repository file boundaries, and model output treated as untrusted.

| Bottleneck | Competitor evidence | Levi coverage | Evidence source | Confidence |
|---|---|---|---|---|
| Destructive command or unsafe tool execution risk | Claude Code incident, Cline YOLO warning, Roo command caution, Codex/Copilot sandbox evidence. | YES: approved Levi scope requires planned file boundaries, destructive/irreversible approval, repository-only executor access, shell commands requiring an approved plan, and model output treated as untrusted. | `COMPETITOR_ANALYSIS.md`; `MVP_SCOPE.md` LC-MVP-005, LC-MVP-007; `ARCHITECTURE.md` Trust Boundaries. | High |

Interpretation, not recommendation:

- Only one cross-competitor bottleneck is marked YES because the approved Levi docs directly address it at the policy/workflow level.

## Bottlenecks Levi Partially Solves

| Bottleneck | Competitor evidence | Levi partial coverage | Missing or UNKNOWN coverage | Confidence |
|---|---|---|---|---|
| Cost predictability and usage-limit pressure | Cursor pricing confusion, Claude heavy-use cost, Copilot credits, Cline credits/BYOK, Roo/Continue provider costs. | Model Gateway routes by cost class and enforces spending/iteration limits; Levi philosophy prefers local/free-first operation. | User-facing cost forecasting, billing-specific UX, and exact provider cost behavior are not established by M18 docs. | High |
| Provider/model setup complexity | Cline/Roo/Continue provider setup, Copilot plan/model gating, Windsurf login/API-key. | Levi owns a Model Gateway and provider interface; architecture requires replaceable adapters. | M11/M12 provider implementation tasks remain not started in PLAN, and setup UX is not analyzed here. | High |
| Permission fatigue versus unsafe autonomy | Claude, Cline, Roo, Continue, and Codex approval modes. | Levi requires planning approval and destructive-action approval. | Prompt fatigue reduction is not separately solved; fully autonomous modes conflict with Levi user-control rules. | High |
| Rollback/checkpoint gaps and overhead | Cline checkpoints, Codex Git checkpoints, Copilot rollback docs, Roo experimental checkpoints, multiple UNKNOWNs. | Levi records exact changed files and task outcomes; safe patching rejects malformed/unplanned operations. | Dedicated rollback/checkpoint restoration is not in approved MVP scope. | High |
| Local/offline capability gaps or uncertainty | Local support strongest in Roo/Continue; many tools UNKNOWN. | Levi's architecture prefers local-first where sufficient; LC-MVP-006 requires local and remote provider support. | Exact local provider tasks in Phase 2 are not complete in PLAN; offline UX is not proven here. | High |
| Context/indexing performance and overhead | Claude compaction, Copilot indexing delay, Cline checkpoint overhead, Roo indexing overhead, Continue context config. | Levi has deterministic repository analysis, memory separation, context-builder task approval, and cited facts requirements. | Semantic retrieval/vector store decisions remain deferred; context performance is not validated in this task. | High |
| Operational reliability, network, and IDE compatibility | Copilot study, Roo FAQ, extension/client issues. | Levi's primary interface is CLI and repository-bound execution, reducing IDE-extension compatibility exposure. | Levi does not solve external network/provider reliability, and no reliability benchmark was run. | Medium |
| Product continuity and maintenance risk | Roo shutdown, Continue read-only/acquisition. | Levi architecture requires replaceable adapters and Levi-owned interfaces to reduce external dependency lock-in. | Levi cannot solve third-party product shutdown; continuity of Levi itself is outside this analysis. | High |
| Login/API-key friction | Claude, Codex, Copilot, Cline, Continue, Windsurf / Devin Desktop first-run auth evidence. | Levi can use local-first/provider abstraction and avoids direct provider SDKs in business logic. | Specific auth/onboarding flow is not evaluated by M18-003. | Medium |

## Bottlenecks Levi Does Not Solve

| Bottleneck | Evidence | Why Levi does not solve it | Confidence |
|---|---|---|---|
| IDE/client compatibility across many editor ecosystems | Copilot study; Roo extension interference; Windsurf extension incompatibility; Continue VS Code/JetBrains surfaces. | `MVP_SCOPE.md` explicitly excludes a VS Code extension and standalone IDE. Levi's primary interface is CLI. | High |
| Extension marketplace compatibility | Windsurf / Devin Desktop docs say marketplace extensions cannot be installed and some extensions are incompatible. | `MVP_SCOPE.md` explicitly excludes marketplace integrations and standalone IDE scope. | High |
| Third-party hosted pricing changes | Cursor pricing confusion, Claude heavy-use cost, Copilot AI credits, provider-dependent Cline/Roo/Continue costs. | Levi can limit and route usage, but cannot control external provider pricing. | High |
| Competitor product shutdown or acquisition | Roo Code shutdown and Continue read-only/acquisition. | Levi can reduce external lock-in through adapters but cannot keep external competitors alive. | High |
| Native autocomplete parity | Cursor and Copilot include autocomplete-related surfaces. | `PRD.md` and `MVP_SCOPE.md` list autocomplete as a non-goal/out of scope. | High |

## Bottlenecks Not Worth Solving Because They Conflict With Levi's Philosophy

This section is an interpretation against approved Levi philosophy and non-goals. It is not an implementation recommendation.

| Bottleneck pattern | Evidence | Conflict with Levi philosophy | Confidence |
|---|---|---|---|
| Fully autonomous YOLO-style execution without approval | Cline YOLO warnings; Claude bypass mode warning; Roo auto-approval caution. | Levi requires user control, approval before execution, destructive-action approval, and no autonomous execution without approval. | High |
| Building a standalone IDE to match IDE-native competitors | Cursor IDE, Windsurf / Devin Desktop IDE, Copilot broad IDE support. | `PRD.md` and `MVP_SCOPE.md` list standalone IDE as a non-goal/out of scope. | High |
| Building IDE autocomplete parity | Cursor tab completion and Copilot IDE suggestions. | `PRD.md` and `MVP_SCOPE.md` list autocomplete as a non-goal/out of scope. | High |
| Marketplace integration parity | Cursor marketplace, GitHub/Copilot ecosystem, Windsurf extension marketplace limitation. | `MVP_SCOPE.md` lists marketplace integrations as out of scope. | High |
| Autonomous deployment parity | Windsurf / Devin Desktop one-click deploy evidence. | `PRD.md` and `MVP_SCOPE.md` list autonomous deployment as a non-goal/out of scope. | High |
| Team/enterprise collaboration parity | Cursor Teams/Enterprise, Copilot Business/Enterprise controls, Cline enterprise features. | `PRD.md` and `MVP_SCOPE.md` define the primary user as a solo builder and team collaboration as out of scope. | High |

## Evidence Gaps

- OpenAI Codex public complaint frequency is `UNKNOWN` from M18-001.
- Cursor approval workflow, rollback, local model support, offline support, and detailed context mechanics remain `UNKNOWN`.
- Claude Code dedicated rollback/checkpoint capability and local model support remain `UNKNOWN`.
- GitHub Copilot local model inference remains `UNKNOWN`; local sandboxes are not local model inference.
- Cline exact offline behavior remains `UNKNOWN`.
- Windsurf / Devin Desktop safety controls, approval workflow, rollback, pricing, provider list, local model support, and offline support remain `UNKNOWN`.

## Executive Summary

Facts:

- The strongest cross-competitor bottlenecks are cost predictability, provider/model setup, safety approvals versus autonomy, rollback gaps, local/offline uncertainty, context/indexing overhead, reliability/compatibility, and product continuity.
- The most severe impact bottlenecks are destructive command risk, cost overruns, and product continuity.
- The most repeated evidence categories are cost, provider/model setup, approval workflow, rollback, and local/offline capability.

Interpretation, not recommendation:

- Levi's approved philosophy is aligned with several observed bottlenecks because it emphasizes scope control, local-first operation, approval, validation, cost limits, and replaceable providers.
- Levi's approved MVP intentionally does not solve IDE-extension parity, standalone IDE parity, autocomplete parity, marketplace parity, or autonomous deployment parity.

## Validation Plan

Required validation after file creation:

- `git diff --check`
- `git status --short`

