# Levi Desktop SignPath Foundation Eligibility Audit

Milestone: P2-018-12
Audit date: 2026-08-11
Scope: Levi Desktop Windows distribution from `packages/levi-desktop`
Repository: `https://github.com/hakimbello/levicore`
Default branch: `main`
Audited public source commit: `3c931dcefb4a15adcc3a905e45058bcf893fc502`
Local audit update: this document and the root README received a documentation-only correction that must be pushed before the public repository reflects it.
Decision: DO NOT APPLY YET

This audit checks Levi Desktop against the current SignPath Foundation open-source code-signing requirements and the current public GitHub repository state. It does not configure SignPath, does not submit an application, does not publish a release, does not change repository visibility, and does not change application behavior.

## Sources Checked

- SignPath Foundation open-source requirements: https://signpath.org/terms.html
- SignPath project, signing-policy, trusted-build, and origin-verification requirements:
  - https://docs.signpath.io/projects
  - https://docs.signpath.io/trusted-build-systems/github
  - https://docs.signpath.io/origin-verification/
- OSI MIT license reference: https://opensource.org/license/mit
- Public GitHub repository/API state for `hakimbello/levicore`
- Authenticated read-only GitHub settings views for repository security and account MFA

## Final Decision

LeviCore is not ready to submit the SignPath Foundation application today.

Most repository, licensing, documentation, GitHub security, and trusted-build prerequisites are now in place. The remaining application-stage blockers are:

1. No public GitHub Release or stable public download page has been published for the unsigned Levi Desktop artifact in the form intended to be signed.
2. The local reachable-history privacy re-audit found one historical private-path/identity hit in a release-candidate audit markdown file. A fresh public GitHub clone recheck must confirm zero such hits, or the reachable history must be sanitized again before applying.

After those two blockers are resolved, Levi should be ready to apply. SignPath project creation, trusted-build configuration, origin verification, signing policy configuration, and SignPath team-role assignment are post-application or post-approval configuration work and should not be completed before applying unless SignPath instructs otherwise.

## Eligibility Score

Current public GitHub score: 11 / 17 confirmed PASS.

Local post-audit documentation score after pushing this commit: 12 / 17 confirmed PASS.

Scoring method: each numbered SignPath eligibility requirement counts once. `PASS` counts as 1. `FAIL`, `CHANGE REQUIRED`, `MANUAL CONFIRMATION`, and `POST-APPLICATION CONFIGURATION` count as 0 for current-state completion, even when they are not application-stage blockers.

Application readiness: NOT READY TO APPLY.

## Repository State

| Check | Status | Evidence | Remaining action |
| --- | --- | --- | --- |
| Public repository access | PASS | Public GitHub API resolved `hakimbello/levicore` as `public`. | None. |
| Repository URL | PASS | `https://github.com/hakimbello/levicore` resolves. | None. |
| Default branch | PASS | GitHub reports `main` as the default branch. | None. |
| Default branch commit | PASS | `main` resolved to `3c931dcefb4a15adcc3a905e45058bcf893fc502` during audit. | Keep public-ready state on `main`. |
| OSI-approved license | PASS | Root `LICENSE` is MIT; GitHub API reports repository license `MIT`. | None. |
| Security policy | PASS | `SECURITY.md` exists at repository root. | None. |
| Privacy policy | PASS | `packages/levi-desktop/PRIVACY.md` exists. | None. |
| Code-signing policy | CHANGE REQUIRED | `packages/levi-desktop/CODE_SIGNING_POLICY.md` exists and contains the required "Code signing policy" wording. This local audit commit adds the missing root README project-home link. | Push this documentation-only commit before applying. |
| First-run and release/download docs | PASS | `FIRST_RUN.md` and `RELEASE_DOWNLOAD.md` exist. | Publish a real release/download URL before applying. |
| Branding provenance | PASS | `assets/BRANDING.md`, `assets/levi.png`, and `assets/levi.ico` exist; old `levi.svg` is removed. | None. |
| CODEOWNERS | PASS | `.github/CODEOWNERS` exists. | Optionally require CODEOWNERS review for SignPath policy files once `.signpath/` exists. |
| GitHub Actions release workflow | PASS | `.github/workflows/levi-desktop-release.yml` exists on `main`. | None for application readiness. |
| Lockfile for reproducible install | PASS | `package-lock.json` exists and has previously supported clean `npm ci` verification. | Continue using `npm ci` in CI and release builds. |

