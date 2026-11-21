# TTW-239 — Check the design owner on the standard order quote

**Epic:** 3 — Order and print the customer's design\
**Status:** Implemented, independently reviewed (PASS), committed locally, not pushed\
**Risk:** High (authorization)\
**Blocked by:** None\
**Blocks:** None

## Background

Found by the independent review of TTW-058, which judged it to predate that ticket.

`POST /v1/orders/quote` (`OrdersController.quote`, `apps/api/src/orders/orders.controller.ts`) calls `PricingService.quoteStandard`, which accepts a `designId` on each line and never checks it. `computeViewSurchargeForDesign` (`apps/api/src/pricing/pricing.service.ts`, `private async computeViewSurchargeForDesign`) reads the design views by id alone. So, with a valid session:

1. A customer can quote another customer's design and deduce, from the view surcharge in the answer, how many views that design uses (weak leak).
2. A design for another product than the variant is priced as if it matched.
3. A design rejected by moderation can be quoted.

Order creation is already protected: `OrdersService.assertDesignOwnershipAndProductMatch` (`apps/api/src/orders/orders.service.ts`) refuses a missing design (400), a design of another user (403) and a design of another product (400) before it calls the quote. The quote route has no such check.

Campaign quotes (`quoteCampaign`) are not affected: their `designId` must match a `CampaignProduct` row of the campaign, and the buyer does not pay a view surcharge. They are not changed.

## Proposal

One shared rule for "this user may order this design on this variant", used by the quote and by order creation, with the same statuses and codes:

- design not found → `400` (`Design <id> not found`);
- design of another user → `403` (`Access denied: design does not belong to you`);
- variant not found → `400`;
- design of another product than the variant → `400`;
- design `REJECTED` → `400`, code `DESIGN_REJECTED`.

`PENDING`, `FLAGGED` and `APPROVED` designs stay quotable and orderable (client answer Q28, unchanged).

Where: a plain function `assertDesignsOrderableBy(prisma, userId, items)` in `apps/api/src/pricing/design-order-eligibility.ts`, next to the pricing code. `OrdersService` already depends on `PricingService`, and a function (not a provider) adds no module dependency, so no circular dependency. `quoteStandard` calls it after the address check and before the pipeline. `OrdersService.create` keeps calling it first, as today (the order of errors for a request with several faults does not change); the private method of `OrdersService` is removed and replaced by the shared function. The cost is one more read of each design in `create`, accepted to keep the error order and the existing tests.

Rejected alternative: check only inside `quoteStandard` and remove the check from `create`. That changes the error order of order creation (address before design) and rewrites existing unit tests.

## Invariants

- A quote never reads, nor reveals anything about, a design the caller does not own.
- The quote and the order refuse the same designs with the same status and code.
- `PENDING`, `FLAGGED` and `APPROVED` designs are quotable (Q28). A quote without `designId` is unchanged.
- `quoteCampaign` behaviour is unchanged.

## Implementation plan

1. Open this ticket and the branch; record the design review.
2. Write failing tests (unit and e2e on Postgres).
3. Extract the rule, use it in `quoteStandard` and in `OrdersService`.
4. Swagger on `POST /orders/quote` and `POST /orders` (400/403), `pnpm openapi:generate`, policy `docs/orders/ttw-033-interim-policy.md`.
5. Run the gates; record evidence.

## Test and observability plan

