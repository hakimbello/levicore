# LeviCore Pre-Public Repository Security and Exposure Audit

Milestone: P2-018-05
Audit date: 2026-08-10
Scope: Rewritten LeviCore repository, clean-clone hygiene fix, security scans, and final public-repository gate
Decision: Do not make the GitHub repository public yet

This audit assumes every committed file and every reachable Git object may become public. It does not make the GitHub repository public, force-push rewritten refs, publish binaries, configure SignPath, add product features, or change Version 1 behavior.

## Executive Summary

P2-018-05 resolves the clean-clone package-hygiene failure found in P2-018-04 without weakening repository hygiene rules. The root cause was not an ignore-rule defect: the test helper swallowed every `git check-ignore` failure as "not ignored." In the clean clone, Git returned a real repository-safety error for ownership mismatch, so ignored paths were reported as false while direct shell checks from the appropriate execution context still passed.

The fix keeps the existing assertions intact, switches the helper from shell-built `execSync` to argument-safe `execFileSync`, passes a repo-local `safe.directory` override for the inspected repository, and treats only Git's normal status `1` as "not ignored." Any other Git failure now fails loudly.

Local verification passed after the fix: focused hygiene test, full desktop test suite, desktop typecheck, desktop build, and root tests. Clean-clone qualification is required before public visibility and is recorded in this milestone's report.

The rewritten local repository is privacy-sanitized, but the GitHub repository must not be made public yet. A read-only `git ls-remote --heads --tags origin` on 2026-08-10 confirmed GitHub still points at the pre-rewrite SHAs. Any old remote ref or tag still reachable on GitHub would preserve the exposure.

NOT READY FOR PUBLIC GITHUB VISIBILITY

## Backup And Rewrite Record

Status: PASS for prior local backup, rewrite, and integrity.

Recorded pre-rewrite state:

- Current branch before P2-018-04 rewrite: `desktop-v1`.
- Original HEAD before rewrite: `a0c3469bd05fda660f36c02539d3b91b8982da6a`.
- Backup method: `git clone --mirror` from the local repository.
- Backup location: `C:\Users\<LOCAL_USERNAME>\.codex\visualizations\2026\08\09\019fe849-b9db-72c1-9fc8-efdfde9474a5\levicore-p2-018-04-backup.git`.
- Backup verification: branches and tags matched the pre-rewrite repository; backup `desktop-v1` matched original HEAD.
- Backup note: the backup intentionally contains old history and must remain private.

Rewrite:

- `git-filter-repo` was not available locally.
- Rewrite method: `git filter-branch` tree filter, scoped to replacing the redacted local username with generic `developer` fixture metadata and removing `packages/levi-desktop/test-artifacts/live-002b/`.
- Commits processed by rewrite: 233.
- Post-filter `desktop-v1` HEAD before audit commits: `b663148e80ed93c8e764fcc30a8deffe9dff0fd8`.
- Internal `refs/original/*` refs were deleted after rewrite, reflogs were expired, and garbage collection was run.

## P2-018-05 Hygiene Fix

Status: PASS.

Root cause:

- `packages/levi-desktop/test/package-hygiene.test.ts` used a shell-built `git check-ignore` command through `execSync`.
- The helper returned `false` for every caught error.
- In clean-clone verification under the escalated execution context, Git returned `fatal: detected dubious ownership`.
- The helper incorrectly converted that real Git failure into "not ignored," causing the two positive ignore assertions to fail.
- Repo-root resolution and fixture path construction were correct; the diagnosed failure was child-process Git safety handling plus overly broad error swallowing.

Fix:

- Use `execFileSync("git", [...])` instead of shell command construction.
- Preserve Windows-to-Git path normalization.
- Pass `-c safe.directory=<repoRoot>` for the inspected repository only.
- Preserve `cwd: repoRoot`.
- Return `false` only when Git exits with status `1`, the normal `check-ignore` result for an unignored path.
- Re-throw every other Git failure.

This keeps the hygiene rules strict and makes infrastructure failures visible.

## Post-Rewrite Privacy And Secret Scan

