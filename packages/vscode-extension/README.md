# Levi — Local AI Coding Assistant

Levi is a **privacy-first AI coding assistant** for Visual Studio Code. It helps you understand code, plan changes, and apply edits **only after you approve them**. By default Levi uses **local AI models through Ollama**, so your source code stays on your machine.

## Why local models?

- **Privacy** — code stays local unless you explicitly enable remote providers
- **Control** — you approve file changes and validation commands before they run
- **Offline-friendly** — work without cloud API keys when Ollama is available

## Requirements

- Visual Studio Code **1.85** or newer
- A folder workspace (open a project folder, not a single loose file)
- **[Ollama](https://ollama.com)** installed and running for local AI features
- Windows, macOS, or Linux

## Install

### From a VSIX (beta)

1. Download `levi-vscode-extension-0.6.0.vsix`
2. In VS Code, open **Extensions**
3. Open the `...` menu → **Install from VSIX...**
4. Reload VS Code when prompted

### From source (developers)

See the [LeviCore repository](https://github.com/hakimbello/levicore) for monorepo development setup.

## Install Ollama

1. Install Ollama from [https://ollama.com](https://ollama.com)
2. Start the Ollama service (it listens on `http://127.0.0.1:11434` by default)
3. Pull a coding model, for example:

```bash
ollama pull qwen2.5-coder:7b
```

4. In VS Code settings, set **Levi › Ollama: Default Model** to your model name (for example `qwen2.5-coder:7b`)

## Supported models

Levi works with **Ollama models** you install locally. Tested examples include:

- `qwen2.5-coder:7b` — recommended coding model for local use
- Other Ollama chat/code models with tool and streaming support

Use **Levi: Test AI Model Connection** to verify Ollama is reachable.

Optional: configure an OpenAI-compatible remote endpoint in settings if you intentionally want cloud models. Remote routing for source code is **off by default**.

## First run

1. Open a project folder in VS Code
2. Trust the workspace when VS Code asks (required for reviewed file changes)
3. Click the **Levi** icon in the Activity Bar
4. Run **Levi: Open Setup Guide** if onboarding does not appear automatically
5. Run **Levi: Select AI Model** and choose your Ollama model
6. Open the composer with **Levi: Open** or **Levi: Focus Composer**

If Ollama is not running, Levi shows a clear message with setup steps.

## Example workflow

1. **Ask** — open the composer and describe what you want (for example “explain this file”)
2. **Review** — open **Change Review** to inspect a proposed patch before anything is written
3. **Approve** — use **Levi: Apply Approved Change** only when you agree with the proposal
4. **Validate** — run approved tests through Levi’s validation commands when enabled
5. **Revert** — use **Levi: Revert Change** if you need to undo an applied change

## Approvals

Levi uses explicit approval boundaries:

- File changes require your approval before apply
- Validation commands require separate approval
- Rejected changes leave your files untouched

You can review pending items in the **Approvals** view.

## Privacy

Read [PRIVACY.md](./PRIVACY.md) for details. Summary:

- Local-first defaults
- No remote source routing unless you enable it
- API keys stored in VS Code Secret Storage when configured

## Troubleshooting

| Problem | What to try |
|---|---|
| “Ollama is not reachable” | Start Ollama; confirm `http://127.0.0.1:11434` responds |
| No models listed | Run `ollama pull <model>`; set **Levi › Ollama: Default Model** |
| Levi sidebar empty | Open a folder workspace; run **Levi: Initialize** |
| Changes blocked | Trust the workspace; check **Levi › Workspace Tools: Require Approval** |
| Too many commands in palette | Turn off **Levi › Diagnostics: Enabled** (hides developer commands) |

## FAQ

**Does Levi require a cloud API key?**
No. Ollama local models are enough for the default experience.

**Does Levi edit files automatically?**
No. Source changes are proposal-only until you approve them.

**Where is state stored?**
Compact runtime data is stored in VS Code extension global storage on your machine.

**How do I see developer release-check commands?**
Set **Levi › Diagnostics: Enabled** to `true`.

## Contributing

Contributions are welcome in the [LeviCore repository](https://github.com/hakimbello/levicore). Please run extension checks before submitting changes:

```bash
npm run extension:check --prefix ../..
npm run extension:test --prefix ../..
npm run extension:validate --prefix ../..
```

## License

MIT — see [LICENSE](./LICENSE).
