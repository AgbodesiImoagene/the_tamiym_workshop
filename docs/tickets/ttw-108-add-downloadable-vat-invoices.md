# TTW-108 — Add downloadable VAT invoices

**Epic:** 8 — Client review delivery\
**Status:** Complete\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 4.8, No downloadable invoice or receipt** (Medium, P1, 8–12 h, status "To do"): Figma "Download Invoice" missing.

Client answers:

- **Q15, Invoice or receipt: is a VAT-compliant invoice required (legal mentions, numbering)?** Answer: "Yes."

## Proposal

- Generate an invoice for a paid order from its frozen data, with sequential numbering enforced by the database.
- Add the "Download Invoice" action on the order page.
- The legal name, address and tax number must come from the client: ask before design review.

## Invariants

- An invoice number is unique and never reused.
- An invoice never changes when products or settings change.
- Only the owner and admins can download it.

## Implementation plan

1. Start `codex/ttw-108-add-downloadable-vat-invoices` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Generate the migration with `pnpm --filter api exec prisma migrate dev --name <name>`, after checking that no other open ticket has one in flight.
8. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: numbering under concurrency, owner and foreign user.
- Playwright: download an invoice from a paid order.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- No invoice code — row 4.8
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] A customer can download a VAT-compliant invoice for a paid order.
- [x] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [x] Swagger, shared contracts, migrations and docs are updated where applicable.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Recorded 2026-11-22, before implementation (risk High).

**Finding confirmed on `main` (4493cac).** No invoice code, table or endpoint exists. The order page has no download action. `SiteSettings` holds VAT settings but no seller identity. `Order` already stores the frozen money fields (`subtotalAmount`, `discountAmount`, `shippingFee`, `vatAmount`, `vatRateSnapshot`, `pricesIncludeVatSnapshot`, `roundingAdjustment`, `totalAmount`) and the buyer/shipping snapshot. `OrderItem` stores `productNameSnapshot`, `variantDisplaySnapshot`, `quantity`, `unitFinalPrice`.

**Client decision (user, 2026-11-22).** The seller's legal name, address and tax number are not known yet. They live in `SiteSettings` (admin-editable). Seeds and e2e use obvious test values. The client gives the real values before production. An invoice is never issued while any of the three is missing: the request is refused with `INVOICE_SELLER_DETAILS_MISSING`.

**Invariants and how the database enforces them**

