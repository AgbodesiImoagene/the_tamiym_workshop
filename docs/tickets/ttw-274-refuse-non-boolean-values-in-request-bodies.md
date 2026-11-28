# TTW-274 — Refuse non-boolean values in request bodies

**Epic:** 2B — API correctness  
**Status:** In review (committed on `claude/ttw-274-strict-boolean-bodies`, not merged)  
**Risk:** Standard  
**Blocked by:** None  
**Blocks:** None

## Background

The global `ValidationPipe` enables `enableImplicitConversion`
(`apps/api/src/openapi/application.factory.ts:31`). class-transformer converts a
value to the declared type **before** `class-validator` runs, so for a boolean
field every non-boolean becomes `Boolean(value)`:

- `"false"`, `"true"`, `"no"`, `1`, `{}` become `true`;
- `""` and `0` become `false`;
- `@IsBoolean()` then passes, because it only sees the converted value.

Reproduced on 2026-11-28:

- `apps/api/src/openapi/body-boolean-validation.spec.ts`, using the pipe
  installed by `configureApiApplication`: all 32 boolean fields of 21 body DTOs
  read the string `"false"` as `true`.
- `apps/api/test/body-boolean-validation.e2e-spec.ts`, real route and Postgres:
  `PATCH /v1/admin/shipping-zones/:id` with `{"isActive":"false"}` answers 200
  and stores `true` on an inactive zone.

Fields affected:

| DTO                                                    | Fields                                                               |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| Create/UpdateVariantDto                                | `isAvailable`                                                        |
| Create/UpdateProductViewDto                            | `isDesignable`, `isDefault`                                          |
| Create/UpdatePrintAreaDto                              | `rotationAllowed`                                                    |
| Create/Update ShippingZone, ShippingRule, ShippingRate | `isActive`                                                           |
| UpdateSiteSettingsDto                                  | `pricesIncludeVat`, `vatAppliesToShipping`, `autoRetryFailedPayouts` |
| Create/UpdateAddressDto                                | `isDefault`                                                          |
| UpdateInventoryDto                                     | `trackInventory`, `isAvailable`                                      |
| UpdatePayoutProfileDto                                 | `isDefault`                                                          |
| AdminBroadcastEmailDto                                 | `dryRun`                                                             |
| Create/UpdateAdminNotificationRouteDto                 | `enabled`, `notifyEmail`, `notifySms`, `notifySlack`                 |
| NotificationPreferenceItemDto                          | `enabled`                                                            |

`CreateVariantDto` is not used by any route today. `forceIncomplete`
(`apps/api/src/admin/admin-reconciliation.controller.ts:177`) is not affected:
it has no DTO class and is compared with `=== true`. No multipart route takes one
of these DTOs.

Related, found while reproducing:

- **Explicit `null`** passes `@IsOptional()`: `UpdateVariantDto` hands `null` to
  the service for a non-nullable column; `UpdatePayoutProfileDto` turns `null`
  and `[]` into `false`.
- **Query strings**: `ProductsQueryDto` reads `available=false`, `onSale=false`
  and `"0"` as `true` (only the empty string gives `false`). Neither front sends
  these parameters.

## Proposal

- New shared decorators in `apps/api/src/common/boolean-fields.decorator.ts`.
  Each reads the value back as it was sent (`obj[key]`) before `IsBoolean` runs:
  - `IsStrictBoolean` for a required body flag;
  - `IsOptionalStrictBoolean` for a body flag that may be left out (`null` is
    refused);
  - `IsOptionalQueryBoolean` for a query flag: exactly `"true"` and `"false"`
    are read as booleans, anything else is refused.
- `UpdatePayoutProfileDto` loses its `@Transform`, which deliberately accepted
  the string `"true"`; no client sends it.
- The global pipe keeps `enableImplicitConversion`: other number and query
  fields rely on it. Rejected: turning it off globally.
- TTW-267 (not merged on 2026-11-28) has its own check in
  `apps/api/src/products/dto/product-flags.ts`. It is not on `main`, so it is not
  reused and not touched here.

Decisions approved by the product owner on 2026-11-28:

1. Refuse explicit `null` on the optional body flags (as TTW-267 does).
2. Read `available=false` / `onSale=false` as `false` on the product list.

Consequence of decision 2 as implemented: `available` and `onSale` set to `""`,
`"0"`, `"1"` or any other text now answer 400 (before: `""` was `false`, the rest
`true`). No caller in the repository sends them.

## Invariants

- A body boolean is stored only when the client sent `true` or `false`.
- An absent optional field stays absent.
- Query-string booleans keep accepting `"true"` and `"false"`.
- No change to the OpenAPI contract or to the database schema.

## Implementation plan

1. Done: add the decorators.
2. Done: apply them to the 21 body DTOs and to `ProductsQueryDto`.
3. Done: guard test that fails if a source file uses `@IsBoolean(`. No exception
   is needed: the query DTO uses the shared decorator too. The TTW-267 helper
   calls `IsBoolean()` without `@`, so the guard does not flag it.