Status: PASS for rewritten reachable history.

Required privacy results:

- Redacted private username occurrence count: 0.
- Identified personal absolute path count: 0.
- Identified generated historical screenshot path count: 0.
- `packages/levi-desktop/test-artifacts/live-002b/` reachable history paths: 0.

High-confidence credential history scan:

- Private key blocks: 0.
- Certificate blocks: 0.
- GitHub tokens: 0.
- npm tokens: 0.
- AWS access keys: 0.
- Google API keys: 0.
- OpenAI-style live keys: 0.
- Slack tokens: 0.
- Stripe keys: 0.
- Long hardcoded authorization headers: 0.

Current-tree secret scan:

- Status: PASS.
- No high-confidence current-tree credentials, private keys, certificates, signing credentials, `.env` credentials, package tokens, cloud credentials, or hardcoded authentication headers were found.
- Synthetic credential-like test strings remain present where they intentionally exercise redaction behavior and are not live credentials.

Generated and tracked artifact scan:

- No tracked `node_modules`, desktop `dist`, `dist-electron`, `release`, `coverage`, `test-results`, `playwright-report`, installers, VSIX packages, logs, local databases, or generated screenshots are expected in the current source tree.
- `.gitignore` and package-level ignore checks cover the generated desktop paths and local env files.

## Repository Integrity And Structure

Status: PASS.

Integrity:

- Rewritten repository `git fsck --full`: PASS with no output in P2-018-04 final verification.
- P2-018-05 clean-clone `git fsck --full`: required to be clean.

Version 1 source structure confirmed present after rewrite:

- Desktop IDE: `packages/levi-desktop/src/app/App.tsx`.
- Runtime Manager: `packages/levi-desktop/electron/main/ai-runtime/runtime-manager.ts`.
- AI Chat: `packages/levi-desktop/electron/main/chat-service.ts`.
- Coding Agent: `packages/levi-desktop/electron/main/agent-service.ts`.
- Terminal: `packages/levi-desktop/electron/main/terminal-manager.ts`.
- Tasks: `packages/levi-desktop/electron/main/tasks/task-service.ts`.
- Git: `packages/levi-desktop/electron/main/git-service.ts`.
- Debugger: `packages/levi-desktop/electron/main/debug-service.ts`.
- Browser automation: `packages/levi-desktop/electron/main/browser-service.ts`.
- Release documentation: `packages/levi-desktop/RELEASE_DOWNLOAD.md`.
- SignPath preparation documentation: `packages/levi-desktop/SIGNPATH_ELIGIBILITY.md`.
- Public repository audit: `packages/levi-desktop/PUBLIC_REPO_SECURITY_AUDIT.md`.

## Re-Evaluated Public Repository Requirements

| Requirement | Classification | P2-018-05 result |
|---|---|---|
| Current-tree secrets absent | PASS | No high-confidence current-tree secrets found. |
| Rewritten reachable history excludes confirmed personal path metadata | PASS | Redacted local username/path hits are 0. |
| Rewritten reachable history excludes confirmed generated screenshots | PASS | `packages/levi-desktop/test-artifacts/live-002b/` history paths are 0. |
| High-confidence credential history scan | PASS | Private keys, certificates, package tokens, cloud keys, provider keys, Slack tokens, Stripe keys, and long auth headers all returned 0. |
| Repository integrity after rewrite | PASS | `git fsck --full` is required clean in the final clean clone. |
| Version 1 source preservation | PASS | Required Desktop IDE, runtime, chat, agent, terminal, tasks, Git, debugger, browser, release, and SignPath docs are present. |
| Focused package hygiene test | PASS | `npm.cmd --prefix packages/levi-desktop test -- test/package-hygiene.test.ts` passed locally after the fix. |
| Full desktop tests | PASS | `npm.cmd --prefix packages/levi-desktop test` passed locally after the fix. |
| Local full software verification | PASS | Typecheck, desktop tests, desktop build, and root tests passed locally after the fix. |
| Clean clone dependency install | PASS REQUIRED | Brand-new P2-018-05 clean clone must install from lockfile with `npm ci`. |
| Clean clone full verification | PASS REQUIRED | Brand-new P2-018-05 clean clone must pass typecheck, desktop tests, desktop build, and root tests. |
| Clean clone source/history scan | PASS REQUIRED | Brand-new P2-018-05 clean clone must have 0 private path hits, 0 generated screenshot history hits, 0 high-confidence secret hits, no tracked generated artifacts, and clean `git fsck`. |
| GitHub remote safety | CHANGE REQUIRED | Remote branches and tags still point to pre-rewrite SHAs and have not been force-with-lease synchronized. |
| GitHub security settings | MANUAL CONFIRMATION | MFA, secret scanning/push protection, Dependabot, private vulnerability reporting, branch protection, tag restrictions, and Actions settings require manual confirmation in GitHub. |
| Asset provenance | MANUAL CONFIRMATION | Confirm Levi icon assets are original project assets or otherwise redistributable. |

