# RC-007A Marketplace Remediation

Audit date: 2026-07-19
Scope: Marketplace readiness remediation only (no new product features, no qualification logic changes).
Publish action: **not performed**.

## Packaging

**PASS**

| Check | Result | Evidence |
|---|---|---|
| `.vscodeignore` created | PASS | Excludes `test/`, `.test-vscode-storage/`, `scripts/`, `*.vsix` |
| `vsce package` succeeds | PASS | `levi-vscode-extension-0.6.0.vsix` (105 files, 636.7 KB) |
| Tests excluded from VSIX | PASS | `vsce ls` — no `test/` paths |
| Temp storage excluded | PASS | No `.test-vscode-storage/` in VSIX |
| LICENSE included | PASS | `LICENSE.txt` in VSIX |
| README/CHANGELOG/PRIVACY included | PASS | Present in VSIX root |
| Prepublish bundles runtime | PASS | `vscode:prepublish` → `bundle-runtime` |

## Runtime

**PASS**

| Check | Result | Evidence |
|---|---|---|
| Self-contained VSIX | PASS | `vendor/levi-core/` (72 JS modules, ~2.51 MB) included in VSIX |
| Extension entrypoint uses bundled runtime | PASS | `src/runtime-loader.js` resolves `vendor/levi-core` first, monorepo `src/` fallback for dev |
| `LeviApplicationRuntime` loads from bundle | PASS | Node probe: `typeof LeviApplicationRuntime === "function"` |
| No `MODULE_NOT_FOUND` on packaged layout | PASS | `vendor/levi-core/levi-application-runtime.js` present; loader verified |
| Qualification source unchanged | PASS | Product engines copied at pack time; no behavioral edits to `src/` qualification logic |

Implementation:
- `scripts/bundle-runtime.js` — syncs repo `src/**/*.js` → `vendor/levi-core/`
- `src/runtime-loader.js` — dual-path module resolution
- `src/levi-extension.js` — imports via `requireRuntime()`

## Documentation

**PASS**

| Asset | Status |
|---|---|
| User README | Rewritten (`packages/vscode-extension/README.md`) — install, Ollama, first run, workflow, privacy summary, FAQ |
| CHANGELOG | Added (`CHANGELOG.md`) |
| LICENSE | Added (MIT, `LICENSE`) |
| Privacy statement | Added (`PRIVACY.md`) |
| Internal engineering README | Replaced — no L3-002 / Extension Development Host-only content in primary README |

## Commands

**PASS** (with remaining polish noted under MINOR)

| Check | Result | Evidence |
|---|---|---|
| Developer RC commands hidden by default | PASS | **62** commands use `"enablement": "config.levi.diagnostics.enabled"` |
| Advanced commands gated | PASS | Advanced-pattern commands use `levi.experience.showAdvancedDetails \|\| levi.diagnostics.enabled` |
| User-facing renames | PASS | Examples: `Select AI Model`, `Show Project Rules`, `Open Setup Guide` |
| Internal views hidden | PASS | Reliability, Security Assurance, Stress, Qualification, Diagnostics views use `when: config.levi.diagnostics.enabled` |
| Sidebar view renames | PASS | Workflows → **Project Rules**; Models → **AI Models**; Multi-Agent → **Team Review** |
| Extension tests | PASS | 33/33 |
| Full suite | PASS | 298/298 |

## Settings

**PASS** (partial rewrite — see MINOR)

Key user settings rewritten with plain language and `markdownDescription`:
- `levi.enabled`, `levi.offlineMode`, `levi.ollama.*`, `levi.models.*`, `levi.workflows.enabled`, `levi.workspaceTools.*`, `levi.diagnostics.enabled`, `levi.experience.autoOpenOnFirstRun` (default now **true**)

208 total settings remain; non-critical descriptions retain engineering terms until a follow-up pass.

## Metadata

**PASS** (with asset gaps)

| Field | Value / status |
|---|---|
| `displayName` | `Levi — Local AI Coding Assistant` |
| `description` | User-facing privacy-first summary |
| `private` | **Removed** |
| `license` | `MIT` |
| `version` | `0.6.0` (valid semver) |
| `keywords` | ai, assistant, ollama, local, privacy, offline, code review, copilot |
| `categories` | Machine Learning, Programming Languages, Other |
| `repository` | `https://github.com/hakimbello/levicore.git` |
| `bugs` | `https://github.com/hakimbello/levicore/issues` |
| `homepage` | `https://github.com/hakimbello/levicore#readme` |
| Marketplace `icon` | **Removed from manifest** — VS Code Marketplace requires PNG; SVG rejected by `vsce` |
| Publisher verification | **Not verified in this audit** — `levi-platform` Marketplace account status unknown |
| Dedicated privacy URL | **Missing** — `PRIVACY.md` in package; no external privacy policy URL configured |

## Assets

**FAIL**

