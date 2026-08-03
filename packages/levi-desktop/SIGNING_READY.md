# Levi Desktop — Windows Code Signing Readiness

Milestone: P2-017-04  
Version: 0.1.0  
Generated: 2026-08-03

This document verifies signing **configuration readiness** only. No certificates were added, no signatures were faked, and the current release candidate remains **unsigned**.

## Configuration Status

| Item | Status | Details |
|------|--------|---------|
| electron-builder Windows target | READY | NSIS x64 configured in `package.json` `build.win.target` |
| Signing script | READY | `npm run package:signed --workspace levi-desktop` |
| Credential validation | READY | `scripts/validate-signing-env.mjs --required` blocks packaging when credentials are missing |
| Force signing flag | READY | `-c.forceCodeSigning=true` on signed packaging path |
| Committed certificates | NONE | Confirmed — no PFX, P12, or passwords in repository |
| Credentials in CI/host env | NONE | Confirmed on qualification host (2026-08-03) |

## Required Environment Variables

Provide **one** certificate variable and **one** password variable:

| Purpose | Primary | Alternate |
|---------|---------|-----------|
| Certificate (PFX/P12 file path or base64) | `WIN_CSC_LINK` | `CSC_LINK` |
| Certificate password | `WIN_CSC_KEY_PASSWORD` | `CSC_KEY_PASSWORD` |

## Certificate Format

- Windows Authenticode certificate in **PFX** or **P12** format
- Supplied as a filesystem path or base64-encoded string in the environment variable
- Password supplied separately — never committed to source control

## Timestamp Server

When signing credentials are supplied, electron-builder uses its default RFC 3161 timestamp server:

- `http://timestamp.digicert.com`

No custom timestamp configuration is required in repository settings.

## Signed Build Command

From the repository root:

```powershell
$env:WIN_CSC_LINK = "C:\path\to\certificate.pfx"
$env:WIN_CSC_KEY_PASSWORD = "<password>"
npm.cmd run package:signed --workspace levi-desktop
```

Or use `CSC_LINK` / `CSC_KEY_PASSWORD` if preferred.

The command sequence:

1. `validate-signing-env.mjs --required` — exits non-zero if credentials missing
2. Production build (`typecheck`, Vite, Electron compile)
3. `electron-builder --win nsis -c.forceCodeSigning=true`

## Verification Command

After a signed build, verify the installer:

```powershell
Get-AuthenticodeSignature ".\release\Levi-0.1.0-win-x64.exe" | Format-List
```

Expected for a signed public release:

- `Status: Valid`
- Signer certificate chain present
- Timestamp present

## Current Release Candidate Status

| Check | Result |
|-------|--------|
| Final RC path | `%TEMP%\levi-desktop-release-p201703-final\Levi-0.1.0-win-x64.exe` |
| SHA-256 | `473da0a5adfb854aedfa3029a4b78d6e5caf4656ebf429b58ab93d294d3fe264` |
| Authenticode status | **NotSigned** |
| SmartScreen impact | First-run warning on unsigned installs |
| Application Control impact | May block automated/spawned launches of unsigned binary on managed hosts |
| Public release | **Blocked** until signed build verified |
| Internal beta | **Allowed** with documented unsigned-install warnings |

## Security Notes

- Do not commit certificates, passwords, or signing tokens.
- Do not disable `forceCodeSigning` for public release builds.
- Re-run `Get-AuthenticodeSignature` on every release artifact before publishing.
