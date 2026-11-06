# TTW-099 — Make customer uploads private with signed links

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None\
**Blocks:** TTW-100, TTW-101, TTW-120

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 11.3, Uploads reachable by public URL** (High, P1, 8–14 h, status "To do"): Private storage and temporary links needed, including for AI analysis.
- **Row 9.7, Customer artwork reachable by public link** (High, P1, 0–0 h, status "Included in 11.3"): For AI analysis, originals are made public before moderation.

## Proposal

- Store customer originals in private storage and serve them through short-lived signed links, including for the AI analysis.
- Keep catalogue photos public: only customer uploads change.
- Follow `.cursor/rules/media-security.mdc`, and update `docs/privacy/ttw-025-data-inventory.md`.

## Invariants

- A customer upload is never readable without a valid link.
- Signed links expire and are not logged.
- A file that fails scanning stays unusable, and the scanner still fails closed.

## Implementation plan

1. Start `codex/ttw-099-make-customer-uploads-private` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Generate the migration with `pnpm --filter api exec prisma migrate dev --name <name>`, after checking that no other open ticket has one in flight.
8. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: the public URL is refused, the signed link works and then expires.
- Failure: storage or moderation is unavailable.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/media/media.processor.ts:116` — row 11.3
- `apps/api/src/media/media.processor.ts:116` — row 9.7
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] An original cannot be opened by a permanent public URL, before or after moderation.
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
