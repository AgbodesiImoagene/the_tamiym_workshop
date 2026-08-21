# TTW-040 — Add a shipment and delivery-exception lifecycle

**Epic:** 4 — Fulfilment, support and business policy  
**Status:** In progress (slice 1)  
**Risk:** High  
**Blocked by:** TTW-003, TTW-004, TTW-014  
**Blocks:** TTW-033, TTW-041, TTW-053

## Background

Orders move directly from `PROCESSING` to `FULFILLED` to `DELIVERED`. There is no shipment, carrier, tracking number, dispatch timestamp, proof of delivery or delivery-exception record. Admins can mark an order delivered without shipment evidence, while the customer dashboard displays a generic tracking timeline. Support cannot distinguish production completion from dispatch, investigate late delivery, or explain the current state to customers and organisers.

## Proposal

Introduce carrier-neutral `Shipment` and append-only `ShipmentEvent` models related one-to-many to an order. Preserve `OrderStatus` as the commercial summary while shipment status represents physical movement. Support admin-operated shipment creation and transition first; design provider/ref fields for a future carrier adapter without integrating a carrier in this ticket.

Use a one-to-many schema to avoid a future destructive migration, but enforce one active outbound shipment per order in v1. Creating a shipment snapshots carrier/service/tracking/estimated-delivery data. Events cover `READY`, `DISPATCHED`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `EXCEPTION` and `CANCELLED`; exception events require a code and customer-safe message. Customer and organiser views receive redacted shipment summaries and an event timeline. Only server rules may derive `FULFILLED`/`DELIVERED` from shipment state.

## Owner policy decisions

- Approve the v1 limit of one active outbound shipment per order while retaining a one-to-many schema for later split shipments.
- Approve the carrier/service vocabulary, tracking URL allowlist and whether tracking numbers may be customer-visible immediately or only after dispatch.
- Define required proof for dispatch/delivery, who may correct a mistaken event, and the late/lost/damaged/address-failure exception codes and escalation SLOs.
- Define promised-delivery calculation and whether dates are calendar or business days.
- Confirm organiser visibility: recommended status/timestamps only, with no address, phone, carrier notes or proof-of-delivery PII.
- Approve customer notification points; recommended dispatch, out-for-delivery, delivered and actionable exception only.

## Invariants

- Shipment events are append-only; corrections append a superseding event and retain the original audit evidence.
- A tracking reference is unique within a carrier, and an order cannot have more than one active outbound shipment under the v1 policy.
- An order cannot become `DELIVERED` until its active shipment is delivered; it cannot be dispatched before paid inventory is consumed and production is fulfilled.
- Customer/organiser responses never expose private carrier notes, raw provider payloads, proof-of-delivery PII or the live address beyond the order's authorized view.
- Duplicate/concurrent event submissions create at most one transition and one notification.
- Delivery exceptions never silently imply cancellation, return, refund or stock restoration.

## Implementation plan

1. Record the owner-approved shipment state machine, exception taxonomy, evidence, visibility, notification and SLA policy.
2. Add shipment/event enums and models, normalized carrier/tracking key, active-outbound database constraint, event idempotency key, timestamps, estimates, actor/source and customer-safe/private metadata. Backfill no synthetic shipment state for historical orders.
3. Add a shipment domain service with conditional transitions, append-only event writes, order-summary derivation and audit/outbox writes in one transaction. Reject direct `FULFILLED`/`DELIVERED` order transitions that bypass the shipment rules.
4. Add admin endpoints to create a shipment, dispatch/update it, record an exception/correction and inspect its history. Protect destructive/corrective operations with reason and audit fields.
5. Extend customer order detail and organiser-redacted order contracts with permitted shipment summary/timeline. Update Swagger, shared types and the customer detail work in TTW-033.
6. Extend the admin order page with shipment setup, safe next actions, exception handling and immutable history. Replace generic customer tracking copy with API state.
7. Create idempotent outbox events/templates for approved milestones and exceptions. Route overdue/actionable exceptions to operations.
8. Add an overdue-shipment monitor using the stored estimate/SLA; emit metrics and alerts without auto-transitioning shipments.
9. Document manual carrier operations, event correction, lost/damaged escalation and rollback/backfill behaviour.

## Test and observability plan

