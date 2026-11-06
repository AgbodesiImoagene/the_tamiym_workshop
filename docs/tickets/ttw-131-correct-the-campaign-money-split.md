# TTW-131 — Correct the campaign money split

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Critical\
**Blocked by:** TTW-129; client answer Q36; client decision on Q34; client decision on Q23 and Q25\
**Blocks:** TTW-132, TTW-133, TTW-134, TTW-136, TTW-138, TTW-141, TTW-144, TTW-152

## Background

> Check first that the client kept fundraising before launch (Q23, Q25). If it moved, this ticket waits.

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 6.2, Campaign money split is wrong** (Critical, P0, 25–40 h, status "To do"): The campaign is credited with the full amount paid (shipping and VAT included). The production cost is computed but never deducted: the organiser would receive 100% of sales.
- **Row 6.14, Campaign discounts: who bears them?** (Medium, P0, 0–0 h, status "Included in 6.2"): To be settled together with the money split (6.2).
- **Row 7.6, Paystack transfer fees and account prerequisites** (Medium, P0, 0–0 h, status "Info / decision"): Fees not handled; Transfers must be enabled, OTP disabled for API transfers, balance funded.

Client answers:

- **Q1, Organiser share: are shipping and VAT excluded from it?** Answer: "Production costs should include shipping and VAT. As much as possible we should try to show this (or an estimate to the campaign organiser when they select the price so they can price above it."
- **Q2, Paystack fees (about 1.5% + ₦100 per payment): who bears them?** Answer: "For our products the transaction fees are priced in. Should be same for fundraisers, but transparently, meaning the fundraiser sets the final price with an estimate of what they should receive per product."
- **Q3, Does the platform take a commission on top of the production cost?** Answer: "For fundraisers no. Production costs here includes our standard margin, so we’d be making a profit like with any other product sale, unless a campaign discount is applied. In the future when we support “shops” then we can take a fixed payment regardless of sales on top of the per product margins."
- **Q4, "Raised" amount shown on the public page: gross or net for the cause?** Answer: "Should we show both? I’d say net for the purposes of transparency but this must be transparent at every step of the way."
- **Q31, Discount on a campaign: deducted from the organiser's share, or borne by the workshop?** Answer: "Borne by workshop."
- **Q34, Paystack transfer fees to the organiser: deducted from the payout, or borne by the workshop?** Answer: "Good one. Leaning towards deduct from organiser. If calculable per unit ahead of time bake into transparent pricing upmark."
- **Q36, Paystack account: are Transfers enabled? Who funds the balance?** Answer: "Context please."

Q36 asks for more context. Check with the client that Transfers are enabled on the Paystack account, that OTP is off for API transfers, and who funds the balance.

## Proposal

- Credit the organiser with the sale price minus a production cost that includes shipping, VAT and transaction fees (Q1, Q2). The platform takes no extra commission (Q3).
- A campaign discount is borne by the workshop, not deducted from the organiser (Q31).
- Show the estimate when the organiser sets a price (the price-guidance route exists), and show the net raised publicly, labelled clearly (Q4).
- Transfer fees are deducted from the organiser, baked into the estimate if they can be calculated per unit (Q34).
- Update `docs/payouts/ttw-042-interim-policy.md` and `docs/pricing-strategy.md`.

## Invariants

- The review example no longer pays ₦12,250: a ₦10,000 T-shirt costing ₦6,000 with ₦1,500 shipping and ₦750 VAT credits ₦4,000 at most.
- Ledger entries stay immutable, and each charge credits once under duplicates.
- Money uses decimals.

## Implementation plan

1. Start `codex/ttw-131-correct-the-campaign-money-split` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration on real Postgres: exact amounts, with sequential and concurrent duplicate webhooks.
- Unit: the example, with and without a discount.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/orders/paystack-webhook.service.ts:307` — row 6.2
- `campaign-ledger.service.ts:196` — row 6.2
- DiscountCampaign model — row 6.14
- Paystack configuration — row 7.6
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] The organiser balance equals the agreed share of each sale.
- [ ] The organiser sees the estimate before publishing, and the public page labels its figure.
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
