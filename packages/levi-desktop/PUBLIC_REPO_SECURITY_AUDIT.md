# LeviCore Pre-Public Repository Security and Exposure Audit

Milestone: P2-018-07
Audit date: 2026-08-10
Scope: Fresh GitHub clone from `https://github.com/hakimbello/levicore.git`, synchronized remote refs, GitHub settings, release workflow, public documentation, and final public-visibility readiness
Decision: Do not make the GitHub repository public yet

This audit does not make the repository public, does not configure SignPath, does not force-push, does not publish binaries, and does not add product features.

## Executive Summary

The synchronized private GitHub repository no longer exposes the previously identified private local path metadata or generated live-test screenshots in reachable history. A fresh clone directly from GitHub was created and remote refs were verified against the expected rewritten SHAs.

However, P2-018-07 is blocked because a plain GitHub clone checks out the repository default branch, `main`, at `07af8874f6fcb4268ac38ceb986299db2c84d35b`. That default branch does not contain `package-lock.json`, the Levi Desktop package surface, the Levi Desktop release workflow, or the public release/security/privacy documentation required for public visibility. The required `npm ci` command failed immediately on the fresh GitHub clone because no lockfile exists on the checked-out default branch.

The release-ready branch appears to be `desktop-v1` at `718db2c388426d60388377eda1aebf082bc38fb7`; it contains the expected lockfile, workflow, CODEOWNERS, license, security docs, privacy docs, code-signing policy, first-run docs, unsigned beta docs, and SignPath eligibility audit. GitHub public visibility should wait until the default public surface is corrected, either by changing the default branch to `desktop-v1` or updating `main` to the public-ready state, then re-running this GitHub-origin gate.

NOT READY FOR PUBLIC GITHUB VISIBILITY

## Fresh GitHub Clone Evidence

Status: FAIL for the mandatory build/test gate.

Fresh clone:

- Source: `https://github.com/hakimbello/levicore.git`.
- Clone type: direct GitHub clone, not local clone.
- Checked-out default branch: `main`.
- Checked-out HEAD: `07af8874f6fcb4268ac38ceb986299db2c84d35b`.
- Fresh clone status: clean.

Required command results:

- `npm ci`: FAIL. npm reported that `npm ci` requires an existing `package-lock.json` or `npm-shrinkwrap.json`; the default `main` checkout has no `package-lock.json`.
- `npm.cmd --prefix packages/levi-desktop run typecheck`: NOT RUN because dependency installation failed.
- `npm.cmd --prefix packages/levi-desktop test`: NOT RUN because dependency installation failed.
- `npm.cmd --prefix packages/levi-desktop run build`: NOT RUN because dependency installation failed.
- `npm.cmd test`: NOT RUN because dependency installation failed.

Default-branch public-surface findings:

- `README.md`: present.
- `LICENSE`: missing on default `main`.
- `SECURITY.md`: missing on default `main`.
- `.github/workflows/levi-desktop-release.yml`: missing on default `main`.
- `packages/levi-desktop/PRIVACY.md`: missing on default `main`.
- `packages/levi-desktop/CODE_SIGNING_POLICY.md`: missing on default `main`.
- `packages/levi-desktop/FIRST_RUN.md`: missing on default `main`.
- `packages/levi-desktop/RELEASE_DOWNLOAD.md`: missing on default `main`.
- `packages/levi-desktop/SIGNPATH_ELIGIBILITY.md`: missing on default `main`.

## Remote Ref Verification

Status: PASS.

Read-only `git ls-remote --heads --tags origin` from the GitHub clone confirmed the expected synchronized refs:

| Ref | Expected SHA | Observed SHA | Result |
|---|---|---|---|
| `refs/heads/desktop-v1` | `718db2c388426d60388377eda1aebf082bc38fb7` | `718db2c388426d60388377eda1aebf082bc38fb7` | PASS |
| `refs/heads/main` | `07af8874f6fcb4268ac38ceb986299db2c84d35b` | `07af8874f6fcb4268ac38ceb986299db2c84d35b` | PASS |
| `refs/heads/integrate-desktop-v1-clean` | `fa4eb1c90616afee8207f8859607a82b347a350f` | `fa4eb1c90616afee8207f8859607a82b347a350f` | PASS |
| `refs/heads/v1-final-backup` | `a78a3d9f2ec066baa41b99f29a3028e3cf8c1e6b` | `a78a3d9f2ec066baa41b99f29a3028e3cf8c1e6b` | PASS |
| `refs/heads/fix/desktop-search-stabilization` | `a790c8932fe075a05a0f66daf90f994966d2f034` | `a790c8932fe075a05a0f66daf90f994966d2f034` | PASS |
| `refs/tags/v0.7.0-ux` | `07af8874f6fcb4268ac38ceb986299db2c84d35b` | `07af8874f6fcb4268ac38ceb986299db2c84d35b` | PASS |
| `refs/tags/v1.0.0` | `5d90295dfc3e6be58831e83c456fa63ea4a4d955` | `5d90295dfc3e6be58831e83c456fa63ea4a4d955` | PASS |
| `refs/tags/v1.0.0-beta.1` | `72ad2c0e3209b6bf82dedb09e167d3365b8ba618` | `72ad2c0e3209b6bf82dedb09e167d3365b8ba618` | PASS |

