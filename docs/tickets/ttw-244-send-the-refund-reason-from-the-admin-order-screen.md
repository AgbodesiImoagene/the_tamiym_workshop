# TTW-244 — Send the refund reason from the admin order screen

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

Found on 2026-11-21 while checking how a late payment (TTW-088) is refunded.

The refund API requires a reason code from a fixed list:

- `CreateRefundDto.reasonCode` is mandatory and must be one of `REFUND_REASON_CODES` (`apps/api/src/admin/dto/create-refund.dto.ts`, `@IsIn([...REFUND_REASON_CODES])`; list in `apps/api/src/orders/resolution-policy.ts:58`: `CHANGE_OF_MIND`, `DEFECT_OR_NOT_AS_DESCRIBED`, `PRODUCTION_FAILURE`, `CARRIER_LOSS_OR_DAMAGE`, `ADDRESS_FAILURE_PLATFORM`, `DUPLICATE_OR_PRICING_ERROR`, `ADMIN_GOODWILL`, `LATE_PAYMENT_AFTER_CANCELLATION`). The reason decides whether the refund is allowed (`assertRefundPolicy`).
- The admin order screen (`apps/admin/app/admin/orders/[id]/page.tsx`) has an amount field and a free-text reason, and calls `createAdminRefund` (`apps/admin/lib/dashboard.ts:333`), which posts only `{ amount, reason, idempotencyKey }`. **No `reasonCode` is sent**, so, from reading the code, the API answers 400 to every refund started from this screen. Not run in a browser: to confirm first.
- The only browser-level test of this path, `tests/e2e/journeys/refund-lifecycle.smoke.spec.ts` ("admin refund API returns pending/processing…"), answers the request itself with a fake response (`page.route`) and posts no `reasonCode` either, so it cannot see the problem. The real route is covered by API integration tests (`paystack-refund-lifecycle.e2e-spec.ts`, `paystack-late-payment-refund.e2e-spec.ts`), which do not go through the admin screen.
- Until this is fixed, the client message and `docs/orders/ttw-041-interim-policy.md` describe the late-payment refund as manual, in the Paystack dashboard.

Confirm each point against current `main` before designing: the code may have moved.

## Proposal

- **A required "Reason" choice on the refund form**, using the API's list with English labels (for example "Late payment after cancellation", "Goodwill"). The type comes from the shared generated types (`@tamiym/types`), not a second hand-written list.
- **A sensible default:** for a `CANCELLED` order with a captured payment, preselect `LATE_PAYMENT_AFTER_CANCELLATION` and prefill the full captured amount (the API only accepts the full amount for that reason, once).
- **The free text stays optional**, as the note (`reason`).
- **Server errors are shown in plain English** with the stable code behind them (for example `REFUND_NOT_ALLOWED_…`), so an admin understands why a refund is refused instead of seeing a generic failure. The idempotency key logic is kept as is.
- **No change to refund rules or to the API contract.** The server stays the authority on eligibility. If the design review finds that a server change is needed, this ticket is raised to Critical and split.
- **A real browser journey** replaces the faked one (see the test plan). The old stub stays until the new journey passes, and its removal is a decision for the user.

Rejected alternatives:

- Make `reasonCode` optional on the API with a default: it would let an admin refund for an unspecified reason and weaken the policy.
- Leave refunds to the Paystack dashboard: no link with the order, the audit trail or the ledger.

## Invariants

- A refund is never created without a valid reason code.
- The server decides whether a refund is allowed; the screen never bypasses `assertRefundPolicy`.
- A refund is settled only after Paystack confirms it (`refund.processed`, TTW-013); the screen never shows money as returned before that.
- Two clicks or a retry reuse the same idempotency key and create one refund.
- Money in decimals, never floats.

## Implementation plan

1. Start `codex/ttw-244-send-the-refund-reason-from-the-admin-order-screen` from current `main`, in its own worktree.
2. Confirm the finding in a browser against the real API (a refund from the screen is refused with 400), and record it here.
3. Record the design review below before implementing, including how the journey replaces Paystack (see the test plan).
4. Write the tests first and show them failing for the right reason.
5. Implement in small steps: reason list and labels, default for a cancelled paid order, error messages. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit/component: the form cannot be submitted without a reason; a cancelled paid order preselects the late-payment reason and the full amount; every API error code gets a readable message; a double click sends one request.
- Browser journey (Playwright, no faked first-party route): an admin opens a cancelled order that has a late captured payment, refunds it from the screen, and sees the refund as processing, not settled. The real admin API and the real database are used. Only Paystack, the third party, is replaced, through the project's simulator or a server-side test provider; the design review chooses which, because the refund client calls `https://api.paystack.co/refund` directly today (see the comment in `refund-lifecycle.smoke.spec.ts`).
- Failure: a refused reason (for example a goodwill refund on a cancelled order) shows the API message.
- Logs, metrics, traces, and alerts: nothing new. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/admin/app/admin/orders/[id]/page.tsx` — refund form.
- `apps/admin/lib/dashboard.ts:333` — `createAdminRefund`.
- `apps/api/src/admin/dto/create-refund.dto.ts` — required `reasonCode`.
- `apps/api/src/orders/resolution-policy.ts:58` — reason codes and eligibility.
- `apps/api/src/orders/refunds.service.ts` — `initiateRefund`, `assertRefundPolicy`.
- `tests/e2e/journeys/refund-lifecycle.smoke.spec.ts` — the faked test.
- `docs/orders/ttw-041-interim-policy.md` — refund policy, late payment (TTW-088).
- `docs/tickets/ttw-088-refund-payments-captured-after-cancellation.md` — "no admin UI lists refund reasons today".
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] An admin can refund a cancelled order with a late captured payment from the admin screen, with the right reason code, and the API accepts it.
- [ ] The form refuses to submit without a reason, and shows a readable message for every refusal from the API.
- [ ] A browser journey runs the refund through the real admin API, with only Paystack replaced.
- [ ] `docs/orders/ttw-041-interim-policy.md` and the client message are updated to say the refund can be made from the admin screen.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Refund rules, amounts and the API contract (TTW-041, TTW-088, TTW-189).
- Automatic refunds and customer e-mails on refund (v2, TTW-191).
- Customer-side refund or return requests (TTW-149).

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
