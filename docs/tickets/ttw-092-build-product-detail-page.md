# TTW-092 — Build the product detail page

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** TTW-093, TTW-058, TTW-123

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 2.2, Product detail page missing** (Blocker, P0, 25–40 h, status "To do"): Gallery per colour, quantity per size, order note, related products (Figma "Product Info"). The API already provides the data.
- **Row 2.1, Size and colour cannot be chosen** (Blocker, P0, 0–0 h, status "Included in 2.2"): "Add to cart" picks the first in-stock variant with quantity 1. A bulk order across sizes is impossible outside the Design Workshop.

## Proposal

- Add `dashboard/products/[id]` following the Figma "Product Info" design: gallery per colour, quantity per size, related products.
- The add-to-cart action creates one cart line per chosen variant. Remove the first-variant shortcut from the list page.
- `CreateOrderDto` has no obvious order-note field. If the design requires a note, record that gap in the design review before adding it.

## Invariants

- The cart stores ids, quantities and labels only. The server quote stays the price authority.
- Cart behaviour from TTW-037 is unchanged.

## Implementation plan

1. Start `codex/ttw-092-build-product-detail-page` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Component: variant selection, out-of-stock, loading, empty and error states.
- Playwright: choose sizes and colours, add to cart, see the correct lines at checkout.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- No dashboard/products/[id] route — row 2.2
- `apps/app/app/dashboard/products/page.tsx:210` — row 2.1
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A customer can buy several sizes of a product in one action, without the Design Workshop.
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
