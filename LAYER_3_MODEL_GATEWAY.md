# Layer 3 Model Provider Gateway

## Scope

L3-003 adds a provider-neutral model access layer for Levi Platform Release 0.6. It prepares local and remote model use without coupling core runtime, intelligence engines, or the VS Code shell to a provider SDK.

## Provider Package Structure

- `src/model-provider-gateway.js`: gateway orchestration, routing, request lifecycle, health, privacy policy, retries/fallback, streaming events, usage accounting, persistence, and frontend-safe serialization.
- `src/model-provider-gateway-constants.js`: stable provider, model, request, routing, privacy, error, and stream constants.
- `src/credential-resolver.js`: reference-based credential resolver with an in-memory implementation for tests and non-hosted use.
- `src/transports/http-transport.js`: isolated Node HTTP transport plus fake transport for deterministic tests.
- `src/providers/ollama-provider-adapter.js`: local Ollama provider package using `/api/tags` and `/api/chat`.
- `src/providers/openai-compatible-provider-adapter.js`: OpenAI-compatible provider package using `/v1/models` and `/v1/chat/completions`.
- `packages/vscode-extension/src/vscode-credential-resolver.js`: VS Code SecretStorage credential resolver.

Provider adapters implement:

- `initialize`
- `shutdown`
- `healthCheck`
- `discoverModels`
- `getCapabilities`
- `complete`
- `stream`
- `cancel`
- `normalizeRequest`
- `normalizeResponse`
- `normalizeError`

## Runtime Integration

`LeviApplicationRuntime` registers `ModelProviderGateway` as an optional component and advertises model-provider capabilities through the existing Intelligence Integration Engine bridge.

Runtime commands:

- `model.providers`
- `model.models`
- `model.health`
- `model.routingPreview`
- `model.complete`
- `model.cancel`
- `model.usage`

When no gateway is registered, model commands return `UNCONFIGURED` with warnings instead of failing initialization.

## VS Code Integration

The VS Code extension constructs a gateway during activation when `levi.models.enabled` is true. It registers local Ollama by default and registers OpenAI-compatible remote providers only when explicitly configured.

Added shell surfaces:

- Models TreeView.
- Model status bar item.
- Provider, model, health, connection test, model selection, usage, credential configure, and credential clear commands.
- Provider settings for routing, privacy, Ollama, OpenAI-compatible base URL, model names, retry, timeout, and credential reference.

## Security and Privacy

- Provider credentials are resolved by reference.
- VS Code secrets are stored through `context.secrets`; tests use an in-memory secret store.
- Gateway snapshots redact provider configuration and never persist credential values.
- Remote routing for source code and sensitive content is disabled by default.
- `SECRET` and secret-like request content are blocked before provider dispatch.
- HTTP is isolated behind transport adapters; the gateway core and runtime do not import model SDKs.
- The VS Code shell does not send repository content to providers unless a runtime model command is explicitly invoked with classified request content.

## Compatibility

The gateway is optional. Existing Layer 1, Layer 2, L3-001 runtime, and L3-002 VS Code shell flows continue to run without a configured provider.

The old experimental `src/model-gateway.js`, `src/model-provider-interface.js`, `src/providers/ollama-provider.js`, and `src/providers/remote-provider.js` remain untouched for backward compatibility while L3-003 introduces the new provider-neutral gateway.

## Known Limitations

- Ollama and OpenAI-compatible capability metadata is conservative unless discovered or configured.
- Token estimation uses deterministic approximations unless an adapter supplies provider-specific tokenization.
- Node HTTP streaming currently normalizes whole transport chunks; provider adapters expose the stable stream event contract.
- Remote providers require explicit endpoint and credential-reference configuration.
- Manual Extension Development Host verification was not run in this environment.

## L3-004 Readiness

L3-003 is designed to unblock L3-004. The next layer can depend on runtime `model.*` commands, provider health, privacy preflight, routing previews, structured output validation, streaming events, cancellation, and usage accounting without importing provider-specific code.
