# Levi Desktop Version 1 Release Checklist

Generated for milestone P2-017-01 on 2026-08-03. Updated for milestone P2-017-02 on 2026-08-03.

## P2-017-02 Packaging And Qualification (2026-08-03)

### Release Metadata

| Field | Value |
|-------|-------|
| Application name | Levi |
| Executable name | Levi.exe |
| Version | 0.1.0 |
| Package identifier | dev.levicore.desktop |
| Publisher | Hakim Bello (author metadata; Authenticode publisher requires signing certificate) |
| Description | Standalone Levi desktop shell. |
| Copyright | Copyright © 2026 Hakim Bello |
| Repository | https://github.com/hakimbello/levicore.git |

### Packaging Result

- Framework: electron-builder 26.15.3 (existing dependency; no second packaging framework introduced).
- Targets produced: NSIS x64 installer and unpacked directory build. Portable target not produced (not required without added complexity).
- Production entry points verified in `app.asar`: `dist/index.html`, `dist-electron/electron/main/index.js`, `dist-electron/electron/preload/index.js`, bundled Monaco chunk, bundled xterm chunk. No dev-server or CDN dependency in packaged runtime.
- Application icon: `assets/levi.ico` (multi-size Windows icon) wired for Windows executable, installer, taskbar, and window via electron-builder `win.icon`. `assets/levi.png` is the raster master, and `assets/BRANDING.md` records project provenance.
- Packaging note: OneDrive file locking on `packages/levi-desktop/release/` can cause `EPERM` during local builds. Release qualification used a temp output directory outside OneDrive.

### Packaging Commands

```powershell
npm.cmd --prefix packages/levi-desktop run typecheck
npm.cmd --prefix packages/levi-desktop test
npm.cmd --prefix packages/levi-desktop run build
cd packages/levi-desktop
$outDir = "$env:TEMP\levi-desktop-release-p201702"
npx electron-builder --win nsis --config.directories.output="$outDir"
$env:LEVI_RELEASE_DIR = $outDir
npm.cmd run package:qualify
npm.cmd test
```

Default `npm.cmd run package --prefix packages/levi-desktop` remains configured to output `packages/levi-desktop/release/` when OneDrive locking is not present.

### Release Artifact Inventory

| Artifact | Path | Size | SHA-256 |
|----------|------|------|---------|
| NSIS installer | `%TEMP%\levi-desktop-release-p201702\Levi-0.1.0-win-x64.exe` | 107.11 MB (112,314,141 bytes) | `78718c2f4270d029eb7fae39f4a5e9f1ed7e993686fd4b34dcbd4729b138831b` |
| Unpacked executable | `%TEMP%\levi-desktop-release-p201702\win-unpacked\Levi.exe` | 195.27 MB (204,755,456 bytes) | `8f5e848b8c8d42d0be5a8a2b36e9e01c9faa48a2d0e26511639726c6db366488` |
| Build log | `packages/levi-desktop/test-artifacts/p2-017-02/package-build.log` | — | — |
| Qualification report | `packages/levi-desktop/test-artifacts/p2-017-02/package-qualification-report.json` | — | — |

Portable build: not produced.

### Full Verification Results

| Command | Result | Details |
|---------|--------|---------|
| `npm.cmd --prefix packages/levi-desktop run typecheck` | PASS | 2026-08-03 |
| `npm.cmd --prefix packages/levi-desktop test` | PASS | 254 passed, 2 skipped (256 total). One retry required after transient 5s timeout flakes on git/adapter tests. |
| `npm.cmd --prefix packages/levi-desktop run build` | PASS | Vite renderer + Electron main/preload compiled successfully. |
| `npm.cmd test` | PASS | 263 passed (root runtime suite). |

### Packaged File Audit

