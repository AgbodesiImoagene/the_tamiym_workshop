# TTW-207 — Align the public site visuals with Figma (arcs, image shapes, call-to-action card, footer, About banner, mobile)

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** TTW-162, TTW-178\
**Blocks:** None

## Background

Found on 2026-11-12 and 2026-11-13 by putting full-page screenshots of the running public site (`apps/web`, desktop 1440 px and mobile 375 px) next to the Figma frames "Home", "About Us", "Fundraiser" and their mobile versions (file `pg6Emcv2r79FaPdkK17ecE`, nodes `151:4186`, `151:4871`, `151:4583`, `425:6885`, `559:6682`, `559:6992`). Not in the client review. The texts of Home and About match Figma. The differences are visual. Confirm each point against current `main` before designing: the code may have moved.

Desktop:

- **Decorative arcs.** Figma draws bold black concentric arcs (about eight rings) around each Home image. The site draws a few very thin grey circles that are barely visible.
- **Image shapes.** Figma uses arch shapes (fully rounded on one side). The site uses rounded rectangles with one large corner, and the images are taller than in Figma.
- **Call-to-action card ("Ready To Create Some Custom Apparel ?").** Figma's card is cyan (about `#0FC2FE`, measured on the exported frame), with the title on one line and thick white arcs in the corners. The site's card is dodger blue (`#1E99FF`), the title wraps on two lines, and thin circles cross the title.
- **Footer.** Figma lists Company: About, Fundraiser, Design Lab. The site lists About, Bulk orders, Fundraisers, Workshop, Contact Us. Payment logos are TTW-178 and social links are TTW-125, not this ticket.
- **About banner.** Figma shows a framed banner image with the title in blue below it. The site puts the title over the billboard photo, where it is hard to read.

Mobile (375 px):

- Figma keeps each Home section as text beside a round image, with the arcs, in a compact page. The site stacks a full-width image under the text, and its title sizes are larger, so the page is about 57 % longer (3,489 against 2,221 px in the same scale).
- The hero title takes three lines on the site, one in Figma.

The site also has things Figma does not: breadcrumbs on About and Fundraiser, and a "Common questions" block on Fundraiser. They come from the discovery and SEO tickets. They are not gaps and stay unless the client asks otherwise.

## Proposal

- Redraw the arcs and the image shapes as in Figma, as shared components. No new image file, if the arcs can be done in SVG.
- Take the call-to-action card colour from Figma and add it to the theme as a token with a named role. Do not hard-code it (see TTW-205).
- Make the title one line on desktop and keep the arcs from crossing text.
- Use the Figma footer link list, unless the design review keeps a link the site needs (record which).
- Put the About title below the banner, as in Figma.
- On mobile, follow the Figma section layout and type sizes, and keep the menu and the "Create An Account" button the site has today, because they are working features.

## Invariants

- Texts, links, metadata and structured data do not change.
- Contrast stays at WCAG AA (TTW-162). No accessibility exception is added.
- Images keep alt text and explicit dimensions so there is no layout shift.
- Copy stays in English.

## Implementation plan

1. Start `codex/ttw-207-align-public-site-visuals-with-figma` from current `main`, in its own worktree, after TTW-162 and TTW-178 are merged (same components and tokens).
2. Confirm the gaps against the current code, and update this ticket if it moved.
3. Record the design review below before implementing.
4. Write the tests first (visual and layout checks) and show them failing for the right reason.
5. Implement in small steps: arcs and shapes, call-to-action card, footer, About banner, mobile. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Unit/component: shared arcs and image-shape components; footer link list.
- Integration/e2e: Playwright checks on Home, About and Fundraiser at desktop and mobile widths, with the accessibility check and no bulk snapshot update.
- Failure, retry, and concurrency: not applicable.
- Logs, metrics, traces, and alerts: nothing new.

## References

- Figma `pg6Emcv2r79FaPdkK17ecE`, nodes `151:4186`, `151:4871`, `151:4583`, `425:6885`, `559:6682`, `559:6992` — the target design.
- `apps/web/app/page.tsx`, `apps/web/app/about/page.tsx`, `apps/web/app/fundraiser/page.tsx`, `apps/web/components/marketing-*.tsx` — current code.
- TTW-123 (menu), TTW-125 (social links), TTW-162 (green contrast), TTW-177 (fonts), TTW-178 (payment logos), TTW-205 (theme colours).

## Acceptance criteria

- [ ] Home, About and Fundraiser match the Figma arcs, shapes, card colour, footer links and About banner at desktop width.
- [ ] The same pages follow the Figma mobile layout and type sizes at 375 px.
- [ ] No text is hidden or crossed by decoration, and the accessibility check passes.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Playwright acceptance coverage is updated in the same change.

## Out of scope

- Site menu → TTW-123. Social links → TTW-125. Payment logos → TTW-178. Brand fonts → TTW-177. Green contrast → TTW-162.
- Fundraiser page promises ("no upfront costs", "risk-free") → open client decision in `ROADMAP.md`.

## Design review

Not done yet. Required before implementation.

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not complete.
