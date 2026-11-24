# TTW-261 — Show a pointer and a hover on clickable elements in apps/app

**Epic:** 2B — Customer app polish  
**Status:** Complete  
**Risk:** Low  
**Blocked by:** None  
**Blocks:** None

## Background

In `apps/app`, hovering a `<button>` shows the default arrow, not the hand. Tailwind v4's preflight resets the cursor on buttons, and only one file adds `cursor-pointer` by hand. Raw `<button>` (about 59 in 18 files) and `<Link>`/`<a>` (about 38) have no consistent hover. Each new control would need the same classes added again.

## Proposal

Define the behaviour once, in `apps/app/app/globals.css`, in `@layer base`, with `:where()` so the specificity is zero:

- `cursor: pointer` on buttons, `role=button|tab|menuitem`, `a[href]`, `summary`, `select`, `label[for]`, checkbox, radio, submit and button inputs, plus a short colour/opacity transition.
- `cursor: not-allowed` on disabled controls.
- Default hover: buttons at 90% opacity, links underlined.

Any Tailwind `hover:` or `cursor-*` class on a component still wins, so the shared `Button` and styled links keep their own look. New controls inherit the rule without extra classes.

Rejected: adding `cursor-pointer` to each control (repeated forever); changing `packages/ui` `Button` only (does not cover raw buttons and links). Scope is `apps/app` only; `web` and `admin` are untouched.

## Invariants

- Components that set their own hover or cursor keep it.
- Disabled controls never show the pointer.

## Implementation plan

1. Add the base rules to `apps/app/app/globals.css`.
2. Add `tests/e2e/app/clickable-affordance.comprehensive.spec.ts` and list it in `docs/playwright/prd-test-manifest.json` (`APP-CUSTOMER-DASH`).
3. Deviation: the CSS was written and checked by hand in the browser before the test (the test is a regression guard for the rule).

## Test and observability plan

- Unit/component: none (jsdom does not compute Tailwind layers).
- Integration/e2e: Playwright reads `getComputedStyle(...).cursor` on a sidebar link, a button and a disabled button.
- Failure, retry, and concurrency: not applicable.
- Logs, metrics, traces, and alerts: not applicable.

## References

- `apps/app/app/globals.css` — base rules.
- `packages/ui/src/components/ui/button.tsx` — shared button with its own hover.

## Acceptance criteria

- [x] Buttons and links show the hand on hover; checked by hand in the browser (user, 2026-11-24).
- [x] A disabled button shows `not-allowed` (checked in the browser). The e2e spec passes.
- [x] A component class (`cursor-default`) still wins over the base rule (checked in the browser).
- [x] `pnpm --filter app typecheck`, `lint`, `test` and `pnpm playwright:validate` pass, with evidence below.

## Out of scope

- The same behaviour in `apps/web` and `apps/admin` (would move the rules to `packages/config/shadcn.css`).

## Design review

Low risk: implementation review only.

## Implementation reviews

None yet.

## Verification evidence

- Compiled with `@tailwindcss/postcss` from `apps/app/app/globals.css`: the rules are emitted inside `@layer base`.
- Cascade checked in the browser pane (rules injected on the login page): plain `<button>` → `pointer`; disabled `<button>` → `not-allowed`; `<button class="cursor-default">` → `default` (a component class still wins); links → `pointer`.
- `pnpm playwright:validate`: passed (new spec listed under `APP-CUSTOMER-DASH`).
- `pnpm exec prettier --check` on the CSS, the spec, this ticket and the manifest: clean. `pnpm format:check` still flags `docs/tickets/README.md`, `ROADMAP.md` and `ttw-256-...md`; these were not formatted before this ticket.
- `pnpm --filter app test`: 52 suites, 404 tests passed.
- `pnpm exec playwright test tests/e2e/app/clickable-affordance.comprehensive.spec.ts --project=setup --project=chromium-app` on a throwaway database (`tamiym_workshop_test_ttw261`, `REDIS_DB=14`, migrated and seeded with `seed:e2e`, dropped afterwards): 11 passed, including `Clickable elements show a pointer › links and buttons show the hand, a disabled button shows not-allowed`.
- Same command with `globals.css` restored to `HEAD`: the spec fails (`Expected: "pointer"`, `Received: "default"`), so it guards the rule. The CSS was then put back and the spec passes again.
- `pnpm --filter app typecheck` and `pnpm --filter app lint`: clean.
- Note: the dev server on :3002 (stopped for the Playwright run) had been running since 19:26 and did not serve the new CSS; it needs a restart to show the change.

## Completion summary

Buttons, links, tabs, selects and checkboxes in `apps/app` now show the pointer on hover from one place (`apps/app/app/globals.css`), disabled controls show `not-allowed`, and components that set their own hover or cursor keep it. Deviation: the CSS was written before the test, and the test was shown to fail without it. No migration, no PR, nothing committed yet. Follow-up if wanted: the same rules for `apps/web` and `apps/admin` (move them to `packages/config/shadcn.css`).
