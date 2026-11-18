# TTW-224 — Treat inconclusive payout transfer errors as pending, not failed

**Epic:** 8 — Client review delivery  
**Status:** Not started  
**Risk:** Critical  
**Blocked by:** None (one provider-behaviour check is required first, see Background)  
**Blocks:** None

Origin: adversarial read-only review of the money flows (finding B2), 2026-11-15. Nothing was executed; the claims must be re-proved by tests written first.

## Background

The payout transfer call to Paystack is a bare `fetch('https://api.paystack.co/transfer', ...)` with no timeout (`apps/api/src/payouts/payouts.service.ts:213`). The reviewer reports that any error (timeout, unreadable response, network failure) is handled as a definitive failure: the payout is marked failed and the reserved amount is released, although Paystack may have accepted the transfer. A retry or a new run can then pay the same amount twice.

The code already derives a `reference` and an `Idempotency-Key` header from the idempotency key (`payouts.service.ts:206-211`, keys built at `:356` and `:799`). Whether this makes a repeat call safe depends on how Paystack treats a reused reference. That is **not confirmed**: it must be read in the Paystack documentation and tried in test mode before the design is fixed.

The reviewer also reports that the provider reference is not written before the call, so a crash between the call and the write leaves no trace. To be re-checked in the code.

## Proposal

To be confirmed at the design review:

1. Add an explicit timeout to every Paystack payout call.
2. Classify outcomes: definite success, definite refusal (4xx with a clear reason), and inconclusive (timeout, network error, 5xx, unreadable body). Inconclusive moves the payout to a pending/unknown state and keeps the reservation.
3. Resolve unknown payouts by asking Paystack (fetch/verify transfer by reference) or by the transfer webhook, never by retrying blindly.
4. Write the transfer reference to the payout before the network call, with a conditional transition, so a crash leaves a traceable row.
5. Alert an admin when a payout stays unknown beyond a bounded time.

## Invariants

- A payout amount is never released for reuse while the transfer outcome is unknown.
- At most one transfer exists per payout reference, even with retries and concurrent executions.
- No DB transaction is held across the Paystack call.
- Ledger entries stay immutable; money uses decimals.

## Implementation plan

1. Check Paystack behaviour for a repeated transfer reference (docs, then test mode) and record it here.
2. Write failing tests (timeout, 5xx, unreadable body, crash after call).
3. Design review (critical).
4. Implement, update `docs/payouts/ttw-042-interim-policy.md`, regenerate OpenAPI only if a DTO changes.
5. Independent implementation review.

## Test and observability plan

- Unit: outcome classification for each error type.
- Integration (real Postgres): inconclusive error keeps the reservation; second execution does not create a second transfer.
- Concurrency: two executions of the same payout; webhook and retry racing.
- Observability: counter for unknown payouts, age gauge, admin alert.

## References

- `apps/api/src/payouts/payouts.service.ts:187-213` — transfer call and reference.
- `apps/api/src/payouts/payouts.service.ts:356`, `:799` — idempotency keys.
- `apps/api/src/payouts/payout-runs.service.ts` (`executeSinglePayout`, around :686-723).
- `docs/payouts/ttw-042-interim-policy.md` — payout state machine.

## Acceptance criteria

- [ ] Paystack behaviour for a repeated reference is documented here with its source.
- [ ] A test fails today showing an inconclusive error releases the reservation; it passes after the change.
- [ ] No duplicate transfer under retry or concurrent execution (real Postgres).
- [ ] Every payout call has a timeout.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Docs and observability updated.

## Out of scope

- Balance and duplicate-run guards → TTW-225.
- Raw provider payload and bank account numbers stored in `rawEvent` / audit logs (minor finding) → separate ticket.

## Design review

Not done yet. Required before implementation (critical).

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not started.
