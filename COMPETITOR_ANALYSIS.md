# M18-001 Competitive Analysis

Task ID: M18-001

Requirement ID: POST_MVP until approved by the owner

Status: PLANNING RESEARCH ONLY

Scope:

- Products researched: Cursor, Claude Code, OpenAI Codex, GitHub Copilot, Cline, Roo Code, Continue, Windsurf / Devin Desktop.
- Implementation code modified: none.
- Deliverable file approved by PLAN.md: `COMPETITOR_ANALYSIS.md`.

Evidence rule:

- "Verified facts" are backed by cited sources.
- "Opinion / interpretation" is explicitly separated and is not a feature recommendation.
- Unknown information is marked `UNKNOWN`.
- No feature recommendations are made in this document.

## Source Index

- Cursor homepage and product page: https://cursor.com/en-US
- Cursor pricing page: https://cursor.com/pricing
- The Verge interview with Cursor CEO about pricing and product constraints: https://www.theverge.com/decoder-podcast-with-nilay-patel/715267/anysphere-ceo-michael-truell-cursor-ai-automate-programming-interview
- Business Insider report on AI coding pricing pressure: https://www.businessinsider.com/inference-whales-threaten-ai-coding-startups-business-model-2025-8
- Claude Code overview: https://code.claude.com/docs/en/overview
- Claude Code context window: https://code.claude.com/docs/en/context-window
- Claude Code permission modes: https://code.claude.com/docs/en/permission-modes
- Claude pricing page: https://claude.com/pricing
- TechRadar report on Claude Code auto mode: https://www.techradar.com/pro/anthropic-gives-claude-code-new-auto-mode-which-lets-it-choose-its-own-permissions
- Tom's Hardware report on destructive Claude Code / Terraform incident: https://www.tomshardware.com/tech-industry/artificial-intelligence/claude-code-deletes-developers-production-setup-including-its-database-and-snapshots-2-5-years-of-records-were-nuked-in-an-instant
- OpenAI Codex CLI docs: https://developers.openai.com/codex/cli
- GitHub Copilot docs index: https://docs.github.com/en/copilot
- GitHub Copilot extension installation docs: https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-extension
- GitHub Copilot agents overview: https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/overview
- GitHub Copilot repository indexing docs: https://docs.github.com/en/copilot/concepts/context/repository-indexing
- GitHub Copilot cloud and local sandboxes docs: https://docs.github.com/en/copilot/concepts/about-cloud-and-local-sandboxes
- GitHub Copilot supported models docs: https://docs.github.com/en/copilot/reference/ai-models/supported-models
- GitHub Copilot models and pricing docs: https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing
- Copilot user-problem study: https://arxiv.org/abs/2311.01020
- Cline installation docs: https://docs.cline.bot/getting-started/installing-cline
- Cline overview: https://docs.cline.bot/cline-overview
- Cline usage billing: https://docs.cline.bot/getting-started/cline-provider
- Cline Plan & Act docs: https://docs.cline.bot/core-workflows/plan-and-act
- Cline context docs: https://docs.cline.bot/core-workflows/working-with-files
- Cline checkpoints docs: https://docs.cline.bot/core-workflows/checkpoints
- Cline auto-approve docs: https://docs.cline.bot/features/auto-approve
- Roo Code docs home: https://roocodeinc.github.io/Roo-Code/
- Roo Code installation docs: https://roocodeinc.github.io/Roo-Code/getting-started/installing/
- Roo Code providers docs: https://roocodeinc.github.io/Roo-Code/providers/
- Roo Code FAQ: https://roocodeinc.github.io/Roo-Code/faq/
- Roo Code VS Marketplace listing: https://marketplace.visualstudio.com/items?itemName=RooVeterinaryInc.roo-cline
- Continue docs home: https://docs.continue.dev/
- Continue CLI quickstart: https://docs.continue.dev/cli/quickstart
- Continue CLI configuration: https://docs.continue.dev/cli/configuration
- Continue CLI tool permissions: https://docs.continue.dev/cli/tool-permissions
- Continue config reference: https://docs.continue.dev/reference
- Continue repository: https://github.com/continuedev/continue
- Continue acquisition page: https://www.continue.dev/
- Windsurf / Devin Desktop getting started docs: https://docs.devin.ai/desktop/getting-started

## Cross-Product Findings

### Verified facts

