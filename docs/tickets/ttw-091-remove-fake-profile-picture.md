# TTW-091 — Remove the fake profile picture and its button

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 1.2, Fake profile picture** (Medium, P1, 1–12 h, status "To do"): Every user sees the same demo photo and the "Upload Profile Picture" button does nothing. 1 h to remove the button, 8 to 12 h to build the feature.

Client answers:

- **Q10, Profile picture: build it, or remove the button?** Answer: "Up to you. Happy to remove for simplicity."

## Proposal

- Remove the demo photo and the inactive upload button. Show nothing in their place, or the user's initials if the layout needs it.

## Invariants

- Behaviour outside this ticket stays unchanged.

## Implementation plan

1. Start `codex/ttw-091-remove-fake-profile-picture` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Write the tests first and show them failing for the right reason.
4. Implement the proposal in small steps. Record any deviation here.
5. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Component: the settings form renders without the image and button.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/app/components/customer-settings-form.tsx:190` — row 1.2
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] No user sees a demo photo or an inactive button in settings.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Real profile pictures: the client accepts removal (Q10).

## Design review

Not required for a low-risk ticket.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
