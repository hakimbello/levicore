# Layer 3 Agent Orchestration

## Public APIs

`src/agent-orchestration-engine.js` exports `AgentOrchestrationEngine`, lifecycle constants, conversation/turn/tool states, request classifications, orchestration modes, default configuration, default bounds, and a file persistence adapter.

Lifecycle APIs:

- `initialize(options)`
- `shutdown(options)`
- `suspend(reason)`
- `resume(options)`
- `recover(options)`
- `getState()`
- `getConfiguration()`
- `updateConfiguration(patch, options)`
- `getHealth(options)`
- `getStats()`
- `snapshot()`
- `restore(snapshot)`
- `save()`
- `load()`

Conversation APIs:

- `createConversation(input, options)`
- `startConversation(conversationId, options)`
- `sendMessage(conversationId, input, options)`
- `continueConversation(conversationId, input, options)`
- `pauseConversation(conversationId, reason)`
- `resumeConversation(conversationId, options)`
- `cancelConversation(conversationId, reason)`
- `completeConversation(conversationId, result)`
- `failConversation(conversationId, error)`
- `getConversation(conversationId)`
- `listConversations(filter)`
- `deleteConversation(conversationId, options)`

Turn, tool, and stream APIs are implemented through `createTurn`, `executeTurn`, `cancelTurn`, `retryTurn`, `getTurn`, `listTurns`, `getTurnResult`, `explainTurn`, `registerTool`, `validateToolCall`, `proposeToolCall`, `executeToolCall`, `cancelToolCall`, `subscribe`, `unsubscribe`, `getEvents`, and `clearEvents`.

## Normalized Models

The engine normalizes:

- `AgentConfiguration`
- `AgentConversation`
- `AgentTurn`
- `AgentMessage`
- `AgentToolDefinition`
- `AgentToolCall`

Records carry stable IDs, timestamps, state, evidence, warnings, limitations, confidence, completeness, metadata, privacy classifications where content is present, and frontend-safe serialization.

## Lifecycle States

Agent states: CREATED, INITIALIZING, READY, DEGRADED, SUSPENDED, SHUTTING_DOWN, STOPPED, FAILED.

Conversation states: CREATED, ACTIVE, WAITING_FOR_MODEL, STREAMING, WAITING_FOR_TOOL, WAITING_FOR_APPROVAL, EXECUTING_TOOL, VALIDATING, REPAIRING, PAUSED, CANCELLING, CANCELLED, COMPLETED, FAILED, EXPIRED.

Turn states: CREATED, CLASSIFYING, GATHERING_CONTEXT, PLANNING, REQUESTING_MODEL, STREAMING, PROCESSING_RESPONSE, PROPOSING_TOOLS, WAITING_FOR_APPROVAL, EXECUTING_TOOLS, VALIDATING, REPAIRING, SYNTHESIZING, SUCCEEDED, PARTIALLY_SUCCEEDED, CANCELLED, FAILED, TIMED_OUT.

Tool-call states: PROPOSED, VALIDATING, INVALID, WAITING_FOR_APPROVAL, APPROVED, REJECTED, QUEUED, RUNNING, SUCCEEDED, PARTIALLY_SUCCEEDED, FAILED, CANCELLED, EXPIRED.

## Orchestration Modes

Modes are OFFLINE_ONLY, READ_ONLY, PROPOSAL_ONLY, APPROVAL_GATED, EXECUTION_ENABLED, and DIAGNOSTIC. The default is PROPOSAL_ONLY.

Source-changing and command-executing tools are not executed in OFFLINE_ONLY, READ_ONLY, or PROPOSAL_ONLY. Protected actions require explicit approval; there is no auto-approval setting.

## Classification Behavior

Classification is deterministic by default. It considers user wording, selected-file/symbol scope, operation intent, requested output, source-changing intent, command-execution intent, security sensitivity, approval sensitivity, and validation language.

An optional model classification adapter may enrich classification, but the adapter is not required and failure does not block deterministic operation.

## Capability Resolution

Capabilities are discovered through `LeviApplicationRuntime.discoverRuntimeCapabilities`. The orchestrator does not infer capability availability from files or module presence. Missing capabilities produce partial/unavailable results with alternatives and evidence, and dependent tools are skipped.

## Context Flow

Context is coordinated through runtime command `context.build`. The agent does not crawl the repository independently.

Context requests include workspace, project, selected file, symbol, query, purpose, maximum token budget, privacy classification, and evidence references. Context limits preserve current user instructions, security instructions, project instructions, evidence references, and authority-critical information. Omissions become limitations.

## Planning Flow

Planning is coordinated through runtime command `planning.create` and existing planning capability. Plans are created or reused for multi-step work, source-changing intent, protected execution, dependency-heavy work, validation-heavy work, explicit planning requests, feature work, refactors, debugging, repair, and testing.

Simple questions and explanations do not require a plan.

## Model Flow

Provider requests are built from user input, conversation summary, constraints, bounded context summary, accepted plan ID, tool results, available tool definitions, expected output contract, evidence references, and strictest privacy classification.

Routing uses `ModelProviderGateway` when available, otherwise runtime `model.*` commands. The engine supports default routing, privacy-first routing, explicit provider/model options, streaming, cancellation, provider errors, and no-provider fallback.

## Tool-Call Flow

