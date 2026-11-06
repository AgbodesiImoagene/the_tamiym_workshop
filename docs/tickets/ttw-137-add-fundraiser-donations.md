# TTW-137 — Add donations to fundraiser checkout

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Critical\
**Blocked by:** TTW-136; client decision on Q23 and Q25\
**Blocks:** None

## Background

> Check first that the client kept fundraising before launch (Q23, Q25). If it moved, this ticket waits.

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 4.5, Donations missing** (High, P1, 40–60 h, status "Optional (client decision)"): Figma "Buy/Donate" and "Add Donation": no API or screen. Touches payments (critical risk area).

Client answers:

- **Q13, Free donations in the fundraiser checkout: confirmed? Do they go 100% to the cause?** Answer: "Yes and yes."

## Proposal

- Add "Buy/Donate" and "Add Donation" from Figma.
- Donations go 100% to the cause (Q13). Settle at design review who bears the Paystack fee on a donation, since Q13 does not answer that.

## Invariants

- A donation is credited once, under duplicate webhooks.
- Donations are separate from product revenue in the ledger.
- VAT treatment is confirmed before release.

## Implementation plan

1. Start `codex/ttw-137-add-fundraiser-donations` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Generate the migration with `pnpm --filter api exec prisma migrate dev --name <name>`, after checking that no other open ticket has one in flight.
8. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration on real Postgres: donation only and donation with products, duplicates, refund.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- No donation code — row 4.5
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A supporter can donate with or without buying.
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
