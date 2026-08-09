# LeviCore Pre-Public Repository Security and Exposure Audit

Milestone: P2-018-03
Audit date: 2026-08-09
Scope: Entire LeviCore repository, current working tree, and reachable Git history
Decision: Do not make the repository public yet

This audit assumes every committed file and every reachable Git object may become public. It does not make the GitHub repository public, push releases, configure SignPath, add product features, or rewrite history.

## Executive Summary

The current tree is substantially safer after remediation in this milestone: no high-confidence current-tree secrets were found, the unnecessary local fixture username was removed from current files, tracked live-test screenshots were removed from the source tree, desktop test artifacts are now ignored, and a root `SECURITY.md` now provides responsible reporting instructions.

However, reachable Git history still contains unnecessary personal local filesystem path metadata. Under the P2-018-03 rule that every reachable Git object may become public, this is a publication blocker.

HISTORY REWRITE REQUIRED

## Current-Tree Secret Scan

Status: PASS after remediation.

Redacted scan coverage:

- API keys, access tokens, passwords, OAuth credentials, private keys, certificates, signing credentials, `.env` files, database credentials, cloud credentials, GitHub tokens, npm tokens, model-provider credentials, personal access tokens, webhook secrets, session tokens, and hardcoded authentication headers.
- Source, tests, fixtures, scripts, documentation, configuration, examples, generated folders, hidden folders, and ignored local folders were checked with path-only reporting.
- A whole-working-tree high-confidence scan, including ignored dependency and build areas and excluding only `.git`, returned no hits.

Findings:

- No committed private key blocks, certificate blocks, GitHub tokens, npm tokens, AWS access keys, Google API keys, OpenAI-style live keys, Slack tokens, Stripe keys, or long hardcoded authorization headers were found in the current tree.
- Broad secret-word scans produced expected false positives in redaction code and synthetic security tests. These were reviewed as placeholders, not live secrets.
- One synthetic bearer-token test fixture was reformatted so it no longer resembles a real credential while still exercising redaction logic.
- Ignored local runtime folders remain on disk, including `.levi/`, `.test-vscode-storage/`, `node_modules/`, desktop build output, desktop test results, and VS Code extension VSIX outputs. They are not tracked and should not be staged.

## Git-History Secret Scan

Status: BLOCKED FOR PUBLICATION because sensitive personal path metadata remains reachable.

High-confidence credential history scan:

- No private key blocks.
- No certificate blocks.
- No GitHub tokens.
- No npm tokens.
- No AWS access keys.
- No Google API keys.
- No OpenAI-style live keys.
- No Slack tokens.
- No Stripe keys.
- No long hardcoded authorization headers.

Broad history findings:

- History contains synthetic credential-like test strings used to verify redaction and secret-handling behavior. These are not live credentials and do not require rewrite by themselves.
- Reachable history contains an unnecessary local Windows user path with the username redacted here. This is personal metadata and must be removed from history before publication.

Affected sensitive-history paths and representative first affected commits:

| Path | Representative affected commit | Finding |
|---|---:|---|
| `packages/levi-desktop/test/setup.ts` | `ce50b804bd8cbc79be5ea87bb81abb476121fca8` | Redacted local Windows username in fake fixture paths |
| `packages/levi-desktop/test/execution-review-panel.test.ts` | `2a319837b14b0e76757c758c5bc05b5963a95407` | Redacted local Windows username in fake fixture paths |
| `packages/levi-desktop/test/home.test.tsx` | `f4046b936d9b8326126dee24f3c3797560f34e60` | Redacted local Windows username in fake fixture paths |
| `packages/levi-desktop/test/debugger.test.tsx` | `18e462e43b98297cf389cb7d83e61f42d0d9d6c4` | Redacted local Windows username in fake fixture paths |
| `packages/levi-desktop/test/terminal-panel.test.tsx` | `b341881b3f09ac131c08d8ef75525fde2fab8c58` | Redacted local Windows username in fake fixture paths |
| `packages/levi-desktop/scripts/package-qualification.mjs` | `aff10e6880a954c260b594f5dbcd1264a66879bb` | Redacted local Windows username in package-leak detection logic |

Additional history findings:

- Reachable history contains tracked generated live-test screenshots under `packages/levi-desktop/test-artifacts/live-002b/`, first observed at `ce50b804bd8cbc79be5ea87bb81abb476121fca8`.
- The reviewed screenshots appear to show synthetic fixture workspaces and not private desktop data.
- History rewrite is not required solely for the screenshots, but if rewriting history for the personal path blocker, dropping the generated screenshot blobs at the same time is recommended.
- Large-object review did not find committed installers, VSIX packages, `node_modules`, databases, private documents, or large release binaries in reachable objects.

## Personal Information Findings

Status: CHANGE REQUIRED for history; PASS for current tree after remediation.

Intentional public maintainer identity:

