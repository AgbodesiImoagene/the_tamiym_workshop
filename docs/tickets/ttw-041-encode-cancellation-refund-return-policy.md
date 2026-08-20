# TTW-041 — Encode cancellation, refund and return policy

**Epic:** 4 — Fulfilment, support and business policy  
**Status:** Not started  
**Risk:** Critical  
**Blocked by:** TTW-003, TTW-004, TTW-013, TTW-014, TTW-040  
**Blocks:** TTW-053, TTW-054

## Background

The current backend permits only unpaid cancellation and an admin-initiated refund. It has no customer request, approval, return, item disposition, delivery-dispute or fee-allocation model. A partial refund currently marks the entire order `REFUNDED`; production and shipping states do not determine eligibility; and it is undefined whether shipping, Paystack fees, organiser proceeds or returned stock are recoverable. Support would have to make inconsistent off-system decisions.

## Proposal

Obtain owner/legal/finance/operations approval for a versioned resolution-policy matrix, then implement it as a single policy evaluator used by customer eligibility responses, admin decisions and refund initiation. Add an auditable `OrderResolution` case with type (`CANCELLATION`, `RETURN`, `PRODUCTION_FAILURE`, `DELIVERY_DISPUTE`), reason, requester, policy version, timestamps and state; add item/quantity/disposition rows for item-level outcomes. Link any resulting provider refund to the approved resolution while TTW-013 remains the authority for refund settlement and cumulative captured-value accounting.

Recommended v1: customers request rather than directly execute paid cancellations/returns; admins approve with a required reason; customized goods are non-returnable for change-of-mind after production starts but remain eligible for defect/not-as-described remedies; shipping is refundable only for platform/production/carrier fault; provider fees are not deducted from the customer's approved remedy unless owner/legal explicitly approve that disclosure. Policy version and monetary allocation are snapshotted when the decision is made.

## Owner policy decisions

- Define customer/admin cancellation rights and deadlines for `PENDING_PAYMENT`, `PAID`, production-started, dispatched and delivered states.
- Define return window start/duration, eligible/non-eligible item types, acceptable condition, return shipping responsibility and evidence requirements.
- Define partial refund allocation across item value, discount, VAT, original shipping, return shipping and provider/platform/organiser fees, including rounding order.
- Define defect, production failure, late/lost/damaged delivery and address-failure remedies; identify which party absorbs each cost.
- Define physical disposition (`RESTOCK`, `REWORK`, `SCRAP`, `RETURN_TO_CUSTOMER`) and when inventory may be restored.
- Define impact when campaign proceeds are held, reserved, already paid out or reversed; identify who approves negative organiser balance/manual recovery.
- Approve support roles, monetary approval thresholds, appeal/escalation windows, evidence retention and customer-facing policy copy.

## Invariants

- Refundable value is derived from provider-confirmed captured value minus provider-confirmed cumulative refunds and never becomes negative.
- A partial refund does not mark the whole order refunded; a full-refund summary requires the approved policy allocation and TTW-013 settlement truth.
- The policy result is deterministic for an immutable decision snapshot and records the policy version, inputs, allocation and reason.
- A resolution approval cannot itself move money. It may initiate one idempotent refund request; financial/campaign/ledger effects occur only after provider confirmation.
- Returned stock is restored only after an authorized receipt/disposition event and never solely because a refund succeeded.
- No administrator may approve above their configured threshold or approve their own exceptional/manual adjustment where segregation of duties applies.
- Policy/UI copy, eligibility API and enforcement service use the same versioned rules.

## Implementation plan

