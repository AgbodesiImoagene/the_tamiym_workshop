# TTW-174 — Keep existing variants when an option is added

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None\
**Blocks:** TTW-166; entering the real catalogue (roadmap phase 8, no ticket)

## Background

Adding an option to a product deletes every variant that has no order, with its images, prices, stock and SKU. Nothing warns the admin, and adding values afterwards does not bring anything back.

This must be fixed before the real catalogue is entered. Any product entered with sizes only, and given a colour later, would lose all that work in one click.

### Measured behaviour

Measured on 2026-11-06 by the TTW-166 session, with the real `ProductsService` on a disposable PostgreSQL 17 database. The full table is in `docs/tickets/ttw-166-stop-variant-changes-deleting-images.md`, on branch `codex/ttw-166-stop-variant-changes-deleting-images`. No variant had an order. These measurements were not run again for this ticket.

| Admin action                               | Variants before → after     | Lost or missing                              |
| ------------------------------------------ | --------------------------- | -------------------------------------------- |
| Add a new option, before it has any value  | `M, S` → none               | Variant images, their thumbnail role, prices |
| Add the first value of that option         | none → `Red / M`, `Red / S` | The new rows have no image and no price      |
| Control: add a value to an existing option | `M, S` → `L, M, S`          | Nothing                                      |

### Why it happens

1. `createOption` creates the option with no values, then regenerates the variants (`apps/api/src/products/products.service.ts:888`, `:909`).
2. `indexExistingVariants` marks every variant as stale, because none has a value for the new option (`:1657`).
3. `cartesianProduct` returns no combination while one option is empty (`:130`). The guard at `:1789` only rejects too many combinations, not zero.
4. `cleanupStaleVariants` deletes the stale variants without orders (`:1699`) and disables the ones with orders (`:1706`).
5. The first value creates new rows with new ids (`:1874`). They share nothing with the deleted rows.

### What goes with a deleted variant

Read in `apps/api/prisma/schema.prisma`, not measured except where noted. All of these are `onDelete: Cascade`:

| Data                      | Schema  | Effect on the business                                       |
| ------------------------- | ------- | ------------------------------------------------------------ |
| `VariantPrice` (measured) | `:1143` | The variant's own prices are gone                            |
| `InventoryItem`           | `:1075` | Stock is gone, and stock control with it (see below)         |
| `ProductImage` (measured) | `:1184` | Linked photos are gone, with their roles and workshop layers |
| `ProductViewPricing`      | `:1269` | Print-side prices set for this variant are gone              |
| `DiscountVariant`         | `:2379` | The variant leaves its discounts                             |
| `BulkPricing`             | `:2424` | Bulk tiers set for this variant are gone                     |
| `OrganizerPricingPolicy`  | `:2302` | Organiser pricing set for this variant is gone               |

Two consequences are less visible than a missing photo:

- **A variant without its own price falls back.** It uses the product's price, and with no product price it cannot be ordered (`apps/api/src/pricing/pricing.service.ts:591`, `:484`). So a `S` priced at 6,000 can silently come back at the product's 5,000.
- **A variant without a stock row has no stock limit.** The order check skips it (`apps/api/src/orders/orders.service.ts:644`). So a product with 10 tracked units comes back as unlimited.

### Variants with orders today

Read in the code, not measured. Such a variant is never deleted, but it is stranded:

- It is disabled as soon as the option is created (`products.service.ts:1706`), before any value exists.
- It never receives the new option. It stays named `S`, and a new `Red / S` row replaces it, with no price and no stock row.
- Turning it back on does not last. `updateVariant` accepts it (`:851`), but the next regeneration sees the same missing option and disables it again.

## Proposal

### Rule decided by the user

**Adding an option must never erase existing data (images, prices, stock).**

### Intended behaviour

Example: a t-shirt in `S` and `M`, to which the admin adds "Colour".

| Step | Admin action                 | Variants after                               | What happens                                                                                   |
| ---- | ---------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1    | Adds "Colour", with no value | `S`, `M`                                     | Nothing changes. An option with no value is not yet a choice                                   |
| 2    | Adds the first value, "Blue" | `Blue / S`, `Blue / M`                       | `S` becomes `Blue / S` and `M` becomes `Blue / M`. Same rows, same photo, price, stock and SKU |
| 3    | Adds a second value, "Red"   | `Blue / S`, `Blue / M`, `Red / S`, `Red / M` | The blue rows do not move. `Red / S` and `Red / M` are created in addition                     |

