# M18-002 Feature Matrix

Task ID: M18-002

Requirement ID: POST_MVP until approved by the owner

Status: PLANNING ONLY

Scope:

- Products compared: Cursor, Claude Code, OpenAI Codex, GitHub Copilot, Cline, Roo Code, Continue, Windsurf / Devin Desktop.
- Evidence source: `COMPETITOR_ANALYSIS.md` from M18-001.
- Implementation code modified: none.
- Deliverable file approved by PLAN.md: `FEATURE_MATRIX.md`.

Boundary:

- This file compares competitors objectively.
- This file does not rank products.
- This file does not recommend Levi features.
- Where evidence is insufficient, the value is marked `UNKNOWN`.

## Evidence Key

- `M18-001 Cross-Product Findings`: shared patterns from `COMPETITOR_ANALYSIS.md`.
- `M18-001 Cursor`: Cursor section in `COMPETITOR_ANALYSIS.md`.
- `M18-001 Claude Code`: Claude Code section in `COMPETITOR_ANALYSIS.md`.
- `M18-001 OpenAI Codex`: OpenAI Codex section in `COMPETITOR_ANALYSIS.md`.
- `M18-001 GitHub Copilot`: GitHub Copilot section in `COMPETITOR_ANALYSIS.md`.
- `M18-001 Cline`: Cline section in `COMPETITOR_ANALYSIS.md`.
- `M18-001 Roo Code`: Roo Code section in `COMPETITOR_ANALYSIS.md`.
- `M18-001 Continue`: Continue section in `COMPETITOR_ANALYSIS.md`.
- `M18-001 Windsurf / Devin Desktop`: Windsurf / Devin Desktop section in `COMPETITOR_ANALYSIS.md`.

## Matrix Rules

- Strength means an evidence-backed product capability or clear advantage.
- Weakness means an evidence-backed limitation, friction point, or evidence gap.
- `UNKNOWN` means reviewed evidence did not support a reliable conclusion.
- "Weakness" is not a product ranking.

## Installation

| Product | Evidence | Strength | Weakness / UNKNOWN |
|---|---|---|---|
| Cursor | M18-001 Cursor: desktop IDE plus CLI install command advertised. | Dedicated IDE and CLI entry point. | Detailed install friction and offline install behavior are `UNKNOWN`. |
| Claude Code | M18-001 Claude Code: native script, PowerShell/CMD, Homebrew, WinGet, Linux package managers. | Broad installer coverage across operating systems. | User must log in on first CLI use; update behavior differs by install method. |
| OpenAI Codex | M18-001 OpenAI Codex: CLI installer, first run through `codex`. | Terminal-first installation path. | Exact install friction across all platforms and local/offline install behavior are `UNKNOWN`. |
| GitHub Copilot | M18-001 GitHub Copilot: multiple IDE extensions and paid/free plan access. | Very broad IDE availability. | Requires GitHub sign-in/authorization and plan eligibility for full use. |
| Cline | M18-001 Cline: IDE extensions, CLI, Kanban, SDK; CLI requires Node.js 20+. | Many installation surfaces. | Post-install provider/auth setup adds friction. |
| Roo Code | M18-001 Roo Code: VS Code Marketplace, Open VSX, VSIX; extension free. | Simple extension install path. | Official shutdown notice creates continuity risk. |
| Continue | M18-001 Continue: CLI, VS Code extension, JetBrains plugin. | Multiple local developer surfaces. | Repository/product is read-only after acquisition; first run requires login or API key. |
| Windsurf / Devin Desktop | M18-001 Windsurf / Devin Desktop: Mac, Windows, Linux desktop app. | Desktop onboarding with settings import. | Requires login/API-key fallback; marketplace extension install is unavailable. |

## Learning Curve