## Test And Build Verification

Rewritten working repository after P2-018-05 fix:

- `npm.cmd --prefix packages/levi-desktop test -- test/package-hygiene.test.ts`: PASS, 10 tests passed.
- `npm.cmd --prefix packages/levi-desktop test`: PASS, 27 files passed, 254 tests passed, 2 skipped. Expected stderr from the lazy-loading error-boundary test was observed.
- `npm.cmd --prefix packages/levi-desktop run typecheck`: PASS.
- `npm.cmd --prefix packages/levi-desktop run build`: PASS, with the existing Monaco chunk-size warning.
- `npm.cmd test`: PASS, 263 tests passed.

P2-018-05 clean clone:

- A brand-new clean clone from the final rewritten local repository is required before public visibility.
- Required commands: `npm ci`, desktop typecheck, desktop tests, desktop build, root tests, current-tree scan, reachable-history scan, private username/path scan, generated screenshot history scan, tracked artifact scan, and `git fsck --full`.
- Any failure keeps the final decision at NOT SAFE.

## Remote Safety And Synchronization Plan

Status: CHANGE REQUIRED. Do not make the GitHub repository public before completing and verifying this step.

Remote refs refreshed by read-only `git ls-remote --heads --tags origin` on 2026-08-10. The refreshed remote values still point at pre-rewrite history.

Remote branches requiring force-with-lease update:

- `desktop-v1`: current remote `6cc1b73e6cee214ed355cfc325b6a7b0a72d153f`, rewritten local `refs/heads/desktop-v1`.
- `main`: current remote `d3ffaed3fa0280dc12eacbd527cd496ef9d2998d`, rewritten local `07af8874f6fcb4268ac38ceb986299db2c84d35b`.
- `integrate-desktop-v1-clean`: current remote `2a483eb347cab07eb86c1f89754e335b5b62338f`, rewritten local `fa4eb1c90616afee8207f8859607a82b347a350f`.
- `v1-final-backup`: current remote `6cc1b73e6cee214ed355cfc325b6a7b0a72d153f`, rewritten local `a78a3d9f2ec066baa41b99f29a3028e3cf8c1e6b`.
- `fix/desktop-search-stabilization`: current remote `34b0745f85f3f2bc8446d5995a212259672cfa05`, rewritten local `a790c8932fe075a05a0f66daf90f994966d2f034`.

Tags requiring force-with-lease update:

- `v0.7.0-ux`: current remote `d3ffaed3fa0280dc12eacbd527cd496ef9d2998d`, rewritten local `07af8874f6fcb4268ac38ceb986299db2c84d35b`.
- `v1.0.0`: current remote tag object `f28f8bddf179cdf99d513a8adf1a21d97aed1e39`, rewritten local tag object `5d90295dfc3e6be58831e83c456fa63ea4a4d955`.
- `v1.0.0-beta.1`: current remote tag object `56cbf6c831d32761fb87e7eb98ae880ac66bea74`, rewritten local tag object `72ad2c0e3209b6bf82dedb09e167d3365b8ba618`.

Prepared commands, not executed:

```powershell
git ls-remote --heads --tags origin

git push --force-with-lease=refs/heads/desktop-v1:6cc1b73e6cee214ed355cfc325b6a7b0a72d153f origin refs/heads/desktop-v1:refs/heads/desktop-v1
git push --force-with-lease=refs/heads/main:d3ffaed3fa0280dc12eacbd527cd496ef9d2998d origin refs/heads/main:refs/heads/main
git push --force-with-lease=refs/heads/integrate-desktop-v1-clean:2a483eb347cab07eb86c1f89754e335b5b62338f origin refs/heads/integrate-desktop-v1-clean:refs/heads/integrate-desktop-v1-clean
git push --force-with-lease=refs/heads/v1-final-backup:6cc1b73e6cee214ed355cfc325b6a7b0a72d153f origin refs/heads/v1-final-backup:refs/heads/v1-final-backup
git push --force-with-lease=refs/heads/fix/desktop-search-stabilization:34b0745f85f3f2bc8446d5995a212259672cfa05 origin refs/remotes/origin/fix/desktop-search-stabilization:refs/heads/fix/desktop-search-stabilization

git push --force-with-lease=refs/tags/v0.7.0-ux:d3ffaed3fa0280dc12eacbd527cd496ef9d2998d origin refs/tags/v0.7.0-ux:refs/tags/v0.7.0-ux
git push --force-with-lease=refs/tags/v1.0.0:f28f8bddf179cdf99d513a8adf1a21d97aed1e39 origin refs/tags/v1.0.0:refs/tags/v1.0.0
git push --force-with-lease=refs/tags/v1.0.0-beta.1:56cbf6c831d32761fb87e7eb98ae880ac66bea74 origin refs/tags/v1.0.0-beta.1:refs/tags/v1.0.0-beta.1

git ls-remote --heads --tags origin
```

Conditional remote cleanup:

- Do not push local `backup/*` branches to GitHub.
- If `git ls-remote --heads origin` shows remote `backup/*` branches that contain old history, delete them before publication or force-update them to sanitized history while the repository is still private.
- Do not use `git push --mirror`; it could publish local backup or tool-specific refs that are not intended for GitHub.
- If GitHub has pull-request refs, caches, releases, or hidden refs pointing to old history, keep the repository private and remove or invalidate them before publication.

## Manual GitHub Security Settings Required

Before public visibility:

1. Complete remote force-with-lease synchronization while the repository is private.
2. Verify `git ls-remote --heads --tags origin` no longer exposes old SHAs.
3. Re-clone from GitHub into a new clean directory after synchronization and repeat the privacy/history scans.
4. Confirm repository visibility and owner account.
5. Enable MFA for maintainers.
6. Enable GitHub secret scanning and push protection where available.
7. Enable Dependabot alerts and security updates.
8. Enable private vulnerability reporting.
9. Configure branch protection or repository rulesets for release branches.
10. Require pull requests and CODEOWNERS review for release-critical files.
11. Restrict who can create release tags and run release workflows.
12. Keep default GitHub Actions token permissions read-only or least-privilege.

## Remaining Blockers

Hard blocker:

- GitHub remote refs and tags have not been synchronized; old remote history remains reachable until the prepared force-with-lease updates are executed privately and verified.

Manual blockers:

- GitHub repository security settings and maintainer MFA still require manual confirmation.
- Levi icon asset provenance still requires manual confirmation.

Non-blocking follow-ups:

- Review npm audit findings reported by clean dependency installation.
- Consider pinning GitHub Actions by SHA for stronger release hardening.
- Add `CONTRIBUTING.md` before inviting outside contributions.
- Re-run the public repository audit after GitHub synchronization and a GitHub-origin clean clone.

## Exact Next Action

Keep GitHub private. After final clean-clone verification passes, execute the prepared force-with-lease branch and tag updates while the repository is private, re-clone from GitHub, re-run the full privacy/history scan and clean-clone verification, confirm GitHub security settings, and only then consider changing repository visibility.

NOT SAFE TO MAKE REPOSITORY PUBLIC
