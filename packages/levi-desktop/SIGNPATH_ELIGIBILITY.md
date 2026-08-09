# Levi Desktop SignPath Foundation Eligibility Audit

Milestone: P2-018-02
Audit date: 2026-08-09
Scope: Levi Desktop Windows signed distribution from `packages/levi-desktop`
Decision: Do not apply yet

This audit checks Levi against the current SignPath Foundation open-source code signing requirements. It does not configure SignPath, does not change application behavior, does not submit an application, and does not purchase anything.

## Sources Checked

- SignPath Foundation conditions for open-source projects: https://signpath.org/terms.html
- SignPath project and signing-policy setup: https://docs.signpath.io/projects
- SignPath GitHub trusted build system requirements: https://docs.signpath.io/trusted-build-systems/github
- SignPath origin verification requirements: https://docs.signpath.io/origin-verification/
- OSI MIT license reference: https://opensource.org/license/mit

## Local Evidence Checked

- Remote: `https://github.com/hakimbello/levicore.git`
- Branch: `desktop-v1`
- Public GitHub API check from P2-018-01 for `hakimbello/levicore`: `404 Not Found` without authentication
- GitHub workflow added: `.github/workflows/levi-desktop-release.yml`
- CODEOWNERS added: `.github/CODEOWNERS`
- Root license added: `LICENSE`
- Root package metadata: `license: MIT`
- Desktop package metadata: `license: MIT`, `productName: Levi`, `version: 0.1.0`
- Desktop privacy policy added: `packages/levi-desktop/PRIVACY.md`
- Desktop code-signing policy added: `packages/levi-desktop/CODE_SIGNING_POLICY.md`
- Unsigned beta release/download documentation added: `packages/levi-desktop/RELEASE_DOWNLOAD.md`
- Desktop release docs present: `RELEASE_DECISION.md`, `SIGNING_READY.md`, `V1_RELEASE_CHECKLIST.md`, `CHANGELOG_V1.md`, `release-v1/DISTRIBUTION.md`, `release-v1/LICENSE`, `release-v1/SHA256SUMS.txt`

## Summary

P2-018-02 resolves the local repository preparation blockers for licensing, privacy documentation, code-signing policy documentation, unsigned beta release documentation, release workflow definition, and artifact metadata planning.

Levi still should not apply to SignPath Foundation yet. The remaining blockers are account-side or release-execution items: make the canonical repository public, confirm MFA and repository security settings, run the trusted GitHub-hosted release workflow to produce a CI artifact, publish the unsigned beta/download page, configure SignPath, configure origin verification, configure the signing policy, assign SignPath roles, and submit the application only after a final re-audit.

## Eligibility Score

Score: 8 / 17 confirmed requirements pass.

Method: Each numbered user requirement counts once. `PASS` counts as 1. `FAIL`, `MANUAL CONFIRMATION`, and `CHANGE REQUIRED` count as 0.

## Requirement Classification