- `Hakim Bello` and `hakimbello` appear in license, package metadata, CODEOWNERS, repository URLs, release docs, and code-signing policy.
- These appear intentional and public-facing.

Accidental/private personal metadata:

- The current tree no longer contains the redacted local Windows username in Levi Desktop tests or scripts.
- Reachable history still contains that redacted local username in the affected paths listed above.
- Documentation mentions generic Windows locations such as `%APPDATA%`, `%LOCALAPPDATA%`, `%TEMP%`, `OneDrive`, and `AppData`; these are product/support documentation or generic Windows paths, not private personal records.
- No home addresses, personal phone numbers, account numbers, private identifiers, or unrelated personal documents were found.

## Proprietary And Third-Party Content Findings

Status: PASS with manual asset provenance note.

Findings:

- No copied proprietary source, model files, bundled executables, committed dependency vendor tree, or committed package manager dependency tree was found in tracked source.
- Tracked direct assets are limited to Levi icon assets: `packages/levi-desktop/assets/levi.svg`, `packages/levi-desktop/assets/levi.ico`, and `packages/vscode-extension/assets/levi.svg`.
- No fonts, images, binaries, model files, `.wasm`, `.onnx`, `.gguf`, `.safetensors`, `.pt`, or third-party executables were found as tracked direct repository content, aside from the Levi `.ico` asset.
- npm dependency usage and lockfiles are not treated as copied proprietary repository content.

Manual confirmation:

- Confirm that Levi icon assets are original project assets or otherwise have redistribution rights.

## Generated And Development Artifact Findings

Status: PASS for current tracked files after remediation; history cleanup recommended.

Current tracked findings:

- No tracked `node_modules`, desktop `dist`, `dist-electron`, `release`, `coverage`, `test-results`, `playwright-report`, installers, VSIX packages, logs, local databases, or generated screenshots remain in the current source tree.

Ignored local findings:

- Local generated/ignored folders and files exist on disk and are intentionally excluded from Git.
- `.gitignore` now covers `packages/levi-desktop/test-artifacts/`.

Remediated:

- Removed 12 tracked generated live-test PNG screenshots from `packages/levi-desktop/test-artifacts/live-002b/`.
- Added ignore coverage for future desktop test artifacts.

History:

- The removed screenshots remain reachable in history until history is rewritten or pruned.

## GitHub Actions Findings

Status: PASS for current workflow design, with manual GitHub settings required.

Workflow reviewed:

- `.github/workflows/levi-desktop-release.yml`

Positive findings:

- No `pull_request_target` trigger.
- No pull request trigger on the release workflow.
- Workflow permissions are constrained to `contents: read` and `actions: read`.
- Checkout uses `persist-credentials: false`.
- The workflow does not consume repository secrets.
- The workflow does not configure SignPath, signing credentials, self-signed certificates, or any third-party signing service.
- The workflow builds on GitHub-hosted `windows-latest`, runs typecheck/tests/build, packages an unsigned installer, generates checksums/metadata, and uploads an unsigned artifact.

Risks to manage before public use:

- `workflow_dispatch` and `v*` tag pushes are safe only if repository write/tag permissions are restricted.
- Dependency installation runs `npm ci`, which executes the dependency supply chain in CI. This is normal for Node builds but should be paired with Dependabot, code review, and minimal permissions.
- GitHub Actions are version-pinned by major tag, not commit SHA. This is acceptable for ordinary GitHub Actions usage but stronger release hardening would pin action SHAs.
- Artifact retention is 30 days; public release evidence should copy checksums and metadata into the GitHub Release or another permanent public location.

## Open-Source Attack Surface Findings

Status: PASS for publication readiness as documented risks; no security-through-obscurity blocker found.

Levi-specific surfaces reviewed:

- Electron IPC and preload bridge.
- Terminal execution.
- Agent execution.
- Git execution.
- Browser automation.
- Workspace filesystem access.
- Runtime provider credentials and model requests.
- Debug adapter installation.
- Task execution.

Positive findings:

- Main app window uses `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true`.
- Navigation is restricted to app URLs; window opens are denied except the project-local external URL path.
- The preload bridge exposes explicit APIs rather than raw Node primitives.
- Many IPC handlers validate argument count and request shape before dispatch.
- Workspace file, Git, browser file URL, and terminal working directory operations are constrained to selected workspace/repository roots.
- Browser automation blocks URL credentials, limits non-local HTTP to HTTPS, restricts `file:` URLs to the workspace, redacts sensitive field previews, and cleans screenshots on session close.
- Agent file edits use preview/approval and transaction/undo concepts.
- Agent terminal commands are previewed and restricted to a safe executable allowlist; shell executables and Git are blocked in that path.
- Git operations are previewed, path-validated, and limited to a defined operation set.
- Runtime provider URL handling strips username/password from endpoint normalization, uses HTTPS for remote OpenAI-compatible endpoints, and avoids persisting API key values in package metadata.
- Debug adapter downloads require HTTPS and checksum verification for direct-download adapters; package installs are versioned.
- `.env` loading is workspace-relative, size-limited, and diagnostics redact sensitive keys.

