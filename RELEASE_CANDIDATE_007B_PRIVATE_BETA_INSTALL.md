# RC-007B Private Beta Installation Qualification

## Environment

- OS: Windows 10.0.26200 (build 26200.8875)
- VS Code: 1.129.1 (commit 8a7abeba6e03ea3af87bfbce9a1b7e48fed567b8, x64)
- Node.js: v22.22.0
- Ollama: 0.32.1 (`qwen2.5-coder:7b` installed, 4.7 GB)
- LeviCore branch: `main`
- LeviCore commit: `f83a2c556fafa31d1dda30039ed576185630c40d`
- VSIX: `packages/vscode-extension/levi-vscode-extension-0.6.0.vsix`
- VSIX SHA-256: `57669C3511D2E2FB4D65873E8868143DB480139B44706AFD2F93ABDCD7E071E7`
- VSIX size: 651,981 bytes (636.7 KB)
- Test profile: `<TEST_PROFILE>` (`%TEMP%\levicore-rc007b-test-profile`)
- Extensions dir: `%TEMP%\levicore-rc007b-extensions`
- Installed extension path: `%TEMP%\levicore-rc007b-extensions\levi-platform.levi-vscode-extension-0.6.0`
- Disposable workspace: `%TEMP%\levicore-rc007b-workspace`
- Qualification harness: `%TEMP%\levicore-rc007b-qualify.js` (loads **only** from installed extension path)
- Evidence artifact: `%TEMP%\levicore-rc007b-evidence.json`

**Method note:** Phases 2–7 used a clean VS Code user-data directory and extensions directory. Functional phases 3–5 used a headless qualification harness that activates the **installed VSIX copy** via `runtime-loader.js` → `vendor/levi-core/` with an inline VS Code mock (not the monorepo, not Extension Development Host). Phase 2 install/uninstall used `code --user-data-dir` / `--extensions-dir` CLI.

---

## Package Inspection

| Check | PASS / FAIL | Evidence |
|---|---|---|
| Required package files present | PASS | `vsce ls` reports 104 entries. Present: `package.json`, `src/extension.js`, `src/levi-extension.js`, `README.md`, `PRIVACY.md`, `CHANGELOG.md`, `LICENSE`, `assets/levi.svg`. |
| Bundled runtime complete | PASS | `vendor/levi-core/` contains runtime modules including `levi-application-runtime.js`, `model-provider-gateway.js`, `providers/ollama-provider-adapter.js`, `providers/openai-compatible-provider-adapter.js`, `transports/http-transport.js`, `controlled-workspace-tool-engine.js`, `bundle-manifest.json`. Harness: `bundledRuntimeLoads=PASS`. |
| No monorepo dependency | PASS | `runtime-loader.js` resolves bundled `vendor/levi-core/` first. Activation probe from installed path only: `moduleNotFound=null`, `monorepoRequired=false`. |
| No tests packaged | PASS | `vsce ls`: no `test/` directory, no `*.test.js`. |
| No temporary state packaged | PASS | No `.test-vscode-storage/`, no runtime JSON snapshots in VSIX. |
| No secrets packaged | PASS | Static scan of installed `src/` + `vendor/` trees: no API keys, bearer tokens, or private keys. Serializer regex false-positive excluded. |
| No private machine paths packaged | PASS | No `OneDrive`, username, or dev temp paths in packaged JS/MD. |

---

## Installation

| Check | PASS / FAIL / BLOCKED | Evidence |
|---|---|---|
| Clean installation succeeds | PASS | `code --install-extension levi-vscode-extension-0.6.0.vsix --user-data-dir <TEST_PROFILE> --extensions-dir %TEMP%\levicore-rc007b-extensions` → “successfully installed”. |
| Installed version is correct | PASS | `code --list-extensions --show-versions` → `levi-platform.levi-vscode-extension@0.6.0`. Installed `package.json` version `0.6.0`. |
| Activation succeeds | PASS | Headless activate via installed `createLeviExtension` + `LeviApplicationRuntime`: runtime state `READY`. Entrypoints load without error. |
| No MODULE_NOT_FOUND | PASS | Probe requires `levi-application-runtime.js`, `ollama-provider-adapter.js`, `model-provider-gateway.js` from bundled vendor tree — all resolve. |
| Uninstall succeeds | PASS | `code --uninstall-extension levi-platform.levi-vscode-extension` → “successfully uninstalled”; extension absent from `--list-extensions`. |
| Reinstall succeeds | PASS | Reinstall VSIX → `levi-platform.levi-vscode-extension@0.6.0` listed; extension folder restored; second activation `READY`. |

