# LeviCore Pre-Public Repository Security and Exposure Audit

Milestone: P2-018-04
Audit date: 2026-08-09
Scope: Entire LeviCore repository, rewritten reachable Git history, and clean-clone qualification
Decision: Do not make the GitHub repository public yet

This audit assumes every committed file and every reachable Git object may become public. It does not make the GitHub repository public, force-push rewritten refs, publish binaries, configure SignPath, add product features, or change Version 1 behavior.

## Executive Summary

P2-018-04 completed the local history rewrite that P2-018-03 required. The confirmed historical local Windows username/path metadata was replaced with generic fixture metadata, and the historical generated live-test screenshots under `packages/levi-desktop/test-artifacts/live-002b/` were removed from rewritten reachable history.

Post-rewrite local scans found zero occurrences of the redacted private username marker, zero identified personal absolute path hits, zero identified generated screenshot history paths, and zero high-confidence credential patterns across reachable local refs. `git fsck --full` passed with no output.

The rewritten local repository is privacy-sanitized, but the GitHub repository must not be made public yet. Remote branches and tags have not been synchronized, and any old remote ref still pointing at pre-rewrite history would preserve the exposure. Clean-clone qualification also found a desktop package-hygiene test failure even though the same `git check-ignore` targets pass directly in the clean clone.

NOT READY FOR PUBLIC GITHUB VISIBILITY

## Backup And Rewrite Record

Status: PASS for local backup, rewrite, and integrity.

Recorded pre-rewrite state:

- Current branch: `desktop-v1`.
- Original HEAD: `a0c3469bd05fda660f36c02539d3b91b8982da6a`.
- Local branch refs recorded before rewrite: `backup/desktop-v1-before-rebase-98f44c4`, `backup/local-desktop-v1-obsolete`, `desktop-v1`, `integrate-desktop-v1`, `integrate-desktop-v1-clean`, `main`, `v1-final-backup`.
- Remote-tracking refs recorded before rewrite: `origin/HEAD`, `origin/desktop-v1`, `origin/fix/desktop-search-stabilization`, `origin/integrate-desktop-v1-clean`, `origin/main`, `origin/v1-final-backup`.
- Tags recorded before rewrite: `v0.7.0-ux`, `v1.0.0`, `v1.0.0-beta.1`.
- Remote recorded before rewrite: `origin` at `https://github.com/hakimbello/levicore.git`.

Backup:

- Backup method: `git clone --mirror` from the local repository.
- Backup location: `C:\Users\<LOCAL_USERNAME>\.codex\visualizations\2026\08\09\019fe849-b9db-72c1-9fc8-efdfde9474a5\levicore-p2-018-04-backup.git`.
- Backup verification: branches and tags matched the pre-rewrite repository; backup `desktop-v1` matched original HEAD `a0c3469bd05fda660f36c02539d3b91b8982da6a`.
- Backup `git fsck --full`: PASS for integrity, with dangling objects noted in the backup mirror.
- Backup note: the backup intentionally contains the old history and must remain private.

Rewrite:

- `git-filter-repo` was not available locally.
- Rewrite method: `git filter-branch` tree filter, scoped to replacing the redacted local username with generic `developer` fixture metadata and removing `packages/levi-desktop/test-artifacts/live-002b/`.
- Commits processed by rewrite: 233.
- Post-filter `desktop-v1` HEAD before this audit update: `b663148e80ed93c8e764fcc30a8deffe9dff0fd8`.
- Internal `refs/original/*` refs were deleted after rewrite, reflogs were expired, and garbage collection was run.

Affected refs rewritten locally:

- Branches: `backup/desktop-v1-before-rebase-98f44c4`, `backup/local-desktop-v1-obsolete`, `desktop-v1`, `integrate-desktop-v1`, `integrate-desktop-v1-clean`, `main`, `v1-final-backup`.
- Remote-tracking refs: `origin/desktop-v1`, `origin/fix/desktop-search-stabilization`, `origin/integrate-desktop-v1-clean`, `origin/main`, `origin/v1-final-backup`.
- Tags: `v0.7.0-ux`, `v1.0.0`, `v1.0.0-beta.1`.
- Not for publication: local `backup/*` branch names and the local mirror backup should not be pushed to a public remote.

