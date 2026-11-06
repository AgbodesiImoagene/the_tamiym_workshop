# TTW-097 — Complete shipping zone and rate administration

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None\
**Blocks:** TTW-098

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 8.2, Shipping zones cannot be corrected** (Medium, P1, 6–10 h, status "To do"): A rate cannot be edited or deleted, a state cannot be removed from a zone, a zone cannot be deleted.

## Proposal

- Wire the admin screens to the existing `PATCH` and `DELETE` routes for rates, rules and zones in `admin-shipping.controller.ts`.
- Removing a state or LGA from a zone has no route today: add it.
- Confirm before deleting anything, and audit the changes.

## Invariants

- Editing a rate never changes an existing order.
- Admins are warned before a change leaves a state uncovered.

## Implementation plan

1. Start `codex/ttw-097-complete-shipping-zone-administration` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: update and delete with authorization.
- Playwright: fix a rate and remove a state from a zone.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `PATCH/DELETE /v1/admin/shipping-rates/{id} not called` — row 8.2
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] An admin can correct every zone and rate mistake from the screen.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
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