Annotated tag peeled commits:

- `v1.0.0^{}` resolves to `a78a3d9f2ec066baa41b99f29a3028e3cf8c1e6b`.
- `v1.0.0-beta.1^{}` resolves to `a78a3d9f2ec066baa41b99f29a3028e3cf8c1e6b`.

## Remote Privacy And Secret Scan

Status: PASS.

Using the fresh GitHub clone across reachable refs:

- Current-tree high-confidence secret hits: 0 for private keys, certificates, GitHub tokens, npm tokens, AWS keys, Google API keys, OpenAI-style live keys, Slack tokens, Stripe keys, and long hardcoded authorization headers.
- Reachable-history high-confidence secret hits: 0 for all checked patterns.
- Current private username/path hits: 0.
- Reachable-history private username/path hits: 0.
- Historical generated screenshot hits under `packages/levi-desktop/test-artifacts/live-002b/`: 0.
- Tracked generated artifact hits: 0 for dependency folders, desktop build output, release output, coverage, test artifacts, VSIX files, installers, MSI files, and NuGet packages.
- `git fsck --full`: PASS with no output.

## GitHub Repository Settings Matrix

| Setting | Classification | Evidence |
|---|---|---|
| Repository visibility | PASS | GitHub connector reports `visibility: private`; this is correct before the manual visibility change. |
| Repository permissions for auditor | PASS | GitHub connector reports admin/maintain/push/pull permissions for the authenticated connection. |
| Default branch | MANUAL REQUIRED | GitHub connector reports default branch `main`; default `main` fails the required public gate and lacks desktop release docs/workflow. |
| MFA status for maintainer | MANUAL REQUIRED | Account-level MFA is not queryable through available tools. |
| Branch protection/rulesets | MANUAL REQUIRED | Direct REST settings endpoints were not queryable without separate API auth; must be confirmed in GitHub UI/API. |
| CODEOWNERS presence | PASS | `.github/CODEOWNERS` exists on `desktop-v1`; missing from default `main`. Public-ready default surface must include it. |
| GitHub Actions permissions | MANUAL REQUIRED | Actions permissions endpoint was not queryable through available tools. |
| Workflow write permissions | MANUAL REQUIRED | Must confirm Actions default token permissions and workflow write restrictions in GitHub settings. |
| Secret scanning availability | MANUAL REQUIRED | Not queryable through available tools for this private repo. |
| Dependabot alerts | MANUAL REQUIRED | Vulnerability alerts endpoint required additional auth; confirm in GitHub settings. |
| Dependency graph | MANUAL REQUIRED | Confirm in GitHub settings. |
| Private vulnerability reporting | MANUAL REQUIRED | Not queryable through available tools; confirm after or before visibility change. |
| Issues enabled | MANUAL REQUIRED | Not exposed by available connector response; confirm in GitHub settings. |
| Discussions status | MANUAL REQUIRED | Not exposed by available connector response; confirm in GitHub settings. |
| Release permissions | MANUAL REQUIRED | Confirm who can create releases and protected tags in GitHub settings/rulesets. |

## Release Workflow Audit

Status: PASS on `desktop-v1`; FAIL for default public surface because the workflow is absent from `main`.

Workflow inspected: `origin/desktop-v1:.github/workflows/levi-desktop-release.yml`.

Findings:

- GitHub-hosted Windows runner: PASS, uses `windows-latest`.
- Exact source checkout: PASS, `actions/checkout@v6` with `ref: ${{ github.sha }}`, `fetch-depth: 0`, and `persist-credentials: false`.
- Deterministic dependency install: PASS, uses `npm ci` with `package-lock.json`.
- Typecheck: PASS, runs `npm.cmd --prefix packages/levi-desktop run typecheck`.
- Tests: PASS, runs desktop tests and root runtime tests.
- Production build: PASS, runs `npm.cmd --prefix packages/levi-desktop run build`.
- Package: PASS, packages an unsigned Windows NSIS installer with `electron-builder --publish never`.
- SHA-256 generation: PASS, uses `Get-FileHash -Algorithm SHA256` and writes `SHA256SUMS.txt`.
- Artifact metadata: PASS, writes `BUILD_METADATA.json` with source commit, ref, workflow run, artifact, version, SHA-256, and signing status.
- Artifact upload: PASS, uses `actions/upload-artifact@v7` with `if-no-files-found: error`.
- No signing credentials: PASS, workflow contains no signing secrets, certificates, `CSC_`, or `WIN_CSC` references.
- No secret echoing: PASS, no secret-printing path was found.
- No dangerous `pull_request_target`: PASS, workflow triggers only `workflow_dispatch` and `v*` tag pushes.
- Restricted `GITHUB_TOKEN` permissions: PASS, top-level permissions are `contents: read` and `actions: read`.

## Public Repository Documentation Audit

Status: PASS on `desktop-v1`; FAIL for default public surface because required files are missing from `main`.

Required public-facing files on `desktop-v1`:

- `README.md`: PASS.
- `LICENSE`: PASS.
- `SECURITY.md`: PASS.
- `packages/levi-desktop/PRIVACY.md`: PASS.
- `packages/levi-desktop/CODE_SIGNING_POLICY.md`: PASS.
- `packages/levi-desktop/FIRST_RUN.md`: PASS.
- `packages/levi-desktop/RELEASE_DOWNLOAD.md`: PASS.
- `packages/levi-desktop/SIGNPATH_ELIGIBILITY.md`: PASS.

SignPath wording:

- PASS. Documents state that Levi has not been accepted by SignPath Foundation and is not currently signed by SignPath Foundation.
- PASS. No inspected document incorrectly claims SignPath approval.

## Remaining Blockers

Hard blockers:

1. Default branch `main` is not public-ready and fails the mandatory fresh GitHub clone gate.
2. A plain GitHub clone from the repository does not contain `package-lock.json`, so `npm ci` fails.
3. Required public documentation and release workflow are absent from the default branch.

Manual blockers:

1. Change the default public surface by either setting GitHub default branch to `desktop-v1` or updating `main` to the public-ready `desktop-v1` state.
2. Confirm maintainer MFA.
3. Confirm branch protection or rulesets.
4. Confirm GitHub Actions token permissions and workflow write restrictions.
5. Enable or confirm secret scanning and push protection where available.
6. Enable or confirm Dependabot alerts and dependency graph.
7. Enable or confirm private vulnerability reporting.
8. Confirm Issues and Discussions settings.
9. Confirm release/tag creation permissions.
10. Confirm Levi icon asset provenance.

## Exact Visibility-Change Checklist

Do not make the repository public until every item below is complete:

1. Keep repository private.
2. Choose the public default branch strategy:
   - Preferred: change default branch to `desktop-v1`, or
   - merge/update `main` so it matches the public-ready desktop release surface.
3. From a brand-new GitHub clone of the chosen default branch, run `npm ci`.
4. Run `npm.cmd --prefix packages/levi-desktop run typecheck`.
5. Run `npm.cmd --prefix packages/levi-desktop test`.
6. Run `npm.cmd --prefix packages/levi-desktop run build`.
7. Run `npm.cmd test`.
8. Re-run current-tree and reachable-history high-confidence secret scans.
9. Re-run private username/path scans.
10. Re-run historical generated screenshot scan.
11. Re-run tracked generated artifact scan.
12. Run `git fsck --full`.
13. Confirm GitHub default branch points at the branch that passed the gate.
14. Confirm branch protection/rulesets and CODEOWNERS review for release-critical files.
15. Confirm MFA for maintainers.
16. Confirm Actions permissions are least-privilege and workflow write access is restricted.
17. Confirm secret scanning, push protection, Dependabot alerts, dependency graph, and private vulnerability reporting.
18. Confirm Issues/Discussions/release permissions.
19. Confirm documentation still states Levi is unsigned and not approved by SignPath Foundation.
20. Only after all checks pass, manually change repository visibility in GitHub.

## Exact Next Action

Keep GitHub private. Correct the default branch/public surface first, then re-run P2-018-07 from a brand-new GitHub clone before changing visibility.

NOT SAFE TO MAKE REPOSITORY PUBLIC
