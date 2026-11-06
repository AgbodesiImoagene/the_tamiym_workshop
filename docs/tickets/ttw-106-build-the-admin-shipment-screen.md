# TTW-106 — Build the admin shipment screen

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None\
**Blocks:** TTW-121

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 5.1, Orders can never be marked shipped or delivered** (Blocker, P0, 15–25 h, status "To do"): The admin screen offers FULFILLED/DELIVERED but the API rejects them and requires a shipment, which has no screen. Shipping emails are never sent.

## Proposal

- Remove the FULFILLED and DELIVERED choices the API refuses.
- Add create-shipment and status actions on the admin order page, using the routes in `admin-shipments.controller.ts`.
- Show the status history and incidents.

## Invariants

- Only the shipment routes move an order to shipped or delivered (TTW-040).
- Shipping emails are sent once.

## Implementation plan

1. Start `codex/ttw-106-build-the-admin-shipment-screen` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Playwright: create a shipment, mark shipped, mark delivered, and see the customer timeline.
- Integration: shipped and delivered emails are queued once.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/orders/orders.service.ts:940` — row 5.1
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] An admin can take a paid order to delivered, and the customer receives the emails.
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
