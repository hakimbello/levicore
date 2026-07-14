# Levi Constitution

## Purpose

This document defines non-negotiable rules for building Levi Core.

## 1. Scope Lock

- Build only approved requirements in PRD.md and MVP_SCOPE.md.
- Do not add features during implementation.
- Do not expand architecture without an approved requirement.
- Do not perform unrelated cleanup or refactoring.
- New ideas remain outside the build until the MVP reaches 100 percent.

## 2. Source of Truth

The controlling documents are:

1. LEVI_CONSTITUTION.md
2. PRD.md
3. MVP_SCOPE.md
4. ARCHITECTURE.md
5. PLAN.md
6. AI_RULES.md

Conversation ideas do not become requirements until added to these documents and approved.

## 3. No Silent Assumptions

- Unknown information must be marked UNKNOWN.
- Any proposed assumption must be marked ASSUMPTION REQUIRES APPROVAL.
- No assumption enters code without approval.
- Never invent files, APIs, tables, dependencies, tests, or completed work.

## 4. Evidence Before Claims

- Never claim a file exists without checking.
- Never claim code works without validation.
- Never claim a command passed without running it.
- Never report completion while acceptance criteria remain open.

## 5. Small Safe Changes

- One approved task at a time.
- Change only required files.
- State regression risk before shared-code changes.
- Preserve working behavior unless the approved task requires a change.

## 6. External Components

- Existing open-source components are preferred when they reduce build time.
- Every external component must pass license, maintenance, security, replacement, and architecture review.
- External components must sit behind Levi-owned interfaces.
- Levi must remain replaceable at every vendor and model boundary.

## 7. User Control

- Users own their project data and project memory.
- Irreversible actions require explicit approval.
- Model choice must remain replaceable.
- Local-first operation is preferred where quality is sufficient.

## 8. Completion Standard

MVP completion requires:

- Every approved requirement implemented.
- Every acceptance criterion passed.
- Required tests passed.
- Security checks passed.
- Documentation matches behavior.
- No open launch blockers.
- No partially completed task counted as complete.

## 9. Expansion Rule

New features, integrations, product directions, and monetization expansions are reviewed only after the approved MVP reaches 100 percent.
