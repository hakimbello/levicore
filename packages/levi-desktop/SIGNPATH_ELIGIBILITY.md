# Levi Desktop SignPath Foundation Eligibility Audit

Milestone: P2-018-01
Audit date: 2026-08-09
Scope: Levi Desktop Windows signed distribution from `packages/levi-desktop`
Decision: Do not apply yet

This audit checks Levi against the current SignPath Foundation open-source code signing requirements. It does not configure SignPath, does not change application code, does not submit an application, and does not purchase anything.

## Sources Checked

- SignPath Foundation conditions for open-source projects: https://signpath.org/terms.html
- SignPath project and signing-policy setup: https://docs.signpath.io/projects
- SignPath GitHub trusted build system requirements: https://docs.signpath.io/trusted-build-systems/github
- SignPath origin verification requirements: https://docs.signpath.io/origin-verification/
- OSI MIT license reference: https://opensource.org/license/mit

## Local Evidence Checked

- Remote: `https://github.com/hakimbello/levicore.git`
- Branch: `desktop-v1`
- Latest local commit: `6cc1b73e6cee214ed355cfc325b6a7b0a72d153f`
- Latest local commit date: 2026-08-03 09:13:05 -0400
- Public GitHub API check for `hakimbello/levicore`: `404 Not Found` without authentication
- Local `.github/`: absent
- Local `.signpath/`: absent
- Root `package.json`: `private: true`, no `license`
- Desktop `package.json`: `private: true`, `license: MIT`, `productName: Levi`, `version: 0.1.0`
- Desktop release docs: `RELEASE_DECISION.md`, `SIGNING_READY.md`, `V1_RELEASE_CHECKLIST.md`, `CHANGELOG_V1.md`, `release-v1/DISTRIBUTION.md`, `release-v1/LICENSE`, `release-v1/SHA256SUMS.txt`
- Existing local tags: `v0.7.0-ux`, `v1.0.0`, `v1.0.0-beta.1`

## Summary

Levi does not currently qualify for a SignPath Foundation certificate application in a clean, low-risk way.

The strongest local positives are that Levi Desktop has a defined Windows NSIS build, product metadata, MIT package metadata, a checksum for the final RC installer, release qualification notes, and a signing-readiness path. The hard blockers are repository public visibility, repo-wide open-source licensing, missing public release/download documentation, missing GitHub Actions trusted-build pipeline, missing SignPath policy/roles, and lack of SignPath-verifiable provenance from source to release binary.

## Eligibility Score

Score: 5 / 17 confirmed requirements pass.

Method: Each numbered user requirement counts once. `PASS` counts as 1. `FAIL`, `MANUAL CONFIRMATION`, and `CHANGE REQUIRED` count as 0 because they are not application-ready.

## Requirement Classification

