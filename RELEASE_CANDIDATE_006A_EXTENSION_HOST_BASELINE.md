# RC-006A-01 Extension Development Host Baseline

## Environment

- OS: Microsoft Windows 10.0.26200.8875, AMD64
- VS Code: 1.124.2, commit 6928394f91b684055b873eecb8bc281365131f1c, x64
- Node.js: v24.16.0
- Package manager: npm.cmd 11.13.0
- Branch: main
- Commit SHA: 7cff2c4beefe15eb374b3922b1e1b9e77a4e70ad
- Working tree before:
  - Existing modified: `.gitignore`, `ARCHITECTURE.md`, `package.json`
  - Existing untracked: RC-001 through RC-005 records, `packages/`, new `src/` engines/providers/transports, and related `test/` files
- Working tree after:
  - Same existing modified and untracked files, plus this qualification record
  - No package lockfiles or `node_modules` directories were created

## Commands Executed

1. `Get-ChildItem -Force`
2. `git status --short --branch`
3. `rg --files`
4. `Get-Content package.json`
5. `Get-Content packages\vscode-extension\package.json`
6. `Get-Content packages\vscode-extension\README.md`
7. `Get-ChildItem -Force packages\vscode-extension`
8. `Get-ChildItem -Force .vscode`
9. `Test-Path package-lock.json; Test-Path packages\vscode-extension\package-lock.json; Test-Path node_modules; Test-Path packages\vscode-extension\node_modules`
10. `git rev-parse --abbrev-ref HEAD`
11. `git rev-parse HEAD`
12. `node --version`
13. `npm --version`
14. `code --version`
15. `Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture`
16. `npm.cmd --version`
17. `cmd /c ver`
18. `node -e "const p=require('./packages/vscode-extension/package.json'); console.log(JSON.stringify({dependencies:p.dependencies||{},devDependencies:p.devDependencies||{}}, null, 2))"`
19. `git status --porcelain=v1`
20. `npm.cmd --prefix packages/vscode-extension install --package-lock=false --ignore-scripts`
21. `npm.cmd --prefix packages/vscode-extension run check`
22. `where.exe code`
23. `Get-Command code | Select-Object -ExpandProperty Source`
24. `Get-Command Code.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source`
25. `code.cmd --new-window --user-data-dir "$env:TEMP\levicore-rc006a-user-data" --extensions-dir "$env:TEMP\levicore-rc006a-extensions" --extensionDevelopmentPath=packages/vscode-extension "C:\Users\wetie\OneDrive\Desktop\LeviCore"`
26. `Get-ChildItem -Path $env:TEMP\levicore-rc006a-user-data -Force | Select-Object FullName,Mode,Length,LastWriteTime`
27. `Get-ChildItem -Path $env:TEMP\levicore-rc006a-user-data\logs -Recurse -File -ErrorAction SilentlyContinue | Select-Object FullName,Length,LastWriteTime`
28. `Select-String -Path $env:TEMP\levicore-rc006a-user-data\logs\20260718T212508\window1\exthost\exthost.log -Pattern 'levi|error|warn|fail|activation|ExtensionDevelopmentPath' -CaseSensitive:$false`
29. `Select-String -Path $env:TEMP\levicore-rc006a-user-data\logs\20260718T212508\window1\renderer.log -Pattern 'levi|error|warn|fail|activation' -CaseSensitive:$false`
30. `Select-String -Path $env:TEMP\levicore-rc006a-user-data\logs\20260718T212508\main.log -Pattern 'levi|error|warn|fail|ExtensionDevelopmentPath|extensionDevelopmentPath' -CaseSensitive:$false`
31. `code.cmd --new-window --user-data-dir "$env:TEMP\levicore-rc006a-user-data-absolute" --extensions-dir "$env:TEMP\levicore-rc006a-extensions-absolute" --extensionDevelopmentPath="C:\Users\wetie\OneDrive\Desktop\LeviCore\packages\vscode-extension" "C:\Users\wetie\OneDrive\Desktop\LeviCore"`
32. `Select-String -Path $env:TEMP\levicore-rc006a-user-data-absolute\logs\*\window1\exthost\exthost.log -Pattern 'levi|error|warn|fail|activation|ExtensionService' -CaseSensitive:$false`
33. `Select-String -Path $env:TEMP\levicore-rc006a-user-data-absolute\logs\*\window1\renderer.log -Pattern 'levi|error|warn|fail|activation' -CaseSensitive:$false`
34. `Get-Content $env:TEMP\levicore-rc006a-user-data-absolute\logs\20260718T213001\window1\exthost\output_logging_20260718T213003\1-Levi.log`
35. `node -e "const pkg=require('./packages/vscode-extension/package.json'); const fs=require('fs'); const constants=fs.readFileSync('./packages/vscode-extension/src/constants.js','utf8'); const ids=pkg.contributes.commands.map(c=>c.command); const missing=ids.filter(id=>!constants.includes(id)); console.log(JSON.stringify({manifestCommandCount:ids.length, duplicateIds:ids.filter((v,i,a)=>a.indexOf(v)!==i), missingFromConstants:missing}, null, 2));"`
36. `code.cmd --new-window --user-data-dir "$env:TEMP\levicore-rc006a-user-data-absolute" --extensions-dir "$env:TEMP\levicore-rc006a-extensions-absolute" --extensionDevelopmentPath="C:\Users\wetie\OneDrive\Desktop\LeviCore\packages\vscode-extension" "C:\Users\wetie\OneDrive\Desktop\LeviCore"`
37. `Get-Content $env:TEMP\levicore-rc006a-user-data-absolute\logs\20260718T213251\terminal.log -ErrorAction SilentlyContinue`
38. `Get-Content $env:TEMP\levicore-rc006a-user-data-absolute\logs\20260718T213251\window1\network.log -ErrorAction SilentlyContinue`
39. `Get-Content $env:TEMP\levicore-rc006a-user-data-absolute\logs\20260718T213251\network-shared.log -ErrorAction SilentlyContinue`
40. `Select-String -Path $env:TEMP\levicore-rc006a-user-data-absolute\logs\20260718T213251\**\* -Pattern 'api[_-]?key|token|secret|password|BEGIN|PRIVATE KEY|prompt|source code|C:\\Users\\wetie\\OneDrive\\Desktop\\LeviCore\\src' -CaseSensitive:$false -ErrorAction SilentlyContinue`
41. `$env:PROCESSOR_ARCHITECTURE`
42. `git status --porcelain=v1`

