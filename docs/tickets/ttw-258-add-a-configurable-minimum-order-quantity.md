# TTW-258 — Add a configurable minimum order quantity per product

**Epic:** 8 — Client review delivery  
**Status:** Not started  
**Risk:** Standard  
**Blocked by:** None  
**Blocks:** None

## Background

The client answered "Should build" (2026-11-24, part 2, Q16). Today every product can be ordered from 1 piece and the cards show "No Minimum" as in the Figma. No product has a minimum value set by the client yet.

## Proposal

Add an optional minimum quantity per product, set in the admin (empty means no minimum, so launch behaviour is unchanged). The API rejects a cart line or order below it with a clear error; the product card and page show the minimum when set. Interaction with bulk price tiers to be checked in the design review.

## Invariants

- Money uses decimals, never floats. Prices shown to the customer match what is charged.

## Implementation plan

1. Failing tests first (cart, order creation, boundaries).
2. Schema via Prisma CLI migration, DTOs, admin field, storefront display.
3. Update OpenAPI and shared types.

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
