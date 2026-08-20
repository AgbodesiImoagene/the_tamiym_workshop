# TTW-024 — Enforce pricing, discount and tax policy

**Epic:** 2 — Security and trust boundaries\
**Status:** In review\
**Risk:** High\
**Blocked by:** TTW-003\
**Blocks:** TTW-031, TTW-032, TTW-034, TTW-035, TTW-041, TTW-053, TTW-054

## Background

The central pricing pipeline computes standard and campaign quotes, bulk tiers, discounts, shipping, VAT and rounding. However, discount exclusivity and bulk-tier overlap are enforced with application reads rather than database constraints, so concurrent admin writes can create conflicting active rules. Tax settings are mutable global values without an effective-dated policy version, and orders do not persist the quoted VAT, display-rounding adjustment or tax-policy inputs needed to reproduce a historical charge. Campaign discounts are selected with an unordered `findFirst`, making an invalid overlap resolve non-deterministically. The owner has not approved Nigeria VAT inclusivity, shipping treatment, receipts/invoices or accounting-export requirements.

## Proposal

Ship an **interim NGN v1 engineering policy** (`ngn-v1-interim-2026-08`) derived from `docs/pricing-strategy.md`, without inventing legal receipt/accounting requirements the owner has not signed. Make quote and order creation share one totals model with explicit VAT and rounding snapshots. Enforce already-coded discount exclusivity and bulk-range non-overlap at the PostgreSQL boundary. Fail closed when multiple active campaign discounts match. Fix merchandise totals so discounts are not double-subtracted.

Defer to a follow-up ticket: owner-signed legal VAT/receipt/accounting matrix, immutable effective-dated tax policy versions, quote-drift confirmation UX, full Decimal migration, overlapping **effective-window** exclusion (beyond ACTIVE locks), and Playwright admin/customer drift flows.

## Owner policy decisions

- **Interim (this ticket):** adopt current site-settings VAT rate/inclusivity/shipping flags, NGN rounding (`HALF_EVEN` minor + display granularity 100), one ACTIVE discount per subject, bulk tiers replace unit price for matching quantity, campaign discounts only in campaign mode, discount larger than unit capped at unit price.
- **Still owner-gated (follow-up):** legal Nigeria VAT source of truth, receipt/invoice fields, accounting export, effective-date correction process, cart reaction to mid-flight policy changes.

## Invariants

- For a subject and currency key, the database cannot contain two ACTIVE discount locks that the interim policy says are mutually exclusive.
- Bulk quantity ranges for the same `(productId, variantId, currency)` cannot overlap under concurrent writes.
- New orders: `totalAmount = totalBeforeDisplayRounding + roundingAdjustment`; `subtotalAmount - discountAmount = sum(lineTotal)`; VAT reproducible from snapshotted rate/basis flags and taxable net.
- Campaign quote fails closed if more than one active discount matches.
- Legacy orders may have null tax/rounding snapshots (unreproducible); new orders always set them.

## Implementation plan

1. Record design review adopting interim policy; list deferred owner-gated work.
2. Inventory SQL + migration that fails if overlapping bulk tiers exist; add EXCLUDE + `discount_active_locks`.
3. Fix quote totals; add policy/VAT/rounding fields on `QuoteResult` and `Order`; persist on create.
4. Deterministic fail-closed campaign discount resolver; sync locks in `DiscountsService`.
5. Unit tests for double-subtract and multi-discount fail-closed; update pricing docs.
6. Dual reviews, quality gates, PR.

## Test and observability plan

- Unit: worked examples for pre-discount subtotal, rounding adjustment identity, multi-discount fail-closed.
- Integration: migration EXCLUDE / lock unique (manual or e2e when harness available).
- Concurrency: lock unique + bulk EXCLUDE (DB-level).
- Logs: BadRequestException messages for conflict codes (no PII).

## References

- `docs/pricing-strategy.md` — interim policy source.
- `apps/api/src/pricing/pricing.service.ts` — quote totals and campaign discount resolution.
- `apps/api/prisma/migrations/20260820120000_ttw024_pricing_tax_snapshots/migration.sql` — DB constraints.
- `apps/api/scripts/inventory-pricing-conflicts.sql` — conflict inventory.

## Acceptance criteria