| Category | Evidence-backed pattern |
|---|---|
| Installation experience | Tools split into three delivery shapes: IDE-based installs (Cursor, Copilot, Cline, Roo, Continue, Windsurf / Devin Desktop), CLI installs (Claude Code, Codex, Cline, Continue, Copilot CLI), and cloud/remote agents (Claude Code web, Codex cloud, Copilot cloud agent, Cursor cloud agents). |
| First-time user experience | Most products require sign-in or provider setup before serious use. Claude Code prompts login on first CLI use; Codex asks the user to sign in on first run; Cline requires provider setup or Cline auth; Continue CLI asks for Continue login or an Anthropic API key; Windsurf / Devin Desktop requires login or API key. |
| Project understanding | Products increasingly advertise codebase indexing, semantic search, repository context, or agent exploration. Cursor advertises complete codebase understanding; Copilot indexes repositories for context; Cline and Roo use file/folder mentions and codebase tools; Claude Code reads files and manages context explicitly. |
| Context management | Claude Code has the most explicit public docs on context fill, compaction, subagents, `/context`, `/memory`, and 1M-token model variants. Continue exposes config-level model/context providers. Copilot documents semantic repository indexing. Cline and Roo expose user-driven `@` mentions and file/folder context. |
| Local model support | Cline, Roo Code, and Continue explicitly support local providers such as Ollama and/or LM Studio. Copilot supports local sandboxes but its documented model list is hosted remote models, not local model inference. Claude Code docs mention third-party providers for CLI and VS Code, but local-model support is `UNKNOWN` from the reviewed official pages. Codex local-model support is `UNKNOWN` from official Codex CLI docs. Cursor local model support is `UNKNOWN` from reviewed official pages. Windsurf / Devin Desktop local model support is `UNKNOWN` from reviewed docs. |
| Remote model support | All reviewed products except local-only usage scenarios rely on remote models or remote provider accounts. Cursor lists OpenAI, Anthropic, Gemini, xAI/Grok, and Cursor models; Copilot lists OpenAI, Anthropic, Google, Microsoft, Moonshot, and fine-tuned models; Cline and Roo support many remote providers; Claude Code uses Claude subscriptions, Anthropic Console, and third-party providers; Continue supports configured providers; Codex uses OpenAI models. |
| Editing workflow | The products converge on chat-driven multi-file edits, terminal/shell integration, diffs, and plan/review loops. Cursor, Claude Code, Codex, Cline, Roo, Continue, and Copilot all expose an agent workflow that can inspect files, edit code, and run commands in at least one surface. |
| Safety features | Safety mechanisms include permission modes, sandboxes, protected paths, approval prompts, content exclusion, checkpoints, and review flows. Claude Code and Continue have explicit permission modes; Codex exposes permissions and sandboxing; Copilot documents cloud/local sandboxes and content filters; Cline documents auto-approve settings and checkpoints; Roo prompts for tool use unless auto-approval is enabled. |
| Approval workflow | Approval workflows vary from per-action prompts to auto/YOLO modes. Claude Code has manual, accept-edits, plan, auto, dontAsk, and bypass modes. Continue has allow/ask/exclude tool permissions. Cline defaults to explicit approval but has Auto Approve and YOLO mode. Roo prompts per tool unless auto-approval is enabled. Codex exposes `/permissions`. |
| Rollback capability | Cline has detailed checkpoints with shadow Git and restore options. Codex advises Git checkpoints before and after tasks. Copilot CLI has documented rollback articles in its navigation. Roo falls back to VS Code undo and experimental checkpoints. Claude Code rollback is `UNKNOWN` from reviewed official docs, beyond ordinary Git/session management. Cursor rollback is `UNKNOWN` from reviewed official docs. Continue rollback is `UNKNOWN` from reviewed docs. Windsurf rollback is `UNKNOWN` from reviewed docs. |
| Performance | Performance bottlenecks recur around context size, indexing, checkpoint storage, token cost, and model latency. Claude Code documents context compaction and large-context models. Copilot says initial indexing can take up to 60 seconds for large repositories. Cline warns checkpoints may slow very large repositories. |
| Cost | Cost models are moving from flat subscriptions toward credits, usage limits, and overage billing. Cursor pricing includes free, $20/month individual, $40/user/month teams, and usage-based overage. Copilot uses plan-based AI credits. Cline has pay-as-you-go credits, free model options, ClinePass at $9.99/month, and BYOK. Roo is free/open-source but depends on paid providers. Continue has no active subscription evidence after acquisition/final release; provider/API costs still apply for local config. Claude and Codex cost depend on subscription/API plan. |
| Offline capability | Offline capability exists only where local models and local extension/CLI operation are supported. Roo says offline is possible with local models. Continue documents running without internet and supports Ollama in config. Cline local/offline support is implied by local runtimes/BYOK but exact offline coverage is `UNKNOWN` from reviewed pages. Copilot, Claude Code, Codex, Cursor, and Windsurf offline operation are `UNKNOWN` or unlikely for model inference based on reviewed docs. |
| Extensibility | MCP, plugins, rules, skills, hooks, custom agents, and config files are common extensibility surfaces. Claude Code supports MCP, skills, hooks, subagents, and Agent SDK. Codex supports skills, plugins, MCP, hooks, and subagents. Copilot supports MCP, custom agents, hooks, plugins, and SDK. Cline supports MCP, skills, plugins, hooks, SDK, and connectors. Continue supports config.yaml, MCP servers, rules, prompts, docs, and data destinations. Roo supports MCP and custom modes. Cursor supports MCPs, skills, hooks, marketplace, and team marketplace. |

