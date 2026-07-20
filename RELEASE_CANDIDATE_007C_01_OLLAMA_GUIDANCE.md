# RC-007C-01 Ollama Guidance Repair

## Defect

**RC007B-001** — When Ollama was unavailable during startup, Levi showed a generic notification:

> Levi is ready. Open the composer to start working with your local AI model.

That message implied the product was operational even though the configured local provider could not be reached. Health checks later reported failure, and README troubleshooting existed, but the immediate first-run notification was not actionable.

## Root Cause

Two issues in `presentFirstRunGuidance()` (`packages/vscode-extension/src/levi-extension.js`):

1. **Stale health summary** — Startup logic read `summary` from the `model.health` command response, which is computed by `getGatewayHealth()` **before** `healthCheckAll()` runs. At that moment the Ollama provider was still in `CONFIGURED` state, so `availableModels` could appear greater than zero even when Ollama was unreachable.

2. **Wrong failure predicate** — Unreachable Ollama was detected with `ollama.available === false` on health-check result objects. Those objects expose `status` (`FAILED`, `UNAVAILABLE`, etc.) and do not include provider `id` or an `available` boolean, so the warning branch never ran and execution fell through to the ready message.

## Implementation

**Behavior changed**

- Run `model.health` with `check: true`, then re-read provider state from `this.modelGateway.getGatewayHealth()` and `listProviders()` **after** the probe completes.
- Treat Ollama as unreachable when the configured local provider is in `FAILED`, `UNAVAILABLE`, or `AUTHENTICATION_FAILED`.
- Show one actionable warning (plain language) covering install, start, model pull/selection, no remote fallback, and no file/command mutation.
- Suppress the “Levi is ready…” message when Ollama is unreachable.
- Guard with `startupGuidanceDelivered` to prevent duplicate notifications on repeated guidance calls in the same activation.
- Preserve existing ready message when Ollama is reachable and models are available.

**Files touched**

| File | Change |
|---|---|
| `packages/vscode-extension/src/levi-extension.js` | Readiness-dependent startup messaging; import `ProviderStates`; dedupe flag |
| `packages/vscode-extension/test/startup-guidance.test.js` | New regression tests (5 cases) |
| `packages/vscode-extension/test/fake-vscode.js` | Track `__infoMessages` / `__warningMessages` arrays for assertions |

No provider architecture, approval flow, onboarding framework, or unrelated UI strings were modified.

## Automated Validation

| Check | Result | Evidence |
|---|---|---|
| Extension tests | PASS | `npm test` in `packages/vscode-extension` → **38/38** (includes 5 new startup-guidance tests) |
| Full suite | PASS | `npm test` at repo root → **303/303** |
| Packaging | PASS | `npx @vscode/vsce package --no-dependencies` → `levi-vscode-extension-0.6.0.vsix` (105 files, 636.92 KB) |
| Bundled runtime | PASS | `npm run bundle-runtime`; installed copy loads `vendor/levi-core/levi-application-runtime.js` without monorepo path |

## Packaged Manual Validation

Clean profile: `<TEST_PROFILE>` = `%TEMP%\levicore-rc007c-test-profile`
VSIX installed from freshly packaged `packages/vscode-extension/levi-vscode-extension-0.6.0.vsix`
SHA-256: `80A2AD399C389D1F4F035470CE241C43262DF2486A3BFA1C5A4F65CD3C95B349`
Validation harness loads **only** from installed extension path (not monorepo / Extension Development Host).

| Scenario | Result | Evidence |
|---|---|---|
| Ollama unavailable | PASS | Dead port `59999`: warning shown, no ready info message |
| No misleading ready message | PASS | `deadInfo: []` — no “Levi is ready…” when Ollama unreachable |
| Actionable guidance displayed | PASS | Warning: “Levi could not connect to Ollama… Install Ollama… start the Ollama app… pull or select a supported model… No remote AI service was used… did not change any files or run commands.” |
| No remote fallback | PASS | `levi.openAICompatible.enabled=false`; dead-end local endpoint only |
| No workspace mutation | PASS | Disposable workspace unchanged during dead-Ollama activate |
| Ollama restored | PASS | Second activate with `http://127.0.0.1:11434` → ready info message |
| Local request succeeds | PASS | `model.complete` → `status=SUCCEEDED`, `providerId=ollama-local`, content `READY` |

## Changed Files

- `packages/vscode-extension/src/levi-extension.js`
- `packages/vscode-extension/test/startup-guidance.test.js` (new)
- `packages/vscode-extension/test/fake-vscode.js`

## Final Recommendation

**READY_FOR_PUBLIC_RELEASE_ASSETS**

RC007B-001 is repaired. Startup guidance is now readiness-dependent, actionable when Ollama is unreachable, and unchanged when Ollama is available. Automated and packaged manual validation pass. No publication, commit, or push was performed.