---

## First Run Without Ollama

Ollama isolated by pointing `levi.ollama.baseUrl` to dead port `http://127.0.0.1:59999` with `levi.openAICompatible.enabled=false`.

| Check | PASS / FAIL / BLOCKED | Evidence |
|---|---|---|
| Missing Ollama guidance appears | PASS | Startup notification: “Levi is ready. Open the composer to start working with your local AI model.” `model.health` with `check:true` → `providerHealth=FAILED`, `localModelAvailability=false`, `remoteModelAvailability=false`. |
| Guidance is actionable | FAIL | Startup message does **not** mention Ollama install/start steps. README troubleshooting covers this, but first-run notification is generic. See Defect RC007B-001. |
| No crash or infinite loading | PASS | Runtime reaches `READY`; health check completes; no hang observed. |
| No remote fallback | PASS | OpenAI-compatible provider disabled; only dead local endpoint configured; no outbound remote traffic path enabled. |
| No automatic mutation | PASS | Disposable workspace `git status --short` remains clean after activate + health check. |

---

## First Successful Run

Ollama confirmed at `http://127.0.0.1:11434`; model `qwen2.5-coder:7b` present.

| Check | PASS / FAIL / BLOCKED | Evidence |
|---|---|---|
| Ollama configured through packaged product | PASS | Settings-only config via harness `baseConfig` (`levi.ollama.*`, `levi.models.*`); no monorepo files touched. |
| Installed model recognized | PASS | `modelGateway.listModels()` → `ollama:qwen2.5-coder:7b`. |
| Local request succeeds | PASS | `runtime.executeCommand("model.complete", …)` → `status=SUCCEEDED`, `providerId=ollama-local`, content contains `READY`. |
| No remote provider contacted | PASS | `providerId=ollama-local`; OpenAI-compatible disabled; health shows `remoteModelAvailability=false`. |
| Restart remains functional | PASS | Second activate + `model.health` → gateway available, Ollama models enumerated. |

---

## Source-Change Smoke Test

Disposable Git repo at `%TEMP%\levicore-rc007b-workspace` with `src/math.js` + `test/math.test.js`.

| Check | PASS / FAIL / BLOCKED | Evidence |
|---|---|---|
| No edit before approval | PASS | `git status --short` clean after proposal creation. |
| Approved edit succeeds | PASS | After `levi.applyApprovedChange` with Approve: `M src/math.js`. |
| Only expected files change | PASS | Only `src/math.js` modified; `package.json` reject proposal left untouched. |
| Diff is accurate | PASS | Approved change adds `isEven` helper to `src/math.js` as proposed; reject path targets `package.json` only in proposal (not applied). |
| Approved validation succeeds | PASS | `validation.run` → `WAITING_FOR_APPROVAL`; after `approval.respond APPROVED` → `status=SUCCEEDED`, `exitCode=0`. |
| Rejected edit changes nothing | PASS | `levi.rejectChange` with Cancel: `git status` unchanged from post-apply state (`M src/math.js` only). |
| No outside-workspace mutation | PASS | Harness scoped to disposable workspace; monorepo working tree not involved. |

---

## Documentation and UI

