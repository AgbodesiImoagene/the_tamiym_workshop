# TTW-253 — Align the customer app screens with the approved Figma

**Epic:** 8 — Client review delivery\
**Status:** In progress (slice 1: Product list card)\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** TTW-254 (visual bug fixes), TTW-255 (general polish)

## Background

Decision by the user, 2026-11-22: after the delivery backlog, the work moves to the UI, starting with `apps/app` (the customer and organiser workspace). The order is: 1) align with Figma (this ticket), 2) fix visual bugs, 3) general polish. The two later tickets are written after this one.

`docs/design-rules.md` says the approved Figma ("TTW-Site") is the source of truth and that the UI must not be redesigned. No audit exists today that lists, screen by screen, where `apps/app` differs from it (confirmed by search in `docs/`). The Figma canvas is not readable from here; the reference is the 54 captures in `revue-client/screenshots/` (main checkout only, never committed; the page name is written above each capture).

Screens in scope (from `apps/app/app/`, to confirm against current `main`):

- Auth: `auth/login`, `auth/register`.
- Dashboard: `dashboard/page.tsx`, `components/customer-dashboard-shell.tsx`.
- Design Workshop: `dashboard/design/**`, `design/shared/[shareToken]`, `components/workshop/*`.
- Products, cart, checkout: `dashboard/products/**`, `dashboard/cart`, `dashboard/checkout`.
- Orders: `dashboard/orders/**`, `orders/[id]/confirm`.
- Campaigns: `dashboard/fundraiser/**`.
- Account: `dashboard/profile`, `dashboard/settings`.

Existing tests: `apps/app/__tests__/` covers checkout, orders, products, settings, shared design and the workshop (about 20 files). Login, register, dashboard home, cart, fundraiser, profile and the dashboard shell have no unit test. `tests/e2e/app/` has 26 specs.

## Proposal

1. **Audit first (read only).** For each screen, compare the running screen with its capture and write a gap table in this ticket: element, Figma, current, severity. Each gap is classed: _alignment_ (this ticket), _bug_ (→ TTW-254), _polish_ (→ TTW-255), or _needs a decision_.
2. **Fix the _alignment_ gaps only**, zone by zone, in small commits-ready diffs. If the audit shows too many gaps for one reviewable diff, split this ticket by zone (new numbers, recorded here) instead of growing it.
3. Use the shared theme tokens only (`packages/config/theme.css`); no hard-coded colours, sizes or spacing. A missing token is added to the theme, not worked around.
4. UI text stays in English. No new flow, no redesign.

Rejected alternatives:

- Fixing while auditing: it hides the size of the work and mixes alignment, bugs and polish in one diff.
- One giant ticket for the three phases: not reviewable.

## Audit (2026-11-22)

Method: the 54 captures were read; 22 show `apps/app` screens (Dashboard, Profile, Settings, Products, Product Info, Design Workshop, Checkout, Purchase Successful, Orders, Order Details, Fundraiser, Story, Settings), and the other 32 show the public site and the supporter fundraiser/checkout (`apps/web`, out of scope). `apps/app` was run locally (API + app on `localhost`, sign-in with the seeded test customer and organiser) and the screens below were compared at 1280×800. The data comes from the shared test database, so odd product names or missing images are test data, not UI gaps.

Class: A = alignment (this ticket), B = bug (→ TTW-254), P = polish (→ TTW-255), D = needs a decision from the user.

