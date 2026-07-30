# Levi Desktop

`packages/levi-desktop` is the standalone Levi desktop shell. It launches as its own Electron application named Levi and does not import or depend on the VS Code extension, VS Code Chat, GitHub Copilot, Microsoft sign-in, or the VS Code extension host.

## Package Purpose

This package contains the renderer UI, Electron main process, preload bridge, and desktop-only tests required to develop and build the standalone Levi application.

## Supported Commands

From the repository root:

- `npm install`
- `npm run typecheck --workspace levi-desktop`
- `npm run test --workspace levi-desktop`
- `npm run build --workspace levi-desktop`
- `npm run dev --workspace levi-desktop`

From `packages/levi-desktop`:

- `npm run dev`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run package`
- `npm run package:signed`
- `npm run package:publish`
- `npm run package:dir`

## Generated Directories

These paths are produced locally and must never be committed:

- `node_modules/`
- `dist/`
- `dist-electron/`
- `.vite/`
- `node_modules/.vite/`
- `coverage/`
- `.cache/`
- `.turbo/`
- `release/`
- local logs and packaging outputs (`*.exe`, `*.dmg`, `*.AppImage`, `latest*.yml`, etc.)

## Clean Install Workflow

1. Remove generated desktop output if present: `dist/`, `dist-electron/`, `.vite/`, `coverage/`.
2. From the repository root, run `npm install`.
3. Run `npm run typecheck --workspace levi-desktop`.
4. Run `npm run test --workspace levi-desktop`.
5. Run `npm run build --workspace levi-desktop`.

## Development Launch

- `npm run dev --workspace levi-desktop`

This starts Vite for the renderer and launches Electron against the local dev server.

## Test Workflow

- `npm run test --workspace levi-desktop`

Tests cover the approved Home shell, workspace/planning/edit flows, security boundaries, package hygiene, and lazy-loading boundaries.

## Production Build Workflow

- `npm run build --workspace levi-desktop`

Build output:

- Renderer bundle in `dist/`
- Electron main and preload bundles in `dist-electron/electron/`

Unsigned production installer packaging is available through:

- `npm run package --workspace levi-desktop`

This produces a Windows NSIS installer in `release/`. Unsigned directory packaging for local smoke checks remains available through:

- `npm run package:dir --workspace levi-desktop`

Signing-enabled Windows release packaging is available through:

- `npm run package:signed --workspace levi-desktop`

Windows signing uses Electron Builder's environment-based certificate support. Provide the certificate as a `.pfx`/`.p12` file path or base64-encoded certificate data through `WIN_CSC_LINK` or `CSC_LINK`, and provide its password through `WIN_CSC_KEY_PASSWORD` or `CSC_KEY_PASSWORD`. The signed package command fails before packaging when signing is requested and these variables are missing, and Electron Builder fails the release when `forceCodeSigning` is enabled but the supplied credentials cannot sign the artifact.

To verify a signed Windows executable or installer, run:

- `Get-AuthenticodeSignature .\release\Levi-0.1.0-win-x64.exe | Format-List`

The `Status` field must be `Valid` for a signed release artifact. Certificates, passwords, signing tokens, and private keys must never be committed to this repository or written into package configuration.

Auto-update is implemented through Electron Builder's updater companion in the Electron main process. The renderer can only inspect update status, start update checks/downloads, and approve installation through Levi's typed preload IPC bridge. Levi does not automatically restart or install an update.

Publishing is configured through Electron Builder for GitHub draft releases in `hakimbello/levicore`:

- `npm run package:publish --workspace levi-desktop`

Publishing requires a GitHub token supplied by the environment, such as `GH_TOKEN` or `GITHUB_TOKEN`. Tokens must never be committed to this repository or written into package configuration. Live update verification remains blocked until a draft release is published and its generated update feed is available.

## Bundle Strategy

The renderer uses React lazy loading and Vite manual chunking to keep the initial Home experience small:

- Home prompt and shell UI load first.
- Monaco loads only when a workspace file is opened.
- xterm.js loads only when the terminal is expanded.
- Project Rules, planning review, and diff review panels load on demand.

Monaco remains a large lazy chunk by design. That chunk is intentionally deferred until editor functionality is needed.

## Security Boundaries

- Main process: owns native capabilities, including the window, native folder picker, local settings persistence, Ollama discovery, and terminal process creation.
- Preload: exposes a small typed `window.levi` bridge.
- Renderer: React UI only with `nodeIntegration: false`, `contextIsolation: true`, and no direct filesystem or Ollama access.

The renderer cannot provide arbitrary shell commands to the main process. Terminal creation chooses the selected project directory, or the LeviCore repository root when no project has been selected.

## Source Inventory

Track as source:

- `src/` renderer React code
- `electron/` main and preload TypeScript
- `test/` desktop tests
- `scripts/*.mjs`
- `index.html`
- `package.json`
- `tsconfig.json`, `electron/tsconfig.json`
- `vite.config.mjs`, `vitest.config.mjs`
- `README.md`
- `.gitignore`

Do not track:

- `node_modules/`
- `dist/`
- `dist-electron/`
- caches, coverage, logs, local env files, installers, screenshots, or temporary Electron files

## IDE-001B Runtime Connection

The desktop shell connects the reusable LeviCore runtime through a main-process service boundary. The Electron main process owns runtime initialization and workspace synchronization, while the renderer continues to communicate only through typed preload methods and does not receive secrets or direct filesystem/runtime authority.

## Why The VS Code Extension Is Not Imported

The VS Code extension is an integration shell for the VS Code extension host. Importing it here would bring VS Code-specific activation, commands, contribution metadata, and webview assumptions into the standalone IDE. Keeping this package separate preserves the runtime as reusable core code while allowing the desktop shell to remain independent from VS Code, Copilot, Microsoft identity, and VS Code Chat surfaces.