| # | Requirement | Classification | Evidence | Remaining action |
|---|-------------|----------------|----------|------------------|
| 1 | Repository visibility and ownership requirements | MANUAL CONFIRMATION | Remote is `hakimbello/levicore`; unauthenticated GitHub API previously returned `404 Not Found`. Ownership and maintainer authority cannot be proven locally. | Wilder must make the canonical repository public and confirm the signing team owns/maintains the repository. |
| 2 | OSI-approved licensing | PASS | Root `LICENSE` is MIT. Root `package.json` and package lock metadata declare `MIT`. Desktop and VS Code package metadata declare `MIT`. Existing project-owned license files use MIT; third-party dependency license files were not modified. | None for local prep. |
| 3 | Every Levi-owned component required for signed distribution is open source | PASS | The desktop package and bundled reusable root `src/` are covered by the repo-root MIT license. The desktop package remains MIT and the distribution bundle includes MIT license text. | Confirm after the repository is public that no private build input is used. |
| 4 | Proprietary components would violate eligibility | MANUAL CONFIRMATION | No proprietary Levi-owned component was found in the intended source/build path. Upstream OSS dependencies retain their own licenses and should not be signed as Levi-owned upstream projects. | Wilder must confirm no private adapters, closed model bundles, proprietary services, or private build inputs are required for the signed distribution. |
| 5 | Existing release status | CHANGE REQUIRED | Local RC and release docs exist, and unsigned beta release documentation is prepared. No public GitHub release/download could be confirmed. | Publish the unsigned beta release/download page and artifact bundle before applying. |
| 6 | Public product documentation | PASS | `README.md`, `FIRST_RUN.md`, `RELEASE_DOWNLOAD.md`, `PRIVACY.md`, `CODE_SIGNING_POLICY.md`, release notes, and distribution docs describe Levi IDE, Windows beta status, install, checksum verification, source, license, privacy, and signing status. | Becomes publicly visible when Wilder makes the repository public. |
| 7 | Repository/build architecture | PASS | Desktop package defines Electron/Vite/NSIS build. Distribution manifest defines the bundle. Signing readiness and code-signing policy document the release boundary. | None for local prep. |
| 8 | Current GitHub Actions or other CI infrastructure | PASS | `.github/workflows/levi-desktop-release.yml` builds an unsigned Windows release on `windows-latest`, checks out the exact commit, runs deterministic install, typecheck, tests, build, package, checksum, metadata, and artifact upload. | Run the workflow after the repository is public. |
| 9 | Release binaries reproducibly traceable to source | CHANGE REQUIRED | Workflow now generates `BUILD_METADATA.json` and `SHA256SUMS.txt`, but no CI-produced release artifact exists yet. Existing RC artifacts were local temp artifacts. | Run the trusted workflow and publish artifacts containing source commit, tag/ref, run identity, version, and checksum. |
| 10 | MFA or repository security requirements | MANUAL CONFIRMATION | CODEOWNERS now identifies release-critical files, but MFA, branch rulesets, required reviews, bypass settings, and security settings cannot be verified locally. | Wilder must enable/confirm MFA, branch protection/rulesets, required reviews, and release-branch protections. |
| 11 | Required SignPath team roles: authors/committers, reviewers, approvers | MANUAL CONFIRMATION | `CODE_SIGNING_POLICY.md` documents proposed single-maintainer roles for author/committer, reviewer, and signing approver. Actual GitHub and SignPath role assignments remain account-side. | Wilder must confirm GitHub roles and later assign SignPath roles. Additional separation of duties is still manual. |
| 12 | Required code-signing policy | PASS | `CODE_SIGNING_POLICY.md` includes the required "Code signing policy" heading, prospective SignPath Foundation disclosure, artifacts, roles, trusted build, origin verification, approvals, version/tag requirements, checksums, certificate ownership, and revocation procedure. | Link from public release/download page after repository publication. |
| 13 | Privacy-policy requirement | PASS | `packages/levi-desktop/PRIVACY.md` documents actual local processing, optional provider transmission, local persistence, credentials/secrets handling, telemetry/analytics/crash-report status, updates, browser automation, and user control. | None for local prep. |
| 14 | Artifact metadata requirements: product name, version, publisher metadata | PASS | Desktop metadata defines product name `Levi`, version `0.1.0`, app id, artifact name pattern, author, and copyright. Workflow emits `BUILD_METADATA.json`. | SignPath artifact configuration must later enforce product name/version restrictions. |
| 15 | Trusted build system requirements | MANUAL CONFIRMATION | GitHub-hosted release workflow exists, but SignPath trusted build system is not configured. | Wilder must configure SignPath's trusted GitHub build system after account/project creation. |
| 16 | Origin verification requirements | MANUAL CONFIRMATION | Workflow emits source metadata, and code-signing policy requires origin verification. SignPath project, repository URL, branch/tag restrictions, and verification policy are not configured. | Wilder must configure SignPath origin verification and allowed release refs. |
| 17 | Manual release approval requirements | MANUAL CONFIRMATION | Code-signing policy requires manual approval for each release signing request. SignPath approvers and approval quorum are not configured. | Wilder must configure SignPath signing approvers and required approvals. |

## Additional SignPath Conditions

| Requirement | Classification | Evidence | Remaining action |
|-------------|----------------|----------|------------------|
| No malware / unwanted software | MANUAL CONFIRMATION | Prior release docs report package security scans with no secrets or development path leaks. This prep pass did not run malware scanning. | Run and record release security/malware scans before application and before every release. |
| No hacking tools | MANUAL CONFIRMATION | Levi includes debugger and browser automation features for development workflows; docs do not position Levi as an exploitation or vulnerability-scanning tool. | Confirm public docs keep this positioning. |
| Announce system changes | PASS | Installer, update, shortcut, user data, and uninstall behavior are documented in first-run, privacy, and release docs. | Keep visible in public release docs. |
| Provide uninstallation | PASS | NSIS uninstall lifecycle is documented in release qualification docs and first-run docs. | Keep uninstall guidance in public release docs. |
| Accept technical constraints | MANUAL CONFIRMATION | Workflow and policy avoid signing credentials and manual signing, but SignPath technical constraints are not configured yet. | Wilder must accept and configure SignPath constraints in the SignPath account. |
| Assist violation investigations | MANUAL CONFIRMATION | Code-signing policy now includes emergency incident/revocation steps. | Add/confirm maintainer contact process when repository is public. |

