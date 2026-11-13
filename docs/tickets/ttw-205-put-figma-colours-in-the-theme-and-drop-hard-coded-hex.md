# TTW-205 — Put the Figma colours in the theme and replace hard-coded hex values

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Low\
**Blocked by:** TTW-162\
**Blocks:** None

## Background

Found on 2026-11-12 by reading the colours, fonts and radii of the Figma file `pg6Emcv2r79FaPdkK17ecE` through the Figma API and comparing them with `packages/config/theme.css` and the apps. Not in the client review. Confirm each point against current `main` before designing: the code may have moved.

- The most used Figma colours that carry the brand match the theme: `#004385` (`--color-tamiym-blue`) and `#45FF70` (`--color-tamiym-green`).
- Figma also uses `#1E39D2` for the active product tab and the links of the customer app, `#3BA658` for the "In stock" badge and `#F40928` for the red. None of the three is in the theme. The theme red is `#B10813`.
- `AGENTS.md` and the frontend rules require theme tokens only. A search of the code finds about 100 hard-coded hex values in `apps/app` (38 of them `#004385`, 7 of them `#1E39D2`, plus `#F8FBFF`, `#FFF4D6`, `#7A5A00`) and about 51 in `apps/admin`.
- The header of `theme.css` points to another Figma file (`9xmldPK4dDKp72K3oE7tcA`), not the file the client approved.

Seen running on 2026-11-12: the main buttons of the customer app (Add to cart, Proceed to checkout, Place order and pay, Payment confirmation) are dark blue `#004385`. Figma uses the green accent for these actions, and the `theme.css` header says the accent is for "Save, Place Order, Get Started". The design review must decide whether these buttons move to the accent token, after the client confirms.

The fonts are a separate problem. Figma text is set in Inter and Urbanist, the brand guide says Mundial and Neuffila Grotesk, and the apps load none of them. That is TTW-177 and stays there.

## Proposal

- Decide, with the client's approved design, which of `#1E39D2`, `#3BA658` and `#F40928` are real brand colours. Add the ones that are as tokens in `theme.css`, with a role (link, stock badge, alert). Do not add the others.
- Replace the hard-coded hex values in `apps/app` and `apps/admin` with tokens. Use the existing `--color-tamiym-blue` for `#004385`.
- Correct the Figma link in the `theme.css` header.
- Change no colour a customer would notice other than where Figma and the theme disagree and the design review chose Figma.

## Invariants

- No visible colour change, except the decisions recorded in the design review.
- The green token still passes the contrast work of TTW-162.
- No new hard-coded colour is added.

## Implementation plan

1. Start `codex/ttw-205-put-figma-colours-in-the-theme-and-drop-hard-coded-hex` from current `main`, in its own worktree, after TTW-162 is merged (same file).
2. Confirm the counts against the current code, and update this ticket if it moved.
3. Record the colour decisions in the design review below.
4. Add a check that fails when a hard-coded hex appears outside the theme, or record the baseline and ratchet it down.
5. Replace the values app by app, with a visual check on each.
6. Run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Unit/component: existing tests stay green.
- Integration/e2e: the accessibility and screenshot checks pass without new exceptions, and no snapshot is bulk-updated.
- Failure, retry, and concurrency: not applicable.
- Logs, metrics, traces, and alerts: nothing new.

## References

- `packages/config/theme.css` — current tokens and header link.
- `apps/app/app/dashboard/products/page.tsx` — `#1e39d2` on the active tab.
- TTW-162 (green contrast), TTW-177 (brand fonts).

## Acceptance criteria

- [ ] Every approved Figma colour is a token, with a stated role.
- [ ] No hard-coded hex remains in `apps/app` and `apps/admin`, or the remaining baseline is recorded and enforced.
- [ ] The `theme.css` header links to the approved Figma file.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Brand fonts → TTW-177.
- Darkening the green → TTW-162.

## Design review

Not done yet. Required before implementation.

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not complete.