## Security Re-Audit

| Check | Status | Evidence | Remaining action |
| --- | --- | --- | --- |
| Current-tree high-confidence secrets | PASS | Current-tree scan found zero high-confidence non-fixture secret files. | None. |
| Current-tree private filesystem path/identity exposure | PASS | Current-tree private path scan found zero files. | None. |
| Current-tree `.env`, private key, certificate, token exposure | PASS | No tracked `.env`, private key, certificate, signing token, or signing credential files were found in current source. | None. |
| Tracked generated artifacts | PASS | No generated installer/build-output artifacts are tracked in current source. The tracked `release-v1` files are documentation/checksum manifest files. | None. |
| Historical generated screenshot artifacts | PASS | Reachable-history scan found zero generated screenshot or generated PNG path hits. | None. |
| Reachable-history high-confidence secrets | PASS | Reachable-history scan found zero high-confidence non-fixture secret files. | None. |
| Reachable-history private path/identity exposure | FAIL | Local reachable-history scan found one historical private-path/identity hit in a release-candidate audit markdown file. Secret values were not printed or recorded. | Re-run against a fresh public GitHub clone. If the hit is present there, sanitize history again before applying. |
| Git object integrity | PASS | `git fsck --full` completed cleanly. | None. |
| Branding provenance | PASS | Current branding documentation states the included Levi branding was created for Levi, replaced the prior assets before public release, and may be redistributed with Levi. | None. |

## GitHub Security Status

| Requirement | Status | Evidence | Remaining action |
| --- | --- | --- | --- |
| Maintainer MFA | PASS | Authenticated GitHub account security view showed two-factor authentication configured with an authenticator app. | None. |
| `main` branch protection | PASS | GitHub branch protection rule for `main` applies to one branch. | None. |
| Pull requests before merging | PASS | Branch protection requires pull requests. | None. |
| At least one approval | PASS | Branch protection requires one approving review. | None. |
| Required status check | PASS | Branch protection requires `Build unsigned Windows release`. | None. |
| Conversation resolution | PASS | Branch protection requires conversation resolution. | None. |
| Administrator bypass limited | PASS | Branch protection uses "Do not allow bypassing the above settings." | None. |
| Force pushes blocked | PASS | Force pushes are not allowed. | None. |
| Branch deletion blocked | PASS | Branch deletion is not allowed. | None. |
| Actions enabled | PASS | Repository Actions settings allow repository workflows and selected external actions. | None. |
| Default `GITHUB_TOKEN` permissions | PASS | Workflow permissions are read-only by default; workflow file also sets `contents: read` and `actions: read`. | None. |
| Untrusted PR workflow secret exposure | PASS | Workflow does not use `pull_request_target`, does not reference signing secrets, and does not echo secrets. | None. |
| Dependency graph | PASS | GitHub security settings show dependency graph enabled. | None. |
| Dependabot alerts | PASS | GitHub security settings show Dependabot alerts enabled. | None. |
| Dependabot security updates | PASS | GitHub security settings show Dependabot security updates enabled. | None. |
| Secret Protection | PASS | GitHub security settings show Secret Protection enabled. | None. |
| Push protection | PASS | GitHub security settings show push protection enabled. | None. |
| Private vulnerability reporting | PASS | GitHub security settings show private vulnerability reporting enabled. | None. |
| Discussions | NOT REQUIRED | Discussions are disabled. SignPath Foundation does not require Discussions. | None. |
| Wiki | NOT REQUIRED | Wiki is enabled. SignPath Foundation does not require disabling it. | Optional repository preference only. |
| CODEOWNERS review enforcement | MANUAL CONFIRMATION | CODEOWNERS exists, but branch protection did not show required code-owner review enabled. | Optional now; recommended when `.signpath/` policy files are added. |

