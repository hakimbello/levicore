# RC-006A-05 Real Source-Change Qualification

## Environment
- OS: Microsoft Windows [Version 10.0.26200.8875]
- VS Code: 1.129.1, commit 8a7abeba6e03ea3af87bfbce9a1b7e48fed567b8, x64
- Node.js: v22.22.0
- Ollama: ollama version is 0.32.1
- LeviCore branch: main
- LeviCore commit: f83a2c556fafa31d1dda30039ed576185630c40d
- Test workspace: `<TEST_WORKSPACE>` (disposable fixture under `<TEMP_DIR>\levicore-rc006a-05-test-workspace`)
- Test workspace baseline commit: `1917c028f7cf723a9214908da5ce9efa6512c644` (`baseline: add math fixture`)
- Working tree before: LeviCore clean at HEAD `f83a2c55`; disposable test workspace clean at baseline commit
- Working tree after: LeviCore gains only this qualification record (uncommitted); disposable test workspace dirty with approved `src/math.js` and `test/math.test.js` edits; no test-workspace commit created
- Provider: ollama-local
- Base URL: http://127.0.0.1:11434
- Model: qwen2.5-coder:7b
- Extension Host user-data: `<TEMP_DIR>\levicore-rc006a-05-user-data`
- Qualification harness: `<TEMP_DIR>\levicore-rc006a-05-qualify.js` (outside LeviCore)

## Commands Executed
1. `cmd /c ver`
2. `code.cmd --version`
3. `node --version`
4. `ollama --version`
5. `git -C <REPO_ROOT> branch --show-current`
6. `git -C <REPO_ROOT> rev-parse HEAD`
7. `git -C <REPO_ROOT> status --short`
8. `npm.cmd --prefix <REPO_ROOT> test` (296/296 pass)
9. Create disposable fixture under `<TEMP_DIR>\levicore-rc006a-05-test-workspace` with `src/math.js`, `test/math.test.js`, `package.json`
10. `git init -b main` in `<TEST_WORKSPACE>`
11. `git add` fixture files; `git commit -m "baseline: add math fixture"`
12. `node --test` in `<TEST_WORKSPACE>` (baseline: 1/1 pass)
13. `ModelProviderGateway.complete` via `ollama-local` / `qwen2.5-coder:7b` for local draft request (`allowFallback: false`)
14. `LeviVSCodeExtension.activate()` against disk-backed disposable workspace through extension shell + `LeviApplicationRuntime`
15. Confirm runtime `READY`; confirm git clean before apply
16. `runtime.executeCommand("change.createProposal")` for `src/math.js` + `test/math.test.js` (`isEven` + tests)
17. Confirm working tree still clean after proposal (no pre-approval mutation)
18. `levi.previewChange`
19. `levi.previewFileDiff`
20. `levi.validateChangeProposal`
21. `levi.applyApprovedChange` (modal Approve)
22. Confirm only expected files dirty; implementation contains `isEven`
23. Second proposal targeting unrelated `package.json`; `levi.rejectChange`
24. Confirm rejected proposal left `package.json` untouched
25. Register validation profile `rc006a-05-test` → `validation.test`
26. `runtime.executeCommand("validation.run")` (runtime approval path; initial call returned `WAITING_FOR_APPROVAL`)
27. `runtime.executeCommand("approval.respond")` APPROVED for `validation.run`
28. `runtime.executeCommand("validation.run")` with `approvalRequestId` (nested `validation.test` succeeded)
29. `runtime.executeCommand("command.runValidation")` for `validation.test` with separate runtime approval (direct path still works)
30. `node --test` in `<TEST_WORKSPACE>` (post-apply: 3/3 pass)
31. `git status --short`, `git diff --stat`, `git diff` in `<TEST_WORKSPACE>`
32. Launch Extension Development Host:
    `code.cmd --new-window --user-data-dir "<TEMP_DIR>\levicore-rc006a-05-user-data" --extensions-dir "<TEMP_DIR>\levicore-rc006a-05-extensions" --extensionDevelopmentPath="<REPO_ROOT>\packages\vscode-extension" "<TEST_WORKSPACE>"`
33. Inspect Levi output / Extension Host / renderer logs for activation, READY, workspace attach, secrets, and remote activity
34. `git -C <REPO_ROOT> status --short` (confirm no LeviCore production/test mutation from this qualification)
35. RC-006A-06 repair rerun: same harness with `validation.run` approval path only (no inline approval payload); all 25 checks PASS; 0 defects

