# TTW-084 — Create default site settings so VAT is never silently 0%

**Epic:** 8 — Client review delivery\
**Status:** Implemented-unverified (local commit, CI not run)\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 8.6, VAT is 0% until site settings are saved** (Critical, P0, 1–2 h, status "To do"): No default site settings are created: VAT is zero without any warning.

## Proposal

- Create the default `SiteSettings` row in the production seed, with the current Nigerian VAT rate, confirmed in the ticket.
- If the row is missing at quote time, fail clearly instead of pricing at 0% VAT.
- Add the step to the release checklist (`docs/release/controlled-release-checklist.md`).

## Invariants

- A quote never uses a VAT rate nobody set.
- Orders keep their frozen VAT snapshot (TTW-024).

## Implementation plan

1. Start `codex/ttw-084-create-default-site-settings` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: quote with and without the settings row.
- Integration: seed on an empty database, then quote and read the VAT line.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/pricing/pricing.service.ts:362` — row 8.6
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] A fresh deployment quotes the configured VAT rate before any admin opens Settings. Evidence: `site-settings-default.e2e-spec.ts` › "quotes 7.5% VAT on a fresh deployment before anyone opens Settings".
- [x] Swagger, shared contracts, migrations and docs are updated where applicable.
- [x] Required quality gates pass, with evidence recorded below (local; CI runs only once `main` is pushed).

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Recorded 2026-11-08, before implementation.

**Finding confirmed on `main` (dc0e11e).**

- `PricingService.getSiteSettings()` (`apps/api/src/pricing/pricing.service.ts:353-376`) returns `vatRate: 0` when the `default` row is missing, without any warning.
- `prisma/seed.ts` only loads Nigerian states and LGAs. The release path runs only `prisma migrate deploy` (`docs/release/controlled-release-checklist.md`, CI workflows), never the seed. A seed-only fix would therefore not reach a fresh deployment.
- A second path writes a VAT rate nobody set: `PATCH /v1/admin/site-settings` creates the row with `vatRate ?? 0` when it is missing and the admin only saves payout fields.

**Decisions (approved by the user on 2026-11-08).**

- Default values: VAT 7.5% (`0.075`), prices include VAT, VAT applies to shipping, currency NGN. These match the schema defaults and `seed:e2e`.
- Mechanism: a Prisma migration (`migrate dev --create-only`, then one SQL statement added) inserts the `default` row with `ON CONFLICT ("id") DO NOTHING`. This deviates from the ticket's "production seed" proposal because the seed never runs on release. Precedent for data statements in a generated migration: TTW-024, TTW-030. `schema.prisma` does not change, so there is no drift.

**Design.**

1. Migration: insert the default row once, never overwrite an admin-edited row.
2. Fail closed: if the row is missing at quote time, `getSiteSettings()` logs an error (no PII) and throws `ServiceUnavailableException` (503). This covers both quote routes and both order-creation routes, which all go through `quoteStandard`/`quoteCampaign`. The order is not created.
3. Admin PATCH: when the row is missing and `vatRate` is absent, refuse with 400 instead of creating a 0% row.
4. Swagger: document 503 on `POST /orders/quote`, `POST /orders`, `POST /campaigns/{id}/orders/quote` and `POST /campaigns/{id}/orders`, and 400 on the admin PATCH. Regenerate contracts.
5. Release checklist: after `migrate deploy`, check the VAT rate in Admin → Settings.

**Invariants and how they hold.**

- A quote never uses a VAT rate nobody set: the only fallback is removed, and the only implicit 0 on write through the API is refused. Correction after the implementation review: the admin page can still send an explicit 0 when the row is missing (see "Implementation reviews", finding 1).
- Frozen order snapshots (TTW-024) are untouched: no code path rewrites existing orders.
- Idempotency: `ON CONFLICT DO NOTHING` on the primary key, so re-running the statement, or running it against a database where an admin already saved settings, changes nothing.

**Risks.** Any local or CI database that relied on the missing row now gets 7.5% inclusive VAT. For inclusive prices the total does not change, only the extracted VAT line. `pricing-quote.e2e-spec.ts` pins VAT to 0 and restores the previous row, so it is unaffected.

**Out of scope, flagged only.** `GET /v1/admin/site-settings` still returns hard-coded defaults (VAT 0) when the row is missing; the migration makes that unreachable in practice. The payout fallbacks (`payoutSettlementHoldDays ?? 7`, etc.) in `apps/api/src/payouts/*`.

## Implementation reviews

**Review 1, 2026-11-08: independent subagent, implementation and security charter. Verdict: PASS, with three findings.**

Checked and holding:

- the migration SQL matches the `site_settings` DDL;
- `getSiteSettings` is the only VAT read in the API, and its callers are the 4 documented routes;
- a 503 happens before the order transaction, the stock reservation and any idempotency write, so no partial state is left (the e2e checks that 0 orders exist);
- frozen snapshots are untouched;
- the log line carries no PII;
- the e2e restores the shared row.

Findings:

1. **Medium-low, open, user decision.** When the row is missing, `GET /v1/admin/site-settings` still returns `vatRate: 0`. The admin page (`apps/admin/app/admin/settings/site/page.tsx:55`, `:98`) pre-fills that 0 and always sends `vatRate`, so saving only a payout field would recreate the row at 0%. This only happens if someone deletes the row by hand: the migration creates it on every deployment. Fixing it changes the admin screen (GET returns `vatRate: null`, the form requires a rate), which is outside this ticket's scope. It is proposed as a follow-up.
2. **Low, fixed.** The e2e expected `837.21`, which assumed a 2000 shipping fee. In the shared, never-truncated test database the oldest Lagos zone wins. The expected VAT is now derived from `quote.shippingFee`.
3. **Low, fixed.** The web and app checkouts display `apiError.message`, so the 503 text is now generic ("Pricing is temporarily unavailable. Please try again later."). The configuration detail stays in the server log only.

## Verification evidence

Run on 2026-11-08 in worktree `.claude/worktrees/ttw-084`, against a dedicated local database (`tamiym_workshop_ttw084_test`, Redis DB 14), so as not to disturb the parallel TTW-082 session.

Tests written first and failing for the right reason:

- unit: 4 failed (quote resolved at 0% instead of rejecting; PATCH created the row);
- e2e: 3 failed (row `null` after the migration SQL; `vatRate` 0; quote resolved instead of rejecting).

After implementation:

| Command                                                                                                          | Result                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter api test -- src/pricing/pricing.service.spec.ts src/admin/admin-site-settings.controller.spec.ts` | 27 passed                                                                                                                           |
| `pnpm --filter api test:e2e -- test/site-settings-default.e2e-spec.ts test/pricing-quote.e2e-spec.ts`            | 10 passed                                                                                                                           |
| `pnpm --filter api test:e2e` (full suite, before review fixes)                                                   | 22 suites, 131 tests passed                                                                                                         |
| `pnpm test`                                                                                                      | api 1266, web 40, app 42 passed                                                                                                     |
| `pnpm lint`                                                                                                      | 0 errors. The api warnings are on `main` already; `pricing.service.ts` has the same 11 `no-unsafe-assignment` warnings as on `main` |
| `pnpm typecheck`, `pnpm format:check`                                                                            | pass                                                                                                                                |
| `pnpm openapi:check`                                                                                             | "OpenAPI contract drift check passed."                                                                                              |
| `pnpm migrations:check`                                                                                          | "Prisma schema matches the migrations."                                                                                             |
| `pnpm release:check-migrations`                                                                                  | "Migration artefacts OK (26 migrations)."                                                                                           |
| `pnpm coverage:ratchet`                                                                                          | pass (lines 82.45%, floor 56.00%)                                                                                                   |
| `pnpm coverage:diff` (vs `origin/main`)                                                                          | 7/7 changed lines covered (100%)                                                                                                    |

Not run: Playwright (no screen changes; `seed:e2e` already writes 7.5%), and CI (`ci.yml` runs on `main` only).

## Completion summary

Done:

- Migration `20261108014827_ttw084_default_site_settings` creates the `default` row (7.5%, prices include VAT, VAT on shipping, NGN) and never overwrites an existing row.
- `PricingService` now refuses with 503 instead of pricing at 0% when the row is missing. This covers the 2 quote routes and the 2 order-creation routes.
- `PATCH /v1/admin/site-settings` refuses (400) to create the row without `vatRate`.
- Swagger and OpenAPI artefacts regenerated. Release checklist and `docs/pricing-strategy.md` updated.

Deviations from the proposal:

- A migration instead of the production seed, because release never runs the seed (approved by the user).
- The admin PATCH guard was added after the design review found the second 0% path.

Remaining:

- Review finding 1 (admin page can resend 0% after a manual deletion): proposed as a follow-up, pending the user's decision.
- Out of scope: the payout fallbacks in `apps/api/src/payouts/*`.
- CI evidence after the merge to `main`.
- The `ROADMAP.md` checkbox is left for the merge, to avoid a conflict with TTW-082.
