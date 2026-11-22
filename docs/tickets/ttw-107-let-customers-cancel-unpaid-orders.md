# TTW-107 — Let customers cancel their unpaid orders

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** Critical\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 5.2, Customers cannot cancel an unpaid order** (Medium, P1, 3–5 h, status "To do"): Allowed by the policy; the API does not exist.

## Proposal

- Add a customer cancel route for unpaid orders, per `docs/orders/ttw-041-interim-policy.md`, with a button on the order page.
- Release the stock reservation in the same state transition.
- Close the active payment attempt, and handle a payment that arrives afterwards as TTW-088 does.

## Invariants

- A paid order cannot be cancelled by this route.
- A reservation is released exactly once, under duplicate and concurrent requests.
- A charge webhook racing with the cancel never loses money.

## Implementation plan

1. Start `codex/ttw-107-let-customers-cancel-unpaid-orders` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration on real Postgres: double cancel, and cancel racing a charge webhook.
- Playwright: cancel an unpaid order from its page.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `docs/orders/ttw-041-interim-policy.md` — row 5.2
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] A customer can cancel an unpaid order, and its stock returns.
- [x] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [x] Swagger, shared contracts, migrations and docs are updated where applicable.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Finding confirmed on `main` (e0c8370): `orders.controller.ts` has no cancel route; only the admin status route (`OrdersService.updateOrderStatus`) and the expiry cron cancel unpaid orders. The policy already says "Customer cancel: Allowed (when API exists)". No open client decision blocks this ticket (`Blocked by: None`; not listed under "Décisions à obtenir du client").

**Design**

1. Route `POST /v1/orders/:id/cancel`, owner only. A missing order or another user's order returns the same 404 as `GET /orders/:id`. Response: `CustomerOrderDetailDto` (no new shape).
2. `OrdersService.cancelMyOrder(userId, orderId)`:
   - Eligibility comes from `evaluateCancellationEligibility` + `assertResolutionAllowed`. A refusal is a 400 with the TTW-041 `code`, the convention the admin route already uses. A second cancel of a cancelled order therefore returns 400 `CANCEL_NOT_ALLOWED_TERMINAL`.
   - One transaction: conditional `updateMany` (`status = PENDING_PAYMENT` → `CANCELLED`, `cancelledAt`), then `releaseOrderItems` with reason `customer_cancel_unpaid`, then close the open payment attempts. `count !== 1` means the order moved under us (paid or cancelled): 409, nothing written. No Paystack call inside the transaction (none is needed).
   - The admin route's transaction body is extracted into one private helper and reused, so both paths cannot drift. Admin behaviour and its `admin_cancel_unpaid` reason stay as they are (the existing unit test is the guard).
3. Reservation released exactly once: `releaseOrderItems` inserts an `InventoryMovement` with a unique `effectKey` (`release:<orderItemId>`) and skips on duplicate; the decrement runs only when the insert won. With the conditional order update, a duplicate or concurrent cancel cannot release twice. The integration test checks the `reserved` counter and the movement count.
4. Active payment attempt: the order's `Payment` rows in `INITIATED`/`PENDING` become `FAILED` in the same transaction (conditional `updateMany`). Safe for TTW-088: `PaystackWebhookService` finds the payment by `providerRef` whatever its status, and `recordLateCapture` only requires no settlement claim and a non-`SUCCEEDED` status; it then sets `SUCCEEDED`. A charge arriving after the cancel is recorded as a late capture and is refundable with `LATE_PAYMENT_AFTER_CANCELLATION`. Unlike the cron (which skips orders with an `INITIATED` payment), a customer cancel is an explicit choice and goes through.
5. Race with `charge.success`: settlement updates the order conditionally on `PENDING_PAYMENT`; whichever transaction commits first wins. Cancel first: the webhook sees `CANCELLED` and records the late capture. Payment first: our `updateMany` matches 0 rows and we return 409, so money is never lost and stock is never both released and consumed.
6. Side effects: audit entry `customer.order.cancelled` (actor = the customer), the existing cancelled e-mail via the outbox, the existing admin status notification. No new template. No tokens, cookies, PII or provider secrets in logs.
7. Frontend: a "Cancel order" button on the customer order page, shown only for `PENDING_PAYMENT`, with a confirmation step, loading and error states, English copy, theme tokens only.

**Risks and answers**

- Double release or negative `reserved`: unique `effectKey` + conditional decrement + conditional order update (point 3).
- Lost money on the webhook race: point 5, tested on real Postgres.
- Customer cancels while the Paystack page is still open: if they pay anyway the capture is recorded and an admin refunds it (TTW-088). No automatic refund (client decision pending, out of scope).
- Overlap with TTW-106 (admin shipment screen, in parallel): both edit `orders.service.ts` and `orders.controller.ts`. Merge conflicts are possible and are resolved at merge time; generated contracts are regenerated, never merged by hand.
- `docs/tickets/ROADMAP.md` is excluded from git in this repository, so it is not touched here.

