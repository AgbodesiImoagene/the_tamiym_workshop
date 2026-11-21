# TTW-245 — Say clearly that we deliver only in Nigeria

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

Decision by the user, 2026-11-21: at launch the workshop delivers **only in Nigeria**. Other countries may come in a v2 (international delivery is already deferred, TTW-057). The question "Where we ship" was removed from the client message for that reason. Priority: not urgent.

Today a customer outside Nigeria gets no clear answer:

- The country is a free-text field in the checkouts (`apps/app/app/dashboard/checkout/page.tsx`, `apps/web/app/fundraiser/[slug]/checkout/page.tsx`) and in the account settings form (`apps/app/components/customer-settings-form.tsx`, "Select Country" is a plain input), defaulting to "Nigeria".
- The state and LGA lists are Nigerian only, and the API enforces them only for Nigeria (TTW-087, TTW-192 "Decision on Country"). A foreign customer therefore has to pick a Nigerian state, or cannot finish the form.
- With a foreign country, no shipping zone matches. The quote and the order fail with the generic 400 `SHIPPING_ADDRESS_NOT_COVERED` ("We don't deliver to this address yet. Check the state and LGA, or use another delivery address."), which suggests a typo in the state or LGA instead of saying that only Nigeria is served (`docs/runbooks/shipping-zone-coverage.md`).

Confirm each point against current `main` before designing: the code may have moved.

## Proposal

- **Show the country as fixed "Nigeria"** in the two checkouts and the settings form, instead of a free-text field, with one line under it: "We currently deliver within Nigeria only."
- **Refuse another country on the server with a clear, stable code** on the quote and order routes (standard and campaign), for example 400 `SHIPPING_COUNTRY_NOT_SUPPORTED` with the message "We currently deliver within Nigeria only." The generic `SHIPPING_ADDRESS_NOT_COVERED` stays for a Nigerian address no zone covers. The server stays the authority: the fixed field is a convenience.
- **The list of supported countries is one constant**, not text copied into three places, so a future country is one change. The design review decides where it lives (shared types or API config).
- Saved addresses with another country keep loading (they are not deleted); the customer sees the message when trying to order to them.
- Update `docs/runbooks/shipping-zone-coverage.md` and `docs/pricing-strategy.md`.

Rejected alternatives:

- A country list to choose from: not needed with one country, and it invites foreign addresses.
- Blocking the save of a foreign address: not needed for delivery, and it would break saved addresses.

## Invariants

- No order is created for an address outside the supported countries; nothing is written and no stock is reserved.
- The message for a Nigerian address no zone covers does not change.
- Orders already placed are unchanged.

## Implementation plan

1. Start `codex/ttw-245-say-clearly-that-we-deliver-only-in-nigeria` from current `main`, in its own worktree.
2. Confirm the finding against the current code and in a browser, and update this ticket if it moved.
3. Record the design review below before implementing.
4. Write the tests first and show them failing for the right reason.
5. Implement in small steps: constant, server refusal and code, the three forms. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate`.
7. Run the gates, record exact results below, and obtain the independent review.

## Test and observability plan

- Unit: a non-Nigerian country code is refused with the new code on the standard and campaign quote and order; a Nigerian address no zone covers still answers `SHIPPING_ADDRESS_NOT_COVERED`.
- Integration/e2e: against real Postgres, no order row and no stock reservation after the refusal; a saved foreign address still loads.
- Component: the country is fixed and the note is shown in the three forms.
- Browser journey: a customer with a saved foreign address sees the clear message at checkout (no faked first-party route).
- Logs, metrics, traces, and alerts: the existing refusal warning is reused with a distinct reason; no street, city, name or user id in logs.

## References

- `apps/app/app/dashboard/checkout/page.tsx`, `apps/web/app/fundraiser/[slug]/checkout/page.tsx`, `apps/app/components/customer-settings-form.tsx` — country field.
- `apps/api/src/pricing/pricing.service.ts` — `SHIPPING_ADDRESS_NOT_COVERED`.
- `docs/tickets/ttw-192-offer-state-and-lga-lists-in-settings.md` — "Decision on Country".
- `docs/runbooks/shipping-zone-coverage.md` — admin handover.
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A customer sees that delivery is within Nigeria only, before and after submitting an address.
- [ ] A quote or an order to another country is refused with a clear, stable code and message.
- [ ] A Nigerian address no zone covers still gets the existing message.
- [ ] Swagger, shared contracts and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Delivery to other countries, a country list, international rates → TTW-057 (deferred after v1).
- The places of a zone → TTW-242.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
