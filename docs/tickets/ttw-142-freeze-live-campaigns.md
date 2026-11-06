# TTW-142 — Freeze live campaigns and their approved designs

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** client decision on Q23 and Q25\
**Blocks:** None

## Background

> Check first that the client kept fundraising before launch (Q23, Q25). If it moved, this ticket waits.

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 9.5, A late rejection stops neither the campaign nor paid orders** (High, P1, 4–8 h, status "To do"): The campaign keeps selling and orders stay in production with no alert.

Client answers:

- **Q40, Design rejected while orders are already paid: automatic refund, contact the customer, or print anyway? Pause the campaign automatically?** Answer: "I think the campaign should be approved before it goes live and frozen once it does. If we later allow edits we’d need versioning so a new version only goes live after approval. I think that covers things if we disallow revoking approvals."

## Proposal

- Per Q40: approval happens before going live, the campaign is frozen once live, and approvals cannot be revoked.
- Refuse design rejections and edits that would affect a live campaign.

## Invariants

- A live campaign's design cannot change.
- A design used by a live campaign cannot be rejected.

## Implementation plan

1. Start `codex/ttw-142-freeze-live-campaigns` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: reject and edit attempts on a design in a live campaign.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/designs/designs.service.ts:523` — row 9.5
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] The late-rejection case from the review can no longer happen.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Editing a live campaign through versions: a later idea in Q40.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
