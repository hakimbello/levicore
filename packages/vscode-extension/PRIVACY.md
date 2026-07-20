# Privacy

Levi is designed for **local-first** use.

## What stays on your machine

- Your workspace files and git state
- Levi conversation summaries and compact runtime state (VS Code extension storage)
- Local Ollama requests when local models are enabled

## What can leave your machine

Only if you **explicitly enable** remote AI providers and allow remote routing:

- Prompt text you send through the composer
- Selected file context you attach to a request

Default settings keep source code and sensitive content on local models only (`levi.offlineMode`, `levi.models.allowRemoteSourceCode`, and `levi.models.allowRemoteSensitiveContent` default to privacy-preserving values).

## Credentials

Remote provider API keys are stored through VS Code Secret Storage when configured. Levi does not embed provider credentials in the extension package.

## Telemetry

This extension does not include third-party analytics telemetry in the packaged build audited for RC-007A.

## Contact

Report privacy questions through the repository issue tracker listed in `package.json`.
