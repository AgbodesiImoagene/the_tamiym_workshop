# TTW-094 — Let admins enter size and print-side surcharges

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None\
**Blocks:** TTW-095

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 2.7, Size surcharges and per-side print surcharges cannot be entered** (High, P1, 8–14 h, status "To do"): Pricing applies them, but no route or screen lets admins set them (e.g. XXL +₦500, back print +₦1,000).

## Proposal

- Add admin routes and catalogue screens to write `OptionValueUpcharge` and `ProductViewPricing`.
- Audit the changes like other admin catalogue writes.

## Invariants

- Pricing already reads these values. It must return the same result for existing data.
- Surcharges never apply retroactively to frozen orders.

## Implementation plan

1. Start `codex/ttw-094-let-admins-enter-size-and-print-surcharg` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit and integration: create, update, delete, validation and authorization.
- Playwright: an admin sets XXL +₦500, and the customer quote shows it.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- OptionValueUpcharge / ProductViewPricing never written — row 2.7
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] An admin can set a size surcharge and a back-print surcharge, and quotes reflect them.
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