Step 2 is what protects the data: the row is kept, so everything attached to it stays attached, including links this ticket never names. Only its name and its option link change. The word order of a name follows the options' sort order, so "Blue / S" assumes Colour sorts first.

Step 3 uses the same code as adding an `L` to an existing Size option. Decisions D1 and D3 therefore apply to every new variant, not only to those created after adding an option. New variants start without an image, as they do today: a photo of a blue t-shirt would be wrong on a red one.

### Variants with orders

**They follow the same rule.** This reverses the stranding described above:

|                       | Today                                  | After this ticket                                     |
| --------------------- | -------------------------------------- | ----------------------------------------------------- |
| Step 1 (no value yet) | Disabled, cannot be bought             | Unchanged, still on sale                              |
| Step 2 (first value)  | Stays `S`, replaced by a new empty row | Becomes `Blue / S`, same row, still on sale           |
| Its orders            | Stay linked to a row out of use        | Stay linked to the same row, now in use               |
| Its stock             | Left on the disabled row               | Stays on the row customers buy, reservations included |
| Disabled by an admin  | Stays disabled                         | Stays disabled                                        |

Past orders are protected because each order line keeps its own copy of the price, option values and label (`schema.prisma:1865-1879`). One screen reads the live name instead: the admin order page (`apps/admin/app/admin/orders/[id]/page.tsx:182`) would show `Blue / S` for a past order of `S`. It should show the order's own copy.

Variants that really disappear still follow today's rule: a variant with orders is disabled, never deleted. That applies when a value or an option is removed, and it does not change.

### Decisions

Decided by the user on 2026-11-06: option A for D1, D2 and D3.

**D1. Does a new variant (step 3) take the price of an existing variant, or start without a price of its own?**

|                      | A: copy the price                                                | B: no price of its own (today)                                   |
| -------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `Red / S`            | Copies the prices of `Blue / S`, currency by currency            | Uses the product's price. If there is none, it cannot be ordered |
| If the admin forgets | Sold at the price of the matching variant, usually the right one | Sold at the product's price, or refused at checkout              |
| Main drawback        | A colour that costs more needs a manual change                   | A variant-specific price is silently lost on every new colour    |

**Decided: A.** A new variant takes the price of the matching variant by default. If that variant has no price of its own, the new variant has none either and uses the product's price. Either way the price stays editable: it is a one-time copy, so changing `Blue / S` later does not change `Red / S`, and the reverse. The source is the variant that differs only by the new value. For a new size `L`, it is the first size in sort order, because no variant matches. Size surcharges are separate (TTW-094) and still apply. The same copy should cover weight and package size, which have the same fallback to the product (`pricing.service.ts:580`). Bulk tiers, discounts and organiser pricing set on a variant are not copied: they are deliberate commercial terms.

**D2. Does the SKU of a kept variant change when it receives a new value?**

What the code does: nothing changes it. A SKU is written once, at creation (`products.service.ts:1878`), or by an admin (`:850`). Regeneration only updates the name of a kept variant (`:1833`). Renaming a value does not change the SKU either. Nothing looks a variant up by SKU: it is only displayed, copied onto orders, and checked for uniqueness (`:837`).

