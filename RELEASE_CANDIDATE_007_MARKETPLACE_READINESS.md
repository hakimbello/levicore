# RC-007 Marketplace Readiness

Audit date: 2026-07-19
Scope: Levi VS Code extension (`packages/vscode-extension`) as a first-time Marketplace user would experience it.
Functional baseline: RC-001 through RC-006A-06 PASS; automated suite 298/298.
Publish action: **not performed**.

## Install Experience

**FAIL**

| Step | Fresh Windows / no Levi | Evidence |
|---|---|---|
| First install | VSIX packages (`vsce package --no-dependencies`) but **does not include the Levi runtime** | `levi-extension.js` requires `../../../src/levi-application-runtime` and five other monorepo `src/` modules; VSIX tree contains only `extension/` package files (36 files). No `levi-application-runtime.js` in VSIX. |
| First activation | **Would fail** on packaged install with `MODULE_NOT_FOUND` | Relative requires resolve outside the extension install directory in a Marketplace layout. |
| Development Host install | Works when opened from monorepo with `extensionDevelopmentPath` | RC-006A qualification evidence; not representative of Marketplace install. |
| First error (Ollama missing) | Degraded model health / empty model list; user sees **"No Levi model is configured."** on model select | `levi.selectModel()` when `model.models` returns empty; Ollama enabled by default but `levi.ollama.defaultModel` defaults to empty string. |
| First successful run | Requires monorepo dev layout **or** future bundled runtime + configured Ollama model | Default `levi.experience.autoOpenOnFirstRun` is **false**; onboarding not shown automatically. |
| Uninstall | Clean deactivation path exists | `deactivate()` shuts down gateway/runtime, disposes views, saves state, clears subscriptions. |
| Reinstall | No documented migration/cleanup of `globalStorage` runtime JSON | State persists under extension global storage (`runtime/` subtree). |

Estimated clicks to a working chat (monorepo dev path, Ollama already running): open workspace → trust workspace → open Levi sidebar → run **Levi: Open** or **Levi: Focus Composer** → **Levi: Select Model** → choose model → compose message (**≥6 deliberate actions**, no guided walkthrough).

## Documentation

**FAIL**

| Asset | Status | Notes |
|---|---|---|
| README | Present, **developer-only** | 13 lines; describes L3-002 shell, npm scripts, Extension Development Host. No user setup, no Ollama install, no permissions, no privacy, no feature overview. |
| CHANGELOG | **Missing** | No `CHANGELOG.md` in extension or repo root. |
| LICENSE | **Missing** | `vsce` warns: no LICENSE / LICENSE.md / LICENSE.txt. |
| Privacy statement | **Missing** | No Marketplace `qna`, privacy URL, or in-README data-handling section. Required for an AI extension handling workspace content. |
| Ollama setup | **Not documented for users** | Onboarding step says *"Ollama can be configured later"* but README does not state Ollama must be installed separately, how to verify `http://127.0.0.1:11434`, or supported models. |
| First-run setup | **Not documented** | No walkthrough contribution; `levi.experience.autoOpenOnFirstRun` defaults to false. |
| Permissions / trust | **Not documented** | Code enforces workspace trust for protected changes; README silent. |
| Local-only / source stays local | **Not documented for users** | Defaults favor offline/local (`levi.offlineMode: true`, remote routing disabled unless explicitly enabled); not explained in README. |
| Command reference | **Missing** | 154 commands contributed; README documents zero. |
| Settings reference | **Missing** | 208 settings; no user-facing grouping or quick-start subset. |

## Metadata

**FAIL**