## Trusted Build And CI

Latest successful release workflow evidence:

- Workflow: `Levi Desktop Release Build`
- Run: Build #3
- Run URL: `https://github.com/hakimbello/levicore/actions/runs/31454804854`
- Head SHA: `3c931dcefb4a15adcc3a905e45058bcf893fc502`
- Conclusion: `success`
- Artifact count: 1
- Artifact name: `levi-desktop-31454804854-3c931dcefb4a15adcc3a905e45058bcf893fc502`

| Trusted-build expectation | Status | Evidence | Remaining action |
| --- | --- | --- | --- |
| GitHub-hosted Windows runner | PASS | Workflow uses `windows-latest`. | None. |
| Exact source checkout | PASS | Workflow checks out `${{ github.sha }}` with `fetch-depth: 0` and `persist-credentials: false`. | None. |
| Deterministic dependency install | PASS | Workflow uses `npm ci` from `package-lock.json`. | None. |
| Typecheck | PASS | Workflow runs the desktop typecheck. | None. |
| Tests | PASS | Workflow runs desktop tests and root tests. | None. |
| Production build | PASS | Workflow runs desktop production build. | None. |
| Windows packaging | PASS | Workflow packages Windows NSIS output with Electron Builder and `--publish never`. | None. |
| SHA-256 generation | PASS | Workflow generates `SHA256SUMS.txt`. | None. |
| Build metadata | PASS | Workflow emits `BUILD_METADATA.json` with product, version, repository, source commit/ref, workflow, run id, build URL, and unsigned status. | None. |
| Artifact upload | PASS | Workflow uploads the release bundle using `actions/upload-artifact`. | None for application readiness. SignPath signing later needs the upload-artifact id in its own submission step. |
| Restricted token permissions | PASS | Workflow has `contents: read` and `actions: read`. | None. |
| No signing credentials embedded | PASS | Workflow contains no signing certificates, keys, tokens, or SignPath secrets. | None. |
| No unsafe `pull_request_target` flow | PASS | Workflow triggers on manual dispatch and version tags, not `pull_request_target`. | None. |
| CI artifact traceability | PASS | Artifact name and metadata tie the unsigned artifact to the commit SHA and workflow run. | Publish a stable download/release page before applying. |
| SignPath trusted-build system configured | POST-APPLICATION CONFIGURATION | No SignPath project or SignPath GitHub app/action is configured. | Configure only after application/approval or when SignPath instructs. |
| SignPath origin verification configured | POST-APPLICATION CONFIGURATION | Repository, branch, commit, and CI metadata exist, but SignPath origin verification is not configured. | Configure in SignPath after project creation. |
| Manual signing approval configured in SignPath | POST-APPLICATION CONFIGURATION | Policy requires manual approval, but SignPath approvers/quorum do not exist yet. | Configure in SignPath after project creation. |

The unsigned CI artifact is sufficiently traceable as build evidence for the application narrative. It is not a substitute for a public release/download URL because it is a workflow artifact, not a stable public download page.

## SignPath Foundation Requirement Matrix

