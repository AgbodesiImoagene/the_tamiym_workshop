# TTW-042 — Enforce payout eligibility and policy

**Epic:** 4 — Fulfilment, support and business policy  
**Status:** Not started  
**Risk:** Critical  
**Blocked by:** TTW-003, TTW-011, TTW-015, TTW-023, TTW-030  
**Blocks:** TTW-034, TTW-051, TTW-054

## Background

Payout configuration already supports settlement hold, cadence, minimum amount, manual/approval/automatic modes and campaign overrides. Eligibility, however, requires only an active campaign, an eligible ledger balance and a payout profile/default profile. Payout profile creation accepts caller-supplied account name/number without bank resolution evidence, KYC/ownership status, expiry or suspension. The first profile/default rule is race-prone and not database-enforced. Automated payout can therefore select a destination that has not satisfied an approved business/compliance policy.

## Proposal

Approve a Nigeria v1 payout policy with legal/compliance input and make a versioned eligibility decision mandatory at campaign activation, payout preview, run creation, approval and execution. Separate bank-account validation from organiser identity/business verification. Add durable verification/eligibility status and evidence references, profile versioning/suspension, database-enforced single default, and a policy snapshot on every payout.

Recommended launch posture: `MANUAL` or `AUTO_APPROVAL_REQUIRED`; do not enable `AUTO_EXECUTE` until TTW-011/TTW-015 controls have met an owner-approved clean-run period. Require verified email/phone, approved organiser status, resolved Nigerian bank account with account-name match decision, accepted payout terms, and non-suspended KYC before selection. Profile bank/account edits create or re-verify a new destination and never mutate a destination snapshotted by an existing payout.

## Owner policy decisions

- With legal/compliance counsel, define individual/organisation KYC evidence, verification provider/manual review, age/residency/beneficial-owner rules, renewal/expiry and retention/deletion requirements.
- Define bank-account ownership/name-match thresholds, third-party account policy, profile edit/reverification and failed-verification escalation.
- Approve default payout mode, cadence calculation/timezone, minimum, settlement hold, fee allocation, reserve treatment and maximum per run/organiser/day.
- Define campaign-specific overrides, who may approve them, two-person approval thresholds and whether an approver may also execute.
- Define failure/reversal/retry policy, suspended/closed campaign treatment, negative balance/recovery and organiser communications.
- Approve the clean reconciliation period and explicit authority required before `AUTO_EXECUTE` can be enabled.

## Invariants

- A payout cannot be previewed, created, approved or executed without a currently eligible organiser and verified, non-suspended destination under the same snapshotted policy version.
- Exactly one payout profile may be default per user at the database level; selected destinations belong to the payout recipient.
- Editing bank details never redirects an existing payout; payout destination and eligibility snapshots are immutable after creation.
- Hold/cutoff/minimum/cadence calculations use one documented timezone and exact decimal/minor-unit arithmetic.
- Policy changes do not retroactively change an approved payout; execution rechecks only explicit invalidators such as suspension, expiry or reconciliation hold.
- Reversed/failed/retried payouts preserve TTW-011 exactly-once ledger effects and cannot exceed eligible balance.
- KYC documents, account numbers and provider secrets are encrypted/restricted and never emitted in API responses, logs, metrics or audit payloads.

## Implementation plan

1. Record legal/compliance/finance/operations approval for the payout/KYC matrix, limits, timing examples, roles, automation gate, retention and support procedures.
2. Add versioned payout-policy/eligibility and verification models or equivalent immutable snapshots; add status/reason/expiry/suspension fields and evidence references. Add a partial unique index for one default profile per user and migration conflict report.
3. Replace caller-trusted account identity with server-side bank resolution. Store normalized bank/account identifiers and masked output; encrypt sensitive values or keep documents in private encrypted object storage with narrowly scoped access.
4. Implement payout-profile lifecycle (`PENDING_VERIFICATION`, `VERIFIED`, `REJECTED`, `SUSPENDED`, `SUPERSEDED`) and destination versioning. Make edits invalidate recipient codes and require re-verification.
5. Implement one centralized eligibility evaluator returning stable denial codes and a policy/input snapshot. Invoke it during campaign readiness, preview, run creation, approval and immediately before provider initiation.
6. Enforce cadence/cutoff/minimum/limits deterministically; use advisory/row locks and unique window/business keys so schedulers/runs cannot pay the same eligible value twice.
7. Enforce two-person/role thresholds and an environment/setting guard for automation. Prevent `AUTO_EXECUTE` until the approved TTW-015 clean-run evidence is recorded; audit policy/override/automation changes.
8. Define failure/reversal/retry and reconciliation-hold state transitions using TTW-011 effects. Surface clear admin/organiser next actions without leaking KYC detail.
9. Update organiser/admin UI for verification state, masked destination, policy/cadence/minimum, denial reasons, expiry/suspension and override approval. Add notifications for action required, verified/rejected, scheduled, held, succeeded, failed and reversed.
10. Update Swagger, shared contracts, campaign activation readiness, security/data-retention docs and finance runbooks. Document migration, rollback and emergency payout hold.