| #   | Screen                            | Figma                                                                                                                                                                                                                                      | Current (seen on screen)                                                                                                                                                                                            | Class                                      |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1   | Sidebar (all screens)             | Items: Home, Products, Design, Orders, Fundraiser. Profile photo next to the name. Illustration right under the menu.                                                                                                                      | An extra "Cart" item. Initials in a grey circle instead of a photo. Illustration pinned to the bottom, not under the menu.                                                                                          | D (Cart), A (photo, illustration)          |
| 2   | Sidebar width                     | One fixed width on every screen                                                                                                                                                                                                            | 300 px on Settings and Profile, 180 px on Products, Product detail and the workshop editor (measured at 1280 px).                                                                                                   | B                                          |
| 3   | Dashboard home                    | Greeting, order-count badge, Orders / Profile / Settings cards, tutorial videos                                                                                                                                                            | Matches closely. The Profile card shows the email and the Settings card shows two chips that Figma does not have.                                                                                                   | P                                          |
| 4   | Profile                           | Round profile photo with an "Upload Profile Picture" button above the form                                                                                                                                                                 | No photo block or upload button. First Name, Surname, Email, Phone, password and Save buttons match.                                                                                                                | A                                          |
| 5   | Settings                          | Same photo block ("Update Profile Picture"); Shipping section with Country, State/City, Street Address                                                                                                                                     | No photo block. Same three sections and Save buttons as Figma; the shipping section also has State, LGA, City and Delivery instructions (needed for delivery, not in Figma).                                        | A (photo), D (extra fields)                |
| 6   | Product list                      | Category tabs, "Best Seller" badge, colour swatches, "$12.27 each for 30 items", "2-Day Express" tag, no buttons                                                                                                                           | Cards with "View product" and "Go to cart" buttons, an extra "View cart" button in the header, no swatches or badges seen.                                                                                          | A, D (extra buttons)                       |
| 7   | Orders — My Designs / History     | "My Designs" first; cards with Edit Design, Checkout, Start Fundraiser (designs) and Order Details (history)                                                                                                                               | Opens on "Order History". Empty state is a text card with two buttons; Figma shows an illustration and one green button ("Place An Order").                                                                         | A                                          |
| 8   | Design landing (sidebar "Design") | Not captured                                                                                                                                                                                                                               | A hero, "My Designs" and "Start from a product" sections.                                                                                                                                                           | D                                          |
| 9   | Cart                              | Not captured (Figma shows cart lines inside the checkout "Order Total")                                                                                                                                                                    | A separate cart page with an illustration empty state.                                                                                                                                                              | D                                          |
| 10  | Checkout                          | Shipping Info, Payment Method (card number, CCV, expiry), Order Total, Summary, Place Order                                                                                                                                                | Only the empty-cart state was seen. The card fields in Figma conflict with Paystack being the only provider.                                                                                                        | D                                          |
| 11  | Fundraiser home                   | Three stat cards (Items Sold, Supporters, Funds Raised), "Your Campaigns" grid, "Your Collection"                                                                                                                                          | "Organiser access" card, three different stat cards (Active campaigns, Funds raised, Payout profiles), "Campaign Overview", "Payout Setup".                                                                         | A, D                                       |
| 12  | Currency                          | `$` placeholders                                                                                                                                                                                                                           | `₦`. The platform is Nigeria-first, so this is expected.                                                                                                                                                            | D (confirm Figma `$` is a placeholder)     |
| 13  | Login, register                   | No capture                                                                                                                                                                                                                                 | Login card is not centred (sits in the right half at 1280 px). Not comparable to Figma.                                                                                                                             | B (centring); D (no reference)             |
| 14  | Product detail                    | Image gallery with thumbnails, price, "In stock", colour swatches, quantity per size, total quantity, order note, "Proceed To Checkout" / "Start Designing", Reviews, Related Products                                                     | Image, name, category, "Quantity per size", "Add to cart", "Go to cart". No swatches, gallery, order note, Reviews or Related Products.                                                                             | A, D (Reviews are lorem ipsum in Figma)    |
| 15  | Design Workshop editor            | Left rail (Upload, Add Text, Product Colors, Front/Back/Sleeve), panel, canvas, then a bottom bar: Add Product, Remove Product, Duplicate Product, product name and colour, Save \| Share, Get Price                                       | Panel on the left, canvas in the middle, rail on the right. Save Design and Share Design are cards under the panel; Undo, Redo and Layers are extra. No bottom bar.                                                 | A, D (which extras stay)                   |
| 16  | Order detail                      | Tracking timeline (Order Placed, Delivering, Delivered), item with colours and sizes, Sub total / Discount / Shipping Fee / Total, payment method, shipping method, tracking number, address, Download Invoice / Contact Support / Reorder | Status banner, four totals, items, shipping destination, "Payment attempts" card, Refresh, Download invoice, Payment confirmation. No timeline, Contact Support or Reorder. The title "Order e2e-orde…" is cut off. | A, D (Reorder, Contact Support); B (title) |
| 17  | Fundraiser — one campaign         | Three tabs: Select & Design, Story, Settings (organiser, funds delivery, delivery options, contact, "Ready to Launch") and a "Set a sale price" screen                                                                                     | One "Campaign editor" page with Basics and Offers, and a "Preview draft" button. No tabs.                                                                                                                           | A, D (flow and fields)                     |
| 18  | Mobile (375 px)                   | Mobile dashboard only                                                                                                                                                                                                                      | Dashboard and the campaign editor show a top bar with logo, bell and menu, like Figma mobile, and no horizontal scroll. Other screens not checked at 375 px.                                                        | —                                          |
| 19  | Console                           | —                                                                                                                                                                                                                                          | React "two children with the same key" errors (36 logged in one session) while browsing the fundraiser screens.                                                                                                     | B                                          |

Checked in the first and second passes: every screen above. Not audited: the order confirmation page, the shared design page and the checkout with items (needs a filled cart), and mobile for every screen except the two named in row 18. Figma has no capture for those either, except "Purchase Successful" and the checkout.

