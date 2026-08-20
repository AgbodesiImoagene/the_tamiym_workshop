# TTW-025 — Privacy data inventory (interim v1)

**Policy version:** `privacy-policy/v1-interim-2026-08-20`\
**Status:** Engineering interim — legal/privacy/finance/compliance sign-off still required before production go-live claims.

This inventory is the working source of truth for erasure/export executors. Field-level detail expands as slices land; systems not yet wired record `PROVIDER_DEFERRED` / `SYSTEM_DEFERRED` evidence codes rather than silent success.

## Systems in scope

| System                                              | Personal data                    | Export                                           | Erasure / anonymisation                                                                        | Backup note                 |
| --------------------------------------------------- | -------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------- |
| PostgreSQL `User`                                   | email, name, phone, passwordHash | Yes                                              | Pseudonymise + `DELETED`                                                                       | Restore must re-run erasure |
| PostgreSQL `Address`                                | street, phone, recipient         | Yes                                              | Clear PII fields                                                                               | Same                        |
| PostgreSQL `Order` (+ snapshots)                    | customer contact snapshots       | Partial (order ids, amounts, redacted snapshots) | Keep commercial rows; redact `shipRecipientName`/`shipPhone`/`shipLine*` PII fields on erasure | 7y retention                |
| PostgreSQL payments / ledger                        | amounts, provider refs           | Partial                                          | Keep                                                                                           | 7y                          |
| PostgreSQL `AuthSession` / tokens / MFA             | session metadata, hashes         | No (security)                                    | Delete / revoke immediately                                                                    | N/A                         |
| PostgreSQL payout profiles / campaign payout fields | bank account name/number/code    | No (financial)                                   | Redact profile + campaign inline payout fields on erasure                                      | Keep commercial payout rows |
| PostgreSQL designs / share tokens                   | artwork metadata, public tokens  | Metadata only (no `designData` blob)             | Revoke public tokens                                                                           | Objects separately          |
| Object storage (Spaces/S3)                          | design/media bytes               | No bulk binary in v1 export                      | Async delete by key list                                                                       | Lifecycle rules TBD         |
| Redis / BullMQ                                      | job payloads                     | No                                               | Rely on TTL; no PII in new privacy jobs                                                        | N/A                         |
| Mail / notification providers                       | email, template vars             | No                                               | Suppression on closure; purge deferred                                                         | Provider retention          |
| Paystack                                            | customer email on charge         | No                                               | Deferred provider adapter                                                                      | Provider retention          |
| Telemetry (OTel/logs)                               | may include ids                  | No                                               | Metric labels must stay non-PII                                                                | Retention policy separate   |
| Exports object                                      | full allowlist JSON              | Download once                                    | Delete after expiry                                                                            | Short TTL                   |

## Request deadlines (interim)

- Accept / start: immediate for authenticated owner.
- Complete export packaging: target ≤ 24h (v1 often synchronous for small accounts).
- Download capability: 15 minutes from issue.
- Erasure worker completion: target ≤ 72h; overdue alert after 72h.

## Legal hold

`PrivacyRequest.legalHoldUntil` (timestamptz). While in the future, erasure executors no-op with evidence `LEGAL_HOLD`. Admin-only mutation in later slice; schema present in slice 1.