## Test and observability plan

- Unit/component: eligibility matrix, name-match/expiry/suspension, policy snapshot, cadence/cutoff/timezone/DST, limits, masking and admin/organiser denial copy.
- Integration/e2e: default-profile constraint, concurrent profile setup, destination versioning, bank simulator, activation/preview/run/approval/execution rechecks, role/separation controls and audit/outbox.
- Failure, retry, and concurrency: verification timeout, profile edited mid-run, suspension after approval, two schedulers, two approvals/executions, provider failure/reversal and reconciliation hold.
- Playwright: organiser verifies a destination and sees eligibility; unverified/suspended organiser is blocked with action; two admins approve where required; automation cannot be enabled without the gate.
- Logs, metrics, traces, and alerts: eligibility denials by safe code, expiring/suspended profiles, runs/payouts held, policy overrides, failed/reversed payouts and automation mode changes; exclude account/KYC PII.

## References

- `apps/api/prisma/schema.prisma:463-480` — settings expose mode, cadence, hold, minimum and retry but no version/limits/automation gate.
- `apps/api/prisma/schema.prisma:1495-1518` — payout profile stores raw bank details and documents the missing one-default constraint.
- `apps/api/src/fundraising/payout-profiles.service.ts:32-63` — first/default selection uses non-transactional count/update calls and does not resolve or verify the bank account.
- `apps/api/src/payouts/payout-runs.service.ts:59-116` — preview eligibility is active campaign, balance, minimum and any selected/default profile.
- `apps/api/src/payouts/payout-runs.service.ts:363-436` — execution resolves a recipient and initiates a transfer without KYC/policy recheck.
- `apps/api/src/payouts/payout-run-scheduler.service.ts:27-91` — daily scheduler may approve and queue `AUTO_EXECUTE` immediately.
- `apps/api/src/payouts/campaign-ledger.service.ts:14-63` — settlement hold is the existing payout maturity control.

## Acceptance criteria

- [ ] Legal/compliance/finance/operations approve and version the KYC, destination, cadence, minimum, hold, fee, limit, reversal and automation policies.
- [ ] Migration/rollback safely add verification/policy snapshots and enforce one default profile per user after reporting/remediating conflicts.
- [ ] Unverified, expired, rejected or suspended organisers/destinations cannot enter or continue a payout at every gate.
- [ ] Destination edits cannot redirect existing payouts and require re-verification/new recipient resolution.
- [ ] Cadence/cutoff/minimum/limits and concurrent schedules cannot duplicate or exceed eligible value.
- [ ] Two-person/role controls and the `AUTO_EXECUTE` clean-reconciliation gate are enforced server-side and audited.
- [ ] Failure, reversal and retry paths preserve TTW-011 ledger invariants and produce actionable, safe notifications.
- [ ] Integration and Playwright policy/authorization/concurrency tests pass.
- [ ] Critical design/security reviews and two independent implementation reviews pass with exact gate evidence.

## Out of scope

- Exactly-once payout provider/ledger transitions → TTW-011.
- Reconciliation implementation → TTW-015.
- General identity verification and organiser application → TTW-023, TTW-030.
- Campaign sellability/readiness beyond payout eligibility → TTW-034.
- International payouts/currencies and tax withholding → TTW-057; accounting integration → TTW-056.

## Design review

Pending. Include signed compliance/finance policy, data-flow/threat model, encryption/retention, eligibility state machine, timing examples, database constraints/locks, automation gate, rollback and provider simulator.

## Implementation reviews

Pending. Require two independent reviewers; one must review financial/concurrency invariants and one security/privacy/compliance.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
