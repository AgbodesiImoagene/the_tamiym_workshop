# TTW-040 — Add a shipment and delivery-exception lifecycle

**Epic:** 4 — Fulfilment, support and business policy  
**Status:** Not started  
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

- `apps/api/prisma/schema.prisma:75-85` — order status conflates fulfilment and physical delivery.
- `apps/api/prisma/schema.prisma:1219-1282` — order has a shipping-price snapshot but no shipment/tracking relation.
- `apps/api/src/orders/orders.service.ts:618-627` — admin transition map permits fulfilment then delivery without shipment evidence.
- `apps/api/src/orders/orders.service.ts:633-722` — status update is the only fulfilment/delivery operation.
- `apps/admin/app/admin/orders/[id]/page.tsx:243-317` — admin selects order statuses manually and UI copy treats `FULFILLED` as ready to leave.
- `apps/app/app/dashboard/page.tsx:227-253` — customer timeline is inferred from order status and uses generic dispatch copy.

## Acceptance criteria

- [ ] Owner approves the v1 shipment, visibility, exception, evidence, notification and SLA policies.
- [ ] Migration/rollback add an append-only, idempotent shipment lifecycle and safely leave historical orders unshipped.
- [ ] Database/service rules prevent duplicate active outbound shipments, duplicate events and delivery without shipment evidence.
- [ ] Admin can create, dispatch, progress, correct and exception a shipment through safe next actions with full audit history.
- [ ] Customer and organiser views show accurate, appropriately redacted shipment state and no placeholder tracking data.
- [ ] Milestone/exception notifications are once-only and overdue/actionable exceptions alert operations.
- [ ] Integration and Playwright transition/redaction/failure coverage pass.
- [ ] High-risk design, security and independent implementation reviews pass with exact gate evidence.

## Out of scope

- Inventory consumption/restoration → TTW-014.
- Cancellation, return, refund and delivery-dispute remedies → TTW-041.
- Full customer order-detail journey → TTW-033.
- Carrier purchasing, label generation and carrier webhooks → TTW-044.
- Multi-package/partial shipment UX → TTW-045; the schema must not preclude it.

## Design review

Pending. Include fulfilment owner, state/exception diagrams, schema constraint, authorization/redaction matrix, notification idempotency, concurrency, historical data and rollback.

## Implementation reviews

Pending. Require independent implementation and security reviews.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
