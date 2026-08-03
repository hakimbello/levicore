# Levi Desktop — Version 1 Release Decision

**Milestone:** P2-017-04  
**Decision date:** 2026-08-03  
**Version:** 0.1.0  
**Branch:** `desktop-v1`

---

## Decision

# READY FOR INTERNAL BETA

Public release is **not** ready. Internal beta distribution of the unsigned Windows RC is supported with documented limitations.

---

## Evidence Summary

### Automated verification (2026-08-03)

| Gate | Result | Notes |
|------|--------|-------|
| `npm.cmd --prefix packages/levi-desktop run typecheck` | **PASS** | |
| `npm.cmd --prefix packages/levi-desktop test` | **FLAKY** | Default parallel Vitest: 253 pass, 1 fail (`package-hygiene` 5s timeout under load). Sequential run (`--no-file-parallelism`): **254 pass, 2 skipped**. |
| `npm.cmd --prefix packages/levi-desktop run build` | **PASS** | Vite + Electron compile |
| `npm.cmd test` | **PASS** | 263 pass (root runtime suite) |

### Packaging and qualification (P2-017-02 / P2-017-03)

| Gate | Result |
|------|--------|
| NSIS x64 installer builds | **PASS** |
| Packaged file / native module audit | **PASS** |
| Security scan (no secrets, no dev paths) | **PASS** |
| First-run launch smoke (RC unpacked binary) | **PASS** |
| Silent install / uninstall lifecycle | **PASS** |
| Workspace files preserved across install/uninstall | **PASS** |
| Authenticode signing applied | **FAIL** — `NotSigned` |
| Installed-app full CDP matrix (post App Control) | **BLOCKED** on qualification host |
| Upgrade over distinct prior binary | **MANUAL** gate |

### Final RC artifacts

| Artifact | SHA-256 |
|----------|---------|
| `Levi-0.1.0-win-x64.exe` (112,314,616 bytes) | `473da0a5adfb854aedfa3029a4b78d6e5caf4656ebf429b58ab93d294d3fe264` |
| `win-unpacked/Levi.exe` (204,755,456 bytes) | `070a6e06f738b53d5a62b364a353bb40b09986f30722e556f812d39a681fdfbb` |

Path: `%TEMP%\levi-desktop-release-p201703-final\`

### Quality audit

| Check | Result |
|-------|--------|
| TODO/FIXME in `src/` and `electron/` | **NONE** |
| Debug `console.log` in production `src/` and `electron/` | **NONE** |
| Committed secrets / credentials | **NONE** |
| Localhost in production code | **INTENTIONAL** (Ollama/LM Studio local runtime defaults; browser localhost-only policy) |
| Development URLs in packaged output | **NONE** detected in security scan |

---

## Manual Qualification Matrix

| Area | Status | Evidence |
|------|--------|----------|
| Installer | **PASS** | Silent NSIS install completes; Start Menu shortcut created |
| Launch | **PASS** | RC unpacked smoke + first qual session CDP |
| Second launch | **PASS** | First qual session; later automation blocked by App Control |
| Recent workspace | **PASS** | Service tests + shell persistence; **MANUAL** for installed binary UI |
| AI Runtime | **PASS** | RC smoke + Vitest runtime suite |
| AI Chat | **PASS** | RC smoke + 11 Vitest tests + 23 conversation tests |
| Agent | **PASS** | RC smoke + 24 agent Vitest tests |
| Git | **PASS** | Agent Git Vitest flows (local operations, approval-gated) |
| Terminal | **PASS** | RC smoke + terminal Vitest + panel integration |
| Tasks | **PASS** | Tasks Vitest + panel integration; **MANUAL** packaged UI optional |
| Browser | **PASS** | BrowserService Vitest (localhost policy); real browser qual **N/A** in Vitest |
| Debugger | **PASS** | Debugger Vitest + debug-e2e; real js-debug adapter **N/A** when not installed |

---

## Release Blocker Matrix

| Blocker | Classification | Status |
|---------|----------------|--------|
| Authenticode signing not applied | **Blocking** (public) | Open — `SIGNING_READY.md` documents path |
| SmartScreen / Application Control on unsigned binary | **Blocking** (public) | Open |
| Installed-app full UI matrix on managed host | **Blocking** (public) | Open — recommend clean VM |
| Upgrade over distinct prior binary | **Blocking** (public) | Open — manual gate |
| Dependency source maps in node_modules | **Non-blocking** | Accepted for beta |
| OneDrive `release/` EPERM | **Non-blocking** | Workaround documented |
| Silent install skips desktop shortcut | **Non-blocking** | Interactive installer only |
| package-hygiene parallel test flake | **Non-blocking** | Environmental |
| Cross-platform builds | **Future work** | Windows x64 only for V1 |
| Source control UI panel | **Future work** | Agent Git flows cover core use |
| Published auto-update feed E2E | **Future work** | Updater code present; feed not published |

---

## Distribution Package Verification

Electron-builder output at `%TEMP%\levi-desktop-release-p201703-final\` contains **development artifacts** that must **not** ship in a public distribution folder:

| Present in build output | Ship in public bundle? |
|-------------------------|------------------------|
| `Levi-0.1.0-win-x64.exe` | **YES** |
| `SHA256SUMS.txt` (from `release-v1/`) | **YES** |
| `CHANGELOG_V1.md` / release notes | **YES** |
| `LICENSE` | **YES** |
| `win-unpacked/` | **NO** |
| `builder-debug.yml` | **NO** |
| `latest.yml` | **NO** (until update channel published) |
| `*.blockmap` | **NO** (until update channel published) |

Clean distribution manifest: `release-v1/DISTRIBUTION.md`

---

## Remaining Blockers (Internal Beta → Public Release)

1. Apply Authenticode signing via `package:signed` and verify `Status: Valid`.
2. Complete interactive installed-app acceptance on a clean Windows VM without Application Control restrictions.
3. Qualify upgrade from a prior tagged installer when available.
4. Publish signed artifact with checksums, release notes, and license only.

---

## Documents Created (P2-017-04)

- `SIGNING_READY.md`
- `CHANGELOG_V1.md`
- `FIRST_RUN.md`
- `VERSION_1_FREEZE.md`
- `RELEASE_DECISION.md`
- `release-v1/DISTRIBUTION.md`
- `release-v1/SHA256SUMS.txt`
- `release-v1/LICENSE`
- `V1_RELEASE_CHECKLIST.md` (P2-017-04 section)

---

## Recommendation for Stakeholders

Ship **Levi 0.1.0** to **internal beta testers** with:

- Unsigned installer + documented SmartScreen workaround (`FIRST_RUN.md`)
- Checksum verification (`release-v1/SHA256SUMS.txt`)
- Known limitations (`CHANGELOG_V1.md`)

Do **not** publish to broad public channels until signing and interactive VM qualification gates close.
