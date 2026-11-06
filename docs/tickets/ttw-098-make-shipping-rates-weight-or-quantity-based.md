# TTW-098 — Make shipping rates configurable by weight or quantity

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-097, TTW-086\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 5.7, Same shipping fee for 1 or 100 items** (High, P1, 6–10 h, status "To do"): Flat fee per zone; total weight is computed but never used.

Client answers:

- **Q21, Shipping rates: flat per zone, or by weight or quantity? Free shipping above an amount?** Answer: "Isn’t this configurable today? If not it should be."

## Proposal

- Per Q21, shipping rates must be configurable: keep the flat fee and add optional weight or quantity brackets per rate, configurable by admins.
- Use the total weight that `pricing.service.ts` already computes.

## Invariants

- Existing flat rates give the same fee.
- The shipping breakdown stays frozen on each order.

## Implementation plan

1. Start `codex/ttw-098-make-shipping-rates-weight-or-quantity-b` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Generate the migration with `pnpm --filter api exec prisma migrate dev --name <name>`, after checking that no other open ticket has one in flight.
8. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: flat rate, brackets, boundaries and missing product weight.
- Playwright: an admin sets a bracket and a large order pays more.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/pricing/pricing.service.ts:1005` — row 5.7
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] One item and 100 items can have different shipping fees when an admin configures it.
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