### Opinion / interpretation, not recommendations

- The competitive center of gravity is no longer autocomplete; it is controlled agent execution with context, tools, approvals, and rollback.
- The strongest repeated tensions are setup friction versus power, autonomy versus safety, and subscription simplicity versus inference-cost reality.
- Local-first and low-cost positioning remains differentiated because most leading products assume networked model calls or paid hosted capacity for best results.

## Cursor

### Verified facts

| Evidence area | Finding |
|---|---|
| Installation experience | Cursor is distributed as a desktop IDE and also advertises a CLI install command, `curl https://cursor.com/install -fsS | bash`, on its product page. |
| First-time user experience | Cursor's public product page foregrounds "Get Cursor" / download, agents, tab completion, CLI, Slack, cloud agents, automations, and review. |
| Project understanding | Cursor advertises "complete codebase understanding" and says it learns how a codebase works at scale. |
| Context management | Cursor advertises codebase indexing and semantic search, but detailed mechanics were not available from the reviewed official pages. Context management details: `UNKNOWN`. |
| Local model support | Reviewed official pages did not provide verified local model support. Local model support: `UNKNOWN`. |
| Remote model support | Cursor says users can choose models from OpenAI, Anthropic, Gemini, SpaceXAI/xAI, and Cursor. |
| Editing workflow | Cursor supports tab completion, command edits, full agent work, cloud agents, CLI, Slack integration, GitHub review, and "ready for review" handoff patterns in its product page demos. |
| Safety features | Pricing page lists enterprise repository, model, MCP access controls, auto-run controls, browser/network controls, audit logs, and privacy mode. |
| Approval workflow | Detailed approval workflow was not found in reviewed official pages. Approval workflow: `UNKNOWN`. |
| Rollback capability | Verified rollback/checkpoint docs were not found in reviewed official pages. Rollback capability: `UNKNOWN`. |
| Performance | Cursor positions speed and robustness as product work in the CEO interview; no independent benchmark was collected in this task. |
| Cost | Cursor pricing lists a free Hobby tier, $20/month Individual Pro, $40/user/month Teams, and Custom Enterprise. Plans include model usage and on-demand overage. |
| Offline capability | Offline model inference support was not verified. Offline capability: `UNKNOWN`. |
| Extensibility | Cursor pricing and product pages list MCPs, skills, hooks, cloud agents, team marketplace, and marketplace features. |

### Most common user complaints / requested improvements

Verified evidence:

- Pricing and usage-limit confusion is documented by The Verge's interview with Cursor's CEO, which discusses user anger after a shift toward usage-based pricing and users running over limits unexpectedly.
- Business Insider separately reports that Cursor's usage-based pricing became expensive for some users and that communication around a pricing change caused confusion and frustration.
- The reviewed official pages show current usage-based pricing remains part of the model through included usage and on-demand billing.

Most common complaints inferred from collected evidence:

- Pricing predictability and usage-limit clarity.
- Cost escalation for long-running agent work.
- Need for clearer communication around usage-based billing.

Most requested improvements:

- Verified from reviewed sources: clearer pricing / usage communication.
- Other requested improvements: `UNKNOWN`.

### Opinion / interpretation, not recommendation

- Cursor appears strongest as a polished AI IDE and agent workspace, but the verified evidence shows pricing predictability is a major trust pressure.

## Claude Code

### Verified facts