| Product | Evidence | Strength | Weakness / UNKNOWN |
|---|---|---|---|
| Cursor | M18-001 Cursor: IDE, agents, tab completion, CLI, Slack, cloud agents, review. | Familiar IDE surface plus multiple assistant modes. | Usage/pricing confusion is documented; detailed onboarding complexity is `UNKNOWN`. |
| Claude Code | M18-001 Claude Code: CLI commands, multiple permission modes, context commands, memory, skills. | Strong explicit controls and documented workflows. | Permission/context model may require learning before safe heavy use. |
| OpenAI Codex | M18-001 OpenAI Codex: slash commands for init, status, permissions, model, review. | Discoverable terminal commands for common workflows. | Detailed user-friction evidence is `UNKNOWN`. |
| GitHub Copilot | M18-001 GitHub Copilot: IDE chat, CLI, cloud agent, PR/issue workflows, enterprise controls. | Familiar GitHub and IDE integration. | Broad surface area increases policy/model/client complexity. |
| Cline | M18-001 Cline: Plan/Act, Auto Approve, YOLO, providers, local runtimes, checkpoints. | Clear separation between planning and acting. | Provider/model setup and approval modes add learning load. |
| Roo Code | M18-001 Roo Code: modes, custom modes, many providers, codebase indexing. | Modes make task intent explicit. | Docs acknowledge provider choice is large; shutdown adds learning risk. |
| Continue | M18-001 Continue: config.yaml, TUI, headless mode, permissions, context providers. | Explicit configuration can be learned and versioned. | YAML/provider/config model increases setup learning; active roadmap is limited. |
| Windsurf / Devin Desktop | M18-001 Windsurf / Devin Desktop: theme/import/login/home onboarding. | Familiar IDE onboarding pattern. | Safety, approvals, rollback, and provider details are `UNKNOWN`, limiting learnability evidence. |

## Project Understanding

| Product | Evidence | Strength | Weakness / UNKNOWN |
|---|---|---|---|
| Cursor | M18-001 Cursor: advertises complete codebase understanding and learning codebase at scale. | Strong codebase-understanding positioning. | Detailed mechanics and limits are `UNKNOWN`. |
| Claude Code | M18-001 Claude Code: reads codebase, edits files, runs commands, integrates with tools. | Direct repository exploration from terminal/IDE. | Accuracy limits for large or unfamiliar repos are `UNKNOWN`. |
| OpenAI Codex | M18-001 OpenAI Codex: works against local repository, inspects files, explains projects, plans/debugs. | Local repository-oriented workflow. | Repository-understanding benchmark evidence is `UNKNOWN`. |
| GitHub Copilot | M18-001 GitHub Copilot: repository indexing and semantic code search. | Documented repo indexing for context. | Indexing availability and model behavior depend on plan/client. |
| Cline | M18-001 Cline: reads/writes files, runs commands, browser use, Plan mode explores before edits. | Exploration-before-editing workflow. | Understanding quality depends on selected model/provider. |
| Roo Code | M18-001 Roo Code: answers codebase questions, uses semantic search with embeddings and Qdrant. | Explicit codebase indexing path. | Product shutdown affects future reliability. |
| Continue | M18-001 Continue: coding agent edits files, runs commands, supports context providers. | Configurable context sources. | Maintenance status limits active product evolution evidence. |
| Windsurf / Devin Desktop | M18-001 Windsurf / Devin Desktop: context awareness, Codemaps, DeepWiki. | Advertises codebase awareness. | Detailed mechanics and limits are `UNKNOWN`. |

## Context Quality

| Product | Evidence | Strength | Weakness / UNKNOWN |
|---|---|---|---|
| Cursor | M18-001 Cursor: codebase indexing and semantic search advertised. | Semantic repository context appears available. | Detailed context mechanics are `UNKNOWN`. |
| Claude Code | M18-001 Claude Code: compaction, `/context`, `/memory`, subagents, CLAUDE.md, rules, skills, 1M-token variants. | Most detailed context-control evidence in M18-001. | User must manage or understand context controls for best results. |
| OpenAI Codex | M18-001 OpenAI Codex: context indicators, resume sessions, subagents, visual/image context, web search. | Multiple context input and session-continuity surfaces. | Compaction mechanics and quality limits are `UNKNOWN`. |
| GitHub Copilot | M18-001 GitHub Copilot: repository indexing, semantic search, content exclusion, Spaces, MCP, memory. | Strong documented repository context infrastructure. | Availability and behavior vary by plan/client. |
| Cline | M18-001 Cline: `@` file/folder mentions, drag/drop, selected code, terminal/source-control context, Memory Bank, rules, skills. | User can explicitly steer context. | Quality depends on user selection and provider model. |
| Roo Code | M18-001 Roo Code: context mentions, modes, codebase indexing. | Explicit context mentions plus indexing. | Indexing depends on embeddings/Qdrant; shutdown limits future confidence. |
| Continue | M18-001 Continue: config.yaml context providers, docs, rules, prompts, MCP, data destinations. | Highly configurable context pipeline. | Configuration burden is higher; quality evidence is mostly capability-based. |
| Windsurf / Devin Desktop | M18-001 Windsurf / Devin Desktop: memories/rules, MCP, context awareness, Codemaps, DeepWiki. | Multiple context features exist. | Detailed context mechanics are `UNKNOWN`. |

