# TTW-259 — Accept card payments only at launch

**Epic:** 8 — Client review delivery  
**Status:** Not started  
**Risk:** Critical  
**Blocked by:** None  
**Blocks:** None

## Background

The client chose card payments only for launch (2026-11-24, part 2, Q9, option b). Bank transfer and USSD can settle after the 30-minute order expiry, which creates late payments (TTW-088). Paystack lets a charge restrict channels.

## Proposal

Restrict Paystack charge initialisation to the card channel, keeping the provider interface. Behind a setting so other channels can be switched on later without a deploy of code changes if possible (to confirm in design review). TTW-088 late-payment handling stays as a safety net. No Paystack call inside a DB transaction.

## Invariants

- Money uses decimals, never floats. Prices shown to the customer match what is charged.

## Implementation plan

1. Failing test: initialised charge only offers card.
2. Implement and cover sequential and concurrent duplicate paths against real Postgres.
3. Update the payments doc.

## Test and observability plan

- Unit/component: cover the rule and its boundaries.
- Integration/e2e: real Postgres where money or stock is touched.
- Failure, retry, and concurrency: duplicate and concurrent requests.
- Logs, metrics, traces, and alerts: no PII or secrets in logs.

## Acceptance criteria

- [ ] Independently observable outcome described in Proposal.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Contracts, migrations, observability, and documentation are updated where applicable.

## Out of scope

- Anything not named in Proposal.

## Design review

To record before implementation.

## Implementation reviews

To record.

## Verification evidence

To record.

## Completion summary

To record.
