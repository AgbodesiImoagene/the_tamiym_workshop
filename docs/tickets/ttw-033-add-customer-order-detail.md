# TTW-033 — Add trustworthy customer order detail

**Epic:** 3 — Complete customer and fundraiser revenue journeys
**Status:** In progress (slice 1)
**Risk:** High
**Blocked by:** TTW-003, TTW-004, TTW-013 (TTW-040 is shipment timeline only — not a slice-1 blocker)
**Blocks:** TTW-053

## Background

The customer order list renders a non-navigating “Order Details” button and invents four preview order cards when the list is empty. An owned order API and a payment-confirmation page exist, but the response returns broad Prisma records, current related product/address data, and no intentional customer contract for payment attempts or refunds. Product/variant names are not snapshotted at purchase, so later catalogue edits can change the apparent historical order.

## Proposal

Add `/dashboard/orders/:id` and make every real order card navigate to it; replace preview cards with an honest empty state. Define an explicit customer-safe order-detail DTO containing order/payment/refund states, immutable money and shipping snapshots, line snapshots, campaign attribution, safe payment/refund summaries, and timestamps. Never expose raw provider events, internal user/organizer economics, idempotency keys, audit notes, or the mutable address relation.

Snapshot product name, variant name/SKU display value, and selected option presentation on new order lines. Backfill legacy display snapshots from the current catalogue with a documented `snapshotSource: BACKFILLED_CURRENT_CATALOG` marker so support can distinguish them; do not pretend the backfill is historical evidence. Unauthorized and nonexistent ids return the same not-found response.

Reuse a shared order-status presentation component between the account detail and existing confirmation flow. Show payment retry only for an owned, unexpired `PENDING_PAYMENT` order with no active attempt. Display partial/full provider-confirmed refund amounts from TTW-013. For shipment/tracking: **slice 1 does not invent shipment UI** — show placeholder copy until TTW-040 ships.

## Interim policy

**Policy version:** `customer-order-detail/v1-interim-2026-08-21`
Canonical matrix: [`docs/orders/ttw-033-interim-policy.md`](../orders/ttw-033-interim-policy.md).

## Invariants

- A customer can read only their own order; unauthorized and nonexistent ids are indistinguishable.
- Historical totals, shipping destination, item names/options, and unit prices come from order snapshots, never mutable profile/catalogue rows.
- Refund display is the sum/status of provider-confirmed refund records and never exceeds captured value.
- Shipment display is derived from TTW-040 when available; until then customers see an honest placeholder only.
- Payment retry visibility follows server eligibility and cannot create a second active attempt.
- Empty, loading, error, pending, failed, cancelled, partial-refund, refunded, processing, fulfilled, and delivered states are represented truthfully and accessibly.

## Implementation plan

1. Approve customer-visible fields/status copy and the legacy-snapshot disclosure; define versioned response DTOs and shared types. → interim policy `customer-order-detail/v1-interim-2026-08-21`
2. Add line display snapshot fields/source/version, migrate/backfill existing rows, and write snapshots transactionally in both standard and campaign order creation.
3. Replace broad `findOne` includes with an ownership-scoped explicit select/projection for order, line, payment, refund, campaign, and shipping snapshots; normalize unauthorized to not found.
4. Add the customer detail route and shared status/amount/address/item/refund components; update real list cards and remove fake previews.
5. Restrict retry UI/API eligibility to a reusable server decision and link confirmation/web-checkout success to the account detail.
6. **Slice 1 deviation:** do not render TTW-040 shipment timeline; return/show placeholder “Shipping updates will appear here when available”.
7. Update Swagger/shared contracts, support documentation, and unit coverage (Playwright matrix deferred).

## Test and observability plan

- Unit/component: response redaction, status/copy matrix, legacy marker, money/line calculations, retry eligibility, true empty state.
- Integration/e2e: deferred Playwright matrix; unit coverage for own/other/missing + snapshot writes.
- Failure, retry, and concurrency: active-attempt retry denial, expired/cancelled order.
- Logs, metrics, traces, and alerts: keep detail/retry decisions free of address/provider PII labels (existing patterns).

## References

