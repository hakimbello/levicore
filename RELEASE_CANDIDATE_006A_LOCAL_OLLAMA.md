# RC-006A-04 Local Ollama Qualification

## Environment
- OS: Microsoft Windows [Version 10.0.26200.8875]
- VS Code: 1.129.1, commit 8a7abeba6e03ea3af87bfbce9a1b7e48fed567b8, x64
- Node.js: v24.16.0
- Ollama: ollama version is 0.32.1
- Branch: main
- Commit SHA: 87dc9bc6dc6f553a7f4dac6833134c494878ef1f
- Working tree before: dirty from existing RC-001 through RC-006A work; no marketplace publication; broad untracked implementation and manual qualification files already present.
- Working tree after: dirty; expected RC-006A-04 changes are listed in Files Changed. No request-driven source edits occurred during local Ollama prompts.
- Provider: ollama-local
- Base URL: http://127.0.0.1:11434
- Model: qwen2.5-coder:7b
- Package manager: npm 11.13.0

## Commands Executed
1. `cmd /c ver`
2. `code.cmd --version`
3. `node --version`
4. `git branch --show-current`
5. `git rev-parse HEAD`
6. `git status --short`
7. `Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture`
8. `ollama --version`
9. `ollama list`
10. `Get-Process | Where-Object { $_.ProcessName -like '*ollama*' } | Select-Object Id,ProcessName,Path`
11. `& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" --version`
12. `& "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" list`
13. `Invoke-RestMethod -Uri http://127.0.0.1:11434/api/tags -Method Get | ConvertTo-Json -Depth 6`
14. `New-Item -ItemType Directory -Force "$env:TEMP\levicore-rc006a-04-user-data\User"`
15. `Set-Content -LiteralPath "$env:TEMP\levicore-rc006a-04-user-data\User\settings.json" ...`
16. `code.cmd --new-window --user-data-dir "$env:TEMP\levicore-rc006a-04-user-data" --extensions-dir "$env:TEMP\levicore-rc006a-04-extensions" "<REPO_ROOT>"`
17. VS Code command: `Levi: Extension Development Host`
18. VS Code command: `Levi: Send Agent Message`
19. `Select-String` over Levi output, Extension Host logs, renderer logs, and persisted runtime state.
20. `Invoke-RestMethod -Uri http://127.0.0.1:11434/api/ps -Method Get | ConvertTo-Json -Depth 6`
21. `node --test --test-name-pattern "Ollama" test\model-provider-gateway.test.js`
22. `node --test --test-name-pattern "configured Ollama default" packages\vscode-extension\test\extension-shell.test.js`
23. `npm.cmd --prefix packages/vscode-extension run check`
24. Direct Levi gateway local Ollama positive, missing-model, outage-isolation, and restore probe using Node inline script.
25. Direct Levi gateway cancellation probe using Node inline script.
26. VS Code command: `Levi: New Conversation`
27. VS Code command: `Levi: Send Agent Message`
28. `node --test --test-name-pattern "Ollama|cancellation|configured Ollama default" test\model-provider-gateway.test.js packages\vscode-extension\test\extension-shell.test.js`
29. VS Code Extension Development Host restart through existing debug configuration.
30. VS Code command: `Levi: New Conversation`
31. VS Code command: `Levi: Send Agent Message`
32. Direct Levi gateway local Ollama positive, missing-model, outage-isolation, and restore probe using Node inline script.
33. Direct Levi gateway cancellation probe using Node inline script.
34. `npm.cmd test`
35. `npm.cmd --version`
36. `git diff -- packages/vscode-extension/src/levi-extension.js packages/vscode-extension/test/extension-shell.test.js src/providers/ollama-provider-adapter.js src/model-provider-gateway.js test/model-provider-gateway.test.js`
37. `git status --short`

## Positive Qualification