| # | Requirement | Classification | Evidence | Required action |
|---|-------------|----------------|----------|-----------------|
| 1 | Repository visibility and ownership requirements | CHANGE REQUIRED | The configured remote is `hakimbello/levicore`, but the unauthenticated GitHub API returned `404 Not Found`. That means the repository is not publicly visible from this environment or the remote is not publicly reachable. SignPath expects an open-source repository and the signing team must own/maintain the source repository. | Make the canonical repository public before applying. Confirm that the SignPath signing team is the same team responsible for development, maintenance, and repository ownership. |
| 2 | OSI-approved licensing | CHANGE REQUIRED | `packages/levi-desktop/package.json` and `packages/vscode-extension/package.json` declare MIT, and MIT is OSI-approved. However, there is no repo-root `LICENSE`, root `package.json` has no `license`, and root is `private: true`. Desktop has a distribution license under `release-v1/LICENSE`, but not a package-root license file. | Add a repo-wide OSI-approved license, preferably MIT if that is intended, and make package/root metadata consistent. |
| 3 | Every Levi-owned component required for signed distribution is open source | CHANGE REQUIRED | The signed desktop package includes desktop source plus `../../src` via `extraFiles`. Root `src/`, root scripts/tests, desktop source, and release scripts are in the same repository, but repo-wide license coverage is incomplete. | Explicitly license all Levi-owned source and build scripts required for the signed distribution. Document that the desktop distribution is fully built from this public repository. |
| 4 | Proprietary components would violate eligibility | MANUAL CONFIRMATION | SignPath forbids proprietary, non-open-source components in the project. No obvious proprietary Levi-owned binary was found in the intended distribution. Upstream OSS runtime binaries, such as `node-pty` prebuilds and Electron dependencies, may be included unsigned if their licenses permit it, but should not be signed as Levi-owned upstream artifacts. | Confirm there are no proprietary Levi-owned components, private adapters, closed model bundles, private services, or private build inputs in the signed package. |
| 5 | Existing release status | CHANGE REQUIRED | Local release docs show a final RC/internal beta, not a public signed release. `RELEASE_DECISION.md` states public release is not ready. Public GitHub releases could not be confirmed; unauthenticated repository lookup returned `404`. | Publish an unsigned or beta release/download page in the same form that will later be signed, with release notes, checksum, license, and known unsigned warning. |
| 6 | Public product documentation | CHANGE REQUIRED | Local README and first-run docs exist, but the public repository/download page is not reachable unauthenticated. SignPath requires functionality to be described on the download page or app store entry. | Publish public product/download documentation for Levi Desktop, including what it does, install/uninstall, privacy behavior, and download instructions. |
| 7 | Repository/build architecture | PASS | `packages/levi-desktop/package.json` defines the Electron/Vite/NSIS build. `release-v1/DISTRIBUTION.md` defines the intended distribution bundle. `SIGNING_READY.md` defines the current signing-readiness path. | No production change required for audit. Future SignPath work must add CI and SignPath config without changing V1 product features. |
| 8 | Current GitHub Actions or other CI infrastructure | CHANGE REQUIRED | No local `.github/workflows` directory exists. No other trusted CI configuration was found for release packaging/signing. | Add GitHub Actions release/build workflows before applying. Use GitHub-hosted runners for OSS signing unless SignPath approves another trusted build system. |
| 9 | Release binaries reproducibly traceable to source | CHANGE REQUIRED | The final RC checksum is recorded, but the installer path is `%TEMP%\levi-desktop-release-p201703-final\...`, built locally. SignPath origin verification requires repository URL, branch, commit, CI job URL, and reproducibility checks from a trusted build system. | Move release builds to trusted CI, upload unsigned artifacts as workflow artifacts, record commit SHA/job URL/checksum, and submit signing requests from CI only. |
| 10 | MFA or repository security requirements | MANUAL CONFIRMATION | SignPath requires MFA for SignPath and source repository access for all team members. Local audit cannot verify GitHub account MFA, org policy, branch protection, rulesets, or bypass settings. | Manually confirm MFA for all committers/reviewers/approvers and enable GitHub branch protection/rulesets on release branches. |
| 11 | Required SignPath team roles: authors/committers, reviewers, approvers | CHANGE REQUIRED | No public code signing policy or role mapping exists in the repo. No GitHub teams/CODEOWNERS were found locally. | Define authors/committers, reviewers, and signing approvers. Prefer GitHub teams or explicit named maintainers. |
| 12 | Required code-signing policy | CHANGE REQUIRED | No "Code signing policy" section/page exists. SignPath requires the term on the project home page and download/release pages, including the SignPath Foundation credit text, team roles, and privacy policy link/statement. | Add a public code-signing policy document and link it from README and release/download pages. |
| 13 | Privacy-policy requirement | CHANGE REQUIRED | The VS Code extension has `packages/vscode-extension/PRIVACY.md`. Levi Desktop does not have its own public privacy policy. Desktop docs describe local-first behavior, remote providers, update checks, and local runtime endpoints, but not as a SignPath-ready privacy policy. | Add `packages/levi-desktop/PRIVACY.md` and link it from the code-signing policy, README, and release/download page. |
| 14 | Artifact metadata requirements: product name, version, publisher metadata | PASS | Desktop `package.json` sets `productName: Levi`, `version: 0.1.0`, `appId: dev.levicore.desktop`, `artifactName: ${productName}-${version}-${os}-${arch}.${ext}`, `author: Hakim Bello`, and copyright metadata. | In SignPath artifact configuration, enforce product name `Levi` and product version equality for each signed build. Confirm Authenticode publisher behavior under the SignPath Foundation certificate. |
| 15 | Trusted build system requirements | CHANGE REQUIRED | SignPath open-source signing requires trusted build system verification. No GitHub Actions workflow or SignPath GitHub action integration exists locally. | Configure SignPath GitHub App, trusted build system, project, signing policy, and CI workflow using GitHub-hosted runners. |
| 16 | Origin verification requirements | CHANGE REQUIRED | No SignPath project, signing policy, allowed release branch restriction, `.signpath/policies`, or CI-origin metadata exists. | Configure origin verification against the public repository URL, release branch names such as `main` or `release/*`, commit SHA, and CI job URL. |
| 17 | Manual release approval requirements | CHANGE REQUIRED | Local docs require human release gates, but no SignPath signing approvers or signing-policy approval quorum exist. | Create a release signing policy requiring manual approval for each release signing request. Assign approvers before first signing request. |