1. Facilitate and record owner/legal/finance/operations sign-off on the state-by-state policy matrix, monetary allocation examples, role thresholds and effective date. Publish matching customer-facing copy.
2. Add versioned policy configuration and migration-backed resolution, item, evidence reference and transition models. Link refunds to resolutions without weakening TTW-013 uniqueness/cumulative constraints.
3. Implement a pure policy evaluator returning eligibility, deadline, required evidence/return, maximum allocation by component, required approver and stable denial codes. Store money in integer minor units or exact decimal with an explicit rounding rule.
4. Add customer endpoints for eligibility, request creation, evidence attachment references, list/detail and withdrawal. Enforce ownership, rate limits, safe upload dependencies and no client-provided approved amount.
5. Add admin endpoints for queues, evidence review, approve/reject/request-info, item disposition and resolution. Enforce safe transitions, reason codes, thresholds and self-approval restrictions.
6. On approval, invoke TTW-013 through an idempotent resolution effect key. On confirmed refund, apply only the approved amount/allocation; on return receipt, invoke TTW-014 inventory disposition separately.
7. Integrate TTW-040 delivery events into eligibility and exception cases. Do not let shipment exceptions auto-create refunds.
8. Add customer/admin UI for deadlines, eligibility reasons, status timeline, evidence, allocation and next action. Use the same policy codes for user copy and support runbooks.
9. Emit transactional notifications/audit events exactly once for request, information needed, approval/rejection, return receipt and provider-confirmed refund. Add aging/escalation metrics and reports.
10. Update Swagger, shared contracts, financial/inventory docs, terms/policy pages, support scripts, data retention and rollback/backfill plan.

## Test and observability plan

- Unit/component: exhaustive policy decision table, boundary times, customized/standard products, allocation/VAT/discount/fees/rounding, approval thresholds, customer/admin UI states.
- Integration/e2e: ownership/RBAC, immutable policy snapshot, partial/full cases, TTW-013 confirmed/failed refund, TTW-014 disposition, TTW-040 delivery exceptions, outbox/audit atomicity.
- Failure, retry, and concurrency: duplicate requests/approvals, two admin decisions, policy changing mid-case, refund pending/failure/reversal, return received twice and payout already reserved/succeeded.
- Playwright: customer checks eligibility and submits a case; admin requests evidence/decides; customer sees the timeline; partial refund leaves correct remaining value/status; ineligible and unauthorized flows are denied.
- Logs, metrics, traces, and alerts: cases by type/state/age, decision and resolution time, amounts by allocation/reason, rejected transitions, breached SLO and refund/inventory follow-on failures; no evidence/PII in logs.

## References

- `apps/api/prisma/schema.prisma:75-85` — order states have only terminal `CANCELLED`/`REFUNDED`, with no partial-refund or return case.
- `apps/api/prisma/schema.prisma:1354-1374` — refund stores amount/reason/status but no request, allocation, case or line relationship.
- `apps/api/src/orders/orders.service.ts:618-627` — only `PENDING_PAYMENT` cancellation is allowed before fulfilment.
- `apps/api/src/orders/orders.service.ts:655-686` — cancellation directly releases reserved inventory only in the unpaid path.
- `apps/api/src/orders/refunds.service.ts:60-67` — only `PAID` is refundable and amount is checked only against original total.
- `apps/api/src/orders/refunds.service.ts:129-170` — provider acceptance immediately marks every refund/order successful/refunded and adjusts campaign money.
- `apps/admin/app/admin/orders/[id]/page.tsx:269-302` — admin provides only free-form amount and reason.

## Acceptance criteria

- [ ] Owner/legal/finance/operations approve a versioned policy matrix, worked allocation examples, roles/thresholds, copy and effective date.
- [ ] Eligibility API, customer copy and backend enforcement return the same policy result and stable reason codes.
- [ ] Migration/rollback introduce auditable cases/items/decisions and link to TTW-013 refunds without rewriting historical outcomes.
- [ ] Customer and admin can complete each approved request/decision path with ownership, threshold and segregation controls.
- [ ] Partial/full allocations, cumulative refunds, campaign/payout impact and inventory disposition preserve all invariants under concurrent/retried events.
- [ ] No financial effect occurs before provider-confirmed refund; no stock restoration occurs before recorded receipt/disposition.
- [ ] Integration and Playwright cover every state, denial, boundary, failure and retry in the signed policy matrix.
- [ ] Critical design/security reviews and two independent implementation reviews pass with exact gate evidence.

## Out of scope

- Provider refund state/idempotency/cumulative accounting mechanics → TTW-013.
- Inventory movement mechanics → TTW-014.
- Shipment/tracking evidence and exception state → TTW-040.
- Chargebacks and bank disputes → TTW-046.
- Automated reverse logistics/return labels → TTW-047.

## Design review

Pending. Include signed policy and worked examples, state machine, legal copy, financial/inventory invariants, authorization/segregation, concurrency, data retention, migration/backfill and full test matrix.

## Implementation reviews

Pending. Require two independent reviewers; one must review financial/inventory correctness and one security/privacy/operations.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
