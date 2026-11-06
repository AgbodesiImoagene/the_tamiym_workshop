# TTW-157 — Expose catalogue search, sort and price filter

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 2.6, Search, sort and price filter not exposed** (Low, P2, 4–6 h, status "To do"): Supported by the API, not by the UI.

## Proposal

- Add search, sort and a price filter to the customer catalogue, using the existing query.

## Invariants

- Behaviour outside this ticket stays unchanged.

## Implementation plan

1. Start `codex/ttw-157-expose-catalogue-search-and-filters` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Write the tests first and show them failing for the right reason.
4. Implement the proposal in small steps. Record any deviation here.
5. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Playwright: search and sort.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/products/dto/products-query.dto.ts` — row 2.6
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A customer can search, sort and filter products.
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
