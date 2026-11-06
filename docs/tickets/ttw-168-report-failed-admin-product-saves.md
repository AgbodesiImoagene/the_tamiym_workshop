# TTW-168 — Tell admins when a product page change fails

**Epic:** 0 — Trustworthy delivery system\
**Status:** Not started\
**Risk:** Low\
**Blocked by:** TTW-165 (the page crashes on any product with an image until it is merged)\
**Blocks:** None

## Background

Found by the independent review of TTW-165. Line numbers are those of `apps/admin/components/admin-product-merchandising.tsx` on branch `codex/ttw-165-fix-image-variant-select`.

Twelve `useMutation` calls in that file have no `onError`: `addMut` (110), `saveMut` (206), `delMut` (215), `delMut` (311), `saveOpt` (392), `delOpt` (402), `del` (869), `save` (962), `del` (972), `addPrice` (1139), `save` (1356), `del` (1365). When the API refuses one of these changes, the admin sees nothing: the button appears to work and the change is not saved. The other mutations in the file already call `alert(e.message || '…')`.

Concrete case on the image row: an admin chooses a variant without saving, deletes that variant, then clicks Save. The API answers 400 `Variant does not belong to product` (`apps/api/src/products/products.service.ts:1094-1101`) and nothing appears on screen.

## Proposal

Add an `onError` to the twelve mutations, using the `alert(e.message || '<what failed>')` pattern already used in this file, so one screen does not end up with two ways of reporting errors.

Rejected: moving the file to toasts. `sonner` is a dependency of `apps/admin`, but no component or page there uses it yet, so that is a separate change.

## Invariants

- A refused change shows a message that names what failed.
- A successful change behaves as it does today, and shows no new message.
- The save payloads do not change.

## Implementation plan

1. Write the Playwright journey for the image row case and show it fails.
2. Add the twelve `onError` handlers.
3. Run the journey, typecheck, lint and the validators, and record the evidence.

## Test and observability plan

- Unit/component: none, `apps/admin` has no unit tests.
- Integration/e2e: extend the admin journey with the image row case above: the 400 must show the message, and the page must keep working. The journey needs a plain page rather than the `adminPage` fixture, because a deliberate 400 logs a console error that the strict guard treats as a failure, as in TTW-163. It must wait for the `dialog` event and read its message.
- Failure, retry, and concurrency: the failure path is the subject of this ticket. No new retry.
- Logs, metrics, traces, and alerts: no change.

## References

- `apps/admin/components/admin-product-merchandising.tsx:962`: the `ImageRow` save mutation.
- `apps/admin/components/admin-product-merchandising.tsx:1133-1137`: an existing `onError` to follow.
- `tests/e2e/admin/product-image-variant.comprehensive.spec.ts`: the journey to build on, on the TTW-165 branch.
- `docs/tickets/ttw-165-fix-image-variant-select-crash.md`: review 2, finding 3.

## Acceptance criteria

- [ ] All twelve mutations show a message when the API refuses the change.
- [ ] The image row case is covered by a Playwright journey that fails before the change.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Contracts, migrations, observability, and documentation are updated where applicable (no contract, migration or observability change is expected).

## Out of scope

- The empty select shown in the image row case until the page is reloaded. It is a display gap only, and this ticket makes the failed save visible.
- Images deleted with their variant: being framed by the session that holds TTW-166. Both tickets touch this file, so they must land one after the other.
- Moving the admin to toasts.

## Design review

Not required: low-risk ticket.

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not started.
