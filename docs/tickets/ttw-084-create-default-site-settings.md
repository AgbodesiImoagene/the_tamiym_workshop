# TTW-084 — Create default site settings so VAT is never silently 0%

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 8.6, VAT is 0% until site settings are saved** (Critical, P0, 1–2 h, status "To do"): No default site settings are created: VAT is zero without any warning.

## Proposal

- Create the default `SiteSettings` row in the production seed, with the current Nigerian VAT rate, confirmed in the ticket.
- If the row is missing at quote time, fail clearly instead of pricing at 0% VAT.
- Add the step to the release checklist (`docs/release/controlled-release-checklist.md`).

## Invariants

- A quote never uses a VAT rate nobody set.
- Orders keep their frozen VAT snapshot (TTW-024).

## Implementation plan

1. Start `codex/ttw-084-create-default-site-settings` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: quote with and without the settings row.
- Integration: seed on an empty database, then quote and read the VAT line.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/pricing/pricing.service.ts:362` — row 8.6
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A fresh deployment quotes the configured VAT rate before any admin opens Settings.
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