1. A number is unique and never reused: `invoices.number` and `invoices.sequence` are `UNIQUE`.
2. Numbers have no gaps: a one-row counter table is incremented with an atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` in the same transaction as the invoice insert. A rolled-back insert rolls the counter back too. A Postgres sequence was rejected because it leaves gaps after a rollback.
3. One invoice per order: `invoices.orderId` is `UNIQUE`. Issuing is idempotent: a concurrent or repeated request hits the unique constraint, the loser rolls back (counter included) and reads the winner's row. No pre-read check decides correctness.
4. An invoice never changes: a `BEFORE UPDATE OR DELETE` trigger raises an error. The row stores a full snapshot (seller, buyer, lines, VAT rate, amounts), so later product or settings changes cannot reach it. Deleting an order that has an invoice is blocked by the foreign key (`ON DELETE RESTRICT`).
5. Only the owner and admins read it: the customer route returns 404 for another user's or a missing order. The admin route needs the ADMIN role.

**Decisions**

- Issued on first download, not at payment settlement: settlement is a critical path and must not gain new failure modes. The number reflects issue order, not payment order.
- Eligible orders: `paymentStatus = SUCCEEDED` and status `PAID`, `PROCESSING`, `FULFILLED` or `DELIVERED`. Refused: unpaid, cancelled, fully or partially refunded orders never invoiced (they need a credit note: out of scope), legacy orders without a VAT snapshot (`vatAmount` null).
- An invoice already issued stays downloadable whatever the order becomes later.
- Output is a PDF built with `pdfkit` and the built-in Helvetica font, so amounts read `NGN 1,234.50` (no naira glyph, no font file to ship). Lines come from the stored snapshot only.
- No database transaction is held across a network call: issuing touches only Postgres.
- Logs contain the order id and invoice number only: no name, address or tax number.

**Threats considered:** enumeration of order ids (404 for foreign orders), double issue under concurrency (unique constraint), mutation by a later admin script (trigger), PDF injection from customer text (text is drawn as plain strings, never interpreted), header injection in the file name (name is built from the invoice number, fixed charset).

**Out of scope:** credit notes for refunds, e-invoicing integrations, emailing the invoice, an admin screen button (the admin API route exists).

## Deviations from the plan

- The ticket proposed a plain download action. Added an admin form block "Invoice seller details" under Settings (site settings page), because the seller identity has to be editable by an admin before invoices work. The admin API route `GET /v1/admin/orders/:id/invoice` exists, but the admin order screen has no button.
- `pdfkit` is pinned at 0.17.2, not the latest 0.21: 0.21 pulls an ESM-only `fontkit` that Jest (CommonJS) cannot load. 0.17.2 uses `fontkit` 2.
- The existing `site-settings-save.comprehensive.spec.ts` and `tests/e2e/fixtures/admin-api.ts` were updated: the admin form now always sends the three seller fields, so the exact PATCH body in that spec grew by three string fields. No assertion was removed or weakened. The user should confirm this is acceptable.
- Seed: `seed:e2e` now also stores test seller details and gives the seeded DELIVERED campaign order a VAT snapshot, so it can be invoiced.
- `migration.sql` was generated with `prisma migrate dev --create-only` on a throwaway database, then the immutability trigger and the counter row were appended by hand (same practice as TTW-024).

## Implementation reviews

**Review 1 (2026-11-22, `/code-review high`, run by the implementer's own session, so not fully independent).** Ten findings.

Fixed:

- Billed party: the invoice is now addressed to the account holder (first and last name), falling back to the shipping recipient, then to "Customer".
- Lines: they are printed at the price before the unit discount, so they add up to the pre-discount subtotal as the pricing service defines it (`pricing.service.ts`). An order whose lines do not add up to its subtotal is refused with `409 INVOICE_ORDER_TOTALS_MISMATCH` instead of producing a contradictory immutable invoice.
- Seller details are read inside the issuing transaction.
- Unit tests added for `InvoicesService`, the PDF renderer (one page, many pages, deterministic bytes) and the site-settings controller changes.
- The PDF creation date is the invoice issue date, so the same invoice always gives the same bytes. The Playwright journey now compares the two downloads byte for byte.
- The API e2e suite deletes the settings row it created.

Not fixed, left to the user:

- Issuing happens on a `GET`. A `POST` to issue plus a `GET` to read would keep reads free of side effects. Kept as is: the call is idempotent and the page only calls it on a click.
- The "Download invoice" button repeats the status list of the API rule, so a legacy paid order without a VAT snapshot shows the button and then an error message. A server-computed `invoiceAvailable` flag on the customer order DTO would fix it: separate small ticket.
- The saved file is named `invoice-<order id>.pdf`, not the invoice number, because the browser cannot read the `Content-Disposition` header without a CORS `exposedHeaders` change.

**Review 2, independent (2026-11-22, fresh read-only session, risk High: security + integration).** Verdict PASS conditionnel, no certain blocker. Numbering, immutability, access control, amounts and the OpenAPI contract were checked without problems.

Fixed after the review:

- M1: an order partially refunded, then moved back to `PROCESSING` by an admin, could be invoiced at full price. Any refund not in `FAILED` now refuses the invoice (`INVOICE_ORDER_NOT_ELIGIBLE`). Unit tests for every refund state and an e2e test with a real `SUCCEEDED` refund.
- M2: eligibility was checked outside the transaction. The order row is now locked (`SELECT ... FOR UPDATE`) and eligibility, existing invoice and seller details are re-read under that lock. Unit tests for the locked recheck.
- B1: the "burns no number" test did not prove a rollback. A new e2e test makes `invoice.create` fail after the counter moved, checks the counter is unchanged, and that the next invoice takes the returned number. The seller test no longer passes on two `undefined` values.

**Review 3 (same reviewer, 2026-11-22, on the fixes).** PASS. The row lock serializes with every refund write and status update (both refund paths lock the order row; any `INSERT refunds` takes a key-share lock on it), and the lock order order, then counter, has no cycle. Follow-ups done: an e2e test where a refund is held open in a second transaction proves the invoice request waits, then refuses and burns no number; the rollback test now checks both raw queries ran before the failed insert; an e2e case for an order whose only refund failed; one policy sentence on `FAILED` not being final. After a late confirmation, an invoice issued while the refund was `FAILED` stays at full price (credit notes are out of scope).

Accepted, not fixed (reviewer's low findings): e2e numbering assertions assume nobody else issues invoices on the same database (use a dedicated database); `TRUNCATE` bypasses the trigger and a hand-reset counter would make issuing fail with a 500 (operations note, no duplicate possible); names outside Latin-1 (for example ọ, ẹ, ṣ) may be altered by the built-in PDF font (embedding a TTF font is the fix, not verified visually); the issue date is UTC, not Lagos time; issuing on a `GET` stays a product choice to confirm.

The reviewer's report was a local untracked file, not committed.

## Verification evidence

Run on 2026-11-22 in the worktree, against throwaway databases `tamiym_workshop_test_ttw108` (API e2e) and `tamiym_workshop_test_ttw108pw` (Playwright), Redis dbs 14 and 13. The throwaway databases and the Redis dbs were dropped afterwards.

| Check                                                               | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New unit tests first, before the code                               | `invoice-snapshot.spec.ts`: "Cannot find module" (feature absent). `order-invoice.test.tsx`: 5 failed for the missing button. Review fixes: 3 failed before the change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm lint`                                                         | 0 errors (22 admin and 14 api warnings, existing)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `pnpm format:check`                                                 | all files formatted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `pnpm typecheck`                                                    | 6 of 6 tasks pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `pnpm test`                                                         | web 84, app 344, api 2234 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `pnpm openapi:check`                                                | no drift                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `pnpm docs:validate`, `pnpm playwright:validate`                    | pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `pnpm coverage:ratchet`                                             | pass (lines 85.96%, branches 71.51%, functions 77.02%)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `pnpm coverage:diff` (after the commit, base `origin/main`)         | 161 of 163 changed lines covered (98.77%), floor 80%                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| API e2e, whole suite                                                | 66 of 67 suites passed. `auth-token-hashing` failed once (a race in the reset test, 404 on login) and passed twice when rerun alone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| API e2e, invoice suites                                             | `invoices.e2e-spec.ts` 19 tests (rerun after the review fixes), `seed-e2e-site-settings`, `schema-reconciliation`: pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Playwright `order-invoice.spec.ts`                                  | 2 of 2 pass in each of the last 4 runs. The very first run failed once because the button was not found; the cause was not identified and it did not recur.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Playwright `site-settings-save.comprehensive.spec.ts` (3 viewports) | pass (ran inside a wider run)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Playwright, wider run of the app, admin, web and journey projects   | 244 passed, 11 failed in specs not touching invoices. **Compared with `main` (4493cac, own worktree and database) on 2026-11-22:** the same 9 spec files, run the same way (`--no-deps`, projects setup, web, app, admin, journeys), give **18 failed and 11 passed on `main` and 18 failed and 11 passed on this branch, with the same failing files**: admin order print files (12, no object storage locally), admin shipping rate brackets (2), checkout shipping coverage (1), design workshop low resolution (1), admin shipment problem (1), admin shipment journey (1). Password reset, email verification banner and MFA recovery pass on both when run apart, so their failures in the wide run came from run order (rate limits, shared state), not from this change. |
| PDF layout                                                          | A sample invoice was rendered and looked at (one page, readable). Not checked in a PDF reader other than Quick Look.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

