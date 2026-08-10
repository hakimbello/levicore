# LeviCore Pre-Public Repository Security and Exposure Audit

Milestone: P2-018-08
Audit date: 2026-08-10
Scope: Default-branch public-ready alignment, GitHub default clone qualification, security scans, public documentation, and final public-visibility readiness
Decision: Do not make the GitHub repository public yet

This audit does not make the repository public, does not configure SignPath, does not add product features, and does not weaken tests.

## Executive Summary

P2-018-07 verified that the synchronized GitHub refs no longer exposed the previously identified private local path metadata or generated live-test screenshots. It also found the final public gate blocker: GitHub's default branch was `main`, and a fresh GitHub clone of `main` did not contain the public-ready Levi Desktop V1 state, `package-lock.json`, release workflow, or required public documentation.

P2-018-08 chooses branch strategy A: update `main` to the current public-ready `desktop-v1` state. This is the safest option because local `main` is an ancestor of `desktop-v1`, so the alignment can be a clean fast-forward rather than a merge of stale code or a force rewrite. It also keeps GitHub's existing default branch name, avoiding a default-branch settings change.

The intended default branch state must contain the authoritative package lock, MIT license, CODEOWNERS, Levi Desktop release workflow, security policy, privacy policy, code-signing policy, first-run docs, unsigned beta release docs, SignPath eligibility audit, this public-repository audit, and complete Levi Desktop V1 source.

P2-018-08 aligned GitHub `main` to the public-ready `desktop-v1` state by fast-forward push. A brand-new GitHub clone without a branch override checked out `main` at `d8fec2ba0f544bda7387f15b366bc9276925d021` and passed install, desktop typecheck, desktop tests, desktop build, root tests, privacy/history scans, generated artifact scans, and `git fsck --full`.

Public visibility remains blocked only by manual GitHub/account settings that cannot be fully confirmed from this environment, including maintainer MFA, branch protection/rulesets, repository security toggles, and release permissions.

NOT READY FOR PUBLIC GITHUB VISIBILITY

## Branch Strategy

Chosen strategy: A. Update `main` to the current public-ready `desktop-v1` state.

Reasoning:

- `git merge-base main desktop-v1` equals current local `main` at `07af8874f6fcb4268ac38ceb986299db2c84d35b`.
- `desktop-v1` is a descendant of `main`; no unrelated stale `main` content needs to be merged into `desktop-v1`.
- Updating `main` to the `desktop-v1` tip is a fast-forward branch movement.
- This preserves clean sanitized history and avoids a separate GitHub default-branch settings change.
- This avoids reintroducing removed screenshots or private path metadata.

Default branch before:

- GitHub `HEAD`: `refs/heads/main`.
- GitHub `main`: `07af8874f6fcb4268ac38ceb986299db2c84d35b`.

Default branch after alignment:

- GitHub `HEAD`: `refs/heads/main`.
- GitHub `main`: `d8fec2ba0f544bda7387f15b366bc9276925d021`.
- GitHub `desktop-v1`: `d8fec2ba0f544bda7387f15b366bc9276925d021`.

## Required Default-Branch Content

Status before alignment: FAIL on GitHub default `main`; PASS on `desktop-v1`.

Status after alignment: PASS on GitHub default `main` at `d8fec2ba0f544bda7387f15b366bc9276925d021`.

Required files and content on the eventual default branch:

- `package-lock.json`.
- Root `LICENSE`.
- `.github/CODEOWNERS`.
- `.github/workflows/levi-desktop-release.yml`.
- `SECURITY.md`.
- `packages/levi-desktop/PRIVACY.md`.
- `packages/levi-desktop/CODE_SIGNING_POLICY.md`.
- `packages/levi-desktop/FIRST_RUN.md`.
- `packages/levi-desktop/RELEASE_DOWNLOAD.md`.
- `packages/levi-desktop/SIGNPATH_ELIGIBILITY.md`.
- `packages/levi-desktop/PUBLIC_REPO_SECURITY_AUDIT.md`.
- Complete Levi Desktop V1 source.

Fresh GitHub default clone confirmed every required file listed above is present on `main`.

## Package Lock

Status: PASS.

- `package-lock.json` is present on the GitHub default branch.
- The lockfile is treated as authoritative for the current dependency graph.
- `npm ci` passed locally and in a fresh GitHub default clone.
- `package-lock.json` had no diff after `npm ci` and build verification in the fresh clone.

## Local Verification Gate

Status: PASS.

Commands to run on the proposed default-branch state:

- `npm ci`: PASS.
- `npm.cmd --prefix packages/levi-desktop run typecheck`: PASS.
- `npm.cmd --prefix packages/levi-desktop test`: PASS on rerun, 27 files passed, 254 tests passed, 2 skipped. The earlier single `test/home.test.tsx` failure did not reproduce; the focused `test/home.test.tsx` rerun passed 13/13 first.
- `npm.cmd --prefix packages/levi-desktop run build`: PASS.
- `npm.cmd test`: PASS, 263 tests passed.

Build emitted the existing Monaco chunk-size warning only.

## Security Recheck

Status: PASS locally and in fresh GitHub default clone.

Required results:

- Private identity/path hits: 0 current, 0 reachable history.
- High-confidence secret hits: 0 current, 0 reachable history.
- Historical generated screenshot hits: 0.
- Tracked generated artifact hits: 0.
- `git fsck --full`: clean.

Note: the broad `C:\Users\...` scan still finds synthetic security-fixture paths such as `C:/Users/user/.ssh/id_rsa`; these are test payloads, not private maintainer identity or workstation paths.

## GitHub Alignment Plan

Completed push behavior:

