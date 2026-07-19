# RC-005 / Release Qualification and Real-World Validation

## Purpose

RC-005 adds a diagnostic Release Qualification layer for validating Levi across realistic project fixtures, user journeys, extension-shell behavior, local-model readiness, source-change safety, recovery, accessibility, Git presentation, and release-candidate certification evidence.

The qualification layer is not an authority system. It does not approve work, mutate source directly, execute arbitrary shell commands, route model traffic, or replace security, reliability, stress, provider, workflow, agent, multi-agent, or workspace-tool enforcement.

## Engine

`src/release-qualification-engine.js` implements `ReleaseQualificationEngine`. The engine reuses `LeviApplicationRuntime` and existing public component boundaries:

- `SecurityAssuranceEngine`
- `ReliabilityAssuranceEngine`
- `StressScalabilityEngine`
- `AgentOrchestrationEngine`
- `MultiAgentCoordinationEngine`
- `DurableWorkflowEngine`
- `ControlledWorkspaceToolEngine`
- `ModelProviderGateway`
- `RepositoryPerformanceEngine`

## Qualification Package Structure

- Configuration: conservative finite defaults with deterministic mode, fail-closed posture, bounded fixtures, bounded scenarios, bounded evidence, bounded artifacts, and bounded manual checks.
- Fixtures: normalized representative project fixtures spanning static, React, Next.js, Node API, Python CLI, broken project, legacy refactor, and small monorepo shapes.
- Journeys: normalized user journeys for first launch, project explanation, website build, bug fix, refactor, teaching, offline provider failure, and security-conscious changes.
- Suites and scenarios: built-in SMOKE, STANDARD, STRICT, and RELEASE_CANDIDATE profiles with automated and manual scenarios.
- Runs and reports: normalized run, scenario result, defect, manual verification, report, readiness, blocker, and certification records.
- Extension integration: VS Code commands and `levi.qualification` TreeView show qualification health, runs, report, fixtures, journeys, manual checks, defects, Extension Host state, and local Ollama state.
- Documentation: this validation note and `RC_005_MANUAL_VALIDATION_CHECKLIST.md`.

## Built-In Profiles

- `SMOKE`: core installation, runtime, product UI, conversation, project-understanding, approval, path, command, and secret-safety checks.
- `STANDARD`: normal real-world regression qualification with fixture, journey, provider-unavailable, recovery, Git presentation, and product-experience coverage.
- `STRICT`: expanded source-change, repair, accessibility, provider, workflow, multi-agent, security, reliability, scalability, and packaging checks.
- `RELEASE_CANDIDATE`: all release-blocking scenarios, mandatory manual Extension Development Host and local Ollama checks, and no unresolved critical defects before RC qualification can be claimed.

## Automated Coverage

Automated qualification covers deterministic runtime wiring, extension command registration, product UI registration, fake-provider conversation handling, project-understanding across fixtures, onboarding metadata, local-provider simulation, plan/proposal behavior, approval rejection, controlled apply/validate/revert boundaries, reload recovery, provider-unavailable handling, untrusted workspace behavior, repair workflow presentation, multi-agent review presentation, Git-unavailable truthfulness, accessibility metadata, security/reliability/scalability baseline integration, end-to-end source-change workflow structure, website-build validation structure, and packaging precheck.

## Manual Coverage

Manual checks remain pending until a human operator records evidence. The engine refuses to mark manual checks passed automatically. Manual checks include Extension Development Host launch, onboarding, local Ollama detection, real conversation, Plan/Build/Fix/Review/Teach journeys, source change review, validation, revert, reload recovery, Git presentation, keyboard navigation, screen-reader labels, reduced motion, no-provider empty states, untrusted workspace states, and sensitive-data absence in UI/logs.

## Extension Development Host

Automated qualification reports `MANUAL_VERIFICATION_REQUIRED` when no live Extension Development Host adapter is configured. Required command:

```powershell
npm.cmd --prefix packages/vscode-extension run dev
```

Expected result: VS Code Extension Development Host opens, Levi activates, `levi.qualification` is visible, Copilot opens, commands execute, and no credentials, private reasoning, or complete protected source content appear in UI, virtual documents, logs, or output.

## Local Ollama

Automated qualification reports `MANUAL_VERIFICATION_REQUIRED` when no live Ollama adapter is configured. Suggested checks:

```powershell
ollama --version
ollama list
```

Expected result: local provider availability is truthfully shown. If Ollama is absent, Levi shows a provider-unavailable state without fake success or remote fallback that violates privacy configuration.

## Certification

Certification levels are:

- `NOT_EVALUATED`
- `AUTOMATED_BASELINE`
- `MANUAL_VERIFICATION_REQUIRED`
- `RELEASE_CANDIDATE_QUALIFIED`
- `QUALIFICATION_BLOCKED`

RC-005 does not claim production-ready, Marketplace-ready, or manual verification completion without operator evidence.

## Known Limitations

- Live Extension Development Host verification is manual in this environment.
- Live local Ollama verification is manual unless a host adapter is provided.
- Accessibility has automated metadata checks, but keyboard and assistive-technology verification remain manual.
- Git commit/push behavior remains presentation-only unless future safe approved source-control operations are implemented.
- Qualification inspects and orchestrates existing boundaries; it intentionally does not add coding capability.
