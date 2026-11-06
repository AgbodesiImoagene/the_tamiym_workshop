# TTW-087 — Offer Nigerian states and LGAs as lists at checkout

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-086\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 4.9, State typed as free text at checkout** (High, P0, 4–6 h, status "To do"): The 37 states and 774 LGAs are in the database but not offered. A typo can break the shipping calculation (see 5.6).

## Proposal

- Expose the states and LGAs to customers. The `geo` routes in `admin-shipping.controller.ts` are admin-only, so check first whether `addresses.controller.ts` already covers it.
- Replace the free-text state field with a state list and a dependent LGA list on the address form.
- Apply it to the standard checkout and the fundraiser checkout.

## Invariants

- A saved address always carries a state known to the shipping rules.
- Existing saved addresses still load, and ask for a correction if their state is unknown.

## Implementation plan

1. Start `codex/ttw-087-offer-states-and-lgas-at-checkout` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Component: list loading, empty, error and retry states.
- Integration: an unknown state code is refused.
- Playwright: choose a state and LGA, then get a quote.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/app/app/dashboard/checkout/page.tsx:253` — row 4.9
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A customer cannot type a misspelled state at checkout.
- [ ] Lists work on desktop and mobile.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Other rows of the client review: each has its own ticket in `docs/tickets/ROADMAP.md`.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