| Evidence area | Finding |
|---|---|
| Installation experience | Claude Code installs by native script on macOS/Linux/WSL, PowerShell/CMD on Windows, Homebrew, WinGet, and Linux package managers. Native installs auto-update; Homebrew and WinGet require manual upgrades. |
| First-time user experience | First CLI use is `cd your-project` then `claude`; the user is prompted to log in. Claude Code is available in terminal, VS Code, JetBrains, desktop, web, and mobile handoff surfaces. |
| Project understanding | Claude Code is described as reading a codebase, editing files, running commands, and integrating with development tools. |
| Context management | Claude Code documents what enters context, automatic compaction, `/compact`, `/clear`, `/context`, `/memory`, subagents for large reads, auto memory, CLAUDE.md, rules, skills, and 1M-token model variants. |
| Local model support | Reviewed official pages did not verify local model inference. Third-party providers are mentioned for Terminal CLI and VS Code. Local-model support: `UNKNOWN`. |
| Remote model support | Claude Code requires a Claude subscription or Anthropic Console account for most surfaces and supports third-party providers for some local surfaces. |
| Editing workflow | Claude Code can plan, edit across files, run commands, create commits and pull requests, perform code review/CI workflows, and use MCP/tool integrations. |
| Safety features | Claude Code documents manual prompts, protected paths, deny/ask rules, plan mode, auto mode with classifier checks, dontAsk, bypass permissions, and blocked categories such as destructive infrastructure commands and force-push scenarios. |
| Approval workflow | Manual/default mode asks before edits, shell commands, or network requests. Plan mode researches without editing until a plan is approved. Accept-edits mode permits scoped edits. Auto mode uses a classifier. Bypass mode is documented for isolated containers/VMs only. |
| Rollback capability | Dedicated rollback/checkpoint capability was not verified from reviewed docs. Ordinary Git workflows are supported. Rollback capability: `UNKNOWN`. |
| Performance | Claude Code documents context fill, compaction, prompt caching, subagents, and larger context windows as context/performance management tools. |
| Cost | Claude Code access is tied to Claude subscriptions or Anthropic Console/API use. The specific current coding-agent cost for each plan was not fully extracted beyond the Claude pricing source. |
| Offline capability | Offline model inference was not verified. Offline capability: `UNKNOWN`. |
| Extensibility | Claude Code supports MCP, CLAUDE.md, rules, skills, hooks, subagents, custom agents, and Agent SDK. |

### Most common user complaints / requested improvements

Verified evidence:

- Claude Code docs explicitly describe permission prompts as pauses that affect session flow and document auto mode to reduce routine prompts.
- TechRadar reports Anthropic introduced auto mode because conservative permissions caused interruptions and because some developers bypassed permissions, creating security risks.
- Tom's Hardware reports a high-impact user incident in which Claude Code, operating with broad command authority in a Terraform workflow, contributed to destruction of production infrastructure and backups; the postmortem emphasized manual approval of destructive commands.
- Business Insider reports heavy Claude Code use can produce very high inference costs, and that Anthropic planned weekly rate limits for extreme usage.

Most common complaints inferred from collected evidence:

- Permission-prompt fatigue versus safety risk.
- Cost/rate-limit pressure for long-running or parallel agent workflows.
- Risk of destructive command execution when permissions and infrastructure context are too broad.

Most requested improvements:

- Verified from reviewed sources: fewer routine permission interruptions while preserving safety.
- Other requested improvements: `UNKNOWN`.

### Opinion / interpretation, not recommendation

- Claude Code has the clearest public permission model among reviewed tools, but its own documentation and external incident reporting show that safety depends heavily on permission boundaries, environment isolation, and user review discipline.

## OpenAI Codex

### Verified facts

| Evidence area | Finding |
|---|---|
| Installation experience | Codex CLI installs via standalone installer on macOS/Linux, with Windows/npm/Homebrew install paths shown in the docs navigation. The quickstart shows `curl -fsSL https://chatgpt.com/codex/install.sh | sh`. |
| First-time user experience | The user opens a project directory, runs `codex`, chooses sign-in on first run, and starts by describing a task. The CLI suggests `/init`, `/status`, `/permissions`, `/model`, and `/review`. |
| Project understanding | Codex CLI works against the local repository, can inspect files, make edits, run local tools, explain projects, plan changes, and debug issues. |
| Context management | Codex docs expose context indicators, resume sessions, subagents, visual/image context, and web search. Detailed context-compaction mechanics were not fully reviewed. |
| Local model support | Reviewed official Codex docs did not verify local model inference. Local model support: `UNKNOWN`. |
| Remote model support | Codex uses OpenAI models; the CLI screenshot shows model selection and reasoning effort. |
| Editing workflow | Codex supports interactive terminal work, `codex exec` for repeatable workflows, local edits, local command execution, code review, skills, plugins, MCP, cloud handoff, and CI-style non-interactive work. |
| Safety features | Codex docs list permissions, sandboxing, auto-review, agent approvals/security, internet access controls, local environments, cloud environments, and Git worktrees. |
| Approval workflow | Codex CLI exposes `/permissions` to choose edit/command boundaries and inspect sandbox/writable roots. Detailed prompt modes were not fully extracted in this research pass. |
| Rollback capability | Codex quickstart advises creating Git checkpoints before and after a task so changes can be reverted. |
| Performance | Codex docs expose model/reasoning selection and speed configuration in navigation. No independent benchmark was collected. |
| Cost | Codex cost depends on OpenAI/ChatGPT/API plan; exact current plan cost was not extracted from reviewed Codex docs. Cost: `UNKNOWN` beyond OpenAI plan dependency. |
| Offline capability | Offline model inference was not verified. Offline capability: `UNKNOWN`. |
| Extensibility | Codex supports skills, plugins, MCP, hooks, subagents, non-interactive mode, GitHub Action, SDK, and app/server integration surfaces. |

