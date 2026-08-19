# TTW-033 — Add trustworthy customer order detail

**Epic:** 3 — Complete customer and fundraiser revenue journeys  
**Status:** Not started  
**Risk:** High  
**Blocked by:** TTW-003, TTW-004, TTW-013, TTW-040  
**Blocks:** TTW-053

## Background

The customer order list renders a non-navigating “Order Details” button and invents four preview order cards when the list is empty. An owned order API and a payment-confirmation page exist, but the response returns broad Prisma records, current related product/address data, and no intentional customer contract for payment attempts or refunds. Product/variant names are not snapshotted at purchase, so later catalogue edits can change the apparent historical order.

## Proposal

Add `/dashboard/orders/:id` and make every real order card navigate to it; replace preview cards with an honest empty state. Define an explicit customer-safe order-detail DTO containing order/payment/refund states, immutable money and shipping snapshots, line snapshots, campaign attribution, safe payment/refund summaries, and timestamps. Never expose raw provider events, internal user/organizer economics, idempotency keys, audit notes, or the mutable address relation.

Snapshot product name, variant name/SKU display value, and selected option presentation on new order lines. Backfill legacy display snapshots from the current catalogue with a documented `snapshotSource: BACKFILLED_CURRENT_CATALOG` marker so support can distinguish them; do not pretend the backfill is historical evidence. Unauthorized and nonexistent ids return the same not-found response.

Reuse a shared order-status presentation component between the account detail and existing confirmation flow. Show payment retry only for an owned, unexpired `PENDING_PAYMENT` order with no active attempt. Display partial/full provider-confirmed refund amounts from TTW-013 and the customer-safe shipment/tracking timeline from TTW-040.

## Invariants

- A customer can read only their own order; unauthorized and nonexistent ids are indistinguishable.
- Historical totals, shipping destination, item names/options, and unit prices come from order snapshots, never mutable profile/catalogue rows.
- Refund display is the sum/status of provider-confirmed refund records and never exceeds captured value.
- Shipment display is derived from TTW-040 redacted snapshots/events and never exposes internal exception notes or provider credentials.
- Payment retry visibility follows server eligibility and cannot create a second active attempt.
- Empty, loading, error, pending, failed, cancelled, partial-refund, refunded, processing, fulfilled, and delivered states are represented truthfully and accessibly.

## Implementation plan

1. Approve customer-visible fields/status copy and the legacy-snapshot disclosure; define versioned response DTOs and shared types.
2. Add line display snapshot fields/source/version, migrate/backfill existing rows, and write snapshots transactionally in both standard and campaign order creation.
3. Replace broad `findOne` includes with an ownership-scoped explicit select/projection for order, line, payment, refund, campaign, and shipping snapshots; normalize unauthorized to not found.
4. Add the customer detail route and shared status/amount/address/item/refund components; update real list cards and remove fake previews.
5. Restrict retry UI/API eligibility to a reusable server decision and link confirmation/web-checkout success to the account detail.
6. Render the TTW-040 shipment summary, tracking events, estimates, and customer-safe exceptions without inventing progress when no shipment exists.
7. Update Swagger/shared contracts, support documentation, analytics, and Playwright coverage.

## Test and observability plan

- Unit/component: response redaction, status/copy matrix, legacy marker, money/line calculations, retry eligibility, true empty state, keyboard/mobile behavior.
- Integration/e2e: own/other/missing order; snapshot immutability after product/address edits; standard/campaign orders; payment attempts, partial/full/failed refunds from TTW-013, and redacted shipment events from TTW-040.
- Failure, retry, and concurrency: order updates while detail refreshes, active-attempt retry denial, expired/cancelled order, delayed refund transition, missing legacy relation after backfill.
- Logs, metrics, traces, and alerts: detail outcome and retry decision by status/reason without customer/address/provider values as labels; trace ownership denials generically.

## References

- `apps/app/app/dashboard/orders/page.tsx:43-62` — list builds fake preview cards when no orders exist.
- `apps/app/app/dashboard/orders/page.tsx:96-123` — “Order Details” is a button without navigation.
- `apps/app/lib/checkout.ts:20-36` — current detail client contract is incomplete and address-relation oriented.
- `apps/app/app/orders/[id]/confirm/page.tsx:69-103` — existing owned-order polling and broad retry behavior.
- `apps/api/src/orders/orders.service.ts:359-370` — create response includes a mutable, slim address relation.
- `apps/api/src/orders/orders.service.ts:543-567` — customer detail uses a broad Prisma record and distinguishes forbidden ids.
- `apps/api/prisma/schema.prisma:1238-1248` — immutable shipping snapshots already exist.
- `apps/api/prisma/schema.prisma:1285-1318` — line price/options are snapshotted but display names are not.

## Acceptance criteria

- [ ] Product/support approve customer-visible fields, status copy, and honest legacy snapshot treatment.
- [ ] New orders snapshot all customer-visible line and shipping data; migration backfills legacy rows with a disclosed source marker.
- [ ] The API returns an explicit versioned DTO, redacts internal/provider fields, and gives the same response for other-user/missing ids.
- [ ] Every real order card opens a responsive accessible detail; zero orders show a true empty state with a useful CTA.
- [ ] Payment, partial/full refund, order, shipment/tracking, exception, and delivery states match backend truth; retry appears only when server-eligible.
- [ ] Catalogue/address edits do not change stored order presentation in integration tests.
- [ ] Playwright covers standard/campaign orders and pending/failed/paid/partial-refund/refunded/fulfilled/delivered/unauthorized states.
- [ ] Swagger/shared contracts, migration/rollback, support docs, and observability are updated.
- [ ] High-risk security and independent implementation review pass.

## Out of scope

- Cancellation/return/fee policy and customer self-service → TTW-041.
- Provider-confirmed refund state machine → TTW-013.
- Public-site checkout implementation → TTW-032.

## Design review

Record product/support/security reviewers, date, DTO/redaction matrix, snapshot/backfill decision, status/retry copy, schema/rollback, UI/accessibility, tests, and verdict.

## Implementation reviews

Record security and implementation iterations, privacy/snapshot/status findings, fixes, evidence, dimension verdicts, and overall verdict.

## Verification evidence

Record migration/backfill samples, exact unit/integration/Playwright commands, authorization and snapshot immutability tests, accessibility results, and redacted response examples.

## Completion summary

Summarize DTO/snapshot/UI/tracking behavior, legacy treatment, retry rules, deviations, migration/operations notes, PR, and TTW-041 handoff.
