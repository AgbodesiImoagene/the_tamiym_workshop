# TTW-225 — Guard payouts against overpayment and duplicate runs

**Epic:** 8 — Client review delivery  
**Status:** Not started  
**Risk:** Critical  
**Blocked by:** None for the guards below. The second-approver and refund-after-payout rules need client decisions (see below) and stay out of this ticket until answered.  
**Blocks:** None

Origin: adversarial read-only review of the money flows (finding B3, plus I1), 2026-11-15. Nothing was executed; each claim must be re-proved by a failing test first. Best done after TTW-224, which changes the same payout code.

## Background

Reported by the review:

1. **Manual payout has no balance check.** `initiatePayout` (`apps/api/src/payouts/payouts.service.ts`, around :245-353) never calls the eligible-balance function (`payouts/campaign-ledger.service.ts:198`), which only the payout runs use (`payout-runs.service.ts:175`). One admin can pay any amount.
2. **The scheduler can create one run per day for the same balance.** Two approvals pay the same money twice.
3. **The run amount is frozen at creation.** A refund between creation and execution is not subtracted.
4. **A refund in progress is missing from the balance.**
5. **I1:** two simultaneous executions of the same run can each send a transfer.

Points 1 is confirmed by reading the code; points 2 to 5 come from the review and must be reproduced by tests before any fix.

## Client decisions (not part of this ticket)

- Second approver for payouts above a threshold.
- Who bears a refund requested after the payout (Q30; default in the roadmap: deduct from next payouts).
- Whether the organiser credit is the gross total (delivery, VAT and Paystack fees included).

## Proposal

To be confirmed at the design review:

1. Compute the eligible balance at execution time, inside the same guarded step as the reservation, including refunds in progress. Refuse (with a clear code) an amount above it.
2. Enforce one open run per campaign or balance with a DB unique constraint, not a pre-read.
3. Re-read the eligible amount at execution and cap the transfer to it.
4. Make execution of a run claim-based: a conditional transition (`APPROVED` to `EXECUTING`) so only one executor proceeds.
5. Add `CHECK` constraints where the invariant is simple (non-negative amounts); the schema change goes through `prisma migrate dev`, never hand-written.

## Invariants

- The sum of payouts for a campaign never exceeds its eligible balance.
- One balance is covered by at most one open run.
- A run is executed by exactly one worker.
- Idempotency comes from DB unique constraints and conditional transitions.
- No DB transaction across a Paystack call; ledger entries immutable; decimals only.

## Implementation plan

1. Write failing tests for each reported case (real Postgres, sequential and concurrent duplicates).
2. Design review (critical): invariants, threat and concurrency analysis, migration plan.
3. Implement guards and migration; update `docs/payouts/ttw-042-interim-policy.md`; regenerate OpenAPI and types if endpoints or DTOs change.
4. Independent implementation review.

## Test and observability plan

- Unit: balance computation including refunds in progress.
- Integration (real Postgres): manual payout above balance refused; second run for the same balance refused; refund between creation and execution lowers the transfer.
- Concurrency: two executors on one run; two run creations at once; manual payout racing a run.
- Observability: refusal counters by code; alert on a refused-overpayment attempt.

## References

- `apps/api/src/payouts/payouts.service.ts` — `initiatePayout`.
- `apps/api/src/payouts/payout-runs.service.ts:175`, `executeSinglePayout`.
- `apps/api/src/payouts/campaign-ledger.service.ts:198` — `getEligibleBalance`.
- `docs/payouts/ttw-042-interim-policy.md`.

## Acceptance criteria

- [ ] Failing tests reproduce each reported case that is confirmed, and pass after the change; cases not reproduced are recorded as such.
- [ ] No overpayment and no duplicate run under sequential and concurrent duplicates (real Postgres).
- [ ] Migration is CLI-generated and applies cleanly on a populated database.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Docs, OpenAPI and observability updated.

## Out of scope

- Inconclusive transfer errors and timeouts → TTW-224.
- Approval of manual adjustments without eligibility or bank-account re-check (finding I7) → separate ticket.
- Immutability constraints on the ledger (finding I8) → separate ticket.
- Second approver and refund-after-payout rules → after client answers.

## Design review

Not done yet. Required before implementation (critical).

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not started.
