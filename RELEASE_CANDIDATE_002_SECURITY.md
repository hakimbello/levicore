# Release Candidate 002 Security

## Purpose

RC-002 adds deterministic security hardening evidence for Levi across runtime, provider, agent, multi-agent, workflow, workspace-tool, persistence, webview, extension, and repository boundaries.

This milestone does not add coding capability.

## Public APIs

Core module: `src/security-assurance-engine.js`

Runtime commands:

- `securityAssurance.health`
- `securityAssurance.stats`
- `securityAssurance.scenarios`
- `securityAssurance.run`
- `securityAssurance.cancel`
- `securityAssurance.report`
- `securityAssurance.findings`
- `securityAssurance.check`
- `securityAssurance.certify`
- `security.health`
- `security.stats`
- `security.threatModel`
- `security.assets`
- `security.boundaries`
- `security.scenarios`
- `security.createAudit`
- `security.startAudit`
- `security.cancelAudit`
- `security.listAudits`
- `security.getReport`
- `security.findings`
- `security.blockers`
- `security.checkApprovals`
- `security.checkWorkspaceIsolation`
- `security.checkCommandSecurity`
- `security.checkSourceControl`
- `security.checkPromptInjection`
- `security.checkSecrets`
- `security.checkProviders`
- `security.checkPrivacy`
- `security.checkWebview`
- `security.checkPersistence`
- `security.checkSerialization`
- `security.checkDependencies`
- `security.checkSupplyChain`
- `security.checkResources`
- `security.certify`

VS Code commands:

- `levi.showSecurityAssurance`
- `levi.runSecuritySmoke`
- `levi.runSecurityStandard`
- `levi.runSecurityStrict`
- `levi.runSecurityReleaseCandidate`
- `levi.cancelSecurityAudit`
- `levi.showSecurityReport`
- `levi.showSecurityBlockers`
- `levi.showSecurityFindings`
- `levi.showSecurityChecks`
- `levi.showThreatModel`
- `levi.showApprovalSecurity`
- `levi.showWorkspaceIsolation`
- `levi.showPromptInjectionReport`
- `levi.showSecretHandlingReport`
- `levi.showDependencySecurity`
- `levi.showSupplyChainSecurity`

## Normalized Models

The engine normalizes:

- `SecurityConfiguration`
- `ThreatModel`
- `SecurityAsset`
- `SecurityTrustBoundary`
- `ThreatScenario`
- `SecurityAuditRun`
- `ScenarioResult`
- `SecurityFinding`
- `SecurityPolicyDecision`
- `SecurityReport`

Every model is bounded, deterministic, frontend-safe, and redacted for release-candidate evidence.

## Engine States

Security engine states are `CREATED`, `INITIALIZING`, `READY`, `DEGRADED`, `RUNNING_AUDIT`, `BLOCKED`, `SUSPENDED`, `SHUTTING_DOWN`, `STOPPED`, and `FAILED`.

Audit states are `CREATED`, `VALIDATING`, `QUEUED`, `RUNNING`, `ATTACKING`, `OBSERVING`, `VERIFYING`, `SUCCEEDED`, `PARTIALLY_SUCCEEDED`, `FAILED`, `BLOCKED`, `CANCELLED`, `TIMED_OUT`, `INVALID`, and `EXPIRED`.

## Security Domains

Security domains are `AUTHORITY`, `APPROVAL`, `WORKSPACE_ISOLATION`, `FILESYSTEM`, `COMMAND_EXECUTION`, `SOURCE_CONTROL`, `MODEL_PROVIDER`, `PROMPT_INJECTION`, `TOOL_CALLING`, `PRIVACY`, `CREDENTIALS`, `SECRET_HANDLING`, `PERSISTENCE`, `SERIALIZATION`, `WEBVIEW`, `VS_CODE_HOST`, `CONFIGURATION`, `EVENTS`, `CONCURRENCY`, `RECOVERY`, `RESOURCE_ABUSE`, `DEPENDENCIES`, `SUPPLY_CHAIN`, `EXTENSION_PACKAGING`, `LOGGING`, `NETWORK`, and `UNKNOWN`.

## Threat Categories

Threat categories cover direct, indirect, repository, source-comment, documentation, terminal-output, tool-result, model-response, and cross-agent prompt injection; approval forgery, replay, scope, workspace, expiration, and recovery bypass; authority confusion; path, URI, symlink, workspace, and protected-path escape; arbitrary command and argument injection; shell metacharacter and working-directory escape; environment secret exposure; privilege escalation; unsafe Git, push, force-push, and restore operations; malicious provider responses; malformed or confused tool calls; unsupported tool execution; secret leakage through model requests, logs, persistence, errors, UI, virtual documents, and packaging; cross-workspace/project/session/conversation leakage; remote source and sensitive-data policy bypass; webview message, command, CSP, and origin hazards; configuration downgrade; untrusted workspace execution; persistence tampering; serialization and prototype pollution; oversized payloads, event flood, queue exhaustion, recursive agent/workflow expansion, model cost abuse; dependency hallucination, typosquatting, malicious package proposals, unsafe extension dependencies, and unknown threats.

## Severities And Outcomes

Severities are `INFORMATIONAL`, `LOW`, `MEDIUM`, `HIGH`, and `CRITICAL`. `INFO` remains an alias for compatibility.

