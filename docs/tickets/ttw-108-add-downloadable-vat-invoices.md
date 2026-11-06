# TTW-108 — Add downloadable VAT invoices

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 4.8, No downloadable invoice or receipt** (Medium, P1, 8–12 h, status "To do"): Figma "Download Invoice" missing.

Client answers:

- **Q15, Invoice or receipt: is a VAT-compliant invoice required (legal mentions, numbering)?** Answer: "Yes."

## Proposal

- Generate an invoice for a paid order from its frozen data, with sequential numbering enforced by the database.
- Add the "Download Invoice" action on the order page.
- The legal name, address and tax number must come from the client: ask before design review.

## Invariants

- An invoice number is unique and never reused.
- An invoice never changes when products or settings change.
- Only the owner and admins can download it.

## Implementation plan

1. Start `codex/ttw-108-add-downloadable-vat-invoices` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Generate the migration with `pnpm --filter api exec prisma migrate dev --name <name>`, after checking that no other open ticket has one in flight.
8. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Integration: numbering under concurrency, owner and foreign user.
- Playwright: download an invoice from a paid order.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- No invoice code — row 4.8
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A customer can download a VAT-compliant invoice for a paid order.
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
