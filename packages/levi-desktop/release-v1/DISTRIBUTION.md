# Levi Desktop — Version 1 Distribution Bundle

**Version:** 0.1.0  
**Platform:** Windows x64  
**Verified:** 2026-08-03 (P2-017-04)

---

## Public Distribution Contents

A public or internal-beta distribution folder must contain **only** these files:

| File | Required | Description |
|------|----------|-------------|
| `Levi-0.1.0-win-x64.exe` | Yes | NSIS x64 installer |
| `SHA256SUMS.txt` | Yes | Checksum for installer (this folder) |
| `CHANGELOG_V1.md` | Yes | Release notes (copy from package root or rename to `RELEASE_NOTES.md`) |
| `LICENSE` | Yes | MIT license (this folder) |

Optional for signed public release after update channel is live:

| File | When |
|------|------|
| `latest.yml` | After GitHub draft release publish with electron-updater |
| `Levi-0.1.0-win-x64.exe.blockmap` | With auto-update feed |

---

## Must NOT Ship

These electron-builder outputs are **development or internal artifacts** and must be excluded from user-facing distribution:

- `win-unpacked/` — unpacked directory build (internal smoke/qualification only)
- `builder-debug.yml` — electron-builder debug log
- `builder-effective-config.yaml` — build config dump
- `*.7z` NSIS intermediate archives
- Source maps from dependency `node_modules` (embedded in installer; not separate files)
- Test fixtures, `.env`, credentials, or repository source trees

---

## Verification Performed (2026-08-03)

Build output inspected at:

`%TEMP%\levi-desktop-release-p201703-final\`

| Item | In build dir | In public bundle |
|------|--------------|------------------|
| `Levi-0.1.0-win-x64.exe` | Present (112,314,616 bytes) | **Include** |
| `SHA256SUMS.txt` | Generated in repo `release-v1/` | **Include** |
| Release notes | `CHANGELOG_V1.md` in package root | **Include** |
| `LICENSE` | `release-v1/LICENSE` | **Include** |
| `win-unpacked/` | Present | **Exclude** |
| `builder-debug.yml` | Present | **Exclude** |
| `latest.yml` | Present | **Exclude** (beta) |
| `*.blockmap` | Present | **Exclude** (beta) |

Security re-scan (P2-017-03): no API keys, tokens, `.env`, private keys, or development path leaks in installer/unpacked scan.

---

## Assembly Instructions

```powershell
$dist = ".\levi-v1-dist"
New-Item -ItemType Directory -Force -Path $dist
Copy-Item "$env:TEMP\levi-desktop-release-p201703-final\Levi-0.1.0-win-x64.exe" $dist
Copy-Item "packages\levi-desktop\release-v1\SHA256SUMS.txt" $dist
Copy-Item "packages\levi-desktop\release-v1\LICENSE" $dist
Copy-Item "packages\levi-desktop\CHANGELOG_V1.md" "$dist\RELEASE_NOTES.md"

# Verify checksum
Get-FileHash "$dist\Levi-0.1.0-win-x64.exe" -Algorithm SHA256
# Expected: 473da0a5adfb854aedfa3029a4b78d6e5caf4656ebf429b58ab93d294d3fe264
```

Do not copy `win-unpacked`, `builder-debug.yml`, or other build intermediates into `$dist`.

---

## Signed Release (Future)

After signing:

1. Replace installer with signed `Levi-0.1.0-win-x64.exe`
2. Recompute SHA-256 and update `SHA256SUMS.txt`
3. Verify: `Get-AuthenticodeSignature .\Levi-0.1.0-win-x64.exe | Format-List` → `Status: Valid`

See `SIGNING_READY.md`.