| # | Requirement | Status | Evidence | Remaining action |
| --- | --- | --- | --- | --- |
| 1 | Repository visibility and ownership requirements | PASS | Repository is public at `https://github.com/hakimbello/levicore`; default branch is `main`; authenticated maintainer account has MFA enabled. | None. |
| 2 | OSI-approved licensing | PASS | Repository license is MIT, an OSI-approved license. Root `LICENSE` exists. | None. |
| 3 | Every Levi-owned component required for the signed distribution is open source | PASS | Desktop source, Electron main/preload, renderer, tests, scripts, workflow, release docs, and branding provenance are in the public repository. Workflow uses no off-repo proprietary build input. | Maintain this boundary for every release. |
| 4 | Proprietary components would violate eligibility | PASS | No proprietary Levi-owned component was found in the signed distribution path. Dependencies are third-party packages, not Levi-owned proprietary components. | Maintainer must avoid adding closed Levi-owned release inputs. |
| 5 | Existing release status | FAIL | No GitHub Release has been published. SignPath Foundation terms require the project to be released in the form that should be signed and documented on a download page or app store. | Publish an unsigned beta/pre-release download page and bundle first. |
| 6 | Public product documentation | PASS | Root README links desktop README, first-run guide, unsigned beta release/download notes, privacy policy, code-signing policy, security policy, license, and this audit. | None. |
| 7 | Repository/build architecture | PASS | Repository contains a complete desktop package, Electron/Vite build configuration, package scripts, root lockfile, CI workflow, release documentation, and artifact metadata plan. | None. |
| 8 | Current GitHub Actions or other CI infrastructure | PASS | `Levi Desktop Release Build` successfully completed on `main` at the audited commit. | None. |
| 9 | Release binaries reproducibly traceable to source | PASS | Successful workflow run produced one unsigned Windows artifact with commit-linked artifact name, checksum file, and build metadata. | Publish the artifact on a stable release/download page before applying. |
| 10 | MFA or repository security requirements | PASS | MFA was verified in GitHub account settings. Branch protection, required checks, dependency graph, Dependabot alerts/updates, Secret Protection, push protection, private vulnerability reporting, and read-only Actions defaults are enabled. | None. |
| 11 | Required SignPath team roles: authors/committers, reviewers, approvers | POST-APPLICATION CONFIGURATION | `CODE_SIGNING_POLICY.md` documents the intended roles and approval model. Actual SignPath users/roles cannot be assigned until a SignPath account/project exists. | Assign SignPath authors/committers, reviewers, and approvers after account/project creation. |
| 12 | Required code-signing policy | CHANGE REQUIRED | `CODE_SIGNING_POLICY.md` uses the required "Code signing policy" heading, documents prospective SignPath wording, release roles, approvals, privacy policy, trusted build, origin verification, and unsigned current status. Release/download docs link it. This local audit commit adds the missing root README project-home link, but it is not public until pushed. | Push this documentation-only commit before applying; after acceptance, update wording to reflect actual SignPath status. |
| 13 | Privacy-policy requirement | PASS | `PRIVACY.md` documents local processing, optional provider transmission, local persistence, credentials/secrets handling, telemetry/crash-reporting status, updates, browser automation, and user controls. | None. |
| 14 | Artifact metadata requirements: product name, version, publisher metadata | PASS | Package metadata and workflow metadata include product name `Levi`, version `0.1.0`, app id, artifact name, author/publisher metadata, source commit, workflow run, checksum, and unsigned status. | Configure SignPath artifact restrictions after project creation. |
| 15 | Trusted build system requirements | POST-APPLICATION CONFIGURATION | Current GitHub-hosted workflow aligns with SignPath trusted-build expectations, but SignPath's trusted build system and GitHub app/action are not configured. | Configure SignPath trusted build after application/approval. |
| 16 | Origin verification requirements | POST-APPLICATION CONFIGURATION | Repository, branch, commit, workflow, build URL, and artifact metadata support origin verification, but SignPath origin verification is not configured. | Configure allowed repository and release refs in SignPath after project creation. |
| 17 | Manual release approval requirements | POST-APPLICATION CONFIGURATION | Code-signing policy requires manual approval for each signing request, but SignPath approval quorum is not configured. | Configure SignPath signing approvers and required approvals after project creation. |

## Download URL Requirement

SignPath Foundation's public terms require eligible open-source projects to be released in the form that should be signed and documented on a download page or app store. Levi currently has a successful unsigned GitHub Actions artifact, but no public GitHub Release or stable public download page.

Finding: an existing public download/release URL is an application-stage blocker.

