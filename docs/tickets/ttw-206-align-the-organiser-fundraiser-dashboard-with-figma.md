# TTW-206 — Align the organiser fundraiser dashboard with Figma

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** TTW-134, Q23, Q25\
**Blocks:** None

## Background

> Check first that the client kept fundraising before launch (Q23, Q25). If it moved, this ticket waits.

Found on 2026-11-12 by comparing the Figma frames "Dashboard/Fundraiser" and "Dashboard/Fundraiser/WithCampaigns" (file `pg6Emcv2r79FaPdkK17ecE`, nodes `246:6107` and `271:8076`) with the running customer app (`/dashboard/fundraiser`, `apps/app/app/dashboard/fundraiser/page.tsx`). Not in the client review. Confirm each point against current `main` before designing: the code may have moved.

Figma shows, in order:

- Three counters: Items Sold, Supporters, Funds Raised.
- "Your Campaigns": photo cards, each with a status tag (Closed), the product name and size range, the closing date and the amount raised.
- "Your Collection": an empty state ("No Collection — You are two campaigns away from starting a collection") with a green "Start Campaign" button.

The running page shows, in order: an "Organiser access" panel with an application checklist; three counters, Active campaigns, Funds raised and Payout profiles; a "Campaign Overview" list in plain text ("No campaigns yet…"); and a full "Payout Setup" bank form on the same page. It has no "Supporters" counter, no photo cards, no "Your Collection" block and no "Start Campaign" button.

## Proposal

- Use the three Figma counters. Supporters needs a real count from existing data; if none exists, record that in the design review and show it only when the data is real.
- Show campaigns as photo cards with status, closing date and amount raised, using the same real data as the Campaign Overview list today.
- Add the "Start Campaign" call to action in the empty state. It goes to the existing campaign creation flow. The 3-step creation flow in Figma is not part of this ticket (client accepted a single page, Q9).
- Decide in the design review where "Payout Setup" lives. Figma has the bank choice inside the campaign settings, not on this page. TTW-135 owns editing bank accounts, so this ticket moves nothing unless the review says so.
- Keep the organiser approval notice, because applying is part of the policy.
- "Your Collection" is not defined in the PRD. Do not invent it: show it only if the client confirms what a collection is, otherwise leave it out and record that.

## Invariants

- No new money figure is computed in the browser. Totals come from the API.
- An organiser who is not approved still sees what they must complete.
- Copy stays in English.

## Implementation plan

1. Start `codex/ttw-206-align-the-organiser-fundraiser-dashboard-with-figma` from current `main`, in its own worktree, after TTW-134 is merged (same page).
2. Confirm the gaps against the current code, and update this ticket if it moved.
3. Record the design review below before implementing.
4. Write the tests first and show them failing for the right reason.
5. Implement in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Unit/component: counters with and without data; empty state with the call to action; one card per campaign status.
- Integration/e2e: Playwright plays an organiser with no campaign, then with one live and one closed campaign.
- Failure, retry, and concurrency: loading, error, unauthorised and retry states stay modelled.
- Logs, metrics, traces, and alerts: nothing new.

## References

- Figma `pg6Emcv2r79FaPdkK17ecE`, nodes `246:6107` and `271:8076` — the target design.
- `apps/app/app/dashboard/fundraiser/page.tsx` — current page.
- TTW-134 (organiser balance and payouts), TTW-135 (bank accounts), TTW-144 (end date and sales), TTW-141 (end of campaign).

## Acceptance criteria

- [ ] The three counters, the campaign cards and the empty state match Figma, with real data only.
- [ ] "Start Campaign" opens the existing creation flow.
- [ ] The place of "Payout Setup" is decided and recorded.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Playwright acceptance coverage is updated in the same change.

## Out of scope

- The 3-step campaign creation flow → refused (Q9).
- Organiser balance and payouts → TTW-134.
- Editing or deleting bank accounts → TTW-135.

## Design review

Not done yet. Required before implementation.

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not complete.