## Requirements Now Passing

1. OSI-approved licensing.
2. Levi-owned source coverage for the signed desktop distribution.
3. Public product documentation prepared in repository.
4. Repository/build architecture.
5. GitHub Actions release workflow infrastructure.
6. Code-signing policy documentation.
7. Desktop privacy-policy documentation.
8. Artifact metadata readiness.

## Requirements Still Failing Or Incomplete

| Requirement | Status |
|-------------|--------|
| Repository public visibility and ownership | MANUAL CONFIRMATION |
| Proprietary component absence | MANUAL CONFIRMATION |
| Existing public release/download | CHANGE REQUIRED |
| CI-produced traceable release binary | CHANGE REQUIRED |
| MFA and repository security settings | MANUAL CONFIRMATION |
| SignPath role assignment | MANUAL CONFIRMATION |
| SignPath trusted build system | MANUAL CONFIRMATION |
| SignPath origin verification | MANUAL CONFIRMATION |
| SignPath manual release approval policy | MANUAL CONFIRMATION |

## Required Repository Changes Remaining

No further local repository documentation changes are required before making the repository public, assuming verification passes and no private material is found.

Future repository changes after SignPath project creation:

1. Add `.signpath/policies/<project-slug>/<signing-policy-slug>.yml` after real SignPath slugs are known.
2. Add the SignPath signing submission step only after SignPath account/project/trusted build configuration exists.
3. Update public docs from prospective wording only after Levi is actually accepted and signed.

## Required GitHub Changes

1. Make `hakimbello/levicore` public.
2. Confirm repository ownership and maintainer authority.
3. Require MFA for authors/committers, reviewers, and approvers.
4. Configure branch protection or rulesets for release branches/tags.
5. Require pull requests and review for protected branches.
6. Enforce CODEOWNERS review for release-critical files where possible.
7. Run the release workflow and publish the unsigned beta/download bundle.

## Required Documentation

Documentation prepared in this milestone:

1. Repo-root MIT `LICENSE`.
2. Desktop privacy policy.
3. Desktop code-signing policy.
4. Unsigned beta release/download page.
5. README and first-run links to release, privacy, and signing docs.
6. Distribution manifest update for metadata, privacy, and signing-policy files.

## Required CI Changes

CI changes prepared in this milestone:

1. Manual and version-tag-triggered GitHub Actions release workflow.
2. GitHub-hosted Windows runner.
3. Exact commit checkout.
4. `npm ci` deterministic dependency installation.
5. Desktop typecheck.
6. Desktop tests.
7. Root runtime tests.
8. Production desktop build.
9. Unsigned Windows NSIS packaging.
10. SHA-256 checksum generation.
11. `BUILD_METADATA.json` generation.
12. Release artifact upload.
13. No SignPath submission, no signing credentials, no self-signed certificate, and no third-party signing service configuration.

## Manual Requirements Wilder Must Perform

Do not automate these in the repository prep pass:

1. Make the GitHub repository public.
2. Enable and confirm MFA where required.
3. Configure GitHub repository security settings.
4. Configure branch protection or rulesets.
5. Run the GitHub Actions release workflow.
6. Publish the unsigned beta release/download bundle.
7. Create/configure the SignPath account.
8. Configure the SignPath project.
9. Configure the SignPath trusted build system.
10. Configure origin verification.
11. Configure the SignPath signing policy.
12. Assign SignPath roles.
13. Submit the SignPath Foundation application after a final audit.

## Whether Levi Should Apply

No. Levi should not apply yet.

Levi should apply only after the repository is public, the GitHub-hosted release workflow has produced a traceable unsigned release artifact, the unsigned beta/download page is published, repository security settings and MFA are confirmed, and SignPath project/trusted-build/origin-verification/signing-policy prerequisites are configured.

## Exact Next Action

Make the repository public, then immediately run the `Levi Desktop Release Build` GitHub Actions workflow for the intended beta tag or manual dispatch. Publish the unsigned beta bundle with `SHA256SUMS.txt`, `BUILD_METADATA.json`, release notes, license, privacy policy, and code-signing policy. Then perform a final SignPath eligibility re-audit before configuring SignPath submission.