UI actions performed in the Extension Development Host:

1. Opened the documented relative-path host.
2. Opened Command Palette and searched `Levi: Open Dashboard`.
3. Closed the failed relative-path host.
4. Opened an absolute-path diagnostic host.
5. Dismissed first-run VS Code onboarding without signing in.
6. Opened the Levi activity-bar container.
7. Opened Command Palette and searched `Levi: Open Dashboard`.
8. Ran the safe display command `Levi: Open Dashboard`.
9. Closed and relaunched the absolute-path diagnostic host.
10. Confirmed Levi rendered after restart.

## Qualification Results

| Check | PASS / FAIL / BLOCKED | Evidence |
|---|---|---|
| Build succeeds | PASS | `npm.cmd --prefix packages/vscode-extension run check` exited 0. |
| Extension Development Host launches | PASS | VS Code opened `[Extension Development Host] Welcome - LeviCore - Visual Studio Code`. |
| LeviCore activates | FAIL | Documented relative launch logged `Error scanning extensions at /packages/vscode-extension: Unable to resolve nonexistent file '\packages\vscode-extension'`; Levi commands and views were absent. Absolute-path diagnostic launch activated `levi-platform.levi-vscode-extension`. |
| Core UI renders | FAIL | Documented launch did not load Levi. Absolute-path diagnostic rendered the Levi activity container, sections, buttons, status bar, and trees, but displayed startup error `Invalid workspace state transition: DEGRADED -> ANALYZING.` |
| Commands register | FAIL | Documented launch did not register Levi commands. Absolute-path diagnostic exposed `Levi: Levi: Open Dashboard`, manifest count 154, duplicate command IDs 0, constants mismatch 0. |
| Idle behavior respects boundaries | FAIL | Absolute-path diagnostic opened Levi without user request and immediately started workspace analysis plus project commands; no shell execution was observed, but idle behavior produced runtime operations and errors. |
| Logs contain no sensitive data | PASS | Pattern scan for key/token/secret/password/private-key/prompt/source-code path terms returned no matches in the restart host logs. |
| Restart succeeds | FAIL | Absolute-path diagnostic restart reactivated Levi and rendered the UI, but the same startup analysis/error state recurred. |
| No duplicate registration | PASS | Restart logs contained no `duplicate`, `already registered`, or command registration failure entries; UI sections did not duplicate across restart. |
| No unexpected workspace changes | PASS | Git status before and after qualification was unchanged except for this qualification record; no lockfiles or `node_modules` were created. |

## Logs and Observations

Documented relative launch used:

```powershell
code.cmd --new-window --user-data-dir "$env:TEMP\levicore-rc006a-user-data" --extensions-dir "$env:TEMP\levicore-rc006a-extensions" --extensionDevelopmentPath=packages/vscode-extension "C:\Users\wetie\OneDrive\Desktop\LeviCore"
```