- Unit (`pricing.service.spec.ts`, `orders.service.spec.ts`): the five refusals with status and code, the three accepted moderation statuses, no design, and "another user's design: no view read".
- E2E on Postgres (`apps/api/test/order-quote-design-check.e2e-spec.ts`): HTTP `POST /v1/orders/quote` with a real design (another customer's: 403; other product: 400; REJECTED: 400 `DESIGN_REJECTED`; PENDING/FLAGGED/APPROVED: 200 with the surcharge; no design: 200 unchanged).
- Failure, retry, concurrency: read-only path, nothing to retry.
- Logs: none added (the refusals are ordinary client errors).

## References

- `apps/api/src/orders/orders.controller.ts` — quote route.
- `apps/api/src/pricing/pricing.service.ts` — `quoteStandard`, `computeViewSurchargeForDesign`.
- `apps/api/src/orders/orders.service.ts` — `assertDesignOwnershipAndProductMatch`.
- TTW-058 — adds `DESIGN_REJECTED` to order creation on its own branch.

## Acceptance criteria

- [x] `POST /orders/quote` refuses a design of another customer (403), of another product (400), missing (400) and `REJECTED` (400, `DESIGN_REJECTED`).
- [x] `PENDING`, `FLAGGED` and `APPROVED` designs are quoted; a quote without a design is unchanged.
- [x] Order creation uses the same shared rule.
- [x] Swagger, `docs/openapi/openapi.json`, `packages/types` and `docs/orders/ttw-033-interim-policy.md` are updated.
- [x] Required quality gates pass with evidence recorded below.

## Out of scope

- Campaign quotes (no flaw found).
- Any other TTW-058 finding.

## Design review

- Reviewer: author, before implementation (standard for a ticket of this size; the independent review is done afterwards in a fresh session).
- Blast radius: `quoteStandard` (called by the quote route and by `OrdersService.create`), `OrdersService.create`. No schema change, no migration.
- Duplication check: the rule exists once, in `OrdersService`; it moves, not copies.
- Edge cases: design owned but variant missing (400); several lines with one bad design (first bad line wins, as today); `designId` empty string is treated as absent by the DTO and the old code (`if (!item.designId) continue`).
- Risks: merge with the TTW-058 branch. That branch edits the method this ticket removes (adds the `REJECTED` check). The result of the merge must keep the shared function with the `REJECTED` check; the conflict is mechanical.
- Verdict: go.

## Implementation reviews

Independent review by a fresh reviewer (read-only, commit 8270431), 2026-11-21: **PASS**, nothing blocking. It ran 17 suites of `src/pricing` and `src/orders` (315 tests, passing). It did not run the e2e, `openapi:check`, lint or typecheck, and did not do a real merge.

Confirmed: the five refusals on the quote come before any design view is read; ownership (403) is checked before moderation; no leak of the surcharge or of the moderation status to another customer; `OrdersService.create` keeps its statuses, codes and order of checks except the new `DESIGN_REJECTED`; the campaign quote has no equivalent flaw (its design must match a `CampaignProduct` of the campaign); no other caller of `quoteStandard` is broken; no existing test was weakened.

Findings and what was done:

- Minor, fixed: several lines on the same design or variant read it once per line. The shared function now reads each design and each variant once per call (unit test added). Order creation still reads again once in the quote: accepted, two small reads per line.
- Minor, fixed: no test with several lines of which one is at fault (added).
- Minor, fixed: this ticket's merge note was wrong (see Deviations).
- Minor, accepted: a missing design (400) and another customer's design (403) have different codes, so a caller can learn that an id exists. Order creation already behaved so. No surcharge or status leaks. The invariant "reveals nothing" means those two only.
- Out of scope, to look at in another ticket if it is not wanted: `organizerCostBasis`, which includes the view surcharge of a campaign design, is returned in the `pricingBreakdown` of a campaign quote.

## Verification evidence

Tests written first, failing for the right reason:

- `pricing.service.spec.ts` "quoteStandard design check (TTW-239)": 4 failed before the fix (the refusals resolved with a quote).
- `test/order-quote-design-check.e2e-spec.ts`: 4 failed before the fix (200 instead of 403/400/400/400), the 4 other tests passed.

After the fix:

- `pnpm --filter api test:coverage` — 176 suites, 2106 tests passed; statements 85.25%, branches 70.99%, functions 76.14%, lines 85.54%.
- E2E on real Postgres (`tamiym_workshop_test`, shared, no re-seed): `order-quote-design-check`, `pricing-quote`, `order-create-idempotency` — 3 suites, 23 tests passed. `order-quote-design-check`: 403 other's design (no surcharge in the body), 400 missing, 400 other product, 400 `DESIGN_REJECTED`, 200 with surcharge for PENDING/FLAGGED/APPROVED, 200 unchanged without a design.
- `pnpm coverage:ratchet` passed (floors 55.64/48.73/54.64/56.00). `pnpm coverage:diff` passed (4/4 lines, base `origin/main` fetched).
- `pnpm openapi:generate` then `pnpm openapi:check` passed. `pnpm docs:validate` passed. `pnpm format:check` passed.
- `pnpm --filter api typecheck` passed; `pnpm --filter @tamiym/types typecheck` passed; `pnpm --filter api lint`: 0 errors, 14 warnings (existing `no-unsafe-assignment` warnings).
- After the review fixes (2026-11-21): `pnpm --filter api test -- src/pricing src/orders` 17 suites, 317 tests passed; e2e `order-quote-design-check`, `pricing-quote`, `order-create-idempotency` 3 suites, 23 tests passed; `api typecheck` passed; `api lint` 0 errors (14 existing warnings). Not re-run after these fixes: coverage ratchet and diff, `openapi:check`, `docs:validate`.
- Not run: the full e2e suite of the API, Playwright (ports used by another session; this ticket has no UI).

## Completion summary

`POST /orders/quote` now refuses, with the statuses and codes of order creation, a design that does not exist (400), belongs to another customer (403), is for another product (400) or is `REJECTED` (400, `DESIGN_REJECTED`). The rule lives once in `apps/api/src/pricing/design-order-eligibility.ts`; `OrdersService.create` uses it too (its private method is removed). `PENDING`, `FLAGGED`, `APPROVED` stay quotable (Q28). Swagger of the quote and the interim policy are updated; no migration.

Deviations: the `POST /orders` Swagger text was left alone (the TTW-058 branch edits it); the `DESIGN_REJECTED` check did not exist on `main` (it is in TTW-058, commit 22ea4dc), so this ticket adds it to both paths. When TTW-058 is merged (checked by the reviewer with `git merge-tree`, no real merge yet), two files conflict: `orders.service.ts` (delete the old method: the `DESIGN_REJECTED` rule of TTW-058 is identical, same status, code and message) and `docs/orders/ttw-033-interim-policy.md` (keep both sections). The controller, the specs and the OpenAPI files merge without conflict, and the `POST /orders` 400 text is already written by TTW-058, so nothing to add. After the merge, remove the `ModerationStatus` import that TTW-058 adds to `orders.service.ts`: it is unused once the method is gone, and lint fails on it.

Remaining: the merge with TTW-058 as described above; not pushed.