| Field | Current value | Marketplace readiness |
|---|---|---|
| `name` | `levi-vscode-extension` | Acceptable internal id |
| `displayName` | `Levi` | OK |
| `description` | *"VS Code shell for the Levi application runtime."* | **Engineering jargon**; not understandable to new users |
| `version` | `0.6.0` | Valid semver (pre-1.0) |
| `publisher` | `levi-platform` | Present; Marketplace publisher verification not confirmed in this audit |
| `private` | **`true`** | **Blocks Marketplace publication** |
| `license` | absent | **Blocker** |
| `repository` | absent | `vsce` warning |
| `homepage` / `bugs` | absent | Recommended |
| `icon` (Marketplace) | absent | Only activity-bar SVG at `assets/levi.svg`; no 128×128 Marketplace icon field |
| `galleryBanner` | absent | Recommended |
| `categories` | `["Other"]` only | **Suboptimal**; should include e.g. `Machine Learning`, `Programming Languages`, `Other` |
| `keywords` | absent | **Missing SEO/discovery terms** (ollama, local ai, code assistant, privacy, offline) |
| `engines.vscode` | `^1.85.0` | OK |

## Commands

**FAIL**

| Check | Result |
|---|---|
| Manifest contributes commands | **154** commands |
| Activation events | **40** `onCommand:` entries + `onStartupFinished` |
| Commands without activation event | **115** (lazy-activate via startup or first palette use may still work after startup activation) |
| User documentation | **None** in README |
| Internal / RC diagnostics exposed to palette | **Yes** — e.g. `Run Reliability Release Candidate`, `Run Security Release Candidate`, `Run Stress Release Candidate`, `Run Qualification Release Candidate`, `Show Extension Host Qualification`, `Show Local Ollama Qualification` |
| Beginner-friendly naming | **Mixed** — product commands OK (`Preview Change`, `Apply Approved Change`); many assurance/qualification commands are release-engineering terms |

Sample engineering-facing command titles that should be hidden or renamed for Marketplace users:

- `Levi: Show Model Providers` → prefer **AI Models**
- `Levi: Show Multi-Agent Team` → prefer **Team Review**
- `Levi: Show Workflows` → prefer **Project Rules** (per product language guidance)
- `Levi: Run Reliability Release Candidate` → internal only
- `Levi: Show Release Qualification` → internal only

## Settings

**FAIL**

| Check | Result |
|---|---|
| Settings count | **208** `contributes.configuration.properties` entries |
| Discoverability | Overwhelming; no curated "Getting Started" subset in docs |
| Engineering terminology in descriptions | Widespread — examples: *"Initialize LeviApplicationRuntime during extension activation"*, *"Enable the Levi model provider gateway"*, *"Enable durable Levi workflows"*, *"Enable release-candidate security assurance diagnostics"* |
| Ollama settings | Present (`levi.ollama.enabled`, `baseUrl`, `defaultModel`) but not linked from README |
| Privacy-related defaults | Sensible defaults (`allowRemoteSourceCode: false`, `offlineMode: true`) but not explained to users |

Recommended user-facing renames (documentation / UI strings, not implemented in this audit):

| Current term | Preferred user term |
|---|---|
| Provider Gateway / Model Providers | AI Model |
| Durable Workflow | Project Rules |
| Release Qualification | Release Checks (internal/beta only) |
| Security Assurance | Security Review (internal/beta only) |
| LeviApplicationRuntime | (omit from user strings) |

## UX

**FAIL**

| Check | Result |
|---|---|
| Sidebar views | **16** panels including Diagnostics, Reliability, Security Assurance, Stress & Scalability, Release Qualification — intimidating for beginners |
| Onboarding | Exists (`levi.openOnboarding`) but **not auto-offered** (`autoOpenOnFirstRun: false`) |
| Ollama prerequisite explained in-product | Weak — *"Ollama can be configured later"* without install link or health-check CTA |
| Supported models explained | No user doc; empty default model until configured |
| Dialog clarity | Approval dialogs use proposal ids (`Apply approved Levi change change-…?`) — technical |
| Internal terminology in visible UI | High — view names, document titles (`Levi Model Provider Health`, `Levi Security Assurance`), environment sections |
| Copilot panel | User-friendly composer copy (*"What do you want Levi to do?"*) — positive |
| Error presentation | Appends category suffix `(UNKNOWN)` to all normalized errors — confusing for users |
| Clicks to working state | Too many without guided setup |