- `apps/app/app/dashboard/orders/page.tsx` — list + empty state.
- `apps/app/app/dashboard/orders/[id]/page.tsx` — customer detail.
- `apps/api/src/orders/dto/customer-order-detail.dto.ts` — explicit DTO.
- `apps/api/src/orders/orders.service.ts` — projection + `isPaymentRetryEligible`.
- `apps/api/prisma/migrations/20260821070000_ttw033_order_item_display_snapshots/` — backfill migration.
- `docs/orders/ttw-033-interim-policy.md` — interim policy.

## Acceptance criteria

- [x] Product/support interim fields, status copy, and honest legacy snapshot treatment documented (`customer-order-detail/v1-interim-2026-08-21`).
- [x] New orders snapshot all customer-visible line and shipping data; migration backfills legacy rows with a disclosed source marker.
- [x] The API returns an explicit versioned DTO, redacts internal/provider fields, and gives the same response for other-user/missing ids.
- [x] Every real order card opens a responsive accessible detail; zero orders show a true empty state with a useful CTA.
- [x] Payment retry appears only when server-eligible; refund summaries exposed; shipment uses placeholder until TTW-040.
- [ ] Catalogue/address edits do not change stored order presentation in integration tests (follow-up / e2e harness).
- [ ] Playwright covers standard/campaign orders and pending/failed/paid/partial-refund/refunded/fulfilled/delivered/unauthorized states (deferred).
- [x] Swagger/shared contracts, migration/rollback notes, and interim support docs updated.
- [ ] High-risk security and independent implementation review pass.

## Out of scope

- Cancellation/return/fee policy and customer self-service → TTW-041.
- Provider-confirmed refund state machine → TTW-013.
- Public-site checkout implementation → TTW-032.
- Full shipment lifecycle / tracking timeline → TTW-040.

## Design review

**Date:** 2026-08-21
**Policy version:** `customer-order-detail/v1-interim-2026-08-21`
**Charter:** Product + security interim for slice 1 customer order detail.

### Decisions

| Topic        | Decision                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| DTO          | Explicit `CustomerOrderDetailDto` with `policyVersion`; no Prisma passthrough                                      |
| Authz        | Other-user ≡ missing → 404                                                                                         |
| Snapshots    | `productNameSnapshot`, `variantDisplaySnapshot`, `optionPresentationSnapshot`, `snapshotSource`, `snapshotVersion` |
| Backfill     | Catalogue join + `BACKFILLED_CURRENT_CATALOG` + customer disclosure flag                                           |
| Retry        | `PENDING_PAYMENT` + unexpired + no active PENDING/INITIATED attempt                                                |
| Shipment     | Placeholder only; do not invent TTW-040 UI                                                                         |
| List empty   | Honest empty state; no fake preview cards                                                                          |
| Confirm link | `customerAppPath('/dashboard/orders/:id')`                                                                         |

**Verdict:** Proceed with slice 1 under interim policy (independent implementation + security review still required before production go-live claims).

## Implementation reviews

_Pending independent implementation + security review after commit._

## Verification evidence

```text
pnpm --filter @tamiym/types build
pnpm --filter api typecheck
pnpm --filter app typecheck
pnpm --filter web typecheck
pnpm --filter api lint   # 0 errors (pre-existing warnings only)
pnpm --filter app lint
pnpm --filter web lint
pnpm --filter api exec jest --coverage --testPathPatterns='orders.service.spec|orders.controller.spec|order-item-snapshot.spec|pricing.service.spec'
  # 5 suites / 53 tests passed
node scripts/quality/check-diff-coverage.mjs --base origin/main --floor 80
  # 126/128 lines (98.44%) — pass
git diff --check  # clean
```

Migration: `apps/api/prisma/migrations/20260821070000_ttw033_order_item_display_snapshots/` (backfill + NOT NULL). Apply with `prisma migrate deploy` when Postgres is available.

## Completion summary

_Slice 1 (this commit):_ customer-safe `GET /orders/:id` DTO (`customer-order-detail/v1-interim-2026-08-21`), OrderItem display snapshots + backfill, list/detail UI with honest empty state, shared status presentation, server `paymentRetryEligible`, web/app confirm deep-links to `/dashboard/orders/:id`, shipment placeholder only (TTW-040 deferred). Playwright matrix and independent security/implementation review still outstanding.