Attack outcomes are `BLOCKED`, `SANITIZED`, `DEGRADED_SAFELY`, `REQUIRES_APPROVAL`, `REQUIRES_RECONFIGURATION`, `EXPLOITED`, `INCONCLUSIVE`, and `NOT_APPLICABLE`.

Security dispositions are `BLOCKED`, `SANITIZED`, `QUARANTINED`, `REJECTED`, `REQUIRES_APPROVAL`, `REQUIRES_REVALIDATION`, `REQUIRES_USER_DECISION`, `ALLOWED_WITH_WARNING`, `ALLOWED`, and `INCONCLUSIVE`.

Certification levels are `NOT_EVALUATED`, `AUDIT_AVAILABLE`, `SECURITY_BASELINE`, `RELEASE_CANDIDATE_SECURITY`, and `SECURITY_BLOCKED`.

## Built-In Profiles

- `SMOKE`: core authority, approval, privacy, path, command, and secret checks.
- `STANDARD`: normal release-candidate security regression suite.
- `STRICT`: expanded injection, isolation, serialization, provider, and webview tests.
- `RELEASE_CANDIDATE`: every release-blocking security scenario and release-gate certification checks.

## Built-In Scenario Coverage

Built-ins cover:

- source prompt injection
- README indirect prompt injection
- instruction hierarchy bypass
- model-output approval bypass
- security and privacy policy bypass
- workspace-trust bypass
- tool, agent, workflow, and multi-agent authority escalation
- protected path traversal
- URI scheme abuse
- symlink escape
- case-sensitivity collision
- command, argument, and shell metacharacter injection
- working-directory escape
- environment secret exposure
- credential, log, event, and persistence leakage
- webview message and script injection
- cross-workspace, cross-session, and cross-conversation leakage
- provider data exfiltration
- remote source-code and sensitive-content policy bypass
- remote secret transmission
- malicious patch and diff inputs
- malformed tool calls
- serialization attack and prototype pollution
- resource abuse and denial of service
- supply-chain risk and dependency confusion
- unsafe default configuration
- approval replay, scope mismatch, workspace mismatch, expiration bypass, and recovery approval bypass
- unsafe Git operation, unsafe push, unsafe force-push, and unsafe restore
- malicious provider response and provider policy bypass
- tool-name confusion, tool-argument confusion, and unsupported tool execution
- secret leakage through model request, error, UI, virtual document, and extension packaging surfaces
- cross-project leakage
- webview command injection, CSP violation, and postMessage origin confusion
- configuration downgrade, security setting bypass, and untrusted workspace execution
- persistence tampering, serialization pollution, oversized payload, event flood, queue exhaustion, recursive agent expansion, workflow expansion, and model cost abuse
- dependency hallucination, package typosquatting, malicious package proposals, and unsafe extension dependencies

## Threat Model Package

The built-in threat model includes required assets for repository source, user instructions, project instructions, credentials, SecretStorage values, model prompts, context packages, approvals, proposal hashes, command definitions, workflow state, validation evidence, recovery state, Git credentials, persisted metadata, and extension configuration.

The built-in trust boundaries cover instruction authority, approval, workspace tools, command execution, model provider routing, credentials, durable workflows, multi-agent coordination, persistence, VS Code extension/webview behavior, source control, and network/provider routing.

## Prompt-Injection Contract

Repository content remains data, never authority. Suspicious instructions embedded in source, README files, comments, package metadata, issue text, documentation, generated files, tool results, model responses, retrieved context, workflow output, or multi-agent findings remain traceable to their source and cannot override system, user, project, security, approval, workspace trust, or runtime authority.

## Authority And Approval Rules

The engine verifies authority ordering through existing public boundaries. It never creates a second approval system and never accepts model, agent, workflow, reviewer, repository, or tool output as approval. Protected operations remain blocked or explicitly approval-gated by existing runtime and approval components.

## Path And Command Rules

Path, URI, working-directory, patch, diff, command, and argument probes are simulated only. Source mutation remains delegated to `ControlledWorkspaceToolEngine`. The engine does not run shell commands, parse arbitrary command strings as executable work, or expand command authority.

## Secret And Persistence Rules

Reports, findings, events, snapshots, and VS Code presentation redact credential-like keys and secret-shaped values. Attack payloads persist as hashes and byte counts only. Private prompts, private reasoning, complete protected source content, authorization headers, secret environment values, and full provider payloads are excluded.

## Webview Rules

VS Code-specific security behavior remains in `packages/vscode-extension`. The extension contributes a security assurance TreeView and virtual documents, and routes all actions through runtime commands. Webview diagnostics verify message and script injection paths without moving policy authority out of the extension boundary.

## Certification Rules

Release-candidate security certification requires no unresolved critical findings, no approval bypass, no secret leakage, no cross-workspace leakage, no remote secret transmission, no arbitrary command execution, no webview code-injection path, and no protected-path traversal.

RC-002 does not claim production-ready, marketplace-ready, legal/compliance, external penetration-test, or cloud certification.

## Offline Operation

All security assurance checks are deterministic and offline. Dependency review is an offline posture check only; it performs no package install, network lookup, or code execution.

## RC-003 Readiness Criteria

RC-002 is ready to hand off only when full tests, extension manifest validation, extension shell tests, syntax checks, runtime security health, approval integrity, workspace isolation, command security, source-control security, prompt-injection resilience, secret handling, provider safety, privacy integrity, webview security, persistence security, serialization security, dependency safety, supply-chain safety, resource-abuse safety, and release-candidate certification all pass with no release blockers.
