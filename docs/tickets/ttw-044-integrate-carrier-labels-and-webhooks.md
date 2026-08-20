# TTW-044 — Integrate carrier rates, labels and tracking webhooks

**Epic:** 4 — Fulfilment, support and business policy\
**Status:** Deferred — post-v1\
**Risk:** High\
**Blocked by:** TTW-003, TTW-040, TTW-043\
**Blocks:** TTW-045, TTW-047

## Background

TTW-040 deliberately establishes a carrier-neutral shipment lifecycle operated by administrators. The current system has no carrier adapter, rate/service selection, label purchase, webhook verification or provider reconciliation. Without those capabilities, operations must buy labels off-system and manually reproduce provider events, creating transcription, duplicate-purchase and stale-tracking risks.

## Proposal

After operations selects a Nigeria-capable carrier or aggregator, introduce a narrow carrier-provider interface for service discovery, quote, shipment/label purchase, cancellation, tracking lookup and webhook normalization. Keep the internal `Shipment`/`ShipmentEvent` models authoritative and store immutable provider requests/evidence references separately from customer-safe tracking data.

Purchase is an explicit, idempotent admin action using a previously refreshed quote. Verify provider webhook authenticity before parsing, deduplicate by provider event id/hash, reject unknown shipment references, and map only approved provider states into TTW-040 events. Poll/reconcile stale shipments when webhook delivery is unavailable or incomplete. Store labels privately and issue short-lived authorized downloads.

## Invariants

- One purchase intent can create at most one provider shipment and one charge, even after timeout or retry.
- Unverified, replayed or out-of-order provider events cannot mutate shipment state.
- Provider payloads never bypass the TTW-040 transition service or directly set order status.
- Labels, addresses, phone numbers, provider credentials and raw payloads are private and excluded from logs and organiser responses.
- A quote is currency/service/parcel/address scoped, expires, and is revalidated before purchase.
- Provider outage cannot erase the last known internal state or imply delivery.

## Implementation plan

1. Record provider selection, countries/services, pricing ownership, label format, webhook contract, cancellation rules, data-processing terms, SLAs and manual fallback.
2. Define a provider interface and normalized error/event vocabulary; implement the selected adapter behind configuration and a disabled-by-default feature flag.
3. Add provider shipment/purchase-intent, quote snapshot, credential-safe reference, webhook receipt and reconciliation cursor records with uniqueness and retention rules.
4. Implement address/parcel validation, service quote and idempotent purchase/cancel commands with timeout classification and status lookup before retrying an unknown result.
5. Add authenticated webhook ingestion with signature/timestamp verification, raw-body handling, replay protection, bounded payloads and provider-to-domain transition mapping.
6. Add private label storage and short-lived authorized download; add admin service/quote/purchase/print/cancel UI with confirmations and immutable evidence.
7. Add scheduled reconciliation for stale/unknown provider shipments and route actionable failures through TTW-043.
8. Update Swagger, shared contracts, secrets/configuration, privacy inventory, cost controls and carrier outage/cancellation runbooks.

## Test and observability plan

- Unit/component: provider mapping, quote expiry, parcel/address validation, error classification, label authorization and admin next actions.
- Integration/e2e: provider simulator quote/purchase/lookup/cancel, signed webhook, transition mapping, private label access and configuration gate.
- Failure, retry, and concurrency: two purchases, response timeout after provider success, duplicate/out-of-order webhook, invalid signature, provider 429/5xx and reconciliation overlap.
- Playwright: admin refreshes a quote, purchases and prints one label, customer sees normalized tracking, and invalid/expired actions remain unavailable.
- Logs, metrics, traces, and alerts: quote/purchase latency and result, provider cost, webhook verification/deduplication, stale/unknown shipment age and reconciliation result without PII.

## References

- `docs/tickets/ttw-040-add-shipment-lifecycle.md` — carrier purchasing, label generation and webhooks are deliberately deferred from the internal shipment lifecycle.
- `apps/api/prisma/schema.prisma:1219-1282` — orders currently store a shipping snapshot but no provider shipment or label purchase evidence.
- `apps/api/src/orders/payments.service.ts:72-118` — the existing provider integration pattern performs a direct external request and illustrates the timeout/idempotency concerns the carrier adapter must avoid.
- `docs/project_requirements/chapters/03-scope-of-work.tex:88` — deep courier integration is outside the contracted baseline unless separately approved.

## Acceptance criteria

- [ ] Operations/security/legal approve the provider, services, costs, DPA, webhook, cancellation, retention and outage policy.
- [ ] A disabled-by-default adapter supports quote, idempotent purchase, private label retrieval, lookup and approved cancellation with a provider simulator.
- [ ] Signed, deduplicated provider events enter only through TTW-040 transitions; invalid, unknown and out-of-order events are quarantined safely.
- [ ] Timeout/retry evidence proves a purchase intent cannot create a duplicate provider shipment or charge.
- [ ] Admin label operations enforce RBAC and audit while customer/organiser contracts expose only permitted tracking data.
- [ ] Reconciliation, metrics, alerts and tested outage/manual-fallback runbooks exist.
- [ ] High-risk design, security and independent implementation reviews pass with exact gate evidence.

## Out of scope

- Internal shipment state and manual tracking → TTW-040.
- Split/multi-package shipment planning → TTW-045.
- Return labels and reverse logistics → TTW-047.
- Additional carriers → separate adapter ticket after production evidence justifies it.

## Design review

Pending. Include provider/DPA decision, data-flow and threat model, purchase idempotency sequence, webhook verification, private-label access, mapping table, failure reconciliation, cost controls and rollback.

## Implementation reviews

Pending. Require independent implementation and security reviews.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
