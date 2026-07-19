# Layer 3 VS Code Shell

## Package Structure

L3-002 lives in `packages/vscode-extension`.

- `package.json`: VS Code extension manifest, commands, views, menus, configuration, and package scripts.
- `assets/levi.svg`: temporary Activity Bar icon.
- `src/extension.js`: VS Code activation/deactivation entrypoint.
- `src/levi-extension.js`: extension controller, runtime construction, command bindings, event bridge, status/output integration, persistence, approval UX, and workspace lifecycle.
- `src/vscode-workspace-adapter.js`: `VSCodeWorkspaceAdapter`, implementing the L3-001 workspace adapter contract with VS Code APIs.
- `src/view-providers.js`: Overview, Project, Operations, Approvals, and Diagnostics TreeView providers.
- `src/presentation.js`: deterministic presentation models and read-only document rendering.
- `src/virtual-documents.js`: read-only `levi:` virtual document provider.
- `src/vscode-credential-resolver.js`: VS Code SecretStorage resolver for model provider credential references.
- `src/errors.js`: normalized runtime error presentation.
- `src/constants.js`: command IDs, lifecycle event names, exclusions, bounds.
- `src/safe-json.js`: extension-safe serialization and secret filtering.
- `test/`: fake VS Code API, unit/integration tests, and manifest validation.

## Activation Flow

Activation:

1. Records `extension_activation_started`.
2. Reads Levi configuration.
3. Creates the Levi output channel and status bar item.
4. Creates `VSCodeWorkspaceAdapter`.
5. Constructs `LeviApplicationRuntime` with extension storage paths and the workspace adapter.
5. Creates the optional `ModelProviderGateway` with local Ollama and configured OpenAI-compatible provider packages.
6. Registers TreeViews, virtual documents, commands, workspace listeners, configuration listeners, and runtime event subscription.
7. Initializes the runtime with lightweight startup checks.
8. Opens the active workspace when `levi.autoAnalyzeWorkspace` is enabled.
9. Refreshes presentation state and reports READY, DEGRADED, or FAILED.

The extension does not silently swallow runtime initialization failure. It records the failure, updates status, writes the output channel, and shows normalized error UX.

## Runtime Construction

The extension constructs runtime through the public `LeviApplicationRuntime` API only. It passes:

- `storageRoot` from VS Code extension storage.
- `workspaceStorageRoot` below that storage root.
- `offlineMode` from configuration.
- `strictSecurity` preserved as enabled by default.
- `persistenceEnabled` from configuration.
- `workspaceAdapter` as `VSCodeWorkspaceAdapter`.
- `ModelProviderGateway` as an optional component when `levi.models.enabled` is true.

The extension does not import LI/AE engines directly.

## Workspace Adapter

`VSCodeWorkspaceAdapter` implements:

- `normalizeUri(input)`
- `validateWorkspace(input)`
- `openWorkspace(input, options)`
- `closeWorkspace(workspace, options)`
- `getWorkspaceMetadata(workspace)`
- `getWorkspaceRevision(workspace)`
- `listFiles(workspace, options)`
- `readFile(workspace, uri, options)`
- `stat(workspace, uri, options)`
- `watchWorkspace(workspace, listener, options)`
- `unwatchWorkspace(subscriptionId)`
- `resolvePath(workspace, input)`

It supports single-root, multi-root, untitled, remote, and virtual workspace URIs. It uses VS Code workspace APIs rather than direct Node filesystem access for file listing, reads, stats, and watching.

Default exclusions cover `.git`, `.levi`, dependency folders, build/dist/coverage outputs, caches, vendor folders, maps, and minified artifacts. Configuration can extend or replace these patterns.

Revision evidence uses bounded metadata: workspace URI, workspace folders, configuration hash, and optional injected Git revision metadata. It does not hash the full repository on refresh.

## Command Inventory

The extension contributes:

- `levi.openDashboard`
- `levi.initialize`
- `levi.openWorkspace`
- `levi.refreshWorkspace`
- `levi.analyzeProject`
- `levi.showProjectSummary`
- `levi.showArchitecture`
- `levi.showAssessment`
- `levi.showBlockers`
- `levi.showRisks`
- `levi.showNextActions`
- `levi.showReleaseReadiness`
- `levi.searchWorkspace`
- `levi.showCapabilities`
- `levi.showRuntimeHealth`
- `levi.showCertification`
- `levi.runCertification`
- `levi.showOperations`
- `levi.cancelOperation`
- `levi.showApprovals`
- `levi.respondToApproval`
- `levi.saveState`
- `levi.restoreState`
- `levi.understandCurrentFile`
- `levi.showModelProviders`
- `levi.showModels`
- `levi.showModelHealth`
- `levi.selectModel`
- `levi.testModelConnection`
- `levi.showModelUsage`
- `levi.configureProviderCredential`
- `levi.clearProviderCredential`

Bindings invoke runtime public APIs. Unsupported runtime commands surface normalized explanations instead of generic failures.

## View Inventory

Activity Bar container: `Levi`.

Views:

- Overview: runtime/workspace/certification/capability/operation/approval summary.
- Project: runtime query projections for summary, architecture, blockers, risks, next actions, release readiness, confidence, completeness, and limitations.
- Operations: queued/running/waiting/approval/succeeded/partial/failed/cancelled operation groups.
- Approvals: pending/approved/rejected/expired/cancelled approval groups.
- Models: gateway state, provider availability, model catalog, privacy status, and configured provider summaries.
- Diagnostics: extension/runtime integration failures, stale state, last normalized error, and extension lifecycle records.

## Event Mapping

Runtime lifecycle, workspace lifecycle, operation lifecycle, operation progress, approval, health, persistence, recovery, degraded, failure, and certification events map to:

- Bounded output-channel records.
- Status bar state.
- TreeView refreshes.
- Progress updates.
- Approval presentation state.
- Diagnostics presentation cache.

Progress events are coalesced. Non-terminal refreshes are throttled. Terminal events refresh immediately. The extension keeps a bounded presentation cache and does not write extension lifecycle events back into runtime event history.

## Approval Workflow

The approval flow requires explicit user action:

1. User runs `Levi: Review Approvals`.
2. User selects one pending request.
3. Extension shows requested action, risks, and scope.
4. User chooses Approve or Reject.
5. User may enter a short reason.
6. Extension calls runtime command `approval.respond`.
7. Views and operation/session state update from runtime result.

There is no blanket approval and no implicit approval from closing a prompt or view.

## Cancellation Workflow

`Levi: Cancel Operation` lists non-terminal operations with cancellation not already requested. The selected operation ID is passed to `runtime.cancelOperation`. Terminal and non-cancellable operations are not offered as cancellation targets.

## Progress Behavior

Long-running commands use VS Code progress APIs. Runtime progress events provide stage, message, and percentage. Cancellation is wired to runtime cancellation only once an operation ID is known. Partial completion, timeout, and failure are displayed honestly and remain visible in Operations.

## Configuration Settings

Implemented settings:

- `levi.enabled`
- `levi.autoInitialize`
- `levi.autoAnalyzeWorkspace`
- `levi.offlineMode`
- `levi.strictSecurity`
- `levi.persistence.enabled`
- `levi.workspace.maxFiles`
- `levi.workspace.maxFileBytes`
- `levi.workspace.exclude`
- `levi.ui.showNotifications`
- `levi.ui.progressLocation`
- `levi.diagnostics.enabled`
- `levi.models.enabled`
- `levi.models.routingStrategy`
- `levi.models.defaultProvider`
- `levi.models.defaultModel`
- `levi.models.allowRemoteSourceCode`
- `levi.models.allowRemoteSensitiveContent`
- `levi.models.requestTimeoutMs`
- `levi.models.maximumRetries`
- `levi.ollama.enabled`
- `levi.ollama.baseUrl`
- `levi.ollama.defaultModel`
- `levi.openAICompatible.enabled`
- `levi.openAICompatible.baseUrl`
- `levi.openAICompatible.defaultModel`
- `levi.openAICompatible.credentialKey`

Configuration changes update adapter/runtime state where safe. Strict security is preserved and is not silently disabled.