## Additional SignPath Conditions

| Requirement | Classification | Evidence | Required action |
|-------------|----------------|----------|-----------------|
| No malware / unwanted software | MANUAL CONFIRMATION | Local release docs report package security scans with no secrets or development path leaks. This audit did not run malware scanning. | Run and record release malware/security scans before application and before every release. |
| No hacking tools | MANUAL CONFIRMATION | Levi includes debugger and browser automation features, but nothing in the docs indicates vulnerability exploitation or security-scanning behavior. | Confirm product positioning and docs do not describe Levi as an exploitation, vulnerability scanning, or security bypass tool. |
| Announce system changes | PASS | Desktop installer docs describe NSIS install/uninstall, shortcuts, user data, and update behavior. | Ensure release/download docs keep install/uninstall and update behavior visible. |
| Provide uninstallation | PASS | `V1_RELEASE_CHECKLIST.md` records NSIS uninstall lifecycle checks and distribution docs describe uninstall expectations. | Keep uninstall instructions on the public download page. |
| Accept technical constraints | CHANGE REQUIRED | No SignPath config exists yet. Current build path uses local temp artifacts, not SignPath-verifiable CI. | Accept SignPath constraints and avoid manual upload paths except explicitly approved exceptional policies. |
| Assist violation investigations | MANUAL CONFIRMATION | No maintainer process is documented. | Add maintainer/security contact expectations to project docs. |

## Hard Blockers

1. The canonical GitHub repository is not publicly reachable unauthenticated from this audit (`404 Not Found`).
2. Repo-wide OSI license coverage is incomplete.
3. Public release/download page and public product docs are not confirmable.
4. No GitHub Actions trusted-build workflow exists.
5. No SignPath trusted build system, origin verification, artifact configuration, or signing policy exists.
6. Release binaries are currently local RC artifacts, not CI artifacts traceable to public source, branch, commit, and workflow job.
7. No code-signing policy, SignPath roles, or manual signing approval quorum is documented.
8. Desktop-specific privacy policy is missing.

## Required Repository Changes

1. Add a repo-root OSI-approved `LICENSE`.
2. Set root package license metadata consistently, or document why the root package is private while the repository is open source.
3. Add a desktop package license file or ensure repo-root license clearly covers `packages/levi-desktop`.
4. Add a public `CODE_SIGNING_POLICY.md` or equivalent page with the exact "Code signing policy" heading.
5. Add `packages/levi-desktop/PRIVACY.md`.
6. Add `CODEOWNERS` for build scripts, CI workflows, package metadata, and SignPath policy files once created.
7. Add `.signpath/policies/<project-slug>/<signing-policy-slug>.yml` after SignPath project slugs are known.