## Implementation reviews

**Review 1 (independent, Critical charter: financial correctness and concurrency): PASS, two medium findings, both fixed.**

- M1, possible deadlock between the cancel and the settlement webhook (opposite lock order, giving a 500 instead of the documented 409). Fixed: the payment attempts are now closed before the conditional order update, so both transactions lock payment then order. The close also skips an attempt that already has a settlement claim. Guarded by a unit test on the call order (`orders.service.spec.ts`, "cancels, releases…") and by the e2e runs below.
- M2, the race test was not deterministic. Added "rolls the settlement back when the cancel commits after the webhook read the order, and records the redelivery": the webhook's read is intercepted so the cancel commits between its read and its settlement; the test checks the rollback (0 claim, no consumed stock), then the redelivery recorded as a late capture and the stock released once.
- B2 fixed: "closes a PENDING attempt and leaves older FAILED and SUCCEEDED attempts alone".
- B1 not done: there is no supertest of the HTTP route (401, CSRF, 400 body). The Playwright journey exercises the real route with cookies and CSRF; the 400/409 bodies are covered at service level.
- B3 accepted (as in the design review): a customer who has paid but whose webhook is late can still cancel; the capture is then recorded and an admin refunds it (TTW-088). Checking with Paystack before cancelling would be a separate decision.
- B4 and the "Info" items are not caused by this ticket and are left alone: `initiatePayment` racing a cancel (same hole as the admin cancel), `Order.paymentStatus` staying `PENDING` after any cancel, and `InventoryLifecycleService.tryInsertMovement` swallowing a unique violation inside an interactive transaction. Worth their own tickets.

## Verification evidence

Run in `ttw-107` on a throwaway database `tamiym_workshop_test_ttw107` (`REDIS_DB=14`), dropped afterwards.

- `pnpm --filter api test:e2e -- test/order-customer-cancel.e2e-spec.ts test/paystack-late-payment-refund.e2e-spec.ts`: 17 passed, three runs in a row (the cancel suite has 9 tests: cancel, double cancel, 6 concurrent cancels, paid refused, other user 404, late capture, deterministic race rollback, mixed attempts, random race x4). Earlier run with inventory-lifecycle: 20 passed.
- Red first, for the right reason: `orders.cancelMyOrder is not a function` (API) and no "Cancel order" button, then 3 polls instead of 1 (app).
- `pnpm test`: api 2121 passed, app 334 passed, web 84 passed.
- `pnpm lint`: 0 errors (existing warnings only). `pnpm typecheck`, `pnpm format:check`, `pnpm openapi:check`, `pnpm docs:validate`, `pnpm playwright:validate`: pass.
- `pnpm coverage:ratchet`: pass (lines 85.58%). `pnpm coverage:diff` against `origin/main`: 20/20 changed lines covered.
- `pnpm build`: 5 tasks successful.
- Playwright (`setup` + `chromium-app`, after `seed:e2e` on the throwaway database): `order-cancel.spec.ts` passed (11 passed with the setup tests). Journey: order, leave payment, open the order, Cancel order, Keep order, Cancel order, Yes cancel order, "Order cancelled", reload, still cancelled and no cancel button.

Not verified: other browsers or mobile widths for the new button, and the full Playwright suite (only the new journey was run).

## Completion summary

- New `POST /v1/orders/:id/cancel` and `OrdersService.cancelMyOrder`. One transaction closes open payment attempts (`FAILED`), moves `PENDING_PAYMENT` to `CANCELLED` conditionally, and releases the reservation. Refusals use the TTW-041 codes (400); a lost race is a 409.
- The admin cancel now shares the transaction body (`cancelUnpaidInTransaction`) and is unchanged: it still does not close payment attempts.
- Customer order page: "Cancel order" with a confirmation, loading and error states; polling stops on a cancelled order.
- Dedicated e2e customer `orderCancel` added to the seed, identities and auth setup; manifest entry `APP-ORDER-CANCEL`; policy doc and OpenAPI updated.
- Deviation from the plan: a second cancel returns 400 `CANCEL_NOT_ALLOWED_TERMINAL` (the existing convention), not 409.
- Left for later: see B1, B3 and B4 above.

## Merge

Merged into `main` as `8216f5a` (merge commit, on top of TTW-101). Checked on the merged tree before the push: `openapi:check`, `docs:validate`, `playwright:validate`, `format:check`, `typecheck`, `lint` and `pnpm test` (api 2169, app 334, web 84). CI run 45020232260 on `main`: green. On the branch, the first CI run failed only the `API Open Handles` job (240 s budget exceeded, 62 of 64 suites done); the rerun was green. That budget is tight (main runs take 163-218 s) and may need raising in a separate ticket.