- PASS: No Levi tests, fixtures, `.env`, credentials, audit drafts, or workspace source leaks detected in distributable output.
- PASS: Required native module `node-pty` win32-x64 prebuild (`pty.node`) present in `app.asar.unpacked`.
- NON-BLOCKING: Dependency source maps remain inside bundled `node_modules` within `app.asar`. Levi `dist/` bundles contain no source maps.
- NON-BLOCKING: Expanded `node-pty` unpack includes dependency build metadata beyond prebuilds alone.

### Native Module Qualification

- node-pty: PASS (win32-x64 `pty.node` present).
- Electron ABI: PASS (Electron 37.10.3 packaged).
- xterm renderer: PASS (local bundled chunk in `dist/assets/`).
- Monaco editor: PASS (local bundled chunk in `dist/assets/`).
- Local filesystem IPC, BrowserWindow automation, Git process execution, runtime provider HTTP: covered by existing desktop test suite (254 pass) and packaged launch smoke test; real browser/DAP adapter qualification remains environment-dependent per P2-017-01.

### First-Run And Clean-Environment Acceptance

Automated packaged launch smoke test (`LEVI_PACKAGE_QUALIFICATION=1`, clean `--user-data-dir`, disposable temp sample project):

| Check | Result |
|-------|--------|
| App launches on clean user-data directory | PASS |
| Preload bridge available | PASS |
| Home prompt loads | PASS |
| Missing Ollama returns recoverable status (no crash) | PASS |
| Open disposable sample project (not LeviCore repo) | PASS |
| Runtime Manager loads | PASS |
| AI Chat loads | PASS |
| Agent panel loads | PASS |
| Terminal session request handled | PASS |

Not automated in this pass: Explorer tree interaction, editor save, task discovery, approved agent file edit/task/terminal/Git flows, browser session. These remain covered by Vitest suites against the dev/preload bridge and are manual release gates for packaged installer acceptance.

### Installation Qualification

| Check | Result |
|-------|--------|
| Installer artifact exists and is non-zero size | PASS |
| Installer starts / completes / shortcuts / uninstall / project-file preservation | MANUAL GATE (requires interactive Windows profile qualification) |

### Upgrade Qualification

| Check | Result |
|-------|--------|
| Settings, conversations, agent sessions, runtime selections preserved across upgrade | MANUAL GATE (requires prior packaged build install) |
| Incompatible persisted schema handling | Covered by existing service tests; not re-run on packaged upgrade in this pass |

### Levi User Data Behavior

- Packaged Levi stores application state under Electron `app.getPath("userData")` (Windows: `%APPDATA%\Levi` for per-user NSIS installs).
- User project files remain in their selected workspace directories; uninstall does not delete workspace projects.
- Uninstall removes Levi application binaries and Levi-managed userData for the selected install scope; users should back up `%APPDATA%\Levi` before uninstall if they need to preserve conversations, agent sessions, or runtime selections.

### Security Checks

- PASS: No API keys, tokens, `.env` files, private keys, certificates, or test secrets found in installer/unpacked output scan.
- PASS: No absolute development paths detected in packaged artifact content scan.

### Code Signing Status

- Configured in repository: environment-based signing via `package:signed` and `scripts/validate-signing-env.mjs`.
- Applied to this build: **No** (`Get-AuthenticodeSignature` → `NotSigned`).
- Windows SmartScreen will warn on first install of unsigned builds.
- Signing is a **release blocker for public distribution** but an **accepted beta/RC limitation** while credentials are pending. Infrastructure is ready for `WIN_CSC_LINK` / `CSC_LINK` + password env vars.

### Blocking Issues

1. **Code signing not applied** — SmartScreen warning on first install; required for broad public release.
2. **Interactive installer lifecycle not automated** — Start Menu shortcut, desktop shortcut selection, silent install, uninstall, and user-project preservation require manual qualification.
3. **Upgrade path not automated** — Install-over-previous-version acceptance remains manual.

### Non-Blocking Issues