| Asset | Status |
|---|---|
| Activity bar SVG | Present (`assets/levi.svg`) |
| Marketplace PNG icon (128×128) | **Missing** — required for public listing |
| Gallery banner | **Missing** |
| Screenshots | **Missing** |
| Animated GIF | **Missing** (recommended) |
| Feature graphic | **Missing** |
| Release notes | **Present** (`CHANGELOG.md`) |
| LICENSE | **Present** |
| Privacy statement | **Present** (`PRIVACY.md`) |

## Install Experience

**PASS** (packaged VSIX path)

Simulated fresh install from generated VSIX:

| Step | Expected | Result |
|---|---|---|
| Install VSIX | Succeeds | PASS |
| Activation module load | Bundled runtime resolves | PASS |
| No Ollama | Warning with setup guidance | PASS — `presentFirstRunGuidance()` + onboarding copy |
| No models configured | Actionable message + Setup Guide | PASS — `selectModel()` guidance |
| Ollama running + model configured | Ready notification | PASS — success message when models available |
| Developer commands in palette | Hidden unless diagnostics enabled | PASS |
| Error messages (normal mode) | No `(CATEGORY)` suffix | PASS — `errors.js` respects diagnostics flag |

Estimated user path after install: trust workspace → Setup Guide (auto) → pull Ollama model → Select AI Model → Open composer (**~4–5 steps**, down from undocumented dead-end).

## Validation Summary

| Check | PASS / FAIL |
|---|---|
| `vsce package` | PASS |
| Clean VSIX (no test/temp files) | PASS |
| Bundled runtime in VSIX | PASS |
| Runtime activation probe | PASS |
| README / CHANGELOG / LICENSE / PRIVACY | PASS |
| Metadata (except icon URL gaps) | PASS |
| Extension tests 33/33 | PASS |
| Full suite 298/298 | PASS |
| No machine paths in extension docs | PASS |
| No debug-only output by default | PASS |

## Remaining Blockers

### BLOCKER

| ID | Issue |
|---|---|
| B1 | **Marketplace PNG icon (128×128)** — `vsce` rejects SVG; no PNG supplied |
| B2 | **Marketplace publisher verification** — `levi-platform` publisher account not confirmed in this audit |
| B3 | **Listing screenshots** — none produced (required for quality public listing) |

### MAJOR

| ID | Issue |
|---|---|
| M1 | Gallery banner and animated GIF not created |
| M2 | ~146 settings descriptions still use internal engineering language |
| M3 | Some command titles remain technical (e.g. `Show Runtime Health` in Advanced tier) |
| M4 | No dedicated external privacy policy URL (file-only) |
| M5 | End-to-end VSIX install in clean VS Code instance not manually executed in this audit (runtime load verified programmatically) |

### MINOR

| ID | Issue |
|---|---|
| N1 | Activity bar icon is placeholder-quality SVG |
| N2 | `vendor/levi-core/` generated at prepublish — must run `bundle-runtime` before pack (automated via `vscode:prepublish`) |
| N3 | Feature graphic for Marketplace not created |
| N4 | Monorepo root `package.json` version (`0.1.0`) differs from extension `0.6.0` |

## Files Changed

| File | Reason |
|---|---|
| `packages/vscode-extension/scripts/bundle-runtime.js` | Copy runtime into extension vendor tree |
| `packages/vscode-extension/scripts/apply-marketplace-manifest.js` | Command visibility, view names, setting copy |
| `packages/vscode-extension/src/runtime-loader.js` | Bundled/monorepo dual-path requires |
| `packages/vscode-extension/src/levi-extension.js` | Bundled imports, first-run guidance, user messages |
| `packages/vscode-extension/src/errors.js` | Hide category suffix unless diagnostics enabled |
| `packages/vscode-extension/src/product-experience/onboarding-controller.js` | User-facing onboarding copy |
| `packages/vscode-extension/.vscodeignore` | Exclude non-production files from VSIX |
| `packages/vscode-extension/package.json` | Metadata, scripts, command enablement, settings |
| `packages/vscode-extension/README.md` | User documentation |
| `packages/vscode-extension/CHANGELOG.md` | Release notes |
| `packages/vscode-extension/LICENSE` | MIT license |
| `packages/vscode-extension/PRIVACY.md` | Privacy statement |
| `packages/vscode-extension/test/extension-shell.test.js` | Runtime loader test import |
| `packages/vscode-extension/vendor/levi-core/**` | Generated bundled runtime (prepublish) |

## Final Recommendation

**READY_FOR_PRIVATE_BETA**

The extension VSIX is self-contained, documented, and privacy-aware enough for controlled beta distribution (VSIX sideload, trusted testers). It is **not yet ready for public VS Code Marketplace publication** until PNG icon, publisher verification, and listing screenshots (minimum) are complete.

Do not publish until RC-007B listing assets and publisher verification pass.