## Post-Rewrite Privacy Scan

Status: PASS for local rewritten reachable history and clean-clone reachable history.

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

## Repository Integrity And Structure

Status: PASS.

Integrity:

- Main rewritten repository `git fsck --full`: PASS with no output.
- Clean clone `git fsck --full`: PASS with no output.
- Main rewritten reachable commit count across local refs: 233 before this audit update.
- Clean clone reachable commit count: 223, because the clean clone was a normal clone rather than a mirror of every local-only ref.

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

| Requirement | Classification | Post-rewrite result |
|---|---|---|
| Current-tree secrets absent | PASS | No high-confidence current-tree secrets found. |
| Rewritten reachable history excludes confirmed personal path metadata | PASS | Redacted local username/path hits are 0 across local reachable history and clean-clone reachable history. |
| Rewritten reachable history excludes confirmed generated screenshots | PASS | `packages/levi-desktop/test-artifacts/live-002b/` history paths are 0. |
| High-confidence credential history scan | PASS | Private keys, certificates, package tokens, cloud keys, provider keys, Slack tokens, Stripe keys, and long auth headers all returned 0. |
| Repository integrity after rewrite | PASS | `git fsck --full` passed in the rewritten repository and clean clone. |
| Version 1 source preservation | PASS | Required Desktop IDE, runtime, chat, agent, terminal, tasks, Git, debugger, browser, release, and SignPath docs are present. |
| Clean clone source/history scan | PASS | Clean clone contains no removed personal path metadata and no identified generated screenshot history. |
| Clean clone dependency install | CHANGE REQUIRED | `npm ci` passed after sandbox escalation, but Electron's postinstall did not place `electron.exe`; the locked artifact was downloaded and extracted manually for test diagnosis. |
| Clean clone desktop tests | FAIL | After Electron extraction, 26 of 27 desktop test files passed, but `test/package-hygiene.test.ts` still failed 2 assertions inside Vitest. Direct `git check-ignore -v` for the same paths passed in the clean clone. |
| Clean clone desktop build | PASS | `npm.cmd --prefix packages/levi-desktop run build` passed in the clean clone. |
| Clean clone root tests | PASS | `npm.cmd test` passed in the clean clone. |
| Local full software verification | PASS | Typecheck, desktop tests, desktop build, and root tests passed in the rewritten working repository. |
| GitHub remote safety | CHANGE REQUIRED | Remote branches and tags have not been force-with-lease synchronized; old remote refs may still expose pre-rewrite history. |
| GitHub security settings | MANUAL CONFIRMATION | MFA, secret scanning/push protection, Dependabot, private vulnerability reporting, branch protection, tag restrictions, and Actions settings require manual confirmation in GitHub. |
| Asset provenance | MANUAL CONFIRMATION | Confirm Levi icon assets are original project assets or otherwise redistributable. |

## Test And Build Verification

Rewritten working repository:

- `npm.cmd --prefix packages/levi-desktop run typecheck`: PASS.
- `npm.cmd --prefix packages/levi-desktop test`: PASS, 27 files passed, 254 tests passed, 2 skipped. Expected stderr from the lazy-loading error-boundary test was observed.
- `npm.cmd --prefix packages/levi-desktop run build`: PASS, with the existing Monaco chunk-size warning.
- `npm.cmd test`: PASS, 263 tests passed.
- `git status --short`: clean before this audit update.

Clean clone:

- Clean clone location: `C:\Users\<LOCAL_USERNAME>\.codex\visualizations\2026\08\09\019fe849-b9db-72c1-9fc8-efdfde9474a5\levicore-p2-018-04-clean-clone`.
- `npm.cmd ci`: PASS after sandbox escalation; npm reported 7 dependency audit findings, 2 moderate and 5 high, for separate dependency-audit follow-up.
- `npm.cmd --prefix packages/levi-desktop run typecheck`: PASS.
- `npm.cmd test`: PASS.
- `npm.cmd --prefix packages/levi-desktop run build`: PASS.
- `npm.cmd --prefix packages/levi-desktop test`: FAIL after dependency repair, with only `test/package-hygiene.test.ts` failing 2 ignore-rule assertions.
- Direct clean-clone `git check-ignore -v` for `.env`, `packages/levi-desktop/.env.local`, `packages/levi-desktop/node_modules/`, `packages/levi-desktop/dist/`, `packages/levi-desktop/dist-electron/`, `packages/levi-desktop/node_modules/.vite/`, `packages/levi-desktop/.vite/`, and `packages/levi-desktop/coverage/`: PASS.
- Clean clone `git status --short`: clean after removing temporary diagnostic cache.

