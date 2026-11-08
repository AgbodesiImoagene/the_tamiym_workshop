# TTW-185 — Drop the old state and LGA when an edited address names an unknown state

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-086\
**Blocks:** TTW-087

## Background

Found while working on TTW-086 (its independent review flagged it as out of scope). Same family as client-review row 5.6: a wrong address gives a wrong shipping fee.

`AddressNormalizationService.normalize` merges the edit with the saved address. When the edit's state does not resolve to a `GeoState` row, it keeps the saved code:

- `apps/api/src/shipping/address-normalization.service.ts:120` — `stateCode = resolvedState?.code ?? existing?.stateCode ?? null`.
- `apps/api/src/shipping/address-normalization.service.ts:121` — same for `lgaId`.
- `apps/api/src/shipping/address-normalization.service.ts:116` — the old state code is also used to look up the LGA.
- `apps/api/src/shipping/address-normalization.service.ts:243-245` — an explicit but unknown `stateCode` (for example `ZZ`) also returns `null`, so the old code is kept there too.

Journey: the customer checkout (`apps/app/app/dashboard/checkout/page.tsx:128`, `upsertPrimaryAddress`) and the settings form (`apps/app/components/customer-settings-form.tsx:153`) send a free-text `state` with no `stateCode` to `PATCH /v1/users/addresses/:id` (`apps/api/src/addresses/addresses.service.ts:117-121`). A saved Lagos address (`stateCode: LA`) edited to "Federal Capital Territory", "FCT" or "Abuja" keeps `stateCode: LA`. With the full geo seed the FCT row is named "Abuja Federal Capital Territory" (`apps/api/prisma/nigeria-lgas.curated.json:53-54`), so none of these spellings resolve; any typo of another state does the same. `ShippingDestinationResolver` then matches the Lagos ADMIN1 rule on `stateCode` (`apps/api/src/shipping/shipping-destination-resolver.service.ts:117-121`), and the order is priced at the Lagos rate.

Reproduced on the TTW-086 branch: a Lagos address edited to "Federal Capital Territory" was quoted ₦2,000 (Lagos rate) instead of being refused with `SHIPPING_ADDRESS_NOT_COVERED`. The normalization service is identical on `main` and on that branch (`git diff --stat main codex/ttw-086-reject-addresses-outside-shipping-zones -- apps/api/src/shipping apps/api/src/addresses` only lists `shipping.errors.ts`).

A related stale value: when the edit names a different, known state but no LGA, the old `lgaId` and `administrativeAreaLevel2` (for example Ikeja) stay on the address. An ADMIN2 rule without `matchContext` would still price it as Ikeja.

TTW-087 (state and LGA lists at checkout) does not close this on its own: lists only protect our own forms, and any API client can still send a free-text `state`. Its invariant "a saved address always carries a state known to the shipping rules" depends on this fix on the server.

## Proposal

In `AddressNormalizationService.normalize`, on update:

- If the request changes the state (it sends `state`, `administrativeAreaLevel1` or `stateCode`) and the value does not resolve, set `stateCode` to `null` instead of keeping the saved one. The address is then refused at quote time with `SHIPPING_ADDRESS_NOT_COVERED` (TTW-086) unless a rule matches its state name.
- If the resolved state differs from the saved one, do not keep the saved `lgaId` or `administrativeAreaLevel2` unless the request sends a new LGA that belongs to the new state.
- Look up the LGA only with the newly resolved state code when the request changes the state.
- Keep the saved values when the request does not touch the state (for example a phone-only edit).

Rejected for now: refusing the save with a 400 "unknown state". It would block customers until TTW-087 offers the lists, and the free-text "Abuja"/"FCT" spellings have no alias yet. TTW-087 can make the save strict once the lists exist.

## Invariants

- An edited address never carries a `stateCode` or `lgaId` that the edit contradicts.
- An address whose state is unknown is never priced with another state's rate.
- An edit that does not touch the state keeps the saved `stateCode` and `lgaId`.
- Create behaviour is unchanged (it already stores `null` for an unknown state).

## Implementation plan

1. Start `codex/ttw-185-drop-stale-state-on-address-edit` from current `main` after TTW-086 is merged, in its own worktree.
2. Record the design review below, as `AGENTS.md` requires for High risk.
3. Write the tests first and show them failing for the right reason.
4. Change `normalize` as proposed. No schema, DTO or OpenAPI change expected.
5. Run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Unit (`apps/api/src/shipping/address-normalization.service.spec.ts`), failing on `main` today:
  - existing `{ stateCode: 'LA', lgaId: 'lga-ikeja' }`, input `{ state: 'Federal Capital Territory' }`, `geoState.findFirst` → `null`: expect `stateCode: null`, `lgaId: null`.
  - same with input `{ stateCode: 'ZZ' }`, `geoState.findUnique` → `null`: expect `stateCode: null`.
  - existing Lagos/Ikeja, input `{ state: 'Ogun' }` resolving to `OG`, no LGA: expect `stateCode: 'OG'`, `lgaId: null`, `administrativeAreaLevel2: null`.
  - existing Lagos/Ikeja, input `{ phone: '...' }` only: expect `stateCode: 'LA'`, `lgaId: 'lga-ikeja'` (no regression).
- Integration (`apps/api/test/`, real Postgres, production `AppModule`): save a Lagos address, `PATCH` it to "Federal Capital Territory", request a quote, expect `SHIPPING_ADDRESS_NOT_COVERED` instead of the Lagos rate. Same flow for an order creation.
- Failure, retry, and concurrency: none specific; the change is a pure merge rule.
- Logs, metrics, traces, and alerts: nothing new. No PII in logs.

## References

- `apps/api/src/shipping/address-normalization.service.ts:108-123` — merge rule.
- `apps/api/src/addresses/addresses.service.ts:117-121` — update path.
- `apps/api/src/shipping/shipping-destination-resolver.service.ts:117-121` — ADMIN1 match on `stateCode`.
- `apps/app/app/dashboard/checkout/page.tsx:128` — checkout sends free-text `state`.
- `docs/tickets/ttw-086-reject-addresses-outside-shipping-zones.md`, `docs/tickets/ttw-087-offer-states-and-lgas-at-checkout.md`.

## Acceptance criteria

- [ ] Editing a saved address to an unknown state is refused at quote and order time with `SHIPPING_ADDRESS_NOT_COVERED`, never priced at the old state's rate.
- [ ] Editing to a different known state without an LGA clears the old LGA.
- [ ] Edits that do not touch the state keep the saved state and LGA.
- [ ] Required quality gates pass, with evidence recorded below.
- [ ] Docs updated where applicable (the TTW-086 policy, if it lists address rules).

## Out of scope

- State and LGA lists in the forms, and a strict 400 on unknown states → TTW-087.
- Aliases such as "FCT" or "Abuja" for the FC state → separate ticket if wanted.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