## Local Model Support

| Product | Evidence | Strength | Weakness / UNKNOWN |
|---|---|---|---|
| Cursor | M18-001 Cursor: reviewed official pages did not verify local model support. | `UNKNOWN`. | Local model support is `UNKNOWN`. |
| Claude Code | M18-001 Claude Code: third-party providers mentioned, local inference not verified. | `UNKNOWN`. | Local model support is `UNKNOWN`. |
| OpenAI Codex | M18-001 OpenAI Codex: official docs reviewed did not verify local inference. | `UNKNOWN`. | Local model support is `UNKNOWN`. |
| GitHub Copilot | M18-001 GitHub Copilot: local sandboxes documented, not local model inference. | Local execution isolation exists. | Local model inference is `UNKNOWN` / not verified. |
| Cline | M18-001 Cline: supports BYOK for cloud providers or local runtimes and links to local models. | Explicit local-runtime path. | Exact offline coverage remains `UNKNOWN`. |
| Roo Code | M18-001 Roo Code: supports Ollama and LM Studio; FAQ says offline possible with local model. | Strongest local/offline evidence with Continue. | Official shutdown affects future support. |
| Continue | M18-001 Continue: Ollama config example and docs for running without internet/self-hosting. | Strong local-model configurability. | Current active maintenance is limited. |
| Windsurf / Devin Desktop | M18-001 Windsurf / Devin Desktop: local inference not verified. | `UNKNOWN`. | Local model support is `UNKNOWN`. |

## Remote Model Support

| Product | Evidence | Strength | Weakness / UNKNOWN |
|---|---|---|---|
| Cursor | M18-001 Cursor: OpenAI, Anthropic, Gemini, xAI/Grok, Cursor models. | Multiple hosted model families. | Plan/model availability details may affect access. |
| Claude Code | M18-001 Claude Code: Claude subscriptions, Anthropic Console, third-party providers for some local surfaces. | Strong Claude-native remote support. | Non-Claude provider details are less fully documented in M18-001. |
| OpenAI Codex | M18-001 OpenAI Codex: uses OpenAI models and model selection. | OpenAI-native remote model path. | Non-OpenAI model support is not verified. |
| GitHub Copilot | M18-001 GitHub Copilot: OpenAI, Anthropic, Google, Microsoft, Moonshot, fine-tuned GPT variants. | Broad hosted model catalog. | Model availability depends on plan/client and can change. |
| Cline | M18-001 Cline: 100+ models, Cline provider, BYOK remote providers. | Very broad provider/model choice. | Choice breadth increases setup complexity. |
| Roo Code | M18-001 Roo Code: many providers including Anthropic, OpenAI, Gemini, OpenRouter, Vercel AI Gateway, xAI/Grok. | Broad provider support. | Provider/API setup is a common troubleshooting area. |
| Continue | M18-001 Continue: OpenAI, Anthropic, OpenAI-compatible endpoints, configured providers. | Replaceable provider configuration. | Active product support is limited after final release. |
| Windsurf / Devin Desktop | M18-001 Windsurf / Devin Desktop: account/API-key login and model settings mentioned. | Remote model usage appears present. | Specific provider/model support is `UNKNOWN`. |

## Editing Workflow

