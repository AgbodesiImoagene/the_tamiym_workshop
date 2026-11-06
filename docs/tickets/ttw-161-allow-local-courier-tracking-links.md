# TTW-161 — Allow local courier tracking links

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** None\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 5.10, Tracking links limited to a few carriers** (Low, P2, 1–2 h, status "To do"): DHL, FedEx, UPS, GIG, NIPOST, Ship24: a local courier link will be rejected.

Client answers:

- **Q20, Carriers used (GIG, DHL, local couriers…): is manual tracking-number entry enough? Which tracking sites should be allowed?** Answer: "Likely local couriers but should support future extension and integrations."

## Proposal

- Let admins add allowed tracking domains, or accept any safe HTTPS link, and record the choice in `docs/orders/ttw-040-interim-policy.md`.
- Keep it extensible for later carrier integrations (Q20).

## Invariants

- A tracking link is never a script or a non-HTTPS URL.

## Implementation plan

1. Start `codex/ttw-161-allow-local-courier-tracking-links` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: allowed, new and unsafe links.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `docs/orders/ttw-040-interim-policy.md` — row 5.10
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A local courier's tracking link is accepted.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- Carrier API integration → TTW-044, which stays deferred.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
