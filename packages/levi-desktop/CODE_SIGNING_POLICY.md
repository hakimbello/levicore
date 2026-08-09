# Levi Desktop Code Signing Policy

Status: proposed for SignPath Foundation eligibility preparation
Effective date: 2026-08-09

Levi has not been accepted by SignPath Foundation yet. Levi is not currently signed by SignPath Foundation. This policy documents the intended release-signing model required before a SignPath Foundation application is submitted.

## Code signing policy

If Levi is accepted by SignPath Foundation, signed release artifacts will use code signing provided by SignPath.io, certificate by SignPath Foundation.

Until acceptance and configuration are complete, Levi Desktop Windows beta artifacts remain unsigned.

## Artifacts Covered

The intended signed artifact is the Levi Desktop Windows x64 NSIS installer:

- `Levi-<version>-win-x64.exe`

The signed distribution bundle may also include unsigned documentation and integrity files:

- `SHA256SUMS.txt`
- `BUILD_METADATA.json`
- `RELEASE_NOTES.md`
- `LICENSE`
- `PRIVACY.md`
- `CODE_SIGNING_POLICY.md`

Upstream open-source binaries may be included in the installer when their licenses permit distribution. Levi must not sign upstream OSS binaries as Levi-owned upstream projects unless SignPath policy explicitly allows it.

## Roles

Current proposed single-maintainer model:

| Role | Proposed holder | Status |
|------|-----------------|--------|
| Author/committer | `hakimbello` | Manual GitHub account confirmation required |
| Reviewer | `hakimbello` | Manual repository ruleset and CODEOWNERS confirmation required |
| Signing approver | `hakimbello` | Manual SignPath account configuration required |

Because Levi is currently a single-maintainer project, full separation of duties is not yet available. Any additional reviewer or approver separation must be configured manually in GitHub and SignPath before production signing.

## Who May Request Signing

Signing requests must come only from the trusted release workflow for this repository. Interactive users, local machines, and ad hoc uploaded files must not be allowed to request routine release signing.

The release workflow must run on GitHub-hosted Windows runners and must build from repository source at the checked-out commit.

## Who Approves Releases

Each release signing request must require manual approval by a configured SignPath signing approver.

Approval must confirm:

- The version and tag match the intended release.
- The Git commit is the reviewed release source.
- The workflow run is from the canonical public repository.
- The unsigned artifact checksum matches the workflow metadata.
- The distribution bundle contains no secrets, certificates, or private keys.

## Trusted Build Requirement

Release artifacts must be built by GitHub Actions on GitHub-hosted runners. The release build must:

- Check out the exact source commit.
- Install dependencies deterministically with `npm ci`.
- Run desktop typecheck.
- Run desktop tests.
- Run root runtime tests.
- Build the production desktop app.
- Package the Windows installer.
- Generate SHA-256 checksums.
- Upload artifacts and build metadata.

No signing credentials, private certificates, self-signed certificates, or third-party signing service configuration may be embedded in the workflow or artifacts.

## Origin Verification Requirement

SignPath origin verification must be configured before signing. Signing policy restrictions should verify:

- Repository URL: `https://github.com/hakimbello/levicore`
- Source commit SHA
- Git tag when applicable
- GitHub Actions workflow run URL
- GitHub-hosted runner use
- Allowed release branches or tags

Build scripts, GitHub Actions workflows, package metadata, and SignPath policy files are release-critical source and must be included in code review.

## Version and Tag Requirements

Release signing is allowed only for versioned releases.

Minimum requirements:

- Desktop `package.json` version must match the intended release version.
- Release tags should use a version tag format such as `v0.1.0`.
- The installer name must include the product name, version, operating system, and architecture.
- Checksums and `BUILD_METADATA.json` must identify the source commit and tag, if the build came from a tag.

## Artifact Integrity Process

The release workflow must produce:

- The unsigned installer.
- `SHA256SUMS.txt` with the installer SHA-256 hash.
- `BUILD_METADATA.json` with product name, version, source commit, ref, tag, workflow name, workflow run id, build URL, artifact name, and signing status.

After signing is configured, the signed artifact must receive a new checksum. Public release documentation must show the checksum for the artifact actually distributed.

## Certificate Ownership

If Levi is accepted by SignPath Foundation, the certificate is issued to SignPath Foundation, not to Levi, the maintainer, or the repository owner.

Levi documentation must not state or imply SignPath Foundation signing until SignPath Foundation has accepted the project and the release artifacts are actually signed.

## Emergency Revocation Procedure

If a signed Levi artifact is suspected to contain malware, unwanted software, private signing material, unreleased proprietary code, or an artifact not built from the verified source:

1. Stop distributing the affected artifact.
2. Remove or mark the affected release as withdrawn.
3. Open a maintainer incident issue or private maintainer record with artifact name, version, checksum, workflow run, source commit, and report details.
4. Notify SignPath support and request guidance on revocation or containment.
5. Publish corrected release notes when a fixed release is available.

## Manual Configuration Still Required

This policy does not configure SignPath. The following actions remain manual:

- Make the canonical GitHub repository public.
- Enable MFA for required GitHub and SignPath users.
- Configure GitHub branch protection or rulesets.
- Create and configure the SignPath account and project.
- Configure the SignPath trusted GitHub build system.
- Configure origin verification.
- Configure the SignPath signing policy and approval quorum.
- Assign SignPath roles.
- Submit the SignPath Foundation application.