## Required GitHub Changes

1. Make `hakimbello/levicore` public, or move the canonical public source to a public repository and update all metadata.
2. Confirm repository ownership and maintainer authority for the team that will request signing.
3. Require MFA for all authors/committers, reviewers, and approvers.
4. Add branch protection or rulesets for release branches.
5. Require pull requests and review for release branches.
6. Protect CI workflow, build scripts, package metadata, and SignPath policy files with CODEOWNERS.
7. Publish a release/download page for the current Levi Desktop form.

## Required Documentation

1. Public Levi Desktop README/download page describing functionality.
2. Public release notes and checksums for the existing unsigned/internal beta or public beta.
3. Public install and uninstall instructions.
4. Public privacy policy for Levi Desktop.
5. Public code-signing policy with SignPath Foundation attribution, team roles, approvers, and privacy link.
6. Documentation that upstream OSS binaries may be included unsigned but not signed as Levi-owned upstream artifacts.

## Required CI Changes

1. Add GitHub Actions workflow for desktop build, test, package, and artifact upload.
2. Use GitHub-hosted runners for SignPath OSS eligibility unless SignPath approves a different trusted build setup.
3. Upload the unsigned installer as a GitHub Actions artifact before submitting a signing request.
4. Add `signpath/github-action-submit-signing-request@v2` after SignPath organization/project/policy slugs exist.
5. Pass version metadata into the artifact configuration and enforce file metadata restrictions.
6. Restrict signing workflows to release branches/tags and manual release dispatch as appropriate.
7. Preserve provenance: repository URL, branch, commit SHA, workflow run URL, artifact ID, and checksums.

## Required SignPath Team Roles

These must be documented before applying:

| Role | Current status | Required definition |
|------|----------------|---------------------|
| Authors/committers | MANUAL CONFIRMATION | People trusted to modify Levi source without additional review. |
| Reviewers | CHANGE REQUIRED | Team members responsible for reviewing changes from non-committers and release/build changes. |
| Approvers | CHANGE REQUIRED | Team members trusted to approve each signing request. |

## Required Code-Signing Policy Content

The public policy must include:

1. Heading or link text containing exactly "Code signing policy".
2. The SignPath Foundation attribution required by SignPath.
3. Committer/reviewer/approver role mapping.
4. Privacy policy link or an explicit no-network-transfer statement if that were true.
5. Statement that release binaries are built from the public repository by trusted CI.
6. Statement that every release signing request requires manual approval.
7. Statement that upstream OSS binaries included in installers are not signed as Levi-owned upstream code unless allowed by SignPath policy.

## Artifact Metadata Readiness

| Metadata | Current value | Status |
|----------|---------------|--------|
| Product name | `Levi` | PASS |
| Product version | `0.1.0` | PASS |
| Artifact name | `Levi-0.1.0-win-x64.exe` pattern | PASS |
| App ID | `dev.levicore.desktop` | PASS |
| Author/publisher metadata | `Hakim Bello` in package metadata; Authenticode publisher will be certificate subject | MANUAL CONFIRMATION |
| SignPath file metadata restrictions | Not configured | CHANGE REQUIRED |

## Whether Levi Should Apply

No. Levi should not apply yet.

Levi should apply only after the repository is public, licensing is made repo-wide and unambiguous, public docs are available, the existing release form is publicly downloadable, GitHub Actions builds the release artifact on GitHub-hosted runners, and SignPath policy/roles/approval/origin-verification prerequisites are prepared.

## Exact Next Action

Make the repository application-ready before configuring SignPath:

1. Publish or make public the canonical `hakimbello/levicore` repository.
2. Add a repo-root OSI-approved license and consistent package license metadata.
3. Add public Levi Desktop privacy and code-signing policy documents.
4. Add GitHub Actions release build workflow using GitHub-hosted runners.
5. Publish the current unsigned Levi Desktop release/download page with checksum and documentation.

After those are complete, run a second SignPath eligibility audit before configuring SignPath or submitting an application.
