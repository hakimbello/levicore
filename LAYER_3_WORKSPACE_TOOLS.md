# Layer 3 Controlled Workspace Tools

`src/controlled-workspace-tool-engine.js` is the Layer 3 controlled workspace mutation boundary. It is platform-independent and does not import VS Code, Electron, browser APIs, provider SDKs, shell APIs, SCM implementations, language services, operating-system-specific APIs, or Node filesystem APIs. Files, commands, and source control are reachable only through injected adapters.

## Workspace-Tool Package Structure

- `src/controlled-workspace-tool-engine.js`: core engine, constants, normalized records, proposal validation, patch preview, approval binding, adapter-only apply/verify/revert, command allowlisting, validation profiles, health, events, and in-memory persistence fallback.
- `packages/vscode-extension/src/vscode-workspace-mutation-adapter.js`: VS Code adapter using `vscode.workspace.fs` for file reads/writes/deletes/renames and active-workspace URI resolution.
- `packages/vscode-extension/src/levi-extension.js`: Change Review commands, proposal cache, explicit approval prompt, runtime approval response, and virtual diff documents.
- `packages/vscode-extension/src/presentation.js` and `view-providers.js`: `levi.changes` Change Review tree model.
- `packages/vscode-extension/package.json`: Change Review commands, view, menu entries, and conservative `levi.workspaceTools.*` settings.
- `test/controlled-workspace-tool-engine.test.js`: core, runtime, and agent integration coverage.
- `packages/vscode-extension/test/extension-shell.test.js`: VS Code shell end-to-end proposal/apply coverage with fake `workspace.fs`.

## Core Constants

The core exports frozen constants for engine states, tool categories, tool risk levels, mutation scopes, change states, patch formats, command classes, file operations, defaults, bounds, and schema version.

Primary states:

- Engine: CREATED, INITIALIZING, READY, DEGRADED, SUSPENDED, STOPPED, FAILED.
- Change: DRAFT, PROPOSED, READY_FOR_REVIEW, INVALID, APPROVED, REJECTED, APPLYING, APPLIED, VERIFIED, VALIDATED, REVERTED, FAILED, EXPIRED, CANCELLED.
- Patch formats: STRUCTURED, UNIFIED_DIFF, TEXT_EDIT.
- Command classes: READ_ONLY, TEST, LINT, TYPECHECK, FORMAT_CHECK, PACKAGE_VALIDATE, GIT_READ, GIT_MUTATION, BUILD, CUSTOM.

## Normalized Records

The engine normalizes:

- Configuration and bounds.
- Tool definitions.
- Change proposals.
- File changes.
- Text edits.
- Proposal validation records.
- Change application records.
- Validation profiles.
- Command definitions.
- Command requests and results.

Records are JSON-serializable and frontend-safe. Proposal hashes bind workspace revision, file changes, and generated patch data.

## Adapter Contracts

`WorkspaceMutationAdapter` required methods:

- `readFile(workspace, uri, options)`
- `stat(workspace, uri, options)`
- `applyEdits(workspace, uri, edits, options)`
- `createFile(workspace, uri, content, options)`
- `deleteFile(workspace, uri, options)`
- `renameFile(workspace, from, to, options)`
- `verifyFile(workspace, uri, expectation)`
- `getWorkspaceRevision(workspace)`

Optional workspace methods may provide transactions, backups, or formatting. The core does not assume them.

`CommandExecutionAdapter` required methods:

- `validateCommand(request, options)`
- `executeCommand(request, options)`
- `cancelCommand(requestId, reason)`
- `getEnvironmentInfo(options)`

`SourceControlAdapter` required methods:

- `isAvailable(workspace)`
- `getStatus(workspace, options)`
- `getDiff(workspace, options)`
- `getRevision(workspace, options)`
- `createCheckpoint(workspace, options)`
- `restoreCheckpoint(workspace, checkpoint, options)`

## Safety Model

The default configuration is review-only. Reads and proposals are enabled; file mutation, command execution, git mutation, file creation, deletion, and rename are disabled unless host configuration opts in.

Proposal validation checks:

- Unsafe paths, path traversal, absolute paths, NUL bytes, protected paths, and excluded mutation paths.
- File/edit count bounds, file byte bounds, patch byte bounds, duplicate files, overlapping edits, and out-of-bounds edits.
- Disabled create/delete/rename operations.
- Stale file hashes and workspace revisions when adapter evidence is available.

Application checks:

- Proposal must validate successfully.
- Approval must be explicit, approved, and bound to proposal ID, proposal hash, and workspace revision.
- Mutations go only through `WorkspaceMutationAdapter`.
- Verification checks expected content/hash through the adapter.
- Checkpoints are requested when source control is available; rollback uses checkpoint restoration or inverse file edits where possible.

Command checks:

- Only registered commands can run.
- Command classes must be allowlisted.
- Shell-control characters in additional arguments are rejected.
- Command execution remains disabled by default.
- Runtime validation commands require approval unless host configuration disables that requirement.

## Runtime Commands

`LeviApplicationRuntime` registers the component as `ControlledWorkspaceToolEngine` and exposes:

- `workspaceTools.health`
- `workspaceTools.list`
- `workspaceTools.readFile`
- `workspaceTools.statFile`
- `change.createProposal`
- `change.validateProposal`
- `change.preview`
- `change.apply`
- `change.get`
- `change.list`
- `change.reject`
- `change.revert`
- `validation.run`
- `validation.get`
- `command.listAllowed`
- `command.runValidation`
- `command.cancel`
- `sourceControl.status`
- `sourceControl.diff`
- `sourceControl.checkpoint`
- `sourceControl.restore`

Mutation, validation execution, and source-control mutation commands are marked security/approval sensitive in the runtime. Runtime approval requests do not mutate by themselves; after approval, the workspace-tool engine still verifies the proposal-bound approval evidence before applying.

## Agent Integration

`AgentOrchestrationEngine` registers runtime-command tools for workspace reads, proposal creation, proposal validation, diff preview, apply-approved, result validation, revert, command allowlisting, validation command execution, source-control status, and source-control diff.

Source-changing and command-executing tools remain unavailable in read-only/proposal-only modes and require approval in approval-gated/execution-enabled modes. The agent never writes files or runs commands directly.

## VS Code Integration

The VS Code shell contributes `levi.changes` and commands to create, preview, validate, approve/apply, reject, revert, show history, run validation, inspect allowed commands, and inspect source-control status/diff.

The extension prompts before applying or reverting. It then uses the runtime approval flow and passes the approved approval request back to `change.apply`. The workspace-tool engine performs the final proposal-hash/workspace-revision approval binding check.

Default VS Code settings keep source changes and command execution disabled:

- `levi.workspaceTools.allowSourceChanges`: false.
- `levi.workspaceTools.allowCommandExecution`: false.
- `levi.workspaceTools.requireApproval`: true.
- `levi.workspaceTools.requireCheckpoint`: true.

## Known Limitations

- Unified diff generation is deterministic and review-oriented; the engine applies structured text edits, not arbitrary unified patch text.
- Source-control checkpoint support is adapter-dependent. Without a source-control adapter, the engine reports checkpoint unavailability and can still apply only if host configuration permits mutation.
- The VS Code shell uses virtual documents for diff preview today; native two-sided diff can be added once proposed-content document providers are specialized per file.
