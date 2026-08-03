# Levi Desktop — Version 1 Feature Freeze

**Version:** 0.1.0  
**Feature freeze date:** 2026-08-03  
**Milestone:** P2-017-04 (final engineering gate before Version 1)

---

## Freeze Scope

Version 1.0 engineering is **frozen**. No new product features, architecture changes, or roadmap expansion are permitted for the 0.1.0 release candidate. Only release correctness fixes and signing/distribution gates remain.

---

## Deferred Features (Post–V1.0)

These items were identified during P2-017 audits and are explicitly **not** in Version 1:

| Feature | Rationale |
|---------|-----------|
| Authenticode-signed public installer | Blocked on certificate provisioning; infrastructure ready |
| Full interactive installed-app CDP matrix on managed hosts | Blocked by Application Control on qualification host; manual VM gate |
| Upgrade-over-distinct-prior-binary qualification | Requires earlier tagged installer artifact |
| Per-chat model picker UI | Default/runtime-selected models sufficient for V1 |
| Persistent cross-session execution history store | Session-capped history acceptable for V1 |
| In-app validation command runner after edits | User runs tests via terminal/tasks manually |
| Portable Windows build | NSIS installer + unpacked dir sufficient for V1 |
| Real browser qualification in Vitest | Electron Chromium not available in main-process test env |
| Real DAP js-debug E2E (when adapter not installed) | Skipped when `@vscode/js-debug` absent in fixture |
| GitHub published auto-update feed verification | Requires draft release publish + `GH_TOKEN` |
| Dependency source-map stripping in bundled node_modules | Non-blocking packaging hygiene |
| Desktop shortcut in silent NSIS installs | Interactive installer flow only |

---

## Version 2 Roadmap (High Level — Not Committed)

Version 2 planning is **out of scope** for P2-017-04. The following themes are recorded for future product planning only:

1. **Signed public distribution** — Authenticode signing, SmartScreen trust, CI signing pipeline
2. **Update channel** — Published GitHub release feed with verified electron-updater end-to-end qualification
3. **Source control UI** — In-app Git status, diff, stage, and commit beyond agent-proposed flows
4. **Model UX** — Explicit model selection and runtime profiles per conversation/agent session
5. **History and persistence** — Durable execution history and expanded settings diagnostics
6. **Accessibility and layout** — Formal keyboard navigation audit and responsive layout qualification
7. **Cross-platform packaging** — macOS and Linux targets when Windows V1 is stable
8. **Expanded browser automation** — Controlled non-localhost policies if threat model allows

No Version 2 work begins until Version 1 internal beta feedback is collected.

---

## Known Technical Debt

| Area | Debt | Severity |
|------|------|----------|
| Packaging | OneDrive locks `release/` on synced workspaces | Low — use temp output |
| Packaging | Dependency source maps in bundled `node_modules` | Low |
| Packaging | Expanded `node-pty` unpack footprint | Low |
| Tests | `package-hygiene.test.ts` timeout flake under parallel Vitest load | Low — passes with `--no-file-parallelism` |
| Tests | Transient 5s timeout flakes on git/adapter tests under load | Low |
| Security | Terminal accepts arbitrary user shell input (by design) | Medium — document threat model |
| Security | Log redaction not exhaustively audited across all error paths | Medium |
| Debugger | Real js-debug qualification environment-dependent | Medium |
| Browser | Real browser E2E not automated in Vitest | Medium |
| Distribution | Final RC artifacts live outside repo in `%TEMP%` | Low — checksums documented |

---

## Release Engineering Artifacts (Frozen)

| Document | Purpose |
|----------|---------|
| `V1_RELEASE_CHECKLIST.md` | Master release gate checklist |
| `SIGNING_READY.md` | Signing configuration verification |
| `CHANGELOG_V1.md` | Version 1 release notes |
| `FIRST_RUN.md` | User onboarding |
| `RELEASE_DECISION.md` | Final release decision |
| `release-v1/` | Distribution manifest, checksums, license |

---

## Version Identifier

- **npm/package version:** `0.1.0`
- **electron-builder appId:** `dev.levicore.desktop`
- **Product name:** Levi
- **Executable:** `Levi.exe`
