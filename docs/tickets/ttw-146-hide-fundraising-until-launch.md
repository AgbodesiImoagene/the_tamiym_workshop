# TTW-146 — Hide fundraising and payouts for launch

**Epic:** 8 — Client review delivery\
**Status:** Scoped (only if the client moves fundraising after launch)\
**Risk:** High\
**Blocked by:** client decision on Q23 and Q25\
**Blocks:** None

## Background

The client is considering moving all fundraising after launch because of open questions (Q23, Q25). If that happens, the launch site must not expose fundraising pages or payouts that are not finished.

Client answers:

- **Q23, Who can become an organiser? On what criteria does the admin approve (ID, registered organisation…)?** Answer: "Hmmm…., seems like we might need an ID verification flow. I’ll talk to the owners about shifting the whole fundraising feature to post-launch, since there are a lot of open questions."
- **Q25, Video and headline on the campaign page (Figma): needed?** Answer: "Again thinking we defer campaigns. Would be nice to have the ability to do basic customisations of the campaign pages, but too involved for V1. In any case headline yes and video optional."

## Proposal

- Do this ticket only if the client moves fundraising after launch, in place of the others in this phase.
- Hide fundraising pages, links and sitemap entries behind a single setting.
- Disable payouts, including the one-off payout (review row 7.8).

## Invariants

- No visitor can reach a fundraiser checkout.
- No payout can be started.

## Implementation plan

1. Start `codex/ttw-146-hide-fundraising-until-launch` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Update Swagger and regenerate contracts with `pnpm openapi:generate` if an endpoint or DTO changed.
7. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Validators: public IA, sitemap and structured data.
- Playwright: fundraising links are gone and routes return not found.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] The launch site shows no fundraising, and the setting brings it back.
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