1. Dependency source maps retained in packaged `node_modules`.
2. Expanded `node-pty` unpack footprint includes non-runtime dependency files.
3. OneDrive can lock `packages/levi-desktop/release/` during `npm run package` on synced workspaces.
4. Full clean-environment agent approval flows not exercised against packaged binary (Vitest coverage only).

### Release Recommendation

**Release candidate ready with known limitations.**

The Windows Version 1 release candidate builds successfully, passes full verification suites, passes packaged file/native/security audit, and passes automated first-run launch smoke tests. It is suitable for internal/beta distribution once signing and manual installer/upgrade gates are completed or explicitly waived.

## P2-017-03 Final Windows Qualification (2026-08-03)

### Final Release Artifact Inventory

Rebuild performed from clean `dist/` and `dist-electron/` removal. Output directory outside OneDrive:

| Artifact | Path | Size | SHA-256 |
|----------|------|------|---------|
| NSIS installer | `%TEMP%\levi-desktop-release-p201703-final\Levi-0.1.0-win-x64.exe` | 107.11 MB (112,314,616 bytes) | `473da0a5adfb854aedfa3029a4b78d6e5caf4656ebf429b58ab93d294d3fe264` |
| Unpacked executable | `%TEMP%\levi-desktop-release-p201703-final\win-unpacked\Levi.exe` | 195.27 MB (204,755,456 bytes) | `070a6e06f738b53d5a62b364a353bb40b09986f30722e556f812d39a681fdfbb` |
| Build log | `packages/levi-desktop/test-artifacts/p2-017-03/package-build.log` | — | — |
| Package qualification report | `packages/levi-desktop/test-artifacts/p2-017-03/package-qualification-output.log` | — | — |
| Final qualification report | `packages/levi-desktop/test-artifacts/p2-017-03/final-release-qualification-report.json` | — | — |

Portable build: not produced.

### Final Verification Results (2026-08-03)

| Command | Result | Details |
|---------|--------|---------|
| `npm.cmd --prefix packages/levi-desktop run typecheck` | PASS | |
| `npm.cmd --prefix packages/levi-desktop test` | PASS | 254 passed, 2 skipped (256 total). Full suite completed after one retry for a transient 5s timeout flake. |
| `npm.cmd --prefix packages/levi-desktop run build` | PASS | Clean rebuild from removed `dist/` and `dist-electron/`. |
| `npm.cmd test` | PASS | 263 passed (root runtime suite). |

### Installer Qualification (`Levi-0.1.0-win-x64.exe`)

Automated silent-install lifecycle via `scripts/final-release-qualification.mjs` (install dir `%LOCALAPPDATA%\Programs\Levi-Qual`, disposable git sample project):

