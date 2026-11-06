# TTW-169 — Tighten the image variant journey and remove its dead placeholder

**Epic:** 0 — Trustworthy delivery system\
**Status:** Not started\
**Risk:** Low\
**Blocked by:** TTW-165 (both files below only have this code on its branch)\
**Blocks:** None

## Background

Found by the independent review of TTW-165. Neither point is a bug today.

- `tests/e2e/admin/product-image-variant.comprehensive.spec.ts:67` checks the saved value with `expect.any(String)`, which accepts any string. The journey is still protected, because the API rejects an id outside the product and the SKU is checked again after the reload, but the assertion does not say which variant was saved.
- `apps/admin/components/admin-product-merchandising.tsx:1008` keeps `placeholder="All variants"`. The select value is now never empty, so Radix never shows that placeholder (`shouldShowPlaceholder` only accepts `''` or `undefined`).

## Proposal

Compare the id returned by the `PATCH` with the id of the chosen variant, read from the response of the variants list rather than from a mocked value. Remove the placeholder.

Rejected: leaving the placeholder as a fallback. It can never display, so it only suggests a state that does not exist.

## Invariants

- The journey still covers both directions, with a reload after each save.
- The trigger still shows "All variants" when the image has no variant.

## Implementation plan

1. Tighten the assertion and run the journey.
2. Remove the placeholder and run the journey again.

## Test and observability plan

- Unit/component: none, `apps/admin` has no unit tests.
- Integration/e2e: the journey itself. Show that it fails if the saved id is replaced by the other variant's id, then restore it.
- Failure, retry, and concurrency: not applicable.
- Logs, metrics, traces, and alerts: no change.

## References

- `tests/e2e/admin/product-image-variant.comprehensive.spec.ts:67`: the assertion.
- `apps/admin/components/admin-product-merchandising.tsx:1008`: the placeholder.
- `docs/tickets/ttw-165-fix-image-variant-select-crash.md`: review 2, findings 4 and 5.

## Acceptance criteria

- [ ] The journey fails when the saved id is not the chosen variant's id.
- [ ] The dead placeholder is gone and the trigger text is unchanged.
- [ ] Required quality gates pass with evidence recorded below.
- [ ] Contracts, migrations, observability, and documentation are updated where applicable (no contract, migration or observability change is expected).

## Out of scope

- Running this journey on each push to `main` → TTW-170.

## Design review

Not required: low-risk ticket.

## Implementation reviews

None yet.

## Verification evidence

None yet.

## Completion summary

Not started.