- [x] Interim NGN v1 engineering policy recorded (`ngn-v1-interim-2026-08`) with deferred owner-gated items explicit.
- [x] PostgreSQL rejects overlapping bulk quantity ranges; ACTIVE discount subject locks + PCT/FIXED trigger; inventory SQL provided.
- [x] Quote and order creation share deterministic totals; campaign multi-match fails closed.
- [x] Every new order snapshots VAT amount/rate/basis flags, rounding adjustment, and pricing policy version.
- [ ] Stale quote / policy drift confirmation UX (deferred follow-up).
- [ ] Immutable effective-dated tax policy admin versions (deferred follow-up).
- [x] Unit tests cover double-subtract fix and multi-discount fail-closed.
- [x] Pricing docs and migration/rollback notes updated.
- [x] High-risk design, financial-correctness and independent implementation reviews pass with gate evidence.

## Out of scope

- Provider payment settlement → TTW-010 / TTW-012.
- Refund allocation lifecycle → TTW-013 / TTW-041.
- Multi-currency / foreign tax → future ticket.
- Owner-signed legal receipts/accounting and quote-drift UX → follow-up after this PR.

## Design review

**Reviewer:** implementing agent (self) — recorded 2026-08-20 before implementation.\
**Verdict:** APPROVED for interim engineering slice only.

**Blast radius:** `PricingService` quote totals; `OrdersService` create paths; `DiscountsService` lock sync; Prisma `Order` / `BulkPricing` / new `DiscountActiveLock`; migration may fail if overlapping bulk tiers exist (run inventory SQL first).

**Callers:** order quote/create (standard + campaign), admin discount/bulk mutations, Paystack amount from `order.totalAmount` (unchanged field semantics for charged total).

**Duplication:** no second pricing engine; locks mirror existing app validators.

**Interfaces:** `QuoteResult` gains snapshot fields; `PRICING_POLICY_VERSION` constant; order columns nullable for legacy.

**Invariants:** see above; reconciliation uses displayed `totalAmount` with explicit `roundingAdjustment`.

**Edge/failure/concurrency:** multi-discount fail-closed; lock unique P2002 → 400; bulk EXCLUDE on concurrent insert; migration aborts on pre-existing bulk overlaps.

**Arithmetic:** retain JS `number` + centralized minor/display rounding for interim NGN; Decimal migration deferred.

**Migration/rollback:** documented in migration SQL header; legacy orders remain null snapshots.

**Observability:** conflict messages via HTTP 400; no new metrics in this slice.

**Test plan:** unit tests in `pricing.service.spec.ts`; inventory SQL for ops.

**Risks accepted:** owner has not signed legal VAT matrix; interim policy may need revision without rewriting historical snapshots (version string changes forward only).

## Implementation reviews

### Financial-correctness review (independent)

**Iteration 1 — CHANGES_REQUIRED:** inclusive VAT used exclusive formula; FIXED divided by quantity; missing exclusive/rounding/FIXED tests.\
**Iteration 2 — PASS:** inclusive `(taxable * rate)/(1+rate)`; FIXED per-unit; exclusive VAT + display rounding tests; advisory lock + bulk→400 accepted as supporting controls.

Cited paths: `pricing.service.ts` VAT/FIXED/totals; tests `should not double-subtract…`, `should fail closed…`, `should apply FIXED…`, `should add exclusive VAT…`.

### Implementation review (independent)

**Iteration 1 — CHANGES_REQUIRED:** PCT/FIXED trigger race without serialization; bulk EXCLUDE unmapped; inventory incomplete.\
**Iteration 2 — PASS (interim slice):** `pg_advisory_xact_lock` before PCT/FIXED check; bulk EXCLUDE→400; inventory PCT+FIXED query; deferred owner-gated items accepted.

## Verification evidence

```text
pnpm --filter api test -- --testPathPatterns=pricing.service.spec --testPathPatterns=orders.service.spec --no-coverage
# Test Suites: 2 passed; Tests: 27 passed
# Includes: should not double-subtract campaign discount from totals
#           should fail closed when multiple active campaign discounts match
#           should apply FIXED campaign discount per unit without dividing by quantity
#           should add exclusive VAT and record non-zero display rounding

pnpm --filter api exec tsc --noEmit -p tsconfig.json  # exit 0
pnpm --filter api lint  # 0 errors (pre-existing warnings only)
git diff --check  # clean
```

## Completion summary

Shipped interim NGN v1 pricing policy enforcement: corrected merchandise/discount totals, inclusive VAT extraction, order tax/rounding/policy snapshots, fail-closed campaign discount resolution, bulk quantity EXCLUDE, and discount exclusivity locks with advisory-serialized PCT/FIXED checks. Deferred: owner-signed legal VAT/receipts, immutable tax policy versions, quote-drift UX, Decimal migration, effective-window exclusion beyond ACTIVE locks.

PR: pending.