### Most common user complaints / requested improvements

Verified evidence:

- Reviewed official docs emphasize permissions, sandboxing, review, and Git checkpoints, implying safety/control is central to the product surface.
- An arXiv Codex usage study found Codex adoption and agentic task complexity grew rapidly in the first half of 2026, including concurrent agents and skills usage, implying pressure on context, orchestration, and output volume.

Most common complaints:

- Public complaint evidence specific to current Codex was not sufficiently collected in this task. `UNKNOWN`.

Most requested improvements:

- Public requested-improvement evidence specific to current Codex was not sufficiently collected in this task. `UNKNOWN`.

### Opinion / interpretation, not recommendation

- Codex appears positioned as a terminal-first controlled agent with extensibility and sandboxing. The reviewed evidence is stronger for capabilities than for public complaint patterns.

## GitHub Copilot

### Verified facts

| Evidence area | Finding |
|---|---|
| Installation experience | Copilot supports multiple IDE environments including VS Code, JetBrains, Visual Studio, Eclipse, Vim/Neovim, Azure Data Studio, and Xcode. Use requires Copilot Free limited access or a paid plan for full access. |
| First-time user experience | IDE installation requires extension/plugin setup and GitHub sign-in/authorization. Copilot cloud agent can be tried end-to-end in about ten minutes and is available for all paid Copilot plans. |
| Project understanding | Copilot improves repository answers and tasks by indexing repositories. Copilot cloud agent uses semantic code search to find relevant code by meaning. |
| Context management | Copilot documents repository indexing, semantic code search, content exclusion, Spaces, MCP, memory, and context configuration. Initial indexing can take up to 60 seconds for a large repository. |
| Local model support | Reviewed docs list hosted model providers and local sandboxes, not local model inference. Local model support: `UNKNOWN` / not verified. |
| Remote model support | Copilot supports multiple remote models from OpenAI, Anthropic, Google, Microsoft, Moonshot, and fine-tuned GPT variants. Model availability depends on plan and client. |
| Editing workflow | Copilot supports IDE suggestions, chat, CLI, cloud agent sessions, GitHub issue/PR workflows, code review, custom agents, and agent apps. |
| Safety features | Copilot documents cloud and local sandboxes, content filters, public code matching when enabled, content exclusion, model policies, MCP controls, budgets, and audit logs. |
| Approval workflow | Copilot cloud/CLI approval details were not fully extracted, but docs navigation includes tool allowance, rollback, custom agents, hooks, policies, and enterprise controls. |
| Rollback capability | Copilot CLI docs navigation includes "Cancel and roll back" and "Roll back changes"; detailed mechanics were not extracted. |
| Performance | GitHub documents model choices by speed/cost/accuracy tradeoff, auto model selection, and indexing timing. |
| Cost | Copilot uses Free, Pro, Pro+, Max, Business, and Enterprise plan structures with AI credit allowances that vary by plan; organization and enterprise allowances are pooled at billing entity level. |
| Offline capability | Offline model inference was not verified. Local sandboxes are execution isolation, not local model inference. Offline capability: `UNKNOWN`. |
| Extensibility | Copilot supports MCP, custom agents, hooks, plugin directories, skills, SDK, CLI extensions, agent apps, and GitHub integration workflows. |

### Most common user complaints / requested improvements

Verified evidence:

- A 2023 empirical study of Copilot problems from 473 GitHub issues, 706 GitHub discussions, and 142 Stack Overflow posts found operation issues and compatibility issues were the most common problems; frequent causes included internal errors, network connection errors, and editor/IDE compatibility.
- GitHub's own docs include troubleshooting sections for common issues, logs, firewall settings, network errors, and slow responses.
- GitHub's supported-model docs state model availability can change and depends on plan/client.

Most common complaints inferred from collected evidence:

- Operational reliability.
- Network/firewall/auth issues.
- IDE compatibility.
- Slow responses.
- Model availability or plan gating.

Most requested improvements:

- Verified from the Copilot study: fixes to bugs, configuration/settings, and suitable versions were common solution areas; improvement requests likely cluster around reliability and compatibility.
- Other requested improvements: `UNKNOWN`.

### Opinion / interpretation, not recommendation

- Copilot is the broadest enterprise-integrated assistant in the set, but its breadth creates a larger surface for compatibility, policy, and model-availability complexity.

## Cline

### Verified facts