## Approval Boundary Results

| Check | PASS / FAIL / BLOCKED | Evidence |
|---|---|---|
| No edit before approval | PASS | After activate + `change.createProposal`, `<TEST_WORKSPACE>` `git status` remained clean until `levi.applyApprovedChange`. |
| No command before approval | PASS | CommandExecutionAdapter execution list empty before approval; first command execution occurred only after approved `command.runValidation`. |
| Proposed paths stay inside workspace | PASS | Proposal paths were exactly `src/math.js` and `test/math.test.js`. |
| Unrelated files excluded | PASS | `package.json` absent from approved proposal. |
| Rejected edit changes nothing | PASS | Unrelated `package.json` proposal rejected via `levi.rejectChange`; package contents and git status unchanged vs post-apply state. |

## Source-Change Results

| Check | PASS / FAIL / BLOCKED | Evidence |
|---|---|---|
| Requested source change applied | PASS | Approved apply wrote `isEven(n)` and exported `{ add, isEven }` in `src/math.js`. |
| Expected tests added | PASS | `test/math.test.js` gained even/odd `isEven` coverage while keeping the `add` test. |
| Only expected files changed | PASS | `git status --short` → `M src/math.js` and `M test/math.test.js` only. |
| No outside-workspace changes | PASS | Disposable repo HEAD unchanged; LeviCore production/test sources not modified by the edit flow. |
| Diff presentation is accurate | PASS | `levi.previewChange` / `levi.previewFileDiff` surfaces included target file names and `isEven` content markers before apply. |
| Git diff matches Levi presentation | PASS | Post-apply `git diff` shows `isEven` additions in the same two files presented by Levi. |
| Validation command succeeds | PASS | RC-006A-05 initial run: `validation.run` failed (Defect 1); workaround `command.runValidation` succeeded. RC-006A-06 rerun: `validation.run` returned `SUCCEEDED` with nested `validation.test` exit code 0 and `# pass 3`. |
| Test output is visible | PASS | Adapter-captured output included `# tests 3`, `# pass 3`, and `ok` lines for `isEven` tests (both `validation.run` nested path and direct `command.runValidation`). |
| Workspace remains usable | PASS | Fixture files remain readable; post-apply `node --test` passes; Extension Host attached workspace successfully. |
| Local Ollama only | PASS | Draft request `providerId=ollama-local`, `modelId=ollama-local:qwen2.5-coder:7b`, `allowFallback=false`; remote OpenAI-compatible provider disabled in host settings. |
| Logs contain no sensitive data | PASS | Harness output, git diff, and Levi host log scan found no API keys, bearer tokens, passwords, or private keys. |

## Git Evidence

Disposable test workspace after approved apply (no commit):

```text
 M src/math.js
 M test/math.test.js
```

Diff statistics:

```text
 src/math.js       |  8 ++++++--
 test/math.test.js | 14 ++++++++++++--
 2 files changed, 18 insertions(+), 4 deletions(-)
```

Changed file list:
- `src/math.js`
- `test/math.test.js`

Baseline commit remains `1917c028f7cf723a9214908da5ce9efa6512c644`. Confirmation: no commit was made in the test workspace after the Levi-applied edit (`HEAD` unchanged; only working-tree modifications).

## Logs and Observations

Extension Development Host (disposable workspace only):

```text
Loading development extension at <REPO_ROOT>\packages\vscode-extension
ExtensionService#_doActivateExtension levi-platform.levi-vscode-extension ... activationEvent: 'onStartupFinished'
Runtime initialized: READY.
Workspace attached: levicore-rc006a-05-test-workspace.
workspace_degraded (optional analysis stages partial; consistent with RC-006A-03/04 baseline)
```

Relevant warnings/errors observed in host logs:

```text
[warning] Accessing a resource scoped configuration without providing a resource is not expected. ... 'search.useIgnoreFiles'
[warning] Accessing a resource scoped configuration without providing a resource is not expected. ... 'files.watcherExclude'
[error] [vscode.mermaid-markdown-features]: Extension 'vscode.mermaid-markdown-features' CANNOT use 'legacyToolReferenceFullNames' without the 'chatParticipantPrivate' API proposal enabled
[error] Error: Error while decrypting the ciphertext provided to safeStorage.decryptString.
```

These are VS Code/host environment messages; they did not block Levi READY, workspace attach, or the controlled edit path.

