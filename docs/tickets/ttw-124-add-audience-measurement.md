# TTW-124 — Add audience measurement to the public site

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 12.4, No audience measurement** (Medium, P1, 4–8 h, status "To do"): No Google Analytics or Plausible; the built-in tracking sends its data nowhere.

Client answers:

- **Q47, Audience measurement: which tool (Google Analytics with a consent banner, cookie-free Plausible…)?** Answer: "Again give informed recommendation."

## Proposal

- Compare cookie-free tools with Google Analytics and a consent banner, on price and fit, and record a recommendation (Q47).
- After the client's approval, wire the chosen tool through `lib/discovery-metrics/transport.ts`.

## Invariants

- No visitor data is sent before the consent the chosen tool requires.
- No personal data enters events (TTW-077).

## Implementation plan

1. Start `codex/ttw-124-add-audience-measurement` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: the transport sends the expected event and nothing without configuration.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/web/lib/discovery-metrics/transport.ts:14` — row 12.4
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] The client can see visitor numbers.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
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