| Check | PASS / FAIL / BLOCKED | Evidence |
|---|---|---|
| Ollama service reachable | PASS | `ollama version is 0.32.1`; `/api/tags` returned HTTP 200; gateway health returned `AVAILABLE`. |
| Configured model installed | PASS | `ollama list` showed `qwen2.5-coder:7b` with digest `dae161e27b...`; `/api/tags` showed family `qwen2`, parameter size `7.6B`, quantization `Q4_K_M`, capabilities `completion`, `tools`, `insert`. |
| Levi selects local provider | PASS | Extension settings used `levi.models.defaultProvider: ollama-local`, `levi.models.defaultModel: ollama:qwen2.5-coder:7b`; direct gateway response used `providerId: ollama-local`. |
| No remote fallback occurs | PASS | Remote provider disabled with `levi.openAICompatible.enabled: false`; gateway probes used `RoutingStrategies.EXPLICIT`, `allowFallback: false`, and only configured `ollama-local`. |
| Extension Host launches | PASS | Renderer log: `Loading development extension at <REPO_ROOT>\packages\vscode-extension`. |
| Runtime reaches READY | PASS | Levi output, window4: `Runtime initialized: READY.` |
| Local request succeeds | PASS | Direct request returned `status: SUCCEEDED`, `providerId: ollama-local`, `modelId: ollama:qwen2.5-coder:7b`, content preview: `A function in code performs a specific task and may return a result.` |
| Response presentation completes | PASS | Repaired Extension Host run emitted `turn_stream_event`, `turn_model_response_completed`, and `turn_completed`; latest persisted response content was `{"name": "project_summary", "arguments": {}}` with no `[object Object]` suffix. |
| Cancellation behaves safely | PASS | Final cancellation probe returned `cancelResult.state: CANCELLED`, `finalResult.status: CANCELLED`, `errorCategory: CANCELLATION`, `message: HTTP request cancelled.` |
| Restart request succeeds | PASS | After Extension Host restart, a fresh Levi conversation produced `turn_model_response_completed` and `turn_completed` in window4 logs. |
| No workspace files change | PASS | Local model prompts did not modify source. Working tree changes are limited to expected release-blocker repairs, regression tests, and this qualification record. |
| Logs contain no sensitive data | PASS | Secret scan over window4 logs for `api_key`, `token`, `password`, `secret`, private-key markers, and `sk-` returned no matches. Persisted agent state stores harmless prompt/model diagnostics as declared diagnostic behavior; no secrets or source code were observed. |

## Negative and Recovery Qualification

| Check | PASS / FAIL / BLOCKED | Evidence |
|---|---|---|
| Missing model produces bounded error | PASS | Missing model `levicore-missing-rc006a:latest` returned `status: FAILED`, `errorCode: OLLAMA_ERROR`, `errorCategory: MODEL_NOT_FOUND`, `message: Ollama returned 404.` |
| Missing model triggers no remote fallback | PASS | Probe configured only `ollama-local` and `allowFallback: false`; no remote provider was available. |
| Valid model restores successfully | PASS | Follow-up valid request returned `status: SUCCEEDED`, `providerId: ollama-local`, `modelId: ollama:qwen2.5-coder:7b`. |
| Ollama outage produces bounded error | PASS | Safe isolation used `http://127.0.0.1:65534`; result returned `status: FAILED`, `errorCategory: CONNECTION`, `message: connect ECONNREFUSED 127.0.0.1:65534`. |
| Request does not hang indefinitely | PASS | Isolated outage returned in 516 ms. |
| Ollama recovery succeeds | PASS | Valid local provider request after outage isolation succeeded without stopping or resetting the installed Ollama process. |
| Recovery requires no unsafe reset | PASS | Ollama process was not stopped; isolation used a temporary invalid localhost port. |

## Workspace DEGRADED Analysis

Exact trigger: after READY, workspace open ran analysis and emitted five `runtime_analysis_partial` events, then `workspace_degraded`. Persisted runtime evidence identifies partial analysis stages:

- `RepositoryKnowledgeGraph.build is unavailable.`
- `OfflineKnowledgeIndex.build is unavailable.`
- `RepositoryKnowledgeGraph.build is unavailable.` for repository graph stage.
- `CodeUnderstandingEngine.analyzeRepository is unavailable.`
- `ProjectIntelligenceEngine.analyzeProject is unavailable.`

Ollama does not resolve this degraded state. Local Ollama availability fixes model provider availability and local model responses, but the workspace still degrades because optional repository/project analysis methods are unavailable in the Extension Host runtime path.

Affected capabilities: project summary, repository graph/index analysis, code-understanding analysis, and project-intelligence analysis are partial or unavailable. Agent turns can still route to local Ollama and complete, but context, planning, and code-understanding commands may log bounded command errors.

User-visible impact: the Levi UI can show a DEGRADED workspace and agent turns may have reduced context quality. Local provider chat still works and does not mutate source.

Release severity: MINOR for RC-006A-04 local Ollama qualification because the approved baseline already documents DEGRADED from optional analysis limitations, and local model qualification succeeds. It remains a focused follow-up for analysis capability completeness.

## Logs and Observations

Relevant warnings and errors observed:

- Extension Host warning: `[vscode.git] Accessing a resource scoped configuration without providing a resource is not expected. To get the effective value for 'git.openRepositoryInParentFolders', provide the URI of a resource or 'null' for any resource.`
- Extension Host warning: `[vscode.git] Accessing a resource scoped configuration without providing a resource is not expected. To get the effective value for 'git.showProgress', provide the URI of a resource or 'null' for any resource.`
- Renderer error: `[vscode.mermaid-markdown-features]: Extension 'vscode.mermaid-markdown-features' CANNOT use 'legacyToolReferenceFullNames' without the 'chatParticipantPrivate' API proposal enabled`
- Renderer warning: `MCP migration: Failed to parse MCP config from vscode-userdata:/<TEMP_DIR>/levicore-rc006a-04-user-data/User/settings.json: Unexpected token '<BOM>', '<BOM>{'`
- Renderer warning: `(node:11760) [DEP0169] DeprecationWarning: url.parse() behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for url.parse() vulnerabilities.`
- Levi output: `ContextIntelligenceEngine.assemble is unavailable.`
- Levi output: `PlanningIntelligenceEngine.createPlan is unavailable.`
- Levi output: `CodeUnderstandingEngine.explainCode is unavailable.`
- Earlier restart attempt before creating a fresh conversation: `Cannot send a message to a terminal conversation.`
- Earlier pre-repair stream corruption evidence: `{"name": "runtime_health", "arguments": {}}[object Object]`