Verified from installed package at `%TEMP%\levicore-rc007b-extensions\levi-platform.levi-vscode-extension-0.6.0\`.

| Check | PASS / FAIL | Evidence |
|---|---|---|
| README renders correctly | PASS | `README.md` (4,705 bytes): structured sections, code blocks, troubleshooting table. |
| Setup instructions are understandable | PASS | VSIX install steps, Ollama install/pull, first-run workflow, approval model explained. |
| Privacy statement is accessible | PASS | `PRIVACY.md` (1,078 bytes) in package; linked from README. |
| User commands are focused | PASS | 231 commands total; **71** gated behind `config.levi.diagnostics.enabled` or advanced-details flag. Default palette shows ~160 Levi commands (workflow, models, changes, approvals). |
| Key settings are understandable | PASS | Examples: “Show developer and release-check commands…”, “Enable local and optional remote **AI models**”, Ollama base URL/default model with plain descriptions. |
| Developer surfaces remain hidden | PASS | `levi.diagnostics.enabled` default `false`; release-check / certification commands carry `enablement: config.levi.diagnostics.enabled`. |

---

## Uninstall and Residual State

### State created during qualification

- **Extension global storage:** `<TEST_PROFILE>\globalStorage\levi-platform.levi-vscode-extension\runtime\`
  - `application-runtime.json` — compact runtime snapshot (approvals, operations, configuration metadata)
  - Nested `runtime\application-runtime.json` from runtime persistence layer
- **VS Code profile artifacts:** standard VS Code cache/logs under `<TEST_PROFILE>` (not Levi-specific except globalStorage above)
- **Harness storage:** `<TEST_PROFILE>\globalStorage\levi-platform.levi-vscode-extension\runtime\` written during headless runs

### After uninstall (`code --uninstall-extension`)

- Extension removed from installed-extensions list
- Extension files under `%TEMP%\levicore-rc007b-extensions\` may remain on disk until VS Code reload (observed folder still present immediately after CLI uninstall; normal VS Code behavior)
- **`globalStorage\levi-platform.levi-vscode-extension\` persists** — not removed by extension uninstall (expected VS Code semantics)

### After reinstall

- Extension reinstalls cleanly at 0.6.0
- Reactivation succeeds with existing globalStorage present (no corrupt/incompatible state observed)
- Prior runtime JSON coexists; runtime reaches `READY`

### User impact

Residual globalStorage retains prior approval/runtime metadata. For a true first-run experience, users may delete `<profile>\globalStorage\levi-platform.levi-vscode-extension\` manually. No workspace source files are deleted or altered by uninstall.

---

## Security and Privacy

| Check | PASS / FAIL | Evidence |
|---|---|---|
| No secrets exposed | PASS | No API keys/tokens in VSIX or runtime JSON. Credential resolver uses VS Code Secret Storage references only. |
| No machine paths exposed | PASS | VSIX clean. Runtime JSON stores `storageRoot` under active profile (expected local persistence, not packaged leakage). |
| No unintended prompt logging | PASS | Qualification output channel lines are operational events (`runtime_health_checked`, `command_execution_*`); no full user prompts logged. |
| No unintended source logging | PASS | No workspace file contents written to packaged logs during qualification. |
| No remote fallback | PASS | Default config: local Ollama only; remote disabled unless explicitly configured. |

---

## Defects

### RC007B-001 — First-run Ollama guidance is generic when Ollama unreachable

- **Severity:** MINOR
- **Reproduction steps:**
  1. Install VSIX into clean profile.
  2. Ensure Ollama is not reachable (service stopped or invalid `levi.ollama.baseUrl`).
  3. Open a folder workspace and activate Levi with default notifications enabled.
- **Expected behavior:** Plain-language notification naming Ollama, with install/start/pull steps (as README states: “If Ollama is not running, Levi shows a clear message with setup steps”).
- **Actual behavior:** Notification reads “Levi is ready. Open the composer to start working with your local AI model.” `model.health` reports provider failure but no user-facing Ollama setup prompt at startup.
- **Evidence:** `%TEMP%\levicore-rc007b-evidence.json` → `missingOllamaGuidance` message; Phase 3 probe `providerHealth=FAILED`, `startupMessages=""` (no Ollama-specific warning).
- **Suspected component:** `onboarding-controller.js` / startup notification path in `levi-extension.js`

---

## Final Recommendation

**READY_FOR_PRIVATE_BETA**

All blocking qualification criteria pass:

- Installation from VSIX into an isolated profile
- Activation without monorepo access or `MODULE_NOT_FOUND`
- Bounded missing-Ollama behavior (no crash, no remote fallback, no mutation)
- Real local-model response via Ollama (`qwen2.5-coder:7b`)
- Approved source change with validation gate and successful test run
- Rejected change causes no additional mutation
- Uninstall/reinstall cycle succeeds
- No sensitive data exposure in packaged artifacts

One **MINOR** defect (RC007B-001) remains: first-run notification when Ollama is unreachable should be more actionable. This does not block private beta distribution via VSIX but should be addressed before public Marketplace release.

**Not performed (by design):** Marketplace publication, git commit, git push, Extension Development Host as primary evidence, monorepo-relative runtime imports.
