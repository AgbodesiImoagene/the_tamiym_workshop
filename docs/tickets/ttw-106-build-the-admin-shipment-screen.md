# TTW-106 — Build the admin shipment screen

**Epic:** 8 — Client review delivery\
**Status:** Implemented, awaiting independent review\
**Risk:** High\
**Blocked by:** None\
**Blocks:** TTW-121

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 5.1, Orders can never be marked shipped or delivered** (Blocker, P0, 15–25 h, status "To do"): The admin screen offers FULFILLED/DELIVERED but the API rejects them and requires a shipment, which has no screen. Shipping emails are never sent.

## Proposal

- Remove the FULFILLED and DELIVERED choices the API refuses.
- Add create-shipment and status actions on the admin order page, using the routes in `admin-shipments.controller.ts`.
- Show the status history and incidents.

## Invariants

- Only the shipment routes move an order to shipped or delivered (TTW-040).
- Shipping emails are sent once.

## Implementation plan

1. Start `codex/ttw-106-build-the-admin-shipment-screen` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Playwright: create a shipment, mark shipped, mark delivered, and see the customer timeline.
- Integration: shipped and delivered emails are queued once.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/orders/orders.service.ts:1059` — row 5.1 (the ticket said :940; the code moved)
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] An admin can take a paid order to delivered, and the customer receives the emails.
- [x] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [x] Required quality gates pass, with evidence recorded below.
- [ ] Independent review of the implementation (High risk: design, implementation and security) reached PASS. Not done yet.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Finding confirmed on `main` (e0c8370): the admin order page offered FULFILLED and DELIVERED, `OrdersService.updateOrderStatus` refuses both (`orders.service.ts:1059-1065`), and the four routes of `admin-shipments.controller.ts` had no screen. Two corrections to the ticket text: the API does not "require a shipment", it refuses those two statuses outright (creating a shipment is what derives FULFILLED), and the line reference moved. The routes were complete, so no route or DTO changes (`pnpm openapi:check` passes).

Decisions (user, 2026-11-22):

- Keep the two existing emails ("order processed" when the shipment is created, "delivered" on delivery). No dedicated "shipped" email for v1; TTW-040 already defers those templates.
- Fix the "emails sent once" gap: the email row was written after commit with no `dedupeKey`, so a crash between commit and queueing lost the email for good. The row is now written inside the transaction with `dedupeKey` = `OrderFulfilled:<orderId>` / `OrderDelivered:<orderId>` (the column already existed and is unique: no migration). Queueing stays after commit, as no network call may sit inside a transaction.

UI design: a "Shipment" panel on the admin order page (`apps/admin/components/admin-order-shipments.tsx`). Create form (carrier, service, estimated date, private note); one button per allowed next status (the transition table is mirrored from `shipments.constants.ts`, the API stays the authority); a tracking number is required to ship; a problem needs a code; history of events. Each action keeps one idempotency key until it succeeds, so a retry is the same request. FULFILLED and DELIVERED are removed from the status list.

Threat and failure notes: all routes already require the ADMIN role and CSRF; private notes are only shown in the admin panel; tracking links are validated by the API allowlist; no new logs.

## Implementation reviews

Pending: no independent review has been run yet.

## Verification evidence

Run in the worktree `.claude/worktrees/ttw-106`, Node 24.22.1, on a throwaway database `tamiym_workshop_test_ttw106` (migrated, `seed:e2e`, `REDIS_DB=14`), dropped afterwards.

- Tests first, failing for the right reason: `shipments.service.spec.ts` (2 new tests) failed on missing `dedupeKey`; `apps/api/test/shipment-emails.e2e-spec.ts` failed 3/3 on the old service (`Received length: 0`, no row with the key). Both pass after the change.
- `pnpm --filter api test -- src/shipments src/admin/admin-shipments`: 26 passed.
- `pnpm --filter api test:e2e -- test/shipment-emails.e2e-spec.ts` (real Postgres): 3 passed: one `OrderFulfilled` and one `OrderDelivered` row over the whole journey; a replayed create writes one row; two admins delivering at once write one `OrderDelivered` row.
- `pnpm exec playwright test tests/e2e/journeys/admin-shipment.journey.spec.ts --project=setup --project=chromium-journeys`: 12 passed (9 setup, 3 journey tests: status list, create → shipped → delivered, customer timeline). The UI journey was not run before the screen existed.
- `pnpm typecheck` 6/6, `pnpm lint` 6/6 (warnings only, none new), `pnpm format:check` clean, `pnpm test` (web 84, app 323, api 2115 passed), `pnpm openapi:check`, `pnpm docs:validate`, `pnpm playwright:validate`, `pnpm coverage:ratchet` (lines 85.56% over floor 56%), `pnpm coverage:diff` 12/12 lines (100%), `pnpm build` exit 0.

Not verified: the mobile layout of the panel; the full Playwright suite (only the new journey was run); `pnpm audit:prod` and `pnpm migrations:check` (no schema change); the real email delivery (the queue worker does not run under `NODE_ENV=test`).

## Completion summary

The admin order page now has a shipment panel: create a shipment, mark it shipped (with tracking), in transit, out for delivery, delivered, report a problem or cancel, and read the event history. The order moves to FULFILLED and DELIVERED only through these routes, and the two customer emails are written once, atomically with the order change.

Left for later: a screen for corrections of a recorded event (the API supports them), a dedicated "shipped" email, a mobile check, and the independent review above. Possible conflict at merge with TTW-107 on `docs/tickets/README.md`, `ROADMAP.md` and generated OpenAPI files.
