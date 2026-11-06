# TTW-096 — Apply product, variant and order discounts

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-095\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 8.1, Discounts only apply to campaigns** (High, P1, 10–16 h, status "To do"): Product, variant or order discounts have no effect; code, minimum order and usage limit are never checked.

Client answers:

- **Q37, Discounts: which ones at launch (per product, whole order, promo codes, campaigns)? Stackable or not?** Answer: "I think this is already implemented as stackable at different scopes. Please confirm."

Q37 settles the rule: discounts stack across scopes, as the client describes. Their belief that this already works is wrong, because only campaign discounts take effect today (row 8.1). The client is being told, so this ticket does not wait for a reply.

## Proposal

- Apply the discount scopes the admin screen offers, and enforce the minimum order and the usage limit, including on campaign discounts.
- Enforce usage limits with a conditional database update, not a pre-read.
- Discounts stack across scopes (Q37). Define the calculation order at design review, and update `docs/pricing-strategy.md`.

## Invariants

- A discount cannot exceed its usage limit under concurrent orders.
- Price floors still hold.
- An order keeps its frozen discount snapshot.

## Implementation plan

1. Start `codex/ttw-096-apply-product-and-order-discounts` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Generate the migration with `pnpm --filter api exec prisma migrate dev --name <name>`, after checking that no other open ticket has one in flight.
8. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: each scope, minimum, expiry and stacking.
- Integration on real Postgres: concurrent orders at the usage limit.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/pricing/pricing.service.ts:526` — row 8.1
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A discount created in admin changes the customer price as configured.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Customer-entered promo codes: refused for launch (Q12).

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
