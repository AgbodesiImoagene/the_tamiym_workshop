# TTW-056 — Reconcile bank and accounting records

**Epic:** 1 — Financial and inventory integrity\
**Status:** Deferred — post-v1 pending accounting decision\
**Risk:** Critical\
**Blocked by:** TTW-003, TTW-015, TTW-042, TTW-054\
**Blocks:** TTW-057

## Background

TTW-015 reconciles internal records with Paystack but explicitly stops before the bank statement or an accounting system. Provider agreement does not prove cash reached the correct bank account, fees/taxes were posted correctly or the general ledger balances. Finance otherwise depends on spreadsheets and manual adjustments without a durable import, mapping or close trail.

## Proposal

After the owner selects the accounting platform and bank-feed/import approach, extend the reconciliation subsystem with immutable source imports, normalized bank transactions, accounting journal/export batches, mapping rules and period-close evidence. Keep Tamiym's domain ledger as operational subledger and generate balanced, versioned journal lines rather than allowing the accounting integration to mutate orders/payments/payouts.

Start with controlled CSV/statement import and reviewed journal export unless the chosen vendors provide suitable read-only/idempotent APIs. Match using provider settlement reports, references, dates, currency and exact amounts with explicit many-to-one fee/net-settlement support. Unmatched or ambiguous items become findings; no automated money mutation or journal posting without approved controls.

## Invariants

- Imported source files/records are immutable, content-hashed, deduplicated and attributable to institution/account/period.
- Every journal batch balances debit and credit per currency; money is never silently converted.
- Reconciliation is read-only with respect to operational orders, payments, refunds, payouts and inventory.
- An ambiguous match remains a finding and is never guessed or auto-closed.
- Re-import, export retry or accounting API retry cannot duplicate a statement transaction or journal posting.
- Bank/accounting credentials, account numbers, files and narration PII are encrypted/restricted and redacted from logs/exports as policy requires.
- A period cannot close with incomplete imports or unresolved findings above the approved threshold.

## Implementation plan

1. Record finance/accounting ownership, chart of accounts, tax/fee/revenue/liability recognition, bank/accounts, settlement timing, close calendar, materiality, retention and segregation policy.
2. Select accounting/bank integration after security/privacy/vendor review; define API/import/export, sandbox, idempotency, rate limits and outage procedures.
3. Add source/import/file/transaction, mapping version, journal batch/line, external posting receipt, close period and finding links with hashes/uniqueness.
4. Implement private statement ingestion with malware/format limits, schema validation, duplicate detection, normalized signs/dates/references and formula-safe export.
5. Implement deterministic matching of bank settlements to provider batches and TTW-015 evidence, including gross/net fees, refunds, transfers, reversals and unmatched/ambiguous outcomes.
6. Generate balanced journal previews from versioned mapping rules; require finance approval and segregation before immutable export/posting.
7. Add restricted admin import/mapping/review/post/close UI with before/after evidence, rollback/reversal batches and no direct operational repair.
8. Add close dashboards/alerts and runbooks for missing statement, changed source, duplicate posting, mapping error, provider/bank timing and accounting outage.
9. Update financial architecture, privacy/retention, Swagger/contracts where applicable and disaster-recovery evidence.

## Test and observability plan

- Unit/component: parsers, sign/date/timezone, matching, fee/net settlement, balanced journals, mapping versions, materiality and redaction.
- Integration/e2e: representative bank/provider fixtures, duplicate imports, journal sandbox posting/idempotency, RBAC/segregation and close blocking.
- Failure, retry, and concurrency: two imports/posts, corrupt/partial files, provider page missing, accounting timeout after acceptance, mapping change and reversal period.
- Playwright: finance imports a statement, resolves an allowed mapping, second admin approves a balanced batch, posts once and closes only a clean period.
- Logs, metrics, traces, and alerts: import freshness/completeness, matched/unmatched amount/count, journal balance/post result, open finding age and close status without account/narration PII.

## References

- `docs/tickets/ttw-015-reconcile-money-and-inventory.md` — bank statements and accounting systems are explicitly deferred beyond provider reconciliation.
- `apps/api/prisma/schema.prisma:1219-1374` — operational orders/payments/refunds are separate from any accounting journal.
- `apps/api/prisma/schema.prisma:1522-1590` — payout/provider evidence has no bank settlement or general-ledger posting relation.
- `apps/api/src/payouts/payouts.service.ts:279-319` — raw transfer webhook evidence is stored for provider reconciliation only.

## Acceptance criteria

- [ ] Finance/accounting/security approve source accounts, chart/mappings, recognition, materiality, close, roles, vendor and retention policy.
- [ ] Immutable hashed imports and deterministic matching cover settlements, fees, refunds, payouts and reversals without changing operational state.
- [ ] Every journal batch balances by currency, is mapping-versioned and posts/exports idempotently with approval/segregation evidence.
- [ ] Duplicate/partial/ambiguous inputs fail safe and prevent period close above the approved threshold.
- [ ] Restricted UI, encryption/redaction, audit and formula-safe import/export controls pass security tests.
- [ ] Dashboards, alerts and tested import/posting/close/rollback runbooks exist.
- [ ] Critical design/security reviews and two independent implementation reviews pass with exact gate evidence.

## Out of scope

- Internal/provider operational reconciliation → TTW-015.
- Selecting or running a full ERP, payroll or procurement system → separate finance transformation epic.
- Tax filing and statutory remittance → separately counselled compliance ticket.
- Multi-currency/withholding expansion → TTW-057.

## Design review

Pending. Include signed accounting policy, vendor/DPA, source-to-journal lineage, matching/mapping examples, balance invariants, approval/close state machines, credential/file threat model, idempotency and disaster recovery.

## Implementation reviews

Pending. Require two independent reviewers: accounting/financial correctness and security/privacy.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
