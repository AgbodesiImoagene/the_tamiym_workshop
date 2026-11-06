# TTW-138 — Add campaign delivery options

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-131; client answer Q18 (default in Proposal); client decision on Q23 and Q25\
**Blocks:** None

## Background

> Check first that the client kept fundraising before launch (Q23, Q25). If it moved, this ticket waits.

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 5.4, No delivery options for a campaign** (High, P1, 15–25 h, status "To do"): Ship to each supporter, bulk ship to the organiser or pickup: in the PRD, missing from the model.

Client answers:

- **Q18, Campaign delivery: to each supporter, bulk to the organiser, or pickup at the workshop? Who pays for delivery?** Answer: "Another good question for the owner. I suspect to each supporter, but I’ll confirm."

## Proposal

- Default until Q18 is answered: delivery to each supporter, which the client expects.
- Add the other options (bulk to organiser, pickup) only if the owner confirms them.

## Invariants

- The shipping cost is covered in the production cost (ticket TTW-131).

## Implementation plan

1. Start `codex/ttw-138-add-campaign-delivery-options` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Generate the migration with `pnpm --filter api exec prisma migrate dev --name <name>`, after checking that no other open ticket has one in flight.
8. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: each confirmed option through checkout.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- Campaign model (schema.prisma) — row 5.4
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] An organiser can choose the confirmed delivery options.
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