The "Borngreat" name seen once on the Orders page (a different name from the one on every other page) could not be reproduced on a second sign-in. It is left out of the table until it is seen again.

## Invariants

- No behaviour change: routes, API calls, form validation and order/payment flows stay as they are.
- Accessibility does not regress (labels, focus, roles); Playwright role/label locators keep working.
- The Design Workshop canvas (Fabric.js) behaviour and its tests stay unchanged.
- Web and admin are not touched.

## Implementation plan

1. Write the gap table (audit) in this ticket and agree on it with the user.
2. Record the design review.
3. For each zone: pin the current behaviour with a test where none exists, then align, then run the zone's checks.
4. Update affected e2e specs and `docs/playwright/prd-test-manifest.json` if visible text or selectors change.
5. Update this plan when reality differs.

Deviations so far (2026-11-25, Product list card):

- Product owner asked for a light border and a sober hover shadow on the card (not in the audit row): `border-border` + `hover:shadow-md` on the card link; image is flush with the card edges.
- The header "View cart" link is kept (product owner's choice), although Figma omits it.
- "Best Seller" badge and "2-Day Express" tag are not built: no API field exists, business decision needed.

## Test and observability plan

- Unit/component: Jest in `apps/app/__tests__/` for each changed screen (add tests for the untested ones before changing them).
- Integration/e2e: the matching specs in `tests/e2e/app/`; walk each changed screen in the browser at desktop and mobile width.
- Failure, retry, and concurrency: not applicable (no data or money path). Loading, empty, error and unauthorized states of a touched screen stay modelled.
- Logs, metrics, traces, and alerts: none.

## References

- `docs/design-rules.md` — Figma source of truth, token rules, design parity.
- `docs/04-frontend.md` — frontend conventions.
- `packages/config/theme.css` — tokens.
- `revue-client/screenshots/` — captures of the Figma pages (local only).

## Acceptance criteria

- [ ] The gap table covers every screen listed above, each gap classed and agreed with the user.
- [ ] Every gap classed _alignment_ is fixed, or moved to a named follow-up ticket with the reason.
- [ ] No hard-coded colour, spacing or radius is added.
- [ ] Each changed screen has a test, and each changed screen was walked in the browser at desktop and mobile width, with evidence below.
- [ ] `pnpm --filter app typecheck`, `pnpm --filter app lint`, `pnpm --filter app test` and `pnpm playwright:validate` pass, with evidence below.

## Out of scope

- Visual bugs found in passing → TTW-254.
- General polish and shared-component clean-up → TTW-255.
- `apps/web`, `apps/admin` and any new screen or flow.
- Anything the captures do not show (a decision is asked instead).

## Design review

To be recorded before implementation.

## Implementation reviews

None yet.

## Verification evidence

Slice 1, audit row 6 (Product list card), 2026-11-25:

- Card is now one link (`View product: <name>`), no "View product"/"Go to cart" buttons, image `object-cover` with 28px corners, 14px swatches, size range inline with the name. The header "View cart" link is kept (product owner's choice).
- "Best Seller" badge and "2-Day Express" tag are NOT done: the API has no field for them (business decision needed).
- Colours and sizes already come from the API (`ProductOptionValue.metadata.hex`, optional); no API or seed change was needed.
- `pnpm --filter app test -- __tests__/products`: 6 suites, 48 tests passed.
- `pnpm --filter app typecheck`, `pnpm --filter app lint`, prettier check: clean.
- Playwright, `pnpm exec playwright test tests/e2e/app/products-cart.comprehensive.spec.ts --project=chromium-app --no-deps` against production builds and the shared `tamiym_workshop_test` DB: 15 passed, 3 failed (same test, 3 viewports: "tabs come from the API categories and every product is reachable (TTW-093)", at the last step `getByText('Bulk Item 01')` after "All" > Next page). Cause: the shared test DB holds many leftover "Authoring Cat" / "Clear Cat" categories and products, so page 2 of "All" no longer starts with the seeded Bulk Items. Not caused by the card change (the 12 / 10 "View product" counts before that step pass). Not re-run on a clean throwaway DB.
- `--project=setup` also fails for `order-cancel.e2e@tamiym.test` (401, account missing from the shared DB); unrelated to this ticket.
- Border + hover shadow change: `pnpm --filter app test -- __tests__/products` 6 suites / 52 tests passed; `pnpm --filter app lint` clean; `pnpm exec prettier --check apps/app/app/dashboard/products/page.tsx` clean; `pnpm --filter app typecheck` clean on re-run (one earlier run failed with exit 2 and no TS error shown on re-run, likely another session editing files at the same time).
- Data finding (read-only SQL on `tamiym_workshop_test`): 539 ACTIVE products; 18 have a `size` option, 1 has `color` (with hex), 8 have `colour` (British spelling, no hex). The API only matches `color` (`apps/api/src/products/product-card-summary.ts`), so most cards show no swatches or sizes: a data gap, not a display bug.
- Not verified: visual comparison in the browser (needs a signed-in session).

Bug fix, product page image, 2026-11-25 (reported by the product owner: after clicking a product in `/dashboard/products`, the page showed a generic placeholder image instead of the product photo):

- Likely cause (read from the code, not reproduced on real data): the list card uses `productImageRoles`, but the product page only used `images` filtered by colour (`imagesForColor`). With no image for the chosen colour and none shared across variants, the gallery was empty and the placeholder showed.
- Fix: `imagesForColor` (`apps/app/lib/product-variants.ts`) now falls back to the product's `productImageRoles` images before giving up.
- New test, seen failing first then passing: `product-variants.test.ts`, "falls back to the product main image (the one the list shows) when no gallery image fits".
- `pnpm --filter app test -- __tests__/lib/product-variants.test.ts __tests__/products`: 7 suites, 59 tests passed. `pnpm --filter app typecheck` and `pnpm --filter app lint`: clean.
- Correction of the diagnosis, after reproducing in the browser (signed in as the test customer): the products in the dev database have no photo at all, so the visible bug was two different placeholders. The list picked one by list position (`fallbackImages[index % 6]`), the product page always used `fallbackImages[0]`. Example: "Mod Product" showed `product-fallback-2` in the list and `product-fallback-1` on its page.
- Fix 2: new `productFallbackImage(productId)` in `apps/app/lib/assets.ts` (stable hash of the product id), used by the list card and the product page. The "main image" fallback above stays (harmless, covers products that have a main image but none for the chosen colour).
- New test, seen failing first (function missing) then passing: `__tests__/lib/product-fallback-image.test.ts` (same product gives the same placeholder, always a known one, spread over several).
- `pnpm --filter app test -- __tests__/lib __tests__/products`: 23 suites, 224 tests passed. `typecheck`, `lint`, prettier on touched files: clean.
- Browser check (localhost:3002, test customer): list card and product page now show the same placeholder for two products (`product-fallback-3` = `product-fallback-3`, `product-fallback-5` = `product-fallback-5`).
- Product owner's decision (2026-11-25), replaces fix 2: no random stand-in pictures. A product without a photo shows the text "Image not available" (new `apps/app/components/product-image-placeholder.tsx`) on the list card and on the product page. `productFallbackImage` and its test were removed (the function is gone); `customerAssets.productFallbacks` stays because the orders page and the empty-catalogue preview cards still use it.
- New tests, seen failing first then passing: `product-list-card.test.tsx` ("says the image is not available…", "shows the product photo when it has one") and `product-detail-page.test.tsx` ("says the image is not available…").
- `pnpm --filter app test -- __tests__/products __tests__/lib`: 22 suites, 224 tests passed. `typecheck`, `lint`, prettier on touched files: clean.
- Browser check (localhost:3002, test customer): list card and product page of "Authoring Tee" both show "Image not available", no stand-in picture.
- Not verified: a product that has a real photo in the browser (none in the dev database; covered by the unit test only); the Playwright run.
- Same rule applied to the two other places that used stand-in pictures (product owner's request, 2026-11-25): the order history cards (`orders/page.tsx`; the orders API sends no product photo, so each card says "Image not available") and the preview cards shown for an empty catalogue (`products/page.tsx`). `customerAssets.productFallbacks` is removed from `lib/assets.ts`; the six `public/assets/customer/product-fallback-*` files are now unused and were left in place (delete them in a follow-up if wanted).
- New tests, seen failing first then passing: `__tests__/orders/order-list-page.test.tsx` and "shows no stand-in picture on the preview cards of an empty catalogue" in `product-list-card.test.tsx`.
- `pnpm --filter app test -- __tests__`: 58 suites, 529 tests passed. `typecheck`, `lint`, prettier on touched files: clean.
- Not verified in the browser: the order cards (the test customer has no order) and the empty-catalogue preview cards (the dev catalogue is not empty). Unit tests only.
- Not changed: the two "Quick Tutorial Videos" thumbnails on the dashboard home are not product images.

## Completion summary

Not complete. Done: Product list card (audit row 6) except badge and tag. Left: "Best Seller" / "2-Day Express" (needs a decision and an API field); let the API accept `colour` as a colour option (proposed, not decided); visual check against Figma while signed in; Playwright re-run on a clean throwaway DB; the other audit rows.