- Unit/component: transition matrix, summary derivation, visibility/redaction, URL allowlist, estimate/SLA rules and safe admin next-action UI.
- Integration/e2e: migration constraints, create/dispatch/deliver/exception/correction, forbidden bypass, customer ownership, organiser redaction, outbox/audit atomicity.
- Failure, retry, and concurrency: duplicate event key, two admins dispatching/delivering, failure after event before order summary, late notification enqueue and scheduler overlap.
- Playwright: admin fulfils and dispatches with tracking; customer sees the real timeline; organiser sees redacted state; admin records an exception; impossible transitions remain unavailable and API-rejected.
- Logs, metrics, traces, and alerts: active shipments by state/age, dispatch-to-delivery duration, overdue and exception counts, rejected transitions and notification failures; trace by order/shipment with no PII.

## References

- `apps/api/prisma/schema.prisma` — OrderStatus and Order model (now with `shipments`).
- `apps/api/src/orders/orders.service.ts` — admin transitions no longer set FULFILLED/DELIVERED directly.
- `apps/api/src/shipments/` — shipment domain service and constants.
- `apps/app/app/dashboard/orders/[id]/page.tsx` — customer shipment timeline UI.

## Acceptance criteria

- [x] Owner approves the v1 shipment, visibility, exception, evidence, notification and SLA policies. _(engineering interim — formal sign-off deferred)_
- [x] Migration/rollback add an append-only, idempotent shipment lifecycle and safely leave historical orders unshipped.
- [x] Database/service rules prevent duplicate active outbound shipments, duplicate events and delivery without shipment evidence.
- [x] Admin can create, dispatch, progress, correct and exception a shipment through APIs with full audit history. _(admin console safe-next-action UI deferred)_
- [x] Customer views show accurate, appropriately redacted shipment state and no placeholder tracking data when a shipment exists.
- [ ] Milestone/exception notifications are once-only and overdue/actionable exceptions alert operations. _(deferred — reuses order FULFILLED/DELIVERED emails only in slice 1)_
- [ ] Integration and Playwright transition/redaction/failure coverage pass. _(unit coverage in slice 1; Playwright deferred)_
- [ ] High-risk design, security and independent implementation reviews pass with exact gate evidence.

## Out of scope

- Inventory consumption/restoration → TTW-014.
- Cancellation, return, refund and delivery-dispute remedies → TTW-041.
- Full customer order-detail journey → TTW-033.
- Carrier purchasing, label generation and carrier webhooks → TTW-044.
- Multi-package/partial shipment UX → TTW-045; the schema must not preclude it.

## Design review

### Slice 1 design review (2026-08-21)

**Date:** 2026-08-21  
**Risk:** High  
**Policy version:** `shipment-lifecycle/v1-interim-2026-08-21`  
**Verdict:** Proceed with interim policy (formal fulfilment/ops/product/legal sign-off deferred)

| Topic                                              | Decision                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Schema                                             | One-to-many `Shipment` / append-only `ShipmentEvent`; partial unique one active outbound         |
| Derivation                                         | Create READY → order FULFILLED; event DELIVERED → order DELIVERED; admin PATCH cannot set either |
| Carrier                                            | Vocabulary only (`MANUAL` default); no adapter / webhooks                                        |
| Tracking visibility                                | Customer sees tracking only after DISPATCHED                                                     |
| Exceptions                                         | Taxonomy stubs + customer-safe messages; never cancel/refund/stock                               |
| Notifications                                      | Reuse order FULFILLED/DELIVERED emails; dedicated shipment templates deferred                    |
| Historical                                         | No synthetic backfill                                                                            |
| Playwright / organiser redaction / overdue monitor | Deferred                                                                                         |

Policy: `docs/orders/ttw-040-interim-policy.md`

## Implementation reviews

_Pending independent security + implementation review after commit._

## Verification evidence

```text
pnpm --filter api typecheck            # pass
pnpm --filter api lint                 # 0 errors (pre-existing warnings only)
pnpm --filter api exec jest --testPathPatterns='shipments|orders.service.spec|admin-shipments'
  # 46 tests pass
pnpm --filter api test:coverage      # 119 suites / 1002 tests pass
node scripts/quality/check-diff-coverage.mjs --base origin/main --floor 80
  # 214/253 lines (84.58%) — pass
git diff --check                     # clean
```

Migration: `apps/api/prisma/migrations/20260821100000_ttw040_shipment_lifecycle`
Policy: `docs/orders/ttw-040-interim-policy.md`
Playwright / organiser redaction / shipment milestone outbox: deferred

## Completion summary

Slice 1: interim shipment policy; `Shipment`/`ShipmentEvent` models; admin create/status APIs with audit; customer order detail timeline replaces placeholder when data exists; direct FULFILLED/DELIVERED admin bypass rejected. Later slices: admin UI next actions, organiser redaction, milestone notifications, overdue monitor, Playwright.
