# TTW-052 — Reconcile project documentation with verified reality

**Epic:** 5 — Contracts, observability and release proof  
**Status:** In progress (slice 1)
**Risk:** Standard  
**Blocked by:** None  
**Blocks:** TTW-054

## Background

The repository is materially ahead of several state documents while remaining behind some release claims. `docs/00-package-state.md` calls all frontends scaffolds/default starter pages and says application OpenTelemetry is not wired, despite substantial routes and active instrumentation. The main milestone checklist leaves implemented auth, catalog, workshop, admin, analytics and other capabilities unchecked while marking lint/pre-commit/CI foundations complete even though current gates fail. Deployment and readiness documents also repeat overlapping, sometimes stale status claims. This makes scope, acceptance and production decisions unreliable.

## Proposal

Establish one evidence-backed status taxonomy—Not started, Partial, Implemented-unverified, Verified and Release-ready—and reconcile the README, package snapshot, PRD traceability, backend readiness, deployment and release-criteria documents against code and executable evidence. Separate product requirement, implementation presence, verification and release approval so a checked feature cannot imply more than was proven. Replace duplicate narrative backlogs with links to the ticket index, retain domain docs for durable decisions, and add lightweight automated checks for internal links, ticket references and documented commands.

## Invariants

- No capability is marked Verified without a passing command/test or precise file-and-line evidence.
- Implemented, verified and release-ready remain distinct states; unresolved critical/high tickets are visible wherever release status is summarized.
- The PRD and approved business/design decisions are not silently rewritten to match current code.
- Historical dates and targets are labelled as historical rather than presented as current commitments.
- Durable architecture/domain decisions remain documented; volatile task status points to `docs/tickets/README.md` instead of being copied across files.
- Documentation commands and paths are executable from the repository state they describe.

## Implementation plan

1. Build a source map for every state or readiness claim across root/project docs, identifying its authority, evidence and duplicate locations.
2. Inventory current routes, modules, schema domains, tests, CI/deployment artefacts and known ticket blockers using reproducible commands; record the snapshot date and revision.
3. Approve the status taxonomy and evidence rules, then apply them to the milestone checklist and PRD traceability matrix without changing PRD intent.
4. Rewrite `docs/00-package-state.md` from the current package/app reality and correct stale setup, OpenTelemetry, database-script and frontend statements.
5. Reconcile `docs/03-backend.md`, `docs/09-observability-otel.md`, `docs/10-deployment-and-environments.md`, `docs/backend-production-readiness.md` and `docs/release-criteria.md`; replace duplicated actionable backlog items with ticket links and preserve operational/domain guidance.
6. Add a concise documentation ownership/index section naming the PRD, architecture decisions, current status, backlog, test strategy and release checklist sources of truth.
7. Add CI checks for broken internal links, missing ticket targets and invalid documented local commands; document review cadence and the requirement that behaviour tickets update affected state/traceability rows.

## Test and observability plan

- Unit/component: Test any route/status inventory or documentation-validation scripts with valid, stale and broken fixtures.
- Integration/e2e: Run the documented install, typecheck, test, build, database and observability commands that are claimed as current; validate all relative links and ticket IDs.
- Failure, retry, and concurrency: Prove broken links, missing ticket files, unknown status values and demonstrably stale generated inventory fail the documentation check with file/line context.
- Logs, metrics, traces, and alerts: CI publishes a concise documentation-validation report; no runtime telemetry changes are expected.

## References

- `docs/00-package-state.md:7-25,68-123` — frontends and OpenTelemetry are described as scaffolds/unwired.
- `docs/README.md:145-230` — milestones conflict with implemented features and current quality-gate evidence.
- `docs/99-prd-traceability.md` — maps requirements to folders but not implementation/verification/release status.
- `docs/10-deployment-and-environments.md:81-100` — deployment gaps remain accurate but overlap other readiness lists.
- `docs/backend-production-readiness.md` — detailed readiness narrative and duplicated actionable backlog.
- `docs/release-criteria.md` — checklist contains claims that require reconciliation with current audit findings and ticket dependencies.
- `docs/tickets/README.md` — canonical ordered delivery backlog.

## Acceptance criteria

- [ ] README milestones and PRD traceability use the approved status taxonomy and cite current evidence for every Verified item.
- [ ] Package, backend, observability and deployment documents describe the current applications, scripts, modules and infrastructure without the identified contradictions.
- [ ] One documented source owns each volatile status/backlog claim; other documents link to it rather than copying it.
- [ ] Every unresolved release blocker links to a ticket or is explicitly identified as a decision needed before ticketing.
- [ ] Historical delivery dates are clearly labelled and no longer imply an active commitment.
- [ ] Automated documentation checks reject broken internal links, missing ticket references and stale generated inventory where generation is used.
- [ ] Standard design and independent implementation reviews pass with exact evidence recorded below.

## Out of scope

- Implementing or declaring complete any missing product behaviour → owning TTW domain ticket.
- Generating and gating API contracts → TTW-050.
- Approving new business, release or infrastructure policy; undecided policy remains explicit and links to its owning ticket.

## Design review

**Reviewer:** Implementing agent (slice 1)
**Date:** 2026-08-22
**Verdict:** Approved for slice 1 implementation

### Status taxonomy (approved)

| Status                     | Meaning                                  | Evidence required                                   |
| -------------------------- | ---------------------------------------- | --------------------------------------------------- |
| **Not started**            | No meaningful implementation             | N/A                                                 |
| **Partial**                | Some behaviour exists; gaps remain       | Describe what exists and what is missing            |
| **Implemented-unverified** | Code paths exist; ticket may be Complete | Point to modules/routes; do not claim release proof |
| **Verified**               | Behaviour proven                         | Command output, test name, or file:line citation    |
| **Release-ready**          | Verified and no unresolved P0/P1 blocker | Ticket link or explicit decision record             |

Ticket backlog rows (`Complete`, `Scoped`, `Deferred`, `In progress`) remain the delivery-tracking vocabulary in `docs/tickets/README.md`. Milestone and package-state docs map Complete tickets to **Implemented-unverified** unless verification evidence is cited.

### Document authority map (slice 1)

| Claim type                      | Owner                                                     |
| ------------------------------- | --------------------------------------------------------- |
| Product scope                   | PRD + `99-prd-traceability.md`                            |
| Delivery backlog / ticket state | `docs/tickets/README.md`                                  |
| Package inventory               | `docs/00-package-state.md`                                |
| Milestone orientation           | `docs/README.md` (links to tickets; not a second backlog) |
| Test strategy                   | `docs/12-testing-strategy.md`                             |
| Release checklist               | `docs/release-criteria.md`                                |

### Validation approach (slice 1)

- `scripts/quality/validate-documentation.mjs` checks relative `docs/` links, ticket link targets, and backlog state values.
- CI job `Documentation` runs `pnpm docs:validate` and `pnpm docs:validate:test`.
- Slice 1 reconciles `00-package-state.md`, milestone checklist, and observability cross-links only.

### PRD-preservation check

- No PRD business intent changed; milestone updates cite ticket evidence and use **Implemented-unverified** where verification is not recorded.

## Implementation reviews

Record each independent review iteration, contradictions found, fixes, link/command evidence, dimension verdicts and overall verdict.

## Verification evidence

Record the repository revision and snapshot date, inventory commands, internal-link/ticket validation, sampled documented-command results and the before/after contradiction matrix.

## Completion summary

Summarize reconciled sources, taxonomy, removed duplication, remaining unverified capabilities, documentation automation and follow-up owners.