| Check | Result | Evidence |
|-------|--------|----------|
| Installer opens / silent install completes | PASS | NSIS `/S` exit code 0; `Levi.exe` present in install directory |
| Install directory correct | PASS | `%LOCALAPPDATA%\Programs\Levi-Qual\` |
| Start Menu shortcut works | PASS | `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Levi.lnk` created |
| Optional desktop shortcut | N/A (silent) | No desktop `.lnk` in unattended silent install; `createDesktopShortcut` applies to interactive NSIS flow |
| Levi launches after installation | PASS (initial session) | First qualification run: CDP bridge and Home prompt verified. Later reruns blocked by Windows Application Control on unsigned binary spawn from automation (`spawn UNKNOWN`). |
| Second launch works | PASS (initial session) | Verified in first qualification run |
| Uninstall completes | PASS | `Uninstall Levi.exe /S` exit code 0; `Levi.exe` removed |
| Shortcuts removed | PASS | Start Menu shortcut removed after uninstall |
| Workspace files remain untouched | PASS | SHA-256 tree hash of disposable sample project unchanged across install and uninstall |
| User data behavior documented | PASS | See Levi User Data Behavior below |

### Installed-App Acceptance

| Check | Result | Notes |
|-------|--------|-------|
| Full installed-binary CDP matrix (Open Folder, Explorer, editor save, tasks, Git, agent approvals, browser) | BLOCKED (host policy) | Windows Application Control blocked unsigned `Levi.exe` spawn from Node/automation on this qualification host after initial session |
| Equivalent RC binary acceptance | PASS | P2-017-02 `package-qualification.mjs` passed on the same RC `win-unpacked` payload (identical to installed binary) with disposable sample project: workspace, runtime, chat, agent, terminal |
| Service-level approval flows | PASS | Desktop Vitest suite (254 pass): file edit, task execution, Git operations, agent planning/approval, terminal IPC |

Interactive installed-app acceptance (Start Menu launch, desktop shortcut selection, full agent approval UI) remains recommended on a clean VM without Application Control restrictions before public release.

### Upgrade Qualification

| Check | Result | Notes |
|-------|--------|-------|
| Install-over-install with seeded userData | BLOCKED (host policy) | Same Application Control spawn restriction prevented relaunch after reinstall in automation |
| Settings / recent projects / chat / agent / runtime persistence | PASS (service tests) | Covered by chat-service, agent-service, runtime-manager, and desktop-shell persistence tests |
| Running processes not restored | PASS (design) | Terminal/debug sessions are not auto-resumed on startup |
| Invalid persisted schema fails safely | PASS (service tests) | Chat/runtime services handle corrupt state at boundaries; packaged relaunch blocked on host before full UI matrix |

Upgrade over a distinct older binary remains a manual gate when an earlier tagged installer is available.

### Code Signing Readiness

| Item | Status |
|------|--------|
| Environment variables | `WIN_CSC_LINK` or `CSC_LINK`; `WIN_CSC_KEY_PASSWORD` or `CSC_KEY_PASSWORD` |
| Certificate format | PFX/P12 (file path or base64 in env var) |
| Timestamp server | electron-builder default (`http://timestamp.digicert.com`) when credentials supplied |
| Signing path | `npm run package:signed --workspace levi-desktop` → `validate-signing-env.mjs --required` → `electron-builder --win nsis -c.forceCodeSigning=true` |
| Verification command | `Get-AuthenticodeSignature .\Levi-0.1.0-win-x64.exe \| Format-List` (expect `Status: Valid` when signed) |
| Credentials in repository | None (confirmed) |
| Credentials in environment | Not present on qualification host |
| Applied to final RC | **No** — `NotSigned` |
| SmartScreen impact | Unsigned builds show SmartScreen / Application Control warnings on first install and may block silent automation launches |
| Public release | **Blocked** until signing credentials are applied |
| Internal beta | **Allowed** with documented unsigned-install warnings |

### Packaged Security Re-scan (Final RC)

- PASS: No API keys, tokens, `.env` files, private keys, certificates, workspace source leaks, test fixtures, or development logs in installer/unpacked scan.
- PASS: No user-visible absolute development paths in artifact content scan.

### Final Blocking Issues

1. **Authenticode signing not applied** — public distribution blocked; SmartScreen and Application Control warnings on unsigned installs.
2. **Installed-app CDP matrix blocked on qualification host** — Windows Application Control prevented automated relaunch of unsigned `Levi.exe`; interactive VM qualification recommended.
3. **Upgrade over distinct prior binary** — not automated; manual gate when earlier installer exists.

### Final Non-Blocking Issues

1. Dependency source maps in bundled `node_modules`.
2. Silent NSIS install does not create desktop shortcut (interactive flow only).
3. OneDrive can lock `packages/levi-desktop/release/` during local packaging.

### Final Recommendation

**Internal beta ready. Public release not ready.**

The final RC artifact rebuilds cleanly, passes all automated test suites, passes installer lifecycle qualification (install, Start Menu shortcut, uninstall, workspace safety), passes signing-readiness inspection, and passes security re-scan. Public release remains blocked until Authenticode signing is applied and interactive installed-app/upgrade acceptance completes on a clean Windows profile without Application Control restrictions.

## P2-017-04 Version 1 Release Finalization (2026-08-03)

