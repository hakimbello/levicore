# Levi Desktop Unsigned Beta Release

Status: unsigned beta preparation
Version: 0.1.0
Platform: Windows x64

This page is the repository-facing download and release checklist for Levi Desktop beta artifacts. It prepares the public documentation needed before a SignPath Foundation application, but it does not state or imply that Levi is currently signed by SignPath Foundation.

## What Levi Is

Levi is a standalone desktop IDE shell for local AI-assisted software development. It opens local workspaces, provides editor and project navigation, connects to local-first AI runtimes, and lets users review AI-generated plans and proposed actions before file edits, terminal commands, tasks, Git operations, or browser automation run.

## Beta Status

The current Levi Desktop Windows artifact is an unsigned beta release candidate. It is suitable for controlled beta testing only.

Known beta limits:

- Windows SmartScreen may warn because the installer is unsigned.
- Public release is blocked until code signing and final release qualification are complete.
- AI features require a user-selected local or remote-compatible runtime.
- Browser automation remains approval-gated and bounded by the desktop browser service.

## Download Bundle Contents

A public unsigned beta bundle should contain only:

- `Levi-0.1.0-win-x64.exe`
- `SHA256SUMS.txt`
- `BUILD_METADATA.json` when produced by CI
- `RELEASE_NOTES.md`
- `LICENSE`
- `PRIVACY.md`
- `CODE_SIGNING_POLICY.md`

Do not distribute build intermediates, `win-unpacked/`, `builder-debug.yml`, `builder-effective-config.yaml`, `.env` files, certificates, signing tokens, local logs, source maps as separate files, or temporary artifacts.

## Installation

1. Download the Windows x64 installer from the release bundle.
2. Verify the SHA-256 checksum against `SHA256SUMS.txt`.
3. Run `Levi-0.1.0-win-x64.exe`.
4. Follow the installer prompts.
5. Launch Levi from the Start Menu shortcut.

For first-run model setup and workspace guidance, see `FIRST_RUN.md`.

## SHA-256 Verification

PowerShell:

```powershell
Get-FileHash ".\Levi-0.1.0-win-x64.exe" -Algorithm SHA256
Get-Content ".\SHA256SUMS.txt"
```

The hash printed by `Get-FileHash` must match the hash in `SHA256SUMS.txt`.

## Source and Traceability

Source repository:

https://github.com/hakimbello/levicore

For CI-built beta artifacts, `BUILD_METADATA.json` must identify:

- Levi version
- Product name
- Installer name
- SHA-256 checksum
- Source repository
- Source commit SHA
- Git ref and tag when applicable
- GitHub Actions workflow name
- Workflow run id and build URL
- Signing status

This metadata maps the release artifact back to the source commit and workflow run that produced it.

## License

Levi-owned repository source is intended to be distributed under the MIT License. See the repository root `LICENSE` and the release bundle `LICENSE`.

Third-party dependencies retain their own licenses.

## Privacy

See `PRIVACY.md`.

Levi is local-first, but prompts and selected workspace context are sent to the runtime provider you select. Local providers normally use localhost endpoints. Remote OpenAI-compatible endpoints must use HTTPS and are governed by the provider you configure.

## Code Signing Policy

See `CODE_SIGNING_POLICY.md`.

Levi is preparing for SignPath Foundation eligibility. If Levi is accepted in the future, signed release artifacts will use code signing provided by SignPath.io, certificate by SignPath Foundation.

Levi is not currently signed by SignPath Foundation.