Launch and model evidence:

- Extension Host loaded `<REPO_ROOT>\packages\vscode-extension`.
- Levi activated on `onStartupFinished`.
- Levi output: `Runtime initialized: READY.`
- Latest Extension Host request emitted `turn_model_response_completed` and `turn_completed`.
- `/api/ps` after local requests showed `qwen2.5-coder:7b` loaded with the same digest prefix.

Automated test result:

- `npm.cmd test` passed 296/296.

## Files Changed

- `packages/vscode-extension/src/levi-extension.js`: registered the configured default Ollama model with local, streaming, tool-calling, structured-output, usage, and cancellation capabilities so the agent request is eligible for `ollama-local`.
- `packages/vscode-extension/test/extension-shell.test.js`: added a regression test proving the configured default Ollama model can route a streaming tool-aware request.
- `src/providers/ollama-provider-adapter.js`: mapped discovered Ollama `tools` capability to Levi `TOOL_CALLING`; ignored non-content terminal stream response objects; normalized transport cancellation as `CANCELLATION`.
- `src/model-provider-gateway.js`: preserved provider cancellation as terminal `CANCELLED` instead of rewriting it to `FAILED`.
- `test/model-provider-gateway.test.js`: added regressions for Ollama tool-capability discovery, stream response-object filtering, and cancellation state preservation.
- `RELEASE_CANDIDATE_006A_LOCAL_OLLAMA.md`: RC-006A-04 local Ollama qualification record.

Pre-existing dirty files were not reverted or reformatted.

## Defects

### Defect 1
- Severity: RELEASE_BLOCKER
- Reproduction steps: Configure Levi for `ollama-local` and `ollama:qwen2.5-coder:7b`; launch Extension Development Host; create/send an agent request that includes model tools.
- Expected behavior: Levi selects local Ollama and sends the request.
- Actual behavior: Routing rejected the configured model before contacting Ollama: `No eligible model satisfies the request.`
- Evidence: Initial persisted agent state had `modelRequests: 0`, `modelRequestIds: []`, and limitation `No eligible model satisfies the request.`
- Suspected component: VS Code extension model gateway configuration.
- Status: FIXED.

### Defect 2
- Severity: RELEASE_BLOCKER
- Reproduction steps: Run a streaming local Ollama agent request through the Extension Host.
- Expected behavior: Assistant response contains only model content.
- Actual behavior: Final transport response object was appended as text, producing `[object Object]`.
- Evidence: Persisted pre-repair assistant response contained `{"name": "runtime_health", "arguments": {}}[object Object]`.
- Suspected component: `OllamaProviderAdapter.stream`.
- Status: FIXED.

### Defect 3
- Severity: MAJOR
- Reproduction steps: Start a long local Ollama request and cancel it.
- Expected behavior: Request remains terminal `CANCELLED`.
- Actual behavior: Cancellation initially interrupted transport but final request state became `FAILED` with `HTTP request cancelled.`
- Evidence: Pre-repair cancellation probe returned `cancelResult.state: CANCELLED`, then `finalResult.status: FAILED`, `errorCategory: CONNECTION`.
- Suspected component: Ollama cancellation normalization and model gateway terminal state handling.
- Status: FIXED.

### Defect 4
- Severity: MINOR
- Reproduction steps: Restart Extension Development Host after a completed/restored terminal agent conversation, then run `Levi: Send Agent Message` without creating a fresh conversation.
- Expected behavior: Levi either creates a new conversation or explains that a new conversation is required before sending.
- Actual behavior: Levi attempted to send to a terminal conversation and logged `Cannot send a message to a terminal conversation.`
- Evidence: Window3 Levi output contained error code `cannot-send-a-message-to-a-terminal-conversation`.
- Suspected component: VS Code agent conversation restoration/active-conversation selection.
- Status: OPEN; workaround is `Levi: New Conversation` before sending after restart.

### Defect 5
- Severity: MINOR
- Reproduction steps: Launch Extension Host and open workspace.
- Expected behavior: Workspace analysis either completes or reports optional unavailable analysis capabilities while preserving local model flow.
- Actual behavior: Workspace reaches DEGRADED due unavailable analysis methods listed in Workspace DEGRADED Analysis.
- Evidence: Window4 Levi output: five `runtime_analysis_partial` events followed by `workspace_degraded`.
- Suspected component: optional repository/project analysis adapters in Extension Host runtime path.
- Status: OPEN; approved baseline already identified DEGRADED from optional analysis limitations.

## Final Verdict

PASS
