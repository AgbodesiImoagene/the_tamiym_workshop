# TTW-128 — Build the organiser approval screen

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** High\
**Blocked by:** client answer Q23; client answer Q33; client decision on Q23 and Q25\
**Blocks:** TTW-129

## Background

> Check first that the client kept fundraising before launch (Q23, Q25). If it moved, this ticket waits.

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 6.1, Nobody can become an organiser** (Blocker, P0, 10–15 h, status "To do"): No screen to approve applications; the workaround via the Team screen also fails (required reason not sent). A temporary fix takes 1 to 2 h.
- **Row 7.7, Minimal KYC** (Medium, P1, 0–0 h, status "Info / decision"): Phone number only required to be filled in (no SMS code), no ID document.

Client answers:

- **Q23, Who can become an organiser? On what criteria does the admin approve (ID, registered organisation…)?** Answer: "Hmmm…., seems like we might need an ID verification flow. I’ll talk to the owners about shifting the whole fundraising feature to post-launch, since there are a lot of open questions."
- **Q33, Organiser KYC: are phone and email enough, or is an ID, BVN or proof of organisation required?** Answer: "TBD. The latter makes more sense but adds complexity."

## Proposal

- Add an admin queue to list, review, approve and reject organiser applications.
- Fix the Team screen workaround, which fails because it does not send the required reason.
- Apply the criteria from Q23 and the KYC level from Q33 once decided.

## Invariants

- A decision changes the role, revokes sessions, audits and notifies exactly once (TTW-030).

## Implementation plan

1. Start `codex/ttw-128-build-organiser-approval-screen` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Playwright: apply as a customer, approve in admin, create a draft campaign.
- Integration: concurrent decisions.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/api/src/organizer/organizer-applications.service.ts:301` — row 6.1
- `apps/admin/lib/dashboard.ts:534` — row 6.1
- `docs/payouts/ttw-042-interim-policy.md` — row 7.7
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] A customer can become an organiser in production.
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