Renderer error from documented relative launch:

```text
2026-07-18 21:25:10.330 [error] Error scanning extensions at /packages/vscode-extension: Unable to resolve nonexistent file '\packages\vscode-extension'
```

Command Palette evidence from documented relative launch:

```text
Search: >Levi: Open Dashboard
Observed option: Ask in Chat: Levi: Open Dashboard
No runnable Levi command was present.
```

Absolute-path diagnostic activation evidence:

```text
2026-07-18 21:30:03.672 [info] Loading development extension at c:\Users\wetie\OneDrive\Desktop\LeviCore\packages\vscode-extension
2026-07-18 21:30:04.817 [info] ExtensionService#_doActivateExtension levi-platform.levi-vscode-extension, startup: false, activationEvent: 'onStartupFinished'
Levi extension activation started.
Extension event: extension_runtime_ready
Runtime initialized: READY.
Workspace attached: LeviCore.
```

Absolute-path diagnostic startup errors:

```text
Runtime event: operation_failed operation-000275-bd4ec9ec
"code": "invalid-workspace-state-transition-degraded-analyzing"
"message": "Invalid workspace state transition: DEGRADED -> ANALYZING."
"severity": "ERROR"
```

```text
"commandId": "project.summary"
"code": "projectintelligenceengine-getprojectsummary-is-unavailable"
"message": "ProjectIntelligenceEngine.getProjectSummary is unavailable."
```

```text
"commandId": "project.architecture"
"code": "projectintelligenceengine-getarchitectureassessment-is-unavailable"
"message": "ProjectIntelligenceEngine.getArchitectureAssessment is unavailable."
```

```text
"commandId": "project.assessment"
"code": "projectintelligenceengine-assessproject-is-unavailable"
"message": "ProjectIntelligenceEngine.assessProject is unavailable."
```

Restart evidence:

```text
2026-07-18 21:32:52.946 [info] ExtensionService#_doActivateExtension levi-platform.levi-vscode-extension, startup: false, activationEvent: 'onView:levi.overview'
```

UI evidence after absolute-path restart:

```text
LEVI
OVERVIEW
Runtime READY
Health UNKNOWN
Workspace DEGRADED
Project LeviCore
ENVIRONMENT
PROJECT
OPERATIONS
APPROVALS
MODELS
AGENT
MULTI-AGENT
RELEASE QUALIFICATION
DIAGNOSTICS
Error: Invalid workspace state transition: DEGRADED -> ANALYZING. (EXECUTION)
```

Command registration evidence after absolute-path diagnostic load:

```text
manifestCommandCount: 154
duplicateIds: []
missingFromConstants: []
Command Palette option: Levi: Levi: Open Dashboard
```

Non-Levi / VS Code warnings and errors observed:

```text
2026-07-18 21:25:10.765 [error] Error: Error while decrypting the ciphertext provided to safeStorage.decryptString.
2026-07-18 21:27:43.745 [warning] [DefaultAccount] Managed settings fetch returned non-success status 404; falling back to local-only policy
2026-07-18 21:27:44.523 [warning] [perf] Renderer reported VERY LONG TASK (306ms), starting profiling session 'ec23d776-c178-498d-8c51-6aeedf68abce'
2026-07-18 21:27:48.010 [error] [Extension Host] (node:12676) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
2026-07-18 21:28:58.000 [error] [Extension Host] Failed to fetch remote embeddings cache from https://embeddings.vscode-cdn.net/text-3-small/v1.124/commands/latest.txt
2026-07-18 21:28:58.001 [error] [Extension Host] Response status: 404, status text:
2026-07-18 21:28:58.266 [error] [Extension Host] Failed to fetch remote embeddings cache from https://embeddings.vscode-cdn.net/text-3-small/v1.124/commands/core.json
2026-07-18 21:28:58.267 [error] [Extension Host] Response status: 404, status text:
```

Repeated VS Code configuration warnings:

```text
[vscode.git] Accessing a resource scoped configuration without providing a resource is not expected. To get the effective value for 'git.openRepositoryInParentFolders', provide the URI of a resource or 'null' for any resource.
[vscode.git] Accessing a resource scoped configuration without providing a resource is not expected. To get the effective value for 'git.showProgress', provide the URI of a resource or 'null' for any resource.
Accessing a resource scoped configuration without providing a resource is not expected. To get the effective value for 'search.useIgnoreFiles', provide the URI of a resource or 'null' for any resource.
Accessing a resource scoped configuration without providing a resource is not expected. To get the effective value for 'files.watcherExclude', provide the URI of a resource or 'null' for any resource.
```

