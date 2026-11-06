# TTW-117 — Draft and publish the legal texts

**Epic:** 8 — Client review delivery\
**Status:** Scoped\
**Risk:** Standard\
**Blocked by:** client decision on Q19\
**Blocks:** None

## Background

From the client review of 2026-10-21 (`revue-client/Tamiym_Workshop_Review_2026-10-21 Client reply to questions.xlsx`, sheet "Findings"). Confirm each point against current `main` before designing: the code may have moved.

- **Row 11.4, Privacy and Terms pages are placeholders** (High, P0, 2–4 h, status "To do"): Legal text to be supplied by the client; only the integration is development work.

Client answers:

- **Q44, Legal texts (privacy policy, terms, organiser terms, return policy): who writes them? Is a lawyer involved?** Answer: "Draft and I’ll get a lawyer to amend."
- **Q45, NDPA 2023 compliance: NDPC registration, data protection officer, retention periods (7 years for orders), data transfers outside Nigeria (hosting location, OpenAI) accepted?** Answer: "Yes."
- **Q19, Return policy: 7 days after delivery, no "change of mind" returns on customised items. Approved?** Answer: "Reasonable default. Again need to confirm."

An agent can draft these texts, but they are not legal advice: they only ship after the client's lawyer has amended them.

## Proposal

- Draft the privacy policy, terms, organiser terms and return policy for the client's lawyer to amend (Q44).
- Cover data transfers outside Nigeria: hosting in London and Frankfurt, and OpenAI in the United States (Q45), and retention periods.
- Publish them once approved, and add them to the sitemap, which excludes draft pages.

## Invariants

- Behaviour outside this ticket stays unchanged.

## Implementation plan

1. Start `codex/ttw-117-draft-and-publish-legal-texts` from current `main`, in its own worktree.
2. Confirm the finding against the current code, and update this ticket if it moved.
3. Record the design review below before implementing, as `AGENTS.md` requires for this risk level.
4. Write the tests first and show them failing for the right reason.
5. Implement the proposal in small steps. Record any deviation here.
6. Run the gates, record exact results below, and obtain the independent review for this risk level.

## Test and observability plan

- Validators: `pnpm docs:validate`, and the discovery and sitemap validators.
- Playwright: each policy page loads without the placeholder text.
- Logs, metrics, traces, and alerts: nothing new unless the design review asks for it. No tokens, cookies, PII or provider secrets in logs.

## References

- `apps/web/app/policies/privacy/page.tsx:19` — row 11.4
- `AGENTS.md`, `CLAUDE.md` — workflow and technical rules.
- `docs/tickets/ROADMAP.md` — order, batches and open client decisions.

## Acceptance criteria

- [ ] No policy page shows placeholder text.
- [ ] The lawyer's approval is recorded in this ticket.
- [ ] Every visible control works, in English, with theme tokens only. The journey was played end to end, and Playwright coverage is updated.
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