| Product | Evidence | Strength | Weakness / UNKNOWN |
|---|---|---|---|
| Cursor | M18-001 Cursor: tab completion, command edits, agents, cloud agents, GitHub review. | Full IDE agent/edit/review loop. | Approval and rollback mechanics are `UNKNOWN`. |
| Claude Code | M18-001 Claude Code: plan, edit files, run commands, commits, PRs, review/CI workflows. | End-to-end terminal/IDE coding workflow. | Rollback/checkpoint evidence is `UNKNOWN`. |
| OpenAI Codex | M18-001 OpenAI Codex: interactive CLI, `codex exec`, local edits, command execution, review, cloud handoff. | Terminal workflow supports interactive and repeatable use. | Exact complaint/friction evidence is `UNKNOWN`. |
| GitHub Copilot | M18-001 GitHub Copilot: IDE suggestions, chat, CLI, cloud agent, PR/issue workflows, code review. | Broad workflow integration across GitHub and IDEs. | Approval/rollback mechanics not fully extracted. |
| Cline | M18-001 Cline: Plan mode and Act mode; modifies files/runs commands after plan. | Explicit planning before action. | Auto/YOLO modes can trade safety for speed. |
| Roo Code | M18-001 Roo Code: reads/writes files, shell commands, browser, MCP tools. | Tool-using VS Code agent workflow. | Product shutdown and experimental checkpoint status are limitations. |
| Continue | M18-001 Continue: TUI, headless, `@` references, tools, Bash, plan/auto/read-only modes. | Good terminal automation shape. | Dedicated rollback is `UNKNOWN`. |
| Windsurf / Devin Desktop | M18-001 Windsurf / Devin Desktop: agent panel, local folders, SSH, dev containers, terminal, previews, AI commit messages. | Integrated AI IDE workflow. | Safety/approval/rollback details are `UNKNOWN`. |

## Safety

| Product | Evidence | Strength | Weakness / UNKNOWN |
|---|---|---|---|
| Cursor | M18-001 Cursor: repository/model/MCP access controls, auto-run controls, browser/network controls, audit logs, privacy mode. | Enterprise safety controls are advertised. | User-level approval details are `UNKNOWN`. |
| Claude Code | M18-001 Claude Code: protected paths, deny/ask rules, plan mode, auto classifier, blocked destructive categories, bypass warning. | Strong documented permission model. | External incident evidence shows broad permissions can be dangerous. |
| OpenAI Codex | M18-001 OpenAI Codex: permissions, sandboxing, auto-review, internet controls, local/cloud environments, worktrees. | Sandboxed agent controls documented. | Detailed user complaint evidence is `UNKNOWN`. |
| GitHub Copilot | M18-001 GitHub Copilot: cloud/local sandboxes, filters, content exclusion, model policies, MCP controls, budgets, audit logs. | Enterprise-grade policy and sandbox evidence. | Complex plan/client/policy matrix. |
| Cline | M18-001 Cline: explicit approval default, Plan mode, Auto Approve, YOLO warnings, `.clineignore`, checkpoints. | Transparent safety/autonomy controls. | YOLO mode is documented as dangerous. |
| Roo Code | M18-001 Roo Code: prompts for tool approval, cautions about command execution, modes/tool permissions. | Per-tool approval by default. | Safety depth is less documented; shutdown risk. |
| Continue | M18-001 Continue: allow/ask/exclude permissions, read-only defaults, headless excludes ask tools. | Clear tool-permission model. | Headless automation cannot ask for approval. |
| Windsurf / Devin Desktop | M18-001 Windsurf / Devin Desktop: detailed safety controls not found. | `UNKNOWN`. | Safety features are `UNKNOWN` beyond account/settings/local agent references. |

## Approval Workflow

| Product | Evidence | Strength | Weakness / UNKNOWN |
|---|---|---|---|
| Cursor | M18-001 Cursor: approval workflow details not found. | `UNKNOWN`. | Approval workflow is `UNKNOWN`. |
| Claude Code | M18-001 Claude Code: manual/default, accept-edits, plan, auto, dontAsk, bypass. | Granular approval modes. | Permission fatigue is documented; bypass is risky. |
| OpenAI Codex | M18-001 OpenAI Codex: `/permissions` exposes edit/command boundaries and sandbox/writable roots. | User-visible permission control. | Detailed prompt-mode behavior not fully extracted. |
| GitHub Copilot | M18-001 GitHub Copilot: docs navigation includes tool allowance, rollback, hooks, policies. | Approval/policy surface exists. | Detailed mechanics not fully extracted. |
| Cline | M18-001 Cline: every action requires approval by default; Auto Approve and YOLO available. | Strong default human approval. | Auto/YOLO modes can approve risky actions. |
| Roo Code | M18-001 Roo Code: prompts approve/reject per tool unless auto-approval enabled. | Simple per-tool approval model. | Auto-approval risk; long-run approval fatigue. |
| Continue | M18-001 Continue: allow/ask/exclude, `--auto`, `--readonly`, persisted permissions. | Clear permission flags and persisted config. | Headless mode excludes ask tools. |
| Windsurf / Devin Desktop | M18-001 Windsurf / Devin Desktop: approval workflow not found. | `UNKNOWN`. | Approval workflow is `UNKNOWN`. |