| Evidence area | Finding |
|---|---|
| Installation experience | Cline supports IDE extensions for VS Code, Cursor, JetBrains, Windsurf, VSCodium, Antigravity, plus CLI via `npm install -g cline`, Kanban via `npx kanban`, and SDK via `npm install @cline/sdk`. CLI requires Node.js 20+ according to install docs. |
| First-time user experience | The IDE flow is extension install, open Cline, then authorize/provider setup. The CLI flow is install, `cline auth`, then `cline` or `cline "your task"`. |
| Project understanding | Cline can read/write files, run terminal commands, use a browser, and help build features. Plan mode lets it explore a codebase before edits. |
| Context management | Cline supports `@` file and folder mentions, drag/drop files, selected code context, terminal/source-control context, Memory Bank, rules, skills, and `.clineignore`. |
| Local model support | Cline supports BYOK for cloud providers or local runtimes and links to local models. |
| Remote model support | Cline usage billing provides one sign-in for 100+ models, pay-as-you-go credits, free model options, ClinePass, and BYOK remote providers. |
| Editing workflow | Cline has Plan and Act modes. Plan mode can read/search/discuss without file changes; Act mode modifies files/runs commands based on the plan. |
| Safety features | Cline defaults to explicit approval, supports Plan mode, Auto Approve, YOLO mode warnings, `.clineignore`, and checkpoints. Enterprise features include SSO, RBAC, model/tool controls, remote configuration, and observability. |
| Approval workflow | Every action requires explicit approval by default. Auto Approve can allow selected categories. YOLO mode auto-approves file changes, terminal commands, browser actions, MCP tools, and mode transitions, and is documented as dangerous. |
| Rollback capability | Checkpoints are enabled by default and use a shadow Git repository. Cline can restore files, restore task only, or restore files and task. |
| Performance | Cline warns checkpoints may use significant storage and slow down very large repositories because it commits snapshots after each tool use. |
| Cost | Cline provider is pay-as-you-go with credits and free model options; ClinePass is $9.99/month for selected open coding models with higher rate limits; BYOK costs depend on provider. |
| Offline capability | Cline supports local runtimes, but exact offline behavior was not fully verified. Offline capability: `UNKNOWN`. |
| Extensibility | Cline supports MCP, rules, skills, plugins, hooks, connectors, scheduling, subagents, agent teams, CLI, Kanban, and SDK. |

### Most common user complaints / requested improvements

Verified evidence:

- Cline docs identify setup/provider choice as a major onboarding area, with usage-billing, ClinePass, BYOK, and local providers.
- Cline docs warn checkpoints can slow very large repositories.
- Cline docs warn YOLO mode can delete important files, modify system settings, make network requests, overwrite config, install/uninstall packages, and commit/push changes.

Most common complaints inferred from collected evidence:

- Provider/model setup complexity.
- Cost and token usage management.
- Approval fatigue versus YOLO/auto-approve risk.
- Checkpoint overhead in large repositories.

Most requested improvements:

- Verified from docs emphasis: simpler model access and reduced approval friction are active product directions.
- Other requested improvements: `UNKNOWN`.

### Opinion / interpretation, not recommendation

- Cline has strong transparency around power-user controls, but its setup surface is broad enough that first-time simplicity depends heavily on the chosen provider path.

## Roo Code

### Verified facts

| Evidence area | Finding |
|---|---|
| Installation experience | Roo Code installs as a VS Code extension through VS Code Marketplace or Open VSX; manual VSIX installation is documented. Marketplace listing reports the extension as free. |
| First-time user experience | User installs extension, opens the Roo Code panel, connects an AI provider, and starts tasks through chat. |
| Project understanding | Roo can generate code, refactor/debug, write docs, answer codebase questions, automate tasks, and use MCP. Codebase indexing creates semantic search with embeddings and Qdrant. |
| Context management | Roo supports context mentions such as files, folders, and problems. It supports modes such as Code, Architect, Ask, Debug, and custom modes. |
| Local model support | Roo supports local models through Ollama and LM Studio. Roo FAQ says offline use is possible with a local model. |
| Remote model support | Roo provider docs list Anthropic, ChatGPT Plus/Pro, AWS Bedrock, DeepSeek, Fireworks, Gemini, LiteLLM, Mistral, OpenAI, OpenRouter, Vercel AI Gateway, xAI/Grok, and others. |
| Editing workflow | Roo can read/write project files, execute shell commands, perform web browsing if enabled, and use MCP tools. It prompts for tool approval unless auto-approval is enabled. |
| Safety features | Roo FAQ warns users to review changes, be cautious with command execution, and consider internet/security implications. Modes and tool permissions provide some control. |
| Approval workflow | Roo prompts the user to approve or reject each tool use unless auto-approval is enabled. |
| Rollback capability | Roo uses VS Code undo; if experimental checkpoints are enabled, Roo can revert file changes. |
| Performance | Roo docs state codebase indexing uses OpenAI embeddings and Qdrant; initial indexing is the most expensive part, subsequent updates are incremental and cheaper. |
| Cost | Roo extension is free/open-source, but external inference providers usually charge by token. Codebase indexing requires OpenAI API key and Qdrant storage. |
| Offline capability | Roo FAQ says offline use is possible with local models. |
| Extensibility | Roo supports MCP, custom instructions, custom modes, `.roorules`, settings, provider configuration, and codebase indexing. |