Initial tools are read-only runtime-command tools for project summaries, assessments, architecture, blockers, risks, next actions, release readiness, repository search, graph query, code understanding, planning, context, runtime health/capabilities/certification, model health, and model routing preview.

Tool validation checks known ID/name, serializable arguments, required schema keys, required capabilities, mode, source-changing flags, command-executing flags, security/approval flags, privacy constraints, and duplicates. Duplicate signatures include tool ID, normalized arguments, workspace revision, plan step, and context revision.

## Approval Flow

Any tool that is source-changing, command-executing, security-sensitive, approval-sensitive, irreversible, or outside read-only mode requires approval. The orchestrator never fabricates approval, and model text such as "approved" is not user approval.

Approved execution goes through `LeviApplicationRuntime.executeCommand`; internal LI/AE engines are not called directly.

## Validation And Repair Flow

Validation uses runtime validation capability when available and preserves evidence. Execution success is distinct from objective success. Failed validation prevents completion claims.

Repair uses existing runtime repair capability, requires failure evidence, stays bounded, preserves the original objective, and does not repeat protected work without renewed approval.

## Final Response Rules

Final responses distinguish completed, partially completed, proposal only, blocked, approval required, validation failed, provider unavailable, capability unavailable, cancelled, and timed out outcomes.

Responses include outcome, content, actions taken, actions not taken, evidence, validation status, warnings, limitations, next recommended action, confidence, and completeness. Files are not claimed modified unless runtime operation evidence confirms execution.

## Privacy Behavior

Every user message, context request, model request, and tool result carries or derives privacy classification. The strictest applicable classification governs provider routing. Learning and model preference do not weaken privacy.

No credentials, raw authorization headers, complete prompts, complete provider responses, complete source files, private reasoning, or secret content are persisted.

## Learning Behavior

Learning signals are compact and evidence-based: classification, successful context patterns, successful tool sequences, rejected tool proposals, model request IDs, validation success, repair success, confidence, and completeness.

Adaptations may influence context ranking, planning preferences, provider/model preference, response format, tool ordering, and validation emphasis. They cannot override user instructions, project instructions, privacy policy, security policy, approval policy, verified repository state, or validation evidence.

## Runtime Commands

`LeviApplicationRuntime` optionally exposes:

- `agent.createConversation`
- `agent.sendMessage`
- `agent.continueConversation`
- `agent.cancelConversation`
- `agent.getConversation`
- `agent.listConversations`
- `agent.getTurn`
- `agent.retryTurn`
- `agent.listTools`
- `agent.getHealth`

Runtime initialization does not require the agent component.

## VS Code Commands

The extension contributes:

- `levi.openAgent`
- `levi.newConversation`
- `levi.sendAgentMessage`
- `levi.cancelAgentTurn`
- `levi.retryAgentTurn`
- `levi.showAgentContext`
- `levi.showAgentPlan`
- `levi.showAgentTools`
- `levi.clearConversation`

## Agent View Architecture

The extension contributes `levi.agent` and opens a bounded webview panel for conversation UX. The panel supports creating a conversation, sending a message, displaying state, response content, context/plan/tool summaries, cancellation, retry, and clearing the active conversation.

Security controls:

- restrictive CSP
- nonce-based scripts and styles
- no external resources
- message schema validation
- command allowlist
- no direct workspace access
- no direct provider access
- frontend-safe serialized runtime records
- bounded message sizes

## Persistence Boundaries

Default storage is `.levi/agent-orchestration.json`; the VS Code extension stores summaries below extension storage.

Persisted data includes compact configuration, conversation summaries, turn summaries, message summaries, tool-call summaries, context/plan references, operation references, approval references, evidence references, events, and statistics.

## Recovery Behavior

Recovery validates snapshots, marks in-flight model/tool/turn work interrupted, pauses active conversations, preserves completed evidence, avoids auto-resuming protected operations, requires explicit retry, and lowers confidence through warnings when context may be stale.

## Manual Verification Checklist

- Open extension in Extension Development Host.
- Initialize runtime.
- Connect to local Ollama.
- Create conversation.
- Ask project question.
- Inspect context summary.
- Inspect plan.
- Stream response.
- Cancel response.
- Run read-only repository search tool.
- Trigger protected tool proposal.
- Verify explicit approval requirement.
- Reject approval.
- Verify operation does not execute.
- Approve a safe test operation if supported.
- Inspect operation evidence.
- Reload extension.
- Verify conversation summary recovery.
- Confirm no credentials or secrets appear in logs.
- Confirm deprecated gateway files are not used by runtime or extension.

## Known Limitations

- Manual Extension Development Host verification was not run in this environment.
- The initial Agent webview is intentionally compact; richer transcript rendering can build on the same command bridge.
- Source-changing tools remain unavailable unless future safe adapters and explicit approval flows support them.
- Live Ollama and commercial API providers are not required by tests and were not manually exercised.

## L3-005 Readiness Criteria

L3-004 is ready for L3-005 when all root tests, agent tests, provider tests, VS Code extension tests, syntax checks, manifest validation, and package validation pass; runtime and extension use `ModelProviderGateway` rather than deprecated provider files; and the agent can run no-provider, fake-local-provider, question, project-analysis, planning, context-to-model, streaming, cancellation, read-only tool, approval-rejection, validation-failure, repair, persistence, and VS Code event-to-agent-view flows without regressions.
