# TTW-177 — Ship the brand fonts so pages render in Mundial and Neuffila Grotesk

**Epic:** 8 — Client review delivery  
**Status:** Not started  
**Risk:** Standard  
**Blocked by:** Client answer: font files and a web licence for Mundial and Neuffila Grotesk (see ROADMAP, "Décisions à obtenir du client")  
**Blocks:** None

## Background

Found during TTW-176 while reviewing the first Linux visual baselines of the public home page (2026-11-08): every heading and paragraph is drawn in a generic fallback font, not the brand typography.

- The design tokens name two brand fonts (`packages/config/theme.css:98-101`): `--font-heading: "Neuffila Grotesk", …` (headers) and `--font-sans: "Mundial", …` (body, on-screen headers), with the design-rules comment "seven weights (Hair to Black)".
- No font file is shipped anywhere in the repository (no `.woff`, `.woff2`, `.otf` or `.ttf` under `apps/` or `packages/`), there is no `@font-face` rule, and no `next/font` call. Only `theme.css` mentions the names.
- So every browser falls back to `ui-sans-serif, system-ui, sans-serif`: San Francisco on a Mac, Segoe UI on Windows, Roboto on Android, DejaVu Sans on the Linux CI runner. The site looks different on each device, and none of them matches the approved Figma designs.
- `font-heading` is used in `apps/web/components/marketing-sections.tsx`, `apps/app/app/page.tsx` and `apps/admin/app/page.tsx`; `font-sans` is the body font of every surface (`apps/web/app/globals.css:31`).

Both are commercial typefaces. Shipping them on a website needs the font files and a licence that covers web embedding, which only the client can provide or buy.

## Proposal

To confirm at design review, once the client has answered:

1. Self-host the licensed files (`woff2`, the weights the designs use only) with `next/font/local` in a shared place, so web, app and admin load the same files without a request to a third party.
2. Wire the `next/font` CSS variables into `--font-heading` and `--font-sans` in `theme.css`; keep the system fallbacks after them.
3. If the client has no licence: ask for an approved replacement (for example a free Google font of the same style) rather than choosing one.

## Invariants

- Theme tokens stay the single source of the font families (no hard-coded font names in components).
- No font is loaded from a third-party host at runtime (privacy, and it works offline in CI).
- Text stays readable while the font loads (`font-display: swap` or the `next/font` default).

## Implementation plan

1. Get the client's answer and the files; record the licence terms in this ticket.
2. Design review.
3. Add the files and the `next/font/local` setup, then the token wiring.
4. Regenerate the visual baselines with the `update_snapshots` input of `playwright-matrix.yml` (TTW-176), review them on purpose, and commit them.

## Test and observability plan

- Unit/component: none.
- Integration/e2e: the visual baselines (`tests/e2e/visual/`) change on purpose and are reviewed; a check that `document.fonts` reports the brand families as loaded on the home page.
- Failure, retry, and concurrency: page still renders with the fallback if a font file fails to load.
- Logs, metrics, traces, and alerts: none.

## References

- `packages/config/theme.css:98-101` — the font tokens.
- `apps/web/app/globals.css:31` — body font.
- `tests/e2e/visual/` — baselines that will change.
- `docs/tickets/ttw-176-run-browser-matrix-in-ci.md` — where the gap was found.

## Acceptance criteria

- [ ] The client's answer (files and licence, or an approved replacement) is recorded.
- [ ] Web, app and admin render headings in the heading font and body text in the body font, on every browser of the matrix.
- [ ] Visual baselines are regenerated and reviewed on purpose.
- [ ] Required quality gates pass with evidence recorded below.

## Out of scope

- Any other typography change (sizes, tracking, line heights) not caused by the font swap.

## Design review

Required before implementation.

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not started.
