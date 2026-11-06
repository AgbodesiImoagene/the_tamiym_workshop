# TTW-120 — Erase stored files of deleted accounts

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-099\
**Blocks:** TTW-121

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 11.2, Files of a deleted account are not erased** (High, P1, 6–10 h, status "To do"): Deletion is marked complete while images and designs remain stored.

## Proposal

- Implement the deferred `object_store.media` purge, so that a deletion completes only when files are gone.
- Keep files tied to orders within the legal retention period, as a recorded exception.
- Make the purge retry-safe through a bounded queue job.

## Invariants

- A deletion is never marked complete while purgeable files remain.
- Retrying a purge is harmless.

## Implementation plan

1. Start `codex/ttw-120-erase-files-of-deleted-accounts` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: delete an account and confirm the objects are gone, with a storage failure then a retry.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/privacy/privacy.service.ts:520` — row 11.2
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] After deletion, the user's images and designs are no longer stored, except for recorded legal retention.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