Important status fact:

- Roo Code docs and VS Marketplace listing state the Roo Code Extension was shut down on May 15. The docs point users to ZooCode and Cline alternatives. The docs page itself was last updated May 15, 2026.

### Most common user complaints / requested improvements

Verified evidence:

- Roo FAQ lists common troubleshooting areas: API key validity, internet connection, provider status, restarting VS Code, unwanted changes, and markdown write failures caused by interfering extensions/settings.
- Roo FAQ says users must be cautious with command execution and auto-approval.
- Roo docs state model/provider choice is large enough to be overwhelming and explicitly says "Yeah, it's a lot."
- Roo shutdown is a major product-continuity issue for users.

Most common complaints inferred from collected evidence:

- Provider/API setup and provider availability.
- Extension/editor interference.
- Markdown write failures.
- Cost of embeddings/provider tokens.
- Product continuity after shutdown.

Most requested improvements:

- Verified from docs/troubleshooting: better provider setup, reliability, local model setup, and safer rollback/undo paths.
- Other requested improvements: `UNKNOWN`.

### Opinion / interpretation, not recommendation

- Roo's capability set remains relevant as a model-agnostic VS Code agent, but shutdown status materially changes how its evidence should be weighed for future planning.

## Continue

### Verified facts

| Evidence area | Finding |
|---|---|
| Installation experience | Continue is available as CLI, VS Code extension, and JetBrains plugin. CLI quickstart installs via shell script or npm path, then verifies with `cn --version`. |
| First-time user experience | First run is `cd your-project` then `cn`; the user logs in with Continue or enters an Anthropic API key. TUI mode is interactive; headless mode supports `cn -p "prompt"`. |
| Project understanding | Continue CLI is a terminal-based coding agent that can edit files, run commands, and work through multi-step tasks. |
| Context management | Continue uses config.yaml for models, context providers, rules, prompts, docs, MCP servers, and data destinations. It supports file/code/diff/terminal context providers and documentation indexing. |
| Local model support | Continue config supports `provider: ollama` and includes an Ollama Starcoder example. Docs include guides for Ollama, running without internet, and self-hosting models in navigation. |
| Remote model support | Continue supports OpenAI, Anthropic via configured models/API keys, custom OpenAI-compatible endpoints, and other configured providers. |
| Editing workflow | Continue has TUI mode, headless mode, `@` references, tool approvals, edit/write tools, Bash, plan mode, auto mode, and read-only mode. |
| Safety features | Tool permissions default read-only tools to allow, write tools and Bash to ask, and headless mode excludes ask tools because no user can approve. Permissions can be allow/ask/exclude and persisted in `~/.continue/permissions.yaml`. |
| Approval workflow | TUI users approve tool calls. Flags can allow, ask, or exclude tools. `--auto` allows all tools. `--readonly` excludes write tools. |
| Rollback capability | Dedicated rollback capability was not verified. Rollback capability: `UNKNOWN`. |
| Performance | No independent performance evidence collected. Config exposes timeouts and context length. Performance: `UNKNOWN` beyond configurable model options. |
| Cost | Continue's current product subscription state changed after acquisition. Provider/API costs apply when using Anthropic/API keys or other models. Current subscription cost: `UNKNOWN`. |
| Offline capability | Continue supports local/self-hosted models and docs include "How to Run Continue Without Internet" in navigation. |
| Extensibility | Continue supports config.yaml, models, context providers, rules, prompts, docs crawling, MCP servers, data destinations, and local YAML configs. |

Important status fact:

- Continue docs and repository state the `continuedev/continue` repository is no longer actively maintained and is read-only. Continue shipped a final 2.0.0 release and was acquired by Cursor.

### Most common user complaints / requested improvements

Verified evidence:

- Continue's active maintenance status is the dominant current issue: official docs say the repository is read-only and no longer actively maintained.
- Continue docs say the final release removed anonymous telemetry, removed authentication, and fixed bugs, indicating prior friction around telemetry/auth/bugs.
- Tool permission docs show headless mode excludes ask tools because approval is impossible, which is a workflow constraint.

Most common complaints inferred from collected evidence:

- Project continuity / maintenance.
- Authentication and telemetry concerns before final release.
- Need for clear permissions in automation/headless use.

Most requested improvements:

- Verified from final-release notes: removal of anonymous telemetry, removal of authentication, and bug fixes were addressed in final release.
- Other requested improvements: `UNKNOWN`.

### Opinion / interpretation, not recommendation

