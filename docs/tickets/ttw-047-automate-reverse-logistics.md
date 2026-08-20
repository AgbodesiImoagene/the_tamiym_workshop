# TTW-047 — Automate return labels and reverse logistics

**Epic:** 4 — Fulfilment, support and business policy\
**Status:** Deferred — post-v1\
**Risk:** High\
**Blocked by:** TTW-014, TTW-040, TTW-041, TTW-044, TTW-045\
**Blocks:** None

## Background

TTW-041 defines return eligibility, evidence and item disposition but deliberately excludes carrier labels and physical return tracking. Without reverse logistics, support must communicate addresses and buy labels off-system, while return receipt, refund and inventory restoration can drift apart.

## Proposal

Add an auditable `ReturnShipment` linked to an approved TTW-041 resolution and exact item quantities. Use the TTW-044 carrier interface to quote/purchase/cancel a return label, track milestones and handle exceptions. Keep authorization, receipt/inspection, refund settlement and inventory disposition as separate states: label delivery does not prove handover, carrier delivery does not prove acceptable condition, and receipt does not itself move money or stock.

## Invariants

- A return shipment cannot exceed the unresolved quantities authorized by its resolution.
- One return-label purchase intent creates at most one provider shipment and charge.
- Refund and inventory restoration occur only through TTW-013/TTW-014 after approved resolution/inspection events.
- Customer return labels and destinations are accessible only to the owning user and authorized operations staff.
- Cancelling, expiring or losing a label preserves all prior tracking and cost evidence.
- Carrier events cannot auto-approve eligibility, inspection or refund.

## Implementation plan

1. Approve return routing, prepaid/customer-paid rules, label expiry/reissue, packaging, drop-off/pickup, lost return, inspection SLA and cost allocation.
2. Add return-shipment, authorized-line allocation, label purchase and append-only tracking/receipt/inspection records with database quantity constraints.
3. Implement idempotent quote/purchase/cancel/reissue through TTW-044 and normalize return carrier events through the shipment transition service.
4. Add customer APIs/UI for instructions, label download, tracking and deadlines; enforce ownership, short-lived downloads and accessible copy.
5. Add operations queues/UI for awaiting handover, in transit, exception, received and inspection overdue; record item-level disposition/evidence.
6. Trigger TTW-013 refund and TTW-014 inventory effects only from the approved resolution/inspection policy with stable effect keys.
7. Add notifications, aging alerts, cost reporting, Swagger/contracts and lost-label/exception/inspection runbooks.

## Test and observability plan

- Unit/component: authorized quantities, cost payer, expiry/reissue, tracking mapping and customer/operations UI states.
- Integration/e2e: approved resolution to label to receipt/inspection, private download, carrier simulator, refund/inventory separation and audit.
- Failure, retry, and concurrency: duplicate purchase/reissue, expired label, out-of-order events, two receipts/inspections and provider outage.
- Playwright: customer downloads/tracks an authorized return; operations receives/inspects it; refund and stock effects occur only at approved steps.
- Logs, metrics, traces, and alerts: labels by state/age, return transit/inspection SLA, provider cost/failure and disposition outcomes without address/evidence PII.

## References

- `docs/tickets/ttw-041-encode-cancellation-refund-return-policy.md` — return labels and automated reverse logistics are explicitly deferred.
- `apps/api/prisma/schema.prisma:1286-1334` — order-item quantity has no return-shipment allocation.
- `apps/api/prisma/schema.prisma:1355-1374` — refunds have no return transport, receipt or inspection evidence.

## Acceptance criteria

- [ ] Operations/legal/finance approve return routing, payer, deadline, reissue, inspection and exception policy.
- [ ] Only approved, unresolved item quantities can receive an idempotently purchased private return label.
- [ ] Customer and operations can track return movement with ownership/RBAC, redaction and immutable evidence.
- [ ] Receipt/inspection, refund and inventory disposition remain distinct and exactly-once under retries/concurrency.
- [ ] Carrier outage, lost/expired label and overdue inspection alerts/runbooks are tested.
- [ ] Integration and Playwright reverse-logistics coverage pass.
- [ ] High-risk design, security and independent implementation reviews pass.

## Out of scope

- Return eligibility and monetary allocation → TTW-041.
- Carrier adapter and outbound labels → TTW-044.
- Refurbishment/rework production scheduling → future operations ticket.

## Design review

Pending. Include policy, quantity/effect invariants, provider sequence, authorization, private assets, state diagrams, failure handling and migration.

## Implementation reviews

Pending. Require independent implementation and security/integrity reviews.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
