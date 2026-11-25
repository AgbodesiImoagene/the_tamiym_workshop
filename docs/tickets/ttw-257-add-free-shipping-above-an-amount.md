# TTW-257 — Offer free shipping above an amount

**Epic:** 8 — Client review delivery  
**Status:** Not started  
**Risk:** High  
**Blocked by:** None  
**Blocks:** None

## Background

The client answered yes (2026-11-24, part 2, Q10) to free shipping above an amount. It was asked in Q21 and never answered. Shipping rates today are a flat fee per zone plus optional brackets by item count or weight (TTW-098), with no free threshold.

## Proposal

Add an admin-settable free-shipping threshold (amount in naira, tunable from the admin; global or per zone, to settle in the design review). When the order's goods total reaches it, shipping is 0 and the checkout says so. The threshold applies to the goods total after discounts; this is to be confirmed in the design review.

## Invariants

- Money uses decimals, never floats. Prices shown to the customer match what is charged.

## Implementation plan

1. Design review: threshold scope (global vs per zone) and which total it compares.
2. Failing tests first, then schema, service, admin form, checkout display.
3. Update OpenAPI, shared types and the shipping policy doc.

## Test and observability plan

- Unit/component: cover the rule and its boundaries.
- Integration/e2e: real Postgres where money or stock is touched.
- Failure, retry, and concurrency: duplicate and concurrent requests.
- Logs, metrics, traces, and alerts: no PII or secrets in logs.

## Acceptance criteria

- [ ] Independently observable outcome described in Proposal.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Contracts, migrations, observability, and documentation are updated where applicable.

## Out of scope

- Anything not named in Proposal.

## Design review

To record before implementation.

## Implementation reviews

To record.

## Verification evidence

To record.

## Completion summary

To record.
