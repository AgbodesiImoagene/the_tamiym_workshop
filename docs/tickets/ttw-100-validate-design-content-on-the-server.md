# TTW-100 — Validate design content on the server

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** TTW-099\
**Blocks:** TTW-058

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 3.7, Design content not validated; moderation can be bypassed** (Critical, P0, 10–16 h, status "To do"): The server accepts any JSON: external images or another user's images, with no scan or moderation. Moderation only sees the text and a browser-generated thumbnail.

## Proposal

- Validate the saved design JSON against a strict allowlist of object types and fields.
- Accept images only when they are READY media assets owned by the design owner. Refuse external URLs.
- Keep the existing 2 MB limit, and return stable error codes the editor can display.

## Invariants

- A design cannot reference an external image or another user's asset.
- Designs the editor produces today still save.

## Implementation plan

1. Start `codex/ttw-100-validate-design-content-on-the-server` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Unit: valid designs from the editor, external image, foreign asset, unknown object type.
- Integration: create and update refused with the right codes.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/designs/designs.service.ts:95` — row 3.7
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] The bypass described in the review no longer works.
- [ ] Swagger, shared contracts, migrations and docs are updated where applicable.
- [ ] Required quality gates pass, with evidence recorded below.

## Out of scope

- A server-side render for moderators → TTW-143.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.