Not verified: invoice numbering on a database with real production volume; behaviour with a real seller identity; an invoice for an order paid with a discount through the whole checkout path (covered by unit tests only); the admin "Invoice seller details" form was typechecked and kept the settings spec green but was not exercised on its own in a browser.

## Completion summary

A customer can download a numbered PDF VAT invoice from a paid order page. Invoices are stored with a full snapshot, numbered without gaps from a counter updated in the same transaction (after locking the order row), and refused at the database for any update or delete. An admin sets the seller name, address and tax number under Settings; until they are set, no invoice is issued.

Merged into `main` on 2026-11-22 (merge `938cc75`). Branch CI green: https://github.com/AgbodesiImoagene/the_tamiym_workshop/actions/runs/45071762714. CI on `main` green: CI https://github.com/AgbodesiImoagene/the_tamiym_workshop/actions/runs/45074322221 and Playwright Comprehensive https://github.com/AgbodesiImoagene/the_tamiym_workshop/actions/runs/45074322258.

Still open:

- The client must give the real seller legal name, address and tax number. Until they are saved in Settings, customers get "Invoices are not available yet".
- Follow-ups left as they are (see the reviews above): issuing on a `GET`, an `invoiceAvailable` flag on the order DTO, the saved file name, fonts beyond Latin-1, the issue date in UTC, credit notes for refunds, an admin button for the invoice.
