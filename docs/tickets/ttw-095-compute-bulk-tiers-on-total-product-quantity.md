# TTW-095 — Compute bulk tiers on a product's total quantity

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-094\
**Blocks:** TTW-240, TTW-096

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 8.5, Bulk price tier computed per size, not on the total** (High, P1, 4–8 h, status "To do"): 20 S + 20 M + 20 L get the "20 pieces" price, not the "60 pieces" price.

Client answers:

- **Q38, Bulk tiers: computed on a product's total quantity across sizes and colours? Do larger sizes keep a surcharge?** Answer: "Context please."

Q38 asked for more context. Decision by the user, 2026-11-21: **no need to consult the client again.** The default below is the rule, and Q38 was removed from the client message.

## Proposal

- Compute the tier on the total quantity of a product across sizes and colours, and keep size surcharges on top. A tier price replaces the base price; the size upcharge and the view surcharge are added after it.
- Example: 20 S + 20 M + 20 L at tiers "1–19 = ₦5,000, 20–49 = ₦4,500, 50+ = ₦4,000" and L +₦300: S and M cost ₦4,000, L costs ₦4,300.
- Two products in one cart stay separate: each reads its own total.
- Not in this ticket: a variant's own price difference on top of the tier → TTW-240 (decided 2026-11-21).
- Update `docs/pricing-strategy.md`.

## Invariants

- The same cart always gives the same price.
- Standard and campaign pricing keep their existing floors.

## Implementation plan

1. Start `codex/ttw-095-compute-bulk-tiers-on-total-product-quan` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: 20 S + 20 M + 20 L uses the 60-piece tier; a mix of two products stays separate; XXL keeps its surcharge.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/pricing/pricing.service.ts:492` — row 8.5
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] The example from the review gets the 60-piece price.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- A product-level tier replacing a dearer variant price → TTW-240.
- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