## Remote Safety And Synchronization Plan

Status: CHANGE REQUIRED. Do not make the GitHub repository public before completing and verifying this step.

Because history was rewritten locally, the public remote must be updated while still private. If any old remote branch or tag remains reachable, the repository is not sanitized for public release.

Remote branches requiring force-with-lease update:

- `desktop-v1`: old `6cc1b73e6cee214ed355cfc325b6a7b0a72d153f`, rewritten local `refs/heads/desktop-v1`.
- `main`: old `d3ffaed3fa0280dc12eacbd527cd496ef9d2998d`, rewritten local `07af8874f6fcb4268ac38ceb986299db2c84d35b`.
- `integrate-desktop-v1-clean`: old `2a483eb347cab07eb86c1f89754e335b5b62338f`, rewritten local `fa4eb1c90616afee8207f8859607a82b347a350f`.
- `v1-final-backup`: old `6cc1b73e6cee214ed355cfc325b6a7b0a72d153f`, rewritten local `a78a3d9f2ec066baa41b99f29a3028e3cf8c1e6b`.
- `fix/desktop-search-stabilization`: old `34b0745f85f3f2bc8446d5995a212259672cfa05`, rewritten local `a790c8932fe075a05a0f66daf90f994966d2f034`.

Tags requiring force-with-lease update:

- `v0.7.0-ux`: old `d3ffaed3fa0280dc12eacbd527cd496ef9d2998d`, rewritten local `07af8874f6fcb4268ac38ceb986299db2c84d35b`.
- `v1.0.0`: old tag object `f28f8bddf179cdf99d513a8adf1a21d97aed1e39`, rewritten tag object `5d90295dfc3e6be58831e83c456fa63ea4a4d955`.
- `v1.0.0-beta.1`: old tag object `56cbf6c831d32761fb87e7eb98ae880ac66bea74`, rewritten tag object `72ad2c0e3209b6bf82dedb09e167d3365b8ba618`.

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
4. Resolve the clean-clone desktop package-hygiene test failure or document an accepted environment-specific explanation.
5. Confirm repository visibility and owner account.
6. Enable MFA for maintainers.
7. Enable GitHub secret scanning and push protection where available.
8. Enable Dependabot alerts and security updates.
9. Enable private vulnerability reporting.
10. Configure branch protection or repository rulesets for release branches.
11. Require pull requests and CODEOWNERS review for release-critical files.
12. Restrict who can create release tags and run release workflows.
13. Keep default GitHub Actions token permissions read-only or least-privilege.

## Remaining Blockers

Hard blockers:

- GitHub remote refs and tags have not been synchronized; old remote history may still be reachable.
- Mandatory clean-clone desktop test verification is not fully passing because `test/package-hygiene.test.ts` fails 2 ignore-rule assertions inside Vitest.

Non-blocking follow-ups:

- Investigate the clean-clone Electron postinstall behavior; manual extraction of the locked Electron artifact was needed during verification.
- Review npm audit findings reported by the clean clone dependency install.
- Confirm Levi icon asset provenance.
- Consider pinning GitHub Actions by SHA for stronger release hardening.
- Add `CONTRIBUTING.md` before inviting outside contributions.
- Re-run the public repository audit after GitHub synchronization and a GitHub-origin clean clone.

## Exact Next Action

Keep GitHub private. Resolve or formally accept the clean-clone package-hygiene test failure, then execute the prepared force-with-lease branch and tag updates while the repository is private, re-clone from GitHub, re-run the full privacy/history scan and clean-clone verification, and only then consider changing repository visibility.

NOT SAFE TO MAKE REPOSITORY PUBLIC
