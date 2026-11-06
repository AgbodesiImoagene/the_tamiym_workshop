# TTW-149 — Add returns and claims

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Critical\
**Blocked by:** client decision on Q19\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 5.3, No returns or claims** (High, P2, 30–45 h, status "To do"): No model, API or screen. Planned rule: 7 days after delivery, no "change of mind" returns on customised items.

Client answers:

- **Q19, Return policy: 7 days after delivery, no "change of mind" returns on customised items. Approved?** Answer: "Reasonable default. Again need to confirm."

## Proposal

- Add return requests with the planned rule: 7 days after delivery, no change-of-mind return on customised items (awaiting confirmation, Q19).
- Follow the eligibility in `docs/orders/ttw-041-interim-policy.md`.

## Invariants

- No refund is applied before the provider confirms it.
- Stock is restored only after recorded receipt.

## Implementation plan

1. Start `codex/ttw-149-add-returns-and-claims` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Generate the migration with `pnpm --filter api exec prisma migrate dev --name <name>`, after checking that no other open ticket has one in flight.
8. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration on real Postgres: request, approve, refuse, concurrency.
- Playwright: request a return.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `docs/orders/ttw-041-interim-policy.md (Deferred)` — row 5.3
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A customer can open a claim, and an admin can decide it.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Return labels and carrier automation → TTW-047, which stays deferred.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
