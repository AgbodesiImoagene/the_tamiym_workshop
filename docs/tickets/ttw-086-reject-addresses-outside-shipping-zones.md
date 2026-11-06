# TTW-086 — Reject addresses outside every shipping zone

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None\
**Blocks:** TTW-087, TTW-098

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 5.6, ₦0 shipping when the address matches no zone** (Critical, P0, 3–5 h, status "To do"): No error or alert: the fee is zero and the workshop pays for delivery.

Client answers:

- **Q22, Address outside every zone: reject the order, or apply a default rate?** Answer: "Will check but for now reject. We need to communicate this clearly on handover to the admins so they can enter all their available zones accurately. Could also be an admin setting."

## Proposal

- When no rate matches the address, the quote and order creation fail with a stable error code instead of a ₦0 fee.
- Standard and fundraiser checkouts show a clear English message and keep the cart.
- Record in the handover notes that admins must enter all their zones (client request, Q22).

## Invariants

- No order is created with a ₦0 shipping fee because a zone was missing.
- An explicit ₦0 rate set by an admin stays valid.
- A retry after a corrected address still works (TTW-037).

## Implementation plan

1. Start `codex/ttw-086-reject-addresses-outside-shipping-zones` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: no matching rate, explicit ₦0 rate, matching rate.
- Integration: quote and order create for an uncovered address.
- Playwright: the checkout shows the message and the cart survives.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/pricing/pricing.service.ts:297` — row 5.6
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] An address outside every zone cannot be ordered, and the customer understands why.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- An admin setting for a default rate: the client mentions it as an option, not for now.
- State and LGA lists → TTW-087.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