- Fetched current GitHub refs immediately before pushing.
- Pushed `desktop-v1` fast-forward: `718db2c388426d60388377eda1aebf082bc38fb7` -> `d8fec2ba0f544bda7387f15b366bc9276925d021`.
- Pushed `main` fast-forward: `07af8874f6fcb4268ac38ceb986299db2c84d35b` -> `d8fec2ba0f544bda7387f15b366bc9276925d021`.
- No force push was required.
- Repository visibility was not changed.

## GitHub Default-Clone Gate

Status: PASS.

After branch alignment:

1. Created a brand-new clone directly from `https://github.com/hakimbello/levicore.git` without specifying a branch.
2. Verified checkout: `main` at `d8fec2ba0f544bda7387f15b366bc9276925d021`.
3. `npm ci`: PASS.
4. `npm.cmd --prefix packages/levi-desktop run typecheck`: PASS.
5. `npm.cmd --prefix packages/levi-desktop test`: PASS, 27 files passed, 254 tests passed, 2 skipped.
6. `npm.cmd --prefix packages/levi-desktop run build`: PASS.
7. `npm.cmd test`: PASS, 263 tests passed.
8. Privacy, secret, generated screenshot, tracked artifact, and `git fsck --full` checks: PASS.
9. Required public-facing documentation: PASS.

This audit document was updated after the fresh-clone run to record evidence. The update is documentation-only and does not modify application code, build logic, dependencies, tests, or Version 1 features.

## GitHub Repository Settings Matrix

| Setting | Classification | Evidence |
|---|---|---|
| Repository visibility | PASS | Repository remained private throughout this gate. |
| Default branch | PASS | GitHub `HEAD` resolves to `refs/heads/main`; `main` resolves to the public-ready desktop state. |
| MFA status for maintainer | MANUAL REQUIRED | Account-level MFA is not queryable through available tools. |
| Branch protection/rulesets | MANUAL REQUIRED | Must be confirmed in GitHub settings. |
| CODEOWNERS presence | PASS | `.github/CODEOWNERS` is present on GitHub default `main`. |
| GitHub Actions permissions | MANUAL REQUIRED | Must confirm Actions default token permissions in GitHub settings; `gh` CLI was not available in this environment. |
| Workflow write permissions | MANUAL REQUIRED | Must confirm workflow write restrictions in GitHub settings. |
| Secret scanning availability | MANUAL REQUIRED | Must confirm in GitHub settings. |
| Dependabot alerts | MANUAL REQUIRED | Must confirm in GitHub settings. |
| Dependency graph | MANUAL REQUIRED | Must confirm in GitHub settings. |
| Private vulnerability reporting | MANUAL REQUIRED | Must confirm in GitHub settings. |
| Issues enabled | MANUAL REQUIRED | Must confirm in GitHub settings. |
| Discussions status | MANUAL REQUIRED | Must confirm in GitHub settings. |
| Release permissions | MANUAL REQUIRED | Must confirm release/tag creation permissions in GitHub settings or rulesets. |

## Release Workflow Audit

Status: PASS on GitHub default `main`.

Workflow: `.github/workflows/levi-desktop-release.yml`.

Required properties:

- GitHub-hosted Windows runner: `windows-latest`.
- Exact source checkout: `actions/checkout@v6` with `ref: ${{ github.sha }}`, `fetch-depth: 0`, and `persist-credentials: false`.
- Deterministic dependency install: `npm ci`.
- Desktop typecheck.
- Desktop tests.
- Root tests.
- Production build.
- Unsigned Windows installer package.
- SHA-256 generation.
- `BUILD_METADATA.json` generation.
- Artifact upload.
- No signing credentials.
- No secret echoing path.
- No `pull_request_target`.
- Restricted top-level `GITHUB_TOKEN` permissions: `contents: read`, `actions: read`.

## Public Documentation Audit

Status: PASS on GitHub default `main`.

Required public-facing files:

- `README.md`.
- `LICENSE`.
- `SECURITY.md`.
- `packages/levi-desktop/PRIVACY.md`.
- `packages/levi-desktop/CODE_SIGNING_POLICY.md`.
- `packages/levi-desktop/FIRST_RUN.md`.
- `packages/levi-desktop/RELEASE_DOWNLOAD.md`.
- `packages/levi-desktop/SIGNPATH_ELIGIBILITY.md`.

SignPath wording requirement:

- Documentation must not claim SignPath approval.
- Documentation must continue to state that Levi has not been accepted by SignPath Foundation and is not currently signed by SignPath Foundation.

## Remaining Manual GitHub Settings

Before public visibility:

1. Confirm maintainer MFA.
2. Configure or confirm branch protection/rulesets.
3. Confirm CODEOWNERS review for release-critical files where appropriate.
4. Confirm GitHub Actions default token permissions are least-privilege.
5. Restrict workflow write permissions.
6. Enable or confirm secret scanning and push protection where available.
7. Enable or confirm Dependabot alerts and dependency graph.
8. Enable or confirm private vulnerability reporting.
9. Confirm Issues and Discussions settings.
10. Confirm release and protected tag creation permissions.
11. Confirm Levi icon asset provenance.

## Exact Next Action

Keep GitHub private. Manually confirm the remaining GitHub/account security settings in the repository settings UI, especially maintainer MFA, branch protection/rulesets, Actions token/workflow permissions, secret scanning/push protection, Dependabot/dependency graph, private vulnerability reporting, Issues/Discussions status, release/tag permissions, and Levi icon provenance. Do not configure SignPath until after those confirmations and the public visibility change are complete.

NOT SAFE TO MAKE REPOSITORY PUBLIC