- Continue is valuable evidence for local-first, configurable, open-source agent design, but its acquired/read-only status limits it as evidence for active competitor trajectory.

## Windsurf / Devin Desktop

### Verified facts

| Evidence area | Finding |
|---|---|
| Installation experience | The Windsurf docs URL redirects to Devin Desktop docs. Devin Desktop installs on Mac, Windows, or Linux. Minimum OS requirements are documented. |
| First-time user experience | Onboarding includes theme selection, optional terminal command install, settings import from VS Code/Cursor, login/sign-up, and starting from the IDE home surface. Login is required; manual API-key login is available if normal login fails. |
| Project understanding | Devin Desktop docs say context awareness "instantly understands your codebase" and include Codemaps/DeepWiki context features in navigation. |
| Context management | Docs list memories/rules, MCP, context awareness, Codemaps, and DeepWiki. Detailed mechanics were not fully extracted. |
| Local model support | Reviewed docs did not verify local model inference. Local model support: `UNKNOWN`. |
| Remote model support | The docs describe Devin account/API-key login and model settings, but specific provider/model support was not extracted. Remote model support details: `UNKNOWN`. |
| Editing workflow | Devin Desktop is an AI IDE with an agent panel for chat, writing code, and running code. It supports opening local folders, remote SSH, local dev containers, upgraded terminal, browser previews, AI commit messages, and one-click app deploys. |
| Safety features | Reviewed docs did not expose detailed permission or sandbox controls. Safety features: `UNKNOWN` beyond account/settings and local agent references. |
| Approval workflow | Approval workflow was not found in reviewed docs. Approval workflow: `UNKNOWN`. |
| Rollback capability | Rollback capability was not found in reviewed docs. Rollback capability: `UNKNOWN`. |
| Performance | Performance details were not verified. Performance: `UNKNOWN`. |
| Cost | Docs mention credits and usage pages, and paid users can customize app icons. Specific pricing was not extracted. Cost: `UNKNOWN`. |
| Offline capability | Offline model inference was not verified. Offline capability: `UNKNOWN`. |
| Extensibility | Devin Desktop supports MCP servers. Docs also state users cannot install extensions through any marketplace on Devin Desktop and some AI/proprietary extensions are incompatible. |

### Most common user complaints / requested improvements

Verified evidence:

- Devin Desktop docs state users must log in and may need manual API-key login if normal login fails.
- Docs state some extensions are incompatible, including other AI code-completion extensions and proprietary extensions.
- Docs state users cannot install extensions through any marketplace on Devin Desktop.

Most common complaints inferred from collected evidence:

- Extension compatibility limitations.
- Marketplace limitation for extensions.
- Account/login friction.
- Unknowns around pricing and model/provider transparency from reviewed docs.

Most requested improvements:

- Verified requested-improvement data was not collected. `UNKNOWN`.

### Opinion / interpretation, not recommendation

- The Windsurf-to-Devin docs transition suggests this product should be treated as a moving target; the current evidence supports IDE/agent positioning but leaves many safety, rollback, local model, and pricing details unknown.

## Evidence Gaps

- Cursor approval workflow, rollback, local model support, offline support, and detailed context mechanics were not verified from reviewed official pages.
- Claude Code rollback/checkpoint capability and local model inference were not verified.
- OpenAI Codex public complaint patterns, exact cost, local model support, and offline support were not verified from reviewed official docs.
- GitHub Copilot local model inference was not verified; local sandboxes are execution environments, not evidence of local model serving.
- Cline exact offline behavior was not verified beyond support for local runtimes.
- Roo Code current operational continuity is limited by official shutdown notice.
- Continue current active product roadmap is limited by acquisition and read-only repository status.
- Windsurf / Devin Desktop pricing, approval workflow, rollback, safety controls, provider/model list, local model support, and offline behavior were not verified from reviewed docs.

## Research Summary

Verified facts:

- All reviewed active tools support some form of agentic coding workflow.
- The most mature control surfaces are permission modes, sandboxing, checkpoints, content exclusion, model policies, and review/diff workflows.
- Local/offline-capable evidence is strongest for Roo Code and Continue, and partially supported by Cline through local runtimes.
- Cost predictability is a repeated friction point in Cursor, Claude Code, Copilot, Cline, and provider-dependent tools.
- Product continuity is a major verified issue for Roo Code and Continue because both have official shutdown/read-only/acquisition notices.

Opinion / interpretation, not recommendation:

- Levi's stated philosophy overlaps most strongly with the market's unresolved tensions: simplicity versus configurability, local-first versus hosted model quality, and safety versus low-friction autonomy.
- The competitive evidence supports treating rollback, approvals, and cost visibility as core trust signals in this product category, without turning that into a roadmap recommendation in this document.

## Validation Plan

Required validation after file creation:

- `git diff --check`
- `git status --short`

