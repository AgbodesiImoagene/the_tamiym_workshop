# TTW-247 — Check the design again when a campaign order is placed

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-101; Q23, Q25 (is fundraising postponed?)\
**Blocks:** None

## Background

Found by the two independent reviews of TTW-101 (2026-11-21 and 2026-11-22). TTW-101 freezes the design on each order item when the order is placed, and for **standard** orders it checks the design again inside the order transaction (`assertDesignsOrderableBy(tx, …)` in `apps/api/src/orders/orders.service.ts`, `create`): a design rejected by a moderator, or no longer the buyer's, since the first check is refused instead of frozen.

**Campaign** orders (`createCampaignOrder`) do not get that second check. They also freeze the design (`snapshotDesigns`), but nothing re-reads its status in the transaction. Their only design rule lives in the quote (`apps/api/src/pricing/pricing.service.ts`, around line 466): the line must match a `CampaignProduct` of the campaign with that `designId`. The public offer list only shows `APPROVED` designs (`pricing.service.ts`, around line 727), and `assertDesignsOrderableBy` says campaign quotes "have their own rule and do not use this" (`design-order-eligibility.ts`).

Failure scenario: a supporter opens a live campaign, a moderator rejects the organiser's design, and the supporter's order is created a moment later. The order is placed with the rejected design and the print shop receives it as a frozen copy. The window is the time between the quote and the transaction, plus any gap between listing and ordering (the offer list is not re-read at order time).

Not known yet: how long that window is in practice, and whether `TTW-142` (freeze live campaigns) already makes the design uneditable once a campaign is live. If it does, only a moderation rejection of a live campaign's design remains. Check this before designing.

## Proposal

- Decide with the client what happens to supporters' orders when a live campaign's design is rejected (this is why the ticket waits for Q23 and Q25): refuse new orders, and say what happens to orders already paid.
- In `createCampaignOrder`, inside the transaction and before the snapshot, check again that the line still matches its `CampaignProduct` and that its design is not rejected (and, if the offer list requires `APPROVED`, that it is). Refuse with a stable error code the web checkout can show.
- Reuse the structure of `assertDesignsOrderableBy` (one read per design, same error shape) rather than a second copy of the logic. Whether it becomes a second function next to it or a mode of it is for the design review.

## Invariants

- A rejected design is never frozen on a new order.
- The campaign rule of the quote does not change for a design that is still valid.
- A refusal writes no order, no inventory reservation and no payment.

## Implementation plan

1. Start `codex/ttw-247-recheck-the-design-of-a-campaign-order` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and check what `TTW-142` already does. Update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason: a campaign order whose design is rejected between the first check and the transaction is refused; nothing is written; a valid design still orders.
5. Implement in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an error code or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: `orders.service.spec.ts`, campaign create with a design that is rejected, no longer in the campaign, or missing in the transaction (same style as the standard cases added by TTW-101).
- Integration: real Postgres, a campaign order against a design rejected after the quote; sequential and concurrent orders on a valid design still succeed.
- Playwright: the supporter checkout shows the refusal; the existing fundraiser journeys pass.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/orders/orders.service.ts` — `createCampaignOrder`, `snapshotDesigns`, and the standard recheck added by TTW-101.
- `apps/api/src/pricing/design-order-eligibility.ts` — the standard rule and the note about campaigns.
- `apps/api/src/pricing/pricing.service.ts` — the campaign quote rule.
- `docs/tickets/ttw-101-give-the-workshop-its-print-files.md` — "Implementation reviews", where this was found.
- `docs/tickets/ttw-142-freeze-live-campaigns.md` — may already cover part of it.

## Acceptance criteria

- [ ] A campaign order whose design was rejected after the quote is refused, with a stable code, and nothing is written.
- [ ] A valid campaign order still works, alone and under concurrent orders.
- [ ] The client's answer on what happens to orders already paid is recorded here.
- [ ] Every visible message is in English and the supporter journey was played end to end, with Playwright coverage updated.
- [ ] Swagger, shared contracts and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- The standard order path: done in TTW-101.
- Freezing a live campaign's content: `TTW-142`.
- Locking design rows against concurrent moderation (a row lock): a separate decision, for every order path at once.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
