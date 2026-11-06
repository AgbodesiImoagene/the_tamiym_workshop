# TTW-118 — Remove the unproven About page figures

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 12.6, About page figures to be substantiated** (Medium, P0, 0–0 h, status "Info / decision"): "6+ years, 100+ campaigns, 5,000+ products": to be confirmed (FCCPA).

Client answers:

- **Q49, About page figures "6+ years, 100+ campaigns, 5,000+ products": accurate and provable?** Answer: "No. Currently just filler."

## Proposal

- Remove "6+ years, 100+ campaigns, 5,000+ products" from the content registry: the client confirms they are filler (Q49).
- Replace them only with facts the client supplies.

## Invariants

- Behaviour outside this ticket stays unchanged.

## Implementation plan

1. Start `codex/ttw-118-remove-unproven-about-page-figures` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Write the tests first and show them failing for the right reason.
4. Implement the proposal in small steps. Record any deviation here.
5. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Validators: answer-content and public-IA checks.
- Playwright: the About page renders without the figures.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/web/lib/content/registry.ts:131` — row 12.6
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] The public site makes no unproven numerical claim.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Not required for a low-risk ticket.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