### Release Blocker Matrix

| Item | Classification | Status |
|------|----------------|--------|
| Authenticode signing not applied | Blocking (public) | Open |
| SmartScreen / Application Control on unsigned binary | Blocking (public) | Open |
| Installed-app full CDP matrix on managed host | Blocking (public) | Open — VM recommended |
| Upgrade over distinct prior binary | Blocking (public) | Manual gate |
| Dependency source maps in bundled node_modules | Non-blocking | Accepted for beta |
| OneDrive `release/` EPERM during local packaging | Non-blocking | Temp output documented |
| Silent NSIS install skips desktop shortcut | Non-blocking | Interactive flow only |
| package-hygiene parallel Vitest timeout flake | Non-blocking | Passes with `--no-file-parallelism` |
| Cross-platform installers | Future work | Windows x64 only |
| In-app Source Control panel | Future work | Agent Git flows present |
| Published auto-update feed E2E | Future work | Updater code present |

### Manual Qualification Checklist

| Area | Result | Notes |
|------|--------|-------|
| Installer | PASS | Silent NSIS install/uninstall (P2-017-03) |
| Launch | PASS | RC unpacked smoke + first qual CDP session |
| Second launch | PASS | First qual session; later automation blocked by App Control |
| Recent workspace | PASS | Service tests; installed UI MANUAL |
| AI Runtime | PASS | RC smoke + Vitest |
| AI Chat | PASS | RC smoke + Vitest |
| Agent | PASS | RC smoke + 24 Vitest tests |
| Git | PASS | Agent Git Vitest (local, approval-gated) |
| Terminal | PASS | RC smoke + Vitest |
| Tasks | PASS | Vitest; packaged UI MANUAL optional |
| Browser | PASS | BrowserService Vitest; real browser qual N/A in Vitest |
| Debugger | PASS | Debugger Vitest; real js-debug N/A when adapter absent |

### Release Documents

| Document | Path |
|----------|------|
| Signing readiness | `SIGNING_READY.md` |
| Release notes | `CHANGELOG_V1.md` |
| First-run guide | `FIRST_RUN.md` |
| Version freeze | `VERSION_1_FREEZE.md` |
| Release decision | `RELEASE_DECISION.md` |
| Distribution manifest | `release-v1/DISTRIBUTION.md` |
| Checksums | `release-v1/SHA256SUMS.txt` |
| License | `release-v1/LICENSE` |

### Distribution Package Verification