## Rollback

| Product | Evidence | Strength | Weakness / UNKNOWN |
|---|---|---|---|
| Cursor | M18-001 Cursor: verified rollback docs not found. | `UNKNOWN`. | Rollback capability is `UNKNOWN`. |
| Claude Code | M18-001 Claude Code: ordinary Git workflows supported; dedicated rollback not verified. | Git workflows can be used. | Dedicated rollback/checkpoint capability is `UNKNOWN`. |
| OpenAI Codex | M18-001 OpenAI Codex: advises Git checkpoints before/after tasks. | Encourages Git-based rollback discipline. | Built-in rollback details are `UNKNOWN`. |
| GitHub Copilot | M18-001 GitHub Copilot: CLI docs navigation includes cancel/roll back and roll back changes. | Rollback docs exist. | Detailed mechanics were not extracted. |
| Cline | M18-001 Cline: checkpoints enabled by default with shadow Git; restore files/task options. | Strongest verified rollback evidence. | Checkpoints may slow very large repositories. |
| Roo Code | M18-001 Roo Code: VS Code undo; experimental checkpoints can revert file changes. | Basic editor undo plus optional checkpoints. | Checkpoints are experimental; product shutdown. |
| Continue | M18-001 Continue: dedicated rollback not verified. | `UNKNOWN`. | Rollback capability is `UNKNOWN`. |
| Windsurf / Devin Desktop | M18-001 Windsurf / Devin Desktop: rollback not found. | `UNKNOWN`. | Rollback capability is `UNKNOWN`. |

## Performance

| Product | Evidence | Strength | Weakness / UNKNOWN |
|---|---|---|---|
| Cursor | M18-001 Cursor: CEO interview discusses speed/robustness product work; no benchmark. | Performance is a stated product focus. | Independent performance evidence is `UNKNOWN`. |
| Claude Code | M18-001 Claude Code: compaction, prompt caching, subagents, larger context windows. | Explicit context/performance controls. | Performance depends on model/context/task; benchmark evidence is `UNKNOWN`. |
| OpenAI Codex | M18-001 OpenAI Codex: model/reasoning selection and speed configuration in docs navigation. | Model/reasoning controls exist. | Independent performance evidence is `UNKNOWN`. |
| GitHub Copilot | M18-001 GitHub Copilot: model choices by speed/cost/accuracy and repo indexing up to 60 seconds for large repos. | Explicit speed/cost/accuracy tradeoff. | Indexing and model availability vary. |
| Cline | M18-001 Cline: checkpoints can use storage and slow very large repositories. | Checkpoints preserve state. | Checkpoint overhead is documented. |
| Roo Code | M18-001 Roo Code: initial codebase indexing is most expensive; updates incremental and cheaper. | Incremental indexing after initial setup. | Initial indexing cost/performance overhead. |
| Continue | M18-001 Continue: config exposes timeouts and context length; no benchmark. | Configurable performance-related settings. | Performance evidence is `UNKNOWN`. |
| Windsurf / Devin Desktop | M18-001 Windsurf / Devin Desktop: performance details not verified. | `UNKNOWN`. | Performance is `UNKNOWN`. |

## Cost

