# TTW-141 — Complete campaign end handling

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-131; client answers Q17 and Q35; client decision on Q23 and Q25\
**Blocks:** None

## Background

> Check first that the client kept fundraising before launch (Q23, Q25). If it moved, this ticket waits.

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 6.12, Campaign end triggers nothing** (Medium, P1, 6–10 h, status "To do"): No email to the organiser, no production or final payout trigger, public link shows "no longer available" instead of a summary.

Client answers:

- **Q24, End of campaign: production, delivery, final payout? Can a campaign be extended?** Answer: "What exactly are the questions here? Yes it makes sense to extend campaigns."
- **Q32, Ended campaign page: keep it visible with a summary, or hide it?** Answer: "Archived and visible makes sense here."

## Proposal

- Send the end email to the organiser.
- Keep the ended campaign's public page visible as an archive with a summary (Q32).
- Allow extending a campaign (Q24).
- Connect production and final payout according to the client's answers to Q17 and Q35.

## Invariants

- A campaign ends once.
- An archived campaign cannot take orders.

## Implementation plan

1. Start `codex/ttw-141-complete-campaign-end-handling` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: expiry sends one email.
- Playwright: an ended campaign shows its summary and cannot be bought.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/fundraising/campaign-expiry.service.ts` — row 6.12
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] An ended campaign has a clear outcome for organiser and visitors.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
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
