# TTW-193 — Let a customer clear the LGA saved on an address

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-186 (same code and the same "LGA changed" rule)\
**Blocks:** None

## Background

Found by the independent review of TTW-087 (finding 1) and repeated in the review of TTW-192. TTW-087 and TTW-192 put an optional LGA list in the checkouts and in the settings form.

A customer with a saved Lagos/Ikeja address who picks the empty option "Select an LGA (optional)" cannot remove the LGA. The forms leave `lgaId` out of the request when it is empty, and `AddressNormalizationService` (`apps/api/src/shipping/address-normalization.service.ts`) keeps the saved `lgaId` when the state is unchanged (`keepSavedLga`). The form then shows no LGA, but the address still carries Ikeja, and an LGA-level shipping rule still prices it.

An address can also carry an LGA that is no longer in the list (deactivated): the settings form no longer sends it, but the server keeps it.

## Proposal

- Make "no LGA" an explicit request. The API accepts `lgaId: null` on update as "clear the LGA": `lgaId` and `administrativeAreaLevel2` become `null`. An absent `lgaId` keeps its meaning (leave it as saved). Confirm in the design review that `null` passes the DTO (`@IsOptional()` lets `null` through) and is documented in Swagger.
- The two checkouts and the settings form send `lgaId: null` when the customer empties the LGA select on an address that had one.
- Coordinate with TTW-186, which defines when an edit "changes the LGA" in the same method. Implement after it, or in the same change if the owner prefers.

## Invariants

- An absent `lgaId` never changes the saved LGA.
- After an explicit clear, the address has no `lgaId` and no LGA text, and the quote falls back to the state-level rule.
- A clear never touches the state or state code.

## Implementation plan

1. Start `codex/ttw-193-let-customers-clear-a-saved-lga` from current `main`, in its own worktree, after TTW-186 is merged.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below (High risk) before implementing.
4. Write the tests first and show them failing for the right reason.
5. Implement in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate`.
7. Run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Unit: `normalizeForUpdate` with `lgaId: null` clears the LGA; an absent `lgaId` keeps it; a clear does not change the state.
- Integration on real Postgres: PATCH `/v1/users/addresses/:id` with `lgaId: null` on a Lagos/Ikeja address, then a quote that no longer matches the Ikeja rule.
- Component: emptying the LGA select sends `lgaId: null` (checkout page, settings form).
- Playwright: choose an LGA, save, empty it, save, and check the response.
- Logs, metrics, traces, and alerts: nothing new. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/shipping/address-normalization.service.ts` — `keepSavedLga`, `resolveLga`.
- `apps/api/src/addresses/dto/create-address.dto.ts` — `lgaId`.
- `docs/tickets/ttw-186-refuse-lga-outside-address-state.md` — LGA change rule.
- `docs/tickets/ttw-087-offer-states-and-lgas-at-checkout.md`, `docs/tickets/ttw-192-offer-state-and-lga-lists-in-settings.md` — origin.
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.

## Acceptance criteria

- [ ] A customer can remove the LGA of a saved address from the checkouts and from settings.
- [ ] A request without `lgaId` still keeps the saved LGA.
- [ ] Swagger, shared contracts and docs are updated.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Refusing an LGA that does not belong to the state → TTW-186.
- Refusing a deactivated state → TTW-194.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
