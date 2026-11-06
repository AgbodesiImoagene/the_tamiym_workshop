# TTW-116 — Add the missing admin alerts

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 10.8, Missing admin alerts for pending actions** (Medium, P1, 4–6 h, status "To do"): Organiser application, bank account to verify, appeal, AI-flagged image, delivery incident, failed email.

## Proposal

- Add admin notification events for the cases the review lists: organiser application, bank account to verify, appeal, AI-flagged image, delivery incident, failed email.
- Reduce the noise of the alert sent for each new design if a digest is simple to add.

## Invariants

- An event fires once per occurrence.

## Implementation plan

1. Start `codex/ttw-116-add-missing-admin-alerts` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit and integration: each event is emitted once.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/admin-notifications/admin-notification-events.ts` — row 10.8
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] Each listed case reaches the admins through the configured channels.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