| Option                    | Result on the example                                             | Main drawback                                                                       |
| ------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A: keep it (today's code) | `t-shirt-s` for `Blue / S`, next to `t-shirt-red-s` for `Red / S` | SKUs of one product do not look alike. An admin can edit them by hand               |
| B: rewrite it             | `t-shirt-blue-s`                                                  | Overwrites any SKU an admin typed, and breaks labels or sheets kept outside the app |

**Decided: A.** A SKU identifies a thing, so it should not change because the description became more precise. No code change is needed for this.

**D3. What stock does a new variant (step 3) start with?**

This question was found while reading the code. Today a new variant has no stock row, so nothing limits its sales (see Background). `Red / S` could be sold without limit while `Blue / S` is carefully counted.

|                         | A: create a stock row at 0                | B: no stock row (today)        |
| ----------------------- | ----------------------------------------- | ------------------------------ |
| Before stock is entered | Shows as out of stock, cannot be oversold | On sale with no limit          |
| Main drawback           | The admin must enter stock before selling | Sells items that may not exist |

**Decided: A**, keeping the "track stock" setting of the source variant from D1. If that variant does not track stock, the new one does not either. Quantities are never copied: 10 blue t-shirts do not mean 10 red ones.

### Design direction

1. **An option with no value is ignored by regeneration.** `regenerateVariants` builds its combinations and keys from the options that have values. `createOption` still calls it, and it now finds nothing to do.
2. **The first value of an option links the existing variants to it.** `createOptionValue` creates the value and adds one `VariantOptionValue` row to each existing variant that already matches all the other filled options, in one transaction, before regenerating. No variant row is created or deleted.
3. **Customers never see an option with no value.** Today this state goes unnoticed because the product has no variant left. Once variants stay, a buyer could be stuck: the fundraiser page finds no variant until every option has a selection (`apps/web/lib/fundraiser-selection.ts:11-12`), and `OptionPicker` would show a heading with nothing under it. Empty options are left out of the customer-facing responses (`products.service.ts:276` and `apps/api/src/fundraising/campaigns.service.ts:295`, `:1131`).

No schema change is expected. No data repair is needed, because the project is not in production.

### Edge cases

| Case                                                      | Expected result                                                                                                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| An option added by mistake, then deleted before any value | Variants are untouched                                                                                                                           |
| Two new empty options at once                             | Only the option that receives a value changes the variants                                                                                       |
| Value added to Size while Colour is still empty           | `L` is created normally, and receives "Blue" with the others at step 2                                                                           |
| A stale variant, kept only for its orders                 | It lacks another option, so it is not linked. It stays disabled                                                                                  |
| First value of the only option, after all were deleted    | No other option has values, so nothing is linked. Otherwise an old `S` row kept for its orders would turn into `M`                               |
| Two admins add a first value at the same moment           | The database allows one value per option for each variant (`schema.prisma:1065`). Both values survive and neither request fails with a raw error |
| The last value of an option is deleted                    | See below                                                                                                                                        |

**A side effect to accept.** Ignoring empty options also changes "delete the last value of an option", which TTW-166 measured as `Blue / S, Red / S` → none. With Size now empty, the variants stay, as `Blue` and `Red`. That is less destructive and mirrors step 2. If no option has any value left, nothing can be sold, and today's behaviour remains. Deleting a last value and adding another in the same option reuses the row, as in step 2, so its price and stock carry over.

### Rejected

- **Warn before deleting, or refuse the action.** The rule is that the data stays, not that its loss is announced.
- **Copy the data to new rows.** Row ids are what orders, images and discounts point to, and every attached table would need its own copy.
- **Link the variants inside `regenerateVariants`.** It cannot tell a variant whose option is new from one whose value was just deleted: both simply lack that option. Deleting `M` would turn the `M` row into a duplicate of `S` instead of removing it.
- **Require a first value when creating the option.** It would remove step 1, which the user asked to keep, and needs a new API and form.

## Invariants

- Adding an option or an option value never deletes a variant, nor anything attached to it.
- Steps 1 and 2 keep every variant id. Images, prices, stock, discounts and order lines stay attached to the same rows.
- Adding an option or a value never disables a variant, and never enables one.
- A variant with order lines is never deleted, and past order lines stay byte-for-byte identical.
- After regeneration, an available variant has exactly one value for each option that has values, and no two available variants share the same combination.
- A customer-facing response never contains an option with no value.
- `MAX_OPTIONS_PER_PRODUCT` and `MAX_VARIANTS_PER_PRODUCT` still apply.

## Implementation plan

1. Start from current `main`, which includes TTW-165.
2. Write the failing integration spec for steps 1 to 3, for a variant with orders, and for each edge case.
3. Make regeneration ignore options with no value.
4. Link existing variants on the first value, in one transaction.
5. Apply D1 and D3 to new variants.
6. Leave empty options out of the customer-facing responses.
7. Show the order's own copy of the label on the admin order page.
8. Correct the admin texts that promise regeneration (`apps/admin/components/admin-product-merchandising.tsx:564`, `:1431`). They stay in English.
9. Add a Playwright journey on the admin product page, with a reload after each step.

Update this plan and record deviations when implementation differs. TTW-174 should merge before TTW-166: both touch the admin product dialogs. See Out of scope for what changes in TTW-166.

## Test and observability plan

- Unit/component: service tests for the choice of source variant (D1) and the first-value detection. The existing test `should create an option and trigger variant regeneration` (`products.service.spec.ts:562`) must keep passing unchanged. `apps/admin` has no unit tests.
- Integration/e2e: a new API spec on real PostgreSQL, because a mocked Prisma cannot show cascades. Before and after each step, it compares the variant ids and everything attached to them: images, prices, stock, discounts, bulk tiers and order lines. Playwright: add "Colour" to a product with a linked image, then add two values.
- Customer side: a test that a product with an empty option can still be bought, on the catalogue and on a fundraiser page.
- Failure, retry, and concurrency: a failure during the first value leaves neither the value nor partial links. Two simultaneous first values both succeed. Adding a value past `MAX_VARIANTS_PER_PRODUCT` is refused.
- Logs, metrics, traces, and alerts: at design review, check whether option and variant changes reach the audit log. No new metric is expected.

## References

- `apps/api/src/products/products.service.ts:130`: `cartesianProduct`.
- `apps/api/src/products/products.service.ts:888`, `:956`: `createOption`, `createOptionValue`.
- `apps/api/src/products/products.service.ts:1638`, `:1679`, `:1722`: `indexExistingVariants`, `cleanupStaleVariants`, `regenerateVariants`.
- `apps/api/src/pricing/pricing.service.ts:484`, `:591`: price fallback and refusal.
- `apps/api/src/orders/orders.service.ts:644`: stock check skipped without a stock row.
- `apps/api/prisma/schema.prisma:1020`, `:1055`, `:1846`: variant, option link, order line.
- `apps/web/lib/fundraiser-selection.ts:11-12`: a selection is required for every option.
- `apps/app/components/workshop/OptionPicker.tsx`: the customer option picker.
- `docs/tickets/ttw-094-let-admins-enter-size-and-print-surcharges.md`: size surcharges.

## Acceptance criteria

- [x] The user's decisions D1, D2 and D3 are recorded in this ticket before any code changes.
- [ ] After step 1, the variants have the same ids and the same attached data, and they can still be bought.
- [ ] After step 2, `S` is `Blue / S` with the same id, photo, price, stock, SKU and order lines.
- [ ] After step 3, the blue variants are unchanged and the red ones exist, with prices and stock as decided in D1 and D3: `Red / S` copies the prices of `Blue / S`, and has a stock row at 0 when `Blue / S` tracks stock.
- [ ] A variant with orders stays available through all three steps, and stays linked to its orders.
- [ ] Past order lines are unchanged, and the admin order page shows the label from the order.
- [ ] A variant with a stock row keeps it, so a tracked product never becomes unlimited by adding an option.
- [ ] Each edge case above has a test on real PostgreSQL.
- [ ] A customer never sees an option with no value, and a product with one can still be bought.
- [ ] The admin journey is played end to end, with a reload after each step.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Contracts, observability and documentation are updated where applicable.

## Out of scope

- What happens to an image when a variant really disappears. TTW-166 owns that choice: the images move to "All variants". This ticket does not change it.
- When TTW-166 is next updated: its "Add a new option" rows no longer lose anything, and the "last value" row changes as described above.
- Deleting a value or an option, apart from the last-value case above.
- Which variant survives a collision when an option is deleted (reported in TTW-166).
- `createOptionValue` keeps the value when the variant limit refuses it (`products.service.ts:1006`). This is existing behaviour, noticed here and not fixed.
- Showing refused saves on the admin product page → TTW-168.
- How a gallery picks images per colour → TTW-092.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation. Everything in Background and Proposal comes from reading the code on `main` at `e0e74f1`, except the rows marked as measured, which come from the TTW-166 session. Variants with orders, stock, the customer pages and the edge cases have not been run.

## Completion summary

Pending implementation.