Documented public-source risks:

- The app is a local IDE with intentional terminal, task, Git, debug, browser, and AI provider capabilities. Attackers can study the IPC/API surface once the source is public.
- The safest assumption is that every renderer-exposed method can be reached by compromised renderer content. Current Electron hardening reduces this risk, but public release should continue treating renderer compromise as a serious threat model.
- User-selected runtime providers may receive prompts, selected source context, and chat/agent context. This is documented in `PRIVACY.md`.
- Debug adapter installation and package-manager based adapter installs are intentional supply-chain surfaces and require user trust in selected adapters.
- Task execution runs workspace-defined commands. This is expected IDE behavior but unsafe for untrusted workspaces.

No current finding depends on hiding source code.

## Repository Metadata Findings

Status: PASS after remediation, with contribution guidance optional.

Present:

- Root `LICENSE`.
- Root `README.md`.
- `.github/CODEOWNERS`.
- Desktop `PRIVACY.md`.
- Desktop `CODE_SIGNING_POLICY.md`.
- Desktop unsigned release/download documentation.
- Root `SECURITY.md`.

Optional future documentation:

- Add `CONTRIBUTING.md` once outside contributions are expected.
- Enable GitHub private vulnerability reporting to match `SECURITY.md`.

## Public Release Readiness

Repository publication:

- Current HEAD source tree: technically prepared after current-tree remediation.
- Reachable Git history: not safe yet because it still exposes redacted personal local path metadata.
- GitHub Actions: safe to expose after branch/tag permissions and Actions settings are configured.
- Issues: safe to expose after private vulnerability reporting is enabled or a maintainer-private contact path is established.

Binary publication:

- Treat separately from source publication.
- Do not publish a downloadable installer from the current repository state until history is rewritten, the repository is public, the release workflow has produced a fresh traceable unsigned artifact, and the final public-release audit passes.

## Remediations Performed

1. Added root `SECURITY.md` with responsible vulnerability reporting instructions.
2. Added `.gitignore` coverage for `packages/levi-desktop/test-artifacts/`.
3. Removed tracked generated live-test PNG screenshots from the current tree.
4. Replaced unnecessary local username fixture paths in desktop tests with generic fixture paths.
5. Generalized package-qualification path-leak detection so it no longer names a local user.
6. Reformatted one synthetic authorization fixture so it no longer resembles a real bearer credential.
7. Created this audit report.

## Manual GitHub Security Settings Required

Before making the repository public:

1. Rewrite reachable Git history to remove the redacted local username and preferably drop historical generated screenshots.
2. Re-run the full secret/personal-info/history scan after rewrite.
3. Confirm repository visibility and owner account.
4. Enable MFA for maintainers.
5. Enable GitHub secret scanning and push protection where available.
6. Enable Dependabot alerts and security updates.
7. Enable private vulnerability reporting.
8. Configure branch protection or repository rulesets for release branches.
9. Require pull requests and CODEOWNERS review for release-critical files.
10. Restrict who can create release tags and run release workflows.
11. Keep default GitHub Actions token permissions read-only or least-privilege.

## Remaining Blockers

Hard blocker:

- Reachable Git history contains redacted personal local path metadata. History rewrite is required before publication.

Non-blocking follow-ups:

- Confirm Levi icon asset provenance.
- Consider pinning GitHub Actions by SHA for stronger release hardening.
- Add `CONTRIBUTING.md` before inviting outside contributions.
- Re-run audit after history rewrite and before publishing any binary.

## Verification Checklist

Required verification commands for this milestone:

- `npm.cmd --prefix packages/levi-desktop run typecheck`: PASS.
- `npm.cmd --prefix packages/levi-desktop test`: PASS after rerun outside sandbox. Initial sandbox run failed during Vitest config loading with a sandbox path-access error, not a test failure.
- `npm.cmd --prefix packages/levi-desktop run build`: PASS after rerun outside sandbox. Initial sandbox run failed during Vite config loading with a sandbox path-access error, not a build/source failure. Vite still reports the existing Monaco chunk-size warning.
- `npm.cmd test`: PASS, 263 tests passed.
- GitHub Actions YAML structural validation: PASS.
- Post-build current-tree high-confidence secret scan: PASS.
- Post-build current-tree local username scan for the redacted fixture path: PASS.
- Current tracked generated artifact scan: PASS.
- `git status`: pending expected audit/remediation changes only before commit.

## Exact Next Action

Do not make the repository public. Rewrite reachable Git history to remove the redacted local Windows username from the affected paths and preferably remove historical generated screenshots, then clone/fetch the rewritten repository into a clean location and re-run P2-018-03 before publication.

NOT SAFE TO MAKE REPOSITORY PUBLIC