## Persistence Paths

Runtime compact state is stored below VS Code extension storage:

- Global storage URI when available.
- Storage URI fallback when available.
- Extension-local `.levi-vscode/runtime` fallback for tests and development.

The runtime persists compact coordination state only; repository contents, source files, secrets, full transcripts, and full engine stores are not duplicated by the extension.

## Security Decisions

The shell does not add model-provider SDKs, unrestricted terminal execution, Git mutation, package installation, or autonomous source mutation. Local Ollama and OpenAI-compatible access use the provider-neutral gateway and isolated HTTP transport. Remote providers are disabled unless configured, credentials are stored by reference through VS Code SecretStorage, and remote source-code/sensitive routing remains disabled by default.

Output serialization removes secret-like keys, internal handlers, adapters, runtime instances, and raw stacks by default.

## Bounds

UI bounds include:

- Maximum tree items per section: 50.
- Maximum displayed operations: 100.
- Maximum displayed approvals: 100.
- Maximum displayed findings: 50.
- Maximum displayed evidence references: 20.
- Maximum output message size: 4000 characters.
- Maximum UI event queue: 200.
- Maximum concurrent view refreshes: 1.
- Maximum watcher count: 8.
- Maximum workspace files: 500.
- Maximum file bytes: 262144.
- Maximum search results: 50.
- Maximum virtual document size: 200000 characters.

Bound hits produce truncation indicators, warnings, limitations, or stable partial results.

## Testing Strategy

Automated tests use a fake VS Code API and deterministic runtime doubles. Coverage includes activation, deactivation, READY/DEGRADED/FAILED activation, command registration, runtime routing, model-provider commands, credential reference storage, workspace adapter URI normalization, single-root/multi-root/remote/untitled workspaces, file-list bounds, file-size bounds, binary skipping, inaccessible files, revisions, watchers, event bridge, throttling/coalescing, status/output updates, tree views, virtual documents, approval acceptance/rejection/expiration, no implicit approval, cancellation, configuration updates, strict-security preservation, manifest validation, and real `LeviApplicationRuntime` activation/persistence integration.

Commands:

- `npm.cmd --prefix packages/vscode-extension run check`
- `npm.cmd --prefix packages/vscode-extension test`
- `npm.cmd --prefix packages/vscode-extension run validate`
- `npm.cmd test`

## Manual Verification Checklist

- Extension installs in Extension Development Host: not run in this automated environment.
- Levi Activity Bar appears: manifest and fake view registration validated.
- Views load: automated TreeView provider tests pass.
- Runtime reaches READY or explains DEGRADED state: automated READY/DEGRADED/FAILED activation tests pass.
- Workspace opens: automated fake and real runtime workspace tests pass.
- Analysis runs: command path tested; real runtime analysis remains degraded when optional project engines are absent.
- Progress appears: fake VS Code progress integration tested.
- Cancellation works: operation cancellation command tested.
- Project summary renders: virtual document command tested.
- Health renders: virtual document command tested.
- Certification renders: real runtime certification command tested.
- Approval request appears: approval view/command tested.
- Approval and rejection work: approval response tests pass.
- State persists after reload: simulated restart restore test passes.
- Deactivation shuts down cleanly: deactivation test passes.
- No secrets appear in logs: serializer tests and output filtering are implemented.

## Current Limitations

- Manual Extension Development Host verification has not been run here.
- The UI is intentionally TreeView and read-only virtual document based.
- No chat interface, custom frontend framework, source mutation, Git action, shell execution, model provider, network call, or cloud service is included.
- Full project intelligence views depend on runtime capabilities. When optional LI engines are absent, the shell displays normalized limitations rather than synthesizing conclusions.

## Readiness Criteria For L3-003

L3-002 is ready for L3-003 when:

- Manifest validation passes.
- Extension tests pass.
- Root LeviCore suite passes.
- Runtime integration reaches READY or explicit DEGRADED with visible limitations.
- Manual Extension Development Host smoke test confirms the Activity Bar, views, workspace open/analyze, health, certification, approval, persistence, and deactivation flows.

No code-level blocker to L3-003 is known after L3-002.