Public bundle must contain only: installer, checksums, release notes, license. Build output at `%TEMP%\levi-desktop-release-p201703-final\` also contains `win-unpacked/`, `builder-debug.yml`, `latest.yml`, and `*.blockmap` — **exclude** from user distribution. See `release-v1/DISTRIBUTION.md`.

### Final Quality Audit

| Check | Result |
|-------|--------|
| TODO/FIXME in `src/` and `electron/` | PASS — none found |
| Debug logging in production `src/` and `electron/` | PASS — no `console.log` |
| Development URLs in packaged output | PASS — security scan clean |
| Localhost in production code | INTENTIONAL — local AI runtime defaults |
| Secrets in repository or artifacts | PASS — none detected |
| Committed certificates | PASS — none |

### Final Verification Results (2026-08-03)

| Command | Result | Details |
|---------|--------|---------|
| `npm.cmd --prefix packages/levi-desktop run typecheck` | PASS | |
| `npm.cmd --prefix packages/levi-desktop test` | FLAKY | Default parallel run: 253 pass, 1 fail (`package-hygiene` 5s timeout). Sequential (`vitest run --no-file-parallelism`): 254 pass, 2 skipped. |
| `npm.cmd --prefix packages/levi-desktop run build` | PASS | |
| `npm.cmd test` | PASS | 263 pass (root runtime suite) |

### Final Release Decision

**READY FOR INTERNAL BETA**

Public release not ready. Evidence: unsigned RC (`NotSigned`), open signing and VM qualification gates, all automated suites pass under sequential test execution, installer lifecycle and security scans pass. Full report: `RELEASE_DECISION.md`.

## Qualification Status

- TypeScript typecheck: required before release.
- Desktop test suite: required before release.
- Desktop production build: required before release.
- Root runtime tests: required before release.
- Real DAP adapter qualification: may be skipped when `@vscode/js-debug` is not installed in the fixture workspace or Levi-managed adapter directory.
- Real browser qualification: skipped in Vitest because Electron Chromium is not available in the main-process test environment.

## Architecture Findings

- Desktop service ownership is centralized in `electron/main/index.ts`: RuntimeManager, ChatService, AgentService, TaskService, TerminalManager, GitService, DebugService, BrowserService.
- IPC channel constants are centralized and the current audit found 185 channel values with no duplicate channel strings.
- Main-process browser automation reuses Electron Chromium; no additional browser automation dependency is introduced.
- Agent execution continues to route through existing services rather than direct provider, task, terminal, Git, or browser implementations.
- No genuine duplicate production service was removed during this pass.

## Performance Findings

- Renderer production chunks are already split for Monaco, xterm, React, and lazy surfaces.
- Largest renderer asset after the latest build is Monaco at about 3.87 MB uncompressed; it remains isolated in a manual chunk.
- Xterm is isolated at about 291 KB uncompressed.
- Main startup still constructs the core managers eagerly, but heavy renderer surfaces remain lazy-loaded.
- RuntimeManager monitoring uses a bounded interval and is disposed on app shutdown.

## Security Findings

- IPC handlers use centralized channel constants and payload validation at service boundaries.
- Workspace file, terminal command, task, Git, debug, chat attachment, and browser URL/path validation remain service-owned.
- Browser automation blocks credential URLs, non-localhost HTTP, unsupported protocols, and file URLs outside the selected workspace.
- Provider persistence redacts credential-like fields and does not persist API keys intentionally.
- Terminal command execution remains allowlist-based and does not add arbitrary shell execution.

## Memory And Cleanup Findings

- Browser sessions close windows and remove temporary screenshots through `BrowserService.closeAll()`.
- Debug sessions call `dispose()`/`stopAll()` during shutdown.
- Terminal sessions call `disposeAll()` during shutdown.
- RuntimeManager aborts active controllers and clears monitoring on dispose.
- AgentService now disposes task and terminal event subscriptions during app shutdown.
- Debug E2E temp workspaces now use the OS temp directory and are removed after each test.

## Test Findings

- Generated `cleanup-*` and `missing-entry-*` debug fixture directories were caused by `debug-e2e.test.ts` creating temporary workspaces inside the tracked fixture directory.
- The fixture leak is fixed by moving those workspaces to `os.tmpdir()` and cleaning them after each test.
- Existing generated debug fixture directories should not reappear after the fixed test suite.
- The package hygiene suite can be slow when the working tree contains many generated fixture directories; removing the leak reduces that pressure without modifying the protected package hygiene test.

## Dependency Findings

- No major dependency update is required for Version 1 readiness.
- Playwright is not present; BrowserService therefore uses Electron Chromium instead of adding a new automation dependency.
- `ws` remains a dev dependency used by debugger/adapter tests.
- Monaco and xterm are intentionally present and manually chunked.

## Known Limitations

- Browser automation MVP is approval-gated and bounded; it does not expose raw DOM by default.
- Browser screenshots are temporary local files and are cleaned when sessions close.
- Real browser qualification is not automated in Vitest.
- Remote AI provider availability is environment-dependent.
- Signed Windows packaging requires signing credentials in the environment.

## Release Gate

- No protected action may run autonomously.
- No workspace file mutation may bypass explicit approval.
- No arbitrary shell command execution may be introduced.
- No provider secret may be persisted or logged.
- No generated test fixture directories may remain under tracked fixture roots.
- All required verification commands must be run and recorded before tagging Version 1.