| Product | Evidence | Strength | Weakness / UNKNOWN |
|---|---|---|---|
| Cursor | M18-001 Cursor: free Hobby, $20/month Individual Pro, $40/user/month Teams, overage billing. | Clear public pricing tiers. | Pricing/usage-limit confusion and overage concern are documented. |
| Claude Code | M18-001 Claude Code: Claude subscriptions or Anthropic Console/API; heavy use cost/rate-limit pressure reported. | Subscription/API paths exist. | Exact coding-agent cost by plan not fully extracted; heavy-use cost pressure. |
| OpenAI Codex | M18-001 OpenAI Codex: depends on OpenAI/ChatGPT/API plan. | OpenAI plan integration. | Exact cost from reviewed Codex docs is `UNKNOWN`. |
| GitHub Copilot | M18-001 GitHub Copilot: Free, Pro, Pro+, Max, Business, Enterprise with AI credits. | Plan-based credits and enterprise pooling. | Model access and usage are plan/client dependent. |
| Cline | M18-001 Cline: pay-as-you-go credits, free model options, ClinePass $9.99/month, BYOK. | Multiple cost paths including BYOK/local options. | Provider/model breadth creates cost-management complexity. |
| Roo Code | M18-001 Roo Code: extension free/open-source; external providers charge; indexing uses OpenAI API/Qdrant. | Free extension and local-model option. | Provider/indexing costs still apply; shutdown risk. |
| Continue | M18-001 Continue: provider/API costs apply; current subscription state after acquisition is `UNKNOWN`. | Local/self-hosted provider options can reduce remote spend. | Active subscription cost and roadmap are `UNKNOWN`. |
| Windsurf / Devin Desktop | M18-001 Windsurf / Devin Desktop: docs mention credits/usage, specific pricing not extracted. | Credit/usage system appears present. | Cost is `UNKNOWN`. |

## Offline Capability

| Product | Evidence | Strength | Weakness / UNKNOWN |
|---|---|---|---|
| Cursor | M18-001 Cursor: offline model inference not verified. | `UNKNOWN`. | Offline capability is `UNKNOWN`. |
| Claude Code | M18-001 Claude Code: offline model inference not verified. | `UNKNOWN`. | Offline capability is `UNKNOWN`. |
| OpenAI Codex | M18-001 OpenAI Codex: offline model inference not verified. | `UNKNOWN`. | Offline capability is `UNKNOWN`. |
| GitHub Copilot | M18-001 GitHub Copilot: local sandboxes are execution isolation, not local inference. | Local sandbox execution exists. | Offline model capability is `UNKNOWN`. |
| Cline | M18-001 Cline: local runtimes supported, exact offline behavior not verified. | Local runtime path exists. | Offline coverage is `UNKNOWN`. |
| Roo Code | M18-001 Roo Code: FAQ says offline use possible with local models. | Verified offline path with local models. | Shutdown affects support confidence. |
| Continue | M18-001 Continue: docs include running without internet and Ollama/self-hosting paths. | Verified offline/local path. | Active maintenance is limited. |
| Windsurf / Devin Desktop | M18-001 Windsurf / Devin Desktop: offline inference not verified. | `UNKNOWN`. | Offline capability is `UNKNOWN`. |

## Extensibility

| Product | Evidence | Strength | Weakness / UNKNOWN |
|---|---|---|---|
| Cursor | M18-001 Cursor: MCPs, skills, hooks, marketplace, team marketplace. | Multiple extension surfaces. | Detailed extension governance not fully reviewed. |
| Claude Code | M18-001 Claude Code: MCP, CLAUDE.md, rules, skills, hooks, subagents, custom agents, Agent SDK. | Rich agent customization ecosystem. | Complexity may increase setup/maintenance burden. |
| OpenAI Codex | M18-001 OpenAI Codex: skills, plugins, MCP, hooks, subagents, non-interactive mode, GitHub Action, SDK. | Broad terminal/cloud extensibility. | Detailed product-limit evidence is `UNKNOWN`. |
| GitHub Copilot | M18-001 GitHub Copilot: MCP, custom agents, hooks, plugin directories, skills, SDK, CLI extensions, agent apps. | Strong enterprise/GitHub ecosystem extensibility. | Policy/client/model interactions can be complex. |
| Cline | M18-001 Cline: MCP, rules, skills, plugins, hooks, connectors, scheduling, subagents, agent teams, CLI, Kanban, SDK. | Very broad extensibility. | Broad surface may raise learning/setup complexity. |
| Roo Code | M18-001 Roo Code: MCP, custom instructions, custom modes, `.roorules`, settings, providers, indexing. | Open and configurable. | Official shutdown limits future extensibility confidence. |
| Continue | M18-001 Continue: config.yaml, models, context providers, rules, prompts, docs, MCP, data destinations. | Strong file-based configuration. | Read-only repository limits active evolution. |
| Windsurf / Devin Desktop | M18-001 Windsurf / Devin Desktop: MCP servers; marketplace extensions unavailable. | MCP support exists. | Extension marketplace unavailable; some extensions incompatible. |