## Security

**PASS** (product runtime behavior; packaging caveats noted under Packaging)

| Check | Result |
|---|---|
| Secrets in extension source | No hard-coded API keys; credential references use VS Code Secret Storage |
| Secret redaction | `product-experience-serializer.js` filters `sk-`, `ghp_`, `Bearer` patterns |
| Machine paths in extension source | None found (`wetie`, `OneDrive`, `AppData` absent) |
| Debug output default | `levi.diagnostics.enabled` defaults **false** |
| Developer logs to user | Output channel used; lifecycle messages are operational, not dump-style |
| Test fixture secrets in repo | `product-experience.test.js` contains `sk-thisshouldnotappear` — acceptable in repo, **should not ship in VSIX** |

## Packaging

**FAIL**

Command run: `npx @vscode/vsce package --no-dependencies` from `packages/vscode-extension`.

| Check | Result |
|---|---|
| `vsce package` succeeds | **Yes** → `levi-vscode-extension-0.6.0.vsix` (145.83 KB) |
| Runtime bundled | **No** — monorepo `src/` engines absent (**release blocker**) |
| `.vscodeignore` | **Missing** |
| `files` whitelist in package.json | **Missing** |
| Test artifacts in VSIX | **Yes** — entire `test/` folder (5 files) |
| Temporary / generated storage in VSIX | **Yes** — `.test-vscode-storage/runtime/` (~942 KB JSON) |
| LICENSE in VSIX | **No** |
| Warnings | Missing repository, missing license, missing ignore rules |

## Missing Assets

1. **LICENSE** file (MIT or chosen SPDX)
2. **CHANGELOG.md** (extension-scoped)
3. **Marketplace README** (user-facing; separate from developer README acceptable)
4. **Privacy statement** / Marketplace Q&A (local processing, optional remote providers, workspace data)
5. **Marketplace icon** (128×128 PNG; current SVG is minimal placeholder blocks)
6. **Gallery banner** (recommended 220×176)
7. **Screenshots** (minimum 1; recommended 3–5: sidebar, composer, change review, approval, model setup)
8. **Animated GIF** (recommended for AI assistant category listings)
9. **Walkthrough** (`contributes.walkthroughs`) for first-run Ollama + workspace trust
10. **`.vscodeignore`** excluding `test/`, `.test-vscode-storage/`, `*.vsix`
11. **Bundled runtime** or single-package layout so VSIX is self-contained
12. **`repository`**, **`bugs`**, **`homepage`** metadata
13. **`keywords`** array
14. **User command/settings reference** (can be README sections)
15. **Publisher branding assets** (consistent icon, display name, description)

## Release Blockers

### BLOCKER

| ID | Issue | Evidence |
|---|---|---|
| B1 | Packaged VSIX is not self-contained | Requires monorepo `../../../src/*`; absent from VSIX file list |
| B2 | `private: true` in extension `package.json` | Marketplace publication disallowed while private |
| B3 | No LICENSE | `vsce` warning; Marketplace requirement |
| B4 | No privacy statement for AI/workspace extension | No README section, no Q&A, no policy URL |
| B5 | README not usable by end users | Developer-only content; no install/setup |

### MAJOR

| ID | Issue | Evidence |
|---|---|---|
| M1 | Test and generated artifacts ship in VSIX | `test/*.test.js`, `.test-vscode-storage/runtime/*.json` in VSIX tree |
| M2 | No CHANGELOG | Version history absent |
| M3 | 154 commands with RC/internal diagnostics exposed in Command Palette | Qualification/reliability/security/stress RC commands |
| M4 | 16 sidebar views including internal qualification/diagnostics | Overwhelming first impression |
| M5 | No Marketplace screenshots or GIF | Listing would fail visual quality bar |
| M6 | Ollama prerequisite not documented | Users may install extension without Ollama and hit dead-end model state |
| M7 | No first-run walkthrough | `autoOpenOnFirstRun: false`; onboarding optional only |
| M8 | Category `Other` only; no keywords | Poor discovery |
| M9 | Description uses internal architecture language | *"VS Code shell for the Levi application runtime"* |
| M10 | No `.vscodeignore` / `files` manifest | Packaging hygiene |

