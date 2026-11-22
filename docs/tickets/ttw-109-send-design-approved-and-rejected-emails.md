# TTW-109 — Send design approved and rejected emails

**Epic:** 8 — Client review delivery\
**Status:** Implemented, awaiting merge\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 9.2, "Design approved / rejected" emails never sent** (Medium, P1, 2–4 h, status "To do"): Templates and rules exist, but no code triggers them.

## Proposal

- Emit the existing template events when a moderation decision is recorded, through the outbox.

## Invariants

- One decision sends one email.
- Internal moderation notes are never included.

## Implementation plan

1. Start `codex/ttw-109-send-design-approved-and-rejected-emails` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: approve and reject each queue one email, and a retried decision does not send a second.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/mail/mail-outbox-templates.ts:13` — row 9.2
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [x] A customer is told when their design is approved or rejected.
- [x] Swagger, shared contracts, migrations and docs are updated where applicable.
- [x] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Confirmed on `main` (111b614): the constants, templates (`design-moderation-*.hbs`), template resolution and the `TRANSACTIONAL` taxonomy exist, but nothing queued the events.

Decisions:

- **Scope: human decisions only.** The email is sent for an admin decision and for an appeal resolution, with outcome `APPROVED` or `REJECTED`. Automatic (AI/system) decisions, `FLAGGED`, `PENDING`, media and campaign decisions send nothing. Reason: the owner already sees the automatic result on screen, and every save would otherwise send an email. Client's product owner confirmed "the admin validates the design".
- **Where:** `ModerationDecisionService.recordDecisionInTx`, so every path (admin PATCH, appeal resolution) is covered and the email is created in the same transaction as the decision (no decision without email, no email without decision).
- **One decision, one email:** `dedupeKey = <eventName>:<decisionId>` (unique). An admin repeating what an earlier human decision (admin or appeal) already said sends nothing: the design row is locked (`FOR UPDATE`) and the previous decision of the subject is read, so two concurrent identical decisions queue one email. A previous automatic decision does not count (the owner was never emailed for it). An appeal resolved to APPROVED or REJECTED always answers the appellant (it is a distinct decision; `resolveAppeal` already locks the appeal and claims it conditionally).
- **No notes:** the payload is built from scratch (`designId`, `designName`, `productName`, `firstName`); `internalEvidence`/`moderationNotes` are never read for it.
- **Delivery latency:** `dispatch` with a `tx` does not enqueue the job (it cannot before commit), so the row is delivered by the 2-minute outbox sweep. Accepted: no urgency for this email; no new code path to keep consistent.
- No endpoint, DTO, schema or migration change, so no `openapi:generate`.

Risk: Standard (no money, no schema change, no new endpoint).

## Implementation reviews

Round 1, independent reviewer (sub-agent, read-only), verdict **PASS with reservations**, no blocker. Confirmed: no notes in the payload or dedupe key; `FOR UPDATE` + re-read is race-safe under READ COMMITTED with a consistent lock order (appeal then design); no module cycle; AI/system decisions filtered.

Reservations and handling:

1. _(medium)_ An admin confirming a status that only the AI had set sent nothing, so the owner was never told. **Fixed:** the "already said" guard now compares with the previous decision and counts only an earlier human decision (admin or appeal). Unit test added: `sends the email when an admin confirms what only the AI had decided`.
2. _(low)_ Comment claimed an appeal always sends an email; one resolved to FLAGGED/PENDING sends none. **Fixed:** comment and docs say "resolved to APPROVED or REJECTED".
3. _(low)_ Idempotence rests on the lock and the previous decision, not on a DB unique constraint (each replay is a new decision id). **Accepted:** the lock is correct and the concurrent e2e is the safety net. A DB-level guarantee would need a schema change, out of scope for this Standard ticket.
4. _(low)_ A suspended owner still gets the email (no status filter). **Accepted:** a decision on their design is transactional; `User` has no soft delete and deletion cascades.
5. _(low)_ Unit tests mock the lock; only the e2e proves concurrency, with one pair of promises. **Accepted** as is.

## Verification evidence

All run in the worktree `.claude/worktrees/ttw-109` on `codex/ttw-109-send-design-approved-and-rejected-emails`.

- Tests first, seen failing for the right reason: unit tests `design decision emails (TTW-109)` in `moderation-decision.service.spec.ts` (3 failed with `dispatch` never called, before the implementation); e2e `test/design-moderation-emails.e2e-spec.ts` (4 of 5 failed with the call to `queueDesignDecisionEmail` disabled).
- After the review fix (final run): `pnpm --filter api test:coverage` → 179 suites, 2244 tests passed.
- `pnpm --filter api test:e2e -- test/design-moderation-emails.e2e-spec.ts` → 5 passed (approve, reject, sequential + concurrent replay, flagged/AI send nothing, appeal resolved once).
- Before the review fix, with `design-content-validation` e2e as well → 12 passed.
- `pnpm --filter api typecheck` → clean. `pnpm --filter api lint` → 0 errors (14 existing warnings, none in changed files).
- `pnpm format:check`, `pnpm docs:validate` → pass. `pnpm coverage:ratchet` → pass; `pnpm coverage:diff` → 18/18 changed lines covered.
- Not run: Playwright (no UI change), `openapi:generate` (no contract change).

## Completion summary

When an admin approves or rejects a design, or resolves an appeal to APPROVED/REJECTED, the owner gets exactly one email, queued through the outbox in the decision's own transaction. It never contains moderation notes; a repeated or concurrent identical admin decision sends no second email; automatic (AI/system) decisions and FLAGGED/PENDING send nothing. Delivery happens within 2 minutes (outbox sweep). Files: `moderation-decision.service.ts`, `moderation.module.ts`, `docs/notifications/ttw-043-interim-policy.md`, tests. Not done here: ROADMAP checkbox (local file), push, merge.

Follow-up noticed, out of scope: the code still runs an AI screening on every design save and stores its verdict (`designs.service.ts`); the client says the admin alone validates, so whether that screening should stay is a product question for a separate ticket.