## Ease Of Setup

| Product | Evidence | Strength | Weakness / UNKNOWN |
|---|---|---|---|
| Cursor | M18-001 Cursor: desktop product and CLI; public product page emphasizes "Get Cursor". | Single-product IDE path can be straightforward. | Pricing/usage and local/offline setup clarity are evidence gaps. |
| Claude Code | M18-001 Claude Code: `cd your-project`, `claude`, login prompt. | Simple first command. | Safe configuration requires understanding permission modes. |
| OpenAI Codex | M18-001 OpenAI Codex: run `codex`, sign in, slash commands. | Simple terminal entry. | Cost/local/offline setup details are `UNKNOWN`. |
| GitHub Copilot | M18-001 GitHub Copilot: install extension, sign in, plan eligibility. | Familiar GitHub account workflow. | Enterprise controls and model availability can complicate setup. |
| Cline | M18-001 Cline: install extension/CLI, authorize/provider setup. | Many paths including Cline provider and BYOK. | Provider choice and auth setup are likely friction points. |
| Roo Code | M18-001 Roo Code: install extension, connect provider. | Simple extension flow. | Provider setup can be overwhelming; shutdown status. |
| Continue | M18-001 Continue: `cn`, login or Anthropic API key; config.yaml for advanced use. | Fast CLI start path. | Config/API-key setup and read-only status are limitations. |
| Windsurf / Devin Desktop | M18-001 Windsurf / Devin Desktop: theme, terminal command option, settings import, login/API key. | Polished desktop onboarding signals. | Requires login; marketplace extension install unavailable. |

## Repository Awareness

| Product | Evidence | Strength | Weakness / UNKNOWN |
|---|---|---|---|
| Cursor | M18-001 Cursor: complete codebase understanding and semantic search advertised. | Strong repository-awareness positioning. | Details on citations, exclusions, and trust boundaries are `UNKNOWN`. |
| Claude Code | M18-001 Claude Code: reads files, context controls, CLAUDE.md, memory, rules. | Repository-aware terminal workflow with project instructions. | Deterministic citation behavior is `UNKNOWN`. |
| OpenAI Codex | M18-001 OpenAI Codex: local repo inspection, `/status`, permissions, sandbox/writable roots. | Repository boundary awareness exposed to user. | Detailed repository-indexing mechanics are `UNKNOWN`. |
| GitHub Copilot | M18-001 GitHub Copilot: repository indexing and semantic code search. | Explicit repo indexing. | Initial indexing time and plan/client availability vary. |
| Cline | M18-001 Cline: file/folder mentions, selected code, terminal/source-control context, `.clineignore`, Plan mode. | Strong user-directed repo context. | Quality depends on model/provider and user context selection. |
| Roo Code | M18-001 Roo Code: codebase indexing with embeddings/Qdrant, file/folder/problem mentions. | Semantic repository index plus mentions. | Indexing requires external components/API and product is shut down. |
| Continue | M18-001 Continue: context providers, docs crawling, models/rules/prompts in config. | Configurable repo/context awareness. | Maintenance status limits active support confidence. |
| Windsurf / Devin Desktop | M18-001 Windsurf / Devin Desktop: context awareness, Codemaps, DeepWiki. | Repository awareness is part of product positioning. | Detailed behavior and trust controls are `UNKNOWN`. |

## Objective Cross-Category Notes

- Strongest verified local/offline evidence: Roo Code and Continue; Cline has local-runtime evidence but exact offline coverage is `UNKNOWN`.
- Strongest verified rollback evidence: Cline checkpoints. Codex advises Git checkpoints, Copilot rollback docs exist, Roo has VS Code undo and experimental checkpoints, and several products remain `UNKNOWN`.
- Most explicit approval-mode evidence: Claude Code, Cline, Continue, Roo Code, and OpenAI Codex.
- Most complete cost evidence in M18-001: Cursor, GitHub Copilot, and Cline. Cost remains partly or fully `UNKNOWN` for Codex, Continue, and Windsurf / Devin Desktop.
- Product-continuity caveat: Roo Code and Continue both have official shutdown/read-only/acquisition evidence in M18-001.

These notes are descriptive only. They are not rankings and not Levi feature recommendations.

## Validation Plan

Required validation after file creation:

- `git diff --check`
- `git status --short`

