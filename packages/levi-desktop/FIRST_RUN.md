# Levi — First Run Guide

Welcome to **Levi**, the standalone desktop IDE shell for local AI-assisted development.

**Version:** 0.1.0  
**Platform:** Windows x64

---

## Installing Levi

1. Download `Levi-0.1.0-win-x64.exe` from the release distribution bundle.
2. Verify the SHA-256 checksum against `release-v1/SHA256SUMS.txt`.
3. Run the installer. Choose an install directory if prompted.
4. Launch Levi from the **Start Menu** shortcut (or desktop shortcut if you selected one during interactive install).

**Note:** Unsigned builds may show a Microsoft SmartScreen warning on first install. Choose **More info → Run anyway** for internal beta builds, or wait for a signed public release.

Levi stores application data under `%APPDATA%\Levi`. Uninstalling Levi removes application files and Levi-managed app data; your workspace project folders are not deleted.

---

## Connecting Ollama

1. Install and start [Ollama](https://ollama.com/) on your machine.
2. Pull at least one model, for example: `ollama pull qwen2.5-coder`
3. Open Levi → **Settings** (sidebar) and confirm Ollama shows as detected with available models.
4. Default endpoint: `http://127.0.0.1:11434`

If Ollama is not running, Levi shows a recoverable error in chat and runtime views — the app will not crash.

---

## Connecting LM Studio

1. Install [LM Studio](https://lmstudio.ai/) and start the local server.
2. In Levi, open **Runtime Manager** (AI runtime panel).
3. Add or select the LM Studio provider.
4. Default OpenAI-compatible endpoint: `http://127.0.0.1:1234/v1`

Ensure a model is loaded in LM Studio before sending chat or agent prompts.

---

## Using Local Models

Levi is designed for **local-first** AI:

- **Runtime Manager** — view provider status, switch runtimes, and run diagnostics.
- **AI Chat** — docked chat panel with streaming responses and Markdown rendering.
- **Coding Agent** — generates plans and proposed actions; nothing executes without your approval.

Supported local provider families include Ollama, LM Studio, llama.cpp, and KoboldCpp. Endpoint defaults can be overridden through environment variables documented in the desktop README.

---

## Opening a Workspace

1. Click **Projects** in the sidebar (or use the home prompt).
2. Choose **Open Folder** and select your project directory.
3. Levi scans the workspace (respecting ignore rules and secret-file exclusions).
4. Use the **Explorer** to open files in the Monaco editor.

Recent workspaces are restored on next launch via `%APPDATA%\Levi` shell settings.

---

## Using AI Chat

1. Open a workspace (recommended for context-aware answers).
2. Open the **AI Chat** panel from the workspace layout.
3. Type a prompt and press **Enter** to send (**Shift+Enter** for a newline).
4. Use **Stop** to cancel an in-progress generation.

Chat supports citations to workspace files, edit proposals with explicit Apply/Reject, and planning flows for broader feature requests.

---

## Using the Coding Agent

1. Open the **Agent** panel in a workspace.
2. Describe what you want to accomplish.
3. Review the generated **plan** and **approval queue**.
4. Approve or reject each proposed action (file edit, task, terminal, Git, browser).

Levi never applies file changes, runs tasks, or executes terminal/Git/browser actions without explicit approval.

---

## Browser Automation

The agent can propose browser actions for **localhost development servers** only (for example `http://127.0.0.1:5173`).

- External HTTP/HTTPS URLs outside localhost are blocked.
- Credential URLs and file URLs outside the workspace are blocked.
- Screenshots are temporary local files cleaned when sessions close.

Approve browser actions individually in the agent approval queue.

---

## Terminal, Tasks, Git, and Debugger

- **Terminal** — expand the bottom panel; Levi opens a workspace-scoped shell via node-pty.
- **Tasks** — detected npm/scripts tasks appear in the Tasks panel; run requires explicit action.
- **Git** — agent can propose local Git operations (status, diff, branch, commit) with approval; no force-push or network remotes in automated flows.
- **Debugger** — configure `launch.json` in your workspace; Run and Debug panel manages sessions and breakpoints.

---

## Known Limitations

- Windows builds are **unsigned** in the current beta — expect SmartScreen warnings.
- AI features require a running local runtime; Levi does not bundle models.
- Browser automation is localhost-only and approval-gated.
- Real debugger adapter qualification requires `@vscode/js-debug` in the workspace or Levi adapter directory.
- Auto-update checks require a published GitHub draft release feed; installation always requires explicit user approval.
- Silent/unattended NSIS installs do not create a desktop shortcut (Start Menu shortcut is created).

For release engineering details, see `CHANGELOG_V1.md`, `SIGNING_READY.md`, and `V1_RELEASE_CHECKLIST.md`.

For unsigned beta download details, privacy behavior, and the proposed code-signing policy, see `RELEASE_DOWNLOAD.md`, `PRIVACY.md`, and `CODE_SIGNING_POLICY.md`.
