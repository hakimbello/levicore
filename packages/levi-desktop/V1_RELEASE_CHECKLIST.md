# Levi Desktop Version 1 Release Checklist

Generated for milestone P2-017-01 on 2026-08-03.

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
