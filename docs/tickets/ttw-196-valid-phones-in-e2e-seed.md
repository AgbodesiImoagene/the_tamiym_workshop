# TTW-196 — Use valid phone numbers in the e2e seed

**Epic:** 8 — Client review delivery\
**Status:** Implemented (uncommitted)\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

`apps/api/scripts/seed-e2e-dummy-data.ts` seeds phones like `08000000004` (users, the customer's address, order shipping phones). The API validates `phone` with `@IsPhoneNumber()` (`apps/api/src/addresses/dto/create-address.dto.ts:34`), which refuses that national format. Any checkout that saves the seeded customer address fails at "Review quote" with "phone must be a valid phone number", unless the test types another number first.

Seen again while checking TTW-193 in the web fundraiser checkout (seeded phone refused by `PATCH /v1/users/addresses/:id`). Earlier mentions: TTW-037 and TTW-039. TTW-039 is blocked by client questions, so this small fix is split out.

## Proposal

- Write the seeded phones in international format (`08000000004` → `+2348000000004`, same for `…01`, `…02`, `…03`, `…05` and the order `shipPhone` values).
- Remove the workaround in `tests/e2e/app/checkout-idempotency.spec.ts` that types another number.

## Invariants

- No production code or API validation changes: the validator stays strict.
- Seed stays idempotent and only runs against a test database.

## Implementation plan

1. Branch `codex/ttw-196-valid-phones-in-e2e-seed` from `main`.
2. Remove the workaround from the idempotency spec and show it failing against the current seed.
3. Change the seed phones, reseed, show the spec passing.
4. Run the gates and record results below.

## Test and observability plan

- e2e: `tests/e2e/app/checkout-idempotency.spec.ts` without the typed phone (fails before, passes after).
- Logs, metrics, traces, and alerts: nothing new.

## References

- `apps/api/scripts/seed-e2e-dummy-data.ts` — seeded phones.
- `tests/e2e/app/checkout-idempotency.spec.ts` — workaround.
- `docs/tickets/ttw-037-prevent-duplicate-standard-checkout-orders.md`, `docs/tickets/ttw-039-seed-sellable-fundraiser-offer-and-checkout-journey.md` — earlier mentions.

## Acceptance criteria

- [x] The seeded customer address saves through the checkout without retyping the phone.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- The sellable fundraiser offer and its journey → TTW-039.

## Design review

Not required (Low risk): seed data and one test only.

## Implementation reviews

Not required for a Low-risk seed/test change; no independent review run.

## Verification evidence

- Before: with the workaround removed and the old seed, `pnpm exec playwright test tests/e2e/app/checkout-idempotency.spec.ts --project=setup --project=chromium-app` failed (400 on the address save, "Place order and pay" never enabled).
- After: seed phones changed (13 values `0800000000N` → `+234800000000N`), `pnpm --filter api seed:e2e`, same command: 4 passed.
- `pnpm --filter api typecheck` OK; `pnpm --filter api lint` 0 errors (14 existing warnings); `pnpm format:check`, `pnpm docs:validate`, `pnpm playwright:validate` OK.
- Local test DB: `orders`, `products` and `categories` of `tamiym_workshop_test` were truncated so the seed could run (leftovers from earlier test runs break its cleanup). Not a change to the repo.
- Not run: the CI (nothing pushed).

## Completion summary

The e2e seed now uses international phone numbers, so the seeded customer address saves through checkout; the workaround in the idempotency spec is gone. No production code changed. Not committed, not pushed.