4. Done: `pnpm openapi:generate`, no diff.
5. Done: this ticket and `docs/tickets/README.md`.

## Test and observability plan

- Unit/component: `apps/api/src/openapi/body-boolean-validation.spec.ts` (every
  field: `true`/`false` kept, absent left out; strings, numbers, `null`, `{}`,
  `[]` refused; nested notification preferences; query strings; guard).
- Integration/e2e: `apps/api/test/body-boolean-validation.e2e-spec.ts`.
- Failure, retry, and concurrency: not applicable (input validation only).
- Logs, metrics, traces, and alerts: refused values answer 400 and are logged by
  the existing request logger. No change.

## References

- `apps/api/src/openapi/application.factory.ts:31` — global pipe options.
- `apps/api/src/fundraising/dto/update-payout-profile.dto.ts:14` — transform
  that runs after the implicit conversion.

## Acceptance criteria

- [x] Every field in the table accepts `true` and `false` and answers 400 to a
      string or a number.
- [x] A shipping zone is not activated by `{"isActive":"false"}`.
- [x] `available` and `onSale` query strings are still accepted.
- [x] `apps/admin` and `apps/app` send real booleans (checked by reading the
      code, see below).
- [x] Required quality gates pass with evidence recorded below.
- [x] OpenAPI regenerated without a diff.

## Out of scope

- Implicit conversion of numbers and strings in other fields.
- Moving the TTW-267 product flags to the shared decorator (after both merge).

## Design review

2026-11-28, product owner: plan and both decisions approved. Blast radius: request
validation of the 21 body DTOs and the product list filters; no schema, service or
contract change. Interface risk: a client sending text, numbers or `null` now gets 400. `apps/admin`, `apps/app` and `apps/web` send real booleans. On 2026-11-28 no
other worktree changed these DTO files.

## Implementation reviews

2026-11-28, `/code-review medium` run inside the implementing session (so **not
an independent review**): no blocking finding.

- `""`, `false` and `true` are still stored as `0`, `0` and `1` on numeric body
  fields (confirmed on `vatRate` and `flatFee`). Existing behaviour, out of
  scope: proposed as a separate task.
- Empty, `"0"` and `"1"` product filters now answer 400: consequence of the strict
  query reading, recorded in the proposal.
- `POST /v1/users/addresses` with `isDefault: null` used to let the service
  choose the default; it now answers 400 (decision 1). No front sends `null`.
- The guard test only matches `@IsBoolean(`: a boolean field with no validator
  would not be caught.
- After TTW-267 merges, replace `IsOptionalProductFlag` with
  `IsOptionalStrictBoolean`.

Independent review: pending.

## Verification evidence

Frontends, read on 2026-11-28 (no code change):

- `apps/admin`: values come from React boolean state, `z.boolean()` site settings
  (`apps/admin/lib/site-settings-form.ts:27`), literal booleans, and the shared
  Radix `Checkbox` whose `onCheckedChange` gives a boolean here (the
  `'indeterminate'` value is never set).
- `apps/app`: only `isDefault: true` for addresses (`apps/app/lib/profile.ts:87`).
  `apps/web` does the same (`apps/web/lib/addresses.ts:46`).

Before the fix (expected to fail):

- `pnpm --filter api exec jest body-boolean-validation`: 257 failed, 101 passed.
- `pnpm test:e2e body-boolean-validation` in `apps/api`, throwaway database
  `tamiym_workshop_test_ttw274`, `REDIS_DB=11`: 1 failed (`Expected: false,
Received: true`), 1 passed.
- `tsc --noEmit` and ESLint on the two new test files: pass.

After the fix, 2026-11-28, on `main` at `2fa96bb` plus this change:

- `pnpm --filter api exec jest body-boolean-validation`: 473 passed. Before the
  fix, with the `null` and query tests added: 300 failed, 173 passed.
- `pnpm --filter api exec jest` (all unit tests): 2887 passed, 2 failed in 190
  suites, machine heavily loaded. One failure was the guard test matching a
  comment in the new decorator file (comment reworded; the spec then passed). The
  other was a 5 s timeout in `src/users/avatar-image.spec.ts` (not touched),
  which passed alone (8 passed). The full run was not repeated.
- `pnpm test:e2e` on the address, shipping, products, inventory, site settings,
  campaign authoring and `body-boolean-validation` suites, throwaway database:
  23 suites, 108 tests passed. The rest of the integration suite and Playwright
  were not run locally.
- `tsc --noEmit`: pass. `pnpm lint` in `apps/api`: 0 errors, 14 warnings in
  files not touched here.
- `pnpm openapi:generate`: no diff.

## Completion summary

A boolean sent in a request body is now stored only when it is `true` or `false`;
text, numbers and `null` answer 400. The product list reads `available=false` and
`onSale=false` as `false`. No migration and no contract change.

Committed on 2026-11-28 on `claude/ttw-274-strict-boolean-bodies`.
Not done: push, merge, independent review, row in the local roadmap.
Follow-ups: numeric implicit conversion (separate task); move the TTW-267 flags
to the shared decorator.
