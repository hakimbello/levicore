# Levi Desktop — Version 1.0 Release Notes

**Version:** 0.1.0  
**Product name:** Levi  
**Platform:** Windows x64 (NSIS installer)  
**Release date:** _TBD_

---

## Major Features

### Standalone desktop IDE shell

Levi runs as an independent Electron application. It does not depend on VS Code, the VS Code extension host, GitHub Copilot, or Microsoft sign-in.

### Workspace and editor

- Open local project folders with native folder picker
- Recent workspace restoration
- Multi-tab Monaco editor with Save, Save All, dirty indicators, and unsaved-buffer recovery
- Explorer file tree, workspace search, and external-change conflict detection
- Project Rules panel for workspace guidance

### AI runtime (local-first)

- Runtime Manager for Ollama, LM Studio, llama.cpp, and KoboldCpp endpoints
- Automatic local runtime discovery with recoverable error states when providers are offline
- Streaming AI Chat with Markdown rendering and conversation persistence

### Coding agent

- Planning-only agent with explicit approval queue
- Approved file edits, task execution, terminal actions, Git operations, and browser automation
- Verification reports and repair suggestions gated behind user approval
- No autonomous workspace mutation without explicit approval

### Developer tools

- Integrated terminal (node-pty) with workspace-scoped sessions
- Task detection and execution panel
- DAP debugger foundation with launch configurations and breakpoint support
- Browser automation MVP (localhost HTTP only, approval-gated)

### Security and packaging

- Context isolation, sandbox, and typed preload IPC boundary
- Workspace path containment and secret-file exclusion
- Terminal command allowlist in main process
- Windows NSIS installer with Start Menu shortcut support
- electron-updater integration with explicit install approval (no silent auto-restart)

---

## Known Limitations

- **Unsigned Windows builds** — SmartScreen and Application Control warnings until Authenticode signing is applied.
- **Local AI required** — Chat and agent features need a running local runtime (Ollama, LM Studio, etc.); remote providers are environment-dependent.
- **Browser automation** — Localhost HTTP only; no arbitrary external URL navigation; screenshots are temporary local files.
- **Debugger** — Real DAP adapter qualification depends on `@vscode/js-debug` being installed in the workspace or Levi-managed adapter directory.
- **Model selection** — Conversation uses configured/default models; full per-chat model picker is limited.
- **History** — Execution history is session-oriented; long-term history persistence is bounded.
- **Upgrade qualification** — Install-over-previous-version acceptance requires manual verification when an earlier tagged installer exists.
- **OneDrive workspaces** — Local packaging to synced `release/` folders may hit file-lock errors; use a temp output directory outside OneDrive when building.

---

## Breaking Changes

Version 0.1.0 is the first public-style release of the standalone Levi desktop shell. There are no prior Levi Desktop semver releases to migrate from.

If upgrading from internal pre-release builds:

- User data lives under `%APPDATA%\Levi` (Electron `userData`).
- Uninstall removes application binaries and Levi-managed userData for the install scope; back up `%APPDATA%\Levi` before uninstall if you need conversations, agent sessions, or runtime selections.
- Workspace project files in user-selected directories are never deleted by uninstall.

---

## Checksums (Final RC — 2026-08-03)

| Artifact | SHA-256 |
|----------|---------|
| `Levi-0.1.0-win-x64.exe` | `473da0a5adfb854aedfa3029a4b78d6e5caf4656ebf429b58ab93d294d3fe264` |
| `win-unpacked/Levi.exe` | `070a6e06f738b53d5a62b364a353bb40b09986f30722e556f812d39a681fdfbb` |

Build artifacts are produced outside OneDrive at `%TEMP%\levi-desktop-release-p201703-final\` on the qualification host.

---

## License

MIT — see `release-v1/LICENSE`.
