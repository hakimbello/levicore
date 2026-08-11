# LeviCore Public Repository Security and Exposure Audit

Milestone: P2-018-15
Audit date: 2026-08-11
Scope: Remote history replacement, fresh private GitHub clone qualification, reachable-history privacy verification, and return-to-public readiness
Repository: `https://github.com/hakimbello/levicore`
Repository visibility during this audit: private
Default branch: `main`
Current remote `main`: `a47cb4d1ad1f1dffc937ed808e3a31ae7c4f51e7`
Decision: safe to return repository visibility to public after owner confirms branch protection is restored

This audit did not make the repository public, did not configure SignPath, did not publish a release, did not install Levi, did not use plain `--force`, and did not change product features.

## Executive Summary

P2-018-15 replaced every affected public GitHub branch and tag that still reached the old exposed history. Each rewritten ref was synchronized with an explicit `--force-with-lease=<remote-ref>:<live-current-remote-sha>` lease value obtained from a fresh `git ls-remote --heads --tags origin` immediately before pushing.

A fresh clone directly from GitHub, without cloning from the local working repository, now checks out `main` at `a47cb4d1ad1f1dffc937ed808e3a31ae7c4f51e7`. That clone passes install, typecheck, desktop tests, desktop build, root tests, privacy scans, generated-artifact scans, and `git fsck --full`.

The previous reachable-history private path exposure is no longer reachable from any current remote head or tag fetched into the fresh GitHub clone.

## Remote History Replacement

Status: PASS.

Branches rewritten:

- `main`: `a47cb4d1ad1f1dffc937ed808e3a31ae7c4f51e7`.
- `desktop-v1`: `af0ec1f4912510a0370a5ac011b42236afabc937`.
- `dependabot/npm_and_yarn/packages/levi-desktop/electron-39.8.10`: `90c72a7ab9f7239f31195c568105d60cc3bebf03`.
- `fix/desktop-search-stabilization`: `0d29cf5afd9234da870e1d60210c24441f1e1721`.
- `integrate-desktop-v1-clean`: `8e677e3e531380e8cae2ea654fc56bc5b9bf39f3`.
- `v1-final-backup`: `ef34321ad0789d3d2c7e31b09004d4fe96091053`.

Tags rewritten:

- `v0.7.0-ux`: `234badfb127a8b26832c388a051558ad23ea3a60`.
- `v1.0.0`: tag object `a6ae6d282c23c51243e8dfb1e7cd59df2506d148`, peeled commit `ef34321ad0789d3d2c7e31b09004d4fe96091053`.
- `v1.0.0-beta.1`: tag object `982c4cdc193475db94f28f2cb09621255046ee58`, peeled commit `ef34321ad0789d3d2c7e31b09004d4fe96091053`.

Affected remote refs were identified by cloning the private GitHub repository as a mirror and checking every remote head and tag for reachability to the old exposed commit. Nine affected refs were found and rewritten. The fresh GitHub clone recheck found zero refs still reaching the old exposed commit.

GitHub reported existing Dependabot vulnerability warnings during push. Those warnings do not indicate exposed private history, but they should remain tracked through the repository security process.

## Final Remote Refs

Status: PASS.

Live `git ls-remote --heads --tags origin` after synchronization:

| Ref | SHA |
| --- | --- |
| `refs/heads/dependabot/npm_and_yarn/packages/levi-desktop/electron-39.8.10` | `90c72a7ab9f7239f31195c568105d60cc3bebf03` |
| `refs/heads/desktop-v1` | `af0ec1f4912510a0370a5ac011b42236afabc937` |
| `refs/heads/fix/desktop-search-stabilization` | `0d29cf5afd9234da870e1d60210c24441f1e1721` |
| `refs/heads/integrate-desktop-v1-clean` | `8e677e3e531380e8cae2ea654fc56bc5b9bf39f3` |
| `refs/heads/main` | `a47cb4d1ad1f1dffc937ed808e3a31ae7c4f51e7` |
| `refs/heads/v1-final-backup` | `ef34321ad0789d3d2c7e31b09004d4fe96091053` |
| `refs/tags/v0.7.0-ux` | `234badfb127a8b26832c388a051558ad23ea3a60` |
| `refs/tags/v1.0.0` | `a6ae6d282c23c51243e8dfb1e7cd59df2506d148` |
| `refs/tags/v1.0.0^{}` | `ef34321ad0789d3d2c7e31b09004d4fe96091053` |
| `refs/tags/v1.0.0-beta.1` | `982c4cdc193475db94f28f2cb09621255046ee58` |
| `refs/tags/v1.0.0-beta.1^{}` | `ef34321ad0789d3d2c7e31b09004d4fe96091053` |