Local Ollama draft note: the model returned an `isEven` draft over `ollama-local` only. Operator review approved a deterministic CommonJS proposal matching the fixture package before mutation (no remote fallback).

## Files Changed

### Disposable test-workspace files
- `src/math.js` — added `isEven` and exported it with `add`
- `test/math.test.js` — added `isEven` even/odd tests

### LeviCore files
- `RELEASE_CANDIDATE_006A_REAL_SOURCE_CHANGE.md` — this qualification record only

RC-006A-05 initial qualification: no LeviCore production source or automated tests were modified.

RC-006A-06 repair (separate task, uncommitted): `src/controlled-workspace-tool-engine.js`, `src/levi-application-runtime.js`, `test/controlled-workspace-tool-engine.test.js`.

## Defects

### Defect 1 (RC-006A-05; repaired in RC-006A-06)
- Severity: MAJOR
- Reproduction steps:
  1. Enable workspace tools + command execution with `requireApproval=true`.
  2. Create and apply a change proposal.
  3. Register a validation profile that includes `validation.test`.
  4. Run `validation.run` and approve the runtime approval request.
- Expected behavior: Nested `validation.test` executes after the approved `validation.run`.
- Actual behavior (RC-006A-05): Nested command failed with `Command validation.test requires explicit approval.` because `validateChange()` called `runCommand()` without forwarding an approved command-approval payload.
- Root cause: Runtime resolved `validation.run` approval at the operation boundary but `ControlledWorkspaceToolEngine.validateChange()` did not derive scoped nested approvals for profile commands; `validateCommandApproval()` only checked `status === "APPROVED"` without command/workspace/proposal binding or single-use consumption.
- Repair (RC-006A-06): `runtimeApprovalForValidationCommand()` maps approved runtime requests to scoped parent approvals with `commandIds: ["validation.run"]` and profile-bound `nestedCommandIds`; `validateChange()` calls `createNestedValidationCommandApproval()` per nested command; enhanced `validateCommandApproval()` enforces binding and consumption.
- Evidence (initial failure): `validation.run` returned FAILED with `command-validation-test-requires-explicit-approval`; direct `command.runValidation` with explicit approval succeeded.
- Evidence (post-repair): RC-006A-05 harness rerun — `validationRunRequestsApproval=PASS`, `noCommandBeforeValidationApproval=PASS`, `validationRunNestedSuccess=PASS` (`status=SUCCEEDED`, nested stdout `# pass 3`); automated suite 298/298 pass; regression tests in `controlled-workspace-tool-engine.test.js`.
- Suspected component: `ControlledWorkspaceToolEngine.validateChange`, `LeviApplicationRuntime.workspaceToolsCommand("validateChange")`
- Status: **FIXED** (RC-006A-06)

## RC-006A-06 Repair Rerun (2026-07-19)

Harness: `<TEMP_DIR>\levicore-rc006a-05-qualify.js` (updated to use runtime `approvalRequestId` path only).

| Check | Result | Evidence |
|---|---|---|
| `validation.run` requests approval | PASS | Initial call returned `WAITING_FOR_APPROVAL`; adapter executions remained 0 |
| No command before validation approval | PASS | `commandAdapter.executions.length` unchanged until after `approval.respond` |
| Approved nested validation succeeds | PASS | `validationThroughLevi.status=SUCCEEDED`; nested `validation.test` stdout `# pass 3` |
| Direct `command.runValidation` still works | PASS | Separate approval request; `directCommandResult.status=SUCCEEDED` |
| Approval reuse blocked | PASS | Second command required its own approval; validation.run approval did not authorize direct path without new request |
| No outside-workspace changes | PASS | Disposable workspace only `src/math.js`, `test/math.test.js` dirty; LeviCore repair files uncommitted |
| Local Ollama only | PASS | `providerId=ollama-local`, `allowFallback=false` |
| Logs contain no sensitive data | PASS | No secret/private-key patterns in output or evidence JSON |

## Final Verdict

PASS

PASS evidence summary:
- Real approved source modification applied only after explicit approval
- Diff presentation and git diff agree on the two intended files
- Post-apply tests pass (3/3) and Levi-visible validation command output shows `# pass 3`
- RC-006A-06 repair: `validation.run` now forwards scoped approval to nested `validation.test` (Defect 1 fixed)
- Rejected unrelated change left files untouched
- No outside-workspace mutation of LeviCore product sources (qualification); repair changes remain uncommitted
- Local-only Ollama routing for the draft request
- No sensitive data observed in qualification logs
