# Levi Core OSS Evaluation

## Evaluation Status

Status: COMPLETE

No open-source component is integrated by this document. All adoption decisions remain subject to the adapter boundaries defined in ARCHITECTURE.md.

## Evaluation Criteria

Each candidate is scored from 1 to 5.

- 1: poor fit or high risk.
- 3: usable with constraints.
- 5: strong fit and low risk.

Criteria:

- License
- Maintenance
- Security
- Architecture fit
- Integration effort
- Replacement difficulty

## Candidate Decisions

| Candidate | Intended role | License | Maintenance | Security | Architecture fit | Integration effort | Replacement difficulty | Decision |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| SQLite | Structured state store | 5 | 5 | 5 | 5 | 5 | 4 | ADOPT |
| Tree-sitter | Source parsing adapter foundation | 5 | 5 | 4 | 5 | 4 | 4 | ADOPT |
| Vercel AI SDK | Model gateway candidate | 5 | 5 | 4 | 4 | 4 | 4 | STUDY |
| LanceDB | Local vector store candidate | 4 | 4 | 4 | 4 | 3 | 3 | STUDY |
| Chroma | Vector store candidate | 4 | 4 | 4 | 3 | 3 | 3 | STUDY |
| OpenAI Codex CLI | Coding executor candidate | 4 | 4 | 4 | 4 | 3 | 3 | STUDY |
| Continue | Coding executor candidate | 4 | 4 | 4 | 3 | 2 | 3 | REJECT FOR MVP |
| LangChain | Agent and orchestration framework | 4 | 5 | 3 | 2 | 2 | 2 | REJECT FOR MVP |

## Adopt Decisions

### SQLite

Decision: ADOPT for local structured state.

Rationale:

- Matches the architecture direction for local-first structured state.
- Keeps project state inspectable, portable, and replaceable.
- Avoids an external service during MVP.
- Replacement can be contained behind ProjectStore and MemoryStore interfaces.

Constraints:

- Domain logic must not depend on SQLite APIs directly.
- Schema changes must be explicit and validated.
- SQLite does not approve any M1 implementation by itself.

### Tree-sitter

Decision: ADOPT as the source parsing adapter foundation.

Rationale:

- Matches the architecture direction for deterministic source parsing.
- Supports multi-language repository analysis without relying on model inference.
- Replacement can be contained behind the SourceParser interface.

Constraints:

- Parsing output remains untrusted until converted into cited project facts.
- Unsupported languages must produce UNKNOWN rather than invented facts.
- No parser integration occurs during M0.

## Study Decisions

### Vercel AI SDK

Decision: STUDY for LC-MVP-006 model gateway implementation.

Rationale:

- TypeScript fit is strong.
- Provider abstraction may reduce model-specific coupling.
- Final adoption requires proof that Levi can enforce routing, cost class, limits, fallback, and audit records through a Levi-owned ModelGateway interface.

### LanceDB

Decision: STUDY for local vector storage.

Rationale:

- Local vector storage may support project memory and retrieval without a managed service.
- Final adoption requires validation of Node.js support, metadata filtering, persistence behavior, and replacement boundaries.

### Chroma

Decision: STUDY as an alternative vector storage candidate.

Rationale:

- Useful comparison point for retrieval behavior and integration effort.
- Final adoption requires validation that it does not force unnecessary service complexity into the MVP.

### OpenAI Codex CLI

Decision: STUDY as a coding executor candidate.

Rationale:

- It may fit LC-MVP-007 if invoked through a controlled external-process adapter.
- Final adoption requires validation of repository boundary enforcement, deterministic reporting, approval handling, and failure capture.

## Reject Decisions

### Continue

Decision: REJECT FOR MVP as a coding executor foundation.

Rationale:

- Product focus is IDE assistance, while Levi MVP requires a constrained CLI-first execution boundary.
- Integration effort is higher than the approved MVP needs.
- Reconsideration is allowed after CLI executor requirements are complete.

### LangChain

Decision: REJECT FOR MVP as an orchestration foundation.

Rationale:

- Levi Core already owns workflow, policy, state, planning, validation, and reporting.
- A broad orchestration framework would increase replacement difficulty and blur ownership boundaries.
- Narrow libraries may still be evaluated later if tied to a specific approved requirement.

## M0 Outcome

- SQLite is approved for structured local state.
- Tree-sitter is approved for deterministic source parsing.
- Vercel AI SDK, LanceDB, Chroma, and OpenAI Codex CLI remain study candidates.
- Continue and LangChain are rejected for MVP foundations.
- No M1 implementation is authorized by this evaluation.
