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

Public visibility remains blocked until the fast-forwarded `main` is pushed to GitHub, a brand-new default-branch GitHub clone fully passes install/typecheck/tests/build/scans, and manual GitHub security settings are confirmed.

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

- Intended GitHub `HEAD`: `refs/heads/main`.
- Intended GitHub `main`: the final P2-018-08 public-ready `desktop-v1` commit.

## Required Default-Branch Content

Status before alignment: FAIL on GitHub default `main`; PASS on `desktop-v1`.

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

`desktop-v1` contains the required public-ready state. P2-018-08 will fast-forward `main` to that state.

## Package Lock

Status: PASS on `desktop-v1`.

- `package-lock.json` is present on `desktop-v1`.
- The lockfile is treated as authoritative for the current dependency graph.
- Do not generate or replace the lockfile unnecessarily.
- `npm ci` must pass on the proposed default-branch state before and after GitHub alignment.

## Local Verification Gate

Status: REQUIRED before push.

Commands to run on the proposed default-branch state:

- `npm ci`.
- `npm.cmd --prefix packages/levi-desktop run typecheck`.
- `npm.cmd --prefix packages/levi-desktop test`.
- `npm.cmd --prefix packages/levi-desktop run build`.
- `npm.cmd test`.

All must pass before public visibility.

## Security Recheck

Status: REQUIRED before and after GitHub default-clone verification.

Required results:

- Private username/path hits: 0.
- High-confidence secret hits: 0.
- Historical generated screenshot hits: 0.
- Tracked generated artifact hits: 0.
- `git fsck --full`: clean.

## GitHub Alignment Plan

Required push behavior:

- Fetch current GitHub refs before pushing.
- Push `desktop-v1` if it has new local audit commits not yet on GitHub.
- Fast-forward `main` to the final public-ready `desktop-v1` commit.
- Use `--force-with-lease` only if GitHub rejects the fast-forward because the remote changed unexpectedly.
- Do not use plain `--force`.
- Do not change repository visibility.

## GitHub Default-Clone Gate

Status: REQUIRED after push.

After branch alignment:

1. Create a brand-new clone directly from `https://github.com/hakimbello/levicore.git` without specifying a branch.
2. Verify it checks out `main` at the intended public-ready commit.
3. Run `npm ci`.
4. Run `npm.cmd --prefix packages/levi-desktop run typecheck`.
5. Run `npm.cmd --prefix packages/levi-desktop test`.
6. Run `npm.cmd --prefix packages/levi-desktop run build`.
7. Run `npm.cmd test`.
8. Re-run privacy, secret, generated screenshot, tracked artifact, and `git fsck --full` checks.
9. Confirm required public-facing documentation exists.

## GitHub Repository Settings Matrix

| Setting | Classification | Evidence |
|---|---|---|
| Repository visibility | PASS | GitHub connector reported `visibility: private`; this is correct before manual visibility change. |
| Default branch | CHANGE REQUIRED | GitHub default branch is `main`; P2-018-08 will align `main` to the public-ready desktop state. |
| MFA status for maintainer | MANUAL REQUIRED | Account-level MFA is not queryable through available tools. |
| Branch protection/rulesets | MANUAL REQUIRED | Must be confirmed in GitHub settings. |
| CODEOWNERS presence | PASS AFTER ALIGNMENT | `.github/CODEOWNERS` is present on `desktop-v1` and must be present after `main` alignment. |
| GitHub Actions permissions | MANUAL REQUIRED | Must confirm Actions default token permissions in GitHub settings. |
| Workflow write permissions | MANUAL REQUIRED | Must confirm workflow write restrictions in GitHub settings. |
| Secret scanning availability | MANUAL REQUIRED | Must confirm in GitHub settings. |
| Dependabot alerts | MANUAL REQUIRED | Must confirm in GitHub settings. |
| Dependency graph | MANUAL REQUIRED | Must confirm in GitHub settings. |
| Private vulnerability reporting | MANUAL REQUIRED | Must confirm in GitHub settings. |
| Issues enabled | MANUAL REQUIRED | Must confirm in GitHub settings. |
| Discussions status | MANUAL REQUIRED | Must confirm in GitHub settings. |
| Release permissions | MANUAL REQUIRED | Must confirm release/tag creation permissions in GitHub settings or rulesets. |

## Release Workflow Audit

Status: PASS on `desktop-v1`; PASS REQUIRED after `main` alignment.

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

Status: PASS on `desktop-v1`; PASS REQUIRED after `main` alignment.

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

Keep GitHub private. Finish the local verification gate, push the clean fast-forward alignment so GitHub `main` contains the public-ready Levi Desktop V1 state, create a brand-new default-branch GitHub clone, re-run the full gate, update this audit with final evidence, and only then consider the manual visibility change.

NOT SAFE TO MAKE REPOSITORY PUBLIC