Safe idle observations:

- Terminal log: empty.
- VS Code network logs for absolute-path restart: empty.
- Secret/prompt/source-code leakage scan: no matches.
- Git status: unchanged except this report after it was added.
- Levi model status displayed `Privacy: ENFORCED`.
- Levi status displayed `Levi: Analyzing` without a user request.

## Files Changed

- `RELEASE_CANDIDATE_006A_EXTENSION_HOST_BASELINE.md`: added this manual qualification record.

No production code was modified. No lockfile, dependency folder, generated build artifact, or Marketplace package was created.

## Defects

### Defect 1

- Severity: RELEASE_BLOCKER
- Reproduction steps:
  1. From the repository root, run the documented relative launch path through VS Code CLI: `code.cmd --new-window --user-data-dir "$env:TEMP\levicore-rc006a-user-data" --extensions-dir "$env:TEMP\levicore-rc006a-extensions" --extensionDevelopmentPath=packages/vscode-extension "C:\Users\wetie\OneDrive\Desktop\LeviCore"`.
  2. Open Command Palette.
  3. Search `Levi: Open Dashboard`.
- Expected behavior: VS Code loads `packages/vscode-extension`; Levi appears; documented Levi commands are registered.
- Actual behavior: VS Code attempts to scan `/packages/vscode-extension`, reports the path nonexistent, and no runnable Levi command appears.
- Evidence: `Error scanning extensions at /packages/vscode-extension: Unable to resolve nonexistent file '\packages\vscode-extension'`; Command Palette showed only `Ask in Chat: Levi: Open Dashboard`.
- Suspected component: Extension Development Host launch documentation / VS Code CLI path handling.

### Defect 2

- Severity: RELEASE_BLOCKER
- Reproduction steps:
  1. Launch the Extension Development Host with an absolute extension path.
  2. Open Levi without sending any request.
  3. Inspect Levi output and UI.
- Expected behavior: Levi activates into a clean baseline idle state without startup runtime errors.
- Actual behavior: Levi auto-opens/analyzes the workspace and emits `Invalid workspace state transition: DEGRADED -> ANALYZING.`; the UI shows the error and workspace remains degraded/analyzing.
- Evidence: Levi output log includes `operation_failed`, `invalid-workspace-state-transition-degraded-analyzing`, and UI text `Error: Invalid workspace state transition: DEGRADED -> ANALYZING. (EXECUTION)`.
- Suspected component: VS Code extension startup workflow, `openWorkspace({ analyze: true })`, workspace state machine, or project analysis refresh path.

### Defect 3

- Severity: MAJOR
- Reproduction steps:
  1. Launch the Extension Development Host with an absolute extension path.
  2. Open Command Palette.
  3. Search `Levi: Open Dashboard`.
- Expected behavior: The command appears once with a normal VS Code label.
- Actual behavior: The command appears as `Levi: Levi: Open Dashboard`.
- Evidence: Accessibility tree showed `option (selectable) Levi: Levi: Open Dashboard`.
- Suspected component: VS Code manifest command `title` includes the `Levi:` prefix while `category` is also `Levi`.

### Defect 4

- Severity: MAJOR
- Reproduction steps:
  1. Launch the Extension Development Host with an absolute extension path.
  2. Let startup analysis run.
  3. Inspect the Levi output channel.
- Expected behavior: Project summary, architecture, assessment, blockers, risks, next actions, and release readiness either load successfully or show bounded unavailable states without runtime command failures.
- Actual behavior: Multiple `ProjectIntelligenceEngine.* is unavailable` command failures are logged.
- Evidence: `projectintelligenceengine-getprojectsummary-is-unavailable`, `projectintelligenceengine-getarchitectureassessment-is-unavailable`, `projectintelligenceengine-assessproject-is-unavailable`, `projectintelligenceengine-getblockers-is-unavailable`, `projectintelligenceengine-getrisks-is-unavailable`, `projectintelligenceengine-getnextactions-is-unavailable`, and `projectintelligenceengine-getreleasereadiness-is-unavailable`.
- Suspected component: Project intelligence integration / extension startup analysis refresh.

## Final Verdict

FAIL

## RC-006A-02 Remediation - Extension Host Launch Repair

### Root Cause

The repository did not contain a checked-in `.vscode/launch.json` or `.vscode/tasks.json`. The documented launch instruction was a raw CLI argument:

```powershell
code --extensionDevelopmentPath=packages/vscode-extension
```

When this command was invoked from the repository root during RC-006A-01, VS Code resolved the relative extension development path as `/packages/vscode-extension` and logged:

```text
Error scanning extensions at /packages/vscode-extension: Unable to resolve nonexistent file '\packages\vscode-extension'
```

The repository is expected to be opened from the repository root. The extension package lives under `packages/vscode-extension`, so the corrected launch configuration anchors the extension path to the opened root workspace with `${workspaceFolder}/packages/vscode-extension`. This replaces the fragile raw relative CLI argument that VS Code previously resolved from an unintended process location.

### Files Changed

- `.vscode/launch.json`: added the repository-root Extension Development Host launch configuration using `${workspaceFolder}/packages/vscode-extension`.
- `packages/vscode-extension/README.md`: replaced the fragile raw relative CLI launch instruction with the repository-root Run and Debug launch flow.
- `RELEASE_CANDIDATE_006A_EXTENSION_HOST_BASELINE.md`: added this remediation record.

### Old Path Behavior

```text
--extensionDevelopmentPath=packages/vscode-extension
Resolved by VS Code as: /packages/vscode-extension
Result: Levi extension not loaded; Levi commands/views absent.
```

### Corrected Path Behavior

```text
--extensionDevelopmentPath=${workspaceFolder}/packages/vscode-extension ${workspaceFolder}
Resolved by VS Code as the LeviCore repository root plus packages/vscode-extension.
Result: VS Code loads the real Levi extension package without an absolute user-specific override.
```

### Exact Commands

Validation commands and actions:

```powershell
npm.cmd --prefix packages/vscode-extension run check
code.cmd --new-window --user-data-dir "$env:TEMP\levicore-rc006a-repair-user-data" --extensions-dir "$env:TEMP\levicore-rc006a-repair-extensions" "C:\Users\wetie\OneDrive\Desktop\LeviCore"
```

Then in VS Code Run and Debug, selected and started:

```text
Levi: Extension Development Host
```

Restart verification repeated the same Run and Debug launch configuration.

Full automated test command:

```powershell
npm.cmd test
```

### Launch Evidence

The repository root was opened in VS Code with a temporary user-data directory, then `Levi: Extension Development Host` was selected from Run and Debug. The status bar showed `Debug: Levi: Extension Development Host (LeviCore)`.

Renderer log from the first corrected launch:

```text
2026-07-18 21:47:11.873 [info] Loading development extension at c:\Users\wetie\OneDrive\Desktop\LeviCore\packages\vscode-extension
```

Extension Host activation log from the first corrected launch:

```text
2026-07-18 21:47:13.629 [info] ExtensionService#_doActivateExtension levi-platform.levi-vscode-extension, startup: false, activationEvent: 'onStartupFinished'
```

Levi output evidence from the first corrected launch:

```text
Levi extension activation started.
Runtime initialized: READY.
Extension event: extension_view_refreshed
```

No `/packages/vscode-extension` scan error appeared after the corrected launch configuration was used.

### Restart Evidence

After stopping the first Extension Development Host session, the same `Levi: Extension Development Host` Run and Debug configuration was launched again.

Renderer log from the restart:

```text
2026-07-18 21:49:53.471 [info] Loading development extension at c:\Users\wetie\OneDrive\Desktop\LeviCore\packages\vscode-extension
```

Extension Host activation log from the restart:

```text
2026-07-18 21:49:55.426 [info] ExtensionService#_doActivateExtension levi-platform.levi-vscode-extension, startup: false, activationEvent: 'onStartupFinished'
```

Levi output evidence from the restart:

```text
Levi extension activation started.
Runtime initialized: READY.
Extension event: extension_view_refreshed
```

Shutdown after the restart was clean:

```text
2026-07-18 23:16:35.986 [info] Extension host with pid 4280 exiting with code 0
```

### Automated Test Result

```text
npm.cmd test
tests 291
pass 291
fail 0
duration_ms 166369.8918
```

### Remaining Runtime Blocker

The separate runtime defect remains intentionally unfixed in this task:

```text
Invalid workspace state transition: DEGRADED -> ANALYZING.
```

During the corrected-launch restart, the exact remaining runtime error appeared in:

```text
C:\Users\wetie\AppData\Local\Temp\levicore-rc006a-repair-user-data\logs\20260718T214610\window3\exthost\output_logging_20260718T214955\1-Levi.log
```

Exact error payload excerpt:

```json
{
  "code": "invalid-workspace-state-transition-degraded-analyzing",
  "message": "Invalid workspace state transition: DEGRADED -> ANALYZING.",
  "severity": "ERROR",
  "userMessage": "Invalid workspace state transition: DEGRADED -> ANALYZING."
}
```
