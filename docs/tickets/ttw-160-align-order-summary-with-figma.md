# TTW-160 — Align the order summary and confirmation with Figma

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Low\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 4.4, Order summary and confirmation lighter than Figma** (Low, P2, 4–8 h, status "To do"): No thumbnails in the summary, no related products on "Purchase Successful".

Seen running on 2026-11-12 (`/dashboard/checkout` on the customer app): the order summary lists the product name and quantity only. Figma's "Order Total" has a photo, a quantity stepper and a trash button per line, and a Discount line (the discount itself is TTW-096). The main button reads "Place order and pay" and looks washed out in blue-grey while the quote is missing; Figma has a green "Place Order". The card, "Pay on delivery" and PayPal parts of the Figma payment box stay out: the client accepted the Paystack redirect (Q8) and refused cash on delivery (Q11).

## Proposal

- Add thumbnails to the summary, and related products on "Purchase Successful".

## Invariants

- Behaviour outside this ticket stays unchanged.

## Implementation plan

1. Start `codex/ttw-160-align-order-summary-with-figma` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Write the tests first and show them failing for the right reason.
4. Implement the proposal in small steps. Record any deviation here.
5. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Playwright: both appear.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- Compared with the Figma screenshots — row 4.4
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] Both screens match Figma.
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
