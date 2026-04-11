# Release criteria (orders, payments, fundraising, payouts)

Before releasing to production, ensure:

## Security

- [ ] No insecure secret defaults (JWT_ACCESS_SECRET, JWT_REFRESH_SECRET validated at startup)
- [ ] No public privilege escalation (registration is CUSTOMER-only; organizer/admin routes protected)
- [ ] Paystack webhooks verified against raw request body (x-paystack-signature)

## Money flows

- [ ] Payment initiation is idempotent (one active payment per order; settlement keys off Payment.providerRef)
- [ ] Refunds call Paystack Refund API and transition order to REFUNDED with audit log; ledger REFUND_APPLIED created
- [ ] Payouts use Paystack Transfers; transfer webhooks update Payout status and reconcile ledger (PAYOUT_SUCCEEDED/PAYOUT_FAILED)
- [ ] Campaign currentAmount advances when campaign orders are paid (webhook); ledger PAYMENT_SETTLED created with availableAt = settledAt + hold days
- [ ] Routine payout runs only pay computed eligible balance (ledger-based); no arbitrary amounts on approve
- [ ] Manual adjustments are off-ledger, require two-person approval (requester cannot be approver), and create MANUAL_ADJUSTMENT ledger entry on execution

## Payout modes

- [ ] Site payout policy configurable (payoutMode, cadence, hold days, minimum amount)
- [ ] Campaign payout mode override is admin-only (`PATCH /admin/campaigns/:id/payout-policy`)
- [ ] Cron creates due payout runs when mode is AUTO_APPROVAL_REQUIRED or AUTO_EXECUTE
- [ ] BullMQ payout execution queue processes approved runs with retries

## Configuration

- [ ] Required env vars validated (DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET)
- [ ] Placeholder secrets rejected in non-test environments

## Quality gates

- [x] `pnpm run typecheck` passes
- [ ] `pnpm run lint` passes
- [x] `pnpm test` passes (unit tests)
- [ ] Integration/e2e tests pass (auth role boundaries, critical flows)

## Observability & docs

- [x] AnalyticsModule wired in AppModule; payout metrics available (run counts, failed counts)
- [ ] Swagger/OpenAPI updated for payout run, manual adjustment, site settings payout policy, banks/resolve
- [x] Audit logs written for order status changes, refunds, payout run create/approve, manual adjustment request/approve
- [x] Audit logs written for auth security actions, site settings updates, campaign status changes, and payout initiation
- [x] Request logs, traces, and audit rows share request/trace correlation identifiers
- [ ] Dashboards and alerts exist for API health, webhooks, payouts, and queues