## Fresh GitHub Clone Verification

Status: PASS.

Fresh clone source: `https://github.com/hakimbello/levicore.git`.

Fresh clone result:

- Checked out `main`.
- `HEAD`: `a47cb4d1ad1f1dffc937ed808e3a31ae7c4f51e7`.
- `npm ci`: PASS.
- `npm.cmd --prefix packages/levi-desktop run typecheck`: PASS.
- `npm.cmd --prefix packages/levi-desktop test`: PASS, 27 test files passed, 254 tests passed, 2 skipped.
- `npm.cmd --prefix packages/levi-desktop run build`: PASS.
- `npm.cmd test`: PASS, 263 tests passed.

The first desktop build attempt inside the sandbox failed because Vite/esbuild could not read parent path metadata under the temporary clone directory. The same fresh-clone build passed when rerun with normal filesystem access. This is recorded as an environment limitation, not a repository build failure.

## Privacy And Artifact Verification

Status: PASS.

Fresh GitHub clone scan results:

| Check | Result |
| --- | --- |
| Current-tree private path hits | 0 |
| Reachable-history private path hits | 0 |
| Current-tree high-confidence secret hits | 0 |
| Reachable-history high-confidence secret hits | 0 |
| Historical generated screenshot hits | 0 |
| Tracked generated artifacts | 0 |
| Current refs reaching old exposed commit | 0 |
| `git fsck --full` | clean |

The high-confidence secret scan checked for private key material and common provider token formats without printing candidate secret values. Fixture and policy-document examples were excluded from high-confidence secret counts.

## Branch Protection Restoration

Status: MANUAL CONFIRMATION.

No branch-protection setting was changed by this audit. The `main` history replacement succeeded with `--force-with-lease`; because this environment does not have the GitHub CLI installed and the available GitHub connector does not expose branch-protection details, the owner should manually confirm that branch protection is restored before changing visibility back to public.

Required restored state:

- Pull requests required before merging.
- At least 1 approval required.
- Required status check: `Build unsigned Windows release`.
- Conversation resolution required.
- Administrator bypass disabled or limited to the smallest practical owner-only exception.
- Force pushes disabled.
- Branch deletions disabled.

## Public Documentation

Status: PASS.

The fresh GitHub clone contains the required public-facing documentation and project files on `main`:

- `README.md`.
- `LICENSE`.
- `SECURITY.md`.
- `.github/CODEOWNERS`.
- `.github/workflows/levi-desktop-release.yml`.
- `package-lock.json`.
- `packages/levi-desktop/PRIVACY.md`.
- `packages/levi-desktop/CODE_SIGNING_POLICY.md`.
- `packages/levi-desktop/FIRST_RUN.md`.
- `packages/levi-desktop/RELEASE_DOWNLOAD.md`.
- `packages/levi-desktop/SIGNPATH_ELIGIBILITY.md`.
- `packages/levi-desktop/PUBLIC_REPO_SECURITY_AUDIT.md`.

No checked document claims SignPath approval.

## Exact Next Action

Keep the repository private until the owner manually confirms branch protection/ruleset settings for `main` are restored, especially blocked force pushes and blocked branch deletion. After that confirmation, the owner can return the repository visibility to public. Do not configure SignPath or publish a release until the repository is public and the unsigned beta release step is intentionally scheduled.

SAFE TO RETURN REPOSITORY TO PUBLIC