Do not use the temporary GitHub Actions artifact URL as the application download URL. It is useful evidence of trusted-build traceability, but it is not a durable public release/download page.

Before applying, publish a GitHub pre-release for the current public-ready commit. The unsigned beta release should include only:

- `Levi-0.1.0-win-x64.exe`
- `SHA256SUMS.txt`
- `BUILD_METADATA.json`
- `RELEASE_NOTES.md`
- `LICENSE`
- `PRIVACY.md`
- `CODE_SIGNING_POLICY.md`

The release must be marked as an unsigned beta/pre-release, must not claim SignPath approval, and must point back to the exact source commit and successful workflow run.

## Application Field Preparation

Levi is not ready to apply yet, so these fields are provisional and should not be submitted until the blockers above are resolved.

| Field | Draft answer |
| --- | --- |
| Project Name | Levi Desktop |
| Repository URL | `https://github.com/hakimbello/levicore` |
| Homepage URL | `https://github.com/hakimbello/levicore` |
| Download URL | BLOCKED: publish the unsigned beta/pre-release download page first, then use that GitHub Release URL. |
| Privacy Policy URL | `https://github.com/hakimbello/levicore/blob/main/packages/levi-desktop/PRIVACY.md` |
| Tagline | Local-first AI coding desktop for planning, editing, testing, and approving software changes. |
| Description | Levi Desktop is an open-source Windows desktop IDE shell for local AI-assisted software development. It opens local workspaces, provides project navigation and editor workflows, connects to local-first or user-configured OpenAI-compatible runtimes, and keeps file edits, terminal commands, Git actions, and browser automation behind explicit review and approval boundaries. |
| Reputation | Levi is newly public and has limited established public reputation. Current evidence includes a public MIT-licensed repository, sanitized history, maintainer MFA, protected default branch, dependency/security protections, complete public documentation, passing local and GitHub Actions build/test workflow, and a traceable unsigned Windows build artifact. Do not claim broad adoption yet. |
| Maintainer Type | Individual open-source maintainer, unless Hakim applies through a legal company. |
| Build System | GitHub Actions on a GitHub-hosted Windows runner using `npm ci`, desktop typecheck, tests, production build, NSIS packaging, SHA-256 checksum generation, build metadata, and artifact upload. |
| Primary Discovery Channel | GitHub repository, until there is a public website, package registry page, or established community channel. |
| First Name | Hakim must provide. |
| Last Name | Hakim must provide. |
| Email | Hakim must provide. |
| Company Name | Hakim must provide if applying through a company; otherwise leave blank or use the individual-maintainer option if the form supports it. |

## Remaining Blockers

Hard blockers before submission:

1. Push this documentation-only audit commit so the public repository home page links the code-signing policy.
2. Publish a stable public unsigned beta/pre-release download page for the current public-ready artifact.
3. Re-run the private path/identity and secret scans against a fresh public GitHub clone. The result must be zero private path hits, zero high-confidence secret hits, zero historical generated screenshot hits, zero tracked generated artifact hits, and clean `git fsck --full`.
4. If the reachable historical private-path/identity hit is present in the public clone, sanitize history again before applying.

Non-blocking post-application configuration:

1. Create/configure the SignPath project.
2. Install/configure the SignPath GitHub trusted build integration.
3. Add `.signpath/policies/<project-slug>/<signing-policy-slug>.yml` after real slugs and policy details are known.
4. Configure origin verification with the repository URL and allowed release refs.
5. Configure SignPath author/committer, reviewer, and approver roles.
6. Configure required manual signing approvals.
7. Add SignPath signing submission only after SignPath setup is approved.

## Exact Next Action

Do not apply yet.

First, push this documentation-only audit commit, then create a fresh public GitHub clone and rerun the privacy/history scans. If the historical private-path/identity hit is absent, publish a clearly marked unsigned GitHub beta/pre-release for the current successful workflow artifact and use that release URL as the SignPath application Download URL. If the hit is present, sanitize reachable public history again before publishing the beta release or applying.