### MINOR

| ID | Issue | Evidence |
|---|---|---|
| N1 | Marketplace `icon` field unset | Placeholder SVG only |
| N2 | Error messages append `(CATEGORY)` suffix | `errors.js` |
| N3 | Approval dialogs show internal proposal ids | `applyApprovedChange` modal |
| N4 | `repository` / `bugs` / `homepage` metadata missing | `vsce` warning |
| N5 | 115 commands lack explicit `onCommand` activation entries | Relies on `onStartupFinished` |
| N6 | Icon design minimal (two rectangles) | Functional but not professional Marketplace branding |
| N7 | Version `0.6.0` vs monorepo root `0.1.0` | Inconsistent product versioning story |

## Installation Audit Simulation (Fresh Machine)

Scenario: Windows 11, VS Code 1.85+, no Levi, install from generated VSIX, empty settings, empty workspace cache.

1. **Install VSIX** — succeeds.
2. **Reload window** — extension activates on `onStartupFinished`.
3. **Module load** — **expected failure** loading `../../../src/levi-application-runtime` (**stop** for Marketplace path).
4. *If runtime were bundled (dev monorepo path):*
   - Extension initializes runtime (`autoInitialize: true`).
   - Workspace analysis starts (`autoAnalyzeWorkspace: true`).
   - Ollama provider registered at `http://127.0.0.1:11434` with **no default model**.
   - Model health check shows unavailable provider if Ollama not running.
   - User must discover **Levi: Select Model** or configure `levi.ollama.defaultModel`.
5. **Uninstall** — `deactivate()` runs; global storage may retain prior runtime JSON until manual cleanup.
6. **Reinstall** — would reload prior extension storage state if not cleared.

## Audit Checklist (Marketplace)

| Question | Answer |
|---|---|
| Is the extension installable? | **Dev monorepo: yes. Packaged VSIX: no (runtime missing).** |
| All required metadata? | **No** |
| Every command documented? | **No** |
| Settings discoverable? | **No (208 undifferentiated settings)** |
| README understandable to new users? | **No** |
| Explains Ollama must be installed? | **No (README); weak in onboarding** |
| Explains supported models? | **No** |
| Explains first-run setup? | **No** |
| Explains permissions? | **No** |
| Explains source stays local? | **No (defaults yes, docs no)** |
| Screenshots missing? | **Yes — all missing** |
| Animated GIF recommended? | **Yes — recommended, missing** |
| Icon professional? | **No — placeholder quality** |
| Categories correct? | **No — `Other` only** |
| Keywords optimized? | **No — absent** |
| Publisher branding consistent? | **Partial — display name OK; assets/description immature** |

## Final Recommendation

**NOT_READY**

Levi is **functionally qualified** through RC-006A-06 for controlled development and Extension Host workflows, but it is **not ready for VS Code Marketplace publication or a first-time user install from VSIX**. The highest-priority gaps are self-contained packaging, end-user documentation (README, LICENSE, privacy), removal of internal RC surfaces from the default experience, and Marketplace listing assets.

**Suggested path before re-audit:**

1. Bundle or vend the Levi runtime into the extension package (or publish a single installable artifact).
2. Add LICENSE, CHANGELOG, privacy statement, and user README with Ollama prerequisites and local-only defaults.
3. Set `private: false`, add `.vscodeignore`, categories, keywords, icon, screenshots.
4. Hide or gate RC/diagnostic commands and views behind `levi.diagnostics.enabled` or a beta flag.
5. Enable first-run walkthrough (`walkthroughs` + `autoOpenOnFirstRun` default true for Marketplace profile).

Do not publish until a follow-up RC-007 re-qualification passes **Install Experience**, **Documentation**, **Metadata**, and **Packaging**.
